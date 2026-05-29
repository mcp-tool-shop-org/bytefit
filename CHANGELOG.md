# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project will adopt
[SemVer](https://semver.org/) from its first published release.

## [Unreleased]

### Added
- Initial scaffold: package manifest, TypeScript ESM config, MIT license, security policy.
- `SPEC.md` — locked architecture for the hardware-aware loadout planner, grounded in a
  study-swarm (technique ceiling) and a primary-source verification pass (production floor
  and competitive landscape).
- Pure planning core (zero runtime deps): quant selection (fast-lane-first, Q4_K_M reasoning
  floor, dynamic-GGUF tiebreak), footprint + KV-cache math, a blended memory-bandwidth roofline
  tok/s predictor, tier placement with an anti-paging admission guard (refuse-don't-page), and
  `plan()` + `recommend()`. 23 unit tests.
- GGUF reader (zero-dep, first I/O-shell module): binary header + full KV-metadata parser (all
  value types incl. arrays), `file_type` -> quant and architecture-field mapping to ModelMeta,
  grow-on-demand local-file reader. 6 tests.
- Hardware probe (zero-dep, cross-platform): nvidia-smi / AMD sysfs / Apple unified-memory VRAM
  with a 0.90 free-VRAM backoff + a GPU-name -> bandwidth table; platform-correct usable free RAM
  (Linux MemAvailable, macOS free+inactive, Windows ullAvailPhys); RAM bandwidth from DDR MT/s x
  channels; optional measured NVMe read. Validated live on an RTX 5090. 7 tests.
- Model catalog (zero-dep): Ollama enumeration (/api/tags + raw blob-GGUF parse for exact params
  and expert counts; /api/show fallback) + local-dir .gguf scan + a shared GGUF -> ModelMeta builder.
  Extended the GGUF reader to parse tensor-info -> exact total + MoE activated params. 5 tests;
  validated live (9 Ollama models ranked on an RTX 5090, incl. a 36B MoE detected at 4.0B active).
- Runtime-arg emitter (zero-dep): a Loadout -> ready-to-run args. llama.cpp full fidelity (-ngl,
  -ot expert pin only in a genuine-offload regime, --fit off, --mlock, -ctk/-ctv, -fa, spec-decode
  hint); Ollama (num_ctx/num_gpu + OLLAMA_* env) and LM Studio (--gpu ratio) with capability
  warnings for what they can't express. 5 tests.
- CLI `bytefit`: `probe`, `recommend`, `plan <model>` (--backend / --ctx / --use-case /
  --experimental / --json). Validated live on an RTX 5090 — ranked 9 Ollama models and emitted
  runnable llama.cpp / Ollama commands.

### Changed
- Core VRAM headroom default 512 MiB -> 1536 MiB (grounded in the oobabooga GGUF-VRAM-formula
  intercept ~1517 MiB), plus a 0.90 free-VRAM backoff applied by the probe. (Per the io-shell swarm.)

### Notes
- Pre-release (v0.0.0). Pure core + the full I/O shell (GGUF reader, probe, catalog, emitter) +
  the `bytefit` CLI landed — runnable end-to-end. Next: fractional MoE expert offload
  (`--n-cpu-moe`), HF-remote catalog, then shipcheck + the full treatment (v1.0.0).
- Disk-backed MoE expert streaming is scoped as experimental R&D, not a shipping feature.
