// ============================================================
// Phase 80 — Bilingual Foundation Tests
// ============================================================
// Covers:
//   1. Production model config single source of truth (~1.1M params)
//   2. Dataset resolution (bilingual default / fixture / unavailable)
//   3. Tokenizer zh/en/mixed counting (real, not `length / 4`)
//   4. Tokenizer truncation to a real token budget
//   5. Silent vocab cap removed (train toward the production target)
//   6. Tokenizer state round-trip (checkpoint `tokenizerState`)
//   7. Capability state derivation + honest labels
//   8. Checkpoint metadata contract (saveCheckpoint passthrough)
// ============================================================

// ============================================================
// Imports
// ============================================================

import {
  getProductionModelConfig,
  PRODUCTION_VOCAB_TARGET,
  parameterCountOf,
  createModel,
} from "../../experiments/ModelRegistry";

import {
  resolveTrainingDataset,
  type ResolvedDataset,
} from "../../data/datasetRegistry";

import {
  bilingualCorpusTexts,
  bilingualCorpusStats,
} from "../../data/BilingualCorpus";

import {
  countTokens,
  estimateContextTokens,
  truncateToTokens,
} from "../../tokenizer/tokenCounter";

import { BPETokenizer } from "../../tokenizer/BPETokenizer";

import {
  deriveCapabilityState,
  capabilityLabel,
  isTrained,
  isBilingualTrained,
} from "../capability";

import { AdamWOptimizer } from "../../core/optim/AdamW";
import { TrainingState } from "../../training/TrainingState";
import {
  saveCheckpoint,
  type CheckpointMetadata,
} from "../../training/checkpoint/Checkpoint";

// ============================================================
// Test infrastructure
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
// Test Groups
// ============================================================

