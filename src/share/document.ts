/**
 * What a shared run actually contains.
 *
 * The guiding decision is that a share carries **the recording, not the
 * conclusions** — the same choice the run library makes, and for the same
 * reason (see `library/db.ts`). A share holds the sample series as the watch
 * recorded it, and the page that opens it runs the ordinary pipeline over it.
 *
 * That costs a second of work on open and buys three things. The payload is a
 * fraction of the size, because a `DerivedActivity` carries splits, events,
 * moments and a summary that are all recomputable. A link shared today still
 * reads correctly next year, and reads with next year's analysis rather than a
 * frozen copy of today's. And there is exactly one code path from samples to a
 * page, so a shared run cannot drift into rendering differently from the same
 * run opened off disk.
 *
 * Everything the runner added by hand travels too — their own events, and the
 * weather if they looked it up. An event log is most of why a run is worth
 * showing somebody: "this is where the gel went in, and this is what happened
 * to my pace afterwards" is the whole point.
 *
 * ## What is deliberately not here
 *
 * No identity, no account, no device serial, nothing about the browser that
 * made it. A share is a run and the things the runner attached to it. The
 * original file is not included either — a FIT file carries fields this app
 * never reads, and forwarding bytes nobody has looked at is not something to
 * do on a runner's behalf.
 */

import type { RawActivity, RawSample } from "@/parsers/types";
import type { RunAnnotation } from "@/model/annotations";
import { sanitizeAnnotations } from "@/model/annotations";
import type { RunWeather } from "@/model/weather";
import { decodeSamples, encodeSamples, type EncodedSamples } from "./codec";

/** Bumped only when an older build could no longer read a newer document. */
export const SHARE_VERSION = 1;

/**
 * What the runner chose to include of where they were.
 *
 * A GPS trace is the most revealing thing in an activity file: a run that
 * starts and ends at a front door says which front door. So the choice is put
 * to the runner every time, and whatever they pick is recorded here — the page
 * that opens the share says which of the three it is looking at, because a
 * trimmed route drawn without comment is a map quietly telling a lie about
 * where the run went.
 */
export type RouteChoice = "full" | "trimmed" | "none";

/** Cut from each end when the route is trimmed. About two street lengths. */
export const TRIM_METRES = 250;

export interface ShareChoices {
  route: RouteChoice;
  /** Metres removed from each end, present only when `route` is "trimmed". */
  trimM?: number;
  /** Whether the runner's own events were included. */
  events: boolean;
  /** Whether the looked-up conditions were included. */
  weather: boolean;
}

export interface ShareDocument {
  version: number;
  /** When the share was made, not when the run was. */
  createdAt: string;
  choices: ShareChoices;
  run: {
    source: "fit" | "gpx";
    name?: string;
    sport?: string;
    /** ISO; `RawActivity.startedAt` is a Date and JSON has no such thing. */
    startedAt: string;
    samples: EncodedSamples;
    timerEvents: { timeMs: number; kind: "start" | "stop" }[];
    laps: { startMs: number; totalTimerS?: number; totalDistanceM?: number }[];
    session?: RawActivity["session"];
    warnings: string[];
  };
  annotations: RunAnnotation[];
  weather?: RunWeather;
  /**
   * The maximum heart rate the sharer's zones were built from.
   *
   * Carried so a shared run shows the zones the runner saw rather than the
   * reader's own — the bands are a fact about the person who ran it. The page
   * says whose figure it is using and that it was theirs.
   */
  maxHr?: number;
}

/** Strips position from the samples according to what the runner chose. */
function applyRouteChoice(
  samples: RawSample[],
  choice: RouteChoice,
  trimM: number,
): RawSample[] {
  if (choice === "full") return samples;

  const withoutPosition = ({ lat: _lat, lon: _lon, ...rest }: RawSample): RawSample => rest;
  if (choice === "none") return samples.map(withoutPosition);

  // Trimmed. The ends are measured in distance rather than in time, because a
  // run that began with two minutes of standing in a doorway would otherwise
  // have its doorway trimmed by a handful of metres.
  const total = lastDistance(samples);
  if (total === undefined) return samples.map(withoutPosition);

  return samples.map((sample) => {
    const covered = sample.distanceM;
    // A sample with no distance reading cannot be placed relative to the ends,
    // so it is treated as if it were at one — withheld rather than guessed.
    if (covered === undefined) return withoutPosition(sample);
    if (covered <= trimM || covered >= total - trimM) return withoutPosition(sample);
    return sample;
  });
}

