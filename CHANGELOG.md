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

### Notes
- Pre-release (v0.0.0). Pure core + GGUF reader landed; the hardware probe, catalog, and
  runtime-arg emitter (the rest of the I/O shell) and the CLI land next.
- Disk-backed MoE expert streaming is scoped as experimental R&D, not a shipping feature.
