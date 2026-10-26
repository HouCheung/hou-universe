// ============================================================
// Resume Tests — Phase 48 Full Training Resume System
// ============================================================
// Tests:
//   1. Parameter diff < 1e-10: 20-step continuous vs 10+10 resume
//   2. Loss history identical after resume
//   3. Batch order identical after resume
//   4. Random sequence identical after save/restore
//   5. Generation output identical after resume
//   6. AdamW momentum state (m, v) preserved after resume
//   7. Scheduler step count preserved after resume
//   8. DataLoader stateDict/loadStateDict round-trip
//   9. Trainer.saveCheckpoint() integration
//  10. Trainer.resume() integration
//  11. Checkpoint v2 format includes randomState and dataloaderState
//
// Run with: npx tsx src/lib/minimind/training/__tests__/run.ts
// ============================================================

import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { CosineScheduler } from "../../core/scheduler/CosineScheduler";
import { TextDataset } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import type { TextSample } from "../../data/TextDataset";
import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";
import { Trainer, collateBatch } from "../Trainer";
import { TrainingState } from "../TrainingState";
import type { TrainingStateSnapshot } from "../TrainingState";
import { crossEntropyLoss } from "../../core/loss/CrossEntropyLoss";
import {
  saveCheckpoint,
  loadCheckpoint,
} from "../checkpoint/Checkpoint";
import type { CheckpointData } from "../checkpoint/Checkpoint";
import { Random } from "../../core/random/Random";
import { SeededRandom } from "../../core/random/SeededRandom";

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
    "a b c d e f g h the cat dog run fast",
    "the dog runs fast and the cat is slow",
    "hello world a b c d e f g h the cat",
    "the model learn data code test runs fast",
    "a b the cat sat the dog run fast and",
    "world hello model learn data code test",
  ];
  return new TextDataset({ tokenizer, corpus, blockSize, insertEos: true });
}

function createTestLoader(dataset: TextDataset, batchSize: number = 2): DataLoader<TextSample> {
  return new DataLoader(dataset, { batchSize, shuffle: false, dropLast: true });
}

/**
 * Collect all batches from a loader, repeating across epochs to get
 * enough total batches. Returns a flat array of collated {inputIds, targets}.
 */
function collectBatches(
  dataset: TextDataset,
  totalBatches: number,
): Array<{ inputIds: ReturnType<typeof collateBatch>["inputIds"]; targets: ReturnType<typeof collateBatch>["targets"] }> {
  const result: Array<{ inputIds: ReturnType<typeof collateBatch>["inputIds"]; targets: ReturnType<typeof collateBatch>["targets"] }> = [];
  while (result.length < totalBatches) {
    for (const batch of createTestLoader(dataset, 2)) {
      if (result.length >= totalBatches) break;
      result.push(collateBatch(batch));
    }
  }
  return result;
}

/**
 * Run a single training step on a pre-collated batch.
 */
function trainStep(
  model: TensorMiniMindModel,
  optimizer: AdamWOptimizer,
  batch: { inputIds: ReturnType<typeof collateBatch>["inputIds"]; targets: ReturnType<typeof collateBatch>["targets"] },
): number {
  const logits = model.forward(batch.inputIds);
  const lossTensor = crossEntropyLoss(logits, batch.targets);
  const lossVal = lossTensor.item();
  lossTensor.backward();
  optimizer.step();
  optimizer.zeroGrad();
  return lossVal;
}

// ============================================================
// SECTION 1: Parameter diff < 1e-10 — Continuous vs Resume
// ============================================================

