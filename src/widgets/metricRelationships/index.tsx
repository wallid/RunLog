import { defineWidget } from "../contract";
import type { ActivityEvent, Confidence, DerivedActivity, MetricType } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import { NOISE_FLOOR, listPhrase } from "../helpers";
import { collect, mean } from "@/lib/stats";
import { formatDistanceShort } from "@/lib/format";
import shared from "../shared.module.css";
import styles from "./MetricRelationships.module.css";

/**
 * Which metrics moved together, and in which direction.
 *
 * Each event is compared against the minute before it, so the changes shown are
 * departures from what the runner was already doing rather than from the run
 * average. Confidence rises only when several metrics move at once, because a
 * single metric shifting is usually noise.
 */

interface Change {
  metric: MetricType;
  label: string;
  direction: "up" | "down";
  amount: string;
}

interface Relationship {
  eventId: string;
  label: string;
  startT: number;
  endT: number;
  startDistanceM: number;
  changes: Change[];
  confidence: Confidence;
  summary: string;
}

interface Result {
  relationships: Relationship[];
}

/** The baseline is the minute of running immediately before the event. */
const BASELINE_S = 60;

/**
 * The metric each kind of event is defined by.
 *
 * These cannot count towards the event being corroborated, because the detector
 * found the event by looking at them. A climb whose gradient rose has told you
 * nothing you did not already know from calling it a climb.
 */
const DEFINING_METRIC: Partial<Record<ActivityEvent["type"], MetricType>> = {
  climb: "gradient",
  descent: "gradient",
  stop: "pace",
  walk: "pace",
  fastStart: "pace",
  strongFinish: "pace",
};

export const metricRelationshipsWidget = defineWidget<Result>({
  id: "metric-relationships",
  title: "What moved together",
  description: "The metrics that changed at the same time, and what that suggests.",
  section: "insight",
  status: "beta",
  requiredMetrics: ["time"],

  compute(activity) {
    const interesting = activity.events.filter((event) =>
      ["climb", "descent", "stop", "fastStart", "strongFinish", "walk"].includes(event.type),
    );

    const relationships = interesting
      .map((event) => buildRelationship(activity, event))
      .filter((relationship): relationship is Relationship => relationship !== null);

    if (relationships.length === 0) return null;
    return { relationships };
  },

  narrate(result) {
    const strongest = result.relationships.reduce((a, b) =>
      b.changes.length > a.changes.length ? b : a,
    );

    return {
      information: [
        { label: "Moments compared", value: `${result.relationships.length}` },
        {
          label: "Most metrics moving",
          value: `${strongest.changes.length}`,
          note: strongest.label,
        },
      ],
      observations: [
        {
          text: `${strongest.changes.length} metrics changed together during the ${strongest.label.toLowerCase()} at ${formatDistanceShort(strongest.startDistanceM)}.`,
          evidence: [
            { label: strongest.label, startT: strongest.startT, endT: strongest.endT },
          ],
        },
      ],
      explanations: [
        {
          text: strongest.summary,
          confidence: strongest.confidence,
          relatedMetrics: strongest.changes.map((change) => change.metric),
        },
      ],
      teaching: [
        {
          title: "Together is not because",
          text: "Metrics changing at the same moment does not prove one caused another — a hill, a headwind and a decision to push all produce similar patterns. What aligned changes do give you is context: they narrow down which explanations are worth considering.",
        },
      ],
    };
  },

  View({ result }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    return (
      <ul className={styles.list}>
        {result.relationships.map((relationship) => {
          const selected =
            highlight?.kind === "event" && highlight.eventId === relationship.eventId;
          return (
            <li key={relationship.eventId}>
              <button
                type="button"
                className={`${styles.card} ${selected ? styles.selected : ""}`}
                onClick={() =>
                  focusRegion(
                    relationship.startT,
                    relationship.endT,
                    { kind: "event", eventId: relationship.eventId },
                    "metric-relationships",
                  )
                }
                aria-pressed={selected}
              >
                <span className={styles.head}>
                  <strong>{relationship.label}</strong>
                  <span className={`${styles.at} numeric`}>
                    {formatDistanceShort(relationship.startDistanceM)}
                  </span>
                </span>

                <span className={styles.changes}>
                  {relationship.changes.map((change) => (
                    <span key={change.metric} className={styles.change}>
                      <span className={styles.changeLabel}>{change.label}</span>
                      <span
                        className={`${styles.arrow} ${change.direction === "up" ? styles.up : styles.down}`}
                        aria-hidden="true"
                      >
                        {change.direction === "up" ? "↑" : "↓"}
                      </span>
                      <span className={`${styles.amount} numeric`}>{change.amount}</span>
                    </span>
                  ))}
                </span>

                <span className={styles.summary}>{relationship.summary}</span>
              </button>
            </li>
          );
        })}
        <li>
          <p className={shared.note}>
            Each moment is compared against the minute of running immediately before it.
          </p>
        </li>
      </ul>
    );
  },
});

