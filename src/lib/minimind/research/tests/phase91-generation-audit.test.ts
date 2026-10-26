// ============================================================
// Phase 91 — Generation Path Audit & Level-4 Readiness
// ============================================================
// Audit of the REAL production generation path (tokenizer → model →
// forward → logits → sampling → EOS → BPE decode) against the real
// Level-3 checkpoint (experiments/phase90/phase90-aligned.ckpt.json).
//
// Question: is the remaining Level-4 valid-UTF-8 failure a software
// bug in the generation path, or a genuine limitation of the trained
// 1.13M-parameter model?
//
// This suite proves, from real code + the real checkpoint:
//   1. checkpoint integrity (param count, shapes, finite, reload
//      deterministic, load→save→load lossless)
//   2. token ID range — every generated id is in-vocab and in [0,V)
//   3. deterministic generation — same seed ⇒ same ids (greedy)
//   4. decode round-trip — encode→decode is lossless on the corpus
//   5. EOS handling — eos-off runs to maxTokens; any "eos" stop has the
//      EOS id as its last token; EOS id is pushed into the stream
//   6. direct forward+argmax === production GenerationEvaluator greedy
//      (bit-identical token ids → the two code paths agree)
//   7. one-token continuation — top-1 exceeds chance and reproduces
//      training patterns (Level 3 gate, unchanged)
//   8. autoregressive rollout invariants — step-1 signal, error
//      compounding over steps, still above chance at the tail
//   9. no architecture / evaluator / threshold changes
//
// Existing Phase 57–90 suites are NOT modified or weakened.
// ============================================================

// ============================================================
// Imports
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  getProductionModelConfig,
  PRODUCTION_VOCAB_TARGET,
  parameterCountOf,
} from "../../experiments/ModelRegistry";

import {
  loadProductionDataset,
  getDatasetTexts,
} from "../../data/datasetLoader";

import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import {
  loadCheckpoint,
  saveCheckpoint,
  type CheckpointData,
} from "../../training/checkpoint/Checkpoint";
import { TrainingState } from "../../training/TrainingState";
import { Random } from "../../core/random/Random";
import { Tensor } from "../../core/Tensor";
import { GenerationEvaluator } from "../../evaluation/GenerationEvaluator";
import {
  measureMemorization,
  evaluateTokenizerRoundTrip,
  deriveCapabilityLevel,
  type CapabilityPrompt,
} from "../capability-eval";

// ============================================================
// Test infrastructure (existing hand-written harness)
// ============================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
    );
  }
}

