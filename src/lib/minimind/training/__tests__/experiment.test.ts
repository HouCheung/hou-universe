// ============================================================
// Experiment Tests — Phase 42 Experiment Runner
// ============================================================
// Tests:
//   1. runExperiment() with minimal config
//   2. Experiment returns all result fields
//   3. Metrics are collected during training
//   4. Checkpoint is included in result
//   5. Evaluation result when evalCorpus provided
//   6. quickExperiment() works
//   7. Custom model config
//   8. Metrics JSON/CSV export
//
// Run with: npx tsx src/lib/minimind/training/__tests__/run.ts
// ============================================================

import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";
import { TrainingMetricsCollector } from "../Metrics";
import {
  runExperiment,
  quickExperiment,
} from "../Experiment";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`);
  }
}

// ============================================================
// Test Helpers
// ============================================================

function createTestTokenizer(): MiniTokenizer {
  const tokenizer = new MiniTokenizer();
  const words = [
    "a", "b", "c", "d", "e", "f", "g", "h",
    "the", "cat", "dog", "sat", "mat", "run", "runs",
    "fast", "slow", "and", "or", "is", "was",
    "hello", "world", "learn", "model", "data",
    "code", "test",
  ];
  for (const word of words) {
    tokenizer.addToken(word);
  }
  return tokenizer;
}

// ============================================================
// SECTION 1: Basic Experiment
// ============================================================

function runBasicExperimentTest(): void {
  console.log("\n--- Basic Experiment ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const corpus = [
    "the cat sat the dog run fast and slow",
    "hello world the model learn data code test",
    "a b c d e f g h the cat dog run fast",
    "the dog runs fast and the cat is slow",
  ];

  const result = runExperiment({
    name: "basic-test",
    datasetConfig: {
      tokenizer,
      corpus,
      blockSize: 8,
      batchSize: 2,
      shuffle: false,
    },
    modelConfig: {
      preset: "tiny",
      vocabSize,
    },
    optimizerConfig: {
      lr: 0.01,
      weightDecay: 0.0,
    },
    trainerConfig: {
      epochs: 3,
      logInterval: 100,
      gradientAccumulationSteps: 1,
    },
  });

  // Check result structure
  assert(result.name === "basic-test", "result has correct name");
  assert(isFinite(result.finalLoss) && result.finalLoss > 0, "finalLoss is valid");
  assert(isFinite(result.bestLoss) && result.bestLoss > 0, "bestLoss is valid");
  assert(result.bestLoss <= result.finalLoss, "bestLoss <= finalLoss");
  assert(result.steps > 0, "steps > 0");
  assert(result.totalBatches > 0, "totalBatches > 0");
  assert(result.durationMs > 0, "durationMs > 0");
  assert(result.metrics.length >= 0, "metrics is an array");

  // Checkpoint present
  assert(result.checkpoint !== undefined, "checkpoint is present");
  assert(result.checkpoint.version === 3, "checkpoint version is 3 (Phase 49)");
  assert(result.checkpoint.modelParams.length > 0, "checkpoint has model params");

  // Trainer state present
  assert(result.trainerState !== undefined, "trainerState is present");
  assert(result.trainerState.completed === true, "training completed");

  console.log(`  Steps: ${result.steps}, Final loss: ${result.finalLoss.toFixed(4)}, Best: ${result.bestLoss.toFixed(4)}`);
  console.log(`  Duration: ${result.durationMs}ms`);
}

// ============================================================
// SECTION 2: Experiment with Scheduler
// ============================================================

function runExperimentWithSchedulerTest(): void {
  console.log("\n--- Experiment with Scheduler ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const corpus = [
    "the cat sat the dog run fast and slow",
    "hello world the model learn data code test",
  ];

  const result = runExperiment({
    name: "scheduler-test",
    datasetConfig: {
      tokenizer,
      corpus,
      blockSize: 8,
      batchSize: 2,
      shuffle: false,
    },
    modelConfig: {
      preset: "tiny",
      vocabSize,
    },
    optimizerConfig: {
      lr: 0.01,
      weightDecay: 0.0,
    },
    schedulerConfig: {
      type: "cosine",
      baseLR: 0.01,
      minLR: 1e-6,
      warmupSteps: 0,  // no warmup to avoid steps constraint
    },
    trainerConfig: {
      epochs: 2,
      logInterval: 100,
      gradientAccumulationSteps: 1,
    },
  });

  assert(result.steps > 0, "training with scheduler: completed");
  assert(isFinite(result.finalLoss), "training with scheduler: valid final loss");
  assert(result.checkpoint.schedulerState !== null, "checkpoint contains scheduler state");

  console.log(`  Steps: ${result.steps}, Final loss: ${result.finalLoss.toFixed(4)}`);
}

// ============================================================
// SECTION 3: Experiment with Evaluation
// ============================================================

function runExperimentWithEvalTest(): void {
  console.log("\n--- Experiment with Evaluation ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const corpus = [
    "the cat sat the dog run fast and slow",
    "hello world the model learn data code test",
    "a b c d e f g h the cat dog run fast",
  ];
  const evalCorpus = [
    "the dog runs fast and the cat is slow",
    "hello world learn model data code test",
  ];

  const result = runExperiment({
    name: "eval-test",
    datasetConfig: {
      tokenizer,
      corpus,
      blockSize: 8,
      batchSize: 2,
      shuffle: false,
      evalCorpus,
    },
    modelConfig: {
      preset: "tiny",
      vocabSize,
    },
    optimizerConfig: {
      lr: 0.01,
      weightDecay: 0.0,
    },
    trainerConfig: {
      epochs: 2,
      logInterval: 100,
      gradientAccumulationSteps: 1,
    },
  });

  assert(result.evaluation !== undefined, "evaluation result is present");
  if (result.evaluation) {
    assert(typeof result.evaluation.loss === "number", "eval: has loss");
    assert(result.evaluation.loss > 0, "eval: loss is positive");
    assert(result.evaluation.perplexity >= 1, "eval: perplexity >= 1");
    assert(result.evaluation.tokenAccuracy >= 0, "eval: accuracy >= 0");
    assert(result.evaluation.numBatches > 0, "eval: processed batches");
  }
}

// ============================================================
// SECTION 4: quickExperiment
// ============================================================

function runQuickExperimentTest(): void {
  console.log("\n--- quickExperiment ---");

  const tokenizer = createTestTokenizer();
  const corpus = [
    "the cat sat the dog run fast and slow the cat sat the dog run fast and slow",
    "hello world the model learn data code test hello world the model learn data code test",
    "a b c d e f g h the cat dog run fast a b c d e f g h the cat dog run fast",
    "the dog runs fast and the cat is slow the dog runs fast and the cat is slow",
  ];

  const result = quickExperiment(tokenizer, corpus, 2);

  assert(result.name === "quick-experiment", "quick: correct name");
  assert(result.steps > 0, "quick: completed steps");
  assert(isFinite(result.finalLoss), "quick: valid final loss");
  assert(result.durationMs > 0, "quick: has duration");

  console.log(`  Steps: ${result.steps}, Final loss: ${result.finalLoss.toFixed(4)}, Duration: ${result.durationMs}ms`);
}

// ============================================================
// SECTION 5: Custom Model Config
// ============================================================

function runCustomModelTest(): void {
  console.log("\n--- Custom Model Config ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const corpus = ["the cat sat the dog", "hello world learn model"];

  const result = runExperiment({
    name: "custom-model",
    datasetConfig: {
      tokenizer,
      corpus,
      blockSize: 4,
      batchSize: 2,
      shuffle: false,
    },
    modelConfig: {
      vocabSize,
      dModel: 64,
      numHeads: 2,
      dFF: 256,
      numLayers: 1,
      maxSeqLen: 16,
    },
    optimizerConfig: {
      lr: 0.01,
      weightDecay: 0.0,
    },
    trainerConfig: {
      epochs: 2,
      logInterval: 100,
      gradientAccumulationSteps: 1,
    },
  });

  assert(result.steps > 0, "custom model: completed steps");
  assert(isFinite(result.finalLoss), "custom model: valid loss");

  // Verify the custom model was created with correct parameters
  const modelParams = result.checkpoint.modelParams;
  assert(modelParams.length > 0, "custom model: has parameters");
  // With 1 layer: embedding + 1 block (norm1 + attn × 4 + norm2 + ffn × 3) + finalNorm + lmHead
  // = 1 + 8 + 1 + 1 = 11 parameters (bias=True on Linear layers)

  console.log(`  Steps: ${result.steps}, Params: ${modelParams.length}, Final loss: ${result.finalLoss.toFixed(4)}`);
}

// ============================================================
// SECTION 6: Metrics JSON/CSV Export
// ============================================================

function runMetricsExportTest(): void {
  console.log("\n--- Metrics Export ---");

  const collector = new TrainingMetricsCollector();

  // Record some metrics
  collector.record({
    step: 10,
    epoch: 0,
    loss: 3.5,
    learningRate: 0.001,
    perplexity: 33.12,
    tokensPerSecond: 150.5,
    timestamp: Date.now(),
  });
  collector.record({
    step: 20,
    epoch: 0,
    loss: 2.8,
    learningRate: 0.001,
    perplexity: 16.44,
    tokensPerSecond: 152.0,
    timestamp: Date.now(),
  });
  collector.record({
    step: 30,
    epoch: 1,
    loss: 2.1,
    learningRate: 0.0005,
    perplexity: 8.17,
    tokensPerSecond: 151.3,
    timestamp: Date.now(),
  });

  // JSON export
  const json = collector.toJSON();
  assert(json.length > 0, "JSON export: non-empty");
  assert(json.includes('"step"'), "JSON export: has steps");
  assert(json.includes('"summary"'), "JSON export: has summary");
  assert(json.includes('"records"'), "JSON export: has records");

  // JSON round-trip
  const restored = TrainingMetricsCollector.fromJSON(json);
  assert(restored.count === 3, "JSON round-trip: 3 records");
  assertClose(restored.getRecords()[0].loss, 3.5, 1e-10, "JSON round-trip: loss preserved");

  // CSV export
  const csv = collector.toCSV();
  assert(csv.length > 0, "CSV export: non-empty");
  assert(csv.startsWith("step,epoch,loss"), "CSV export: has header");
  assert(csv.includes("3.500000"), "CSV export: has first loss");
  assert(csv.includes("2.100000"), "CSV export: has last loss");

  // CSV round-trip
  const restoredFromCSV = TrainingMetricsCollector.fromCSV(csv);
  assert(restoredFromCSV.count === 3, "CSV round-trip: 3 records");

  // toObject
  const obj = collector.toObject();
  assert(obj.records.length === 3, "toObject: 3 records");
  assert(obj.summary !== null, "toObject: has summary");
  if (obj.summary) {
    assert(obj.summary.bestLoss === 2.1, "toObject: bestLoss correct");
    assert(obj.summary.finalLoss === 2.1, "toObject: finalLoss correct");
    assert(obj.summary.initialLoss === 3.5, "toObject: initialLoss correct");
    assert(obj.summary.totalRecords === 3, "toObject: totalRecords correct");
  }

  // Summary
  const summary = collector.summarize();
  assert(summary !== null, "summary is not null");
  if (summary) {
    assert(summary.totalRecords === 3, "summary: totalRecords");
    assert(summary.bestLoss === 2.1, "summary: bestLoss");
    assert(summary.finalLoss === 2.1, "summary: finalLoss");
    assert(summary.initialLoss === 3.5, "summary: initialLoss");
    assertClose(summary.lossDecrease, 1.4, 1e-10, "summary: lossDecrease");
  }

  // Reset
  collector.reset();
  assert(collector.count === 0, "reset: count is 0");

  const emptyCSV = collector.toCSV();
  assert(emptyCSV === "step,epoch,loss,learningRate,perplexity,tokensPerSecond,timestamp\n",
    "empty CSV: header only");
}

// ============================================================
// SECTION 7: Experiment with no eval corpus
// ============================================================

function runExperimentNoEvalTest(): void {
  console.log("\n--- Experiment without Eval Corpus ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const corpus = [
    "the cat sat the dog run fast and slow",
    "hello world the model learn data code test",
    "a b c d e f g h the cat dog run fast",
  ];

  const result = runExperiment({
    name: "no-eval-test",
    datasetConfig: {
      tokenizer,
      corpus,
      blockSize: 4,
      batchSize: 2,
      shuffle: false,
    },
    modelConfig: {
      preset: "tiny",
      vocabSize,
    },
    optimizerConfig: {
      lr: 0.01,
      weightDecay: 0.0,
    },
    trainerConfig: {
      epochs: 1,
      logInterval: 100,
      gradientAccumulationSteps: 1,
    },
  });

  assert(result.evaluation === undefined, "no eval: evaluation is undefined");
  assert(result.steps > 0, "no eval: training completed");
}

// ============================================================
// Master Test Runner
// ============================================================

export function runExperimentRunnerTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n=== MiniMind Experiment Runner Tests (Phase 42) ===\n");

  runBasicExperimentTest();
  runExperimentWithSchedulerTest();
  runExperimentWithEvalTest();
  runQuickExperimentTest();
  runCustomModelTest();
  runMetricsExportTest();
  runExperimentNoEvalTest();

  console.log(`\n=== Experiment runner tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
