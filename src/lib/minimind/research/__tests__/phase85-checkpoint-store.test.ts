// ============================================================
// Phase 85 — Checkpoint Persistence Migration (localStorage → IndexedDB)
// ============================================================
// Covers:
//   1. CheckpointStore memory fallback round-trip (put/get/has/delete/clear)
//   2. ResearchCheckpoint metadata contract (checkpointDataPersisted flag,
//      no inline checkpointDataJSON)
//   3. Real TrainingRuntime.saveCheckpointData() path: the full blob is
//      written to the CheckpointStore and the session metadata carries only
//      the persisted marker.
//
// Boundary note: IndexedDB is not available in Node, so the store exercises
// its in-memory Map fallback here (the same code path the browser uses when
// IndexedDB is absent). The real Worker message contract is replayed with a
// MockWorker that emits started/step/completed — exactly like Phase 75.
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

const COMPLETE_CHECKPOINT_JSON = JSON.stringify({
  version: 3,
  step: 5,
  trainerState: { lossHistory: [1.4] },
});

class MockWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message?: string }) => void) | null = null;

  postMessage(message: unknown): void {
    const cmd = message as { type?: string; sessionId?: string };
    if (cmd.type !== "start") return;
    const sessionId = cmd.sessionId ?? "";

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
        checkpointJSON: COMPLETE_CHECKPOINT_JSON,
      });
    }, 0);
  }

  emit(event: unknown): void {
    if (this.onmessage) this.onmessage({ data: event });
  }

  terminate(): void { /* no-op */ }
  addEventListener(): void { /* no-op */ }
  removeEventListener(): void { /* no-op */ }
  dispatchEvent(): boolean { return true; }
}

// NOTE: `globalThis.Worker` is NOT installed here at module scope — doing so
// would clobber the MockWorker installed by phase75/phase65 (last import wins
// when all test modules are loaded up front). Instead it is swapped in only
// for the duration of runPhase85AsyncTests() and restored afterward.

// ============================================================
// Imports
// ============================================================

import { checkpointStore, CheckpointStore } from "../CheckpointStore";
import { workspace } from "../ResearchWorkspace";
import { trainingRuntime } from "../TrainingRuntime";
import type { ResearchCheckpoint } from "../ResearchState";
import { clearAll } from "../ResearchExperimentStore";
import {
  launchExperiment,
  type LaunchConfig,
} from "@/lib/ai-lab/adapters/experimentLauncherAdapter";

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

function makeLaunchConfig(): LaunchConfig {
  return {
    model: "tiny",
    recipe: "tinystories-tiny",
    dataset: "bilingual",
    seed: 42,
    experimentName: "Phase 85 Checkpoint Store Test",
    blockSize: 16,
    batchSize: 4,
    epochs: 1,
  };
}

async function resetStores(): Promise<void> {
  clearAll();
  workspace.clear();
  await checkpointStore.clear();
}

// ============================================================
// Sync tests — metadata contract
// ============================================================

export function runPhase85Tests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  const test = (name: string, fn: () => void): void => {
    try { fn(); passed++; }
    catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err instanceof Error ? err.message : String(err)}`); }
  };

  console.log("\n  -- Phase 85: Checkpoint Store (sync) --");

  test("ResearchCheckpoint accepts checkpointDataPersisted flag", () => {
    const ckpt: ResearchCheckpoint = {
      id: "ckpt-p85-1",
      step: 5,
      loss: 1.4,
      epoch: 0,
      timestamp: Date.now(),
      checkpointDataPersisted: true,
    };
    assertEq(ckpt.checkpointDataPersisted, true, "checkpointDataPersisted set");
    assertEq(ckpt.checkpointDataJSON, undefined, "no inline checkpointDataJSON");
  });

  test("CheckpointStore exposes the singleton", () => {
    assert(
      checkpointStore instanceof CheckpointStore,
      "checkpointStore is a CheckpointStore instance"
    );
  });

  console.log(`  Phase 85 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ============================================================
// Async tests — store round-trip + real saveCheckpointData path
// ============================================================

export async function runPhase85AsyncTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try { await fn(); passed++; }
    catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err instanceof Error ? err.message : String(err)}`); }
  };

  console.log("\n  -- Phase 85: Checkpoint Store (async) --");

  // Install this suite's MockWorker only for its own lifetime so it does not
  // clobber the MockWorker phase75/phase65 rely on.
  const OriginalWorker = (globalThis as Record<string, unknown>).Worker;
  (globalThis as Record<string, unknown>).Worker = MockWorker;

  try {
  await test("CheckpointStore memory fallback round-trips a blob", async () => {
    await checkpointStore.clear();
    const id = "ckpt-p85-roundtrip";
    const blob = JSON.stringify({ version: 3, modelParams: [1, 2, 3] });

    await checkpointStore.put(id, blob);
    assert(await checkpointStore.has(id), "blob present after put");

    const stored = await checkpointStore.get(id);
    assertEq(stored, blob, "blob round-trips byte-for-byte");

    await checkpointStore.delete(id);
    assert(!(await checkpointStore.has(id)), "blob gone after delete");
    assertEq(await checkpointStore.get(id), undefined, "get returns undefined after delete");
  });

  await test("CheckpointStore.clear removes all blobs", async () => {
    await checkpointStore.clear();
    await checkpointStore.put("ckpt-p85-a", "a");
    await checkpointStore.put("ckpt-p85-b", "b");
    await checkpointStore.clear();
    assertEq(await checkpointStore.get("ckpt-p85-a"), undefined, "a cleared");
    assertEq(await checkpointStore.get("ckpt-p85-b"), undefined, "b cleared");
  });

  await test("saveCheckpointData writes blob to store + metadata marker only", async () => {
    await resetStores();

    await launchExperiment(makeLaunchConfig(), { experimentId: "exp-85-store" });

    const session = workspace.listSessions().find((s) => s.experimentId === "exp-85-store");
    assert(session !== undefined, "session persisted");
    assert(session!.activeCheckpoint !== undefined, "active checkpoint set");

    const active = session!.activeCheckpoint!;
    assertEq(active.checkpointDataPersisted, true, "metadata carries persisted marker");
    assertEq(active.checkpointDataJSON, undefined, "metadata has no inline blob");

    // The full blob must be recoverable from the CheckpointStore by id.
    const stored = await checkpointStore.get(active.id);
    assertEq(stored, COMPLETE_CHECKPOINT_JSON, "full blob retrievable from store by id");

    // Metadata stored in localStorage must stay small (no 73 MB inline blob).
    const raw = (globalThis as Record<string, unknown>).localStorage as {
      getItem: (key: string) => string | null;
    };
    const workspaceJSON = raw.getItem("minimind-research-workspace");
    assert(workspaceJSON !== null, "workspace persisted");
    assert(
      !(workspaceJSON ?? "").includes(COMPLETE_CHECKPOINT_JSON),
      "checkpoint blob is NOT inline in localStorage workspace JSON"
    );
  });
  } finally {
    (globalThis as Record<string, unknown>).Worker = OriginalWorker;
  }

  console.log(`  Phase 85 (async): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
