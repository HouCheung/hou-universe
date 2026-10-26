// ============================================================
// Phase 114 — Chat SFT failure diagnostic (artifact contracts)
// ============================================================
// This suite never trains or generates. It checks the artifacts
// produced by experiments/phase114:
//
//   1. train-fit.json separates "learned the training mapping"
//      from "transferred to held-out questions".
//   2. phase114-final.ckpt.json is the FINAL (step-336) snapshot,
//      not the early-stopped step-84 snapshot Phase 113 saved.
//   3. The final snapshot fits the training split at least as well
//      as the step-84 snapshot.
//
// If an artifact is absent, the corresponding checks report SKIP.
// Nothing here re-scores the frozen Phase 113 benchmark.
// ============================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const PHASE_DIR = path.join(ROOT, "experiments", "phase114");
const TRAIN_FIT_PATH = path.join(PHASE_DIR, "train-fit.json");
const FINAL_CKPT_PATH = path.join(PHASE_DIR, "phase114-final.ckpt.json");
const FINAL_RESULTS_PATH = path.join(PHASE_DIR, "phase114-final-results.json");

let passed = 0;
let failed = 0;
let skipped = 0;

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

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

interface SplitSummary {
  count: number;
  correct: number;
  sequenceExact: number;
  tokenAccuracy: number;
  meanNll: number;
}

interface TrainFitArtifact {
  phase: string;
  arms: Record<
    string,
    { checkpointPath: string; tokenizerSource: string; splits: Record<string, SplitSummary> }
  >;
}

interface FinalResultsArtifact {
  phase: string;
  totalSteps: number;
  candidates: Array<{
    step: number;
    valLoss: number;
    trainFit: { correct: number; total: number; sequenceExact: number; nll: number };
  }>;
  evaluation: {
    train: { summary: { count: number; correct: number } };
    validation: { summary: { count: number; correct: number } };
    test: { summary: { count: number; correct: number } };
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function runPhase114Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\nPhase 114: Chat SFT failure diagnostic");

  // ── Diagnostic artifact ──────────────────────────────────

  if (!fs.existsSync(TRAIN_FIT_PATH)) {
    skip("train-fit artifact", "experiments/phase114/train-fit.json is absent");
  } else {
    const fit = readJson<TrainFitArtifact>(TRAIN_FIT_PATH);

    test("diagnostic artifact has phase 114 and all three arms", () => {
      assert(fit.phase === "114", "phase is 114");
      for (const arm of ["A", "B", "C"]) {
        assert(fit.arms[arm] !== undefined, `arm ${arm} is present`);
      }
    });

    test("B learned its training mapping (teacher-forced fit is high)", () => {
      const train = fit.arms.B.splits.train;
      assert(train !== undefined, "B/train is present");
      assert(
        train.tokenAccuracy > 0.8,
        `B/train token accuracy ${train.tokenAccuracy.toFixed(4)} > 0.8`
      );
      assert(train.meanNll < 1, `B/train NLL ${train.meanNll.toFixed(4)} < 1`);
      assert(train.correct > 0, `B/train free-running EM ${train.correct} > 0`);
    });

    test("B did not transfer to the held-out split", () => {
      const testSplit = fit.arms.B.splits.test;
      assert(testSplit !== undefined, "B/test is present");
      assert(testSplit.correct === 0, "B/test exact match is 0");
      assert(
        testSplit.tokenAccuracy < 0.5,
        `B/test token accuracy ${testSplit.tokenAccuracy.toFixed(4)} < 0.5`
      );
    });

    test("no-SFT baseline A has near-chance training fit", () => {
      const train = fit.arms.A.splits.train;
      assert(train.tokenAccuracy < 0.2, "A/train token accuracy < 0.2");
      assert(train.meanNll > 5, "A/train NLL > 5");
    });

    test("mismatched-answer control C has no free-running training exact match", () => {
      const train = fit.arms.C.splits.train;
      assert(train.correct === 0, "C/train exact match is 0");
      assert(
        train.tokenAccuracy < 0.8,
        "C/train token accuracy stays below B's learned fit"
      );
    });
  }

  // ── Final-snapshot artifact ──────────────────────────────

  if (!fs.existsSync(FINAL_CKPT_PATH)) {
    skip("final checkpoint artifact", "phase114-final.ckpt.json is absent");
  } else {
    test("final checkpoint carries the registered recipe metadata", () => {
      const checkpoint = readJson<{
        version: number;
        metadata?: {
          vocabSize?: number;
          trainingSteps?: number;
          epochs?: number;
          tokenizerState?: unknown;
          modelConfig?: { vocabSize: number; dModel: number; numHeads: number };
        };
      }>(FINAL_CKPT_PATH);
      assert(checkpoint.version === 3, "checkpoint version is 3");
      assert(checkpoint.metadata?.vocabSize === 300, "vocab size is 300");
      assert(checkpoint.metadata !== undefined, "metadata is present");
      assert(checkpoint.metadata?.trainingSteps === 336, "trainingSteps is 336");
      assert(checkpoint.metadata?.epochs === 16, "epochs is 16");
      assert(
        checkpoint.metadata?.tokenizerState !== undefined,
        "tokenizerState is present (importable without reconstruction)"
      );
      assert(
        checkpoint.metadata?.modelConfig?.dModel === 128 &&
          checkpoint.metadata?.modelConfig?.numHeads === 4,
        "model config is the production architecture"
      );
      const bytes = fs.statSync(FINAL_CKPT_PATH).size;
      assert(bytes > 70_000_000, `checkpoint is ${bytes} bytes (> 70 MB)`);
    });

    test("final checkpoint is not the step-84 snapshot", () => {
      const finalSha = crypto
        .createHash("sha256")
        .update(fs.readFileSync(FINAL_CKPT_PATH))
        .digest("hex");
      const step84Sha =
        "f56e4ce39aa3c86981613f6c5361d8e7fa57aa4389625e7455a7202ddea0288d";
      assert(finalSha !== step84Sha, "final snapshot differs from phase113-sft.ckpt.json");
    });
  }

  if (!fs.existsSync(FINAL_RESULTS_PATH)) {
    skip("final results artifact", "phase114-final-results.json is absent");
  } else {
    const results = readJson<FinalResultsArtifact>(FINAL_RESULTS_PATH);

    test("final results include the step-336 candidate", () => {
      assert(results.phase === "114", "phase is 114");
      const last = results.candidates[results.candidates.length - 1];
      assert(last !== undefined && last.step === 336, "last candidate is step 336");
      assert(
        last.trainFit.correct / last.trainFit.total > 0.8,
        "step-336 teacher-forced training accuracy > 0.8"
      );
    });

    test("final snapshot recalls more training answers than the step-84 snapshot", () => {
      const finalTrain = results.evaluation.train.summary;
      assert(finalTrain.count === 84, "train split has 84 items");
      assert(
        finalTrain.correct >= 25,
        `final train EM ${finalTrain.correct}/84 is at least the step-84 25/84`
      );
    });

    test("final snapshot still does not answer the frozen held-out set", () => {
      assert(results.evaluation.test.summary.correct === 0, "held-out EM remains 0/27");
    });
  }

  console.log(
    `  Phase 114: ${passed} passed, ${failed} failed, ${skipped} skipped`
  );
  return { passed, failed, skipped };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("phase114-chat-sft-diagnostic.test.ts")) {
  const result = runPhase114Tests();
  if (result.failed > 0) process.exitCode = 1;
}
