"use client";

import { useEffect } from "react";
import type { HevyCheck } from "./engine/hevy";
import { useStore } from "./store";
import { useUI } from "./ui";

const offline: HevyCheck = { available: false, reason: "Hevy could not be reached from this computer." };

/** Asks the LifeOS server to read Hevy. The result is shared with Settings. */
export const checkHevy = async (): Promise<HevyCheck> => {
  try {
    const res = await fetch("/api/hevy");
    const result = res.ok ? ((await res.json()) as HevyCheck) : offline;
    useUI.getState().setHevyCheck(result);
    return result;
  } catch {
    useUI.getState().setHevyCheck(offline);
    return offline;
  }
};

export const syncHevy = async () => {
  const check = await checkHevy();
  if (check.available) useStore.getState().syncHevyFeed(check.feed);
  return check;
};

const EVERY = 5 * 60_000;
const MIN_GAP = 60_000;

/** Keeps a connected account current while the app is open and whenever its window is opened again. Demo mode never syncs. */
export const useHevyAutoSync = () => {
  const linked = useStore((s) => !!s.data.hevy && s.mode === "real" && s.hydrated);

  useEffect(() => {
    if (!linked) return;
    let last = 0;
    const run = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < MIN_GAP) return;
      last = Date.now();
      void syncHevy();
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
