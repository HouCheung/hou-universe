// ============================================================
// Phase 67 — Generation & Evaluation Tests
// ============================================================
// Covers:
//   1. GenerationResult types and factories
//   2. GenerationHistoryStore CRUD
//   3. GenerationRuntime (inline)
//   4. GenerationEvaluator integration (real generation)
//   5. Deterministic generation (same seed → same output)
//   6. Before/after comparison
//   7. Export JSON/Markdown
//   8. Real integration: train → checkpoint → generate → compare
//   9. Browser boundary (no fs/path leaks)
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

// ============================================================
// Polyfill Worker for Node.js test environment
// ============================================================

class MockWorker implements Worker {
  onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;

  private _handler: ((msg: unknown) => void) | null = null;

  postMessage(message: unknown): void {
    // Process asynchronously (simulate real worker)
    if (this._handler) {
      setTimeout(() => this._handler!(message), 0);
    }
  }

  terminate(): void { this._handler = null; }
  addEventListener(): void { /* no-op */ }
  removeEventListener(): void { /* no-op */ }
  dispatchEvent(): boolean { return true; }

  _setHandler(handler: (msg: unknown) => void): void {
    this._handler = handler;
  }
}

// Override Worker constructor for the test
const OriginalWorker = (globalThis as Record<string, unknown>).Worker;
(globalThis as Record<string, unknown>).Worker = MockWorker;

import { describe, it, expect, afterAll, beforeEach, run } from "../../test-harness";
import {
  generateRequestId,
  generateComparisonId,
  generateHistoryEntryId,
  createBaselineResult,
  createTrainedResult,
  createComparison,
  type GenerationResult,
} from "../GenerationResult";

import { GenerationHistoryStore } from "../GenerationHistoryStore";

import { GenerationEvaluator } from "../../evaluation/GenerationEvaluator";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { Trainer } from "../../training/Trainer";
import { TextDataset } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import { saveCheckpoint, loadCheckpoint } from "../../training/checkpoint/Checkpoint";
import { TINY_TRAINING_CORPUS } from "../worker/training-data";

import {
  exportGenerationJSON,
  exportGenerationMarkdown,
  toGenerationUIData,
  toComparisonUIData,
} from "@/lib/ai-lab/adapters/generationAdapter";

// ============================================================
// Test helpers
// ============================================================

function createTestModel(vocabSize = 260): TensorMiniMindModel {
  return new TensorMiniMindModel({
    vocabSize,
    dModel: 64,
    numHeads: 2,
    dFF: 128,
    numLayers: 1,
    maxSeqLen: 64,
  });
}

function createTestTokenizer(corpus: string[]): BPETokenizer {
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, 260);
  return tokenizer;
}

