// ============================================================
// ModelRegistry unit tests
// ============================================================
// Phase 50: Tests for model configuration registry.
// Covers: getModelConfig, listModels, createModel, registerModel,
// hasModel, modelCount, toTensorConfig.
// ============================================================

import {
  getModelConfig,
  listModels,
  createModel,
  registerModel,
  hasModel,
  modelCount,
  toTensorConfig,
} from "../ModelRegistry";
import type { ModelConfigEntry } from "../ModelRegistry";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { Tensor } from "../../core/Tensor";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertThrows(fn: () => void, msg: string): void {
  try { fn(); failed++; console.error(`  FAIL: ${msg} — expected throw`); }
  catch { passed++; }
}

// ============================================================
// Test runner
// ============================================================

export function runModelRegistryTests(): { passed: number; failed: number } {
  console.log("\n=== ModelRegistry Tests ===\n");
  passed = 0; failed = 0;

  // ── getModelConfig ──
  console.log("getModelConfig:");

  // 1-3: Built-in models exist
  const tiny = getModelConfig("tiny");
  assert(tiny.name === "tiny", "getModelConfig('tiny') returns tiny config");
  assert(tiny.dModel === 128, "tiny dModel is 128");
  assert(tiny.numLayers === 4, "tiny numLayers is 4");

  // 4-6: Small config
  const small = getModelConfig("small");
  assert(small.name === "small", "getModelConfig('small') returns small config");
  assert(small.dModel === 256, "small dModel is 256");
  assert(small.numLayers === 6, "small numLayers is 6");

  // 7-9: Base config
  const base = getModelConfig("base");
  assert(base.name === "base", "getModelConfig('base') returns base config");
  assert(base.dModel === 512, "base dModel is 512");
  assert(base.numLayers === 8, "base numLayers is 8");

  // 10: Unknown model throws
  assertThrows(() => getModelConfig("nonexistent"), "unknown model throws");

  // 11-13: Returned config is a copy (not reference to internal)
  const tiny1 = getModelConfig("tiny");
  const tiny2 = getModelConfig("tiny");
  assert(tiny1 !== tiny2, "getModelConfig returns a new copy each time");
  assert(tiny1.dModel === tiny2.dModel, "copied configs have same values");
  assert(tiny1.name === tiny2.name, "copied configs have same name");

  // 14-16: Config has all required fields
  assert(typeof tiny.vocabSize === "number" && tiny.vocabSize > 0, "config has vocabSize");
  assert(typeof tiny.numHeads === "number" && tiny.numHeads > 0, "config has numHeads");
  assert(typeof tiny.dFF === "number" && tiny.dFF > 0, "config has dFF");

  // 17: estimatedParams is computed
  assert(tiny.estimatedParams > 0, "estimatedParams is computed (>0)");

  // ── listModels ──
  console.log("listModels:");

  // 18-20: Returns all built-in models
  const models = listModels();
  assert(models.length >= 3, "listModels returns at least 3 models");
  const names = models.map(m => m.name);
  assert(names.includes("tiny"), "listModels includes tiny");
  assert(names.includes("small"), "listModels includes small");

  // 21: Includes base
  assert(names.includes("base"), "listModels includes base");

  // 22-23: Each model has required fields
  for (const m of models) {
    assert(typeof m.label === "string" && m.label.length > 0, `${m.name} has label`);
    assert(typeof m.description === "string" && m.description.length > 0, `${m.name} has description`);
  }

  // ── createModel ──
  console.log("createModel:");

  // 24-26: Creates TensorMiniMindModel instances
  const modelTiny = createModel("tiny");
  assert(modelTiny instanceof TensorMiniMindModel, "createModel('tiny') returns TensorMiniMindModel");
  assert(modelTiny.dModel === 128, "created tiny model has correct dModel");
  assert(modelTiny.numLayers === 4, "created tiny model has correct numLayers");

  // 27-28: createModel with custom vocabSize
  const modelCustomVocab = createModel("tiny", 8000);
  assert(modelCustomVocab.vocabSize === 8000, "createModel with custom vocabSize");

  // Model has parameters
  assert(modelTiny.parameters().length > 0, "created model has parameters");

  // 29: Model forward works
  const input = Tensor.fromArray([[1, 2, 3, 4]]);
  const logits = modelTiny.forward(input);
  assert(logits.shape.length === 3, "model forward produces 3D logits");
  assert(logits.shape[2] === modelTiny.vocabSize, "logits last dim matches vocabSize");

  // ── registerModel ──
  console.log("registerModel:");

  // 30-31: Register custom model
  const customEntry: ModelConfigEntry = {
    name: "test-custom",
    label: "Test Custom",
    description: "Custom test model",
    vocabSize: 1000,
    dModel: 64,
    numHeads: 2,
    dFF: 256,
    numLayers: 2,
    maxSeqLen: 64,
    eps: 1e-6,
    estimatedParams: 0,
  };
  registerModel(customEntry);
  assert(hasModel("test-custom"), "custom model is registered");

  // 32: Can retrieve custom model
  const custom = getModelConfig("test-custom");
  assert(custom.name === "test-custom", "retrieved custom model config");

  // 33: Duplicate registration throws
  assertThrows(() => registerModel(customEntry), "duplicate registration throws");

  // ── hasModel ──
  console.log("hasModel:");

  // 34-36
  assert(hasModel("tiny"), "hasModel('tiny') returns true");
  assert(hasModel("small"), "hasModel('small') returns true");
  assert(!hasModel("nonexistent-model-xyz"), "hasModel for nonexistent returns false");

  // ── modelCount ──
  console.log("modelCount:");

  // 37-38
  const count = modelCount();
  assert(count >= 4, "modelCount >= 4 (3 built-in + 1 custom)");
  assert(typeof count === "number" && count > 0, "modelCount returns positive number");

  // ── toTensorConfig ──
  console.log("toTensorConfig:");

  // 39-42
  const tensorConfig = toTensorConfig(tiny);
  assert(tensorConfig.vocabSize === tiny.vocabSize, "toTensorConfig preserves vocabSize");
  assert(tensorConfig.dModel === tiny.dModel, "toTensorConfig preserves dModel");
  assert(tensorConfig.numHeads === tiny.numHeads, "toTensorConfig preserves numHeads");
  assert(tensorConfig.numLayers === tiny.numLayers, "toTensorConfig preserves numLayers");

  // 43-44
  assert(tensorConfig.dFF === tiny.dFF, "toTensorConfig preserves dFF");
  assert(tensorConfig.maxSeqLen === tiny.maxSeqLen, "toTensorConfig preserves maxSeqLen");

  // ── Parameter estimates ──
  console.log("Parameter estimates:");

  // 45-47: Relative sizes
  assert(tiny.estimatedParams < small.estimatedParams, "tiny has fewer params than small");
  assert(small.estimatedParams < base.estimatedParams, "small has fewer params than base");
  assert(tiny.estimatedParams > 100000, "tiny has >100K params");

  // 48-50: createModel from each built-in works
  assert(createModel("small") instanceof TensorMiniMindModel, "createModel('small') works");
  assert(createModel("base") instanceof TensorMiniMindModel, "createModel('base') works");
  assert(createModel("tiny", 500) instanceof TensorMiniMindModel, "createModel('tiny', 500) works");

  console.log(`\nModelRegistry: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// Allow running directly
if (require.main === module) {
  runModelRegistryTests();
}
