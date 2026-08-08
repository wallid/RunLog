import { useEffect, useMemo, useState } from "react";
import type { DerivedActivity } from "@/model/activity";
import type { WidgetGroup } from "@/widgets/buildWidgets";
import { useActivityStore } from "@/state/activityStore";
import { useLibraryStore } from "@/state/libraryStore";
import { RunList } from "@/library/RunList";
import { sendsCrashReports, useSettingsStore } from "@/state/settingsStore";
import { CRASH_REPORTING_AVAILABLE } from "@/observability/sentry";
import { TableOfContents } from "./TableOfContents";
import { useScrollProgress } from "./useScrollProgress";
import { useHeaderHeight } from "./useHeaderHeight";
import { useTourStore } from "@/state/tourStore";
import { applyLanguage, type TranslateStatus } from "@/i18n/googleTranslate";
import { LANGUAGES, suggestedLanguage } from "@/i18n/languages";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPaceWithUnit,
  formatTimeOfDay,
} from "@/lib/format";
import styles from "./RunHeader.module.css";

/** The masthead: what run this is, plus the settings that change what it shows. */
type Panel = "settings" | "contents" | "library";

export function RunHeader({
  activity,
  groups,
  experimentalCount,
}: {
  activity: DerivedActivity;
  groups: WidgetGroup[];
  experimentalCount: number;
}) {
  const reset = useActivityStore((state) => state.reset);
  const openFromLibrary = useActivityStore((state) => state.openFromLibrary);
  const keptCount = useLibraryStore((state) => state.entries.length);
  const hasLibrary = useLibraryStore((state) => state.status === "ready") && keptCount > 0;
  const [openPanel, setOpenPanel] = useState<Panel | null>(null);
  const progressRef = useScrollProgress<HTMLSpanElement>();
  const innerRef = useHeaderHeight<HTMLDivElement>();

  const toggle = (panel: Panel) =>
    setOpenPanel((current) => (current === panel ? null : panel));

  // A panel opened from the masthead covers most of a phone screen, so there
  // has to be a way out that is not "find the button again". Escape is the one
  // every other dismissible thing on this page already uses.
  useEffect(() => {
    if (openPanel === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPanel(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openPanel]);

  return (
    <header className={styles.header}>
      <div className={`column ${styles.inner}`} ref={innerRef}>
        {/* The way back out. The wordmark is the one thing here that was also
            on the front door, so it is the button that returns there — a
            reader deep in a run's story otherwise has no way home that is not
            the browser's own. The run being left is not lost: the library
            keeps it a click away, and where there is no library this does no
            more than "Load another run" already offers. */}
        <button
          type="button"
          className={styles.home}
          onClick={reset}
          aria-label="Run Log — back to the home page"
        >
          <span className={styles.homeMark} aria-hidden="true" />
          <span className={styles.homeText}>Run Log</span>
        </button>

        <div className={styles.identity}>
          <h1 className={styles.title}>{activity.name ?? "Your run"}</h1>
          <p className={styles.meta}>
            {formatDate(activity.startedAt)} · {formatTimeOfDay(activity.startedAt)}
          </p>
        </div>

        <dl className={styles.figures}>
          <Figure label="Distance" value={formatDistance(activity.distanceM)} />
          <Figure label="Time" value={formatDuration(activity.elapsedS)} />
          <Figure
            label="Pace"
            value={formatPaceWithUnit(activity.summary.avgPaceSecPerKm)}
          />
        </dl>

        <div className={styles.actions}>
          {/* Only offered where the contents rail is hidden; on a wide screen
              the rail is already on the page. */}
          <button
            type="button"
            className={`${styles.action} ${styles.contentsAction}`}
            onClick={() => toggle("contents")}
            aria-expanded={openPanel === "contents"}
            aria-controls="header-panel"
          >
            Contents
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => toggle("settings")}
            aria-expanded={openPanel === "settings"}
            aria-controls="header-panel"
            data-tour="settings"
          >
            Settings
          </button>
          {/* A reader with runs kept here is switching between them far more
              often than they are starting over, so the button opens the list
              rather than emptying the page. With nothing kept — or nowhere to
              keep it — there is no list to open and it does what it always
              did. */}
          {hasLibrary ? (
            <button
              type="button"
              className={styles.action}
              onClick={() => toggle("library")}
              aria-expanded={openPanel === "library"}
              aria-controls="header-panel"
            >
              Your runs
            </button>
          ) : (
            <button type="button" className={styles.action} onClick={reset}>
              Load another run
            </button>
          )}
        </div>
      </div>

      {/* One region for both panels, because only one is ever open and both
          buttons point at it with `aria-controls`. */}
      {openPanel !== null && (
        <div id="header-panel" className={`column ${styles.panel}`}>
          {openPanel === "settings" ? (
            <>
              {/* First in the panel on purpose: the reader who needs it is the
                  one least able to read their way down to it. */}
              <LanguageSetting />
              <MaxHeartRateSetting activity={activity} />
              <ExperimentalSetting count={experimentalCount} />
              <WeatherSetting activity={activity} />
              {/* Absent from a build with no crash-reporting DSN, where there
                  is nothing to consent to. */}
              {CRASH_REPORTING_AVAILABLE && <CrashReportSetting />}
              <StoredRunsSetting />
              <TourSetting onStart={() => setOpenPanel(null)} />
            </>
          ) : openPanel === "library" ? (
            <>
              <RunList
                variant="panel"
                onOpen={(id) => {
                  setOpenPanel(null);
                  void openFromLibrary(id);
                }}
              />
              <div className={styles.settingsBlock}>
                <button type="button" className={styles.panelButton} onClick={reset}>
                  Load a different file
                </button>
                <p className={styles.settingsHelp}>
                  Adds to the list above. A run you open is kept here so it is one
                  click away next time.
                </p>
              </div>
            </>
          ) : (
            <TableOfContents
              groups={groups}
              variant="panel"
              onNavigate={() => setOpenPanel(null)}
            />
          )}
        </div>
      )}

      {/* How far through the story the reader is, along the masthead's own
          edge. It reports rather than instructs, so it says nothing aloud. */}
      <span className={styles.progress} aria-hidden="true">
        <span className={styles.progressFill} ref={progressRef} />
      </span>
    </header>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.figure}>
      <dt className={styles.figureLabel}>{label}</dt>
      <dd className={`${styles.figureValue} numeric`}>{value}</dd>
    </div>
  );
}

