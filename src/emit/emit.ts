import type { Loadout } from "../types.js";
import type { Backend, EmittedCommand, EmitOptions } from "./types.js";

const SPEC_HINT =
  "Bandwidth-bound tier — add a speculative draft model: --model-draft <draft.gguf> --spec-draft-n-max 16 (EAGLE-2 / Medusa head preferred).";

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
    if (p.gpuLayers !== undefined) args.push("-ngl", String(p.gpuLayers));
    if (p.tier !== "vram") {
      // Pin experts to CPU only in a genuine expert-offload regime. A small spillover is better
      // expressed by the reduced -ngl above; a blanket -ot would force *all* experts off-GPU.
      const ramFrac =
        loadout.footprint && loadout.footprint.weightBytesTotal > 0
          ? loadout.footprint.ramWeightBytes / loadout.footprint.weightBytesTotal
          : 0;
      if (p.cpuMoEExperts && ramFrac > 0.25) args.push("-ot", ".ffn_.*_exps.=CPU");
      args.push("--fit", "off"); // honor our explicit placement instead of the auto-fitter
      if (p.tier === "vram+ram") args.push("--mlock"); // keep the RAM-resident weights from paging
    }
  }
  if (loadout.kvCacheType) args.push("-ctk", loadout.kvCacheType, "-ctv", loadout.kvCacheType);
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
  if (p && p.tier !== "vram" && p.gpuLayers !== undefined) options.num_gpu = p.gpuLayers;
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
