import { useEffect, useState } from "react";
import type { DerivedActivity } from "@/model/activity";
import { buildActivity } from "@/model/pipeline";
import { parseFile } from "@/parsers";
import { useSettingsStore } from "@/state/settingsStore";

/**
 * The demo run, built standalone for the landing page's benefit cards.
 *
 * This does not go through `activityStore` — that store's status is what
 * decides whether the reader is looking at the upload screen or a run, and
 * loading a run into it here would turn the landing page into the thing it is
 * meant to be an advertisement for. So the same file is fetched and parsed a
 * second time, independently, the moment the landing page needs a chart to put
 * real numbers in. The result is cached at module scope: the cards on this
 * page all want it, and a second widget mounting a second after the first has
 * no reason to parse the file again.
 */

const DEMO_URL = `${import.meta.env.BASE_URL}demo/Lunch_Run.fit`;

let cached: Promise<DerivedActivity> | null = null;

function loadDemoActivity(): Promise<DerivedActivity> {
  if (!cached) {
    cached = (async () => {
      const response = await fetch(DEMO_URL);
      if (!response.ok) throw new Error("The demo run could not be downloaded.");
      const blob = await response.blob();
      const raw = await parseFile(blob, "Lunch_Run.fit");
      return buildActivity(raw, { maxHr: useSettingsStore.getState().maxHr });
    })().catch((error: unknown) => {
      // A failed fetch should not stick around as a rejected promise that
      // every later mount reuses — the next card gets to try again.
      cached = null;
      throw error;
    });
  }
  return cached;
}

export function useDemoActivity(): DerivedActivity | null {
  const [activity, setActivity] = useState<DerivedActivity | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDemoActivity().then(
      (result) => {
        if (!cancelled) setActivity(result);
      },
      () => {
        // Left null: a benefit card with no chart to show falls back to its
        // copy alone rather than showing an error nobody asked to see.
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return activity;
}
