import { z } from "zod";
import type { Goal, ISODate, LogEntry } from "../types";
import { isValidDate } from "./dates";

const book = z.object({
  id: z.string().min(1),
  title: z.string(),
  /** Total pages, when Library knows them. */
  pages: z.number().int().min(0).nullable(),
  status: z.enum(["", "Want to Read", "Reading", "Read"]),
  /** As Library stores it, usually `DD/MM/YYYY`. */
  finishDate: z.string(),
  /** The page reached, for a book being read. */
  progress: z.number().int().min(0).nullable(),
});

/**
 * Everything LifeOS accepts from Our Library: one person's books that are being read or
 * finished. Parsing keeps only these fields, so ratings, reviews, prices and other
 * details cannot reach the browser or a backup.
 */
const feed = z.object({
  generatedAt: z.string(),
  books: z.array(book),
});

export type LibraryFeed = z.infer<typeof feed>;
export type LibraryBook = z.infer<typeof book>;

export const parseLibraryFeed = (raw: unknown): LibraryFeed | null => {
  const parsed = feed.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export type LibraryCheck = { available: false; reason: string } | { available: true; feed: LibraryFeed };

const pad = (n: string) => n.padStart(2, "0");

/** A date as Library writes it, `DD/MM/YYYY` or `YYYY-MM-DD`. A month or year alone has no day, so it is `null`. */
export const parseLibraryDate = (text: string): ISODate | null => {
  const dmy = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  const ymd = dmy ? null : text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const iso = dmy ? `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}` : ymd ? `${ymd[1]}-${pad(ymd[2])}-${pad(ymd[3])}` : null;
  return iso && isValidDate(iso) ? iso : null;
};

export const libraryDoneId = (bookId: string) => `library:done:${bookId}`;
export const libraryReadId = (bookId: string, date: ISODate) => `library:read:${bookId}:${date}`;

const DEFAULT_MINUTES_PER_PAGE = 1.5;

/** Gives the goal somewhere to put pages, without touching what it has. */
const readyForLibrary = (goal: Goal): Goal =>
  goal.metrics.some((m) => m.id === "pages")
    ? goal
    : { ...goal, metrics: [...goal.metrics, { id: "pages", label: "Pages", unit: "pages", minutesPer: DEFAULT_MINUTES_PER_PAGE }] };

/** A sensible starting point: the active reading goal, else one with "read" in its name. */
export const suggestLibraryGoal = (goals: Goal[]) => {
  const active = goals.filter((g) => !g.archived);
  return (active.find((g) => g.kind === "reading") ?? active.find((g) => /read|book/i.test(g.name)))?.id ?? null;
};

export interface LibraryImportResult {
  logs: LogEntry[];
  goals: Goal[];
  seen: Record<string, number>;
  added: number;
  updated: number;
  removed: number;
  /** Days left out because reading was already logged by hand. */
  skippedDays: number;
  /** Finished books with no day to put them on, because only a month or year was entered. */
  undated: number;
  /** Totals for what Library holds in the log after this run. */
  books: number;
  pages: number;
  minutes: number;
  /** The earliest day imported. */
  since: ISODate | null;
  changedDates: ISODate[];
}

interface ImportInput {
  feed: LibraryFeed;
  goalId: string;
  seen: Record<string, number>;
  goals: Goal[];
  logs: LogEntry[];
  today: ISODate;
  tz: string;
  now: number;
  /** First import: books being read are noted at their current page, not logged. */
  baseline?: boolean;
}

/**
 * Merges Library into the log. Safe to run any number of times:
 * - a finished book is one entry on its finish date, under a fixed id
 * - pages read in a book still being read are logged on the day LifeOS sees them move
 * - reading logged by hand wins for that day, so hours never count twice
 * - pages already logged while reading are not counted again when the book is finished
 */
export const importLibrary = ({ feed: data, goalId, seen, goals, logs, today, tz, now, baseline = false }: ImportInput): LibraryImportResult => {
  const base = goals.find((g) => g.id === goalId);
  const empty = { added: 0, updated: 0, removed: 0, skippedDays: 0, undated: 0, books: 0, pages: 0, minutes: 0, since: null, changedDates: [] };
  if (!base) return { ...empty, logs, goals, seen };

  const goal = readyForLibrary(base);
  const nextGoals = goal === base ? goals : goals.map((g) => (g.id === goalId ? goal : g));
  const perPage = goal.metrics.find((m) => m.id === "pages")?.minutesPer ?? DEFAULT_MINUTES_PER_PAGE;
  const minutesFor = (pages: number) => (pages > 0 ? Math.max(1, Math.round(pages * perPage)) : 0);

  const existing = new Map(logs.filter((l) => l.source === "library" && l.goalId === goalId).map((l) => [l.id, l]));
  const byHand = new Set(logs.filter((l) => !l.source && l.goalId === goalId).map((l) => l.date));

  const result: Omit<LibraryImportResult, "logs" | "goals" | "seen"> = { ...empty, changedDates: [] };
  const replaced = new Map<string, LogEntry | null>();
  const fresh: LogEntry[] = [];
  const skipped = new Set<ISODate>();
  const nextSeen: Record<string, number> = {};

  /** True when the day belongs to a hand-logged entry; any import already there is removed. */
  const handled = (id: string, date: ISODate) => {
    if (!byHand.has(date)) return false;
    skipped.add(date);
    if (existing.has(id)) {
      replaced.set(id, null);
      result.removed++;
    }
    return true;
  };

  const entry = (id: string, date: ISODate, pages: number | null, note: string): LogEntry => ({
    id,
    goalId,
    typeId: null,
    date,
    time: null,
    tz,
    minutes: minutesFor(pages ?? 0),
    metrics: pages ? { pages } : {},
    note,
    source: "library",
    createdAt: now,
    updatedAt: now,
  });

  for (const b of data.books) {
    if (b.status === "Read") {
      const tracked = seen[b.id];
      if (tracked !== undefined) nextSeen[b.id] = tracked;
      const date = parseLibraryDate(b.finishDate);
      if (!date) {
        result.undated++;
        continue;
      }
      if (date > today) continue;
      const id = libraryDoneId(b.id);
      if (handled(id, date)) continue;
      const saved = existing.get(id);
      if (saved) {
        // Pages stay as first counted. Only a corrected finish date moves the entry.
        if (saved.date !== date) {
          replaced.set(id, { ...saved, date, updatedAt: now });
          result.updated++;
          result.changedDates.push(saved.date, date);
        }
        continue;
      }
      // Pages logged while reading are not counted again.
      const pages = b.pages === null || b.pages === 0 ? null : Math.max(0, b.pages - (tracked ?? 0));
      if (tracked !== undefined && !pages) continue;
      fresh.push(entry(id, date, pages, `Finished ${b.title}`));
      result.added++;
      result.changedDates.push(date);
    } else if (b.status === "Reading") {
      const prev = seen[b.id];
      if (b.progress === null) {
        if (prev !== undefined) nextSeen[b.id] = prev;
        continue;
      }
      nextSeen[b.id] = b.progress;
      if (baseline || prev === undefined || b.progress <= prev) continue;
      const id = libraryReadId(b.id, today);
      if (handled(id, today)) continue;
      const saved = existing.get(id);
      const pages = (saved?.metrics.pages ?? 0) + (b.progress - prev);
      if (saved) {
        replaced.set(id, { ...saved, minutes: minutesFor(pages), metrics: { ...saved.metrics, pages }, updatedAt: now });
        result.updated++;
      } else {
        fresh.push(entry(id, today, pages, b.title));
        result.added++;
      }
      result.changedDates.push(today);
    }
  }

  result.skippedDays = skipped.size;
  const kept = logs.flatMap((l) => {
    if (!replaced.has(l.id)) return [l];
    const next = replaced.get(l.id);
    return next ? [next] : [];
  });
  const all = [...kept, ...fresh];

  const mine = all.filter((l) => l.source === "library" && l.goalId === goalId);
  result.books = mine.filter((l) => l.id.startsWith("library:done:")).length;
  result.pages = mine.reduce((sum, l) => sum + (l.metrics.pages ?? 0), 0);
  result.minutes = mine.reduce((sum, l) => sum + l.minutes, 0);
  result.since = mine.map((l) => l.date).sort()[0] ?? null;

  return { ...result, logs: all, goals: nextGoals, seen: nextSeen };
};
