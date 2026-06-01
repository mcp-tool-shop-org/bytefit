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

### Security
- No telemetry. No external network by default; the optional `--hf` fetch is opt-in, read-only,
  Range-bounded, and never downloads weights. Untrusted GGUF headers are bounds-checked.

### Notes
- Zero runtime dependencies. First-class Windows / macOS / Linux support. Node ≥ 20.
- The `--experimental` MoE disk-streaming tier is gated R&D, not a stability promise.
