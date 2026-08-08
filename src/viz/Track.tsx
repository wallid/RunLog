import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { DerivedActivity } from "@/model/activity";
import { useSelectionStore } from "@/state/selectionStore";
import { useInView } from "@/shell/useInView";
import { createXScale, type XScale } from "./scales";
import { formatDistanceShort, formatDuration } from "@/lib/format";
import styles from "./Track.module.css";

/**
 * The horizontal strip most widgets are drawn on.
 *
 * It owns three things so that no widget has to: mapping the run onto pixels,
 * turning pointer movement into a shared cursor position, and painting the
 * highlighted regions every other widget can ask for. Widgets supply only their
 * own metric layer.
 */

export interface TrackRegion {
  startT: number;
  endT: number;
  /** Any CSS colour, usually a token. */
  color: string;
  label?: string;
  /** Drawn behind the metric layer rather than over it. */
  behind?: boolean;
}

export interface TrackMarker {
  t: number;
  label: string;
  /** A second line under the label, for whatever the reader wrote. */
  detail?: string;
  color?: string;
}

/**
 * How near the cursor has to come to a marker before the track names it.
 *
 * In pixels rather than seconds, because the distance axis is not linear in
 * time: a fixed number of seconds is a different gap on the screen depending on
 * how fast that stretch was run.
 */
const MARKER_REACH_PX = 12;

/**
 * The marker the cursor has reached, if it has reached one.
 *
 * A one-pixel dashed line is not something anyone can point at, so what is
 * actually being pointed at is the run — and the track answers with whichever
 * marker that lands on. Because the cursor is shared, passing a gel on the
 * heart-rate chart names it on every other chart at the same time.
 */
export function nearestMarker(
  markers: readonly TrackMarker[],
  toPixels: (t: number) => number,
  cursorX: number | null,
): { marker: TrackMarker; x: number } | null {
  if (cursorX === null) return null;
  let nearest: { marker: TrackMarker; x: number; distance: number } | null = null;
  for (const marker of markers) {
    const x = toPixels(marker.t);
    const distance = Math.abs(x - cursorX);
    if (distance > MARKER_REACH_PX) continue;
    if (!nearest || distance < nearest.distance) nearest = { marker, x, distance };
  }
  return nearest;
}

interface TrackProps {
  activity: DerivedActivity;
  height: number;
  /** Draws the widget's own content. Receives the scale and plotting area. */
  children: (scale: XScale, height: number) => ReactNode;
  regions?: TrackRegion[];
  markers?: TrackMarker[];
  /** Shows the distance or time axis beneath the track. */
  showAxis?: boolean;
  /** Enables dragging a range to select it. */
  selectable?: boolean;
  widgetId: string;
  /** Called when the reader clicks rather than drags. */
  onClickAt?: (t: number) => void;
  ariaLabel: string;
}

const AXIS_HEIGHT = 22;

