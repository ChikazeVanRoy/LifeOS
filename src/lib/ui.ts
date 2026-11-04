"use client";

import { create } from "zustand";
import type { AnkiCheck } from "./engine/anki";
import type { LogEntry } from "./types";

export interface LogPreset {
  goalId?: string;
  typeId?: string | null;
  minutes?: number;
  /** Opens as an edit of this entry. */
  editing?: LogEntry;
  /** Opens as a body-weight entry. */
  weighIn?: boolean;
}

interface UI {
  logOpen: boolean;
  preset: LogPreset | null;
  openLog: (preset?: LogPreset) => void;
  closeLog: () => void;
  /** The latest answer from Anki Analytics. Not saved. */
  ankiCheck: AnkiCheck | null;
  setAnkiCheck: (check: AnkiCheck) => void;
}

export const useUI = create<UI>()((set) => ({
  logOpen: false,
  preset: null,
  openLog: (preset) => set({ logOpen: true, preset: preset ?? null }),
  closeLog: () => set({ logOpen: false }),
  ankiCheck: null,
  setAnkiCheck: (ankiCheck) => set({ ankiCheck }),
}));
