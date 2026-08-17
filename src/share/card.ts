/**
 * The image of a run, for posting somewhere that is not this page.
 *
 * ## Why this is drawn rather than screenshotted
 *
 * The obvious way to turn a card into an image is to rasterise the card: walk
 * the DOM, inline the stylesheet, serialise to SVG, paint to a canvas. It is
 * also the wrong way. A card on the page is styled by twenty CSS modules and
 * a hundred custom properties, half of it is HTML rather than SVG, and the
 * result of that pipeline is reliably *almost* right — a missing font here, an
 * unresolved `var()` there. Almost right is worse than absent for the one
 * artefact of this project that people will judge it by while scrolling past
 * it in a feed.
 *
 * So this is a drawing, not a copy. It is composed for the place it is going:
 * one chart, four figures, legible at the size a phone shows a link preview.
 * Nothing here has to track what the cards on the page look like, because it
 * was never claiming to be one of them.
 *
 * ## What it deliberately cannot leak
 *
 * There is no map on it and no coordinate in it — not as a design preference
 * but as a property of the code: this function never reads `lat` or `lon`.
 * A runner who exports an image and posts it has published their pace, their
 * heart rate and their elevation profile, and has not published where they
 * live. That guarantee is worth more than a route line would add, and it is
 * checked by a test rather than left to review.
 *
 * The palette is fixed rather than read from the page's theme. An image posted
 * to a feed is viewed in somebody else's context, so it should not inherit the
 * light or dark mode of the machine that happened to make it.
 */

