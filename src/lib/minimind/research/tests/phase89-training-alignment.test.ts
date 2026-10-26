// ============================================================
// Phase 89 — Corrected 1-step Training Objective (Regression)
// ============================================================
// Phase 88 confirmed a DOUBLE SHIFT in the production training
// objective: TextDataset pre-shifts targetIds by 1, then
// crossEntropyLoss internally shifts again (targets[b][s+1]),
// so logits[s] was trained to predict token[s+2] (2-step ahead)
// while the capability evaluator measures 1-step next-token.
//
// Phase 89 fixes ONLY the training-loop call: crossEntropyLoss
// receives the UN-shifted input tokens as targets, so its single
// internal shift yields exactly logits[s] -> token[s+1].
//
// This suite proves, from real code:
//   1. the production training path passes UN-shifted input as
//      the criterion targets (no double-shift) — FAILS pre-fix
//   2. a known synthetic sequence demonstrates the intended
//      1-step alignment of crossEntropyLoss
//   3. the training path and crossEntropyLoss agree on the
//      corrected target alignment — FAILS pre-fix
//   4. checkpoint metadata remains valid (format untouched)
//   5. dataset identity/version remain unchanged (v0.3.0 / 600)
//   6. the corrected training path is reproducible (seed 42)
//   7. no architecture / evaluator / threshold changes
//
// Existing Phase 57–88 suites are NOT modified or weakened.
// ============================================================

// ============================================================
// Imports
// ============================================================

import {
  getProductionModelConfig,
  PRODUCTION_VOCAB_TARGET,
  parameterCountOf,
} from "../../experiments/ModelRegistry";

import {
  loadProductionDataset,
  getDatasetTexts,
  computeBaseStatistics,
} from "../../data/datasetLoader";

import { resolveTrainingDataset } from "../../data/datasetRegistry";

import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";
import { TextDataset } from "../../data/TextDataset";
import type { TextSample } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { Trainer, collateBatch } from "../../training/Trainer";
import { Random } from "../../core/random/Random";
import { Tensor } from "../../core/Tensor";
import { crossEntropyLoss } from "../../core/loss/CrossEntropyLoss";
import { loadCheckpoint } from "../../training/checkpoint/Checkpoint";
import type { CheckpointMetadata } from "../../training/checkpoint/Checkpoint";
import { deriveCapabilityLevel } from "../capability-eval";

// ============================================================
// Test infrastructure (existing hand-written harness)
// ============================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
    );
  }
}

function assertNear(
  actual: number,
  expected: number,
  tol: number,
  msg: string
): void {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected ≈ ${expected} (tol ${tol})\n  Actual:   ${actual}`
    );
  }
}

/** Compare two number arrays element-wise (reference-equality is meaningless here). */
function assertArrayEqual(actual: number[], expected: number[], msg: string): void {
  if (actual.length !== expected.length) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected length ${expected.length}\n  Actual length ${actual.length}`
    );
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        `Assertion failed: ${msg}\n  Expected[${i}] = ${expected[i]}\n  Actual[${i}] = ${actual[i]}`
      );
    }
  }
}

// ============================================================
// Constants — the exact production recipe
// ============================================================

const BLOCK_SIZE = 64;
const BATCH_SIZE = 4;
const SEED = 42;
const VOCAB_TARGET = 300;

// ============================================================
// Tiny deterministic pipeline helpers (self-contained)
// ============================================================

/**
 * A tiny, fully deterministic tokenizer + dataset used to prove the
 * objective contract without training the production model. Tokens
 * map to ids 4..13 (special ids 0–3). Corpus "a b c d e f g h i j"
 * with blockSize 4 yields exactly 2 non-overlapping windows:
 *   window 0: input [a,b,c,d]  target(bug) [b,c,d,e]  target(correct) input
 *   window 1: input [e,f,g,h]  target(bug) [f,g,h,i]  target(correct) input
 */
