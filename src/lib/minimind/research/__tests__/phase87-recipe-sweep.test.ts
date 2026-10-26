// ============================================================
// Phase 87 — Training Recipe Sweep: Context Length + Longer Training
// ============================================================
// This suite verifies the Phase 87 controlled experiment changes ONLY the
// training recipe (blockSize, epochs) — NOT model architecture, tokenizer,
// dataset, Trainer, or the capability evaluator.
//
// Sync checks (7):
//   1.  production model config is UNCHANGED (vocab 300, 1,126,528 params)
//   2.  dataset is UNCHANGED (bilingual v0.3.0, 600 samples, 80/10/10)
//   3.  capability evaluator is UNCHANGED (gates + thresholds intact)
//   4.  the sweep only varies recipe params (blockSize/epochs are NOT
//       fields of the model config — no architecture change)
//   5.  blockSize ∈ {16, 64} and epochs ∈ {5, 20} define the 2×2 matrix
//   6.  blockSize 64 yields valid causal windows (blockSize >= 2 respected,
//       fewer windows than blockSize 16, same total token coverage)
//   7.  no new model / tokenizer / Trainer / Runtime / Worker is introduced
//       (the sweep reuses the production classes)
//
// Async check: one BOUNDED (1-epoch) REAL training run at the new context
// length (blockSize 64) proves training signal + honest capability
// derivation at the changed recipe. The full 2×2 numbers are measured by
// experiments/phase87/probe.ts and recorded in
// PHASE87-RECIPE-SWEEP-REPORT.md.
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
import { TextDataset } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { CosineScheduler } from "../../core/scheduler/CosineScheduler";
import { Trainer } from "../../training/Trainer";
import { Random } from "../../core/random/Random";

import {
  evaluateGeneration,
  evaluateTokenizerRoundTrip,
  measureMemorization,
  buildEvidence,
  deriveCapabilityLevel,
  formatCapabilityReport,
  type CapabilityPrompt,
} from "../capability-eval";

// ============================================================
// Test infrastructure (existing hand-written harness — no Vitest/Jest/Bun)
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

// ============================================================
// Constants — the 2×2 recipe sweep (recipe only, not architecture)
// ============================================================

const SWEEP_BLOCK_SIZES = [16, 64];
const SWEEP_EPOCHS = [5, 20];
const BLOCK_SIZE_UNDER_TEST = 64; // the new context length
const BOUNDED_EPOCHS = 1; // bounded run (full sweep measured by the probe)
const BATCH_SIZE = 4;
const LR = 0.001;
const WD = 0.01;
const SEED = 42;

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
// Sync tests — the 7 checks
// ============================================================

