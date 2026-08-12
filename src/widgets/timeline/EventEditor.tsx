import { useState } from "react";
import { distanceAtTime, timeAtDistance, type DerivedActivity } from "@/model/activity";
import {
  CATEGORY_LABELS,
  EVENT_KINDS,
  MAX_NOTE_LENGTH,
  kindSpec,
  sanitizeMeasurement,
  type EventCategory,
} from "@/model/annotations";
import { useAnnotationStore } from "@/state/annotationStore";
import { formatDistanceShort, formatDuration } from "@/lib/format";
import styles from "./EventEditor.module.css";

/**
 * Where a reader tells the page what the watch could not know.
 *
 * It lives under the timeline rather than in the masthead because the position
 * is half of what is being entered: the chart the event is placed on is the
 * chart it should be placed from. Opening the form is the only mode — while it
 * is open, tapping the timeline moves the event, and while it is closed the
 * timeline behaves exactly as it always has.
 *
 * Nothing is written until Save, so typing a note does not recompute forty
 * cards a keystroke at a time.
 */

export interface EventDraft {
  /** Present when an existing event is being changed rather than added. */
  editing?: string;
  t: number;
  kind: string;
  note: string;
  /**
   * The distance field as typed. Kept apart from `t` because deriving the text
   * back from the time would rewrite "1" as "1.00" under the reader's cursor.
   */
  distanceText: string;
  /** The measurement as typed, for the kinds that ask for one. */
  valueText: string;
}

/** Opens, moves and closes the draft; owned by the timeline so the track can move it. */
export function useEventEditor(activity: DerivedActivity) {
  const [draft, setDraft] = useState<EventDraft | null>(null);

  const clamp = (t: number): number =>
    Math.max(0, Math.min(activity.elapsedS, Math.round(t)));

  const atTime = (t: number): Pick<EventDraft, "t" | "distanceText"> => {
    const bounded = clamp(t);
    return {
      t: bounded,
      distanceText: (distanceAtTime(activity, bounded) / 1000).toFixed(2),
    };
  };

  return {
    draft,
    /** Starts a new event, or reopens one already saved. */
    open: (
      t: number,
      existing?: { id: string; kind: string; note?: string; value?: number },
    ) =>
      setDraft({
        ...atTime(t),
        kind: existing?.kind ?? "gel",
        note: existing?.note ?? "",
        valueText: existing?.value !== undefined ? String(existing.value) : "",
        editing: existing?.id,
      }),
    close: () => setDraft(null),
    /** Called when the reader taps the timeline while the form is open. */
    moveTo: (t: number) =>
      setDraft((current) => (current ? { ...current, ...atTime(t) } : current)),
    change: (patch: Partial<EventDraft>) =>
      setDraft((current) => (current ? { ...current, ...patch } : current)),
    /** Reads a typed distance in kilometres back into a position. */
    typeDistance: (text: string) => {
      const km = Number.parseFloat(text);
      setDraft((current) => {
        if (!current) return current;
        if (!Number.isFinite(km) || km < 0) return { ...current, distanceText: text };
        const t = clamp(timeAtDistance(activity, km * 1000));
        return { ...current, t, distanceText: text };
      });
    },
  };
}

export type EventEditorController = ReturnType<typeof useEventEditor>;

