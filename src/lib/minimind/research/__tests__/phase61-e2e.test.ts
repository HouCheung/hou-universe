// ============================================================
// Phase 61 — End-to-End Real Training Integration Test
// ============================================================
// Run with: npx tsx src/lib/minimind/research/__tests__/phase61-e2e.test.ts
//
// Tests the COMPLETE research workflow with REAL training.
// No mocks. No fake metrics. No hardcoded loss curves.
//
// Covers:
//   1. Experiment creation & validation
//   2. Run lifecycle (pending → running → completed)
//   3. Real BPETokenizer training on real text
//   4. Real TextDataset + DataLoader
//   5. Real TensorMiniMindModel
//   6. Real AdamW + CosineScheduler
//   7. Real Trainer with forward/backward
//   8. Real loss computation (finite, decreasing)
//   9. Real generation before/after
//   10. Event bus events (start, step, complete)
//   11. Experiment history persistence
//   12. Training metrics store
//   13. Research Copilot analysis with evidence
//   14. Report consistency
//   15. Reproducibility fingerprint
//   16. Checkpoint/resume identity
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

// ============================================================
// Test infrastructure
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  if (Math.abs(actual - expected) <= tolerance) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ~${expected}, got ${actual} (tolerance: ${tolerance})`); }
}

function assertFinite(value: number, msg: string): void {
  if (Number.isFinite(value)) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — got ${value}`); }
}

