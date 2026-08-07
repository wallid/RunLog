import { defineWidget } from "../contract";
import type { StoryMoment } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import { formatDistanceShort, formatDuration } from "@/lib/format";
import styles from "./StoryMoments.module.css";

/**
 * The few moments the rest of the page explains.
 *
 * Presented as a numbered narrative rather than a list of findings, because the
 * order they happened in is part of what makes a run understandable. Selecting
 * one moves the whole page to it.
 */

interface Result {
  moments: StoryMoment[];
}

export const storyMomentsWidget = defineWidget<Result>({
  id: "story-moments",
  title: "The story of this run",
  description: "The moments worth looking at, in the order they happened.",
  section: "story",
  requiredMetrics: ["time", "distance"],

  compute(activity) {
    if (activity.moments.length === 0) return null;
    return { moments: activity.moments };
  },

  narrate(result, activity) {
    const withEvents = result.moments.filter((m) => m.eventId !== undefined);
    const uncertain = result.moments.filter((m) => m.confidence === "low");

    return {
      information: [
        { label: "Moments found", value: `${result.moments.length}` },
        {
          label: "Run covered",
          value: `${formatDistanceShort(activity.distanceM)} in ${formatDuration(activity.elapsedS)}`,
        },
      ],
      observations: [
        {
          text:
            withEvents.length > 0
              ? `${withEvents.length} of these moments came from a detected change in the data; the rest describe the shape of the run.`
              : "Nothing in this run departed far enough from the rest of it to stand out as a distinct event, so these moments describe its overall shape.",
        },
      ],
      explanations: uncertain.length
        ? [
            {
              text: `${uncertain.length === 1 ? "One moment is" : `${uncertain.length} moments are`} marked as uncertain because the available data supports more than one reading.`,
              confidence: "low" as const,
              relatedMetrics: [],
            },
          ]
        : [],
      teaching: [
        {
          title: "Why moments rather than metrics",
          text: "A single metric rarely explains anything on its own. These moments were chosen by looking for places where several metrics moved together, or where one departed clearly from the rest of the run. That is usually where the interesting part of a run lives.",
        },
      ],
    };
  },

  View({ result }) {
    const highlight = useSelectionStore((state) => state.highlight);
    const focusRegion = useSelectionStore((state) => state.focusRegion);

    return (
      <ol className={styles.list}>
        {result.moments.map((moment) => {
          const selected =
            highlight?.kind === "moment" && highlight.momentId === moment.id;
          return (
            <li key={moment.id} className={styles.item}>
              <button
                type="button"
                className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
                onClick={() =>
                  focusRegion(
                    moment.startT,
                    moment.endT,
                    { kind: "moment", momentId: moment.id },
                    "story-moments",
                  )
                }
                aria-pressed={selected}
              >
                <span className={styles.marker} aria-hidden="true">
                  {moment.order}
                </span>
                <span className={styles.body}>
                  <span className={styles.label}>
                    {moment.label}
                    {moment.confidence === "low" && (
                      <span className={styles.uncertain}>uncertain</span>
                    )}
                  </span>
                  <span className={styles.description}>{moment.description}</span>
                  <span className={`${styles.position} numeric`}>
                    {formatDistanceShort(moment.startDistanceM)} ·{" "}
                    {formatDuration(moment.startT)} into the run
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    );
  },
});

export default storyMomentsWidget;
