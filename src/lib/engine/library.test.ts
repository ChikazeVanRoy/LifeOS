import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyData, createGoal } from "../defaults";
import { parseImport, toExport } from "../io";
import { fetchLibrary, LibraryError, parseEnv, readConfig, toFeed, type LibraryConfig } from "../server/library";
import type { LogEntry } from "../types";
import { importLibrary, libraryDoneId, libraryReadId, parseLibraryDate, parseLibraryFeed, suggestLibraryGoal, type LibraryBook, type LibraryFeed } from "./library";

const today = "2026-03-10";
const reading = createGoal("reading", "2026-01-01", { id: "rd", name: "Reading" });
const other = createGoal("fitness", "2026-01-01", { id: "fit", name: "Fitness" });
const goals = [reading, other];

const book = (over: Partial<LibraryBook> & { id: string }): LibraryBook => ({
  title: `Book ${over.id}`,
  pages: 300,
  status: "Read",
  finishDate: "05/03/2026",
  progress: null,
  ...over,
});
const feedOf = (...books: LibraryBook[]): LibraryFeed => ({ generatedAt: "2026-03-10T09:00:00Z", books });
const run = (feed: LibraryFeed, logs: LogEntry[] = [], seen: Record<string, number> = {}, baseline = false, day = today) =>
  importLibrary({ feed, goalId: "rd", seen, goals, logs, today: day, tz: "UTC", now: 1000, baseline });

const manual = (date: string, goalId = "rd"): LogEntry => ({
  id: `m-${date}`, goalId, typeId: null, date, time: null, tz: "UTC", minutes: 30, metrics: {}, createdAt: 1, updatedAt: 1,
});

const libraryEntry = (date: string, pages: number): LogEntry => ({
  id: libraryReadId("a", date), goalId: "rd", typeId: null, date, time: null, tz: "UTC", minutes: Math.round(pages * 1.5), metrics: { pages },
  note: "Book a", source: "library", createdAt: 1, updatedAt: 1,
});

describe("reading Library's answer", () => {
  it("keeps only the fields it needs", () => {
    const raw = { generatedAt: "x", books: [{ ...book({ id: "a" }), rating: 5, review: "secret thoughts", price: "12" }] };
    const parsed = parseLibraryFeed(raw);
    expect(Object.keys(parsed!.books[0]).sort()).toEqual(["finishDate", "id", "pages", "progress", "status", "title"]);
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("refuses a shape it does not recognise", () => {
    expect(parseLibraryFeed({ generatedAt: "x", books: [{ id: "a" }] })).toBeNull();
    expect(parseLibraryFeed(null)).toBeNull();
  });

  it("reads Library's dates", () => {
    expect(parseLibraryDate("05/03/2026")).toBe("2026-03-05");
    expect(parseLibraryDate("5.3.2026")).toBe("2026-03-05");
    expect(parseLibraryDate("2026-03-05")).toBe("2026-03-05");
    expect(parseLibraryDate("2026")).toBeNull();
    expect(parseLibraryDate("31/02/2026")).toBeNull();
    expect(parseLibraryDate("")).toBeNull();
  });
});

describe("finished books", () => {
  it("logs a book on the day it was finished, with its pages", () => {
    const r = run(feedOf(book({ id: "a", pages: 200 })));
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0]).toMatchObject({ id: libraryDoneId("a"), goalId: "rd", date: "2026-03-05", source: "library", metrics: { pages: 200 }, minutes: 300 });
    expect(r.logs[0].note).toBe("Finished Book a");
    expect(r.books).toBe(1);
    expect(r.pages).toBe(200);
    expect(r.since).toBe("2026-03-05");
  });

  it("is safe to run again", () => {
    const first = run(feedOf(book({ id: "a" })));
    const second = run(feedOf(book({ id: "a" })), first.logs);
    expect(second.logs).toEqual(first.logs);
    expect(second.added + second.updated + second.removed).toBe(0);
  });

  it("logs a book with no page count as a session without a duration", () => {
    const r = run(feedOf(book({ id: "a", pages: null })));
    expect(r.logs[0]).toMatchObject({ minutes: 0, metrics: {} });
  });

  it("moves an entry when the finish date is corrected, keeping its pages", () => {
    const first = run(feedOf(book({ id: "a", pages: 100 })));
    const second = run(feedOf(book({ id: "a", pages: 250, finishDate: "06/03/2026" })), first.logs);
    expect(second.logs).toHaveLength(1);
    expect(second.logs[0]).toMatchObject({ date: "2026-03-06", metrics: { pages: 100 } });
    expect(second.updated).toBe(1);
  });

  it("leaves out books with only a month or year, and the future", () => {
    const r = run(feedOf(book({ id: "a", finishDate: "2026" }), book({ id: "b", finishDate: "20/03/2026" }), book({ id: "c", finishDate: "" })));
    expect(r.logs).toHaveLength(0);
    expect(r.undated).toBe(2);
  });

  it("ignores books you only want to read, and other goals", () => {
    const r = run(feedOf(book({ id: "a", status: "Want to Read" })));
    expect(r.logs).toHaveLength(0);
    expect(run(feedOf(book({ id: "a" })), [manual("2026-03-01", "fit")]).logs.filter((l) => l.source)).toHaveLength(1);
  });

  it("adds a pages measure to a goal that lacks one, and leaves the others alone", () => {
    const bare = { ...reading, metrics: [] };
    const r = importLibrary({ feed: feedOf(book({ id: "a", pages: 10 })), goalId: "rd", seen: {}, goals: [bare, other], logs: [], today, tz: "UTC", now: 1 });
    expect(r.goals[0].metrics.map((m) => m.id)).toEqual(["pages"]);
    expect(r.goals[1]).toBe(other);
  });
});

