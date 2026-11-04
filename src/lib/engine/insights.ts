import type { ISODate } from "../types";
import { addDays, addMonths, startOfMonth, weekday } from "./dates";
import type { Derived } from "./derive";
import { inRange, totalsOf } from "./stats";
import { fmtHours, fmtNum, plural } from "../utils";

export interface Insight {
  id: string;
  icon: string;
  text: string;
  goalId: string | null;
  weight: number;
}

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** Plain statements from saved activity. Nothing appears without the data to back it. */
export const buildInsights = (d: Derived): Insight[] => {
  const out: Insight[] = [];
  const { today, totals } = d;

  if (totals.sessions === 0) return out;

  const last7 = inRange(d.logs, addDays(today, -6), today);
  const prev7 = inRange(d.logs, addDays(today, -13), addDays(today, -7));
  const a = totalsOf(last7);
  const b = totalsOf(prev7);
  if (b.minutes > 0 && a.minutes > b.minutes * 1.1) {
    out.push({ id: "up-7", icon: "trending-up", goalId: null, weight: 70, text: `${fmtHours(a.minutes)} in the last 7 days, up from ${fmtHours(b.minutes)} the week before.` });
  }
  if (a.activeDays >= 5) {
    out.push({ id: "days-7", icon: "calendar-check", goalId: null, weight: 60, text: `You showed up on ${a.activeDays} of the last 7 days.` });
  }

  for (const g of d.goals) {
    const { streak, goal, totals: t } = g;
    const unit = streak.unit;

    if (streak.current >= 3 && streak.longest > streak.current && streak.longest - streak.current <= 3) {
      const gap = streak.longest - streak.current;
      out.push({ id: `near-${goal.id}`, icon: "flame", goalId: goal.id, weight: 90, text: `${plural(gap, unit)} from your longest ${goal.name} streak of ${streak.longest}.` });
    } else if (streak.current >= 3 && streak.current === streak.longest) {
      out.push({ id: `best-${goal.id}`, icon: "flame", goalId: goal.id, weight: 85, text: `${goal.name} is on its longest streak yet: ${plural(streak.current, unit)}.` });
    }

    if (g.schedule.kind === "weekly" && !g.week.met && g.week.required - g.week.done === 1 && g.week.daysLeft > 0) {
      out.push({ id: `week-${goal.id}`, icon: "target", goalId: goal.id, weight: 80, text: `One more ${goal.kind === "fitness" ? "workout" : "session"} reaches this week's ${goal.name} target.` });
    }

    const near = g.milestones
      .filter((m) => !m.completedOn && m.progress !== null && m.progress >= 0.8 && m.auto && m.current !== null)
      .sort((x, y) => (y.progress ?? 0) - (x.progress ?? 0))[0];
    if (near?.auto) {
      const left = near.auto.metric === "measurement" ? null : near.auto.target - (near.current ?? 0);
      if (left !== null && left > 0) {
        const amount = near.unit === "hours" ? `${left.toFixed(1).replace(/\.0$/, "")} hours` : `${fmtNum(Math.ceil(left))} ${near.unit}`;
        out.push({ id: `ms-${near.id}`, icon: "flag", goalId: goal.id, weight: 75, text: `${amount} to go until "${near.title}".` });
      }
    }

    if (t.minutes >= 600) {
      const weeks = t.minutes / 60 / 40;
      out.push({
        id: `life-${goal.id}`,
        icon: "hourglass",
        goalId: goal.id,
        weight: 40 + Math.min(20, t.minutes / 600),
        text: weeks >= 1
          ? `${fmtHours(t.minutes)} into ${goal.name}, the same as ${weeks.toFixed(1).replace(/\.0$/, "")} full working weeks.`
          : `${fmtHours(t.minutes)} into ${goal.name} so far.`,
      });
    }

    if (g.logs.length >= 12) {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      for (const l of g.logs) counts[weekday(l.date)]++;
      const top = counts.indexOf(Math.max(...counts));
      if (counts[top] / g.logs.length >= 0.28) {
        out.push({ id: `day-${goal.id}`, icon: "calendar", goalId: goal.id, weight: 30, text: `${DAY_NAMES[top]} are your strongest ${goal.name} day.` });
      }
    }
  }

  // The main measurable output of any goal, against the same point last month.
  for (const g of d.goals) {
    const metric = g.goal.metrics[0];
    if (!metric || g.goal.kind === "reading" || g.goal.kind === "language") continue;
    const thisMonth = startOfMonth(today);
    const prevStart = addMonths(thisMonth, -1);
    const dayOfMonth = Number(today.slice(8)) - 1;
    const prevSameDay: ISODate = addDays(prevStart, dayOfMonth);
    const now = totalsOf(inRange(g.logs, thisMonth, today)).metrics[metric.id] ?? 0;
    const then = totalsOf(inRange(g.logs, prevStart, prevSameDay)).metrics[metric.id] ?? 0;
    if (now > 0 && then > 0 && now > then) {
      out.push({ id: `output-${g.goal.id}`, icon: "trending-up", goalId: g.goal.id, weight: 72, text: `${fmtNum(now)} ${metric.unit} so far this month, ahead of ${fmtNum(then)} at this point last month.` });
    }
  }

  return out.sort((x, y) => y.weight - x.weight);
};