export function Track({
  activity,
  height,
  children,
  regions = [],
  markers = [],
  showAxis = false,
  selectable = false,
  widgetId,
  onClickAt,
  ariaLabel,
}: TrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [dragStart, setDragStart] = useState<number | null>(null);

  // The metric layer is uncovered left to right when the track first comes
  // into view, which is the direction the run itself was made in: the reader
  // watches the chart happen rather than finding it already there. Once it has
  // played the clip is dropped entirely, so nothing a widget draws outside the
  // plotting area — a label, a marker that overhangs — is clipped for good.
  const [drawRef, inView] = useInView<HTMLDivElement>();
  const [drawn, setDrawn] = useState(false);
  const clipId = `track-wipe-${useId()}`;

  const xMode = useSelectionStore((state) => state.xMode);
  const cursorT = useSelectionStore((state) => state.cursorT);
  const selection = useSelectionStore((state) => state.selection);
  const setCursor = useSelectionStore((state) => state.setCursor);
  const select = useSelectionStore((state) => state.select);

  const measure = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node) return;
    const update = () => setWidth(node.clientWidth || 720);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(
    () => createXScale(activity, xMode, width),
    [activity, xMode, width],
  );

  const timeFromEvent = useCallback(
    (clientX: number): number => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      return Math.round(scale.toTime(x));
    },
    [scale],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const t = timeFromEvent(event.clientX);
    setCursor(t);
    if (selectable) setDragStart(t);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const t = timeFromEvent(event.clientX);
    setCursor(t);
    if (dragStart !== null && Math.abs(t - dragStart) > 2) {
      select(Math.min(dragStart, t), Math.max(dragStart, t), widgetId);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const t = timeFromEvent(event.clientX);
    // A press that never moved is a click, not an empty selection.
    if (dragStart !== null && Math.abs(t - dragStart) <= 2) onClickAt?.(t);
    setDragStart(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 30 : 5;
    const last = activity.samples[activity.samples.length - 1]?.t ?? 0;
    const current = cursorT ?? 0;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setCursor(Math.min(last, current + step));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCursor(Math.max(0, current - step));
    } else if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCursor(last);
    }
  };

  const behindRegions = regions.filter((r) => r.behind);
  const frontRegions = regions.filter((r) => !r.behind);
  const cursorX = cursorT === null ? null : scale.toPixels(cursorT);

  const activeMarker = useMemo(
    () => nearestMarker(markers, scale.toPixels, cursorX),
    [markers, scale, cursorX],
  );

  return (
    <div
      className={styles.wrapper}
      ref={drawRef}
      data-draw={inView && !drawn ? "running" : undefined}
    >
      <div
        ref={measure}
        className={styles.track}
        style={{ height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setDragStart(null)}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={activity.samples[activity.samples.length - 1]?.t ?? 0}
        aria-valuenow={cursorT ?? 0}
        aria-valuetext={
          activeMarker
            ? `${cursorReadout(scale, cursorT)}, ${activeMarker.marker.label}`
            : cursorReadout(scale, cursorT)
        }
      >
        <svg width={width} height={height} className={styles.svg} aria-hidden="true">
          {!drawn && (
            <defs>
              <clipPath id={clipId}>
                {/* Generously larger than the track so the wipe never becomes a
                    crop: it only has to sweep across, not to frame. */}
                <rect
                  className={styles.wipe}
                  x={-24}
                  y={-48}
                  width={width + 48}
                  height={height + 96}
                  onAnimationEnd={() => setDrawn(true)}
                />
              </clipPath>
            </defs>
          )}

          <g clipPath={drawn ? undefined : `url(#${clipId})`}>
            {behindRegions.map((region, index) => (
              <RegionRect key={`behind-${index}`} region={region} scale={scale} height={height} />
            ))}

            {children(scale, height)}

            {frontRegions.map((region, index) => (
              <RegionRect key={`front-${index}`} region={region} scale={scale} height={height} />
            ))}
          </g>

          {/* The cursor, the selection and the markers answer the reader rather
              than the data, so they are left out of the sweep and appear the
              instant they are asked for. */}
          {selection && (
            <rect
              x={scale.toPixels(selection.startT)}
              y={0}
              width={Math.max(
                2,
                scale.toPixels(selection.endT) - scale.toPixels(selection.startT),
              )}
              height={height}
              className={styles.selection}
            />
          )}

          {markers.map((marker) => {
            const x = scale.toPixels(marker.t);
            const active = activeMarker?.marker === marker;
            const color = marker.color ?? "var(--border-strong)";
            return (
              <g key={marker.label + marker.t}>
                <line
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={height}
                  stroke={color}
                  strokeWidth={active ? 2 : 1}
                  strokeDasharray={active ? undefined : "2 3"}
                />
                {/* A cap at the foot of the line, so a marker reads as
                    something placed there rather than as a fold in the chart.
                    At the foot and not the head because the cursor's own dot
                    sits at the top and the two would collide. */}
                <circle
                  cx={x}
                  cy={height - 4}
                  r={active ? 5 : 3.5}
                  fill={color}
                  className={styles.markerCap}
                />
                <title>{marker.label}</title>
              </g>
            );
          })}

          {cursorX !== null && (
            <g>
              <line
                x1={cursorX}
                x2={cursorX}
                y1={0}
                y2={height}
                className={styles.cursorLine}
              />
              <circle cx={cursorX} cy={6} r={4} className={styles.cursorDot} />
            </g>
          )}
        </svg>

        {/* Positioned by a pixel taken from the SVG's own axis, which does not
            mirror on a right-to-left page — so this is one of the few places a
            physical `left` is the correct property rather than a logical one.
            Real markup rather than an SVG `<title>`: the drawing is hidden from
            assistive technology, and the name of the event a reader has just
            stopped on is exactly the part that should not be. */}
        {activeMarker && (
          <div
            className={styles.markerLabel}
            style={{ left: `${activeMarker.x}px` }}
            data-align={
              activeMarker.x < 72
                ? "start"
                : activeMarker.x > width - 72
                  ? "end"
                  : "center"
            }
          >
            <span className={styles.markerLabelText}>{activeMarker.marker.label}</span>
            {activeMarker.marker.detail && (
              <span className={styles.markerLabelDetail}>
                {activeMarker.marker.detail}
              </span>
            )}
          </div>
        )}
      </div>

      {showAxis && <Axis scale={scale} width={width} height={AXIS_HEIGHT} />}
    </div>
  );
}

