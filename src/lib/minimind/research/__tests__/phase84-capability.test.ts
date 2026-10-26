// ============================================================
// Phase 84 — Real Bilingual Training Capability Validation
// ============================================================
// This suite validates what the production MiniMind model can ACTUALLY
// do, using the REAL training path (no fake Trainer / metrics / mocks,
// no Math.random results, no hardcoded answers). It covers the 11
// focused checks the phase requires:
//
//   1.  production config is used (single source of truth)
//   2.  bilingual dataset is actually consumed
//   3.  tokenizer vocabulary is model-compatible
//   4.  optimizer changes parameters (real training)
//   5.  loss changes after training (real training)
//   6.  checkpoint metadata identifies dataset/version/config
//   7.  checkpoint round-trip preserves trained state
//   8.  deterministic experiment behavior (two runs → identical loss)
//   9.  Chinese generation evaluation
//   10. English generation evaluation
//   11. mixed-language evaluation
//
// The sync portion (runPhase84Tests) covers checks 1–3, 6–7, and the
// evaluator mechanics (9–11 on a baseline model). The async portion
// (runPhase84AsyncTests) runs the REAL bounded training experiment for
// checks 4–5, 8, and re-runs 9–11 on the trained model. The async
// experiment is BOUNDED (epochs = 1) so it finishes reliably; the full
// 5-epoch numbers are recorded separately in the Phase 84 report.
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
} from "../../data/datasetLoader";

import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { Tensor } from "../../core/Tensor";
import { TextDataset } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { CosineScheduler } from "../../core/scheduler/CosineScheduler";
import { Trainer } from "../../training/Trainer";
import {
  saveCheckpoint,
  loadCheckpoint,
  type CheckpointMetadata,
} from "../../training/checkpoint/Checkpoint";
import { Random } from "../../core/random/Random";
import { TrainingState } from "../../training/TrainingState";

import {
  evaluateGeneration,
  evaluateTokenizerRoundTrip,
  measureMemorization,
  buildEvidence,
  deriveCapabilityLevel,
  type CapabilityPrompt,
} from "../capability-eval";

// ============================================================
// Test infrastructure (existing harness — no Bun, no new runner)
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