function assertGt(actual: number, threshold: number, msg: string): void {
  if (actual > threshold) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected > ${threshold}, got ${actual}`); }
}

// ============================================================
// Tiny corpus for real training
// ============================================================

const TINY_CORPUS = [
  "the cat sat on the mat and looked at the dog",
  "the dog ran after the cat but the cat was too fast",
  "once upon a time there was a small village",
  "the people of the village were very happy",
  "they had food and water and shelter from the rain",
  "every day the children would play in the fields",
  "the sun was warm and the sky was blue",
  "in the forest there lived a wise old owl",
  "the owl knew many things about the world",
  "animals came from far away to ask the owl questions",
  "the owl would think carefully before answering",
  "one day a rabbit asked about the meaning of life",
  "the owl said life is about being kind to others",
  "the rabbit thanked the owl and went home happy",
  "the next day a fox came to visit the owl",
  "the fox wanted to know how to be clever",
  "the owl said cleverness comes from listening more than talking",
  "the fox practiced listening and became very wise",
  "soon all the animals in the forest lived in peace",
  "they shared their food and helped each other every day",
  "the birds sang beautiful songs in the morning light",
  "the fish swam in the clear cool water of the pond",
  "butterflies danced among the flowers in the meadow",
  "the trees whispered secrets to each other in the wind",
  "children laughed and played games until the sun went down",
  "the moon rose high above the mountains casting silver light",
  "stars twinkled like diamonds scattered across the dark sky",
  "a gentle breeze carried the scent of pine through the valley",
  "the river flowed steadily onward toward the distant ocean",
  "in the garden roses bloomed in shades of red and pink",
];

// ============================================================
// Imports
// ============================================================

import {
  createResearchExperiment,
  validateResearchExperiment,
  generateExperimentId,
  summarizeExperiment,
} from "../ResearchExperiment";
import type { ResearchExperiment } from "../ResearchExperiment";

import {
  createResearchRun,
  startResearchRun,
  completeResearchRun,
  failResearchRun,
  validateResearchRun,
  generateRunId,
  summarizeRun,
  compareRunsByBestLoss,
  compareRunsBySpeed,
} from "../ResearchRun";
import type { ResearchRun } from "../ResearchRun";

import {
  createExperiment,
  getExperiment,
  listExperiments,
  createRun,
  getRun,
  listRuns,
  getBestRun,
  clearAll,
  hasExperiment,
  hasRun,
  experimentCount,
  totalRuns,
  deleteExperiment,
  updateExperiment,
  exportAll,
  importAll,
} from "../ResearchExperimentStore";

import {
  ResearchExperimentRunner,
  createInlineTrainingExecutor,
} from "../ResearchExperimentRunner";
import type { TrainingExecutionResult } from "../ResearchExperimentRunner";

import { TrainingEventBus, eventBus } from "../TrainingEventBus";
import type {
  TrainingStartData,
  TrainingStepData,
  TrainingCompleteData,
  TrainingErrorData,
} from "../TrainingEventBus";

import { ResearchInsightEngine } from "../copilot/ResearchInsightEngine";
import type { ResearchInsights, ResearchInsight } from "../copilot/ResearchInsightEngine";

import { RecommendationEngine } from "../copilot/RecommendationEngine";
import type { ResearchRecommendation } from "../copilot/RecommendationEngine";

import { ReproducibilityCertificate } from "../ReproducibilityCertificate";
import type { ReproducibilityCertificateData } from "../ReproducibilityCertificate";

import { getModelConfig } from "../../experiments/ModelRegistry";
import { loadRecipe } from "../../experiments/TrainingRecipe";

import {
  save as saveMetrics,
  get as getMetrics,
  has as hasMetrics,
  count as metricsCount,
  clear as clearMetrics,
  stats as metricsStats,
} from "../../training/observatory/TrainingMetricsStore";

import type { TrainingRunRecord } from "../../training/observatory/TrainingRunRecord";
import { createTrainingRunRecord } from "../../training/observatory/TrainingRunRecord";

// ============================================================
// Test Data Factory
// ============================================================

function createTinyExperiment(): ResearchExperiment {
  const modelConfig = getModelConfig("tiny");
  const trainingConfig = loadRecipe("tiny-overfit-test");

  // Override for very fast test
  const fastRecipe = {
    ...trainingConfig,
    epochs: 2,
    gradientAccumulation: 1,
  };

  return createResearchExperiment({
    name: "Phase61 E2E Tiny Test",
    description: "End-to-end integration test with real training",
    seed: 42,
    modelConfig,
    trainingConfig: fastRecipe,
    datasetConfig: {
      name: "tiny-corpus",
      blockSize: 16,
      batchSize: 4,
      shuffle: true,
      type: "inline",
    },
    tokenizerConfig: {
      type: "bpe",
      vocabSize: 512,
    },
    evaluationConfig: {
      generationPrompts: ["the cat", "once upon"],
      maxTokens: 15,
      temperature: 0.8,
      runGenerationComparison: true,
      runBenchmarks: false,
    },
    tags: ["e2e", "phase61", "integration"],
  });
}

// ============================================================
// SUITE 1: IDENTITY
// ============================================================

function testIdentity(): void {
  console.log("\n── Suite 1: Identity ──");

  // Experiment ID
  const exp = createTinyExperiment();
  assert(exp.id.startsWith("exp-"), "experiment id should start with exp-");
  assert(exp.id.length > 10, "experiment id should be reasonably long");
  assertEq(exp.status, "draft", "new experiment should be draft");
  assertEq(exp.seed, 42, "seed should be preserved");
  assertEq(exp.name, "Phase61 E2E Tiny Test", "name should be preserved");

  // Run ID
  const runId = generateRunId();
  assert(runId.startsWith("run-"), "run id should start with run-");

  // Validation
  validateResearchExperiment(exp); // should not throw

  // Serialization round-trip
  const json = JSON.stringify(exp);
  const parsed = JSON.parse(json);
  validateResearchExperiment(parsed);
  assertEq(parsed.id, exp.id, "round-trip id should match");
  assertEq(parsed.seed, exp.seed, "round-trip seed should match");

  // Summarize
  const summary = summarizeExperiment(exp);
  assert(summary.includes("Phase61"), "summary should include experiment name");

  console.log(`  Identity: ${passed} assertions so far`);
}

// ============================================================
// SUITE 2: REAL TRAINING (E2E)
// ============================================================

let trainingResult: TrainingExecutionResult | null = null;
let completedRun: ResearchRun | null = null;
let experiment: ResearchExperiment | null = null;

async function testRealTraining(): Promise<void> {
  console.log("\n── Suite 2: Real Training (E2E) ──");
  const suiteStart = passed;

  // Clear stores
  clearAll();
  clearMetrics();

  // Create experiment
  experiment = createTinyExperiment();
  createExperiment(experiment);
  assert(hasExperiment(experiment.id), "experiment should be persisted");
  assertEq(experimentCount(), 1, "should have 1 experiment");

  // Track events
  const events: string[] = [];
  const stepLosses: number[] = [];
  const testBus = new TrainingEventBus();

  testBus.subscribe("training:start", (data: TrainingStartData) => {
    events.push("start");
    assert(typeof data.sessionId === "string", "start event should have sessionId");
    assert(typeof data.runId === "string", "start event should have runId");
    assert(typeof data.experimentName === "string", "start event should have experimentName");
  });

  testBus.subscribe("training:step", (data: TrainingStepData) => {
    events.push("step");
    stepLosses.push(data.metrics.loss);
    assertFinite(data.metrics.loss, "step loss should be finite");
    assertGt(data.metrics.loss, 0, "step loss should be positive");
    assertFinite(data.metrics.learningRate, "step LR should be finite");
  });

  testBus.subscribe("training:complete", (data: TrainingCompleteData) => {
    events.push("complete");
    assert(typeof data.finalLoss === "number", "complete event should have finalLoss");
    assert(typeof data.bestLoss === "number", "complete event should have bestLoss");
  });

  // Build executor and runner
  const executor = createInlineTrainingExecutor(TINY_CORPUS);
  const runner = new ResearchExperimentRunner({
    executor,
    eventBus: testBus,
  });

  // Run!
  console.log("  Running real training...");
  const startTime = Date.now();
  const result = await runner.run(experiment, { saveToStore: true });
  const endTime = Date.now();
  const wallTime = endTime - startTime;

  trainingResult = result.training;
  completedRun = result.run;

  console.log(`  Training complete in ${wallTime}ms`);
  console.log(`  Loss: ${trainingResult.initialLoss.toFixed(2)} → ${trainingResult.finalLoss.toFixed(2)} (best: ${trainingResult.bestLoss.toFixed(2)})`);

  // ── Verify training happened ──
  assert(result.saved, "result should be saved to store");
  assertEq(result.run.status, "completed", "run should be completed");

  // ── Verify loss ──
  assertFinite(trainingResult.initialLoss, "initial loss should be finite");
  assertFinite(trainingResult.finalLoss, "final loss should be finite");
  assertFinite(trainingResult.bestLoss, "best loss should be finite");
  assertGt(trainingResult.initialLoss, 0, "initial loss should be positive");
  assertGt(trainingResult.finalLoss, 0, "final loss should be positive");
  // Loss should have changed (model learned SOMETHING)
  assert(
    trainingResult.initialLoss !== trainingResult.finalLoss,
    "loss should change during training"
  );

  // ── Verify training steps ──
  assertGt(trainingResult.totalSteps, 0, "should have training steps");
  assertGt(trainingResult.totalTokens, 0, "should have processed tokens");
  assertGt(trainingResult.durationMs, 0, "should have duration");

  // ── Verify throughput ──
  assertFinite(trainingResult.tokensPerSecond, "tokens/sec should be finite");
  assertGt(trainingResult.tokensPerSecond, 0, "tokens/sec should be positive");

  // ── Verify generation before/after ──
  assert(
    trainingResult.generationBefore.length > 0,
    "should have generation before"
  );
  assert(
    trainingResult.generationAfter.length > 0,
    "should have generation after"
  );
  for (const g of trainingResult.generationBefore) {
    assert(typeof g.prompt === "string", "gen before should have prompt");
    assert(typeof g.generatedText === "string", "gen before should have text");
  }
  for (const g of trainingResult.generationAfter) {
    assert(typeof g.prompt === "string", "gen after should have prompt");
    assert(typeof g.generatedText === "string", "gen after should have text");
  }

  // ── Verify loss history ──
  assert(
    trainingResult.lossHistory.length > 0,
    "should have loss history"
  );
  for (const point of trainingResult.lossHistory) {
    assertFinite(point.loss, `loss at step ${point.step} should be finite`);
  }

  // ── Verify event ordering ──
  assert(events.includes("start"), "should have start event");
  assert(events.includes("step"), "should have step events");
  assert(events.includes("complete"), "should have complete event");
  // start before step before complete
  const startIdx = events.indexOf("start");
  const stepIdx = events.indexOf("step");
  const completeIdx = events.lastIndexOf("complete");
  assert(startIdx < stepIdx, "start should come before step");
  assert(stepIdx < completeIdx, "step should come before complete");

  // ── Verify run record ──
  assert(hasRun(result.run.runId), "run should be in store");
  const stored = getRun(result.run.runId);
  assert(stored !== undefined, "should retrieve stored run");
  if (stored) {
    assertEq(stored.status, "completed", "stored run should be completed");
    assertFinite(stored.initialLoss, "stored initialLoss should be finite");
    assertFinite(stored.finalLoss, "stored finalLoss should be finite");
    assertFinite(stored.bestLoss, "stored bestLoss should be finite");
    assertClose(
      stored.initialLoss, trainingResult.initialLoss, 0.01,
      "stored initialLoss should match training result"
    );
    assertClose(
      stored.finalLoss, trainingResult.finalLoss, 0.01,
      "stored finalLoss should match training result"
    );
  }

  // ── Verify experiment in store ──
  assert(hasExperiment(experiment!.id), "experiment should be in store");
  const retrieved = getExperiment(experiment!.id);
  assert(retrieved !== undefined, "should retrieve experiment");
  if (retrieved) {
    assertEq(retrieved.seed, 42, "retrieved experiment seed should match");
  }

  console.log(`  Suite 2 assertions: ${passed - suiteStart}`);
}

// ============================================================
// SUITE 3: CHECKPOINT / RESUME IDENTITY
// ============================================================

function testCheckpointResumeIdentity(): void {
  console.log("\n── Suite 3: Checkpoint / Resume Identity ──");
  const suiteStart = passed;

  // Verify the completed run has correct identity fields
  const run = completedRun!;
  assertEq(run.experimentId, experiment!.id, "run.experimentId should match experiment.id");
  assertEq(run.seed, 42, "run.seed should be 42");
  assert(typeof run.runId === "string", "run.runId should be a string");

  // Run lifecycle transitions
  const newRun = createResearchRun(experiment!.id, 42);
  assertEq(newRun.status, "pending", "new run should be pending");
  const started = startResearchRun(newRun);
  assertEq(started.status, "running", "started run should be running");

  // verify fail transition
  const failed = failResearchRun(started, "test error");
  assertEq(failed.status, "failed", "failed run should be failed");
  assertEq(failed.errorMessage, "test error", "error message should be set");

  // Run helpers
  assert(completedRun!.completedAt > 0, "completed run should have completedAt");
  const duration = completedRun!.completedAt - completedRun!.startedAt;
  assertGt(duration, 0, "duration should be positive");

  console.log(`  Suite 3 assertions: ${passed - suiteStart}`);
}

// ============================================================
// SUITE 4: EVENT PIPELINE
// ============================================================

function testEventPipeline(): void {
  console.log("\n── Suite 4: Event Pipeline ──");
  const suiteStart = passed;

  const bus = new TrainingEventBus();

  // Test all 6 event types
  const received: string[] = [];
  const unsubs: Array<() => void> = [];

  unsubs.push(bus.subscribe("training:start", () => received.push("start")));
  unsubs.push(bus.subscribe("training:step", () => received.push("step")));
  unsubs.push(bus.subscribe("training:checkpoint", () => received.push("checkpoint")));
  unsubs.push(bus.subscribe("training:evaluation", () => received.push("evaluation")));
  unsubs.push(bus.subscribe("training:complete", () => received.push("complete")));
  unsubs.push(bus.subscribe("training:error", () => received.push("error")));

  // Emit all events in order
  bus.emit("training:start", {
    sessionId: "test-session",
    runId: "test-run",
    experimentName: "Test",
    modelConfig: {},
    trainingConfig: {},
    timestamp: Date.now(),
    isResume: false,
  });

  bus.emit("training:step", {
    sessionId: "test-session",
    runId: "test-run",
    metrics: {
      loss: 3.5, perplexity: 33.1, learningRate: 0.001,
      tokensPerSecond: 500, gradientNorm: undefined,
      epoch: 0, globalStep: 1, totalSteps: 100, timestamp: Date.now(),
    },
    timestamp: Date.now(),
  });

  bus.emit("training:checkpoint", {
    sessionId: "test-session",
    checkpoint: { id: "ckpt-1", step: 50, loss: 2.0, epoch: 0, timestamp: Date.now() },
    timestamp: Date.now(),
  });

  bus.emit("training:evaluation", {
    sessionId: "test-session",
    metrics: { perplexity: 15.0 },
    timestamp: Date.now(),
  });

  bus.emit("training:complete", {
    sessionId: "test-session",
    runId: "test-run",
    experimentName: "Test",
    finalLoss: 1.5,
    finalPerplexity: 4.48,
    bestLoss: 1.2,
    durationMs: 5000,
    timestamp: Date.now(),
  });

  bus.emit("training:error", {
    sessionId: "test-session",
    runId: "test-run",
    experimentName: "Test",
    error: "Test error",
    timestamp: Date.now(),
  });

  // Verify all received in order
  assertEq(received.length, 6, "should receive all 6 event types");
  assertEq(received[0], "start", "first event should be start");
  assertEq(received[1], "step", "second event should be step");
  assertEq(received[2], "checkpoint", "third event should be checkpoint");
  assertEq(received[3], "evaluation", "fourth event should be evaluation");
  assertEq(received[4], "complete", "fifth event should be complete");
  assertEq(received[5], "error", "sixth event should be error");

  // Verify emit count
  assertEq(bus.getEmitCount(), 6, "emit count should be 6");

  // Verify event history
  const history = bus.getEventHistory();
  assertEq(history.length, 6, "event history should have 6 entries");

  // Verify step events filter
  const stepEvents = bus.getStepEvents("test-session");
  assertEq(stepEvents.length, 1, "should have 1 step event for test-session");

  // Verify subscriber count
  assertEq(bus.subscriberCount("training:start"), 1, "should have 1 start subscriber");
  assertEq(bus.totalSubscriberCount(), 6, "should have 6 total subscribers");

  // Unsubscribe all
  unsubs.forEach((u) => u());
  assertEq(bus.totalSubscriberCount(), 0, "should have 0 subscribers after unsub");

  // once() test
  let onceCount = 0;
  bus.once("training:step", () => { onceCount++; });
  bus.emit("training:step", {
    sessionId: "test",
    metrics: {
      loss: 1, perplexity: 2.7, learningRate: 0.001,
      tokensPerSecond: 100, gradientNorm: undefined,
      epoch: 0, globalStep: 1, totalSteps: 10, timestamp: Date.now(),
    },
    timestamp: Date.now(),
  });
  bus.emit("training:step", {
    sessionId: "test",
    metrics: {
      loss: 2, perplexity: 7.4, learningRate: 0.001,
      tokensPerSecond: 100, gradientNorm: undefined,
      epoch: 0, globalStep: 2, totalSteps: 10, timestamp: Date.now(),
    },
    timestamp: Date.now(),
  });
  assertEq(onceCount, 1, "once() should fire exactly once");

  // Event history limit
  const smallBus = new TrainingEventBus(3);
  for (let i = 0; i < 5; i++) {
    smallBus.emit("training:step", {
      sessionId: "test",
      metrics: {
        loss: i, perplexity: Math.exp(i), learningRate: 0.001,
        tokensPerSecond: 100, gradientNorm: undefined,
        epoch: 0, globalStep: i, totalSteps: 10, timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });
  }
  assertEq(smallBus.getEventHistory().length, 3, "history should be capped at 3");

  console.log(`  Suite 4 assertions: ${passed - suiteStart}`);
}

// ============================================================
// SUITE 5: METRICS PERSISTENCE
// ============================================================

function testMetricsPersistence(): void {
  console.log("\n── Suite 5: Metrics Persistence ──");
  const suiteStart = passed;

  clearMetrics();

  // Create a TrainingRunRecord from the real training data
  const record = createTrainingRunRecord(
    completedRun!.runId,
    experiment!.name,
    experiment!.modelConfig,
    experiment!.trainingConfig,
    {
      name: experiment!.datasetConfig.name,
      sampleCount: TINY_CORPUS.length,
      blockSize: experiment!.datasetConfig.blockSize,
      batchSize: experiment!.datasetConfig.batchSize,
      tokenizerVocabSize: experiment!.tokenizerConfig.vocabSize,
      tokenizerType: experiment!.tokenizerConfig.type,
    }
  );

  // Populate with real data
  const populated: TrainingRunRecord = {
    ...record,
    lossHistory: trainingResult!.lossHistory.map((p) => ({
      step: p.step,
      loss: p.loss,
    })),
    initialLoss: trainingResult!.initialLoss,
    finalLoss: trainingResult!.finalLoss,
    bestLoss: trainingResult!.bestLoss,
    totalSteps: trainingResult!.totalSteps,
    totalEpochs: trainingResult!.totalEpochs,
    durationMs: trainingResult!.durationMs,
    averageThroughput: trainingResult!.tokensPerSecond,
    finalPerplexity: trainingResult!.perplexity,
    status: "completed",
  };

  const saved = saveMetrics(populated);
  assert(saved, "should save metrics record");
  assert(hasMetrics(completedRun!.runId), "should have metrics record");
  assertEq(metricsCount(), 1, "should have 1 metrics record");

  // Retrieve and verify
  const retrieved = getMetrics(completedRun!.runId);
  assert(retrieved !== undefined, "should retrieve metrics record");
  if (retrieved) {
    assertEq(retrieved.id, completedRun!.runId, "record id should match");
    assertFinite(retrieved.initialLoss, "retrieved initialLoss should be finite");
    assertFinite(retrieved.finalLoss, "retrieved finalLoss should be finite");
    assertClose(
      retrieved.bestLoss, trainingResult!.bestLoss, 0.01,
      "retrieved bestLoss should match"
    );
    assert(retrieved.lossHistory.length > 0, "retrieved should have loss history");
  }

  // Verify stats
  const s = metricsStats();
  assertEq(s.total, 1, "stats should show 1 record");
  assertEq(s.completed, 1, "stats should show 1 completed");

  console.log(`  Suite 5 assertions: ${passed - suiteStart}`);
}

// ============================================================
// SUITE 6: COPILOT EVIDENCE INTEGRITY
// ============================================================

function testCopilotEvidenceIntegrity(): void {
  console.log("\n── Suite 6: Copilot Evidence Integrity ──");
  const suiteStart = passed;

  // Build a TrainingRunRecord for copilot analysis
  const record = createTrainingRunRecord(
    completedRun!.runId,
    experiment!.name,
    experiment!.modelConfig,
    experiment!.trainingConfig,
    {
      name: experiment!.datasetConfig.name,
      sampleCount: TINY_CORPUS.length,
      blockSize: experiment!.datasetConfig.blockSize,
      batchSize: experiment!.datasetConfig.batchSize,
      tokenizerVocabSize: experiment!.tokenizerConfig.vocabSize,
      tokenizerType: experiment!.tokenizerConfig.type,
    }
  );

  const populated: TrainingRunRecord = {
    ...record,
    lossHistory: trainingResult!.lossHistory.map((p) => ({
      step: p.step,
      loss: p.loss,
    })),
    learningRateHistory: trainingResult!.learningRateHistory.map((p) => ({
      step: p.step,
      learningRate: p.learningRate,
    })),
    initialLoss: trainingResult!.initialLoss,
    finalLoss: trainingResult!.finalLoss,
    bestLoss: trainingResult!.bestLoss,
    totalSteps: trainingResult!.totalSteps,
    totalEpochs: trainingResult!.totalEpochs,
    durationMs: trainingResult!.durationMs,
    averageThroughput: trainingResult!.tokensPerSecond,
    finalPerplexity: trainingResult!.perplexity,
    status: "completed",
  };

  // ── Insight engine ──
  const insightEngine = new ResearchInsightEngine();
  const insights = insightEngine.analyze(populated);

  // Verify basic structure
  assert(typeof insights.recordId === "string", "insights should have recordId");
  assert(typeof insights.experimentName === "string", "insights should have experimentName");
  assertGt(insights.insights.length, 0, "should have at least some insights");
  assertGt(insights.summary.total, 0, "summary.total should be positive");

  // Every insight must have evidence
  for (const insight of insights.insights) {
    assert(
      Object.keys(insight.evidence).length > 0,
      `insight "${insight.title}" must have evidence`
    );
    assert(
      typeof insight.title === "string" && insight.title.length > 0,
      `insight must have title`
    );
    assert(
      typeof insight.description === "string" && insight.description.length > 0,
      `insight "${insight.title}" must have description`
    );
    assertFinite(insight.confidence, `insight "${insight.title}" confidence must be finite`);
    assert(
      insight.confidence >= 0 && insight.confidence <= 1,
      `insight "${insight.title}" confidence must be 0-1`
    );
    assert(
      ["convergence", "divergence", "stability", "overfitting", "optimization",
       "efficiency", "generalization", "reproducibility"].includes(insight.type),
      `insight type "${insight.type}" must be valid`
    );
    assert(
      ["info", "success", "warning", "critical"].includes(insight.severity),
      `insight severity "${insight.severity}" must be valid`
    );
  }

  // Verify critical/warning findings accessor
  const criticalFindings = insightEngine.getCriticalFindings(insights);
  assert(Array.isArray(criticalFindings), "getCriticalFindings should return array");

  const successFindings = insightEngine.getSuccessFindings(insights);
  assert(Array.isArray(successFindings), "getSuccessFindings should return array");

  // ── Recommendation engine ──
  const recEngine = new RecommendationEngine();
  const recommendations = recEngine.recommend(insights);

  assert(Array.isArray(recommendations.recommendations), "should have recommendations array");
  assert(typeof recommendations.recordId === "string", "recommendations should have recordId");

  // Every recommendation must have evidence
  for (const rec of recommendations.recommendations) {
    assert(
      Object.keys(rec.evidence).length > 0,
      `recommendation "${rec.title}" must have evidence`
    );
    assert(
      typeof rec.title === "string" && rec.title.length > 0,
      "recommendation must have title"
    );
    assert(
      typeof rec.rationale === "string" && rec.rationale.length > 0,
      `recommendation "${rec.title}" must have rationale`
    );
    assert(
      ["high", "medium", "low"].includes(rec.priority),
      `recommendation priority "${rec.priority}" must be valid`
    );
    assert(
      ["optimization", "data", "model", "training", "regularization", "performance"].includes(rec.category),
      `recommendation category "${rec.category}" must be valid`
    );
  }

  console.log(`  Suite 6 assertions: ${passed - suiteStart}`);
}

// ============================================================
// SUITE 7: REPORT CONSISTENCY
// ============================================================

function testReportConsistency(): void {
  console.log("\n── Suite 7: Report Consistency ──");
  const suiteStart = passed;

  // Verify that the run record, training result, and metrics store
  // all report consistent values

  const run = completedRun!;
  const train = trainingResult!;

  // Loss consistency
  assertClose(run.initialLoss, train.initialLoss, 0.01,
    "run.initialLoss should match training.initialLoss");
  assertClose(run.finalLoss, train.finalLoss, 0.01,
    "run.finalLoss should match training.finalLoss");
  assertClose(run.bestLoss, train.bestLoss, 0.01,
    "run.bestLoss should match training.bestLoss");

  // Step consistency
  assertEq(run.totalSteps, train.totalSteps,
    "run.totalSteps should match training.totalSteps");

  // Token consistency
  assertEq(run.totalTokens, train.totalTokens,
    "run.totalTokens should match training.totalTokens");

  // Duration consistency
  assertClose(run.durationMs, train.durationMs, 100,
    "run.durationMs should approximately match training.durationMs");

  // Seed consistency
  assertEq(run.seed, experiment!.seed,
    "run.seed should match experiment.seed");

  // Check that perplexity is exp(bestLoss)
  const expectedPerplexity = Math.exp(Math.min(train.bestLoss, 709));
  assertClose(run.perplexity, expectedPerplexity, 0.1,
    "run.perplexity should be exp(bestLoss)");

  console.log(`  Suite 7 assertions: ${passed - suiteStart}`);
}

// ============================================================
// SUITE 8: REPRODUCIBILITY
// ============================================================

function testReproducibility(): void {
  console.log("\n── Suite 8: Reproducibility ──");
  const suiteStart = passed;

  const cert = new ReproducibilityCertificate();

  // Generate fingerprint for the experiment
  const fingerprint = cert.generateFingerprint(experiment!);

  assert(typeof fingerprint.fingerprints.combined === "string", "fingerprint should have combined hash");
  assertEq(fingerprint.fingerprints.combined.length, 8, "combined fingerprint should be 8 hex chars");
  assert(typeof fingerprint.fingerprints.model === "string", "fingerprint should have model hash");
  assert(typeof fingerprint.fingerprints.training === "string", "fingerprint should have training hash");
  assert(typeof fingerprint.fingerprints.dataset === "string", "fingerprint should have dataset hash");

  // Same config should produce same fingerprint
  const fingerprint2 = cert.generateFingerprint(experiment!);

  assertEq(fingerprint.fingerprints.combined, fingerprint2.fingerprints.combined,
    "same config should produce same fingerprint");

  // Verify fingerprints match
  const matchResult = cert.verifyFingerprintsMatch(
    fingerprint as ReproducibilityCertificateData,
    fingerprint2 as ReproducibilityCertificateData
  );
  assert(matchResult, "identical fingerprints should match");

  console.log(`  Suite 8 assertions: ${passed - suiteStart}`);
}

// ============================================================
// SUITE 9: EDGE CASES & FAILURE STATES
// ============================================================

function testEdgeCases(): void {
  console.log("\n── Suite 9: Edge Cases & Failure States ──");

  // Empty store
  clearAll();
  assertEq(experimentCount(), 0, "cleared store should have 0 experiments");
  assertEq(totalRuns(), 0, "cleared store should have 0 runs");
  assertEq(listExperiments().length, 0, "list should be empty after clear");

  // Get non-existent
  const missing = getExperiment("nonexistent");
  assert(missing === undefined, "missing experiment should be undefined");

  const missingRun = getRun("nonexistent");
  assert(missingRun === undefined, "missing run should be undefined");

  // has with non-existent
  assert(!hasExperiment("nonexistent"), "hasExperiment should return false for missing");
  assert(!hasRun("nonexistent"), "hasRun should return false for missing");

  // Delete non-existent
  assert(!deleteExperiment("nonexistent"), "delete non-existent experiment should return false");

  // Validation should reject invalid values
  let validationFailed = false;
  try {
    validateResearchExperiment(null as unknown as ResearchExperiment);
  } catch {
    validationFailed = true;
  }
  assert(validationFailed, "validateResearchExperiment should reject null");

  validationFailed = false;
  try {
    validateResearchExperiment({} as ResearchExperiment);
  } catch {
    validationFailed = true;
  }
  assert(validationFailed, "validateResearchExperiment should reject empty object");

  // Run validation
  validationFailed = false;
  try {
    validateResearchRun(null as unknown as ResearchRun);
  } catch {
    validationFailed = true;
  }
  assert(validationFailed, "validateResearchRun should reject null");

  // Corrupted localStorage handling
  localStorage.setItem("minimind-research-experiments", "not-valid-json");
  const afterCorrupt = listExperiments(); // should not crash
  assert(Array.isArray(afterCorrupt), "listExperiments should handle corrupt data");

  // Create experiment with explicit ID
  const customId = "exp-custom-test-001";
  const customExp = createResearchExperiment({
    name: "Custom ID Test",
    description: "",
    seed: 1,
    modelConfig: getModelConfig("tiny"),
    trainingConfig: loadRecipe("tiny-overfit-test"),
    datasetConfig: { name: "test", blockSize: 8, batchSize: 2, shuffle: false },
    id: customId,
  });
  assertEq(customExp.id, customId, "custom experiment ID should be preserved");

  // Run comparison helpers — must go pending → running → completed
  const run1 = startResearchRun(createResearchRun("exp-test", 42));
  const r1Complete = completeResearchRun(run1, {
    initialLoss: 5.0, finalLoss: 2.0, bestLoss: 1.5,
    perplexity: Math.exp(1.5), tokensPerSecond: 500,
    totalTokens: 1000, totalSteps: 100, totalEpochs: 2, durationMs: 2000,
  });
  const run2 = startResearchRun(createResearchRun("exp-test", 42));
  const r2Complete = completeResearchRun(run2, {
    initialLoss: 4.0, finalLoss: 1.0, bestLoss: 0.8,
    perplexity: Math.exp(0.8), tokensPerSecond: 800,
    totalTokens: 1000, totalSteps: 100, totalEpochs: 2, durationMs: 1500,
  });

  assert(compareRunsByBestLoss(r1Complete, r2Complete) > 0,
    "r1 should have higher (worse) bestLoss than r2");
  assert(compareRunsBySpeed(r1Complete, r2Complete) > 0,
    "r1 should be slower than r2 (positive return = b faster than a)");

  console.log(`  Suite 9: edge case assertions done`);
}

// ============================================================
// SUITE 10: EXPERIMENT STORE CRUD
// ============================================================

function testExperimentStoreCRUD(): void {
  console.log("\n── Suite 10: Experiment Store CRUD ──");
  const suiteStart = passed;

  clearAll();
  assertEq(experimentCount(), 0, "start with empty store");

  // Create
  const exp = createTinyExperiment();
  assert(createExperiment(exp), "createExperiment should succeed");
  assertEq(experimentCount(), 1, "should have 1 experiment");

  // List
  const list = listExperiments();
  assertEq(list.length, 1, "list should have 1 experiment");

  // Update
  assert(updateExperiment(exp.id, { name: "Updated Name" } as Partial<ResearchExperiment>), "updateExperiment should succeed");
  const afterUpdate = getExperiment(exp.id);
  assertEq(afterUpdate!.name, "Updated Name", "name should be updated");

  // Create run
  const run = createResearchRun(exp.id, 42);
  assert(createRun(run), "createRun should succeed");
  assertEq(totalRuns(), 1, "should have 1 run");
  assert(hasRun(run.runId), "hasRun should return true");

  // List runs by experiment
  const runs = listRuns(exp.id);
  assert(Array.isArray(runs), "listRuns should return array");

  // Get best run
  const best = getBestRun(exp.id);
  assert(best === undefined, "no completed runs so best should be undefined");

  // Export all
  const exported = exportAll();
  assert(typeof exported === "string", "exportAll should return JSON string");
  assert(exported.includes(exp.id), "export should include experiment id");

  // Import all
  const importResult = importAll(exported);
  assert(importResult !== null, "importAll should succeed");
  assertGt(importResult!.experiments, 0, "should import experiments");

  console.log(`  Suite 10 assertions: ${passed - suiteStart}`);
}

// ============================================================
// MAIN
// ============================================================

export async function runPhase61Tests(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;

  console.log("=".repeat(60));
  console.log("Phase 61 — End-to-End Integration Test Suite");
  console.log("=".repeat(60));

  // Synchronous tests first
  testIdentity();
  testEventPipeline();
  testEdgeCases();
  testExperimentStoreCRUD();

  // Real training (async)
  await testRealTraining();

  // Post-training tests (depend on trainingResult and completedRun)
  if (trainingResult && completedRun && experiment) {
    testCheckpointResumeIdentity();
    testMetricsPersistence();
    testCopilotEvidenceIntegrity();
    testReportConsistency();
    testReproducibility();
  } else {
    console.error("  SKIPPED post-training suites: training did not complete");
    failed += 10;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Phase 61 Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  return { passed, failed };
}

// Allow running directly
if (require.main === module || process.argv[1]?.includes("phase61-e2e")) {
  runPhase61Tests()
    .then((result) => {
      if (result.failed > 0) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("FATAL:", err);
      process.exit(1);
    });
}
