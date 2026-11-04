import { describe, expect, it } from "vitest";
import { createDemoData } from "../demo";
import { createEmptyData, createGoal, localeDefaults, milestonesForGoal, nextColor, ROADMAP_TEMPLATES } from "../defaults";
import { parseImport, toExport } from "../io";
import { createLog } from "../log";
import { migrate } from "../migrate";
import type { AppData, LogEntry } from "../types";
import { addDays } from "./dates";
import { derive } from "./derive";
import { buildInsights } from "./insights";
import { buildReview } from "./review";

const now = new Date("2026-03-04T12:00:00Z");
const today = "2026-03-04";
const fresh = (): AppData => {
  const d = createEmptyData("2026-01-01");
  d.settings.timezone = "UTC";
  // The tests use a writing-focused creative goal, which is what `words` belongs to.
  const writing = createGoal("creative", "2026-01-01", { id: "writing", focus: "writing" });
  d.goals = [writing, ...d.goals.filter((g) => g.kind !== "creative")];
  d.milestones = d.goals.flatMap(milestonesForGoal);
  return d;
};
let n = 0;
const log = (goalId: string, date: string, minutes: number, metrics: Record<string, number> = {}, extra: Partial<LogEntry> = {}): LogEntry => ({
  id: `l${n++}`, goalId, typeId: null, date, time: "10:00", tz: "UTC", minutes, metrics, createdAt: n, updatedAt: n, ...extra,
});
const unlocked = (d: AppData) => derive(d, now).achievements.filter((a) => a.unlockedOn).map((a) => a.id);

describe("a real account", () => {
  it("starts generic: no languages, no roadmaps, no personal targets", () => {
    const d = createEmptyData("2026-01-01");
    expect(d.goals.map((g) => g.kind)).toEqual(["creative", "fitness", "reading", "career"]);
    expect(d.roadmaps).toEqual([]);
    expect(d.goals.find((g) => g.kind === "fitness")?.measurement?.target).toBeUndefined();
    expect(d.goals.find((g) => g.kind === "career")?.trackApplications).toBeFalsy();
  });

  it("starts with nothing recorded", () => {
    const d = derive(fresh(), now);
    expect(d.xp).toBe(0);
    expect(d.level.level).toBe(1);
    expect(d.totals.sessions).toBe(0);
    expect(d.overallStreak.current).toBe(0);
    expect(d.achievements.filter((a) => a.unlockedOn)).toEqual([]);
    expect(d.milestones.filter((m) => m.completedOn)).toEqual([]);
    expect(buildInsights(d)).toEqual([]);
  });
});

