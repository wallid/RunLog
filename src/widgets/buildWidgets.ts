import type { DerivedActivity } from "@/model/activity";
import { WIDGETS } from "./registry";
import {
  isWidgetSupported,
  SECTION_LABELS,
  type ErasedWidget,
  type Narration,
  type WidgetSection,
} from "./contract";

/**
 * Works out which widgets this activity actually supports.
 *
 * The page and the contents list both read from here, so the navigation can
 * never offer a link to a section that was not rendered.
 */

export interface RenderedWidget {
  widget: ErasedWidget;
  result: never;
  narration: Narration;
}

export interface WidgetGroup {
  section: WidgetSection;
  label: string;
  widgets: RenderedWidget[];
}

export interface BuildOptions {
  /** Include sections whose method is still being worked out. */
  includeExperimental?: boolean;
}

export function buildWidgets(
  activity: DerivedActivity,
  options: BuildOptions = {},
): RenderedWidget[] {
  const rendered: RenderedWidget[] = [];

  for (const widget of WIDGETS) {
    if (widget.status === "beta" && !options.includeExperimental) continue;
    if (!isWidgetSupported(widget, activity)) continue;

    let result: unknown;
    try {
      result = widget.compute(activity);
    } catch (error) {
      // One widget failing must not take the page down with it.
      console.error(`Widget "${widget.id}" failed to compute`, error);
      continue;
    }
    if (result === null || result === undefined) continue;

    try {
      rendered.push({
        widget,
        // Only the widget interprets its own result; the page passes it back.
        result: result as never,
        narration: widget.narrate(result, activity),
      });
    } catch (error) {
      console.error(`Widget "${widget.id}" failed to narrate`, error);
    }
  }

  return rendered;
}

/** How many experimental sections this run could show, whether enabled or not. */
export function countExperimental(activity: DerivedActivity): number {
  return WIDGETS.filter(
    (widget) =>
      widget.status === "beta" &&
      isWidgetSupported(widget, activity) &&
      safeCompute(widget, activity) !== null,
  ).length;
}

function safeCompute(
  widget: (typeof WIDGETS)[number],
  activity: DerivedActivity,
): unknown {
  try {
    return widget.compute(activity) ?? null;
  } catch {
    return null;
  }
}

/**
 * Groups the rendered widgets for the contents list.
 *
 * A new group starts whenever the section changes while walking the list in
 * page order, rather than by collecting every widget of a section together.
 * That keeps the contents in the same order as the page even if the registry
 * is later rearranged.
 */
export function groupWidgets(rendered: RenderedWidget[]): WidgetGroup[] {
  const groups: WidgetGroup[] = [];

  for (const item of rendered) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.widget.section) {
      last.widgets.push(item);
      continue;
    }
    groups.push({
      section: item.widget.section,
      label: SECTION_LABELS[item.widget.section],
      widgets: [item],
    });
  }

  return groups;
}