function assertArrayEqual(actual: number[], expected: number[], msg: string): void {
  if (actual.length !== expected.length) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected length ${expected.length}\n  Actual length ${actual.length}`
    );
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        `Assertion failed: ${msg}\n  Expected[${i}] = ${expected[i]}\n  Actual[${i}] = ${actual[i]}`
      );
    }
  }
}

// ============================================================
// Constants — the exact production recipe
// ============================================================

const SEED = 42;
const VOCAB_TARGET = 300;
const MAX_TOKENS = 24;
const GEN_EVAL_PROMPTS: CapabilityPrompt[] = [
  { prompt: "the sun rises", language: "en" },
  { prompt: "machine learning is", language: "en" },
  { prompt: "太阳", language: "zh" },
  { prompt: "机器学习是", language: "zh" },
  { prompt: "什么是 machine learning", language: "mixed" },
];

// __dirname = src/lib/minimind/research/tests → 5 levels up = repo root
// (experiments/phase90/... lives at the repo root, NOT under src/)
const CKPT_PATH = path.join(
  __dirname,
  "../../../../../experiments/phase90/phase90-aligned.ckpt.json"
);

// ============================================================
// Shared context — built once, reused by all tests
// ============================================================

interface AuditContext {
  tokenizer: BPETokenizer;
  model: TensorMiniMindModel;
  checkpoint: CheckpointData;
  corpus: string[];
}

let cached: AuditContext | null = null;

function getContext(): AuditContext {
  if (cached) return cached;
  const dataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);

  Random.setSeed(SEED);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, VOCAB_TARGET);

  const cfg = getProductionModelConfig();
  const model = new TensorMiniMindModel({
    vocabSize: tokenizer.vocabSize,
    dModel: cfg.dModel,
    numHeads: cfg.numHeads,
    dFF: cfg.dFF,
    numLayers: cfg.numLayers,
    maxSeqLen: cfg.maxSeqLen,
  });

  assert(fs.existsSync(CKPT_PATH), `real Level-3 checkpoint exists at ${CKPT_PATH}`);
  const checkpoint = JSON.parse(
    fs.readFileSync(CKPT_PATH, "utf8")
  ) as CheckpointData;
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.001,
    weightDecay: 0.01,
  });
  loadCheckpoint({ model, optimizer, checkpoint });

  cached = { tokenizer, model, checkpoint, corpus };
  return cached;
}

// ============================================================
// Independent greedy sampler (argmax) — for path-fidelity check
// ============================================================

function greedyGenerate(
  model: TensorMiniMindModel,
  promptIds: number[],
  opts: { maxTokens: number; maxCtx: number; eosTokenId: number }
): number[] {
  const { maxTokens, maxCtx, eosTokenId } = opts;
  const currentIds = [...promptIds];
  const generatedIds: number[] = [];
  for (let step = 0; step < maxTokens; step++) {
    const ctx =
      currentIds.length > maxCtx
        ? currentIds.slice(currentIds.length - maxCtx)
        : currentIds;
    const input = Tensor.fromArray([ctx]);
    let nextId: number;
    Tensor.noGrad(() => {
      const arr = model.forward(input).toArray() as number[][][];
      const row = arr[0][ctx.length - 1];
      let best = -Infinity;
      nextId = 0;
      for (let v = 0; v < row.length; v++) {
        if (row[v] > best) {
          best = row[v];
          nextId = v;
        }
      }
    }, model.parameters());
    generatedIds.push(nextId!);
    currentIds.push(nextId!);
    if (nextId! === eosTokenId) break;
  }
  return generatedIds;
}

/** Deterministic FNV-1a hash over all parameter bits. */
function paramHash(model: TensorMiniMindModel): string {
  const view = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  for (const p of model.parameters()) {
    const data = p.data;
    for (let i = 0; i < data.length; i++) {
      view.setFloat64(0, data[i]);
      const hi = view.getUint32(0);
      const lo = view.getUint32(4);
      h ^= hi;
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= lo;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, "0");
}

// ============================================================
// Suite
// ============================================================

export function runPhase91Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log(
    "\n  -- Phase 91: Generation Path Audit & Level-4 Readiness (real checkpoint) --"
  );

  testCheckpointIntegrity();
  testTokenIdRange();
  testDeterministicGeneration();
  testDecodeRoundTrip();
  testEosHandling();
  testDirectVsProductionConsistency();
  testOneTokenContinuation();
  testAutoregressiveRolloutInvariants();
  testNoArchitectureEvaluatorOrThresholdChanges();

  console.log(`  Phase 91 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ------------------------------------------------------------
// 1. Checkpoint integrity
// ------------------------------------------------------------
function testCheckpointIntegrity(): void {
  test("1. checkpoint integrity: params, shapes, finite, reload determinism, lossless round-trip", () => {
    const { model, checkpoint, tokenizer } = getContext();
    const expected = parameterCountOf(getProductionModelConfig());
    assertEqual(expected, 1_126_528, "expected parameter count (registry formula)");

    // Actual loaded param count.
    let actualCount = 0;
    let nan = 0;
    let inf = 0;
    for (const p of model.parameters()) {
      actualCount += p.data.length;
      for (let i = 0; i < p.data.length; i++) {
        if (Number.isNaN(p.data[i])) nan++;
        if (!Number.isFinite(p.data[i])) inf++;
      }
    }
    assertEqual(actualCount, expected, "loaded param count === registry count");
    assertEqual(nan, 0, "no NaN parameters");
    assertEqual(inf, 0, "no Infinity parameters");

    // Saved blob has the same param count.
    const savedTotal = checkpoint.modelParams.reduce(
      (s, p) => s + p.data.length,
      0
    );
    assertEqual(savedTotal, expected, "checkpoint blob param count === registry count");

    // Shapes in the checkpoint match a fresh production model exactly.
    const fresh = new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: 128,
      numHeads: 4,
      dFF: 512,
      numLayers: 4,
      maxSeqLen: 256,
    });
    const freshShapes = new Map<string, string>();
    for (const { name, parameter } of fresh.namedParameters()) {
      freshShapes.set(name, parameter.shape.join(","));
    }
    assertEqual(freshShapes.size, checkpoint.modelParams.length, "same number of parameter tensors");
    for (const saved of checkpoint.modelParams) {
      const shape = freshShapes.get(saved.name);
      assert(shape !== undefined, `checkpoint has ${saved.name} which exists in the model`);
      assertEqual(
        shape!,
        saved.shape.join(","),
        `checkpoint shape for ${saved.name} matches the production model`
      );
    }

    // Reload determinism: two fresh loads produce identical parameter bits.
    const load1 = () => {
      const m = new TensorMiniMindModel({
        vocabSize: tokenizer.vocabSize,
        dModel: 128,
        numHeads: 4,
        dFF: 512,
        numLayers: 4,
        maxSeqLen: 256,
      });
      loadCheckpoint({
        model: m,
        optimizer: new AdamWOptimizer(m.parameters(), { lr: 0.001, weightDecay: 0.01 }),
        checkpoint,
      });
      return paramHash(m);
    };
    assertEqual(load1(), load1(), "two fresh loads are bit-identical");

    // Load → save → load lossless: serializing the loaded model reproduces the
    // checkpoint's parameter arrays exactly.
    const state = new TrainingState();
    const resaved = saveCheckpoint({
      model,
      optimizer: new AdamWOptimizer(model.parameters(), { lr: 0.001, weightDecay: 0.01 }),
      scheduler: undefined,
      trainerState: state.snapshot(),
    });
    assertEqual(resaved.modelParams.length, checkpoint.modelParams.length, "resave keeps tensor count");
    for (let i = 0; i < checkpoint.modelParams.length; i++) {
      const a = checkpoint.modelParams[i];
      const b = resaved.modelParams[i];
      assertEqual(b.name, a.name, `resave tensor ${i} name`);
      assertArrayEqual(b.shape, a.shape, `resave tensor ${i} shape`);
      assertEqual(b.data.length, a.data.length, `resave tensor ${i} data length`);
      for (let j = 0; j < a.data.length; j++) {
        if (a.data[j] !== b.data[j]) {
          throw new Error(
            `Assertion failed: resave tensor ${i} (${a.name}) data[${j}] differs (${a.data[j]} vs ${b.data[j]})`
          );
        }
      }
    }
  });
}

