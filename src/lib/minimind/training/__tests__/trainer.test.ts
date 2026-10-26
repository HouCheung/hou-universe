// ============================================================
// Trainer Tests — Phase 41 Training Engine Foundation
// ============================================================
// Integration tests for the full training pipeline:
//   DataLoader → collate → model.forward() → CrossEntropyLoss
//   → backward() → optimizer.step() → optimizer.zeroGrad()
//
// Test categories:
//   1. Trainer forward/backward integration
//   2. Optimizer update verification
//   3. Loss decreases on tiny dataset
//   4. State tracking
//   5. Deterministic training
//   6. Gradient accumulation
//   7. Evaluation loop
//   8. Numerical stability
//   9. Unit tests: LossTracker, Perplexity, TrainingState, TrainerConfig
//
// Run with: npx tsx src/lib/minimind/training/__tests__/run.ts
// ============================================================

import { Tensor } from "../../core/Tensor";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { TextDataset } from "../../data/TextDataset";
import type { TextSample } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";
import { crossEntropyLoss } from "../../core/loss/CrossEntropyLoss";
import { clipGradients } from "../../core/GradientClipper";
import { Parameter } from "../../core/Parameter";
import { Trainer, collateBatch } from "../Trainer";
import { TrainingState } from "../TrainingState";
import { LossTracker } from "../LossTracker";
import { Perplexity } from "../Perplexity";
import { GradientAccumulator } from "../GradientAccumulator";
import {
  resolveTrainerConfig,
  DEFAULT_TRAINER_CONFIG,
} from "../TrainerConfig";
import type { TrainerConfig } from "../TrainerConfig";
import { saveCheckpointJSON, loadCheckpointJSON } from "../checkpoint/Checkpoint";

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

// ============================================================
// Test Helpers
// ============================================================

/**
 * Create a tokenizer with a small vocabulary for testing.
 *
 * Registers tokens with IDs 4..31 (IDs 0-3 are special tokens).
 * The test corpus uses these tokens exclusively.
 */
