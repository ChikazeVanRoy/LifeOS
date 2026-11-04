"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useId, type CSSProperties, type ReactNode } from "react";
import type { ColorKey } from "@/lib/types";
import { clamp, cn, fmtNum } from "@/lib/utils";
import { Icon } from "./icons";

export const goalVar = (color: ColorKey) => ({ "--goal": `var(--c-${color})` }) as CSSProperties;

const spring = { type: "spring", stiffness: 70, damping: 18, mass: 0.9 } as const;

/** Counts to its value, so a change is felt rather than just seen. */
export function AnimatedNumber({ value, format = fmtNum, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return c.stop;
  }, [mv, value]);
  return <motion.span className={cn("num", className)}>{text}</motion.span>;
}

export function Ring({
  value,
  size = 64,
  stroke = 7,
  color = "var(--goal)",
  gradient = false,
  track = "var(--track)",
  children,
  className,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  gradient?: boolean;
  track?: string;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = clamp(value);
  return (
    <div className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        {gradient && (
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--c-amber)" />
              <stop offset="55%" stopColor="var(--c-red)" />
              <stop offset="100%" stopColor="var(--c-violet)" />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={gradient ? `url(#${id})` : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: v === 0 ? c : c * (1 - v) }}
          transition={spring}
          style={{ opacity: v === 0 ? 0 : 1 }}
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Bar({ value, color = "var(--goal)", gradient, className, height = 6 }: { value: number; color?: string; gradient?: boolean; className?: string; height?: number }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-track", className)} style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: gradient ? "var(--aurora)" : color }}
        initial={{ width: 0 }}
        animate={{ width: `${clamp(value) * 100}%` }}
        transition={spring}
      />
    </div>
  );
}

export function GoalBadge({ icon, color, size = 40, className }: { icon: string; color: ColorKey; size?: number; className?: string }) {
  return (
    <span className={cn("goal-tint inline-grid shrink-0 place-items-center rounded-[34%]", className)} style={{ ...goalVar(color), width: size, height: size, color: "var(--goal)" }}>
      <Icon name={icon} size={size * 0.5} strokeWidth={1.9} />
    </span>
  );
}

export function FlameIcon({ size = 20, lit = true, className }: { size?: number; lit?: boolean; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn(lit && "flame-live", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#f6c04c" />
          <stop offset="100%" stopColor="#df4f35" />
        </linearGradient>
      </defs>
      <path
        d="M12.4 2.2c.5 3.2-1 4.8-2.6 6.6C8.2 10.6 6 12.6 6 15.6 6 19.2 8.7 22 12 22s6-2.7 6-6.2c0-2.7-1.4-4.3-2.3-5.6-.4 1-.9 1.7-1.9 2.2.3-3.6-.1-7.5-1.4-10.2Z"
        fill={lit ? `url(#${id})` : "var(--track)"}
      />
      {lit && <path d="M12.2 13.2c.3 1.5-.6 2.2-1.3 3-.5.6-.9 1.3-.9 2.1 0 1.3 1 2.2 2.1 2.2s2.1-.9 2.1-2.3c0-2-1.3-3.2-2-5Z" fill="#fde39a" />}
    </svg>
  );
}

export function StreakPill({ current, unit, className }: { current: number; unit: "day" | "week"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", current === 0 && "text-muted-foreground", className)}>
      <FlameIcon size={16} lit={current > 0} />
      <span className="num">{current}</span>
      <span className="text-xs font-normal text-muted-foreground">{unit === "day" ? "d" : "wk"}</span>
    </span>
  );
}

export function Empty({ icon = "sprout", title, children, className }: { icon?: string; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-muted-foreground">
        <Icon name={icon} size={20} strokeWidth={1.8} />
      </span>
      <p className="mt-1 text-sm font-medium">{title}</p>
      {children && <div className="max-w-xs text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function SectionTitle({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-3 px-1", className)}>
      <h2 className="font-display text-[19px] font-medium">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div>
        <h1 className="font-display text-3xl font-medium md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export const WEEK_DOT: Record<string, string> = {
  done: "bg-[var(--goal)]",
  due: "bg-transparent ring-[1.5px] ring-inset ring-[color-mix(in_oklch,var(--goal)_60%,transparent)]",
  missed: "bg-track",
  rest: "bg-transparent",
  paused: "bg-transparent",
  future: "bg-track",
};