describe("reading by hand", () => {
  it("wins over an import on the same day", () => {
    const r = run(feedOf(book({ id: "a" })), [manual("2026-03-05")]);
    expect(r.logs.filter((l) => l.source)).toHaveLength(0);
    expect(r.skippedDays).toBe(1);
  });

  it("replaces an import already there when a day is later logged by hand", () => {
    const first = run(feedOf(book({ id: "a" })));
    const second = run(feedOf(book({ id: "a" })), [...first.logs, manual("2026-03-05")]);
    expect(second.logs.map((l) => l.id)).toEqual(["m-2026-03-05"]);
    expect(second.removed).toBe(1);
  });
});

describe("books being read", () => {
  const at = (progress: number, over: Partial<LibraryBook> = {}) => book({ id: "a", status: "Reading", finishDate: "", progress, ...over });

  it("notes the page on first sight without logging it", () => {
    const r = run(feedOf(at(120)), [], {}, true);
    expect(r.logs).toHaveLength(0);
    expect(r.seen).toEqual({ a: 120 });
    const unseen = run(feedOf(at(120)));
    expect(unseen.logs).toHaveLength(0);
    expect(unseen.seen).toEqual({ a: 120 });
  });

  it("logs pages as they move, on the day they were seen", () => {
    const r = run(feedOf(at(150)), [], { a: 120 });
    expect(r.logs[0]).toMatchObject({ id: libraryReadId("a", today), date: today, metrics: { pages: 30 }, minutes: 45, source: "library" });
    expect(r.seen).toEqual({ a: 150 });
  });

  it("adds to the day's entry as more pages are read, and never twice for the same page", () => {
    const one = run(feedOf(at(150)), [], { a: 120 });
    const again = run(feedOf(at(150)), one.logs, one.seen);
    expect(again.logs).toEqual(one.logs);
    const more = run(feedOf(at(170)), one.logs, one.seen);
    expect(more.logs).toHaveLength(1);
    expect(more.logs[0].metrics.pages).toBe(50);
    expect(more.logs[0].minutes).toBe(75);
  });

  it("starts a new entry the next day", () => {
    const one = run(feedOf(at(150)), [], { a: 120 });
    const next = run(feedOf(at(160)), one.logs, one.seen, false, "2026-03-11");
    expect(next.logs.map((l) => l.date).sort()).toEqual(["2026-03-10", "2026-03-11"]);
  });

  it("puts pages on the day the reading log says they were read, not the day they were seen", () => {
    // Seen at 120 on the 9th; read to 140 late that night, then to 160 on the 10th, synced on the 10th.
    const moves = [
      { from: 100, to: 120, at: "2026-03-09T10:00:00Z" },
      { from: 120, to: 140, at: "2026-03-09T23:40:00Z" },
      { from: 140, to: 160, at: "2026-03-10T08:00:00Z" },
    ];
    const yesterday = { ...libraryEntry("2026-03-09", 20) };
    const r = run(feedOf(at(160, { moves })), [yesterday], { a: 120 });
    const byDate = Object.fromEntries(r.logs.map((l) => [l.date, l.metrics.pages]));
    expect(byDate).toEqual({ "2026-03-09": 40, "2026-03-10": 20 });
    expect(r.seen).toEqual({ a: 160 });
    // Seen again with nothing new: nothing moves.
    expect(run(feedOf(at(160, { moves })), r.logs, r.seen).logs).toEqual(r.logs);
  });

  it("uses the time zone for the day, and counts a typo put right once", () => {
    const moves = [
      { from: 120, to: 900, at: "2026-03-10T03:00:00Z" },
      { from: 900, to: 130, at: "2026-03-10T03:01:00Z" },
      { from: 130, to: 150, at: "2026-03-10T09:00:00Z" },
    ];
    const r = importLibrary({ feed: feedOf(at(150, { moves })), goalId: "rd", seen: { a: 120 }, goals, logs: [], today, tz: "America/New_York", now: 1000 });
    // 03:00Z is still the 9th in New York; the typo reaches no further than the page now.
    expect(Object.fromEntries(r.logs.map((l) => [l.date, l.metrics.pages]))).toEqual({ "2026-03-09": 30 });
  });

  it("puts what the log doesn't cover on today", () => {
    const moves = [{ from: 120, to: 130, at: "2026-03-08T12:00:00Z" }];
    const r = run(feedOf(at(150, { moves })), [], { a: 120 });
    expect(Object.fromEntries(r.logs.map((l) => [l.date, l.metrics.pages]))).toEqual({ "2026-03-08": 10, [today]: 20 });
  });

  describe("putting earlier days right, once", () => {
    // Read 100→140 late on the 8th and 140→160 on the 9th, but synced each next morning.
    const moves = [
      { from: 100, to: 140, at: "2026-03-08T23:30:00Z" },
      { from: 140, to: 160, at: "2026-03-09T20:00:00Z" },
    ];
    const wrong = [libraryEntry("2026-03-09", 40), libraryEntry("2026-03-10", 20)];
    const repair = (logs: LogEntry[], progress = 160, list = moves) =>
      importLibrary({ feed: feedOf(at(progress, { moves: list })), goalId: "rd", seen: { a: 160 }, goals, logs, today, tz: "UTC", now: 1000, repair: true });
    const byDate = (logs: LogEntry[]) => Object.fromEntries(logs.filter((l) => l.source).map((l) => [l.date, l.metrics.pages]));

    it("moves pages to the days they were read, keeping the total", () => {
      const r = repair(wrong);
      expect(r.repaired).toBe(true);
      expect(byDate(r.logs)).toEqual({ "2026-03-08": 40, "2026-03-09": 20 });
      expect(r.pages).toBe(60);
      expect(repair(r.logs).logs).toEqual(r.logs);
    });

    it("adds today's new pages after putting the days right", () => {
      const r = repair(wrong, 170, [...moves, { from: 160, to: 170, at: "2026-03-10T08:00:00Z" }]);
      expect(byDate(r.logs)).toEqual({ "2026-03-08": 40, "2026-03-09": 20, [today]: 10 });
    });

    it("leaves days before the log, and hand-logged days, alone, and never counts more than was logged", () => {
      const older = libraryEntry("2026-03-01", 50);
      const r = repair([older, ...wrong, manual("2026-03-08")]);
      // The 8th was logged by hand, so its 40 pages stay with the earliest day Library had.
      expect(byDate(r.logs)).toEqual({ "2026-03-01": 50, "2026-03-09": 60 });
    });

    it("never puts leftover pages on a hand-logged day", () => {
      const early = libraryEntry("2026-03-08", 30);
      const r = repair([early, libraryEntry("2026-03-09", 30), manual("2026-03-08")]);
      expect(byDate(r.logs)["2026-03-08"]).toBeUndefined();
      expect(Object.values(byDate(r.logs)).reduce((a, b) => a + b, 0)).toBe(60);
    });

    it("repairs each book once, and waits for one whose reading log hasn't come", () => {
      const feed = feedOf(at(160, { moves }), { ...at(50, {}), id: "b", title: "B" });
      const run = (repairedBooks: string[]) =>
        importLibrary({ feed, goalId: "rd", seen: { a: 160, b: 50 }, goals, logs: wrong, today, tz: "UTC", now: 1000, repair: true, repairedBooks });
      const first = run([]);
      expect(first.repairedBooks).toEqual(["a"]);
      expect(first.repairDone).toBe(false);
      expect(run(["a"]).repaired).toBe(false);
    });

    it("waits for the reading log, and does nothing on a first import", () => {
      expect(repair(wrong, 160, []).repaired).toBe(false);
      const first = importLibrary({ feed: feedOf(at(160, { moves })), goalId: "rd", seen: {}, goals, logs: [], today, tz: "UTC", now: 1000, repair: true, baseline: true });
      expect(first.repaired).toBe(false);
    });
  });

  it("ignores a page that went backwards, and keeps following from there", () => {
    const r = run(feedOf(at(100)), [], { a: 150 });
    expect(r.logs).toHaveLength(0);
    expect(r.seen).toEqual({ a: 100 });
  });

  it("does not log when reading was already logged by hand today", () => {
    const r = run(feedOf(at(150)), [manual(today)], { a: 120 });
    expect(r.logs.filter((l) => l.source)).toHaveLength(0);
    expect(r.seen).toEqual({ a: 150 });
  });

  it("counts only the pages left when the book is finished", () => {
    const r = run(feedOf(book({ id: "a", pages: 400 })), [], { a: 300 });
    expect(r.logs[0]).toMatchObject({ id: libraryDoneId("a"), metrics: { pages: 100 } });
    expect(r.seen).toEqual({ a: 300 });
    const again = run(feedOf(book({ id: "a", pages: 400 })), r.logs, r.seen);
    expect(again.logs).toEqual(r.logs);
  });

  it("does not log a finish when every page was already counted, and stays that way", () => {
    const r = run(feedOf(book({ id: "a", pages: 400 })), [], { a: 400 });
    expect(r.logs).toHaveLength(0);
    expect(run(feedOf(book({ id: "a", pages: 400 })), r.logs, r.seen).logs).toHaveLength(0);
  });

  it("forgets books that are no longer being read or finished", () => {
    expect(run(feedOf(), [], { a: 100 }).seen).toEqual({});
  });
});

