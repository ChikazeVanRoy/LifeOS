import { describe, expect, it } from "vitest";
import { healthDay, num } from "./health-num";

describe("healthDay", () => {
  it("leaves out a run from a locked iPhone, which sends no steps and no minutes", () => {
    expect(healthDay("2026-11-23", { steps: "0", workoutMinutes: "0" })).toMatchObject({ steps: undefined, workoutMinutes: undefined });
  });
  it("keeps a real day, including one without exercise", () => {
    expect(healthDay("2026-11-23", { steps: "6,210", workoutMinutes: "0" })).toMatchObject({ steps: 6210, workoutMinutes: 0 });
    expect(healthDay("2026-11-23", { steps: "0", workoutMinutes: "25" })).toMatchObject({ workoutMinutes: 25 });
  });
});

describe("num", () => {
  it("reads what a Shortcut sends", () => {
    expect(num("8123")).toBe(8123);
    expect(num("8,123")).toBe(8123);
    expect(num("8123 steps")).toBe(8123);
    expect(num("32.5 min")).toBe(32.5);
    expect(num("2 58 71")).toBe(131);
    expect(num("2\n58\n71")).toBe(131);
    expect(num(42)).toBe(42);
  });
  it("gives nothing for empty or unfilled text", () => {
    expect(num("")).toBeUndefined();
    expect(num("STEPS")).toBeUndefined();
    expect(num(undefined)).toBeUndefined();
  });
});
