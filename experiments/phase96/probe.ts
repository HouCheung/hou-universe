// ============================================================
// Phase 96 — Augmentation Transfer Experiment
// ============================================================
// Tests the transfer hypothesis Phase 94 §13 item 1 identified and
// Phase 95 §14 item 1 re-issued: re-run the augmented arm with the
// augmentation's prompt regime MATCHED to the evaluator's, at fixed
// k = 8. The one-constant change is the rollout-start range:
//
//   Phase 94 cell B : s0 in [8,   63-k]
//   Phase 96 treatment: s0 in [1, 5]
//
// Why [1,5]: the capability gate prompts with 2–5 tokens
// ("太阳", "机器学习是", "the sun rises", "什么是 machine learning").
// Phase 94 built every augmented window from a true prefix of at least
// 8 tokens, so little of what it taught was reachable from a 2–5 token
// prompt. Phase 96 removes exactly that mismatch and nothing else.
//
// WHAT THIS HARNESS DOES NOT DO:
//   - it does not modify the tokenizer, the dataset, the model, the
//     generation algorithm, the prompt set, the horizon, the sampling
//     parameters, the rollout calculation, or any capability threshold;
//   - it does not modify or import Phase 94's private helpers — the
//     window construction and rollout metric are re-derived here so
//     that `experiments/phase94/**` stays byte-identical;
//   - it does not import from `experiments/phase95/**`;
//   - it does not compute confidence intervals or claim replicates it
//     did not run.
//
// The evaluator is the unchanged Phase-95 SSOT
// (`src/lib/minimind/research/capability-eval`), with the tolerant
// UTF-8 gate active and the strict ratio retained as a diagnostic.
//
// Run:
//   npx --yes tsx experiments/phase96/probe.ts --stage=preflight
//   npx --yes tsx experiments/phase96/probe.ts --stage=train
//   npx --yes tsx experiments/phase96/probe.ts --stage=eval
//   npx --yes tsx experiments/phase96/probe.ts --stage=all
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
import { collateBatch } from "../../src/lib/minimind/training/Trainer";
import { loadCheckpoint, saveCheckpoint } from "../../src/lib/minimind/training/checkpoint/Checkpoint";
import type { CheckpointData } from "../../src/lib/minimind/training/checkpoint/Checkpoint";
import type { TrainingStateSnapshot } from "../../src/lib/minimind/training/TrainingState";
import { TensorMiniMindModel } from "../../src/lib/minimind/model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../src/lib/minimind/core/optim/AdamW";
import { CosineScheduler } from "../../src/lib/minimind/core/scheduler/CosineScheduler";
import { Random } from "../../src/lib/minimind/core/random/Random";
import { Tensor } from "../../src/lib/minimind/core/Tensor";
import { crossEntropyLoss } from "../../src/lib/minimind/core/loss/CrossEntropyLoss";
import { clipGradients } from "../../src/lib/minimind/core/GradientClipper";
import {
  evaluateGeneration,
  evaluateTokenizerRoundTrip,
  measureMemorization,
  aggregateGenerationSamples,
  buildEvidence,
  deriveCapabilityLevel,
  formatCapabilityReport,
  type CapabilityPrompt,
  type LanguageClass,
  type GenerationEvaluationReport,
} from "../../src/lib/minimind/research/capability-eval";
import type { TextSample } from "../../src/lib/minimind/data/TextDataset";

// ============================================================
// Fixed production recipe — IDENTICAL to Phase 89/90/94
// ============================================================
// Every constant below is pinned to the Phase 94 cell-B value. The only
// Phase 96 deviations are AUG_S0_MIN and AUG_S0_MAX, and they are
// declared as such next to the Phase 94 values they replace.

const BATCH_SIZE = 4;
const LR = 0.001;
const WD = 0.01;
const SEED = 42;
const VOCAB_TARGET = 300;
const BLOCK_SIZE = 64;
const EPOCHS = 20;
const REPRO_EPOCHS = 2;
const MAX_TOKENS = 24;
const MAX_CTX = 128;
const PAD_TOKEN_ID = 0;
const EOS_TOKEN_ID = 3;

/** Every 4th optimizer step uses augmented windows (Phase 94 §4.2). */
const AUG_R = 4;
/** Own-context rollout horizon. FIXED at 8 — the dose that did the least harm. */
const AUG_K = 8;

// ── the Phase 96 intervention: the s0 range only ──
/** Phase 94 cell B used 8. */
const PHASE94_S0_MIN = 8;
/** Phase 96 draws the rollout start from the evaluator's own prompt regime. */
const AUG_S0_MIN = 1;
/** Phase 96 upper bound. Phase 94 had no such cap (it used 63-k). */
const AUG_S0_MAX = 5;

/** Phase 94's recorded first-optimizer-step loss for cells B and C. */
const PHASE94_INITIAL_LOSS = 5.977156484441439;

const GEN_EVAL_PROMPTS: CapabilityPrompt[] = [
  { prompt: "the sun rises", language: "en" },
  { prompt: "machine learning is", language: "en" },
  { prompt: "太阳", language: "zh" },
  { prompt: "机器学习是", language: "zh" },
  { prompt: "什么是 machine learning", language: "mixed" },
];

const OUT_DIR = path.resolve(__dirname);
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const BASELINE_CKPT = path.resolve(__dirname, "..", "phase90", "phase90-aligned.ckpt.json");
const BASELINE_RESULT = path.resolve(__dirname, "..", "phase90", "condition-b.json");
const P94_DIR = path.resolve(__dirname, "..", "phase94");
const P94_TREATMENT_CKPT = path.join(P94_DIR, "phase94-b.ckpt.json");
const P94_TREATMENT_RESULT = path.join(P94_DIR, "candidate-B.json");

const TREATMENT_CKPT = path.join(OUT_DIR, "phase96-treatment.ckpt.json");

const productionCfg = getProductionModelConfig();
const PRODUCTION_PARAMS = 1_126_528;

/** The pinned configuration, consumed by phase96's test suite. */
export const config = {
  BATCH_SIZE,
  LR,
  WD,
  SEED,
  VOCAB_TARGET,
  BLOCK_SIZE,
  EPOCHS,
  REPRO_EPOCHS,
  MAX_TOKENS,
  MAX_CTX,
  PAD_TOKEN_ID,
  EOS_TOKEN_ID,
  AUG_R,
  AUG_K,
  AUG_S0_MIN,
  AUG_S0_MAX,
  PHASE94_S0_MIN,
  PHASE94_INITIAL_LOSS,
  PRODUCTION_PARAMS,
} as const;

export { productionCfg, GEN_EVAL_PROMPTS, MANIFEST_PATH, TREATMENT_CKPT };
export { AUG_K, AUG_R, AUG_S0_MIN, AUG_S0_MAX };

// ============================================================
// Pipeline construction (exact Phase 90/94 invocation)
// ============================================================

export function loadCorpus(): string[] {
  const dataset: LoadedDataset = loadProductionDataset();
  return getDatasetTexts(dataset);
}

/**
 * Rebuilt from the corpus with the production recipe. `Random.setSeed(42)`
 * is reset here — this is the RNG-stream origin every Phase 90–94 cell
 * shares, and therefore the reason the treatment arm's init is comparable
 * to Phase 94 cell B (see `preflight`).
 */
export function buildTokenizer(corpus: string[], vocabTarget: number): BPETokenizer {
  Random.setSeed(SEED);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, vocabTarget);
  return tokenizer;
}

