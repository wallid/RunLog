import { defineWidget } from "../contract";
import { HeroFigure, MetricRows, ProportionBars } from "@/viz/primitives";
import { formatCadence, formatDistanceShort, formatPaceWithUnit } from "@/lib/format";
import {
  LAB_IS_PROVISIONAL,
  signedPct,
  RESEARCH,
  splitIntoSegments,
  type SegmentProfile,
} from "../labHelpers";
import { windCaveat } from "../weatherContext";
import shared from "../shared.module.css";

/**
 * Which half of the stride gave way.
 *
 * Speed is exactly turnover multiplied by the ground covered per step, so any
 * change in speed can be split between the two without approximating anything.
 * That makes this the one mechanical question a wrist recording can answer
 * properly: a slowdown is either the feet landing less often, or covering less
 * ground each time they land, and the two mean different things.
 *
 * Step length shortening while turnover holds is the pattern the marathon
 * durability work associates with fatigue. Turnover falling while the step
 * stays long is the other way round, and is more often a runner easing off.
 * The card names which happened and declines to rank them.
 */

const SEGMENT_COUNT = 4;

/** Below this, a percentage change is inside what the derivation itself wobbles by. */
const MEANINGFUL_PCT = 2;

interface Result {
  segments: SegmentProfile[];
  first: SegmentProfile;
  last: SegmentProfile;
  /** Percent changes from the first quarter to the last. Negative means fell. */
  speedPct: number;
  cadencePct: number;
  stridePct: number;
  /** Which of the two accounts for more of the speed change. */
  driver: "stride" | "cadence" | "neither";
}

