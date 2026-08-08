import { defineWidget } from "../contract";
import type { GradientBucket } from "@/model/activity";
import { Track } from "@/viz/Track";
import { Legend } from "@/viz/primitives";
import { buildPath, linearScale } from "@/viz/scales";
import { rollingMean } from "@/lib/smoothing";
import { collect, mean, percentile } from "@/lib/stats";
import { formatDistanceShort, formatPower } from "@/lib/format";
import { TERRAIN_COLORS } from "../helpers";
import shared from "../shared.module.css";
import styles from "./PowerStory.module.css";

/**
 * Running power through the run.
 *
 * There is no assumed threshold here: without a tested value, buckets are set
 * relative to this run's own average, which is the only reference the data
 * actually supports.
 */

interface Result {
  avg: number;
  max: number;
  /** The highest smoothed value — the peak the drawn line actually reaches. */
  sustainedMax: number;
  low: number;
  high: number;
  smoothed: (number | undefined)[];
  buckets: { label: string; seconds: number; fraction: number; color: string }[];
  byGradient: GradientBucket[];
  firstHalf: number;
  secondHalf: number;
  peakT: number;
  peakDistanceM: number;
}

const TRACK_HEIGHT = 86;
/** Power is spiky second to second; half a minute is what a runner feels. */
const SMOOTHING_S = 30;

