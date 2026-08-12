import { defineWidget, type Stat } from "../contract";
import { Legend, Scatter } from "@/viz/primitives";
import { Track } from "@/viz/Track";
import { niceTicks } from "@/viz/scales";
import {
  formatDistanceShort,
  formatDuration,
  formatDurationWords,
  formatHeartRate,
  formatPace,
  formatPaceWithUnit,
} from "@/lib/format";
import { ANNOTATION_COLOR, annotationMarkers } from "../helpers";
import {
  AEROBIC_CEILING,
  BAND_LABELS,
  lactateProfile,
  OBLA,
  type LactateProfile,
  type LactateReading,
} from "./profile";
import shared from "../shared.module.css";
import styles from "./LactateProfile.module.css";

/**
 * The blood lactate readings a runner took, against the running they came off.
 *
 * A finger-prick reading mid-run is the one measurement here that the watch had
 * no part in, and on its own it is a number with no context: 3.8 means nothing
 * without the pace and the heart rate it was produced at. This card is that
 * join, and it is mostly reporting rather than inference — each reading, the
 * five minutes of running behind it, and the shape the readings make together.
 *
 * The one inferred figure is the pace at four millimoles, and it is refused far
 * more often than it is given. Four is a convention that sits near the average
 * person's maximal steady state, not a threshold measured on this runner, and
 * interpolating to it only means anything when the readings bracket it on
 * rising pace. Everything else the card says is arithmetic on what was typed in.
 */

const READING_COLOR = "var(--accent-ink)";
const LOOKBACK_COLOR = "var(--accent-soft)";

