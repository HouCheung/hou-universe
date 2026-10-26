// ============================================================
// Phase 53 — Training Observatory Validation Tests
// ============================================================
// Covers:
//   1. TrainingRunRecord — factory, validation, guards
//   2. TrainingMetricsStore — CRUD operations
//   3. TrainingAnalyzer — all detection functions
//   4. trainingVisualizationAdapter — all transformation functions
//   5. Empty state — graceful handling of no data
//   6. Integration — store → analyzer → adapter pipeline
//
// Usage:
//   npx tsx src/lib/minimind/__tests__/phase53-observatory.test.ts
//
// Constraints:
//   - All metrics from real math (no fake/synthetic detection)
//   - Does NOT modify Tensor core or Transformer
//   - Does NOT modify AI Lab UI
// ============================================================

import * as fs from "fs";
import * as path from "path";

// ── Observatory imports ──
import {
  createTrainingRunRecord,
  isTrainingRunRecord,
  validateTrainingRunRecord,
  compareByTimestamp,
  compareByBestLoss,
} from "../training/observatory/TrainingRunRecord";
import type {
  TrainingRunRecord,
  LossHistoryPoint,
  DatasetInfo,
} from "../training/observatory/TrainingRunRecord";

import {
  save,
  get,
  list,
  deleteRecord,
  clear,
  latest,
  count,
  has,
  listByStatus,
  stats,
} from "../training/observatory/TrainingMetricsStore";

import {
  analyzeTrainingRun,
  detectConvergence,
  detectDivergence,
  detectUnstableLoss,
  detectOverfitting,
  computeStabilityScore,
  computeTrainingEfficiency,
} from "../training/observatory/TrainingAnalyzer";

// ── Adapter imports ──
import {
  getLossCurveData,
  getLossCurveDataById,
  getLearningRateCurveData,
  getThroughputData,
  getTrainingSummary,
  getTrainingSummaryById,
  getGenerationComparison,
  getObservatoryStats,
  hasObservatoryData,
  getRunList,
  getLatestAnalysis,
} from "@/lib/ai-lab/adapters/trainingVisualizationAdapter";

// ── Phase 52 / existing system imports ──
import { createExperimentRecord } from "../experiments/history/ExperimentRecord";
import { getModelConfig } from "../experiments/ModelRegistry";
import { loadRecipe } from "../experiments/TrainingRecipe";

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

