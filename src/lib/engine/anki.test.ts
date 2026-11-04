import { describe, expect, it } from "vitest";
import { createGoal } from "../defaults";
import { parseImport, toExport } from "../io";
import { createEmptyData } from "../defaults";
import type { LogEntry } from "../types";
import { ankiLogId, importAnki, isLocalRequest, parseFeed, suggestMapping, type AnkiFeed } from "./anki";
import { derive } from "./derive";

const today = "2026-03-04";
const portuguese = createGoal("language", "2026-01-01", { id: "pt", name: "Portuguese" });
const mandarin = createGoal("language", "2026-01-01", { id: "zh", name: "Mandarin" });
const goals = [portuguese, mandarin];
const mapping = { portuguese: "pt", mandarin: "zh" };

const row = (date: string, deckId: string, reviews: number, studySeconds: number) => ({ date, deckId, reviews, studySeconds });
const feedOf = (...daily: ReturnType<typeof row>[]): AnkiFeed => ({
  generatedAt: "2026-03-04T10:00:00Z",
  dayStartHour: 1,
  decks: [{ id: "portuguese", name: "Portuguese" }, { id: "mandarin", name: "Mandarin" }, { id: "other", name: "Other decks" }],
  daily,
});
const run = (feed: AnkiFeed, logs: LogEntry[] = [], g = goals, m: Record<string, string> = mapping) =>
  importAnki({ feed, mapping: m, goals: g, logs, today, tz: "UTC", now: 1000 });

describe("reading the source", () => {
  const raw = {
    version: 1,
    data: {
      source: "anki",
      generatedAt: "2026-03-04T10:00:00Z",
      dayStartHour: 1,
      decks: [{ id: "portuguese", name: "Portuguese", color: 1, totalCards: 10 }],
      daily: [{ date: "2026-03-01", deckId: "portuguese", reviews: 5, again: 1, studySeconds: 60, matureReviews: 2 }],
      fsrs: { cards: [{ front: "secret card text" }], troubleCards: [{ front: "secret card text" }] },
    },
  };

  it("keeps only dates, decks and totals", () => {
    const parsed = parseFeed(raw);
    expect(parsed?.daily[0]).toEqual({ date: "2026-03-01", deckId: "portuguese", reviews: 5, studySeconds: 60 });
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(JSON.stringify(parsed)).not.toContain("fsrs");
  });

  it("reads live stats too", () => {
    expect(parseFeed(raw.data)?.decks[0]).toEqual({ id: "portuguese", name: "Portuguese" });
  });

  it("refuses a shape it does not recognise", () => {
    expect(parseFeed({ data: { daily: "nope" } })).toBeNull();
    expect(parseFeed(null)).toBeNull();
    expect(parseFeed({ ...raw.data, daily: [{ ...raw.data.daily[0], date: "soon" }] })).toBeNull();
  });
});

describe("who may call the route", () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it("allows this computer", () => {
    expect(isLocalRequest(headers({ host: "localhost:3000" }))).toBe(true);
    expect(isLocalRequest(headers({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }))).toBe(true);
  });

  it("refuses other sites and other devices", () => {
    expect(isLocalRequest(headers({ host: "evil.example" }))).toBe(false);
    expect(isLocalRequest(headers({ host: "192.168.1.20:3000" }))).toBe(false);
    expect(isLocalRequest(headers({ host: "localhost:3000", origin: "https://evil.example" }))).toBe(false);
    expect(isLocalRequest(headers({}))).toBe(false);
  });
});

