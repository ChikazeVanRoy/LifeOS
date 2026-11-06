import type { AppData, Goal, ISODate, JobApplication, LogEntry, Measurement, Milestone, Project, Roadmap, Schedule, WeightUnit } from "../types";
import { evaluateAchievements, type AchievementState, type GoalFacts } from "./achievements";
import { addDays, resolveTz, todayIn, weekday } from "./dates";
import { goalRecords, strengthSummary, type RecordEvent, type RecordItem, type StrengthSummary } from "./records";
import { crossing, effortMinutes, logOrder, qualifies, totalsOf, type Totals } from "./stats";
import {
  computeOverallStreak,
  computeStreak,
  currentSchedule,
  pausesFor,
  scheduleOn,
  weekMarks,
  weekProgress,
  isPaused,
  owedOn,
  type DayMark,
  type PauseRange,
  type StreakResult,
  type WeekProgress,
} from "./streaks";

export interface MilestoneView extends Milestone {
  completedOn: ISODate | null;
  /** 0–1, or null for milestones without a measurable target. */
  progress: number | null;
  current: number | null;
  unit: string | null;
}

/** What a goal needs to know about the roadmap it belongs to. */
export interface GoalRoadmap {
  id: string;
  title: string;
  color: Roadmap["color"];
  icon: string;
  progress: number;
  /** The first step not reached yet, preferring one with a measurable target. */
  next: MilestoneView | null;
}

export type RoadmapView = Roadmap & {
  milestones: MilestoneView[];
  progress: number;
  next: MilestoneView | null;
  /** Goals that work towards it: linked directly, or through one of its steps. */
  goals: GoalView[];
};

export interface GoalView {
  goal: Goal;
  roadmap: GoalRoadmap | null;
  schedule: Schedule;
  logs: LogEntry[];
  totals: Totals;
  minutesByDay: Map<ISODate, number>;
  /** Minutes, with estimates for sessions that have no duration. For heatmaps. */
  effortByDay: Map<ISODate, number>;
  sessionsByDay: Map<ISODate, number>;
  pauses: PauseRange[];
  streak: StreakResult;
  week: WeekProgress;
  weekMinutes: number;
  marks: { date: ISODate; mark: DayMark }[];
  todayLogs: LogEntry[];
  todayMinutes: number;
  doneToday: boolean;
  dueToday: boolean;
  /** Whether this goal needs something today: a scheduled day, or a weekly target with no slack left. */
  neededToday: boolean;
  pausedToday: boolean;
  projects: Project[];
  measurements: Measurement[];
  milestones: MilestoneView[];
  records: RecordItem[];
  recordEvents: RecordEvent[];
  strength: StrengthSummary | null;
}

export interface Derived {
  today: ISODate;
  tz: string;
  weekStartsOn: 0 | 1;
  weightUnit: WeightUnit;
  goals: GoalView[];
  byId: Map<string, GoalView>;
  allGoals: GoalView[];
  logs: LogEntry[];
  totals: Totals;
  overallStreak: StreakResult;
  achievements: AchievementState[];
  milestones: MilestoneView[];
  roadmaps: RoadmapView[];
  effortByDay: Map<ISODate, number>;
  applications: JobApplication[];
}

