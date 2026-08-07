import { defineWidget } from "../contract";
import { formatCadence, formatGradient } from "@/lib/format";
import { NOISE_FLOOR } from "../helpers";
import {
  CADENCE_IS_PERSONAL,
  MIN_CADENCE_SECONDS,
  describeStrength,
  runningCadence,
} from "../cadenceHelpers";
import {
  buildComparison,
  CadenceComparison,
  comparisonStats,
  type Comparison,
} from "../cadenceComparison";

/**
 * Step rate against the slope underfoot.
 *
 * Unlike pace and heart rate, the bands here are fixed rather than set from the
 * data: the boundary between flat and rising ground is a fact about the world,
 * not about this run, and it is the same two per cent the rest of the page uses
 * for terrain.
 */

interface Result {
  comparison: Comparison;
  uphill?: number;
  flat?: number;
  downhill?: number;
}

/** The same coarse boundaries the terrain sections use, split once more at 6%. */
const EDGES = [-25, -6, -2, 2, 6, 25];

export const cadenceVsGradientWidget = defineWidget<Result>({
  id: "cadence-vs-gradient",
  title: "Cadence against gradient",
  description: "How the ground underfoot changed the step rhythm.",
  section: "cadence",
  requiredMetrics: ["cadence", "gradient"],

  compute(activity) {
    if (runningCadence(activity).length < MIN_CADENCE_SECONDS) return null;

    const comparison = buildComparison(
      activity,
      (s) => s.gradientPct,
      EDGES,
      gradientLabel,
    );
    if (!comparison) return null;

    const at = (from: number) => comparison.bins.find((bin) => bin.from === from)?.cadenceSpm;

    return {
      comparison,
      uphill: at(2) ?? at(6),
      flat: at(-2),
      downhill: at(-6) ?? at(-25),
    };
  },

  narrate(result) {
    const { comparison, uphill, flat, downhill } = result;
    const strength = describeStrength(comparison.r);

    const observations = [];
    if (flat !== undefined && uphill !== undefined) {
      const delta = uphill - flat;
      observations.push({
        text:
          Math.abs(delta) < NOISE_FLOOR.cadenceSpm
            ? `Step rate on rising ground was effectively the same as on the flat, at ${formatCadence(uphill)} against ${formatCadence(flat)}.`
            : `Rising ground was run at ${formatCadence(uphill)} against ${formatCadence(flat)} on the flat, ${Math.abs(Math.round(delta))} steps per minute ${delta > 0 ? "quicker" : "slower"}.`,
      });
    }
    if (flat !== undefined && downhill !== undefined) {
      const delta = downhill - flat;
      if (Math.abs(delta) >= NOISE_FLOOR.cadenceSpm) {
        observations.push({
          text: `On falling ground the rhythm ran ${Math.abs(Math.round(delta))} steps per minute ${delta > 0 ? "quicker" : "slower"} than on the flat, at ${formatCadence(downhill)}.`,
        });
      }
    }
    if (observations.length === 0) {
      observations.push({
        text: `Cadence averaged between ${Math.round(Math.min(...comparison.bins.map((b) => b.cadenceSpm)))} and ${Math.round(Math.max(...comparison.bins.map((b) => b.cadenceSpm)))} steps per minute across the gradients this run covered.`,
      });
    }

    const explanations = [];
    if (flat !== undefined && uphill !== undefined && uphill - flat <= -NOISE_FLOOR.cadenceSpm) {
      explanations.push({
        text: "A shorter, slower stride uphill is what climbing normally looks like: the same effort buys less ground, and most runners shorten their stride rather than fight for turnover. This is the terrain showing up in the rhythm rather than anything about the runner.",
        confidence: "high" as const,
        relatedMetrics: ["cadence" as const, "gradient" as const, "pace" as const],
      });
    } else if (flat !== undefined && uphill !== undefined && uphill - flat >= NOISE_FLOOR.cadenceSpm) {
      explanations.push({
        text: "Step rate rose on the climbs. Shortening the stride while keeping the legs turning over is a deliberate way to run uphill, and it is also what happens when a runner switches to a hill-climbing gait without meaning to.",
        confidence: "medium" as const,
        relatedMetrics: ["cadence" as const, "gradient" as const],
      });
    } else if (strength === "no") {
      explanations.push({
        text: "The ground made no measurable difference to the step rhythm in this run. On a route this flat there is often not enough gradient to separate, so this says more about the route than about how the runner handles hills.",
        confidence: "medium" as const,
        relatedMetrics: ["cadence" as const, "gradient" as const],
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
          title: "Gradient is the one comparison that is fair",
          text: "Comparing cadence between kilometres mixes terrain into the answer, because kilometres are decided by where the run started. Grouping the same seconds by the slope underfoot measures uphill running against other uphill running, which is the only way to see whether the rhythm actually changed.",
        },
        CADENCE_IS_PERSONAL,
      ],
    };
  },

  View({ result }) {
    return (
      <CadenceComparison
        comparison={result.comparison}
        xLabel="Gradient (%) — downhill on the left"
        formatX={(value) => formatGradient(value)}
        rowLabel="On"
        description="Cadence plotted against gradient, with the average cadence on each kind of ground"
        note="Each faint dot is one second of running. Bands are fixed at the flat, rising and falling boundaries the rest of the page uses, so a band with too little running in it is left out rather than averaged from a handful of seconds."
      />
    );
  },
});

function gradientLabel(from: number, to: number): string {
  const middle = (from + to) / 2;
  if (middle <= -6) return `steeply downhill (below ${formatGradient(-6)})`;
  if (middle < -2) return `downhill (${formatGradient(-6)} to ${formatGradient(-2)})`;
  if (middle <= 2) return `flat (${formatGradient(-2)} to ${formatGradient(2)})`;
  if (middle < 6) return `uphill (${formatGradient(2)} to ${formatGradient(6)})`;
  return `steeply uphill (above ${formatGradient(6)})`;
}

export default cadenceVsGradientWidget;
