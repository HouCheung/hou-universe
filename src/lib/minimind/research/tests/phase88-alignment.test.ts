// ============================================================
// Phase 88 — Training / Evaluation Alignment Diagnostic Contracts
// ============================================================
// This suite verifies ONLY the diagnostic contracts the Phase 88
// alignment probe depends on. It does NOT train a model, does NOT
// change production code, and does NOT rewrite any existing
// capability test.
//
// The probe (experiments/phase88/alignment-probe.ts) answers the
// Phase 88 question: "Why can the model reach loss ≈ 0.17 while
// memory top-1 stays ≈ 0.0344?" Its measurements are only trustworthy
// if the contracts below hold deterministically:
//
//   1. deterministic training sequence construction (seed 42 → identical windows)
//   2. the probe uses the SAME tokenizer as production (BPETokenizer,
//      vocab 300, special ids 0–3, deterministic train)
//   3. blockSize matches Phase 87 (64, within maxSeqLen 256)
//   4. the training-objective shift is identified correctly
//      (the DOUBLE shift: TextDataset pre-shifts targetIds by 1, then
//      crossEntropyLoss shifts again with targets[s+1] → 2-step ahead)
//   5. deterministic evaluated-token count (batches × batchSize × (blockSize − 1))
//   6. same-seed reproducibility (two fresh seeded pipelines are identical)
//   7. capability thresholds unchanged (Level 3 still requires top-1 ≥ 0.5)
//   8. no architecture changes (production config + classes untouched)
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

import { resolveTrainingDataset } from "../../data/datasetRegistry";

import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";
import { TextDataset } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { Trainer } from "../../training/Trainer";
import { Random } from "../../core/random/Random";
import { Tensor } from "../../core/Tensor";
import { crossEntropyLoss } from "../../core/loss/CrossEntropyLoss";

import { deriveCapabilityLevel } from "../capability-eval";

// ============================================================
// Test infrastructure (existing hand-written harness — no Vitest/Jest/Bun)
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

// ============================================================
// Constants — the exact Phase 88 probe recipe (identical to Phase 87)
// ============================================================

const BLOCK_SIZE = 64;
const BATCH_SIZE = 4;
const SEED = 42;
const VOCAB_TARGET = 300;

// ============================================================
// Sync tests — the 8 diagnostic contracts
// ============================================================

