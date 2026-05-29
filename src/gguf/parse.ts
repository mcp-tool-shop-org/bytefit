import { GgufValueType, GGUF_MAGIC, type GgufValue, type GgufHeader, type GgufTensorInfo } from "./types.js";

export class GgufError extends Error {}
/** Thrown when the buffer ends mid-parse — the file reader grows its read window and retries. */
export class GgufTruncatedError extends GgufError {}

class Reader {
  offset = 0;
  constructor(private readonly buf: Buffer) {}

  private ensure(n: number): void {
    if (this.offset + n > this.buf.length) {
      throw new GgufTruncatedError(`need ${n} bytes at offset ${this.offset}, buffer has ${this.buf.length}`);
    }
  }

  u8(): number { this.ensure(1); const v = this.buf.readUInt8(this.offset); this.offset += 1; return v; }
  i8(): number { this.ensure(1); const v = this.buf.readInt8(this.offset); this.offset += 1; return v; }
  u16(): number { this.ensure(2); const v = this.buf.readUInt16LE(this.offset); this.offset += 2; return v; }
  i16(): number { this.ensure(2); const v = this.buf.readInt16LE(this.offset); this.offset += 2; return v; }
  u32(): number { this.ensure(4); const v = this.buf.readUInt32LE(this.offset); this.offset += 4; return v; }
  i32(): number { this.ensure(4); const v = this.buf.readInt32LE(this.offset); this.offset += 4; return v; }
  f32(): number { this.ensure(4); const v = this.buf.readFloatLE(this.offset); this.offset += 4; return v; }
  f64(): number { this.ensure(8); const v = this.buf.readDoubleLE(this.offset); this.offset += 8; return v; }
  u64(): number { this.ensure(8); const v = this.buf.readBigUInt64LE(this.offset); this.offset += 8; return Number(v); }
  i64(): number { this.ensure(8); const v = this.buf.readBigInt64LE(this.offset); this.offset += 8; return Number(v); }

  str(): string {
    const len = this.u64();
    this.ensure(len);
    const s = this.buf.toString("utf8", this.offset, this.offset + len);
    this.offset += len;
    return s;
  }
}

function readValue(r: Reader, type: number): GgufValue {
  switch (type) {
    case GgufValueType.UINT8: return r.u8();
    case GgufValueType.INT8: return r.i8();
    case GgufValueType.UINT16: return r.u16();
    case GgufValueType.INT16: return r.i16();
    case GgufValueType.UINT32: return r.u32();
    case GgufValueType.INT32: return r.i32();
    case GgufValueType.FLOAT32: return r.f32();
    case GgufValueType.BOOL: return r.u8() !== 0;
    case GgufValueType.STRING: return r.str();
    case GgufValueType.UINT64: return r.u64();
    case GgufValueType.INT64: return r.i64();
    case GgufValueType.FLOAT64: return r.f64();
    case GgufValueType.ARRAY: {
      const sub = r.u32();
      const count = r.u64();
      const arr: GgufValue[] = [];
      for (let i = 0; i < count; i++) arr.push(readValue(r, sub));
      return arr;
    }
    default:
      throw new GgufError(`unknown GGUF value type ${type}`);
  }
}

/**
 * Parse a GGUF header (magic, version, counts, and the full metadata KV section) from a buffer.
 * Stops at the end of the KV section — tensor data is never required for metadata.
 * Throws GgufTruncatedError if the buffer is too short (caller can grow and retry).
 */
export function parseGguf(bytes: Buffer): GgufHeader {
  const r = new Reader(bytes);
  const magic = r.u32();
  if (magic !== GGUF_MAGIC) {
    throw new GgufError(`not a GGUF file (magic 0x${magic.toString(16).padStart(8, "0")})`);
  }
  const version = r.u32();
  if (version < 2 || version > 3) {
    throw new GgufError(`unsupported GGUF version ${version}`);
  }
  const tensorCount = r.u64();
  const kvCount = r.u64();
  const metadata = new Map<string, GgufValue>();
  for (let i = 0; i < kvCount; i++) {
    const key = r.str();
    const valueType = r.u32();
    metadata.set(key, readValue(r, valueType));
  }
  const tensors: GgufTensorInfo[] = [];
  for (let i = 0; i < tensorCount; i++) {
    const name = r.str();
    const nDims = r.u32();
    const dims: number[] = [];
    for (let d = 0; d < nDims; d++) dims.push(r.u64());
    const type = r.u32();
    r.u64(); // tensor data offset — unused for metadata / param counting
    tensors.push({ name, dims, type });
  }
  return { version, tensorCount, kvCount, metadata, tensors };
}
