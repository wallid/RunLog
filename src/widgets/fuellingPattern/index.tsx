import { Fragment } from "react";
import { defineWidget } from "../contract";
import { HeroFigure, Legend } from "@/viz/primitives";
import { Track } from "@/viz/Track";
import {
  formatDistanceShort,
  formatDuration,
  formatDurationWords,
} from "@/lib/format";
import { ANNOTATION_COLOR, annotationMarkers } from "../helpers";
import { fuellingPattern, FUELLING_EXPECTED_S, type FuellingPattern } from "./pattern";
import shared from "../shared.module.css";
import styles from "./FuellingPattern.module.css";

/**
 * When the fuelling happened, and how evenly.
 *
 * The neighbouring *Event impact* card asks whether a particular gel did
 * anything, which is the harder question and the one a single run answers
 * worst. This card asks the easier one, which happens to be the more useful:
 * was there a plan, and did it hold to the end. Every figure on it is counting
 * and subtraction over what the reader typed in, so unlike its neighbour it
 * works on a run of any length and has nothing to be uncertain about.
 *
 * What it will not do is turn events into grams. See the note in `pattern.ts`.
 */

/**
 * The two washes this card lays down.
 *
 * Neutral tints rather than the zone bands, because neither stretch is a claim
 * about effort — one is the longest wait between mouthfuls and the other is
 * what was run after the last of them. Borrowing the effort palette for
 * something that is not effort is how a reader ends up thinking the pale end of
 * a chart means easy.
 */
const GAP_COLOR = "var(--accent-soft)";
const CLOSING_COLOR = "var(--surface-inset)";

