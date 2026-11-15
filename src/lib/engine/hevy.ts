import { z } from "zod";
import type { ExerciseEntry, Goal, ISODate, LogEntry, WeightUnit } from "../types";
import { localParts } from "./dates";

const set = z.object({
  type: z.string(),
  kg: z.number().min(0).nullable(),
  reps: z.number().min(0).nullable(),
  seconds: z.number().min(0).nullable(),
  meters: z.number().min(0).nullable(),
});

const workout = z.object({
  id: z.string().min(1),
  title: z.string(),
  /** ISO instants, as Hevy sends them. */
  start: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  end: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  exercises: z.array(z.object({ title: z.string(), sets: z.array(set) })),
});

/**
 * Everything LifeOS accepts from Hevy. Parsing keeps only these fields, so notes, routines
 * and profile details cannot reach the browser or a backup.
 */
const feed = z.object({
  generatedAt: z.string(),
  workouts: z.array(workout),
});

export type HevyFeed = z.infer<typeof feed>;
export type HevyWorkout = z.infer<typeof workout>;

export const parseHevyFeed = (raw: unknown): HevyFeed | null => {
  const parsed = feed.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export type HevyCheck = { available: false; reason: string } | { available: true; feed: HevyFeed };

export const hevyLogId = (workoutId: string) => `hevy:${workoutId}`;

const LB_PER_KG = 2.2046226;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Identical working sets become one row, as when logging by hand. Warm-ups and sets without weight and reps are left out. */
export const exercisesOf = (w: HevyWorkout, unit: WeightUnit): ExerciseEntry[] => {
  const out: ExerciseEntry[] = [];
  for (const ex of w.exercises) {
    const name = ex.title.trim();
    if (!name) continue;
    for (const s of ex.sets) {
      if (s.type === "warmup" || !s.kg || !s.reps) continue;
      const kg = unit === "lb" ? round1(s.kg * LB_PER_KG) : round1(s.kg);
      const last = out.at(-1);
      if (last && last.exercise === name && last.kg === kg && last.reps === s.reps) last.sets++;
      else out.push({ exercise: name, sets: 1, reps: s.reps, kg });
    }
  }
  return out;
};

const typeFor = (goal: Goal, w: HevyWorkout, lifted: boolean) => {
  const find = (re: RegExp) => goal.activityTypes.find((t) => re.test(t.label))?.id ?? null;
  if (lifted) return find(/strength|weights?|lifting/i);
  const moved = w.exercises.some((e) => e.sets.some((s) => (s.seconds ?? 0) > 0 || (s.meters ?? 0) > 0));
  return moved ? find(/cardio|run|cycl/i) : null;
};

export interface HevyImportResult {
  logs: LogEntry[];
  added: number;
  updated: number;
  removed: number;
  /** Days left out because a workout was already logged by hand. */
  skippedDays: number;
  /** Totals for what Hevy holds in the log after this run. */
  workouts: number;
  minutes: number;
  since: ISODate | null;
  changedDates: ISODate[];
}

interface ImportInput {
  feed: HevyFeed;
  goalId: string;
  goals: Goal[];
  logs: LogEntry[];
  today: ISODate;
  tz: string;
  weightUnit: WeightUnit;
  now: number;
}

const same = (a: LogEntry, b: LogEntry) =>
  a.date === b.date && a.time === b.time && a.minutes === b.minutes && a.typeId === b.typeId && a.note === b.note && JSON.stringify(a.exercises ?? []) === JSON.stringify(b.exercises ?? []);

/**
 * Merges Hevy's workouts into the log. Safe to run any number of times:
 * - each workout is one entry under a fixed id, dated and timed in your timezone
 * - a workout edited in Hevy updates its entry, and one deleted there is removed
 * - a day logged by hand wins, so a session never counts twice
 */
export const importHevy = ({ feed: data, goalId, goals, logs, today, tz, weightUnit, now }: ImportInput): HevyImportResult => {
  const goal = goals.find((g) => g.id === goalId);
  const result: Omit<HevyImportResult, "logs"> = { added: 0, updated: 0, removed: 0, skippedDays: 0, workouts: 0, minutes: 0, since: null, changedDates: [] };
  if (!goal) return { ...result, logs };

  const existing = new Map(logs.filter((l) => l.source === "hevy" && l.goalId === goalId).map((l) => [l.id, l]));
  const byHand = new Set(logs.filter((l) => !l.source && l.goalId === goalId).map((l) => l.date));
  const replaced = new Map<string, LogEntry | null>();
  const fresh: LogEntry[] = [];
  const skipped = new Set<ISODate>();
  const live = new Set<string>();

  for (const w of data.workouts) {
    const id = hevyLogId(w.id);
    const { date, time } = localParts(tz, new Date(w.start));
    if (date > today) continue;
    live.add(id);
    const saved = existing.get(id);
    if (byHand.has(date)) {
      skipped.add(date);
      if (saved) {
        replaced.set(id, null);
        result.removed++;
        result.changedDates.push(saved.date);
      }
      continue;
    }
    const exercises = exercisesOf(w, weightUnit);
    const minutes = Math.max(1, Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60_000));
    const next: LogEntry = {
      id,
      goalId,
      typeId: typeFor(goal, w, exercises.length > 0),
      date,
      time,
      tz,
      minutes,
      metrics: {},
      note: w.title.trim() || undefined,
      ...(exercises.length ? { exercises } : {}),
      source: "hevy",
      createdAt: saved?.createdAt ?? now,
      updatedAt: now,
    };
    if (!saved) {
      fresh.push(next);
      result.added++;
      result.changedDates.push(date);
    } else if (!same(saved, next)) {
      replaced.set(id, { ...next, tz: saved.tz });
      result.updated++;
      result.changedDates.push(saved.date, date);
    }
  }

  // Workouts deleted in Hevy go too. An empty answer is never taken as "everything was deleted".
  if (data.workouts.length > 0) {
    for (const [id, saved] of existing) {
      if (live.has(id) || replaced.has(id)) continue;
      replaced.set(id, null);
      result.removed++;
      result.changedDates.push(saved.date);
    }
  }

  result.skippedDays = skipped.size;
  const kept = logs.flatMap((l) => {
    if (!replaced.has(l.id)) return [l];
    const next = replaced.get(l.id);
    return next ? [next] : [];
  });
  const all = [...kept, ...fresh];
  const mine = all.filter((l) => l.source === "hevy" && l.goalId === goalId);
  result.workouts = mine.length;
  result.minutes = mine.reduce((sum, l) => sum + l.minutes, 0);
  result.since = mine.map((l) => l.date).sort()[0] ?? null;
  return { ...result, logs: all };
};

/** A sensible starting point: the active fitness goal, else one with a workout-like name. */
export const suggestHevyGoal = (goals: Goal[]) => {
  const active = goals.filter((g) => !g.archived);
  return (active.find((g) => g.kind === "fitness") ?? active.find((g) => /fit|gym|workout|train|lift/i.test(g.name)))?.id ?? null;
};
