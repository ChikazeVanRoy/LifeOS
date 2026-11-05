import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest } from "@/lib/engine/anki";
import { parseImport } from "@/lib/io";
import { countBackups, dataDir, dataPath, readDataFile, writeDataFile } from "@/lib/server/datafile";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** The saved file. With `?check=1`, only whether it has moved on. */
export async function GET(request: NextRequest) {
  if (!isLocalRequest(request.headers)) return forbidden();
  const dir = dataDir();
  const file = await readDataFile(dir);
  const about = { path: dataPath(dir), backups: await countBackups(dir) };
  if (!file) return NextResponse.json({ exists: false, ...about });
  const { revision, savedAt, recovered } = file;
  const check = request.nextUrl.searchParams.has("check");
  return NextResponse.json({ exists: true, revision, savedAt, recovered, ...about, ...(check ? {} : { data: file.data }) });
}

export async function PUT(request: NextRequest) {
  // Sites cannot add a custom header across origins without a preflight, which this route never approves.
  if (!isLocalRequest(request.headers) || request.headers.get("x-requested-by") !== "lifeos") return forbidden();
  let body: { baseRevision?: number | null; data?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Not valid JSON" }, { status: 400 });
  }
  if (!body.data) return NextResponse.json({ error: "No data" }, { status: 400 });

  // Nothing malformed may replace good data. A running timer is valid here, but not in a backup.
  const checked = parseImport(JSON.stringify({ data: { ...body.data, timer: null } }));
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const dir = dataDir();
  const result = await writeDataFile(dir, body.baseRevision ?? null, body.data);
  return NextResponse.json({ ...result, backups: await countBackups(dir) }, { status: result.status === "conflict" ? 409 : 200 });
}
