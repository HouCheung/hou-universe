// ============================================================
// Phase 96 — Augmentation Transfer Experiment (contract suite)
// ============================================================
// Verifies the Phase 96 experiment: does targeted augmentation with
// k = 8 and s0 in [1,5] — matched to the 2–5 token evaluation prompts —
// improve generation capability on the UNCHANGED Phase-95 endpoint?
//
//   STATIC contracts (pure, deterministic, no model, no artifacts):
//   1. the experiment manifest exists and is self-consistent
//   2. the harness constants match the manifest exactly (so a silent
//      drift in probe.ts fails the suite instead of going unnoticed)
//   3. the intervention is ONE constant — k stays at 8; s0 moves to
//      [1,5]; every eligible doc's effective range is a subset of it
//   4. the baseline is the REUSED Phase 90 artifact, not a retrain
//   5. the evaluation prompt set is byte-identical to the manifest
//   6. the tokenizer, model architecture and dataset are unmodified
//   7. the Phase-95 evaluator is used unchanged, the tolerant UTF-8
//      gate is the active Level-4 term, strict is diagnostic only, and
//      charIntegrityRate / tokensToFirstInvalid are NOT gates
//   8. no stochastic or fake-training mechanisms in the metric code
//  8b. the buildModel init wart is preserved and documented
//  8c. the reseed no-op proof and the baseline init variance are recorded
//
//   ARTIFACT contracts (skip-with-report if absent — never fabricated):
//   9. preflight: init reproduces Phase 94's recorded first-step loss
//  10. augmentation audit: every check passed, counts match the manifest
//  11. training: completed, real, counted, deterministic
//  12. a failed training run can never be reported as a completed one
//  13. evaluation: the checkpoint identified, reloaded losslessly, and
//      evaluated deterministically
//  14. the primary endpoint is the tolerant Level; strict is diagnostic
//  15. the baseline init variance is real in the artifacts, not only in prose
//
// This suite makes NO claim about the experiment's OUTCOME. That is the
// report's job, driven by the measured numbers.
//
// Existing Phase 57–95 suites are NOT modified or weakened.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  AUG_K,
  AUG_R,
  AUG_S0_MAX,
  AUG_S0_MIN,
  GEN_EVAL_PROMPTS,
  config,
  eligibleDocIndices,
  s0RangeFor,
} from "../../../../../experiments/phase96/probe";
import { getProductionModelConfig } from "../../experiments/ModelRegistry";
import { loadProductionDataset, getDatasetTexts } from "../../data/datasetLoader";
import {
  LEVEL4_DIAGNOSTIC_FIELDS,
  LEVEL4_GATE_CONDITIONS,
} from "../capability-eval";

// ============================================================
// Minimal hand-rolled harness (same shape as Phase 88–95)
// ============================================================

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${msg}\n    Expected: ${JSON.stringify(expected)}\n    Actual:   ${JSON.stringify(actual)}`
    );
  }
}

function assertClose(actual: number, expected: number, tol: number, msg: string): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
    throw new Error(`Assertion failed: ${msg}\n    Expected ~${expected} (±${tol})\n    Actual:   ${actual}`);
  }
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${e instanceof Error ? e.message : String(e)}`);
  }
}

function skip(name: string, reason: string): void {
  skipped++;
  console.log(`  ~ SKIP: ${name} — ${reason}`);
}

// ============================================================
// Paths and the manifest
// ============================================================

const P96_DIR = path.join(__dirname, "../../../../../experiments/phase96");
const MANIFEST_PATH = path.join(P96_DIR, "manifest.json");
const PREFLIGHT_PATH = path.join(P96_DIR, "preflight.json");
const AUDIT_PATH = path.join(P96_DIR, "audit-augmentation.json");
const TRAINING_PATH = path.join(P96_DIR, "training-result.json");
const PROBE_RESULTS_PATH = path.join(P96_DIR, "probe-results.json");
const PROBE_SRC_PATH = path.join(P96_DIR, "probe.ts");
const TREATMENT_CKPT_PATH = path.join(P96_DIR, "phase96-treatment.ckpt.json");
const BASELINE_CKPT_PATH = path.join(
  __dirname,
  "../../../../../experiments/phase90/phase90-aligned.ckpt.json"
);

