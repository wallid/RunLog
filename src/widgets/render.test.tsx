// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFit } from "@/parsers/fit/parseFit";
import { buildActivity } from "@/model/pipeline";
import { WIDGETS } from "./registry";
import {
  isWidgetSupported,
  sectionAnchorId,
  SECTION_DESCRIPTIONS,
  SECTION_LABELS,
  type WidgetSection,
} from "./contract";
import { StoryPage } from "./StoryPage";
import { buildWidgets, countExperimental, groupWidgets } from "./buildWidgets";
import { TableOfContents } from "@/shell/TableOfContents";

// Leaflet needs a live DOM with layout, which server rendering does not provide.
// The map's own logic is exercised through its compute and narrate functions.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  useMap: () => ({ fitBounds: () => {} }),
}));

function loadDemoRun() {
  const buffer = readFileSync(resolve(__dirname, "../../fixtures/Lunch_Run.fit"));
  const raw = parseFit(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  return buildActivity(raw);
}

const activity = loadDemoRun();

describe("every widget on the demo run", () => {
  const supported = WIDGETS.filter((widget) => isWidgetSupported(widget, activity));

  it("keeps the widgets whose metrics this file carries", () => {
    const ids = supported.map((w) => w.id);
    expect(ids).toContain("run-summary");
    expect(ids).toContain("heart-rate-zones");
    expect(ids).toContain("power-story");
    expect(ids).toContain("route-map");
    // The demo carries cadence, so the whole cadence section is available.
    expect(ids.filter((id) => id.startsWith("cadence-")).length).toBeGreaterThan(8);
  });

  for (const widget of WIDGETS) {
    if (!isWidgetSupported(widget, activity)) continue;

    it(`${widget.id} computes, narrates and renders`, () => {
      const result = widget.compute(activity);
      if (result === null || result === undefined) return;

      const narration = widget.narrate(result, activity);

      // Numbers that failed to compute must never reach the reader.
      const allText = [
        ...narration.information.flatMap((s) => [s.label, s.value, s.note ?? ""]),
        ...narration.observations.map((o) => o.text),
        ...narration.explanations.map((e) => e.text),
        ...narration.teaching.flatMap((t) => [t.title, t.text]),
      ].join(" ");

      expect(allText).not.toContain("NaN");
      expect(allText).not.toContain("undefined");
      expect(allText).not.toContain("Infinity");
      expect(allText).not.toContain("[object Object]");

      for (const explanation of narration.explanations) {
        expect(["high", "medium", "low"]).toContain(explanation.confidence);
        expect(explanation.text.length).toBeGreaterThan(15);
      }
      for (const point of narration.teaching) {
        expect(point.text.length).toBeGreaterThan(30);
      }

      const markup = renderToStaticMarkup(
        <widget.View result={result as never} activity={activity} />,
      );
      expect(markup.length).toBeGreaterThan(0);
      expect(markup).not.toContain("NaN");
    });
  }
});

/**
 * Colour that carries meaning has to be readable without guessing, so every
 * widget that paints more than one is required to render a key. The list is
 * written out rather than derived, because the point is to fail loudly when a
 * new chart is added without one.
 */
describe("colour keys", () => {
  const MUST_KEY = [
    "activity-strip",
    "route-map",
    "route-flythrough",
    "splits",
    "heart-rate-timeline",
    "zone-timeline",
    "heart-rate-zones",
    "elevation-story",
    // "stops-and-walking" belongs here too, but the demo run is continuous, so
    // it declines to draw anything and there is nothing to key.
    "pace-story",
    "power-story",
    "cadence-drops",
    "interactive-timeline",
  ];

  for (const id of MUST_KEY) {
    it(`${id} tells the reader what its colours mean`, () => {
      const widget = WIDGETS.find((w) => w.id === id);
      if (!widget) throw new Error(`no widget called ${id}`);
      expect(isWidgetSupported(widget, activity)).toBe(true);

      const result = widget.compute(activity);
      expect(result, `${id} computed nothing on the demo run`).not.toBeNull();

      const View = widget.View;
      const markup = renderToStaticMarkup(
        <View result={result as never} activity={activity} />,
      );
      // The class names are hashed by the CSS module transform, but the source
      // name survives inside the hash.
      expect(markup).toMatch(/legend|Legend/);
    });
  }
});

describe("the whole page", () => {
  const built = buildWidgets(activity, { includeExperimental: true });
  const groups = groupWidgets(built);

  it("renders without throwing", () => {
    const markup = renderToStaticMarkup(
      <StoryPage activity={activity} groups={groups} />,
    );
    expect(markup).toContain("Run summary");
    expect(markup).toContain("The story of this run");
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("undefined");
  });

  it("renders a widget for most of the registry", () => {
    expect(built.length).toBeGreaterThanOrEqual(12);
  });

  it("declines the lab cards this run is too short to support", () => {
    // Twenty minutes is not a durability question, and the opening minutes of
    // it are heart rate still catching up with the effort — so every card that
    // divides by heart rate opts out here even though the metrics are present.
    // The cards that do appear are the ones with no such problem: power, speed
    // and the stride answer the effort immediately, and terrain, wind and
    // coverage are not questions about how the run wore on at all.
    const lab = built.filter((item) => item.widget.section === "lab");
    expect(lab.map((item) => item.widget.id)).toEqual([
      "mechanical-efficiency",
      "cadence-durability",
      "stride-drift",
      "rhythm-stability",
      "terrain-response",
      "what-changed",
      "data-confidence",
    ]);
  });

  it("heads each section with its name and what it is about", () => {
    const markup = renderToStaticMarkup(
      <StoryPage activity={activity} groups={groups} />,
    );

    for (const group of groups) {
      expect(markup).toContain(`id="${sectionAnchorId(group.section)}"`);
      expect(markup).toContain(group.label);
      expect(markup).toContain(SECTION_DESCRIPTIONS[group.section]);
    }
  });

  it("gives every section a description worth reading", () => {
    for (const section of Object.keys(SECTION_LABELS) as WidgetSection[]) {
      expect(SECTION_DESCRIPTIONS[section].length).toBeGreaterThan(30);
    }
  });
});

describe("the contents list", () => {
  const built = buildWidgets(activity, { includeExperimental: true });
  const groups = groupWidgets(built);

  it("offers exactly the sections that rendered", () => {
    const linked = groups.flatMap((group) => group.widgets.map((w) => w.widget.id));
    expect(linked).toEqual(built.map((item) => item.widget.id));
  });

  it("never links to a widget the data did not support", () => {
    const linked = new Set(groups.flatMap((g) => g.widgets.map((w) => w.widget.id)));
    expect(linked.has("cadence-summary")).toBe(true);
    expect(linked.has("run-summary")).toBe(true);
    // Nothing the file cannot support may be offered: this run is far too
    // short for the cards that compare its first quarter against its last.
    expect(linked.has("cardiac-durability")).toBe(false);
  });

  it("keeps each section contiguous, so contents order matches page order", () => {
    // A section appearing twice would mean the registry order and the grouping
    // disagree, which is what would put the contents out of step with the page.
    const sections = groups.map((group) => group.section);
    expect(new Set(sections).size).toBe(sections.length);
  });

  it("names every group", () => {
    for (const group of groups) {
      expect(group.label).toBe(SECTION_LABELS[group.section]);
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.widgets.length).toBeGreaterThan(0);
    }
  });

  it("renders", () => {
    const markup = renderToStaticMarkup(<TableOfContents groups={groups} />);
    expect(markup).toContain("Contents");
    expect(markup).toContain('href="#run-summary"');
    expect(markup).toContain("Heart rate");
  });
});


describe("experimental sections", () => {
  const stable = buildWidgets(activity);
  const all = buildWidgets(activity, { includeExperimental: true });

  it("are left out by default", () => {
    const ids = new Set(stable.map((item) => item.widget.id));
    expect(ids.has("power-story")).toBe(false);
    expect(ids.has("metric-relationships")).toBe(false);
    expect(stable.length).toBeLessThan(all.length);
  });

  it("appear once asked for, and are all marked beta", () => {
    const extra = all.filter(
      (item) => !stable.some((s) => s.widget.id === item.widget.id),
    );
    expect(extra.length).toBeGreaterThan(0);
    for (const item of extra) expect(item.widget.status).toBe("beta");
  });

  it("counts what this run could show", () => {
    expect(countExperimental(activity)).toBe(all.length - stable.length);
  });

  it("keeps the default page entirely stable", () => {
    for (const item of stable) expect(item.widget.status).toBe("stable");
  });

  it("does not reorder the stable sections when experimental ones appear", () => {
    const stableOrderWithin = all
      .filter((item) => item.widget.status === "stable")
      .map((item) => item.widget.id);
    expect(stableOrderWithin).toEqual(stable.map((item) => item.widget.id));
  });
});

