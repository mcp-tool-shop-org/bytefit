import type { ModelMeta, QuantBuild, KVCacheType } from "./types.js";
import { KV_BYTES_PER_ELEM } from "./constants.js";
import { bytesPerParam, buildWeightBytes } from "./quant.js";

/** KV-cache bytes consumed per token of context (K and V across all layers). */
export function kvBytesPerToken(model: ModelMeta, kvType: KVCacheType): number {
  const { layers, kvHeads, headDim } = model.arch;
  return 2 * layers * kvHeads * headDim * KV_BYTES_PER_ELEM[kvType];
}

export function kvBytesTotal(model: ModelMeta, kvType: KVCacheType, contextLength: number): number {
  return kvBytesPerToken(model, kvType) * contextLength;
}

/**
 * Active weight bytes read per decoded token (= activated params * bytes/param).
 * Dense models read all params; MoE models read only the activated subset — this is why
 * MoE stretches hardware further than a dense model of the same total size.
 */
export function activeWeightBytesPerToken(model: ModelMeta, build: QuantBuild): number {
  const activated = model.activatedParams ?? model.totalParams;
  return bytesPerParam(build.quant) * activated;
}

export { buildWeightBytes };
