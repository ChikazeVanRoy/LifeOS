import { del, get, set } from "idb-keyval";

/**
 * IndexedDB is the main store. localStorage is the fallback for browsers or modes
 * that block it, so a log is never silently lost.
 */
export const storage = {
  async read<T>(key: string): Promise<T | undefined> {
    try {
      const value = await get<T>(key);
      if (value !== undefined) return value;
    } catch {
      /* fall through */
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  async write(key: string, value: unknown): Promise<boolean> {
    try {
      await set(key, value);
      return true;
    } catch {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
  },
  async remove(key: string) {
    try {
      await del(key);
    } catch {
      /* nothing stored */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing stored */
    }
  },
};
