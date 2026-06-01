# bytefit — Research Grounding (study-swarm + verification pass)

> **Status:** advisor study-swarm (5 agents) + verification swarm (3 agents), 2026-06-01.
> This is the empirical floor for the dogfood pass that takes bytefit from pre-release scaffold
> toward ship. Every finding names its primary source and the specific bytefit design implication;
> citations without an architectural connection are noise. **All load-bearing facts below passed a
> second-pass verification swarm** that pulled primary sources and reported VERIFIED/WRONG/PARTIAL
> per claim (per `feedback_verify_load_bearing_facts.md`).

bytefit is an *advisor that refuses configs*. Its load-bearing decisions are numeric — the roofline
predictor, the quant floor, the KV defaults, the admission/headroom threshold, the MoE offload
economics. If any number is wrong, the tool gives **confidently-wrong advice**, the worst failure
mode for this product. This swarm verifies each against primary sources, **confirms** what holds,
and **refutes/refines** what doesn't.

## Verification-pass honesty trail (what the second pass caught)

The research swarm's first-pass output contained errors that were corrected **before** this document
locked — exactly why the verification pass exists:

- **DROPPED — "InnerQ, arXiv:2602.23200, +36.8% q4_0 long-context latency."** The arXiv ID resolves
  to a real paper ("InnerQ: Hardware-Aware Tuning-Free Quantization of KV Cache") but it reports a
  **2.7× speedup**, not a degradation — the claimed finding was fabricated and directionally inverted.
  Consequently the SPEC §3 flat "**+36% long-context latency**" for q4_0 is now **UNVERIFIED** (no
  primary source surfaced); see finding 15.
- **CORRECTED — Imai et al. (IBM) error-reduction numbers.** Real paper, correct venue, but the
  "80–87% MSE / 12–17 pts R²" was cherry-picked from the single best-case model. Abstract headline:
  MSE reduced up to **80% (vLLM) / 61% (Triton)**, R² **+12% / +4%**; see finding 4.
- **CORRECTED — arXiv:2511.05814 attribution.** LFU>LRU is verbatim-confirmed, but the citation is
  **Shuning Lin, Yifan He, Yitong Chen 2025, "In-depth Analysis on Caching and Pre-fetching in
  Mixture of Experts Offloading."** Prefetch hit-rate (~60–70%) is a figure-read — label approximate.
- **DROPPED — "AWQ ~32% accuracy loss on Llama-3" (from the Bielik-Q2 bake-off).** The paper tests
  Bielik-11B only and never benchmarks Llama-3; clause unsupported. QTIP 79.4% @ 2.4 bpw is verbatim-OK.
- **CONFIRMED against primary sources:** the 78× paging cliff (RTX 5080, verbatim), the Qwen3-Next P0
  correction (Unsloth: "It runs on 46GB RAM/VRAM/unified memory"), the DeepSeek 382 GB/1 TB wall +
  exact tok/s table, Dettmers 2212.09720 ("stops at 3-bit"), the oobabooga 1516 MB constant, vLLM 0.9.

## The five load-bearing questions

1. How faithfully does `tok/s ≈ memory_bandwidth ÷ bytes-per-token` predict real decode? (`roofline.ts`)
2. Is the Q4_K_M quant floor / "3-bit cliff" / "crushed big model" real? (`quant.ts`)
3. What are the real q8_0 vs q4_0 KV-cache tradeoffs + the attention-sink rule? (`plan.ts` KV step)
4. What headroom model defends the anti-paging refusal? (`footprint.ts`, `placement.ts`, admission)
5. What are the real MoE offload economics + the RAM-residency wall? (`placement.ts`, `constants.ts`, §7)

---

## Research grounding (the empirical floor)

### A. Roofline fidelity — `roofline.ts`

1. **Decode is firmly memory-bound; the pure roofline is the correct backbone.** Yuan et al. 2024,
   *LLM Inference Unveiled / Roofline-Model Insights* (arXiv:2402.16363). Batch=1 decode arithmetic
   intensity is ~0.25–1.0 OPs/byte — every layer is memory-bound.
   → keep `tok/s ≈ BW ÷ bytes/token` as the law; apply the corrections below.

2. **Real decode realizes ~60–80% of the theoretical ceiling; raw bandwidth tops out ~85% of rated.**
   *(VERIFIED as sourced magnitudes, not a canonical constant.)* FPGA LLaMA2-7B decode hit "85% of
   the theoretical memory-bandwidth limit" (arXiv:2502.10659); H200 deployments treat ~80% of rated
   as the realistic ceiling; GPU-STREAM ~85% on data-center GPUs.
   → encode a **tunable efficiency factor η, default 0.7 (range 0.6–0.8)** on the bandwidth term, plus
   a raw-bandwidth cap ~0.85. *This is the single most load-bearing constant in the tool — make it a
   named, overridable parameter, not a magic literal.*

