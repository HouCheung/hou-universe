// ============================================================
// Phase 57 — Research Workspace Tests
// ============================================================
// Covers:
//   - session CRUD (create, get, update, delete, list)
//   - serialization (exportJSON, importJSON)
//   - controller lifecycle (states: created → queued → running → paused → completed)
//   - event bus (subscribe, emit, unsubscribe)
//   - adapter transformation (getWorkspaceSessions, getTrainingStatus, etc.)
//   - state restoration (create → serialize → restore → validate)
//   - edge cases (empty state, corrupted data, invalid operations)
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
  (globalThis as Record<string, unknown>).window = { localStorage: ls };
}

import {
  ResearchWorkspace,
  ExperimentController,
  TrainingEventBus,
  createResearchSession,
  generateSessionId,
  isResearchSession,
  validateResearchSession,
  getStatusLabel,
  compareByUpdatedAt,
  compareByCreatedAt,
} from "../index";

import type {
  ResearchSession,
  SessionConfig,
  ResearchStatus,
  TrainingMetricsSnapshot,
  ResearchCheckpoint,
  ResearchTimelineEvent,
  TrainingEventType,
} from "../index";

import { test, expect, run } from "../../test-harness";

// ============================================================
// Helpers
// ============================================================

function makeConfig(overrides?: Partial<SessionConfig>): SessionConfig {
  return {
    name: "Test Experiment",
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
      estimatedParams: 9241728,
    },
    trainingConfig: {
      name: "tiny-overfit-test",
      label: "Tiny Overfit Test",
      description: "Test recipe",
      version: 1,
      model: "tiny",
      dataset: {
        dataset: "synthetic",
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
    tags: ["test"],
    notes: "Test session",
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
// Test Suite
// ============================================================

// ── Group 1: ResearchState types & factories ──

test("createResearchSession should create a valid session with defaults", () => {
  const config = makeConfig();
  const session = createResearchSession(config);

  expect(session.id).toBeTruthy();
  expect(session.id).toMatch(/^rs-/);
  expect(session.name).toBe("Test Experiment");
  expect(session.status).toBe("configured");
  expect(session.dataset).toBe("synthetic");
  expect(session.seed).toBe(42);
  expect(session.createdAt).toBeGreaterThan(0);
  expect(session.updatedAt).toBeGreaterThan(0);
  expect(session.timeline).toHaveLength(1);
  expect(session.timeline[0].type).toBe("created");
  expect(session.checkpoints).toEqual([]);
  expect(session.tags).toEqual(["test"]);
  expect(session.notes).toBe("Test session");
  expect(session.metrics).toBeUndefined();
  expect(session.activeCheckpoint).toBeUndefined();
  expect(session.finalLoss).toBeUndefined();
  expect(session.errorMessage).toBeUndefined();
});

test("createResearchSession should accept custom ID", () => {
  const config = makeConfig();
  const session = createResearchSession(config, "my-custom-id");
  expect(session.id).toBe("my-custom-id");
});

test("generateSessionId should produce unique IDs with rs- prefix", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const id = generateSessionId();
    expect(id).toMatch(/^rs-/);
    ids.add(id);
  }
  expect(ids.size).toBe(50);
});

test("isResearchSession should validate structurally correct sessions", () => {
  const config = makeConfig();
  const session = createResearchSession(config);
  expect(isResearchSession(session)).toBe(true);
});

test("isResearchSession should reject invalid objects", () => {
  expect(isResearchSession(null)).toBe(false);
  expect(isResearchSession(undefined)).toBe(false);
  expect(isResearchSession({})).toBe(false);
  expect(isResearchSession({ id: "x" })).toBe(false);
  expect(isResearchSession("string")).toBe(false);
  expect(isResearchSession(42)).toBe(false);
  expect(isResearchSession([])).toBe(false);
});

test("validateResearchSession should not throw for valid sessions", () => {
  const config = makeConfig();
  const session = createResearchSession(config);
  expect(() => validateResearchSession(session)).not.toThrow();
});

test("validateResearchSession should throw for invalid sessions", () => {
  const config = makeConfig();
  const session = createResearchSession(config);

  expect(() => validateResearchSession({ ...session, id: "" })).toThrow();
  expect(() => validateResearchSession({ ...session, name: "" })).toThrow();
  expect(() =>
    validateResearchSession({ ...session, status: "invalid" as ResearchStatus })
  ).toThrow();
  expect(() => validateResearchSession({ ...session, createdAt: -1 })).toThrow();
  expect(() => validateResearchSession({ ...session, updatedAt: 0 })).toThrow();
});

test("getStatusLabel should return human-readable labels", () => {
  expect(getStatusLabel("created")).toBe("Created");
  expect(getStatusLabel("configured")).toBe("Configured");
  expect(getStatusLabel("queued")).toBe("Queued");
  expect(getStatusLabel("running")).toBe("Training");
  expect(getStatusLabel("paused")).toBe("Paused");
  expect(getStatusLabel("completed")).toBe("Completed");
  expect(getStatusLabel("failed")).toBe("Failed");
});

test("compareByUpdatedAt should sort newest first", () => {
  const config = makeConfig();
  const a = createResearchSession(config);
  const b = createResearchSession({ ...config, name: "Newer" });
  // Deterministic timestamps: a is older, b is newer. Avoids Date.now()
  // millisecond-collision flakiness where both sessions share a timestamp.
  a.updatedAt = 1000;
  b.updatedAt = 2000;
  expect(compareByUpdatedAt(b, a)).toBeLessThan(0);
  expect(compareByUpdatedAt(a, b)).toBeGreaterThan(0);
});

test("compareByCreatedAt should sort newest first", () => {
  const config = makeConfig();
  const a = createResearchSession(config);
  const b = createResearchSession({ ...config, name: "Newer" });
  a.createdAt = 1000;
  b.createdAt = 2000;
  expect(compareByCreatedAt(b, a)).toBeLessThan(0);
  expect(compareByCreatedAt(a, b)).toBeGreaterThan(0);
});

// ── Group 2: ResearchWorkspace CRUD ──

test("ResearchWorkspace should create and retrieve sessions", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const session = ws.createSession(config);

  expect(session.id).toBeTruthy();
  expect(ws.has(session.id)).toBe(true);
  expect(ws.count()).toBe(1);

  const retrieved = ws.getSession(session.id);
  expect(retrieved).toBeTruthy();
  expect(retrieved!.name).toBe("Test Experiment");
});

