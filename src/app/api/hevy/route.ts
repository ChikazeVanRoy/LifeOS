import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest } from "@/lib/engine/anki";
import type { HevyCheck } from "@/lib/engine/hevy";
import { fetchHevy, HevyError, readKey } from "@/lib/server/hevy";

/**
 * A narrow, read-only bridge to Hevy. It uses the API key in this computer's environment,
 * answers this computer only, and sends back workout times, exercises and sets, never
 * notes, routines or the key.
 */
const unavailable = (reason: string) => NextResponse.json({ available: false, reason } satisfies HevyCheck);

export const GET = async (request: NextRequest) => {
  if (!isLocalRequest(request.headers)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const feed = await fetchHevy(readKey());
    return NextResponse.json({ available: true, feed } satisfies HevyCheck);
  } catch (e) {
    if (e instanceof HevyError) return unavailable(e.message);
    return unavailable("Hevy could not be reached. Check the internet connection.");
  }
};
