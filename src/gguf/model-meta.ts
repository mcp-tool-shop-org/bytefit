import type { GgufHeader, GgufValue } from "./types.js";
import type { QuantType } from "../types.js";

/** `general.file_type` enum -> our QuantType, for the values bytefit models. */
const FILE_TYPE_TO_QUANT: Record<number, QuantType> = {
  1: "F16",
  7: "Q8_0",
  10: "Q2_K",
  11: "Q3_K_S",
  12: "Q3_K_M",
  13: "Q3_K_L",
  14: "Q4_K_S",
  15: "Q4_K_M",
  16: "Q5_K_S",
  17: "Q5_K_M",
  18: "Q6_K",
  30: "IQ4_XS",
};

export interface GgufModelInfo {
  architecture?: string;
  layers?: number;
  headCount?: number;
  kvHeads?: number;
  headDim?: number;
  embeddingLength?: number;
  contextLength?: number;
  isMoE: boolean;
  expertCount: number;
  activeExperts?: number;
  quant?: QuantType;
  totalParams?: number;
  sizeLabel?: string;
}

function asNumber(v: GgufValue | undefined): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function asString(v: GgufValue | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Parse "7B" / "30.5B" / "671B" / "1.5T" size labels into a parameter count. */
export function parseSizeLabel(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const m = /^([\d.]+)\s*([KMBT])?/i.exec(label.trim());
  if (!m || m[1] === undefined) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  const mult: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const suffix = (m[2] ?? "B").toUpperCase();
  return n * (mult[suffix] ?? 1e9);
}

/**
 * Project GGUF metadata onto the fields bytefit's core needs. Architecture-prefixed keys are
 * resolved off `general.architecture`. headDim falls back to embedding_length/head_count;
 * totalParams falls back from general.parameter_count to the size_label heuristic.
 */
export function ggufToModelInfo(header: GgufHeader): GgufModelInfo {
  const md = header.metadata;
  const arch = asString(md.get("general.architecture"));
  const g = (suffix: string): GgufValue | undefined => (arch ? md.get(`${arch}.${suffix}`) : undefined);

  const headCount = asNumber(g("attention.head_count"));
  const kvHeads = asNumber(g("attention.head_count_kv")) ?? headCount;
  const keyLength = asNumber(g("attention.key_length"));
  const embeddingLength = asNumber(g("embedding_length"));
  const headDim =
    keyLength ?? (embeddingLength !== undefined && headCount ? embeddingLength / headCount : undefined);
  const expertCount = asNumber(g("expert_count")) ?? 0;

  const fileType = asNumber(md.get("general.file_type"));
  const quant = fileType !== undefined ? FILE_TYPE_TO_QUANT[fileType] : undefined;

  const sizeLabel = asString(md.get("general.size_label"));
  const totalParams = asNumber(md.get("general.parameter_count")) ?? parseSizeLabel(sizeLabel);

  return {
    architecture: arch,
    layers: asNumber(g("block_count")),
    headCount,
    kvHeads,
    headDim,
    embeddingLength,
    contextLength: asNumber(g("context_length")),
    isMoE: expertCount > 0,
    expertCount,
    activeExperts: asNumber(g("expert_used_count")),
    quant,
    totalParams,
    sizeLabel,
  };
}