function buildRelationship(
  activity: DerivedActivity,
  event: ActivityEvent,
): Relationship | null {
  const during = activity.samples.filter((s) => s.t >= event.startT && s.t <= event.endT);
  const before = activity.samples.filter(
    (s) => s.t >= event.startT - BASELINE_S && s.t < event.startT,
  );
  if (during.length < 5 || before.length < 15) return null;

  const changes: Change[] = [];

  const paceBefore = averageOf(before, (s) => s.paceSecPerKm);
  const paceDuring = averageOf(during, (s) => s.paceSecPerKm);
  if (paceBefore !== undefined && paceDuring !== undefined) {
    const delta = paceDuring - paceBefore;
    if (Math.abs(delta) >= NOISE_FLOOR.paceSecPerKm) {
      changes.push({
        metric: "pace",
        label: "Pace",
        // A larger seconds-per-kilometre figure means slower, so the arrow flips.
        direction: delta > 0 ? "down" : "up",
        amount: `${Math.abs(Math.round(delta))} s/km`,
      });
    }
  }

  const hrBefore = averageOf(before, (s) => s.hrBpm);
  const hrDuring = averageOf(during, (s) => s.hrBpm);
  if (hrBefore !== undefined && hrDuring !== undefined) {
    const delta = hrDuring - hrBefore;
    if (Math.abs(delta) >= NOISE_FLOOR.hrBpm) {
      changes.push({
        metric: "heartRate",
        label: "Heart rate",
        direction: delta > 0 ? "up" : "down",
        amount: `${Math.abs(Math.round(delta))} bpm`,
      });
    }
  }

  const powerBefore = averageOf(before, (s) => s.powerW);
  const powerDuring = averageOf(during, (s) => s.powerW);
  if (powerBefore !== undefined && powerDuring !== undefined && powerBefore > 0) {
    const deltaPct = ((powerDuring - powerBefore) / powerBefore) * 100;
    if (Math.abs(deltaPct) >= NOISE_FLOOR.powerPct) {
      changes.push({
        metric: "power",
        label: "Power",
        direction: deltaPct > 0 ? "up" : "down",
        amount: `${Math.abs(Math.round(powerDuring - powerBefore))} W`,
      });
    }
  }

  const cadenceBefore = averageOf(before, (s) => s.cadenceSpm);
  const cadenceDuring = averageOf(during, (s) => s.cadenceSpm);
  if (cadenceBefore !== undefined && cadenceDuring !== undefined) {
    const delta = cadenceDuring - cadenceBefore;
    if (Math.abs(delta) >= NOISE_FLOOR.cadenceSpm) {
      changes.push({
        metric: "cadence",
        label: "Cadence",
        direction: delta > 0 ? "up" : "down",
        amount: `${Math.abs(Math.round(delta))} spm`,
      });
    }
  }

  const gradientBefore = averageOf(before, (s) => s.gradientPct);
  const gradientDuring = averageOf(during, (s) => s.gradientPct);
  if (gradientBefore !== undefined && gradientDuring !== undefined) {
    const delta = gradientDuring - gradientBefore;
    if (Math.abs(delta) >= NOISE_FLOOR.gradientPct) {
      changes.push({
        metric: "gradient",
        label: "Gradient",
        direction: delta > 0 ? "up" : "down",
        amount: `${Math.abs(delta).toFixed(1)}%`,
      });
    }
  }

  if (changes.length === 0) return null;

  // Confidence counts only the metrics that were free to disagree. A climb is
  // defined by its gradient and a fast start by its pace, so finding those
  // moved during them is not corroboration — it is the detector's own input
  // handed back, and counting it would push almost every event to "high".
  const corroborating = changes.filter(
    (change) => change.metric !== DEFINING_METRIC[event.type],
  ).length;

  // One metric moving is within the noise of consumer sensors; two or more
  // moving together is a pattern worth naming.
  const confidence: Confidence =
    corroborating >= 3 ? "high" : corroborating === 2 ? "medium" : "low";

  return {
    eventId: event.id,
    label: event.label,
    startT: event.startT,
    endT: event.endT,
    startDistanceM: event.startDistanceM,
    changes,
    confidence,
    summary: summarise(event, changes),
  };
}

function summarise(event: ActivityEvent, changes: Change[]): string {
  const names = listPhrase(
    changes.map((change) => `${change.label.toLowerCase()} ${change.direction === "up" ? "rose" : "fell"}`),
  );

  switch (event.type) {
    case "climb":
      return `As the ground rose, ${names}. Terrain is the most likely account of this pattern.`;
    case "descent":
      return `On falling ground, ${names}. Gravity accounts for most of a pattern like this.`;
    case "stop":
      return `While stopped, ${names}, which is what standing still produces.`;
    case "fastStart":
      return `Through the opening, ${names} relative to what followed.`;
    case "strongFinish":
      return `Over the closing stretch, ${names}, which suggests a deliberate effort rather than terrain.`;
    default:
      return `During this section, ${names}.`;
  }
}

function averageOf<T>(items: T[], pick: (item: T) => number | undefined): number | undefined {
  const values = collect(items, pick);
  return values.length >= 3 ? mean(values) : undefined;
}

export default metricRelationshipsWidget;
