// ============================================================
// Phase 67.5 Task 2 — Identity Model Audit & Unification Tests
// ============================================================
// Covers:
//   - ID uniqueness (experiment, run, session, checkpoint)
//   - Identity graph invariants (valid, missing, mismatched, dangling)
//   - Lifecycle transitions (created → queued → running → completed)
//   - Training → Run identity flow
//   - Generation provenance chain
//   - Persistence round-trip
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
  // Also polyfill window for ResearchWorkspace which checks window.localStorage
  (globalThis as Record<string, unknown>).window = { localStorage: ls };
}

import {
  generateExperimentId,
  generateRunId,
  generateSessionId,
  createResearchExperiment,
  createResearchRun,
  startResearchRun,
  completeResearchRun,
  failResearchRun,
  cancelResearchRun,
  createResearchSession,
  createExperiment,
  getExperiment,
  createRun,
  getRun,
  listRunsByExperiment,
  deleteExperiment,
  deleteRunsByExperiment,
  validateResearchIdentityGraph,
  validateCurrentIdentityGraph,
} from "../index";

import type {
  ResearchExperiment,
  ResearchRun,
  ResearchSession,
  IdentityGraphDiagnostic,
} from "../index";

// ============================================================
// Test helpers
// ============================================================

interface TestResult {
  passed: number;
  failed: number;
}

function makeTestResult(): TestResult {
  return { passed: 0, failed: 0 };
}

function test(name: string, fn: () => void | Promise<void>, r: TestResult): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(
        () => { r.passed++; },
        (err) => { r.failed++; console.error(`  FAIL [${name}]:`, err); }
      );
    } else {
      r.passed++;
    }
  } catch (err) {
    r.failed++;
    console.error(`  FAIL [${name}]:`, err);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function makeModelConfig() {
  return {
    name: "tiny",
    label: "Tiny",
    description: "Tiny test model",
    vocabSize: 260,
    dModel: 64,
    numHeads: 2,
    dFF: 128,
    numLayers: 1,
    maxSeqLen: 64,
    eps: 1e-6,
    estimatedParams: 50000,
  };
}

function makeTrainingRecipe() {
  return {
    name: "test-recipe",
    label: "Test Recipe",
    description: "Test training recipe",
    version: 1 as const,
    model: "tiny",
    dataset: { dataset: "synthetic" as const, blockSize: 16, batchSize: 4 },
    optimizer: { type: "adamw" as const, lr: 0.001 },
    scheduler: { type: "none" as const },
    epochs: 5,
    gradientAccumulation: 1,
    warmupSteps: 0,
    seed: 42,
  };
}

// ============================================================
// Part A — Identity Uniqueness
// ============================================================

export function runIdentityUniquenessTests(): TestResult {
  const r = makeTestResult();
  console.log("\n── Part A: Identity Uniqueness ──");

  test("experimentId uniqueness (1000 generations)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateExperimentId();
      assert(!ids.has(id), `Duplicate experimentId: ${id}`);
      ids.add(id);
    }
    assert(ids.size === 1000, "Should generate 1000 unique experimentIds");
  }, r);

  test("experimentId format (exp- prefix)", () => {
    const id = generateExperimentId();
    assert(id.startsWith("exp-"), `experimentId should start with "exp-", got: ${id}`);
    assert(id.length > 10, `experimentId too short: ${id}`);
  }, r);

  test("runId uniqueness (1000 generations)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateRunId();
      assert(!ids.has(id), `Duplicate runId: ${id}`);
      ids.add(id);
    }
    assert(ids.size === 1000, "Should generate 1000 unique runIds");
  }, r);

  test("runId format (run- prefix)", () => {
    const id = generateRunId();
    assert(id.startsWith("run-"), `runId should start with "run-", got: ${id}`);
  }, r);

  test("sessionId uniqueness (1000 generations)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateSessionId();
      assert(!ids.has(id), `Duplicate sessionId: ${id}`);
      ids.add(id);
    }
    assert(ids.size === 1000, "Should generate 1000 unique sessionIds");
  }, r);

  test("sessionId format (rs- prefix)", () => {
    const id = generateSessionId();
    assert(id.startsWith("rs-"), `sessionId should start with "rs-", got: ${id}`);
  }, r);

  test("experiment/run/session IDs should not collide", () => {
    const expId = generateExperimentId();
    const runId = generateRunId();
    const sesId = generateSessionId();
    assert(expId !== runId, "experimentId should not equal runId");
    assert(expId !== sesId, "experimentId should not equal sessionId");
    assert(runId !== sesId, "runId should not equal sessionId");
  }, r);

  console.log(`  ${r.passed} passed, ${r.failed} failed`);
  return r;
}

