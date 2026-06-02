import type { GgufHeader, GgufValue, GgufTensorInfo } from "./types.js";
import type { QuantType } from "../types.js";
import { computeParams } from "./params.js";

/** `general.file_type` enum -> our QuantType, for the values bytefit models. */
const FILE_TYPE_TO_QUANT: Record<number, QuantType> = {
  1: "F16",
  7: "Q8_0",
  10: "Q2_K",
  11: "Q3_K_S",
  12: "Q3_K_M",
  13: "Q3_K_L",
  14: "Q4_K_S",
  15: "Q4_K_M",
  16: "Q5_K_S",
  17: "Q5_K_M",
  18: "Q6_K",
  30: "IQ4_XS",
};

export interface GgufModelInfo {
  architecture?: string;
  layers?: number;
  headCount?: number;
  kvHeads?: number;
  /** True when `head_count_kv` was absent and kvHeads was assumed = head_count (no GQA). */
  kvHeadsAssumed?: boolean;
  headDim?: number;
  /** True when `key_length` was absent and headDim was derived from embedding/head_count. */
  headDimAssumed?: boolean;
  embeddingLength?: number;
  contextLength?: number;
  isMoE: boolean;
  expertCount: number;
  activeExperts?: number;
  quant?: QuantType;
  totalParams?: number;
  activatedParams?: number;
  sizeLabel?: string;
  /** Local-attention window (tokens) when the arch interleaves sliding-window layers (Gemma-class). */
  slidingWindow?: number;
  /** Number of GLOBAL (full-context) layers when sliding-window is present; the rest cap KV at the window. */
  slidingWindowGlobalLayers?: number;
}

