// ============================================================
// Phase 86 — Production Bilingual Corpus Expansion & Training Baseline
// ============================================================
// This suite verifies the EXPANDED production bilingual corpus
// (bilingual.json v0.3.0, ~600 samples) and proves the REAL training
// baseline is established against it — with the model architecture,
// tokenizer, Trainer, and capability evaluator UNCHANGED from Phase 84.
//
// Sync checks (13):
//   1.  dataset schema is valid (metadata + samples parse + validate)
//   2.  sample ids are unique
//   3.  no empty sample text
//   4.  every sample has a supported language (zh | en | mixed)
//   5.  every sample has a supported split (train | validation | test)
//   6.  splits are deterministic and exactly 80/10/10
//   7.  corpus size is in the 500–1000 target range
//   8.  token statistics come from the REAL tokenizer (not a heuristic)
//   9.  production registry resolves bilingual (single source of truth)
//  10.  production corpus never falls back to a fixture
//  11.  dataset version metadata is recorded (v0.3.0, schema 1, seed provenance)
//  12.  Phase 84 capability evaluator is UNCHANGED (gates + thresholds intact)
//  13.  production model config is UNCHANGED (vocab 300, 1,126,528 params)
//
// Async check: one BOUNDED (1-epoch) real training run on the expanded
// corpus proves training signal + honest capability derivation. The full
// 5-epoch numbers are measured by experiments/phase86/probe.ts and
// recorded in PHASE86-DATASET-TRAINING-REPORT.md.
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
  computeDatasetStatistics,
} from "../../data/datasetLoader";

import { resolveTrainingDataset } from "../../data/datasetRegistry";
import { getProductionTokenizer } from "../../tokenizer/tokenCounter";

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
// Constants — the bounded experiment recipe (mirrors Phase 84)
// ============================================================

const BLOCK_SIZE = 16;
const BATCH_SIZE = 4;
const LR = 0.001;
const WD = 0.01;
const SEED = 42;
const BOUNDED_EPOCHS = 1;

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
// Sync tests — the 13 checks
// ============================================================