/**
 * NOTE — deliberately does NOT call `Random.setSeed`.
 *
 * Phase 94 §12.5 recorded this as a wart and §13 item 4 recommended fixing
 * it. Phase 96 does NOT fix it, because fixing it would give the treatment
 * arm a different initialization from Phase 94 cell B and destroy the
 * one-constant isolation this experiment is built on. The consequence is
 * documented rather than silently changed, and `preflight` proves the init
 * actually matches instead of assuming it.
 */
export function buildModel(tokenizer: BPETokenizer): TensorMiniMindModel {
  return new TensorMiniMindModel({
    vocabSize: tokenizer.vocabSize,
    dModel: productionCfg.dModel,
    numHeads: productionCfg.numHeads,
    dFF: productionCfg.dFF,
    numLayers: productionCfg.numLayers,
    maxSeqLen: productionCfg.maxSeqLen,
  });
}

export function buildLoader(tokenizer: BPETokenizer, corpus: string[]) {
  const textDataset = new TextDataset({
    tokenizer,
    corpus,
    blockSize: BLOCK_SIZE,
    layout: "document-aligned",
    padTokenId: PAD_TOKEN_ID,
  });
  const trainLoader = new DataLoader(textDataset, {
    batchSize: BATCH_SIZE,
    shuffle: true,
    seed: SEED,
    dropLast: true,
  });
  return { textDataset, trainLoader };
}

/** Encode every corpus document once (vocab-300 BPE) for augmentation. */
export function encodeDocuments(tokenizer: BPETokenizer, corpus: string[]): number[][] {
  return corpus.map((t) => tokenizer.encode(t));
}

// ============================================================
// Augmentation eligibility and the s0 range
// ============================================================

/**
 * Docs long enough to build an augmented window:
 * we need s0 >= AUG_S0_MIN and s0 + 1 + k + 1 <= docLen.
 */
export function eligibleDocIndices(docTokenSeq: number[][], k: number): number[] {
  const need = AUG_S0_MIN + 2 + k;
  const out: number[] = [];
  for (let i = 0; i < docTokenSeq.length; i++) {
    if (docTokenSeq[i].length >= need) out.push(i);
  }
  return out;
}

/**
 * The effective s0 range for one document. The Phase 96 cap (`AUG_S0_MAX`)
 * and the two structural bounds (the window must not run past the block,
 * and the own tail must stay inside the true document) all apply. The
 * result is always a SUBSET of [AUG_S0_MIN, AUG_S0_MAX].
 */
export function s0RangeFor(docLen: number, k: number): { lo: number; hi: number } {
  const hi = Math.min(AUG_S0_MAX, BLOCK_SIZE - 1 - k, docLen - 2 - k);
  return { lo: AUG_S0_MIN, hi };
}

// ============================================================
// Augmented window construction (Phase 94 §4.1, re-derived)
// ============================================================
// Input  = true prefix x[0..s0] + the model's own argmax tail (<= k) + pad.
// Target = the TRUE document tokens aligned to the window, so the CE's
//          internal shift supervises every valid position against the real
//          next token — including own-region positions.
// The own tail is detached integer input; gradients flow only through the
// single forward over the window. No sampling, no gradient through argmax.

export interface AugmentedWindow {
  inp: number[];
  tgt: number[];
  mask: number[];
  ownLen: number;
}

export function buildAugmentedWindow(
  model: TensorMiniMindModel,
  doc: number[],
  s0: number,
  k: number
): AugmentedWindow {
  let ctx = doc.slice(0, s0 + 1);
  const own: number[] = [];
  for (let j = 0; j < k; j++) {
    const lastCtx = ctx.slice(-MAX_CTX);
    const input = Tensor.fromArray([lastCtx]);
    let next = 0;
    Tensor.noGrad(() => {
      const logitsArr = model.forward(input).toArray() as number[][][];
      const row = logitsArr[0][lastCtx.length - 1];
      let best = -Infinity;
      for (let v = 0; v < row.length; v++) {
        if (row[v] > best) {
          best = row[v];
          next = v;
        }
      }
    }, model.parameters());
    own.push(next);
    ctx.push(next);
    if (next === EOS_TOKEN_ID) break;
  }
  const ownLen = own.length;
  const validEnd = Math.min(s0 + ownLen, BLOCK_SIZE - 1);

  const inp = new Array<number>(BLOCK_SIZE).fill(PAD_TOKEN_ID);
  const tgt = new Array<number>(BLOCK_SIZE).fill(PAD_TOKEN_ID);
  const mask = new Array<number>(BLOCK_SIZE).fill(0);

  for (let s = 0; s <= s0; s++) inp[s] = doc[s];
  for (let j = 0; j < ownLen; j++) inp[s0 + 1 + j] = own[j];
  for (let j = 0; j < BLOCK_SIZE && j <= validEnd + 1 && j < doc.length; j++) tgt[j] = doc[j];
  for (let s = 0; s <= validEnd; s++) mask[s] = 1;

  return { inp, tgt, mask, ownLen };
}

export interface AugmentedBatch {
  inputIds: number[][];
  targets: number[][];
  masks: number[][];
  /** The (docIndex, s0) pairs actually drawn — the audit surface. */
  draws: { docIndex: number; s0: number; ownLen: number }[];
  /** Windows that could not be built (maxS0 < AUG_S0_MIN). Expected 0. */
  skipped: { docIndex: number; docLen: number; reason: string }[];
}

/**
 * Build a full augmented batch (one window per sample in the batch).
 * Deterministic given the seeded global Random (doc + s0 draws) and the
 * current model (own-tail argmax).
 */
export function buildAugmentedBatch(
  model: TensorMiniMindModel,
  docTokenSeq: number[][],
  eligible: number[],
  k: number,
  count: number
): AugmentedBatch {
  const inputIds: number[][] = [];
  const targets: number[][] = [];
  const masks: number[][] = [];
  const draws: AugmentedBatch["draws"] = [];
  const skipped: AugmentedBatch["skipped"] = [];

  for (let b = 0; b < count; b++) {
    const docIdx = eligible[Math.floor(Random.uniform(0, eligible.length))];
    const doc = docTokenSeq[docIdx];
    const { lo, hi } = s0RangeFor(doc.length, k);
    if (hi < lo) {
      // Not reachable for docs passing `eligibleDocIndices`, but reported
      // rather than silently substituted.
      skipped.push({
        docIndex: docIdx,
        docLen: doc.length,
        reason: `no valid s0 in [${lo},${hi}]`,
      });
      continue;
    }
    const s0 = Math.floor(Random.uniform(lo, hi + 1));
    const { inp, tgt, mask, ownLen } = buildAugmentedWindow(model, doc, s0, k);
    inputIds.push(inp);
    targets.push(tgt);
    masks.push(mask);
    draws.push({ docIndex: docIdx, s0, ownLen });
  }

  return { inputIds, targets, masks, draws, skipped };
}

// ============================================================
// Augmented training loop (production Trainer untouched)
// ============================================================

