// ============================================================
// Phase 56 — experimentLauncherAdapter Tests
// ============================================================
// Tests for the experiment launcher adapter layer.
// Ensures all pure functions work correctly with valid,
// invalid, and edge-case inputs.

// ============================================================
// localStorage polyfill for Node.js test environment
// ============================================================

(globalThis as Record<string, unknown>).localStorage ??= (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
  };
})();

import {
  getAvailableModels,
  getModelOption,
  getAvailableRecipes,
  getRecipesForModel,
  getRecipeOption,
  getDatasetOptions,
  getDatasetOption,
  buildExperimentPreview,
  validateLaunchConfig,
  getWorkspaceOverview,
  getLatestExperiment,
  hasExperimentHistory,
  generateExperimentId,
  suggestExperimentName,
} from "../experimentLauncherAdapter";
import type {
  LaunchConfig,
  ModelOption,
  RecipeOption,
  DatasetOption,
} from "../experimentLauncherAdapter";
import { clear as clearStore } from "@/lib/minimind/experiments/history/ExperimentStore";

// ============================================================
// Helpers
// ============================================================

function makeValidConfig(overrides: Partial<LaunchConfig> = {}): LaunchConfig {
  return {
    model: "production",
    recipe: "bilingual-foundation",
    dataset: "bilingual",
    seed: 42,
    experimentName: "test-experiment",
    ...overrides,
  };
}