function lastDistance(samples: RawSample[]): number | undefined {
  for (let i = samples.length - 1; i >= 0; i--) {
    const covered = samples[i].distanceM;
    if (covered !== undefined) return covered;
  }
  return undefined;
}

export interface BuildShareOptions {
  route: RouteChoice;
  /** Include the runner's own events. */
  events: boolean;
  /** Include the looked-up conditions. */
  weather: boolean;
  maxHr?: number;
}

/**
 * Assembles the document from what is on screen.
 *
 * Takes the raw parse rather than the derived model, for the reasons at the top
 * of this file. The annotations and the weather come from the derived one,
 * because that is where both are attached after the fact.
 */
export function buildShareDocument(
  raw: RawActivity,
  extras: { annotations?: RunAnnotation[]; weather?: RunWeather },
  options: BuildShareOptions,
): ShareDocument {
  const samples = applyRouteChoice(raw.samples, options.route, TRIM_METRES);
  const annotations = options.events ? (extras.annotations ?? []) : [];
  const includeWeather = options.weather && extras.weather !== undefined;

  const document: ShareDocument = {
    version: SHARE_VERSION,
    createdAt: new Date().toISOString(),
    choices: {
      route: options.route,
      ...(options.route === "trimmed" ? { trimM: TRIM_METRES } : {}),
      events: annotations.length > 0,
      weather: includeWeather,
    },
    run: {
      source: raw.source,
      ...(raw.name ? { name: raw.name } : {}),
      ...(raw.sport ? { sport: raw.sport } : {}),
      startedAt: raw.startedAt.toISOString(),
      samples: encodeSamples(samples),
      timerEvents: raw.timerEvents.map((event) => ({
        timeMs: event.time.getTime(),
        kind: event.kind,
      })),
      laps: raw.laps.map((lap) => ({
        startMs: lap.startTime.getTime(),
        ...(lap.totalTimerS !== undefined ? { totalTimerS: lap.totalTimerS } : {}),
        ...(lap.totalDistanceM !== undefined
          ? { totalDistanceM: lap.totalDistanceM }
          : {}),
      })),
      ...(raw.session ? { session: raw.session } : {}),
      warnings: raw.warnings,
    },
    annotations,
    ...(includeWeather ? { weather: extras.weather } : {}),
    ...(options.maxHr !== undefined ? { maxHr: options.maxHr } : {}),
  };

  return document;
}

/** A finite number, or undefined for anything else. Storage is not trusted. */
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Conditions out of a share, with every field checked.
 *
 * The weather comes back as numbers a card will divide by and draw with, and
 * this one arrived over the network rather than from the provider — so the
 * whole object is refused unless the two fields every card depends on are
 * really numbers, and each optional field is dropped individually otherwise.
 */
function readWeather(value: unknown): RunWeather | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;

  const temperatureC = num(raw.temperatureC);
  const requestedLat = num(raw.requestedLat);
  const requestedLon = num(raw.requestedLon);
  if (temperatureC === undefined || requestedLat === undefined || requestedLon === undefined) {
    return undefined;
  }

  const hours = Array.isArray(raw.hours)
    ? raw.hours.flatMap((entry): RunWeather["hours"] => {
        if (typeof entry !== "object" || entry === null) return [];
        const hour = entry as Record<string, unknown>;
        const temp = num(hour.temperatureC);
        if (typeof hour.timeIso !== "string" || temp === undefined) return [];
        return [
          {
            timeIso: hour.timeIso,
            temperatureC: temp,
            apparentTemperatureC: num(hour.apparentTemperatureC),
            humidityPct: num(hour.humidityPct),
            windSpeedKmh: num(hour.windSpeedKmh),
            windFromDegrees: num(hour.windFromDegrees),
            precipitationMm: num(hour.precipitationMm),
          },
        ];
      })
    : [];

  return {
    hours,
    temperatureC,
    apparentTemperatureC: num(raw.apparentTemperatureC),
    humidityPct: num(raw.humidityPct),
    windSpeedKmh: num(raw.windSpeedKmh),
    windFromDegrees: num(raw.windFromDegrees),
    precipitationMm: num(raw.precipitationMm),
    requestedLat,
    requestedLon,
    gridLat: num(raw.gridLat),
    gridLon: num(raw.gridLon),
    gridDistanceM: num(raw.gridDistanceM),
    provider: typeof raw.provider === "string" ? raw.provider : "unknown",
  };
}

