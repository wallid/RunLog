import { distanceAtTime, type Confidence, type DerivedActivity, type Sample } from "@/model/activity";
import type { RunAnnotation } from "@/model/annotations";
import { averageBetween, movingSecondsBetween, samplesBetween } from "../helpers";

/**
 * What a run's blood lactate readings say about the running they came off.
 *
 * A lactate value is not an event with a before and an after. It is a
 * measurement of the minutes that led up to the prick: blood taken at the end
 * of a five-minute step describes that step, not the next one. So every reading
 * here is paired with the running behind it, and the card built on this module
 * never compares the minutes either side of a sample the way the fuelling card
 * does.
 *
 * The numbers this uses as landmarks are conventions, not this runner's
 * physiology. Four millimoles per litre is a fixed concentration that turned out
 * to sit near the average person's maximal steady state, which is a different
 * claim from it sitting near *yours* — for a given runner the real value can be
 * anywhere from about two to seven. Everything computed against it is labelled
 * as the convention it is, and the estimate is refused outright whenever the
 * readings do not bracket it on rising pace.
 */

export const LACTATE_KIND = "lactate";

/**
 * Below this, lactate is being cleared about as fast as it is produced, which is
 * the concentration range easy running sits in. The first turn point is usually
 * put somewhere around here.
 */
export const AEROBIC_CEILING = 2;

/** The fixed concentration the threshold estimate interpolates to. */
export const OBLA = 4;

/**
 * How far back of a reading is taken to be the running it describes.
 *
 * Five minutes is roughly a step in an incremental test, and stopping short of
 * the sample itself leaves out the slowing down, the stopping and the fumbling
 * with a meter, none of which is the effort being measured.
 */
const LOOKBACK = { from: -300, to: -15 };

/** Below this there is too little running behind a reading to average it. */
const MIN_MOVING_S = 90;

/** Coverage below which the whole card falls back to raw pace. */
const MIN_GAP_COVERAGE = 0.7;

/** A pace difference smaller than this is the same effort, told twice. */
const SAME_PACE_S = 10;

/** The maximal-steady-state test: a stretch this long, holding a pace. */
const STEADY_MIN_S = 600;

/** Lactate rising by less than this over that stretch is a steady state. */
const STEADY_RISE_MMOL = 1;

export interface LactateReading {
  annotation: RunAnnotation;
  mmol: number;
  t: number;
  distanceM: number;
  /** The stretch of running the reading is taken to describe. */
  fromT: number;
  toT: number;
  movingS: number;
  /** Absent when too little of the lookback was spent running. */
  paceSecPerKm?: number;
  hrBpm?: number;
  band: LactateBand;
}

/**
 * Where a reading sits against the conventional landmarks.
 *
 * Three bands rather than five: the boundaries are population averages, and
 * cutting them finer would imply a precision the convention does not have.
 */
export type LactateBand = "clearing" | "between" | "accumulating";

export const BAND_LABELS: Record<LactateBand, string> = {
  clearing: "Clearing",
  between: "Between the turn points",
  accumulating: "Accumulating",
};

/** One reading to the next, in the order they were taken. */
export interface LactateStep {
  from: LactateReading;
  to: LactateReading;
  gapS: number;
  riseMmol: number;
  /** Negative means the second stretch was run faster. */
  paceDeltaSecPerKm?: number;
}

/** The pace at the conventional four millimoles, when the run brackets it. */
export interface ThresholdEstimate {
  atMmol: number;
  paceSecPerKm: number;
  hrBpm?: number;
  below: LactateReading;
  above: LactateReading;
}

/** A stretch held at one pace with lactate flat across it. */
export interface SteadyStretch {
  from: LactateReading;
  to: LactateReading;
  durationS: number;
  riseMmol: number;
  paceSecPerKm: number;
}

export interface LactateProfile {
  readings: LactateReading[];
  steps: LactateStep[];
  lowest: LactateReading;
  highest: LactateReading;
  /** Whether the pace figures have the gradient taken out of them. */
  usedGradeAdjusted: boolean;
  /**
   * Whether every reading was taken faster than the one before it.
   *
   * Only then is there a curve to draw: joining readings in pace order when the
   * pace wandered would draw a shape out of an order the running never had, and
   * the line between two of them would cross running that was never sampled.
   */
  incremental: boolean;
  estimate?: ThresholdEstimate;
  /** Why there is no estimate. Always set when `estimate` is absent. */
  refusal?: string;
  steady?: SteadyStretch;
  /** Never "high": see the note at the top of this file. */
  confidence: Confidence;
}