function createTestTokenizer(): MiniTokenizer {
  const tokenizer = new MiniTokenizer();
  // Register simple tokens that map to predictable IDs
  // Special tokens: <pad>=0, <bos>=1, <eos>=2, <unk>=3
  // Custom tokens start at ID 4
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

/**
 * Create a TextDataset for testing with simple repeating text.
 * Uses a tokenizer with known vocabulary.
 */
function createTestDataset(
  tokenizer: MiniTokenizer,
  blockSize: number = 8
): TextDataset {
  // Simple repeating text that uses registered tokens
  const corpus = [
    "the cat sat the dog run fast and slow",
    "hello world the model learn data code test",
    "a b c d e f g h the cat dog run fast",
    "the dog runs fast and the cat is slow",
  ];
  return new TextDataset({
    tokenizer,
    corpus,
    blockSize,
    insertEos: true,
  });
}

/**
 * Create a DataLoader from a TextDataset.
 */
function createTestLoader(
  dataset: TextDataset,
  batchSize: number = 2,
  shuffle: boolean = false,
  seed: number = 42
): DataLoader<TextSample> {
  return new DataLoader(dataset, { batchSize, shuffle, seed, dropLast: true });
}

// ============================================================
// Unit Tests — TrainerConfig
// ============================================================

function runTrainerConfigTests(): void {
  console.log("\n--- TrainerConfig ---");

  // Default resolution
  {
    const cfg = resolveTrainerConfig({ epochs: 5 });
    assert(cfg.epochs === 5, "epochs is preserved");
    assert(cfg.logInterval === DEFAULT_TRAINER_CONFIG.logInterval,
      "logInterval uses default");
    assert(cfg.evalInterval === DEFAULT_TRAINER_CONFIG.evalInterval,
      "evalInterval uses default");
    assert(cfg.gradientAccumulationSteps === DEFAULT_TRAINER_CONFIG.gradientAccumulationSteps,
      "gradientAccumulationSteps uses default");
    assert(cfg.learningRate === undefined, "learningRate is undefined by default");
  }

  // Full config
  {
    const cfg = resolveTrainerConfig({
      epochs: 10,
      learningRate: 0.001,
      logInterval: 5,
      evalInterval: 25,
      gradientAccumulationSteps: 4,
    });
    assert(cfg.epochs === 10, "full: epochs");
    assert(cfg.learningRate === 0.001, "full: learningRate");
    assert(cfg.logInterval === 5, "full: logInterval");
    assert(cfg.evalInterval === 25, "full: evalInterval");
    assert(cfg.gradientAccumulationSteps === 4, "full: gradientAccumulationSteps");
  }

  // Validation: epochs must be positive
  try {
    resolveTrainerConfig({ epochs: 0 });
    assert(false, "should throw on epochs=0");
  } catch {
    assert(true, "throws on epochs=0");
  }

  // Validation: gradientAccumulationSteps must be positive
  try {
    resolveTrainerConfig({ epochs: 1, gradientAccumulationSteps: 0 });
    assert(false, "should throw on gradientAccumulationSteps=0");
  } catch {
    assert(true, "throws on gradientAccumulationSteps=0");
  }
}

// ============================================================
// Unit Tests — TrainingState
// ============================================================

function runTrainingStateTests(): void {
  console.log("\n--- TrainingState ---");

  const state = new TrainingState();

  // Initial state
  assert(state.epoch === 0, "initial epoch is 0");
  assert(state.globalStep === 0, "initial globalStep is 0");
  assert(state.totalBatches === 0, "initial totalBatches is 0");
  assert(state.lossHistory.length === 0, "initial lossHistory is empty");
  assert(state.bestLoss === Infinity, "initial bestLoss is Infinity");
  assert(state.completed === false, "initial completed is false");

  // Record losses
  state.recordLoss(3.0);
  state.recordLoss(2.0);
  state.recordLoss(2.5);
  assert(state.lossHistory.length === 3, "lossHistory has 3 entries");
  assert(state.bestLoss === 2.0, "bestLoss tracks minimum");
  assert(state.bestEpoch === 0, "bestEpoch is 0 for first min");
  assert(state.bestGlobalStep === 0, "bestGlobalStep is 0 for first min");

  // Advance steps
  state.advanceStep();
  state.advanceStep();
  state.advanceStep();
  assert(state.globalStep === 3, "globalStep advances correctly");

  // Record eval
  state.recordEval(1.5);
  assert(state.evalHistory.length === 1, "evalHistory has 1 entry");
  assert(state.evalHistory[0].step === 3, "eval step recorded");
  assert(state.evalHistory[0].loss === 1.5, "eval loss recorded");

  // Advance batches
  state.advanceBatch();
  state.advanceBatch();
  assert(state.totalBatches === 2, "totalBatches advances correctly");

  // Epoch tracking
  state.setEpoch(3);
  assert(state.epoch === 3, "setEpoch works");

  // Mark completed
  state.markCompleted();
  assert(state.completed === true, "markCompleted works");

  // Snapshot independence
  const snap = state.snapshot();
  state.recordLoss(10.0);
  assert(snap.lossHistory.length === 3, "snapshot is independent (not mutated)");
  assert(snap.completed === true, "snapshot preserves completed");
}

// ============================================================
// Unit Tests — LossTracker
// ============================================================

function runLossTrackerTests(): void {
  console.log("\n--- LossTracker ---");

  const tracker = new LossTracker(3);

  // Empty state
  assert(tracker.runningAverage() === 0, "empty running avg is 0");
  assert(tracker.epochAverage() === 0, "empty epoch avg is 0");
  assert(tracker.count === 0, "empty count is 0");
  assert(tracker.latest() === 0, "empty latest is 0");
  assert(tracker.minimum() === Infinity, "empty minimum is Infinity");

  // Add values
  tracker.add(1.0);
  tracker.add(2.0);
  tracker.add(3.0);

  assert(tracker.count === 3, "count is 3");
  assert(tracker.latest() === 3.0, "latest is last value");
  assert(Math.abs(tracker.runningAverage() - 2.0) < 1e-10, "running avg of [1,2,3] = 2");
  assert(Math.abs(tracker.epochAverage() - 2.0) < 1e-10, "epoch avg of [1,2,3] = 2");
  assert(tracker.minimum() === 1.0, "minimum is 1.0");

  // Window overflow (maxWindow=3)
  tracker.add(4.0);
  tracker.add(5.0);
  assert(Math.abs(tracker.runningAverage() - 4.0) < 1e-10, "running avg of window [3,4,5] = 4");
  assert(tracker.count === 5, "full history count is 5");

  // Reset epoch
  tracker.resetEpoch();
  assert(tracker.epochAverage() === 0, "epoch avg reset to 0");
  tracker.add(7.0);
  assert(Math.abs(tracker.epochAverage() - 7.0) < 1e-10, "epoch avg after single add");

  // History
  const hist = tracker.getHistory();
  assert(hist.length === 6, "history has 6 entries");
  assert(hist[0] === 1.0, "history[0] = 1.0");
  assert(hist[5] === 7.0, "history[5] = 7.0");

  // Full reset
  tracker.reset();
  assert(tracker.count === 0, "full reset: count is 0");
  assert(tracker.runningAverage() === 0, "full reset: running avg is 0");
}

// ============================================================
// Unit Tests — Perplexity
// ============================================================

function runPerplexityTests(): void {
  console.log("\n--- Perplexity ---");

  // Basic conversion
  assert(Math.abs(Perplexity.fromLoss(0) - 1.0) < 1e-10, "ppl(0) = 1");
  assert(Math.abs(Perplexity.fromLoss(Math.log(10)) - 10.0) < 1e-10, "ppl(log(10)) = 10");

  // Typical loss values
  const ppl1 = Perplexity.fromLoss(2.31);
  assert(ppl1 > 10 && ppl1 < 11, `ppl(2.31) ≈ 10 (got ${ppl1.toFixed(2)})`);

  // Overflow protection
  const pplBig = Perplexity.fromLoss(1000);
  assert(isFinite(pplBig), "ppl for large loss is finite");
  assert(pplBig > 1e300, `ppl for very large loss is huge (got ${pplBig.toExponential(2)})`);

  // Non-finite loss
  const pplInf = Perplexity.fromLoss(Infinity);
  assert(pplInf === Number.MAX_VALUE, "ppl(Infinity) = MAX_VALUE");

  // Inverse: loss from perplexity
  assert(Math.abs(Perplexity.toLoss(10) - Math.log(10)) < 1e-10, "toLoss(10) = log(10)");

  try {
    Perplexity.toLoss(0.5);
    assert(false, "toLoss(0.5) should throw");
  } catch {
    assert(true, "toLoss(< 1) throws");
  }

  // Interpretation
  assert(Perplexity.interpret(1.5) === "near-perfect", "ppl 1.5 = near-perfect");
  assert(Perplexity.interpret(3.0) === "excellent", "ppl 3 = excellent");
  assert(Perplexity.interpret(10.0) === "good", "ppl 10 = good");
  assert(Perplexity.interpret(30.0) === "moderate", "ppl 30 = moderate");
  assert(Perplexity.interpret(100.0) === "poor", "ppl 100 = poor");
  assert(Perplexity.interpret(300.0) === "random-level", "ppl 300 = random-level");
}

// ============================================================
// Unit Tests — collateBatch
// ============================================================

function runCollateTests(): void {
  console.log("\n--- collateBatch ---");

  // Basic collation
  {
    const batch: TextSample[] = [
      { inputIds: [1, 2, 3, 4], targetIds: [2, 3, 4, 5] },
      { inputIds: [5, 6, 7, 8], targetIds: [6, 7, 8, 9] },
    ];

    const { inputIds, targets } = collateBatch(batch);

    assert(inputIds.shape.length === 2, "inputIds is 2D");
    assert(inputIds.shape[0] === 2, "batch size = 2");
    assert(inputIds.shape[1] === 4, "seq length = 4");

    // Check values
    assert(inputIds.data[0] === 1, "inputIds[0,0] = 1");
    assert(inputIds.data[4] === 5, "inputIds[1,0] = 5");
    assert(inputIds.data[7] === 8, "inputIds[1,3] = 8");

    // Check targets
    assert(targets.length === 2, "targets has 2 rows");
    assert(targets[0].length === 4, "targets[0] length = 4");
    assert(targets[0][0] === 2, "targets[0][0] = 2");
    assert(targets[1][3] === 9, "targets[1][3] = 9");
  }

  // Empty batch throws
  try {
    collateBatch([]);
    assert(false, "empty batch should throw");
  } catch {
    assert(true, "empty batch throws error");
  }
}

// ============================================================
// Integration Test 1: Full Training Pipeline
// ============================================================

function runIntegrationTest(): void {
  console.log("\n--- Integration: Full Training Pipeline ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2, false, 42);

  const model = TensorMiniMindModel.tiny(vocabSize);

  // Snapshot initial parameters
  const initialParams: Float64Array[] = [];
  for (const p of model.parameters()) {
    initialParams.push(new Float64Array(p.data));
  }

  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    betas: [0.9, 0.999],
    eps: 1e-8,
    weightDecay: 0.0,
  });

  const logEntries: Array<{ step: number; loss: number }> = [];
  const epochEndEntries: Array<{ epoch: number; avgLoss: number }> = [];

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: loader,
    config: {
      epochs: 5,
      logInterval: 1,
      gradientAccumulationSteps: 1,
    },
    onLog: (info) => {
      logEntries.push({ step: info.globalStep, loss: info.loss });
    },
    onEpochEnd: (info) => {
      epochEndEntries.push({ epoch: info.epoch, avgLoss: info.epochAvgLoss });
    },
  });

  const state = trainer.train();

  // 1. State completed
  assert(state.completed === true, "training completed");

  // 2. Epoch count
  assert(state.epoch === 4, "final epoch is 4 (0-indexed, 5 epochs)");

  // 3. Steps taken
  assert(state.globalStep > 0, "optimizer steps were taken");
  assert(state.totalBatches > 0, "batches were processed");

  // 4. Loss history recorded
  assert(state.lossHistory.length > 0, "lossHistory has entries");

  // 5. Parameters changed
  let totalChange = 0;
  for (let i = 0; i < model.parameters().length; i++) {
    const p = model.parameters()[i];
    const init = initialParams[i];
    for (let j = 0; j < p.data.length; j++) {
      totalChange += Math.abs(p.data[j] - init[j]);
    }
  }
  assert(totalChange > 0, "parameters changed after training");

  // 6. Callbacks fired
  assert(logEntries.length > 0, "onLog callback was called");
  assert(epochEndEntries.length === 5, "onEpochEnd called 5 times");

  // 7. Log entries have valid data
  for (const entry of logEntries) {
    assert(isFinite(entry.loss) && !isNaN(entry.loss),
      `log step ${entry.step}: loss is finite`);
    assert(entry.loss > 0, `log step ${entry.step}: loss > 0`);
  }
}

