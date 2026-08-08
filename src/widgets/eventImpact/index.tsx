import { defineWidget } from "../contract";
import { Legend } from "@/viz/primitives";
import { Track } from "@/viz/Track";
import { distanceAtTime } from "@/model/activity";
import { kindSpec } from "@/model/annotations";
import {
  formatDistanceShort,
  formatDuration,
  formatHeartRate,
  formatPaceDelta,
  formatPaceWithUnit,
} from "@/lib/format";
import { ANNOTATION_COLOR, annotationMarkers, NOISE_FLOOR } from "../helpers";
import { analyzeAnnotations, type EventImpact } from "./analysis";
import shared from "../shared.module.css";
import styles from "./EventImpact.module.css";

/**
 * What happened after the things the runner added themselves.
 *
 * A watch cannot know a gel was taken; a runner cannot know what their pace did
 * for the quarter of an hour afterwards. This card is the join: for every
 * fuelling event the reader has marked, it reads the running in the window
 * where an effect would show and compares it with the running just before.
 *
 * It is an association and says so everywhere. The windows come from how long
 * each form of carbohydrate takes to reach the blood, which makes the timing
 * meaningful, but a single run cannot separate the gel from the decision to
 * push, the hill that ended, or simply feeling better. Events with no honest
 * window to look in — a cramp, a stop to fix a shoe — are marked on the charts
 * and left out of this card entirely rather than scored.
 */

interface Result {
  impacts: EventImpact[];
  /** Everything the reader added, including the kinds not scored here. */
  totalAnnotations: number;
}

/**
 * The two stretches being compared, as washes.
 *
 * Neutral tints rather than the zone bands: these are two windows of the clock,
 * not two levels of effort, and painting the later one in the hard wash would
 * assert the very thing the card is trying to find out.
 */
const BEFORE_COLOR = "var(--surface-inset)";
const AFTER_COLOR = "var(--accent-soft)";

