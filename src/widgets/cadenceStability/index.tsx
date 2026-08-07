import { defineWidget, type Observation } from "../contract";
import type { Sample } from "@/model/activity";
import { Track } from "@/viz/Track";
import { linearScale } from "@/viz/scales";
import { mean, median, stdev } from "@/lib/stats";
import { formatCadence, formatDistanceShort, formatDuration, formatPercent } from "@/lib/format";
import { MIN_CADENCE_SECONDS, runningCadence, runningCadenceOf } from "../cadenceHelpers";
import shared from "../shared.module.css";

/**
 * How steadily the rhythm was held.
 *
 * Each dot is ten seconds of running against a band of three steps per minute
 * either side of the run's median — roughly the point at which a difference
 * becomes one a runner could feel rather than one a sensor invented.
 *
 * Steadiness is reported, never praised. An interval session is supposed to
 * scatter, and a hilly route will scatter whatever the runner intends.
 */

interface Interval {
  t: number;
  distanceM: number;
  cadenceSpm: number;
  within: boolean;
}

interface Result {
  intervals: Interval[];
  median: number;
  band: number;
  withinFraction: number;
  stdev: number;
  variationPct: number;
  low: number;
  high: number;
  steadiest?: { startT: number; endT: number; startDistanceM: number; cadenceSpm: number };
}

const INTERVAL_S = 10;
/** Cadence within this of the median counts as holding the same rhythm. */
const BAND_SPM = 3;
const TRACK_HEIGHT = 96;
/** A steady stretch has to last this long to be a stretch rather than a moment. */
const MIN_STEADY_S = 60;

export const cadenceStabilityWidget = defineWidget<Result>({
  id: "cadence-stability",
  title: "Cadence stability",
  description: "How tightly the run held a single step rhythm.",
  section: "cadence",
  requiredMetrics: ["cadence"],

  compute(activity) {
    const values = runningCadence(activity);
    if (values.length < MIN_CADENCE_SECONDS) return null;

    const mid = median(values);
    const intervals = buildIntervals(activity.samples, mid);
    if (intervals.length < 8) return null;

    const within = intervals.filter((interval) => interval.within).length;
    const spread = stdev(values);
    const cadences = intervals.map((interval) => interval.cadenceSpm);
    const halfRange = Math.max(
      BAND_SPM * 2.5,
      (Math.max(...cadences) - Math.min(...cadences)) / 2,
    );

    return {
      intervals,
      median: mid,
      band: BAND_SPM,
      withinFraction: within / intervals.length,
      stdev: spread,
      variationPct: mid > 0 ? (spread / mid) * 100 : 0,
      low: mid - halfRange,
      high: mid + halfRange,
      steadiest: findSteadiestStretch(activity.samples),
    };
  },

  narrate(result) {
    const percent = formatPercent(result.withinFraction);

    const observations: Observation[] = [
      {
        text: `${percent} of the running stayed within ${result.band} steps per minute of the median of ${formatCadence(result.median)}.`,
      },
    ];

    if (result.steadiest) {
      observations.push({
        text: `The steadiest stretch ran from ${formatDistanceShort(result.steadiest.startDistanceM)} for ${formatDuration(result.steadiest.endT - result.steadiest.startT)}, holding around ${formatCadence(result.steadiest.cadenceSpm)}.`,
        evidence: [
          {
            label: "Steadiest stretch",
            startT: result.steadiest.startT,
            endT: result.steadiest.endT,
          },
        ],
      });
    }

    return {
      information: [
        {
          label: "Within band",
          value: percent,
          note: `±${result.band} spm of median`,
        },
        { label: "Median", value: formatCadence(result.median) },
        {
          label: "Spread",
          value: `${result.stdev.toFixed(1)} spm`,
          note: "standard deviation",
        },
        {
          label: "Variation",
          value: `${result.variationPct.toFixed(1)}%`,
          note: "spread ÷ median",
        },
      ],
      observations,
      explanations: [
        {
          text:
            result.withinFraction >= 0.7
              ? "A rhythm this consistent usually means the run was one continuous effort on ground that did not ask for a change. It is worth noting that cadence can hold steady while pace drifts, so this is not evidence that the run was evenly paced."
              : "The rhythm moved around a good deal. Terrain, changes of effort and walking breaks all produce this, and which one applies is best answered by the cadence-against-gradient and cadence-against-pace sections rather than by this one.",
          confidence: "medium" as const,
          relatedMetrics: ["cadence" as const, "pace" as const, "gradient" as const],
        },
      ],
      teaching: [
        {
          title: "Steady is not the same as good",
          text: "Cadence stability describes how uniform the run was, not how well it went. A steady rhythm is what an easy continuous run should look like; a session of intervals or hill repeats should not be steady at all, and a wide spread there is the session working rather than failing.",
        },
      ],
    };
  },

  View({ result, activity }) {
    return (
      <div>
        <p className={shared.trackLabel}>Each dot is ten seconds of running</p>
        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="cadence-stability"
          showAxis
          ariaLabel="Cadence stability, showing ten-second intervals against a steady band"
        >
          {(scale, height) => {
            const y = linearScale(result.low, result.high, height - 4, 4);
            const bandTop = y(result.median + result.band);
            const bandBottom = y(result.median - result.band);

            return (
              <g>
                <rect
                  x={0}
                  y={Math.min(bandTop, bandBottom)}
                  width={scale.width}
                  height={Math.abs(bandBottom - bandTop)}
                  fill="var(--metric-cadence)"
                  fillOpacity={0.1}
                />
                <line
                  x1={0}
                  x2={scale.width}
                  y1={y(result.median)}
                  y2={y(result.median)}
                  stroke="var(--metric-cadence)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
                {result.intervals.map((interval) => {
                  const clamped = Math.max(
                    result.low,
                    Math.min(result.high, interval.cadenceSpm),
                  );
                  return (
                    <circle
                      key={interval.t}
                      cx={scale.toPixels(interval.t)}
                      cy={y(clamped)}
                      r={interval.within ? 3 : 4}
                      fill={interval.within ? "var(--metric-cadence)" : "var(--surface-card)"}
                      stroke="var(--metric-cadence)"
                      strokeWidth={interval.within ? 0 : 2}
                      fillOpacity={interval.within ? 0.75 : 1}
                    />
                  );
                })}
              </g>
            );
          }}
        </Track>

        <p className={shared.note}>
          Filled dots sit inside the band of ±{result.band} steps per minute; hollow dots are
          the ten-second stretches that left it. Higher dots are a quicker rhythm.
        </p>
      </div>
    );
  },
});

