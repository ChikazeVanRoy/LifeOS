import type { ExerciseEntry, Goal, ISODate, LogEntry } from "../types";
import { startOfWeek } from "./dates";

/** Epley estimate. A single rep is just the weight lifted. */
export const estimate1RM = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

export interface StrengthPR {
  date: ISODate;
  exercise: string;
  kg: number;
  reps: number;
  e1rm: number;
  previous: number;
}

const normalize = (name: string) => name.trim().toLowerCase();

export interface ExerciseHistory {
  name: string;
  points: { date: ISODate; e1rm: number; topKg: number; volume: number }[];
  best: { date: ISODate; kg: number; reps: number; e1rm: number };
  heaviest: { date: ISODate; kg: number; reps: number };
  sessions: number;
}

export interface StrengthSummary {
  exercises: ExerciseHistory[];
  /** Sessions that beat an earlier best. The first time doing a lift is not a record. */
  prs: StrengthPR[];
}

export const strengthSummary = (logs: LogEntry[]): StrengthSummary => {
  const map = new Map<string, ExerciseHistory>();
  const prs: StrengthPR[] = [];

  for (const log of logs) {
    const groups = new Map<string, ExerciseEntry[]>();
    for (const e of log.exercises ?? []) {
      if (!e.exercise.trim() || e.kg <= 0 || e.reps <= 0) continue;
      const k = normalize(e.exercise);
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    for (const [key, entries] of groups) {
      const top = entries.reduce((a, b) => (estimate1RM(b.kg, b.reps) > estimate1RM(a.kg, a.reps) ? b : a));
      const e1rm = estimate1RM(top.kg, top.reps);
      const volume = entries.reduce((s, e) => s + e.kg * e.reps * Math.max(1, e.sets), 0);
      const topKg = Math.max(...entries.map((e) => e.kg));
      const hist = map.get(key);
      if (!hist) {
        map.set(key, {
          name: entries[0].exercise.trim(),
          points: [{ date: log.date, e1rm, topKg, volume }],
          best: { date: log.date, kg: top.kg, reps: top.reps, e1rm },
          heaviest: { date: log.date, kg: top.kg, reps: top.reps },
          sessions: 1,
        });
        continue;
      }
      if (e1rm > hist.best.e1rm + 1e-9) {
        prs.push({ date: log.date, exercise: hist.name, kg: top.kg, reps: top.reps, e1rm, previous: hist.best.e1rm });
        hist.best = { date: log.date, kg: top.kg, reps: top.reps, e1rm };
      }
      if (topKg > hist.heaviest.kg) hist.heaviest = { date: log.date, kg: topKg, reps: top.reps };
      hist.points.push({ date: log.date, e1rm, topKg, volume });
      hist.sessions++;
    }
  }
  return { exercises: [...map.values()].sort((a, b) => b.sessions - a.sessions), prs };
};

export interface RecordItem {
  id: string;
  goalId: string;
  label: string;
  value: number;
  unit: string;
  date: ISODate;
}

export interface RecordEvent extends RecordItem {
  previous: number;
}

/**
 * Walks a goal's history and keeps its bests, plus each moment a best was beaten.
 * A value with nothing before it sets the bar but is not reported as a broken record.
 */
export const goalRecords = (goal: Goal, logs: LogEntry[], weekStartsOn: 0 | 1) => {
  const best = new Map<string, RecordItem>();
  const events: RecordEvent[] = [];

  const track = (id: string, label: string, value: number, unit: string, date: ISODate) => {
    if (value <= 0) return;
    const prev = best.get(id);
    if (prev && value <= prev.value) return;
    if (prev) events.push({ id, goalId: goal.id, label, value, unit, date, previous: prev.value });
    best.set(id, { id, goalId: goal.id, label, value, unit, date });
  };

  const dayTotals = new Map<ISODate, { minutes: number; metrics: Record<string, number> }>();
  const weekMinutes = new Map<ISODate, number>();
  for (const l of logs) {
    track(`${goal.id}:session`, "Longest session", l.minutes, "min", l.date);
    const day = dayTotals.get(l.date) ?? { minutes: 0, metrics: {} };
    day.minutes += l.minutes;
    for (const [k, v] of Object.entries(l.metrics)) day.metrics[k] = (day.metrics[k] ?? 0) + v;
    dayTotals.set(l.date, day);
  }
  for (const [date, day] of [...dayTotals].sort(([a], [b]) => a.localeCompare(b))) {
    track(`${goal.id}:day`, "Biggest day", day.minutes, "min", date);
    for (const m of goal.metrics) track(`${goal.id}:day:${m.id}`, `Most ${m.label.toLowerCase()} in a day`, day.metrics[m.id] ?? 0, m.unit, date);
    const wk = startOfWeek(date, weekStartsOn);
    weekMinutes.set(wk, (weekMinutes.get(wk) ?? 0) + day.minutes);
    track(`${goal.id}:week`, "Biggest week", weekMinutes.get(wk) ?? 0, "min", date);
  }
  return { records: [...best.values()], events };
};
