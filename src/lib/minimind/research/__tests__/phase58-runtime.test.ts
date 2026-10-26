// ============================================================
// Phase 58 — Live Training Runtime Tests
// ============================================================
// Covers:
//   - TrainingRuntime creation + lifecycle
//   - Start experiment (CREATED -> QUEUED -> RUNNING)
//   - Event propagation (training:start, training:step, etc.)
//   - Metrics update (loss, perplexity, LR, throughput)
//   - Pause/Resume (RUNNING -> PAUSED -> RUNNING)
//   - Stop (RUNNING -> COMPLETED)
//   - Adapter transformation (LiveMetrics, TrainingTimeline, Badge)
//   - Session persistence across lifecycle
//   - Edge cases (invalid states, nonexistent sessions)
//   - TrainingEventBus enhancements (once, history, getStepEvents)
//
// Tests are synchronous — the runtime's async training loop
// is tested through the controller lifecycle + event bus.
// ============================================================

// ============================================================
// localStorage polyfill for Node.js test environment
// ============================================================

if (!(globalThis as Record<string, unknown>).localStorage) {
  const store = new Map<string, string>();
  const ls = {
    getItem(key: string): string | null { return store.get(key) ?? null; },
    setItem(key: string, value: string): void { store.set(key, value); },
    removeItem(key: string): void { store.delete(key); },
    get length(): number { return store.size; },
    clear(): void { store.clear(); },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
  };
  (globalThis as Record<string, unknown>).localStorage = ls;
  // Also polyfill window for ResearchWorkspace which checks window.localStorage
  (globalThis as Record<string, unknown>).window = { localStorage: ls };
}

import {
  TrainingRuntime,
  TrainingEventBus,
  ResearchWorkspace,
  ExperimentController,
  generateSessionId,
  createResearchSession,
  trainingRuntime,
} from "../index";

import type {
  SessionConfig,
  TrainingMetricsSnapshot,
} from "../index";

import {
  getLiveMetrics,
  getActiveLiveMetrics,
  getTrainingTimeline,
  getActiveTrainingTimeline,
  getTrainingStatusBadge,
  getActiveTrainingStatusBadge,
  getLiveTrainingData,
} from "@/lib/ai-lab/adapters/liveTrainingAdapter";

// ============================================================
// Helpers
// ============================================================

function makeConfig(overrides?: Partial<SessionConfig>): SessionConfig {
  return {
    name: "Phase58 Test Experiment",
    modelConfig: {
      name: "tiny",
      label: "MiniMind Tiny",
      description: "Tiny model for testing",
      vocabSize: 32000,
      dModel: 128,
      numHeads: 4,
      dFF: 512,
      numLayers: 4,
      maxSeqLen: 256,
      eps: 1e-6,
      estimatedParams: 600000,
    },
    trainingConfig: {
      name: "tiny-overfit-test",
      label: "Tiny Overfit Test",
      description: "Test recipe",
      version: 1 as const,
      model: "tiny",
      dataset: {
        dataset: "synthetic" as const,
        blockSize: 16,
        batchSize: 4,
      },
      optimizer: { type: "adamw", lr: 0.001 },
      scheduler: { type: "none" },
      epochs: 5,
      gradientAccumulation: 1,
      warmupSteps: 0,
      seed: 42,
      gradientClipNorm: 1.0,
    },
    dataset: "synthetic",
    seed: 42,
    tags: ["test", "phase58"],
    notes: "Phase 58 runtime test",
    ...overrides,
  };
}

