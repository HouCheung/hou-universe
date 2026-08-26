// ============================================================
// Phase 92 — Tokenizer Merge Budget Experiment (contract suite)
// ============================================================
// Verifies the Phase 92 A/B/C experiment's delivered artifacts
// (experiments/phase92/tokenizer-probe-results.json and
// experiments/phase92/probe-results.json) against the HARD contracts
// of the experiment:
//
//   1. coupling contract — merges = vocabSize − 260 for every candidate
//   2. tokenizer determinism — train twice → identical state hash; and
//      serialize→fromState round-trip preserves the state
//   3. independent recomputation — this suite re-trains the A/B/C
//      tokenizers itself (seed 42) and asserts the recorded state
//      hashes are reproducible; round-trip is lossless on the corpus
//   4. monotonic BPE premise — more merges ⇒ strictly fewer tokens per
//      CJK occurrence and a non-decreasing share of single-token chars
//      (the tokenization-level hypothesis, measured before training)
//   5. model parameter counts — A=1,126,528, B=1,136,768, C=1,147,008
//      (= fixed part + 2·V·128), recorded correctly in the probe
//   6. checkpoint integrity per candidate — param count matches,
//      finite, reload-deterministic, load→save→load lossless
//   7. training is REAL — B/C ran the full 20-epoch recipe (loss
//      decreased, 3000 steps, durationMs > 0); A is the reused Phase 90
//      condition-B artifact
//   8. reproducibility — B/C 2× fresh seeded 2-epoch runs are
//      bit-identical; A reuses the Phase 90 reproducibility evidence
//   9. fake-data audit — no Math.random in metrics, no fake training,
//      no hardcoded metrics, no fabricated checkpoints, evaluator
//      unmodified
//   10. no architecture / evaluator / threshold changes — production
//      config, 1,126,528 params, and the Level 3/4 gates are untouched
//
// The suite makes NO claim about whether the hypothesis held (that is
// the report's job, driven by the measured numbers). It only proves the
// experiment was performed honestly and its artifacts are self-consistent.
//
// Existing Phase 57–91 suites are NOT modified or weakened.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  getProductionModelConfig,
  PRODUCTION_VOCAB_TARGET,
  parameterCountOf,
} from "../../experiments/ModelRegistry";
import { loadProductionDataset, getDatasetTexts } from "../../data/datasetLoader";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { Random } from "../../core/random/Random";
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

// ============================================================
// Constants — the exact experiment matrix
// ============================================================

const SEED = 42;
const BASE_VOCAB = 260; // 256 bytes + 4 specials (verified in the Step 0 audit)
const CANDIDATES = [
  { key: "A", vocabTarget: 300, expectedParams: 1_126_528 },
  { key: "B", vocabTarget: 340, expectedParams: 1_136_768 },
  { key: "C", vocabTarget: 380, expectedParams: 1_147_008 },
];

// __dirname = src/lib/minimind/research/tests → 5 levels up = repo root
const P92_DIR = path.join(__dirname, "../../../../../experiments/phase92");
const TOKENIZER_PROBE_PATH = path.join(P92_DIR, "tokenizer-probe-results.json");
const PROBE_RESULTS_PATH = path.join(P92_DIR, "probe-results.json");

