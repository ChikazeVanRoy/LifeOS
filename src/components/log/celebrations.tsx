"use client";

import { Flag, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDerived } from "@/components/shell/providers";
import { Icon } from "@/components/viz/icons";
import { FlameIcon, goalVar, Ring } from "@/components/viz/primitives";
import type { Derived } from "@/lib/engine/derive";
import { lifeTitle } from "@/lib/engine/xp";
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

interface LevelUp {
  id: string;
  level: number;
  name: string;
  subtitle: string;
  progress: number;
  color: ColorKey | null;
}

const diff = (a: Derived, b: Derived) => {
  const toasts: Toast[] = [];
  const levels: LevelUp[] = [];

  if (b.level.level > a.level.level) {
    levels.push({ id: `life-${b.level.level}`, level: b.level.level, name: "Life Level", subtitle: lifeTitle(b.level.level), progress: b.level.progress, color: null });
  }
  for (const g of b.goals) {
    const before = a.byId.get(g.goal.id);
    if (!before) continue;
    if (g.level.level > before.level.level) {
      levels.push({ id: `${g.goal.id}-${g.level.level}`, level: g.level.level, name: g.goal.name, subtitle: "Level up", progress: g.level.progress, color: g.goal.color });
    }
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
  return { toasts, levels };
};

function Sparks({ color }: { color: string }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2 + i * 0.37;
        const r = 110 + ((i * 53) % 90);
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, s: 3 + (i % 3) * 2, d: (i % 5) * 0.04 };
      }),
    [],
  );
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2" aria-hidden>
      {sparks.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.s, height: p.s, background: i % 3 === 0 ? "var(--c-amber)" : color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: 1.1, delay: 0.1 + p.d, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

/** Reacts to what a log changed. Loading data, importing or switching modes stays silent. */
export function Celebrations() {
  const d = useDerived();
  const enabled = useStore((s) => s.data.settings.celebrations);
  const prev = useRef<Derived | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levels, setLevels] = useState<LevelUp[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = d;
    const armed = consumeCelebrate();
    if (!before || !armed || !enabled) return;
    const change = diff(before, d);
    if (change.toasts.length) setToasts((q) => [...q, ...change.toasts].slice(0, 6));
    if (change.levels.length) setLevels((q) => [...q, ...change.levels]);
  }, [d, enabled]);

  const toast = toasts[0];
  const level = levels[0];

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToasts((q) => q.slice(1)), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!level) return;
    const id = setTimeout(() => setLevels((q) => q.slice(1)), 2400);
    return () => clearTimeout(id);
  }, [level]);

  return (
    <>
      <AnimatePresence mode="wait">
        {toast && !level && (
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

      <AnimatePresence>
        {level && (
          <motion.button
            key={level.id}
            aria-label={`${level.name} reached level ${level.level}. Dismiss.`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLevels((q) => q.slice(1))}
            className="fixed inset-0 z-[70] grid place-items-center bg-background/70 backdrop-blur-md"
            style={level.color ? goalVar(level.color) : undefined}
          >
            <motion.div
              initial={{ scale: 0.8, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="relative flex flex-col items-center"
            >
              <Sparks color={level.color ? "var(--goal)" : "var(--c-violet)"} />
              <Ring value={level.progress} size={148} stroke={10} gradient={!level.color}>
                <span className="eyebrow">Level</span>
                <motion.span
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.2 }}
                  className="font-display num text-6xl leading-none font-medium"
                >
                  {level.level}
                </motion.span>
              </Ring>
              <p className="font-display mt-5 text-2xl font-medium">{level.name}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground"><Sparkles size={13} /> {level.subtitle}</p>
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
