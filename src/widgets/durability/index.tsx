import { defineWidget } from "../contract";
import { Figure, MetricRows, Scatter } from "@/viz/primitives";
import { formatDistanceShort, formatHeartRate, formatPaceWithUnit } from "@/lib/format";
import {
  RESEARCH,
  decouplingPct,
  LAB_IS_PROVISIONAL,
  signedPct,
  MIN_COMPARABLE_MOVING_S,
  movingSamples,
  splitIntoSegments,
  terrainConfounds,
  WARMUP_S,
  type SegmentProfile,
} from "../labHelpers";
import { heatContext } from "../weatherContext";
import shared from "../shared.module.css";

/**
 * Whether speed kept costing the same as the run went on.
 *
 * The existing drift card answers a narrower version of this: heart rate in the
 * first half against the second. This one carries the same idea across the
 * whole run at once, and does it in a unit the reader can hold — metres covered
 * per heartbeat. A run where that figure holds flat produced the same movement
 * for the same cost from start to finish. A run where it falls away needed more
 * of the runner to keep going, whether or not the pace showed it.
 *
 * It is deliberately not a fitness score. The figure is only comparable within
 * one run on similar ground, which is why terrain is checked before anything is
 * attributed to the runner.
 */

/** Quarters: enough to show a shape, few enough that each holds real running. */
const SEGMENT_COUNT = 4;

/** Below this the change is inside what consumer heart rate wanders by anyway. */
const MEANINGFUL_DECOUPLING_PCT = 3;

interface Result {
  segments: SegmentProfile[];
  first: SegmentProfile;
  last: SegmentProfile;
  /** Percent fall in metres per beat from the first quarter to the last. */
  decouplingPct: number;
  paceDeltaSecPerKm: number;
  hrDeltaBpm: number;
  /** Whether the change in terrain could account for the change in efficiency. */
  terrainConfounded: boolean;
  gradientDeltaPct: number;
}

