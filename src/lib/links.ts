"use client";

import type { AnkiCloudConfig } from "./anki-cloud";
import type { LibraryConfig } from "./library-fetch";

/**
 * Sign-ins for Anki Analytics and Library, for the hosted LifeOS, which has no server to hold them.
 * They stay in this browser only: they are never part of LifeOS's data, backups or cloud sync.
 * The projects' public addresses and keys are built in (see next.config.ts), so only the
 * email and password are asked for.
 */
export interface AnkiLink {
  email: string;
  password: string;
}
export interface LibraryLink {
  email: string;
  password: string;
  person: string;
}

const built = {
  libraryUrl: process.env.NEXT_PUBLIC_LIBRARY_URL ?? "",
  libraryKey: process.env.NEXT_PUBLIC_LIBRARY_KEY ?? "",
  ankiProject: process.env.NEXT_PUBLIC_ANKI_PROJECT ?? "",
  ankiKey: process.env.NEXT_PUBLIC_ANKI_KEY ?? "",
};

/** False when this copy was built without the other project's files beside it. */
export const ankiBuiltIn = !!(built.ankiProject && built.ankiKey);
export const libraryBuiltIn = !!(built.libraryUrl && built.libraryKey);

const KEYS = { anki: "lifeos.link.anki", library: "lifeos.link.library" } as const;

const filled = (v: Record<string, unknown>, fields: string[]) => fields.every((f) => typeof v[f] === "string" && (v[f] as string).length > 0);

const read = <T>(key: string, fields: string[]): T | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    return raw && typeof raw === "object" && filled(raw as Record<string, unknown>, fields) ? (raw as T) : null;
  } catch {
    return null;
  }
};

export const getAnkiLink = () => read<AnkiLink>(KEYS.anki, ["email", "password"]);
export const getLibraryLink = () => read<LibraryLink>(KEYS.library, ["email", "password", "person"]);

export const ankiConfig = (): AnkiCloudConfig | null => {
  const link = getAnkiLink();
  return link && ankiBuiltIn ? { projectId: built.ankiProject, apiKey: built.ankiKey, email: link.email, password: link.password } : null;
};

export const libraryConfig = (): LibraryConfig | null => {
  const link = getLibraryLink();
  if (!link || !libraryBuiltIn) return null;
  try {
    return { url: new URL(built.libraryUrl).origin, anonKey: built.libraryKey, email: link.email, password: link.password, person: link.person };
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown) => {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* private window: the sign-in just won't be kept */
  }
};

export const saveAnkiLink = (link: AnkiLink | null) => write(KEYS.anki, link && { email: link.email, password: link.password });
export const saveLibraryLink = (link: LibraryLink | null) =>
  write(KEYS.library, link && { email: link.email, password: link.password, person: link.person.toLowerCase() });
