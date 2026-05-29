# bytefit

**Hardware-aware local-LLM loadout planner.**

bytefit answers one question for your machine: *what is the largest, most capable local
model you can actually run well — and with exactly which quantization, KV-cache, context
length, and offload policy — without silently falling into disk paging?*

It is an **advisor**, not just an estimator. Tools like Jan and LM Studio tell you whether
a model *fits*; bytefit tells you what to *run* — model class + quant + KV-cache + context +
offload policy — and **refuses** configurations that would tip into uncontrolled paging.

> **Status: pre-release scaffold (v0.0.0).** The architecture is locked (see
> [SPEC.md](SPEC.md)); the core is in progress. Not yet published to npm.

## The governing idea

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

Decode is memory-bandwidth-bound. bytefit minimizes bytes-read-per-token, keeps them on the
fastest tier that fits, predicts the result, and refuses configs that would page.

## What it will do

- **Probe** VRAM, RAM, and *measured* NVMe bandwidth.
- **Choose** model class, quant family, KV-cache type, context length, and offload policy for that hardware.
- **Refuse** configurations that would silently page to disk — with a structured reason and a non-zero exit code.
- **Emit** ready-to-run llama.cpp / Ollama arguments and a predicted tok/s.

## Why (the wedge)

Fit labels and memory estimates are table stakes now. No existing tool closes the *decision*
loop: hardware-fingerprinted quant + KV-type recommendation, context sizing tied to
quant-adjusted headroom, model-class recommendation, and a hard anti-paging refusal. That
combination is bytefit. Full landscape and evidence in [SPEC.md](SPEC.md).

## Roadmap

- ✅ Architecture + research grounding locked ([SPEC.md](SPEC.md))
- 🔜 Pure core — roofline predictor, footprint math, quant/KV selection, admission verdict
- 🔜 I/O shell — hardware probe, GGUF/Ollama catalog, runtime-arg emitter
- 🔜 CLI + tests
- ⚗️ Disk-backed MoE streaming — experimental R&D, gated behind `--experimental`

## Security

No network, no telemetry. Reads local model files and system info; shells out to trusted
system binaries (`nvidia-smi`). See [SECURITY.md](SECURITY.md).

---

Built by [MCP Tool Shop](https://mcp-tool-shop.github.io/) · [SPEC](SPEC.md)
