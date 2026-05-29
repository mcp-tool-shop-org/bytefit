/**
 * bytefit core types.
 * Canonical units: memory in bytes, bandwidth in bytes/second. Use the helpers in constants.ts.
 */

export type QuantType =
  | "F16"
  | "Q8_0"
  | "Q6_K"
  | "Q5_K_M"
  | "Q5_K_S"
  | "Q4_K_M"
  | "Q4_K_S"
  | "IQ4_XS"
  | "Q3_K_L"
  | "Q3_K_M"
  | "Q3_K_S"
  | "IQ3_M"
  | "Q2_K"
  | "IQ2_M"
  | "IQ2_XXS";

export type KVCacheType = "f16" | "q8_0" | "q4_0";

export type Tier = "vram" | "vram+ram" | "disk";

export type Verdict = "fits" | "degraded" | "refused";

export type UseCase = "reasoning" | "chat" | "bulk";

export type SpeculativeLane = "eagle2" | "medusa" | "self-speculative" | "none";

/** A specific downloadable quantization of a model. */
export interface QuantBuild {
  quant: QuantType;
  /** On-disk size in bytes. If omitted, estimated from bits-per-weight * params. */
  sizeBytes?: number;
  /** True if this build uses per-tensor mixed precision (e.g. an Unsloth Dynamic GGUF). */
  dynamic?: boolean;
}

/** Architecture facts needed for KV-cache math. */
export interface ModelArch {
  layers: number;
  /** KV heads (= attention heads unless GQA/MQA reduces it). */
  kvHeads: number;
  headDim: number;
}

export interface ModelMeta {
  id: string;
  totalParams: number;
  /** Activated params per token. For dense models, equals totalParams. */
  activatedParams?: number;
  isMoE: boolean;
  expertCount?: number;
  activeExperts?: number;
  arch: ModelArch;
  /** Available quantization builds, in any order. */
  builds: QuantBuild[];
}

export interface Hardware {
  vramBytes: number;
  vramFreeBytes: number;
  /** Aggregate GPU memory bandwidth (bytes/sec). */
  vramBandwidthBytesPerSec: number;
  ramBytes: number;
  ramFreeBytes: number;
  /** System RAM bandwidth (bytes/sec). */
  ramBandwidthBytesPerSec: number;
  /** Measured sustained NVMe read for the model store (bytes/sec). Required for the disk tier. */
  nvmeReadBytesPerSec?: number;
}

export interface PlanOptions {
  /** Desired context length in tokens. Default 8192. */
  contextLength?: number;
  useCase?: UseCase;
  /** Allow `degraded` loadouts (aggressive quant, partial offload). Default true. */
  allowDegraded?: boolean;
  /** Permit the experimental MoE disk-streaming tier. Default false. */
  experimentalDisk?: boolean;
  /** Force a KV cache type instead of letting bytefit choose. Default q8_0. */
  kvCacheType?: KVCacheType;
  /** VRAM safety margin in bytes (activations/buffers). Default 512 MiB. */
  vramHeadroomBytes?: number;
  /** RAM safety margin in bytes (OS/other apps). Default 2 GiB. */
  ramHeadroomBytes?: number;
}

export interface Placement {
  tier: Tier;
  /** For dense partial offload: transformer layers kept on GPU. */
  gpuLayers?: number;
  /** For MoE: routed experts placed on CPU/RAM (and/or disk). */
  cpuMoEExperts?: boolean;
  /** Active-path bytes resident on each tier (drives the roofline). */
  activeVramBytes: number;
  activeRamBytes: number;
  activeDiskBytes: number;
}

export interface Footprint {
  weightBytesTotal: number;
  weightBytesActivePerToken: number;
  kvBytesPerToken: number;
  kvBytesTotal: number;
  vramWeightBytes: number;
  ramWeightBytes: number;
  diskWeightBytes: number;
  vramRequiredBytes: number;
  ramRequiredBytes: number;
}

export interface Refusal {
  code: string;
  message: string;
  hint: string;
}

export interface Loadout {
  modelId: string;
  verdict: Verdict;
  quant?: QuantType;
  kvCacheType?: KVCacheType;
  contextLength?: number;
  placement?: Placement;
  speculativeLane?: SpeculativeLane;
  predictedTokensPerSec?: number;
  footprint?: Footprint;
  reasoning: string[];
  refusal?: Refusal;
}

export interface PlanRequest {
  hardware: Hardware;
  model: ModelMeta;
  options?: PlanOptions;
}
