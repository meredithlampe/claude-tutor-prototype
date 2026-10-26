import { copyFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// DATA_DIR (e.g. a deployed persistent disk) when set; otherwise server/data, as in local dev.
const dataDir = process.env.DATA_DIR
  ? pathToFileURL(`${path.resolve(process.env.DATA_DIR)}/`)
  : new URL("../data/", import.meta.url);

// The clean starting data: the sample chats, and empty Tutor files.
const seedDir = new URL("../seed/", import.meta.url);

// Writes to the same file are chained so concurrent requests can't interleave
// a read-modify-write and drop each other's changes.
const writeQueues = new Map<string, Promise<unknown>>();

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

// A data file that doesn't exist yet reads as its seed.
export async function readJson<T>(fileName: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(new URL(fileName, dataDir), "utf8");
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    raw = await readFile(new URL(fileName, seedDir), "utf8");
  }
  return JSON.parse(raw) as T;
}

export function updateJson<T, R>(
  fileName: string,
  update: (data: T) => { data: T; result: R },
): Promise<R> {
  const previous = writeQueues.get(fileName) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const { data, result } = update(await readJson<T>(fileName));
      const target = new URL(fileName, dataDir);
      const temp = new URL(`${fileName}.tmp`, dataDir);
      await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
      await rename(temp, target);
      return result;
    });
  writeQueues.set(fileName, next);
  return next;
}

// Puts a file back to its seed, in the file's write queue.
export async function resetJson(fileName: string): Promise<void> {
  const seed: unknown = JSON.parse(await readFile(new URL(fileName, seedDir), "utf8"));
  await updateJson<unknown, void>(fileName, () => ({ data: seed, result: undefined }));
}

// Copies each seed file that's missing from DATA_DIR. Only runs when DATA_DIR is set, so
// local dev's server/data is never touched.
export async function seedDataDir(): Promise<string[]> {
  if (!process.env.DATA_DIR) return [];
  await mkdir(dataDir, { recursive: true });
  const existing = new Set(await readdir(dataDir));
  const seeded: string[] = [];
  for (const fileName of await readdir(seedDir)) {
    if (!fileName.endsWith(".json") || existing.has(fileName)) continue;
    await copyFile(new URL(fileName, seedDir), new URL(fileName, dataDir));
    seeded.push(fileName);
  }
  return seeded;
}
