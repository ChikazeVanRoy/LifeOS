"use client";

import { ArrowRight, Flag, NotebookPen, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo } from "react";
import { ActivityRow } from "@/components/activity-row";
import { GoalCard } from "@/components/goal-card";
import { useDerived } from "@/components/shell/providers";
import { Heatmap, OVERALL_BANDS } from "@/components/viz/heatmap";
import { Icon } from "@/components/viz/icons";
import { AnimatedNumber, Bar, Empty, FlameIcon, goalVar, Ring, SectionTitle } from "@/components/viz/primitives";
import { fmtLong, fmtRelative, fmtShort, localParts } from "@/lib/engine/dates";
import type { Derived, GoalView, MilestoneView } from "@/lib/engine/derive";
import { buildInsights } from "@/lib/engine/insights";
import { logOrder } from "@/lib/engine/stats";
import { useMediaQuery } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { fmtCompact, fmtHours, plural } from "@/lib/utils";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } } };

const greeting = (hour: number) => (hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

function WeekRings({ goals, compact }: { goals: GoalView[]; compact: boolean }) {
  const shown = goals.filter((g) => g.week.required > 0).slice(0, 5);
  const outer = compact ? 68 : 132;
  const stroke = compact ? 5 : 9;
  const gap = compact ? 1.5 : 3;
  return (
    <div className="relative shrink-0" style={{ width: outer, height: outer }} role="img" aria-label={`Weekly targets: ${shown.map((g) => `${g.goal.name} ${g.week.done} of ${g.week.required}`).join(", ")}`}>
      {shown.map((g, i) => {
        const size = outer - i * 2 * (stroke + gap);
        return (
          <div key={g.goal.id} className="absolute" style={{ ...goalVar(g.goal.color), left: (outer - size) / 2, top: (outer - size) / 2 }}>
            <Ring value={g.week.done / g.week.required} size={size} stroke={stroke} track="color-mix(in oklch, var(--goal) 14%, transparent)" />
          </div>
        );
      })}
    </div>
  );
}

function Hero({ d, name }: { d: Derived; name: string }) {
  const hour = Number(localParts(d.tz).time.slice(0, 2));
  const insights = useMemo(() => buildInsights(d), [d]);
  const due = d.goals.filter((g) => g.dueToday);
  const dueDone = due.filter((g) => g.doneToday).length;
  // On a day with nothing scheduled, every goal still counts if you choose to work on it.
  const pool = due.length ? due : d.goals;
  const poolDone = pool.filter((g) => g.doneToday).length;
  const left = pool.filter((g) => !g.doneToday);
  const allDone = pool.length > 0 && left.length === 0;
  const todayMinutes = d.goals.reduce((sum, g) => sum + g.todayMinutes, 0);
  const weekDone = d.goals.reduce((s, g) => s + Math.min(g.week.done, g.week.required), 0);
  const weekRequired = d.goals.reduce((s, g) => s + g.week.required, 0);
  const streak = d.overallStreak;
  const compact = !useMediaQuery("(min-width: 768px)");

  return (
    <section className="card relative overflow-hidden p-5 md:p-7">
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full opacity-[0.13] blur-3xl" style={{ background: "var(--aurora)" }} />
      <div className="relative">
        <p className="text-sm text-muted-foreground">{fmtLong(d.today)}</p>
        <h1 className="font-display mt-0.5 text-[28px] leading-tight font-medium md:text-4xl">
          {greeting(hour)}{name ? `, ${name}` : ""}.
        </h1>
        <p className="mt-1.5 max-w-xl text-[15px] text-muted-foreground">
          {insights[0]?.text ?? (d.totals.sessions === 0 ? "Day one. Log one thing and your record begins." : `${fmtHours(d.totals.minutes)} invested so far.`)}
        </p>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-x-3 gap-y-5 md:mt-6 md:grid-cols-[1.25fr_1fr_1.1fr] md:gap-4">
        <Link href="/activity" className="col-span-2 flex items-center gap-4 md:col-span-1">
          <Ring value={pool.length ? poolDone / pool.length : 0} size={compact ? 84 : 108} stroke={compact ? 8 : 9} gradient label={`${poolDone} of ${pool.length} goals done today`}>
            <span className="eyebrow !text-[9px]">Goals</span>
            <span className="font-display num -mt-0.5 text-[30px] leading-none font-medium md:text-[40px]">{poolDone}<span className="text-muted-foreground">/{pool.length}</span></span>
          </Ring>
          <div className="min-w-0">
            <p className="text-[15px] font-medium">
              {pool.length === 0 ? "No goals yet" : allDone ? "All done today" : `${poolDone} of ${pool.length} ${due.length ? "due " : ""}goals done`}
            </p>
            <p className="max-w-56 truncate text-sm text-muted-foreground">
              {pool.length === 0 ? "Add one to get started." : allDone ? `${fmtHours(todayMinutes)} logged today.` : `Left: ${left.map((g) => g.goal.name).join(", ")}`}
            </p>
            <p className="num mt-1 text-xs text-muted-foreground">{fmtHours(todayMinutes)} today · {fmtHours(d.totals.minutes)} total · {plural(d.totals.activeDays, "active day")}</p>
          </div>
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          <FlameIcon size={compact ? 40 : 58} lit={streak.current > 0} />
          <div className="min-w-0">
            <p className="flex items-baseline gap-1">
              <AnimatedNumber value={streak.current} className="font-display text-[30px] leading-none font-medium md:text-[40px]" />
              <span className="text-sm text-muted-foreground">{streak.current === 1 ? "day" : "days"}</span>
            </p>
            <p className="num mt-1 text-xs text-muted-foreground" title="Days in a row you kept up with every goal. A goal needs you on its scheduled days, or on the last days of a week when its weekly target is still short. Each goal can miss one day per streak; a second miss ends it.">Life streak · best {streak.longest}</p>
            <p className="num mt-0.5 hidden text-xs text-muted-foreground md:block">{due.length ? `${dueDone} of ${due.length} due today` : "Nothing due today"}</p>
          </div>
        </div>

        <Link href="/goals" className="flex items-center gap-2.5 md:justify-end md:gap-4">
          <WeekRings goals={d.goals} compact={compact} />
          <div className="min-w-0 md:hidden lg:block">
            <p className="flex items-baseline gap-1">
              <AnimatedNumber value={weekRequired ? Math.round((weekDone / weekRequired) * 100) : 0} className="font-display text-[26px] leading-none font-medium md:text-3xl" />
              <span className="text-sm text-muted-foreground">%</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">of week<span className="hidden md:inline">&apos;s targets</span></p>
          </div>
        </Link>
      </div>
    </section>
  );
}

/** Hours per area of life. Languages share one tile, however many there are. */
function Lifetime({ d }: { d: Derived }) {
  const languages = d.goals.filter((g) => g.goal.kind === "language");
  const languageMinutes = languages.reduce((sum, g) => sum + g.totals.minutes, 0);
  const tiles = d.goals.flatMap((g) => {
    if (g.goal.kind !== "language") return [{ id: g.goal.id, icon: g.goal.icon, label: g.goal.name, minutes: g.totals.minutes }];
    if (g !== languages[0]) return [];
    return [{ id: "languages", icon: "languages", label: languages.length > 1 ? "Languages" : g.goal.name, minutes: languageMinutes }];
  });
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
      {tiles.map((t) => (
        <motion.div key={t.id} variants={rise} className="card p-4 max-md:last:odd:col-span-2">
          <Icon name={t.icon} size={16} className="text-muted-foreground" strokeWidth={1.8} />
          <p className="font-display num mt-2 text-[28px] leading-none font-medium">{fmtHours(t.minutes)}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{t.label}</p>
        </motion.div>
      ))}
    </div>
  );
}

