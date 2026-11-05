"use client";

import { Flag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useDerived } from "@/components/shell/providers";
import { Icon } from "@/components/viz/icons";
import { FlameIcon, goalVar } from "@/components/viz/primitives";
import type { Derived } from "@/lib/engine/derive";
import { consumeCelebrate, useStore } from "@/lib/store";
import type { ColorKey } from "@/lib/types";
import { plural } from "@/lib/utils";

interface Toast {
  id: string;
  kind: "achievement" | "milestone" | "streak";
  title: string;
  subtitle: string;
  icon: string;
  color: ColorKey;
}

const diff = (a: Derived, b: Derived) => {
  const toasts: Toast[] = [];

  for (const g of b.goals) {
    const before = a.byId.get(g.goal.id);
    if (!before) continue;
    if (g.streak.current > before.streak.current && g.streak.current >= 2) {
      toasts.push({ id: `streak-${g.goal.id}-${g.streak.current}`, kind: "streak", title: `${plural(g.streak.current, g.streak.unit)} of ${g.goal.name}`, subtitle: g.streak.current === g.streak.longest ? "Your longest yet" : "Streak extended", icon: "flame", color: g.goal.color });
    }
  }
  const had = new Set(a.achievements.filter((x) => x.unlockedOn).map((x) => x.id));
  for (const x of b.achievements) {
    if (x.unlockedOn && !had.has(x.id)) {
      const color = (x.goalId && b.byId.get(x.goalId)?.goal.color) || "amber";
      toasts.push({ id: `a-${x.id}`, kind: "achievement", title: x.title, subtitle: "Achievement unlocked", icon: x.icon, color });
    }
  }
  const done = new Set(a.milestones.filter((m) => m.completedOn).map((m) => m.id));
  for (const m of b.milestones) {
    if (m.completedOn && !done.has(m.id)) {
      const color = (m.goalId && b.byId.get(m.goalId)?.goal.color) || "violet";
      toasts.push({ id: `m-${m.id}`, kind: "milestone", title: m.title, subtitle: "Milestone reached", icon: "flag", color });
    }
  }
  return toasts;
};

/** Reacts to what a log changed. Loading data, importing or switching modes stays silent. */
export function Celebrations() {
  const d = useDerived();
  const enabled = useStore((s) => s.data.settings.celebrations);
  const prev = useRef<Derived | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = d;
    const armed = consumeCelebrate();
    if (!before || !armed || !enabled) return;
    const change = diff(before, d);
    if (change.length) setToasts((q) => [...q, ...change].slice(0, 6));
  }, [d, enabled]);

  const toast = toasts[0];

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToasts((q) => q.slice(1)), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <AnimatePresence mode="wait">
        {toast && (
          <motion.button
            key={toast.id}
            onClick={() => setToasts((q) => q.slice(1))}
            initial={{ y: -24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -14, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            style={goalVar(toast.color)}
            className="fixed inset-x-4 top-[calc(14px+env(safe-area-inset-top))] z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border bg-popover p-2.5 pr-5 text-left shadow-[var(--shadow-float)] md:top-5"
          >
            <motion.span
              initial={{ scale: 0.5, rotate: -14 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.08 }}
              className="goal-tint grid size-11 shrink-0 place-items-center rounded-[14px] text-[var(--goal)]"
            >
              {toast.kind === "streak" ? <FlameIcon size={24} /> : toast.kind === "milestone" ? <Flag size={21} /> : <Icon name={toast.icon} size={21} />}
            </motion.span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">{toast.subtitle}</span>
              <span className="block truncate text-[15px] font-medium">{toast.title}</span>
            </span>
          </motion.button>
        )}
    </AnimatePresence>
  );
}
