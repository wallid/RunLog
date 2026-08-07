import type { DerivedActivity, MetricType, Sample } from "@/model/activity";
import { collect, mean } from "@/lib/stats";
import { runningCadenceOf } from "@/model/pipeline/events/cadence";
import { NOISE_FLOOR } from "./helpers";

/**
 * What the experimental lab shares.
 *
 * Every card in this section asks the same kind of question: not "how fast were
 * you" but "did the relationship between two signals hold". That means the
 * section needs one definition of a comparable stretch of running and one
 * definition of efficiency, rather than each card inventing its own and quietly
 * disagreeing with the card above it.
 *
 * Two rules run through all of it. Comparisons are made over equal *moving*
 * time, so a run with a long wait at a crossing is not carved up by where the
 * runner happened to stand still. And terrain is checked before any change is
 * attributed to the runner, because ground that tilts uphill raises heart rate
 * and slows pace entirely on its own.
 */

/** Below this a stretch holds too little running to average honestly. */
export const MIN_SEGMENT_SECONDS = 120;

/**
 * Moving seconds dropped from the front of a durability comparison.
 *
 * Heart rate does not arrive at the effort with the legs. It climbs for several
 * minutes at the start of any run while circulation catches up, and a
 * comparison that includes those minutes measures that lag far more than it
 * measures anything about the runner. A short run compared start-to-finish will
 * report a large fall in efficiency on every single occasion, which is the
 * clearest sign the figure is describing the warm-up.
 */
export const WARMUP_S = 300;

/**
 * The least running a durability comparison is worth making over.
 *
 * Durability is a claim about what a sustained effort does to you. Over twenty
 * minutes of steady running there is not enough of an effort for the question
 * to mean much, and what movement there is comes mostly from settling in.
 */
export const MIN_COMPARABLE_MOVING_S = 1200;

/** The seconds this section is willing to compare: running, not standing. */
export function movingSamples(activity: DerivedActivity): Sample[] {
  return activity.samples.filter((sample) => sample.moving);
}

export interface SegmentProfile {
  /** 1-based position in the run. */
  index: number;
  startT: number;
  endT: number;
  startDistanceM: number;
  endDistanceM: number;
  /** Moving seconds in the stretch. */
  seconds: number;
  speedMps?: number;
  paceSecPerKm?: number;
  hrBpm?: number;
  powerW?: number;
  cadenceSpm?: number;
  gradientPct?: number;
  /** Metres covered per heartbeat: speed bought with cardiovascular cost. */
  metresPerBeat?: number;
  /** Watts held per heartbeat: mechanical output bought with the same cost. */
  wattsPerBeat?: number;
  /**
   * Metres of ground per step.
   *
   * Not measured — derived, as speed divided by step rate. Speed is exactly
   * turnover times step length, so having two of the three gives the third, and
   * this is what lets the section say whether a slowdown came from the feet
   * landing less often or from covering less ground each time they did.
   */
  strideLengthM?: number;
}

/**
 * Averages a metric over a stretch, or declines to.
 *
 * A mean taken from a third of a stretch is not that stretch's mean, and a card
 * that printed one would be comparing whichever seconds the sensor happened to
 * catch. Half coverage is the floor, and never fewer than thirty seconds.
 */
