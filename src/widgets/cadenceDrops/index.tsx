import { defineWidget } from "../contract";
import type { ActivityEvent } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import { Track } from "@/viz/Track";
import { Legend } from "@/viz/primitives";
import { median } from "@/lib/stats";
import {
  formatCadence,
  formatDistanceShort,
  formatDuration,
  formatDurationWords,
  formatGradient,
  formatPaceDelta,
} from "@/lib/format";
import shared from "../shared.module.css";

/**
 * Where the rhythm fell away.
 *
 * A drop is measured against the runner's own median for this run, not against
 * a target figure, and it has to be at least six steps per minute below it for
 * twenty seconds before it counts. Those thresholds are judgement calls, which
 * is why this section is marked experimental: they are wide enough to ignore
 * sensor noise and narrow enough to catch a walking break, but a runner with a
 * naturally variable stride will see more of them than one without.
 */

interface Drop {
  id: string;
  startT: number;
  endT: number;
  startDistanceM: number;
  avgSpm: number;
  lowestSpm: number;
  deficitSpm: number;
  durationS: number;
  stoppedS: number;
  avgGradientPct: number;
  /** The most likely account of this drop, chosen from what else moved. */
  context: string;
}

interface Result {
  drops: Drop[];
  baselineSpm: number;
  totalS: number;
  deepest: Drop;
  fractionOfRunning: number;
}

const TRACK_HEIGHT = 44;

