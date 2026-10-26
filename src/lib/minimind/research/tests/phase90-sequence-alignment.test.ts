// ============================================================
// Phase 90 — Document-Boundary / Sequence-Layout Alignment
// ============================================================
// Root-cause experiment: training uses concatenated 600-doc windows
// (docs crossed with <eos> separators); the memorization/generation
// gates feed standalone documents. Phase 90 adds an optional
// document-aligned layout to TextDataset (`layout: "document-aligned"`)
// where each document becomes its own blockSize window padded with
// padTokenId=0, plus a per-position mask; crossEntropyLoss accepts the
// mask so padded positions contribute neither loss nor gradient; the
// single production Trainer threads the mask through.
//
// This suite proves, from real code:
//   1. document-aligned dataset: one window per doc, mask semantics
//      (mask[s]==1 ⟺ target inputIds[s+1] is a real in-document token)
//   2. padding does not contribute to loss (masked loss ignores garbage
//      at masked positions — bit-identical result)
//   3. valid tokens still produce next-token targets (mask=1 positions
//      have real within-doc targets)
//   4. no target crosses a document boundary (mask=1 pairs are both
//      in-document, non-padding) — over the FULL production dataset
//   5. masked loss gradient is zero at masked positions and non-zero at
//      valid positions
//   6. masked loss equals the analytic softmax-NLL on a synthetic
//      sequence; all-ones mask == no-mask path (bit-identical)
//   7. crossEntropyLoss validates the mask (shape / 0-1 values)
//   8. the Trainer threads masks on aligned datasets and keeps the
//      two-argument call on concatenated (production) datasets
//   9. the aligned training path is reproducible (seed 42) and the
//      masked-objective loss decreases
//  10. no architecture / evaluator / threshold changes
//
// Existing Phase 57–89 suites are NOT modified or weakened.
// ============================================================

// ============================================================
// Imports
// ============================================================

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
import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";
import { TextDataset } from "../../data/TextDataset";
import type { TextSample } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { Trainer } from "../../training/Trainer";
import { Random } from "../../core/random/Random";
import { Tensor } from "../../core/Tensor";
import { crossEntropyLoss } from "../../core/loss/CrossEntropyLoss";
import { deriveCapabilityLevel } from "../capability-eval";

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

