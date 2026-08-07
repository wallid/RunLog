import { useMemo, useState } from "react";
import { useActivityStore } from "@/state/activityStore";
import styles from "./DropZone.module.css";

/**
 * Choosing one run out of an export.
 *
 * A Health export is every outdoor workout a phone has ever recorded, so the
 * list has to be searchable rather than merely scrollable. Apple names each
 * route after the day it happened, which is the one thing a reader can pick
 * from, so the date is lifted out of the file name where there is one to lift.
 */

/** `route_2024-03-16_7.42am.gpx`, and the plainer variants of it. */
const DATE_IN_NAME = /(\d{4})-(\d{2})-(\d{2})/;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function ArchivePicker({ onPickAnother }: { onPickAnother: () => void }) {
  const choices = useActivityStore((state) => state.choices);
  const chooseEntry = useActivityStore((state) => state.chooseEntry);
  const reset = useActivityStore((state) => state.reset);
  const [query, setQuery] = useState("");

  const runs = useMemo(
    () =>
      (choices ?? []).map((entry) => ({
        path: entry.path,
        name: entry.name,
        label: labelFor(entry.name),
      })),
    [choices],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter(
      (run) =>
        run.label.toLowerCase().includes(needle) ||
        run.name.toLowerCase().includes(needle),
    );
  }, [runs, query]);

  return (
    <div className={styles.picker}>
      <div className={styles.pickerHead}>
        <h2 className={styles.pickerTitle}>
          {runs.length} runs in that export
        </h2>
        <p className={styles.pickerHint}>Pick the one you want to read.</p>
      </div>

      {runs.length > 8 && (
        <input
          type="search"
          className={styles.search}
          placeholder="Find a date"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Find a run by date or file name"
        />
      )}

      <ul className={styles.pickerList}>
        {shown.map((run) => (
          <li key={run.path}>
            <button
              type="button"
              className={styles.pickerItem}
              onClick={() => void chooseEntry(run.path)}
            >
              <span className={styles.pickerItemLabel}>{run.label}</span>
              <span className={styles.pickerItemName}>{run.name}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className={styles.pickerEmpty}>Nothing in the export matches that.</li>
        )}
      </ul>

      <div className={styles.pickerActions}>
        <button type="button" className={styles.secondary} onClick={onPickAnother}>
          Use a different file
        </button>
        <button type="button" className={styles.secondary} onClick={reset}>
          Start over
        </button>
      </div>
    </div>
  );
}

/** The day the run happened, where the file name gives it up. */
function labelFor(name: string): string {
  const match = DATE_IN_NAME.exec(name);
  if (!match) return name.replace(/\.(fit|gpx)(\.gz)?$/i, "");
  const [, year, month, day] = match;
  const index = Number(month) - 1;
  if (index < 0 || index > 11) return name;
  return `${Number(day)} ${MONTHS[index]} ${year}`;
}
