"use client";

import { useEffect } from "react";
import type { LibraryCheck } from "./engine/library";
import { useStore } from "./store";
import { useUI } from "./ui";

const offline: LibraryCheck = { available: false, reason: "Library could not be reached from this computer." };

/** Asks the LifeOS server to read Library. The result is shared with Settings. */
export const checkLibrary = async (): Promise<LibraryCheck> => {
  try {
    const res = await fetch("/api/library");
    const result = res.ok ? ((await res.json()) as LibraryCheck) : offline;
    useUI.getState().setLibraryCheck(result);
    return result;
  } catch {
    useUI.getState().setLibraryCheck(offline);
    return offline;
  }
};

export const syncLibrary = async () => {
  const check = await checkLibrary();
  if (check.available) useStore.getState().syncLibraryFeed(check.feed);
  return check;
};

const EVERY = 3 * 60_000;
const MIN_GAP = 60_000;

/**
 * Keeps a connected account current while the app is open. Pages are dated the day LifeOS
 * sees them move, so it also checks whenever the window is opened again. Demo mode never syncs.
 */
export const useLibraryAutoSync = () => {
  const linked = useStore((s) => !!s.data.library && s.mode === "real" && s.hydrated);

  useEffect(() => {
    if (!linked) return;
    let last = 0;
    const run = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < MIN_GAP) return;
      last = Date.now();
      void syncLibrary();
    };
    run();
    const id = setInterval(run, EVERY);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [linked]);
};
