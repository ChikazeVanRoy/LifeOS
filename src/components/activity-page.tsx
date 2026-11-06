"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ActivityRow } from "@/components/activity-row";
import { chipClass } from "@/components/log/log-sheet";
import { useDerived } from "@/components/shell/providers";
import { Heatmap, OVERALL_BANDS } from "@/components/viz/heatmap";
import { Empty, PageHeader } from "@/components/viz/primitives";
import { addDays, addMonths, endOfMonth, fmtMonthLong, fmtRelative, startOfMonth, startOfWeek } from "@/lib/engine/dates";
import { cn, fmtHours, fmtNum, plural } from "@/lib/utils";

const PAGE = 10;

function MonthCalendar({ month, setMonth, selected, onSelect, goalId }: { month: string; setMonth: (m: string) => void; selected: string | null; onSelect: (d: string) => void; goalId: string | null }) {
  const d = useDerived();
  const start = startOfWeek(month, d.weekStartsOn);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = endOfMonth(month) <= cells[34] ? cells.slice(0, 35) : cells;
  const names = d.weekStartsOn === 1 ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  const byDay = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of d.logs) {
      if (goalId && l.goalId !== goalId) continue;
      (m.get(l.date) ?? m.set(l.date, new Set()).get(l.date)!).add(l.goalId);
    }
    return m;
  }, [d.logs, goalId]);

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[19px] font-medium">{fmtMonthLong(month)}</h2>
        <div className="flex gap-1">
          <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="grid size-8 place-items-center rounded-lg bg-secondary"><ChevronLeft size={16} /></button>
          <button aria-label="Next month" disabled={startOfMonth(d.today) <= month} onClick={() => setMonth(addMonths(month, 1))} className="grid size-8 place-items-center rounded-lg bg-secondary disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {names.map((n, i) => <span key={i} className="pb-1 text-[11px] text-muted-foreground">{n}</span>)}
        {rows.map((date) => {
          const inMonth = date.slice(0, 7) === month.slice(0, 7);
          const goals = [...(byDay.get(date) ?? [])];
          const future = date > d.today;
          return (
            <button
              key={date}
              disabled={future}
              onClick={() => onSelect(date)}
              aria-label={`${date}, ${goals.length} goals`}
              aria-pressed={selected === date}
              className={cn(
                "flex aspect-square max-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-[13px] transition-colors",
                !inMonth && "opacity-30",
                future ? "text-faint" : "hover:bg-secondary",
                selected === date && "bg-foreground text-background hover:bg-foreground",
                date === d.today && selected !== date && "font-semibold ring-1 ring-foreground/30",
              )}
            >
              <span className="num leading-none">{Number(date.slice(8))}</span>
              <span className="flex h-1.5 gap-0.5">
                {goals.slice(0, 4).map((g) => <span key={g} className="size-1.5 rounded-full" style={{ background: `var(--c-${d.byId.get(g)?.goal.color ?? "violet"})` }} />)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ActivityPage() {
  const d = useDerived();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [month, setMonth] = useState(startOfMonth(d.today));
  const [limit, setLimit] = useState(PAGE);
  const view = goalId ? d.byId.get(goalId) : null;
  const firstYear = Number((d.totals.firstDate ?? d.today).slice(0, 4));
  const thisYear = Number(d.today.slice(0, 4));
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i);
  const [year, setYear] = useState<number | null>(null);

  const logs = useMemo(
    () =>
      [...d.logs]
        .reverse()
        .filter((l) => (!goalId || l.goalId === goalId) && (!selected || l.date === selected)),
    [d.logs, goalId, selected],
  );

  const groups = useMemo(() => {
    const out: { date: string; items: typeof logs }[] = [];
    for (const l of logs.slice(0, limit)) {
      const last = out.at(-1);
      if (last?.date === l.date) last.items.push(l);
      else out.push({ date: l.date, items: [l] });
    }
    return out;
  }, [logs, limit]);

  const totals = view?.totals ?? d.totals;

  const select = (date: string) => {
    setSelected((s) => (s === date ? null : date));
    setMonth(startOfMonth(date));
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Activity" subtitle={`${plural(totals.sessions, "session")} · ${fmtHours(totals.minutes)} · ${plural(totals.activeDays, "active day")}`} />

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <button aria-pressed={!goalId} onClick={() => setGoalId(null)} className={chipClass(!goalId)}>All goals</button>
        {d.allGoals.map((g) => (
          <button key={g.goal.id} aria-pressed={goalId === g.goal.id} onClick={() => setGoalId(g.goal.id)} className={cn(chipClass(goalId === g.goal.id), "inline-flex items-center gap-1.5")}>
            <span className="size-2 rounded-full" style={{ background: `var(--c-${g.goal.color})` }} /> {g.goal.name}
          </button>
        ))}
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[19px] font-medium">{view ? view.goal.name : "Overall"} calendar</h2>
          {years.length > 1 && (
            <div className="flex gap-1">
              <button aria-pressed={year === null} onClick={() => setYear(null)} className={cn("h-7 rounded-lg px-2 text-xs", year === null ? "bg-secondary font-medium" : "text-muted-foreground")}>Past year</button>
              {years.map((y) => <button key={y} aria-pressed={year === y} onClick={() => setYear(y)} className={cn("num h-7 rounded-lg px-2 text-xs", year === y ? "bg-secondary font-medium" : "text-muted-foreground")}>{y}</button>)}
            </div>
          )}
        </div>
        <Heatmap values={view?.effortByDay ?? d.effortByDay} today={d.today} weekStartsOn={d.weekStartsOn} color={view ? `var(--c-${view.goal.color})` : "var(--c-violet)"} year={year ?? undefined} onSelect={select} selected={selected} bands={view ? undefined : OVERALL_BANDS} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <MonthCalendar month={month} setMonth={setMonth} selected={selected} onSelect={select} goalId={goalId} />
        {/* On wide screens the card is as tall as the calendar and scrolls inside, so a long history never stretches the page. */}
        <section className="card relative p-3 md:p-4">
          <div className="flex flex-col md:absolute md:inset-4 md:min-h-0">
          <div className="flex items-center justify-between px-2 pt-1 pb-1">
            <h2 className="font-display text-[19px] font-medium">History</h2>
            {selected && <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">{fmtRelative(selected, d.today)} <X size={12} /></button>}
          </div>
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {groups.length === 0 ? (
            <Empty icon="calendar" title={selected ? "Nothing logged that day" : "No activity yet"}>{selected ? "Backdate an entry from the log sheet if you missed it." : "Your history will build here."}</Empty>
          ) : (
            groups.map((g) => {
              const minutes = g.items.reduce((s, l) => s + l.minutes, 0);
              return (
                <div key={g.date} className="mt-2 first:mt-1">
                  <p className="flex justify-between px-2 pb-0.5 text-xs text-muted-foreground"><span>{fmtRelative(g.date, d.today)}</span><span className="num">{minutes ? fmtHours(minutes) : ""}</span></p>
                  {g.items.map((l) => <ActivityRow key={l.id} log={l} d={d} />)}
                </div>
              );
            })
          )}
          {logs.length > limit && (
            <button onClick={() => setLimit((n) => n + PAGE)} className="mt-2 h-10 w-full rounded-xl text-sm text-muted-foreground hover:bg-secondary">Show more ({fmtNum(logs.length - limit)} older)</button>
          )}
          </div>
          </div>
        </section>
      </div>
    </div>
  );
}
