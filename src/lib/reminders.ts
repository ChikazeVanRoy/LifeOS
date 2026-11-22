import { localParts, resolveTz } from "./engine/dates";
import { derive } from "./engine/derive";
import type { AppData } from "./types";

export interface Reminder {
  title: string;
  body: string;
  /** The local day it is for, kept so each person is reminded once a day. */
  date: string;
}

/** Early enough in the evening that there is still time to do the thing. */
export const DEFAULT_REMINDER_HOUR = 18;
/** The latest a reminder can still help. Later, it waits for tomorrow rather than arrive when nothing can be done. */
export const REMINDER_WINDOW_HOURS = 2;

const list = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * Whether to nudge this person now: once a day, within two hours of their chosen time, and only if
 * something they planned for today is still undone. A reminder that would arrive later stays unsent. Runs on a server, so `deviceTimezone` stands in for
 * "auto", which would otherwise mean the server's own clock.
 */
type ReminderInput = { data: AppData; deviceTimezone: string; hour: number; now: Date; lastSent: string | null };

const clock = ({ data, deviceTimezone, now }: ReminderInput) => {
  const timezone = data.settings.timezone === "auto" ? deviceTimezone : resolveTz(data.settings.timezone);
  return { timezone, local: localParts(timezone, now) };
};

/** It is this device's time for a reminder, and none has gone out today. Says nothing about what is left to do. */
export const reminderDue = (input: ReminderInput) => {
  const { local } = clock(input);
  const localHour = Number(local.time.slice(0, 2));
  return localHour >= input.hour && localHour < input.hour + REMINDER_WINDOW_HOURS && input.lastSent !== local.date;
};

export const planReminder = (input: ReminderInput): Reminder | null => {
  const { data, now } = input;
  if (!reminderDue(input)) return null;
  const { timezone, local } = clock(input);

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
