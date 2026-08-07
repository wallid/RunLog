import { useState } from "react";
import type { DerivedActivity } from "@/model/activity";
import type { WidgetGroup } from "@/widgets/buildWidgets";
import { useActivityStore } from "@/state/activityStore";
import { sendsCrashReports, useSettingsStore } from "@/state/settingsStore";
import { CRASH_REPORTING_AVAILABLE } from "@/observability/sentry";
import { TableOfContents } from "./TableOfContents";
import { FeedbackPanel } from "./FeedbackPanel";
import { useFeedbackStore } from "@/state/feedbackStore";
import { useTourStore } from "@/state/tourStore";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPaceWithUnit,
  formatTimeOfDay,
} from "@/lib/format";
import styles from "./RunHeader.module.css";

/** The masthead: what run this is, plus the settings that change what it shows. */
type Panel = "settings" | "contents" | "feedback";

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
  const feedbackCount = useFeedbackStore((state) => Object.keys(state.entries).length);
  const [openPanel, setOpenPanel] = useState<Panel | null>(null);

  const toggle = (panel: Panel) =>
    setOpenPanel((current) => (current === panel ? null : panel));

  return (
    <header className={styles.header}>
      <div className={`column ${styles.inner}`}>
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
          >
            Contents
          </button>
          {feedbackCount > 0 && (
            <button
              type="button"
              className={styles.action}
              onClick={() => toggle("feedback")}
              aria-expanded={openPanel === "feedback"}
            >
              Feedback
              <span className={styles.badge}>{feedbackCount}</span>
            </button>
          )}
          <button
            type="button"
            className={styles.action}
            onClick={() => toggle("settings")}
            aria-expanded={openPanel === "settings"}
            data-tour="settings"
          >
            Settings
          </button>
          <button type="button" className={styles.action} onClick={reset}>
            Load another run
          </button>
        </div>
      </div>

      {openPanel === "settings" && (
        <div className={`column ${styles.panel}`}>
          <MaxHeartRateSetting activity={activity} />
          <ExperimentalSetting count={experimentalCount} />
          <WeatherSetting activity={activity} />
          {/* Absent from a build with no crash-reporting DSN, where there is
              nothing to consent to. */}
          {CRASH_REPORTING_AVAILABLE && <CrashReportSetting />}
          <TourSetting onStart={() => setOpenPanel(null)} />
        </div>
      )}

      {openPanel === "feedback" && (
        <div className={`column ${styles.panel}`}>
          <FeedbackPanel onClose={() => setOpenPanel(null)} />
        </div>
      )}

      {openPanel === "contents" && (
        <div className={`column ${styles.panel}`}>
          <TableOfContents
            groups={groups}
            variant="panel"
            onNavigate={() => setOpenPanel(null)}
          />
        </div>
      )}
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
