import { useEffect, useRef, useState } from "react";

/**
 * Makes the whole window a drop target.
 *
 * A drop zone the size of a card asks the reader to aim; a drop zone the size
 * of the window does not. Dragging is counted rather than flagged, because
 * moving the pointer between two elements fires a leave on the one being left
 * after the enter on the one being entered — a boolean flickers off in the gap,
 * and the overlay flickers with it.
 *
 * Returns whether a file is currently being dragged over the page.
 */
export function useWindowDrop(onFiles: (files: FileList | null | undefined) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);
  handler.current = onFiles;

  useEffect(() => {
    // Dragging text or a link around the page is not an upload.
    const carriesFile = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (event: DragEvent) => {
      if (!carriesFile(event)) return;
      depth.current += 1;
      setDragging(true);
    };

    const onOver = (event: DragEvent) => {
      if (!carriesFile(event)) return;
      // Without this the browser navigates to the file instead.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!carriesFile(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      handler.current(event.dataTransfer?.files);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return dragging;
}
