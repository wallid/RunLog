import { useEffect, useState } from "react";
import { FEEDBACK_OPTIONS, useFeedbackStore } from "@/state/feedbackStore";
import styles from "./FeedbackControl.module.css";

/**
 * Asking whether a section earned its place.
 *
 * This lives on the back of the card rather than the front: it is a question
 * about the page, not a part of the run, and putting it under every chart would
 * be exactly the clutter the flip is meant to remove.
 */
export function FeedbackControl({
  widgetId,
  widgetTitle,
}: {
  widgetId: string;
  widgetTitle: string;
}) {
  const entry = useFeedbackStore((state) => state.entries[widgetId]);
  const setRating = useFeedbackStore((state) => state.setRating);
  const setNote = useFeedbackStore((state) => state.setNote);

  const [draft, setDraft] = useState(entry?.note ?? "");
  const [noteOpen, setNoteOpen] = useState(Boolean(entry?.note));

  // Keep the box in step when feedback is cleared from the header panel.
  useEffect(() => {
    setDraft(entry?.note ?? "");
    if (!entry?.note) setNoteOpen(false);
  }, [entry?.note]);

  return (
    <div className={styles.feedback}>
      <p className={styles.prompt}>How is this section?</p>

      <div className={styles.chips} role="group" aria-label={`Feedback on ${widgetTitle}`}>
        {FEEDBACK_OPTIONS.map((option) => {
          const active = entry?.rating === option.rating;
          return (
            <button
              key={option.rating}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              onClick={() => setRating(widgetId, widgetTitle, option.rating)}
              aria-pressed={active}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {noteOpen ? (
        <div className={styles.noteRow}>
          <textarea
            className={styles.note}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setNote(widgetId, widgetTitle, draft)}
            placeholder="What would make this better?"
            rows={2}
            aria-label={`Note about ${widgetTitle}`}
          />
        </div>
      ) : (
        <button
          type="button"
          className={styles.addNote}
          onClick={() => setNoteOpen(true)}
        >
          Add a note
        </button>
      )}

      {entry && (
        <p className={styles.saved}>
          Saved in this browser. Collect everything from{" "}
          <strong>Feedback</strong> at the top of the page.
        </p>
      )}
    </div>
  );
}
