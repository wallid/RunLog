import { useEffect, useState } from "react";
import { countVisit } from "@/stats";
import { TESTIMONIALS } from "@/testimonials";
import { CONTACT_EMAIL, contactHref } from "@/contact";
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
 * fit without a scrollbar, and nothing here is needed to open a file.
 */
export function SocialProof() {
  const visits = useVisitCount();

  return (
    <section className={styles.proof} aria-label="Who uses Run Log">
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
            quote. If Run Log showed you something about your running, write to{" "}
            <a className={styles.mail} href={contactHref("A quote for the landing page")}>
              {CONTACT_EMAIL}
            </a>{" "}
            and, with your permission, your words go here first.
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
      </div>
    </section>
  );
}

/**
 * Null until the count arrives, and null forever when it cannot — the strip
 * shows no number rather than a stale or invented one. The report-and-fetch
 * happens once per mount; `countVisit` itself makes sure a browser is never
 * counted twice.
 */
function useVisitCount(): number | null {
  const [visits, setVisits] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void countVisit().then((count) => {
      if (!cancelled) setVisits(count);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return visits;
}
