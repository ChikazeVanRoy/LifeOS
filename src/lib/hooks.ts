"use client";

import { useSyncExternalStore } from "react";

export const useMediaQuery = (query: string) =>
  useSyncExternalStore(
    (notify) => {
      const m = matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => matchMedia(query).matches,
    () => false,
  );