export interface TrainStats {
  lossHistory: number[];
  bestLoss: number;
  totalSteps: number;
  augSteps: number;
  augWindows: number;
  augSkipped: number;
  s0Histogram: Record<number, number>;
  durationMs: number;
  maxAbsParamDelta: number;
  meanAbsParamDelta: number;
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

export function runAugmentedTraining(
  model: TensorMiniMindModel,
  trainLoader: DataLoader<TextSample>,
  docTokenSeq: number[][],
  eligible: number[],
  k: number,
  epochs: number
): TrainStats {
  const optimizer = new AdamWOptimizer(model.parameters(), { lr: LR, weightDecay: WD });
  const totalSteps = epochs * trainLoader.numBatches;
  const scheduler = new CosineScheduler(optimizer, {
    baseLR: LR,
    minLR: LR * 0.01,
    warmupSteps: Math.floor(totalSteps * 0.1),
    totalSteps,
  });
  const before = model.parameters().map((p) => Array.from(p.data));
  const lossHistory: number[] = [];
  const s0Histogram: Record<number, number> = {};
  let bestLoss = Infinity;
  let stepCount = 0;
  let augSteps = 0;
  let augWindows = 0;
  let augSkipped = 0;
  const t0 = Date.now();

  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochSum = 0;
    let epochN = 0;
    for (const batch of trainLoader) {
      let inputIds: Tensor;
      let targets: number[][];
      let masks: number[][] | undefined;
      const isAug = k > 0 && stepCount % AUG_R === AUG_R - 1;
      if (isAug) {
        const aug = buildAugmentedBatch(model, docTokenSeq, eligible, k, batch.length);
        inputIds = Tensor.fromArray(aug.inputIds);
        targets = aug.targets;
        masks = aug.masks;
        augSteps++;
        augWindows += aug.draws.length;
        augSkipped += aug.skipped.length;
        for (const d of aug.draws) s0Histogram[d.s0] = (s0Histogram[d.s0] ?? 0) + 1;
      } else {
        const collated = collateBatch(batch);
        inputIds = collated.inputIds;
        targets = batch.map((s) => s.inputIds);
        masks = batch.every((s) => s.mask !== undefined)
          ? batch.map((s) => s.mask as number[])
          : undefined;
      }

      const logits = model.forward(inputIds);
      const lossTensor =
        masks !== undefined
          ? crossEntropyLoss(logits, targets, masks)
          : crossEntropyLoss(logits, targets);
      const lossVal = lossTensor.item();
      lossTensor.backward();
      clipGradients(model.parameters(), 1.0);
      optimizer.step();
      scheduler.step();
      optimizer.zeroGrad();

      lossHistory.push(lossVal);
      if (lossVal < bestLoss) bestLoss = lossVal;
      epochSum += lossVal;
      epochN++;
      stepCount++;
    }
    const epochAvg = epochN > 0 ? epochSum / epochN : 0;
    if (epochs > REPRO_EPOCHS) {
      console.log(
        `  [T] epoch ${epoch + 1}/${epochs} step ${stepCount} loss ${epochAvg.toFixed(4)} best ${bestLoss.toFixed(4)} augSteps ${augSteps}`
      );
    }
  }

  const durationMs = Date.now() - t0;
  const { maxAbsParamDelta, meanAbsParamDelta } = paramDeltaStats(model, before);
  return {
    lossHistory,
    bestLoss,
    totalSteps: stepCount,
    augSteps,
    augWindows,
    augSkipped,
    s0Histogram,
    durationMs,
    maxAbsParamDelta,
    meanAbsParamDelta,
  };
}

// ============================================================
// Reload proof (loadCheckpoint must overwrite EVERY parameter)
// ============================================================
// Phase 95's contract, re-derived. `buildModel` does not reseed, so a
// freshly built model carries arbitrary init weights; a reload is only
// trustworthy if the checkpoint replaces all of them. Compared BY NAME so
// it cannot pass by a lucky ordering coincidence.

export interface ParamCompare {
  namesCompared: number;
  missingInModel: string[];
  lengthMismatches: string[];
  valueMismatches: string[];
  allMatch: boolean;
  maxAbsDelta: number;
}

export function compareModelToCheckpoint(
  model: TensorMiniMindModel,
  ckpt: CheckpointData
): ParamCompare {
  const byName = new Map<string, ArrayLike<number>>();
  for (const { name, parameter } of model.namedParameters()) {
    byName.set(name, parameter.data);
  }

  const missingInModel: string[] = [];
  const lengthMismatches: string[] = [];
  const valueMismatches: string[] = [];
  let namesCompared = 0;
  let maxAbsDelta = 0;

  for (const saved of ckpt.modelParams) {
    const live = byName.get(saved.name);
    if (!live) {
      missingInModel.push(saved.name);
      continue;
    }
    if (live.length !== saved.data.length) {
      lengthMismatches.push(`${saved.name}: model ${live.length} vs checkpoint ${saved.data.length}`);
      continue;
    }
    namesCompared++;
    let differs = false;
    for (let i = 0; i < live.length; i++) {
      const d = Math.abs(live[i] - saved.data[i]);
      if (d > maxAbsDelta) maxAbsDelta = d;
      if (d !== 0) differs = true;
    }
    if (differs) valueMismatches.push(saved.name);
  }

  return {
    namesCompared,
    missingInModel,
    lengthMismatches,
    valueMismatches,
    allMatch:
      missingInModel.length === 0 && lengthMismatches.length === 0 && valueMismatches.length === 0,
    maxAbsDelta,
  };
}

// ============================================================
// Rollout accuracy
// ============================================================
// Greedy argmax next-token accuracy against the ORIGINAL document at each
// step. Same algorithm as Phase 94 probe.ts:933, re-derived here (that
// helper is private to the Phase 94 harness and `experiments/phase94/**`
// must stay byte-identical). Re-deriving it is also a check in its own
// right: reproducing Phase 94's recorded rollout is only possible if the
// right weights were loaded.
//
// This is experiment measurement code, not a second production runtime.

export interface RolloutStep {
  step: number;
  correct: number;
  total: number;
  accuracy: number;
}

export function rolloutAccuracy(
  model: TensorMiniMindModel,
  tokenizer: BPETokenizer,
  corpus: string[],
  maxSamples: number,
  maxSteps: number
): { steps: RolloutStep[]; skippedTooLong: number } {
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
      const ctx = current.slice(-MAX_CTX);
      const input = Tensor.fromArray([ctx]);
      let nextId = 0;
      Tensor.noGrad(() => {
        const logitsArr = model.forward(input).toArray() as number[][][];
        const row = logitsArr[0][ctx.length - 1];
        let best = -Infinity;
        for (let v = 0; v < row.length; v++) {
          if (row[v] > best) {
            best = row[v];
            nextId = v;
          }
        }
      }, model.parameters());
      const entry = steps.get(step) ?? { correct: 0, total: 0 };
      entry.total++;
      if (nextId === ids[step]) entry.correct++;
      steps.set(step, entry);
      current.push(nextId);
    }
  }

  return {
    steps: [...steps.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([step, { correct, total }]) => ({
        step,
        correct,
        total,
        accuracy: total > 0 ? correct / total : 0,
      })),
    skippedTooLong,
  };
}

// ============================================================
// Loss helper + first-batch probe (used by `preflight`)
// ============================================================

export function cf(
  logits: Tensor,
  targets: number[][],
  masks?: number[][]
): Tensor {
  return masks !== undefined
    ? crossEntropyLoss(logits, targets, masks)
    : crossEntropyLoss(logits, targets);
}

export function firstBatchOf(trainLoader: DataLoader<TextSample>): {
  batch: TextSample[];
  inputIds: Tensor;
  targets: number[][];
  masks: number[][] | undefined;
} | null {
  for (const batch of trainLoader) {
    const collated = collateBatch(batch);
    return {
      batch,
      inputIds: collated.inputIds,
      targets: batch.map((s) => s.inputIds),
      masks: batch.every((s) => s.mask !== undefined)
        ? batch.map((s) => s.mask as number[])
        : undefined,
    };
  }
  return null;
}

