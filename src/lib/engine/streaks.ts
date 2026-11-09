import type { Goal, ISODate, Pause, Schedule, ScheduleEpoch } from "../types";
import { addDays, diffDays, endOfWeek, startOfWeek, toDayNum, weekday } from "./dates";

export type PeriodStatus = "met" | "missed" | "neutral" | "pending";
export type StreakUnit = "day" | "week";

/** One judged slice of time: a single day, or a calendar week. */
export interface Period {
  start: ISODate;
  end: ISODate;
  unit: StreakUnit;
  status: PeriodStatus;
  /** Sessions in the period, and active days within it. */
  count: number;
  activeDays: number;
  required: number;
}

export interface StreakRun {
  start: ISODate;
  end: ISODate;
  length: number;
  unit: StreakUnit;
  ongoing: boolean;
  /** Missed days the run forgave. A run forgives one, and it isn't counted in the length. */
  forgiven: number;
}

export interface StreakResult {
  unit: StreakUnit;
  current: number;
  longest: number;
  /** Whether the current streak is carrying its one forgiven day. */
  currentForgiven: number;
  /** Every run, newest first. */
  runs: StreakRun[];
  periods: Period[];
  /** Streak length after each period that extended it, oldest first. */
  timeline: { date: ISODate; length: number; unit: StreakUnit }[];
}

export interface PauseRange {
  from: ISODate;
  to: ISODate;
}

export const isPaused = (d: ISODate, pauses: PauseRange[]) => pauses.some((p) => d >= p.from && d <= p.to);

export const pausesFor = (goalId: string, pauses: Pause[]): PauseRange[] =>
  pauses.filter((p) => p.goalId === null || p.goalId === goalId);

export const currentSchedule = (g: Pick<Goal, "schedules">): Schedule => g.schedules[g.schedules.length - 1].schedule;

export const scheduleOn = (schedules: ScheduleEpoch[], d: ISODate): Schedule => {
  let s = schedules[0].schedule;
  for (const e of schedules) if (e.from <= d) s = e.schedule;
  return s;
};

export const isEveryDay = (s: Schedule) => s.kind === "days" && s.days.length === 7;

/** When a new schedule starts. A weekly target applies to the whole current week. */
export const scheduleStart = (s: Schedule, today: ISODate, weekStartsOn: 0 | 1): ISODate =>
  s.kind === "weekly" ? startOfWeek(today, weekStartsOn) : today;

/**
 * Adds a schedule change without touching the past: earlier days stay judged by the
 * schedule that applied then. Epochs that the change makes redundant are dropped.
 */
export const withSchedule = (
  schedules: ScheduleEpoch[],
  next: Schedule,
  today: ISODate,
  weekStartsOn: 0 | 1,
): ScheduleEpoch[] => {
  const from = scheduleStart(next, today, weekStartsOn);
  const kept = schedules.filter((e) => e.from < from);
  if (kept.length === 0) return [{ from: schedules[0]?.from < from ? schedules[0].from : from, schedule: next }];
  if (JSON.stringify(kept[kept.length - 1].schedule) === JSON.stringify(next)) return kept;
  return [...kept, { from, schedule: next }];
};

/** Splits [first, today] into stretches that share one schedule. */
const segments = (schedules: ScheduleEpoch[], first: ISODate, today: ISODate) => {
  const sorted = [...schedules].sort((a, b) => a.from.localeCompare(b.from));
  const out: { from: ISODate; to: ISODate; schedule: Schedule }[] = [];
  sorted.forEach((e, i) => {
    const from = i === 0 ? (first < e.from ? first : e.from) : e.from;
    const to = i + 1 < sorted.length ? addDays(sorted[i + 1].from, -1) : "9999-12-31";
    const a = from < first ? first : from;
    const b = to > today ? today : to;
    if (a <= b) out.push({ from: a, to: b, schedule: e.schedule });
  });
  return out;
};

