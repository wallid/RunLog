import { defineWidget } from "../contract";
import type { DerivedActivity } from "@/model/activity";
import { mainClimb } from "../helpers";
import {
  formatDistanceShort,
  formatDurationWords,
  formatElevation,
  formatHeartRate,
  formatPaceWithUnit,
  formatPercent,
} from "@/lib/format";
import styles from "./LearningSummary.module.css";

/**
 * What to take away.
 *
 * Four sections, always in the same order: what held up, what changed, what
 * that probably means, and what would be worth watching next time. No score,
 * because reducing a run to a number is exactly the habit this product exists
 * to argue against.
 */

interface Result {
  wentWell: string[];
  changed: string[];
  meaning: string;
  uncertainty?: string;
  nextTime: string;
}

export const learningSummaryWidget = defineWidget<Result>({
  id: "learning-summary",
  title: "What this run teaches",
  description: "The few things worth carrying into the next run.",
  section: "insight",
  requiredMetrics: ["time", "distance"],

  compute(activity) {
    const wentWell = findStrengths(activity);
    const changed = findChanges(activity);
    if (wentWell.length === 0 && changed.length === 0) return null;

    return {
      wentWell,
      changed,
      meaning: buildMeaning(activity),
      uncertainty: buildUncertainty(activity),
      nextTime: buildFocus(activity),
    };
  },

  narrate(result) {
    return {
      information: [],
      observations: result.wentWell.slice(0, 1).map((text) => ({ text })),
      explanations: result.uncertainty
        ? [
            {
              text: result.uncertainty,
              confidence: "low" as const,
              relatedMetrics: [],
            },
          ]
        : [],
      teaching: [
        {
          title: "Why there is no score",
          text: "A single rating would have to weigh pace against terrain, effort against conditions, and this run against a plan it knows nothing about. Reading what actually happened is more useful than a number that hides all of it.",
        },
      ],
    };
  },

  View({ result }) {
    return (
      <div className={styles.sections}>
        {result.wentWell.length > 0 && (
          <Section title="What held up" tone="positive" items={result.wentWell} />
        )}
        {result.changed.length > 0 && <Section title="What changed" items={result.changed} />}
        <Section title="What that suggests" items={[result.meaning]} />
        {result.uncertainty && (
          <Section title="What is not clear" tone="cautious" items={[result.uncertainty]} />
        )}
        <Section title="Worth watching next time" tone="focus" items={[result.nextTime]} />
      </div>
    );
  },
});

