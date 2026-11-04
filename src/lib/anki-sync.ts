"use client";

import { useEffect } from "react";
import type { AnkiCheck } from "./engine/anki";
import { useStore } from "./store";
import { useUI } from "./ui";

const offline: AnkiCheck = { available: false, reason: "Anki Analytics is not running on this computer." };

const call = async (method: "GET" | "POST"): Promise<AnkiCheck> => {
  const res = await fetch("/api/anki", { method, headers: method === "POST" ? { "x-requested-by": "lifeos" } : undefined });
  return res.ok ? ((await res.json()) as AnkiCheck) : offline;
};

/** Reads the saved stats, taking a fresh copy first when Anki is closed and has new reviews. */
export const checkAnki = async (): Promise<AnkiCheck> => {
  try {
    const first = await call("GET");
    const check = first.available && first.updateAvailable && !first.ankiRunning ? await call("POST") : first;
    const result = check.available ? check : first;
    useUI.getState().setAnkiCheck(result);
    return result;
  } catch {
    useUI.getState().setAnkiCheck(offline);
    return offline;
  }
};

export const syncAnki = async () => {
  const check = await checkAnki();
  if (check.available) useStore.getState().syncAnkiFeed(check.feed);
  return check;
};

const EVERY = 60_000;

/** Keeps a connected account current while the app is open. Demo mode never syncs. */
export const useAnkiAutoSync = () => {
  const linked = useStore((s) => !!s.data.anki && s.mode === "real" && s.hydrated);

  useEffect(() => {
    if (!linked) return;
    let last = 0;
    const run = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < EVERY - 1000) return;
      last = Date.now();
      void syncAnki();
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
