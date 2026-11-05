import type { ActivityType, AppData, ColorKey, Goal, GoalKind, ISODate, MetricDef, Milestone, Roadmap, Settings, WeightUnit } from "./types";
import { COLOR_KEYS } from "./types";
import { uid } from "./utils";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export type CreativeFocus = "general" | "writing" | "music" | "art";

const WORDS: MetricDef = { id: "words", label: "Words", unit: "words", minutesPer: 0.05 };
const finished = (label: string): MetricDef => ({ id: "pieces", label, unit: label.toLowerCase() });

export const CREATIVE_FOCUSES: Record<CreativeFocus, { label: string; name: string; icon: string; types: string[]; metrics: MetricDef[] }> = {
  general: { label: "A bit of everything", name: "Creativity", icon: "palette", types: ["Making", "Practice", "Planning", "Research"], metrics: [finished("Pieces")] },
  writing: {
    label: "Writing",
    name: "Writing",
    icon: "feather",
    types: ["Drafting", "Editing", "Planning", "Research"],
    metrics: [WORDS, { id: "chapters", label: "Chapters", unit: "chapters" }],
  },
  music: { label: "Music", name: "Music", icon: "music", types: ["Practice", "Composing", "Recording", "Mixing"], metrics: [finished("Tracks")] },
  art: { label: "Visual art", name: "Art", icon: "palette", types: ["Drawing", "Painting", "Sketching", "Digital"], metrics: [finished("Pieces")] },
};

const toTypes = (labels: string[], defaultMinutes: number): ActivityType[] =>
  labels.map((label) => ({ id: label.toLowerCase().replace(/\s+/g, "-"), label, defaultMinutes }));

export const creativeFocusPatch = (focus: CreativeFocus): Pick<Goal, "name" | "icon" | "activityTypes" | "metrics"> => {
  const f = CREATIVE_FOCUSES[focus];
  return { name: f.name, icon: f.icon, activityTypes: toTypes(f.types, 45), metrics: f.metrics };
};

/** The first goal colour nothing is using, so charts stay readable as goals are added. */
export const nextColor = (goals: Pick<Goal, "color" | "archived">[]): ColorKey => {
  const used = new Set(goals.filter((g) => !g.archived).map((g) => g.color));
  return COLOR_KEYS.find((c) => !used.has(c)) ?? COLOR_KEYS[goals.length % COLOR_KEYS.length];
};

interface GoalOptions {
  id?: string;
  name?: string;
  color?: ColorKey;
  order?: number;
  focus?: CreativeFocus;
  weightUnit?: WeightUnit;
}

const TEMPLATES: Record<GoalKind, (o: GoalOptions) => Partial<Goal>> = {
  creative: ({ focus = "general" }) => ({
    ...creativeFocusPatch(focus),
    color: "violet",
    description: "Make things, and keep making them.",
    schedules: [{ from: "", schedule: { kind: "weekly", sessions: 3 } }],
  }),
  language: () => ({
    name: "",
    icon: "languages",
    color: "green",
    schedules: [{ from: "", schedule: { kind: "days", days: EVERY_DAY } }],
    activityTypes: toTypes(["Study", "Flashcards", "Listening", "Reading", "Speaking"], 20),
    metrics: [{ id: "reviews", label: "Reviews", unit: "reviews", minutesPer: 0.15 }],
    proficiency: { current: "", target: "" },
  }),
  fitness: ({ weightUnit = "kg" }) => ({
    name: "Fitness",
    icon: "dumbbell",
    color: "amber",
    description: "Move, get stronger, keep it consistent.",
    schedules: [{ from: "", schedule: { kind: "weekly", sessions: 3 } }],
    activityTypes: [
      { id: "strength", label: "Strength", defaultMinutes: 60 },
      { id: "cardio", label: "Cardio", defaultMinutes: 30 },
      { id: "mobility", label: "Mobility", defaultMinutes: 20 },
    ],
    measurement: { id: "bodyweight", label: "Body weight", unit: weightUnit },
  }),
  reading: () => ({
    name: "Reading",
    icon: "book-open",
    color: "blue",
    description: "A little every day adds up.",
    schedules: [{ from: "", schedule: { kind: "days", days: EVERY_DAY } }],
    activityTypes: toTypes(["Fiction", "Nonfiction"], 30),
    metrics: [{ id: "pages", label: "Pages", unit: "pages", minutesPer: 1.5 }],
  }),
  career: () => ({
    name: "Learning",
    icon: "compass",
    color: "teal",
    description: "Skills, courses and professional growth.",
    schedules: [{ from: "", schedule: { kind: "weekly", sessions: 2 } }],
    activityTypes: toTypes(["Course", "Project", "Certification", "Reading"], 45),
  }),
  custom: () => ({
    name: "",
    icon: "target",
    color: "rose",
    schedules: [{ from: "", schedule: { kind: "weekly", sessions: 3 } }],
    activityTypes: [{ id: "session", label: "Session", defaultMinutes: 30 }],
  }),
};

export const createGoal = (kind: GoalKind, today: ISODate, options: GoalOptions = {}): Goal => {
  const t = TEMPLATES[kind](options);
  return {
    activityTypes: [],
    metrics: [],
    minMinutes: 0,
    archived: false,
    ...t,
    id: options.id ?? uid(),
    kind,
    name: options.name ?? t.name ?? "",
    icon: t.icon ?? "target",
    color: options.color ?? t.color ?? "rose",
    order: options.order ?? 0,
    createdAt: today,
    schedules: (t.schedules ?? []).map((e) => ({ ...e, from: today })),
  };
};

