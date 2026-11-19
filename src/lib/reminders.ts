import { localParts, resolveTz } from "./engine/dates";
import { derive } from "./engine/derive";
import type { AppData } from "./types";

export interface Reminder {
  title: string;
  body: string;
  /** The local day it is for, kept so each person is reminded once a day. */
  date: string;
}

export const DEFAULT_REMINDER_HOUR = 20;

const list = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * Whether to nudge this person now: once a day, from their chosen hour, and only if something
 * they planned for today is still undone. Runs on a server, so `deviceTimezone` stands in for
 * "auto", which would otherwise mean the server's own clock.
 */
export const planReminder = (input: { data: AppData; deviceTimezone: string; hour: number; now: Date; lastSent: string | null }): Reminder | null => {
  const { data, hour, now, lastSent } = input;
  const timezone = data.settings.timezone === "auto" ? input.deviceTimezone : resolveTz(data.settings.timezone);
  const local = localParts(timezone, now);
  if (Number(local.time.slice(0, 2)) < hour || lastSent === local.date) return null;

  const d = derive({ ...data, settings: { ...data.settings, timezone } }, now);
  const left = d.goals.filter((g) => g.neededToday && !g.doneToday).map((g) => g.goal.name);
  if (left.length === 0) return null;

  const streak = d.overallStreak;
  return {
    date: local.date,
    title: streak.unit === "day" && streak.current > 1 ? `Keep your ${streak.current}-day streak going` : "Still to do today",
    body: `${list(left)} ${left.length === 1 ? "is" : "are"} still open today.`,
  };
};
