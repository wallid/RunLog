import { defineWidget } from "../contract";
import { formatCadence } from "@/lib/format";
import {
  CADENCE_IS_PERSONAL,
  MIN_CADENCE_SECONDS,
  describeStrength,
  quantileEdges,
  runningCadence,
} from "../cadenceHelpers";
import {
  buildComparison,
  CadenceComparison,
  comparisonStats,
  type Comparison,
} from "../cadenceComparison";

/**
 * Step rate against how hard the runner was working.
 *
 * The two are related only through pace, and loosely even then: heart rate lags
 * a change in effort by several seconds while cadence changes with the next
 * step. The section says so rather than presenting the pair as though one drove
 * the other.
 */

interface Result {
  comparison: Comparison;
  lowestBand: string;
  highestBand: string;
  lowestCadence: number;
  highestCadence: number;
}

const BIN_COUNT = 5;

export const cadenceVsHeartRateWidget = defineWidget<Result>({
  id: "cadence-vs-heart-rate",
  title: "Cadence against heart rate",
  description: "Whether a quicker rhythm came with a higher heart rate.",
  section: "cadence",
  requiredMetrics: ["cadence", "heartRate"],

  compute(activity) {
    if (runningCadence(activity).length < MIN_CADENCE_SECONDS) return null;

    const edges = quantileEdges(activity, (s) => s.hrBpm, BIN_COUNT);
    if (edges.length === 0) return null;

    const comparison = buildComparison(
      activity,
      (s) => s.hrBpm,
      edges,
      (from, to) => `${Math.round(from)}–${Math.round(to)} bpm`,
    );
    if (!comparison) return null;

    const lowest = comparison.bins[0];
    const highest = comparison.bins[comparison.bins.length - 1];

    return {
      comparison,
      lowestBand: lowest.label,
      highestBand: highest.label,
      lowestCadence: lowest.cadenceSpm,
      highestCadence: highest.cadenceSpm,
    };
  },

  narrate(result) {
    const { comparison } = result;
    const strength = describeStrength(comparison.r);
    const difference = result.highestCadence - result.lowestCadence;

    return {
      information: [
        ...comparisonStats(comparison, "band"),
        {
          label: "Relationship",
          value: Number.isFinite(comparison.r) ? comparison.r.toFixed(2) : "—",
          note: "correlation",
        },
      ],
      observations: [
        {
          text: `At ${result.lowestBand} the step rate averaged ${formatCadence(result.lowestCadence)}; at ${result.highestBand} it averaged ${formatCadence(result.highestCadence)}, a difference of ${Math.abs(Math.round(difference))} steps per minute.`,
        },
      ],
      explanations: [
        {
          text:
            strength === "no"
              ? "Step rate and heart rate moved independently in this run. That is the ordinary case on a short or steady session: heart rate is driven by accumulated effort and conditions, while cadence responds to the next stride."
              : difference > 0
                ? `There is ${strength} tendency for cadence to be higher when heart rate was higher. Both follow pace, so this is most likely the two of them tracking speed rather than either one moving the other.`
                : `Cadence tended to be lower where heart rate was higher, which is the pattern climbing produces: the ground raises the cost of running while shortening and slowing the stride. The gradient comparison is the place to confirm it.`,
          confidence: strength === "no" ? ("medium" as const) : ("low" as const),
          relatedMetrics: ["cadence" as const, "heartRate" as const, "pace" as const],
        },
      ],
      teaching: [
        {
          title: "Why this pair is the loosest on the page",
          text: "Heart rate answers to duration, heat, hydration and sleep as well as to effort, and it takes tens of seconds to respond to a change in pace. Cadence responds within a stride. Any relationship between them is second-hand, through pace, so treat a strong-looking one with suspicion rather than as a finding.",
        },
        CADENCE_IS_PERSONAL,
      ],
    };
  },

  View({ result }) {
    return (
      <CadenceComparison
        comparison={result.comparison}
        xLabel="Heart rate (bpm)"
        formatX={(value) => `${Math.round(value)}`}
        rowLabel="At"
        description="Cadence plotted against heart rate, with the average cadence in each heart-rate band"
        note="Each faint dot is one second of running. Bands are set so each holds a similar amount of running, and the line joins their averages. Both values are read at the same second, with no allowance made for the lag between an effort and the heart rate that answers it."
      />
    );
  },
});

export default cadenceVsHeartRateWidget;
