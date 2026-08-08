import { advertiseHref } from "@/contact";
import styles from "./AdSlot.module.css";

/**
 * An unsold advertising slot between two sections of the story.
 *
 * Until a sponsor fills it, the slot sells itself: the whole banner is a
 * `mailto:` to the advertising address, so a brand that likes the page is
 * one click from the conversation. The pitch is aimed at national brands —
 * the companies already spending on runners — not at local shops. It is deliberately quieter than
 * the cards around it — dashed edge, sunken surface, no accent — because an
 * ad slot that competes with the run's own story would devalue both.
 *
 * Marked `aria-hidden`-free but kept out of the reading order's headings and
 * the contents rail on purpose: it is furniture between sections, not a
 * section.
 */
export function AdSlot() {
  return (
    <a
      className={styles.slot}
      href={advertiseHref()}
      aria-label="Advertise your brand here — email us"
    >
      <span className={styles.title}>Advertise your brand here</span>
      <span className={styles.subtitle}>
        Put your brand in front of dedicated runners
      </span>
    </a>
  );
}
