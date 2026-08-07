import type { DerivedActivity, Sample } from "@/model/activity";
import { cadenceBaseline, runningCadenceOf } from "@/model/pipeline/events/cadence";
import { collect, correlation, mean, median, percentile } from "@/lib/stats";
import type { TeachingPoint } from "./contract";

/**
 * What the cadence section shares.
 *
 * Eleven widgets read the same series, so the definition of "cadence while
 * running" lives in one place. It is the detector's definition, imported rather
 * than restated: a page where the timeline and the drop detector disagreed
 * about which seconds counted would be worse than either alone.
 */

export { cadenceBaseline, runningCadenceOf };

/**
 * Below this there is not enough rhythm to describe.
 *
 * Two minutes of running is roughly three hundred strides, which is the point
 * at which a median stops moving with every new sample.
 */
export const MIN_CADENCE_SECONDS = 120;

/** Every second of running cadence in the activity. */
export function runningCadence(activity: DerivedActivity): number[] {
  return collect(activity.samples, runningCadenceOf);
}

/**
 * Total steps and the stride they imply.
 *
 * Steps are counted a second at a time from the step rate, so a run with gaps
 * in the recording reports the steps it can see rather than an extrapolation.
 * Stride length is that count divided into the distance actually covered while
 * those steps were being taken.
 */
export function stepCount(activity: DerivedActivity): {
  steps: number;
  distanceM: number;
  strideLengthM?: number;
} {
  let steps = 0;
  let distanceM = 0;
  const samples = activity.samples;

  for (let i = 0; i < samples.length; i++) {
    const cadence = runningCadenceOf(samples[i]);
    if (cadence === undefined) continue;
    steps += cadence / 60;
    const previous = samples[i - 1];
    // Only contiguous seconds contribute distance, so a recording gap does not
    // credit a stride with ground covered while the watch was not looking.
    if (previous && samples[i].t - previous.t === 1) {
      distanceM += Math.max(0, samples[i].distanceM - previous.distanceM);
    }
  }

  return {
    steps,
    distanceM,
    strideLengthM: steps > 1 && distanceM > 0 ? distanceM / steps : undefined,
  };
}

export interface CadenceBin {
  id: string;
  label: string;
  /** Mean cadence over the seconds that fell in this bin. */
  cadenceSpm: number;
  seconds: number;
  /** Where the bin sits on the other metric's axis, for plotting. */
  centre: number;
  from: number;
  to: number;
}

/**
 * Mean cadence within bands of another metric.
 *
 * Binning is what turns a cloud of per-second points into a readable answer:
 * the question is never "what was cadence at 4:32 into the run" but "was
 * cadence different when the ground was steeper".
 */
export function binCadenceAgainst(
  activity: DerivedActivity,
  pick: (sample: Sample) => number | undefined,
  edges: number[],
  label: (from: number, to: number) => string,
  minSeconds = 20,
): CadenceBin[] {
  const bins: CadenceBin[] = [];

  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i];
    const to = edges[i + 1];
    const values: number[] = [];
    const others: number[] = [];

    for (const sample of activity.samples) {
      const cadence = runningCadenceOf(sample);
      const other = pick(sample);
      if (cadence === undefined || other === undefined) continue;
      // The last bin is closed at the top so the highest value is not dropped.
      const inside = i === edges.length - 2 ? other >= from && other <= to : other >= from && other < to;
      if (inside) {
        values.push(cadence);
        others.push(other);
      }
    }

    // A band holding a handful of seconds says more about where the runner
    // happened to be looking at their watch than about the metric.
    if (values.length < minSeconds) continue;

    bins.push({
      id: `bin-${i}`,
      label: label(from, to),
      cadenceSpm: mean(values),
      seconds: values.length,
      // Plotted where the band's running actually was, not at its midpoint: a
      // wide band with everything at one end would otherwise put its marker in
      // empty space.
      centre: median(others),
      from,
      to,
    });
  }

  return bins;
}

/**
 * Bin edges placed so each band holds a similar amount of running.
 *
 * Equal-width bands over pace or heart rate put almost every second in the
 * middle one and leave the outer bands too thin to average. Equal-count bands
 * are wider where the data is sparse, which is where the comparison needs the
 * room.
 */
export function quantileEdges(
  activity: DerivedActivity,
  pick: (sample: Sample) => number | undefined,
  count: number,
  clip = 0.02,
): number[] {
  const values: number[] = [];
  for (const sample of activity.samples) {
    if (runningCadenceOf(sample) === undefined) continue;
    const value = pick(sample);
    if (value !== undefined && Number.isFinite(value)) values.push(value);
  }
  if (values.length < 60) return [];

  const edges: number[] = [];
  for (let i = 0; i <= count; i++) {
    const q = clip + (i / count) * (1 - 2 * clip);
    const edge = percentile(values, q);
    // Duplicate edges mean a flat stretch of the metric; one band covers it.
    if (edges.length === 0 || edge > edges[edges.length - 1]) edges.push(edge);
  }
  return edges.length >= 3 ? edges : [];
}

export interface CadencePoint {
  x: number;
  y: number;
}

/** Per-second points of cadence against another metric, thinned for drawing. */
export function cadencePoints(
  activity: DerivedActivity,
  pick: (sample: Sample) => number | undefined,
  maxPoints = 800,
): CadencePoint[] {
  const all: CadencePoint[] = [];
  for (const sample of activity.samples) {
    const cadence = runningCadenceOf(sample);
    const other = pick(sample);
    if (cadence === undefined || other === undefined) continue;
    all.push({ x: other, y: cadence });
  }

  if (all.length <= maxPoints) return all;
  const step = all.length / maxPoints;
  const thinned: CadencePoint[] = [];
  for (let i = 0; i < maxPoints; i++) thinned.push(all[Math.floor(i * step)]);
  return thinned;
}

/** Correlation between cadence and another metric across the running seconds. */
export function cadenceCorrelation(
  activity: DerivedActivity,
  pick: (sample: Sample) => number | undefined,
): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const sample of activity.samples) {
    const cadence = runningCadenceOf(sample);
    const other = pick(sample);
    if (cadence === undefined || other === undefined) continue;
    xs.push(other);
    ys.push(cadence);
  }
  return correlation(xs, ys);
}

/**
 * A correlation in words.
 *
 * Deliberately coarse. A coefficient of 0.42 over per-second data from one run
 * does not support a finer distinction than "loosely", and printing two decimal
 * places would imply that it did.
 */
export function describeStrength(r: number): "no" | "a weak" | "a moderate" | "a strong" {
  const magnitude = Math.abs(r);
  if (!Number.isFinite(r) || magnitude < 0.2) return "no";
  if (magnitude < 0.4) return "a weak";
  if (magnitude < 0.65) return "a moderate";
  return "a strong";
}

/** The caveat every comparison in this section carries. */
export const CADENCE_IS_PERSONAL: TeachingPoint = {
  title: "There is no correct cadence",
  text: "Step rate depends on leg length, speed, terrain and running style, so a number that suits one runner suits another badly. The comparison worth making is against your own cadence at a similar pace on similar ground, which is what every figure in this section does.",
};