export const lactateProfileWidget = defineWidget<LactateProfile>({
  id: "lactate-profile",
  title: "Lactate profile",
  description:
    "The blood lactate readings you took during the run, each against the running in the five minutes before it, and what they make together.",
  section: "insight",
  // The readings and their timings are exactly what the runner typed, but the
  // pace beside each one is averaged over a window and the threshold figure is
  // interpolated, and a card takes the weakest of its inputs.
  provenance: "estimated",
  requiredMetrics: ["time", "distance"],
  references: [
    {
      label:
        "Where the fixed 4 mmol/L threshold came from, and what it was justified against.",
      detail: "International Journal of Sports Medicine, 1985",
      url: "https://pubmed.ncbi.nlm.nih.gov/4030186/",
    },
    {
      label:
        "A review of lactate threshold concepts, and how much the individual value varies from the fixed one.",
      detail: "Sports Medicine, review, 2009",
      url: "https://pubmed.ncbi.nlm.nih.gov/19827858/",
    },
    {
      label:
        "Lactate as a fuel that muscles produce and consume, rather than a waste product of fatigue.",
      detail: "Cell Metabolism, review, 2018",
      url: "https://pubmed.ncbi.nlm.nih.gov/29617642/",
    },
  ],

  compute: (activity) => lactateProfile(activity),

  narrate(profile) {
    const { readings, lowest, highest, estimate, steady } = profile;
    const paceKind = profile.usedGradeAdjusted ? "grade-adjusted pace" : "pace";

    const information: Stat[] = [
      { label: "Readings", value: String(readings.length) },
      {
        label: "Range",
        value:
          readings.length === 1
            ? `${highest.mmol} mmol/L`
            : `${lowest.mmol}–${highest.mmol} mmol/L`,
      },
    ];
    if (estimate) {
      information.push({
        label: `Pace at ${OBLA} mmol/L`,
        value: formatPaceWithUnit(estimate.paceSecPerKm),
        note: "interpolated, at a fixed concentration",
      });
    }

    const observations = readings.map((reading) => ({
      text: `${reading.mmol} mmol/L at ${formatDistanceShort(reading.distanceM)}${
        reading.paceSecPerKm === undefined
          ? ", with too little running in the five minutes before it to give it a pace."
          : `, off ${formatPaceWithUnit(reading.paceSecPerKm)}${
              reading.hrBpm === undefined
                ? ""
                : ` at ${formatHeartRate(Math.round(reading.hrBpm))}`
            } in the five minutes before it.`
      }`,
      evidence: [
        { label: "Read from", startT: reading.fromT, endT: reading.toT },
      ],
    }));

    if (steady) {
      observations.push({
        text: `Between ${formatDistanceShort(steady.from.distanceM)} and ${formatDistanceShort(steady.to.distanceM)} — ${formatDurationWords(steady.durationS)} at about ${formatPaceWithUnit(steady.paceSecPerKm)} — lactate moved by ${Math.abs(steady.riseMmol).toFixed(1)} mmol/L, from ${steady.from.mmol} to ${steady.to.mmol}.`,
        evidence: [{ label: "Held", startT: steady.from.t, endT: steady.to.t }],
      });
    }

    const explanations = [];
    if (estimate) {
      explanations.push({
        text: `Your readings cross ${OBLA} mmol/L between ${formatPaceWithUnit(estimate.below.paceSecPerKm)} and ${formatPaceWithUnit(estimate.above.paceSecPerKm)}, which puts the crossing at about ${formatPaceWithUnit(estimate.paceSecPerKm)}${
          estimate.hrBpm === undefined
            ? ""
            : ` and around ${formatHeartRate(Math.round(estimate.hrBpm))}`
        }. That is the pace at a fixed concentration, interpolated in a straight line between two readings — not your threshold. The concentration a given runner can actually hold ranges from roughly two to seven millimoles, so this figure is only as close to your own threshold as you happen to be to average.`,
        confidence: profile.confidence,
        relatedMetrics: ["pace" as const, "heartRate" as const],
      });
    } else if (profile.refusal) {
      explanations.push({
        text: `No pace is put on ${OBLA} mmol/L here. ${profile.refusal}`,
        confidence: "low" as const,
        relatedMetrics: ["pace" as const],
      });
    }

    if (steady) {
      explanations.push({
        text: `Lactate holding within a millimole across ${formatDurationWords(steady.durationS)} at one pace is what a sustainable effort looks like: production and clearance in balance rather than one outrunning the other. It suggests that pace was inside what you could hold that day, on that ground, in that weather — two samples cannot say how far inside, and a third at a harder pace is what would start to answer it.`,
        confidence: "low" as const,
        relatedMetrics: ["pace" as const],
      });
    } else if (readings.length >= 2) {
      const rising = readings[readings.length - 1].mmol > readings[0].mmol;
      explanations.push({
        text: rising
          ? `Lactate rose across the run, from ${readings[0].mmol} to ${readings[readings.length - 1].mmol} mmol/L. A rise at a rising pace is the ordinary response to working harder; a rise at the same pace is the more interesting one, and points at heat, dehydration or simply the run going on long enough to change what a given pace costs.`
          : `Lactate did not rise across the run, ending at ${readings[readings.length - 1].mmol} mmol/L against ${readings[0].mmol} at the first reading. Clearance kept up with production throughout, which is what easy running looks like from the inside.`,
        confidence: "low" as const,
        relatedMetrics: ["pace" as const, "heartRate" as const],
      });
    }

    return {
      information,
      observations,
      explanations,
      teaching: [
        {
          title: "What the reading is measuring",
          text: `Lactate is a fuel, not a waste product — muscles make it constantly and other muscles, the heart and the liver burn it. What a blood sample measures is the balance between the two: a low number means clearance is keeping up, and a rising number means production has pulled ahead. Below about ${AEROBIC_CEILING} mmol/L that balance is comfortable, and by ${OBLA} it is usually not, but the sample describes the minutes before the prick rather than the moment of it, which is why every reading here is paired with the running behind it rather than the running after it.`,
        },
        {
          title: `Why ${OBLA} mmol/L is a convention, not your threshold`,
          text: `The fixed four-millimole figure comes from work in the 1980s that looked for one concentration approximating the highest steady effort across a group of athletes. It does that job on average and badly on individuals: measured properly, the concentration a runner can actually hold steady varies from about two to seven. Treating ${OBLA} as your own threshold will set your training paces wrong in whichever direction you differ. Repeat readings across several runs at known paces tell you far more than one number interpolated from one test.`,
        },
        {
          title: "What would make these readings worth more",
          text: `A reading is only as good as the effort it came off. Samples taken at the end of steady stretches of three to five minutes at a held pace describe those stretches; a sample taken while the pace is still changing describes nothing in particular. ${paceKind === "grade-adjusted pace" ? "The gradient has been taken out of the paces here, which matters on a hilly test — the same effort on a climb reads far slower." : "On varied ground the paces here are raw, so a climb inside one of the windows will read as slower running at the same effort."} Timing, hygiene of the sampling and the meter's own error of a few tenths all move the figure too.`,
        },
      ],
    };
  },

  View({ result, activity }) {
    const { readings, estimate, steady } = result;
    const withPace = readings.filter(
      (reading): reading is LactateReading & { paceSecPerKm: number } =>
        reading.paceSecPerKm !== undefined,
    );

    return (
      <div>
        <p className={shared.trackLabel}>Where the readings were taken</p>
        <Track
          activity={activity}
          height={34}
          widgetId="lactate-profile"
          showAxis
          ariaLabel="The run, with the lactate readings marked on it"
          markers={annotationMarkers(
            activity,
            readings.map((reading) => reading.annotation),
          )}
          regions={readings.map((reading) => ({
            startT: reading.fromT,
            endT: reading.toT,
            color: LOOKBACK_COLOR,
            label: "Read from",
            behind: true,
          }))}
        >
          {() => null}
        </Track>

        <Legend
          items={[
            { label: "The running each reading describes", color: LOOKBACK_COLOR },
            { label: "Readings", color: ANNOTATION_COLOR, shape: "dashed" },
          ]}
        />

        <div className={styles.table}>
          <span className={styles.head}>Reading</span>
          <span className={styles.headRight}>Where</span>
          <span className={styles.headRight}>Pace</span>
          <span className={styles.headRight}>Heart rate</span>

          {readings.map((reading) => (
            <ReadingRow key={reading.annotation.id} reading={reading} />
          ))}
        </div>

        {/* The curve only exists once there are enough readings for it to have a
            shape, and only when they were taken at rising paces. Two points
            joined by a line would draw a straight one and imply the running in
            between had been measured; readings whose pace wandered would be
            joined in an order the run never went in. */}
        {withPace.length >= 3 && result.incremental && (
          <div className={styles.curve}>
            <p className={shared.trackLabel}>Lactate against the pace it came off</p>
            <Scatter
              points={withPace.map((reading) => ({
                x: reading.paceSecPerKm,
                y: reading.mmol,
              }))}
              // Faster running to the right, the way a lactate curve is drawn
              // everywhere else: the reader is looking for the upswing, and it
              // has to sweep upward as the effort goes up.
              xDomain={xDomainOf(withPace)}
              yDomain={yDomainOf(withPace)}
              xTicks={niceTicks(
                Math.min(...withPace.map((reading) => reading.paceSecPerKm)),
                Math.max(...withPace.map((reading) => reading.paceSecPerKm)),
                4,
              )}
              yTicks={niceTicks(0, Math.max(...withPace.map((r) => r.mmol)) + 1, 4)}
              formatX={(value) => formatPace(value)}
              formatY={(value) => value.toFixed(1)}
              xLabel="Pace (min/km) — faster to the right"
              yLabel="Lactate (mmol/L)"
              trend={withPace
                .slice()
                .sort((a, b) => b.paceSecPerKm - a.paceSecPerKm)
                .map((reading) => ({ x: reading.paceSecPerKm, y: reading.mmol }))}
              color={READING_COLOR}
              description="Each blood lactate reading plotted against the pace of the running it came off, joined in pace order"
            />
          </div>
        )}

        {withPace.length >= 3 && !result.incremental && (
          <p className={shared.note}>
            No curve is drawn here. These readings were not taken at rising
            paces, and joining them in pace order would draw a shape out of an
            order the running never went in.
          </p>
        )}

        {estimate && (
          <p className={styles.estimate}>
            Crossing {OBLA} mmol/L at about{" "}
            <strong className="numeric">
              {formatPaceWithUnit(estimate.paceSecPerKm)}
            </strong>
            {estimate.hrBpm !== undefined && (
              <>
                {" "}
                and{" "}
                <strong className="numeric">
                  {formatHeartRate(Math.round(estimate.hrBpm))}
                </strong>
              </>
            )}
            , interpolated between your {estimate.below.mmol} and{" "}
            {estimate.above.mmol} mmol/L readings. A fixed concentration, not
            your own threshold.
          </p>
        )}

        {steady && (
          <p className={styles.steady}>
            Flat across {formatDurationWords(steady.durationS)} at{" "}
            <strong className="numeric">
              {formatPaceWithUnit(steady.paceSecPerKm)}
            </strong>{" "}
            — {steady.from.mmol} to {steady.to.mmol} mmol/L.
          </p>
        )}

        <p className={shared.note}>
          Each reading is shown against the five minutes of running before it,
          counting moving seconds only, because that is the effort a sample
          describes.
          {result.usedGradeAdjusted
            ? " Pace has the gradient taken out of it where this run recorded enough elevation to do so."
            : ""}
        </p>
      </div>
    );
  },
});

