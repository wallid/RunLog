import type { DerivedActivity, Sample } from "@/model/activity";
import { kindSpec } from "@/model/annotations";
import { annotationAt } from "./helpers";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatGradient,
  formatHeartRate,
  formatPaceWithUnit,
  formatPower,
} from "@/lib/format";
import styles from "./CursorReadout.module.css";

/**
 * The values at the cursor.
 *
 * This is what a shared cursor is for: a single instant of the run described
 * completely, so a reader can ask "what was happening here" and get an answer
 * rather than an axis to squint at. Every widget that lets the reader move the
 * cursor shows the same block, so the answer never changes shape depending on
 * which card the question was asked from.
 */
export function CursorReadout({
  activity,
  sample,
  idleText,
}: {
  activity: DerivedActivity;
  sample: Sample | undefined;
  /** Shown before the reader has picked a position. */
  idleText: string;
}) {
  if (!sample) {
    return <p className={styles.readoutIdle}>{idleText}</p>;
  }

  const entries: { label: string; value: string }[] = [
    { label: "Elapsed", value: formatDuration(sample.t) },
    { label: "Distance", value: formatDistance(sample.distanceM) },
  ];

  if (sample.paceSecPerKm !== undefined) {
    entries.push({ label: "Pace", value: formatPaceWithUnit(sample.paceSecPerKm) });
  } else if (!sample.moving) {
    entries.push({ label: "Pace", value: "Stopped" });
  }
  if (sample.hrBpm !== undefined) {
    entries.push({ label: "Heart rate", value: formatHeartRate(sample.hrBpm) });
  }
  if (sample.hrZone !== undefined) {
    entries.push({ label: "Zone", value: `Zone ${sample.hrZone}` });
  }
  if (sample.cadenceSpm !== undefined) {
    entries.push({ label: "Cadence", value: `${Math.round(sample.cadenceSpm)} spm` });
  }
  if (sample.powerW !== undefined) {
    entries.push({ label: "Power", value: formatPower(sample.powerW) });
  }
  if (sample.elevationM !== undefined) {
    entries.push({ label: "Elevation", value: formatElevation(sample.elevationM) });
  }
  if (sample.gradientPct !== undefined) {
    entries.push({ label: "Gradient", value: formatGradient(sample.gradientPct) });
  }

  const activeEvent = activity.events.find(
    (event) => sample.t >= event.startT && sample.t <= event.endT,
  );
  const marked = annotationAt(activity, sample.t);

  return (
    <div className={styles.readout}>
      <dl className={styles.readoutGrid}>
        {entries.map((entry) => (
          <div key={entry.label} className={styles.readoutEntry}>
            <dt>{entry.label}</dt>
            <dd className="numeric">{entry.value}</dd>
          </div>
        ))}
      </dl>
      {/* The reader's own note comes first: they put it there, and it is the
          one line on the readout the file could not have produced. */}
      {marked && (
        <p className={styles.readoutContext}>
          You marked here: <strong>{kindSpec(marked.kind)?.label ?? "Event"}</strong>
          {marked.value !== undefined && kindSpec(marked.kind)?.measure
            ? ` — ${marked.value} ${kindSpec(marked.kind)?.measure?.unit}`
            : ""}
          {marked.note ? ` — ${marked.note}` : ""}
        </p>
      )}
      {activeEvent && (
        <p className={styles.readoutContext}>
          This position is inside: <strong>{activeEvent.label}</strong>
        </p>
      )}
    </div>
  );
}

/**
 * The sample nearest a cursor position, clamped to the run.
 *
 * Samples are one a second, so elapsed seconds index them directly once the
 * run's own start time is taken off.
 */
export function sampleAt(
  activity: DerivedActivity,
  cursorT: number | null,
): Sample | undefined {
  if (cursorT === null) return undefined;
  const first = activity.samples[0]?.t ?? 0;
  const index = Math.max(
    0,
    Math.min(activity.samples.length - 1, Math.round(cursorT - first)),
  );
  return activity.samples[index];
}
