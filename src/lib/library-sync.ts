"use client";

import { useEffect } from "react";
import type { LibraryCheck } from "./engine/library";
import { fetchLibrary, LibraryError } from "./library-fetch";
import { libraryConfig } from "./links";
import { useStore } from "./store";
import { useUI } from "./ui";

const hosted = !!process.env.NEXT_PUBLIC_STATIC;
const offline: LibraryCheck = {
  available: false,
  reason: hosted ? "Sign in with your Library account to bring in your reading." : "Library could not be reached from this computer.",
};

/** Reads Library straight from the browser with the sign-in saved on this device. */
const checkDirect = async (): Promise<LibraryCheck | null> => {
  const link = libraryConfig();
  if (!link) return null;
  try {
    return { available: true, feed: await fetchLibrary(link) };
  } catch (e) {
    return { available: false, reason: e instanceof LibraryError ? e.message : "Library could not be reached. Check the internet connection." };
  }
};

/** Asks the LifeOS server to read Library. The result is shared with Settings. */
export const checkLibrary = async (): Promise<LibraryCheck> => {
  let result: LibraryCheck = offline;
  if (!hosted) {
    try {
      const res = await fetch("/api/library");
      if (res.ok) result = (await res.json()) as LibraryCheck;
    } catch {
      /* the direct read below is the fallback */
    }
  }
  if (!result.available) {
    const direct = await checkDirect();
    if (direct && (direct.available || result === offline)) result = direct;
  }
  useUI.getState().setLibraryCheck(result);
  return result;
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