interface Manifest {
  phase: string;
  experimentName: string;
  arms: {
    baseline: { key: string; augmentationEnabled: boolean; k: number; trained: boolean; source: string };
    treatment: { key: string; augmentationEnabled: boolean; k: number; s0Range: number[]; trained: boolean };
    isolationReference: { key: string; artifact: string };
  };
  dataset: { id: string; version: string; documentCount: number };
  tokenizer: { vocabTarget: number; modified: boolean };
  model: { dModel: number; numHeads: number; dFF: number; numLayers: number; parameterCount: number; modified: boolean };
  recipe: {
    blockSize: number;
    batchSize: number;
    epochs: number;
    seed: number;
    optimizer: string;
    learningRate: number;
    weightDecay: number;
  };
  augmentation: {
    enabled: boolean;
    k: number;
    s0Range: number[];
    r: number;
    predictedAugmentedSteps: number;
    predictedAugmentedWindows: number;
    syntheticData: boolean;
  };
  initializationOrdering: {
    claim: string;
    verification: string;
    knownWart: string;
    reseedIsProvenNoop: string;
    baselineInitVariance: {
      finding: string;
      evidence: string;
      consequence: string;
      handling: string;
      discoveredBy: string;
    };
  };
  evaluation: {
    utf8Gate: string;
    promptSet: { prompt: string; language: string }[];
    maxTokens: number;
    temperature: number;
    seed: number;
    horizonModified: boolean;
  };
  endpoints: { primary: string; secondaryContinuous: string[]; diagnosticOnly: string[] };
  repetition: { strategy: string };
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
}

/** Read the harness source once — used for the "nothing fake here" checks. */
function probeSource(): string {
  return fs.readFileSync(PROBE_SRC_PATH, "utf8");
}

// ============================================================
// STATIC contracts
// ============================================================

function testManifestExists(): void {
  test("1. the Phase 96 manifest exists and is self-consistent", () => {
    assert(fs.existsSync(MANIFEST_PATH), `manifest missing at ${MANIFEST_PATH}`);
    const m = readManifest();
    assertEqual(m.phase, "phase96", "manifest phase id");
    assert(m.experimentName.length > 0, "experiment name is non-empty");
    assertEqual(m.arms.treatment.k, 8, "treatment k");
    assertEqual(m.arms.baseline.k, 0, "baseline k");
    assertEqual(m.arms.baseline.augmentationEnabled, false, "baseline has augmentation disabled");
    assertEqual(m.arms.treatment.augmentationEnabled, true, "treatment has augmentation enabled");
    assertEqual(m.arms.baseline.trained, false, "baseline is reused, not retrained");
    assertEqual(m.arms.treatment.trained, true, "treatment is trained");
    assert(
      m.arms.isolationReference.artifact.includes("phase94"),
      "isolation reference points at the Phase 94 cell-B artifact"
    );
  });
}

function testConstantsMatchManifest(): void {
  test("2. harness constants match the manifest (no silent drift)", () => {
    const m = readManifest();

    assertEqual(AUG_K, m.augmentation.k, "AUG_K vs manifest k");
    assertEqual(AUG_R, m.augmentation.r, "AUG_R vs manifest r");
    assertEqual(AUG_S0_MIN, m.augmentation.s0Range[0], "AUG_S0_MIN vs manifest s0 lower bound");
    assertEqual(AUG_S0_MAX, m.augmentation.s0Range[1], "AUG_S0_MAX vs manifest s0 upper bound");

    assertEqual(config.BLOCK_SIZE, m.recipe.blockSize, "blockSize");
    assertEqual(config.BATCH_SIZE, m.recipe.batchSize, "batchSize");
    assertEqual(config.EPOCHS, m.recipe.epochs, "epochs");
    assertEqual(config.SEED, m.recipe.seed, "seed");
    assertEqual(config.LR, m.recipe.learningRate, "learning rate");
    assertEqual(config.WD, m.recipe.weightDecay, "weight decay");
    assertEqual(config.VOCAB_TARGET, m.tokenizer.vocabTarget, "vocab target");

    assertEqual(config.MAX_TOKENS, m.evaluation.maxTokens, "evaluation horizon");
    assertEqual(config.SEED, m.evaluation.seed, "evaluation seed");
    assertEqual(config.PRODUCTION_PARAMS, m.model.parameterCount, "production parameter count");

    assertEqual(m.recipe.optimizer, "AdamW", "optimizer");
    assertEqual(m.recipe.epochs, 20, "the official run is the full 20 epochs (not shortened)");
  });
}

