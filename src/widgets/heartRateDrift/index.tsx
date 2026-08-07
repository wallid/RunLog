import { defineWidget } from "../contract";
import type { DriftResult } from "@/model/activity";
import { ComparisonCards } from "@/viz/primitives";
import { formatHeartRate, formatPaceWithUnit } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * Whether effort rose while speed stayed the same.
 *
 * This is the one comparison where the caveat matters more than the number: if
 * pace changed between the halves, drift cannot be separated from simply
 * running harder, and the widget says so rather than quoting a percentage.
 */

interface Result {
  drift: DriftResult;
  hrDelta: number;
  paceDelta: number;
}

export const heartRateDriftWidget = defineWidget<Result>({
  id: "heart-rate-drift",
  title: "Heart-rate drift",
  description: "Comparing the first and second halves at matched effort.",
  section: "heart",
  requiredMetrics: ["heartRate", "pace"],

  compute(activity) {
    const drift = activity.summary.drift;
    if (!drift) return null;
    return {
      drift,
      hrDelta: drift.secondHalfHr - drift.firstHalfHr,
      paceDelta: drift.secondHalfPace - drift.firstHalfPace,
    };
  },

  narrate(result) {
    const { drift, hrDelta, paceDelta } = result;
    const paceWord = paceDelta > 0 ? "slower" : "faster";

    return {
      information: [
        { label: "Drift", value: `${drift.driftPct >= 0 ? "+" : "−"}${Math.abs(drift.driftPct).toFixed(1)}%` },
        { label: "Heart-rate change", value: `${hrDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(hrDelta))} bpm` },
        {
          label: "Pace change",
          value: `${Math.abs(Math.round(paceDelta))} s/km ${paceWord}`,
        },
      ],
      observations: [
        {
          text: `Heart rate averaged ${formatHeartRate(drift.firstHalfHr)} in the first half and ${formatHeartRate(drift.secondHalfHr)} in the second, while pace went from ${formatPaceWithUnit(drift.firstHalfPace)} to ${formatPaceWithUnit(drift.secondHalfPace)}.`,
        },
      ],
      explanations: [
        {
          text:
            drift.confidence === "high"
              ? `Pace held steady across both halves, so the ${Math.abs(drift.driftPct).toFixed(1)}% change in heart rate is consistent with cardiovascular drift.`
              : (drift.caveat ??
                "The two halves differed enough in pace that drift cannot be isolated."),
          confidence: drift.confidence,
          relatedMetrics: ["heartRate", "pace"],
        },
      ],
      teaching: [
        {
          title: "What drift is",
          text: "Cardiovascular drift is heart rate climbing while pace stays the same, usually because the body is warming up, losing fluid, or accumulating fatigue. It only means anything when the two halves are genuinely comparable — same terrain, same effort, no long stops. A large drift figure on a run that also slowed down is measuring the slowdown.",
        },
      ],
    };
  },

  View({ result }) {
    const { drift } = result;
    return (
      <div>
        <ComparisonCards
          from={{
            title: "First half",
            primary: formatPaceWithUnit(drift.firstHalfPace),
            secondary: formatHeartRate(drift.firstHalfHr),
          }}
          to={{
            title: "Second half",
            primary: formatPaceWithUnit(drift.secondHalfPace),
            secondary: formatHeartRate(drift.secondHalfHr),
          }}
          direction={result.hrDelta > 0 ? "up" : result.hrDelta < 0 ? "down" : "neutral"}
          arrowLabel={`${result.hrDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(result.hrDelta))} bpm`}
        />

        <p className={shared.note}>
          Halves are split by moving time, so any stopped seconds do not shift the
          boundary.
        </p>
      </div>
    );
  },
});

export default heartRateDriftWidget;
