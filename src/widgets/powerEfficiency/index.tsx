import { defineWidget } from "../contract";
import { ComparisonCards, MetricRows } from "@/viz/primitives";
import {
  formatDistanceShort,
  formatHeartRate,
  formatPower,
  formatSigned,
} from "@/lib/format";
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
import { NOISE_FLOOR } from "../helpers";
import shared from "../shared.module.css";

/**
 * What the work was costing, when the work itself can be measured.
 *
 * Pace is a poor description of effort on hills: the same runner climbing holds
 * far more output for far less speed. Power says what was actually produced, so
 * pairing it with heart rate asks a cleaner question than pace can — did the
 * same mechanical output start costing more heartbeats?
 *
 * Running power from a wrist device is itself a model rather than a
 * measurement, which is the reason this card sits in the lab and reports a
 * change rather than a level.
 */

const SEGMENT_COUNT = 4;

/** Below this the change sits inside what the power model varies by anyway. */
const MEANINGFUL_DECOUPLING_PCT = 5;

interface Result {
  segments: SegmentProfile[];
  first: SegmentProfile;
  last: SegmentProfile;
  /** Percent fall in watts per beat from the first quarter to the last. */
  decouplingPct: number;
  powerDeltaW: number;
  hrDeltaBpm: number;
  /** Whether the change in terrain could account for the change in cost. */
  terrainConfounded: boolean;
  gradientDeltaPct: number;
}

