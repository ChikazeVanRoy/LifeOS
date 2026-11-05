import { addDays, deviceTimezone, startOfWeek, weekday } from "./engine/dates";
import { createEmptyData, createGoal, milestonesForGoal, ROADMAP_TEMPLATES, roadmapFromTemplate } from "./defaults";
import type { AppData, ExerciseEntry, LogEntry } from "./types";

/** A small seeded generator, so demo mode looks the same on every visit. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const LIFTS: [string, number, number, number][] = [
  ["Squat", 60, 0.34, 5],
  ["Bench press", 45, 0.22, 5],
  ["Deadlift", 80, 0.42, 5],
  ["Overhead press", 30, 0.11, 6],
  ["Barbell row", 40, 0.2, 8],
];

const BOOKS = ["The Salt Road", "A Quiet Harbour", "Seven Winters", "The Glass Orchard", "North of Everything", "The Cartographer's Year", "Paper Lanterns", "Small Hours"];

/** Clearly labelled sample data for exploring the app. Stored apart from real data. */
export const createDemoData = (today: string): AppData => {
  const r = rng(20261104);
  const start = addDays(today, -270);
  const data = createEmptyData(start);
  data.settings = { ...data.settings, name: "Demo", onboarded: true };
  const creative = createGoal("creative", start, { id: "creative", focus: "writing", order: 0 });
  const languages = [
    createGoal("language", start, { id: "spanish", name: "Spanish", color: "green", order: 0.1 }),
    { ...createGoal("language", start, { id: "japanese", name: "Japanese", color: "red", order: 0.2 }), icon: "messages-square" },
  ];
  data.goals = [creative, ...languages, ...data.goals.filter((g) => g.kind !== "creative")];
  data.goals.find((g) => g.kind === "fitness")!.measurement = { id: "bodyweight", label: "Body weight", unit: "kg", target: 72 };
  data.goals.find((g) => g.kind === "career")!.trackApplications = true;
  data.milestones = [
    ...data.goals.flatMap(milestonesForGoal),
    { id: "demo-weight", goalId: "fitness", roadmapId: null, title: "Reach 72 kg", auto: { metric: "measurement", target: 72 }, order: 9 },
  ];
  const tz = deviceTimezone();
  const logs: LogEntry[] = [];
  let n = 0;
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];

  const push = (goalId: string, typeId: string | null, date: string, time: string, minutes: number, metrics: Record<string, number> = {}, extra: Partial<LogEntry> = {}) => {
    logs.push({ id: `demo-${n++}`, goalId, typeId, date, time, tz, minutes, metrics, createdAt: n, updatedAt: n, ...extra });
  };

  const span = 265;
  const novel = "demo-project";
  let book = 0;
  let pagesInBook = 0;
  let bookLength = 240 + Math.floor(r() * 200);
  const pid = (i: number) => `demo-book-${i}`;
  data.projects.push({ id: novel, goalId: "creative", kind: "project", title: "The Long Way Home (demo)", target: 120_000, startedAt: addDays(today, -span) });
  data.projects.push({ id: pid(0), goalId: "reading", kind: "book", title: BOOKS[0], subtitle: "Sample title", target: bookLength, startedAt: addDays(today, -span) });

  for (let i = span; i >= 0; i--) {
    const d = addDays(today, -i);
    const wd = weekday(d);
    const ramp = 1 - i / (span * 2.2);
    const quiet = i > 120 && i < 132; // a two-week holiday
    const skip = quiet ? 0.82 : 0;

    if (r() < 0.9 * ramp - skip) push("spanish", pick(["flashcards", "study", "listening", "speaking", "reading"]), d, "07:40", pick([15, 20, 25, 30, 30, 45]), r() < 0.3 ? { reviews: 60 + Math.floor(r() * 90) } : {});
    if (r() < 0.82 * ramp - skip) push("japanese", pick(["flashcards", "flashcards", "listening", "study"]), d, "12:30", pick([15, 20, 20, 30]), r() < 0.5 ? { reviews: 50 + Math.floor(r() * 70) } : {});

    if (r() < 0.84 - skip) {
      const pages = 12 + Math.floor(r() * 28);
      push("reading", pick(["fiction", "fiction", "nonfiction"]), d, "22:15", pick([20, 25, 30, 30, 35, 45]), { pages }, { projectId: pid(book) });
      pagesInBook += pages;
      if (pagesInBook >= bookLength) {
        data.projects[data.projects.length - 1].finishedAt = d;
        book++;
        pagesInBook = 0;
        bookLength = 240 + Math.floor(r() * 200);
        if (i > 0) data.projects.push({ id: pid(book), goalId: "reading", kind: "book", title: BOOKS[book % BOOKS.length], subtitle: "Sample title", target: bookLength, startedAt: d });
      }
    }

    if ([1, 2, 4, 6].includes(wd) && r() < 0.86 - skip) {
      const minutes = pick([40, 45, 60, 60, 75, 90]);
      push("creative", pick(["drafting", "drafting", "drafting", "editing", "planning"]), d, "06:30", minutes, { words: Math.round(minutes * (9 + r() * 9)), ...(r() < 0.12 ? { chapters: 1 } : {}) }, { projectId: novel });
    }

    if ([1, 3, 5].includes(wd) && r() < 0.88 - skip) {
      const week = Math.floor((span - i) / 7);
      const exercises: ExerciseEntry[] = [...LIFTS]
        .sort(() => r() - 0.5)
        .slice(0, 3)
        .map(([exercise, base, gain, reps]) => ({ exercise, sets: 3, reps, kg: Math.round((base + gain * week + (r() < 0.2 ? -2.5 : 0)) / 2.5) * 2.5 }));
      push("fitness", "strength", d, "18:15", pick([50, 55, 60, 65, 70]), {}, { exercises });
    }

    if ([2, 4].includes(wd) && r() < 0.66 - skip) push("career", pick(["course", "project", "certification", "reading"]), d, "20:00", pick([30, 45, 45, 60]));

    if (wd === 0 && !quiet) data.measurements.push({ id: `demo-m-${i}`, goalId: "fitness", metricId: "bodyweight", date: d, value: Math.round((76.4 - ((span - i) / span) * 3.6 + (r() - 0.5) * 0.7) * 10) / 10 });
  }

  data.logs = logs;
  data.projects.push({ id: "demo-cert", goalId: "career", kind: "certification", title: "Cloud Solutions Certification (demo)", startedAt: addDays(today, -200), finishedAt: addDays(today, -74) });
  data.projects.push({ id: "demo-cert-2", goalId: "career", kind: "certification", title: "Applied ML Certification (demo)", startedAt: addDays(today, -60) });
  data.applications.push(
    { id: "demo-app-1", company: "Example Labs", role: "Solutions Architect", stage: "interview", appliedOn: addDays(today, -18) },
    { id: "demo-app-2", company: "Sample Data Co", role: "AI Engineer", stage: "applied", appliedOn: addDays(today, -6) },
  );
  data.pauses.push({ id: "demo-pause", goalId: null, from: addDays(today, -131), to: addDays(today, -121), note: "Holiday" });

  ROADMAP_TEMPLATES.filter((t) => ["big-project", "business", "financial"].includes(t.id)).forEach((t, i) => {
    const { roadmap, milestones } = roadmapFromTemplate(t, i);
    milestones.slice(0, i + 1).forEach((m, j) => (m.completedAt = addDays(startOfWeek(today, 1), -35 - j * 30)));
    data.roadmaps.push(roadmap);
    data.milestones.push(...milestones);
  });
  return data;
};
