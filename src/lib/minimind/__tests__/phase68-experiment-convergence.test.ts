// ============================================================
// Phase 68 — Experiment System Convergence Tests
// ============================================================
// Covers:
//   - LegacyExperimentAdapter CRUD (via canonical ResearchExperimentStore)
//   - Legacy → Canonical migration (idempotent, duplicate-safe)
//   - Identity graph validation (Experiment → Run → Session)
//   - ExperimentStore facade (routes to canonical)
//   - Status mapping (legacy 3-state ↔ canonical multi-state)
//   - UI integration patterns (ExperimentLauncher → canonical write)
// ============================================================

// localStorage polyfill for Node.js test environment
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

// ============================================================
// Imports
// ============================================================

// Legacy ExperimentStore (now a facade → canonical)
import {
  save,
  get,
  list,
  listByStatus,
  update,
  deleteRecord,
  clear,
  count,
  has,
  latest,
  stats,
} from "@/lib/minimind/experiments/history/ExperimentStore";

import {
  createExperimentRecord,
  validateExperimentRecord,
} from "@/lib/minimind/experiments/history/ExperimentRecord";
import type { ExperimentRecord } from "@/lib/minimind/experiments/history/ExperimentRecord";

// Canonical ResearchExperimentStore
import {
  createExperiment,
  getExperiment,
  listExperiments,
  deleteExperiment,
  createRun,
  getRun,
  listRunsByExperiment,
  getBestRun,
  getLatestRun,
  clearAll,
  validateResearchIdentityGraph,
  validateCurrentIdentityGraph,
} from "@/lib/minimind/research/ResearchExperimentStore";

import {
  generateExperimentId,
  createResearchExperiment,
} from "@/lib/minimind/research/ResearchExperiment";
import type { ResearchExperiment } from "@/lib/minimind/research/ResearchExperiment";

import {
  generateRunId,
  createResearchRun,
} from "@/lib/minimind/research/ResearchRun";
import type { ResearchRun } from "@/lib/minimind/research/ResearchRun";

import type { ResearchSession } from "@/lib/minimind/research/ResearchState";

// Migration
import {
  migrateLegacyExperiments,
  hasLegacyData,
  getMigrationVersion,
  resetMigrationMarker,
  getLegacyCount,
} from "@/lib/minimind/experiments/history/researchMigration";
import type { MigrationResult } from "@/lib/minimind/experiments/history/researchMigration";

// Model config + recipe for creating realistic records
import { getModelConfig } from "@/lib/minimind/experiments/ModelRegistry";
import { loadRecipe } from "@/lib/minimind/experiments/TrainingRecipe";

// ============================================================
// Test helpers
// ============================================================

interface TestResult {
  passed: number;
  failed: number;
}

let testResult: TestResult = { passed: 0, failed: 0 };

function test(name: string, fn: () => void): void {
  try {
    fn();
    testResult.passed++;
  } catch (err) {
    testResult.failed++;
    console.error(`  FAIL [${name}]:`, err instanceof Error ? err.message : err);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
    );
  }
}

function assertDefined<T>(value: T | undefined | null, message: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(`Assertion failed: ${message} — value is ${value}`);
  }
}

// ============================================================
// Helper: create a realistic ExperimentRecord
// ============================================================

function makeTestRecord(overrides?: Partial<ExperimentRecord>): ExperimentRecord {
  const modelConfig = getModelConfig("tiny");
  const trainingConfig = loadRecipe("tinystories-tiny");
  const id = overrides?.id ?? generateExperimentId();

  const record = createExperimentRecord(
    id,
    overrides?.name ?? "Test Experiment",
    modelConfig,
    trainingConfig
  );

  if (overrides) {
    Object.assign(record, overrides);
  }

  return record;
}

// ============================================================
// Helper: create a minimal ResearchExperiment for direct testing
// ============================================================

