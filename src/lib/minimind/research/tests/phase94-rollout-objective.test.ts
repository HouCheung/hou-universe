// ============================================================
// Phase 94 — Rollout-Data Augmentation (contract suite)
// ============================================================
// Verifies the Phase 94 A/B/C experiment's delivered artifacts
// (experiments/phase94/probe-results.json + per-candidate checkpoints)
// against the HARD contracts of the experiment:
//
//   STATIC contracts (no probe artifact needed):
//   1. objective config is valid — cells A(k=0, reuse Phase 90),
//      B(k=8, fresh), C(k=24, fresh); single variable k; augmentation
//      frequency R=4; every cell uses the production architecture
//   2. exact parameter counts — all three cells = 1,126,528 (the
//      production dModel-128 arch; only the objective differs)
//   3. production config remains unchanged — getProductionModelConfig()
//      still V=300/D=128/heads=4/dFF=512/layers=4/seqLen=256, 1,126,528
//   4. experiment config does NOT replace the production SSOT — the
//      experimental cells live only in experiments/phase94/probe.ts and
//      never enter ModelRegistry
//   5. dataset / tokenizer / objective / layout identifiers unchanged —
//      bilingual v0.3.0, 600 samples, tokenizer trains to vocab 300
//   6. capability evaluator unchanged — six gates (0–5), Level 3 ≥ 0.5,
//      Level 4 still demands valid UTF-8; no threshold edits
//   7. augmented windows are WELL-FORMED (NEW Phase-94 mechanism) —
//      window = true prefix + own argmax tail (≤ k) + padding to 64;
//      CE targets aligned to the TRUE next document token; mask gates
//      every valid position; padding boundary correct; builds are
//      deterministic given the seeded RNG; own tail length ≤ k
//
//   ARTIFACT contracts (probe-results.json must exist):
//   8. training is REAL — A reuses the Phase 90 condition-B artifact;
//      B/C ran the full 20-epoch augmented recipe (loss decreased,
//      3000 steps, duration > 0, params changed, augmentation steps > 0)
//   9. checkpoint integrity per candidate — param count matches,
//      finite, reload-deterministic, load→save→load lossless
//  10. reproducibility contract — every candidate recorded identical
//      seeded runs; fresh cells document the per-run seed reset (the
//      corrected Phase 90 harness); A reuses Phase 90 evidence
//  11. capability gates + mechanism metric recorded with structurally
//      valid ranges — memorization top-1 ∈ [0,1], level ∈ [0,5],
//      language ratios ∈ [0,1], train-dist top-1 recorded, own-window
//      accuracy ∈ [0,1] for B/C (null for A, k=0), true-window top-1
//      recorded for all cells
//  12. recipe identifiers — the delivered probe recipe pins dataset
//      bilingual v0.3.0, document-aligned layout, masked corrected
//      1-step objective + rollout-data augmentation, R=4, k variable
//  13. fake-data audit — no Math.random metrics, no fake training, no
//      hardcoded metrics, no fabricated checkpoints, evaluator
//      unmodified
//
// The suite makes NO claim about whether the hypothesis held (that is
// the report's job, driven by the measured numbers). It only proves the
// experiment was performed honestly and its artifacts are self-consistent.
// It never asserts a fabricated loss/generation value.
//
// Existing Phase 57–93 suites are NOT modified or weakened.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  getProductionModelConfig,
  PRODUCTION_VOCAB_TARGET,
  parameterCountOf,
  listModels,
  modelCount,
  hasModel,
} from "../../experiments/ModelRegistry";
import { loadProductionDataset, getDatasetTexts } from "../../data/datasetLoader";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { Random } from "../../core/random/Random";
import { deriveCapabilityLevel } from "../capability-eval";
import {
  CELLS,
  exactParamCount,
  encodeDocuments,
  eligibleDocIndices,
  buildAugmentedWindow,
  buildAugmentedBatch,
} from "../../../../../experiments/phase94/probe";

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

// ============================================================
// Constants — the exact experiment matrix
// ============================================================

