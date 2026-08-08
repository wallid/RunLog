import { defineWidget } from "../contract";
import { ProportionBars } from "@/viz/primitives";
import { collect, median, percentile } from "@/lib/stats";
import { formatDuration, formatPace, formatPercent } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * The distribution of pace, bucketed around the runner's own median.
 *
 * Buckets are relative rather than absolute because a pace range that is easy
 * for one runner is a race effort for another. The question this answers is
 * "how much of the run was near my normal pace", not "how fast am I".
 */

interface Bucket {
  id: string;
  label: string;
  seconds: number;
  fraction: number;
  fromPace: number;
  toPace: number;
}

interface Result {
  buckets: Bucket[];
  median: number;
  dominant: Bucket;
}

/** Offsets from the median, in seconds per kilometre, that define the buckets. */
const BUCKET_EDGES = [-45, -15, 15, 45];

export const paceZonesWidget = defineWidget<Result>({
  id: "pace-zones",
  title: "Pace distribution",
  description: "How much of the run sat near your typical pace for the day.",
  section: "pace",
  requiredMetrics: ["pace"],

  compute(activity) {
    const paces = collect(activity.samples, (s) => s.paceSecPerKm);
    if (paces.length < 120) return null;

    const medianPace = median(paces);
    // Clip extremes so a GPS glitch does not create an empty outer bucket.
    const low = percentile(paces, 0.01);
    const high = percentile(paces, 0.99);

    const edges = [low, ...BUCKET_EDGES.map((offset) => medianPace + offset), high]
      .filter((value, index, all) => index === 0 || value > all[index - 1]);

    const buckets: Bucket[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const from = edges[i];
      const to = edges[i + 1];
      const seconds = paces.filter((pace) => pace >= from && pace < to).length;
      if (seconds === 0) continue;
      buckets.push({
        id: `bucket-${i}`,
        // `from` is the smaller number, which is the faster pace, so it reads first.
        label: `${formatPace(from)}–${formatPace(to)}`,
        seconds,
        fraction: seconds / paces.length,
        fromPace: from,
        toPace: to,
      });
    }

    if (buckets.length < 2) return null;
    const dominant = buckets.reduce((a, b) => (b.seconds > a.seconds ? b : a));

    return { buckets, median: medianPace, dominant };
  },

  narrate(result) {
    const nearMedian = result.buckets
      .filter(
        (bucket) =>
          bucket.fromPace >= result.median - 15 && bucket.toPace <= result.median + 15,
      )
      .reduce((a, b) => a + b.fraction, 0);

    return {
      information: [
        { label: "Median pace", value: `${formatPace(result.median)}/km` },
        {
          label: "Most common range",
          value: result.dominant.label,
          note: formatPercent(result.dominant.fraction),
        },
      ],
      observations: [
        {
          // The modal bucket is rarely a majority — with five bands it is often
          // a quarter of the run — so it is only called "most" when it is.
          text:
            result.dominant.fraction > 0.5
              ? `Most of the moving run — ${formatPercent(result.dominant.fraction)} of it — fell between ${result.dominant.label} per kilometre.`
              : `No single pace range held most of the run. The largest was ${result.dominant.label} per kilometre, which accounted for ${formatPercent(result.dominant.fraction)} of the time spent running.`,
        },
      ],
      explanations:
        nearMedian > 0
          ? [
              {
                text:
                  nearMedian > 0.5
                    ? "The distribution is tight, which usually means the run was paced as one continuous effort rather than in changing blocks."
                    : "The distribution is spread out, which is what intervals, hills, or a route with stops and turns tends to produce.",
                confidence: "medium" as const,
                relatedMetrics: ["pace" as const],
              },
            ]
          : [],
      teaching: [
        {
          title: "Why these ranges are relative",
          text: "These buckets are set around your own median pace for this run rather than around fixed values. Pace ranges only mean something in relation to the runner and the purpose of the session, so an absolute scale would say more about your speed than about how you paced the run.",
        },
      ],
    };
  },

  View({ result }) {
    return (
      <div>
        <ProportionBars
          rows={result.buckets.map((bucket, index) => ({
            id: bucket.id,
            label: bucket.label,
            fraction: bucket.fraction,
            valueLabel: formatDuration(bucket.seconds),
            // A single-hue ramp: darker means slower, so the order is visible.
            color: `var(--zone-${Math.min(5, index + 1)})`,
            detail: undefined,
          }))}
        />
        <p className={shared.note}>
          Ranges are measured relative to this run&rsquo;s median of{" "}
          {formatPace(result.median)}/km. Only moving time is counted.
        </p>
      </div>
    );
  },
});

export default paceZonesWidget;
