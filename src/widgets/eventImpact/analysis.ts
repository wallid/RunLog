import type { Confidence, DerivedActivity, Sample } from "@/model/activity";
import { kindSpec, type RunAnnotation } from "@/model/annotations";
import { collect, mean } from "@/lib/stats";
import { NOISE_FLOOR } from "../helpers";

/**
 * What the running either side of a reader's event looked like.
 *
 * The comparison is deliberately dumb: two windows of moving seconds, averaged,
 * differenced. Everything careful about this card is in what it refuses — it
 * will not compare windows with too little running in them, will not mix
 * grade-adjusted pace with raw pace, will not call a difference smaller than
 * the sensors' own noise a change, and will not raise its confidence above
 * medium whatever the numbers say. One run has no control group: the runner who
 * took the gel is the same runner who decided to push, on the same ground, in
 * the same weather.
 *
 * Which windows to use comes from the event's own catalogue entry, so a kind
 * with no honest window to look in — a cramp, a shoe stop — is simply not
 * analysed. See `model/annotations.ts`.
 */

/** Below this a window holds too little running to average honestly. */
export const MIN_MOVING_S = 120;

/**
 * How much of a window's distance needs a known gradient before the comparison
 * is made on grade-adjusted pace. Below it, both windows fall back to raw pace
 * rather than one of each.
 */
const MIN_GAP_COVERAGE = 0.7;

/** A window whose running is more standing than moving explains nothing. */
const MAX_STOPPED_FRACTION = 0.2;

/** A gradient difference this large between the windows is terrain, not fuel. */
const TERRAIN_DELTA_PCT = 1;

export interface ImpactWindow {
  startT: number;
  endT: number;
  movingS: number;
  paceSecPerKm?: number;
  hrBpm?: number;
  gradientPct?: number;
}

export interface EventImpact {
  annotation: RunAnnotation;
  before: ImpactWindow;
  after: ImpactWindow;
  /** Negative means faster after. Undefined when either window had no pace. */
  paceDeltaSecPerKm?: number;
  hrDeltaBpm?: number;
  /** Whether the pace figures have the gradient taken out of them. */
  usedGradeAdjusted: boolean;
  /** True when the pace difference is inside sensor noise. */
  paceWithinNoise: boolean;
  hrWithinNoise: boolean;
  /** Never "high": see the note at the top of this file. */
  confidence: Confidence;
  caveats: string[];
}

/**
 * Compares the running after an event against the running before it.
 *
 * Returns null when the event cannot be compared at all — an unanalysable
 * kind, or a window with too little running in it because the event sat near
 * the start or the end of the run, or in the middle of a long stop.
 */