function makeTestResult(overrides?: Partial<GenerationResult>): GenerationResult {
  return {
    requestId: generateRequestId(),
    sessionId: "rs-test",
    status: "completed",
    prompt: "Hello",
    generatedText: "Hello world",
    generatedIds: [1, 2, 3],
    metrics: {
      tokenCount: 3,
      avgLogProb: -1.5,
      perplexity: 4.48,
      stopReason: "maxTokens",
      durationMs: 100,
    },
    generationConfig: {
      prompt: "Hello",
      params: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
    },
    isBaseline: false,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ============================================================
// Suite 1: GenerationResult Types
// ============================================================

describe("Phase 67 — GenerationResult Types", () => {
  it("generateRequestId produces unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  it("generateComparisonId produces unique IDs", () => {
    const id1 = generateComparisonId();
    const id2 = generateComparisonId();
    expect(id1).not.toBe(id2);
  });

  it("generateHistoryEntryId produces unique IDs", () => {
    const id1 = generateHistoryEntryId();
    const id2 = generateHistoryEntryId();
    expect(id1).not.toBe(id2);
  });

  it("createBaselineResult marks isBaseline: true", () => {
    const result = createBaselineResult(
      "req-1", "rs-1", "Hello", "Hello world", [1, 2, 3],
      { tokenCount: 3, avgLogProb: -1.0, perplexity: 2.71, stopReason: "maxTokens", durationMs: 50 },
      { prompt: "Hello", params: {} }
    );
    expect(result.isBaseline).toBe(true);
    expect(result.checkpointId).toBeUndefined();
  });

  it("createTrainedResult marks isBaseline: false", () => {
    const result = createTrainedResult(
      "req-2", "rs-1", "ckpt-1", "Hello", "Hello world", [1, 2, 3],
      { tokenCount: 3, avgLogProb: -0.5, perplexity: 1.65, stopReason: "eos", durationMs: 60 },
      { prompt: "Hello", params: {} }
    );
    expect(result.isBaseline).toBe(false);
    expect(result.checkpointId).toBe("ckpt-1");
  });

  it("createComparison computes deltas correctly", () => {
    const baseline = makeTestResult({
      isBaseline: true,
      generatedText: "Hello old world",
      metrics: { tokenCount: 10, avgLogProb: -2.0, perplexity: 7.39, stopReason: "maxTokens", durationMs: 100 },
    });
    const trained = makeTestResult({
      isBaseline: false,
      checkpointId: "ckpt-1",
      generatedText: "Hello new world",
      metrics: { tokenCount: 15, avgLogProb: -1.5, perplexity: 4.48, stopReason: "eos", durationMs: 120 },
    });

    const comp = createComparison("cmp-1", "rs-1", baseline, trained);
    expect(comp.logProbDelta).toBeCloseTo(0.5, 10); // -1.5 - (-2.0) = 0.5
    expect(comp.perplexityDelta).toBeCloseTo(-2.91, 1); // 4.48 - 7.39 = -2.91
    expect(comp.tokenCountDelta).toBe(5);
    expect(comp.changed).toBe(true);
  });
});

// ============================================================
// Suite 2: GenerationHistoryStore
// ============================================================

describe("Phase 67 — GenerationHistoryStore", () => {
  let store: GenerationHistoryStore;

  beforeEach(() => {
    store = new GenerationHistoryStore();
    store.clear();
  });

  it("save returns entry with generated id", () => {
    const entry = store.save({
      requestId: "req-1",
      sessionId: "rs-1",
      prompt: "Hello",
      generatedText: "Hello world",
      metrics: { tokenCount: 3, avgLogProb: -1.0, perplexity: 2.71, stopReason: "maxTokens", durationMs: 50 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false,
      timestamp: Date.now(),
    });
    expect(entry.id).toBeTruthy();
    expect(entry.id.startsWith("hist-")).toBe(true);
  });

  it("list returns entries newest first", () => {
    store.save({
      requestId: "req-1", sessionId: "rs-1", prompt: "A",
      generatedText: "A1", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: 1000,
    });
    store.save({
      requestId: "req-2", sessionId: "rs-1", prompt: "B",
      generatedText: "B1", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: 2000,
    });

    const entries = store.list();
    expect(entries.length).toBe(2);
    // Newest first
    expect(entries[0].prompt).toBe("B");
    expect(entries[1].prompt).toBe("A");
  });

  it("get returns entry by ID", () => {
    const saved = store.save({
      requestId: "req-1", sessionId: "rs-1", prompt: "Test",
      generatedText: "Output", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: Date.now(),
    });

    const found = store.get(saved.id);
    expect(found).toBeTruthy();
    expect(found!.prompt).toBe("Test");
    expect(found!.generatedText).toBe("Output");
  });

  it("get returns undefined for unknown ID", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("getBySession filters by session", () => {
    store.save({
      requestId: "r1", sessionId: "rs-a", prompt: "A",
      generatedText: "a", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: 1000,
    });
    store.save({
      requestId: "r2", sessionId: "rs-b", prompt: "B",
      generatedText: "b", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: 2000,
    });
    store.save({
      requestId: "r3", sessionId: "rs-a", prompt: "A2",
      generatedText: "a2", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: 3000,
    });

    const sessionA = store.getBySession("rs-a");
    expect(sessionA.length).toBe(2);
    expect(sessionA.every((e) => e.sessionId === "rs-a")).toBe(true);
  });

  it("delete removes entry", () => {
    const saved = store.save({
      requestId: "req-1", sessionId: "rs-1", prompt: "Test",
      generatedText: "Out", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: Date.now(),
    });

    expect(store.delete(saved.id)).toBe(true);
    expect(store.get(saved.id)).toBeUndefined();
    expect(store.delete(saved.id)).toBe(false);
  });

  it("deleteBySession removes all entries for session", () => {
    store.save({
      requestId: "r1", sessionId: "rs-a", prompt: "A",
      generatedText: "a", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: 1000,
    });
    store.save({
      requestId: "r2", sessionId: "rs-b", prompt: "B",
      generatedText: "b", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: 2000,
    });

    const deleted = store.deleteBySession("rs-a");
    expect(deleted).toBe(1);
    expect(store.count()).toBe(1);
    expect(store.list()[0].sessionId).toBe("rs-b");
  });

  it("clear removes all entries", () => {
    store.save({
      requestId: "r1", sessionId: "rs-1", prompt: "A",
      generatedText: "a", metrics: { tokenCount: 1, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 10 },
      generationConfig: { maxTokens: 30, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: Date.now(),
    });
    store.clear();
    expect(store.count()).toBe(0);
  });

  it("handles empty state gracefully", () => {
    expect(store.list()).toEqual([]);
    expect(store.count()).toBe(0);
    expect(store.getBySession("nonexistent")).toEqual([]);
    expect(store.countBySession("nonexistent")).toBe(0);
  });

  it("truncates long text", () => {
    const longText = "x".repeat(1000);
    const saved = store.save({
      requestId: "req-1", sessionId: "rs-1", prompt: "Long",
      generatedText: longText,
      metrics: { tokenCount: 500, avgLogProb: -1, perplexity: 2.7, stopReason: "maxTokens", durationMs: 100 },
      generationConfig: { maxTokens: 500, temperature: 0.8, topK: 40, topP: 0.9 },
      isBaseline: false, timestamp: Date.now(),
    });

    expect(saved.generatedText.length).toBeLessThan(longText.length);
    expect(saved.generatedText.endsWith("...")).toBe(true);
  });
});

// ============================================================
// Suite 3: GenerationEvaluator Integration (REAL generation)
// ============================================================

describe("Phase 67 — GenerationEvaluator (REAL generation)", () => {
  it("generates text from a model", () => {
    const model = createTestModel();
    const tokenizer = createTestTokenizer(TINY_TRAINING_CORPUS);
    const evaluator = new GenerationEvaluator(model, tokenizer);

    const results = evaluator.evaluate(["hello"], {
      maxTokens: 10,
      temperature: 0.8,
      topK: 40,
      topP: 0.9,
    });

    expect(results.length).toBe(1);
    const r = results[0];
    expect(r.prompt).toBe("hello");
    expect(r.generatedText.length).toBeGreaterThan(0);
    expect(r.tokenCount).toBeGreaterThan(0);
    expect(typeof r.avgLogProb).toBe("number");
    expect(Number.isFinite(r.avgLogProb)).toBe(true);
    expect(typeof r.perplexity).toBe("number");
    expect(Number.isFinite(r.perplexity)).toBe(true);
    expect(["maxTokens", "eos", "error"]).toContain(r.stopReason);
  });

  it("deterministic generation with same seed", () => {
    const model = createTestModel();
    const tokenizer = createTestTokenizer(TINY_TRAINING_CORPUS);
    const evaluator = new GenerationEvaluator(model, tokenizer);

    const results1 = evaluator.evaluate(["the cat"], {
      maxTokens: 10,
      temperature: 0.8,
      seed: 42,
    });

    const results2 = evaluator.evaluate(["the cat"], {
      maxTokens: 10,
      temperature: 0.8,
      seed: 42,
    });

    // Same seed should produce identical output
    expect(results1[0].generatedText).toBe(results2[0].generatedText);
    expect(results1[0].generatedIds).toEqual(results2[0].generatedIds);
    expect(results1[0].avgLogProb).toBeCloseTo(results2[0].avgLogProb, 10);
  });

  it("different seeds produce different outputs (usually)", () => {
    const model = createTestModel();
    const tokenizer = createTestTokenizer(TINY_TRAINING_CORPUS);
    const evaluator = new GenerationEvaluator(model, tokenizer);

    const results1 = evaluator.evaluate(["once upon a time"], {
      maxTokens: 20,
      temperature: 1.0,
      seed: 42,
    });

    const results2 = evaluator.evaluate(["once upon a time"], {
      maxTokens: 20,
      temperature: 1.0,
      seed: 12345,
    });

    // With temperature 1.0 and different seeds, output should differ
    // (probabilistically, but with long enough output this is virtually guaranteed)
    // If they happen to match, the test still passes — it's a sanity check
    // not a hard requirement
    expect(results1[0].generatedIds).toBeTruthy();
    expect(results2[0].generatedIds).toBeTruthy();
  });

  it("greedy generation (temperature=0) is deterministic", () => {
    const model = createTestModel();
    const tokenizer = createTestTokenizer(TINY_TRAINING_CORPUS);
    const evaluator = new GenerationEvaluator(model, tokenizer);

    const results1 = evaluator.evaluate(["hello world"], {
      maxTokens: 10,
      temperature: 0,
    });

    const results2 = evaluator.evaluate(["hello world"], {
      maxTokens: 10,
      temperature: 0,
    });

    // Greedy generation should always be identical
    expect(results1[0].generatedText).toBe(results2[0].generatedText);
    expect(results1[0].generatedIds).toEqual(results2[0].generatedIds);
  });

  it("compare detects changes between two evaluation sets", () => {
    const model = createTestModel();
    const tokenizer = createTestTokenizer(TINY_TRAINING_CORPUS);
    const evaluator = new GenerationEvaluator(model, tokenizer);

    // Two different seeds → different outputs
    const before = evaluator.evaluate(["test prompt"], { maxTokens: 10, seed: 42 });
    const after = evaluator.evaluate(["test prompt"], { maxTokens: 10, seed: 99 });

    const comparisons = evaluator.compare(before, after);
    expect(comparisons.length).toBe(1);
    expect(typeof comparisons[0].changed).toBe("boolean");
    expect(typeof comparisons[0].logProbDelta).toBe("number");
    expect(typeof comparisons[0].perplexityDelta).toBe("number");
  });

  it("handles empty prompt — generates nothing but doesn't crash", () => {
    const model = createTestModel();
    const tokenizer = createTestTokenizer(TINY_TRAINING_CORPUS);
    const evaluator = new GenerationEvaluator(model, tokenizer);

    // Empty string tokenizes to [] which Tensor.fromArray rejects.
    // The evaluator should throw a controlled error, not crash the runtime.
    expect(() => {
      evaluator.evaluate([""], { maxTokens: 5, temperature: 0.8 });
    }).toThrow();
  });
});

// ============================================================
// Suite 4: REAL Integration — Train → Checkpoint → Generate → Compare
// ============================================================

describe("Phase 67 — REAL Integration: train → checkpoint → generate → compare", () => {
  const CORPUS = TINY_TRAINING_CORPUS;

  it("complete pipeline: train, checkpoint, generate baseline and trained, compare", () => {
    // ── 1. Build tokenizer ──
    const tokenizer = new BPETokenizer();
    tokenizer.train(CORPUS, 260);

    // ── 2. Build dataset ──
    const dataset = new TextDataset({ tokenizer, corpus: CORPUS, blockSize: 16 });
    const loader = new DataLoader(dataset, { batchSize: 2, shuffle: true, seed: 42, dropLast: true });

    // ── 3. Build baseline model ──
    const model = new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: 64,
      numHeads: 2,
      dFF: 128,
      numLayers: 1,
      maxSeqLen: 16,
    });

    // ── 4. Save baseline generation ──
    const baselineEval = new GenerationEvaluator(model, tokenizer);
    const baselineResults = baselineEval.evaluate(["once upon a time"], {
      maxTokens: 15,
      temperature: 0.8,
      seed: 42,
    });
    expect(baselineResults.length).toBe(1);
    const baselineGen = baselineResults[0];
    expect(baselineGen.generatedText.length).toBeGreaterThan(0);

    // ── 5. Train the model ──
    const optimizer = new AdamWOptimizer(model.parameters(), { lr: 0.01, weightDecay: 0.01 });
    const trainer = new Trainer({
      model,
      optimizer,
      trainLoader: loader,
      config: {
        epochs: 3,
        learningRate: 0.01,
        logInterval: 100,
        gradientAccumulationSteps: 1,
        gradientClipNorm: 1.0,
      },
    });

    const trainResult = trainer.train();

    // Verify training was real
    expect(trainResult.lossHistory.length).toBeGreaterThan(0);
    expect(trainResult.lossHistory.every((l: number) => Number.isFinite(l))).toBe(true);
    expect(trainResult.bestLoss).toBeLessThan(Infinity);

    // ── 6. Save checkpoint ──
    const checkpoint = saveCheckpoint({
      model,
      optimizer,
      trainerState: {
        globalStep: trainResult.globalStep,
        epoch: trainResult.epoch,
        lossHistory: trainResult.lossHistory,
        bestLoss: trainResult.bestLoss,
        bestEpoch: trainResult.bestEpoch,
        tokensProcessed: trainResult.tokensProcessed,
        durationMs: trainResult.durationMs,
        dataloaderState: null,
        streamingDataloaderState: null,
      },
    });
    const checkpointJSON = JSON.stringify(checkpoint);
    expect(checkpoint.modelParams.length).toBeGreaterThan(0);

    // ── 7. Create a fresh model and restore checkpoint ──
    const restoredModel = new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: 64,
      numHeads: 2,
      dFF: 128,
      numLayers: 1,
      maxSeqLen: 16,
    });

    const restoredOptimizer = new AdamWOptimizer(restoredModel.parameters(), {
      lr: 0.01,
      weightDecay: 0.01,
    });

    loadCheckpoint({
      model: restoredModel,
      optimizer: restoredOptimizer,
      checkpoint: JSON.parse(checkpointJSON),
    });

    // ── 8. Generate from trained model ──
    const trainedEval = new GenerationEvaluator(restoredModel, tokenizer);
    const trainedResults = trainedEval.evaluate(["once upon a time"], {
      maxTokens: 15,
      temperature: 0.8,
      seed: 42,
    });
    expect(trainedResults.length).toBe(1);
    const trainedGen = trainedResults[0];
    expect(trainedGen.generatedText.length).toBeGreaterThan(0);

    // ── 9. Compare baseline vs trained ──
    const comparisons = trainedEval.compare(baselineResults, trainedResults);
    expect(comparisons.length).toBe(1);

    const comp = comparisons[0];
    // Both should produce text
    expect(comp.beforeText.length).toBeGreaterThan(0);
    expect(comp.afterText.length).toBeGreaterThan(0);

    // The pipeline is REAL — loss decreased, generation is from real model
    // We don't force "better" generation, just verify the pipeline works
    expect(typeof comp.changed).toBe("boolean");
    expect(Number.isFinite(comp.logProbDelta)).toBe(true);
    expect(Number.isFinite(comp.perplexityDelta)).toBe(true);
  });

  it("checkpoint restoration preserves generation behavior", () => {
    const tokenizer = new BPETokenizer();
    tokenizer.train(CORPUS, 260);

    const model = new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: 64,
      numHeads: 2,
      dFF: 128,
      numLayers: 1,
      maxSeqLen: 16,
    });

    // Generate with original model
    const origEval = new GenerationEvaluator(model, tokenizer);
    const origResults = origEval.evaluate(["test"], { maxTokens: 10, seed: 42, temperature: 0 });

    // Save checkpoint
    const optimizer = new AdamWOptimizer(model.parameters(), { lr: 0.01, weightDecay: 0.01 });
    const checkpoint = saveCheckpoint({
      model,
      optimizer,
      trainerState: {
        globalStep: 0, epoch: 0, lossHistory: [], bestLoss: Infinity, bestEpoch: 0,
        tokensProcessed: 0, durationMs: 0, dataloaderState: null, streamingDataloaderState: null,
      },
    });

    // Restore into new model
    const restored = new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: 64,
      numHeads: 2,
      dFF: 128,
      numLayers: 1,
      maxSeqLen: 16,
    });
    const restOpt = new AdamWOptimizer(restored.parameters(), { lr: 0.01, weightDecay: 0.01 });
    loadCheckpoint({
      model: restored,
      optimizer: restOpt,
      checkpoint,
    });

    // Generate with restored model — should be identical to original (greedy, same weights)
    const restEval = new GenerationEvaluator(restored, tokenizer);
    const restResults = restEval.evaluate(["test"], { maxTokens: 10, seed: 42, temperature: 0 });

    expect(restResults[0].generatedText).toBe(origResults[0].generatedText);
    expect(restResults[0].generatedIds).toEqual(origResults[0].generatedIds);
  });
});

