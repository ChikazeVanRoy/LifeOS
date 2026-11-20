"use client";

import { useEffect } from "react";
import { cloudEnabled, readHealth } from "./cloud";
import { useStore } from "./store";

const EVERY = 5 * 60_000;

/** Brings the last two weeks of Apple Health exercise into the Fitness goal while the app is open. */
export const useHealthAutoSync = () => {
  const ready = useStore((s) => s.mode === "real" && s.hydrated);

  useEffect(() => {
    if (!cloudEnabled || !ready) return;
    let last = 0;
    const run = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < EVERY - 1000) return;
      last = Date.now();
      readHealth(14).then((days) => useStore.getState().syncHealth(days), () => {});
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
  }, [ready]);
};
