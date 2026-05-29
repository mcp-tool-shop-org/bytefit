import { test } from "node:test";
import assert from "node:assert/strict";
import { selectQuant, smallestQuant, bytesPerParam, GiB, type ModelMeta } from "../index.js";
import { qwen14b, qwen30bA3b } from "./fixtures.js";

test("bytesPerParam reflects bits-per-weight", () => {
  assert.equal(bytesPerParam("Q8_0"), 8.5 / 8);
  assert.equal(bytesPerParam("Q4_K_M"), 4.83 / 8);
});

test("selectQuant picks the highest-quality build that fits the budget", () => {
  assert.equal(selectQuant(qwen14b, 20 * GiB)?.build.quant, "Q8_0");
  assert.equal(selectQuant(qwen14b, 9.5 * GiB)?.build.quant, "Q4_K_M");
});

test("selectQuant returns undefined when nothing fits", () => {
  assert.equal(selectQuant(qwen14b, 1 * GiB), undefined);
});

test("requireFloor skips below-Q4_K_M builds", () => {
  const budget = 11 * GiB; // fits only Q2_K / IQ2_M for 30B-A3B (both below floor)
  const any = selectQuant(qwen30bA3b, budget);
  assert.ok(any && any.belowReasoningFloor, "without floor, a below-floor build is chosen");
  assert.equal(selectQuant(qwen30bA3b, budget, { requireFloor: true }), undefined);
});

test("a dynamic build wins ties on the same quant", () => {
  const model: ModelMeta = {
    ...qwen14b,
    builds: [
      { quant: "Q4_K_M", sizeBytes: 9 * GiB },
      { quant: "Q4_K_M", sizeBytes: 9 * GiB, dynamic: true },
    ],
  };
  assert.equal(selectQuant(model, 10 * GiB)?.build.dynamic, true);
});

test("smallestQuant returns the smallest build", () => {
  assert.equal(smallestQuant(qwen30bA3b)?.build.quant, "IQ2_M");
});
