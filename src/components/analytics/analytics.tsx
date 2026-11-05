"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import { LiftsPanel, MeasurementPanel } from "@/components/goals/panels";
import { useDerived } from "@/components/shell/providers";
import { Bars, ChartCard, Cumulative, type Row, type Series } from "@/components/viz/charts";
import { Bar, Empty, goalVar, PageHeader, SectionTitle } from "@/components/viz/primitives";
import { addDays, diffDays, fmtFull, fmtMonthYear, startOfYear } from "@/lib/engine/dates";
import type { Derived, GoalView } from "@/lib/engine/derive";
import { inRange, makeBuckets, seriesOf, totalsOf, type Bucket, type Granularity } from "@/lib/engine/stats";
import { cn, fmtCompact, fmtDuration, fmtHours, fmtNum, pctChange } from "@/lib/utils";

const RANGES: { id: Granularity; label: string; count: number; scope: string }[] = [
  { id: "day", label: "Daily", count: 30, scope: "last 30 days" },
  { id: "week", label: "Weekly", count: 12, scope: "last 12 weeks" },
  { id: "month", label: "Monthly", count: 12, scope: "last 12 months" },
  { id: "year", label: "Yearly", count: 5, scope: "this year" },
];

const hoursFmt = (n: number) => (n < 10 && n % 1 !== 0 ? `${n.toFixed(1)}h` : `${fmtNum(n)}h`);
const round1 = (n: number) => Math.round(n * 10) / 10;

function useWindows(g: Granularity, d: Derived) {
  return useMemo(() => {
    const range = RANGES.find((r) => r.id === g)!;
    const first = Number((d.totals.firstDate ?? d.today).slice(0, 4));
    const count = g === "year" ? Math.max(2, Number(d.today.slice(0, 4)) - first + 1) : range.count;
    const buckets = makeBuckets(g, d.today, count, d.weekStartsOn);
    let from = buckets[0].start;
    let prevFrom: string;
    let prevTo: string;
    if (g === "year") {
      from = startOfYear(d.today);
      prevFrom = `${Number(d.today.slice(0, 4)) - 1}-01-01`;
      prevTo = `${Number(d.today.slice(0, 4)) - 1}${d.today.slice(4)}`;
    } else {
      const len = diffDays(d.today, from) + 1;
      prevTo = addDays(from, -1);
      prevFrom = addDays(from, -len);
    }
    return { buckets, from, prevFrom, prevTo, scope: range.scope, prevScope: g === "year" ? "same point last year" : "the period before" };
  }, [g, d.today, d.totals.firstDate, d.weekStartsOn]);
}

function Delta({ now, before, good = true }: { now: number; before: number; good?: boolean }) {
  const p = pctChange(now, before);
  if (p === null) return <span className="text-xs text-muted-foreground">{now > 0 ? "No earlier data" : "–"}</span>;
  const flat = Math.abs(p) < 0.01;
  const Ico = flat ? Minus : p > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 text-xs", p > 0 && good ? "font-medium text-foreground" : "text-muted-foreground")}>
      <Ico size={13} /> {flat ? "Level" : `${Math.round(Math.abs(p) * 100)}%`}
    </span>
  );
}

function Kpi({ label, value, now, before }: { label: string; value: string; now: number; before: number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display num mt-1.5 text-[30px] leading-none font-medium">{value}</p>
      <div className="mt-1.5"><Delta now={now} before={before} /></div>
    </div>
  );
}

