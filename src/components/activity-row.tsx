"use client";

import { fmtRelative, fmtTime } from "@/lib/engine/dates";
import type { Derived } from "@/lib/engine/derive";
import type { LogEntry } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { fmtDuration, fmtNum } from "@/lib/utils";
import { GoalBadge } from "./viz/primitives";

export const describeLog = (log: LogEntry, d: Derived) => {
  const g = d.byId.get(log.goalId)?.goal;
  const type = g?.activityTypes.find((t) => t.id === log.typeId)?.label;
  const parts: string[] = [];
  if (log.minutes) parts.push(fmtDuration(log.minutes));
  for (const m of g?.metrics ?? []) {
    const v = log.metrics[m.id];
    if (v) parts.push(`${fmtNum(v)} ${m.unit}`);
  }
  if (log.exercises?.length) parts.push(`${log.exercises.length} ${log.exercises.length === 1 ? "exercise" : "exercises"}`);
  const project = d.byId.get(log.goalId)?.projects.find((p) => p.id === log.projectId);
  if (project) parts.push(project.title);
  return { goal: g, title: type ? `${g?.name} · ${type}` : g?.name ?? "Unknown goal", meta: parts.join(" · ") };
};

export function ActivityRow({ log, d, showDate }: { log: LogEntry; d: Derived; showDate?: boolean }) {
  const openLog = useUI((s) => s.openLog);
  const { goal, title, meta } = describeLog(log, d);
  const imported = log.source === "anki";
  const body = (
    <>
      {goal && <GoalBadge icon={goal.icon} color={goal.color} size={38} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{title}</span>
          {imported && <span className="shrink-0 rounded-md bg-secondary px-1.5 text-[10.5px] leading-[18px] font-normal text-muted-foreground">Anki</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{meta || "Session"}{log.note ? ` · ${log.note}` : ""}</span>
      </span>
      {showDate ? (
        <span className="num text-xs text-muted-foreground">{fmtRelative(log.date, d.today)}</span>
      ) : (
        log.time && <span className="num hidden text-xs text-muted-foreground sm:block">{fmtTime(log.time)}</span>
      )}
    </>
  );
  // Imported entries follow Anki, so they are managed from Settings.
  if (imported) return <div className="flex w-full items-center gap-3 rounded-2xl p-2">{body}</div>;
  return (
    <button onClick={() => openLog({ editing: log })} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-secondary/60">
      {body}
    </button>
  );
}
