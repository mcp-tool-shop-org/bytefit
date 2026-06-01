import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogFromHuggingFace, quantFromFilename, GgufValueType } from "../index.js";
import { buildGguf, type GgufKV } from "./gguf-fixture.js";

test("quantFromFilename extracts the quant token from common GGUF names", () => {
  assert.equal(quantFromFilename("qwen2.5-14b-instruct-q4_k_m.gguf"), "Q4_K_M");
  assert.equal(quantFromFilename("Meta-Llama-3-8B.IQ4_XS.gguf"), "IQ4_XS");
  assert.equal(quantFromFilename("model.Q8_0.gguf"), "Q8_0");
  assert.equal(quantFromFilename("not-a-model.md"), undefined);
});

test("catalogFromHuggingFace lists builds + reads one header via a mocked Range fetch (no download)", async () => {
  const header = buildGguf([
    { key: "general.architecture", type: GgufValueType.STRING, value: "qwen3" },
    { key: "general.file_type", type: GgufValueType.UINT32, value: 15 },
    { key: "general.parameter_count", type: GgufValueType.UINT64, value: 14_000_000_000 },
    { key: "qwen3.block_count", type: GgufValueType.UINT32, value: 48 },
    { key: "qwen3.attention.head_count", type: GgufValueType.UINT32, value: 40 },
    { key: "qwen3.attention.head_count_kv", type: GgufValueType.UINT32, value: 8 },
    { key: "qwen3.attention.key_length", type: GgufValueType.UINT32, value: 128 },
  ] as GgufKV[]);

  let rangeRequested = false;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url.includes("/api/models/")) {
      return new Response(
        JSON.stringify([
          { type: "file", path: "model-Q4_K_M.gguf", size: 9_000_000_000 },
          { type: "file", path: "model-Q8_0.gguf", size: 15_000_000_000 },
          { type: "file", path: "README.md", size: 1234 },
        ]),
        { status: 200 },
      );
    }
    if ((init?.headers as Record<string, string>)?.Range) rangeRequested = true;
    return new Response(new Uint8Array(header), { status: 206 });
  }) as unknown as typeof fetch;

  const entries = await catalogFromHuggingFace("org/qwen3-14b", { endpoint: "https://hf.test", fetchImpl });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.source, "huggingface");
  assert.equal(entries[0]?.model.arch.layers, 48);
  assert.equal(entries[0]?.model.arch.kvHeads, 8); // real GQA, not assumed
  assert.deepEqual(entries[0]?.model.builds.map((b) => b.quant).sort(), ["Q4_K_M", "Q8_0"]);
  assert.ok(rangeRequested, "used a Range request, not a full download");
});

test("catalogFromHuggingFace returns [] for a repo with no GGUFs", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify([{ type: "file", path: "config.json", size: 100 }]), { status: 200 })) as unknown as typeof fetch;
  assert.deepEqual(await catalogFromHuggingFace("org/no-gguf", { fetchImpl }), []);
});
