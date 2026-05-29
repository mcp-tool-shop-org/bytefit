/** GGUF binary format types. Spec: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md */

export enum GgufValueType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

export type GgufValue = number | boolean | string | GgufValue[];

export interface GgufTensorInfo {
  name: string;
  dims: number[];
  type: number;
}

export interface GgufHeader {
  version: number;
  tensorCount: number;
  kvCount: number;
  metadata: Map<string, GgufValue>;
  tensors: GgufTensorInfo[];
}

/** "GGUF" as a little-endian uint32. */
export const GGUF_MAGIC = 0x46554747;
