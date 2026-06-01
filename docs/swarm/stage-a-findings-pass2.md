# bytefit dogfood swarm 2 — Stage A findings (manifest)

> Wave: Stage A (bug/security/correctness/drift), branch `dogfood-swarm-2` off `main` (c25896d).
> Baseline: node, build clean, **72/72 tests pass**. 5-agent domain audit (`wf_26cca9ce-757`, 888k tok)
> + a live-validated **predictor calibration** on this rig (RTX 5090, 7 Ollama models measured).
> Exit Stage A at **0 CRITICAL + 0 HIGH**. Counts: 5 CRITICAL · ~12 HIGH · 20 MEDIUM · 4 LOW (post-dedup).

## CRITICAL (confidently-wrong advice — the product's defining failure mode)

- **C1 — MoE batch=1 tok/s over-predicted ~3.6× (CAL-1, live-measured).** `qwen3.6:35b-a3b`: predicted
  490 (ctx512) / 247 (ctx8192) tok/s, **measured 136**. Dense η applied to sparse expert-gather; implied
  η_moe≈0.17 (4× below dense). `roofline.ts`/`footprint.ts`/`constants.ts`. **Interim conservative fix now
  + regression test pinned to the measured band; magnitude refined by study #1 (batch=1-MoE efficiency).**
- **C2 — `recommend` ranks a risky sub-4-bit BIG model over a safe higher-bit small one (cm-01).** Q2_K
  30B-A3B (10.968) ranks above Q5_K_M 14B (10.784) — the exact inversion research #9 (Dettmers 2022)
  forbids. `scoreLoadout` (`plan.ts:217`) has no sub-4-bit/`lowBitRisk` penalty; `log10(params)` dominates.
- **C3 — NVMe "measured" bandwidth reads the page cache, not the disk (pc-01).** `probeNvme` writes 64 MiB
  then reads the same file back (still cached) → ~10× too fast, labeled `confidence:"measured"`, feeds the
  experimental disk-tier admission. `probe.ts:142`. Cap + drop to `estimated` + defeat cache. (study #2 refines
  the random-access model.)
- **C4 — MoE offload emits a PARTIAL `-ngl` → command runs attention on CPU, contradicting the roofline (ce-01).**
  e.g. Qwen3-Next-80B → `-ngl 14 --n-cpu-moe 35`; canonical recipe is `-ngl 99 + --n-cpu-moe N` (only experts
  leave GPU). Predicted tok/s assumes attention-on-VRAM; emitted command does the opposite. `emit/emit.ts:20`.
- **C5 — `--ctx 0` drops the `-c` flag → silent paging certification (ce-02).** Truthiness gate omits `-c`/`num_ctx`
  at ctx 0; runtime falls back to the model's full trained context whose KV was never admitted. `emit/emit.ts:16`,
  `:46`. Clustered with the ctx-validation HIGH below.

## HIGH (wrong in a common case / missing load-bearing guard)

- **H1 — KV over-estimated for GQA-absent + sliding-window archs → false DEGRADED (CAL-2, live-measured).**
  `gemma4:31b`: predicted DEGRADED 7 tok/s [vram+ram] @ ctx8192; **measured 62 tok/s, 100% GPU, 32k ctx**.
  no-GQA bound (kvHeads=32) ×2 + no notion of Gemma's sliding-window (most layers cap KV at ~1024). bytefit
  KV(32k)≈60 GiB vs real ≈7 GiB (~8.5×). `footprint.ts kvBytesPerToken`, `gguf/model-meta.ts`, `types.ts`.
  GQA-family default now; sliding-window grounded by study #3.
- **H2 — contextLength unvalidated end-to-end (cm-03 + ce-03).** `--ctx abc`→NaN→false refusal; `--ctx -5`→
  inflated budget→false "fits"; `--ctx 0`→see C5. `plan.ts:37` (pure core) + `cli.ts:46`. Validate → `INVALID_CONTEXT`
  refusal in core + exit 2 in CLI.
- **H3 — `BITS_PER_WEIGHT` 3-bit/2-bit family wrong (cm-02).** `Q3_K_L:4.27` makes a 3-bit quant classify "safe"
  (no cliff advisory); table non-monotonic vs quality rank; Q2_K/Q3_K inflated 15-29% → false refusals on the
  estimated path. `constants.ts:21`. Fix bpw (Q3_K_L≈3.5, Q3_K_M≈3.4, Q3_K_S≈3.1, Q2_K≈2.6...) + fix the test
  that codifies the wrong value (`quant-risk.test.ts:9`).
- **H4 — GGUF nested-array unbounded recursion → uncaught RangeError (gguf-nested-array).** ~2.3 MiB crafted file
  (under the read caps) crashes the dir/local scan with a raw stack overflow, violating the gguf-safety contract.
  `gguf/parse.ts:68`. Depth cap → `GgufError`.
- **H5 — GGUF tensor `dims` read raw u64, unbounded → poisoned totalParams (gguf-tensor-dims).** Overflows 2^53 →
  non-safe-integer param count flows into the admission verdict. `gguf/parse.ts:108` + `params.ts:33`. Bound +
  safe-integer guard (drop tensor path → fall back).
- **H6 — unknown/AMD GPU bandwidth fallback 360 GB/s is NOT a floor → over-prediction (pc-02).** Above 7/21 table
  cards; AMD flat 360. `gpu-tables.ts:65`, `probe.ts:91`. Make it genuinely conservative (≤ min table) or widen
  to a range when confidence=unknown.
