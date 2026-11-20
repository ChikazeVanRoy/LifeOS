"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDerived } from "@/components/shell/providers";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LinkForm } from "@/components/link-form";
import { Button } from "@/components/ui/button";
import { fmtFull } from "@/lib/engine/dates";
import { importLibrary, suggestLibraryGoal, type LibraryFeed } from "@/lib/engine/library";
import { checkLibrary, syncLibrary } from "@/lib/library-sync";
import { getLibraryLink, saveLibraryLink } from "@/lib/links";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { fmtHours, plural } from "@/lib/utils";

function Connect({ feed }: { feed: LibraryFeed }) {
  const data = useStore((s) => s.data);
  const d = useDerived();
  const { connectLibrary } = useStore.getState();
  const [goalId, setGoalId] = useState(() => suggestLibraryGoal(d.goals.map((g) => g.goal)) ?? "");

  const preview = useMemo(
    () => (goalId ? importLibrary({ feed, goalId, seen: {}, goals: data.goals, logs: data.logs, today: d.today, tz: d.tz, now: 0, baseline: true }) : null),
    [feed, goalId, data.goals, data.logs, d.today, d.tz],
  );
  const reading = feed.books.filter((b) => b.status === "Reading").length;

  return (
    <div className="space-y-3 py-3">
      <div>
        <p className="text-sm">Library</p>
        <p className="text-xs text-muted-foreground">Our Library is reachable. Choose the goal that your reading counts towards.</p>
      </div>
      <select
        aria-label="Goal for Library reading"
        value={goalId}
        onChange={(e) => setGoalId(e.target.value)}
        className="h-9 max-w-64 rounded-xl border bg-transparent px-2 text-sm"
      >
        <option value="">Choose a goal</option>
        {d.goals.map((g) => <option key={g.goal.id} value={g.goal.id}>{g.goal.name}</option>)}
      </select>
      {preview && preview.added + preview.books > 0 ? (
        <p className="text-xs text-muted-foreground">
          This adds <b className="num font-medium text-foreground">{plural(preview.books, "finished book")}</b>
          {preview.pages > 0 && <>, <b className="num font-medium text-foreground">{plural(preview.pages, "page")}</b></>}
          {preview.minutes > 0 && <> and <b className="num font-medium text-foreground">{fmtHours(preview.minutes)}</b></>}
          {preview.since ? `, going back to ${fmtFull(preview.since)}` : ""}. Streaks and achievements will update to include them.
          {reading > 0 && ` ${plural(reading, "book")} you're reading will be followed from their current page.`}
          {preview.skippedDays > 0 && ` ${preview.skippedDays === 1 ? "1 day already logged by hand stays as it is." : `${preview.skippedDays} days already logged by hand stay as they are.`}`}
          {preview.undated > 0 && ` ${plural(preview.undated, "finished book")} with only a month or year can't be placed on a day.`}
          {" "}Only titles, page counts, finish dates and your current page come across.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{goalId ? "Nothing to import yet. Reading you do from now on will still be followed." : "Choose a goal to continue."}</p>
      )}
      <Button
        size="sm"
        disabled={!goalId}
        onClick={() => {
          const r = connectLibrary(feed, goalId);
          toast.success(`Imported ${plural(r.added, "finished book")} from Library`);
        }}
      >
        <Check /> Connect
      </Button>
    </div>
  );
}

function LibrarySignIn({ onDone }: { onDone: () => void }) {
  const saved = getLibraryLink();
  const [busy, setBusy] = useState(false);
  return (
    <LinkForm
      busy={busy}
      note="Library's address and public key are in Library's .env.local (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY). The sign-in is your Library account. Kept on this device only, never in LifeOS's data or backups."
      fields={[
        { name: "url", label: "Library address (Supabase URL)", placeholder: "https://….supabase.co", initial: saved?.url },
        { name: "anonKey", label: "Public key", initial: saved?.anonKey },
        { name: "email", label: "Email", initial: saved?.email },
        { name: "password", label: "Password", type: "password", initial: saved?.password },
        { name: "person", label: "Whose reading to follow", initial: saved?.person ?? "chikaze" },
      ]}
      onSave={async (v) => {
        let url: string;
        try {
          const u = new URL(v.url);
          if (u.protocol !== "https:") throw new Error();
          url = u.origin;
        } catch {
          toast.error("The Library address must be a valid https address.");
          return;
        }
        saveLibraryLink({ url, anonKey: v.anonKey, email: v.email, password: v.password, person: v.person.toLowerCase() });
        setBusy(true);
        const r = await checkLibrary();
        setBusy(false);
        if (r.available) onDone();
      }}
      onForget={
        saved
          ? () => {
              saveLibraryLink(null);
              onDone();
              void checkLibrary();
            }
          : undefined
      }
    />
  );
}

