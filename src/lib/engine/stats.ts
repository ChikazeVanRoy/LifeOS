import type { Goal, ISODate, LogEntry } from "../types";
import { addDays, addMonths, endOfMonth, fmtMonth, fmtMonthYear, fmtShort, startOfMonth, startOfWeek } from "./dates";

/** Size of a session for heatmaps and minimum lengths. Estimates here never reach reported hours. */
export const effortMinutes = (log: LogEntry, goal: Goal): number => {
  if (log.minutes > 0) return log.minutes;
  const fromMetrics = goal.metrics.reduce((sum, m) => sum + (log.metrics[m.id] ?? 0) * (m.minutesPer ?? 0), 0);
  if (fromMetrics > 0) return fromMetrics;
  return goal.activityTypes.find((t) => t.id === log.typeId)?.defaultMinutes ?? 15;
};

export const qualifies = (log: LogEntry, goal: Goal) => effortMinutes(log, goal) >= goal.minMinutes;

export const logOrder = (a: LogEntry, b: LogEntry) =>
  a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.createdAt - b.createdAt;

export interface Totals {
  minutes: number;
  sessions: number;
  activeDays: number;
  metrics: Record<string, number>;
  firstDate: ISODate | null;
  lastDate: ISODate | null;
}

export const totalsOf = (logs: LogEntry[]): Totals => {
  const days = new Set<ISODate>();
  const metrics: Record<string, number> = {};
  let minutes = 0;
  let firstDate: ISODate | null = null;
  let lastDate: ISODate | null = null;
  for (const l of logs) {
    minutes += l.minutes;
    days.add(l.date);
    for (const [k, v] of Object.entries(l.metrics)) metrics[k] = (metrics[k] ?? 0) + v;
    if (!firstDate || l.date < firstDate) firstDate = l.date;
    if (!lastDate || l.date > lastDate) lastDate = l.date;
  }
  return { minutes, sessions: logs.length, activeDays: days.size, metrics, firstDate, lastDate };
};

export const inRange = (logs: LogEntry[], from: ISODate, to: ISODate) =>
  logs.filter((l) => l.date >= from && l.date <= to);

export type Granularity = "day" | "week" | "month" | "year";

export interface Bucket {
  key: string;
  start: ISODate;
  end: ISODate;
  label: string;
}

/** The last `count` buckets ending with the one that contains `today`, oldest first. */
export const makeBuckets = (g: Granularity, today: ISODate, count: number, weekStartsOn: 0 | 1): Bucket[] => {
  const out: Bucket[] = [];
  if (g === "day") {
    for (let i = count - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      out.push({ key: d, start: d, end: d, label: fmtShort(d) });
    }
  } else if (g === "week") {
    const wk = startOfWeek(today, weekStartsOn);
    for (let i = count - 1; i >= 0; i--) {
      const s = addDays(wk, -7 * i);
      out.push({ key: s, start: s, end: addDays(s, 6), label: fmtShort(s) });
    }
  } else if (g === "month") {
    const m = startOfMonth(today);
    for (let i = count - 1; i >= 0; i--) {
      const s = addMonths(m, -i);
      out.push({ key: s, start: s, end: endOfMonth(s), label: count > 12 ? fmtMonthYear(s) : fmtMonth(s) });
    }
  } else {
    const y = Number(today.slice(0, 4));
    for (let i = count - 1; i >= 0; i--) {
      const yr = String(y - i);
      out.push({ key: yr, start: `${yr}-01-01`, end: `${yr}-12-31`, label: yr });
    }
  }
  return out;
};

/** Sums `value(log)` into buckets. */
export const seriesOf = (logs: LogEntry[], buckets: Bucket[], value: (l: LogEntry) => number): number[] => {
  const out = buckets.map(() => 0);
  for (const l of logs) {
    // Buckets are sorted and contiguous, so a binary search is safe.
    let lo = 0;
    let hi = buckets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (l.date < buckets[mid].start) hi = mid - 1;
      else if (l.date > buckets[mid].end) lo = mid + 1;
      else {
        out[mid] += value(l);
        break;
      }
    }
  }
  return out;
};

/** Finds when a running total first reached `target`. */
export const crossing = (logs: LogEntry[], value: (l: LogEntry) => number, target: number) => {
  let sum = 0;
  let date: ISODate | null = null;
  for (const l of logs) {
    sum += value(l);
    if (date === null && sum >= target) date = l.date;
  }
  return { value: sum, date };
};
