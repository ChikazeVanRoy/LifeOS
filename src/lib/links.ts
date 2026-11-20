"use client";

import type { LibraryConfig } from "./library-fetch";

/**
 * Sign-ins for Anki Analytics and Library, for the hosted LifeOS, which has no server to hold them.
 * They stay in this browser only: they are never part of LifeOS's data, backups or cloud sync.
 */
export interface AnkiLink {
  projectId: string;
  apiKey: string;
  email: string;
  password: string;
}

const KEYS = { anki: "lifeos.link.anki", library: "lifeos.link.library" } as const;

const read = <T>(key: string, valid: (v: Record<string, unknown>) => boolean): T | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    return raw && typeof raw === "object" && valid(raw as Record<string, unknown>) ? (raw as T) : null;
  } catch {
    return null;
  }
};

const filled = (v: Record<string, unknown>, fields: string[]) => fields.every((f) => typeof v[f] === "string" && (v[f] as string).length > 0);

export const getAnkiLink = () => read<AnkiLink>(KEYS.anki, (v) => filled(v, ["projectId", "apiKey", "email", "password"]));
export const getLibraryLink = () => read<LibraryConfig>(KEYS.library, (v) => filled(v, ["url", "anonKey", "email", "password", "person"]));

const write = (key: string, value: unknown) => {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* private window: the link just won't be kept */
  }
};

export const saveAnkiLink = (link: AnkiLink | null) => write(KEYS.anki, link);
export const saveLibraryLink = (link: LibraryConfig | null) => write(KEYS.library, link);
