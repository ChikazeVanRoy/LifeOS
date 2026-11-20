import { readFile } from "node:fs/promises";
import path from "node:path";
import { LibraryError, type LibraryConfig } from "../library-fetch";

export { fetchLibrary, LibraryError, toFeed, type LibraryConfig } from "../library-fetch";

/**
 * Library's sign-in and address for the local server, from its environment and Library's own `.env.local`.
 * The reading itself lives in `library-fetch.ts`, which the browser uses too.
 */

/** The values of a `.env` file, without quotes. Comments and blank lines are skipped. */
export const parseEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    const raw = m[2];
    out[m[1]] = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/, "");
  }
  return out;
};

/**
 * Library's address and public key are read from its own `.env.local` unless set here, so
 * there is one place to change them. The sign-in must be set in LifeOS's environment.
 */
export const readConfig = async (env: Record<string, string | undefined> = process.env): Promise<LibraryConfig> => {
  const email = env.LIBRARY_EMAIL?.trim();
  const password = env.LIBRARY_PASSWORD;
  if (!email || !password) {
    throw new LibraryError("Add LIBRARY_EMAIL and LIBRARY_PASSWORD to .env.local in the LifeOS folder, then restart LifeOS.");
  }

  let url = env.LIBRARY_SUPABASE_URL?.trim();
  let anonKey = env.LIBRARY_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    const dir = env.LIBRARY_APP_DIR?.trim() || path.resolve(process.cwd(), "..", "Library", "app");
    try {
      const file = parseEnv(await readFile(path.join(dir, ".env.local"), "utf8"));
      url ||= file.VITE_SUPABASE_URL?.trim();
      anonKey ||= file.VITE_SUPABASE_ANON_KEY?.trim();
    } catch {
      /* handled below */
    }
  }
  if (!url || !anonKey) {
    throw new LibraryError("LifeOS cannot find Library's Supabase address. Set LIBRARY_APP_DIR, or LIBRARY_SUPABASE_URL and LIBRARY_SUPABASE_ANON_KEY.");
  }
  const origin = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();
  if (!origin || origin.protocol !== "https:") throw new LibraryError("Library's Supabase address is not a valid https address.");

  return { url: origin.origin, anonKey, email, password, person: env.LIBRARY_PERSON?.trim().toLowerCase() || "chikaze" };
};

