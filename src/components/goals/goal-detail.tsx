"use client";

import { ArrowLeft, BedDouble, Pencil, Plus, Timer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ActivityRow } from "@/components/activity-row";
import { WeekDots, weekLabel } from "@/components/goal-card";
import { useDerived } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Bars, ChartCard, Cumulative } from "@/components/viz/charts";
import { Heatmap } from "@/components/viz/heatmap";
import { Icon } from "@/components/viz/icons";
import { Bar, Empty, FlameIcon, goalVar, GoalBadge, Ring, SectionTitle } from "@/components/viz/primitives";
import { fmtFull, fmtRange } from "@/lib/engine/dates";
import type { GoalView } from "@/lib/engine/derive";
import { makeBuckets, seriesOf } from "@/lib/engine/stats";
import { describeSchedule } from "@/lib/engine/streaks";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { fmtCompact, fmtDuration, fmtHours, fmtNum, plural } from "@/lib/utils";
import { GoalEditor } from "./goal-editor";
import { MilestoneList, RoadmapSteps } from "./milestones";
import { ApplicationsPanel, LiftsPanel, MeasurementPanel, ProficiencyPanel, ProjectsPanel } from "./panels";

const Tile = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="card p-4">
    <p className="eyebrow">{label}</p>
    <p className="font-display num mt-1.5 text-[28px] leading-none font-medium">{value}</p>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </div>
);

const formatRecord = (value: number, unit: string) => (unit === "min" ? fmtDuration(value) : `${fmtNum(value)} ${unit}`);

function WeeklyChart({ view }: { view: GoalView }) {
  const d = useDerived();
  const color = "var(--goal)";
  const data = useMemo(() => {
    const buckets = makeBuckets("week", d.today, 16, d.weekStartsOn);
    const minutes = seriesOf(view.logs, buckets, (l) => l.minutes);
    return buckets.map((b, i) => ({ label: b.label, value: Math.round((minutes[i] / 60) * 10) / 10 }));
  }, [d, view.logs]);
  const series = [{ key: "value", label: "Hours", color }];
  const format = (n: number) => `${n}h`;
  return (
    <ChartCard title="Hours per week" subtitle="Last 16 weeks" table={{ rows: [...data].reverse(), xKey: "label", xLabel: "Week of", series, format }}>
      <Bars data={data} series={series} format={format} height={200} />
    </ChartCard>
  );
}

function OutputChart({ view, metric }: { view: GoalView; metric: string }) {
  const m = view.goal.metrics.find((x) => x.id === metric);
  const data = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    let sum = 0;
    for (const l of view.logs) {
      const v = l.metrics[metric] ?? 0;
      if (!v) continue;
      sum += v;
      out.push({ label: fmtFull(l.date), value: sum });
    }
    return out;
  }, [view.logs, metric]);
  if (!m || data.length < 2) return null;
  return (
    <ChartCard title={`Cumulative ${m.label.toLowerCase()}`} subtitle={`${fmtNum(data.at(-1)!.value)} ${m.unit} so far`}>
      <Cumulative data={data} series={{ key: "value", label: m.label, color: "var(--goal)" }} format={fmtCompact} height={200} />
    </ChartCard>
  );
}