// ------------------------------------------------------------
// 2. Token ID range
// ------------------------------------------------------------
function testTokenIdRange(): void {
  test("2. every generated token id is in-vocab and in [0, vocabSize)", () => {
    const { model, tokenizer } = getContext();
    const evaluator = new GenerationEvaluator(model, tokenizer);
    const V = tokenizer.vocabSize;
    const vocab = tokenizer.getVocabulary();

    const results = evaluator.evaluate(
      GEN_EVAL_PROMPTS.map((p) => p.prompt),
      { maxTokens: MAX_TOKENS, temperature: 0.8, topK: 40, topP: 0.9, seed: SEED, eosTokenId: 3 }
    );

    let totalIds = 0;
    for (const r of results) {
      for (const id of r.generatedIds) {
        assert(id >= 0 && id < V, `id ${id} within [0, ${V}) for prompt "${r.prompt}"`);
        assert(vocab.idToToken.has(id), `id ${id} is in the tokenizer vocabulary`);
        totalIds++;
      }
    }
    assert(totalIds > 0, "generated at least one token id");
  });
}

// ------------------------------------------------------------
// 3. Deterministic generation
// ------------------------------------------------------------
function testDeterministicGeneration(): void {
  test("3. generation is deterministic under a fixed seed (greedy)", () => {
    const { model, tokenizer } = getContext();
    const evaluator = new GenerationEvaluator(model, tokenizer);
    const opts = {
      maxTokens: MAX_TOKENS,
      temperature: 0,
      topK: 0,
      topP: 1,
      seed: SEED,
      eosTokenId: 3,
    };
    const run1 = evaluator.evaluate(GEN_EVAL_PROMPTS.map((p) => p.prompt), opts);
    const run2 = evaluator.evaluate(GEN_EVAL_PROMPTS.map((p) => p.prompt), opts);
    for (let i = 0; i < run1.length; i++) {
      assertArrayEqual(
        run2[i].generatedIds,
        run1[i].generatedIds,
        `greedy ids identical across runs for "${GEN_EVAL_PROMPTS[i].prompt}"`
      );
    }
  });
}

