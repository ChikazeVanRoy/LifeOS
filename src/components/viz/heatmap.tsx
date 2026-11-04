"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, fmtLong, fmtMonth, startOfWeek } from "@/lib/engine/dates";
import type { ISODate } from "@/lib/types";
import { cn, fmtDuration } from "@/lib/utils";

const SHADES = [28, 50, 74, 100];
/** Minutes that step up a shade. All goals together need a wider range than any one goal. */
export const GOAL_BANDS = [15, 30, 60, 120];
export const OVERALL_BANDS = [30, 75, 150, 240];

const levelOf = (v: number, bands: number[]) => {
  if (v <= 0) return -1;
  const i = bands.findIndex((t) => v < t);
  return i === -1 ? 3 : i;
};

const cellColor = (level: number, color: string) =>
  level < 0 ? "var(--heat-empty)" : `color-mix(in oklch, ${color} ${SHADES[level]}%, var(--card))`;

interface Props {
  values: Map<ISODate, number>;
  today: ISODate;
  weekStartsOn: 0 | 1;
  color?: string;
  weeks?: number;
  /** A year to show instead of the trailing window. */
  year?: number;
  onSelect?: (date: ISODate) => void;
  selected?: ISODate | null;
  bands?: number[];
}

/**
 * One column per week. Shade comes from fixed time bands rather than each person's
 * maximum, so a single huge day does not fade the rest of the year.
 */
export function Heatmap({ values, today, weekStartsOn, color = "var(--c-green)", weeks = 53, year, onSelect, selected, bands = GOAL_BANDS }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ date: ISODate; x: number; y: number } | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { columns, months } = useMemo(() => {
    const lastDay = year ? (`${year}-12-31` < today ? `${year}-12-31` : today) : today;
    const firstDay = year ? `${year}-01-01` : addDays(startOfWeek(today, weekStartsOn), -7 * (weeks - 1));
    const start = startOfWeek(firstDay, weekStartsOn);
    const end = startOfWeek(lastDay, weekStartsOn);
    const cols: { date: ISODate; inRange: boolean }[][] = [];
    const labels: { col: number; label: string }[] = [];
    let lastMonth = "";
    for (let wk = start, i = 0; wk <= end; wk = addDays(wk, 7), i++) {
      const col: { date: ISODate; inRange: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(wk, d);
        col.push({ date, inRange: date >= firstDay && date <= lastDay });
      }
      const m = col[0].date.slice(0, 7);
      if (m !== lastMonth) {
        if (i > 0 || Number(col[0].date.slice(8)) <= 7) labels.push({ col: i, label: fmtMonth(col[0].date) });
        lastMonth = m;
      }
      cols.push(col);
    }
    return { columns: cols, months: labels };
  }, [today, weekStartsOn, weeks, year]);

  const gap = 3;
  // Stretch to the card when there is room. On a phone, scroll instead of shrinking.
  const cell = width ? Math.min(19, Math.max(12, Math.floor((width - (columns.length - 1) * gap) / columns.length))) : 12;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [columns.length, cell]);

  const dayLabels = [1, 3, 5].map((i) => ({ i, label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(i + weekStartsOn) % 7] }));

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative shrink-0 pt-5 text-[10px] text-muted-foreground" style={{ width: 24 }} aria-hidden>
          {dayLabels.map(({ i, label }) => (
            <span key={i} className="absolute left-0 leading-none" style={{ top: 20 + i * (cell + gap) + 1 }}>{label}</span>
          ))}
        </div>
        <div ref={scroller} className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
          <div className="relative inline-block" style={{ minWidth: columns.length * (cell + gap) }}>
            <div className="relative mb-1.5 h-[14px] text-[10px] text-muted-foreground" aria-hidden>
              {months.map((m) => (
                <span key={`${m.col}${m.label}`} className="absolute" style={{ left: m.col * (cell + gap) }}>{m.label}</span>
              ))}
            </div>
            <div className="flex" style={{ gap }} role="grid" aria-label="Activity calendar">
              {columns.map((col, i) => (
                <div key={i} className="flex flex-col" style={{ gap }} role="row">
                  {col.map(({ date, inRange }) => {
                    if (!inRange) return <span key={date} style={{ width: cell, height: cell }} />;
                    const v = values.get(date) ?? 0;
                    return (
                      <button
                        key={date}
                        type="button"
                        role="gridcell"
                        tabIndex={onSelect ? 0 : -1}
                        aria-label={`${fmtLong(date)}: ${v ? fmtDuration(v) : "no activity"}`}
                        onClick={() => onSelect?.(date)}
                        onMouseEnter={(e) => {
                          const host = scroller.current!.parentElement!.parentElement!.getBoundingClientRect();
                          const r = e.currentTarget.getBoundingClientRect();
                          setTip({ date, x: r.left - host.left + cell / 2, y: r.top - host.top });
                        }}
                        onMouseLeave={() => setTip(null)}
                        className={cn(
                          "rounded-[3.5px] transition-transform duration-100 hover:scale-125",
                          date === today && "ring-1 ring-foreground/40 ring-offset-1 ring-offset-card",
                          selected === date && "ring-2 ring-foreground",
                          !onSelect && "cursor-default",
                        )}
                        style={{ width: cell, height: cell, background: cellColor(levelOf(v, bands), color) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tip && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-[var(--shadow-float)]"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          <span className="font-medium">{(values.get(tip.date) ?? 0) ? fmtDuration(values.get(tip.date)!) : "Nothing logged"}</span>
          <span className="ml-1.5 text-muted-foreground">{fmtLong(tip.date)}</span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        <span className="mr-1">Less</span>
        {[-1, 0, 1, 2, 3].map((l) => (
          <span key={l} className="rounded-[3px]" style={{ width: 10, height: 10, background: cellColor(l, color) }} />
        ))}
        <span className="ml-1">{bands[3] / 60}h+</span>
      </div>
    </div>
  );
}

