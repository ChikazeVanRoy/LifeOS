"use client";

import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { deviceTimezone } from "./engine/dates";
import { cloudEnabled, firebaseApp, removeDevice, saveDevice } from "./cloud";
import { DEFAULT_REMINDER_HOUR } from "./reminders";

/** Reminders are one device's choice, so what it chose is remembered on the device. */
const HOUR_KEY = "lifeos:push:hour";
const ID_KEY = "lifeos:push:device";
const WORKER = "/firebase-messaging-sw.js";

export type PushState = "unsupported" | "blocked" | "off" | "on";

const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const remember = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* a convenience only */
  }
};

export const reminderHour = () => Number(stored(HOUR_KEY) ?? DEFAULT_REMINDER_HOUR);

export const pushState = async (): Promise<PushState> => {
  if (!cloudEnabled || typeof Notification === "undefined" || !("serviceWorker" in navigator) || !(await isSupported().catch(() => false))) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && stored(ID_KEY) ? "on" : "off";
};

const idFor = async (token: string) => {
  const bytes = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const register = async (hour: number) => {
  const worker = await navigator.serviceWorker.register(WORKER);
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(firebaseApp()), { serviceWorkerRegistration: worker });
  if (!token) throw new Error("No push token");
  const id = await idFor(token);
  await saveDevice(id, { token, timeZone: deviceTimezone(), hour, updatedAt: new Date().toISOString() });
  remember(ID_KEY, id);
  remember(HOUR_KEY, String(hour));
};

/** Must run from a tap: iPhones only ask for permission after one. */
export const enablePush = async (hour = reminderHour()): Promise<PushState> => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  await register(hour);
  return "on";
};

export const changeHour = async (hour: number) => {
  remember(HOUR_KEY, String(hour));
  if ((await pushState()) === "on") await register(hour);
};

export const disablePush = async () => {
  const id = stored(ID_KEY);
  if (id) await removeDevice(id).catch(() => undefined);
  await deleteToken(getMessaging(firebaseApp())).catch(() => undefined);
  remember(ID_KEY, null);
};

/** A local notification, so a person can see how reminders will look without waiting for evening. */
export const showTest = async () => {
  const worker = await navigator.serviceWorker.ready;
  await worker.showNotification("LifeOS reminders are on", { body: "This is how a reminder will look.", icon: "/icon-192.png", data: { url: "/" } });
};
