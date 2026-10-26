// ============================================================
// Phase 93 — Model Capacity Sweep (contract suite)
// ============================================================
// Verifies the Phase 93 A/B/C capacity experiment's delivered
// artifacts (experiments/phase93/probe-results.json + per-candidate
// checkpoints) against the HARD contracts of the experiment:
//
//   STATIC contracts (no probe artifact needed):
//   1. proposed configurations are mathematically valid — dModel is
//      divisible by numHeads for every cell; dFF = 4·dModel (the
//      documented production scaling); layers fixed at 4; vocab fixed
//      at 300
//   2. exact parameter counts — the analytic formula AND the actual
//      model graph agree: A=1,126,528, B=2,476,224, C=4,350,208
//   3. production config remains unchanged — getProductionModelConfig()
//      still V=300/D=128/heads=4/dFF=512/layers=4/seqLen=256, 1,126,528
//   4. experiment config does NOT replace the production SSOT — the
//      experimental cells live only in experiments/phase93/probe.ts and
//      never enter ModelRegistry (registry still has exactly the 4
//      built-in entries; no cell-named model exists)
//   5. dataset / tokenizer / objective / layout identifiers remain
//      unchanged — bilingual v0.3.0, 600 samples, tokenizer trains to
//      vocab 300 with the production BPE
//   6. capability evaluator unchanged — six gates (0–5), Level 3 ≥ 0.5,
//      Level 4 still demands valid UTF-8; no threshold edits
//
//   ARTIFACT contracts (probe-results.json must exist):
//   7. training is REAL — A reuses the Phase 90 artifact; B/C ran the
//      full 20-epoch recipe (loss decreased, 3000 steps, duration > 0,
//      params changed)
//   8. checkpoint integrity per candidate — param count matches,
//      finite, reload-deterministic, load→save→load lossless
//   9. reproducibility contract — every candidate recorded identical
//      seeded runs; fresh cells document the per-run seed reset (the
//      corrected Phase 90 harness, NOT the bug where run #2 inherited
//      model-init state); A reuses Phase 90 evidence
//  10. capability gates recorded with structurally valid ranges —
//      memorization top-1 ∈ [0,1], level ∈ [0,5], every language's
//      validUtf8/nonEmpty/cjk/collapsed/merged ratios ∈ [0,1],
//      training-distribution top-1 recorded
//  11. recipe identifiers — the delivered probe recipe pins dataset
//      bilingual v0.3.0, document-aligned layout, masked corrected
//      1-step objective, the exact optimization recipe
//  12. fake-data audit — no Math.random metrics, no fake training, no
//      hardcoded metrics, no fabricated checkpoints, evaluator
//      unmodified
//
// The suite makes NO claim about whether the hypothesis held (that is
// the report's job, driven by the measured numbers). It only proves the
// experiment was performed honestly and its artifacts are self-consistent.
// It never asserts a fabricated loss/generation value.
//
// Existing Phase 57–92 suites are NOT modified or weakened.
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
import { CELLS, exactParamCount } from "../../../../../experiments/phase93/probe";

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

// The three exact counts, as independent regression anchors.
const EXPECTED_PARAMS: Record<string, number> = {
  A: 1_126_528,
  B: 2_476_224,
  C: 4_350_208,
};

// __dirname = src/lib/minimind/research/tests → 5 levels up = repo root
const P93_DIR = path.join(__dirname, "../../../../../experiments/phase93");
const PROBE_RESULTS_PATH = path.join(P93_DIR, "probe-results.json");

function cellByKey(key: string) {
  const c = CELLS.find((x) => x.key === key);
  if (!c) throw new Error(`Phase 93: cell "${key}" not found in the probe matrix`);
  return c;
}

// ============================================================
// STATIC SUITE (independent of the probe artifact)
// ============================================================