const dayPeriod = (
  d: ISODate,
  required: boolean,
  sessions: number,
  today: ISODate,
): Period => {
  const status: PeriodStatus =
    sessions > 0 ? "met" : !required ? "neutral" : d === today ? "pending" : "missed";
  return {
    start: d,
    end: d,
    unit: "day",
    status,
    count: sessions,
    activeDays: sessions > 0 ? 1 : 0,
    required: required ? 1 : 0,
  };
};

export interface StreakInput {
  schedules: ScheduleEpoch[];
  /** Qualifying sessions per date. */
  sessions: Map<ISODate, number>;
  pauses: PauseRange[];
  today: ISODate;
  weekStartsOn: 0 | 1;
}

export const buildPeriods = ({ schedules, sessions, pauses, today, weekStartsOn }: StreakInput): Period[] => {
  const dates = [...sessions.keys()].filter((d) => d <= today).sort();
  if (dates.length === 0) return [];
  const out: Period[] = [];

  for (const seg of segments(schedules, dates[0], today)) {
    const { schedule } = seg;
    if (schedule.kind === "days") {
      const days = new Set(schedule.days);
      for (let d = seg.from; d <= seg.to; d = addDays(d, 1)) {
        out.push(dayPeriod(d, days.has(weekday(d)) && !isPaused(d, pauses), sessions.get(d) ?? 0, today));
      }
      continue;
    }

    for (let wk = startOfWeek(seg.from, weekStartsOn); wk <= seg.to; wk = addDays(wk, 7)) {
      const wkEnd = addDays(wk, 6);
      let available = 0;
      let count = 0;
      let activeDays = 0;
      for (let d = wk; d <= wkEnd; d = addDays(d, 1)) {
        const inSegment = d >= seg.from;
        const beforeNextEpoch = seg.to === today || d <= seg.to;
        if (!inSegment || !beforeNextEpoch) continue;
        if (!isPaused(d, pauses)) available++;
        const n = d <= today ? sessions.get(d) ?? 0 : 0;
        // Two sessions on one day still count as one towards a weekly target.
        count += Math.min(n, 1);
        if (n > 0) activeDays++;
      }
      // A week cut short by a start date, a schedule change or a planned break asks
      // for a fair share of the target, not the whole of it.
      const required = available === 0 ? 0 : Math.ceil((schedule.sessions * available) / 7);
      const finished = wkEnd < today;
      const status: PeriodStatus =
        required === 0
          ? count > 0 ? "met" : "neutral"
          : count >= required ? "met" : finished ? "missed" : "pending";
      out.push({
        start: wk < seg.from ? seg.from : wk,
        end: wkEnd > seg.to && seg.to !== today ? seg.to : wkEnd,
        unit: "week",
        status,
        count,
        activeDays,
        required,
      });
    }
  }
  return out;
};

const runLength = (dayCount: number, weekCount: number, spanDays: number, unit: StreakUnit, activeInWeeks: number) =>
  unit === "day" ? dayCount + activeInWeeks : weekCount + Math.floor(spanDays / 7);

/** Reduces periods to streak runs. `unit` is how lengths are reported. */
export const summarize = (periods: Period[], unit: StreakUnit, forgive = true): StreakResult => {
  const runs: StreakRun[] = [];
  const timeline: StreakResult["timeline"] = [];
  let open: { start: ISODate; end: ISODate; days: number; weeks: number; dayStretch: number; weekDays: number; forgiven: number } | null = null;
  // A single missed day is forgiven once per run, but only if the run carries on after it (or is still open).
  let pendingMiss = false;

  const close = (ongoing: boolean) => {
    if (!open) return;
    runs.push({
      start: open.start,
      end: open.end,
      length: runLength(open.days, open.weeks, open.dayStretch, unit, open.weekDays),
      unit,
      ongoing,
      forgiven: open.forgiven + (ongoing && pendingMiss ? 1 : 0),
    });
    open = null;
    pendingMiss = false;
  };

  for (const p of periods) {
    if (p.status === "missed") {
      if (forgive && p.unit === "day" && open && !open.forgiven && !pendingMiss) pendingMiss = true;
      else close(false);
    } else if (p.status === "met") {
      if (pendingMiss && open) {
        open.forgiven = 1;
        pendingMiss = false;
      }
      if (!open) open = { start: p.start, end: p.end, days: 0, weeks: 0, dayStretch: 0, weekDays: 0, forgiven: 0 };
      open.end = p.end;
      if (p.unit === "day") {
        open.days++;
        open.dayStretch = diffDays(p.end, open.start) + 1;
      } else {
        open.weeks++;
        open.weekDays += p.activeDays;
      }
      timeline.push({
        date: p.unit === "day" ? p.end : p.end,
        length: runLength(open.days, open.weeks, open.dayStretch, unit, open.weekDays),
        unit,
      });
    }
  }
  close(true);

  const ongoing = runs.find((r) => r.ongoing);
  const current = ongoing?.length ?? 0;
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  return { unit, current, currentForgiven: ongoing?.forgiven ?? 0, longest, runs: runs.reverse(), periods, timeline };
};

