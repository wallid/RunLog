import { defineWidget } from "../contract";
import { HeroFigure, MetricRows } from "@/viz/primitives";
import { mean, median, percentile } from "@/lib/stats";
import { formatCadence, formatDuration } from "@/lib/format";
import {
  CADENCE_IS_PERSONAL,
  MIN_CADENCE_SECONDS,
  runningCadence,
  stepCount,
} from "../cadenceHelpers";
import shared from "../shared.module.css";

/**
 * The one cadence number, and what it was built from.
 *
 * The average counts running seconds only. A watch that averages the whole
 * recording reports something lower, because a stopped device records a cadence
 * of zero, and a runner comparing the two figures deserves to know which is
 * which rather than concluding one of them is broken.
 */

interface Result {
  avg: number;
  mid: number;
  low: number;
  high: number;
  min: number;
  max: number;
  seconds: number;
  steps: number;
  strideLengthM?: number;
  /** The whole-recording average, when it differs enough to be worth naming. */
  wholeRecordingAvg?: number;
  stoppedS: number;
}

export const cadenceSummaryWidget = defineWidget<Result>({
  id: "cadence-summary",
  title: "Average cadence",
  description: "The run's step rate, and the stride it implies.",
  section: "cadence",
  requiredMetrics: ["cadence"],

  compute(activity) {
    const values = runningCadence(activity);
    if (values.length < MIN_CADENCE_SECONDS) return null;

    const { steps, strideLengthM } = stepCount(activity);
    const avg = mean(values);
    const wholeRecordingAvg = activity.summary.avgCadenceSpm;

    return {
      avg,
      mid: median(values),
      low: percentile(values, 0.05),
      high: percentile(values, 0.95),
      min: Math.min(...values),
      max: Math.max(...values),
      seconds: values.length,
      steps,
      strideLengthM,
      wholeRecordingAvg:
        wholeRecordingAvg !== undefined && Math.abs(wholeRecordingAvg - avg) >= 2
          ? wholeRecordingAvg
          : undefined,
      stoppedS: activity.summary.stoppedS,
    };
  },

  narrate(result) {
    const observations = [
      {
        text: `Cadence averaged ${formatCadence(result.avg)} across ${formatDuration(result.seconds)} of running, with nine tenths of that time between ${Math.round(result.low)} and ${Math.round(result.high)} steps per minute.`,
      },
    ];

    if (result.strideLengthM !== undefined) {
      observations.push({
        text: `That works out at roughly ${Math.round(result.steps).toLocaleString()} steps and an average stride of ${result.strideLengthM.toFixed(2)} m.`,
      });
    }

    const explanations = [];
    if (result.wholeRecordingAvg !== undefined) {
      explanations.push({
        text: `The file's own average for the session is ${formatCadence(result.wholeRecordingAvg)}. The difference is the ${formatDuration(result.stoppedS)} spent stopped, which a device counts as a cadence of zero and this figure leaves out.`,
        confidence: "high" as const,
        relatedMetrics: ["cadence" as const, "moving" as const],
      });
    }

    return {
      information: [
        { label: "Average", value: formatCadence(result.avg), note: "while running" },
        { label: "Median", value: formatCadence(result.mid) },
        {
          label: "Typical range",
          value: `${Math.round(result.low)}–${Math.round(result.high)} spm`,
          note: "middle 90%",
        },
        ...(result.strideLengthM !== undefined
          ? [
              {
                label: "Stride",
                value: `${result.strideLengthM.toFixed(2)} m`,
                note: "average",
              },
            ]
          : []),
      ],
      observations,
      explanations,
      teaching: [
        CADENCE_IS_PERSONAL,
        {
          title: "Cadence and stride are two halves of speed",
          text: "Speed is cadence multiplied by stride length, so there are always two ways to run faster: take more steps, or cover more ground with each one. Most runners do some of both, which is why cadence alone never tells you how fast someone was going.",
        },
      ],
    };
  },

  View({ result }) {
    return (
      <div>
        <HeroFigure
          value={`${Math.round(result.avg)}`}
          caption="steps per minute, averaged over the running seconds"
        />

        <MetricRows
          rows={[
            {
              label: "Median",
              value: formatCadence(result.mid),
              detail: "half above, half below",
              accent: "var(--metric-cadence)",
            },
            {
              label: "Middle 90%",
              value: `${Math.round(result.low)}–${Math.round(result.high)} spm`,
            },
            {
              label: "Full range",
              value: `${Math.round(result.min)}–${Math.round(result.max)} spm`,
            },
            { label: "Running time counted", value: formatDuration(result.seconds) },
            { label: "Steps", value: `${Math.round(result.steps).toLocaleString()}` },
            ...(result.strideLengthM !== undefined
              ? [
                  {
                    label: "Average stride",
                    value: `${result.strideLengthM.toFixed(2)} m`,
                    detail: "distance ÷ steps",
                  },
                ]
              : []),
          ]}
        />

        <p className={shared.note}>
          Every figure here is measured over the seconds you were running. Stopped
          seconds are excluded, because a stationary watch reports a cadence of zero.
        </p>
      </div>
    );
  },
});

export default cadenceSummaryWidget;
