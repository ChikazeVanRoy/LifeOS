import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest, parseFeed, type AnkiCheck } from "@/lib/engine/anki";

/**
 * A narrow bridge to Anki Analytics, which refuses other websites by design. It runs on
 * this computer only, and forwards daily totals and deck names, never card text.
 */
const BASE = process.env.ANKI_ANALYTICS_URL ?? "http://127.0.0.1:5174";

const unavailable = (reason: string) => NextResponse.json({ available: false, reason } satisfies AnkiCheck);

const check = async (read: () => Promise<Response>) => {
  const statusResponse = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
  if (!statusResponse.ok) return unavailable("Anki Analytics did not answer as expected.");
  const status = (await statusResponse.json()) as { ankiRunning?: boolean; updateAvailable?: boolean };

  const response = await read();
  if (response.status === 404 || response.status === 503) return unavailable("Anki Analytics has no saved stats yet. Open it once, then try again.");
  if (!response.ok) return unavailable("Anki Analytics could not read your stats.");

  const feed = parseFeed(await response.json());
  if (!feed) return unavailable("This version of Anki Analytics sends data LifeOS does not recognise.");
  return NextResponse.json({
    available: true,
    ankiRunning: !!status.ankiRunning,
    updateAvailable: !!status.updateAvailable,
    feed,
  } satisfies AnkiCheck);
};

const guarded = async (request: NextRequest, run: () => Promise<NextResponse>) => {
  if (!isLocalRequest(request.headers)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch {
    return unavailable("Anki Analytics is not running on this computer.");
  }
};

/** The latest saved stats. */
export const GET = (request: NextRequest) =>
  guarded(request, () => check(() => fetch(`${BASE}/snapshot.json`, { signal: AbortSignal.timeout(4000), cache: "no-store" })));

/** Asks Anki Analytics to take a fresh copy. It only reads Anki, and refuses while Anki is open. */
export const POST = (request: NextRequest) =>
  guarded(request, () => {
    // Sites cannot add a custom header across origins without a preflight, which this route never approves.
    if (request.headers.get("x-requested-by") !== "lifeos") return Promise.resolve(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    return check(async () => {
      const refreshed = await fetch(`${BASE}/api/refresh`, {
        method: "POST",
        headers: { "x-requested-by": "anki-analytics" },
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      // Anki was opened in the meantime: the saved stats are still true.
      return refreshed.status === 409 ? fetch(`${BASE}/snapshot.json`, { signal: AbortSignal.timeout(4000), cache: "no-store" }) : refreshed;
    });
  });