describe("goals", () => {
  it("suggests the active reading goal", () => {
    expect(suggestLibraryGoal(goals)).toBe("rd");
    expect(suggestLibraryGoal([{ ...reading, archived: true }, other])).toBeNull();
    expect(suggestLibraryGoal([other, { ...other, id: "x", name: "Book club", kind: "custom" }])).toBe("x");
  });
});

describe("saved data", () => {
  it("survives a backup and restore, and an older backup without the link loads", () => {
    const data = createEmptyData(today);
    const linked = { ...data, library: { goalId: "reading", connectedAt: "2026-03-01T00:00:00Z", seen: { a: 12 } } };
    const back = parseImport(toExport(linked));
    expect(back.ok && back.data.library).toEqual(linked.library);
    const { library: _omitted, ...old } = linked;
    void _omitted;
    const restored = parseImport(JSON.stringify({ app: "lifeos", data: old }));
    expect(restored.ok && restored.data.library).toBeNull();
  });
});

describe("the server's side", () => {
  it("reads an env file", () => {
    expect(parseEnv(`# note\nVITE_A=https://x.supabase.co\nexport B="quoted value"\nC='single' \nD=plain # trailing\n\nbad line`)).toEqual({
      VITE_A: "https://x.supabase.co", B: "quoted value", C: "single", D: "plain",
    });
  });

  it("builds the feed from Library's rows, trimmed", () => {
    const feed = toFeed(
      [
        { book_id: "1", status: "Read", finish_date: "01/02/2026", progress: null },
        { book_id: "2", status: "Reading", finish_date: "", progress: 42 },
        { book_id: "3", status: "Want to Read" },
        { book_id: "gone", status: "Read" },
      ],
      [
        { id: "1", title: "One", volume: "3", pages: "320 pp" },
        { id: "2", title: "Two", pages: "" },
        { id: "3", title: "Three" },
      ],
      "now",
    );
    expect(feed.books).toEqual([
      { id: "1", title: "One 3", pages: 320, status: "Read", finishDate: "01/02/2026", progress: null },
      { id: "2", title: "Two", pages: null, status: "Reading", finishDate: "", progress: 42 },
    ]);
    expect(parseLibraryFeed(feed)).not.toBeNull();
  });

  it("needs a sign-in, and says how to add one", async () => {
    await expect(readConfig({})).rejects.toThrow(/LIBRARY_EMAIL/);
  });

  it("takes the address from the environment and refuses a plain http one", async () => {
    const ok = await readConfig({ LIBRARY_EMAIL: "a@b.c", LIBRARY_PASSWORD: "pw", LIBRARY_SUPABASE_URL: "https://x.supabase.co/", LIBRARY_SUPABASE_ANON_KEY: "k" });
    expect(ok).toMatchObject({ url: "https://x.supabase.co", person: "chikaze" });
    await expect(readConfig({ LIBRARY_EMAIL: "a@b.c", LIBRARY_PASSWORD: "pw", LIBRARY_SUPABASE_URL: "http://x.test", LIBRARY_SUPABASE_ANON_KEY: "k" })).rejects.toThrow(/https/);
  });
});

