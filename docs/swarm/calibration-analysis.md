# bytefit predictor calibration — measured on RTX 5090 (dogfood swarm 2, 2026-06-01)

> Study #1 (highest-value) of the second dogfood swarm: calibrate the roofline predictor's
> efficiency factor η and the additive overhead term against **measured** decode tok/s on this rig,
> rather than only literature. Raw data: `docs/swarm/calibration-raw.json`. Method below.
> This is empirical primary data generated on-rig; the literature it is contextualised against
> (Yuan 2024 #2, Imai 2024 #3) is already verified in `research-grounding.md`.

## Method

- **Rig:** RTX 5090, 32607 MiB VRAM, rated bandwidth **1792 GB/s** (TechPowerUp; the value in `gpu-tables.ts`).
- **Measurement:** Ollama HTTP `/api/generate`, `stream:false`, `think:false`, `temperature:0`,
  `num_predict:256`. `eval_rate = eval_count / eval_duration` is pure decode tok/s (excludes load +
  prompt-eval), so it isolates the steady-state memory-bound decode the roofline models.
- **Models:** seven local Ollama models, all **Q4_K_M** (bytes/param = 4.83/8 = 0.604). Six dense + one
  MoE (`qwen3.6:35b-a3b`, 36B total / 8-of-256 experts). Each fully GPU-resident except where noted.
- **bytefit prediction:** `node dist/cli.js plan <m> --ctx 512 --json` (low ctx → KV term negligible →
  isolates the weight-bandwidth regime the measurement is in).

## Raw results

| model | arch | params | W (GB, Q4_K_M) | measured tok/s | GPU resident | bytefit pred (ctx512) | err |
|---|---|---|---|---|---|---|---|
| mistral-small:24b | llama | 23.6B | 14.25 | 94.12 | 100% | 87.9 | -7% |
| devstral-small-2:24b | mistral3 | 24.0B | 14.49 | 91.33 | 100% | 86.3 | -6% |
| aya-expanse:32b | command-r | 32.3B | 19.50 | 72.67 | 100% | 64.2 | -12% |
| gemma4:31b | gemma4 | 31.3B | 18.90 | 62.04 | 100% | 63.1 | +2% |
| qwen3.6:27b | qwen35 | 27.8B | 16.78 | 58.21 | 100% | 73.0 | +25% |
| granite4.1:30b | granite (hybrid) | 28.9B | 17.45 | 47.62 | 99% (1% CPU spill) | 71.7 | +51% |
| **qwen3.6:35b-a3b** | **qwen35moe** | **36.0B / ~3.6B active** | 22.3 total | **136.12** | 100% | **489.6** | **+260%** |

## Finding CAL-3 (positive) — the dense η default is empirically correct

Implied efficiency with overhead pinned at 0 (`eta = W_bytes * tok_s / BW`), six dense models:

```
mistral 0.748 . devstral 0.739 . aya 0.791 . gemma 0.654 . qwen27b 0.545 . granite 0.464*
```

- **Mean implied η across the 5 clean (100%-GPU) dense models = 0.695.** A least-squares fit of
  `1/tok_s` vs `W_GB` gives **slope -> η ~ 0.68, intercept -> overhead ~ 0** (intercept came out slightly
  negative, so 0 is the correct floor). **The literature-derived defaults (η = 0.70, overhead = 0) are
  vindicated within 3% by direct measurement on the 5090.** No change needed; this is shipped confidence.
- **Per-architecture spread is real: η in [0.55, 0.79].** qwen3.6 dense is the slow outlier (0.545);
  command-r/llama/mistral are efficient (0.74-0.79). *granite (0.464) is depressed by a 1% CPU spill
  AND its hybrid Mamba-2/transformer arch (state-space layers are not pure weight-streaming).*
  -> **Design implication:** keep η a documented band + per-call tunable (it already is). Predicted tok/s
  carries ~+/-20-25% per-architecture uncertainty around the central estimate - surface it as approximate,
  never false-precise. Do **not** chase a per-model η table; the default is the right central value.

## Finding CAL-1 (CRITICAL) — MoE batch=1 tok/s is over-predicted ~3.6x

`qwen3.6:35b-a3b`: bytefit predicts **489.6 tok/s** (ctx512) / **247 tok/s** (ctx8192, in `recommend`);
**measured 136.12 tok/s**. bytefit derived `active/tok = 2.2 GB` (8/256 experts -> ~3.6B active) and applied
the **dense** η = 0.68. The measured effective bytes/token is ~ 1792*0.68 / 136 ~ **9.0 GB ~ ~15B
effective params** - between the 3.6B active headline and the 36B total.

The gap is mechanism, not noise: **at batch=1, routed-expert reads are a scattered gather, not contiguous
streaming, so they realise a far lower effective bandwidth than dense decode.** Implied MoE efficiency for
the active-expert bytes: `eta_moe ~ 136*2.2/1792 ~ 0.17` - roughly **4x below** the dense 0.68.

- This is **confidently-wrong-fast advice on an MoE model** - the precise failure mode bytefit exists to
  prevent. A user told "247 tok/s" gets 136.
- **Fix (grounded, then pinned):** model the resident-MoE active-expert bytes with a separate, lower
  effective-bandwidth (sparse-gather inefficiency at batch=1). The single measured anchor gives eta_moe~0.17;
  this needs the study-swarm's batch=1-MoE-efficiency grounding before locking a constant, then a
  regression test pinning `qwen3.6:35b-a3b` predicted into a measured band (~ [100, 180] tok/s).
  Interim conservative guard is acceptable since under-promising MoE speed is the safe direction.
- **Single MoE fixture caveat:** only one MoE architecture is local (qwen3 A3B; `qwen3.6:latest` is the same
  blob). The constant must be literature-grounded, not fit to n=1. **Logged, not hidden.**

## Finding CAL-2 (HIGH) — KV is over-estimated for GQA-absent + sliding-window archs -> false DEGRADED

`gemma4:31b`: bytefit @ ctx8192 -> **DEGRADED, ~7 tok/s, [vram+ram]** (KV estimated **15.0 GiB**: kvHeads=32,
no-GQA assumed). **Measured: 62 tok/s, 100% GPU, at 32k ctx, 27 GB resident** -> real KV(32k) ~ 7 GiB vs
bytefit's implied **60 GiB at 32k (~8.5x over)**. Two compounding causes:

1. **GQA-absent assumption** (the pass-1 C2 "honest upper bound"): when `head_count_kv` is missing bytefit
   assumes kvHeads = head_count (no GQA). Gemma uses GQA (~kvHeads=16) -> ~2x over on its own. The upper
   bound is *paging-safe* but here it is so conservative it **flips the verdict to a false DEGRADED** and
   under-predicts tok/s ~9x.
2. **No notion of sliding-window / local attention.** Gemma 3/4 interleave local (~1024-token window)
   attention on ~5/6 of layers, so KV does **not** grow linearly with context for those layers. bytefit's
   `kvBytesPerToken = 2*layers*kvHeads*headDim*bpe` assumes *every* layer caches the *full* context - wrong
   for Gemma/Mistral-sliding/Phi-class. This is the bulk of the 8.5x gap (GQA alone is only 2x).

- **Effect:** a model that is a comfortable 62 tok/s VRAM-resident pick is advertised as a degraded 7 tok/s
  offload and de-ranked. Confidently-wrong-slow + wrong tier.
- **Fix (ties to study #3, KV/context scaling):** (a) when `head_count_kv` is absent, infer a GQA-likely
  default from the architecture family instead of defaulting to the catastrophic no-GQA bound; (b) model
  sliding-window layers (cap their per-token KV at the window) for archs that declare
  `*.attention.sliding_window` / local-global interleave. Both must be grounded + tested against the
  measured gemma anchor (fits-in-VRAM at 32k).

## What changes (summary)

| Finding | Severity | Code surface | Gated on |
|---|---|---|---|
| CAL-3 dense η = 0.70, overhead = 0 confirmed | (positive) | none - anchor + band note in `research-grounding.md`, `constants.ts` comment | - |
| CAL-1 MoE over-predict 3.6x | CRITICAL | `roofline.ts` / `footprint.ts` separate MoE active-expert efficiency; `constants.ts` new factor; regression test | study #1 batch=1-MoE grounding + verification |
| CAL-2 KV over-estimate (GQA + sliding-window) -> false DEGRADED | HIGH | `footprint.ts kvBytesPerToken`, `gguf/model-meta.ts` GQA-family default, `types.ts` slidingWindow | study #3 KV/context grounding + verification |