export const fuellingPatternWidget = defineWidget<FuellingPattern>({
  id: "fuelling-pattern",
  title: "Fuelling pattern",
  description:
    "When you took on fuel through the run, how far apart, and how long the run went on after the last of it.",
  section: "insight",
  // Arithmetic on the reader's own entries and the file's clock. No model
  // stands between what was typed and what is shown.
  provenance: "derived",
  requiredMetrics: ["time", "distance"],
  references: [
    {
      label:
        "Carbohydrate intake during exercise: how much can be absorbed and used, and how quickly.",
      detail: "Sports Medicine, review, 2014",
      url: "https://link.springer.com/article/10.1007/s40279-014-0148-z",
    },
  ],

  compute: fuellingPattern,

  narrate(result, activity) {
    const { events, medianGapS, longest, fuellingExpected } = result;
    const single = events.length === 1;

    const information = [
      { label: "Fuelling events", value: String(events.length) },
      ...(medianGapS !== undefined
        ? [{ label: "Typical gap", value: formatDurationWords(medianGapS) }]
        : []),
      ...(longest
        ? [
            {
              label: "Longest gap",
              value: formatDurationWords(longest.durationS),
              note: `${formatDistanceShort(longest.fromDistanceM)} to ${formatDistanceShort(longest.toDistanceM)}`,
            },
          ]
        : []),
      {
        label: "After the last",
        value: formatDurationWords(result.closingS),
        note: `${formatDistanceShort(result.closingDistanceM)} to the finish`,
      },
    ];

    const observations = [
      {
        text: single
          ? `You took on fuel once, ${formatDurationWords(result.openingS)} in at ${formatDistanceShort(result.openingDistanceM)}.`
          : `You took on fuel ${events.length} times across ${formatDuration(activity.elapsedS)} — one every ${formatDurationWords(medianGapS ?? 0)} at the median, the first ${formatDurationWords(result.openingS)} in at ${formatDistanceShort(result.openingDistanceM)}.`,
        evidence: events.map((event) => ({
          label: `Fuel at ${formatDistanceShort(activity.samples[event.t]?.distanceM ?? 0)}`,
          startT: event.t,
          endT: event.t,
        })),
      },
    ];

    if (longest && longest.durationS > (medianGapS ?? 0) * 1.5) {
      observations.push({
        text: `The spacing was not even: the longest stretch without fuel ran ${formatDurationWords(longest.durationS)} and ${formatDistanceShort(longest.distanceM)}, between ${formatDistanceShort(longest.fromDistanceM)} and ${formatDistanceShort(longest.toDistanceM)}.`,
        evidence: [
          { label: "Longest gap", startT: longest.fromT, endT: longest.toT },
        ],
      });
    }

    observations.push({
      text: `After the last one you ran a further ${formatDistanceShort(result.closingDistanceM)}, or ${formatDurationWords(result.closingS)}, on what you were already carrying.`,
      evidence: [
        {
          label: "After the last one",
          startT: events[events.length - 1].t,
          endT: activity.elapsedS,
        },
      ],
    });

    const explanations = [];
    if (!fuellingExpected) {
      explanations.push({
        text: `At ${formatDuration(activity.elapsedS)} this run is shorter than the point where fuelling usually starts to change anything, so the figures above describe what you did rather than measure it against a target. Most runners need nothing at all inside about ninety minutes.`,
        confidence: "high" as const,
        relatedMetrics: [],
      });
    } else {
      explanations.push({
        text: `Published guidance for efforts past a couple of hours puts carbohydrate intake somewhere around 30 to 60 grams an hour, and at ${result.perHour.toFixed(1)} events an hour this run may or may not have reached that — the card counts events, not grams, and has no way to know what was in them. It is the spacing that is being reported here, not the amount.`,
        // The spacing is exact; what it implies about intake is not, because
        // the one number that would settle it was never recorded.
        confidence: "low" as const,
        relatedMetrics: [],
      });
    }

    return {
      information,
      observations,
      explanations,
      teaching: [
        {
          title: "Why this counts events rather than grams",
          text: "The figure that would actually answer whether you fuelled enough is grams of carbohydrate an hour, and nothing here knows it. A gel is commonly twenty to twenty-five grams, but brands vary by a factor of two, and a drink can be plain water or carry more than a gel does. Converting your entries into grams would mean inventing the most important number on the card and presenting it in the same type as the ones that were measured. So the spacing is reported exactly and the amount is left to you.",
        },
        {
          title: "Why the gaps matter more than the total",
          text: "Carbohydrate absorption has a ceiling — roughly sixty grams an hour from a single sugar source, somewhat more from a mix — so what is not taken during a long gap cannot be made up by taking twice as much later. That is why an even pattern tends to hold up better than the same amount taken in fewer, larger doses, and why the stretch after the last one is worth looking at on its own.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const { events, intervals, longest, medianGapS } = result;

    return (
      <div>
        <HeroFigure
          value={
            medianGapS !== undefined
              ? `Every ${formatDurationWords(medianGapS)}`
              : `${events.length} event`
          }
          caption={
            medianGapS !== undefined
              ? `${events.length} fuelling events across ${formatDuration(activity.elapsedS)}`
              : `taken ${formatDurationWords(result.openingS)} into the run`
          }
          tone="neutral"
        />

        <p className={shared.trackLabel}>Where the fuel went in</p>
        <Track
          activity={activity}
          height={34}
          widgetId="fuelling-pattern"
          showAxis
          ariaLabel={`The run, with ${events.length} fuelling events marked on it`}
          markers={annotationMarkers(activity, events)}
          regions={[
            ...(longest
              ? [
                  {
                    startT: longest.fromT,
                    endT: longest.toT,
                    color: GAP_COLOR,
                    label: "Longest gap",
                    behind: true,
                  },
                ]
              : []),
            {
              startT: events[events.length - 1].t,
              endT: activity.elapsedS,
              color: CLOSING_COLOR,
              label: "After the last one",
              behind: true,
            },
          ]}
        >
          {() => null}
        </Track>

        <Legend
          items={[
            { label: "Fuel taken", color: ANNOTATION_COLOR, shape: "dashed" },
            ...(longest ? [{ label: "Longest gap", color: GAP_COLOR }] : []),
            { label: "After the last one", color: CLOSING_COLOR },
          ]}
        />

        {intervals.length > 0 && (
          <div className={styles.table}>
            <span className={styles.head}>Between</span>
            <span className={styles.headRight}>Distance</span>
            <span className={styles.headRight}>Gap</span>

            {intervals.map((interval) => (
              // A fragment rather than a wrapper, so each cell is its own grid
              // item and the columns line up down the table.
              <Fragment key={interval.fromT}>
                <span className={styles.interval}>
                  {interval.fromLabel} → {interval.toLabel}
                  <span className={styles.where}>
                    {formatDistanceShort(interval.fromDistanceM)} to{" "}
                    {formatDistanceShort(interval.toDistanceM)}
                  </span>
                </span>
                <span className={`${styles.value} numeric`}>
                  {formatDistanceShort(interval.distanceM)}
                </span>
                <span
                  className={`${interval === longest ? styles.gapLongest : styles.gap} numeric`}
                >
                  {formatDuration(interval.durationS)}
                </span>
              </Fragment>
            ))}
          </div>
        )}

        <p className={shared.note}>
          Gaps are measured on the clock rather than in moving time, because that
          is the clock fuelling is spaced by. Only nutrition events are counted
          here — anything else you marked on the run is left to the charts above.
        </p>
      </div>
    );
  },
});

export { FUELLING_EXPECTED_S };
export default fuellingPatternWidget;
