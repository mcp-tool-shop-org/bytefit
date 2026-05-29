#!/usr/bin/env node
import {
  probe,
  catalogFromOllama,
  catalogFromDir,
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

function parseArgs(argv: string[]): { cmd: string; positional: string[]; flags: Flags } {
  const flags: Flags = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
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
  return entries;
}

async function main(): Promise<number> {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2));
  const json = flags.json === true;

  if (cmd === "probe") {
    const hw = await probe();
    if (json) return console.log(JSON.stringify(hw, null, 2)), 0;
    console.log(`${hw.gpu.name}  ${gi(hw.vramBytes)} GiB VRAM (${gi(hw.vramFreeBytes)} free) @ ${gbps(hw.vramBandwidthBytesPerSec)} GB/s`);
    console.log(`RAM  ${gi(hw.ramBytes)} GiB (${gi(hw.ramFreeBytes)} free) @ ${(hw.ramBandwidthBytesPerSec / 1e9).toFixed(1)} GB/s`);
    if (hw.nvmeReadBytesPerSec) console.log(`NVMe ${(hw.nvmeReadBytesPerSec / 1e9).toFixed(2)} GB/s`);
    for (const n of hw.notes) console.log(`note: ${n}`);
    return 0;
  }

  if (cmd === "recommend") {
    const hw = await probe();
    const cat = await gatherCatalog(flags);
    const recs = recommend(hw, cat.map((e) => e.model), planOptions(flags));
    if (json) return console.log(JSON.stringify(recs.map((r) => r.loadout), null, 2)), 0;
    console.log(`${hw.gpu.name} / ${gi(hw.vramBytes)} GiB VRAM / ${gi(hw.ramBytes)} GiB RAM — ${cat.length} models, ${recs.length} runnable:\n`);
    for (const r of recs) {
      const l = r.loadout;
      console.log(
        `  ${l.modelId.padEnd(24)} ${l.verdict.toUpperCase().padEnd(9)} ${l.quant} ${l.kvCacheType} ctx${l.contextLength}  ~${(l.predictedTokensPerSec ?? 0).toFixed(0)} tok/s  [${l.placement?.tier}]`,
      );
    }
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
    const hw = await probe();
    const cat = await gatherCatalog(flags);
    const entry = cat.find((e) => e.id === id) ?? cat.find((e) => e.id.startsWith(id));
    if (!entry) {
      console.error(`model '${id}' not found in catalog`);
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
