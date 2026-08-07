import { defineWidget } from "../contract";
import type { DerivedActivity, Sample } from "@/model/activity";
import { Track, type TrackRegion } from "@/viz/Track";
import { buildPath, linearScale, type XScale } from "@/viz/scales";
import { useSelectionStore } from "@/state/selectionStore";
import { ZONE_SOFT_COLORS } from "../helpers";
import { collect } from "@/lib/stats";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatGradient,
  formatHeartRate,
  formatPaceWithUnit,
  formatPower,
} from "@/lib/format";
import styles from "./Timeline.module.css";

/**
 * The instrument the rest of the page is read through.
 *
 * Rather than stacking a chart per metric, the metrics share one horizontal
 * position so a reader comparing them is always comparing the same instant.
 * Dragging here moves every other widget.
 */

interface Result {
  hrRange?: { min: number; max: number };
  paceRange?: { min: number; max: number };
  elevationRange?: { min: number; max: number };
  bands: Band[];
}

interface Band {
  key: "heartRate" | "pace" | "elevation" | "power";
  label: string;
  color: string;
  height: number;
}

const TRACK_HEIGHT = 132;

export const timelineWidget = defineWidget<Result>({
  id: "interactive-timeline",
  title: "Interactive run timeline",
  description:
    "Drag through the run to inspect every metric at the same moment. Moving the cursor here updates every widget below.",
  section: "story",
  requiredMetrics: ["time", "distance"],

  compute(activity) {
    const bands: Band[] = [];
    if (activity.availableMetrics.has("heartRate")) {
      bands.push({
        key: "heartRate",
        label: "Heart rate",
        color: "var(--metric-heart)",
        height: 44,
      });
    }
    if (activity.availableMetrics.has("pace")) {
      bands.push({ key: "pace", label: "Pace", color: "var(--metric-pace)", height: 44 });
    }
    if (activity.availableMetrics.has("elevation")) {
      bands.push({
        key: "elevation",
        label: "Elevation",
        color: "var(--metric-elevation)",
        height: 44,
      });
    }

    return {
      hrRange: rangeOf(activity.samples, (s) => s.hrBpm),
      paceRange: rangeOf(activity.samples, (s) => s.paceSecPerKm),
      elevationRange: rangeOf(activity.samples, (s) => s.elevationM),
      bands,
    };
  },

  narrate(_result, activity) {
    return {
      information: [],
      observations: [
        {
          text: `This run lasted ${formatDuration(activity.elapsedS)} and covered ${formatDistance(activity.distanceM)}. Drag the timeline to read any moment.`,
        },
      ],
      explanations: [],
      teaching: [
        {
          title: "Why one shared timeline",
          text: "Reading several separate charts means guessing which point on one lines up with which point on another. Putting every metric on a single position removes the guess: whatever the cursor shows, all of it happened at the same second of the run.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const cursorT = useSelectionStore((state) => state.cursorT);
    const xMode = useSelectionStore((state) => state.xMode);
    const setXMode = useSelectionStore((state) => state.setXMode);
    const clearAll = useSelectionStore((state) => state.clearAll);

    const sample = cursorT === null ? undefined : activity.samples[clampIndex(activity, cursorT)];

    return (
      <div>
        <div className={styles.controls}>
          <div className={styles.modeToggle} role="group" aria-label="Timeline axis">
            <button
              type="button"
              className={xMode === "distance" ? styles.modeActive : styles.mode}
              onClick={() => setXMode("distance")}
              aria-pressed={xMode === "distance"}
            >
              Distance
            </button>
            <button
              type="button"
              className={xMode === "time" ? styles.modeActive : styles.mode}
              onClick={() => setXMode("time")}
              aria-pressed={xMode === "time"}
            >
              Time
            </button>
          </div>
          {cursorT !== null && (
            <button type="button" className={styles.clear} onClick={clearAll}>
              Clear selection
            </button>
          )}
        </div>

        <Readout activity={activity} sample={sample} />

        <Track
          activity={activity}
          height={TRACK_HEIGHT}
          widgetId="interactive-timeline"
          showAxis
          selectable
          ariaLabel="Run timeline. Use arrow keys to move through the run."
          regions={zoneRegions(activity)}
        >
          {(scale) => (
            <MetricBands activity={activity} result={result} scale={scale} />
          )}
        </Track>

        <div className={styles.legend}>
          {result.bands.map((band) => (
            <span key={band.key} className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ background: band.color }} />
              {band.label}
            </span>
          ))}
          {activity.availableMetrics.has("hrZone") && (
            <span className={styles.legendItem}>
              <span className={styles.legendZones} aria-hidden="true">
                {[1, 2, 3, 4, 5].map((zone) => (
                  <span
                    key={zone}
                    style={{ background: ZONE_SOFT_COLORS[zone as 1 | 2 | 3 | 4 | 5] }}
                  />
                ))}
              </span>
              Zone background
            </span>
          )}
        </div>
      </div>
    );
  },
});

/**
 * The values at the cursor.
 *
 * This is the widget's real output: a single instant of the run described
 * completely, so a reader can ask "what was happening here" and get an answer.
 */
function Readout({
  activity,
  sample,
}: {
  activity: DerivedActivity;
  sample: Sample | undefined;
}) {
  if (!sample) {
    return (
      <p className={styles.readoutIdle}>
        Drag or tap the timeline to inspect any moment of the run.
      </p>
    );
  }

  const entries: { label: string; value: string }[] = [
    { label: "Elapsed", value: formatDuration(sample.t) },
    { label: "Distance", value: formatDistance(sample.distanceM) },
  ];

  if (sample.paceSecPerKm !== undefined) {
    entries.push({ label: "Pace", value: formatPaceWithUnit(sample.paceSecPerKm) });
  } else if (!sample.moving) {
    entries.push({ label: "Pace", value: "Stopped" });
  }
  if (sample.hrBpm !== undefined) {
    entries.push({ label: "Heart rate", value: formatHeartRate(sample.hrBpm) });
  }
  if (sample.hrZone !== undefined) {
    entries.push({ label: "Zone", value: `Zone ${sample.hrZone}` });
  }
  if (sample.cadenceSpm !== undefined) {
    entries.push({ label: "Cadence", value: `${Math.round(sample.cadenceSpm)} spm` });
  }
  if (sample.powerW !== undefined) {
    entries.push({ label: "Power", value: formatPower(sample.powerW) });
  }
  if (sample.elevationM !== undefined) {
    entries.push({ label: "Elevation", value: formatElevation(sample.elevationM) });
  }
  if (sample.gradientPct !== undefined) {
    entries.push({ label: "Gradient", value: formatGradient(sample.gradientPct) });
  }

  const activeEvent = activity.events.find(
    (event) => sample.t >= event.startT && sample.t <= event.endT,
  );

  return (
    <div className={styles.readout}>
      <dl className={styles.readoutGrid}>
        {entries.map((entry) => (
          <div key={entry.label} className={styles.readoutEntry}>
            <dt>{entry.label}</dt>
            <dd className="numeric">{entry.value}</dd>
          </div>
        ))}
      </dl>
      {activeEvent && (
        <p className={styles.readoutContext}>
          This position is inside: <strong>{activeEvent.label}</strong>
        </p>
      )}
    </div>
  );
}

/** Each metric gets its own horizontal band rather than a shared vertical axis. */
function MetricBands({
  activity,
  result,
  scale,
}: {
  activity: DerivedActivity;
  result: Result;
  scale: XScale;
}) {
  let offset = 0;
  const gap = 2;

  return (
    <g>
      {result.bands.map((band) => {
        const top = offset;
        offset += band.height + gap;
        return (
          <MetricBand
            key={band.key}
            band={band}
            activity={activity}
            result={result}
            scale={scale}
            top={top}
          />
        );
      })}
    </g>
  );
}

function MetricBand({
  band,
  activity,
  result,
  scale,
  top,
}: {
  band: Band;
  activity: DerivedActivity;
  result: Result;
  scale: XScale;
  top: number;
}) {
  const { samples } = activity;
  const inner = band.height - 6;

  const range =
    band.key === "heartRate"
      ? result.hrRange
      : band.key === "pace"
        ? result.paceRange
        : result.elevationRange;

  if (!range) return null;

  // Pace is inverted: a faster pace is a smaller number but should sit higher.
  const invert = band.key === "pace";
  const y = linearScale(
    invert ? range.max : range.min,
    invert ? range.min : range.max,
    top + band.height - 3,
    top + band.height - 3 - inner,
  );

  const pick = (sample: Sample): number | undefined =>
    band.key === "heartRate"
      ? sample.hrBpm
      : band.key === "pace"
        ? sample.paceSecPerKm
        : sample.elevationM;

  const step = Math.max(1, Math.floor(samples.length / 900));
  const points: { x: number; y: number | undefined }[] = [];
  for (let i = 0; i < samples.length; i += step) {
    const value = pick(samples[i]);
    points.push({ x: scale.toPixels(samples[i].t), y: value === undefined ? undefined : y(value) });
  }

  const area =
    band.key === "elevation"
      ? `${buildPath(points)}L${scale.width} ${top + band.height - 3}L0 ${top + band.height - 3}Z`
      : undefined;

  return (
    <g>
      {area && <path d={area} fill={band.color} fillOpacity={0.16} />}
      <path
        d={buildPath(points)}
        fill="none"
        stroke={band.color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Zone bands behind the metrics, so effort is readable without a second chart. */
function zoneRegions(activity: DerivedActivity): TrackRegion[] {
  if (!activity.availableMetrics.has("hrZone")) return [];
  const regions: TrackRegion[] = [];
  let current: TrackRegion | null = null;
  let currentZone: number | null = null;

  for (const sample of activity.samples) {
    if (sample.hrZone === undefined) {
      current = null;
      currentZone = null;
      continue;
    }
    if (current && currentZone === sample.hrZone) {
      current.endT = sample.t;
      continue;
    }
    current = {
      startT: sample.t,
      endT: sample.t,
      color: ZONE_SOFT_COLORS[sample.hrZone],
      label: `Zone ${sample.hrZone}`,
      behind: true,
    };
    currentZone = sample.hrZone;
    regions.push(current);
  }

  return regions;
}

function rangeOf(
  samples: Sample[],
  pick: (sample: Sample) => number | undefined,
): { min: number; max: number } | undefined {
  const values = collect(samples, pick);
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series still needs a range or the line would sit on the edge.
  if (max - min < 1e-6) return { min: min - 1, max: max + 1 };
  return { min, max };
}

function clampIndex(activity: DerivedActivity, t: number): number {
  return Math.max(0, Math.min(activity.samples.length - 1, Math.round(t)));
}

export default timelineWidget;
