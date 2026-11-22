"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { cloudEnabled, cloudRead, cloudUid, cloudWrite } from "./cloud";
import { migrate } from "./migrate";
import { planLoad } from "./reconcile";
import { storage } from "./storage";
import type { AppData } from "./types";
import { useUI } from "./ui";

/** Each signed-in person keeps their own revision and unsaved flag, so two accounts on one browser never mix. */
const scoped = (key: string) => (cloudUid() ? `${key}:${cloudUid()}` : key);
const revisionKey = () => scoped("lifeos:file:revision");
const pendingKey = () => scoped("lifeos:file:pending");
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
/** Where the real account is kept in this browser. */
export const realKey = () => scoped("lifeos:data:real");
export const connectFile = (b: Bridge) => {
  bridge = b;
};

const status = (patch: Parameters<ReturnType<typeof useUI.getState>["setFileStatus"]>[0]) => useUI.getState().setFileStatus(patch);

const setRevision = (value: number) => {
  revision = value;
  void storage.write(revisionKey(), value);
};
const setPending = (value: boolean) => {
  pending = value;
  void storage.write(pendingKey(), value);
};

/** Another tab saved, so it knows the latest revision. */
export const rereadRevision = async () => {
  const saved = await storage.read<number>(revisionKey());
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
    if (cloudEnabled) {
      const remote = await cloudRead();
      return { ...remote, path: "Cloud", ...(check ? { data: undefined } : {}) };
    }
    const res = await fetch(`/api/data${check ? "?check=1" : ""}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Remote) : null;
  } catch {
    return null;
  }
};

type Sent = { kind: "saved"; revision: number; savedAt: string; backups?: number } | { kind: "conflict" } | { kind: "error"; error?: string };

/** Sends a save to the cloud when signed in, otherwise to the file on this Mac. */
const put = async (baseRevision: number | null, data: AppData): Promise<Sent> => {
  if (cloudEnabled) {
    const result = await cloudWrite(baseRevision, data as unknown as Record<string, unknown>);
    if (result.status === "saved") return { kind: "saved", revision: result.revision, savedAt: result.savedAt };
    return result.status === "conflict" ? { kind: "conflict" } : { kind: "error", error: result.error };
  }
  const res = await fetch("/api/data", { method: "PUT", headers, body: JSON.stringify({ baseRevision, data }) });
  const body = (await res.json()) as { revision?: number; savedAt?: string; backups?: number; error?: string };
  if (res.status === 409) return { kind: "conflict" };
  if (!res.ok) return { kind: "error", error: body.error };
  return { kind: "saved", revision: body.revision as number, savedAt: body.savedAt as string, backups: body.backups };
};

const adoptFile = (remote: Remote) => {
  const data = migrate(remote.data) as AppData;
  setRevision(remote.revision as number);
  setPending(false);
  status({ state: "saved", savedAt: remote.savedAt, path: remote.path, backups: remote.backups });
  return data;
};

/** Decides which copy to trust when the app loads. The rules are in `reconcile.ts`. */
export const reconcile = async (local: AppData | undefined, localHasData: boolean): Promise<{ data: AppData | undefined; notice?: string }> => {
  const [remote, savedRevision, savedPending] = await Promise.all([fetchRemote(), storage.read<number>(revisionKey()), storage.read<boolean>(pendingKey())]);
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
    await storage.write(realKey(), fileData);
    return { data: adoptFile(remote as Remote), notice: "Loaded your saved file. This browser's different data was kept in your backups." };
  }

  await storage.write(realKey(), fileData);
  return { data: adoptFile(remote as Remote), notice: remote?.recovered ? "Your data file was damaged, so LifeOS restored the latest backup." : undefined };
};

/** Tells the person once that changes are waiting in this browser, rather than failing silently. */
let warned = false;
const failed = (reason?: string) => {
  if (warned) return;
  warned = true;
  toast.error(reason ?? "Couldn't save to your account. Your changes are kept in this browser and will be sent when it works again.", { duration: 10_000 });
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
      const sent = await put(revision, data);

      if (sent.kind === "conflict") {
        // Another browser saved first. Its data stands, and this one is in the backups.
        await refresh();
        return;
      }
      if (sent.kind === "error") {
        console.error("LifeOS could not save:", sent.error);
        failed(sent.error);
        status({ state: "browser" });
        return;
      }
      warned = false;
      setRevision(sent.revision);
      status({ state: "saved", savedAt: sent.savedAt, backups: sent.backups });
      bridge?.announce();
    }
    setPending(false);
  } catch (error) {
    console.error("LifeOS could not save:", error);
    failed();
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
