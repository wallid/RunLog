import { useMemo, useState } from "react";
import { useLibraryStore } from "@/state/libraryStore";
import { formatDistance, formatDuration } from "@/lib/format";
import type { RunSummary } from "./db";
import styles from "./RunList.module.css";

/**
 * The runs kept in this browser.
 *
 * Shown in two places and identical in both: on the way in, where it is the
 * reason not to go looking for the export zip again, and inside the masthead,
 * where it is how a reader moves from one run to the next without leaving the
 * page they are reading.
 *
 * Every row carries a way to remove it, and the list carries a way to remove
 * all of them. That is not a courtesy — these are files out of a runner's own
 * archive, kept on the strength of a promise that they can be taken back, and a
 * promise with no button behind it is a claim.
 *
 * Deleting asks once. A misplaced click costs a file the reader still has on
 * disk, so the confirmation is a second press on the same row rather than a
 * dialogue in front of the page.
 */

/** Below this the list is short enough to read; above it, searching is faster. */
const SEARCHABLE_FROM = 8;

export function RunList({
  variant,
  onOpen,
}: {
  variant: "landing" | "panel";
  onOpen: (id: string) => void;
}) {
  const entries = useLibraryStore((state) => state.entries);
  const lastOpenedId = useLibraryStore((state) => state.lastOpenedId);
  const importing = useLibraryStore((state) => state.importing);
  const saveNotice = useLibraryStore((state) => state.saveNotice);
  const cancelImport = useLibraryStore((state) => state.cancelImport);
  const remove = useLibraryStore((state) => state.remove);
  const clearAll = useLibraryStore((state) => state.clearAll);

  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        entry.fileName.toLowerCase().includes(needle) ||
        dateOf(entry).toLowerCase().includes(needle),
    );
  }, [entries, query]);

  return (
    <div className={styles.list} data-variant={variant}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          {entries.length} {entries.length === 1 ? "run" : "runs"} kept here
        </h2>
        <p className={styles.hint}>Stored in this browser only. Remove any of them below.</p>
      </div>

      {importing && (
        <p className={styles.progress} role="status">
          Reading run {importing.done} of {importing.total}
          <button type="button" className={styles.quiet} onClick={cancelImport}>
            Stop
          </button>
        </p>
      )}

      {saveNotice && <p className={styles.notice}>{saveNotice}</p>}

      {entries.length >= SEARCHABLE_FROM && (
        <input
          type="search"
          className={styles.search}
          placeholder="Find a date"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Find a kept run by date or name"
        />
      )}

      <ul className={styles.items}>
        {shown.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <button type="button" className={styles.open} onClick={() => onOpen(entry.id)}>
              <span className={styles.itemName}>
                {entry.name}
                {entry.id === lastOpenedId && (
                  <span className={styles.badge}>Last opened</span>
                )}
              </span>
              <span className={styles.itemMeta}>
                {dateOf(entry)} · {formatDistance(entry.distanceM)} ·{" "}
                {formatDuration(entry.elapsedS)}
              </span>
            </button>

            {confirming === entry.id ? (
              <span className={styles.confirm}>
                <button
                  type="button"
                  className={styles.destructive}
                  onClick={() => {
                    setConfirming(null);
                    void remove(entry.id);
                  }}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => setConfirming(null)}
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={styles.remove}
                onClick={() => setConfirming(entry.id)}
                aria-label={`Remove ${entry.name} from this browser`}
              >
                ×
              </button>
            )}
          </li>
        ))}
        {shown.length === 0 && (
          <li className={styles.empty}>Nothing kept here matches that.</li>
        )}
      </ul>

      <div className={styles.actions}>
        {confirmingAll ? (
          <>
            <button
              type="button"
              className={styles.destructive}
              onClick={() => {
                setConfirmingAll(false);
                void clearAll();
              }}
            >
              Remove all {entries.length}
            </button>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => setConfirmingAll(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.quiet}
            onClick={() => setConfirmingAll(true)}
          >
            Remove all runs
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The day it happened.
 *
 * Shorter than the masthead's date: a list of forty runs is scanned rather than
 * read, and the weekday in each row is forty words nobody needed.
 */
function dateOf(entry: RunSummary): string {
  return new Date(entry.startedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
