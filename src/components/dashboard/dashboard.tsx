"use client";

import { ArrowRight, Flag, NotebookPen, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo } from "react";
import { toast } from "sonner";
import { ActivityRow } from "@/components/activity-row";
import { GoalCard } from "@/components/goal-card";
import { useDerived } from "@/components/shell/providers";
import { Heatmap, OVERALL_BANDS } from "@/components/viz/heatmap";
import { Icon } from "@/components/viz/icons";
import { AnimatedNumber, Bar, Empty, FlameIcon, goalVar, GoalBadge, Ring, SectionTitle } from "@/components/viz/primitives";
import { fmtLong, fmtRelative, fmtShort, localParts } from "@/lib/engine/dates";
import type { Derived, GoalView, MilestoneView } from "@/lib/engine/derive";
import { buildInsights } from "@/lib/engine/insights";
import { logOrder } from "@/lib/engine/stats";
import { lifeTitle } from "@/lib/engine/xp";
import { useMediaQuery } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { cn, fmtCompact, fmtHours, fmtNum, plural } from "@/lib/utils";

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
        <Link href="/achievements" className="col-span-2 flex items-center gap-4 md:col-span-1">
          <Ring value={d.level.progress} size={compact ? 84 : 108} stroke={compact ? 8 : 9} gradient label={`Life level ${d.level.level}`}>
            <span className="eyebrow !text-[9px]">Level</span>
            <AnimatedNumber value={d.level.level} className="font-display -mt-0.5 text-[30px] leading-none font-medium md:text-[40px]" />
          </Ring>
          <div className="min-w-0">
            <p className="text-[15px] font-medium">{lifeTitle(d.level.level)}</p>
            <p className="num text-sm text-muted-foreground"><AnimatedNumber value={d.xp} /> XP</p>
            <p className="num mt-1 text-xs text-muted-foreground">{fmtNum(d.level.toNext)} to level {d.level.level + 1}</p>
            {d.xpToday > 0 && <p className="num mt-0.5 inline-flex items-center gap-1 text-xs font-medium"><Zap size={11} className="fill-current" /> +{fmtNum(d.xpToday)} today</p>}
          </div>
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          <FlameIcon size={compact ? 40 : 58} lit={streak.current > 0} />
          <div className="min-w-0">
            <p className="flex items-baseline gap-1">
              <AnimatedNumber value={streak.current} className="font-display text-[30px] leading-none font-medium md:text-[40px]" />
              <span className="text-sm text-muted-foreground">{streak.current === 1 ? "day" : "days"}</span>
            </p>
            <p className="num mt-1 text-xs text-muted-foreground">Life streak · best {streak.longest}</p>
            <p className="num mt-0.5 hidden text-xs text-muted-foreground md:block">{due.length ? `${dueDone} of ${due.length} due today done` : "Nothing due today"}</p>
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

function Lifetime({ d }: { d: Derived }) {
  const creative = d.goals.find((g) => g.goal.kind === "creative");
  const reading = d.goals.find((g) => g.goal.kind === "reading");
  const fitness = d.goals.find((g) => g.goal.kind === "fitness");
  const metric = creative?.goal.metrics[0];
  const tiles = [
    { icon: "hourglass", label: "Hours invested", value: fmtHours(d.totals.minutes).replace("h", "") },
    ...(creative && metric
      ? [{ icon: creative.goal.icon, label: metric.id === "words" ? "Words written" : `${metric.label} finished`, value: fmtCompact(creative.totals.metrics[metric.id] ?? 0) }]
      : []),
    ...(reading ? [{ icon: "book-open", label: "Books finished", value: fmtNum(reading.projects.filter((p) => p.finishedAt).length) }] : []),
    ...(fitness ? [{ icon: "dumbbell", label: "Workouts", value: fmtNum(fitness.totals.sessions) }] : []),
    { icon: "calendar-check", label: "Active days", value: fmtNum(d.totals.activeDays) },
    { icon: "check-check", label: "Sessions", value: fmtCompact(d.totals.sessions) },
  ].slice(0, 4);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <motion.div key={t.label} variants={rise} className="card p-4">
          <Icon name={t.icon} size={16} className="text-muted-foreground" strokeWidth={1.8} />
          <p className="font-display num mt-2 text-[28px] leading-none font-medium">{t.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.label}</p>
        </motion.div>
      ))}
    </div>
  );
}

/** One tap repeats your usual session for a goal. */
function QuickLog({ d }: { d: Derived }) {
  const { addLog, deleteLog } = useStore.getState();
  const openLog = useUI((s) => s.openLog);
  const items = d.goals
    .filter((g) => !g.pausedToday)
    .map((g) => {
      const last = g.logs.findLast((l) => l.minutes > 0 && !l.source);
      const typeId = last?.typeId ?? g.goal.activityTypes[0]?.id ?? null;
      const type = g.goal.activityTypes.find((t) => t.id === typeId);
      return { g, typeId, label: type?.label ?? g.goal.name, minutes: last?.minutes ?? type?.defaultMinutes ?? 30 };
    })
    .sort((a, b) => Number(a.g.doneToday) - Number(b.g.doneToday));

  const log = (i: (typeof items)[number]) => {
    const entry = addLog({ goalId: i.g.goal.id, typeId: i.typeId, minutes: i.minutes, metrics: {} });
    toast.success(`${i.g.goal.name}: ${i.minutes} min logged`, { action: { label: "Undo", onClick: () => deleteLog(entry.id) } });
  };

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
      {items.map((i) => (
        <button
          key={i.g.goal.id}
          onClick={() => log(i)}
          onContextMenu={(e) => {
            e.preventDefault();
            openLog({ goalId: i.g.goal.id, typeId: i.typeId });
          }}
          style={goalVar(i.g.goal.color)}
          className={cn("flex h-11 shrink-0 items-center gap-2 rounded-2xl border bg-card pr-3.5 pl-2 text-sm transition-transform active:scale-95", i.g.doneToday && "opacity-60")}
        >
          <GoalBadge icon={i.g.goal.icon} color={i.g.goal.color} size={28} />
          <span className="font-medium">{i.g.goal.kind === "language" ? i.g.goal.name : i.label}</span>
          <span className="num text-muted-foreground">{i.minutes}m</span>
        </button>
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
            return (
              <div key={m.id} style={goal ? goalVar(goal.color) : undefined}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 truncate"><Flag size={13} style={{ color: "var(--goal)" }} className="shrink-0" /> <span className="truncate">{m.title}</span></span>
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

      <motion.div variants={rise}><QuickLog d={d} /></motion.div>

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