/** Starting goals. Languages are added by name, so a person can have none or several. */
export const createDefaultGoals = (today: ISODate, weightUnit: WeightUnit = "kg"): Goal[] => [
  createGoal("creative", today, { id: "creative", order: 0 }),
  createGoal("fitness", today, { id: "fitness", order: 1, weightUnit }),
  createGoal("reading", today, { id: "reading", order: 2 }),
  createGoal("career", today, { id: "career", order: 3 }),
];

type Seed = Pick<Milestone, "title" | "auto">;
export const WORDS_MILESTONE: Seed = { title: "First 10,000 words", auto: { metric: "words", target: 10_000 } };
const seed = (goalId: string | null, roadmapId: string | null, items: Seed[]): Milestone[] =>
  items.map((m, order) => ({ ...m, id: uid(), goalId, roadmapId, order }));

/** Suggested milestones. Each is measured from activity, and all can be removed. */
export const milestonesForGoal = (goal: Goal): Milestone[] => {
  const hours = (n: number, what: string): Seed => ({ title: `${n} hours of ${what}`, auto: { metric: "hours", target: n } });
  const output = goal.metrics[0];
  switch (goal.kind) {
    case "creative":
      return seed(goal.id, null, [
        ...(output?.id === "words" ? [WORDS_MILESTONE] : []),
        { title: "100 creative hours", auto: { metric: "hours", target: 100 } },
        { title: "Finish a first project", auto: { metric: "projects", target: 1 } },
      ]);
    case "language":
      return seed(goal.id, null, [hours(100, goal.name), { title: "Hold a ten-minute conversation" }]);
    case "fitness":
      return seed(goal.id, null, [{ title: "36 workouts", auto: { metric: "sessions", target: 36 } }]);
    case "reading":
      return seed(goal.id, null, [
        { title: "10 books finished", auto: { metric: "projects", target: 10 } },
        { title: "100 reading hours", auto: { metric: "hours", target: 100 } },
      ]);
    case "career":
      return seed(goal.id, null, [hours(50, "learning"), { title: "Finish a course or certification", auto: { metric: "projects", target: 1 } }]);
    default:
      return [];
  }
};

export interface RoadmapTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: ColorKey;
  steps: string[];
}

/** Suggestions only. A new account has no roadmaps until someone picks or writes one. */
export const ROADMAP_TEMPLATES: RoadmapTemplate[] = [
  { id: "big-project", title: "Finish a major creative work", description: "A book, an album, a body of work.", icon: "feather", color: "violet", steps: ["Decide what it is", "Finish a rough first version", "Refine it until it is ready", "Share it with the world"] },
  { id: "business", title: "Start a business", description: "Turn an idea into something of your own.", icon: "sparkles", color: "teal", steps: ["Talk to ten potential customers", "Build a first version", "Win a first paying customer", "Earn a steady income from it"] },
  { id: "financial", title: "Reach financial independence", description: "Buy back your time.", icon: "landmark", color: "amber", steps: ["Work out my target number", "Build an emergency fund", "Automate saving and investing", "Reach my target"] },
  { id: "career-change", title: "Change career", description: "Move towards work that fits.", icon: "compass", color: "blue", steps: ["Choose a direction", "Build the skills I am missing", "Make a first move into the field", "Land the role"] },
  { id: "family", title: "Build a family", description: "The steps here are yours to define.", icon: "heart", color: "rose", steps: ["Write down what family means to me", "Prepare home and finances"] },
  { id: "home", title: "Find a place to call home", description: "Somewhere that is truly yours.", icon: "sunrise", color: "lime", steps: ["Decide where and what", "Save what I need", "Find the right place", "Move in"] },
  { id: "adventure", title: "A once-in-a-lifetime challenge", description: "A marathon, a summit, a long journey.", icon: "mountain", color: "red", steps: ["Choose the challenge", "Set a date", "Train and prepare", "Do it"] },
];

export const roadmapFromTemplate = (t: Pick<RoadmapTemplate, "title" | "description" | "icon" | "color" | "steps">, order: number) => {
  const id = uid();
  const roadmap: Roadmap = { id, title: t.title, description: t.description, icon: t.icon, color: t.color, order };
  return { roadmap, milestones: seed(null, id, t.steps.map((title) => ({ title }))) };
};

export const defaultSettings: Settings = {
  name: "",
  theme: "system",
  weekStartsOn: 1,
  weightUnit: "kg",
  timezone: "auto",
  onboarded: false,
  celebrations: true,
};

/** Sensible regional defaults from the browser's locale. Both can be changed in Settings. */
export const localeDefaults = (locale: string): Pick<Settings, "weekStartsOn" | "weightUnit"> => {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const firstDay = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay ?? 1;
    const region = loc.maximize().region ?? "";
    return { weekStartsOn: firstDay === 1 ? 1 : 0, weightUnit: ["US", "LR", "MM"].includes(region) ? "lb" : "kg" };
  } catch {
    return { weekStartsOn: 1, weightUnit: "kg" };
  }
};

/** Fresh data: configured goals, zero activity. */
export const createEmptyData = (today: ISODate, overrides: Partial<Settings> = {}): AppData => {
  const settings = { ...defaultSettings, ...overrides };
  const goals = createDefaultGoals(today, settings.weightUnit);
  return {
    version: 4,
    settings,
    goals,
    logs: [],
    measurements: [],
    projects: [],
    roadmaps: [],
    milestones: goals.flatMap(milestonesForGoal),
    pauses: [],
    applications: [],
    timer: null,
    anki: null,
  };
};
