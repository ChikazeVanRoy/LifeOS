/**
 * Sends the evening reminders. GitHub Actions runs it every half hour.
 * It reads each person's data and the devices they turned reminders on for, and sends a push only
 * when `planReminder` says so. Set DRY_RUN=1 to see what would be sent without sending.
 *
 * Needs FIREBASE_SERVICE_ACCOUNT: the JSON key of a Firebase service account.
 */
import { gunzipSync } from "node:zlib";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { migrate } from "../src/lib/migrate";
import { planReminder } from "../src/lib/reminders";
import type { AppData } from "../src/lib/types";

const key = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!key) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
const dryRun = process.env.DRY_RUN === "1";
const now = process.env.REMIND_NOW ? new Date(process.env.REMIND_NOW) : new Date();

initializeApp({ credential: cert(JSON.parse(key)) });
const db = getFirestore();
const messaging = getMessaging();

interface DeviceDoc {
  token: string;
  timeZone: string;
  hour: number;
}

const main = async () => {
  let sent = 0;
  for (const user of await db.collection("users").listDocuments()) {
    const devices = await user.collection("devices").get();
    if (devices.empty) continue;

    const state = await user.collection("sync").doc("state").get();
    if (!state.exists) continue;
    const gz = state.get("gz") as string | undefined;
    const text = gz ? gunzipSync(Buffer.from(gz, "base64")).toString("utf8") : (state.get("json") as string);
    const data = migrate(JSON.parse(text)) as AppData;

    const reminderDoc = user.collection("sync").doc("reminder");
    const lastSent = ((await reminderDoc.get()).get("date") as string | undefined) ?? null;

    // One reminder a day per person. A device with its own hour decides when it is due.
    let reminderDate: string | null = null;
    let delivered = false;
    for (const device of devices.docs) {
      const { token, timeZone, hour } = device.data() as DeviceDoc;
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
