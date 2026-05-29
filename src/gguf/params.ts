import type { GgufValue, GgufTensorInfo } from "./types.js";

/** MoE expert FFN tensors in llama.cpp GGUFs are named e.g. `blk.0.ffn_gate_exps.weight`. */
const EXPERT_TENSOR_RE = /ffn_(gate|up|down)_exps/;

export interface ParamCounts {
  totalParams: number;
  expertParams: number;
  /** Params actually read per token: always-on + the active fraction of expert params. */
  activatedParams: number;
}

function num(md: Map<string, GgufValue>, key: string): number | undefined {
  const v = md.get(key);
  return typeof v === "number" ? v : undefined;
}

/**
 * Exact parameter counts from the tensor-info section. For MoE, `activatedParams` reflects
 * routing: (total - expert) always-on params + expert params scaled by activeExperts/expertCount.
 * Returns zeros when no tensor info is available (caller falls back to parameter_count/size_label).
 */
export function computeParams(md: Map<string, GgufValue>, tensors: GgufTensorInfo[]): ParamCounts {
  const archVal = md.get("general.architecture");
  const arch = typeof archVal === "string" ? archVal : undefined;
  const expertCount = (arch ? num(md, `${arch}.expert_count`) : undefined) ?? 0;
  const activeExperts = (arch ? num(md, `${arch}.expert_used_count`) : undefined) ?? 0;

  let totalParams = 0;
  let expertParams = 0;
  for (const t of tensors) {
    if (t.dims.length === 0) continue;
    let elements = 1;
    for (const d of t.dims) elements *= d;
    totalParams += elements;
    if (EXPERT_TENSOR_RE.test(t.name)) expertParams += elements;
  }

  let activatedParams = totalParams;
  if (expertCount > 0 && activeExperts > 0 && expertParams > 0) {
    activatedParams = totalParams - expertParams + expertParams * (activeExperts / expertCount);
  }
  return { totalParams, expertParams, activatedParams };
}
