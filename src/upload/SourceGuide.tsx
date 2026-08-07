import { useState } from "react";
import styles from "./DropZone.module.css";

/**
 * How to get the file out of wherever the run currently lives.
 *
 * This is the step that actually stops people, and it is different for every
 * app, so the answer is on the screen rather than in a README. Each route ends
 * at something this page can open directly — including the whole export zip,
 * which is why none of these say "then unzip it".
 *
 * The steps swap in place rather than expanding the page, so the screen keeps
 * its shape whichever one is open.
 */

interface Source {
  id: string;
  label: string;
  steps: string[];
  note?: string;
}

const SOURCES: Source[] = [
  {
    id: "apple",
    label: "Apple Fitness",
    steps: [
      "Health app → your picture, top right → Export All Health Data.",
      "Share the zip to Files, then drop the whole zip in here.",
    ],
    note: "Every outdoor run in your history comes across as a route; pick the one you want from the list.",
  },
  {
    id: "strava",
    label: "Strava",
    steps: [
      "One run: open it → ··· → Export GPX.",
      "Everything: Settings → My Account → Download or Delete Your Account → Request your archive, then drop the zip in here.",
    ],
  },
  {
    id: "garmin",
    label: "Garmin",
    steps: [
      "Garmin Connect → open the activity → the gear icon, top right.",
      "Export Original gives the FIT file, which carries the most detail.",
    ],
  },
  {
    id: "coros",
    label: "Coros",
    steps: [
      "train.coros.com → open the workout → Download.",
      "Choose FIT for the full record, or GPX for the route.",
    ],
  },
  {
    id: "other",
    label: "Anything else",
    steps: [
      "Look for Export, Download or Share on a single activity.",
      "FIT is better than GPX where both are offered — it carries heart rate and cadence.",
    ],
  },
];

export function SourceGuide() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = SOURCES.find((source) => source.id === openId);

  return (
    <div className={styles.guide}>
      <div className={styles.guideRow}>
        <span className={styles.guideLabel}>Where is your run?</span>
        {SOURCES.map((source) => (
          <button
            key={source.id}
            type="button"
            className={styles.sourceChip}
            aria-pressed={openId === source.id}
            onClick={() => setOpenId((current) => (current === source.id ? null : source.id))}
          >
            {source.label}
          </button>
        ))}
      </div>

      {/* Reserved whether or not anything is open, so choosing a source does
          not shift the card above it. */}
      <div className={styles.guideSteps}>
        {open && (
          <>
            <ol className={styles.steps}>
              {open.steps.map((step, index) => (
                <li key={index} className={styles.step}>
                  {step}
                </li>
              ))}
            </ol>
            {open.note && <p className={styles.guideNote}>{open.note}</p>}
          </>
        )}
      </div>
    </div>
  );
}
