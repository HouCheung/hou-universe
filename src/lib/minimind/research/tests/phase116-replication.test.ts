// ============================================================
// Phase 116 — replication and robustness contracts
// ============================================================
// This suite never trains or generates. It checks:
//
//   1. The frozen Phase 116 dataset audit and leakage report pass.
//   2. Counts and splits are exact: 26 facts (16/4/6), 96 training,
//      24 validation, 196 evaluation items (A96/B64/C36).
//   3. Category A equals the training prompt set; B and C have zero
//      exact and zero normalized prompt or prompt-answer overlap.
//   4. Category C facts and answers never appear in training.
//   5. B phrasings are materially different from their seen prompts.
//   6. Cross-phase overlap with Phase 115 and Phase 113/114 is zero.
//   7. The freeze manifest still matches every frozen file.
//   8. Each retained evaluation uses the identical frozen manifest
//      and reports the primary denominator of 64 over 16 facts.
//   9. The decision-rule grade is mechanically consistent with the
//      recorded per-seed results.
//  10. Phase 113/114/115 artifacts and the Phase 114 checkpoint are
//      unchanged.
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
const PHASE_DIR = path.join(ROOT, "experiments", "phase116");
const SOURCE_PATH = path.join(PHASE_DIR, "dataset.source.json");
const TRAINING_PATH = path.join(PHASE_DIR, "training-sft.json");
const EVAL_PATH = path.join(PHASE_DIR, "eval-manifest.json");
const VALIDATION_PATH = path.join(PHASE_DIR, "validation-manifest.json");
const AUDIT_PATH = path.join(PHASE_DIR, "dataset-audit.json");
const LEAKAGE_PATH = path.join(PHASE_DIR, "leakage-report.json");
const MANIFEST_PATH = path.join(PHASE_DIR, "split-manifest.json");
const FREEZE_PATH = path.join(PHASE_DIR, "freeze-manifest.json");
const DECISION_PATH = path.join(PHASE_DIR, "decision-rule.json");
const OVERLAP_PATH = path.join(PHASE_DIR, "lexical-overlap.json");
const BASELINE_PATH = path.join(PHASE_DIR, "baseline-phase114-final-results.json");
const AGGREGATE_PATH = path.join(PHASE_DIR, "aggregate-results.json");

const PHASE114_FINAL_PATH = path.join(
  ROOT,
  "experiments",
  "phase114",
  "phase114-final.ckpt.json"
);
const PHASE114_FINAL_SHA256 =
  "62e8ff3c4a865171b300336c34b7a99b9a9336dd13f826c50995f2e74e78db1a";
const TOKENIZER_FINGERPRINT =
  "a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d";

const PHASE115_FILES: Array<{ file: string; sha256: string }> = [
  {
    file: "experiments/phase115/dataset.source.json",
    sha256: "f2fadb9b0e43f1b9c0e71cc7fd244dac399a65e417c109f906ab35b9d56799f6",
  },
  {
    file: "experiments/phase115/eval-manifest.json",
    sha256: "264738130e2edba7b881a3cc0f0b2c596f25b6e7cf092d3d72d3c7c0c074aef3",
  },
  {
    file: "experiments/phase115/decision-rule.json",
    sha256: "baee90c99a9aa239f3043f27833d8fc394116abdaada44a26c21f867a2db3ec5",
  },
  {
    file: "experiments/phase115/phase115-final-results.json",
    sha256: "51283f934e645caac265a31d672f57963d9ee8db58b9b42b155357aa6d93f59e",
  },
  {
    file: "src/lib/minimind/research/PHASE115-PARAPHRASE-GENERALIZATION-REPORT.md",
    sha256: "30111c1e7568b8c3f607bc63a4b8dfcd81363eb426a26e87916842e5d1d7f10f",
  },
];

const PHASE113_DATASET_PATH = path.join(
  ROOT,
  "src",
  "data",
  "minimind",
  "datasets",
  "chat-sft.json"
);
const PHASE113_DATASET_SHA256 =
  "efea181ee833ce1e584ebbb493b111c7c1b9955d40591d2420ada9c36e539312";

const PRIMARY_SEEDS = [42, 43, 44];
const B_THRESHOLD = 13;
const A_FLOOR = 64;

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

