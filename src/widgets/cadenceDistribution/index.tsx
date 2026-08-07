import { defineWidget } from "../contract";
import { ProportionBars } from "@/viz/primitives";
import { median, percentile } from "@/lib/stats";
import { formatCadence, formatDuration, formatPercent } from "@/lib/format";
import {
  CADENCE_IS_PERSONAL,
  MIN_CADENCE_SECONDS,
  runningCadence,
} from "../cadenceHelpers";
import shared from "../shared.module.css";

/**
 * How the running time was spread across step rates.
 *
 * One bar per band of four steps per minute, which is about the width of a real
 * change in rhythm rather than of sensor noise. Every bar is the same colour:
 * the bands are a scale, not categories, and colouring them would invite the
 * reader to think one end was better than the other.
 */

interface Bucket {
  id: string;
  from: number;
  to: number;
  seconds: number;
  fraction: number;
}

interface Result {
  buckets: Bucket[];
  modal: Bucket;
  median: number;
  quartileLow: number;
  quartileHigh: number;
  inMiddleFraction: number;
  totalSeconds: number;
}

/** Bands narrower than this would separate readings that are the same rhythm. */
const BAND_SPM = 4;
/** Clipping the tails keeps one bad second from adding a row of empty bands. */
const CLIP_LOW = 0.01;
const CLIP_HIGH = 0.99;

export const cadenceDistributionWidget = defineWidget<Result>({
  id: "cadence-distribution",
  title: "Cadence distribution",
  description: "How much of the run was spent at each step rate.",
  section: "cadence",
  requiredMetrics: ["cadence"],

  compute(activity) {
    const values = runningCadence(activity);
    if (values.length < MIN_CADENCE_SECONDS) return null;

    const low = percentile(values, CLIP_LOW);
    const high = percentile(values, CLIP_HIGH);
    const start = Math.floor(low / BAND_SPM) * BAND_SPM;
    const end = Math.ceil(high / BAND_SPM) * BAND_SPM;
    if (!(end > start)) return null;

    const buckets: Bucket[] = [];
    for (let from = start; from < end; from += BAND_SPM) {
      const to = from + BAND_SPM;
      const seconds = values.filter((v) => v >= from && v < to).length;
      if (seconds === 0) continue;
      buckets.push({
        id: `band-${from}`,
        from,
        to,
        seconds,
        fraction: seconds / values.length,
      });
    }
    if (buckets.length < 2) return null;

    const quartileLow = percentile(values, 0.25);
    const quartileHigh = percentile(values, 0.75);

    return {
      buckets,
      modal: buckets.reduce((a, b) => (b.seconds > a.seconds ? b : a)),
      median: median(values),
      quartileLow,
      quartileHigh,
      inMiddleFraction:
        values.filter((v) => v >= quartileLow && v <= quartileHigh).length / values.length,
      totalSeconds: values.length,
    };
  },

  narrate(result) {
    const spread = result.quartileHigh - result.quartileLow;

    return {
      information: [
        {
          label: "Most common",
          value: `${result.modal.from}–${result.modal.to} spm`,
          note: formatPercent(result.modal.fraction),
        },
        { label: "Median", value: formatCadence(result.median) },
        {
          label: "Middle half",
          value: `${Math.round(result.quartileLow)}–${Math.round(result.quartileHigh)} spm`,
          note: `${Math.round(spread)} spm wide`,
        },
      ],
      observations: [
        {
          text: `Most of the running — ${formatPercent(result.modal.fraction)} of it — sat between ${result.modal.from} and ${result.modal.to} steps per minute, and half of it fell within a ${Math.round(spread)} spm band around ${formatCadence(result.median)}.`,
        },
      ],
      explanations: [
        {
          text:
            spread <= 6
              ? "A distribution this narrow is what one continuous effort looks like: the rhythm was set early and held, with little that asked the runner to change it."
              : spread <= 12
                ? "A spread of this width is normal for a run over varied ground or with a change of effort in it. Cadence follows both, so the width says as much about the route as about the runner."
                : "A distribution this wide means the run was made of noticeably different rhythms — intervals, hills, or sections of walking and running would all produce it.",
          confidence: "medium" as const,
          relatedMetrics: ["cadence" as const, "pace" as const, "gradient" as const],
        },
      ],
      teaching: [
        {
          title: "What the width tells you",
          text: "The middle of a cadence distribution is a fact about the runner; the width of it is a fact about the run. A narrow distribution means the same rhythm throughout, which is neither good nor bad on its own — an interval session should produce a wide one.",
        },
        CADENCE_IS_PERSONAL,
      ],
    };
  },

  View({ result }) {
    return (
      <div>
        <ProportionBars
          rows={result.buckets.map((bucket) => ({
            id: bucket.id,
            label: `${bucket.from}–${bucket.to}`,
            fraction: bucket.fraction,
            valueLabel: formatDuration(bucket.seconds),
            color: "var(--metric-cadence)",
          }))}
        />
        <p className={shared.note}>
          Bands are four steps per minute wide and cover {formatDuration(result.totalSeconds)}{" "}
          of running. The value beside each band is the time spent in it.
        </p>
      </div>
    );
  },
});

export default cadenceDistributionWidget;
