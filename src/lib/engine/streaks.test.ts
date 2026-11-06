import { describe, expect, it } from "vitest";
import type { Schedule, ScheduleEpoch } from "../types";
import { addDays, startOfWeek, todayIn, weekday } from "./dates";
import { computeOverallStreak, computeStreak, weekMarks, weekProgress, withSchedule } from "./streaks";

const daily: Schedule = { kind: "days", days: [0, 1, 2, 3, 4, 5, 6] };
const ep = (schedule: Schedule, from = "2026-01-01"): ScheduleEpoch[] => [{ from, schedule }];
const on = (...dates: string[]) => {
  const m = new Map<string, number>();
  for (const d of dates) m.set(d, (m.get(d) ?? 0) + 1);
  return m;
};
const run = (schedules: ScheduleEpoch[], sessions: Map<string, number>, today: string, pauses: { from: string; to: string }[] = []) =>
  computeStreak({ schedules, sessions, pauses, today, weekStartsOn: 1 });

// 2026-03-02 is a Monday.
describe("dates", () => {
  it("handles weekday and calendar week boundaries", () => {
    expect(weekday("2026-03-02")).toBe(1);
    expect(startOfWeek("2026-03-01", 1)).toBe("2026-02-23"); // Sunday belongs to the previous Mon-week
    expect(startOfWeek("2026-03-01", 0)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(startOfWeek("2027-01-01", 1)).toBe("2026-12-28"); // weeks cross the new year
  });

  it("crosses daylight-saving changes without skipping a day", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US spring forward
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // EU fall back
  });

  it("derives today from the wall clock in the chosen timezone", () => {
    const instant = new Date("2026-03-02T02:30:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-03-02");
    expect(todayIn("America/New_York", instant)).toBe("2026-03-01");
    expect(todayIn("Asia/Tokyo", instant)).toBe("2026-03-02");
  });
});

describe("daily streaks", () => {
  it("is zero with no activity", () => {
    const r = run(ep(daily), on(), "2026-03-02");
    expect([r.current, r.longest, r.runs.length]).toEqual([0, 0, 0]);
  });

  it("counts consecutive days including today", () => {
    expect(run(ep(daily), on("2026-03-01", "2026-03-02", "2026-03-03"), "2026-03-03").current).toBe(3);
  });

  it("keeps the streak alive while today is still open", () => {
    expect(run(ep(daily), on("2026-03-01", "2026-03-02"), "2026-03-03").current).toBe(2);
  });

  it("forgives one missed day without counting it", () => {
    const r = run(ep(daily), on("2026-03-01", "2026-03-02", "2026-03-03", "2026-03-05"), "2026-03-05");
    expect(r.current).toBe(4);
    expect(r.currentForgiven).toBe(1);
  });

  it("keeps a streak alive the day after a miss, and flags the rest day", () => {
    const r = run(ep(daily), on("2026-03-01"), "2026-03-03");
    expect([r.current, r.currentForgiven]).toEqual([1, 1]);
  });

  it("forgives only one day per streak", () => {
    const r = run(ep(daily), on("2026-03-01", "2026-03-02", "2026-03-04", "2026-03-06"), "2026-03-06");
    expect(r.current).toBe(1);
    expect(r.longest).toBe(3);
    expect(r.runs.map((x) => x.length)).toEqual([1, 3]);
  });

  it("is broken by two missed days in a row", () => {
    const r = run(ep(daily), on("2026-03-01"), "2026-03-04");
    expect(r.current).toBe(0);
    expect(r.longest).toBe(1);
  });

  it("counts several sessions in one day once", () => {
    expect(run(ep(daily), on("2026-03-02", "2026-03-02", "2026-03-02"), "2026-03-02").current).toBe(1);
  });

  it("lets a backdated entry repair a gap", () => {
    expect(run(ep(daily), on("2026-03-01", "2026-03-02", "2026-03-03"), "2026-03-03").current).toBe(3);
    expect(run(ep(daily), on("2026-03-01", "2026-03-03"), "2026-03-03").current).toBe(2);
    expect(run(ep(daily), on("2026-03-01", "2026-03-04"), "2026-03-04").current).toBe(1);
  });

  it("counts activity dated before the goal was created", () => {
    expect(run(ep(daily, "2026-03-03"), on("2026-02-28", "2026-03-01", "2026-03-02", "2026-03-03"), "2026-03-03").current).toBe(4);
  });

  it("does not let a planned break end the streak", () => {
    const r = run(ep(daily), on("2026-03-01", "2026-03-02", "2026-03-06"), "2026-03-06", [{ from: "2026-03-03", to: "2026-03-05" }]);
    expect(r.current).toBe(3);
  });
});

