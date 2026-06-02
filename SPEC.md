# bytefit Specification

> Hardware-aware local-LLM loadout planner.
> Status: v1.0.0 — stable. Architecture locked; pure core + I/O shell + CLI shipped.

## 1. What bytefit is

bytefit answers one question for a given machine: **what is the largest, most capable local
model you can actually run well — and with exactly which quantization, KV-cache, context
length, and offload policy — without silently falling into disk paging?**

It is an *advisor*, not just an estimator. Existing tools tell you whether a model *fits*;
bytefit tells you what to *run*: model class + quant family + KV-cache type + context size +
offload policy, plus a hard refusal for configurations that would tip into uncontrolled
paging.

Governing law — everything else follows from it:

```
decode tok/s  ≈  memory_bandwidth ÷ bytes-read-per-token
```

bytefit minimizes bytes-read-per-token, keeps those bytes on the fastest tier that fits,
predicts the resulting speed, and refuses configs that would page.

## 2. Why it exists — prior art (verified 2026-05-29)

Fit labels and memory estimates are becoming table stakes; none of the existing tools close
the *decision* loop.

| Tool | Fit label (pre-load) | Mem estimate (no load) | Context auto-size | Offload auto-policy | Quant auto-select | KV-type auto-select | Anti-paging refusal | Model-class rec |
|---|---|---|---|---|---|---|---|---|
| Jan v0.8 | ✓ 3-state (coarse¹) | ✗ | partial | ✗ | ✗ (static tag) | ✗ | ✗ | ✗ |
| LM Studio | partial (GUI warn) | ✓ (`--estimate-only`) | ✗ | partial (`--gpu` auto) | ✗ | ✗ | partial (GUI only) | ✗ |
| Ollama | ✗ | ✗ | ✗ | ✓ (auto layers) | partial (Q4 default) | ✗ | ✗ | ✗ |
| llama.cpp `--fit` | ✗ | ✗ | ✓ | ✓ (`-ngl auto`) | ✗ | ✗ | partial (OOM only) | ✗ |
| llmfit | ✓ | partial | partial | ✗ | ✓ | ✗ | ✗ | ✓ |
| VRAM calculators | ✗ | ✓ (manual) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

¹ Jan's recommendation keyed on system RAM, not VRAM ([janhq/jan#2339](https://github.com/janhq/jan/issues/2339)); the "Recommended" quant tag is static editorial, not algorithmic.

