import { defineWidget } from "../contract";
import type { DerivedActivity } from "@/model/activity";
import { Figure, MetricRows, Scatter } from "@/viz/primitives";
import { linearFit } from "@/lib/stats";
import { runningCadenceOf } from "@/model/pipeline/events/cadence";
import {
  formatCadence,
  formatDistanceShort,
  formatPaceWithUnit,
  formatSigned,
} from "@/lib/format";
import { NOISE_FLOOR } from "../helpers";
import {
  LAB_IS_PROVISIONAL,
  movingSamples,
  RESEARCH,
  splitIntoSegments,
  type SegmentProfile,
} from "../labHelpers";
import shared from "../shared.module.css";

/**
 * Whether cadence changed for a reason other than slowing down.
 *
 * Cadence falling late in a run is usually unremarkable: it falls because the
 * runner is going slower, and turnover tracks speed. The cadence section
 * already shows that relationship. The question this card asks is what is left
 * once the slowdown is accounted for — whether turnover dropped *further* than
 * this runner's own speed–cadence relationship says it should have.
 *
 * The relationship is learned from the first half of the run and used to
 * predict the second, rather than fitted across the whole run. Fitting across
 * everything would absorb the drift into the line and hide the very thing the
 * card is looking for.
 */

const SEGMENT_COUNT = 4;

/** The prediction needs a spread of speeds to learn from, not one steady pace. */
const MIN_SPEED_SPREAD_MPS = 0.15;

interface Result {
  segments: SegmentProfile[];
  first: SegmentProfile;
  last: SegmentProfile;
  cadenceDeltaSpm: number;
  paceDeltaSecPerKm: number;
  /** Cadence the first half's speed–cadence relationship predicts for the last quarter. */
  predictedSpm?: number;
  /** Actual minus predicted: the part the slowdown does not account for. */
  residualSpm?: number;
}