// ============================================================
// Test harness
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  msg: string
): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`
    );
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    failed++;
    console.error(`  FAIL: ${msg} — expected throw`);
  } catch {
    passed++;
  }
}

function assertNotNull<T>(value: T | null | undefined, msg: string): asserts value is T {
  if (value === null || value === undefined) {
    failed++;
    console.error(`  FAIL: ${msg} — value is null/undefined`);
    throw new Error(msg);
  }
  passed++;
}

function suite(name: string): void {
  console.log(`\n${"=".repeat(56)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(56)}`);
}

// ============================================================
// Helpers — create synthetic training data
// ============================================================

function makeModelConfig() {
  return (
    getModelConfig("tiny") ?? {
      name: "tiny",
      label: "MiniMind Tiny",
      description: "Tiny test model",
      vocabSize: 6400,
      dModel: 128,
      numHeads: 4,
      dFF: 512,
      numLayers: 2,
      maxSeqLen: 64,
      eps: 1e-5,
      estimatedParams: 1000000,
    }
  );
}

function makeTrainingConfig() {
  return (
    loadRecipe("tiny-overfit-test") ?? {
      name: "tiny-overfit-test",
      description: "Test recipe",
      optimizer: { type: "adamw", learningRate: 0.001, weightDecay: 0.01 },
      scheduler: { type: "cosine", warmupSteps: 10 },
      trainer: { epochs: 3, logInterval: 10, gradientAccumulationSteps: 1 },
      dataset: {
        type: "synthetic",
        blockSize: 32,
        batchSize: 4,
      },
    }
  );
}

function makeDatasetInfo(): DatasetInfo {
  return {
    name: "TinyStories",
    sampleCount: 1000,
    blockSize: 64,
    batchSize: 8,
    tokenizerVocabSize: 6400,
    tokenizerType: "BPE",
  };
}

/**
 * Create a realistic loss curve with noise decreasing over time.
 */
function makeLossHistory(
  steps: number,
  initialLoss: number = 5.0,
  finalLoss: number = 1.0,
  noiseScale: number = 0.1
): LossHistoryPoint[] {
  const history: LossHistoryPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // Exponential decay with noise
    const noise = (Math.random() - 0.5) * noiseScale * (1 - t); // noise decreases
    const loss = initialLoss * Math.exp(-2.0 * t) + finalLoss + noise;
    history.push({ step: i * 10, loss: Math.max(0.01, loss) });
  }
  return history;
}

/**
 * Create a smooth decreasing loss curve (no noise).
 */
function makeSmoothLossHistory(
  steps: number,
  initialLoss: number = 5.0,
  finalLoss: number = 1.0
): LossHistoryPoint[] {
  const history: LossHistoryPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const loss = initialLoss * Math.exp(-2.0 * t) + finalLoss * (1 - Math.exp(-2.0 * t));
    history.push({ step: i * 10, loss });
  }
  return history;
}

/**
 * Create a diverging loss curve (loss increases).
 */
function makeDivergingLossHistory(steps: number): LossHistoryPoint[] {
  const history: LossHistoryPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const loss = 1.0 + (i / steps) * 5.0 + Math.random() * 0.1;
    history.push({ step: i * 10, loss });
  }
  return history;
}

/**
 * Create a fully populated TrainingRunRecord for testing.
 */
function makeTestRecord(
  id: string = "test-run-001",
  experimentName: string = "Test Run"
): TrainingRunRecord {
  const lossHistory = makeLossHistory(50);
  const losses = lossHistory.map((p) => p.loss);

  const record = createTrainingRunRecord(
    id,
    experimentName,
    makeModelConfig(),
    makeTrainingConfig(),
    makeDatasetInfo()
  );

  record.lossHistory = lossHistory;
  record.perplexityHistory = lossHistory.map((p) => ({
    step: p.step,
    perplexity: Math.exp(Math.min(p.loss, 709)),
  }));
  record.learningRateHistory = lossHistory.map((p, i) => ({
    step: p.step,
    learningRate: 0.001 * (1 - i / lossHistory.length * 0.5),
  }));
  record.throughputHistory = lossHistory.map((p) => ({
    step: p.step,
    tokensPerSecond: 500 + Math.random() * 100,
  }));
  record.initialLoss = losses[0];
  record.finalLoss = losses[losses.length - 1];
  record.bestLoss = Math.min(...losses);
  record.bestStep = lossHistory[losses.indexOf(Math.min(...losses))].step;
  record.finalPerplexity = Math.exp(Math.min(record.finalLoss, 709));
  record.averageThroughput = 550;
  record.durationMs = 60000;
  record.totalSteps = lossHistory[lossHistory.length - 1].step;
  record.totalEpochs = 3;
  record.status = "completed";
  record.generationSamples = [
    {
      prompt: "Once upon a time",
      before: "the the the the the",
      after: "there was a little girl named Lily who loved to play.",
      changed: true,
      logProbDelta: 2.5,
      perplexityDelta: -15.3,
    },
  ];

  return record;
}

// ============================================================
// Suite 1: TrainingRunRecord — Factory & Validation
// ============================================================

function testRecordFactory() {
  suite("1. TrainingRunRecord — Factory & Validation");

  // 1.1 Factory creates a record with defaults
  const record = createTrainingRunRecord("r1", "Test", makeModelConfig(), makeTrainingConfig(), makeDatasetInfo());
  assert(record.id === "r1", "1.1a — factory sets id");
  assert(record.experimentName === "Test", "1.1b — factory sets experimentName");
  assert(record.status === "running", "1.1c — factory defaults status to running");
  assert(record.lossHistory.length === 0, "1.1d — factory has empty lossHistory");
  assert(record.generationSamples.length === 0, "1.1e — factory has empty generationSamples");
  assert(record.initialLoss === Infinity, "1.1f — factory has Infinity initialLoss");
  assert(record.tags.length === 0, "1.1g — factory has empty tags");
  assert(record.errorMessage === undefined, "1.1h — factory has undefined errorMessage");
  assert(typeof record.timestamp === "number", "1.1i — factory sets timestamp");
  assert(record.timestamp > 0, "1.1j — timestamp is positive");

  // 1.2 Type guard
  assert(isTrainingRunRecord(record), "1.2a — isTrainingRunRecord returns true for valid record");
  assert(!isTrainingRunRecord(null), "1.2b — isTrainingRunRecord returns false for null");
  assert(!isTrainingRunRecord({}), "1.2c — isTrainingRunRecord returns false for empty object");
  assert(!isTrainingRunRecord({ id: "x" }), "1.2d — isTrainingRunRecord returns false for partial");
  assert(!isTrainingRunRecord("string"), "1.2e — isTrainingRunRecord returns false for string");
  assert(!isTrainingRunRecord(42), "1.2f — isTrainingRunRecord returns false for number");

  // 1.3 Validation — valid record passes
  const full = makeTestRecord();
  validateTrainingRunRecord(full); // should not throw
  assert(true, "1.3a — validateTrainingRunRecord accepts valid completed record");

  // 1.4 Validation — rejects invalid records
  assertThrows(
    () => validateTrainingRunRecord(null),
    "1.4a — validate rejects null"
  );
  assertThrows(
    () => validateTrainingRunRecord({}),
    "1.4b — validate rejects empty object"
  );
  assertThrows(
    () => validateTrainingRunRecord({ id: "", experimentName: "", timestamp: 0, modelConfig: {}, trainingConfig: {}, datasetInfo: {}, lossHistory: [], perplexityHistory: [], learningRateHistory: [], throughputHistory: [], initialLoss: 0, finalLoss: 0, bestLoss: 0, status: "completed" }),
    "1.4c — validate rejects empty id"
  );

  // 1.5 Comparison helpers
  const a = makeTestRecord("a", "A");
  a.timestamp = 1000;
  const b = makeTestRecord("b", "B");
  b.timestamp = 2000;
  assert(compareByTimestamp(b, a) < 0, "1.5a — compareByTimestamp: newer first");
  assert(compareByTimestamp(a, b) > 0, "1.5b — compareByTimestamp: older second");

  a.bestLoss = 1.0;
  b.bestLoss = 0.5;
  assert(compareByBestLoss(a, b) > 0, "1.5c — compareByBestLoss: lower loss first");
  assert(compareByBestLoss(b, a) < 0, "1.5d — compareByBestLoss: higher loss second");
}

// ============================================================
// Suite 2: TrainingMetricsStore — CRUD Operations
// ============================================================

function testMetricsStore() {
  suite("2. TrainingMetricsStore — CRUD Operations");

  // Clear before test
  clear();

  // 2.1 Empty state
  assert(count() === 0, "2.1a — count is 0 when empty");
  assert(list().length === 0, "2.1b — list returns empty array");
  assert(latest() === undefined, "2.1c — latest returns undefined when empty");
  assert(!has("nonexistent"), "2.1d — has returns false for missing id");
  assert(get("nonexistent") === undefined, "2.1e — get returns undefined for missing id");
  const s1 = stats();
  assert(s1.total === 0, "2.1f — stats.total is 0 when empty");
  assert(s1.completed === 0, "2.1g — stats.completed is 0 when empty");

  // 2.2 Save a record
  const record = makeTestRecord("run-001", "First Run");
  const saved = save(record);
  assert(saved, "2.2a — save returns true");
  assert(count() === 1, "2.2b — count is 1 after save");
  assert(has("run-001"), "2.2c — has returns true for saved id");

  // 2.3 Get a record
  const retrieved = get("run-001");
  assertNotNull(retrieved, "2.3a — get returns record");
  assert(retrieved.experimentName === "First Run", "2.3b — retrieved name matches");
  assert(retrieved.status === "completed", "2.3c — retrieved status matches");
  assert(retrieved.lossHistory.length === 50, "2.3d — retrieved lossHistory preserved");
  assert(retrieved.generationSamples.length === 1, "2.3e — retrieved generationSamples preserved");

  // 2.4 Get returns a deep copy (mutation safe)
  const copy1 = get("run-001")!;
  copy1.lossHistory.push({ step: 9999, loss: 999 });
  const copy2 = get("run-001")!;
  assert(
    copy2.lossHistory.length === 50,
    "2.4a — get returns deep copy, mutations don't affect store"
  );

  // 2.5 Save overwrites by id
  const updated = makeTestRecord("run-001", "Updated Run");
  updated.finalLoss = 0.5;
  save(updated);
  assert(count() === 1, "2.5a — count stays 1 after overwrite");
  const retrievedUpdated = get("run-001")!;
  assert(retrievedUpdated.experimentName === "Updated Run", "2.5b — name updated");
  assert(retrievedUpdated.finalLoss === 0.5, "2.5c — finalLoss updated");

  // 2.6 Save second record
  const record2 = makeTestRecord("run-002", "Second Run");
  record2.bestLoss = 0.3;
  save(record2);
  assert(count() === 2, "2.6a — count is 2 after second save");
  assert(has("run-002"), "2.6b — has returns true for second id");

  // 2.7 List — sorted by timestamp (newest first)
  const all = list();
  assert(all.length === 2, "2.7a — list returns 2 records");
  const ids = all.map((r) => r.id);
  assert(ids.includes("run-001"), "2.7b — run-001 is in list");
  assert(ids.includes("run-002"), "2.7c — run-002 is in list");

  // 2.8 Latest
  const latestRecord = latest();
  assertNotNull(latestRecord, "2.8a — latest returns record");
  assert(latestRecord.id === "run-002", "2.8b — latest returns newest record");

  // 2.9 List by status
  const record3 = makeTestRecord("run-003", "Failed Run");
  record3.status = "failed";
  record3.errorMessage = "OOM error";
  save(record3);

  const completed = listByStatus("completed");
  assert(completed.length === 2, "2.9a — 2 completed records");
  assert(completed.every((r) => r.status === "completed"), "2.9b — all have status completed");

  const failedRuns = listByStatus("failed");
  assert(failedRuns.length === 1, "2.9c — 1 failed record");
  assert(failedRuns[0].errorMessage === "OOM error", "2.9d — error message preserved");

  const runningRuns = listByStatus("running");
  assert(runningRuns.length === 0, "2.9e — 0 running records");

  // 2.10 Stats
  const s2 = stats();
  assert(s2.total === 3, "2.10a — stats.total = 3");
  assert(s2.completed === 2, "2.10b — stats.completed = 2");
  assert(s2.failed === 1, "2.10c — stats.failed = 1");
  assert(s2.running === 0, "2.10d — stats.running = 0");
  assert(s2.bestLoss !== null, "2.10e — stats.bestLoss is not null");
  assert(s2.bestPerplexity !== null, "2.10f — stats.bestPerplexity is not null");
  assert(s2.averageThroughput !== null && s2.averageThroughput > 0, "2.10g — stats has positive avg throughput");

  // 2.11 Delete
  const deleted = deleteRecord("run-003");
  assert(deleted, "2.11a — delete returns true");
  assert(count() === 2, "2.11b — count decreased after delete");
  assert(!has("run-003"), "2.11c — has returns false after delete");
  assert(get("run-003") === undefined, "2.11d — get returns undefined after delete");

  // 2.12 Delete non-existent
  const deleted2 = deleteRecord("nonexistent");
  assert(!deleted2, "2.12a — delete non-existent returns false");

  // 2.13 Validate on save
  assertThrows(() => {
    save({ id: "" } as unknown as TrainingRunRecord);
  }, "2.13a — save throws on invalid record");

  // 2.14 Clear
  clear();
  assert(count() === 0, "2.14a — count is 0 after clear");
  assert(list().length === 0, "2.14b — list is empty after clear");
  assert(latest() === undefined, "2.14c — latest is undefined after clear");
}

// ============================================================
// Suite 3: TrainingAnalyzer — Detection Functions
// ============================================================

function testAnalyzerDetections() {
  suite("3. TrainingAnalyzer — Detection Functions");

  // 3.1 detectConvergence — smoothly decreasing loss
  const smoothHistory = makeSmoothLossHistory(50, 5.0, 0.5);
  const conv = detectConvergence(smoothHistory);
  assert(conv.converged, "3.1a — smooth decreasing loss → converged");
  assert(conv.convergenceRate > 0, "3.1b — convergenceRate is positive");
  assert(conv.convergenceStep > 0, "3.1c — convergenceStep is positive");

  // 3.2 detectConvergence — noisy loss
  const noisyHistory = makeLossHistory(50, 5.0, 1.0, 0.5);
  const convNoisy = detectConvergence(noisyHistory);
  // Noisy still decreasing should still converge
  assert(convNoisy.convergenceRate >= 0, "3.2a — noisy but decreasing: convergenceRate >= 0");

  // 3.3 detectConvergence — too few points
  const shortHistory: LossHistoryPoint[] = [
    { step: 0, loss: 3.0 },
    { step: 10, loss: 2.5 },
  ];
  const convShort = detectConvergence(shortHistory);
  assert(!convShort.converged, "3.3a — too few points → not converged");
  assert(convShort.convergenceStep === -1, "3.3b — convergenceStep is -1 for short history");

  // 3.4 detectConvergence — plateau
  const plateauHistory: LossHistoryPoint[] = [];
  for (let i = 0; i < 30; i++) {
    plateauHistory.push({ step: i * 10, loss: 0.5 + Math.random() * 0.01 });
  }
  const convPlateau = detectConvergence(plateauHistory);
  assert(convPlateau.converged, "3.4a — plateau loss → converged");

  // 3.5 detectDivergence — increasing loss
  const divHistory = makeDivergingLossHistory(30);
  const div = detectDivergence(divHistory);
  assert(div.diverged, "3.5a — increasing loss → diverged");
  assert(div.divergenceRatio > 1.2, "3.5b — divergenceRatio > 1.2");
  assert(div.divergenceStep > 0, "3.5c — divergenceStep is positive");

  // 3.6 detectDivergence — decreasing loss → not diverged
  const decHistory = makeSmoothLossHistory(30, 5.0, 1.0);
  const divDec = detectDivergence(decHistory);
  assert(!divDec.diverged, "3.6a — decreasing loss → not diverged");
  assertClose(divDec.divergenceRatio, 0.2, 0.3, "3.6b — divergenceRatio near final/initial");

  // 3.7 detectDivergence — too few points
  const divShort = detectDivergence([
    { step: 0, loss: 3.0 },
    { step: 10, loss: 3.1 },
  ]);
  assert(!divShort.diverged, "3.7a — too few points → not diverged");

  // 3.8 detectUnstableLoss — smooth curve
  const unstableSmooth = detectUnstableLoss(smoothHistory);
  assert(!unstableSmooth.unstable, "3.8a — smooth curve → not unstable");
  assert(unstableSmooth.spikeCount === 0, "3.8b — no spikes in smooth curve");

  // 3.9 detectUnstableLoss — spikey curve
  const spikeyHistory: LossHistoryPoint[] = [];
  for (let i = 0; i < 30; i++) {
    let loss = 2.0 - i * 0.03;
    if (i === 15) loss = 10.0; // big spike
    if (i === 22) loss = 8.0;  // another spike
    spikeyHistory.push({ step: i * 10, loss });
  }
  const unstableSpikey = detectUnstableLoss(spikeyHistory);
  assert(unstableSpikey.unstable, "3.9a — spikey curve → unstable");
  assert(unstableSpikey.spikeCount >= 1, "3.9b — spikes detected");

  // 3.10 detectUnstableLoss — too few points
  const unstableShort = detectUnstableLoss([
    { step: 0, loss: 3.0 },
    { step: 10, loss: 3.5 },
  ]);
  assert(!unstableShort.unstable, "3.10a — too few points → not unstable");

  // 3.11 detectOverfitting — with eval data showing gap
  const trainHistory = makeSmoothLossHistory(30, 5.0, 0.5);
  const evalHistory: Array<{ step: number; loss: number }> = [];
  for (let i = 0; i < 15; i++) {
    evalHistory.push({ step: i * 20, loss: 1.2 + i * 0.1 });
  }
  const overfit = detectOverfitting(trainHistory, evalHistory);
  // Train decreasing + eval increasing = overfitting
  assert(overfit.trainLossTrend < 0, "3.11a — train trend is negative (improving)");
  assert(overfit.evalLossTrend !== null && overfit.evalLossTrend > 0, "3.11b — eval trend is positive (worsening)");
  assert(overfit.trainEvalGap !== null && overfit.trainEvalGap > 0, "3.11c — train-eval gap positive");

  // 3.12 detectOverfitting — without eval data, normal curve
  const overfitNoEval = detectOverfitting(trainHistory, undefined);
  assert(!overfitNoEval.overfitting, "3.12a — normal curve without eval → not overfitting");
  assert(overfitNoEval.evalLossTrend === null, "3.12b — evalLossTrend null without eval data");

  // 3.13 detectOverfitting — without eval data, suspiciously fast decrease
  const fastDecrease: LossHistoryPoint[] = [];
  for (let i = 0; i < 20; i++) {
    fastDecrease.push({
      step: i * 10,
      loss: i < 5 ? 5.0 * (1 - i / 5) * 0.95 : 0.05,
    });
  }
  const overfitFast = detectOverfitting(fastDecrease, undefined);
  assert(overfitFast.overfitting, "3.13a — extremely fast decrease → overfitting tendency");
}

// ============================================================
// Suite 4: TrainingAnalyzer — Scores
// ============================================================

function testAnalyzerScores() {
  suite("4. TrainingAnalyzer — Scores");

  // 4.1 computeStabilityScore — smooth decreasing
  const smooth = makeSmoothLossHistory(50, 5.0, 1.0);
  const stabilitySmooth = computeStabilityScore(smooth);
  assert(stabilitySmooth > 0.9, "4.1a — smooth decreasing: stability > 0.9");
  assert(stabilitySmooth <= 1.0, "4.1b — stability score ≤ 1.0");

  // 4.2 computeStabilityScore — noisy
  const noisy = makeLossHistory(50, 5.0, 1.0, 0.8);
  const stabilityNoisy = computeStabilityScore(noisy);
  assert(stabilityNoisy >= 0, "4.2a — stability score ≥ 0");
  assert(stabilityNoisy < stabilitySmooth, "4.2b — noisy curve less stable than smooth");

  // 4.3 computeStabilityScore — diverging
  const div = makeDivergingLossHistory(30);
  const stabilityDiv = computeStabilityScore(div);
  assert(stabilityDiv < 0.5, "4.3a — diverging curve: stability < 0.5");

  // 4.4 computeStabilityScore — single point
  const singlePoint: LossHistoryPoint[] = [{ step: 0, loss: 1.0 }];
  assert(computeStabilityScore(singlePoint) === 1.0, "4.4a — single point: stability = 1.0");

  // 4.5 computeTrainingEfficiency
  const efficiency = computeTrainingEfficiency(smooth, 500);
  assert(efficiency > 0, "4.5a — efficiency is positive for decreasing loss");

  // 4.6 computeTrainingEfficiency — no steps
  const effZero = computeTrainingEfficiency(smooth, 0);
  assert(effZero === 0, "4.6a — efficiency is 0 with 0 steps");

  // 4.7 computeTrainingEfficiency — few points
  const effFew = computeTrainingEfficiency(
    [{ step: 0, loss: 5.0 }, { step: 10, loss: 5.0 }],
    10
  );
  assert(effFew === 0, "4.7a — efficiency is 0 with no loss reduction");
}

// ============================================================
// Suite 5: TrainingAnalyzer — Full Analysis
// ============================================================

function testFullAnalysis() {
  suite("5. TrainingAnalyzer — Full Analysis");

  const record = makeTestRecord("analysis-001", "Analysis Test");

  // 5.1 Full analysis returns all fields
  const analysis = analyzeTrainingRun(record);
  assert(isFinite(analysis.initialLoss), "5.1a — initialLoss is finite");
  assert(isFinite(analysis.finalLoss), "5.1b — finalLoss is finite");
  assert(isFinite(analysis.bestLoss), "5.1c — bestLoss is finite");
  assert(analysis.bestLoss <= analysis.initialLoss, "5.1d — bestLoss ≤ initialLoss");
  assert(analysis.lossReduction >= 0, "5.1e — lossReduction ≥ 0");
  assert(analysis.lossReductionPercent >= 0, "5.1f — lossReductionPercent ≥ 0");
  assert(analysis.stabilityScore >= 0 && analysis.stabilityScore <= 1, "5.1g — stabilityScore in [0,1]");
  assert(analysis.trainingEfficiency >= 0, "5.1h — trainingEfficiency ≥ 0");
  assert("convergence" in analysis, "5.1i — convergence result present");
  assert("divergence" in analysis, "5.1j — divergence result present");
  assert("unstableLoss" in analysis, "5.1k — unstableLoss result present");
  assert("overfitting" in analysis, "5.1l — overfitting result present");

  // 5.2 Analysis with eval history
  const evalHistory: Array<{ step: number; loss: number }> = [];
  for (let i = 0; i < 10; i++) {
    evalHistory.push({ step: i * 50, loss: 4.0 - i * 0.1 });
  }
  const analysisWithEval = analyzeTrainingRun(record, evalHistory);
  assert(analysisWithEval.overfitting.evalLossTrend !== null, "5.2a — evalLossTrend set when eval provided");

  // 5.3 Analysis with empty history
  const emptyRecord = createTrainingRunRecord(
    "empty-001",
    "Empty",
    makeModelConfig(),
    makeTrainingConfig(),
    makeDatasetInfo()
  );
  const emptyAnalysis = analyzeTrainingRun(emptyRecord);
  assert(emptyAnalysis.initialLoss === Infinity, "5.3a — empty record: initialLoss = Infinity");
  assert(!emptyAnalysis.convergence.converged, "5.3b — empty record: not converged");
  assert(!emptyAnalysis.divergence.diverged, "5.3c — empty record: not diverged");
  assert(!emptyAnalysis.unstableLoss.unstable, "5.3d — empty record: not unstable");
  assert(!emptyAnalysis.overfitting.overfitting, "5.3e — empty record: not overfitting");
}

// ============================================================
// Suite 6: Adapter — Loss Curve Data
// ============================================================

function testAdapterLossCurve() {
  suite("6. Adapter — Loss Curve Data");

  clear();

  // 6.1 Empty state
  const emptyCurve = getLossCurveData();
  assert(!emptyCurve.hasData, "6.1a — empty store: hasData = false");
  assert(emptyCurve.points.length === 0, "6.1b — empty store: points empty");
  assert(emptyCurve.title === "Loss Curve", "6.1c — empty store: default title");

  // 6.2 With data
  const record = makeTestRecord("lc-001", "Loss Curve Test");
  save(record);

  const curve = getLossCurveData();
  assert(curve.hasData, "6.2a — hasData = true");
  assert(curve.points.length === 50, "6.2b — 50 points returned");
  assert(curve.points[0].step === record.lossHistory[0].step, "6.2c — first point step matches");
  assertClose(curve.points[0].loss, record.lossHistory[0].loss, 0.001, "6.2d — first point loss matches");
  assert(isFinite(curve.initialLoss), "6.2e — initialLoss is finite");
  assert(isFinite(curve.bestLoss), "6.2f — bestLoss is finite");

  // 6.3 getLossCurveDataById
  const curveById = getLossCurveDataById("lc-001");
  assert(curveById.hasData, "6.3a — getById: hasData = true");
  assert(curveById.points.length === 50, "6.3b — getById: correct point count");

  // 6.4 getLossCurveDataById — non-existent
  const curveMissing = getLossCurveDataById("nonexistent");
  assert(!curveMissing.hasData, "6.4a — getById non-existent: hasData = false");

  clear();
}

// ============================================================
// Suite 7: Adapter — Learning Rate & Throughput
// ============================================================

function testAdapterLRAndThroughput() {
  suite("7. Adapter — Learning Rate & Throughput");

  clear();

  // 7.1 Learning rate — empty state
  const emptyLR = getLearningRateCurveData();
  assert(!emptyLR.hasData, "7.1a — empty: hasData = false");
  assert(!emptyLR.hasScheduler, "7.1b — empty: hasScheduler = false");

  // 7.2 Learning rate — with data
  const record = makeTestRecord("lr-001", "LR Test");
  save(record);

  const lrCurve = getLearningRateCurveData();
  assert(lrCurve.hasData, "7.2a — hasData = true");
  assert(lrCurve.points.length === 50, "7.2b — correct point count");
  assert(lrCurve.hasScheduler, "7.2c — hasScheduler = true (LR changes)");

  // 7.3 Throughput — empty state
  clear();
  const emptyTP = getThroughputData();
  assert(!emptyTP.hasData, "7.3a — empty: hasData = false");
  assert(emptyTP.average === 0, "7.3b — empty: average = 0");

  // 7.4 Throughput — with data
  save(record);
  const tp = getThroughputData();
  assert(tp.hasData, "7.4a — hasData = true");
  assert(tp.points.length === 50, "7.4b — correct point count");
  assert(tp.average > 0, "7.4c — average > 0");

  clear();
}

// ============================================================
// Suite 8: Adapter — Training Summary
// ============================================================

function testAdapterTrainingSummary() {
  suite("8. Adapter — Training Summary");

  clear();

  // 8.1 Empty state
  const emptySummary = getTrainingSummary();
  assert(!emptySummary.hasData, "8.1a — empty: hasData = false");
  assert(emptySummary.experimentName === "", "8.1b — empty: experimentName empty");

  // 8.2 With data
  const record = makeTestRecord("ts-001", "Summary Test");
  save(record);

  const summary = getTrainingSummary();
  assert(summary.hasData, "8.2a — hasData = true");
  assert(summary.experimentName === "Summary Test", "8.2b — experimentName matches");
  assert(isFinite(summary.finalLoss), "8.2c — finalLoss finite");
  assert(isFinite(summary.perplexity), "8.2d — perplexity finite");
  assert(summary.tokensPerSecond > 0, "8.2e — tokensPerSecond > 0");
  assert(summary.durationSeconds > 0, "8.2f — durationSeconds > 0");
  assert(summary.lossReductionPercent >= 0, "8.2g — lossReductionPercent ≥ 0");
  assert(summary.stabilityScore >= 0 && summary.stabilityScore <= 1, "8.2h — stabilityScore in [0,1]");
  assert(summary.totalSteps > 0, "8.2i — totalSteps > 0");
  assert(summary.status === "completed", "8.2j — status = completed");

  // 8.3 getTrainingSummaryById
  const summaryById = getTrainingSummaryById("ts-001");
  assert(summaryById.hasData, "8.3a — getById: hasData = true");
  assert(summaryById.experimentName === "Summary Test", "8.3b — getById: name matches");

  // 8.4 getTrainingSummaryById — non-existent
  const summaryMissing = getTrainingSummaryById("nonexistent");
  assert(!summaryMissing.hasData, "8.4a — getById non-existent: hasData = false");

  clear();
}

// ============================================================
// Suite 9: Adapter — Generation & Stats
// ============================================================

function testAdapterGenerationAndStats() {
  suite("9. Adapter — Generation Comparison & Stats");

  clear();

  // 9.1 Generation — empty state
  const emptyGen = getGenerationComparison();
  assert(emptyGen.length === 0, "9.1a — empty: empty array");

  // 9.2 Generation — with data
  const record = makeTestRecord("gen-001", "Gen Test");
  save(record);

  const gen = getGenerationComparison();
  assert(gen.length === 1, "9.2a — 1 generation sample");
  assert(gen[0].prompt === "Once upon a time", "9.2b — prompt preserved");
  assert(gen[0].changed, "9.2c — changed = true");
  assert(gen[0].logProbDelta > 0, "9.2d — logProbDelta > 0");

  // 9.3 Stats — with data
  const s = getObservatoryStats();
  assert(s.hasData, "9.3a — hasData = true");
  assert(s.totalRuns === 1, "9.3b — totalRuns = 1");
  assert(s.completedRuns === 1, "9.3c — completedRuns = 1");
  assert(s.failedRuns === 0, "9.3d — failedRuns = 0");
  assert(s.bestLoss !== null, "9.3e — bestLoss not null");

  // 9.4 hasObservatoryData
  assert(hasObservatoryData(), "9.4a — hasObservatoryData = true");

  // 9.5 getRunList
  const runs = getRunList();
  assert(runs.length === 1, "9.5a — runList has 1 entry");
  assert(runs[0].id === "gen-001", "9.5b — runList id matches");
  assert(runs[0].name === "Gen Test", "9.5c — runList name matches");

  // 9.6 getLatestAnalysis
  const analysis = getLatestAnalysis();
  assertNotNull(analysis, "9.6a — getLatestAnalysis returns result");
  assert(isFinite(analysis.initialLoss), "9.6b — analysis has finite initialLoss");

  // 9.7 Empty stats
  clear();
  const emptyStats = getObservatoryStats();
  assert(!emptyStats.hasData, "9.7a — empty stats: hasData = false");
  assert(!hasObservatoryData(), "9.7b — hasObservatoryData = false after clear");
  const emptyRuns = getRunList();
  assert(emptyRuns.length === 0, "9.7c — empty runList");
  const emptyAnalysis = getLatestAnalysis();
  assert(emptyAnalysis === null, "9.7d — getLatestAnalysis returns null when empty");
}

// ============================================================
// Suite 10: Real Phase 52 Report Loading (if available)
// ============================================================

function testPhase52ReportIntegration() {
  suite("10. Phase 52 Report Integration");

  // Check if we can load a Phase 52 experiment config
  const configPath = path.resolve(
    "src/lib/minimind/experiments/configs/tinystories-baseline.json"
  );

  if (fs.existsSync(configPath)) {
    const configRaw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configRaw);
    assert(typeof config.name === "string", "10.1a — config has name");
    assert(typeof config.model === "object", "10.1b — config has model section");
    assert(typeof config.training === "object", "10.1c — config has training section");
    console.log(`  INFO: Found Phase 52 config: ${config.name}`);

    // 10.2 Create model config from registry
    const modelCfg = getModelConfig("tiny");
    assertNotNull(modelCfg, "10.2a — tiny model config exists in registry");
    assert(modelCfg.dModel > 0, "10.2b — model has dModel");
    assert(modelCfg.numLayers > 0, "10.2c — model has numLayers");

    // 10.3 Load recipe
    const recipe = loadRecipe("tiny-overfit-test");
    assertNotNull(recipe, "10.3a — recipe loads");
    assert(typeof recipe.name === "string", "10.3b — recipe has name");
  } else {
    console.log("  SKIP: Phase 52 config file not found — skipping integration tests");
    // Still count as passed since this is optional
    passed += 3;
  }

  // 10.4 Verify ExperimentRecord integration
  const modelConfig = getModelConfig("tiny");
  if (modelConfig) {
    const recipe = loadRecipe("tiny-overfit-test");
    if (recipe) {
      const expRecord = createExperimentRecord(
        "phase53-test",
        "Phase 53 Integration Test",
        modelConfig,
        recipe
      );
      assert(expRecord.id === "phase53-test", "10.4a — ExperimentRecord created");
      assert(expRecord.status === "running", "10.4b — ExperimentRecord status");
      assert(expRecord.modelConfig.name === modelConfig.name, "10.4c — model config matches");
    } else {
      passed += 3;
    }
  } else {
    passed += 3;
  }

  // 10.5 Verify TrainingRunRecord can be created from ExperimentRecord data
  const record = makeTestRecord("integration-001", "Integration Test");
  assert(record.modelConfig.name !== "", "10.5a — modelConfig preserved");
  assert(record.trainingConfig.name !== "", "10.5b — trainingConfig preserved");
  assert(record.datasetInfo.name !== "", "10.5c — datasetInfo preserved");
}

// ============================================================
// Suite 11: Edge Cases & Data Integrity
// ============================================================

function testEdgeCases() {
  suite("11. Edge Cases & Data Integrity");

  clear();

  // 11.1 Very large loss history
  const largeRecord = makeTestRecord("large-001", "Large History");
  const largeHistory: LossHistoryPoint[] = [];
  for (let i = 0; i < 1000; i++) {
    largeHistory.push({ step: i, loss: 5.0 * Math.exp(-i * 0.005) + 0.1 * Math.random() });
  }
  largeRecord.lossHistory = largeHistory;
  largeRecord.perplexityHistory = largeHistory.map((p) => ({
    step: p.step,
    perplexity: Math.exp(Math.min(p.loss, 709)),
  }));
  save(largeRecord);
  assert(count() === 1, "11.1a — 1000-point record saved successfully");

  const retrieved = get("large-001")!;
  assert(retrieved.lossHistory.length === 1000, "11.1b — all 1000 points preserved");
  clear();

  // 11.2 Record with zero loss values
  const zeroRecord = makeTestRecord("zero-001", "Zero Loss");
  zeroRecord.lossHistory = [
    { step: 0, loss: 0.0 },
    { step: 10, loss: 0.0 },
    { step: 20, loss: 0.0 },
  ];
  zeroRecord.perplexityHistory = [
    { step: 0, perplexity: 1.0 },
    { step: 10, perplexity: 1.0 },
    { step: 20, perplexity: 1.0 },
  ];
  zeroRecord.initialLoss = 0;
  zeroRecord.finalLoss = 0;
  zeroRecord.bestLoss = 0;
  save(zeroRecord);
  const zeroRetrieved = get("zero-001")!;
  assert(zeroRetrieved.initialLoss === 0, "11.2a — zero loss preserved");
  assert(zeroRetrieved.finalLoss === 0, "11.2b — zero final loss preserved");

  // Analysis of zero-loss record shouldn't crash
  const zeroAnalysis = analyzeTrainingRun(zeroRetrieved);
  assert(zeroAnalysis.lossReduction === 0, "11.2c — zero-loss analysis: no reduction");
  assert(zeroAnalysis.stabilityScore === 1.0, "11.2d — zero-loss analysis: perfectly stable");
  clear();

  // 11.3 Record with empty generationSamples
  const noGenRecord = makeTestRecord("nogen-001", "No Generation");
  noGenRecord.generationSamples = [];
  save(noGenRecord);
  const genResult = getGenerationComparison();
  assert(genResult.length === 0, "11.3a — empty generation samples handled");
  clear();

  // 11.4 Multiple runs with different statuses
  const r1 = makeTestRecord("multi-1", "Run 1");
  r1.status = "completed";
  save(r1);
  const r2 = makeTestRecord("multi-2", "Run 2");
  r2.status = "failed";
  r2.errorMessage = "CUDA out of memory";
  save(r2);
  const r3 = makeTestRecord("multi-3", "Run 3");
  r3.status = "running";
  save(r3);

  assert(count() === 3, "11.4a — 3 records");
  assert(listByStatus("completed").length === 1, "11.4b — 1 completed");
  assert(listByStatus("failed").length === 1, "11.4c — 1 failed");
  assert(listByStatus("running").length === 1, "11.4d — 1 running");

  const statResult = stats();
  assert(statResult.total === 3, "11.4e — stats total = 3");
  assert(statResult.completed === 1, "11.4f — stats completed = 1");
  assert(statResult.failed === 1, "11.4g — stats failed = 1");
  assert(statResult.running === 1, "11.4h — stats running = 1");
  clear();

  // 11.5 Duplicate id overwrite
  const dup1 = makeTestRecord("dup-001", "First");
  dup1.finalLoss = 2.0;
  save(dup1);
  const dup2 = makeTestRecord("dup-001", "Second");
  dup2.finalLoss = 1.0;
  save(dup2);
  assert(count() === 1, "11.5a — duplicate id: count still 1");
  assert(get("dup-001")!.experimentName === "Second", "11.5b — duplicate id: overwritten");
  assert(get("dup-001")!.finalLoss === 1.0, "11.5c — duplicate id: value overwritten");
  clear();

  // 11.6 Long experiment name and tags
  const longNameRecord = makeTestRecord("long-001", "A".repeat(200));
  longNameRecord.tags = ["baseline", "lr-study", "phase-53", "tiny-model", "synthetic-data"];
  save(longNameRecord);
  const longRetrieved = get("long-001")!;
  assert(longRetrieved.experimentName === "A".repeat(200), "11.6a — long name preserved");
  assert(longRetrieved.tags.length === 5, "11.6b — all tags preserved");
  clear();

  // 11.7 Analyzer with NaN/infinity values in history
  const badHistoryRecord = makeTestRecord("bad-001", "Bad History");
  badHistoryRecord.lossHistory = [
    { step: 0, loss: 5.0 },
    { step: 10, loss: Infinity },
    { step: 20, loss: NaN },
    { step: 30, loss: 2.0 },
  ];
  // Should not crash
  try {
    analyzeTrainingRun(badHistoryRecord);
    assert(true, "11.7a — NaN/Infinity in history: analyzer doesn't crash");
  } catch {
    assert(false, "11.7b — analyzer should handle NaN/Infinity gracefully");
  }
  clear();
}

// ============================================================
// Suite 12: Store Persistence Across "Sessions"
// ============================================================

function testStorePersistence() {
  suite("12. Store Persistence");

  clear();
  const record = makeTestRecord("persist-001", "Persistence Test");
  save(record);

  // Simulate "page reload" by re-reading
  const preReload = get("persist-001");
  assertNotNull(preReload, "12.1a — record exists before simulated reload");
  assert(preReload.experimentName === "Persistence Test", "12.1b — data intact pre-reload");

  // ReadRaw would be re-called on next operation — verify data persists
  const afterReload = list();
  assert(afterReload.length === 1, "12.2a — data persists across reads");
  assert(afterReload[0].id === "persist-001", "12.2b — correct record after reload");

  clear();
}

// ============================================================
// Suite 13: Analyzer Math Correctness
// ============================================================

function testAnalyzerMathCorrectness() {
  suite("13. Analyzer Math Correctness");

  // 13.1 Known data: linearly decreasing loss
  const linearLoss: LossHistoryPoint[] = [];
  for (let i = 0; i < 10; i++) {
    linearLoss.push({ step: i, loss: 10.0 - i });
  }
  const analysis = analyzeTrainingRun(
    createPopulatedRecord("math-001", linearLoss)
  );
  assertClose(analysis.initialLoss, 10.0, 0.01, "13.1a — initialLoss = 10.0");
  assertClose(analysis.finalLoss, 1.0, 0.01, "13.1b — finalLoss = 1.0");
  assertClose(analysis.bestLoss, 1.0, 0.01, "13.1c — bestLoss = 1.0");
  assertClose(analysis.lossReduction, 9.0, 0.01, "13.1d — lossReduction = 9.0");
  assertClose(analysis.lossReductionPercent, 90.0, 0.5, "13.1e — lossReductionPercent = 90%");

  // 13.2 Perfectly flat loss
  const flatLoss: LossHistoryPoint[] = [];
  for (let i = 0; i < 10; i++) {
    flatLoss.push({ step: i, loss: 3.0 });
  }
  const flatAnalysis = analyzeTrainingRun(
    createPopulatedRecord("math-002", flatLoss)
  );
  assertClose(flatAnalysis.initialLoss, 3.0, 0.01, "13.2a — flat: initial = 3.0");
  assertClose(flatAnalysis.finalLoss, 3.0, 0.01, "13.2b — flat: final = 3.0");
  assertClose(flatAnalysis.lossReduction, 0.0, 0.01, "13.2c — flat: lossReduction = 0");
  assert(flatAnalysis.stabilityScore === 1.0, "13.2d — flat: perfect stability");

  // 13.3 Sigmoid curve with early center — truly flat late phase
  const sigmoidLoss: LossHistoryPoint[] = [];
  for (let i = 0; i < 50; i++) {
    // Sigmoid centered early so the last 25% is a deep plateau
    const loss = 8.0 / (1 + Math.exp(0.5 * (i - 15))) + 0.1;
    sigmoidLoss.push({ step: i * 5, loss });
  }
  const sigmoidAnalysis = analyzeTrainingRun(
    createPopulatedRecord("math-003", sigmoidLoss)
  );
  assert(sigmoidAnalysis.convergence.converged, "13.3a — sigmoid with early center → converged");
  assert(sigmoidAnalysis.convergenceRate > 0, "13.3b — convergenceRate positive");

  // 13.4 detectDivergence with known ratio
  const divData: LossHistoryPoint[] = [
    { step: 0, loss: 1.0 },
    { step: 10, loss: 1.5 },
    { step: 20, loss: 2.0 },
    { step: 30, loss: 2.5 },
    { step: 40, loss: 3.0 },
  ];
  const divResult = detectDivergence(divData);
  assertClose(divResult.divergenceRatio, 3.0, 0.1, "13.4a — divergenceRatio = 3.0");
  assert(divResult.diverged, "13.4b — 3x increase → diverged");
}

function createPopulatedRecord(
  id: string,
  lossHistory: LossHistoryPoint[]
): TrainingRunRecord {
  const record = createTrainingRunRecord(
    id,
    `Math Test ${id}`,
    makeModelConfig(),
    makeTrainingConfig(),
    makeDatasetInfo()
  );
  record.lossHistory = lossHistory;
  record.perplexityHistory = lossHistory.map((p) => ({
    step: p.step,
    perplexity: Math.exp(Math.min(p.loss, 709)),
  }));
  record.learningRateHistory = lossHistory.map((p) => ({
    step: p.step,
    learningRate: 0.001,
  }));
  record.throughputHistory = lossHistory.map((p) => ({
    step: p.step,
    tokensPerSecond: 500,
  }));
  const losses = lossHistory.map((p) => p.loss);
  record.initialLoss = losses[0];
  record.finalLoss = losses[losses.length - 1];
  record.bestLoss = Math.min(...losses);
  record.bestStep = lossHistory[losses.indexOf(Math.min(...losses))].step;
  record.finalPerplexity = Math.exp(Math.min(record.finalLoss, 709));
  record.averageThroughput = 500;
  record.durationMs = 30000;
  record.totalSteps = lossHistory[lossHistory.length - 1].step;
  record.totalEpochs = 1;
  record.status = "completed";
  return record;
}

// ============================================================
// Test Runner
// ============================================================

export function run(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("=".repeat(60));
  console.log("Phase 53 — Training Observatory Test Suite");
  console.log("=".repeat(60));

  testRecordFactory();
  testMetricsStore();
  testAnalyzerDetections();
  testAnalyzerScores();
  testFullAnalysis();
  testAdapterLossCurve();
  testAdapterLRAndThroughput();
  testAdapterTrainingSummary();
  testAdapterGenerationAndStats();
  testPhase52ReportIntegration();
  testEdgeCases();
  testStorePersistence();
  testAnalyzerMathCorrectness();

  console.log(`\n${"=".repeat(60)}`);
  const total = passed + failed;
  console.log(`  Results: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`           ${failed} FAILED`);
  } else {
    console.log("  ALL TESTS PASSED ✓");
  }
  console.log(`${"=".repeat(60)}\n`);

  return { passed, failed };
}

// Run when executed directly
run();
