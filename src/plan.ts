import type {
  PlanRequest,
  Loadout,
  KVCacheType,
  PlanOptions,
  SpeculativeLane,
  Footprint,
  Hardware,
  ModelMeta,
} from "./types.js";
import {
  DEFAULT_CONTEXT_LENGTH,
  DEFAULT_VRAM_HEADROOM_BYTES,
  DEFAULT_RAM_HEADROOM_BYTES,
  VRAM_USABLE_FRACTION,
  RAM_USABLE_FRACTION,
  INTERACTIVE_MIN_TOK_PER_SEC,
  REASONING_QUANT_FLOOR,
  BANDWIDTH_EFFICIENCY,
  fmtGiB,
} from "./constants.js";
import { selectQuant, smallestQuant, quantQualityRank, lowBitRisk, bytesPerParam, type QuantChoice } from "./quant.js";
import {
  kvBytesPerToken,
  kvBytesTotal as computeKvTotal,
  activeWeightBytesPerToken,
  usableBytes,
} from "./footprint.js";
import { placeAndAdmit } from "./placement.js";
import { predictTokensPerSec, moeDecodeEfficiency } from "./roofline.js";

/**
 * Plan the best loadout for a single model on the given hardware: choose quant + KV-cache +
 * placement, predict tok/s, and refuse rather than recommend a config that would silently page.
 */
