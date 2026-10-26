// ============================================================
// Phase 83 — Production Model Configuration & Scaling Audit Tests
// ============================================================
// Covers (objectives 9, 10, 11, 12 of the Phase 83 spec):
//   1. Single source of truth: `getProductionModelConfig()` is the
//      ONLY production architecture; it is copy-safe and stable.
//   2. Parameter-count validation: `parameterCountOf` / `estimatedParams`
//      EXACTLY equals the real `TensorMiniMindModel.totalParamCount`
//      (zero bias + untied LM head → the "estimate" is exact).
//   3. Config invariants: heads divide dModel, dFF valid, vocabSize
//      respects the tokenizer contract (>= 260).
//   4. Tokenizer/model compatibility: BPE vocab target → actual vocab
//      in [260, 300]; model built at that vocab matches param count and
//      produces [B, S, vocabSize] logits.
//   5. Checkpoint compatibility: save/restore preserves config/vocab/
//      tokenizer; an incompatible architecture is REJECTED.
//   6. Legacy classification: tiny/small/base are reference configs
//      (vocab 32000, NOT browser-trainable); only "production" is
//      production. Nothing is deleted.
//
// Run with: npx tsx src/lib/minimind/research/__tests__/run.ts
// ============================================================

// ============================================================
// Imports
// ============================================================

import {
  getProductionModelConfig,
  getModelConfig,
  listModels,
  PRODUCTION_VOCAB_TARGET,
  PRODUCTION_MODEL_NAME,
  parameterCountOf,
  createModel,
} from "../../experiments/ModelRegistry";

import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { Tensor } from "../../core/Tensor";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { bilingualCorpusTexts } from "../../data/BilingualCorpus";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { TrainingState } from "../../training/TrainingState";
import {
  saveCheckpoint,
  loadCheckpoint,
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

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    throw new Error(`Assertion failed: ${msg} (expected throw, none thrown)`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Assertion failed:")) {
      throw err;
    }
    // Expected throw — pass.
  }
}

// Exact scalar parameter count for the Tensor backend (no bias, untied head).
// params(V) = 2·V·D + L·(4·D² + 3·D·dFF + 2·D) + D
function paramsFor(
  vocab: number,
  dModel: number,
  dFF: number,
  numLayers: number
): number {
  const embedding = vocab * dModel;
  const perLayer = 4 * dModel * dModel + 3 * dModel * dFF + 2 * dModel;
  const finalNorm = dModel;
  const lmHead = dModel * vocab;
  return embedding + numLayers * perLayer + finalNorm + lmHead;
}

// ============================================================
// Test runner
// ============================================================

