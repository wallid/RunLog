import { defineWidget } from "../contract";
import type { GradientBucket } from "@/model/activity";
import { ProportionBars } from "@/viz/primitives";
import { TERRAIN_COLORS } from "../helpers";
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

    return { buckets, totalDistanceM, totalTimeS };
  },

  narrate(result) {
    const uphill = result.buckets.find((b) => b.category === "uphill");
    const flat = result.buckets.find((b) => b.category === "flat");
    const downhill = result.buckets.find((b) => b.category === "downhill");

    const observations = [];
    if (uphill) {
      observations.push({
        text: `${formatPercent(uphill.distanceM / result.totalDistanceM)} of the distance was uphill, covering ${formatDistance(uphill.distanceM)}.`,
      });
    }

    const explanations = [];
    if (uphill?.avgHr !== undefined && flat?.avgHr !== undefined) {
      const difference = uphill.avgHr - flat.avgHr;
      if (Math.abs(difference) >= 3) {
        explanations.push({
          text: `Heart rate averaged ${Math.abs(Math.round(difference))} bpm ${difference > 0 ? "higher" : "lower"} on uphill ground than on flat, which is the expected direction for a change in gradient.`,
          confidence: "high" as const,
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
