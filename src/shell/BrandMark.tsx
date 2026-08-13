/**
 * The mark.
 *
 * A two-tread step plot climbing to the accent dot, which is the whole name in
 * one shape: a stepped series is how a machine draws a log — discrete samples,
 * each held until the next reading — and the same climb is a hill to anyone who
 * has run one. The dot is the part that carries over. It was the entire mark
 * before this, and it is still the loudest thing here; it has only been given
 * somewhere to be, which happens to be where the cursor sits on every timeline
 * in the app.
 *
 * Two treads rather than three because this is a favicon before it is anything
 * else. At 16px a 64-unit viewBox divides by four, so a three-tread version put
 * three pixels between risers and silted into a smear; two treads leave four,
 * which holds. The same arithmetic sets the 8-unit stroke — anything lighter
 * disappears in the tab bar.
 *
 * The stroke is `currentColor` so the mark tints with the text beside it —
 * secondary in the run header, primary on hover — and the dot is always the
 * accent, which is the one thing about it that never varies.
 *
 * It is hidden from assistive technology in both places it is used, because in
 * both the words "Run Log" are already sitting next to it: naming the mark as
 * well would read the brand out twice.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M14 48 H29 V33 H44 V22"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="22" r="9.5" fill="var(--accent)" />
    </svg>
  );
}
