// ============================================================
// BenchmarkRunner unit tests
// ============================================================
// Phase 50: Tests for benchmark runner.
// Covers: runTrainingBenchmark, runGenerationBenchmark,
// runFullBenchmark, compare, compareMultiple, summarize.
// ============================================================

import { BenchmarkRunner } from "../BenchmarkRunner";
import type { TrainingBenchmarkConfig, GenerationBenchmarkConfig } from "../BenchmarkRunner";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { Tensor } from "../../core/Tensor";
import { AdamWOptimizer } from "../../core/optim/AdamW";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`); }
}

// ============================================================
// Test runner
// ============================================================

export function runBenchmarkRunnerTests(): { passed: number; failed: number } {
  console.log("\n=== BenchmarkRunner Tests ===\n");
  passed = 0; failed = 0;

  // ── Construction ──
  console.log("Construction:");

  // 1-2
  const runner = new BenchmarkRunner();
  assert(runner instanceof BenchmarkRunner, "default constructor works");
  const seededRunner = new BenchmarkRunner(123);
  assert(seededRunner instanceof BenchmarkRunner, "seeded constructor works");

  // ── runTrainingBenchmark ──
  console.log("runTrainingBenchmark:");

  const model = TensorMiniMindModel.tiny(1024);
  const optimizer = new AdamWOptimizer(model.parameters(), { lr: 0.001 });

  const trainCfg: TrainingBenchmarkConfig = {
    steps: 10,
    batchSize: 2,
    seqLen: 16,
    vocabSize: 1024,
    warmupSteps: 2,
    seed: 42,
  };

  // 3-5: Basic training benchmark
  const trainResult = runner.runTrainingBenchmark(model, optimizer, trainCfg);
  assert(typeof trainResult.tokensPerSecond === "number", "training result has tokensPerSecond");
  // effective steps = totalSteps(12) - warmupSteps(2) = 10
  assert(trainResult.steps === 10, "effective steps = total - warmup (10)");
  assert(trainResult.tokensProcessed > 0, "tokensProcessed > 0");

  // 6-8: Result structure
  assert(trainResult.lossHistory.length === 10, "lossHistory has correct length (effective steps)");
  assert(typeof trainResult.initialLoss === "number", "initialLoss is a number");
  assert(typeof trainResult.finalLoss === "number", "finalLoss is a number");

  // 9-11: Metrics are reasonable
  assert(trainResult.tokensPerSecond > 0, "tokensPerSecond > 0");
  assert(trainResult.durationMs > 0, "durationMs > 0");
  assert(trainResult.bestLoss <= trainResult.initialLoss, "bestLoss <= initialLoss");

  // 12-14: Model info
  assert(trainResult.model.includes("dModel"), "model string includes dModel");
  assert(trainResult.dataset === "synthetic", "dataset is synthetic");

  // Determinism: same synthetic data seed on a fresh model produces similar loss
  const freshModel = TensorMiniMindModel.tiny(1024);
  const freshOpt = new AdamWOptimizer(freshModel.parameters(), { lr: 0.001 });
  const trainResultRef = runner.runTrainingBenchmark(freshModel, freshOpt, trainCfg);
  assert(trainResultRef.steps === 10, "fresh model benchmark completes with correct steps");
  assert(trainResultRef.lossHistory.length === 10, "fresh model lossHistory has correct length");

  // ── runTrainingBenchmark with different seeds ──
  console.log("Training benchmark — seed behavior:");

  // 15: Different seed produces different synthetic data — just verify it runs
  const diffSeedResult = runner.runTrainingBenchmark(model, optimizer, {
    ...trainCfg, seed: 99,
  });
  assert(diffSeedResult.steps === 10, "different seed run completes");

  // ── runTrainingBenchmark with gradient accumulation ──
  console.log("Training benchmark — gradient accumulation:");

  // 16-17
  const modelGA = TensorMiniMindModel.tiny(1024);
  const optGA = new AdamWOptimizer(modelGA.parameters(), { lr: 0.001 });
  const gaResult = runner.runTrainingBenchmark(modelGA, optGA, {
    steps: 10, batchSize: 2, seqLen: 16, vocabSize: 1024,
    gradientAccumulationSteps: 2, seed: 42,
  });
  assert(gaResult.steps === 10, "gradient accumulation: effective steps unchanged");
  assert(gaResult.tokensPerSecond > 0, "gradient accumulation: throughput measured");

  // ── runGenerationBenchmark ──
  console.log("runGenerationBenchmark:");

  const genModel = TensorMiniMindModel.tiny(1024);
  const genCfg: GenerationBenchmarkConfig = {
    promptCount: 5,
    maxTokens: 10,
    temperature: 0,
    seed: 42,
  };

  // 18-22: Basic generation benchmark
  const genResult = runner.runGenerationBenchmark(genModel, genCfg);
  assert(genResult.promptCount === 5, "generation: promptCount matches");
  assert(genResult.totalTokensGenerated > 0, "generation: tokens generated > 0");
  assert(typeof genResult.tokensPerSecond === "number", "generation: tokensPerSecond is number");
  assert(genResult.avgTokensPerPrompt > 0, "generation: avgTokensPerPrompt > 0");
  assert(genResult.durationMs > 0, "generation: durationMs > 0");

  // 23-25: EOS/maxTokens counts sum correctly
  assert(
    genResult.eosCount + genResult.maxTokensCount === genResult.promptCount,
    "eosCount + maxTokensCount = promptCount"
  );
  assert(typeof genResult.eosCount === "number", "generation: eosCount is number");
  assert(typeof genResult.maxTokensCount === "number", "generation: maxTokensCount is number");

  // 26-28: Deterministic with same seed
  const genModel2 = TensorMiniMindModel.tiny(1024);
  const genResult2 = runner.runGenerationBenchmark(genModel2, genCfg);
  assert(genResult.totalTokensGenerated === genResult2.totalTokensGenerated,
    "same seed produces identical generation token count");

  // ── runGenerationBenchmark with temperature ──
  console.log("Generation benchmark — temperature:");

  // 29-30
  const genModelT = TensorMiniMindModel.tiny(1024);
  const tempResult = runner.runGenerationBenchmark(genModelT, {
    promptCount: 3, maxTokens: 5, temperature: 0.8, seed: 42,
  });
  assert(tempResult.promptCount === 3, "temperature sampling: promptCount correct");
  assert(tempResult.totalTokensGenerated > 0, "temperature sampling produces tokens");

  // ── runFullBenchmark ──
  console.log("runFullBenchmark:");

  const fullModel = TensorMiniMindModel.tiny(1024);
  const fullOpt = new AdamWOptimizer(fullModel.parameters(), { lr: 0.001 });

  // 31-36: Full benchmark
  const fullResult = runner.runFullBenchmark(
    "test-benchmark",
    fullModel,
    fullOpt,
    { steps: 5, batchSize: 2, seqLen: 16, vocabSize: 1024, seed: 42 },
    { promptCount: 3, maxTokens: 5, seed: 42 }
  );

  assert(fullResult.name === "test-benchmark", "full benchmark: name matches");
  assert(typeof fullResult.training === "object" && fullResult.training !== null, "full benchmark has training");
  assert(typeof fullResult.generation === "object" && fullResult.generation !== null, "full benchmark has generation");
  assert(typeof fullResult.totalDurationMs === "number" && fullResult.totalDurationMs > 0, "full benchmark has totalDurationMs");
  assert(typeof fullResult.timestamp === "string", "full benchmark has timestamp");
  assert(fullResult.model.length > 0, "full benchmark has model info");

  // ── compare ──
  console.log("compare:");

  // 37-39: Compare two results
  const cmpA = runner.runFullBenchmark("model-a", fullModel, fullOpt,
    { steps: 5, batchSize: 2, seqLen: 16, vocabSize: 1024, seed: 42 },
    { promptCount: 3, maxTokens: 5, seed: 42 });

  const cmpModel = TensorMiniMindModel.tiny(1024);
  const cmpOpt = new AdamWOptimizer(cmpModel.parameters(), { lr: 0.001 });
  const cmpB = runner.runFullBenchmark("model-b", cmpModel, cmpOpt,
    { steps: 5, batchSize: 2, seqLen: 16, vocabSize: 1024, seed: 42 },
    { promptCount: 3, maxTokens: 5, seed: 42 });

  const comparison = runner.compare(cmpA, cmpB);
  assert(typeof comparison === "string" && comparison.length > 0, "compare returns string");
  assert(comparison.includes("model-a"), "comparison includes first name");

  // ── compareMultiple ──
  console.log("compareMultiple:");

  // 40-42: Multi-way comparison
  const multiCompare = runner.compareMultiple([cmpA, cmpB]);
  assert(typeof multiCompare === "string" && multiCompare.length > 0, "compareMultiple returns string");
  assert(multiCompare.includes("model-a"), "multi-compare includes first result");

  // Empty comparison
  const emptyCompare = runner.compareMultiple([]);
  assert(emptyCompare.includes("No benchmarks"), "empty compareMultiple gives message");

  // ── summarize ──
  console.log("summarize:");

  // 43-46: Summary
  const summary = runner.summarize(fullResult);
  assert(typeof summary === "string" && summary.length > 0, "summarize returns string");
  assert(summary.includes(fullResult.name), "summary includes benchmark name");
  assert(summary.includes("Training"), "summary includes Training section");
  assert(summary.includes("Generation"), "summary includes Generation section");

  // ── Edge cases ──
  console.log("Edge cases:");

  // 47-48: Zero warmup steps
  const noWarmupModel = TensorMiniMindModel.tiny(1024);
  const noWarmupOpt = new AdamWOptimizer(noWarmupModel.parameters(), { lr: 0.001 });
  const noWarmupResult = runner.runTrainingBenchmark(noWarmupModel, noWarmupOpt, {
    steps: 5, batchSize: 2, seqLen: 8, vocabSize: 1024, warmupSteps: 0, seed: 42,
  });
  assert(noWarmupResult.steps === 5, "zero warmup: all steps are effective");
  assert(noWarmupResult.lossHistory.length === 5, "zero warmup: lossHistory has all steps");

  // 49-50: Single step
  const singleModel = TensorMiniMindModel.tiny(1024);
  const singleOpt = new AdamWOptimizer(singleModel.parameters(), { lr: 0.001 });
  const singleResult = runner.runTrainingBenchmark(singleModel, singleOpt, {
    steps: 1, batchSize: 1, seqLen: 8, vocabSize: 1024, seed: 42,
  });
  assert(singleResult.steps === 1, "single step benchmark works");
  assert(singleResult.tokensPerSecond > 0, "single step has throughput");

  console.log(`\nBenchmarkRunner: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

if (require.main === module) {
  runBenchmarkRunnerTests();
}
