/** A local calendar date, `YYYY-MM-DD`. Never a UTC instant. */
export type ISODate = string;

export type GoalKind = "creative" | "language" | "fitness" | "reading" | "career" | "custom";

export const COLOR_KEYS = ["violet", "green", "red", "amber", "blue", "teal", "rose", "lime"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** days: 0 = Sunday … 6 = Saturday. All seven days means a daily goal. */
export type Schedule =
  | { kind: "days"; days: number[] }
  | { kind: "weekly"; sessions: number };

/** A schedule and the date it took effect, so changing it never rewrites history. */
export interface ScheduleEpoch {
  from: ISODate;
  schedule: Schedule;
}

export interface MetricDef {
  id: string;
  label: string;
  unit: string;
  /** Sizes a session with no duration on heatmaps and for minimum lengths. Never added to hours. */
  minutesPer?: number;
}

export interface ActivityType {
  id: string;
  label: string;
  defaultMinutes?: number;
}

export interface MeasurementDef {
  id: string;
  label: string;
  unit: string;
  target?: number;
}

export interface Goal {
  id: string;
  name: string;
  kind: GoalKind;
  icon: string;
  color: ColorKey;
  order: number;
  archived: boolean;
  createdAt: ISODate;
  description?: string;
  /** The long-term roadmap this goal works towards, if any. */
  roadmapId?: string | null;
  schedules: ScheduleEpoch[];
  /** Optional weekly time target, in minutes. */
  weeklyMinutes?: number;
  /** Sessions shorter than this do not count towards the streak (0 = any session counts). */
  minMinutes: number;
  activityTypes: ActivityType[];
  metrics: MetricDef[];
  measurement?: MeasurementDef;
  proficiency?: { current: string; target: string };
  /** Shows the job application tracker on a career goal. */
  trackApplications?: boolean;
}

export interface ExerciseEntry {
  exercise: string;
  sets: number;
  reps: number;
  kg: number;
}

export interface LogEntry {
  id: string;
  goalId: string;
  typeId: string | null;
  date: ISODate;
  /** Local wall-clock time, `HH:mm`. */
  time: string | null;
  /** IANA zone the entry was logged in. The `date` is already local to it. */
  tz: string;
  minutes: number;
  metrics: Record<string, number>;
  note?: string;
  projectId?: string;
  exercises?: ExerciseEntry[];
  /** Set when an entry was imported. Imported entries are read-only and keep themselves up to date. */
  source?: "anki";
  createdAt: number;
  updatedAt: number;
}

export interface Measurement {
  id: string;
  goalId: string;
  metricId: string;
  date: ISODate;
  value: number;
  note?: string;
}

export type ProjectKind = "book" | "project" | "certification";

export interface Project {
  id: string;
  goalId: string;
  kind: ProjectKind;
  title: string;
  subtitle?: string;
  /** Total pages, or a target in the goal's main metric. */
  target?: number;
  /** Progress that existed before LifeOS. Shown on the project, never counted as activity. */
  baseline?: number;
  startedAt?: ISODate;
  finishedAt?: ISODate;
}

export interface Roadmap {
  id: string;
  title: string;
  description?: string;
  icon: string;
  color: ColorKey;
  order: number;
  archived?: boolean;
}

/** `hours`, `sessions`, or a metric id on the goal. */
export interface MilestoneAuto {
  metric: string;
  target: number;
}

export interface Milestone {
  id: string;
  goalId: string | null;
  roadmapId: string | null;
  title: string;
  note?: string;
  auto?: MilestoneAuto;
  dueDate?: ISODate;
  completedAt?: ISODate;
  order: number;
}

/** A planned break. Days inside it can never break a streak. `goalId: null` means every goal. */
export interface Pause {
  id: string;
  goalId: string | null;
  from: ISODate;
  to: ISODate;
  note?: string;
}

export const APPLICATION_STAGES = ["applied", "interview", "offer", "accepted", "closed"] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export interface JobApplication {
  id: string;
  company: string;
  role: string;
  stage: ApplicationStage;
  appliedOn: ISODate;
  note?: string;
}

export interface Timer {
  goalId: string;
  typeId: string | null;
  startedAt: number;
  /** Time banked before the current run. */
  bankedMs: number;
  pausedAt: number | null;
}

/** The link to Anki Analytics. Holds deck names and sync times, never card content. */
export interface AnkiLink {
  /** Deck id to goal id. Decks left out are not imported. */
  mapping: Record<string, string>;
  deckNames: Record<string, string>;
  connectedAt: string;
  /** When the data last imported was read from Anki. */
  importedThrough: string | null;
  /** Hour Anki starts a new day. Imported dates are Anki days. */
  dayStartHour: number;
}

export type ThemePref = "system" | "light" | "dark";
export type WeightUnit = "kg" | "lb";

export interface Settings {
  name: string;
  theme: ThemePref;
  weekStartsOn: 0 | 1;
  /** Labels weights. Values are stored as entered and never converted. */
  weightUnit: WeightUnit;
  /** `auto` follows the device. */
  timezone: string;
  onboarded: boolean;
  celebrations: boolean;
}

export interface AppData {
  version: 4;
  settings: Settings;
  goals: Goal[];
  logs: LogEntry[];
  measurements: Measurement[];
  projects: Project[];
  roadmaps: Roadmap[];
  milestones: Milestone[];
  pauses: Pause[];
  applications: JobApplication[];
  timer: Timer | null;
  anki: AnkiLink | null;
}