function asNumber(v: GgufValue | undefined): number | undefined {
  if (typeof v === "number") return v;
  // Ollama /api/show can serialize a large integer (e.g. parameter_count) as a STRING; accept a finite
  // numeric string rather than silently dropping it to the size-label heuristic. (Precision >2^53 is
  // not representable, but real arch dims / param counts are well under that.)
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}
function asString(v: GgufValue | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Resolve KV heads from `head_count_kv`, which modern GGUFs store as a PER-LAYER ARRAY (Gemma3/4,
 * Qwen3-MoE/Next), not a scalar — e.g. `[0,0,0,2,…]` (linear/full-attention hybrid; 0 = no-KV linear
 * layer) or `[16,…,4,…]` (local/global interleave). The old `asNumber` treated an array as ABSENT and
 * fell back to no-GQA (`kvHeads = head_count`), over-estimating KV by up to ~30×. Use an effective
 * kvHeads = (per-layer sum / layers), so `2·layers·kvHeads·headDim` recovers the true summed KV (exact
 * for non-sliding GQA). Only a truly-absent / all-zero field falls back to the no-GQA upper bound.
 */
function resolveKvHeads(
  field: GgufValue | undefined,
  headCount: number | undefined,
  layers: number | undefined,
): { kvHeads: number | undefined; assumed: boolean } {
  if (typeof field === "number") return { kvHeads: field, assumed: false };
  if (Array.isArray(field)) {
    const nums = field.filter((x): x is number => typeof x === "number");
    if (nums.length > 0) {
      // A well-formed per-layer array has exactly `layers` entries. If it's shorter (malformed/adversarial
      // GGUF via --hf), dividing the partial sum by the full layer count UNDER-counts KV (the unsafe
      // direction for an anti-paging tool) — fall back to the no-GQA upper bound instead.
      if (layers && layers > 0 && nums.length !== layers) {
        return { kvHeads: headCount, assumed: headCount !== undefined };
      }
      const denom = layers && layers > 0 ? layers : nums.length;
      const eff = nums.reduce((a, b) => a + b, 0) / denom;
      if (eff > 0) return { kvHeads: eff, assumed: false };
    }
  }
  return { kvHeads: headCount, assumed: headCount !== undefined };
}

/**
 * Resolve sliding-window attention (Gemma-class): the window size + how many layers are GLOBAL (cache
 * full context). GGUFs store `sliding_window_pattern` as a per-layer boolean array (true = local/sliding,
 * false = global/full); a scalar N means the HF rule (layer i is global iff (i+1) % N == 0). Absent ⇒
 * the Gemma default of 6 (5 local : 1 global). Returns {} when there is no sliding window.
 */
function resolveSlidingWindow(
  window: number | undefined,
  patternField: GgufValue | undefined,
  layers: number | undefined,
): { slidingWindow?: number; slidingWindowGlobalLayers?: number } {
  if (!window || window <= 0 || !layers || layers <= 0) return {};
  let globalLayers: number;
  if (Array.isArray(patternField)) {
    globalLayers = patternField.filter((x) => x === false).length; // false = global / full-context layer
  } else if (typeof patternField === "number" && patternField > 0) {
    globalLayers = Math.floor(layers / patternField);
  } else {
    globalLayers = Math.floor(layers / 6);
  }
  return { slidingWindow: window, slidingWindowGlobalLayers: globalLayers };
}

/** Parse "7B" / "30.5B" / "671B" / "1.5T" size labels into a parameter count. */
export function parseSizeLabel(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const m = /^([\d.]+)\s*([KMBT])?/i.exec(label.trim());
  if (!m || m[1] === undefined) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  const mult: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const suffix = (m[2] ?? "B").toUpperCase();
  return n * (mult[suffix] ?? 1e9);
}

/**
 * Project GGUF metadata (+ optional tensor info) onto the fields bytefit's core needs.
 * Exact param counts come from tensor info when present; otherwise we fall back to
 * general.parameter_count, then the size_label heuristic.
 */
export function ggufModelInfoFromMetadata(md: Map<string, GgufValue>, tensors: GgufTensorInfo[] = []): GgufModelInfo {
  const arch = asString(md.get("general.architecture"));
  const g = (suffix: string): GgufValue | undefined => (arch ? md.get(`${arch}.${suffix}`) : undefined);

  const headCount = asNumber(g("attention.head_count"));
  const layers = asNumber(g("block_count"));
  // head_count_kv may be a scalar OR a per-layer array (Gemma3/4, Qwen3-MoE/Next). Resolve an effective
  // kvHeads; only a truly-absent field falls back to the no-GQA (largest-KV, paging-safe) upper bound.
  const kv = resolveKvHeads(g("attention.head_count_kv"), headCount, layers);
  const kvHeads = kv.kvHeads;
  const kvHeadsAssumed = kv.assumed;
  const keyLength = asNumber(g("attention.key_length"));
  const embeddingLength = asNumber(g("embedding_length"));
  const headDim =
    keyLength ?? (embeddingLength !== undefined && headCount ? embeddingLength / headCount : undefined);
  // key_length is authoritative; the embedding/head_count fallback is wrong for decoupled-head archs
  // (e.g. Gemma fixes head_dim independent of d_model) — flag it as an assumption when it's used.
  const headDimAssumed = keyLength === undefined && headDim !== undefined;
  const expertCount = asNumber(g("expert_count")) ?? 0;

  const fileType = asNumber(md.get("general.file_type"));
  const quant = fileType !== undefined ? FILE_TYPE_TO_QUANT[fileType] : undefined;

  const sizeLabel = asString(md.get("general.size_label"));
  const counts = computeParams(md, tensors);
  const totalParams =
    counts.totalParams > 0 ? counts.totalParams : asNumber(md.get("general.parameter_count")) ?? parseSizeLabel(sizeLabel);
  const activatedParams = counts.totalParams > 0 ? counts.activatedParams : undefined;

  return {
    architecture: arch,
    layers,
    headCount,
    kvHeads,
    kvHeadsAssumed,
    headDim,
    headDimAssumed,
    embeddingLength,
    contextLength: asNumber(g("context_length")),
    ...resolveSlidingWindow(asNumber(g("attention.sliding_window")), g("attention.sliding_window_pattern"), layers),
    isMoE: expertCount > 0,
    expertCount,
    activeExperts: asNumber(g("expert_used_count")),
    quant,
    totalParams,
    activatedParams,
    sizeLabel,
  };
}

export function ggufToModelInfo(header: GgufHeader): GgufModelInfo {
  return ggufModelInfoFromMetadata(header.metadata, header.tensors);
}
