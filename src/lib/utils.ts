import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

export const fmtNum = (n: number) => Math.round(n).toLocaleString();

export const fmtCompact = (n: number) =>
  n >= 10_000
    ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : fmtNum(n);

export const fmtHours = (minutes: number) => {
  const h = minutes / 60;
  if (h === 0) return "0h";
  if (h < 10) return `${h.toFixed(1).replace(/\.0$/, "")}h`;
  return `${fmtNum(h)}h`;
};

export const fmtDuration = (minutes: number) => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;

export const pctChange = (now: number, before: number) => (before > 0 ? (now - before) / before : null);