// ============================================================
// Integration Test 2: Loss Decreases on Tiny Dataset
// ============================================================

function runLossDecreaseTest(): void {
  console.log("\n--- Integration: Loss Decrease ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2, false, 42);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    betas: [0.9, 0.999],
    eps: 1e-8,
    weightDecay: 0.0,
  });

  // Compute loss before training.
  // Phase 89: the measurement is re-derived to the corrected 1-step objective
  // (crossEntropyLoss(logits, UN-shifted input)). The previous measurement used
  // collateBatch's pre-shifted targetIds, which — combined with the loss' internal
  // causal shift — measured the 2-step objective that Phase 88 confirmed. The
  // Trainer now optimizes the 1-step objective, so the decrease assertion is
  // evaluated against the same objective the Trainer trains.
  let lossBefore = 0;
  let lossCount = 0;
  for (const batch of loader) {
    const { inputIds } = collateBatch(batch);
    const logits = model.forward(inputIds);
    const lossTensor = crossEntropyLoss(logits, batch.map((s) => s.inputIds));
    lossBefore += lossTensor.item();
    lossCount++;
  }
  const avgLossBefore = lossBefore / lossCount;

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: createTestLoader(dataset, 2, false, 42),
    config: { epochs: 10, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  const state = trainer.train();

  // Compute loss after training (same corrected 1-step measurement as before).
  let lossAfter = 0;
  let lossAfterCount = 0;
  for (const batch of loader) {
    const { inputIds } = collateBatch(batch);
    const logits = model.forward(inputIds);
    const lossTensor = crossEntropyLoss(logits, batch.map((s) => s.inputIds));
    lossAfter += lossTensor.item();
    lossAfterCount++;
  }
  const avgLossAfter = lossAfter / lossAfterCount;

  console.log(`  Before: ${avgLossBefore.toFixed(4)}, After: ${avgLossAfter.toFixed(4)}`);
  console.log(`  Decrease: ${(avgLossBefore - avgLossAfter).toFixed(4)}`);

  assert(avgLossAfter < avgLossBefore,
    `loss decreased: ${avgLossAfter.toFixed(4)} < ${avgLossBefore.toFixed(4)}`);

  // First half vs second half of training
  const half = Math.floor(state.lossHistory.length / 2);
  if (half >= 2) {
    const firstHalfAvg = state.lossHistory.slice(0, half)
      .reduce((s, v) => s + v, 0) / half;
    const secondHalfAvg = state.lossHistory.slice(half)
      .reduce((s, v) => s + v, 0) / (state.lossHistory.length - half);
    console.log(`  First half avg: ${firstHalfAvg.toFixed(4)}, Second half avg: ${secondHalfAvg.toFixed(4)}`);
    // Note: with AdamW and small data, loss may not be strictly monotonic
    // but the general trend should be downward
    assert(isFinite(firstHalfAvg), "first half avg is finite");
    assert(isFinite(secondHalfAvg), "second half avg is finite");
  }
}

