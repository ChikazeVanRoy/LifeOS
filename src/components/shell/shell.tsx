"use client";

import { BarChart3, CalendarDays, Compass, Home, LayoutGrid, Mountain, NotebookPen, Plus, Settings, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Celebrations } from "@/components/log/celebrations";
import { LogSheet } from "@/components/log/log-sheet";
import { TimerPill } from "@/components/log/timer-pill";
import { Onboarding } from "@/components/onboarding";
import { FlameIcon, Ring } from "@/components/viz/primitives";
import { useAnkiAutoSync } from "@/lib/anki-sync";
import { useFileSync } from "@/lib/file-sync";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { cn, plural } from "@/lib/utils";
import { useDerived } from "./providers";

const NAV = [
  { href: "/", label: "Dashboard", short: "Home", icon: Home },
  { href: "/goals", label: "Goals", short: "Goals", icon: LayoutGrid },
  { href: "/roadmaps", label: "Roadmaps", short: "Roadmaps", icon: Mountain },
  { href: "/activity", label: "Activity", short: "Activity", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", short: "Stats", icon: BarChart3 },
  { href: "/achievements", label: "Achievements", short: "Awards", icon: Trophy },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

const active = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Ring value={0.78} size={size} stroke={size / 5} gradient />
      <span className="font-display text-[19px] font-medium">LifeOS</span>
    </span>
  );
}

function Sidebar() {
  const path = usePathname();
  const d = useDerived();
  const openLog = useUI((s) => s.openLog);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col px-4 py-6 md:flex">
      <Link href="/" className="mb-7 px-2">
        <Logo />
      </Link>
      <button
        onClick={() => openLog()}
        className="aurora-bg mb-6 flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-medium shadow-[0_10px_24px_-12px_rgba(180,70,70,0.65)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <Plus size={18} strokeWidth={2.4} /> Log activity
        <kbd className="ml-1 rounded-md bg-white/20 px-1.5 text-[11px] font-medium">N</kbd>
      </button>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const on = active(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                on ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {on && <motion.span layoutId="nav" className="absolute inset-0 rounded-xl bg-secondary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <n.icon size={18} className="relative" strokeWidth={on ? 2.1 : 1.8} />
              <span className="relative">{n.label}</span>
            </Link>
          );
        })}
        <Link
          href="/review"
          aria-current={active(path, "/review") ? "page" : undefined}
          className={cn("mt-4 flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors", active(path, "/review") ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
        >
          <NotebookPen size={18} strokeWidth={1.8} /> Weekly review
        </Link>
      </nav>
      <Link href="/achievements" title="Days in a row you kept up with every goal. A goal needs you on its scheduled days, or on the last days of a week when its weekly target is still short. Each goal can miss one day per streak; a second miss ends it." className="mt-auto flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-secondary">
        <span className="grid size-11 place-items-center"><FlameIcon size={30} lit={d.overallStreak.current > 0} /></span>
        <span className="min-w-0">
          <span className="num block truncate text-sm font-medium">{plural(d.overallStreak.current, "day")}</span>
          <span className="block text-xs text-muted-foreground">Life streak{d.overallStreak.currentForgiven > 0 && ` · incl. ${plural(d.overallStreak.currentForgiven, "rest day")}`}</span>
        </span>
      </Link>
      <Link href="/settings" className="num mt-2 px-2 text-[11px] text-muted-foreground hover:text-foreground">v{process.env.NEXT_PUBLIC_APP_VERSION}</Link>
    </aside>
  );
}

function BottomNav() {
  const path = usePathname();
  const openLog = useUI((s) => s.openLog);
  const pick = (href: string) => NAV.find((n) => n.href === href)!;
  const items = [pick("/"), pick("/goals"), null, pick("/activity"), pick("/analytics")];
  return (
    <nav className="safe-b fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid h-[62px] max-w-md grid-cols-5 items-center">
        {items.map((n) =>
          n ? (
            <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? "page" : undefined} className={cn("flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px]", active(path, n.href) ? "font-medium text-foreground" : "text-muted-foreground")}>
              <n.icon size={21} strokeWidth={active(path, n.href) ? 2.2 : 1.8} />
              {n.short}
            </Link>
          ) : (
            <button
              key="add"
              onClick={() => openLog()}
              aria-label="Log activity"
              className="aurora-bg mx-auto grid size-[54px] -translate-y-3 place-items-center rounded-[20px] shadow-[0_12px_24px_-10px_rgba(180,70,70,0.7)] transition-transform active:scale-95"
            >
              <Plus size={26} strokeWidth={2.4} />
            </button>
          ),
        )}
      </div>
    </nav>
  );
}

function MobileTop() {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 flex h-12 items-center justify-between bg-background/85 px-4 backdrop-blur-xl md:hidden" style={{ paddingTop: "env(safe-area-inset-top)", boxSizing: "content-box" }}>
      <Link href="/"><Logo size={22} /></Link>
      <div className="flex items-center gap-0.5 text-muted-foreground">
        <Link href="/roadmaps" aria-label="Roadmaps" className="grid size-10 place-items-center"><Mountain size={20} strokeWidth={1.8} /></Link>
        <Link href="/review" aria-label="Weekly review" className="grid size-10 place-items-center"><NotebookPen size={20} strokeWidth={1.8} /></Link>
        <Link href="/achievements" aria-label="Achievements" className="grid size-10 place-items-center"><Trophy size={20} strokeWidth={1.8} /></Link>
        <Link href="/settings" aria-label="Settings" className="grid size-10 place-items-center"><Settings size={20} strokeWidth={1.8} /></Link>
      </div>
    </div>
  );
}

function DemoBanner() {
  const mode = useStore((s) => s.mode);
  const exitDemo = useStore((s) => s.exitDemo);
  if (mode !== "demo") return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed bg-card px-4 py-2.5 text-sm">
      <Compass size={16} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1"><b className="font-medium">Demo mode.</b> <span className="text-muted-foreground">Sample data<span className="hidden sm:inline">. Your real account is untouched</span>.</span></span>
      <button onClick={exitDemo} className="inline-flex shrink-0 items-center gap-1 font-medium underline-offset-4 hover:underline">
        Exit <X size={14} />
      </button>
    </div>
  );
}

function useShortcuts() {
  const openLog = useUI((s) => s.openLog);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if ((e.key === "n" && !e.metaKey && !e.ctrlKey) || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        openLog();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openLog]);
}

export function Shell({ children }: { children: ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const onboarded = useStore((s) => s.data.settings.onboarded);
  const path = usePathname();
  useShortcuts();
  useAnkiAutoSync();
  useFileSync();

  if (!hydrated) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Logo size={32} />
        </motion.div>
      </div>
    );
  }
  if (!onboarded) return <Onboarding />;

  return (
    <>
      <Sidebar />
      <main className="min-h-dvh px-4 pb-32 md:ml-60 md:px-8 md:pt-8 md:pb-16">
        <div className="mx-auto w-full max-w-[1080px]">
          <MobileTop />
          <DemoBanner />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={path} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <BottomNav />
      <TimerPill />
      <LogSheet />
      <Celebrations />
    </>
  );
}