function optionalMean(
  samples: Sample[],
  pick: (sample: Sample) => number | undefined,
): number | undefined {
  const values = collect(samples, pick);
  if (values.length < Math.max(30, samples.length * 0.5)) return undefined;
  const value = mean(values);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Everything the lab reads from one stretch of running.
 *
 * Pace comes from mean speed rather than from averaging pace values: seconds
 * per kilometre is a reciprocal, and averaging it weights the slow seconds far
 * more heavily than the ground they covered. Taking both pace and efficiency
 * from the same mean speed also keeps the two figures on a card consistent with
 * each other.
 */
export function profileOf(samples: Sample[], index: number): SegmentProfile {
  const speedMps = optionalMean(samples, (s) => s.speedMps);
  const hrBpm = optionalMean(samples, (s) => s.hrBpm);
  const powerW = optionalMean(samples, (s) => s.powerW);
  // The cadence section's own definition of "cadence while running", imported
  // rather than restated, so the lab cannot disagree with the cards above it
  // about which seconds counted as running.
  const cadenceSpm = optionalMean(samples, runningCadenceOf);

  return {
    index,
    startT: samples[0].t,
    endT: samples[samples.length - 1].t,
    startDistanceM: samples[0].distanceM,
    endDistanceM: samples[samples.length - 1].distanceM,
    seconds: samples.length,
    speedMps,
    // Below walking speed the reciprocal explodes, so it is left undefined
    // rather than printed as a four-figure pace.
    paceSecPerKm: speedMps !== undefined && speedMps > 0.5 ? 1000 / speedMps : undefined,
    hrBpm,
    powerW,
    cadenceSpm,
    gradientPct: optionalMean(samples, (s) => s.gradientPct),
    strideLengthM:
      speedMps !== undefined && cadenceSpm !== undefined && cadenceSpm > 0
        ? (speedMps * 60) / cadenceSpm
        : undefined,
    metresPerBeat:
      speedMps !== undefined && hrBpm !== undefined && hrBpm > 0
        ? (speedMps * 60) / hrBpm
        : undefined,
    wattsPerBeat:
      powerW !== undefined && hrBpm !== undefined && hrBpm > 0 ? powerW / hrBpm : undefined,
  };
}

/**
 * The run cut into stretches holding equal moving time.
 *
 * Equal moving time rather than equal distance, because the question these
 * cards ask is what happened to the runner as the effort went on, and a slow
 * kilometre costs more of that than a fast one.
 */
export function splitIntoSegments(
  activity: DerivedActivity,
  count: number,
  options: { warmupS?: number } = {},
): SegmentProfile[] {
  const moving = movingSamples(activity).slice(options.warmupS ?? 0);
  if (moving.length < count * MIN_SEGMENT_SECONDS) return [];

  const size = Math.floor(moving.length / count);
  const segments: SegmentProfile[] = [];
  for (let i = 0; i < count; i++) {
    const from = i * size;
    // The last stretch takes the remainder, so no moving second is dropped.
    const to = i === count - 1 ? moving.length : from + size;
    segments.push(profileOf(moving.slice(from, to), i + 1));
  }
  return segments;
}

/**
 * How much an efficiency figure fell between two stretches, as a percentage.
 *
 * Positive means the later stretch produced less movement for the same
 * heartbeat, which is the direction fatigue pushes it.
 */
export function decouplingPct(first: number, second: number): number {
  if (!Number.isFinite(first) || first === 0) return NaN;
  return ((first - second) / first) * 100;
}

/** The most a segment's average gradient may differ before terrain is the story. */
export const COMPARABLE_GRADIENT_PCT = NOISE_FLOOR.gradientPct;

/**
 * Whether the ground, rather than the runner, could account for a change.
 *
 * The test is deliberately one-sided. Steeper ground later in a run produces a
 * deterioration on its own, so a deterioration found there proves nothing —
 * but a deterioration found on *gentler* ground survives the terrain rather
 * than being created by it, and throwing that away would discard the strongest
 * case the card can make. The same asymmetry runs the other way for an
 * improvement, which easier ground would explain and harder ground would not.
 */
export function terrainConfounds(
  before: SegmentProfile,
  after: SegmentProfile,
  worsened: boolean,
): boolean {
  if (before.gradientPct === undefined || after.gradientPct === undefined) return false;
  const delta = after.gradientPct - before.gradientPct;
  if (Math.abs(delta) <= COMPARABLE_GRADIENT_PCT) return false;
  return worsened ? delta > 0 : delta < 0;
}

/** One metric's movement across a candidate change point. */
export interface SignalShift {
  metric: MetricType;
  label: string;
  before: number;
  after: number;
  /** After minus before, in the metric's own unit. */
  delta: number;
  /** How many times the metric's noise floor the movement is. */
  effect: number;
}

export interface ChangePoint {
  t: number;
  distanceM: number;
  /** Share of the run's moving time that had passed, 0–1. */
  fractionOfRun: number;
  before: SegmentProfile;
  after: SegmentProfile;
  /** Only the metrics that moved the way fatigue moves them. */
  shifts: SignalShift[];
  /** Average gradient after minus before, so the reader can check the ground. */
  gradientDeltaPct: number;
  /** Ranking score. Not a significance test — see `findFatigueOnset`. */
  strength: number;
}

/** Each metric, the direction fatigue pushes it, and what counts as movement. */
const FATIGUE_SIGNALS: {
  metric: MetricType;
  label: string;
  pick: (profile: SegmentProfile) => number | undefined;
  /** +1 when a rise means fatigue, −1 when a fall does. */
  direction: 1 | -1;
  /** Smallest movement worth reading, as an absolute or a share of `before`. */
  floor: (before: number) => number;
}[] = [
  {
    metric: "heartRate",
    label: "Heart rate",
    pick: (p) => p.hrBpm,
    direction: 1,
    floor: () => NOISE_FLOOR.hrBpm,
  },
  {
    metric: "pace",
    label: "Pace",
    pick: (p) => p.paceSecPerKm,
    direction: 1,
    floor: () => NOISE_FLOOR.paceSecPerKm,
  },
  {
    metric: "cadence",
    label: "Cadence",
    pick: (p) => p.cadenceSpm,
    direction: -1,
    floor: () => NOISE_FLOOR.cadenceSpm,
  },
  {
    metric: "power",
    label: "Power",
    pick: (p) => p.powerW,
    direction: -1,
    floor: (before) => (before * NOISE_FLOOR.powerPct) / 100,
  },
];

/** Both sides of a candidate split need this much running to be averaged. */
const MIN_SIDE_SECONDS = 240;
/**
 * Shorter than this and there is no onset to look for.
 *
 * Over half an hour of running, signals turning together is worth remarking on.
 * Over twenty minutes it is mostly the warm-up still finishing, and a card that
 * named a point anyway would name one on every run.
 */
const MIN_ONSET_MOVING_S = 1800;
/** The change point is looked for inside this share of the run's moving time. */
const SEARCH_FROM = 0.3;
const SEARCH_TO = 0.85;
/** Fewer than this many metrics agreeing is a coincidence, not an onset. */
const MIN_AGREEING_SIGNALS = 2;

/**
 * The point where the most signals started moving the way fatigue moves them.
 *
 * Every split of the run's moving time is tried, and each is scored by how many
 * of heart rate, pace, cadence and power moved past their own noise floor in
 * the fatiguing direction. Candidates where the ground got steeper afterwards
 * are thrown out entirely, because a climb produces exactly this pattern
 * without any fatigue at all.
 *
 * The tie-break between candidates with equal agreement is the size of the
 * movement, weighted towards the middle of the run the way a change-point
 * statistic is: a split two minutes from the end has almost no evidence behind
 * it, and would otherwise win simply by being extreme. This ranks candidates
 * against each other. It is not a test, and nothing here establishes that a
 * change occurred at all — which is why the card that uses it never claims
 * better than a possible explanation.
 */
export function findFatigueOnset(activity: DerivedActivity): ChangePoint | null {
  const moving = movingSamples(activity);
  const total = moving.length;
  if (total < Math.max(MIN_ONSET_MOVING_S, 2 * MIN_SIDE_SECONDS + MIN_SEGMENT_SECONDS)) {
    return null;
  }

  const lo = Math.max(MIN_SIDE_SECONDS, Math.floor(total * SEARCH_FROM));
  const hi = Math.min(total - MIN_SIDE_SECONDS, Math.floor(total * SEARCH_TO));
  if (hi <= lo) return null;

  const step = Math.max(5, Math.floor(total / 200));
  let best: ChangePoint | null = null;

  for (let i = lo; i <= hi; i += step) {
    const candidate = scoreSplit(moving, i, total);
    if (!candidate) continue;
    if (
      !best ||
      candidate.shifts.length > best.shifts.length ||
      (candidate.shifts.length === best.shifts.length && candidate.strength > best.strength)
    ) {
      best = candidate;
    }
  }

  if (!best || best.shifts.length < MIN_AGREEING_SIGNALS) return null;
  return best;
}

function scoreSplit(moving: Sample[], at: number, total: number): ChangePoint | null {
  const before = profileOf(moving.slice(0, at), 1);
  const after = profileOf(moving.slice(at), 2);

  const gradientDeltaPct = (after.gradientPct ?? 0) - (before.gradientPct ?? 0);
  // Steeper ground afterwards raises heart rate and slows pace by itself, so
  // this split cannot be read as anything the runner did.
  if (gradientDeltaPct > COMPARABLE_GRADIENT_PCT) return null;

  const shifts: SignalShift[] = [];
  for (const signal of FATIGUE_SIGNALS) {
    const from = signal.pick(before);
    const to = signal.pick(after);
    if (from === undefined || to === undefined) continue;

    const floor = signal.floor(from);
    if (floor <= 0) continue;
    const movement = signal.direction * (to - from);
    if (movement <= floor) continue;

    shifts.push({
      metric: signal.metric,
      label: signal.label,
      before: from,
      after: to,
      delta: to - from,
      effect: movement / floor,
    });
  }

  if (shifts.length === 0) return null;

  // The weight a two-sample comparison carries, which peaks at the middle of
  // the run and vanishes at either end.
  const balance = (at * (total - at)) / (total * total);
  const effect = shifts.reduce((acc, shift) => acc + shift.effect, 0);

  return {
    t: moving[at].t,
    distanceM: moving[at].distanceM,
    fractionOfRun: at / total,
    before,
    after,
    shifts,
    gradientDeltaPct,
    strength: effect * balance,
  };
}

/**
 * The published work this section borrows from.
 *
 * Held in one place so a paper is described the same way on every card that
 * leans on it, and so the list can be checked against the cards rather than
 * being scattered through them. The wording of each label is the finding as it
 * bears on the card — not a summary of the paper, which no one line could be.
 */
export const RESEARCH = {
  marathonDurability: {
    label:
      "Durability during a marathon, measured as heart-rate-to-speed decoupling alongside step frequency and step length, in 69 runners.",
    detail: "Journal of Sports Sciences, 2025",
    url: "https://doi.org/10.1080/02640414.2025.2567780",
  },
  halfMarathonMechanics: {
    label:
      "Ground-contact time and lower-limb mechanics changing from around 10 km onward, in 37 recreational runners over a half marathon.",
    detail: "European Journal of Sport Science, 2025",
    url: "https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsc.70069",
  },
  economyMetaAnalysis: {
    label:
      "Running biomechanics against running economy: vertical oscillation moderately associated with poorer economy, stride frequency only weakly with better, and individual measures explaining little of the variation between runners.",
    detail: "Sports Medicine, systematic review and meta-analysis, 2024",
    url: "https://link.springer.com/article/10.1007/s40279-024-01997-3",
  },
  watchAccuracy: {
    label:
      "82 Apple Watch validation studies across more than 430,000 participants: little average bias in heart rate, moderate accuracy in step counts, and considerably weaker energy-expenditure estimates.",
    detail: "Living systematic review and meta-analysis, 2026",
    url: "https://pubmed.ncbi.nlm.nih.gov/41513748/",
  },
  runningPower: {
    label: "Running power as the watch reports it — an estimate from motion, not a measurement.",
    detail: "Apple HealthKit developer documentation",
    url: "https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/runningpower",
  },
  imuSensorFusion: {
    label:
      "Minimal IMU configurations for running gait: a single lumbosacral sensor reconstructed cadence, vertical oscillation and ground-contact time well, but performed poorly for left–right asymmetry until sensors were added at both ankles.",
    detail: "Machine-learning sensor-fusion study, 2026",
    url: "https://pubmed.ncbi.nlm.nih.gov/41757318/",
  },
  groundContactEconomy: {
    label:
      "Ground-contact time and its imbalances against running economy — the relationship is not consistent enough across runners to read a shorter contact time as simply better.",
    detail: "PMC, 2020",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7241633/",
  },
  groundContactAchilles: {
    label:
      "Increasing ground-contact time reduced estimated peak Achilles tendon force and cumulative fatigue load in rearfoot-strike runners — evidence against reading a shorter contact time as simply better.",
    detail: "Drexel, Delaware and Pennsylvania, 2026",
    url: "https://researchdiscovery.drexel.edu/esploro/outputs/journalArticle/Increasing-ground-contact-time-reduces-Achilles/991022083455404721",
  },
} as const;

/**
 * A signed percentage, where a value too small to show loses its sign.
 *
 * The percentage sign takes no space before it, which is why this exists
 * alongside `formatSigned` rather than being a call to it.
 */
export function signedPct(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toFixed(digits)}%`;
}

/** The caveat every card in this section carries. */
export const LAB_IS_PROVISIONAL = {
  title: "What experimental means here",
  text: "These cards apply methods from recent running research to a single run from a consumer watch, which is not the setting those methods were validated in. The thresholds are judgement calls, the comparisons are against your own run rather than any reference population, and none of it is a measurement of fitness or a medical assessment. Read them as questions worth asking about the run, not as findings.",
};