3. **Roofline + an overhead regressor cuts prediction error materially.** Imai et al. 2024 (IBM),
   *Predicting LLM Inference Latency: A Roofline-Driven ML Method*, NeurIPS 2024 MLForSystems.
   *(CORRECTED numbers:)* pure roofline alone is inaccurate; adding runtime-overhead regression
   reduces **MSE up to 80% (vLLM) / 61% (Triton)** and raises **R² +12% / +4%** (the 87%/+17-pt figure
   is best-case, opt-on-vLLM only — do not cite as headline).
   → model `tok/s = 1 / (bytes/(η·BW) + c_overhead)`, **not** pure division — small models are
   overhead-dominated, where naive roofline most over-predicts.

4. **MoE has a "double penalty": bytes/token uses active+shared params; resident footprint uses TOTAL
   params.** Adhinarayanan & Jayasena 2026, *The qs Inequality* (arXiv:2603.08960). *(Mechanism
   verified; cite the mechanism, not a verbatim equation.)*
   → `moe_bytes_per_token = (active_expert + shared + attn) × dtype_bytes`, but the paging/admission
   test uses **total** params. Two numbers, two jobs — don't conflate.

5. **KV bytes/token grow linearly with context; the whole cache is re-read each step.** NVIDIA,
   *Mastering LLM Techniques: Inference Optimization*.
   → predictor needs a context-dependent term: `bytes/token = weight_bytes + kv_bytes(ctx)`. A single
   constant tok/s is wrong for long prompts.

6. **FlashAttention does NOT shrink decode bytes/token.** Dao et al.; SGLang FA3 (arXiv:2505.21487).
   → do **not** discount the KV term for FlashAttention in decode (SPEC §3 already says this ✓).

7. **Read the quant format's *actual* bytes-per-weight.** llama.cpp K-quant practice. Q4_K_M ≈ **4.5
   bpw** (metadata/scales add ~10–12% over nominal), Q8_0 ≈ 8.5 bpw.
   → footprint must use measured bpw per format, not nominal bit-width, or it under-predicts ~10%.

### B. Quant floor — `quant.ts`

8. **The "3-bit cliff" is REAL and now PRIMARY-sourced.** Dettmers & Zettlemoyer 2022, *The case for
   4-bit precision: k-bit Inference Scaling Laws* (arXiv:2212.09720, 35k+ runs). Verbatim: 4-bit is
   "almost universally optimal for total model bits and zero-shot accuracy"; "this trend stops across
   all models at 3-bit precision … at 3-bits, this relationship reverses, making 4-bit optimal."
   → **replaces the single secondary "Kurt 2026" citation** the SPEC flagged `[VERIFY]`. Keep the
   Q4_K_M floor; knee at 4→3 bit, hard cliff at 3→2 bit.

9. **"Crushed big model" holds DOWN TO 4-bit, then inverts.** Dettmers & Zettlemoyer 2022 (same).
   → "prefer the crushed big model" is correct *to 4-bit*. Do not recommend a 3-bit-bigger model over
   a 4-bit-smaller one at equal footprint.

10. **Quantization degrades reasoning MORE than general tasks.** Li et al. 2025, *Quantization Meets
    Reasoning* (arXiv:2505.11574; GSM8K/MATH/AIME).
    → keep a **stricter floor for reasoning** (Q4_K_M); permit IQ3/Q3 only for non-reasoning, behind a
    workload flag.

11. **Sub-4-bit is recoverable only with imatrix / Dynamic-GGUF / codebook methods.** ParetoQ
    (arXiv:2502.02631); Unsloth Dynamic 2.0 GGUF docs (Gemma-3-27B Q3_K_XL +1.37%); AQLM
    (arXiv:2401.06118); QTIP at 2.4 bpw ~79.4% on an 11B (arXiv:2603.04162); llama.cpp imatrix docs.
    → gate sub-4-bit on **detecting an imatrix/Unsloth-Dynamic or AQLM/QTIP artifact**; legacy `Q3_K`
    without imatrix is not safe, `IQ3_M`-with-imatrix is (non-reasoning). Encode the imatrix/dynamic flag.

### C. KV cache — `plan.ts` (KV step)

12. **q8_0 KV is near-lossless (measured).** llama.cpp #5932: Qwen2.5-Coder-7B F16 8.3891 vs Q8_0
    8.3934 ppl (+0.05%). → CONFIRMS the q8_0 default; keep it as the floor.

13. **~2× (q8_0) / ~3× (q4_0) context-per-byte CONFIRMED; q4_0 is task-dependent loss.** Plasmon 2026
    (Llama-3-8B, 8 GB: F16 9.4 → Q8_0 7.4 → Q4_0 6.4 GB at 32K). → CONFIRMS the multipliers and the
    "q4_0 only when context is the explicit goal" gate.

