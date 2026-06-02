import { test } from "node:test";
import assert from "node:assert/strict";
import { ggufModelInfoFromMetadata } from "../gguf/index.js";
import { toModelMeta } from "../catalog/to-model-meta.js";
import { kvBytesTotal } from "../index.js";
import type { GgufValue } from "../gguf/types.js";

const md = (entries: Record<string, GgufValue>): Map<string, GgufValue> => new Map(Object.entries(entries));

// Regression for the Gemma "15 GiB KV @ 8k" bug: a GGUF that omits head_count_kv must NOT silently
// claim GQA-off without flagging it — the KV estimate is then an upper bound, not a fact.
test("absent head_count_kv → kvHeads = head_count but flagged kvHeadsAssumed", () => {
  const info = ggufModelInfoFromMetadata(
    md({
      "general.architecture": "gemma4",
      "general.file_type": 15, // Q4_K_M
      "gemma4.block_count": 60,
      "gemma4.attention.head_count": 32,
      "gemma4.attention.key_length": 512,
      "gemma4.embedding_length": 5376,
    }),
  );
  assert.equal(info.kvHeads, 32, "falls back to head_count");
  assert.equal(info.headDim, 512, "uses key_length, not embedding/head_count");
  assert.equal(info.kvHeadsAssumed, true, "flags the no-GQA assumption");
  assert.equal(info.headDimAssumed ?? false, false, "key_length present → headDim not assumed");
});

test("present head_count_kv (real GQA) is used and NOT flagged assumed", () => {
  const info = ggufModelInfoFromMetadata(
    md({
      "general.architecture": "qwen35moe",
      "general.file_type": 15,
      "qwen35moe.block_count": 40,
      "qwen35moe.attention.head_count": 64,
      "qwen35moe.attention.head_count_kv": 8,
      "qwen35moe.attention.key_length": 128,
    }),
  );
  assert.equal(info.kvHeads, 8, "uses head_count_kv");
  assert.equal(info.kvHeadsAssumed ?? false, false, "no assumption flag when present");
});

test("per-layer ARRAY head_count_kv → effective kvHeads (sum/layers), NOT a no-GQA fallback", () => {
  // Qwen3-MoE/Next style: a per-layer array where 0 = a linear-attention layer that caches no KV.
  const info = ggufModelInfoFromMetadata(
    md({
      "general.architecture": "qwen35moe",
      "general.file_type": 15,
      "qwen35moe.block_count": 8,
      "qwen35moe.attention.head_count": 16,
      "qwen35moe.attention.head_count_kv": [0, 0, 0, 2, 0, 0, 0, 2],
      "qwen35moe.attention.key_length": 256,
    }),
  );
  assert.equal(info.kvHeadsAssumed ?? false, false, "an array IS real GQA data, not an assumption");
  assert.equal(info.kvHeads, 4 / 8, "effective kvHeads = per-layer sum (4) / layers (8) = 0.5");
});

test("sliding_window is surfaced so the full-context KV is flagged a conservative upper bound", () => {
  const info = ggufModelInfoFromMetadata(
    md({
      "general.architecture": "gemma4",
      "general.file_type": 15,
      "gemma4.block_count": 6,
      "gemma4.attention.head_count": 32,
      "gemma4.attention.head_count_kv": [16, 16, 16, 16, 16, 4],
      "gemma4.attention.key_length": 512,
      "gemma4.attention.sliding_window": 1024,
    }),
  );
  assert.equal(info.kvHeads, (16 * 5 + 4) / 6, "effective kvHeads from the per-layer array");
  assert.equal(info.slidingWindow, 1024, "sliding window surfaced for the KV caveat");
  assert.equal(info.kvHeadsAssumed ?? false, false);
});

test("array head_count_kv SHORTER than block_count falls back to the no-GQA upper bound (malformed --hf)", () => {
  const info = ggufModelInfoFromMetadata(
    md({
      "general.architecture": "x",
      "general.file_type": 15,
      "x.block_count": 40,
      "x.attention.head_count": 16,
      "x.attention.head_count_kv": [8], // only 1 entry for 40 layers — malformed/adversarial
      "x.attention.key_length": 128,
    }),
  );
  assert.equal(info.kvHeads, 16, "falls back to head_count, not 8/40=0.2 (which would UNDER-count KV)");
  assert.equal(info.kvHeadsAssumed, true, "flagged as a KV upper bound");
});

test("sliding-window KV: only the global layers cache full context (Gemma-class split, #37)", () => {
  const info = ggufModelInfoFromMetadata(
    md({
      "general.architecture": "gemma4",
      "general.file_type": 15,
      "general.parameter_count": 27_000_000_000,
      "gemma4.block_count": 62,
      "gemma4.attention.head_count": 32,
      "gemma4.attention.head_count_kv": 16,
      "gemma4.attention.key_length": 128,
      "gemma4.attention.sliding_window": 1024,
      "gemma4.attention.sliding_window_pattern": 6,
    }),
  );
  assert.equal(info.slidingWindow, 1024);
  assert.equal(info.slidingWindowGlobalLayers, 10, "floor(62/6) = 10 global, 52 local");
  const mm = toModelMeta(info, "gemma:test");
  assert.ok(mm);
  const perElemPerLayer = 2 * 16 * 128 * 2; // K+V * kvHeads * headDim * f16 bytes
  const naive = perElemPerLayer * 62 * 32768;
  const split = kvBytesTotal(mm!, "f16", 32768);
  assert.equal(split, perElemPerLayer * (10 * 32768 + 52 * 1024), "global*ctx + local*window");
  assert.ok(split < naive / 4, `split KV (${split}) must be < 1/4 of naive (${naive}) at 32k`);
});

test("kvHeadsAssumed propagates into ModelMeta.arch", () => {
  const info = ggufModelInfoFromMetadata(
    md({
      "general.architecture": "gemma4",
      "general.file_type": 15,
      "general.parameter_count": 31_000_000_000,
      "gemma4.block_count": 60,
      "gemma4.attention.head_count": 32,
      "gemma4.attention.key_length": 512,
    }),
  );
  const mm = toModelMeta(info, "gemma4:test");
  assert.ok(mm, "model is accepted (not dropped)");
  assert.equal(mm?.arch.kvHeadsAssumed, true);
});

test("absent key_length → headDim derived from embedding/head_count and flagged headDimAssumed", () => {
  const info = ggufModelInfoFromMetadata(
    md({
      "general.architecture": "llamaish",
      "general.file_type": 15,
      "llamaish.block_count": 32,
      "llamaish.attention.head_count": 32,
      "llamaish.attention.head_count_kv": 8,
      "llamaish.embedding_length": 4096,
    }),
  );
  assert.equal(info.headDim, 128, "4096 / 32 = 128");
  assert.equal(info.headDimAssumed, true, "flags the derived headDim");
  assert.equal(info.kvHeadsAssumed ?? false, false, "head_count_kv present → kvHeads not assumed");
});
