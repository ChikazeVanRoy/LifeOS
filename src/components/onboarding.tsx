"use client";

import { ArrowLeft, ArrowRight, Check, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ScheduleField } from "@/components/goals/goal-editor";
import { chipClass } from "@/components/log/log-sheet";
import { Logo } from "@/components/shell/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/viz/icons";
import { goalVar, GoalBadge } from "@/components/viz/primitives";
import { CREATIVE_FOCUSES, createGoal, creativeFocusPatch, nextColor, ROADMAP_TEMPLATES, WORDS_MILESTONE, type CreativeFocus } from "@/lib/defaults";
import { deviceTimezone } from "@/lib/engine/dates";
import { currentSchedule, describeSchedule } from "@/lib/engine/streaks";
import { useStore } from "@/lib/store";
import type { Goal, Schedule, WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONAL = new Set(["career"]);
const EVERY_DAY: Schedule = { kind: "days", days: [0, 1, 2, 3, 4, 5, 6] };

function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => <button key={String(o.value)} aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={chipClass(value === o.value)}>{o.label}</button>)}
      </div>
    </div>
  );
}

export function Onboarding() {
  const data = useStore((s) => s.data);
  const { setSettings, setSchedule, updateGoal, addGoal, addMilestone, addRoadmap, enterDemo } = useStore.getState();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(data.goals.map((g) => [g.id, !OPTIONAL.has(g.id)])));
  const [schedules, setSchedules] = useState<Record<string, Schedule>>(() => Object.fromEntries(data.goals.map((g) => [g.id, currentSchedule(g)])));
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<CreativeFocus>("general");

  const [languages, setLanguages] = useState<string[]>([]);
  const [languageInput, setLanguageInput] = useState("");
  const [languageSchedule, setLanguageSchedule] = useState<Schedule>(EVERY_DAY);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ownRoadmaps, setOwnRoadmaps] = useState<string[]>([]);
  const [roadmapInput, setRoadmapInput] = useState("");

  const [weekStartsOn, setWeekStartsOn] = useState(data.settings.weekStartsOn);
  const [weightUnit, setWeightUnit] = useState(data.settings.weightUnit);

  const addLanguage = () => {
    const n = languageInput.trim();
    if (n && !languages.some((l) => l.toLowerCase() === n.toLowerCase())) setLanguages((l) => [...l, n]);
    setLanguageInput("");
  };
  const addOwnRoadmap = () => {
    const n = roadmapInput.trim();
    if (n && !ownRoadmaps.includes(n)) setOwnRoadmaps((r) => [...r, n]);
    setRoadmapInput("");
  };
  const togglePicked = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Text left in a field still counts when moving on.
  const next = () => {
    if (step === 1) addLanguage();
    if (step === 2) addOwnRoadmap();
    setStep((s) => s + 1);
  };

  const finish = () => {
    const today = data.goals[0]?.createdAt ?? "";
    const taken: Pick<Goal, "color" | "archived">[] = data.goals.filter((g) => enabled[g.id]);
    for (const g of data.goals) {
      if (JSON.stringify(schedules[g.id]) !== JSON.stringify(currentSchedule(g))) setSchedule(g.id, schedules[g.id]);
      if (g.kind === "creative" && focus !== "general") updateGoal(g.id, creativeFocusPatch(focus));
      if (g.kind === "creative" && focus === "writing") addMilestone({ ...WORDS_MILESTONE, goalId: g.id, roadmapId: null });
      if (g.kind === "fitness") updateGoal(g.id, { measurement: g.measurement && { ...g.measurement, unit: weightUnit } });
      if (!enabled[g.id]) updateGoal(g.id, { archived: true });
    }
    languages.forEach((language, i) => {
      const color = nextColor(taken);
      taken.push({ color, archived: false });
      const goal = createGoal("language", today, { name: language, color, order: 0.1 * (i + 1) });
      addGoal({ ...goal, icon: i % 2 ? "messages-square" : "languages", schedules: [{ from: today, schedule: languageSchedule }] });
    });
    for (const t of ROADMAP_TEMPLATES) if (picked.has(t.id)) addRoadmap(t);
    for (const title of ownRoadmaps) addRoadmap({ title, description: "", icon: "mountain", color: "lime", steps: [] });
    setSettings({ name: name.trim(), onboarded: true, weekStartsOn, weightUnit });
  };

  const steps = [
    <div key="welcome" className="text-center">
      <Logo size={36} />
      <h1 className="font-display mt-8 text-[40px] leading-[1.08] font-medium md:text-[52px]">
        See how far<br />you&apos;ve <span className="aurora-text">come.</span>
      </h1>
      <p className="mx-auto mt-4 max-w-sm text-[15px] text-muted-foreground">
        Log what you do. LifeOS turns it into streaks, achievements and a record of the person you are becoming.
      </p>
      <form className="mx-auto mt-8 max-w-xs" onSubmit={(e) => { e.preventDefault(); setStep(1); }}>
        <Input autoFocus aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" className="h-12 rounded-2xl text-center text-[15px]" />
        <Button type="submit" size="lg" className="mt-3 w-full">Get started <ArrowRight /></Button>
      </form>
      <button onClick={enterDemo} className="mt-5 text-sm text-muted-foreground underline-offset-4 hover:underline">Explore a demo with sample data first</button>
    </div>,

    <div key="goals">
      <h1 className="font-display text-3xl font-medium">What do you want to grow?</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">Keep what fits and set a rhythm. Rest days never break a streak, and you can add anything else later.</p>
      <div className="mt-6 space-y-2">
        {data.goals.map((g) => {
          const on = enabled[g.id];
          const isOpen = open === g.id && on;
          const label = g.kind === "creative" && focus !== "general" ? CREATIVE_FOCUSES[focus].name : g.name;
          return (
            <div key={g.id} className={cn("card overflow-hidden transition-opacity", !on && "opacity-60")} style={goalVar(g.color)}>
              <div className="flex items-center gap-3 p-3">
                <GoalBadge icon={g.kind === "creative" ? CREATIVE_FOCUSES[focus].icon : g.icon} color={g.color} size={40} />
                <button disabled={!on} onClick={() => setOpen(isOpen ? null : g.id)} className="min-w-0 flex-1 text-left">
                  <span className="block text-[15px] font-medium">{label}{OPTIONAL.has(g.id) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>}</span>
                  <span className="block text-sm text-muted-foreground">{describeSchedule(schedules[g.id])}{on && <span className="ml-1.5 underline underline-offset-2">Change</span>}</span>
                </button>
                <Switch aria-label={`Track ${label}`} checked={on} onCheckedChange={(v) => setEnabled((x) => ({ ...x, [g.id]: v }))} />
              </div>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="space-y-3 border-t p-3">
                      {g.kind === "creative" && (
                        <div>
                          <p className="eyebrow mb-2">What do you make?</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(Object.keys(CREATIVE_FOCUSES) as CreativeFocus[]).map((f) => (
                              <button key={f} aria-pressed={focus === f} onClick={() => setFocus(f)} className={chipClass(focus === f)}>{CREATIVE_FOCUSES[f].label}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      <ScheduleField value={schedules[g.id]} onChange={(s) => setSchedules((x) => ({ ...x, [g.id]: s }))} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <div className="card p-3">
          <div className="flex items-center gap-3">
            <GoalBadge icon="languages" color="green" size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">Languages</p>
              <p className="text-sm text-muted-foreground">Add one for each, or skip this</p>
            </div>
          </div>
          {languages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {languages.map((l) => (
                <span key={l} className="inline-flex h-8 items-center gap-1 rounded-lg bg-secondary pr-1 pl-2.5 text-sm">
                  {l}
                  <button aria-label={`Remove ${l}`} onClick={() => setLanguages((x) => x.filter((y) => y !== l))} className="grid size-6 place-items-center text-muted-foreground"><X size={13} /></button>
                </span>
              ))}
            </div>
          )}
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); addLanguage(); }}>
            <Input aria-label="Add a language" placeholder="Spanish, Japanese, Arabic…" value={languageInput} onChange={(e) => setLanguageInput(e.target.value)} className="h-10 rounded-xl" />
            <Button type="submit" variant="secondary" size="icon" aria-label="Add language"><Plus /></Button>
          </form>
          {(languages.length > 0 || languageInput) && (
            <div className="mt-3"><ScheduleField value={languageSchedule} onChange={setLanguageSchedule} /></div>
          )}
        </div>
      </div>
    </div>,

    <div key="roadmaps">
      <h1 className="font-display text-3xl font-medium">The long game</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">Bigger goals live as roadmaps, not daily habits. Pick any that fit or write your own. This is optional, and you can come back to it.</p>
      <div className="mt-6 space-y-2">
        {ROADMAP_TEMPLATES.map((r) => {
          const on = picked.has(r.id);
          return (
            <button key={r.id} aria-pressed={on} onClick={() => togglePicked(r.id)} style={goalVar(r.color)} className={cn("card flex w-full items-center gap-3 p-3 text-left transition-all", on && "goal-glow goal-tint")}>
              <GoalBadge icon={r.icon} color={r.color} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{r.title}</span>
                <span className="block truncate text-sm text-muted-foreground">{r.description}</span>
              </span>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", on ? "bg-[var(--goal)] text-white" : "ring-2 ring-inset ring-track")}>{on && <Check size={14} strokeWidth={3} />}</span>
            </button>
          );
        })}
        {ownRoadmaps.map((title) => (
          <div key={title} className="card flex items-center gap-3 p-3">
            <GoalBadge icon="mountain" color="lime" size={40} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{title}</span>
            <button aria-label={`Remove ${title}`} onClick={() => setOwnRoadmaps((x) => x.filter((y) => y !== title))} className="grid size-8 place-items-center text-muted-foreground"><X size={15} /></button>
          </div>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); addOwnRoadmap(); }}>
        <Input aria-label="Your own long-term goal" placeholder="Your own long-term goal" value={roadmapInput} onChange={(e) => setRoadmapInput(e.target.value)} className="h-10 rounded-xl" />
        <Button type="submit" variant="secondary" size="icon" aria-label="Add your own goal"><Plus /></Button>
      </form>
    </div>,

    <div key="ready">
      <div className="text-center">
        <span className="aurora-bg mx-auto grid size-20 place-items-center rounded-[28px]"><Icon name="sunrise" size={36} strokeWidth={1.7} /></span>
        <h1 className="font-display mt-7 text-4xl font-medium">Day one{name.trim() ? `, ${name.trim()}` : ""}.</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] text-muted-foreground">Your account starts at zero, with nothing invented. Every number you see from here on will be something you did.</p>
      </div>
      <div className="card mt-6 space-y-3 p-4">
        <Choice<0 | 1> label="Weeks start on" value={weekStartsOn} onChange={setWeekStartsOn} options={[{ value: 1, label: "Monday" }, { value: 0, label: "Sunday" }]} />
        <Choice<WeightUnit> label="Weights in" value={weightUnit} onChange={setWeightUnit} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} />
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Times follow {deviceTimezone()}. Your data is saved to a file on this Mac.</p>
    </div>,
  ];

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <div aria-hidden className="pointer-events-none fixed top-[-20%] left-1/2 size-[520px] -translate-x-1/2 rounded-full opacity-[0.1] blur-3xl" style={{ background: "var(--aurora)" }} />
      <div className="relative w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            {steps[step]}
          </motion.div>
        </AnimatePresence>
        {step > 0 && (
          <div className="mt-7 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}><ArrowLeft /> Back</Button>
            <div className="flex gap-1.5" aria-hidden>
              {[1, 2, 3].map((i) => <span key={i} className={cn("size-1.5 rounded-full", i === step ? "bg-foreground" : "bg-track")} />)}
            </div>
            {step < 3 ? (
              <Button onClick={next}>Continue <ArrowRight /></Button>
            ) : (
              <Button onClick={finish}><Check /> Start</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
