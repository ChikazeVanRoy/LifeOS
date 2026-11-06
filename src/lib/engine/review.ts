import type { Goal, ISODate } from "../types";
import { addDays, diffDays, endOfWeek, startOfWeek } from "./dates";
import type { Derived, GoalView, MilestoneView, RoadmapView } from "./derive";
import type { AchievementState } from "./achievements";
import type { RecordEvent, StrengthPR } from "./records";
import { inRange, totalsOf, type Totals } from "./stats";
import { fmtHours, plural } from "../utils";

export interface GoalWeek {
  view: GoalView;
  now: Totals;
  prev: Totals;
  /** Average weekly minutes over the four weeks before this one. */
  average: number;
  metTarget: boolean | null;
  streakKept: boolean;
}

export interface RoadmapWeek {
  roadmap: RoadmapView;
  minutes: number;
  /** Steps reached this week. */
  reached: MilestoneView[];
}

export interface WeekReview {
  start: ISODate;
  end: ISODate;
  isCurrent: boolean;
  totals: Totals;
  previous: Totals;
  goals: GoalWeek[];
  streaksKept: GoalWeek[];
  records: (RecordEvent & { goal: Goal })[];
  strengthPRs: (StrengthPR & { goal: Goal })[];
  achievements: AchievementState[];
  milestones: Derived["milestones"];
  quieter: GoalWeek[];
  /** Roadmaps that got time from their goals, or reached a step, this week. */
  roadmaps: RoadmapWeek[];
  headline: string;
  note: string;
  /** How the comparison figures are labelled. */
  compareLabel: string;
  priorities: { goalId: string | null; text: string }[];
}

/** Review the finished week, until the current one is nearly over. */
export const defaultReviewOffset = (d: Derived) => (diffDays(endOfWeek(d.today, d.weekStartsOn), d.today) <= 1 ? 0 : 1);

export const earliestWeek = (d: Derived): ISODate =>
  startOfWeek(d.totals.firstDate ?? d.today, d.weekStartsOn);

