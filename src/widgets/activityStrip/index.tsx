import { useRef, useState } from "react";
import { defineWidget } from "../contract";
import type { DerivedActivity, HrZone } from "@/model/activity";
import { Legend, ScaleLegend } from "@/viz/primitives";
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

    const stripRef = useRef<HTMLDivElement>(null);
    const [focusIndex, setFocusIndex] = useState(0);

    const moveFocus = (to: number) => {
      const last = result.blocks.length - 1;
      const next = Math.max(0, Math.min(last, to));
      setFocusIndex(next);
      stripRef.current?.querySelectorAll<HTMLButtonElement>("[data-mark]")[next]?.focus();
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      // A jump is a minute of running rather than a fixed count, so holding an
      // arrow with Shift covers the run at the same rate whatever its length.
      const jump = Math.max(1, Math.round(60 / result.blockSeconds));
      const moves: Record<string, number> = {
        ArrowRight: focusIndex + 1,
        ArrowLeft: focusIndex - 1,
        ArrowDown: focusIndex + jump,
        ArrowUp: focusIndex - jump,
        Home: 0,
        End: result.blocks.length - 1,
      };
      const next = moves[event.key];
      if (next === undefined) return;
      event.preventDefault();
      moveFocus(next);
    };

    const paceRange = paceExtent(activity);
    const painted = result.blocks.map((block) => paint(block, result.colouredBy, paceRange));

    // Only what the strip actually drew gets a key, so the legend never
    // promises a colour the reader cannot find.
    const zonesShown = [
      ...new Set(painted.flatMap((p) => (p.kind === "zone" ? [p.zone] : []))),
    ].sort();
    const extras: { label: string; color: string }[] = [];
    if (painted.some((p) => p.kind === "stopped")) {
      extras.push({ label: "Stopped", color: STOPPED_COLOR });
    }
    if (painted.some((p) => p.kind === "missing")) {
      extras.push({ label: "No reading", color: MISSING_COLOR });
    }

    return (
      <div>
        {/*
          One tab stop, not ninety.

          Every block is a button, because every block is clickable — but a
          reader tabbing through the page should not have to press Tab ninety
          times to get past one chart. So the strip holds a single stop and the
          arrow keys walk along the run inside it, which is the same gesture
          the timeline answers to.
        */}
        <div
          ref={stripRef}
          className={styles.strip}
          role="group"
          aria-label="The run in blocks. Use the arrow keys to move along it."
          onKeyDown={onKeyDown}
        >
          {result.blocks.map((block, index) => {
            const dimmed =
              selectedZone !== undefined && block.zone !== undefined && block.zone !== selectedZone;
            return (
              <button
                key={block.index}
                type="button"
                data-mark=""
                tabIndex={index === focusIndex ? 0 : -1}
                className={`${styles.block} ${dimmed ? styles.dimmed : ""}`}
                style={
                  {
                    background: painted[index].color,
                    // Its place along the run, which the stylesheet turns into
                    // the order the strip fills in.
                    "--item": block.index,
                  } as React.CSSProperties
                }
                title={blockTitle(block)}
                aria-label={blockTitle(block)}
                onFocus={() => setFocusIndex(index)}
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

        {result.colouredBy === "zone" ? (
          <Legend
            label="Colour shows heart-rate zone"
            items={[
              ...zonesShown.map((zone) => ({
                label: `Zone ${zone}`,
                color: ZONE_COLORS[zone],
              })),
              ...extras,
            ]}
          />
        ) : (
          // Pace has no named steps, so the ramp is keyed by its ends: the
          // fastest and slowest running in this run, in the reader's own units.
          <ScaleLegend
            label="Colour shows pace"
            steps={[1, 2, 3, 4, 5].map((step) => ZONE_COLORS[step as HrZone])}
            lowLabel={`Slower · ${formatPaceWithUnit(paceRange.slow)}`}
            highLabel={`Faster · ${formatPaceWithUnit(paceRange.fast)}`}
            extras={extras}
          />
        )}

        <p className={shared.note}>
          Each block is {result.blockSeconds} seconds of running, in the order it
          happened. Click any block to move the timeline there.
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

/**
 * Stopped and unrecorded are different facts, so they are different greys.
 * Sharing one would put two meanings behind a single entry in the key.
 */
const STOPPED_COLOR = "var(--border-strong)";
const MISSING_COLOR = "var(--surface-inset)";

type Paint =
  | { kind: "zone"; zone: HrZone; color: string }
  | { kind: "pace"; color: string }
  | { kind: "stopped"; color: string }
  | { kind: "missing"; color: string };

/** The colour a block is drawn in, and what that colour is saying. */
function paint(
  block: Block,
  colouredBy: "zone" | "pace",
  paceRange: { fast: number; slow: number },
): Paint {
  if (block.stopped) return { kind: "stopped", color: STOPPED_COLOR };

  if (colouredBy === "zone") {
    return block.zone
      ? { kind: "zone", zone: block.zone, color: ZONE_COLORS[block.zone] }
      : { kind: "missing", color: MISSING_COLOR };
  }

  if (block.pace === undefined) return { kind: "missing", color: MISSING_COLOR };
  // Faster running takes a darker step of the same ramp, so the order reads.
  const span = Math.max(1, paceRange.slow - paceRange.fast);
  const position = 1 - Math.max(0, Math.min(1, (block.pace - paceRange.fast) / span));
  const step = Math.min(5, Math.max(1, Math.round(position * 4) + 1)) as HrZone;
  return { kind: "pace", color: ZONE_COLORS[step] };
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
