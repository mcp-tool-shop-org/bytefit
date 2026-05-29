import { open } from "node:fs/promises";
import { parseGguf, GgufTruncatedError } from "./parse.js";
import type { GgufHeader } from "./types.js";

const INITIAL_READ = 1 << 20; // 1 MiB
const MAX_READ = 64 << 20; // 64 MiB cap (metadata + tokenizer arrays comfortably fit)

/**
 * Read GGUF metadata from a local file, reading only the header region and growing the read
 * window on demand (tokenizer arrays can push the KV section past 1 MiB). Never loads tensors.
 */
export async function readGgufMetadata(path: string): Promise<GgufHeader> {
  const fh = await open(path, "r");
  try {
    const { size } = await fh.stat();
    let chunk = Math.min(INITIAL_READ, size);
    for (;;) {
      const buf = Buffer.alloc(chunk);
      await fh.read(buf, 0, chunk, 0);
      try {
        return parseGguf(buf);
      } catch (err) {
        if (err instanceof GgufTruncatedError && chunk < size && chunk < MAX_READ) {
          chunk = Math.min(chunk * 4, size, MAX_READ);
          continue;
        }
        throw err;
      }
    }
  } finally {
    await fh.close();
  }
}