function RegionRect({
  region,
  scale,
  height,
}: {
  region: TrackRegion;
  scale: XScale;
  height: number;
}) {
  const x = scale.toPixels(region.startT);
  const width = Math.max(1, scale.toPixels(region.endT) - x);
  return (
    <rect
      x={x}
      y={0}
      width={width}
      height={height}
      fill={region.color}
      rx={2}
    >
      {region.label && <title>{region.label}</title>}
    </rect>
  );
}

function Axis({ scale, width, height }: { scale: XScale; width: number; height: number }) {
  const ticks = useMemo(() => axisTicks(scale), [scale]);
  return (
    <svg width={width} height={height} className={styles.axis} aria-hidden="true">
      {ticks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={tick.x}
            x2={tick.x}
            y1={0}
            y2={3}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
          <text
            x={Math.min(width - 2, Math.max(2, tick.x))}
            y={14}
            className={styles.axisLabel}
            textAnchor={tick.x < 12 ? "start" : tick.x > width - 24 ? "end" : "middle"}
          >
            {tick.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function axisTicks(scale: XScale): { value: number; x: number; label: string }[] {
  const span = scale.domainEnd - scale.domainStart;
  if (span <= 0) return [];

  const targetCount = Math.max(2, Math.min(8, Math.floor(scale.width / 90)));
  const step = niceStep(span / targetCount, scale.mode);
  const ticks: { value: number; x: number; label: string }[] = [];

  for (let value = 0; value <= span + 1e-6; value += step) {
    const fraction = value / span;
    ticks.push({
      value,
      x: fraction * scale.width,
      label:
        scale.mode === "distance"
          ? formatDistanceShort(value)
          : formatDuration(value),
    });
  }
  return ticks;
}

/** Round steps a runner thinks in: 500 m, 1 km; 30 s, 1 min, 5 min. */
function niceStep(raw: number, mode: XScale["mode"]): number {
  const candidates =
    mode === "distance"
      ? [100, 200, 250, 500, 1000, 2000, 5000, 10000]
      : [30, 60, 120, 300, 600, 900, 1800, 3600];
  for (const candidate of candidates) {
    if (raw <= candidate) return candidate;
  }
  return candidates[candidates.length - 1];
}

function cursorReadout(scale: XScale, cursorT: number | null): string {
  if (cursorT === null) return "No position selected";
  const value = scale.valueAt(cursorT);
  return scale.mode === "distance"
    ? `${formatDistanceShort(value)} into the run`
    : `${formatDuration(value)} elapsed`;
}
