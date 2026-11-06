"use client";

import { Check, Plus } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { GoalView } from "@/lib/engine/derive";
import { fmtWeekday } from "@/lib/engine/dates";
import { useUI } from "@/lib/ui";
import { cn, fmtHours } from "@/lib/utils";
import { Bar, goalVar, GoalBadge, Ring, StreakPill, WEEK_DOT } from "./viz/primitives";

export function WeekDots({ view, today }: { view: GoalView; today: string }) {
  return (
    <div className="flex items-end justify-between gap-1" aria-label="This week">
      {view.marks.map(({ date, mark }) => (
        <div key={date} className="flex flex-col items-center gap-1">
          <motion.span
            key={mark}
            initial={mark === "done" ? { scale: 0.5 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 16 }}
            title={`${fmtWeekday(date)}: ${mark}`}
            className={cn("grid size-[18px] place-items-center rounded-full", WEEK_DOT[mark])}
          >
            {mark === "done" && <Check size={11} strokeWidth={3.4} className="text-white" />}
            {(mark === "rest" || mark === "paused") && <span className="h-[2px] w-1.5 rounded-full bg-track" />}
          </motion.span>
          <span className={cn("text-[10px] leading-none text-muted-foreground", date === today && "font-semibold text-foreground")}>{fmtWeekday(date).charAt(0)}</span>
        </div>
      ))}
    </div>
  );
}

export const weekLabel = (v: GoalView) => {
  const { done, required, met } = v.week;
  if (required === 0) return "Rest week";
  if (v.schedule.kind === "days" && v.schedule.days.length === 7) return `${done} of ${required} days`;
  return met && done > required ? `${done} of ${required}, bonus` : `${done} of ${required} this week`;
};

export function GoalCard({ view, today }: { view: GoalView; today: string }) {
  const { goal, streak, totals } = view;
  const openLog = useUI((s) => s.openLog);
  const ratio = view.week.required ? view.week.done / view.week.required : 0;

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }} style={goalVar(goal.color)} className="card group relative flex min-w-0 flex-col gap-4 p-4">
      <Link href={`/goals/${goal.id}`} className="absolute inset-0 z-0 rounded-3xl" aria-label={`Open ${goal.name}`} />
      <div className="pointer-events-none relative z-10 flex items-center gap-3">
        <Ring value={ratio} size={48} stroke={4}>
          <GoalBadge icon={goal.icon} color={goal.color} size={32} className="rounded-full bg-transparent" />
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{goal.name}</p>
          <p className="num text-xs text-muted-foreground">{fmtHours(totals.minutes)} invested</p>
        </div>
        <button
          aria-label={`Log ${goal.name}`}
          onClick={() => openLog({ goalId: goal.id })}
          className={cn("pointer-events-auto grid size-9 shrink-0 place-items-center rounded-xl transition-all active:scale-90", view.doneToday ? "goal-tint text-[var(--goal)]" : "bg-secondary text-muted-foreground hover:text-foreground")}
        >
          {view.doneToday ? <Check size={17} strokeWidth={2.6} /> : <Plus size={17} strokeWidth={2.2} />}
        </button>
      </div>
      <div className="pointer-events-none relative z-10">
        <WeekDots view={view} today={today} />
      </div>
      {view.roadmap && (
        <div className="pointer-events-none relative z-10" title={view.roadmap.next ? `Next: ${view.roadmap.next.title}` : undefined}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{view.roadmap.title}</span>
            <span className="num shrink-0">{Math.round(view.roadmap.progress * 100)}%</span>
          </div>
          <Bar value={view.roadmap.progress} height={4} />
        </div>
      )}
      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-3 text-sm">
        <StreakPill current={streak.current} unit={streak.unit} rest={streak.currentForgiven > 0} />
        <span className="num truncate text-xs text-muted-foreground">{weekLabel(view)}</span>
      </div>
    </motion.div>
  );
}