export function runPhase93StaticTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 93: Model Capacity Sweep (static contracts) --");

  testConfigsMathematicallyValid();
  testExactParameterCounts();
  testProductionConfigUnchanged();
  testExperimentConfigDoesNotReplaceSsot();
  testDatasetTokenizerIdentifiers();
  testEvaluatorUnchangedAndThresholds();

  console.log(`  Phase 93 (static): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ------------------------------------------------------------
// 1. Configurations are mathematically valid
// ------------------------------------------------------------
function testConfigsMathematicallyValid(): void {
  test("1. configurations are mathematically valid (heads divides dModel; dFF = 4·dModel; layers fixed; vocab fixed)", () => {
    assertEqual(CELLS.length, 3, "exactly three cells (A/B/C)");
    for (const c of CELLS) {
      assert(c.dModel % c.numHeads === 0, `${c.key}: dModel ${c.dModel} divisible by numHeads ${c.numHeads}`);
      assertEqual(c.dFF, 4 * c.dModel, `${c.key}: dFF = 4 × dModel (documented scaling)`);
      assertEqual(c.numLayers, PRODUCTION_LAYERS, `${c.key}: layers fixed at production value`);
      assertEqual(c.numHeads, PRODUCTION_HEADS, `${c.key}: heads fixed at production value`);
      assertEqual(c.maxSeqLen, PRODUCTION_MAX_SEQ_LEN, `${c.key}: maxSeqLen matches production`);
      assertEqual(c.expectedParams, exactParamCount(VOCAB_TARGET, c.dModel, c.dFF, c.numLayers), `${c.key}: expectedParams = analytic exact count`);
    }
  });
}

// ------------------------------------------------------------
// 2. Exact parameter counts (analytic AND model graph)
// ------------------------------------------------------------
function testExactParameterCounts(): void {
  test("2. exact parameter counts: A=1,126,528, B=2,476,224, C=4,350,208 (formula + real model graph)", () => {
    for (const c of CELLS) {
      const analytic = exactParamCount(VOCAB_TARGET, c.dModel, c.dFF, c.numLayers);
      assertEqual(analytic, EXPECTED_PARAMS[c.key], `${c.key}: analytic exact count`);

      const model = new TensorMiniMindModel({
        vocabSize: VOCAB_TARGET,
        dModel: c.dModel,
        numHeads: c.numHeads,
        dFF: c.dFF,
        numLayers: c.numLayers,
        maxSeqLen: c.maxSeqLen,
      });
      assertEqual(model.totalParamCount, EXPECTED_PARAMS[c.key], `${c.key}: model graph totalParamCount`);
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
    // The registry must still contain exactly the four built-in entries.
    const names = listModels().map((m) => m.name).sort();
    assertEqual(names.length, 4, "four built-in models");
    for (const expected of ["base", "production", "small", "tiny"]) {
      assert(names.includes(expected), `registry still has "${expected}"`);
    }
    assertEqual(modelCount(), 4, "no extra model registered");
    for (const c of CELLS) {
      assert(!hasModel(c.key), `cell "${c.key}" is NOT a registry model name`);
    }
    // And the production config the probe builds from is byte-identical to before.
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

    // The production BPE still trains to vocab 300 (tokenizer algorithm untouched).
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
    // Strict chain: nothing achieved when no evidence is present.
    assertEqual(level.highestLevel, 0, "no evidence → Level 0");
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
      dffScaling: string;
      productionParams: number;
    };
    candidates: Record<
      string,
      {
        arch: { vocabSize: number; dModel: number; numHeads: number; dFF: number; numLayers: number; maxSeqLen: number };
        model: { totalParams: number; expectedParams: number; paramsDeltaVsProduction: number };
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
  assertEqual(probe.phase, "phase93", "artifact phase id");
  cached = { probe };
  return cached;
}

export function runPhase93Tests(): { passed: number; failed: number } {
  const staticResult = runPhase93StaticTests();

  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 93: Model Capacity Sweep (artifact contracts) --");

  testRecipeIdentifiers();
  testTrainingIsReal();
  testCheckpointIntegrity();
  testReproducibilityContract();
  testCapabilityGatesRecorded();
  testNoFakeData();

  console.log(`  Phase 93 (artifact): ${passed} passed, ${failed} failed`);
  return { passed: staticResult.passed + passed, failed: staticResult.failed + failed };
}

// ------------------------------------------------------------
// 7. Recipe identifiers recorded in the artifact
// ------------------------------------------------------------
function testRecipeIdentifiers(): void {
  test("7. delivered recipe pins the unchanged dataset / layout / objective / optimization", () => {
    const { probe } = getContext();
    const r = probe.recipe;
    assertEqual(r.dataset, "bilingual", "dataset id");
    assertEqual(r.datasetVersion, "0.3.0", "dataset version");
    assertEqual(r.samples, 600, "samples");
    assertEqual(r.vocabSize, VOCAB_TARGET, "vocab 300");
    assert(r.layout.includes("document-aligned"), `layout is document-aligned ("${r.layout}")`);
    assert(r.objective.includes("1-step"), `objective is the Phase 89 corrected 1-step ("${r.objective}")`);
    assertEqual(r.variable, "model width dModel", "single variable is model width");
    assertEqual(r.dffScaling, "4 × dModel", "dFF scaling documented");
    assertEqual(r.productionParams, PRODUCTION_PARAMS, "production params baseline recorded");
    assertEqual(r.seed, SEED, "seed 42");
    assertEqual(r.blockSize, 64, "blockSize 64");
    assertEqual(r.epochs, 20, "20 epochs");
    assertEqual(r.batchSize, 4, "batch 4");
  });
}

// ------------------------------------------------------------
// 8. Training is real
// ------------------------------------------------------------
function testTrainingIsReal(): void {
  test("8. training is REAL: A reuses Phase 90; B/C ran the full 20-epoch recipe", () => {
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
    }
  });
}

// ------------------------------------------------------------
// 9. Checkpoint integrity per candidate
// ------------------------------------------------------------
function testCheckpointIntegrity(): void {
  test("9. checkpoint integrity: param count match, finite, reload-deterministic, lossless round-trip", () => {
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
      // The recorded model param count matches the exact formula.
      assertEqual(c.model.totalParams, EXPECTED_PARAMS[key], `${key}: recorded total params`);
      assertEqual(c.model.expectedParams, EXPECTED_PARAMS[key], `${key}: recorded expected params`);
    }
  });
}

// ------------------------------------------------------------
// 10. Reproducibility contract (per-run seed reset, NOT the Phase 90 bug)
// ------------------------------------------------------------
function testReproducibilityContract(): void {
  test("10. reproducibility: every candidate identical; fresh cells reset the seed per run", () => {
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
// 11. Capability gates recorded with structurally valid ranges
// ------------------------------------------------------------
function testCapabilityGatesRecorded(): void {
  test("11. capability gates recorded: memorization ∈ [0,1], level ∈ [0,5], language ratios ∈ [0,1], train-dist top-1", () => {
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

// ------------------------------------------------------------
// 12. Fake-data audit
// ------------------------------------------------------------
function testNoFakeData(): void {
  test("12. fake-data audit: no Math.random metrics, no fake training, no hardcoded metrics, no fabricated checkpoint, evaluator unmodified", () => {
    const { probe } = getContext();
    const audit = probe.fakeDataAudit;
    assertEqual(audit.mathRandomInMetrics, false, "mathRandomInMetrics is false");
    assertEqual(audit.setTimeoutFakeTraining, false, "setTimeoutFakeTraining is false");
    assertEqual(audit.hardcodedFakeMetrics, false, "hardcodedFakeMetrics is false");
    assertEqual(audit.fabricatedCheckpoint, false, "fabricatedCheckpoint is false");
    assertEqual(audit.evaluatorModified, false, "evaluatorModified is false");
  });
}