const SEED = 42;
const VOCAB_TARGET = 300;
const PRODUCTION_DMODEL = 128;
const PRODUCTION_HEADS = 4;
const PRODUCTION_DFF = 512;
const PRODUCTION_LAYERS = 4;
const PRODUCTION_MAX_SEQ_LEN = 256;
const PRODUCTION_PARAMS = 1_126_528;
const AUG_R = 4;
const AUG_S0_MIN = 8;
const BLOCK_SIZE = 64;
const PAD_TOKEN_ID = 0;

// __dirname = src/lib/minimind/research/tests → 5 levels up = repo root
const P94_DIR = path.join(__dirname, "../../../../../experiments/phase94");
const PROBE_RESULTS_PATH = path.join(P94_DIR, "probe-results.json");

function cellByKey(key: string) {
  const c = CELLS.find((x) => x.key === key);
  if (!c) throw new Error(`Phase 94: cell "${key}" not found in the probe matrix`);
  return c;
}

// ============================================================
// STATIC SUITE (independent of the probe artifact)
// ============================================================

export function runPhase94StaticTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 94: Rollout-Data Augmentation (static contracts) --");

  testObjectiveConfigValid();
  testExactParameterCounts();
  testProductionConfigUnchanged();
  testExperimentConfigDoesNotReplaceSsot();
  testDatasetTokenizerIdentifiers();
  testEvaluatorUnchangedAndThresholds();
  testAugmentedWindowsWellFormed();

  console.log(`  Phase 94 (static): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ------------------------------------------------------------
// 1. Objective config is valid
// ------------------------------------------------------------
function testObjectiveConfigValid(): void {
  test("1. objective config valid: A(k=0,reuse), B(k=8,fresh), C(k=24,fresh); single variable k; R=4; production arch", () => {
    assertEqual(CELLS.length, 3, "exactly three cells (A/B/C)");
    const a = cellByKey("A");
    const b = cellByKey("B");
    const c = cellByKey("C");
    assertEqual(a.k, 0, "A: augmentation horizon k=0");
    assertEqual(a.fresh, false, "A: not freshly trained (reuses Phase 90)");
    assertEqual(b.k, 8, "B: k=8");
    assertEqual(b.fresh, true, "B: fresh training");
    assertEqual(c.k, 24, "C: k=24 (full eval horizon)");
    assertEqual(c.fresh, true, "C: fresh training");
    // Single variable: every cell uses the production architecture.
    for (const cell of CELLS) {
      assertEqual(cell.k, [0, 8, 24][CELLS.indexOf(cell)], `${cell.key}: k is the ONLY variable`);
      assert(cell.fresh === (cell.k > 0), `${cell.key}: fresh iff k>0`);
    }
  });
}

// ------------------------------------------------------------
// 2. Exact parameter counts (all cells = production 1,126,528)
// ------------------------------------------------------------
function testExactParameterCounts(): void {
  test("2. exact parameter counts: every cell = 1,126,528 (production arch; only the objective varies)", () => {
    for (const c of CELLS) {
      const analytic = exactParamCount(VOCAB_TARGET, PRODUCTION_DMODEL, PRODUCTION_DFF, PRODUCTION_LAYERS);
      assertEqual(analytic, PRODUCTION_PARAMS, `${c.key}: analytic exact count = 1,126,528`);

      const model = new TensorMiniMindModel({
        vocabSize: VOCAB_TARGET,
        dModel: PRODUCTION_DMODEL,
        numHeads: PRODUCTION_HEADS,
        dFF: PRODUCTION_DFF,
        numLayers: PRODUCTION_LAYERS,
        maxSeqLen: PRODUCTION_MAX_SEQ_LEN,
      });
      assertEqual(model.totalParamCount, PRODUCTION_PARAMS, `${c.key}: model graph totalParamCount = 1,126,528`);
    }
  });
}

// ------------------------------------------------------------
// 3. Production config remains unchanged
// ------------------------------------------------------------
function testProductionConfigUnchanged(): void {
  test("3. production model config remains unchanged", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "vocab target still 300");
    assertEqual(cfg.dModel, PRODUCTION_DMODEL, "dModel");
    assertEqual(cfg.numHeads, PRODUCTION_HEADS, "numHeads");
    assertEqual(cfg.dFF, PRODUCTION_DFF, "dFF");
    assertEqual(cfg.numLayers, PRODUCTION_LAYERS, "numLayers");
    assertEqual(cfg.maxSeqLen, PRODUCTION_MAX_SEQ_LEN, "maxSeqLen");
    assertEqual(parameterCountOf(cfg), PRODUCTION_PARAMS, "production parameter count unchanged");
  });
}

// ------------------------------------------------------------
// 4. Experiment config does NOT replace the production SSOT
// ------------------------------------------------------------
function testExperimentConfigDoesNotReplaceSsot(): void {
  test("4. experimental cells never enter the ModelRegistry (production SSOT intact)", () => {
    const names = listModels().map((m) => m.name).sort();
    assertEqual(names.length, 4, "four built-in models");
    for (const expected of ["base", "production", "small", "tiny"]) {
      assert(names.includes(expected), `registry still has "${expected}"`);
    }
    assertEqual(modelCount(), 4, "no extra model registered");
    for (const c of CELLS) {
      assert(!hasModel(c.key), `cell "${c.key}" is NOT a registry model name`);
    }
    const cfg = getProductionModelConfig();
    assertEqual(cfg.dModel, PRODUCTION_DMODEL, "SSOT dModel");
    assertEqual(parameterCountOf(cfg), PRODUCTION_PARAMS, "SSOT params");
  });
}

// ------------------------------------------------------------
// 5. Dataset / tokenizer identifiers unchanged
// ------------------------------------------------------------
function testDatasetTokenizerIdentifiers(): void {
  test("5. dataset + tokenizer identifiers unchanged (bilingual v0.3.0, 600 samples, vocab 300)", () => {
    const dataset = loadProductionDataset();
    assertEqual(dataset.metadata.id, "bilingual", "dataset id");
    assertEqual(dataset.metadata.version, "0.3.0", "dataset version");
    assertEqual(dataset.samples.length, 600, "sample count");
    const languageCounts = dataset.samples.reduce<Record<string, number>>((acc, s) => {
      acc[s.language] = (acc[s.language] ?? 0) + 1;
      return acc;
    }, {});
    assertEqual(languageCounts.zh, 200, "zh samples");
    assertEqual(languageCounts.en, 200, "en samples");
    assertEqual(languageCounts.mixed, 200, "mixed samples");

    Random.setSeed(SEED);
    const tokenizer = new BPETokenizer();
    tokenizer.train(getDatasetTexts(dataset), VOCAB_TARGET);
    assertEqual(tokenizer.vocabSize, VOCAB_TARGET, "tokenizer trains to vocab 300");
  });
}

// ------------------------------------------------------------
// 6. Capability evaluator unchanged + no threshold changes
// ------------------------------------------------------------
function testEvaluatorUnchangedAndThresholds(): void {
  test("6. capability evaluator unchanged; six gates; Level 3 ≥ 0.5; Level 4 demands valid UTF-8", () => {
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
    assert(level4.criterion.includes("valid UTF-8"), "Level 4 criterion still demands valid UTF-8");
    assertEqual(level.highestLevel, 0, "no evidence → Level 0");
  });
}

// ------------------------------------------------------------
// 7. NEW mechanism contract: augmented windows are well-formed
// ------------------------------------------------------------
function testAugmentedWindowsWellFormed(): void {
  test("7. augmented windows well-formed: true prefix + own argmax tail (≤ k) + pad; CE targets = TRUE next token; mask gates; deterministic", () => {
    const dataset = loadProductionDataset();
    const corpus = getDatasetTexts(dataset);
    Random.setSeed(SEED);
    const tokenizer = new BPETokenizer();
    tokenizer.train(corpus, VOCAB_TARGET);
    const model = new TensorMiniMindModel({
      vocabSize: tokenizer.vocabSize,
      dModel: PRODUCTION_DMODEL,
      numHeads: PRODUCTION_HEADS,
      dFF: PRODUCTION_DFF,
      numLayers: PRODUCTION_LAYERS,
      maxSeqLen: PRODUCTION_MAX_SEQ_LEN,
    });
    const docTokenSeq = encodeDocuments(tokenizer, corpus);
    // No document reaches blockSize — the corpus geometry recorded in the report.
    const maxLen = Math.max(...docTokenSeq.map((d) => d.length));
    assert(maxLen < BLOCK_SIZE, `corpus geometry: no doc reaches 64 tokens (max ${maxLen})`);

    const eligible8 = eligibleDocIndices(docTokenSeq, 8);
    const eligible24 = eligibleDocIndices(docTokenSeq, 24);
    assert(eligible8.length > 0, "k=8 has eligible docs");
    assert(eligible24.length > 0, "k=24 has eligible docs");
    assert(eligible8.length >= eligible24.length, "longer horizon → fewer eligible docs");

    const longDoc = docTokenSeq.reduce((a, b) => (b.length > a.length ? b : a));
    const k = 8;
    const s0 = 8;
    Random.setSeed(SEED);
    const win = buildAugmentedWindow(model, longDoc, s0, k);
    assertEqual(win.inp.length, BLOCK_SIZE, "inp padded to 64");
    assertEqual(win.tgt.length, BLOCK_SIZE, "tgt padded to 64");
    assertEqual(win.mask.length, BLOCK_SIZE, "mask padded to 64");
    assert(win.ownLen >= 1 && win.ownLen <= k, `own tail length ${win.ownLen} in [1,${k}]`);
    const validEnd = Math.min(s0 + win.ownLen, BLOCK_SIZE - 1);
    for (let i = 0; i <= s0; i++) {
      assertEqual(win.inp[i], longDoc[i], `inp[${i}] = true prefix token`);
    }
    // CE targets aligned to the TRUE document continuation.
    for (let j = 0; j <= validEnd + 1 && j < longDoc.length; j++) {
      assertEqual(win.tgt[j], longDoc[j], `tgt[${j}] = true next token`);
    }
    // Mask gates every valid position, padding after validEnd.
    for (let s = 0; s <= validEnd; s++) {
      assertEqual(win.mask[s], 1, `mask[${s}] = 1 (valid)`);
    }
    for (let s = validEnd + 1; s < BLOCK_SIZE; s++) {
      assertEqual(win.mask[s], 0, `mask[${s}] = 0 (padding)`);
    }
    // Padding starts right after the own tail.
    assertEqual(win.inp[s0 + win.ownLen + 1], PAD_TOKEN_ID, "padding after own tail");

    // Batch builder: 4 windows, deterministic given the seeded RNG.
    Random.setSeed(SEED);
    const batch = buildAugmentedBatch(model, docTokenSeq, eligible8, k, 4);
    assertEqual(batch.inputIds.length, 4, "batch has 4 windows");
    for (const row of batch.inputIds) assertEqual(row.length, BLOCK_SIZE, "batch inp rows length 64");
    for (const row of batch.targets) assertEqual(row.length, BLOCK_SIZE, "batch tgt rows length 64");
    for (const row of batch.masks) assertEqual(row.length, BLOCK_SIZE, "batch mask rows length 64");
    Random.setSeed(SEED);
    const batch2 = buildAugmentedBatch(model, docTokenSeq, eligible8, k, 4);
    let detOk = true;
    for (let b = 0; b < 4; b++) {
      for (let i = 0; i < BLOCK_SIZE; i++) if (batch.inputIds[b][i] !== batch2.inputIds[b][i]) detOk = false;
    }
    assert(detOk, "buildAugmentedBatch deterministic given seed 42");
  });
}

// ============================================================
// ARTIFACT SUITE (probe-results.json must exist)
// ============================================================

interface Context {
  probe: {
    phase: string;
    question: string;
    recipe: {
      dataset: string;
      datasetVersion: string;
      samples: number;
      blockSize: number;
      epochs: number;
      batchSize: number;
      seed: number;
      vocabSize: number;
      layout: string;
      objective: string;
      variable: string;
      augR: number;
      augS0Min: number;
      productionParams: number;
    };
    candidates: Record<
      string,
      {
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
          windows: number;
          batchesPerEpoch: number;
          augSteps: number | null;
          augR: number;
        };
        checkpoint: {
          path: string;
          integrity: {
            paramCountMatches: boolean;
            shapeMismatches: string[];
            nanCount: number;
            infinityCount: number;
            finite: boolean;
            reloadDeterministic: boolean;
            loadSaveLoadLossless: boolean;
          };
        };
        trainingDistribution: { alignedTop1: number; alignedTop5: number; alignedTop10: number; alignedNll: number; alignedTokens: number };
        mechanism: {
          ownWindows: { top1: number; correct: number; total: number; meanOwnLen: number } | null;
          trueWindows: { top1: number; total: number };
          eligibleDocs: number;
          s0Range: [number, number];
        };
        gates: {
          memorization: { top1: number; predictions: number; chance: number };
          generation: { byLanguage: Record<string, { validUtf8Ratio: number; nonEmptyRatio: number; cjkRatio: number; collapsedRatio: number; mergedTokenRatio: number }> };
          level: number;
        };
        reproducibility: { identical: boolean; steps: number; source: string };
      }
    >;
    fakeDataAudit: Record<string, boolean>;
  };
}

let cached: Context | null = null;

function getContext(): Context {
  if (cached) return cached;
  assert(fs.existsSync(PROBE_RESULTS_PATH), `probe-results.json exists (${PROBE_RESULTS_PATH})`);
  const probe = JSON.parse(fs.readFileSync(PROBE_RESULTS_PATH, "utf8"));
  assertEqual(probe.phase, "phase94", "artifact phase id");
  cached = { probe };
  return cached;
}

export function runPhase94Tests(): { passed: number; failed: number } {
  const staticResult = runPhase94StaticTests();

  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 94: Rollout-Data Augmentation (artifact contracts) --");

  testRecipeIdentifiers();
  testTrainingIsReal();
  testCheckpointIntegrity();
  testReproducibilityContract();
  testCapabilityGatesRecorded();
  testMechanismMetricRecorded();
  testNoFakeData();

  console.log(`  Phase 94 (artifact): ${passed} passed, ${failed} failed`);
  return { passed: staticResult.passed + passed, failed: staticResult.failed + failed };
}

// ------------------------------------------------------------
// 8. Recipe identifiers recorded in the artifact
// ------------------------------------------------------------
function testRecipeIdentifiers(): void {
  test("8. delivered recipe pins the unchanged dataset / layout / objective + augmentation / R=4 / variable k", () => {
    const { probe } = getContext();
    const r = probe.recipe;
    assertEqual(r.dataset, "bilingual", "dataset id");
    assertEqual(r.datasetVersion, "0.3.0", "dataset version");
    assertEqual(r.samples, 600, "samples");
    assertEqual(r.vocabSize, VOCAB_TARGET, "vocab 300");
    assert(r.layout.includes("document-aligned"), `layout is document-aligned ("${r.layout}")`);
    assert(r.objective.includes("1-step"), `objective retains the Phase 89 corrected 1-step ("${r.objective}")`);
    assert(r.objective.includes("augmentation"), `objective names the rollout-data augmentation ("${r.objective}")`);
    assertEqual(r.variable, "own-context rollout horizon k", "single variable is the augmentation horizon k");
    assertEqual(r.augR, AUG_R, "augmentation frequency R=4");
    assertEqual(r.augS0Min, AUG_S0_MIN, "augmentation s0 lower bound recorded");
    assertEqual(r.productionParams, PRODUCTION_PARAMS, "production params baseline recorded");
    assertEqual(r.seed, SEED, "seed 42");
    assertEqual(r.blockSize, BLOCK_SIZE, "blockSize 64");
    assertEqual(r.epochs, 20, "20 epochs");
    assertEqual(r.batchSize, 4, "batch 4");
  });
}

// ------------------------------------------------------------
// 9. Training is real
// ------------------------------------------------------------
function testTrainingIsReal(): void {
  test("9. training is REAL: A reuses Phase 90; B/C ran the full 20-epoch augmented recipe", () => {
    const { probe } = getContext();
    const a = probe.candidates["A"];
    assertEqual(a.training.trained, false, "A was not retrained (reused Phase 90 condition-B artifact)");
    assert(a.training.source.includes("phase90"), "A.source names the Phase 90 checkpoint");
    assertEqual(a.training.totalSteps, 3000, "A records the Phase 90 3000-step run");
    assert(a.training.finalLoss! < a.training.initialLoss!, "A loss decreased");

    for (const key of ["B", "C"] as const) {
      const cell = cellByKey(key);
      assert(cell.fresh, `${key} is a fresh-training cell`);
      const c = probe.candidates[key];
      assertEqual(c.training.trained, true, `${key} was freshly trained by this probe`);
      assert(c.training.initialLoss !== null && Number.isFinite(c.training.initialLoss), `${key} initial loss measured`);
      assert(c.training.finalLoss !== null && Number.isFinite(c.training.finalLoss), `${key} final loss measured`);
      assert(c.training.finalLoss! < c.training.initialLoss!, `${key} loss decreased`);
      assertEqual(c.training.totalSteps, 3000, `${key} total steps = 20 epochs × 150 batches`);
      assertEqual(c.training.batchesPerEpoch, 150, `${key} batches per epoch (600 windows / batch 4)`);
      assert(c.training.durationMs! > 0, `${key} took measurable wall-clock time`);
      assert(c.training.maxAbsParamDelta! > 0, `${key} parameters changed during training`);
      assert(c.training.augSteps! > 0, `${key} ran augmentation steps (${c.training.augSteps})`);
      assertEqual(c.training.augR, AUG_R, `${key} augmentation frequency R=4`);
    }
  });
}

// ------------------------------------------------------------
// 10. Checkpoint integrity per candidate
// ------------------------------------------------------------
function testCheckpointIntegrity(): void {
  test("10. checkpoint integrity: param count match, finite, reload-deterministic, lossless round-trip", () => {
    const { probe } = getContext();
    for (const key of ["A", "B", "C"] as const) {
      const c = probe.candidates[key];
      const i = c.checkpoint.integrity;
      assert(i.paramCountMatches, `${key}: recorded param count matches the candidate's architecture`);
      assertEqual(i.shapeMismatches.length, 0, `${key}: no tensor shape mismatches (${i.shapeMismatches.join(", ")})`);
      assertEqual(i.nanCount, 0, `${key}: no NaN parameters`);
      assertEqual(i.infinityCount, 0, `${key}: no Infinity parameters`);
      assert(i.finite, `${key}: all parameters finite`);
      assert(i.reloadDeterministic, `${key}: two fresh loads are bit-identical`);
      assert(i.loadSaveLoadLossless, `${key}: load→save→load is lossless`);
      assert(fs.existsSync(c.checkpoint.path), `${key}: checkpoint file on disk (${c.checkpoint.path})`);
    }
  });
}

