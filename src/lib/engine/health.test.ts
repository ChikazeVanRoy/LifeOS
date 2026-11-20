import { describe, expect, it } from "vitest";
import { createGoal } from "../defaults";
import type { LogEntry } from "../types";
import { importHealth } from "./health";

const goal = createGoal("fitness", "2026-01-01", { id: "fitness", order: 1 });
const hand = (date: string): LogEntry => ({ id: "h" + date, goalId: "fitness", typeId: "strength", date, time: null, tz: "UTC", minutes: 50, metrics: {}, createdAt: 1, updatedAt: 1 });
const run = (days: { date: string; workoutMinutes?: number }[], logs: LogEntry[] = []) =>
  importHealth({ days, goals: [goal], logs, today: "2026-11-19", tz: "UTC", now: 5 });

describe("importHealth", () => {
  it("adds one Fitness entry per day with exercise", () => {
    const r = run([{ date: "2026-11-19", workoutMinutes: 32.4 }, { date: "2026-11-18" }, { date: "2026-11-17", workoutMinutes: 0 }]);
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0]).toMatchObject({ id: "health-2026-11-19", goalId: "fitness", minutes: 32, source: "health", typeId: "cardio" });
  });

  it("updates a day when the number grows, and does nothing when it is the same", () => {
    const first = run([{ date: "2026-11-19", workoutMinutes: 20 }]);
    const again = run([{ date: "2026-11-19", workoutMinutes: 20 }], first.logs);
    expect(again.changed).toBe(false);
    const more = run([{ date: "2026-11-19", workoutMinutes: 45 }], first.logs);
    expect(more.logs).toHaveLength(1);
    expect(more.logs[0].minutes).toBe(45);
  });

  it("leaves days logged by hand alone, and removes an import that was there first", () => {
    const skipped = run([{ date: "2026-11-19", workoutMinutes: 30 }], [hand("2026-11-19")]);
    expect(skipped.logs).toHaveLength(1);
    const imported = run([{ date: "2026-11-19", workoutMinutes: 30 }]);
    const after = run([{ date: "2026-11-19", workoutMinutes: 30 }], [...imported.logs, hand("2026-11-19")]);
    expect(after.logs.map((l) => l.id)).toEqual(["h2026-11-19"]);
  });

  it("ignores future days and does nothing without a Fitness goal", () => {
    expect(run([{ date: "2026-11-25", workoutMinutes: 30 }]).logs).toHaveLength(0);
    const none = importHealth({ days: [{ date: "2026-11-19", workoutMinutes: 30 }], goals: [], logs: [], today: "2026-11-19", tz: "UTC", now: 1 });
    expect(none.changed).toBe(false);
  });
});
