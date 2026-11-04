"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { milestoneDetail } from "@/components/dashboard/dashboard";
import { useDerived } from "@/components/shell/providers";
import { Input } from "@/components/ui/input";
import { Bar } from "@/components/viz/primitives";
import { fmtFull } from "@/lib/engine/dates";
import type { GoalView, MilestoneView } from "@/lib/engine/derive";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function Row({ m, today, line, last }: { m: MilestoneView; today: string; line?: boolean; last?: boolean }) {
  const { updateMilestone, deleteMilestone } = useStore.getState();
  const done = !!m.completedOn;
  const auto = !!m.auto;
  const detail = milestoneDetail(m);
  return (
    <div className="group relative flex gap-3 py-2">
      {line && !last && <span className={cn("absolute top-9 bottom-[-8px] left-[13px] w-0.5 rounded-full", done ? "bg-[var(--goal)]" : "bg-track")} aria-hidden />}
      <motion.button
        whileTap={{ scale: 0.85 }}
        disabled={auto && !m.completedAt}
        aria-label={done ? `Mark ${m.title} not done` : `Mark ${m.title} done`}
        aria-pressed={done}
        title={auto && !m.completedAt ? "Completes automatically from your activity" : undefined}
        onClick={() => updateMilestone(m.id, { completedAt: done ? undefined : today })}
        className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full transition-colors", done ? "bg-[var(--goal)] text-white" : "bg-card ring-2 ring-inset ring-track")}
      >
        {done && <Check size={15} strokeWidth={3} />}
      </motion.button>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn("text-sm", done && "text-muted-foreground")}>{m.title}</p>
        {m.completedOn ? (
          <p className="num text-xs text-muted-foreground">Reached {fmtFull(m.completedOn)}</p>
        ) : (
          detail && (
            <div className="mt-1.5 flex items-center gap-2.5">
              <Bar value={m.progress ?? 0} height={4} />
              <span className="num shrink-0 text-xs text-muted-foreground">{detail}</span>
            </div>
          )
        )}
      </div>
      <button aria-label={`Delete ${m.title}`} onClick={() => deleteMilestone(m.id)} className="grid size-7 shrink-0 place-items-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 max-md:opacity-40">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** Add a milestone by name, with an optional measurable target. */
export function AddMilestone({ goal, roadmapId }: { goal?: GoalView; roadmapId?: string }) {
  const addMilestone = useStore((s) => s.addMilestone);
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState("");
  const [target, setTarget] = useState("");

  const options = goal
    ? [
        { id: "hours", label: "hours" },
        { id: "sessions", label: "sessions" },
        ...goal.goal.metrics.map((m) => ({ id: m.id, label: m.unit })),
      ]
    : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const value = Number(target.replace(/,/g, ""));
    addMilestone({
      title: title.trim(),
      goalId: goal?.goal.id ?? null,
      roadmapId: roadmapId ?? null,
      auto: metric && value > 0 ? { metric, target: value } : undefined,
    });
    setTitle("");
    setTarget("");
    setMetric("");
  };

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <Input aria-label="New milestone" placeholder="Add a milestone" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 min-w-40 flex-1 rounded-xl" />
      {goal && title && (
        <>
          <Input aria-label="Target amount" inputMode="numeric" placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 w-20 rounded-xl" />
          <select aria-label="Target unit" value={metric} onChange={(e) => setMetric(e.target.value)} className="h-9 rounded-xl border bg-transparent px-2 text-sm">
            <option value="">No target</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </>
      )}
      <button type="submit" aria-label="Add milestone" className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary"><Plus size={16} /></button>
    </form>
  );
}

export function MilestoneList({ view }: { view: GoalView }) {
  const d = useDerived();
  return (
    <div>
      {view.milestones.map((m) => <Row key={m.id} m={m} today={d.today} />)}
      <AddMilestone goal={view} />
    </div>
  );
}

export function RoadmapSteps({ milestones, roadmapId }: { milestones: MilestoneView[]; roadmapId: string }) {
  const d = useDerived();
  return (
    <div>
      {milestones.map((m, i) => <Row key={m.id} m={m} today={d.today} line last={i === milestones.length - 1} />)}
      <AddMilestone roadmapId={roadmapId} />
    </div>
  );
}