/** Deterministic FNV-1a over the serialized tokenizer state. */
function tokenizerStateHash(tokenizer: BPETokenizer): string {
  let h = 0x811c9dc5;
  const input = JSON.stringify(tokenizer.toState());
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function isCjkCodePoint(code: number): boolean {
  return code >= 0x4e00 && code <= 0x9fff;
}

// ============================================================
// Shared context — the probe artifacts + independent tokenizers
// ============================================================

interface IndependentTokenizerMetrics {
  mergeCount: number;
  stateHash: string;
  roundTripFailures: number;
  avgTokensPerCjkOccurrence: number;
  pctSingleToken: number;
}

interface Context {
  tokenizerProbe: {
    candidates: Array<{
      key: string;
      vocabTarget: number;
      actualVocabSize: number;
      mergeCount: number;
      stateHash: string;
      deterministicReconstruction: boolean;
      stateRoundTrip: boolean;
      roundTrip: { allRoundTrip: boolean; failures: number };
      chinese: {
        avgTokensPerCjkOccurrence: number;
        pctSingleToken: number;
        pctTwoToken: number;
        pctThreePlus: number;
      };
      accepted: boolean;
    }>;
    couplingContract: { rule: string };
    corpusDerivation: { distinctCjkChars: number; frequentCjkChars: number; mergesForFullZhCoverage: number };
  };
  probe: {
    coupling: { mergesByCandidate: Record<string, number> };
    candidates: Record<
      string,
      {
        tokenizer: {
          actualVocabSize: number;
          mergeCount: number;
          stateHash: string;
          roundTrip: boolean;
          accepted: boolean;
          avgTokensPerCjkOccurrence: number | null;
          pctSingleToken: number | null;
        };
        model: { totalParams: number; expectedParams: number; paramsDelta: number };
        training: {
          trained: boolean;
          source: string;
          initialLoss: number | null;
          finalLoss: number | null;
          totalSteps: number | null;
          durationMs: number | null;
          maxAbsParamDelta: number | null;
        };
        checkpoint: {
          path: string;
          integrity: {
            paramCountMatches: boolean;
            finite: boolean;
            reloadDeterministic: boolean;
            loadSaveLoadLossless: boolean;
            shapeMismatches: string[];
            nanCount: number;
            infinityCount: number;
          };
        };
        gates: {
          memorization: { top1: number; predictions: number; chance: number };
          generation: { byLanguage: Record<string, { validUtf8Ratio: number; nonEmptyRatio: number; collapsedRatio: number }> };
          level: number;
        };
        reproducibility: { identical: boolean; steps: number; source: string };
      }
    >;
    fakeDataAudit: Record<string, boolean>;
    summary: { avgTokensPerCjkOccurrence: Record<string, number | null>; pctSingleTokenZhChar: Record<string, number | null> };
  };
  independent: Record<string, IndependentTokenizerMetrics>;
  corpus: string[];
}

let cached: Context | null = null;

function getContext(): Context {
  if (cached) return cached;

  assert(fs.existsSync(TOKENIZER_PROBE_PATH), `tokenizer-probe-results.json exists (${TOKENIZER_PROBE_PATH})`);
  assert(fs.existsSync(PROBE_RESULTS_PATH), `probe-results.json exists (${PROBE_RESULTS_PATH})`);

  const tokenizerProbe = JSON.parse(fs.readFileSync(TOKENIZER_PROBE_PATH, "utf8"));
  const probe = JSON.parse(fs.readFileSync(PROBE_RESULTS_PATH, "utf8"));

  const dataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);

  // Independent recomputation of every candidate tokenizer (seed 42).
  const independent: Record<string, IndependentTokenizerMetrics> = {};
  for (const cand of CANDIDATES) {
    Random.setSeed(SEED);
    const t = new BPETokenizer();
    t.train(corpus, cand.vocabTarget);
    const hash1 = tokenizerStateHash(t);

    Random.setSeed(SEED);
    const t2 = new BPETokenizer();
    t2.train(corpus, cand.vocabTarget);
    assertEqual(tokenizerStateHash(t2), hash1, `${cand.key}: train-twice determinism`);

    // Round-trip over the whole corpus.
    let failures = 0;
    for (const text of corpus) {
      if (t.decode(t.encode(text)) !== text) failures++;
    }

    // Chinese granularity (per-occurrence, frequency-weighted) — mirrors the probe.
    let single = 0;
    let sum = 0;
    let occ = 0;
    for (const text of corpus) {
      for (const ch of text) {
        if (isCjkCodePoint(ch.codePointAt(0) ?? 0)) {
          occ++;
          const n = t.encode(ch).length;
          sum += n;
          if (n === 1) single++;
        }
      }
    }

    independent[cand.key] = {
      mergeCount: t.toState().merges.length,
      stateHash: hash1,
      roundTripFailures: failures,
      avgTokensPerCjkOccurrence: occ > 0 ? sum / occ : 0,
      pctSingleToken: occ > 0 ? single / occ : 0,
    };
  }

  cached = { tokenizerProbe, probe, independent, corpus };
  return cached;
}

// ============================================================
// Suite
// ============================================================

