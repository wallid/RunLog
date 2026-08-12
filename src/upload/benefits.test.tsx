// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFit } from "@/parsers/fit/parseFit";
import { buildActivity } from "@/model/pipeline";
import { isWidgetSupported } from "@/widgets/contract";
import { BENEFITS } from "./Benefits";

/**
 * The landing page mounts real widgets against the bundled demo run, which is
 * the whole point of it — and also the whole risk. A widget that needs cadence,
 * or terrain, or a selection the landing page has no wiring for, computes
 * `null` and leaves a pulsing grey box where the evidence was meant to be. The
 * page would still build, still deploy, and still look broken to a first-time
 * visitor, which is the one reader who cannot tell a missing chart from a
 * product that does not work.
 *
 * So every card is checked against the same file the visitor's browser fetches:
 * it has to be supported, it has to compute something, and it has to render to
 * more than an empty shell.
 */

// Leaflet needs a live DOM with layout, which server rendering does not
// provide. The flythrough's own logic is exercised in its own test.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  useMap: () => ({ fitBounds: () => {} }),
}));

function loadDemoRun() {
  // `public/demo/Lunch_Run.fit` is a byte-identical copy of this fixture, so
  // what is asserted here is what the landing page actually draws.
  const buffer = readFileSync(resolve(__dirname, "../../fixtures/Lunch_Run.fit"));
  const raw = parseFit(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  return buildActivity(raw);
}

const activity = loadDemoRun();

describe("the landing page's benefit charts", () => {
  it("shows at least three", () => {
    expect(BENEFITS.length).toBeGreaterThanOrEqual(3);
  });

  it("gives every card a distinct id", () => {
    expect(new Set(BENEFITS.map((benefit) => benefit.id)).size).toBe(BENEFITS.length);
  });

  for (const benefit of BENEFITS) {
    describe(benefit.id, () => {
      it("is supported by the demo run", () => {
        expect(isWidgetSupported(benefit.widget, activity)).toBe(true);
      });

      it("computes a result and renders it", () => {
        const result = benefit.widget.compute(activity);
        expect(result).not.toBeNull();
        expect(result).not.toBeUndefined();

        const html = renderToStaticMarkup(
          <benefit.widget.View result={result as never} activity={activity} />,
        );
        expect(html.length).toBeGreaterThan(200);
      });

      it("carries copy for the claim beside it", () => {
        expect(benefit.eyebrow.length).toBeGreaterThan(0);
        expect(benefit.headline.length).toBeGreaterThan(0);
        expect(benefit.body.length).toBeGreaterThan(0);
      });
    });
  }

  /**
   * The one card that draws third-party tiles is the one card that must not
   * mount with the page. If another map-bearing widget is added here, this is
   * the test that should stop it.
   */
  it("defers every card that needs map tiles", () => {
    const mapCards = BENEFITS.filter((benefit) =>
      benefit.widget.requiredMetrics.includes("position"),
    );
    expect(mapCards.length).toBeGreaterThan(0);
    for (const card of mapCards) {
      expect(card.deferred).toBe(true);
    }
  });
});