describe("importing", () => {
  it("creates one read-only entry per goal per day", () => {
    const r = run(feedOf(row("2026-03-01", "portuguese", 80, 600), row("2026-03-01", "mandarin", 20, 300), row("2026-03-02", "portuguese", 40, 240)));
    expect([r.added, r.days, r.reviews, r.minutes]).toEqual([3, 3, 140, 19]);
    const log = r.logs.find((l) => l.id === ankiLogId("pt", "2026-03-01"));
    expect(log).toMatchObject({ source: "anki", minutes: 10, metrics: { reviews: 80 }, time: null, typeId: "flashcards", date: "2026-03-01" });
  });

  it("sums several decks into one goal", () => {
    const r = run(feedOf(row(today, "portuguese", 10, 60), row(today, "mandarin", 5, 60)), [], goals, { portuguese: "pt", mandarin: "pt" });
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0].metrics.reviews).toBe(15);
  });

  it("ignores decks that are not mapped", () => {
    expect(run(feedOf(row(today, "other", 50, 600))).logs).toEqual([]);
  });

  it("changes nothing when run again", () => {
    const first = run(feedOf(row(today, "portuguese", 10, 60)));
    const again = run(feedOf(row(today, "portuguese", 10, 60)), first.logs);
    expect([again.added, again.updated]).toEqual([0, 0]);
    expect(again.logs).toEqual(first.logs);
  });

  it("updates a day as more reviews come in", () => {
    const first = run(feedOf(row(today, "portuguese", 10, 60)));
    const later = run(feedOf(row(today, "portuguese", 30, 180)), first.logs);
    expect(later.updated).toBe(1);
    expect(later.logs).toHaveLength(1);
    expect(later.logs[0]).toMatchObject({ minutes: 3, metrics: { reviews: 30 } });
    expect(later.changedDates).toEqual([today]);
  });

  it("keeps history when cards are deleted in Anki", () => {
    const first = run(feedOf(row("2026-03-01", "portuguese", 100, 600), row("2026-03-02", "portuguese", 50, 300)));
    const later = run(feedOf(row("2026-03-02", "portuguese", 20, 120)), first.logs);
    expect(later.logs).toHaveLength(2);
    expect(later.logs.find((l) => l.date === "2026-03-02")?.metrics.reviews).toBe(50);
  });

  it("does not double-count a day logged by hand", () => {
    const manual: LogEntry = { id: "m", goalId: "pt", typeId: "flashcards", date: today, time: "09:00", tz: "UTC", minutes: 20, metrics: {}, createdAt: 1, updatedAt: 1 };
    const r = run(feedOf(row(today, "portuguese", 10, 60), row("2026-03-01", "portuguese", 10, 60)), [manual]);
    expect(r.skippedDays).toBe(1);
    expect(r.logs.map((l) => l.id).sort()).toEqual([ankiLogId("pt", "2026-03-01"), "m"].sort());
  });

  it("hands a day over if a session is logged by hand after importing", () => {
    const first = run(feedOf(row(today, "portuguese", 10, 60)));
    const manual: LogEntry = { id: "m", goalId: "pt", typeId: "flashcards", date: today, time: "09:00", tz: "UTC", minutes: 20, metrics: {}, createdAt: 1, updatedAt: 1 };
    const r = run(feedOf(row(today, "portuguese", 10, 60)), [...first.logs, manual]);
    expect(r.removed).toBe(1);
    expect(r.logs).toEqual([manual]);
  });

  it("leaves other kinds of session on the same day alone", () => {
    const study: LogEntry = { id: "s", goalId: "pt", typeId: "study", date: today, time: "09:00", tz: "UTC", minutes: 20, metrics: {}, createdAt: 1, updatedAt: 1 };
    const r = run(feedOf(row(today, "portuguese", 10, 60)), [study]);
    expect(r.logs).toHaveLength(2);
    expect(r.skippedDays).toBe(0);
  });

  it("recognises an older goal whose type is called Anki", () => {
    const old = { ...portuguese, activityTypes: [{ id: "anki", label: "Anki" }] };
    expect(run(feedOf(row(today, "portuguese", 10, 60)), [], [old, mandarin]).logs[0].typeId).toBe("anki");
  });

  it("can feed a goal of any kind", () => {
    const medicine = createGoal("custom", "2026-01-01", { id: "med", name: "Medicine" });
    const r = run(feedOf(row(today, "other", 10, 60)), [], [medicine], { other: "med" });
    const goal = r.goals[0];
    expect(goal.activityTypes.some((t) => t.label === "Flashcards")).toBe(true);
    expect(goal.metrics.some((m) => m.id === "reviews")).toBe(true);
  });

  it("uses Anki's own day, and skips anything dated after today", () => {
    const r = run(feedOf(row("2026-03-05", "portuguese", 10, 60), row("2026-03-03", "portuguese", 10, 60)));
    expect(r.logs.map((l) => l.date)).toEqual(["2026-03-03"]);
  });

  it("matches decks to goals by name", () => {
    const feed = feedOf();
    expect(suggestMapping(feed, goals)).toEqual({ portuguese: "pt", mandarin: "zh" });
    expect(suggestMapping(feed, [{ ...portuguese, archived: true }])).toEqual({});
  });
});

describe("imported activity in the app", () => {
  const data = () => {
    const d = createEmptyData("2026-01-01");
    d.settings.timezone = "UTC";
    d.goals.push(portuguese);
    return d;
  };

  it("counts towards hours, streaks and XP", () => {
    const d = data();
    const r = importAnki({ feed: feedOf(row("2026-03-03", "portuguese", 80, 600), row(today, "portuguese", 40, 300)), mapping, goals: d.goals, logs: [], today, tz: "UTC", now: 1 });
    d.logs = r.logs;
    d.goals = r.goals;
    const v = derive(d, new Date("2026-03-04T12:00:00Z"));
    const goal = v.byId.get("pt");
    expect(goal?.totals.minutes).toBe(15);
    expect(goal?.totals.metrics.reviews).toBe(120);
    expect(goal?.streak.current).toBe(2);
    expect(goal?.xp).toBeGreaterThan(0);
  });

  it("survives a backup and restore", () => {
    const d = data();
    d.anki = { mapping, deckNames: { portuguese: "Portuguese" }, connectedAt: "2026-03-04T10:00:00Z", importedThrough: null, dayStartHour: 1 };
    d.logs = run(feedOf(row(today, "portuguese", 10, 60))).logs;
    const res = parseImport(toExport(d));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.logs[0].source).toBe("anki");
      expect(res.data.anki?.mapping).toEqual(mapping);
    }
  });
});
