"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { GoalCard } from "@/components/goal-card";
import { useDerived } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/viz/primitives";
import { ArrowRight, Mountain } from "lucide-react";
import Link from "next/link";
import { createGoal, nextColor } from "@/lib/defaults";
import type { Goal } from "@/lib/types";
import { GoalEditor } from "./goal-editor";

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
      <Link href="/roadmaps" className="card flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5">
        <span className="grid size-10 place-items-center rounded-xl bg-secondary"><Mountain size={18} strokeWidth={1.8} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Long-term roadmaps</span>
          <span className="block text-xs text-muted-foreground">{d.roadmaps.length ? `${d.roadmaps.length} in progress. Steps move with the goals that work towards them.` : "Bigger than any habit. Start one."}</span>
        </span>
        <ArrowRight size={16} className="text-muted-foreground" />
      </Link>
      <GoalEditor goal={creating} open={!!creating} isNew onOpenChange={(v) => !v && setCreating(null)} />
    </div>
  );
}