describe("derived state follows the log", () => {
  it("grants XP and achievements, then removes them when the log is deleted", () => {
    const d = fresh();
    d.logs.push(log("writing", today, 45, { words: 650 }));
    expect(derive(d, now).xp).toBeGreaterThan(0);
    expect(unlocked(d)).toContain("writing:first");
    expect(unlocked(d)).toContain("life:day-one");
    d.logs = [];
    expect(derive(d, now).xp).toBe(0);
    expect(unlocked(d)).toEqual([]);
  });

  it("dates an achievement to when it was earned", () => {
    const d = fresh();
    d.logs.push(log("reading", "2026-02-01", 300), log("reading", "2026-02-02", 300), log("reading", "2026-02-20", 60));
    expect(derive(d, now).achievements.find((a) => a.id === "reading:hours-10")?.unlockedOn).toBe("2026-02-02");
  });

  it("completes auto milestones from activity", () => {
    const d = fresh();
    d.logs.push(log("writing", "2026-02-01", 60, { words: 10_500 }));
    const m = derive(d, now).milestones.find((x) => x.title === "First 10,000 words");
    expect(m?.completedOn).toBe("2026-02-01");
  });

  it("gives any number of language goals their own streaks and milestones", () => {
    const d = fresh();
    const spanish = createGoal("language", "2026-01-01", { id: "es", name: "Spanish" });
    const greek = createGoal("language", "2026-01-01", { id: "el", name: "Greek" });
    d.goals.push(spanish, greek);
    d.milestones.push(...milestonesForGoal(spanish), ...milestonesForGoal(greek));
    d.logs.push(log("es", "2026-03-03", 20), log("es", today, 20), log("el", today, 20));
    const v = derive(d, now);
    expect(v.byId.get("es")?.streak.current).toBe(2);
    expect(v.byId.get("el")?.streak.current).toBe(1);
    expect(v.milestones.some((m) => m.title === "100 hours of Greek")).toBe(true);
    expect(unlocked(d)).toContain("el:first");
  });

  it("offers achievements that match what a creative goal measures", () => {
    const d = fresh();
    const art = createGoal("creative", "2026-01-01", { id: "art", focus: "art" });
    d.goals.push(art);
    const ids = derive(d, now).achievements.filter((a) => a.goalId === "art").map((a) => a.id);
    expect(ids).toContain("art:pieces-1");
    expect(ids.some((i) => i.includes("words"))).toBe(false);
    expect(derive(d, now).achievements.some((a) => a.id === "writing:words-10000")).toBe(true);
  });

  it("counts a finished creative project", () => {
    const d = fresh();
    d.projects.push({ id: "p", goalId: "writing", kind: "project", title: "Album", finishedAt: "2026-02-01" });
    expect(unlocked(d)).toContain("writing:project-1");
    expect(derive(d, now).xpEvents.some((e) => e.source === "project" && e.amount === 500)).toBe(true);
  });

  it("tracks body weight towards a target in either direction", () => {
    const d = fresh();
    d.milestones.push({ id: "w", goalId: "fitness", roadmapId: null, title: "Reach 70 kg", auto: { metric: "measurement", target: 70 }, order: 0 });
    d.measurements.push(
      { id: "a", goalId: "fitness", metricId: "bodyweight", date: "2026-01-01", value: 76 },
      { id: "b", goalId: "fitness", metricId: "bodyweight", date: "2026-02-01", value: 73 },
    );
    const m = derive(d, now).milestones.find((x) => x.title === "Reach 70 kg");
    expect(m?.progress).toBeCloseTo(0.5);
    expect(m?.completedOn).toBeNull();
  });

  it("counts a strength PR only against an earlier best", () => {
    const d = fresh();
    const lift = (date: string, kg: number) => log("fitness", date, 60, {}, { exercises: [{ exercise: "Squat", sets: 3, reps: 5, kg }] });
    d.logs.push(lift("2026-02-01", 80));
    expect(unlocked(d)).not.toContain("fitness:pr-1");
    d.logs.push(lift("2026-02-03", 77.5));
    expect(unlocked(d)).not.toContain("fitness:pr-1");
    d.logs.push(lift("2026-02-05", 82.5));
    expect(unlocked(d)).toContain("fitness:pr-1");
  });

  it("keeps Balanced Week when a new goal is added later", () => {
    const d = fresh();
    d.goals = d.goals.filter((g) => g.id !== "career");
    for (const g of d.goals) d.logs.push(log(g.id, "2026-02-03", 20));
    expect(unlocked(d)).toContain("life:balanced");
    d.goals.push({ ...d.goals[0], id: "new", name: "New", createdAt: today, order: 9 });
    expect(unlocked(d)).toContain("life:balanced");
  });

  it("does not count estimated minutes as real hours", () => {
    const d = fresh();
    d.logs.push(log("reading", today, 0, { pages: 25 }));
    const v = derive(d, now);
    expect(v.totals.minutes).toBe(0);
    expect(v.byId.get("reading")?.totals.metrics.pages).toBe(25);
    expect(v.byId.get("reading")?.xp).toBeGreaterThan(0);
  });

  it("awards a weekly target bonus once the target is hit", () => {
    const d = fresh();
    const week = ["2026-03-02", "2026-03-03"];
    week.forEach((date) => d.logs.push(log("fitness", date, 60)));
    expect(derive(d, now).xpEvents.some((e) => e.source === "weekly")).toBe(false);
    d.logs.push(log("fitness", today, 60));
    expect(derive(d, now).xpEvents.filter((e) => e.source === "weekly" && e.goalId === "fitness").length).toBe(1);
  });
});

describe("demo data", () => {
  const demo = createDemoData(today);
  demo.settings.timezone = "UTC";
  const d = derive(demo, now);

  it("exercises every system", () => {
    expect(d.totals.sessions).toBeGreaterThan(500);
    expect(d.level.level).toBeGreaterThan(5);
    expect(d.achievements.filter((a) => a.unlockedOn).length).toBeGreaterThan(10);
    expect(d.byId.get("fitness")?.strength?.prs.length).toBeGreaterThan(3);
    expect(buildInsights(d).length).toBeGreaterThan(0);
    expect(d.logs.every((l) => l.date <= today)).toBe(true);
  });

  it("reviews a past week", () => {
    const r = buildReview(d, addDays(today, -7));
    expect(r.totals.sessions).toBeGreaterThan(0);
    expect(r.priorities.length).toBeGreaterThan(0);
  });
});

