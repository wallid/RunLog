import { defineWidget } from "../contract";
import type { DerivedActivity } from "@/model/activity";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPaceWithUnit,
  formatPower,
} from "@/lib/format";
import styles from "./RunSummary.module.css";

interface Result {
  runType: string;
  headline: string;
}

/**
 * Classifies the run from its own shape.
 *
 * The labels are deliberately loose and the unknown case is common: guessing a
 * workout's intent from its data is unreliable, and a wrong label undermines
 * everything else on the page.
 */
function classifyRun(activity: DerivedActivity): string {
  const km = activity.distanceM / 1000;
  const consistency = activity.summary.consistency;
  const varied = consistency !== undefined && consistency.withinBandFraction < 0.4;

  if (km >= 18) return "Long run";
  if (varied && (consistency?.surgeCount ?? 0) >= 3) return "Varied-pace run";
  if (km <= 6 && !varied) return "Short run";
  if (km > 6 && km < 18) return "Steady run";
  return "Run";
}

export const runSummaryWidget = defineWidget<Result>({
  id: "run-summary",
  title: "Run summary",
  description: "The basic shape of the run, before looking at where it changed.",
  section: "overview",
  requiredMetrics: ["time", "distance"],

  compute(activity) {
    return {
      runType: classifyRun(activity),
      headline: buildHeadline(activity),
    };
  },

  narrate(result, activity) {
    const { summary } = activity;
    const stats = [
      { label: "Distance", value: formatDistance(activity.distanceM) },
      { label: "Elapsed", value: formatDuration(activity.elapsedS) },
      { label: "Average pace", value: formatPaceWithUnit(summary.avgPaceSecPerKm) },
    ];

    if (activity.movingS < activity.elapsedS) {
      stats.push({
        label: "Moving time",
        value: formatDuration(activity.movingS),
      });
    }
    if (summary.avgHr !== undefined) {
      stats.push({ label: "Average heart rate", value: formatHeartRate(summary.avgHr) });
    }
    if (summary.maxHr !== undefined) {
      stats.push({ label: "Maximum heart rate", value: formatHeartRate(summary.maxHr) });
    }
    if (summary.gainM > 0) {
      stats.push({ label: "Elevation gain", value: formatElevation(summary.gainM) });
    }
    if (summary.avgPowerW !== undefined) {
      stats.push({ label: "Average power", value: formatPower(summary.avgPowerW) });
    }
    if (activity.summary.avgCadenceSpm !== undefined) {
      stats.push({
        label: "Average cadence",
        value: `${Math.round(activity.summary.avgCadenceSpm)} spm`,
      });
    }
    if (activity.calories !== undefined) {
      stats.push({ label: "Calories", value: `${Math.round(activity.calories)}` });
    }

    return {
      information: stats,
      observations: [{ text: result.headline }],
      explanations: [],
      teaching: [
        {
          title: "What a summary can and cannot tell you",
          text: "These totals describe the run as a whole. They cannot show where it changed or why, which is what the rest of this page is for. Two runs with the same average pace can feel completely different.",
        },
      ],
    };
  },

  View({ result, activity }) {
    return (
      <div>
        {/* The date is not repeated here: the masthead already carries it, and
            the headline sentence is this widget's observation. */}
        <div className={styles.identity}>
          <span className={styles.badge}>{result.runType}</span>
        </div>

        {activity.maxHrIsEstimated && activity.maxHrUsed !== undefined && (
          <p className={styles.caveat}>
            Zones use an estimated maximum of <strong>{activity.maxHrUsed} bpm</strong>. Set
            your own in <strong>Zone settings</strong> for accurate zones.
          </p>
        )}

        {activity.warnings.length > 0 && (
          <ul className={styles.warnings}>
            {activity.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    );
  },
});

function buildHeadline(activity: DerivedActivity): string {
  const distance = formatDistance(activity.distanceM);
  const pace = formatPaceWithUnit(activity.summary.avgPaceSecPerKm);
  const duration = formatDuration(activity.elapsedS);

  let headline = `This was a ${distance} run completed in ${duration} at an average pace of ${pace}.`;

  const climbs = activity.events.filter((e) => e.type === "climb");
  if (climbs.length > 0) {
    const main = climbs.reduce((a, b) =>
      b.metrics.elevationChangeM > a.metrics.elevationChangeM ? b : a,
    );
    headline += ` The largest change came on the climb from ${(main.startDistanceM / 1000).toFixed(1)} km.`;
  } else if (activity.summary.gainM < activity.distanceM * 0.01) {
    headline += " The route was close to flat throughout.";
  }

  return headline;
}

export default runSummaryWidget;
