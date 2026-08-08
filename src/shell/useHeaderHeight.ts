import { useCallback, useRef } from "react";

/**
 * Publishes the masthead's real height as `--header-height`.
 *
 * Everything that has to clear the sticky masthead reads that token: the
 * contents rail sits below it, and every card offsets its anchor by it so a
 * jumped-to section lands under the header rather than behind it. A fixed
 * value only holds while the masthead is one row. It is not: on a narrow
 * screen the figures drop to a line of their own and the actions wrap again
 * under those, so the header can be twice the height the token claims — and a
 * reader who followed a contents link would land on a title they cannot see.
 *
 * Measuring it costs one observer and removes the guess. The token in
 * tokens.css stays as the value used before the first measurement lands.
 */
export function useHeaderHeight<T extends HTMLElement>() {
  const observerRef = useRef<ResizeObserver | null>(null);

  return useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node) {
      document.documentElement.style.removeProperty("--header-height");
      return;
    }

    const publish = () => {
      const height = node.getBoundingClientRect().height;
      if (height > 0) {
        document.documentElement.style.setProperty("--header-height", `${height}px`);
      }
    };

    publish();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    observerRef.current = observer;
  }, []);
}