describe("weekly review", () => {
  it("compares an open week with the same point last week", () => {
    const data = fresh();
    // Wednesday of the current week, against Mon-Wed and a heavy Sunday last week.
    data.logs.push(log("writing", "2026-03-02", 60), log("writing", "2026-02-23", 60), log("writing", "2026-03-01", 600));
    const r = buildReview(derive(data, now), today);
    expect(r.isCurrent).toBe(true);
    expect(r.previous.minutes).toBe(60);
    expect(r.compareLabel).toBe("this point last week");
  });

  it("does not flag goals as neglected mid-week", () => {
    const data = fresh();
    data.logs.push(log("writing", "2026-02-24", 60));
    expect(buildReview(derive(data, now), today).quieter).toEqual([]);
    expect(buildReview(derive(data, now), "2026-03-01").quieter.length).toBe(0);
  });

  it("stays gentle about an empty week", () => {
    const data = fresh();
    data.logs.push(log("writing", "2026-02-02", 120));
    const r = buildReview(derive(data, now), "2026-02-16");
    expect(r.headline).toBe("A quiet week.");
    expect(r.note).toContain("still yours");
  });
});

describe("setup helpers", () => {
  it("gives each new goal an unused colour, then wraps", () => {
    expect(nextColor([{ color: "violet", archived: false }])).toBe("green");
    expect(nextColor([{ color: "violet", archived: true }])).toBe("violet");
  });

  it("offers long-term goals without personal details", () => {
    expect(ROADMAP_TEMPLATES.length).toBeGreaterThan(3);
    expect(JSON.stringify(ROADMAP_TEMPLATES)).not.toMatch(/\bAI\b|author/i);
  });

  it("picks regional defaults from the locale", () => {
    expect(localeDefaults("en-US")).toEqual({ weekStartsOn: 0, weightUnit: "lb" });
    expect(localeDefaults("en-GB")).toEqual({ weekStartsOn: 1, weightUnit: "kg" });
    expect(localeDefaults("not a locale")).toEqual({ weekStartsOn: 1, weightUnit: "kg" });
  });
});

describe("data saved by the previous version", () => {
  /** The shape the first release wrote, with personal goals in place. */
  const oldData = () => {
    const d = fresh() as unknown as Record<string, unknown> & { goals: Record<string, unknown>[]; projects: Record<string, unknown>[]; settings: Record<string, unknown> };
    d.version = 1;
    d.goals[0] = { ...d.goals[0], name: "Writing", kind: "writing" };
    d.goals.push({ ...createGoal("language", "2026-01-01", { id: "portuguese", name: "Portuguese" }) });
    d.projects.push({ id: "m", goalId: "writing", kind: "manuscript", title: "My Novel", target: 80000 });
    delete d.settings.weightUnit;
    return d;
  };

  it("keeps names and history while upgrading the structure", () => {
    const d = migrate(oldData()) as AppData;
    expect(d.version).toBe(3);
    expect(d.anki).toBeNull();
    expect(d.goals[0]).toMatchObject({ name: "Writing", kind: "creative" });
    expect(d.goals.some((g) => g.name === "Portuguese")).toBe(true);
    expect(d.projects[0].kind).toBe("project");
    expect(d.settings.weightUnit).toBe("kg");
    expect(d.goals.find((g) => g.kind === "career")?.trackApplications).toBe(true);
  });

  it("leaves current data alone", () => {
    const d = fresh();
    expect(migrate(d)).toBe(d);
  });

  it("restores an old backup file", () => {
    const res = parseImport(JSON.stringify({ app: "lifeos", data: oldData() }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.projects[0].kind).toBe("project");
  });
});

describe("backup", () => {
  it("round-trips", () => {
    const data = createDemoData(today);
    const res = parseImport(toExport(data));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.logs.length).toBe(data.logs.length);
      expect(res.data.goals).toEqual(data.goals);
    }
  });

  it("restores entries made through the log sheet, with or without a time", () => {
    const tz = "UTC";
    const instant = new Date("2026-03-04T12:00:00Z");
    const data = fresh();
    const base = { goalId: "writing", typeId: "drafting", minutes: 30, metrics: {} };
    data.logs.push(
      createLog({ ...base, time: undefined, note: undefined }, tz, instant),
      createLog({ ...base, date: "2026-03-01", time: undefined }, tz, instant),
    );
    expect(data.logs[0].time).toBe("12:00");
    expect(data.logs[1].time).toBeNull();
    const res = parseImport(toExport(data));
    expect(res.ok).toBe(true);
  });

  it("accepts a backup whose entries have no time field", () => {
    const data = fresh();
    data.logs.push(log("writing", today, 10));
    const raw = JSON.parse(toExport(data));
    delete raw.data.logs[0].time;
    const res = parseImport(JSON.stringify(raw));
    expect(res.ok && res.data.logs[0].time).toBeNull();
  });

  it("rejects broken files with a reason", () => {
    expect(parseImport("not json")).toMatchObject({ ok: false });
    expect(parseImport('{"foo": 1}')).toMatchObject({ ok: false });
    const data = fresh();
    data.logs.push(log("ghost", today, 10));
    const res = parseImport(toExport(data));
    expect(res.ok).toBe(false);
    const bad = fresh();
    bad.logs.push(log("writing", "2026-13-45", 10));
    expect(parseImport(toExport(bad)).ok).toBe(false);
  });
});
