import type { NormalizedSeries } from "./normalize";
import type { HrZone, Sample } from "../activity";
import { rollingMean, rollingMedian, type Series } from "@/lib/smoothing";
import { median } from "@/lib/stats";
import { zoneForHeartRate } from "../zones";
import { gradeAdjustedPace } from "../gradeAdjusted";

/**
 * Turns normalised series into the per-second samples widgets read.
 *
 * Smoothing windows are chosen to remove sensor noise while keeping changes a
 * runner would actually notice. They are deliberately modest: an over-smoothed
 * pace series hides the moments this product exists to explain.
 */

/** Speed is averaged over this many seconds before pace is computed. */
const SPEED_SMOOTHING_S = 5;
const PACE_SMOOTHING_S = 15;
/** Elevation is despiked, then averaged, because barometric drift is spiky. */
const ELEVATION_DESPIKE_S = 5;
const ELEVATION_SMOOTHING_S = 15;
/** Gradient needs a minimum horizontal run or it amplifies elevation noise. */
const GRADIENT_MIN_SPAN_M = 30;
const GRADIENT_MAX_PCT = 30;
/** Below this speed a runner is standing still rather than moving slowly. */
const STOP_SPEED_MPS = 0.7;
const MIN_STOP_S = 3;
/** Stops closer together than this are one interruption, not two. */
const STOP_MERGE_GAP_S = 5;

export interface DeriveOptions {
  maxHr?: number;
}

export interface DerivedSeries {
  samples: Sample[];
  movingS: number;
  stoppedS: number;
}

export function derive(
  normalized: NormalizedSeries,
  options: DeriveOptions,
): DerivedSeries {
  const { length, distance } = normalized;

  const speed = deriveSpeed(normalized);
  const smoothedSpeed = rollingMean(speed, SPEED_SMOOTHING_S);
  const paceSpeed = rollingMean(speed, PACE_SMOOTHING_S);

  const elevation = rollingMean(
    rollingMedian(normalized.elevation, ELEVATION_DESPIKE_S),
    ELEVATION_SMOOTHING_S,
  );
  const gradient = deriveGradient(elevation, distance);
  const moving = deriveMoving(smoothedSpeed, normalized);

  const samples = new Array<Sample>(length);
  for (let i = 0; i < length; i++) {
    const isMoving = moving[i];
    const speedHere = smoothedSpeed[i];
    const paceSpeedHere = paceSpeed[i];

    const sample: Sample = {
      t: i,
      distanceM: distance[i],
      moving: isMoving,
    };

    if (normalized.lat[i] !== undefined) sample.lat = normalized.lat[i];
    if (normalized.lon[i] !== undefined) sample.lon = normalized.lon[i];
    if (elevation[i] !== undefined) sample.elevationM = elevation[i];
    if (normalized.elevation[i] !== undefined) sample.rawElevationM = normalized.elevation[i];
    if (speedHere !== undefined) sample.speedMps = speedHere;
    if (gradient[i] !== undefined) sample.gradientPct = gradient[i];
    if (normalized.hr[i] !== undefined) sample.hrBpm = normalized.hr[i];
    if (normalized.cadence[i] !== undefined) sample.cadenceSpm = normalized.cadence[i];
    if (normalized.power[i] !== undefined) sample.powerW = normalized.power[i];

    // Pace while standing still is not a meaningful number, so it stays absent
    // rather than becoming a very large one.
    if (isMoving && paceSpeedHere !== undefined && paceSpeedHere > 0.1) {
      sample.paceSecPerKm = 1000 / paceSpeedHere;
      const adjusted = gradeAdjustedPace(sample.paceSecPerKm, sample.gradientPct);
      if (adjusted !== undefined) sample.gradeAdjustedPaceSecPerKm = adjusted;
    }

    if (sample.hrBpm !== undefined && options.maxHr) {
      sample.hrZone = zoneForHeartRate(sample.hrBpm, options.maxHr) as HrZone;
    }

    samples[i] = sample;
  }

  const movingS = moving.filter(Boolean).length;
  return { samples, movingS, stoppedS: length - movingS };
}

/**
 * Speed from the device where available, otherwise from distance.
 *
 * A centred difference over four seconds is used for the fallback because a
 * one-second difference on GPS distance is dominated by position jitter.
 */
