/**
 * The sample series, small enough to send.
 *
 * A run is a row per second, and a row per second written as JSON objects is
 * mostly punctuation: `{"time":…,"lat":…,"lon":…}` repeated fifteen thousand
 * times for a marathon. This turns the rows into columns — one array per
 * channel, all the same length — which costs nothing in fidelity and a great
 * deal less in bytes, because a column of heart rates compresses like a column
 * of heart rates rather than like a column of field names.
 *
 * Three things are doing the work:
 *
 * - **Columns, not rows.** The field name is written once per run instead of
 *   once per second.
 * - **Fixed-point integers.** Every channel is stored at a stated precision
 *   and as a whole number, so `51.5074123` travels as `5150741` rather than as
 *   nine characters of decimal expansion. The precisions below are all finer
 *   than the instrument that produced the reading.
 * - **Deltas on the monotonic channels.** Time and distance only ever go up,
 *   so consecutive differences are small numbers that repeat, which is the
 *   shape gzip is best at.
 *
 * A channel the device never recorded is absent rather than a column of nulls.
 * A channel it recorded intermittently is present with nulls in the gaps —
 * missing is missing, and is never filled in with a zero that would later read
 * as a heart rate of nothing.
 */

import type { RawSample } from "@/parsers/types";

/**
 * Decimal places kept per channel, as powers of ten.
 *
 * Each is at or below the resolution of the thing that measured it: five
 * decimal places of latitude is about a metre, which is finer than any consumer
 * GPS fix; elevation to a tenth of a metre is finer than a barometer's drift.
 * Nothing here is a lossy compromise the reader would notice — but it is
 * rounding, and a run that makes the round trip is equal to the original at
 * these precisions rather than identical to it.
 */
const SCALE = {
  lat: 1e5,
  lon: 1e5,
  elevationM: 1e1,
  distanceM: 1e1,
  speedMps: 1e3,
  hrBpm: 1,
  cadenceSpm: 1,
  powerW: 1,
} as const;

type Channel = keyof typeof SCALE;

/** The channels that only ever increase, and so are stored as differences. */
const DELTA_CHANNELS: ReadonlySet<Channel> = new Set(["distanceM"]);

const CHANNELS = Object.keys(SCALE) as Channel[];

/**
 * A gap in a column.
 *
 * `null` rather than a sentinel number: there is no value a heart rate cannot
 * take that would survive being read back by something that had forgotten the
 * convention.
 */
type Cell = number | null;

export interface EncodedSamples {
  /** Epoch milliseconds of the first sample; every offset is measured from it. */
  startMs: number;
  /**
   * Seconds from `startMs` to each sample, stored as differences between
   * consecutive samples. A watch recording once a second makes this a run of
   * ones, which costs almost nothing once compressed.
   */
  dt: number[];
  /**
   * One entry per channel the device actually recorded. Each array is the same
   * length as `dt`. Channels it never recorded are simply not here.
   */
  columns: Partial<Record<Channel, Cell[]>>;
}

/** Rounds to a channel's stated precision, keeping missing as missing. */
function scaled(value: number | undefined, factor: number): Cell {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * factor);
}

/** Consecutive differences, with gaps carried through untouched. */
function toDeltas(column: Cell[]): Cell[] {
  const out: Cell[] = [];
  let previous = 0;
  for (const cell of column) {
    if (cell === null) {
      out.push(null);
      continue;
    }
    out.push(cell - previous);
    previous = cell;
  }
  return out;
}

/** The inverse of `toDeltas`. */
function fromDeltas(column: Cell[]): Cell[] {
  const out: Cell[] = [];
  let running = 0;
  for (const cell of column) {
    if (cell === null) {
      out.push(null);
      continue;
    }
    running += cell;
    out.push(running);
  }
  return out;
}

export function encodeSamples(samples: RawSample[]): EncodedSamples {
  if (samples.length === 0) return { startMs: 0, dt: [], columns: {} };

  const startMs = samples[0].time.getTime();

  // Absolute seconds first, then differenced in one pass at the end, so the
  // rounding happens against the run's own start rather than accumulating
  // through the deltas.
  const seconds = samples.map((sample) =>
    Math.round((sample.time.getTime() - startMs) / 1000),
  );
  const dt = toDeltas(seconds) as number[];

  const columns: Partial<Record<Channel, Cell[]>> = {};
  for (const channel of CHANNELS) {
    const factor = SCALE[channel];
    const column = samples.map((sample) => scaled(sample[channel], factor));
    // A channel with nothing in it at all is left out entirely rather than
    // sent as a column of nulls the reader would have to skip.
    if (column.every((cell) => cell === null)) continue;
    columns[channel] = DELTA_CHANNELS.has(channel) ? toDeltas(column) : column;
  }

  return { startMs, dt, columns };
}

/** Whether a value could be a column: an array of finite numbers and nulls. */
function isColumn(value: unknown, length: number): value is Cell[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  return value.every(
    (cell) => cell === null || (typeof cell === "number" && Number.isFinite(cell)),
  );
}

/**
 * Reads a column layout back into samples.
 *
 * Everything here is untrusted: it arrived over the network, from a link
 * anybody could have edited. So the shape is checked rather than assumed, and
 * anything that does not hold up produces an empty series — which the caller
 * turns into "this share could not be read" — rather than a half-built run that
 * would render as a real one.
 */
export function decodeSamples(value: unknown): RawSample[] {
  if (typeof value !== "object" || value === null) return [];
  const { startMs, dt, columns } = value as Partial<EncodedSamples>;

  if (typeof startMs !== "number" || !Number.isFinite(startMs)) return [];
  if (!Array.isArray(dt) || !dt.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return [];
  }
  if (typeof columns !== "object" || columns === null) return [];

  const seconds = fromDeltas(dt) as number[];
  const samples: RawSample[] = seconds.map((offset) => ({
    time: new Date(startMs + offset * 1000),
  }));

  for (const channel of CHANNELS) {
    const raw = (columns as Record<string, unknown>)[channel];
    if (raw === undefined) continue;
    if (!isColumn(raw, samples.length)) continue;

    const column = DELTA_CHANNELS.has(channel) ? fromDeltas(raw) : raw;
    const factor = SCALE[channel];
    for (let i = 0; i < samples.length; i++) {
      const cell = column[i];
      if (cell === null) continue;
      samples[i][channel] = cell / factor;
    }
  }

  return samples;
}