**The open wedge** (what nothing does): hardware-fingerprinted **quant + KV-type
recommendation** + **context sizing as a function of quant-adjusted headroom** + **a hard
refusal / exit-code for paging configs** + **model-class recommendation** ("a 14B dense
Q4_K_M beats a 32B Q2_K on your 12 GB card"). The closest competitor, `llmfit`, auto-selects
quant and scores model classes but has none of KV / context / refusal. That combination is
bytefit.

## 3. Inputs

### 3.1 Hardware probe (I/O shell)
- **VRAM** — total + free, per GPU (`nvidia-smi`; ROCm / `pynvml`-equivalent later).
- **System RAM** — total + free.
- **NVMe bandwidth** — *measured*, not rated, and **method-dependent**: llama.cpp's default mmap
  demand-paging faults 4K pages at shallow queue depth (≈4K-QD1, ~÷75–90 off sequential), while a tuned
  large-block prefetch of whole experts (33–340 MB; MoE-Infinity arXiv:2401.14361) approaches ÷1.2 — a
  flat ÷4 fits neither. bytefit's bench is an **estimated** upper bound (page-cache-contaminated), capped
  and bounded by `min(NVMe, PCIe, host-staging)`. Only measured numbers drive the disk tier.
- **Backend** — llama.cpp / Ollama / LM Studio presence + version.

### 3.2 Model metadata (catalog)
- Architecture (dense vs MoE), total params, **activated params** (MoE), expert count + active experts.
- Available quant builds + on-disk sizes (GGUF header read, or catalog).
- Per-tensor quant scheme where known (imatrix / Dynamic GGUF).

## 4. The decision pipeline

### Step 0 — Probe
Gather §3. NVMe bandwidth is measured only when a disk tier is a candidate.

### Step 1 — MoE branch first
MoE sparsity is *free* quality (structural, not lossy), so it is decided before quantization.
If the model is MoE:
- Split: attention + shared experts + KV → GPU; routed experts → CPU (or disk, experimental).
- Hot-expert placement by **LFU / activation-frequency** (Lin, He & Chen 2025, arXiv:2511.05814 — LFU beats LRU), not LRU; cache ≈ 2x active experts.
- Async-prefetch experts one layer ahead from the prior token's router output (**~60–70% hit**, workload-dependent; Eliseev & Mazur 2023, arXiv:2312.17238 Fig. 2).
- Emit a routing-consistency score; warn on shared-expert / sparse-interval models (Jamba-class).
- **Predicted decode tok/s uses an active-byte MoE efficiency curve** — batch=1 sparse expert-gather
  realizes far below dense bandwidth (~0.17 at ~2 GB active on a 5090), rising with active bytes as the
  fixed per-token overhead amortizes (research-grounding #33). Applied to VRAM-resident experts only.

**Hard RAM-residency wall (verified — primary sources):** expert offload is bounded by *total
RAM*, not VRAM. DeepSeek-V3/R1-class (671B) genuinely needs **~382 GB DRAM single-socket (1 TB
dual-socket)** for KTransformers' headline speed (the ~13.7 tok/s figure is a **1 TB server-RAM**
result; single-socket 382 GB is ~10.3 tok/s) — **there is no consumer-RAM path**, so bytefit
**refuses** it on consumer RAM (≤128 GB) rather than route it silently to disk. **Qwen3-Next-80B-A3B
is NOT in that class:** it is ~160 GB BF16 native and **~46 GB at 4-bit** (Unsloth) with only ~3 B
params active per token, so it **runs on a high-RAM consumer box (≥64 GB)** via MoE-experts-to-CPU
offload — bytefit **recommends** it as a stretch pick, it does not refuse it. (An earlier "~320 GB"
for it was an FP32 miscalc — corrected 2026-06-01 after primary-source verification against the Qwen
model card + Unsloth Qwen3-Next docs.) The admission test keys on the **quant-adjusted** footprint,
never the native/FP32 size. (KTransformers tutorial; Unsloth R1-0528 / Qwen3-Next guidance.)

### Step 2 — Quant selection
- **Core heuristic:** prefer the crushed big model — accuracy-per-VRAM-byte favors more params
  at fewer bits (a Q4 13B beats an FP16 7B in the same footprint).
- Floor **Q4_K_M** for reasoning (the 4→3-bit cliff; Dettmers & Zettlemoyer 2022, arXiv:2212.09720 — 4-bit is near-universally optimal for total bits vs accuracy; the trend reverses at 3-bit).
- Below 4-bit, only imatrix / IQ quants.
- Prefer an Unsloth Dynamic GGUF when one exists — per-tensor mixed precision; the value is
  bit-allocation by tensor *sensitivity* (e.g. ~88% of DeepSeek-R1 is MoE weights; attention,
  routers, norms, embeddings, LM head, and early `down_proj` are kept higher-bit).
- Non-GGUF / vLLM path: AWQ > GPTQ; AQLM / QuIP# for sub-3-bit; BitNet only if natively trained.

### Step 3 — KV cache
- Default **q8_0** — near-lossless, ~2x context per VRAM byte, <5% speed hit.
- q4_0 only when context is the explicit goal (~3x context; adds per-token dequant overhead that grows with context — magnitude workload-dependent, no verified fixed-% figure).
- Any eviction / sliding-window must pin the first 4 attention-sink tokens.
- **Sliding-window archs (Gemma-class)** cache full context only on the ~1/6 global layers; local layers
  cap KV at the window — KV = `nGlobal·ctx + nLocal·min(ctx, window)`, not all-layers·ctx (Gemma 3,
  arXiv:2503.19786; read `sliding_window` + `sliding_window_pattern` from the GGUF).
- Extreme-context mode: token eviction (H2O / SnapKV) stacked on quant.
- FlashAttention is assumed-on; it enables long context but does **not** shrink the KV cache.
- ⚠ Unified-memory (Apple Silicon): q4_0 KV forces a Metal FlashAttention path and costs ~10–33% decode tok/s (llama.cpp #8918) — keep q8_0 there.

### Step 4 — Tier placement + admission control
- Fits VRAM → fast lane.
- Exceeds VRAM, fits VRAM+RAM → offload (MoE: experts → RAM; dense: layer split); predict tok/s on RAM bandwidth.
- Exceeds RAM → **disk tier — EXPERIMENTAL / R&D only** (see §6).
- **Admission guard (the core value):** compute predicted footprint (weights + KV + context +
  overhead) vs (free VRAM + free RAM − headroom). If a config would page involuntarily,
  **refuse / downgrade / route to a smaller model** — never launch a silently-paging job.
  Refusal returns a non-zero exit code and a structured reason `{ code, message, hint }`.

### Step 5 — Usability reclaim
Any offload / disk tier is bandwidth-bottlenecked → attach speculative decoding. **Realistic batch=1
gains are ~1.7–2.5×, not the 3–4× lab ceiling** (that is dense chat at greedy decode; Liu et al. 2026
arXiv:2601.11580 measures ~1.73× on a dense 8B). **Gate on architecture:** dense → EAGLE-2 (trained
head) or self-speculative; **low-active MoE → self-speculative only — a draft tree activates many more
experts and can net-slow decode** (Saxena et al. 2025 arXiv:2506.20675). LayerSkip self-speculative
(arXiv:2404.16710) is the safe no-extra-weight fallback.

## 5. Output

A **loadout**:
- model + quant build, KV-cache type, context length, offload policy (n-gpu-layers / CPU-MoE placement), speculative lane.
- **verdict**: `fits` | `degraded` | `refused` (with reason).
- **predicted** tok/s (roofline) + footprint breakdown.
- **runtime args**: ready-to-run llama.cpp flags (`-ngl`, `--n-cpu-moe`, `-ot`,
  `--cache-type-k/v`, `--ctx-size`, `--fit`) and/or Ollama options (`num_gpu`,
  `OLLAMA_KV_CACHE_TYPE`, `OLLAMA_FLASH_ATTENTION`, context length).
- **reasoning trace**: why this loadout, what was rejected and why.

## 6. Hard constraints

1. **Refuse, don't page.** No config that would tip into uncontrolled disk paging is ever recommended silently.
2. **RAM wall.** A model is refused on consumer RAM (≤128 GB) only when its **quant-adjusted** footprint needs server-class RAM — DeepSeek-V3/R1-class (671B, ~382 GB–1 TB) is the canonical case. Qwen3-Next-80B-A3B is **not** refused: ~46 GB at 4-bit fits a high-RAM consumer box (§4).
3. **Disk tier is experimental.** mmap demand-paging of MoE experts works *today* (llama.cpp
   default `--mmap`), but a persistent GPU expert cache is **not in mainline**
   ([llama.cpp#20757](https://github.com/ggml-org/llama.cpp/issues/20757), closed without a
   merged PR), and KTransformers' 2026 roadmap still lists "AI SSD performance bottleneck" and
   Windows heterogeneous overhead as active R&D
   ([roadmap #1921](https://github.com/kvcache-ai/ktransformers/issues/1921); open feature
   request [#1421](https://github.com/kvcache-ai/ktransformers/issues/1421)). bytefit's disk
   tier is gated behind an explicit `--experimental` flag, MoE-only, with a measured-tok/s
   warning. On Windows it recommends a Dev Drive (Defender performance mode converts scans to
   async, lowering per-page-fault latency). It is instrumented R&D, not a v1 promise.

## 7. Reference targets — 12 GB VRAM / 16 GB RAM (worked example)

The "punch above your weight" answer for this tier is **not** DeepSeek-from-disk. Architecture
is verified. The sizes below are **illustrative secondary figures for the worked example only** —
bytefit never hard-codes them: real `sizeBytes` always comes from the live GGUF header / Ollama /
`--hf` tree, so an approximate number here can never drive an admission verdict.

- **Comfortable:** 14B dense at Q4_K_M / Q5_K_M (~9 / ~10.5 GB, illustrative). The "feels local" tier.
- **Stretch:** Qwen3-30B-A3B — 30.5B total / **3.3B activated** / 128 experts / 8 active
  (CONFIRMED) — at aggressive quant + CPU experts + short context (~10.4 GB IQ2_M / ~14.6 GB Q3_K_L, illustrative).
- **Possible but degraded:** dense 32B at low quant + partial offload + short context — not the default if latency matters.
- **Refused:** DeepSeek-V3/R1-class — wants server RAM.

## 8. Design constraints

- **Zero production dependencies.** The pure core (math) and the I/O shell use Node built-ins
  only (`child_process`, `os`, `fs`). Mirrors `@mcptoolshop/ai-loadout`'s discipline.
- **Pure-core / I/O-shell split.** The roofline predictor, footprint math, quant/KV selection,
  and the admission verdict are deterministic pure functions of `(hardware, model-metadata)` —
  fully unit-testable. The shell does probing, catalog reads, and arg emission.
- Pure TypeScript ESM, Node ≥ 20. Deterministic: same inputs → same loadout.

## 9. Research grounding

Two sources: a 5-agent study-swarm (technique ceiling) and a primary-source verification pass
(production floor + competitive landscape), both 2026-05.

**Corrections carried from verification (honesty trail):**
- The KTransformers "671B on a 24 GB GPU" figure requires **382 GB–1 TB system RAM**; the
  original swarm finding omitted this — corrected in §4.
- A persistent GPU expert cache ("13–30 tok/s with caching") is **not in mainline llama.cpp** —
  treat those numbers as custom-build, not stock — §6.

**Key sources:**
- KTransformers — SOSP'25 + [DeepSeek R1/V3 tutorial](https://github.com/kvcache-ai/ktransformers/blob/main/doc/en/DeepseekR1_V3_tutorial.md); [2026 roadmap #1921](https://github.com/kvcache-ai/ktransformers/issues/1921); [SSD-expert feature request #1421](https://github.com/kvcache-ai/ktransformers/issues/1421)
- Unsloth Dynamic GGUF — [R1-0528](https://unsloth.ai/blog/deepseek-r1-0528); [1.58-bit dynamic](https://unsloth.ai/blog/deepseekr1-dynamic)
- MoE offload — PowerInfer (arXiv:2312.12456); Fiddler (arXiv:2402.07033); Mixtral-offloading (arXiv:2312.17238); routing consistency (arXiv:2505.16056)
- Quant — **Dettmers & Zettlemoyer 2022 (arXiv:2212.09720 — the 4→3-bit cliff, primary)**; Li 2025 (arXiv:2505.11574 — quantization-vs-reasoning); ParetoQ (arXiv:2502.02631); AQLM (arXiv:2401.06118); QuIP# (arXiv:2402.04396)
- **Full verified floor (31 findings + verification pass): `docs/research-grounding.md`.**
- KV cache — KVQuant (arXiv:2401.18079); KIVI (arXiv:2402.02750); H2O (arXiv:2306.14048); StreamingLLM (arXiv:2309.17453); SnapKV (arXiv:2404.14469); FlashAttention (arXiv:2205.14135)
- Planner — FlexGen (arXiv:2303.06865); roofline / LLM-Viewer (arXiv:2402.16363); GGUF VRAM formula (oobabooga)
- Speculative decoding — Leviathan (arXiv:2211.17192); EAGLE-2 (arXiv:2406.16858); Medusa (arXiv:2401.10774); self-speculative (arXiv:2309.08168)
- Landscape — [Jan v0.8.0](https://www.jan.ai/changelog/2026-05-22-jan-v0.8.0) + [#2339](https://github.com/janhq/jan/issues/2339); [LM Studio `lms load`](https://lmstudio.ai/docs/cli/local-models/load); [llmfit](https://github.com/AlexsJones/llmfit)

## 10. Verification status

| Claim class | Status |
|---|---|
| RAM-wall numbers (382 GB / 1 TB; Unsloth RAM-vs-tok/s) | CONFIRMED (primary) |
| Qwen3-Next-80B-A3B requirement | CORRECTED → ~160 GB BF16 / **~46 GB at 4-bit**, consumer-runnable (the ~320 GB figure was FP32). Primary: Qwen card + Unsloth |
| Disk-streaming maturity (experimental) | CONFIRMED (roadmap + open issue) |
| Competitive wedge open | CONFIRMED (matrix, primary) |
| Qwen3-30B-A3B architecture | CONFIRMED (model card) |
| GGUF size catalog (§7) | Illustrative only — bytefit reads real `sizeBytes` live; never hard-coded |
| 4→3-bit quant cliff | CONFIRMED (primary: Dettmers & Zettlemoyer 2022, arXiv:2212.09720) |