function testSingleVariable(): void {
  test("3. the intervention is ONE constant: k stays 8, s0 moves to [1,5]", () => {
    const m = readManifest();

    assertEqual(AUG_K, 8, "k is FIXED at 8 — not scaled (Phase 94 showed dose hurts)");
    assertEqual(m.arms.treatment.k, 8, "treatment k in manifest");
    assertEqual(AUG_S0_MIN, 1, "s0 lower bound is the Phase 96 change");
    assertEqual(AUG_S0_MAX, 5, "s0 upper bound is the Phase 96 change");
    assertEqual(config.PHASE94_S0_MIN, 8, "the Phase 94 value being replaced is recorded");

    // Every reachable s0 range must be a subset of [1,5] — for every
    // document length the corpus could contain, not just the observed ones.
    for (let docLen = 0; docLen <= 256; docLen++) {
      const r = s0RangeFor(docLen, AUG_K);
      if (r.hi < r.lo) continue; // doc too short — no window is built
      assert(
        r.lo >= AUG_S0_MIN && r.hi <= AUG_S0_MAX,
        `s0RangeFor(${docLen}, ${AUG_K}) = [${r.lo},${r.hi}] escapes [${AUG_S0_MIN},${AUG_S0_MAX}]`
      );
    }

    assertEqual(m.augmentation.syntheticData, false, "augmentation is not synthetic data");
    assert(m.augmentation.enabled, "augmentation is enabled for the treatment arm");
  });
}

function testEligibilityThreshold(): void {
  test("3b. eligible documents require s0_min + 1 + k + 1 tokens", () => {
    const need = AUG_S0_MIN + 2 + AUG_K;
    // A doc exactly at the threshold is eligible; one token shorter is not.
    const atThreshold = [new Array<number>(need).fill(7)];
    const belowThreshold = [new Array<number>(need - 1).fill(7)];
    assertEqual(eligibleDocIndices(atThreshold, AUG_K).length, 1, "doc at threshold is eligible");
    assertEqual(eligibleDocIndices(belowThreshold, AUG_K).length, 0, "doc below threshold is not");

    // And the whole production corpus qualifies at s0 ∈ [1,5] (Phase 94's
    // k=8 range admitted 594/600; the shorter prefix admits all 600).
    const corpus = getDatasetTexts(loadProductionDataset());
    assertEqual(corpus.length, 600, "production corpus document count");
  });
}

function testBaselineIsReused(): void {
  test("4. the baseline is the REUSED Phase 90 artifact", () => {
    const m = readManifest();
    assert(
      m.arms.baseline.source.includes("phase90-aligned.ckpt.json"),
      `baseline source names the Phase 90 artifact, got ${m.arms.baseline.source}`
    );
    assertEqual(m.arms.baseline.trained, false, "baseline was not retrained by Phase 96");
    assert(fs.existsSync(BASELINE_CKPT_PATH), `baseline checkpoint present at ${BASELINE_CKPT_PATH}`);

    // The harness must not contain a baseline training path.
    const src = probeSource();
    assert(
      src.includes("experiments\", \"phase90\", \"phase90-aligned.ckpt.json\"") ||
        src.includes('"phase90", "phase90-aligned.ckpt.json"'),
      "probe.ts resolves the baseline from the Phase 90 artifact"
    );
  });
}

function testPromptSetUnchanged(): void {
  test("5. the evaluation prompt set is byte-identical to the manifest", () => {
    const m = readManifest();
    assertEqual(GEN_EVAL_PROMPTS.length, m.evaluation.promptSet.length, "prompt count");
    assertEqual(GEN_EVAL_PROMPTS.length, 5, "the Phase 90 5-prompt set");
    for (let i = 0; i < GEN_EVAL_PROMPTS.length; i++) {
      assertEqual(GEN_EVAL_PROMPTS[i].prompt, m.evaluation.promptSet[i].prompt, `prompt ${i} text`);
      assertEqual(GEN_EVAL_PROMPTS[i].language, m.evaluation.promptSet[i].language, `prompt ${i} language`);
    }
    // The prompts are the SHORT regime the intervention targets.
    const lengths = GEN_EVAL_PROMPTS.map((p) => p.prompt.length);
    assert(Math.max(...lengths) <= 25, "prompts stay short (the regime s0 ∈ [1,5] matches)");
  });
}

