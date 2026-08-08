import { useEffect, useRef } from "react";

/**
 * Drives an element's horizontal scale from how far down the page the reader is.
 *
 * A run story is a long document with no page numbers, and the contents rail
 * only says which section is open — not how much of the whole is left. A hair
 * of colour along the bottom of the masthead answers that without adding
 * anything to read.
 *
 * The value is written straight to the element's style rather than held in
 * state: this updates on every scroll frame, and putting it through React
 * would re-render the masthead — and the panel open inside it — sixty times a
 * second to move two pixels. Work is coalesced into one animation frame per
 * scroll burst, the same shape `useActiveSection` uses.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const element = ref.current;
      if (!element) return;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      // A story short enough to fit the window has no progress to report, and
      // dividing by nothing would report every position as the end.
      const progress =
        scrollable > 1 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      element.style.transform = `scaleX(${progress.toFixed(4)})`;
    };

    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return ref;
}
