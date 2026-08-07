import { defineWidget } from "../contract";
import { Track } from "@/viz/Track";
import { buildPath, linearScale } from "@/viz/scales";
import { collect, mean } from "@/lib/stats";
import { formatCadence, formatDistanceShort } from "@/lib/format";
import { NOISE_FLOOR } from "../helpers";
import {
  MIN_CADENCE_SECONDS,
  runningCadence,
  runningCadenceOf,
} from "../cadenceHelpers";
import shared from "../shared.module.css";

/**
 * Step rhythm from start to finish.
 *
 * The line is drawn only where the runner was running: a gap in it is a stop,
 * not a collapse in cadence. Detected drops are shaded behind so the same
 * moments the drop section lists can be seen in their place in the run.
 */

interface Result {
  avg: number;
  min: number;
  max: number;
  firstHalf: number;
  secondHalf: number;
  peakSpm: number;
  peakT: number;
  peakDistanceM: number;
  dropRegions: { startT: number; endT: number }[];
}

const TRACK_HEIGHT = 96;

export const cadenceTimelineWidget = defineWidget<Result>({
  id: "cadence-timeline",
  title: "Cadence through the run",
  description: "How step rhythm developed from the first kilometre to the last.",
  section: "cadence",
  requiredMetrics: ["cadence"],

  compute(activity) {
    const values = runningCadence(activity);
    if (values.length < MIN_CADENCE_SECONDS) return null;

    // Halves are split by running seconds rather than by elapsed time, so a long
    // stop in one half does not shrink the amount of running it is judged on.
    const running = activity.samples.filter((s) => runningCadenceOf(s) !== undefined);
    const midpoint = Math.floor(running.length / 2);
    const firstHalf = collect(running.slice(0, midpoint), runningCadenceOf);
    const secondHalf = collect(running.slice(midpoint), runningCadenceOf);

    const max = Math.max(...values);
    const peak = running.find((s) => runningCadenceOf(s) === max);

    return {
      avg: mean(values),
      min: Math.min(...values),
      max,
      firstHalf: firstHalf.length > 0 ? mean(firstHalf) : NaN,
      secondHalf: secondHalf.length > 0 ? mean(secondHalf) : NaN,
      peakSpm: max,
      peakT: peak?.t ?? 0,
      peakDistanceM: peak?.distanceM ?? 0,
      dropRegions: activity.events
        .filter((event) => event.type === "cadenceDrop")
        .map((event) => ({ startT: event.startT, endT: event.endT })),
    };
  },

  narrate(result) {
    const change = result.secondHalf - result.firstHalf;

    const observations = [
      {
        text: `Cadence ranged from ${Math.round(result.min)} to ${Math.round(result.max)} steps per minute around an average of ${formatCadence(result.avg)}. The highest reading came at ${formatDistanceShort(result.peakDistanceM)}.`,
        evidence: [{ label: "Highest cadence", startT: result.peakT, endT: result.peakT }],
      },
    ];

    if (Number.isFinite(change) && Math.abs(change) >= NOISE_FLOOR.cadenceSpm) {
      observations.push({
        text: `The second half of the running averaged ${Math.abs(Math.round(change))} steps per minute ${change > 0 ? "higher" : "lower"} than the first.`,
        evidence: [],
      });
    }

    const explanations = [];
    if (Number.isFinite(change) && Math.abs(change) >= NOISE_FLOOR.cadenceSpm) {
      explanations.push({
        text: `Cadence ${change > 0 ? "rose" : "fell"} across the run. Step rate follows speed closely, so the first thing to check is whether pace moved the same way; if it did not, terrain and fatigue are the usual accounts.`,
        confidence: "medium" as const,
        relatedMetrics: ["cadence" as const, "pace" as const, "gradient" as const],
      });
    }

    if (result.dropRegions.length > 0) {
      explanations.push({
        text:
          result.dropRegions.length === 1
            ? "One stretch of the run sat well below the run's own rhythm. It is shaded on the chart, and the cadence-drop section says what was happening in it."
            : `${result.dropRegions.length} stretches of the run sat well below the run's own rhythm. They are shaded on the chart, and the cadence-drop section says what was happening in each.`,
        confidence: "medium" as const,
        relatedMetrics: ["cadence" as const],
      });
    }

    return {
      information: [
        { label: "Average", value: formatCadence(result.avg) },
        { label: "Highest", value: formatCadence(result.max) },
        { label: "Lowest", value: formatCadence(result.min) },
        { label: "First half", value: formatCadence(result.firstHalf) },
        { label: "Second half", value: formatCadence(result.secondHalf) },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "Reading the shape, not the number",
          text: "A cadence line is most useful for where it changes, not for where it sits. Steps per minute rises with speed and falls on steep climbs for almost everyone, so the moments worth looking at are the ones where it moved without the ground or the pace moving with it.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const padding = Math.max(3, (result.max - result.min) * 0.12);

    return (
      <div>
        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="cadence-timeline"
          showAxis
          ariaLabel="Cadence through the run"
        >
          {(scale, height) => {
            const y = linearScale(result.min - padding, result.max + padding, height - 3, 3);
            const step = Math.max(1, Math.floor(activity.samples.length / 900));
            const points: { x: number; y: number | undefined }[] = [];
            for (let i = 0; i < activity.samples.length; i += step) {
              const sample = activity.samples[i];
              const cadence = runningCadenceOf(sample);
              points.push({
                x: scale.toPixels(sample.t),
                y: cadence === undefined ? undefined : y(cadence),
              });
            }

            return (
              <g>
                {/* Drawn first so the line sits over them rather than behind. */}
                {result.dropRegions.map((region) => (
                  <rect
                    key={region.startT}
                    x={scale.toPixels(region.startT)}
                    y={0}
                    width={Math.max(
                      2,
                      scale.toPixels(region.endT) - scale.toPixels(region.startT),
                    )}
                    height={height}
                    fill="var(--metric-cadence)"
                    fillOpacity={0.1}
                  />
                ))}
                <line
                  x1={0}
                  x2={scale.width}
                  y1={y(result.avg)}
                  y2={y(result.avg)}
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <path
                  d={buildPath(points)}
                  fill="none"
                  stroke="var(--metric-cadence)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          }}
        </Track>

        <p className={shared.note}>
          The dashed line is the running average of {formatCadence(result.avg)}. Gaps in the
          line are seconds spent stopped
          {result.dropRegions.length > 0
            ? "; the shaded bands are the stretches detected as cadence drops"
            : ""}
          .
        </p>
      </div>
    );
  },
});

export default cadenceTimelineWidget;
