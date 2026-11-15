import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyData, createGoal } from "../defaults";
import { parseImport, toExport } from "../io";
import { fetchHevy, HevyError, readKey, toFeed } from "../server/hevy";
import type { LogEntry } from "../types";
import { exercisesOf, hevyLogId, importHevy, parseHevyFeed, suggestHevyGoal, type HevyFeed, type HevyWorkout } from "./hevy";

const today = "2026-03-10";
const fitness = createGoal("fitness", "2026-01-01", { id: "fit", name: "Fitness" });
const reading = createGoal("reading", "2026-01-01", { id: "rd", name: "Reading" });
const goals = [fitness, reading];

const sets = (n: number, kg: number | null, reps: number | null, type = "normal") =>
  Array.from({ length: n }, () => ({ type, kg, reps, seconds: null, meters: null }));

const workout = (id: string, over: Partial<HevyWorkout> = {}): HevyWorkout => ({
  id,
  title: "Push day",
  start: "2026-03-05T18:00:00Z",
  end: "2026-03-05T19:05:00Z",
  exercises: [
    { title: "Bench Press", sets: [...sets(1, 40, 10, "warmup"), ...sets(3, 80, 5)] },
    { title: "Row", sets: [...sets(1, 60, 8), ...sets(1, 62.5, 8)] },
  ],
  ...over,
});
const feedOf = (...workouts: HevyWorkout[]): HevyFeed => ({ generatedAt: "2026-03-10T09:00:00Z", workouts });
const run = (feed: HevyFeed, logs: LogEntry[] = [], tz = "UTC", unit: "kg" | "lb" = "kg") =>
  importHevy({ feed, goalId: "fit", goals, logs, today, tz, weightUnit: unit, now: 1000 });
const manual = (date: string): LogEntry => ({ id: `m-${date}`, goalId: "fit", typeId: null, date, time: null, tz: "UTC", minutes: 30, metrics: {}, createdAt: 1, updatedAt: 1 });

describe("reading Hevy's answer", () => {
  it("keeps only what it needs", () => {
    const parsed = parseHevyFeed({ ...feedOf(workout("a")), workouts: [{ ...workout("a"), description: "private notes", routine_id: "x" }] });
    expect(JSON.stringify(parsed)).not.toContain("private");
    expect(Object.keys(parsed!.workouts[0]).sort()).toEqual(["end", "exercises", "id", "start", "title"]);
  });

  it("refuses a shape it does not recognise", () => {
    expect(parseHevyFeed({ generatedAt: "x", workouts: [{ id: "a", start: "soon", end: "later", title: "", exercises: [] }] })).toBeNull();
    expect(parseHevyFeed(null)).toBeNull();
  });
});

describe("a workout", () => {
  it("becomes one entry, with its time, length and lifts", () => {
    const r = run(feedOf(workout("a")));
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0]).toMatchObject({
      id: hevyLogId("a"), goalId: "fit", date: "2026-03-05", time: "18:00", tz: "UTC", minutes: 65, typeId: "strength", note: "Push day", source: "hevy",
    });
    expect(r.logs[0].exercises).toEqual([
      { exercise: "Bench Press", sets: 3, reps: 5, kg: 80 },
      { exercise: "Row", sets: 1, reps: 8, kg: 60 },
      { exercise: "Row", sets: 1, reps: 8, kg: 62.5 },
    ]);
  });

  it("is dated in your timezone, not Hevy's", () => {
    const late = workout("a", { start: "2026-03-05T23:30:00Z", end: "2026-03-06T00:30:00Z" });
    expect(run(feedOf(late), [], "Asia/Tokyo").logs[0]).toMatchObject({ date: "2026-03-06", time: "08:30" });
    expect(run(feedOf(late), [], "America/Los_Angeles").logs[0]).toMatchObject({ date: "2026-03-05", time: "15:30" });
  });

  it("converts weights for a pounds account", () => {
    const r = run(feedOf(workout("a")), [], "UTC", "lb");
    expect(r.logs[0].exercises![0].kg).toBe(176.4);
  });

  it("logs a run with no lifts as cardio, with no exercises", () => {
    const run1 = workout("r", { exercises: [{ title: "Running", sets: [{ type: "normal", kg: null, reps: null, seconds: 1800, meters: 5000 }] }] });
    const r = run(feedOf(run1));
    expect(r.logs[0]).toMatchObject({ typeId: "cardio" });
    expect(r.logs[0].exercises).toBeUndefined();
  });

  it("never lets a workout take less than a minute", () => {
    expect(run(feedOf(workout("a", { end: "2026-03-05T18:00:00Z" }))).logs[0].minutes).toBe(1);
  });

  it("leaves out the future", () => {
    expect(run(feedOf(workout("a", { start: "2026-03-20T10:00:00Z" }))).logs).toHaveLength(0);
  });
});