export const eventImpactWidget = defineWidget<Result>({
  id: "event-impact",
  title: "Event impact",
  description:
    "For each fuelling event you added, what the running looked like in the window afterwards against the stretch just before it.",
  section: "insight",
  status: "beta",
  // The pace figures are grade-adjusted wherever the run allows it, which puts
  // a model between the recording and the number.
  provenance: "estimated",
  requiredMetrics: ["time", "distance", "pace"],
  references: [
    {
      label:
        "Carbohydrate intake during exercise: how much can be absorbed and used, and how quickly.",
      detail: "Sports Medicine, review, 2014",
      url: "https://link.springer.com/article/10.1007/s40279-014-0148-z",
    },
  ],

  compute(activity) {
    const annotations = activity.annotations ?? [];
    if (annotations.length === 0) return null;
    const impacts = analyzeAnnotations(activity);
    if (impacts.length === 0) return null;
    return { impacts, totalAnnotations: annotations.length };
  },

  narrate(result, activity) {
    const { impacts, totalAnnotations } = result;

    const information = [
      { label: "Events noted", value: String(totalAnnotations) },
      {
        label: "Compared here",
        value: String(impacts.length),
        note:
          impacts.length < totalAnnotations
            ? "the rest have no window worth reading"
            : undefined,
      },
    ];

    const observations = impacts.map((impact) => {
      const where = formatDistanceShort(
        distanceAtTime(activity, impact.annotation.t),
      );
      const label = (kindSpec(impact.annotation.kind)?.label ?? "event").toLowerCase();
      const paceKind = impact.usedGradeAdjusted ? "grade-adjusted pace" : "pace";
      const minutes = `${Math.round((impact.after.startT - impact.annotation.t) / 60)} to ${Math.round(
        (impact.after.endT - impact.annotation.t) / 60,
      )}`;

      const text = impact.paceWithinNoise
        ? `Between ${minutes} minutes after your ${label} at ${where}, ${paceKind} was within ${NOISE_FLOOR.paceSecPerKm} seconds per kilometre of the stretch before it, which is inside the noise of the recording.`
        : `Between ${minutes} minutes after your ${label} at ${where}, ${paceKind} averaged ${formatPaceWithUnit(impact.after.paceSecPerKm)} — ${formatPaceDelta(impact.paceDeltaSecPerKm ?? 0)} ${(impact.paceDeltaSecPerKm ?? 0) < 0 ? "faster" : "slower"} than the five minutes before it.${
            impact.hrWithinNoise || impact.hrDeltaBpm === undefined
              ? ""
              : ` Heart rate was ${formatHeartRate(Math.abs(impact.hrDeltaBpm))} ${impact.hrDeltaBpm > 0 ? "higher" : "lower"}.`
          }`;

      return {
        text,
        evidence: [
          { label: "Before", startT: impact.before.startT, endT: impact.before.endT },
          { label: "After", startT: impact.after.startT, endT: impact.after.endT },
        ],
      };
    });

    const moved = impacts.filter((impact) => !impact.paceWithinNoise);
    const explanations = [
      {
        text:
          moved.length === 0
            ? "Nothing here moved more than the recording's own noise, which is the most common outcome and not a verdict on the fuelling. A gel that keeps you at the pace you were already holding, late in a run, has done its job without showing up as a change."
            : "The windows are set to where carbohydrate would be expected to act — roughly ten to twenty minutes after a gel — so the timing is at least consistent with the fuelling. It is not evidence of it: one run has no control, and a decision to push, a hill ending, or simply feeling better produce exactly this pattern.",
        // Never above medium. The card compares one runner with themselves,
        // minutes apart, on ground and in weather that were also changing.
        confidence: worstConfidence(impacts),
        relatedMetrics: ["pace" as const, "heartRate" as const],
      },
    ];

    const caveats = [...new Set(impacts.flatMap((impact) => impact.caveats))];
    if (caveats.length > 0) {
      explanations.push({
        text: `Some of these comparisons are weaker than others. ${caveats.join(" ")}`,
        confidence: "low" as const,
        relatedMetrics: ["pace" as const],
      });
    }

    return {
      information,
      observations,
      explanations,
      teaching: [
        {
          title: "Why the window starts minutes later",
          text: "Carbohydrate taken during a run does not act on contact. A gel has to leave the stomach, be absorbed in the small intestine and reach the blood, which usually takes ten to twenty minutes; a drink is a little quicker and solid food notably slower. Comparing the minute after a gel with the minute before it would measure the swallowing, not the fuel, which is why each kind of event here is read at its own delay.",
        },
        {
          title: "Association, not cause",
          text: "This card puts two things next to each other: something you told it, and something the watch recorded afterwards. It cannot say one caused the other, and a single run never could — there is no version of the same run without the gel to compare against. Read it across several runs instead. If the same pattern shows up every time you fuel at the same point, that is worth something; once is a coincidence with a good story attached.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const { impacts } = result;

    return (
      <div>
        <p className={shared.trackLabel}>Where they sit in the run</p>
        <Track
          activity={activity}
          height={34}
          widgetId="event-impact"
          showAxis
          ariaLabel="The run, with the events you added marked on it"
          markers={annotationMarkers(activity)}
          regions={impacts.flatMap((impact) => [
            {
              startT: impact.before.startT,
              endT: impact.before.endT,
              color: BEFORE_COLOR,
              label: "Before",
              behind: true,
            },
            {
              startT: impact.after.startT,
              endT: impact.after.endT,
              color: AFTER_COLOR,
              label: "After",
              behind: true,
            },
          ])}
        >
          {() => null}
        </Track>

        <Legend
          items={[
            { label: "Before", color: BEFORE_COLOR },
            { label: "After", color: AFTER_COLOR },
            { label: "Your events", color: ANNOTATION_COLOR, shape: "dashed" },
          ]}
        />

        <div className={styles.table}>
          <span className={styles.head}>Event</span>
          <span className={styles.headRight}>Before</span>
          <span className={styles.headRight}>After</span>
          <span className={styles.headRight}>Change</span>

          {impacts.map((impact) => (
            <ImpactRow key={impact.annotation.id} impact={impact} activity={activity} />
          ))}
        </div>

        <p className={shared.note}>
          Each pair is the five minutes before the event against the window
          afterwards where its effect would show, counting moving seconds only.
          {impacts.some((impact) => impact.usedGradeAdjusted)
            ? " Pace has the gradient taken out of it where this run recorded enough elevation to do so."
            : ""}
        </p>
      </div>
    );
  },
});

/** One event's row of the before-and-after table. */
function ImpactRow({
  impact,
  activity,
}: {
  impact: EventImpact;
  activity: Parameters<typeof distanceAtTime>[0];
}) {
  const label = kindSpec(impact.annotation.kind)?.label ?? "Event";
  const where = formatDistanceShort(distanceAtTime(activity, impact.annotation.t));

  return (
    <>
      <span className={styles.event}>
        {label}
        <span className={styles.where}>
          {where} · {formatDuration(impact.annotation.t)}
        </span>
      </span>
      <span className={`${styles.value} numeric`}>
        {formatPaceWithUnit(impact.before.paceSecPerKm)}
      </span>
      <span className={`${styles.after} numeric`}>
        {formatPaceWithUnit(impact.after.paceSecPerKm)}
      </span>
      <span className={`${styles.delta} numeric`}>
        {impact.paceWithinNoise || impact.paceDeltaSecPerKm === undefined
          ? "No change"
          : `${impact.paceDeltaSecPerKm < 0 ? "−" : "+"}${Math.round(Math.abs(impact.paceDeltaSecPerKm))} s/km`}
      </span>
    </>
  );
}

/** The card speaks at the level of its weakest comparison. */
function worstConfidence(impacts: EventImpact[]): "medium" | "low" {
  return impacts.some((impact) => impact.confidence === "low") ? "low" : "medium";
}

export default eventImpactWidget;
