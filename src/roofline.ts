import type { Hardware, Placement } from "./types.js";
import { BANDWIDTH_EFFICIENCY } from "./constants.js";

/**
 * Blended roofline for autoregressive decode. Decode is memory-bandwidth-bound:
 *
 *   time-per-token = Σ (active bytes resident on a tier ÷ that tier's EFFECTIVE bandwidth)
 *                    + (KV bytes read ÷ effective VRAM bandwidth)
 *   tok/s = 1 / time-per-token
 *
 * Bandwidth is discounted by `efficiency` (η, default `BANDWIDTH_EFFICIENCY`): real decode realizes
 * only ~60–80% of the rated-bandwidth roofline. Without it, predicted tok/s runs ~20–40% optimistic.
 *
 * `kvBytesRead` should be the KV cache size at the planned context length (conservative: assumes the
 * whole cache is traversed each step, which is the worst case at full context). Returns 0 — never a
 * NaN/Infinity — when a disk tier is required but no NVMe bandwidth is known, or any tier's bandwidth
 * is non-positive (a bad/unknown probe), so a missing number can never masquerade as a fast loadout.
 */
export function predictTokensPerSec(
  hardware: Hardware,
  placement: Placement,
  kvBytesRead: number,
  opts: { efficiency?: number; overheadSecondsPerToken?: number } = {},
): number {
  const eff = opts.efficiency ?? BANDWIDTH_EFFICIENCY;
  const overhead = opts.overheadSecondsPerToken ?? 0;
  const vbw = hardware.vramBandwidthBytesPerSec * eff;
  const rbw = hardware.ramBandwidthBytesPerSec * eff;
  let timePerToken = 0;

  if (placement.activeVramBytes > 0) {
    if (!(vbw > 0)) return 0;
    timePerToken += placement.activeVramBytes / vbw;
  }
  if (placement.activeRamBytes > 0) {
    if (!(rbw > 0)) return 0;
    timePerToken += placement.activeRamBytes / rbw;
  }
  if (placement.activeDiskBytes > 0) {
    const dbw = (hardware.nvmeReadBytesPerSec ?? 0) * eff;
    if (!(dbw > 0)) return 0;
    timePerToken += placement.activeDiskBytes / dbw;
  }
  // KV cache is assumed to reside in VRAM and is read each decode step.
  if (kvBytesRead > 0) {
    if (!(vbw > 0)) return 0;
    timePerToken += kvBytesRead / vbw;
  }

  // Per-token fixed overhead (kernel launch, scheduling, sampling). Default 0 — a calibration hook:
  // roofline + a measured overhead term cuts prediction error materially (Imai 2024, NeurIPS MLForSys),
  // but no fabricated constant is shipped; a caller can pass a rig-measured value.
  timePerToken += overhead;

  if (!Number.isFinite(timePerToken) || timePerToken <= 0) return 0;
  return 1 / timePerToken;
}