export function runPhase80Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 80: Bilingual Foundation Tests --");

  testGroup1_ModelConfig();
  testGroup2_DatasetResolution();
  testGroup3_TokenizerCounting();
  testGroup4_VocabCapRemoved();
  testGroup5_TokenizerStateRoundTrip();
  testGroup6_CapabilityState();
  testGroup7_CheckpointMetadata();
  testGroup8_BilingualCorpus();

  console.log(`  Phase 80: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ============================================================
// Group 1 — Model config single source of truth
// ============================================================

function testGroup1_ModelConfig(): void {
  test("production config is the single source of truth", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.name, "production", "name is production");
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target");
    assertEqual(cfg.dModel, 128, "dModel");
    assertEqual(cfg.numHeads, 4, "numHeads");
    assertEqual(cfg.dFF, 512, "dFF");
    assertEqual(cfg.numLayers, 4, "numLayers");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen");
  });

  test("production model is ~1.1M params (not 9.2M)", () => {
    const cfg = getProductionModelConfig();
    const count = parameterCountOf(cfg);
    assert(count > 900_000 && count < 1_300_000, `expected ~1.1M, got ${count}`);
    assertEqual(cfg.estimatedParams, count, "estimatedParams equals parameterCountOf");
  });

  test("production config returns an independent copy", () => {
    const a = getProductionModelConfig();
    const b = getProductionModelConfig();
    a.vocabSize = 999;
    assertEqual(b.vocabSize, PRODUCTION_VOCAB_TARGET, "copy not mutated");
  });
}

// ============================================================
// Group 2 — Dataset resolution
// ============================================================

function testGroup2_DatasetResolution(): void {
  test("bilingual is the available foundation default", () => {
    const r: ResolvedDataset = resolveTrainingDataset("bilingual");
    assert(r.available, "available");
    assert(!r.isFixture, "not a fixture");
    assert(r.corpus.length > 0, "non-empty corpus");
    assertEqual(r.id, "bilingual", "id");
  });

  test("undefined dataset falls back to bilingual", () => {
    const r = resolveTrainingDataset(undefined);
    assertEqual(r.id, "bilingual", "undefined → bilingual");
    assert(r.available, "available");
  });

  test("tiny/fixture/demo are marked as fixtures", () => {
    assert(resolveTrainingDataset("tiny").isFixture, "tiny isFixture");
    assert(resolveTrainingDataset("fixture").isFixture, "fixture isFixture");
    assert(resolveTrainingDataset("demo").isFixture, "demo isFixture");
  });

  test("network/fs datasets are honestly unavailable", () => {
    assert(!resolveTrainingDataset("tinystories").available, "tinystories unavailable");
    assert(!resolveTrainingDataset("textfile").available, "textfile unavailable");
    assert(!resolveTrainingDataset("synthetic").available, "synthetic unavailable");
  });

  test("unknown dataset is unavailable — no silent fallback", () => {
    const r = resolveTrainingDataset("definitely-not-real");
    assert(!r.available, "not available");
    assert(r.warning !== undefined, "warning present");
    assertEqual(r.corpus.length, 0, "no fallback corpus — empty");
  });
}

// ============================================================
// Group 3 — Tokenizer counting (zh / en / mixed)
// ============================================================

function testGroup3_TokenizerCounting(): void {
  test("Chinese text is NOT undercounted by `length / 4`", () => {
    const zh = "机器学习是让计算机从数据中学习规律的方法";
    const real = countTokens(zh);
    const heuristic = Math.ceil(zh.length / 4);
    assert(real > 0, "Chinese counts to > 0 tokens");
    assert(real > heuristic, `Chinese real=${real} must exceed /4 heuristic=${heuristic}`);
  });

  test("English and mixed text count to > 0 tokens", () => {
    const en = "machine learning is a method for learning from data";
    const mixed = "机器学习 machine learning 从数据 data 中学习 pattern";
    assert(countTokens(en) > 0, "English counts");
    assert(countTokens(mixed) > 0, "mixed counts");
  });

  test("estimateContextTokens equals countTokens", () => {
    const text = "请解释什么是注意力机制 attention mechanism";
    assertEqual(estimateContextTokens(text), countTokens(text), "estimate = count");
  });

  test("truncateToTokens respects a real token budget", () => {
    assertEqual(truncateToTokens("", 10), "", "empty stays empty");
    assertEqual(truncateToTokens("hello world", 1000), "hello world", "under budget unchanged");
    const ascii = "a b c d e f g h i j k l m n o p q r s t u v w x y z".repeat(3);
    const result = truncateToTokens(ascii, 8);
    assert(result.length > 0, "truncated result non-empty");
    assert(countTokens(result) <= 8, `truncated within budget, got ${countTokens(result)}`);
  });
}

// ============================================================
// Group 4 — Silent vocab cap removed
// ============================================================

function testGroup4_VocabCapRemoved(): void {
  test("training toward the production target does not throw", () => {
    const tokenizer = new BPETokenizer();
    // The old `Math.min(target, corpus.length * 10)` would compute 190 for a
    // 19-entry corpus — below the 260 minimum — and throw. The cap is gone.
    tokenizer.train(bilingualCorpusTexts(), PRODUCTION_VOCAB_TARGET);
    assert(tokenizer.vocabSize >= 260, `vocab >= 260, got ${tokenizer.vocabSize}`);
    assert(tokenizer.vocabSize <= PRODUCTION_VOCAB_TARGET, `vocab <= target, got ${tokenizer.vocabSize}`);
  });
}

// ============================================================
// Group 5 — Tokenizer state round-trip (checkpoint `tokenizerState`)
// ============================================================

function testGroup5_TokenizerStateRoundTrip(): void {
  test("toState/fromState is lossless", () => {
    const tokenizer = new BPETokenizer();
    tokenizer.train(bilingualCorpusTexts(), PRODUCTION_VOCAB_TARGET);

    const state = tokenizer.toState();
    const restored = new BPETokenizer();
    restored.fromState(state);

    assertEqual(restored.vocabSize, tokenizer.vocabSize, "vocab size preserved");

    const text = "机器学习 machine learning 从数据 data 中学习";
    assertEqual(
      JSON.stringify(restored.encode(text)),
      JSON.stringify(tokenizer.encode(text)),
      "encode matches after reload"
    );
  });
}

// ============================================================
// Group 6 — Capability state
// ============================================================

function testGroup6_CapabilityState(): void {
  test("deriveCapabilityState derives honest states", () => {
    assertEqual(deriveCapabilityState({ hasCheckpoint: false }), "baseline", "no ckpt → baseline");
    assertEqual(deriveCapabilityState({ hasCheckpoint: true, dataset: "bilingual" }), "bilingual-trained", "bilingual → bilingual-trained");
    assertEqual(deriveCapabilityState({ hasCheckpoint: true, dataset: "tiny" }), "toy-trained", "tiny → toy-trained");
  });

  test("capability helpers", () => {
    assert(isTrained("bilingual-trained"), "bilingual-trained is trained");
    assert(!isTrained("baseline"), "baseline is not trained");
    assert(isBilingualTrained("bilingual-trained"), "isBilingualTrained");
    assert(!isBilingualTrained("toy-trained"), "toy-trained is not bilingual");
  });

  test("capabilityLabel is honest", () => {
    assertEqual(capabilityLabel("baseline"), "Untrained baseline", "baseline label");
    assertEqual(capabilityLabel("toy-trained"), "Toy-trained", "toy label");
    assertEqual(capabilityLabel("bilingual-trained"), "Bilingual-trained", "bilingual label");
  });
}

// ============================================================
// Group 7 — Checkpoint metadata contract
// ============================================================

function testGroup7_CheckpointMetadata(): void {
  test("saveCheckpoint preserves checkpoint metadata", () => {
    const cfg = getProductionModelConfig();
    const model = createModel("production");
    const optimizer = new AdamWOptimizer(model.parameters(), {
      lr: 0.001,
      weightDecay: 0.01,
    });

    const metadata: CheckpointMetadata = {
      modelConfig: {
        vocabSize: cfg.vocabSize,
        dModel: cfg.dModel,
        numHeads: cfg.numHeads,
        dFF: cfg.dFF,
        numLayers: cfg.numLayers,
        maxSeqLen: cfg.maxSeqLen,
      },
      vocabSize: cfg.vocabSize,
      parameterCount: model.totalParamCount,
      trainingDataset: "bilingual",
      trainingSteps: 100,
      epochs: 5,
      createdAt: 1234567890,
    };

    const checkpoint = saveCheckpoint({
      model,
      optimizer,
      trainerState: new TrainingState().snapshot(),
      metadata,
    });

    assert(checkpoint.metadata !== undefined, "metadata is present");
    assertEqual(checkpoint.metadata!.trainingDataset, "bilingual", "dataset preserved");
    assertEqual(checkpoint.metadata!.vocabSize, cfg.vocabSize, "vocab preserved");
    assertEqual(checkpoint.metadata!.epochs, 5, "epochs preserved (not truncated)");
    assertEqual(checkpoint.metadata!.parameterCount, model.totalParamCount, "param count preserved");
    assertEqual(checkpoint.metadata!.modelConfig.dModel, cfg.dModel, "modelConfig.dModel preserved");
  });
}

// ============================================================
// Group 8 — Bilingual corpus integrity
// ============================================================

function testGroup8_BilingualCorpus(): void {
  test("bilingual corpus is real and covers all languages", () => {
    const stats = bilingualCorpusStats();
    assert(stats.total >= 15, `total >= 15, got ${stats.total}`);
    assert(stats.zh > 0, "zh present");
    assert(stats.en > 0, "en present");
    assert(stats.mixed > 0, "mixed present");
    assertEqual(stats.zh + stats.en + stats.mixed, stats.total, "counts sum to total");
  });

  test("bilingualCorpusTexts matches stats.total", () => {
    const stats = bilingualCorpusStats();
    assertEqual(bilingualCorpusTexts().length, stats.total, "texts length = total");
  });
}
