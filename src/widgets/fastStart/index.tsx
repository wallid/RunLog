import { defineWidget } from "../contract";
import type { ActivityEvent } from "@/model/activity";
import { ComparisonCards } from "@/viz/primitives";
import { formatDistanceShort, formatHeartRate, formatPaceWithUnit } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * Whether the run began faster than it was held.
 *
 * Only shown when there is something to show. The framing avoids calling a fast
 * start a mistake, because for a race or a progression run it is the plan.
 */

interface Result {
  event: ActivityEvent;
}

export const fastStartWidget = defineWidget<Result>({
  id: "fast-start",
  title: "How the run opened",
  description: "Comparing the first kilometre with the middle of the run.",
  section: "pace",
  requiredMetrics: ["pace", "distance"],

  compute(activity) {
    const event = activity.events.find((e) => e.type === "fastStart");
    return event ? { event } : null;
  },

  narrate(result) {
    const { metrics } = result.event;
    const settled = Number.isFinite(metrics.settleDistanceM);

    return {
      information: [
        { label: "First kilometre", value: formatPaceWithUnit(metrics.openingPaceSecPerKm) },
        { label: "Middle of run", value: formatPaceWithUnit(metrics.middlePaceSecPerKm) },
        { label: "Difference", value: `${Math.round(metrics.differencePct)}% faster` },
      ],
      observations: [
        {
          text: `The first kilometre was ${Math.round(metrics.differencePct)}% faster than the middle of the run${
            settled ? `, and pace settled after about ${formatDistanceShort(metrics.settleDistanceM)}` : ""
          }.`,
          evidence: [
            { label: "Opening", startT: result.event.startT, endT: result.event.endT },
          ],
        },
      ],
      explanations: [
        {
          // A candidate reason for this run's opening, not general advice — the
          // advice belongs in teaching, where it is not asked to carry a
          // confidence about a claim it is not making.
          text: settled
            ? `Pace came back to the middle-of-run figure by ${formatDistanceShort(metrics.settleDistanceM)} and stayed there, which is the shape of an opening run on feel before settling rather than a change of plan mid-run.`
            : "Pace never came back to the middle-of-run figure for long enough to call it settled, so the opening reads less as a fast start than as the run gradually slowing from it.",
          confidence: result.event.confidence,
          relatedMetrics: ["pace", "heartRate"],
        },
      ],
      teaching: [
        {
          title: "Why the opening is compared with the middle",
          text: "The middle of a run is the fairest comparison because it excludes both the opening and any finishing effort. Comparing the first kilometre against the whole-run average would fold the fast start into the number it is being measured against.",
        },
        {
          title: "A fast start is not automatically a mistake",
          text: "Starting quicker than the pace you go on to hold raises early effort, which can make the later part of a run harder than it needed to be. Whether that matters depends on the session: a race or a progression run is meant to start differently from an easy one, and this card takes no view on which yours was.",
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
            title: "First kilometre",
            primary: formatPaceWithUnit(metrics.openingPaceSecPerKm),
            secondary: Number.isFinite(metrics.openingAvgHr)
              ? formatHeartRate(metrics.openingAvgHr)
              : undefined,
          }}
          to={{
            title: "Middle of the run",
            primary: formatPaceWithUnit(metrics.middlePaceSecPerKm),
            detail: "median of the middle splits",
          }}
          direction="down"
          arrowLabel={`${Math.round(metrics.paceDeltaSecPerKm)} s/km slower`}
        />
        {Number.isFinite(metrics.settleDistanceM) && (
          <p className={shared.note}>
            Pace came back within a few percent of the middle-of-run figure at around{" "}
            {formatDistanceShort(metrics.settleDistanceM)}.
          </p>
        )}
      </div>
    );
  },
});

export default fastStartWidget;