function Today({ d }: { d: Derived }) {
  const logs = d.logs.filter((l) => l.date === d.today).sort(logOrder).reverse();
  const minutes = logs.reduce((s, l) => s + l.minutes, 0);
  const linked = useStore((s) => !!s.data.anki);
  const check = useUI((s) => s.ankiCheck);
  const ankiOpen = linked && check?.available && check.ankiRunning;
  return (
    <section className="card p-3 md:p-4">
      <div className="mb-1 flex items-baseline justify-between px-2 pt-1">
        <h2 className="font-display text-[19px] font-medium">Today</h2>
        {logs.length > 0 && <p className="num text-xs text-muted-foreground">{plural(logs.length, "activity", "activities")} · {fmtHours(minutes)}</p>}
      </div>
      {logs.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">Nothing logged yet today. One small entry counts.</p>
      ) : (
        <div className="mt-1">{logs.map((l) => <ActivityRow key={l.id} log={l} d={d} />)}</div>
      )}
      {ankiOpen && <p className="px-2 pt-1 pb-1 text-xs text-muted-foreground">Anki is open. Quit it to bring in today&apos;s reviews.</p>}
    </section>
  );
}

function WeeklyTargets({ d }: { d: Derived }) {
  return (
    <section className="card p-5">
      <SectionTitle title="This week" className="px-0" action={<Link href="/review" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Review <ArrowRight size={12} /></Link>} />
      <div className="space-y-3.5">
        {d.goals.map((g) => (
          <div key={g.goal.id} style={goalVar(g.goal.color)}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{g.goal.name}</span>
              <span className="num shrink-0 text-xs text-muted-foreground">{g.week.done} / {g.week.required} · {fmtHours(g.weekMinutes)}</span>
            </div>
            <Bar value={g.week.required ? g.week.done / g.week.required : 0} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function milestoneDetail(m: MilestoneView) {
  if (m.current === null || !m.auto) return null;
  if (m.auto.metric === "measurement") return `${m.current || "–"} / ${m.auto.target} ${m.unit}`;
  return `${fmtCompact(Math.floor(m.current))} / ${fmtCompact(m.auto.target)} ${m.unit}`;
}

function Upcoming({ d }: { d: Derived }) {
  const list = d.milestones
    .filter((m) => !m.completedOn && m.goalId && (m.progress !== null || m.dueDate))
    .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    .slice(0, 4);
  return (
    <section className="card p-5">
      <SectionTitle title="Upcoming milestones" className="px-0" action={<Link href="/goals" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">All <ArrowRight size={12} /></Link>} />
      {list.length === 0 ? (
        <Empty icon="flag" title="No milestones in progress" className="py-4">Add one from any goal.</Empty>
      ) : (
        <div className="space-y-3.5">
          {list.map((m) => {
            const goal = d.byId.get(m.goalId!)?.goal;
            const roadmap = d.roadmaps.find((r) => r.id === m.roadmapId);
            return (
              <div key={m.id} style={goal ? goalVar(goal.color) : undefined}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 truncate"><Flag size={13} style={{ color: "var(--goal)" }} className="shrink-0" /> <span className="truncate">{m.title}</span>{roadmap && <span className="shrink-0 truncate text-xs text-muted-foreground">· {roadmap.title}</span>}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{milestoneDetail(m)}</span>
                </div>
                <Bar value={m.progress ?? 0} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Long-term roadmaps, moved by the goals that work towards them. */
function Roadmaps({ d }: { d: Derived }) {
  if (d.roadmaps.length === 0) return null;
  return (
    <section className="card p-5 md:col-span-2">
      <SectionTitle title="Long-term roadmaps" className="px-0" action={<Link href="/goals" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">All <ArrowRight size={12} /></Link>} />
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {d.roadmaps.map((r) => (
          <div key={r.id} style={goalVar(r.color)}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{r.title}</span>
              <span className="num shrink-0 text-xs text-muted-foreground">{Math.round(r.progress * 100)}%</span>
            </div>
            <Bar value={r.progress} />
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {r.next ? `Next: ${r.next.title}${milestoneDetail(r.next) ? ` (${milestoneDetail(r.next)})` : ""}` : r.milestones.length ? "Every step reached." : "No steps yet."}
              {r.goals.length > 0 && ` · ${r.goals.map((g) => g.goal.name).join(", ")}`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Recent({ d }: { d: Derived }) {
  const list = d.achievements
    .filter((a) => a.unlockedOn)
    .sort((a, b) => (b.unlockedOn as string).localeCompare(a.unlockedOn as string))
    .slice(0, 4);
  return (
    <section className="card p-5">
      <SectionTitle title="Recent achievements" className="px-0" action={<Link href="/achievements" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Gallery <ArrowRight size={12} /></Link>} />
      {list.length === 0 ? (
        <Empty icon="trophy" title="Your first award is close" className="py-4">Log any activity to unlock Day One.</Empty>
      ) : (
        <div className="space-y-2.5">
          {list.map((a) => {
            const goal = a.goalId ? d.byId.get(a.goalId)?.goal : null;
            return (
              <div key={a.id} className="flex items-center gap-3" style={goalVar(goal?.color ?? "amber")}>
                <span className="goal-tint grid size-10 shrink-0 place-items-center rounded-xl text-[var(--goal)]"><Icon name={a.icon} size={19} strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{goal?.name ?? "Life"} · {fmtRelative(a.unlockedOn!, d.today)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Insights({ d }: { d: Derived }) {
  const list = useMemo(() => buildInsights(d).slice(1, 5), [d]);
  return (
    <section className="card p-5">
      <SectionTitle title="Worth noticing" className="px-0" />
      {list.length === 0 ? (
        <Empty icon="sparkles" title="Insights need a little history" className="py-4">They come only from what you log, so they appear after a few entries.</Empty>
      ) : (
        <ul className="space-y-3">
          {list.map((i) => {
            const goal = i.goalId ? d.byId.get(i.goalId)?.goal : null;
            return (
              <li key={i.id} className="flex items-start gap-2.5 text-sm" style={goalVar(goal?.color ?? "violet")}>
                <Icon name={i.icon} size={16} className="mt-0.5 shrink-0" style={{ color: "var(--goal)" }} strokeWidth={1.9} />
                <span>{i.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Dashboard() {
  const d = useDerived();
  const name = useStore((s) => s.data.settings.name);
  const isNew = d.totals.sessions === 0;
  const lastLog = d.logs.at(-1);

  return (
    <motion.div className="space-y-5" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise}><Hero d={d} name={name} /></motion.div>

      {!isNew && <Lifetime d={d} />}

      <motion.div variants={rise} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {d.goals.map((g) => <GoalCard key={g.goal.id} view={g} today={d.today} />)}
      </motion.div>

      <motion.div variants={rise}><Today d={d} /></motion.div>

      <motion.section variants={rise} className="card p-5">
        <SectionTitle
          title="Your year"
          className="px-0"
          action={<span className="num text-xs text-muted-foreground">{plural(d.totals.activeDays, "active day")}{lastLog ? ` · last ${fmtShort(lastLog.date)}` : ""}</span>}
        />
        <Heatmap values={d.effortByDay} today={d.today} weekStartsOn={d.weekStartsOn} color="var(--c-violet)" bands={OVERALL_BANDS} />
      </motion.section>

      <motion.div variants={rise} className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
        <WeeklyTargets d={d} />
        <Upcoming d={d} />
        <Recent d={d} />
        <Insights d={d} />
        <Roadmaps d={d} />
      </motion.div>

      <motion.div variants={rise}>
        <Link href="/review" className="card flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5">
          <span className="grid size-10 place-items-center rounded-xl bg-secondary"><NotebookPen size={18} strokeWidth={1.8} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Weekly review</span>
            <span className="block truncate text-xs text-muted-foreground">See your week, what moved and what to do next.</span>
          </span>
          <Sparkles size={16} className="text-muted-foreground" />
        </Link>
      </motion.div>
    </motion.div>
  );
}