export function GoalDetail() {
  const { id } = useParams<{ id: string }>();
  const d = useDerived();
  const openLog = useUI((s) => s.openLog);
  const { addPause, startTimer } = useStore.getState();
  const [editing, setEditing] = useState(false);
  const view = d.byId.get(id);

  if (!view) {
    return (
      <Empty icon="compass" title="This goal does not exist">
        <Link href="/goals" className="underline underline-offset-4">Back to goals</Link>
      </Empty>
    );
  }

  const { goal, streak, totals, week, records } = view;
  const unitWord = streak.unit;

  const restToday = () => {
    addPause({ goalId: goal.id, from: d.today, to: d.today, note: "Rest day" });
    toast.success("Rest day set. Your streak is safe.");
  };

  const statusLine = view.pausedToday
    ? "Resting today."
    : view.doneToday
      ? "Done for today."
      : view.dueToday
        ? "Due today."
        : view.schedule.kind === "weekly"
          ? view.week.met ? "This week's target is met." : plural(view.week.required - view.week.done, "session") + " left this week."
          : "Not scheduled today.";

  return (
    <div className="space-y-5" style={goalVar(goal.color)}>
      <Link href="/goals" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Goals</Link>

      <header className="card relative overflow-hidden p-5 md:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full opacity-[0.16] blur-3xl" style={{ background: "var(--goal)" }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <Ring value={week.required ? week.done / week.required : 0} size={88} stroke={7} label={`${week.done} of ${week.required} this week`}>
            <span className="eyebrow !text-[8.5px]">Week</span>
            <span className="font-display num -mt-0.5 text-2xl leading-none font-medium">{week.done}<span className="text-muted-foreground">/{week.required}</span></span>
          </Ring>
          <div className="min-w-0 flex-1">
            <h1 className="font-display flex items-center gap-2.5 text-3xl font-medium"><GoalBadge icon={goal.icon} color={goal.color} size={32} /> {goal.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{goal.description ?? describeSchedule(view.schedule)}</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button className="flex-1 sm:flex-none" onClick={() => openLog({ goalId: goal.id })}><Plus /> Log</Button>
            <Button variant="secondary" size="icon" aria-label="Start timer" onClick={() => startTimer(goal.id, view.logs.findLast((l) => !l.source)?.typeId ?? goal.activityTypes[0]?.id ?? null)}><Timer /></Button>
            <Button variant="secondary" size="icon" aria-label="Edit goal" onClick={() => setEditing(true)}><Pencil /></Button>
          </div>
        </div>
      </header>

      {goal.archived && <p className="rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">This goal is archived. Its history still counts towards your lifetime totals.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="eyebrow">Streak</p>
          <p className="mt-1.5 flex items-center gap-1.5"><FlameIcon size={26} lit={streak.current > 0} /><span className="font-display num text-[28px] leading-none font-medium">{streak.current}</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{unitWord}s · best {streak.longest}</p>
          {streak.currentForgiven > 0 && <p className="mt-0.5 text-xs text-muted-foreground">Includes 1 day rest</p>}
        </div>
        <Tile label="Lifetime" value={fmtHours(totals.minutes)} sub={plural(totals.sessions, "session")} />
        {goal.metrics[0] ? (
          <Tile label={goal.metrics[0].label} value={fmtCompact(totals.metrics[goal.metrics[0].id] ?? 0)} sub="all time" />
        ) : (
          <Tile label="Active days" value={fmtNum(totals.activeDays)} sub={totals.firstDate ? `since ${fmtFull(totals.firstDate)}` : "none yet"} />
        )}
        <Tile label="This week" value={fmtHours(view.weekMinutes)} sub={weekLabel(view)} />
      </div>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-medium">This week</h2>
            <p className="text-sm text-muted-foreground">{describeSchedule(view.schedule)} · {statusLine}</p>
          </div>
          {!view.doneToday && !view.pausedToday && view.dueToday && (
            <Button variant="secondary" size="sm" onClick={restToday}><BedDouble /> Take a rest day</Button>
          )}
        </div>
        <div className="max-w-sm"><WeekDots view={view} today={d.today} /></div>
        {goal.weeklyMinutes ? (
          <div className="mt-4 max-w-sm">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Weekly hours</span><span className="num">{fmtHours(view.weekMinutes)} / {fmtHours(goal.weeklyMinutes)}</span></div>
            <Bar value={view.weekMinutes / goal.weeklyMinutes} />
          </div>
        ) : null}
      </section>

      <section className="card p-5">
        <SectionTitle title="Contribution calendar" className="px-0" />
        <Heatmap values={view.effortByDay} today={d.today} weekStartsOn={d.weekStartsOn} color={`var(--c-${goal.color})`} />
      </section>

      {goal.kind === "language" && <ProficiencyPanel view={view} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
        {goal.kind === "creative" && <div className="md:col-span-2"><ProjectsPanel view={view} kind="project" /></div>}
        {goal.kind === "reading" && <div className="md:col-span-2"><ProjectsPanel view={view} kind="book" /></div>}
        {goal.kind === "career" && <ProjectsPanel view={view} kind="certification" />}
        {goal.trackApplications && <ApplicationsPanel />}
        {goal.measurement && <MeasurementPanel view={view} />}
        {goal.kind === "fitness" && <LiftsPanel view={view} />}
        <WeeklyChart view={view} />
        {goal.metrics[0] && goal.kind !== "language" && <OutputChart view={view} metric={goal.metrics[0].id} />}

        {view.roadmap && (
          <section className="card p-5" style={goalVar(view.roadmap.color)}>
            <Link href="/roadmaps" className="mb-3 flex items-center gap-3">
              <Ring value={view.roadmap.progress} size={44} stroke={4}>
                <Icon name={view.roadmap.icon} size={17} style={{ color: "var(--goal)" }} strokeWidth={1.9} />
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Part of your roadmap</p>
                <p className="truncate text-[15px] font-medium">{view.roadmap.title} <span className="num text-xs font-normal text-muted-foreground">{Math.round(view.roadmap.progress * 100)}%</span></p>
              </div>
            </Link>
            <RoadmapSteps milestones={d.roadmaps.find((r) => r.id === view.roadmap!.id)?.milestones ?? []} roadmapId={view.roadmap.id} goalId={goal.id} />
          </section>
        )}

        <section className="card p-5">
          <h3 className="mb-2 text-[15px] font-medium">Milestones</h3>
          <MilestoneList view={view} />
        </section>

        <section className="card p-5">
          <h3 className="mb-3 text-[15px] font-medium">Personal records</h3>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your bests appear here as you log.</p>
          ) : (
            <ul className="space-y-2.5">
              {records.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="num text-right font-medium">{formatRecord(r.value, r.unit)} <span className="ml-1 text-xs font-normal text-muted-foreground">{fmtFull(r.date)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h3 className="mb-3 text-[15px] font-medium">Streak history</h3>
          {streak.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your first streak starts with your next session.</p>
          ) : (
            <ul className="space-y-2.5">
              {[...streak.runs].sort((a, b) => b.length - a.length).slice(0, 6).map((r) => (
                <li key={r.start} className="flex items-center gap-3 text-sm">
                  <span className="num w-16 shrink-0 font-medium">{plural(r.length, r.unit)}</span>
                  <Bar value={r.length / Math.max(1, streak.longest)} height={5} />
                  <span className="num w-32 shrink-0 text-right text-xs text-muted-foreground">{r.ongoing ? "Ongoing" : fmtRange(r.start, r.end)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card p-3 md:p-4">
        <h3 className="mb-1 px-2 pt-1 text-[15px] font-medium">Recent activity</h3>
        {view.logs.length === 0 ? (
          <Empty icon={goal.icon} title={`No ${goal.name} sessions yet`}>Your history starts with the first one.</Empty>
        ) : (
          [...view.logs].reverse().slice(0, 10).map((l) => <ActivityRow key={l.id} log={l} d={d} showDate />)
        )}
      </section>

      <GoalEditor goal={goal} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
