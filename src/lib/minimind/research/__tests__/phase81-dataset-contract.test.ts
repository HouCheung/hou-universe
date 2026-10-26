// ============================================================
// Phase 81 — Dataset Contract Identity Tests
// ============================================================
// Covers the convergence of the dataset contract onto a single
// production training dataset (`bilingual`) that flows through
// the whole chain:
//
//   UI (getDatasetOptions) → recipe (TrainingRecipe)
//     → validation (validateRecipe / validateLaunchConfig)
//     → resolution (resolveTrainingDataset)
//     → launcher (buildSessionConfig) → runtime (spawnWorker)
//     → checkpoint metadata (saveCheckpoint.trainingDataset)
//
// Asserts the identity `recipe.dataset === "bilingual"`,
// `resolvedDataset.id === "bilingual"`, and
// `checkpoint.trainingDataset === "bilingual"` are consistent.
//
// Honesty boundary (documented, not tested here): the bilingual
// corpus is ~84 internally-authored seed samples — enough to exercise
// the zh/en/mixed tokenizer + dataset pipeline, NOT enough to claim
// fluent bilingual generation.
// ============================================================

// ============================================================
// localStorage / Blob polyfills (adapter + workspace import path)
// ============================================================

if (!(globalThis as Record<string, unknown>).localStorage) {
  const store = new Map<string, string>();
  const ls = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
  (globalThis as Record<string, unknown>).localStorage = ls;
  (globalThis as Record<string, unknown>).window = { localStorage: ls };
}

if (typeof (globalThis as Record<string, unknown>).Blob === "undefined") {
  (globalThis as Record<string, unknown>).Blob = class {
    size: number;
    constructor(parts: unknown[]) {
      this.size = parts
        .map((p) => (typeof p === "string" ? p.length : 0))
        .reduce((a, b) => a + b, 0);
    }
  };
}

// ============================================================
// Imports
// ============================================================

import {
  datasetKind,
  resolveTrainingDataset,
} from "../../data/datasetRegistry";

import {
  loadRecipe,
  validateRecipe,
  listRecipeNames,
} from "../../experiments/TrainingRecipe";

import {
  getDatasetOptions,
} from "../../../ai-lab/adapters/experimentLauncherAdapter";

import {
  getProductionModelConfig,
  createModel,
} from "../../experiments/ModelRegistry";

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
// Test groups
// ============================================================

export function runPhase81Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 81: Dataset Contract Identity --");

  test("datasetKind classifies bilingual as production", () => {
    assertEqual(datasetKind("bilingual"), "production", "bilingual → production");
    assertEqual(datasetKind("  BILINGUAL  "), "production", "normalizes whitespace/case");
  });

  test("datasetKind classifies inline/tiny/demo/fixture as fixture", () => {
    for (const id of ["inline", "tiny", "demo", "fixture"]) {
      assertEqual(datasetKind(id), "fixture", `${id} → fixture`);
    }
  });

  test("datasetKind classifies legacy unavailable ids", () => {
    for (const id of ["tinystories", "textfile", "synthetic"]) {
      assertEqual(datasetKind(id), "unavailable", `${id} → unavailable`);
    }
  });

  test("datasetKind returns unknown for unknown ids", () => {
    assertEqual(datasetKind("gpt-corpus"), "unknown", "unknown id → unknown");
    assertEqual(datasetKind(""), "unknown", "empty → unknown");
    assertEqual(datasetKind(undefined), "unknown", "undefined → unknown");
  });

  test("resolveTrainingDataset(bilingual) is the production corpus", () => {
    const r = resolveTrainingDataset("bilingual");
    assertEqual(r.id, "bilingual", "id");
    assertEqual(r.kind, "production", "kind");
    assert(r.available, "available");
    assert(!r.isFixture, "not a fixture");
    assert(r.corpus.length > 0, "non-empty corpus");
    assertEqual(r.source, "bilingual.json", "source is the production data file");
  });

  test("resolveTrainingDataset(unknown) does NOT silently fall back to bilingual", () => {
    const r = resolveTrainingDataset("definitely-not-real");
    assertEqual(r.id, "definitely-not-real", "id preserved (not swapped)");
    assertEqual(r.kind, "unavailable", "kind");
    assert(!r.available, "not available");
    assertEqual(r.corpus.length, 0, "empty corpus — no fallback data");
    assert(r.warning !== undefined && r.warning.includes("No fallback"), "explicit no-fallback warning");
  });

  test("recipe contract: bilingual-foundation targets bilingual + production", () => {
    const recipe = loadRecipe("bilingual-foundation");
    assertEqual(recipe.dataset.dataset, "bilingual", "recipe.dataset === bilingual");
    assertEqual(recipe.model, "production", "recipe.model === production");
    // Contract identity: the recipe's dataset id resolves to the same id.
    assertEqual(
      resolveTrainingDataset(recipe.dataset.dataset).id,
      recipe.dataset.dataset,
      "recipe dataset id resolves to itself"
    );
  });

  test("validateRecipe accepts the production recipe, rejects unavailable legacy", () => {
    // production recipe passes
    validateRecipe(loadRecipe("bilingual-foundation"));
    // legacy overfit recipe uses "synthetic" (unavailable) → must throw
    let threw = false;
    try {
      validateRecipe(loadRecipe("tiny-overfit-test"));
    } catch {
      threw = true;
    }
    assert(threw, "validateRecipe rejects unavailable synthetic dataset");
    assert(listRecipeNames().includes("bilingual-foundation"), "bilingual-foundation is registered");
  });

  test("getDatasetOptions surfaces only the production dataset", () => {
    const options = getDatasetOptions();
    const values = options.map((d) => d.value);
    assert(values.includes("bilingual"), "bilingual is offered");
    assert(!values.includes("tinystories"), "tinystories is NOT offered");
    assert(!values.includes("synthetic"), "synthetic is NOT offered");
    assert(!values.includes("textfile"), "textfile is NOT offered");
    const bilingual = options.find((d) => d.value === "bilingual");
    assertEqual(bilingual?.kind, "production", "bilingual option marked production");
  });

  test("checkpoint metadata preserves trainingDataset === bilingual", () => {
    const cfg = getProductionModelConfig();
    const model = createModel("production");
    const optimizer = new AdamWOptimizer(model.parameters(), {
      lr: 0.001,
      weightDecay: 0.01,
    });

    // The worker writes back `datasetId` from the resolved dataset. Assert
    // the resolved id is exactly what the checkpoint records.
    const resolved = resolveTrainingDataset("bilingual");
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
      trainingDataset: resolved.id,
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

    assert(checkpoint.metadata !== undefined, "checkpoint has metadata");
    assertEqual(checkpoint.metadata!.trainingDataset, "bilingual", "trainingDataset === bilingual");
  });

  console.log(`  Phase 81: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ============================================================
// Standalone runner
// ============================================================

const isMainModule = process.argv.length >= 2 && process.argv[1]?.includes("phase81-dataset-contract");
if (isMainModule) {
  const result = runPhase81Tests();
  if (result.failed > 0) process.exit(1);
}