export const cadenceDropsWidget = defineWidget<Result>({
  id: "cadence-drops",
  title: "Cadence drops",
  description: "The stretches where step rate fell away from the run's own rhythm.",
  section: "cadence",
  status: "beta",
  requiredMetrics: ["cadence"],

  compute(activity) {
    const events = activity.events.filter((event) => event.type === "cadenceDrop");
    if (events.length === 0) return null;

    const drops = events.map(toDrop);
    const totalS = drops.reduce((a, drop) => a + drop.durationS, 0);

    return {
      drops,
      baselineSpm: events[0].metrics.baselineSpm,
      totalS,
      deepest: drops.reduce((a, b) => (b.deficitSpm > a.deficitSpm ? b : a)),
      fractionOfRunning: activity.movingS > 0 ? totalS / activity.movingS : 0,
    };
  },

  narrate(result) {
    const { deepest } = result;
    const many = result.drops.length > 1;

    return {
      information: [
        { label: "Drops found", value: `${result.drops.length}` },
        { label: "Time below rhythm", value: formatDuration(result.totalS) },
        {
          label: "Largest",
          value: `−${Math.round(deepest.deficitSpm)} spm`,
          note: formatDistanceShort(deepest.startDistanceM),
        },
        { label: "Measured against", value: formatCadence(result.baselineSpm), note: "run median" },
      ],
      observations: [
        {
          text: `${many ? `${result.drops.length} stretches` : "One stretch"} of the run held a step rate well below the median of ${formatCadence(result.baselineSpm)}, ${formatDuration(result.totalS)} in total. The largest was ${formatDurationWords(deepest.durationS)} from ${formatDistanceShort(deepest.startDistanceM)}, averaging ${formatCadence(deepest.avgSpm)}.`,
          evidence: result.drops.map((drop) => ({
            label: `Drop at ${formatDistanceShort(drop.startDistanceM)}`,
            startT: drop.startT,
            endT: drop.endT,
          })),
        },
      ],
      explanations: [
        {
          text: deepest.context,
          confidence:
            deepest.stoppedS > 0 || Math.abs(deepest.avgGradientPct) >= 2
              ? ("medium" as const)
              : ("low" as const),
          relatedMetrics: ["cadence" as const, "pace" as const, "gradient" as const, "moving" as const],
        },
      ],
      teaching: [
        {
          title: "A drop is a description, not a fault",
          text: "Falling step rate is how a body slows down, and slowing down is usually the right response to a hill, a road crossing or the end of an interval. What makes a drop worth a second look is when nothing in the terrain, the pace or the stops accounts for it — which is the case this section tries to isolate rather than to judge.",
        },
        {
          title: "Where the thresholds come from",
          text: "Six steps per minute is roughly twice what a wrist or foot sensor invents on its own, and twenty seconds is long enough that a single stride adjustment cannot produce it. Both numbers are chosen rather than derived, so treat the count as a starting point for looking rather than as a measurement.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    return (
      <div>
        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="cadence-drops"
          showAxis
          ariaLabel="Where the cadence drops fell in the run"
          regions={result.drops.map((drop) => ({
            startT: drop.startT,
            endT: drop.endT,
            color: "var(--metric-cadence)",
            label: `Cadence drop at ${formatDistanceShort(drop.startDistanceM)}`,
          }))}
        >
          {(scale, height) => (
            <line
              x1={0}
              x2={scale.width}
              y1={height / 2}
              y2={height / 2}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
          )}
        </Track>

        <Legend
          items={[
            { label: "Cadence drop", color: "var(--metric-cadence)" },
            { label: "Rest of the run", color: "var(--border-strong)", shape: "line" },
          ]}
        />

        <ul className={shared.rows}>
          {result.drops.map((drop) => {
            const selected = highlight?.kind === "event" && highlight.eventId === drop.id;
            return (
              <li key={drop.id}>
                <button
                  type="button"
                  className={`${shared.row} ${selected ? shared.rowSelected : ""}`}
                  onClick={() =>
                    focusRegion(
                      drop.startT,
                      drop.endT,
                      { kind: "event", eventId: drop.id },
                      "cadence-drops",
                    )
                  }
                  aria-pressed={selected}
                >
                  <span>
                    <strong className="numeric">
                      {formatCadence(drop.avgSpm)}, low of {formatCadence(drop.lowestSpm)}
                    </strong>
                    <br />
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      from {formatDistanceShort(drop.startDistanceM)} ·{" "}
                      {formatDurationWords(drop.durationS)}
                      {drop.stoppedS > 0 && ` · ${formatDuration(drop.stoppedS)} stopped`}
                    </span>
                  </span>
                  <span className={shared.tag}>−{Math.round(drop.deficitSpm)} spm</span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className={shared.note}>
          Measured against this run&rsquo;s median of {formatCadence(result.baselineSpm)}.{" "}
          {result.drops.length === 1
            ? `This stretch was ${Math.round(result.fractionOfRunning * 100)}% of the time spent running.`
            : `Together these stretches were ${Math.round(result.fractionOfRunning * 100)}% of the time spent running, and the typical one lasted ${formatDurationWords(median(result.drops.map((drop) => drop.durationS)))}.`}
        </p>
      </div>
    );
  },
});

function toDrop(event: ActivityEvent): Drop {
  const { metrics } = event;
  return {
    id: event.id,
    startT: event.startT,
    endT: event.endT,
    startDistanceM: event.startDistanceM,
    avgSpm: metrics.avgSpm,
    lowestSpm: metrics.lowestSpm,
    deficitSpm: metrics.deficitSpm,
    durationS: metrics.durationS,
    stoppedS: metrics.stoppedS,
    avgGradientPct: metrics.avgGradientPct,
    context: describeContext(metrics),
  };
}

/**
 * What else was happening while the rhythm fell.
 *
 * The order is deliberate: a stop explains a drop completely, a climb explains
 * most of one, and a matching change in pace makes the two the same event. Only
 * when none of those apply is there anything left to wonder about.
 */
function describeContext(metrics: Record<string, number>): string {
  if (metrics.stoppedS >= 5) {
    return `This stretch included ${formatDuration(metrics.stoppedS)} standing still, which accounts for the fall on its own — a stationary watch has no step rate to report.`;
  }

  if (Number.isFinite(metrics.avgGradientPct) && metrics.avgGradientPct >= 2) {
    return `The ground was rising through this stretch, averaging ${formatGradient(metrics.avgGradientPct)}. Shortening and slowing the stride uphill is the ordinary response, so the terrain accounts for most of this.`;
  }

  if (Number.isFinite(metrics.paceDeltaSecPerKm) && metrics.paceDeltaSecPerKm >= 15) {
    return `Pace was also ${formatPaceDelta(metrics.paceDeltaSecPerKm)} slower than the run's median here. Cadence and pace fall together, so this is one change seen twice rather than two findings.`;
  }

  if (Number.isFinite(metrics.paceDeltaSecPerKm) && Math.abs(metrics.paceDeltaSecPerKm) < 10) {
    return "Pace held close to the run's median through this stretch while step rate fell, which means the stride lengthened. On level ground that pattern is worth noticing: it is what tired legs, soft footing and a deliberate change of gait all look like.";
  }

  return "Nothing in the gradient, the pace or the stopped time accounts for this stretch on its own, which leaves footing, fatigue or a change in stride as the remaining explanations.";
}

export default cadenceDropsWidget;
