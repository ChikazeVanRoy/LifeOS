"use client";

import { toast } from "sonner";
import { create } from "zustand";
import { createEmptyData, localeDefaults, milestonesForGoal, roadmapFromTemplate, type RoadmapTemplate } from "./defaults";
import { createDemoData } from "./demo";
import { importAnki, type AnkiFeed, type ImportResult } from "./engine/anki";
import { addDays, deviceTimezone, resolveTz, todayIn } from "./engine/dates";
import { withSchedule } from "./engine/streaks";
import { connectFile, pushToFile, reconcile, rereadRevision } from "./file-sync";
import { createLog, type NewLog } from "./log";
import { migrate } from "./migrate";
import { storage } from "./storage";
import type {
  AppData,
  Goal,
  JobApplication,
  LogEntry,
  Measurement,
  Milestone,
  Pause,
  Project,
  Roadmap,
  Schedule,
  Settings,
  Timer,
} from "./types";
import { uid } from "./utils";

type Mode = "real" | "demo";
const KEY: Record<Mode, string> = { real: "lifeos:data:real", demo: "lifeos:data:demo" };
const MODE_KEY = "lifeos:mode";

interface State {
  hydrated: boolean;
  mode: Mode;
  data: AppData;
  /** Set by actions that should celebrate, so loading data never fires confetti. */
  celebrate: boolean;
  hydrate: () => Promise<void>;
  enterDemo: () => void;
  exitDemo: () => void;
  replaceData: (data: AppData) => void;
  reset: () => Promise<void>;

  setSettings: (patch: Partial<Settings>) => void;

  addLog: (log: NewLog) => LogEntry;
  updateLog: (id: string, patch: Partial<LogEntry>) => void;
  deleteLog: (id: string) => void;
  restoreLog: (log: LogEntry) => void;

  /** Adds a goal with its suggested milestones. */
  addGoal: (goal: Goal) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  setSchedule: (id: string, schedule: Schedule) => void;
  reorderGoal: (id: string, delta: number) => void;
  deleteGoal: (id: string) => void;

  addMeasurement: (m: Omit<Measurement, "id">) => void;
  deleteMeasurement: (id: string) => void;

  addProject: (p: Omit<Project, "id">) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  addMilestone: (m: Omit<Milestone, "id" | "order">) => void;
  updateMilestone: (id: string, patch: Partial<Milestone>) => void;
  deleteMilestone: (id: string) => void;

  addRoadmap: (r: Pick<RoadmapTemplate, "title" | "description" | "icon" | "color" | "steps">) => void;
  updateRoadmap: (id: string, patch: Partial<Roadmap>) => void;
  deleteRoadmap: (id: string) => void;

  addPause: (p: Omit<Pause, "id">) => void;
  deletePause: (id: string) => void;

  addApplication: (a: Omit<JobApplication, "id">) => void;
  updateApplication: (id: string, patch: Partial<JobApplication>) => void;
  deleteApplication: (id: string) => void;

  /** First import. Quiet, because old reviews are not news. */
  connectAnki: (feed: AnkiFeed, mapping: Record<string, string>) => ImportResult;
  syncAnkiFeed: (feed: AnkiFeed) => void;
  remapAnki: (feed: AnkiFeed, mapping: Record<string, string>) => void;
  disconnectAnki: (keepHistory: boolean) => void;

  startTimer: (goalId: string, typeId: string | null) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  clearTimer: () => void;
}

const freshData = (today: string) => createEmptyData(today, localeDefaults(navigator.language));

const tzNow = (s: Settings) => resolveTz(s.timezone);
const todayOf = (d: AppData) => todayIn(tzNow(d.settings));

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("lifeos") : null;
const announce = () => channel?.postMessage("changed");

let writes: Promise<unknown> = Promise.resolve();
/** The browser copy first, so the app stays instant, then the file. Demo data never reaches the file. */
const save = (mode: Mode, data: AppData) => {
  writes = writes.then(async () => {
    const ok = await storage.write(KEY[mode], data);
    if (ok) announce();
    else if (mode === "demo") toast.error("Could not save the demo.");
  });
  if (mode === "real") pushToFile(data);
};

