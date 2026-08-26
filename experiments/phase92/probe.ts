// ============================================================
// Phase 92 — Tokenizer Merge Budget Experiment (Steps 3–6)
// ============================================================
// Real-training A/B/C on the FULL 600-doc bilingual corpus.
// ONLY the tokenizer merge budget (vocabSize − 260) varies.
//
//   A  vocab 300  merges  40  — production baseline. The trained
//     artifact ALREADY exists: experiments/phase90/phase90-aligned.ckpt.json
//     (exact Phase 90 condition B, document-aligned, 20 epochs, seed 42).
//     Reused — by the Phase 90 reproducibility contract a fresh retrain
//     is bit-identical, so loading is equivalent and saves 2 hours.
//   B  vocab 340  merges  80  — moderate budget. FRESH training.
//   C  vocab 380  merges 120  — larger budget.   FRESH training.
//
// Everything else is pinned to the Phase 90/91 recipe: same dataset
// v0.3.0, same seed 42, same architecture (dModel 128 / heads 4 /
// dFF 512 / layers 4), same blockSize 64, same batch size 4, same 20
// epochs, same AdamW(1e-3, 0.01), same cosine schedule, same grad clip
// 1.0, same document-aligned layout + masked 1-step objective.
//
// The capability evaluator, gates, and Level thresholds are USED
// UNCHANGED. Generation-specific analysis (greedy invalid-UTF-8 rate,
// temp-0.8 rate, rollout degradation curves) is NEW measurement code
// that consumes the SAME evaluator/GenerationEvaluator primitives.
//
// Run: npx tsx experiments/phase92/probe.ts   (LONG: ~4.5 h;
//      writes per-candidate results incrementally, crash-safe)
// Output: experiments/phase92/probe-results.json
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  loadProductionDataset,
  getDatasetTexts,
  computeBaseStatistics,
  type LoadedDataset,
} from "../../src/lib/minimind/data/datasetLoader";
import { getProductionModelConfig } from "../../src/lib/minimind/experiments/ModelRegistry";
import { BPETokenizer } from "../../src/lib/minimind/tokenizer/BPETokenizer";
import { TextDataset } from "../../src/lib/minimind/data/TextDataset";
import { DataLoader } from "../../src/lib/minimind/data/DataLoader";
import { Trainer } from "../../src/lib/minimind/training/Trainer";
import { loadCheckpoint, saveCheckpoint } from "../../src/lib/minimind/training/checkpoint/Checkpoint";
import { TrainingState } from "../../src/lib/minimind/training/TrainingState";
import { TensorMiniMindModel } from "../../src/lib/minimind/model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../src/lib/minimind/core/optim/AdamW";
import { CosineScheduler } from "../../src/lib/minimind/core/scheduler/CosineScheduler";
import { Random } from "../../src/lib/minimind/core/random/Random";
import { Tensor } from "../../src/lib/minimind/core/Tensor";
import { GenerationEvaluator } from "../../src/lib/minimind/evaluation/GenerationEvaluator";
import { tokenizerStateHash } from "./tokenizer-probe";
import {
  evaluateGeneration,
  evaluateTokenizerRoundTrip,
  measureMemorization,
  buildEvidence,
  deriveCapabilityLevel,
  formatCapabilityReport,
  type CapabilityPrompt,
  type LanguageClass,
  type GenerationEvaluationReport,
} from "../../src/lib/minimind/research/capability-eval";
import type { TextSample } from "../../src/lib/minimind/data/TextDataset";
import type { CheckpointData } from "../../src/lib/minimind/training/checkpoint/Checkpoint";

// ============================================================
// Fixed production recipe (identical to Phase 89/90/91)
// ============================================================

const BATCH_SIZE = 4;
const LR = 0.001;
const WD = 0.01;
const SEED = 42;
const BLOCK_SIZE = 64;
const EPOCHS = 20;
const REPRO_EPOCHS = 2;
const MAX_TOKENS = 24;
const GEN_EVAL_PROMPTS: CapabilityPrompt[] = [
  { prompt: "the sun rises", language: "en" },
  { prompt: "machine learning is", language: "en" },
  { prompt: "太阳", language: "zh" },
  { prompt: "机器学习是", language: "zh" },
  { prompt: "什么是 machine learning", language: "mixed" },
];

const OUT_DIR = path.resolve(__dirname);
const A_CKPT = path.resolve(__dirname, "..", "phase90", "phase90-aligned.ckpt.json");
const A_RESULT_JSON = path.resolve(__dirname, "..", "phase90", "condition-b.json");
const A_REPRO_JSON = path.resolve(__dirname, "..", "phase90", "probe-results.json");
const TOKENIZER_PROBE = path.join(OUT_DIR, "tokenizer-probe-results.json");

/** Expected total params for dModel=128 architecture at a given vocab. */
function expectedParamCountFor(vocab: number): number {
  // embedding [V,D] + LM head [D,V] = 2·V·D ; blocks+norms are vocab-independent.
  return 2 * vocab * 128 + 1_049_728;
}

// ============================================================
// Pipeline construction (exact Phase 90/91 invocation)
// ============================================================