export const powerStoryWidget = defineWidget<Result>({
  id: "power-story",
  title: "Running power",
  description: "How mechanical output changed across the run.",
  section: "effort",
  status: "beta",
  requiredMetrics: ["power"],

  compute(activity) {
    const values = collect(activity.samples, (s) => s.powerW);
    if (values.length < 60) return null;

    const avg = mean(values);
    if (avg <= 0) return null;

    const smoothed = rollingMean(
      activity.samples.map((s) => s.powerW),
      SMOOTHING_S,
    );

    // Buckets relative to this run's average, since no tested threshold exists.
    const easy = values.filter((v) => v < avg * 0.85).length;
    const steady = values.filter((v) => v >= avg * 0.85 && v <= avg * 1.15).length;
    const hard = values.filter((v) => v > avg * 1.15).length;
    const total = values.length;

    const midpoint = Math.floor(activity.samples.length / 2);
    const firstHalf = collect(activity.samples.slice(0, midpoint), (s) => s.powerW);
    const secondHalf = collect(activity.samples.slice(midpoint), (s) => s.powerW);

    const max = Math.max(...values);
    // The peak reported is the smoothed one, because the smoothed line is what
    // is drawn. A one-second spike of three times the average is a sampling
    // artefact the reader cannot find anywhere on the chart, and quoting it as
    // the run's peak invites them to look for it.
    let peakIndex = 0;
    let sustainedMax = -Infinity;
    for (let i = 0; i < smoothed.length; i++) {
      const value = smoothed[i];
      if (value !== undefined && value > sustainedMax) {
        sustainedMax = value;
        peakIndex = i;
      }
    }
    const peak = activity.samples[peakIndex];

    return {
      avg,
      max,
      // Clip the drawing range; a single spike would otherwise flatten the line.
      low: percentile(values, 0.02),
      high: percentile(values, 0.98),
      smoothed,
      buckets: [
        {
          label: `Below average (under ${Math.round(avg * 0.85)} W)`,
          seconds: easy,
          fraction: easy / total,
          color: "var(--zone-2)",
        },
        {
          label: `Around average (${Math.round(avg * 0.85)}–${Math.round(avg * 1.15)} W)`,
          seconds: steady,
          fraction: steady / total,
          color: "var(--zone-3)",
        },
        {
          label: `Above average (over ${Math.round(avg * 1.15)} W)`,
          seconds: hard,
          fraction: hard / total,
          color: "var(--zone-5)",
        },
      ],
      byGradient: activity.summary.gradientBuckets.filter(
        (bucket) => bucket.avgPowerW !== undefined && bucket.timeS >= 30,
      ),
      firstHalf: firstHalf.length > 0 ? mean(firstHalf) : NaN,
      secondHalf: secondHalf.length > 0 ? mean(secondHalf) : NaN,
      sustainedMax,
      peakT: peak?.t ?? 0,
      peakDistanceM: peak?.distanceM ?? 0,
    };
  },

  narrate(result, activity) {
    const observations = [
      {
        text: `Power averaged ${formatPower(result.avg)}, and its highest sustained ${SMOOTHING_S} seconds came at ${formatDistanceShort(result.peakDistanceM)}, averaging ${formatPower(result.sustainedMax)}. The highest single second of the run read ${formatPower(result.max)}.`,
        evidence: [
          {
            label: "Highest sustained power",
            startT: result.peakT,
            endT: result.peakT + SMOOTHING_S,
          },
        ],
      },
    ];

    const halfChange = result.secondHalf - result.firstHalf;
    if (Number.isFinite(halfChange) && Math.abs(halfChange) >= result.avg * 0.05) {
      observations.push({
        text: `The second half averaged ${formatPower(Math.abs(halfChange))} ${halfChange > 0 ? "more" : "less"} than the first.`,
        evidence: [],
      });
    }

    const explanations = [];
    const uphill = result.byGradient.find((b) => b.category === "uphill");
    const flat = result.byGradient.find((b) => b.category === "flat");
    if (uphill?.avgPowerW !== undefined && flat?.avgPowerW !== undefined) {
      const delta = uphill.avgPowerW - flat.avgPowerW;
      if (Math.abs(delta) >= result.avg * 0.05) {
        explanations.push({
          text: `Power averaged ${formatPower(Math.abs(delta))} ${delta > 0 ? "higher" : "lower"} uphill than on flat ground, which is the direction gradient would produce.`,
          confidence: "high" as const,
          relatedMetrics: ["power" as const, "gradient" as const],
        });
      }
    }

    const drift = activity.summary.drift;
    if (drift && Number.isFinite(halfChange) && Math.abs(halfChange) < result.avg * 0.03) {
      explanations.push({
        text:
          drift.driftPct > 3
            ? "Power held steady between halves while heart rate climbed, which is the pattern of the same mechanical work costing more cardiovascular effort as the run went on."
            : "Power and heart rate both held steady between halves, suggesting the effort was sustainable at this duration.",
        confidence: "medium" as const,
        relatedMetrics: ["power" as const, "heartRate" as const],
      });
    }

    return {
      information: [
        { label: "Average", value: formatPower(result.avg) },
        {
          label: "Highest sustained",
          value: formatPower(result.sustainedMax),
          note: `${SMOOTHING_S}-second average`,
        },
        { label: "Highest second", value: formatPower(result.max), note: "unsmoothed" },
        { label: "First half", value: formatPower(result.firstHalf) },
        { label: "Second half", value: formatPower(result.secondHalf) },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "What running power is",
          text: "Running power estimates the mechanical work you are doing, combining speed with the cost of climbing and accelerating. Unlike pace it responds immediately to a hill, and unlike heart rate it does not drift with heat or fatigue. Estimates differ between devices, so the figure is most useful compared against itself rather than against another runner.",
        },
        {
          title: "Why these bands are relative",
          text: "Power zones normally come from a tested threshold. Without one, these bands are set around this run's own average, so they describe how the effort was distributed within the run rather than how hard it was in absolute terms.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const totalBucketSeconds = result.buckets.reduce((a, b) => a + b.seconds, 0);

    return (
      <div>
        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="power-story"
          showAxis
          ariaLabel="Running power through the run"
        >
          {(scale, height) => {
            const y = linearScale(result.low, result.high, height - 3, 3);
            const step = Math.max(1, Math.floor(activity.samples.length / 900));
            const points: { x: number; y: number | undefined }[] = [];
            for (let i = 0; i < activity.samples.length; i += step) {
              const value = result.smoothed[i];
              points.push({
                x: scale.toPixels(activity.samples[i].t),
                y:
                  value === undefined
                    ? undefined
                    : y(Math.max(result.low, Math.min(result.high, value))),
              });
            }
            const line = buildPath(points);

            return (
              <g>
                {line && (
                  <path
                    d={`${line}L${scale.width} ${height}L0 ${height}Z`}
                    fill="var(--metric-power)"
                    fillOpacity={0.16}
                  />
                )}
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
                  d={line}
                  fill="none"
                  stroke="var(--metric-power)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          }}
        </Track>

        <Legend
          items={[
            { label: "Power", color: "var(--metric-power)", shape: "line" },
            {
              label: `Run average · ${formatPower(result.avg)}`,
              color: "var(--text-muted)",
              shape: "dashed",
            },
          ]}
        />

        <p className={shared.note}>
          Smoothed over {SMOOTHING_S} seconds, because second-to-second power is far
          spikier than anything a runner feels.
        </p>

        <div className={styles.section}>
          <p className={shared.trackLabel}>Time at each level of output</p>
          <div className={styles.stack} role="img" aria-label="Distribution of power relative to the run average">
            {result.buckets
              .filter((bucket) => bucket.seconds > 0)
              .map((bucket) => (
                <div
                  key={bucket.label}
                  className={styles.stackSegment}
                  style={{
                    width: `${(bucket.seconds / totalBucketSeconds) * 100}%`,
                    background: bucket.color,
                  }}
                  title={bucket.label}
                />
              ))}
          </div>
          <ul className={styles.stackLegend}>
            {result.buckets
              .filter((bucket) => bucket.seconds > 0)
              .map((bucket) => (
                <li key={bucket.label}>
                  <span className={styles.swatch} style={{ background: bucket.color }} />
                  {bucket.label}
                  <span className={`${styles.legendValue} numeric`}>
                    {Math.round(bucket.fraction * 100)}%
                  </span>
                </li>
              ))}
          </ul>
        </div>

        {result.byGradient.length >= 2 && (
          <div className={styles.section}>
            <p className={shared.trackLabel}>Power by terrain</p>
            <div className={styles.terrainRow}>
              {result.byGradient.map((bucket) => (
                <div key={bucket.category} className={styles.terrainCard}>
                  <span
                    className={styles.swatch}
                    style={{ background: TERRAIN_COLORS[bucket.category] }}
                  />
                  <span className={styles.terrainLabel}>
                    {bucket.category === "uphill"
                      ? "Uphill"
                      : bucket.category === "flat"
                        ? "Flat"
                        : "Downhill"}
                  </span>
                  <span className={`${styles.terrainValue} numeric`}>
                    {formatPower(bucket.avgPowerW)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
});

export default powerStoryWidget;
