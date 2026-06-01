#!/usr/bin/env node
import {
  probe,
  catalogFromOllama,
  catalogFromDir,
  catalogFromHuggingFace,
  recommend,
  plan,
  emit,
  GiB,
  type Backend,
  type CatalogEntry,
  type PlanOptions,
  type UseCase,
} from "./index.js";

type Flags = Record<string, string | boolean>;

/** Flags that never take a value (so they can't swallow the following positional, e.g. the model id). */
const BOOLEAN_FLAGS = new Set(["json", "experimental", "help", "h"]);
/** Flags that always consume the next token as their value (even one starting with "-", e.g. `--ctx -5`). */
const VALUE_FLAGS = new Set(["dir", "hf", "ctx", "use-case", "backend"]);

function parseArgs(argv: string[]): { cmd: string; positional: string[]; flags: Flags } {
  const flags: Flags = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "-h" || a === "-help") {
      flags.help = true; // short help flag (parseArgs only special-cased --double-dash before, so -h fell through to positional)
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      // A boolean flag NEVER consumes the next token; a value flag always does; an unknown flag uses the
      // heuristic (consume unless the next token looks like another flag). This stops `plan --json <model>`
      // from swallowing the model id into `flags.json`.
      const takesValue = next !== undefined && !BOOLEAN_FLAGS.has(key) && (VALUE_FLAGS.has(key) || !next.startsWith("-"));
      if (takesValue) {
        flags[key] = next as string;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd: positional.shift() ?? "recommend", positional, flags };
}

const gi = (n: number): string => (n / GiB).toFixed(1);
const gbps = (n: number): string => (n / 1e9).toFixed(0);

function planOptions(flags: Flags): PlanOptions {
  const o: PlanOptions = {};
  if (typeof flags.ctx === "string") o.contextLength = Number(flags.ctx);
  const uc = flags["use-case"];
  if (uc === "reasoning" || uc === "chat" || uc === "bulk") o.useCase = uc as UseCase;
  if (flags.experimental === true) o.experimentalDisk = true;
  return o;
}

async function gatherCatalog(flags: Flags): Promise<CatalogEntry[]> {
  const entries = await catalogFromOllama();
  if (typeof flags.dir === "string") entries.push(...(await catalogFromDir(flags.dir)));
  if (typeof flags.hf === "string") entries.push(...(await catalogFromHuggingFace(flags.hf)));
  return entries;
}

function printHelp(): void {
  console.log(`bytefit — hardware-aware local-LLM loadout planner

Usage:
  bytefit probe                      Detect GPU / VRAM / RAM / NVMe and print the hardware profile
  bytefit recommend [options]        Rank installed models best-first for this machine
  bytefit plan <model-id> [options]  Plan one model (quant + KV + offload + runtime args), or refuse

Options:
  --json                 Machine-readable JSON output
  --dir <path>           Also scan a folder of .gguf files (in addition to Ollama)
  --hf <repo>            Also rank a Hugging Face GGUF repo without downloading (opt-in network)
  --ctx <n>              Context length in tokens (default 8192)
  --use-case <c>         reasoning | chat | bulk (default chat) — gates the quant floor
  --backend <b>          llama.cpp | ollama | lmstudio (plan only; default llama.cpp)
  --experimental         Allow the experimental MoE disk-streaming tier (MoE only)
  -h, --help             Show this help

Models are read from Ollama (OLLAMA_HOST, default 127.0.0.1:11434) and any --dir folder.
Exit codes: 0 ok · 1 not found / refused · 2 usage error.`);
}

