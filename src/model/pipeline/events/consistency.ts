import type { ConsistencyResult, Sample } from "../../activity";
import { collect, mean, median, stdev } from "@/lib/stats";

/**
 * How steady the pace was.
 *
 * Consistency is measured against the runner's own median rather than a target,
 * and the result is presented without judgement: variation is expected on
 * hills, intervals and races.
 */

/** Pace is sampled in blocks this long, which is short enough to see surges. */
const INTERVAL_S = 10;
/** The band a runner is considered to be holding pace within. */
const BAND_SEC_PER_KM = 15;
/** An excursion must last this long and be this large to count. */
const EXCURSION_MIN_S = 20;
const EXCURSION_MIN_SEC_PER_KM = 10;

export function computeConsistency(samples: Sample[]): ConsistencyResult | undefined {
  const intervals: ConsistencyResult["intervals"] = [];

  for (let start = 0; start + INTERVAL_S <= samples.length; start += INTERVAL_S) {
    const window = samples.slice(start, start + INTERVAL_S);
    // A block that includes a stop is not a pacing decision.
    if (window.some((s) => !s.moving)) continue;
    const paces = collect(window, (s) => s.paceSecPerKm);
    if (paces.length < INTERVAL_S / 2) continue;
    intervals.push({
      t: window[0].t,
      distanceM: window[0].distanceM,
      paceSecPerKm: mean(paces),
      within: false,
    });
  }

  if (intervals.length < 6) return undefined;

  const paces = intervals.map((i) => i.paceSecPerKm);
  const medianPace = median(paces);

  for (const interval of intervals) {
    interval.within = Math.abs(interval.paceSecPerKm - medianPace) <= BAND_SEC_PER_KM;
  }

  const withinCount = intervals.filter((i) => i.within).length;
  const { surgeCount, slowdownCount } = countExcursions(intervals, medianPace);

  return {
    medianPace,
    bandSecPerKm: BAND_SEC_PER_KM,
    withinBandFraction: withinCount / intervals.length,
    intervals,
    surgeCount,
    slowdownCount,
    stdevSecPerKm: stdev(paces),
  };
}

/** Counts sustained departures from the band in each direction. */
function countExcursions(
  intervals: ConsistencyResult["intervals"],
  medianPace: number,
): { surgeCount: number; slowdownCount: number } {
  const minIntervals = Math.ceil(EXCURSION_MIN_S / INTERVAL_S);
  let surgeCount = 0;
  let slowdownCount = 0;
  let runDirection: "faster" | "slower" | undefined;
  let runLength = 0;

  const finish = () => {
    if (runDirection && runLength >= minIntervals) {
      if (runDirection === "faster") surgeCount++;
      else slowdownCount++;
    }
    runDirection = undefined;
    runLength = 0;
  };

  for (const interval of intervals) {
    const delta = interval.paceSecPerKm - medianPace;
    // Lower seconds-per-kilometre means faster.
    const direction =
      delta <= -(BAND_SEC_PER_KM + EXCURSION_MIN_SEC_PER_KM)
        ? "faster"
        : delta >= BAND_SEC_PER_KM + EXCURSION_MIN_SEC_PER_KM
          ? "slower"
          : undefined;

    if (direction === undefined) {
      finish();
      continue;
    }
    if (direction !== runDirection) {
      finish();
      runDirection = direction;
    }
    runLength++;
  }
  finish();

  return { surgeCount, slowdownCount };
}