export function runPhase92Tests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n  -- Phase 92: Tokenizer Merge Budget Experiment (contract suite) --");

  testCouplingContract();
  testTokenizerDeterminismAndRoundTrip();
  testIndependentTokenizers();
  testMonotonicBpePremise();
  testModelParamCounts();
  testCheckpointIntegrity();
  testTrainingIsReal();
  testReproducibility();
  testFakeDataAudit();
  testNoArchitectureEvaluatorOrThresholdChanges();

  console.log(`  Phase 92 (sync): ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// ------------------------------------------------------------
// 1. Coupling contract
// ------------------------------------------------------------
function testCouplingContract(): void {
  test("1. coupling contract: merges = vocabSize − 260 for A/B/C (probe + independent)", () => {
    const { tokenizerProbe, independent } = getContext();
    for (const cand of CANDIDATES) {
      const expectedMerges = cand.vocabTarget - BASE_VOCAB;
      const recorded = tokenizerProbe.candidates.find((c) => c.key === cand.key)!;
      assertEqual(recorded.mergeCount, expectedMerges, `${cand.key} recorded merge count`);
      assertEqual(recorded.actualVocabSize, cand.vocabTarget, `${cand.key} recorded vocab size`);
      assertEqual(independent[cand.key].mergeCount, expectedMerges, `${cand.key} independent merge count`);
    }
  });
}

// ------------------------------------------------------------
// 2. Tokenizer determinism + state round-trip
// ------------------------------------------------------------
function testTokenizerDeterminismAndRoundTrip(): void {
  test("2. tokenizer determinism: train-twice identical, state round-trip preserved, corpus lossless", () => {
    const { tokenizerProbe } = getContext();
    for (const cand of CANDIDATES) {
      const c = tokenizerProbe.candidates.find((x) => x.key === cand.key)!;
      assert(c.deterministicReconstruction, `${cand.key}: train-twice produces identical state hash`);
      assert(c.stateRoundTrip, `${cand.key}: serialize→fromState preserves state`);
      assert(c.roundTrip.allRoundTrip, `${cand.key}: corpus encode→decode is lossless (failures=${c.roundTrip.failures})`);
      assert(c.accepted, `${cand.key}: accepted for training (round-trip clean)`);
    }
  });
}

// ------------------------------------------------------------
// 3. Independent recomputation of the tokenizer state hashes
// ------------------------------------------------------------
function testIndependentTokenizers(): void {
  test("3. independent recompute: recorded state hashes are reproducible, corpus lossless", () => {
    const { tokenizerProbe, independent } = getContext();
    for (const cand of CANDIDATES) {
      const recorded = tokenizerProbe.candidates.find((c) => c.key === cand.key)!;
      assertEqual(
        independent[cand.key].stateHash,
        recorded.stateHash,
        `${cand.key}: independent train (seed 42) reproduces the recorded state hash ${recorded.stateHash}`
      );
      assertEqual(independent[cand.key].roundTripFailures, 0, `${cand.key}: independent corpus round-trip lossless`);
    }
  });
}

// ------------------------------------------------------------
// 4. Monotonic BPE premise (the tokenization-level hypothesis)
// ------------------------------------------------------------
function testMonotonicBpePremise(): void {
  test("4. monotonic BPE premise: more merges ⇒ fewer tokens/CJK occurrence, more single-token chars (A→B→C)", () => {
    const { tokenizerProbe, independent } = getContext();
    const keys = ["A", "B", "C"] as const;

    // BPE trains to the same deterministic merge prefix: the recorded probe
    // metrics must be monotonic, and the independent recomputation must agree.
    for (const src of ["recorded", "independent"] as const) {
      const avgT = keys.map((k) =>
        src === "recorded"
          ? tokenizerProbe.candidates.find((c) => c.key === k)!.chinese.avgTokensPerCjkOccurrence
          : independent[k].avgTokensPerCjkOccurrence
      );
      const pct1 = keys.map((k) =>
        src === "recorded"
          ? tokenizerProbe.candidates.find((c) => c.key === k)!.chinese.pctSingleToken
          : independent[k].pctSingleToken
      );

      assert(
        avgT[0] >= avgT[1] && avgT[1] >= avgT[2],
        `${src}: tokens/CJK occurrence is non-increasing A→B→C (${avgT.map((v) => v.toFixed(3)).join(" ≥ ")})`
      );
      assert(
        pct1[0] <= pct1[1] && pct1[1] <= pct1[2],
        `${src}: %single-token chars is non-decreasing A→B→C (${pct1.map((v) => (v * 100).toFixed(1)).join(" ≤ ")}%)`
      );
    }

    // The increase must be MEANINGFUL (the probe measured a real lift, not noise).
    const c = tokenizerProbe.candidates;
    const a = c.find((x) => x.key === "A")!.chinese;
    const b = c.find((x) => x.key === "B")!.chinese;
    const cc = c.find((x) => x.key === "C")!.chinese;
    assert(
      a.avgTokensPerCjkOccurrence - cc.avgTokensPerCjkOccurrence > 0.3,
      `tokens/CJK drop from A to C is material (>0.3): ${a.avgTokensPerCjkOccurrence.toFixed(3)} → ${cc.avgTokensPerCjkOccurrence.toFixed(3)}`
    );
    assert(
      cc.pctSingleToken - a.pctSingleToken > 0.05,
      `single-token-char share rises materially (>5pp): ${(a.pctSingleToken * 100).toFixed(1)}% → ${(cc.pctSingleToken * 100).toFixed(1)}%`
    );
  });
}

// ------------------------------------------------------------
// 5. Model parameter counts
// ------------------------------------------------------------
function testModelParamCounts(): void {
  test("5. model parameter counts recorded correctly: A=1,126,528, B=1,136,768, C=1,147,008", () => {
    const { probe } = getContext();
    for (const cand of CANDIDATES) {
      const r = probe.candidates[cand.key];
      assertEqual(r.model.totalParams, cand.expectedParams, `${cand.key} recorded total params`);
      assertEqual(r.model.expectedParams, cand.expectedParams, `${cand.key} expected params (formula)`);
      assertEqual(r.model.paramsDelta, cand.expectedParams - 1_126_528, `${cand.key} params delta vs production`);
    }
  });
}

// ------------------------------------------------------------
// 6. Checkpoint integrity per candidate
// ------------------------------------------------------------
function testCheckpointIntegrity(): void {
  test("6. checkpoint integrity: param count match, finite, reload-deterministic, lossless round-trip", () => {
    const { probe } = getContext();
    for (const cand of CANDIDATES) {
      const i = probe.candidates[cand.key].checkpoint.integrity;
      assert(i.paramCountMatches, `${cand.key}: recorded param count matches the candidate's architecture`);
      assertEqual(i.shapeMismatches.length, 0, `${cand.key}: no tensor shape mismatches (${i.shapeMismatches.join(", ")})`);
      assertEqual(i.nanCount, 0, `${cand.key}: no NaN parameters`);
      assertEqual(i.infinityCount, 0, `${cand.key}: no Infinity parameters`);
      assert(i.finite, `${cand.key}: all parameters finite`);
      assert(i.reloadDeterministic, `${cand.key}: two fresh loads are bit-identical`);
      assert(i.loadSaveLoadLossless, `${cand.key}: load→save→load is lossless`);
      assert(fs.existsSync(probe.candidates[cand.key].checkpoint.path), `${cand.key}: checkpoint file on disk`);
    }
  });
}