/**
 * Reading the page in another language.
 *
 * Everything else in Run Log is computed here; this is not. The page is handed
 * to Google's website translator, which is the only way one person can offer
 * fifty languages honestly — a hand-written translation of a page that argues
 * about confidence and thresholds would be wrong in forty-nine of them within a
 * release or two, and a translation nobody maintains is worse than none.
 *
 * So the trade is stated rather than hidden. Nothing loads until a language is
 * picked: no script sits in the HTML, and a reader who stays in English never
 * contacts Google at all. What goes over when they do pick one is the visible
 * text of the page, which includes the run's own name and the numbers written
 * into the sentences. The file itself never does.
 *
 * The names are listed in their own scripts first. A list that says "Arabic"
 * only in English is a list for people who can already read the page.
 */
function LanguageSetting() {
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const [status, setStatus] = useState<TranslateStatus>(
    language === undefined ? "off" : "on",
  );

  // Only worth computing once, and only to offer — never to select. See the
  // note on `language` in the settings store.
  const suggestion = useMemo(() => suggestedLanguage(), []);

  const choose = (code: string) => {
    const next = code === "" ? undefined : code;
    setLanguage(next);
    if (next === undefined) {
      setStatus("off");
      void applyLanguage(undefined);
      return;
    }
    setStatus("loading");
    applyLanguage(next).then(
      () => setStatus("on"),
      () => setStatus("failed"),
    );
  };

  return (
    <div className={styles.settingsBlock}>
      <label className={styles.settingsLabel} htmlFor="page-language">
        Language
      </label>
      <div className={styles.settingsRow}>
        <select
          id="page-language"
          className={styles.settingsSelect}
          value={language ?? ""}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="">English — as written</option>
          {LANGUAGES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.native} — {option.english}
            </option>
          ))}
        </select>
        {/* Offered only while the page is still English, and only when the
            browser says the reader would rather it were not. */}
        {language === undefined && suggestion && (
          <button
            type="button"
            className={styles.settingsReset}
            onClick={() => choose(suggestion.code)}
          >
            Switch to {suggestion.native}
          </button>
        )}
      </div>
      <p className={styles.settingsHelp} aria-live="polite">
        {status === "loading"
          ? "Loading the translator…"
          : status === "failed"
            ? "The translator could not be reached, so the page is still in English. It may be blocked by an extension or by your network."
            : language === undefined
              ? "The page is in English and nothing has been sent anywhere. Choosing a language loads Google Translate, which reads the text on this page — the headings, the observations, the run's own name — in order to translate it. Your activity file is not part of that and is never uploaded."
              : "Translated by Google. The text of this page goes to Google to be translated; your activity file does not, and is still read only in this browser. Machine translation gets things wrong, so where a number and its wording disagree, trust the number."}
      </p>
    </div>
  );
}