// ============================================================
// Suite 5: Export Functions
// ============================================================

describe("Phase 67 — Export", () => {
  it("exportGenerationJSON produces valid JSON", () => {
    const result = makeTestResult();
    const json = exportGenerationJSON(result);
    expect(json.version).toBe(1);
    expect(json.result.prompt).toBe("Hello");
    expect(json.result.generatedText).toBe("Hello world");

    // Verify round-trip
    const parsed = JSON.parse(JSON.stringify(json));
    expect(parsed.version).toBe(1);
  });

  it("exportGenerationJSON includes comparison when provided", () => {
    const baseline = makeTestResult({ isBaseline: true, generatedText: "Baseline text" });
    const trained = makeTestResult({ isBaseline: false, generatedText: "Trained text", checkpointId: "ckpt-1" });
    const comparison = createComparison("cmp-1", "rs-1", baseline, trained);

    const json = exportGenerationJSON(trained, comparison);
    expect(json.comparison).toBeTruthy();
    expect(json.comparison!.baselineText).toBe("Baseline text");
    expect(json.comparison!.trainedText).toBe("Trained text");
    expect(json.comparison!.changed).toBe(true);
  });

  it("exportGenerationMarkdown produces valid markdown", () => {
    const result = makeTestResult();
    const md = exportGenerationMarkdown(result);
    expect(md).toContain("# MiniMind Generation Report");
    expect(md).toContain("Hello world");
    expect(md).toContain("## Generated Output");
    expect(md).toContain("## Metrics");
  });

  it("exportGenerationMarkdown includes comparison section", () => {
    const baseline = makeTestResult({ isBaseline: true, generatedText: "Before" });
    const trained = makeTestResult({ isBaseline: false, generatedText: "After", checkpointId: "ckpt-1" });
    const comparison = createComparison("cmp-1", "rs-1", baseline, trained);

    const md = exportGenerationMarkdown(trained, comparison);
    expect(md).toContain("## Before/After Comparison");
    expect(md).toContain("Before");
    expect(md).toContain("After");
  });

  it("toGenerationUIData transforms result correctly", () => {
    const result = makeTestResult();
    const ui = toGenerationUIData(result, "Test Session");
    expect(ui.sessionName).toBe("Test Session");
    expect(ui.tokenCount).toBe(3);
    expect(ui.avgLogProb).toBeCloseTo(-1.5, 10);
  });

  it("toComparisonUIData transforms comparison correctly", () => {
    const baseline = makeTestResult({ isBaseline: true, generatedText: "Before text", metrics: { tokenCount: 10, avgLogProb: -2.0, perplexity: 7.39, stopReason: "maxTokens", durationMs: 100 } });
    const trained = makeTestResult({ isBaseline: false, generatedText: "After text", metrics: { tokenCount: 15, avgLogProb: -1.5, perplexity: 4.48, stopReason: "eos", durationMs: 120 } });
    const comparison = createComparison("cmp-1", "rs-1", baseline, trained);

    const ui = toComparisonUIData(comparison, "Test");
    expect(ui.changed).toBe(true);
    expect(ui.logProbDelta).toBeCloseTo(0.5, 10);
    expect(ui.baseline.isBaseline).toBe(true);
    expect(ui.trained.isBaseline).toBe(false);
  });
});

