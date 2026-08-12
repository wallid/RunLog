// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RawActivity, RawSample } from "@/parsers/types";
import type { DerivedActivity } from "@/model/activity";
import {
  CATEGORY_LABELS,
  EVENT_KINDS,
  type RunAnnotation,
} from "@/model/annotations";
import { buildActivity } from "@/model/pipeline";
import {
  EventEditor,
  type EventDraft,
  type EventEditorController,
} from "./EventEditor";

/**
 * The form under the timeline, drawn in each of the states it has.
 *
 * The controller is a plain object here rather than the hook, because what is
 * being checked is what the form shows for a given draft — and a draft on a
 * kind that asks for a figure is a different form from one that does not.
 */

function run(durationS: number): DerivedActivity {
  const start = new Date("2026-05-02T08:00:00Z");
  const samples: RawSample[] = [];
  for (let t = 0; t <= durationS; t++) {
    samples.push({
      time: new Date(start.getTime() + t * 1000),
      distanceM: t * 3,
      elevationM: 100,
      speedMps: 3,
      hrBpm: 150,
    });
  }
  const raw: RawActivity = {
    source: "fit",
    startedAt: start,
    samples,
    laps: [],
    timerEvents: [],
    warnings: [],
  };
  return buildActivity(raw);
}

const noop = () => undefined;

function controllerWith(draft: EventDraft | null): EventEditorController {
  return {
    draft,
    open: noop,
    close: noop,
    moveTo: noop,
    change: noop,
    typeDistance: noop,
  } as unknown as EventEditorController;
}

function draftOf(patch: Partial<EventDraft>): EventDraft {
  return { t: 600, kind: "gel", note: "", distanceText: "1.80", valueText: "", ...patch };
}

function markup(activity: DerivedActivity, draft: EventDraft | null): string {
  return renderToStaticMarkup(
    <EventEditor activity={activity} controller={controllerWith(draft)} />,
  );
}

describe("the catalogue the form offers", () => {
  it("offers every kind there is", () => {
    // The categories are listed in reading order by hand, so a kind in a
    // category nobody added to that list would be unreachable — which is
    // exactly what happened the first time a Tests kind was added.
    const html = markup(run(1200), draftOf({}));
    for (const spec of EVENT_KINDS) expect(html).toContain(spec.label);
    for (const category of new Set(EVENT_KINDS.map((spec) => spec.category))) {
      expect(html).toContain(CATEGORY_LABELS[category]);
    }
  });
});

describe("the form for a kind that asks for a figure", () => {
  it("asks for it, in its own unit", () => {
    const html = markup(run(1200), draftOf({ kind: "lactate" }));
    expect(html).toContain("Blood lactate (mmol/L)");
    expect(html).toContain("e.g. 3.8");
  });

  it("does not ask an ordinary event for one", () => {
    const html = markup(run(1200), draftOf({ kind: "gel" }));
    expect(html).not.toContain("mmol/L");
  });

  it("refuses to save a reading with nothing readable typed, and says why", () => {
    const html = markup(run(1200), draftOf({ kind: "lactate", valueText: "" }));
    expect(html).toContain("needs its figure");
    expect(html).toContain("disabled");
  });

  it("refuses a figure outside what a meter could read", () => {
    const html = markup(run(1200), draftOf({ kind: "lactate", valueText: "380" }));
    expect(html).toContain("disabled");
  });

  it("saves once the figure is there", () => {
    const html = markup(run(1200), draftOf({ kind: "lactate", valueText: "3.8" }));
    expect(html).not.toContain("needs its figure");
    expect(html).not.toContain("disabled");
  });
});

describe("the list of what is already on the run", () => {
  it("shows a reading's figure next to its kind", () => {
    const activity = run(1200);
    const annotations: RunAnnotation[] = [
      {
        id: "r1",
        t: 600,
        kind: "lactate",
        value: 3.8,
        createdAt: "2026-05-02T09:00:00.000Z",
      },
    ];
    const html = markup({ ...activity, annotations }, null);
    expect(html).toContain("Blood lactate");
    expect(html).toContain("3.8 mmol/L");
  });
});