export const powerEfficiencyWidget = defineWidget<Result>({
  id: "power-efficiency",
  title: "Power against heart rate",
  description:
    "Whether the same mechanical output started costing more heartbeats as the run went on.",
  section: "lab",
  status: "beta",
  requiredMetrics: ["power", "heartRate"],
  // Heart rate is recorded, but running power is modelled by the watch,
  // and the weakest input sets the level.
  provenance: "estimated",
  references: [
    RESEARCH.runningPower,
    RESEARCH.marathonDurability,
  ],

  compute(activity) {
    // Heart rate lags the effort at the start of a run, so the opening minutes
    // are dropped here for the same reason the durability card drops them.
    if (movingSamples(activity).length < WARMUP_S + MIN_COMPARABLE_MOVING_S) return null;

    const all = splitIntoSegments(activity, SEGMENT_COUNT, { warmupS: WARMUP_S });
    const segments = all.filter((segment) => segment.wattsPerBeat !== undefined);
    if (segments.length < SEGMENT_COUNT) return null;

    const first = segments[0];
    const last = segments[segments.length - 1];

    const fall = decouplingPct(first.wattsPerBeat!, last.wattsPerBeat!);

    return {
      segments,
      first,
      last,
      decouplingPct: fall,
      powerDeltaW: last.powerW! - first.powerW!,
      hrDeltaBpm: last.hrBpm! - first.hrBpm!,
      terrainConfounded: terrainConfounds(first, last, fall > 0),
      gradientDeltaPct: (last.gradientPct ?? 0) - (first.gradientPct ?? 0),
    };
  },

  narrate(result) {
    const { first, last, decouplingPct: fall, powerDeltaW, hrDeltaBpm } = result;
    const held = Math.abs(fall) < MEANINGFUL_DECOUPLING_PCT;
    // Which of the two actually moved decides what the ratio is describing, so
    // each is tested against its own floor rather than inferred from the ratio.
    const outputHeld = Math.abs(powerDeltaW) < (first.powerW! * NOISE_FLOOR.powerPct) / 100;
    const hrRose = hrDeltaBpm > NOISE_FLOOR.hrBpm;

    return {
      information: [
        {
          label: "Cost change",
          value: signedPct(-fall),
          note: "watts per beat, first quarter to last",
        },
        {
          label: "Output change",
          value: formatSigned(powerDeltaW, "W"),
        },
        {
          label: "Heart-rate change",
          value: formatSigned(hrDeltaBpm, "bpm"),
        },
      ],

      observations: [
        {
          text: `Power averaged ${formatPower(first.powerW)} at ${formatHeartRate(first.hrBpm)} in the first quarter and ${formatPower(last.powerW)} at ${formatHeartRate(last.hrBpm)} in the final one — ${first.wattsPerBeat!.toFixed(2)} watts per beat falling to ${last.wattsPerBeat!.toFixed(2)}.`,
          evidence: [
            { label: "First quarter", startT: first.startT, endT: first.endT },
            { label: "Final quarter", startT: last.startT, endT: last.endT },
          ],
        },
      ],

      explanations: [
        result.terrainConfounded
          ? {
              text: `The two quarters differed by ${Math.abs(result.gradientDeltaPct).toFixed(1)}% in average gradient, and both power and heart rate respond to that directly, so the change cannot be read as the runner changing.`,
              confidence: "low",
              relatedMetrics: ["power", "heartRate", "gradient"],
            }
          : {
              text: held
                ? "Output and heart rate moved together, so what you were producing kept costing about the same. That is the pattern of an effort held within its means."
                : fall <= 0
                  ? "Each watt cost fewer beats by the end, which usually means the opening stretch was still settling rather than that the finish was genuinely cheap."
                  : outputHeld
                    ? "Output barely changed while heart rate climbed, so the same work was being bought at a rising price. This is the clearest form the durability question takes: the watts say the run did not change, and the heart says it did."
                    : hrRose
                      ? `Output fell ${Math.abs(Math.round(powerDeltaW))} W while heart rate rose ${Math.round(hrDeltaBpm)} bpm, so both sides of the ratio moved against you — less was being produced, and it was costing more.`
                      : `Output fell ${Math.abs(Math.round(powerDeltaW))} W and heart rate did not come down with it, so the work dropped away faster than the cost of doing it.`,
              confidence: "medium",
              relatedMetrics: ["power", "heartRate"],
            },
      ],

      teaching: [
        {
          title: "Why power and heart rate is a cleaner pair than pace",
          text: "Pace and effort come apart the moment the ground tilts: climbing at the same effort shows up as a large slowdown, and descending flatters you. Power tracks what you are producing rather than how fast the result moved you, so pairing it with heart rate compares an output against its cost without the terrain sitting in between. Cyclists have read the same ratio for years.",
        },
        {
          title: "What wrist power is and is not",
          text: "A watch does not measure running power. It estimates it from motion and pace using a model, so the number carries the model's assumptions and cannot be compared against a different device or a bike meter. Within one run on one watch it is consistent enough to compare against itself, which is all this card does with it.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { segments, first, last } = result;

    return (
      <div>
        <ComparisonCards
          from={{
            title: "First quarter",
            primary: `${first.wattsPerBeat!.toFixed(2)} W/beat`,
            secondary: formatPower(first.powerW),
            detail: formatHeartRate(first.hrBpm),
          }}
          to={{
            title: "Final quarter",
            primary: `${last.wattsPerBeat!.toFixed(2)} W/beat`,
            secondary: formatPower(last.powerW),
            detail: formatHeartRate(last.hrBpm),
          }}
          direction={result.decouplingPct > 0 ? "down" : "up"}
          arrowLabel={`${result.decouplingPct > 0 ? "−" : "+"}${Math.abs(result.decouplingPct).toFixed(1)}%`}
        />

        <MetricRows
          rows={segments.map((segment) => ({
            label: `${formatDistanceShort(segment.startDistanceM)} – ${formatDistanceShort(segment.endDistanceM)}`,
            value: `${segment.wattsPerBeat!.toFixed(2)} W/beat`,
            detail: `${formatPower(segment.powerW)} · ${formatHeartRate(segment.hrBpm)}`,
          }))}
        />

        <p className={shared.note}>
          Watts per beat is output divided by the heart rate holding it up. A
          falling figure means the same work is costing more. The first{" "}
          {Math.round(WARMUP_S / 60)} minutes are left out, because heart rate is
          still catching up with the effort during them.
        </p>
      </div>
    );
  },
});

export default powerEfficiencyWidget;
