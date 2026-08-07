import { defineWidget } from "../contract";
import type { DerivedActivity } from "@/model/activity";
import { mean, median } from "@/lib/stats";
import { formatCadence, formatPaceWithUnit } from "@/lib/format";
import { NOISE_FLOOR } from "../helpers";
import {
  CADENCE_IS_PERSONAL,
  MIN_CADENCE_SECONDS,
  binCadenceAgainst,
  runningCadence,
  stepCount,
} from "../cadenceHelpers";
import shared from "../shared.module.css";

/**
 * What cadence means, answered with this run's numbers.
 *
 * A definition on its own is a paragraph anybody could have written. Every card
 * here is built from the file in front of the reader, so "cadence changes with
 * the ground" arrives as the two figures from their own climb rather than as a
 * general claim they have to take on trust.
 *
 * This section sits last in the cadence sequence deliberately: by the time a
 * reader reaches it they have seen the numbers, and the question they have is
 * what to do with them.
 */

interface Card {
  title: string;
  value: string;
  detail: string;
}

interface Result {
  cards: Card[];
  avg: number;
  strideLengthM?: number;
}

export const cadenceMeaningWidget = defineWidget<Result>({
  id: "cadence-meaning",
  title: "What cadence means",
  description: "The metric explained with this run's own figures.",
  section: "cadence",
  requiredMetrics: ["cadence"],

  compute(activity) {
    const values = runningCadence(activity);
    if (values.length < MIN_CADENCE_SECONDS) return null;

    const avg = mean(values);
    const { steps, strideLengthM } = stepCount(activity);

    const cards: Card[] = [
      {
        title: "What it counts",
        value: formatCadence(avg),
        detail: `Cadence is how many times your feet hit the ground in a minute, counting both of them. Over this run that came to about ${Math.round(steps).toLocaleString()} steps.`,
      },
    ];

    if (strideLengthM !== undefined) {
      cards.push({
        title: "What it leaves out",
        value: `${strideLengthM.toFixed(2)} m`,
        detail: `Cadence says nothing about how far each step went. Yours averaged ${strideLengthM.toFixed(2)} m here, and speed is the two multiplied together — so a cadence figure without a stride figure is half the story.`,
      });
    }

    const terrain = terrainCard(activity);
    if (terrain) cards.push(terrain);

    const pace = paceCard(activity);
    if (pace) cards.push(pace);

    return { cards, avg, strideLengthM };
  },

  narrate(result) {
    return {
      information: [],
      observations: [
        {
          text: `This run's step rate averaged ${formatCadence(result.avg)}${
            result.strideLengthM !== undefined
              ? `, over strides of about ${result.strideLengthM.toFixed(2)} m`
              : ""
          }.`,
        },
      ],
      explanations: [
        {
          text: "Whether that figure is right for you is not something one run can answer, and not something this page will claim to. Cadence is worth watching across runs at similar efforts, where a change means something; a single number compared against somebody else's means very little.",
          confidence: "medium" as const,
          relatedMetrics: ["cadence" as const],
        },
      ],
      teaching: [
        CADENCE_IS_PERSONAL,
        {
          title: "About the number 180",
          text: "The figure of 180 steps per minute comes from a count of elite distance runners racing in the 1984 Olympics. It described what fast runners did at racing speed; it was never a target for everyone at every pace, and cadence at an easy pace is lower for almost all runners, including those same elites.",
        },
        {
          title: "When cadence is worth changing",
          text: "Deliberately raising cadence is sometimes used to shorten an overreaching stride, which can reduce braking forces at each footfall. It is a change to make gradually and for a reason, not because a number looked low — and this page cannot see your stride, only how often it repeated.",
        },
      ],
    };
  },

  View({ result }) {
    return (
      <div>
        <div className={shared.cards}>
          {result.cards.map((card) => (
            <div key={card.title} className={shared.card}>
              <p className={shared.cardTitle}>{card.title}</p>
              <p className={`${shared.cardValue} numeric`}>{card.value}</p>
              <p className={shared.cardDetail}>{card.detail}</p>
            </div>
          ))}
        </div>

        <p className={shared.note}>
          Every figure on this card comes from this run. Nothing here is compared against a
          target, because there is no cadence that is correct for every runner at every pace.
        </p>
      </div>
    );
  },
});

/**
 * A difference in steps per minute, with the sign that survives rounding.
 *
 * A difference of a third of a step is not a fall, and printing it as "−0 spm"
 * would claim a direction the number does not carry.
 */
function signedSpm(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded === 0) return "±0 spm";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)} spm`;
}

/** What this run's own hills did to the rhythm, when it had any. */
function terrainCard(activity: DerivedActivity): Card | null {
  if (!activity.availableMetrics.has("gradient")) return null;

  const bins = binCadenceAgainst(
    activity,
    (sample) => sample.gradientPct,
    [-25, -2, 2, 25],
    (from) => (from <= -25 ? "downhill" : from <= -2 ? "flat" : "uphill"),
    30,
  );
  const flat = bins.find((bin) => bin.label === "flat");
  const uphill = bins.find((bin) => bin.label === "uphill");
  if (!flat || !uphill) return null;

  const delta = uphill.cadenceSpm - flat.cadenceSpm;
  return {
    title: "What changes it",
    value: signedSpm(delta),
    detail:
      Math.abs(delta) < NOISE_FLOOR.cadenceSpm
        ? `On this run the ground made almost no difference: ${formatCadence(uphill.cadenceSpm)} on rising ground against ${formatCadence(flat.cadenceSpm)} on the flat. Gradient, speed, fatigue and footing all move cadence, and here the gradient did not.`
        : `Your rhythm ran ${Math.abs(Math.round(delta))} steps per minute ${delta > 0 ? "quicker" : "slower"} on rising ground than on the flat in this run. Gradient, speed, fatigue and footing all move cadence, which is why a single average hides more than it shows.`,
  };
}

/** How the rhythm differed between this run's quickest and slowest running. */
function paceCard(activity: DerivedActivity): Card | null {
  if (!activity.availableMetrics.has("pace")) return null;

  const paces = activity.samples
    .filter((sample) => sample.paceSecPerKm !== undefined)
    .map((sample) => sample.paceSecPerKm!);
  if (paces.length < 120) return null;

  const mid = median(paces);
  const bins = binCadenceAgainst(
    activity,
    (sample) => sample.paceSecPerKm,
    [0, mid, 3600],
    (from) => (from === 0 ? "quicker" : "slower"),
    30,
  );
  const quicker = bins.find((bin) => bin.label === "quicker");
  const slower = bins.find((bin) => bin.label === "slower");
  if (!quicker || !slower) return null;

  const delta = quicker.cadenceSpm - slower.cadenceSpm;
  return {
    title: "What it follows",
    value: signedSpm(delta),
    detail: `Running quicker than ${formatPaceWithUnit(mid)} you took ${formatCadence(quicker.cadenceSpm)}; slower than that, ${formatCadence(slower.cadenceSpm)}. Step rate follows speed, so comparing cadence between two runs only means something when the paces match.`,
  };
}

export default cadenceMeaningWidget;