// ============================================================
// Preflight — initialization ordering + augmentation shape
// ============================================================
// Proves (a) the treatment init is bit-identical to Phase 94 cell B by
// reproducing its recorded first-step loss, and (b) every drawn s0 is
// inside [AUG_S0_MIN, AUG_S0_MAX]. Reports, never absorbs.

export interface PreflightReport {
  firstStepLoss: number;
  phase94RecordedInitialLoss: number;
  initMatchesPhase94: boolean;
  modelParamCount: number;
  corpusDocs: number;
  eligibleDocs: number;
  s0DrawsInRange: boolean;
  s0DrawsObserved: number[];
  s0RangeObserved: { min: number; max: number };
  s0Histogram: Record<number, number>;
  /** Per-document effective s0 range, for the audit. */
  s0RangeDistribution: { window: string; docCount: number }[];
  pass: boolean;
}

export function preflight(opts: { drawCount?: number } = {}): PreflightReport {
  const drawCount = opts.drawCount ?? 64;

  // Exact Phase 94 ordering: tokenizer -> loader -> model.
  const corpus = loadCorpus();
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const aligned = buildLoader(tokenizer, corpus);
  const model = buildModel(tokenizer);
  const docTokenSeq = encodeDocuments(tokenizer, corpus);

  const first = firstBatchOf(aligned.trainLoader);
  if (!first) throw new Error("preflight: loader produced no batch");
  const firstStepLoss = cf(model.forward(first.inputIds), first.targets, first.masks).item();

  const eligible = eligibleDocIndices(docTokenSeq, AUG_K);

  // Draw several augmented batches and inspect every s0.
  const seen: number[] = [];
  const hist: Record<number, number> = {};
  for (let b = 0; b < drawCount / BATCH_SIZE; b++) {
    const aug = buildAugmentedBatch(model, docTokenSeq, eligible, AUG_K, BATCH_SIZE);
    for (const d of aug.draws) {
      seen.push(d.s0);
      hist[d.s0] = (hist[d.s0] ?? 0) + 1;
    }
  }

  const s0DrawsInRange = seen.length > 0 && seen.every((s) => s >= AUG_S0_MIN && s <= AUG_S0_MAX);

  // For each eligible doc, which s0 values are actually reachable?
  const histRange: Record<string, number> = {};
  for (const idx of eligible) {
    const { lo, hi } = s0RangeFor(docTokenSeq[idx].length, AUG_K);
    const key = `${lo}..${hi}`;
    histRange[key] = (histRange[key] ?? 0) + 1;
  }

  const initMatchesPhase94 = firstStepLoss === PHASE94_INITIAL_LOSS;
  const pass = initMatchesPhase94 && s0DrawsInRange;

  return {
    firstStepLoss,
    phase94RecordedInitialLoss: PHASE94_INITIAL_LOSS,
    initMatchesPhase94,
    modelParamCount: model.totalParamCount,
    corpusDocs: corpus.length,
    eligibleDocs: eligible.length,
    s0DrawsInRange,
    s0DrawsObserved: seen,
    s0RangeObserved: {
      min: seen.length ? Math.min(...seen) : -1,
      max: seen.length ? Math.max(...seen) : -1,
    },
    s0Histogram: hist,
    s0RangeDistribution: Object.entries(histRange)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([window, docCount]) => ({ window, docCount })),
    pass,
  };
}

// ============================================================
// Evaluation — the UNCHANGED Phase-95 evaluator
// ============================================================

export interface ArmSpec {
  key: string;
  label: string;
  k: number;
  checkpointPath: string;
  /** Optional recorded artifact to cross-check the reload against. */
  recordedResultPath: string | null;
  trainedByThisPhase: boolean;
  training: Record<string, unknown>;
}

/** Tolerant view of an evaluation report (mirrors Phase 95's summary). */
function tolerantSummary(report: GenerationEvaluationReport) {
  const byLanguage = aggregateGenerationSamples(report.samples);
  const pick = (lang: LanguageClass) => ({
    strictValidUtf8Ratio: byLanguage[lang].strictValidUtf8Ratio,
    validUtf8TolerantRatio: byLanguage[lang].validUtf8TolerantRatio,
    charIntegrityRate: byLanguage[lang].charIntegrityRate,
    tokensToFirstInvalidMin: byLanguage[lang].tokensToFirstInvalidMin,
    tokensToFirstInvalidMean: byLanguage[lang].tokensToFirstInvalidMean,
    invalidSampleCount: byLanguage[lang].invalidSampleCount,
    trailingIncompleteCount: byLanguage[lang].trailingIncompleteCount,
  });
  return {
    byLanguage: { zh: pick("zh"), en: pick("en"), mixed: pick("mixed") },
    sampleInvalidCount: report.samples.filter((s) => s.tokensToFirstInvalid !== -1).length,
    sampleCount: report.samples.length,
  };
}

