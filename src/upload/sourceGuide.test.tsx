import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SOURCES, SourceGuide } from "./SourceGuide";

/**
 * The export guide, checked as claims rather than as markup.
 *
 * Every line in this section is a promise about a third party's export — press
 * this, receive that, and this much of your run survives. None of it can be
 * verified from here, so what is testable is the shape of the promise: that the
 * fullest route is the one offered first, that a route which lists no metrics
 * says why in prose instead, and that the two claims which exist to steer a
 * reader somewhere better are still being made.
 */

describe("the routes on offer", () => {
  it("gives every source somewhere to go", () => {
    for (const source of SOURCES) {
      expect(source.routes.length).toBeGreaterThan(0);
      for (const route of source.routes) {
        expect(route.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every id unique, since the open one is keyed on it", () => {
    const sourceIds = SOURCES.map((source) => source.id);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);

    for (const source of SOURCES) {
      const routeIds = source.routes.map((route) => route.id);
      expect(new Set(routeIds).size).toBe(routeIds.length);
    }
  });

  it("offers the fullest route first, because the first one is the advice", () => {
    for (const source of SOURCES) {
      const carried = source.routes.map((route) => route.carries?.length ?? 0);
      const sorted = [...carried].sort((a, b) => b - a);
      expect(carried).toEqual(sorted);
    }
  });

  it("explains itself wherever it will not promise a metric", () => {
    for (const source of SOURCES) {
      for (const route of source.routes) {
        if (!route.carries) expect(route.note).toBeTruthy();
      }
    }
  });
});

describe("the two claims that send a reader elsewhere", () => {
  it("does not promise heart rate from an Apple export, which does not carry it", () => {
    const apple = SOURCES.find((source) => source.id === "apple");
    expect(apple).toBeDefined();

    for (const route of apple!.routes) {
      expect(route.carries).toBeDefined();
      expect(route.carries).not.toContain("heart");
      // The absence is only useful if it comes with somewhere better to look.
      expect(route.note).toMatch(/Strava|Garmin/);
    }
  });

  it("sends Strava at the original file before the archive", () => {
    const strava = SOURCES.find((source) => source.id === "strava");
    expect(strava?.routes[0].id).toBe("one");
    expect(strava?.routes).toHaveLength(2);
  });
});

describe("the closed guide", () => {
  it("renders the sources and nothing from a panel", () => {
    const html = renderToStaticMarkup(<SourceGuide />);

    expect(html).toContain("Where is your run?");
    for (const source of SOURCES) {
      expect(html).toContain(source.label);
    }
    // Nothing is open on arrival, so no route's steps are in the document.
    expect(html).not.toContain("Comes across");
  });
});