/** The readings a run carries, in the order they were taken. */
export function lactateAnnotations(activity: DerivedActivity): RunAnnotation[] {
  return (activity.annotations ?? [])
    .filter(
      (annotation) =>
        annotation.kind === LACTATE_KIND && annotation.value !== undefined,
    )
    .slice()
    .sort((a, b) => a.t - b.t);
}

/** Everything the card reads, or null when the run carries no readings. */
export function lactateProfile(activity: DerivedActivity): LactateProfile | null {
  const annotations = lactateAnnotations(activity);
  if (annotations.length === 0) return null;

  // One decision for the whole card: comparing a grade-adjusted pace at one
  // reading with a raw pace at the next would report the hill between them as a
  // change in the running.
  const usedGradeAdjusted = annotations.every(
    (annotation) => gapCoverage(activity, annotation.t) >= MIN_GAP_COVERAGE,
  );

  const readings = annotations.map((annotation) =>
    readingOf(activity, annotation, usedGradeAdjusted),
  );

  const steps: LactateStep[] = [];
  for (let i = 1; i < readings.length; i++) {
    const from = readings[i - 1];
    const to = readings[i];
    steps.push({
      from,
      to,
      gapS: to.t - from.t,
      riseMmol: to.mmol - from.mmol,
      paceDeltaSecPerKm:
        from.paceSecPerKm !== undefined && to.paceSecPerKm !== undefined
          ? to.paceSecPerKm - from.paceSecPerKm
          : undefined,
    });
  }

  const { estimate, refusal } = estimateThreshold(readings, steps);
  const steady = findSteady(steps);

  return {
    readings,
    steps,
    lowest: readings.reduce((a, b) => (b.mmol < a.mmol ? b : a)),
    highest: readings.reduce((a, b) => (b.mmol > a.mmol ? b : a)),
    usedGradeAdjusted,
    incremental:
      steps.length > 0 &&
      steps.every(
        (step) =>
          step.paceDeltaSecPerKm !== undefined &&
          step.paceDeltaSecPerKm < -SAME_PACE_S,
      ),
    estimate,
    refusal,
    steady,
    // Three readings is the fewest that can show a shape rather than two points
    // and a straight line between them, and without a bracketed crossing there
    // is no figure to be confident about in the first place.
    confidence: estimate !== undefined && readings.length >= 3 ? "medium" : "low",
  };
}

/** One reading, with the running behind it. */
function readingOf(
  activity: DerivedActivity,
  annotation: RunAnnotation,
  usedGradeAdjusted: boolean,
): LactateReading {
  const mmol = annotation.value as number;
  const last = activity.samples[activity.samples.length - 1]?.t ?? 0;
  const fromT = Math.max(0, annotation.t + LOOKBACK.from);
  const toT = Math.min(last, annotation.t + LOOKBACK.to);
  const movingS = toT > fromT ? movingSecondsBetween(activity, fromT, toT) : 0;
  const enough = movingS >= MIN_MOVING_S;

  return {
    annotation,
    mmol,
    t: annotation.t,
    distanceM: distanceAtTime(activity, annotation.t),
    fromT,
    toT,
    movingS,
    paceSecPerKm: enough
      ? averageBetween(activity, fromT, toT, (sample) => pickPace(sample, usedGradeAdjusted))
      : undefined,
    hrBpm: enough
      ? averageBetween(activity, fromT, toT, (sample) => sample.hrBpm)
      : undefined,
    band: bandOf(mmol),
  };
}

function pickPace(sample: Sample, usedGradeAdjusted: boolean): number | undefined {
  if (!sample.moving) return undefined;
  return usedGradeAdjusted ? sample.gradeAdjustedPaceSecPerKm : sample.paceSecPerKm;
}

export function bandOf(mmol: number): LactateBand {
  if (mmol < AEROBIC_CEILING) return "clearing";
  if (mmol < OBLA) return "between";
  return "accumulating";
}

