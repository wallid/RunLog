import { defineWidget } from "../contract";
import { HeroFigure } from "@/viz/primitives";
import { Track } from "@/viz/Track";
import {
  formatCadence,
  formatDistanceShort,
  formatDuration,
  formatHeartRate,
  formatPaceWithUnit,
  formatPower,
} from "@/lib/format";
import { listPhrase } from "../helpers";
import type { MetricType } from "@/model/activity";
import {
  findFatigueOnset,
  LAB_IS_PROVISIONAL,
  RESEARCH,
  type ChangePoint,
  type SignalShift,
} from "../labHelpers";
import shared from "../shared.module.css";
import styles from "./styles.module.css";

/**
 * Where several signals started changing at once.
 *
 * No single metric says a runner tired. Heart rate climbs on a warm day, pace
 * drops on a hill, cadence falls when a stride lengthens downhill — each has an
 * innocent reading on its own. What is harder to explain away is four of them
 * moving the same way from the same point, on ground that did not change.
 *
 * So this card does not detect fatigue. It searches every way of cutting the
 * run in two, discards the cuts where the ground got steeper afterwards, and
 * reports the cut where the most signals agree. Naming the location is the
 * useful part; the cause stays an open question, and the narration keeps it
 * that way.
 */

interface Result {
  onset: ChangePoint;
  /** Which metrics the file could have shown, agreeing or not. */
  metricsWatched: number;
}

/** The signals this card can watch, when the file happens to carry them. */
const WATCHABLE: MetricType[] = ["heartRate", "pace", "cadence", "power"];

export const fatigueOnsetWidget = defineWidget<Result>({
  id: "fatigue-onset",
  title: "Fatigue onset",
  description:
    "The point in the run where the most signals began moving the way fatigue moves them, on ground that did not change.",
  section: "lab",
  status: "beta",
  requiredMetrics: ["heartRate", "pace"],
  // The onset is the best of many candidate split points, found by search.
  // Nothing recorded it.
  provenance: "estimated",
  references: [
    RESEARCH.halfMarathonMechanics,
    RESEARCH.marathonDurability,
  ],

  compute(activity) {
    const onset = findFatigueOnset(activity);
    if (!onset) return null;

    return {
      onset,
      metricsWatched: WATCHABLE.filter((metric) => activity.availableMetrics.has(metric))
        .length,
    };
  },

  narrate(result, activity) {
    const { onset, metricsWatched } = result;
    const moved = listPhrase(onset.shifts.map((shift) => shift.label.toLowerCase()));
    const strong = onset.shifts.length >= 3;

    return {
      information: [
        { label: "Possible onset", value: formatDistanceShort(onset.distanceM) },
        { label: "Elapsed", value: formatDuration(onset.t) },
        {
          label: "Signals agreeing",
          value: `${onset.shifts.length} of ${metricsWatched}`,
        },
      ],

      observations: [
        {
          text: `From ${formatDistanceShort(onset.distanceM)}, ${onset.shifts.length} of the ${metricsWatched} signals this file carries moved the way fatigue moves them: ${moved}.`,
          evidence: [
            { label: "Before", startT: onset.before.startT, endT: onset.before.endT },
            { label: "After", startT: onset.after.startT, endT: onset.after.endT },
          ],
        },
        {
          text: `Average gradient was ${onset.before.gradientPct?.toFixed(1) ?? "0.0"}% before that point and ${onset.after.gradientPct?.toFixed(1) ?? "0.0"}% after, so the ground was not what changed.`,
        },
      ],

      explanations: [
        {
          text: strong
            ? `With ${onset.shifts.length} signals turning together on unchanged ground, something about the run altered around ${formatDistanceShort(onset.distanceM)}. Accumulating fatigue is the most common reason, though heat, fuelling, a change in surface, or simply deciding to ease off produce the same pattern and cannot be told apart from it here.`
            : `Two signals moved together, which is the least this card will report. That is weak evidence on its own — two metrics drifting the same way for ${formatDuration(activity.elapsedS - onset.t)} of running can happen without anything having changed.`,
          // Never high: this is a search over many splits, and the winner is
          // the best of them rather than a point shown to be a change.
          confidence: strong ? "medium" : "low",
          relatedMetrics: onset.shifts.map((shift) => shift.metric),
        },
      ],

      teaching: [
        {
          title: "Why one metric is never enough",
          text: "Every signal a watch records has an innocent explanation for moving. Heart rate rises with heat and with dehydration, pace falls on a rise you barely noticed, cadence drops when a stride opens up downhill. Reading fatigue off any one of them produces a story on almost every run. Requiring several to move together, and throwing out the stretches where the terrain moved too, is what makes the claim worth anything.",
        },
        {
          title: "A location, not a diagnosis",
          text: "This card names a point and says which measurements changed there. It does not establish that a change happened at all: it searches many possible cut points and reports the best-supported one, which is not the same as testing whether that one is real. Treat it as somewhere in the run worth thinking back to — did something change in how it felt around there — rather than as a finding.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result, activity }) {
    const { onset } = result;
    const last = activity.samples[activity.samples.length - 1]?.t ?? onset.t;

    return (
      <div>
        <HeroFigure
          value={formatDistanceShort(onset.distanceM)}
          caption={`${onset.shifts.length} signals began moving together here`}
          tone="cautious"
        />

        <p className={styles.marker}>Where it sits in the run</p>
        <Track
          activity={activity}
          height={34}
          widgetId="fatigue-onset"
          showAxis
          ariaLabel={`The run, with a possible fatigue onset marked at ${formatDistanceShort(onset.distanceM)}`}
          regions={[
            {
              startT: 0,
              endT: onset.t,
              color: "var(--zone-2-soft)",
              label: "Before",
              behind: true,
            },
            {
              startT: onset.t,
              endT: last,
              color: "var(--zone-4-soft)",
              label: "After",
              behind: true,
            },
          ]}
          markers={[{ t: onset.t, label: "Possible onset", color: "var(--zone-5)" }]}
        >
          {() => null}
        </Track>

        <div className={styles.table}>
          <span className={styles.head}>Signal</span>
          <span className={styles.headRight}>Before</span>
          <span className={styles.headRight}>After</span>
          <span className={styles.headRight}>Change</span>

          {onset.shifts.map((shift) => (
            <FragmentRow key={shift.metric} shift={shift} />
          ))}
        </div>

        <p className={shared.note}>
          The two stretches are everything before and everything after that
          point, counting moving seconds only.
        </p>
      </div>
    );
  },
});

/** How each signal is written, in its own unit. */
const UNITS: Partial<
  Record<MetricType, { level: (value: number) => string; delta: string }>
> = {
  heartRate: { level: formatHeartRate, delta: "bpm" },
  pace: { level: formatPaceWithUnit, delta: "s/km" },
  cadence: { level: formatCadence, delta: "spm" },
  power: { level: formatPower, delta: "W" },
};

/** One metric's row of the before-and-after table. */
function FragmentRow({ shift }: { shift: SignalShift }) {
  const unit = UNITS[shift.metric];
  const level = unit ? unit.level : (value: number) => value.toFixed(0);

  return (
    <>
      <span className={styles.metric}>{shift.label}</span>
      <span className={`${styles.value} numeric`}>{level(shift.before)}</span>
      <span className={`${styles.after} numeric`}>{level(shift.after)}</span>
      <span className={`${styles.delta} numeric`}>
        {shift.delta >= 0 ? "+" : "−"}
        {Math.round(Math.abs(shift.delta))} {unit?.delta ?? ""}
      </span>
    </>
  );
}

export default fatigueOnsetWidget;
