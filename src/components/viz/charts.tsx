"use client";

import { Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { cn, fmtCompact, fmtNum } from "@/lib/utils";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export type Row = Record<string, string | number | null>;

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

function Tip({ active, payload, label, format, series }: Partial<TooltipContentProps<number, string>> & { format: (n: number) => string; series: Series[] }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => Number(p.value) > 0 || series.length === 1);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, p) => s + Number(p.value), 0);
  return (
    <div className="min-w-32 rounded-xl border bg-popover px-3 py-2 text-xs shadow-[var(--shadow-float)]">
      <p className="mb-1 font-medium">{label}</p>
      {rows.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: s?.color }} />
              {s?.label}
            </span>
            <span className="num font-medium text-foreground">{format(Number(p.value))}</span>
          </div>
        );
      })}
      {rows.length > 1 && (
        <div className="mt-1 flex justify-between border-t pt-1 text-muted-foreground">
          <span>Total</span>
          <span className="num font-medium text-foreground">{format(total)}</span>
        </div>
      )}
    </div>
  );
}

export function Legend({ series, className }: { series: Series[]; className?: string }) {
  if (series.length < 2) return null;
  return (
    <div className={cn("flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground", className)}>
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

interface TableView {
  rows: Row[];
  xKey: string;
  xLabel: string;
  series: Series[];
  format: (n: number) => string;
}

export function ChartCard({ title, subtitle, children, table, right, className, legend }: { title: string; subtitle?: ReactNode; children: ReactNode; table?: TableView; right?: ReactNode; className?: string; legend?: Series[] }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cn("card min-w-0 p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {right}
          {table && (
            <button aria-pressed={showTable} aria-label="Show as table" onClick={() => setShowTable((v) => !v)} className={cn("grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground", showTable && "bg-secondary text-foreground")}>
              <Table2 size={15} />
            </button>
          )}
        </div>
      </div>
      {legend && !showTable && <Legend series={legend} className="mb-3" />}
      {showTable && table ? <DataTable {...table} /> : children}
    </section>
  );
}

function DataTable({ rows, xKey, xLabel, series, format }: TableView) {
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-4 font-normal">{xLabel}</th>
            {series.map((s) => <th key={s.key} className="py-1.5 pr-4 text-right font-normal">{s.label}</th>)}
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5 pr-4">{r[xKey]}</td>
              {series.map((s) => <td key={s.key} className="py-1.5 pr-4 text-right">{r[s.key] == null ? "–" : format(Number(r[s.key]))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BarShape {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  dataKey?: string;
  payload?: Row;
}

/** Rounds only the top of a stack. The 2px gap separates segments without an outline. */
const stackShape = (order: string[]) =>
  function StackSegment({ x = 0, y = 0, width = 0, height = 0, fill, dataKey, payload }: BarShape) {
    if (height <= 0) return null;
    const top = [...order].reverse().find((k) => Number(payload?.[k] ?? 0) > 0);
    const h = Math.max(1, height - 2);
    const yy = y + (height - h);
    const r = dataKey === top ? Math.min(4, width / 2, h) : 0;
    return (
      <path
        fill={fill}
        d={`M${x},${yy + h}V${yy + r}${r ? `Q${x},${yy} ${x + r},${yy}` : ""}H${x + width - r}${r ? `Q${x + width},${yy} ${x + width},${yy + r}` : ""}V${yy + h}Z`}
      />
    );
  };

const Y = ({ format, width = 38 }: { format?: (n: number) => string; width?: number }) => (
  <YAxis tick={axis} tickLine={false} axisLine={false} width={width} tickFormatter={format ?? fmtCompact} allowDecimals={false} />
);

const Grid = () => <CartesianGrid vertical={false} stroke="var(--grid)" />;

export function Bars({
  data,
  xKey = "label",
  series,
  format = fmtNum,
  height = 220,
  target,
  targetLabel,
}: {
  data: Row[];
  xKey?: string;
  series: Series[];
  format?: (n: number) => string;
  height?: number;
  target?: number;
  targetLabel?: string;
}) {
  const shape = stackShape(series.map((s) => s.key));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
        <Grid />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
        <Y format={format} />
        <Tooltip cursor={{ fill: "var(--track)", radius: 6 }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} format={format} series={series} />} />
        {target !== undefined && (
          <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeOpacity={0.6} label={{ value: targetLabel ?? "Target", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }} />
        )}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} maxBarSize={24} shape={shape} isAnimationActive animationDuration={500} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({
  data,
  xKey = "label",
  series,
  format = fmtNum,
  height = 220,
  target,
  targetLabel,
  domain,
}: {
  data: Row[];
  xKey?: string;
  series: Series[];
  format?: (n: number) => string;
  height?: number;
  target?: number;
  targetLabel?: string;
  /** Measurements such as body weight need a fitted axis. Totals always start at zero. */
  domain?: [number | "auto", number | "auto"];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <Grid />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={38} domain={domain} tickFormatter={format} />
        <Tooltip cursor={{ stroke: "var(--faint)", strokeWidth: 1 }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} format={format} series={series} />} />
        {target !== undefined && (
          <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeOpacity={0.6} label={{ value: targetLabel ?? "Target", position: "insideBottomRight", fontSize: 11, fill: "var(--muted-foreground)" }} />
        )}
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={data.length <= 14 ? { r: 3, strokeWidth: 0, fill: s.color } : false} activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }} connectNulls animationDuration={600} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Cumulative({ data, xKey = "label", series, format = fmtNum, height = 220 }: { data: Row[]; xKey?: string; series: Series; format?: (n: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <Grid />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
        <Y format={format} width={42} />
        <Tooltip cursor={{ stroke: "var(--faint)", strokeWidth: 1 }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} format={format} series={[series]} />} />
        <Area dataKey={series.key} stroke={series.color} strokeWidth={2} fill={series.color} fillOpacity={0.1} animationDuration={700} activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