function normalizeTokens(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string, language: "en" | "zh"): Set<string> {
  const normalized = normalizeTokens(text);
  if (language === "en") {
    return new Set(normalized.split(" ").filter((token) => token.length > 0));
  }
  const chars = Array.from(normalized.replace(/\s+/g, ""));
  const grams = new Set<string>();
  for (let index = 0; index < chars.length - 1; index++) {
    grams.add(chars[index] + chars[index + 1]);
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
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
  dataset: string;
  version: string;
  facts: SourceFact[];
  splits: Record<string, string[]>;
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
  checkpoint: { path: string; sha256: string };
  inputs: {
    evalManifestSha256: string;
    sourceDatasetSha256: string;
    tokenizerFingerprint: string;
    decoding: { temperature: number; maxTokens: number; enforceUtf8: boolean };
  };
  integrity: {
    utf8EnforcedOnEveryItem: boolean;
    contextTruncations: number;
    errorStops: number;
  };
  primaryMetric: { name: string; correct: number; total: number; rate: number };
  aggregates: {
    overall: SummaryArtifact;
    byCategory: { A: SummaryArtifact; B: SummaryArtifact; C: SummaryArtifact };
    byLanguage: Record<"en" | "zh", SummaryArtifact>;
  };
  perFactB: Array<{ factId: string; total: number; correct: number }>;
  items: ItemResultArtifact[];
}

interface ItemResultArtifact {
  id: string;
  factId: string;
  category: "A" | "B" | "C";
  correct: boolean;
}

interface TrainingResultArtifact {
  phase: string;
  seed: number;
  inputs: {
    initialCheckpointSha256: string;
    trainingDatasetSha256: string;
    sourceDatasetSha256: string;
    tokenizerFingerprint: string;
  };
  hyperparameters: { totalSteps: number; dataLoaderSeed: number };
  retained: {
    initial: { step: number; sha256: string };
    best: { step: number; sha256: string; valLoss: number };
    final: { step: number; sha256: string; valLoss: number };
  };
  finalGlobalStep: number;
}

// ── Test suite ───────────────────────────────────────────────

export function runPhase116Tests(): {
  passed: number;
  failed: number;
  skipped: number;
} {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\nPhase 116: Replication and robustness of paraphrase transfer");

  // ── Dataset audit ────────────────────────────────────────
  let auditSourceSha256: string | null = null;
  if (!fs.existsSync(AUDIT_PATH)) {
    skip("dataset audit", "experiments/phase116/dataset-audit.json is absent");
  } else {
    const audit = readJson<{
      phase: string;
      pass: boolean;
      issues: string[];
      sourceSha256: string;
      tokenizerFingerprint: string;
      tokenizerMatchesPhase114: boolean;
      phase114FinalCheckpointSha256: string;
      counts: {
        facts: number;
        factsBySplit: { train: number; validation: number; test: number };
        phrasings: number;
        trainingSamples: number;
        validationSamples: number;
        evaluationItems: number;
        evaluationByCategory: { A: number; B: number; C: number };
        evaluationByCategoryLanguage: {
          A: { en: number; zh: number };
          B: { en: number; zh: number };
          C: { en: number; zh: number };
        };
        evaluationFactsByCategory: { A: number; B: number; C: number };
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
        normalizedPromptOverlap: { A: number; B: number; C: number };
        exactPromptAnswerPairOverlap: { A: number; B: number; C: number };
        normalizedPromptAnswerPairOverlap: { A: number; B: number; C: number };
        factSplitConflicts: string[];
      };
    }>(AUDIT_PATH);
    auditSourceSha256 = audit.sourceSha256;

    test("dataset audit passed with no issues", () => {
      assert(audit.phase === "116", "phase is 116");
      assert(audit.pass === true, "audit.pass is true");
      assert(Array.isArray(audit.issues) && audit.issues.length === 0, "audit.issues is empty");
      assert(audit.tokenizerMatchesPhase114 === true, "tokenizer matches Phase 114");
      assert(
        audit.tokenizerFingerprint === TOKENIZER_FINGERPRINT,
        "tokenizer fingerprint is the frozen fingerprint"
      );
      assert(
        audit.phase114FinalCheckpointSha256 === PHASE114_FINAL_SHA256,
        "audit records the Phase 114 final checkpoint hash"
      );
    });

    test("frozen fact and evaluation counts are exact", () => {
      assert(audit.counts.facts === 26, `26 facts, found ${audit.counts.facts}`);
      assert(audit.counts.factsBySplit.train === 16, "16 train facts");
      assert(audit.counts.factsBySplit.validation === 4, "4 validation facts");
      assert(audit.counts.factsBySplit.test === 6, "6 test facts");
      assert(audit.counts.phrasings === 220, "220 phrasings");
      assert(audit.counts.trainingSamples === 96, "96 training samples");
      assert(audit.counts.validationSamples === 24, "24 validation samples");
      assert(audit.counts.evaluationItems === 196, "196 evaluation items");
      assert(audit.counts.evaluationByCategory.A === 96, "96 category A items");
      assert(audit.counts.evaluationByCategory.B === 64, "64 category B items");
      assert(audit.counts.evaluationByCategory.C === 36, "36 category C items");
      assert(audit.counts.evaluationFactsByCategory.B === 16, "B covers 16 facts");
      assert(audit.counts.evaluationFactsByCategory.C === 6, "C covers 6 facts");
      assert(
        audit.counts.evaluationByCategoryLanguage.B.en === 32 &&
          audit.counts.evaluationByCategoryLanguage.B.zh === 32,
        "B has 32 English and 32 Chinese items"
      );
    });

    test("tokenizer and prompt-length contracts pass", () => {
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
      assert(audit.overlap.exactPromptOverlap.B === 0, "B has no exact training prompts");
      assert(audit.overlap.exactPromptOverlap.C === 0, "C has no exact training prompts");
      assert(audit.overlap.normalizedPromptOverlap.B === 0, "B has no normalized training prompts");
      assert(audit.overlap.normalizedPromptOverlap.C === 0, "C has no normalized training prompts");
      assert(
        audit.overlap.exactPromptOverlap.A === audit.counts.evaluationByCategory.A,
        "A is exactly the training prompt set"
      );
      assert(
        audit.overlap.exactPromptAnswerPairOverlap.B === 0,
        "B has no exact training prompt-answer pairs"
      );
      assert(
        audit.overlap.normalizedPromptAnswerPairOverlap.B === 0,
        "B has no normalized training prompt-answer pairs"
      );
      assert(
        audit.overlap.exactPromptAnswerPairOverlap.C === 0,
        "C has no exact training prompt-answer pairs"
      );
      assert(audit.overlap.factSplitConflicts.length === 0, "fact splits are disjoint");
    });
  }

  if (!fs.existsSync(LEAKAGE_PATH)) {
    skip("leakage report", "experiments/phase116/leakage-report.json is absent");
  } else {
    const leakage = readJson<{
      phase: string;
      pass: boolean;
      datasetSha256: string;
      exactPromptOverlap: { A: string[]; B: string[]; C: string[] };
      normalizedPromptOverlap: { A: string[]; B: string[]; C: string[] };
      exactPromptAnswerPairOverlap: { A: string[]; B: string[]; C: string[] };
      normalizedPromptAnswerPairOverlap: { A: string[]; B: string[]; C: string[] };
      factIdLeakage: string[];
      categoryCAnswerLeakage: string[];
      categoryCNearDuplicates: string[];
      factSplitConflicts: string[];
      crossPhaseOverlap: Array<{
        label: string;
        exactPrompts: string[];
        normalizedPrompts: string[];
        exactAnswers: string[];
        normalizedAnswers: string[];
      }>;
    }>(LEAKAGE_PATH);

    test("leakage report independently passes", () => {
      assert(leakage.phase === "116", "phase is 116");
      assert(leakage.pass === true, "leakage.pass is true");
      for (const category of ["B", "C"] as const) {
        assert(
          leakage.exactPromptOverlap[category].length === 0,
          `${category} exact prompt overlap list is empty`
        );
        assert(
          leakage.normalizedPromptOverlap[category].length === 0,
          `${category} normalized prompt overlap list is empty`
        );
        assert(
          leakage.exactPromptAnswerPairOverlap[category].length === 0,
          `${category} exact pair overlap list is empty`
        );
        assert(
          leakage.normalizedPromptAnswerPairOverlap[category].length === 0,
          `${category} normalized pair overlap list is empty`
        );
      }
      assert(leakage.factIdLeakage.length === 0, "no fact ids leak into prompts");
      assert(
        leakage.categoryCAnswerLeakage.length === 0,
        "no category C answer appears in training"
      );
      assert(
        leakage.categoryCNearDuplicates.length === 0,
        "no category C near-duplicate of a training prompt"
      );
      assert(leakage.factSplitConflicts.length === 0, "fact splits are disjoint");
    });

    test("cross-phase overlap with Phase 115 and Phase 113/114 is zero", () => {
      assert(leakage.crossPhaseOverlap.length === 2, "two cross-phase comparisons recorded");
      for (const comparison of leakage.crossPhaseOverlap) {
        assert(
          comparison.exactPrompts.length === 0,
          `${comparison.label}: no exact prompt overlap`
        );
        assert(
          comparison.normalizedPrompts.length === 0,
          `${comparison.label}: no normalized prompt overlap`
        );
        assert(
          comparison.exactAnswers.length === 0,
          `${comparison.label}: no exact answer overlap`
        );
        assert(
          comparison.normalizedAnswers.length === 0,
          `${comparison.label}: no normalized answer overlap`
        );
      }
      const labels = leakage.crossPhaseOverlap.map((entry) => entry.label).sort();
      assert(
        labels.join(",") === "phase113-114,phase115",
        `comparison labels are phase115 and phase113-114, found ${labels.join(",")}`
      );
    });
  }

  // ── Source integrity ─────────────────────────────────────
  let source: SourceFile | null = null;
  if (!fs.existsSync(SOURCE_PATH)) {
    skip("source fact set", "experiments/phase116/dataset.source.json is absent");
  } else {
    source = readJson<SourceFile>(SOURCE_PATH);
    const sourceFacts = source.facts;

    test("source fact ids are unique and split by fact", () => {
      assert(source!.dataset === "phase116-paraphrase", "source dataset is phase116-paraphrase");
      const ids = sourceFacts.map((fact) => fact.factId);
      assert(new Set(ids).size === ids.length, "fact ids are unique");
      const splits = new Set(sourceFacts.map((fact) => fact.split));
      for (const split of splits) {
        const factsInSplit = sourceFacts.filter((fact) => fact.split === split);
        const unique = new Set(factsInSplit.map((fact) => fact.factId));
        assert(unique.size === factsInSplit.length, `${split} facts are unique`);
      }
      for (const split of Object.keys(source!.splits)) {
        const declared = source!.splits[split];
        const actual = sourceFacts
          .filter((fact) => fact.split === split)
          .map((fact) => fact.factId);
        assert(
          [...declared].sort().join(",") === [...actual].sort().join(","),
          `${split} declaration matches fact splits`
        );
      }
    });

    test("canonical answers are unique within each language", () => {
      for (const language of ["en", "zh"] as const) {
        const answers = sourceFacts.map((fact) => fact.answers[language]);
        const normalized = answers.map((answer) => normalizeForOverlap(answer));
        assert(
          new Set(normalized).size === normalized.length,
          `${language} canonical answers are unique`
        );
        for (const answer of answers) {
          assert(answer.trim().length > 0, `${language} answer is non-empty`);
        }
      }
    });

    test("every train fact has exactly three seen and two unseen phrasings per language", () => {
      for (const fact of sourceFacts.filter((entry) => entry.split === "train")) {
        for (const language of ["en", "zh"] as const) {
          const seen = fact.phrasings.filter(
            (phrase) => phrase.language === language && phrase.role === "train"
          );
          const unseen = fact.phrasings.filter(
            (phrase) => phrase.language === language && phrase.role === "unseen-paraphrase"
          );
          assert(seen.length === 3, `${fact.factId} ${language} has 3 seen phrasings`);
          assert(unseen.length === 2, `${fact.factId} ${language} has 2 unseen phrasings`);
        }
      }
    });

    test("category B phrasings are materially different from their seen prompts", () => {
      let maxOverlap = 0;
      let pairsAtOrAboveThreshold = 0;
      for (const fact of sourceFacts.filter((entry) => entry.split === "train")) {
        for (const language of ["en", "zh"] as const) {
          const seen = fact.phrasings.filter(
            (phrase) => phrase.language === language && phrase.role === "train"
          );
          const unseen = fact.phrasings.filter(
            (phrase) => phrase.language === language && phrase.role === "unseen-paraphrase"
          );
          for (const held of unseen) {
            const heldTokens = tokenSet(held.text, language);
            for (const seenPhrase of seen) {
              const score = jaccard(heldTokens, tokenSet(seenPhrase.text, language));
              maxOverlap = Math.max(maxOverlap, score);
              if (score >= 0.7) pairsAtOrAboveThreshold += 1;
            }
          }
        }
      }
      assert(
        pairsAtOrAboveThreshold === 0,
        `no B-to-A pair reaches 0.70 token/bigram Jaccard (found ${pairsAtOrAboveThreshold})`
      );
      assert(maxOverlap < 0.7, `maximum B-to-A Jaccard ${maxOverlap.toFixed(4)} is below 0.70`);
    });
  }

  // ── Derived training dataset ─────────────────────────────
  let trainingDataset: ChatSftDatasetFile | null = null;
  if (!fs.existsSync(TRAINING_PATH)) {
    skip("training dataset", "experiments/phase116/training-sft.json is absent");
  } else {
    try {
      trainingDataset = parseChatSftDatasetFile(readJson<unknown>(TRAINING_PATH));
    } catch (error) {
      failed++;
      console.error("  ✗ FAIL: training dataset is accepted by the production parser");
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    }

    if (trainingDataset) {
      const parsed = trainingDataset;
      test("train and validation split sizes are exact", () => {
        const train = parsed.samples.filter((sample) => sample.split === "train");
        const validation = parsed.samples.filter((sample) => sample.split === "validation");
        const testSplit = parsed.samples.filter((sample) => sample.split === "test");
        assert(train.length === 96, `96 train samples, found ${train.length}`);
        assert(validation.length === 24, `24 validation samples, found ${validation.length}`);
        assert(testSplit.length === 0, `no test samples, found ${testSplit.length}`);
      });

      test("every training sample has one turn, a canonical answer, and a unique id", () => {
        const ids = new Set<string>();
        for (const sample of parsed.samples as ChatSftSampleData[]) {
          assert(sample.turns.length === 1, `${sample.id} has one turn`);
          assert(sample.turns[0].assistant.length > 0, `${sample.id} has a non-empty answer`);
          assert(!ids.has(sample.id), `${sample.id} is unique`);
          ids.add(sample.id);
        }
      });
    }
  }

  // ── Frozen evaluation manifests ──────────────────────────
  let evalManifest: EvalManifestArtifact | null = null;
  if (!fs.existsSync(EVAL_PATH)) {
    skip("evaluation manifest", "experiments/phase116/eval-manifest.json is absent");
  } else {
    evalManifest = readJson<EvalManifestArtifact>(EVAL_PATH);

    test("evaluation manifest has the frozen category counts", () => {
      assert(evalManifest!.phase === "116", "phase is 116");
      assert(evalManifest!.items.length === 196, "196 items");
      const counts = { A: 0, B: 0, C: 0 };
      for (const item of evalManifest!.items) counts[item.category] += 1;
      assert(counts.A === 96, `96 category A, found ${counts.A}`);
      assert(counts.B === 64, `64 category B, found ${counts.B}`);
      assert(counts.C === 36, `36 category C, found ${counts.C}`);
    });

    test("evaluation item ids are unique", () => {
      const ids = new Set(evalManifest!.items.map((item) => item.id));
      assert(ids.size === evalManifest!.items.length, "item ids are unique");
    });

    if (trainingDataset) {
      test("category A is exactly the training prompt set", () => {
        const trainPrompts = new Set(
          trainingDataset!.samples
            .filter((sample) => sample.split === "train")
            .map((sample) => sample.turns[0].user)
        );
        const aPrompts = evalManifest!.items
          .filter((item) => item.category === "A")
          .map((item) => item.prompt);
        assert(aPrompts.length === trainPrompts.size, "A has one item per training prompt");
        for (const prompt of aPrompts) {
          assert(trainPrompts.has(prompt), `A prompt is in training: ${prompt}`);
        }
      });

      test("categories B and C never reuse a training prompt", () => {
        const trainPrompts = new Set(
          trainingDataset!.samples.map((sample) => sample.turns[0].user)
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

      test("no evaluation prompt-answer pair is a training pair", () => {
        const trainPairs = new Set(
          trainingDataset!.samples.map(
            (sample) => `${sample.turns[0].user}\u0000${sample.turns[0].assistant}`
          )
        );
        for (const item of evalManifest!.items) {
          if (item.category === "B" || item.category === "C") {
            assert(
              !trainPairs.has(`${item.prompt}\u0000${item.gold}`),
              `${item.id} is not a training prompt-answer pair`
            );
          }
        }
      });
    }

    if (source) {
      const facts = new Map(source.facts.map((fact) => [fact.factId, fact]));

      test("category B uses train facts and category C uses test facts", () => {
        for (const item of evalManifest!.items) {
          const fact = facts.get(item.factId);
          assert(fact !== undefined, `fact ${item.factId} exists`);
          if (item.category === "B") {
            assert(fact!.split === "train", `${item.factId} is a train fact`);
            const phrasing = fact!.phrasings.find((entry) => entry.id === item.id);
            assert(phrasing?.role === "unseen-paraphrase", `${item.id} is unseen-paraphrase`);
          }
          if (item.category === "C") {
            assert(fact!.split === "test", `${item.factId} is a test fact`);
            const phrasing = fact!.phrasings.find((entry) => entry.id === item.id);
            assert(phrasing?.role === "unseen-fact", `${item.id} is unseen-fact`);
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
          source!.facts
            .filter((fact) => fact.split === "validation")
            .map((fact) => fact.factId)
        );
        for (const item of evalManifest!.items) {
          assert(!validationFacts.has(item.factId), `${item.factId} is not a validation fact`);
        }
      });

      test("no category C answer appears in any training prompt or answer", () => {
        const trainedAnswers = new Set(
          source!.facts
            .filter((fact) => fact.split === "train")
            .flatMap((fact) => [normalizeForOverlap(fact.answers.en), normalizeForOverlap(fact.answers.zh)])
        );
        const testAnswers = source!.facts
          .filter((fact) => fact.split === "test")
          .flatMap((fact) => [fact.answers.en, fact.answers.zh]);
        for (const answer of testAnswers) {
          assert(
            !trainedAnswers.has(normalizeForOverlap(answer)),
            `category C answer is not a trained answer: ${answer}`
          );
        }
      });
    }
  }

  if (!fs.existsSync(VALIDATION_PATH)) {
    skip("validation manifest", "experiments/phase116/validation-manifest.json is absent");
  } else {
    const validation = readJson<{ phase: string; items: Array<{ factId: string }> }>(
      VALIDATION_PATH
    );
    test("validation manifest covers only validation facts", () => {
      assert(validation.phase === "116", "phase is 116");
      assert(validation.items.length === 24, "24 validation items");
      const validationFacts = new Set(
        (source?.facts ?? [])
          .filter((fact) => fact.split === "validation")
          .map((fact) => fact.factId)
      );
      for (const item of validation.items) {
        assert(validationFacts.has(item.factId), `${item.factId} is a validation fact`);
      }
    });
  }

  // ── Predeclared covariate ────────────────────────────────
  if (!fs.existsSync(OVERLAP_PATH)) {
    skip("lexical-overlap covariate", "experiments/phase116/lexical-overlap.json is absent");
  } else {
    const overlap = readJson<{
      phase: string;
      computedBeforeCandidateEvaluation: boolean;
      counts: { items: number };
      items: Array<{ id: string; factId: string; maxJaccard: number }>;
    }>(OVERLAP_PATH);
    test("lexical-overlap covariate was frozen before evaluation over 64 B items", () => {
      assert(overlap.phase === "116", "phase is 116");
      assert(overlap.computedBeforeCandidateEvaluation === true, "declared predeclared");
      assert(overlap.counts.items === 64, `64 items, found ${overlap.counts.items}`);
      assert(overlap.items.length === 64, "64 item records");
      for (const item of overlap.items) {
        assert(item.maxJaccard < 0.7, `${item.id} overlap ${item.maxJaccard} is below 0.70`);
      }
    });

    if (evalManifest) {
      test("covariate covers exactly the category B item ids", () => {
        const bIds = evalManifest!.items
          .filter((item) => item.category === "B")
          .map((item) => item.id)
          .sort();
        const covariateIds = overlap.items.map((item) => item.id).sort();
        assert(bIds.length === covariateIds.length, "same number of B items");
        for (let index = 0; index < bIds.length; index++) {
          assert(bIds[index] === covariateIds[index], `id ${bIds[index]} matches`);
        }
      });
    }
  }

  // ── Freeze manifest ──────────────────────────────────────
  if (!fs.existsSync(FREEZE_PATH)) {
    skip("freeze manifest", "experiments/phase116/freeze-manifest.json is absent");
  } else {
    const freeze = readJson<{
      phase: string;
      frozenBeforeTrainingAndEvaluation: boolean;
      files: Record<string, string>;
      evaluationItems: number;
    }>(FREEZE_PATH);
    const frozenFiles: Record<string, string> = {
      source: SOURCE_PATH,
      trainingDataset: TRAINING_PATH,
      evalManifest: EVAL_PATH,
      validationManifest: VALIDATION_PATH,
      leakageReport: LEAKAGE_PATH,
      datasetAudit: AUDIT_PATH,
      splitManifest: MANIFEST_PATH,
      decisionRule: DECISION_PATH,
      lexicalOverlap: OVERLAP_PATH,
    };

    test("freeze manifest still matches every frozen file", () => {
      assert(freeze.phase === "116", "phase is 116");
      assert(
        freeze.frozenBeforeTrainingAndEvaluation === true,
        "declared frozen before training and evaluation"
      );
      assert(freeze.evaluationItems === 196, "196 frozen evaluation items");
      for (const [key, filePath] of Object.entries(frozenFiles)) {
        assert(fs.existsSync(filePath), `${key} file exists`);
        assert(
          sha256File(filePath) === freeze.files[key],
          `${key} hash is unchanged after freeze`
        );
      }
    });

    test("frozen source hash matches the audit and leakage records", () => {
      if (auditSourceSha256) {
        assert(
          freeze.files.source === auditSourceSha256,
          "freeze source hash matches the audit"
        );
      }
      if (fs.existsSync(LEAKAGE_PATH)) {
        const leakage = readJson<{ datasetSha256: string }>(LEAKAGE_PATH);
        assert(
          freeze.files.source === leakage.datasetSha256,
          "freeze source hash matches the leakage report"
        );
      }
    });
  }

  // ── Decision rule ────────────────────────────────────────
  if (!fs.existsSync(DECISION_PATH)) {
    skip("decision rule", "experiments/phase116/decision-rule.json is absent");
  } else {
    const decision = readJson<{
      phase: string;
      frozenBeforeCandidateEvaluation: boolean;
      primaryEndpoint: { denominator: number; snapshot: string };
      seeds: { primary: number[]; minimumCompleted: number };
      rules: Array<{ grade: string }>;
    }>(DECISION_PATH);

    test("decision rule was frozen before candidate evaluation with the declared endpoints", () => {
      assert(decision.phase === "116", "phase is 116");
      assert(
        decision.frozenBeforeCandidateEvaluation === true,
        "declared frozen before candidate evaluation"
      );
      assert(decision.primaryEndpoint.denominator === 64, "primary denominator is 64");
      assert(
        decision.primaryEndpoint.snapshot.includes("final"),
        "primary snapshot is the final checkpoint"
      );
      assert(
        decision.seeds.primary.join(",") === PRIMARY_SEEDS.join(","),
        "primary seeds are 42, 43, 44"
      );
      assert(decision.seeds.minimumCompleted === 3, "three seeds required");
      const grades = decision.rules.map((rule) => rule.grade).sort();
      assert(grades.join(",") === "A,B,C,D", `grades A/B/C/D, found ${grades.join(",")}`);
    });
  }

  // ── Historical artifacts ─────────────────────────────────
  test("Phase 114 final checkpoint is unchanged", () => {
    assert(fs.existsSync(PHASE114_FINAL_PATH), "Phase 114 final checkpoint exists");
    assert(
      sha256File(PHASE114_FINAL_PATH) === PHASE114_FINAL_SHA256,
      "Phase 114 final checkpoint hash is unchanged"
    );
  });

  test("Phase 115 artifacts and report are unchanged", () => {
    for (const artifact of PHASE115_FILES) {
      const absolute = path.join(ROOT, artifact.file);
      assert(fs.existsSync(absolute), `${artifact.file} exists`);
      assert(sha256File(absolute) === artifact.sha256, `${artifact.file} is unchanged`);
    }
  });

  test("Phase 113/114 chat-SFT corpus is unchanged", () => {
    assert(fs.existsSync(PHASE113_DATASET_PATH), "Phase 113/114 dataset exists");
    assert(
      sha256File(PHASE113_DATASET_PATH) === PHASE113_DATASET_SHA256,
      "Phase 113/114 dataset hash is unchanged"
    );
  });

  // ── Baseline results ─────────────────────────────────────
  let baseline: EvaluationArtifact | null = null;
  if (!fs.existsSync(BASELINE_PATH)) {
    skip("baseline results", "baseline-phase114-final-results.json is absent");
  } else {
    baseline = readJson<EvaluationArtifact>(BASELINE_PATH);

    test("baseline uses the frozen manifest and greedy decoding", () => {
      assert(baseline!.phase === "116", "phase is 116");
      assert(baseline!.items.length === 196, "196 evaluated items");
      assert(baseline!.inputs.decoding.temperature === 0, "temperature 0 (greedy)");
      assert(baseline!.inputs.decoding.enforceUtf8 === true, "UTF-8 enforcement is active");
      assert(
        baseline!.checkpoint.sha256 === PHASE114_FINAL_SHA256,
        "baseline checkpoint is the Phase 114 final checkpoint"
      );
      assert(
        baseline!.inputs.evalManifestSha256 === sha256File(EVAL_PATH),
        "baseline records the frozen evaluation manifest hash"
      );
      if (auditSourceSha256) {
        assert(
          baseline!.inputs.sourceDatasetSha256 === auditSourceSha256,
          "baseline records the frozen source dataset hash"
        );
      }
    });

    test("baseline reports the predeclared primary metric over 64 B items", () => {
      assert(baseline!.primaryMetric.total === 64, "primary denominator is 64");
      assert(baseline!.aggregates.byCategory.B.total === 64, "category B has 64 items");
      assert(baseline!.aggregates.byCategory.A.total === 96, "category A has 96 items");
      assert(baseline!.aggregates.byCategory.C.total === 36, "category C has 36 items");
      assert(baseline!.perFactB.length === 16, "per-fact B results cover 16 facts");
      assert(
        typeof baseline!.aggregates.overall.eosStopRate === "number",
        "EOS stop rate is reported"
      );
      assert(
        typeof baseline!.aggregates.overall.emptyOutputRate === "number",
        "empty-output rate is reported"
      );
    });
  }

  // ── Per-seed training and evaluation artifacts ───────────
  const seedResults: Array<{
    seed: number;
    training: TrainingResultArtifact;
    final: EvaluationArtifact;
    best: EvaluationArtifact;
  }> = [];

  for (const seed of PRIMARY_SEEDS) {
    const seedDir = path.join(PHASE_DIR, `seed-${seed}`);
    const trainingPath = path.join(seedDir, "training-result.json");
    const finalPath = path.join(seedDir, "eval-final.json");
    const bestPath = path.join(seedDir, "eval-best.json");
    if (!fs.existsSync(trainingPath) || !fs.existsSync(finalPath) || !fs.existsSync(bestPath)) {
      skip(`seed ${seed} artifacts`, `${path.relative(ROOT, seedDir)} is incomplete`);
      continue;
    }
    const training = readJson<TrainingResultArtifact>(trainingPath);
    const final = readJson<EvaluationArtifact>(finalPath);
    const best = readJson<EvaluationArtifact>(bestPath);
    seedResults.push({ seed, training, final, best });

    test(`seed ${seed} started from the Phase 114 checkpoint with the fixed recipe`, () => {
      assert(training.phase === "116", "phase is 116");
      assert(training.seed === seed, `seed is ${seed}`);
      assert(
        training.inputs.initialCheckpointSha256 === PHASE114_FINAL_SHA256,
        "initial checkpoint is the Phase 114 final checkpoint"
      );
      assert(
        training.inputs.tokenizerFingerprint === TOKENIZER_FINGERPRINT,
        "tokenizer fingerprint is frozen"
      );
      assert(
        training.retained.initial.sha256 === PHASE114_FINAL_SHA256,
        "retained initial snapshot is the Phase 114 final checkpoint"
      );
      assert(training.hyperparameters.totalSteps === 384, "384 total steps");
      assert(training.hyperparameters.dataLoaderSeed === seed, "DataLoader seed is the run seed");
      assert(training.finalGlobalStep === 384, "final global step is 384");
      assert(best.aggregates !== undefined, "best evaluation parsed");
    });

    test(`seed ${seed} training records initial, best-validation, and final snapshots`, () => {
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
        training.retained.best.valLoss <= training.retained.final.valLoss,
        "best validation loss is not worse than the final validation loss"
      );
      assert(training.retained.final.step === 384, "final snapshot is step 384");
      assert(
        sha256File(finalPath) !== "" && final.checkpoint.sha256 === training.retained.final.sha256,
        "final evaluation used the retained final checkpoint"
      );
      assert(
        best.checkpoint.sha256 === training.retained.best.sha256,
        "best evaluation used the retained best checkpoint"
      );
    });

    for (const [snapshotLabel, result] of [
      ["best", best],
      ["final", final],
    ] as const) {
      test(`seed ${seed} ${snapshotLabel} evaluation uses the identical frozen manifest`, () => {
        assert(result.phase === "116", "phase is 116");
        assert(result.items.length === 196, "196 items");
        assert(result.primaryMetric.total === 64, "primary denominator is 64");
        assert(result.perFactB.length === 16, "per-fact B results cover 16 facts");
        assert(result.inputs.decoding.temperature === 0, "temperature 0");
        assert(result.inputs.decoding.enforceUtf8 === true, "UTF-8 enforcement active");
        if (baseline) {
          assert(
            result.inputs.evalManifestSha256 === baseline.inputs.evalManifestSha256,
            "eval manifest hash matches the baseline"
          );
          const baselineIds = new Set(baseline.items.map((item) => item.id));
          assert(baselineIds.size === 196, "baseline contains 196 ids");
          for (const item of result.items) {
            assert(baselineIds.has(item.id), `item ${item.id} is in the frozen manifest`);
          }
        }
        assert(
          result.integrity.utf8EnforcedOnEveryItem,
          "UTF-8 enforcement held on every item"
        );
        assert(result.integrity.contextTruncations === 0, "no context truncations");
        assert(result.integrity.errorStops === 0, "no error stops");
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
  }

  // ── Aggregate decision consistency ───────────────────────
  if (!fs.existsSync(AGGREGATE_PATH)) {
    skip("aggregate results", "experiments/phase116/aggregate-results.json is absent");
  } else {
    const aggregate = readJson<{
      phase: string;
      inputs: {
        baselineB: number;
        baselineContaminated: boolean;
        completedSeeds: number[];
        primaryDenominator: number;
      };
      decision: {
        inputs: {
          allCompleted: boolean;
          allInterpretable: boolean;
          baselineContaminated: boolean;
          bCounts: number[];
          seedsAtThreshold: number;
          stableFacts: number;
          activeFacts: number;
          bothLanguagesEverySeed: boolean;
          seedSpread: number;
        };
        grade: string;
      };
      perSeed: Array<{
        seed: number;
        snapshots: { final: { A: SummaryArtifact; B: SummaryArtifact; C: SummaryArtifact } };
        factsWithAtLeastOneB: { count: number };
      }>;
    }>(AGGREGATE_PATH);

    test("aggregate results use the frozen denominator and completed seeds", () => {
      assert(aggregate.phase === "116", "phase is 116");
      assert(aggregate.inputs.primaryDenominator === 64, "primary denominator is 64");
      assert(
        aggregate.inputs.completedSeeds.join(",") === PRIMARY_SEEDS.join(","),
        "all three primary seeds completed"
      );
      if (baseline) {
        assert(
          aggregate.inputs.baselineB === baseline.primaryMetric.correct,
          "aggregate baseline B matches the baseline evaluation"
        );
        assert(
          aggregate.inputs.baselineContaminated === (baseline.primaryMetric.correct > 0),
          "contamination flag matches the baseline"
        );
      }
    });

    test("decision grade is mechanically consistent with the recorded inputs", () => {
      const inputs = aggregate.decision.inputs;
      if (seedResults.length === 3) {
        const recomputedBCounts = seedResults.map((entry) => entry.final.primaryMetric.correct);
        assert(
          recomputedBCounts.join(",") === inputs.bCounts.join(","),
          "recorded B counts match the per-seed evaluations"
        );
        const recomputedInterpretable = seedResults.every(
          (entry) =>
            entry.final.aggregates.byCategory.A.correct >= A_FLOOR &&
            entry.final.integrity.utf8EnforcedOnEveryItem &&
            entry.final.integrity.contextTruncations === 0 &&
            entry.final.integrity.errorStops === 0
        );
        assert(
          recomputedInterpretable === inputs.allInterpretable,
          "interpretability flag matches the per-seed evaluations"
        );
      }
      const thresholdCount = inputs.bCounts.filter((count) => count >= B_THRESHOLD).length;
      assert(thresholdCount === inputs.seedsAtThreshold, "threshold count is consistent");
      const spread =
        inputs.bCounts.length === 0
          ? 0
          : Math.max(...inputs.bCounts) - Math.min(...inputs.bCounts);
      assert(spread === inputs.seedSpread, "seed spread is consistent");

      const gradeA =
        inputs.allCompleted &&
        inputs.allInterpretable &&
        !inputs.baselineContaminated &&
        inputs.bCounts.every((count) => count >= B_THRESHOLD) &&
        inputs.bothLanguagesEverySeed &&
        inputs.stableFacts >= 10 &&
        inputs.seedSpread <= 16;
      const gradeB =
        !gradeA &&
        inputs.allCompleted &&
        inputs.allInterpretable &&
        !inputs.baselineContaminated &&
        inputs.seedsAtThreshold >= 2 &&
        inputs.stableFacts >= 8;
      const gradeC =
        !gradeA &&
        !gradeB &&
        inputs.allCompleted &&
        inputs.allInterpretable &&
        !inputs.baselineContaminated &&
        inputs.seedsAtThreshold < 2;
      const expectedGrade = gradeA ? "A" : gradeB ? "B" : gradeC ? "C" : "D";
      assert(
        aggregate.decision.grade === expectedGrade,
        `grade ${aggregate.decision.grade} matches the recomputed ${expectedGrade}`
      );
    });

    test("fact-level counts agree with the per-seed evaluations", () => {
      for (const entry of aggregate.perSeed) {
        const seedResult = seedResults.find((candidate) => candidate.seed === entry.seed);
        if (!seedResult) continue;
        assert(
          entry.snapshots.final.A.correct === seedResult.final.aggregates.byCategory.A.correct,
          `seed ${entry.seed} A count agrees`
        );
        assert(
          entry.snapshots.final.B.correct === seedResult.final.aggregates.byCategory.B.correct,
          `seed ${entry.seed} B count agrees`
        );
        assert(
          entry.snapshots.final.C.correct === seedResult.final.aggregates.byCategory.C.correct,
          `seed ${entry.seed} C count agrees`
        );
      }
    });
  }

  console.log(
    `  Phase 116: ${passed} passed, ${failed} failed, ${skipped} skipped`
  );
  return { passed, failed, skipped };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("phase116-replication.test.ts")) {
  const result = runPhase116Tests();
  if (result.failed > 0) process.exitCode = 1;
}
