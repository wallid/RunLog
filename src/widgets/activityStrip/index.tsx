import { defineWidget } from "../contract";
import type { DerivedActivity, HrZone } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import { ZONE_COLORS } from "../helpers";
import { collect, mean } from "@/lib/stats";
import { formatDistanceShort, formatDuration, formatPaceWithUnit } from "@/lib/format";
import shared from "../shared.module.css";
import styles from "./ActivityStrip.module.css";

/**
 * The whole run as a row of blocks.
 *
 * Each block is a fixed slice of the run coloured by effort, which shows the
 * character of a session at a glance without asking anyone to read a line
 * chart. Hovering a block reads out what happened in it.
 */

interface Block {
  index: number;
  startT: number;
  endT: number;
  startDistanceM: number;
  zone?: HrZone;
  pace?: number;
  stopped: boolean;
}

interface Result {
  blocks: Block[];
  blockSeconds: number;
  colouredBy: "zone" | "pace";
}

/** Aim for this many blocks regardless of run length, so the strip stays legible. */
const TARGET_BLOCK_COUNT = 90;

export const activityStripWidget = defineWidget<Result>({
  id: "activity-strip",
  title: "The run at a glance",
  description: "Every part of the run as one row of blocks, coloured by effort.",
  section: "story",
  requiredMetrics: ["time"],

  compute(activity) {
    const total = activity.samples.length;
    if (total < 60) return null;

    const blockSeconds = Math.max(5, Math.round(total / TARGET_BLOCK_COUNT / 5) * 5);
    const colouredBy = activity.availableMetrics.has("hrZone") ? "zone" : "pace";
    const blocks: Block[] = [];

    for (let start = 0; start < total; start += blockSeconds) {
      const window = activity.samples.slice(start, start + blockSeconds);
      if (window.length === 0) continue;
      const paces = collect(window, (s) => s.paceSecPerKm);

      blocks.push({
        index: blocks.length,
        startT: window[0].t,
        endT: window[window.length - 1].t,
        startDistanceM: window[0].distanceM,
        zone: dominantZone(window),
        pace: paces.length > 0 ? mean(paces) : undefined,
        // A block is only called stopped if most of it was.
        stopped: window.filter((s) => !s.moving).length > window.length / 2,
      });
    }

    if (blocks.length < 4) return null;
    return { blocks, blockSeconds, colouredBy };
  },

  narrate(result, activity) {
    const stoppedBlocks = result.blocks.filter((b) => b.stopped).length;
    const observations = [
      {
        text: `Each block covers ${result.blockSeconds} seconds of the run, ${result.colouredBy === "zone" ? "shaded by heart-rate zone" : "shaded by pace"}.`,
      },
    ];

    if (result.colouredBy === "zone") {
      const zoneCounts = new Map<HrZone, number>();
      for (const block of result.blocks) {
        if (block.zone) zoneCounts.set(block.zone, (zoneCounts.get(block.zone) ?? 0) + 1);
      }
      const dominant = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (dominant) {
        observations.push({
          text: `Zone ${dominant[0]} covered more of the run than any other, filling ${dominant[1]} of the ${result.blocks.length} blocks.`,
        });
      }
    }

    if (stoppedBlocks > 0) {
      observations.push({
        text: `${stoppedBlocks} ${stoppedBlocks === 1 ? "block was" : "blocks were"} mostly stopped.`,
      });
    }

    return {
      information: [
        { label: "Blocks", value: `${result.blocks.length}` },
        { label: "Each block", value: `${result.blockSeconds} s` },
        { label: "Total", value: formatDuration(activity.elapsedS) },
      ],
      observations,
      explanations: [],
      teaching: [
        {
          title: "Why blocks instead of a chart",
          text: "A line chart asks you to trace a shape and translate it back into effort. A row of blocks shows how effort was distributed directly: long stretches of one colour mean a steady run, alternating colours mean a variable one.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const focusRegion = useSelectionStore((state) => state.focusRegion);
    const highlight = useSelectionStore((state) => state.highlight);
    const selectedZone = highlight?.kind === "zone" ? highlight.zone : undefined;

    const paceRange = paceExtent(activity);

    return (
      <div>
        <div className={styles.strip} role="list" aria-label="The run in blocks">
          {result.blocks.map((block) => {
            const dimmed =
              selectedZone !== undefined && block.zone !== undefined && block.zone !== selectedZone;
            return (
              <button
                key={block.index}
                type="button"
                role="listitem"
                className={`${styles.block} ${dimmed ? styles.dimmed : ""}`}
                style={{
                  background: blockColor(block, result.colouredBy, paceRange),
                }}
                title={blockTitle(block)}
                aria-label={blockTitle(block)}
                onClick={() =>
                  focusRegion(
                    block.startT,
                    block.endT,
                    block.zone ? { kind: "zone", zone: block.zone } : null,
                    "activity-strip",
                  )
                }
              />
            );
          })}
        </div>

        <div className={styles.scaleRow}>
          <span>Start</span>
          <span className="numeric">{formatDistanceShort(activity.distanceM)}</span>
        </div>

        <p className={shared.note}>
          {result.colouredBy === "zone"
            ? "Darker blocks are higher heart-rate zones."
            : "Darker blocks are faster running."}{" "}
          Click any block to move the timeline there.
        </p>
      </div>
    );
  },
});

function dominantZone(window: { hrZone?: HrZone }[]): HrZone | undefined {
  const counts = new Map<HrZone, number>();
  for (const sample of window) {
    if (sample.hrZone === undefined) continue;
    counts.set(sample.hrZone, (counts.get(sample.hrZone) ?? 0) + 1);
  }
  let best: HrZone | undefined;
  let bestCount = 0;
  for (const [zone, count] of counts) {
    if (count > bestCount) {
      best = zone;
      bestCount = count;
    }
  }
  return best;
}

function paceExtent(activity: DerivedActivity): { fast: number; slow: number } {
  const paces = collect(activity.samples, (s) => s.paceSecPerKm);
  if (paces.length === 0) return { fast: 300, slow: 600 };
  const sorted = [...paces].sort((a, b) => a - b);
  return {
    fast: sorted[Math.floor(sorted.length * 0.05)],
    slow: sorted[Math.floor(sorted.length * 0.95)],
  };
}

function blockColor(
  block: Block,
  colouredBy: "zone" | "pace",
  paceRange: { fast: number; slow: number },
): string {
  if (block.stopped) return "var(--surface-sunken)";

  if (colouredBy === "zone") {
    return block.zone ? ZONE_COLORS[block.zone] : "var(--surface-sunken)";
  }

  if (block.pace === undefined) return "var(--surface-sunken)";
  // Faster running takes a darker step of the same ramp, so the order reads.
  const span = Math.max(1, paceRange.slow - paceRange.fast);
  const position = 1 - Math.max(0, Math.min(1, (block.pace - paceRange.fast) / span));
  const step = Math.min(5, Math.max(1, Math.round(position * 4) + 1)) as HrZone;
  return ZONE_COLORS[step];
}

function blockTitle(block: Block): string {
  const position = formatDistanceShort(block.startDistanceM);
  if (block.stopped) return `${position}: stopped`;
  const parts = [position];
  if (block.zone) parts.push(`Zone ${block.zone}`);
  if (block.pace !== undefined) parts.push(formatPaceWithUnit(block.pace));
  return parts.join(" · ");
}

export default activityStripWidget;
