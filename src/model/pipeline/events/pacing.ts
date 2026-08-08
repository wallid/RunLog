import type { ActivityEvent, Sample, Split } from "../../activity";
import { collect, mean, median } from "@/lib/stats";

/**
 * Opening and closing pacing patterns.
 *
 * Both are comparisons against the runner's own middle-of-run pace rather than
 * any universal target, because whether a fast start is a mistake depends
 * entirely on what the run was for.
 */

/** A first kilometre this much faster than the middle is worth pointing out. */
const FAST_START_THRESHOLD = 0.05;
/** Pace is considered settled once it comes within this fraction of the median. */
const SETTLE_TOLERANCE = 0.03;
const FINISH_DISTANCE_M = 600;
const MIN_FINISH_DISTANCE_M = 400;
/**
 * Exported so the widget classifies a finish exactly as the detector did.
 * Below this the event was raised on rising heart rate at held pace, which is a
 * different story from speeding up and has to be narrated as one.
 */
export const STRONG_FINISH_THRESHOLD = 0.03;
/** A rising heart rate at unchanged pace also counts as a finishing effort. */
const FINISH_HR_RISE_BPM = 5;

export function detectFastStart(samples: Sample[], splits: Split[]): ActivityEvent | undefined {
  if (splits.length < 2) return undefined;

  const opening = splits[0];
  // Compare against the middle of the run, excluding the opening and the finish.
  const middle = splits.slice(1, Math.max(2, splits.length - 1));
  if (middle.length === 0) return undefined;

  const middlePace = median(middle.map((s) => s.paceSecPerKm));
  if (!Number.isFinite(middlePace) || middlePace <= 0) return undefined;

  const difference = (middlePace - opening.paceSecPerKm) / middlePace;
  if (difference < FAST_START_THRESHOLD) return undefined;

  const settleT = findSettlePoint(samples, middlePace);
  const openingHr = collect(
    samples.filter((s) => s.t >= opening.startT && s.t <= opening.endT),
    (s) => s.hrBpm,
  );

  return {
    id: "fast-start",
    type: "fastStart",
    startT: opening.startT,
    endT: settleT ?? opening.endT,
    startDistanceM: 0,
    endDistanceM: opening.endDistanceM,
    // A single opening kilometre is a small sample; the pattern is clearer when
    // the run has enough splits to establish a middle.
    confidence: splits.length >= 4 ? "high" : "medium",
    metrics: {
      openingPaceSecPerKm: opening.paceSecPerKm,
      middlePaceSecPerKm: middlePace,
      differencePct: difference * 100,
      paceDeltaSecPerKm: middlePace - opening.paceSecPerKm,
      settleT: settleT ?? NaN,
      settleDistanceM: settleT !== undefined ? distanceAt(samples, settleT) : NaN,
      openingAvgHr: openingHr.length > 0 ? mean(openingHr) : NaN,
    },
    label: "Fast opening",
  };
}

/**
 * The first moment sustained pace comes back within tolerance of the median.
 *
 * The search cannot simply take the first window that is not fast: every run
 * begins from standing, so the opening thirty seconds are always slower than the
 * middle and would be returned immediately — reporting that a fast start settled
 * after fifty metres, which contradicts the finding it belongs to. So the
 * opening surge has to be seen first, and the settle point is where it ends.
 */
function findSettlePoint(samples: Sample[], middlePace: number): number | undefined {
  const WINDOW_S = 30;
  const fastEnough = middlePace * (1 - SETTLE_TOLERANCE);
  let sawTheSurge = false;

  for (let i = WINDOW_S; i < samples.length; i++) {
    const window = samples.slice(i - WINDOW_S, i);
    const paces = collect(window, (s) => s.paceSecPerKm);
    if (paces.length < WINDOW_S / 2) continue;

    const windowPace = mean(paces);
    if (windowPace < fastEnough) {
      sawTheSurge = true;
      continue;
    }
    if (sawTheSurge) return samples[i].t;
  }
  return undefined;
}

export function detectStrongFinish(samples: Sample[]): ActivityEvent | undefined {
  if (samples.length < 120) return undefined;

  const totalDistance = samples[samples.length - 1].distanceM;
  const finishLength = Math.max(
    MIN_FINISH_DISTANCE_M,
    Math.min(FINISH_DISTANCE_M, totalDistance * 0.1),
  );
  if (totalDistance < finishLength * 2) return undefined;

  const finishStartDistance = totalDistance - finishLength;
  const finish = samples.filter((s) => s.distanceM >= finishStartDistance);
  // The middle half of the run is the fairest baseline: it excludes both the
  // opening surge and the finish being measured.
  const middle = samples.filter(
    (s) => s.distanceM >= totalDistance * 0.25 && s.distanceM <= totalDistance * 0.75,
  );
  if (finish.length < 30 || middle.length < 60) return undefined;

  const finishPaces = collect(finish, (s) => s.paceSecPerKm);
  const middlePaces = collect(middle, (s) => s.paceSecPerKm);
  if (finishPaces.length < 20 || middlePaces.length < 30) return undefined;

  const finishPace = mean(finishPaces);
  const middlePace = mean(middlePaces);
  const paceImprovement = (middlePace - finishPace) / middlePace;

  const finishHr = collect(finish, (s) => s.hrBpm);
  const middleHr = collect(middle, (s) => s.hrBpm);
  const hrRise =
    finishHr.length > 0 && middleHr.length > 0 ? mean(finishHr) - mean(middleHr) : 0;

  const fasterFinish = paceImprovement >= STRONG_FINISH_THRESHOLD;
  // Holding pace while heart rate climbs is also a finishing effort, but it is
  // a weaker signal than actually speeding up.
  const effortFinish = !fasterFinish && hrRise >= FINISH_HR_RISE_BPM;
  if (!fasterFinish && !effortFinish) return undefined;

  const finishCadence = collect(finish, (s) => s.cadenceSpm);
  const middleCadence = collect(middle, (s) => s.cadenceSpm);
  const finishPower = collect(finish, (s) => s.powerW);
  const middlePower = collect(middle, (s) => s.powerW);

  return {
    id: "strong-finish",
    type: "strongFinish",
    startT: finish[0].t,
    endT: finish[finish.length - 1].t,
    startDistanceM: finish[0].distanceM,
    endDistanceM: totalDistance,
    confidence: fasterFinish ? "high" : "low",
    metrics: {
      finishPaceSecPerKm: finishPace,
      middlePaceSecPerKm: middlePace,
      paceDeltaSecPerKm: middlePace - finishPace,
      improvementPct: paceImprovement * 100,
      hrRiseBpm: hrRise,
      finishAvgHr: finishHr.length > 0 ? mean(finishHr) : NaN,
      lengthM: finishLength,
      cadenceDeltaSpm:
        finishCadence.length > 0 && middleCadence.length > 0
          ? mean(finishCadence) - mean(middleCadence)
          : NaN,
      powerDeltaW:
        finishPower.length > 0 && middlePower.length > 0
          ? mean(finishPower) - mean(middlePower)
          : NaN,
    },
    label: fasterFinish ? "Strong finish" : "Rising effort at the finish",
  };
}

function distanceAt(samples: Sample[], t: number): number {
  const index = Math.max(0, Math.min(samples.length - 1, Math.round(t - samples[0].t)));
  return samples[index].distanceM;
}
