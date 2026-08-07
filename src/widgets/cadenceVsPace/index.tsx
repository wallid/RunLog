import { defineWidget } from "../contract";
import { formatCadence, formatPace } from "@/lib/format";
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
 * Whether the run got quicker by taking more steps or by taking longer ones.
 *
 * This is the comparison that makes cadence useful. Speed is step rate times
 * stride length, so a runner who speeds up must change one of them, and which
 * one they changed is visible here and nowhere else on the page.
 */

interface Result {
  comparison: Comparison;
  fastestBinCadence: number;
  slowestBinCadence: number;
  fastestBinLabel: string;
  slowestBinLabel: string;
}

const BIN_COUNT = 5;

export const cadenceVsPaceWidget = defineWidget<Result>({
  id: "cadence-vs-pace",
  title: "Cadence against pace",
  description: "Whether speed came from more steps or from longer ones.",
  section: "cadence",
  requiredMetrics: ["cadence", "pace"],

  compute(activity) {
    if (runningCadence(activity).length < MIN_CADENCE_SECONDS) return null;

    const edges = quantileEdges(activity, (s) => s.paceSecPerKm, BIN_COUNT);
    if (edges.length === 0) return null;

    const comparison = buildComparison(
      activity,
      (s) => s.paceSecPerKm,
      edges,
      (from, to) => `${formatPace(from)}–${formatPace(to)}`,
    );
    if (!comparison) return null;

    // Bands are in pace order, so the first is the quickest running.
    const fastest = comparison.bins[0];
    const slowest = comparison.bins[comparison.bins.length - 1];

    return {
      comparison,
      fastestBinCadence: fastest.cadenceSpm,
      slowestBinCadence: slowest.cadenceSpm,
      fastestBinLabel: fastest.label,
      slowestBinLabel: slowest.label,
    };
  },

  narrate(result) {
    const { comparison } = result;
    const difference = result.fastestBinCadence - result.slowestBinCadence;
    const strength = describeStrength(comparison.r);
    // A larger seconds-per-kilometre figure is slower running, so a negative
    // correlation is cadence rising with speed.
    const risesWithSpeed = comparison.r < 0;

    const observations = [
      {
        text: `The quickest running, at ${result.fastestBinLabel} per kilometre, averaged ${formatCadence(result.fastestBinCadence)}; the slowest, at ${result.slowestBinLabel}, averaged ${formatCadence(result.slowestBinCadence)}.`,
      },
    ];

    const explanations = [];
    if (strength === "no") {
      explanations.push({
        text: "Step rate barely tracked pace at all across this run. When cadence holds while pace changes, the difference in speed is coming from stride length rather than from turnover — which is common on rolling ground, where a longer stride downhill does the work.",
        confidence: "medium" as const,
        relatedMetrics: ["cadence" as const, "pace" as const, "gradient" as const],
      });
    } else {
      explanations.push({
        text: risesWithSpeed
          ? `There is ${strength} relationship between the two: quicker running came with a quicker step rate, about ${Math.abs(Math.round(difference))} steps per minute more at the fast end than at the slow end. Some of the extra speed came from turnover and the rest from a longer stride.`
          : `Cadence ran ${strength === "a weak" ? "slightly higher" : "higher"} in the slower bands than the faster ones, which is the reverse of the usual pattern. Short quick steps on a climb or through a technical section will produce it, so it is worth reading alongside the gradient comparison.`,
        confidence: strength === "a strong" || strength === "a moderate" ? ("high" as const) : ("medium" as const),
        relatedMetrics: ["cadence" as const, "pace" as const],
      });
    }

    return {
      information: [
        ...comparisonStats(comparison, "band"),
        {
          label: "Relationship",
          value: Number.isFinite(comparison.r) ? comparison.r.toFixed(2) : "—",
          note: "correlation",
        },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "Two ways to run faster",
          text: "Speed is cadence multiplied by stride length. A runner who speeds up without changing step rate has lengthened their stride; one whose step rate climbs with pace is doing it through turnover. Neither is the correct answer, but knowing which one you do is the point of this comparison.",
        },
        CADENCE_IS_PERSONAL,
      ],
    };
  },

  View({ result }) {
    return (
      <CadenceComparison
        comparison={result.comparison}
        xLabel="Pace (min/km) — faster on the left"
        formatX={(value) => formatPace(value)}
        rowLabel="At"
        description="Cadence plotted against pace, with the average cadence in each pace band"
        note="Each faint dot is one second of running. The line joins the average cadence within each pace band, and the bands are set so each holds a similar amount of running."
      />
    );
  },
});

export default cadenceVsPaceWidget;
