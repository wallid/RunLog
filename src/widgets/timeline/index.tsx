import { defineWidget } from "../contract";
import { Track } from "@/viz/Track";
import { useSelectionStore } from "@/state/selectionStore";
import { CursorReadout, sampleAt } from "../CursorReadout";
import {
  bandRanges,
  bandsHeight,
  MetricBands,
  metricBands,
  type BandRanges,
  type MetricBand,
} from "../MetricBands";
import { BAND_COLORS, bandsUsed, zoneRegions } from "../helpers";
import { bandDefinition } from "@/model/zones";
import { formatDistance, formatDuration } from "@/lib/format";
import styles from "./Timeline.module.css";

/**
 * The instrument the rest of the page is read through.
 *
 * Rather than stacking a chart per metric, the metrics share one horizontal
 * position so a reader comparing them is always comparing the same instant.
 * Dragging here moves every other widget.
 */

interface Result {
  ranges: BandRanges;
  bands: MetricBand[];
}

export const timelineWidget = defineWidget<Result>({
  id: "interactive-timeline",
  title: "Interactive run timeline",
  description:
    "Drag through the run to inspect every metric at the same moment. Moving the cursor here updates every widget below.",
  section: "story",
  requiredMetrics: ["time", "distance"],

  compute(activity) {
    return { ranges: bandRanges(activity), bands: metricBands(activity) };
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

    const sample = sampleAt(activity, cursorT);

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

        <div className={styles.readoutSlot}>
          <CursorReadout
            activity={activity}
            sample={sample}
            idleText="Drag or tap the timeline to inspect any moment of the run."
          />
        </div>

        <Track
          activity={activity}
          height={bandsHeight(result.bands)}
          widgetId="interactive-timeline"
          showAxis
          selectable
          ariaLabel="Run timeline. Use arrow keys to move through the run."
          regions={zoneRegions(activity)}
        >
          {(scale) => (
            <MetricBands
              activity={activity}
              bands={result.bands}
              ranges={result.ranges}
              scale={scale}
            />
          )}
        </Track>

        <div className={styles.legend}>
          {result.bands.map((band) => (
            <span key={band.key} className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ background: band.color }} />
              {band.label}
            </span>
          ))}
          {bandsUsed(activity).map((band) => (
            <span key={band} className={styles.legendItem}>
              <span
                className={styles.legendBand}
                style={{ background: BAND_COLORS[band] }}
                aria-hidden="true"
              />
              {bandDefinition(band).name}
            </span>
          ))}
        </div>
      </div>
    );
  },
});

export default timelineWidget;