const metricValueOf = (m: Milestone, logs: LogEntry[], projects: Project[], measurements: Measurement[], goal: Goal | undefined) => {
  const target = m.auto!.target;
  const metric = m.auto!.metric;
  if (metric === "hours") {
    const c = crossing(logs, (l) => l.minutes, target * 60);
    return { value: c.value / 60, date: c.date, unit: "hours", progress: c.value / 60 / target };
  }
  if (metric === "sessions") {
    const c = crossing(logs, () => 1, target);
    return { value: c.value, date: c.date, unit: "sessions", progress: c.value / target };
  }
  if (metric === "projects") {
    const done = projects.filter((p) => p.finishedAt).map((p) => p.finishedAt as ISODate).sort();
    const unit = goal?.kind === "reading" ? "books" : "done";
    return { value: done.length, date: done[target - 1] ?? null, unit, progress: done.length / target };
  }
  if (metric === "measurement") {
    if (measurements.length === 0) return { value: 0, date: null, unit: goal?.measurement?.unit ?? "", progress: 0 };
    const start = measurements[0].value;
    const latest = measurements[measurements.length - 1].value;
    const down = start >= target;
    const hit = measurements.find((x) => (down ? x.value <= target : x.value >= target));
    const span = Math.abs(start - target);
    const progress = hit ? 1 : span === 0 ? 1 : 1 - Math.abs(latest - target) / span;
    return { value: latest, date: hit?.date ?? null, unit: goal?.measurement?.unit ?? "", progress };
  }
  const c = crossing(logs, (l) => l.metrics[metric] ?? 0, target);
  return { value: c.value, date: c.date, unit: goal?.metrics.find((x) => x.id === metric)?.unit ?? metric, progress: c.value / target };
};

const viewMilestone = (m: Milestone, logs: LogEntry[], projects: Project[], measurements: Measurement[], goal: Goal | undefined): MilestoneView => {
  if (!m.auto) return { ...m, completedOn: m.completedAt ?? null, progress: m.completedAt ? 1 : null, current: null, unit: null };
  const r = metricValueOf(m, logs, projects, measurements, goal);
  const completedOn = m.completedAt ?? r.date;
  return { ...m, completedOn, progress: completedOn ? 1 : Math.max(0, Math.min(0.99, r.progress)), current: r.value, unit: r.unit };
};

