import { defineWidget } from "../contract";
import { samplesBetween, type DerivedActivity, type Split } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import { ProportionBars } from "@/viz/primitives";
import { collect, mean, median } from "@/lib/stats";
import { formatCadence, formatDistance, formatGradient, formatPaceWithUnit } from "@/lib/format";
import { NOISE_FLOOR } from "../helpers";
import { MIN_CADENCE_SECONDS, runningCadence, runningCadenceOf } from "../cadenceHelpers";
import shared from "../shared.module.css";

/**
 * Step rate kilometre by kilometre.
 *
 * Each split's cadence is recomputed here from its running seconds rather than
 * read off the split record, which averages the stopped seconds in as well. A
 * kilometre containing a traffic light would otherwise look like a kilometre run
 * with a collapsed rhythm.
 *
 * The kilometres stay in the order they were run. A ranking would invite the
 * reader to treat the lowest one as a failure when it was usually the hill.
 */

interface Row {
  index: number;
  label: string;
  startT: number;
  endT: number;
  cadenceSpm: number;
  paceSecPerKm: number;
  avgGradientPct: number;
  gainM: number;
  partial: boolean;
  distanceM: number;
}

interface Result {
  rows: Row[];
  runMedian: number;
  highest: Row;
  lowest: Row;
  spread: number;
}

/** A split needs this much running in it before its average means anything. */
const MIN_SPLIT_SECONDS = 30;

