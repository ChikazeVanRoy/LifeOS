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
}

export interface StreakResult {
  unit: StreakUnit;
  current: number;
  longest: number;
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
        count += n;
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
export const summarize = (periods: Period[], unit: StreakUnit): StreakResult => {
  const runs: StreakRun[] = [];
  const timeline: StreakResult["timeline"] = [];
  let open: { start: ISODate; end: ISODate; days: number; weeks: number; dayStretch: number; weekDays: number } | null = null;

  const close = (ongoing: boolean) => {
    if (!open) return;
    runs.push({
      start: open.start,
      end: open.end,
      length: runLength(open.days, open.weeks, open.dayStretch, unit, open.weekDays),
      unit,
      ongoing,
    });
    open = null;
  };

  for (const p of periods) {
    if (p.status === "missed") {
      close(false);
    } else if (p.status === "met") {
      if (!open) open = { start: p.start, end: p.end, days: 0, weeks: 0, dayStretch: 0, weekDays: 0 };
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

  const current = runs.find((r) => r.ongoing)?.length ?? 0;
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  return { unit, current, longest, runs: runs.reverse(), periods, timeline };
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
}

/**
 * The Life streak counts days you showed up for anything. A quiet day only breaks it
 * when a day-scheduled goal was actually due, so rest days and weekly goals never do.
 */
export const computeOverallStreak = (
  activeDates: Set<ISODate>,
  goals: OverallGoal[],
  today: ISODate,
): StreakResult => {
  const sorted = [...activeDates].filter((d) => d <= today).sort();
  if (sorted.length === 0) return summarize([], "day");
  const periods: Period[] = [];
  for (let d = sorted[0]; d <= today; d = addDays(d, 1)) {
    const due = goals.some((g) => {
      if (d < g.since || isPaused(d, g.pauses)) return false;
      const s = scheduleOn(g.schedules, d);
      return s.kind === "days" && s.days.includes(weekday(d));
    });
    periods.push(dayPeriod(d, due, activeDates.has(d) ? 1 : 0, today));
  }
  return summarize(periods, "day");
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
    if (s.kind === "weekly") done += n;
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