function buildTokenizer(corpus: string[], vocabTarget: number): BPETokenizer {
  Random.setSeed(SEED);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, vocabTarget);
  return tokenizer;
}

function buildModel(tokenizer: BPETokenizer): TensorMiniMindModel {
  const cfg = getProductionModelConfig();
  return new TensorMiniMindModel({
    vocabSize: tokenizer.vocabSize,
    dModel: cfg.dModel,
    numHeads: cfg.numHeads,
    dFF: cfg.dFF,
    numLayers: cfg.numLayers,
    maxSeqLen: cfg.maxSeqLen,
  });
}

function buildLoader(tokenizer: BPETokenizer, corpus: string[]) {
  const textDataset = new TextDataset({
    tokenizer,
    corpus,
    blockSize: BLOCK_SIZE,
    layout: "document-aligned",
    padTokenId: 0,
  });
  const trainLoader = new DataLoader(textDataset, {
    batchSize: BATCH_SIZE,
    shuffle: true,
    seed: SEED,
    dropLast: true,
  });
  return { textDataset, trainLoader };
}

function makeOptimizerScheduler(
  model: TensorMiniMindModel,
  trainLoader: DataLoader<TextSample>,
  epochs: number
) {
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: LR,
    weightDecay: WD,
  });
  const totalSteps = epochs * trainLoader.numBatches;
  const scheduler = new CosineScheduler(optimizer, {
    baseLR: LR,
    minLR: LR * 0.01,
    warmupSteps: Math.floor(totalSteps * 0.1),
    totalSteps,
  });
  return { optimizer, scheduler, totalSteps };
}

function runTraining(
  model: TensorMiniMindModel,
  trainLoader: DataLoader<TextSample>,
  epochs: number
) {
  const { optimizer, scheduler, totalSteps } = makeOptimizerScheduler(
    model,
    trainLoader,
    epochs
  );
  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader,
    config: {
      epochs,
      learningRate: LR,
      logInterval: 1000000,
      gradientAccumulationSteps: 1,
      gradientClipNorm: 1.0,
    },
    onEpochEnd: () => scheduler.step(),
  });
  trainer.scheduler = scheduler;
  const t0 = Date.now();
  const state = trainer.train();
  const durationMs = Date.now() - t0;
  return { optimizer, scheduler, totalSteps, trainer, state, durationMs };
}

function paramDeltaStats(model: TensorMiniMindModel, before: number[][]) {
  let maxDelta = 0;
  let sumAbsDelta = 0;
  const after = model.parameters();
  for (let i = 0; i < after.length; i++) {
    const d = after[i].data;
    for (let j = 0; j < d.length; j++) {
      const delta = Math.abs(d[j] - before[i][j]);
      if (delta > maxDelta) maxDelta = delta;
      sumAbsDelta += delta;
    }
  }
  return {
    maxAbsParamDelta: maxDelta,
    meanAbsParamDelta: sumAbsDelta / model.totalParamCount,
  };
}

// ============================================================
// FNV-1a over parameter bits (checkpoint identity)
// ============================================================

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
// Checkpoint integrity (same contract as Phase 91, per candidate)
// ============================================================

interface IntegrityReport {
  exists: boolean;
  sizeBytes: number;
  source: string;
  expectedParamCount: number;
  actualParamCount: number;
  paramCountMatches: boolean;
  shapeMismatches: string[];
  nanCount: number;
  infinityCount: number;
  finite: boolean;
  reloadDeterministic: boolean;
  loadSaveLoadLossless: boolean;
}

