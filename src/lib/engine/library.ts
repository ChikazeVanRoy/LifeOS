import { z } from "zod";
import type { Goal, ISODate, LogEntry } from "../types";
import { isValidDate, todayIn } from "./dates";

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
  /** Recent page changes from Library's reading log, oldest first, so pages land on the day they were read. */
  moves: z.array(z.object({ from: z.number().int().nullable(), to: z.number().int(), at: z.string() })).optional(),
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
  /** The one-time repair of earlier days ran for a book: the reading log was there to do it with. */
  repaired: boolean;
  /** The books the repair is finished for, now and before. */
  repairedBooks: string[];
  /** Every book being read has been repaired, so there is nothing left to wait for. */
  repairDone: boolean;
}

type Move = NonNullable<LibraryBook["moves"]>[number];

/**
 * Splits the pages from `prev` to `progress` across the days they were read, from the reading log.
 * The walk starts after the page was last at `prev` (where LifeOS saw it), counts only pages beyond
 * the furthest reached, so a typo put right is not counted twice, and puts what the log doesn't
 * cover on `today`. A day later than `today` (a clock ahead) is today.
 */
export const pagesByDay = (moves: Move[], prev: number, progress: number, today: ISODate, tz: string): Map<ISODate, number> => {
  let start = 0;
  for (let i = moves.length - 1; i >= 0; i--) {
    if (moves[i].to <= prev) {
      start = i + 1;
      break;
    }
  }
  const { days, reached } = walk(moves.slice(start), prev, progress, today, tz);
  if (progress > reached) days.set(today, (days.get(today) ?? 0) + progress - reached);
  return days;
};

/** Pages beyond the furthest reached, from `from` up to `cap`, on the day of each move. */
const walk = (moves: Move[], from: number, cap: number, today: ISODate, tz: string) => {
  const days = new Map<ISODate, number>();
  let reached = from;
  for (const m of moves) {
    const t = new Date(m.at);
    if (Number.isNaN(t.getTime())) continue;
    const next = Math.min(Math.max(reached, m.to), cap);
    const day = todayIn(tz, t);
    const date = day > today ? today : day;
    if (next > reached) days.set(date, (days.get(date) ?? 0) + next - reached);
    reached = next;
  }
  return { days, reached };
};

/**
 * Where pages already logged for a book should have gone, from the reading log: its days from the first
 * day the log has, holding the same pages in all (so none count twice or go missing), each day as the
 * log has it, in order. Pages the log can't place stay on the earliest of those days.
 */
export const repairDays = (moves: Move[], seenPage: number, logged: Map<ISODate, number>, today: ISODate, tz: string, skip: Set<ISODate>) => {
  const first = moves.find((m) => !Number.isNaN(new Date(m.at).getTime()));
  if (!first) return null;
  const since = todayIn(tz, new Date(first.at));
  const mine = [...logged].filter(([d]) => d >= since).sort(([a], [b]) => a.localeCompare(b));
  let left = mine.reduce((n, [, p]) => n + p, 0);
  if (!left) return null;
  const { days } = walk(moves, first.from ?? first.to, seenPage, today, tz);
  const out = new Map<ISODate, number>();
  for (const [d, p] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (skip.has(d) || !left) continue;
    const n = Math.min(p, left);
    out.set(d, n);
    left -= n;
  }
  // Pages the log can't place stay with the earliest day Library had, but never on a hand-logged day.
  const home = mine.find(([d]) => !skip.has(d));
  if (left && home) out.set(home[0], (out.get(home[0]) ?? 0) + left);
  return { since, days: out };
};

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
  /** Move pages already logged for books being read to the days the reading log says they were read. */
  repair?: boolean;
  /** Books the repair has already been done for. */
  repairedBooks?: string[];
}

/**
 * Merges Library into the log. Safe to run any number of times:
 * - a finished book is one entry on its finish date, under a fixed id
 * - pages read in a book still being read are logged on the day LifeOS sees them move
 * - reading logged by hand wins for that day, so hours never count twice
 * - pages already logged while reading are not counted again when the book is finished
 */
export const importLibrary = ({ feed: data, goalId, seen, goals, logs, today, tz, now, baseline = false, repair = false, repairedBooks = [] }: ImportInput): LibraryImportResult => {
  const base = goals.find((g) => g.id === goalId);
  const empty = { added: 0, updated: 0, removed: 0, skippedDays: 0, undated: 0, books: 0, pages: 0, minutes: 0, since: null, changedDates: [], repaired: false, repairedBooks, repairDone: false };
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
    if (existing.has(id) && current(id)) {
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

  /** The entry as this run has it so far: changed, new, or as it was. */
  const current = (id: string) => (replaced.has(id) ? replaced.get(id) ?? undefined : fresh.find((l) => l.id === id) ?? existing.get(id));

  /** Sets a day's pages for a book being read: adds, changes or removes its entry. */
  const setDay = (b: LibraryBook, date: ISODate, pages: number) => {
    const id = libraryReadId(b.id, date);
    const saved = current(id);
    if ((saved?.metrics.pages ?? 0) === pages) return;
    const added = fresh.findIndex((l) => l.id === id);
    if (added >= 0) {
      // Made earlier in this run: changed in place, as it is not in the log yet.
      if (pages) fresh[added] = { ...fresh[added], minutes: minutesFor(pages), metrics: { pages } };
      else fresh.splice(added, 1);
    } else if (!pages) {
      replaced.set(id, null);
      result.removed++;
    } else if (saved) {
      replaced.set(id, { ...saved, minutes: minutesFor(pages), metrics: { ...saved.metrics, pages }, updatedAt: now });
      result.updated++;
    } else {
      fresh.push(entry(id, date, pages, b.title));
      result.added++;
    }
    result.changedDates.push(date);
  };

  if (repair && !baseline) {
    const done = new Set(repairedBooks);
    for (const b of data.books) {
      const page = seen[b.id];
      if (b.status !== "Reading" || page === undefined || done.has(b.id)) continue;
      // A book whose reading log hasn't arrived yet waits for a later run.
      if (!b.moves?.length) continue;
      result.repaired = true;
      done.add(b.id);
      const logged = new Map<ISODate, number>();
      for (const l of existing.values()) if (l.id === libraryReadId(b.id, l.date)) logged.set(l.date, l.metrics.pages ?? 0);
      const fixed = repairDays(b.moves, page, logged, today, tz, byHand);
      if (!fixed) continue;
      for (const date of new Set([...logged.keys(), ...fixed.days.keys()])) if (date >= fixed.since) setDay(b, date, fixed.days.get(date) ?? 0);
    }
    result.repairedBooks = [...done];
    result.repairDone = data.books.every((b) => b.status !== "Reading" || seen[b.id] === undefined || done.has(b.id));
  }

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
      for (const [date, read] of pagesByDay(b.moves ?? [], prev, b.progress, today, tz)) {
        const id = libraryReadId(b.id, date);
        if (handled(id, date)) continue;
        setDay(b, date, (current(id)?.metrics.pages ?? 0) + read);
      }
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
