"use client";

import { Flag, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { milestoneDetail } from "@/components/dashboard/dashboard";
import { GoalEditor } from "@/components/goals/goal-editor";
import { RoadmapSteps } from "@/components/goals/milestones";
import { useDerived } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { goalVar, PageHeader, Ring } from "@/components/viz/primitives";
import { Icon } from "@/components/viz/icons";
import { createGoal, nextColor, ROADMAP_TEMPLATES } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import type { Goal } from "@/lib/types";

function RoadmapsBody() {
  const d = useDerived();
  const { addRoadmap, deleteRoadmap, updateRoadmap } = useStore.getState();
  const [title, setTitle] = useState("");
  // A new goal for a roadmap. With a step, the step then follows that goal's activity.
  const [creating, setCreating] = useState<{ goal: Goal; stepId?: string } | null>(null);
  const startGoal = (roadmapTitle: string, roadmapId: string, stepId?: string) =>
    setCreating({
      goal: createGoal("custom", d.today, { order: d.allGoals.length, color: nextColor(d.allGoals.map((g) => g.goal)), name: roadmapTitle, roadmapId }),
      stepId,
    });
  const suggestions = ROADMAP_TEMPLATES.filter((t) => !d.roadmaps.some((r) => r.title === t.title));
  return (
    <section>
      {d.roadmaps.length > 0 && (
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {d.roadmaps.map((r) => (
            <article key={r.id} className="card group p-5" style={goalVar(r.color)}>
              <div className="mb-2 flex items-center gap-3">
                <Ring value={r.progress} size={46} stroke={4}>
                  <Icon name={r.icon} size={18} style={{ color: "var(--goal)" }} strokeWidth={1.9} />
                </Ring>
                <div className="min-w-0 flex-1">
                  <input aria-label="Roadmap title" value={r.title} onChange={(e) => updateRoadmap(r.id, { title: e.target.value })} className="font-display w-full bg-transparent text-lg leading-tight font-medium outline-none focus:underline focus:decoration-faint focus:underline-offset-4" />
                  {r.description && <p className="truncate text-xs text-muted-foreground">{r.description}</p>}
                </div>
                <button aria-label={`Delete ${r.title}`} onClick={() => deleteRoadmap(r.id)} className="grid size-8 shrink-0 place-items-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 max-md:opacity-40"><Trash2 size={14} /></button>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {r.goals.map((g) => (
                  <Link key={g.goal.id} href={`/goals/${g.goal.id}`} style={goalVar(g.goal.color)} className="goal-tint inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs">
                    <Icon name={g.goal.icon} size={12} style={{ color: "var(--goal)" }} /> {g.goal.name}
                  </Link>
                ))}
                <button onClick={() => startGoal(r.title, r.id)} className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs text-muted-foreground hover:text-foreground">
                  <Plus size={12} /> {r.goals.length ? "Goal" : "Add a goal to practise this"}
                </button>
              </div>
              {r.next && (
                <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Flag size={12} style={{ color: "var(--goal)" }} /> Next: <span className="text-foreground">{r.next.title}</span>
                  {milestoneDetail(r.next) && <span className="num">({milestoneDetail(r.next)})</span>}
                </p>
              )}
              <RoadmapSteps milestones={r.milestones} roadmapId={r.id} onTrack={(m) => startGoal(r.title, r.id, m.id)} />
            </article>
          ))}
        </div>
      )}
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addRoadmap({ title: title.trim(), description: "", icon: "mountain", color: "lime", steps: [] });
          setTitle("");
        }}
      >
        <Input aria-label="New roadmap" placeholder="Name a long-term goal of your own" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-xl" />
        <Button type="submit" variant="secondary" aria-label="Add roadmap" size="icon"><Plus /></Button>
      </form>
      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Or start from:</span>
          {suggestions.map((t) => (
            <button key={t.id} onClick={() => addRoadmap(t)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              <Plus size={13} /> {t.title}
            </button>
          ))}
        </div>
      )}
      <GoalEditor
        goal={creating?.goal ?? null}
        open={!!creating}
        isNew
        onOpenChange={(v) => !v && setCreating(null)}
        onCreated={(g) => creating?.stepId && useStore.getState().updateMilestone(creating.stepId, { goalId: g.id })}
      />
    </section>
  );
}


export function RoadmapsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Roadmaps" subtitle="Bigger than any habit. Link the goals that work towards each one, and steps with a target tick themselves off." />
      <RoadmapsBody />
    </div>
  );
}
