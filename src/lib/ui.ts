"use client";

import { create } from "zustand";
import type { AnkiCheck } from "./engine/anki";
import type { LibraryCheck } from "./engine/library";
import type { LogEntry } from "./types";

export interface FileStatus {
  /** `browser` means the file can't be reached, so changes wait in the browser. */
  state: "checking" | "saved" | "saving" | "browser";
  path?: string;
  savedAt?: string;
  backups?: number;
}

export interface LogPreset {
  goalId?: string;
  typeId?: string | null;
  minutes?: number;
  /** Opens as an edit of this entry. */
  editing?: LogEntry;
  /** Opened from a stopped timer: the timer is cleared once this is logged, not before. */
  fromTimer?: boolean;
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
  /** The latest answer from Our Library. Not saved. */
  libraryCheck: LibraryCheck | null;
  setLibraryCheck: (check: LibraryCheck) => void;
  fileStatus: FileStatus;
  setFileStatus: (patch: Partial<FileStatus>) => void;
}

export const useUI = create<UI>()((set) => ({
  logOpen: false,
  preset: null,
  openLog: (preset) => set({ logOpen: true, preset: preset ?? null }),
  closeLog: () => set({ logOpen: false }),
  ankiCheck: null,
  setAnkiCheck: (ankiCheck) => set({ ankiCheck }),
  libraryCheck: null,
  setLibraryCheck: (libraryCheck) => set({ libraryCheck }),
  fileStatus: { state: "checking" },
  setFileStatus: (patch) => set((s) => ({ fileStatus: { ...s.fileStatus, ...patch } })),
}));