export const cadenceBySplitWidget = defineWidget<Result>({
  id: "cadence-by-split",
  title: "Cadence by kilometre",
  description: "Step rate for each kilometre, with the terrain that shaped it.",
  section: "cadence",
  requiredMetrics: ["cadence", "distance"],

  compute(activity) {
    const values = runningCadence(activity);
    if (values.length < MIN_CADENCE_SECONDS || activity.splits.length < 2) return null;

    const rows = activity.splits
      .map((split) => buildRow(activity, split))
      .filter((row): row is Row => row !== null);
    if (rows.length < 2) return null;

    const cadences = rows.map((row) => row.cadenceSpm);
    const highest = rows.reduce((a, b) => (b.cadenceSpm > a.cadenceSpm ? b : a));
    const lowest = rows.reduce((a, b) => (b.cadenceSpm < a.cadenceSpm ? b : a));

    return {
      rows,
      runMedian: median(values),
      highest,
      lowest,
      spread: Math.max(...cadences) - Math.min(...cadences),
    };
  },

  narrate(result) {
    const observations = [
      {
        text:
          result.spread < NOISE_FLOOR.cadenceSpm
            ? `Every kilometre was run at effectively the same step rate, within ${Math.round(result.spread)} spm of the others.`
            : `${result.highest.label} carried the quickest rhythm at ${formatCadence(result.highest.cadenceSpm)} and ${result.lowest.label} the slowest at ${formatCadence(result.lowest.cadenceSpm)}, a spread of ${Math.round(result.spread)} steps per minute.`,
        evidence:
          result.spread < NOISE_FLOOR.cadenceSpm
            ? []
            : [
                {
                  label: result.highest.label,
                  startT: result.highest.startT,
                  endT: result.highest.endT,
                },
                {
                  label: result.lowest.label,
                  startT: result.lowest.startT,
                  endT: result.lowest.endT,
                },
              ],
      },
    ];

    const explanations = [];
    if (result.spread >= NOISE_FLOOR.cadenceSpm) {
      // What matters is how the two kilometres differed, not how much the
      // slower one climbed in absolute terms: if both went uphill equally, the
      // terrain explains nothing about the gap between them.
      const extraGain = result.lowest.gainM - result.highest.gainM;
      const extraGradient = result.lowest.avgGradientPct - result.highest.avgGradientPct;
      const climbed = extraGain >= 10 || extraGradient >= 1.5;
      const slower = result.lowest.paceSecPerKm - result.highest.paceSecPerKm;

      explanations.push({
        text: climbed
          ? `${result.lowest.label} climbed ${Math.round(result.lowest.gainM)} m at an average of ${formatGradient(result.lowest.avgGradientPct)}, against ${Math.round(result.highest.gainM)} m on ${result.highest.label.toLowerCase()}. Step rate falls on rising ground for almost everyone, so the terrain accounts for a good part of this difference.`
          : slower >= 10
            ? `${result.lowest.label} was also ${Math.round(slower)} seconds per kilometre slower than ${result.highest.label.toLowerCase()}. Cadence follows speed closely, so the two are likely the same change seen twice rather than two findings.`
            : `Neither the gradient nor the pace of ${result.lowest.label.toLowerCase()} accounts for its lower step rate, which leaves fatigue, footing or a change in stride as the remaining explanations.`,
        confidence: climbed ? ("high" as const) : slower >= 10 ? ("medium" as const) : ("low" as const),
        relatedMetrics: ["cadence" as const, "pace" as const, "gradient" as const],
      });
    }

    return {
      information: [
        { label: "Kilometres", value: `${result.rows.length}` },
        { label: "Highest", value: formatCadence(result.highest.cadenceSpm), note: result.highest.label },
        { label: "Lowest", value: formatCadence(result.lowest.cadenceSpm), note: result.lowest.label },
        { label: "Spread", value: `${Math.round(result.spread)} spm` },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "Kilometres are not comparable by default",
          text: "Splits are decided by where the run started, not by where anything changed. One kilometre may be entirely uphill and the next entirely down, so a difference in step rate between them is usually a fact about the route before it is a fact about the runner.",
        },
      ],
    };
  },

  View({ result }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    // Bars are drawn across the run's own range rather than from zero: every
    // cadence in a run sits in a narrow band, and a bar from zero would make
    // real differences invisible. The floor keeps the smallest bar readable.
    const min = result.lowest.cadenceSpm;
    const span = Math.max(1, result.highest.cadenceSpm - min);

    return (
      <div>
        <ProportionBars
          rows={result.rows.map((row) => ({
            id: `${row.index}`,
            label: row.partial ? formatDistance(row.distanceM) : `km ${row.index}`,
            fraction: 0.2 + ((row.cadenceSpm - min) / span) * 0.8,
            valueLabel: formatCadence(row.cadenceSpm),
            color: "var(--metric-cadence)",
            detail: `${formatPaceWithUnit(row.paceSecPerKm)} · ${formatGradient(row.avgGradientPct)} average gradient`,
          }))}
          selectedId={highlight?.kind === "split" ? `${highlight.index}` : undefined}
          onSelect={(id) => {
            const row = result.rows.find((candidate) => `${candidate.index}` === id);
            if (!row) return;
            focusRegion(
              row.startT,
              row.endT,
              { kind: "split", index: row.index },
              "cadence-by-split",
            );
          }}
        />

        <p className={shared.note}>
          Bar length spans this run&rsquo;s own range of {Math.round(min)} to{" "}
          {Math.round(result.highest.cadenceSpm)} steps per minute, not zero to the highest.
          Kilometres with less than {MIN_SPLIT_SECONDS} seconds of running are left out.
        </p>
      </div>
    );
  },
});

function buildRow(activity: DerivedActivity, split: Split): Row | null {
  const window = samplesBetween(activity, split.startT, split.endT);
  const values = collect(window, runningCadenceOf);
  if (values.length < MIN_SPLIT_SECONDS) return null;

  const partial = split.tags.includes("partial");
  return {
    index: split.index,
    label: partial ? `The final ${formatDistance(split.distanceM)}` : `Kilometre ${split.index}`,
    startT: split.startT,
    endT: split.endT,
    cadenceSpm: mean(values),
    paceSecPerKm: split.paceSecPerKm,
    avgGradientPct: split.avgGradientPct,
    gainM: split.gainM,
    partial,
    distanceM: split.distanceM,
  };
}

export default cadenceBySplitWidget;
