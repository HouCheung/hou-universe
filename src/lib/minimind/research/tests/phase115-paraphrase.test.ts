// ============================================================
// Phase 115 — closed-domain paraphrase generalization contracts
// ============================================================
// This suite never trains or generates. It checks:
//
//   1. The dataset audit passed and the leakage report is clean.
//   2. The derived ChatSft training file is accepted by the
//      production parser and contains exactly the frozen splits.
//   3. Category A equals the training prompt set; categories B
//      and C have zero exact prompt/pair overlap with training.
//   4. Fact-level splits are disjoint and category C uses facts
//      that never appear in training.
//   5. The baseline and candidate evaluations use the identical
//      frozen manifest and preserve every item.
//   6. The Phase 114 checkpoint is unchanged.
//
// If an artifact is absent, the corresponding checks report SKIP.
// ============================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  parseChatSftDatasetFile,
  type ChatSftDatasetFile,
  type ChatSftSampleData,
} from "../../data/ChatSftDataset";

const ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const PHASE_DIR = path.join(ROOT, "experiments", "phase115");
const SOURCE_PATH = path.join(PHASE_DIR, "dataset.source.json");
const TRAINING_PATH = path.join(PHASE_DIR, "training-sft.json");
const EVAL_PATH = path.join(PHASE_DIR, "eval-manifest.json");
const AUDIT_PATH = path.join(PHASE_DIR, "dataset-audit.json");
const LEAKAGE_PATH = path.join(PHASE_DIR, "leakage-report.json");
const MANIFEST_PATH = path.join(PHASE_DIR, "split-manifest.json");
const BASELINE_PATH = path.join(PHASE_DIR, "baseline-phase114-final-results.json");
const TRAINING_RESULT_PATH = path.join(PHASE_DIR, "training-result.json");
const BEST_RESULTS_PATH = path.join(PHASE_DIR, "phase115-best-results.json");
const FINAL_RESULTS_PATH = path.join(PHASE_DIR, "phase115-final-results.json");

const PHASE114_FINAL_PATH = path.join(
  ROOT,
  "experiments",
  "phase114",
  "phase114-final.ckpt.json"
);
const PHASE114_FINAL_SHA256 =
  "62e8ff3c4a865171b300336c34b7a99b9a9336dd13f826c50995f2e74e78db1a";

