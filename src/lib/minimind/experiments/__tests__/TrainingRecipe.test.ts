// ============================================================
// TrainingRecipe unit tests
// ============================================================
// Phase 50: Tests for training recipe system.
// Covers: loadRecipe, saveRecipe, listRecipes, listRecipeNames,
// hasRecipe, summarizeRecipe, diffRecipes, validateRecipe,
// recipeToJSON, recipeFromJSON.
// ============================================================

import {
  loadRecipe,
  saveRecipe,
  listRecipes,
  listRecipeNames,
  hasRecipe,
  summarizeRecipe,
  diffRecipes,
  validateRecipe,
  recipeToJSON,
  recipeFromJSON,
} from "../TrainingRecipe";
import type { TrainingRecipe } from "../TrainingRecipe";

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

export function runTrainingRecipeTests(): { passed: number; failed: number } {
  console.log("\n=== TrainingRecipe Tests ===\n");
  passed = 0; failed = 0;

  // ── loadRecipe ──
  console.log("loadRecipe:");

  // 1-3: Built-in recipes exist
  const overfit = loadRecipe("tiny-overfit-test");
  assert(overfit.name === "tiny-overfit-test", "loads tiny-overfit-test recipe");
  assert(overfit.model === "tiny", "tiny-overfit-test uses tiny model");
  assert(overfit.epochs === 20, "tiny-overfit-test has 20 epochs");

  // 4-6: tinystories-tiny recipe
  const tsTiny = loadRecipe("tinystories-tiny");
  assert(tsTiny.name === "tinystories-tiny", "loads tinystories-tiny recipe");
  assert(tsTiny.model === "tiny", "tinystories-tiny uses tiny model");
  assert(tsTiny.dataset.dataset === "tinystories", "tinystories-tiny uses tinystories dataset");

  // 7-9: tinystories-small recipe
  const tsSmall = loadRecipe("tinystories-small");
  assert(tsSmall.name === "tinystories-small", "loads tinystories-small recipe");
  assert(tsSmall.model === "small", "tinystories-small uses small model");
  assert(tsSmall.optimizer.type === "adamw", "tinystories-small uses adamw");

  // 10: Unknown recipe throws
  assertThrows(() => loadRecipe("nonexistent-recipe"), "unknown recipe throws");

  // 11: Returned recipe is a deep copy
  const r1 = loadRecipe("tiny-overfit-test");
  const r2 = loadRecipe("tiny-overfit-test");
  assert(r1 !== r2, "loadRecipe returns new copy each time");

  // ── Recipe structure verification ──
  console.log("Recipe structure:");

  // 12-15: Required fields present
  assert(typeof overfit.version === "number", "recipe has version");
  assert(typeof overfit.label === "string" && overfit.label.length > 0, "recipe has label");
  assert(typeof overfit.description === "string" && overfit.description.length > 0, "recipe has description");
  assert(typeof overfit.seed === "number", "recipe has seed");

  // 16-18: Optimizer fields
  assert(typeof overfit.optimizer.lr === "number" && overfit.optimizer.lr > 0, "recipe has learning rate");
  assert(overfit.optimizer.type === "adamw" || overfit.optimizer.type === "sgd", "optimizer type is valid");
  assert(typeof overfit.gradientAccumulation === "number", "recipe has gradientAccumulation");

  // 19-21: Scheduler
  assert(typeof overfit.scheduler === "object" && overfit.scheduler !== null, "recipe has scheduler");
  assert(typeof overfit.warmupSteps === "number", "recipe has warmupSteps");
  assert(typeof overfit.epochs === "number" && overfit.epochs > 0, "epochs is positive");

  // ── saveRecipe ──
  console.log("saveRecipe:");

  // 22-24: Save custom recipe
  const custom: TrainingRecipe = {
    name: "test-custom-recipe",
    label: "Test Custom Recipe",
    description: "A custom recipe for testing",
    version: 1,
    model: "tiny",
    dataset: { dataset: "inline", blockSize: 32, batchSize: 2 },
    optimizer: { type: "adamw", lr: 0.001 },
    scheduler: { type: "none" },
    epochs: 5,
    gradientAccumulation: 1,
    warmupSteps: 0,
    seed: 42,
  };
  saveRecipe(custom);
  assert(hasRecipe("test-custom-recipe"), "custom recipe is saved");

  // 25: Can retrieve saved recipe
  const retrieved = loadRecipe("test-custom-recipe");
  assert(retrieved.name === "test-custom-recipe" && retrieved.epochs === 5, "retrieved custom recipe matches");

  // 26: Cannot overwrite built-in
  assertThrows(() => saveRecipe({ ...custom, name: "tiny-overfit-test" }), "cannot overwrite built-in recipe");

  // 27: Cannot duplicate custom recipe name
  assertThrows(() => saveRecipe(custom), "cannot duplicate custom recipe name");

  // ── listRecipeNames / listRecipes ──
  console.log("listRecipeNames / listRecipes:");

  // 28-30
  const names = listRecipeNames();
  assert(names.includes("tiny-overfit-test"), "listRecipeNames includes built-in");
  assert(names.includes("tinystories-tiny"), "listRecipeNames includes tinystories-tiny");
  assert(names.includes("test-custom-recipe"), "listRecipeNames includes custom recipe");

  // 31-32
  const allRecipes = listRecipes();
  assert(allRecipes.length >= 4, "listRecipes returns at least 4 recipes");
  assert(allRecipes.every(r => r.name && r.version === 1), "all recipes have name and version");

  // ── hasRecipe ──
  console.log("hasRecipe:");

  // 33-35
  assert(hasRecipe("tiny-overfit-test"), "hasRecipe for built-in returns true");
  assert(hasRecipe("test-custom-recipe"), "hasRecipe for custom returns true");
  assert(!hasRecipe("nonexistent"), "hasRecipe for nonexistent returns false");

  // ── summarizeRecipe ──
  console.log("summarizeRecipe:");

  // 36-38
  const summary = summarizeRecipe(overfit);
  assert(typeof summary === "string" && summary.length > 0, "summarizeRecipe returns string");
  assert(summary.includes(overfit.name), "summary includes recipe name");
  assert(summary.includes(overfit.model), "summary includes model name");

  // 39-40
  assert(summary.includes(String(overfit.epochs)), "summary includes epochs");
  assert(summary.includes(overfit.optimizer.type), "summary includes optimizer type");

  // ── diffRecipes ──
  console.log("diffRecipes:");

  // 41-43: Identical recipes have no diffs
  const diffsSame = diffRecipes(overfit, overfit);
  assert(diffsSame.length === 0, "identical recipes produce no diffs");

  // 44-45: Different model shows diff
  const diffsModel = diffRecipes(tsTiny, tsSmall);
  assert(diffsModel.some(d => d.includes("model")), "diff detects model change");

  // 46-47: Different lr shows diff
  const modifiedOverfit = { ...overfit, optimizer: { ...overfit.optimizer, lr: 0.01 } };
  const diffsLR = diffRecipes(overfit, modifiedOverfit);
  assert(diffsLR.some(d => d.includes("lr")), "diff detects lr change");

  // 48: Different epochs shows diff
  const modifiedEpochs = { ...overfit, epochs: 30 };
  const diffsEpochs = diffRecipes(overfit, modifiedEpochs);
  assert(diffsEpochs.some(d => d.includes("epochs")), "diff detects epochs change");

  // ── validateRecipe ──
  console.log("validateRecipe:");

  // 49-51: Valid recipes pass (production recipe)
  const foundation = loadRecipe("bilingual-foundation");
  assert(foundation.name === "bilingual-foundation", "loads bilingual-foundation recipe");
  assert(foundation.dataset.dataset === "bilingual", "bilingual-foundation uses bilingual dataset");
  validateRecipe(foundation); // Should not throw

  // 51.5: legacy unavailable-dataset recipes now fail validation
  assertThrows(() => validateRecipe(overfit), "validateRecipe throws for synthetic (unavailable)");

  // 52-55: Invalid recipes throw
  assertThrows(() => validateRecipe(null), "validateRecipe throws for null");
  assertThrows(() => validateRecipe({}), "validateRecipe throws for empty object");
  assertThrows(() => validateRecipe({ name: "", version: 1 }), "validateRecipe throws for missing fields");
  assertThrows(() => validateRecipe({ ...foundation, epochs: 0 }), "validateRecipe throws for epochs=0");

  // ── recipeToJSON / recipeFromJSON ──
  console.log("recipeToJSON / recipeFromJSON:");

  // 56-58: Roundtrip
  const json = recipeToJSON(foundation);
  assert(typeof json === "object" && json !== null, "recipeToJSON returns object");
  assert(json.name === foundation.name, "recipeToJSON preserves name");

  // 59-60
  const restored = recipeFromJSON(json);
  assert(restored.name === foundation.name, "recipeFromJSON restores name");
  assert(restored.epochs === foundation.epochs, "recipeFromJSON restores epochs");

  // 61-62: recipeFromJSON validates
  assertThrows(() => recipeFromJSON(null), "recipeFromJSON throws for null");
  assertThrows(() => recipeFromJSON({ name: "x" }), "recipeFromJSON throws for invalid data");

  console.log(`\nTrainingRecipe: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

if (require.main === module) {
  runTrainingRecipeTests();
}
