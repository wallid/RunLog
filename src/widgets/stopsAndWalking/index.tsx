import { defineWidget } from "../contract";
import type { ActivityEvent } from "@/model/activity";
import { Track, type TrackRegion } from "@/viz/Track";
import { ComparisonCards } from "@/viz/primitives";
import { useSelectionStore } from "@/state/selectionStore";
import {
  formatDistanceShort,
  formatDurationWords,
  formatHeartRate,
  formatPaceWithUnit,
} from "@/lib/format";
import shared from "../shared.module.css";

/**
 * Where the run paused, and where it may have slowed to a walk.
 *
 * Stops are certain; walking is not. Without cadence there is no way to tell a
 * walk from a very slow jog, so those sections are always presented as a
 * possibility.
 */

interface Result {
  stops: ActivityEvent[];
  walks: ActivityEvent[];
  stoppedS: number;
}

export const stopsAndWalkingWidget = defineWidget<Result>({
  id: "stops-and-walking",
  title: "Stops and slow sections",
  description: "Where the run paused, and what that did to pace and heart rate.",
  section: "splits",
  status: "beta",
  requiredMetrics: ["moving"],

  compute(activity) {
    const stops = activity.events.filter((e) => e.type === "stop");
    const walks = activity.events.filter((e) => e.type === "walk");
    // Nothing to say about a run with no interruptions.
    if (stops.length === 0 && walks.length === 0) return null;
    return { stops, walks, stoppedS: activity.summary.stoppedS };
  },

  narrate(result, activity) {
    const observations = [];

    if (result.stops.length > 0) {
      observations.push({
        text: `The run included ${result.stops.length} ${result.stops.length === 1 ? "stop" : "stops"} totalling ${formatDurationWords(result.stoppedS)}.`,
      });

      const longest = result.stops.reduce((a, b) =>
        b.metrics.durationS > a.metrics.durationS ? b : a,
      );
      if (Number.isFinite(longest.metrics.hrDropBpm) && longest.metrics.hrDropBpm > 3) {
        observations.push({
          text: `Heart rate fell by ${Math.round(longest.metrics.hrDropBpm)} bpm during the longest stop at ${formatDistanceShort(longest.startDistanceM)}.`,
          evidence: [
            { label: "Longest stop", startT: longest.startT, endT: longest.endT },
          ],
        });
      }
    } else {
      observations.push({ text: "The run was continuous, with no stops detected." });
    }

    if (result.walks.length > 0) {
      observations.push({
        text: `${result.walks.length} ${result.walks.length === 1 ? "section was" : "sections were"} run much slower than the rest.`,
      });
    }

    const explanations = [];
    if (result.walks.length > 0) {
      explanations.push({
        text: activity.availableMetrics.has("cadence")
          ? "Cadence during these sections can distinguish walking from slow running; compare it against the cadence widget above."
          : "This recording has no cadence, so there is no way to tell walking from very slow running. These sections are flagged as possibilities only.",
        confidence: "low" as const,
        relatedMetrics: ["pace" as const, "cadence" as const],
      });
    }

    return {
      information: [
        { label: "Stops", value: `${result.stops.length}` },
        { label: "Time stopped", value: formatDurationWords(result.stoppedS) },
        {
          label: "Slow sections",
          value: `${result.walks.length}`,
          note: result.walks.length > 0 ? "possible walking" : undefined,
        },
      ],
      observations,
      explanations,
      teaching: [
        {
          title: "Elapsed pace and moving pace",
          text: "Elapsed pace divides the distance by the whole time from start to finish, including anything spent standing at a crossing. Moving pace excludes it. Neither is more correct — they answer different questions, and a run with long stops will show a large gap between them.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);

    const regions: TrackRegion[] = [
      ...result.stops.map((stop) => ({
        startT: stop.startT,
        endT: stop.endT + 1,
        color: "var(--text-muted)",
        label: `Stop for ${formatDurationWords(stop.metrics.durationS)}`,
      })),
      ...result.walks.map((walk) => ({
        startT: walk.startT,
        endT: walk.endT,
        color: "color-mix(in srgb, var(--metric-pace) 35%, transparent)",
        label: `Possible walking for ${formatDurationWords(walk.metrics.durationS)}`,
      })),
    ];

    const movingPace = activity.summary.movingPaceSecPerKm;
    const elapsedPace = activity.summary.avgPaceSecPerKm;
    const paceGap = Math.abs(elapsedPace - movingPace);

    return (
      <div>
        {paceGap >= 3 && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <ComparisonCards
              from={{ title: "Elapsed pace", primary: formatPaceWithUnit(elapsedPace), detail: "includes stopped time" }}
              to={{ title: "Moving pace", primary: formatPaceWithUnit(movingPace), detail: "excludes stopped time" }}
              arrowLabel={`${Math.round(paceGap)} s/km apart`}
            />
          </div>
        )}

        <p className={shared.trackLabel}>Where the run paused or slowed</p>
        <Track
          activity={activity}
          height={30}
          widgetId="stops-and-walking"
          showAxis
          ariaLabel="Stops and slow sections through the run"
          regions={regions}
        >
          {() => null}
        </Track>

        <ul className={shared.rows} style={{ marginTop: "var(--space-4)" }}>
          {[...result.stops, ...result.walks]
            .sort((a, b) => a.startT - b.startT)
            .map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  className={shared.row}
                  onClick={() =>
                    focusRegion(
                      event.startT,
                      event.endT,
                      { kind: "event", eventId: event.id },
                      "stops-and-walking",
                    )
                  }
                >
                  <span>
                    <strong>{event.label}</strong>
                    <br />
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      at {formatDistanceShort(event.startDistanceM)}
                      {Number.isFinite(event.metrics.hrDropBpm) &&
                        event.metrics.hrDropBpm > 2 &&
                        ` · heart rate fell ${Math.round(event.metrics.hrDropBpm)} bpm`}
                      {Number.isFinite(event.metrics.avgPaceSecPerKm) &&
                        ` · ${formatPaceWithUnit(event.metrics.avgPaceSecPerKm)}`}
                      {Number.isFinite(event.metrics.avgHr) &&
                        event.type === "walk" &&
                        ` · ${formatHeartRate(event.metrics.avgHr)}`}
                    </span>
                  </span>
                  <span className={shared.tag}>
                    {formatDurationWords(event.metrics.durationS)}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </div>
    );
  },
});

export default stopsAndWalkingWidget;
