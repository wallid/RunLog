import { useCallback, useState } from "react";

/**
 * Reports the first moment an element comes into view.
 *
 * Motion on this page is tied to reading rather than to loading. A card four
 * screens down has nothing to announce yet, and animating it there means the
 * reader arrives to a chart that already finished drawing — the effort is
 * spent where nobody is looking. Tying the reveal to arrival instead means
 * every card performs once, for the person actually in front of it.
 *
 * The flag latches, so scrolling back up never replays anything. A page that
 * re-animates on every pass stops reading as a document and starts reading as
 * a demo.
 *
 * Where there is no observer — server rendering, or a browser without one —
 * the answer is "in view", so the page arrives fully drawn rather than blank.
 * Motion is the enhancement here; the content is not allowed to depend on it.
 */
export function useInView<T extends Element>(
  /** How far inside the viewport an element must come before it counts. */
  rootMargin = "0px 0px -8% 0px",
) {
  const [inView, setInView] = useState(false);

  const ref = useCallback(
    (node: T | null) => {
      if (!node || inView) return;
      if (typeof IntersectionObserver === "undefined") {
        setInView(true);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          setInView(true);
          observer.disconnect();
        },
        { rootMargin },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [rootMargin, inView],
  );

  return [ref, inView] as const;
}