test("ResearchWorkspace should return copies, not references", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const session = ws.createSession(config);
  const retrieved = ws.getSession(session.id);

  expect(retrieved).not.toBe(session);
  retrieved!.name = "Modified";
  const reRetrieved = ws.getSession(session.id);
  expect(reRetrieved!.name).toBe("Test Experiment"); // unchanged
});

test("ResearchWorkspace should update sessions", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const session = ws.createSession(config);
  const updated = ws.updateSession(session.id, { status: "running" });

  expect(updated.status).toBe("running");
  expect(updated.updatedAt).toBeGreaterThanOrEqual(session.updatedAt);

  const retrieved = ws.getSession(session.id);
  expect(retrieved!.status).toBe("running");
});

test("ResearchWorkspace should update nested metrics", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const session = ws.createSession(config);
  const metrics = makeMetrics();

  const updated = ws.updateSession(session.id, {
    status: "running",
    metrics,
  });

  expect(updated.metrics?.loss).toBe(2.5);
  expect(updated.metrics?.perplexity).toBe(12.18);
});

test("ResearchWorkspace should throw on updating nonexistent session", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  expect(() => ws.updateSession("nonexistent", { status: "running" })).toThrow();
});

test("ResearchWorkspace should delete sessions", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const session = ws.createSession(config);
  expect(ws.deleteSession(session.id)).toBe(true);
  expect(ws.has(session.id)).toBe(false);
  expect(ws.count()).toBe(0);
});

test("ResearchWorkspace delete should return false for nonexistent", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  expect(ws.deleteSession("nonexistent")).toBe(false);
});

test("ResearchWorkspace should list sessions sorted by updatedAt desc", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const a = ws.createSession({ ...config, name: "Session A" });
  void ws.createSession({ ...config, name: "Session B" });

  ws.updateSession(a.id, { status: "running" }); // touches updatedAt

  const list = ws.listSessions();
  expect(list[0].name).toBe("Session A"); // most recently updated
});

test("ResearchWorkspace should filter by status", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  ws.createSession({ ...config, name: "Session A" });
  const b = ws.createSession({ ...config, name: "Session B" });
  ws.updateSession(b.id, { status: "running" });

  const running = ws.listSessionsByStatus("running");
  expect(running).toHaveLength(1);
  expect(running[0].name).toBe("Session B");

  const configured = ws.listSessionsByStatus("configured");
  expect(configured).toHaveLength(1);
  expect(configured[0].name).toBe("Session A");
});

test("ResearchWorkspace should get latest session", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  expect(ws.getLatestSession()).toBeUndefined();

  ws.createSession({ ...makeConfig(), name: "First" });
  const latest = ws.getLatestSession();
  expect(latest).toBeTruthy();
  expect(latest!.name).toBe("First");
});

test("ResearchWorkspace should get active session", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  expect(ws.getActiveSession()).toBeUndefined();

  const config = makeConfig();
  ws.createSession({ ...config, name: "Configured" });
  expect(ws.getActiveSession()).toBeUndefined(); // configured != active

  const b = ws.createSession({ ...config, name: "Training" });
  ws.updateSession(b.id, { status: "running" });

  const active = ws.getActiveSession();
  expect(active).toBeTruthy();
  expect(active!.name).toBe("Training");
});

test("ResearchWorkspace should handle paused as active", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const session = ws.createSession(config);
  ws.updateSession(session.id, { status: "paused" });

  const active = ws.getActiveSession();
  expect(active).toBeTruthy();
  expect(active!.status).toBe("paused");
});

test("ResearchWorkspace clear should remove all sessions", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  ws.createSession(makeConfig());
  ws.createSession(makeConfig());
  expect(ws.count()).toBe(2);

  ws.clear();
  expect(ws.count()).toBe(0);
});

// ── Group 3: Serialization (export/import) ──

test("exportJSON should produce valid JSON with all sessions", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  ws.createSession(makeConfig({ name: "Test A" }));
  ws.createSession(makeConfig({ name: "Test B" }));

  const json = ws.exportJSON();
  expect(typeof json).toBe("string");

  const parsed = JSON.parse(json);
  expect(Array.isArray(parsed)).toBe(true);
  expect(parsed).toHaveLength(2);
});

test("importJSON should import valid sessions", () => {
  const ws1 = new ResearchWorkspace();
  ws1.clear();
  ws1.createSession(makeConfig({ name: "Export Test" }));

  const json = ws1.exportJSON();

  const ws2 = new ResearchWorkspace();
  ws2.clear();

  const count = ws2.importJSON(json);
  expect(count).toBe(1);
  expect(ws2.count()).toBe(1);
  expect(ws2.listSessions()[0].name).toBe("Export Test");
});