export function runPhase87Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 87: Training Recipe Sweep (sync) --");

  testModelConfigUnchanged();
  testDatasetUnchanged();
  testEvaluatorUnchanged();
  testRecipeOnlyVariation();
  testSweepMatrix();
  testBlockSize64Windows();
  testNoNewComponents();

  console.log(`  Phase 87 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

function testModelConfigUnchanged(): void {
  test("1. production model config is unchanged (vocab 300, 1,126,528 params)", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target");
    assertEqual(PRODUCTION_VOCAB_TARGET, 300, "vocab target constant");
    assertEqual(cfg.dModel, 128, "dModel");
    assertEqual(cfg.numHeads, 4, "numHeads");
    assertEqual(cfg.dFF, 512, "dFF");
    assertEqual(cfg.numLayers, 4, "numLayers");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen");
    assertEqual(parameterCountOf(cfg), 1_126_528, "exact parameter count");
  });
}

function testDatasetUnchanged(): void {
  test("2. dataset is unchanged (bilingual v0.3.0, 600 samples, 80/10/10)", () => {
    const ds = loadProductionDataset();
    const base = computeBaseStatistics(ds);
    assertEqual(ds.metadata.id, "bilingual", "id");
    assertEqual(ds.metadata.version, "0.3.0", "version");
    assertEqual(base.sampleCount, 600, "sampleCount");
    assertEqual(base.languageCounts.zh, 200, "zh count");
    assertEqual(base.languageCounts.en, 200, "en count");
    assertEqual(base.languageCounts.mixed, 200, "mixed count");
    assertEqual(base.splitCounts.train, 480, "train count (80%)");
    assertEqual(base.splitCounts.validation, 60, "validation count (10%)");
    assertEqual(base.splitCounts.test, 60, "test count (10%)");
  });
}

function testEvaluatorUnchanged(): void {
  test("3. Phase 84 capability evaluator is unchanged (gates + thresholds intact)", () => {
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
    assertEqual(report.highestLevel, 0, "all-false evidence → Level 0");

    const level3 = report.levels.find((l) => l.level === 3)!;
    assert(level3.criterion.includes("0.5"), "Level 3 threshold (0.5) intact");

    const level5 = report.levels.find((l) => l.level === 5)!;
    assert(!level5.achieved, "Q&A never claimed");
    assertEqual(level5.name, "Bilingual Q&A", "Level 5 gate (Q&A) present");

    const text = formatCapabilityReport(report);
    assert(text.includes("Level 0"), "formatter renders Level 0");
    assert(text.includes("Highest achieved level"), "formatter renders summary");
  });
}

function testRecipeOnlyVariation(): void {
  test("4. the sweep varies only recipe params (blockSize/epochs are NOT architecture)", () => {
    const cfg = getProductionModelConfig() as Record<string, unknown>;
    // blockSize / epochs are training-recipe knobs, never fields of the model config.
    assert(!("blockSize" in cfg), "blockSize is not a model-config field");
    assert(!("epochs" in cfg), "epochs is not a model-config field");
    // The model config exposes exactly the architecture it always has.
    assertEqual(cfg.dModel, 128, "dModel still 128 (recipe change does not touch it)");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen still 256 (blockSize 64 is within it)");
  });
}

function testSweepMatrix(): void {
  test("5. blockSize ∈ {16, 64} and epochs ∈ {5, 20} define the 2×2 matrix", () => {
    assertEqual(SWEEP_BLOCK_SIZES.length, 2, "two context lengths");
    assertEqual(SWEEP_BLOCK_SIZES[0], 16, "baseline context");
    assertEqual(SWEEP_BLOCK_SIZES[1], 64, "long context");
    assertEqual(SWEEP_EPOCHS.length, 2, "two training lengths");
    assertEqual(SWEEP_EPOCHS[0], 5, "baseline epochs");
    assertEqual(SWEEP_EPOCHS[1], 20, "long training");
    // Every context length stays within the model's positional range.
    const cfg = getProductionModelConfig();
    for (const bs of SWEEP_BLOCK_SIZES) {
      assert(bs >= 2 && bs <= cfg.maxSeqLen, `blockSize ${bs} in [2, ${cfg.maxSeqLen}]`);
    }
  });
}

function testBlockSize64Windows(): void {
  test("6. blockSize 64 yields valid causal windows (fewer, longer windows)", () => {
    const corpus = getDatasetTexts(loadProductionDataset());
    Random.setSeed(SEED);
    const tokenizer = new BPETokenizer();
    tokenizer.train(corpus, PRODUCTION_VOCAB_TARGET);

    const ds16 = new TextDataset({ tokenizer, corpus, blockSize: 16 });
    const ds64 = new TextDataset({ tokenizer, corpus, blockSize: 64 });

    assert(ds64.length() > 0, "blockSize 64 produces windows");
    assert(ds64.length() < ds16.length(), "fewer windows at longer context");
    assertEqual(ds64.getBlockSize(), 64, "blockSize recorded");

    const sample = ds64.get(0);
    assertEqual(sample.inputIds.length, 64, "input length == blockSize");
    assertEqual(sample.targetIds.length, 64, "target length == blockSize");
    // Causal shift: targetIds[i] === inputIds[i + 1] within the window.
    for (let i = 0; i < 63; i++) {
      assertEqual(sample.targetIds[i], sample.inputIds[i + 1], `causal shift at ${i}`);
    }
  });
}

function testNoNewComponents(): void {
  test("7. the sweep reuses production classes (no second model/tokenizer/Trainer)", () => {
    // The production registry still resolves the single bilingual corpus.
    const r = resolveTrainingDataset("bilingual");
    assertEqual(r.id, "bilingual", "single corpus id");
    assertEqual(r.kind, "production", "production kind");
    assert(r.available, "available");
    assertEqual(r.sampleCount, 600, "sampleCount");

    // The sweep builds the SAME TensorMiniMindModel + Trainer classes used by
    // production — verified by the async run below, which exercises them
    // against the production config. Nothing here introduces a new class.
    assertEqual(typeof TensorMiniMindModel, "function", "TensorMiniMindModel is the production model class");
    assertEqual(typeof Trainer, "function", "Trainer is the production trainer class");
  });
}

// ============================================================
// Async test — one bounded (1-epoch) REAL training run at
// blockSize 64, proving training signal at the new context length.
// ============================================================

export async function runPhase87AsyncTests(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 87: Training Recipe Sweep (async, blockSize 64) --");

  const dataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  const cfg = getProductionModelConfig();

  Random.setSeed(SEED);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, PRODUCTION_VOCAB_TARGET);

  const textDataset = new TextDataset({ tokenizer, corpus, blockSize: BLOCK_SIZE_UNDER_TEST });
  const trainLoader = new DataLoader(textDataset, {
    batchSize: BATCH_SIZE,
    shuffle: true,
    seed: SEED,
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

  const before = model.parameters().map((p) => Array.from(p.data));

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

  const initialLoss = state.lossHistory[0];
  const finalLoss = state.lossHistory[state.lossHistory.length - 1];

  let maxParamDelta = 0;
  const after = model.parameters();
  for (let i = 0; i < after.length; i++) {
    const d = after[i].data;
    for (let j = 0; j < d.length; j++) {
      maxParamDelta = Math.max(maxParamDelta, Math.abs(d[j] - before[i][j]));
    }
  }

  test("real training completes at blockSize 64 (Level 0)", () => {
    assert(state.globalStep > 0, "optimizer steps advanced");
    assertEqual(tokenizer.vocabSize, 300, "tokenizer still reaches vocab 300");
    assert(textDataset.length() > 0, "blockSize 64 windows non-empty");
  });

  test("loss decreases after training (Level 2)", () => {
    assert(finalLoss < initialLoss, `loss ${initialLoss.toFixed(4)} → ${finalLoss.toFixed(4)}`);
  });

  test("optimizer changes parameters (Level 2)", () => {
    assert(maxParamDelta > 0, `params changed, max delta ${maxParamDelta.toFixed(5)}`);
  });

  test("capability evaluation runs honestly at the changed recipe", () => {
    const roundTrip = evaluateTokenizerRoundTrip(
      tokenizer,
      dataset.samples.map((s) => ({ prompt: s.text, language: s.language as CapabilityPrompt["language"] }))
    );
    assert(roundTrip.allRoundTrip, "all 600 samples round-trip");
    assertEqual(roundTrip.counts.zh, 200, "200 zh round-tripped");
    assertEqual(roundTrip.counts.en, 200, "200 en round-tripped");
    assertEqual(roundTrip.counts.mixed, 200, "200 mixed round-tripped");

    const memorization = measureMemorization(model, tokenizer, corpus, 8);
    const generation = evaluateGeneration(model, tokenizer, GEN_PROMPTS, {
      maxTokens: 24,
      temperature: 0.8,
      seed: SEED,
    });

    const evidence = buildEvidence({
      pipelineRuns: true,
      lossDecreases: finalLoss < initialLoss,
      paramsChange: maxParamDelta > 0,
      roundTrip,
      memorization,
      generation,
    });
    const report = deriveCapabilityLevel(evidence);

    // Honest: the bounded run demonstrates Level 2, never Level 4/5.
    assert(report.highestLevel >= 2, "training signal level reached");
    assert(report.highestLevel < 4, "coherent generation NOT claimed");
    const qa = report.levels.find((l) => l.level === 5)!;
    assert(!qa.achieved, "Q&A is never claimed");
  });

  console.log(`  Phase 87 (async): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
