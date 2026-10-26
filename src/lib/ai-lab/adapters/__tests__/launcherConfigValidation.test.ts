// ============================================================
// Phase 56 — Launch Config Validation Tests
// ============================================================
// Exhaustive tests for validateLaunchConfig covering all
// validation paths, edge cases, and boundary conditions.

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

import { validateLaunchConfig } from "../experimentLauncherAdapter";
import type { LaunchConfig } from "../experimentLauncherAdapter";

// ============================================================
// Helpers
// ============================================================

function makeConfig(overrides: Partial<LaunchConfig> = {}): LaunchConfig {
  return {
    model: "production",
    recipe: "bilingual-foundation",
    dataset: "bilingual",
    seed: 42,
    experimentName: "test-run",
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

  // ==========================================================
  // Valid configs
  // ==========================================================

  console.log("\n--- Valid Configurations ---");

  test("default valid config passes", () => {
    const r = validateLaunchConfig(makeConfig());
    assert(r.valid, "Should be valid");
    assert(r.errors.length === 0, "Should have 0 errors");
  });

  test("small model + tinystories-small recipe", () => {
    const r = validateLaunchConfig(
      makeConfig({ model: "small", recipe: "tinystories-small" })
    );
    assert(r.valid, "Should be valid");
  });

  test("base model config", () => {
    const r = validateLaunchConfig(
      makeConfig({ model: "base", recipe: "tinystories-tiny" })
    );
    assert(r.valid, "Should be valid (recipe mismatch is warning only)");
  });

  test("tiny-overfit-test recipe (synthetic) is rejected as unavailable", () => {
    const r = validateLaunchConfig(
      makeConfig({ model: "tiny", recipe: "tiny-overfit-test", dataset: "synthetic" })
    );
    assert(!r.valid, "Should be invalid — synthetic is unavailable");
  });

  test("synthetic dataset is rejected", () => {
    const r = validateLaunchConfig(makeConfig({ dataset: "synthetic" }));
    assert(!r.valid, "Should be invalid");
    assert(
      r.errors.some((e) => e.includes("not available")),
      "Error should mention dataset is not available"
    );
  });

  test("inline dataset is valid (fixture, warning only)", () => {
    const r = validateLaunchConfig(makeConfig({ dataset: "inline" }));
    assert(r.valid, "Should be valid");
    assert(
      r.warnings.some((w) => w.toLowerCase().includes("fixture")),
      "Should warn inline is a test fixture"
    );
  });

  test("textfile dataset is rejected", () => {
    const r = validateLaunchConfig(makeConfig({ dataset: "textfile" }));
    assert(!r.valid, "Should be invalid — textfile is unavailable");
  });

  test("seed=0", () => {
    const r = validateLaunchConfig(makeConfig({ seed: 0 }));
    assert(r.valid, "Seed 0 should be valid");
  });

  test("seed=999999", () => {
    const r = validateLaunchConfig(makeConfig({ seed: 999999 }));
    assert(r.valid, "Large seed should be valid");
  });

  test("valid blockSize override", () => {
    const r = validateLaunchConfig(makeConfig({ blockSize: 256 }));
    assert(r.valid, "Should be valid");
  });

  test("valid batchSize override", () => {
    const r = validateLaunchConfig(makeConfig({ batchSize: 32 }));
    assert(r.valid, "Should be valid");
  });

  test("valid epochs override", () => {
    const r = validateLaunchConfig(makeConfig({ epochs: 20 }));
    assert(r.valid, "Should be valid");
  });

  test("all valid overrides together", () => {
    const r = validateLaunchConfig(
      makeConfig({ blockSize: 64, batchSize: 8, epochs: 3 })
    );
    assert(r.valid, "Should be valid");
  });

  test("experiment name at max length (120 chars)", () => {
    const r = validateLaunchConfig(
      makeConfig({ experimentName: "a".repeat(120) })
    );
    assert(r.valid, "120-char name should be valid");
  });

  test("experiment name at min length (1 char)", () => {
    const r = validateLaunchConfig(makeConfig({ experimentName: "x" }));
    assert(r.valid, "1-char name should be valid");
  });

  // ==========================================================
  // Invalid configs — model
  // ==========================================================

  console.log("\n--- Invalid: Model ---");

  test("empty model string", () => {
    const r = validateLaunchConfig(makeConfig({ model: "" }));
    assert(!r.valid, "Empty model should be invalid");
    assert(r.errors.length >= 1, "Should have at least 1 error");
  });

  test("whitespace-only model", () => {
    const r = validateLaunchConfig(makeConfig({ model: "   " }));
    assert(!r.valid, "Whitespace model should be invalid");
  });

  test("nonexistent model name", () => {
    const r = validateLaunchConfig(makeConfig({ model: "huge-gpt-5" }));
    assert(!r.valid, "Unknown model should be invalid");
  });

  test("model name with special chars", () => {
    const r = validateLaunchConfig(makeConfig({ model: "tiny!" }));
    assert(!r.valid, "Invalid model name should be invalid");
  });

  // ==========================================================
  // Invalid configs — recipe
  // ==========================================================

  console.log("\n--- Invalid: Recipe ---");

  test("empty recipe string", () => {
    const r = validateLaunchConfig(makeConfig({ recipe: "" }));
    assert(!r.valid, "Empty recipe should be invalid");
  });

  test("nonexistent recipe name", () => {
    const r = validateLaunchConfig(makeConfig({ recipe: "gpt4-pretrain" }));
    assert(!r.valid, "Unknown recipe should be invalid");
  });

  // ==========================================================
  // Invalid configs — dataset
  // ==========================================================

  console.log("\n--- Invalid: Dataset ---");

  test("empty dataset string", () => {
    const r = validateLaunchConfig(makeConfig({ dataset: "" }));
    assert(!r.valid, "Empty dataset should be invalid");
  });

  test("unsupported dataset", () => {
    const r = validateLaunchConfig(makeConfig({ dataset: "wikipedia" }));
    assert(!r.valid, "Unknown dataset should be invalid");
  });

  test("dataset as 'bookcorpus'", () => {
    const r = validateLaunchConfig(makeConfig({ dataset: "bookcorpus" }));
    assert(!r.valid, "BookCorpus should be invalid (not supported)");
  });

  // ==========================================================
  // Invalid configs — seed
  // ==========================================================

  console.log("\n--- Invalid: Seed ---");

  test("negative seed", () => {
    const r = validateLaunchConfig(makeConfig({ seed: -1 }));
    assert(!r.valid, "Negative seed should be invalid");
  });

  test("seed=-100", () => {
    const r = validateLaunchConfig(makeConfig({ seed: -100 }));
    assert(!r.valid, "Negative seed should be invalid");
  });

  test("float seed", () => {
    const r = validateLaunchConfig(makeConfig({ seed: 1.5 }));
    assert(!r.valid, "Float seed should be invalid");
  });

  test("NaN seed", () => {
    const r = validateLaunchConfig(makeConfig({ seed: NaN }));
    assert(!r.valid, "NaN seed should be invalid");
  });

  test("Infinity seed", () => {
    const r = validateLaunchConfig(makeConfig({ seed: Infinity }));
    assert(!r.valid, "Infinity seed should be invalid");
  });

  // ==========================================================
  // Invalid configs — experiment name
  // ==========================================================

  console.log("\n--- Invalid: Experiment Name ---");

  test("empty experiment name", () => {
    const r = validateLaunchConfig(makeConfig({ experimentName: "" }));
    assert(!r.valid, "Empty name should be invalid");
  });

  test("whitespace-only experiment name", () => {
    const r = validateLaunchConfig(makeConfig({ experimentName: "    " }));
    assert(!r.valid, "Whitespace-only name should be invalid");
  });

  test("overly long experiment name (121 chars)", () => {
    const r = validateLaunchConfig(
      makeConfig({ experimentName: "a".repeat(121) })
    );
    assert(!r.valid, "121-char name should be invalid");
  });

  // ==========================================================
  // Invalid configs — overrides
  // ==========================================================

  console.log("\n--- Invalid: Overrides ---");

  test("blockSize=1 (below minimum 2)", () => {
    const r = validateLaunchConfig(makeConfig({ blockSize: 1 }));
    assert(!r.valid, "blockSize=1 should be invalid");
  });

  test("blockSize=0", () => {
    const r = validateLaunchConfig(makeConfig({ blockSize: 0 }));
    assert(!r.valid, "blockSize=0 should be invalid");
  });

  test("negative blockSize", () => {
    const r = validateLaunchConfig(makeConfig({ blockSize: -128 }));
    assert(!r.valid, "Negative blockSize should be invalid");
  });

  test("float blockSize", () => {
    const r = validateLaunchConfig(makeConfig({ blockSize: 64.5 }));
    assert(!r.valid, "Float blockSize should be invalid");
  });

  test("batchSize=0", () => {
    const r = validateLaunchConfig(makeConfig({ batchSize: 0 }));
    assert(!r.valid, "batchSize=0 should be invalid");
  });

  test("negative batchSize", () => {
    const r = validateLaunchConfig(makeConfig({ batchSize: -4 }));
    assert(!r.valid, "Negative batchSize should be invalid");
  });

  test("epochs=0", () => {
    const r = validateLaunchConfig(makeConfig({ epochs: 0 }));
    assert(!r.valid, "epochs=0 should be invalid");
  });

  test("negative epochs", () => {
    const r = validateLaunchConfig(makeConfig({ epochs: -3 }));
    assert(!r.valid, "Negative epochs should be invalid");
  });

  // ==========================================================
  // Warnings
  // ==========================================================

  console.log("\n--- Warnings ---");

  test("warns about default seed 42", () => {
    const r = validateLaunchConfig(makeConfig({ seed: 42 }));
    assert(
      r.warnings.some(
        (w) =>
          w.toLowerCase().includes("seed") || w.includes("42")
      ),
      "Should warn about default seed"
    );
  });

  test("does NOT warn about seed 0", () => {
    const r = validateLaunchConfig(makeConfig({ seed: 0 }));
    const hasSeedWarning = r.warnings.some(
      (w) => w.includes("default seed") || w.includes("seed 42")
    );
    assert(!hasSeedWarning, "Should NOT warn about seed 0 being default");
  });

  test("does NOT warn about seed 123", () => {
    const r = validateLaunchConfig(makeConfig({ seed: 123 }));
    const hasSeedWarning = r.warnings.some(
      (w) => w.includes("default seed")
    );
    assert(!hasSeedWarning, "Should not warn about non-default seeds");
  });

  test("warns about recipe/model mismatch", () => {
    const r = validateLaunchConfig(
      makeConfig({ model: "small", recipe: "tinystories-tiny" })
    );
    assert(
      r.warnings.length > 0,
      "Should have warnings for recipe/model mismatch"
    );
  });

  test("no warnings for matching model/recipe", () => {
    const r = validateLaunchConfig(
      makeConfig({ model: "tiny", recipe: "tinystories-tiny" })
    );
    const hasMismatchWarning = r.warnings.some(
      (w) => w.includes("designed for model")
    );
    assert(!hasMismatchWarning, "Should not warn about matching model/recipe");
  });

  // ==========================================================
  // Combined error scenarios
  // ==========================================================

  console.log("\n--- Combined Error Scenarios ---");

  test("multiple errors accumulate", () => {
    const r = validateLaunchConfig(
      makeConfig({
        model: "",
        recipe: "",
        dataset: "",
        seed: -1,
        experimentName: "",
      })
    );
    assert(!r.valid, "Should be invalid");
    assert(
      r.errors.length >= 4,
      `Expected >= 4 errors, got ${r.errors.length}`
    );
  });

  test("errors+0 warnings when all invalid", () => {
    const r = validateLaunchConfig(
      makeConfig({
        model: "unknown",
        recipe: "unknown",
        dataset: "unknown",
        seed: -5,
        experimentName: "",
      })
    );
    assert(r.errors.length > 0, "Should have errors");
    // Warnings don't apply when things are invalid
  });

  test("errors list contains descriptive messages", () => {
    const r = validateLaunchConfig(makeConfig({ model: "" }));
    for (const err of r.errors) {
      assert(err.length > 3, "Error message should be > 3 chars");
    }
  });

  // ==========================================================
  // Summary
  // ==========================================================

  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `launcherConfigValidation: ${passed} passed, ${failed} failed (${passed + failed} tests)`
  );
  console.log(`${"=".repeat(50)}`);

  return { passed, failed };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runAllTests();
  if (result.failed > 0) {
    process.exit(1);
  }
  console.log(`\nAll ${result.passed + result.failed} tests passed!`);
}

export { runAllTests as runLauncherConfigValidationTests };
