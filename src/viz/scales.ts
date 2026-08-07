import type { DerivedActivity, Sample } from "@/model/activity";
import type { XMode } from "@/state/selectionStore";

/** Mapping between run positions and pixels along a horizontal track. */

export interface XScale {
  mode: XMode;
  width: number;
  /** Elapsed seconds to pixels. */
  toPixels: (t: number) => number;
  /** Pixels to elapsed seconds. */
  toTime: (x: number) => number;
  /** The value shown on the axis at this time, in seconds or metres. */
  valueAt: (t: number) => number;
  domainStart: number;
  domainEnd: number;
}

export function createXScale(
  activity: DerivedActivity,
  mode: XMode,
  width: number,
): XScale {
  const samples = activity.samples;
  const firstT = samples[0]?.t ?? 0;
  const lastT = samples[samples.length - 1]?.t ?? 1;
  const totalDistance = samples[samples.length - 1]?.distanceM ?? 1;

  if (mode === "time" || totalDistance <= 0) {
    const span = Math.max(1, lastT - firstT);
    return {
      mode: "time",
      width,
      toPixels: (t) => ((t - firstT) / span) * width,
      toTime: (x) => firstT + (x / width) * span,
      valueAt: (t) => t - firstT,
      domainStart: 0,
      domainEnd: span,
    };
  }

  // In distance mode the axis is not linear in time: a slow section occupies
  // less width than the seconds it took, which is exactly what makes a pace
  // change visible as terrain rather than as a wait.
  return {
    mode: "distance",
    width,
    toPixels: (t) => (distanceAtTime(samples, t) / totalDistance) * width,
    toTime: (x) => timeAtDistance(samples, (x / width) * totalDistance),
    valueAt: (t) => distanceAtTime(samples, t),
    domainStart: 0,
    domainEnd: totalDistance,
  };
}

function distanceAtTime(samples: Sample[], t: number): number {
  if (samples.length === 0) return 0;
  const index = Math.max(0, Math.min(samples.length - 1, Math.round(t - samples[0].t)));
  return samples[index].distanceM;
}

function timeAtDistance(samples: Sample[], distanceM: number): number {
  if (samples.length === 0) return 0;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].distanceM < distanceM) lo = mid + 1;
    else hi = mid;
  }
  return samples[lo].t;
}

/** A linear scale from a value range to a pixel range. */
export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const domainSpan = domainMax - domainMin;
  if (domainSpan === 0) return () => (rangeMin + rangeMax) / 2;
  return (value) => rangeMin + ((value - domainMin) / domainSpan) * (rangeMax - rangeMin);
}

/** Nice round tick values covering a range, aiming for about `count` ticks. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized >= 7.5 ? 10 : normalized >= 3.5 ? 5 : normalized >= 1.5 ? 2 : 1) * magnitude;

  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-9; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

/** Builds an SVG path from points, skipping gaps where the value is missing. */
export function buildPath(
  points: readonly { x: number; y: number | undefined }[],
): string {
  let path = "";
  let penDown = false;
  for (const point of points) {
    if (point.y === undefined || !Number.isFinite(point.y)) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    penDown = true;
  }
  return path;
}

/**
 * Reduces a series to at most `maxPoints` by taking the extreme value in each
 * bucket, so a spike survives downsampling instead of being averaged away.
 */
export function downsampleExtremes(
  values: readonly (number | undefined)[],
  maxPoints: number,
): (number | undefined)[] {
  if (values.length <= maxPoints) return [...values];
  const bucketSize = values.length / maxPoints;
  const out: (number | undefined)[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const from = Math.floor(i * bucketSize);
    const to = Math.min(values.length, Math.floor((i + 1) * bucketSize));
    let best: number | undefined;
    let bestDeviation = -1;
    let sum = 0;
    let count = 0;
    for (let j = from; j < to; j++) {
      const value = values[j];
      if (value === undefined) continue;
      sum += value;
      count++;
    }
    const bucketMean = count > 0 ? sum / count : undefined;
    for (let j = from; j < to; j++) {
      const value = values[j];
      if (value === undefined || bucketMean === undefined) continue;
      const deviation = Math.abs(value - bucketMean);
      if (deviation > bestDeviation) {
        bestDeviation = deviation;
        best = value;
      }
    }
    out.push(best);
  }
  return out;
}
