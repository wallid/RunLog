import type { HrZone, Sample, Split, SplitTag } from "../activity";
import { collect, lerpAt, mean } from "@/lib/stats";
import { gradeAdjustmentOver } from "../gradeAdjusted";

/** Kilometre splits with enough context to explain why each one was what it was. */

const SPLIT_DISTANCE_M = 1000;
/** A final fragment shorter than this is folded into the previous split. */
const MIN_PARTIAL_SPLIT_M = 100;

export function computeSplits(samples: Sample[]): Split[] {
  if (samples.length === 0) return [];

  const totalDistance = samples[samples.length - 1].distanceM;
  if (totalDistance < MIN_PARTIAL_SPLIT_M) return [];

  const boundaries = splitBoundaries(samples, totalDistance);
  const splits: Split[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i];
    const to = boundaries[i + 1];
    const split = buildSplit(samples, i + 1, from, to);
    if (split) splits.push(split);
  }

  tagSplits(splits);
  return splits;
}

interface Boundary {
  distanceM: number;
  t: number;
  index: number;
}

function splitBoundaries(samples: Sample[], totalDistance: number): Boundary[] {
  const boundaries: Boundary[] = [{ distanceM: 0, t: samples[0].t, index: 0 }];

  let target = SPLIT_DISTANCE_M;
  let index = 0;
  while (target <= totalDistance) {
    while (index < samples.length - 1 && samples[index].distanceM < target) index++;
    const after = samples[index];
    const before = samples[Math.max(0, index - 1)];
    // Interpolate the crossing so a split's time is not rounded to whole samples.
    const t =
      after.distanceM === before.distanceM
        ? after.t
        : lerpAt(before.distanceM, before.t, after.distanceM, after.t, target);
    boundaries.push({ distanceM: target, t, index });
    target += SPLIT_DISTANCE_M;
  }

  const last = boundaries[boundaries.length - 1];
  const remainder = totalDistance - last.distanceM;
  const end = {
    distanceM: totalDistance,
    t: samples[samples.length - 1].t,
    index: samples.length - 1,
  };

  if (remainder >= MIN_PARTIAL_SPLIT_M) {
    boundaries.push(end);
  } else if (remainder > 0 && boundaries.length > 1) {
    // A fragment too short to be its own split is folded into the previous one,
    // so the splits still account for the whole run.
    boundaries[boundaries.length - 1] = end;
  }

  return boundaries;
}

function buildSplit(
  samples: Sample[],
  index: number,
  from: Boundary,
  to: Boundary,
): Split | undefined {
  const first = Math.max(0, Math.round(from.t - samples[0].t));
  const last = Math.min(samples.length - 1, Math.round(to.t - samples[0].t));
  if (last <= first) return undefined;

  const window = samples.slice(first, last + 1);
  const distanceM = to.distanceM - from.distanceM;
  const durationS = to.t - from.t;
  if (distanceM <= 0 || durationS <= 0) return undefined;

  const { gainM, lossM } = elevationChange(window);
  const hrValues = collect(window, (s) => s.hrBpm);
  const powerValues = collect(window, (s) => s.powerW);
  const cadenceValues = collect(window, (s) => s.cadenceSpm);
  const gradientValues = collect(window, (s) => s.gradientPct);

  // Split pace divided by what this kilometre's ground was worth in flat ground.
  // Dividing the split's own pace rather than recomputing one from the window
  // keeps the two figures differing by the terrain alone, including the stopped
  // time both of them carry.
  const paceSecPerKm = (durationS / distanceM) * 1000;
  const gradeAdjustment = gradeAdjustmentOver(window);

  return {
    index,
    startT: from.t,
    endT: to.t,
    startDistanceM: from.distanceM,
    endDistanceM: to.distanceM,
    distanceM,
    durationS,
    // Split pace uses elapsed time, so a stop inside a split shows up here.
    paceSecPerKm,
    ...(gradeAdjustment
      ? { gradeAdjustedPaceSecPerKm: paceSecPerKm / gradeAdjustment.factor }
      : {}),
    avgHr: hrValues.length > 0 ? mean(hrValues) : undefined,
    dominantZone: dominantZone(window),
    avgPowerW: powerValues.length > 0 ? mean(powerValues) : undefined,
    avgCadenceSpm: cadenceValues.length > 0 ? mean(cadenceValues) : undefined,
    gainM,
    lossM,
    avgGradientPct: gradientValues.length > 0 ? mean(gradientValues) : 0,
    stoppedS: window.filter((s) => !s.moving).length,
    eventIds: [],
    tags: distanceM < SPLIT_DISTANCE_M * 0.95 ? ["partial"] : [],
  };
}

function elevationChange(window: Sample[]): { gainM: number; lossM: number } {
  let gainM = 0;
  let lossM = 0;
  let previous: number | undefined;
  for (const sample of window) {
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

function dominantZone(window: Sample[]): HrZone | undefined {
  const counts = new Map<HrZone, number>();
  for (const sample of window) {
    if (sample.hrZone === undefined) continue;
    counts.set(sample.hrZone, (counts.get(sample.hrZone) ?? 0) + 1);
  }
  let best: HrZone | undefined;
  let bestCount = 0;
  for (const [zone, count] of counts) {
    if (count > bestCount) {
      best = zone;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Labels splits with context rather than a ranking.
 *
 * The product deliberately avoids presenting splits as a leaderboard: a slow
 * split on a climb is not a worse split, so the tags describe terrain and
 * effort alongside the fastest and slowest markers.
 */
function tagSplits(splits: Split[]): void {
  const full = splits.filter((s) => !s.tags.includes("partial"));
  if (full.length >= 2) {
    let fastest = full[0];
    let slowest = full[0];
    for (const split of full) {
      if (split.paceSecPerKm < fastest.paceSecPerKm) fastest = split;
      if (split.paceSecPerKm > slowest.paceSecPerKm) slowest = split;
    }
    addTag(fastest, "fastest");
    addTag(slowest, "slowest");
  }

  for (const split of splits) {
    if (split.avgGradientPct >= 1.5 || split.gainM >= 15) addTag(split, "climb");
    if (split.avgGradientPct <= -1.5 || split.lossM >= 15) addTag(split, "descent");
    if (split.stoppedS >= 10) addTag(split, "stop");
  }

  if (splits.length > 0) addTag(splits[splits.length - 1], "finish");
}

function addTag(split: Split, tag: SplitTag): void {
  if (!split.tags.includes(tag)) split.tags.push(tag);
}
