import { defineWidget } from "../contract";
import type { ActivityEvent } from "@/model/activity";
import { ComparisonCards } from "@/viz/primitives";
import { STRONG_FINISH_THRESHOLD } from "@/model/pipeline/events/pacing";
import { formatDistanceShort, formatHeartRate, formatPaceWithUnit } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * The final stretch, compared with the middle of the run.
 *
 * Two patterns qualify: actually speeding up, and holding pace while effort
 * rises. The second is the weaker signal and is labelled as such.
 */

interface Result {
  event: ActivityEvent;
  spedUp: boolean;
}

export const strongFinishWidget = defineWidget<Result>({
  id: "strong-finish",
  title: "How the run finished",
  description: "Whether the final stretch held, faded, or lifted.",
  section: "pace",
  requiredMetrics: ["pace", "distance"],

  compute(activity) {
    const event = activity.events.find((e) => e.type === "strongFinish");
    if (!event) return null;
    // The detector only calls a finish "strong" past a three per cent
    // improvement; below that it fired on the rising heart rate instead. Reading
    // any positive delta as speeding up would tell the strong-finish story about
    // an event the pipeline labelled "Rising effort at the finish".
    return {
      event,
      spedUp: event.metrics.improvementPct >= STRONG_FINISH_THRESHOLD * 100,
    };
  },

  narrate(result) {
    const { metrics } = result.event;
    const observations = [
      {
        text: result.spedUp
          ? `Pace improved by ${Math.round(metrics.paceDeltaSecPerKm)} seconds per kilometre over the final ${formatDistanceShort(metrics.lengthM)}, from ${formatPaceWithUnit(metrics.middlePaceSecPerKm)} to ${formatPaceWithUnit(metrics.finishPaceSecPerKm)}.`
          : `Pace held close to the middle-of-run figure through the final ${formatDistanceShort(metrics.lengthM)}, while heart rate rose by ${Math.round(metrics.hrRiseBpm)} bpm.`,
        evidence: [
          { label: "Final stretch", startT: result.event.startT, endT: result.event.endT },
        ],
      },
    ];

    const supporting: string[] = [];
    // The held-pace observation already quotes the heart-rate rise, so repeating
    // it here would read as a second, independent measurement.
    if (result.spedUp && Number.isFinite(metrics.hrRiseBpm) && metrics.hrRiseBpm >= 3) {
      supporting.push(`heart rate rose by ${Math.round(metrics.hrRiseBpm)} bpm`);
    }
    if (Number.isFinite(metrics.cadenceDeltaSpm) && Math.abs(metrics.cadenceDeltaSpm) >= 2) {
      supporting.push(
        `cadence changed by ${Math.round(metrics.cadenceDeltaSpm)} steps per minute`,
      );
    }
    if (Number.isFinite(metrics.powerDeltaW) && Math.abs(metrics.powerDeltaW) >= 8) {
      supporting.push(`power changed by ${Math.round(metrics.powerDeltaW)} W`);
    }

    return {
      information: [
        { label: "Final stretch", value: formatPaceWithUnit(metrics.finishPaceSecPerKm) },
        { label: "Middle of run", value: formatPaceWithUnit(metrics.middlePaceSecPerKm) },
        {
          label: "Heart rate change",
          value: Number.isFinite(metrics.hrRiseBpm)
            ? `${metrics.hrRiseBpm >= 0 ? "+" : "−"}${Math.abs(Math.round(metrics.hrRiseBpm))} bpm`
            : "—",
        },
      ],
      observations,
      explanations: [
        {
          // In the held-pace case there is no pace change to be alongside, and
          // saying there was would contradict the observation directly above.
          text:
            supporting.length > 0
              ? `${result.spedUp ? "Alongside the pace change" : "Through the same stretch"}, ${supporting.join(" and ")}, which is consistent with a deliberate finishing effort rather than a measurement artefact.`
              : `Nothing else moved alongside ${result.spedUp ? "the pace change" : "the finish"}, so this may be terrain or measurement rather than a deliberate effort.`,
          confidence: result.event.confidence,
          relatedMetrics: ["pace", "heartRate", "power"],
        },
      ],
      teaching: [
        {
          title: "What a strong finish tells you",
          text: "Finishing faster shows there was capacity left at the end. That does not automatically mean the earlier pace was too easy — it depends on whether the run was meant to be even, progressive, or hard from the start.",
        },
      ],
    };
  },

  View({ result }) {
    const { metrics } = result.event;
    return (
      <div>
        <ComparisonCards
          from={{
            title: "Middle of the run",
            primary: formatPaceWithUnit(metrics.middlePaceSecPerKm),
          }}
          to={{
            title: `Final ${formatDistanceShort(metrics.lengthM)}`,
            primary: formatPaceWithUnit(metrics.finishPaceSecPerKm),
            secondary: Number.isFinite(metrics.finishAvgHr)
              ? formatHeartRate(metrics.finishAvgHr)
              : undefined,
          }}
          direction={result.spedUp ? "up" : "neutral"}
          arrowLabel={
            result.spedUp
              ? `${Math.round(metrics.paceDeltaSecPerKm)} s/km faster`
              : "pace held"
          }
        />
        <p className={shared.note}>
          The middle half of the run is used as the baseline, so neither the opening nor
          the finish being measured is folded into the comparison.
        </p>
      </div>
    );
  },
});

export default strongFinishWidget;
