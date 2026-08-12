import { useEffect, useMemo } from "react";
import { useActivityStore } from "./state/activityStore";
import { useAnnotationStore } from "./state/annotationStore";
import { useLibraryStore } from "./state/libraryStore";
import { useSettingsStore } from "./state/settingsStore";
import { DropZone } from "./upload/DropZone";
import { StoryPage } from "./widgets/StoryPage";
import { buildWidgets, countExperimental, groupWidgets } from "./widgets/buildWidgets";
import { RunHeader } from "./shell/RunHeader";
import { TableOfContents } from "./shell/TableOfContents";
import { Tour } from "./tour/Tour";
import { CONTACT_EMAIL, contactHref } from "./contact";
import { SUPPORT_URL } from "./support";
import { DISCLAIMER } from "./disclaimer";
import styles from "./App.module.css";

export function App() {
  const status = useActivityStore((state) => state.status);
  const activity = useActivityStore((state) => state.activity);
  const rebuild = useActivityStore((state) => state.rebuild);
  const maxHr = useSettingsStore((state) => state.maxHr);
  const initLibrary = useLibraryStore((state) => state.init);

  // What is already kept in this browser, read once. The upload screen needs
  // the answer before it can decide whether it is a landing page or a list.
  useEffect(() => {
    void initLibrary();
  }, [initLibrary]);

  // Switching runs leaves the reader wherever they were in the last one,
  // partway down a story that no longer exists.
  const runId = activity?.id;
  useEffect(() => {
    if (runId) window.scrollTo(0, 0);
  }, [runId]);

  // Changing the maximum heart rate changes every zone on the page, so the
  // model is rebuilt rather than patched.
  useEffect(() => {
    rebuild(maxHr);
  }, [maxHr, rebuild]);

  const weatherLookup = useSettingsStore((state) => state.weatherLookup);
  const loadWeather = useActivityStore((state) => state.loadWeather);

  // Runs when a run arrives and when the setting is switched on for a run
  // already open. The store declines if it has already asked, so switching the
  // setting off and on again does not send a second request.
  useEffect(() => {
    if (weatherLookup) void loadWeather();
  }, [weatherLookup, loadWeather, activity?.id]);

  // Any events the reader added to this run in an earlier visit are put back
  // on it. Watches the whole activity rather than its id, because a rebuild or
  // a re-open replaces the object without changing the id; `attach` bails when
  // the annotations are already on, so this never loops.
  useEffect(() => {
    if (activity) useAnnotationStore.getState().attach(activity.id);
  }, [activity]);

  // Undecided means shown: see the note on `showExperimental` in the store.
  const showExperimental = useSettingsStore((state) => state.showExperimental) ?? true;

  const widgets = useMemo(
    () =>
      activity
        ? buildWidgets(activity, { includeExperimental: showExperimental })
        : [],
    [activity, showExperimental],
  );
  const groups = useMemo(() => groupWidgets(widgets), [widgets]);
  const experimentalCount = useMemo(
    () => (activity ? countExperimental(activity) : 0),
    [activity],
  );

  // The upload screen is a landing page rather than a document: it brings its
  // own full-height layout, and everything needed to start fits one screen —
  // the benefit charts and the proof strip hang below the fold, for a reader
  // who scrolls to see more before deciding.
  if (status !== "ready" || !activity) {
    return <DropZone />;
  }

  return (
    <div className={styles.app}>
      {/* The masthead carries four controls and the rail carries twenty links,
          so a keyboard reader would otherwise tab through the whole apparatus
          before reaching a word of the run. Visible as soon as it is focused,
          and out of the way until then. */}
      <a href="#run-story" className={styles.skipLink}>
        Skip to the run
      </a>

      <RunHeader
        activity={activity}
        groups={groups}
        experimentalCount={experimentalCount}
      />

      {/* Keyed by the run, so switching to another one builds a new story
          rather than reusing the last one's nodes. The reveal each card does on
          first sight latches and never replays, so without this a reader
          arriving at their second run would find every card already shown. */}
      <div className={styles.layout} key={activity.id}>
        <aside className={styles.rail}>
          <TableOfContents groups={groups} />
        </aside>

        <main id="run-story" className={styles.main} tabIndex={-1}>
          <StoryPage activity={activity} groups={groups} />
        </main>
      </div>

      <Footer />

      {/* Mounted only once a run is on screen, because there is nothing to
          explain on the upload page. */}
      <Tour />
    </div>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="column">
        <p>
          Run Log is open source and runs entirely in your browser. Map data ©
          OpenStreetMap contributors.
        </p>
        <p className={styles.disclaimer}>{DISCLAIMER}</p>
        <p className={styles.contact}>
          Something wrong or confusing?{" "}
          <a href={contactHref()}>{CONTACT_EMAIL}</a>
        </p>
        {/* Asked once, at the bottom, after the run has been read — the page
            is free and stays free either way, and a reader who has scrolled
            this far has already had the thing they came for. */}
        <p className={styles.support}>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer noopener">
            Buy me a coffee ☕
          </a>{" "}
          if this was useful.
        </p>
      </div>
    </footer>
  );
}
