import type { Goal, ISODate, LogEntry } from "../types";

export interface HealthMinutes {
  date: ISODate;
  workoutMinutes?: number;
}

export interface HealthImport {
  logs: LogEntry[];
  changed: boolean;
  changedDates: ISODate[];
}

/** The goal exercise minutes belong to: the default Fitness goal, or any active goal named Fitness. */
export const fitnessGoal = (goals: Goal[]) =>
  goals.find((g) => g.id === "fitness" && !g.archived) ?? goals.find((g) => !g.archived && g.name.trim().toLowerCase() === "fitness");

/**
 * Turns each day's exercise minutes from Apple Health into one Fitness entry for that day.
 * - the entry follows the number: a later run with more minutes updates it
 * - a workout logged by hand wins for that day, so minutes never count twice, and any import there is removed
 * - days with no exercise add nothing, and days after today are ignored
 */
export const importHealth = ({ days, goals, logs, today, tz, now }: { days: HealthMinutes[]; goals: Goal[]; logs: LogEntry[]; today: ISODate; tz: string; now: number }): HealthImport => {
  const goal = fitnessGoal(goals);
  if (!goal) return { logs, changed: false, changedDates: [] };

  const typeId = goal.activityTypes.find((t) => t.id === "cardio")?.id ?? null;
  const byHand = new Set(logs.filter((l) => !l.source && l.goalId === goal.id).map((l) => l.date));
  const existing = new Map(logs.filter((l) => l.source === "health" && l.goalId === goal.id).map((l) => [l.id, l]));

  const replaced = new Map<string, LogEntry | null>();
  const fresh: LogEntry[] = [];
  const changedDates: ISODate[] = [];

  for (const day of days) {
    if (day.date > today) continue;
    const id = `health-${day.date}`;
    const old = existing.get(id);
    if (byHand.has(day.date)) {
      if (old) {
        replaced.set(id, null);
        changedDates.push(day.date);
      }
      continue;
    }
    const minutes = Math.round(day.workoutMinutes ?? 0);
    if (!(minutes > 0)) continue;
    if (!old) {
      fresh.push({ id, goalId: goal.id, typeId, date: day.date, time: null, tz, minutes, metrics: {}, note: "From Apple Health", source: "health", createdAt: now, updatedAt: now });
      changedDates.push(day.date);
    } else if (old.minutes !== minutes) {
      replaced.set(id, { ...old, minutes, updatedAt: now });
      changedDates.push(day.date);
    }
  }

  if (!changedDates.length) return { logs, changed: false, changedDates };
  const next = logs.flatMap((l) => (replaced.has(l.id) ? (replaced.get(l.id) ?? []) : [l]));
  return { logs: [...next, ...fresh], changed: true, changedDates };
};
