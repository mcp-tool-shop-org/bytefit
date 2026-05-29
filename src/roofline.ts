import type { Hardware, Placement } from "./types.js";

/**
 * Blended roofline for autoregressive decode. Decode is memory-bandwidth-bound:
 *
 *   time-per-token = Σ (active bytes resident on a tier ÷ that tier's bandwidth)
 *                    + (KV bytes read ÷ VRAM bandwidth)
 *   tok/s = 1 / time-per-token
 *
 * `kvBytesRead` should be the KV cache size at the planned context length (conservative:
 * assumes the whole cache is traversed each step, which is the worst case at full context).
 * Returns 0 when a disk tier is required but no NVMe bandwidth is known.
 */
export function predictTokensPerSec(
  hardware: Hardware,
  placement: Placement,
  kvBytesRead: number,
): number {
  const vbw = hardware.vramBandwidthBytesPerSec;
  const rbw = hardware.ramBandwidthBytesPerSec;
  let timePerToken = 0;

  if (placement.activeVramBytes > 0) timePerToken += placement.activeVramBytes / vbw;
  if (placement.activeRamBytes > 0) timePerToken += placement.activeRamBytes / rbw;
  if (placement.activeDiskBytes > 0) {
    const dbw = hardware.nvmeReadBytesPerSec ?? 0;
    if (dbw <= 0) return 0;
    timePerToken += placement.activeDiskBytes / dbw;
  }
  // KV cache is assumed to reside in VRAM and is read each decode step.
  if (kvBytesRead > 0) timePerToken += kvBytesRead / vbw;

  if (timePerToken <= 0) return 0;
  return 1 / timePerToken;
}
