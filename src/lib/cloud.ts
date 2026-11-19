"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { deleteDoc, doc, getFirestore, runTransaction, setDoc } from "firebase/firestore";
import { parseImport } from "./io";

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
export const signUp = (email: string, password: string) => createUserWithEmailAndPassword(auth(), email, password);
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

/** The whole of one person's data lives in one document as text, so Firestore's field rules never reject it. */
interface Stored {
  revision: number;
  savedAt: string;
  json: string;
}

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
  return { exists: true, revision: stored.revision, savedAt: stored.savedAt, data: JSON.parse(stored.json) };
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

  return runTransaction(db(), async (tx) => {
    const snap = await tx.get(stateRef(owner));
    const current = snap.exists() ? (snap.data() as Stored) : null;
    const daily = backupRef(owner, `daily-${localDay()}`);
    const dailySnap = current ? await tx.get(daily) : null;

    if (current && baseRevision !== current.revision) {
      tx.set(backupRef(owner, `conflict-${stamp()}`), { savedAt, json });
      return { status: "conflict" as const, revision: current.revision };
    }

    if (current) {
      if (dailySnap && !dailySnap.exists()) tx.set(daily, { savedAt: current.savedAt, json: current.json });
      // Resets, imports and deleted goals are the moves worth being able to undo.
      const before = (JSON.parse(current.json) as { logs?: unknown[] }).logs?.length ?? 0;
      const after = (data as { logs?: unknown[] }).logs?.length ?? 0;
      if (after < before) tx.set(backupRef(owner, `safety-${stamp()}`), { savedAt: current.savedAt, json: current.json });
    }

    const revision = (current?.revision ?? 0) + 1;
    tx.set(stateRef(owner), { revision, savedAt, json } satisfies Stored);
    return { status: "saved" as const, revision, savedAt };
  });
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

export const firebaseApp = app;