/**
 * The pace at four millimoles, interpolated between the readings either side.
 *
 * Everything careful here is a refusal. The estimate needs the readings to
 * cross the concentration exactly once, on rising pace, with both sides having
 * enough running behind them to have a pace at all — which is what an
 * incremental test looks like and what an ordinary run with two samples in it
 * does not. Extrapolating past the fastest reading, or interpolating across a
 * crossing that happened while slowing down, would produce a number with the
 * same shape as a real one and no meaning behind it.
 */
function estimateThreshold(
  readings: LactateReading[],
  steps: LactateStep[],
): { estimate?: ThresholdEstimate; refusal?: string } {
  if (readings.length < 2) {
    return {
      refusal:
        "One reading is a number, not a curve — there is nothing either side of it to interpolate between.",
    };
  }

  const crossings = steps.filter(
    (step) => step.from.mmol < OBLA && step.to.mmol >= OBLA,
  );

  if (crossings.length === 0) {
    return {
      refusal: readings.every((reading) => reading.mmol < OBLA)
        ? `Every reading came in under ${OBLA} mmol/L, so the pace at ${OBLA} would be an extrapolation past the fastest running here rather than a reading from it.`
        : `No pair of readings sits either side of ${OBLA} mmol/L in order, so there is no crossing to interpolate at.`,
    };
  }
  if (crossings.length > 1) {
    return {
      refusal: `The readings cross ${OBLA} mmol/L more than once, which is not the single rising sequence the estimate assumes.`,
    };
  }

  const crossing = crossings[0];
  const { from: below, to: above } = crossing;
  if (below.paceSecPerKm === undefined || above.paceSecPerKm === undefined) {
    return {
      refusal:
        "One of the readings either side of the crossing has too little running behind it to give it a pace.",
    };
  }
  if (crossing.paceDeltaSecPerKm === undefined || crossing.paceDeltaSecPerKm > -SAME_PACE_S) {
    return {
      refusal: `Lactate crossed ${OBLA} mmol/L without the pace rising with it, so the crossing says something about the run — drift, heat, fatigue — rather than about the pace ${OBLA} sits at.`,
    };
  }

  const span = above.mmol - below.mmol;
  const fraction = span === 0 ? 0 : (OBLA - below.mmol) / span;
  const between = (start: number, end: number) => start + fraction * (end - start);

  return {
    estimate: {
      atMmol: OBLA,
      paceSecPerKm: between(below.paceSecPerKm, above.paceSecPerKm),
      hrBpm:
        below.hrBpm !== undefined && above.hrBpm !== undefined
          ? between(below.hrBpm, above.hrBpm)
          : undefined,
      below,
      above,
    },
  };
}

/**
 * The longest stretch held at one pace with lactate flat across it.
 *
 * This is the useful half of a lactate test done on an ordinary run: not where
 * a threshold sits, but whether the effort being held was one the runner was
 * clearing at. Two samples ten minutes apart at the same pace, with less than a
 * millimole between them, is what the maximal steady state protocol looks for.
 */
function findSteady(steps: LactateStep[]): SteadyStretch | undefined {
  const held = steps.filter(
    (step) =>
      step.gapS >= STEADY_MIN_S &&
      step.paceDeltaSecPerKm !== undefined &&
      Math.abs(step.paceDeltaSecPerKm) <= SAME_PACE_S &&
      Math.abs(step.riseMmol) <= STEADY_RISE_MMOL,
  );
  if (held.length === 0) return undefined;

  const longest = held.reduce((a, b) => (b.gapS > a.gapS ? b : a));
  const from = longest.from;
  const to = longest.to;
  return {
    from,
    to,
    durationS: longest.gapS,
    riseMmol: longest.riseMmol,
    // Both stretches were run at the same pace by definition of the test above,
    // so either figure describes it; the mean of the two is the honest one.
    paceSecPerKm: ((from.paceSecPerKm as number) + (to.paceSecPerKm as number)) / 2,
  };
}

/** The share of a lookback's moving seconds that carry a grade-adjusted pace. */
function gapCoverage(activity: DerivedActivity, t: number): number {
  const moving = samplesBetween(
    activity,
    Math.max(0, t + LOOKBACK.from),
    t + LOOKBACK.to,
  ).filter((sample) => sample.moving);
  if (moving.length === 0) return 0;
  return (
    moving.filter((sample) => sample.gradeAdjustedPaceSecPerKm !== undefined).length /
    moving.length
  );
}