export const buildReview = (d: Derived, anyDayInWeek: ISODate): WeekReview => {
  const start = startOfWeek(anyDayInWeek, d.weekStartsOn);
  const end = endOfWeek(anyDayInWeek, d.weekStartsOn);
  const isCurrent = d.today >= start && d.today <= end;
  const within = (date: ISODate | null | undefined) => !!date && date >= start && date <= end;

  // An open week is compared with the same point last week, never with a whole week.
  const elapsed = isCurrent ? diffDays(d.today, start) : 6;
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(prevStart, elapsed);
  const totals = totalsOf(inRange(d.logs, start, end));
  const previous = totalsOf(inRange(d.logs, prevStart, prevEnd));

  const goals: GoalWeek[] = d.goals.map((view) => {
    const now = totalsOf(inRange(view.logs, start, end));
    const prev = totalsOf(inRange(view.logs, prevStart, prevEnd));
    const started = view.totals.firstDate;
    const weeksKnown = started ? Math.max(0, Math.min(4, Math.ceil(diffDays(start, started) / 7))) : 0;
    const past = totalsOf(inRange(view.logs, addDays(start, -28), addDays(start, -1)));
    const average = weeksKnown > 0 ? past.minutes / weeksKnown : 0;
    const week = view.streak.periods.filter((p) => p.end >= start && p.start <= end);
    const judged = week.filter((p) => p.status === "met" || p.status === "missed");
    const required = week.filter((p) => p.required > 0);
    const metTarget = required.length === 0 ? null : required.every((p) => p.status === "met");
    const streakKept = judged.some((p) => p.status === "met") && !judged.some((p) => p.status === "missed");
    return { view, now, prev, average, metTarget, streakKept };
  });

  const records = d.goals.flatMap((g) => g.recordEvents.filter((e) => within(e.date)).map((e) => ({ ...e, goal: g.goal })));
  const strengthPRs = d.goals.flatMap((g) => (g.strength?.prs ?? []).filter((p) => within(p.date)).map((p) => ({ ...p, goal: g.goal })));
  const achievements = d.achievements.filter((a) => within(a.unlockedOn));
  const milestones = d.milestones.filter((m) => within(m.completedOn));

  // Mid-week, it is too early to call a goal neglected.
  const quieter = isCurrent && elapsed < 5 ? [] : goals.filter((g) => {
    if (g.view.totals.sessions === 0) return false;
    return g.now.sessions === 0 || (g.average > 30 && g.now.minutes < g.average * 0.5);
  });
  const streaksKept = goals.filter((g) => g.streakKept);
  const roadmaps: RoadmapWeek[] = d.roadmaps
    .map((roadmap) => ({
      roadmap,
      minutes: roadmap.goals.reduce((t, g) => t + totalsOf(inRange(g.logs, start, end)).minutes, 0),
      reached: roadmap.milestones.filter((m) => within(m.completedOn)),
    }))
    .filter((r) => r.minutes > 0 || r.reached.length > 0);

  let headline: string;
  let note: string;
  if (totals.sessions === 0) {
    headline = isCurrent ? "A fresh week." : "A quiet week.";
    note = d.totals.sessions > 0
      ? `Time off is part of a long game. Your ${fmtHours(d.totals.minutes)} of lifetime work is still yours.`
      : "Your first entry will start the record.";
  } else if (previous.minutes > 0 && totals.minutes > previous.minutes * 1.1) {
    headline = `${fmtHours(totals.minutes)}, up from ${fmtHours(previous.minutes)}.`;
    note = isCurrent ? "Ahead of this point last week." : "More time in than the week before.";
  } else if (previous.minutes > 0 && totals.minutes < previous.minutes * 0.7) {
    headline = `${fmtHours(totals.minutes)} of real work.`;
    note = isCurrent ? "A slower start than last week, with days still to go." : "Lighter than last week. Weeks vary, and it is the long-run average that counts.";
  } else {
    headline = `${fmtHours(totals.minutes)} across ${plural(totals.activeDays, "day")}.`;
    note = previous.minutes > 0 ? "A steady week, close to the one before." : "A solid week on the record.";
  }

  const priorities: WeekReview["priorities"] = [];
  const untouched = [...quieter].sort((a, b) => a.now.minutes - b.now.minutes);
  for (const g of untouched.slice(0, 2)) {
    const pick = g.view.schedule.kind === "weekly" ? plural(Math.min(2, g.view.schedule.sessions), "session") : "a short daily session";
    priorities.push({ goalId: g.view.goal.id, text: `Bring ${g.view.goal.name} back with ${pick}. Even 15 minutes keeps it moving.` });
  }
  const closest = d.milestones
    .filter((m) => !m.completedOn && m.progress !== null && m.progress > 0 && m.goalId)
    .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
  if (closest) priorities.push({ goalId: closest.goalId, text: `Keep pushing towards "${closest.title}". You are ${Math.round((closest.progress ?? 0) * 100)}% of the way.` });
  const stalled = d.roadmaps.find((r) => r.next && r.goals.length > 0 && !roadmaps.some((x) => x.roadmap.id === r.id));
  if (stalled && !isCurrent) priorities.push({ goalId: stalled.goals[0].goal.id, text: `Nothing moved ${stalled.title} this week. Its next step is "${stalled.next!.title}".` });
  const strongest = [...goals].sort((a, b) => b.view.streak.current - a.view.streak.current)[0];
  if (strongest && strongest.view.streak.current >= 2) {
    priorities.push({ goalId: strongest.view.goal.id, text: `Protect your ${strongest.view.goal.name} streak of ${plural(strongest.view.streak.current, strongest.view.streak.unit)}.` });
  }
  if (priorities.length === 0) priorities.push({ goalId: null, text: "Pick one goal that matters most next week and give it the first hour." });

  return { start, end, isCurrent, totals, previous, goals, streaksKept, records, strengthPRs, achievements, milestones, quieter, roadmaps, headline, note, compareLabel: isCurrent ? "this point last week" : "last week", priorities: priorities.slice(0, 3) };
};