export const computeStreak = (input: StreakInput): StreakResult => {
  const last = input.schedules[input.schedules.length - 1].schedule;
  return summarize(buildPeriods(input), last.kind === "weekly" ? "week" : "day");
};

/** A goal's rules for the overall streak: who needed a session on `d`? */
export interface OverallGoal {
  schedules: ScheduleEpoch[];
  pauses: PauseRange[];
  since: ISODate;
  /** Qualifying sessions per date, to tell when a weekly target has run out of slack. */
  sessions?: Map<ISODate, number>;
  weekStartsOn?: 0 | 1;
}

/**
 * Whether a goal needs something from you on `d`. A day-scheduled goal does on its scheduled days.
 * A weekly goal has slack: you can skip days freely until the days left in the week are exactly
 * the sessions still missing. From then on, every day counts.
 */
export const owedOn = (g: OverallGoal, d: ISODate): boolean => {
  if (d < g.since || isPaused(d, g.pauses)) return false;
  const s = scheduleOn(g.schedules, d);
  if (s.kind === "days") return s.days.includes(weekday(d));
  const start = startOfWeek(d, g.weekStartsOn ?? 1);
  const end = addDays(start, 6);
  let available = 0;
  let daysLeft = 0;
  let doneBefore = 0;
  for (let x = start; x <= end; x = addDays(x, 1)) {
    if (x < g.since || isPaused(x, g.pauses)) continue;
    available++;
    if (x >= d) daysLeft++;
    else doneBefore += Math.min(g.sessions?.get(x) ?? 0, 1);
  }
  const need = Math.ceil((s.sessions * available) / 7) - doneBefore;
  return need > 0 && need >= daysLeft;
};

/**
 * The Life streak asks you to keep up with every goal. Each day, every goal that needs you
 * (see `owedOn`) has to be done. One missed day is forgiven for each goal, once per streak;
 * a second miss on any goal ends it. Days count when you showed up for something.
 */