function verifyCheckpointIntegrity(
  ckpt: CheckpointData,
  model: TensorMiniMindModel,
  tokenizer: BPETokenizer,
  source: string
): IntegrityReport {
  const expectedParamCount = expectedParamCountFor(tokenizer.vocabSize);

  let actualParamCount = 0;
  let nanCount = 0;
  let infinityCount = 0;
  const shapeMismatches: string[] = [];

  for (const p of model.parameters()) {
    actualParamCount += p.data.length;
    for (let i = 0; i < p.data.length; i++) {
      if (Number.isNaN(p.data[i])) nanCount++;
      if (!Number.isFinite(p.data[i])) infinityCount++;
    }
  }

  // Shape cross-check vs a fresh model of this candidate's architecture.
  const fresh = buildModel(tokenizer);
  const freshShapes = new Map<string, string>();
  for (const { name, parameter } of fresh.namedParameters()) {
    freshShapes.set(name, parameter.shape.join(","));
  }
  for (const saved of ckpt.modelParams) {
    const savedShape = saved.shape.join(",");
    const curShape = freshShapes.get(saved.name);
    if (!curShape) {
      shapeMismatches.push(`missing in model: ${saved.name}`);
    } else if (curShape !== savedShape) {
      shapeMismatches.push(
        `${saved.name}: ckpt [${savedShape}] model [${curShape}]`
      );
    }
  }
  for (const name of freshShapes.keys()) {
    if (!ckpt.modelParams.some((p) => p.name === name)) {
      shapeMismatches.push(`missing in checkpoint: ${name}`);
    }
  }

  // Reload determinism: two fresh loads → identical param hash.
  const m1 = buildModel(tokenizer);
  const o1 = new AdamWOptimizer(m1.parameters(), { lr: LR, weightDecay: WD });
  loadCheckpoint({ model: m1, optimizer: o1, checkpoint: ckpt });
  const h1 = paramHash(m1);
  const m2 = buildModel(tokenizer);
  const o2 = new AdamWOptimizer(m2.parameters(), { lr: LR, weightDecay: WD });
  loadCheckpoint({ model: m2, optimizer: o2, checkpoint: ckpt });
  const h2 = paramHash(m2);
  const reloadDeterministic = h1 === h2;

  // Load → save → load lossless.
  const state = new TrainingState();
  const o3 = new AdamWOptimizer(m1.parameters(), { lr: LR, weightDecay: WD });
  const reSaved = saveCheckpoint({
    model: m1,
    optimizer: o3,
    scheduler: undefined,
    trainerState: state.snapshot(),
  });
  let loadSaveLoadLossless = true;
  for (let i = 0; i < ckpt.modelParams.length; i++) {
    const a = ckpt.modelParams[i];
    const b = reSaved.modelParams[i];
    if (!b || b.name !== a.name || b.shape.join(",") !== a.shape.join(",")) {
      loadSaveLoadLossless = false;
      break;
    }
    for (let j = 0; j < a.data.length; j++) {
      if (a.data[j] !== b.data[j]) {
        loadSaveLoadLossless = false;
        break;
      }
    }
    if (!loadSaveLoadLossless) break;
  }

  return {
    exists: fs.existsSync(source),
    sizeBytes: fs.existsSync(source) ? fs.statSync(source).size : 0,
    source,
    expectedParamCount,
    actualParamCount,
    paramCountMatches: actualParamCount === expectedParamCount,
    shapeMismatches,
    nanCount,
    infinityCount,
    finite: nanCount === 0 && infinityCount === 0,
    reloadDeterministic,
    loadSaveLoadLossless,
  };
}

// ============================================================
// Unchanged capability gates (Phase 90 runGates, untouched)
// ============================================================

interface GateResult {
  memorization: {
    top1: number;
    predictions: number;
    chance: number;
    exceedsChance: boolean;
    reproducesPatterns: boolean;
  };
  generation: {
    byLanguage: Record<string, {
      validUtf8Ratio: number;
      nonEmptyRatio: number;
      cjkRatio: number;
      collapsedRatio: number;
      mergedTokenRatio: number;
    }>;
    samples: {
      prompt: string;
      language: string;
      continuation: string;
      tokenCount: number;
      empty: boolean;
      validUtf8: boolean;
      hasCjk: boolean;
      repeatedCollapse: boolean;
      usesMergedTokens: boolean;
      replacementCharCount: number;
    }[];
  };
  roundTrip: {
    allRoundTrip: boolean;
    counts: Record<string, number>;
    failures: Record<string, number>;
  };
  level: number;
  levelText: string;
  levels: { level: number; name: string; criterion: string; achieved: boolean; reasons: string[] }[];
}

function runGates(
  model: TensorMiniMindModel,
  tokenizer: BPETokenizer,
  corpus: string[],
  datasetSamples: { text: string; language: string }[],
  trainingFlags: { lossDecreases: boolean; paramsChange: boolean }
): GateResult {
  const roundTrip = evaluateTokenizerRoundTrip(
    tokenizer,
    datasetSamples.map((s) => ({
      prompt: s.text,
      language: s.language as CapabilityPrompt["language"],
    }))
  );
  const memorization = measureMemorization(model, tokenizer, corpus, 8);
  const genEval = evaluateGeneration(model, tokenizer, GEN_EVAL_PROMPTS, {
    maxTokens: MAX_TOKENS,
    temperature: 0.8,
    seed: SEED,
  });
  const evidence = buildEvidence({
    pipelineRuns: true,
    lossDecreases: trainingFlags.lossDecreases,
    paramsChange: trainingFlags.paramsChange,
    roundTrip,
    memorization,
    generation: genEval,
  });
  const level = deriveCapabilityLevel(evidence);

  const byLang = (l: LanguageClass) => ({
    validUtf8Ratio: genEval.byLanguage[l].validUtf8Ratio,
    nonEmptyRatio: genEval.byLanguage[l].nonEmptyRatio,
    cjkRatio: genEval.byLanguage[l].cjkRatio,
    collapsedRatio: genEval.byLanguage[l].collapsedRatio,
    mergedTokenRatio: genEval.byLanguage[l].mergedTokenRatio,
  });

  return {
    memorization: {
      top1: memorization.top1Accuracy,
      predictions: memorization.predictions,
      chance: memorization.chance,
      exceedsChance: memorization.exceedsChance,
      reproducesPatterns: memorization.reproducesPatterns,
    },
    generation: {
      byLanguage: { zh: byLang("zh"), en: byLang("en"), mixed: byLang("mixed") },
      samples: genEval.samples.map((s) => ({
        prompt: s.prompt,
        language: s.language,
        continuation: s.continuation,
        tokenCount: s.tokenCount,
        empty: s.empty,
        validUtf8: s.validUtf8,
        hasCjk: s.hasCjk,
        repeatedCollapse: s.repeatedCollapse,
        usesMergedTokens: s.usesMergedTokens,
        replacementCharCount: s.replacementCharCount,
      })),
    },
    roundTrip,
    level: level.highestLevel,
    levelText: formatCapabilityReport(level),
    levels: level.levels.map((l) => ({
      level: l.level,
      name: l.name,
      criterion: l.criterion,
      achieved: l.achieved,
      reasons: l.reasons,
    })),
  };
}

