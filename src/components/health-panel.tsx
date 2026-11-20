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
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof shortcutSetup>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    readHealth(7).then(setDays, (e) => {
      setFailed(e instanceof Error ? e.message : String(e));
      setDays([]);
    });
  }, []);

  const open = async (regenerate = false) => {
    setBusy(true);
    try {
      setSetup(await shortcutSetup(regenerate));
    } catch {
      toast.error("Couldn't load the setup. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const s = setup;
  const start = s ? `https://firestore.googleapis.com/v1/projects/${s.projectId}/databases/(default)/documents/users/${s.uid}/health/` : "";
  /** Every value is sent as text, because that is what Shortcuts can do. */
  const body = s ? `{"fields":{"key":{"stringValue":"${s.key}"},"steps":{"stringValue":"STEPS"},"workoutMinutes":{"stringValue":"MINUTES"}}}` : "";

  return (
    <div className="space-y-3 py-3">
      <div>
        <p className="text-sm">Apple Health</p>
        <p className="text-xs text-muted-foreground">A Shortcut on your iPhone sends each day&apos;s steps and exercise minutes here. Nothing else leaves Health.</p>
      </div>

      {days === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : days.length === 0 ? (
        <p className="text-xs text-muted-foreground">{failed ? `Couldn't read the numbers: ${failed}` : "Nothing received yet."}</p>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead className="text-muted-foreground">
            <tr className="text-left"><th className="py-1 font-normal">Day</th><th className="font-normal">Steps</th><th className="font-normal">Weight</th><th className="font-normal">Exercise min</th><th className="font-normal">Sleep h</th></tr>
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

      <Button variant="secondary" size="sm" disabled={busy} onClick={() => (s ? setSetup(null) : open())}>{s ? "Hide setup" : "Set up the Shortcut"}</Button>

      {s && (
        <div className="space-y-3 rounded-xl border p-3 text-xs">
          <p className="text-muted-foreground">
            The Shortcut proves it is you with the secret key inside the message below. It can only add these health numbers. It cannot read
            anything. If the key leaks, make a new one and paste it in again.
          </p>
          <div className="divide-y">
            <Value label="Address, first part" value={start} />
            <Value label="Address, last part" value={`?key=${s.apiKey}`} />
            <Value label="Message" value={body} />
          </div>
          <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
            <li>In Shortcuts, make a new shortcut. Add <b>Format Date</b> on the current date, Date Format Custom, <code>yyyy-MM-dd</code>.</li>
            <li>Add <b>Number</b> <code>0</code> then <b>Set Variable</b> <code>Steps</code>. Add <b>Number</b> <code>0</code> then <b>Set Variable</b> <code>Minutes</code>.</li>
            <li>Add <b>Find Health Samples</b>: Type Step Count, Start Date <b>is today</b>, Group By <b>Day</b>. Add <b>If</b> it has any value, then <b>Get Details of Health Sample</b> (Value), <b>Calculate Statistics</b> (Sum), <b>Set Variable</b> <code>Steps</code>, <b>End If</b>.</li>
            <li>Add <b>Find Health Samples</b>: Type Exercise Minutes, Start Date <b>is today</b>, Group By <b>Day</b>. Add <b>If</b> it has any value, then <b>Get Details of Health Sample</b> (Value, not Duration), <b>Calculate Statistics</b> (Sum), <b>Set Variable</b> <code>Minutes</code>, <b>End If</b>.</li>
            <li className="list-none">Group By Day makes Health add up your iPhone and Apple Watch the way the Health app does, so the same steps aren&apos;t counted twice. <b>Is today</b> starts at midnight, while &quot;in the last 1 days&quot; reaches back into yesterday.</li>
            <li>Add <b>Text</b>: paste the message. Replace <code>STEPS</code> and <code>MINUTES</code> by tapping the <code>Steps</code> and <code>Minutes</code> variables.</li>
            <li>Add <b>Get Contents of URL</b>. For the address, paste the first part, then the <b>Formatted Date</b> variable, then paste the last part. Method <b>PATCH</b>, header <code>Content-Type</code> = <code>application/json</code>, request body <b>File</b> = the Text.</li>
            <li>Run it once and check this page. Then add a Personal Automation, Time of Day, 11:55 PM, Run Immediately.</li>
          </ol>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => open(true)}>Make a new key</Button>
        </div>
      )}
    </div>
  );
}