- **H7 — `--hf` Range-ignored → OOM (pc-04).** Server may answer 200 with the full multi-GB body; `arrayBuffer()`
  buffers it all. `catalog/hf.ts:42`. Reject non-206 / bound body.
- **H8 — `parseArgs` boolean flag eats the next positional (ce-04).** `plan --json <model>` swallows the model id
  → exit 2 + JSON silently off; same for `--experimental`. `cli.ts:28`. Known-boolean-flag set.
- **H9 — SPEC.md still ships 5 claims research-grounding.md REFUTED/REFINED (cm-06, gguf-spec-*, pc-03, drift-*).**
  prefetch "~80–90%"→60–70%; "[VERIFY: Kurt 2026]"→Dettmers 2022; q4_0 "+36%"→soften (UNVERIFIED); Apple "raises
  RSS"→Metal speed hit; §7/§10 stale [VERIFY]. Apply the research-grounding SPEC-deltas to SPEC.md + README.
- **H10 — no cli.test.ts; emit tests miss the -ngl/-ot content (ce-07).** The whole CLI contract is untested. Add.
- **H11 — no publish workflow; CHANGELOG says "released" but no tag (ci-no-publish-workflow).** Release-phase item;
  reconcile during release prep (publish.yml via OIDC + tag, OR soften CHANGELOG wording). Tension with the 2-workflow
  rule (ci.yml + pages.yml already = 2) — surface to user at release.

## MEDIUM (robustness / refinements — fixed opportunistically while in-file)

- M1 KV_BYTES_PER_ELEM undercount q8_0 1.0→1.0625, q4_0 0.5→0.5625 (cm-04, under-refuse direction).
- M2 Q2_K ranked above IQ2_M — legacy preferred over imatrix (cm-07). Prefer imatrix/dynamic among sub-4-bit ties.
- M3 MoE proportional active-split lumps attention into VRAM share → optimistic offload (cm-05; folds into C1 fix).
- M4 asNumber drops stringified parameter_count from /api/show (gguf-asnumber).
- M5 value_length never read → V-cache head_dim assumed = key_length (gguf-value-length; MLA archs).
- M6 u8/bool array memory amplification ~1B→8B ×60M (gguf-array-amplification). Per-subtype width bound.
- M7 nvidia-smi `[N/A]` free row silently dropped → wrong GPU picked (pc-05). Keep row w/ conservative free + note.
- M8 Ollama daemon-down → silent `[]`, indistinguishable from no-models (pc-06). Distinguish + hint.
- M9 HF smallest-file quant detection (first-match) + truncated-shard suppresses whole repo (pc-07).
- M10 `-ot` regex unescaped dots + no `.weight` anchor (ce-05). Mirror `EXPERT_TENSOR_RE`.
- M11 LM Studio emit missing disk-tier "can't stream" warning (ce-06); `--gpu` ratio ignores KV.
- M12 SPEC §10 verify-table contradiction; §7 [VERIFY] sizes (drift dups of H9).
- M13 docs-drift has zero test guard (tests-no-doc-drift-guard). Add `docs-drift.test`.
- M14 test gaps: ctx-validation, crushed-big-model, BITS_PER_WEIGHT monotonicity, malformed-GGUF depth/overflow,
  probe error branches (cm-08, gguf-tests, pc-08).

## LOW

- L1 top-level catch dumps raw stack/paths (ce-08) — redact behind BYTEFIT_DEBUG.
- L2 README "tested on 5090" vs 78× cliff "measured on 5080" provenance (drift-readme-tested-rig).
- L3 §7/§10 stale size [VERIFY] markers (drift dup).

## Positive (ship as confidence)

- **CAL-3 — dense η=0.70, overhead=0 empirically confirmed on the 5090** (mean implied η 0.695; fit 0.68).
  No change; anchor + ±20-25% per-arch band note into `research-grounding.md` + `constants.ts` comment.

## Fix order (build+test+live-validate after each group; commit+push per group)

1. **ctx-validation cluster** (H2/C5): plan.ts + cli.ts + emit.ts + tests.
2. **quant/scoring cluster** (C2/H3/M1/M2): constants.ts bpw + scoreLoadout penalty + ranking + tests.
3. **MoE cluster** (C4/C1/M3): emit -ngl fix + interim MoE efficiency + placement split + tests.
4. **probe cluster** (C3/H6/M7/M8): NVMe cache + GPU floor + smi N/A + ollama hint + tests.
5. **gguf cluster** (H4/H5/M4/M5/M6): depth cap + dim bound + asNumber + value_length + array width + tests.
6. **hf/cli cluster** (H7/H8/M9/L1): hf body bound + parseArgs bool + quant detect + redact + cli.test.ts.
7. **KV/GQA** (H1): GQA-family default now; sliding-window after study #3.
8. **docs drift** (H9/M12/M13/L2): SPEC + README deltas + docs-drift.test guard.

## Study-gated (interim fix now, grounded magnitude after study-swarm + verification)

- C1 MoE efficiency constant ← study #1 (batch=1-MoE / sparse-gather efficiency).
- H1 sliding-window KV model ← study #3 (KV + compute-buffer context-scaling).
- C3 NVMe random-access model ← study #2.