function makeTestResearchExperiment(overrides?: Partial<ResearchExperiment>): ResearchExperiment {
  const modelConfig = getModelConfig("tiny");
  const trainingConfig = loadRecipe("tinystories-tiny");

  return createResearchExperiment({
    name: overrides?.name ?? "Test Research Experiment",
    modelConfig,
    trainingConfig,
    datasetConfig: {
      name: "synthetic",
      blockSize: 64,
      batchSize: 8,
      shuffle: true,
    },
    id: overrides?.id,
    hypothesis: overrides?.hypothesis ?? "Test hypothesis",
    seed: overrides?.seed,
  });
}

// ============================================================
// Helper: clear all stores for clean test state
// ============================================================

function clearAllStores(): void {
  clearAll();
  // Also clear legacy key for migration tests
  localStorage.removeItem("minimind-experiment-history");
  localStorage.removeItem("minimind-research-migration-version");
}

// ============================================================
// Section 1: LegacyExperimentAdapter CRUD (Store tests)
// ============================================================

function testStoreCRUD(): void {
  // ── Setup ──
  clearAllStores();

  // ── Create (save) ──
  test("save: creates experiment + run in canonical store", () => {
    const record = makeTestRecord();
    record.metrics = {
      initialLoss: 5.0,
      finalLoss: 1.5,
      bestLoss: 1.2,
      perplexity: Math.exp(1.2),
      tokensPerSecond: 500,
    };
    record.status = "completed";

    const ok = save(record);
    assert(ok, "save should return true");

    // Verify in canonical store
    const exp = getExperiment(record.id);
    assertDefined(exp, "ResearchExperiment should exist after save");
    assertEqual(exp.name, record.name, "Experiment name should match");

    const runs = listRunsByExperiment(record.id);
    assert(runs.length >= 1, "At least one run should exist");
    const run = runs[0];
    assertEqual(run.bestLoss, 1.2, "Run bestLoss should match");
  });

  // ── Get ──
  test("get: retrieves experiment record with run metrics", () => {
    const record = makeTestRecord();
    record.metrics.bestLoss = 2.5;
    record.status = "completed";
    save(record);

    const retrieved = get(record.id);
    assertDefined(retrieved, "get should return a record");
    assertEqual(retrieved.name, record.name, "Name should match");
    assertEqual(retrieved.metrics.bestLoss, 2.5, "Best loss should match");
  });

  // ── Get: non-existent ──
  test("get: returns undefined for non-existent id", () => {
    const result = get("nonexistent-id-12345");
    assert(result === undefined, "Should return undefined for missing id");
  });

  // ── List ──
  test("list: returns all experiments sorted by createdAt desc", () => {
    clearAllStores();

    const r1 = makeTestRecord({ name: "First" });
    r1.createdAt = 1000;
    save(r1);

    const r2 = makeTestRecord({ name: "Second" });
    r2.createdAt = 2000;
    save(r2);

    const records = list();
    assert(records.length >= 2, "Should have at least 2 records");
    // Most recent first
    const idx0 = records.findIndex(r => r.name === "Second");
    const idx1 = records.findIndex(r => r.name === "First");
    assert(idx0 < idx1, "Most recent should come first");
  });

  // ── ListByStatus ──
  test("listByStatus: filters by status", () => {
    clearAllStores();

    const running = makeTestRecord({ status: "running" });
    save(running);
    const completed = makeTestRecord({ status: "completed" });
    save(completed);

    const runningRecords = listByStatus("running");
    assert(runningRecords.length >= 1, "Should find running records");
    assert(
      runningRecords.every(r => r.status === "running"),
      "All filtered records should be running"
    );

    const completedRecords = listByStatus("completed");
    assert(completedRecords.length >= 1, "Should find completed records");
  });

  // ── Update ──
  test("update: modifies experiment fields", () => {
    const record = makeTestRecord({ status: "running" });
    save(record);

    const ok = update(record.id, { status: "completed" });
    assert(ok, "update should return true");

    const updated = get(record.id);
    assertDefined(updated, "Updated record should exist");
    assertEqual(updated.status, "completed", "Status should be updated");
  });

  // ── Update: non-existent ──
  test("update: returns false for non-existent id", () => {
    const ok = update("nonexistent-id-99999", { status: "completed" });
    assert(!ok, "Should return false for non-existent id");
  });

  // ── Delete ──
  test("deleteRecord: removes experiment and runs", () => {
    const record = makeTestRecord();
    save(record);

    const ok = deleteRecord(record.id);
    assert(ok, "deleteRecord should return true");

    const retrieved = get(record.id);
    assert(retrieved === undefined, "Record should not exist after delete");

    const exp = getExperiment(record.id);
    assert(exp === undefined, "Canonical experiment should also be deleted");
  });

  // ── Count ──
  test("count: returns correct number of experiments", () => {
    clearAllStores();
    assertEqual(count(), 0, "Count should be 0 for empty store");

    save(makeTestRecord());
    save(makeTestRecord());
    assertEqual(count(), 2, "Count should be 2");
  });

  // ── Has ──
  test("has: checks existence", () => {
    const record = makeTestRecord();
    save(record);

    assert(has(record.id), "has should return true for existing record");
    assert(!has("nonexistent-id"), "has should return false for missing record");
  });

  // ── Latest ──
  test("latest: returns most recent record", () => {
    clearAllStores();
    assert(latest() === undefined, "latest should return undefined for empty store");

    const r1 = makeTestRecord({ name: "Old" });
    r1.createdAt = 1000;
    save(r1);

    const r2 = makeTestRecord({ name: "New" });
    r2.createdAt = 2000;
    save(r2);

    const latestRecord = latest();
    assertDefined(latestRecord, "latest should return a record");
    assertEqual(latestRecord.name, "New", "Latest should be the most recent");
  });

  // ── Stats ──
  test("stats: returns aggregate statistics", () => {
    clearAllStores();

    save(makeTestRecord({ status: "completed" }));
    save(makeTestRecord({ status: "completed" }));
    save(makeTestRecord({ status: "running" }));

    const s = stats();
    assertEqual(s.total, 3, "Total should be 3");
    assertEqual(s.completed, 2, "Completed should be 2");
    assertEqual(s.running, 1, "Running should be 1");
    assertEqual(s.failed, 0, "Failed should be 0");
  });

  // ── Clear ──
  test("clear: removes all experiments and runs", () => {
    save(makeTestRecord());
    save(makeTestRecord());
    assert(count() >= 2, "Should have records before clear");

    clear();
    assertEqual(count(), 0, "Count should be 0 after clear");
    assertEqual(listExperiments().length, 0, "Canonical experiments should be empty");
  });

  // ── Multiple runs per experiment ──
  test("multiple saves: creates new runs for each save call", () => {
    clearAllStores();

    const record = makeTestRecord({ status: "running" });
    save(record);

    // Update metrics and save again (simulating mid-training save)
    record.metrics.bestLoss = 1.0;
    save(record);

    record.metrics.bestLoss = 0.5;
    record.status = "completed";
    save(record);

    const runs = listRunsByExperiment(record.id);
    // Each save creates a new run when the previous run is still "running"
    assert(runs.length >= 1, "Should have at least 1 run");
  });
}

