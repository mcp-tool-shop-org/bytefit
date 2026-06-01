import type { Hardware } from "../types.js";

export type Confidence = "measured" | "estimated" | "unknown";

export type GpuVendor = "nvidia" | "amd" | "apple" | "intel" | "none";

export interface GpuInfo {
  vendor: GpuVendor;
  name: string;
  vramTotalBytes: number;
  /** Honest free VRAM (raw nvidia-smi / sysfs). The usable backoff is applied later in usableBytes. */
  vramFreeBytes: number;
  bandwidthBytesPerSec: number;
  bandwidthConfidence: Confidence;
  /** Optional advisory (e.g. multi-GPU: which card was chosen). Surfaced in ProbeResult.notes. */
  note?: string;
}

export interface RamInfo {
  totalBytes: number;
  /** Usable free RAM (Linux MemAvailable / macOS free+inactive / Windows ullAvailPhys). */
  freeBytes: number;
  bandwidthBytesPerSec: number;
  bandwidthConfidence: Confidence;
}

/** A probed Hardware struct (directly usable by the core) plus provenance/confidence detail. */
export interface ProbeResult extends Hardware {
  gpu: GpuInfo;
  ramConfidence: Confidence;
  nvmeConfidence: Confidence;
  notes: string[];
}

export interface ProbeOptions {
  /** Measure NVMe read with a timed temp-file benchmark (writes ~64 MiB). Off by default. */
  measureDisk?: boolean;
  /** Scratch directory for the disk benchmark (defaults to os.tmpdir()). */
  diskBenchDir?: string;
}
