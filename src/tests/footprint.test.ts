import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kvBytesPerToken,
  kvBytesTotal,
  activeWeightBytesPerToken,
  buildWeightBytes,
  bytesPerParam,
  GiB,
} from "../index.js";
import { qwen14b, qwen30bA3b } from "./fixtures.js";

test("kvBytesPerToken = 2 * layers * kvHeads * headDim * bytesPerElem", () => {
  assert.equal(kvBytesPerToken(qwen14b, "f16"), 2 * 48 * 8 * 128 * 2);
  assert.equal(kvBytesPerToken(qwen14b, "q8_0"), 2 * 48 * 8 * 128 * 1);
});

test("kvBytesTotal scales linearly with context", () => {
  assert.equal(kvBytesTotal(qwen14b, "q8_0", 8192), kvBytesPerToken(qwen14b, "q8_0") * 8192);
});

test("MoE reads only activated params per token; dense reads all", () => {
  const build = { quant: "Q4_K_M" as const };
  const dense = activeWeightBytesPerToken(qwen14b, build);
  const moe = activeWeightBytesPerToken(qwen30bA3b, build);
  assert.equal(dense, bytesPerParam("Q4_K_M") * qwen14b.totalParams);
  assert.equal(moe, bytesPerParam("Q4_K_M") * (qwen30bA3b.activatedParams ?? 0));
  assert.ok(moe < dense, "30B-A3B active path is smaller than 14B dense");
});

test("buildWeightBytes prefers a real size over the estimate", () => {
  assert.equal(buildWeightBytes(qwen14b, { quant: "Q4_K_M", sizeBytes: 9 * GiB }), 9 * GiB);
  assert.equal(buildWeightBytes(qwen14b, { quant: "Q4_K_M" }), bytesPerParam("Q4_K_M") * qwen14b.totalParams);
});