/**
 * The maximum heart rate the zones are built from.
 *
 * This is the only number on the page a runner has to supply, and it is worth
 * asking for: zone boundaries derived from a guess describe the guess more than
 * the run.
 */
function MaxHeartRateSetting({ activity }: { activity: DerivedActivity }) {
  const maxHr = useSettingsStore((state) => state.maxHr);
  const setMaxHr = useSettingsStore((state) => state.setMaxHr);
  const [draft, setDraft] = useState(String(maxHr ?? activity.maxHrUsed ?? ""));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(draft);
    if (Number.isFinite(value) && value >= 120 && value <= 230) setMaxHr(value);
  };

  return (
    <form className={styles.settingsForm} onSubmit={submit}>
      <label className={styles.settingsLabel} htmlFor="max-hr">
        Your maximum heart rate
      </label>
      <div className={styles.settingsRow}>
        <input
          id="max-hr"
          className={styles.settingsInput}
          type="number"
          min={120}
          max={230}
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <span className={styles.settingsUnit}>bpm</span>
        <button type="submit" className={styles.settingsSubmit}>
          Apply
        </button>
        {maxHr !== undefined && (
          <button
            type="button"
            className={styles.settingsReset}
            onClick={() => {
              setMaxHr(undefined);
              setDraft(String(activity.maxHrUsed ?? ""));
            }}
          >
            Use the estimate
          </button>
        )}
      </div>
      <p className={styles.settingsHelp}>
        {activity.maxHrIsEstimated
          ? `Currently using ${activity.maxHrUsed} bpm, estimated from this run's peak of ${Math.round(activity.summary.maxHr ?? 0)} bpm. A single run rarely reaches a true maximum, so this is a working figure rather than a measurement.`
          : `Zones are using your figure of ${activity.maxHrUsed} bpm.`}
      </p>
    </form>
  );
}

/**
 * The opt-in for sections whose method is still being worked out.
 *
 * They are off by default because a page that shows everything it can compute
 * asks the reader to work out which parts to trust. Turning them on is a
 * deliberate choice to see what the project is still exploring.
 */
function ExperimentalSetting({ count }: { count: number }) {
  const showExperimental = useSettingsStore((state) => state.showExperimental) ?? true;
  const setShowExperimental = useSettingsStore((state) => state.setShowExperimental);

  return (
    <div className={styles.settingsBlock}>
      <label className={styles.switchRow}>
        <input
          type="checkbox"
          className={styles.switchInput}
          checked={showExperimental}
          onChange={(event) => setShowExperimental(event.target.checked)}
        />
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchThumb} />
        </span>
        <span className={styles.settingsLabel}>Show experimental sections</span>
      </label>
      <p className={styles.settingsHelp}>
        {count > 0
          ? `${count} extra ${count === 1 ? "section is" : "sections are"} available for this run. Their thresholds are still being worked out, so they are marked Beta and worth reading with more caution.`
          : "No experimental sections apply to this run. When they do, they appear marked Beta."}
      </p>
    </div>
  );
}

/**
 * The only feature that discloses anything about where the runner was.
 *
 * It is off until switched on, which is the opposite of crash reporting and
 * deliberately so: a stack trace says nothing about a person, and a place and
 * a time say a great deal. The help text states exactly what is sent, because
 * a consent nobody can check is not consent. Coordinates are rounded to one
 * decimal before they leave — a cell about eleven kilometres across, which is
 * coarser than the weather grid, so the rounding costs nothing.
 */
function WeatherSetting({ activity }: { activity: DerivedActivity | null }) {
  const enabled = useSettingsStore((state) => state.weatherLookup) ?? false;
  const setWeatherLookup = useSettingsStore((state) => state.setWeatherLookup);
  const weather = activity?.weather;
  const hasPosition = activity?.availableMetrics.has("position") ?? false;

  return (
    <div className={styles.settingsBlock}>
      <label className={styles.switchRow}>
        <input
          type="checkbox"
          className={styles.switchInput}
          checked={enabled}
          onChange={(event) => setWeatherLookup(event.target.checked)}
        />
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchThumb} />
        </span>
        <span className={styles.settingsLabel}>Look up the weather for this run</span>
      </label>
      <p className={styles.settingsHelp}>
        {enabled
          ? weather
            ? `Sent ${weather.requestedLat.toFixed(1)}, ${weather.requestedLon.toFixed(1)} and the hour of the run to ${weather.provider} — a region about eleven kilometres across, not your route. Nothing else left the browser.`
            : hasPosition
              ? "The rounded coordinates and the hour of the run are sent to Open-Meteo. Your route, your file and every measurement in it stay on this machine."
              : "This run has no GPS, so there is nowhere to look up."
          : "Off. Everything stays on this machine. Switching it on sends a rounded position — about eleven kilometres across — and the hour you ran, so the page can tell you what the wind and heat were doing."}
      </p>
    </div>
  );
}