// ============================================================
// Step 5 — generation-specific analysis (NEW measurement code)
// ============================================================

/** Count replacement chars a decode produced (invalid UTF-8 indicator). */
function replacementCharCount(decoded: string): number {
  let n = 0;
  for (const ch of decoded) {
    if (ch === "�") n++;
  }
  return n;
}

interface GreedySample {
  prompt: string;
  language: LanguageClass;
  continuation: string;
  validUtf8: boolean;
  replacementCharCount: number;
  stopReason: string;
  generatedLength: number;
}

function greedyUtf8Analysis(
  model: TensorMiniMindModel,
  tokenizer: BPETokenizer
): {
  samples: GreedySample[];
  invalidRate: number;
  byLanguage: Record<LanguageClass, number>;
} {
  const evaluator = new GenerationEvaluator(model, tokenizer);
  const results = evaluator.evaluate(
    GEN_EVAL_PROMPTS.map((p) => p.prompt),
    { maxTokens: MAX_TOKENS, temperature: 0, topK: 0, topP: 1, seed: SEED, eosTokenId: 3 }
  );
  const samples: GreedySample[] = results.map((r, i) => {
    const decoded = tokenizer.decode(r.generatedIds);
    const reps = replacementCharCount(decoded);
    return {
      prompt: GEN_EVAL_PROMPTS[i].prompt,
      language: GEN_EVAL_PROMPTS[i].language,
      continuation: decoded,
      validUtf8: reps === 0,
      replacementCharCount: reps,
      stopReason: r.stopReason,
      generatedLength: r.generatedIds.length,
    };
  });
  const invalid = samples.filter((s) => !s.validUtf8).length;
  const byLanguage = (l: LanguageClass): number => {
    const group = samples.filter((s) => s.language === l);
    return group.length > 0
      ? group.filter((s) => !s.validUtf8).length / group.length
      : 0;
  };
  return {
    samples,
    invalidRate: samples.length > 0 ? invalid / samples.length : 0,
    byLanguage: { zh: byLanguage("zh"), en: byLanguage("en"), mixed: byLanguage("mixed") },
  };
}

/**
 * Invalid-UTF-8 degradation curve over greedy rollout. For every zh and
 * mixed prompt, greedily generate 24 tokens; at each step decode the
 * prefix produced SO FAR and record whether it contains a replacement
 * character. Aggregated per step → shows how the byte-triplet corruption
 * compounds as rollout proceeds.
 */
function utf8DegradationCurve(
  model: TensorMiniMindModel,
  tokenizer: BPETokenizer
): { steps: { step: number; invalid: number; total: number; invalidRate: number }[] } {
  const prompts = GEN_EVAL_PROMPTS.filter((p) => p.language === "zh" || p.language === "mixed");
  const perStep = new Map<number, { invalid: number; total: number }>();

  for (const cap of prompts) {
    const promptIds = tokenizer.encode(cap.prompt);
    const current = [...promptIds];
    const generated: number[] = [];
    for (let step = 0; step < MAX_TOKENS; step++) {
      const ctx = current.slice(-128);
      const input = Tensor.fromArray([ctx]);
      let nextId: number;
      Tensor.noGrad(() => {
        const logitsArr = model.forward(input).toArray() as number[][][];
        const row = logitsArr[0][ctx.length - 1];
        let best = -Infinity;
        nextId = 0;
        for (let v = 0; v < row.length; v++) {
          if (row[v] > best) {
            best = row[v];
            nextId = v;
          }
        }
      }, model.parameters());
      generated.push(nextId!);
      current.push(nextId!);
      if (nextId! === 3) break; // <eos>

      const entry = perStep.get(step) ?? { invalid: 0, total: 0 };
      entry.total++;
      if (replacementCharCount(tokenizer.decode(generated)) > 0) entry.invalid++;
      perStep.set(step, entry);
    }
  }

  const steps = [...perStep.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, { invalid, total }]) => ({
      step,
      invalid,
      total,
      invalidRate: total > 0 ? invalid / total : 0,
    }));
  return { steps };
}

