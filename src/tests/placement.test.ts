import { test } from "node:test";
import assert from "node:assert/strict";
import { placeAndAdmit, kvBytesTotal, GiB, MiB, type Hardware, type ModelMeta, type PlacementOptions } from "../index.js";
import { weak, omen, qwen14b, qwen30bA3b, deepseekR1 } from "./fixtures.js";

const opts: PlacementOptions = { vramHeadroomBytes: 512 * MiB, ramHeadroomBytes: 2 * GiB, experimentalDisk: false };

function build(model: ModelMeta, quant: string) {
  const b = model.builds.find((x) => x.quant === quant);
  assert.ok(b, `fixture missing ${quant}`);
  return b;
}

test("model that fits VRAM → tier vram, verdict fits", () => {
  const kv = kvBytesTotal(qwen14b, "q8_0", 8192);
  const r = placeAndAdmit(omen, qwen14b, build(qwen14b, "Q4_K_M"), kv, opts);
  assert.equal(r.verdict, "fits");
  assert.equal(r.placement?.tier, "vram");
});

test("too big for VRAM but fits VRAM+RAM → vram+ram, degraded, experts on CPU", () => {
  const kv = kvBytesTotal(qwen30bA3b, "q8_0", 8192);
  const r = placeAndAdmit(weak, qwen30bA3b, build(qwen30bA3b, "Q4_K_M"), kv, opts);
  assert.equal(r.verdict, "degraded");
  assert.equal(r.placement?.tier, "vram+ram");
  assert.equal(r.placement?.cpuMoEExperts, true);
  assert.ok(r.ramWeightBytes > 0);
});

test("dense model exceeding VRAM+RAM is refused (dense can't stream)", () => {
  const dense: ModelMeta = {
    id: "dense-70b",
    totalParams: 70e9,
    isMoE: false,
    arch: { layers: 80, kvHeads: 8, headDim: 128 },
    builds: [{ quant: "Q8_0", sizeBytes: 74 * GiB }],
  };
  const r = placeAndAdmit(weak, dense, build(dense, "Q8_0"), 0, opts);
  assert.equal(r.verdict, "refused");
  assert.equal(r.refusal?.code, "WONT_FIT_DENSE");
});

test("huge MoE: refused without experimentalDisk, streamed with it", () => {
  const kv = kvBytesTotal(deepseekR1, "q8_0", 8192);
  const refused = placeAndAdmit(omen, deepseekR1, build(deepseekR1, "IQ2_XXS"), kv, opts);
  assert.equal(refused.verdict, "refused");
  assert.equal(refused.refusal?.code, "WONT_FIT_MOE");

  const streamed = placeAndAdmit(omen, deepseekR1, build(deepseekR1, "IQ2_XXS"), kv, { ...opts, experimentalDisk: true });
  assert.equal(streamed.verdict, "degraded");
  assert.equal(streamed.placement?.tier, "disk");
  assert.ok(streamed.diskWeightBytes > 0);
});

test("KV cache larger than usable VRAM is refused", () => {
  const tinyVram: Hardware = { ...omen, vramFreeBytes: 1 * GiB };
  const r = placeAndAdmit(tinyVram, qwen14b, build(qwen14b, "Q4_K_M"), 0.8 * GiB, opts);
  assert.equal(r.refusal?.code, "KV_EXCEEDS_VRAM");
});
