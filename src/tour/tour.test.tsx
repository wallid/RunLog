// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFit } from "@/parsers/fit/parseFit";
import { buildActivity } from "@/model/pipeline";
import { buildWidgets, groupWidgets } from "@/widgets/buildWidgets";
import { StoryPage } from "@/widgets/StoryPage";
import { TableOfContents } from "@/shell/TableOfContents";
import { RunHeader } from "@/shell/RunHeader";
import { useTourStore, TOUR_VERSION, hasSeenTour } from "@/state/tourStore";
import { isStepAvailable, resolveStep, stepTargets, TOUR_STEPS, type TourStep } from "./steps";
import { placeTooltip, unionRect, inflate, approach } from "./placement";

// Leaflet needs a live DOM with layout, which server rendering does not give it.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  useMap: () => ({ fitBounds: () => {} }),
}));

function demoPage() {
  const buffer = readFileSync(resolve(__dirname, "../../fixtures/Lunch_Run.fit"));
  const raw = parseFit(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const activity = buildActivity(raw);
  const groups = groupWidgets(buildWidgets(activity, { includeExperimental: true }));
  return {
    activity,
    groups,
    markup:
      renderToStaticMarkup(
        <RunHeader activity={activity} groups={groups} experimentalCount={0} />,
      ) +
      renderToStaticMarkup(<TableOfContents groups={groups} />) +
      renderToStaticMarkup(<StoryPage activity={activity} groups={groups} />),
  };
}

/**
 * The tour points at the page through data attributes, and nothing type-checks
 * a CSS selector. This renders the real page and asks each step's selector for
 * its element, so a renamed mark fails here rather than as a tour that lights
 * up nothing.
 */
describe("what the tour points at", () => {
  const { markup } = demoPage();

  beforeEach(() => {
    document.body.innerHTML = markup;
  });

  for (const step of TOUR_STEPS) {
    if (!step.target) continue;

    it(`"${step.id}" finds something on the page`, () => {
      const found = step.target!.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector)),
      );
      expect(found.length).toBeGreaterThan(0);
    });
  }

  it("marks exactly one card and one section header, so the parts are unambiguous", () => {
    expect(document.querySelectorAll('[data-tour="card"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-tour="section-header"]')).toHaveLength(1);
  });

  it("marks the card the tour explains, not some other one", () => {
    const card = document.querySelector('[data-tour="card"]');
    expect(card?.querySelector('[data-tour-part="information"]')).not.toBeNull();
    expect(card?.querySelector('[data-tour-part="info"]')).not.toBeNull();
  });
});

describe("steps", () => {
  it("has an id, a title and something to say for each step", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
    expect(new Set(TOUR_STEPS.map((step) => step.id)).size).toBe(TOUR_STEPS.length);
  });

  it("opens on a step that needs nothing from the page", () => {
    // The first thing anyone sees cannot depend on a layout that may not exist.
    expect(TOUR_STEPS[0].target).toBeUndefined();
  });

  it("treats a target the layout is not showing as absent", () => {
    document.body.innerHTML = `<div id="wide"></div>`;
    const step: TourStep = { id: "rail", title: "t", body: "b", target: ["#wide"] };
    // Nothing in a headless document has a size, which is exactly the case of a
    // rail dropped at a narrow width.
    expect(stepTargets(step)).toEqual([]);
    expect(isStepAvailable(step)).toBe(false);

    const element = document.querySelector<HTMLElement>("#wide")!;
    element.getBoundingClientRect = () =>
      ({ left: 10, top: 20, right: 110, bottom: 70, width: 100, height: 50 }) as DOMRect;
    expect(stepTargets(step)).toHaveLength(1);
    expect(isStepAvailable(step)).toBe(true);
  });

  it("skips over the steps this page cannot show", () => {
    const steps: TourStep[] = [
      { id: "a", title: "", body: "" },
      { id: "b", title: "", body: "", target: ["#gone"] },
      { id: "c", title: "", body: "", target: ["#gone"] },
      { id: "d", title: "", body: "" },
    ];
    const available = (step: TourStep) => !step.target;

    expect(resolveStep(0, 1, available, steps)).toBe(3);
    expect(resolveStep(3, -1, available, steps)).toBe(0);
  });

  it("runs out rather than wrapping, which is what ends the tour", () => {
    const steps: TourStep[] = [{ id: "a", title: "", body: "" }];
    expect(resolveStep(0, 1, () => true, steps)).toBeNull();
    expect(resolveStep(0, -1, () => true, steps)).toBeNull();
  });
});

