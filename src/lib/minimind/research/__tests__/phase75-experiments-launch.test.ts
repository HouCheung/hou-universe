// ============================================================
// Phase 75 / P1 #5 — Experiments → Real Training Integration
// ============================================================
// Covers:
//   1. buildSessionConfig maps LaunchConfig → SessionConfig
//   2. launchExperiment creates a REAL Experiment + Run + Session
//      with a valid identity chain (no fake status:"running")
//   3. Duplicate protection — same experiment reuses in-flight run
//   4. Real completion lifecycle — run finalized with real metrics + checkpoint
//   5. Failure propagation — run → failed with preserved error (no orphan run)
//   6. Real Trainer proof via createInlineTrainingExecutor (real loss)
//   7. validateResearchIdentityGraph PASS
//
// Boundary note: the Web Worker boundary is mocked with a controllable
// MockWorker that replays the real TrainingWorker message contract
// (started / step / completed / error). Real Trainer math (forward /
// backward / AdamW) is proven separately via createInlineTrainingExecutor.
// Real browser-worker integration is environment-limited — documented
// in the Phase 75 report.
// ============================================================

// ============================================================
// localStorage / window / Blob polyfills for Node.js
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
  // ResearchWorkspace reads window.localStorage (with an SSR guard).
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
// Controllable MockWorker (replays the real worker message contract)
// ============================================================

type WorkerBehavior = "silent" | "complete" | "fail";
let currentBehavior: WorkerBehavior = "silent";
let startCommandsPosted = 0;

class MockWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message?: string }) => void) | null = null;
  onmessageerror: ((ev: { data: unknown }) => void) | null = null;

  postMessage(message: unknown): void {
    const cmd = message as { type?: string; sessionId?: string };
    if (cmd.type !== "start") return;
    startCommandsPosted++;
    const sessionId = cmd.sessionId ?? "";

    if (currentBehavior === "complete") {
      setTimeout(() => {
        this.emit({ type: "started", sessionId });
        this.emit({
          type: "step", sessionId, step: 5, totalSteps: 5,
          loss: 4.2, perplexity: 66.7, learningRate: 0.001, tokensPerSecond: 100,
        });
        this.emit({
          type: "completed", sessionId,
          initialLoss: 5.1, finalLoss: 1.4, bestLoss: 1.4, perplexity: 4.06,
          totalSteps: 5, durationMs: 60,
          checkpointJSON: JSON.stringify({ step: 5, trainerState: { lossHistory: [1.4] } }),
        });
      }, 0);
    } else if (currentBehavior === "fail") {
      setTimeout(() => {
        this.emit({ type: "error", sessionId, error: "Simulated worker crash", lastStep: 2 });
      }, 0);
    }
    // "silent": do nothing — the run stays in "running" so identity and
    // duplicate-protection tests can observe the active state.
  }

  emit(event: unknown): void {
    if (this.onmessage) this.onmessage({ data: event });
  }

  terminate(): void { /* no-op */ }
  addEventListener(): void { /* no-op */ }
  removeEventListener(): void { /* no-op */ }
  dispatchEvent(): boolean { return true; }
}

(globalThis as Record<string, unknown>).Worker = MockWorker;

// ============================================================
// Imports
// ============================================================

import {
  buildSessionConfig,
  launchExperiment,
  type LaunchConfig,
} from "@/lib/ai-lab/adapters/experimentLauncherAdapter";

import { workspace } from "../ResearchWorkspace";

import {
  clearAll,
  listExperiments,
  listRuns,
  listRunsByExperiment,
  getExperiment,
  validateResearchIdentityGraph,
} from "../ResearchExperimentStore";

import {
  createInlineTrainingExecutor,
  ResearchExperimentRunner,
  TrainingEventBus,
} from "../index";

import { createResearchExperiment } from "../ResearchExperiment";

import { TINY_TRAINING_CORPUS } from "../worker/training-data";

// ============================================================
// Test helpers
// ============================================================

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
    );
  }
}