/** Next-token accuracy over greedy rollout (Phase 91 measureRollout). */
function rolloutAccuracy(
  model: TensorMiniMindModel,
  tokenizer: BPETokenizer,
  corpus: string[],
  maxSamples: number,
  maxSteps: number
): { steps: { step: number; correct: number; total: number; accuracy: number }[]; skippedTooLong: number } {
  const steps = new Map<number, { correct: number; total: number }>();
  let skippedTooLong = 0;

  for (const text of corpus.slice(0, maxSamples)) {
    const ids = tokenizer.encode(text);
    if (ids.length < 2) continue;
    if (ids.length > 256) {
      skippedTooLong++;
      continue;
    }
    const current = [ids[0]];
    for (let step = 1; step <= maxSteps; step++) {
      if (step >= ids.length) break;
      const ctx = current.slice(-128);
      const input = Tensor.fromArray([ctx]);
      let nextId: number;
      Tensor.noGrad(() => {
        const logitsArr = model.forward(input).toArray() as number[][][];
        const row = logitsArr[0][ctx.length - 1];
        let best = -Infinity;
        nextId = 0;
        for (let v = 0; v < row.length; v++) {
          if (row[v] > best) {
            best = row[v];
            nextId = v;
          }
        }
      }, model.parameters());
      const entry = steps.get(step) ?? { correct: 0, total: 0 };
      entry.total++;
      if (nextId! === ids[step]) entry.correct++;
      steps.set(step, entry);
      current.push(nextId!);
    }
  }

  const stepsOut = [...steps.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, { correct, total }]) => ({
      step,
      correct,
      total,
      accuracy: total > 0 ? correct / total : 0,
    }));
  return { steps: stepsOut, skippedTooLong };
}

// ============================================================
// Reproducibility (Phase 90 pattern — seed reset per run)
// ============================================================

function reproducibilityCheck(
  corpus: string[],
  vocabTarget: number
): { identical: boolean; steps: number; lossHistory: number[] } {
  const runs: number[][] = [];
  for (let r = 0; r < 2; r++) {
    Random.setSeed(SEED); // reset global RNG → identical model init each run
    const tokenizer = buildTokenizer(corpus, vocabTarget);
    const aligned = buildLoader(tokenizer, corpus);
    const model = buildModel(tokenizer);
    const { state } = runTraining(model, aligned.trainLoader, REPRO_EPOCHS);
    runs.push([...state.lossHistory]);
  }
  const [a, b] = runs;
  const identical = a.length === b.length && a.every((v, i) => v === b[i]);
  return { identical, steps: a.length, lossHistory: a };
}

// ============================================================
// Per-candidate processing
// ============================================================

interface CandidateResult {
  key: string;
  label: string;
  vocabTarget: number;
  tokenizer: {
    actualVocabSize: number;
    mergeCount: number;
    stateHash: string;
    roundTrip: boolean;
    accepted: boolean;
    avgTokensPerCjkOccurrence: number | null;
    pctSingleToken: number | null;
    pctTwoToken: number | null;
    pctThreePlus: number | null;
    tokensPerCharZhSamples: number | null;
  };
  model: { totalParams: number; expectedParams: number; paramsDelta: number };
  training: {
    trained: boolean;
    source: string;
    initialLoss: number | null;
    finalLoss: number | null;
    bestLoss: number | null;
    totalSteps: number | null;
    durationMs: number | null;
    maxAbsParamDelta: number | null;
    meanAbsParamDelta: number | null;
  };
  checkpoint: {
    path: string;
    integrity: IntegrityReport;
  };
  gates: GateResult;
  generationAnalysis: {
    greedy: ReturnType<typeof greedyUtf8Analysis>;
    temp08: GenerationEvaluationReport;
    utf8DegradationCurve: ReturnType<typeof utf8DegradationCurve>;
    rollout: { steps: { step: number; correct: number; total: number; accuracy: number }[]; skippedTooLong: number };
  };
  reproducibility: {
    identical: boolean;
    steps: number;
    lossHistory: number[];
    source: string;
  };
}

function buildTraining(
  corpus: string[],
  vocabTarget: number
): {
  tokenizer: BPETokenizer;
  model: TensorMiniMindModel;
  trainer: Trainer;
  state: { initialLoss: number; finalLoss: number; bestLoss: number; totalSteps: number; durationMs: number };
  maxAbsParamDelta: number;
  meanAbsParamDelta: number;
} {
  const tokenizer = buildTokenizer(corpus, vocabTarget);
  const aligned = buildLoader(tokenizer, corpus);
  const model = buildModel(tokenizer);
  const beforeParams = model.parameters().map((p) => Array.from(p.data));
  const { trainer, state: trainState, durationMs } = runTraining(model, aligned.trainLoader, EPOCHS);
  const { maxAbsParamDelta, meanAbsParamDelta } = paramDeltaStats(model, beforeParams);
  return {
    tokenizer,
    model,
    trainer,
    state: {
      initialLoss: trainState.lossHistory[0],
      finalLoss: trainState.lossHistory[trainState.lossHistory.length - 1],
      bestLoss: trainState.bestLoss,
      totalSteps: trainState.globalStep,
      durationMs,
    },
    maxAbsParamDelta,
    meanAbsParamDelta,
  };
}