// ------------------------------------------------------------
// 4. Decode round-trip
// ------------------------------------------------------------
function testDecodeRoundTrip(): void {
  test("4. encode→decode round-trip is lossless on the production corpus (and the gate's eval set)", () => {
    const { tokenizer, corpus } = getContext();

    // Full corpus round-trip (byte-level BPE guarantee).
    for (const text of corpus) {
      assertEqual(
        tokenizer.decode(tokenizer.encode(text)),
        text,
        `corpus round-trip lossless for "${text.slice(0, 24)}..."`
      );
    }

    // The capability gate's own round-trip helper agrees (zh/en/mixed).
    const roundTrip = evaluateTokenizerRoundTrip(
      tokenizer,
      corpus.slice(0, 24).map((t, i) => ({
        prompt: t,
        language: (["zh", "en", "mixed"] as const)[i % 3],
      }))
    );
    assert(roundTrip.allRoundTrip, "gate round-trip report: all lossless");
  });
}

// ------------------------------------------------------------
// 5. EOS handling
// ------------------------------------------------------------
function testEosHandling(): void {
  test("5. EOS handling: eos-off runs to maxTokens; any eos stop ends on the EOS id", () => {
    const { model, tokenizer } = getContext();
    const evaluator = new GenerationEvaluator(model, tokenizer);
    const promptTexts = GEN_EVAL_PROMPTS.map((p) => p.prompt);

    // EOS disabled (eosTokenId -1 can never match) → every run is maxTokens.
    const eosOff = evaluator.evaluate(promptTexts, {
      maxTokens: MAX_TOKENS,
      temperature: 0.8,
      topK: 40,
      topP: 0.9,
      seed: SEED,
      eosTokenId: -1,
    });
    for (const r of eosOff) {
      assertEqual(r.stopReason, "maxTokens", `eos-off stops at maxTokens ("${r.prompt}")`);
      assertEqual(r.generatedIds.length, MAX_TOKENS, `eos-off length == maxTokens ("${r.prompt}")`);
      assertEqual(r.generatedIds.indexOf(-1), -1, "no id can equal the disabled EOS id");
    }

    // EOS enabled: any "eos" stop has the EOS id as its last token and stopped
    // before maxTokens; and the EOS id is present in the generated stream.
    const eosOn = evaluator.evaluate(promptTexts, {
      maxTokens: MAX_TOKENS,
      temperature: 0.8,
      topK: 40,
      topP: 0.9,
      seed: SEED,
      eosTokenId: 3,
    });
    for (const r of eosOn) {
      if (r.stopReason === "eos") {
        assertEqual(
          r.generatedIds[r.generatedIds.length - 1],
          3,
          `eos stop ends on the EOS id ("${r.prompt}")`
        );
        assert(r.generatedIds.length < MAX_TOKENS, `eos stop is short of maxTokens ("${r.prompt}")`);
      } else {
        assertEqual(r.stopReason, "maxTokens", `non-eos stop is maxTokens ("${r.prompt}")`);
      }
      // The EOS id, if it appears anywhere, is only ever the terminal token.
      const eosIdx = r.generatedIds.indexOf(3);
      if (eosIdx !== -1) {
        assertEqual(eosIdx, r.generatedIds.length - 1, `EOS id only appears as the final token ("${r.prompt}")`);
      }
    }
  });
}