function deriveSpeed(normalized: NormalizedSeries): Series {
  const { length, distance, deviceSpeed } = normalized;
  const deviceCoverage = deviceSpeed.filter((v) => v !== undefined).length / length;
  if (deviceCoverage > 0.8) return deviceSpeed;

  const out: Series = new Array<number | undefined>(length).fill(undefined);
  const half = 2;
  for (let i = 0; i < length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(length - 1, i + half);
    const span = hi - lo;
    if (span <= 0) continue;
    out[i] = Math.max(0, (distance[hi] - distance[lo]) / span);
  }
  return out;
}

/**
 * Gradient as rise over horizontal run, using a window wide enough to be real.
 *
 * The window expands from the current sample until it spans at least 30 metres,
 * which keeps the result stable when a runner is moving slowly.
 */
function deriveGradient(elevation: Series, distance: number[]): Series {
  const length = distance.length;
  const out: Series = new Array<number | undefined>(length).fill(undefined);

  for (let i = 0; i < length; i++) {
    if (elevation[i] === undefined) continue;

    let lo = i;
    let hi = i;
    while (
      distance[hi] - distance[lo] < GRADIENT_MIN_SPAN_M &&
      (lo > 0 || hi < length - 1)
    ) {
      if (lo > 0) lo--;
      if (hi < length - 1) hi++;
    }

    const run = distance[hi] - distance[lo];
    const from = elevation[lo];
    const to = elevation[hi];
    if (run < 1 || from === undefined || to === undefined) continue;

    const percent = ((to - from) / run) * 100;
    out[i] = Math.max(-GRADIENT_MAX_PCT, Math.min(GRADIENT_MAX_PCT, percent));
  }

  return out;
}

/**
 * Whether the runner was moving at each second.
 *
 * Brief dips below the threshold are ignored, and brief resumptions between two
 * stops are absorbed, so a single traffic-light wait reads as one stop.
 */
function deriveMoving(speed: Series, normalized: NormalizedSeries): boolean[] {
  const length = normalized.length;
  const moving = new Array<boolean>(length);

  for (let i = 0; i < length; i++) {
    const value = speed[i];
    const stoppedBySpeed = value === undefined || value < STOP_SPEED_MPS;
    moving[i] = !(stoppedBySpeed || normalized.timerPaused[i] || normalized.recordingGap[i]);
  }

  removeShortRuns(moving, false, MIN_STOP_S);
  removeShortRuns(moving, true, STOP_MERGE_GAP_S);
  return moving;
}

/** Flips runs of `value` shorter than `minLength` to the opposite value. */
function removeShortRuns(flags: boolean[], value: boolean, minLength: number): void {
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    const current = i < flags.length ? flags[i] : !value;
    if (current === value) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) {
      if (i - start < minLength) {
        for (let j = start; j < i; j++) flags[j] = !value;
      }
      start = -1;
    }
  }
}

/**
 * Sections a runner probably walked.
 *
 * There is no way to tell walking from very slow running without cadence, so
 * this is reported as a possibility and never as a fact.
 */
export function detectWalkingCandidates(samples: Sample[]): { start: number; end: number }[] {
  const movingPaces = samples
    .filter((s) => s.moving && s.speedMps !== undefined)
    .map((s) => s.speedMps!);
  if (movingPaces.length < 60) return [];

  const medianSpeed = median(movingPaces);
  const threshold = medianSpeed * 0.55;
  const MIN_WALK_S = 20;
  /**
   * Every run starts from standing and ends by stopping. Those seconds are
   * always below threshold and are not a walking break, so they are excluded.
   */
  const EDGE_EXCLUSION_S = 45;

  const sections: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i <= samples.length; i++) {
    if (i < EDGE_EXCLUSION_S || i > samples.length - EDGE_EXCLUSION_S) {
      if (start >= 0 && i - start >= MIN_WALK_S) sections.push({ start, end: i - 1 });
      start = -1;
      continue;
    }
    const sample = samples[i];
    const slow =
      sample !== undefined &&
      sample.moving &&
      sample.speedMps !== undefined &&
      sample.speedMps < threshold;
    if (slow) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) {
      if (i - start >= MIN_WALK_S) sections.push({ start, end: i - 1 });
      start = -1;
    }
  }
  return sections;
}
