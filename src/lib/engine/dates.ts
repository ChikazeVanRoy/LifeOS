import type { ISODate } from "../types";

/**
 * All calendar maths runs on integer day numbers, so daylight-saving changes and
 * timezones cannot shift a date. An `ISODate` is only ever produced from the local
 * wall clock (see `todayIn`) and stored as it was.
 */
const DAY_MS = 86_400_000;

export const toDayNum = (d: ISODate): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / DAY_MS);
};

export const fromDayNum = (n: number): ISODate => new Date(n * DAY_MS).toISOString().slice(0, 10);

export const addDays = (d: ISODate, n: number): ISODate => fromDayNum(toDayNum(d) + n);
export const diffDays = (a: ISODate, b: ISODate): number => toDayNum(a) - toDayNum(b);

/** 0 = Sunday … 6 = Saturday */
export const weekday = (d: ISODate): number => ((toDayNum(d) + 4) % 7 + 7) % 7;

export const startOfWeek = (d: ISODate, weekStartsOn: 0 | 1): ISODate =>
  addDays(d, -((weekday(d) - weekStartsOn + 7) % 7));
export const endOfWeek = (d: ISODate, weekStartsOn: 0 | 1): ISODate =>
  addDays(startOfWeek(d, weekStartsOn), 6);

export const startOfMonth = (d: ISODate): ISODate => `${d.slice(0, 7)}-01`;
export const startOfYear = (d: ISODate): ISODate => `${d.slice(0, 4)}-01-01`;

export const addMonths = (d: ISODate, n: number): ISODate => {
  const [y, m] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 10);
};

export const endOfMonth = (d: ISODate): ISODate => addDays(addMonths(startOfMonth(d), 1), -1);

export const eachDay = (from: ISODate, to: ISODate): ISODate[] => {
  const out: ISODate[] = [];
  for (let n = toDayNum(from), e = toDayNum(to); n <= e; n++) out.push(fromDayNum(n));
  return out;
};

export const isValidDate = (d: unknown): d is ISODate =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && fromDayNum(toDayNum(d)) === d;

export const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const resolveTz = (setting: string): string =>
  !setting || setting === "auto" ? deviceTimezone() : setting;

/** The wall-clock date and time at `instant` in `tz`. */
export const localParts = (tz: string, instant: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
};

export const todayIn = (tz: string, instant?: Date): ISODate => localParts(tz, instant).date;

const utc = (d: ISODate) => new Date(toDayNum(d) * DAY_MS);
const fmt = (d: ISODate, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { timeZone: "UTC", ...opts }).format(utc(d));

export const fmtShort = (d: ISODate) => fmt(d, { month: "short", day: "numeric" });
export const fmtLong = (d: ISODate) => fmt(d, { weekday: "long", month: "long", day: "numeric" });
export const fmtFull = (d: ISODate) => fmt(d, { month: "short", day: "numeric", year: "numeric" });
export const fmtMonth = (d: ISODate) => fmt(d, { month: "short" });
export const fmtMonthYear = (d: ISODate) => fmt(d, { month: "short", year: "2-digit" });
export const fmtMonthLong = (d: ISODate) => fmt(d, { month: "long", year: "numeric" });
export const fmtWeekday = (d: ISODate) => fmt(d, { weekday: "short" });

export const fmtRange = (from: ISODate, to: ISODate) =>
  new Intl.DateTimeFormat(undefined, { timeZone: "UTC", month: "short", day: "numeric" }).formatRange(utc(from), utc(to));

/** A stored `HH:mm`, in the viewer's 12 or 24 hour style. */
export const fmtTime = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(Date.UTC(2000, 0, 1, h, m));
};

export const fmtRelative = (d: ISODate, today: ISODate) => {
  const n = diffDays(today, d);
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n === -1) return "Tomorrow";
  if (n > 1 && n < 7) return fmt(d, { weekday: "long" });
  return d.slice(0, 4) === today.slice(0, 4) ? fmtShort(d) : fmtFull(d);
};