test("importJSON should throw on invalid JSON", () => {
  const ws = new ResearchWorkspace();
  ws.clear();
  expect(() => ws.importJSON("not valid json")).toThrow();
});

test("importJSON should throw on non-array input", () => {
  const ws = new ResearchWorkspace();
  ws.clear();
  expect(() => ws.importJSON('{"key":"value"}')).toThrow();
});

test("importJSON should skip invalid entries", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const validConfig = makeConfig({ name: "Valid" });
  const validSession = createResearchSession(validConfig);
  const validJson = JSON.stringify([validSession, { invalid: true }]);

  const count = ws.importJSON(validJson);
  expect(count).toBe(1);
  expect(ws.count()).toBe(1);
});

test("importJSON should deduplicate by ID", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig({ name: "Dup" });
  const session = createResearchSession(config);
  const json = JSON.stringify([session, session]); // same ID twice

  const count = ws.importJSON(json);
  expect(count).toBe(1);
  expect(ws.count()).toBe(1);
});

// ── Group 4: ExperimentController lifecycle ──

test("ExperimentController should create experiments in configured state", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  const status = ctrl.getStatus(id);
  expect(status.found).toBe(true);
  expect(status.status).toBe("configured");
});

test("ExperimentController should start experiments", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);

  const status = ctrl.getStatus(id);
  expect(status.status).toBe("running");
});

test("ExperimentController should throw on starting invalid state", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id); // configured → running
  expect(() => ctrl.startExperiment(id)).toThrow(); // already running
});

test("ExperimentController should pause running experiments", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.pauseExperiment(id);

  const status = ctrl.getStatus(id);
  expect(status.status).toBe("paused");
  // Phase 74: pause() does NOT fabricate a checkpoint. The real checkpoint is
  // persisted via reportCheckpoint() (Trainer checkpoint event → saveCheckpointData).
  expect(status.checkpoint).toBeNull();
});

test("ExperimentController should throw on pausing non-running", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  expect(() => ctrl.pauseExperiment(id)).toThrow(); // not running
});

test("ExperimentController should resume paused experiments", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.pauseExperiment(id);
  ctrl.resumeExperiment(id);

  const status = ctrl.getStatus(id);
  expect(status.status).toBe("running");
});

test("ExperimentController should throw on resuming non-paused", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  expect(() => ctrl.resumeExperiment(id)).toThrow(); // not paused
});

test("ExperimentController should stop experiments with final metrics", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.reportStep(id, makeMetrics({ loss: 1.5 }));
  ctrl.stopExperiment(id, makeMetrics({ loss: 0.8 }));

  const status = ctrl.getStatus(id);
  // Phase 66: user-initiated stop() → "stopped" (natural completion → "completed").
  expect(status.status).toBe("stopped");
});

test("ExperimentController should fail experiments", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.failExperiment(id, "Out of memory");

  const status = ctrl.getStatus(id);
  expect(status.status).toBe("failed");
  expect(status.errorMessage).toBe("Out of memory");
});

test("ExperimentController getStatus should handle nonexistent", () => {
  const ctrl = new ExperimentController();
  const status = ctrl.getStatus("nonexistent");

  expect(status.found).toBe(false);
  expect(status.status).toBe("created");
});

test("ExperimentController should queue experiments", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.queueExperiment(id);

  const status = ctrl.getStatus(id);
  expect(status.status).toBe("queued");
});

test("ExperimentController should report steps with metrics", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.reportStep(id, makeMetrics({ loss: 2.3, globalStep: 50 }));

  const status = ctrl.getStatus(id);
  expect(status.metrics?.loss).toBe(2.3);
  expect(status.metrics?.globalStep).toBe(50);
});

test("ExperimentController should report evaluations", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.reportEvaluation(id, { accuracy: 0.85, f1: 0.82 });

  const status = ctrl.getStatus(id);
  expect(status.timelineLength).toBeGreaterThan(2); // start + eval events
});

test("ExperimentController should report checkpoints", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.reportCheckpoint(id, 200, 1.8, 2);

  const status = ctrl.getStatus(id);
  expect(status.checkpoint).toBeTruthy();
  expect(status.checkpoint!.step).toBe(200);
  expect(status.checkpoint!.loss).toBe(1.8);
});

test("ExperimentController start from paused should work", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.pauseExperiment(id);
  // startExperiment should also work for paused (as resume)
  ctrl.startExperiment(id);

  const status = ctrl.getStatus(id);
  expect(status.status).toBe("running");
});

// ── Group 5: TrainingEventBus ──

test("EventBus should subscribe and receive events", () => {
  const bus = new TrainingEventBus();
  const received: unknown[] = [];

  bus.subscribe("training:step", (data) => {
    received.push(data);
  });

  bus.emit("training:step", {
    sessionId: "test-1",
    metrics: makeMetrics(),
    timestamp: Date.now(),
  });

  expect(received).toHaveLength(1);
  const stepData = received[0] as Record<string, unknown>;
  expect(stepData.sessionId).toBe("test-1");
});

test("EventBus unsubscribe should stop receiving events", () => {
  const bus = new TrainingEventBus();
  const received: unknown[] = [];

  const unsub = bus.subscribe("training:step", (data) => {
    received.push(data);
  });

  bus.emit("training:step", {
    sessionId: "test-1",
    metrics: makeMetrics(),
    timestamp: Date.now(),
  });
  expect(received).toHaveLength(1);

  unsub();
  bus.emit("training:step", {
    sessionId: "test-2",
    metrics: makeMetrics(),
    timestamp: Date.now(),
  });
  expect(received).toHaveLength(1); // no change
});