14. **q4_0 long-context latency penalty: magnitude UNVERIFIED.** The SPEC's flat "+36%" could **not** be
    confirmed — the one paper that seemed to support it (InnerQ) actually reports a *speedup*.
    → **dogfood action:** either source a real per-token-dequant latency figure or **soften SPEC §3** to
    "q4_0 adds per-token dequant overhead that grows with context (magnitude workload-dependent)." Do not
    ship a precise "+36%" without a citation.

15. **Pin exactly the first ~4 attention-sink tokens.** Xiao et al. 2023, *StreamingLLM*
    (arXiv:2309.17453). → CONFIRMS SPEC §3; hard-code **4** sinks for any eviction step.

16. **Eviction budgets that hold accuracy:** H2O ~20% heavy-hitters (arXiv:2306.14048); SnapKV ~8× cut,
    <2.5% drop (arXiv:2404.14469); KVQuant 3-bit ≈ lossless (arXiv:2401.18079); KIVI 2-bit needs a
    full-precision window (arXiv:2402.02750).
    → for extreme-context mode stack SnapKV/H2O on quant; gate sub-q4 KV behind explicit opt-in + a
    sliding-window guard.

17. **Apple-Silicon caveat: it's a SPEED hit, not an RSS overhead — fix the rationale.** llama.cpp #8918:
    KV quant on Metal forces FlashAttention and costs ~10–33% decode tok/s; no source supports the
    "q4_0 raises RSS via metadata" claim.
    → keep the "default q8_0 on Apple Silicon" *outcome*, but **correct SPEC §3** from "raises RSS" to
    "Metal KV-quant decode-speed regression + FA dependency."

### D. Admission / headroom — `footprint.ts`, `placement.ts`, admission verdict

18. **Fixed overhead floor ≈ 1.5 GB + ~0.6 GB safety buffer (regression-fit, EXACT).** oobabooga 2026
    GGUF-VRAM formula: constant term **1516 MB**, +**577 MB** for 95% load confidence.
    → non-negotiable **~1.5 GB fixed-overhead floor + ~0.6 GB buffer** before counting weights/KV. (The
    SPEC/probe already uses ~1536 MiB headroom — this confirms it.)

19. **CUDA context ≈ 0.3–0.8 GB/process; compute/graph buffer scales with batch × context.** llama.cpp
    #9784. → reserve **≥0.8 GB/GPU** for CUDA context (per-process) and add a **batch×context-scaled
    compute-buffer term** — a flat KV estimate under-refuses at long ctx.

20. **Production headroom consensus ~10%; CUDA graphs alone eat 1–3 GB.** vLLM
    `gpu_memory_utilization=0.9` default + Issue #17549. → anchor the VRAM refusal threshold at
    **max(10%, 3 GB)** free.

21. **Runtimes silently over-assign and pin host RAM on misestimate.** Ollama memory-management
    (DeepWiki) + Issue #13687 (estimate flipped 1.8→6.7 GiB). → justifies bytefit's **independent**
    admission check; refuse rather than let the runtime page.

22. **Involuntary GPU paging is an ~78× cliff, not graceful — measured on RTX 5080 (VERBATIM-VERIFIED).**
    Shen et al. 2025, *Proactive Memory Scheduling* (arXiv:2512.24637): Llama3-8B under CUDA-UM demand
    paging = **78× slowdown, throughput → 1.29%, ~9,210 page faults / 12.7 ms decode step**, RTX 5080.
    → the **empirical kill-shot** for hard refusal. Non-zero-exit refusal at <headroom is strictly
    correct vs a soft warning. Cite this in the refusal `hint`. *(Directly relevant — this is the rig
    class bytefit is dogfooded on.)*

23. **RAM/disk spillover is 5–50× slower; leave ≥25–30% system RAM or mmap thrashes.** LocalLLM.in
    Ollama VRAM guide; llama.cpp #638 (~70% danger line). → apply hard-refusal to the **RAM ledger**;
    default RAM headroom **max(2–3 GB, 25%)**, cap usable RAM at ~70–75%.

### E. MoE offload economics — `placement.ts`, `constants.ts`, SPEC §7

24. **CPU-expert offload is single-digit–low-teens tok/s on consumer GPUs.** Fiddler (arXiv:2402.07033):
    Mixtral-8x7B **>3 tok/s on one 24 GB GPU**. PowerInfer (arXiv:2312.12456): **13.2 avg / 29 peak**
    on a 4090 via power-law hot placement.
    → CONFIRMS the offload-split logic; set stretch-tier tok/s expectations to single-digit–low-teens.

25. **Expert placement: LFU/frequency beats LRU (CORRECTED citation).** Shuning Lin, Yifan He, Yitong
    Chen 2025, *In-depth Analysis on Caching and Pre-fetching in Mixture of Experts Offloading*
    (arXiv:2511.05814): verbatim "we propose LFU caching optimization … and obtain strong improvements
    from LRU."
    → cite **LFU/frequency-skew**, not a generic "beats LRU"; prefetch 1 layer ahead only.

