import type { ModelMeta, QuantBuild, QuantType } from "./types.js";
import { BITS_PER_WEIGHT, QUANT_QUALITY_RANK, REASONING_QUANT_FLOOR } from "./constants.js";

export function bytesPerParam(quant: QuantType): number {
  return BITS_PER_WEIGHT[quant] / 8;
}

export function quantQualityRank(quant: QuantType): number {
  return QUANT_QUALITY_RANK[quant];
}

/** Total weight bytes for a build of this model (real size if known, else estimated). */
export function buildWeightBytes(model: ModelMeta, build: QuantBuild): number {
  if (build.sizeBytes !== undefined) return build.sizeBytes;
  return bytesPerParam(build.quant) * model.totalParams;
}

export interface QuantChoice {
  build: QuantBuild;
  weightBytes: number;
  belowReasoningFloor: boolean;
}

const FLOOR_RANK = QUANT_QUALITY_RANK[REASONING_QUANT_FLOOR];

/** Builds sorted best-quality-first; a dynamic (mixed-precision) build wins ties. */
function rankedBuilds(model: ModelMeta): QuantBuild[] {
  return [...model.builds].sort((a, b) => {
    const q = quantQualityRank(b.quant) - quantQualityRank(a.quant);
    if (q !== 0) return q;
    return Number(b.dynamic ?? false) - Number(a.dynamic ?? false);
  });
}

/**
 * Pick the highest-quality quant build whose total weights fit within `weightBudgetBytes`.
 * A dynamic (mixed-precision) build wins ties. With `requireFloor`, below-Q4_K_M builds are
 * skipped (used to enforce the reasoning floor). Returns undefined if nothing fits.
 *
 * Tier preference (fast-lane-first) is the caller's job: call with the VRAM-only budget, then
 * fall back to the VRAM+RAM budget — see `plan()`.
 */
export function selectQuant(
  model: ModelMeta,
  weightBudgetBytes: number,
  opts: { requireFloor?: boolean } = {},
): QuantChoice | undefined {
  const requireFloor = opts.requireFloor ?? false;
  for (const build of rankedBuilds(model)) {
    const weightBytes = buildWeightBytes(model, build);
    if (weightBytes > weightBudgetBytes) continue;
    const belowReasoningFloor = quantQualityRank(build.quant) < FLOOR_RANK;
    if (requireFloor && belowReasoningFloor) continue;
    return { build, weightBytes, belowReasoningFloor };
  }
  return undefined;
}

/** Smallest available build by weight bytes — used to minimize streaming on the disk tier. */
export function smallestQuant(model: ModelMeta): QuantChoice | undefined {
  let best: QuantChoice | undefined;
  for (const build of model.builds) {
    const weightBytes = buildWeightBytes(model, build);
    if (!best || weightBytes < best.weightBytes) {
      best = { build, weightBytes, belowReasoningFloor: quantQualityRank(build.quant) < FLOOR_RANK };
    }
  }
  return best;
}