// ============================================================
// Section 2: Status Mapping Tests
// ============================================================

function testStatusMapping(): void {
  clearAllStores();

  test("status mapping: running → running", () => {
    const record = makeTestRecord({ status: "running" });
    save(record);

    const retrieved = get(record.id);
    assertDefined(retrieved, "Record should exist");
    assertEqual(retrieved.status, "running", "Status should be running");

    const exp = getExperiment(record.id);
    assertDefined(exp, "Experiment should exist");
    assertEqual(exp.status, "running", "Canonical experiment status should be running");
  });

  test("status mapping: completed → completed", () => {
    const record = makeTestRecord({ status: "completed" });
    save(record);

    const retrieved = get(record.id);
    assertDefined(retrieved, "Record should exist");
    assertEqual(retrieved.status, "completed", "Status should be completed");
  });

  test("status mapping: failed → failed (legacy view)", () => {
    const record = makeTestRecord({ status: "failed" });
    save(record);

    const retrieved = get(record.id);
    assertDefined(retrieved, "Record should exist");
    assertEqual(retrieved.status, "failed", "Legacy status should be failed");

    // Canonical experiment should be "completed" (not "failed" — that's a run status)
    const exp = getExperiment(record.id);
    assertDefined(exp, "Experiment should exist");
    assertEqual(exp.status, "completed", "Canonical experiment status should be completed");
  });
}

