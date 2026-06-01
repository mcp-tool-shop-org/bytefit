import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGguf, GgufError } from "../gguf/parse.js";
import { GGUF_MAGIC, GgufValueType } from "../gguf/index.js";

// bytefit parses UNTRUSTED GGUF files off disk. A malformed header that declares an astronomically
// large count/length must be rejected fast — never looped or allocated toward OOM/hang. (Hardening — H4.)
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
};
const u64 = (n: bigint): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
};
const gstr = (s: string): Buffer => Buffer.concat([u64(BigInt(Buffer.byteLength(s))), Buffer.from(s, "utf8")]);
const isGgufError = (e: unknown): boolean => e instanceof GgufError;

test("absurd ARRAY length is rejected, not looped into OOM", () => {
  const buf = Buffer.concat([
    u32(GGUF_MAGIC),
    u32(3), // version
    u64(0n), // tensorCount
    u64(1n), // kvCount
    gstr("bad.array"),
    u32(GgufValueType.ARRAY),
    u32(GgufValueType.STRING), // element subtype
    u64(0xffffffffffffn), // ~2.8e14 elements — far beyond the buffer
  ]);
  assert.throws(() => parseGguf(buf), isGgufError);
});

test("absurd kv count is rejected", () => {
  const buf = Buffer.concat([u32(GGUF_MAGIC), u32(3), u64(0n), u64(0xffffffffffffn)]);
  assert.throws(() => parseGguf(buf), isGgufError);
});

test("absurd string length is rejected", () => {
  const buf = Buffer.concat([
    u32(GGUF_MAGIC),
    u32(3),
    u64(0n), // tensorCount
    u64(1n), // kvCount
    u64(0xffffffffffffn), // key string length — absurd
  ]);
  assert.throws(() => parseGguf(buf), isGgufError);
});

test("a non-GGUF buffer throws a structured GgufError, not a raw crash", () => {
  assert.throws(() => parseGguf(Buffer.from("definitely not a gguf file")), isGgufError);
});

test("deeply-nested arrays throw GgufError (depth cap), not a RangeError stack overflow", () => {
  // A COMPLETE, terminating nested-array value 69 deep: an uncapped parser would parse it fine; the
  // depth cap must turn it into a structured GgufError (the real attack uses 200k levels to crash).
  const parts: Buffer[] = [u32(GGUF_MAGIC), u32(3), u64(0n) /*tensors*/, u64(1n) /*kv*/, gstr("nested"), u32(GgufValueType.ARRAY)];
  for (let i = 0; i < 69; i++) parts.push(u32(GgufValueType.ARRAY), u64(1n)); // each level: an array holding 1 array
  parts.push(u32(GgufValueType.UINT8), u64(0n)); // terminal empty array
  assert.throws(() => parseGguf(Buffer.concat(parts)), isGgufError);
});

test("an absurd tensor dimension is rejected, not turned into a poisoned param count", () => {
  const buf = Buffer.concat([
    u32(GGUF_MAGIC),
    u32(3),
    u64(1n), // tensorCount = 1
    u64(0n), // kvCount = 0
    gstr("blk.0.weight"),
    u32(1), // nDims = 1
    u64(2n ** 40n), // dim = 2^40 — beyond MAX_TENSOR_DIM, would overflow param counting
    u32(0), // ggml type
    u64(0n), // data offset
  ]);
  assert.throws(() => parseGguf(buf), isGgufError);
});