export function evaluateArm(
  arm: ArmSpec,
  corpus: string[],
  datasetSamples: { text: string; language: string }[]
): Record<string, unknown> {
  console.log(`\n=== arm ${arm.key} (k=${arm.k}) — ${arm.label} ===`);

  const out: Record<string, unknown> = {
    key: arm.key,
    label: arm.label,
    k: arm.k,
    trainedByThisPhase: arm.trainedByThisPhase,
    training: arm.training,
  };

  // ── artifact availability: report, never fabricate ──
  const ckptExists = fs.existsSync(arm.checkpointPath);
  out.checkpoint = {
    path: arm.checkpointPath,
    exists: ckptExists,
    sizeBytes: ckptExists ? fs.statSync(arm.checkpointPath).size : 0,
    readOnly: true,
  };
  if (!ckptExists) {
    console.log(`  checkpoint ABSENT — reported as unavailable, no result fabricated`);
    out.unavailable = true;
    out.unavailableReason = `checkpoint not found at ${arm.checkpointPath}`;
    return out;
  }

  const recorded: Record<string, unknown> | null =
    arm.recordedResultPath && fs.existsSync(arm.recordedResultPath)
      ? (JSON.parse(fs.readFileSync(arm.recordedResultPath, "utf8")) as Record<string, unknown>)
      : null;

  // ── load through the audited production path ──
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const ckpt = JSON.parse(fs.readFileSync(arm.checkpointPath, "utf8")) as CheckpointData;
  const model = buildModel(tokenizer);
  const optimizer = new AdamWOptimizer(model.parameters(), { lr: LR, weightDecay: WD });
  loadCheckpoint({ model, optimizer, checkpoint: ckpt });

  const paramCompare = compareModelToCheckpoint(model, ckpt);
  console.log(
    `  reload proof: ${paramCompare.namesCompared} named params compared | allMatch ${paramCompare.allMatch} | maxAbsDelta ${paramCompare.maxAbsDelta}`
  );

  // ── integrity contract ──
  const expectedParamCount = config.PRODUCTION_PARAMS;
  let actualParamCount = 0;
  let nanCount = 0;
  let infinityCount = 0;
  for (const p of model.parameters()) {
    actualParamCount += p.data.length;
    for (let i = 0; i < p.data.length; i++) {
      if (Number.isNaN(p.data[i])) nanCount++;
      if (!Number.isFinite(p.data[i])) infinityCount++;
    }
  }
  out.integrity = {
    expectedParamCount,
    actualParamCount,
    paramCountMatches: actualParamCount === expectedParamCount,
    nanCount,
    infinityCount,
    finite: nanCount === 0 && infinityCount === 0,
    parameterOverwriteProven: paramCompare.allMatch,
    reload: paramCompare,
  };
  console.log(
    `  integrity: params ${actualParamCount}/${expectedParamCount} | match ${actualParamCount === expectedParamCount} | finite ${nanCount === 0 && infinityCount === 0}`
  );

  // ── the gate evaluation: ONE pass, unmodified production config ──
  const genEval = evaluateGeneration(model, tokenizer, GEN_EVAL_PROMPTS, {
    maxTokens: MAX_TOKENS,
    temperature: 0.8,
    seed: SEED,
  });

  // ── determinism of evaluating a SAVED checkpoint ──
  const genEvalRepeat = evaluateGeneration(model, tokenizer, GEN_EVAL_PROMPTS, {
    maxTokens: MAX_TOKENS,
    temperature: 0.8,
    seed: SEED,
  });
  const evaluationDeterministic = genEval.samples.every(
    (s, i) => s.continuation === genEvalRepeat.samples[i].continuation
  );
  console.log(`  evaluation deterministic on re-run: ${evaluationDeterministic}`);

  const agg = genEval.byLanguage;

  const memorization = measureMemorization(model, tokenizer, corpus, 8);
  const roundTrip = evaluateTokenizerRoundTrip(
    tokenizer,
    datasetSamples.map((s) => ({
      prompt: s.text,
      language: s.language as CapabilityPrompt["language"],
    }))
  );

  // ── BOTH Level-4 verdicts from the ONE gate implementation ──
  const evidenceStrict = buildEvidence({
    pipelineRuns: true,
    lossDecreases: true,
    paramsChange: true,
    roundTrip,
    memorization,
    generation: genEval,
    utf8Gate: "strict",
  });
  const evidenceTolerant = buildEvidence({
    pipelineRuns: true,
    lossDecreases: true,
    paramsChange: true,
    roundTrip,
    memorization,
    generation: genEval,
    utf8Gate: "tolerant",
  });
  const levelStrict = deriveCapabilityLevel(evidenceStrict);
  const levelTolerant = deriveCapabilityLevel(evidenceTolerant);

  out.historical = {
    strictValidUtf8Ratio: {
      zh: agg.zh.strictValidUtf8Ratio,
      en: agg.en.strictValidUtf8Ratio,
      mixed: agg.mixed.strictValidUtf8Ratio,
    },
    nonEmptyRatio: {
      zh: agg.zh.nonEmptyRatio,
      en: agg.en.nonEmptyRatio,
      mixed: agg.mixed.nonEmptyRatio,
    },
    collapsedRatio: {
      zh: agg.zh.collapsedRatio,
      en: agg.en.collapsedRatio,
      mixed: agg.mixed.collapsedRatio,
    },
    mergedTokenRatio: {
      zh: agg.zh.mergedTokenRatio,
      en: agg.en.mergedTokenRatio,
      mixed: agg.mixed.mergedTokenRatio,
    },
    cjkRatio: { zh: agg.zh.cjkRatio, en: agg.en.cjkRatio, mixed: agg.mixed.cjkRatio },
    memorizationTop1: memorization.top1Accuracy,
    memorizationPredictions: memorization.predictions,
    memorizationChance: memorization.chance,
    memorizationExceedsChance: memorization.exceedsChance,
    level: levelStrict.highestLevel,
    levelText: `Level ${levelStrict.highestLevel}`,
    note: "DIAGNOSTIC ONLY — never the primary capability decision",
  };

  out.repaired = {
    validUtf8TolerantRatio: {
      zh: agg.zh.validUtf8TolerantRatio,
      en: agg.en.validUtf8TolerantRatio,
      mixed: agg.mixed.validUtf8TolerantRatio,
    },
    charIntegrityRate: {
      zh: agg.zh.charIntegrityRate,
      en: agg.en.charIntegrityRate,
      mixed: agg.mixed.charIntegrityRate,
    },
    charIntegrityRateMin: {
      zh: agg.zh.charIntegrityRateMin,
      en: agg.en.charIntegrityRateMin,
      mixed: agg.mixed.charIntegrityRateMin,
    },
    charIntegrityNumerator: {
      zh: agg.zh.charIntegrityNumerator,
      en: agg.en.charIntegrityNumerator,
      mixed: agg.mixed.charIntegrityNumerator,
    },
    charIntegrityDenominator: {
      zh: agg.zh.charIntegrityDenominator,
      en: agg.en.charIntegrityDenominator,
      mixed: agg.mixed.charIntegrityDenominator,
    },
    tokensToFirstInvalidMin: {
      zh: agg.zh.tokensToFirstInvalidMin,
      en: agg.en.tokensToFirstInvalidMin,
      mixed: agg.mixed.tokensToFirstInvalidMin,
    },
    tokensToFirstInvalidMean: {
      zh: agg.zh.tokensToFirstInvalidMean,
      en: agg.en.tokensToFirstInvalidMean,
      mixed: agg.mixed.tokensToFirstInvalidMean,
    },
    invalidSampleCount: {
      zh: agg.zh.invalidSampleCount,
      en: agg.en.invalidSampleCount,
      mixed: agg.mixed.invalidSampleCount,
    },
    trailingIncompleteCount: {
      zh: agg.zh.trailingIncompleteCount,
      en: agg.en.trailingIncompleteCount,
      mixed: agg.mixed.trailingIncompleteCount,
    },
    evaluationDeterministic,
    level: levelTolerant.highestLevel,
    levelText: `Level ${levelTolerant.highestLevel}`,
    levels: levelTolerant.levels,
    evidence: evidenceTolerant,
    reportText: formatCapabilityReport(levelTolerant),
  };

  out.roundTrip = roundTrip;
  out.samples = genEval.samples.map((s) => ({
    prompt: s.prompt,
    language: s.language,
    continuation: s.continuation,
    generatedIds: s.generatedIds,
    tokenCount: s.tokenCount,
    strictValidUtf8: s.validUtf8,
    validUtf8Tolerant: s.validUtf8Tolerant,
    tokensToFirstInvalid: s.tokensToFirstInvalid,
    trailingIncomplete: s.trailingIncomplete,
    charIntegrityRate: s.charIntegrityRate,
    usesMergedTokens: s.usesMergedTokens,
  }));

  // ── greedy mode (temperature 0) ──
  const greedy = evaluateGeneration(model, tokenizer, GEN_EVAL_PROMPTS, {
    maxTokens: MAX_TOKENS,
    temperature: 0,
    seed: SEED,
  });
  out.greedy = {
    repairedTolerant: tolerantSummary(greedy),
    samples: greedy.samples.map((s) => ({
      prompt: s.prompt,
      language: s.language,
      continuation: s.continuation,
      strictValidUtf8: s.validUtf8,
      validUtf8Tolerant: s.validUtf8Tolerant,
      tokensToFirstInvalid: s.tokensToFirstInvalid,
      charIntegrityRate: s.charIntegrityRate,
    })),
  };

  // ── rollout@24 ──
  const rollout = rolloutAccuracy(model, tokenizer, corpus, 60, MAX_TOKENS);
  const byStep = rollout.steps;
  const rolloutMean =
    byStep.length > 0 ? byStep.reduce((a, s) => a + s.accuracy, 0) / byStep.length : 0;
  out.rollout = {
    ...rollout,
    meanAccuracy24: rolloutMean,
    accuracyAtStep24: byStep.find((s) => s.step === MAX_TOKENS)?.accuracy ?? null,
  };
  console.log(`  rollout mean accuracy (24 steps): ${rolloutMean.toFixed(4)}`);

  console.log(`  Level-4 verdict — tolerant: Level ${levelTolerant.highestLevel}`);
  console.log(
    `  tolerant UTF-8 zh/en/mixed: ${agg.zh.validUtf8TolerantRatio} / ${agg.en.validUtf8TolerantRatio} / ${agg.mixed.validUtf8TolerantRatio}`
  );
  console.log(
    `  charIntegrityRate zh/en/mixed: ${agg.zh.charIntegrityRate.toFixed(4)} / ${agg.en.charIntegrityRate.toFixed(4)} / ${agg.mixed.charIntegrityRate.toFixed(4)}`
  );

  if (recorded) {
    // Cross-check only — reported, never absorbed.
    const rec = recorded as { gates?: { level?: number }; training?: { finalLoss?: number } };
    out.crossCheck = {
      recordedPath: arm.recordedResultPath,
      recordedLevel: rec.gates?.level ?? null,
      observedLevel: levelTolerant.highestLevel,
      recordedFinalLoss: rec.training?.finalLoss ?? null,
    };
  }

  return out;
}

