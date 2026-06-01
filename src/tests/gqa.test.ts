import { test } from "node:test";
import assert from "node:assert/strict";
import { ggufModelInfoFromMetadata } from "../gguf/index.js";
import { toModelMeta } from "../catalog/to-model-meta.js";
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
