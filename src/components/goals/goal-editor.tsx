"use client";

import { Archive, ArchiveRestore, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { chipClass } from "@/components/log/log-sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Icon, ICON_CHOICES } from "@/components/viz/icons";
import { goalVar } from "@/components/viz/primitives";
import { currentSchedule } from "@/lib/engine/streaks";
import { CREATIVE_FOCUSES, createGoal, creativeFocusPatch, nextColor, type CreativeFocus } from "@/lib/defaults";
import { useStore } from "@/lib/store";
import { COLOR_KEYS, type ColorKey, type Goal, type GoalKind, type Schedule } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

const DAYS = [
  { n: 1, l: "M" }, { n: 2, l: "T" }, { n: 3, l: "W" }, { n: 4, l: "T" }, { n: 5, l: "F" }, { n: 6, l: "S" }, { n: 0, l: "S" },
];

export function ScheduleField({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const mode = value.kind === "weekly" ? "weekly" : value.days.length === 7 ? "daily" : "days";
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={mode === "daily"} className={chipClass(mode === "daily")} onClick={() => onChange({ kind: "days", days: [0, 1, 2, 3, 4, 5, 6] })}>Every day</button>
        <button type="button" aria-pressed={mode === "days"} className={chipClass(mode === "days")} onClick={() => onChange({ kind: "days", days: [1, 3, 5] })}>Specific days</button>
        <button type="button" aria-pressed={mode === "weekly"} className={chipClass(mode === "weekly")} onClick={() => onChange({ kind: "weekly", sessions: value.kind === "weekly" ? value.sessions : 3 })}>Times a week</button>
      </div>
      {mode === "days" && value.kind === "days" && (
        <div className="flex gap-1.5">
          {DAYS.map((d) => {
            const on = value.days.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                aria-pressed={on}
                aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.n]}
                onClick={() => {
                  const days = on ? value.days.filter((x) => x !== d.n) : [...value.days, d.n];
                  if (days.length) onChange({ kind: "days", days });
                }}
                className={cn("grid size-9 place-items-center rounded-xl border text-sm", on ? "border-transparent bg-foreground font-medium text-background" : "text-muted-foreground")}
              >
                {d.l}
              </button>
            );
          })}
        </div>
      )}
      {value.kind === "weekly" && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" aria-label="Fewer sessions" className="grid size-9 place-items-center rounded-xl border" onClick={() => onChange({ kind: "weekly", sessions: Math.max(1, value.sessions - 1) })}>−</button>
          <span className="num w-20 text-center">{value.sessions} {value.sessions === 1 ? "session" : "sessions"}</span>
          <button type="button" aria-label="More sessions" className="grid size-9 place-items-center rounded-xl border" onClick={() => onChange({ kind: "weekly", sessions: Math.min(21, value.sessions + 1) })}>+</button>
        </div>
      )}
    </div>
  );
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <Label className="eyebrow mb-2 block">{label}</Label>
    {children}
    {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const KINDS: { kind: GoalKind; label: string }[] = [
  { kind: "custom", label: "Custom" },
  { kind: "language", label: "Language" },
  { kind: "creative", label: "Creative" },
  { kind: "fitness", label: "Fitness" },
  { kind: "reading", label: "Reading" },
  { kind: "career", label: "Learning" },
];

interface EditorProps {
  goal: Goal | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isNew?: boolean;
}

/** Keyed so each opening starts from the saved goal. */
export function GoalEditor(props: EditorProps) {
  if (!props.goal) return null;
  return <Editor key={`${props.goal.id}-${props.open}`} {...props} goal={props.goal} />;
}

function Editor({ goal, open, onOpenChange, isNew }: EditorProps & { goal: Goal }) {
  const { addGoal, updateGoal, setSchedule, deleteGoal } = useStore.getState();
  const router = useRouter();
  const [draft, setDraft] = useState<Goal>(goal);
  const [nameTouched, setNameTouched] = useState(false);
  const [measuring, setMeasuring] = useState(!!goal.measurement);
  const [schedule, setScheduleDraft] = useState<Schedule>(currentSchedule(goal));
  const [typeName, setTypeName] = useState("");
  const [metricName, setMetricName] = useState("");
  const [metricUnit, setMetricUnit] = useState("");
  const [confirm, setConfirm] = useState(false);

  const set = (patch: Partial<Goal>) => setDraft({ ...draft, ...patch });

  /** Picking a template starts from it, keeping any name already typed. */
  const pickKind = (kind: GoalKind) => {
    const { goals, settings } = useStore.getState().data;
    const next = createGoal(kind, draft.createdAt, {
      id: draft.id,
      order: draft.order,
      name: nameTouched ? draft.name : undefined,
      color: nextColor(goals),
      weightUnit: settings.weightUnit,
    });
    setDraft(next);
    setScheduleDraft(currentSchedule(next));
    setMeasuring(!!next.measurement);
  };
  const pickFocus = (focus: CreativeFocus) => {
    const patch = creativeFocusPatch(focus);
    set(nameTouched ? { ...patch, name: draft.name } : patch);
  };

  const save = () => {
    if (!draft.name.trim()) return;
    const measurement = draft.measurement?.label.trim() ? draft.measurement : undefined;
    if (isNew) {
      // A new goal is only a draft until this point, so cancelling leaves nothing behind.
      addGoal({ ...draft, measurement, name: draft.name.trim(), schedules: [{ from: draft.createdAt, schedule }] });
      onOpenChange(false);
      return;
    }
    updateGoal(goal.id, { ...draft, measurement, name: draft.name.trim() });
    if (JSON.stringify(schedule) !== JSON.stringify(currentSchedule(goal))) setSchedule(goal.id, schedule);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[520px]">
          <div className="px-5 pt-5 pb-3"><DialogTitle className="font-display text-xl font-medium">{isNew ? "New goal" : `Edit ${goal.name}`}</DialogTitle></div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
            {isNew && (
              <Field label="Type">
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map((k) => (
                    <button key={k.kind} type="button" aria-pressed={draft.kind === k.kind} onClick={() => pickKind(k.kind)} className={chipClass(draft.kind === k.kind)}>{k.label}</button>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Name">
              <Input
                autoFocus={isNew}
                aria-label="Goal name"
                value={draft.name}
                onChange={(e) => {
                  setNameTouched(true);
                  set({ name: e.target.value });
                }}
                placeholder={draft.kind === "language" ? "Spanish" : "Meditation"}
                className="h-11 rounded-xl"
              />
            </Field>

            {isNew && draft.kind === "creative" && (
              <Field label="Focus">
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(CREATIVE_FOCUSES) as CreativeFocus[]).map((f) => (
                    <button key={f} type="button" aria-pressed={draft.activityTypes[0]?.label === CREATIVE_FOCUSES[f].types[0]} onClick={() => pickFocus(f)} className={chipClass(draft.activityTypes[0]?.label === CREATIVE_FOCUSES[f].types[0])}>{CREATIVE_FOCUSES[f].label}</button>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Colour">
              <div className="flex flex-wrap gap-2">
                {COLOR_KEYS.map((c: ColorKey) => (
                  <button key={c} type="button" aria-label={c} aria-pressed={draft.color === c} onClick={() => set({ color: c })} className={cn("size-8 rounded-full transition-transform", draft.color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-popover")} style={{ background: `var(--c-${c})` }} />
                ))}
              </div>
            </Field>

            <Field label="Icon">
              <div className="flex flex-wrap gap-1.5" style={goalVar(draft.color)}>
                {ICON_CHOICES.map((i) => (
                  <button key={i} type="button" aria-label={i} aria-pressed={draft.icon === i} onClick={() => set({ icon: i })} className={cn("grid size-9 place-items-center rounded-xl", draft.icon === i ? "goal-tint text-[var(--goal)]" : "text-muted-foreground")}>
                    <Icon name={i} size={17} />
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Schedule" hint="Past days keep the schedule they had, so changing this never breaks a streak retroactively.">
              <ScheduleField value={schedule} onChange={setScheduleDraft} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Weekly hours"><Input inputMode="decimal" placeholder="Optional" value={draft.weeklyMinutes ? String(draft.weeklyMinutes / 60) : ""} onChange={(e) => set({ weeklyMinutes: Number(e.target.value.replace(",", ".")) * 60 || undefined })} className="h-10 rounded-xl" /></Field>
              <Field label="Minimum session"><div className="relative"><Input inputMode="numeric" value={draft.minMinutes || ""} placeholder="Any" onChange={(e) => set({ minMinutes: Number(e.target.value) || 0 })} className="h-10 rounded-xl pr-10" /><span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">min</span></div></Field>
            </div>

            <Field label="Activity types">
              <div className="flex flex-wrap gap-1.5">
                {draft.activityTypes.map((t) => (
                  <span key={t.id} className="inline-flex h-8 items-center gap-1 rounded-lg bg-secondary pr-1 pl-2.5 text-sm">
                    {t.label}
                    {draft.activityTypes.length > 1 && (
                      <button type="button" aria-label={`Remove ${t.label}`} onClick={() => set({ activityTypes: draft.activityTypes.filter((x) => x.id !== t.id) })} className="grid size-6 place-items-center text-muted-foreground"><X size={13} /></button>
                    )}
                  </span>
                ))}
              </div>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typeName.trim()) {
                    set({ activityTypes: [...draft.activityTypes, { id: uid(), label: typeName.trim(), defaultMinutes: 30 }] });
                    setTypeName("");
                  }
                }}
              >
                <Input aria-label="New activity type" placeholder="Add a type" value={typeName} onChange={(e) => setTypeName(e.target.value)} className="h-9 rounded-xl" />
                <button aria-label="Add activity type" className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary"><Plus size={15} /></button>
              </form>
            </Field>

            <Field label="Custom metrics" hint="Anything you count: reps, kilometres, cards, lines of code.">
              <div className="flex flex-wrap gap-1.5">
                {draft.metrics.map((m) => (
                  <span key={m.id} className="inline-flex h-8 items-center gap-1 rounded-lg bg-secondary pr-1 pl-2.5 text-sm">
                    {m.label} <span className="text-muted-foreground">({m.unit})</span>
                    <button type="button" aria-label={`Remove ${m.label}`} onClick={() => set({ metrics: draft.metrics.filter((x) => x.id !== m.id) })} className="grid size-6 place-items-center text-muted-foreground"><X size={13} /></button>
                  </span>
                ))}
              </div>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (metricName.trim()) {
                    set({ metrics: [...draft.metrics, { id: uid(), label: metricName.trim(), unit: metricUnit.trim() || metricName.trim().toLowerCase() }] });
                    setMetricName("");
                    setMetricUnit("");
                  }
                }}
              >
                <Input aria-label="Metric name" placeholder="Name" value={metricName} onChange={(e) => setMetricName(e.target.value)} className="h-9 rounded-xl" />
                <Input aria-label="Metric unit" placeholder="Unit" value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} className="h-9 w-28 rounded-xl" />
                <button aria-label="Add metric" className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary"><Plus size={15} /></button>
              </form>
            </Field>

            <Field label="Measurement" hint="Something you check over time, like body weight or savings.">
              <label className="flex items-center justify-between gap-3 text-sm">
                Track a measurement
                <Switch
                  aria-label="Track a measurement"
                  checked={measuring}
                  onCheckedChange={(on) => {
                    setMeasuring(on);
                    set({ measurement: on ? draft.measurement ?? { id: uid(), label: "", unit: "" } : undefined });
                  }}
                />
              </label>
              {measuring && draft.measurement && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Input aria-label="Measurement name" placeholder="Name" value={draft.measurement.label} onChange={(e) => set({ measurement: { ...draft.measurement!, label: e.target.value } })} className="h-10 rounded-xl" />
                  <Input aria-label="Measurement unit" placeholder="Unit" value={draft.measurement.unit} onChange={(e) => set({ measurement: { ...draft.measurement!, unit: e.target.value } })} className="h-10 rounded-xl" />
                  <Input aria-label="Measurement target" inputMode="decimal" placeholder="Target" value={draft.measurement.target ?? ""} onChange={(e) => set({ measurement: { ...draft.measurement!, target: Number(e.target.value.replace(",", ".")) || undefined } })} className="h-10 rounded-xl" />
                </div>
              )}
            </Field>

            {draft.kind === "career" && (
              <label className="flex items-center justify-between gap-3 text-sm">
                Track job applications
                <Switch aria-label="Track job applications" checked={!!draft.trackApplications} onCheckedChange={(trackApplications) => set({ trackApplications })} />
              </label>
            )}

            {!isNew && (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button variant="secondary" size="sm" onClick={() => { updateGoal(goal.id, { archived: !goal.archived }); onOpenChange(false); }}>
                  {goal.archived ? <ArchiveRestore /> : <Archive />} {goal.archived ? "Restore goal" : "Archive goal"}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}><Trash2 /> Delete with history</Button>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t p-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={!draft.name.trim()}>{isNew ? "Create goal" : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {goal.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the goal and every activity logged against it. Archiving keeps the history instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onOpenChange(false);
                deleteGoal(goal.id);
                router.push("/goals");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
