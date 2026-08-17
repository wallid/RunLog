import { useEffect, useRef } from "react";
import { useActivityStore } from "@/state/activityStore";
import { clearShareFromAddressBar, readShareLink } from "./link";

/**
 * Turns a share link in the address bar into a run on screen.
 *
 * Runs once, at startup, before anything else decides what to render — a
 * reader who followed a link should never see the upload page flash past on the
 * way to the run they were sent.
 *
 * The address is tidied as soon as the fetch is under way rather than after it
 * finishes, and deliberately: the key sits in that address, and leaving it
 * there puts it into the browser's history, into the next screenshot of the
 * page, and into whatever an extension can read off the location bar. The run
 * stays open; only its address goes back to being this site's own.
 *
 * A failed fetch is left to the store, which puts its message on the error
 * screen. This hook's only job is deciding that a link *was* one.
 */
export function useShareRoute(): void {
  const openShared = useActivityStore((state) => state.openShared);
  // Strict mode mounts effects twice in development; a second fetch of the
  // same share would be harmless but pointless, and the address has already
  // been cleared by then anyway.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (typeof window === "undefined") return;

    const link = readShareLink(window.location.pathname, window.location.hash);
    if (!link) return;

    void openShared(link.id, link.key);
    clearShareFromAddressBar();
  }, [openShared]);
}