// ============================================================
// Smoke — does the training path actually run?
// ============================================================
// Runs 8 optimizer steps, including 2 AUGMENTED steps (index 3 and 7 with
// R=4), and checks the loss is finite and the first step reproduces Phase
// 94's init. Writes NO checkpoint and contributes NO reported metric. Its
// only job is to fail fast instead of 3 hours into the official run.

function stageSmoke(): void {
  console.log("=".repeat(64));
  console.log("Phase 96 — smoke test (NOT part of the reported result)");
  console.log("=".repeat(64));

  const corpus = loadCorpus();
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const aligned = buildLoader(tokenizer, corpus);
  const docTokenSeq = encodeDocuments(tokenizer, corpus);
  const eligible = eligibleDocIndices(docTokenSeq, AUG_K);
  const model = buildModel(tokenizer);

  const optimizer = new AdamWOptimizer(model.parameters(), { lr: LR, weightDecay: WD });
  const batchesPerEpoch = aligned.trainLoader.numBatches;
  const scheduler = new CosineScheduler(optimizer, {
    baseLR: LR,
    minLR: LR * 0.01,
    warmupSteps: Math.floor(EPOCHS * batchesPerEpoch * 0.1),
    totalSteps: EPOCHS * batchesPerEpoch,
  });

  const losses: { step: number; augmented: boolean; loss: number; ownLen: number | null }[] = [];
  let stepCount = 0;
  outer: for (let epoch = 0; epoch < EPOCHS; epoch++) {
    for (const batch of aligned.trainLoader) {
      let inputIds: Tensor;
      let targets: number[][];
      let masks: number[][] | undefined;
      let ownLen: number | null = null;
      const isAug = stepCount % AUG_R === AUG_R - 1;
      if (isAug) {
        const aug = buildAugmentedBatch(model, docTokenSeq, eligible, AUG_K, batch.length);
        inputIds = Tensor.fromArray(aug.inputIds);
        targets = aug.targets;
        masks = aug.masks;
        ownLen = aug.draws[0]?.ownLen ?? null;
      } else {
        const collated = collateBatch(batch);
        inputIds = collated.inputIds;
        targets = batch.map((s) => s.inputIds);
        masks = batch.every((s) => s.mask !== undefined)
          ? batch.map((s) => s.mask as number[])
          : undefined;
      }
      const logits = model.forward(inputIds);
      const lossTensor =
        masks !== undefined
          ? crossEntropyLoss(logits, targets, masks)
          : crossEntropyLoss(logits, targets);
      const lossVal = lossTensor.item();
      lossTensor.backward();
      clipGradients(model.parameters(), 1.0);
      optimizer.step();
      scheduler.step();
      optimizer.zeroGrad();

      losses.push({ step: stepCount, augmented: isAug, loss: lossVal, ownLen });
      stepCount++;
      if (stepCount >= 8) break outer;
    }
  }

  for (const l of losses) {
    console.log(
      `  step ${l.step} ${l.augmented ? "AUGMENTED" : "plain    "} loss ${l.loss.toFixed(6)}${l.ownLen !== null ? ` ownLen ${l.ownLen}` : ""}`
    );
  }

  const expectedAug = Math.floor(8 / AUG_R);
  const allFinite = losses.every((l) => Number.isFinite(l.loss));
  const augmentedSteps = losses.filter((l) => l.augmented).length;
  const firstLossMatches = losses.length > 0 && losses[0].loss === PHASE94_INITIAL_LOSS;

  console.log("");
  console.log(`  every loss finite             : ${allFinite}`);
  console.log(`  augmented steps exercised     : ${augmentedSteps} (expected ${expectedAug})`);
  console.log(`  first step reproduces Phase 94: ${firstLossMatches}`);
  const pass = allFinite && augmentedSteps === expectedAug && firstLossMatches;
  console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
  if (!pass) process.exitCode = 1;
}

// ============================================================
// Training stage
// ============================================================

