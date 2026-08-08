import { defineWidget, type Reference } from "../contract";
import type { GradeAdjustment, Split } from "@/model/activity";
import { Legend } from "@/viz/primitives";
import { useSelectionStore } from "@/state/selectionStore";
import { NOISE_FLOOR } from "../helpers";
import {
  formatDistance,
  formatElevation,
  formatPaceDelta,
  formatPaceWithUnit,
  formatSigned,
} from "@/lib/format";
import shared from "../shared.module.css";
import styles from "./GradeAdjustedPace.module.css";

/**
 * Every kilometre put back on the flat.
 *
 * The splits card says in words that a kilometre which climbs thirty metres and
 * one that descends thirty metres are not comparable. This is the same argument
 * with a number attached: each split's pace divided by what its ground was
 * worth in flat ground, which is usually enough to change which kilometre was
 * the strongest.
 *
 * The model, and what it does not cover, are in `model/gradeAdjusted.ts`. The
 * short version for anything written here: it equalises the energy a kilometre
 * cost, so it can say a climb was run harder than it looked. It cannot say what
 * a long descent did to the legs, and nothing on this card should imply it can.
 */

/** The one paper the whole card rests on. */
const MINETTI: Reference = {
  label:
    "The energy cost of running a metre measured across gradients from −45% to +45% on a treadmill, and fitted as a polynomial — the curve every grade adjustment since is a form of.",
  detail: "Minetti, Moia, Roi, Susta & Ferretti, Journal of Applied Physiology, 2002",
  url: "https://journals.physiology.org/doi/full/10.1152/japplphysiol.01177.2001",
};

interface Row {
  split: Split;
  paceSecPerKm: number;
  adjustedSecPerKm: number;
  /** Adjusted minus actual: negative where the ground was doing the slowing. */
  deltaSecPerKm: number;
}

interface Result {
  rows: Row[];
  /** The pace domain the rows are drawn across, covering both series. */
  fastest: number;
  slowest: number;
  adjustment: GradeAdjustment;
  movingPaceSecPerKm: number;
  adjustedMovingPaceSecPerKm: number;
  /** Lowest adjusted pace: the kilometre actually run hardest. */
  strongest: Row;
  /** Lowest actual pace: the kilometre that looked fastest. */
  quickest: Row;
  /** The row the adjustment moved furthest, in either direction. */
  moved: Row;
  /** Whether adjusting changed which kilometre comes out on top. */
  reordered: boolean;
}

/**
 * The least the terrain has to have done before this card is worth showing.
 *
 * On genuinely flat ground the adjustment is a rounding error dressed up as an
 * insight, and a card reporting "0 seconds per kilometre" would be inviting the
 * reader to find meaning in noise. Either the run as a whole has to have been
 * worth measurably more than its distance, or some single kilometre has to move
 * by more than pace is accurate to.
 */
const MIN_RUN_FACTOR_SHIFT = 0.005;

