import { defineWidget } from "../contract";
import type { HrZone, Split } from "@/model/activity";
import { Legend } from "@/viz/primitives";
import { useSelectionStore } from "@/state/selectionStore";
import { NOISE_FLOOR, ZONE_COLORS } from "../helpers";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
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

    // The list is ordered by where each kilometre fell, but a reader still
    // reads the fastest one as the best. Where the terrain says otherwise, this
    // is the one place they are looking at both figures at once.
    const adjusted = result.splits.filter(
      (split) =>
        split.gradeAdjustedPaceSecPerKm !== undefined && !split.tags.includes("partial"),
    );
    if (adjusted.length >= 2 && fastest) {
      const strongest = adjusted.reduce((a, b) =>
        b.gradeAdjustedPaceSecPerKm! < a.gradeAdjustedPaceSecPerKm! ? b : a,
      );
      if (strongest.index !== fastest.index) {
        observations.push({
          text: `Kilometre ${strongest.index} was run harder than kilometre ${fastest.index}, despite being ${Math.round(strongest.paceSecPerKm - fastest.paceSecPerKm)} seconds per kilometre slower: on flat ground it would have been ${formatPaceWithUnit(strongest.gradeAdjustedPaceSecPerKm)}.`,
          evidence: [
            { label: `Kilometre ${strongest.index}`, startT: strongest.startT, endT: strongest.endT },
          ],
        });
      }
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
          text: "Splits are decided by where the run happened to start, not by where the effort changed. A kilometre that climbs thirty metres and one that descends thirty metres are not comparable at all, even though they sit next to each other in the list. Where a split carries a figure in brackets, that is the pace the same kilometre would have been on flat ground — which is how to compare two of them fairly.",
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

    const zonesShown = [
      ...new Set(result.splits.flatMap((s) => (s.dominantZone ? [s.dominantZone] : []))),
    ].sort() as HrZone[];

    return (
      <div>
        <ul className={styles.list}>
          {result.splits.map((split, index) => {
            const selected = highlight?.kind === "split" && highlight.index === split.index;
            const speedFraction = 1 - (split.paceSecPerKm - result.fastestPace) / span;

            return (
              <li
                key={split.index}
                // Its place in the list, which the stylesheet turns into the
                // order the bars fill in.
                style={{ "--item": Math.min(index, 12) } as React.CSSProperties}
              >
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
                      {/* Shown only where the ground actually moved the figure,
                          so a flat run does not carry a bracket on every row
                          repeating the pace beside it. */}
                      {split.gradeAdjustedPaceSecPerKm !== undefined &&
                        Math.abs(split.gradeAdjustedPaceSecPerKm - split.paceSecPerKm) >=
                          NOISE_FLOOR.paceSecPerKm &&
                        `(${formatPace(split.gradeAdjustedPaceSecPerKm)} flat) · `}
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

        <Legend
          label="Bar length shows pace · colour shows the split's main zone"
          items={
            zonesShown.length > 0
              ? [
                  ...zonesShown.map((zone) => ({
                    label: `Zone ${zone}`,
                    color: ZONE_COLORS[zone],
                  })),
                  ...(result.splits.some((s) => s.dominantZone === undefined)
                    ? [{ label: "No zone reading", color: "var(--metric-pace)" }]
                    : []),
                ]
              : [{ label: "Pace", color: "var(--metric-pace)" }]
          }
        />

        <p className={shared.note}>
          Bars are drawn between this run's fastest and slowest split rather than
          from zero, so a small spread still shows. The longest bar is the fastest
          kilometre, not the best one.
        </p>
      </div>
    );
  },
});

export default splitsWidget;
