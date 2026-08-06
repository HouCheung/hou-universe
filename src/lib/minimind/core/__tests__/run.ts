// ============================================================
// Test runner for MiniMind Core
// ============================================================
// Run with: npx tsx src/lib/minimind/core/__tests__/run.ts
// ============================================================

import { runTensorTests } from "./tensor.test";
import { runGradientTests } from "./gradient_tests.test";

let totalPassed = 0;
let totalFailed = 0;

console.log("=".repeat(60));
console.log("MiniMind Core — Test Suite");
console.log("=".repeat(60));

// Tensor tests
const tensorResult = runTensorTests();
totalPassed += tensorResult.passed;
totalFailed += tensorResult.failed;

// Gradient tests
const gradResult = runGradientTests();
totalPassed += gradResult.passed;
totalFailed += gradResult.failed;

console.log("\n" + "=".repeat(60));
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log("=".repeat(60));

if (totalFailed > 0) {
  process.exit(1);
}
