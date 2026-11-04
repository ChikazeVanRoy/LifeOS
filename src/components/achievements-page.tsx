"use client";

import { ChevronDown, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { chipClass } from "@/components/log/log-sheet";
import { useDerived } from "@/components/shell/providers";
import { Icon } from "@/components/viz/icons";
import { AnimatedNumber, Bar, Empty, goalVar, GoalBadge, PageHeader, Ring, SectionTitle } from "@/components/viz/primitives";
import { fmtFull, fmtRelative } from "@/lib/engine/dates";
import type { AchievementState, Tier } from "@/lib/engine/achievements";
import { lifeTitle, XP_RULES } from "@/lib/engine/xp";
import { useStore } from "@/lib/store";
import { cn, fmtCompact, fmtDuration, fmtNum } from "@/lib/utils";

const TIER: Record<Tier, { label: string; ring: string; rank: number }> = {
  bronze: { label: "Bronze", ring: "conic-gradient(from 210deg, #c08457, #e7b98d, #9d6238, #c08457)", rank: 1 },
  silver: { label: "Silver", ring: "conic-gradient(from 210deg, #a9b0ba, #e9edf2, #868d98, #a9b0ba)", rank: 2 },
  gold: { label: "Gold", ring: "conic-gradient(from 210deg, #d6a42d, #f8df8c, #b9851a, #d6a42d)", rank: 3 },
  legend: { label: "Legendary", ring: "conic-gradient(from 210deg, #8e72ee, #e0604a, #e9a23b, #45bdb0, #8e72ee)", rank: 4 },
};

function Medal({ a, goalColor, goalName, today }: { a: AchievementState; goalColor: string; goalName: string; today: string }) {
  const open = !!a.unlockedOn;
  const tier = TIER[a.tier];
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className={cn("card flex flex-col items-center p-4 text-center", !open && "bg-transparent shadow-none")} style={{ "--goal": `var(--c-${goalColor})` } as React.CSSProperties}>
      <div className={cn("grid size-[68px] place-items-center rounded-full p-[3px]", !open && "opacity-55 grayscale")} style={{ background: open ? tier.ring : "var(--track)" }}>
        <span className="grid size-full place-items-center rounded-full bg-card" style={{ color: open ? "var(--goal)" : "var(--muted-foreground)" }}>
          {open ? <Icon name={a.icon} size={26} strokeWidth={1.7} /> : <Lock size={20} strokeWidth={1.7} />}
        </span>
      </div>
      <p className="mt-3 text-sm leading-snug font-medium">{a.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{goalName} · {tier.label}</p>
      {open ? (
        <p className="num mt-auto pt-2 text-xs text-muted-foreground">{fmtRelative(a.unlockedOn!, today)}</p>
      ) : (
        <div className="mt-auto w-full pt-2.5">
          <Bar value={a.progress} height={4} />
          <p className="num mt-1 text-[11px] text-muted-foreground">{fmtCompact(Math.floor(a.value))} / {fmtCompact(a.target)} {a.unit}</p>
        </div>
      )}
    </motion.div>
  );
}

function HowXp() {
  const [open, setOpen] = useState(false);
  const cap = useStore((s) => s.data.settings.dailyXpCap);
  const items = [
    `A session earns ${XP_RULES.sessionBase[0]} XP plus 1 XP a minute for the first 30 minutes of the day. Later minutes earn less, and nothing after two hours.`,
    "Measurable output, such as pages read or words written, adds a little, up to a daily limit.",
    `Each goal can earn up to ${cap} XP a day from sessions, so logging lots of tiny entries gains very little.`,
    `Hitting a weekly target earns ${XP_RULES.weeklyTarget} XP. Every 7 days of a streak earns ${XP_RULES.streakEvery7Days} XP, and each week of a weekly streak earns ${XP_RULES.streakPerWeek} XP.`,
    `Milestones earn ${XP_RULES.milestone} XP. A finished creative project earns ${XP_RULES.project.project} XP.`,
    "XP is for motivation. It is not a measure of proficiency, and every point can be traced to something you logged.",
  ];
  return (
    <div className="card overflow-hidden">
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between p-4 text-sm font-medium">
        How XP works <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden px-4 text-sm text-muted-foreground">
            <div className="space-y-2 pb-4">{items.map((t) => <li key={t} className="ml-4 list-disc">{t}</li>)}</div>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AchievementsPage() {
  const d = useDerived();
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");
  const [goal, setGoal] = useState<string | null>(null);

  const list = useMemo(
    () =>
      d.achievements
        .filter((a) => (filter === "all" || (filter === "unlocked") === !!a.unlockedOn) && (!goal || (goal === "life" ? a.goalId === null : a.goalId === goal)))
        .sort((a, b) => {
          if (!!a.unlockedOn !== !!b.unlockedOn) return a.unlockedOn ? -1 : 1;
          if (a.unlockedOn && b.unlockedOn) return b.unlockedOn.localeCompare(a.unlockedOn);
          return b.progress - a.progress || TIER[a.tier].rank - TIER[b.tier].rank;
        }),
    [d.achievements, filter, goal],
  );
  const unlocked = d.achievements.filter((a) => a.unlockedOn).length;
  const events = [...d.xpEvents].reverse().slice(0, 12);
  const prs = d.goals.flatMap((g) => (g.strength?.exercises ?? []).map((e) => ({ goal: g.goal, e })));
  const records = d.goals.flatMap((g) => g.records.filter((r) => r.label === "Longest session" || r.label.startsWith("Most")).map((r) => ({ ...r, goal: g.goal })));

  return (
    <div className="space-y-8">
      <PageHeader title="Achievements" subtitle={`${unlocked} of ${d.achievements.length} unlocked`} />

      <section className="card grid gap-6 p-5 md:grid-cols-[auto_1fr] md:p-6">
        <div className="flex items-center gap-4 md:flex-col md:px-3 md:text-center">
          <Ring value={d.level.progress} size={128} stroke={10} gradient label={`Life level ${d.level.level}`}>
            <span className="eyebrow !text-[9px]">Life level</span>
            <AnimatedNumber value={d.level.level} className="font-display text-[46px] leading-none font-medium" />
          </Ring>
          <div>
            <p className="text-[15px] font-medium">{lifeTitle(d.level.level)}</p>
            <p className="num text-sm text-muted-foreground">{fmtNum(d.xp)} XP</p>
            <p className="num text-xs text-muted-foreground">{fmtNum(d.level.toNext)} to next</p>
          </div>
        </div>
        <div className="grid content-center gap-x-8 gap-y-3.5 sm:grid-cols-2">
          {[...d.goals].sort((a, b) => b.xp - a.xp).map((g) => (
            <Link key={g.goal.id} href={`/goals/${g.goal.id}`} className="block" style={goalVar(g.goal.color)}>
              <div className="flex items-center gap-2.5">
                <GoalBadge icon={g.goal.icon} color={g.goal.color} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{g.goal.name}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">Lv {g.level.level} · {fmtCompact(g.xp)} XP</span>
                  </p>
                  <Bar value={g.level.progress} height={4} className="mt-1.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <HowXp />

      <section>
        <SectionTitle title="Gallery" />
        <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {(["all", "unlocked", "locked"] as const).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn(chipClass(filter === f), "capitalize")}>{f}</button>)}
          <span className="mx-1 my-2 w-px shrink-0 bg-border" />
          <button aria-pressed={!goal} onClick={() => setGoal(null)} className={chipClass(!goal)}>Everything</button>
          <button aria-pressed={goal === "life"} onClick={() => setGoal("life")} className={chipClass(goal === "life")}>Life</button>
          {d.goals.map((g) => <button key={g.goal.id} aria-pressed={goal === g.goal.id} onClick={() => setGoal(g.goal.id)} className={chipClass(goal === g.goal.id)}>{g.goal.name}</button>)}
        </div>
        {list.length === 0 ? (
          <Empty icon="trophy" title="Nothing here yet" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((a) => {
              const g = a.goalId ? d.byId.get(a.goalId)?.goal : null;
              return <Medal key={a.id} a={a} goalColor={g?.color ?? "amber"} goalName={g?.name ?? "Life"} today={d.today} />;
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-3 text-[15px] font-medium">Personal records</h3>
          {records.length + prs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your bests appear after a few sessions.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {prs.slice(0, 6).map(({ goal: g, e }) => (
                <li key={e.name} className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground"><span className="size-2 shrink-0 rounded-full" style={{ background: `var(--c-${g.color})` }} /><span className="truncate">{e.name}</span></span>
                  <span className="num shrink-0 font-medium">{e.best.kg} {d.weightUnit} × {e.best.reps} <span className="ml-1 text-xs font-normal text-muted-foreground">{fmtFull(e.best.date)}</span></span>
                </li>
              ))}
              {records.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground"><span className="size-2 shrink-0 rounded-full" style={{ background: `var(--c-${r.goal.color})` }} /><span className="truncate">{r.goal.name}: {r.label.toLowerCase()}</span></span>
                  <span className="num shrink-0 font-medium">{r.unit === "min" ? fmtDuration(r.value) : `${fmtNum(r.value)} ${r.unit}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h3 className="mb-3 text-[15px] font-medium">Recent XP</h3>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every point you earn is itemised here.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-muted-foreground">{e.label}</span>
                  <span className="num shrink-0 font-medium">+{e.amount} <span className="ml-1 text-xs font-normal text-muted-foreground">{fmtRelative(e.date, d.today)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
