"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { GoalCard } from "@/components/goal-card";
import { useDerived } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/viz/icons";
import { goalVar, PageHeader, Ring, SectionTitle } from "@/components/viz/primitives";
import { createGoal, nextColor, ROADMAP_TEMPLATES } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import type { Goal } from "@/lib/types";
import { GoalEditor } from "./goal-editor";
import { RoadmapSteps } from "./milestones";

function Roadmaps() {
  const d = useDerived();
  const { addRoadmap, deleteRoadmap, updateRoadmap } = useStore.getState();
  const [title, setTitle] = useState("");
  const suggestions = ROADMAP_TEMPLATES.filter((t) => !d.roadmaps.some((r) => r.title === t.title));
  return (
    <section>
      <SectionTitle title="Long-term roadmaps" />
      <p className="mb-3 px-1 text-sm text-muted-foreground">Bigger than any habit. Mark steps as they happen.</p>
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
              <RoadmapSteps milestones={r.milestones} roadmapId={r.id} />
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
    </section>
  );
}

export function GoalsList() {
  const d = useDerived();
  const [creating, setCreating] = useState<Goal | null>(null);
  const archived = d.allGoals.filter((g) => g.goal.archived);
  return (
    <div className="space-y-9">
      <div>
        <PageHeader
          title="Goals"
          subtitle="Who you are becoming, and how each part is going."
          action={<Button onClick={() => setCreating(createGoal("custom", d.today, { order: d.allGoals.length, color: nextColor(d.allGoals.map((g) => g.goal)) }))}><Plus /> New goal</Button>}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.goals.map((g) => <GoalCard key={g.goal.id} view={g} today={d.today} />)}
        </div>
        {archived.length > 0 && (
          <div className="mt-6">
            <p className="eyebrow mb-2 px-1">Not tracking</p>
            <div className="grid gap-3 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
              {archived.map((g) => <GoalCard key={g.goal.id} view={g} today={d.today} />)}
            </div>
          </div>
        )}
      </div>
      <Roadmaps />
      <GoalEditor goal={creating} open={!!creating} isNew onOpenChange={(v) => !v && setCreating(null)} />
    </div>
  );
}