import type { DerivedActivity } from "@/model/activity";
import { formatDate, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { kindSpec } from "@/model/annotations";

/** Sized for a link preview, which is the same 1.91:1 every platform wants. */
const WIDTH = 1200;
const HEIGHT = 630;

/** Drawn at twice the nominal size so it stays sharp on a phone. */
const SCALE = 2;

const PALETTE = {
  page: "#ffffff",
  ink: "#17171a",
  secondary: "#5f5f66",
  muted: "#8a8a93",
  hairline: "#ebe9e6",
  accent: "#fc5200",
  heart: "#dd5208",
  pace: "#2a78d6",
  elevation: "#e8ede9",
  elevationLine: "#0f9463",
} as const;

const FONT = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif';

export interface CardOptions {
  /** Mark the runner's own events along the chart. */
  events?: boolean;
}

/** The trace the chart draws, and what to call it. */
type Series = { values: (number | undefined)[]; label: string; color: string; invert: boolean };

/**
 * Picks the one line worth drawing.
 *
 * Pace first: it is what the run *was*. Heart rate second, for a run recorded
 * without a usable pace. Pace is inverted so that faster is higher, which is
 * the only orientation anyone reads correctly without a label.
 */
function chooseSeries(activity: DerivedActivity): Series | null {
  if (activity.availableMetrics.has("pace")) {
    return {
      values: activity.samples.map((sample) => sample.paceSecPerKm),
      label: "Pace",
      color: PALETTE.pace,
      invert: true,
    };
  }
  if (activity.availableMetrics.has("heartRate")) {
    return {
      values: activity.samples.map((sample) => sample.hrBpm),
      label: "Heart rate",
      color: PALETTE.heart,
      invert: false,
    };
  }
  return null;
}

/**
 * Reduces a per-second series to one value per pixel column.
 *
 * The median of each bucket rather than the mean: a run has seconds of
 * nonsense in it — a pace spike leaving a junction, a heart-rate dropout — and
 * a mean carries those into the line while a median steps over them.
 */
function buckets(values: (number | undefined)[], columns: number): (number | undefined)[] {
  if (values.length === 0) return [];
  const out: (number | undefined)[] = [];
  for (let column = 0; column < columns; column++) {
    const from = Math.floor((column * values.length) / columns);
    const to = Math.max(from + 1, Math.floor(((column + 1) * values.length) / columns));
    const present = values.slice(from, to).filter((v): v is number => v !== undefined);
    if (present.length === 0) {
      out.push(undefined);
      continue;
    }
    present.sort((a, b) => a - b);
    out.push(present[present.length >> 1]);
  }
  return out;
}

function extent(values: (number | undefined)[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value === undefined) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === Infinity) return null;
  // A flat series would divide by zero; give it a nominal band so it draws as
  // the straight line it is rather than vanishing.
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Draws the elevation profile as a soft area behind the metric line. */
function drawElevation(
  context: CanvasRenderingContext2D,
  activity: DerivedActivity,
  box: Box,
): void {
  if (!activity.availableMetrics.has("elevation")) return;

  const columns = Math.round(box.width);
  const series = buckets(
    activity.samples.map((sample) => sample.elevationM),
    columns,
  );
  const range = extent(series);
  if (!range) return;

  // Kept to the lower half of the plot so it reads as ground under the metric
  // rather than as a second line competing with it.
  const floor = box.y + box.height;
  const ceiling = box.y + box.height * 0.55;

  context.beginPath();
  context.moveTo(box.x, floor);
  series.forEach((value, index) => {
    if (value === undefined) return;
    const fraction = (value - range.min) / (range.max - range.min);
    context.lineTo(box.x + index, floor - fraction * (floor - ceiling));
  });
  context.lineTo(box.x + columns, floor);
  context.closePath();
  context.fillStyle = PALETTE.elevation;
  context.fill();
}

function drawSeries(context: CanvasRenderingContext2D, series: Series, box: Box): void {
  const columns = Math.round(box.width);
  const points = buckets(series.values, columns);
  const range = extent(points);
  if (!range) return;

  context.beginPath();
  let drawing = false;
  points.forEach((value, index) => {
    if (value === undefined) {
      // A gap in the recording is a gap in the line, not a straight segment
      // across it pretending the watch was still listening.
      drawing = false;
      return;
    }
    const fraction = (value - range.min) / (range.max - range.min);
    const height = series.invert ? fraction : 1 - fraction;
    const y = box.y + height * box.height;
    if (drawing) context.lineTo(box.x + index, y);
    else context.moveTo(box.x + index, y);
    drawing = true;
  });

  context.strokeStyle = series.color;
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
}

/**
 * Marks the runner's own events along the foot of the chart.
 *
 * Positioned by time, which is the axis the chart is drawn on. Each is a dot
 * and its kind's initial rather than its label: at this size a row of words
 * would overlap into a smear, and the point of them here is the pattern — three
 * gels evenly spaced, or one cramp two thirds of the way in.
 */
function drawAnnotations(
  context: CanvasRenderingContext2D,
  activity: DerivedActivity,
  box: Box,
): void {
  const annotations = activity.annotations ?? [];
  if (annotations.length === 0 || activity.elapsedS <= 0) return;

  for (const annotation of annotations) {
    const fraction = Math.min(1, Math.max(0, annotation.t / activity.elapsedS));
    const x = box.x + fraction * box.width;
    const y = box.y + box.height + 18;

    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fillStyle = PALETTE.accent;
    context.fill();

    const label = kindSpec(annotation.kind)?.label ?? "";
    if (label.length === 0) continue;
    context.fillStyle = "#ffffff";
    context.font = `600 9px ${FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label.slice(0, 1).toUpperCase(), x, y + 0.5);
  }
}

function drawFigure(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
): void {
  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  context.fillStyle = PALETTE.muted;
  context.font = `600 15px ${FONT}`;
  context.fillText(label.toUpperCase(), x, y);

  context.fillStyle = PALETTE.ink;
  context.font = `640 42px ${FONT}`;
  context.fillText(value, x, y + 44);
}

/**
 * Draws the card and hands back a PNG.
 *
 * Waits on the page's fonts first: a canvas asked for Inter before Inter has
 * loaded silently falls back to the platform's default, and the difference is
 * only visible once the image is already posted somewhere.
 */
export async function drawShareCard(
  activity: DerivedActivity,
  options: CardOptions = {},
): Promise<Blob> {
  if (typeof document !== "undefined" && document.fonts !== undefined) {
    try {
      await document.fonts.ready;
    } catch {
      // A font that never resolves is not a reason to refuse the image.
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = HEIGHT * SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not draw the image.");
  context.scale(SCALE, SCALE);

  context.fillStyle = PALETTE.page;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const margin = 64;

  // Title and date.
  context.fillStyle = PALETTE.ink;
  context.font = `680 44px ${FONT}`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const name = activity.name ?? "A run";
  context.fillText(truncate(context, name, WIDTH - margin * 2 - 200), margin, margin + 40);

  context.fillStyle = PALETTE.secondary;
  context.font = `500 19px ${FONT}`;
  context.fillText(formatDate(activity.startedAt), margin, margin + 74);

  // The wordmark, on the same line as the date and at the other end, so the
  // image says where it came from without a banner across it.
  context.textAlign = "right";
  context.fillStyle = PALETTE.accent;
  context.font = `680 21px ${FONT}`;
  context.fillText("Run Log", WIDTH - margin, margin + 40);
  context.fillStyle = PALETTE.muted;
  context.font = `500 16px ${FONT}`;
  context.fillText("runlogapp.com", WIDTH - margin, margin + 70);

  // The figures.
  const figuresY = margin + 150;
  const columnWidth = (WIDTH - margin * 2) / 4;
  drawFigure(context, "Distance", formatDistance(activity.distanceM), margin, figuresY);
  drawFigure(
    context,
    "Time",
    formatDuration(activity.elapsedS),
    margin + columnWidth,
    figuresY,
  );
  drawFigure(
    context,
    "Pace",
    formatPace(activity.summary.avgPaceSecPerKm),
    margin + columnWidth * 2,
    figuresY,
  );
  const fourth =
    activity.summary.avgHr !== undefined
      ? { label: "Avg HR", value: `${Math.round(activity.summary.avgHr)}` }
      : { label: "Elevation", value: `${Math.round(activity.summary.gainM)} m` };
  drawFigure(context, fourth.label, fourth.value, margin + columnWidth * 3, figuresY);

  // The chart.
  const plot: Box = {
    x: margin,
    y: figuresY + 96,
    width: WIDTH - margin * 2,
    height: HEIGHT - (figuresY + 96) - margin - 40,
  };

  drawElevation(context, activity, plot);

  const series = chooseSeries(activity);
  if (series) {
    drawSeries(context, series, plot);

    context.fillStyle = series.color;
    context.font = `600 15px ${FONT}`;
    context.textAlign = "left";
    context.fillText(series.label.toUpperCase(), plot.x, plot.y - 12);
  }

  if (options.events !== false) drawAnnotations(context, activity, plot);

  // The baseline, drawn last so the elevation area sits on it.
  context.beginPath();
  context.moveTo(plot.x, plot.y + plot.height);
  context.lineTo(plot.x + plot.width, plot.y + plot.height);
  context.strokeStyle = PALETTE.hairline;
  context.lineWidth = 1;
  context.stroke();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The image could not be encoded."));
    }, "image/png");
  });
}

/** Shortens text to fit, with an ellipsis, measured in the font actually used. */
function truncate(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** A filename that sorts by date and says what it is. */
export function cardFileName(activity: DerivedActivity): string {
  const day = activity.startedAt.toISOString().slice(0, 10);
  return `runlog-${day}.png`;
}
