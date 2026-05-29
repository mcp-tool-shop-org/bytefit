import { test } from "node:test";
import assert from "node:assert/strict";
import { predictTokensPerSec, GB, type Hardware, type Placement } from "../index.js";

const hw: Hardware = {
  vramBytes: 0,
  vramFreeBytes: 0,
  vramBandwidthBytesPerSec: 360 * GB,
  ramBytes: 0,
  ramFreeBytes: 0,
  ramBandwidthBytesPerSec: 50 * GB,
  nvmeReadBytesPerSec: 2 * GB,
};

const approx = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol * Math.abs(b);

test("full-VRAM decode ≈ vramBw / (active + kv) bytes", () => {
  const p: Placement = { tier: "vram", activeVramBytes: 9 * GB, activeRamBytes: 0, activeDiskBytes: 0 };
  const tok = predictTokensPerSec(hw, p, 1 * GB);
  assert.ok(approx(tok, (360 * GB) / (10 * GB)), `expected ~36, got ${tok}`);
});

test("RAM offload is slower than the same active bytes in VRAM", () => {
  const vramOnly: Placement = { tier: "vram", activeVramBytes: 2 * GB, activeRamBytes: 0, activeDiskBytes: 0 };
  const offload: Placement = { tier: "vram+ram", activeVramBytes: 1 * GB, activeRamBytes: 1 * GB, activeDiskBytes: 0 };
  assert.ok(predictTokensPerSec(hw, offload, 0) < predictTokensPerSec(hw, vramOnly, 0));
});

test("disk tier without NVMe bandwidth returns 0 (no pretending)", () => {
  const noNvme: Hardware = {
    vramBytes: 0,
    vramFreeBytes: 0,
    vramBandwidthBytesPerSec: 360 * GB,
    ramBytes: 0,
    ramFreeBytes: 0,
    ramBandwidthBytesPerSec: 50 * GB,
  };
  const p: Placement = { tier: "disk", activeVramBytes: 1 * GB, activeRamBytes: 1 * GB, activeDiskBytes: 5 * GB };
  assert.equal(predictTokensPerSec(noNvme, p, 0), 0);
});
