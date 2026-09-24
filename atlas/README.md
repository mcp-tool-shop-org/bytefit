# bytefit: how it works

Mapped at 2026-09-24 from commit 1941e05.

## What this is

6 parts, mostly TypeScript (49 files). Work enters through 5 doors; the busiest is @mcptoolshop/bytefit, which reaches 1 part. It publishes to npm. People run bytefit. People import @mcptoolshop/bytefit.

## What changed since the last map

This is the first map.

## What comes in

1. **@mcptoolshop/bytefit** (the package people import). Loads src/index.ts.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **ci.** On a pull request touching 9 paths; on a push touching 9 paths; or by hand. Checks src/.
4. **Release.** When a tag matching `v*` is pushed. Checks src/.
5. **bytefit** (a command people run). Runs src/cli.ts.

## What happens through @mcptoolshop/bytefit

1. The package loads src/index.ts in src.

## Who reads the results

@mcptoolshop/bytefit writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**ci** checks src/.

**Release** checks src/, publishes to npm, and creates a GitHub release.

**bytefit** (a command people run) runs src/cli.ts.

## What breaks what

- **src** is imported by no other part and sits on the path of 4 doors.

## What tends to change together

- **src/catalog/to-model-meta.ts** and **src/tests/gqa.test.ts** changed together in 5 of 6 commits, inside the src part.
- **src/catalog/to-model-meta.ts** and **src/gguf/model-meta.ts** changed together in 5 of 8 commits, inside the src part.
- **src/plan.ts** and **src/types.ts** changed together in 7 of 13 commits, inside the src part.
- **src/constants.ts** and **src/index.ts** changed together in 6 of 12 commits, inside the src part.
- **src/index.ts** and **src/roofline.ts** changed together in 5 of 10 commits, inside the src part.

Confidence is low: fewer than 20 source files reach 10 revisions in the window.

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

src/index.ts

Read those in order to follow one import of @mcptoolshop/bytefit end to end.

## What this map cannot see

- 1 write and 6 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 2 commands are built at run time and not followed, 1 of them in tests.
- Statistics confidence is low: fewer than 20 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
