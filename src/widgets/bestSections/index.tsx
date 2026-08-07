import { defineWidget } from "../contract";
import type { BestEffort } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import {
  formatDistanceShort,
  formatGradient,
  formatHeartRate,
  formatPaceWithUnit,
  formatPower,
} from "@/lib/format";
import shared from "../shared.module.css";
import styles from "./BestSections.module.css";

/**
 * The strongest sustained efforts, found by rolling window.
 *
 * Deliberately not a leaderboard: these are compared only against the rest of
 * this run, and the context of each one is shown so a fast section on a descent
 * is not mistaken for a breakthrough.
 */

interface Result {
  efforts: BestEffort[];
}

export const bestSectionsWidget = defineWidget<Result>({
  id: "best-sections",
  title: "Best sustained sections",
  description: "The strongest continuous efforts, wherever they happened to fall.",
  section: "splits",
  requiredMetrics: ["pace", "distance"],

  compute(activity) {
    const efforts = activity.summary.bestEfforts;
    if (efforts.length === 0) return null;
    return { efforts };
  },

  narrate(result, activity) {
    const kilometre = result.efforts.find((e) => e.kind === "distance" && e.window === 1000);
    const observations = [];

    if (kilometre) {
      const matchingSplit = activity.splits.reduce<{ split: (typeof activity.splits)[0] } | null>(
        (best, split) =>
          !best || split.paceSecPerKm < best.split.paceSecPerKm ? { split } : best,
        null,
      );

      observations.push({
        text: `The fastest continuous kilometre was ${formatPaceWithUnit(kilometre.paceSecPerKm)}, run between ${formatDistanceShort(kilometre.startDistanceM)} and ${formatDistanceShort(kilometre.endDistanceM)}.`,
        evidence: [
          { label: "Fastest kilometre", startT: kilometre.startT, endT: kilometre.endT },
        ],
      });

      if (matchingSplit) {
        const difference = matchingSplit.split.paceSecPerKm - kilometre.paceSecPerKm;
        if (difference > 3) {
          observations.push({
            text: `That is ${Math.round(difference)} seconds per kilometre quicker than the fastest split, because it was not restricted to starting on a kilometre marker.`,
          });
        }
      }
    }

    const explanations = [];
    if (kilometre && Math.abs(kilometre.avgGradientPct) >= 1) {
      explanations.push({
        text: `That section averaged ${formatGradient(kilometre.avgGradientPct)}, so ${kilometre.avgGradientPct < 0 ? "the descent helped" : "it was run on rising ground"}.`,
        confidence: "high" as const,
        relatedMetrics: ["pace" as const, "gradient" as const],
      });
    }

    return {
      information: result.efforts.slice(0, 4).map((effort) => ({
        label: effort.label.replace("Fastest ", ""),
        value: formatPaceWithUnit(effort.paceSecPerKm),
      })),
      observations,
      explanations,
      teaching: [
        {
          title: "Why rolling efforts beat splits",
          text: "A kilometre split starts wherever the previous one ended, which has nothing to do with where you actually ran hardest. A rolling window slides across the whole run and finds the genuine best stretch, which is usually faster than any split and rarely lines up with one.",
        },
      ],
    };
  },

  View({ result }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    return (
      <ul className={styles.list}>
        {result.efforts.map((effort) => {
          const selected = highlight?.kind === "event" && highlight.eventId === effort.id;
          return (
            <li key={effort.id}>
              <button
                type="button"
                className={`${styles.effort} ${selected ? styles.selected : ""}`}
                onClick={() =>
                  focusRegion(
                    effort.startT,
                    effort.endT,
                    { kind: "event", eventId: effort.id },
                    "best-sections",
                  )
                }
                aria-pressed={selected}
              >
                <span className={styles.label}>{effort.label}</span>
                <span className={`${styles.pace} numeric`}>
                  {formatPaceWithUnit(effort.paceSecPerKm)}
                </span>
                <span className={`${styles.context} numeric`}>
                  from {formatDistanceShort(effort.startDistanceM)}
                  {effort.avgHr !== undefined && ` · ${formatHeartRate(effort.avgHr)}`}
                  {effort.avgPowerW !== undefined && ` · ${formatPower(effort.avgPowerW)}`}
                  {Math.abs(effort.avgGradientPct) >= 1 &&
                    ` · ${formatGradient(effort.avgGradientPct)}`}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <p className={shared.note}>
            These are the best efforts within this run only. Windows containing more than
            five seconds of stopped time are excluded.
          </p>
        </li>
      </ul>
    );
  },
});

export default bestSectionsWidget;