const PHASE113_DATASET_PATH = path.join(
  ROOT,
  "src",
  "data",
  "minimind",
  "datasets",
  "chat-sft.json"
);

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

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeForOverlap(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// ── Artifact types ───────────────────────────────────────────

interface SourcePhrasing {
  id: string;
  language: "en" | "zh";
  role: string;
  text: string;
}

interface SourceFact {
  factId: string;
  split: "train" | "validation" | "test";
  answers: { en: string; zh: string };
  phrasings: SourcePhrasing[];
}

interface SourceFile {
  facts: SourceFact[];
  splits: Record<string, string[]>;
}

interface AuditArtifact {
  pass: boolean;
  issues: string[];
  sourceSha256: string;
  tokenizerFingerprint: string;
  tokenizerMatchesPhase114: boolean;
  counts: {
    facts: number;
    factsBySplit: { train: number; validation: number; test: number };
    trainingSamples: number;
    validationSamples: number;
    evaluationItems: number;
    evaluationByCategory: { A: number; B: number; C: number };
  };
  tokenLengths: {
    maxPromptTokens: number;
    maxSequenceTokens: number;
    promptLimit: number;
    sequenceLimit: number;
    overPromptLimit: string[];
    overSequenceLimit: string[];
  };
  overlap: {
    exactPromptOverlap: { A: number; B: number; C: number };
    promptAnswerPairOverlap: { A: number; B: number; C: number };
    factSplitConflicts: string[];
  };
}

interface LeakageArtifact {
  pass: boolean;
  exactPromptOverlap: { A: string[]; B: string[]; C: string[] };
  promptAnswerPairOverlap: { A: string[]; B: string[]; C: string[] };
  factSplitConflicts: string[];
}

interface EvalItemArtifact {
  id: string;
  factId: string;
  language: "en" | "zh";
  category: "A" | "B" | "C";
  trainingSplit: string;
  prompt: string;
  gold: string;
}

interface EvalManifestArtifact {
  phase: string;
  items: EvalItemArtifact[];
}

interface SummaryArtifact {
  correct: number;
  total: number;
  emRate: number;
  meanTokenF1: number;
  eosStops: number;
  eosStopRate: number;
  emptyOutputs: number;
  emptyOutputRate: number;
}

interface EvaluationArtifact {
  phase: string;
  label: string;
  checkpoint: { path: string; sha256: string; tokenizerSource: string };
  inputs: {
    evalManifestSha256: string;
    sourceDatasetSha256: string;
    tokenizerFingerprint: string;
    decoding: { temperature: number; maxTokens: number; enforceUtf8: boolean };
  };
  primaryMetric: { name: string; correct: number; total: number; rate: number };
  aggregates: {
    overall: SummaryArtifact;
    byCategory: { A: SummaryArtifact; B: SummaryArtifact; C: SummaryArtifact };
  };
  perFactB: Array<{ factId: string; total: number; correct: number }>;
  items: Array<{ id: string; category: string; factId: string }>;
}

interface TrainingResultArtifact {
  phase: string;
  inputs: {
    initialCheckpointSha256: string;
    trainingDatasetSha256: string;
    sourceDatasetSha256: string;
    tokenizerFingerprint: string;
  };
  hyperparameters: { totalSteps: number };
  retained: {
    initial: { step: number; sha256: string };
    best: { step: number; sha256: string; valLoss: number };
    final: { step: number; sha256: string };
  };
  initialValidationLoss: number;
  finalGlobalStep: number;
}

interface SplitManifestArtifact {
  sourceSha256: string;
  trainingDatasetSha256: string;
  tokenizerFingerprint: string;
}

// ── Test suite ───────────────────────────────────────────────

export function runPhase115Tests(): {
  passed: number;
  failed: number;
  skipped: number;
} {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\nPhase 115: Closed-domain paraphrase generalization");

  // ── Dataset audit ────────────────────────────────────────
  if (!fs.existsSync(AUDIT_PATH)) {
    skip("dataset audit", "experiments/phase115/dataset-audit.json is absent");
  } else {
    const audit = readJson<AuditArtifact>(AUDIT_PATH);

    test("dataset audit passed with no issues", () => {
      assert(audit.pass === true, "audit.pass is true");
      assert(
        Array.isArray(audit.issues) && audit.issues.length === 0,
        `audit.issues is empty (found ${audit.issues.length})`
      );
      assert(audit.tokenizerMatchesPhase114 === true, "tokenizer matches Phase 114");
    });

    test("frozen fact and evaluation counts are exact", () => {
      assert(audit.counts.facts === 20, `20 facts, found ${audit.counts.facts}`);
      assert(audit.counts.factsBySplit.train === 12, "12 train facts");
      assert(audit.counts.factsBySplit.validation === 4, "4 validation facts");
      assert(audit.counts.factsBySplit.test === 4, "4 test facts");
      assert(audit.counts.trainingSamples === 72, "72 training samples");
      assert(audit.counts.validationSamples === 24, "24 validation samples");
      assert(audit.counts.evaluationItems === 144, "144 evaluation items");
      assert(audit.counts.evaluationByCategory.A === 72, "72 category A items");
      assert(audit.counts.evaluationByCategory.B === 48, "48 category B items");
      assert(audit.counts.evaluationByCategory.C === 24, "24 category C items");
    });

    test("tokenizer and prompt-length contracts pass", () => {
      assert(
        audit.tokenizerFingerprint ===
          "a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d",
        "tokenizer fingerprint is the frozen Phase 114 fingerprint"
      );
      assert(
        audit.tokenLengths.maxPromptTokens <= audit.tokenLengths.promptLimit,
        "every prompt is within the prompt-token limit"
      );
      assert(
        audit.tokenLengths.maxSequenceTokens <= audit.tokenLengths.sequenceLimit,
        "every sequence is within the block size"
      );
      assert(audit.tokenLengths.overPromptLimit.length === 0, "no prompts over the limit");
      assert(audit.tokenLengths.overSequenceLimit.length === 0, "no sequences over the limit");
    });

    test("leakage checks are clean", () => {
      assert(audit.overlap.exactPromptOverlap.B === 0, "B has no training prompts");
      assert(audit.overlap.exactPromptOverlap.C === 0, "C has no training prompts");
      assert(
        audit.overlap.exactPromptOverlap.A === audit.counts.evaluationByCategory.A,
        "A is exactly the training prompt set"
      );
      assert(audit.overlap.promptAnswerPairOverlap.B === 0, "B has no training pairs");
      assert(audit.overlap.promptAnswerPairOverlap.C === 0, "C has no training pairs");
      assert(audit.overlap.factSplitConflicts.length === 0, "fact splits are disjoint");
    });
  }

  if (!fs.existsSync(LEAKAGE_PATH)) {
    skip("leakage report", "experiments/phase115/leakage-report.json is absent");
  } else {
    const leakage = readJson<LeakageArtifact>(LEAKAGE_PATH);
    test("leakage report independently passes", () => {
      assert(leakage.pass === true, "leakage.pass is true");
      assert(leakage.exactPromptOverlap.B.length === 0, "B prompt overlap list is empty");
      assert(leakage.exactPromptOverlap.C.length === 0, "C prompt overlap list is empty");
      assert(leakage.promptAnswerPairOverlap.B.length === 0, "B pair overlap list is empty");
      assert(leakage.promptAnswerPairOverlap.C.length === 0, "C pair overlap list is empty");
    });
  }

  if (!fs.existsSync(PHASE113_DATASET_PATH) || !fs.existsSync(SOURCE_PATH)) {
    skip(
      "Phase 113/114 cross-phase overlap",
      "the Phase 113/114 dataset or the Phase 115 source is absent"
    );
  } else {
    test("Phase 115 prompts and answers do not overlap the Phase 113/114 dataset", () => {
      const phase113 = readJson<{
        samples: Array<{ turns: Array<{ user: string; assistant: string }> }>;
      }>(PHASE113_DATASET_PATH);
      const source = readJson<SourceFile>(SOURCE_PATH);
      const users = new Set<string>();
      const assistants = new Set<string>();
      for (const sample of phase113.samples) {
        for (const turn of sample.turns) {
          users.add(normalizeForOverlap(turn.user));
          assistants.add(normalizeForOverlap(turn.assistant));
        }
      }
      const prompts = source.facts.flatMap((fact) =>
        fact.phrasings.map((phrasing) => phrasing.text)
      );
      const answers = source.facts.flatMap((fact) => [
        fact.answers.en,
        fact.answers.zh,
      ]);
      assert(prompts.length === 168, `168 source prompts, found ${prompts.length}`);
      assert(answers.length === 40, `40 canonical answers, found ${answers.length}`);
      const promptOverlap = prompts.filter((prompt) =>
        users.has(normalizeForOverlap(prompt))
      );
      const answerOverlap = answers.filter((answer) =>
        assistants.has(normalizeForOverlap(answer))
      );
      assert(
        promptOverlap.length === 0,
        `no Phase 115 prompt appears in Phase 113/114: ${promptOverlap.join(" | ")}`
      );
      assert(
        answerOverlap.length === 0,
        `no Phase 115 answer appears in Phase 113/114: ${answerOverlap.join(" | ")}`
      );
    });
  }

  // ── Derived training dataset ─────────────────────────────
  let trainingDataset: ChatSftDatasetFile | null = null;
  if (!fs.existsSync(TRAINING_PATH)) {
    skip("training dataset", "experiments/phase115/training-sft.json is absent");
  } else {
    try {
      trainingDataset = parseChatSftDatasetFile(
        readJson<unknown>(TRAINING_PATH)
      );
    } catch (error) {
      failed++;
      console.error("  ✗ FAIL: training dataset is accepted by the production parser");
      console.error(
        `    ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (trainingDataset) {
      const parsed = trainingDataset;

      test("train and validation split sizes are exact", () => {
        const train = parsed.samples.filter((sample) => sample.split === "train");
        const validation = parsed.samples.filter(
          (sample) => sample.split === "validation"
        );
        const test = parsed.samples.filter((sample) => sample.split === "test");
        assert(train.length === 72, `72 train samples, found ${train.length}`);
        assert(
          validation.length === 24,
          `24 validation samples, found ${validation.length}`
        );
        assert(test.length === 0, `no test samples, found ${test.length}`);
      });

      test("every training sample has one turn and a canonical answer", () => {
        for (const sample of parsed.samples as ChatSftSampleData[]) {
          assert(sample.turns.length === 1, `${sample.id} has one turn`);
          assert(
            sample.turns[0].assistant.length > 0,
            `${sample.id} has a non-empty answer`
          );
        }
      });

      test("sample ids are unique", () => {
        const ids = new Set(parsed.samples.map((sample) => sample.id));
        assert(ids.size === parsed.samples.length, "sample ids are unique");
      });
    }
  }

  // ── Frozen evaluation manifest ───────────────────────────
  let evalManifest: EvalManifestArtifact | null = null;
  if (!fs.existsSync(EVAL_PATH)) {
    skip("evaluation manifest", "experiments/phase115/eval-manifest.json is absent");
  } else {
    evalManifest = readJson<EvalManifestArtifact>(EVAL_PATH);

    test("evaluation manifest has the frozen category counts", () => {
      assert(evalManifest!.phase === "115", "phase is 115");
      assert(evalManifest!.items.length === 144, "144 items");
      const counts = { A: 0, B: 0, C: 0 };
      for (const item of evalManifest!.items) counts[item.category] += 1;
      assert(counts.A === 72, `72 category A, found ${counts.A}`);
      assert(counts.B === 48, `48 category B, found ${counts.B}`);
      assert(counts.C === 24, `24 category C, found ${counts.C}`);
    });

    if (trainingDataset) {
      const parsed = trainingDataset;

      test("category A is exactly the training prompt set", () => {
        const trainPrompts = new Set(
          parsed.samples
            .filter((sample) => sample.split === "train")
            .map((sample) => sample.turns[0].user)
        );
        const aPrompts = evalManifest!.items
          .filter((item) => item.category === "A")
          .map((item) => item.prompt);
        assert(
          aPrompts.length === trainPrompts.size,
          "A has one item per training prompt"
        );
        for (const prompt of aPrompts) {
          assert(trainPrompts.has(prompt), `A prompt is in training: ${prompt}`);
        }
      });

      test("categories B and C never reuse a training prompt", () => {
        const trainPrompts = new Set(
          parsed.samples.map((sample) => sample.turns[0].user)
        );
        for (const item of evalManifest!.items) {
          if (item.category === "B" || item.category === "C") {
            assert(
              !trainPrompts.has(item.prompt),
              `${item.category} prompt is not in training: ${item.prompt}`
            );
          }
        }
      });
    } else {
      skip("category A equality", "training dataset is unavailable");
      skip("B/C prompt isolation", "training dataset is unavailable");
    }

    if (fs.existsSync(SOURCE_PATH)) {
      const source = readJson<SourceFile>(SOURCE_PATH);
      const facts = new Map(source.facts.map((fact) => [fact.factId, fact]));

      test("category B uses train facts and category C uses test facts", () => {
        for (const item of evalManifest!.items) {
          const fact = facts.get(item.factId);
          assert(fact !== undefined, `fact ${item.factId} exists`);
          if (item.category === "B") {
            assert(fact!.split === "train", `${item.factId} is a train fact`);
            const phrasing = fact!.phrasings.find((entry) => entry.id === item.id);
            assert(
              phrasing?.role === "unseen-paraphrase",
              `${item.id} has role unseen-paraphrase`
            );
          }
          if (item.category === "C") {
            assert(fact!.split === "test", `${item.factId} is a test fact`);
            const phrasing = fact!.phrasings.find((entry) => entry.id === item.id);
            assert(
              phrasing?.role === "unseen-fact",
              `${item.id} has role unseen-fact`
            );
          }
        }
      });

      test("every evaluation item uses its fact-language canonical answer", () => {
        for (const item of evalManifest!.items) {
          const fact = facts.get(item.factId);
          assert(fact !== undefined, `fact ${item.factId} exists`);
          assert(
            item.gold === fact!.answers[item.language],
            `${item.id} gold matches the canonical ${item.language} answer`
          );
        }
      });

      test("no validation fact appears in the primary evaluation manifest", () => {
        const validationFacts = new Set(
          source.facts
            .filter((fact) => fact.split === "validation")
            .map((fact) => fact.factId)
        );
        for (const item of evalManifest!.items) {
          assert(
            !validationFacts.has(item.factId),
            `${item.factId} is not a validation fact`
          );
        }
      });
    }
  }

  // ── Frozen input hashes ──────────────────────────────────
  if (fs.existsSync(MANIFEST_PATH) && fs.existsSync(SOURCE_PATH)) {
    const manifest = readJson<SplitManifestArtifact>(MANIFEST_PATH);
    test("frozen source and dataset hashes match the files", () => {
      assert(
        manifest.sourceSha256 === sha256File(SOURCE_PATH),
        "source hash matches dataset.source.json"
      );
      if (fs.existsSync(TRAINING_PATH)) {
        assert(
          manifest.trainingDatasetSha256 === sha256File(TRAINING_PATH),
          "training dataset hash matches training-sft.json"
        );
      }
      assert(
        manifest.tokenizerFingerprint ===
          "a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d",
        "manifest records the frozen tokenizer fingerprint"
      );
    });
  }

  // ── Historical checkpoint ────────────────────────────────
  if (!fs.existsSync(PHASE114_FINAL_PATH)) {
    skip("Phase 114 checkpoint unchanged", "Phase 114 final checkpoint is absent");
  } else {
    test("Phase 114 final checkpoint is unchanged", () => {
      assert(
        sha256File(PHASE114_FINAL_PATH) === PHASE114_FINAL_SHA256,
        "Phase 114 final checkpoint hash is unchanged"
      );
    });
  }

  // ── Baseline results ─────────────────────────────────────
  let baseline: EvaluationArtifact | null = null;
  if (!fs.existsSync(BASELINE_PATH)) {
    skip("baseline results", "baseline-phase114-final-results.json is absent");
  } else {
    baseline = readJson<EvaluationArtifact>(BASELINE_PATH);

    test("baseline uses the frozen manifest and greedy decoding", () => {
      assert(baseline!.phase === "115", "phase is 115");
      assert(baseline!.items.length === 144, "144 evaluated items");
      assert(
        baseline!.inputs.decoding.temperature === 0,
        "temperature 0 (greedy)"
      );
      assert(
        baseline!.inputs.decoding.enforceUtf8 === true,
        "UTF-8 enforcement is active"
      );
      assert(
        baseline!.checkpoint.sha256 === PHASE114_FINAL_SHA256,
        "baseline checkpoint is the Phase 114 final checkpoint"
      );
      assert(
        baseline!.inputs.sourceDatasetSha256 ===
          readJson<AuditArtifact>(AUDIT_PATH).sourceSha256,
        "baseline records the frozen source dataset hash"
      );
    });

    test("baseline reports the predeclared primary metric over 48 B items", () => {
      assert(baseline!.primaryMetric.total === 48, "primary metric denominator is 48");
      assert(
        baseline!.aggregates.byCategory.B.total === 48,
        "category B aggregate has 48 items"
      );
      assert(baseline!.aggregates.byCategory.A.total === 72, "category A has 72 items");
      assert(baseline!.aggregates.byCategory.C.total === 24, "category C has 24 items");
      assert(
        typeof baseline!.aggregates.overall.eosStopRate === "number",
        "EOS stop rate is reported"
      );
      assert(
        typeof baseline!.aggregates.overall.emptyOutputRate === "number",
        "empty-output rate is reported"
      );
      assert(baseline!.perFactB.length === 12, "per-fact B results cover 12 facts");
    });
  }

  // ── Training artifacts ───────────────────────────────────
  if (!fs.existsSync(TRAINING_RESULT_PATH)) {
    skip("training artifacts", "training-result.json is absent");
  } else {
    const training = readJson<TrainingResultArtifact>(TRAINING_RESULT_PATH);

    test("training started from the Phase 114 final checkpoint", () => {
      assert(training.phase === "115", "phase is 115");
      assert(
        training.inputs.initialCheckpointSha256 === PHASE114_FINAL_SHA256,
        "initial checkpoint hash is the Phase 114 final hash"
      );
      assert(
        training.hyperparameters.totalSteps === 288,
        "288 total steps"
      );
      assert(training.finalGlobalStep === 288, "final global step is 288");
    });

    test("training records initial, best-validation, and final snapshots", () => {
      assert(
        training.retained.initial.sha256 === PHASE114_FINAL_SHA256,
        "initial snapshot is the Phase 114 final checkpoint"
      );
      assert(
        typeof training.retained.best.sha256 === "string" &&
          training.retained.best.sha256.length === 64,
        "best snapshot hash is recorded"
      );
      assert(
        typeof training.retained.final.sha256 === "string" &&
          training.retained.final.sha256.length === 64,
        "final snapshot hash is recorded"
      );
      assert(
        training.retained.best.valLoss <= training.initialValidationLoss,
        "best validation loss is not worse than the initial validation loss"
      );
      assert(training.retained.final.step === 288, "final snapshot is step 288");
    });

    test("training hashes agree with the frozen dataset manifest", () => {
      if (!fs.existsSync(MANIFEST_PATH)) {
        skip("training hash agreement", "split manifest is absent");
        return;
      }
      const manifest = readJson<SplitManifestArtifact>(MANIFEST_PATH);
      assert(
        training.inputs.trainingDatasetSha256 === manifest.trainingDatasetSha256,
        "training dataset hash matches the split manifest"
      );
      assert(
        training.inputs.sourceDatasetSha256 === manifest.sourceSha256,
        "source dataset hash matches the split manifest"
      );
      assert(
        training.inputs.tokenizerFingerprint === manifest.tokenizerFingerprint,
        "tokenizer fingerprint matches the split manifest"
      );
    });
  }

  // ── Candidate evaluations ────────────────────────────────
  const candidatePaths = [
    { label: "best", file: BEST_RESULTS_PATH },
    { label: "final", file: FINAL_RESULTS_PATH },
  ];
  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate.file)) {
      skip(`${candidate.label} evaluation`, `${candidate.label} results are absent`);
      continue;
    }
    const result = readJson<EvaluationArtifact>(candidate.file);

    test(`${candidate.label} evaluation uses the identical frozen manifest`, () => {
      assert(result.phase === "115", "phase is 115");
      assert(result.items.length === 144, "144 items");
      assert(result.primaryMetric.total === 48, "primary metric denominator is 48");
      if (baseline) {
        assert(
          result.inputs.evalManifestSha256 === baseline.inputs.evalManifestSha256,
          "eval manifest hash matches the baseline"
        );
        const baselineIds = new Set(baseline.items.map((item) => item.id));
        for (const item of result.items) {
          assert(baselineIds.has(item.id), `item ${item.id} is in the frozen manifest`);
        }
        const resultIds = new Set(result.items.map((item) => item.id));
        assert(resultIds.size === 144, "all 144 frozen items are present");
      }
      assert(result.perFactB.length === 12, "per-fact B results cover 12 facts");
      assert(
        typeof result.aggregates.byCategory.B.eosStopRate === "number",
        "category B EOS stop rate is reported"
      );
      assert(
        typeof result.aggregates.byCategory.B.emptyOutputRate === "number",
        "category B empty-output rate is reported"
      );
    });
  }

  console.log(
    `  Phase 115: ${passed} passed, ${failed} failed, ${skipped} skipped`
  );
  return { passed, failed, skipped };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("phase115-paraphrase.test.ts")) {
  const result = runPhase115Tests();
  if (result.failed > 0) process.exitCode = 1;
}