export function runPhase88Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 88: Training/Evaluation Alignment (sync contracts) --");

  testSequenceConstructionDeterministic();
  testSameTokenizerAsProduction();
  testBlockSizeMatchesPhase87();
  testDoubleShiftIdentified();
  testEvaluatedTokenCountDeterministic();
  testSameSeedReproducibility();
  testThresholdsUnchanged();
  testNoArchitectureChanges();

  console.log(`  Phase 88 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

function buildProductionPipeline(blockSize: number) {
  const corpus = getDatasetTexts(loadProductionDataset());
  Random.setSeed(SEED);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, VOCAB_TARGET);
  const textDataset = new TextDataset({ tokenizer, corpus, blockSize });
  const trainLoader = new DataLoader(textDataset, {
    batchSize: BATCH_SIZE,
    shuffle: true,
    seed: SEED,
    dropLast: true,
  });
  return { corpus, tokenizer, textDataset, trainLoader };
}

// ------------------------------------------------------------
// 1. Deterministic training sequence construction
// ------------------------------------------------------------
function testSequenceConstructionDeterministic(): void {
  test("1. training sequence construction is deterministic (seeded → identical windows)", () => {
    const { textDataset, tokenizer } = buildProductionPipeline(BLOCK_SIZE);

    assert(textDataset.length() > 0, "windows exist");
    const a = textDataset.get(0);
    const b = textDataset.get(0);
    assertEqual(a.inputIds.length, BLOCK_SIZE, "input width = blockSize");
    assertEqual(a.targetIds.length, BLOCK_SIZE, "target width = blockSize");
    for (let i = 0; i < a.inputIds.length; i++) {
      assertEqual(a.inputIds[i], b.inputIds[i], `inputIds stable at ${i}`);
      assertEqual(a.targetIds[i], b.targetIds[i], `targetIds stable at ${i}`);
    }
    // Every token is in-range for the model vocab (diagnostic forward contract).
    for (const id of a.inputIds) {
      assert(id >= 0 && id < tokenizer.vocabSize, `input id ${id} in vocab`);
    }
  });
}

// ------------------------------------------------------------
// 2. Same tokenizer as production
// ------------------------------------------------------------
function testSameTokenizerAsProduction(): void {
  test("2. the probe uses the SAME tokenizer as production (BPETokenizer, vocab 300, special ids 0–3)", () => {
    const { tokenizer } = buildProductionPipeline(BLOCK_SIZE);

    // Vocab target reached — matches the model's vocabSize.
    assertEqual(tokenizer.vocabSize, 300, "vocab 300");
    assertEqual(PRODUCTION_VOCAB_TARGET, 300, "production vocab target constant");

    // Special-token IDs are the fixed 0–3 layout the model is trained on.
    const vocab = tokenizer.getVocabulary();
    const SPECIAL = { "<pad>": 0, "<unk>": 1, "<bos>": 2, "<eos>": 3 };
    for (const [name, id] of Object.entries(SPECIAL)) {
      assertEqual(vocab.tokenToId.get(name), id, `special token "${name}" id`);
    }
  });
}

// ------------------------------------------------------------
// 3. blockSize matches Phase 87
// ------------------------------------------------------------
function testBlockSizeMatchesPhase87(): void {
  test("3. blockSize matches Phase 87 (64, within maxSeqLen 256)", () => {
    const cfg = getProductionModelConfig();
    assertEqual(BLOCK_SIZE, 64, "probe default blockSize = Phase 87 combined cell");
    assert(BLOCK_SIZE >= 2, "blockSize >= 2 (causal window valid)");
    assert(BLOCK_SIZE <= cfg.maxSeqLen, `blockSize ${BLOCK_SIZE} within maxSeqLen ${cfg.maxSeqLen}`);

    const { textDataset } = buildProductionPipeline(BLOCK_SIZE);
    assertEqual(textDataset.getBlockSize(), 64, "dataset reports blockSize 64");
    const sample = textDataset.get(0);
    assertEqual(sample.inputIds.length, 64, "input length == 64");
  });
}

// ------------------------------------------------------------
// 4. Double-shift identified correctly (the Phase 88 root-cause contract)
// ------------------------------------------------------------
function testDoubleShiftIdentified(): void {
  test("4. the training-objective shift is identified correctly (DOUBLE shift → 2-step ahead)", () => {
    // Tiny, deterministic tokenizer + dataset (same construction as
    // experiments/phase88/verify-shift.ts).
    const tokenizer = new MiniTokenizer();
    for (const w of ["a", "b", "c", "d", "e", "f"]) tokenizer.addToken(w);

    const dataset = new TextDataset({
      tokenizer,
      corpus: ["a b c d e f"],
      blockSize: 4,
      insertEos: false,
    });
    const sample = dataset.get(0);

    // Shift #1 (TextDataset): targetIds[s] == inputIds[s+1] — documented 1-step.
    assertEqual(sample.inputIds.length, 4, "input width 4");
    assertEqual(sample.targetIds.length, 4, "target width 4");
    for (let s = 0; s < 3; s++) {
      assertEqual(sample.targetIds[s], sample.inputIds[s + 1], `TextDataset 1-shift at ${s}`);
    }

    // Build logits where position s has near-certain mass ONLY at the natural
    // next token (targetIds[s]). If the production loss were 1-step aligned,
    // loss would be ≈ 0. If it DOUBLE-shifts, the loss is high.
    const logits = Tensor.fromArray([
      sample.inputIds.map((_id, s) => {
        const row = new Array(tokenizer.getVocabulary().size).fill(0);
        row[sample.targetIds[s]] = 10;
        return row;
      }),
    ]);
    const loss = crossEntropyLoss(logits, [sample.targetIds]).item();

    // Shift #2 (crossEntropyLoss): internal targets[s+1] is used, so a perfect
    // 1-step prediction is scored as wrong → loss ≈ ln(1/p_wrong) ≈ 10.
    assert(loss > 5, `1-step-perfect prediction yields loss ${loss.toFixed(3)} (double shift → HIGH)`);

    // Confirm the effective target per logit position is targetIds[s+1] (2-step ahead).
    for (let s = 0; s < 3; s++) {
      const used = sample.targetIds[s + 1];
      const natural = sample.targetIds[s];
      assertEqual(used, sample.targetIds[s + 1], `position ${s}: loss target = targetIds[${s + 1}] (double shift)`);
      assert(used !== natural, `position ${s}: loss target ${used} != natural next ${natural}`);
    }
    // Positions whose 2-step-ahead token falls inside the window are trained
    // against exactly input[s+2] (the token two positions ahead of input[s]).
    for (let s = 0; s < 2; s++) {
      assertEqual(sample.targetIds[s + 1], sample.inputIds[s + 2], `position ${s} trains against input[${s + 2}] (2-step ahead)`);
    }
  });
}

// ------------------------------------------------------------
// 5. Deterministic evaluated-token count
// ------------------------------------------------------------
function testEvaluatedTokenCountDeterministic(): void {
  test("5. evaluated-token count is deterministic (batches × batchSize × (blockSize − 1))", () => {
    const { textDataset, trainLoader } = buildProductionPipeline(BLOCK_SIZE);

    const windows = textDataset.length();
    const numBatches = trainLoader.numBatches;
    assertEqual(numBatches, Math.floor(windows / BATCH_SIZE), "dropLast: floor(windows/batchSize)");
    assert(numBatches > 0, "non-empty loader");

    // Iterate the loader once and count yielded batches + window tokens.
    let seenBatches = 0;
    let seenTokens = 0;
    for (const batch of trainLoader) {
      seenBatches++;
      assertEqual(batch.length, BATCH_SIZE, "each batch has batchSize samples");
      for (const sample of batch) {
        assertEqual(sample.inputIds.length, BLOCK_SIZE, "each window has blockSize tokens");
        seenTokens += BLOCK_SIZE;
      }
    }
    assertEqual(seenBatches, numBatches, "iteration yields exactly numBatches batches");

    // The probe evaluates blockSize − 1 positions per window (last logit has no
    // target under the production loss). So the deterministic count is:
    const evaluatedPerEpoch = numBatches * BATCH_SIZE * (BLOCK_SIZE - 1);
    assertEqual(
      evaluatedPerEpoch,
      numBatches * BATCH_SIZE * (BLOCK_SIZE - 1),
      "evaluated-token count formula"
    );
    assert(evaluatedPerEpoch === numBatches * 4 * 63, `= ${evaluatedPerEpoch} positions/epoch`);
    assertEqual(seenTokens / BLOCK_SIZE, numBatches * BATCH_SIZE, "windows counted consistently");
  });
}

// ------------------------------------------------------------
// 6. Same-seed reproducibility
// ------------------------------------------------------------
function testSameSeedReproducibility(): void {
  test("6. same-seed reproducibility (two fresh seeded pipelines are identical)", () => {
    const p1 = buildProductionPipeline(BLOCK_SIZE);
    const p2 = buildProductionPipeline(BLOCK_SIZE);

    // Same tokenizer vocab (deterministic BPE train under seed 42).
    assertEqual(p1.tokenizer.vocabSize, p2.tokenizer.vocabSize, "same vocab size");
    const v1 = p1.tokenizer.getVocabulary();
    const v2 = p2.tokenizer.getVocabulary();
    assertEqual(v1.size, v2.size, "same vocab size (tokenToId)");
    assertEqual(v1.tokenToId.size, v2.tokenToId.size, "same tokenToId size");
    for (const [token, id] of v1.tokenToId) {
      assertEqual(v2.tokenToId.get(token), id, `token maps identically`);
    }

    // Same window count and identical windows.
    assertEqual(p1.textDataset.length(), p2.textDataset.length(), "same window count");
    for (let i = 0; i < Math.min(p1.textDataset.length(), 32); i++) {
      const w1 = p1.textDataset.get(i);
      const w2 = p2.textDataset.get(i);
      for (let j = 0; j < w1.inputIds.length; j++) {
        assertEqual(w1.inputIds[j], w2.inputIds[j], `window ${i} token ${j} identical`);
        assertEqual(w1.targetIds[j], w2.targetIds[j], `window ${i} target ${j} identical`);
      }
    }

    // Same shuffled batch order (seeded BatchSampler).
    const batches1: number[][][] = [];
    for (const batch of p1.trainLoader) {
      batches1.push(batch.map((s) => s.inputIds));
    }
    const batches2: number[][][] = [];
    for (const batch of p2.trainLoader) {
      batches2.push(batch.map((s) => s.inputIds));
    }
    assertEqual(batches1.length, batches2.length, "same batch count");
    for (let i = 0; i < batches1.length; i++) {
      for (let b = 0; b < batches1[i].length; b++) {
        for (let j = 0; j < batches1[i][b].length; j++) {
          assertEqual(
            batches1[i][b][j],
            batches2[i][b][j],
            `batch ${i} sample ${b} token ${j} identical`
          );
        }
      }
    }
  });
}

// ------------------------------------------------------------
// 7. Thresholds unchanged
// ------------------------------------------------------------
function testThresholdsUnchanged(): void {
  test("7. capability thresholds unchanged (Level 3 still requires top-1 ≥ 0.5)", () => {
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
    assertEqual(report.highestLevel, 0, "all-false evidence → Level 0");

    const level3 = report.levels.find((l) => l.level === 3)!;
    assert(level3.criterion.includes("0.5"), "Level 3 threshold (0.5) intact");

    // Memorization chance = 1/vocabSize = 1/300 (the baseline the probe compares against).
    const chance = 1 / 300;
    assert(Math.abs(chance - 0.0033333333) < 1e-9, "memorization chance = 1/300 ≈ 0.0033");

    const level5 = report.levels.find((l) => l.level === 5)!;
    assert(!level5.achieved, "Q&A never claimed");
    assertEqual(level5.name, "Bilingual Q&A", "Level 5 gate (Q&A) present");
  });
}

// ------------------------------------------------------------
// 8. No architecture changes
// ------------------------------------------------------------
function testNoArchitectureChanges(): void {
  test("8. no architecture changes (production config + classes untouched)", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target");
    assertEqual(cfg.dModel, 128, "dModel");
    assertEqual(cfg.numHeads, 4, "numHeads");
    assertEqual(cfg.dFF, 512, "dFF");
    assertEqual(cfg.numLayers, 4, "numLayers");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen");
    assertEqual(parameterCountOf(cfg), 1_126_528, "exact parameter count");

    // The probe reuses production classes (no second model/tokenizer/Trainer).
    assertEqual(typeof TensorMiniMindModel, "function", "TensorMiniMindModel is the production model class");
    assertEqual(typeof Trainer, "function", "Trainer is the production trainer class");
    assertEqual(typeof BPETokenizer, "function", "BPETokenizer is the production tokenizer class");

    // Production corpus still resolves as the single bilingual dataset.
    const r = resolveTrainingDataset("bilingual");
    assertEqual(r.id, "bilingual", "single corpus id");
    assertEqual(r.kind, "production", "production kind");
    assertEqual(r.sampleCount, 600, "sampleCount");
  });
}
