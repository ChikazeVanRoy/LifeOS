import { execFile } from "node:child_process";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest } from "@/lib/engine/anki";
import { dataDir, dataPath } from "@/lib/server/datafile";

/** Shows the data file in Finder. */
export async function POST(request: NextRequest) {
  if (!isLocalRequest(request.headers) || request.headers.get("x-requested-by") !== "lifeos") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (process.platform === "darwin") execFile("open", ["-R", dataPath(dataDir())], () => undefined);
  return NextResponse.json({ ok: true });
}
