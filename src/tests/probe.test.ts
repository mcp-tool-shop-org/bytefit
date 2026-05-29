import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNvidiaSmiCsv,
  parseMemInfo,
  parseVmStat,
  parseWin32Memory,
  ramBandwidthBytesPerSec,
  nvidiaBandwidth,
  appleBandwidth,
} from "../index.js";

const MIB = 1024 * 1024;

test("parseNvidiaSmiCsv parses name + VRAM (MiB → bytes)", () => {
  const rows = parseNvidiaSmiCsv("NVIDIA GeForce RTX 5090, 32607, 29000\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.name, "NVIDIA GeForce RTX 5090");
  assert.equal(rows[0]?.vramTotalBytes, 32607 * MIB);
  assert.equal(rows[0]?.vramFreeBytes, 29000 * MIB);
});

test("nvidiaBandwidth matches longest name substring", () => {
  assert.equal(nvidiaBandwidth("NVIDIA GeForce RTX 5090").bytesPerSec, 1792e9);
  assert.equal(nvidiaBandwidth("NVIDIA GeForce RTX 3060 Ti").bytesPerSec, 448e9); // beats "rtx 3060"
  assert.equal(nvidiaBandwidth("Some Unlisted GPU").confidence, "unknown");
});

test("appleBandwidth matches chip tier", () => {
  assert.equal(appleBandwidth("Apple M4 Max").bytesPerSec, 546e9);
  assert.equal(appleBandwidth("Apple M1 Pro").bytesPerSec, 200e9); // beats "m1"
  assert.equal(appleBandwidth("Apple M5 Max").bytesPerSec, 512e9);
});

test("parseMemInfo reads MemTotal/MemAvailable (kB → bytes)", () => {
  const r = parseMemInfo("MemTotal:       65802500 kB\nMemFree:         1200000 kB\nMemAvailable:   32000000 kB\n");
  assert.equal(r.totalBytes, 65802500 * 1024);
  assert.equal(r.availableBytes, 32000000 * 1024);
});

test("parseVmStat sums free + inactive pages", () => {
  const sample = "Mach Virtual Memory Statistics:\nPages free:                          100000.\nPages inactive:                       50000.\n";
  assert.equal(parseVmStat(sample, 16384).availableBytes, (100000 + 50000) * 16384);
});

test("ramBandwidthBytesPerSec: DDR5-4800 dual-channel ≈ 76.8 GB/s", () => {
  assert.equal(ramBandwidthBytesPerSec(4800, 2, 64), 76.8e9);
});

test("parseWin32Memory takes the effective MT/s and counts DIMMs", () => {
  const r = parseWin32Memory("4800,5600,64\n4800,5600,64\n");
  assert.equal(r.mtPerSec, 4800);
  assert.equal(r.dimmCount, 2);
  assert.equal(r.dataWidthBits, 64);
});
