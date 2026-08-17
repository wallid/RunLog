import styles from "./ShareFeature.module.css";

/**
 * The sharing claim, and the one picture that makes it land.
 *
 * The hard part of explaining this feature is that the interesting property is
 * invisible: the run is encrypted, and the key rides in the part of the URL
 * browsers never send. Saying that in a paragraph reads as marketing. Showing
 * the link split into its two halves — one labelled as what the server gets,
 * the other as what it never does — is the whole argument in a glance, and it
 * happens to be literally true of the address bar rather than a metaphor for it.
 *
 * The second half of the panel is the route choice, because that is the
 * decision a runner actually has to make and the one with a consequence they
 * might not have thought of. It is shown as the three options really offered,
 * with the middle one marked as the cautious answer.
 */
export function ShareFeature() {
  return (
    <section className={styles.section} id="sharing">
      <div className={styles.text}>
        <h2 className={styles.heading}>Send someone the whole run.</h2>
        <p className={styles.body}>
          One link opens the entire page for whoever you send it to — every
          chart, the splits, the map, and the events you marked along the way.
          No account for you, none for them.
        </p>
        <p className={styles.body}>
          It is the only thing here that puts a run on a server, so it is built
          the way the rest of this page would want it to be: encrypted in your
          browser first, with the key kept in the link instead of on the server.
          We cannot read what you share. Anyone you send the link to can — so it
          is a decision you make per run, and you can take it back whenever you
          like.
        </p>
      </div>

      <div className={styles.visual}>
        <div className={styles.panel}>
          <p className={styles.label}>A share link</p>

          <p className={styles.link}>
            <span className={styles.seen}>runlogapp.com/s/7Qk2xN4v</span>
            <wbr />
            <span className={styles.unseen}>#k=nR7…kQ</span>
          </p>

          <ul className={styles.legend}>
            <li>
              <span className={`${styles.swatch} ${styles.swatchSeen}`} />
              What the server stores — encrypted, and unreadable to us
            </li>
            <li>
              <span className={`${styles.swatch} ${styles.swatchUnseen}`} />
              The key that opens it. Browsers never send this half
            </li>
          </ul>

          <p className={styles.label}>Before it goes, you choose</p>
          <ul className={styles.choices}>
            <li>The whole route</li>
            <li data-recommended="true">
              The route without the first and last 250 m
            </li>
            <li>No map at all</li>
          </ul>
          <p className={styles.note}>
            Because a trace that starts and ends at your door says where you
            live. Whatever you hold back is stripped here, before anything is
            encrypted — so it never leaves the machine at all.
          </p>
        </div>
      </div>
    </section>
  );
}