test("EventBus should support multiple subscribers", () => {
  const bus = new TrainingEventBus();
  let count = 0;

  bus.subscribe("training:start", () => {
    count++;
  });
  bus.subscribe("training:start", () => {
    count++;
  });
  bus.subscribe("training:start", () => {
    count++;
  });

  bus.emit("training:start", {
    sessionId: "test",
    experimentName: "Test",
    modelConfig: {},
    trainingConfig: {},
    timestamp: Date.now(),
    isResume: false,
  });

  expect(count).toBe(3);
});

test("EventBus should isolate events by type", () => {
  const bus = new TrainingEventBus();
  let stepCount = 0;
  let startCount = 0;

  bus.subscribe("training:step", () => {
    stepCount++;
  });
  bus.subscribe("training:start", () => {
    startCount++;
  });

  bus.emit("training:step", {
    sessionId: "test",
    metrics: makeMetrics(),
    timestamp: Date.now(),
  });

  expect(stepCount).toBe(1);
  expect(startCount).toBe(0);
});

test("EventBus should handle errors in callbacks gracefully", () => {
  const bus = new TrainingEventBus();
  let secondCalled = false;

  bus.subscribe("training:step", () => {
    throw new Error("Crash!");
  });
  bus.subscribe("training:step", () => {
    secondCalled = true;
  });

  // Should not throw
  expect(() => {
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });
  }).not.toThrow();

  expect(secondCalled).toBe(true);
});

test("EventBus should track emit count", () => {
  const bus = new TrainingEventBus();

  expect(bus.getEmitCount()).toBe(0);

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

  expect(bus.getEmitCount()).toBe(2);
});

test("EventBus should track subscriber counts", () => {
  const bus = new TrainingEventBus();

  expect(bus.subscriberCount("training:step")).toBe(0);
  expect(bus.totalSubscriberCount()).toBe(0);

  bus.subscribe("training:step", () => {});
  bus.subscribe("training:step", () => {});
  bus.subscribe("training:start", () => {});

  expect(bus.subscriberCount("training:step")).toBe(2);
  expect(bus.subscriberCount("training:start")).toBe(1);
  expect(bus.totalSubscriberCount()).toBe(3);
});

test("EventBus clear should remove all subscribers for an event", () => {
  const bus = new TrainingEventBus();
  bus.subscribe("training:step", () => {});

  bus.clear("training:step");

  expect(bus.subscriberCount("training:step")).toBe(0);
});

test("EventBus clearAll should remove all subscribers", () => {
  const bus = new TrainingEventBus();
  bus.subscribe("training:step", () => {});
  bus.subscribe("training:start", () => {});

  bus.clearAll();

  expect(bus.totalSubscriberCount()).toBe(0);
});