function readRouteChoice(value: unknown): RouteChoice {
  return value === "trimmed" || value === "none" ? value : "full";
}

export interface SharedRun {
  raw: RawActivity;
  annotations: RunAnnotation[];
  weather?: RunWeather;
  maxHr?: number;
  choices: ShareChoices;
}

/**
 * Reads a document back, or returns null.
 *
 * Everything here came off the network and through a decryption that only
 * proves the payload is the one the sharer sealed — not that the sharer's build
 * agreed with this one about what a document looks like. So this validates
 * rather than casts, and refuses the whole share when the run itself is
 * unreadable. The optional parts are treated differently: a corrupt weather
 * block costs the weather cards and nothing else, because losing the run over
 * it would be the worse failure.
 */
export function readShareDocument(value: unknown): SharedRun | null {
  if (typeof value !== "object" || value === null) return null;
  const document = value as Partial<ShareDocument>;

  // A newer major version may have moved things this build reads. Rather than
  // guess, say so — the caller turns this into "made by a newer version".
  if (typeof document.version !== "number" || document.version > SHARE_VERSION) {
    return null;
  }

  const run = document.run;
  if (typeof run !== "object" || run === null) return null;
  if (run.source !== "fit" && run.source !== "gpx") return null;

  const startedAt = new Date(String(run.startedAt));
  if (Number.isNaN(startedAt.getTime())) return null;

  const samples = decodeSamples(run.samples);
  // A run with no samples has nothing any card could draw. That is a broken
  // share rather than an empty one.
  if (samples.length === 0) return null;

  const raw: RawActivity = {
    source: run.source,
    ...(typeof run.name === "string" ? { name: run.name } : {}),
    ...(typeof run.sport === "string" ? { sport: run.sport } : {}),
    startedAt,
    samples,
    timerEvents: Array.isArray(run.timerEvents)
      ? run.timerEvents.flatMap((event) => {
          const at = num(event?.timeMs);
          if (at === undefined) return [];
          if (event.kind !== "start" && event.kind !== "stop") return [];
          return [{ time: new Date(at), kind: event.kind }];
        })
      : [],
    laps: Array.isArray(run.laps)
      ? run.laps.flatMap((lap) => {
          const at = num(lap?.startMs);
          if (at === undefined) return [];
          return [
            {
              startTime: new Date(at),
              totalTimerS: num(lap.totalTimerS),
              totalDistanceM: num(lap.totalDistanceM),
            },
          ];
        })
      : [],
    ...(typeof run.session === "object" && run.session !== null
      ? { session: run.session }
      : {}),
    warnings: Array.isArray(run.warnings)
      ? run.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
  };

  const choices = document.choices;
  const route = readRouteChoice(choices?.route);

  return {
    raw,
    // The same reader the browser's own storage goes through: a shared event
    // of a kind this build has never heard of is dropped, not rendered blank.
    annotations: sanitizeAnnotations(document.annotations),
    weather: readWeather(document.weather),
    maxHr: num(document.maxHr),
    choices: {
      route,
      ...(route === "trimmed" ? { trimM: num(choices?.trimM) ?? TRIM_METRES } : {}),
      events: choices?.events === true,
      weather: choices?.weather === true,
    },
  };
}
