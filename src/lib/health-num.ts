/**
 * Shortcuts can only send text. A number may have thousands commas ("8,123") or a unit ("8123 steps",
 * "32 min"). An older Shortcut may send several values separated by spaces or lines ("2 58 71"), and
 * the day's total is their sum.
 */
export const num = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parts = (value.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((p) => parseFloat(p.replace(/,/g, "")));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((a, b) => a + b, 0);
};

/**
 * One day's document as LifeOS reads it. A locked iPhone hides Health from Shortcuts, so a run then
 * sends 0 steps and 0 minutes. No steps at all means Health wasn't readable, not a day without
 * exercise, so the minutes are left out and what is already logged stays.
 */
export const healthDay = (date: string, x: Record<string, unknown>) => {
  const steps = num(x.steps);
  const workoutMinutes = num(x.workoutMinutes);
  const unread = steps === 0 && !workoutMinutes;
  return { date, steps: unread ? undefined : steps, weight: num(x.weight), sleepHours: num(x.sleepHours), workoutMinutes: unread ? undefined : workoutMinutes };
};