/** Ten-second means, so one noisy second cannot become a dot of its own. */
function buildIntervals(samples: Sample[], mid: number): Interval[] {
  const intervals: Interval[] = [];
  let bucket: number[] = [];
  let first: Sample | undefined;

  for (const sample of samples) {
    const cadence = runningCadenceOf(sample);
    if (cadence === undefined) continue;
    if (first === undefined) first = sample;
    bucket.push(cadence);

    if (bucket.length === INTERVAL_S) {
      const value = mean(bucket);
      intervals.push({
        t: first.t,
        distanceM: first.distanceM,
        cadenceSpm: value,
        within: Math.abs(value - mid) <= BAND_SPM,
      });
      bucket = [];
      first = undefined;
    }
  }

  return intervals;
}

/**
 * The longest run of seconds that stayed close to one value.
 *
 * The centre is the median of the stretch so far rather than its first value,
 * so a stretch is not ended by the reading it happened to start on.
 */
function findSteadiestStretch(samples: Sample[]): Result["steadiest"] {
  let best: Result["steadiest"];
  let bestLength = 0;
  let start = -1;
  const window: number[] = [];

  const close = (from: number, to: number) => {
    const length = to - from + 1;
    if (length > bestLength && length >= MIN_STEADY_S) {
      bestLength = length;
      best = {
        startT: samples[from].t,
        endT: samples[to].t,
        startDistanceM: samples[from].distanceM,
        cadenceSpm: median(window),
      };
    }
  };

  for (let i = 0; i <= samples.length; i++) {
    const value = i < samples.length ? runningCadenceOf(samples[i]) : undefined;

    if (value === undefined) {
      if (start >= 0) close(start, i - 1);
      start = -1;
      window.length = 0;
      continue;
    }

    if (start < 0) {
      start = i;
      window.length = 0;
    }
    window.push(value);

    if (Math.abs(value - median(window)) > BAND_SPM) {
      close(start, i - 1);
      start = i;
      window.length = 0;
      window.push(value);
    }
  }

  return best;
}

export default cadenceStabilityWidget;