function assertFinite(value: number, msg: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Assertion failed: ${msg}\n  value is not finite: ${value}`);
  }
}

function makeLaunchConfig(): LaunchConfig {
  return {
    model: "tiny",
    recipe: "tinystories-tiny",
    // Phase 80: "synthetic" is now honestly reported unavailable (it is
    // not authored). Use the real foundation dataset so launchExperiment
    // exercises the real training path instead of the honest failure path.
    dataset: "bilingual",
    seed: 42,
    experimentName: "Phase 75 Launch Test",
    blockSize: 16,
    batchSize: 4,
    epochs: 1,
  };
}

function resetStores(): void {
  clearAll();
  workspace.clear();
  startCommandsPosted = 0;
}

// ============================================================
// Sync tests — buildSessionConfig (pure mapping)
// ============================================================

export function runPhase75Tests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  const test = (name: string, fn: () => void): void => {
    try { fn(); passed++; }
    catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err instanceof Error ? err.message : String(err)}`); }
  };

  console.log("\n  -- Phase 75 / P1 #5: Experiments → Real Training (sync) --");

  test("buildSessionConfig maps model, recipe, dataset, seed", () => {
    const cfg = buildSessionConfig(makeLaunchConfig());
    assertEq(cfg.modelConfig.name, "tiny", "model name");
    assertEq(cfg.dataset, "bilingual", "dataset");
    assertEq(cfg.seed, 42, "seed");
    assertEq(cfg.name, "Phase 75 Launch Test", "session name = experiment name");
  });

  test("buildSessionConfig applies blockSize/batchSize overrides", () => {
    const cfg = buildSessionConfig({ ...makeLaunchConfig(), blockSize: 32, batchSize: 8 });
    assertEq(cfg.trainingConfig.dataset.blockSize, 32, "blockSize override");
    assertEq(cfg.trainingConfig.dataset.batchSize, 8, "batchSize override");
    assertEq(cfg.blockSize, 32, "top-level blockSize mirrors override");
    assertEq(cfg.batchSize, 8, "top-level batchSize mirrors override");
  });

  test("buildSessionConfig propagates seed and epochs into trainingConfig", () => {
    const cfg = buildSessionConfig({ ...makeLaunchConfig(), seed: 7, epochs: 3 });
    assertEq(cfg.trainingConfig.seed, 7, "trainingConfig.seed");
    assertEq(cfg.trainingConfig.epochs, 3, "trainingConfig.epochs override");
  });

  console.log(`  Phase 75 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ============================================================
// Async tests — launchExperiment end-to-end
// ============================================================

export async function runPhase75AsyncTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try { await fn(); passed++; }
    catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err instanceof Error ? err.message : String(err)}`); }
  };

  console.log("\n  -- Phase 75 / P1 #5: Experiments → Real Training (async) --");

  await test("launchExperiment creates a valid identity chain (real worker spawned)", async () => {
    currentBehavior = "silent";
    resetStores();

    const result = await launchExperiment(makeLaunchConfig(), { experimentId: "exp-75-identity" });

    assertEq(result.reused, false, "fresh launch is not reused");
    assertEq(result.experimentId, "exp-75-identity", "controlled experimentId");

    const experiment = getExperiment("exp-75-identity");
    assert(experiment !== undefined, "experiment persisted");
    assertEq(experiment!.id, result.experimentId, "experiment.id === result.experimentId");

    const runs = listRunsByExperiment("exp-75-identity");
    assertEq(runs.length, 1, "exactly one run");
    assertEq(runs[0].status, "running", "run is running (real worker started)");
    assertEq(runs[0].experimentId, experiment!.id, "run.experimentId === experiment.id");

    const sessions = workspace.listSessions();
    const session = sessions.find((s) => s.runId === runs[0].runId);
    assert(session !== undefined, "session linked to run");
    assertEq(session!.experimentId, experiment!.id, "session.experimentId === experiment.id");
    assertEq(session!.runId, runs[0].runId, "session.runId === run.runId");
    assertEq(session!.id, result.sessionId, "session.id === result.sessionId");

    const diag = validateResearchIdentityGraph(sessions, listExperiments(), listRuns());
    assert(diag.valid, `identity graph valid: ${JSON.stringify(diag.errors)}`);

    // The real TrainingRuntime actually spawned a Worker and sent a start command.
    assert(startCommandsPosted >= 1, "worker was spawned and received a start command");
  });

  await test("duplicate launch reuses the in-flight run (no second active run)", async () => {
    currentBehavior = "silent";
    resetStores();

    const first = await launchExperiment(makeLaunchConfig(), { experimentId: "exp-75-dup" });
    const second = await launchExperiment(makeLaunchConfig(), { experimentId: "exp-75-dup" });

    assertEq(second.reused, true, "second launch reused");
    assertEq(second.runId, first.runId, "same runId reused");
    assertEq(second.experimentId, "exp-75-dup", "same experimentId");

    const runs = listRunsByExperiment("exp-75-dup");
    assertEq(runs.length, 1, "no orphan run minted");
    const active = runs.filter((r) => r.status === "running");
    assertEq(active.length, 1, "exactly one active run");
  });

  await test("launchExperiment completes with real metrics + checkpoint written back", async () => {
    currentBehavior = "complete";
    resetStores();

    await launchExperiment(makeLaunchConfig(), { experimentId: "exp-75-complete" });

    const runs = listRunsByExperiment("exp-75-complete");
    assertEq(runs.length, 1, "exactly one run");
    const run = runs[0];
    assertEq(run.status, "completed", "run completed");
    assertEq(run.finalLoss, 1.4, "finalLoss written back from real completed event");
    assert(run.completedAt > 0, "completedAt set");
    assert(
      typeof run.checkpointId === "string" && run.checkpointId.length > 0,
      "checkpointId written back"
    );

    const session = workspace.listSessions().find((s) => s.runId === run.runId);
    assert(session !== undefined, "session found after completion");
    assertEq(session!.status, "completed", "session completed");
    assert(session!.activeCheckpoint !== undefined, "session has active checkpoint");

    const diag = validateResearchIdentityGraph(
      workspace.listSessions(),
      listExperiments(),
      listRuns()
    );
    assert(diag.valid, `identity graph valid after completion: ${JSON.stringify(diag.errors)}`);
  });

  await test("launchExperiment propagates failure to the run (no orphan running run)", async () => {
    currentBehavior = "fail";
    resetStores();

    let threw = false;
    try {
      await launchExperiment(makeLaunchConfig(), { experimentId: "exp-75-fail" });
    } catch {
      threw = true;
    }
    assert(threw, "launchExperiment throws on synchronous start failure");

    const runs = listRunsByExperiment("exp-75-fail");
    assertEq(runs.length, 1, "exactly one run");
    assertEq(runs[0].status, "failed", "run failed — no orphan running run");
    assert(
      runs[0].errorMessage !== undefined && runs[0].errorMessage.length > 0,
      "error message preserved"
    );
  });

  await test("real Trainer produces real decreasing loss (inline executor)", async () => {
    const experiment = createResearchExperiment({
      name: "Phase 75 Real Trainer",
      modelConfig: {
        name: "tiny", label: "Tiny", description: "",
        vocabSize: 1000, dModel: 64, numHeads: 4, dFF: 128, numLayers: 2,
        maxSeqLen: 64, eps: 1e-6, estimatedParams: 100000,
      },
      trainingConfig: {
        name: "tiny-test", label: "Tiny Test", description: "",
        version: 1 as const, model: "tiny",
        dataset: { dataset: "synthetic", blockSize: 16, batchSize: 4 },
        optimizer: { type: "adamw", lr: 0.001 },
        scheduler: { type: "cosine" },
        epochs: 3, gradientAccumulation: 1, warmupSteps: 5, seed: 42,
        gradientClipNorm: 1.0,
      },
      datasetConfig: { name: "synthetic", blockSize: 16, batchSize: 4, shuffle: true },
      seed: 42,
    });

    const executor = createInlineTrainingExecutor(TINY_TRAINING_CORPUS);
    const bus = new TrainingEventBus();
    const runner = new ResearchExperimentRunner({ executor, eventBus: bus });

    const result = await runner.run(experiment, {
      saveToStore: false,
      runGenerationEval: false,
    });

    assertFinite(result.training.initialLoss, "initial loss finite (real)");
    assertFinite(result.training.finalLoss, "final loss finite (real)");
    assert(
      result.training.initialLoss > result.training.finalLoss,
      "loss decreases during real training"
    );
  });

  console.log(`  Phase 75 (async): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ============================================================
// Standalone runner
// ============================================================

const isMainModule = process.argv.length >= 2 && process.argv[1]?.includes("phase75-experiments-launch");
if (isMainModule) {
  (async () => {
    const sync = runPhase75Tests();
    const asyncRes = await runPhase75AsyncTests();
    const totalFailed = sync.failed + asyncRes.failed;
    console.log(`\nPhase 75 TOTAL: ${sync.passed + asyncRes.passed} passed, ${totalFailed} failed`);
    if (totalFailed > 0) process.exit(1);
  })();
}