describe("running it again", () => {
  it("changes nothing when nothing changed", () => {
    const first = run(feedOf(workout("a"), workout("b", { start: "2026-03-06T18:00:00Z", end: "2026-03-06T19:00:00Z" })));
    const second = run(feedOf(workout("a"), workout("b", { start: "2026-03-06T18:00:00Z", end: "2026-03-06T19:00:00Z" })), first.logs);
    expect(second.logs).toEqual(first.logs);
    expect(second.added + second.updated + second.removed).toBe(0);
  });

  it("follows a workout edited in Hevy", () => {
    const first = run(feedOf(workout("a")));
    const edited = workout("a", { title: "Push day (heavy)", start: "2026-03-06T18:00:00Z", end: "2026-03-06T19:30:00Z" });
    const second = run(feedOf(edited), first.logs);
    expect(second.logs).toHaveLength(1);
    expect(second.logs[0]).toMatchObject({ id: hevyLogId("a"), date: "2026-03-06", minutes: 90, note: "Push day (heavy)", createdAt: 1000 });
    expect(second.updated).toBe(1);
  });

  it("removes a workout deleted in Hevy, but never everything on an empty answer", () => {
    const first = run(feedOf(workout("a"), workout("b", { start: "2026-03-06T18:00:00Z", end: "2026-03-06T19:00:00Z" })));
    const second = run(feedOf(workout("b", { start: "2026-03-06T18:00:00Z", end: "2026-03-06T19:00:00Z" })), first.logs);
    expect(second.logs.map((l) => l.id)).toEqual([hevyLogId("b")]);
    expect(second.removed).toBe(1);
    expect(run(feedOf(), first.logs).logs).toHaveLength(2);
  });

  it("two workouts in one day are both kept", () => {
    const r = run(feedOf(workout("a"), workout("b", { start: "2026-03-05T07:00:00Z", end: "2026-03-05T07:30:00Z" })));
    expect(r.logs).toHaveLength(2);
    expect(r.workouts).toBe(2);
  });
});

describe("workouts logged by hand", () => {
  it("win over an import on the same day", () => {
    const r = run(feedOf(workout("a")), [manual("2026-03-05")]);
    expect(r.logs.filter((l) => l.source)).toHaveLength(0);
    expect(r.skippedDays).toBe(1);
  });

  it("replace an import already there when the day is later logged by hand", () => {
    const first = run(feedOf(workout("a")));
    const second = run(feedOf(workout("a")), [...first.logs, manual("2026-03-05")]);
    expect(second.logs.map((l) => l.id)).toEqual(["m-2026-03-05"]);
    expect(second.removed).toBe(1);
  });

  it("do not stop entries for other goals", () => {
    const other: LogEntry = { ...manual("2026-03-05"), goalId: "rd" };
    expect(run(feedOf(workout("a")), [other]).logs.filter((l) => l.source)).toHaveLength(1);
  });
});

describe("exercises", () => {
  it("groups only sets that are identical and next to each other", () => {
    const w = workout("a", { exercises: [{ title: "Squat", sets: [...sets(2, 100, 5), ...sets(1, 100, 3), ...sets(1, 100, 5)] }] });
    expect(exercisesOf(w, "kg").map((e) => [e.sets, e.reps])).toEqual([[2, 5], [1, 3], [1, 5]]);
  });

  it("skips sets without weight and reps, and unnamed lifts", () => {
    const w = workout("a", { exercises: [{ title: "Plank", sets: sets(1, null, null) }, { title: " ", sets: sets(1, 20, 10) }] });
    expect(exercisesOf(w, "kg")).toEqual([]);
  });
});

