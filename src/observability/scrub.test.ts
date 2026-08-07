// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/react";
import { scrubEvent } from "./scrub";

/**
 * The scrubber is the whole privacy guarantee of crash reporting, and it fails
 * silently: a regression sends more than it should without anything breaking.
 * So it is tested directly, against the shapes Sentry actually produces.
 */

function eventWith(partial: Partial<ErrorEvent>): ErrorEvent {
  return { type: undefined, ...partial } as ErrorEvent;
}

describe("scrubEvent", () => {
  it("drops the user entirely", () => {
    const event = scrubEvent(
      eventWith({ user: { id: "abc", ip_address: "203.0.113.4" } }),
    );
    expect(event.user).toBeUndefined();
  });

  it("keeps the section anchor but not the query string", () => {
    const event = scrubEvent(
      eventWith({
        request: {
          url: `${location.origin}/index.html?file=Morning_Run.gpx#cadence-vs-pace`,
          headers: { Cookie: "session=1" },
        },
      }),
    );

    expect(event.request?.url).toBe(`${location.origin}/index.html#cadence-vs-pace`);
    expect(event.request?.headers).toBeUndefined();
  });

  it("reduces a map tile request to its host, because z/x/y is a location", () => {
    const event = scrubEvent(
      eventWith({
        breadcrumbs: [
          {
            category: "fetch",
            data: { url: "https://tile.openstreetmap.org/14/8210/5453.png" },
          },
        ],
      }),
    );

    expect(event.breadcrumbs?.[0].data?.url).toBe("https://tile.openstreetmap.org");
  });

  it("keeps the path of a same-origin request", () => {
    const event = scrubEvent(
      eventWith({
        breadcrumbs: [
          { category: "fetch", data: { url: `${location.origin}/demo/Lunch_Run.fit` } },
        ],
      }),
    );

    expect(event.breadcrumbs?.[0].data?.url).toBe(`${location.origin}/demo/Lunch_Run.fit`);
  });

  it("drops console breadcrumbs, which could carry anything the app logged", () => {
    const event = scrubEvent(
      eventWith({
        breadcrumbs: [
          { category: "console", message: "pace at 51.5074, -0.1278" },
          { category: "ui.click", message: "button.split" },
        ],
      }),
    );

    expect(event.breadcrumbs).toHaveLength(1);
    expect(event.breadcrumbs?.[0].category).toBe("ui.click");
  });

  it("strips the query from a navigation breadcrumb", () => {
    const event = scrubEvent(
      eventWith({
        breadcrumbs: [
          {
            category: "navigation",
            data: {
              from: `${location.origin}/?file=Home_Loop.gpx`,
              to: `${location.origin}/#splits`,
            },
          },
        ],
      }),
    );

    expect(event.breadcrumbs?.[0].data?.from).toBe(`${location.origin}/`);
    expect(event.breadcrumbs?.[0].data?.to).toBe(`${location.origin}/#splits`);
  });
});
