import { describe, expect, it } from "vitest";
import { num } from "./cloud";

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
