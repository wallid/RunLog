/**
 * The geometry the tour is drawn from.
 *
 * Kept apart from the component and free of the DOM beyond one measurement, so
 * where the panel lands can be reasoned about — and tested — without a browser.
 */

export type Placement = "top" | "right" | "bottom" | "left";

/** A rectangle in viewport coordinates. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Distance between the lit shape and the panel. */
const GAP = 16;
/** Closest the panel is allowed to sit to the edge of the window. */
const EDGE = 12;

/**
 * The single shape covering every element a step lights up.
 *
 * A step can name more than one element — the observed and the interpreted
 * lines are two blocks making one point — and lighting them as one shape says
 * they belong together.
 */
export function unionRect(elements: Element[]): Box | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) continue;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  if (left === Infinity) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Grows a box on every side, which is what turns a tight rect into a spotlight. */
export function inflate(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, w: box.w + by * 2, h: box.h + by * 2 };
}

function clamp(value: number, min: number, max: number): number {
  // A window smaller than the panel would leave max below min; the near edge
  // wins, so the panel is never pushed off the top or left.
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/**
 * Where the panel goes.
 *
 * Sides are tried in order of preference and the first that fits on screen
 * wins. When none fits — a card taller than the window, most often — the panel
 * sits below and is clamped into view, overlapping what it describes rather
 * than disappearing off the edge of it.
 */
export function placeTooltip(
  spot: Box | null,
  size: Size,
  view: Size,
  preferred?: Placement,
): Point {
  // A step pointing at nothing is centred: there is nowhere better to be.
  if (!spot) {
    return { x: (view.w - size.w) / 2, y: (view.h - size.h) / 2 };
  }

  const centreX = clamp(spot.x + spot.w / 2 - size.w / 2, EDGE, view.w - size.w - EDGE);
  const centreY = clamp(spot.y + spot.h / 2 - size.h / 2, EDGE, view.h - size.h - EDGE);

  const options: Record<Placement, { point: Point; fits: boolean }> = {
    bottom: {
      point: { x: centreX, y: spot.y + spot.h + GAP },
      fits: spot.y + spot.h + GAP + size.h <= view.h - EDGE,
    },
    top: {
      point: { x: centreX, y: spot.y - GAP - size.h },
      fits: spot.y - GAP - size.h >= EDGE,
    },
    right: {
      point: { x: spot.x + spot.w + GAP, y: centreY },
      fits: spot.x + spot.w + GAP + size.w <= view.w - EDGE,
    },
    left: {
      point: { x: spot.x - GAP - size.w, y: centreY },
      fits: spot.x - GAP - size.w >= EDGE,
    },
  };

  // Below, then above, before either side: a panel under or over what it
  // describes reads as attached to it, where one beside it reads as a column.
  const fallbacks: Placement[] = ["bottom", "top", "right", "left"];
  const order = preferred
    ? [preferred, ...fallbacks.filter((placement) => placement !== preferred)]
    : fallbacks;

  for (const placement of order) {
    if (options[placement].fits) return options[placement].point;
  }

  return {
    x: centreX,
    y: clamp(options.bottom.point.y, EDGE, view.h - size.h - EDGE),
  };
}

/**
 * One frame of movement towards a value, snapping once it is close enough to
 * stop. Everything the tour moves is moved through here, so the spotlight
 * glides between steps and still sits exactly on its target once at rest.
 */
export function approach(from: number, to: number, ease: number): number {
  return Math.abs(to - from) < 0.5 ? to : from + (to - from) * ease;
}

export function approachBox(from: Box, to: Box, ease: number): Box {
  return {
    x: approach(from.x, to.x, ease),
    y: approach(from.y, to.y, ease),
    w: approach(from.w, to.w, ease),
    h: approach(from.h, to.h, ease),
  };
}
