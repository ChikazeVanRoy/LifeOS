"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useDerived } from "@/components/shell/providers";
import { Input } from "@/components/ui/input";
import { ChartCard, Lines } from "@/components/viz/charts";
import { Bar, Empty } from "@/components/viz/primitives";
import { fmtFull, fmtRelative, fmtShort } from "@/lib/engine/dates";
import type { GoalView } from "@/lib/engine/derive";
import { useStore } from "@/lib/store";
import { APPLICATION_STAGES, type ApplicationStage, type Project, type ProjectKind } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { cn, fmtNum } from "@/lib/utils";

const projectCopy = (kind: ProjectKind, view: GoalView) => {
  if (kind === "book") return { heading: "Books", add: "Add a book", target: "Pages", metric: "pages", unit: "pages" };
  if (kind === "certification") return { heading: "Courses and certifications", add: "Add a course or certification", target: "", metric: null, unit: "" };
  const m = view.goal.metrics[0];
  return { heading: "Projects", add: "Add a project", target: m ? `Target ${m.unit}` : "", metric: m?.id ?? null, unit: m?.unit ?? "" };
};

/** Books, creative projects and courses. Progress comes from linked sessions. */
export function ProjectsPanel({ view, kind }: { view: GoalView; kind: ProjectKind }) {
  const d = useDerived();
  const { addProject, updateProject, deleteProject } = useStore.getState();
  const copy = projectCopy(kind, view);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [baseline, setBaseline] = useState("");

  const items = view.projects.filter((p) => p.kind === kind).sort((a, b) => Number(!!a.finishedAt) - Number(!!b.finishedAt) || (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));

  const progressOf = (p: Project) => {
    if (!copy.metric) return 0;
    return (p.baseline ?? 0) + view.logs.filter((l) => l.projectId === p.id).reduce((s, l) => s + (l.metrics[copy.metric!] ?? 0), 0);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addProject({ goalId: view.goal.id, kind, title: title.trim(), target: Number(target.replace(/,/g, "")) || undefined, baseline: Number(baseline.replace(/,/g, "")) || undefined, startedAt: d.today });
    setTitle("");
    setTarget("");
    setBaseline("");
  };

  return (
    <section className="card p-5">
      <h3 className="mb-3 text-[15px] font-medium">{copy.heading}</h3>
      <div className="space-y-1">
        {items.map((p) => {
          const value = progressOf(p);
          return (
            <div key={p.id} className="group flex items-center gap-3 py-2">
              <button
                aria-label={p.finishedAt ? `Mark ${p.title} unfinished` : `Mark ${p.title} finished`}
                aria-pressed={!!p.finishedAt}
                onClick={() => updateProject(p.id, { finishedAt: p.finishedAt ? undefined : d.today })}
                className={cn("grid size-7 shrink-0 place-items-center rounded-full transition-colors", p.finishedAt ? "bg-[var(--goal)] text-white" : "ring-2 ring-inset ring-track")}
              >
                {p.finishedAt && <Check size={15} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{p.title}</p>
                {p.finishedAt ? (
                  <p className="num text-xs text-muted-foreground">Finished {fmtFull(p.finishedAt)}</p>
                ) : p.target ? (
                  <div className="mt-1 flex items-center gap-2.5">
                    <Bar value={value / p.target} height={4} />
                    <span className="num shrink-0 text-xs text-muted-foreground">{fmtNum(value)} / {fmtNum(p.target)}</span>
                  </div>
                ) : copy.metric ? (
                  <p className="num text-xs text-muted-foreground">{fmtNum(value)} {copy.unit}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">In progress</p>
                )}
              </div>
              <button aria-label={`Delete ${p.title}`} onClick={() => deleteProject(p.id)} className="grid size-7 shrink-0 place-items-center text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-40"><Trash2 size={14} /></button>
            </div>
          );
        })}
        {items.length === 0 && <p className="py-1 text-sm text-muted-foreground">None yet. Add one to track it from your sessions.</p>}
      </div>
      <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
        <Input aria-label={copy.add} placeholder={copy.add} value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 min-w-40 flex-1 rounded-xl" />
        {copy.metric && title && <Input aria-label={copy.target} inputMode="numeric" placeholder={copy.target} value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 w-28 rounded-xl" />}
        {kind === "project" && copy.metric && title && <Input aria-label="Already done" inputMode="numeric" placeholder="Already done" value={baseline} onChange={(e) => setBaseline(e.target.value)} className="h-9 w-32 rounded-xl" />}
        <button aria-label="Add" className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary"><Plus size={16} /></button>
      </form>
    </section>
  );
}

export function ProficiencyPanel({ view }: { view: GoalView }) {
  const updateGoal = useStore((s) => s.updateGoal);
  const p = view.goal.proficiency ?? { current: "", target: "" };
  const [editing, setEditing] = useState(false);
  return (
    <section className="card flex items-center justify-between gap-4 p-5">
      <div className="min-w-0 flex-1">
        <h3 className="eyebrow">Proficiency</h3>
        {editing ? (
          <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setEditing(false); }}>
            <Input aria-label="Current level" placeholder="Now" value={p.current} onChange={(e) => updateGoal(view.goal.id, { proficiency: { ...p, current: e.target.value } })} className="h-9 w-36 rounded-xl" />
            <span className="text-muted-foreground">→</span>
            <Input aria-label="Target level" placeholder="Goal" value={p.target} onChange={(e) => updateGoal(view.goal.id, { proficiency: { ...p, target: e.target.value } })} className="h-9 w-28 rounded-xl" />
            <button aria-label="Done" className="grid size-9 place-items-center rounded-xl bg-secondary"><Check size={16} /></button>
          </form>
        ) : (
          <p className="font-display mt-1 text-2xl font-medium">{p.current || "Where you are"} <span className="text-muted-foreground">→</span> {p.target || "Where you want to be"}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Set by you. Levels here are for motivation, not a proficiency test.</p>
      </div>
      {!editing && <button aria-label="Edit proficiency" onClick={() => setEditing(true)} className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground"><Pencil size={15} /></button>}
    </section>
  );
}

export function MeasurementPanel({ view }: { view: GoalView }) {
  const deleteMeasurement = useStore((s) => s.deleteMeasurement);
  const openLog = useUI((s) => s.openLog);
  const d = useDerived();
  const m = view.goal.measurement!;
  const points = view.measurements;
  const data = points.map((p) => ({ label: fmtShort(p.date), value: p.value }));
  const latest = points.at(-1);
  const first = points[0];
  const values = points.map((p) => p.value);
  const pad = 1;
  const lo = Math.floor(Math.min(...values, m.target ?? Infinity) - pad);
  const hi = Math.ceil(Math.max(...values, m.target ?? -Infinity) + pad);

  return (
    <ChartCard
      title={m.label}
      subtitle={latest ? `${latest.value} ${m.unit}${m.target ? ` · target ${m.target} ${m.unit}` : ""}${first !== latest ? ` · ${latest.value - first.value > 0 ? "+" : ""}${(latest.value - first.value).toFixed(1)} since ${fmtShort(first.date)}` : ""}` : m.target ? `Target ${m.target} ${m.unit}` : "Set a target from Edit goal if you have one."}
      right={<button onClick={() => openLog({ goalId: view.goal.id, weighIn: true })} className="inline-flex h-8 items-center gap-1 rounded-lg bg-secondary px-2.5 text-xs font-medium"><Plus size={13} /> Add</button>}
      table={points.length ? { rows: [...data].reverse(), xKey: "label", xLabel: "Date", series: [{ key: "value", label: m.unit, color: "var(--goal)" }], format: (n) => n.toFixed(1) } : undefined}
    >
      {points.length === 0 ? (
        <Empty icon="scale" title="Nothing recorded yet" className="py-6">Add a first reading to start the line.</Empty>
      ) : (
        <>
          <Lines data={data} series={[{ key: "value", label: m.label, color: "var(--goal)" }]} format={(n) => n.toFixed(0)} domain={[lo, hi]} target={m.target} targetLabel={`Target ${m.target} ${m.unit}`} height={200} />
          {latest && (
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="num">Latest: {fmtRelative(latest.date, d.today)}</span>
              <button onClick={() => deleteMeasurement(latest.id)} className="underline-offset-4 hover:underline">Remove latest</button>
            </div>
          )}
        </>
      )}
    </ChartCard>
  );
}

export function LiftsPanel({ view }: { view: GoalView }) {
  const d = useDerived();
  const exercises = useMemo(() => view.strength?.exercises ?? [], [view.strength]);
  const [pick, setPick] = useState<string | null>(null);
  const current = exercises.find((e) => e.name === pick) ?? exercises[0];
  const data = current?.points.map((p) => ({ label: fmtShort(p.date), value: Math.round(p.e1rm * 10) / 10 })) ?? [];
  return (
    <ChartCard
      title="Strength"
      subtitle={current ? `Best ${current.best.kg} ${d.weightUnit} × ${current.best.reps} · estimated 1RM ${current.best.e1rm.toFixed(1)} ${d.weightUnit}` : "Add exercises to a workout to chart them."}
      right={exercises.length > 0 && (
        <select aria-label="Exercise" value={current?.name} onChange={(e) => setPick(e.target.value)} className="h-8 max-w-36 rounded-lg border bg-transparent px-2 text-xs">
          {exercises.map((e) => <option key={e.name}>{e.name}</option>)}
        </select>
      )}
    >
      {current ? (
        <Lines data={data} series={[{ key: "value", label: "Estimated 1RM", color: "var(--goal)" }]} format={(n) => n.toFixed(0)} domain={["auto", "auto"]} height={200} />
      ) : (
        <Empty icon="dumbbell" title="No lifts logged yet" className="py-6">Log sets, reps and weight on a workout. New bests are flagged automatically.</Empty>
      )}
    </ChartCard>
  );
}

const STAGE_LABEL: Record<ApplicationStage, string> = { applied: "Applied", interview: "Interview", offer: "Offer", accepted: "Accepted", closed: "Closed" };

export function ApplicationsPanel() {
  const d = useDerived();
  const { addApplication, updateApplication, deleteApplication } = useStore.getState();
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const list = [...d.applications].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
  return (
    <section className="card p-5">
      <h3 className="text-[15px] font-medium">Job applications</h3>
      <p className="mb-3 text-sm text-muted-foreground">Optional. Kept here for reference.</p>
      <div className="space-y-1">
        {list.map((a) => (
          <div key={a.id} className="group flex items-center gap-3 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{a.role || "Role"} <span className="text-muted-foreground">at {a.company}</span></p>
              <p className="num text-xs text-muted-foreground">{fmtFull(a.appliedOn)}</p>
            </div>
            <select aria-label={`Stage for ${a.company}`} value={a.stage} onChange={(e) => updateApplication(a.id, { stage: e.target.value as ApplicationStage })} className="h-8 rounded-lg border bg-transparent px-2 text-xs">
              {APPLICATION_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <button aria-label={`Delete ${a.company}`} onClick={() => deleteApplication(a.id)} className="grid size-7 shrink-0 place-items-center text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-40"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!company.trim()) return;
          addApplication({ company: company.trim(), role: role.trim(), stage: "applied", appliedOn: d.today });
          setCompany("");
          setRole("");
        }}
      >
        <Input aria-label="Company" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 min-w-32 flex-1 rounded-xl" />
        <Input aria-label="Role" placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} className="h-9 min-w-32 flex-1 rounded-xl" />
        <button aria-label="Add application" className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary"><Plus size={16} /></button>
      </form>
    </section>
  );
}