function Compare({ d, from, prevFrom, prevTo, scope, prevScope }: { d: Derived; from: string; prevFrom: string; prevTo: string; scope: string; prevScope: string }) {
  const rows = d.goals.map((g) => ({
    g,
    now: totalsOf(inRange(g.logs, from, d.today)).minutes,
    prev: totalsOf(inRange(g.logs, prevFrom, prevTo)).minutes,
  }));
  const max = Math.max(1, ...rows.flatMap((r) => [r.now, r.prev]));
  return (
    <section className="card p-5">
      <h3 className="text-[15px] font-medium">Current vs previous</h3>
      <p className="mb-4 text-sm text-muted-foreground">Hours in the {scope} against {prevScope}.</p>
      <div className="space-y-3.5">
        {rows.map(({ g, now, prev }) => (
          <div key={g.goal.id} style={goalVar(g.goal.color)}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{g.goal.name}</span>
              <span className="flex items-center gap-2"><span className="num text-xs text-muted-foreground">{fmtHours(now)} vs {fmtHours(prev)}</span><Delta now={now} before={prev} /></span>
            </div>
            <div className="space-y-1">
              <Bar value={now / max} height={5} />
              <Bar value={prev / max} height={3} color="var(--faint)" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Lifetime({ d }: { d: Derived }) {
  const rows = [...d.allGoals].filter((g) => g.totals.minutes > 0).sort((a, b) => b.totals.minutes - a.totals.minutes);
  const max = rows[0]?.totals.minutes ?? 1;
  return (
    <section className="card p-5">
      <h3 className="text-[15px] font-medium">Lifetime hours</h3>
      <p className="mb-4 text-sm text-muted-foreground">{fmtHours(d.totals.minutes)} across every goal.</p>
      {rows.length === 0 ? (
        <Empty icon="hourglass" title="Your hours will add up here" className="py-4" />
      ) : (
        <div className="space-y-3">
          {rows.map((g) => (
            <div key={g.goal.id} className="grid grid-cols-[84px_1fr_48px] items-center gap-3 text-sm" style={goalVar(g.goal.color)}>
              <span className="truncate">{g.goal.name}</span>
              <Bar value={g.totals.minutes / max} height={10} className="rounded-[4px] bg-transparent" />
              <span className="num text-right font-medium">{fmtHours(g.totals.minutes)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Hours for any goal, plus its main output when it has one. */
function OutputSection({ view, buckets, scope }: { view: GoalView; buckets: Bucket[]; scope: string }) {
  const metric = view.goal.metrics[0];
  const data = useMemo(() => {
    const output = seriesOf(view.logs, buckets, (l) => (metric ? l.metrics[metric.id] ?? 0 : 0));
    const mins = seriesOf(view.logs, buckets, (l) => l.minutes);
    return buckets.map((b, i) => ({ label: b.label, output: output[i], hours: round1(mins[i] / 60) }));
  }, [view.logs, buckets, metric]);
  const cumulative = useMemo(() => {
    const rows: Row[] = [];
    let sum = 0;
    for (const l of view.logs) {
      const v = metric ? l.metrics[metric.id] ?? 0 : 0;
      if (!v) continue;
      sum += v;
      rows.push({ label: fmtMonthYear(l.date), value: sum });
    }
    return rows;
  }, [view.logs, metric]);
  const c = `var(--c-${view.goal.color})`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
      {metric && (
        <ChartCard title={metric.label} subtitle={`In the ${scope}`} table={{ rows: [...data].reverse(), xKey: "label", xLabel: "Period", series: [{ key: "output", label: metric.label, color: c }], format: fmtNum }}>
          <Bars data={data} series={[{ key: "output", label: metric.label, color: c }]} />
        </ChartCard>
      )}
      <ChartCard title="Hours" subtitle={`In the ${scope}`} className={metric ? "" : "md:col-span-2"} table={{ rows: [...data].reverse(), xKey: "label", xLabel: "Period", series: [{ key: "hours", label: "Hours", color: c }], format: hoursFmt }}>
        <Bars data={data} series={[{ key: "hours", label: "Hours", color: c }]} format={hoursFmt} />
      </ChartCard>
      {metric && cumulative.length > 1 && (
        <ChartCard title={`${metric.label} over time`} subtitle={`${fmtNum(view.totals.metrics[metric.id] ?? 0)} ${metric.unit} since ${fmtFull(view.totals.firstDate!)}`} className="md:col-span-2">
          <Cumulative data={cumulative} series={{ key: "value", label: `Total ${metric.unit}`, color: c }} format={fmtCompact} />
        </ChartCard>
      )}
    </div>
  );
}

const TYPE_COLORS = ["violet", "teal", "amber", "blue", "rose", "lime", "green", "red"];

function LanguageSection({ views, buckets, scope }: { views: GoalView[]; buckets: Bucket[]; scope: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
      {views.map((v) => {
        const series: Series[] = v.goal.activityTypes.map((t, i) => ({ key: t.id, label: t.label, color: `var(--c-${TYPE_COLORS[i % TYPE_COLORS.length]})` }));
        const columns = v.goal.activityTypes.map((t) => seriesOf(v.logs.filter((l) => l.typeId === t.id), buckets, (l) => l.minutes));
        const data: Row[] = buckets.map((b, i) => ({ label: b.label, ...Object.fromEntries(series.map((s, j) => [s.key, round1(columns[j][i] / 60)])) }));
        return (
          <ChartCard key={v.goal.id} title={`${v.goal.name} by activity`} subtitle={`Hours in the ${scope}`} legend={series} table={{ rows: [...data].reverse(), xKey: "label", xLabel: "Period", series, format: hoursFmt }}>
            <Bars data={data} series={series} format={hoursFmt} />
          </ChartCard>
        );
      })}
    </div>
  );
}

function FitnessSection({ view }: { view: GoalView }) {
  const d = useDerived();
  const c = `var(--c-${view.goal.color})`;
  const buckets = useMemo(() => makeBuckets("week", d.today, 16, d.weekStartsOn), [d.today, d.weekStartsOn]);
  const counts = seriesOf(view.logs, buckets, () => 1);
  const data = buckets.map((b, i) => ({ label: b.label, value: counts[i] }));
  const target = view.schedule.kind === "weekly" ? view.schedule.sessions : undefined;
  const series = [{ key: "value", label: "Workouts", color: c }];
  const hits = target ? counts.slice(0, -1).filter((n) => n >= target).length : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2" style={goalVar(view.goal.color)}>
      <ChartCard title="Workout consistency" subtitle={target ? `Target met in ${hits} of the last ${buckets.length - 1} full weeks` : "Sessions per week"} className="md:col-span-2" table={{ rows: [...data].reverse(), xKey: "label", xLabel: "Week of", series, format: fmtNum }}>
        <Bars data={data} series={series} target={target} targetLabel={target ? `Target ${target}` : undefined} height={190} />
      </ChartCard>
      <LiftsPanel view={view} />
      {view.goal.measurement && <MeasurementPanel view={view} />}
    </div>
  );
}

function ReadingSection({ view, buckets, scope, today }: { view: GoalView; buckets: Bucket[]; scope: string; today: string }) {
  const c = `var(--c-${view.goal.color})`;
  const mins = seriesOf(view.logs, buckets, (l) => l.minutes);
  const data = buckets.map((b, i) => ({ label: b.label, hours: round1(mins[i] / 60) }));
  const year = today.slice(0, 4);
  const yearLogs = inRange(view.logs, `${year}-01-01`, today);
  const t = totalsOf(yearLogs);
  const finished = view.projects.filter((p) => p.finishedAt).map((p) => p.finishedAt!);
  const years = [...new Set(finished.map((f) => f.slice(0, 4)))].sort();
  const months = makeBuckets("month", today, 12, 1);
  const books = months.map((b) => ({ label: b.label, value: finished.filter((f) => f >= b.start && f <= b.end).length }));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
      <ChartCard title="Reading time" subtitle={`Hours in the ${scope}`} table={{ rows: [...data].reverse(), xKey: "label", xLabel: "Period", series: [{ key: "hours", label: "Hours", color: c }], format: hoursFmt }}>
        <Bars data={data} series={[{ key: "hours", label: "Hours", color: c }]} format={hoursFmt} />
      </ChartCard>
      <ChartCard title="Books finished" subtitle="Last 12 months">
        <Bars data={books} series={[{ key: "value", label: "Books", color: c }]} />
      </ChartCard>
      <section className="card p-5 md:col-span-2">
        <h3 className="mb-3 text-[15px] font-medium">{year} so far</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["Hours", fmtHours(t.minutes)],
            ["Pages", fmtNum(t.metrics.pages ?? 0)],
            ["Books", fmtNum(finished.filter((f) => f.startsWith(year)).length)],
            ["Reading days", fmtNum(t.activeDays)],
          ].map(([l, v]) => (
            <div key={l}><p className="font-display num text-2xl font-medium">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>
          ))}
        </div>
        {years.length > 1 && <p className="num mt-3 text-xs text-muted-foreground">{years.map((y) => `${y}: ${finished.filter((f) => f.startsWith(y)).length} books`).join(" · ")}</p>}
      </section>
    </div>
  );
}

function Records({ d }: { d: Derived }) {
  const records = d.goals.flatMap((g) => g.records.map((r) => ({ ...r, goal: g.goal })));
  const lifts = d.goals.flatMap((g) => (g.strength?.exercises ?? []).slice(0, 5).map((e) => ({ id: e.name, goal: g.goal, label: e.name, text: `${e.best.kg} ${d.weightUnit} × ${e.best.reps}`, date: e.best.date })));
  if (records.length === 0) return null;
  const keep = records.filter((r) => /session|Most/.test(r.label) || r.label === "Biggest week");
  return (
    <section className="card p-5">
      <div className="columns-1 gap-8 md:columns-2">
        {[...keep.map((r) => ({ id: r.id, goal: r.goal, label: r.label, text: r.unit === "min" ? fmtDuration(r.value) : `${fmtNum(r.value)} ${r.unit}`, date: r.date })), ...lifts].map((r) => (
          <div key={r.id} className="flex break-inside-avoid items-baseline justify-between gap-3 border-b py-2 text-sm last:border-0">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground"><span className="size-2 shrink-0 rounded-full" style={{ background: `var(--c-${r.goal.color})` }} /><span className="truncate">{r.goal.name}: {r.label}</span></span>
            <span className="num shrink-0 font-medium">{r.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Analytics() {
  const d = useDerived();
  const [g, setG] = useState<Granularity>("week");
  const w = useWindows(g, d);
  const now = totalsOf(inRange(d.logs, w.from, d.today));
  const prev = totalsOf(inRange(d.logs, w.prevFrom, w.prevTo));
  const unlocked = d.achievements.flatMap((a) => (a.unlockedOn ? [a.unlockedOn] : []));
  const achievedNow = unlocked.filter((date) => date >= w.from).length;
  const achievedPrev = unlocked.filter((date) => date >= w.prevFrom && date <= w.prevTo).length;

  const activity = useMemo(() => {
    const series: Series[] = d.allGoals.filter((v) => v.totals.minutes > 0 || !v.goal.archived).map((v) => ({ key: v.goal.id, label: v.goal.name, color: `var(--c-${v.goal.color})` }));
    const cols = d.allGoals.map((v) => ({ id: v.goal.id, values: seriesOf(v.logs, w.buckets, (l) => l.minutes) }));
    const data: Row[] = w.buckets.map((b, i) => ({ label: b.label, ...Object.fromEntries(cols.map((c) => [c.id, round1(c.values[i] / 60)])) }));
    return { series, data };
  }, [d.allGoals, w.buckets]);

  const creative = d.goals.filter((v) => v.goal.kind === "creative");
  const other = d.goals.filter((v) => v.goal.kind === "career" || v.goal.kind === "custom");
  const languages = d.goals.filter((v) => v.goal.kind === "language");
  const fitness = d.goals.find((v) => v.goal.kind === "fitness");
  const reading = d.goals.find((v) => v.goal.kind === "reading");

  const goalMilestones = d.milestones.filter((m) => m.goalId && m.progress !== null && !m.completedOn).sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));

  return (
    <div className="space-y-9">
      <div className="space-y-5">
        <PageHeader
          title="Analytics"
          subtitle="Only what you have logged, plotted honestly."
          action={
            <div className="flex rounded-xl bg-secondary p-0.5" role="tablist" aria-label="Time scale">
              {RANGES.map((r) => (
                <button key={r.id} role="tab" aria-selected={g === r.id} onClick={() => setG(r.id)} className={cn("h-8 rounded-[10px] px-2.5 text-xs transition-colors md:px-3 md:text-[13px]", g === r.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{r.label}</button>
              ))}
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Hours" value={fmtHours(now.minutes)} now={now.minutes} before={prev.minutes} />
          <Kpi label="Sessions" value={fmtNum(now.sessions)} now={now.sessions} before={prev.sessions} />
          <Kpi label="Active days" value={fmtNum(now.activeDays)} now={now.activeDays} before={prev.activeDays} />
          <Kpi label="Achievements" value={fmtNum(achievedNow)} now={achievedNow} before={achievedPrev} />
        </div>
        <p className="-mt-2 px-1 text-xs text-muted-foreground">Arrows compare the {w.scope} with {w.prevScope}.</p>

        <ChartCard title="All activity" subtitle={`Hours per ${g} · ${w.scope === "this year" ? "by year" : w.scope}`} legend={activity.series} table={{ rows: [...activity.data].reverse(), xKey: "label", xLabel: "Period", series: activity.series, format: hoursFmt }}>
          <Bars data={activity.data} series={activity.series} format={hoursFmt} height={260} />
        </ChartCard>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
          <Lifetime d={d} />
          <Compare d={d} from={w.from} prevFrom={w.prevFrom} prevTo={w.prevTo} scope={w.scope} prevScope={w.prevScope} />
        </div>
      </div>

      {creative.map((v) => <div key={v.goal.id}><SectionTitle title={v.goal.name} /><OutputSection view={v} buckets={w.buckets} scope={w.scope} /></div>)}
      {languages.length > 0 && <div><SectionTitle title="Languages" /><LanguageSection views={languages} buckets={w.buckets} scope={w.scope} /></div>}
      {fitness && <div><SectionTitle title="Fitness" /><FitnessSection view={fitness} /></div>}
      {reading && <div><SectionTitle title="Reading" /><ReadingSection view={reading} buckets={w.buckets} scope={w.scope} today={d.today} /></div>}
      {other.map((v) => <div key={v.goal.id}><SectionTitle title={v.goal.name} /><OutputSection view={v} buckets={w.buckets} scope={w.scope} /></div>)}

      <div><SectionTitle title="Personal records" /><Records d={d} />{d.totals.sessions === 0 && <p className="px-1 text-sm text-muted-foreground">Your bests will appear after a few sessions.</p>}</div>

      {goalMilestones.length > 0 && (
        <div>
          <SectionTitle title="Milestone progress" />
          <section className="card grid gap-x-8 gap-y-3.5 p-5 md:grid-cols-2">
            {goalMilestones.map((m) => (
              <div key={m.id} style={goalVar(d.byId.get(m.goalId!)?.goal.color ?? "violet")}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="truncate">{m.title}</span><span className="num shrink-0 text-xs text-muted-foreground">{Math.round((m.progress ?? 0) * 100)}%</span></div>
                <Bar value={m.progress ?? 0} />
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