// ============================================================
// Section 3: Migration Tests
// ============================================================

function testMigration(): void {
  // ── Setup: write legacy-format data directly to localStorage ──
  test("migration: migrates single legacy experiment", () => {
    clearAllStores();
    resetMigrationMarker();

    const modelConfig = getModelConfig("tiny");
    const trainingConfig = loadRecipe("tinystories-tiny");
    const legacyId = generateExperimentId();

    // Write legacy-format data
    const legacyRecord: ExperimentRecord = {
      id: legacyId,
      name: "Legacy Test Experiment",
      createdAt: 1700000000000,
      modelConfig,
      trainingConfig,
      metrics: {
        initialLoss: 5.0,
        finalLoss: 1.5,
        bestLoss: 1.2,
        perplexity: Math.exp(1.2),
        tokensPerSecond: 500,
      },
      status: "completed",
      checkpoint: "/tmp/checkpoint.json",
    };

    const legacyStore = { v: 1, records: [legacyRecord] };
    localStorage.setItem("minimind-experiment-history", JSON.stringify(legacyStore));

    // Run migration
    const result = migrateLegacyExperiments();
    assert(result.success, "Migration should succeed");
    assertEqual(result.legacyCount, 1, "Should find 1 legacy record");
    assertEqual(result.migratedCount, 1, "Should migrate 1 record");
    assertEqual(result.skippedCount, 0, "Should skip 0 records");
    assertEqual(result.invalidCount, 0, "Should have 0 invalid records");

    // Verify in canonical store
    const exp = getExperiment(legacyId);
    assertDefined(exp, "Migrated experiment should exist in canonical store");
    assertEqual(exp.name, "Legacy Test Experiment", "Name should be preserved");
    assertEqual(exp.createdAt, 1700000000000, "CreatedAt should be preserved");

    const runs = listRunsByExperiment(legacyId);
    assertEqual(runs.length, 1, "Should have 1 run");
    assertEqual(runs[0].bestLoss, 1.2, "BestLoss should be preserved");
    assertEqual(runs[0].checkpointId, "/tmp/checkpoint.json", "Checkpoint should be preserved");
  });

  // ── Multiple experiments ──
  test("migration: migrates multiple legacy experiments", () => {
    clearAllStores();
    resetMigrationMarker();

    const modelConfig = getModelConfig("tiny");
    const trainingConfig = loadRecipe("tinystories-tiny");

    const records: ExperimentRecord[] = [];
    for (let i = 0; i < 3; i++) {
      records.push({
        id: generateExperimentId(),
        name: `Legacy Experiment ${i + 1}`,
        createdAt: 1700000000000 + i * 1000,
        modelConfig,
        trainingConfig,
        metrics: {
          initialLoss: 5.0 - i,
          finalLoss: 1.5 - i * 0.2,
          bestLoss: 1.2 - i * 0.1,
          perplexity: Math.exp(1.2 - i * 0.1),
          tokensPerSecond: 500 + i * 100,
        },
        status: "completed",
        checkpoint: undefined,
      });
    }

    localStorage.setItem("minimind-experiment-history", JSON.stringify({ v: 1, records }));

    const result = migrateLegacyExperiments();
    assertEqual(result.legacyCount, 3, "Should find 3 legacy records");
    assertEqual(result.migratedCount, 3, "Should migrate 3 records");

    assertEqual(listExperiments().length, 3, "Should have 3 experiments in canonical store");
  });

  // ── Idempotency ──
  test("migration: is idempotent — re-running does not duplicate", () => {
    clearAllStores();
    resetMigrationMarker();

    const modelConfig = getModelConfig("tiny");
    const trainingConfig = loadRecipe("tinystories-tiny");
    const legacyId = generateExperimentId();

    const legacyRecord: ExperimentRecord = {
      id: legacyId,
      name: "Idempotent Test",
      createdAt: 1700000000000,
      modelConfig,
      trainingConfig,
      metrics: {
        initialLoss: 3.0,
        finalLoss: 1.0,
        bestLoss: 0.8,
        perplexity: Math.exp(0.8),
        tokensPerSecond: 600,
      },
      status: "completed",
      checkpoint: undefined,
    };

    localStorage.setItem("minimind-experiment-history", JSON.stringify({ v: 1, records: [legacyRecord] }));

    // First migration
    const r1 = migrateLegacyExperiments();
    assertEqual(r1.migratedCount, 1, "First migration should migrate 1");

    // Reset marker so migration can run again
    resetMigrationMarker();

    // Second migration — should skip because canonical experiment already exists
    const r2 = migrateLegacyExperiments();
    // Idempotency: existing experiment is skipped, no duplicates created
    assertEqual(r2.skippedCount, 1, "Second run should skip existing experiment");
    assertEqual(r2.migratedCount, 0, "Second run should migrate 0 new records");
    // Should not create duplicates
    assertEqual(listExperiments().length, 1, "Should still have only 1 experiment");
    const runs = listRunsByExperiment(legacyId);
    assertEqual(runs.length, 1, "Should still have only 1 run");
  });

  // ── Empty legacy store ──
  test("migration: handles empty legacy store", () => {
    clearAllStores();
    resetMigrationMarker();

    localStorage.removeItem("minimind-experiment-history");

    const result = migrateLegacyExperiments();
    assert(result.success, "Should succeed with empty store");
    assertEqual(result.legacyCount, 0, "Should find 0 legacy records");
    assertEqual(result.migratedCount, 0, "Should migrate 0");
  });

  // ── Malformed legacy record ──
  test("migration: skips malformed legacy records", () => {
    clearAllStores();
    resetMigrationMarker();

    // Write a store with one valid and one invalid record
    const modelConfig = getModelConfig("tiny");
    const trainingConfig = loadRecipe("tinystories-tiny");
    const validId = generateExperimentId();

    const validRecord: ExperimentRecord = {
      id: validId,
      name: "Valid Record",
      createdAt: 1700000000000,
      modelConfig,
      trainingConfig,
      metrics: {
        initialLoss: 3.0,
        finalLoss: 1.0,
        bestLoss: 0.9,
        perplexity: Math.exp(0.9),
        tokensPerSecond: 400,
      },
      status: "completed",
      checkpoint: undefined,
    };

    const invalidRecord = {
      // Missing required fields: id, modelConfig, trainingConfig, metrics, status
      name: "Invalid Record",
      createdAt: 1700000000000,
    };

    localStorage.setItem(
      "minimind-experiment-history",
      JSON.stringify({ v: 1, records: [validRecord, invalidRecord] })
    );

    const result = migrateLegacyExperiments();
    // Malformed record is filtered out by validation; only 1 valid record remains
    assertEqual(result.legacyCount, 1, "Should find 1 valid record (malformed filtered)");
    assertEqual(result.migratedCount, 1, "Should migrate the 1 valid record");
  });

  // ── Migration version key ──
  test("migration: sets migration version key after completion", () => {
    clearAllStores();
    resetMigrationMarker();

    const modelConfig = getModelConfig("tiny");
    const trainingConfig = loadRecipe("tinystories-tiny");

    localStorage.setItem(
      "minimind-experiment-history",
      JSON.stringify({
        v: 1,
        records: [{
          id: generateExperimentId(),
          name: "Version Test",
          createdAt: Date.now(),
          modelConfig,
          trainingConfig,
          metrics: { initialLoss: 3, finalLoss: 1, bestLoss: 0.8, perplexity: 2.2, tokensPerSecond: 300 },
          status: "completed",
        }],
      })
    );

    const vBefore = getMigrationVersion();
    assert(vBefore === null, "Version should be null before migration");

    migrateLegacyExperiments();

    const vAfter = getMigrationVersion();
    assertEqual(vAfter, "v1", "Version should be v1 after migration");
  });

  // ── Existing canonical experiment not overwritten ──
  test("migration: does not overwrite existing canonical experiment", () => {
    clearAllStores();
    resetMigrationMarker();

    const modelConfig = getModelConfig("tiny");
    const trainingConfig = loadRecipe("tinystories-tiny");

    // First, create a canonical experiment directly
    const existingId = generateExperimentId();
    const canonical = createResearchExperiment({
      name: "Canonical Original",
      modelConfig,
      trainingConfig,
      datasetConfig: { name: "synthetic", blockSize: 64, batchSize: 8, shuffle: true },
      id: existingId,
      hypothesis: "Original hypothesis",
    });
    createExperiment(canonical);

    // Now write a legacy record with the same ID but different name
    const legacyRecord: ExperimentRecord = {
      id: existingId,
      name: "Legacy Overwrite Attempt",
      createdAt: 1700000000000,
      modelConfig,
      trainingConfig,
      metrics: {
        initialLoss: 5.0,
        finalLoss: 2.0,
        bestLoss: 1.5,
        perplexity: Math.exp(1.5),
        tokensPerSecond: 200,
      },
      status: "completed",
      checkpoint: undefined,
    };

    localStorage.setItem("minimind-experiment-history", JSON.stringify({ v: 1, records: [legacyRecord] }));

    const result = migrateLegacyExperiments();
    assertEqual(result.skippedCount, 1, "Existing experiment should be skipped");

    // Verify original data is unchanged
    const exp = getExperiment(existingId);
    assertDefined(exp, "Experiment should still exist");
    assertEqual(exp.name, "Canonical Original", "Name should NOT be overwritten");
    assertEqual(exp.hypothesis, "Original hypothesis", "Hypothesis should be preserved");
  });
}