function testFrozenInputsUnmodified(): void {
  test("6. tokenizer, model architecture and dataset are unmodified", () => {
    const m = readManifest();
    assertEqual(m.tokenizer.modified, false, "manifest: tokenizer unmodified");
    assertEqual(m.model.modified, false, "manifest: model architecture unmodified");
    assertEqual(m.evaluation.horizonModified, false, "manifest: evaluation horizon unmodified");

    // The model constants must equal the production SSOT, not a copy.
    const p = getProductionModelConfig();
    assertEqual(p.dModel, m.model.dModel, "dModel vs production SSOT");
    assertEqual(p.numHeads, m.model.numHeads, "numHeads vs production SSOT");
    assertEqual(p.dFF, m.model.dFF, "dFF vs production SSOT");
    assertEqual(p.numLayers, m.model.numLayers, "numLayers vs production SSOT");
    assertEqual(m.model.parameterCount, 1126528, "the 1,126,528-parameter production model");

    assertEqual(m.dataset.version, "0.3.0", "dataset version");
    assertEqual(m.dataset.documentCount, 600, "dataset document count");
    const dataset = loadProductionDataset();
    assertEqual(dataset.metadata.version, "0.3.0", "loaded dataset version");

    // The harness must build the tokenizer with the production recipe and
    // must not touch tokenizer internals.
    const src = probeSource();
    assert(src.includes("tokenizer.train(corpus, vocabTarget)"), "tokenizer trained with the production recipe");
    assert(!src.includes(".addToken("), "no vocabulary mutation");
    assert(!src.includes("vocabSize ="), "no vocabulary resize");
  });
}

function testEvaluatorUnchanged(): void {
  test("7. the Phase-95 evaluator is used unchanged; gates and diagnostics are distinct", () => {
    const m = readManifest();
    assertEqual(m.evaluation.utf8Gate, "tolerant", "the tolerant gate is the adopted condition");
    assertEqual(m.endpoints.primary, "Phase-95 repaired capability level (tolerant UTF-8 gate)", "primary endpoint");
    assert(
      m.endpoints.diagnosticOnly.includes("strictValidUtf8Ratio"),
      "strict UTF-8 is classified as diagnostic"
    );

    // The gate conditions are read from the LIVE module, not restated.
    assert(
      (LEVEL4_GATE_CONDITIONS as readonly string[]).includes("validUtf8TolerantRatio === 1"),
      "the tolerant ratio is the Level-4 UTF-8 term"
    );
    assert(
      !(LEVEL4_GATE_CONDITIONS as readonly string[]).includes("strictValidUtf8Ratio === 1"),
      "the strict ratio is NOT a gate condition"
    );
    assert(
      (LEVEL4_DIAGNOSTIC_FIELDS as readonly string[]).includes("strictValidUtf8Ratio"),
      "the strict ratio is a diagnostic field"
    );

    // The repaired diagnostics must NOT have become gates.
    for (const field of ["charIntegrityRate", "tokensToFirstInvalidMin", "tokensToFirstInvalidMean"]) {
      assert(
        !(LEVEL4_GATE_CONDITIONS as readonly string[]).includes(`${field} === 1`),
        `${field} must not be a gate condition`
      );
      assert(
        (LEVEL4_DIAGNOSTIC_FIELDS as readonly string[]).includes(field),
        `${field} must remain a diagnostic field`
      );
    }

    // The harness must import the evaluator, not reimplement it.
    const src = probeSource();
    assert(
      src.includes('from "../../src/lib/minimind/research/capability-eval"'),
      "probe.ts imports the production evaluator"
    );
    assert(!src.includes("deriveCapabilityLevel = "), "probe.ts does not redefine the level logic");
    assert(!src.includes("const LEVEL4"), "probe.ts does not restate the Level-4 thresholds");
  });
}

function testNoFakeMechanisms(): void {
  test("8. no stochastic or fake-training mechanisms in the harness", () => {
    const src = probeSource();
    assert(!src.includes("Math.random("), "no Math.random in the harness");
    assert(!src.includes("setTimeout("), "no setTimeout used as an experiment mechanism");
    assert(!src.includes("setInterval("), "no setInterval");
    assert(src.includes("Random.setSeed("), "the harness resets the RNG deterministically");

    // The augmentation draws must come from the seeded global stream.
    const augBlock = src.slice(src.indexOf("export function buildAugmentedBatch"));
    const augBody = augBlock.slice(0, augBlock.indexOf("\n}\n"));
    assert(augBody.includes("Random.uniform("), "augmentation draws come from seeded Random");
    assert(!augBody.includes("Math.random"), "the draw path has no Math.random");

    const m = readManifest();
    assertEqual(m.repetition.strategy.includes("one deterministic seed"), true, "one-run repetition strategy");
  });
}

