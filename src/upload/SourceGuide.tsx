import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./DropZone.module.css";

/**
 * How to get the file out of wherever the run currently lives.
 *
 * This is the step that actually stops people, and it is different for every
 * app, so the answer is on the screen rather than in a README. Each route ends
 * at something this page can open directly — including the whole export zip,
 * which is why none of these say "then unzip it".
 *
 * The guide answers a second question the first version left out: not just
 * which button to press, but what you end up holding. A run exported as GPX
 * from one app and as FIT from another are not the same run here — half the
 * widgets need heart rate, and a widget whose metrics are missing is not
 * rendered at all. So every route states what comes across before it states
 * how, and where an app offers two routes the fuller one is listed first. That
 * ordering is the whole point of the section: the difference between the two
 * Strava paths is three sections of the page.
 *
 * The panel floats over the page rather than sitting in the flow. The earlier
 * version reserved a strip of empty space under the chips so that opening one
 * never shifted the cards above it, which worked but spent four rems of a
 * screen that is trying not to scroll on the panel being closed — its usual
 * state. Anchoring it instead costs nothing when closed and shifts nothing when
 * open. Below the breakpoint the page scrolls anyway, so it drops back into the
 * flow where a floating layer would only be in the way.
 *
 * Each chip carries a glyph so the row can be scanned for the right one rather
 * than read. They are drawn shapes rather than brand marks: what a reader needs
 * is five chips that look different from each other, and half of these
 * companies have a wordmark that would not survive being shrunk to 14 pixels
 * anyway.
 */

/**
 * The metrics worth promising, in the order the page uses them.
 *
 * These are the ones whose presence changes what the reader gets, which is why
 * elevation is not among them: it rides along with the track in every format
 * here, so saying so of each route in turn would be five rows of noise.
 */
type Carried = "route" | "pace" | "heart" | "cadence" | "power";

const CARRIED_LABELS: Record<Carried, string> = {
  route: "Route",
  pace: "Pace",
  heart: "Heart rate",
  cadence: "Cadence",
  power: "Power",
};

const CARRIED_ORDER: Carried[] = ["route", "pace", "heart", "cadence", "power"];

/** What a watch recorded and a FIT file keeps. */
const EVERYTHING: Carried[] = CARRIED_ORDER;

interface Route {
  id: string;
  /** Only shown when a source offers more than one; otherwise the panel is it. */
  label: string;
  steps: ReactNode[];
  /**
   * Left undefined where it genuinely depends on the app that wrote the file,
   * in which case the note has to carry it. A promise nobody can keep is worse
   * than no promise.
   */
  carries?: Carried[];
  note?: string;
}

interface Source {
  id: string;
  label: string;
  icon: ReactNode;
  /** Fullest first: the first route is the recommendation. */
  routes: Route[];
}

/** Apple Fitness: the activity rings. */
function RingsIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.sourceIcon} aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** Strava: the chevron its own mark is built from. */
function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.sourceIcon} aria-hidden="true">
      <path d="M8 1.6 3 11.2h3.1L8 7.4l1.9 3.8H13z" fill="currentColor" />
      <path d="M9.9 11.2 8 14.9l-1.9-3.7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Garmin: a squared-off GPS watch. */
function SquareWatchIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.sourceIcon} aria-hidden="true">
      <rect
        x="3.4"
        y="3.4"
        width="9.2"
        height="9.2"
        rx="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M6 1.4h4M6 14.6h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Coros: a round watch with its bezel. */
function RoundWatchIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.sourceIcon} aria-hidden="true">
      <circle cx="8" cy="8" r="4.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 5.4V8l1.9 1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M13.4 6.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Anything else: a file coming down out of an app. */
function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.sourceIcon} aria-hidden="true">
      <path
        d="M8 2v7.4M4.9 6.6 8 9.8l3.1-3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.6 11.6v1.2a1.4 1.4 0 0 0 1.4 1.4h8a1.4 1.4 0 0 0 1.4-1.4v-1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Exported for the tests, which check the claims rather than the markup. */
