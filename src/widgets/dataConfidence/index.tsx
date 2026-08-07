import { defineWidget } from "../contract";
import type { DerivedActivity, MetricType, Sample } from "@/model/activity";
import { ProportionBars } from "@/viz/primitives";
import { formatPercent } from "@/lib/format";
import { LAB_IS_PROVISIONAL, RESEARCH } from "../labHelpers";
import shared from "../shared.module.css";

/**
 * What this file can and cannot support.
 *
 * Every other card assumes its metric was recorded well enough to reason about.
 * This one checks, and says so, because the alternative is a page that reads
 * identically whether heart rate covered the whole run or a third of it.
 *
 * It also names what is absent. A recent review of Apple Watch validation
 * studies found heart rate close to reference on average while energy
 * expenditure was far less reliable, and the running-form measurements that
 * would carry half of the durability literature — ground-contact time and
 * vertical oscillation — are simply not in the files this app reads. Saying
 * which of those this run has is more useful than quietly building a card on
 * one that is missing.
 *
 * Step length is the exception, and is deliberately not listed as absent: it
 * falls out of speed and cadence exactly, which is what the stride card uses.
 * What this card says is missing is a *measured* one.
 */

/** Coverage below this is too thin to average a metric over the run. */
const USABLE_COVERAGE = 0.8;

interface Row {
  metric: string;
  label: string;
  /** Share of the run's seconds carrying a value, 0–1. */
  coverage: number;
  /** What that coverage supports, in one word. */
  grade: "Complete" | "Good" | "Partial" | "Sparse" | "Not recorded";
}

interface Result {
  rows: Row[];
  /** Metrics the durability research uses that this file does not carry. */
  absent: string[];
  thin: Row[];
  maxHrIsEstimated: boolean;
  hasCalories: boolean;
  warnings: string[];
  source: "fit" | "gpx";
}

/** The per-second series a reader would expect a running watch to record. */
const TRACKED: { metric: MetricType; label: string; pick: (s: Sample) => number | undefined }[] =
  [
    { metric: "heartRate", label: "Heart rate", pick: (s) => s.hrBpm },
    { metric: "speed", label: "Speed and pace", pick: (s) => s.speedMps },
    { metric: "position", label: "GPS position", pick: (s) => s.lat },
    { metric: "elevation", label: "Elevation", pick: (s) => s.elevationM },
    { metric: "cadence", label: "Cadence", pick: (s) => s.cadenceSpm },
    { metric: "power", label: "Running power", pick: (s) => s.powerW },
  ];

/**
 * Form measurements the durability research leans on.
 *
 * None of these reach the activity model, because no consumer export this app
 * reads has carried them. They are listed so the reader knows why there is no
 * card about running form rather than assuming the run had nothing to say.
 */
const FORM_METRICS = [
  "ground-contact time",
  "vertical oscillation",
  "directly measured stride length",
  "left–right balance",
];