const hasData = (d: AppData | undefined) => !!(d?.settings.onboarded || d?.logs.length);

/** The real account: the file when it can be reached, otherwise this browser's copy. */
const loadReal = async () => {
  const local = migrate(await storage.read(KEY.real)) as AppData | undefined;
  const { data, notice } = await reconcile(local, hasData(local));
  if (notice) toast(notice);
  return data;
};

export const useStore = create<State>()((set, get) => {
  /** The one path for changing data: applies, then saves in order. */
  const update = (fn: (d: AppData) => AppData, celebrate = false) => {
    const data = fn(get().data);
    set({ data, celebrate: celebrate || get().celebrate });
    save(get().mode, data);
  };
  const patchItem = <K extends "logs" | "goals" | "measurements" | "projects" | "milestones" | "roadmaps" | "pauses" | "applications">(
    key: K,
    id: string,
    patch: Partial<AppData[K][number]>,
    celebrate = false,
  ) =>
    update((d) => ({ ...d, [key]: (d[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }), celebrate);
  const removeItem = <K extends "logs" | "measurements" | "projects" | "milestones" | "pauses" | "applications">(key: K, id: string) =>
    update((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((x) => x.id !== id) }));

  return {
    hydrated: false,
    mode: "real",
    data: createEmptyData("2000-01-01"),
    celebrate: false,

    hydrate: async () => {
      const mode = (await storage.read<Mode>(MODE_KEY)) === "demo" ? "demo" : "real";
      const today = todayIn(deviceTimezone());
      const saved = mode === "real" ? await loadReal() : (migrate(await storage.read(KEY.demo)) as AppData | undefined);
      // Setup that was never finished holds nothing worth keeping, so it starts over.
      const stored = hasData(saved) ? saved : undefined;
      const data = stored ?? (mode === "demo" ? createDemoData(today) : freshData(today));
      set({ hydrated: true, mode, data, celebrate: false });
      if (stored && mode === "demo") save(mode, stored);
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => undefined);
    },

    enterDemo: () => {
      // Real data stays under its own key and is not touched.
      const data = createDemoData(todayIn(deviceTimezone()));
      set({ mode: "demo", data, celebrate: false });
      void storage.write(MODE_KEY, "demo");
      save("demo", data);
    },

    exitDemo: () => {
      void storage.write(MODE_KEY, "real");
      void storage.remove(KEY.demo);
      loadReal().then((stored) => {
        set({ mode: "real", data: hasData(stored) ? stored! : freshData(todayIn(deviceTimezone())), celebrate: false });
      });
    },

    replaceData: (data) => {
      set({ data, celebrate: false });
      save(get().mode, data);
    },

    reset: async () => {
      const mode = get().mode;
      const data = freshData(todayIn(deviceTimezone()));
      if (mode === "demo") {
        get().enterDemo();
        return;
      }
      set({ data, celebrate: false });
      save("real", data);
    },

    setSettings: (patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } })),

    addLog: (input) => {
      const log = createLog(input, tzNow(get().data.settings));
      update((d) => ({ ...d, logs: [...d.logs, log] }), true);
      return log;
    },
    updateLog: (id, patch) => patchItem("logs", id, { ...patch, updatedAt: Date.now() }, true),
    deleteLog: (id) => removeItem("logs", id),
    restoreLog: (log) => update((d) => ({ ...d, logs: [...d.logs, log] })),

    addGoal: (goal) =>
      update((d) => ({ ...d, goals: [...d.goals, goal], milestones: [...d.milestones, ...milestonesForGoal(goal)] })),
    updateGoal: (id, patch) => patchItem("goals", id, patch),
    setSchedule: (id, schedule) =>
      update((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id === id ? { ...g, schedules: withSchedule(g.schedules, schedule, todayOf(d), d.settings.weekStartsOn) } : g,
        ),
      })),
    reorderGoal: (id, delta) =>
      update((d) => {
        const sorted = [...d.goals].sort((a, b) => a.order - b.order);
        const i = sorted.findIndex((g) => g.id === id);
        const j = i + delta;
        if (j < 0 || j >= sorted.length) return d;
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
        return { ...d, goals: sorted.map((g, order) => ({ ...g, order })) };
      }),
    deleteGoal: (id) =>
      update((d) => ({
        ...d,
        goals: d.goals.filter((g) => g.id !== id),
        logs: d.logs.filter((l) => l.goalId !== id),
        measurements: d.measurements.filter((m) => m.goalId !== id),
        projects: d.projects.filter((p) => p.goalId !== id),
        milestones: d.milestones.filter((m) => m.goalId !== id),
        pauses: d.pauses.filter((p) => p.goalId !== id),
        anki: d.anki && { ...d.anki, mapping: Object.fromEntries(Object.entries(d.anki.mapping).filter(([, goalId]) => goalId !== id)) },
        timer: d.timer?.goalId === id ? null : d.timer,
      })),

    addMeasurement: (m) => update((d) => ({ ...d, measurements: [...d.measurements, { ...m, id: uid() }] }), true),
    deleteMeasurement: (id) => removeItem("measurements", id),

    addProject: (p) => {
      const project = { ...p, id: uid() };
      update((d) => ({ ...d, projects: [...d.projects, project] }));
      return project;
    },
    updateProject: (id, patch) => patchItem("projects", id, patch, true),
    deleteProject: (id) =>
      update((d) => ({
        ...d,
        projects: d.projects.filter((p) => p.id !== id),
        logs: d.logs.map((l) => (l.projectId === id ? { ...l, projectId: undefined } : l)),
      })),

    addMilestone: (m) =>
      update((d) => ({ ...d, milestones: [...d.milestones, { ...m, id: uid(), order: d.milestones.length }] })),
    updateMilestone: (id, patch) => patchItem("milestones", id, patch, true),
    deleteMilestone: (id) => removeItem("milestones", id),

    addRoadmap: (template) =>
      update((d) => {
        const { roadmap, milestones } = roadmapFromTemplate(template, d.roadmaps.length);
        return { ...d, roadmaps: [...d.roadmaps, roadmap], milestones: [...d.milestones, ...milestones] };
      }),
    updateRoadmap: (id, patch) => patchItem("roadmaps", id, patch),
    deleteRoadmap: (id) =>
      update((d) => ({
        ...d,
        roadmaps: d.roadmaps.filter((r) => r.id !== id),
        // A step that also belongs to a goal stays with the goal.
        goals: d.goals.map((g) => (g.roadmapId === id ? { ...g, roadmapId: null } : g)),
        milestones: d.milestones.flatMap((m) => (m.roadmapId !== id ? [m] : m.goalId ? [{ ...m, roadmapId: null }] : [])),
      })),

    addPause: (p) => update((d) => ({ ...d, pauses: [...d.pauses, { ...p, id: uid() }] })),
    deletePause: (id) => removeItem("pauses", id),

    addApplication: (a) => update((d) => ({ ...d, applications: [...d.applications, { ...a, id: uid() }] })),
    updateApplication: (id, patch) => patchItem("applications", id, patch),
    deleteApplication: (id) => removeItem("applications", id),

    connectAnki: (feed, mapping) => {
      const d = get().data;
      const tz = tzNow(d.settings);
      const result = importAnki({ feed, mapping, goals: d.goals, logs: d.logs, today: todayIn(tz), tz, now: Date.now() });
      update((x) => ({
        ...x,
        logs: result.logs,
        goals: result.goals,
        anki: {
          mapping,
          deckNames: Object.fromEntries(feed.decks.map((deck) => [deck.id, deck.name])),
          connectedAt: new Date().toISOString(),
          importedThrough: feed.generatedAt,
          dayStartHour: feed.dayStartHour,
        },
      }));
      return result;
    },
    syncAnkiFeed: (feed) => {
      const d = get().data;
      if (!d.anki || get().mode !== "real") return;
      const tz = tzNow(d.settings);
      const today = todayIn(tz);
      const result = importAnki({ feed, mapping: d.anki.mapping, goals: d.goals, logs: d.logs, today, tz, now: Date.now() });
      const changed = result.added + result.updated + result.removed > 0;
      if (!changed && d.anki.importedThrough === feed.generatedAt) return;
      const recent = result.changedDates.some((date) => date >= addDays(today, -6));
      update((x) => ({
        ...x,
        logs: result.logs,
        goals: result.goals,
        anki: x.anki && { ...x.anki, importedThrough: feed.generatedAt, dayStartHour: feed.dayStartHour },
      }), recent);
    },
    remapAnki: (feed, mapping) => {
      const d = get().data;
      if (!d.anki) return;
      const decksOf = (m: Record<string, string>, goalId: string) => Object.keys(m).filter((k) => m[k] === goalId).sort().join();
      const goalIds = new Set([...Object.values(d.anki.mapping), ...Object.values(mapping)]);
      const changed = [...goalIds].filter((g) => decksOf(d.anki!.mapping, g) !== decksOf(mapping, g));
      // Goals fed by different decks start over. The rest keep what they have.
      const logs = d.logs.filter((l) => !(l.source === "anki" && changed.includes(l.goalId)));
      const tz = tzNow(d.settings);
      const result = importAnki({ feed, mapping, goals: d.goals, logs, today: todayIn(tz), tz, now: Date.now() });
      update((x) => ({ ...x, logs: result.logs, goals: result.goals, anki: x.anki && { ...x.anki, mapping, importedThrough: feed.generatedAt } }));
    },
    disconnectAnki: (keepHistory) =>
      update((d) => ({
        ...d,
        anki: null,
        // Kept entries become ordinary ones, and count as logged by hand if Anki is connected again.
        logs: keepHistory ? d.logs.map((l) => (l.source ? { ...l, source: undefined } : l)) : d.logs.filter((l) => !l.source),
      })),

    startTimer: (goalId, typeId) => {
      const timer: Timer = { goalId, typeId, startedAt: Date.now(), bankedMs: 0, pausedAt: null };
      update((d) => ({ ...d, timer }));
    },
    pauseTimer: () =>
      update((d) => {
        if (!d.timer || d.timer.pausedAt) return d;
        const now = Date.now();
        return { ...d, timer: { ...d.timer, bankedMs: d.timer.bankedMs + now - d.timer.startedAt, pausedAt: now } };
      }),
    resumeTimer: () =>
      update((d) => (d.timer?.pausedAt ? { ...d, timer: { ...d.timer, startedAt: Date.now(), pausedAt: null } } : d)),
    clearTimer: () => update((d) => ({ ...d, timer: null })),
  };
});

/** Lets the shell know a celebration was consumed. */
export const consumeCelebrate = () => {
  const armed = useStore.getState().celebrate;
  if (armed) useStore.setState({ celebrate: false });
  return armed;
};

export const timerElapsedMs = (t: Timer, now = Date.now()) => t.bankedMs + (t.pausedAt ? 0 : now - t.startedAt);

// Another tab saved: pick up its data rather than overwriting it later.
channel?.addEventListener("message", () => {
  const { mode } = useStore.getState();
  void rereadRevision();
  storage.read(KEY[mode]).then((data) => {
    if (data) useStore.setState({ data: migrate(data) as AppData, celebrate: false });
  });
});

connectFile({
  current: () => {
    const { mode, data, hydrated } = useStore.getState();
    return hydrated && mode === "real" ? data : null;
  },
  apply: (data) => {
    useStore.setState({ data, celebrate: false });
    void storage.write(KEY.real, data);
  },
  announce,
});

