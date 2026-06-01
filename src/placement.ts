import type {
  Hardware,
  ModelMeta,
  QuantBuild,
  Placement,
  Verdict,
  Refusal,
} from "./types.js";
import { fmtGiB, VRAM_USABLE_FRACTION, RAM_USABLE_FRACTION } from "./constants.js";
import { buildWeightBytes, activeWeightBytesPerToken, usableBytes } from "./footprint.js";

export interface PlacementResult {
  placement?: Placement;
  verdict: Verdict;
  refusal?: Refusal;
  vramWeightBytes: number;
  ramWeightBytes: number;
  diskWeightBytes: number;
  vramRequiredBytes: number;
  ramRequiredBytes: number;
}

export interface PlacementOptions {
  vramHeadroomBytes: number;
  ramHeadroomBytes: number;
  experimentalDisk: boolean;
}

/**
 * Decide where a build's weights live (VRAM / VRAM+RAM / experimental disk) given the hardware,
 * or REFUSE rather than let inference fall into uncontrolled paging. This is bytefit's core guard.
 *
 * Active-path bytes are split across tiers in proportion to where the weights sit — for MoE this
 * approximates "experts on the slow tier, attention on the fast tier."
 */
export function placeAndAdmit(
  hardware: Hardware,
  model: ModelMeta,
  build: QuantBuild,
  kvBytesTotal: number,
  opts: PlacementOptions,
): PlacementResult {
  const weightTotal = buildWeightBytes(model, build);
  const activePerTok = activeWeightBytesPerToken(model, build);
  const usableVram = usableBytes(hardware.vramFreeBytes, hardware.vramBytes, opts.vramHeadroomBytes, VRAM_USABLE_FRACTION);
  const usableRam = usableBytes(hardware.ramFreeBytes, hardware.ramBytes, opts.ramHeadroomBytes, RAM_USABLE_FRACTION);

  const activeOn = (weightBytes: number): number =>
    weightTotal > 0 ? activePerTok * (weightBytes / weightTotal) : 0;

  // KV must fit in VRAM alongside whatever weights we keep there.
  if (kvBytesTotal > usableVram) {
    return refuse({
      code: "KV_EXCEEDS_VRAM",
      message: `KV cache (${fmtGiB(kvBytesTotal)}) exceeds usable VRAM (${fmtGiB(usableVram)}).`,
      hint: "Lower the context length or use a smaller KV cache type (q8_0 or q4_0).",
    });
  }
  const vramForWeights = usableVram - kvBytesTotal;

  // Case A — fully resident in VRAM (the fast lane).
  if (weightTotal <= vramForWeights) {
    return {
      placement: {
        tier: "vram",
        gpuLayers: model.arch.layers,
        cpuMoEExperts: false,
        activeVramBytes: activePerTok,
        activeRamBytes: 0,
        activeDiskBytes: 0,
      },
      verdict: "fits",
      vramWeightBytes: weightTotal,
      ramWeightBytes: 0,
      diskWeightBytes: 0,
      vramRequiredBytes: weightTotal + kvBytesTotal,
      ramRequiredBytes: 0,
    };
  }

  const vramWeightBytes = vramForWeights;
  const overflow = weightTotal - vramWeightBytes;

  // Case B — VRAM + RAM offload.
  if (overflow <= usableRam) {
    // Partial MoE offload: put the experts of ~(overflow fraction) of layers on CPU. Omit when every
    // layer's experts must leave the GPU — emit then uses a blanket -ot instead of --n-cpu-moe.
    const cpuMoELayers = model.isMoE
      ? Math.min(model.arch.layers, Math.max(1, Math.ceil(model.arch.layers * (overflow / weightTotal))))
      : undefined;
    return {
      placement: {
        tier: "vram+ram",
        gpuLayers: Math.round(model.arch.layers * (vramWeightBytes / weightTotal)),
        cpuMoEExperts: model.isMoE,
        ...(cpuMoELayers !== undefined && cpuMoELayers < model.arch.layers ? { cpuMoELayers } : {}),
        activeVramBytes: activeOn(vramWeightBytes),
        activeRamBytes: activeOn(overflow),
        activeDiskBytes: 0,
      },
      verdict: "degraded",
      vramWeightBytes,
      ramWeightBytes: overflow,
      diskWeightBytes: 0,
      vramRequiredBytes: vramWeightBytes + kvBytesTotal,
      ramRequiredBytes: overflow,
    };
  }

  // Case C — exceeds VRAM + RAM.
  const ramWeightBytes = usableRam;
  const diskWeightBytes = weightTotal - vramWeightBytes - ramWeightBytes;
  const canStream = model.isMoE && opts.experimentalDisk && (hardware.nvmeReadBytesPerSec ?? 0) > 0;

  if (canStream) {
    return {
      placement: {
        tier: "disk",
        gpuLayers: Math.round(model.arch.layers * (vramWeightBytes / weightTotal)),
        cpuMoEExperts: true,
        activeVramBytes: activeOn(vramWeightBytes),
        activeRamBytes: activeOn(ramWeightBytes),
        activeDiskBytes: activeOn(diskWeightBytes),
      },
      verdict: "degraded",
      vramWeightBytes,
      ramWeightBytes,
      diskWeightBytes,
      vramRequiredBytes: vramWeightBytes + kvBytesTotal,
      ramRequiredBytes: ramWeightBytes,
    };
  }

  const combined = usableVram + usableRam;
  if (model.isMoE) {
    return refuse({
      code: "WONT_FIT_MOE",
      message: `Weights (${fmtGiB(weightTotal)}) exceed usable VRAM+RAM (${fmtGiB(combined)}). This needs server-class RAM; refusing rather than page (involuntary paging collapses throughput ~78×, arXiv:2512.24637).`,
      hint: "Use a smaller quant or model, add RAM, or pass experimentalDisk to stream experts from NVMe (slow, MoE-only).",
    });
  }
  return refuse({
    code: "WONT_FIT_DENSE",
    message: `Weights (${fmtGiB(weightTotal)}) exceed usable VRAM+RAM (${fmtGiB(combined)}); a dense model cannot stream from disk usably. Refusing rather than page (involuntary paging collapses throughput ~78×, arXiv:2512.24637).`,
    hint: "Use a smaller quant or a smaller model, or add RAM.",
  });
}

function refuse(refusal: Refusal): PlacementResult {
  return {
    verdict: "refused",
    refusal,
    vramWeightBytes: 0,
    ramWeightBytes: 0,
    diskWeightBytes: 0,
    vramRequiredBytes: 0,
    ramRequiredBytes: 0,
  };
}