function assertClose(actual: number, expected: number, eps: number, msg: string): void {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected: ${expected} ± ${eps}\n  Actual:   ${actual}`
    );
  }
}

// ============================================================
// Constants — the bounded experiment recipe
// ============================================================

const BLOCK_SIZE = 16;
const BATCH_SIZE = 4;
const LR = 0.001;
const WD = 0.01;
const SEED = 42;

// A bounded experiment (1 epoch) proves training signal + determinism
// while finishing reliably. The full 5-epoch numbers are in the report.
const BOUNDED_EPOCHS = 1;

/** Curated zh/en/mixed generation prompts (kept small to bound runtime). */
const GEN_PROMPTS: CapabilityPrompt[] = [
  { prompt: "the sun rises", language: "en" },
  { prompt: "machine learning is", language: "en" },
  { prompt: "water boils at", language: "en" },
  { prompt: "太阳", language: "zh" },
  { prompt: "机器学习是", language: "zh" },
  { prompt: "地球绕着", language: "zh" },
  { prompt: "什么是 machine learning", language: "mixed" },
  { prompt: "transformer 的注意力", language: "mixed" },
  { prompt: "gradient descent 是", language: "mixed" },
];

// ============================================================
// Helpers
// ============================================================

/** Flatten a model's parameters into a plain number[] snapshot. */
function flattenParams(model: TensorMiniMindModel): number[] {
  const out: number[] = [];
  for (const p of model.parameters()) {
    for (let i = 0; i < p.data.length; i++) out.push(p.data[i]);
  }
  return out;
}

/** Max absolute element-wise delta between two param snapshots. */
function maxAbsDelta(a: number[], b: number[]): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    max = Math.max(max, Math.abs(a[i] - b[i]));
  }
  return max;
}

/**
 * Build the REAL production training pipeline (tokenizer → dataset →
 * loader → model → optimizer → scheduler), mirroring TrainingWorker.
 */
function buildProductionPipeline(seed: number) {
  const dataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  const cfg = getProductionModelConfig();

  Random.setSeed(seed);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, PRODUCTION_VOCAB_TARGET);

  const textDataset = new TextDataset({ tokenizer, corpus, blockSize: BLOCK_SIZE });
  const trainLoader = new DataLoader(textDataset, {
    batchSize: BATCH_SIZE,
    shuffle: true,
    seed,
    dropLast: true,
  });

  const model = new TensorMiniMindModel({
    vocabSize: tokenizer.vocabSize,
    dModel: cfg.dModel,
    numHeads: cfg.numHeads,
    dFF: cfg.dFF,
    numLayers: cfg.numLayers,
    maxSeqLen: cfg.maxSeqLen,
  });

  const optimizer = new AdamWOptimizer(model.parameters(), { lr: LR, weightDecay: WD });
  const totalSteps = BOUNDED_EPOCHS * trainLoader.numBatches;
  const scheduler = new CosineScheduler(optimizer, {
    baseLR: LR,
    minLR: LR * 0.01,
    warmupSteps: Math.floor(totalSteps * 0.1),
    totalSteps,
  });

  return { tokenizer, trainLoader, model, optimizer, scheduler, corpus };
}

/** Run the bounded training loop and return measurements. */
function runBoundedTraining(seed: number) {
  const { tokenizer, trainLoader, model, optimizer, scheduler } = buildProductionPipeline(seed);
  const before = flattenParams(model);

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader,
    config: {
      epochs: BOUNDED_EPOCHS,
      learningRate: LR,
      logInterval: 1000000, // silence per-step logging for the bounded run
      gradientAccumulationSteps: 1,
      gradientClipNorm: 1.0,
    },
  });
  trainer.scheduler = scheduler;

  const state = trainer.train();
  const after = flattenParams(model);

  return {
    model,
    tokenizer,
    state,
    initialLoss: state.lossHistory[0],
    finalLoss: state.lossHistory[state.lossHistory.length - 1],
    bestLoss: state.bestLoss,
    maxParamDelta: maxAbsDelta(before, after),
  };
}

/** Build a small (fast) model for checkpoint round-trip, trained 1 epoch. */
function runSmallCheckpointRoundTrip() {
  const dataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);

  Random.setSeed(SEED);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, 260); // minimum vocab — no merges needed

  const textDataset = new TextDataset({ tokenizer, corpus, blockSize: BLOCK_SIZE });
  const trainLoader = new DataLoader(textDataset, {
    batchSize: BATCH_SIZE,
    shuffle: true,
    seed: SEED,
    dropLast: true,
  });

  const makeModel = () =>
    new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: 32,
      numHeads: 2,
      dFF: 64,
      numLayers: 1,
      maxSeqLen: 32,
    });

  const model = makeModel();
  const optimizer = new AdamWOptimizer(model.parameters(), { lr: LR, weightDecay: WD });
  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader,
    config: {
      epochs: 1,
      learningRate: LR,
      logInterval: 1000000,
      gradientAccumulationSteps: 1,
      gradientClipNorm: 1.0,
    },
  });
  trainer.train();

  const checkpoint = saveCheckpoint({
    model,
    optimizer,
    scheduler: undefined,
    trainerState: new TrainingState().snapshot(),
    metadata: {
      modelConfig: {
        vocabSize: tokenizer.vocabSize,
        dModel: 32,
        numHeads: 2,
        dFF: 64,
        numLayers: 1,
        maxSeqLen: 32,
      },
      vocabSize: tokenizer.vocabSize,
      parameterCount: model.totalParamCount,
      trainingDataset: "bilingual",
      trainingSteps: trainLoader.numBatches,
      epochs: 1,
      createdAt: 0,
      tokenizerState: tokenizer.toState(),
    },
  });

  // Reload into a FRESH identical model and verify trained state preserved.
  const restored = makeModel();
  const restoredOptimizer = new AdamWOptimizer(restored.parameters(), { lr: LR, weightDecay: WD });
  loadCheckpoint({ model: restored, optimizer: restoredOptimizer, checkpoint });

  return { original: flattenParams(model), restored: flattenParams(restored) };
}

// ============================================================
// Sync tests — checks 1–3, 6–7, evaluator mechanics (9–11)
// ============================================================

export function runPhase84Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 84: Real Bilingual Capability Validation (sync) --");

  testGroup1_ProductionConfig();
  testGroup2_BilingualDataset();
  testGroup3_TokenizerModelCompat();
  testGroup6_CheckpointMetadata();
  testGroup7_CheckpointRoundTrip();
  testGroupEvaluator_Baseline();

  console.log(`  Phase 84 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ============================================================
// Group 1 — production config used
// ============================================================

function testGroup1_ProductionConfig(): void {
  test("capability experiment uses the production config", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.name, "production", "name");
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target");
    assertEqual(cfg.dModel, 128, "dModel");
    assertEqual(cfg.numHeads, 4, "numHeads");
    assertEqual(cfg.dFF, 512, "dFF");
    assertEqual(cfg.numLayers, 4, "numLayers");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen");
    const count = parameterCountOf(cfg);
    assert(count > 900_000 && count < 1_300_000, `~1.1M params, got ${count}`);
  });
}

