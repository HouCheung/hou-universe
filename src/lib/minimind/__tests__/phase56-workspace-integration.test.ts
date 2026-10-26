// ============================================================
// Phase 56 — Workspace Integration Tests
// ============================================================
// Tests for the integration between the adapter layer, the
// experiment store, and the experiment record lifecycle.
// Validates the full launch → save → retrieve → update flow.

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
  createExperimentRecord,
  validateExperimentRecord,
  isExperimentRecord,
} from "@/lib/minimind/experiments/history/ExperimentRecord";
import type { ExperimentRecord } from "@/lib/minimind/experiments/history/ExperimentRecord";
import {
  save as saveRecord,
  get as getRecord,
  list as listRecords,
  listByStatus,
  update as updateRecord,
  deleteRecord,
  clear as clearStore,
  count,
  has,
  latest,
  stats,
} from "@/lib/minimind/experiments/history/ExperimentStore";
import { getModelConfig } from "@/lib/minimind/experiments/ModelRegistry";
import { loadRecipe } from "@/lib/minimind/experiments/TrainingRecipe";
import {
  generateExperimentId,
  suggestExperimentName,
  getWorkspaceOverview,
  hasExperimentHistory,
  getLatestExperiment,
} from "@/lib/ai-lab/adapters/experimentLauncherAdapter";
import type { LaunchConfig } from "@/lib/ai-lab/adapters/experimentLauncherAdapter";

// ============================================================
// Helpers
// ============================================================

function makeLaunchConfig(): LaunchConfig {
  return {
    model: "tiny",
    recipe: "tinystories-tiny",
    dataset: "tinystories",
    seed: 42,
    experimentName: "integration-test-run",
  };
}

function createTestRecord(name: string): ExperimentRecord {
  const modelConfig = getModelConfig("tiny");
  const trainingConfig = loadRecipe("tinystories-tiny");
  const record = createExperimentRecord(generateExperimentId(), name, modelConfig, trainingConfig);
  // Use JSON-safe finite values — Infinity/NaN don't survive JSON round-trip
  record.metrics = {
    initialLoss: 5.0,
    finalLoss: 2.0,
    bestLoss: 1.5,
    perplexity: Math.exp(1.5),
    tokensPerSecond: 400,
  };
  return record;
}

