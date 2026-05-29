import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, emit, emitLlamaCpp, emitOllama, emitLmStudio } from "../index.js";
import { weak, omen, qwen14b, qwen30bA3b, deepseekR1 } from "./fixtures.js";

test("llama.cpp emit for a VRAM-fit loadout: -ngl + KV type + flash-attn, no fitter override", () => {
  const lo = plan({ hardware: omen, model: qwen14b, options: { useCase: "chat" } });
  const cmd = emitLlamaCpp(lo, { modelPath: "/m/qwen14b.gguf" });
  const line = cmd.args?.join(" ") ?? "";
  assert.ok(cmd.args?.includes("-ngl"));
  assert.ok(line.includes("-ctk q8_0") && line.includes("-ctv q8_0"));
  assert.ok(line.includes("-fa on"));
  assert.ok(!line.includes("--fit off")); // VRAM tier doesn't disable the fitter
  assert.ok(!cmd.args?.includes("-ot"));
});

test("llama.cpp emit for an MoE offload: expert pin + --fit off + --mlock", () => {
  const lo = plan({ hardware: weak, model: qwen30bA3b, options: { useCase: "chat" } });
  assert.equal(lo.verdict, "degraded");
  const line = emitLlamaCpp(lo).args?.join(" ") ?? "";
  assert.ok(line.includes("-ot"));
  assert.ok(line.includes("--fit off"));
  assert.ok(line.includes("--mlock"));
});

test("ollama emit warns about inexpressible MoE expert placement", () => {
  const cmd = emitOllama(plan({ hardware: weak, model: qwen30bA3b, options: { useCase: "chat" } }));
  assert.equal(cmd.env?.OLLAMA_FLASH_ATTENTION, "1");
  assert.ok(cmd.warnings.some((w) => w.includes("can't pin MoE experts")));
});

test("lmstudio emit: --gpu max on a VRAM fit; warns it can't set KV type", () => {
  const cmd = emitLmStudio(plan({ hardware: omen, model: qwen14b, options: { useCase: "chat" } }));
  assert.ok(cmd.args?.includes("max"));
  assert.ok(cmd.warnings.some((w) => w.includes("KV-cache")));
});

test("emit on a refused loadout returns warnings and no args", () => {
  const lo = plan({ hardware: omen, model: deepseekR1, options: { useCase: "chat" } });
  assert.equal(lo.verdict, "refused");
  const cmd = emit(lo, "llama.cpp");
  assert.equal(cmd.args, undefined);
  assert.ok(cmd.warnings[0]?.startsWith("Refused"));
});