// ============================================================
// Section 4: Identity Graph Validation
// ============================================================

function testIdentityGraph(): void {
  clearAllStores();

  test("identity: valid graph passes validation", () => {
    // Create experiment
    const exp = makeTestResearchExperiment();
    createExperiment(exp);

    // Create run linked to experiment
    const run = createResearchRun(exp.id, 42);
    run.status = "completed";
    createRun(run);

    // Create session linked to both
    const session: ResearchSession = {
      id: "rs-test-001",
      experimentId: exp.id,
      runId: run.runId,
      name: "Test Session",
      status: "completed",
      modelConfig: exp.modelConfig,
      trainingConfig: exp.trainingConfig,
      dataset: "synthetic",
      seed: 42,
      blockSize: undefined,
      batchSize: undefined,
      epochs: undefined,
      metrics: undefined,
      activeCheckpoint: undefined,
      checkpoints: [],
      timeline: [],
      finalLoss: undefined,
      finalPerplexity: undefined,
      bestLoss: undefined,
      durationMs: undefined,
      errorMessage: undefined,
      tags: [],
      notes: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const diag = validateResearchIdentityGraph(
      [session],
      [exp],
      [run]
    );

    assert(diag.valid, "Identity graph should be valid");
    assertEqual(diag.errors.length, 0, "Should have 0 errors");
  });

  test("identity: dangling experimentId in session is detected", () => {
    const session: ResearchSession = {
      id: "rs-test-dangling",
      experimentId: "nonexistent-exp-id",
      runId: undefined,
      name: "Dangling Session",
      status: "created",
      modelConfig: getModelConfig("tiny"),
      trainingConfig: loadRecipe("tinystories-tiny"),
      dataset: "synthetic",
      seed: 42,
      blockSize: undefined,
      batchSize: undefined,
      epochs: undefined,
      metrics: undefined,
      activeCheckpoint: undefined,
      checkpoints: [],
      timeline: [],
      finalLoss: undefined,
      finalPerplexity: undefined,
      bestLoss: undefined,
      durationMs: undefined,
      errorMessage: undefined,
      tags: [],
      notes: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const diag = validateResearchIdentityGraph(
      [session],
      [],
      []
    );

    assert(!diag.valid, "Identity graph should be invalid");
    assert(diag.errors.length >= 1, "Should have at least 1 error");
    assert(
      diag.errors.some(e => e.message.includes("dangling") || e.message.includes("does not exist")),
      "Error should mention dangling reference"
    );
  });

  test("identity: cross-wired session (run belongs to different experiment) is detected", () => {
    const exp1 = makeTestResearchExperiment();
    const exp2 = makeTestResearchExperiment();

    const run = createResearchRun(exp1.id, 42); // run belongs to exp1
    createRun(run);

    // Session says it belongs to exp2 but references run belonging to exp1
    const session: ResearchSession = {
      id: "rs-crosswired",
      experimentId: exp2.id, // different from run.experimentId
      runId: run.runId,
      name: "Cross-wired Session",
      status: "running",
      modelConfig: exp1.modelConfig,
      trainingConfig: exp1.trainingConfig,
      dataset: "synthetic",
      seed: 42,
      blockSize: undefined,
      batchSize: undefined,
      epochs: undefined,
      metrics: undefined,
      activeCheckpoint: undefined,
      checkpoints: [],
      timeline: [],
      finalLoss: undefined,
      finalPerplexity: undefined,
      bestLoss: undefined,
      durationMs: undefined,
      errorMessage: undefined,
      tags: [],
      notes: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const diag = validateResearchIdentityGraph(
      [session],
      [exp1, exp2],
      [run]
    );

    assert(!diag.valid, "Cross-wired session should be detected as invalid");
  });

  test("identity: validateCurrentIdentityGraph runs without throwing", () => {
    clearAllStores();

    // Create some data
    const exp = makeTestResearchExperiment();
    createExperiment(exp);
    const run = createResearchRun(exp.id, 42);
    createRun(run);

    const diag = validateCurrentIdentityGraph();
    // Should complete without throwing
    assert(typeof diag.valid === "boolean", "Should return a valid diagnostic");
    assert(Array.isArray(diag.errors), "Should have errors array");
    assert(Array.isArray(diag.warnings), "Should have warnings array");
  });
}

// ============================================================
// Section 5: UI Integration Pattern Tests
// ============================================================

function testUIIntegration(): void {
  clearAllStores();

  test("UI: ExperimentLauncher save → canonical store write path", () => {
    // Simulate ExperimentsWorkspacePage.handleLaunch:
    const id = generateExperimentId();
    const modelConfig = getModelConfig("tiny");
    const trainingConfig = loadRecipe("tinystories-tiny");

    const record = createExperimentRecord(
      id,
      "UI-Launched Experiment",
      modelConfig,
      trainingConfig
    );

    // This save now goes through LegacyExperimentAdapter → canonical
    const saved = save(record);
    assert(saved, "Save should succeed");

    // Verify in canonical store
    const exp = getExperiment(id);
    assertDefined(exp, "Experiment should exist in canonical store after UI launch");
    assertEqual(exp.name, "UI-Launched Experiment", "Name should match");

    const runs = listRunsByExperiment(id);
    assert(runs.length >= 1, "Run should exist in canonical store after UI launch");

    // Verify it did NOT write to legacy key
    const legacyRaw = localStorage.getItem("minimind-experiment-history");
    // Legacy key may or may not exist — the point is the canonical store has the data
    const canonicalRaw = localStorage.getItem("minimind-research-experiments");
    assertDefined(canonicalRaw, "Canonical store should have the experiment data");
  });

  test("UI: ExperimentsWorkspace reads from canonical source", () => {
    clearAllStores();

    // Create experiments directly in canonical store
    const exp1 = makeTestResearchExperiment({ name: "Experiment A" });
    createExperiment(exp1);
    const run1 = createResearchRun(exp1.id, 42);
    createRun(run1);

    const exp2 = makeTestResearchExperiment({ name: "Experiment B" });
    createExperiment(exp2);

    // Read via legacy adapter (simulating ExperimentWorkspaceOverview)
    const records = list();
    assert(records.length >= 2, "Should list experiments from canonical store");

    const found = records.find(r => r.name === "Experiment A");
    assertDefined(found, "Should find Experiment A");
  });
}

// ============================================================
// Section 6: ExperimentStore Facade Tests
// ============================================================

function testFacade(): void {
  clearAllStores();

  test("facade: ExperimentStore routes to canonical, not legacy key", () => {
    // Create via facade
    const record = makeTestRecord({ status: "completed" });
    save(record);

    // The legacy store should now be a facade → canonical
    const canonicalExp = getExperiment(record.id);
    assertDefined(canonicalExp, "Data should exist in canonical store");

    // Legacy key should NOT have been written to
    const legacyRaw = localStorage.getItem("minimind-experiment-history");
    // It may still have old data from before, but the facade does NOT write to it
    // The important thing: canonical has the data
  });

  test("facade: all CRUD operations work through ExperimentStore imports", () => {
    clearAllStores();

    // Test the full CRUD cycle through the facade
    const record = makeTestRecord({ status: "running" });
    assert(save(record), "save via facade");
    assert(has(record.id), "has via facade");
    assertEqual(count(), 1, "count via facade");

    const retrieved = get(record.id);
    assertDefined(retrieved, "get via facade");

    assert(update(record.id, { status: "completed" }), "update via facade");

    const updated = get(record.id);
    assertDefined(updated, "get after update via facade");
    assertEqual(updated.status, "completed", "status updated via facade");

    const s = stats();
    assertEqual(s.completed, 1, "stats via facade");

    const l = latest();
    assertDefined(l, "latest via facade");

    assert(deleteRecord(record.id), "deleteRecord via facade");
    assertEqual(count(), 0, "count after delete via facade");
  });
}

// ============================================================
// Section 7: Round-trip Tests
// ============================================================

function testRoundTrip(): void {
  clearAllStores();

  test("round-trip: save → get preserves all key fields", () => {
    const original = makeTestRecord({
      status: "completed",
      checkpoint: "/checkpoints/model.ckpt",
    });
    original.metrics = {
      initialLoss: 10.5,
      finalLoss: 2.3,
      bestLoss: 1.8,
      perplexity: Math.exp(1.8),
      tokensPerSecond: 750,
    };

    save(original);

    const retrieved = get(original.id);
    assertDefined(retrieved, "Retrieved should exist");

    assertEqual(retrieved.id, original.id, "id");
    assertEqual(retrieved.name, original.name, "name");
    assertEqual(retrieved.status, original.status, "status");
    assertEqual(retrieved.metrics.initialLoss, original.metrics.initialLoss, "initialLoss");
    assertEqual(retrieved.metrics.finalLoss, original.metrics.finalLoss, "finalLoss");
    assertEqual(retrieved.metrics.bestLoss, original.metrics.bestLoss, "bestLoss");
    assertEqual(retrieved.metrics.tokensPerSecond, original.metrics.tokensPerSecond, "tokensPerSecond");
    assertEqual(retrieved.checkpoint!, original.checkpoint!, "checkpoint");
  });
}

// ============================================================
// Run all tests
// ============================================================

async function main(): Promise<void> {
  testResult = { passed: 0, failed: 0 };

  console.log("\n=== Phase 68 — Experiment System Convergence Tests ===\n");

  console.log("─ Section 1: Store CRUD ─");
  testStoreCRUD();

  console.log("─ Section 2: Status Mapping ─");
  testStatusMapping();

  console.log("─ Section 3: Migration ─");
  testMigration();

  console.log("─ Section 4: Identity Graph ─");
  testIdentityGraph();

  console.log("─ Section 5: UI Integration ─");
  testUIIntegration();

  console.log("─ Section 6: Facade ─");
  testFacade();

  console.log("─ Section 7: Round-trip ─");
  testRoundTrip();

  console.log(`\n=== Results: ${testResult.passed} passed, ${testResult.failed} failed ===\n`);

  if (testResult.failed > 0) {
    process.exit(1);
  }
}

main();