export const computeOverallStreak = (
  activeDates: Set<ISODate>,
  goals: OverallGoal[],
  today: ISODate,
): StreakResult => {
  const sorted = [...activeDates].filter((d) => d <= today).sort();
  if (sorted.length === 0) return summarize([], "day");
  const periods: Period[] = [];
  // Forgiveness is per goal: a goal that already used its miss in this streak ends it on the next one.
  let usedBy = new Set<number>();
  // The days that were forgiven (several goals missing on one day is still one day).
  let forgivenDays = new Set<ISODate>();
  const forgivenByRun = new Map<ISODate, number>();
  let runStart: ISODate | null = null;
  const endRun = () => {
    if (runStart) forgivenByRun.set(runStart, forgivenDays.size);
    usedBy = new Set();
    forgivenDays = new Set();
    runStart = null;
  };
  for (let d = sorted[0]; d <= today; d = addDays(d, 1)) {
    const active = activeDates.has(d);
    // Only goals with nothing logged can be missing, so check that before the costlier `owedOn`.
    const missing: number[] = [];
    if (active || runStart) {
      goals.forEach((g, i) => {
        const logged = g.sessions ? (g.sessions.get(d) ?? 0) > 0 : active;
        if (!logged && owedOn(g, d)) missing.push(i);
      });
    }
    if (!runStart) {
      // A streak starts on a day when everything that was needed got done.
      if (active && missing.length === 0) {
        runStart = d;
        periods.push(dayPeriod(d, false, 1, today));
      } else periods.push(dayPeriod(d, false, 0, today));
      continue;
    }
    if (d < today && missing.some((i) => usedBy.has(i))) {
      periods.push(dayPeriod(d, true, 0, today));
      endRun();
      continue;
    }
    if (d < today && missing.length > 0) {
      for (const i of missing) usedBy.add(i);
      forgivenDays.add(d);
    }
    periods.push(dayPeriod(d, false, active ? 1 : 0, today));
  }
  endRun();
  // `summarize` would forgive any one miss itself; here the per-goal rule above decides.
  const result = summarize(periods, "day", false);
  const runs = result.runs.map((r) => ({ ...r, forgiven: forgivenByRun.get(r.start) ?? 0 }));
  return { ...result, runs, currentForgiven: runs.find((r) => r.ongoing)?.forgiven ?? 0 };
};

export type DayMark = "done" | "due" | "missed" | "rest" | "paused" | "future";

/** The seven dots on a goal card: what each day of this week means. */
export const weekMarks = (
  schedules: ScheduleEpoch[],
  sessions: Map<ISODate, number>,
  pauses: PauseRange[],
  today: ISODate,
  weekStartsOn: 0 | 1,
  /** Days before a goal began are not owed. */
  since: ISODate = "0000-01-01",
): { date: ISODate; mark: DayMark }[] => {
  const start = startOfWeek(today, weekStartsOn);
  const out: { date: ISODate; mark: DayMark }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const s = scheduleOn(schedules, d);
    const done = (sessions.get(d) ?? 0) > 0;
    const scheduled = s.kind === "days" && s.days.includes(weekday(d)) && d >= since;
    let mark: DayMark;
    if (done) mark = "done";
    else if (isPaused(d, pauses)) mark = "paused";
    else if (d > today) mark = scheduled ? "due" : s.kind === "weekly" ? "future" : "rest";
    else if (d === today) mark = scheduled ? "due" : s.kind === "weekly" ? "future" : "rest";
    else if (scheduled) mark = "missed";
    else mark = s.kind === "weekly" ? "future" : "rest";
    out.push({ date: d, mark });
  }
  return out;
};

export interface WeekProgress {
  start: ISODate;
  end: ISODate;
  done: number;
  required: number;
  met: boolean;
  daysLeft: number;
}

/** Progress against this week's target, in sessions. */
export const weekProgress = (
  schedules: ScheduleEpoch[],
  sessions: Map<ISODate, number>,
  pauses: PauseRange[],
  today: ISODate,
  weekStartsOn: 0 | 1,
  since: ISODate = "0000-01-01",
): WeekProgress => {
  const start = startOfWeek(today, weekStartsOn);
  const end = endOfWeek(today, weekStartsOn);
  const s = scheduleOn(schedules, today);
  let done = 0;
  let required = 0;
  let unpaused = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const n = sessions.get(d) ?? 0;
    const paused = isPaused(d, pauses);
    if (!paused && d >= since) unpaused++;
    if (s.kind === "weekly") done += Math.min(n, 1);
    else if (s.days.includes(weekday(d)) && !paused && d >= since) {
      required++;
      if (n > 0) done++;
    }
  }
  if (s.kind === "weekly") required = Math.ceil((s.sessions * unpaused) / 7);
  return { start, end, done, required, met: required > 0 && done >= required, daysLeft: toDayNum(end) - toDayNum(today) };
};

export const describeSchedule = (s: Schedule): string => {
  if (s.kind === "weekly") return `${s.sessions} ${s.sessions === 1 ? "session" : "sessions"} a week`;
  if (s.days.length === 7) return "Every day";
  if (s.days.length === 0) return "No set days";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => names[d]).join(", ");
};
