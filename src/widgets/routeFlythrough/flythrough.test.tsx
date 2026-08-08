// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFit } from "@/parsers/fit/parseFit";
import { buildActivity } from "@/model/pipeline";
import { useSelectionStore } from "@/state/selectionStore";
import routeFlythrough from "./index";

/**
 * The flythrough is the one card whose point is the interaction, so it is the
 * one card a static render cannot vouch for. These tests mount it properly and
 * drive it the way a reader would: move the cursor, press play, let frames go
 * by.
 */

// Leaflet needs a live DOM with layout. The polylines are recorded instead of
// drawn, which is what the assertions are about anyway: how much of the route
// is lit at a given cursor position.
const drawn: { positions: unknown[]; color: unknown }[] = [];

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: ({
    positions,
    pathOptions,
  }: {
    positions: unknown[];
    pathOptions?: { color?: unknown };
  }) => {
    drawn.push({ positions, color: pathOptions?.color });
    return null;
  },
  CircleMarker: () => null,
  useMap: () => ({ fitBounds: () => {}, invalidateSize: () => {} }),
}));

function loadDemoRun() {
  const buffer = readFileSync(resolve(__dirname, "../../../fixtures/Lunch_Run.fit"));
  const raw = parseFit(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  return buildActivity(raw);
}

const activity = loadDemoRun();
const result = routeFlythrough.compute(activity);
if (result === null) throw new Error("the demo run should have a route");

/**
 * Frames only advance when a test says so, so playback is deterministic.
 *
 * Cancellation is honoured rather than stubbed away: a card that leaves a frame
 * queued after the reader has stopped it would pass a no-op stub and then move
 * the cursor on its own in a real browser.
 */
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let clock = 0;

function runFrame(msElapsed: number) {
  clock += msElapsed;
  const pending = [...frames.values()];
  frames.clear();
  for (const frame of pending) frame(clock);
}

function pendingFrames(): number {
  return frames.size;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  drawn.length = 0;
  frames = new Map();
  nextFrameId = 1;
  clock = 0;

  // React only trusts act() when it is told it is in a test.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );

  useSelectionStore.getState().clearAll();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function mount() {
  const View = routeFlythrough.View;
  act(() => {
    root.render(<View result={result!} activity={activity} />);
  });
}

/** The furthest point any coloured leg reaches, as an index into the route. */
function litThrough(): number {
  const positions = result!.points.map((point) => point.position);
  let furthest = 0;
  for (const line of drawn) {
    // The faint base line is the whole route and is not part of the answer.
    if (line.color === "var(--text-muted)") continue;
    const last = line.positions[line.positions.length - 1];
    const index = positions.findIndex(
      (candidate) =>
        (candidate as number[])[0] === (last as number[])[0] &&
        (candidate as number[])[1] === (last as number[])[1],
    );
    if (index > furthest) furthest = index;
  }
  return furthest;
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((element) =>
    element.textContent?.includes(label),
  );
  if (!found) throw new Error(`no button labelled ${label}`);
  return found as HTMLButtonElement;
}

describe("the chart under the map", () => {
  it("draws a line for every metric the run carries, not just elevation", () => {
    mount();
    const strokes = [...container.querySelectorAll("path[stroke]")].map((path) =>
      path.getAttribute("stroke"),
    );
    expect(strokes).toContain("var(--metric-heart)");
    expect(strokes).toContain("var(--metric-pace)");
    expect(strokes).toContain("var(--metric-elevation)");
  });

  it("shades the chart by intensity, and names the three in the key", () => {
    mount();
    const fills = [...container.querySelectorAll("rect")].map((rect) =>
      rect.getAttribute("fill"),
    );
    // The demo run covers all three intensities.
    expect(fills).toContain("var(--zone-band-easy)");
    expect(fills).toContain("var(--zone-band-steady)");
    expect(fills).toContain("var(--zone-band-hard)");

    const text = container.textContent ?? "";
    expect(text).toContain("Easy · Zones 1–2");
    expect(text).toContain("Steady · Zone 3");
    expect(text).toContain("Hard · Zones 4–5");
  });

  it("says which intensity each zone on the map belongs to", () => {
    mount();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Zone \d · (Easy|Steady|Hard)/);
  });

  it("shades the ground already covered once there is a cursor", () => {
    mount();
    const covered = () =>
      [...container.querySelectorAll("rect")].filter((rect) =>
        rect.getAttribute("fill")?.includes("--accent"),
      ).length;

    expect(covered()).toBe(0);
    act(() => useSelectionStore.getState().setCursor(result!.points[20].t));
    expect(covered()).toBe(1);
  });
});

describe("the flythrough card", () => {
  it("lights the whole route when no position has been chosen", () => {
    mount();
    expect(litThrough()).toBe(result!.points.length - 1);
  });

  it("lights the route only as far as the cursor has reached", () => {
    mount();
    const midway = result!.points[Math.floor(result!.points.length / 2)].t;

    drawn.length = 0;
    act(() => useSelectionStore.getState().setCursor(midway));

    const lit = litThrough();
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(result!.points.length - 1);
    // The lit end is the cursor's own point, not an arbitrary earlier one.
    expect(result!.points[lit].t).toBeLessThanOrEqual(midway);
    expect(result!.points[lit + 1].t).toBeGreaterThan(midway);
  });

  it("walks the cursor along the run while playing, and stops at the finish", () => {
    mount();
    act(() => button("Play the run").click());

    // The first frame only establishes a baseline; the second moves.
    act(() => runFrame(0));
    act(() => runFrame(1000));

    const afterOneSecond = useSelectionStore.getState().cursorT;
    expect(afterOneSecond).not.toBeNull();
    expect(afterOneSecond!).toBeGreaterThan(result!.firstT);
    expect(afterOneSecond!).toBeLessThan(result!.lastT);

    // The button says what it will do next, which is now to pause.
    expect(() => button("Pause")).not.toThrow();

    // Long enough to reach the end however long the run was.
    act(() => runFrame(60_000));
    expect(useSelectionStore.getState().cursorT).toBe(result!.lastT);
    expect(pendingFrames()).toBe(0);
    expect(() => button("Play the run")).not.toThrow();
  });

  it("stops playing when the reader pauses", () => {
    mount();
    act(() => button("Play the run").click());
    act(() => runFrame(0));
    act(() => runFrame(1000));

    const paused = useSelectionStore.getState().cursorT;
    act(() => button("Pause").click());
    expect(pendingFrames()).toBe(0);

    act(() => runFrame(5000));
    expect(useSelectionStore.getState().cursorT).toBe(paused);
  });

  it("starts again from the beginning once the run has played out", () => {
    mount();
    act(() => useSelectionStore.getState().setCursor(result!.lastT));
    act(() => button("Play the run").click());

    expect(useSelectionStore.getState().cursorT).toBe(result!.firstT);
  });

  it("clears the cursor, and the playback with it, on reset", () => {
    mount();
    act(() => useSelectionStore.getState().setCursor(result!.points[10].t));
    act(() => button("Play the run").click());
    act(() => button("Reset").click());

    expect(useSelectionStore.getState().cursorT).toBeNull();
    act(() => runFrame(1000));
    expect(useSelectionStore.getState().cursorT).toBeNull();
  });
});
