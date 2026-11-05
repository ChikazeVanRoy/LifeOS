import type { Goal, ISODate, LogEntry, Measurement, Project } from "../types";
import { addDays, startOfWeek } from "./dates";
import { crossing } from "./stats";
import type { StrengthPR } from "./records";
import type { StreakResult } from "./streaks";

export type Tier = "bronze" | "silver" | "gold" | "legend";

export interface AchievementState {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: Tier;
  goalId: string | null;
  value: number;
  target: number;
  unit: string;
  progress: number;
  unlockedOn: ISODate | null;
}

export interface GoalFacts {
  goal: Goal;
  logs: LogEntry[];
  streak: StreakResult;
  projects: Project[];
  prs: StrengthPR[];
  measurements: Measurement[];
}

interface Spec {
  key: string;
  title: string;
  description: string;
  icon: string;
  tier: Tier;
  target: number;
  unit: string;
  check: (f: GoalFacts, target: number) => { value: number; date: ISODate | null };
}

const hours = (target: number, tier: Tier, title: string, what: string): Spec => ({
  key: `hours-${target}`,
  title,
  description: `${target.toLocaleString()} hours of ${what}`,
  icon: "hourglass",
  tier,
  target,
  unit: "hours",
  check: ({ logs }, t) => {
    const c = crossing(logs, (l) => l.minutes, t * 60);
    return { value: c.value / 60, date: c.date };
  },
});

const sessions = (target: number, tier: Tier, title: string, what: string, icon = "check-check"): Spec => ({
  key: `sessions-${target}`,
  title,
  description: `${target.toLocaleString()} ${what}`,
  icon,
  tier,
  target,
  unit: what,
  check: ({ logs }, t) => crossing(logs, () => 1, t),
});

const first = (title: string, description: string): Spec => ({
  key: "first",
  title,
  description,
  icon: "sprout",
  tier: "bronze",
  target: 1,
  unit: "session",
  check: ({ logs }, t) => crossing(logs, () => 1, t),
});

const metric = (id: string, target: number, tier: Tier, title: string, unit: string, icon: string): Spec => ({
  key: `${id}-${target}`,
  title,
  description: `${target.toLocaleString()} ${unit} in total`,
  icon,
  tier,
  target,
  unit,
  check: ({ logs }, t) => crossing(logs, (l) => l.metrics[id] ?? 0, t),
});

/** Consecutive days or weeks. Weekly-schedule goals still report days in `weeks` mode only. */
const streakOf = (target: number, unit: "day" | "week", tier: Tier, title: string): Spec => ({
  key: `streak-${unit}-${target}`,
  title,
  description: unit === "day" ? `Keep a streak for ${target} days` : `Hit the target ${target} weeks running`,
  icon: "flame",
  tier,
  target,
  unit: `${unit}s`,
  check: ({ streak }, t) => {
    const match = streak.timeline.find((p) => p.unit === unit && p.length >= t);
    return { value: streak.unit === unit ? streak.longest : 0, date: match?.date ?? null };
  },
});

const projectsDone = (kind: Project["kind"], target: number, tier: Tier, title: string, what: string, icon: string): Spec => ({
  key: `${kind}-${target}`,
  title,
  description: target === 1 ? `Finish your first ${what}` : `Finish ${target} ${what}s`,
  icon,
  tier,
  target,
  unit: `${what}s`,
  check: ({ projects }, t) => {
    const done = projects
      .filter((p) => p.kind === kind && p.finishedAt)
      .map((p) => p.finishedAt as ISODate)
      .sort();
    return { value: done.length, date: done[t - 1] ?? null };
  },
});

const streaksFor = (goal: Goal, prefix = ""): Spec[] => {
  const weekly = goal.schedules[goal.schedules.length - 1].schedule.kind === "weekly";
  return weekly
    ? [
        streakOf(4, "week", "bronze", `${prefix}4 Consistent Weeks`),
        streakOf(12, "week", "silver", `${prefix}12 Consistent Weeks`),
        streakOf(26, "week", "gold", `${prefix}26 Consistent Weeks`),
        streakOf(52, "week", "legend", `${prefix}A Full Year of Weeks`),
      ]
    : [
        streakOf(7, "day", "bronze", `${prefix}7-Day Streak`),
        streakOf(30, "day", "silver", `${prefix}30-Day Streak`),
        streakOf(100, "day", "gold", `${prefix}100-Day Streak`),
        streakOf(365, "day", "legend", `${prefix}365-Day Streak`),
      ];
};