/** One reading's row: the figure, then the running it came off. */
function ReadingRow({ reading }: { reading: LactateReading }) {
  return (
    <>
      <span className={styles.reading}>
        <span className="numeric">{reading.mmol.toFixed(1)} mmol/L</span>
        <span className={styles.band}>{BAND_LABELS[reading.band]}</span>
      </span>
      <span className={`${styles.value} numeric`}>
        {formatDistanceShort(reading.distanceM)}
        <span className={styles.at}>{formatDuration(reading.t)}</span>
      </span>
      <span className={`${styles.value} numeric`}>
        {reading.paceSecPerKm === undefined
          ? "—"
          : formatPaceWithUnit(reading.paceSecPerKm)}
      </span>
      <span className={`${styles.value} numeric`}>
        {reading.hrBpm === undefined
          ? "—"
          : formatHeartRate(Math.round(reading.hrBpm))}
      </span>
    </>
  );
}

/** Slowest pace on the left, fastest on the right, with a little air either side. */
function xDomainOf(
  readings: (LactateReading & { paceSecPerKm: number })[],
): [number, number] {
  const paces = readings.map((reading) => reading.paceSecPerKm);
  const pad = Math.max(5, (Math.max(...paces) - Math.min(...paces)) * 0.1);
  return [Math.max(...paces) + pad, Math.min(...paces) - pad];
}

/** Always from zero: a curve floated off the axis exaggerates its own rise. */
function yDomainOf(readings: LactateReading[]): [number, number] {
  return [0, Math.max(...readings.map((reading) => reading.mmol)) + 1];
}

export default lactateProfileWidget;
