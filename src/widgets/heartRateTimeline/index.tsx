import { defineWidget } from "../contract";
import type { Sample } from "@/model/activity";
import { Track, type TrackRegion } from "@/viz/Track";
import { buildPath, linearScale } from "@/viz/scales";
import { ZONE_SOFT_COLORS } from "../helpers";
import { collect, mean } from "@/lib/stats";
import { formatDistanceShort, formatHeartRate } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * Heart rate across the run, with the zones behind it.
 *
 * The line is drawn over zone bands rather than a numeric axis, so a reader
 * sees which zone a value falls in without translating a number.
 */

interface Result {
  min: number;
  max: number;
  avg: number;
  firstHalfAvg: number;
  secondHalfAvg: number;
  peakT: number;
  peakDistanceM: number;
}

const TRACK_HEIGHT = 96;

export const heartRateTimelineWidget = defineWidget<Result>({
  id: "heart-rate-timeline",
  title: "Heart rate through the run",
  description: "How cardiovascular effort developed from start to finish.",
  section: "heart",
  requiredMetrics: ["heartRate"],

  compute(activity) {
    const values = collect(activity.samples, (s) => s.hrBpm);
    if (values.length < 30) return null;

    const midpoint = Math.floor(activity.samples.length / 2);
    const firstHalf = collect(activity.samples.slice(0, midpoint), (s) => s.hrBpm);
    const secondHalf = collect(activity.samples.slice(midpoint), (s) => s.hrBpm);

    const max = Math.max(...values);
    const peak = activity.samples.find((s) => s.hrBpm === max);

    return {
      min: Math.min(...values),
      max,
      avg: mean(values),
      firstHalfAvg: firstHalf.length > 0 ? mean(firstHalf) : NaN,
      secondHalfAvg: secondHalf.length > 0 ? mean(secondHalf) : NaN,
      peakT: peak?.t ?? 0,
      peakDistanceM: peak?.distanceM ?? 0,
    };
  },

  narrate(result, activity) {
    const change = result.secondHalfAvg - result.firstHalfAvg;
    const observations = [
      {
        text: `Heart rate ranged from ${formatHeartRate(result.min)} to ${formatHeartRate(result.max)}, averaging ${formatHeartRate(result.avg)}. The peak came at ${formatDistanceShort(result.peakDistanceM)}.`,
        evidence: [{ label: "Peak heart rate", startT: result.peakT, endT: result.peakT }],
      },
    ];

    if (Number.isFinite(change) && Math.abs(change) >= 3) {
      observations.push({
        text: `The second half averaged ${formatHeartRate(Math.abs(change))} ${change > 0 ? "higher" : "lower"} than the first.`,
        evidence: [],
      });
    }

    const explanations = [];
    if (Number.isFinite(change) && change >= 5) {
      const paceChange = activity.summary.drift?.pacePct ?? 0;
      explanations.push({
        text:
          Math.abs(paceChange) < 3
            ? "Pace stayed close to level while heart rate rose, which is the pattern associated with duration, heat, hydration or accumulating fatigue rather than a change in speed."
            : "Pace also changed across the run, so the rise reflects a change in effort as well as anything happening physiologically.",
        confidence: (Math.abs(paceChange) < 3 ? "medium" : "low") as "medium" | "low",
        relatedMetrics: ["heartRate" as const, "pace" as const],
      });
    }

    return {
      information: [
        { label: "Average", value: formatHeartRate(result.avg) },
        { label: "Maximum", value: formatHeartRate(result.max) },
        { label: "Minimum", value: formatHeartRate(result.min) },
        {
          label: "First half",
          value: formatHeartRate(result.firstHalfAvg),
        },
        {
          label: "Second half",
          value: formatHeartRate(result.secondHalfAvg),
        },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "What heart rate measures",
          text: "Heart rate describes how hard your cardiovascular system is working, not how fast you are going. It responds to heat, hydration, sleep, caffeine, stress and altitude as well as to effort, and it lags behind changes in pace by several seconds.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const zoneRegions: TrackRegion[] = [];
    let current: TrackRegion | null = null;
    let currentZone: number | null = null;

    for (const sample of activity.samples) {
      if (sample.hrZone === undefined) {
        current = null;
        currentZone = null;
        continue;
      }
      if (current && currentZone === sample.hrZone) {
        current.endT = sample.t + 1;
        continue;
      }
      current = {
        startT: sample.t,
        endT: sample.t + 1,
        color: ZONE_SOFT_COLORS[sample.hrZone],
        label: `Zone ${sample.hrZone}`,
        behind: true,
      };
      currentZone = sample.hrZone;
      zoneRegions.push(current);
    }

    // A little headroom above and below keeps the line off the edges.
    const padding = Math.max(4, (result.max - result.min) * 0.1);

    return (
      <div>
        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="heart-rate-timeline"
          showAxis
          ariaLabel="Heart rate through the run"
          regions={zoneRegions}
        >
          {(scale, height) => {
            const y = linearScale(
              result.min - padding,
              result.max + padding,
              height - 3,
              3,
            );
            const step = Math.max(1, Math.floor(activity.samples.length / 900));
            const points: { x: number; y: number | undefined }[] = [];
            for (let i = 0; i < activity.samples.length; i += step) {
              const sample: Sample = activity.samples[i];
              points.push({
                x: scale.toPixels(sample.t),
                y: sample.hrBpm === undefined ? undefined : y(sample.hrBpm),
              });
            }

            return (
              <g>
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
                  stroke="var(--metric-heart)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          }}
        </Track>

        <p className={shared.note}>
          The dashed line marks the average of {formatHeartRate(result.avg)}. Shaded bands
          behind the line show the heart-rate zone at each point.
        </p>
      </div>
    );
  },
});

export default heartRateTimelineWidget;
