import type { QuantType, KVCacheType } from "./types.js";

export const MiB = 1024 ** 2;
export const GiB = 1024 ** 3;
export const MB = 1_000_000;
export const GB = 1_000_000_000;

/**
 * Effective bits-per-weight for GGUF quant types, including block/scale overhead.
 * Approximate and community-derived; the planner prefers a build's real `sizeBytes` when present.
 */
export const BITS_PER_WEIGHT: Record<QuantType, number> = {
  F16: 16,
  Q8_0: 8.5,
  Q6_K: 6.56,
  Q5_K_M: 5.67,
  Q5_K_S: 5.54,
  Q4_K_M: 4.83,
  Q4_K_S: 4.57,
  IQ4_XS: 4.25,
  Q3_K_L: 4.27,
  Q3_K_M: 3.91,
  Q3_K_S: 3.5,
  IQ3_M: 3.66,
  Q2_K: 3.35,
  IQ2_M: 2.7,
  IQ2_XXS: 2.06,
};

/** Quality rank: higher = better fidelity. Breaks ties and enforces the Q4_K_M reasoning floor. */
export const QUANT_QUALITY_RANK: Record<QuantType, number> = {
  F16: 100,
  Q8_0: 90,
  Q6_K: 80,
  Q5_K_M: 72,
  Q5_K_S: 70,
  Q4_K_M: 62,
  Q4_K_S: 58,
  IQ4_XS: 55,
  Q3_K_L: 48,
  IQ3_M: 45,
  Q3_K_M: 42,
  Q3_K_S: 35,
  Q2_K: 28,
  IQ2_M: 22,
  IQ2_XXS: 12,
};

/** Bytes per KV-cache element (per K or V value) by cache type, including quant overhead. */
export const KV_BYTES_PER_ELEM: Record<KVCacheType, number> = {
  f16: 2,
  q8_0: 1.0,
  q4_0: 0.5,
};

/** Quant at/above which reasoning quality is considered safe (the 3-bit-cliff floor). */
export const REASONING_QUANT_FLOOR: QuantType = "Q4_K_M";

export const DEFAULT_CONTEXT_LENGTH = 8192;
/**
 * Fixed memory headroom beyond weights + KV, used as the *fixed floor* in `usableBytes`. VRAM:
 * CUDA/HIP context (~0.55 GiB) + compute buffers + graph allocation (~1.5 GiB ≈ the oobabooga
 * GGUF-VRAM-formula intercept, ~1517 MiB). RAM: OS + other apps. Combined with the fraction caps
 * below via min(free − fixed, total × fraction) — a single model, never a stacked/double backoff.
 */
export const DEFAULT_VRAM_HEADROOM_BYTES = 1536 * MiB;
export const DEFAULT_RAM_HEADROOM_BYTES = 2 * GiB;

/**
 * Never use more than this fraction of TOTAL memory, regardless of reported free. VRAM 0.90 is the
 * fragmentation / CUDA-graph / desktop guardband (≈ vLLM's 10% reserve); RAM 0.75 keeps ≥25% for the
 * OS page cache so mmap'd weights don't thrash (research-grounding #23). Applied as the cap in
 * `usableBytes`. Involuntary paging past these collapses decode throughput ~78× (arXiv:2512.24637).
 */
export const VRAM_USABLE_FRACTION = 0.9;
export const RAM_USABLE_FRACTION = 0.75;

/**
 * Effective fraction of rated memory bandwidth realized during single-stream (batch=1) decode.
 * Decode is memory-bandwidth-bound, but real llama.cpp / Ollama / vLLM decode lands at ~60–80% of
 * the bandwidth roofline once KV reads, attention, sampling, and kernel-launch overhead are
 * included; raw STREAM bandwidth itself tops out ~85% of spec. Default 0.7 (overridable per call).
 * Omitting this factor makes predicted tok/s ~20–40% optimistic — the advisor's worst failure mode
 * (a confident, wrong speed). Refs: Yuan 2024 (arXiv:2402.16363), Imai 2024 (NeurIPS MLForSystems),
 * llama.cpp discussion #4167. See docs/research-grounding.md finding 2.
 */
export const BANDWIDTH_EFFICIENCY = 0.7;

/**
 * Effective VRAM bandwidth realized by MoE decode at batch=1, as a fraction of rated bandwidth — much
 * lower than the dense {@link BANDWIDTH_EFFICIENCY}. Routed-expert reads are a scattered gather (not
 * contiguous streaming) and a tiny active set under-utilizes the GPU, so a model whose active bytes
 * alone would predict hundreds of tok/s lands far lower. INTERIM single-anchor value, measured on this
 * rig (RTX 5090): qwen3.6:35b-a3b (36B / ~4B active, Q4_K_M) ran **136 tok/s** where the dense roofline
 * predicted ~490 (3.6× over) — implying ~0.18 effective. Consistent with the KTransformers DeepSeek-R1
 * range (~8.7–13.7 tok/s, research #27) applied to its 37B active. Fit to ONE MoE architecture — refine
 * via the batch=1-MoE efficiency study before treating as final. See docs/swarm/calibration-analysis.md.
 */
export const MOE_DECODE_EFFICIENCY = 0.18;

/**
 * Random small-block reads (the MoE expert-streaming pattern) run ~3–6× below sequential NVMe
 * (SPEC §3.1); the disk-tier benchmark divides its sequential measurement by this to model effective
 * random access rather than over-promising the disk tier.
 */
export const NVME_RANDOM_ACCESS_DISCOUNT = 4;

/**
 * Cap on the effective-random NVMe read the disk benchmark may report (post-discount). The portable
 * Node benchmark reads back a file it just wrote, so the OS page cache inflates the raw figure — treat
 * it as an optimistic upper bound and never let the experimental disk tier admit on an impossibly-fast
 * disk. ~2 GB/s effective-random is already generous for consumer PCIe4/5 NVMe (4K-random is often <1).
 */
export const NVME_EFFECTIVE_RANDOM_CEILING_BYTES_PER_SEC = 2 * GB;

/** Below this, an interactive loadout is flagged as sluggish (informational only). */
export const INTERACTIVE_MIN_TOK_PER_SEC = 5;

export const fmtGiB = (bytes: number): string => `${(bytes / GiB).toFixed(1)} GiB`;