// ============================================================
// Group 2 — bilingual dataset actually consumed
// ============================================================

function testGroup2_BilingualDataset(): void {
  test("production training consumes the bilingual dataset", () => {
    const dataset = loadProductionDataset();
    assert(dataset.samples.length >= 30, `>= 30 samples, got ${dataset.samples.length}`);
    assert(dataset.metadata.id === "bilingual", "dataset id is bilingual");
    assert(dataset.metadata.languageCoverage.includes("zh"), "zh covered");
    assert(dataset.metadata.languageCoverage.includes("en"), "en covered");
    assert(dataset.metadata.languageCoverage.includes("mixed"), "mixed covered");

    const corpus = getDatasetTexts(dataset);
    assertEqual(corpus.length, dataset.samples.length, "corpus length matches samples");
    assert(corpus.every((t) => t.length > 0), "every sample non-empty");
  });
}

// ============================================================
// Group 3 — tokenizer vocabulary is model-compatible
// ============================================================

function testGroup3_TokenizerModelCompat(): void {
  test("tokenizer vocab matches the model built from it", () => {
    const dataset = loadProductionDataset();
    const corpus = getDatasetTexts(dataset);
    const tokenizer = new BPETokenizer();
    tokenizer.train(corpus, PRODUCTION_VOCAB_TARGET);

    const cfg = getProductionModelConfig();
    const model = new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: cfg.dModel,
      numHeads: cfg.numHeads,
      dFF: cfg.dFF,
      numLayers: cfg.numLayers,
      maxSeqLen: cfg.maxSeqLen,
    });

    assertEqual(model.vocabSize, tokenizer.vocabSize, "model vocab == tokenizer vocab");
    assert(tokenizer.vocabSize >= 260, `vocab >= 260, got ${tokenizer.vocabSize}`);

    // Forward passes with a [1, S, V] logits shape — proves compatibility.
    const ids = tokenizer.encode("机器学习 machine learning");
    const input = Tensor.fromArray([ids.length > 0 ? ids : [3]]);
    const logits = model.forward(input);
    const arr = logits.toArray() as number[][][];
    assertEqual(arr[0][0].length, tokenizer.vocabSize, "logits width == vocab");
  });
}

// ============================================================
// Group 6 — checkpoint metadata identifies dataset/version/config
// ============================================================

