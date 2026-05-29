const MIB = 1024 * 1024;

/** Parse `nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits` (MiB). */
export function parseNvidiaSmiCsv(
  csv: string,
): Array<{ name: string; vramTotalBytes: number; vramFreeBytes: number }> {
  const out: Array<{ name: string; vramTotalBytes: number; vramFreeBytes: number }> = [];
  for (const line of csv.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(",").map((s) => s.trim());
    const name = parts[0] ?? "";
    const total = Number(parts[1]);
    const free = Number(parts[2]);
    if (!name || Number.isNaN(total) || Number.isNaN(free)) continue;
    out.push({ name, vramTotalBytes: total * MIB, vramFreeBytes: free * MIB });
  }
  return out;
}

/** Parse Linux /proc/meminfo for MemTotal & MemAvailable (reported in kB) → bytes. */
export function parseMemInfo(text: string): { totalBytes?: number; availableBytes?: number } {
  const kb = (key: string): number | undefined => {
    const m = new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, "m").exec(text);
    return m && m[1] !== undefined ? Number(m[1]) * 1024 : undefined;
  };
  return { totalBytes: kb("MemTotal"), availableBytes: kb("MemAvailable") };
}

/** Parse macOS `vm_stat`: usable ≈ (free + inactive) pages × page size. */
export function parseVmStat(text: string, pageSizeBytes = 4096): { availableBytes?: number } {
  const pages = (key: string): number | undefined => {
    const m = new RegExp(`${key}:\\s+(\\d+)\\.`, "m").exec(text);
    return m && m[1] !== undefined ? Number(m[1]) : undefined;
  };
  const free = pages("Pages free");
  const inactive = pages("Pages inactive");
  if (free === undefined && inactive === undefined) return {};
  return { availableBytes: ((free ?? 0) + (inactive ?? 0)) * pageSizeBytes };
}

/** RAM bandwidth from effective transfer rate (MT/s), channel count, and per-channel width (bits). */
export function ramBandwidthBytesPerSec(mtPerSec: number, channels: number, dataWidthBits = 64): number {
  return mtPerSec * (dataWidthBits / 8) * channels * 1_000_000;
}

/**
 * Parse our Win32_PhysicalMemory query CSV ("ConfiguredClockSpeed,Speed,DataWidth" per DIMM).
 * Win32 reports these already in MT/s (DDR5-4800 → 4800), so no doubling is applied.
 */
export function parseWin32Memory(csv: string): { mtPerSec?: number; dimmCount: number; dataWidthBits: number } {
  let mt = 0;
  let dimmCount = 0;
  let dataWidthBits = 64;
  for (const line of csv.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(",").map((s) => s.trim());
    const configured = Number(parts[0]);
    const speed = Number(parts[1]);
    const dw = Number(parts[2]);
    const eff = !Number.isNaN(configured) && configured > 0 ? configured : speed;
    if (!Number.isNaN(eff) && eff > 0) {
      mt = Math.max(mt, eff);
      dimmCount++;
    }
    if (!Number.isNaN(dw) && dw > 0) dataWidthBits = dw;
  }
  return { mtPerSec: mt > 0 ? mt : undefined, dimmCount, dataWidthBits };
}
