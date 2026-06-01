import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, recommend, bytesPerParam, GiB, GB, type Hardware } from "../index.js";
import { weak, omen, qwen14b, qwen30bA3b, deepseekR1, qwen3Next80b, highRamConsumer } from "./fixtures.js";

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

test("P0 regression: Qwen3-Next-80B-A3B at 4-bit is NOT refused on a 64 GB consumer box", () => {
  // It's ~46 GB at 4-bit (not the ~320 GB FP32 figure) with ~3 B active/token — must run, not refuse.
  const lo = plan({ hardware: highRamConsumer, model: qwen3Next80b, options: { useCase: "chat" } });
  assert.notEqual(lo.verdict, "refused");
  assert.equal(lo.quant, "Q4_K_M");
  assert.equal(lo.placement?.tier, "vram+ram");
  assert.ok((lo.predictedTokensPerSec ?? 0) > 0);
});

test("invalid context length is refused cleanly, not silently mis-planned", () => {
  for (const ctx of [0, -8192, NaN, Infinity]) {
    const lo = plan({ hardware: omen, model: qwen14b, options: { contextLength: ctx } });
    assert.equal(lo.verdict, "refused", `ctx=${ctx} should refuse`);
    assert.equal(lo.refusal?.code, "INVALID_CONTEXT", `ctx=${ctx} code`);
  }
  // a valid context still plans normally
  const ok = plan({ hardware: omen, model: qwen14b, options: { contextLength: 8192 } });
  assert.notEqual(ok.verdict, "refused");
});

test("MoE batch=1 tok/s uses the measured sparse-gather efficiency, not the dense roofline (CAL-1)", () => {
  // 30B-A3B fits fully in VRAM on the Omen; under the dense eta this over-predicted ~3-4x. Assert a
  // sane MoE band, not a confident over-prediction.
  const lo = plan({ hardware: omen, model: qwen30bA3b, options: { useCase: "chat", contextLength: 4096 } });
  assert.equal(lo.placement?.tier, "vram");
  const t = lo.predictedTokensPerSec ?? 0;
  assert.ok(t > 80 && t < 280, `expected a sane MoE band, got ${t} tok/s`);
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

test("research #9: a sub-4-bit bigger model never outranks a safe higher-bit smaller one", () => {
  // A box where the 30B MoE only fits at a sub-4-bit quant but the 14B fits at a safe (>=4-bit) one.
  const box: Hardware = {
    vramBytes: 12 * GiB,
    vramFreeBytes: 11 * GiB,
    vramBandwidthBytesPerSec: 360 * GB,
    ramBytes: 8 * GiB,
    ramFreeBytes: 6.5 * GiB,
    ramBandwidthBytesPerSec: 50 * GB,
  };
  const recs = recommend(box, [qwen30bA3b, qwen14b], { useCase: "chat" });
  const big = recs.find((r) => r.loadout.modelId === "qwen3-30b-a3b");
  const small = recs.find((r) => r.loadout.modelId === "qwen2.5-14b");
  assert.ok(big && small, "both models should be runnable on this box");
  // confirm the scenario actually exercises the inversion: the big model is forced sub-4-bit
  assert.ok(big!.loadout.quant && bytesPerParam(big!.loadout.quant) < 0.5, `expected sub-4-bit big, got ${big!.loadout.quant}`);
  // and the safe higher-bit smaller model must rank ahead of the crushed bigger one
  assert.ok(small!.capabilityScore > big!.capabilityScore, "safe 14B must outrank the sub-4-bit 30B");
});