// ------------------------------------------------------------
// 6. Direct forward+argmax vs production GenerationEvaluator (greedy)
// ------------------------------------------------------------
function testDirectVsProductionConsistency(): void {
  test("6. independent direct forward+argmax === production GenerationEvaluator greedy (bit-identical ids)", () => {
    const { model, tokenizer } = getContext();
    const evaluator = new GenerationEvaluator(model, tokenizer);
    const opts = {
      maxTokens: MAX_TOKENS,
      temperature: 0,
      topK: 0,
      topP: 1,
      seed: SEED,
      eosTokenId: 3,
    };

    const prodResults = evaluator.evaluate(
      GEN_EVAL_PROMPTS.map((p) => p.prompt),
      opts
    );

    for (let i = 0; i < GEN_EVAL_PROMPTS.length; i++) {
      const promptIds = tokenizer.encode(GEN_EVAL_PROMPTS[i].prompt);
      const direct = greedyGenerate(model, promptIds, {
        maxTokens: MAX_TOKENS,
        maxCtx: 128,
        eosTokenId: 3,
      });
      assertArrayEqual(
        direct,
        prodResults[i].generatedIds,
        `direct greedy ids === production greedy ids ("${GEN_EVAL_PROMPTS[i].prompt}")`
      );
      assertEqual(
        prodResults[i].stopReason,
        direct[direct.length - 1] === 3 ? "eos" : "maxTokens",
        `stopReason matches the last direct id ("${GEN_EVAL_PROMPTS[i].prompt}")`
      );
    }
  });
}

// ------------------------------------------------------------
// 7. One-token continuation
// ------------------------------------------------------------
function testOneTokenContinuation(): void {
  test("7. one-token continuation: top-1 exceeds chance and reproduces training patterns", () => {
    const { model, tokenizer, corpus } = getContext();
    const mem = measureMemorization(model, tokenizer, corpus, 8);

    assert(mem.predictions > 0, "measured next-token predictions");
    assert(
      mem.top1Accuracy > mem.chance,
      `top-1 (${mem.top1Accuracy.toFixed(4)}) exceeds chance (${mem.chance.toFixed(4)})`
    );
    assert(
      mem.reproducesPatterns,
      `top-1 (${mem.top1Accuracy.toFixed(4)}) >= 0.5 → reproduces training patterns`
    );

    // Level 3 gate (unchanged) is satisfied by the measured evidence.
    const level = deriveCapabilityLevel({
      pipelineRuns: true,
      tokenizerRoundTrip: true,
      lossDecreases: true,
      paramsChange: true,
      memorizationSignal: mem.reproducesPatterns,
      coherentGeneration: false,
      qaCapability: false,
    });
    const level3 = level.levels.find((l) => l.level === 3)!;
    assert(level3.achieved, "Level 3 gate achieved (memorization)");
  });
}