export function EventEditor({
  activity,
  controller,
}: {
  activity: DerivedActivity;
  controller: EventEditorController;
}) {
  const annotations = activity.annotations ?? [];
  const add = useAnnotationStore((state) => state.add);
  const update = useAnnotationStore((state) => state.update);
  const remove = useAnnotationStore((state) => state.remove);
  const { draft, open, close, change, typeDistance } = controller;

  const measure = draft ? kindSpec(draft.kind)?.measure : undefined;
  const value = draft
    ? sanitizeMeasurement(draft.kind, Number.parseFloat(draft.valueText))
    : undefined;
  // A reading is its number, so a measured kind with nothing readable typed is
  // not saveable. Everything else saves as it always did.
  const saveable = measure === undefined || value !== undefined;

  const save = () => {
    if (!draft || !saveable) return;
    if (draft.editing) {
      update(activity.id, draft.editing, {
        t: draft.t,
        kind: draft.kind,
        note: draft.note,
        value,
      });
    } else {
      add(activity.id, {
        t: draft.t,
        kind: draft.kind,
        note: draft.note,
        value,
      });
    }
    close();
  };

  return (
    <section className={styles.editor} aria-label="Your own events">
      <div className={styles.head}>
        <h4 className={styles.title}>Your own events</h4>
        {draft === null && (
          <button
            type="button"
            className={styles.add}
            onClick={() => open(midpointOf(activity))}
          >
            Add an event
          </button>
        )}
      </div>

      {annotations.length === 0 && draft === null && (
        <p className={styles.empty}>
          A gel, a drink, a cramp, a stop to fix a shoe, a lactate reading off a
          meter — anything the watch did not record. Added events are marked on
          the charts, the fuelling ones are compared against the running either
          side of them, and the readings are read against the running that led
          up to them.
        </p>
      )}

      {annotations.length > 0 && (
        <ul className={styles.chips}>
          {annotations.map((annotation) => (
            <li key={annotation.id} className={styles.chip}>
              <button
                type="button"
                className={styles.chipOpen}
                onClick={() => open(annotation.t, annotation)}
              >
                <span className={styles.chipKind}>
                  {kindSpec(annotation.kind)?.label ?? "Event"}
                </span>
                {annotation.value !== undefined && (
                  <span className={`${styles.chipValue} numeric`}>
                    {annotation.value} {kindSpec(annotation.kind)?.measure?.unit}
                  </span>
                )}
                <span className={`${styles.chipWhere} numeric`}>
                  {formatDistanceShort(distanceAtTime(activity, annotation.t))}
                </span>
                {annotation.note && (
                  <span className={styles.chipNote}>{annotation.note}</span>
                )}
              </button>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => remove(activity.id, annotation.id)}
                aria-label={`Remove the ${kindSpec(annotation.kind)?.label ?? "event"} at ${formatDistanceShort(distanceAtTime(activity, annotation.t))}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft !== null && (
        <div className={styles.form}>
          <p className={styles.hint}>
            Tap the timeline above to move it, or type where it happened.
          </p>

          <fieldset className={styles.kinds}>
            <legend className={styles.legendLabel}>What was it</legend>
            {groupedKinds().map(([category, kinds]) => (
              <div key={category} className={styles.kindGroup}>
                <span className={styles.kindGroupLabel}>
                  {CATEGORY_LABELS[category]}
                </span>
                <div className={styles.kindRow}>
                  {kinds.map((spec) => (
                    <button
                      key={spec.kind}
                      type="button"
                      className={
                        draft.kind === spec.kind ? styles.kindActive : styles.kind
                      }
                      aria-pressed={draft.kind === spec.kind}
                      onClick={() => change({ kind: spec.kind })}
                    >
                      {spec.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <div className={styles.fields}>
            {measure !== undefined && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {measure.label} ({measure.unit})
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={measure.min}
                  max={measure.max}
                  step={measure.step}
                  required
                  className={`${styles.input} numeric`}
                  placeholder={measure.placeholder}
                  value={draft.valueText}
                  onChange={(event) => change({ valueText: event.target.value })}
                />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Distance (km)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                className={`${styles.input} numeric`}
                value={draft.distanceText}
                onChange={(event) => typeDistance(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Note (optional)</span>
              <input
                type="text"
                maxLength={MAX_NOTE_LENGTH}
                className={styles.input}
                placeholder="Caffeine gel, felt it in the calf…"
                value={draft.note}
                onChange={(event) => change({ note: event.target.value })}
              />
            </label>
          </div>

          <p className={styles.at}>
            {formatDuration(draft.t)} elapsed ·{" "}
            {formatDistanceShort(distanceAtTime(activity, draft.t))} in
          </p>

          {measure !== undefined && !saveable && (
            <p className={styles.needsValue}>
              A {measure.label.toLowerCase()} reading needs its figure —
              between {measure.min} and {measure.max} {measure.unit}.
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.save}
              onClick={save}
              disabled={!saveable}
            >
              {draft.editing ? "Save changes" : "Add event"}
            </button>
            <button type="button" className={styles.cancel} onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The catalogue in reading order, nutrition first, one row per category. */
function groupedKinds(): [EventCategory, typeof EVENT_KINDS][] {
  const order: EventCategory[] = ["nutrition", "body", "kit", "other"];
  return order
    .map(
      (category) =>
        [category, EVENT_KINDS.filter((spec) => spec.category === category)] as [
          EventCategory,
          typeof EVENT_KINDS,
        ],
    )
    .filter(([, kinds]) => kinds.length > 0);
}

/** Where a new event starts before the reader moves it. */
function midpointOf(activity: DerivedActivity): number {
  return Math.round(activity.elapsedS / 2);
}
