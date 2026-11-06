import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest } from "@/lib/engine/anki";

const run = promisify(execFile);
const git = (...args: string[]) => run("git", args, { cwd: process.cwd(), timeout: 30_000 }).then((r) => r.stdout.trim());

const allowed = (request: NextRequest) => isLocalRequest(request.headers) && request.headers.get("x-requested-by") === "lifeos";

/** How many commits on GitHub this copy doesn't have. */
export async function GET(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await git("fetch", "--quiet");
    return NextResponse.json({ behind: Number(await git("rev-list", "--count", "HEAD..@{u}")) });
  } catch {
    return NextResponse.json({ behind: 0, error: "Couldn't check. Are you online?" });
  }
}

/** git pull, but only when it's a plain fast-forward, so it can never overwrite local work. */
export async function POST(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const out = await git("pull", "--ff-only");
    const same = /already up to date/i.test(out);
    return NextResponse.json({ ok: true, message: same ? "Already up to date." : "Updated. Close LifeOS and open it again to use the new version." });
  } catch {
    return NextResponse.json({ ok: false, message: "Couldn't update. This copy has changes of its own, or you're offline." });
  }
}