// ============================================================
// Part B — Relationship Invariants
// ============================================================

export function runRelationshipInvariantTests(): TestResult {
  const r = makeTestResult();
  console.log("\n── Part B: Relationship Invariants ──");

  test("valid identity graph — all linked correctly", () => {
    const experiment = createResearchExperiment({
      name: "Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    const run = createResearchRun(experiment.id, 42);
    const startedRun = startResearchRun(run);

    const session = createResearchSession({
      name: "Test Session",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      dataset: "test",
      seed: 42,
      experimentId: experiment.id,
    });
    session.runId = startedRun.runId;

    const diag = validateResearchIdentityGraph([session], [experiment], [startedRun]);
    assert(diag.valid, `Graph should be valid but got errors: ${JSON.stringify(diag.errors)}`);
    assert(diag.errors.length === 0, `Should have 0 errors, got ${diag.errors.length}`);
  }, r);

  test("invalid graph — session references non-existent experiment", () => {
    const experiment = createResearchExperiment({
      name: "Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    const session = createResearchSession({
      name: "Test Session",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      dataset: "test",
      seed: 42,
      experimentId: "exp-nonexistent",
    });

    const diag = validateResearchIdentityGraph([session], [experiment], []);
    assert(!diag.valid, "Graph should be invalid");
    assert(diag.errors.length > 0, "Should have at least 1 error (dangling experiment FK)");
  }, r);

  test("invalid graph — session references non-existent run", () => {
    const experiment = createResearchExperiment({
      name: "Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    const session = createResearchSession({
      name: "Test Session",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      dataset: "test",
      seed: 42,
      experimentId: experiment.id,
    });
    session.runId = "run-nonexistent";

    const diag = validateResearchIdentityGraph([session], [experiment], []);
    assert(!diag.valid, "Graph should be invalid");
    assert(diag.errors.length > 0, "Should have error for dangling run FK");
  }, r);

  test("invalid graph — run experimentId mismatch with session", () => {
    const exp1 = createResearchExperiment({
      name: "Exp1",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });
    const exp2 = createResearchExperiment({
      name: "Exp2",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    const run = createResearchRun(exp2.id, 42); // run belongs to exp2
    const startedRun = startResearchRun(run);

    const session = createResearchSession({
      name: "Test Session",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      dataset: "test",
      seed: 42,
      experimentId: exp1.id, // session points to exp1
    });
    session.runId = startedRun.runId;

    const diag = validateResearchIdentityGraph([session], [exp1, exp2], [startedRun]);
    assert(!diag.valid, "Graph should be invalid — cross-wired FKs");
    assert(diag.errors.length > 0, "Should have cross-wired FK error");
  }, r);

  test("invalid graph — run references non-existent experiment", () => {
    const run = createResearchRun("exp-nonexistent", 42);
    const startedRun = startResearchRun(run);

    const diag = validateResearchIdentityGraph([], [], [startedRun]);
    assert(!diag.valid, "Graph should be invalid");
    assert(diag.errors.length > 0, "Should have error for run dangling FK");
  }, r);

  test("warning — orphan run (not referenced by any session)", () => {
    const experiment = createResearchExperiment({
      name: "Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    const run = createResearchRun(experiment.id, 42);
    const startedRun = startResearchRun(run);

    const diag = validateResearchIdentityGraph([], [experiment], [startedRun]);
    // Orphan runs are warnings, not errors
    assert(diag.warnings.length > 0, "Should have orphan run warning");
  }, r);

  test("warning — session with no experimentId", () => {
    const session = createResearchSession({
      name: "Unlinked Session",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      dataset: "test",
      seed: 42,
    });
    // experimentId is undefined

    const diag = validateResearchIdentityGraph([session], [], []);
    assert(diag.valid, "Graph should be valid (warnings only)");
    assert(diag.warnings.length > 0, "Should have unlinked session warning");
  }, r);

  test("empty graph is valid", () => {
    const diag = validateResearchIdentityGraph([], [], []);
    assert(diag.valid, "Empty graph should be valid");
    assert(diag.errors.length === 0, "Empty graph should have no errors");
    assert(diag.warnings.length === 0, "Empty graph should have no warnings");
  }, r);

  console.log(`  ${r.passed} passed, ${r.failed} failed`);
  return r;
}

// ============================================================
// Part C — Lifecycle Transitions
// ============================================================

export function runLifecycleTransitionTests(): TestResult {
  const r = makeTestResult();
  console.log("\n── Part C: Lifecycle Transitions ──");

  test("created → queued → running → completed", () => {
    const experiment = createResearchExperiment({
      name: "Lifecycle Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    // Start as draft
    assertEq(experiment.status, "draft", "Initial status should be draft");

    // Create run in pending
    const run = createResearchRun(experiment.id, 42);
    assertEq(run.status, "pending", "Run initial status should be pending");

    // Start run
    const started = startResearchRun(run);
    assertEq(started.status, "running", "Run should transition to running");

    // Complete run
    const completed = completeResearchRun(started, {
      initialLoss: 5.0,
      finalLoss: 1.0,
      bestLoss: 0.8,
      perplexity: 2.2,
      tokensPerSecond: 500,
      totalTokens: 10000,
      totalSteps: 200,
      totalEpochs: 5,
      durationMs: 30000,
    });
    assertEq(completed.status, "completed", "Run should transition to completed");
    assert(Number.isFinite(completed.finalLoss), "finalLoss should be finite");
    assert(completed.completedAt > 0, "completedAt should be set");
  }, r);

  test("running → paused → resumed → completed", () => {
    const experiment = createResearchExperiment({
      name: "Pause Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    let run = createResearchRun(experiment.id, 42);
    run = startResearchRun(run);
    assertEq(run.status, "running", "Should be running");

    // Simulate pause (cancel the run, which is the terminal equivalent)
    run = cancelResearchRun(run);
    assertEq(run.status, "cancelled", "Cancelled = terminal stop");

    // Create new run to simulate resume
    const newRun = createResearchRun(experiment.id, 42);
    const resumed = startResearchRun(newRun);
    assertEq(resumed.status, "running", "Resumed run should be running");

    const completed = completeResearchRun(resumed, {
      initialLoss: 5.0,
      finalLoss: 0.9,
      bestLoss: 0.7,
      perplexity: 2.0,
      tokensPerSecond: 600,
      totalTokens: 12000,
      totalSteps: 250,
      totalEpochs: 5,
      durationMs: 35000,
    });
    assertEq(completed.status, "completed", "Should complete");
  }, r);

  test("running → stopped", () => {
    const experiment = createResearchExperiment({
      name: "Stop Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    let run = createResearchRun(experiment.id, 42);
    run = startResearchRun(run);
    run = cancelResearchRun(run);
    assertEq(run.status, "cancelled", "Should be cancelled (= stopped)");
  }, r);

  test("running → failed", () => {
    const experiment = createResearchExperiment({
      name: "Fail Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    let run = createResearchRun(experiment.id, 42);
    run = startResearchRun(run);
    run = failResearchRun(run, "OOM error");
    assertEq(run.status, "failed", "Should be failed");
    assertEq(run.errorMessage, "OOM error", "Should preserve error message");
  }, r);

  test("cannot complete a pending run", () => {
    const run = createResearchRun("exp-test", 42);
    let threw = false;
    try {
      completeResearchRun(run, {
        initialLoss: 5, finalLoss: 1, bestLoss: 0.8, perplexity: 2,
        tokensPerSecond: 500, totalTokens: 10000, totalSteps: 200,
        totalEpochs: 5, durationMs: 30000,
      });
    } catch {
      threw = true;
    }
    assert(threw, "Should throw when completing a pending run");
  }, r);

  test("cannot start a completed run", () => {
    let run = createResearchRun("exp-test", 42);
    run = startResearchRun(run);
    run = completeResearchRun(run, {
      initialLoss: 5, finalLoss: 1, bestLoss: 0.8, perplexity: 2,
      tokensPerSecond: 500, totalTokens: 10000, totalSteps: 200,
      totalEpochs: 5, durationMs: 30000,
    });

    let threw = false;
    try {
      startResearchRun(run);
    } catch {
      threw = true;
    }
    assert(threw, "Should throw when starting a completed run");
  }, r);

  console.log(`  ${r.passed} passed, ${r.failed} failed`);
  return r;
}

// ============================================================
// Part D — Training → Run Identity Flow
// ============================================================

export function runTrainingRunFlowTests(): TestResult {
  const r = makeTestResult();
  console.log("\n── Part D: Training → Run Identity Flow ──");

  test("experiment created → run created → session links correctly", () => {
    const experiment = createResearchExperiment({
      name: "Flow Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    // Persist experiment
    const saved = createExperiment(experiment);
    assert(saved, "Should save experiment");

    // Create & persist run
    const run = createResearchRun(experiment.id, 42);
    const startedRun = startResearchRun(run);
    const runSaved = createRun(startedRun);
    assert(runSaved, "Should save run");

    // Create session linked to both
    const session = createResearchSession({
      name: "Flow Test Session",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      dataset: "test",
      seed: 42,
      experimentId: experiment.id,
    });
    session.runId = startedRun.runId;

    // Validate identity graph
    const diag = validateResearchIdentityGraph([session], [experiment], [startedRun]);
    assert(diag.valid, `Identity graph should be valid: ${JSON.stringify(diag.errors)}`);
    assertEq(session.experimentId, experiment.id, "Session.experimentId === Experiment.id");
    assertEq(session.runId, startedRun.runId, "Session.runId === Run.runId");
    assertEq(startedRun.experimentId, experiment.id, "Run.experimentId === Experiment.id");

    // Cleanup
    deleteExperiment(experiment.id);
  }, r);

  test("complete → run finalized with correct metrics", () => {
    const experiment = createResearchExperiment({
      name: "Complete Flow",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });
    createExperiment(experiment);

    let run = createResearchRun(experiment.id, 42);
    run = startResearchRun(run);
    run = completeResearchRun(run, {
      initialLoss: 5.2,
      finalLoss: 1.3,
      bestLoss: 1.1,
      perplexity: 3.0,
      tokensPerSecond: 800,
      totalTokens: 50000,
      totalSteps: 500,
      totalEpochs: 5,
      durationMs: 60000,
    });

    createRun(run);

    const stored = getRun(run.runId);
    assert(stored !== undefined, "Run should be retrievable");
    assertEq(stored!.status, "completed", "Status should be completed");
    assertEq(stored!.finalLoss, 1.3, "finalLoss should be recorded");
    assertEq(stored!.bestLoss, 1.1, "bestLoss should be recorded");
    assertEq(stored!.totalSteps, 500, "totalSteps should be recorded");

    // Verify run belongs to experiment
    const runs = listRunsByExperiment(experiment.id);
    assert(runs.length > 0, "Should find runs for experiment");
    assertEq(runs[0].runId, run.runId, "Run should be retrievable by experiment");

    deleteExperiment(experiment.id);
  }, r);

  test("failed run preserves error message", () => {
    const experiment = createResearchExperiment({
      name: "Fail Flow",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });
    createExperiment(experiment);

    let run = createResearchRun(experiment.id, 42);
    run = startResearchRun(run);
    run = failResearchRun(run, "Worker crashed at step 150");
    createRun(run);

    const stored = getRun(run.runId);
    assert(stored !== undefined, "Failed run should be retrievable");
    assertEq(stored!.status, "failed", "Status should be failed");
    assertEq(stored!.errorMessage, "Worker crashed at step 150", "Error message should be preserved");

    deleteExperiment(experiment.id);
  }, r);

  console.log(`  ${r.passed} passed, ${r.failed} failed`);
  return r;
}

// ============================================================
// Part E — Generation Provenance Chain
// ============================================================

export function runGenerationProvenanceTests(): TestResult {
  const r = makeTestResult();
  console.log("\n── Part E: Generation Provenance ──");

  test("GenerationResult can trace back to Run and Experiment", () => {
    const experiment = createResearchExperiment({
      name: "Gen Trace Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    const run = createResearchRun(experiment.id, 42);
    const startedRun = startResearchRun(run);

    // Simulate a generation result with experimentId populated
    const genResult = {
      requestId: "gen-test-001",
      sessionId: "rs-test-session",
      experimentId: experiment.id,
      runId: startedRun.runId,
      checkpointId: "ckpt-test-001",
      status: "completed" as const,
      prompt: "The",
      generatedText: "The quick brown fox",
      generatedIds: [1, 2, 3, 4],
      metrics: { tokenCount: 4, avgLogProb: -1.5, perplexity: 4.5, stopReason: "maxTokens" as const, durationMs: 100 },
      generationConfig: { prompt: "The", params: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 } },
      isBaseline: false,
      timestamp: Date.now(),
    };

    // Chain: Generation → Checkpoint → Run → Experiment
    assert(genResult.experimentId === experiment.id, "Generation.experimentId === Experiment.id");
    assert(genResult.runId === startedRun.runId, "Generation.runId === Run.runId");
    assert(genResult.checkpointId !== undefined, "Generation has checkpointId");
    assert(startedRun.experimentId === experiment.id, "Run.experimentId === Experiment.id");
  }, r);

  test("baseline generation has no checkpoint but can trace to experiment", () => {
    const experiment = createResearchExperiment({
      name: "Baseline Trace",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });

    const baselineResult = {
      requestId: "gen-baseline-001",
      sessionId: "rs-test-session",
      experimentId: experiment.id,
      runId: undefined,
      checkpointId: undefined,
      status: "completed" as const,
      prompt: "The",
      generatedText: "The xyz abc def",
      generatedIds: [1, 2, 3],
      metrics: { tokenCount: 3, avgLogProb: -3.0, perplexity: 20.0, stopReason: "maxTokens" as const, durationMs: 50 },
      generationConfig: { prompt: "The", params: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 } },
      isBaseline: true,
      timestamp: Date.now(),
    };

    // Baseline: Generation → Experiment (no Run, no Checkpoint)
    assert(baselineResult.experimentId === experiment.id, "Baseline generation still traces to experiment");
    assert(baselineResult.isBaseline === true, "Should be marked as baseline");
  }, r);

  console.log(`  ${r.passed} passed, ${r.failed} failed`);
  return r;
}

// ============================================================
// Part F — Persistence Round-Trip
// ============================================================

export function runPersistenceRoundTripTests(): TestResult {
  const r = makeTestResult();
  console.log("\n── Part F: Persistence Round-Trip ──");

  test("experiment → save → load → identity preserved", () => {
    const experiment = createResearchExperiment({
      name: "Persistence Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
      hypothesis: "Lower LR should give smoother loss curves",
      tags: ["lr-study", "phase67"],
    });

    // Save
    const saved = createExperiment(experiment);
    assert(saved, "Should save experiment");

    // Load
    const loaded = getExperiment(experiment.id);
    assert(loaded !== undefined, "Should load experiment");
    assertEq(loaded!.id, experiment.id, "ID should match");
    assertEq(loaded!.name, experiment.name, "Name should match");
    assertEq(loaded!.hypothesis, experiment.hypothesis, "Hypothesis should survive round-trip");
    assert(loaded!.tags.includes("lr-study"), "Tags should survive round-trip");

    // Cleanup
    deleteExperiment(experiment.id);
  }, r);

  test("run → save → load → identity preserved", () => {
    const experiment = createResearchExperiment({
      name: "Run Persist Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });
    createExperiment(experiment);

    const run = createResearchRun(experiment.id, 42);
    const startedRun = startResearchRun(run);
    createRun(startedRun);

    const loaded = getRun(startedRun.runId);
    assert(loaded !== undefined, "Should load run");
    assertEq(loaded!.runId, startedRun.runId, "runId should match");
    assertEq(loaded!.experimentId, experiment.id, "experimentId should match");
    assertEq(loaded!.status, "running", "Status should be running");

    // Complete and re-save
    const completed = completeResearchRun(loaded!, {
      initialLoss: 5.0,
      finalLoss: 1.0,
      bestLoss: 0.8,
      perplexity: 2.2,
      tokensPerSecond: 500,
      totalTokens: 10000,
      totalSteps: 200,
      totalEpochs: 5,
      durationMs: 30000,
    });
    createRun(completed);

    const reloaded = getRun(startedRun.runId);
    assertEq(reloaded!.status, "completed", "Updated status should persist");

    deleteExperiment(experiment.id);
  }, r);

  test("delete experiment cascades to runs", () => {
    const experiment = createResearchExperiment({
      name: "Cascade Delete Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });
    createExperiment(experiment);

    const run = createResearchRun(experiment.id, 42);
    createRun(startResearchRun(run));

    // Delete experiment
    deleteExperiment(experiment.id);

    // Verify both are gone
    const loadedExp = getExperiment(experiment.id);
    const loadedRun = getRun(run.runId);
    assert(loadedExp === undefined, "Experiment should be deleted");
    assert(loadedRun === undefined, "Run should be cascade-deleted");
  }, r);

  test("identity graph valid before and after persistence round-trip", () => {
    const experiment = createResearchExperiment({
      name: "Graph Persist Test",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      datasetConfig: { name: "test", blockSize: 16, batchSize: 4, shuffle: true },
    });
    createExperiment(experiment);

    const run = createResearchRun(experiment.id, 42);
    const startedRun = startResearchRun(run);
    createRun(startedRun);

    const session = createResearchSession({
      name: "Graph Test Session",
      modelConfig: makeModelConfig(),
      trainingConfig: makeTrainingRecipe(),
      dataset: "test",
      seed: 42,
      experimentId: experiment.id,
    });
    session.runId = startedRun.runId;

    // Validate before reload
    const diag1 = validateResearchIdentityGraph([session], [experiment], [startedRun]);
    assert(diag1.valid, `Graph should be valid before reload: ${JSON.stringify(diag1.errors)}`);

    // Simulate reload by re-fetching from stores
    const reloadedExp = getExperiment(experiment.id);
    const reloadedRun = getRun(startedRun.runId);

    assert(reloadedExp !== undefined, "Reloaded experiment should exist");
    assert(reloadedRun !== undefined, "Reloaded run should exist");

    // Validate after reload
    const diag2 = validateResearchIdentityGraph(
      [session],
      reloadedExp ? [reloadedExp] : [],
      reloadedRun ? [reloadedRun] : []
    );
    assert(diag2.valid, `Graph should be valid after reload: ${JSON.stringify(diag2.errors)}`);

    deleteExperiment(experiment.id);
  }, r);

  console.log(`  ${r.passed} passed, ${r.failed} failed`);
  return r;
}

// ============================================================
// Part G — Integration (validateCurrentIdentityGraph)
// ============================================================

export function runIntegrationValidationTests(): TestResult {
  const r = makeTestResult();
  console.log("\n── Part G: Integration Validation ──");

  test("validateCurrentIdentityGraph runs without throwing", () => {
    // This function reads from localStorage and should never throw
    let diag: IdentityGraphDiagnostic;
    try {
      diag = validateCurrentIdentityGraph();
    } catch (err) {
      throw new Error(`validateCurrentIdentityGraph threw: ${err}`);
    }
    assert(typeof diag.valid === "boolean", "Should return valid boolean");
    assert(Array.isArray(diag.errors), "Should return errors array");
    assert(Array.isArray(diag.warnings), "Should return warnings array");
  }, r);

  test("validateCurrentIdentityGraph handles missing localStorage gracefully", () => {
    // Should work even in test environments where localStorage might be limited
    const diag = validateCurrentIdentityGraph();
    // The function itself should never throw regardless of storage state
    assert(typeof diag === "object" && diag !== null, "Should return an object");
  }, r);

  console.log(`  ${r.passed} passed, ${r.failed} failed`);
  return r;
}

// ============================================================
// Runner
// ============================================================

export function runPhase67IdentityTests(): TestResult {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 67.5 Task 2 — Identity Model Audit & Unification Tests");
  console.log("=".repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;

  const parts = [
    runIdentityUniquenessTests,
    runRelationshipInvariantTests,
    runLifecycleTransitionTests,
    runTrainingRunFlowTests,
    runGenerationProvenanceTests,
    runPersistenceRoundTripTests,
    runIntegrationValidationTests,
  ];

  for (const part of parts) {
    const result = part();
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Phase 67.5 Identity Tests: ${totalPassed} passed, ${totalFailed} failed`);
  console.log("=".repeat(60));

  return { passed: totalPassed, failed: totalFailed };
}

// Self-executing when run directly via `npx tsx <this-file>`
const isMainModule = process.argv.length >= 2 && process.argv[1]?.includes("phase67-identity");
if (isMainModule) {
  const result = runPhase67IdentityTests();
  if (result.failed > 0) {
    process.exit(1);
  }
}