describe("talking to Supabase", () => {
  const config: LibraryConfig = { url: "https://x.supabase.co", anonKey: "anon", email: "me@example.com", password: "pw", person: "chikaze" };
  afterEach(() => vi.unstubAllGlobals());

  const stub = (handler: (url: string, init: RequestInit) => Response) => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return handler(url, init);
    });
    return calls;
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("signs in once, reads this person's books, and sends the token", async () => {
    const calls = stub((url) => {
      if (url.includes("/auth/v1/token")) return json({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/readings?")) return json([{ book_id: "1", status: "Read", finish_date: "01/02/2026", progress: null }]);
      return json([{ id: "1", title: "One", volume: "", pages: "100" }]);
    });
    const feed = await fetchLibrary({ ...config, email: "a1@example.com" });
    expect(feed.books).toEqual([{ id: "1", title: "One", pages: 100, status: "Read", finishDate: "01/02/2026", progress: null }]);
    const readings = calls.find((c) => c.url.includes("/readings?"))!;
    expect(readings.url).toContain("person=eq.chikaze");
    expect((readings.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: "a1@example.com", password: "pw" });
  });

  it("falls back when Library's database lacks the newer columns", async () => {
    stub((url) => {
      if (url.includes("/auth/v1/token")) return json({ access_token: "tok" });
      if (url.includes("progress")) return json({ message: "column does not exist" }, 400);
      if (url.includes("pages")) return json({ message: "column does not exist" }, 400);
      if (url.includes("/readings?")) return json([{ book_id: "1", status: "Reading", finish_date: "" }]);
      return json([{ id: "1", title: "One" }]);
    });
    const feed = await fetchLibrary({ ...config, email: "a2@example.com" });
    expect(feed.books[0]).toMatchObject({ pages: null, progress: null, status: "Reading" });
  });

  it("reads this person's reading log for the days pages were read, and does without it", async () => {
    const calls = stub((url) => {
      if (url.includes("/auth/v1/token")) return json({ access_token: "tok" });
      if (url.includes("/reading_log?")) return json([{ book_id: "1", from_page: 10, to_page: 30, at: "2026-03-09T23:30:00+00:00" }]);
      if (url.includes("/readings?")) return json([{ book_id: "1", status: "Reading", finish_date: "", progress: 30 }]);
      return json([{ id: "1", title: "One", pages: "100" }]);
    });
    const feed = await fetchLibrary({ ...config, email: "a5@example.com" });
    expect(feed.books[0].moves).toEqual([{ from: 10, to: 30, at: "2026-03-09T23:30:00+00:00" }]);
    expect(calls.find((c) => c.url.includes("/reading_log?"))!.url).toContain("person=eq.chikaze");
    expect(parseLibraryFeed(feed)).not.toBeNull();

    stub((url) => {
      if (url.includes("/auth/v1/token")) return json({ access_token: "tok" });
      if (url.includes("/reading_log?")) return json({ message: "relation does not exist" }, 404);
      if (url.includes("/readings?")) return json([{ book_id: "1", status: "Reading", finish_date: "", progress: 30 }]);
      return json([{ id: "1", title: "One", pages: "100" }]);
    });
    const without = await fetchLibrary({ ...config, email: "a6@example.com" });
    expect(without.books[0]).toMatchObject({ progress: 30 });
    expect(without.books[0].moves).toBeUndefined();
  });

  it("explains a refused sign-in without exposing the password", async () => {
    stub(() => json({ error: "invalid_grant" }, 400));
    const error = await fetchLibrary({ ...config, email: "a3@example.com", password: "hunter2" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LibraryError);
    expect((error as Error).message).toMatch(/did not accept the sign-in/);
    expect((error as Error).message).not.toContain("hunter2");
  });

  it("reads past the first thousand rows", async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: `b${i}`, title: "T" }));
    let books = 0;
    stub((url) => {
      if (url.includes("/auth/v1/token")) return json({ access_token: "tok" });
      if (url.includes("/readings?") || url.includes("/reading_log?")) return json([]);
      return json(books++ === 0 ? many : [{ id: "last", title: "T" }]);
    });
    await fetchLibrary({ ...config, email: "a4@example.com" });
    expect(books).toBe(2);
  });
});