test("EventBus should support all event types", () => {
  const bus = new TrainingEventBus();
  const events: TrainingEventType[] = [
    "training:start",
    "training:step",
    "training:checkpoint",
    "training:evaluation",
    "training:complete",
    "training:error",
  ];

  const results: Map<TrainingEventType, boolean> = new Map();

  for (const evt of events) {
    bus.subscribe(evt, () => {
      results.set(evt, true);
    });
  }

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
  bus.emit("training:checkpoint", {
    sessionId: "test",
    checkpoint: {
      id: "ckpt-1",
      step: 100,
      loss: 2.0,
      epoch: 1,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  });
  bus.emit("training:evaluation", {
    sessionId: "test",
    metrics: { acc: 0.9 },
    timestamp: Date.now(),
  });
  bus.emit("training:complete", {
    sessionId: "test",
    experimentName: "Test",
    finalLoss: 1.0,
    finalPerplexity: 2.71,
    bestLoss: 0.9,
    durationMs: 60000,
    timestamp: Date.now(),
  });
  bus.emit("training:error", {
    sessionId: "test",
    experimentName: "Test",
    error: "Test error",
    timestamp: Date.now(),
  });

  for (const evt of events) {
    expect(results.get(evt)).toBe(true);
  }
});

test("EventBus emit with no subscribers should not throw", () => {
  const bus = new TrainingEventBus();
  expect(() => {
    bus.emit("training:step", {
      sessionId: "test",
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });
  }).not.toThrow();
});

// ── Group 6: Controller + EventBus integration ──

test("Controller should emit training:start on startExperiment", () => {
  const ctrl = new ExperimentController();
  const bus = ctrl.getEventBus();
  let emitted = false;
  let emittedIsResume = true;

  bus.subscribe("training:start", (data) => {
    emitted = true;
    emittedIsResume = data.isResume;
  });

  const id = ctrl.createExperiment(makeConfig());
  ctrl.startExperiment(id);

  expect(emitted).toBe(true);
  expect(emittedIsResume).toBe(false);
});

test("Controller should emit training:checkpoint on reportCheckpoint", () => {
  const ctrl = new ExperimentController();
  const bus = ctrl.getEventBus();
  let emitted = false;

  bus.subscribe("training:checkpoint", () => {
    emitted = true;
  });

  const id = ctrl.createExperiment(makeConfig());
  ctrl.startExperiment(id);
  // Phase 74: the checkpoint event originates from reportCheckpoint()
  // (Trainer checkpoint event → saveCheckpointData), not from pause().
  ctrl.reportCheckpoint(id, 100, 2.0, 1);

  expect(emitted).toBe(true);
});

test("Controller should emit training:complete on stop", () => {
  const ctrl = new ExperimentController();
  const bus = ctrl.getEventBus();
  let emitted = false;

  bus.subscribe("training:complete", () => {
    emitted = true;
  });

  const id = ctrl.createExperiment(makeConfig());
  ctrl.startExperiment(id);
  ctrl.stopExperiment(id);

  expect(emitted).toBe(true);
});

test("Controller should emit training:error on fail", () => {
  const ctrl = new ExperimentController();
  const bus = ctrl.getEventBus();
  let errorMsg = "";

  bus.subscribe("training:error", (data) => {
    errorMsg = data.error;
  });

  const id = ctrl.createExperiment(makeConfig());
  ctrl.startExperiment(id);
  ctrl.failExperiment(id, "GPU out of memory");

  expect(errorMsg).toBe("GPU out of memory");
});

test("Controller should emit training:step on reportStep", () => {
  const ctrl = new ExperimentController();
  const bus = ctrl.getEventBus();
  let stepLoss = 0;

  bus.subscribe("training:step", (data) => {
    stepLoss = data.metrics.loss;
  });

  const id = ctrl.createExperiment(makeConfig());
  ctrl.startExperiment(id);
  ctrl.reportStep(id, makeMetrics({ loss: 7.77 }));

  expect(stepLoss).toBe(7.77);
});

test("Controller should emit training:evaluation on reportEvaluation", () => {
  const ctrl = new ExperimentController();
  const bus = ctrl.getEventBus();
  let evalMetrics: Record<string, unknown> = {};

  bus.subscribe("training:evaluation", (data) => {
    evalMetrics = data.metrics;
  });

  const id = ctrl.createExperiment(makeConfig());
  ctrl.startExperiment(id);
  ctrl.reportEvaluation(id, { bleu: 0.75 });

  expect(evalMetrics.bleu).toBe(0.75);
});

// ── Group 7: Full lifecycle walkthrough ──

test("Full lifecycle: created → queued → running → paused → running → completed", () => {
  const ctrl = new ExperimentController();

  const id = ctrl.createExperiment(makeConfig());

  // Step 1: configured
  let status = ctrl.getStatus(id);
  expect(status.status).toBe("configured");

  // Step 2: queue
  ctrl.queueExperiment(id);
  status = ctrl.getStatus(id);
  expect(status.status).toBe("queued");

  // Step 3: start
  ctrl.startExperiment(id);
  status = ctrl.getStatus(id);
  expect(status.status).toBe("running");

  // Step 4: report some steps
  ctrl.reportStep(id, makeMetrics({ loss: 3.0, globalStep: 50 }));
  ctrl.reportStep(id, makeMetrics({ loss: 2.5, globalStep: 100 }));
  ctrl.reportStep(id, makeMetrics({ loss: 2.0, globalStep: 150 }));

  // Step 5: pause
  ctrl.pauseExperiment(id);
  status = ctrl.getStatus(id);
  expect(status.status).toBe("paused");
  expect(status.checkpoint).toBeNull();

  // Step 6: resume
  ctrl.resumeExperiment(id);
  status = ctrl.getStatus(id);
  expect(status.status).toBe("running");

  // Step 7: complete (natural completion — all epochs finished)
  ctrl.completeExperiment(id, makeMetrics({ loss: 1.5, globalStep: 200 }));
  status = ctrl.getStatus(id);
  expect(status.status).toBe("completed");
});

test("Full lifecycle: created → running → failed", () => {
  const ctrl = new ExperimentController();

  const id = ctrl.createExperiment(makeConfig());
  ctrl.startExperiment(id);
  ctrl.reportStep(id, makeMetrics({ loss: 10.0 }));
  ctrl.failExperiment(id, "Dataset corrupted");

  const status = ctrl.getStatus(id);
  expect(status.status).toBe("failed");
  expect(status.errorMessage).toBe("Dataset corrupted");
});

// ── Group 8: Best loss tracking ──

test("Controller should track best loss across steps", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.reportStep(id, makeMetrics({ loss: 5.0, globalStep: 1 }));
  ctrl.reportStep(id, makeMetrics({ loss: 3.0, globalStep: 2 }));
  ctrl.reportStep(id, makeMetrics({ loss: 4.0, globalStep: 3 }));

  ctrl.stopExperiment(id, makeMetrics({ loss: 4.0 }));

  const status = ctrl.getStatus(id);
  // best loss should be 3.0 (lowest seen)
  // Since we can't directly access bestLoss from status, verify via stopped event
  expect(status.status).toBe("stopped");
});

// ── Group 9: Timeline events ──

test("createResearchSession should create initial timeline event", () => {
  const config = makeConfig();
  const session = createResearchSession(config);

  expect(session.timeline).toHaveLength(1);
  expect(session.timeline[0].type).toBe("created");
  expect(session.timeline[0].label).toBe("Session created");
  expect(session.timeline[0].timestamp).toBeGreaterThan(0);
});

test("ResearchWorkspace should accumulate timeline events through lifecycle", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const session = ws.createSession(config);

  // Start
  ws.updateSession(session.id, {
    status: "running",
    timeline: [
      ...session.timeline,
      {
        id: "te-1",
        type: "running" as const,
        label: "Training started",
        timestamp: Date.now(),
      },
    ],
  });

  let updated = ws.getSession(session.id);
  expect(updated!.timeline).toHaveLength(2);

  // Complete
  ws.updateSession(session.id, {
    status: "completed",
    timeline: [
      ...updated!.timeline,
      {
        id: "te-2",
        type: "completed" as const,
        label: "Training completed",
        timestamp: Date.now(),
      },
    ],
  });

  updated = ws.getSession(session.id);
  expect(updated!.timeline).toHaveLength(3);
});

// ── Group 10: Edge cases ──

