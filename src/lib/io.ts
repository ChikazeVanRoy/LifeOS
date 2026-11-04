import { z } from "zod";
import { isValidDate } from "./engine/dates";
import { defaultSettings } from "./defaults";
import { migrate } from "./migrate";
import { APPLICATION_STAGES, COLOR_KEYS, type AppData } from "./types";

const date = z.string().refine(isValidDate, "must be a YYYY-MM-DD date");
const color = z.enum(COLOR_KEYS);
const nonNeg = z.number().finite().min(0);

const schedule = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("days"), days: z.array(z.number().int().min(0).max(6)) }),
  z.object({ kind: z.literal("weekly"), sessions: z.number().int().min(1).max(50) }),
]);

const goal = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["creative", "language", "fitness", "reading", "career", "custom"]),
  icon: z.string(),
  color,
  order: z.number(),
  archived: z.boolean(),
  createdAt: date,
  description: z.string().optional(),
  schedules: z.array(z.object({ from: date, schedule })).min(1),
  weeklyMinutes: nonNeg.optional(),
  minMinutes: nonNeg,
  activityTypes: z.array(z.object({ id: z.string(), label: z.string(), defaultMinutes: nonNeg.optional() })),
  metrics: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      unit: z.string(),
      xp: z.object({ per: z.number().positive(), cap: nonNeg }).optional(),
      minutesPer: nonNeg.optional(),
    }),
  ),
  measurement: z.object({ id: z.string(), label: z.string(), unit: z.string(), target: z.number().optional() }).optional(),
  proficiency: z.object({ current: z.string(), target: z.string() }).optional(),
  trackApplications: z.boolean().optional(),
});

const log = z.object({
  id: z.string().min(1),
  goalId: z.string().min(1),
  typeId: z.string().nullable().optional().transform((t) => t ?? null),
  date,
  time: z.string().nullable().optional().transform((t) => t ?? null),
  tz: z.string(),
  minutes: nonNeg,
  metrics: z.record(z.string(), nonNeg),
  note: z.string().optional(),
  projectId: z.string().optional(),
  exercises: z.array(z.object({ exercise: z.string(), sets: nonNeg, reps: nonNeg, kg: nonNeg })).optional(),
  source: z.literal("anki").optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const appData = z.object({
  version: z.literal(3),
  settings: z
    .object({
      name: z.string(),
      theme: z.enum(["system", "light", "dark"]),
      weekStartsOn: z.union([z.literal(0), z.literal(1)]),
      weightUnit: z.enum(["kg", "lb"]),
      timezone: z.string(),
      onboarded: z.boolean(),
      celebrations: z.boolean(),
      dailyXpCap: z.number().int().min(10),
    })
    .partial()
    .transform((s) => ({ ...defaultSettings, ...s, onboarded: true })),
  goals: z.array(goal),
  logs: z.array(log),
  measurements: z.array(z.object({ id: z.string(), goalId: z.string(), metricId: z.string(), date, value: z.number(), note: z.string().optional() })),
  projects: z.array(
    z.object({
      id: z.string(),
      goalId: z.string(),
      kind: z.enum(["book", "project", "certification"]),
      title: z.string(),
      subtitle: z.string().optional(),
      target: nonNeg.optional(),
      baseline: nonNeg.optional(),
      startedAt: date.optional(),
      finishedAt: date.optional(),
    }),
  ),
  roadmaps: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      icon: z.string(),
      color,
      order: z.number(),
      archived: z.boolean().optional(),
    }),
  ),
  milestones: z.array(
    z.object({
      id: z.string(),
      goalId: z.string().nullable(),
      roadmapId: z.string().nullable(),
      title: z.string(),
      note: z.string().optional(),
      auto: z.object({ metric: z.string(), target: z.number().positive() }).optional(),
      dueDate: date.optional(),
      completedAt: date.optional(),
      order: z.number(),
    }),
  ),
  pauses: z.array(z.object({ id: z.string(), goalId: z.string().nullable(), from: date, to: date, note: z.string().optional() })),
  applications: z.array(
    z.object({
      id: z.string(),
      company: z.string(),
      role: z.string(),
      stage: z.enum(APPLICATION_STAGES),
      appliedOn: date,
      note: z.string().optional(),
    }),
  ),
  timer: z.null().optional().transform(() => null),
  anki: z
    .object({
      mapping: z.record(z.string(), z.string()),
      deckNames: z.record(z.string(), z.string()),
      connectedAt: z.string(),
      importedThrough: z.string().nullable(),
      dayStartHour: z.number().int().min(0).max(23),
    })
    .nullable(),
});

export interface ExportFile {
  app: "lifeos";
  exportedAt: string;
  data: AppData;
}

export const toExport = (data: AppData): string =>
  JSON.stringify({ app: "lifeos", exportedAt: new Date().toISOString(), data: { ...data, timer: null } } satisfies ExportFile, null, 2);

export type ImportResult = { ok: true; data: AppData } | { ok: false; error: string };

export const parseImport = (text: string): ImportResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  const body = raw && typeof raw === "object" && "data" in raw ? (raw as { data: unknown }).data : raw;
  const parsed = appData.safeParse(migrate(body));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `That is not a LifeOS backup (${issue.path.join(".") || "file"}: ${issue.message}).` };
  }
  const goalIds = new Set(parsed.data.goals.map((g) => g.id));
  const orphan = parsed.data.logs.find((l) => !goalIds.has(l.goalId));
  if (orphan) return { ok: false, error: `The backup has an activity for a goal that does not exist (${orphan.goalId}).` };
  return { ok: true, data: parsed.data as AppData };
};
