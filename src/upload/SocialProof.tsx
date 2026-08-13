import { TESTIMONIALS } from "@/testimonials";
import { CONTACT_EMAIL, testimonialHref } from "@/contact";
import { useVisitCount } from "./useVisitCount";
import styles from "./SocialProof.module.css";

/**
 * The proof strip at the foot of the landing page: how many have been here,
 * and what they said.
 *
 * Both halves obey the same rule as the cards upstairs — say where a claim
 * comes from, or do not make it. The count is visits, labelled as visits,
 * with the run arithmetic left explicitly as an assumption, because runs are
 * read on the visitor's device and are genuinely uncountable from here. The
 * testimonials list ships empty and the section says so rather than hiding,
 * because an empty section that asks is honest and an invented quote is not.
 *
 * The strip sits below the fold on purpose: the screen above it is sized to
 * fit without a scrollbar, and nothing here is needed to open a file. The
 * badge in the header shows the same number and links down here, which is the
 * arrangement the honesty rule forces: a figure may be glanced at up there
 * only because the sentence qualifying it is one click away.
 */
export function SocialProof() {
  const visits = useVisitCount();

  return (
    <section className={styles.proof} id="proof" aria-label="Who uses Run Log">
      {visits !== null && visits > 0 && (
        <div className={styles.stat}>
          <span className={styles.number}>{visits.toLocaleString()}</span>
          <div className={styles.statText}>
            <p className={styles.statLabel}>
              {visits === 1 ? "browser has" : "browsers have"} opened Run Log
            </p>
            <p className={styles.statNote}>
              That is the whole census. Runs are read on the visitor's own
              machine and never uploaded, so runs cannot be counted from here —
              but if each visit read one, that is how many runs stayed private.
            </p>
          </div>
        </div>
      )}

      <div className={styles.testimonials}>
        <h2 className={styles.heading}>What runners say</h2>
        {TESTIMONIALS.length === 0 ? (
          <p className={styles.empty}>
            Nothing yet — this page would rather stand empty than invent a
            quote. If Run Log showed you something about your running, send it
            over — with your permission, your words go here first.
          </p>
        ) : (
          <ul className={styles.quotes}>
            {TESTIMONIALS.map((testimonial) => (
              <li key={testimonial.quote} className={styles.quote}>
                <blockquote className={styles.quoteText}>
                  {testimonial.quote}
                </blockquote>
                <p className={styles.attribution}>— {testimonial.attribution}</p>
              </li>
            ))}
          </ul>
        )}

        {/* The way in for the next quote, and the reason the section can stay
            honest: the file takes nothing that did not arrive this way. It is
            a control rather than an address in a sentence because asking for
            something and then making the reader compose the mail themselves is
            how a section like this stays empty — the draft that opens already
            asks for the words, the permission and the credit. The address is
            still printed under it for anyone whose machine has no mail client
            wired up to a link. */}
        <p className={styles.ask}>
          <a className={styles.askButton} href={testimonialHref()}>
            Send yours
          </a>
          <span className={styles.askNote}>
            Opens a draft to <span className={styles.askMail}>{CONTACT_EMAIL}</span>{" "}
            — your words, your name or your handle, nothing published without
            your say-so.
          </span>
        </p>
      </div>
    </section>
  );
}