26. **Async-prefetch hit rate is ~60–70%, NOT 80–90% (approximate, figure-read).** Eliseev & Mazur 2023,
    *Fast Inference of MoE with Offloading* (arXiv:2312.17238): next-layer recall ~60–70% (Fig. 2);
    Mixtral end-to-end **2–4 tok/s** (firm, author-stated).
    → **REFUTES the SPEC's "~80–90% hit."** Correct to **~60–70% (approx.)**; flag as workload-dependent.

27. **RAM-wall for DeepSeek-V3/R1 671B CONFIRMED exactly (VERBATIM).** KTransformers DeepseekR1_V3
    tutorial: Q4_K_M = 14 GB VRAM + **382 GB DRAM single-socket / 1 TB dual**; decode **13.69 tok/s
    dual, 10.303 single-6-expert, 8.73 single-8-expert, 4.51 llama.cpp**.
    → CONFIRMS — keep the refusal of DeepSeek-class on ≤128 GB consumer RAM. ✓

28. **⚠ RAM-wall for Qwen3-Next-80B-A3B is WRONG — P0 CORRECTNESS BUG (VERBATIM-VERIFIED).** Qwen model
    card (80B total / 3B active / 512 experts / 10 active + 1 shared; BF16 → ~160 GB native). **Unsloth
    docs, verbatim: "It runs on 46GB RAM/VRAM/unified memory (85GB for 8-bit)"**, full MoE→CPU via
    `-ot ".ffn_.*_exps.=CPU"`. The SPEC's "~320 GB" is the FP32 figure (4 B × 80B) that nobody serves.
    → **bytefit currently auto-refuses a model that is consumer-runnable** (~46 GB 4-bit fits a 64 GB box
    + small VRAM, only ~3B active/token). **Stop auto-refusing Qwen3-Next at 4-bit; make it a recommended
    high-RAM stretch pick.** Gate the RAM wall on the *quant-adjusted* footprint, not native/FP32.

29. **Persistent GPU expert cache is NOT in mainline llama.cpp — disk tier stays experimental.** llama.cpp
    #20757 (closed, unmerged). → CONFIRMS SPEC §6; keep the disk tier behind `--experimental`, MoE-only.

30. **Speculative-decoding 3–4× holds for dense/GPU-resident only; can vanish on low-active MoE.** EAGLE-2
    (arXiv:2406.16858, 3.05–4.26×); independent RTX 3090 + Qwen3-A3B benchmark shows ~no gain.
    → gate the spec-decode suggestion on architecture (dense ✓, low-active MoE ⚠).

---

## SPEC deltas — what changes vs the locked spec

| # | SPEC location | Current claim | Verdict | Action |
|---|---|---|---|---|
| 28 | §4 RAM wall, §7, §10 | Qwen3-Next-80B needs ~320 GB → refuse | **REFUTED (verbatim)** | **P0:** native 160 GB BF16 / ~46 GB 4-bit (Unsloth); stop auto-refusing; make it a stretch *recommendation*; add a regression test |
| 26 | §4 Step 1 | async-prefetch ~80–90% hit | **REFUTED** | **P1:** correct to ~60–70% (approx., Eliseev & Mazur Fig. 2) |
| 25 | §4 Step 1 | hot-expert "beats LRU" | **REFINED** | **P1:** cite LFU (Lin/He/Chen 2025, arXiv:2511.05814); prefetch distance-1 |
| 17 | §3 KV (Apple) | q4_0 KV "raises RSS via metadata" | **REFINED** | **P1:** rationale is a Metal decode-speed hit + FA dependency, not RSS |
| 8 | §2/§9/§10 | "3-bit cliff [VERIFY: single source]" | **CONFIRMED** | **P1:** replace with Dettmers & Zettlemoyer 2022 (arXiv:2212.09720) |
| 14 | §3 KV | flat "+36% long-context latency" | **UNVERIFIED** | **P1:** source it or soften — no citation found (InnerQ was a fabrication) |
| 2,3,7 | roofline/footprint | implicit pure division, nominal bpw | **NEW** | **P1:** add tunable η≈0.7 + overhead term + real bpw (Q4_K_M≈4.5) |
| 18–23 | footprint/admission | headroom model under-specified | **NEW** | **P1:** ~1.5 GB fixed + max(10%,3 GB) VRAM; ~25–30% RAM; cite 78× cliff in `hint` |
| 27,29 | §4/§6 | DeepSeek wall; disk-tier experimental | **CONFIRMED** | keep ✓ |
| 12,13,15 | §3 KV | q8_0 lossless; 2×/3× ctx; pin 4 sinks | **CONFIRMED** | keep ✓ |

## Correction backlog for the dogfood pass (priority-ordered)

