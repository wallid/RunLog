import { defineWidget } from "../contract";
import type { Split } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import { ZONE_COLORS } from "../helpers";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPaceWithUnit,
} from "@/lib/format";
import shared from "../shared.module.css";
import styles from "./Splits.module.css";

/**
 * Each kilometre with the context that explains it.
 *
 * Splits are shown in the order they were run rather than ranked by speed,
 * because a ranking invites the reader to treat the slowest one as a failure
 * when it was usually a hill.
 */

interface Result {
  splits: Split[];
  fastestPace: number;
  slowestPace: number;
}

const TAG_LABELS: Record<string, string> = {
  fastest: "Fastest",
  slowest: "Slowest",
  climb: "Climb",
  descent: "Descent",
  recovery: "Recovery",
  stop: "Stop",
  finish: "Finish",
  partial: "Partial",
};

export const splitsWidget = defineWidget<Result>({
  id: "splits",
  title: "Kilometre splits",
  description: "Each kilometre, with what was happening in it.",
  section: "splits",
  requiredMetrics: ["distance", "pace"],

  compute(activity) {
    if (activity.splits.length < 2) return null;
    const paces = activity.splits.map((s) => s.paceSecPerKm);
    return {
      splits: activity.splits,
      fastestPace: Math.min(...paces),
      slowestPace: Math.max(...paces),
    };
  },

  narrate(result) {
    const slowest = result.splits.find((s) => s.tags.includes("slowest"));
    const fastest = result.splits.find((s) => s.tags.includes("fastest"));

    const observations = [];
    if (slowest && fastest) {
      observations.push({
        text: `Kilometre ${fastest.index} was the fastest at ${formatPaceWithUnit(fastest.paceSecPerKm)}, and kilometre ${slowest.index} the slowest at ${formatPaceWithUnit(slowest.paceSecPerKm)}.`,
        evidence: [
          { label: `Kilometre ${fastest.index}`, startT: fastest.startT, endT: fastest.endT },
          { label: `Kilometre ${slowest.index}`, startT: slowest.startT, endT: slowest.endT },
        ],
      });
    }

    const explanations = [];
    if (slowest) {
      const reasons: string[] = [];
      if (slowest.gainM >= 10) reasons.push(`it climbed ${formatElevation(slowest.gainM)}`);
      if (slowest.stoppedS >= 10) {
        reasons.push(`it included ${formatDuration(slowest.stoppedS)} stopped`);
      }
      if (slowest.avgHr !== undefined && fastest?.avgHr !== undefined) {
        const delta = slowest.avgHr - fastest.avgHr;
        if (delta >= 4) {
          reasons.push(`heart rate averaged ${Math.round(delta)} bpm higher than the fastest split`);
        }
      }

      explanations.push({
        text:
          reasons.length > 0
            ? `The slowest split is at least partly accounted for by its context: ${reasons.join(", and ")}.`
            : "Nothing in the terrain or the stopped time accounts for the slowest split, so effort or conditions are the likelier explanation.",
        confidence: reasons.length > 0 ? ("high" as const) : ("low" as const),
        relatedMetrics: ["pace" as const, "elevation" as const, "heartRate" as const],
      });
    }

    return {
      information: [
        { label: "Splits", value: `${result.splits.length}` },
        { label: "Fastest", value: formatPaceWithUnit(result.fastestPace) },
        { label: "Slowest", value: formatPaceWithUnit(result.slowestPace) },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "A slower split is not a worse split",
          text: "Splits are decided by where the run happened to start, not by where the effort changed. A kilometre that climbs thirty metres and one that descends thirty metres are not comparable at all, even though they sit next to each other in the list.",
        },
      ],
    };
  },

  View({ result }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    // Bar length is relative to the slowest split, so differences are visible
    // without the bars starting from an arbitrary zero.
    const span = Math.max(1, result.slowestPace - result.fastestPace);

    return (
      <ul className={styles.list}>
        {result.splits.map((split) => {
          const selected = highlight?.kind === "split" && highlight.index === split.index;
          const speedFraction = 1 - (split.paceSecPerKm - result.fastestPace) / span;

          return (
            <li key={split.index}>
              <button
                type="button"
                className={`${styles.split} ${selected ? styles.selected : ""}`}
                onClick={() =>
                  focusRegion(
                    split.startT,
                    split.endT,
                    { kind: "split", index: split.index },
                    "splits",
                  )
                }
                aria-pressed={selected}
              >
                <span className={`${styles.number} numeric`}>
                  {split.tags.includes("partial")
                    ? formatDistance(split.distanceM)
                    : `km ${split.index}`}
                </span>

                <span className={styles.barArea}>
                  <span className={styles.bar}>
                    <span
                      className={styles.barFill}
                      style={{
                        width: `${20 + speedFraction * 80}%`,
                        background: split.dominantZone
                          ? ZONE_COLORS[split.dominantZone]
                          : "var(--metric-pace)",
                      }}
                    />
                  </span>
                  <span className={styles.tags}>
                    {split.tags
                      .filter((tag) => tag !== "partial")
                      .map((tag) => (
                        <span key={tag} className={shared.tag}>
                          {TAG_LABELS[tag] ?? tag}
                        </span>
                      ))}
                  </span>
                </span>

                <span className={styles.figures}>
                  <span className={`${styles.pace} numeric`}>
                    {formatPaceWithUnit(split.paceSecPerKm)}
                  </span>
                  <span className={`${styles.detail} numeric`}>
                    {split.avgHr !== undefined && `${formatHeartRate(split.avgHr)}`}
                    {split.gainM >= 3 && ` · +${Math.round(split.gainM)} m`}
                    {split.stoppedS >= 5 && ` · ${formatDuration(split.stoppedS)} stopped`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  },
});

export default splitsWidget;