// ------------------------------------------------------------
// 11. Reproducibility contract (per-run seed reset, NOT the Phase 90 bug)
// ------------------------------------------------------------
function testReproducibilityContract(): void {
  test("11. reproducibility: every candidate identical; fresh cells reset the seed per run", () => {
    const { probe } = getContext();
    for (const key of ["B", "C"] as const) {
      const r = probe.candidates[key].reproducibility;
      assert(r.identical, `${key}: two fresh seeded runs produced identical loss histories`);
      assert(r.steps > 0, `${key}: recorded at least one loss step (${r.steps})`);
      assert(
        r.source.includes("Random.setSeed"),
        `${key}: reproducibility measured with the corrected per-run seed reset (source: "${r.source}")`
      );
    }
    const a = probe.candidates["A"].reproducibility;
    assert(a.source.includes("Phase 90"), "A reuses the Phase 90 reproducibility evidence");
    assert(a.identical, "A's Phase 90 reproducibility was bit-identical");
    assert(a.steps > 0, "A repro recorded steps");
  });
}

// ------------------------------------------------------------
// 12. Capability gates + mechanism metric recorded
// ------------------------------------------------------------
function testCapabilityGatesRecorded(): void {
  test("12. capability gates recorded: memorization ∈ [0,1], level ∈ [0,5], language ratios ∈ [0,1], train-dist top-1", () => {
    const { probe } = getContext();
    for (const key of ["A", "B", "C"] as const) {
      const c = probe.candidates[key];
      const g = c.gates;
      assert(g.memorization.top1 >= 0 && g.memorization.top1 <= 1, `${key}: memorization top-1 in [0,1]`);
      assert(g.memorization.predictions > 0, `${key}: memorization made predictions`);
      assert(g.level >= 0 && g.level <= 5, `${key}: capability level in [0,5]`);
      for (const lang of ["zh", "en", "mixed"] as const) {
        const a = g.generation.byLanguage[lang];
        assert(a.validUtf8Ratio >= 0 && a.validUtf8Ratio <= 1, `${key}/${lang}: validUtf8Ratio in [0,1]`);
        assert(a.nonEmptyRatio >= 0 && a.nonEmptyRatio <= 1, `${key}/${lang}: nonEmptyRatio in [0,1]`);
        assert(a.cjkRatio >= 0 && a.cjkRatio <= 1, `${key}/${lang}: cjkRatio in [0,1]`);
        assert(a.collapsedRatio >= 0 && a.collapsedRatio <= 1, `${key}/${lang}: collapsedRatio in [0,1]`);
        assert(a.mergedTokenRatio >= 0 && a.mergedTokenRatio <= 1, `${key}/${lang}: mergedTokenRatio in [0,1]`);
      }
      const td = c.trainingDistribution;
      assert(td.alignedTop1 >= 0 && td.alignedTop1 <= 1, `${key}: aligned train-dist top-1 in [0,1]`);
      assert(td.alignedTokens > 0, `${key}: train-dist measured real positions`);
      assert(td.alignedTop5 >= td.alignedTop1 - 1e-12, `${key}: top-5 >= top-1`);
      assert(td.alignedTop10 >= td.alignedTop5 - 1e-12, `${key}: top-10 >= top-5`);
    }
  });
}

