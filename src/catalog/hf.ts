import { parseGguf, GgufTruncatedError, ggufToModelInfo, type GgufModelInfo } from "../gguf/index.js";
import { quantFromLabel } from "./ollama.js";
import { toModelMeta } from "./to-model-meta.js";
import type { CatalogEntry } from "./types.js";
import type { QuantBuild, QuantType } from "../types.js";

const HF_ENDPOINT = "https://huggingface.co";
const INITIAL_RANGE = 1 << 20; // 1 MiB
const MAX_RANGE = 16 << 20; // 16 MiB — bound the remote header read (header + metadata + tensor info)

export interface HfCatalogOptions {
  /** Endpoint override (default https://huggingface.co). */
  endpoint?: string;
  /** Branch / tag / commit (default "main"). */
  revision?: string;
  /** Injectable fetch (for tests). */
  fetchImpl?: typeof fetch;
}

interface HfTreeEntry {
  type: string;
  path: string;
  size?: number;
}

/** Extract a bytefit QuantType from a GGUF filename, e.g. "…-Q4_K_M.gguf" or "….IQ4_XS.gguf". */
export function quantFromFilename(name: string): QuantType | undefined {
  const tokens = name.replace(/\.gguf$/i, "").split(/[.\-_/]/);
  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      const q = quantFromLabel(tokens.slice(i, i + len).join("_"));
      if (q) return q;
    }
  }
  return undefined;
}

/** Read just the GGUF header of a remote file via HTTP Range, growing the window on demand. */
async function readRemoteGgufHeader(url: string, fetchImpl: typeof fetch): Promise<GgufModelInfo> {
  let chunk = INITIAL_RANGE;
  for (;;) {
    const res = await fetchImpl(url, { headers: { Range: `bytes=0-${chunk - 1}` }, redirect: "follow" });
    if (!res.ok && res.status !== 206) throw new Error(`HF ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      return ggufToModelInfo(parseGguf(buf));
    } catch (err) {
      // Grow only if the server returned the full window we asked for (else we already have the whole file).
      if (err instanceof GgufTruncatedError && buf.length >= chunk && chunk < MAX_RANGE) {
        chunk = Math.min(chunk * 4, MAX_RANGE);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Build a catalog entry for a Hugging Face GGUF repo WITHOUT downloading the weights: list the repo's
 * .gguf files (one build per quant, sizes from the tree API) and Range-read a single header for the
 * architecture. OPT-IN network — only reached when the user passes `--hf <repo>` (see SECURITY.md).
 */
export async function catalogFromHuggingFace(repo: string, opts: HfCatalogOptions = {}): Promise<CatalogEntry[]> {
  const endpoint = opts.endpoint ?? HF_ENDPOINT;
  const revision = opts.revision ?? "main";
  const fetchImpl = opts.fetchImpl ?? fetch;

  const treeRes = await fetchImpl(`${endpoint}/api/models/${repo}/tree/${revision}`).catch(() => undefined);
  if (!treeRes || !treeRes.ok) return [];
  const tree = (await treeRes.json().catch(() => [])) as HfTreeEntry[];
  if (!Array.isArray(tree)) return [];

  // Single-file GGUFs only; skip sharded (-00002-of-00003) parts whose sizes aren't aggregated here.
  const ggufs = tree
    .filter((e) => e.type === "file" && /\.gguf$/i.test(e.path) && !/-\d{5}-of-\d{5}\.gguf$/i.test(e.path))
    .sort((a, b) => (a.size ?? 0) - (b.size ?? 0));

  const builds: QuantBuild[] = [];
  let info: GgufModelInfo | undefined;
  for (const f of ggufs) {
    const quant = quantFromFilename(f.path);
    if (!quant) continue;
    builds.push({ quant, ...(f.size ? { sizeBytes: f.size } : {}) });
    if (!info) {
      const url = `${endpoint}/${repo}/resolve/${revision}/${f.path}`;
      info = await readRemoteGgufHeader(url, fetchImpl).catch(() => undefined);
    }
  }
  if (!info || builds.length === 0) return [];

  const model = toModelMeta(info, repo, { quant: builds[0]!.quant });
  if (!model) return [];
  model.builds = builds; // expose every available quant, not just the one whose header we read
  return [{ id: repo, source: "huggingface", model, note: "metadata from huggingface.co (weights not downloaded)" }];
}
