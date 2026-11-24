"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { collection, deleteDoc, doc, documentId, getDoc, getDocs, getFirestore, query, runTransaction, setDoc, where, writeBatch } from "firebase/firestore";
import { healthDay, num } from "./health-num";
import { parseImport } from "./io";

export { num };

/**
 * Cloud sync through Firebase. It is on only when the Firebase keys are set in `.env.local`,
 * so without them LifeOS keeps working from the data file on this Mac exactly as before.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const cloudEnabled = !!(config.apiKey && config.projectId && config.appId);

const app = () => (getApps().length ? getApp() : initializeApp(config));
const auth = () => getAuth(app());
const db = () => getFirestore(app());

export const watchUser = (callback: (user: User | null) => void) => onAuthStateChanged(auth(), callback);

export const signIn = (email: string, password: string) => signInWithEmailAndPassword(auth(), email, password);
export const signUp = async (email: string, password: string) => {
  const credential = await createUserWithEmailAndPassword(auth(), email, password);
  await sendEmailVerification(credential.user).catch(() => undefined);
  return credential;
};
/** The rules only open an account's data once its email is verified. */
export const resendVerification = async () => {
  const user = auth().currentUser;
  if (user) await sendEmailVerification(user);
};
/** Picks up a verification done in another tab or the email app. */
export const refreshUser = async () => {
  const user = auth().currentUser;
  if (!user) return false;
  await user.reload();
  await user.getIdToken(true);
  return user.emailVerified;
};
export const resetPassword = (email: string) => sendPasswordResetEmail(auth(), email);
export const signOut = () => fbSignOut(auth());

/** Plain words for the errors people actually hit. */
export const authMessage = (error: unknown) => {
  const code = (error as { code?: string })?.code ?? "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return "That email and password don't match.";
  if (code.includes("email-already-in-use")) return "There's already an account with that email. Try signing in.";
  if (code.includes("weak-password")) return "Use a password of at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like an email address.";
  if (code.includes("too-many-requests")) return "Too many tries. Wait a minute and try again.";
  if (code.includes("network")) return "Can't reach the internet right now.";
  return "Something went wrong. Try again.";
};

/** The signed-in person whose data this browser is working on. Set once at startup. */
let uid: string | null = null;
export const setCloudUid = (value: string | null) => {
  uid = value;
};
export const cloudUid = () => uid;

const stateRef = (owner: string) => doc(db(), "users", owner, "sync", "state");
const backupRef = (owner: string, name: string) => doc(db(), "users", owner, "backups", name);

/**
 * The whole of one person's data lives in one document as text, so Firestore's field rules never reject it.
 * A document holds at most 1 MiB, so past `PACK_OVER` the text is gzipped into `gz` (base64) instead of `json`.
 */
interface Stored {
  revision: number;
  savedAt: string;
  json?: string;
  gz?: string;
}

const PACK_OVER = 400_000;
/** What one document can hold, with room to spare for its other fields. */
const MAX_STORED = 950_000;

const toBase64 = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const pipe = (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) =>
  new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer().then((b) => new Uint8Array(b));

const pack = async (json: string): Promise<Pick<Stored, "json" | "gz">> =>
  json.length <= PACK_OVER ? { json } : { gz: toBase64(await pipe(new TextEncoder().encode(json), new CompressionStream("gzip"))) };

/** The text of a stored document, whichever way it was saved. */
const unpack = async (stored: Pick<Stored, "json" | "gz">): Promise<string> =>
  stored.gz ? new TextDecoder().decode(await pipe(fromBase64(stored.gz), new DecompressionStream("gzip"))) : (stored.json ?? "null");

export interface CloudRemote {
  exists: boolean;
  revision?: number;
  savedAt?: string;
  data?: unknown;
}

export const cloudRead = async (owner = uid): Promise<CloudRemote> => {
  if (!owner) throw new Error("Not signed in");
  const snap = await runTransaction(db(), (tx) => tx.get(stateRef(owner)));
  if (!snap.exists()) return { exists: false };
  const stored = snap.data() as Stored;
  return { exists: true, revision: stored.revision, savedAt: stored.savedAt, data: JSON.parse(await unpack(stored)) };
};

export type CloudSave = { status: "saved"; revision: number; savedAt: string } | { status: "conflict"; revision: number } | { status: "invalid"; error: string };

const localDay = () => new Date().toLocaleDateString("en-CA");
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/**
 * The same rule as the file: a save only lands if it was made from the latest revision.
 * Otherwise the other copy stands and this one is kept as a backup, not lost.
 */
