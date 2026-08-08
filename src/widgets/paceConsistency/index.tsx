import { defineWidget } from "../contract";
import type { ConsistencyResult } from "@/model/activity";
import { Track } from "@/viz/Track";
import { linearScale } from "@/viz/scales";
import { formatPace, formatPaceWithUnit, formatPercent } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * How steady the pace was, shown as dots against a target band.
 *
 * Tighter grouping means steadier running. The widget deliberately makes no
 * judgement about whether that is good: variation is the point of an interval
 * session and unavoidable on hills.
 */

interface Result {
  consistency: ConsistencyResult;
  low: number;
  high: number;
}

const TRACK_HEIGHT = 96;

export const paceConsistencyWidget = defineWidget<Result>({
  id: "pace-consistency",
  title: "Pace consistency",
  description: "How tightly the run held to a single pace.",
  section: "pace",
  requiredMetrics: ["pace"],

  compute(activity) {
    const consistency = activity.summary.consistency;
    if (!consistency || consistency.intervals.length < 8) return null;

    const paces = consistency.intervals.map((i) => i.paceSecPerKm);
    const spread = Math.max(
      consistency.bandSecPerKm * 2.5,
      Math.max(...paces) - Math.min(...paces),
    );

    return {
      consistency,
      low: consistency.medianPace - spread / 2,
      high: consistency.medianPace + spread / 2,
    };
  },

  narrate(result) {
    const { consistency } = result;
    const percent = formatPercent(consistency.withinBandFraction);

    const explanations = [];
    if (consistency.surgeCount > 0 || consistency.slowdownCount > 0) {
      explanations.push({
        text: `There ${consistency.surgeCount + consistency.slowdownCount === 1 ? "was" : "were"} ${consistency.surgeCount} sustained ${consistency.surgeCount === 1 ? "surge" : "surges"} and ${consistency.slowdownCount} sustained ${consistency.slowdownCount === 1 ? "slowdown" : "slowdowns"} beyond the band. Whether that is a problem depends on what the run was for.`,
        confidence: "medium" as const,
        relatedMetrics: ["pace" as const],
      });
    }

    return {
      information: [
        // The band comes from the detector rather than being restated here, so
        // the two cannot drift apart into a card describing a band it is not
        // measuring against.
        { label: "Within band", value: percent, note: `±${Math.round(consistency.bandSecPerKm)} s/km of median` },
        { label: "Median pace", value: `${formatPace(consistency.medianPace)}/km` },
        {
          label: "Spread",
          value: `${Math.round(consistency.stdevSecPerKm)} s/km`,
          note: "standard deviation",
        },
      ],
      observations: [
        {
          text: `${percent} of the moving run stayed within ${Math.round(consistency.bandSecPerKm)} seconds per kilometre of the median pace of ${formatPaceWithUnit(consistency.medianPace)}.`,
        },
      ],
      explanations,
      teaching: [
        {
          title: "When consistency matters",
          text: "Holding an even pace is useful on easy and steady runs, where drifting fast and slow costs more effort than it returns. It is not a goal in itself: intervals, hill sessions and races are all meant to vary, and a run over changing terrain will vary whatever the runner does.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const { consistency } = result;

    return (
      <div>
        <p className={shared.trackLabel}>Each dot is ten seconds of running</p>
        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="pace-consistency"
          showAxis
          ariaLabel="Pace consistency, showing ten-second intervals against a target band"
        >
          {(scale, height) => {
            const y = linearScale(result.high, result.low, height - 4, 4);
            const bandTop = y(consistency.medianPace - consistency.bandSecPerKm);
            const bandBottom = y(consistency.medianPace + consistency.bandSecPerKm);

            return (
              <g>
                <rect
                  x={0}
                  y={Math.min(bandTop, bandBottom)}
                  width={scale.width}
                  height={Math.abs(bandBottom - bandTop)}
                  fill="var(--metric-pace)"
                  fillOpacity={0.1}
                />
                <line
                  x1={0}
                  x2={scale.width}
                  y1={y(consistency.medianPace)}
                  y2={y(consistency.medianPace)}
                  stroke="var(--metric-pace)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
                {consistency.intervals.map((interval) => {
                  const clamped = Math.max(
                    result.low,
                    Math.min(result.high, interval.paceSecPerKm),
                  );
                  return (
                    <circle
                      key={interval.t}
                      cx={scale.toPixels(interval.t)}
                      cy={y(clamped)}
                      r={interval.within ? 3 : 4}
                      fill={interval.within ? "var(--metric-pace)" : "var(--surface-card)"}
                      stroke="var(--metric-pace)"
                      strokeWidth={interval.within ? 0 : 2}
                      fillOpacity={interval.within ? 0.75 : 1}
                    />
                  );
                })}
              </g>
            );
          }}
        </Track>

        <p className={shared.note}>
          Filled dots sit inside the band; hollow dots are the intervals that departed
          from it. Faster paces sit higher.
        </p>
      </div>
    );
  },
});

export default paceConsistencyWidget;