function Connected() {
  const link = useStore((s) => s.data.library)!;
  const logs = useStore((s) => s.data.logs);
  const check = useUI((s) => s.libraryCheck);
  const d = useDerived();
  const { disconnectLibrary } = useStore.getState();
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);

  const imported = logs.filter((l) => l.source === "library");
  const books = imported.filter((l) => l.id.startsWith("library:done:")).length;
  const pages = imported.reduce((s, l) => s + (l.metrics.pages ?? 0), 0);
  const minutes = imported.reduce((s, l) => s + l.minutes, 0);
  const goal = d.byId.get(link.goalId)?.goal.name;
  const status = !check ? "Checking…" : check.available ? "Up to date with Library." : check.reason;

  return (
    <div className="space-y-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm">Library <span className="text-muted-foreground">· connected to {goal ?? "no goal"}</span></p>
          <p className="num text-xs text-muted-foreground">{plural(books, "finished book")} · {plural(pages, "page")} · {fmtHours(minutes)}</p>
          <p className="text-xs text-muted-foreground">{status}</p>
          <p className="text-xs text-muted-foreground">Pages you read in a book are dated the day LifeOS sees your page move.</p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await syncLibrary();
              setBusy(false);
              if (r.available) toast.success("Library is synced");
              else toast.error(r.reason);
            }}
          >
            <RefreshCw className={busy ? "animate-spin" : undefined} /> Sync
          </Button>
          {(!check || !check.available || getLibraryLink()) && (
            <Button variant="secondary" size="sm" aria-expanded={signing} onClick={() => setSigning((v) => !v)}>Sign-in</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setLeaving(true)}>Disconnect</Button>
        </div>
      </div>

      {signing && <LibrarySignIn onDone={() => setSigning(false)} />}

      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Library?</AlertDialogTitle>
            <AlertDialogDescription>
              Your {plural(imported.length, "imported entry", "imported entries")} can stay as ordinary entries you can edit, or be removed from LifeOS. Library is not affected either way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => disconnectLibrary(false)}>Remove history</AlertDialogAction>
            <AlertDialogAction onClick={() => disconnectLibrary(true)}>Keep history</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function LibraryPanel() {
  const linked = useStore((s) => !!s.data.library);
  const mode = useStore((s) => s.mode);
  const check = useUI((s) => s.libraryCheck);
  const [retrying, setRetrying] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (mode === "real") void checkLibrary();
  }, [mode]);

  if (mode === "demo") {
    return (
      <div className="flex min-h-14 items-center justify-between gap-4 py-3">
        <div><p className="text-sm">Library</p><p className="text-xs text-muted-foreground">Exit demo mode to connect.</p></div>
        <span className="text-xs text-muted-foreground">Not connected</span>
      </div>
    );
  }
  if (linked) return <Connected />;
  if (check?.available) return <Connect key={check.feed.generatedAt} feed={check.feed} />;
  const saved = getLibraryLink();
  return (
    <div>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <div className="min-w-0">
          <p className="text-sm">Library</p>
          <p className="text-xs text-muted-foreground">{check ? check.reason : "Looking for Library…"}</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" aria-expanded={signing} onClick={() => setSigning((v) => !v)}>
            {saved ? "Sign-in" : "Connect"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              await checkLibrary();
              setRetrying(false);
            }}
          >
            Check again
          </Button>
        </div>
      </div>
      {signing && <LibrarySignIn onDone={() => setSigning(false)} />}
    </div>
  );
}
