import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The CLI is the user-facing contract: exit codes (0 ok / 1 not-found-or-refused / 2 usage) and arg
// parsing were entirely untested. Spawn the built CLI so the real entry path is exercised end-to-end.
const CLI = fileURLToPath(new URL("../cli.js", import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", timeout: 30_000 });

test("--help / -h / help all exit 0 and print usage", () => {
  for (const arg of ["--help", "-h", "help"]) {
    const r = run(arg);
    assert.equal(r.status, 0, `${arg} should exit 0`);
    assert.match(r.stdout, /hardware-aware local-LLM loadout planner/, `${arg} prints usage`);
  }
});

test("plan with no model id is a usage error (exit 2)", () => {
  assert.equal(run("plan").status, 2);
});

test("an unknown command exits 2 with a message", () => {
  const r = run("frobnicate");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown command/);
});

test("an unknown backend exits 2 before probing", () => {
  const r = run("plan", "some-model", "--backend", "nonsense");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown backend/);
});

test("a bad --ctx is rejected at the boundary (exit 2), never fed to the planner", () => {
  for (const ctx of ["abc", "-5", "0", "1e999"]) {
    assert.equal(run("plan", "m", "--ctx", ctx).status, 2, `--ctx ${ctx} should exit 2`);
  }
});

test("a boolean flag before the model id does not swallow it (exit != 2 usage error)", () => {
  // If --json swallowed the id, plan would have no positional and exit 2 'usage'. A bogus id instead
  // reaches resolution and exits 1 (not found) — proving the id was parsed, not eaten by the flag.
  const r = run("plan", "--json", "definitely-not-a-real-model-zzz");
  assert.notEqual(r.status, 2, "the model id must be parsed, not consumed by --json");
});