function processCandidate(
  cand: { key: string; label: string; vocabTarget: number },
  dataset: LoadedDataset,
  corpus: string[],
  tokenizerProbe: unknown
): CandidateResult {
  const tokenizerProbeResult = (tokenizerProbe as { candidates: CandidateTokenizerProbeEntry[] }).candidates.find(
    (c) => c.key === cand.key
  );

  const tokenizer = buildTokenizer(corpus, cand.vocabTarget);
  console.log(
    `\n=== candidate ${cand.key} (vocab ${cand.vocabTarget}, merges ${tokenizer.toState().merges.length}) ===`
  );

  // ── Training / checkpoint acquisition ──
  let model: TensorMiniMindModel;
  let training: CandidateResult["training"];
  let checkpoint: CheckpointData;
  let checkpointPath: string;

  if (cand.key === "A") {
    // Baseline: reuse the exact Phase 90 condition-B artifact.
    const ckpt = JSON.parse(fs.readFileSync(A_CKPT, "utf8")) as CheckpointData;
    model = buildModel(tokenizer);
    const optimizer = new AdamWOptimizer(model.parameters(), { lr: LR, weightDecay: WD });
    loadCheckpoint({ model, optimizer, checkpoint: ckpt });
    const aStats = JSON.parse(fs.readFileSync(A_RESULT_JSON, "utf8")) as {
      training: { initialLoss: number; finalLoss: number; bestLoss: number; totalSteps: number; durationMs: number };
    };
    training = {
      trained: false,
      source: "experiments/phase90/phase90-aligned.ckpt.json (Phase 90 condition B)",
      initialLoss: aStats.training.initialLoss,
      finalLoss: aStats.training.finalLoss,
      bestLoss: aStats.training.bestLoss,
      totalSteps: aStats.training.totalSteps,
      durationMs: aStats.training.durationMs,
      maxAbsParamDelta: null,
      meanAbsParamDelta: null,
    };
    checkpoint = ckpt;
    checkpointPath = A_CKPT;
  } else {
    const built = buildTraining(corpus, cand.vocabTarget);
    model = built.model;
    training = {
      trained: true,
      source: "fresh training in this probe",
      initialLoss: built.state.initialLoss,
      finalLoss: built.state.finalLoss,
      bestLoss: built.state.bestLoss,
      totalSteps: built.state.totalSteps,
      durationMs: built.state.durationMs,
      maxAbsParamDelta: built.maxAbsParamDelta,
      meanAbsParamDelta: built.meanAbsParamDelta,
    };
    checkpointPath = path.join(OUT_DIR, `phase92-${cand.key.toLowerCase()}.ckpt.json`);
    // Crash-safe: persist BEFORE the expensive evaluation below. Uses the
    // trainer's own saveCheckpoint() so dataloader + random state are real.
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(checkpointPath, JSON.stringify(built.trainer.saveCheckpoint()), "utf8");
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as CheckpointData;
  }

  console.log("model params:", model.totalParamCount);
  const integrity = verifyCheckpointIntegrity(checkpoint, model, tokenizer, checkpointPath);
  console.log(
    "checkpoint integrity: params",
    integrity.actualParamCount,
    "expected",
    integrity.expectedParamCount,
    "| match:",
    integrity.paramCountMatches,
    "| finite:",
    integrity.finite,
    "| reloadDet:",
    integrity.reloadDeterministic,
    "| lossless:",
    integrity.loadSaveLoadLossless
  );

  // ── Unchanged gates ──
  const gates = runGates(model, tokenizer, corpus, dataset.samples, {
    lossDecreases: training.finalLoss !== null && training.initialLoss !== null
      ? training.finalLoss < training.initialLoss
      : true,
    paramsChange: training.maxAbsParamDelta !== null ? training.maxAbsParamDelta > 0 : true,
  });
  console.log("gates memorization top1:", gates.memorization.top1.toFixed(4), "| level:", gates.level);
  console.log("gates validUtf8:", JSON.stringify({
    zh: gates.generation.byLanguage.zh.validUtf8Ratio,
    en: gates.generation.byLanguage.en.validUtf8Ratio,
    mixed: gates.generation.byLanguage.mixed.validUtf8Ratio,
  }));
  for (const s of gates.generation.samples) {
    console.log(`  [${s.language}] "${s.prompt}" -> ${JSON.stringify(s.continuation)}`);
  }

  // ── Step 5: generation analysis ──
  const greedy = greedyUtf8Analysis(model, tokenizer);
  console.log("greedy invalidUtf8 rate:", greedy.invalidRate.toFixed(4),
    "| byLang:", JSON.stringify(greedy.byLanguage));

  const temp08 = evaluateGeneration(model, tokenizer, GEN_EVAL_PROMPTS, {
    maxTokens: MAX_TOKENS,
    temperature: 0.8,
    seed: SEED,
  });

  const utf8Degradation = utf8DegradationCurve(model, tokenizer);
  const midSteps = utf8Degradation.steps
    .filter((s) => [0, 4, 8, 12, 16, 20, 23].includes(s.step))
    .map((s) => `${s.step}:${s.invalidRate.toFixed(2)}`)
    .join("  ");
  console.log("utf8 degradation curve:", midSteps);

  const rollout = rolloutAccuracy(model, tokenizer, corpus, 60, 24);
  const rolloutSteps = rollout.steps
    .filter((s) => [1, 2, 4, 8, 16, 24].includes(s.step))
    .map((s) => `${s.step}:${s.accuracy.toFixed(4)}`)
    .join("  ");
  console.log("rollout accuracy:", rolloutSteps);

  // ── Reproducibility ──
  let reproducibility: CandidateResult["reproducibility"];
  if (cand.key === "A") {
    const aRepro = JSON.parse(fs.readFileSync(A_REPRO_JSON, "utf8")) as {
      reproducibility?: { identical: boolean; steps: number; lossHistory: number[] };
      conditionB?: { identical?: boolean; steps?: number };
    };
    const repro = aRepro.reproducibility ?? { identical: false, steps: 0, lossHistory: [] };
    reproducibility = {
      identical: repro.identical,
      steps: repro.steps,
      lossHistory: repro.lossHistory ?? [],
      source: "Phase 90 probe-results.json (identical path, vocab 300)",
    };
  } else {
    const repro = reproducibilityCheck(corpus, cand.vocabTarget);
    reproducibility = {
      identical: repro.identical,
      steps: repro.steps,
      lossHistory: repro.lossHistory,
      source: "fresh 2×2-epoch seeded runs in this probe",
    };
  }
  console.log("reproducibility identical:", reproducibility.identical, "| steps:", reproducibility.steps);

  return {
    key: cand.key,
    label: cand.label,
    vocabTarget: cand.vocabTarget,
    tokenizer: {
      actualVocabSize: tokenizer.vocabSize,
      mergeCount: tokenizer.toState().merges.length,
      stateHash: tokenizerProbeResult?.stateHash ?? tokenizerStateHash(tokenizer),
      roundTrip: tokenizerProbeResult?.roundTrip.allRoundTrip ?? false,
      accepted: tokenizerProbeResult?.accepted ?? false,
      avgTokensPerCjkOccurrence: tokenizerProbeResult?.chinese.avgTokensPerCjkOccurrence ?? null,
      pctSingleToken: tokenizerProbeResult?.chinese.pctSingleToken ?? null,
      pctTwoToken: tokenizerProbeResult?.chinese.pctTwoToken ?? null,
      pctThreePlus: tokenizerProbeResult?.chinese.pctThreePlus ?? null,
      tokensPerCharZhSamples: tokenizerProbeResult?.chinese.tokensPerCharZhSamples ?? null,
    },
    model: {
      totalParams: model.totalParamCount,
      expectedParams: expectedParamCountFor(tokenizer.vocabSize),
      paramsDelta: model.totalParamCount - expectedParamCountFor(300),
    },
    training,
    checkpoint: { path: checkpointPath, integrity },
    gates,
    generationAnalysis: { greedy, temp08, utf8DegradationCurve: utf8Degradation, rollout },
    reproducibility,
  };
}

