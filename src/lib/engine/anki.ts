import { z } from "zod";
import type { Goal, ISODate, LogEntry } from "../types";
import { isValidDate } from "./dates";

const day = z.object({
  date: z.string().refine(isValidDate),
  deckId: z.string().min(1),
  reviews: z.number().min(0),
  studySeconds: z.number().min(0),
});

/**
 * Everything LifeOS accepts from Anki Analytics. Parsing keeps only these fields, so
 * card text in the source data cannot reach the browser or a backup.
 */
const feed = z.object({
  generatedAt: z.string(),
  dayStartHour: z.number().int().min(0).max(23),
  decks: z.array(z.object({ id: z.string().min(1), name: z.string() })),
  daily: z.array(day),
});

export type AnkiFeed = z.infer<typeof feed>;

/** Accepts live stats, or a snapshot, which wraps them in `{ data }`. */
export const parseFeed = (raw: unknown): AnkiFeed | null => {
  const body = raw && typeof raw === "object" && "data" in raw ? (raw as { data: unknown }).data : raw;
  const parsed = feed.safeParse(body);
  return parsed.success ? parsed.data : null;
};

export type AnkiCheck =
  | { available: false; reason: string }
  | { available: true; ankiRunning: boolean; updateAvailable: boolean; feed: AnkiFeed };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const hostnameOf = (value: string | null, prefix = "") => {
  if (!value) return null;
  try {
    return new URL(`${prefix}${value}`).hostname;
  } catch {
    return null;
  }
};

/**
 * Only this computer may use the Anki route. Checking the Host stops a website pointing
 * its own domain at localhost, and checking the Origin stops other sites calling it.
 */
export const isLocalRequest = (headers: Headers) => {
  const host = hostnameOf(headers.get("host"), "http://");
  if (!host || !LOCAL_HOSTS.has(host)) return false;
  const origin = headers.get("origin");
  return !origin || hostnameOf(origin) === host;
};

const FLASHCARDS = /^(anki|flash\s?cards?)$/i;

export const flashcardType = (goal: Goal) => goal.activityTypes.find((t) => FLASHCARDS.test(t.label));

/** Gives a goal somewhere to put imported reviews, without touching what it has. */
const readyForAnki = (goal: Goal): Goal => ({
  ...goal,
  activityTypes: flashcardType(goal) ? goal.activityTypes : [...goal.activityTypes, { id: "flashcards", label: "Flashcards", defaultMinutes: 20 }],
  metrics: goal.metrics.some((m) => m.id === "reviews") ? goal.metrics : [...goal.metrics, { id: "reviews", label: "Reviews", unit: "reviews", minutesPer: 0.15 }],
});

export const ankiLogId = (goalId: string, date: ISODate) => `anki:${goalId}:${date}`;

/** Sums mapped decks into one total per goal per day. Other decks are ignored. */
const goalDays = (data: AnkiFeed, mapping: Record<string, string>, today: ISODate) => {
  const out = new Map<string, Map<ISODate, { reviews: number; seconds: number }>>();
  for (const row of data.daily) {
    const goalId = mapping[row.deckId];
    if (!goalId || row.date > today || row.reviews === 0) continue;
    const days = out.get(goalId) ?? out.set(goalId, new Map()).get(goalId)!;
    const total = days.get(row.date) ?? { reviews: 0, seconds: 0 };
    total.reviews += row.reviews;
    total.seconds += row.studySeconds;
    days.set(row.date, total);
  }
  return out;
};

const toMinutes = (seconds: number) => (seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0);

export interface ImportResult {
  logs: LogEntry[];
  goals: Goal[];
  added: number;
  updated: number;
  removed: number;
  /** Days left out because a flashcard session was already logged by hand. */
  skippedDays: number;
  /** Totals for what the import holds after this run. */
  days: number;
  minutes: number;
  reviews: number;
  changedDates: ISODate[];
}

interface ImportInput {
  feed: AnkiFeed;
  mapping: Record<string, string>;
  goals: Goal[];
  logs: LogEntry[];
  today: ISODate;
  tz: string;
  now: number;
}

/**
 * Merges Anki's days into the log. Safe to run any number of times:
 * - each goal gets one entry a day, under a fixed id, so nothing duplicates
 * - a hand-logged flashcard session wins, so hours never count twice
 * - totals only rise, because deleting cards in Anki also removes their review history
 */
export const importAnki = ({ feed: data, mapping, goals, logs, today, tz, now }: ImportInput): ImportResult => {
  const days = goalDays(data, mapping, today);
  const nextGoals = goals.map((g) => (days.has(g.id) ? readyForAnki(g) : g));
  const byId = new Map(nextGoals.map((g) => [g.id, g]));
  const existing = new Map(logs.filter((l) => l.source === "anki").map((l) => [l.id, l]));

  const manual = new Set<string>();
  for (const l of logs) {
    const goal = byId.get(l.goalId);
    if (l.source || !goal) continue;
    if (goal.activityTypes.find((t) => t.id === l.typeId && FLASHCARDS.test(t.label))) manual.add(`${l.goalId}|${l.date}`);
  }

  const result: Omit<ImportResult, "logs" | "goals"> = { added: 0, updated: 0, removed: 0, skippedDays: 0, days: 0, minutes: 0, reviews: 0, changedDates: [] };
  const replaced = new Map<string, LogEntry | null>();
  const fresh: LogEntry[] = [];

  for (const [goalId, perDay] of days) {
    const goal = byId.get(goalId);
    if (!goal) continue;
    const typeId = flashcardType(goal)?.id ?? null;
    for (const [date, total] of perDay) {
      const id = ankiLogId(goalId, date);
      const saved = existing.get(id);
      if (manual.has(`${goalId}|${date}`)) {
        result.skippedDays++;
        if (saved) {
          replaced.set(id, null);
          result.removed++;
        }
        continue;
      }
      const minutes = Math.max(saved?.minutes ?? 0, toMinutes(total.seconds));
      const reviews = Math.max(saved?.metrics.reviews ?? 0, total.reviews);
      result.days++;
      result.minutes += minutes;
      result.reviews += reviews;
      if (!saved) {
        fresh.push({ id, goalId, typeId, date, time: null, tz, minutes, metrics: { reviews }, source: "anki", createdAt: now, updatedAt: now });
        result.added++;
        result.changedDates.push(date);
      } else if (minutes !== saved.minutes || reviews !== saved.metrics.reviews) {
        replaced.set(id, { ...saved, minutes, metrics: { ...saved.metrics, reviews }, updatedAt: now });
        result.updated++;
        result.changedDates.push(date);
      }
    }
  }

  const kept = logs.flatMap((l) => {
    if (!replaced.has(l.id)) return [l];
    const next = replaced.get(l.id);
    return next ? [next] : [];
  });
  return { ...result, logs: [...kept, ...fresh], goals: nextGoals };
};

/** A sensible starting mapping: a deck goes to the active goal that shares its name. */
export const suggestMapping = (data: AnkiFeed, goals: Goal[]) => {
  const out: Record<string, string> = {};
  for (const deck of data.decks) {
    const match = goals.find((g) => !g.archived && g.name.trim().toLowerCase() === deck.name.trim().toLowerCase());
    if (match) out[deck.id] = match.id;
  }
  return out;
};

export const formatDayStart = (hour: number) => {
  const h = hour % 12 || 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
};