function buildTinyPipeline() {
  const tokenizer = new MiniTokenizer();
  for (const w of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
    tokenizer.addToken(w);
  }
  const dataset = new TextDataset({
    tokenizer,
    corpus: ["a b c d e f g h i j"],
    blockSize: 4,
    insertEos: false,
  });
  const loader = new DataLoader(dataset, {
    batchSize: 2,
    shuffle: false,
    seed: SEED,
    dropLast: false,
  });
  return { tokenizer, dataset, loader };
}

function buildTinyModel(vocabSize: number) {
  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0,
  });
  return { model, optimizer };
}

/** Train the tiny pipeline for `epochs` under the production Trainer. */
function trainTiny(epochs: number, withSpy?: {
  onCriterion: (logits: Tensor, targets: number[][]) => void;
}) {
  Random.setSeed(SEED);
  const { tokenizer, dataset, loader } = buildTinyPipeline();
  const { model, optimizer } = buildTinyModel(tokenizer.vocabSize);
  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: loader,
    config: { epochs, gradientAccumulationSteps: 1 },
    criterion: withSpy
      ? (logits, targets) => {
          withSpy.onCriterion(logits, targets);
          return crossEntropyLoss(logits, targets);
        }
      : undefined,
  });
  const state = trainer.train();
  return { tokenizer, dataset, loader, model, optimizer, trainer, state };
}

// ============================================================
// Sync tests
// ============================================================

