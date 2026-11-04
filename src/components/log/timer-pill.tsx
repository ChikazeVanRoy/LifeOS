"use client";

import { Pause, Play, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useDerived } from "@/components/shell/providers";
import { goalVar, GoalBadge } from "@/components/viz/primitives";
import { timerElapsedMs, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

/** Timers are saved, so one keeps counting through a refresh or a closed tab. */
export function TimerPill() {
  const timer = useStore((s) => s.data.timer);
  const { pauseTimer, resumeTimer, clearTimer } = useStore.getState();
  const openLog = useUI((s) => s.openLog);
  const d = useDerived();
  const [, tick] = useState(0);

  useEffect(() => {
    if (!timer || timer.pausedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const view = timer ? d.byId.get(timer.goalId) : null;

  return (
    <AnimatePresence>
      {timer && view && (
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          style={goalVar(view.goal.color)}
          className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 mx-auto flex w-fit items-center gap-2 rounded-full border bg-popover py-1.5 pr-2 pl-2 shadow-[var(--shadow-float)] md:right-6 md:bottom-6 md:left-auto md:mx-0"
        >
          <GoalBadge icon={view.goal.icon} color={view.goal.color} size={32} className="rounded-full" />
          <span className="num min-w-[58px] text-[15px] font-medium">{clock(timerElapsedMs(timer))}</span>
          <button aria-label={timer.pausedAt ? "Resume timer" : "Pause timer"} onClick={timer.pausedAt ? resumeTimer : pauseTimer} className="grid size-9 place-items-center rounded-full bg-secondary transition-colors hover:brightness-95">
            {timer.pausedAt ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button
            aria-label="Stop timer and log"
            onClick={() => {
              const minutes = Math.max(1, Math.round(timerElapsedMs(timer) / 60000));
              openLog({ goalId: timer.goalId, typeId: timer.typeId, minutes });
              clearTimer();
            }}
            className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <Square size={13} fill="currentColor" />
          </button>
          <button aria-label="Discard timer" onClick={clearTimer} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