function testInitWartPreserved(): void {
  test("8b. the buildModel init wart is preserved and documented, not silently fixed", () => {
    const m = readManifest();
    assert(
      m.initializationOrdering.knownWart.includes("NOT FIXED"),
      "the Phase 94 §12.5 wart is recorded as deliberately unfixed"
    );
    assert(
      m.initializationOrdering.verification.includes("5.977156484441439"),
      "the preflight verification target is recorded"

    );

    // A reseed inside buildModel would break the one-constant isolation
    // against Phase 94 cell B, so the source must not contain one.
    const src = probeSource();
    const start = src.indexOf("export function buildModel");
    const body = src.slice(start, src.indexOf("\n}\n", start));
    assert(!body.includes("Random.setSeed"), "buildModel does not reseed (isolation preserved)");
  });
}

// ============================================================
// ARTIFACT contracts (skip-with-report if absent)
// ============================================================

function testInitProvenanceRecorded(): void {
  test("8c. the reseed no-op proof and the baseline init variance are recorded, not asserted away", () => {
    const m = readManifest();

    // The reseed before the official buildModel is claimed to be inert. That
    // claim is only admissible because BPETokenizer never touches Random.
    assert(
      m.initializationOrdering.reseedIsProvenNoop.includes("no reference to Random"),
      "the no-op proof names its mechanism (the tokenizer never draws from Random)"
    );
    const tokSrc = fs.readFileSync(
      path.join(__dirname, "../../tokenizer/BPETokenizer.ts"),
      "utf8"
    );
    assert(
      !tokSrc.includes("Random"),
      "BPETokenizer still contains no reference to Random — the no-op proof holds"
    );

    // The mandated baseline is NOT init-matched to the treatment arm. The suite
    // must record that rather than present A vs T as a clean contrast.
    const v = m.initializationOrdering.baselineInitVariance;
    assert(
      v.finding.includes("NOT init-matched"),
      "the baseline init variance is stated plainly"
    );
    assert(
      v.evidence.includes("6.0273") && v.evidence.includes("5.977156484441439"),
      "both recorded initial losses appear as evidence"
    );
    assert(
      v.consequence.includes("B94 vs T"),
      "the consequence names the only init-matched comparison"
    );
    assert(
      v.handling.includes("reused not retrained"),
      "the handling keeps the mandated baseline instead of silently retraining it"
    );
  });
}

function testPreflightArtifact(): void {
  const name = "9. preflight: init reproduces Phase 94's recorded first-step loss";
  if (!fs.existsSync(PREFLIGHT_PATH)) {
    skip(name, `preflight.json not present at ${PREFLIGHT_PATH}`);
    return;
  }
  test(name, () => {
    const r = readJson(PREFLIGHT_PATH) as {
      pass: boolean;
      initMatchesPhase94: boolean;
      firstStepLoss: number;
      phase94RecordedInitialLoss: number;
      s0DrawsInRange: boolean;
      s0Histogram: Record<string, number>;
      eligibleDocs: number;
      corpusDocs: number;
    };
    assertEqual(r.pass, true, "preflight passed");
    assertEqual(r.initMatchesPhase94, true, "init is bit-identical to Phase 94 cell B");
    assertEqual(
      r.firstStepLoss,
      r.phase94RecordedInitialLoss,
      "first-step loss equals the recorded Phase 94 value exactly"
    );
    assertClose(r.firstStepLoss, 5.977156484441439, 0, "recorded Phase 94 initialLoss");
    assertEqual(r.s0DrawsInRange, true, "every drawn s0 was inside the range");
    assertEqual(r.eligibleDocs, 600, "all 600 docs are eligible at s0 ∈ [1,5]");
    assertEqual(r.corpusDocs, 600, "corpus size");
    for (const k of Object.keys(r.s0Histogram)) {
      assert(
        Number(k) >= AUG_S0_MIN && Number(k) <= AUG_S0_MAX,
        `s0 histogram contains ${k}, outside [${AUG_S0_MIN},${AUG_S0_MAX}]`
      );
    }
  });
}

