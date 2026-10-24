import { readFile, rename, writeFile } from "node:fs/promises";

const dataDir = new URL("../data/", import.meta.url);

// Writes to the same file are chained so concurrent requests can't interleave
// a read-modify-write and drop each other's changes.
const writeQueues = new Map<string, Promise<unknown>>();

export async function readJson<T>(fileName: string): Promise<T> {
  const raw = await readFile(new URL(fileName, dataDir), "utf8");
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
