import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest } from "@/lib/engine/anki";
import type { LibraryCheck } from "@/lib/engine/library";
import { fetchLibrary, LibraryError, readConfig } from "@/lib/server/library";

/**
 * A narrow, read-only bridge to Our Library. It signs in with the credentials in this
 * computer's environment, answers this computer only, and sends back reading status,
 * page counts and finish dates, never ratings, reviews, prices or the password.
 */
const unavailable = (reason: string) => NextResponse.json({ available: false, reason } satisfies LibraryCheck);

export const GET = async (request: NextRequest) => {
  if (!isLocalRequest(request.headers)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const feed = await fetchLibrary(await readConfig());
    return NextResponse.json({ available: true, feed } satisfies LibraryCheck);
  } catch (e) {
    if (e instanceof LibraryError) return unavailable(e.message);
    return unavailable("Library could not be reached. Check the internet connection.");
  }
};
