import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planLoad, type LoadFacts } from "../reconcile";
import { dataPath, readDataFile, writeDataFile } from "./datafile";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "lifeos-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const state = (logs: number) => ({ logs: Array.from({ length: logs }, (_, i) => ({ id: i })) });
const backups = async () => {
  try {
    return await readdir(join(dir, "backups"));
  } catch {
    return [];
  }
};

describe("the data file", () => {
  it("has nothing to read at first", async () => {
    expect(await readDataFile(dir)).toBeNull();
  });

  it("saves and reads back, counting revisions", async () => {
    expect(await writeDataFile(dir, null, state(1))).toMatchObject({ status: "saved", revision: 1 });
    expect(await writeDataFile(dir, 1, state(2))).toMatchObject({ status: "saved", revision: 2 });
    const file = await readDataFile(dir);
    expect(file?.revision).toBe(2);
    expect(file?.data.logs).toHaveLength(2);
  });

  it("is private to this user", async () => {
    await writeDataFile(dir, null, state(1));
    expect((await stat(dataPath(dir))).mode & 0o777).toBe(0o600);
  });

  it("is readable as a normal backup", async () => {
    await writeDataFile(dir, null, state(1));
    expect(JSON.parse(await readFile(dataPath(dir), "utf8"))).toMatchObject({ app: "lifeos", data: { logs: [{ id: 0 }] } });
  });

  it("leaves no temporary files behind", async () => {
    await writeDataFile(dir, null, state(1));
    expect((await readdir(dir)).filter((f) => f.includes(".tmp"))).toEqual([]);
  });

  it("keeps the day's starting point", async () => {
    await writeDataFile(dir, null, state(1));
    await writeDataFile(dir, 1, state(2));
    await writeDataFile(dir, 2, state(3));
    const daily = (await backups()).filter((f) => f.startsWith("daily-"));
    expect(daily).toHaveLength(1);
    expect(JSON.parse(await readFile(join(dir, "backups", daily[0]), "utf8")).data.logs).toHaveLength(1);
  });

  it("saves a safety copy before losing entries", async () => {
    await writeDataFile(dir, null, state(5));
    await writeDataFile(dir, 1, state(0));
    const safety = (await backups()).filter((f) => f.startsWith("safety-"));
    expect(safety).toHaveLength(1);
    expect(JSON.parse(await readFile(join(dir, "backups", safety[0]), "utf8")).data.logs).toHaveLength(5);
  });

  it("doesn't overwrite newer data, and keeps the rejected copy", async () => {
    await writeDataFile(dir, null, state(1));
    await writeDataFile(dir, 1, state(2));
    expect(await writeDataFile(dir, 1, state(9))).toEqual({ status: "conflict", revision: 2 });
    expect((await readDataFile(dir))?.data.logs).toHaveLength(2);
    const conflict = (await backups()).filter((f) => f.startsWith("conflict-"));
    expect(JSON.parse(await readFile(join(dir, "backups", conflict[0]), "utf8")).data.logs).toHaveLength(9);
  });

  it("refuses a blind first save over an existing file", async () => {
    await writeDataFile(dir, null, state(3));
    expect((await writeDataFile(dir, null, state(0))).status).toBe("conflict");
    expect((await readDataFile(dir))?.data.logs).toHaveLength(3);
  });

  it("handles saves arriving together", async () => {
    await writeDataFile(dir, null, state(1));
    const results = await Promise.all([writeDataFile(dir, 1, state(2)), writeDataFile(dir, 1, state(3))]);
    expect(results.map((r) => r.status).sort()).toEqual(["conflict", "saved"]);
  });

  it("recovers from a damaged file using the latest backup", async () => {
    await writeDataFile(dir, null, state(1));
    await writeDataFile(dir, 1, state(2));
    await writeFile(dataPath(dir), '{"revision":3,"data":{"lo');
    const file = await readDataFile(dir);
    expect(file?.recovered).toBe(true);
    expect(file?.data.logs).toHaveLength(1);
    expect((await readdir(dir)).some((f) => f.startsWith("unreadable-"))).toBe(true);
    expect((await readDataFile(dir))?.recovered).toBeUndefined();
  });
});

describe("loading", () => {
  const facts = (f: Partial<LoadFacts>): LoadFacts => ({ available: true, fileExists: true, localHasData: true, identical: false, localRevision: 3, fileRevision: 3, pending: false, ...f });

  it("moves existing browser data into a new file", () => {
    expect(planLoad(facts({ fileExists: false, localRevision: undefined }))).toBe("push-local");
  });

  it("starts fresh with nothing anywhere", () => {
    expect(planLoad(facts({ fileExists: false, localHasData: false }))).toBe("fresh");
  });

  it("restores from the file when the browser was cleared", () => {
    expect(planLoad(facts({ localHasData: false, localRevision: undefined }))).toBe("use-file");
  });

  it("works from the browser if the file can't be reached", () => {
    expect(planLoad(facts({ available: false }))).toBe("browser-only");
  });

  it("finishes a save that was interrupted", () => {
    expect(planLoad(facts({ pending: true }))).toBe("push-local");
  });

  it("catches up when another browser saved", () => {
    expect(planLoad(facts({ fileRevision: 7 }))).toBe("use-file");
  });

  it("prefers the browser when the file came back from an older backup", () => {
    expect(planLoad(facts({ fileRevision: 1, fileRecovered: true }))).toBe("push-local");
  });

  it("keeps unsaved work that clashes with newer data", () => {
    expect(planLoad(facts({ fileRevision: 7, pending: true }))).toBe("use-file-keep-copy");
  });

  it("keeps a different browser's data the first time they meet", () => {
    expect(planLoad(facts({ localRevision: undefined, fileRevision: 7 }))).toBe("use-file-keep-copy");
    expect(planLoad(facts({ localRevision: undefined, identical: true }))).toBe("use-file");
  });
});
