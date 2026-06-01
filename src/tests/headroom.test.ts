import { test } from "node:test";
import assert from "node:assert/strict";
import { usableBytes, GiB, MiB } from "../index.js";

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1 * MiB;

// The fixed floor binds when free is comfortably below the percentage cap.
test("usableBytes subtracts the fixed floor when free is the binding constraint", () => {
  // 11.5 free / 12 total, 1.5 GiB floor, 0.9 cap → free−floor = 10.0 < 12×0.9 = 10.8 → 10.0
  assert.ok(near(usableBytes(11.5 * GiB, 12 * GiB, 1536 * MiB, 0.9), 10.0 * GiB));
});

// The percentage cap binds when free is near total — this is what kills the old double-backoff
// (probe used to pre-multiply free by 0.9, then the planner subtracted 1.5 GiB again).
test("usableBytes caps at total×fraction when free is near total (no double backoff)", () => {
  // 32 free / 32 total → free−floor = 30.5, capped at 32×0.9 = 28.8 → 28.8
  assert.ok(near(usableBytes(32 * GiB, 32 * GiB, 1536 * MiB, 0.9), 28.8 * GiB));
});

test("usableBytes never returns negative on a tiny tier", () => {
  assert.equal(usableBytes(1 * GiB, 8 * GiB, 2 * GiB, 0.9), 0);
});

test("RAM cap keeps ≥25% of total for the OS page cache", () => {
  // 60 free / 64 total, 2 GiB floor, 0.75 cap → free−floor = 58, capped at 64×0.75 = 48 → 48
  assert.ok(near(usableBytes(60 * GiB, 64 * GiB, 2 * GiB, 0.75), 48 * GiB));
});