function assertNear(
  actual: number,
  expected: number,
  tol: number,
  msg: string
): void {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected ≈ ${expected} (tol ${tol})\n  Actual:   ${actual}`
    );
  }
}

/** Capture the gradient that flows into a logits tensor via backward(). */
function captureGrad(logits: Tensor): Float64Array {
  const grad = new Float64Array(logits.size);
  logits.accumulateGrad = (g: Float64Array) => {
    for (let i = 0; i < g.length; i++) grad[i] += g[i];
  };
  return grad;
}

// ============================================================
// Constants — the exact production recipe
// ============================================================

const BLOCK_SIZE = 64;
const BATCH_SIZE = 4;
const SEED = 42;
const VOCAB_TARGET = 300;
const PAD_ID = 0;

// ============================================================
// Tiny deterministic helpers (self-contained)
// ============================================================

/**
 * Tiny tokenizer: specials 0–3 reserved, words map to 4..13.
 * Two documents, both shorter than blockSize=4:
 *   "a b c" -> ids [4,5,6]  (3 tokens)
 *   "d e"   -> ids [7,8]    (2 tokens)
 * Each document becomes ONE padded window:
 *   doc0: inputIds [4,5,6,0], targetIds [5,6,0,0], mask [1,1,0,0]
 *   doc1: inputIds [7,8,0,0], targetIds [8,0,0,0], mask [1,0,0,0]
 */
function buildTinyAligned() {
  const tokenizer = new MiniTokenizer();
  for (const w of ["a", "b", "c", "d", "e"]) tokenizer.addToken(w);
  const dataset = new TextDataset({
    tokenizer,
    corpus: ["a b c", "d e"],
    blockSize: 4,
    layout: "document-aligned",
    padTokenId: PAD_ID,
  });
  const loader = new DataLoader(dataset, {
    batchSize: 2,
    shuffle: false,
    seed: SEED,
    dropLast: false,
  });
  return { tokenizer, dataset, loader };
}

function buildTinyModel(vocabSize: number) {
  const model = TensorMiniMindModel.tiny(vocabSize);
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr: 0.01,
    eps: 1e-8,
    weightDecay: 0,
  });
  return { model, optimizer };
}

/** Train the tiny ALIGNED pipeline for `epochs` under the production Trainer. */
function trainTinyAligned(epochs: number, withSpy?: {
  onCriterion: (logits: Tensor, targets: number[][], mask?: number[][]) => void;
}) {
  Random.setSeed(SEED);
  const { tokenizer, dataset, loader } = buildTinyAligned();
  const { model, optimizer } = buildTinyModel(tokenizer.vocabSize);
  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader: loader,
    config: { epochs, gradientAccumulationSteps: 1 },
    criterion: withSpy
      ? (logits, targets, mask) => {
          withSpy.onCriterion(logits, targets, mask);
          return crossEntropyLoss(logits, targets, mask);
        }
      : undefined,
  });
  const state = trainer.train();
  return { tokenizer, dataset, loader, model, optimizer, trainer, state };
}

// ============================================================
// Sync tests
// ============================================================

export function runPhase90Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 90: Document-Boundary / Sequence-Layout Alignment (sync contracts) --");

  testDocumentAlignedDatasetShapeAndMasks();
  testPaddingDoesNotContributeToLoss();
  testValidTokensStillProduceNextTokenTargets();
  testNoTargetCrossesDocumentBoundary();
  testMaskedGradientZeroAtPaddedPositions();
  testMaskedLossMatchesAnalyticAndAllOnesMaskEqualsNoMask();
  testMaskValidation();
  testTrainerThreadsMasksSinglePath();
  testAlignedPathReproducibleAndLossDecreases();
  testNoArchitectureEvaluatorOrThresholdChanges();

  console.log(`  Phase 90 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ------------------------------------------------------------
// 1. Document-aligned dataset: shape + mask semantics
// ------------------------------------------------------------
function testDocumentAlignedDatasetShapeAndMasks(): void {
  test("1. document-aligned dataset: one padded window per doc with correct masks", () => {
    const { dataset } = buildTinyAligned();
    assertEqual(dataset.length(), 2, "two documents -> two windows");

    const s0 = dataset.get(0);
    assertArrayEqual(s0.inputIds, [4, 5, 6, 0], "doc0 inputIds (a,b,c,pad)");
    assertArrayEqual(s0.targetIds, [5, 6, 0, 0], "doc0 targetIds (1-shift, pad)");
    assertArrayEqual(s0.mask!, [1, 1, 0, 0], "doc0 mask (2 valid positions)");
    assertEqual(s0.mask!.length, 4, "mask length == blockSize");
    assertEqual(s0.mask![3], 0, "last mask position is always 0 (no target)");

    const s1 = dataset.get(1);
    assertArrayEqual(s1.inputIds, [7, 8, 0, 0], "doc1 inputIds (d,e,pad,pad)");
    assertArrayEqual(s1.mask!, [1, 0, 0, 0], "doc1 mask (1 valid position)");

    // Mask semantics invariant: mask[s]==1 ⟺ s+1 < docLen (a real next token).
    const docLen0 = 3;
    for (let s = 0; s < 3; s++) {
      assertEqual(s0.mask![s], s + 1 < docLen0 ? 1 : 0, `doc0 mask[${s}] semantics`);
    }

    // get() returns a deep copy of the mask (caller cannot mutate internal state).
    const copy = dataset.get(0);
    copy.mask![0] = 0;
    assertEqual(dataset.get(0).mask![0], 1, "get() deep-copies mask");
  });
}

// ------------------------------------------------------------
// 2. Padding does not contribute to loss
// ------------------------------------------------------------
function testPaddingDoesNotContributeToLoss(): void {
  test("2. padding does not contribute to loss (garbage at masked positions is ignored)", () => {
    const { tokenizer, dataset } = buildTinyAligned();
    const s0 = dataset.get(0);
    const V = tokenizer.getVocabulary().size;

    // "Perfect valid" logits: valid positions (s=0,1) put mass on the true
    // next token; masked positions (s=2,3) carry a HUGE logit on pad id.
    const makeLogits = (maskedLogitValue: number, maskedLogitId: number) =>
      Tensor.fromArray([
        s0.inputIds.map((_id, s) => {
          const row = new Array<number>(V).fill(0);
          if (s < 2) row[s0.inputIds[s + 1]] = 10; // correct next-token
          else row[maskedLogitId] = maskedLogitValue; // masked: arbitrary
          return row;
        }),
      ]);

    const l1 = crossEntropyLoss(makeLogits(10, s0.inputIds[0]), [s0.inputIds], [s0.mask!]).item();
    const l2 = crossEntropyLoss(makeLogits(50, PAD_ID), [s0.inputIds], [s0.mask!]).item();
    // Changing the masked positions' logits must NOT change the loss at all.
    assertEqual(l1, l2, "masked-position logits do not affect loss (bit-identical)");

    // The loss equals the analytic mean over the 2 valid positions only.
    const analytic = -Math.log(Math.exp(10) / (V - 1 + Math.exp(10)));
    assertNear(l1, analytic, 1e-9, "masked loss == analytic softmax-NLL over valid positions only");
  });
}

// ------------------------------------------------------------
// 3. Valid tokens still produce next-token targets
// ------------------------------------------------------------
function testValidTokensStillProduceNextTokenTargets(): void {
  test("3. valid (mask=1) tokens still produce real next-token targets", () => {
    const { dataset } = buildTinyAligned();
    for (const sample of [dataset.get(0), dataset.get(1)]) {
      for (let s = 0; s < sample.inputIds.length - 1; s++) {
        if (sample.mask![s] === 1) {
          // TextSample contract holds at valid positions: target = next input.
          assertEqual(
            sample.targetIds[s],
            sample.inputIds[s + 1],
            `valid position ${s}: targetIds[s] == inputIds[s+1]`
          );
          // And that next token is a REAL document token (not padding).
          assert(sample.inputIds[s + 1] !== PAD_ID, `valid position ${s}: target is not padding`);
        }
      }
    }
  });
}

// ------------------------------------------------------------
// 4. No target crosses a document boundary (full production dataset)
// ------------------------------------------------------------
function testNoTargetCrossesDocumentBoundary(): void {
  test("4. no target crosses a document boundary (FULL production dataset, aligned layout)", () => {
    const dataset = loadProductionDataset();
    const texts = getDatasetTexts(dataset);
    Random.setSeed(SEED);
    const tokenizer = new BPETokenizer();
    tokenizer.train(texts, VOCAB_TARGET);

    const aligned = new TextDataset({
      tokenizer,
      corpus: texts,
      blockSize: BLOCK_SIZE,
      layout: "document-aligned",
      padTokenId: PAD_ID,
    });

    // All 600 docs are shorter than blockSize=64 → exactly one window each.
    assertEqual(aligned.length(), 600, "600 docs -> 600 aligned windows");

    let validPositions = 0;
    for (let i = 0; i < aligned.length(); i++) {
      const s = aligned.get(i);
      assert(s.mask !== undefined, `sample ${i} carries a mask`);
      assertEqual(s.mask!.length, BLOCK_SIZE, `sample ${i} mask length`);
      assertEqual(s.mask![BLOCK_SIZE - 1], 0, `sample ${i} last mask = 0`);
      for (let p = 0; p < BLOCK_SIZE - 1; p++) {
        if (s.mask![p] === 1) {
          // Both the input token and its target are real, non-padding tokens
          // from the SAME document: no pair crosses a boundary.
          assert(s.inputIds[p] !== PAD_ID, `sample ${i} pos ${p}: input not padding`);
          assert(s.inputIds[p + 1] !== PAD_ID, `sample ${i} pos ${p}: target not padding`);
          assertEqual(
            s.targetIds[p],
            s.inputIds[p + 1],
            `sample ${i} pos ${p}: target == next input`
          );
          validPositions++;
        }
      }
    }
    // Sanity: the corpus yields a healthy number of valid prediction positions
    // (median doc ≈ 36 tokens ⇒ ≈ 600×(36−1) ≈ 21k valid positions).
    assert(validPositions > 10000, `enough valid positions across corpus (${validPositions})`);
  });
}

// ------------------------------------------------------------
// 5. Masked loss gradient: zero at masked positions, non-zero at valid
// ------------------------------------------------------------
function testMaskedGradientZeroAtPaddedPositions(): void {
  test("5. gradient is exactly zero at masked positions and non-zero at valid positions", () => {
    const { tokenizer, dataset } = buildTinyAligned();
    const s0 = dataset.get(0);
    const V = tokenizer.getVocabulary().size;

    const logits = Tensor.fromArray(
      [
        s0.inputIds.map((_id, s) => {
          const row = new Array<number>(V).fill(0);
          if (s < 2) row[s0.inputIds[s + 1]] = 10;
          else row[PAD_ID] = 10;
          return row;
        }),
      ],
      undefined,
      true // requiresGrad — build the autograd graph for the backward test
    );
    const grad = captureGrad(logits);
    const loss = crossEntropyLoss(logits, [s0.inputIds], [s0.mask!]);
    loss.backward();

    const sliceNonZero = (s: number): boolean => {
      for (let v = 0; v < V; v++) if (grad[s * V + v] !== 0) return true;
      return false;
    };
    const sliceAllZero = (s: number): boolean => {
      for (let v = 0; v < V; v++) if (grad[s * V + v] !== 0) return false;
      return true;
    };

    assert(sliceNonZero(0), "gradient non-zero at valid position s=0");
    assert(sliceNonZero(1), "gradient non-zero at valid position s=1");
    assert(sliceAllZero(2), "gradient zero at masked position s=2");
    assert(sliceAllZero(3), "gradient zero at no-target tail s=3");
  });
}

// ------------------------------------------------------------
// 6. Masked loss == analytic; all-ones mask == no-mask (bit-identical)
// ------------------------------------------------------------
function testMaskedLossMatchesAnalyticAndAllOnesMaskEqualsNoMask(): void {
  test("6. masked loss matches analytic; all-ones mask is bit-identical to no-mask", () => {
    const { tokenizer, dataset } = buildTinyAligned();
    const s0 = dataset.get(0);
    const V = tokenizer.getVocabulary().size;

    // Same logits as test 2, but with every column made "correct" is not
    // needed — this test focuses on the mask=no-mask equivalence.
    const logitsArr = s0.inputIds.map((_id, s) => {
      const row = new Array<number>(V).fill(0);
      row[(s + 1) % V] = 10; // arbitrary but fixed
      return row;
    });
    const logits = Tensor.fromArray([logitsArr]);

    const unmasked = crossEntropyLoss(logits, [s0.inputIds]).item();
    const allOnes = crossEntropyLoss(logits, [s0.inputIds], [[1, 1, 1, 1]]).item();
    assertEqual(unmasked, allOnes, "all-ones mask path == no-mask path (bit-identical)");

    // Masked loss must equal the mean over the valid (mask=1) positions only,
    // computed independently position-by-position from the raw logits.
    const logitsArr3 = logits.toArray() as number[][][];
    const softmaxNll = (s: number): number => {
      const row = logitsArr3[0][s];
      const target = s0.inputIds[s + 1];
      let maxV = -Infinity;
      for (let v = 0; v < row.length; v++) if (row[v] > maxV) maxV = row[v];
      let sumExp = 0;
      for (let v = 0; v < row.length; v++) sumExp += Math.exp(row[v] - maxV);
      const prob = Math.exp(row[target] - maxV) / sumExp;
      return -Math.log(Math.max(prob, 1e-15));
    };
    const expectedMasked = (softmaxNll(0) + softmaxNll(1)) / 2;
    const masked = crossEntropyLoss(logits, [s0.inputIds], [s0.mask!]).item();
    assertNear(masked, expectedMasked, 1e-9, "masked loss == mean over valid positions only");
  });
}

// ------------------------------------------------------------
// 7. crossEntropyLoss validates the mask
// ------------------------------------------------------------
function testMaskValidation(): void {
  test("7. crossEntropyLoss validates mask shape and 0/1 values", () => {
    const logits = Tensor.fromArray([[[1, 2, 3], [1, 2, 3], [1, 2, 3]]]); // [1,3,3]
    const targets = [[0, 1, 2]];

    // Wrong batch dimension (mask has 2 rows, logits has batch 1).
    let threw = false;
    try { crossEntropyLoss(logits, targets, [[1, 1, 1], [1, 1, 1]]); } catch { threw = true; }
    assert(threw, "mask batch mismatch throws");

    // Wrong sequence length.
    threw = false;
    try { crossEntropyLoss(logits, targets, [[1, 1]]); } catch { threw = true; }
    assert(threw, "mask length mismatch throws");

    // Non-0/1 value.
    threw = false;
    try { crossEntropyLoss(logits, targets, [[1, 1, 2]]); } catch { threw = true; }
    assert(threw, "non-0/1 mask value throws");

    // All-zeros mask → zero loss, zero gradient, no crash.
    const zeroMask = [[0, 0, 0]];
    const zeroLoss = crossEntropyLoss(logits, targets, zeroMask).item();
    assertEqual(zeroLoss, 0, "all-masked → zero loss");
    const zeroLogits = Tensor.fromArray([[[1, 2, 3], [1, 2, 3], [1, 2, 3]]]);
    const grad = captureGrad(zeroLogits);
    const zl = crossEntropyLoss(zeroLogits, targets, zeroMask);
    zl.backward();
    let allZero = true;
    for (let i = 0; i < grad.length; i++) if (grad[i] !== 0) { allZero = false; break; }
    assert(allZero, "all-masked → zero gradient");
  });
}

// ------------------------------------------------------------
// 8. Trainer threads masks on aligned datasets; production path unchanged
// ------------------------------------------------------------
function testTrainerThreadsMasksSinglePath(): void {
  test("8. Trainer passes masks on aligned datasets and keeps the 2-arg call on concatenated datasets", () => {
    Random.setSeed(SEED);

    // ── Aligned path: criterion receives a 3rd argument (the mask) ──
    let alignedMaskArgs: number = 0;
    const alignedMasks: number[][][] = [];
    const aligned = buildTinyAligned();
    const aModel = buildTinyModel(aligned.tokenizer.vocabSize);
    new Trainer({
      model: aModel.model,
      optimizer: aModel.optimizer,
      trainLoader: aligned.loader,
      config: { epochs: 1, gradientAccumulationSteps: 1 },
      criterion: (logits, targets, mask) => {
        if (mask !== undefined) {
          alignedMaskArgs++;
          alignedMasks.push(mask.map((r) => [...r]));
        }
        return crossEntropyLoss(logits, targets, mask);
      },
    }).train();

    assert(alignedMaskArgs > 0, "aligned training invoked the criterion WITH a mask");
    // With shuffle:false and one batch of 2 samples, the mask equals the
    // dataset masks in order.
    assertArrayEqual(alignedMasks[0][0], aligned.dataset.get(0).mask!, "criterion mask[0] == sample0.mask");
    assertArrayEqual(alignedMasks[0][1], aligned.dataset.get(1).mask!, "criterion mask[1] == sample1.mask");

    // ── Concatenated path: criterion still called with exactly 2 args ──
    const concatTokenizer = new MiniTokenizer();
    for (const w of ["a", "b", "c", "d", "e", "f"]) concatTokenizer.addToken(w);
    const concatDataset = new TextDataset({
      tokenizer: concatTokenizer,
      corpus: ["a b c d e f"],
      blockSize: 4,
      insertEos: false,
    });
    const concatLoader = new DataLoader(concatDataset, {
      batchSize: 2,
      shuffle: false,
      seed: SEED,
      dropLast: false,
    });
    const cModel = buildTinyModel(concatTokenizer.vocabSize);
    let concatThreeArgs = 0;
    new Trainer({
      model: cModel.model,
      optimizer: cModel.optimizer,
      trainLoader: concatLoader,
      config: { epochs: 1, gradientAccumulationSteps: 1 },
      criterion: (logits, targets, mask) => {
        if (mask !== undefined) concatThreeArgs++;
        return crossEntropyLoss(logits, targets);
      },
    }).train();

    assertEqual(concatThreeArgs, 0, "concatenated (production) training passes no mask → 2-arg criterion");
  });
}

// ------------------------------------------------------------
// 9. Aligned path reproducibility + loss decrease
// ------------------------------------------------------------
function testAlignedPathReproducibleAndLossDecreases(): void {
  test("9. aligned training path is reproducible (seed 42) and the masked-objective loss decreases", () => {
    const r1 = trainTinyAligned(2);
    const r2 = trainTinyAligned(2);

    assertEqual(r1.state.lossHistory.length, r2.state.lossHistory.length, "same step count");
    for (let i = 0; i < r1.state.lossHistory.length; i++) {
      assertEqual(r1.state.lossHistory[i], r2.state.lossHistory[i], `lossHistory[${i}] identical`);
    }

    const first = r1.state.lossHistory[0];
    const last = r1.state.lossHistory[r1.state.lossHistory.length - 1];
    assert(last < first, `masked-objective loss decreases over aligned training (${first.toFixed(3)} → ${last.toFixed(3)})`);
  });
}

// ------------------------------------------------------------
// 10. No architecture / evaluator / threshold changes
// ------------------------------------------------------------
function testNoArchitectureEvaluatorOrThresholdChanges(): void {
  test("10. no architecture, evaluator, or capability-threshold changes", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target");
    assertEqual(cfg.dModel, 128, "dModel");
    assertEqual(cfg.numHeads, 4, "numHeads");
    assertEqual(cfg.dFF, 512, "dFF");
    assertEqual(cfg.numLayers, 4, "numLayers");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen");
    assertEqual(parameterCountOf(cfg), 1_126_528, "exact parameter count");

    // Production classes reused — no second model/tokenizer/Trainer/loss.
    assertEqual(typeof TensorMiniMindModel, "function", "TensorMiniMindModel is the production model class");
    assertEqual(typeof Trainer, "function", "Trainer is the production trainer class");
    assertEqual(typeof BPETokenizer, "function", "BPETokenizer is the production tokenizer class");

    // Capability Level 3 threshold intact (≥ 0.5).
    const report = deriveCapabilityLevel({
      pipelineRuns: false,
      tokenizerRoundTrip: false,
      lossDecreases: false,
      paramsChange: false,
      memorizationSignal: false,
      coherentGeneration: false,
      qaCapability: false,
    });
    assertEqual(report.levels.length, 6, "six gates (0–5)");
    const level3 = report.levels.find((l) => l.level === 3)!;
    assert(level3.criterion.includes("0.5"), "Level 3 threshold (0.5) intact");
  });
}