export const dataConfidenceWidget = defineWidget<Result>({
  id: "data-confidence",
  title: "What this file can support",
  description:
    "How completely each measurement was recorded, and which measurements are missing entirely.",
  section: "lab",
  status: "beta",
  requiredMetrics: ["time"],
  // This card reports what the file actually carries, second by second.
  // There is nothing here to model.
  provenance: "measured",
  references: [
    RESEARCH.watchAccuracy,
    RESEARCH.imuSensorFusion,
    RESEARCH.groundContactAchilles,
    RESEARCH.groundContactEconomy,
  ],

  compute(activity) {
    const total = activity.samples.length;
    if (total === 0) return null;

    const rows = TRACKED.map((tracked) => {
      const covered = countCovered(activity, tracked.pick);
      const coverage = covered / total;
      return {
        metric: tracked.metric,
        label: tracked.label,
        coverage,
        grade: gradeOf(coverage),
      } satisfies Row;
    });

    return {
      rows,
      absent: [
        ...rows.filter((row) => row.coverage === 0).map((row) => row.label.toLowerCase()),
        ...FORM_METRICS,
      ],
      thin: rows.filter((row) => row.coverage > 0 && row.coverage < USABLE_COVERAGE),
      maxHrIsEstimated: activity.maxHrIsEstimated,
      hasCalories: activity.calories !== undefined,
      warnings: activity.warnings,
      source: activity.source,
    };
  },

  narrate(result) {
    const recorded = result.rows.filter((row) => row.coverage > 0);
    const complete = recorded.filter((row) => row.coverage >= USABLE_COVERAGE);

    const observations = [
      {
        text: `This ${result.source.toUpperCase()} file carries ${recorded.length} of the ${result.rows.length} per-second measurements the page looks for, ${complete.length} of them across at least ${formatPercent(USABLE_COVERAGE)} of the run.`,
      },
      {
        text: `Not present at all: ${result.absent.join(", ")}.`,
      },
    ];

    if (result.thin.length > 0) {
      observations.push({
        text: `Recorded but incomplete: ${result.thin.map((row) => `${row.label.toLowerCase()} at ${formatPercent(row.coverage)}`).join(", ")}.`,
      });
    }
    if (result.warnings.length > 0) {
      observations.push({ text: `While reading the file: ${result.warnings.join(" ")}` });
    }

    return {
      information: [
        {
          label: "Measurements present",
          value: `${recorded.length} of ${result.rows.length}`,
        },
        { label: "Fully covered", value: `${complete.length}` },
        {
          label: "Zone boundaries",
          value: result.maxHrIsEstimated ? "estimated" : "from your setting",
        },
      ],

      observations,

      explanations: [
        {
          text: result.maxHrIsEstimated
            ? "Heart-rate zones on this page rest on a maximum estimated from age, which is a population average that individuals sit either side of by a wide margin. Every zone figure inherits that error, so read the shape of the zone distribution rather than the boundaries between them."
            : "Zones are drawn from the maximum heart rate you set, so the boundaries are yours rather than an age formula's. That makes the zone figures on this page worth reading as levels, not only as shapes.",
          confidence: "high",
          relatedMetrics: ["heartRate", "hrZone"],
        },
        ...(result.hasCalories
          ? [
              {
                text: "This file also reports an energy figure, which no card on this page uses. Validation work on consumer wearables repeatedly finds energy expenditure the least reliable of their outputs — far weaker than heart rate or step counting — so building an observation on it would be the least defensible thing here.",
                confidence: "medium" as const,
                relatedMetrics: [] as MetricType[],
              },
            ]
          : []),
      ],

      teaching: [
        {
          title: "Coverage is not accuracy",
          text: "A metric recorded for every second of the run can still be wrong; these bars only say how often the watch produced a number, not how close it was. Optical heart rate in particular tends to be reliable at steady effort and to lag or lose the signal during sharp changes, so a full bar and a stretch of nonsense during a sprint are perfectly compatible.",
        },
        {
          title: "Why there is no running-form section",
          text: "Much of the recent work on durability tracks how form changes over a long run — ground-contact time lengthening, the step shortening, vertical movement growing — using measurements some watches take but almost no export carries into a file. Only one of those can be recovered here: step length, which is speed divided by step rate and so needs no sensor of its own beyond cadence. The others have no substitute, so the page leaves them out rather than approximating them.",
        },
        {
          title: "Why there is no left–right balance",
          text: "Asymmetry between your legs is the measurement runners most want and the one a single wrist sensor is least able to give. Work on minimal sensor setups found that one sensor at the base of the spine reconstructs cadence, vertical movement and contact time very well, and reconstructs asymmetry badly — it took a sensor on each ankle before the left–right figures became trustworthy. A balance number invented from a watch would look precise and mean nothing, so this page does not show one. Foot pods are what would change that.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    return (
      <div>
        <ProportionBars
          rows={result.rows.map((row) => ({
            id: row.metric,
            label: row.label,
            fraction: row.coverage,
            valueLabel: row.coverage === 0 ? "none" : formatPercent(row.coverage),
            color:
              row.coverage >= USABLE_COVERAGE
                ? "var(--zone-2)"
                : row.coverage > 0
                  ? "var(--zone-3)"
                  : "var(--border-strong)",
            detail: row.grade,
          }))}
        />

        <p className={shared.note}>
          The bar is the share of the run's seconds that carried a value. Nothing
          here says how accurate those values were.
        </p>
      </div>
    );
  },
});

function countCovered(
  activity: DerivedActivity,
  pick: (sample: Sample) => number | undefined,
): number {
  let covered = 0;
  for (const sample of activity.samples) {
    const value = pick(sample);
    if (value !== undefined && Number.isFinite(value)) covered += 1;
  }
  return covered;
}

function gradeOf(coverage: number): Row["grade"] {
  if (coverage === 0) return "Not recorded";
  if (coverage >= 0.95) return "Complete";
  if (coverage >= USABLE_COVERAGE) return "Good";
  if (coverage >= 0.5) return "Partial";
  return "Sparse";
}

export default dataConfidenceWidget;
