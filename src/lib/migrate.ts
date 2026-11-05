import { defaultSettings } from "./defaults";

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null;
const list = (v: unknown) => (Array.isArray(v) ? v.filter(isObject) : []);

const toV2 = (input: Raw): Raw => ({
  ...input,
  version: 2,
  settings: { ...defaultSettings, ...(isObject(input.settings) ? input.settings : {}) },
  goals: list(input.goals).map((g) => ({
    ...g,
    kind: g.kind === "writing" ? "creative" : g.kind,
    // The tracker was always on before it became optional.
    ...(g.kind === "career" ? { trackApplications: true } : {}),
  })),
  projects: list(input.projects).map((p) => ({ ...p, kind: p.kind === "manuscript" ? "project" : p.kind })),
});

const toV3 = (input: Raw): Raw => ({ ...input, version: 3, anki: null });

/** XP and levels are gone, along with the settings that tuned them. */
const toV4 = (input: Raw): Raw => {
  const settings = { ...(isObject(input.settings) ? input.settings : {}) };
  delete settings.dailyXpCap;
  return {
    ...input,
    version: 4,
    settings,
    goals: list(input.goals).map((g) => ({
      ...g,
      metrics: list(g.metrics).map((metric) => {
        const kept = { ...metric };
        delete kept.xp;
        return kept;
      }),
    })),
  };
};

/**
 * Upgrades saved data and older backups. Only the structure changes: names, goals,
 * roadmaps and history stay exactly as the person left them.
 */
export const migrate = (input: unknown): unknown => {
  if (!isObject(input) || typeof input.version !== "number" || input.version >= 4) return input;
  const v2 = input.version < 2 ? toV2(input) : input;
  return toV4(input.version < 3 ? toV3(v2) : v2);
};
