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
  const totalParams = info.totalParams ?? 0;
  if (info.layers === undefined || info.kvHeads === undefined || info.headDim === undefined || !quant || totalParams <= 0) {
    return undefined; // a 0-param entry would footprint to 0 bytes and "fit" any hardware — drop it
  }
  return {
    id,
    totalParams,
    activatedParams: info.activatedParams,
    isMoE: info.isMoE,
    expertCount: info.expertCount,
    activeExperts: info.activeExperts,
    arch: {
      layers: info.layers,
      kvHeads: info.kvHeads,
      headDim: info.headDim,
      ...(info.kvHeadsAssumed ? { kvHeadsAssumed: true } : {}),
      ...(info.headDimAssumed ? { headDimAssumed: true } : {}),
      ...(info.slidingWindow !== undefined ? { slidingWindow: info.slidingWindow } : {}),
      ...(info.slidingWindowGlobalLayers !== undefined ? { slidingWindowGlobalLayers: info.slidingWindowGlobalLayers } : {}),
    },
    builds: [{ quant, ...(opts.sizeBytes !== undefined ? { sizeBytes: opts.sizeBytes } : {}) }],
  };
}
