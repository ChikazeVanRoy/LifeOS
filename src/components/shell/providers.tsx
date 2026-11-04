"use client";

import { MotionConfig } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { todayIn } from "@/lib/engine/dates";
import { derive, type Derived } from "@/lib/engine/derive";
import { resolveTz } from "@/lib/engine/dates";
import { useStore } from "@/lib/store";
import { Shell } from "./shell";

const DerivedContext = createContext<Derived | null>(null);

export const useDerived = () => {
  const d = useContext(DerivedContext);
  if (!d) throw new Error("useDerived needs the app shell");
  return d;
};

function useResolvedTheme() {
  const pref = useStore((s) => s.data.settings.theme);
  const hydrated = useStore((s) => s.hydrated);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = pref === "dark" || (pref === "system" && media.matches);
      document.documentElement.classList.toggle("dark", next);
      setDark(next);
    };
    apply();
    try {
      localStorage.setItem("lifeos:theme", pref);
    } catch {
      /* the theme is a convenience */
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [pref, hydrated]);

  return dark;
}

/** The single source of statistics. Everything on screen reads from this. */
function DerivedProvider({ children }: { children: ReactNode }) {
  const data = useStore((s) => s.data);
  const tz = resolveTz(data.settings.timezone);
  const [today, setToday] = useState(() => todayIn(tz));

  // Roll over at local midnight, and on return from sleep.
  useEffect(() => {
    const check = () => setToday(todayIn(tz));
    check();
    const id = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [tz]);

  // `today` is a dependency so the day rolling over recomputes everything.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const derived = useMemo(() => derive(data), [data, today]);
  return <DerivedContext.Provider value={derived}>{children}</DerivedContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const dark = useResolvedTheme();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <MotionConfig reducedMotion="user">
      <DerivedProvider>
        <Shell>{children}</Shell>
      </DerivedProvider>
      <Toaster theme={dark ? "dark" : "light"} />
    </MotionConfig>
  );
}