export function runPhase83Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 83: Production Config & Scaling Audit Tests --");

  group1_SingleSourceOfTruth();
  group2_ParameterCountExactness();
  group3_ConfigInvariants();
  group4_TokenizerModelCompatibility();
  group5_CheckpointCompatibility();
  group6_LegacyClassification();

  console.log(`  Phase 83: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ============================================================
// Group 1 — Single source of truth
// ============================================================

function group1_SingleSourceOfTruth(): void {
  test("production config is the only production entry", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.name, PRODUCTION_MODEL_NAME, "name is 'production'");
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target 300");
    assertEqual(cfg.dModel, 128, "dModel 128");
    assertEqual(cfg.numHeads, 4, "heads 4");
    assertEqual(cfg.dFF, 512, "dFF 512");
    assertEqual(cfg.numLayers, 4, "layers 4");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen 256");
  });

  test("getProductionModelConfig returns an independent copy", () => {
    const a = getProductionModelConfig();
    const b = getProductionModelConfig();
    a.dModel = 999;
    a.numLayers = 1;
    assertEqual(b.dModel, 128, "dModel copy not mutated");
    assertEqual(b.numLayers, 4, "numLayers copy not mutated");
  });

  test("listModels exposes exactly one production entry", () => {
    const productionEntries = listModels().filter(
      (m) => m.name === PRODUCTION_MODEL_NAME
    );
    assertEqual(productionEntries.length, 1, "exactly one production entry");
  });
}

// ============================================================
// Group 2 — Parameter count exactness
// ============================================================

function group2_ParameterCountExactness(): void {
  const cfg = getProductionModelConfig();

  test("production parameter count is exactly 1,126,528", () => {
    assertEqual(
      parameterCountOf(cfg),
      1_126_528,
      "production scalar param count"
    );
    assertEqual(cfg.estimatedParams, 1_126_528, "estimatedParams is exact");
  });

  test("estimated formula equals the real model totalParamCount", () => {
    const model = createModel("production");
    const expected = paramsFor(cfg.vocabSize, cfg.dModel, cfg.dFF, cfg.numLayers);
    assertEqual(model.totalParamCount, expected, "model matches formula");
    assertEqual(
      model.totalParamCount,
      parameterCountOf(cfg),
      "totalParamCount equals parameterCountOf (no bias, untied head)"
    );
  });

  test("model has no bias parameters (numLayers*9 + 3 parameter objects)", () => {
    const model = createModel("production");
    // 9 params/layer (2 norm gammas + Q/K/V/O + gate/up/down) + embedding +
    // finalNorm + lmHead. A biased architecture would add one bias vector per
    // linear layer and exceed this count.
    assertEqual(
      model.parameters().length,
      cfg.numLayers * 9 + 3,
      "parameter object count (39 for 4 layers)"
    );
  });

  test("parameter count scales exactly with vocab size", () => {
    // params(V) = 256·V + 1,049,728 for D=128, dFF=512, L=4.
    assertEqual(
      paramsFor(260, 128, 512, 4),
      1_116_288,
      "V=260 → 1,116,288"
    );
    assertEqual(
      paramsFor(300, 128, 512, 4),
      1_126_528,
      "V=300 → 1,126,528"
    );
  });
}

// ============================================================
// Group 3 — Config invariants
// ============================================================

function group3_ConfigInvariants(): void {
  test("heads divide dModel for every registry entry", () => {
    for (const m of listModels()) {
      assert(
        m.dModel % m.numHeads === 0,
        `${m.name}: dModel ${m.dModel} % heads ${m.numHeads} === 0`
      );
    }
  });

  test("all registry entries have valid positive dimensions", () => {
    for (const m of listModels()) {
      assert(m.dModel > 0, `${m.name}: dModel > 0`);
      assert(m.dFF > 0, `${m.name}: dFF > 0`);
      assert(m.numHeads > 0, `${m.name}: heads > 0`);
      assert(m.numLayers > 0, `${m.name}: layers > 0`);
      assert(m.maxSeqLen > 0, `${m.name}: maxSeqLen > 0`);
    }
  });

  test("production vocabSize respects the tokenizer minimum (>= 260)", () => {
    assert(
      getProductionModelConfig().vocabSize >= 260,
      "production vocab >= 260 (256 bytes + 4 special tokens)"
    );
  });

  test("TensorMiniMindModel rejects an invalid config", () => {
    assertThrows(() => {
      new TensorMiniMindModel({
        vocabSize: 300,
        dModel: 130, // 130 not divisible by heads
        numHeads: 4,
        dFF: 512,
        numLayers: 4,
        maxSeqLen: 256,
      });
    }, "dModel not divisible by heads throws");
  });
}

// ============================================================
// Group 4 — Tokenizer/model compatibility
// ============================================================

function group4_TokenizerModelCompatibility(): void {
  test("BPE trains toward the production target within [260, 300]", () => {
    const tokenizer = new BPETokenizer();
    tokenizer.train(bilingualCorpusTexts(), PRODUCTION_VOCAB_TARGET);
    assert(tokenizer.vocabSize >= 260, `vocab >= 260, got ${tokenizer.vocabSize}`);
    assert(
      tokenizer.vocabSize <= PRODUCTION_VOCAB_TARGET,
      `vocab <= 300, got ${tokenizer.vocabSize}`
    );
  });

  test("model built from the ACTUAL tokenizer vocab matches its param count", () => {
    const tokenizer = new BPETokenizer();
    tokenizer.train(bilingualCorpusTexts(), PRODUCTION_VOCAB_TARGET);
    const actualVocab = tokenizer.vocabSize;

    const model = createModel("production", actualVocab);
    const expected = paramsFor(actualVocab, 128, 512, 4);
    assertEqual(model.totalParamCount, expected, "tokenizer-derived vocab param count");
    assertEqual(model.vocabSize, actualVocab, "model vocab equals tokenizer vocab");
  });

  test("forward pass produces [B, S, vocabSize] logits", () => {
    const tokenizer = new BPETokenizer();
    tokenizer.train(bilingualCorpusTexts(), PRODUCTION_VOCAB_TARGET);
    const model = createModel("production", tokenizer.vocabSize);

    const ids = tokenizer.encode("机器学习 machine learning");
    assert(ids.length > 0, "encode produces tokens");
    // Pad/truncate to a fixed block length.
    const block = 8;
    const seq = ids.slice(0, block);
    while (seq.length < block) seq.push(0); // <pad>

    const input = Tensor.fromArray([seq]);
    const logits = model.forward(input);
    assertEqual(logits.shape.length, 3, "3D logits");
    assertEqual(logits.shape[1], block, "seq dim matches block");
    assertEqual(logits.shape[2], model.vocabSize, "last dim = vocabSize");
  });
}

// ============================================================
// Group 5 — Checkpoint compatibility
// ============================================================

function group5_CheckpointCompatibility(): void {
  const cfg = getProductionModelConfig();

  function buildMetadata(model: TensorMiniMindModel): CheckpointMetadata {
    return {
      modelConfig: {
        vocabSize: model.vocabSize,
        dModel: cfg.dModel,
        numHeads: cfg.numHeads,
        dFF: cfg.dFF,
        numLayers: cfg.numLayers,
        maxSeqLen: cfg.maxSeqLen,
      },
      vocabSize: model.vocabSize,
      parameterCount: model.totalParamCount,
      trainingDataset: "bilingual",
      trainingSteps: 100,
      epochs: 5,
      createdAt: 1234567890,
    };
  }

  test("checkpoint round-trip preserves config/vocab/param count", () => {
    const model = createModel("production");
    const optimizer = new AdamWOptimizer(model.parameters(), {
      lr: 0.001,
      weightDecay: 0.01,
    });
    const checkpoint = saveCheckpoint({
      model,
      optimizer,
      trainerState: new TrainingState().snapshot(),
      metadata: buildMetadata(model),
    });

    assert(checkpoint.metadata !== undefined, "metadata present");
    assertEqual(
      checkpoint.metadata!.modelConfig.vocabSize,
      checkpoint.metadata!.vocabSize,
      "modelConfig.vocabSize === vocabSize"
    );
    assertEqual(
      checkpoint.metadata!.vocabSize,
      model.vocabSize,
      "metadata vocab === tokenizer-derived model vocab"
    );
    assertEqual(
      checkpoint.metadata!.parameterCount,
      model.totalParamCount,
      "metadata param count === model"
    );
  });

  test("loading into an identical architecture restores params exactly", () => {
    const modelA = createModel("production");
    const optA = new AdamWOptimizer(modelA.parameters(), { lr: 0.001 });
    const checkpoint = saveCheckpoint({
      model: modelA,
      optimizer: optA,
      trainerState: new TrainingState().snapshot(),
      metadata: buildMetadata(modelA),
    });

    const modelB = createModel("production");
    const optB = new AdamWOptimizer(modelB.parameters(), { lr: 0.001 });
    loadCheckpoint({ model: modelB, optimizer: optB, checkpoint });

    const paramsA = modelA.parameters();
    const paramsB = modelB.parameters();
    assertEqual(paramsA.length, paramsB.length, "same parameter count");
    let identical = true;
    for (let i = 0; i < paramsA.length; i++) {
      const a = paramsA[i].data;
      const b = paramsB[i].data;
      if (a.length !== b.length) { identical = false; break; }
      for (let j = 0; j < a.length; j++) {
        if (a[j] !== b[j]) { identical = false; break; }
      }
      if (!identical) break;
    }
    assert(identical, "restored parameters are bit-identical");
  });

  test("incompatible architecture (layer mismatch) is rejected", () => {
    const modelA = createModel("production");
    const optA = new AdamWOptimizer(modelA.parameters(), { lr: 0.001 });
    const checkpoint = saveCheckpoint({
      model: modelA,
      optimizer: optA,
      trainerState: new TrainingState().snapshot(),
      metadata: buildMetadata(modelA),
    });

    const incompatible = new TensorMiniMindModel({
      vocabSize: 300,
      dModel: 128,
      numHeads: 4,
      dFF: 512,
      numLayers: 3, // fewer layers than the checkpoint
      maxSeqLen: 256,
    });
    const optIncompatible = new AdamWOptimizer(incompatible.parameters(), {
      lr: 0.001,
    });

    assertThrows(() => {
      loadCheckpoint({ model: incompatible, optimizer: optIncompatible, checkpoint });
    }, "loadCheckpoint rejects a layer-mismatched model");
  });

  test("incompatible vocabulary is rejected on restore", () => {
    const modelA = createModel("production");
    const optA = new AdamWOptimizer(modelA.parameters(), { lr: 0.001 });
    const checkpoint = saveCheckpoint({
      model: modelA,
      optimizer: optA,
      trainerState: new TrainingState().snapshot(),
      metadata: buildMetadata(modelA),
    });

    const incompatible = new TensorMiniMindModel({
      vocabSize: 200, // different vocab → embedding/lmHead shape mismatch
      dModel: 128,
      numHeads: 4,
      dFF: 512,
      numLayers: 4,
      maxSeqLen: 256,
    });
    const optIncompatible = new AdamWOptimizer(incompatible.parameters(), {
      lr: 0.001,
    });

    assertThrows(() => {
      loadCheckpoint({ model: incompatible, optimizer: optIncompatible, checkpoint });
    }, "loadCheckpoint rejects a vocab-mismatched model");
  });
}

// ============================================================
// Group 6 — Legacy config classification
// ============================================================

function group6_LegacyClassification(): void {
  test("tiny/small/base are reference configs, not production", () => {
    for (const name of ["tiny", "small", "base"]) {
      const m = getModelConfig(name);
      assertEqual(m.name, name, `${name} exists`);
      assertEqual(m.vocabSize, 32000, `${name} is a 32K-vocab reference config`);
      assert(m.name !== PRODUCTION_MODEL_NAME, `${name} is not production`);
    }
  });

  test("reference configs are NOT browser-trainable at 32K vocab", () => {
    const base = getModelConfig("base");
    // The reference presets keep the legacy 32K vocab; only production carries
    // the tokenizer-derived target. This documents the split, not a deletion.
    assertEqual(base.vocabSize, 32000, "base retains 32K reference vocab");
    assert(
      base.estimatedParams > getProductionModelConfig().estimatedParams,
      "base is larger than production (reference only)"
    );
  });

  test("production is the smallest, only browser-trainable entry", () => {
    const prod = getProductionModelConfig();
    const names = listModels().map((m) => m.name);
    assert(names.includes("tiny"), "tiny retained");
    assert(names.includes("small"), "small retained");
    assert(names.includes("base"), "base retained");
    assert(names.includes("production"), "production retained");
    assertEqual(
      prod.estimatedParams,
      Math.min(...listModels().map((m) => m.estimatedParams)),
      "production is the smallest registry entry"
    );
  });
}