export function runPhase86Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 86: Corpus Expansion & Training Baseline (sync) --");

  testSchemaValidity();
  testUniqueIds();
  testNonEmptyText();
  testValidLanguages();
  testValidSplits();
  testDeterministicSplits();
  testCorpusSizeRange();
  testTokenStatistics();
  testRegistryIdentity();
  testNoFixtureFallback();
  testVersionMetadata();
  testEvaluatorUnchanged();
  testModelConfigUnchanged();

  console.log(`  Phase 86 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

function testSchemaValidity(): void {
  test("1. dataset parses and validates under schema v1", () => {
    const ds = loadProductionDataset();
    assertEqual(ds.metadata.schemaVersion, 1, "schemaVersion");
    assertEqual(ds.metadata.purpose, "pretraining", "purpose");
    assert(ds.samples.length > 0, "samples non-empty");
  });
}

function testUniqueIds(): void {
  test("2. every sample id is unique", () => {
    const ds = loadProductionDataset();
    const seen = new Set<string>();
    for (const s of ds.samples) {
      assert(!seen.has(s.id), `duplicate id ${s.id}`);
      seen.add(s.id);
    }
    assertEqual(seen.size, ds.samples.length, "id count == sample count");
  });
}

function testNonEmptyText(): void {
  test("3. no sample text is empty", () => {
    const ds = loadProductionDataset();
    for (const s of ds.samples) {
      assert(typeof s.text === "string" && s.text.trim().length > 0, `text ${s.id} non-empty`);
    }
  });
}

function testValidLanguages(): void {
  test("4. every sample language is zh | en | mixed", () => {
    const ds = loadProductionDataset();
    for (const s of ds.samples) {
      assert(["zh", "en", "mixed"].includes(s.language), `language ${s.language} valid`);
    }
  });
}

function testValidSplits(): void {
  test("5. every sample split is train | validation | test", () => {
    const ds = loadProductionDataset();
    for (const s of ds.samples) {
      assert(
        s.split === undefined || ["train", "validation", "test"].includes(s.split),
        `split ${s.split} valid`
      );
    }
  });
}

function testDeterministicSplits(): void {
  test("6. splits are deterministic and exactly 80/10/10", () => {
    const base = computeBaseStatistics(loadProductionDataset());
    assertEqual(base.sampleCount, 600, "sampleCount");
    assertEqual(base.languageCounts.zh, 200, "zh count");
    assertEqual(base.languageCounts.en, 200, "en count");
    assertEqual(base.languageCounts.mixed, 200, "mixed count");
    assertEqual(base.splitCounts.train, 480, "train count (80%)");
    assertEqual(base.splitCounts.validation, 60, "validation count (10%)");
    assertEqual(base.splitCounts.test, 60, "test count (10%)");

    // Deterministic across repeated computations (no random sampling).
    const again = computeBaseStatistics(loadProductionDataset());
    assertEqual(JSON.stringify(again.splitCounts), JSON.stringify(base.splitCounts), "identical across runs");
  });
}

function testCorpusSizeRange(): void {
  test("7. corpus size is within the 500–1000 target range", () => {
    const n = loadProductionDataset().samples.length;
    assert(n >= 500 && n <= 1000, `sample count ${n} in [500, 1000]`);
  });
}

function testTokenStatistics(): void {
  test("8. token statistics use the REAL tokenizer, not a length heuristic", () => {
    const tokenizer = getProductionTokenizer();
    const ds = loadProductionDataset();
    const stats = computeDatasetStatistics(ds, tokenizer);

    const expected = ds.samples.reduce((sum, s) => sum + tokenizer.encode(s.text).length, 0);
    assertEqual(stats.tokenCount, expected, "tokenCount equals sum of real encode lengths");
    assert(stats.tokenCount > 0, "tokenCount positive");
    assert(stats.averageTokensPerSample > 0, "average positive");
  });
}

function testRegistryIdentity(): void {
  test("9. production registry resolves bilingual as the single corpus", () => {
    const r = resolveTrainingDataset("bilingual");
    assertEqual(r.id, "bilingual", "id");
    assertEqual(r.kind, "production", "kind");
    assert(r.available, "available");
    assertEqual(r.version, "0.3.0", "version");
    assertEqual(r.sampleCount, 600, "sampleCount");

    // Single source of truth: registry corpus === loader corpus.
    const viaLoader = getDatasetTexts(loadProductionDataset());
    assertEqual(JSON.stringify(r.corpus), JSON.stringify(viaLoader), "registry corpus === loader corpus");
  });
}

function testNoFixtureFallback(): void {
  test("10. production corpus never falls back to a fixture", () => {
    const bilingual = resolveTrainingDataset("bilingual");
    assert(!bilingual.isFixture, "bilingual is never a fixture");
    assertEqual(bilingual.kind, "production", "bilingual is production");

    const synthetic = resolveTrainingDataset("synthetic");
    assert(!synthetic.available, "synthetic unavailable");
    assertEqual(synthetic.corpus.length, 0, "no fallback data");
  });
}

function testVersionMetadata(): void {
  test("11. dataset version + provenance metadata are recorded", () => {
    const m = loadProductionDataset().metadata;
    assertEqual(m.id, "bilingual", "id");
    assertEqual(m.version, "0.3.0", "version");
    assertEqual(m.schemaVersion, 1, "schemaVersion");
    assertEqual(m.provenance, "internally-authored-seed", "provenance");
    assertEqual(m.purpose, "pretraining", "purpose");
  });
}

function testEvaluatorUnchanged(): void {
  test("12. Phase 84 capability evaluator is unchanged (gates + thresholds intact)", () => {
    // The gate ladder is still exactly 0..5.
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

    // Level 3 still requires reproduction (top-1 >= 0.5), not merely above-chance.
    const level3 = report.levels.find((l) => l.level === 3)!;
    assert(level3.criterion.includes("0.5"), "Level 3 threshold (0.5) intact");

    // Level 5 (Q&A) is still present and never silently granted.
    const level5 = report.levels.find((l) => l.level === 5)!;
    assert(!level5.achieved, "Q&A never claimed");
    assertEqual(level5.name, "Bilingual Q&A", "Level 5 gate (Q&A) present");
    assert(level5.criterion.includes("answers"), "Level 5 criterion intact");

    // The report formatter still renders the gate ladder.
    const text = formatCapabilityReport(report);
    assert(text.includes("Level 0"), "formatter renders Level 0");
    assert(text.includes("Highest achieved level"), "formatter renders summary");
  });
}

function testModelConfigUnchanged(): void {
  test("13. production model config is unchanged (vocab 300, 1,126,528 params)", () => {
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

// ============================================================
// Async test — one bounded (1-epoch) REAL training run on the
// expanded corpus, proving training signal + honest capability level.
// ============================================================

export async function runPhase86AsyncTests(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 86: Corpus Expansion & Training Baseline (async training) --");

  const dataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  const cfg = getProductionModelConfig();

  // Build the REAL production pipeline (tokenizer → dataset → loader →
  // model → optimizer → scheduler), mirroring TrainingWorker.
  Random.setSeed(SEED);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, PRODUCTION_VOCAB_TARGET);

  const textDataset = new TextDataset({ tokenizer, corpus, blockSize: BLOCK_SIZE });
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

  test("real training completes on the expanded corpus (Level 0)", () => {
    assert(state.globalStep > 0, "optimizer steps advanced");
    assertEqual(tokenizer.vocabSize, 300, "tokenizer still reaches vocab 300");
  });

  test("loss decreases after training (Level 2)", () => {
    assert(finalLoss < initialLoss, `loss ${initialLoss.toFixed(4)} → ${finalLoss.toFixed(4)}`);
  });

  test("optimizer changes parameters (Level 2)", () => {
    assert(maxParamDelta > 0, `params changed, max delta ${maxParamDelta.toFixed(5)}`);
  });

  test("capability evaluation runs on the expanded corpus", () => {
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

  console.log(`  Phase 86 (async): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
