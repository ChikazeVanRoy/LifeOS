import type { HevyFeed, HevyWorkout } from "../engine/hevy";

/**
 * Reads your workouts from Hevy's public API. Only the server calls this: the API key never
 * reaches the browser, and only the fields in `HevyFeed` leave it. Hevy's API needs Hevy Pro.
 */

const BASE = "https://api.hevyapp.com/v1";
/** Hevy's largest page. */
const PAGE_SIZE = 10;
/** A guard against a runaway loop, far beyond a real history. */
const MAX_PAGES = 400;

export class HevyError extends Error {}

export const readKey = (env: Record<string, string | undefined> = process.env) => {
  const key = env.HEVY_API_KEY?.trim();
  if (!key) throw new HevyError("Add HEVY_API_KEY to .env.local in the LifeOS folder, then restart LifeOS. Hevy Pro is needed to create a key.");
  return key;
};

interface RawSet {
  type?: string | null;
  weight_kg?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
}
interface RawWorkout {
  id?: string;
  title?: string | null;
  start_time?: string;
  end_time?: string;
  exercises?: { title?: string | null; sets?: RawSet[] }[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Hevy's workouts, trimmed to what LifeOS uses. Notes, routines and anything else are dropped. */
export const toFeed = (workouts: RawWorkout[], generatedAt: string): HevyFeed => {
  const out: HevyWorkout[] = [];
  for (const w of workouts) {
    if (!w.id || !w.start_time || Number.isNaN(Date.parse(w.start_time))) continue;
    const end = w.end_time && !Number.isNaN(Date.parse(w.end_time)) ? w.end_time : w.start_time;
    out.push({
      id: w.id,
      title: w.title ?? "",
      start: w.start_time,
      end,
      exercises: (w.exercises ?? []).map((e) => ({
        title: e.title ?? "",
        sets: (e.sets ?? []).map((s) => ({ type: s.type ?? "normal", kg: num(s.weight_kg), reps: num(s.reps), seconds: num(s.duration_seconds), meters: num(s.distance_meters) })),
      })),
    });
  }
  return { generatedAt, workouts: out };
};

interface Page {
  page_count?: number;
  workouts?: RawWorkout[];
}

const getPage = async (key: string, page: number): Promise<Page> => {
  const res = await fetch(`${BASE}/workouts?page=${page}&pageSize=${PAGE_SIZE}`, {
    headers: { "api-key": key, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new HevyError("Hevy did not accept the API key. Check HEVY_API_KEY in .env.local. Creating a key needs Hevy Pro.");
  if (res.status === 429) throw new HevyError("Hevy asked LifeOS to slow down. It will try again shortly.");
  if (!res.ok) throw new HevyError("Hevy did not answer as expected.");
  return (await res.json()) as Page;
};

let cached: { at: number; key: string; feed: HevyFeed } | null = null;

/** Every workout, a page at a time. The answer is reused for a minute so several windows do not each ask Hevy. */
export const fetchHevy = async (key: string): Promise<HevyFeed> => {
  if (cached && cached.key === key && Date.now() - cached.at < 60_000) return cached.feed;
  const first = await getPage(key, 1);
  const count = Math.min(Math.max(first.page_count ?? 1, 1), MAX_PAGES);
  const raw = [...(first.workouts ?? [])];
  for (let from = 2; from <= count; from += 5) {
    const batch = await Promise.all(Array.from({ length: Math.min(5, count - from + 1) }, (_, i) => getPage(key, from + i)));
    for (const page of batch) raw.push(...(page.workouts ?? []));
  }
  const feed = toFeed(raw, new Date().toISOString());
  cached = { at: Date.now(), key, feed };
  return feed;
};
