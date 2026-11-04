import { localParts } from "./engine/dates";
import type { LogEntry } from "./types";
import { uid } from "./utils";

export type NewLog = Pick<LogEntry, "goalId" | "typeId" | "minutes" | "metrics"> &
  Partial<Pick<LogEntry, "date" | "time" | "note" | "projectId" | "exercises">>;

/** A backdated entry has no known time unless one is given. */
export const createLog = (input: NewLog, tz: string, instant: Date = new Date()): LogEntry => {
  const now = localParts(tz, instant);
  const date = input.date ?? now.date;
  const stamp = instant.getTime();
  return {
    ...input,
    id: uid(),
    date,
    time: input.time ?? (date === now.date ? now.time : null),
    tz,
    createdAt: stamp,
    updatedAt: stamp,
  };
};