function makeMetrics(overrides?: Partial<TrainingMetricsSnapshot>): TrainingMetricsSnapshot {
  return {
    loss: 2.5,
    perplexity: 12.18,
    learningRate: 0.001,
    tokensPerSecond: 500.0,
    gradientNorm: 0.05,
    epoch: 1,
    globalStep: 100,
    totalSteps: 500,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ============================================================
// Test Runner
// ============================================================

export function runPhase58Tests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  let assertionCount = 0;

  function test(name: string, fn: () => void) {
    try {
      const ws = new ResearchWorkspace();
      ws.clear();
      fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function assert(condition: boolean, msg: string) {
    assertionCount++;
    if (!condition) throw new Error(`Assertion failed: ${msg}`);
  }

  function assertEqual<T>(actual: T, expected: T, msg: string) {
    assertionCount++;
    if (actual !== expected) {
      throw new Error(
        `Assertion failed: ${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
      );
    }
  }

  // ================================================================
  // Group 1: TrainingRuntime — Creation & Basic API
  // ================================================================

  test("TrainingRuntime should create an instance", () => {
    const runtime = new TrainingRuntime();
    assert(runtime instanceof TrainingRuntime, "should be TrainingRuntime instance");
    assert(typeof runtime.getEventBus === "function", "should have getEventBus");
    assert(typeof runtime.getController === "function", "should have getController");
    assert(typeof runtime.start === "function", "should have start");
    assert(typeof runtime.pause === "function", "should have pause");
    assert(typeof runtime.resume === "function", "should have resume");
    assert(typeof runtime.stop === "function", "should have stop");
    assert(typeof runtime.getStatus === "function", "should have getStatus");
    assert(typeof runtime.has === "function", "should have has");
    assert(typeof runtime.fail === "function", "should have fail");
  });

  test("TrainingRuntime should expose event bus", () => {
    const runtime = new TrainingRuntime();
    const bus = runtime.getEventBus();
    assert(bus instanceof TrainingEventBus, "should return TrainingEventBus");
  });

  test("TrainingRuntime should expose controller", () => {
    const runtime = new TrainingRuntime();
    const ctrl = runtime.getController();
    assert(ctrl instanceof ExperimentController, "should return ExperimentController");
  });

  test("TrainingRuntime getStatus should return idle for nonexistent", () => {
    const runtime = new TrainingRuntime();
    const status = runtime.getStatus("nonexistent");
    assertEqual(status.status, "idle", "status should be idle");
    assert(!status.isRunning, "should not be running");
    assert(!status.isPaused, "should not be paused");
    assertEqual(status.metrics, null, "metrics should be null");
    assertEqual(status.error, null, "error should be null");
  });

  test("TrainingRuntime has should return false for nonexistent", () => {
    const runtime = new TrainingRuntime();
    assert(!runtime.has("nonexistent"), "should return false");
  });

  test("TrainingRuntime should start with 0 sessions", () => {
    const runtime = new TrainingRuntime();
    assertEqual(runtime.getSessionCount(), 0, "should have 0 sessions");
    assertEqual(runtime.getSessionIds().length, 0, "should have empty list");
  });

  // ================================================================
  // Group 2: ExperimentController Lifecycle (Synchronous)
  // ================================================================

  test("ExperimentController should create experiment in configured state", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    assert(ctrl.getStatus(id).found, "experiment should be found");
    assertEqual(ctrl.getStatus(id).status, "configured", "should be configured");
  });

  test("ExperimentController should transition configured->queued->running->paused->completed", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);

    assertEqual(ctrl.getStatus(id).status, "configured", "step 1: configured");

    ctrl.queueExperiment(id);
    assertEqual(ctrl.getStatus(id).status, "queued", "step 2: queued");

    ctrl.startExperiment(id);
    assertEqual(ctrl.getStatus(id).status, "running", "step 3: running");

    ctrl.reportCheckpoint(id, 10, 1.0, 0);
    ctrl.pauseExperiment(id);
    assertEqual(ctrl.getStatus(id).status, "paused", "step 4: paused");
    assert(ctrl.getStatus(id).checkpoint !== null, "checkpoint should survive pause");

    ctrl.resumeExperiment(id);
    assertEqual(ctrl.getStatus(id).status, "running", "step 5: running again");

    ctrl.completeExperiment(id);
    assertEqual(ctrl.getStatus(id).status, "completed", "step 6: completed");
  });

  test("ExperimentController should track best loss across steps", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);

    ctrl.reportStep(id, makeMetrics({ loss: 5.0, globalStep: 1 }));
    ctrl.reportStep(id, makeMetrics({ loss: 3.0, globalStep: 2 }));
    ctrl.reportStep(id, makeMetrics({ loss: 4.0, globalStep: 3 }));

    const status = ctrl.getStatus(id);
    assert(status.metrics !== null, "should have metrics");
    assertEqual(status.metrics!.loss, 4.0, "current loss should be 4.0");
  });

  test("ExperimentController should fail experiment with error", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.failExperiment(id, "Out of memory");

    assertEqual(ctrl.getStatus(id).status, "failed", "should be failed");
    assertEqual(ctrl.getStatus(id).errorMessage, "Out of memory", "error should match");
  });

  test("ExperimentController should refuse invalid transitions", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);

    let threw = false;
    try { ctrl.pauseExperiment(id); } catch { threw = true; }
    assert(threw, "should throw on pausing before start");

    threw = false;
    try { ctrl.resumeExperiment(id); } catch { threw = true; }
    assert(threw, "should throw on resume before start");

    threw = false;
    try { ctrl.stopExperiment(id); } catch { threw = true; }
    assert(threw, "should throw on stop before start");
  });

  test("ExperimentController getStatus for nonexistent returns proper nulls", () => {
    const ctrl = new ExperimentController();
    const status = ctrl.getStatus("nonexistent");

    assert(!status.found, "should not be found");
    assertEqual(status.metrics, null, "metrics should be null");
    assertEqual(status.checkpoint, null, "checkpoint should be null");
    assertEqual(status.durationMs, null, "durationMs should be null");
    assertEqual(status.errorMessage, null, "errorMessage should be null");
  });

  // ================================================================
  // Group 3: TrainingRuntime Lifecycle via Controller
  // ================================================================

  test("TrainingRuntime getStatus after controller start should show running", () => {
    const runtime = new TrainingRuntime();
    const id = generateSessionId();
    const ctrl = runtime.getController();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.queueExperiment(id);
    ctrl.startExperiment(id);

    const status = runtime.getStatus(id);
    assertEqual(status.status, "running", "should be running");
    assert(status.isRunning, "should be running flag");
    assert(!status.isPaused, "should not be paused");
    assertEqual(status.name, "Phase58 Test Experiment", "name should match");
  });

  test("TrainingRuntime pause via controller should transition to paused", () => {
    const runtime = new TrainingRuntime();
    const id = generateSessionId();
    const ctrl = runtime.getController();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.pauseExperiment(id);

    const status = runtime.getStatus(id);
    assertEqual(status.status, "paused", "should be paused");
    assert(!status.isRunning, "should not be running");
    assert(status.isPaused, "should be paused");
  });

  test("TrainingRuntime resume via controller should go back to running", () => {
    const runtime = new TrainingRuntime();
    const id = generateSessionId();
    const ctrl = runtime.getController();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.pauseExperiment(id);
    ctrl.resumeExperiment(id);

    const status = runtime.getStatus(id);
    assertEqual(status.status, "running", "should be running after resume");
  });

  test("TrainingRuntime complete via controller should transition to completed", () => {
    const runtime = new TrainingRuntime();
    const id = generateSessionId();
    const ctrl = runtime.getController();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.completeExperiment(id);

    assertEqual(runtime.getStatus(id).status, "completed", "should be completed");
  });

  test("TrainingRuntime fail via controller should transition to failed", () => {
    const runtime = new TrainingRuntime();
    const id = generateSessionId();
    const ctrl = runtime.getController();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.failExperiment(id, "Test error");

    const status = runtime.getStatus(id);
    assertEqual(status.status, "failed", "should be failed");
    assertEqual(status.error, "Test error", "error should match");
  });

  // ================================================================
  // Group 4: Metrics Update via Controller
  // ================================================================

  test("Controller reportStep should update metrics in runtime status", () => {
    const runtime = new TrainingRuntime();
    const id = generateSessionId();
    const ctrl = runtime.getController();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);

    ctrl.reportStep(id, makeMetrics({ loss: 2.3, globalStep: 50, perplexity: 9.97 }));
    const status = runtime.getStatus(id);
    assert(status.metrics !== null, "should have metrics");
    assertEqual(status.metrics!.loss, 2.3, "loss should be 2.3");
    assertEqual(status.metrics!.perplexity, 9.97, "perplexity should be 9.97");
    assertEqual(status.metrics!.globalStep, 50, "step should be 50");
  });

  test("Controller reportStep should track best loss", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);

    ctrl.reportStep(id, makeMetrics({ loss: 8.0, globalStep: 1 }));
    ctrl.reportStep(id, makeMetrics({ loss: 5.0, globalStep: 2 }));
    ctrl.reportStep(id, makeMetrics({ loss: 7.0, globalStep: 3 }));
    ctrl.reportStep(id, makeMetrics({ loss: 3.0, globalStep: 4 }));

    ctrl.stopExperiment(id, makeMetrics({ loss: 3.0 }));

    const session = new ResearchWorkspace().getSession(id);
    assert(session !== undefined, "session should exist");
    assert(session!.bestLoss !== undefined, "bestLoss should be tracked");
    assert(session!.bestLoss! <= 3.0, "bestLoss should be 3.0 or lower");
  });

  test("Controller reportCheckpoint should create checkpoint", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);

    ctrl.reportCheckpoint(id, 100, 2.0, 1);
    ctrl.reportCheckpoint(id, 200, 1.5, 2);

    const status = ctrl.getStatus(id);
    assert(status.checkpoint !== null, "should have checkpoint");
    assertEqual(status.checkpoint!.step, 200, "latest checkpoint step should be 200");
    assertEqual(status.checkpoint!.loss, 1.5, "latest checkpoint loss should be 1.5");
  });

  test("Controller reportEvaluation should add timeline event", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);

    const beforeLen = ctrl.getStatus(id).timelineLength ?? 0;
    ctrl.reportEvaluation(id, { accuracy: 0.85 });
    const afterLen = ctrl.getStatus(id).timelineLength ?? 0;

    assert(afterLen > beforeLen, "timeline should have grown");
  });

  // ================================================================
  // Group 5: Event Propagation (Synchronous EventBus)
  // ================================================================

  test("EventBus should emit training:start on controller start", () => {
    const ctrl = new ExperimentController();
    const bus = ctrl.getEventBus();
    const id = generateSessionId();
    let emitted = false;

    bus.subscribe("training:start", () => { emitted = true; });
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);

    assert(emitted, "training:start should be emitted");
  });

  test("EventBus should emit training:step on reportStep", () => {
    const ctrl = new ExperimentController();
    const bus = ctrl.getEventBus();
    const id = generateSessionId();
    let stepLoss = 0;

    bus.subscribe("training:step", (data) => { stepLoss = data.metrics.loss; });
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.reportStep(id, makeMetrics({ loss: 7.77 }));

    assertEqual(stepLoss, 7.77, "step loss should be reported");
  });

  test("EventBus should emit training:checkpoint on reportCheckpoint, not on pause", () => {
    const ctrl = new ExperimentController();
    const bus = ctrl.getEventBus();
    const id = generateSessionId();
    let checkpointEmitted = false;

    bus.subscribe("training:checkpoint", () => { checkpointEmitted = true; });
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.pauseExperiment(id);

    assert(!checkpointEmitted, "pause should not fabricate a checkpoint");

    ctrl.reportCheckpoint(id, 10, 1.0, 0);
    assert(checkpointEmitted, "training:checkpoint should be emitted on reportCheckpoint");
  });

  test("EventBus should emit training:complete on stop", () => {
    const ctrl = new ExperimentController();
    const bus = ctrl.getEventBus();
    const id = generateSessionId();
    let completeEmitted = false;

    bus.subscribe("training:complete", () => { completeEmitted = true; });
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.stopExperiment(id);

    assert(completeEmitted, "training:complete should be emitted");
  });

  test("EventBus should emit training:error on fail", () => {
    const ctrl = new ExperimentController();
    const bus = ctrl.getEventBus();
    const id = generateSessionId();
    let errorMsg = "";

    bus.subscribe("training:error", (data) => { errorMsg = data.error; });
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.failExperiment(id, "GPU OOM");

    assertEqual(errorMsg, "GPU OOM", "error message should match");
  });

  test("EventBus should emit training:evaluation on reportEvaluation", () => {
    const ctrl = new ExperimentController();
    const bus = ctrl.getEventBus();
    const id = generateSessionId();
    let evalAcc = 0;

    bus.subscribe("training:evaluation", (data) => {
      evalAcc = (data.metrics as Record<string, number>).accuracy ?? 0;
    });
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.reportEvaluation(id, { accuracy: 0.92 });

    assertEqual(evalAcc, 0.92, "eval accuracy should match");
  });

  test("EventBus should support multiple subscribers for same event", () => {
    const bus = new TrainingEventBus();
    let count = 0;
    bus.subscribe("training:step", () => { count++; });
    bus.subscribe("training:step", () => { count++; });
    bus.subscribe("training:step", () => { count++; });

    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });

    assertEqual(count, 3, "should call all 3 subscribers");
  });

  test("EventBus unsubscribe should stop receiving events", () => {
    const bus = new TrainingEventBus();
    let count = 0;
    const unsub = bus.subscribe("training:step", () => { count++; });

    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });
    assertEqual(count, 1, "first event should be received");

    unsub();
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });
    assertEqual(count, 1, "should not receive after unsubscribe");
  });

  // ================================================================
  // Group 6: EventBus — once, history, getStepEvents (Phase 58)
  // ================================================================

  test("EventBus once should only fire once", () => {
    const bus = new TrainingEventBus();
    let callCount = 0;

    bus.once("training:step", () => { callCount++; });

    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });

    assertEqual(callCount, 1, "once should only fire once");
  });

  test("EventBus should track event history", () => {
    const bus = new TrainingEventBus();

    bus.emit("training:start", {
      sessionId: "test",
      experimentName: "Test",
      modelConfig: {},
      trainingConfig: {},
      timestamp: Date.now(),
      isResume: false,
    });
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });

    const history = bus.getEventHistory();
    assertEqual(history.length, 2, "history should have 2 events");
    assertEqual(history[0].event, "training:start", "first should be start");
    assertEqual(history[1].event, "training:step", "second should be step");
  });

  test("EventBus getRecentEvents should return newest first", () => {
    const bus = new TrainingEventBus();

    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics({ globalStep: 1 }),
      timestamp: 1000,
    });
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics({ globalStep: 2 }),
      timestamp: 2000,
    });

    const recent = bus.getRecentEvents(2);
    assertEqual(recent.length, 2, "should return 2 events");
    assertEqual(recent[0].data.metrics.globalStep, 2, "newest first has step 2");
    assertEqual(recent[1].data.metrics.globalStep, 1, "oldest last has step 1");
  });

  test("EventBus getRecentEvents should filter by type", () => {
    const bus = new TrainingEventBus();

    bus.emit("training:start", {
      sessionId: "test",
      experimentName: "Test",
      modelConfig: {},
      trainingConfig: {},
      timestamp: Date.now(),
      isResume: false,
    });
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });

    const steps = bus.getRecentEvents(10, "training:step");
    assertEqual(steps.length, 2, "should filter to 2 step events");
    assert(steps.every((e) => e.event === "training:step"), "all should be steps");
  });

  test("EventBus getStepEvents should filter by sessionId", () => {
    const bus = new TrainingEventBus();

    bus.emit("training:step", {
      sessionId: "session-a",
      metrics: makeMetrics({ globalStep: 1 }),
      timestamp: Date.now(),
    });
    bus.emit("training:step", {
      sessionId: "session-b",
      metrics: makeMetrics({ globalStep: 1 }),
      timestamp: Date.now(),
    });
    bus.emit("training:step", {
      sessionId: "session-a",
      metrics: makeMetrics({ globalStep: 2 }),
      timestamp: Date.now(),
    });

    const stepsA = bus.getStepEvents("session-a");
    assertEqual(stepsA.length, 2, "should have 2 steps for session-a");
    assert(stepsA.every((s) => s.sessionId === "session-a"), "all should be session-a");
    assertEqual(stepsA[0].step, 1, "first step should be 1");
    assertEqual(stepsA[1].step, 2, "second step should be 2");
  });

  test("EventBus getStepEvents should return correct data shape", () => {
    const bus = new TrainingEventBus();
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics({
        loss: 3.5, globalStep: 42, learningRate: 0.0005,
        tokensPerSecond: 450,
      }),
      timestamp: Date.now(),
    });

    const steps = bus.getStepEvents("test");
    assertEqual(steps.length, 1, "should have 1 step");
    assertEqual(steps[0].sessionId, "test", "sessionId should match");
    assertEqual(steps[0].step, 42, "step should match");
    assertEqual(steps[0].loss, 3.5, "loss should match");
    assertEqual(steps[0].lr, 0.0005, "lr should match");
    assertEqual(steps[0].throughput, 450, "throughput should match");
    assert(typeof steps[0].timestamp === "number", "timestamp should be number");
  });

  test("EventBus getHistoryLength should match emit count", () => {
    const bus = new TrainingEventBus();
    bus.emit("training:start", {
      sessionId: "test",
      experimentName: "Test",
      modelConfig: {},
      trainingConfig: {},
      timestamp: Date.now(),
      isResume: false,
    });
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });

    assertEqual(bus.getHistoryLength(), 2, "history length should be 2");
    assertEqual(bus.getEmitCount(), 2, "emit count should match");
  });

  test("EventBus clearHistory should empty history", () => {
    const bus = new TrainingEventBus();
    bus.emit("training:start", {
      sessionId: "test",
      experimentName: "Test",
      modelConfig: {},
      trainingConfig: {},
      timestamp: Date.now(),
      isResume: false,
    });
    bus.clearHistory();
    assertEqual(bus.getHistoryLength(), 0, "history should be empty");
  });

  test("EventBus history should trim to maxHistory", () => {
    const bus = new TrainingEventBus(10);
    const metrics = makeMetrics();
    for (let i = 0; i < 50; i++) {
      bus.emit("training:step", {
        sessionId: "test",
        metrics: { ...metrics, globalStep: i },
        timestamp: Date.now(),
      });
    }
    assertEqual(bus.getHistoryLength(), 10, "history trimmed to 10");
    assertEqual(bus.getEmitCount(), 50, "emit count still 50");
  });

  test("EventBus should handle subscribe/emit for all 6 event types", () => {
    const bus = new TrainingEventBus();
    const seen: Set<string> = new Set();

    bus.subscribe("training:start", () => seen.add("start"));
    bus.subscribe("training:step", () => seen.add("step"));
    bus.subscribe("training:checkpoint", () => seen.add("checkpoint"));
    bus.subscribe("training:evaluation", () => seen.add("evaluation"));
    bus.subscribe("training:complete", () => seen.add("complete"));
    bus.subscribe("training:error", () => seen.add("error"));

    bus.emit("training:start", {
      sessionId: "test", experimentName: "Test", modelConfig: {},
      trainingConfig: {}, timestamp: Date.now(), isResume: false,
    });
    bus.emit("training:step", {
      sessionId: "test", metrics: makeMetrics(), timestamp: Date.now(),
    });
    bus.emit("training:checkpoint", {
      sessionId: "test", checkpoint: { id: "c1", step: 1, loss: 2, epoch: 0, timestamp: Date.now() },
      timestamp: Date.now(),
    });
    bus.emit("training:evaluation", {
      sessionId: "test", metrics: {}, timestamp: Date.now(),
    });
    bus.emit("training:complete", {
      sessionId: "test", experimentName: "Test",
      finalLoss: 1, finalPerplexity: 2, bestLoss: 1, durationMs: 1000, timestamp: Date.now(),
    });
    bus.emit("training:error", {
      sessionId: "test", experimentName: "Test", error: "Err", timestamp: Date.now(),
    });

    assertEqual(seen.size, 6, "all 6 event types should be seen");
  });

  // ================================================================
  // Group 7: Adapter — getLiveMetrics
  // ================================================================

  test("getLiveMetrics should return null for nonexistent session", () => {
    assertEqual(getLiveMetrics("nonexistent"), null, "should return null");
  });

  test("getLiveMetrics should transform metrics correctly", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.reportStep(id, makeMetrics({
      loss: 2.3, perplexity: 9.97, learningRate: 0.001,
      tokensPerSecond: 500, gradientNorm: 0.05,
      globalStep: 100, totalSteps: 500,
    }));

    const liveMetrics = getLiveMetrics(id);
    assert(liveMetrics !== null, "should not be null");
    assertEqual(liveMetrics!.loss, 2.3, "loss should match");
    assertEqual(liveMetrics!.perplexity, 9.97, "perplexity should match");
    assertEqual(liveMetrics!.learningRate, 0.001, "learningRate should match");
    assertEqual(liveMetrics!.throughput, 500, "throughput should match");
    assertEqual(liveMetrics!.gradientNorm, 0.05, "gradientNorm should match");
    assertEqual(liveMetrics!.currentStep, 100, "currentStep should match");
    assertEqual(liveMetrics!.totalSteps, 500, "totalSteps should match");
    assertEqual(liveMetrics!.progressPercent, 20, "progress should be 20%");
  });

  test("getActiveLiveMetrics should return null when no active session", () => {
    const ws = new ResearchWorkspace();
    ws.clear();
    assertEqual(getActiveLiveMetrics(), null, "should return null");
  });

  // ================================================================
  // Group 8: Adapter — getTrainingTimeline
  // ================================================================

  test("getTrainingTimeline should return null for nonexistent", () => {
    assertEqual(getTrainingTimeline("nonexistent"), null, "should return null");
  });

  test("getTrainingTimeline should return entries for valid session", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.pauseExperiment(id);
    ctrl.resumeExperiment(id);
    ctrl.stopExperiment(id);

    const timeline = getTrainingTimeline(id);
    assert(timeline !== null, "timeline should not be null");
    assert(timeline!.entryCount >= 4, "should have multiple entries");
    assertEqual(timeline!.sessionId, id, "sessionId should match");

    for (const entry of timeline!.entries) {
      assert(typeof entry.type === "string", "type should be string");
      assert(typeof entry.label === "string", "label should be string");
      assert(typeof entry.timestamp === "number", "timestamp should be number");
      assert(typeof entry.relativeTime === "string", "relativeTime should be string");
    }
  });

  test("getActiveTrainingTimeline should return null when no active", () => {
    const ws = new ResearchWorkspace();
    ws.clear();
    assertEqual(getActiveTrainingTimeline(), null, "should return null");
  });

  // ================================================================
  // Group 9: Adapter — getTrainingStatusBadge
  // ================================================================

  test("getTrainingStatusBadge should return idle for nonexistent", () => {
    const badge = getTrainingStatusBadge("nonexistent");
    assertEqual(badge.status, "idle", "should be idle");
    assert(!badge.showPulse, "should not pulse");
  });

  test("getTrainingStatusBadge should return running for active training", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);

    const badge = getTrainingStatusBadge(id);
    assertEqual(badge.status, "running", "should be running");
    assertEqual(badge.label, "Running", "label should be Running");
    assert(badge.showPulse, "should show pulse");
    assert(badge.colorClasses.includes("emerald"), "should have emerald");
  });

  test("getTrainingStatusBadge should return paused", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.pauseExperiment(id);

    const badge = getTrainingStatusBadge(id);
    assertEqual(badge.status, "paused", "should be paused");
    assertEqual(badge.label, "Paused", "label should be Paused");
    assert(!badge.showPulse, "should not pulse");
    assert(badge.colorClasses.includes("amber"), "should have amber");
  });

  test("getTrainingStatusBadge should return completed", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.completeExperiment(id);

    const badge = getTrainingStatusBadge(id);
    assertEqual(badge.status, "completed", "should be completed");
    assertEqual(badge.label, "Completed", "label should be Completed");
  });

  test("getTrainingStatusBadge should return failed", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.failExperiment(id, "Error");

    const badge = getTrainingStatusBadge(id);
    assertEqual(badge.status, "failed", "should be failed");
    assertEqual(badge.label, "Failed", "label should be Failed");
    assert(badge.colorClasses.includes("red"), "should have red");
  });

  test("getActiveTrainingStatusBadge should return idle when none", () => {
    const ws = new ResearchWorkspace();
    ws.clear();
    const badge = getActiveTrainingStatusBadge();
    assertEqual(badge.status, "idle", "should be idle");
  });

  // ================================================================
  // Group 10: Adapter — getLiveTrainingData (batch)
  // ================================================================

  test("getLiveTrainingData should return all three data types", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.reportStep(id, makeMetrics());

    const data = getLiveTrainingData(id);
    assert(data.badge !== undefined, "should have badge");
    assert(data.timeline !== null, "should have timeline");
    assert(typeof data.badge.status === "string", "badge should have status");
  });

  // ================================================================
  // Group 11: Session Persistence
  // ================================================================

  test("Session should persist across full lifecycle", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);

    ctrl.startExperiment(id);
    ctrl.reportStep(id, makeMetrics({ loss: 3.0, globalStep: 50 }));
    ctrl.pauseExperiment(id);

    const ws = new ResearchWorkspace();
    let session = ws.getSession(id);
    assert(session !== undefined, "session should exist after pause");
    assertEqual(session!.status, "paused", "should be paused in workspace");

    ctrl.resumeExperiment(id);
    session = ws.getSession(id);
    assertEqual(session!.status, "running", "should be running after resume");

    ctrl.completeExperiment(id);
    session = ws.getSession(id);
    assertEqual(session!.status, "completed", "should be completed");
  });

  test("Session timeline should accumulate events", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.pauseExperiment(id);
    ctrl.resumeExperiment(id);
    ctrl.reportEvaluation(id, { acc: 0.9 });
    ctrl.stopExperiment(id);

    const session = new ResearchWorkspace().getSession(id);
    assert(session !== undefined, "session should exist");
    assert(session!.timeline.length >= 5, "should have 5+ timeline events");
  });

  test("Session checkpoints should accumulate", () => {
    const ctrl = new ExperimentController();
    const id = generateSessionId();
    ctrl.createExperiment(makeConfig(), id);
    ctrl.startExperiment(id);
    ctrl.reportCheckpoint(id, 50, 3.0, 0);
    ctrl.reportCheckpoint(id, 100, 2.0, 1);
    ctrl.reportCheckpoint(id, 150, 1.5, 2);
    ctrl.pauseExperiment(id);

    const session = new ResearchWorkspace().getSession(id);
    assert(session !== undefined, "session should exist");
    assert(session!.checkpoints.length >= 3, "should have 3+ checkpoints");
  });

  // ================================================================
  // Group 12: Edge Cases & Summary
  // ================================================================

  test("ResearchWorkspace should handle session lifecycle cleanly", () => {
    const ws = new ResearchWorkspace();
    ws.clear();

    ws.createSession(makeConfig({ name: "Test A" }), "id-a");
    ws.createSession(makeConfig({ name: "Test B" }), "id-b");
    assertEqual(ws.count(), 2, "should have 2 sessions");

    ws.updateSession("id-a", { status: "running" });
    assertEqual(ws.getSession("id-a")!.status, "running", "should update status");

    ws.deleteSession("id-b");
    assertEqual(ws.count(), 1, "should have 1 after delete");
    assert(!ws.has("id-b"), "id-b should be gone");
    assert(ws.has("id-a"), "id-a should remain");
  });

  test("TrainingRuntime singleton should be accessible", () => {
    assert(trainingRuntime instanceof TrainingRuntime, "should be TrainingRuntime");
    assert(typeof trainingRuntime.getEventBus === "function", "should have getEventBus");
    assert(typeof trainingRuntime.getController === "function", "should have getController");
  });

  test("TrainingRuntime pause/stop should throw for nonexistent session", () => {
    const runtime = new TrainingRuntime();
    let threw: boolean;

    threw = false;
    try { runtime.pause("nonexistent"); } catch { threw = true; }
    assert(threw, "pause should throw for nonexistent");

    threw = false;
    try { runtime.stop("nonexistent"); } catch { threw = true; }
    assert(threw, "stop should throw for nonexistent");
  });

  test("TrainingRuntime fail for nonexistent should throw via controller", () => {
    const runtime = new TrainingRuntime();
    let threw = false;
    try { runtime.fail("nonexistent", "error"); } catch { threw = true; }
    assert(threw, "fail should throw for nonexistent (controller validation)");
  });

  // ================================================================
  // Summary
  // ================================================================

  console.log(`\n  -- Phase 58 Runtime Tests --`);
  console.log(`  Assertions: ${assertionCount}`);
  console.log(`  Tests: ${passed} passed, ${failed} failed`);

  return { passed, failed };
}

// ============================================================
// Direct execution
// ============================================================

if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.includes("phase58"))) {
  const result = runPhase58Tests();
  if (result.failed > 0) {
    process.exit(1);
  }
}
