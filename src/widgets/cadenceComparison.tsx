import type { DerivedActivity, Sample } from "@/model/activity";
import { MetricRows, Scatter } from "@/viz/primitives";
import { niceTicks } from "@/viz/scales";
import { percentile } from "@/lib/stats";
import { formatCadence, formatDuration } from "@/lib/format";
import {
  binCadenceAgainst,
  cadenceCorrelation,
  cadencePoints,
  runningCadence,
  type CadenceBin,
  type CadencePoint,
} from "./cadenceHelpers";
import shared from "./shared.module.css";

/**
 * The shape the three "cadence against another metric" sections share.
 *
 * All three ask the same question — did step rate move with this? — so they ask
 * it in the same form: the per-second cloud faintly, the binned means over it,
 * and the same table underneath. Building it once means the three cannot drift
 * into three different-looking answers to one question.
 */

export interface Comparison {
  points: CadencePoint[];
  bins: CadenceBin[];
  /** Correlation across the running seconds. NaN when there is too little. */
  r: number;
  xLow: number;
  xHigh: number;
  cadenceLow: number;
  cadenceHigh: number;
  /** Cadence difference between the highest and lowest bin. */
  binSpread: number;
}

/** Trims the outer 2% of the other metric so one bad reading cannot set the axis. */
const CLIP = 0.02;

export function buildComparison(
  activity: DerivedActivity,
  pick: (sample: Sample) => number | undefined,
  edges: number[],
  label: (from: number, to: number) => string,
): Comparison | null {
  const points = cadencePoints(activity, pick);
  if (points.length < 60) return null;

  const bins = binCadenceAgainst(activity, pick, edges, label);
  if (bins.length < 2) return null;

  const xs = points.map((point) => point.x).sort((a, b) => a - b);
  const cadences = runningCadence(activity);
  const binCadences = bins.map((bin) => bin.cadenceSpm);

  return {
    points,
    bins,
    r: cadenceCorrelation(activity, pick),
    xLow: percentile(xs, CLIP),
    xHigh: percentile(xs, 1 - CLIP),
    cadenceLow: percentile(cadences, 0.01),
    cadenceHigh: percentile(cadences, 0.99),
    binSpread: Math.max(...binCadences) - Math.min(...binCadences),
  };
}

/** The information row every comparison shows, in the same order. */
export function comparisonStats(comparison: Comparison, otherLabel: string) {
  const highest = comparison.bins.reduce((a, b) => (b.cadenceSpm > a.cadenceSpm ? b : a));
  const lowest = comparison.bins.reduce((a, b) => (b.cadenceSpm < a.cadenceSpm ? b : a));

  return [
    {
      label: `Highest cadence ${otherLabel}`,
      value: formatCadence(highest.cadenceSpm),
      note: highest.label,
    },
    {
      label: `Lowest cadence ${otherLabel}`,
      value: formatCadence(lowest.cadenceSpm),
      note: lowest.label,
    },
    {
      label: "Difference",
      value: `${Math.round(comparison.binSpread)} spm`,
      note: "across the bands",
    },
  ];
}

export function CadenceComparison({
  comparison,
  xLabel,
  formatX,
  rowLabel,
  description,
  /** Draws the axis right to left, for a metric a runner reads that way. */
  invertX = false,
  note,
}: {
  comparison: Comparison;
  xLabel: string;
  formatX: (value: number) => string;
  rowLabel: string;
  description: string;
  invertX?: boolean;
  note: string;
}) {
  const { xLow, xHigh, cadenceLow, cadenceHigh } = comparison;
  const yPad = Math.max(2, (cadenceHigh - cadenceLow) * 0.08);

  const xDomain: [number, number] = invertX ? [xHigh, xLow] : [xLow, xHigh];
  const yDomain: [number, number] = [cadenceLow - yPad, cadenceHigh + yPad];

  return (
    <div>
      <Scatter
        points={comparison.points}
        xDomain={xDomain}
        yDomain={yDomain}
        xTicks={niceTicks(xLow, xHigh, 5)}
        yTicks={niceTicks(yDomain[0], yDomain[1], 4).map((tick) => Math.round(tick))}
        formatX={formatX}
        formatY={(value) => `${Math.round(value)}`}
        xLabel={xLabel}
        yLabel="Cadence (spm)"
        trend={comparison.bins.map((bin) => ({ x: bin.centre, y: bin.cadenceSpm }))}
        color="var(--metric-cadence)"
        description={description}
      />

      <MetricRows
        rows={comparison.bins.map((bin) => ({
          label: `${rowLabel} ${bin.label}`,
          value: formatCadence(bin.cadenceSpm),
          detail: formatDuration(bin.seconds),
        }))}
      />

      <p className={shared.note}>{note}</p>
    </div>
  );
}