function runTreatmentTraining(corpus: string[], docTokenSeq: number[][]): Record<string, unknown> {
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const aligned = buildLoader(tokenizer, corpus);
  const eligible = eligibleDocIndices(docTokenSeq, AUG_K);
  const windows = aligned.textDataset.length();
  const batchesPerEpoch = aligned.trainLoader.numBatches;

  const predictedAugSteps = Math.floor(EPOCHS * batchesPerEpoch / AUG_R);
  console.log(`aligned windows: ${windows} | batches/epoch: ${batchesPerEpoch}`);
  console.log(
    `eligible docs (k=${AUG_K}, s0 in [${AUG_S0_MIN},${AUG_S0_MAX}]): ${eligible.length}/${docTokenSeq.length}`
  );
  console.log(`predicted augmented steps: ${predictedAugSteps}`);

  // ── determinism check: 2 x fresh 2-epoch runs (Phase 90/94 convention) ──
  console.log("\n-- reproducibility: 2 x fresh 2-epoch runs --");
  const reproLosses: number[][] = [];
  for (let r = 0; r < 2; r++) {
    Random.setSeed(SEED);
    const m = buildModel(tokenizer);
    const stats = runAugmentedTraining(m, aligned.trainLoader, docTokenSeq, eligible, AUG_K, REPRO_EPOCHS);
    reproLosses.push(stats.lossHistory);
  }
  const reproIdentical =
    reproLosses[0].length === reproLosses[1].length &&
    reproLosses[0].every((v, i) => v === reproLosses[1][i]);
  console.log(`  two 2-epoch runs bit-identical: ${reproIdentical} (${reproLosses[0].length} steps each)`);

  // ── the official run ──
  console.log(`\n-- official training: ${EPOCHS} epochs --`);
  Random.setSeed(SEED);
  const model = buildModel(tokenizer);
  const stats = runAugmentedTraining(model, aligned.trainLoader, docTokenSeq, eligible, AUG_K, EPOCHS);

  // Checkpoint is written ONLY after training completes.
  const optimizer = new AdamWOptimizer(model.parameters(), { lr: LR, weightDecay: WD });
  const scheduler = new CosineScheduler(optimizer, {
    baseLR: LR,
    minLR: LR * 0.01,
    warmupSteps: Math.floor(EPOCHS * batchesPerEpoch * 0.1),
    totalSteps: EPOCHS * batchesPerEpoch,
  });
  const trainerState: TrainingStateSnapshot = {
    epoch: EPOCHS,
    globalStep: stats.totalSteps,
    totalBatches: stats.totalSteps,
    currentBatch: 0,
    lossHistory: stats.lossHistory,
    bestLoss: stats.bestLoss,
    bestEpoch: 0,
    bestGlobalStep: 0,
    evalHistory: [],
    completed: true,
    randomState: Random.saveState(),
    dataloaderState: null,
    streamingDataloaderState: null,
  };
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    TREATMENT_CKPT,
    JSON.stringify(saveCheckpoint({ model, optimizer, scheduler, trainerState })),
    "utf8"
  );
  console.log(`checkpoint written: ${path.basename(TREATMENT_CKPT)}`);

  return {
    trained: true,
    source: `fresh augmented training in phase96/probe.ts (R=${AUG_R}, k=${AUG_K}, s0 in [${AUG_S0_MIN},${AUG_S0_MAX}])`,
    initialLoss: stats.lossHistory[0],
    finalLoss: stats.lossHistory[stats.lossHistory.length - 1],
    bestLoss: stats.bestLoss,
    totalSteps: stats.totalSteps,
    durationMs: stats.durationMs,
    maxAbsParamDelta: stats.maxAbsParamDelta,
    meanAbsParamDelta: stats.meanAbsParamDelta,
    windows,
    batchesPerEpoch,
    augSteps: stats.augSteps,
    augWindows: stats.augWindows,
    augSkipped: stats.augSkipped,
    augR: AUG_R,
    augK: AUG_K,
    augS0Min: AUG_S0_MIN,
    augS0Max: AUG_S0_MAX,
    predictedAugSteps,
    augStepsMatchPrediction: stats.augSteps === predictedAugSteps,
    s0Histogram: stats.s0Histogram,
    checkpointPath: TREATMENT_CKPT,
    reproducibility: {
      identical: reproIdentical,
      reproEpochs: REPRO_EPOCHS,
      steps: reproLosses[0].length,
      lossHistory: reproLosses[0],
      source: "2 x fresh 2-epoch runs with Random.setSeed(42) reset before each",
    },
    fakeTraining: false,
  };
}

// ============================================================
// Stage: preflight
// ============================================================

function stagePreflight(): void {
  console.log("=".repeat(64));
  console.log("Phase 96 — preflight: initialization ordering + s0 shape");
  console.log("=".repeat(64));

  const r = preflight({ drawCount: 128 });

  console.log(`model params         : ${r.modelParamCount.toLocaleString()}`);
  console.log(`corpus docs          : ${r.corpusDocs}`);
  console.log(`eligible docs (k=8)  : ${r.eligibleDocs}/${r.corpusDocs}`);
  console.log(`first-step loss      : ${r.firstStepLoss}`);
  console.log(`Phase 94 recorded    : ${r.phase94RecordedInitialLoss}`);
  console.log(`init matches Phase 94: ${r.initMatchesPhase94 ? "YES" : "NO"}`);
  console.log(
    `s0 draws (${r.s0DrawsObserved.length})     : [${r.s0DrawsObserved.join(", ")}]`
  );
  console.log(`s0 all in [${AUG_S0_MIN},${AUG_S0_MAX}]   : ${r.s0DrawsInRange ? "YES" : "NO"}`);
  console.log(`s0 histogram         : ${JSON.stringify(r.s0Histogram)}`);
  console.log("reachable s0 range per eligible doc:");
  for (const d of r.s0RangeDistribution) {
    console.log(`  ${d.window.padEnd(8)} : ${d.docCount} docs`);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "preflight.json"),
    JSON.stringify({ phase: "phase96", ...r }, null, 2),
    "utf8"
  );
  console.log(`\npreflight written: preflight.json`);
  console.log(r.pass ? "PREFLIGHT PASS" : "PREFLIGHT FAIL");
  if (!r.pass) process.exitCode = 1;
}

// ============================================================
// Stage: train
// ============================================================