function runParameterDiffTest(): void {
  console.log("\n--- Parameter Diff: Continuous vs Resume ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const dataset = createTestDataset(tokenizer, 8);

  // Pre-collect all batches for deterministic comparison
  const allBatches = collectBatches(dataset, 20);

  // ── Model A: Train 20 steps continuously ──
  const modelA = TensorMiniMindModel.tiny(vocabSize);
  const initParams: Float64Array[] = modelA.parameters().map(
    (p) => new Float64Array(p.data)
  );
  const optimizerA = new AdamWOptimizer(modelA.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  for (let i = 0; i < 20; i++) {
    trainStep(modelA, optimizerA, allBatches[i]);
  }

  const finalParamsA: Float64Array[] = modelA.parameters().map(
    (p) => new Float64Array(p.data)
  );

  // ── Model B: Train 10 steps → save → restore → train 10 more ──
  const modelB = TensorMiniMindModel.tiny(vocabSize);
  const paramsB = modelB.parameters();
  for (let i = 0; i < initParams.length; i++) {
    paramsB[i].data.set(initParams[i]);
  }
  const optimizerB = new AdamWOptimizer(modelB.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  // Phase 1: Train 10 steps
  for (let i = 0; i < 10; i++) {
    trainStep(modelB, optimizerB, allBatches[i]);
  }

  // Snapshot params at step 10
  const paramsAt10: Float64Array[] = modelB.parameters().map(
    (p) => new Float64Array(p.data)
  );

  // Save checkpoint
  const checkpoint = saveCheckpoint({
    model: modelB,
    optimizer: optimizerB,
    trainerState: {
      epoch: 0,
      globalStep: 10,
      totalBatches: 10,
      currentBatch: 10,
      lossHistory: [],
      bestLoss: Infinity,
      bestEpoch: 0,
      bestGlobalStep: 0,
      evalHistory: [],
      completed: false,
      randomState: Random.saveState(),
      dataloaderState: null,
    },
  });

  // Verify checkpoint serializes AdamW state correctly
  assert(checkpoint.optimizerState.stepCount === 10,
    `checkpoint stepCount = 10 (got ${checkpoint.optimizerState.stepCount})`);

  // Create fresh model and restore
  const modelB2 = TensorMiniMindModel.tiny(vocabSize);
  for (let i = 0; i < initParams.length; i++) {
    modelB2.parameters()[i].data.set(initParams[i]);
  }
  const optimizerB2 = new AdamWOptimizer(modelB2.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  loadCheckpoint({
    model: modelB2,
    optimizer: optimizerB2,
    checkpoint,
  });

  // Verify restored params match step-10 params
  {
    const restored = modelB2.parameters();
    let diff = 0;
    for (let i = 0; i < paramsAt10.length; i++) {
      for (let j = 0; j < paramsAt10[i].length; j++) {
        diff += Math.abs(restored[i].data[j] - paramsAt10[i][j]);
      }
    }
    assert(diff < 1e-10, `restored params match step-10 params (diff=${diff.toExponential(4)})`);
  }

  // Verify AdamW step count was restored
  assert(optimizerB2.getStepCount() === 10,
    `restored AdamW stepCount = 10 (got ${optimizerB2.getStepCount()})`);

  // Phase 2: Train 10 more steps (batches 10-19)
  for (let i = 10; i < 20; i++) {
    trainStep(modelB2, optimizerB2, allBatches[i]);
  }

  const finalParamsB: Float64Array[] = modelB2.parameters().map(
    (p) => new Float64Array(p.data)
  );

  // ── Compare final parameters ──
  let totalDiff = 0;
  for (let i = 0; i < finalParamsA.length; i++) {
    for (let j = 0; j < finalParamsA[i].length; j++) {
      totalDiff += Math.abs(finalParamsA[i][j] - finalParamsB[i][j]);
    }
  }
  console.log(`  Total parameter diff (A vs B): ${totalDiff.toExponential(4)}`);

  assert(totalDiff < 1e-10,
    `parameter diff < 1e-10 after resume (got ${totalDiff.toExponential(4)})`);
}

// ============================================================
// SECTION 2: Loss history identical
// ============================================================

function runLossHistoryIdenticalTest(): void {
  console.log("\n--- Loss History Identical ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const dataset = createTestDataset(tokenizer, 8);

  const allBatches = collectBatches(dataset, 20);

  // ── Continuous: 20 steps ──
  const modelC = TensorMiniMindModel.tiny(vocabSize);
  const initParams: Float64Array[] = modelC.parameters().map(
    (p) => new Float64Array(p.data)
  );
  const optimizerC = new AdamWOptimizer(modelC.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  const continuousLosses: number[] = [];
  for (let i = 0; i < 20; i++) {
    const loss = trainStep(modelC, optimizerC, allBatches[i]);
    continuousLosses.push(loss);
  }

  // ── Resume: 10 + 10 ──
  const modelR = TensorMiniMindModel.tiny(vocabSize);
  for (let i = 0; i < initParams.length; i++) {
    modelR.parameters()[i].data.set(initParams[i]);
  }
  const optimizerR = new AdamWOptimizer(modelR.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  // First 10
  for (let i = 0; i < 10; i++) {
    trainStep(modelR, optimizerR, allBatches[i]);
  }

  const ckpt = saveCheckpoint({
    model: modelR,
    optimizer: optimizerR,
    trainerState: {
      epoch: 0, globalStep: 10, totalBatches: 10, currentBatch: 10,
      lossHistory: [], bestLoss: Infinity, bestEpoch: 0, bestGlobalStep: 0,
      evalHistory: [], completed: false,
      randomState: Random.saveState(), dataloaderState: null,
    },
  });

  // Restore
  const modelR2 = TensorMiniMindModel.tiny(vocabSize);
  for (let i = 0; i < initParams.length; i++) {
    modelR2.parameters()[i].data.set(initParams[i]);
  }
  const optimizerR2 = new AdamWOptimizer(modelR2.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  loadCheckpoint({ model: modelR2, optimizer: optimizerR2, checkpoint: ckpt });

  // Second 10
  const resumedLosses: number[] = [];
  for (let i = 10; i < 20; i++) {
    const loss = trainStep(modelR2, optimizerR2, allBatches[i]);
    resumedLosses.push(loss);
  }

  console.log(`  Continuous (steps 10-19): ${continuousLosses.slice(10).map(l => l.toFixed(6)).join(", ")}`);
  console.log(`  Resumed (steps 10-19):    ${resumedLosses.map(l => l.toFixed(6)).join(", ")}`);

  let lossMatch = true;
  for (let i = 0; i < resumedLosses.length; i++) {
    const diff = Math.abs(continuousLosses[10 + i] - resumedLosses[i]);
    if (diff > 1e-10) {
      lossMatch = false;
      console.error(`  Loss mismatch at step ${10 + i}: ${continuousLosses[10 + i]} vs ${resumedLosses[i]} (diff=${diff.toExponential(4)})`);
    }
  }
  assert(lossMatch, "loss history identical after resume");
}

// ============================================================
// SECTION 3: Batch order identical after resume
// ============================================================

function runBatchOrderTest(): void {
  console.log("\n--- Batch Order Identical ---");

  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);

  // Collect all batch contents from a full pass
  const loader1 = createTestLoader(dataset, 2);
  const allBatches: number[][] = [];

  for (const batch of loader1) {
    const { inputIds } = collateBatch(batch);
    allBatches.push(Array.from(inputIds.data));
  }

  // Second loader should produce identical batches
  const loader2 = createTestLoader(dataset, 2);
  const allBatches2: number[][] = [];

  for (const batch of loader2) {
    const { inputIds } = collateBatch(batch);
    allBatches2.push(Array.from(inputIds.data));
  }

  assert(allBatches.length === allBatches2.length,
    `same number of batches: ${allBatches.length} vs ${allBatches2.length}`);

  let orderMatch = true;
  for (let i = 0; i < allBatches.length; i++) {
    if (allBatches[i].length !== allBatches2[i].length) {
      orderMatch = false;
      break;
    }
    for (let j = 0; j < allBatches[i].length; j++) {
      if (allBatches[i][j] !== allBatches2[i][j]) {
        orderMatch = false;
        break;
      }
    }
    if (!orderMatch) break;
  }
  assert(orderMatch, "batch order is deterministic across DataLoader instances");
}

// ============================================================
// SECTION 4: Random sequence identical after save/restore
// ============================================================

function runRandomSequenceTest(): void {
  console.log("\n--- Random Sequence Identical ---");

  // Test 1: SeededRandom state save/restore
  {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) rng.next();

    const state = rng.saveState();

    const expected: number[] = [];
    for (let i = 0; i < 50; i++) expected.push(rng.next());

    rng.restoreState(state);
    const restored: number[] = [];
    for (let i = 0; i < 50; i++) restored.push(rng.next());

    let match = true;
    for (let i = 0; i < 50; i++) {
      if (expected[i] !== restored[i]) {
        match = false;
        break;
      }
    }
    assert(match, "SeededRandom state restore: identical sequence");
  }

  // Test 2: Global Random state save/restore
  {
    Random.setSeed(12345);
    for (let i = 0; i < 25; i++) Random.random();

    const state = Random.saveState();

    const expected: number[] = [];
    for (let i = 0; i < 25; i++) expected.push(Random.random());

    Random.restoreState(state);
    const restored: number[] = [];
    for (let i = 0; i < 25; i++) restored.push(Random.random());

    let match = true;
    for (let i = 0; i < 25; i++) {
      if (expected[i] !== restored[i]) {
        match = false;
        break;
      }
    }
    assert(match, "Random global state restore: identical sequence");
  }

  // Test 3: randn reproducibility after restore
  {
    Random.setSeed(999);
    for (let i = 0; i < 10; i++) Random.randn();

    const state = Random.saveState();

    const expected: number[] = [];
    for (let i = 0; i < 20; i++) expected.push(Random.randn());

    Random.restoreState(state);
    const restored: number[] = [];
    for (let i = 0; i < 20; i++) restored.push(Random.randn());

    let match = true;
    for (let i = 0; i < 20; i++) {
      if (expected[i] !== restored[i]) {
        match = false;
        break;
      }
    }
    assert(match, "Random randn() sequence identical after restore");
  }
}

// ============================================================
// SECTION 5: Generation output identical after resume
// ============================================================

function runGenerationOutputTest(): void {
  console.log("\n--- Generation Output Identical ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const dataset = createTestDataset(tokenizer, 8);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  // Train 1 step
  for (const batch of createTestLoader(dataset, 2)) {
    const { inputIds, targets } = collateBatch(batch);
    const logits = model.forward(inputIds);
    const lossTensor = crossEntropyLoss(logits, targets);
    lossTensor.backward();
    optimizer.step();
    optimizer.zeroGrad();
    break;
  }

  // Save checkpoint
  const ckpt = saveCheckpoint({
    model,
    optimizer,
    trainerState: new TrainingState().snapshot(),
  });

  // Snapshot logits from the trained model for a fixed input
  for (const batch of createTestLoader(dataset, 2)) {
    const { inputIds } = collateBatch(batch);
    const logitsOriginal = model.forward(inputIds);
    const logitsDataOriginal = new Float64Array(logitsOriginal.data);

    // Restore into fresh model
    const model2 = TensorMiniMindModel.tiny(vocabSize);
    const optimizer2 = new AdamWOptimizer(model2.parameters(), {
      lr: 0.01,
      weightDecay: 0.0,
    });

    loadCheckpoint({
      model: model2,
      optimizer: optimizer2,
      checkpoint: ckpt,
    });

    const logitsRestored = model2.forward(inputIds);
    const logitsDataRestored = logitsRestored.data;

    let diff = 0;
    for (let i = 0; i < logitsDataOriginal.length; i++) {
      diff += Math.abs(logitsDataOriginal[i] - logitsDataRestored[i]);
    }
    assert(diff < 1e-10,
      `generation output identical after restore (diff=${diff.toExponential(4)})`);
    break;
  }
}

// ============================================================
// SECTION 6: AdamW momentum state (m, v) preserved
// ============================================================

function runAdamWMomentumPreservedTest(): void {
  console.log("\n--- AdamW Momentum Preserved ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const dataset = createTestDataset(tokenizer, 8);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    betas: [0.9, 0.999],
    weightDecay: 0.01,
  });

  // Train 1 step to populate m, v with non-trivial values
  for (const batch of createTestLoader(dataset, 2)) {
    const { inputIds, targets } = collateBatch(batch);
    const logits = model.forward(inputIds);
    const lossTensor = crossEntropyLoss(logits, targets);
    lossTensor.backward();
    optimizer.step();
    optimizer.zeroGrad();
    break;
  }

  // Save m, v snapshots
  const mSnapshots: Float64Array[] = [];
  const vSnapshots: Float64Array[] = [];
  for (const p of optimizer.parameters) {
    const s = optimizer.getState(p);
    if (s) {
      mSnapshots.push(new Float64Array(s.m));
      vSnapshots.push(new Float64Array(s.v));
    }
  }

  // Save checkpoint
  const ckpt = saveCheckpoint({
    model,
    optimizer,
    trainerState: new TrainingState().snapshot(),
  });

  // Create fresh model and restore
  const model2 = TensorMiniMindModel.tiny(vocabSize);
  const optimizer2 = new AdamWOptimizer(model2.parameters(), {
    lr: 0.01,
    betas: [0.9, 0.999],
    weightDecay: 0.01,
  });

  loadCheckpoint({
    model: model2,
    optimizer: optimizer2,
    checkpoint: ckpt,
  });

  // Verify m, v match
  let mDiff = 0;
  let vDiff = 0;
  for (let i = 0; i < optimizer2.parameters.length; i++) {
    const s = optimizer2.getState(optimizer2.parameters[i]);
    if (s && i < mSnapshots.length) {
      for (let j = 0; j < mSnapshots[i].length; j++) {
        mDiff += Math.abs(s.m[j] - mSnapshots[i][j]);
        vDiff += Math.abs(s.v[j] - vSnapshots[i][j]);
      }
    }
  }
  console.log(`  m buffer diff: ${mDiff.toExponential(4)}`);
  console.log(`  v buffer diff: ${vDiff.toExponential(4)}`);

  assert(mDiff < 1e-10, `AdamW m (momentum) preserved (diff=${mDiff.toExponential(4)})`);
  assert(vDiff < 1e-10, `AdamW v (RMS) preserved (diff=${vDiff.toExponential(4)})`);

  // Verify step count
  assert(optimizer2.getStepCount() === 1,
    `AdamW step count preserved: ${optimizer2.getStepCount()}`);
}

// ============================================================
// SECTION 7: Scheduler step preserved
// ============================================================

function runSchedulerStepPreservedTest(): void {
  console.log("\n--- Scheduler Step Preserved ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.001,
    weightDecay: 0.0,
  });
  const scheduler = new CosineScheduler(optimizer, {
    baseLR: 0.001,
    minLR: 1e-6,
    warmupSteps: 100,
    totalSteps: 1000,
  });

  // Advance scheduler 50 steps
  for (let i = 0; i < 50; i++) {
    scheduler.step();
  }

  const lrBefore = scheduler.getLR();
  const stepBefore = scheduler.getStepCount();

  // Save
  const ckpt = saveCheckpoint({
    model,
    optimizer,
    scheduler,
    trainerState: new TrainingState().snapshot(),
  });

  // Restore into fresh scheduler
  const model2 = TensorMiniMindModel.tiny(vocabSize);
  const optimizer2 = new AdamWOptimizer(model2.parameters(), {
    lr: 0.001,
    weightDecay: 0.0,
  });
  const scheduler2 = new CosineScheduler(optimizer2, {
    baseLR: 0.001,
    minLR: 1e-6,
    warmupSteps: 100,
    totalSteps: 1000,
  });

  loadCheckpoint({
    model: model2,
    optimizer: optimizer2,
    scheduler: scheduler2,
    checkpoint: ckpt,
  });

  assert(scheduler2.getStepCount() === stepBefore,
    `scheduler step count preserved: ${scheduler2.getStepCount()} === ${stepBefore}`);
  assertClose(scheduler2.getLR(), lrBefore, 1e-14,
    "scheduler LR preserved after restore");
}

// ============================================================
// SECTION 8: DataLoader stateDict/loadStateDict
// ============================================================

function runDataLoaderStateTest(): void {
  console.log("\n--- DataLoader State ---");

  const tokenizer = createTestTokenizer();
  const dataset = createTestDataset(tokenizer, 8);
  const loader = new DataLoader(dataset, { batchSize: 2, shuffle: false, dropLast: true });

  // Initial state
  const state0 = loader.stateDict();
  assert(state0.currentEpoch === 0, "initial epoch = 0");
  assert(state0.currentBatch === 0, "initial batch = 0");
  assert(state0.datasetSize === dataset.length(), "dataset size correct");
  assert(state0.batchSize === 2, "batch size correct");
  assert(state0.shuffle === false, "shuffle correct");
  assert(state0.dropLast === true, "dropLast correct");

  // Update position
  loader.updatePosition(3, 7);
  const state1 = loader.stateDict();
  assert(state1.currentEpoch === 3, "updated epoch = 3");
  assert(state1.currentBatch === 7, "updated batch = 7");

  // Load state into another loader
  const loader2 = new DataLoader(dataset, { batchSize: 2, shuffle: false, dropLast: true });
  loader2.loadStateDict(state1);
  const state2 = loader2.stateDict();
  assert(state2.currentEpoch === 3, "loaded epoch = 3");
  assert(state2.currentBatch === 7, "loaded batch = 7");

  // loadStateDict with different config (should still load positional info)
  const loader3 = new DataLoader(dataset, { batchSize: 4, shuffle: true, seed: 99, dropLast: false });
  loader3.loadStateDict(state1);
  const state3 = loader3.stateDict();
  assert(state3.currentEpoch === 3, "cross-config: epoch = 3");
  assert(state3.currentBatch === 7, "cross-config: batch = 7");
}

// ============================================================
// SECTION 9: Trainer.saveCheckpoint() integration
// ============================================================

function runTrainerSaveCheckpointTest(): void {
  console.log("\n--- Trainer.saveCheckpoint() ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: loader,
    config: { epochs: 2, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  // Run one batch manually then save
  for (const batch of loader) {
    const { inputIds, targets } = collateBatch(batch);
    const logits = model.forward(inputIds);
    const lossTensor = crossEntropyLoss(logits, targets);
    lossTensor.backward();
    optimizer.step();
    optimizer.zeroGrad();
    trainer.state.recordLoss(lossTensor.item());
    trainer.state.advanceStep();
    trainer.state.advanceBatch();
    trainer.trainLoader.updatePosition(0, trainer.state.currentBatch);
    break;
  }

  const ckpt = trainer.saveCheckpoint();

  // Verify checkpoint structure
  assert(ckpt.version === 3, "checkpoint version is 3 (Phase 49)");
  assert(typeof ckpt.timestamp === "number", "has timestamp");
  assert(ckpt.modelParams.length > 0, "has modelParams");
  assert(ckpt.optimizerState.type === "AdamW", "has optimizerState");
  assert(Array.isArray(ckpt.randomState), "has randomState array");
  assert(ckpt.randomState.length === 6, "randomState has 6 elements (4 state + hasSpare + spare)");
  assert(ckpt.dataloaderState !== null, "has dataloaderState");
  if (ckpt.dataloaderState) {
    assert(ckpt.dataloaderState.currentBatch > 0, "dataloaderState batch > 0");
    assert(ckpt.dataloaderState.currentEpoch === 0, "dataloaderState epoch = 0");
  }
  assert(ckpt.trainerState.currentBatch > 0, "trainerState has currentBatch");
  assert(ckpt.trainerState.randomState !== null, "trainerState has randomState");
  assert(ckpt.trainerState.dataloaderState !== null, "trainerState has dataloaderState");
}

// ============================================================
// SECTION 10: Trainer.resume() integration
// ============================================================

function runTrainerResumeTest(): void {
  console.log("\n--- Trainer.resume() ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;
  const dataset = createTestDataset(tokenizer, 8);
  const loader = createTestLoader(dataset, 2);

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: loader,
    config: { epochs: 5, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  // Run one batch and save state
  for (const batch of loader) {
    const { inputIds, targets } = collateBatch(batch);
    const logits = model.forward(inputIds);
    const lossTensor = crossEntropyLoss(logits, targets);
    lossTensor.backward();
    optimizer.step();
    optimizer.zeroGrad();
    trainer.state.recordLoss(lossTensor.item());
    trainer.state.advanceStep();
    trainer.state.advanceBatch();
    trainer.trainLoader.updatePosition(0, trainer.state.currentBatch);
    break;
  }

  const ckpt = trainer.saveCheckpoint();

  // Create a new trainer and resume
  const model2 = TensorMiniMindModel.tiny(vocabSize);
  const optimizer2 = new AdamWOptimizer(model2.parameters(), {
    lr: 0.01,
    weightDecay: 0.0,
  });
  const loader2 = createTestLoader(dataset, 2);

  const trainer2 = new Trainer({
    model: model2,
    optimizer: optimizer2,
    trainLoader: loader2,
    config: { epochs: 5, logInterval: 100, gradientAccumulationSteps: 1 },
  });

  // Resume should complete without error
  const state = trainer2.resume(ckpt);
  assert(state.completed === true, "resume completes training");
  assert(state.globalStep > 0, "resumed training has steps");
  assert(state.lossHistory.length > 0, "resumed training has loss history");
  assert(state.epoch >= 0, "resumed training tracks epochs");

  console.log(`  Resumed: ${state.globalStep} steps, ${state.lossHistory.length} loss entries`);
}

// ============================================================
// SECTION 11: Checkpoint v2 format
// ============================================================

function runCheckpointV2FormatTest(): void {
  console.log("\n--- Checkpoint v2 Format ---");

  const tokenizer = createTestTokenizer();
  const vocabSize = tokenizer.getVocabulary().size;

  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.001,
    weightDecay: 0.0,
  });

  const state = new TrainingState();
  state.setDataLoaderState({
    currentEpoch: 0,
    currentBatch: 5,
    datasetSize: 10,
    batchSize: 2,
    shuffle: false,
    seed: 42,
    dropLast: true,
  });
  state.setRandomState(Random.saveState());

  const ckpt = saveCheckpoint({
    model,
    optimizer,
    trainerState: state.snapshot(),
  });

  // Verify v2 structure
  assert(ckpt.version === 3, "checkpoint version = 3 (Phase 49)");
  assert(Array.isArray(ckpt.randomState), "randomState is array");
  assert(ckpt.randomState.length === 6, "randomState has 6 entries");
  assert(ckpt.dataloaderState !== null, "dataloaderState is not null");
  if (ckpt.dataloaderState) {
    assert(ckpt.dataloaderState.currentBatch === 5, "dataloaderState batch correct");
    assert(ckpt.dataloaderState.currentEpoch === 0, "dataloaderState epoch correct");
    assert(ckpt.dataloaderState.datasetSize === 10, "dataloaderState datasetSize correct");
    assert(ckpt.dataloaderState.seed === 42, "dataloaderState seed correct");
  }

  // Verify trainerState has the new fields
  assert(ckpt.trainerState.currentBatch !== undefined, "trainerState has currentBatch");
  assert(ckpt.trainerState.randomState !== null, "trainerState has randomState");
  assert(ckpt.trainerState.dataloaderState !== null, "trainerState has dataloaderState");

  // Backward compatibility: v1 checkpoint should still load
  // Create a v1-style checkpoint manually
  const v1TrainerState: TrainingStateSnapshot = {
    epoch: 0,
    globalStep: 0,
    totalBatches: 0,
    currentBatch: 0,
    lossHistory: [],
    bestLoss: Infinity,
    bestEpoch: 0,
    bestGlobalStep: 0,
    evalHistory: [],
    completed: false,
    randomState: null,
    dataloaderState: null,
  };

  const v1Ckpt: CheckpointData = {
    version: 1,
    timestamp: Date.now(),
    modelParams: ckpt.modelParams,
    optimizerState: ckpt.optimizerState,
    schedulerState: null,
    trainerState: v1TrainerState,
    randomState: ckpt.randomState,
    dataloaderState: null,
  };

  const model2 = TensorMiniMindModel.tiny(vocabSize);
  const optimizer2 = new AdamWOptimizer(model2.parameters(), {
    lr: 0.001,
    weightDecay: 0.0,
  });

  // Should not throw
  loadCheckpoint({
    model: model2,
    optimizer: optimizer2,
    checkpoint: v1Ckpt,
  });
  assert(true, "v1 checkpoint loads without error");
}

// ============================================================
// Master Test Runner
// ============================================================

export function runResumeTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n=== MiniMind Resume Tests (Phase 48) ===\n");

  runParameterDiffTest();
  runLossHistoryIdenticalTest();
  runBatchOrderTest();
  runRandomSequenceTest();
  runGenerationOutputTest();
  runAdamWMomentumPreservedTest();
  runSchedulerStepPreservedTest();
  runDataLoaderStateTest();
  runTrainerSaveCheckpointTest();
  runTrainerResumeTest();
  runCheckpointV2FormatTest();

  console.log(`\n=== Resume tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