export function runPhase89Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 89: Corrected 1-step Training Objective (sync contracts) --");

  testTrainingPathPassesUnshiftedInput();
  testSyntheticSequenceOneStepAlignment();
  testTrainingPathMatchesCorrectedContract();
  testCheckpointMetadataValid();
  testDatasetIdentityUnchanged();
  testCorrectedPathReproducible();
  testNoArchitectureOrEvaluatorChanges();

  console.log(`  Phase 89 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ------------------------------------------------------------
// 1. The training path passes UN-shifted input as targets
// ------------------------------------------------------------
function testTrainingPathPassesUnshiftedInput(): void {
  test("1. the production training path passes UN-shifted inputIds as criterion targets (no double-shift)", () => {
    const allCaptured: number[][][] = [];

    trainTiny(1, {
      onCriterion: (_logits, targets) => {
        allCaptured.push(targets.map((r) => [...r]));
      },
    });

    // With shuffle:false, batchSize 2 and exactly 2 samples there is one
    // batch: [sample0, sample1]. The criterion must have received the
    // UN-shifted input of each sample — never the pre-shifted targetIds.
    assertEqual(allCaptured.length, 1, "one batch was trained");
    const { dataset } = buildTinyPipeline();

    assertArrayEqual(
      allCaptured[0][0],
      dataset.get(0).inputIds,
      "batch[0] targets == sample0.inputIds (unshifted)"
    );
    assertArrayEqual(
      allCaptured[0][1],
      dataset.get(1).inputIds,
      "batch[1] targets == sample1.inputIds (unshifted)"
    );

    // Decisive: the passed targets must NOT be the pre-shifted targetIds
    // (TextDataset.targetIds), which is what caused the double shift.
    assert(
      JSON.stringify(allCaptured[0][0]) !==
        JSON.stringify(dataset.get(0).targetIds),
      "batch[0] targets != sample0.targetIds (would be a double shift)"
    );
    assert(
      JSON.stringify(allCaptured[0][1]) !==
        JSON.stringify(dataset.get(1).targetIds),
      "batch[1] targets != sample1.targetIds (would be a double shift)"
    );

    // Sanity: TextDataset itself still pre-shifts (it is unchanged); the
    // fix lives in the training loop, not the dataset.
    const s0 = dataset.get(0);
    assertEqual(s0.targetIds[0], s0.inputIds[1], "TextDataset 1-shift intact");
  });
}

// ------------------------------------------------------------
// 2. Synthetic sequence: 1-step alignment of crossEntropyLoss
// ------------------------------------------------------------
function testSyntheticSequenceOneStepAlignment(): void {
  test("2. a known synthetic sequence shows the intended one-step alignment (crossEntropyLoss(logits, inputIds))", () => {
    // Same construction as experiments/phase88/verify-shift.ts.
    const tokenizer = new MiniTokenizer();
    for (const w of ["a", "b", "c", "d", "e", "f"]) tokenizer.addToken(w);

    const dataset = new TextDataset({
      tokenizer,
      corpus: ["a b c d e f"],
      blockSize: 4,
      insertEos: false,
    });
    const sample = dataset.get(0);
    // sample.inputIds  = [id(a), id(b), id(c), id(d)]
    // sample.targetIds = [id(b), id(c), id(d), id(e)]  (TextDataset 1-shift)

    // A "perfect 1-step" model: logits[s] gives near-certain mass ONLY at
    // the true next token, inputIds[s+1].
    const logits = Tensor.fromArray([
      sample.inputIds.map((_id, s) => {
        const row = new Array(tokenizer.getVocabulary().size).fill(0);
        row[sample.inputIds[s + 1]] = 10;
        return row;
      }),
    ]);

    // Corrected contract: targets = the full unshifted input. The loss'
    // internal causal shift (targets[b][s+1]) then compares logits[s]
    // against inputIds[s+1] = the true next token -> loss ≈ 0.
    const correctedLoss = crossEntropyLoss(logits, [sample.inputIds]).item();
    assertNear(correctedLoss, 0, 0.1, "perfect 1-step model → loss ≈ 0 under corrected contract");

    // Old (buggy) contract: targets = pre-shifted targetIds. The internal
    // shift now compares logits[s] against targetIds[s+1] = inputIds[s+2]
    // (2 steps ahead) -> the perfect 1-step model is scored as wrong.
    const oldLoss = crossEntropyLoss(logits, [sample.targetIds]).item();
    assert(oldLoss > 5, `perfect 1-step model scored wrong under old contract (loss ${oldLoss.toFixed(3)})`);

    // The two contracts disagree: this is precisely the shift being fixed.
    assert(correctedLoss < oldLoss, "corrected contract loss < shifted-contract loss");
  });
}

// ------------------------------------------------------------
// 3. Training path and crossEntropyLoss agree on the corrected alignment
// ------------------------------------------------------------
function testTrainingPathMatchesCorrectedContract(): void {
  test("3. the training path's first-step loss equals the independent corrected-contract loss", () => {
    Random.setSeed(SEED);
    const { tokenizer, dataset } = buildTinyPipeline();
    const { model, optimizer } = buildTinyModel(tokenizer.vocabSize);

    // Reference: corrected-contract loss over the loader's first batch
    // computed with the SAME (initial) model params, INDEPENDENT of the
    // Trainer. A second, identically-configured loader yields the same
    // first batch (shuffle:false, same seed).
    const refLoader = new DataLoader(dataset, {
      batchSize: 2,
      shuffle: false,
      seed: SEED,
      dropLast: false,
    });
    const firstBatch: TextSample[] = [];
    for (const b of refLoader) {
      firstBatch.push(...b);
      break;
    }
    const { inputIds } = collateBatch(firstBatch);
    const refTargets = firstBatch.map((s) => s.inputIds);
    const referenceLoss = crossEntropyLoss(model.forward(inputIds), refTargets).item();

    // Now run the production Trainer with a spy that records the loss the
    // training path actually produced for its FIRST batch.
    let trainingPathLoss: number | null = null;
    const trainLoader = new DataLoader(dataset, {
      batchSize: 2,
      shuffle: false,
      seed: SEED,
      dropLast: false,
    });
    const trainer = new Trainer({
      model,
      optimizer,
      trainLoader,
      config: { epochs: 1, gradientAccumulationSteps: 1 },
      criterion: (logits, targets) => {
        const loss = crossEntropyLoss(logits, targets);
        if (trainingPathLoss === null) trainingPathLoss = loss.item();
        return loss;
      },
    });
    trainer.train();

    assert(trainingPathLoss !== null, "training path produced a first-step loss");
    assertNear(
      trainingPathLoss!,
      referenceLoss,
      1e-9,
      "training-path first-step loss == independent corrected-contract loss (1-step)"
    );
  });
}

// ------------------------------------------------------------
// 4. Checkpoint metadata remains valid
// ------------------------------------------------------------
function testCheckpointMetadataValid(): void {
  test("4. checkpoint metadata remains valid (format untouched by the objective fix)", () => {
    Random.setSeed(SEED);
    const { tokenizer, dataset } = buildTinyPipeline();
    const { model, optimizer } = buildTinyModel(tokenizer.vocabSize);
    const trainLoader = new DataLoader(dataset, {
      batchSize: 2,
      shuffle: false,
      seed: SEED,
      dropLast: false,
    });

    const metadata: CheckpointMetadata = {
      modelConfig: {
        vocabSize: tokenizer.vocabSize,
        dModel: 128,
        numHeads: 4,
        dFF: 512,
        numLayers: 4,
        maxSeqLen: 256,
      },
      vocabSize: tokenizer.vocabSize,
      parameterCount: model.totalParamCount,
      trainingDataset: "bilingual",
      datasetVersion: "0.3.0",
      datasetSchemaVersion: 1,
      datasetPurpose: "training",
      trainingSteps: 1,
      epochs: 1,
      createdAt: 1234567890,
      // tokenizerState is optional (BPETokenizer.toState() is covered by the
      // production TrainingWorker path and the Phase 82/85 suites).
    };

    const trainer = new Trainer({
      model,
      optimizer,
      trainLoader,
      checkpointMetadata: metadata,
      config: { epochs: 1, gradientAccumulationSteps: 1 },
    });
    trainer.train();
    const ckpt = trainer.saveCheckpoint();

    assert(ckpt.metadata !== undefined, "checkpoint carries metadata");
    const m = ckpt.metadata!;
    assertEqual(m.vocabSize, tokenizer.vocabSize, "metadata vocabSize");
    assertEqual(m.parameterCount, model.totalParamCount, "metadata parameterCount");
    assertEqual(m.trainingDataset, "bilingual", "metadata dataset id");
    assertEqual(m.datasetVersion, "0.3.0", "metadata dataset version");
    assertEqual(m.modelConfig.vocabSize, tokenizer.vocabSize, "modelConfig.vocabSize");
    assert(Array.isArray(ckpt.modelParams) && ckpt.modelParams.length > 0, "modelParams serialized");

    // Round-trip into a fresh model + optimizer: parameters must restore exactly.
    const fresh = buildTinyModel(tokenizer.vocabSize);
    loadCheckpoint({ model: fresh.model, optimizer: fresh.optimizer, checkpoint: ckpt });
    const trainedParams = model.parameters();
    const restoredParams = fresh.model.parameters();
    for (let i = 0; i < trainedParams.length; i++) {
      const a = trainedParams[i].data;
      const b = restoredParams[i].data;
      for (let j = 0; j < a.length; j++) {
        assertEqual(b[j], a[j], `param ${i}[${j}] restored exactly`);
      }
    }
  });
}

// ------------------------------------------------------------
// 5. Dataset identity / version unchanged
// ------------------------------------------------------------
function testDatasetIdentityUnchanged(): void {
  test("5. dataset identity/version unchanged (v0.3.0, 600 samples, 200/200/200, 480/60/60)", () => {
    const dataset = loadProductionDataset();
    assertEqual(dataset.metadata.version, "0.3.0", "dataset version");
    assertEqual(dataset.samples.length, 600, "sample count");

    const stats = computeBaseStatistics(dataset);
    assertEqual(stats.languageCounts.zh, 200, "zh 200");
    assertEqual(stats.languageCounts.en, 200, "en 200");
    assertEqual(stats.languageCounts.mixed, 200, "mixed 200");
    assertEqual(stats.splitCounts.train, 480, "train 480");
    assertEqual(stats.splitCounts.validation, 60, "validation 60");
    assertEqual(stats.splitCounts.test, 60, "test 60");

    // Dataset registry identity still resolves to the single production set.
    const r = resolveTrainingDataset("bilingual");
    assertEqual(r.id, "bilingual", "registry id");
    assertEqual(r.kind, "production", "registry kind");
    assertEqual(r.sampleCount, 600, "registry sampleCount");

    // TextDataset contract unchanged: targetIds[i] == inputIds[i+1].
    Random.setSeed(SEED);
    const tokenizer = new BPETokenizer();
    tokenizer.train(getDatasetTexts(dataset), VOCAB_TARGET);
    const textDataset = new TextDataset({ tokenizer, corpus: getDatasetTexts(dataset), blockSize: BLOCK_SIZE });
    const s = textDataset.get(0);
    for (let i = 0; i < s.inputIds.length - 1; i++) {
      assertEqual(s.targetIds[i], s.inputIds[i + 1], `TextDataset 1-shift preserved at ${i}`);
    }
  });
}

// ------------------------------------------------------------
// 6. Corrected path reproducibility
// ------------------------------------------------------------
function testCorrectedPathReproducible(): void {
  test("6. the corrected training path is reproducible (same seed → identical loss history)", () => {
    const r1 = trainTiny(2);
    const r2 = trainTiny(2);

    assertEqual(r1.state.lossHistory.length, r2.state.lossHistory.length, "same step count");
    assertEqual(r1.state.lossHistory.length, 2, "2 steps for 2 epochs (1 batch/epoch)");
    for (let i = 0; i < r1.state.lossHistory.length; i++) {
      assertEqual(
        r1.state.lossHistory[i],
        r2.state.lossHistory[i],
        `lossHistory[${i}] identical`
      );
    }

    // The corrected objective actually decreases the 1-step training loss.
    const first = r1.state.lossHistory[0];
    const last = r1.state.lossHistory[r1.state.lossHistory.length - 1];
    assert(last < first, `corrected-objective loss decreases over training (${first.toFixed(3)} → ${last.toFixed(3)})`);
  });
}

// ------------------------------------------------------------
// 7. No architecture / evaluator / threshold changes
// ------------------------------------------------------------
function testNoArchitectureOrEvaluatorChanges(): void {
  test("7. no architecture, evaluator, or capability-threshold changes", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target");
    assertEqual(cfg.dModel, 128, "dModel");
    assertEqual(cfg.numHeads, 4, "numHeads");
    assertEqual(cfg.dFF, 512, "dFF");
    assertEqual(cfg.numLayers, 4, "numLayers");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen");
    assertEqual(parameterCountOf(cfg), 1_126_528, "exact parameter count");

    // Production classes reused — no second model/tokenizer/Trainer.
    assertEqual(typeof TensorMiniMindModel, "function", "TensorMiniMindModel is the production model class");
    assertEqual(typeof Trainer, "function", "Trainer is the production trainer class");
    assertEqual(typeof BPETokenizer, "function", "BPETokenizer is the production tokenizer class");

    // Capability Level 3 threshold intact (≥ 0.5).
    const report = deriveCapabilityLevel({
      pipelineRuns: false,
      tokenizerRoundTrip: false,
      lossDecreases: false,
      paramsChange: false,
      memorizationSignal: false,
      coherentGeneration: false,
      qaCapability: false,
    });
    assertEqual(report.levels.length, 6, "six gates (0–5)");
    const level3 = report.levels.find((l) => l.level === 3)!;
    assert(level3.criterion.includes("0.5"), "Level 3 threshold (0.5) intact");
  });
}
