---
title: How it decides
description: The roofline predictor, quant and KV selection, and the anti-paging admission guard.
sidebar:
  order: 2
---

bytefit's recommendations are deterministic — the same hardware and model always produce the same
loadout. Here is the pipeline behind a verdict.

## 1. Footprint

For a given quant, bytefit computes the bytes a model needs: weights at the quant's *real*
bytes-per-weight (Q4_K_M is ≈ 4.5 bits, not 4 — the block scales count) plus the KV cache at the
planned context length. For Mixture-of-Experts models it tracks two numbers — *total* params for the
resident footprint, and *activated* params (the experts actually read per token) for the speed
prediction.

## 2. Predicted tok/s — the roofline

Decode is memory-bandwidth-bound, so:

```
tok/s ≈ (memory_bandwidth × efficiency) ÷ bytes-read-per-token
```

Real decode realizes only ~60–80% of the rated-bandwidth ceiling once KV reads, attention, sampling,
and kernel-launch overhead are included, so bytefit applies an efficiency factor (≈ 0.7) rather than
quoting an optimistic theoretical number.

## 3. Quant selection

bytefit prefers the *crushed big model* — accuracy-per-byte favors more parameters at fewer bits,
down to about 4-bit. Below 4-bit, quality falls off a cliff unless the build uses an importance matrix
(IQ-quants) or Unsloth Dynamic mixed precision, so bytefit warns when it has to fall back to a legacy
sub-4-bit quant, and keeps a `Q4_K_M` floor for reasoning tasks (`--use-case reasoning`).

## 4. KV cache

The default is `q8_0` — near-lossless and roughly half the size of f16. `q4_0` (about a third) is used
only when long context is the explicit goal. When a GGUF omits its grouped-query-attention metadata,
bytefit assumes the worst case (no GQA) but labels the KV estimate an **upper bound**, so the model may
fit a faster tier than the conservative number suggests.

## 5. Placement and admission — the core guard

bytefit places weights on the fastest tier that fits:

- **fits VRAM** → the fast lane.
- **VRAM + RAM** → offload (for MoE, experts to CPU via `--n-cpu-moe N`); the predicted speed uses RAM bandwidth.
- **exceeds RAM** → the experimental disk tier (MoE only, behind `--experimental`).

Before admitting a loadout, bytefit checks predicted footprint against usable memory —
`min(free − fixed headroom, total × cap)` — so it neither over-refuses on small cards nor over-commits
on large ones. **If a config would page involuntarily, bytefit refuses** with a structured
`{ code, message, hint }` and a non-zero exit code, because involuntary paging collapses throughput by
roughly 78×: running a smaller model is always better than thrashing.

The evidence behind every constant here — the efficiency factor, the headroom caps, the paging cliff,
the quant floor — is documented in the repository's
[research grounding](https://github.com/mcp-tool-shop-org/bytefit/blob/main/docs/research-grounding.md).
