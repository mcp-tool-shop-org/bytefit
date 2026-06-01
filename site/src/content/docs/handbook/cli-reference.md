---
title: CLI reference
description: Every bytefit command, flag, and exit code.
sidebar:
  order: 3
---

## Commands

### `bytefit probe`

Detect the GPU, VRAM, RAM, and (optionally) measured NVMe bandwidth, and print the hardware profile.

### `bytefit recommend`

Rank the available models best-first for the detected hardware, dropping any that can't run
interactively.

### `bytefit plan <model-id>`

Plan one model: choose quant + KV-cache + context + offload, predict tok/s, and emit ready-to-run
arguments — or refuse with a structured reason. An exact model id wins; an unambiguous prefix also
resolves (an ambiguous one lists the candidates and exits `2`).

## Flags

| Flag | Applies to | Meaning |
|------|-----------|---------|
| `--json` | all | Machine-readable JSON output |
| `--dir <path>` | recommend, plan | Also scan a folder of `.gguf` files |
| `--hf <repo>` | recommend, plan | Also rank a Hugging Face GGUF repo without downloading it (opt-in network) |
| `--ctx <n>` | recommend, plan | Context length in tokens (default 8192) |
| `--use-case <c>` | recommend, plan | `reasoning` \| `chat` \| `bulk` — gates the quant floor |
| `--backend <b>` | plan | `llama.cpp` \| `ollama` \| `lmstudio` (default `llama.cpp`) |
| `--experimental` | recommend, plan | Allow the experimental MoE disk-streaming tier (MoE only) |
| `-h`, `--help` | — | Show help |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | OK |
| `1` | Model not found, or the loadout was refused |
| `2` | Usage error (bad command, ambiguous model, unknown backend) |

## Model sources

bytefit reads installed **Ollama** models by default (via `OLLAMA_HOST`, default
`http://127.0.0.1:11434`). Add a local folder of `.gguf` files with `--dir <path>`, and a Hugging Face
GGUF repo with `--hf <repo>` — the latter reads only the GGUF header over HTTPS and never downloads the
weights.
