import type { RawActivity } from "@/parsers/types";
import type {
  ActivityEvent,
  ActivitySummary,
  DerivedActivity,
  GradientBucket,
  GradientCategory,
  HrZone,
  MetricType,
  Sample,
  Split,
} from "../activity";
import { estimateMaxHr } from "../zones";
import { gradeAdjustmentOver } from "../gradeAdjusted";
import { normalize } from "./normalize";
import { derive } from "./derive";
import { computeSplits } from "./splits";
import { detectClimbs } from "./events/terrain";
import { detectStops, detectWalking } from "./events/stops";
import { detectFastStart, detectStrongFinish } from "./events/pacing";
import { computeDrift, detectHrRecovery } from "./events/heart";
import { detectCadenceDrops, detectCadenceRecoveries } from "./events/cadence";
import { computeBestEfforts } from "./events/bestEfforts";
import { computeConsistency } from "./events/consistency";
import { buildMoments } from "./events/moments";
import { collect, mean, median, stdev } from "@/lib/stats";

export interface BuildSettings {
  /** The runner's maximum heart rate. When absent, one is estimated from the run. */
  maxHr?: number;
}

/**
 * Turns a parsed file into the model every widget reads.
 *
 * This runs twice in the common case — once on load, then again if the runner
 * corrects their maximum heart rate — so it stays pure and cheap enough to
 * simply recompute rather than patch.
 */
export function buildActivity(raw: RawActivity, settings: BuildSettings = {}): DerivedActivity {
  const normalized = normalize(raw);

  const observedMaxHr = maxOrUndefined(normalized.hr);
  const maxHrUsed = settings.maxHr ?? estimateMaxHr(observedMaxHr);
  const maxHrIsEstimated = settings.maxHr === undefined;

  const { samples, movingS } = derive(normalized, { maxHr: maxHrUsed });
  const splits = computeSplits(samples);

  const events = detectEvents(samples, splits);
  linkEventsToSplits(events, splits);

  const moments = buildMoments(samples, events, splits);
  const summary = buildSummary(samples, splits, events, raw);

  const distanceM = samples[samples.length - 1]?.distanceM ?? 0;
  const elapsedS = samples.length > 0 ? samples[samples.length - 1].t - samples[0].t + 1 : 0;

  return {
    id: `${raw.source}-${raw.startedAt.getTime()}`,
    source: raw.source,
    name: raw.name,
    sport: raw.sport,
    startedAt: raw.startedAt,
    // The device's own total is more accurate than anything derived from a
    // resampled series, so prefer it when the file carries one.
    distanceM: raw.session?.totalDistanceM ?? distanceM,
    elapsedS,
    movingS,
    calories: raw.session?.totalCalories,
    samples,
    splits,
    events,
    moments,
    availableMetrics: detectAvailableMetrics(samples),
    summary,
    maxHrUsed,
    maxHrIsEstimated,
    warnings: normalized.warnings,
  };
}

function detectEvents(samples: Sample[], splits: Split[]): ActivityEvent[] {
  // Cadence recoveries are defined relative to the drops that precede them, so
  // the drops are detected first and handed over rather than found twice.
  const cadenceDrops = detectCadenceDrops(samples);

  const events: ActivityEvent[] = [
    ...detectClimbs(samples),
    ...detectStops(samples),
    ...detectWalking(samples),
    ...detectHrRecovery(samples),
    ...cadenceDrops,
    ...detectCadenceRecoveries(samples, cadenceDrops),
  ];

  const fastStart = detectFastStart(samples, splits);
  if (fastStart) events.push(fastStart);

  const strongFinish = detectStrongFinish(samples);
  if (strongFinish) events.push(strongFinish);

  events.sort((a, b) => a.startT - b.startT);
  return events;
}

function linkEventsToSplits(events: ActivityEvent[], splits: Split[]): void {
  for (const split of splits) {
    for (const event of events) {
      const overlaps = event.startT < split.endT && event.endT > split.startT;
      if (overlaps) split.eventIds.push(event.id);
    }
  }
}

function buildSummary(
  samples: Sample[],
  splits: Split[],
  events: ActivityEvent[],
  raw: RawActivity,
): ActivitySummary {
  const movingSamples = samples.filter((s) => s.moving);
  const movingPaces = collect(movingSamples, (s) => s.paceSecPerKm);
  const hrValues = collect(samples, (s) => s.hrBpm);
  const powerValues = collect(samples, (s) => s.powerW);
  const cadenceValues = collect(samples, (s) => s.cadenceSpm);
  const elevations = collect(samples, (s) => s.elevationM);

  const distanceM = samples[samples.length - 1]?.distanceM ?? 0;
  const elapsedS = samples.length;
  const movingS = movingSamples.length;

  const { gainM, lossM } = totalElevationChange(samples);
  const stops = events.filter((e) => e.type === "stop");

  return {
    avgPaceSecPerKm: distanceM > 0 ? (elapsedS / distanceM) * 1000 : NaN,
    movingPaceSecPerKm: distanceM > 0 ? (movingS / distanceM) * 1000 : NaN,
    medianMovingPaceSecPerKm: movingPaces.length > 0 ? median(movingPaces) : NaN,
    paceStdevSecPerKm: movingPaces.length > 1 ? stdev(movingPaces) : 0,
    avgHr: hrValues.length > 0 ? mean(hrValues) : raw.session?.avgHr,
    maxHr: hrValues.length > 0 ? Math.max(...hrValues) : raw.session?.maxHr,
    minHr: hrValues.length > 0 ? Math.min(...hrValues) : undefined,
    avgPowerW: powerValues.length > 0 ? mean(powerValues) : raw.session?.avgPowerW,
    maxPowerW: powerValues.length > 0 ? Math.max(...powerValues) : raw.session?.maxPowerW,
    avgCadenceSpm: cadenceValues.length > 0 ? mean(cadenceValues) : raw.session?.avgCadenceSpm,
    gainM: raw.session?.totalAscentM ?? gainM,
    lossM: raw.session?.totalDescentM ?? lossM,
    minElevationM: elevations.length > 0 ? Math.min(...elevations) : undefined,
    maxElevationM: elevations.length > 0 ? Math.max(...elevations) : undefined,
    zoneTime: countZoneTime(samples),
    gradientBuckets: buildGradientBuckets(samples),
    gradeAdjustment: gradeAdjustmentOver(samples),
    drift: computeDrift(samples),
    consistency: computeConsistency(samples),
    bestEfforts: computeBestEfforts(samples),
    stopCount: stops.length,
    stoppedS: elapsedS - movingS,
    ...(splits.length === 0 ? {} : {}),
  };
}

