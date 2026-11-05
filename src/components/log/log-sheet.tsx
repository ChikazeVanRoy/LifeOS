"use client";

import { Check, ChevronDown, Dumbbell, Play, Plus, Scale, Trash2, Wand2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDerived } from "@/components/shell/providers";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/viz/icons";
import { goalVar } from "@/components/viz/primitives";
import { flashcardType } from "@/lib/engine/anki";
import { addDays, localParts } from "@/lib/engine/dates";
import { parseLogText } from "@/lib/engine/parse";
import { estimate1RM } from "@/lib/engine/records";
import { logOrder } from "@/lib/engine/stats";
import { useMediaQuery } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { ExerciseEntry, Goal } from "@/lib/types";
import { useUI, type LogPreset } from "@/lib/ui";
import { cn } from "@/lib/utils";

const DURATIONS = [10, 15, 20, 30, 45, 60, 90];

export const chipClass = (on: boolean) =>
  cn(
    "h-9 shrink-0 rounded-xl border px-3 text-sm whitespace-nowrap transition-colors",
    on ? "border-transparent bg-foreground font-medium text-background" : "bg-transparent text-muted-foreground hover:text-foreground",
  );

function useForm(preset: LogPreset | null) {
  const d = useDerived();
  const logs = useStore((s) => s.data.logs);

  const lastFor = (goal: Goal, typeId: string | null) =>
    [...logs].filter((l) => l.goalId === goal.id && !l.source && (!typeId || l.typeId === typeId) && l.minutes > 0).sort(logOrder).at(-1)?.minutes;

  const pickMinutes = (goal: Goal, typeId: string | null) =>
    lastFor(goal, typeId) ?? goal.activityTypes.find((t) => t.id === typeId)?.defaultMinutes ?? 30;

  const initial = () => {
    const edit = preset?.editing;
    const goal =
      d.byId.get(edit?.goalId ?? preset?.goalId ?? "")?.goal ??
      d.goals.find((g) => !g.doneToday && g.dueToday)?.goal ??
      d.goals.find((g) => !g.doneToday)?.goal ??
      d.goals[0]?.goal;
    const lastType = goal ? d.byId.get(goal.id)?.logs.findLast((l) => !l.source)?.typeId : null;
    const typeId = edit ? edit.typeId : preset?.typeId ?? lastType ?? goal?.activityTypes[0]?.id ?? null;
    const minutes = edit ? edit.minutes : preset?.minutes ?? (goal ? pickMinutes(goal, typeId) : 30);
    return {
      text: "",
      goalId: goal?.id ?? "",
      typeId,
      minutes: minutes ? String(minutes) : "",
      metrics: Object.fromEntries(Object.entries(edit?.metrics ?? {}).map(([k, v]) => [k, String(v)])) as Record<string, string>,
      date: edit?.date ?? d.today,
      time: edit?.time ?? "",
      note: edit?.note ?? "",
      projectId: edit?.projectId ?? (goal ? d.byId.get(goal.id)?.projects.find((p) => !p.finishedAt && p.kind !== "certification")?.id ?? "" : ""),
      finish: false,
      exercises: edit?.exercises ?? ([] as ExerciseEntry[]),
      weighIn: !!preset?.weighIn,
      weight: "",
    };
  };

  // The sheet's body mounts fresh each time it opens, so this seeds every session.
  const [form, setForm] = useState(initial);
  return { form, setForm, pickMinutes };
}

function Section({ label, children, right }: { label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="eyebrow">{label}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function ExerciseEditor({ exercises, onChange, history, unit }: { exercises: ExerciseEntry[]; onChange: (e: ExerciseEntry[]) => void; unit: string; history: { name: string; best: { kg: number; reps: number; e1rm: number } }[] }) {
  const set = (i: number, patch: Partial<ExerciseEntry>) => onChange(exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-2">
      <datalist id="exercise-names">
        {history.map((h) => <option key={h.name} value={h.name} />)}
      </datalist>
      {exercises.map((e, i) => {
        const prior = history.find((h) => h.name.toLowerCase() === e.exercise.trim().toLowerCase());
        const isPR = prior && e.kg > 0 && e.reps > 0 && estimate1RM(e.kg, e.reps) > prior.best.e1rm;
        return (
          <div key={i} className="rounded-2xl bg-secondary/60 p-2.5">
            <div className="flex items-center gap-2">
              <Input aria-label="Exercise" list="exercise-names" placeholder="Exercise" value={e.exercise} onChange={(x) => set(i, { exercise: x.target.value })} className="h-9 flex-1 bg-card" />
              <button aria-label="Remove exercise" onClick={() => onChange(exercises.filter((_, j) => j !== i))} className="grid size-9 place-items-center text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["sets", "reps", "kg"] as const).map((k) => (
                <label key={k} className="relative">
                  <Input aria-label={k === "kg" ? "Weight" : k} inputMode="decimal" value={e[k] || ""} onChange={(x) => set(i, { [k]: Number(x.target.value.replace(",", ".")) || 0 })} className="num h-9 bg-card pr-9" />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{k === "kg" ? unit : k}</span>
                </label>
              ))}
            </div>
            {prior && (
              <p className="mt-1.5 px-1 text-xs text-muted-foreground">
                {isPR ? <span className="font-medium text-foreground">New personal record</span> : <>Best: {prior.best.kg} {unit} × {prior.best.reps}</>}
              </p>
            )}
          </div>
        );
      })}
      <button onClick={() => onChange([...exercises, { exercise: "", sets: 3, reps: 5, kg: 0 }])} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm text-muted-foreground hover:text-foreground">
        <Plus size={15} /> Add exercise
      </button>
    </div>
  );
}