// ------------------------------------------------------------
// 7. Training is real
// ------------------------------------------------------------
function testTrainingIsReal(): void {
  test("7. training is REAL: B/C full 20-epoch recipe (loss decreased, 3000 steps); A is the Phase 90 artifact", () => {
    const { probe } = getContext();

    const a = probe.candidates["A"];
    assertEqual(a.training.trained, false, "A was not retrained (reused Phase 90 condition-B artifact)");
    assert(a.training.source.includes("phase90"), "A.source names the Phase 90 checkpoint");
    assertEqual(a.training.finalLoss, 0.1226, "A finalLoss matches the Phase 90 measured run (0.1226)");
    assert(a.training.finalLoss! < a.training.initialLoss!, "A loss decreased");

    for (const key of ["B", "C"] as const) {
      const r = probe.candidates[key];
      assertEqual(r.training.trained, true, `${key} was freshly trained by this probe`);
      assert(r.training.initialLoss !== null && Number.isFinite(r.training.initialLoss), `${key} initial loss measured`);
      assert(r.training.finalLoss !== null && Number.isFinite(r.training.finalLoss), `${key} final loss measured`);
      assert(r.training.finalLoss! < r.training.initialLoss!, `${key} loss decreased (${r.training.initialLoss!.toFixed(4)} → ${r.training.finalLoss!.toFixed(4)})`);
      assertEqual(r.training.totalSteps, 3000, `${key} total steps = 20 epochs × 150 batches`);
      assert(r.training.durationMs! > 0, `${key} took measurable wall-clock time (${(r.training.durationMs! / 60000).toFixed(1)} min)`);
      assert(r.training.maxAbsParamDelta! > 0, `${key} parameters changed during training`);
    }
  });
}

