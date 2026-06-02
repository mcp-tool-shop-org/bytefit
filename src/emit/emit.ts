import type { Loadout } from "../types.js";
import type { Backend, EmittedCommand, EmitOptions } from "./types.js";

const SPEC_HINT =
  "Bandwidth-bound tier — speculative decoding can reclaim ~1.7–2.5× at batch=1 (not the 3–4× lab ceiling): a trained EAGLE-2 head (--model-draft <draft.gguf> --spec-draft-n-max 16) for dense, or self-speculative/early-exit with no extra model. Avoid draft-tree spec on a low-active MoE (it can net-slow decode).";

function refusedCommand(backend: Backend, loadout: Loadout): EmittedCommand {
  return { backend, warnings: [`Refused: ${loadout.refusal?.message ?? "won't fit"}`] };
}

/** Full-fidelity backend — every loadout dimension maps to a flag. */
export function emitLlamaCpp(loadout: Loadout, opts: EmitOptions = {}): EmittedCommand {
  if (loadout.verdict === "refused") return refusedCommand("llama.cpp", loadout);
  const warnings: string[] = [];
  const args: string[] = ["-m", opts.modelPath ?? `<path-to-${loadout.modelId}.gguf>`];
  if (loadout.contextLength) args.push("-c", String(loadout.contextLength));

  const p = loadout.placement;
  if (p) {
    // MoE expert offload keeps ALL layers (attention + shared) on the GPU and moves only the routed
    // experts off via --n-cpu-moe / -ot — the canonical recipe and exactly what the roofline assumes.
    // Emit -ngl 99 (all layers) for MoE, NOT the partial weight-fraction count: a partial -ngl would
    // run most layers' attention on the CPU, so the predicted tok/s would be a lie. The partial
    // gpuLayers value is for DENSE layer-split offload only.
    if (p.cpuMoEExperts) args.push("-ngl", "999"); // llama.cpp idiom for "all layers" (99 would under-offload a >99-layer model)
    else if (p.gpuLayers !== undefined) args.push("-ngl", String(p.gpuLayers));
    if (p.tier !== "vram") {
      // MoE expert offload: a fractional `--n-cpu-moe N` (first N layers' experts on CPU) for a
      // partial offload, or a blanket `-ot ...=CPU` when every layer's experts must leave the GPU
      // (e.g. the streaming disk tier). Attention + shared weights stay on GPU via the -ngl above.
      if (p.cpuMoELayers && p.cpuMoELayers > 0) args.push("--n-cpu-moe", String(p.cpuMoELayers));
      else if (p.cpuMoEExperts) args.push("-ot", ".ffn_.*_exps.*=CPU");
      args.push("--fit", "off"); // honor our explicit placement instead of the auto-fitter
      if (p.tier === "vram+ram") args.push("--mlock"); // keep the RAM-resident weights from paging
    }
  }
  // f16 is llama.cpp's default KV type — only emit -ctk/-ctv when we actually want a quantized cache.
  if (loadout.kvCacheType && loadout.kvCacheType !== "f16") args.push("-ctk", loadout.kvCacheType, "-ctv", loadout.kvCacheType);
  args.push("-fa", "on");

  if (loadout.speculativeLane && loadout.speculativeLane !== "none") warnings.push(SPEC_HINT);
  if (p?.tier === "disk") warnings.push("Experimental disk tier: experts stream from NVMe via mmap — expect low tok/s (batch/offline).");

  return { backend: "llama.cpp", args, commandLine: `${opts.binary ?? "llama-server"} ${args.join(" ")}`, warnings };
}

export function emitOllama(loadout: Loadout): EmittedCommand {
  if (loadout.verdict === "refused") return refusedCommand("ollama", loadout);
  const warnings: string[] = [];
  const env: Record<string, string> = { OLLAMA_FLASH_ATTENTION: "1" };
  const options: Record<string, number | string> = {};
  if (loadout.contextLength) options.num_ctx = loadout.contextLength;

  const p = loadout.placement;
  // Only emit num_gpu for a DENSE layer-split. For a MoE expert-offload a partial num_gpu would make
  // Ollama run a dense split (the CPU layers' attention on CPU) — the "lie" C4 fixed for llama.cpp — and
  // Ollama can't pin experts anyway, so omit it and let the warning below send the user to llama.cpp.
  if (p && p.tier !== "vram" && p.gpuLayers !== undefined && !p.cpuMoEExperts) options.num_gpu = p.gpuLayers;
  if (loadout.kvCacheType && loadout.kvCacheType !== "f16") env.OLLAMA_KV_CACHE_TYPE = loadout.kvCacheType;

  warnings.push("OLLAMA_KV_CACHE_TYPE / OLLAMA_FLASH_ATTENTION are server-wide (set before `ollama serve`), not per-request.");
  if (p?.cpuMoEExperts) warnings.push("Ollama can't pin MoE experts to CPU (no -ot / --n-cpu-moe) — use llama.cpp for this loadout's expert placement.");
  if (p?.tier === "disk") warnings.push("Ollama won't stream experts from disk — use the llama.cpp --experimental path.");

  return { backend: "ollama", env, options, warnings };
}

export function emitLmStudio(loadout: Loadout): EmittedCommand {
  if (loadout.verdict === "refused") return refusedCommand("lmstudio", loadout);
  const warnings: string[] = [];
  const args: string[] = ["load", loadout.modelId];

  const p = loadout.placement;
  if (p?.tier === "vram") {
    args.push("--gpu", "max");
  } else if (loadout.footprint && loadout.footprint.weightBytesTotal > 0) {
    // LM Studio's --gpu is a 0..1 ratio, not a layer count.
    args.push("--gpu", (loadout.footprint.vramWeightBytes / loadout.footprint.weightBytesTotal).toFixed(2));
  }
  if (loadout.contextLength) args.push("--context-length", String(loadout.contextLength));

  if (loadout.kvCacheType && loadout.kvCacheType !== "f16") warnings.push(`LM Studio CLI can't set KV-cache type (wanted ${loadout.kvCacheType}).`);
  if (p?.cpuMoEExperts) warnings.push("LM Studio can't pin MoE experts to CPU.");
  if (p?.tier === "disk") warnings.push("LM Studio can't stream MoE experts from disk — use the llama.cpp --experimental path.");
  if (loadout.speculativeLane && loadout.speculativeLane !== "none") warnings.push("LM Studio CLI has no speculative-decoding flag.");

  return { backend: "lmstudio", args, commandLine: `lms ${args.join(" ")}`, warnings };
}

export function emit(loadout: Loadout, backend: Backend, opts: EmitOptions = {}): EmittedCommand {
  switch (backend) {
    case "llama.cpp":
      return emitLlamaCpp(loadout, opts);
    case "ollama":
      return emitOllama(loadout);
    case "lmstudio":
      return emitLmStudio(loadout);
  }
}
