import { describe, expect, it } from "vitest";
import { createEmptyData } from "./defaults";
import { planReminder } from "./reminders";
import { createLog } from "./log";

const base = () => {
  const d = createEmptyData("2026-01-01");
  d.settings.timezone = "auto";
  return d;
};
// 2026-03-04 is a Wednesday.
const evening = new Date("2026-03-04T21:30:00Z");
const morning = new Date("2026-03-04T08:00:00Z");
const ask = (over: Partial<Parameters<typeof planReminder>[0]> = {}) =>
  planReminder({ data: base(), deviceTimezone: "UTC", hour: 20, now: evening, lastSent: null, ...over });

describe("planReminder", () => {
  it("waits for the chosen hour", () => {
    expect(ask({ now: morning })).toBeNull();
  });
  it("reminds in the evening when planned goals are open", () => {
    const r = ask();
    expect(r?.date).toBe("2026-03-04");
    expect(r?.body).toMatch(/still open today/);
  });
  it("only once a day", () => {
    expect(ask({ lastSent: "2026-03-04" })).toBeNull();
  });
  it("uses the device's clock for auto, not the server's", () => {
    // 21:30 UTC is 06:30 the next day in Tokyo, so it is still the morning there.
    expect(ask({ deviceTimezone: "Asia/Tokyo" })).toBeNull();
  });
  it("stays quiet when everything planned is done", () => {
    const data = base();
    const goal = data.goals.find((g) => g.schedules.at(-1)?.schedule.kind === "days") ?? data.goals[0];
    const first = ask({ data });
    expect(first).not.toBeNull();
    for (const g of data.goals) {
      data.logs.push(createLog({ goalId: g.id, typeId: null, minutes: Math.max(g.minMinutes, 30), metrics: {} }, "UTC", evening));
    }
    expect(goal).toBeDefined();
    expect(ask({ data })).toBeNull();
  });
});
