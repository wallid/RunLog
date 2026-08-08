import type { RunWeather } from "./weather";

/**
 * The source-independent activity model.
 *
 * Every parser produces a `RawActivity`; the pipeline turns that into a
 * `DerivedActivity` on a uniform one-sample-per-second grid. Widgets only ever
 * read `DerivedActivity`, never a file format.
 */

export type MetricType =
  | "time"
  | "distance"
  | "position"
  | "elevation"
  | "gradient"
  | "speed"
  | "pace"
  | "heartRate"
  | "hrZone"
  | "cadence"
  | "power"
  | "moving";

export type Confidence = "high" | "medium" | "low";

export type HrZone = 1 | 2 | 3 | 4 | 5;

/** One second of the activity. Missing metrics are `undefined`, never zero. */
export interface Sample {
  /** Elapsed seconds since the start of the activity. */
  t: number;
  /** Cumulative distance in metres. */
  distanceM: number;
  lat?: number;
  lon?: number;
  /** Smoothed elevation in metres. */
  elevationM?: number;
  rawElevationM?: number;
  /** Smoothed speed in metres per second. */
  speedMps?: number;
  /** Derived from smoothed speed; undefined while stopped. */
  paceSecPerKm?: number;
  /**
   * Pace with the gradient taken out — the level pace of equal metabolic cost.
   *
   * Present only where both a pace and a gradient are, which means it is absent
   * while stopped and on any run recorded without elevation.
   */
  gradeAdjustedPaceSecPerKm?: number;
  gradientPct?: number;
  hrBpm?: number;
  hrZone?: HrZone;
  cadenceSpm?: number;
  powerW?: number;
  moving: boolean;
}

export type ActivityEventType =
  | "climb"
  | "descent"
  | "stop"
  | "walk"
  | "fastStart"
  | "strongFinish"
  | "surge"
  | "slowdown"
  | "hrRecovery"
  | "cadenceDrop"
  | "cadenceRecovery"
  | "bestEffort";

/** A detected region of the run. Positions are stored in both time and distance. */
export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  startT: number;
  endT: number;
  startDistanceM: number;
  endDistanceM: number;
  confidence: Confidence;
  /** Event-specific numbers, e.g. `{ elevationGainM: 34, paceDeltaSecPerKm: 28 }`. */
  metrics: Record<string, number>;
  label: string;
}

export interface Split {
  /** 1-based kilometre number. */
  index: number;
  startT: number;
  endT: number;
  startDistanceM: number;
  endDistanceM: number;
  /** 1000 for full splits, less for the final partial split. */
  distanceM: number;
  durationS: number;
  paceSecPerKm: number;
  /**
   * The same split's pace with its gradient taken out.
   *
   * Absent when the split has too little gradient coverage to adjust honestly,
   * so a run without elevation simply has none of these.
   */
  gradeAdjustedPaceSecPerKm?: number;
  avgHr?: number;
  dominantZone?: HrZone;
  avgPowerW?: number;
  avgCadenceSpm?: number;
  gainM: number;
  lossM: number;
  avgGradientPct: number;
  stoppedS: number;
  /** Ids of events overlapping this split. */
  eventIds: string[];
  tags: SplitTag[];
}

export type SplitTag =
  | "fastest"
  | "slowest"
  | "climb"
  | "descent"
  | "recovery"
  | "stop"
  | "finish"
  | "partial";

/** A ranked narrative moment. Points at an event where one exists. */
export interface StoryMoment {
  id: string;
  order: number;
  label: string;
  /** Factual one-line description of the moment. */
  description: string;
  startT: number;
  endT: number;
  startDistanceM: number;
  endDistanceM: number;
  eventId?: string;
  confidence: Confidence;
  /** Internal ranking score; higher means more salient. */
  salience: number;
}

export interface DriftResult {
  firstHalfHr: number;
  secondHalfHr: number;
  firstHalfPace: number;
  secondHalfPace: number;
  /** Percent change in heart rate between halves. */
  driftPct: number;
  pacePct: number;
  confidence: Confidence;
  /** Why the confidence is not high, when it is not. */
  caveat?: string;
}

export interface ConsistencyResult {
  medianPace: number;
  /** Half-width of the band, in seconds per kilometre. */
  bandSecPerKm: number;
  withinBandFraction: number;
  intervals: { t: number; distanceM: number; paceSecPerKm: number; within: boolean }[];
  surgeCount: number;
  slowdownCount: number;
  stdevSecPerKm: number;
}

export type GradientCategory = "downhill" | "flat" | "uphill";