function testAuditArtifact(): void {
  const name = "10. augmentation audit: every check passed, counts match the manifest";
  if (!fs.existsSync(AUDIT_PATH)) {
    skip(name, `audit-augmentation.json not present at ${AUDIT_PATH}`);
    return;
  }
  test(name, () => {
    const m = readManifest();
    const a = readJson(AUDIT_PATH) as {
      k: number;
      s0Range: number[];
      draws: { docIndex: number; s0: number; ownLen: number }[];
      findings: { check: string; ok: boolean; detail: string }[];
      failed: number;
      passed: number;
      predictedAugmentedSteps: number;
      predictedAugmentedWindows: number;
    };
    assertEqual(a.failed, 0, `audit reported ${a.failed} failed checks`);
    assert(a.passed > 0, "audit reported at least one passed check");
    for (const f of a.findings) {
      assert(f.ok, `audit finding failed: ${f.check} — ${f.detail}`);
    }
    assertEqual(a.k, 8, "audited k");
    assertEqual(a.s0Range[0], AUG_S0_MIN, "audited s0 lower bound");
    assertEqual(a.s0Range[1], AUG_S0_MAX, "audited s0 upper bound");
    assert(a.draws.length > 0, "augmented windows were actually inspected");
    for (const d of a.draws) {
      assert(
        d.s0 >= AUG_S0_MIN && d.s0 <= AUG_S0_MAX,
        `audited draw s0=${d.s0} escapes [${AUG_S0_MIN},${AUG_S0_MAX}]`
      );
      assert(d.ownLen >= 1 && d.ownLen <= AUG_K, `audited ownLen ${d.ownLen} escapes [1,${AUG_K}]`);
    }
    assertEqual(a.predictedAugmentedSteps, m.augmentation.predictedAugmentedSteps, "predicted steps");
    assertEqual(a.predictedAugmentedWindows, m.augmentation.predictedAugmentedWindows, "predicted windows");
  });
}

function testTrainingArtifact(): void {
  const name = "11. training: completed, real, counted, deterministic";
  if (!fs.existsSync(TRAINING_PATH)) {
    skip(name, `training-result.json not present at ${TRAINING_PATH}`);
    return;
  }
  test(name, () => {
    const m = readManifest();
    const t = readJson(TRAINING_PATH) as {
      trainingCompleted: boolean;
      treatment: {
        trained: boolean;
        fakeTraining: boolean;
        totalSteps: number;
        augSteps: number;
        augWindows: number;
        augSkipped: number;
        augR: number;
        augK: number;
        augS0Min: number;
        augS0Max: number;
        initialLoss: number;
        finalLoss: number;
        bestLoss: number;
        maxAbsParamDelta: number;
        meanAbsParamDelta: number;
        durationMs: number;
        checkpointPath: string;
        s0Histogram: Record<string, number>;
        reproducibility: { identical: boolean; steps: number };
      };
    };

    assertEqual(t.trainingCompleted, true, "trainingCompleted");
    const tr = t.treatment;
    assertEqual(tr.trained, true, "the treatment arm was trained");
    assertEqual(tr.fakeTraining, false, "the run is not a fake trainer");
    assertEqual(tr.totalSteps, m.recipe.epochs * 150, "total optimizer steps (20 epochs x 150 batches)");
    assertEqual(tr.augR, AUG_R, "augmentation frequency R");
    assertEqual(tr.augK, AUG_K, "augmentation k");
    assertEqual(tr.augS0Min, AUG_S0_MIN, "augmentation s0 lower bound");
    assertEqual(tr.augS0Max, AUG_S0_MAX, "augmentation s0 upper bound");

    assertEqual(tr.augSteps, m.augmentation.predictedAugmentedSteps, "augmented step count matches prediction");
    assertEqual(tr.augWindows, m.augmentation.predictedAugmentedWindows, "augmented window count matches prediction");
    assertEqual(tr.augSkipped, 0, "no augmentation example was skipped");

    for (const k of Object.keys(tr.s0Histogram)) {
      assert(
        Number(k) >= AUG_S0_MIN && Number(k) <= AUG_S0_MAX,
        `training s0 histogram contains ${k}, outside [${AUG_S0_MIN},${AUG_S0_MAX}]`
      );
    }

    assert(Number.isFinite(tr.initialLoss), "initial loss is a real number");
    assert(Number.isFinite(tr.finalLoss), "final loss is a real number");
    assert(Number.isFinite(tr.bestLoss), "best loss is a real number");
    assert(tr.finalLoss < tr.initialLoss, "loss actually decreased");
    assert(tr.maxAbsParamDelta > 0, "parameters actually moved");
    assert(tr.meanAbsParamDelta > 0, "mean parameter delta is non-zero");
    assert(tr.durationMs > 0, "training duration was measured, not guessed");

    assertEqual(tr.reproducibility.identical, true, "the two 2-epoch determinism runs were bit-identical");
    assert(tr.reproducibility.steps > 0, "the determinism check ran real steps");
  });
}

