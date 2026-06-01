# Ship Gate

> No repo is "done" until every applicable line is checked.
> Status per release. bytefit is an npm CLI (tags: `[all]` `[npm]` `[cli]`).

**Tags:** `[all]` every repo · `[npm]` published artifacts · `[cli]` CLI tools

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report path, supported versions, threat model) (2026-06-01)
- [x] `[all]` README includes threat model paragraph (data touched / not touched / permissions) (2026-06-01)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-06-01)
- [x] `[all]` No telemetry by default — stated explicitly (2026-06-01)

### Default safety posture

- [x] `[cli]` Dangerous actions gated — bytefit is a read-only advisor; the experimental disk tier is behind `--experimental` (2026-06-01)
- [x] `[cli]` File operations constrained — only a tmpdir scratch file for the NVMe benchmark, removed after use (2026-06-01)
- [ ] `[mcp]` SKIP: not an MCP server (the `mcp` keyword is for registry discoverability only)

## B. Error Handling

- [x] `[all]` Structured Error Shape — `Refusal { code, message, hint }`; GGUF parse errors are typed, never raw (2026-06-01)
- [x] `[cli]` Exit codes: 0 ok · 1 not found / refused · 2 usage (verified live) (2026-06-01)
- [x] `[cli]` No raw stack traces on normal paths — refusals and parse failures return structured reasons (2026-06-01)
- [ ] `[mcp]` SKIP: not an MCP server

## C. Operator Docs

- [x] `[all]` README current: what it does, install, usage, platforms, Node ≥ 20 (2026-06-01)
- [x] `[all]` CHANGELOG.md in Keep a Changelog format (2026-06-01)
- [x] `[all]` LICENSE present (MIT) and support status stated (2026-06-01)
- [x] `[cli]` `--help` accurate for all commands and flags (verified live) (2026-06-01)
- [x] `[cli]` Output modes defined — default human / `--json` structured; no secret material handled (2026-06-01)
- [ ] `[complex]` SKIP: stateless single-shot CLI — no daily-ops / recovery surface

## D. Shipping Hygiene

- [x] `[all]` `verify` script (tsc build + node:test in one command) (2026-06-01)
- [ ] `[all]` Version in manifest matches git tag — PENDING: manifest is 1.0.0; the `v1.0.0` tag is created at the release step
- [ ] `[all]` SKIP: dependency scanning — zero production dependencies; 3 pinned devDeps only
- [ ] `[all]` SKIP: automated dependency updates — org policy (no Dependabot unless requested); zero prod deps
- [x] `[npm]` `npm pack --dry-run` includes dist/, README.md, CHANGELOG.md, LICENSE (files field) (2026-06-01)
- [x] `[npm]` `engines.node` set (>= 20) (2026-06-01)
- [x] `[npm]` Lockfile committed (2026-06-01)

## E. Identity (soft gate — does not block ship)

- [ ] `[all]` Logo in README header — PENDING (treatment)
- [ ] `[all]` Translations (polyglot-mcp, 8 languages) — PENDING (release phase, local model)
- [ ] `[org]` Landing page (@mcptoolshop/site-theme) — PENDING (release phase)
- [ ] `[all]` GitHub repo metadata: description, homepage, topics — PENDING (release phase)

---

## Gate Rules

**Hard gate (A–D):** Must pass before any version is tagged or published. Non-applicable lines are
marked `SKIP:` with justification. The only open A–D line is the git-tag match, created at release.

**Soft gate (E):** Identity polish — the release phase. Product ships without it but isn't "whole".
