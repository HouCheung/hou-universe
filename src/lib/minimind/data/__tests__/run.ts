// ============================================================
// Test runner for MiniMind Data Module
// ============================================================
// Run with: npx tsx src/lib/minimind/data/__tests__/run.ts
// ============================================================

import {
  runDatasetTests,
  runTextDatasetTests,
  runBatchSamplerTests,
  runDataLoaderTests,
} from "./dataset.test";
import { runDatasetLoaderTests } from "./datasetLoader.test";

let totalPassed = 0;
let totalFailed = 0;

console.log("=".repeat(60));
console.log("MiniMind Data Module — Test Suite");
console.log("=".repeat(60));

// Dataset tests
const datasetResult = runDatasetTests();
totalPassed += datasetResult.passed;
totalFailed += datasetResult.failed;

// TextDataset tests
const textDatasetResult = runTextDatasetTests();
totalPassed += textDatasetResult.passed;
totalFailed += textDatasetResult.failed;

// BatchSampler tests
const batchSamplerResult = runBatchSamplerTests();
totalPassed += batchSamplerResult.passed;
totalFailed += batchSamplerResult.failed;

// DataLoader tests
const dataLoaderResult = runDataLoaderTests();
totalPassed += dataLoaderResult.passed;
totalFailed += dataLoaderResult.failed;

// Dataset loader / schema tests (Phase 82)
const datasetLoaderResult = runDatasetLoaderTests();
totalPassed += datasetLoaderResult.passed;
totalFailed += datasetLoaderResult.failed;

console.log("\n" + "=".repeat(60));
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log("=".repeat(60));

if (totalFailed > 0) {
  process.exit(1);
}
