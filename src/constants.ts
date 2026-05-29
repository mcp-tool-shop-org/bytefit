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
export const DEFAULT_VRAM_HEADROOM_BYTES = 512 * MiB;
export const DEFAULT_RAM_HEADROOM_BYTES = 2 * GiB;

/** Below this, an interactive loadout is flagged as sluggish (informational only). */
export const INTERACTIVE_MIN_TOK_PER_SEC = 5;

export const fmtGiB = (bytes: number): string => `${(bytes / GiB).toFixed(1)} GiB`;
