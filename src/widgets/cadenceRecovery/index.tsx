import { defineWidget } from "../contract";
import { useSelectionStore } from "@/state/selectionStore";
import { ComparisonCards, HeroFigure } from "@/viz/primitives";
import { median } from "@/lib/stats";
import {
  formatCadence,
  formatDistanceShort,
  formatDurationWords,
} from "@/lib/format";
import shared from "../shared.module.css";

/**
 * How long the rhythm took to come back.
 *
 * A recovery is only recorded when cadence returns to the run's median and
 * stays there for ten seconds, so brushing the line on the way past does not
 * count. Drops that never come back are counted separately, because "it did not
 * return" is the more interesting of the two answers and would otherwise be
 * invisible.
 *
 * Experimental for the same reason the drop section is: the thresholds are
 * chosen rather than derived.
 */

interface Recovery {
  id: string;
  startT: number;
  endT: number;
  dropStartDistanceM: number;
  recoveryS: number;
  fromSpm: number;
  toSpm: number;
}

interface Result {
  recoveries: Recovery[];
  dropCount: number;
  neverRecovered: number;
  medianRecoveryS: number;
  fastest: Recovery;
  slowest: Recovery;
  baselineSpm: number;
}

export const cadenceRecoveryWidget = defineWidget<Result>({
  id: "cadence-recovery",
  title: "Cadence recovery",
  description: "How quickly the step rhythm returned after each drop.",
  section: "cadence",
  status: "beta",
  requiredMetrics: ["cadence"],

  compute(activity) {
    const events = activity.events.filter((event) => event.type === "cadenceRecovery");
    const dropCount = activity.events.filter((event) => event.type === "cadenceDrop").length;
    if (events.length === 0 || dropCount === 0) return null;

    const recoveries: Recovery[] = events.map((event) => ({
      id: event.id,
      startT: event.startT,
      endT: event.endT,
      dropStartDistanceM: event.metrics.dropStartDistanceM,
      recoveryS: event.metrics.recoveryS,
      fromSpm: event.metrics.fromSpm,
      toSpm: event.metrics.toSpm,
    }));

    return {
      recoveries,
      dropCount,
      neverRecovered: dropCount - recoveries.length,
      medianRecoveryS: median(recoveries.map((recovery) => recovery.recoveryS)),
      fastest: recoveries.reduce((a, b) => (b.recoveryS < a.recoveryS ? b : a)),
      slowest: recoveries.reduce((a, b) => (b.recoveryS > a.recoveryS ? b : a)),
      baselineSpm: events[0].metrics.baselineSpm,
    };
  },

  narrate(result) {
    const single = result.recoveries.length === 1;
    const countPhrase =
      result.recoveries.length === result.dropCount
        ? result.dropCount === 1
          ? "The one drop in this run came back"
          : `All ${result.dropCount} drops came back`
        : `${result.recoveries.length} of the ${result.dropCount} drops came back`;

    const observations = [
      {
        text: `${countPhrase} to the run's median of ${formatCadence(result.baselineSpm)}, taking ${formatDurationWords(result.medianRecoveryS)}${single ? "" : " to do it on a typical occasion"}.`,
        evidence: result.recoveries.map((recovery) => ({
          label: `Recovery after ${formatDistanceShort(recovery.dropStartDistanceM)}`,
          startT: recovery.startT,
          endT: recovery.endT,
        })),
      },
    ];

    if (result.slowest.recoveryS > result.fastest.recoveryS) {
      observations.push({
        text: `The quickest return took ${formatDurationWords(result.fastest.recoveryS)} and the slowest ${formatDurationWords(result.slowest.recoveryS)}, after the drop at ${formatDistanceShort(result.slowest.dropStartDistanceM)}.`,
        evidence: [],
      });
    }

    const explanations = [
      {
        text:
          result.neverRecovered > 0
            ? `${result.neverRecovered} ${result.neverRecovered === 1 ? "drop" : "drops"} never returned to the run's rhythm within five minutes. That is what the end of a run looks like, and also what a change of plan mid-run looks like — a walk home, or an easy finish — so where in the run it happened decides which.`
            : "Every drop in this run came back to the median rhythm. That is the pattern of interruptions the runner ran through rather than of a rhythm that faded, though a short recovery says nothing on its own about how hard the running was.",
        confidence: "medium" as const,
        relatedMetrics: ["cadence" as const, "pace" as const],
      },
    ];

    return {
      information: [
        {
          label: "Recoveries",
          value: `${result.recoveries.length}`,
          note: `of ${result.dropCount} ${result.dropCount === 1 ? "drop" : "drops"}`,
        },
        {
          label: single ? "Time taken" : "Typical time",
          value: formatDurationWords(result.medianRecoveryS),
        },
        // With one recovery the quickest is the typical one, and a second column
        // repeating it would read as two measurements.
        ...(single
          ? []
          : [{ label: "Quickest", value: formatDurationWords(result.fastest.recoveryS) }]),
        { label: "Never returned", value: `${result.neverRecovered}` },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "This is not heart-rate recovery",
          text: "How quickly cadence comes back after an interruption is mostly a decision, not a measurement of fitness: a runner resumes their rhythm when the road clears or the hill ends. Read it as a record of how the run was interrupted and resumed, not as a fitness test.",
        },
        {
          title: "What counts as returned",
          text: "Cadence has to reach within two steps per minute of the run's median and hold there for ten seconds. Without the holding requirement, a single quick stride on the way through the range would be recorded as a full recovery, which would make every drop look shorter than it was.",
        },
      ],
    };
  },

  View({ result }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    // Two panels showing the same recovery would read as a comparison between
    // two things, so a run with only one gets the single figure instead.
    const single = result.recoveries.length === 1;

    return (
      <div>
        {single ? (
          <HeroFigure
            value={formatDurationWords(result.fastest.recoveryS)}
            caption={`to return from ${formatCadence(result.fastest.fromSpm)} to ${formatCadence(result.fastest.toSpm)} after the drop at ${formatDistanceShort(result.fastest.dropStartDistanceM)}`}
          />
        ) : (
          <ComparisonCards
            from={{
              title: "Quickest return",
              primary: formatDurationWords(result.fastest.recoveryS),
              secondary: `${formatCadence(result.fastest.fromSpm)} → ${formatCadence(result.fastest.toSpm)}`,
              detail: `after the drop at ${formatDistanceShort(result.fastest.dropStartDistanceM)}`,
            }}
            to={{
              title: "Slowest return",
              primary: formatDurationWords(result.slowest.recoveryS),
              secondary: `${formatCadence(result.slowest.fromSpm)} → ${formatCadence(result.slowest.toSpm)}`,
              detail: `after the drop at ${formatDistanceShort(result.slowest.dropStartDistanceM)}`,
            }}
            arrowLabel={`${result.recoveries.length} in total`}
          />
        )}

        {/* The rows stay whatever the count: they are how a reader jumps to the
            place in the run, which the figure above cannot do. */}
        <ul className={shared.rows}>
          {result.recoveries.map((recovery) => {
            const selected = highlight?.kind === "event" && highlight.eventId === recovery.id;
            return (
              <li key={recovery.id}>
                <button
                  type="button"
                  className={`${shared.row} ${selected ? shared.rowSelected : ""}`}
                  onClick={() =>
                    focusRegion(
                      recovery.startT,
                      recovery.endT,
                      { kind: "event", eventId: recovery.id },
                      "cadence-recovery",
                    )
                  }
                  aria-pressed={selected}
                >
                  <span>
                    <strong className="numeric">
                      {formatCadence(recovery.fromSpm)} → {formatCadence(recovery.toSpm)}
                    </strong>
                    <br />
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      after the drop at {formatDistanceShort(recovery.dropStartDistanceM)}
                    </span>
                  </span>
                  <span className={shared.tag}>
                    {formatDurationWords(recovery.recoveryS)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className={shared.note}>
          A drop counts as recovered once cadence is back within two steps per minute of the
          run&rsquo;s median of {formatCadence(result.baselineSpm)} and holds there for ten
          seconds.
          {result.neverRecovered > 0 &&
            ` ${result.neverRecovered} ${result.neverRecovered === 1 ? "drop is" : "drops are"} not listed here, having never returned.`}
        </p>
      </div>
    );
  },
});

export default cadenceRecoveryWidget;
