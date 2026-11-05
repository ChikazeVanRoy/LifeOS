"use client";

import { ArrowDown, ArrowUp, Download, FlaskConical, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AnkiPanel } from "@/components/anki-panel";
import { GoalEditor } from "@/components/goals/goal-editor";
import { useDerived } from "@/components/shell/providers";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { GoalBadge, PageHeader } from "@/components/viz/primitives";
import { createGoal, nextColor } from "@/lib/defaults";
import { deviceTimezone, fmtFull } from "@/lib/engine/dates";
import { describeSchedule } from "@/lib/engine/streaks";
import { parseImport, toExport } from "@/lib/io";
import { useStore } from "@/lib/store";
import type { AppData, Goal, ThemePref, WeightUnit } from "@/lib/types";
import { cn, fmtNum, plural } from "@/lib/utils";

const Group = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <section className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
    <div className="px-1">
      <h2 className="font-display text-[19px] font-medium">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
    <div className="card divide-y px-4 md:px-5">{children}</div>
  </section>
);

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
    <div className="min-w-0">
      <p className="text-sm">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </div>
);

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-xl bg-secondary p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn("h-8 rounded-[10px] px-3 text-[13px] transition-colors", value === o.value ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{o.label}</button>
      ))}
    </div>
  );
}

function Rests() {
  const d = useDerived();
  const pauses = useStore((s) => s.data.pauses);
  const { addPause, deletePause } = useStore.getState();
  const [from, setFrom] = useState(d.today);
  const [to, setTo] = useState(d.today);
  const [goalId, setGoalId] = useState("");
  const list = [...pauses].sort((a, b) => b.from.localeCompare(a.from));
  return (
    <>
      {list.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span className="min-w-0">
            <span className="num">{fmtFull(p.from)}{p.to !== p.from ? ` – ${fmtFull(p.to)}` : ""}</span>
            <span className="block text-xs text-muted-foreground">{p.goalId ? d.byId.get(p.goalId)?.goal.name : "All goals"}{p.note ? ` · ${p.note}` : ""}</span>
          </span>
          <button aria-label="Delete rest period" onClick={() => deletePause(p.id)} className="grid size-8 place-items-center text-muted-foreground hover:text-foreground"><Trash2 size={14} /></button>
        </div>
      ))}
      <form
        className="flex flex-wrap items-center gap-2 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (to < from) {
            toast.error("The end date is before the start date.");
            return;
          }
          addPause({ goalId: goalId || null, from, to });
          toast.success("Rest period saved");
        }}
      >
        <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px] rounded-xl" />
        <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px] rounded-xl" />
        <select aria-label="Goal" value={goalId} onChange={(e) => setGoalId(e.target.value)} className="h-9 rounded-xl border bg-transparent px-2 text-sm">
          <option value="">All goals</option>
          {d.goals.map((g) => <option key={g.goal.id} value={g.goal.id}>{g.goal.name}</option>)}
        </select>
        <Button type="submit" variant="secondary" size="sm"><Plus /> Add</Button>
      </form>
    </>
  );
}

