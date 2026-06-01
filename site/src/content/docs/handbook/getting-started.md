---
title: Getting started
description: Install bytefit and read your first recommendation.
sidebar:
  order: 1
---

## Install

```bash
npm install -g @mcptoolshop/bytefit
```

Requires Node ≥ 20. [Ollama](https://ollama.com) is optional but recommended — bytefit reads your
installed Ollama models out of the box.

## See your hardware

```bash
bytefit probe
```

```
NVIDIA GeForce RTX 5090  31.8 GiB VRAM (28.9 free) @ 1792 GB/s
RAM  63.4 GiB (46.7 free) @ 76.8 GB/s
```

bytefit reports *honest* free memory — if another process (or a resident Ollama model) is holding
VRAM, you'll see less free, and the recommendations adjust accordingly.

## Rank your models

```bash
bytefit recommend
```

```
NVIDIA GeForce RTX 5090 / 31.8 GiB VRAM / 63.4 GiB RAM — 10 models, 10 runnable:

  mistral-small:24b   FITS      Q4_K_M q8_0 ctx8192  ~84 tok/s  [vram]
  qwen3.6:27b         FITS      Q4_K_M q8_0 ctx8192  ~54 tok/s  [vram]
  qwen3.6:35b-a3b     DEGRADED  Q4_K_M q8_0 ctx8192  ~21 tok/s  [vram+ram]
```

Each row is a **loadout**: the verdict (`FITS` / `DEGRADED` / `REFUSED`), the chosen quant and
KV-cache type, the context length, a predicted tok/s, and the memory tier (`vram`, `vram+ram`, or the
experimental `disk`).

## Plan one model

```bash
bytefit plan qwen3.6:27b
```

`plan` prints the reasoning trace and the exact command to launch it:

```
qwen3.6:27b: FITS Q4_K_M q8_0 ctx8192 ~54 tok/s
  - Usable 27.4 GiB VRAM + 44.8 GiB RAM after headroom; KV 2.5 GiB (q8_0, 8192 ctx).
  - Quant Q4_K_M: 17.2 GiB weights.
  - Fits fully in VRAM. ~54 tok/s.

llama.cpp:
  llama-server -m <model.gguf> -c 8192 -ngl 48 -ctk q8_0 -ctv q8_0 -fa on
```

Pick a backend with `--backend ollama` or `--backend lmstudio`, change the context with `--ctx`, or
get JSON with `--json`. Every flag is in the [CLI reference](/bytefit/handbook/cli-reference/).

## Models bytefit can't fully read

You aren't limited to installed Ollama models:

```bash
bytefit recommend --dir ~/models            # a folder of .gguf files
bytefit plan unsloth/Qwen3-14B-GGUF --hf unsloth/Qwen3-14B-GGUF   # a HF repo, no download
```

`--hf` reads only the GGUF header over HTTPS — it never downloads the weights.
