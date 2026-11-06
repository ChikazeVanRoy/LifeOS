"use client";

import { useEffect } from "react";
import { migrate } from "./migrate";
import { planLoad } from "./reconcile";
import { storage } from "./storage";
import type { AppData } from "./types";
import { useUI } from "./ui";

const REVISION = "lifeos:file:revision";
const PENDING = "lifeos:file:pending";
const headers = { "Content-Type": "application/json", "x-requested-by": "lifeos" };

/** The file revision this browser's data is based on. Null until it has seen one. */
let revision: number | null = null;
let pending = false;

interface Bridge {
  /** The live real account, or null in demo mode or before loading. */
  current: () => AppData | null;
  apply: (data: AppData) => void;
  announce: () => void;
}
let bridge: Bridge | null = null;
export const connectFile = (b: Bridge) => {
  bridge = b;
};

const status = (patch: Parameters<ReturnType<typeof useUI.getState>["setFileStatus"]>[0]) => useUI.getState().setFileStatus(patch);

const setRevision = (value: number) => {
  revision = value;
  void storage.write(REVISION, value);
};
const setPending = (value: boolean) => {
  pending = value;
  void storage.write(PENDING, value);
};

/** Another tab saved, so it knows the latest revision. */
export const rereadRevision = async () => {
  const saved = await storage.read<number>(REVISION);
  if (saved !== undefined) revision = saved;
};

interface Remote {
  exists: boolean;
  revision?: number;
  savedAt?: string;
  recovered?: boolean;
  path?: string;
  backups?: number;
  data?: unknown;
}

const fetchRemote = async (check = false): Promise<Remote | null> => {
  try {
    const res = await fetch(`/api/data${check ? "?check=1" : ""}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Remote) : null;
  } catch {
    return null;
  }
};

const put = (baseRevision: number | null, data: AppData) =>
  fetch("/api/data", { method: "PUT", headers, body: JSON.stringify({ baseRevision, data }) });

const adoptFile = (remote: Remote) => {
  const data = migrate(remote.data) as AppData;
  setRevision(remote.revision as number);
  setPending(false);
  status({ state: "saved", savedAt: remote.savedAt, path: remote.path, backups: remote.backups });
  return data;
};

/** Decides which copy to trust when the app loads. The rules are in `reconcile.ts`. */
export const reconcile = async (local: AppData | undefined, localHasData: boolean): Promise<{ data: AppData | undefined; notice?: string }> => {
  const [remote, savedRevision, savedPending] = await Promise.all([fetchRemote(), storage.read<number>(REVISION), storage.read<boolean>(PENDING)]);
  const fileData = remote?.exists ? (migrate(remote.data) as AppData) : undefined;

  const plan = planLoad({
    available: !!remote,
    fileExists: !!remote?.exists,
    localHasData,
    identical: !!local && !!fileData && JSON.stringify(local) === JSON.stringify(fileData),
    localRevision: savedRevision,
    fileRevision: remote?.revision,
    pending: !!savedPending,
    fileRecovered: remote?.recovered,
  });

  if (plan === "browser-only") {
    if (savedRevision !== undefined) revision = savedRevision;
    setPending(!!savedPending);
    status({ state: "browser" });
    return { data: local };
  }

  status({ path: remote?.path, backups: remote?.backups, savedAt: remote?.savedAt, state: "saved" });

  if (plan === "fresh") return { data: undefined };

  if (plan === "push-local") {
    revision = remote?.revision ?? null;
    pushToFile(local as AppData);
    return { data: local };
  }

  if (plan === "use-file-keep-copy") {
    // A revision nothing can match makes the server keep this copy as a conflict backup.
    await put(-1, local as AppData).catch(() => undefined);
    await storage.write("lifeos:data:real", fileData);
    return { data: adoptFile(remote as Remote), notice: "Loaded your saved file. This browser's different data was kept in your backups." };
  }

  await storage.write("lifeos:data:real", fileData);
  return { data: adoptFile(remote as Remote), notice: remote?.recovered ? "Your data file was damaged, so LifeOS restored the latest backup." : undefined };
};

let saving = false;
let waiting: AppData | null = null;

/** Sends the newest state. Saves don't pile up: changes made during one are sent together after it. */
export const pushToFile = (data: AppData) => {
  waiting = data;
  setPending(true);
  if (!saving) void drain();
};

const drain = async () => {
  saving = true;
  status({ state: "saving" });
  try {
    while (waiting) {
      const data = waiting;
      waiting = null;
      const res = await put(revision, data);
      const body = (await res.json()) as { revision?: number; savedAt?: string; backups?: number; error?: string };

      if (res.status === 409) {
        // Another browser saved first. Its data stands, and this one is in the backups.
        await refresh();
        return;
      }
      if (!res.ok) {
        console.error("LifeOS could not save to the file:", body.error);
        status({ state: "browser" });
        return;
      }
      setRevision(body.revision as number);
      status({ state: "saved", savedAt: body.savedAt, backups: body.backups });
      bridge?.announce();
    }
    setPending(false);
  } catch {
    status({ state: "browser" });
  } finally {
    saving = false;
  }
};

const refresh = async () => {
  const remote = await fetchRemote();
  if (!remote?.exists) return;
  bridge?.apply(adoptFile(remote));
};

/** Retries a failed save, and picks up anything another browser saved. */
const check = async () => {
  if (!bridge?.current() || saving) return;
  if (pending) {
    pushToFile(bridge.current() as AppData);
    return;
  }
  const remote = await fetchRemote(true);
  if (!remote) return status({ state: "browser" });
  if (remote.exists && remote.revision !== revision) await refresh();
  else status({ state: "saved", backups: remote.backups, savedAt: remote.savedAt });
};

export const revealFile = () => fetch("/api/data/reveal", { method: "POST", headers });

const EVERY = 30_000;

export const useFileSync = () => {
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") void check();
    };
    const id = setInterval(run, EVERY);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
};

export interface UpdateInfo {
  /** Commits on GitHub that this copy doesn't have yet. */
  behind: number;
  error?: string;
}

export const checkUpdate = async (): Promise<UpdateInfo> => {
  const res = await fetch("/api/update", { headers });
  return res.json();
};

export const installUpdate = async (): Promise<{ ok: boolean; message: string }> => {
  const res = await fetch("/api/update", { method: "POST", headers });
  return res.json();
};
