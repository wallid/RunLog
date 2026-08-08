import { distanceAtTime, type DerivedActivity } from "@/model/activity";
import { kindSpec, type RunAnnotation } from "@/model/annotations";
import { median } from "@/lib/stats";

/**
 * How the fuelling was spaced through the run.
 *
 * This is the question the *Event impact* card cannot answer honestly from one
 * run: not whether a particular gel worked, but whether there was a plan and
 * whether it held. Everything here is counting and subtraction over what the
 * reader typed in — no model, no inference, nothing that could be wrong in an
 * interesting way.
 *
 * The one thing it deliberately does not do is convert events into grams. A gel
 * is usually twenty to twenty-five grams of carbohydrate, but brands differ and
 * "drink" covers both water and a bottle carrying more than a gel does. Turning
 * five events into a number of grams an hour would be inventing the number that
 * matters most, and a reader would have no way to see that it had been invented.
 */

/**
 * Below this a run is generally shorter than the point where fuelling starts to
 * change anything, so its spacing is described rather than measured against
 * expectations. Ninety minutes is roughly where stored glycogen stops being
 * enough on its own for a moderate effort.
 */
export const FUELLING_EXPECTED_S = 90 * 60;

/** One stretch of running between two fuelling events. */
export interface FuelInterval {
  fromT: number;
  toT: number;
  fromLabel: string;
  toLabel: string;
  fromDistanceM: number;
  toDistanceM: number;
  durationS: number;
  distanceM: number;
}

export interface FuellingPattern {
  /** The nutrition events only, in the order they happened. */
  events: RunAnnotation[];
  intervals: FuelInterval[];
  /** The typical stretch between one and the next; absent with a single event. */
  medianGapS?: number;
  longest?: FuelInterval;
  /** Start of the run to the first one. */
  openingS: number;
  openingDistanceM: number;
  /** The last one to the end of the run. */
  closingS: number;
  closingDistanceM: number;
  /** Events per hour of elapsed running. */
  perHour: number;
  /** Whether the run is long enough for fuelling to be a question at all. */
  fuellingExpected: boolean;
}

/** Everything the card needs, or null when nothing was taken on this run. */
export function fuellingPattern(activity: DerivedActivity): FuellingPattern | null {
  const events = (activity.annotations ?? [])
    .filter((annotation) => kindSpec(annotation.kind)?.category === "nutrition")
    .slice()
    .sort((a, b) => a.t - b.t);
  if (events.length === 0) return null;

  const intervals: FuelInterval[] = [];
  for (let i = 1; i < events.length; i++) {
    const from = events[i - 1];
    const to = events[i];
    const fromDistanceM = distanceAtTime(activity, from.t);
    const toDistanceM = distanceAtTime(activity, to.t);
    intervals.push({
      fromT: from.t,
      toT: to.t,
      fromLabel: kindSpec(from.kind)?.label ?? "Event",
      toLabel: kindSpec(to.kind)?.label ?? "Event",
      fromDistanceM,
      toDistanceM,
      durationS: to.t - from.t,
      distanceM: Math.max(0, toDistanceM - fromDistanceM),
    });
  }

  const first = events[0];
  const last = events[events.length - 1];
  const end = activity.samples[activity.samples.length - 1]?.t ?? activity.elapsedS;

  return {
    events,
    intervals,
    medianGapS:
      intervals.length > 0
        ? median(intervals.map((interval) => interval.durationS))
        : undefined,
    longest:
      intervals.length > 0
        ? intervals.reduce((a, b) => (b.durationS > a.durationS ? b : a))
        : undefined,
    openingS: first.t,
    openingDistanceM: distanceAtTime(activity, first.t),
    closingS: Math.max(0, end - last.t),
    closingDistanceM: Math.max(0, activity.distanceM - distanceAtTime(activity, last.t)),
    // Elapsed rather than moving time: fuelling is spaced by the clock a runner
    // is actually watching, which does not stop when they do.
    perHour: activity.elapsedS > 0 ? (events.length / activity.elapsedS) * 3600 : 0,
    fuellingExpected: activity.elapsedS >= FUELLING_EXPECTED_S,
  };
}
