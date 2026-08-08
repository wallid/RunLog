import { defineWidget, type Explanation, type Observation } from "../contract";
import type { ActivityEvent } from "@/model/activity";
import { Track, type TrackRegion } from "@/viz/Track";
import { Legend } from "@/viz/primitives";
import { buildPath, linearScale } from "@/viz/scales";
import { useSelectionStore } from "@/state/selectionStore";
import { meanOver } from "../helpers";
import { collect } from "@/lib/stats";
import {
  formatDistanceShort,
  formatElevation,
  formatGradient,
  formatHeartRate,
  formatPaceWithUnit,
} from "@/lib/format";
import shared from "../shared.module.css";

/**
 * The terrain, drawn as a silhouette with the climbs called out.
 *
 * The silhouette is deliberately simple: a runner recognises the shape of a
 * route far faster than they read an elevation axis, and the detected climbs
 * carry the detail.
 */

interface Result {
  min: number;
  max: number;
  climbs: ActivityEvent[];
  descents: ActivityEvent[];
  isFlat: boolean;
}

const TRACK_HEIGHT = 88;

export const elevationStoryWidget = defineWidget<Result>({
  id: "elevation-story",
  title: "Terrain",
  description: "The shape of the route, and where it made the run harder.",
  section: "terrain",
  requiredMetrics: ["elevation"],

  compute(activity) {
    const elevations = collect(activity.samples, (s) => s.elevationM);
    if (elevations.length < 30) return null;

    const min = Math.min(...elevations);
    const max = Math.max(...elevations);

    return {
      min,
      max,
      climbs: activity.events.filter((e) => e.type === "climb"),
      descents: activity.events.filter((e) => e.type === "descent"),
      // A route with almost no vertical change should say so rather than
      // dramatise eight metres of noise.
      isFlat: activity.summary.gainM < activity.distanceM * 0.01,
    };
  },

  narrate(result, activity) {
    const { summary } = activity;
    const observations: Observation[] = [];
    const explanations: Explanation[] = [];

    if (result.climbs.length > 0) {
      const main = result.climbs.reduce((a, b) =>
        b.metrics.elevationChangeM > a.metrics.elevationChangeM ? b : a,
      );
      observations.push({
        text: `The largest climb began at ${formatDistanceShort(main.startDistanceM)} and gained ${formatElevation(main.metrics.elevationChangeM)} over ${formatDistanceShort(main.metrics.lengthM)}, averaging ${formatGradient(main.metrics.avgGradientPct)}.`,
        evidence: [{ label: main.label, startT: main.startT, endT: main.endT }],
      });

      const climbHr = meanOver(activity, main, (s) => s.hrBpm);
      const climbPace = meanOver(activity, main, (s) => s.paceSecPerKm);
      const runHr = summary.avgHr;
      const runPace = summary.medianMovingPaceSecPerKm;

      if (climbHr !== undefined && runHr !== undefined && climbPace && runPace) {
        explanations.push({
          text: `Through that climb heart rate averaged ${formatHeartRate(climbHr)} against ${formatHeartRate(runHr)} for the run, while pace was ${formatPaceWithUnit(climbPace)} against a median of ${formatPaceWithUnit(runPace)}. Terrain is the strongest available explanation for the difference.`,
          confidence: main.confidence,
          relatedMetrics: ["elevation", "gradient", "heartRate", "pace"],
        });
      }
    } else if (result.isFlat) {
      observations.push({
        text: `The route climbed ${formatElevation(summary.gainM)} in total across ${formatDistanceShort(activity.distanceM)}, which is close to flat.`,
      });
      explanations.push({
        text: "With no significant climbs, terrain does not account for any pace or effort changes elsewhere on this page. Something else was behind them.",
        confidence: "high" as const,
        relatedMetrics: ["elevation" as const, "gradient" as const],
      });
    } else {
      observations.push({
        text: `The route gained ${formatElevation(summary.gainM)} and lost ${formatElevation(summary.lossM)}, but no single climb was long or steep enough to stand out.`,
      });
    }

    return {
      information: [
        { label: "Elevation gain", value: formatElevation(summary.gainM) },
        { label: "Elevation loss", value: formatElevation(summary.lossM) },
        {
          label: "Range",
          value: `${formatElevation(result.min)} – ${formatElevation(result.max)}`,
        },
        { label: "Climbs detected", value: `${result.climbs.length}` },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "Why uphill pace is not a fair comparison",
          text: "Running uphill costs more energy per metre than running on the flat, so a slower uphill pace can represent equal or greater effort than a faster flat one. Comparing a hill split against a flat split tells you about the route, not about the runner.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);

    const regions: TrackRegion[] = [
      ...result.climbs.map((climb) => ({
        startT: climb.startT,
        endT: climb.endT,
        color: "color-mix(in srgb, var(--terrain-uphill) 22%, transparent)",
        label: `${climb.label}: +${Math.round(climb.metrics.elevationChangeM)} m`,
        behind: true,
      })),
      ...result.descents.map((descent) => ({
        startT: descent.startT,
        endT: descent.endT,
        color: "color-mix(in srgb, var(--terrain-downhill) 18%, transparent)",
        label: `${descent.label}: ${Math.round(descent.metrics.elevationChangeM)} m`,
        behind: true,
      })),
    ];

    // Keep the silhouette from exaggerating a nearly flat route.
    const range = Math.max(result.max - result.min, 20);
    const mid = (result.max + result.min) / 2;

    return (
      <div>
        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="elevation-story"
          showAxis
          ariaLabel="Elevation profile of the route"
          regions={regions}
        >
          {(scale, height) => {
            const y = linearScale(mid - range / 2, mid + range / 2, height, 6);
            const step = Math.max(1, Math.floor(activity.samples.length / 900));
            const points: { x: number; y: number | undefined }[] = [];
            for (let i = 0; i < activity.samples.length; i += step) {
              const sample = activity.samples[i];
              points.push({
                x: scale.toPixels(sample.t),
                y: sample.elevationM === undefined ? undefined : y(sample.elevationM),
              });
            }
            const line = buildPath(points);
            return (
              <g>
                {line && (
                  <path
                    d={`${line}L${scale.width} ${height}L0 ${height}Z`}
                    fill="var(--metric-elevation)"
                    fillOpacity={0.22}
                  />
                )}
                <path
                  d={line}
                  fill="none"
                  stroke="var(--metric-elevation)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              </g>
            );
          }}
        </Track>

        <Legend
          label="What is drawn"
          items={[
            { label: "Elevation", color: "var(--metric-elevation)", shape: "line" },
            ...(result.climbs.length > 0
              ? [
                  {
                    label: `Climb (${result.climbs.length})`,
                    color: "color-mix(in srgb, var(--terrain-uphill) 22%, transparent)",
                  },
                ]
              : []),
            ...(result.descents.length > 0
              ? [
                  {
                    label: `Descent (${result.descents.length})`,
                    color: "color-mix(in srgb, var(--terrain-downhill) 18%, transparent)",
                  },
                ]
              : []),
          ]}
        />

        {result.climbs.length > 0 ? (
          <ul className={shared.rows} style={{ marginTop: "var(--space-4)" }}>
            {result.climbs.map((climb) => {
              const selected =
                highlight?.kind === "event" && highlight.eventId === climb.id;
              return (
                <li key={climb.id}>
                  <button
                    type="button"
                    className={`${shared.row} ${selected ? shared.rowSelected : ""}`}
                    onClick={() =>
                      focusRegion(
                        climb.startT,
                        climb.endT,
                        { kind: "event", eventId: climb.id },
                        "elevation-story",
                      )
                    }
                    aria-pressed={selected}
                  >
                    <span>
                      <strong>{climb.label}</strong>
                      <br />
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        from {formatDistanceShort(climb.startDistanceM)} ·{" "}
                        {formatDistanceShort(climb.metrics.lengthM)} long
                      </span>
                    </span>
                    <span className={shared.tag}>
                      +{Math.round(climb.metrics.elevationChangeM)} m ·{" "}
                      {formatGradient(climb.metrics.avgGradientPct)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={shared.note}>
            {result.isFlat
              ? "No climbs were detected. This route was close to flat throughout."
              : "The route rose and fell, but no stretch was sustained enough to count as a climb."}
          </p>
        )}
      </div>
    );
  },
});

export default elevationStoryWidget;