function testFailedTrainingCannotClaimCompletion(): void {
  const name = "12. a failed training run can never be reported as a completed experiment";
  if (!fs.existsSync(TRAINING_PATH)) {
    skip(name, `training-result.json not present at ${TRAINING_PATH}`);
    return;
  }
  test(name, () => {
    const t = readJson(TRAINING_PATH) as {
      trainingCompleted: boolean;
      treatment: { trained: boolean; checkpointPath: string; totalSteps: number };
    };
    // If the artifact exists at all, it must describe a COMPLETED run —
    // there is no code path that writes a partial file as if it succeeded.
    assertEqual(t.trainingCompleted, true, "an existing training artifact must record completion");
    assertEqual(t.treatment.trained, true, "an existing training artifact must record a real run");
    assert(t.treatment.totalSteps > 0, "a completed run has at least one optimizer step");

    // And the checkpoint it names must exist, and only exist because the
    // run completed (probe.ts writes it after training returns).
    assert(
      fs.existsSync(t.treatment.checkpointPath),
      `checkpoint named by the artifact exists at ${t.treatment.checkpointPath}`
    );
    assert(
      fs.existsSync(TREATMENT_CKPT_PATH),
      "the treatment checkpoint is at the documented path"
    );
  });
}

function testEvaluationArtifacts(): void {
  const name = "13. evaluation: the checkpoint identified, reloaded losslessly, evaluated deterministically";
  const treatmentArmPath = path.join(P96_DIR, "arm-T.json");
  if (!fs.existsSync(treatmentArmPath)) {
    skip(name, `arm-T.json not present at ${treatmentArmPath}`);
    return;
  }
  test(name, () => {
    const r = readJson(treatmentArmPath) as {
      key: string;
      k: number;
      trainedByThisPhase: boolean;
      checkpoint: { path: string; exists: boolean; readOnly: boolean };
      integrity: {
        expectedParamCount: number;
        actualParamCount: number;
        paramCountMatches: boolean;
        finite: boolean;
        nanCount: number;
        infinityCount: number;
        parameterOverwriteProven: boolean;
      };
      repaired: { evaluationDeterministic: boolean; level: number; levelText: string };
      training: { trained: boolean; augK: number; augS0Min: number; augS0Max: number };
    };

    assertEqual(r.key, "T", "arm key");
    assertEqual(r.k, 8, "treatment k");
    assertEqual(r.trainedByThisPhase, true, "trained by this phase");
    assertEqual(r.training.trained, true, "the arm's training record says trained");
    assertEqual(r.training.augK, AUG_K, "training record k");
    assertEqual(r.training.augS0Min, AUG_S0_MIN, "training record s0 min");
    assertEqual(r.training.augS0Max, AUG_S0_MAX, "training record s0 max");

    assertEqual(r.checkpoint.exists, true, "checkpoint exists");
    assertEqual(r.checkpoint.readOnly, true, "checkpoint opened read-only");
    assertEqual(r.checkpoint.path, TREATMENT_CKPT_PATH, "artifact identifies the treatment checkpoint");

    assertEqual(r.integrity.paramCountMatches, true, "parameter count matches the architecture");
    assertEqual(r.integrity.actualParamCount, 1126528, "exact production parameter count");
    assertEqual(r.integrity.finite, true, "all parameters finite");
    assertEqual(r.integrity.nanCount, 0, "no NaN parameters");
    assertEqual(r.integrity.infinityCount, 0, "no infinite parameters");
    assertEqual(r.integrity.parameterOverwriteProven, true, "reload overwrote every named parameter");

    assertEqual(r.repaired.evaluationDeterministic, true, "re-evaluating the saved checkpoint is deterministic");
    assertEqual(r.repaired.levelText, `Level ${r.repaired.level}`, "level text matches the level");
  });
}

