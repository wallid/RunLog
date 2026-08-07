import type { RawActivity, RawSample } from "@/parsers/types";
import { cumulativeDistance } from "@/lib/geo";
import { interpolateGaps, type Series } from "@/lib/smoothing";

/**
 * Places recorded samples on a uniform one-second grid.
 *
 * Devices record irregularly: this file writes position every second but heart
 * rate only every five, and distance every two or three. Putting everything on
 * a common grid is what lets later stages compare metrics at the same instant
 * without every widget re-implementing alignment.
 */

export interface NormalizedSeries {
  /** Elapsed seconds, 0..n-1. */
  length: number;
  startedAt: Date;
  lat: Series;
  lon: Series;
  elevation: Series;
  distance: number[];
  deviceSpeed: Series;
  hr: Series;
  cadence: Series;
  power: Series;
  /** Seconds where the device timer was paused. */
  timerPaused: boolean[];
  /** Seconds with no recorded sample nearby — a genuine recording gap. */
  recordingGap: boolean[];
  warnings: string[];
}

/** Gaps up to this many seconds are filled by interpolation. */
const MAX_INTERPOLATION_GAP_S = 15;
/** Recording gaps longer than this count as an interruption, not a slow sample rate. */
const RECORDING_GAP_S = 20;

export function normalize(raw: RawActivity): NormalizedSeries {
  const warnings = [...raw.warnings];
  const startMs = raw.samples[0].time.getTime();
  const endMs = raw.samples[raw.samples.length - 1].time.getTime();
  const length = Math.max(1, Math.round((endMs - startMs) / 1000) + 1);

  const lat: Series = new Array(length).fill(undefined);
  const lon: Series = new Array(length).fill(undefined);
  const elevation: Series = new Array(length).fill(undefined);
  const deviceDistance: Series = new Array(length).fill(undefined);
  const deviceSpeed: Series = new Array(length).fill(undefined);
  const hr: Series = new Array(length).fill(undefined);
  const cadence: Series = new Array(length).fill(undefined);
  const power: Series = new Array(length).fill(undefined);
  const hasSample = new Array<boolean>(length).fill(false);

  for (const sample of raw.samples) {
    const index = Math.round((sample.time.getTime() - startMs) / 1000);
    if (index < 0 || index >= length) continue;
    hasSample[index] = true;
    assignIfPresent(lat, index, sample.lat);
    assignIfPresent(lon, index, sample.lon);
    assignIfPresent(elevation, index, sample.elevationM);
    assignIfPresent(deviceDistance, index, sample.distanceM);
    assignIfPresent(deviceSpeed, index, sample.speedMps);
    assignIfPresent(hr, index, sample.hrBpm);
    assignIfPresent(cadence, index, sample.cadenceSpm);
    assignIfPresent(power, index, sample.powerW);
  }

  const recordingGap = findRecordingGaps(hasSample);
  const gapSeconds = recordingGap.filter(Boolean).length;
  if (gapSeconds > 0) {
    warnings.push(
      `The recording has ${gapSeconds} seconds with no data. Those sections are treated as stopped.`,
    );
  }

  const distance = buildDistance(deviceDistance, lat, lon, length, warnings);

  return {
    length,
    startedAt: raw.samples[0].time,
    lat: interpolateGaps(lat, MAX_INTERPOLATION_GAP_S),
    lon: interpolateGaps(lon, MAX_INTERPOLATION_GAP_S),
    elevation: interpolateGaps(elevation, MAX_INTERPOLATION_GAP_S),
    distance,
    deviceSpeed: interpolateGaps(deviceSpeed, MAX_INTERPOLATION_GAP_S),
    hr: interpolateGaps(hr, MAX_INTERPOLATION_GAP_S),
    cadence: interpolateGaps(cadence, MAX_INTERPOLATION_GAP_S),
    power: interpolateGaps(power, MAX_INTERPOLATION_GAP_S),
    timerPaused: buildTimerPauses(raw, startMs, length),
    recordingGap,
    warnings,
  };
}

function assignIfPresent(series: Series, index: number, value: number | undefined): void {
  if (value !== undefined && Number.isFinite(value)) series[index] = value;
}

/**
 * Cumulative distance, preferring the device's own figure.
 *
 * A watch filters GPS noise before reporting distance, so its value is more
 * accurate than summing raw hops. GPX files carry no distance at all, so those
 * fall back to great-circle accumulation.
 */
function buildDistance(
  deviceDistance: Series,
  lat: Series,
  lon: Series,
  length: number,
  warnings: string[],
): number[] {
  const known = deviceDistance.filter((v) => v !== undefined).length;

  if (known >= 2) {
    const filled = interpolateGaps(deviceDistance, MAX_INTERPOLATION_GAP_S);
    const out = new Array<number>(length).fill(0);
    let last = filled[0] ?? 0;
    for (let i = 0; i < length; i++) {
      const value = filled[i];
      // Distance can never decrease; treat any dip as a bad reading.
      if (value !== undefined && value >= last) last = value;
      out[i] = last;
    }
    // Normalise so the run starts at zero.
    const offset = out[0];
    return offset === 0 ? out : out.map((v) => v - offset);
  }

  const points = new Array<{ lat: number; lon: number } | undefined>(length);
  for (let i = 0; i < length; i++) {
    const a = lat[i];
    const b = lon[i];
    points[i] = a !== undefined && b !== undefined ? { lat: a, lon: b } : undefined;
  }
  const derived = cumulativeDistance(points);
  if (derived[derived.length - 1] === 0) {
    warnings.push("This file has no distance and no usable GPS track.");
  }
  return derived;
}

/** Marks seconds a device reported as paused, from its timer start/stop events. */
function buildTimerPauses(raw: RawActivity, startMs: number, length: number): boolean[] {
  const paused = new Array<boolean>(length).fill(false);
  if (raw.timerEvents.length === 0) return paused;

  let pauseStart: number | undefined;
  for (const event of raw.timerEvents) {
    const index = Math.round((event.time.getTime() - startMs) / 1000);
    if (event.kind === "stop") {
      pauseStart = index;
    } else if (pauseStart !== undefined) {
      for (let i = Math.max(0, pauseStart); i < Math.min(length, index); i++) {
        paused[i] = true;
      }
      pauseStart = undefined;
    }
  }
  // A trailing stop with no matching start closes at the end of the recording.
  if (pauseStart !== undefined) {
    for (let i = Math.max(0, pauseStart); i < length; i++) paused[i] = true;
  }
  return paused;
}

function findRecordingGaps(hasSample: boolean[]): boolean[] {
  const gaps = new Array<boolean>(hasSample.length).fill(false);
  let runStart = -1;
  for (let i = 0; i <= hasSample.length; i++) {
    const present = i < hasSample.length ? hasSample[i] : true;
    if (!present) {
      if (runStart < 0) runStart = i;
      continue;
    }
    if (runStart >= 0) {
      const runLength = i - runStart;
      if (runLength >= RECORDING_GAP_S) {
        for (let j = runStart; j < i; j++) gaps[j] = true;
      }
      runStart = -1;
    }
  }
  return gaps;
}

/** True when the raw file carried at least one usable value for a metric. */
export function hasAny(series: Series): boolean {
  return series.some((v) => v !== undefined);
}

export function rawSampleCount(raw: RawActivity): number {
  return raw.samples.length;
}

export type { RawSample };