async function main(): Promise<number> {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2));
  const json = flags.json === true;

  if (cmd === "help" || flags.help === true || flags.h === true) {
    printHelp();
    return 0;
  }

  // Reject a bad --ctx at the boundary (usage error, exit 2) instead of feeding NaN/negative/0 into
  // the planner. `--ctx` with no value parses to boolean true → NaN here, also rejected.
  if (flags.ctx !== undefined) {
    const c = typeof flags.ctx === "string" ? Number(flags.ctx) : NaN;
    if (!Number.isInteger(c) || c <= 0 || c > 1_048_576) {
      console.error(`bad --ctx '${String(flags.ctx)}' — expected a positive integer up to 1048576`);
      return 2;
    }
  }

  if (cmd === "probe") {
    const hw = await probe({ measureDisk: flags.experimental === true });
    if (json) return console.log(JSON.stringify(hw, null, 2)), 0;
    console.log(`${hw.gpu.name}  ${gi(hw.vramBytes)} GiB VRAM (${gi(hw.vramFreeBytes)} free) @ ${gbps(hw.vramBandwidthBytesPerSec)} GB/s`);
    console.log(`RAM  ${gi(hw.ramBytes)} GiB (${gi(hw.ramFreeBytes)} free) @ ${(hw.ramBandwidthBytesPerSec / 1e9).toFixed(1)} GB/s`);
    if (hw.nvmeReadBytesPerSec) console.log(`NVMe ${(hw.nvmeReadBytesPerSec / 1e9).toFixed(2)} GB/s`);
    for (const n of hw.notes) console.log(`note: ${n}`);
    return 0;
  }

  if (cmd === "recommend") {
    const hw = await probe({ measureDisk: flags.experimental === true });
    const cat = await gatherCatalog(flags);
    const recs = recommend(hw, cat.map((e) => e.model), planOptions(flags));
    if (json) return console.log(JSON.stringify(recs.map((r) => r.loadout), null, 2)), 0;
    console.log(`${hw.gpu.name} / ${gi(hw.vramBytes)} GiB VRAM / ${gi(hw.ramBytes)} GiB RAM — ${cat.length} models, ${recs.length} runnable:\n`);
    if (cat.length === 0) console.log("No models found — is Ollama running? (run `ollama serve`) Or pass --dir <gguf-folder>.\n");
    for (const r of recs) {
      const l = r.loadout;
      console.log(
        `  ${l.modelId.padEnd(24)} ${l.verdict.toUpperCase().padEnd(9)} ${l.quant} ${l.kvCacheType} ctx${l.contextLength}  ~${(l.predictedTokensPerSec ?? 0).toFixed(0)} tok/s  [${l.placement?.tier}]`,
      );
    }
    for (const n of hw.notes) console.log(`note: ${n}`);
    return 0;
  }

  if (cmd === "plan") {
    const id = positional[0];
    if (!id) {
      console.error("usage: bytefit plan <model-id> [--backend llama.cpp|ollama|lmstudio] [--ctx N] [--use-case chat|reasoning|bulk] [--experimental]");
      return 2;
    }
    const backendArg = typeof flags.backend === "string" ? flags.backend : "llama.cpp";
    const valid: Backend[] = ["llama.cpp", "ollama", "lmstudio"];
    if (!valid.includes(backendArg as Backend)) {
      console.error(`unknown backend '${backendArg}' (use: ${valid.join(" | ")})`);
      return 2;
    }
    const hw = await probe({ measureDisk: flags.experimental === true });
    const cat = await gatherCatalog(flags);
    // Deterministic resolution: exact id wins; otherwise a prefix must be UNIQUE (no arbitrary pick).
    const exact = cat.find((e) => e.id === id);
    const prefixed = cat.filter((e) => e.id.startsWith(id));
    const entry = exact ?? (prefixed.length === 1 ? prefixed[0] : undefined);
    if (!entry) {
      if (prefixed.length > 1) {
        console.error(`model '${id}' is ambiguous — matches: ${prefixed.map((e) => e.id).join(", ")}`);
        return 2;
      }
      console.error(
        cat.length
          ? `model '${id}' not found. Available: ${cat.map((e) => e.id).join(", ")}`
          : `model '${id}' not found — catalog is empty. Is Ollama running? (run \`ollama serve\`) or pass --dir <gguf-folder>.`,
      );
      return 1;
    }
    const lo = plan({ hardware: hw, model: entry.model, options: planOptions(flags) });
    const out = emit(lo, backendArg as Backend);
    if (json) return console.log(JSON.stringify({ loadout: lo, command: out }, null, 2)), 0;

    console.log(
      `${lo.modelId}: ${lo.verdict.toUpperCase()}${lo.quant ? ` ${lo.quant} ${lo.kvCacheType} ctx${lo.contextLength}` : ""}${lo.predictedTokensPerSec ? ` ~${lo.predictedTokensPerSec.toFixed(0)} tok/s` : ""}`,
    );
    for (const line of lo.reasoning) console.log(`  - ${line}`);
    if (lo.refusal) console.log(`  REFUSED [${lo.refusal.code}]: ${lo.refusal.message}\n  hint: ${lo.refusal.hint}`);
    console.log(`\n${out.backend}:`);
    if (out.commandLine) console.log(`  ${out.commandLine}`);
    if (out.env && Object.keys(out.env).length) console.log(`  env: ${Object.entries(out.env).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    if (out.options && Object.keys(out.options).length) console.log(`  options: ${JSON.stringify(out.options)}`);
    for (const w of out.warnings) console.log(`  ! ${w}`);
    return 0;
  }

  console.error(`unknown command '${cmd}' (use: probe | recommend | plan <model>)`);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