const specsFor = (goal: Goal): Spec[] => {
  switch (goal.kind) {
    case "creative": {
      const words = goal.metrics.some((m) => m.id === "words");
      const units = goal.metrics.find((m) => m.id === "chapters" || m.id === "pieces");
      const singular = units?.label.replace(/s$/, "");
      return [
        first("First Creative Session", "Log your first creative session"),
        hours(10, "bronze", "10 Creative Hours", goal.name),
        hours(100, "silver", "100 Creative Hours", goal.name),
        hours(1000, "legend", "1,000 Creative Hours", goal.name),
        ...(words
          ? [
              metric("words", 10_000, "bronze", "10,000 Words", "words", "pen-line"),
              metric("words", 50_000, "silver", "50,000 Words", "words", "pen-line"),
              metric("words", 100_000, "gold", "100,000 Words", "words", "pen-line"),
              metric("words", 1_000_000, "legend", "A Million Words", "words", "pen-line"),
            ]
          : []),
        ...(units
          ? [
              metric(units.id, 1, "bronze", `First ${singular}`, units.unit, "bookmark"),
              metric(units.id, 25, "silver", `25 ${units.label}`, units.unit, "bookmark"),
            ]
          : []),
        projectsDone("project", 1, "gold", "First Project Finished", "project", "book-marked"),
        projectsDone("project", 3, "legend", "Three Projects Finished", "project", "library"),
        ...streaksFor(goal),
      ];
    }
    case "language":
      return [
        first(`First ${goal.name} Session`, "Log your first study session"),
        hours(10, "bronze", "10 Hours Studied", goal.name),
        hours(100, "silver", "100 Hours Studied", goal.name),
        hours(500, "gold", "500 Hours Studied", goal.name),
        hours(1000, "legend", "1,000 Hours Studied", goal.name),
        ...streaksFor(goal),
      ];
    case "fitness":
      return [
        first("First Workout", "Log your first workout"),
        sessions(10, "bronze", "10 Workouts", "workouts", "dumbbell"),
        sessions(50, "silver", "50 Workouts", "workouts", "dumbbell"),
        sessions(100, "gold", "100 Workouts", "workouts", "dumbbell"),
        sessions(500, "legend", "500 Workouts", "workouts", "dumbbell"),
        ...streaksFor(goal),
        {
          key: "pr-1",
          title: "New Strength Personal Record",
          description: "Beat a previous best on any lift",
          icon: "trophy",
          tier: "bronze",
          target: 1,
          unit: "records",
          check: ({ prs }, t) => ({ value: prs.length, date: prs[t - 1]?.date ?? null }),
        },
        {
          key: "pr-25",
          title: "25 Personal Records",
          description: "Beat your best 25 times",
          icon: "trophy",
          tier: "gold",
          target: 25,
          unit: "records",
          check: ({ prs }, t) => ({ value: prs.length, date: prs[t - 1]?.date ?? null }),
        },
      ];
    case "reading":
      return [
        first("First Pages", "Log your first reading session"),
        projectsDone("book", 1, "bronze", "First Book Finished", "book", "book-check"),
        projectsDone("book", 10, "silver", "10 Books", "book", "library"),
        projectsDone("book", 50, "gold", "50 Books", "book", "library"),
        projectsDone("book", 100, "legend", "100 Books", "book", "library"),
        hours(10, "bronze", "10 Reading Hours", "reading"),
        hours(100, "silver", "100 Reading Hours", "reading"),
        metric("pages", 1000, "bronze", "1,000 Pages", "pages", "file-text"),
        metric("pages", 10_000, "gold", "10,000 Pages", "pages", "file-text"),
        ...streaksFor(goal),
      ];
    case "career":
      return [
        first("First Learning Session", "Log your first learning session"),
        hours(10, "bronze", "10 Hours Learning", "learning"),
        hours(100, "silver", "100 Hours Learning", "learning"),
        hours(500, "gold", "500 Hours Learning", "learning"),
        projectsDone("certification", 1, "silver", "First Certification", "certification", "award"),
        projectsDone("certification", 5, "gold", "Five Certifications", "certification", "award"),
        ...streaksFor(goal),
      ];
    default:
      return [
        first(`First ${goal.name} Session`, "Log your first session"),
        hours(10, "bronze", "10 Hours In", goal.name),
        hours(100, "silver", "100 Hours In", goal.name),
        hours(500, "gold", "500 Hours In", goal.name),
        ...streaksFor(goal),
      ];
  }
};

const toState = (spec: Spec, id: string, goalId: string | null, value: number, date: ISODate | null): AchievementState => {
  const shown = date ? Math.max(value, spec.target) : value;
  return {
    id,
    title: spec.title,
    description: spec.description,
    icon: spec.icon,
    tier: spec.tier,
    goalId,
    value: shown,
    target: spec.target,
    unit: spec.unit,
    progress: date ? 1 : Math.min(0.99, value / spec.target),
    unlockedOn: date,
  };
};

