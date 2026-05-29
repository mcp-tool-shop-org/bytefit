import { GiB, GB } from "../constants.js";
import type { Hardware, ModelMeta } from "../types.js";

/** ~12 GB GPU / 16 GB RAM laptop-class box. */
export const weak: Hardware = {
  vramBytes: 12 * GiB,
  vramFreeBytes: 11.5 * GiB,
  vramBandwidthBytesPerSec: 360 * GB,
  ramBytes: 16 * GiB,
  ramFreeBytes: 14 * GiB,
  ramBandwidthBytesPerSec: 50 * GB,
  nvmeReadBytesPerSec: 2.5 * GB,
};

/** The Omen 45L: RTX 5090 32 GB + 64 GB DDR5. */
export const omen: Hardware = {
  vramBytes: 32 * GiB,
  vramFreeBytes: 29 * GiB,
  vramBandwidthBytesPerSec: 1790 * GB,
  ramBytes: 64 * GiB,
  ramFreeBytes: 45 * GiB,
  ramBandwidthBytesPerSec: 76.8 * GB,
  nvmeReadBytesPerSec: 3 * GB,
};

export const qwen14b: ModelMeta = {
  id: "qwen2.5-14b",
  totalParams: 14.8e9,
  isMoE: false,
  arch: { layers: 48, kvHeads: 8, headDim: 128 },
  builds: [
    { quant: "Q8_0", sizeBytes: 15.8 * GiB },
    { quant: "Q5_K_M", sizeBytes: 10.5 * GiB },
    { quant: "Q4_K_M", sizeBytes: 8.99 * GiB },
  ],
};

export const qwen30bA3b: ModelMeta = {
  id: "qwen3-30b-a3b",
  totalParams: 30.5e9,
  activatedParams: 3.3e9,
  isMoE: true,
  expertCount: 128,
  activeExperts: 8,
  arch: { layers: 48, kvHeads: 4, headDim: 128 },
  builds: [
    { quant: "Q4_K_M", sizeBytes: 18.6 * GiB },
    { quant: "Q3_K_L", sizeBytes: 14.6 * GiB },
    { quant: "Q2_K", sizeBytes: 10.9 * GiB },
    { quant: "IQ2_M", sizeBytes: 10.4 * GiB },
  ],
};

/** DeepSeek-R1-class: a huge MoE that wants server RAM — exercises the RAM wall. */
export const deepseekR1: ModelMeta = {
  id: "deepseek-r1",
  totalParams: 671e9,
  activatedParams: 37e9,
  isMoE: true,
  expertCount: 256,
  activeExperts: 8,
  arch: { layers: 61, kvHeads: 16, headDim: 128 },
  builds: [
    { quant: "Q4_K_M", sizeBytes: 380 * GiB },
    { quant: "IQ2_XXS", sizeBytes: 183 * GiB },
  ],
};
