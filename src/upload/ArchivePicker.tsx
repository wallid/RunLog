import { useMemo, useState } from "react";
import { useActivityStore } from "@/state/activityStore";
import { useLibraryStore } from "@/state/libraryStore";
import { labelFor } from "@/library/label";
import styles from "./DropZone.module.css";

/**
 * Choosing one run out of an export.
 *
 * A Health export is every outdoor workout a phone has ever recorded, so the
 * list has to be searchable rather than merely scrollable. Apple names each
 * route after the day it happened, which is the one thing a reader can pick
 * from, so the date is lifted out of the file name where there is one to lift.
 *
 * Picking one run stays the fast way in: it decompresses exactly that entry and
 * asks nothing of the other four hundred. Keeping the whole export is offered
 * beside it rather than instead of it, because it has to read every run in the
 * archive and that is a wait worth choosing rather than being given.
 */

export function ArchivePicker({ onPickAnother }: { onPickAnother: () => void }) {
  const choices = useActivityStore((state) => state.choices);
  const chooseEntry = useActivityStore((state) => state.chooseEntry);
  const reset = useActivityStore((state) => state.reset);
  const libraryStatus = useLibraryStore((state) => state.status);
  const importing = useLibraryStore((state) => state.importing);
  const importAll = useLibraryStore((state) => state.importAll);
  const cancelImport = useLibraryStore((state) => state.cancelImport);
  const saveNotice = useLibraryStore((state) => state.saveNotice);
  const [query, setQuery] = useState("");

  const canKeep = libraryStatus === "ready" || libraryStatus === "loading";

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
        <p className={styles.pickerHint}>
          {canKeep
            ? "Pick the one you want to read, or keep them all for later."
            : "Pick the one you want to read."}
        </p>
      </div>

      {/* While it runs, where it has got to; once it stops, what it did. The
          second half matters as much as the first: a finished import that says
          nothing looks exactly like one that never started. */}
      {(importing || saveNotice) && (
        <p className={styles.pickerHint} role="status">
          {importing
            ? `Reading run ${importing.done} of ${importing.total}`
            : saveNotice}
        </p>
      )}

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
        {canKeep && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void importAll(choices ?? [])}
            disabled={importing !== null}
          >
            {importing
              ? `Keeping ${importing.done} of ${importing.total}…`
              : `Keep all ${runs.length} runs`}
          </button>
        )}
        {importing ? (
          <button type="button" className={styles.secondary} onClick={cancelImport}>
            Stop
          </button>
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={onPickAnother}>
              Use a different file
            </button>
            <button type="button" className={styles.secondary} onClick={reset}>
              Start over
            </button>
          </>
        )}
      </div>
    </div>
  );
}
