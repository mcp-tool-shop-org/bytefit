# bytefit: how it works

Mapped at 2026-09-30 from commit 41121c5 by Atlas 1.24.0.

## What this is

6 parts, mostly TypeScript (49 files), CSS (2), Astro (1), JavaScript (1) and PowerShell (1). Work enters through 5 doors; ci, Deploy site to GitHub Pages, Release, @mcptoolshop/bytefit and bytefit each reach 1 part, and ci is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run bytefit. People import @mcptoolshop/bytefit.

## What changed since 2026-09-24 (1941e05)

- ci's pull request trigger now also names `codecov.yml`.
- ci's push trigger now also names `codecov.yml`.
- ci now also runs src/tests/catalog.test.ts, src/tests/cli.test.ts, src/tests/docs-drift.test.ts and 13 more.
- And 1 more change to a door.
- 1 file added and 88 changed content, across 5 parts.

## What comes in

1. **ci.** On a pull request touching 10 paths; on a push touching 10 paths; or by hand. Runs src/tests/catalog.test.ts, src/tests/cli.test.ts, src/tests/docs-drift.test.ts and 13 more; builds src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Release.** When a tag matching `v*` is pushed. Runs src/tests/catalog.test.ts, src/tests/cli.test.ts, src/tests/docs-drift.test.ts and 13 more; builds src/.
4. **@mcptoolshop/bytefit** (the package people import). Loads src/index.ts.
5. **bytefit** (a command people run). Runs src/cli.ts.

## What happens through ci

1. The workflow runs 16 files in src; it builds src/ in src.
2. It uploads coverage to Codecov.

## Who reads the results

ci writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release** runs src/tests/catalog.test.ts, src/tests/cli.test.ts, src/tests/docs-drift.test.ts and 13 more, builds src/, publishes to npm, and creates a GitHub release.

**@mcptoolshop/bytefit** (the package people import) loads src/index.ts.

**bytefit** (a command people run) runs src/cli.ts.

## What breaks what

- **src** is imported by no other part and sits on the path of 4 doors.

## What tends to change together

- **src/catalog/to-model-meta.ts** and **src/tests/gqa.test.ts** changed together in 5 of 6 commits, inside the src part.
- **src/catalog/to-model-meta.ts** and **src/gguf/model-meta.ts** changed together in 5 of 8 commits, inside the src part.
- **src/plan.ts** and **src/types.ts** changed together in 7 of 13 commits, inside the src part.
- **src/constants.ts** and **src/index.ts** changed together in 6 of 12 commits, inside the src part.
- **src/index.ts** and **src/roofline.ts** changed together in 5 of 10 commits, inside the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 2 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, assets/, docs/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/index.ts → src/constants.ts → src/types.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 reads go to a path their caller passes, not to this repository.
- 1 write and 1 read go to a temporary directory or a path their caller passes, not to this repository.
- 1 read goes to the home directory (.ollama/) or a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