export interface GradientBucket {
  category: GradientCategory;
  distanceM: number;
  timeS: number;
  avgPaceSecPerKm?: number;
  avgHr?: number;
  avgPowerW?: number;
  avgCadenceSpm?: number;
}

/**
 * How much flat ground a stretch of tilted ground was worth.
 *
 * Computed by `gradeAdjustmentOver` in `model/gradeAdjusted.ts`, which is also
 * where the model behind it and its limits are set out. Kept as a factor and a
 * pair of distances rather than an adjusted pace, so each holder can apply it
 * to the pace it already reports.
 */
export interface GradeAdjustment {
  /** Flat-equivalent metres per metre actually covered. 1 on level ground. */
  factor: number;
  actualDistanceM: number;
  flatEquivalentDistanceM: number;
  /** The share of the distance whose gradient was known. */
  coverage: number;
}

export interface BestEffort {
  id: string;
  /** e.g. "Fastest 1 km", "Fastest 60 seconds". */
  label: string;
  kind: "time" | "distance";
  /** Window size: seconds for `time`, metres for `distance`. */
  window: number;
  startT: number;
  endT: number;
  startDistanceM: number;
  endDistanceM: number;
  paceSecPerKm: number;
  avgHr?: number;
  avgPowerW?: number;
  avgGradientPct: number;
}

export interface ActivitySummary {
  avgPaceSecPerKm: number;
  movingPaceSecPerKm: number;
  medianMovingPaceSecPerKm: number;
  paceStdevSecPerKm: number;
  avgHr?: number;
  maxHr?: number;
  minHr?: number;
  avgPowerW?: number;
  maxPowerW?: number;
  avgCadenceSpm?: number;
  gainM: number;
  lossM: number;
  minElevationM?: number;
  maxElevationM?: number;
  /** Seconds spent in each heart-rate zone. */
  zoneTime: Record<HrZone, number>;
  gradientBuckets: GradientBucket[];
  /** What the whole run's ground was worth in flat ground. */
  gradeAdjustment?: GradeAdjustment;
  drift?: DriftResult;
  consistency?: ConsistencyResult;
  bestEfforts: BestEffort[];
  stopCount: number;
  stoppedS: number;
}

export interface DerivedActivity {
  id: string;
  source: "fit" | "gpx";
  name?: string;
  sport?: string;
  startedAt: Date;
  distanceM: number;
  elapsedS: number;
  movingS: number;
  calories?: number;
  /** Uniform 1 Hz grid, index equals elapsed seconds. */
  samples: Sample[];
  splits: Split[];
  events: ActivityEvent[];
  moments: StoryMoment[];
  availableMetrics: Set<MetricType>;
  summary: ActivitySummary;
  /** Heart-rate maximum used to compute zones, so widgets can caveat correctly. */
  maxHrUsed?: number;
  maxHrIsEstimated: boolean;
  /**
   * Conditions near the run, when the runner asked for them to be looked up.
   *
   * Attached after the fact rather than built by the pipeline, because it comes
   * from a network request the runner has to opt into. Absent is the normal
   * case, and every card that reads it must work without it.
   */
  weather?: RunWeather;
  /** Non-fatal problems found while parsing, surfaced in the UI. */
  warnings: string[];
}

/** Finds the sample at or immediately before an elapsed time. */
export function sampleAt(activity: DerivedActivity, t: number): Sample | undefined {
  const { samples } = activity;
  if (samples.length === 0) return undefined;
  const idx = Math.round(t - samples[0].t);
  if (idx < 0) return samples[0];
  if (idx >= samples.length) return samples[samples.length - 1];
  return samples[idx];
}

/** Elapsed time at which the run first reached a given distance. */
export function timeAtDistance(activity: DerivedActivity, distanceM: number): number {
  const { samples } = activity;
  if (samples.length === 0) return 0;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].distanceM < distanceM) lo = mid + 1;
    else hi = mid;
  }
  const after = samples[lo];
  const before = samples[Math.max(0, lo - 1)];
  if (after.distanceM === before.distanceM) return after.t;
  const ratio = (distanceM - before.distanceM) / (after.distanceM - before.distanceM);
  return before.t + (after.t - before.t) * ratio;
}

export function distanceAtTime(activity: DerivedActivity, t: number): number {
  return sampleAt(activity, t)?.distanceM ?? 0;
}

/** Samples within an inclusive elapsed-time range. */
export function samplesBetween(
  activity: DerivedActivity,
  startT: number,
  endT: number,
): Sample[] {
  const first = Math.max(0, Math.round(startT - activity.samples[0].t));
  const last = Math.min(activity.samples.length - 1, Math.round(endT - activity.samples[0].t));
  if (last < first) return [];
  return activity.samples.slice(first, last + 1);
}