function runAllTests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      // Clear store before each test for isolation
      clearStore();
      fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearStore();
    }
  }

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(`Assertion failed: ${msg}`);
  }

  // ==========================================================
  // ExperimentRecord lifecycle
  // ==========================================================

  console.log("\n--- ExperimentRecord Lifecycle ---");

  test("createExperimentRecord sets status to running", () => {
    const record = createTestRecord("lifecycle-test");
    assert(record.status === "running", "Initial status should be running");
  });

  test("createExperimentRecord sets default Infinity metrics", () => {
    const modelConfig = getModelConfig("tiny");
    const trainingConfig = loadRecipe("tinystories-tiny");
    const record = createExperimentRecord("test-id", "metrics-test", modelConfig, trainingConfig);
    assert(!Number.isFinite(record.metrics.initialLoss), "initialLoss should be Infinity");
    assert(!Number.isFinite(record.metrics.finalLoss), "finalLoss should be Infinity");
    assert(Number.isNaN(record.metrics.perplexity), "perplexity should be NaN");
  });

  test("createExperimentRecord stamps createdAt", () => {
    const before = Date.now();
    const record = createTestRecord("timestamp-test");
    const after = Date.now();
    assert(
      record.createdAt >= before && record.createdAt <= after,
      "createdAt should be within test execution window"
    );
  });

  test("validateExperimentRecord passes valid record", () => {
    const record = createTestRecord("validation-test");
    let threw = false;
    try {
      validateExperimentRecord(record);
    } catch {
      threw = true;
    }
    assert(!threw, "Should not throw for valid record");
  });

  test("isExperimentRecord identifies valid record", () => {
    const record = createTestRecord("guard-test");
    assert(isExperimentRecord(record), "Should identify valid record");
  });

  test("isExperimentRecord rejects null", () => {
    assert(!isExperimentRecord(null), "Should reject null");
  });

  test("isExperimentRecord rejects plain object", () => {
    assert(!isExperimentRecord({ foo: "bar" }), "Should reject plain object");
  });

  test("isExperimentRecord rejects string", () => {
    assert(!isExperimentRecord("not a record"), "Should reject string");
  });

  test("isExperimentRecord rejects array", () => {
    assert(!isExperimentRecord([]), "Should reject array");
  });

  // ==========================================================
  // ExperimentStore CRUD
  // ==========================================================

  console.log("\n--- ExperimentStore CRUD ---");

  test("save persists a record", () => {
    const record = createTestRecord("save-test");
    const ok = saveRecord(record);
    assert(ok, "Save should return true");
    assert(count() === 1, "Count should be 1 after save");
    assert(has(record.id), "has() should return true");
  });

  test("get retrieves a saved record", () => {
    const record = createTestRecord("get-test");
    saveRecord(record);
    const retrieved = getRecord(record.id);
    assert(retrieved !== undefined, "Should retrieve record");
    assert(retrieved!.id === record.id, "ID should match");
    assert(retrieved!.name === record.name, "Name should match");
  });

  test("get returns undefined for unknown id", () => {
    const result = getRecord("nonexistent-id");
    assert(result === undefined, "Should return undefined");
  });

  test("list returns all records sorted by date desc", () => {
    const r1 = createTestRecord("first");
    const r2 = createTestRecord("second");
    // Small delay to ensure different timestamps
    saveRecord(r1);
    saveRecord(r2);
    const all = listRecords();
    assert(all.length === 2, "Should have 2 records");
    assert(all[0]!.createdAt >= all[1]!.createdAt, "Should be sorted desc");
  });

  test("listByStatus filters correctly", () => {
    const r1 = createTestRecord("running-1");
    saveRecord(r1);
    const r2 = createTestRecord("completed-1");
    r2.status = "completed";
    saveRecord(r2);
    const running = listByStatus("running");
    const completed = listByStatus("completed");
    const failed = listByStatus("failed");
    assert(running.length >= 1, "Should find running records");
    assert(completed.length >= 1, "Should find completed records");
    assert(failed.length === 0, "Should find no failed records");
  });

  test("update modifies record fields", () => {
    const record = createTestRecord("update-test");
    saveRecord(record);
    const ok = updateRecord(record.id, { status: "completed" });
    assert(ok, "Update should return true");
    const updated = getRecord(record.id);
    assert(updated!.status === "completed", "Status should be updated");
  });

  test("update returns false for unknown id", () => {
    const ok = updateRecord("unknown-id", { status: "completed" });
    assert(!ok, "Update should return false for unknown id");
  });

  test("delete removes record", () => {
    const record = createTestRecord("delete-test");
    saveRecord(record);
    assert(count() === 1, "Should have 1 record");
    const ok = deleteRecord(record.id);
    assert(ok, "Delete should return true");
    assert(count() === 0, "Should have 0 records after delete");
  });

  test("clear removes all records", () => {
    saveRecord(createTestRecord("a"));
    saveRecord(createTestRecord("b"));
    saveRecord(createTestRecord("c"));
    assert(count() === 3, "Should have 3 records");
    clearStore();
    assert(count() === 0, "Should have 0 records after clear");
  });

  test("latest returns most recent", () => {
    const older = createTestRecord("older");
    saveRecord(older);
    const newer = createTestRecord("newer");
    saveRecord(newer);
    const latestRecord = latest();
    assert(latestRecord !== undefined, "Latest should not be undefined");
    assert(latestRecord!.id === newer.id, "Latest should be newest record");
  });

  test("stats returns correct counts", () => {
    const r1 = createTestRecord("s1");
    saveRecord(r1);
    const r2 = createTestRecord("s2");
    r2.status = "completed";
    saveRecord(r2);
    const s = stats();
    assert(s.total === 2, `total should be 2, got ${s.total}`);
    assert(s.running === 1, `running should be 1, got ${s.running}`);
    assert(s.completed === 1, `completed should be 1, got ${s.completed}`);
    assert(s.failed === 0, `failed should be 0, got ${s.failed}`);
  });

  // ==========================================================
  // Adapter + Store integration
  // ==========================================================

  console.log("\n--- Adapter + Store Integration ---");

  test("hasExperimentHistory returns false for empty store", () => {
    assert(!hasExperimentHistory(), "Should return false for empty store");
  });

  test("hasExperimentHistory returns true after save", () => {
    saveRecord(createTestRecord("history-test"));
    assert(hasExperimentHistory(), "Should return true after save");
  });

  test("getLatestExperiment returns null for empty store", () => {
    assert(getLatestExperiment() === null, "Should return null");
  });

  test("getLatestExperiment returns saved record", () => {
    const record = createTestRecord("latest-test");
    saveRecord(record);
    const latest = getLatestExperiment();
    assert(latest !== null, "Should return record");
    assert(latest!.id === record.id, "ID should match");
  });

  test("getWorkspaceOverview reflects store state", () => {
    const r1 = createTestRecord("overview-running");
    saveRecord(r1);
    const r2 = createTestRecord("overview-completed");
    r2.status = "completed";
    r2.metrics = {
      initialLoss: 5.0,
      finalLoss: 1.5,
      bestLoss: 1.2,
      perplexity: Math.exp(1.2),
      tokensPerSecond: 500,
    };
    saveRecord(r2);
    const overview = getWorkspaceOverview();
    assert(overview.stats.total === 2, "Stats should reflect store");
    assert(overview.stats.running >= 1, "Should show running count");
    assert(overview.stats.completed >= 1, "Should show completed count");
  });

  // ==========================================================
  // ID generation + naming
  // ==========================================================

  console.log("\n--- ID Generation + Naming ---");

  test("generateExperimentId produces unique values", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(generateExperimentId());
    }
    assert(ids.size === 50, "All IDs should be unique");
  });

  test("suggestExperimentName includes date", () => {
    const name = suggestExperimentName(makeLaunchConfig());
    const today = new Date().toISOString().slice(0, 10);
    assert(name.includes(today), "Name should include date");
  });

  // ==========================================================
  // Record update lifecycle simulation
  // ==========================================================

  console.log("\n--- Record Lifecycle Simulation ---");

  test("full lifecycle: create → run → complete", () => {
    const record = createTestRecord("lifecycle-full");

    // Initial save
    assert(record.status === "running", "Should start as running");
    saveRecord(record);

    // Update with metrics during training
    updateRecord(record.id, {
      metrics: {
        initialLoss: 5.2,
        finalLoss: 2.1,
        bestLoss: 1.8,
        perplexity: Math.exp(1.8),
        tokensPerSecond: 450,
      },
    });

    // Mark as completed with checkpoint
    updateRecord(record.id, {
      status: "completed",
      checkpoint: ".cache/minimind/campaigns/test/checkpoint.json",
    });

    const final = getRecord(record.id);
    assert(final !== undefined, "Record should exist");
    assert(final!.status === "completed", "Should be completed");
    assert(final!.checkpoint !== undefined, "Should have checkpoint");
    assert(final!.metrics.bestLoss === 1.8, "Metrics should be updated");
  });

  test("lifecycle: create → fail", () => {
    const record = createTestRecord("lifecycle-fail");
    saveRecord(record);
    updateRecord(record.id, { status: "failed" });
    const final = getRecord(record.id);
    assert(final!.status === "failed", "Should be failed");
  });

  // ==========================================================
  // Summary
  // ==========================================================

  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `workspace-integration: ${passed} passed, ${failed} failed (${passed + failed} tests)`
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

export { runAllTests as runWorkspaceIntegrationTests };