export interface GlobalFacts {
  goalLogs: { goal: Goal; logs: LogEntry[] }[];
  overall: StreakResult;
  milestoneDates: ISODate[];
  weekStartsOn: 0 | 1;
}

const globalAchievements = ({ goalLogs, overall, milestoneDates, weekStartsOn }: GlobalFacts): AchievementState[] => {
  const all = goalLogs.flatMap((g) => g.logs).sort((a, b) => a.date.localeCompare(b.date));
  const out: AchievementState[] = [];
  const add = (key: string, title: string, description: string, icon: string, tier: Tier, target: number, unit: string, value: number, date: ISODate | null) =>
    out.push(toState({ key, title, description, icon, tier, target, unit, check: () => ({ value, date }) }, `life:${key}`, null, value, date));

  add("day-one", "Day One", "Record your first activity", "sunrise", "bronze", 1, "activity", all.length, all[0]?.date ?? null);

  for (const [target, tier, title] of [[100, "silver", "100 Hours of Becoming"], [1000, "gold", "1,000 Hours of Becoming"], [10_000, "legend", "10,000 Hours"]] as const) {
    const c = crossing(all, (l) => l.minutes, target * 60);
    add(`hours-${target}`, title, `${target.toLocaleString()} hours across every goal`, "hourglass", tier, target, "hours", c.value / 60, c.date);
  }

  for (const [target, tier, title] of [[30, "silver", "A Month of Showing Up"], [100, "gold", "100 Days of Showing Up"], [365, "legend", "A Year of Showing Up"]] as const) {
    const hit = overall.timeline.find((t) => t.length >= target);
    add(`showing-up-${target}`, title, `A ${target}-day Life streak`, "flame", tier, target, "days", overall.longest, hit?.date ?? null);
  }

  // Three or more goals touched on a single day, or all of them in a week.
  const goalsPerDay = new Map<ISODate, Set<string>>();
  const goalsPerWeek = new Map<ISODate, Set<string>>();
  for (const l of all) {
    (goalsPerDay.get(l.date) ?? goalsPerDay.set(l.date, new Set()).get(l.date)!).add(l.goalId);
    const wk = startOfWeek(l.date, weekStartsOn);
    (goalsPerWeek.get(wk) ?? goalsPerWeek.set(wk, new Set()).get(wk)!).add(l.goalId);
  }
  const bestDay = Math.max(0, ...[...goalsPerDay.values()].map((s) => s.size));
  const threeDay = [...goalsPerDay].filter(([, s]) => s.size >= 3).map(([d]) => d).sort()[0] ?? null;
  add("polymath", "Polymath", "Work on three goals in one day", "shapes", "bronze", 3, "goals", bestDay, threeDay);

  // Judge each week by the goals that existed then, so adding a goal never revokes this.
  const active = goalLogs.filter((g) => !g.goal.archived);
  const needed = (week: ISODate) => Math.max(3, active.filter((g) => g.goal.createdAt <= addDays(week, 6)).length);
  const need = Math.max(3, active.length);
  const bestWeek = Math.max(0, ...[...goalsPerWeek.values()].map((s) => s.size));
  const fullWeek = [...goalsPerWeek].filter(([wk, s]) => s.size >= needed(wk)).map(([d]) => d).sort()[0];
  const fullDate = fullWeek
    ? all.filter((l) => l.date >= fullWeek && l.date <= addDays(fullWeek, 6)).map((l) => l.date).sort().at(-1) ?? null
    : null;
  add("balanced", "Balanced Week", "Touch every goal in one calendar week", "scale", "silver", need, "goals", bestWeek, fullDate);

  const ms = [...milestoneDates].sort();
  add("milestone-1", "First Milestone", "Reach any milestone", "flag", "bronze", 1, "milestones", ms.length, ms[0] ?? null);
  add("milestone-10", "Ten Milestones", "Reach ten milestones", "flag", "gold", 10, "milestones", ms.length, ms[9] ?? null);
  return out;
};

export const evaluateAchievements = (goals: GoalFacts[], global: GlobalFacts): AchievementState[] => [
  ...globalAchievements(global),
  ...goals.flatMap((f) =>
    specsFor(f.goal).map((spec) => {
      const { value, date } = spec.check(f, spec.target);
      return toState(spec, `${f.goal.id}:${spec.key}`, f.goal.id, value, date);
    }),
  ),
];
