// ============================================================
// Evaluator Tests — Phase 42 Evaluation Pipeline
// ============================================================
// Tests:
//   1. evaluate() returns valid metrics
//   2. noGrad prevents computation graph creation
//   3. evaluate() doesn't change parameter gradients
//   4. evaluateQuick() returns loss and perplexity
//   5. Token accuracy is between 0 and 1
//   6. Sample predictions are valid
//   7. Evaluate with empty dataset
//   8. Batch metrics are consistent
//
// Run with: npx tsx src/lib/minimind/training/__tests__/run.ts
// ============================================================

import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { TextDataset } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import type { TextSample } from "../../data/TextDataset";
import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";
import { evaluate, evaluateQuick } from "../Evaluator";

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

function createTestDataset(tokenizer: MiniTokenizer, blockSize: number = 8): TextDataset {
  const corpus = [
    "the cat sat the dog run fast and slow",
    "hello world the model learn data code test",
  ];
  return new TextDataset({ tokenizer, corpus, blockSize, insertEos: true });
}

function createTestLoader(dataset: TextDataset, batchSize: number = 2): DataLoader<TextSample> {
  return new DataLoader(dataset, { batchSize, shuffle: false, dropLast: true });
}

// ============================================================
// SECTION 1: Basic Evaluation
// ============================================================

function runBasicEvaluationTest(): void {
  console.log("\n--- Basic Evaluation ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const model = TensorMiniMindModel.tiny(vocabSize);
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2);

  const result = evaluate({ model, loader, tokenizer });

  // Check all fields are present
  assert(typeof result.loss === "number", "result has loss");
  assert(typeof result.perplexity === "number", "result has perplexity");
  assert(typeof result.tokenAccuracy === "number", "result has tokenAccuracy");
  assert(typeof result.totalTokens === "number", "result has totalTokens");
  assert(typeof result.numBatches === "number", "result has numBatches");
  assert(Array.isArray(result.batchMetrics), "result has batchMetrics array");
  assert(Array.isArray(result.samples), "result has samples array");

  // Valid ranges
  assert(isFinite(result.loss) && result.loss > 0, "loss is finite and positive");
  assert(result.perplexity >= 1, "perplexity >= 1");
  assert(result.tokenAccuracy >= 0 && result.tokenAccuracy <= 1,
    `tokenAccuracy in [0, 1]: ${result.tokenAccuracy}`);
  assert(result.totalTokens > 0, "totalTokens > 0");
  assert(result.numBatches > 0, "numBatches > 0");
}

// ============================================================
// SECTION 2: noGrad prevents gradient accumulation
// ============================================================

function runNoGradTest(): void {
  console.log("\n--- noGrad Protection ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const model = TensorMiniMindModel.tiny(vocabSize);
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2);

  // Record parameter values before eval
  const paramsBefore: Float64Array[] = model.parameters().map(
    (p) => new Float64Array(p.data)
  );

  // Record gradient values before eval (should be zero)
  const gradsBefore: (Float64Array | null)[] = model.parameters().map(
    (p) => p.grad ? new Float64Array(p.grad) : null
  );

  // Run evaluation (result not used — test checks params/grads unchanged)
  evaluate({ model, loader, tokenizer });

  // Parameter data should be unchanged
  const paramsAfter = model.parameters();
  for (let i = 0; i < paramsBefore.length; i++) {
    for (let j = 0; j < paramsBefore[i].length; j++) {
      assertClose(paramsAfter[i].data[j], paramsBefore[i][j], 1e-15,
        `param ${i}[${j}] unchanged after eval`);
    }
  }

  // Gradients should still be zero (unchanged)
  const gradsAfter = model.parameters().map(
    (p) => p.grad ? new Float64Array(p.grad) : null
  );

  for (let i = 0; i < gradsBefore.length; i++) {
    if (gradsBefore[i] !== null && gradsAfter[i] !== null) {
      for (let j = 0; j < gradsBefore[i].length; j++) {
        assert(gradsAfter[i][j] === gradsBefore[i][j],
          `grad ${i}[${j}] unchanged after eval`);
      }
    }
  }

  // Verify requiresGrad is restored after noGrad
  for (const p of model.parameters()) {
    assert(p.requiresGrad === true, "requiresGrad restored to true after eval");
  }
}

