import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The product's worst failure mode is confidently-wrong NUMBERS reaching the user — and the spec/readme
// are how they reach the user. These strings were REFUTED or RESOLVED by docs/research-grounding.md's
// verification pass; a cheap, deterministic guard so none can silently reappear in the contract docs.
// (research-grounding.md and docs/swarm/* legitimately DISCUSS the refuted claims, so they are excluded.)
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT_DOCS = ["SPEC.md", "README.md"];
const REFUTED = [
  "[VERIFY", // a stale verification marker
  "Kurt 2026", // the placeholder citation, superseded by Dettmers & Zettlemoyer 2022
  "80–90%", // refuted MoE prefetch hit rate (real ~60–70%)
  "80-90%",
  "+36%", // unverified q4_0 long-context latency figure (InnerQ was a fabrication)
  "total RSS", // wrong Apple-Silicon rationale (it's a Metal decode-speed hit, not RSS)
];

for (const file of CONTRACT_DOCS) {
  test(`${file} carries no stale [VERIFY] markers or refuted figures`, () => {
    const text = readFileSync(join(root, file), "utf8");
    for (const needle of REFUTED) {
      assert.ok(!text.includes(needle), `${file} still contains refuted/stale text: "${needle}"`);
    }
  });
}