export function SettingsPage() {
  const d = useDerived();
  const data = useStore((s) => s.data);
  const mode = useStore((s) => s.mode);
  const { setSettings, reorderGoal, replaceData, enterDemo, exitDemo, reset } = useStore.getState();
  const { settings } = data;
  const [editing, setEditing] = useState<{ goal: Goal; isNew: boolean } | null>(null);
  const [pending, setPending] = useState<AppData | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []), []);

  const exportData = () => {
    const blob = new Blob([toExport(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lifeos-${mode === "demo" ? "demo-" : ""}backup-${d.today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const importFile = async (f: File) => {
    const res = parseImport(await f.text());
    if (file.current) file.current.value = "";
    if (res.ok) setPending(res.data);
    else toast.error(res.error);
  };

  const goals = [...d.allGoals];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Everything here can be changed at any time." />
      <div className="space-y-9">
        <Group title="You">
          <Row label="Name"><Input aria-label="Name" value={settings.name} onChange={(e) => setSettings({ name: e.target.value })} placeholder="Your name" className="h-9 w-44 rounded-xl" /></Row>
          <Row label="Theme">
            <Segmented<ThemePref> label="Theme" value={settings.theme} onChange={(theme) => setSettings({ theme })} options={[{ value: "system", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </Row>
          <Row label="Celebrations" hint="Streak and achievement animations">
            <Switch aria-label="Celebrations" checked={settings.celebrations} onCheckedChange={(celebrations) => setSettings({ celebrations })} />
          </Row>
        </Group>

        <Group title="Time and units" description="Streaks follow your local calendar.">
          <Row label="Week starts on">
            <Segmented<0 | 1> label="Week starts on" value={settings.weekStartsOn} onChange={(weekStartsOn) => setSettings({ weekStartsOn })} options={[{ value: 1, label: "Monday" }, { value: 0, label: "Sunday" }]} />
          </Row>
          <Row label="Weight unit" hint="Changes the label only. Existing numbers are not converted.">
            <Segmented<WeightUnit> label="Weight unit" value={settings.weightUnit} onChange={(weightUnit) => setSettings({ weightUnit })} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} />
          </Row>
          <Row label="Timezone" hint={settings.timezone === "auto" ? `Following this device: ${deviceTimezone()}` : "Fixed. Entries keep the date they were logged on."}>
            <select aria-label="Timezone" value={settings.timezone} onChange={(e) => setSettings({ timezone: e.target.value })} className="h-9 max-w-52 rounded-xl border bg-transparent px-2 text-sm">
              <option value="auto">Automatic</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Row>
        </Group>

        <Group title="Goals" description="Add languages and anything else here, with their own targets and schedules.">
          {goals.map((g, i) => (
            <div key={g.goal.id} className="flex items-center gap-3 py-2.5">
              <GoalBadge icon={g.goal.icon} color={g.goal.color} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{g.goal.name}{g.goal.archived && <span className="text-muted-foreground"> (archived)</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{describeSchedule(g.schedule)}</p>
              </div>
              <button aria-label={`Move ${g.goal.name} up`} disabled={i === 0} onClick={() => reorderGoal(g.goal.id, -1)} className="grid size-8 place-items-center text-muted-foreground disabled:opacity-30"><ArrowUp size={15} /></button>
              <button aria-label={`Move ${g.goal.name} down`} disabled={i === goals.length - 1} onClick={() => reorderGoal(g.goal.id, 1)} className="grid size-8 place-items-center text-muted-foreground disabled:opacity-30"><ArrowDown size={15} /></button>
              <button aria-label={`Edit ${g.goal.name}`} onClick={() => setEditing({ goal: g.goal, isNew: false })} className="grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground"><Pencil size={14} /></button>
            </div>
          ))}
          <div className="py-3">
            <Button variant="secondary" size="sm" onClick={() => setEditing({ goal: createGoal("custom", d.today, { order: d.allGoals.length, color: nextColor(d.allGoals.map((g) => g.goal)) }), isNew: true })}><Plus /> New goal</Button>
          </div>
        </Group>

        <Group title="Rest" description="Planned breaks never break a streak. Weekly targets shrink to fit.">
          <Rests />
        </Group>

        <Group title="Your data" description="Stored only in this browser. Export regularly, as clearing site data deletes it.">
          <Row label="Export" hint={`${plural(data.logs.length, "activity", "activities")} as JSON`}>
            <Button variant="secondary" size="sm" onClick={exportData}><Download /> Export</Button>
          </Row>
          <Row label="Import" hint={mode === "demo" ? "Exit demo mode to restore a backup" : "Replaces everything with a backup"}>
            <input ref={file} type="file" accept="application/json,.json" aria-label="Backup file" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            <Button variant="secondary" size="sm" disabled={mode === "demo"} onClick={() => file.current?.click()}><Upload /> Import</Button>
          </Row>
          <Row label="Demo mode" hint="Sample data to explore with. Your real data is kept separate.">
            {mode === "demo" ? (
              <Button variant="secondary" size="sm" onClick={exitDemo}>Exit demo</Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={enterDemo}><FlaskConical /> Open demo</Button>
            )}
          </Row>
          <Row label="Reset" hint="Delete all activity and start again">
            <Button variant="destructive" size="sm" onClick={() => setConfirmReset(true)}>Reset</Button>
          </Row>
        </Group>

        <Group title="Integrations" description="Anki connects through Anki Analytics. The others are planned for later.">
          <AnkiPanel />
          {["Hevy", "Apple Health", "Calendar"].map((n) => (
            <Row key={n} label={n}><span className="text-xs text-muted-foreground">Not connected</span></Row>
          ))}
        </Group>
      </div>

      <GoalEditor goal={editing?.goal ?? null} isNew={editing?.isNew} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} />

      <AlertDialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your data?</AlertDialogTitle>
            <AlertDialogDescription>
              This swaps your {fmtNum(data.logs.length)} current activities for the {fmtNum(pending?.logs.length ?? 0)} in the backup. Export first if you want to keep them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) replaceData(pending);
                setPending(null);
                toast.success("Backup restored");
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete everything?</AlertDialogTitle>
            <AlertDialogDescription>All activity, goals and settings will be removed from this browser. This cannot be undone unless you have an export.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my data</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void reset()}>Delete everything</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