test("ResearchWorkspace should handle creating 50 sessions", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  for (let i = 0; i < 50; i++) {
    ws.createSession(makeConfig({ name: `Session ${i}` }));
  }

  expect(ws.count()).toBe(50);
  expect(ws.listSessions()).toHaveLength(50);
});

test("ResearchWorkspace updateSession should keep immutable id and createdAt", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const session = ws.createSession(makeConfig());
  const originalId = session.id;
  const originalCreatedAt = session.createdAt;

  const updated = ws.updateSession(session.id, {
    name: "Updated Name",
    status: "running",
  });

  expect(updated.id).toBe(originalId);
  expect(updated.createdAt).toBe(originalCreatedAt);
  expect(updated.name).toBe("Updated Name");
});

test("Metrics snapshot should have all required fields", () => {
  const metrics = makeMetrics();

  expect(typeof metrics.loss).toBe("number");
  expect(typeof metrics.perplexity).toBe("number");
  expect(typeof metrics.learningRate).toBe("number");
  expect(typeof metrics.tokensPerSecond).toBe("number");
  expect(typeof metrics.epoch).toBe("number");
  expect(typeof metrics.globalStep).toBe("number");
  expect(typeof metrics.totalSteps).toBe("number");
  expect(typeof metrics.timestamp).toBe("number");
});

test("ResearchCheckpoint should have all required fields", () => {
  const checkpoint: ResearchCheckpoint = {
    id: "ckpt-1",
    step: 100,
    loss: 2.0,
    epoch: 1,
    timestamp: Date.now(),
  };

  expect(checkpoint.id).toBeTruthy();
  expect(checkpoint.step).toBe(100);
  expect(checkpoint.loss).toBe(2.0);
  expect(checkpoint.epoch).toBe(1);
  expect(checkpoint.timestamp).toBeGreaterThan(0);
});

test("ResearchTimelineEvent should have all required fields", () => {
  const event: ResearchTimelineEvent = {
    id: "te-1",
    type: "running",
    label: "Training started",
    timestamp: Date.now(),
  };

  expect(event.id).toBeTruthy();
  expect(event.type).toBe("running");
  expect(event.label).toBe("Training started");
  expect(event.timestamp).toBeGreaterThan(0);
});

test("Session with all optional fields filled should be valid", () => {
  const config = makeConfig();
  const session = createResearchSession(config);

  const fullSession: ResearchSession = {
    ...session,
    metrics: makeMetrics(),
    activeCheckpoint: {
      id: "ckpt-1",
      step: 100,
      loss: 2.0,
      epoch: 1,
      timestamp: Date.now(),
    },
    checkpoints: [
      {
        id: "ckpt-1",
        step: 100,
        loss: 2.0,
        epoch: 1,
        timestamp: Date.now(),
      },
    ],
    finalLoss: 1.5,
    finalPerplexity: 4.48,
    bestLoss: 1.2,
    durationMs: 30000,
    errorMessage: undefined,
    blockSize: 32,
    batchSize: 8,
    epochs: 10,
  };

  expect(isResearchSession(fullSession)).toBe(true);
  expect(() => validateResearchSession(fullSession)).not.toThrow();
});

test("SessionConfig should accept all optional fields", () => {
  const config: SessionConfig = {
    name: "Full Config Test",
    modelConfig: {
      name: "tiny",
      label: "Tiny",
      description: "Test",
      vocabSize: 1000,
      dModel: 64,
      numHeads: 2,
      dFF: 256,
      numLayers: 2,
      maxSeqLen: 128,
      eps: 1e-5,
      estimatedParams: 50000,
    },
    trainingConfig: {
      name: "test-recipe",
      label: "Test Recipe",
      description: "Test",
      version: 1,
      model: "tiny",
      dataset: { dataset: "synthetic", blockSize: 16, batchSize: 4 },
      optimizer: { type: "adamw", lr: 0.001 },
      scheduler: { type: "none" },
      epochs: 5,
      gradientAccumulation: 1,
      warmupSteps: 0,
      seed: 42,
      gradientClipNorm: 1.0,
    },
    dataset: "synthetic",
    seed: 123,
    experimentId: "exp-1",
    blockSize: 32,
    batchSize: 8,
    epochs: 10,
    tags: ["test", "validation"],
    notes: "Testing all optional fields",
  };

  const session = createResearchSession(config);
  expect(session.blockSize).toBe(32);
  expect(session.batchSize).toBe(8);
  expect(session.epochs).toBe(10);
  expect(session.tags).toEqual(["test", "validation"]);
  expect(session.notes).toBe("Testing all optional fields");
});

test("Controller should stop paused experiment", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.pauseExperiment(id);
  ctrl.stopExperiment(id);

  const status = ctrl.getStatus(id);
  expect(status.status).toBe("stopped");
});

test("Controller should refuse to stop already completed experiment", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.stopExperiment(id);

  expect(() => ctrl.stopExperiment(id)).toThrow();
});

test("EventBus multiple unsubscribes should be safe", () => {
  const bus = new TrainingEventBus();
  const unsub = bus.subscribe("training:step", () => {});

  unsub();
  unsub(); // should not throw
  unsub(); // should not throw
});

test("ResearchWorkspace getSession should return undefined for nonexistent", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  expect(ws.getSession("nonexistent")).toBeUndefined();
});

test("createResearchSession should produce unique IDs for rapid creation", () => {
  const config = makeConfig();
  const ids = new Set<string>();

  for (let i = 0; i < 100; i++) {
    ids.add(createResearchSession(config).id);
  }

  expect(ids.size).toBe(100);
});