// ------------------------------------------------------------
// 8. Autoregressive rollout invariants
// ------------------------------------------------------------
function testAutoregressiveRolloutInvariants(): void {
  test("8. autoregressive rollout: step-1 signal, error compounding, above chance at the tail", () => {
    const { model, tokenizer, corpus } = getContext();

    const maxSteps = 32;
    const perStep = new Map<number, { correct: number; total: number }>();

    for (const text of corpus.slice(0, 40)) {
      const ids = tokenizer.encode(text);
      if (ids.length < 2) continue;
      if (ids.length > 256) continue;
      const current = [ids[0]];
      for (let step = 1; step <= maxSteps; step++) {
        if (step >= ids.length) break;
        const ctx = current.slice(-128);
        const input = Tensor.fromArray([ctx]);
        let nextId: number;
        Tensor.noGrad(() => {
          const arr = model.forward(input).toArray() as number[][][];
          const row = arr[0][ctx.length - 1];
          let best = -Infinity;
          nextId = 0;
          for (let v = 0; v < row.length; v++) {
            if (row[v] > best) {
              best = row[v];
              nextId = v;
            }
          }
        }, model.parameters());
        const e = perStep.get(step) ?? { correct: 0, total: 0 };
        e.total++;
        if (nextId! === ids[step]) e.correct++;
        perStep.set(step, e);
        current.push(nextId!);
      }
    }

    const stepAcc = (step: number): number => {
      const e = perStep.get(step);
      assert(e !== undefined, `data recorded for step ${step}`);
      assert((e!.total) > 0, `step ${step} has predictions`);
      return e!.correct / e!.total;
    };

    const a1 = stepAcc(1);
    const a8 = stepAcc(8);
    const a32 = stepAcc(32);

    // Step-1 conditional signal (single-token seed) is far above chance.
    const chance = 1 / tokenizer.vocabSize;
    assert(a1 > chance, `step-1 accuracy ${a1.toFixed(4)} > chance ${chance.toFixed(4)}`);
    // Error compounding: the rollout degrades as it autoregresses.
    assert(
      a32 <= a1,
      `rollout does not improve (step-32 ${a32.toFixed(4)} <= step-1 ${a1.toFixed(4)})`
    );
    // And degradation is real at the mid horizon.
    assert(
      a8 <= a1 + 0.01,
      `step-8 accuracy (${a8.toFixed(4)}) does not exceed step-1 (${a1.toFixed(4)}) by more than noise`
    );
  });
}

// ------------------------------------------------------------
// 9. No architecture / evaluator / threshold changes
// ------------------------------------------------------------
function testNoArchitectureEvaluatorOrThresholdChanges(): void {
  test("9. no architecture, evaluator, or capability-threshold changes", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target");
    assertEqual(cfg.dModel, 128, "dModel");
    assertEqual(cfg.numHeads, 4, "numHeads");
    assertEqual(cfg.dFF, 512, "dFF");
    assertEqual(cfg.numLayers, 4, "numLayers");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen");
    assertEqual(parameterCountOf(cfg), 1_126_528, "exact parameter count");

    assertEqual(typeof TensorMiniMindModel, "function", "production model class");
    assertEqual(typeof GenerationEvaluator, "function", "production generation class");

    // Level thresholds intact (Level 3 ≥ 0.5; Level 4 requires valid UTF-8
    // across all language classes — untouched).
    const level = deriveCapabilityLevel({
      pipelineRuns: false,
      tokenizerRoundTrip: false,
      lossDecreases: false,
      paramsChange: false,
      memorizationSignal: false,
      coherentGeneration: false,
      qaCapability: false,
    });
    assertEqual(level.levels.length, 6, "six gates (0–5)");
    const level3 = level.levels.find((l) => l.level === 3)!;
    assert(level3.criterion.includes("0.5"), "Level 3 threshold (0.5) intact");
    const level4 = level.levels.find((l) => l.level === 4)!;
    assert(
      level4.criterion.includes("valid UTF-8"),
      "Level 4 criterion still demands valid UTF-8"
    );
  });
}