describe("where the panel lands", () => {
  const size = { w: 300, h: 200 };
  const view = { w: 1200, h: 800 };

  it("centres a step that points at nothing", () => {
    expect(placeTooltip(null, size, view)).toEqual({ x: 450, y: 300 });
  });

  it("sits below the target when there is room", () => {
    const point = placeTooltip({ x: 400, y: 100, w: 200, h: 100 }, size, view);
    expect(point.y).toBe(216);
    // Centred on the target rather than aligned to its edge.
    expect(point.x).toBe(350);
  });

  it("goes above when below would fall off the bottom", () => {
    const point = placeTooltip({ x: 400, y: 600, w: 200, h: 150 }, size, view);
    expect(point.y).toBe(600 - 16 - 200);
  });

  it("honours a preferred side when it fits, and abandons it when it does not", () => {
    const rail = { x: 40, y: 200, w: 180, h: 400 };
    expect(placeTooltip(rail, size, view, "right").x).toBe(236);
    expect(placeTooltip(rail, size, { w: 420, h: 800 }, "right").x).not.toBe(236);
  });

  it("stays on screen when nothing fits around a target taller than the window", () => {
    const tall = { x: 100, y: -200, w: 700, h: 1200 };
    const point = placeTooltip(tall, size, view);
    expect(point.y).toBeGreaterThanOrEqual(12);
    expect(point.y + size.h).toBeLessThanOrEqual(view.h - 12);
    expect(point.x).toBeGreaterThanOrEqual(12);
  });

  it("lights several elements as one shape", () => {
    const rect = (top: number, height: number) =>
      ({
        getBoundingClientRect: () =>
          ({ left: 100, top, right: 500, bottom: top + height, width: 400, height }) as DOMRect,
      }) as Element;

    expect(unionRect([rect(100, 40), rect(180, 60)])).toEqual({
      x: 100,
      y: 100,
      w: 400,
      h: 140,
    });
    expect(unionRect([])).toBeNull();
  });

  it("grows the lit shape on every side", () => {
    expect(inflate({ x: 100, y: 100, w: 200, h: 50 }, 10)).toEqual({
      x: 90,
      y: 90,
      w: 220,
      h: 70,
    });
  });

  it("settles exactly on the target rather than creeping towards it forever", () => {
    let value = 0;
    for (let frame = 0; frame < 200; frame += 1) value = approach(value, 100, 0.22);
    expect(value).toBe(100);
  });
});

describe("the record of having seen it", () => {
  beforeEach(() => {
    localStorage.clear();
    useTourStore.setState({ step: null, seenVersion: 0 });
  });

  it("is not set until the tour is left", () => {
    useTourStore.getState().start();
    expect(useTourStore.getState().step).toBe(0);
    expect(hasSeenTour(useTourStore.getState().seenVersion)).toBe(false);
  });

  it("records a skip the same way it records finishing", () => {
    useTourStore.getState().start();
    useTourStore.getState().goTo(2);
    useTourStore.getState().end();

    expect(useTourStore.getState().step).toBeNull();
    expect(hasSeenTour(useTourStore.getState().seenVersion)).toBe(true);
    expect(JSON.parse(localStorage.getItem("run-story.tour")!)).toEqual({
      seenVersion: TOUR_VERSION,
    });
  });

  it("shows the tour again after a browser has only seen an older one", () => {
    expect(hasSeenTour(TOUR_VERSION - 1)).toBe(false);
    expect(hasSeenTour(TOUR_VERSION)).toBe(true);
  });
});
