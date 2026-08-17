import { create } from "zustand";
import {
  buildShareDocument,
  type BuildShareOptions,
  type RouteChoice,
} from "@/share/document";
import {
  cryptoAvailable,
  exportKey,
  generateKey,
  generateRevocationToken,
} from "@/share/crypto";
import { shareUrl } from "@/share/link";
import { revokeShare, ShareError, uploadShare } from "@/share/transport";
import { useActivityStore } from "./activityStore";
import { useSettingsStore } from "./settingsStore";

/**
 * Links this browser has handed out.
 *
 * Two jobs. While a share is being made it holds the progress, because sealing
 * and uploading a marathon takes long enough that a button which simply went
 * quiet would look broken. Afterwards it remembers what was shared, which is
 * the part that matters: a link that cannot be withdrawn is a decision the
 * runner can never take back, and the token that withdraws it exists in exactly
 * one place — here.
 *
 * So this record is not a convenience. Losing it means losing the ability to
 * unshare, which is why the share dialog says plainly that withdrawing works
 * from this browser, and why clearing the site's storage is called out as the
 * thing that gives that up.
 */

const STORAGE_KEY = "runlog.shares";

/** Enough that a runner sharing weekly for four years never loses the oldest. */
const MAX_REMEMBERED = 200;

export interface SharedLink {
  /** The run this was made from, so the dialog can recognise a repeat. */
  runId: string;
  id: string;
  /** The encryption key, encoded. Never sent anywhere; needed to rebuild the link. */
  key: string;
  /** Proves the share is this browser's to withdraw. */
  token: string;
  createdAt: string;
  route: RouteChoice;
  /** The run's name at the time, so the list reads as runs rather than as ids. */
  name?: string;
}

export type ShareStatus = "idle" | "working" | "done" | "error";

interface ShareState {
  status: ShareStatus;
  /** The link just made, held so the dialog can show and copy it. */
  current: SharedLink | null;
  error: string | null;
  links: SharedLink[];

  /** Seals the run on screen and puts it up. */
  createShare: (options: BuildShareOptions) => Promise<void>;
  /** Takes one down. Resolves false if the server would not. */
  revoke: (id: string) => Promise<boolean>;
  /** Every link made from this run, newest first. */
  linksFor: (runId: string) => SharedLink[];
  /** Puts the dialog back to its opening state. */
  reset: () => void;
}

function isLink(value: unknown): value is SharedLink {
  if (typeof value !== "object" || value === null) return false;
  const link = value as Record<string, unknown>;
  return (
    typeof link.runId === "string" &&
    typeof link.id === "string" &&
    typeof link.key === "string" &&
    typeof link.token === "string" &&
    typeof link.createdAt === "string"
  );
}

function load(): SharedLink[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Same rule as everywhere else that reads storage: drop what does not hold
    // up rather than repair it. A half-formed entry here is a withdraw button
    // that would fail at the moment somebody needed it.
    return parsed.filter(isLink);
  } catch {
    return [];
  }
}

function persist(links: SharedLink[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links.slice(0, MAX_REMEMBERED)));
  } catch {
    // Storage full or blocked. The link still works; only the ability to
    // withdraw it from this browser is lost, and the dialog says so.
  }
}

/** The address a link is built against. Real window, or nothing in tests. */
function currentOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function linkUrl(link: SharedLink): string {
  return shareUrl({ id: link.id, key: link.key }, currentOrigin());
}

export const useShareStore = create<ShareState>((set, get) => ({
  status: "idle",
  current: null,
  error: null,
  links: load(),

  createShare: async (options) => {
    const { raw, activity } = useActivityStore.getState();
    if (!raw || !activity) return;

    if (!cryptoAvailable()) {
      set({
        status: "error",
        error:
          "This browser cannot encrypt, so there is no safe way to share from it. That usually means the page is being served over plain http rather than https.",
      });
      return;
    }

    set({ status: "working", error: null, current: null });

    try {
      const key = await generateKey();
      const token = generateRevocationToken();
      const document = buildShareDocument(
        raw,
        { annotations: activity.annotations, weather: activity.weather },
        {
          ...options,
          // The zones a reader sees should be the ones the runner saw, so the
          // figure they were built from travels with the run.
          maxHr: options.maxHr ?? useSettingsStore.getState().maxHr,
        },
      );

      const { id } = await uploadShare(key, document, token);

      const link: SharedLink = {
        runId: activity.id,
        id,
        key: await exportKey(key),
        token,
        createdAt: new Date().toISOString(),
        route: options.route,
        ...(activity.name ? { name: activity.name } : {}),
      };

      set((state) => {
        const links = [link, ...state.links].slice(0, MAX_REMEMBERED);
        persist(links);
        return { status: "done", current: link, links, error: null };
      });
    } catch (error) {
      set({
        status: "error",
        error:
          error instanceof ShareError || error instanceof Error
            ? error.message
            : "The link could not be created.",
      });
    }
  },

  revoke: async (id) => {
    const link = get().links.find((candidate) => candidate.id === id);
    if (!link) return false;

    const withdrawn = await revokeShare(id, link.token);
    if (!withdrawn) return false;

    set((state) => {
      const links = state.links.filter((candidate) => candidate.id !== id);
      persist(links);
      return {
        links,
        // The dialog is showing this link; it should stop.
        current: state.current?.id === id ? null : state.current,
        status: state.current?.id === id ? "idle" : state.status,
      };
    });
    return true;
  },

  linksFor: (runId) =>
    get()
      .links.filter((link) => link.runId === runId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

  reset: () => set({ status: "idle", current: null, error: null }),
}));
