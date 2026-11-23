/**
 * Sends the evening reminders. GitHub Actions starts it, and with LOOP_MINUTES set it keeps checking
 * every 15 minutes for that long, because GitHub's own schedule can leave hours between runs.
 * It reads each person's data and the devices they turned reminders on for, and sends a push only
 * when `planReminder` says so. Set DRY_RUN=1 to see what would be sent without sending.
 *
 * Needs FIREBASE_SERVICE_ACCOUNT: the JSON key of a Firebase service account.
 *
 * Before deciding, it catches up on what the connections know but the app hasn't seen yet, since the app
 * only syncs while open: Apple Health always, and Library and Anki when their sign-ins are set
 * (LIBRARY_EMAIL, LIBRARY_PASSWORD, LIBRARY_SUPABASE_URL, LIBRARY_SUPABASE_ANON_KEY, ANKI_EMAIL,
 * ANKI_PASSWORD, ANKI_FIREBASE_PROJECT_ID, ANKI_FIREBASE_API_KEY), for the account in CONNECTIONS_UID.
 * This is only to decide; nothing is written back to anyone's data.
 */
import { gunzipSync } from "node:zlib";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { readAnkiCloud } from "../src/lib/anki-cloud";
import { importAnki } from "../src/lib/engine/anki";
import { resolveTz, todayIn } from "../src/lib/engine/dates";
import { importHealth } from "../src/lib/engine/health";
import { importLibrary } from "../src/lib/engine/library";
import { healthDay } from "../src/lib/health-num";
import { fetchLibrary } from "../src/lib/library-fetch";
import { migrate } from "../src/lib/migrate";
import { planReminder, reminderDue } from "../src/lib/reminders";
import type { AppData } from "../src/lib/types";

const key = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!key) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
const dryRun = process.env.DRY_RUN === "1";
/** The time of the current check. Set again before each one. */
let now = process.env.REMIND_NOW ? new Date(process.env.REMIND_NOW) : new Date();
const loopMinutes = Number(process.env.LOOP_MINUTES || 0);
const EVERY_MS = 15 * 60_000;

initializeApp({ credential: cert(JSON.parse(key)) });
const db = getFirestore();
const messaging = getMessaging();

interface DeviceDoc {
  token: string;
  timeZone: string;
  hour: number;
}

const env = (name: string) => process.env[name]?.trim() || "";

/** Brings in what the connections have that the saved data doesn't yet. Each one that fails is skipped. */
const catchUp = async (user: DocumentReference, saved: AppData, deviceTz: string): Promise<AppData> => {
  let data = saved;
  const tz = saved.settings.timezone === "auto" ? deviceTz : resolveTz(saved.settings.timezone);
  const today = todayIn(tz, now);
  const at = now.getTime();

  try {
    const from = new Date(at - 3 * 86_400_000).toLocaleDateString("en-CA", { timeZone: tz });
    const snap = await user.collection("health").where(FieldPath.documentId(), ">=", from).get();
    const days = snap.docs.map((d) => healthDay(d.id, d.data()));
    data = { ...data, logs: importHealth({ days, goals: data.goals, logs: data.logs, today, tz, now: at }).logs };
  } catch (error) {
    console.error("Health catch-up skipped:", (error as Error).message);
  }

  if (user.id !== env("CONNECTIONS_UID")) return data;

  if (data.library && env("LIBRARY_EMAIL") && env("LIBRARY_PASSWORD") && env("LIBRARY_SUPABASE_URL") && env("LIBRARY_SUPABASE_ANON_KEY")) {
    try {
      const feed = await fetchLibrary({
        url: new URL(env("LIBRARY_SUPABASE_URL")).origin,
        anonKey: env("LIBRARY_SUPABASE_ANON_KEY"),
        email: env("LIBRARY_EMAIL"),
        password: env("LIBRARY_PASSWORD"),
        person: (env("LIBRARY_PERSON") || "chikaze").toLowerCase(),
      });
      const r = importLibrary({ feed, goalId: data.library.goalId, seen: data.library.seen, goals: data.goals, logs: data.logs, today, tz, now: at });
      data = { ...data, logs: r.logs, goals: r.goals };
    } catch (error) {
      console.error("Library catch-up skipped:", (error as Error).message);
    }
  }

  if (data.anki && env("ANKI_EMAIL") && env("ANKI_PASSWORD") && env("ANKI_FIREBASE_PROJECT_ID") && env("ANKI_FIREBASE_API_KEY")) {
    const check = await readAnkiCloud({ projectId: env("ANKI_FIREBASE_PROJECT_ID"), apiKey: env("ANKI_FIREBASE_API_KEY"), email: env("ANKI_EMAIL"), password: env("ANKI_PASSWORD") });
    if (check.available) {
      const r = importAnki({ feed: check.feed, mapping: data.anki.mapping, goals: data.goals, logs: data.logs, today, tz, now: at });
      data = { ...data, logs: r.logs, goals: r.goals };
    } else console.error("Anki catch-up skipped:", "reason" in check ? check.reason : "");
  }
  return data;
};