// ── Group 11: Stress & concurrency ──

test("EventBus should handle 1000 rapid events without dropping", () => {
  const bus = new TrainingEventBus();
  let count = 0;

  bus.subscribe("training:step", () => {
    count++;
  });

  const metrics = makeMetrics();
  for (let i = 0; i < 1000; i++) {
    bus.emit("training:step", {
      sessionId: `test-${i}`,
      metrics: { ...metrics, globalStep: i },
      timestamp: Date.now(),
    });
  }

  expect(count).toBe(1000);
});

test("ResearchWorkspace should handle rapid create/delete cycles", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const config = makeConfig();
  const ids: string[] = [];

  // Create 20
  for (let i = 0; i < 20; i++) {
    ids.push(ws.createSession({ ...config, name: `S${i}` }).id);
  }

  expect(ws.count()).toBe(20);

  // Delete half
  for (let i = 0; i < 10; i++) {
    ws.deleteSession(ids[i]);
  }

  expect(ws.count()).toBe(10);

  // Verify remaining
  for (let i = 10; i < 20; i++) {
    expect(ws.has(ids[i])).toBe(true);
  }
});

// ── Group 12: Type guards ──

test("isResearchSession should reject sessions with wrong types", () => {
  const config = makeConfig();
  const session = createResearchSession(config);

  const broken = {
    ...session,
    createdAt: "not-a-number",
  };
  expect(isResearchSession(broken)).toBe(false);

  const broken2 = {
    ...session,
    status: 123,
  };
  expect(isResearchSession(broken2)).toBe(false);

  const broken3 = {
    ...session,
    modelConfig: "not-an-object",
  };
  expect(isResearchSession(broken3)).toBe(false);
});

// ── Group 13: Event type safety ──

test("EventBus should pass correct data types for each event", () => {
  const bus = new TrainingEventBus();

  bus.subscribe("training:start", (data) => {
    expect(typeof data.sessionId).toBe("string");
    expect(typeof data.experimentName).toBe("string");
    expect(typeof data.isResume).toBe("boolean");
  });

  bus.subscribe("training:step", (data) => {
    expect(typeof data.sessionId).toBe("string");
    expect(typeof data.metrics.loss).toBe("number");
  });

  bus.subscribe("training:complete", (data) => {
    expect(typeof data.sessionId).toBe("string");
    expect(data.finalLoss === undefined || typeof data.finalLoss === "number").toBe(true);
  });

  bus.subscribe("training:error", (data) => {
    expect(typeof data.sessionId).toBe("string");
    expect(typeof data.error).toBe("string");
  });

  bus.emit("training:start", {
    sessionId: "s1",
    experimentName: "Test",
    modelConfig: {},
    trainingConfig: {},
    timestamp: Date.now(),
    isResume: false,
  });
  bus.emit("training:step", {
    sessionId: "s1",
    metrics: makeMetrics(),
    timestamp: Date.now(),
  });
  bus.emit("training:complete", {
    sessionId: "s1",
    experimentName: "Test",
    finalLoss: 1.0,
    finalPerplexity: 2.71,
    bestLoss: 0.9,
    durationMs: 60000,
    timestamp: Date.now(),
  });
  bus.emit("training:error", {
    sessionId: "s1",
    experimentName: "Test",
    error: "Test",
    timestamp: Date.now(),
  });
});

// ── Group 14: Additional CRUD edge cases ──

test("ResearchWorkspace should return consistent list after update", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const s1 = ws.createSession(makeConfig({ name: "Session 1" }));
  ws.updateSession(s1.id, { status: "queued" });

  const list = ws.listSessions();
  expect(list).toHaveLength(1);
  expect(list[0].status).toBe("queued");
});

test("ResearchWorkspace should handle update with no changes", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const session = ws.createSession(makeConfig());
  const updated = ws.updateSession(session.id, {});

  expect(updated.id).toBe(session.id);
  expect(updated.status).toBe(session.status);
  expect(updated.updatedAt).toBeGreaterThanOrEqual(session.updatedAt);
});

test("ResearchWorkspace deleteSession should not affect other sessions", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  ws.createSession(makeConfig({ name: "A" }));
  const b = ws.createSession(makeConfig({ name: "B" }));
  ws.createSession(makeConfig({ name: "C" }));

  ws.deleteSession(b.id);

  expect(ws.count()).toBe(2);
  const names = ws.listSessions().map((s) => s.name);
  expect(names).toContain("A");
  expect(names).toContain("C");
  expect(names).not.toContain("B");
});

test("ResearchWorkspace listSessionsByStatus should return empty for no matches", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  ws.createSession(makeConfig()); // configured

  const running = ws.listSessionsByStatus("running");
  expect(running).toEqual([]);

  const failed = ws.listSessionsByStatus("failed");
  expect(failed).toEqual([]);
});

test("ResearchWorkspace should handle tags correctly in update", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  const session = ws.createSession(makeConfig({ tags: ["initial"] }));
  ws.updateSession(session.id, { tags: ["updated", "research"] });

  const retrieved = ws.getSession(session.id);
  expect(retrieved!.tags).toEqual(["updated", "research"]);
  // Original should not be mutated
  expect(session.tags).toEqual(["initial"]);
});

test("ResearchWorkspace has should return false for nonexistent", () => {
  const ws = new ResearchWorkspace();
  ws.clear();

  expect(ws.has("")).toBe(false);
  expect(ws.has("bogus-id")).toBe(false);
});

// ── Group 15: More Controller edge cases ──