export function analyzeAnnotation(
  activity: DerivedActivity,
  annotation: RunAnnotation,
  all: readonly RunAnnotation[],
): EventImpact | null {
  const spec = kindSpec(annotation.kind);
  if (!spec?.impact) return null;

  const before = windowOf(activity, annotation.t + spec.impact.before.from, annotation.t + spec.impact.before.to);
  const after = windowOf(activity, annotation.t + spec.impact.after.from, annotation.t + spec.impact.after.to);
  if (before.movingS < MIN_MOVING_S || after.movingS < MIN_MOVING_S) return null;

  // Both windows are read the same way or neither is: a grade-adjusted figure
  // against a raw one would report the hill as an effect of the gel.
  const usedGradeAdjusted =
    gapCoverage(activity, before) >= MIN_GAP_COVERAGE &&
    gapCoverage(activity, after) >= MIN_GAP_COVERAGE;
  const pickPace = (sample: Sample): number | undefined =>
    !sample.moving
      ? undefined
      : usedGradeAdjusted
        ? sample.gradeAdjustedPaceSecPerKm
        : sample.paceSecPerKm;

  before.paceSecPerKm = averageOver(activity, before, pickPace);
  after.paceSecPerKm = averageOver(activity, after, pickPace);

  const paceDelta =
    before.paceSecPerKm !== undefined && after.paceSecPerKm !== undefined
      ? after.paceSecPerKm - before.paceSecPerKm
      : undefined;
  const hrDelta =
    before.hrBpm !== undefined && after.hrBpm !== undefined
      ? after.hrBpm - before.hrBpm
      : undefined;

  const caveats: string[] = [];
  let confidence: Confidence = "medium";
  const weaken = (caveat: string) => {
    caveats.push(caveat);
    confidence = "low";
  };

  if (
    !usedGradeAdjusted &&
    before.gradientPct !== undefined &&
    after.gradientPct !== undefined &&
    Math.abs(after.gradientPct - before.gradientPct) > TERRAIN_DELTA_PCT
  ) {
    weaken(
      "The ground was not the same either side of it, and this run has too little elevation data to take the gradient out.",
    );
  }

  const beforeSpan = before.endT - before.startT + 1;
  const afterSpan = after.endT - after.startT + 1;
  if (
    before.movingS / beforeSpan < 1 - MAX_STOPPED_FRACTION ||
    after.movingS / afterSpan < 1 - MAX_STOPPED_FRACTION
  ) {
    weaken("A good part of one window was spent standing still.");
  }

  const overlapping = all.filter(
    (other) =>
      other.id !== annotation.id &&
      kindSpec(other.kind)?.impact !== undefined &&
      other.t >= after.startT &&
      other.t <= after.endT,
  );
  if (overlapping.length > 0) {
    weaken(
      "Another event falls inside the stretch being read, so the two cannot be told apart.",
    );
  }

  if (after.endT < annotation.t + spec.impact.after.to) {
    weaken("The run ended before the whole window had been run.");
  }

  return {
    annotation,
    before,
    after,
    paceDeltaSecPerKm: paceDelta,
    hrDeltaBpm: hrDelta,
    usedGradeAdjusted,
    paceWithinNoise:
      paceDelta === undefined || Math.abs(paceDelta) < NOISE_FLOOR.paceSecPerKm,
    hrWithinNoise: hrDelta === undefined || Math.abs(hrDelta) < NOISE_FLOOR.hrBpm,
    confidence,
    caveats,
  };
}

/** Everything analysable about a run's events, in the order they happened. */
export function analyzeAnnotations(activity: DerivedActivity): EventImpact[] {
  const all = activity.annotations ?? [];
  return all
    .map((annotation) => analyzeAnnotation(activity, annotation, all))
    .filter((impact): impact is EventImpact => impact !== null);
}

/** Clamps a window to the run and fills in what does not depend on pace. */
function windowOf(activity: DerivedActivity, from: number, to: number): ImpactWindow {
  const last = activity.samples[activity.samples.length - 1]?.t ?? 0;
  const startT = Math.max(0, Math.round(from));
  const endT = Math.min(last, Math.round(to));
  const window: ImpactWindow = { startT, endT, movingS: 0 };
  if (endT <= startT) return window;

  const samples = samplesIn(activity, window);
  window.movingS = samples.filter((sample) => sample.moving).length;
  window.hrBpm = averageOver(activity, window, (sample) => sample.hrBpm);
  window.gradientPct = averageOver(activity, window, (sample) =>
    sample.moving ? sample.gradientPct : undefined,
  );
  return window;
}

function samplesIn(activity: DerivedActivity, window: ImpactWindow): Sample[] {
  return activity.samples.filter(
    (sample) => sample.t >= window.startT && sample.t <= window.endT,
  );
}

function averageOver(
  activity: DerivedActivity,
  window: ImpactWindow,
  pick: (sample: Sample) => number | undefined,
): number | undefined {
  const values = collect(samplesIn(activity, window), pick);
  return values.length > 0 ? mean(values) : undefined;
}

/** The share of a window's moving seconds that carry a grade-adjusted pace. */
function gapCoverage(activity: DerivedActivity, window: ImpactWindow): number {
  const moving = samplesIn(activity, window).filter((sample) => sample.moving);
  if (moving.length === 0) return 0;
  const adjusted = moving.filter(
    (sample) => sample.gradeAdjustedPaceSecPerKm !== undefined,
  );
  return adjusted.length / moving.length;
}
