import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, recommend } from "../index.js";
import { weak, omen, qwen14b, qwen30bA3b, deepseekR1 } from "./fixtures.js";

test("14B on a 12GB/16GB box fits in VRAM at a sane quant", () => {
  const lo = plan({ hardware: weak, model: qwen14b, options: { useCase: "chat" } });
  assert.equal(lo.verdict, "fits");
  assert.equal(lo.placement?.tier, "vram");
  assert.ok(lo.quant === "Q4_K_M" || lo.quant === "Q5_K_M");
  assert.ok((lo.predictedTokensPerSec ?? 0) > 0);
});

test("DeepSeek-class MoE is refused on consumer hardware (the RAM wall)", () => {
  const lo = plan({ hardware: omen, model: deepseekR1, options: { useCase: "chat" } });
  assert.equal(lo.verdict, "refused");
  assert.ok(lo.refusal);
});

test("DeepSeek-class streams from disk only when experimentalDisk is set", () => {
  const lo = plan({ hardware: omen, model: deepseekR1, options: { experimentalDisk: true } });
  assert.equal(lo.verdict, "degraded");
  assert.equal(lo.placement?.tier, "disk");
  assert.equal(lo.speculativeLane, "self-speculative");
});

test("30B-A3B runs on the weak box (the MoE stretch target)", () => {
  const lo = plan({ hardware: weak, model: qwen30bA3b, options: { useCase: "chat" } });
  assert.notEqual(lo.verdict, "refused");
  assert.ok((lo.predictedTokensPerSec ?? 0) > 0);
});

test("recommend ranks runnable models best-first and drops refused ones", () => {
  const recs = recommend(weak, [qwen14b, qwen30bA3b, deepseekR1], { useCase: "chat" });
  assert.ok(recs.length >= 1);
  assert.ok(recs.every((r) => r.loadout.verdict !== "refused"));
  assert.ok(!recs.some((r) => r.loadout.modelId === "deepseek-r1"));
  for (let i = 1; i < recs.length; i++) {
    assert.ok(recs[i - 1]!.capabilityScore >= recs[i]!.capabilityScore);
  }
});