function testPrimaryEndpointAndResults(): void {
  const name = "14. the primary endpoint is the tolerant Level; strict stays diagnostic";
  if (!fs.existsSync(PROBE_RESULTS_PATH)) {
    skip(name, `probe-results.json not present at ${PROBE_RESULTS_PATH}`);
    return;
  }
  test(name, () => {
    const p = readJson(PROBE_RESULTS_PATH) as {
      phase: string;
      comparison: {
        primary: { endpoint: string; baselineLevel: number | null; treatmentLevel: number | null };
        diagnostic: { strictValidUtf8Ratio: unknown };
        secondaryContinuous: Record<string, unknown>;
      };
      results: Record<string, { repaired?: { level: number }; historical?: { strictValidUtf8Ratio: unknown } }>;
      fakeDataAudit: Record<string, boolean>;
    };

    assertEqual(p.phase, "phase96", "artifact phase id");
    assert(
      p.comparison.primary.endpoint.includes("tolerant"),
      "the primary endpoint is the repaired tolerant level"
    );
    assert(
      !p.comparison.primary.endpoint.includes("strict"),
      "the primary endpoint is NOT the strict metric"
    );
    assert("strictValidUtf8Ratio" in p.comparison.diagnostic, "strict UTF-8 appears only under diagnostic");
    assert(
      "charIntegrityRate" in p.comparison.secondaryContinuous,
      "charIntegrityRate is a secondary continuous endpoint"
    );
    assert(
      "rolloutMeanAccuracy24" in p.comparison.secondaryContinuous,
      "rollout is a secondary continuous endpoint"
    );

    for (const [key, ok] of Object.entries(p.fakeDataAudit)) {
      assertEqual(ok, false, `fakeDataAudit.${key} must be false`);
    }

    // Whatever the outcome, the levels must be real integers in 0..5.
    for (const [key, arm] of Object.entries(p.results)) {
      if (!arm.repaired) continue;
      const lvl = arm.repaired.level;
      assert(
        Number.isInteger(lvl) && lvl >= 0 && lvl <= 5,
        `arm ${key} level ${lvl} is not an integer in 0..5`
      );
    }
  });
}

function testInitVarianceInArtifacts(): void {
  const name = "15. the baseline init variance is real in the artifacts, not only in prose";
  const armAPath = path.join(P96_DIR, "arm-A.json");
  const armTPath = path.join(P96_DIR, "arm-T.json");
  if (!fs.existsSync(armAPath) || !fs.existsSync(armTPath)) {
    skip(name, "arm-A.json / arm-T.json not both present");
    return;
  }
  test(name, () => {
    const a = readJson(armAPath) as { training: { initialLoss: number } };
    const t = readJson(armTPath) as { training: { initialLoss: number } };

    // The treatment arm must reproduce Phase 94's recorded init exactly.
    assertClose(
      t.training.initialLoss,
      config.PHASE94_INITIAL_LOSS,
      0,
      "treatment init equals Phase 94's recorded initial loss"
    );

    // The mandated baseline must NOT. If this ever becomes equal, the confound
    // has been fixed and both the manifest note and the report must be updated.
    assert(
      a.training.initialLoss !== t.training.initialLoss,
      "baseline init differs from treatment init — A vs T varies two things"
    );

    // Phase 94's own record of the baseline is the independent witness.
    const b94 = readJson(
      path.join(__dirname, "../../../../../experiments/phase94/candidate-B.json")
    ) as { training: { initialLoss: number } };
    assertClose(
      b94.training.initialLoss,
      config.PHASE94_INITIAL_LOSS,
      0,
      "Phase 94 cell B shares the treatment arm's init (one-constant isolation holds)"
    );
  });
}

// ============================================================
// Runners
// ============================================================

export function runPhase96StaticTests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;
  console.log("\n  -- Phase 96: Augmentation Transfer Experiment (static contracts) --");
  testManifestExists();
  testConstantsMatchManifest();
  testSingleVariable();
  testEligibilityThreshold();
  testBaselineIsReused();
  testPromptSetUnchanged();
  testFrozenInputsUnmodified();
  testEvaluatorUnchanged();
  testNoFakeMechanisms();
  testInitWartPreserved();
  testInitProvenanceRecorded();
  console.log(`  Phase 96 (static): ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}

export function runPhase96Tests(): { passed: number; failed: number; skipped: number } {
  const staticResult = runPhase96StaticTests();

  passed = 0;
  failed = 0;
  skipped = 0;
  console.log("\n  -- Phase 96: transfer experiment (artifact contracts) --");
  testPreflightArtifact();
  testAuditArtifact();
  testTrainingArtifact();
  testFailedTrainingCannotClaimCompletion();
  testEvaluationArtifacts();
  testPrimaryEndpointAndResults();
  testInitVarianceInArtifacts();
  console.log(`  Phase 96 (artifact): ${passed} passed, ${failed} failed, ${skipped} skipped`);

  return {
    passed: staticResult.passed + passed,
    failed: staticResult.failed + failed,
    skipped: staticResult.skipped + skipped,
  };
}