describe("goals and saved data", () => {
  it("suggests the active fitness goal", () => {
    expect(suggestHevyGoal(goals)).toBe("fit");
    expect(suggestHevyGoal([{ ...fitness, archived: true }, reading])).toBeNull();
  });

  it("survives a backup, and an older backup without the link loads", () => {
    const data = { ...createEmptyData(today), hevy: { goalId: "fitness", connectedAt: "2026-03-01T00:00:00Z" } };
    const back = parseImport(toExport(data));
    expect(back.ok && back.data.hevy).toEqual(data.hevy);
    const { hevy: omitted, ...old } = data;
    void omitted;
    const restored = parseImport(JSON.stringify({ app: "lifeos", data: old }));
    expect(restored.ok && restored.data.hevy).toBeNull();
  });

  it("accepts imported entries from Hevy in a backup", () => {
    const base = createEmptyData(today);
    const log = { ...manual("2026-03-05"), goalId: base.goals[0].id, source: "hevy" as const };
    const back = parseImport(toExport({ ...base, logs: [log] }));
    expect(back.ok && back.data.logs[0].source).toBe("hevy");
  });
});

describe("the server's side", () => {
  afterEach(() => vi.unstubAllGlobals());
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("needs a key, and says how to add one", () => {
    expect(() => readKey({})).toThrow(/HEVY_API_KEY/);
    expect(readKey({ HEVY_API_KEY: " abc " })).toBe("abc");
  });

  it("trims Hevy's workouts to what LifeOS uses", () => {
    const feed = toFeed(
      [
        { id: "1", title: "A", start_time: "2026-03-05T18:00:00Z", end_time: "2026-03-05T19:00:00Z", exercises: [{ title: "Bench", sets: [{ type: "normal", weight_kg: 80, reps: 5, notes: "secret" } as never] }], description: "secret" } as never,
        { id: "2", start_time: "not a date" },
        { title: "no id", start_time: "2026-03-05T18:00:00Z" },
      ],
      "now",
    );
    expect(JSON.stringify(feed)).not.toContain("secret");
    expect(feed.workouts).toHaveLength(1);
    expect(feed.workouts[0].exercises[0].sets[0]).toEqual({ type: "normal", kg: 80, reps: 5, seconds: null, meters: null });
    expect(parseHevyFeed(feed)).not.toBeNull();
  });

  it("sends the key, and reads every page", async () => {
    const seen: { url: string; key: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, key: (init.headers as Record<string, string>)["api-key"] });
      const page = Number(new URL(url).searchParams.get("page"));
      return json({ page, page_count: 7, workouts: [{ id: `w${page}`, start_time: "2026-03-05T18:00:00Z", end_time: "2026-03-05T19:00:00Z", exercises: [] }] });
    });
    const feed = await fetchHevy("key-pages");
    expect(feed.workouts.map((w) => w.id)).toEqual(["w1", "w2", "w3", "w4", "w5", "w6", "w7"]);
    expect(seen.every((s) => s.key === "key-pages")).toBe(true);
    expect(seen[0].url).toContain("https://api.hevyapp.com/v1/workouts?page=1&pageSize=10");
  });

  it("explains a refused key without exposing it", async () => {
    vi.stubGlobal("fetch", async () => json({ error: "Unauthorized" }, 401));
    const error = await fetchHevy("key-secret-123").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HevyError);
    expect((error as Error).message).toMatch(/did not accept the API key/);
    expect((error as Error).message).not.toContain("key-secret-123");
  });

  it("asks to slow down on a rate limit", async () => {
    vi.stubGlobal("fetch", async () => json({}, 429));
    await expect(fetchHevy("key-rate")).rejects.toThrow(/slow down/);
  });
});
