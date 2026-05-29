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

### Notes
- Pre-release (v0.0.0). Pure core landed; the I/O shell (hardware probe, GGUF/Ollama catalog,
  runtime-arg emitter) and CLI land next.
- Disk-backed MoE expert streaming is scoped as experimental R&D, not a shipping feature.
