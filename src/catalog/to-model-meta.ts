import type { ModelMeta, QuantType } from "../types.js";
import type { GgufModelInfo } from "../gguf/index.js";

/**
 * Build a ModelMeta from parsed GGUF info. Returns undefined when the architecture dimensions
 * (needed for KV math) or a usable quant are missing — an incomplete entry is worse than none.
 */
export function toModelMeta(
  info: GgufModelInfo,
  id: string,
  opts: { sizeBytes?: number; quant?: QuantType } = {},
): ModelMeta | undefined {
  const quant = opts.quant ?? info.quant;
  if (info.layers === undefined || info.kvHeads === undefined || info.headDim === undefined || !quant) {
    return undefined;
  }
  return {
    id,
    totalParams: info.totalParams ?? 0,
    activatedParams: info.activatedParams,
    isMoE: info.isMoE,
    expertCount: info.expertCount,
    activeExperts: info.activeExperts,
    arch: { layers: info.layers, kvHeads: info.kvHeads, headDim: info.headDim },
    builds: [{ quant, ...(opts.sizeBytes !== undefined ? { sizeBytes: opts.sizeBytes } : {}) }],
  };
}