export const cadenceDurabilityWidget = defineWidget<Result>({
  id: "cadence-durability",
  title: "Cadence durability",
  description:
    "Whether turnover fell further than your own slowdown accounts for, using the speed–cadence relationship from the first half of this run.",
  section: "lab",
  status: "beta",
  requiredMetrics: ["cadence", "pace"],
  // Cadence and speed are recorded, but the headline figure is a residual
  // against a fitted line, which is a model.
  provenance: "estimated",
  references: [RESEARCH.marathonDurability, RESEARCH.economyMetaAnalysis],

  compute(activity) {
    const all = splitIntoSegments(activity, SEGMENT_COUNT);
    const segments = all.filter(
      (segment) => segment.cadenceSpm !== undefined && segment.speedMps !== undefined,
    );
    if (segments.length < SEGMENT_COUNT) return null;

    const first = segments[0];
    const last = segments[segments.length - 1];

    const prediction = predictCadence(activity, last.speedMps!);

    return {
      segments,
      first,
      last,
      cadenceDeltaSpm: last.cadenceSpm! - first.cadenceSpm!,
      paceDeltaSecPerKm: (last.paceSecPerKm ?? 0) - (first.paceSecPerKm ?? 0),
      predictedSpm: prediction,
      residualSpm: prediction === undefined ? undefined : last.cadenceSpm! - prediction,
    };
  },

  narrate(result) {
    const { first, last, cadenceDeltaSpm, paceDeltaSecPerKm, residualSpm } = result;
    const held = Math.abs(cadenceDeltaSpm) < NOISE_FLOOR.cadenceSpm;
    const slowed = paceDeltaSecPerKm > NOISE_FLOOR.paceSecPerKm;

    const information = [
      {
        label: "Cadence change",
        value: formatSigned(cadenceDeltaSpm, "spm"),
        note: "first quarter to last",
      },
      {
        label: "Pace change",
        value: formatSigned(paceDeltaSecPerKm, "s/km"),
      },
    ];
    if (residualSpm !== undefined) {
      information.push({
        label: "Beyond the slowdown",
        value: formatSigned(residualSpm, "spm"),
        note: "against your own speed–cadence line",
      });
    }

    const observations = [
      {
        text: `Cadence averaged ${formatCadence(first.cadenceSpm)} in the first quarter at ${formatPaceWithUnit(first.paceSecPerKm)}, and ${formatCadence(last.cadenceSpm)} in the final quarter at ${formatPaceWithUnit(last.paceSecPerKm)}.`,
        evidence: [
          { label: "First quarter", startT: first.startT, endT: first.endT },
          { label: "Final quarter", startT: last.startT, endT: last.endT },
        ],
      },
    ];
    if (result.predictedSpm !== undefined) {
      observations.push({
        text: `At the speed you were running in the final quarter, the first half of this run would predict ${formatCadence(result.predictedSpm)}.`,
        evidence: [],
      });
    }

    return {
      information,
      observations,

      explanations: [
        residualSpm === undefined
          ? {
              text: "This run held too narrow a range of speeds to learn a speed–cadence relationship from, so the cadence change cannot be separated from the change in pace.",
              confidence: "low",
              relatedMetrics: ["cadence", "pace"],
            }
          : Math.abs(residualSpm) < NOISE_FLOOR.cadenceSpm
            ? {
                text: held
                  ? "Cadence barely moved, and what movement there was is what your own speed–cadence relationship predicts. Turnover held."
                  : `Cadence ${cadenceDeltaSpm < 0 ? "fell" : "rose"} ${Math.abs(Math.round(cadenceDeltaSpm))} steps, but that is what your own relationship between speed and turnover predicts for ${slowed ? "the slower pace you finished at" : "the pace you finished at"}. The rhythm did not come apart; the speed changed and the rhythm followed.`,
                confidence: "medium",
                relatedMetrics: ["cadence", "pace"],
              }
            : {
                text:
                  residualSpm < 0
                    ? `Turnover dropped about ${Math.abs(Math.round(residualSpm))} steps further than the slowdown alone accounts for. Cadence falling independently of speed is one of the things fatigue does, though a change of surface or a deliberate easing-off looks identical here.`
                    : `Turnover held about ${Math.round(residualSpm)} steps higher than the slowdown predicts, so you were taking quicker, shorter steps at the end than earlier in the run at the same speed.`,
                confidence: "medium",
                relatedMetrics: ["cadence", "pace"],
              },
      ],

      teaching: [
        {
          title: "Why the slowdown has to be removed first",
          text: "Turnover and speed move together for nearly every runner, so cadence at the end of a run is almost always lower than at the start — simply because the end is usually slower. Reporting that as a finding would be reporting the slowdown twice. What is worth knowing is the part left over: whether the rhythm gave way beyond what the pace explains.",
        },
        {
          title: "A line learned from you, on this run",
          text: "The prediction comes from fitting speed against cadence across the first half of this run, then asking what that line expects at the final quarter's speed. It is your relationship on this day, not a general one — which is the point, because the slope differs a lot between runners. It also means a run with very little variation in speed has almost nothing to fit, and the card says so instead of guessing.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { segments } = result;
    const values = segments.map((segment) => segment.cadenceSpm!);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = Math.max(1.5, (high - low) * 0.5);

    const points = segments.map((segment) => ({
      x: (segment.startDistanceM + segment.endDistanceM) / 2 / 1000,
      y: segment.cadenceSpm!,
    }));

    return (
      <div>
        <Figure
          description={`Cadence across ${segments.length} quarters of the run, from ${Math.round(values[0])} to ${Math.round(values[values.length - 1])} steps per minute.`}
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
            formatY={(value) => `${Math.round(value)}`}
            xLabel="Distance"
            yLabel="Steps per minute"
            color="var(--zone-4)"
            description="Cadence across the quarters of the run"
            height={210}
          />
        </Figure>

        <MetricRows
          rows={segments.map((segment) => ({
            label: `${formatDistanceShort(segment.startDistanceM)} – ${formatDistanceShort(segment.endDistanceM)}`,
            value: formatCadence(segment.cadenceSpm),
            detail: formatPaceWithUnit(segment.paceSecPerKm),
          }))}
        />

        <p className={shared.note}>
          Only seconds the cadence section counts as running are included, so
          walked and stopped time cannot pull the figure down.
        </p>
      </div>
    );
  },
});

/**
 * What cadence the first half of the run expects at a given speed.
 *
 * Deliberately fitted on the first half only. A line through the whole run
 * would have the late drift baked into it, and the residual it produced would
 * be smaller than the truth by exactly the amount being looked for.
 */
function predictCadence(
  activity: DerivedActivity,
  speedMps: number,
): number | undefined {
  const moving = movingSamples(activity);
  const firstHalf = moving.slice(0, Math.floor(moving.length / 2));

  const speeds: number[] = [];
  const cadences: number[] = [];
  for (const sample of firstHalf) {
    const cadence = runningCadenceOf(sample);
    if (cadence === undefined || sample.speedMps === undefined) continue;
    speeds.push(sample.speedMps);
    cadences.push(cadence);
  }

  // A line fitted through one speed says nothing about any other speed.
  if (speeds.length < 60) return undefined;
  const spread = Math.max(...speeds) - Math.min(...speeds);
  if (spread < MIN_SPEED_SPREAD_MPS) return undefined;

  const fit = linearFit(speeds, cadences);
  if (!fit) return undefined;

  const predicted = fit.intercept + fit.slope * speedMps;
  return Number.isFinite(predicted) && predicted > 0 ? predicted : undefined;
}

export default cadenceDurabilityWidget;
