import type { Goal, GoalKind, ISODate } from "../types";
import { addDays, weekday } from "./dates";

export interface ParsedLog {
  goalId: string | null;
  typeId: string | null;
  minutes: number;
  metrics: Record<string, number>;
  date: ISODate | null;
  /** Fields the parser recognised, so the UI can show what it understood. */
  matched: string[];
}

/** Checked in this order when a sentence does not name a goal. */
const KIND_WORDS: Partial<Record<GoalKind, RegExp>> = {
  language: /\b(anki|flash\s?cards?|vocab(ulary)?|grammar|duolingo|immersion|language)\b/,
  creative: /\b(wrote|write|writing|written|drafted|drafting|novel|chapters?|words?|drew|draw(ing)?|paint(ed|ing)?|sketch(ed|ing)?|compos(ed|ing)|record(ed|ing)|music|guitar|piano|creative)\b/,
  fitness: /\b(work(ed)?\s?out|workouts?|gym|lift(ed|ing)?|strength|training|trained|squats?|bench|deadlifts?|ran|run|running|cardio|yoga|swam|swim(ming)?|cycl(ed|ing))\b/,
  reading: /\b(read|reading|pages?|books?)\b/,
  career: /\b(course|certification|certs?|interview|career|learned|learning|lecture|class)\b/,
};

/** Other names people use for a language. */
const NAME_ALIASES: Record<string, RegExp> = {
  portuguese: /\b(portuguese|português|portugues|pt-?br|brazilian)\b/,
  mandarin: /\b(mandarin|chinese|hanzi|pinyin)\b/,
  spanish: /\b(spanish|español|espanol)\b/,
  french: /\b(french|français|francais)\b/,
  german: /\b(german|deutsch)\b/,
  japanese: /\b(japanese|nihongo)\b/,
};

const TYPE_ALIASES: Record<string, RegExp> = {
  flashcards: /\b(anki|flash\s?cards?|reviews?|srs)\b/,
  anki: /\b(anki|flash\s?cards?|reviews?|srs)\b/,
  listening: /\b(listen(ed|ing)?|podcasts?|audio|immersion)\b/,
  reading: /\b(read|reading)\b/,
  speaking: /\b(spoke|speak(ing)?|conversation|tutor|lesson|italki|talk(ed|ing)?)\b/,
  drafting: /\b(wrote|write|writing|draft(ed|ing)?)\b/,
  drawing: /\b(drew|draw(ing)?)\b/,
  painting: /\bpaint(ed|ing)?\b/,
  composing: /\bcompos(ed|ing)\b/,
  recording: /\brecord(ed|ing)\b/,
  editing: /\b(edit(ed|ing)?|revis(ed|ing|ion))\b/,
  planning: /\b(plan(ned|ning)?|outlin(ed|ing)|plot(ted|ting)?)\b/,
  cardio: /\b(ran|run|running|cardio|cycling|swam|swim)\b/,
  strength: /\b(lift(ed|ing)?|strength|gym|work(ed)?\s?out|workouts?)\b/,
  course: /\b(course|class|lecture)\b/,
  making: /\b(made|making|built|building)\b/,
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const parseMinutes = (s: string): number => {
  if (/\b(half an? hour|half hour)\b/.test(s)) return 30;
  let total = 0;
  const compact = s.match(/\b(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*(?:m(?:in(?:ute)?s?)?)?\b/);
  if (compact) return Number(compact[1]) * 60 + Number(compact[2]);
  const hours = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (hours) total += Math.round(Number(hours[1]) * 60);
  else if (/\b(an|one) hour\b/.test(s)) total += 60;
  const mins = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (mins) total += Number(mins[1]);
  return total;
};

const num = (s: string) => Number(s.replace(/,/g, ""));

/** Reads a sentence such as "Wrote 45 minutes and 650 words". Runs locally. */
export const parseLogText = (input: string, goals: Goal[], today: ISODate): ParsedLog => {
  const s = input.toLowerCase().trim();
  const out: ParsedLog = { goalId: null, typeId: null, minutes: 0, metrics: {}, date: null, matched: [] };
  if (!s) return out;

  const active = goals.filter((g) => !g.archived);
  const byName = active.find(
    (g) =>
      new RegExp(`\\b${g.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s) ||
      NAME_ALIASES[g.name.toLowerCase()]?.test(s),
  );
  // A language name wins over a verb: "read Portuguese for 20 min" is Portuguese.
  const language = active.find((g) => g.kind === "language" && byName?.id === g.id);
  const goal =
    language ??
    byName ??
    (Object.keys(KIND_WORDS) as GoalKind[])
      .map((k) => (KIND_WORDS[k]?.test(s) ? active.find((g) => g.kind === k) : undefined))
      .find(Boolean);

  if (goal) {
    out.goalId = goal.id;
    out.matched.push("goal");
    const type =
      goal.activityTypes.find((t) => new RegExp(`\\b${t.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s)) ??
      goal.activityTypes.find((t) => TYPE_ALIASES[t.label.toLowerCase()]?.test(s));
    if (type) {
      out.typeId = type.id;
      out.matched.push("type");
    }
    for (const m of goal.metrics) {
      const names = [m.id, m.unit, m.label].map((n) => n.toLowerCase().replace(/s$/, ""));
      const extra = m.id === "reviews" ? ["card"] : m.id === "pages" ? ["pp", "p"] : [];
      for (const name of [...new Set([...names, ...extra])]) {
        const hit = s.match(new RegExp(`(\\d[\\d,]*)\\s*${name}s?\\b`));
        if (hit) {
          out.metrics[m.id] = num(hit[1]);
          out.matched.push(m.id);
          break;
        }
      }
    }
  }

  out.minutes = parseMinutes(s);
  if (out.minutes) out.matched.push("minutes");

  if (/\b(yesterday|last night)\b/.test(s)) {
    out.date = addDays(today, -1);
  } else {
    const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b(on |last )${d}\\b`).test(s));
    if (wd >= 0) {
      const back = (weekday(today) - wd + 7) % 7 || 7;
      out.date = addDays(today, -back);
    }
  }
  if (out.date) out.matched.push("date");
  return out;
};
