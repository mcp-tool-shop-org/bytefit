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
