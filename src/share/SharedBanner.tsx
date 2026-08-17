import { useActivityStore } from "@/state/activityStore";
import styles from "./SharedBanner.module.css";

/**
 * The strip at the top of somebody else's run.
 *
 * It answers three questions in the order a reader has them.
 *
 * **Whose run is this?** Not yours — which matters, because the rest of the
 * page is written in the second person ("your pace held"), and a reader
 * arriving by link would otherwise be reading forty cards apparently addressed
 * to them about somebody else's legs.
 *
 * **What is missing?** If the sharer trimmed or dropped the route, the map is
 * not the run. Saying so is not optional: a map drawn from a trimmed trace
 * looks exactly like a map of a shorter run, and leaving that unsaid would make
 * the page assert something false. What was withheld travels in the document
 * for this reason alone.
 *
 * **Can I do this with mine?** The button. A shared run is the best possible
 * demonstration of what this page does, and it is being read by somebody who
 * did not arrive through the front door — so it offers the front door.
 */
export function SharedBanner() {
  const shared = useActivityStore((state) => state.shared);
  const reset = useActivityStore((state) => state.reset);

  if (!shared) return null;

  const { route, trimM } = shared.choices;

  return (
    <aside className={styles.banner}>
      <div className={`column ${styles.inner}`}>
        <p className={styles.lead}>
          <span className={styles.tag}>Shared with you</span>
          Somebody sent you this run. It is being read in your browser — the file
          itself was never yours and is not being kept here.
        </p>

        {route !== "full" && (
          <p className={styles.caveat}>
            {route === "none"
              ? "They chose not to share where this run happened, so there is no map and no route on the charts. Everything else is the run as recorded."
              : `They hid the first and last ${Math.round(trimM ?? 0)} m of the route, so the map starts and ends part-way through. The distance, the pace and every other figure still cover the whole run.`}
          </p>
        )}

        <button type="button" className={styles.cta} onClick={reset}>
          Read one of your own runs
        </button>
      </div>
    </aside>
  );
}