describe("specific-day schedules", () => {
  const mwf: Schedule = { kind: "days", days: [1, 3, 5] };

  it("skips rest days", () => {
    expect(run(ep(mwf), on("2026-03-02", "2026-03-04", "2026-03-06", "2026-03-09"), "2026-03-09").current).toBe(4);
  });

  it("does not break on a rest day with nothing logged", () => {
    expect(run(ep(mwf), on("2026-03-02", "2026-03-04"), "2026-03-05").current).toBe(2);
  });

  it("breaks when two scheduled days pass", () => {
    expect(run(ep(mwf), on("2026-03-02"), "2026-03-07").current).toBe(0);
  });

  it("counts a bonus session on a rest day", () => {
    expect(run(ep(mwf), on("2026-03-02", "2026-03-03", "2026-03-04"), "2026-03-04").current).toBe(3);
  });
});

describe("weekly streaks", () => {
  const w3: Schedule = { kind: "weekly", sessions: 3 };
  const wk1 = ["2026-03-02", "2026-03-04", "2026-03-06"];
  const wk2 = ["2026-03-09", "2026-03-10", "2026-03-11"];
  const wk3 = ["2026-03-16", "2026-03-18", "2026-03-20"];

  it("counts calendar weeks that hit the target", () => {
    const r = run(ep(w3), on(...wk1, ...wk2, ...wk3), "2026-03-20");
    expect(r.unit).toBe("week");
    expect(r.current).toBe(3);
  });

  it("does not need sessions on consecutive days", () => {
    expect(run(ep(w3), on(...wk1), "2026-03-09").current).toBe(1);
  });

  it("leaves the current unfinished week pending", () => {
    expect(run(ep(w3), on(...wk1, ...wk2, "2026-03-16"), "2026-03-17").current).toBe(2);
  });

  it("breaks when a finished week falls short", () => {
    const r = run(ep(w3), on(...wk1, "2026-03-09", "2026-03-10", ...wk3), "2026-03-23");
    expect(r.current).toBe(1);
    expect(r.longest).toBe(1);
  });

  it("assigns sessions on either side of the boundary to the right week", () => {
    // Sunday Mar 8 and Monday Mar 9 are in different Mon-start weeks.
    const sessions = on("2026-03-02", "2026-03-04", "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11");
    expect(run(ep(w3), sessions, "2026-03-12").current).toBe(2);
    const sundayStart = computeStreak({ schedules: ep(w3), sessions, pauses: [], today: "2026-03-12", weekStartsOn: 0 });
    expect(sundayStart.periods[0].count).toBe(2);
  });

  it("asks for a fair share of the first partial week", () => {
    // First session on a Friday: 3 of 7 days remain, so ceil(3 × 3/7) = 2 sessions are enough.
    expect(run(ep(w3), on("2026-03-06", "2026-03-07"), "2026-03-09").current).toBe(1);
  });

  it("scales the target for a week with a planned break", () => {
    const pauses = [{ from: "2026-03-09", to: "2026-03-15" }];
    expect(run(ep(w3), on(...wk1, ...wk3), "2026-03-23", pauses).current).toBe(2);
  });
});

