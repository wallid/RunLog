import { useState } from "react";
import {
  FEEDBACK_OPTIONS,
  feedbackAsMarkdown,
  useFeedbackStore,
  type FeedbackEntry,
} from "@/state/feedbackStore";
import styles from "./FeedbackPanel.module.css";

/**
 * Everything the reader has said about the page, in one place.
 *
 * There is nowhere to send this automatically, so the panel's real job is to
 * hand it back in a form that can be pasted into an issue. Copying is an
 * explicit action: feedback about a run stays as private as the run itself
 * until the reader decides otherwise.
 */
export function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const entries = useFeedbackStore((state) => state.entries);
  const remove = useFeedbackStore((state) => state.remove);
  const clear = useFeedbackStore((state) => state.clear);
  const [copied, setCopied] = useState(false);

  const list = Object.values(entries).sort((a, b) => a.widgetTitle.localeCompare(b.widgetTitle));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedbackAsMarkdown(list));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  if (list.length === 0) {
    return (
      <p className={styles.empty}>
        No feedback yet. Open the information button on any section to say how it is
        working.
      </p>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <p className={styles.title}>
          Your notes on {list.length} {list.length === 1 ? "section" : "sections"}
        </p>
        <div className={styles.headActions}>
          <button type="button" className={styles.copy} onClick={copy}>
            {copied ? "Copied" : "Copy as Markdown"}
          </button>
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              clear();
              onClose();
            }}
          >
            Clear all
          </button>
        </div>
      </div>

      <ul className={styles.list}>
        {list.map((entry) => (
          <li key={entry.widgetId} className={styles.entry}>
            <a className={styles.entryLink} href={`#${entry.widgetId}`} onClick={onClose}>
              {entry.widgetTitle}
            </a>
            <span className={styles.rating}>{ratingLabel(entry)}</span>
            {entry.note && <p className={styles.note}>{entry.note}</p>}
            <button
              type="button"
              className={styles.remove}
              onClick={() => remove(entry.widgetId)}
              aria-label={`Remove feedback on ${entry.widgetTitle}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <p className={styles.privacy}>
        Kept in this browser only. Copy it out to share it — nothing is sent anywhere.
      </p>
    </div>
  );
}

function ratingLabel(entry: FeedbackEntry): string {
  return (
    FEEDBACK_OPTIONS.find((option) => option.rating === entry.rating)?.label ?? entry.rating
  );
}