export const SOURCES: Source[] = [
  {
    id: "apple",
    label: "Apple Fitness",
    icon: <RingsIcon />,
    routes: [
      {
        id: "export",
        label: "Health export",
        steps: [
          <>
            Health → your picture, top right → <b>Export All Health Data</b>.
          </>,
          <>Share the zip to Files, then drop the whole zip in here.</>,
        ],
        carries: ["route", "pace"],
        note: "Apple files heart rate separately from the route, so an export carries the track and everything the page can work out from it — but nothing your watch measured. If the same run is on Strava or Garmin, it is worth more from there.",
      },
    ],
  },
  {
    id: "strava",
    label: "Strava",
    icon: <ChevronIcon />,
    routes: [
      {
        id: "one",
        label: "One run",
        steps: [
          <>
            Open the run → <b>···</b> → <b>Export Original</b>.
          </>,
          <>
            No Export Original? <b>Export GPX</b> is the fallback.
          </>,
        ],
        carries: EVERYTHING,
        note: "Export Original hands back the file your watch wrote, laps and pauses intact. A run recorded in the Strava app has no original to give, and its GPX is Strava's own retelling — same metrics, smoothed, without the laps.",
      },
      {
        id: "all",
        label: "Everything",
        steps: [
          <>
            Settings → My Account → <b>Download or Delete Your Account</b>.
          </>,
          <>Request your archive, then drop the whole zip in here.</>,
        ],
        carries: EVERYTHING,
        note: "The archive holds the original file for every run you ever uploaded, so it is the fullest thing Strava will give you. It arrives by email rather than straight away.",
      },
    ],
  },
  {
    id: "garmin",
    label: "Garmin",
    icon: <SquareWatchIcon />,
    routes: [
      {
        id: "original",
        label: "Original file",
        steps: [
          <>
            Garmin Connect → open the activity → the <b>gear icon</b>, top right.
          </>,
          <>
            <b>Export Original</b> gives the FIT file, exactly as the watch wrote it.
          </>,
        ],
        carries: EVERYTHING,
      },
    ],
  },
  {
    id: "coros",
    label: "Coros",
    icon: <RoundWatchIcon />,
    routes: [
      {
        id: "fit",
        label: "FIT file",
        steps: [
          <>
            train.coros.com → open the workout → <b>Download</b>.
          </>,
          <>
            Choose <b>FIT</b> rather than GPX — it is the full record.
          </>,
        ],
        carries: EVERYTHING,
      },
    ],
  },
  {
    id: "other",
    label: "Anything else",
    icon: <DownloadIcon />,
    routes: [
      {
        id: "any",
        label: "Any app",
        steps: [
          <>
            Look for <b>Export</b>, <b>Download</b> or <b>Share</b> on a single activity.
          </>,
          <>
            Take <b>FIT</b> over GPX wherever both are offered.
          </>,
        ],
        note: "FIT is the format watches actually write, so it carries heart rate, cadence and power. GPX always carries the route; whether anything else survives is up to the app that exported it.",
      },
    ],
  },
];

const PANEL_ID = "source-guide-panel";

export function SourceGuide() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  const open = SOURCES.find((source) => source.id === openId) ?? null;
  const route = open ? (open.routes.find((r) => r.id === routeId) ?? open.routes[0]) : null;

  const choose = (source: Source) => {
    setOpenId((current) => (current === source.id ? null : source.id));
    setRouteId(source.routes[0].id);
  };

  // A panel that floats over the page has to be dismissable the two ways every
  // floating panel is, or it reads as something that got stuck open.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!guideRef.current?.contains(event.target as Node)) setOpenId(null);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className={styles.guide} ref={guideRef}>
      <div className={styles.guideRow}>
        <span className={styles.guideLabel}>Where is your run?</span>
        {SOURCES.map((source) => (
          <button
            key={source.id}
            type="button"
            className={styles.sourceChip}
            aria-expanded={openId === source.id}
            aria-controls={PANEL_ID}
            onClick={() => choose(source)}
          >
            {source.icon}
            {source.label}
          </button>
        ))}
      </div>

      {open && route && (
        <div className={styles.panel} id={PANEL_ID}>
          {/* Only where there is a choice to make. One route needs no tabs, and
              a tab strip of one is a control that does nothing. */}
          {open.routes.length > 1 && (
            <div className={styles.routeTabs} role="group" aria-label="Which export to take">
              {open.routes.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={styles.routeTab}
                  aria-pressed={option.id === route.id}
                  onClick={() => setRouteId(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {route.carries && <Carries carries={route.carries} />}

          <ol className={styles.steps}>
            {route.steps.map((step, index) => (
              <li key={index} className={styles.step}>
                {step}
              </li>
            ))}
          </ol>

          {route.note && <p className={styles.guideNote}>{route.note}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * What this route gets you, and what it does not.
 *
 * The absent metrics are listed rather than omitted, because the reader is
 * choosing between routes and a list that only ever grows gives them nothing to
 * choose on. Struck-through is the visual, but it is not the message — the
 * parenthesis is, since a strikethrough is not announced by every screen
 * reader and colour alone is not a distinction at all.
 */
function Carries({ carries }: { carries: Carried[] }) {
  const has = new Set(carries);

  return (
    <ul className={styles.carries}>
      <li className={styles.carriesLabel} aria-hidden="true">
        Comes across
      </li>
      {CARRIED_ORDER.map((metric) => (
        <li key={metric} className={styles.carry} data-carried={has.has(metric)}>
          {CARRIED_LABELS[metric]}
          {!has.has(metric) && <span className={styles.srOnly}> (not included)</span>}
        </li>
      ))}
    </ul>
  );
}
