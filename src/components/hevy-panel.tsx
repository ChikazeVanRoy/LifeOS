"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDerived } from "@/components/shell/providers";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { fmtFull } from "@/lib/engine/dates";
import { importHevy, suggestHevyGoal, type HevyFeed } from "@/lib/engine/hevy";
import { checkHevy, syncHevy } from "@/lib/hevy-sync";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { fmtHours, plural } from "@/lib/utils";

function Connect({ feed }: { feed: HevyFeed }) {
  const data = useStore((s) => s.data);
  const d = useDerived();
  const { connectHevy } = useStore.getState();
  const [goalId, setGoalId] = useState(() => suggestHevyGoal(d.goals.map((g) => g.goal)) ?? "");

  const preview = useMemo(
    () => (goalId ? importHevy({ feed, goalId, goals: data.goals, logs: data.logs, today: d.today, tz: d.tz, weightUnit: data.settings.weightUnit, now: 0 }) : null),
    [feed, goalId, data.goals, data.logs, data.settings.weightUnit, d.today, d.tz],
  );

  return (
    <div className="space-y-3 py-3">
      <div>
        <p className="text-sm">Hevy</p>
        <p className="text-xs text-muted-foreground">Hevy is reachable. Choose the goal your workouts count towards.</p>
      </div>
      <select
        aria-label="Goal for Hevy workouts"
        value={goalId}
        onChange={(e) => setGoalId(e.target.value)}
        className="h-9 max-w-64 rounded-xl border bg-transparent px-2 text-sm"
      >
        <option value="">Choose a goal</option>
        {d.goals.map((g) => <option key={g.goal.id} value={g.goal.id}>{g.goal.name}</option>)}
      </select>
      {preview && preview.workouts > 0 ? (
        <p className="text-xs text-muted-foreground">
          This adds <b className="num font-medium text-foreground">{plural(preview.workouts, "workout")}</b> and <b className="num font-medium text-foreground">{fmtHours(preview.minutes)}</b>
          {preview.since ? `, going back to ${fmtFull(preview.since)}` : ""}. Streaks and achievements will update to include them.
          {preview.skippedDays > 0 && ` ${preview.skippedDays === 1 ? "1 day already logged by hand stays as it is." : `${preview.skippedDays} days already logged by hand stay as they are.`}`}
          {" "}Only times, exercises, sets, reps and weights come across, never notes.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{goalId ? "No workouts to import yet. New ones will come in as you log them." : "Choose a goal to continue."}</p>
      )}
      <Button
        size="sm"
        disabled={!goalId}
        onClick={() => {
          const r = connectHevy(feed, goalId);
          toast.success(`Imported ${plural(r.workouts, "workout")} from Hevy`);
        }}
      >
        <Check /> Connect
      </Button>
    </div>
  );
}

function Connected() {
  const link = useStore((s) => s.data.hevy)!;
  const logs = useStore((s) => s.data.logs);
  const check = useUI((s) => s.hevyCheck);
  const d = useDerived();
  const { disconnectHevy } = useStore.getState();
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const imported = logs.filter((l) => l.source === "hevy");
  const minutes = imported.reduce((s, l) => s + l.minutes, 0);
  const goal = d.byId.get(link.goalId)?.goal.name;
  const status = !check ? "Checking…" : check.available ? "Up to date with Hevy." : check.reason;

  return (
    <div className="space-y-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm">Hevy <span className="text-muted-foreground">· connected to {goal ?? "no goal"}</span></p>
          <p className="num text-xs text-muted-foreground">{plural(imported.length, "workout")} · {fmtHours(minutes)}</p>
          <p className="text-xs text-muted-foreground">{status}</p>
          <p className="text-xs text-muted-foreground">Workouts edited or deleted in Hevy are updated here too.</p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await syncHevy();
              setBusy(false);
              if (r.available) toast.success("Hevy is synced");
              else toast.error(r.reason);
            }}
          >
            <RefreshCw className={busy ? "animate-spin" : undefined} /> Sync
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLeaving(true)}>Disconnect</Button>
        </div>
      </div>

      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Hevy?</AlertDialogTitle>
            <AlertDialogDescription>
              Your {plural(imported.length, "imported workout")} can stay as ordinary entries you can edit, or be removed from LifeOS. Hevy is not affected either way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => disconnectHevy(false)}>Remove history</AlertDialogAction>
            <AlertDialogAction onClick={() => disconnectHevy(true)}>Keep history</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function HevyPanel() {
  const linked = useStore((s) => !!s.data.hevy);
  const mode = useStore((s) => s.mode);
  const check = useUI((s) => s.hevyCheck);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (mode === "real") void checkHevy();
  }, [mode]);

  if (mode === "demo") {
    return (
      <div className="flex min-h-14 items-center justify-between gap-4 py-3">
        <div><p className="text-sm">Hevy</p><p className="text-xs text-muted-foreground">Exit demo mode to connect.</p></div>
        <span className="text-xs text-muted-foreground">Not connected</span>
      </div>
    );
  }
  if (linked) return <Connected />;
  if (check?.available) return <Connect key={check.feed.generatedAt} feed={check.feed} />;
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <p className="text-sm">Hevy</p>
        <p className="text-xs text-muted-foreground">{check ? check.reason : "Looking for Hevy…"}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          await checkHevy();
          setRetrying(false);
        }}
      >
        Check again
      </Button>
    </div>
  );
}