function testMechanismMetricRecorded(): void {
  test("13. mechanism metric recorded: own-window top-1 ∈ [0,1] for B/C (null for A k=0), true-window top-1 for all", () => {
    const { probe } = getContext();
    for (const key of ["B", "C"] as const) {
      const m = probe.candidates[key].mechanism;
      assert(m.ownWindows !== null, `${key}: own-window metric measured (k>0)`);
      assert(m.ownWindows!.top1 >= 0 && m.ownWindows!.top1 <= 1, `${key}: own-window top-1 in [0,1]`);
      assert(m.ownWindows!.total > 0, `${key}: own-window metric counted real positions`);
      assert(m.ownWindows!.meanOwnLen <= 24, `${key}: mean own tail length within horizon`);
      assert(m.eligibleDocs > 0, `${key}: eligible docs measured`);
      assert(m.s0Range[0] >= AUG_S0_MIN, `${key}: s0 lower bound ≥ 8`);
    }
    const a = probe.candidates["A"].mechanism;
    assertEqual(a.ownWindows, null, "A (k=0) has no own-region window metric (null)");
    assert(a.eligibleDocs > 0, "A still records eligible-doc geometry for the baseline");
    for (const key of ["A", "B", "C"] as const) {
      const tw = probe.candidates[key].mechanism.trueWindows;
      assert(tw.top1 >= 0 && tw.top1 <= 1, `${key}: true-window top-1 in [0,1]`);
      assert(tw.total > 0, `${key}: true-window metric counted real positions`);
    }
  });
}

// ------------------------------------------------------------
// 14. Fake-data audit
// ------------------------------------------------------------
function testNoFakeData(): void {
  test("14. fake-data audit: no Math.random metrics, no fake training, no hardcoded metrics, no fabricated checkpoint, evaluator unmodified", () => {
    const { probe } = getContext();
    const audit = probe.fakeDataAudit;
    assertEqual(audit.mathRandomInMetrics, false, "mathRandomInMetrics is false");
    assertEqual(audit.setTimeoutFakeTraining, false, "setTimeoutFakeTraining is false");
    assertEqual(audit.hardcodedFakeMetrics, false, "hardcodedFakeMetrics is false");
    assertEqual(audit.fabricatedCheckpoint, false, "fabricatedCheckpoint is false");
    assertEqual(audit.evaluatorModified, false, "evaluatorModified is false");
  });
}
