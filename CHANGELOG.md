# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[SemVer](https://semver.org/).

## [1.0.0] — 2026-06-01

First stable release. bytefit plans local-LLM loadouts end-to-end: probe your hardware, rank your
models, and emit ready-to-run arguments — refusing anything that would page to disk.

### Added
- **`bytefit` CLI** — `probe`, `recommend`, and `plan <model>`, with `--json`, `--ctx`,
  `--use-case`, `--backend`, `--dir`, `--hf`, and `--experimental`, plus `--help` and meaningful
  exit codes (0 ok · 1 not found / refused · 2 usage).
- **Model catalogs** — installed Ollama models (exact parameter and MoE active-param counts), a
  local `.gguf` folder (`--dir`), and a Hugging Face GGUF repo without downloading weights
  (`--hf <repo>`, opt-in).
- **Hardware probe** — VRAM / RAM / measured NVMe across NVIDIA, AMD, and Apple Silicon, selecting
  the largest GPU on multi-GPU machines and reporting honest free memory.
- **Loadout planning** — quant + KV-cache type + context length + offload policy, a
  memory-bandwidth tok/s prediction, and ready-to-run llama.cpp / Ollama / LM Studio arguments
  (including fractional MoE expert offload via `--n-cpu-moe`).
- **Anti-paging admission** — refuses configurations that would page to disk, with a structured
  `{ code, message, hint }` reason and a non-zero exit code, rather than launch a silently-paging job.
- Quant-quality guidance (warns on unsafe sub-4-bit quants), honest KV estimates when a GGUF omits
  attention metadata, and a single memory-headroom model that won't over-refuse on small cards.

### Calibrated predictor (measured on RTX 5090, grounded in `docs/research-grounding.md`)
- Dense decode tok/s confirmed within ~3% of measurement (η≈0.70). **MoE batch=1** uses an active-byte
  efficiency curve — a flat factor over-predicted ~3.6× (e.g. a 36B/3.6B-active model: 490 → 132 tok/s,
  measured 137). **Sliding-window architectures** (Gemma-class) model only the global layers at full
  context — was over-estimating KV up to ~5× and falsely refusing models that fit (gemma-31B@32k:
  DEGRADED-7 → FITS-52 tok/s, measured 62). **Per-layer GQA arrays** (Qwen3-MoE/Next, Gemma) are parsed
  correctly. Capability ranking won't prefer a sub-4-bit bigger model over a safe higher-bit smaller one.
  Speculative-decoding guidance is gated by architecture (dense ~1.7–2.5×; low-active MoE → self-speculative).
- The experimental NVMe bench is labeled `estimated` (it can't bypass the OS page cache) and capped; the
  unknown-GPU bandwidth fallback is a genuine conservative floor.

### Security
- No telemetry. No external network by default; the optional `--hf` fetch is opt-in, read-only,
  Range-bounded, and never downloads weights. Untrusted GGUF headers are bounds-checked.

### Notes
- Zero runtime dependencies. First-class Windows / macOS / Linux support. Node ≥ 20.
- The `--experimental` MoE disk-streaming tier is gated R&D, not a stability promise.