export const derive = (data: AppData, now: Date = new Date()): Derived => {
  const tz = resolveTz(data.settings.timezone);
  const today = todayIn(tz, now);
  const { weekStartsOn } = data.settings;
  const logs = [...data.logs].sort(logOrder);

  const logsByGoal = new Map<string, LogEntry[]>();
  for (const l of logs) (logsByGoal.get(l.goalId) ?? logsByGoal.set(l.goalId, []).get(l.goalId)!).push(l);

  const facts: GoalFacts[] = [];
  const effortAll = new Map<ISODate, number>();

  const views = [...data.goals]
    .sort((a, b) => a.order - b.order)
    .map((goal): GoalView => {
      const goalLogs = logsByGoal.get(goal.id) ?? [];
      const pauses = pausesFor(goal.id, data.pauses);
      const minutesByDay = new Map<ISODate, number>();
      const effortByDay = new Map<ISODate, number>();
      const sessionsByDay = new Map<ISODate, number>();
      for (const l of goalLogs) {
        minutesByDay.set(l.date, (minutesByDay.get(l.date) ?? 0) + l.minutes);
        const e = effortMinutes(l, goal);
        effortByDay.set(l.date, (effortByDay.get(l.date) ?? 0) + e);
        effortAll.set(l.date, (effortAll.get(l.date) ?? 0) + e);
        if (qualifies(l, goal)) sessionsByDay.set(l.date, (sessionsByDay.get(l.date) ?? 0) + 1);
      }
      const streak = computeStreak({ schedules: goal.schedules, sessions: sessionsByDay, pauses, today, weekStartsOn });
      const projects = data.projects.filter((p) => p.goalId === goal.id);
      const measurements = data.measurements.filter((m) => m.goalId === goal.id).sort((a, b) => a.date.localeCompare(b.date));
      const strength = goal.kind === "fitness" ? strengthSummary(goalLogs) : null;
      facts.push({ goal, logs: goalLogs, streak, projects, prs: strength?.prs ?? [], measurements });


      const milestones = data.milestones
        .filter((m) => m.goalId === goal.id)
        .sort((a, b) => a.order - b.order)
        .map((m) => viewMilestone(m, goalLogs, projects, measurements, goal));


      const firstLog = goalLogs[0]?.date;
      const since = firstLog && firstLog < goal.createdAt ? firstLog : goal.createdAt;
      const week = weekProgress(goal.schedules, sessionsByDay, pauses, today, weekStartsOn, since);
      let weekMinutes = 0;
      for (let d = week.start; d <= week.end; d = addDays(d, 1)) weekMinutes += minutesByDay.get(d) ?? 0;
      const todayLogs = goalLogs.filter((l) => l.date === today);
      const sched = scheduleOn(goal.schedules, today);
      const pausedToday = isPaused(today, pauses);
      const rec = goalRecords(goal, goalLogs, weekStartsOn);

      return {
        goal,
        roadmap: null,
        schedule: currentSchedule(goal),
        logs: goalLogs,
        totals: totalsOf(goalLogs),
        minutesByDay,
        effortByDay,
        sessionsByDay,
        pauses,
        streak,
        week,
        weekMinutes,
        marks: weekMarks(goal.schedules, sessionsByDay, pauses, today, weekStartsOn, since),
        todayLogs,
        todayMinutes: minutesByDay.get(today) ?? 0,
        doneToday: (sessionsByDay.get(today) ?? 0) > 0,
        dueToday: !pausedToday && sched.kind === "days" && sched.days.includes(weekday(today)),
        pausedToday,
        neededToday: !goal.archived && owedOn({ schedules: goal.schedules, pauses, since, sessions: sessionsByDay, weekStartsOn }, today),
        projects,
        measurements,
        milestones,
        records: rec.records,
        recordEvents: rec.events,
        strength,
      };
    });

  const allMilestones = views.flatMap((v) => v.milestones);
  const rawRoadmapMs = data.milestones.filter((m) => !m.goalId || m.roadmapId);
  const roadmapViews = [...data.roadmaps]
    .filter((r) => !r.archived)
    .sort((a, b) => a.order - b.order)
    .map((r) => {
      const ms = rawRoadmapMs
        .filter((m) => m.roadmapId === r.id)
        .sort((a, b) => a.order - b.order)
        .map((m) => allMilestones.find((x) => x.id === m.id) ?? viewMilestone(m, [], [], [], undefined));
      // Steps with a target count by how far along they are, so logging moves the roadmap.
      const sum = ms.reduce((t, m) => t + (m.completedOn ? 1 : (m.progress ?? 0)), 0);
      const open = ms.filter((m) => !m.completedOn);
      const next = open.find((m) => m.auto) ?? open[0] ?? null;
      const linked = views.filter((v) => v.goal.roadmapId === r.id || ms.some((m) => m.goalId === v.goal.id));
      return { ...r, milestones: ms, progress: ms.length ? sum / ms.length : 0, next, goals: linked };
    });
  for (const r of roadmapViews) {
    for (const g of r.goals) g.roadmap = { id: r.id, title: r.title, color: r.color, icon: r.icon, progress: r.progress, next: r.next };
  }
  const everyMilestone = [...allMilestones, ...roadmapViews.flatMap((r) => r.milestones).filter((m) => !allMilestones.some((x) => x.id === m.id))];

  const overallStreak = computeOverallStreak(
    new Set(logs.map((l) => l.date)),
    views
      .filter((v) => !v.goal.archived && v.totals.firstDate)
      .map((v) => ({ schedules: v.goal.schedules, pauses: v.pauses, since: minDate(v.goal.createdAt, v.totals.firstDate!), sessions: v.sessionsByDay, weekStartsOn })),
    today,
  );

  const achievements = evaluateAchievements(facts, {
    goalLogs: views.map((v) => ({ goal: v.goal, logs: v.logs })),
    overall: overallStreak,
    milestoneDates: everyMilestone.flatMap((m) => (m.completedOn ? [m.completedOn] : [])),
    weekStartsOn,
  });

  return {
    today,
    tz,
    weekStartsOn,
    weightUnit: data.settings.weightUnit,
    goals: views.filter((g) => !g.goal.archived),
    allGoals: views,
    byId: new Map(views.map((g) => [g.goal.id, g])),
    logs,
    totals: totalsOf(logs),
    overallStreak,
    achievements,
    milestones: everyMilestone,
    roadmaps: roadmapViews,
    effortByDay: effortAll,
    applications: data.applications,
  };
};

const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);
