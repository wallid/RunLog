import { defineWidget } from "../contract";
import type { HrZone } from "@/model/activity";
import { Track, type TrackRegion } from "@/viz/Track";
import { Legend } from "@/viz/primitives";
import { useSelectionStore } from "@/state/selectionStore";
import { findRuns, ZONE_COLORS, type Run } from "../helpers";
import { formatDistanceShort, formatDuration, formatDurationWords } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * When the run entered and left each zone.
 *
 * The bubbles say how much; this says when. Together they answer the question a
 * zone breakdown usually leaves open: was the hard part one sustained effort or
 * several short ones?
 */

interface Result {
  runs: Run<HrZone>[];
  longest: Run<HrZone>;
  transitions: number;
}

/** Zone flickering across a boundary is noise, not a change of effort. */
const MIN_MEANINGFUL_RUN_S = 20;

export const zoneTimelineWidget = defineWidget<Result>({
  id: "zone-timeline",
  title: "Zone timeline",
  description: "How effort moved between zones as the run went on.",
  section: "heart",
  requiredMetrics: ["hrZone"],

  compute(activity) {
    const runs = findRuns(activity.samples, (s) => s.hrZone);
    if (runs.length === 0) return null;

    const meaningful = runs.filter((run) => run.durationS >= MIN_MEANINGFUL_RUN_S);
    if (meaningful.length === 0) return null;

    const longest = meaningful.reduce((a, b) => (b.durationS > a.durationS ? b : a));
    return { runs, longest, transitions: meaningful.length - 1 };
  },

  narrate(result, activity) {
    const { longest } = result;
    const climbOverlap = activity.events.find(
      (event) =>
        event.type === "climb" &&
        event.startT < longest.endT &&
        event.endT > longest.startT,
    );

    return {
      information: [
        { label: "Zone changes", value: `${result.transitions}` },
        {
          label: "Longest single stretch",
          value: formatDuration(longest.durationS),
          note: `Zone ${longest.value}`,
        },
      ],
      observations: [
        {
          text: `The longest unbroken stretch was ${formatDurationWords(longest.durationS)} in Zone ${longest.value}, starting at ${formatDistanceShort(longest.startDistanceM)}.`,
          evidence: [
            {
              label: `Zone ${longest.value} stretch`,
              startT: longest.startT,
              endT: longest.endT,
            },
          ],
        },
      ],
      explanations: climbOverlap
        ? [
            {
              text: `That stretch overlapped the ${climbOverlap.label.toLowerCase()}, which is a plausible reason for the sustained effort.`,
              confidence: climbOverlap.confidence,
              relatedMetrics: ["heartRate", "elevation", "gradient"],
            },
          ]
        : [],
      teaching: [
        {
          title: "Reading zone changes",
          text: "A zone change on its own says little. It becomes meaningful next to what else was happening — the terrain, the pace, the temperature, and what the run was for. Effort rising on a hill is expected; the same rise on flat ground is worth a second look.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const highlight = useSelectionStore((state) => state.highlight);
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const selectedZone = highlight?.kind === "zone" ? highlight.zone : undefined;

    const regions: TrackRegion[] = result.runs.map((run) => ({
      startT: run.startT,
      endT: run.endT + 1,
      color:
        selectedZone !== undefined && selectedZone !== run.value
          ? "var(--surface-sunken)"
          : ZONE_COLORS[run.value],
      label: `Zone ${run.value} for ${formatDuration(run.durationS)}`,
    }));

    const zonesPresent = [...new Set(result.runs.map((r) => r.value))].sort();

    return (
      <div>
        <p className={shared.trackLabel}>Zone through the run</p>
        <Track
          activity={activity}
          height={34}
          widgetId="zone-timeline"
          showAxis
          ariaLabel="Heart-rate zone through the run"
          regions={regions}
          onClickAt={(t) => {
            const run = result.runs.find((r) => t >= r.startT && t <= r.endT);
            if (run) {
              focusRegion(run.startT, run.endT, { kind: "zone", zone: run.value }, "zone-timeline");
            }
          }}
        >
          {() => null}
        </Track>

        <Legend
          items={zonesPresent.map((zone) => ({
            label: `Zone ${zone}`,
            color: ZONE_COLORS[zone],
          }))}
        />

        <p className={shared.note}>
          Click any band to jump the timeline there.
          {selectedZone !== undefined &&
            ` Zone ${selectedZone} is currently highlighted; other zones are dimmed.`}
        </p>
      </div>
    );
  },
});

export default zoneTimelineWidget;