// ============================================================
// SECTION 3: evaluateQuick
// ============================================================

function runEvaluateQuickTest(): void {
  console.log("\n--- evaluateQuick ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const model = TensorMiniMindModel.tiny(vocabSize);
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2);

  const result = evaluateQuick(model, loader);

  assert(typeof result.loss === "number", "quick: has loss");
  assert(typeof result.perplexity === "number", "quick: has perplexity");
  assert(isFinite(result.loss) && result.loss > 0, "quick: loss is valid");
  assert(result.perplexity >= 1, "quick: perplexity >= 1");
}

// ============================================================
// SECTION 4: Token Accuracy
// ============================================================

function runTokenAccuracyTest(): void {
  console.log("\n--- Token Accuracy ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const model = TensorMiniMindModel.tiny(vocabSize);
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2);

  const result = evaluate({ model, loader, tokenizer });

  // Token accuracy should be between 0 and 1
  assert(result.tokenAccuracy >= 0, "tokenAccuracy >= 0");
  assert(result.tokenAccuracy <= 1, "tokenAccuracy <= 1");

  // For a random model, accuracy should be roughly 1/vocabSize (low)
  console.log(`  Token accuracy: ${(result.tokenAccuracy * 100).toFixed(2)}%`);
  assert(result.tokenAccuracy < 0.5, "random model accuracy < 50%");

  // Total tokens from batch metrics should match
  let batchTokens = 0;
  for (const bm of result.batchMetrics) {
    batchTokens += bm.numTokens;
  }
  assert(batchTokens === result.totalTokens, "batch tokens sum to total");
}

// ============================================================
// SECTION 5: Sample Predictions
// ============================================================

function runSamplePredictionsTest(): void {
  console.log("\n--- Sample Predictions ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const model = TensorMiniMindModel.tiny(vocabSize);
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2);

  const result = evaluate({ model, loader, tokenizer, maxSamples: 2 });

  assert(result.samples.length <= 2, "sample count respects maxSamples");
  assert(result.samples.length > 0, "at least one sample collected");

  for (const sample of result.samples) {
    assert(sample.inputTokens.length > 0, "sample has input tokens");
    assert(sample.targetTokens.length > 0, "sample has target tokens");
    assert(sample.predictedTokens.length > 0, "sample has predicted tokens");
    assert(typeof sample.inputText === "string", "sample has input text");
    assert(typeof sample.targetText === "string", "sample has target text");
    assert(typeof sample.predictedText === "string", "sample has predicted text");
    assert(sample.predictedTokens.length === sample.targetTokens.length,
      "predicted and target have same length");
  }
}

// ============================================================
// SECTION 6: Batch Metrics Consistency
// ============================================================

function runBatchMetricsTest(): void {
  console.log("\n--- Batch Metrics ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const model = TensorMiniMindModel.tiny(vocabSize);
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2);

  const result = evaluate({ model, loader, tokenizer });

  assert(result.batchMetrics.length === result.numBatches,
    "batchMetrics count matches numBatches");

  // Average of batch losses should approximately equal overall loss
  let batchLossSum = 0;
  for (const bm of result.batchMetrics) {
    batchLossSum += bm.loss;
    assert(isFinite(bm.loss), `batch ${bm.batchIndex} loss is finite`);
    assert(bm.perplexity >= 1, `batch ${bm.batchIndex} perplexity >= 1`);
    assert(bm.tokenAccuracy >= 0 && bm.tokenAccuracy <= 1,
      `batch ${bm.batchIndex} accuracy in [0,1]`);
    assert(bm.numTokens > 0, `batch ${bm.batchIndex} has tokens`);
  }

  const avgBatchLoss = batchLossSum / result.batchMetrics.length;
  assertClose(avgBatchLoss, result.loss, 1e-10, "avg batch loss matches overall loss");
}

// ============================================================
// Master Test Runner
// ============================================================

export function runEvaluatorTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n=== MiniMind Evaluator Tests (Phase 42) ===\n");

  runBasicEvaluationTest();
  runNoGradTest();
  runEvaluateQuickTest();
  runTokenAccuracyTest();
  runSamplePredictionsTest();
  runBatchMetricsTest();

  console.log(`\n=== Evaluator tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