export const cloudWrite = async (baseRevision: number | null, data: Record<string, unknown>): Promise<CloudSave> => {
  if (!uid) throw new Error("Not signed in");
  const owner = uid;
  // Nothing malformed may replace good data. A running timer is valid here, but not in a backup.
  const checked = parseImport(JSON.stringify({ data: { ...data, timer: null } }));
  if (!checked.ok) return { status: "invalid", error: checked.error };

  const json = JSON.stringify(data);
  const savedAt = new Date().toISOString();
  const body = await pack(json);
  if ((body.json ?? body.gz ?? "").length > MAX_STORED) {
    return { status: "invalid", error: "Your data is too large to sync. Export a backup, then remove old entries you no longer need." };
  }

  const result = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(stateRef(owner));
    const current = snap.exists() ? (snap.data() as Stored) : null;
    const daily = backupRef(owner, `daily-${localDay()}`);
    const dailySnap = current ? await tx.get(daily) : null;

    if (current && baseRevision !== current.revision) {
      tx.set(backupRef(owner, `conflict-${stamp()}`), { savedAt, ...body });
      return { status: "conflict" as const, revision: current.revision };
    }

    if (current) {
      const previous = { ...(current.gz ? { gz: current.gz } : { json: current.json }) };
      if (dailySnap && !dailySnap.exists()) tx.set(daily, { savedAt: current.savedAt, ...previous });
      // Resets, imports and deleted goals are the moves worth being able to undo.
      const before = (JSON.parse(await unpack(current)) as { logs?: unknown[] }).logs?.length ?? 0;
      const after = (data as { logs?: unknown[] }).logs?.length ?? 0;
      if (after < before) tx.set(backupRef(owner, `safety-${stamp()}`), { savedAt: current.savedAt, ...previous });
    }

    const revision = (current?.revision ?? 0) + 1;
    tx.set(stateRef(owner), { revision, savedAt, ...body } satisfies Stored);
    return { status: "saved" as const, revision, savedAt };
  });
  if (result.status === "saved") void pruneBackups(owner);
  return result;
};

const KEEP: Record<string, number> = { daily: 30, safety: 20, conflict: 20 };
let prunedOn = "";

/** Keeps the newest few of each kind of backup, as the data file does. Once a day is enough. */
const pruneBackups = async (owner: string) => {
  const day = localDay();
  if (prunedOn === day) return;
  prunedOn = day;
  try {
    const snap = await getDocs(collection(db(), "users", owner, "backups"));
    const doomed = Object.entries(KEEP).flatMap(([kind, keep]) =>
      snap.docs
        .filter((d) => d.id.startsWith(`${kind}-`))
        .sort((a, b) => (a.id < b.id ? 1 : -1))
        .slice(keep),
    );
    for (let i = 0; i < doomed.length; i += 400) {
      const batch = writeBatch(db());
      doomed.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch {
    prunedOn = "";
  }
};

/** A phone or computer that wants reminders. The sender reads these; each person owns their own. */
export interface Device {
  token: string;
  timeZone: string;
  hour: number;
  updatedAt: string;
}

const deviceRef = (owner: string, id: string) => doc(db(), "users", owner, "devices", id);

export const saveDevice = async (id: string, device: Device) => {
  if (!uid) throw new Error("Not signed in");
  await setDoc(deviceRef(uid, id), device);
};

export const removeDevice = async (id: string) => {
  if (!uid) return;
  await deleteDoc(deviceRef(uid, id));
};

/** The reminder hour of every device this person turned reminders on for. */
export const readDeviceHours = async (): Promise<{ id: string; hour: number }[]> => {
  if (!uid) return [];
  const snap = await getDocs(collection(db(), "users", uid, "devices"));
  return snap.docs.map((d) => ({ id: d.id, hour: Number(d.get("hour")) })).filter((d) => Number.isFinite(d.hour));
};

export const firebaseApp = app;

/** One day of numbers from Apple Health, written by an iPhone Shortcut. Every field is optional. */
export interface HealthDay {
  date: string;
  steps?: number;
  weight?: number;
  sleepHours?: number;
  workoutMinutes?: number;
}

export const readHealth = async (days = 14): Promise<HealthDay[]> => {
  if (!uid) return [];
  // A plain range on the date-named ids needs no index; the newest days are picked after.
  const from = new Date(Date.now() - (days + 2) * 86_400_000).toLocaleDateString("en-CA");
  const snap = await getDocs(query(collection(db(), "users", uid, "health"), where(documentId(), ">=", from)));
  const docs = snap.docs.sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, days);
  return docs.map((d) => healthDay(d.id, d.data()));
};

/**
 * What the Shortcut needs to add health numbers. The key lives in the person's own space, is made
 * the first time it is asked for, and is what the rules check. Generating a new one cuts off the old.
 */
export const shortcutSetup = async (regenerate = false) => {
  if (!uid) throw new Error("Not signed in");
  const ref = doc(db(), "users", uid, "config", "health");
  const existing = regenerate ? null : (await getDoc(ref)).data()?.key;
  let key = typeof existing === "string" ? existing : "";
  if (!key) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    await setDoc(ref, { key });
  }
  return { uid, projectId: config.projectId ?? "", apiKey: config.apiKey ?? "", key };
};
