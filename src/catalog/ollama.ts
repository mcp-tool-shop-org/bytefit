import { join } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import type { QuantType } from "../types.js";
import { BITS_PER_WEIGHT } from "../constants.js";
import {
  readGgufMetadata,
  ggufToModelInfo,
  ggufModelInfoFromMetadata,
  type GgufModelInfo,
  type GgufValue,
} from "../gguf/index.js";
import { toModelMeta } from "./to-model-meta.js";
import type { CatalogEntry } from "./types.js";

const DEFAULT_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const MODEL_LAYER = "application/vnd.ollama.image.model";

export interface OllamaCatalogOptions {
  host?: string;
  modelsDir?: string;
}

interface OllamaManifest {
  layers?: Array<{ mediaType?: string; digest?: string }>;
}
interface TagsResponse {
  models?: Array<{ name: string; size?: number; details?: { quantization_level?: string } }>;
}
interface ShowResponse {
  model_info?: Record<string, GgufValue>;
}

/** Map an Ollama `quantization_level` label (e.g. "Q4_K_M") to our QuantType, if modeled. */
export function quantFromLabel(label: string | undefined): QuantType | undefined {
  if (!label) return undefined;
  const up = label.toUpperCase();
  return up in BITS_PER_WEIGHT ? (up as QuantType) : undefined;
}

/** registry.ollama.ai/{namespace}/{model}/{tag} manifest path for an Ollama model name. */
export function ollamaManifestPath(modelsDir: string, name: string): string {
  const colon = name.lastIndexOf(":");
  const repo = colon >= 0 ? name.slice(0, colon) : name;
  const tag = colon >= 0 ? name.slice(colon + 1) : "latest";
  const parts = repo.split("/");
  const model = parts.pop() ?? repo;
  const namespace = parts.length ? parts.join("/") : "library";
  return join(modelsDir, "manifests", "registry.ollama.ai", namespace, model, tag);
}

/** Resolve the GGUF blob path from a parsed Ollama manifest (the model-layer digest). */
export function blobPathFromManifest(modelsDir: string, manifest: OllamaManifest): string | undefined {
  const digest = manifest.layers?.find((l) => l.mediaType === MODEL_LAYER)?.digest;
  return digest ? join(modelsDir, "blobs", digest.replace(":", "-")) : undefined;
}

function baseUrl(opts: OllamaCatalogOptions): string {
  const h = opts.host ?? DEFAULT_HOST;
  return /^https?:\/\//.test(h) ? h : `http://${h}`;
}

async function ollamaFetch(url: string, body?: unknown): Promise<unknown | undefined> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Enumerate installed Ollama models. Metadata comes from the raw blob GGUF when reachable
 * (authoritative: exact params + expert counts), falling back to /api/show otherwise.
 */
export async function catalogFromOllama(opts: OllamaCatalogOptions = {}): Promise<CatalogEntry[]> {
  const base = baseUrl(opts);
  const modelsDir = opts.modelsDir ?? process.env.OLLAMA_MODELS ?? join(homedir(), ".ollama", "models");
  const tags = (await ollamaFetch(`${base}/api/tags`)) as TagsResponse | undefined;
  if (!tags?.models) return [];

  const out: CatalogEntry[] = [];
  for (const m of tags.models) {
    const quant = quantFromLabel(m.details?.quantization_level);
    let info: GgufModelInfo | undefined;
    let note: string | undefined;

    const manifest = await readFile(ollamaManifestPath(modelsDir, m.name), "utf8")
      .then((s) => JSON.parse(s) as OllamaManifest)
      .catch(() => undefined);
    const blob = manifest ? blobPathFromManifest(modelsDir, manifest) : undefined;
    if (blob) info = await readGgufMetadata(blob).then(ggufToModelInfo).catch(() => undefined);

    if (!info) {
      const show = (await ollamaFetch(`${base}/api/show`, { model: m.name })) as ShowResponse | undefined;
      if (show?.model_info) {
        info = ggufModelInfoFromMetadata(new Map(Object.entries(show.model_info)));
        note = "metadata from /api/show (no tensor info — MoE active-param count unavailable)";
      }
    }
    if (!info) continue;

    const model = toModelMeta(info, m.name, {
      ...(m.size !== undefined ? { sizeBytes: m.size } : {}),
      ...(quant ? { quant } : {}),
    });
    if (!model) continue;
    out.push({
      id: m.name,
      source: "ollama",
      model,
      ...(m.size !== undefined ? { installedBytes: m.size } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out;
}