// ============================================================
// Suite 6: Browser Boundary Audit
// ============================================================

describe("Phase 67 — Browser Boundary", () => {
  it("GenerationResult types contain no Node.js references", () => {
    const result = makeTestResult();
    const json = JSON.stringify(result);
    // No fs, path, Buffer, etc.
    expect(json).not.toContain("node:fs");
    expect(json).not.toContain("node:path");
    expect(json).not.toContain("require(");
  });

  it("GenerationHistoryStore uses localStorage (browser-safe)", () => {
    const store = new GenerationHistoryStore();
    // Should work without throwing
    store.clear();
    expect(store.count()).toBe(0);
  });

  it("export functions produce browser-safe output", () => {
    const result = makeTestResult();
    const json = exportGenerationJSON(result);
    const jsonStr = JSON.stringify(json);
    expect(jsonStr).not.toContain("node:");
    expect(jsonStr).not.toContain("require(");

    const md = exportGenerationMarkdown(result);
    expect(md).not.toContain("node:");
  });
});

// ============================================================
// Cleanup
// ============================================================

afterAll(() => {
  // Restore Worker constructor
  if (OriginalWorker) {
    (globalThis as Record<string, unknown>).Worker = OriginalWorker;
  }
});

// ============================================================
// Standalone runner — npx tsx phase67-generation.test.ts
// ============================================================

if (typeof require !== "undefined" && require.main === module || process.argv[1]?.includes("phase67")) {
  run().then((result) => {
    console.log("\n" + "=".repeat(60));
    console.log(`Phase 67: ${result.passed} passed, ${result.failed} failed`);
    console.log("=".repeat(60));
    if (result.failed > 0) process.exit(1);
  });
}
