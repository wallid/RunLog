import styles from "./ErrorFallback.module.css";

/**
 * What a reader sees when a widget throws.
 *
 * A blank white page reads as a broken link rather than a bug, so the boundary
 * says plainly what happened and offers the two things that actually help:
 * start again with the same file, or load a different one. It also repeats the
 * privacy line, because "something went wrong" is exactly the moment a runner
 * wonders what just happened to their data.
 */
export function ErrorFallback({ resetError }: { resetError: () => void }) {
  return (
    <div className={styles.screen} role="alert">
      <div className={styles.card}>
        <h1 className={styles.title}>This run stopped the page</h1>
        <p className={styles.body}>
          Something in the analysis failed part way through. It is a fault in Run
          Story rather than anything wrong with your file.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={resetError}>
            Try again
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => window.location.reload()}
          >
            Start over
          </button>
        </div>
        <p className={styles.note}>
          Your run stayed in this browser, and so did the fault: nothing about
          this was sent anywhere. If it keeps happening, the address in the
          footer is the way to say so.
        </p>
      </div>
    </div>
  );
}
