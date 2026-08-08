import { defineWidget } from "../contract";
import type { GradientBucket, GradientCategory } from "@/model/activity";
import { ProportionBars } from "@/viz/primitives";
import { NOISE_FLOOR, TERRAIN_COLORS, terrainHrDeviation } from "../helpers";
import { formatDistance, formatDuration, formatPercent } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * The route sorted into flat, uphill and downhill.
 *
 * Three coarse categories rather than a continuous gradient distribution,
 * because "how much of this was uphill" is the question a runner actually asks.
 */

interface Result {
  buckets: GradientBucket[];
  totalDistanceM: number;
  totalTimeS: number;
  /** Mean bpm above or below the local baseline, per kind of ground. */
  hrDeviation: Partial<Record<GradientCategory, number>>;
}

const LABELS = {
  uphill: "Uphill",
  flat: "Flat",
  downhill: "Downhill",
} as const;

export const gradientZonesWidget = defineWidget<Result>({
  id: "gradient-zones",
  title: "Flat, uphill and downhill",
  description: "How the route divided between rising, level and falling ground.",
  section: "terrain",
  requiredMetrics: ["gradient"],

  compute(activity) {
    const buckets = activity.summary.gradientBuckets.filter((b) => b.timeS > 0);
    if (buckets.length < 2) return null;

    const totalDistanceM = buckets.reduce((a, b) => a + b.distanceM, 0);
    const totalTimeS = buckets.reduce((a, b) => a + b.timeS, 0);
    if (totalDistanceM <= 0) return null;

    return {
      buckets,
      totalDistanceM,
      totalTimeS,
      hrDeviation: terrainHrDeviation(activity),
    };
  },

  narrate(result) {
    const uphill = result.buckets.find((b) => b.category === "uphill");
    const flat = result.buckets.find((b) => b.category === "flat");
    const downhill = result.buckets.find((b) => b.category === "downhill");

    // Every category the run actually covered gets a line, so the card always
    // says something rather than falling silent on a route with no climbs.
    const observations = (["uphill", "flat", "downhill"] as const)
      .map((category) => result.buckets.find((b) => b.category === category))
      .filter((bucket): bucket is GradientBucket => bucket !== undefined)
      .map((bucket) => ({
        text: `${formatPercent(bucket.distanceM / result.totalDistanceM)} of the distance was ${LABELS[bucket.category].toLowerCase()}, covering ${formatDistance(bucket.distanceM)}.`,
      }));

    const explanations = [];
    const uphillDeviation = result.hrDeviation.uphill;
    const flatDeviation = result.hrDeviation.flat;

    if (uphillDeviation !== undefined && flatDeviation !== undefined) {
      // Measured against the heart rate either side of each stretch rather than
      // against the run average. Comparing raw bucket averages would mostly
      // measure when the hills fell in the run: on a session where heart rate
      // climbs twenty beats, terrain run early looks easy whatever it cost.
      const difference = uphillDeviation - flatDeviation;
      const raw =
        uphill?.avgHr !== undefined && flat?.avgHr !== undefined
          ? uphill.avgHr - flat.avgHr
          : undefined;

      if (Math.abs(difference) >= NOISE_FLOOR.hrBpm) {
        explanations.push({
          text:
            difference > 0
              ? `Set against the heart rate on either side of them, the uphill stretches ran ${Math.abs(Math.round(difference))} bpm higher than the flat ones. That is the direction a climb produces: the same speed costs more on rising ground.`
              : `Set against the heart rate on either side of them, the uphill stretches ran ${Math.abs(Math.round(difference))} bpm lower than the flat ones — the opposite of what a climb costs. Easing off on the hills is the ordinary reason.`,
          confidence: "medium" as const,
          relatedMetrics: ["gradient" as const, "heartRate" as const],
        });
      } else if (raw !== undefined && Math.abs(raw) >= NOISE_FLOOR.hrBpm) {
        explanations.push({
          text: `Raw averages put heart rate ${Math.abs(Math.round(raw))} bpm ${raw > 0 ? "higher" : "lower"} uphill than on the flat, but that gap disappears once each stretch is compared with the heart rate around it rather than with the run as a whole. It reflects when the hills came in this run, not what they cost.`,
          confidence: "medium" as const,
          relatedMetrics: ["gradient" as const, "heartRate" as const],
        });
      }
    }
    if (
      uphill &&
      downhill &&
      uphill.distanceM / result.totalDistanceM < 0.08 &&
      downhill.distanceM / result.totalDistanceM < 0.08
    ) {
      explanations.push({
        text: "With so little of the route on rising or falling ground, gradient is unlikely to account for pace changes elsewhere in this run.",
        confidence: "high" as const,
        relatedMetrics: ["gradient" as const, "pace" as const],
      });
    }

    return {
      information: result.buckets.map((bucket) => ({
        label: LABELS[bucket.category],
        value: formatDistance(bucket.distanceM),
        note: formatDuration(bucket.timeS),
      })),
      observations,
      explanations,
      teaching: [
        {
          title: "What gradient measures",
          text: "Gradient is how much the ground rises or falls relative to the distance travelled across it: a 2% gradient climbs two metres for every hundred metres forward. Here anything steeper than 2% counts as uphill and anything below −2% as downhill; between them the ground is treated as flat.",
        },
      ],
    };
  },

  View({ result }) {
    // Fixed order so the reader always finds the same category in the same place.
    const ordered = (["uphill", "flat", "downhill"] as const)
      .map((category) => result.buckets.find((b) => b.category === category))
      .filter((bucket): bucket is GradientBucket => bucket !== undefined);

    return (
      <div>
        <ProportionBars
          rows={ordered.map((bucket) => ({
            id: bucket.category,
            label: LABELS[bucket.category],
            fraction: bucket.distanceM / result.totalDistanceM,
            valueLabel: formatDistance(bucket.distanceM),
            color: TERRAIN_COLORS[bucket.category],
            detail:
              bucket.avgHr !== undefined
                ? `${formatDuration(bucket.timeS)} · average ${Math.round(bucket.avgHr)} bpm`
                : formatDuration(bucket.timeS),
          }))}
        />
        <p className={shared.note}>
          Bars show distance. Gradient is measured over a rolling window of at least 30
          metres, which keeps small elevation errors from registering as hills.
        </p>
      </div>
    );
  },
});

export default gradientZonesWidget;
