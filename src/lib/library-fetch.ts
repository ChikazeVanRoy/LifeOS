import type { LibraryBook, LibraryFeed } from "./engine/library";

/**
 * Reads Our Library's Supabase database as its owner, and trims it to the fields in
 * `LibraryFeed`. It runs on the local server, and in the browser when LifeOS is hosted.
 */

export interface LibraryConfig {
  url: string;
  anonKey: string;
  email: string;
  password: string;
  person: string;
}

export class LibraryError extends Error {}

let session: { token: string; expires: number; key: string } | null = null;

const signIn = async (config: LibraryConfig) => {
  const key = `${config.url}|${config.email}|${config.password}`;
  if (session && session.key === key && session.expires > Date.now() + 60_000) return session.token;
  const res = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (res.status === 400 || res.status === 401 || res.status === 422) {
    throw new LibraryError("Library did not accept the sign-in. Check the email and password.");
  }
  if (!res.ok) throw new LibraryError("Library's sign-in did not answer as expected.");
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new LibraryError("Library's sign-in did not answer as expected.");
  session = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000, key };
  return session.token;
};

const PAGE = 1000;

/** Every row of a table, a page at a time. */
const rows = async <T>(config: LibraryConfig, token: string, table: string, query: string): Promise<T[]> => {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
      headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, range: `${from}-${from + PAGE - 1}`, "range-unit": "items" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.status === 401) session = null;
    if (!res.ok) throw new LibraryError(res.status === 400 ? "BAD_COLUMNS" : "Library's database did not answer as expected.");
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
};

interface ReadingRow {
  book_id: string;
  status: string;
  finish_date?: string | null;
  progress?: number | null;
}
interface BookRow {
  id: string;
  title: string;
  volume?: string | null;
  pages?: string | null;
}

interface LogRow {
  book_id: string;
  from_page: number | null;
  to_page: number;
  at: string;
}

const pageCount = (text: string | null | undefined) => Number((text ?? "").replace(/\D/g, "")) || null;

/** One person's books being read or finished, trimmed to what LifeOS uses. */
export const toFeed = (readings: ReadingRow[], books: BookRow[], generatedAt: string, log: LogRow[] = []): LibraryFeed => {
  const byId = new Map(books.map((b) => [b.id, b]));
  const moves = new Map<string, NonNullable<LibraryBook["moves"]>>();
  const whole = (n: unknown) => typeof n === "number" && Number.isInteger(n);
  for (const r of [...log].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (typeof r.book_id !== "string" || !whole(r.to_page) || typeof r.at !== "string" || Number.isNaN(Date.parse(r.at))) continue;
    const list = moves.get(r.book_id) ?? [];
    list.push({ from: whole(r.from_page) ? r.from_page : null, to: r.to_page, at: r.at });
    moves.set(r.book_id, list);
  }
  const out: LibraryBook[] = [];
  for (const r of readings) {
    const b = byId.get(r.book_id);
    if (!b || (r.status !== "Reading" && r.status !== "Read")) continue;
    const volume = (b.volume ?? "").trim();
    out.push({
      id: b.id,
      title: volume ? `${b.title} ${volume}` : b.title,
      pages: pageCount(b.pages),
      status: r.status,
      finishDate: r.finish_date ?? "",
      progress: typeof r.progress === "number" && r.progress >= 0 ? Math.floor(r.progress) : null,
      ...(r.status === "Reading" && moves.has(b.id) ? { moves: moves.get(b.id) } : {}),
    });
  }
  return { generatedAt, books: out };
};

let cached: { at: number; key: string; feed: LibraryFeed } | null = null;

/** How far back the reading log is read: as far as Library accepts a phone's time for a page change. */
const LOG_DAYS = 32;

/** Reads the feed. Optional columns Library adds over time are dropped if the database lacks them. */
export const fetchLibrary = async (config: LibraryConfig): Promise<LibraryFeed> => {
  const key = `${config.url}|${config.email}|${config.person}`;
  if (cached && cached.key === key && Date.now() - cached.at < 20_000) return cached.feed;

  const token = await signIn(config);
  const person = encodeURIComponent(config.person);
  const read = async <T>(table: string, full: string, minimal: string, filter = "") => {
    try {
      return await rows<T>(config, token, table, `select=${full}${filter}`);
    } catch (e) {
      if (!(e instanceof LibraryError) || e.message !== "BAD_COLUMNS") throw e;
      return rows<T>(config, token, table, `select=${minimal}${filter}`).catch((err) => {
        throw err instanceof LibraryError && err.message === "BAD_COLUMNS" ? new LibraryError("Library's database does not have the tables LifeOS expects.") : err;
      });
    }
  };

  // The reading log (Library's reading-log.sql) is optional: without it, pages land on the day they are seen.
  const since = encodeURIComponent(new Date(Date.now() - LOG_DAYS * 86_400_000).toISOString());
  const [readings, books, log] = await Promise.all([
    read<ReadingRow>("readings", "book_id,status,finish_date,progress", "book_id,status,finish_date", `&person=eq.${person}&status=in.(Reading,Read)&order=book_id`),
    read<BookRow>("books", "id,title,volume,pages", "id,title,volume", "&order=id"),
    rows<LogRow>(config, token, "reading_log", `select=book_id,from_page,to_page,at&person=eq.${person}&at=gte.${since}&order=at.asc,id.asc`).catch(() => []),
  ]);
  const feed = toFeed(readings, books, new Date().toISOString(), log);
  cached = { at: Date.now(), key, feed };
  return feed;
};
