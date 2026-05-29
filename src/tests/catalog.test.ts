import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  quantFromLabel,
  ollamaManifestPath,
  blobPathFromManifest,
  catalogFromGgufFile,
  GgufValueType,
} from "../index.js";
import { buildGguf, type GgufKV } from "./gguf-fixture.js";

test("quantFromLabel maps Ollama labels to our QuantType", () => {
  assert.equal(quantFromLabel("Q4_K_M"), "Q4_K_M");
  assert.equal(quantFromLabel("q8_0"), "Q8_0");
  assert.equal(quantFromLabel("Q4_0"), undefined); // valid GGUF quant, but not modeled by bytefit
  assert.equal(quantFromLabel(undefined), undefined);
});

test("ollamaManifestPath resolves name:tag under the library namespace", () => {
  assert.equal(
    ollamaManifestPath(join("/m"), "qwen3.6:27b"),
    join("/m", "manifests", "registry.ollama.ai", "library", "qwen3.6", "27b"),
  );
  assert.equal(
    ollamaManifestPath(join("/m"), "qwen3.6"),
    join("/m", "manifests", "registry.ollama.ai", "library", "qwen3.6", "latest"),
  );
});

test("blobPathFromManifest finds the model-layer digest", () => {
  const manifest = { layers: [{ mediaType: "application/vnd.ollama.image.model", digest: "sha256:abc123" }] };
  assert.equal(blobPathFromManifest(join("/m"), manifest), join("/m", "blobs", "sha256-abc123"));
  assert.equal(blobPathFromManifest(join("/m"), { layers: [] }), undefined);
});

test("catalogFromGgufFile builds a CatalogEntry from a local file", async () => {
  const entries: GgufKV[] = [
    { key: "general.architecture", type: GgufValueType.STRING, value: "qwen3" },
    { key: "general.file_type", type: GgufValueType.UINT32, value: 15 },
    { key: "qwen3.block_count", type: GgufValueType.UINT32, value: 48 },
    { key: "qwen3.attention.head_count", type: GgufValueType.UINT32, value: 32 },
    { key: "qwen3.attention.head_count_kv", type: GgufValueType.UINT32, value: 4 },
    { key: "qwen3.attention.key_length", type: GgufValueType.UINT32, value: 128 },
  ];
  const dir = await mkdtemp(join(tmpdir(), "bytefit-cat-"));
  const path = join(dir, "qwen3-30b.gguf");
  await writeFile(path, buildGguf(entries));
  try {
    const entry = await catalogFromGgufFile(path);
    assert.ok(entry);
    assert.equal(entry.source, "local");
    assert.equal(entry.model.arch.layers, 48);
    assert.equal(entry.model.arch.kvHeads, 4);
    assert.equal(entry.model.builds[0]?.quant, "Q4_K_M");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
