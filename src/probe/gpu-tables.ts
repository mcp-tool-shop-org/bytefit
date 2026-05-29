import type { Confidence } from "./types.js";

const GBPS = 1_000_000_000;

/** NVIDIA GPU memory bandwidth (GB/s), matched by case-insensitive name substring (TechPowerUp). */
const NVIDIA_BANDWIDTH_GBPS: Array<[string, number]> = [
  ["rtx 5090", 1792],
  ["rtx 5080", 960],
  ["rtx 5070 ti", 896],
  ["rtx 5070", 672],
  ["rtx 4090", 1008],
  ["rtx 4080", 717],
  ["rtx 4070 ti", 504],
  ["rtx 4070", 504],
  ["rtx 4060", 272],
  ["rtx 3090 ti", 1008],
  ["rtx 3090", 936],
  ["rtx 3080 ti", 912],
  ["rtx 3080", 760],
  ["rtx 3070", 448],
  ["rtx 3060 ti", 448],
  ["rtx 3060", 360],
  ["a100", 1555],
  ["h100", 3350],
  ["l40", 864],
  ["a6000", 768],
  ["a40", 696],
];

/** Apple Silicon memory bandwidth (GB/s) by chip, matched by name substring (Apple-published). */
const APPLE_BANDWIDTH_GBPS: Array<[string, number]> = [
  ["m1 ultra", 800],
  ["m1 max", 400],
  ["m1 pro", 200],
  ["m1", 68],
  ["m2 ultra", 800],
  ["m2 max", 400],
  ["m2 pro", 200],
  ["m2", 100],
  ["m3 ultra", 800],
  ["m3 max", 400],
  ["m3 pro", 150],
  ["m3", 100],
  ["m4 max", 546],
  ["m4 pro", 273],
  ["m4", 120],
  ["m5 max", 512],
  ["m5 pro", 300],
  ["m5", 153],
];

/** Longest key first so "rtx 3060 ti" wins over "rtx 3060", "m1 pro" over "m1". */
function lookup(table: Array<[string, number]>, name: string): number | undefined {
  const n = name.toLowerCase();
  for (const [key, gbps] of [...table].sort((a, b) => b[0].length - a[0].length)) {
    if (n.includes(key)) return gbps;
  }
  return undefined;
}

export function nvidiaBandwidth(name: string): { bytesPerSec: number; confidence: Confidence } {
  const gbps = lookup(NVIDIA_BANDWIDTH_GBPS, name);
  return gbps !== undefined
    ? { bytesPerSec: gbps * GBPS, confidence: "estimated" }
    : { bytesPerSec: 360 * GBPS, confidence: "unknown" }; // conservative GDDR6-class floor
}

export function appleBandwidth(chip: string): { bytesPerSec: number; confidence: Confidence } {
  const gbps = lookup(APPLE_BANDWIDTH_GBPS, chip);
  return gbps !== undefined
    ? { bytesPerSec: gbps * GBPS, confidence: "estimated" }
    : { bytesPerSec: 100 * GBPS, confidence: "unknown" };
}
