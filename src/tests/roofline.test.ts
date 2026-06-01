import { test } from "node:test";
import assert from "node:assert/strict";
import { predictTokensPerSec, GB, BANDWIDTH_EFFICIENCY, type Hardware, type Placement } from "../index.js";

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

test("full-VRAM decode ≈ (vramBw·η) / (active + kv) bytes", () => {
  const p: Placement = { tier: "vram", activeVramBytes: 9 * GB, activeRamBytes: 0, activeDiskBytes: 0 };
  const tok = predictTokensPerSec(hw, p, 1 * GB);
  const expected = (360 * GB * BANDWIDTH_EFFICIENCY) / (10 * GB);
  assert.ok(approx(tok, expected), `expected ~${expected.toFixed(1)}, got ${tok}`);
});

test("efficiency override scales tok/s linearly", () => {
  const p: Placement = { tier: "vram", activeVramBytes: 9 * GB, activeRamBytes: 0, activeDiskBytes: 0 };
  const full = predictTokensPerSec(hw, p, 1 * GB, { efficiency: 1 });
  const half = predictTokensPerSec(hw, p, 1 * GB, { efficiency: 0.5 });
  assert.ok(approx(half, full * 0.5), `expected ${full * 0.5}, got ${half}`);
});

test("non-positive bandwidth yields 0, never NaN/Infinity", () => {
  const bad: Hardware = { ...hw, vramBandwidthBytesPerSec: 0 };
  const p: Placement = { tier: "vram", activeVramBytes: 1 * GB, activeRamBytes: 0, activeDiskBytes: 0 };
  assert.equal(predictTokensPerSec(bad, p, 1 * GB), 0);
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
