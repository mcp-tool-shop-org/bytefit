import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { totalmem, freemem, platform } from "node:os";
import { tmpdir } from "node:os";
import { readFile, open, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Hardware } from "../types.js";
import { MiB } from "../constants.js";
import type { GpuInfo, RamInfo, ProbeResult, ProbeOptions, Confidence } from "./types.js";
import { nvidiaBandwidth, appleBandwidth } from "./gpu-tables.js";
import {
  parseNvidiaSmiCsv,
  parseMemInfo,
  parseVmStat,
  parseWin32Memory,
  ramBandwidthBytesPerSec,
} from "./parsers.js";

const execFile = promisify(execFileCb);

/** Ollama-style backoff on reported free VRAM (driver fragmentation / reserved). */
const VRAM_USABLE_FACTOR = 0.9;

/** Run a system binary with fixed args (no shell). Returns stdout, or undefined if it fails/absent. */
async function run(cmd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFile(cmd, args, { timeout: 8000, windowsHide: true });
    return stdout;
  } catch {
    return undefined;
  }
}

export async function probeGpu(): Promise<GpuInfo> {
  // NVIDIA — any platform with nvidia-smi on PATH.
  const smi = await run("nvidia-smi", ["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"]);
  if (smi) {
    const g = parseNvidiaSmiCsv(smi)[0];
    if (g) {
      const bw = nvidiaBandwidth(g.name);
      return {
        vendor: "nvidia",
        name: g.name,
        vramTotalBytes: g.vramTotalBytes,
        vramFreeBytes: Math.floor(g.vramFreeBytes * VRAM_USABLE_FACTOR),
        bandwidthBytesPerSec: bw.bytesPerSec,
        bandwidthConfidence: bw.confidence,
      };
    }
  }

  // Apple Silicon — unified memory.
  if (platform() === "darwin") {
    const brand = (await run("sysctl", ["-n", "machdep.cpu.brand_string"]))?.trim() ?? "Apple Silicon";
    const total = totalmem();
    const vram = Math.floor(total * 0.75); // ~recommendedMaxWorkingSetSize
    const bw = appleBandwidth(brand);
    return {
      vendor: "apple",
      name: brand,
      vramTotalBytes: vram,
      vramFreeBytes: Math.floor(Math.min(vram, freemem()) * VRAM_USABLE_FACTOR),
      bandwidthBytesPerSec: bw.bytesPerSec,
      bandwidthConfidence: bw.confidence,
    };
  }

  // AMD on Linux — kernel sysfs (no subprocess).
  if (platform() === "linux") {
    const total = await readFile("/sys/class/drm/card0/device/mem_info_vram_total", "utf8")
      .then((s) => Number(s.trim()))
      .catch(() => NaN);
    if (!Number.isNaN(total) && total > 0) {
      const used = await readFile("/sys/class/drm/card0/device/mem_info_vram_used", "utf8")
        .then((s) => Number(s.trim()))
        .catch(() => NaN);
      const free = Number.isNaN(used) ? total : total - used;
      return {
        vendor: "amd",
        name: "AMD GPU (sysfs)",
        vramTotalBytes: total,
        vramFreeBytes: Math.floor(free * VRAM_USABLE_FACTOR),
        bandwidthBytesPerSec: 360 * 1_000_000_000,
        bandwidthConfidence: "unknown",
      };
    }
  }

  return { vendor: "none", name: "none (CPU-only)", vramTotalBytes: 0, vramFreeBytes: 0, bandwidthBytesPerSec: 0, bandwidthConfidence: "unknown" };
}