function totalElevationChange(samples: Sample[]): { gainM: number; lossM: number } {
  let gainM = 0;
  let lossM = 0;
  let previous: number | undefined;
  for (const sample of samples) {
    const value = sample.elevationM;
    if (value === undefined) continue;
    if (previous !== undefined) {
      const delta = value - previous;
      if (delta > 0) gainM += delta;
      else lossM -= delta;
    }
    previous = value;
  }
  return { gainM, lossM };
}

function countZoneTime(samples: Sample[]): Record<HrZone, number> {
  const zoneTime: Record<HrZone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const sample of samples) {
    if (sample.hrZone !== undefined) zoneTime[sample.hrZone] += 1;
  }
  return zoneTime;
}

/** Gradient categories are deliberately coarse: flat, up, down. */
export const GRADIENT_FLAT_PCT = 2;

export function gradientCategory(gradientPct: number | undefined): GradientCategory | undefined {
  if (gradientPct === undefined) return undefined;
  if (gradientPct > GRADIENT_FLAT_PCT) return "uphill";
  if (gradientPct < -GRADIENT_FLAT_PCT) return "downhill";
  return "flat";
}

function buildGradientBuckets(samples: Sample[]): GradientBucket[] {
  const categories: GradientCategory[] = ["downhill", "flat", "uphill"];
  const grouped = new Map<GradientCategory, Sample[]>(categories.map((c) => [c, []]));

  for (const sample of samples) {
    const category = gradientCategory(sample.gradientPct);
    if (category) grouped.get(category)!.push(sample);
  }

  return categories.map((category) => {
    const group = grouped.get(category)!;
    // Only moving seconds inform the averages: a category that happens to
    // contain a traffic light would otherwise look like hard terrain.
    const moving = group.filter((sample) => sample.moving);
    const paces = collect(moving, (s) => s.paceSecPerKm);
    const hr = collect(moving, (s) => s.hrBpm);
    const power = collect(moving, (s) => s.powerW);
    const cadence = collect(moving, (s) => s.cadenceSpm);

    let distanceM = 0;
    for (let i = 1; i < group.length; i++) {
      const delta = group[i].distanceM - group[i - 1].distanceM;
      // Only count contiguous seconds; jumps mean the category changed between.
      if (delta >= 0 && group[i].t - group[i - 1].t === 1) distanceM += delta;
    }

    return {
      category,
      distanceM,
      timeS: group.length,
      // The median, not the mean: pace over any stretch of a run is skewed by
      // the seconds spent accelerating away from a standstill, and one slow
      // start is enough to make flat ground look harder than a hill.
      avgPaceSecPerKm: paces.length > 0 ? median(paces) : undefined,
      avgHr: hr.length > 0 ? median(hr) : undefined,
      avgPowerW: power.length > 0 ? median(power) : undefined,
      avgCadenceSpm: cadence.length > 0 ? median(cadence) : undefined,
    };
  });
}

/**
 * Which metrics this file actually carries.
 *
 * Widgets declare what they need and are hidden when it is missing, so a run
 * recorded without cadence simply has no cadence section rather than an empty
 * one.
 */
function detectAvailableMetrics(samples: Sample[]): Set<MetricType> {
  const metrics = new Set<MetricType>(["time", "distance", "moving"]);
  const has = (pick: (s: Sample) => number | undefined, minimumFraction = 0.2): boolean =>
    collect(samples, pick).length >= samples.length * minimumFraction;

  if (has((s) => s.lat)) metrics.add("position");
  if (has((s) => s.elevationM)) metrics.add("elevation");
  if (has((s) => s.gradientPct)) metrics.add("gradient");
  if (has((s) => s.speedMps)) metrics.add("speed");
  if (has((s) => s.paceSecPerKm, 0.1)) metrics.add("pace");
  if (has((s) => s.hrBpm)) metrics.add("heartRate");
  if (has((s) => s.hrZone)) metrics.add("hrZone");
  if (has((s) => s.cadenceSpm)) metrics.add("cadence");
  if (has((s) => s.powerW)) metrics.add("power");

  return metrics;
}

function maxOrUndefined(series: (number | undefined)[]): number | undefined {
  let best: number | undefined;
  for (const value of series) {
    if (value === undefined) continue;
    if (best === undefined || value > best) best = value;
  }
  return best;
}