export function plan(req: PlanRequest): Loadout {
  const { hardware, model } = req;
  const opts = req.options ?? {};
  const contextLength = opts.contextLength ?? DEFAULT_CONTEXT_LENGTH;
  const useCase = opts.useCase ?? "chat";
  const allowDegraded = opts.allowDegraded ?? true;
  const kvCacheType: KVCacheType = opts.kvCacheType ?? "q8_0";
  const vramHeadroomBytes = opts.vramHeadroomBytes ?? DEFAULT_VRAM_HEADROOM_BYTES;
  const ramHeadroomBytes = opts.ramHeadroomBytes ?? DEFAULT_RAM_HEADROOM_BYTES;
  const experimentalDisk = opts.experimentalDisk ?? false;

  // Context length is load-bearing input (drives KV → admission). Reject non-finite / non-positive
  // here in the pure core rather than letting NaN/negative flow into the math: a NaN context silently
  // routes to a false "won't fit" refusal and a negative one inflates the budget into a false "fits".
  if (!Number.isFinite(contextLength) || contextLength <= 0) {
    return {
      modelId: model.id,
      verdict: "refused",
      kvCacheType,
      contextLength,
      reasoning: [`Invalid context length (${contextLength}).`],
      refusal: {
        code: "INVALID_CONTEXT",
        message: `Context length must be a positive integer (got ${contextLength}).`,
        hint: "Pass a positive --ctx (e.g. 8192), or omit it to use the 8192 default.",
      },
    };
  }

  const reasoning: string[] = [];
  const usableVram = usableBytes(hardware.vramFreeBytes, hardware.vramBytes, vramHeadroomBytes, VRAM_USABLE_FRACTION);
  const usableRam = usableBytes(hardware.ramFreeBytes, hardware.ramBytes, ramHeadroomBytes, RAM_USABLE_FRACTION);
  const kvTotal = computeKvTotal(model, kvCacheType, contextLength);

  reasoning.push(
    `Usable ${fmtGiB(usableVram)} VRAM + ${fmtGiB(usableRam)} RAM after headroom; KV ${fmtGiB(kvTotal)} (${kvCacheType}, ${contextLength} ctx).`,
  );
  if (model.arch.kvHeadsAssumed || model.arch.headDimAssumed) {
    const omitted: string[] = [];
    if (model.arch.kvHeadsAssumed) omitted.push(`head_count_kv (no-GQA assumed, kvHeads=${model.arch.kvHeads})`);
    if (model.arch.headDimAssumed) omitted.push(`key_length (headDim≈${model.arch.headDim})`);
    reasoning.push(
      `KV is an upper bound — this GGUF omits ${omitted.join(" and ")}; actual KV may be smaller, so a faster tier could fit.`,
    );
  }
  if (model.arch.slidingWindow) {
    reasoning.push(
      `Sliding-window attention: ${model.arch.slidingWindowGlobalLayers ?? "?"}/${model.arch.layers} layers cache full context, the rest cap KV at the ${model.arch.slidingWindow}-token window (modeled).`,
    );
  }

  // Quant selection: fast lane first (best quant that fits VRAM), then offload (VRAM+RAM).
  // Reasoning honors the Q4_K_M floor before any degraded low-bit fallback.
  const vramBudget = usableVram - kvTotal;
  const allBudget = usableVram + usableRam - kvTotal;
  let choice: QuantChoice | undefined;
  if (useCase === "reasoning") {
    choice =
      selectQuant(model, vramBudget, { requireFloor: true }) ??
      selectQuant(model, allBudget, { requireFloor: true });
    if (!choice && allowDegraded) {
      choice = selectQuant(model, vramBudget) ?? selectQuant(model, allBudget);
    }
  } else {
    choice = selectQuant(model, vramBudget) ?? selectQuant(model, allBudget);
  }

  // Experimental MoE disk fallback: if nothing fits memory, take the smallest build to minimize streaming.
  if (!choice && experimentalDisk && model.isMoE) {
    choice = smallestQuant(model);
    if (choice) reasoning.push(`Nothing fits memory; experimental disk tier with smallest build ${choice.build.quant}.`);
  }

  if (!choice) {
    return {
      modelId: model.id,
      verdict: "refused",
      kvCacheType,
      contextLength,
      reasoning,
      refusal: {
        code: "NO_FITTING_QUANT",
        message: `No available quant of ${model.id} fits the usable VRAM+RAM budget (${fmtGiB(Math.max(0, allBudget))})${useCase === "reasoning" ? " at/above the Q4_K_M reasoning floor" : ""}.`,
        hint:
          useCase === "reasoning"
            ? "Set useCase to chat to allow lower quants, add RAM, or pick a smaller model."
            : "Pick a smaller model, add RAM, or (MoE only) enable experimentalDisk.",
      },
    };
  }

  if (model.isMoE) {
    reasoning.push(
      `MoE: ${model.activeExperts ?? "?"}/${model.expertCount ?? "?"} experts active, ${fmtGiB(activeWeightBytesPerToken(model, choice.build))} read/token (vs ${fmtGiB(choice.weightBytes)} total). Batch=1 expert gather is bandwidth-inefficient — tok/s uses a measured MoE factor, not the dense roofline.`,
    );
  }
  reasoning.push(
    `Quant ${choice.build.quant}${choice.build.dynamic ? " (dynamic)" : ""}: ${fmtGiB(choice.weightBytes)} weights.` +
      (choice.belowReasoningFloor && useCase === "reasoning" ? " Below Q4_K_M floor — degraded for reasoning." : ""),
  );
  const bitRisk = lowBitRisk(choice.build);
  if (bitRisk === "risky") {
    reasoning.push(
      `${choice.build.quant} is a legacy sub-4-bit quant — below the safe floor; quality can drop sharply (3-bit cliff). Prefer an IQ-quant or a Dynamic GGUF at this size, or a smaller model at Q4+.`,
    );
  } else if (bitRisk === "imatrix") {
    reasoning.push(`${choice.build.quant} is sub-4-bit but imatrix/dynamic-recovered — aggressive; fine for non-reasoning, watch quality.`);
  }

  const placed = placeAndAdmit(hardware, model, choice.build, kvTotal, {
    vramHeadroomBytes,
    ramHeadroomBytes,
    experimentalDisk,
  });

  if (placed.verdict === "refused" || !placed.placement) {
    return {
      modelId: model.id,
      verdict: "refused",
      quant: choice.build.quant,
      kvCacheType,
      contextLength,
      reasoning,
      refusal: placed.refusal,
    };
  }

  // MoE batch=1 decode realizes far lower effective bandwidth than dense (sparse expert gather) — but it
  // is a GPU effect, so the penalty applies to a VRAM-RESIDENT MoE only; offloaded experts (CPU/RAM) use
  // the dense factor (research-grounding #33/#35). Efficiency rises with active bytes (overhead amortizes).
  const moeResident = model.isMoE && placed.placement.tier === "vram";
  const predicted = predictTokensPerSec(
    hardware,
    placed.placement,
    kvTotal,
    moeResident
      ? { efficiency: moeDecodeEfficiency(activeWeightBytesPerToken(model, choice.build)), kvEfficiency: BANDWIDTH_EFFICIENCY }
      : {},
  );
  const speculativeLane: SpeculativeLane = placed.placement.tier === "vram" ? "none" : "self-speculative";

  if (placed.placement.tier === "vram") {
    reasoning.push(`Fits fully in VRAM. ~${predicted.toFixed(0)} tok/s.`);
  } else if (placed.placement.tier === "vram+ram") {
    reasoning.push(
      `Offload: ${fmtGiB(placed.vramWeightBytes)} weights in VRAM, ${fmtGiB(placed.ramWeightBytes)} in RAM` +
        (placed.placement.cpuMoELayers ? `, ${placed.placement.cpuMoELayers} layers' experts on CPU` : "") +
        `. ~${predicted.toFixed(0)} tok/s.`,
    );
  } else {
    reasoning.push(
      `EXPERIMENTAL disk tier: ${fmtGiB(placed.diskWeightBytes)} of experts streamed from NVMe. ~${predicted.toFixed(1)} tok/s — batch/offline only.`,
    );
  }

  if (speculativeLane !== "none") {
    reasoning.push(
      "Bandwidth-bound tier — attach speculative decoding (EAGLE-2 if a draft head exists, else Medusa; self-speculative is the zero-cost fallback).",
    );
  }
  if (predicted > 0 && predicted < INTERACTIVE_MIN_TOK_PER_SEC && useCase !== "bulk") {
    reasoning.push(`Below ~${INTERACTIVE_MIN_TOK_PER_SEC} tok/s — usable for batch, sluggish for interactive.`);
  }

  const footprint: Footprint = {
    weightBytesTotal: choice.weightBytes,
    weightBytesActivePerToken: activeWeightBytesPerToken(model, choice.build),
    kvBytesPerToken: kvBytesPerToken(model, kvCacheType),
    kvBytesTotal: kvTotal,
    vramWeightBytes: placed.vramWeightBytes,
    ramWeightBytes: placed.ramWeightBytes,
    diskWeightBytes: placed.diskWeightBytes,
    vramRequiredBytes: placed.vramRequiredBytes,
    ramRequiredBytes: placed.ramRequiredBytes,
  };

  return {
    modelId: model.id,
    verdict: placed.verdict,
    quant: choice.build.quant,
    kvCacheType,
    contextLength,
    placement: placed.placement,
    speculativeLane,
    predictedTokensPerSec: predicted,
    footprint,
    reasoning,
  };
}

