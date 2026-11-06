"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Compass, Flag, Minus, Trophy } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { milestoneDetail } from "@/components/dashboard/dashboard";
import { useDerived } from "@/components/shell/providers";
import { Icon } from "@/components/viz/icons";
import { Bar, FlameIcon, goalVar, GoalBadge } from "@/components/viz/primitives";
import { addDays, fmtRange } from "@/lib/engine/dates";
import { buildReview, defaultReviewOffset, earliestWeek } from "@/lib/engine/review";
import { cn, fmtDuration, fmtHours, fmtNum, pctChange, plural } from "@/lib/utils";

const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } } };

const Stat = ({ label, value, now, before, compare }: { label: string; value: string; now: number; before: number; compare: string }) => {
  const p = pctChange(now, before);
  const Ico = p === null || Math.abs(p) < 0.01 ? Minus : p > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div>
      <p className="font-display num text-3xl font-medium">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {p !== null && <p className="num mt-0.5 inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Ico size={12} /> {Math.abs(p) < 0.01 ? `Level with ${compare}` : `${Math.round(Math.abs(p) * 100)}% vs ${compare}`}</p>}
    </div>
  );
};

export function ReviewPage() {
  const d = useDerived();
  const [offset, setOffset] = useState(() => (d.totals.sessions ? defaultReviewOffset(d) : 0));
  const day = addDays(d.today, -7 * offset);
  const r = useMemo(() => buildReview(d, day), [d, day]);
  const atStart = r.start <= earliestWeek(d);
  const heading = r.isCurrent ? "This week so far" : "Weekly review";
  const maxMinutes = Math.max(1, ...r.goals.flatMap((g) => [g.now.minutes, g.prev.minutes]));
  const wins = r.records.length + r.strengthPRs.length + r.achievements.length + r.milestones.length;

  return (
    <motion.div key={r.start} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }} className="mx-auto max-w-2xl space-y-5">
      <motion.div variants={rise} className="flex items-center justify-between">
        <p className="eyebrow">{heading}</p>
        <div className="flex items-center gap-1">
          <button aria-label="Previous week" disabled={atStart} onClick={() => setOffset((o) => o + 1)} className="grid size-8 place-items-center rounded-lg bg-secondary disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span className="num w-32 text-center text-sm text-muted-foreground">{fmtRange(r.start, r.end)}</span>
          <button aria-label="Next week" disabled={offset === 0} onClick={() => setOffset((o) => o - 1)} className="grid size-8 place-items-center rounded-lg bg-secondary disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      </motion.div>

      <motion.section variants={rise} className="card relative overflow-hidden p-6 md:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-28 -left-20 size-72 rounded-full opacity-[0.12] blur-3xl" style={{ background: "var(--aurora)" }} />
        <h1 className="font-display relative text-[34px] leading-[1.1] font-medium md:text-[44px]">{r.headline}</h1>
        <p className="relative mt-2 text-[15px] text-muted-foreground">{r.note}{r.isCurrent && r.totals.sessions > 0 ? " The week is still open." : ""}</p>
        <div className="relative mt-6 grid grid-cols-2 gap-5 md:grid-cols-4">
          <Stat label="Productive hours" value={fmtHours(r.totals.minutes)} now={r.totals.minutes} before={r.previous.minutes} compare={r.compareLabel} />
          <Stat label="Activities" value={fmtNum(r.totals.sessions)} now={r.totals.sessions} before={r.previous.sessions} compare={r.compareLabel} />
          <Stat label="Active days" value={`${r.totals.activeDays} / 7`} now={r.totals.activeDays} before={r.previous.activeDays} compare={r.compareLabel} />
          <div>
            <p className="font-display num text-3xl font-medium">{fmtNum(r.streaksKept.length)}</p>
            <p className="text-xs text-muted-foreground">Streaks kept</p>
          </div>
        </div>
      </motion.section>

      {r.totals.sessions > 0 && (
        <motion.section variants={rise} className="card p-5">
          <h2 className="font-display mb-4 text-[19px] font-medium">Where the time went</h2>
          <div className="space-y-4">
            {r.goals.map((g) => (
              <div key={g.view.goal.id} style={goalVar(g.view.goal.color)}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 truncate"><GoalBadge icon={g.view.goal.icon} color={g.view.goal.color} size={24} /> {g.view.goal.name}</span>
                  <span className="num text-xs text-muted-foreground">{fmtHours(g.now.minutes)} · {r.compareLabel} {fmtHours(g.prev.minutes)}</span>
                </div>
                <Bar value={g.now.minutes / maxMinutes} />
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {r.streaksKept.length > 0 && (
        <motion.section variants={rise} className="card p-5">
          <h2 className="font-display mb-3 flex items-center gap-1.5 text-[19px] font-medium"><FlameIcon size={22} /> Streaks maintained</h2>
          <div className="flex flex-wrap gap-2">
            {r.streaksKept.map((g) => (
              <span key={g.view.goal.id} className="goal-tint inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm" style={goalVar(g.view.goal.color)}>
                {g.view.goal.name}
                {g.view.streak.current > 0 && <span className="num text-xs text-muted-foreground">{plural(g.view.streak.current, g.view.streak.unit)}</span>}
              </span>
            ))}
          </div>
        </motion.section>
      )}

      {wins > 0 && (
        <motion.section variants={rise} className="card p-5">
          <h2 className="font-display mb-3 text-[19px] font-medium">Wins this week</h2>
          <ul className="space-y-2.5 text-sm">
            {r.milestones.map((m) => <li key={m.id} className="flex items-center gap-2.5"><Flag size={16} className="shrink-0 text-muted-foreground" /> Reached <b className="font-medium">{m.title}</b></li>)}
            {r.achievements.map((a) => <li key={a.id} className="flex items-center gap-2.5"><Icon name={a.icon} size={16} className="shrink-0 text-muted-foreground" /> <span><b className="font-medium">{a.title}</b> unlocked</span></li>)}
            {r.strengthPRs.map((p, i) => <li key={i} className="flex items-center gap-2.5"><Trophy size={16} className="shrink-0 text-muted-foreground" /> <span>{p.exercise} record: <b className="num font-medium">{p.kg} {d.weightUnit} × {p.reps}</b></span></li>)}
            {r.records.slice(0, 5).map((e, i) => <li key={i} className="flex items-center gap-2.5"><Trophy size={16} className="shrink-0 text-muted-foreground" /> <span>{e.goal.name}: {e.label.toLowerCase()}, <b className="num font-medium">{e.unit === "min" ? fmtDuration(e.value) : `${fmtNum(e.value)} ${e.unit}`}</b></span></li>)}
          </ul>
        </motion.section>
      )}

      {r.roadmaps.length > 0 && (
        <motion.section variants={rise} className="card p-5">
          <h2 className="font-display mb-3 text-[19px] font-medium">Long-term roadmaps</h2>
          <div className="space-y-4">
            {r.roadmaps.map(({ roadmap, minutes, reached }) => (
              <div key={roadmap.id} style={goalVar(roadmap.color)}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{roadmap.title}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{minutes > 0 ? `${fmtHours(minutes)} this week · ` : ""}{Math.round(roadmap.progress * 100)}% there</span>
                </div>
                <Bar value={roadmap.progress} />
                {reached.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">Reached {reached.map((m) => m.title).join(", ")}</p>}
                {roadmap.next && <p className="mt-1.5 text-xs text-muted-foreground">Next: {roadmap.next.title}{milestoneDetail(roadmap.next) ? ` (${milestoneDetail(roadmap.next)})` : ""}</p>}
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {r.quieter.length > 0 && (
        <motion.section variants={rise} className="card p-5">
          <h2 className="font-display text-[19px] font-medium">Had less of your time</h2>
          <p className="mt-1 text-sm text-muted-foreground">Not a failing, just a note. Focus always shifts between weeks.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.quieter.map((g) => (
              <Link key={g.view.goal.id} href={`/goals/${g.view.goal.id}`} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm">
                <span className="size-2 rounded-full" style={{ background: `var(--c-${g.view.goal.color})` }} /> {g.view.goal.name}
                <span className="num text-xs text-muted-foreground">{g.now.sessions === 0 ? "no sessions" : `${fmtHours(g.now.minutes)}, usually ${fmtHours(g.average)}`}</span>
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      <motion.section variants={rise} className="card p-5">
        <h2 className="font-display mb-3 flex items-center gap-2 text-[19px] font-medium"><Compass size={18} /> Next week</h2>
        <ol className="space-y-2.5">
          {r.priorities.map((p, i) => (
            <li key={i} className={cn("flex items-start gap-3 text-sm")}>
              <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-medium">{i + 1}</span>
              <span className="pt-0.5">{p.text}</span>
            </li>
          ))}
        </ol>
        <Link href="/goals" className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">Open goals <ArrowRight size={14} /></Link>
      </motion.section>
    </motion.div>
  );
}
