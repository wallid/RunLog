import { defineWidget } from "../contract";
import { Track } from "@/viz/Track";
import { buildPath, linearScale } from "@/viz/scales";
import { collect, mean, median, percentile } from "@/lib/stats";
import {
  formatDistanceShort,
  formatPaceDelta,
  formatPaceWithUnit,
} from "@/lib/format";
import { mainClimb } from "../helpers";
import shared from "../shared.module.css";

/**
 * Where the pace changed, and by how much.
 *
 * Drawn as a ribbon whose height rises with speed rather than a line on a
 * numeric axis: the shape of the run is the point, and a reader should see the
 * fast and slow stretches before reading any figure.
 */

interface Result {
  median: number;
  fastest: { pace: number; distanceM: number; t: number };
  slowest: { pace: number; distanceM: number; t: number };
  /** The pace range drawn, clipped so one outlier does not flatten the ribbon. */
  low: number;
  high: number;
  firstHalf: number;
  secondHalf: number;
}

const TRACK_HEIGHT = 92;
/** Rolling window for the sustained fastest and slowest sections. */
const SUSTAINED_WINDOW_S = 60;
/**
 * Every run begins from standing and ends by stopping, so those seconds always
 * contain the slowest pace of the day. Excluding them keeps "slowest sustained
 * minute" pointing at something the runner actually chose.
 */
const EDGE_EXCLUSION_S = 45;

export const paceStoryWidget = defineWidget<Result>({
  id: "pace-story",
  title: "Pace story",
  description: "Where the run sped up and slowed down.",
  section: "pace",
  requiredMetrics: ["pace"],

  compute(activity) {
    const paces = collect(activity.samples, (s) => s.paceSecPerKm);
    if (paces.length < 60) return null;

    const samples = activity.samples;
    let fastest = { pace: Infinity, distanceM: 0, t: 0 };
    let slowest = { pace: -Infinity, distanceM: 0, t: 0 };

    const searchStart = EDGE_EXCLUSION_S;
    const searchEnd = samples.length - EDGE_EXCLUSION_S - SUSTAINED_WINDOW_S;

    for (let i = searchStart; i < searchEnd; i++) {
      const window = samples.slice(i, i + SUSTAINED_WINDOW_S);
      const values = collect(window, (s) => s.paceSecPerKm);
      if (values.length < SUSTAINED_WINDOW_S * 0.8) continue;
      // A window containing a stop is not a pacing decision.
      if (window.some((s) => !s.moving)) continue;
      const windowPace = mean(values);
      if (windowPace < fastest.pace) {
        fastest = { pace: windowPace, distanceM: window[0].distanceM, t: window[0].t };
      }
      if (windowPace > slowest.pace) {
        slowest = { pace: windowPace, distanceM: window[0].distanceM, t: window[0].t };
      }
    }

    if (!Number.isFinite(fastest.pace) || !Number.isFinite(slowest.pace)) return null;

    const midpoint = Math.floor(samples.length / 2);
    const firstHalf = collect(samples.slice(0, midpoint), (s) => s.paceSecPerKm);
    const secondHalf = collect(samples.slice(midpoint), (s) => s.paceSecPerKm);

    return {
      median: median(paces),
      fastest,
      slowest,
      // Clip to the middle 96% so a single GPS glitch does not set the scale.
      low: percentile(paces, 0.02),
      high: percentile(paces, 0.98),
      firstHalf: firstHalf.length > 0 ? mean(firstHalf) : NaN,
      secondHalf: secondHalf.length > 0 ? mean(secondHalf) : NaN,
    };
  },

  narrate(result, activity) {
    const spread = result.slowest.pace - result.fastest.pace;
    const climb = mainClimb(activity);
    const slowestInClimb =
      climb !== undefined &&
      result.slowest.t >= climb.startT - 60 &&
      result.slowest.t <= climb.endT + 60;

    const explanations = [];
    if (slowestInClimb && climb) {
      explanations.push({
        text: `The slowest sustained minute fell inside the ${climb.label.toLowerCase()}, so terrain accounts for much of the difference.`,
        confidence: climb.confidence,
        relatedMetrics: ["pace" as const, "gradient" as const, "elevation" as const],
      });
    } else if (activity.summary.gainM < activity.distanceM * 0.01) {
      explanations.push({
        text: "The route was close to flat, so terrain does not explain the variation. Effort, wind, surface, or traffic are the remaining candidates.",
        confidence: "low" as const,
        relatedMetrics: ["pace" as const],
      });
    }

    return {
      information: [
        { label: "Median pace", value: formatPaceWithUnit(result.median) },
        {
          label: "Fastest minute",
          value: formatPaceWithUnit(result.fastest.pace),
          note: `at ${formatDistanceShort(result.fastest.distanceM)}`,
        },
        {
          label: "Slowest minute",
          value: formatPaceWithUnit(result.slowest.pace),
          note: `at ${formatDistanceShort(result.slowest.distanceM)}`,
        },
      ],
      observations: [
        {
          text: `The fastest and slowest sustained minutes were ${formatPaceDelta(spread)} apart: ${formatPaceWithUnit(result.fastest.pace)} at ${formatDistanceShort(result.fastest.distanceM)} against ${formatPaceWithUnit(result.slowest.pace)} at ${formatDistanceShort(result.slowest.distanceM)}.`,
          evidence: [
            {
              label: "Fastest minute",
              startT: result.fastest.t,
              endT: result.fastest.t + SUSTAINED_WINDOW_S,
            },
            {
              label: "Slowest minute",
              startT: result.slowest.t,
              endT: result.slowest.t + SUSTAINED_WINDOW_S,
            },
          ],
        },
      ],
      explanations,
      teaching: [
        {
          title: "What pace does and does not account for",
          text: "Pace measures how fast you covered ground. It takes no account of gradient, wind, surface, heat or how hard the effort felt. A slower kilometre uphill can cost more than a faster one on the flat, which is why this page compares pace against terrain rather than on its own.",
        },
      ],
    };
  },

  View({ result, activity }) {
    return (
      <div>
        <p className={shared.trackLabel}>Faster is higher</p>
        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="pace-story"
          showAxis
          ariaLabel="Pace through the run, drawn with faster pace higher"
        >
          {(scale, height) => {
            // Inverted: a lower seconds-per-kilometre reading sits higher.
            const y = linearScale(result.high, result.low, height - 3, 3);
            const step = Math.max(1, Math.floor(activity.samples.length / 900));
            const points: { x: number; y: number | undefined }[] = [];
            for (let i = 0; i < activity.samples.length; i += step) {
              const sample = activity.samples[i];
              const pace = sample.paceSecPerKm;
              points.push({
                x: scale.toPixels(sample.t),
                y:
                  pace === undefined
                    ? undefined
                    : y(Math.max(result.low, Math.min(result.high, pace))),
              });
            }
            const line = buildPath(points);

            return (
              <g>
                {line && (
                  <path
                    d={`${line}L${scale.width} ${height}L0 ${height}Z`}
                    fill="var(--metric-pace)"
                    fillOpacity={0.16}
                  />
                )}
                <line
                  x1={0}
                  x2={scale.width}
                  y1={y(result.median)}
                  y2={y(result.median)}
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <path
                  d={line}
                  fill="none"
                  stroke="var(--metric-pace)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          }}
        </Track>

        <p className={shared.note}>
          The dashed line marks the median pace of {formatPaceWithUnit(result.median)}.
          Stopped sections leave a gap, because pace while standing still is not a
          meaningful number.
        </p>
      </div>
    );
  },
});

export default paceStoryWidget;
