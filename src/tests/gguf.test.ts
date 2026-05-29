import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseGguf,
  ggufToModelInfo,
  parseSizeLabel,
  readGgufMetadata,
  GgufValueType,
  GgufError,
  GgufTruncatedError,
} from "../index.js";
import { buildGguf, type GgufKV } from "./gguf-fixture.js";

const moe: GgufKV[] = [
  { key: "general.architecture", type: GgufValueType.STRING, value: "qwen3" },
  { key: "general.file_type", type: GgufValueType.UINT32, value: 15 }, // Q4_K_M
  { key: "general.parameter_count", type: GgufValueType.UINT64, value: 30_500_000_000 },
  { key: "general.size_label", type: GgufValueType.STRING, value: "30B" },
  { key: "qwen3.block_count", type: GgufValueType.UINT32, value: 48 },
  { key: "qwen3.attention.head_count", type: GgufValueType.UINT32, value: 32 },
  { key: "qwen3.attention.head_count_kv", type: GgufValueType.UINT32, value: 4 },
  { key: "qwen3.attention.key_length", type: GgufValueType.UINT32, value: 128 },
  { key: "qwen3.embedding_length", type: GgufValueType.UINT32, value: 2048 },
  { key: "qwen3.context_length", type: GgufValueType.UINT32, value: 32768 },
  { key: "qwen3.expert_count", type: GgufValueType.UINT32, value: 128 },
  { key: "qwen3.expert_used_count", type: GgufValueType.UINT32, value: 8 },
  { key: "tokenizer.ggml.tokens", type: GgufValueType.ARRAY, subtype: GgufValueType.STRING, value: ["<a>", "<b>", "<c>"] },
];

test("parseGguf round-trips header + KV (incl. string arrays)", () => {
  const h = parseGguf(buildGguf(moe));
  assert.equal(h.version, 3);
  assert.equal(h.kvCount, moe.length);
  assert.equal(h.metadata.get("general.architecture"), "qwen3");
  assert.equal(h.metadata.get("qwen3.expert_count"), 128);
  assert.deepEqual(h.metadata.get("tokenizer.ggml.tokens"), ["<a>", "<b>", "<c>"]);
});

test("ggufToModelInfo maps an MoE model", () => {
  const info = ggufToModelInfo(parseGguf(buildGguf(moe)));
  assert.equal(info.architecture, "qwen3");
  assert.equal(info.layers, 48);
  assert.equal(info.kvHeads, 4);
  assert.equal(info.headDim, 128);
  assert.equal(info.isMoE, true);
  assert.equal(info.expertCount, 128);
  assert.equal(info.activeExperts, 8);
  assert.equal(info.quant, "Q4_K_M");
  assert.equal(info.totalParams, 30_500_000_000);
  assert.equal(info.contextLength, 32768);
});

test("headDim falls back to embedding_length / head_count; dense has no experts", () => {
  const dense: GgufKV[] = [
    { key: "general.architecture", type: GgufValueType.STRING, value: "llama" },
    { key: "llama.attention.head_count", type: GgufValueType.UINT32, value: 32 },
    { key: "llama.embedding_length", type: GgufValueType.UINT32, value: 4096 },
    { key: "llama.block_count", type: GgufValueType.UINT32, value: 32 },
  ];
  const info = ggufToModelInfo(parseGguf(buildGguf(dense)));
  assert.equal(info.headDim, 128); // 4096 / 32
  assert.equal(info.kvHeads, 32); // falls back to head_count when no GQA key
  assert.equal(info.isMoE, false);
  assert.equal(info.expertCount, 0);
});

test("parseSizeLabel handles K/M/B/T", () => {
  assert.equal(parseSizeLabel("7B"), 7e9);
  assert.equal(parseSizeLabel("30.5B"), 30.5e9);
  assert.equal(parseSizeLabel("671B"), 671e9);
  assert.equal(parseSizeLabel("1.5T"), 1.5e12);
  assert.equal(parseSizeLabel(undefined), undefined);
});

test("bad magic throws GgufError; truncated buffer throws GgufTruncatedError", () => {
  assert.throws(() => parseGguf(Buffer.alloc(24)), GgufError);
  const buf = buildGguf(moe);
  assert.throws(() => parseGguf(buf.subarray(0, 28)), GgufTruncatedError);
});

test("readGgufMetadata reads metadata from a real file", async () => {
  const path = join(tmpdir(), `bytefit-test-${process.pid}.gguf`);
  await writeFile(path, buildGguf(moe));
  try {
    const info = ggufToModelInfo(await readGgufMetadata(path));
    assert.equal(info.architecture, "qwen3");
    assert.equal(info.quant, "Q4_K_M");
    assert.equal(info.isMoE, true);
  } finally {
    await rm(path, { force: true });
  }
});