/**
 * What is being kept, and the way to stop keeping it.
 *
 * The page holds runs between visits now, which is a change to the promise the
 * upload screen makes and has to be answerable in the same place as every other
 * disclosure. So it states the count rather than the fact — "four runs" is
 * checkable and "your data is stored locally" is not — and the button beside it
 * removes them for good.
 *
 * It asks twice, because this is the one control on the page that destroys
 * something, and the thing it destroys is the reason a returning reader came
 * back. What it removes is this browser's copy; the files on disk are the
 * reader's own and are untouched.
 */
function StoredRunsSetting() {
  const status = useLibraryStore((state) => state.status);
  const count = useLibraryStore((state) => state.entries.length);
  const clearAll = useLibraryStore((state) => state.clearAll);
  const [confirming, setConfirming] = useState(false);

  if (status === "unavailable") return null;

  return (
    <div className={styles.settingsBlock}>
      <div className={styles.settingsRow}>
        {confirming ? (
          <>
            <button
              type="button"
              className={styles.panelButton}
              onClick={() => {
                setConfirming(false);
                void clearAll();
              }}
            >
              Yes, remove all {count}
            </button>
            <button
              type="button"
              className={styles.settingsReset}
              onClick={() => setConfirming(false)}
            >
              Keep them
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.panelButton}
            onClick={() => setConfirming(true)}
            disabled={count === 0}
          >
            Remove all stored runs
          </button>
        )}
      </div>
      <p className={styles.settingsHelp}>
        {count === 0
          ? "No runs are stored in this browser. A run you open is kept here, so it is one click away next time — never uploaded, and removable from this button."
          : `${count} ${count === 1 ? "run is" : "runs are"} stored in this browser and nowhere else. Removing them deletes this browser's copies; your own files are untouched.`}
      </p>
    </div>
  );
}

/**
 * The way back to the introduction.
 *
 * The tour runs itself once and then never again, which is only reasonable if
 * there is somewhere obvious to find it. The panel closes as it starts: the
 * last step points at the Settings button, and pointing at a button under an
 * open panel explains nothing.
 */
function TourSetting({ onStart }: { onStart: () => void }) {
  const start = useTourStore((state) => state.start);

  return (
    <div className={styles.settingsBlock}>
      <button
        type="button"
        className={styles.panelButton}
        onClick={() => {
          onStart();
          start();
        }}
      >
        Take the tour
      </button>
      <p className={styles.settingsHelp}>
        A short walk through the contents rail, the sections, and how every card
        is laid out. It runs by itself on a first visit; this is how to see it
        again.
      </p>
    </div>
  );
}

/**
 * The one thing on the page that talks to a server.
 *
 * It is on by default, which is a claim that has to be earned rather than
 * assumed: what leaves the browser is a stack trace and the browser version,
 * never a sample, a coordinate or a file name. Saying so here — next to the
 * switch, in the same words as the promise on the upload screen — is the point
 * of the setting. Turning it off applies immediately, not at the next reload.
 */
function CrashReportSetting() {
  const enabled = useSettingsStore(sendsCrashReports);
  const setCrashReports = useSettingsStore((state) => state.setCrashReports);

  return (
    <div className={styles.settingsBlock}>
      <label className={styles.switchRow}>
        <input
          type="checkbox"
          className={styles.switchInput}
          checked={enabled}
          onChange={(event) => setCrashReports(event.target.checked)}
        />
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchThumb} />
        </span>
        <span className={styles.settingsLabel}>Send anonymous crash reports</span>
      </label>
      <p className={styles.settingsHelp}>
        Your run is still read only in this browser and is never uploaded. If
        something breaks, this sends the error and the browser version so it can be
        fixed — no part of your activity file, no location, and nothing that
        identifies you.
      </p>
    </div>
  );
}
