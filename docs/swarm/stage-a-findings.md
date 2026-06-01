# bytefit dogfood swarm — Stage A health findings (manifest)

> Wave: Stage A (bug/security). Branch `dogfood-swarm`, save-point tag `pre-dogfood-swarm`.
> Baseline: node v22.22.3, build clean, 46/46 tests pass. 5-agent domain-owned audit + a live
> run on this rig (RTX 5090 / 31.8 GiB VRAM / 63.4 GiB RAM). Exit Stage A at **0 CRITICAL + 0 HIGH**.

## CRITICAL

- **C1 — `roofline.ts:19–34` — predictor has no effective-bandwidth factor (η). ✅ FIXED + validated.**
  Was dividing active bytes by *raw rated* bandwidth → predicted tok/s ~20–40% optimistic. Added a
  named tunable `BANDWIDTH_EFFICIENCY = 0.7` (overridable per call) + non-positive-bandwidth guard
  (also closes M4). Live: 24B ≈ 84 tok/s on the 5090 (was ~120). 48→51 tests. (research-grounding #2,3)
- **C2 — `gguf/model-meta.ts` — `kvHeads = head_count_kv ?? head_count` defeats GQA. ✅ FIXED + validated.**
  CONFIRMED on real hardware: `gemma4:31b` omits `head_count_kv` (head_count=32) → bytefit assumed
  kvHeads=32 → **KV 15.0 GiB @ 8k** (the kickoff's mystery number), forcing DEGRADED ~5 tok/s offload.
  Fix keeps the conservative (paging-safe) number but flags `kvHeadsAssumed` and emits an honest
  "KV is an upper bound — no-GQA assumed" reasoning line. 3 new regression tests (`gqa.test.ts`).
- **C3 (LIVE) — "0 models on a loaded rig" → NOT REPRODUCIBLE (daemon-warmup transient).** Re-ran
  `recommend` twice → **10 models, 10 runnable** every time; `catalogFromOllama()` returns all 10,
  each ACCEPTED with correct parsing. The one-time "0 models" was an Ollama daemon warmup race on the
  very first call. **Downgraded to a Stage-B/C robustness item:** `catalogFromOllama` returns `[]`
  silently if the daemon isn't ready — should add a one-shot retry and a "is Ollama running?" hint.
  Not a code bug; honest correction.

## HIGH

- **H1 — `roofline.ts:21–34` — no additive per-call overhead term** (Imai 2024: overhead cuts MSE up
  to 80%); wire an optional term (default 0, no fabricated constant) so it's calibratable. (#3)
- **H2 — `quant.ts` — no imatrix/Dynamic-GGUF gate for sub-4-bit.** `selectQuant` returns IQ2/Q2/Q3
  with no safety gate; research #11: legacy sub-4-bit without imatrix is unsafe. Gate it. (#11)
- **H3 — `gguf/model-meta.ts:70–71` — headDim fallback `embedding/head_count` wrong for decoupled-head
  archs** (Gemma head_dim=256). Prefer `key_length`; treat as unknown if absent rather than guess.
- **H4 — `gguf/parse.ts:52–56` — ARRAY `count` (u64) loops with no upper bound** → OOM on a crafted
  file within the 64 MiB read window (security/DoS). Bound count/len vs remaining buffer before alloc.
- **H5 — `probe.ts:36–50` — multi-GPU silently dropped** (`[0]` only). iGPU+dGPU / dual-GPU plans
  against the wrong device. Aggregate or pick max-VRAM + emit a note.
- **H6 — `probe.ts` (0.90) × `placement.ts:45` (−1536 MiB) — double VRAM backoff** over-refuses small
  cards; VRAM/RAM ledgers asymmetric (RAM has no 0.90). Decide the intended combined model + document + test.
- **H7 — `probe.test.ts` — zero coverage of degradation paths** (absent tool, multi-GPU, AMD, backoff
  math, NVMe). Load-bearing failure modes untested.
- **H8 — `cli.ts:58–125` — no `--help`/`-h`** (`bytefit --help` silently runs `recommend`). Ship Gate C.
- **H9 — `emit.ts:28` — `-ot` regex unescaped dots + omits `\.weight`; all-or-nothing**, no fractional
  `--n-cpu-moe N` (SPEC §5 + CHANGELOG roadmap). Escape + emit fractional offload.
- **H10 — no `.github/` / no CI at all.** Nothing typechecks/tests on PR. Ship Gate D. Add paths-gated
  `ci.yml` + `release:published` publish.
- **H11 — `package.json` v0.0.0** → must reach v1.0.0 before publish (Phase 10 treatment).

## MEDIUM

- M1 `quant.ts` — reasoning-vs-general floor not explicit (#10).
- M2 `constants.ts:65–66` — headroom missing 577 MB buffer + `max(10%,3 GB)` consensus (#18–20).
- M3 `types.ts:87` vs `constants.ts:65` — doc/code drift (comment "512 MiB" vs actual 1536 MiB).
- M4 `roofline.ts:14–35` — no input validation; silent NaN/Infinity on bad bandwidth.
- M5 `footprint.ts:20–23` — MoE bytes/token omits shared+attn (or document the `activatedParams` assumption) (#4).
- M6 `placement.ts:45–46` — RAM headroom flat 2 GB vs `max(25%, …)`; over-admits RAM ~14 GB on a 64 GB box (#23).
- M7 `placement.ts:53–57,130–140` — refusal `hint` doesn't cite the 78× paging cliff (#22).
- M8 `gguf/parse.ts:25–26` — u64→Number precision loss >2^53 for length/count fields.
- M9 `gpu-tables.ts:65,72` — unknown-GPU/AMD fall back to a hard 360/100/360 GB/s; verify roofline
  widens/flags when `bandwidthConfidence==="unknown"` instead of emitting a confident number (#2).
- M10 `probe.ts:134–161` — NVMe measure is a 64 MiB *sequential* read; overstates random-expert access
  (SPEC §3.1 says 3–6× below sequential). Apply a documented discount or random offsets.
- M11 `cli.ts:101` — prefix model-match returns arbitrary first hit (non-deterministic; SPEC §8). Refuse ambiguity.
- M12 `catalog/ollama.ts` — serial 8 s × N per-model fetches; parallelize.

## LOW

- L1 `constants.ts:52` q8_0 KV 1.0 nominal (slight under-count). L2 `to-model-meta.ts:19` `totalParams ?? 0`
  → 0-byte model "fits" / `log10(0)=-Infinity` in scoring. L3 `plan.ts` negative budget (benign).
  L4 `gguf` headCount=0 → Infinity (luck-guarded). L5 `catalog/local.ts:15` non-recursive/symlink (document).
  L6 `emit.ts:33` emits KV flags even for f16 default. L7 `SPEC.md:80–82` stale Qwen3-Next 320 GB (P0 doc).
  L8 `CHANGELOG.md` no dated release entry.

## P0 (research-grounded) — Qwen3-Next over-refusal: SPEC + TEST, not code

The placement audit confirmed **the code already admits on quant-adjusted `buildWeightBytes`** (no
FP32/native wall, no hard-coded model list); a Qwen3-Next-80B-A3B Q4 (~46 GB) on a 64 GB box is admitted
as `vram+ram` degraded, **not refused**. The "320 GB refuse" lives only in **SPEC.md prose (§4/§6/§7/§10)**
+ a **test gap** (no 80B-A3B fixture, no must-not-refuse regression). Fix = correct the SPEC + add the
regression test that locks the correct behavior.

## Remediation order (this wave)

1. **C3 catalog "0 models"** (headline failure) → 2. **C1 η predictor** → 3. **C2/H3/H4 GGUF GQA + safety**
→ 4. **H6/M2/M6/M7 headroom + refusal hint** → 5. **H2/M1 quant safety gate** → 6. **P0 SPEC + regression test**
→ 7. **H5/H7 probe multi-GPU + tests** → 8. **H8/H9/M11 CLI + emit** → 9. **H10 CI**. Build + tests green
after every step; live-validate on this rig (the 10 Ollama models incl. `gemma4:31b` for the GQA fix).
Counts: 3 CRITICAL · 11 HIGH · 12 MEDIUM · 8 LOW.
