import { describe, expect, it } from "vitest";
import { createDefaultGoals, createGoal } from "../defaults";
import { parseLogText } from "./parse";

const today = "2026-03-04"; // a Wednesday
const goals = [
  createGoal("creative", today, { name: "Writing", focus: "writing" }),
  createGoal("language", today, { name: "Portuguese" }),
  createGoal("language", today, { name: "Mandarin" }),
  ...createDefaultGoals(today).filter((x) => x.kind !== "creative"),
];
const g = (name: string) => goals.find((x) => x.name === name)!;
const parse = (s: string) => parseLogText(s, goals, today);

describe("quick-log sentences", () => {
  it("reads the brief's examples", () => {
    const w = parse("Wrote 45 minutes and 650 words.");
    expect([w.goalId, w.minutes, w.metrics.words]).toEqual([g("Writing").id, 45, 650]);

    const p = parse("Studied Portuguese for 30 minutes.");
    expect([p.goalId, p.minutes]).toEqual([g("Portuguese").id, 30]);

    const a = parse("Completed Mandarin Anki reviews for 20 minutes.");
    expect(a.goalId).toBe(g("Mandarin").id);
    expect(a.typeId).toBe("flashcards");
    expect(a.minutes).toBe(20);

    expect(parse("Finished a workout.").goalId).toBe(g("Fitness").id);

    const r = parse("Read 25 pages.");
    expect([r.goalId, r.metrics.pages]).toEqual([g("Reading").id, 25]);
  });

  it("prefers a language over a verb", () => {
    const r = parse("read portuguese for 20 min");
    expect(r.goalId).toBe(g("Portuguese").id);
    expect(r.typeId).toBe("reading");
  });

  it("understands other duration forms and dates", () => {
    expect(parse("wrote for 1h30").minutes).toBe(90);
    expect(parse("gym 1.5 hours").minutes).toBe(90);
    expect(parse("read for half an hour").minutes).toBe(30);
    expect(parse("wrote 1,200 words yesterday").date).toBe("2026-03-03");
    expect(parse("wrote 1,200 words yesterday").metrics.words).toBe(1200);
    expect(parse("gym on monday").date).toBe("2026-03-02");
  });

  it("works for any language name, and for other names for a language", () => {
    const own = [createGoal("language", today, { name: "Klingon" }), createGoal("language", today, { name: "Mandarin" })];
    expect(parseLogText("Klingon 15 min", own, today).goalId).toBe(own[0].id);
    expect(parseLogText("chinese for 15 min", own, today).goalId).toBe(own[1].id);
  });

  it("finds the only language from language words alone", () => {
    const one = [createGoal("language", today, { name: "Greek" }), ...createDefaultGoals(today)];
    expect(parseLogText("anki 10 minutes", one, today).goalId).toBe(one[0].id);
  });

  it("routes creative verbs to a creative goal of any focus", () => {
    const art = [createGoal("creative", today, { focus: "art" })];
    const r = parseLogText("painted for an hour", art, today);
    expect(r.goalId).toBe(art[0].id);
    expect(r.typeId).toBe("painting");
    expect(r.minutes).toBe(60);
  });

  it("leaves unknown text unmatched", () => {
    expect(parse("had a nice lunch").goalId).toBeNull();
  });
});