const main = async () => {
  let sent = 0;
  for (const user of await db.collection("users").listDocuments()) {
    const devices = await user.collection("devices").get();
    if (devices.empty) continue;

    const state = await user.collection("sync").doc("state").get();
    if (!state.exists) continue;
    const gz = state.get("gz") as string | undefined;
    const text = gz ? gunzipSync(Buffer.from(gz, "base64")).toString("utf8") : (state.get("json") as string);
    const saved = migrate(JSON.parse(text)) as AppData;

    const reminderDoc = user.collection("sync").doc("reminder");
    let data: AppData | null = null;
    const lastSent = ((await reminderDoc.get()).get("date") as string | undefined) ?? null;

    // One reminder a day per person. A device with its own hour decides when it is due.
    let reminderDate: string | null = null;
    let delivered = false;
    for (const device of devices.docs) {
      const { token, timeZone, hour } = device.data() as DeviceDoc;
      // The connections are only asked once a device is due, not on every run.
      if (!reminderDue({ data: saved, deviceTimezone: timeZone, hour, now, lastSent })) continue;
      data ??= await catchUp(user, saved, timeZone);
      const reminder = planReminder({ data, deviceTimezone: timeZone, hour, now, lastSent });
      if (!reminder) continue;
      reminderDate ??= reminder.date;
      console.log(`${dryRun ? "[dry run] " : ""}${user.id} · ${device.id.slice(0, 6)}: ${reminder.title} — ${reminder.body}`);
      if (dryRun) continue;
      try {
        await messaging.send({
          token,
          data: { title: reminder.title, body: reminder.body, url: "/", tag: `lifeos-${reminder.date}` },
          webpush: { headers: { Urgency: "high", TTL: "7200" } },
        });
        sent++;
        delivered = true;
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        // The phone uninstalled the app or turned notifications off, so forget it.
        if (code.includes("registration-token-not-registered")) await device.ref.delete();
        else console.error(`Could not send to ${device.id.slice(0, 6)}:`, code);
      }
    }
    // Only a reminder that reached a device counts, so a failed night is tried again.
    if (reminderDate && delivered && !dryRun) await reminderDoc.set({ date: reminderDate, sentAt: now.toISOString() });
  }
  console.log(`${dryRun ? "Dry run" : "Done"}: ${sent} sent.`);
};

/** One check, or one every 15 minutes until LOOP_MINUTES is up. A failed check doesn't stop the next. */
const run = async () => {
  if (!loopMinutes) return main();
  const until = Date.now() + loopMinutes * 60_000;
  for (;;) {
    now = new Date();
    await main().catch((error) => console.error("Check failed:", error));
    if (Date.now() + EVERY_MS > until) return;
    await new Promise((resolve) => setTimeout(resolve, EVERY_MS));
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
