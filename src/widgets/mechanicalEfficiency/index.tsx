import { defineWidget } from "../contract";
import { Figure, MetricRows, Scatter } from "@/viz/primitives";
import { formatDistanceShort, formatPaceWithUnit, formatPower } from "@/lib/format";
import {
  decouplingPct,
  LAB_IS_PROVISIONAL,
  RESEARCH,
  signedPct,
  splitIntoSegments,
  terrainConfounds,
  type SegmentProfile,
} from "../labHelpers";
import shared from "../shared.module.css";

/**
 * How much speed the work was buying.
 *
 * The other efficiency cards divide something by heart rate, so they answer
 * what the run cost *you*. This one never mentions heart rate: it asks what the
 * mechanical output bought in forward speed, which is a question about the
 * running rather than about the runner. The two can move in opposite
 * directions — a runner can hold speed per watt exactly while their heart rate
 * climbs, and that pair of facts is more informative than either alone.
 *
 * Terrain matters more here than anywhere else in the section, because power
 * rises on a climb while speed falls, so the ratio drops on a hill without
 * anything having changed about the runner. A comparison across different
 * ground is refused rather than explained away.
 */

const SEGMENT_COUNT = 4;

/** Below this the change sits inside what the power model varies by anyway. */
const MEANINGFUL_PCT = 5;

/** Speed in km/h bought per 100 watts, which is the figure the card shows. */
function speedPerHundredWatts(segment: SegmentProfile): number | undefined {
  if (segment.speedMps === undefined || segment.powerW === undefined) return undefined;
  if (segment.powerW <= 0) return undefined;
  return ((segment.speedMps * 3.6) / segment.powerW) * 100;
}

interface Result {
  segments: SegmentProfile[];
  ratios: number[];
  first: number;
  last: number;
  /** Percent fall from the first quarter to the last. */
  changePct: number;
  terrainConfounded: boolean;
  gradientDeltaPct: number;
}

export const mechanicalEfficiencyWidget = defineWidget<Result>({
  id: "mechanical-efficiency",
  title: "Speed for the power",
  description:
    "How much forward speed each unit of estimated mechanical output bought, and whether that held across the run.",
  section: "lab",
  status: "beta",
  // Power is modelled by the watch rather than measured, so every figure here
  // inherits that model even though speed itself is recorded.
  provenance: "estimated",
  requiredMetrics: ["power", "pace"],
  references: [RESEARCH.runningPower, RESEARCH.economyMetaAnalysis],

  compute(activity) {
    const all = splitIntoSegments(activity, SEGMENT_COUNT);
    const segments = all.filter((segment) => speedPerHundredWatts(segment) !== undefined);
    if (segments.length < SEGMENT_COUNT) return null;

    const ratios = segments.map((segment) => speedPerHundredWatts(segment)!);
    const first = ratios[0];
    const last = ratios[ratios.length - 1];
    const changePct = decouplingPct(first, last);

    return {
      segments,
      ratios,
      first,
      last,
      changePct,
      terrainConfounded: terrainConfounds(
        segments[0],
        segments[segments.length - 1],
        changePct > 0,
      ),
      gradientDeltaPct:
        (segments[segments.length - 1].gradientPct ?? 0) - (segments[0].gradientPct ?? 0),
    };
  },

  narrate(result) {
    const { segments, first, last, changePct } = result;
    const held = Math.abs(changePct) < MEANINGFUL_PCT;
    const opening = segments[0];
    const closing = segments[segments.length - 1];

    return {
      information: [
        {
          label: "Speed per 100 W",
          value: `${last.toFixed(1)} km/h`,
          note: "final quarter",
        },
        { label: "Change", value: signedPct(-changePct), note: "first quarter to last" },
        {
          label: "Output",
          value: formatPower(closing.powerW),
        },
      ],

      observations: [
        {
          text: `In the first quarter ${formatPower(opening.powerW)} was producing ${formatPaceWithUnit(opening.paceSecPerKm)}, or ${first.toFixed(1)} km/h per 100 W. In the final quarter ${formatPower(closing.powerW)} was producing ${formatPaceWithUnit(closing.paceSecPerKm)}, or ${last.toFixed(1)} km/h per 100 W.`,
          evidence: [
            { label: "First quarter", startT: opening.startT, endT: opening.endT },
            { label: "Final quarter", startT: closing.startT, endT: closing.endT },
          ],
        },
      ],

      explanations: [
        result.terrainConfounded
          ? {
              text: `The closing quarter averaged ${Math.abs(result.gradientDeltaPct).toFixed(1)}% ${result.gradientDeltaPct > 0 ? "steeper" : "gentler"} ground than the opening one. Climbing costs power and returns less speed, so this ratio moves with the gradient on its own and cannot be read as the running changing.`,
              confidence: "low",
              relatedMetrics: ["power", "pace", "gradient"],
            }
          : {
              text: held
                ? "The same output kept buying the same speed from start to finish, so whatever else changed during this run, the mechanical side of it held."
                : changePct > 0
                  ? "Each watt bought less speed by the end. On comparable ground that points at the mechanics themselves — a stride that has stopped returning what it did — rather than at the cardiovascular side, which this card never looks at."
                  : "Each watt bought more speed by the end, which most often means the opening quarter was run with more vertical movement or a less settled stride than the closing one.",
              confidence: "medium",
              relatedMetrics: ["power", "pace"],
            },
      ],

      teaching: [
        {
          title: "Speed per watt against watts per beat",
          text: "These are two different questions and the page shows both. Watts per beat asks what your body paid for the output. Speed per watt asks what the output bought in forward motion — no heart rate involved. A run where the first holds and the second falls is one where the mechanics gave way while the engine did not; the reverse is a run where you were still moving well but paying more to do it.",
        },
        {
          title: "Why this one is only ever yours",
          text: "The watch does not measure power, it models it from motion and pace. That model differs between devices and between firmware versions, so this ratio cannot be compared against another runner, another watch, or a bike power meter — and a number that looks poor may only mean your watch's model runs low. Within one run on one device it is consistent enough to compare against itself, which is the only comparison made here.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { segments, ratios } = result;
    const low = Math.min(...ratios);
    const high = Math.max(...ratios);
    const padding = Math.max(0.1, (high - low) * 0.5);

    const points = segments.map((segment, index) => ({
      x: (segment.startDistanceM + segment.endDistanceM) / 2 / 1000,
      y: ratios[index],
    }));

    return (
      <div>
        <Figure
          description={`Speed produced per 100 watts across ${segments.length} quarters, from ${ratios[0].toFixed(1)} to ${ratios[ratios.length - 1].toFixed(1)} km/h.`}
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
            formatY={(value) => value.toFixed(1)}
            xLabel="Distance"
            yLabel="km/h per 100 W"
            color="var(--zone-5)"
            description="Speed bought per unit of output across the run"
            height={210}
          />
        </Figure>

        <MetricRows
          rows={segments.map((segment, index) => ({
            label: `${formatDistanceShort(segment.startDistanceM)} – ${formatDistanceShort(segment.endDistanceM)}`,
            value: `${ratios[index].toFixed(1)} km/h`,
            detail: `${formatPower(segment.powerW)} · ${formatPaceWithUnit(segment.paceSecPerKm)}`,
          }))}
        />

        <p className={shared.note}>
          Power per kilogram would be the comparable figure between runners, but
          this app never asks your weight, so everything here stays in watts.
        </p>
      </div>
    );
  },
});

export default mechanicalEfficiencyWidget;
