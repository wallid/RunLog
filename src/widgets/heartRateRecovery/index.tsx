import { defineWidget } from "../contract";
import type { ActivityEvent } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import { formatDistanceShort, formatHeartRate } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * How quickly heart rate came down after the hardest points.
 *
 * Recovery is only measured after a genuine peak, and the widget always states
 * whether the runner stopped or merely eased off, because the two produce very
 * different numbers.
 */

interface Result {
  events: ActivityEvent[];
  best: ActivityEvent;
}

export const heartRateRecoveryWidget = defineWidget<Result>({
  id: "heart-rate-recovery",
  title: "Heart-rate recovery",
  description: "How effort came back down after the hardest sections.",
  section: "heart",
  status: "beta",
  requiredMetrics: ["heartRate"],

  compute(activity) {
    const events = activity.events.filter((e) => e.type === "hrRecovery");
    if (events.length === 0) return null;
    const best = events.reduce((a, b) =>
      b.metrics.recoveryBpm > a.metrics.recoveryBpm ? b : a,
    );
    return { events, best };
  },

  narrate(result) {
    const { best } = result;
    const stopped = best.metrics.stopped === 1;
    const paceSlowed = best.metrics.paceSlowedPct;

    return {
      information: [
        { label: "Recoveries found", value: `${result.events.length}` },
        { label: "Largest drop", value: `${Math.round(best.metrics.recoveryBpm)} bpm` },
        {
          label: "After 30 seconds",
          value: Number.isFinite(best.metrics.recovery30SBpm)
            ? `${Math.round(best.metrics.recovery30SBpm)} bpm`
            : "—",
        },
      ],
      observations: [
        {
          text: `The largest recovery was from ${formatHeartRate(best.metrics.peakHr)} down to ${formatHeartRate(best.metrics.hrAfter60S)} within a minute, starting at ${formatDistanceShort(best.startDistanceM)}.`,
          evidence: [
            { label: "Recovery window", startT: best.startT, endT: best.endT },
          ],
        },
      ],
      explanations: [
        {
          text: stopped
            ? "The runner stopped during this window, so the drop reflects standing still rather than recovery while running."
            : Number.isFinite(paceSlowed) && paceSlowed > 15
              ? `Pace eased by around ${Math.round(paceSlowed)}% through the same window, which accounts for much of the fall.`
              : "Pace held reasonably steady through the window, so this reflects recovery while still running.",
          confidence: stopped ? "high" : "medium",
          relatedMetrics: ["heartRate", "pace", "moving"],
        },
      ],
      teaching: [
        {
          title: "Reading recovery",
          text: "How fast heart rate falls after an effort is affected by fitness, but also by heat, hydration, how hard the effort was, whether you stopped completely, and how accurately your monitor tracks fast changes. Comparing recovery between runs is only fair when those conditions match.",
        },
      ],
    };
  },

  View({ result }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    return (
      <ul className={shared.rows}>
        {result.events.map((event) => {
          const selected = highlight?.kind === "event" && highlight.eventId === event.id;
          return (
            <li key={event.id}>
              <button
                type="button"
                className={`${shared.row} ${selected ? shared.rowSelected : ""}`}
                onClick={() =>
                  focusRegion(
                    event.startT,
                    event.endT,
                    { kind: "event", eventId: event.id },
                    "heart-rate-recovery",
                  )
                }
                aria-pressed={selected}
              >
                <span>
                  <strong className="numeric">
                    {formatHeartRate(event.metrics.peakHr)} →{" "}
                    {formatHeartRate(event.metrics.hrAfter60S)}
                  </strong>
                  <br />
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    at {formatDistanceShort(event.startDistanceM)} ·{" "}
                    {event.metrics.stopped === 1 ? "while stopped" : "while running"}
                  </span>
                </span>
                <span className={shared.tag}>
                  −{Math.round(event.metrics.recoveryBpm)} bpm in 60s
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  },
});

export default heartRateRecoveryWidget;