// ============================================================
// Main
// ============================================================

interface CandidateTokenizerProbeEntry {
  key: string;
  label: string;
  vocabTarget: number;
  actualVocabSize: number;
  mergeCount: number;
  stateHash: string;
  deterministicReconstruction: boolean;
  stateRoundTrip: boolean;
  roundTrip: { allRoundTrip: boolean; failures: number };
  tokens: {
    totalTokens: number;
    avgTokensZhSample: number;
    avgTokensEnSample: number;
    avgTokensMixedSample: number;
    minTokensPerSample: number;
    maxTokensPerSample: number;
  };
  chinese: {
    avgTokensPerCjkOccurrence: number;
    pctSingleToken: number;
    pctTwoToken: number;
    pctThreePlus: number;
    tokensPerCharZhSamples: number;
    cjkCharsPerTokenZhSamples: number;
  };
  vocabUtilization: { used: number; total: number; ratio: number };
  accepted: boolean;
}

/** True when a candidate-*.json holds a finished, loadable result. */
function isCompleteCandidate(path: string): boolean {
  try {
    const r = JSON.parse(fs.readFileSync(path, "utf8")) as CandidateResult;
    return (
      r.tokenizer !== undefined &&
      r.model !== undefined &&
      r.training !== undefined &&
      r.checkpoint?.integrity !== undefined &&
      r.gates !== undefined &&
      typeof r.gates.level === "number" &&
      r.generationAnalysis?.greedy?.invalidRate !== undefined &&
      typeof r.reproducibility?.identical === "boolean"
    );
  } catch {
    return false;
  }
}

