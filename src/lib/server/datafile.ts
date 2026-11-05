import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The saved copy of everything. It lives outside the project and the browser, so
 * neither deleting the app nor clearing site data can touch it.
 */
export const dataDir = () =>
  process.env.LIFEOS_DATA_DIR ??
  (process.platform === "darwin" ? join(homedir(), "Library", "Application Support", "LifeOS") : join(homedir(), ".lifeos"));

const DATA_FILE = "data.json";
const KEEP_DAILY = 30;
const KEEP_OTHER = 20;

export const dataPath = (dir: string) => join(dir, DATA_FILE);

export interface StoredFile {
  revision: number;
  savedAt: string;
  data: { logs?: unknown[] } & Record<string, unknown>;
}

const parse = (text: string): StoredFile | null => {
  try {
    const file = JSON.parse(text) as StoredFile;
    return typeof file.revision === "number" && file.data ? file : null;
  } catch {
    return null;
  }
};

const backupsDir = (dir: string) => join(dir, "backups");

const listBackups = async (dir: string) => {
  try {
    return (await readdir(backupsDir(dir))).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
};

export const countBackups = async (dir: string) => (await listBackups(dir)).length;

/** The newest good copy. An unreadable main file falls back to the latest backup, and is kept for inspection. */
export const readDataFile = async (dir: string): Promise<(StoredFile & { recovered?: boolean }) | null> => {
  let text: string;
  try {
    text = await readFile(dataPath(dir), "utf8");
  } catch {
    return null;
  }
  const file = parse(text);
  if (file) return file;

  await rename(dataPath(dir), join(dir, `unreadable-${stamp()}.json`));
  const backups = await listBackups(dir);
  const newestFirst = backups.sort((a, b) => b.replace(/^\D+/, "").localeCompare(a.replace(/^\D+/, "")));
  for (const name of newestFirst) {
    const backup = parse(await readFile(join(backupsDir(dir), name), "utf8"));
    if (backup) {
      await writeAtomic(dir, DATA_FILE, JSON.stringify(backup));
      return { ...backup, recovered: true };
    }
  }
  return null;
};

const stamp = () => `${new Date().toISOString().replace(/[:.]/g, "-")}`;

/** Written beside the target, then swapped in: a crash leaves the old file or the new one, never half of one. */
const writeAtomic = async (folder: string, name: string, text: string) => {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const temp = join(folder, `.${name}.${randomUUID()}.tmp`);
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(text);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, join(folder, name));
};

const prune = async (dir: string, prefix: string, keep: number) => {
  const old = (await listBackups(dir)).filter((f) => f.startsWith(prefix)).sort().slice(0, -keep);
  await Promise.all(old.map((f) => rm(join(backupsDir(dir), f), { force: true })));
};

const localDay = () => new Date().toLocaleDateString("en-CA");

export type SaveResult = { status: "saved"; revision: number; savedAt: string } | { status: "conflict"; revision: number };

const write = async (dir: string, baseRevision: number | null, data: StoredFile["data"]): Promise<SaveResult> => {
  const current = await readDataFile(dir);
  const payload = (revision: number, savedAt: string) => JSON.stringify({ app: "lifeos", revision, savedAt, data });
  const savedAt = new Date().toISOString();

  // Someone else saved first. Theirs stays, and this copy is kept rather than lost.
  if (current && baseRevision !== current.revision) {
    await writeAtomic(backupsDir(dir), `conflict-${stamp()}.json`, payload(current.revision, savedAt));
    await prune(dir, "conflict-", KEEP_OTHER);
    return { status: "conflict", revision: current.revision };
  }

  if (current) {
    const daily = `daily-${localDay()}.json`;
    if (!(await listBackups(dir)).includes(daily)) {
      await mkdir(backupsDir(dir), { recursive: true, mode: 0o700 });
      await copyFile(dataPath(dir), join(backupsDir(dir), daily));
      await prune(dir, "daily-", KEEP_DAILY);
    }
    // Resets, imports and deleted goals are the moves worth being able to undo.
    if ((data.logs?.length ?? 0) < (current.data.logs?.length ?? 0)) {
      await mkdir(backupsDir(dir), { recursive: true, mode: 0o700 });
      await copyFile(dataPath(dir), join(backupsDir(dir), `safety-${stamp()}.json`));
      await prune(dir, "safety-", KEEP_OTHER);
    }
  }

  const revision = (current?.revision ?? 0) + 1;
  await writeAtomic(dir, DATA_FILE, payload(revision, savedAt));
  return { status: "saved", revision, savedAt };
};

let queue: Promise<unknown> = Promise.resolve();

/** One save at a time, so the revision check and the write can't interleave. */
export const writeDataFile = (dir: string, baseRevision: number | null, data: StoredFile["data"]): Promise<SaveResult> => {
  const run = queue.then(() => write(dir, baseRevision, data));
  queue = run.catch(() => undefined);
  return run;
};