function testGroup6_CheckpointMetadata(): void {
  test("checkpoint metadata carries dataset version + config", () => {
    const dataset = loadProductionDataset();
    const corpus = getDatasetTexts(dataset);
    const tokenizer = new BPETokenizer();
    tokenizer.train(corpus, PRODUCTION_VOCAB_TARGET);

    const cfg = getProductionModelConfig();
    const model = new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: cfg.dModel,
      numHeads: cfg.numHeads,
      dFF: cfg.dFF,
      numLayers: cfg.numLayers,
      maxSeqLen: cfg.maxSeqLen,
    });
    const optimizer = new AdamWOptimizer(model.parameters(), { lr: LR, weightDecay: WD });

    const metadata: CheckpointMetadata = {
      modelConfig: {
        vocabSize: tokenizer.vocabSize,
        dModel: cfg.dModel,
        numHeads: cfg.numHeads,
        dFF: cfg.dFF,
        numLayers: cfg.numLayers,
        maxSeqLen: cfg.maxSeqLen,
      },
      vocabSize: tokenizer.vocabSize,
      parameterCount: model.totalParamCount,
      trainingDataset: dataset.metadata.id,
      datasetVersion: dataset.metadata.version,
      datasetSchemaVersion: dataset.metadata.schemaVersion,
      datasetPurpose: dataset.metadata.purpose,
      trainingSteps: 100,
      epochs: 5,
      createdAt: 0,
      tokenizerState: tokenizer.toState(),
    };

    const checkpoint = saveCheckpoint({
      model,
      optimizer,
      trainerState: new TrainingState().snapshot(),
      metadata,
    });

    const m = checkpoint.metadata!;
    assertEqual(m.trainingDataset, "bilingual", "trainingDataset");
    assertEqual(m.datasetVersion, "0.3.0", "datasetVersion");
    assertEqual(m.datasetSchemaVersion, 1, "datasetSchemaVersion");
    assertEqual(m.datasetPurpose, "pretraining", "datasetPurpose");
    assertEqual(m.vocabSize, tokenizer.vocabSize, "vocabSize");
    assertEqual(m.parameterCount, model.totalParamCount, "parameterCount");
    assertEqual(m.modelConfig.dModel, cfg.dModel, "modelConfig.dModel");
    assert(m.tokenizerState !== undefined, "tokenizerState present");
  });
}

// ============================================================
// Group 7 — checkpoint round-trip preserves trained state
// ============================================================

function testGroup7_CheckpointRoundTrip(): void {
  test("checkpoint round-trip preserves trained (not initial) parameters", () => {
    const { original, restored } = runSmallCheckpointRoundTrip();
    assertEqual(original.length, restored.length, "param count preserved");
    const delta = maxAbsDelta(original, restored);
    assertClose(delta, 0, 1e-12, "trained params restored exactly");
  });
}

// ============================================================
// Evaluator mechanics — checks 9–11 (baseline model)
// ============================================================

function testGroupEvaluator_Baseline(): void {
  const dataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, PRODUCTION_VOCAB_TARGET);

  const cfg = getProductionModelConfig();
  const model = new TensorMiniMindModel({
    vocabSize: tokenizer.vocabSize,
    dModel: cfg.dModel,
    numHeads: cfg.numHeads,
    dFF: cfg.dFF,
    numLayers: cfg.numLayers,
    maxSeqLen: cfg.maxSeqLen,
  });

  const roundTrip = evaluateTokenizerRoundTrip(
    tokenizer,
    dataset.samples.map((s) => ({ prompt: s.text, language: s.language as CapabilityPrompt["language"] }))
  );

  test("tokenizer round-trips zh/en/mixed losslessly (Level 1)", () => {
    assert(roundTrip.allRoundTrip, "all samples round-trip");
    assert(roundTrip.counts.zh > 0, "zh samples tested");
    assert(roundTrip.counts.en > 0, "en samples tested");
    assert(roundTrip.counts.mixed > 0, "mixed samples tested");
    assertEqual(roundTrip.failures.zh, 0, "no zh failures");
    assertEqual(roundTrip.failures.en, 0, "no en failures");
    assertEqual(roundTrip.failures.mixed, 0, "no mixed failures");
  });

  const generation = evaluateGeneration(model, tokenizer, GEN_PROMPTS, {
    maxTokens: 24,
    temperature: 0.8,
    seed: SEED,
  });

  test("generation evaluator runs for all three language classes (checks 9–11)", () => {
    for (const lang of ["zh", "en", "mixed"] as const) {
      const agg = generation.byLanguage[lang];
      assertEqual(agg.sampleCount, 3, `${lang} has 3 samples`);
      assert(agg.nonEmptyRatio >= 0 && agg.nonEmptyRatio <= 1, `${lang} nonEmptyRatio in [0,1]`);
      assert(agg.validUtf8Ratio >= 0 && agg.validUtf8Ratio <= 1, `${lang} validUtf8Ratio in [0,1]`);
      assert(agg.cjkRatio >= 0 && agg.cjkRatio <= 1, `${lang} cjkRatio in [0,1]`);
      assert(agg.collapsedRatio >= 0 && agg.collapsedRatio <= 1, `${lang} collapsedRatio in [0,1]`);
    }
  });

  const memorization = measureMemorization(model, tokenizer, corpus, 8);

  test("memorization evaluator reports a valid measurement", () => {
    assert(memorization.predictions > 0, "predictions made");
    assert(memorization.top1Accuracy >= 0 && memorization.top1Accuracy <= 1, "top1 in [0,1]");
    assertClose(memorization.chance, 1 / tokenizer.vocabSize, 1e-12, "chance = 1/vocab");
  });

  test("capability gate is honest — baseline does NOT claim Level 4/5", () => {
    const evidence = buildEvidence({
      pipelineRuns: true,
      lossDecreases: false,
      paramsChange: false,
      roundTrip,
      memorization,
      generation,
    });
    const report = deriveCapabilityLevel(evidence);
    // Baseline: tokenizer works (Level 1), but no training signal yet.
    assert(report.highestLevel >= 1, "tokenizer level reached");
    assert(report.highestLevel < 4, "coherent generation NOT claimed");
    const qa = report.levels.find((l) => l.level === 5)!;
    assert(!qa.achieved, "Q&A is never claimed");
  });
}