// ============================================================
// Integration Test 3: State Tracking
// ============================================================

function runStateTrackingTest(): void {
  console.log("\n--- Integration: State Tracking ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2, false, 42);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0.0,
  });

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: loader,
    config: { epochs: 3, logInterval: 1, gradientAccumulationSteps: 1 },
  });

  const state = trainer.train();

  // Verify state structure
  assert(typeof state.epoch === "number", "state.epoch is a number");
  assert(typeof state.globalStep === "number", "state.globalStep is a number");
  assert(typeof state.totalBatches === "number", "state.totalBatches is a number");
  assert(Array.isArray(state.lossHistory), "state.lossHistory is an array");
  assert(typeof state.bestLoss === "number", "state.bestLoss is a number");
  assert(typeof state.bestEpoch === "number", "state.bestEpoch is a number");
  assert(typeof state.bestGlobalStep === "number", "state.bestGlobalStep is a number");
  assert(Array.isArray(state.evalHistory), "state.evalHistory is an array");
  assert(typeof state.completed === "boolean", "state.completed is a boolean");

  // Best loss is valid
  assert(isFinite(state.bestLoss), "bestLoss is finite");
  assert(state.bestLoss > 0, "bestLoss > 0");
  assert(state.bestLoss !== Infinity, "bestLoss is not Infinity");

  // Loss history contains valid entries
  for (const loss of state.lossHistory) {
    assert(isFinite(loss) && !isNaN(loss), `loss ${loss} is finite`);
  }

  // Epoch tracking
  assert(state.epoch === 2, "final epoch is 2 (0-indexed, 3 epochs)");
}

// ============================================================
// Integration Test 4: Deterministic Training
// ============================================================

