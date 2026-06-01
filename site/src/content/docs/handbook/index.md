---
title: bytefit
description: Hardware-aware local-LLM loadout planner — what it is and how it decides.
sidebar:
  order: 0
---

bytefit answers one question for your machine: **what is the largest, most capable local model you
can actually run well — and with exactly which quantization, KV-cache, context length, and offload
policy — without silently falling into disk paging?**

It is an *advisor*, not just an estimator. Jan and LM Studio tell you whether a model *fits*; bytefit
tells you what to **run** — model class + quant family + KV-cache type + context + offload policy —
and **refuses** any configuration that would tip into uncontrolled paging.

## The governing law

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

Token generation (decode) is memory-bandwidth-bound: every token re-reads the active weights and the
KV cache. bytefit minimizes bytes-read-per-token, keeps those bytes on the fastest memory tier that
fits, predicts the resulting speed, and refuses configs that would page to disk — where throughput
collapses by roughly 78×.

## What you get

- **probe** — your GPU, VRAM, RAM, and measured NVMe bandwidth.
- **recommend** — your installed models, ranked best-first for this hardware.
- **plan** — one model's full loadout plus ready-to-run llama.cpp / Ollama / LM Studio arguments, or a
  structured refusal explaining why it won't run.

New here? Start with [Getting started](/bytefit/handbook/getting-started/). To understand the numbers
behind a recommendation, read [How it decides](/bytefit/handbook/concepts/).