// ============================================================
// Async tests — checks 4–5, 8, and 9–11 on the trained model
// ============================================================

export async function runPhase84AsyncTests(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 84: Real Bilingual Capability Validation (async training) --");

  let run1: ReturnType<typeof runBoundedTraining> | null = null;

  test("real training completes (Level 0)", async () => {
    run1 = runBoundedTraining(SEED);
    assert(run1.state.globalStep > 0, "optimizer steps advanced");
  });

  test("loss decreases after training (Level 2)", () => {
    assert(run1 !== null, "training ran");
    assert(run1.finalLoss < run1.initialLoss, `loss ${run1.initialLoss} → ${run1.finalLoss}`);
  });

  test("optimizer changes parameters (Level 2)", () => {
    assert(run1 !== null, "training ran");
    assert(run1.maxParamDelta > 0, `params changed, max delta ${run1.maxParamDelta}`);
  });

  test("two identical runs are deterministic (reproducibility)", () => {
    assert(run1 !== null, "first run exists");
    const run2 = runBoundedTraining(SEED);
    assertClose(run2.finalLoss, run1.finalLoss, 1e-9, "final loss identical across runs");
  });

  test("capability evaluation on the trained model (checks 9–11)", () => {
    assert(run1 !== null, "training ran");
    const generation = evaluateGeneration(run1.model, run1.tokenizer, GEN_PROMPTS, {
      maxTokens: 24,
      temperature: 0.8,
      seed: SEED,
    });
    for (const lang of ["zh", "en", "mixed"] as const) {
      const agg = generation.byLanguage[lang];
      assertEqual(agg.sampleCount, 3, `${lang} has 3 samples`);
    }
  });

  test("honest capability level after bounded training", () => {
    assert(run1 !== null, "training ran");
    const corpus = getDatasetTexts(loadProductionDataset());
    const roundTrip = evaluateTokenizerRoundTrip(
      run1.tokenizer,
      loadProductionDataset().samples.map((s) => ({
        prompt: s.text,
        language: s.language as CapabilityPrompt["language"],
      }))
    );
    const generation = evaluateGeneration(run1.model, run1.tokenizer, GEN_PROMPTS, {
      maxTokens: 24,
      temperature: 0.8,
      seed: SEED,
    });
    const memorization = measureMemorization(run1.model, run1.tokenizer, corpus, 8);

    const evidence = buildEvidence({
      pipelineRuns: true,
      lossDecreases: run1.finalLoss < run1.initialLoss,
      paramsChange: run1.maxParamDelta > 0,
      roundTrip,
      memorization,
      generation,
    });
    const report = deriveCapabilityLevel(evidence);

    // The bounded run demonstrates Level 2. It must NOT claim Level 4/5.
    assert(report.highestLevel >= 2, "training signal level reached");
    assert(report.highestLevel < 4, "coherent generation NOT claimed");
    const qa = report.levels.find((l) => l.level === 5)!;
    assert(!qa.achieved, "Q&A is never claimed");
  });

  console.log(`  Phase 84 (async): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
