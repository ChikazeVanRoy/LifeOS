import type { Goal, ISODate, LogEntry } from "../types";
import { addDays, startOfWeek, weekday } from "./dates";
import { effortMinutes, qualifies } from "./stats";
import { isPaused, scheduleOn, type PauseRange, type StreakResult } from "./streaks";

export type XpSource = "session" | "weekly" | "streak" | "milestone" | "project" | "achievement";

export interface XpEvent {
  date: ISODate;
  /** null means Life XP that belongs to no single goal. */
  goalId: string | null;
  amount: number;
  source: XpSource;
  label: string;
}

export const XP_RULES = {
  /** First, second and third session of the day for a goal. Later ones earn time XP only. */
  sessionBase: [10, 5, 2],
  /** Each band is [minutes in band, XP per minute]. Past the last band, more time earns nothing. */
  timeBands: [
    [30, 1],
    [30, 0.6],
    [60, 0.3],
  ],
  weeklyTarget: 50,
  weeklyMinutes: 25,
  streakEvery7Days: 30,
  streak30Days: 70,
  streakPerWeek: 20,
  milestone: 100,
  project: { book: 40, certification: 150, project: 500 },
  achievement: { bronze: 10, silver: 25, gold: 50, legend: 100 },
} as const;

/** Total XP for `minutes` of effort in one day. Flattens out, so a marathon log gains little. */
export const timeCurve = (minutes: number) => {
  let left = minutes;
  let xp = 0;
  for (const [span, rate] of XP_RULES.timeBands) {
    const used = Math.min(left, span);
    xp += used * rate;
    left -= used;
    if (left <= 0) break;
  }
  return xp;
};

/** Replays one goal's sessions in order and scores each, applying daily diminishing returns. */
export const sessionXp = (goal: Goal, logs: LogEntry[], dailyCap: number) => {
  const byLog = new Map<string, number>();
  const events: XpEvent[] = [];
  const days = new Map<ISODate, { n: number; effort: number; earned: number; metric: Record<string, number> }>();

  for (const log of logs) {
    const day = days.get(log.date) ?? { n: 0, effort: 0, earned: 0, metric: {} };
    days.set(log.date, day);
    const base = XP_RULES.sessionBase[day.n] ?? 0;
    const effort = effortMinutes(log, goal);
    const time = Math.round(timeCurve(day.effort + effort)) - Math.round(timeCurve(day.effort));
    let output = 0;
    for (const m of goal.metrics) {
      if (!m.xp) continue;
      const before = day.metric[m.id] ?? 0;
      const after = before + (log.metrics[m.id] ?? 0);
      day.metric[m.id] = after;
      output += Math.min(Math.floor(after / m.xp.per), m.xp.cap) - Math.min(Math.floor(before / m.xp.per), m.xp.cap);
    }
    const amount = Math.max(0, Math.min(base + time + output, dailyCap - day.earned));
    day.n++;
    day.effort += effort;
    day.earned += amount;
    byLog.set(log.id, amount);
    if (amount > 0) events.push({ date: log.date, goalId: goal.id, amount, source: "session", label: `${goal.name} session` });
  }
  return { byLog, events };
};

/** Bonuses for keeping a target. Each is dated to the day it was earned. */
export const consistencyXp = (
  goal: Goal,
  logs: LogEntry[],
  streak: StreakResult,
  pauses: PauseRange[],
  today: ISODate,
  weekStartsOn: 0 | 1,
): XpEvent[] => {
  const events: XpEvent[] = [];
  const first = logs[0]?.date;
  if (!first) return events;

  const sessions = new Map<ISODate, number>();
  const minutes = new Map<ISODate, number>();
  for (const l of logs) {
    if (qualifies(l, goal)) sessions.set(l.date, (sessions.get(l.date) ?? 0) + 1);
    minutes.set(l.date, (minutes.get(l.date) ?? 0) + l.minutes);
  }

  for (let wk = startOfWeek(first, weekStartsOn); wk <= today; wk = addDays(wk, 7)) {
    let count = 0;
    let requiredDays = 0;
    let doneDays = 0;
    let lastRequired: ISODate | null = null;
    let reached: ISODate | null = null;
    let sum = 0;
    let minutesReached: ISODate | null = null;
    const schedule = scheduleOn(goal.schedules, wk);

    for (let i = 0; i < 7; i++) {
      const d = addDays(wk, i);
      const n = d <= today ? sessions.get(d) ?? 0 : 0;
      count += n;
      if (schedule.kind === "weekly" && !reached && count >= schedule.sessions) reached = d;
      if (schedule.kind === "days" && schedule.days.includes(weekday(d)) && !isPaused(d, pauses)) {
        requiredDays++;
        lastRequired = d;
        if (n > 0) doneDays++;
      }
      sum += d <= today ? minutes.get(d) ?? 0 : 0;
      if (goal.weeklyMinutes && !minutesReached && sum >= goal.weeklyMinutes) minutesReached = d;
    }
    if (schedule.kind === "days" && requiredDays > 0 && doneDays === requiredDays) reached = lastRequired;
    if (reached) events.push({ date: reached, goalId: goal.id, amount: XP_RULES.weeklyTarget, source: "weekly", label: `${goal.name} weekly target` });
    if (minutesReached) events.push({ date: minutesReached, goalId: goal.id, amount: XP_RULES.weeklyMinutes, source: "weekly", label: `${goal.name} weekly hours` });
  }

  for (const t of streak.timeline) {
    if (t.unit === "day") {
      if (t.length % 7 === 0) events.push({ date: t.date, goalId: goal.id, amount: XP_RULES.streakEvery7Days, source: "streak", label: `${t.length}-day ${goal.name} streak` });
      if (t.length % 30 === 0) events.push({ date: t.date, goalId: goal.id, amount: XP_RULES.streak30Days, source: "streak", label: `${t.length}-day ${goal.name} streak` });
    } else if (t.length >= 2) {
      events.push({ date: t.date > today ? today : t.date, goalId: goal.id, amount: XP_RULES.streakPerWeek, source: "streak", label: `${t.length}-week ${goal.name} streak` });
    }
  }
  return events;
};

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level takes in total. */
  span: number;
  progress: number;
  toNext: number;
}

/** Cumulative XP needed to reach level `n` on a curve scaled by `k`. */
export const xpForLevel = (n: number, k: number) => k * (n - 1) * n;

export const levelFrom = (xp: number, k: number): LevelInfo => {
  const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / k)) / 2));
  const floor = xpForLevel(level, k);
  const next = xpForLevel(level + 1, k);
  return { level, xp, into: xp - floor, span: next - floor, progress: (xp - floor) / (next - floor), toNext: next - xp };
};

export const GOAL_CURVE = 50;
export const LIFE_CURVE = 200;

const LIFE_TITLES: [number, string][] = [
  [1, "Beginner"],
  [3, "Apprentice"],
  [6, "Practitioner"],
  [10, "Regular"],
  [15, "Devotee"],
  [20, "Journeyer"],
  [30, "Veteran"],
  [40, "Master"],
  [50, "Sage"],
];

export const lifeTitle = (level: number) => LIFE_TITLES.reduce((t, [min, name]) => (level >= min ? name : t), "Beginner");