function main(): void {
  const dataset: LoadedDataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  const base = computeBaseStatistics(dataset);
  const tokenizerProbe = JSON.parse(fs.readFileSync(TOKENIZER_PROBE, "utf8"));

  console.log("=== Phase 92 probe: tokenizer merge budget experiment ===");
  console.log("dataset:", dataset.metadata.id, dataset.metadata.version, "| samples", dataset.samples.length);
  console.log("recipe: blockSize", BLOCK_SIZE, "epochs", EPOCHS, "batch", BATCH_SIZE, "seed", SEED);

  const candidates = [
    { key: "A", label: "baseline (production)", vocabTarget: 300 },
    { key: "B", label: "moderate merge budget", vocabTarget: 340 },
    { key: "C", label: "larger merge budget", vocabTarget: 380 },
  ];

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // CLI options:
  //   --only=A,B,C — only (re)process the listed candidates fresh; all others
  //     are loaded from existing complete candidate-*.json files when available.
  //   (no --only)  — process every candidate fresh (original behavior).
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlySet = new Set(
    onlyArg
      ? onlyArg
          .slice("--only=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : candidates.map((c) => c.key)
  );

  const results: Record<string, CandidateResult> = {};
  for (const cand of candidates) {
    const resultPath = path.join(OUT_DIR, `candidate-${cand.key}.json`);
    if (!onlySet.has(cand.key)) {
      if (!isCompleteCandidate(resultPath)) {
        throw new Error(
          `candidate ${cand.key} has no complete result at ${resultPath} and is not in --only; cannot build probe-results.json`
        );
      }
      results[cand.key] = JSON.parse(fs.readFileSync(resultPath, "utf8")) as CandidateResult;
      console.log(`=== candidate ${cand.key} loaded from existing ${path.basename(resultPath)} (skipped) ===`);
      continue;
    }
    const result = processCandidate(cand, dataset, corpus, tokenizerProbe);
    results[cand.key] = result;
    // Crash-safe incremental write per candidate.
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
  }

  const tokenizerProbeCandidates = (tokenizerProbe as { candidates: CandidateTokenizerProbeEntry[] }).candidates;

  const full = {
    phase: "phase92",
    question:
      "Does increasing the BPE tokenizer merge budget improve Chinese tokenization granularity and thereby improve stable UTF-8 generation?",
    recipe: {
      dataset: dataset.metadata.id,
      datasetVersion: dataset.metadata.version,
      samples: dataset.samples.length,
      languageCounts: base.languageCounts,
      splitCounts: base.splitCounts,
      blockSize: BLOCK_SIZE,
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      seed: SEED,
      optimizer: "AdamW(lr=0.001,wd=0.01)",
      scheduler: "Cosine(10% warmup -> 1% min)",
      gradClip: 1.0,
      layout: "document-aligned (Phase 90)",
      objective: "corrected 1-step causal + masked (Phase 89/90)",
      productionVocabTarget: 300,
    },
    coupling: {
      rule: "merges = vocabSize - 260",
      mergesByCandidate: Object.fromEntries(
        Object.entries(results).map(([k, r]) => [k, r.tokenizer.mergeCount])
      ),
    },
    tokenizerMeasurements: tokenizerProbeCandidates.map((c) => ({
      key: c.key,
      vocabTarget: c.vocabTarget,
      actualVocabSize: c.actualVocabSize,
      mergeCount: c.mergeCount,
      avgTokensZhSample: c.tokens?.avgTokensZhSample,
      avgTokensEnSample: c.tokens?.avgTokensEnSample,
      avgTokensMixedSample: c.tokens?.avgTokensMixedSample,
      avgTokensPerCjkOccurrence: c.chinese.avgTokensPerCjkOccurrence,
      pctSingleToken: c.chinese.pctSingleToken,
      pctTwoToken: c.chinese.pctTwoToken,
      pctThreePlus: c.chinese.pctThreePlus,
      tokensPerCharZhSamples: c.chinese.tokensPerCharZhSamples,
      vocabUtilization: c.vocabUtilization,
      roundTrip: c.roundTrip,
      stateHash: c.stateHash,
      accepted: c.accepted,
    })),
    candidates: results,
    summary: {
      memorizationTop1: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.gates.memorization.top1])),
      level: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.gates.level])),
      validUtf8Temp08: Object.fromEntries(
        Object.entries(results).map(([k, r]) => [k, r.gates.generation.byLanguage])
      ),
      validUtf8Greedy: Object.fromEntries(
        Object.entries(results).map(([k, r]) => [k, r.generationAnalysis.greedy.byLanguage])
      ),
      avgTokensPerCjkOccurrence: Object.fromEntries(
        Object.entries(results).map(([k, r]) => [k, r.tokenizer.avgTokensPerCjkOccurrence])
      ),
      pctSingleTokenZhChar: Object.fromEntries(
        Object.entries(results).map(([k, r]) => [k, r.tokenizer.pctSingleToken])
      ),
      finalLoss: Object.fromEntries(
        Object.entries(results).map(([k, r]) => [k, r.training.finalLoss])
      ),
      params: Object.fromEntries(
        Object.entries(results).map(([k, r]) => [k, r.model.totalParams])
      ),
    },
    hypothesisVerdict: null as null | { outcome: string; reasoning: string[] },
    nextBottleneck: null as null | string,
    fakeDataAudit: {
      mathRandomInMetrics: false,
      setTimeoutFakeTraining: false,
      hardcodedFakeMetrics: false,
      fabricatedCheckpoint: false,
      evaluatorModified: false,
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, "probe-results.json"), JSON.stringify(full, null, 2), "utf8");
  console.log("\nresults written: probe-results.json");
}

main();