export interface Recommendation {
  loadout: Loadout;
  capabilityScore: number;
}

/**
 * Rank candidate models for the hardware and return the runnable ones best-first.
 * Encodes the "crushed big model" heuristic (more params at lower bits wins per byte) while
 * penalizing degraded placements and, for interactive use, filtering out sub-interactive speeds.
 */
export function recommend(
  hardware: Hardware,
  models: ModelMeta[],
  options?: PlanOptions,
): Recommendation[] {
  const useCase = options?.useCase ?? "chat";
  const interactive = useCase !== "bulk";
  return models
    .map((model) => {
      const loadout = plan({ hardware, model, options });
      return { loadout, capabilityScore: scoreLoadout(model, loadout, interactive) };
    })
    .filter((r) => r.loadout.verdict !== "refused")
    .filter((r) => !interactive || (r.loadout.predictedTokensPerSec ?? 0) >= INTERACTIVE_MIN_TOK_PER_SEC)
    .sort((a, b) => b.capabilityScore - a.capabilityScore);
}

function scoreLoadout(model: ModelMeta, loadout: Loadout, interactive: boolean): number {
  if (loadout.verdict === "refused") return -Infinity;
  // A malformed library-supplied entry (totalParams <= 0) must sort to the bottom, never NaN-poison the
  // comparator (the CLI catalog path already drops these in toModelMeta; this guards the public API).
  if (!Number.isFinite(model.totalParams) || model.totalParams <= 0) return -Infinity;
  let score = Math.log10(model.totalParams); // capability ~ scale of the model
  if (loadout.quant) {
    score += 0.3 * (quantQualityRank(loadout.quant) / 100);
    // The "crushed big model" heuristic (more params at fewer bits wins per byte) holds ONLY down to
    // 4-bit; below it the bigger model inverts (research-grounding #9 — Dettmers & Zettlemoyer 2022,
    // arXiv:2212.09720: "do not recommend a 3-bit-bigger model over a 4-bit-smaller one"). Penalize a
    // sub-4-bit pick hard enough that log10(params) can't carry a crushed bigger model over a safe
    // higher-bit smaller one at comparable footprint.
    if (bytesPerParam(loadout.quant) < 0.5) {
      const deficitRank = Math.max(0, quantQualityRank(REASONING_QUANT_FLOOR) - quantQualityRank(loadout.quant));
      score -= 0.5 + 0.4 * (deficitRank / 100);
    }
  }
  score += loadout.verdict === "fits" ? 0.2 : -0.15; // comfortable beats degraded
  if (interactive) {
    const t = loadout.predictedTokensPerSec ?? 0;
    score += Math.min(0.2, Math.max(0, (t - INTERACTIVE_MIN_TOK_PER_SEC) / 200));
  }
  return score;
}