export const gradeAdjustedPaceWidget = defineWidget<Result>({
  id: "grade-adjusted-pace",
  title: "Pace with the hills taken out",
  description: "What each kilometre would have been on flat ground, at the same cost.",
  section: "terrain",
  requiredMetrics: ["pace", "gradient", "distance"],
  provenance: "estimated",
  references: [MINETTI],

  compute(activity) {
    const adjustment = activity.summary.gradeAdjustment;
    if (!adjustment) return null;

    const rows: Row[] = [];
    for (const split of activity.splits) {
      const adjusted = split.gradeAdjustedPaceSecPerKm;
      if (adjusted === undefined) continue;
      rows.push({
        split,
        paceSecPerKm: split.paceSecPerKm,
        adjustedSecPerKm: adjusted,
        deltaSecPerKm: adjusted - split.paceSecPerKm,
      });
    }
    if (rows.length < 2) return null;

    // A four-hundred-metre finish is drawn like any other row but never wins
    // anything: its pace is a short sample and would take the superlatives off
    // the kilometres that earned them. The splits list leaves partials out of
    // its own fastest and slowest for the same reason.
    const comparable = rows.filter((row) => !row.split.tags.includes("partial"));
    if (comparable.length < 2) return null;

    const biggestMove = Math.max(...comparable.map((row) => Math.abs(row.deltaSecPerKm)));
    const runShift = Math.abs(1 - adjustment.factor);
    if (runShift < MIN_RUN_FACTOR_SHIFT && biggestMove < NOISE_FLOOR.paceSecPerKm) {
      return null;
    }

    const strongest = comparable.reduce((a, b) =>
      b.adjustedSecPerKm < a.adjustedSecPerKm ? b : a,
    );
    const quickest = comparable.reduce((a, b) =>
      b.paceSecPerKm < a.paceSecPerKm ? b : a,
    );
    const moved = comparable.reduce((a, b) =>
      Math.abs(b.deltaSecPerKm) > Math.abs(a.deltaSecPerKm) ? b : a,
    );

    const paces = rows.flatMap((row) => [row.paceSecPerKm, row.adjustedSecPerKm]);
    const movingPaceSecPerKm = activity.summary.movingPaceSecPerKm;

    return {
      rows,
      fastest: Math.min(...paces),
      slowest: Math.max(...paces),
      adjustment,
      movingPaceSecPerKm,
      adjustedMovingPaceSecPerKm: movingPaceSecPerKm / adjustment.factor,
      strongest,
      quickest,
      moved,
      reordered: strongest.split.index !== quickest.split.index,
    };
  },

  narrate(result, activity) {
    const {
      adjustment,
      movingPaceSecPerKm,
      adjustedMovingPaceSecPerKm,
      strongest,
      quickest,
      moved,
    } = result;

    const runDelta = adjustedMovingPaceSecPerKm - movingPaceSecPerKm;
    const observations = [];

    observations.push({
      text:
        Math.abs(runDelta) < NOISE_FLOOR.paceSecPerKm
          ? `Climbs and descents very nearly cancelled: the run is worth ${formatPaceWithUnit(adjustedMovingPaceSecPerKm)} on flat ground, which is what it was run at.`
          : `The ${formatPaceWithUnit(movingPaceSecPerKm)} this run was held at cost what ${formatPaceWithUnit(adjustedMovingPaceSecPerKm)} would have cost on flat ground — ${formatPaceDelta(runDelta)} ${runDelta < 0 ? "quicker" : "slower"} than the figure on the watch.`,
    });

    // Flat-equivalent distance is the same fact said the other way round, and
    // it is the way most runners find easier to picture. Gated on the pace
    // difference rather than on the factor, so that a run whose climbs and
    // descents cancelled is not told they cancelled and then handed a longer
    // distance in the next sentence.
    if (Math.abs(runDelta) >= NOISE_FLOOR.paceSecPerKm) {
      observations.push({
        text: `Put as ground rather than pace: ${formatDistance(adjustment.actualDistanceM)} over this route cost what ${formatDistance(adjustment.flatEquivalentDistanceM)} of level ground would have.`,
      });
    }

    if (result.reordered) {
      observations.push({
        text: `Kilometre ${quickest.split.index} was the fastest on the clock at ${formatPaceWithUnit(quickest.paceSecPerKm)}, but the kilometre run hardest was ${strongest.split.index}: ${formatPaceWithUnit(strongest.paceSecPerKm)} over ${formatElevation(strongest.split.gainM)} of climbing, worth ${formatPaceWithUnit(strongest.adjustedSecPerKm)} on the flat.`,
        evidence: [
          {
            label: `Kilometre ${quickest.split.index}`,
            startT: quickest.split.startT,
            endT: quickest.split.endT,
          },
          {
            label: `Kilometre ${strongest.split.index}`,
            startT: strongest.split.startT,
            endT: strongest.split.endT,
          },
        ],
      });
    } else {
      observations.push({
        text: `Kilometre ${strongest.split.index} was the strongest either way — fastest on the clock and still the strongest once the ground is taken out.`,
        evidence: [
          {
            label: `Kilometre ${strongest.split.index}`,
            startT: strongest.split.startT,
            endT: strongest.split.endT,
          },
        ],
      });
    }

    const explanations = [];
    if (Math.abs(moved.deltaSecPerKm) >= NOISE_FLOOR.paceSecPerKm) {
      const climbed = moved.deltaSecPerKm < 0;
      explanations.push({
        // The terrain was recorded and the arithmetic on it is fixed, so the
        // only uncertainty left is in the curve — enough to keep this off
        // "high", not enough to make it a guess.
        text: `Kilometre ${moved.split.index} moved furthest, by ${formatPaceDelta(moved.deltaSecPerKm)}. It ${climbed ? `climbed ${formatElevation(moved.split.gainM)}, so its pace was being set by the hill as much as by the effort` : `dropped ${formatElevation(moved.split.lossM)}, so some of its speed was the ground rather than the running`}.`,
        confidence: "medium" as const,
        relatedMetrics: ["gradient" as const, "pace" as const, "elevation" as const],
      });
    }

    const descents = result.rows.filter((row) => row.deltaSecPerKm > NOISE_FLOOR.paceSecPerKm);
    if (descents.length > 0 && activity.availableMetrics.has("heartRate")) {
      explanations.push({
        text: `${descents.length === 1 ? `Kilometre ${descents[0].split.index} adjusts` : `${descents.length} kilometres adjust`} to a slower pace than ${descents.length === 1 ? "it was" : "they were"} run at, which is what a descent looks like once the help is taken back. Heart rate over those stretches is the check worth making: if it stayed high, the effort was real even though the adjustment does not credit it.`,
        confidence: "medium" as const,
        relatedMetrics: ["gradient" as const, "pace" as const, "heartRate" as const],
      });
    }

    return {
      information: [
        {
          label: "Adjusted",
          value: formatPaceWithUnit(adjustedMovingPaceSecPerKm),
          note: "moving time",
        },
        {
          label: "Actual",
          value: formatPaceWithUnit(movingPaceSecPerKm),
          note: "moving time",
        },
        {
          label: "Flat equivalent",
          value: formatDistance(adjustment.flatEquivalentDistanceM),
          note: `ran ${formatDistance(adjustment.actualDistanceM)}`,
        },
        { label: "Strongest km", value: `${strongest.split.index}` },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "What the adjustment equalises",
          text: "A gradient changes how much energy a metre costs, and that change has been measured: running up a 5% climb costs about a third more per metre than running on the level. Dividing pace by that ratio gives the pace on flat ground that would have cost the same, which is what makes a hilly kilometre and a flat one comparable at all.",
        },
        {
          title: "Downhill is not free",
          text: "The cost curve bottoms out around a 20% descent and rises again below it, because braking takes work. A steep enough descent adjusts to a slower pace than it was run at — and even where it does not, the adjustment only equalises energy. It knows nothing about what a long descent does to the legs, which is most of what makes downhill running hurt afterwards.",
        },
      ],
    };
  },

  View({ result }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    // The domain covers both series, so the two marks on a row are on one scale
    // and the distance between them is the size of the adjustment. Faster sits
    // left, which is the direction a climb moves a split.
    const span = Math.max(1, result.slowest - result.fastest);
    const position = (pace: number) => ((pace - result.fastest) / span) * 100;

    return (
      <div>
        <ul className={styles.list}>
          {result.rows.map((row, index) => {
            const { split } = row;
            const selected = highlight?.kind === "split" && highlight.index === split.index;
            const actual = position(row.paceSecPerKm);
            const adjusted = position(row.adjustedSecPerKm);
            const shifted = Math.abs(row.deltaSecPerKm) >= NOISE_FLOOR.paceSecPerKm;

            return (
              <li
                key={split.index}
                style={{ "--item": Math.min(index, 12) } as React.CSSProperties}
              >
                <button
                  type="button"
                  className={`${styles.row} ${selected ? styles.selected : ""}`}
                  onClick={() =>
                    focusRegion(
                      split.startT,
                      split.endT,
                      { kind: "split", index: split.index },
                      "grade-adjusted-pace",
                    )
                  }
                  aria-pressed={selected}
                >
                  <span className={`${styles.number} numeric`}>
                    {split.tags.includes("partial")
                      ? formatDistance(split.distanceM)
                      : `km ${split.index}`}
                  </span>

                  <span className={styles.track}>
                    <span className={styles.rule} aria-hidden="true" />
                    <span
                      className={styles.connector}
                      style={{
                        left: `${Math.min(actual, adjusted)}%`,
                        width: `${Math.abs(adjusted - actual)}%`,
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className={styles.actual}
                      style={{ left: `${actual}%` }}
                      aria-hidden="true"
                    />
                    <span
                      className={styles.adjusted}
                      style={{ left: `${adjusted}%` }}
                      aria-hidden="true"
                    />
                  </span>

                  <span className={styles.figures}>
                    <span className={`${styles.pace} numeric`}>
                      {formatPaceWithUnit(row.adjustedSecPerKm)}
                    </span>
                    <span className={`${styles.detail} numeric`}>
                      {formatPaceWithUnit(row.paceSecPerKm)} run
                      {shifted && ` · ${formatSigned(row.deltaSecPerKm, "s/km")}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <Legend
          label="Each row is one kilometre, faster to the left"
          items={[
            { label: "Run at", color: "var(--text-muted)" },
            { label: "Worth on the flat", color: "var(--metric-pace)" },
          ]}
        />

        <p className={shared.note}>
          Adjusted paces come from a treadmill measurement of what a metre costs at
          each gradient, applied here to a gradient read from the barometer. They are
          modelled figures: good enough to compare one kilometre of this run against
          another, not a time anyone ran.
        </p>
      </div>
    );
  },
});

export default gradeAdjustedPaceWidget;