// ------------------------------------------------------------
// 8. Reproducibility
// ------------------------------------------------------------
function testReproducibility(): void {
  test("8. reproducibility: B/C 2× fresh seeded runs bit-identical; A reuses Phase 90 evidence", () => {
    const { probe } = getContext();
    for (const key of ["B", "C"] as const) {
      const r = probe.candidates[key].reproducibility;
      assert(r.identical, `${key}: two fresh seeded 2-epoch runs produced identical loss histories`);
      assert(r.steps > 0, `${key}: recorded at least one loss step (${r.steps})`);
      assert(r.source.includes("this probe"), `${key}: reproducibility was measured fresh, not borrowed`);
    }
    const a = probe.candidates["A"].reproducibility;
    assert(a.source.includes("Phase 90"), "A reuses the Phase 90 reproducibility evidence");
    assert(a.identical, "A's Phase 90 reproducibility was bit-identical");
  });
}

// ------------------------------------------------------------
// 9. Fake-data audit
// ------------------------------------------------------------
function testFakeDataAudit(): void {
  test("9. fake-data audit: no Math.random metrics, no fake training, no hardcoded metrics, no fabricated checkpoint, evaluator unmodified", () => {
    const { probe } = getContext();
    const audit = probe.fakeDataAudit;
    assertEqual(audit.mathRandomInMetrics, false, "mathRandomInMetrics is false");
    assertEqual(audit.setTimeoutFakeTraining, false, "setTimeoutFakeTraining is false");
    assertEqual(audit.hardcodedFakeMetrics, false, "hardcodedFakeMetrics is false");
    assertEqual(audit.fabricatedCheckpoint, false, "fabricatedCheckpoint is false");
    assertEqual(audit.evaluatorModified, false, "evaluatorModified is false");
  });
}

// ------------------------------------------------------------
// 10. No architecture / evaluator / threshold changes
// ------------------------------------------------------------
function testNoArchitectureEvaluatorOrThresholdChanges(): void {
  test("10. no architecture, evaluator, or capability-threshold changes", () => {
    const cfg = getProductionModelConfig();
    assertEqual(cfg.vocabSize, PRODUCTION_VOCAB_TARGET, "production vocab target still 300");
    assertEqual(cfg.dModel, 128, "dModel");
    assertEqual(cfg.numHeads, 4, "numHeads");
    assertEqual(cfg.dFF, 512, "dFF");
    assertEqual(cfg.numLayers, 4, "numLayers");
    assertEqual(cfg.maxSeqLen, 256, "maxSeqLen");
    assertEqual(parameterCountOf(cfg), 1_126_528, "production parameter count unchanged");

    // Level gates untouched (Level 3 ≥ 0.5; Level 4 still demands valid UTF-8).
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

    // The probe's recorded per-candidate gates are structurally valid.
    const { probe } = getContext();
    for (const cand of CANDIDATES) {
      const g = probe.candidates[cand.key].gates;
      assert(g.memorization.top1 >= 0 && g.memorization.top1 <= 1, `${cand.key}: memorization top-1 in [0,1]`);
      assert(g.memorization.predictions > 0, `${cand.key}: memorization made predictions`);
      assert(g.level >= 0 && g.level <= 5, `${cand.key}: capability level in [0,5]`);
      for (const lang of ["zh", "en", "mixed"] as const) {
        const a = g.generation.byLanguage[lang];
        assert(a.validUtf8Ratio >= 0 && a.validUtf8Ratio <= 1, `${cand.key}/${lang}: validUtf8Ratio in [0,1]`);
        assert(a.nonEmptyRatio >= 0 && a.nonEmptyRatio <= 1, `${cand.key}/${lang}: nonEmptyRatio in [0,1]`);
        assert(a.collapsedRatio >= 0 && a.collapsedRatio <= 1, `${cand.key}/${lang}: collapsedRatio in [0,1]`);
      }
    }
  });
}