export const durabilityWidget = defineWidget<Result>({
  id: "cardiac-durability",
  title: "Cardiac durability",
  description:
    "Whether a metre of running kept costing the same number of heartbeats from the start of the run to the end.",
  section: "lab",
  status: "beta",
  requiredMetrics: ["heartRate", "pace"],
  // Speed and heart rate are both recorded; metres per beat is
  // arithmetic on them, with no model in between.
  provenance: "derived",
  references: [
    RESEARCH.marathonDurability,
    RESEARCH.economyMetaAnalysis,
  ],

  compute(activity) {
    // The opening minutes are dropped before anything is compared, so the card
    // reports what the run did rather than what the warm-up did.
    if (movingSamples(activity).length < WARMUP_S + MIN_COMPARABLE_MOVING_S) return null;

    const all = splitIntoSegments(activity, SEGMENT_COUNT, { warmupS: WARMUP_S });
    const segments = all.filter((segment) => segment.metresPerBeat !== undefined);
    // A shape needs every quarter; a gap in heart rate would otherwise be read
    // as the run changing.
    if (segments.length < SEGMENT_COUNT) return null;

    const first = segments[0];
    const last = segments[segments.length - 1];
    if (first.paceSecPerKm === undefined || last.paceSecPerKm === undefined) return null;
    if (first.hrBpm === undefined || last.hrBpm === undefined) return null;

    const fall = decouplingPct(first.metresPerBeat!, last.metresPerBeat!);

    return {
      segments,
      first,
      last,
      decouplingPct: fall,
      paceDeltaSecPerKm: last.paceSecPerKm - first.paceSecPerKm,
      hrDeltaBpm: last.hrBpm - first.hrBpm,
      terrainConfounded: terrainConfounds(first, last, fall > 0),
      gradientDeltaPct: (last.gradientPct ?? 0) - (first.gradientPct ?? 0),
    };
  },

  narrate(result, activity) {
    const { first, last, decouplingPct: fall, paceDeltaSecPerKm, hrDeltaBpm } = result;
    const heat = heatContext(activity);
    const held = Math.abs(fall) < MEANINGFUL_DECOUPLING_PCT;
    const paceWord = paceDeltaSecPerKm > 0 ? "slower" : "faster";

    return {
      information: [
        {
          label: "Efficiency change",
          value: signedPct(-fall),
          note: "first quarter to last",
        },
        {
          label: "First quarter",
          value: `${first.metresPerBeat!.toFixed(2)} m/beat`,
        },
        {
          label: "Final quarter",
          value: `${last.metresPerBeat!.toFixed(2)} m/beat`,
        },
      ],

      observations: [
        {
          text: `In the first quarter you covered ${first.metresPerBeat!.toFixed(2)} metres per heartbeat at ${formatPaceWithUnit(first.paceSecPerKm)} and ${formatHeartRate(first.hrBpm)}. In the final quarter that was ${last.metresPerBeat!.toFixed(2)} metres per heartbeat at ${formatPaceWithUnit(last.paceSecPerKm)} and ${formatHeartRate(last.hrBpm)}.`,
          evidence: [
            { label: "First quarter", startT: first.startT, endT: first.endT },
            { label: "Final quarter", startT: last.startT, endT: last.endT },
          ],
        },
        {
          text: `Across the four quarters the average gradient went from ${first.gradientPct?.toFixed(1) ?? "0.0"}% to ${last.gradientPct?.toFixed(1) ?? "0.0"}%.`,
        },
      ],

      explanations: [
        result.terrainConfounded
          ? {
              text: `The final quarter averaged ${Math.abs(result.gradientDeltaPct).toFixed(1)}% ${result.gradientDeltaPct > 0 ? "steeper" : "gentler"} ground than the first, which moves efficiency in exactly the direction seen here. Terrain and the runner cannot be told apart on this run.`,
              confidence: "low",
              relatedMetrics: ["heartRate", "pace", "gradient"],
            }
          : {
              text: held
                ? `Efficiency held within ${MEANINGFUL_DECOUPLING_PCT}% from the first quarter to the last, which is what durability looks like: the closing quarter cost about what the opening one did.`
                : fall > 0
                  ? `Each metre cost more heartbeats by the end — heart rate ${hrDeltaBpm >= 0 ? "rose" : "fell"} ${Math.abs(Math.round(hrDeltaBpm))} bpm while pace was ${Math.abs(Math.round(paceDeltaSecPerKm))} s/km ${paceWord}${result.gradientDeltaPct < 0 ? ", and the closing ground was the gentler of the two, so the terrain was not what caused it" : ""}. ${heat.driftClause}`
                  : `Each metre cost fewer heartbeats by the end, which usually means the opening quarter was run before you had warmed up rather than that the finish was genuinely cheap.`,
              // Never higher: this is one run, and the figure cannot separate
              // fatigue from heat, fuelling or a slow warm-up.
              confidence: "medium",
              relatedMetrics: ["heartRate", "pace"],
            },
      ],

      teaching: [
        {
          title: "Metres per heartbeat",
          text: "Divide the speed you were running by the rate your heart was beating and you get the ground covered per beat. It is a cost figure: how much movement each unit of cardiovascular work bought. Watching it across one run is the useful part, because the absolute value depends on your maximum heart rate, the terrain and the day, and so means nothing next to another runner's.",
        },
        {
          title: "Why the start of the run is thrown away",
          text: "Heart rate lags the effort. For the first few minutes of any run it is still climbing towards the pace the legs are already holding, so a comparison that begins at second zero finds a large fall in efficiency every single time — on easy runs, on hard runs, on runs where nothing happened. Dropping the opening five minutes is what makes the rest of the comparison about the run rather than about that lag.",
        },
        {
          title: "Durability is not endurance",
          text: "Endurance is how long you can keep going. Durability, in the recent research sense, is how well your physiology and your form resist changing while you do — and the two come apart. A runner can finish comfortably while their heart rate has climbed twenty beats for the same pace. That drift is what this card looks for, and it is the part a finishing time hides.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { segments } = result;
    const values = segments.map((segment) => segment.metresPerBeat!);
    const low = Math.min(...values);
    const high = Math.max(...values);
    // The interesting movement here is a few percent, so the axis is padded
    // around the data rather than zeroed — with the caption saying so, because
    // a cut axis that does not admit it is the oldest chart trick there is.
    const padding = Math.max(0.02, (high - low) * 0.5);

    const points = segments.map((segment) => ({
      x: (segment.startDistanceM + segment.endDistanceM) / 2 / 1000,
      y: segment.metresPerBeat!,
    }));

    return (
      <div>
        <Figure
          description={`Metres covered per heartbeat across ${segments.length} quarters of the run, from ${values[0].toFixed(2)} to ${values[values.length - 1].toFixed(2)}.`}
          caption="Each point is a quarter of the run's moving time. The scale starts near the data, not at zero."
        >
          <Scatter
            points={[]}
            trend={points}
            xDomain={[points[0].x, points[points.length - 1].x]}
            yDomain={[low - padding, high + padding]}
            xTicks={points.map((point) => point.x)}
            yTicks={[...new Set([low, (low + high) / 2, high])]}
            formatX={(value) => `${value.toFixed(1)} km`}
            formatY={(value) => value.toFixed(2)}
            xLabel="Distance"
            yLabel="Metres per beat"
            color="var(--zone-3)"
            description="Efficiency across the quarters of the run"
            height={210}
          />
        </Figure>

        <MetricRows
          rows={segments.map((segment) => ({
            label: `${formatDistanceShort(segment.startDistanceM)} – ${formatDistanceShort(segment.endDistanceM)}`,
            value: `${segment.metresPerBeat!.toFixed(2)} m/beat`,
            detail: `${formatPaceWithUnit(segment.paceSecPerKm)} · ${formatHeartRate(segment.hrBpm)}`,
          }))}
        />

        <p className={shared.note}>
          The first {Math.round(WARMUP_S / 60)} minutes are left out, because
          heart rate is still climbing towards the effort during them. The
          quarters that remain hold equal moving time, so stopped seconds do not
          shift where one ends and the next begins.
        </p>
      </div>
    );
  },
});

export default durabilityWidget;
