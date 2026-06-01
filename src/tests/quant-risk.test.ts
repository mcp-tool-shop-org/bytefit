import { test } from "node:test";
import assert from "node:assert/strict";
import { lowBitRisk, isImatrixQuant } from "../index.js";

test("4-bit+ quants are safe", () => {
  assert.equal(lowBitRisk({ quant: "Q4_K_M" }), "safe");
  assert.equal(lowBitRisk({ quant: "Q4_K_S" }), "safe");
  assert.equal(lowBitRisk({ quant: "IQ4_XS" }), "safe");
  assert.equal(lowBitRisk({ quant: "Q3_K_L" }), "safe"); // 4.27 bpw is still ≥ 4-bit
});

test("legacy sub-4-bit quants are risky", () => {
  assert.equal(lowBitRisk({ quant: "Q3_K_M" }), "risky");
  assert.equal(lowBitRisk({ quant: "Q3_K_S" }), "risky");
  assert.equal(lowBitRisk({ quant: "Q2_K" }), "risky");
});

test("IQ and dynamic sub-4-bit quants are imatrix-recovered, not risky", () => {
  assert.equal(lowBitRisk({ quant: "IQ2_M" }), "imatrix");
  assert.equal(lowBitRisk({ quant: "IQ3_M" }), "imatrix");
  assert.equal(lowBitRisk({ quant: "Q2_K", dynamic: true }), "imatrix");
});

test("isImatrixQuant identifies IQ formats", () => {
  assert.equal(isImatrixQuant("IQ2_M"), true);
  assert.equal(isImatrixQuant("Q2_K"), false);
});