function runAllTests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(`Assertion failed: ${msg}`);
  }

  function assertThrows(fn: () => void, msg: string) {
    try {
      fn();
      throw new Error(`Expected error but none thrown: ${msg}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Expected error")) {
        throw err;
      }
      // Expected error — test passes
    }
  }

  // ==========================================================
  // getAvailableModels
  // ==========================================================

  console.log("\n--- getAvailableModels ---");

  test("returns non-empty array", () => {
    const models = getAvailableModels();
    assert(models.length > 0, "Should return at least 1 model");
  });

  test("returns ModelOption objects with required fields", () => {
    const models = getAvailableModels();
    for (const m of models) {
      assert(typeof m.value === "string" && m.value.length > 0, "value must be non-empty string");
      assert(typeof m.label === "string" && m.label.length > 0, "label must be non-empty string");
      assert(typeof m.description === "string", "description must be string");
      assert(typeof m.estimatedParams === "number" && m.estimatedParams > 0, "estimatedParams must be positive");
      assert(typeof m.architecture === "string" && m.architecture.length > 0, "architecture must be non-empty string");
    }
  });

  test("includes tiny model", () => {
    const models = getAvailableModels();
    const tiny = models.find((m) => m.value === "tiny");
    assert(tiny !== undefined, "Should include tiny model");
    assert(tiny!.label === "MiniMind Tiny", "Tiny label should match");
  });

  test("includes small model", () => {
    const models = getAvailableModels();
    const small = models.find((m) => m.value === "small");
    assert(small !== undefined, "Should include small model");
  });

  test("includes base model", () => {
    const models = getAvailableModels();
    const base = models.find((m) => m.value === "base");
    assert(base !== undefined, "Should include base model");
  });

  test("models are sorted by param count ascending", () => {
    const models = getAvailableModels();
    for (let i = 1; i < models.length; i++) {
      assert(
        models[i]!.estimatedParams >= models[i - 1]!.estimatedParams,
        `Model ${models[i]!.value} should have >= params than ${models[i - 1]!.value}`
      );
    }
  });

  test("architecture string contains key fields", () => {
    const models = getAvailableModels();
    for (const m of models) {
      assert(m.architecture.includes("dModel="), "architecture should mention dModel");
      assert(m.architecture.includes("layers"), "architecture should mention layers");
      assert(m.architecture.includes("heads"), "architecture should mention heads");
    }
  });

  // ==========================================================
  // getModelOption
  // ==========================================================

  console.log("\n--- getModelOption ---");

  test("returns correct option for tiny", () => {
    const opt = getModelOption("tiny");
    assert(opt !== undefined, "Should find tiny");
    assert(opt!.value === "tiny", "value should be tiny");
    assert(opt!.label === "MiniMind Tiny", "label should match");
  });

  test("returns correct option for small", () => {
    const opt = getModelOption("small");
    assert(opt !== undefined, "Should find small");
    assert(opt!.estimatedParams > 1_000_000, "Small should have > 1M params");
  });

  test("returns undefined for unknown model", () => {
    const opt = getModelOption("nonexistent-model-xyz");
    assert(opt === undefined, "Should return undefined for unknown model");
  });

  test("returns undefined for empty string", () => {
    const opt = getModelOption("");
    assert(opt === undefined, "Should return undefined for empty string");
  });

  // ==========================================================
  // getAvailableRecipes
  // ==========================================================

  console.log("\n--- getAvailableRecipes ---");

  test("returns non-empty array", () => {
    const recipes = getAvailableRecipes();
    assert(recipes.length > 0, "Should return at least 1 recipe");
  });

  test("returns RecipeOption objects with required fields", () => {
    const recipes = getAvailableRecipes();
    for (const r of recipes) {
      assert(typeof r.value === "string" && r.value.length > 0, "value must be non-empty");
      assert(typeof r.label === "string" && r.label.length > 0, "label must be non-empty");
      assert(typeof r.description === "string", "description must be string");
      assert(typeof r.model === "string" && r.model.length > 0, "model must be non-empty");
      assert(typeof r.dataset === "string" && r.dataset.length > 0, "dataset must be non-empty");
      assert(typeof r.epochs === "number" && r.epochs > 0, "epochs must be positive");
    }
  });

  test("includes bilingual-foundation recipe", () => {
    const recipes = getAvailableRecipes();
    const found = recipes.find((r) => r.value === "bilingual-foundation");
    assert(found !== undefined, "Should include bilingual-foundation");
    assert(found!.model === "production", "bilingual-foundation should target production model");
    assert(found!.dataset === "bilingual", "bilingual-foundation should use bilingual dataset");
  });

  test("excludes unavailable-dataset recipes", () => {
    const recipes = getAvailableRecipes();
    const values = recipes.map((r) => r.value);
    assert(!values.includes("tinystories-tiny"), "tinystories-tiny (tinystories) excluded");
    assert(!values.includes("tinystories-small"), "tinystories-small (tinystories) excluded");
    assert(!values.includes("tiny-overfit-test"), "tiny-overfit-test (synthetic) excluded");
  });

  test("recipes are sorted alphabetically by label", () => {
    const recipes = getAvailableRecipes();
    for (let i = 1; i < recipes.length; i++) {
      assert(
        recipes[i]!.label.localeCompare(recipes[i - 1]!.label) >= 0,
        `Recipes should be sorted alphabetically: ${recipes[i - 1]!.label} vs ${recipes[i]!.label}`
      );
    }
  });

  // ==========================================================
  // getRecipesForModel
  // ==========================================================

  console.log("\n--- getRecipesForModel ---");

  test("filters recipes for production model", () => {
    const recipes = getRecipesForModel("production");
    assert(recipes.length > 0, "Should have recipes for production");
    for (const r of recipes) {
      assert(r.model === "production", `Recipe ${r.value} should target production`);
    }
  });

  test("returns empty for models with no launchable recipe", () => {
    // tiny/small reference models have only unavailable-dataset recipes,
    // so no launchable recipes surface for them.
    assert(getRecipesForModel("tiny").length === 0, "tiny has no launchable recipe");
    assert(getRecipesForModel("small").length === 0, "small has no launchable recipe");
  });

  test("returns empty for unknown model", () => {
    const recipes = getRecipesForModel("nonexistent");
    assert(recipes.length === 0, "Should return empty for unknown model");
  });

  // ==========================================================
  // getRecipeOption
  // ==========================================================

  console.log("\n--- getRecipeOption ---");

  test("returns correct option for bilingual-foundation", () => {
    const opt = getRecipeOption("bilingual-foundation");
    assert(opt !== undefined, "Should find bilingual-foundation");
    assert(opt!.model === "production", "model should be production");
    assert(opt!.dataset === "bilingual", "dataset should be bilingual");
    assert(opt!.epochs === 5, "epochs should be 5");
  });

  test("returns undefined for unknown recipe", () => {
    const opt = getRecipeOption("nonexistent-recipe");
    assert(opt === undefined, "Should return undefined");
  });

  // ==========================================================
  // getDatasetOptions
  // ==========================================================

  console.log("\n--- getDatasetOptions ---");

  test("returns non-empty array", () => {
    const datasets = getDatasetOptions();
    assert(datasets.length > 0, "Should return at least 1 dataset");
  });

  test("includes bilingual as the production dataset", () => {
    const ds = getDatasetOptions().find((d) => d.value === "bilingual");
    assert(ds !== undefined, "Should include bilingual");
    assert(ds!.kind === "production", "bilingual should be marked production");
  });

  test("excludes unavailable legacy datasets", () => {
    const values = getDatasetOptions().map((d) => d.value);
    assert(!values.includes("tinystories"), "Should NOT include tinystories");
    assert(!values.includes("synthetic"), "Should NOT include synthetic");
    assert(!values.includes("textfile"), "Should NOT include textfile");
  });

  test("all have required fields", () => {
    for (const d of getDatasetOptions()) {
      assert(typeof d.value === "string" && d.value.length > 0, "value must be non-empty");
      assert(typeof d.label === "string" && d.label.length > 0, "label must be non-empty");
      assert(typeof d.description === "string", "description must be string");
      assert(["tiny", "small", "medium", "large"].includes(d.size), "size must be valid category");
      assert(d.kind === "production" || d.kind === "fixture", "kind must be production or fixture");
    }
  });

  // ==========================================================
  // getDatasetOption
  // ==========================================================

  console.log("\n--- getDatasetOption ---");

  test("returns option for bilingual", () => {
    const opt = getDatasetOption("bilingual");
    assert(opt !== undefined, "Should find bilingual");
    assert(opt!.label === "Bilingual", "label should match");
    assert(opt!.kind === "production", "kind should be production");
  });

  test("returns undefined for unavailable legacy dataset", () => {
    const opt = getDatasetOption("tinystories");
    assert(opt === undefined, "Should return undefined for tinystories");
  });

  test("returns undefined for unknown", () => {
    const opt = getDatasetOption("unknown-dataset");
    assert(opt === undefined, "Should return undefined");
  });

  // ==========================================================
  // buildExperimentPreview
  // ==========================================================

  console.log("\n--- buildExperimentPreview ---");

  test("builds preview for valid config", () => {
    const preview = buildExperimentPreview(makeValidConfig());
    assert(preview !== null, "Preview should not be null");
    assert(preview.model.name === "production", "Model should be production");
    assert(preview.recipe.name === "bilingual-foundation", "Recipe should match");
    assert(preview.totalParams > 0, "Total params should be positive");
    assert(preview.estimatedSteps > 0, "Estimated steps should be positive");
    assert(preview.summary.length > 0, "Summary should have items");
  });

  test("throws for unknown model", () => {
    assertThrows(
      () => buildExperimentPreview(makeValidConfig({ model: "nonexistent" })),
      "Should throw for unknown model"
    );
  });

  test("throws for unknown recipe", () => {
    assertThrows(
      () => buildExperimentPreview(makeValidConfig({ recipe: "nonexistent" })),
      "Should throw for unknown recipe"
    );
  });

  test("preview includes estimated time", () => {
    const preview = buildExperimentPreview(makeValidConfig());
    assert(
      preview.estimatedTime.length > 0,
      "Estimated time should be non-empty"
    );
  });

  test("preview summary includes key config details", () => {
    const preview = buildExperimentPreview(makeValidConfig());
    const fullText = preview.summary.join(" ");
    assert(fullText.includes("MiniMind Production"), "Summary should include model label");
    assert(fullText.includes("42"), "Summary should include seed");
    assert(fullText.includes("bilingual"), "Summary should include dataset");
  });

  test("handles custom block size", () => {
    const preview = buildExperimentPreview(
      makeValidConfig({ blockSize: 256 })
    );
    const fullText = preview.summary.join(" ");
    assert(fullText.includes("256"), "Summary should include custom block size");
  });

  test("handles custom epochs", () => {
    const preview = buildExperimentPreview(
      makeValidConfig({ epochs: 5 })
    );
    const fullText = preview.summary.join(" ");
    assert(fullText.includes("5"), "Summary should include custom epochs");
  });

  // ==========================================================
  // validateLaunchConfig
  // ==========================================================

  console.log("\n--- validateLaunchConfig ---");

  test("validates a correct config", () => {
    const result = validateLaunchConfig(makeValidConfig());
    assert(result.valid === true, "Should be valid");
    assert(result.errors.length === 0, "Should have no errors");
  });

  test("reports error for missing model", () => {
    const result = validateLaunchConfig(makeValidConfig({ model: "" }));
    assert(result.valid === false, "Should be invalid");
    assert(
      result.errors.some((e) => e.includes("Model")),
      "Should mention Model in error"
    );
  });

  test("reports error for unknown model", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ model: "gigantic" })
    );
    assert(result.valid === false, "Should be invalid");
    assert(result.errors.length > 0, "Should have errors");
  });

  test("reports error for missing recipe", () => {
    const result = validateLaunchConfig(makeValidConfig({ recipe: "" }));
    assert(result.valid === false, "Should be invalid");
    assert(
      result.errors.some((e) => e.includes("recipe") || e.includes("Recipe")),
      "Should mention recipe in error"
    );
  });

  test("reports error for unknown recipe", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ recipe: "magic-recipe" })
    );
    assert(result.valid === false, "Should be invalid");
  });

  test("reports error for invalid seed (negative)", () => {
    const result = validateLaunchConfig(makeValidConfig({ seed: -1 }));
    assert(result.valid === false, "Should be invalid");
    assert(
      result.errors.some((e) => e.includes("Seed") || e.includes("seed")),
      "Should mention seed"
    );
  });

  test("reports error for non-integer seed", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ seed: 3.14 })
    );
    assert(result.valid === false, "Should be invalid");
  });

  test("reports error for missing experiment name", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ experimentName: "" })
    );
    assert(result.valid === false, "Should be invalid");
    assert(
      result.errors.some((e) => e.includes("name") || e.includes("Name")),
      "Should mention name"
    );
  });

  test("reports error for overly long experiment name", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ experimentName: "a".repeat(121) })
    );
    assert(result.valid === false, "Should be invalid");
  });

  test("reports error for invalid block size", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ blockSize: 1 })
    );
    assert(result.valid === false, "Should be invalid");
  });

  test("reports error for invalid batch size", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ batchSize: 0 })
    );
    assert(result.valid === false, "Should be invalid");
  });

  test("reports error for invalid epochs", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ epochs: -5 })
    );
    assert(result.valid === false, "Should be invalid");
  });

  test("warns when recipe targets different model", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ model: "small", recipe: "tinystories-tiny" })
    );
    // Should still be valid (warning, not error)
    assert(result.valid === true, "Should still be valid with mismatched model/recipe");
    assert(
      result.warnings.some(
        (w) => w.includes("designed for model") || w.includes("selected")
      ),
      "Should warn about model/recipe mismatch"
    );
  });

  test("warns about default seed 42", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ seed: 42 })
    );
    assert(
      result.warnings.some((w) => w.includes("42") || w.includes("seed")),
      "Should warn about default seed"
    );
  });

  test("reports error for missing dataset", () => {
    const result = validateLaunchConfig(makeValidConfig({ dataset: "" }));
    assert(result.valid === false, "Should be invalid");
  });

  test("reports error for unknown dataset", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ dataset: "wikipedia" })
    );
    assert(result.valid === false, "Should be invalid");
  });

  test("valid config with overrides passes", () => {
    const result = validateLaunchConfig(
      makeValidConfig({ blockSize: 128, batchSize: 16, epochs: 5 })
    );
    assert(result.valid === true, "Should be valid with overrides");
    assert(result.errors.length === 0, "Should have no errors");
  });

  test("seed=0 is valid", () => {
    const result = validateLaunchConfig(makeValidConfig({ seed: 0 }));
    assert(result.valid === true, "Seed 0 should be valid");
  });

  // ==========================================================
  // generateExperimentId
  // ==========================================================

  console.log("\n--- generateExperimentId ---");

  test("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateExperimentId());
    }
    assert(ids.size === 100, "All 100 generated IDs should be unique");
  });

  test("generated IDs have exp- prefix", () => {
    for (let i = 0; i < 20; i++) {
      const id = generateExperimentId();
      assert(id.startsWith("exp-"), `ID "${id}" should start with exp-`);
    }
  });

  test("generated IDs are reasonable length", () => {
    for (let i = 0; i < 20; i++) {
      const id = generateExperimentId();
      assert(id.length > 10, `ID "${id}" should be > 10 chars`);
      assert(id.length < 80, `ID "${id}" should be < 80 chars`);
    }
  });

  // ==========================================================
  // suggestExperimentName
  // ==========================================================

  console.log("\n--- suggestExperimentName ---");

  test("generates name with model and recipe", () => {
    const name = suggestExperimentName(makeValidConfig());
    assert(name.includes("MiniMind"), "Name should include model label");
    assert(name.includes("Bilingual Foundation"), "Name should include recipe label");
  });

  test("generates name with current date", () => {
    const name = suggestExperimentName(makeValidConfig());
    const today = new Date().toISOString().slice(0, 10);
    assert(name.includes(today), "Name should include today's date");
  });

  // ==========================================================
  // hasExperimentHistory / getWorkspaceOverview
  // ==========================================================

  console.log("\n--- hasExperimentHistory / getWorkspaceOverview ---");

  test("hasExperimentHistory returns boolean", () => {
    const result = hasExperimentHistory();
    assert(typeof result === "boolean", "Should return boolean");
  });

  test("getWorkspaceOverview returns valid structure", () => {
    const overview = getWorkspaceOverview();
    assert(Array.isArray(overview.recent), "recent should be array");
    assert(Array.isArray(overview.running), "running should be array");
    assert(Array.isArray(overview.completed), "completed should be array");
    assert(typeof overview.stats === "object", "stats should be object");
    assert(typeof overview.stats.total === "number", "stats.total should be number");
    assert(typeof overview.stats.completed === "number", "stats.completed should be number");
    assert(typeof overview.stats.running === "number", "stats.running should be number");
    assert(typeof overview.stats.failed === "number", "stats.failed should be number");
  });

  test("getLatestExperiment returns null when empty", () => {
    // Clear store first to ensure empty state
    clearStore();
    const latest = getLatestExperiment();
    assert(latest === null, "Should return null when no experiments");
  });

  // ==========================================================
  // Summary
  // ==========================================================

  console.log(`\n${"=".repeat(50)}`);
  console.log(`experimentLauncherAdapter: ${passed} passed, ${failed} failed (${passed + failed} tests)`);
  console.log(`${"=".repeat(50)}`);

  return { passed, failed };
}

// Allow running directly
if (typeof require !== "undefined" && require.main === module) {
  const result = runAllTests();
  if (result.failed > 0) {
    process.exit(1);
  }
  console.log(`\nAll ${result.passed + result.failed} tests passed!`);
}

export { runAllTests as runExperimentLauncherAdapterTests };
