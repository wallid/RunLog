import { useEffect, useMemo } from "react";
import { useActivityStore } from "./state/activityStore";
import { useSettingsStore } from "./state/settingsStore";
import { DropZone } from "./upload/DropZone";
import { StoryPage } from "./widgets/StoryPage";
import { buildWidgets, countExperimental, groupWidgets } from "./widgets/buildWidgets";
import { RunHeader } from "./shell/RunHeader";
import { TableOfContents } from "./shell/TableOfContents";
import { Tour } from "./tour/Tour";
import styles from "./App.module.css";

export function App() {
  const status = useActivityStore((state) => state.status);
  const activity = useActivityStore((state) => state.activity);
  const rebuild = useActivityStore((state) => state.rebuild);
  const maxHr = useSettingsStore((state) => state.maxHr);

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
  // own full-height layout and carries no footer, so it fits one screen.
  if (status !== "ready" || !activity) {
    return <DropZone />;
  }

  return (
    <div className={styles.app}>
      <RunHeader
        activity={activity}
        groups={groups}
        experimentalCount={experimentalCount}
      />

      <div className={styles.layout}>
        <aside className={styles.rail}>
          <TableOfContents groups={groups} />
        </aside>

        <main className={styles.main}>
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
          Run Story is open source and runs entirely in your browser. Map data ©
          OpenStreetMap contributors.
        </p>
      </div>
    </footer>
  );
}