- **P0 — Qwen3-Next over-refusal (#28).** A correctness bug: the advisor refuses a model it should
  recommend. Fix the RAM-wall threshold to use the **quant-adjusted** footprint (not native/FP32); fix
  §7 targets + any catalog constant. **Regression test:** *Qwen3-Next-80B-A3B at 4-bit on a 64 GB / 8 GB
  box must NOT be refused, and SHOULD surface as a stretch recommendation.*
- **P1 — predictor fidelity (#2,3,7):** named tunable η≈0.7, additive per-call overhead term, real
  per-format bpw. Add roofline tests with measured anchors from this rig.
- **P1 — headroom model (#18–23):** encode the fixed + percentage constants; wire the 78× cliff into the
  refusal `hint`; apply the RAM-ledger refusal symmetrically.
- **P1 — MoE prefetch/placement (#25,26):** correct hit-rate to ~60–70%; re-cite LFU (Lin/He/Chen 2025).
- **P1 — quant-floor citation + reasoning gate (#8,10,11):** primary-source swap (Dettmers 2022);
  imatrix/dynamic detection gate; reasoning-vs-general workload flag.
- **P1 — q4_0 long-context "+36%" (#14):** source or soften; do not ship a precise figure without a cite.
- **P2 — Apple rationale (#17); 8-bit Qwen3-Next note (~85 GB).** Doc-level corrections.

## Sources (canonical bibliography — verified 2026-06-01)

- Yuan et al. 2024 — Roofline insights — arXiv:2402.16363
- Imai et al. 2024 (IBM) — Roofline-Driven Latency Prediction — NeurIPS MLForSystems
- Adhinarayanan & Jayasena 2026 — The qs Inequality — arXiv:2603.08960
- Dettmers & Zettlemoyer 2022 — k-bit Inference Scaling Laws — arXiv:2212.09720
- Liu et al. 2025 — ParetoQ — arXiv:2502.02631 · Li et al. 2025 — Quantization Meets Reasoning — arXiv:2505.11574
- Egiazarian et al. 2024 — AQLM — arXiv:2401.06118 · Prejzner 2026 — Bielik-Q2-Sharp (QTIP @2.4bpw) — arXiv:2603.04162
- Unsloth — Dynamic 2.0 GGUF docs; Qwen3-Next/Coder-Next docs ("runs on 46GB")
- Xiao et al. 2023 — StreamingLLM — arXiv:2309.17453 · Zhang et al. 2023 — H2O — arXiv:2306.14048
- Li et al. 2024 — SnapKV — arXiv:2404.14469 · Hooper et al. 2024 — KVQuant — arXiv:2401.18079 · Liu et al. 2024 — KIVI — arXiv:2402.02750
- llama.cpp — #5932 (KV ppl), #8918 (Metal KV), #9784 (overhead), #638 (mmap), #20757 (expert cache)
- oobabooga 2026 — GGUF VRAM formula (1516 MB + 577 MB) · vLLM — Conserving Memory + #17549 · Ollama — Memory Mgmt (DeepWiki) + #13687
- Shen et al. 2025 — Proactive Memory Scheduling (78× cliff, RTX 5080) — arXiv:2512.24637
- Fiddler 2024 — arXiv:2402.07033 · PowerInfer 2023 — arXiv:2312.12456
- Lin, He & Chen 2025 — MoE Caching/Prefetch Analysis (LFU>LRU) — arXiv:2511.05814 · Eliseev & Mazur 2023 — Fast MoE Offloading — arXiv:2312.17238
- KTransformers — DeepseekR1_V3 tutorial (382 GB/1 TB) · Qwen3-Next-80B-A3B model card
- Dao et al. — FlashAttention · SGLang FA3 — arXiv:2505.21487 · EAGLE-2 2024 — arXiv:2406.16858

---

# Study-swarm 2 (2026-06-01) — verified extensions (findings 32–50)

> Five new study-swarms for the **second** dogfood pass, grounding the questions pass 1 left open
> (predictor calibration / batch=1-MoE efficiency, q4_0 KV latency, sliding-window KV + compute buffer,
> NVMe random-access, speculative-decoding gating). **Every load-bearing citation passed a two-stage
> verification before locking here** (per `feedback_verify_load_bearing_facts.md`): a WebFetch retrieval
> oracle against the primary sources (9 papers checked) + a different-family groundedness pass
> (granite4.1:30b `run_2026-06-01T23-13-43_30f457`, mistral-small:24b `run_2026-06-01T23-14-13_c27f61`,
> reasoning-stripped). **Caught & corrected:** the InnerQ author was mis-guessed as "Wang et al." → it is
> **Tayaranian Hosseini et al.** (the retrieval oracle caught it). Specific in-body numbers flagged as
> figure-reads are labeled *(figure-read)*. The empirical MoE anchor was **re-measured** after the swarm
> flagged a possible artifact (see finding 33).

## F. MoE batch=1 decode efficiency — `roofline.ts` / `constants.ts` (study #1)

32. **MoE batch=1 decode is memory-bound on the *activated-expert* weight bytes — the inefficiency is a
    multiplier on the active-byte roofline, not a different numerator.** Oncescu et al. 2025,
    *Opportunistic Expert Activation* (arXiv:2511.02237, VERIFIED); Yu et al. 2025, *Balance Activated
    Experts* (arXiv:2512.09277) — "activation's memory traffic is <0.6% of the expert weights' memory
    traffic." → keep the roofline numerator = active-expert + attention + embedding bytes; the
    inefficiency rides on top as `efficiency`.

33. **The inefficiency has TWO components — a fixed per-token bookkeeping overhead + sub-peak bandwidth
    from fragmented (non-contiguous) expert reads — so efficiency RISES with active bytes (the overhead
    amortizes).** Cursor *warp-decode* 2026 (engineering blog) — even an optimized kernel hits only ~58%
    of peak at B=32, "random access patterns expert routing creates"; Adhinarayanan & Jayasena 2026,
    *The qs Inequality* (arXiv:2603.08960, VERIFIED) — "expert routing fragments microbatches and reduces
    weight reuse," DeepSeek-V3 quality-matched dense is **4.5× faster at 128k context**. *(R_moe ≈ B·k/E
    is figure-read.)*
    → **REPLACE the flat `MOE_DECODE_EFFICIENCY = 0.18` with an active-byte curve**
    `eff_moe(active_GB) = MOE_CEILING · active_GB / (active_GB + MOE_OVERHEAD_GB)`. Re-measured anchor on
    this rig: `qwen3.6:35b-a3b` Q4_K_M = **137–139 tok/s at ctx 2048/4096, 100% GPU, reproducible** (the
    earlier 136 was NOT a 32k-ctx artifact — it is the clean Ollama/Q4_K_M number; eff ≈ 0.167 on ~2.2 GB
    active). Literature high-active anchor: DeepSeek-R1 37B-active Q4 ≈ **0.42** effective (Groundy, M3
    Ultra ~800 GB/s). Fitting both → **MOE_CEILING ≈ 0.55, MOE_OVERHEAD_GB ≈ 5.0** (gives 0.167 at 2.2 GB,
    0.43 at 18.5 GB). *Caveat: the DeepSeek anchor is a different memory regime (server/unified DRAM, not
    5090 VRAM) — an order-of-magnitude sanity check, not a co-equal calibration point.*

34. **A flat efficiency over-penalizes large-active MoE and is also engine-specific.** Published 5090
    benchmarks reach ~197 tok/s for the A3B family under **llama.cpp + IQ4_XS** (byteshape) vs the 137 I
    measure under **Ollama + Q4_K_M** — the gap is engine + quant, so the fitted constant is a
    llama.cpp/Ollama-Q4 figure. PyTorch grouped-GEMM blog 2026 shows vLLM/Triton MoE paths are better
    optimized. → the curve is bytefit's **reference-engine** efficiency; document the engine scope.

35. **Apply the MoE penalty ONLY to VRAM-resident expert bytes.** The 0.18/curve was measured as a
    *GPU* sparse-gather penalty; for an OFFLOADED MoE (experts on CPU via `--n-cpu-moe`) the RAM-bus term
    must NOT take the GPU-under-utilization factor (re-audit `moe-eff-ram-disk-tier-extrapolation`:
    applying 0.18 to the RAM tier under-predicts ~2.7× and can wrongly drop a borderline offloaded MoE
    below the interactive filter). → in the roofline, the MoE efficiency multiplies the **VRAM** expert
    term; RAM/disk terms keep the dense/CPU efficiency.

36. **Effective efficiency also degrades with context (KV steals HBM from experts) — second-order.**
    qs Inequality (arXiv:2603.08960): the dense-vs-MoE gap grows with context. → keep the curve a
    short-context number; flag long-context degradation as a known second-order term (not yet modeled).

## G. Sliding-window KV + compute buffer — `footprint.ts` / `model-meta.ts` (study #3)

37. **Gemma 3/4 interleave 5 local sliding-window (1024) layers : 1 global layer — only the ~1/6 global
    layers cache full context.** Gemma Team 2025, *Gemma 3 Technical Report* (arXiv:2503.19786, VERIFIED:
    "increasing the ratio of local to global attention layers, and keeping the span on local attention
    short"); config.json (VERIFIED exactly): `num_hidden_layers=62, num_key_value_heads=16, head_dim=128,
    sliding_window=1024, sliding_window_pattern=6, cache_implementation="hybrid"`.
    → **KV split formula:** `KV = 2·bpe·kvHeads·headDim·[ nGlobal·ctx + nLocal·min(ctx, window) ]`, with
    layer i **global iff `(i+1) % pattern == 0`** (HF Transformers rule), `nGlobal = floor(layers/pattern)`,
    `nLocal = layers − nGlobal`. For Gemma-3-27B at 32k: naive 16.0 GiB → **3.1 GiB (5.16× less)** — the
    exact mechanism behind the false-DEGRADE this pass fixed live (gemma4 7→48+ tok/s).

38. **Gemma's own report quantifies it: global-only = ~60% KV overhead at 32k → <15% with 1:5 sliding-1024.**
    Gemma Team 2025 (arXiv:2503.19786, KV-cache section). → calibration target: a corrected Gemma KV at
    32k lands ~4–6× below naive — matches the 5.16× above.

39. **llama.cpp/CUDA reserves a compute/graph buffer driven by ubatch (and by context when flash-attn is
    OFF), plus an unaccounted CUDA-runtime reserve.** llama.cpp #9784/#9936/#10068 (maintainers: "-b 512
    -ub 512", measured 507 MiB @ub512/ctx4096, 126.75 MiB @ub128/ctx3072); DeepWiki FA (no-FA attention
    matrix is O(N²), FA tiles to O(N)). → admission term:
    `computeBuffer ≈ ubatch·hidden·C_act·bpe + (fa ? 0 : kvGroups·ubatch·ctx·bpe) + RUNTIME_RESERVE(~0.5 GiB)`,
    fail-closed (include the ctx term when FA state is unknown). *(Deferred to a follow-up — admission-side;
    sliding-window KV is the higher-value fix.)*

## H. q4_0 KV latency — SPEC §3 (study #2)

40. **The softened SPEC language is CORRECT; the old "+36%" was wrong as a constant AND in sign.** The
    real effect is a **gated context-scaling curve**: ~0% below ~8k → ~−18% @32k → ~−35% @64k → ~−37%
    @110k on the **non-fused** llama.cpp/Ollama path (NVIDIA DGX Spark forum 365138, llama.cpp build
    8399). NEUTRAL short-context FA-enabled (smcleod, the Ollama K/V-quant author: "negligible"). On
    **fused** stacks it INVERTS to a speedup beyond ~7k (vLLM FP8 blog 2026-04-22; InnerQ
    **Tayaranian Hosseini et al.** 2026, arXiv:2602.23200 — **2.7× speedup**, VERIFIED — the paper the
    pass-1 swarm had fabricated as a "+36% degradation"). q8_0 ≈ q4_0 in decode penalty (bit-width trades
    VRAM, not latency). Pathological tail: Gemma3 + quant-KV in Ollama ~5.4× slowdown (#11949).
    → the gate is **FA on AND ctk==ctv AND arch-in-FA-allowlist** (llama.cpp Discussion #22411: mismatched
    K/V "silently falls back to the slower non-fused implementation"). Keep SPEC §3 soft + range-valued;
    do not ship a single % (✓ already done this pass).

## I. NVMe random-access (experimental disk tier) — `probe.ts` / SPEC §3.1 (study #4)

41. **A MoE expert is a 33–340 MB contiguous read, not a 4K random access — so the flat ÷4 is misapplied.**
    Xue et al. 2024, *MoE-Infinity* (arXiv:2401.14361): a Mixtral expert = 340 MB. At ≥8k-block reads,
    random ≈ 0.8× sequential (zarr/FireCuda 530) — discount ≈ ÷1.2, not ÷4. → ÷4 is too *pessimistic* for
    a tuned large-block prefetch path.

42. **But llama.cpp's actual disk path is mmap demand-paging — 4K page faults at QD~1, the worst regime —
    so ÷4 is too *optimistic* there.** llama.cpp #19163/#18758 (mmap, on-demand page faults); a PCIe4
    NVMe does ~82 MB/s at 4K-QD1 vs ~7.5 GB/s sequential (Samsung 990 Pro, FPS Review) — a ÷75–90 gap, not
    ÷4. → **the discount is method-dependent**: mmap-fault floor (~÷80) vs prefetch (~÷1.2); ÷4 matches
    neither. Default the experimental disk tier to the mmap floor + a "cold-expert streaming is
    latency-bound" warning, and prefer a one-shot in-place fio probe over any static ratio. Also bound by
    the pipeline: `min(NVMe_eff, PCIe_BW, host_staging)` (DALI arXiv:2602.03495 — PCIe is up to 78% of
    expert-movement time). Real tok/s anchor: Qwen3-30B-A3B-Q6_K streams at 22–29 tok/s (llama.cpp #23324).

## J. Speculative-decoding gating — `plan.ts` spec lane (study #5)

43. **The famous "3–4×" is an EAGLE-2 *lab ceiling* on DENSE chat models at greedy decode; real batch=1
    is ~1.7–2.0×.** Li et al. 2024, *EAGLE-2* (arXiv:2406.16858, VERIFIED: 3.05–4.26×, dense-only); Liu et
    al. 2026, *Speculative Decoding: Performance or Illusion?* (arXiv:2601.11580, VERIFIED) —
    **EAGLE on Llama-3.1-8B GSM8K = 1.73× at batch=1** (→1.21× at bs=128), verification = 42–95% of
    runtime, acceptance 2–4 tokens. → bytefit predicts **~1.7–2.5× for dense**, labels 3–4× as a ceiling,
    decays with concurrency.

44. **Low-active MoE erodes/reverses the speedup: each draft token routes to a different expert subset, so
    verifying K drafts activates far more experts than one token.** Saxena et al. 2025, *Utility-Driven
    Spec-Decode for MoE* (arXiv:2506.20675, VERIFIED VERBATIM: "increasing data movement and verification
    time by 2-3×", "slowdowns up to 1.5×", cascade "7-14% over static K"); McDanel et al. 2026, *MoE-Spec*
    (arXiv:2602.16052) — a 127-token tree activates 54/64 OLMoE experts. Real proof: sglang#14824 (EAGLE-3
    *degrades* on Qwen3-30B-A3B), sglang#5274 (EAGLE-3 217→164 tok/s under concurrency).
    → **HARD GATE: do NOT auto-suggest naive EAGLE/Medusa for low-active MoE** (active fraction <~15%, e.g.
    A3B/A22B); default lane NONE or self-speculative.

45. **The roofline explains the gate: spec-decode pays off only where decode is memory-bound; low-active
    MoE partially escapes memory-boundedness (few active params).** Yuan et al. 2024 (arXiv:2402.16363) —
    batch=1 decode is memory-bound. → bytefit's instinct (suggest in the bandwidth-bound offload/disk tier)
    is correct **for dense**; for offload/no-EAGLE-head, prefer **self-speculative / LayerSkip** (Elhoushi
    et al. 2024, arXiv:2404.16710, VERIFIED — up to 2.16×, no second model to load).

### Study-swarm 2 verification receipt

- **Retrieval oracle (WebFetch vs primary sources):** confirmed existence + attribution + core claim for
  arXiv 2511.02237, 2512.09277, 2603.08960, 2602.23200, 2503.19786, 2601.11580, 2506.20675, 2406.16858,
  and the gemma-3-27b config.json. **Caught:** InnerQ author Wang → **Tayaranian Hosseini** (corrected).
  *(figure-read)* labels applied to in-body numbers not in abstracts (R_moe formula, the latency decomposition).
- **Different-family groundedness (reasoning-stripped):** granite4.1:30b `run_2026-06-01T23-13-43_30f457`
  rated all 7 well-known attributions (EAGLE-2/LayerSkip/Medusa/MoE-Infinity/roofline/Dettmers/StreamingLLM)
  CORRECT and both load-bearing mechanisms PLAUSIBLE; mistral-small:24b `run_2026-06-01T23-14-13_c27f61`
  confirmed the pre-cutoff subset + mechanisms (recent papers UNKNOWN, as expected — retrieval-verified).
  **No misattribution among the canon, no contradiction.**
- **Empirical re-measurement:** the MoE anchor (137–139 tok/s) was re-measured at ctx 2048/4096 100% GPU
  after study #1 flagged a possible artifact; the 136 stands as the clean Ollama/Q4_K_M number.

### Study-swarm 2 sources (verified 2026-06-01)

- Oncescu et al. 2025 — Opportunistic Expert Activation — arXiv:2511.02237 · Yu et al. 2025 — Balance Activated Experts — arXiv:2512.09277
- Adhinarayanan & Jayasena 2026 — The qs Inequality — arXiv:2603.08960 · Cursor 2026 — warp-decode (cursor.com/blog/warp-decode)
- Gemma Team 2025 — Gemma 3 Technical Report — arXiv:2503.19786 · google/gemma-3-27b-it config.json
- NVIDIA DGX Spark KV-quant benchmark — forums.developer.nvidia.com/t/365138 · vLLM 2026 — FP8 KV-cache blog · smcleod 2024 — Ollama K/V quant · llama.cpp #22411 (fused-FA K/V match)
- Tayaranian Hosseini et al. 2026 — InnerQ — arXiv:2602.23200 *(speedup, not degradation; corrected from pass-1 fabrication)*
- Xue et al. 2024 — MoE-Infinity — arXiv:2401.14361 · FPS Review — Samsung 990 Pro · zarr-benchmark #26 · llama.cpp #19163/#23324 · DALI 2026 — arXiv:2602.03495
- Li et al. 2024 — EAGLE-2 — arXiv:2406.16858 · Liu et al. 2026 — Spec-Decode: Performance or Illusion? — arXiv:2601.11580
- Saxena et al. 2025 — Utility-Driven Spec-Decode for MoE — arXiv:2506.20675 · McDanel et al. 2026 — MoE-Spec — arXiv:2602.16052 · Elhoushi et al. 2024 — LayerSkip — arXiv:2404.16710
- llama.cpp #9784/#9936/#10068 (compute buffer) · sglang#5274/#14824 (EAGLE-3 MoE degradation)