describe("schedule changes", () => {
  it("judges the past by the schedule that applied then", () => {
    const before = ep({ kind: "days", days: [1, 3, 5] });
    const after = withSchedule(before, daily, "2026-03-09", 1);
    // Rest days before the change stay rest days. Days from the change on are all due.
    const r = run(after, on("2026-03-02", "2026-03-04", "2026-03-06", "2026-03-09", "2026-03-10"), "2026-03-10");
    expect(r.current).toBe(5);
  });

  it("carries a streak across a switch from daily to weekly", () => {
    const after = withSchedule(ep(daily), { kind: "weekly", sessions: 3 }, "2026-03-16", 1);
    const dates = Array.from({ length: 14 }, (_, i) => addDays("2026-03-02", i));
    const r = run(after, on(...dates, "2026-03-16", "2026-03-18", "2026-03-20"), "2026-03-23");
    expect(r.unit).toBe("week");
    expect(r.current).toBe(3); // two weeks of daily, one week at target
  });

  it("replaces a change made the same day", () => {
    const a = withSchedule(ep(daily), { kind: "days", days: [1] }, "2026-03-09", 1);
    const b = withSchedule(a, { kind: "days", days: [2] }, "2026-03-09", 1);
    expect(b.map((e) => e.from)).toEqual(["2026-01-01", "2026-03-09"]);
    expect(b[1].schedule).toEqual({ kind: "days", days: [2] });
  });
});

describe("overall streak", () => {
  const goals = [{ schedules: ep({ kind: "days", days: [1, 3, 5] } as Schedule), pauses: [], since: "2026-01-01" }];

  it("survives days when nothing was due", () => {
    expect(computeOverallStreak(new Set(["2026-03-02", "2026-03-04"]), goals, "2026-03-05").current).toBe(2);
  });

  it("breaks after two days something was due and nothing happened", () => {
    expect(computeOverallStreak(new Set(["2026-03-02"]), goals, "2026-03-07").current).toBe(0);
    expect(computeOverallStreak(new Set(["2026-03-02"]), goals, "2026-03-05").current).toBe(1);
  });

  describe("with a weekly goal", () => {
    const weekly = (...dates: string[]) => [{ schedules: ep({ kind: "weekly", sessions: 3 }), pauses: [], since: "2026-01-01", sessions: on(...dates), weekStartsOn: 1 as const }];
    const life = (dates: string[], today: string) => computeOverallStreak(new Set(dates), weekly(...dates), today);

    it("lets you skip days while the target is still reachable", () => {
      // 3 a week, Monday done: Tuesday to Thursday are free.
      expect(life(["2026-03-02"], "2026-03-05").current).toBe(1);
    });

    it("stops being free once the days left equal the sessions missing", () => {
      // Monday only, 2 more needed: from Saturday, both remaining days are owed. Missing both ends the streak.
      expect(life(["2026-03-02"], "2026-03-09").current).toBe(0);
      expect(life(["2026-03-02"], "2026-03-08").current).toBe(1);
    });

    it("is free for the rest of the week once the target is met", () => {
      const done = ["2026-03-02", "2026-03-03", "2026-03-04"];
      expect(life(done, "2026-03-08").current).toBe(3);
    });
  });
});

describe("week view", () => {
  it("reports sessions against a weekly target", () => {
    const p = weekProgress(ep({ kind: "weekly", sessions: 3 }), on("2026-03-02", "2026-03-04"), [], "2026-03-05", 1);
    expect([p.done, p.required, p.met, p.daysLeft]).toEqual([2, 3, false, 3]);
  });

  it("does not expect days before a goal began", () => {
    const every = ep(daily, "2026-03-04");
    const p = weekProgress(every, on(), [], "2026-03-04", 1, "2026-03-04");
    expect([p.done, p.required]).toEqual([0, 5]);
    expect(weekMarks(every, on(), [], "2026-03-04", 1, "2026-03-04").slice(0, 3).map((m) => m.mark)).toEqual(["rest", "rest", "due"]);
    const three = ep({ kind: "weekly", sessions: 3 }, "2026-03-05");
    expect(weekProgress(three, on(), [], "2026-03-05", 1, "2026-03-05").required).toBe(2);
  });

  it("marks rest, done, missed and due days", () => {
    const marks = weekMarks(ep({ kind: "days", days: [1, 3, 5] }), on("2026-03-02"), [], "2026-03-05", 1);
    expect(marks.map((m) => m.mark)).toEqual(["done", "rest", "missed", "rest", "due", "rest", "rest"]);
  });
});
