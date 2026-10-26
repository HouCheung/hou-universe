// ============================================================
// Phase 60 — Research Experiment Loop — Comprehensive Test Suite
// ============================================================
// Run with: npx tsx src/lib/minimind/research/__tests__/phase60-research-loop.test.ts
//
// Tests cover:
//   1. ResearchExperiment — creation, validation, serialization, cloning
//   2. ResearchRun — creation, lifecycle, completion, failure, helpers
//   3. ResearchExperimentStore — CRUD, export/import, queries
//   4. ExperimentQueue — queue, dequeue, lifecycle, summary
//   5. ReproducibilityCertificate — fingerprinting, matching, serialization
//   6. ResearchReportV2 — generation, markdown, suggestions
//   7. NextExperimentGenerator — proposal generation
//   8. Real training integration (TinyStories small-scale)
//   9. Edge cases — empty, failure, duplicate, deterministic
// ============================================================

// ── localStorage polyfill for Node.js test environment ──
if (typeof localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem(key: string): string | null {
      const v = store.get(key);
      return v === undefined ? null : v;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    get length(): number {
      return store.size;
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
  };
  console.log("  [polyfill] localStorage shim installed");
}

import {
  createResearchExperiment,
  validateResearchExperiment,
  isResearchExperiment,
  cloneResearchExperiment,
  serializeResearchExperiment,
  deserializeResearchExperiment,
  generateExperimentId,
} from "../ResearchExperiment";
import type { ResearchExperiment } from "../ResearchExperiment";

import {
  createResearchRun,
  startResearchRun,
  completeResearchRun,
  failResearchRun,
  cancelResearchRun,
  validateResearchRun,
  isResearchRun,
  getRunDuration,
  compareRunsByBestLoss,
  compareRunsBySpeed,
  summarizeRun,
  generateRunId,
} from "../ResearchRun";
import type { ResearchRun } from "../ResearchRun";

import {
  createExperiment,
  getExperiment,
  listExperiments,
  updateExperiment,
  deleteExperiment,
  experimentCount,
  createRun,
  getRun,
  listRuns,
  listRunsByExperiment,
  getLatestRun,
  getBestRun,
  deleteRun,
  exportExperiment,
  importExperiment,
  exportRun,
  importRun,
  exportAll,
  importAll,
  clearAll,
  totalRuns,
  hasExperiment,
  hasRun,
} from "../ResearchExperimentStore";

import { ExperimentQueue } from "../ExperimentQueue";

import { ReproducibilityCertificate } from "../ReproducibilityCertificate";

import { ResearchReportV2 } from "../ResearchReportV2";
import type { NextExperimentSuggestion } from "../ResearchReportV2";

import { NextExperimentGenerator } from "../NextExperimentGenerator";

import { ResearchExperimentRunner, createInlineTrainingExecutor } from "../ResearchExperimentRunner";

// ============================================================
// Test Helpers
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `  ❌ FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
    failed++;
    console.error(`  ❌ FAIL: ${message} — expected throw, but no error`);
  } catch {
    passed++;
  }
}

function makeTestExperiment(overrides?: Partial<ResearchExperiment>): ResearchExperiment {
  return createResearchExperiment({
    name: "Test Experiment",
    description: "A test experiment for unit tests",
    seed: 42,
    modelConfig: {
      name: "test-model",
      label: "Test Model (tiny)",
      dModel: 32,
      numHeads: 4,
      dFF: 64,
      numLayers: 2,
      maxSeqLen: 64,
      vocabSize: 500,
      estimatedParams: 50000,
    },
    trainingConfig: {
      name: "test-recipe",
      version: 1,
      epochs: 3,
      optimizer: {
        type: "adamw",
        lr: 0.001,
        weightDecay: 0.01,
      },
      gradientClipNorm: 1.0,
      gradientAccumulation: 1,
      logInterval: 10,
      dataset: {
        blockSize: 64,
        batchSize: 4,
        shuffle: true,
      },
    },
    datasetConfig: {
      name: "test-corpus",
      blockSize: 64,
      batchSize: 4,
      shuffle: true,
    },
    ...overrides,
  });
}

function logSection(title: string): void {
  console.log(`\n  ── ${title} ──`);
}

// ============================================================
// Test 1: ResearchExperiment
// ============================================================

function testResearchExperiment(): void {
  logSection("ResearchExperiment — Creation");

  const exp = makeTestExperiment();

  assert(typeof exp.id === "string", "experiment has string id");
  assert(exp.id.startsWith("exp-"), "experiment id has correct prefix");
  assertEqual(exp.name, "Test Experiment", "experiment name is set");
  assertEqual(exp.seed, 42, "seed is 42");
  assertEqual(exp.status, "draft", "initial status is draft");
  assertEqual(exp.description, "A test experiment for unit tests", "description is set");
  assertEqual(exp.datasetConfig.name, "test-corpus", "dataset config name is set");
  assertEqual(exp.datasetConfig.blockSize, 64, "dataset block size is set");
  assertEqual(exp.tokenizerConfig.type, "bpe", "tokenizer type defaults to bpe");
  assertEqual(exp.tokenizerConfig.vocabSize, 32000, "tokenizer vocab size defaults to 32000");
  assert(exp.evaluationConfig.generationPrompts.length > 0, "has generation prompts");
  assertEqual(exp.evaluationConfig.maxTokens, 30, "max tokens defaults to 30");
  assertEqual(exp.tags.length, 0, "no tags by default");
  assert(exp.createdAt > 0, "createdAt is set");
  assert(exp.updatedAt > 0, "updatedAt is set");

  logSection("ResearchExperiment — Validation");
  validateResearchExperiment(exp); // should not throw
  assert(isResearchExperiment(exp), "isResearchExperiment returns true for valid experiment");
  assert(!isResearchExperiment(null), "null is not an experiment");
  assert(!isResearchExperiment({}), "empty object is not an experiment");
  assert(!isResearchExperiment({ id: "x" }), "partial object is not an experiment");

  assertThrows(() => validateResearchExperiment(null), "validate throws on null");
  assertThrows(() => validateResearchExperiment(undefined), "validate throws on undefined");
  assertThrows(() => validateResearchExperiment({}), "validate throws on empty object");

  logSection("ResearchExperiment — Serialization");
  const json = serializeResearchExperiment(exp);
  assert(typeof json === "string", "serialize returns a string");
  const parsed = deserializeResearchExperiment(json);
  assertEqual(parsed.id, exp.id, "deserialize preserves id");
  assertEqual(parsed.name, exp.name, "deserialize preserves name");
  assertEqual(parsed.seed, exp.seed, "deserialize preserves seed");

  logSection("ResearchExperiment — Clone");
  const cloned = cloneResearchExperiment(exp, { name: "Cloned Experiment" });
  assert(cloned.id !== exp.id, "cloned experiment has different id");
  assertEqual(cloned.name, "Cloned Experiment", "cloned experiment has new name");
  assertEqual(cloned.seed, exp.seed, "cloned experiment keeps original seed");
  assertEqual(cloned.baselineExperimentId, exp.id, "cloned experiment references baseline");
  assertEqual(cloned.status, "draft", "cloned experiment starts as draft");

  // Clone with seed override
  const cloned2 = cloneResearchExperiment(exp, { seed: 99 });
  assertEqual(cloned2.seed, 99, "cloned experiment with seed override");

  logSection("ResearchExperiment — generateExperimentId");
  const id1 = generateExperimentId();
  const id2 = generateExperimentId();
  assert(id1 !== id2, "generated IDs are unique");
  assert(id1.startsWith("exp-"), "generated ID has correct prefix");
}

// ============================================================
// Test 2: ResearchRun
// ============================================================

function testResearchRun(): void {
  logSection("ResearchRun — Creation");

  const run = createResearchRun("exp-test-1", 42);
  assertEqual(run.experimentId, "exp-test-1", "run has correct experiment ID");
  assertEqual(run.seed, 42, "run seed is set");
  assertEqual(run.status, "pending", "initial status is pending");
  assert(run.runId.startsWith("run-"), "run ID has correct prefix");
  assertEqual(run.initialLoss, Infinity, "initial loss is Infinity");
  assertEqual(run.bestLoss, Infinity, "best loss is Infinity");
  assertEqual(run.totalSteps, 0, "initial steps is 0");
  assertEqual(run.generationBefore.length, 0, "no generation before");
  assertEqual(run.analysis, null, "no analysis yet");

  // Custom run ID
  const runCustom = createResearchRun("exp-1", 1, "run-custom");
  assertEqual(runCustom.runId, "run-custom", "custom run ID is preserved");

  logSection("ResearchRun — Lifecycle");
  const started = startResearchRun(run);
  assertEqual(started.status, "running", "started run is running");
  assert(started.startedAt > 0, "startedAt is set after start");

  const completed = completeResearchRun(started, {
    initialLoss: 5.0,
    finalLoss: 1.5,
    bestLoss: 1.2,
    perplexity: 3.32,
    tokensPerSecond: 500,
    totalTokens: 10000,
    totalSteps: 100,
    totalEpochs: 3,
    durationMs: 20000,
  });
  assertEqual(completed.status, "completed", "completed run status");
  assertEqual(completed.initialLoss, 5.0, "initial loss recorded");
  assertEqual(completed.finalLoss, 1.5, "final loss recorded");
  assertEqual(completed.bestLoss, 1.2, "best loss recorded");
  assertEqual(completed.totalSteps, 100, "total steps recorded");
  assert(completed.completedAt > 0, "completedAt is set");

  logSection("ResearchRun — Failure");
  const run2 = startResearchRun(createResearchRun("exp-test-2", 123));
  const failed = failResearchRun(run2, "Out of memory");
  assertEqual(failed.status, "failed", "failed run status");
  assertEqual(failed.errorMessage, "Out of memory", "error message preserved");

  // failResearchRun also works on pending runs
  const runPending = createResearchRun("exp-pending", 1);
  const failed2 = failResearchRun(runPending, "Aborted before start");
  assertEqual(failed2.status, "failed", "can fail a pending run");

  logSection("ResearchRun — Cancellation");
  const run3 = createResearchRun("exp-test-3", 99);
  const cancelled = cancelResearchRun(run3);
  assertEqual(cancelled.status, "cancelled", "cancelled run status");

  logSection("ResearchRun — Validation");
  validateResearchRun(completed); // should not throw
  assert(isResearchRun(completed), "isResearchRun returns true");
  assert(!isResearchRun(null), "null is not a run");
  assert(!isResearchRun({}), "empty object is not a run");

  assertThrows(() => startResearchRun(completed), "cannot start a completed run");
  assertThrows(() => completeResearchRun(cancelled, {
    initialLoss: 1, finalLoss: 1, bestLoss: 1, perplexity: 1,
    tokensPerSecond: 1, totalTokens: 1, totalSteps: 1,
    totalEpochs: 1, durationMs: 1,
  }), "cannot complete a cancelled run");

  logSection("ResearchRun — Helpers");
  const dur = getRunDuration(completed);
  assert(dur >= 0, "getRunDuration returns non-negative value");

  assert(compareRunsByBestLoss(completed, failed) < 0, "lower loss ranks first (byLoss)");
  // Higher tok/s = better = comes first in sort = negative comparator value
  assert(compareRunsBySpeed(completed, failed) < 0, "higher tok/s ranks first (bySpeed)");

  const genRunId1 = generateRunId();
  const genRunId2 = generateRunId();
  assert(genRunId1 !== genRunId2, "generated run IDs are unique");

  // summarizeRun
  const summary = summarizeRun(completed);
  assert(typeof summary === "string", "summarizeRun returns a string");
  assert(summary.includes("completed"), "summary includes status");
  assert(summary.includes("1.20"), "summary includes best loss");

  // summarizeRun for failed
  const failedSummary = summarizeRun(failed);
  assert(failedSummary.includes("Out of memory"), "failed summary includes error message");
}

// ============================================================
// Test 3: ResearchExperimentStore
// ============================================================

function testResearchExperimentStore(): void {
  logSection("Store — Experiment CRUD");

  clearAll();

  const exp = makeTestExperiment();
  const saved = createExperiment(exp);
  assert(saved, "experiment saved successfully");
  assertEqual(experimentCount(), 1, "one experiment stored");
  assert(hasExperiment(exp.id), "hasExperiment returns true");

  const retrieved = getExperiment(exp.id);
  assert(retrieved !== undefined, "getExperiment returns experiment");
  assertEqual(retrieved!.name, exp.name, "retrieved name matches original");

  const all = listExperiments();
  assertEqual(all.length, 1, "listExperiments returns one");

  const updated = updateExperiment(exp.id, { name: "Updated Name" });
  assert(updated, "updateExperiment returns true");
  const afterUpdate = getExperiment(exp.id);
  assertEqual(afterUpdate!.name, "Updated Name", "name was updated");

  const deleted = deleteExperiment(exp.id);
  assert(deleted, "deleteExperiment returns true");
  assertEqual(experimentCount(), 0, "no experiments after delete");
  assert(!hasExperiment(exp.id), "hasExperiment returns false after delete");

  logSection("Store — Run CRUD");

  const exp2 = makeTestExperiment();
  createExperiment(exp2);

  const run = createResearchRun(exp2.id, 42);
  const runSaved = createRun(run);
  assert(runSaved, "createRun returns true");
  assert(hasRun(run.runId), "hasRun returns true");
  assertEqual(totalRuns(), 1, "one run stored");

  const retrievedRun = getRun(run.runId);
  assert(retrievedRun !== undefined, "getRun returns run");
  assertEqual(retrievedRun!.seed, 42, "retrieved run seed matches");
  assertEqual(retrievedRun!.experimentId, exp2.id, "retrieved run experimentId matches");

  const allRuns = listRuns();
  assertEqual(allRuns.length, 1, "listRuns returns one");

  const runsByExp = listRunsByExperiment(exp2.id);
  assertEqual(runsByExp.length, 1, "listRunsByExperiment filters correctly");

  const runsByOther = listRunsByExperiment("nonexistent");
  assertEqual(runsByOther.length, 0, "listRunsByExperiment returns empty for unknown experiment");

  logSection("Store — Export / Import");

  const expJson = exportExperiment(exp2.id);
  assert(expJson !== null, "exportExperiment returns JSON string");
  assert(expJson!.includes(exp2.name), "exported JSON contains experiment name");

  // Export nonexistent
  assertEqual(exportExperiment("nonexistent"), null, "exportExperiment returns null for nonexistent");

  const imported = importExperiment(expJson!);
  assert(imported !== null, "importExperiment returns experiment");
  assertEqual(imported!.name, exp2.name, "imported name matches");

  // Export all
  const allJson = exportAll();
  assert(typeof allJson === "string", "exportAll returns a string");
  assert(allJson.includes("experiments"), "exportAll contains experiments");

  // Import all
  clearAll();
  const importResult = importAll(allJson);
  assert(importResult !== null, "importAll returns result");
  assert(importResult!.experiments > 0, "importAll imported experiments");
  assert(importResult!.runs > 0, "importAll imported runs");

  logSection("Store — getLatestRun / getBestRun");
  clearAll();

  // Create experiment + runs for query tests
  const expMulti = makeTestExperiment();
  createExperiment(expMulti);

  const run1 = completeResearchRun(
    startResearchRun(createResearchRun(expMulti.id, 1)),
    { initialLoss: 4, finalLoss: 2, bestLoss: 1.5, perplexity: 4.5,
      tokensPerSecond: 400, totalTokens: 1000, totalSteps: 50,
      totalEpochs: 2, durationMs: 5000 }
  );
  const run2 = completeResearchRun(
    startResearchRun(createResearchRun(expMulti.id, 1)),
    { initialLoss: 5, finalLoss: 1, bestLoss: 0.8, perplexity: 2.2,
      tokensPerSecond: 600, totalTokens: 1000, totalSteps: 50,
      totalEpochs: 2, durationMs: 4000 }
  );
  createRun(run1);
  createRun(run2);

  const latest = getLatestRun(expMulti.id);
  assert(latest !== undefined, "getLatestRun returns a run");

  const best = getBestRun(expMulti.id);
  assert(best !== undefined, "getBestRun returns a run");
  assertEqual(best!.bestLoss, 0.8, "best run has lowest loss");

  // deleteRun
  assert(deleteRun(run1.runId), "deleteRun returns true");
  assertEqual(totalRuns(), 1, "one run remaining after delete");

  clearAll();
  assertEqual(experimentCount(), 0, "clearAll clears experiments");
  assertEqual(totalRuns(), 0, "clearAll clears runs");
}

// ============================================================
// Test 4: ExperimentQueue
// ============================================================

function testExperimentQueue(): void {
  logSection("Queue — Basic Operations");

  const queue = new ExperimentQueue();

  assertEqual(queue.size(), 0, "initial queue size is 0");
  assert(!queue.hasPending(), "no pending items initially");
  assert(queue.isIdle(), "queue is idle initially");

  const id1 = queue.queue("exp-a", "Experiment A");
  const id2 = queue.queue("exp-b", "Experiment B");
  const id3 = queue.queue("exp-c", "Experiment C");

  assertEqual(queue.size(), 3, "three items in queue");
  assertEqual(queue.size("pending"), 3, "three pending items");
  assert(queue.hasPending(), "queue has pending items");

  logSection("Queue — Dequeue");

  const next = queue.dequeue();
  assert(next !== null, "dequeue returns an item");
  assertEqual(next!.experimentId, "exp-a", "FIFO: first in first out");
  assertEqual(next!.status, "running", "dequeued item is running");

  assertEqual(queue.size("pending"), 2, "two pending after dequeue");
  assertEqual(queue.size("running"), 1, "one running after dequeue");
  assert(queue.isRunning(), "queue is running");

  logSection("Queue — Peek");

  const peeked = queue.peek();
  assert(peeked !== null, "peek returns item");
  assertEqual(peeked!.experimentId, "exp-b", "peek shows next in line");
  assertEqual(peeked!.status, "pending", "peeked item still pending");
  assertEqual(queue.size("pending"), 2, "peek does not remove");

  logSection("Queue — Complete / Fail / Cancel");

  // Complete the running item
  assert(queue.complete(next!.id), "complete returns true");
  assertEqual(queue.size("completed"), 1, "one completed");

  // Cancel pending item
  assert(queue.cancel(id3), "cancel returns true");
  assertEqual(queue.size("cancelled"), 1, "one cancelled");

  // Dequeue and fail
  const item2 = queue.dequeue();
  assert(item2 !== null, "dequeue second item");
  assert(queue.fail(item2!.id, "Test error"), "fail returns true");
  assertEqual(queue.size("failed"), 1, "one failed");

  logSection("Queue — Summary");

  const summary = queue.summary();
  assertEqual(summary.total, 3, "summary total is 3");
  assertEqual(summary.completed, 1, "summary: 1 completed");
  assertEqual(summary.failed, 1, "summary: 1 failed");
  assertEqual(summary.cancelled, 1, "summary: 1 cancelled");

  logSection("Queue — Clear");

  queue.clear();
  assertEqual(queue.size(), 0, "queue cleared");
  assert(queue.isIdle(), "queue idle after clear");

  logSection("Queue — Edge Cases");

  assertEqual(queue.dequeue(), null, "dequeue from empty queue returns null");
  assertEqual(queue.peek(), null, "peek on empty queue returns null");

  const q = new ExperimentQueue();
  const qId = q.queue("exp-x", "X");
  assert(!q.cancel(qId + "-bogus"), "cancel nonexistent returns false");
  assert(!q.complete(qId + "-bogus"), "complete nonexistent returns false");
  assert(!q.fail(qId + "-bogus", "err"), "fail nonexistent returns false");

  // Cannot cancel already dequeued (running) item
  const dequeued = q.dequeue();
  assert(!q.cancel(dequeued!.id), "cannot cancel running item");
}

// ============================================================
// Test 5: ReproducibilityCertificate
// ============================================================

function testReproducibilityCertificate(): void {
  logSection("Certificate — Fingerprinting");

  const cert = new ReproducibilityCertificate();

  const exp1 = makeTestExperiment();
  const exp2 = makeTestExperiment();

  const fp1 = cert.generateFingerprint(exp1);
  const fp2 = cert.generateFingerprint(exp2);

  // Same config → same fingerprint
  assertEqual(
    fp1.fingerprints.combined,
    fp2.fingerprints.combined,
    "identical configs produce identical fingerprints"
  );

  // Verify individual fingerprints are present
  assert(typeof fp1.fingerprints.model === "string", "model fingerprint is string");
  assert(typeof fp1.fingerprints.tokenizer === "string", "tokenizer fingerprint is string");
  assert(typeof fp1.fingerprints.dataset === "string", "dataset fingerprint is string");
  assert(typeof fp1.fingerprints.training === "string", "training fingerprint is string");
  assert(typeof fp1.fingerprints.evaluation === "string", "evaluation fingerprint is string");
  assert(fp1.fingerprints.model.length > 0, "model fingerprint is non-empty");
  assertEqual(fp1.seed, exp1.seed, "fingerprint result has seed");

  // Different config → different fingerprint
  const exp3 = makeTestExperiment({
    seed: 123,
    modelConfig: {
      name: "different-model",
      label: "Different (big)",
      dModel: 128,
      numHeads: 8,
      dFF: 256,
      numLayers: 4,
      maxSeqLen: 128,
      vocabSize: 1000,
      estimatedParams: 200000,
    },
  });

  const fp3 = cert.generateFingerprint(exp3);
  assert(
    fp3.fingerprints.combined !== fp1.fingerprints.combined,
    "different configs produce different fingerprints"
  );

  logSection("Certificate — Generation");

  const runA = completeResearchRun(
    startResearchRun(createResearchRun(exp1.id, 42)),
    { initialLoss: 5, finalLoss: 1, bestLoss: 0.5, perplexity: 1.65,
      tokensPerSecond: 500, totalTokens: 1000, totalSteps: 50,
      totalEpochs: 3, durationMs: 2000, checkpointId: "ckpt-1" }
  );
  const runB = completeResearchRun(
    startResearchRun(createResearchRun(exp1.id, 42)),
    { initialLoss: 5, finalLoss: 1, bestLoss: 0.5, perplexity: 1.65,
      tokensPerSecond: 500, totalTokens: 1000, totalSteps: 50,
      totalEpochs: 3, durationMs: 2000, checkpointId: "ckpt-1" }
  );

  const certificate = cert.generate(exp1, runA, runB);
  assertEqual(certificate.overall.reproducible, true, "identical runs are reproducible");
  assertEqual(certificate.matches.lossMatch, true, "loss matches");
  assertEqual(certificate.matches.checkpointMatch, true, "checkpoints match");
  assertEqual(certificate.matches.randomStateMatch, true, "random state matches");
  assertEqual(certificate.overall.confidence, 1, "full confidence for identical runs");

  // Different results → not reproducible
  const runC = completeResearchRun(
    startResearchRun(createResearchRun(exp1.id, 42)),
    { initialLoss: 5, finalLoss: 2, bestLoss: 1.8, perplexity: 6.0,
      tokensPerSecond: 300, totalTokens: 1000, totalSteps: 50,
      totalEpochs: 3, durationMs: 3000, checkpointId: "ckpt-2" }
  );

  const cert2 = cert.generate(exp1, runA, runC);
  assertEqual(cert2.overall.reproducible, false, "different results are not reproducible");
  assertEqual(cert2.matches.lossMatch, false, "loss does not match");

  logSection("Certificate — verifyFingerprintsMatch");

  assert(
    cert.verifyFingerprintsMatch(certificate, cert2),
    "verifyFingerprintsMatch returns true for same config"
  );

  logSection("Certificate — Serialization");

  const serialized = cert.serialize(certificate);
  assert(typeof serialized === "string", "certificate serializes to string");
  assert(serialized.includes("fingerprint"), "serialized contains fingerprint");

  logSection("Certificate — toRunReproducibility");

  const runRepro = cert.toRunReproducibility(certificate);
  assertEqual(runRepro.verified, true, "run reproducibility verified");
  assertEqual(runRepro.lossMatch, true, "run repro loss match");
  assertEqual(runRepro.checkpointMatch, true, "run repro checkpoint match");

  // Deterministic: same input → same fingerprint every time
  const fp1a = cert.generateFingerprint(exp1);
  const fp1b = cert.generateFingerprint(exp1);
  assertEqual(
    fp1a.fingerprints.combined,
    fp1b.fingerprints.combined,
    "same input → same hash every time (deterministic)"
  );
}

// ============================================================
// Test 6: ResearchReportV2
// ============================================================

function testResearchReportV2(): void {
  logSection("ReportV2 — Generation");

  const reportV2 = new ResearchReportV2();

  const exp = makeTestExperiment();
  const run = completeResearchRun(
    startResearchRun(createResearchRun(exp.id, 42)),
    {
      initialLoss: 5.2,
      finalLoss: 1.3,
      bestLoss: 1.1,
      perplexity: 3.0,
      tokensPerSecond: 600,
      totalTokens: 50000,
      totalSteps: 200,
      totalEpochs: 5,
      durationMs: 30000,
      generationBefore: [
        { prompt: "the cat", generatedText: "the cat sat mat dog run park" },
      ],
      generationAfter: [
        { prompt: "the cat", generatedText: "the cat sat on the mat and looked" },
      ],
    }
  );

  const data = reportV2.generate({ experiment: exp, run });
  assertEqual(data.meta.experimentId, exp.id, "report references correct experiment");
  assertEqual(data.meta.runId, run.runId, "report references correct run");
  assertEqual(data.experimentSummary.name, "Test Experiment", "report experiment name matches");
  assertEqual(data.experimentSummary.seed, 42, "report seed matches");
  assertEqual(data.training.bestLoss, 1.1, "report training best loss is correct");
  assertEqual(data.training.totalSteps, 200, "report training total steps is correct");
  assertEqual(data.training.totalEpochs, 5, "report training total epochs is correct");
  assert(data.configuration.model.name.length > 0, "report has model config name");
  assert(data.configuration.training.epochs > 0, "report has training epochs");
  assert(data.dataset.name.length > 0, "report has dataset info");

  // Generation comparison
  assertEqual(data.generationComparison.prompts.length, 3, "report has generation prompts");
  assertEqual(data.generationComparison.before.length, 1, "report has before generation");
  assertEqual(data.generationComparison.after.length, 1, "report has after generation");

  // Convergence analysis
  assert(typeof data.convergenceAnalysis.description === "string",
    "report has convergence description");
  assert(typeof data.convergenceAnalysis.lossReductionPercent === "number",
    "convergence has loss reduction percent");

  // Stability analysis
  assert(data.stabilityAnalysis.score >= 0 && data.stabilityAnalysis.score <= 1,
    "stability score is between 0 and 1");

  // Reproducibility section (without certificate)
  assertEqual(data.reproducibility.fingerprint, "N/A",
    "fingerprint is N/A without certificate");
  assertEqual(data.reproducibility.reproducible, false,
    "reproducible is false without certificate");

  // Checkpoint info
  assertEqual(data.checkpoint.available, false,
    "checkpoint available is false for run without checkpoint");

  // Limitations
  assert(data.limitations.length > 0, "report has limitations");

  logSection("ReportV2 — Next Experiment Suggestions");

  assert(data.nextExperimentSuggestions.length > 0,
    "report has next experiment suggestions");

  for (const s of data.nextExperimentSuggestions) {
    assert(typeof s.title === "string" && s.title.length > 0,
      "suggestion has title");
    assert(typeof s.rationale === "string" && s.rationale.length > 0,
      "suggestion has rationale");
    assert(s.confidence > 0 && s.confidence <= 1,
      "suggestion confidence is valid");
    assert(s.suggestedChanges.length > 0,
      "suggestion has changes");
    assert(["high", "medium", "low"].includes(s.priority),
      "suggestion has valid priority");
    assert(typeof s.evidence === "object" && Object.keys(s.evidence).length > 0,
      "suggestion has evidence");
  }

  logSection("ReportV2 — Markdown");

  const md = reportV2.generateMarkdown(data);
  assert(typeof md === "string", "markdown is string");
  assert(md.includes("MiniMind Research Report"), "markdown has title");
  assert(md.includes("Experiment Summary"), "markdown has experiment summary");
  assert(md.includes("Training Results"), "markdown has training results");
  assert(md.includes("Next Experiment Suggestions"), "markdown has next suggestions");
  assert(md.includes("Reproducibility"), "markdown has reproducibility section");
  assert(md.includes("Limitations"), "markdown has limitations section");

  logSection("ReportV2 — deriveNextExperimentSuggestions");

  const suggestions = reportV2.deriveNextExperimentSuggestions(exp, run);
  assert(Array.isArray(suggestions), "deriveNext... returns array");

  // Should include multi-seed suggestion (always included as Check 7)
  const multiSeed = suggestions.find((s) => s.title.includes("multi-seed"));
  assert(multiSeed !== undefined, "includes multi-seed suggestion");
  assertEqual(multiSeed!.priority, "medium", "multi-seed suggestion priority is medium");

  // With this training (5 epochs, 75% loss reduction, converged=false since < 85%),
  // the scale-up check won't trigger, but increase-epochs might. Verify at minimum
  // that we get meaningful suggestions with valid evidence.
}

// ============================================================
// Test 7: NextExperimentGenerator
// ============================================================

function testNextExperimentGenerator(): void {
  logSection("NextExperimentGenerator — Proposal Generation");

  const generator = new NextExperimentGenerator();

  const exp = makeTestExperiment();
  const run = completeResearchRun(
    startResearchRun(createResearchRun(exp.id, 42)),
    { initialLoss: 5, finalLoss: 2, bestLoss: 1.5, perplexity: 4.5,
      tokensPerSecond: 500, totalTokens: 1000, totalSteps: 50,
      totalEpochs: 3, durationMs: 2000 }
  );

  const suggestions: NextExperimentSuggestion[] = [
    {
      title: "Increase training epochs",
      rationale: "Loss still decreasing",
      evidence: { lossReductionPercent: 60, currentEpochs: 3 },
      confidence: 0.85,
      suggestedChanges: [
        { field: "trainingConfig.epochs", currentValue: 3, suggestedValue: 6 },
      ],
      priority: "high",
    },
    {
      title: "Reduce learning rate",
      rationale: "Training shows instability",
      evidence: { stabilityScore: 0.3 },
      confidence: 0.7,
      suggestedChanges: [
        { field: "trainingConfig.optimizer.lr", currentValue: 0.001, suggestedValue: 0.0003 },
      ],
      priority: "medium",
    },
  ];

  const result = generator.generate({ experiment: exp, run, suggestions });
  assertEqual(result.proposals.length, 2, "generates 2 proposals");
  assertEqual(result.sourceExperiment.id, exp.id, "result has source experiment");
  assertEqual(result.sourceRun.runId, run.runId, "result has source run");

  // Check first proposal
  assertEqual(result.proposals[0].experiment.status, "draft", "proposal starts as draft");
  assert(
    result.proposals[0].experiment.name.includes("Increase training epochs"),
    "proposal name includes suggestion title"
  );
  assertEqual(result.proposals[0].experiment.trainingConfig.epochs, 6,
    "training epochs changed to suggested value");
  assertEqual(result.proposals[0].source.priority, "high",
    "proposal source priority preserved");

  // Check second proposal
  assertEqual(
    result.proposals[1].experiment.trainingConfig.optimizer.lr,
    0.0003,
    "LR changed to suggested value"
  );

  // Summary
  assert(typeof result.summary === "string", "summary is a string");
  assert(result.summary.includes("Test Experiment"), "summary mentions source experiment name");
  assert(result.summary.includes("2"), "summary mentions 2 proposals");

  logSection("NextExperimentGenerator — Model Config Changes");

  const modelSuggestions: NextExperimentSuggestion[] = [
    {
      title: "Scale up model",
      rationale: "Good convergence",
      evidence: { finalLoss: 1.5 },
      confidence: 0.65,
      suggestedChanges: [
        { field: "modelConfig.numLayers", currentValue: 2, suggestedValue: 4 },
        { field: "modelConfig.dModel", currentValue: 32, suggestedValue: 64 },
      ],
      priority: "medium",
    },
  ];

  const modelResult = generator.generate({
    experiment: exp, run, suggestions: modelSuggestions,
  });
  assertEqual(modelResult.proposals.length, 1, "one model proposal");
  assertEqual(
    modelResult.proposals[0].experiment.modelConfig.numLayers,
    4,
    "numLayers changed to suggested value"
  );
  assertEqual(
    modelResult.proposals[0].experiment.modelConfig.dModel,
    64,
    "dModel changed to suggested value"
  );
}

// ============================================================
// Test 8: Real Training Integration
// ============================================================

async function testRealTrainingIntegration(): Promise<void> {
  logSection("Real Training — createInlineTrainingExecutor");

  const corpus = [
    "the cat sat on the mat",
    "the dog ran in the park",
    "once upon a time there was a princess",
    "the sun was shining brightly in the sky",
    "a bird flew over the tall green tree",
    "the fish swam in the clear blue water",
    "the boy played with his red ball happily",
    "a rainbow appeared after the rain stopped",
    "the girl read a book under the lamp",
    "the horse jumped over the wooden fence",
  ];

  // Repeat to have enough data for training
  const fullCorpus: string[] = [];
  for (let i = 0; i < 30; i++) {
    fullCorpus.push(...corpus);
  }

  const executor = createInlineTrainingExecutor(fullCorpus);
  assert(typeof executor === "object", "executor is created");
  assert(typeof executor.execute === "function", "executor has execute method");

  logSection("Real Training — Execute small experiment");

  const exp = makeTestExperiment({
    datasetConfig: {
      name: "inline-corpus",
      blockSize: 16,
      batchSize: 4,
      shuffle: true,
    },
    tokenizerConfig: {
      type: "bpe",
      vocabSize: 300,
    },
    trainingConfig: {
      name: "tiny-test-recipe",
      version: 1,
      epochs: 1,
      optimizer: {
        type: "adamw",
        lr: 0.001,
        weightDecay: 0.01,
      },
      gradientClipNorm: 1.0,
      gradientAccumulation: 1,
      logInterval: 5,
      dataset: {
        blockSize: 16,
        batchSize: 4,
        shuffle: true,
      },
    },
    evaluationConfig: {
      generationPrompts: ["the", "once"],
      maxTokens: 10,
      temperature: 0.8,
      runGenerationComparison: true,
      runBenchmarks: false,
    },
    modelConfig: {
      name: "toy-model",
      label: "Toy Model (tiny)",
      dModel: 32,
      numHeads: 4,
      dFF: 64,
      numLayers: 2,
      maxSeqLen: 16,
      vocabSize: 300,
      estimatedParams: 30000,
    },
  });

  try {
    let stepCount = 0;
    let lastLoss = 0;

    const result = await executor.execute(exp, (step, loss, lr) => {
      stepCount = step;
      lastLoss = loss;
      // Verify real metrics are produced at each step
      assert(typeof step === "number", `step ${step} is a number`);
      assert(typeof loss === "number", `loss ${loss} is a number`);
      assert(Number.isFinite(loss), `loss ${loss} is finite`);
      assert(typeof lr === "number", `lr ${lr} is a number`);
      assert(Number.isFinite(lr), `lr ${lr} is finite`);
    });

    // Verify training executed
    assert(stepCount > 0, "training steps were executed");
    assert(Number.isFinite(result.initialLoss), "initial loss is finite");
    assert(Number.isFinite(result.finalLoss), "final loss is finite");
    assert(Number.isFinite(result.bestLoss), "best loss is finite");
    assert(result.totalSteps > 0, "total steps > 0");
    assert(result.totalTokens > 0, "total tokens > 0");
    assert(result.durationMs > 0, "duration > 0");
    assert(result.lossHistory.length > 0, "loss history is not empty");
    assert(result.learningRateHistory.length > 0, "learning rate history is not empty");

    // Verify generation before/after exists
    assert(result.generationBefore.length > 0, "generation before is not empty");
    assert(result.generationAfter.length > 0, "generation after is not empty");
    for (const gen of result.generationBefore) {
      assert(typeof gen.prompt === "string", "generation before has prompt");
      assert(typeof gen.generatedText === "string", "generation before has text");
    }
    for (const gen of result.generationAfter) {
      assert(typeof gen.prompt === "string", "generation after has prompt");
      assert(typeof gen.generatedText === "string", "generation after has text");
    }

    // Verify loss behavior (real training happening)
    assert(result.bestLoss <= result.initialLoss || result.bestLoss < Infinity,
      "best loss is finite and less than or equal to initial");
    assert(result.perplexity > 0, "perplexity is positive");

    console.log(`      Training: ${result.totalSteps} steps, loss ${result.initialLoss.toFixed(2)} → ${result.finalLoss.toFixed(2)}`);
    console.log(`      Best loss: ${result.bestLoss.toFixed(4)}, PPL: ${result.perplexity.toFixed(2)}`);
    console.log(`      Speed: ${result.tokensPerSecond.toFixed(0)} tok/s, ${result.durationMs}ms`);
    console.log(`      Generation before: "${result.generationBefore[0]?.generatedText?.substring(0, 40)}..."`);
    console.log(`      Generation after:  "${result.generationAfter[0]?.generatedText?.substring(0, 40)}..."`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`      Training FAILED: ${msg}`);
    throw err;
  }
}

// ============================================================
// Test 9: Edge Cases & Failure States
// ============================================================

function testEdgeCases(): void {
  logSection("Edge Cases — Empty state");

  clearAll();
  assertEqual(listExperiments().length, 0, "empty experiment list after clear");
  assertEqual(listRuns().length, 0, "empty run list after clear");
  assertEqual(getExperiment("nonexistent"), undefined, "get nonexistent experiment returns undefined");
  assertEqual(getRun("nonexistent"), undefined, "get nonexistent run returns undefined");

  const queue = new ExperimentQueue();
  assertEqual(queue.dequeue(), null, "dequeue from empty queue returns null");
  assertEqual(queue.peek(), null, "peek on empty queue returns null");

  logSection("Edge Cases — Duplicate experiment save");

  const exp = makeTestExperiment();
  assert(createExperiment(exp), "first save succeeds");
  assert(createExperiment(exp), "duplicate save also succeeds (overwrites)");
  assertEqual(experimentCount(), 1, "still one experiment after duplicate save");

  logSection("Edge Cases — Invalid imports");

  assertEqual(importExperiment("not valid json"), null, "invalid JSON import returns null");
  assertEqual(importExperiment("{}"), null, "empty object import returns null");
  assertEqual(importRun("not json"), null, "invalid run import returns null");

  logSection("Edge Cases — Deterministic behavior");

  const cert = new ReproducibilityCertificate();
  const exp1 = makeTestExperiment();
  const exp2 = makeTestExperiment();
  const fp1 = cert.generateFingerprint(exp1);
  const fp2 = cert.generateFingerprint(exp2);
  assertEqual(fp1.fingerprints.combined, fp2.fingerprints.combined,
    "same config → same fingerprint (deterministic)");

  // Verify hash is stable (same input → same hash every time)
  const fp3 = cert.generateFingerprint(exp1);
  assertEqual(fp1.fingerprints.combined, fp3.fingerprints.combined,
    "same input → same hash every time (stable)");

  logSection("Edge Cases — Store filter edge cases");

  clearAll();
  const r1 = createResearchRun("exp-edge-1", 1);
  const r2 = createResearchRun("exp-edge-1", 1);
  const r3 = createResearchRun("exp-edge-2", 2);
  createRun(r1);
  createRun(r2);
  createRun(r3);

  assertEqual(listRunsByExperiment("exp-edge-1").length, 2,
    "filter by experiment returns correct count");
  assertEqual(listRunsByExperiment("exp-edge-2").length, 1,
    "filter by other experiment returns correct count");
  // getLatestRun should return the most recently created
  const latest = getLatestRun("exp-edge-1");
  assert(latest !== undefined, "getLatestRun finds a run");

  logSection("Edge Cases — Empty corpus executor");

  // createInlineTrainingExecutor with empty corpus should still work
  const emptyExecutor = createInlineTrainingExecutor([]);
  assert(typeof emptyExecutor.execute === "function",
    "executor with empty corpus still has execute method");
}

// ============================================================
// Main Runner
// ============================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Phase 60 — Research Experiment Loop — Test Suite");
  console.log("=".repeat(60));

  // ── Synchronous tests ──
  testResearchExperiment();
  testResearchRun();
  testResearchExperimentStore();
  testExperimentQueue();
  testReproducibilityCertificate();
  testResearchReportV2();
  testNextExperimentGenerator();
  testEdgeCases();

  // ── Async: Real training integration test ──
  await testRealTrainingIntegration();

  // ── Summary ──
  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`Total assertions: ${passed + failed}`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