function Section({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  tone?: "neutral" | "positive" | "cautious" | "focus";
}) {
  return (
    <section className={`${styles.section} ${styles[tone]}`}>
      <h3 className={styles.title}>{title}</h3>
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item} className={styles.item}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function findStrengths(activity: DerivedActivity): string[] {
  const strengths: string[] = [];
  const { summary } = activity;

  const consistency = summary.consistency;
  if (consistency && consistency.withinBandFraction >= 0.5) {
    strengths.push(
      `Pace held within ${Math.round(consistency.bandSecPerKm)} seconds per kilometre of the median for ${formatPercent(consistency.withinBandFraction)} of the moving run.`,
    );
  }

  const finish = activity.events.find((e) => e.type === "strongFinish");
  if (finish && finish.metrics.paceDeltaSecPerKm > 0) {
    strengths.push(
      `The final ${formatDistanceShort(finish.metrics.lengthM)} was ${Math.round(finish.metrics.paceDeltaSecPerKm)} seconds per kilometre quicker than the middle of the run, so there was capacity left at the end.`,
    );
  }

  if (summary.stopCount === 0 && activity.elapsedS > 600) {
    strengths.push("The run was continuous, with no stops detected.");
  }

  const best = summary.bestEfforts.find((e) => e.kind === "distance" && e.window === 1000);
  if (best && strengths.length < 2) {
    strengths.push(
      `The fastest continuous kilometre was ${formatPaceWithUnit(best.paceSecPerKm)} from ${formatDistanceShort(best.startDistanceM)}.`,
    );
  }

  return strengths.slice(0, 3);
}

function findChanges(activity: DerivedActivity): string[] {
  const changes: string[] = [];
  const { summary } = activity;

  const climb = mainClimb(activity);
  if (climb) {
    // Whether the climb was also where the run slowed most has to be checked
    // rather than assumed: on a rolling route the slowest split is frequently
    // somewhere else entirely, and claiming otherwise invents a fact.
    const slowest = activity.splits.find((s) => s.tags.includes("slowest"));
    const climbSlowedMost =
      slowest !== undefined &&
      slowest.startT < climb.endT &&
      slowest.endT > climb.startT;

    changes.push(
      `The ${climb.label.toLowerCase()} from ${formatDistanceShort(climb.startDistanceM)} gained ${formatElevation(climb.metrics.elevationChangeM)}${
        climbSlowedMost ? `, and kilometre ${slowest.index}, the slowest of the run, falls inside it` : ""
      }.`,
    );
  }

  const drift = summary.drift;
  if (drift && drift.driftPct >= 4) {
    changes.push(
      `Heart rate averaged ${formatHeartRate(Math.abs(drift.secondHalfHr - drift.firstHalfHr))} higher in the second half than the first.`,
    );
  }

  const fastStart = activity.events.find((e) => e.type === "fastStart");
  if (fastStart) {
    changes.push(
      `The opening kilometre was ${Math.round(fastStart.metrics.differencePct)}% quicker than the middle of the run.`,
    );
  }

  if (summary.stoppedS > 30) {
    changes.push(
      `${formatDurationWords(summary.stoppedS)} was spent stopped across ${summary.stopCount} ${summary.stopCount === 1 ? "pause" : "pauses"}.`,
    );
  }

  return changes.slice(0, 3);
}

function buildMeaning(activity: DerivedActivity): string {
  const climb = mainClimb(activity);
  const drift = activity.summary.drift;
  const slowest = activity.splits.find((s) => s.tags.includes("slowest"));

  // Eight metres over a kilometre is under a one per cent grade, which explains
  // very little. The claim is only worth making when the slowest split climbed
  // enough to be a real hill, and it is put as a candidate rather than a cause.
  if (climb && slowest && slowest.gainM >= 20) {
    return `The slowest split is more likely the terrain than the pacing: kilometre ${slowest.index} climbed ${formatElevation(slowest.gainM)}, which would account for a good part of the difference on its own.`;
  }

  if (drift && drift.confidence === "high" && drift.driftPct >= 4) {
    return `Pace stayed level while heart rate climbed ${drift.driftPct.toFixed(1)}%, which is the signature of duration and conditions rather than of running harder. On a longer run this is the pattern to watch.`;
  }

  if (drift && drift.confidence === "low") {
    return "Pace and heart rate both moved across the run, so the two cannot be separated from this file alone. A steadier run on flat ground would give a cleaner reading.";
  }

  if (activity.summary.gainM < activity.distanceM * 0.01) {
    return "The route was close to flat throughout, so terrain does not account for any of the variation in this run. Effort, conditions and pacing are the remaining explanations.";
  }

  return "Nothing in this run departed far enough from the rest of it to point to a single explanation, which is usually what a steady session looks like.";
}

function buildUncertainty(activity: DerivedActivity): string | undefined {
  if (activity.maxHrIsEstimated && activity.availableMetrics.has("hrZone")) {
    return `Every zone figure on this page rests on an estimated maximum heart rate of ${activity.maxHrUsed} bpm. Until that is your measured figure, treat the zone breakdown as indicative rather than accurate.`;
  }

  const walks = activity.events.filter((e) => e.type === "walk");
  if (walks.length > 0 && !activity.availableMetrics.has("cadence")) {
    return "This recording carries no cadence, so the slower sections cannot be confirmed as walking rather than easy running.";
  }

  const drift = activity.summary.drift;
  if (drift?.caveat) return drift.caveat;

  return undefined;
}

function buildFocus(activity: DerivedActivity): string {
  const climb = mainClimb(activity);
  if (climb) {
    return "Next time you run this route, compare your effort on the same climb rather than trying to hold flat-ground pace through it. Equal effort uphill is a slower pace by definition.";
  }

  const consistency = activity.summary.consistency;
  if (consistency && consistency.withinBandFraction < 0.4) {
    return "Pace moved around a good deal on level ground. If the run was meant to be steady, watch how quickly it drifts in the first few kilometres — that is usually where the pattern is set.";
  }

  const drift = activity.summary.drift;
  if (drift && drift.driftPct >= 5) {
    return "Watch whether heart rate climbs the same way on your next run of similar length. If it does, the cause is more likely conditioning or conditions than this particular session.";
  }

  return "Compare this run against your next one over similar ground and at a similar effort. A single run says much less than the same run repeated.";
}

export default learningSummaryWidget;
