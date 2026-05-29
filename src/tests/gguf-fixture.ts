import { GgufValueType, GGUF_MAGIC } from "../gguf/index.js";

/** Minimal typed KV entries the fixture writer can encode (enough to exercise the parser). */
export type GgufKV =
  | { key: string; type: GgufValueType.STRING; value: string }
  | { key: string; type: GgufValueType.UINT32; value: number }
  | { key: string; type: GgufValueType.UINT64; value: number }
  | { key: string; type: GgufValueType.FLOAT32; value: number }
  | { key: string; type: GgufValueType.BOOL; value: boolean }
  | { key: string; type: GgufValueType.ARRAY; subtype: GgufValueType.STRING; value: string[] };

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}
function u64(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}
function f32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeFloatLE(n, 0);
  return b;
}
function gstr(s: string): Buffer {
  const sb = Buffer.from(s, "utf8");
  return Buffer.concat([u64(sb.length), sb]);
}

function encodeValue(kv: GgufKV): Buffer {
  switch (kv.type) {
    case GgufValueType.STRING:
      return gstr(kv.value);
    case GgufValueType.UINT32:
      return u32(kv.value);
    case GgufValueType.UINT64:
      return u64(kv.value);
    case GgufValueType.FLOAT32:
      return f32(kv.value);
    case GgufValueType.BOOL:
      return Buffer.from([kv.value ? 1 : 0]);
    case GgufValueType.ARRAY:
      return Buffer.concat([u32(kv.subtype), u64(kv.value.length), ...kv.value.map(gstr)]);
  }
}

/** Encode a valid GGUF buffer (header + KV section) for round-trip testing. */
export function buildGguf(entries: GgufKV[], opts: { version?: number; tensorCount?: number } = {}): Buffer {
  const parts: Buffer[] = [
    u32(GGUF_MAGIC),
    u32(opts.version ?? 3),
    u64(opts.tensorCount ?? 0),
    u64(entries.length),
  ];
  for (const e of entries) {
    parts.push(gstr(e.key), u32(e.type), encodeValue(e));
  }
  return Buffer.concat(parts);
}
