import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { readGgufMetadata, ggufToModelInfo } from "../gguf/index.js";
import { toModelMeta } from "./to-model-meta.js";
import type { CatalogEntry } from "./types.js";

/** Build a catalog entry from a single local .gguf file. */
export async function catalogFromGgufFile(path: string): Promise<CatalogEntry | undefined> {
  const info = ggufToModelInfo(await readGgufMetadata(path));
  const model = toModelMeta(info, basename(path));
  return model ? { id: basename(path), source: "local", model } : undefined;
}

/** Scan a directory for *.gguf files and build catalog entries (errors per-file are skipped). */
export async function catalogFromDir(dir: string): Promise<CatalogEntry[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: CatalogEntry[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".gguf")) continue;
    const entry = await catalogFromGgufFile(join(dir, name)).catch(() => undefined);
    if (entry) out.push(entry);
  }
  return out;
}