function LogBody({ preset, onDone }: { preset: LogPreset | null; onDone: () => void }) {
  const d = useDerived();
  const { form, setForm, pickMinutes } = useForm(preset);
  const ankiMapping = useStore((s) => s.data.anki?.mapping);
  const { addLog, updateLog, deleteLog, restoreLog, addMeasurement, updateProject, startTimer } = useStore.getState();
  const [more, setMore] = useState(false);
  const [lifts, setLifts] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);
  const editing = preset?.editing;
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const view = d.byId.get(form.goalId);
  const goal = view?.goal;

  const parsed = useMemo(() => (form.text.trim() ? parseLogText(form.text, d.goals.map((g) => g.goal), d.today) : null), [form.text, d.goals, d.today]);

  const applyText = (text: string) => {
    const p = parseLogText(text, d.goals.map((g) => g.goal), d.today);
    setForm((f) => {
      const goalId = p.goalId ?? f.goalId;
      const g = d.byId.get(goalId)?.goal;
      const changed = goalId !== f.goalId;
      const typeId = p.typeId ?? (changed ? g?.activityTypes[0]?.id ?? null : f.typeId);
      return {
        ...f,
        text,
        goalId,
        typeId,
        minutes: p.minutes ? String(p.minutes) : changed && g ? String(pickMinutes(g, typeId)) : f.minutes,
        metrics: { ...(changed ? {} : f.metrics), ...Object.fromEntries(Object.entries(p.metrics).map(([k, v]) => [k, String(v)])) },
        date: p.date ?? f.date,
        projectId: changed ? d.byId.get(goalId)?.projects.find((x) => !x.finishedAt && x.kind !== "certification")?.id ?? "" : f.projectId,
        // A sentence with only output, like "Read 25 pages", has no known duration.
        ...(p.goalId && !p.minutes && Object.keys(p.metrics).length > 0 ? { minutes: "" } : {}),
      };
    });
  };

  const selectGoal = (id: string) => {
    const g = d.byId.get(id);
    if (!g) return;
    const typeId = g.logs.findLast((l) => !l.source)?.typeId ?? g.goal.activityTypes[0]?.id ?? null;
    setForm((f) => ({
      ...f,
      goalId: id,
      typeId,
      minutes: String(pickMinutes(g.goal, typeId)),
      metrics: {},
      projectId: g.projects.find((x) => !x.finishedAt && x.kind !== "certification")?.id ?? "",
      finish: false,
      exercises: [],
      weighIn: false,
    }));
  };

  const minutes = Math.max(0, Math.round(Number(form.minutes.replace(",", ".")) || 0));
  const metrics = Object.fromEntries(
    Object.entries(form.metrics)
      .map(([k, v]) => [k, Number(v.replace(/[,\s]/g, "")) || 0] as const)
      .filter(([, v]) => v > 0),
  );
  const exercises = form.exercises.filter((e) => e.exercise.trim());

  const submit = () => {
    if (!goal) return;
    if (form.date > d.today) {
      toast.error("That date is in the future.");
      return;
    }
    if (form.weighIn) {
      const value = Number(form.weight.replace(",", "."));
      if (!value || !goal.measurement) return;
      addMeasurement({ goalId: goal.id, metricId: goal.measurement.id, date: form.date, value });
      toast.success(`${goal.measurement.label} saved: ${value} ${goal.measurement.unit}`);
      onDone();
      return;
    }
    const payload = {
      goalId: goal.id,
      typeId: form.typeId,
      minutes,
      metrics,
      date: form.date,
      time: form.time || undefined,
      note: form.note.trim() || undefined,
      projectId: form.projectId || undefined,
      exercises: exercises.length ? exercises : undefined,
    };
    if (editing) {
      updateLog(editing.id, { ...payload, time: form.time || editing.time });
      toast.success("Activity updated");
    } else {
      const log = addLog(payload);
      if (form.finish && form.projectId) updateProject(form.projectId, { finishedAt: form.date });
      toast.success("Logged", { action: { label: "Undo", onClick: () => deleteLog(log.id) } });
    }
    onDone();
  };

  const remove = () => {
    if (!editing) return;
    deleteLog(editing.id);
    toast("Activity deleted", { action: { label: "Undo", onClick: () => restoreLog(editing) } });
    onDone();
  };

  const ankiSynced = !!goal && Object.values(ankiMapping ?? {}).includes(goal.id) && flashcardType(goal)?.id === form.typeId;
  const project = view?.projects.find((p) => p.id === form.projectId);
  const projects = view?.projects.filter((p) => p.kind !== "certification" && (!p.finishedAt || p.id === form.projectId)) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pt-1 pb-5 select-text">
        {!editing && (
          <div>
            <label className="relative block">
              <Wand2 size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={textRef}
                value={form.text}
                onChange={(e) => applyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && parsed?.goalId) {
                    e.preventDefault();
                    submit();
                  }
                }}
                aria-label="Describe your activity"
                placeholder="Describe it (optional): read 25 pages"
                className="h-12 w-full rounded-2xl bg-secondary pr-4 pl-10 text-[15px] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </label>
            {parsed && !parsed.goalId && <p className="mt-1.5 px-1 text-xs text-muted-foreground">Name a goal, such as &ldquo;{d.goals[0]?.goal.name ?? "Reading"} 20 min&rdquo;.</p>}
          </div>
        )}

        <Section label="Goal">
          <div className="grid grid-cols-3 gap-2">
            {d.goals.map((g) => {
              const on = g.goal.id === form.goalId;
              return (
                <button
                  key={g.goal.id}
                  onClick={() => selectGoal(g.goal.id)}
                  aria-pressed={on}
                  style={goalVar(g.goal.color)}
                  className={cn("relative flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-[12.5px] transition-all", on ? "goal-tint border-transparent font-medium goal-glow" : "text-muted-foreground hover:text-foreground")}
                >
                  <Icon name={g.goal.icon} size={19} style={{ color: "var(--goal)" }} strokeWidth={1.9} />
                  <span className="max-w-full truncate px-1">{g.goal.name}</span>
                  {g.doneToday && <Check size={11} className="absolute top-1.5 right-1.5 text-muted-foreground" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </Section>

        {goal && (
          <Section label="Activity">
            <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
              {goal.activityTypes.map((t) => (
                <button
                  key={t.id}
                  aria-pressed={!form.weighIn && form.typeId === t.id}
                  onClick={() => set({ typeId: t.id, weighIn: false, minutes: form.minutes && form.typeId === t.id ? form.minutes : String(pickMinutes(goal, t.id)) })}
                  className={chipClass(!form.weighIn && form.typeId === t.id)}
                >
                  {t.label}
                </button>
              ))}
              {goal.measurement && (
                <button aria-pressed={form.weighIn} onClick={() => set({ weighIn: true })} className={cn(chipClass(form.weighIn), "inline-flex items-center gap-1.5")}>
                  <Scale size={14} /> {goal.measurement.label}
                </button>
              )}
            </div>
            {!editing && !form.weighIn && ankiSynced && <p className="mt-2 px-1 text-xs text-muted-foreground">Anki syncs this automatically. A session logged here replaces that day&apos;s import.</p>}
          </Section>
        )}

        {form.weighIn && goal?.measurement ? (
          <Section label={goal.measurement.label}>
            <div className="relative">
              <Input autoFocus inputMode="decimal" aria-label={goal.measurement.label} placeholder={view?.measurements.at(-1)?.value.toString() ?? "0"} value={form.weight} onChange={(e) => set({ weight: e.target.value })} className="num h-14 rounded-2xl pr-12 text-2xl" />
              <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted-foreground">{goal.measurement.unit}</span>
            </div>
          </Section>
        ) : (
          goal && (
            <>
              <Section
                label="Duration"
                right={
                  !editing && (
                    <button
                      onClick={() => {
                        startTimer(goal.id, form.typeId);
                        onDone();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Play size={12} fill="currentColor" /> Start a timer
                    </button>
                  )
                }
              >
                <div className="no-scrollbar -mx-5 flex items-center gap-1.5 overflow-x-auto px-5">
                  {DURATIONS.map((m) => (
                    <button key={m} aria-pressed={minutes === m} onClick={() => set({ minutes: String(m) })} className={cn(chipClass(minutes === m), "num")}>{m}</button>
                  ))}
                  <label className="relative ml-1 shrink-0">
                    <input aria-label="Minutes" inputMode="numeric" value={form.minutes} onChange={(e) => set({ minutes: e.target.value })} placeholder="None" className="num h-9 w-[86px] rounded-xl border bg-transparent pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                  </label>
                </div>
              </Section>

              {goal.metrics.length > 0 && (
                <div className={cn("grid gap-3", goal.metrics.length > 1 && "grid-cols-2")}>
                  {goal.metrics.map((m) => (
                    <label key={m.id} className="block">
                      <span className="eyebrow mb-2 block">{m.label}</span>
                      <Input inputMode="numeric" aria-label={m.label} placeholder="Optional" value={form.metrics[m.id] ?? ""} onChange={(e) => set({ metrics: { ...form.metrics, [m.id]: e.target.value } })} className="num h-11 rounded-xl" />
                    </label>
                  ))}
                </div>
              )}

              {projects.length > 0 && (
                <Section label={goal.kind === "reading" ? "Book" : "Project"}>
                  <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
                    {projects.map((p) => (
                      <button key={p.id} aria-pressed={form.projectId === p.id} onClick={() => set({ projectId: form.projectId === p.id ? "" : p.id })} className={chipClass(form.projectId === p.id)}>{p.title}</button>
                    ))}
                  </div>
                  {project && !project.finishedAt && !editing && (
                    <label className="mt-2.5 flex items-center justify-between gap-3 px-1 text-sm">
                      Finished {goal.kind === "reading" ? "this book" : "this project"}
                      <Switch checked={form.finish} onCheckedChange={(v) => set({ finish: v })} />
                    </label>
                  )}
                </Section>
              )}

              {goal.kind === "fitness" && (
                <div>
                  {lifts || form.exercises.length > 0 ? (
                    <Section label="Exercises">
                      <ExerciseEditor exercises={form.exercises} onChange={(exercises) => set({ exercises })} history={view?.strength?.exercises ?? []} unit={d.weightUnit} />
                    </Section>
                  ) : (
                    <button onClick={() => { setLifts(true); set({ exercises: [{ exercise: "", sets: 3, reps: 5, kg: 0 }] }); }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                      <Dumbbell size={15} /> Add exercises
                    </button>
                  )}
                </div>
              )}
            </>
          )
        )}

        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: "Today", date: d.today },
              { label: "Yesterday", date: addDays(d.today, -1) },
            ].map((o) => (
              <button key={o.label} aria-pressed={form.date === o.date} onClick={() => set({ date: o.date })} className={chipClass(form.date === o.date)}>{o.label}</button>
            ))}
            <input type="date" aria-label="Date" max={d.today} value={form.date} onChange={(e) => e.target.value && set({ date: e.target.value })} className="num h-9 rounded-xl border bg-transparent px-2.5 text-sm text-muted-foreground outline-none focus:ring-2 focus:ring-ring" />
            <button aria-expanded={more} onClick={() => setMore((m) => !m)} className="ml-auto inline-flex h-9 items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground">
              Time & note <ChevronDown size={14} className={cn("transition-transform", more && "rotate-180")} />
            </button>
          </div>
          <AnimatePresence initial={false}>
            {(more || !!form.note) && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-2 pt-3">
                  <Input type="time" aria-label="Time" value={form.time || localParts(d.tz).time} onChange={(e) => set({ time: e.target.value })} className="h-10 w-32 rounded-xl" />
                  <Textarea aria-label="Note" placeholder="Add a note" value={form.note} onChange={(e) => set({ note: e.target.value })} className="min-h-16 rounded-xl" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="safe-b flex items-center gap-2 border-t p-4">
        {editing && (
          <button onClick={remove} aria-label="Delete activity" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-destructive">
            <Trash2 size={18} />
          </button>
        )}
        <button
          onClick={submit}
          disabled={!goal || (form.weighIn && !form.weight)}
          className="aurora-bg flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-medium transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {editing ? "Save changes" : form.weighIn ? "Save" : `Log ${goal?.name ?? "activity"}`}
        </button>
      </div>
    </div>
  );
}

export function LogSheet() {
  const open = useUI((s) => s.logOpen);
  const preset = useUI((s) => s.preset);
  const close = useUI((s) => s.closeLog);
  const desktop = useMediaQuery("(min-width: 768px)");
  const title = preset?.editing ? "Edit activity" : "Log activity";

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && close()}>
        <DialogContent className="flex max-h-[min(88dvh,760px)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[480px]">
          <div className="px-5 pt-5 pb-3">
            <DialogTitle className="font-display text-xl font-medium">{title}</DialogTitle>
          </div>
          <LogBody preset={preset} onDone={close} />
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={(v) => !v && close()} showSwipeHandle>
      <DrawerContent className="max-h-[92dvh] rounded-t-3xl">
        <div className="px-5 pt-4 pb-3">
          <DrawerTitle className="font-display text-xl font-medium">{title}</DrawerTitle>
        </div>
        <LogBody preset={preset} onDone={close} />
      </DrawerContent>
    </Drawer>
  );
}