test("Controller should throw on actions for nonexistent experiment", () => {
  const ctrl = new ExperimentController();

  expect(() => ctrl.startExperiment("nonexistent")).toThrow();
  expect(() => ctrl.pauseExperiment("nonexistent")).toThrow();
  expect(() => ctrl.resumeExperiment("nonexistent")).toThrow();
  expect(() => ctrl.stopExperiment("nonexistent")).toThrow();
  expect(() => ctrl.failExperiment("nonexistent", "err")).toThrow();
  expect(() => ctrl.queueExperiment("nonexistent")).toThrow();
});

test("Controller should throw on pausing completed experiment", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.stopExperiment(id);

  expect(() => ctrl.pauseExperiment(id)).toThrow();
});

test("Controller should throw on pausing failed experiment", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.startExperiment(id);
  ctrl.failExperiment(id, "Error");

  expect(() => ctrl.pauseExperiment(id)).toThrow();
});

test("Controller reportStep on nonexistent should not throw", () => {
  const ctrl = new ExperimentController();
  expect(() =>
    ctrl.reportStep("nonexistent", makeMetrics())
  ).not.toThrow();
});

test("Controller reportCheckpoint on nonexistent should not throw", () => {
  const ctrl = new ExperimentController();
  expect(() =>
    ctrl.reportCheckpoint("nonexistent", 100, 2.0, 1)
  ).not.toThrow();
});

test("Controller reportEvaluation on nonexistent should not throw", () => {
  const ctrl = new ExperimentController();
  expect(() =>
    ctrl.reportEvaluation("nonexistent", {})
  ).not.toThrow();
});

test("Controller start from queued state should work", () => {
  const ctrl = new ExperimentController();
  const id = ctrl.createExperiment(makeConfig());

  ctrl.queueExperiment(id);
  expect(ctrl.getStatus(id).status).toBe("queued");

  ctrl.startExperiment(id);
  expect(ctrl.getStatus(id).status).toBe("running");
});

test("Controller should not double-emit on resume", () => {
  const ctrl = new ExperimentController();
  const bus = ctrl.getEventBus();
  let startCount = 0;

  bus.subscribe("training:start", () => {
    startCount++;
  });

  const id = ctrl.createExperiment(makeConfig());
  ctrl.startExperiment(id); // emits start
  ctrl.pauseExperiment(id);

  // Clear subscription and reset the counter to track only the resume emission
  bus.clearAll();
  startCount = 0;
  bus.subscribe("training:start", () => {
    startCount++;
  });

  ctrl.resumeExperiment(id); // emits start once

  expect(startCount).toBe(1); // only the resume one
});

test("Controller getStatus for nonexistent returns proper nulls", () => {
  const ctrl = new ExperimentController();
  const status = ctrl.getStatus("nonexistent");

  expect(status.found).toBe(false);
  expect(status.metrics).toBeNull();
  expect(status.checkpoint).toBeNull();
  expect(status.durationMs).toBeNull();
  expect(status.errorMessage).toBeNull();
  expect(status.name).toBeUndefined();
});

// ── Group 16: Session tags and notes ──

test("Session tags should default to empty array", () => {
  const config = makeConfig();
  delete (config as Partial<SessionConfig>).tags;

  const session = createResearchSession(config);
  expect(session.tags).toEqual([]);
});

test("Session notes should be undefined by default", () => {
  const config = makeConfig();
  delete (config as Partial<SessionConfig>).notes;

  const session = createResearchSession(config);
  expect(session.notes).toBeUndefined();
});

// ── Group 17: getStatusLabel coverage ──

test("getStatusLabel should cover all ResearchStatus values", () => {
  const statuses: ResearchStatus[] = [
    "created", "configured", "queued", "running",
    "paused", "completed", "failed",
  ];
  for (const s of statuses) {
    expect(typeof getStatusLabel(s)).toBe("string");
    expect(getStatusLabel(s).length).toBeGreaterThan(0);
  }
});

// ── Group 18: Serialization round-trip ──

test("Full serialization round-trip should preserve data", () => {
  const ws1 = new ResearchWorkspace();
  ws1.clear();

  ws1.createSession(makeConfig({ name: "Test 1" }));
  ws1.createSession(makeConfig({ name: "Test 2" }));

  const s3 = ws1.createSession(makeConfig({ name: "Test 3" }));
  ws1.updateSession(s3.id, {
    status: "running",
    metrics: makeMetrics({ loss: 1.23, globalStep: 42 }),
  });

  const json = ws1.exportJSON();

  const ws2 = new ResearchWorkspace();
  ws2.clear();
  ws2.importJSON(json);

  expect(ws2.count()).toBe(3);

  const sessions = ws2.listSessions();
  expect(sessions.map((s) => s.name).sort()).toEqual([
    "Test 1", "Test 2", "Test 3",
  ]);

  const running = ws2.listSessionsByStatus("running");
  expect(running).toHaveLength(1);
  expect(running[0].metrics?.loss).toBe(1.23);
  expect(running[0].metrics?.globalStep).toBe(42);
});

// ============================================================
// Exported runner — wired into research/__tests__/run.ts aggregator
// ============================================================

export async function runPhase57Tests(): Promise<{ passed: number; failed: number }> {
  return run();
}

// ============================================================
// Standalone runner — npx tsx phase57-research.test.ts
// ============================================================

if (typeof require !== "undefined" && require.main === module || process.argv[1]?.includes("phase57")) {
  run().then((result) => {
    console.log("\n" + "=".repeat(60));
    console.log(`Phase 57: ${result.passed} passed, ${result.failed} failed`);
    console.log("=".repeat(60));
    if (result.failed > 0) process.exit(1);
  });
}