function stageTrain(): void {
  console.log("=".repeat(64));
  console.log("Phase 96 — treatment arm training");
  console.log("=".repeat(64));

  const dataset: LoadedDataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  const base = computeBaseStatistics(dataset);
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const docTokenSeq = encodeDocuments(tokenizer, corpus);
  const totalTokens = docTokenSeq.reduce((a, d) => a + d.length, 0);

  console.log("dataset:", dataset.metadata.id, dataset.metadata.version, "| docs", dataset.samples.length);
  console.log("language counts:", JSON.stringify(base.languageCounts));
  console.log("tokenizer vocabSize:", tokenizer.vocabSize, "| corpus tokens:", totalTokens);
  console.log(
    `recipe: blockSize ${BLOCK_SIZE} epochs ${EPOCHS} batch ${BATCH_SIZE} seed ${SEED} augR ${AUG_R} k ${AUG_K} s0 [${AUG_S0_MIN},${AUG_S0_MAX}]`
  );

  const treatment = runTreatmentTraining(corpus, docTokenSeq);

  const out = {
    phase: "phase96",
    stage: "train",
    dataset: {
      id: dataset.metadata.id,
      version: dataset.metadata.version,
      docs: dataset.samples.length,
      languageCounts: base.languageCounts,
      corpusTokens: totalTokens,
      vocabSize: tokenizer.vocabSize,
    },
    treatment,
    trainingCompleted: true,
  };
  fs.writeFileSync(path.join(OUT_DIR, "training-result.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("\ntraining result written: training-result.json");
}

// ============================================================
// Stage: eval
// ============================================================

function stageEval(): void {
  console.log("=".repeat(64));
  console.log("Phase 96 — evaluation (Phase-95 evaluator, UNCHANGED)");
  console.log("=".repeat(64));

  const dataset: LoadedDataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  const datasetSamples = dataset.samples.map((s) => ({ text: s.text, language: s.language }));

  // Baseline training provenance comes from the Phase 90 condition-B record.
  const baselineRecorded = fs.existsSync(BASELINE_RESULT)
    ? (JSON.parse(fs.readFileSync(BASELINE_RESULT, "utf8")) as {
        training?: Record<string, unknown>;
      })
    : null;
  const baselineTraining = {
    trained: false,
    source: "experiments/phase90/phase90-aligned.ckpt.json (Phase 90 condition B)",
    ...(baselineRecorded?.training ?? {}),
    augSteps: null,
    augK: null,
    augmentated: false,
  };

  let treatmentTraining: Record<string, unknown> = {
    trained: false,
    source: "training-result.json NOT FOUND — treatment arm was not trained in this workspace",
  };
  const trainResultPath = path.join(OUT_DIR, "training-result.json");
  if (fs.existsSync(trainResultPath)) {
    const tr = JSON.parse(fs.readFileSync(trainResultPath, "utf8")) as {
      treatment?: Record<string, unknown>;
    };
    if (tr.treatment) treatmentTraining = tr.treatment;
  }

  const arms: ArmSpec[] = [
    {
      key: "A",
      label: "baseline (k=0, no augmentation, reused Phase 90 artifact)",
      k: 0,
      checkpointPath: BASELINE_CKPT,
      recordedResultPath: BASELINE_RESULT,
      trainedByThisPhase: false,
      training: baselineTraining,
    },
    {
      key: "T",
      label: `treatment (k=${AUG_K}, s0 in [${AUG_S0_MIN},${AUG_S0_MAX}], trained by this phase)`,
      k: AUG_K,
      checkpointPath: TREATMENT_CKPT,
      recordedResultPath: null,
      trainedByThisPhase: true,
      training: treatmentTraining,
    },
    {
      key: "B94",
      label: "Phase 94 cell B (k=8, s0 in [8,63-k]) — historical reference, NOT retrained",
      k: 8,
      checkpointPath: P94_TREATMENT_CKPT,
      recordedResultPath: P94_TREATMENT_RESULT,
      trainedByThisPhase: false,
      training: {
        trained: false,
        source: "experiments/phase94/phase94-b.ckpt.json (Phase 94 cell B, fresh k=8 run)",
        augmentated: true,
        augK: 8,
        augS0Min: PHASE94_S0_MIN,
      },
    },
  ];

  const results: Record<string, Record<string, unknown>> = {};
  for (const arm of arms) {
    const r = evaluateArm(arm, corpus, datasetSamples);
    results[arm.key] = r;
    fs.writeFileSync(path.join(OUT_DIR, `arm-${arm.key}.json`), JSON.stringify(r, null, 2), "utf8");
    console.log(`arm ${arm.key} result written: arm-${arm.key}.json`);
  }

  // ── comparison ──
  const pick = (key: string, pathExpr: (r: Record<string, unknown>) => unknown) => {
    const r = results[key];
    return r && !r.unavailable ? pathExpr(r) : null;
  };
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

  const comparison = {
    primary: {
      endpoint: "Phase-95 repaired capability level (tolerant UTF-8 gate)",
      baselineLevel: pick("A", (r) => (r.repaired as { level: number }).level),
      treatmentLevel: pick("T", (r) => (r.repaired as { level: number }).level),
      historicalB94Level: pick("B94", (r) => (r.repaired as { level: number }).level),
      levelChanged: false as boolean,
    },
    secondaryContinuous: {
      charIntegrityRate: {
        baseline: pick("A", (r) => (r.repaired as { charIntegrityRate: unknown }).charIntegrityRate),
        treatment: pick("T", (r) => (r.repaired as { charIntegrityRate: unknown }).charIntegrityRate),
        historicalB94: pick("B94", (r) => (r.repaired as { charIntegrityRate: unknown }).charIntegrityRate),
      },
      tokensToFirstInvalidMean: {
        baseline: pick("A", (r) => (r.repaired as { tokensToFirstInvalidMean: unknown }).tokensToFirstInvalidMean),
        treatment: pick("T", (r) => (r.repaired as { tokensToFirstInvalidMean: unknown }).tokensToFirstInvalidMean),
        historicalB94: pick("B94", (r) => (r.repaired as { tokensToFirstInvalidMean: unknown }).tokensToFirstInvalidMean),
      },
      rolloutMeanAccuracy24: {
        baseline: pick("A", (r) => (r.rollout as { meanAccuracy24: number }).meanAccuracy24),
        treatment: pick("T", (r) => (r.rollout as { meanAccuracy24: number }).meanAccuracy24),
        historicalB94: pick("B94", (r) => (r.rollout as { meanAccuracy24: number }).meanAccuracy24),
      },
      memorizationTop1: {
        baseline: pick("A", (r) => (r.historical as { memorizationTop1: number }).memorizationTop1),
        treatment: pick("T", (r) => (r.historical as { memorizationTop1: number }).memorizationTop1),
        historicalB94: pick("B94", (r) => (r.historical as { memorizationTop1: number }).memorizationTop1),
      },
    },
    diagnostic: {
      strictValidUtf8Ratio: {
        baseline: pick("A", (r) => (r.historical as { strictValidUtf8Ratio: unknown }).strictValidUtf8Ratio),
        treatment: pick("T", (r) => (r.historical as { strictValidUtf8Ratio: unknown }).strictValidUtf8Ratio),
        historicalB94: pick("B94", (r) => (r.historical as { strictValidUtf8Ratio: unknown }).strictValidUtf8Ratio),
      },
    },
    isolation: {
      note: "T vs B94 differs ONLY in the s0 range (8..63-k -> 1..5), so any gap here is attributable to the prompt-regime match and nothing else.",
      s0Range: { B94: `[${PHASE94_S0_MIN}, 63-k]`, T: `[${AUG_S0_MIN}, ${AUG_S0_MAX}]` },
    },
  };
  comparison.primary.levelChanged =
    num(comparison.primary.baselineLevel) !== null &&
    num(comparison.primary.treatmentLevel) !== null &&
    comparison.primary.baselineLevel !== comparison.primary.treatmentLevel;

  const full = {
    phase: "phase96",
    question:
      "Does targeted augmentation with k=8 and s0 in [1,5] — matched to the 2-5 token evaluation prompts — improve generation capability on the repaired Phase-95 endpoint?",
    recipe: {
      dataset: dataset.metadata.id,
      datasetVersion: dataset.metadata.version,
      docs: dataset.samples.length,
      blockSize: BLOCK_SIZE,
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      seed: SEED,
      optimizer: "AdamW(lr=0.001,wd=0.01)",
      scheduler: "Cosine(10% warmup -> 1% min)",
      gradClip: 1.0,
      layout: "document-aligned (Phase 90)",
      objective: "masked corrected 1-step causal (Phase 89/90) + own-context augmentation (R=4)",
      augK: AUG_K,
      augS0Min: AUG_S0_MIN,
      augS0Max: AUG_S0_MAX,
      maxTokens: MAX_TOKENS,
      temperature: 0.8,
      evaluator: "phase95-tolerant-utf8 (unchanged)",
    },
    arms: arms.map((a) => ({
      key: a.key,
      label: a.label,
      k: a.k,
      checkpoint: a.checkpointPath,
      trainedByThisPhase: a.trainedByThisPhase,
    })),
    results,
    comparison,
    fakeDataAudit: {
      mathRandomInMetrics: false,
      setTimeoutFakeTraining: false,
      hardcodedFakeMetrics: false,
      fabricatedCheckpoint: false,
      evaluatorModified: false,
      tokenizerModified: false,
      modelArchitectureModified: false,
      promptSetModified: false,
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, "probe-results.json"), JSON.stringify(full, null, 2), "utf8");
  console.log("\nresults written: probe-results.json");
}

// ============================================================
// main
// ============================================================

function main(): void {
  const stageArg = process.argv.find((a) => a.startsWith("--stage="));
  const stage = stageArg ? stageArg.slice("--stage=".length) : "all";

  console.log("Phase 96 — augmentation transfer experiment");
  console.log(`stage: ${stage}`);
  console.log(
    `single variable: augmentation (k=${AUG_K}, s0 in [${AUG_S0_MIN},${AUG_S0_MAX}]) vs the Phase 90 baseline`
  );

  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`manifest missing at ${MANIFEST_PATH} — provenance record is required`);
  }

  switch (stage) {
    case "smoke":
      stageSmoke();
      break;
    case "preflight":
      stagePreflight();
      break;
    case "train":
      stageTrain();
      break;
    case "eval":
      stageEval();
      break;
    case "all":
      stagePreflight();
      stageTrain();
      stageEval();
      break;
    default:
      throw new Error(`unknown --stage=${stage} (expected smoke|preflight|train|eval|all)`);
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main();
}