export async function probeRam(): Promise<RamInfo> {
  const totalBytes = totalmem();
  let freeBytes = freemem(); // correct on Windows (ullAvailPhys); refined below on Linux/macOS
  const p = platform();

  if (p === "linux") {
    const parsed = parseMemInfo(await readFile("/proc/meminfo", "utf8").catch(() => ""));
    if (parsed.availableBytes !== undefined) freeBytes = parsed.availableBytes;
  } else if (p === "darwin") {
    const vm = await run("vm_stat", []);
    if (vm) {
      const parsed = parseVmStat(vm, 16384); // Apple Silicon page size = 16 KiB
      if (parsed.availableBytes !== undefined) freeBytes = parsed.availableBytes;
    }
  }

  let bandwidthBytesPerSec = 0;
  let bandwidthConfidence: Confidence = "unknown";
  if (p === "win32") {
    const csv = await run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      'Get-CimInstance Win32_PhysicalMemory | ForEach-Object { "$($_.ConfiguredClockSpeed),$($_.Speed),$($_.DataWidth)" }',
    ]);
    if (csv) {
      const { mtPerSec, dimmCount, dataWidthBits } = parseWin32Memory(csv);
      if (mtPerSec) {
        const channels = Math.min(Math.max(dimmCount, 1), 2); // consumer boards are dual-channel
        bandwidthBytesPerSec = ramBandwidthBytesPerSec(mtPerSec, channels, dataWidthBits);
        bandwidthConfidence = "estimated";
      }
    }
  }
  if (bandwidthBytesPerSec === 0) {
    bandwidthBytesPerSec = 64 * 1_000_000_000; // DDR5 dual-channel-ish fallback
    bandwidthConfidence = "unknown";
  }

  return { totalBytes, freeBytes, bandwidthBytesPerSec, bandwidthConfidence };
}

async function probeNvme(opts: ProbeOptions): Promise<{ bytesPerSec?: number; confidence: Confidence }> {
  if (!opts.measureDisk) return { confidence: "unknown" };
  const file = join(opts.diskBenchDir ?? tmpdir(), `bytefit-bench-${process.pid}.bin`);
  try {
    const sizeMiB = 64;
    const buf = Buffer.alloc(MiB);
    const wfh = await open(file, "w");
    for (let i = 0; i < sizeMiB; i++) await wfh.write(buf, 0, MiB);
    await wfh.sync();
    await wfh.close();

    const start = process.hrtime.bigint();
    const rfh = await open(file, "r");
    const rbuf = Buffer.alloc(MiB);
    let read = 0;
    for (let i = 0; i < sizeMiB; i++) {
      const { bytesRead } = await rfh.read(rbuf, 0, MiB, i * MiB);
      read += bytesRead;
    }
    await rfh.close();
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    return { bytesPerSec: read / seconds, confidence: "measured" };
  } catch {
    return { confidence: "unknown" };
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
}

/**
 * Probe the machine into a Hardware struct the core can plan against, plus confidence/notes.
 * Each sub-probe degrades gracefully (missing binary / unreadable path → conservative fallback).
 */
export async function probe(opts: ProbeOptions = {}): Promise<ProbeResult> {
  const [gpu, ram, nvme] = await Promise.all([probeGpu(), probeRam(), probeNvme(opts)]);

  const notes: string[] = [];
  if (gpu.vendor === "none") notes.push("No GPU detected — CPU-only; weights run from RAM.");
  else if (gpu.bandwidthConfidence === "unknown") notes.push(`GPU '${gpu.name}' not in the bandwidth table — using a conservative estimate.`);
  if (ram.bandwidthConfidence !== "estimated") notes.push("RAM speed not detected — bandwidth is a rough estimate.");

  const hw: Hardware = {
    vramBytes: gpu.vramTotalBytes,
    vramFreeBytes: gpu.vramFreeBytes,
    vramBandwidthBytesPerSec: gpu.bandwidthBytesPerSec,
    ramBytes: ram.totalBytes,
    ramFreeBytes: ram.freeBytes,
    ramBandwidthBytesPerSec: ram.bandwidthBytesPerSec,
    ...(nvme.bytesPerSec !== undefined ? { nvmeReadBytesPerSec: nvme.bytesPerSec } : {}),
  };

  return { ...hw, gpu, ramConfidence: ram.bandwidthConfidence, nvmeConfidence: nvme.confidence, notes };
}