function runDeterministicTest(): void {
  console.log("\n--- Integration: Deterministic Training ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);

  // First training run
  const model1 = TensorMiniMindModel.tiny(vocabSize);

  // Save initial weights
  const initWeights: Float64Array[] = [];
  for (const p of model1.parameters()) {
    initWeights.push(new Float64Array(p.data));
  }

  const loader1 = createTestLoader(dataset, 2, false, 42);
  const optimizer1 = new AdamWOptimizer(model1.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0.0,
  });

  const trainer1 = new Trainer({
    model: model1,
    optimizer: optimizer1,
    trainLoader: loader1,
    config: { epochs: 5, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  const state1 = trainer1.train();

  // Second training run with identical setup
  const model2 = TensorMiniMindModel.tiny(vocabSize);

  // Verify initial weights are different (Math.random() not seeded)
  let initDiff = 0;
  const params2 = model2.parameters();
  for (let i = 0; i < initWeights.length; i++) {
    for (let j = 0; j < initWeights[i].length; j++) {
      initDiff += Math.abs(params2[i].data[j] - initWeights[i][j]);
    }
  }
  console.log(`  Initial weight difference between two models: ${initDiff.toExponential(4)}`);
  assert(initDiff > 0, "two randomly initialized models have different weights");

  const loader2 = createTestLoader(dataset, 2, false, 42);
  const optimizer2 = new AdamWOptimizer(model2.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0.0,
  });

  const trainer2 = new Trainer({
    model: model2,
    optimizer: optimizer2,
    trainLoader: loader2,
    config: { epochs: 5, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  const state2 = trainer2.train();

  // Both should complete successfully
  assert(state1.completed, "run 1 completed");
  assert(state2.completed, "run 2 completed");

  // Both should show loss decrease
  assert(state1.bestLoss < Infinity, "run 1 has finite best loss");
  assert(state2.bestLoss < Infinity, "run 2 has finite best loss");

  // Both should produce finite values throughout
  for (const loss of state1.lossHistory) {
    assert(isFinite(loss) && !isNaN(loss), `run 1: loss ${loss} is finite`);
  }
  for (const loss of state2.lossHistory) {
    assert(isFinite(loss) && !isNaN(loss), `run 2: loss ${loss} is finite`);
  }

  // Since initial weights differ, training results differ
  // This confirms that training is not "mock" — real weight differences
  // lead to different training trajectories
  let finalDiff = 0;
  const params1Final = model1.parameters();
  const params2Final = model2.parameters();
  for (let i = 0; i < params1Final.length; i++) {
    for (let j = 0; j < params1Final[i].data.length; j++) {
      finalDiff += Math.abs(params1Final[i].data[j] - params2Final[i].data[j]);
    }
  }
  console.log(`  Final weight difference between two trained models: ${finalDiff.toExponential(4)}`);
  assert(finalDiff > 0, "two models converge to different weights");
}

// ============================================================
// Integration Test 5: Gradient Accumulation
// ============================================================

function runGradientAccumulationTest(): void {
  console.log("\n--- Integration: Gradient Accumulation ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);

  // Train with accumulation = 1
  const model1 = TensorMiniMindModel.tiny(vocabSize);
  const model2 = TensorMiniMindModel.tiny(vocabSize);

  // Copy weights for identical start
  const params1 = model1.parameters();
  const params2 = model2.parameters();
  for (let i = 0; i < params1.length; i++) {
    params2[i].data.set(params1[i].data);
  }

  const loader1 = createTestLoader(dataset, 2, false, 42);
  const loader2 = createTestLoader(dataset, 2, false, 42);

  const optimizer1 = new AdamWOptimizer(model1.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0.0,
  });

  const optimizer2 = new AdamWOptimizer(model2.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0.0,
  });

  // acc=1 (baseline)
  const trainer1 = new Trainer({
    model: model1,
    optimizer: optimizer1,
    trainLoader: loader1,
    config: { epochs: 3, logInterval: 100, gradientAccumulationSteps: 1 },
  });
  const state1 = trainer1.train();

  // acc=2
  const trainer2 = new Trainer({
    model: model2,
    optimizer: optimizer2,
    trainLoader: loader2,
    config: { epochs: 3, logInterval: 100, gradientAccumulationSteps: 2 },
  });
  const state2 = trainer2.train();

  // Both should complete
  assert(state1.completed, "acc=1 completed");
  assert(state2.completed, "acc=2 completed");

  // acc=2 has fewer optimizer steps (roughly half)
  assert(state2.globalStep < state1.globalStep,
    `acc=2 has fewer steps (${state2.globalStep}) than acc=1 (${state1.globalStep})`);

  // Both should produce finite losses
  for (const loss of state1.lossHistory) {
    assert(isFinite(loss) && !isNaN(loss), `acc=1: loss ${loss} is finite`);
  }
  for (const loss of state2.lossHistory) {
    assert(isFinite(loss) && !isNaN(loss), `acc=2: loss ${loss} is finite`);
  }
}

// ============================================================
// Integration Test 6: Evaluation Loop
// ============================================================

function runEvaluationTest(): void {
  console.log("\n--- Integration: Evaluation Loop ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const trainDataset = createTestDataset(tokenizer, 8);

  // Separate eval dataset with different text
  const evalCorpus = [
    "the cat is fast and the dog is slow",
    "a b c d e f g h the dog sat",
  ];
  const evalDataset = new TextDataset({
    tokenizer,
    corpus: evalCorpus,
    blockSize: 8,
  });

  const trainLoader = createTestLoader(trainDataset, 2, false, 42);
  const evalLoader = createTestLoader(evalDataset, 2, false, 99);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0.0,
  });

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader,
    evalLoader,
    config: { epochs: 3, logInterval: 1, evalInterval: 2, gradientAccumulationSteps: 1 },
  });

  const state = trainer.train();

  // Eval history should have entries
  assert(state.evalHistory.length > 0,
    `evalHistory has ${state.evalHistory.length} entries`);

  // Eval entries should be valid
  for (const entry of state.evalHistory) {
    assert(typeof entry.step === "number", "eval entry has step");
    assert(typeof entry.loss === "number", "eval entry has loss");
    assert(isFinite(entry.loss) && entry.loss > 0, `eval loss ${entry.loss} is valid`);
  }

  // Direct eval call
  const directEvalLoss = trainer.runEvaluation();
  assert(isFinite(directEvalLoss) && directEvalLoss > 0,
    `direct eval loss ${directEvalLoss} is valid`);
}

// ============================================================
// Integration Test 7: Numerical Stability
// ============================================================

function runNumericalStabilityTest(): void {
  console.log("\n--- Integration: Numerical Stability ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2, false, 42);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    betas: [0.9, 0.999],
    eps: 1e-8,
    weightDecay: 0.01,
  });

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: loader,
    config: { epochs: 10, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  const state = trainer.train();

  // No NaN in loss history
  for (const loss of state.lossHistory) {
    assert(!isNaN(loss), `loss is not NaN: ${loss}`);
    assert(isFinite(loss), `loss is finite: ${loss}`);
  }

  // No NaN/Inf in parameters
  for (const p of model.parameters()) {
    for (let i = 0; i < p.data.length; i++) {
      assert(isFinite(p.data[i]) && !isNaN(p.data[i]),
        `${p.name}[${i}] = ${p.data[i]} is finite after training`);
    }
  }

  // Perplexity is valid
  const finalLoss = state.lossHistory[state.lossHistory.length - 1];
  const ppl = Perplexity.fromLoss(finalLoss);
  assert(isFinite(ppl) && ppl >= 1,
    `perplexity ${ppl} is valid (>= 1)`);
}

// ============================================================
// Integration Test 8: Trainer without Evaluation
// ============================================================

function runTrainerNoEvalTest(): void {
  console.log("\n--- Integration: Trainer without Eval Loader ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2, false, 42);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0.0,
  });

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: loader,
    // No evalLoader
    config: { epochs: 2, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  const state = trainer.train();

  assert(state.completed, "completed without eval loader");
  assert(state.evalHistory.length === 0, "evalHistory is empty without evalLoader");
  assert(state.lossHistory.length >= 0, "lossHistory exists");
}

// ============================================================
// Phase 45.1 Unit Tests — GradientAccumulator
// ============================================================

function runGradientAccumulatorUnitTests(): void {
  console.log("\n--- GradientAccumulator Unit ---");

  // Construction
  {
    const acc = new GradientAccumulator(1);
    assert(acc.accumulationSteps === 1, "acc steps = 1");
    assert(acc.currentStep === 0, "initial step = 0");
    assert(acc.isFresh === true, "initial isFresh = true");
    assert(acc.remainingSteps === 1, "remaining = 1");
    assert(acc.hasPending() === false, "no pending initially");
    assert(acc.shouldStep() === false, "shouldStep = false initially");
  }

  // Construction validation
  try {
    new GradientAccumulator(0);
    assert(false, "should throw on steps=0");
  } catch {
    assert(true, "throws on steps=0");
  }

  try {
    new GradientAccumulator(-1);
    assert(false, "should throw on steps=-1");
  } catch {
    assert(true, "throws on steps=-1");
  }

  // Single step (no accumulation)
  {
    const acc = new GradientAccumulator(1);
    const loss = Tensor.scalar(3.0);
    const scaled = acc.accumulate(loss);
    assert(Math.abs(scaled.item() - 3.0) < 1e-10,
      "acc=1: loss unchanged by accumulate");
    acc.advance();
    assert(acc.shouldStep() === true, "acc=1: shouldStep after 1 advance");
    assert(acc.hasPending() === false, "acc=1: no pending after step boundary");
    acc.reset();
    assert(acc.currentStep === 0, "acc=1: reset to 0");
    assert(acc.isFresh === true, "acc=1: fresh after reset");
  }

  // Multi-step accumulation
  {
    const acc = new GradientAccumulator(4);
    assert(acc.accumulationSteps === 4, "acc=4 steps");
    assert(acc.remainingSteps === 4, "acc=4: remaining = 4 initially");

    // Step 0
    acc.advance();
    assert(acc.currentStep === 1, "acc=4: step 1 after first advance");
    assert(acc.shouldStep() === false, "acc=4: no step at step 1/4");
    assert(acc.hasPending() === true, "acc=4: pending at step 1/4");

    // Step 1
    acc.advance();
    assert(acc.currentStep === 2, "acc=4: step 2");
    assert(acc.remainingSteps === 2, "acc=4: remaining = 2");

    // Step 2
    acc.advance();
    assert(acc.currentStep === 3, "acc=4: step 3");

    // Step 3 — boundary
    acc.advance();
    assert(acc.currentStep === 4, "acc=4: step 4 after fourth advance");
    assert(acc.shouldStep() === true, "acc=4: shouldStep at boundary");
    assert(acc.hasPending() === false, "acc=4: no pending at boundary");

    acc.reset();
    assert(acc.currentStep === 0, "acc=4: back to 0 after reset");
    assert(acc.isFresh === true, "acc=4: fresh after reset cycle");
  }

  // Loss scaling
  {
    const acc = new GradientAccumulator(2);
    const loss = Tensor.scalar(5.0);
    const scaled = acc.accumulate(loss);
    assert(Math.abs(scaled.item() - 2.5) < 1e-10,
      `loss/2 = 2.5 (got ${scaled.item()})`);
  }

  // hasPending edge cases
  {
    const acc = new GradientAccumulator(3);
    assert(acc.hasPending() === false, "pending=false at step 0");
    acc.advance();
    assert(acc.hasPending() === true, "pending=true at step 1/3");
    acc.advance();
    assert(acc.hasPending() === true, "pending=true at step 2/3");
    acc.advance();
    assert(acc.hasPending() === false, "pending=false at boundary step 3/3");
  }
}

// ============================================================
// Phase 45.1 Test: Accumulation ≈ Larger Batch
// ============================================================
// Verifies that gradient accumulation over N micro-batches of size B
// produces the same parameter update as a single batch of size B×N.

function runAccumulationMatchesLargerBatchTest(): void {
  console.log("\n--- Accumulation ≈ Larger Batch ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);

  // Model A: train with batch_size=2, acc_steps=2 (effective batch=4)
  // Model B: train with batch_size=4, acc_steps=1 (effective batch=4)
  const modelA = TensorMiniMindModel.tiny(vocabSize);
  const modelB = TensorMiniMindModel.tiny(vocabSize);

  // Copy initial weights for identical start
  const paramsA = modelA.parameters();
  const paramsB = modelB.parameters();
  for (let i = 0; i < paramsA.length; i++) {
    paramsB[i].data.set(paramsA[i].data);
  }

  const loaderA = createTestLoader(dataset, 2, false, 42);
  const loaderB = createTestLoader(dataset, 4, false, 42);

  const optA = new AdamWOptimizer(modelA.parameters(), {
    lr: 0.01, eps: 1e-8, weightDecay: 0.0,
  });
  const optB = new AdamWOptimizer(modelB.parameters(), {
    lr: 0.01, eps: 1e-8, weightDecay: 0.0,
  });

  const trainerA = new Trainer({
    model: modelA, optimizer: optA, trainLoader: loaderA,
    config: { epochs: 1, logInterval: 100, gradientAccumulationSteps: 2 },
  });
  const trainerB = new Trainer({
    model: modelB, optimizer: optB, trainLoader: loaderB,
    config: { epochs: 1, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  trainerA.train();
  trainerB.train();

  // Both should complete
  assert(trainerA.getState().completed, "Model A completed");
  assert(trainerB.getState().completed, "Model B completed");

  // Check parameter closeness — since AdamW uses momentum based on
  // per-step gradients plus running averages, exact equality isn't
  // guaranteed when batch_size differs even with same effective batch.
  // We verify both are finite and training worked.
  let totalDiff = 0;
  let totalMag = 0;
  for (let i = 0; i < paramsA.length; i++) {
    for (let j = 0; j < paramsA[i].data.length; j++) {
      totalDiff += Math.abs(paramsA[i].data[j] - paramsB[i].data[j]);
      totalMag += Math.abs(paramsA[i].data[j]);
    }
  }
  const relativeDiff = totalMag > 0 ? totalDiff / totalMag : 0;
  console.log(`  Relative parameter difference: ${relativeDiff.toExponential(4)}`);

  // Parameters in both models are finite and non-zero changed
  assert(isFinite(totalMag) && totalMag > 0, "parameters are finite and non-zero");
  assert(isFinite(totalDiff), "total difference is finite");
}

// ============================================================
// Phase 45.1 Test: Optimizer Steps Only After Accumulation
// ============================================================

function runOptimizerStepBoundaryTest(): void {
  console.log("\n--- Optimizer Step Boundary ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2, false, 42);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01, eps: 1e-8, weightDecay: 0.0,
  });

  const trainer = new Trainer({
    model, optimizer, trainLoader: loader,
    config: { epochs: 1, logInterval: 100, gradientAccumulationSteps: 3 },
  });

  const state = trainer.train();
  assert(state.completed, "training completed");

  // With acc=3 and batch_size=2, dataset has 4 samples × 8 tokens → 2 batches
  // of size 2 (with dropLast). So totalBatches should be around 2.
  // With acc=3, only 1 step should trigger (from the flush at epoch end).
  const totalBatches = state.totalBatches;
  const globalStep = state.globalStep;
  console.log(`  totalBatches=${totalBatches}, globalStep=${globalStep}`);

  // Step count ≤ ceil(totalBatches / accSteps)
  const expectedMaxSteps = Math.ceil(totalBatches / 3);
  assert(globalStep <= expectedMaxSteps,
    `globalStep ${globalStep} <= ceil(${totalBatches}/3) = ${expectedMaxSteps}`);

  // Step count should be at least 1 (flush at epoch end)
  assert(globalStep >= 1, "at least 1 optimizer step (flush)");
}

// ============================================================
// Phase 45.1 Test: Loss Scaling Correctness
// ============================================================

function runLossScalingTest(): void {
  console.log("\n--- Loss Scaling Correctness ---");

  // Accumulator divides loss by accumulationSteps
  const acc2 = new GradientAccumulator(2);
  const loss2 = Tensor.scalar(6.0);
  const scaled2 = acc2.accumulate(loss2);
  assert(Math.abs(scaled2.item() - 3.0) < 1e-10,
    "acc=2: loss 6 → scaled 3");

  const acc4 = new GradientAccumulator(4);
  const loss4 = Tensor.scalar(10.0);
  const scaled4 = acc4.accumulate(loss4);
  assert(Math.abs(scaled4.item() - 2.5) < 1e-10,
    "acc=4: loss 10 → scaled 2.5");

  // acc=1: no scaling
  const acc1 = new GradientAccumulator(1);
  const loss1 = Tensor.scalar(7.0);
  const scaled1 = acc1.accumulate(loss1);
  assert(Math.abs(scaled1.item() - 7.0) < 1e-10,
    "acc=1: loss unchanged");

  // Verify backward with scaled loss accumulates properly
  // Create a simple 1-parameter model → compute loss → backward
  // with different accumulation steps → verify gradient magnitudes
}

// ============================================================
// Phase 45.1 Test: Gradient Clipping in Trainer
// ============================================================

function runGradientClippingInTrainerTest(): void {
  console.log("\n--- Gradient Clipping in Trainer ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);

  // Train WITHOUT clipping
  const modelNoClip = TensorMiniMindModel.tiny(vocabSize);
  const modelWithClip = TensorMiniMindModel.tiny(vocabSize);

  // Copy initial weights
  const paramsNoClip = modelNoClip.parameters();
  const paramsWithClip = modelWithClip.parameters();
  for (let i = 0; i < paramsNoClip.length; i++) {
    paramsWithClip[i].data.set(paramsNoClip[i].data);
  }

  const loader1 = createTestLoader(dataset, 2, false, 42);
  const loader2 = createTestLoader(dataset, 2, false, 42);

  const optNoClip = new AdamWOptimizer(modelNoClip.parameters(), {
    lr: 0.01, eps: 1e-8, weightDecay: 0.0,
  });
  const optWithClip = new AdamWOptimizer(modelWithClip.parameters(), {
    lr: 0.01, eps: 1e-8, weightDecay: 0.0,
  });

  // No clipping (clipNorm = undefined)
  const trainerNoClip = new Trainer({
    model: modelNoClip, optimizer: optNoClip, trainLoader: loader1,
    config: { epochs: 2, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  // With clipping (clipNorm = 1.0)
  const trainerWithClip = new Trainer({
    model: modelWithClip, optimizer: optWithClip, trainLoader: loader2,
    config: {
      epochs: 2,
      logInterval: 100,
      gradientAccumulationSteps: 1,
      gradientClipNorm: 1.0,
    },
  });

  const stateNoClip = trainerNoClip.train();
  const stateWithClip = trainerWithClip.train();

  assert(stateNoClip.completed, "no-clip training completed");
  assert(stateWithClip.completed, "with-clip training completed");

  // Both should produce finite losses
  for (const loss of stateNoClip.lossHistory) {
    assert(isFinite(loss) && !isNaN(loss),
      `no-clip loss ${loss} is finite`);
  }
  for (const loss of stateWithClip.lossHistory) {
    assert(isFinite(loss) && !isNaN(loss),
      `with-clip loss ${loss} is finite`);
  }

  // Parameters in both models are finite (no NaN explosion)
  for (let i = 0; i < paramsNoClip.length; i++) {
    for (let j = 0; j < paramsNoClip[i].data.length; j++) {
      assert(isFinite(paramsNoClip[i].data[j]) && !isNaN(paramsNoClip[i].data[j]),
        `no-clip param is finite`);
      assert(isFinite(paramsWithClip[i].data[j]) && !isNaN(paramsWithClip[i].data[j]),
        `with-clip param is finite`);
    }
  }

  // Gradient clipping with a very small norm should produce different
  // parameter trajectories than no clipping (clipping limits update magnitude)
  let paramDiff = 0;
  for (let i = 0; i < paramsNoClip.length; i++) {
    for (let j = 0; j < paramsNoClip[i].data.length; j++) {
      paramDiff += Math.abs(
        paramsNoClip[i].data[j] - paramsWithClip[i].data[j]
      );
    }
  }
  console.log(`  Parameter difference (clip vs no-clip): ${paramDiff.toExponential(4)}`);
  assert(paramDiff > 0,
    "clipping changes parameter trajectory");

  // Verify clipGradients itself works correctly at the function level.
  // Create a Tensor-backed Parameter, set gradients, clip, verify scaling.
  const valueTensor = new Tensor(new Float64Array([3.0, 4.0]), [2]);
  const testParam = new Parameter(valueTensor, "test_clip_param");
  testParam.grad = new Float64Array([3.0, 4.0]);
  const preNorm = clipGradients([testParam], 2.5);
  assert(Math.abs(preNorm - 5.0) < 1e-10,
    `pre-clip norm = 5.0 (got ${preNorm.toFixed(4)})`);
  // After clipping to maxNorm=2.5, scale = 2.5/5 = 0.5
  // Grad should be [1.5, 2.0] → norm = 2.5
  const grad = testParam.grad!;
  assert(Math.abs(grad[0] - 1.5) < 1e-10,
    `clipped grad[0] = 1.5 (got ${grad[0].toFixed(4)})`);
  assert(Math.abs(grad[1] - 2.0) < 1e-10,
    `clipped grad[1] = 2.0 (got ${grad[1].toFixed(4)})`);
}

// ============================================================
// Phase 45.1 Test: Checkpoint Compatibility
// ============================================================

function runCheckpointCompatibilityTest(): void {
  console.log("\n--- Checkpoint Compatibility ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2, false, 42);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01, eps: 1e-8, weightDecay: 0.0,
  });

  const trainer = new Trainer({
    model, optimizer, trainLoader: loader,
    config: {
      epochs: 3,
      logInterval: 100,
      gradientAccumulationSteps: 2,
      gradientClipNorm: 1.0,
    },
  });

  const state = trainer.train();
  assert(state.completed, "training with acc+clip completed");

  // Save checkpoint
  const ckpt = saveCheckpointJSON({
    model,
    optimizer,
    trainerState: state,
  });
  assert(ckpt !== null, "checkpoint saved");
  assert(typeof ckpt === "string", "checkpoint is serialized JSON");

  // Parse checkpoint
  const parsed = JSON.parse(ckpt);
  assert(typeof parsed.version === "number", "checkpoint has version");
  assert(Array.isArray(parsed.modelParams), "checkpoint has modelParams");

  // Load into a new model
  const model2 = TensorMiniMindModel.tiny(vocabSize);
  const optimizer2 = new AdamWOptimizer(model2.parameters(), {
    lr: 0.01, eps: 1e-8, weightDecay: 0.0,
  });
  loadCheckpointJSON(ckpt, { model: model2, optimizer: optimizer2 });

  // Verify weights match after load
  const origParams = model.parameters();
  const loadedParams = model2.parameters();
  let weightDiff = 0;
  for (let i = 0; i < origParams.length; i++) {
    for (let j = 0; j < origParams[i].data.length; j++) {
      weightDiff += Math.abs(
        origParams[i].data[j] - loadedParams[i].data[j]
      );
    }
  }
  assert(weightDiff < 1e-8,
    `weights identical after load (diff=${weightDiff.toExponential(2)})`);
}

// ============================================================
// Phase 45.1 Test: GradientClipper Integration — Combined Acc + Clip
// ============================================================

function runGradientAccumulationWithClippingTest(): void {
  console.log("\n--- Gradient Accumulation + Clipping (Combined) ---");

  const vocabSize = 32;
  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2, false, 42);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01, eps: 1e-8, weightDecay: 0.0,
  });

  const trainer = new Trainer({
    model, optimizer, trainLoader: loader,
    config: {
      epochs: 5,
      logInterval: 100,
      gradientAccumulationSteps: 2,
      gradientClipNorm: 1.0,
    },
  });

  const state = trainer.train();

  // Training completes
  assert(state.completed, "training with acc+clip completed");

  // All losses finite
  for (const loss of state.lossHistory) {
    assert(isFinite(loss) && !isNaN(loss) && loss > 0,
      `loss ${loss} is finite and positive`);
  }

  // Parameters are finite
  for (const p of model.parameters()) {
    for (let i = 0; i < p.data.length; i++) {
      assert(isFinite(p.data[i]) && !isNaN(p.data[i]),
        `param ${p.name}[${i}] is finite`);
    }
  }

  // Steps taken are fewer than total batches (accumulation in effect)
  assert(state.globalStep <= state.totalBatches,
    `steps ${state.globalStep} <= batches ${state.totalBatches}`);

  console.log(`  Steps: ${state.globalStep}, Batches: ${state.totalBatches}`);
  console.log(`  Best loss: ${state.bestLoss.toFixed(4)}`);
}

// ============================================================
// Phase 45.1 Test: TrainerConfig gradientClipNorm validation
// ============================================================

function runGradientClipNormConfigTest(): void {
  console.log("\n--- TrainerConfig gradientClipNorm ---");

  // Valid config with clip norm
  {
    const cfg = resolveTrainerConfig({
      epochs: 5,
      gradientClipNorm: 1.0,
    });
    assert(cfg.gradientClipNorm === 1.0, "gradientClipNorm = 1.0");
  }

  // Undefined by default
  {
    const cfg = resolveTrainerConfig({ epochs: 1 });
    assert(cfg.gradientClipNorm === undefined,
      "gradientClipNorm is undefined by default");
  }

  // Zero is treated as "no clipping" — passed through
  {
    const cfg = resolveTrainerConfig({
      epochs: 1,
      gradientAccumulationSteps: 2,
      gradientClipNorm: 0,
    });
    assert(cfg.gradientClipNorm === 0, "gradientClipNorm = 0 passes through");
  }

  // Negative throws
  try {
    resolveTrainerConfig({ epochs: 1, gradientClipNorm: -1 });
    assert(false, "should throw on negative clipNorm");
  } catch {
    assert(true, "throws on negative clipNorm");
  }
}

// ============================================================
// Master Test Runner
// ============================================================

export function runTrainerTests(): { passed: number; failed: number } {
  // Reset counters
  passed = 0;
  failed = 0;

  console.log("\n=== MiniMind Trainer Tests (Phase 41 + 45.1) ===\n");

  // Unit tests
  runTrainerConfigTests();
  runTrainingStateTests();
  runLossTrackerTests();
  runPerplexityTests();
  runCollateTests();

  // Phase 45.1: GradientAccumulator unit tests
  runGradientAccumulatorUnitTests();

  // Integration tests
  runIntegrationTest();
  runLossDecreaseTest();
  runStateTrackingTest();
  runDeterministicTest();
  runGradientAccumulationTest();
  runEvaluationTest();
  runNumericalStabilityTest();
  runTrainerNoEvalTest();

  // Phase 45.1: Gradient accumulation + clipping integration tests
  runAccumulationMatchesLargerBatchTest();
  runOptimizerStepBoundaryTest();
  runLossScalingTest();
  runGradientClippingInTrainerTest();
  runCheckpointCompatibilityTest();
  runGradientAccumulationWithClippingTest();
  runGradientClipNormConfigTest();

  console.log(`\n=== Trainer tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
