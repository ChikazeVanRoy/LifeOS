"use client";

import { Copy, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readHealth, shortcutSetup, type HealthDay } from "@/lib/cloud";

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast.error("Couldn't copy. Select it and copy by hand.");
  }
};

/** What the Shortcut posts. Every value is sent as text because that is what Shortcuts can do. */
const BODY = `{"fields":{"steps":{"stringValue":"STEPS"},"weight":{"stringValue":"WEIGHT"},"workoutMinutes":{"stringValue":"WORKOUT_MINUTES"},"sleepHours":{"stringValue":"SLEEP_HOURS"}}}`;

const Value = ({ label, value, secret }: { label: string; value: string; secret?: boolean }) => {
  const [shown, setShown] = useState(!secret);
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-xs">{shown ? value : "••••••••••••••••"}</p>
      </div>
      {secret && (
        <button aria-label={shown ? "Hide" : "Show"} onClick={() => setShown(!shown)} className="grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground">
          {shown ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      <button aria-label={`Copy ${label}`} onClick={() => copy(value, label)} className="grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground"><Copy size={14} /></button>
    </div>
  );
};

const cell = (n: number | undefined, digits = 0) => (n === undefined ? "–" : n.toLocaleString(undefined, { maximumFractionDigits: digits }));

/** Apple Health can't be read by a website, so an iPhone Shortcut sends the day's numbers here. */
export function HealthPanel() {
  const [days, setDays] = useState<HealthDay[] | null>(null);
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    readHealth(7).then(setDays, () => setDays([]));
  }, []);

  const s = setup ? shortcutSetup() : null;
  const url = s ? `https://firestore.googleapis.com/v1/projects/${s.projectId}/databases/(default)/documents/users/${s.uid}/health/` : "";

  return (
    <div className="space-y-3 py-3">
      <div>
        <p className="text-sm">Apple Health</p>
        <p className="text-xs text-muted-foreground">A Shortcut on your iPhone sends each day&apos;s steps, weight, workouts and sleep here. Nothing else leaves Health.</p>
      </div>

      {days === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : days.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing received yet.</p>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead className="text-muted-foreground">
            <tr className="text-left"><th className="py-1 font-normal">Day</th><th className="font-normal">Steps</th><th className="font-normal">Weight</th><th className="font-normal">Workout min</th><th className="font-normal">Sleep h</th></tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-t">
                <td className="py-1.5">{d.date}</td><td>{cell(d.steps)}</td><td>{cell(d.weight, 1)}</td><td>{cell(d.workoutMinutes)}</td><td>{cell(d.sleepHours, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Button variant="secondary" size="sm" onClick={() => setSetup(!setup)}>{setup ? "Hide setup" : "Set up the Shortcut"}</Button>

      {s && (
        <div className="space-y-3 rounded-xl border p-3 text-xs">
          <p className="text-muted-foreground">
            The Shortcut signs in with the key below instead of your password. Anyone with it can use your account, so do not share it.
            Changing your password stops it working.
          </p>
          <div className="divide-y">
            <Value label="API key" value={s.apiKey} />
            <Value label="Sign-in key" value={s.refreshToken} secret />
            <Value label="Address to send to (add the date, yyyy-MM-dd, at the end)" value={url} />
            <Value label="Message body" value={BODY} />
          </div>
          <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
            <li>Open Shortcuts and make a new shortcut. Add <b>Format Date</b> on the current date with the custom format <code>yyyy-MM-dd</code>. This is the day.</li>
            <li>Add <b>Find Health Samples</b> for Step Count starting today, then <b>Calculate Statistics</b> (Sum). Do the same for Workouts (sum of Duration in minutes). Weight and Sleep are optional.</li>
            <li>Add <b>Get Contents of URL</b>: address <code>https://securetoken.googleapis.com/v1/token?key=</code> plus the API key, method POST, request body Form with <code>grant_type</code> = <code>refresh_token</code> and <code>refresh_token</code> = the sign-in key.</li>
            <li>Add <b>Get Dictionary Value</b> for <code>id_token</code>.</li>
            <li>Add a <b>Text</b> with the message body, replacing STEPS and the others with the matching results. Leave out lines you do not have.</li>
            <li>Add <b>Get Contents of URL</b>: the address to send to plus the day, method PATCH, header <code>Authorization</code> = <code>Bearer </code> plus the id_token, header <code>Content-Type</code> = <code>application/json</code>, request body File = the Text.</li>
            <li>In Automation, make a Personal Automation to run it daily at, say, 9 PM, and turn off Ask Before Running.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