export const strideDriftWidget = defineWidget<Result>({
  id: "stride-drift",
  title: "Where the speed went",
  description:
    "Splitting the change in speed between turnover and the ground covered per step, which together account for it exactly.",
  section: "lab",
  status: "beta",
  requiredMetrics: ["cadence", "pace"],
  // Step length is speed divided by step rate — exact arithmetic on two
  // recorded series, not an estimate.
  provenance: "derived",
  references: [RESEARCH.marathonDurability, RESEARCH.halfMarathonMechanics],

  compute(activity) {
    const all = splitIntoSegments(activity, SEGMENT_COUNT);
    const segments = all.filter(
      (segment) =>
        segment.strideLengthM !== undefined &&
        segment.cadenceSpm !== undefined &&
        segment.speedMps !== undefined,
    );
    if (segments.length < SEGMENT_COUNT) return null;

    const first = segments[0];
    const last = segments[segments.length - 1];

    const speedPct = percentChange(first.speedMps!, last.speedMps!);
    const cadencePct = percentChange(first.cadenceSpm!, last.cadenceSpm!);
    const stridePct = percentChange(first.strideLengthM!, last.strideLengthM!);

    return {
      segments,
      first,
      last,
      speedPct,
      cadencePct,
      stridePct,
      driver:
        Math.abs(stridePct) < MEANINGFUL_PCT && Math.abs(cadencePct) < MEANINGFUL_PCT
          ? "neither"
          : Math.abs(stridePct) >= Math.abs(cadencePct)
            ? "stride"
            : "cadence",
    };
  },

  narrate(result, activity) {
    const { first, last, speedPct, cadencePct, stridePct, driver } = result;
    const wind = windCaveat(activity);
    const slowed = speedPct < 0;

    return {
      information: [
        {
          label: "Speed change",
          value: signedPct(speedPct),
          note: "first quarter to last",
        },
        {
          label: "From turnover",
          value: signedPct(cadencePct),
        },
        {
          label: "From step length",
          value: signedPct(stridePct),
        },
      ],

      observations: [
        {
          text: `You went from ${formatCadence(first.cadenceSpm)} at ${first.strideLengthM!.toFixed(2)} m per step to ${formatCadence(last.cadenceSpm)} at ${last.strideLengthM!.toFixed(2)} m per step, which is ${formatPaceWithUnit(first.paceSecPerKm)} becoming ${formatPaceWithUnit(last.paceSecPerKm)}.`,
          evidence: [
            { label: "First quarter", startT: first.startT, endT: first.endT },
            { label: "Final quarter", startT: last.startT, endT: last.endT },
          ],
        },
      ],

      explanations: [
        driver === "neither"
          ? {
              text: "Neither turnover nor step length moved more than a couple of percent, so the stride you finished with was essentially the stride you started with.",
              confidence: "medium",
              relatedMetrics: ["cadence", "pace"],
            }
          : driver === "stride"
            ? {
                text: slowed
                  ? `Most of the slowdown came from the step getting shorter — ${Math.abs(stridePct).toFixed(1)}% against ${Math.abs(cadencePct).toFixed(1)}% from turnover. A step that shortens while the rhythm holds is the pattern the marathon durability work associates with accumulating fatigue. ${wind}`
                  : `Most of the change came from the step getting longer rather than the feet landing more often, so you covered more ground per step at a similar rhythm.`,
                confidence: "medium",
                relatedMetrics: ["cadence", "pace"],
              }
            : {
                text: slowed
                  ? `Most of the slowdown came from turnover dropping — ${Math.abs(cadencePct).toFixed(1)}% against ${Math.abs(stridePct).toFixed(1)}% from step length. The step stayed long while the feet landed less often, which is more often a runner easing off than a runner breaking down, but the two cannot be told apart from the numbers alone.`
                  : `Most of the change came from the feet landing more often rather than from a longer step.`,
                confidence: "medium",
                relatedMetrics: ["cadence", "pace"],
              },
      ],

      teaching: [
        {
          title: "Speed is turnover times step length",
          text: "Those two numbers multiply to give speed, exactly — there is no third factor and nothing is being approximated. So any change in speed can be handed to one or the other, and the two percentages here add up to the speed change. That is what makes this worth reading even though the watch never measured a step length: it was not estimated by a model, it was divided out of two things that were measured.",
        },
        {
          title: "Neither pattern is the good one",
          text: "It is tempting to read a shortening step as failure and a long step as strength, but overstriding — reaching too far in front of the body — is itself associated with harder landings. What is useful is knowing which of the two your slowdowns tend to come from, and whether that changes as a run gets long. A pattern that only appears in the last quarter of long runs is telling you something a single figure never would.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { segments, cadencePct, stridePct, driver } = result;
    const scale = Math.max(Math.abs(cadencePct), Math.abs(stridePct), MEANINGFUL_PCT);

    return (
      <div>
        <HeroFigure
          value={
            driver === "neither"
              ? "Both held"
              : driver === "stride"
                ? "Step length"
                : "Turnover"
          }
          caption={
            driver === "neither"
              ? "turnover and step length both stayed put"
              : `accounts for most of the change in speed`
          }
          tone={driver === "neither" ? "positive" : "neutral"}
        />

        <p className={shared.trackLabel}>Share of the change</p>
        <ProportionBars
          rows={[
            {
              id: "cadence",
              label: "Turnover",
              fraction: Math.abs(cadencePct) / scale,
              valueLabel: signedPct(cadencePct),
              color: "var(--zone-4)",
            },
            {
              id: "stride",
              label: "Step length",
              fraction: Math.abs(stridePct) / scale,
              valueLabel: signedPct(stridePct),
              color: "var(--zone-2)",
            },
          ]}
        />

        <p className={shared.trackLabel}>Quarter by quarter</p>
        <MetricRows
          rows={segments.map((segment) => ({
            label: `${formatDistanceShort(segment.startDistanceM)} – ${formatDistanceShort(segment.endDistanceM)}`,
            value: `${segment.strideLengthM!.toFixed(2)} m`,
            detail: `${formatCadence(segment.cadenceSpm)} · ${formatPaceWithUnit(segment.paceSecPerKm)}`,
          }))}
        />

        <p className={shared.note}>
          Step length is metres of ground per step, derived as speed divided by
          step rate — the watch did not measure it directly.
        </p>
      </div>
    );
  },
});

function percentChange(from: number, to: number): number {
  if (!Number.isFinite(from) || from === 0) return 0;
  return ((to - from) / from) * 100;
}

export default strideDriftWidget;
