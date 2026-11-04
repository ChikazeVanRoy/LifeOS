"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDerived } from "@/components/shell/providers";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { checkAnki, syncAnki } from "@/lib/anki-sync";
import { formatDayStart, importAnki, suggestMapping, type AnkiFeed } from "@/lib/engine/anki";
import { fmtFull } from "@/lib/engine/dates";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { fmtHours, plural } from "@/lib/utils";

function DeckMapper({ feed, mapping, onChange }: { feed: AnkiFeed; mapping: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
  const d = useDerived();
  const totals = useMemo(() => {
    const out = new Map<string, { reviews: number; seconds: number }>();
    for (const r of feed.daily) {
      const t = out.get(r.deckId) ?? { reviews: 0, seconds: 0 };
      t.reviews += r.reviews;
      t.seconds += r.studySeconds;
      out.set(r.deckId, t);
    }
    return out;
  }, [feed]);

  const decks = feed.decks.filter((deck) => totals.has(deck.id));
  return (
    <div className="divide-y rounded-2xl border px-3">
      {decks.map((deck) => {
        const t = totals.get(deck.id);
        return (
          <div key={deck.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm">{deck.name}</p>
              <p className="num text-xs text-muted-foreground">{fmtHours((t?.seconds ?? 0) / 60)} · {plural(t?.reviews ?? 0, "review")}</p>
            </div>
            <select
              aria-label={`Goal for ${deck.name}`}
              value={mapping[deck.id] ?? ""}
              onChange={(e) => {
                const next = { ...mapping };
                delete next[deck.id];
                onChange(e.target.value ? { ...next, [deck.id]: e.target.value } : next);
              }}
              className="h-9 max-w-44 rounded-xl border bg-transparent px-2 text-sm"
            >
              <option value="">Don&apos;t import</option>
              {d.goals.map((g) => <option key={g.goal.id} value={g.goal.id}>{g.goal.name}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function Connect({ feed }: { feed: AnkiFeed }) {
  const data = useStore((s) => s.data);
  const d = useDerived();
  const { connectAnki } = useStore.getState();
  const [mapping, setMapping] = useState(() => suggestMapping(feed, d.goals.map((g) => g.goal)));

  const preview = useMemo(
    () => importAnki({ feed, mapping, goals: data.goals, logs: data.logs, today: d.today, tz: d.tz, now: 0 }),
    [feed, mapping, data.goals, data.logs, d.today, d.tz],
  );
  const first = preview.logs.filter((l) => l.source === "anki").map((l) => l.date).sort()[0];

  return (
    <div className="space-y-3 py-3">
      <div>
        <p className="text-sm">Anki</p>
        <p className="text-xs text-muted-foreground">Anki Analytics is running. Choose which decks feed which goals.</p>
      </div>
      <DeckMapper feed={feed} mapping={mapping} onChange={setMapping} />
      {preview.days > 0 ? (
        <p className="text-xs text-muted-foreground">
          This adds <b className="num font-medium text-foreground">{plural(preview.days, "daily session")}</b>, <b className="num font-medium text-foreground">{fmtHours(preview.minutes)}</b> and <b className="num font-medium text-foreground">{plural(preview.reviews, "review")}</b>{first ? ` going back to ${fmtFull(first)}` : ""}. Levels, streaks and achievements will update to include them.
          {preview.skippedDays > 0 && ` ${preview.skippedDays === 1 ? "1 day already logged by hand stays as it is." : `${preview.skippedDays} days already logged by hand stay as they are.`}`}
          {" "}Only daily totals come across, never card text.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Choose a goal for at least one deck.</p>
      )}
      <Button
        size="sm"
        disabled={preview.days === 0}
        onClick={() => {
          const r = connectAnki(feed, mapping);
          toast.success(`Imported ${plural(r.days, "daily session")} from Anki`);
        }}
      >
        <Check /> Import full history
      </Button>
    </div>
  );
}

function Connected({ feed }: { feed: AnkiFeed | null }) {
  const link = useStore((s) => s.data.anki)!;
  const logs = useStore((s) => s.data.logs);
  const check = useUI((s) => s.ankiCheck);
  const d = useDerived();
  const { remapAnki, disconnectAnki } = useStore.getState();
  const [editing, setEditing] = useState(false);
  const [mapping, setMapping] = useState(link.mapping);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const imported = logs.filter((l) => l.source === "anki");
  const minutes = imported.reduce((s, l) => s + l.minutes, 0);
  const reviews = imported.reduce((s, l) => s + (l.metrics.reviews ?? 0), 0);
  const names = [...new Set(Object.values(link.mapping))].map((id) => d.byId.get(id)?.goal.name).filter(Boolean).join(", ");

  const status = !check
    ? "Checking…"
    : !check.available
      ? check.reason
      : check.ankiRunning
        ? "Anki is open. Quit it to bring in today's reviews."
        : "Up to date with your last Anki session.";

  return (
    <div className="space-y-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm">Anki <span className="text-muted-foreground">· connected to {names || "no goals"}</span></p>
          <p className="num text-xs text-muted-foreground">{fmtHours(minutes)} · {plural(reviews, "review")} · {plural(imported.length, "daily session")}</p>
          <p className="text-xs text-muted-foreground">{status}</p>
          <p className="text-xs text-muted-foreground">Days follow Anki&apos;s, which start at {formatDayStart(link.dayStartHour)}.</p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await syncAnki();
              setBusy(false);
              if (r.available) toast.success("Anki is synced");
              else toast.error(r.reason);
            }}
          >
            <RefreshCw className={busy ? "animate-spin" : undefined} /> Sync
          </Button>
          {feed && <Button variant="secondary" size="sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>Decks</Button>}
          <Button variant="ghost" size="sm" onClick={() => setLeaving(true)}>Disconnect</Button>
        </div>
      </div>
      {editing && feed && (
        <div className="space-y-2">
          <DeckMapper feed={feed} mapping={mapping} onChange={setMapping} />
          <Button
            size="sm"
            onClick={() => {
              remapAnki(feed, mapping);
              setEditing(false);
              toast.success("Deck choices saved");
            }}
          >
            Save deck choices
          </Button>
        </div>
      )}

      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Anki?</AlertDialogTitle>
            <AlertDialogDescription>
              Your {plural(imported.length, "imported session")} can stay as ordinary entries you can edit, or be removed from LifeOS. Anki and Anki Analytics are not affected either way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => disconnectAnki(false)}>Remove history</AlertDialogAction>
            <AlertDialogAction onClick={() => disconnectAnki(true)}>Keep history</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AnkiPanel() {
  const linked = useStore((s) => !!s.data.anki);
  const mode = useStore((s) => s.mode);
  const check = useUI((s) => s.ankiCheck);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (mode === "real") void checkAnki();
  }, [mode]);

  if (mode === "demo") {
    return (
      <div className="flex min-h-14 items-center justify-between gap-4 py-3">
        <div><p className="text-sm">Anki</p><p className="text-xs text-muted-foreground">Exit demo mode to connect.</p></div>
        <span className="text-xs text-muted-foreground">Not connected</span>
      </div>
    );
  }
  if (linked) return <Connected feed={check?.available ? check.feed : null} />;
  if (check?.available) return <Connect key={check.feed.generatedAt} feed={check.feed} />;
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <p className="text-sm">Anki</p>
        <p className="text-xs text-muted-foreground">{check ? check.reason : "Looking for Anki Analytics…"}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          await checkAnki();
          setRetrying(false);
        }}
      >
        Check again
      </Button>
    </div>
  );
}
