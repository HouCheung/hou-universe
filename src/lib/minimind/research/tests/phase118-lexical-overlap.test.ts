// ============================================================
// Phase 118 — controlled lexical-overlap intervention contracts
// ============================================================
// This suite never trains, generates, or writes. It reads the
// predeclared H118 specification, the frozen prompt dataset, the
// three frozen-checkpoint evaluations, the paired analysis, and
// the historical-integrity artifacts. It checks:
//
//   1. The predeclared specification, thresholds, bootstrap seed,
//      and five-part decision rule are present and unmodified.
//   2. The frozen prompt set is balanced and every prompt
//      independently recomputes to the frozen overlap value.
//   3. No prompt duplicates a training or H118 prompt and no
//      prompt leaks the canonical answer.
//   4. The prompt/evaluation manifests are identical and complete.
//   5. Every evaluation recomputes exact match and token F1 from
//      the raw continuation and uses the frozen decoding contract.
//   6. The paired analysis arithmetic, bootstrap, stratification,
//      sensitivity, and decision-rule application reconcile.
//   7. The protected prior artifacts and git HEAD are unchanged.
//   8. The report exists and cites the frozen sources.
//
// If an output is absent the corresponding checks report SKIP.
// ============================================================

import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { Random } from "../../core/random/Random";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import {
  getDatasetTexts,
  loadProductionDataset,
} from "../../data/datasetLoader";
import { formatPrompt } from "../../data/ChatSftDataset";
import {
  chatAnswerTokenF1,
  normalizeChatAnswer,
} from "../../data/chatSftMetrics";

const ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const PHASE_DIR = path.join(ROOT, "experiments", "h118");
const REPORT_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "minimind",
  "research",
  "PHASE118-LEXICAL-OVERLAP-INTERVENTION-REPORT.md"
);

const TOKENIZER_FINGERPRINT =
  "a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d";
const BOOTSTRAP_REPLICATES = 10000;
const BOOTSTRAP_SEED = 20261022;

const CHECKPOINT_HASHES: Record<number, string> = {
  42: "78ef294517f204c60e6efb4426f3c27bbfd58ad3d124f64055d7ff51a2945483",
  43: "57e2930867faf37d3657d6dfd2c4157183a9814039714e6fe6ec164c597b4172",
  44: "6195bd1d7403e5dc3deeb1c8ce9ba24b34fe470c61ad683b608e43607e31df87",
};

// ── Minimal artifact shapes ──────────────────────────────────

interface FrozenPrompt {
  id: string;
  pairId: string;
  factId: string;
  language: "en" | "zh";
  condition: "high" | "low";
  text: string;
  expectedAnswer: string;
  topic: string;
  nearestTrainingPromptId: string;
  maxJaccard: number;
  formattedPromptTokens: number;
  rawPromptTokens: number;
}

interface PromptFile {
  phase: string;
  status: string;
  prompts: FrozenPrompt[];
}

interface DatasetPhrasing {
  id: string;
  language: "en" | "zh";
  role: string;
  text: string;
}

interface DatasetFact {
  factId: string;
  topic: string;
  answers: Record<"en" | "zh", string>;
  phrasings: DatasetPhrasing[];
}

interface DatasetSource {
  facts: DatasetFact[];
}

interface CandidateFile {
  phase: string;
  status: string;
  pairs: Array<{
    factId: string;
    language: "en" | "zh";
    high: string;
    low: string;
    notes?: { numeralAdjudication?: string };
  }>;
}

interface EvalManifestItem {
  id: string;
  factId: string;
  language: "en" | "zh";
  category: string;
  prompt: string;
  gold: string;
}

interface EvalManifest {
  phase: string;
  items: EvalManifestItem[];
}

interface EvalItem {
  id: string;
  factId: string;
  language: "en" | "zh";
  category: string;
  prompt: string;
  gold: string;
  continuation: string;
  normalized: string;
  correct: boolean;
  tokenF1: number;
  stopReason: string;
  contextTruncated: boolean;
  utf8Enforced: boolean;
}

interface EvalRun {
  phase: string;
  label: string;
  checkpoint: { sha256: string };
  inputs: {
    evalManifestSha256: string;
    sourceDatasetSha256: string;
    tokenizerFingerprint: string;
    decoding: Record<string, unknown>;
    manifestItems: number;
  };
  integrity: {
    utf8EnforcedOnEveryItem: boolean;
    contextTruncations: number;
    errorStops: number;
  };
  items: EvalItem[];
}

interface RunSummary {
  pairs: number;
  high: { correct: number; total: number; rate: number | null };
  low: { correct: number; total: number; rate: number | null };
  difference: number | null;
  f1Difference: number | null;
  paired: {
    bothCorrect: number;
    highOnly: number;
    lowOnly: number;
    bothIncorrect: number;
  };
}

interface BootstrapResult {
  point: number | null;
  ci95: [number, number] | null;
  validReplicates: number;
  skippedReplicates: number;
}

interface PairedAnalysis {
  phase: string;
  status: string;
  deterministicDigest: string;
  promptAudit: { status: string; failures: string[] };
  evaluationContract: { status: string; failures: string[] };
  recomputation: { status: string; failures: string[]; itemsChecked: number };
  priorArtifacts: { status: string };
  primary: {
    observations: number;
    summary: RunSummary;
    accuracy: BootstrapResult;
    tokenF1: BootstrapResult;
  };
  stratified: {
    byLanguage: Record<"en" | "zh", RunSummary>;
    bySeed: Record<string, RunSummary>;
    byLanguageSeed: Record<string, RunSummary>;
    byFact: Array<{ factId: string; summary: RunSummary }>;
    byPair: Array<{ pairId: string; summary: RunSummary }>;
    factDirection: { positive: number; zero: number; negative: number };
    pairDirection: { positive: number; zero: number; negative: number };
  };
  uncertainty: {
    method: string;
    clusterUnit: string;
    replicates: number;
    seed: number;
    primary: { accuracy: BootstrapResult; tokenF1: BootstrapResult };
    byLanguage: Record<
      "en" | "zh",
      { accuracy: BootstrapResult; tokenF1: BootstrapResult }
    >;
    bySeed: Record<string, { accuracy: BootstrapResult; tokenF1: BootstrapResult }>;
    sensitivity: {
      excludedPairs: number;
      equalsPrimary: boolean;
      accuracy: BootstrapResult;
      summary: RunSummary;
    };
  };
  decisionRule: {
    C1: { pass: boolean; evidence: string };
    C2: { pass: boolean; evidence: string };
    C3: { pass: boolean; evidence: string };
    C4: { pass: boolean; evidence: string };
    C5: { pass: boolean; evidence: string };
    allPass: boolean;
    classification: string;
  };
  integrity: { status: string; violations: string[] };
}

interface Headline {
  phase: string;
  deterministicDigest: string;
  classification: string;
  primary: {
    high: RunSummary["high"];
    low: RunSummary["low"];
    difference: number | null;
    f1Difference: number | null;
    paired: RunSummary["paired"];
    ci95: [number, number] | null;
  };
  byLanguage: Record<"en" | "zh", RunSummary>;
  bySeed: Record<string, RunSummary>;
  decisionRule: {
    C1: boolean;
    C2: boolean;
    C3: boolean;
    C4: boolean;
    C5: boolean;
    allPass: boolean;
  };
  integrity: { status: string; violations: string[] };
}

interface UncertaintyFile {
  phase: string;
  deterministicDigest: string;
  method: string;
  clusterUnit: string;
  clusterCount: number;
  replicates: number;
  seed: number;
  primary: { accuracy: BootstrapResult; tokenF1: BootstrapResult };
  byLanguage: Record<
    "en" | "zh",
    { accuracy: BootstrapResult; tokenF1: BootstrapResult }
  >;
  bySeed: Record<string, { accuracy: BootstrapResult; tokenF1: BootstrapResult }>;
  sensitivity: {
    excludedPairs: number;
    equalsPrimary: boolean;
    accuracy: BootstrapResult;
    summary: RunSummary;
  };
}

interface IntegrityReport {
  phase: string;
  status: string;
  gitHeadMatches: boolean;
  fileCount: number;
  missing: string[];
  extra: string[];
  changed: Array<{ path: string; expected: string; actual: string }>;
  failures: string[];
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

interface IntegrityBaseline {
  phase: string;
  status: string;
  gitHead: string;
  fileCount: number;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

// ── Harness ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${name}: ${message}`);
  }
}

function skip(name: string, reason: string): void {
  skipped++;
  console.log(`  SKIP ${name}: ${reason}`);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function gitHead(): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function close(actual: number, expected: number, tolerance = 1e-6): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

// ── Independent overlap implementation ──────────────────────

function overlapNormalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordTokenSet(text: string, language: "en" | "zh"): Set<string> {
  const normalized = overlapNormalize(text);
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

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function maxOverlap(
  text: string,
  language: "en" | "zh",
  training: DatasetPhrasing[]
): { maxJaccard: number; nearestPromptId: string } {
  let max = -Infinity;
  let nearest = "";
  const candidate = wordTokenSet(text, language);
  for (const phrasing of training) {
    const score = jaccard(candidate, wordTokenSet(phrasing.text, language));
    if (score > max) {
      max = score;
      nearest = phrasing.id;
    }
  }
  return { maxJaccard: max, nearestPromptId: nearest };
}

function answerKey(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, "");
}

const ENGLISH_NUMBER_WORDS = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
]);

const CHINESE_NUMERALS = new Set([
  "零",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
  "百",
  "千",
  "万",
]);

function answerNumerals(answer: string, language: "en" | "zh"): string[] {
  if (language === "en") {
    return overlapNormalize(answer)
      .split(" ")
      .filter((word) => ENGLISH_NUMBER_WORDS.has(word));
  }
  return [...new Set(Array.from(answerKey(answer)))].filter((char) =>
    CHINESE_NUMERALS.has(char)
  );
}

// ── Analysis helpers ─────────────────────────────────────────

function expectedClassification(
  analysis: PairedAnalysis,
  integrityPass: boolean
): string {
  const d = analysis.primary.summary.difference;
  const ci = analysis.primary.accuracy.ci95;
  const c1 = d !== null && d > 0;
  const c2 = ci !== null && ci[0] > 0;
  const c3 =
    (analysis.stratified.byLanguage.en.difference ?? 0) > 0 &&
    (analysis.stratified.byLanguage.zh.difference ?? 0) > 0;
  const positiveSeeds = Object.values(analysis.stratified.bySeed).filter(
    (summary) => (summary.difference ?? 0) > 0
  ).length;
  const c4 = positiveSeeds >= 2;
  const sensitivity = analysis.uncertainty.sensitivity;
  const c5 =
    analysis.promptAudit.status === "PASS" &&
    integrityPass &&
    (sensitivity.summary.difference ?? 0) > 0 &&
    sensitivity.accuracy.ci95 !== null &&
    sensitivity.accuracy.ci95[0] > 0;
  if (!integrityPass || analysis.promptAudit.status !== "PASS") {
    return "INVALID - PROTOCOL VIOLATION";
  }
  if (d !== null && d <= 0) {
    return ci !== null && ci[1] < 0
      ? "CONTRADICTED (REVERSED)"
      : "NOT SUPPORTED";
  }
  if (!c2) return "INCONCLUSIVE (POSITIVE BUT IMPRECISE)";
  if (!c3 || !c4) return "INCONCLUSIVE (INCONSISTENT ACROSS STRATA)";
  if (!c5) return "INCONCLUSIVE (SENSITIVITY)";
  return "SUPPORTED";
}

function testSpecAndPrompts(): void {
  console.log("Phase 118 specification and frozen prompts");

  const specPath = path.join(PHASE_DIR, "analysis-spec.json");
  const promptsPath = path.join(PHASE_DIR, "prompts.json");
  const candidatesPath = path.join(PHASE_DIR, "prompt-candidates.json");
  const datasetPath = path.join(
    ROOT,
    "experiments",
    "phase116",
    "dataset.source.json"
  );

  test("predeclared specification is present and frozen before generation", () => {
    const spec = readJson<{
      phase: string;
      status: string;
      writtenBeforeGeneration: boolean;
      design: {
        facts: number;
        languages: string[];
        conditions: string[];
        expectedPrompts: number;
        expectedGenerations: number;
        retraining: boolean;
        weightUpdates: boolean;
      };
      statisticalMethod: { replicates: number; bootstrapSeed: number; uncertainty: string };
      decisionRule: {
        supportRequiresAll: string[];
        noRuleChangesAfterOutputs: boolean;
        classification: string[];
      };
      explicitNonClaims: string[];
    }>(specPath);
    assert(spec.phase === "118", "spec phase must be 118");
    assert(spec.status.includes("PREDECLARED"), "spec must be marked PREDECLARED");
    assert(spec.writtenBeforeGeneration, "spec must be written before generation");
    assert(spec.design.facts === 16, "design must cover 16 facts");
    assert(spec.design.expectedPrompts === 64, "design must cover 64 prompts");
    assert(spec.design.expectedGenerations === 192, "design must cover 192 generations");
    assert(!spec.design.retraining, "design must forbid retraining");
    assert(!spec.design.weightUpdates, "design must forbid weight updates");
    assert(spec.statisticalMethod.replicates === BOOTSTRAP_REPLICATES, "bootstrap replicates");
    assert(spec.statisticalMethod.bootstrapSeed === BOOTSTRAP_SEED, "bootstrap seed");
    assert(
      spec.statisticalMethod.uncertainty.includes("fact-clustered"),
      "uncertainty must be fact-clustered"
    );
    assert(
      spec.decisionRule.supportRequiresAll.length === 5,
      "decision rule must have five conditions"
    );
    assert(spec.decisionRule.noRuleChangesAfterOutputs, "rule must be frozen");
    assert(
      spec.decisionRule.classification.length >= 7,
      "classification must cover all outcomes"
    );
    assert(spec.explicitNonClaims.length >= 5, "explicit non-claims are required");
  });

  test("prompt authors authored candidates before any generation", () => {
    const candidates = readJson<CandidateFile>(candidatesPath);
    assert(candidates.phase === "118", "candidate phase");
    assert(
      candidates.status.includes("BEFORE ANY H118 GENERATION"),
      "candidate status must record pre-generation authorship"
    );
    assert(candidates.pairs.length === 32, "candidate file must have 32 pairs");
  });

  test("frozen prompt set is balanced over facts, languages, and conditions", () => {
    const file = readJson<PromptFile>(promptsPath);
    assert(file.phase === "118", "prompt phase");
    assert(
      file.status.includes("FROZEN BEFORE GENERATION"),
      "prompt file must be frozen before generation"
    );
    const prompts = file.prompts;
    assert(prompts.length === 64, "64 prompts");
    assert(new Set(prompts.map((prompt) => prompt.id)).size === 64, "unique ids");
    assert(new Set(prompts.map((prompt) => prompt.factId)).size === 16, "16 facts");
    assert(new Set(prompts.map((prompt) => prompt.pairId)).size === 32, "32 pairs");
    assert(
      prompts.filter((prompt) => prompt.condition === "high").length === 32,
      "32 high prompts"
    );
    assert(
      prompts.filter((prompt) => prompt.condition === "low").length === 32,
      "32 low prompts"
    );
    assert(
      prompts.filter((prompt) => prompt.language === "en").length === 32,
      "32 English prompts"
    );
    assert(
      prompts.filter((prompt) => prompt.language === "zh").length === 32,
      "32 Chinese prompts"
    );
    for (const prompt of prompts) {
      if (prompt.condition === "high") {
        assert(
          prompt.maxJaccard >= 0.7 && prompt.maxJaccard <= 0.95,
          `${prompt.id} high overlap ${prompt.maxJaccard} outside [0.70, 0.95]`
        );
      } else {
        assert(
          prompt.maxJaccard <= 0.35,
          `${prompt.id} low overlap ${prompt.maxJaccard} above 0.35`
        );
      }
    }
  });

  test("every prompt independently recomputes to the frozen overlap", () => {
    const prompts = readJson<PromptFile>(promptsPath).prompts;
    const dataset = readJson<DatasetSource>(datasetPath);
    const byFact = new Map(dataset.facts.map((fact) => [fact.factId, fact]));
    for (const prompt of prompts) {
      const fact = byFact.get(prompt.factId);
      assert(fact !== undefined, `missing fact ${prompt.factId}`);
      const training = fact.phrasings.filter(
        (phrasing) =>
          phrasing.language === prompt.language && phrasing.role === "train"
      );
      assert(training.length === 3, `${prompt.factId}/${prompt.language} training count`);
      const recomputed = maxOverlap(prompt.text, prompt.language, training);
      assert(
        close(recomputed.maxJaccard, prompt.maxJaccard, 1e-4),
        `${prompt.id} overlap ${recomputed.maxJaccard} != ${prompt.maxJaccard}`
      );
      assert(
        recomputed.nearestPromptId === prompt.nearestTrainingPromptId,
        `${prompt.id} nearest prompt mismatch`
      );
    }
  });

  test("pairs are consistent and every prompt has exactly one condition", () => {
    const prompts = readJson<PromptFile>(promptsPath).prompts;
    const byPair = new Map<string, FrozenPrompt[]>();
    for (const prompt of prompts) {
      const members = byPair.get(prompt.pairId) ?? [];
      members.push(prompt);
      byPair.set(prompt.pairId, members);
    }
    assert(byPair.size === 32, "32 pairs");
    for (const [pairId, members] of byPair) {
      assert(members.length === 2, `${pairId} must have exactly two prompts`);
      const high = members.filter((prompt) => prompt.condition === "high");
      const low = members.filter((prompt) => prompt.condition === "low");
      assert(high.length === 1 && low.length === 1, `${pairId} condition assignment`);
      const highPrompt = high[0];
      const lowPrompt = low[0];
      assert(highPrompt !== undefined, `${pairId} missing high condition`);
      assert(lowPrompt !== undefined, `${pairId} missing low condition`);
      assert(
        highPrompt.factId === lowPrompt.factId &&
          highPrompt.language === lowPrompt.language &&
          highPrompt.expectedAnswer === lowPrompt.expectedAnswer &&
          highPrompt.topic === lowPrompt.topic,
        `${pairId} pair consistency`
      );
    }
  });

  test("no prompt duplicates a training prompt or another H118 prompt", () => {
    const prompts = readJson<PromptFile>(promptsPath).prompts;
    const dataset = readJson<DatasetSource>(datasetPath);
    const byFact = new Map(dataset.facts.map((fact) => [fact.factId, fact]));
    const seen = new Map<string, string>();
    for (const prompt of prompts) {
      const fact = byFact.get(prompt.factId);
      assert(fact !== undefined, `missing fact ${prompt.factId}`);
      const key = overlapNormalize(prompt.text);
      const training = fact.phrasings.filter(
        (phrasing) =>
          phrasing.language === prompt.language &&
          phrasing.role === "train" &&
          overlapNormalize(phrasing.text) === key
      );
      assert(training.length === 0, `${prompt.id} duplicates a training prompt`);
      const other = seen.get(key);
      assert(other === undefined, `${prompt.id} duplicates H118 prompt ${other}`);
      seen.set(key, prompt.id);
    }
  });

  test("no prompt leaks the canonical answer; t14 zh numeral is adjudicated", () => {
    const prompts = readJson<PromptFile>(promptsPath).prompts;
    const candidates = readJson<CandidateFile>(candidatesPath);
    const adjudication = new Map<string, string>();
    for (const pair of candidates.pairs) {
      if (pair.notes?.numeralAdjudication) {
        adjudication.set(
          `${pair.factId}|${pair.language}`,
          pair.notes.numeralAdjudication
        );
      }
    }
    const numeralRows: string[] = [];
    for (const prompt of prompts) {
      const fullKey = answerKey(prompt.expectedAnswer);
      assert(fullKey.length > 0, `${prompt.id} empty answer key`);
      assert(
        !answerKey(prompt.text).includes(fullKey),
        `${prompt.id} leaks the full answer key`
      );
      const normalized = overlapNormalize(prompt.text);
      const words = new Set(normalized.split(" ").filter((word) => word.length > 0));
      const numerals = answerNumerals(prompt.expectedAnswer, prompt.language);
      const matches = numerals.filter((numeral) =>
        prompt.language === "en"
          ? words.has(numeral)
          : normalized.replace(/\s+/g, "").includes(numeral)
      );
      if (matches.length > 0) {
        numeralRows.push(`${prompt.id}:${matches.join(",")}`);
        assert(
          adjudication.has(`${prompt.factId}|${prompt.language}`),
          `${prompt.id} numeral leak without adjudication`
        );
      }
    }
    assert(
      numeralRows.length === 2 &&
        numeralRows.every((row) => row.startsWith("h118-p116-t14-zh-")),
      `unexpected numeral rows: ${numeralRows.join("; ")}`
    );
  });

  test("frozen token counts recompute under the frozen tokenizer", () => {
    const prompts = readJson<PromptFile>(promptsPath).prompts;
    Random.setSeed(42);
    const tokenizer = new BPETokenizer();
    tokenizer.train(getDatasetTexts(loadProductionDataset()), 300);
    const fingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify(tokenizer.toState()))
      .digest("hex");
    assert(fingerprint === TOKENIZER_FINGERPRINT, "tokenizer fingerprint");
    for (const prompt of prompts) {
      const formatted = formatPrompt({
        id: prompt.id,
        language: prompt.language,
        split: "test",
        category: "factual",
        turns: [{ user: prompt.text, assistant: prompt.expectedAnswer }],
      });
      const formattedTokens = tokenizer.encode(formatted).length;
      const rawTokens = tokenizer.encode(prompt.text).length;
      assert(
        formattedTokens === prompt.formattedPromptTokens,
        `${prompt.id} formatted token count ${formattedTokens} != ${prompt.formattedPromptTokens}`
      );
      assert(
        rawTokens === prompt.rawPromptTokens,
        `${prompt.id} raw token count ${rawTokens} != ${prompt.rawPromptTokens}`
      );
      assert(formattedTokens <= 88, `${prompt.id} exceeds the 88-token prompt limit`);
    }
  });
}

function testAuditsAndManifests(): void {
  console.log("Phase 118 audits and manifests");

  const freezePath = path.join(PHASE_DIR, "freeze-manifest.json");
  const promptManifestPath = path.join(PHASE_DIR, "prompt-manifest.json");
  const promptsPath = path.join(PHASE_DIR, "prompts.json");
  const evalManifestPath = path.join(PHASE_DIR, "eval-manifest.json");

  test("all prompt audits pass and agree with the frozen prompts", () => {
    const factAudit = readJson<{ status: string; facts: Array<{ eligible: boolean }> }>(
      path.join(PHASE_DIR, "fact-audit.json")
    );
    const overlapAudit = readJson<{ status: string; items: Array<{ maxJaccard: number; thresholdPass: boolean }> }>(
      path.join(PHASE_DIR, "overlap-audit.json")
    );
    const leakageAudit = readJson<{ status: string; items: Array<{ fullAnswerLeak: boolean; numeralMatches: string[]; numeralAdjudication: string | null; pass: boolean }> }>(
      path.join(PHASE_DIR, "leakage-audit.json")
    );
    const duplicateAudit = readJson<{ status: string; items: Array<{ trainingDuplicates: string[]; h118Duplicates: string[]; pass: boolean }> }>(
      path.join(PHASE_DIR, "duplicate-audit.json")
    );
    const summary = readJson<{
      status: string;
      writtenBeforeGeneration: boolean;
      counts: Record<string, number>;
      overlapImplementationValidation: {
        valueMismatches: number;
        nearestPromptMismatches: number;
      };
    }>(path.join(PHASE_DIR, "prompt-audit-summary.json"));

    assert(factAudit.status === "PASS", "fact audit");
    assert(factAudit.facts.length === 16, "fact audit count");
    assert(factAudit.facts.every((fact) => fact.eligible), "all facts eligible");
    assert(overlapAudit.status === "PASS", "overlap audit");
    assert(overlapAudit.items.length === 64, "overlap audit count");
    assert(overlapAudit.items.every((item) => item.thresholdPass), "overlap thresholds");
    assert(leakageAudit.status === "PASS", "leakage audit");
    assert(leakageAudit.items.length === 64, "leakage audit count");
    assert(
      leakageAudit.items.every(
        (item) => item.pass && !item.fullAnswerLeak
      ),
      "leakage audit items"
    );
    assert(
      leakageAudit.items
        .filter((item) => item.numeralMatches.length > 0)
        .every((item) => item.numeralAdjudication !== null),
      "numeral adjudications"
    );
    assert(duplicateAudit.status === "PASS", "duplicate audit");
    assert(duplicateAudit.items.length === 64, "duplicate audit count");
    assert(
      duplicateAudit.items.every(
        (item) =>
          item.pass &&
          item.trainingDuplicates.length === 0 &&
          item.h118Duplicates.length === 0
      ),
      "duplicate audit items"
    );
    assert(summary.status === "PASS", "prompt audit summary");
    assert(summary.writtenBeforeGeneration, "prompt audit summary timing");
    assert(summary.counts.prompts === 64, "summary prompt count");
    assert(summary.counts.pairs === 32, "summary pair count");
    assert(summary.counts.facts === 16, "summary fact count");
    assert(summary.overlapImplementationValidation.valueMismatches === 0, "overlap values");
    assert(
      summary.overlapImplementationValidation.nearestPromptMismatches === 0,
      "overlap nearest prompts"
    );
  });

  test("prompt and evaluation manifests are complete and identical in coverage", () => {
    const prompts = readJson<PromptFile>(promptsPath).prompts;
    const manifest = readJson<EvalManifest>(evalManifestPath);
    assert(manifest.phase === "118", "eval manifest phase");
    assert(manifest.items.length === 64, "eval manifest count");
    const byId = new Map(manifest.items.map((item) => [item.id, item]));
    assert(byId.size === 64, "eval manifest ids");
    for (const prompt of prompts) {
      const item = byId.get(prompt.id);
      assert(item !== undefined, `missing eval item ${prompt.id}`);
      assert(item.category === "B", `${prompt.id} category`);
      assert(item.factId === prompt.factId, `${prompt.id} fact`);
      assert(item.language === prompt.language, `${prompt.id} language`);
      assert(item.prompt === prompt.text, `${prompt.id} prompt text`);
      assert(item.gold === prompt.expectedAnswer, `${prompt.id} gold`);
    }
  });

  test("freeze manifest pins every input and script", () => {
    const freeze = readJson<{
      phase: string;
      status: string;
      spec: { path: string; sha256: string };
      prompts: { path: string; sha256: string };
      evalManifest: { path: string; sha256: string };
      splitManifest: { path: string; sha256: string };
      promptManifest: { path: string; sha256: string };
      promptCandidates: { path: string; sha256: string };
      scripts: Record<string, { path: string; sha256: string }>;
      tokenizerFingerprint: string;
      checkpoints: Array<{ seed: number; path: string; sha256: string }>;
      expectedPrompts: number;
      expectedGenerations: number;
      noGeneration: boolean;
      noTraining: boolean;
    }>(freezePath);
    assert(freeze.phase === "118", "freeze phase");
    assert(freeze.status.includes("FROZEN BEFORE GENERATION"), "freeze status");
    assert(freeze.expectedPrompts === 64, "freeze prompt count");
    assert(freeze.expectedGenerations === 192, "freeze generation count");
    assert(freeze.noGeneration && freeze.noTraining, "freeze no-generation/no-training");
    assert(freeze.tokenizerFingerprint === TOKENIZER_FINGERPRINT, "freeze fingerprint");
    const frozenEntries: Record<string, { path: string; sha256: string }> = {
      spec: freeze.spec,
      prompts: freeze.prompts,
      evalManifest: freeze.evalManifest,
      splitManifest: freeze.splitManifest,
      promptManifest: freeze.promptManifest,
      promptCandidates: freeze.promptCandidates,
    };
    for (const [key, entry] of Object.entries(frozenEntries)) {
      assert(
        sha256File(path.join(ROOT, entry.path)) === entry.sha256,
        `${key} hash changed`
      );
    }
    assert(Object.keys(freeze.scripts).length === 6, "six script hashes");
    for (const script of Object.values(freeze.scripts)) {
      assert(
        sha256File(path.join(ROOT, script.path)) === script.sha256,
        `script hash changed: ${script.path}`
      );
    }
    assert(freeze.checkpoints.length === 3, "three frozen checkpoints");
    for (const checkpoint of freeze.checkpoints) {
      assert(
        checkpoint.sha256 === CHECKPOINT_HASHES[checkpoint.seed],
        `checkpoint seed ${checkpoint.seed} hash mismatch`
      );
      assert(
        sha256File(path.join(ROOT, checkpoint.path)) === checkpoint.sha256,
        `checkpoint seed ${checkpoint.seed} changed on disk`
      );
    }
    const promptManifest = readJson<{ spec: { sha256: string }; prompts: { sha256: string } }>(
      promptManifestPath
    );
    assert(promptManifest.spec.sha256 === freeze.spec.sha256, "prompt manifest spec");
    assert(promptManifest.prompts.sha256 === freeze.prompts.sha256, "prompt manifest prompts");
  });
}

function testEvaluationRuns(): void {
  console.log("Phase 118 evaluation runs");

  const runPaths = [42, 43, 44].map((seed) =>
    path.join(PHASE_DIR, "runs", `seed-${seed}-eval.json`)
  );
  if (!runPaths.every((runPath) => exists(runPath))) {
    skip("evaluation runs", "one or more frozen-checkpoint runs are absent");
    return;
  }

  const prompts = readJson<PromptFile>(path.join(PHASE_DIR, "prompts.json")).prompts;
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const freeze = readJson<{ evalManifest: { sha256: string }; tokenizerFingerprint: string }>(
    path.join(PHASE_DIR, "freeze-manifest.json")
  );
  let manifestHash: string | null = null;
  let decoding: Record<string, unknown> | null = null;

  for (const seed of [42, 43, 44]) {
    test(`seed ${seed} evaluation uses the frozen contract`, () => {
      const run = readJson<EvalRun>(path.join(PHASE_DIR, "runs", `seed-${seed}-eval.json`));
      assert(run.phase === "118", "run phase");
      assert(run.label === `h118-seed-${seed}`, "run label");
      assert(run.checkpoint.sha256 === CHECKPOINT_HASHES[seed], "checkpoint hash");
      assert(
        run.inputs.evalManifestSha256 === freeze.evalManifest.sha256,
        "manifest hash"
      );
      assert(
        run.inputs.tokenizerFingerprint === TOKENIZER_FINGERPRINT,
        "tokenizer fingerprint"
      );
      assert(run.inputs.manifestItems === 64, "manifest item count");
      assert(run.integrity.utf8EnforcedOnEveryItem, "UTF-8 enforcement");
      assert(run.integrity.contextTruncations === 0, "context truncations");
      assert(run.integrity.errorStops === 0, "error stops");
      const expectedDecoding = {
        maxTokens: 40,
        temperature: 0,
        topK: 40,
        topP: 0.9,
        seed: 42,
        eosTokenId: 3,
        enforceUtf8: true,
      };
      for (const [key, value] of Object.entries(expectedDecoding)) {
        assert(
          run.inputs.decoding[key] === value,
          `decoding ${key} differs from ${String(value)}`
        );
      }
      if (manifestHash === null) manifestHash = run.inputs.evalManifestSha256;
      else assert(manifestHash === run.inputs.evalManifestSha256, "manifest identity");
      if (decoding === null) decoding = run.inputs.decoding;
      else assert(
        JSON.stringify(decoding) === JSON.stringify(run.inputs.decoding),
        "decoding identity"
      );

      assert(run.items.length === 64, "64 items");
      assert(new Set(run.items.map((item) => item.id)).size === 64, "unique item ids");
      for (const item of run.items) {
        const prompt = byId.get(item.id);
        assert(prompt !== undefined, `unexpected item ${item.id}`);
        assert(item.category === "B", `${item.id} category`);
        assert(item.prompt === prompt.text, `${item.id} prompt`);
        assert(item.factId === prompt.factId, `${item.id} fact`);
        assert(item.language === prompt.language, `${item.id} language`);
        const gold = normalizeChatAnswer(prompt.expectedAnswer).text;
        assert(item.gold === gold, `${item.id} gold`);
        const normalized = normalizeChatAnswer(item.continuation).text;
        assert(item.normalized === normalized, `${item.id} normalized`);
        const correct = normalized.length > 0 && normalized === gold;
        assert(item.correct === correct, `${item.id} correctness`);
        const f1 = chatAnswerTokenF1(normalized, gold, prompt.language);
        assert(close(item.tokenF1, f1, 1e-9), `${item.id} token F1`);
        assert(!item.contextTruncated, `${item.id} context truncated`);
        assert(item.stopReason !== "error", `${item.id} error stop`);
        assert(item.utf8Enforced, `${item.id} UTF-8 enforcement`);
      }
    });
  }
}

function testAnalysis(): void {
  console.log("Phase 118 paired analysis");

  const analysisPath = path.join(PHASE_DIR, "paired-analysis.json");
  const headlinePath = path.join(PHASE_DIR, "headline.json");
  const uncertaintyPath = path.join(PHASE_DIR, "uncertainty.json");
  const stratifiedPath = path.join(PHASE_DIR, "stratified-results.json");
  if (
    !exists(analysisPath) ||
    !exists(headlinePath) ||
    !exists(uncertaintyPath) ||
    !exists(stratifiedPath)
  ) {
    skip("paired analysis", "analysis outputs are absent");
    return;
  }

  const analysis = readJson<PairedAnalysis>(analysisPath);
  const headline = readJson<Headline>(headlinePath);
  const uncertainty = readJson<UncertaintyFile>(uncertaintyPath);
  const stratified = readJson<{
    byLanguage: Record<"en" | "zh", RunSummary>;
    bySeed: Record<string, RunSummary>;
    byFact: Array<{ factId: string; summary: RunSummary }>;
    byPair: Array<{ pairId: string; summary: RunSummary }>;
    deterministicDigest: string;
  }>(stratifiedPath);

  test("primary counts and paired arithmetic reconcile", () => {
    const primary = analysis.primary.summary;
    assert(analysis.phase === "118", "analysis phase");
    assert(analysis.primary.observations === 96, "96 paired observations");
    assert(primary.pairs === 96, "96 pairs");
    assert(primary.high.total === 96, "96 high observations");
    assert(primary.low.total === 96, "96 low observations");
    assert(primary.high.correct >= 0 && primary.high.correct <= 96, "high count");
    assert(primary.low.correct >= 0 && primary.low.correct <= 96, "low count");
    assert(
      primary.paired.bothCorrect +
        primary.paired.highOnly +
        primary.paired.lowOnly +
        primary.paired.bothIncorrect ===
        96,
      "paired counts must sum to 96"
    );
    assert(
      primary.paired.highOnly === primary.high.correct - primary.paired.bothCorrect,
      "high-only identity"
    );
    assert(
      primary.paired.lowOnly === primary.low.correct - primary.paired.bothCorrect,
      "low-only identity"
    );
    const difference = (primary.high.correct - primary.low.correct) / 96;
    assert(
      close(primary.difference ?? Number.NaN, round(difference), 1e-6),
      "pooled difference"
    );
    assert(
      headline.primary.high.correct === primary.high.correct &&
        headline.primary.low.correct === primary.low.correct,
      "headline counts"
    );
    assert(
      headline.primary.paired.highOnly === primary.paired.highOnly &&
        headline.primary.paired.lowOnly === primary.paired.lowOnly,
      "headline paired counts"
    );
  });

  test("language and seed strata partition the observations exactly", () => {
    const primary = analysis.primary.summary;
    const en = analysis.stratified.byLanguage.en;
    const zh = analysis.stratified.byLanguage.zh;
    assert(en.pairs + zh.pairs === 96, "language pairs sum");
    assert(en.high.correct + zh.high.correct === primary.high.correct, "language high sum");
    assert(en.low.correct + zh.low.correct === primary.low.correct, "language low sum");
    assert(en.pairs === 48 && zh.pairs === 48, "48 observations per language");

    let seedHigh = 0;
    let seedLow = 0;
    let seedPairs = 0;
    for (const seed of ["42", "43", "44"]) {
      const seedSummary = analysis.stratified.bySeed[seed];
      assert(seedSummary !== undefined, `missing seed ${seed}`);
      assert(seedSummary.pairs === 32, `seed ${seed} pairs`);
      seedHigh += seedSummary.high.correct;
      seedLow += seedSummary.low.correct;
      seedPairs += seedSummary.pairs;
    }
    assert(seedPairs === 96, "seed pairs sum");
    assert(seedHigh === primary.high.correct, "seed high sum");
    assert(seedLow === primary.low.correct, "seed low sum");

    assert(analysis.stratified.byFact.length === 16, "16 fact rows");
    assert(analysis.stratified.byPair.length === 32, "32 pair rows");
    let factHigh = 0;
    let factLow = 0;
    let factPairs = 0;
    for (const row of analysis.stratified.byFact) {
      assert(row.summary.pairs === 6, `${row.factId} must have 6 observations`);
      factHigh += row.summary.high.correct;
      factLow += row.summary.low.correct;
      factPairs += row.summary.pairs;
    }
    assert(factPairs === 96, "fact pairs sum");
    assert(factHigh === primary.high.correct, "fact high sum");
    assert(factLow === primary.low.correct, "fact low sum");

    let pairHigh = 0;
    let pairLow = 0;
    for (const row of analysis.stratified.byPair) {
      assert(row.summary.pairs === 3, `${row.pairId} must have 3 observations`);
      pairHigh += row.summary.high.correct;
      pairLow += row.summary.low.correct;
    }
    assert(pairHigh === primary.high.correct, "pair high sum");
    assert(pairLow === primary.low.correct, "pair low sum");
  });

  test("fact-clustered bootstrap is complete and internally consistent", () => {
    const primary = analysis.primary.accuracy;
    assert(
      analysis.uncertainty.method.includes("fact-clustered"),
      "bootstrap method"
    );
    assert(analysis.uncertainty.clusterUnit.includes("factId"), "cluster unit");
    assert(analysis.uncertainty.replicates === BOOTSTRAP_REPLICATES, "replicates");
    assert(analysis.uncertainty.seed === BOOTSTRAP_SEED, "bootstrap seed");
    assert(primary.validReplicates + primary.skippedReplicates === BOOTSTRAP_REPLICATES, "replicates sum");
    assert(primary.ci95 !== null, "primary interval");
    assert(primary.point !== null, "primary point");
    assert(
      primary.ci95 !== null &&
        primary.point !== null &&
        primary.ci95[0] <= primary.point &&
        primary.point <= primary.ci95[1],
      "point must lie inside its interval"
    );
    assert(
      primary.point !== null &&
        analysis.primary.summary.difference !== null &&
        close(primary.point, analysis.primary.summary.difference),
      "bootstrap point must equal D"
    );
    for (const language of ["en", "zh"] as const) {
      const languageBootstrap = analysis.uncertainty.byLanguage[language].accuracy;
      assert(
        languageBootstrap.validReplicates + languageBootstrap.skippedReplicates ===
          BOOTSTRAP_REPLICATES,
        `${language} replicates sum`
      );
      assert(languageBootstrap.ci95 !== null, `${language} interval`);
      assert(
        languageBootstrap.point !== null &&
          analysis.stratified.byLanguage[language].difference !== null &&
          close(languageBootstrap.point, analysis.stratified.byLanguage[language].difference as number),
        `${language} bootstrap point`
      );
    }
    for (const seed of ["42", "43", "44"]) {
      const seedBootstrap = analysis.uncertainty.bySeed[seed].accuracy;
      assert(
        seedBootstrap.validReplicates + seedBootstrap.skippedReplicates ===
          BOOTSTRAP_REPLICATES,
        `seed ${seed} replicates sum`
      );
      assert(seedBootstrap.ci95 !== null, `seed ${seed} interval`);
    }
  });

  test("sensitivity analysis excludes no pair and equals the primary result", () => {
    const sensitivity = analysis.uncertainty.sensitivity;
    assert(sensitivity.excludedPairs === 0, "no pair should be near-duplicate/leaky");
    assert(sensitivity.equalsPrimary, "sensitivity must equal primary");
    assert(
      sensitivity.summary.difference !== null &&
        analysis.primary.summary.difference !== null &&
        close(sensitivity.summary.difference, analysis.primary.summary.difference),
      "sensitivity D"
    );
    assert(
      sensitivity.accuracy.ci95 !== null &&
        analysis.primary.accuracy.ci95 !== null &&
        close(sensitivity.accuracy.ci95[0], analysis.primary.accuracy.ci95[0]) &&
        close(sensitivity.accuracy.ci95[1], analysis.primary.accuracy.ci95[1]),
      "sensitivity interval"
    );
  });

  test("decision rule is applied exactly as predeclared", () => {
    const integrityPass =
      analysis.integrity.status === "PASS" &&
      analysis.evaluationContract.status === "PASS" &&
      analysis.recomputation.status === "PASS" &&
      analysis.priorArtifacts.status === "PASS" &&
      analysis.promptAudit.status === "PASS";
    const expected = expectedClassification(analysis, integrityPass);
    assert(
      analysis.decisionRule.classification === expected,
      `classification ${analysis.decisionRule.classification} != ${expected}`
    );
    assert(
      headline.classification === analysis.decisionRule.classification,
      "headline classification"
    );
    assert(
      analysis.decisionRule.C1.pass === headline.decisionRule.C1 &&
        analysis.decisionRule.C2.pass === headline.decisionRule.C2 &&
        analysis.decisionRule.C3.pass === headline.decisionRule.C3 &&
        analysis.decisionRule.C4.pass === headline.decisionRule.C4 &&
        analysis.decisionRule.C5.pass === headline.decisionRule.C5 &&
        analysis.decisionRule.allPass === headline.decisionRule.allPass,
      "decision-rule flags"
    );
    assert(analysis.integrity.status === "PASS", "analysis integrity");
    assert(analysis.evaluationContract.status === "PASS", "evaluation contract");
    assert(analysis.recomputation.status === "PASS", "recomputation");
    assert(analysis.promptAudit.status === "PASS", "prompt audit");
  });

  test("analysis, stratified, uncertainty, and headline outputs are identical in digest", () => {
    assert(
      analysis.deterministicDigest === headline.deterministicDigest &&
        analysis.deterministicDigest === uncertainty.deterministicDigest &&
        analysis.deterministicDigest === stratified.deterministicDigest,
      "deterministic digest mismatch across outputs"
    );
    assert(
      analysis.stratified.byLanguage.en.difference ===
        stratified.byLanguage.en.difference,
      "stratified en"
    );
    assert(
      analysis.stratified.bySeed["42"].difference ===
        stratified.bySeed["42"].difference,
      "stratified seed 42"
    );
    assert(
      analysis.primary.accuracy.ci95?.[0] ===
        uncertainty.primary.accuracy.ci95?.[0] &&
        analysis.primary.accuracy.ci95?.[1] ===
          uncertainty.primary.accuracy.ci95?.[1],
      "uncertainty primary"
    );
  });
}

function testHistoricalIntegrity(): void {
  console.log("Phase 118 historical integrity");

  const baselinePath = path.join(PHASE_DIR, "integrity-baseline.json");
  const reportPath = path.join(PHASE_DIR, "integrity.json");
  if (!exists(baselinePath) || !exists(reportPath)) {
    skip("historical integrity", "baseline or verification report is absent");
    return;
  }

  const baseline = readJson<IntegrityBaseline>(baselinePath);
  const report = readJson<IntegrityReport>(reportPath);

  test("protected artifacts are unchanged from the pre-generation baseline", () => {
    assert(baseline.phase === "118", "baseline phase");
    assert(baseline.status === "BASELINE", "baseline status");
    assert(baseline.fileCount === baseline.files.length, "baseline file count");
    assert(report.phase === "118", "integrity report phase");
    assert(report.status === "PASS", `integrity report ${report.status}`);
    assert(report.missing.length === 0, `missing files: ${report.missing.join(", ")}`);
    assert(report.extra.length === 0, `extra files: ${report.extra.join(", ")}`);
    assert(report.changed.length === 0, `changed files: ${JSON.stringify(report.changed)}`);
    assert(report.gitHeadMatches, "git HEAD changed");
    assert(report.failures.length === 0, `integrity failures: ${report.failures.join("; ")}`);
    assert(
      baseline.gitHead === gitHead(),
      `current git HEAD ${gitHead()} differs from baseline ${baseline.gitHead}`
    );
  });

  test("baseline pins the protected phases and frozen H118 inputs", () => {
    const paths = new Set(baseline.files.map((file) => file.path));
    for (const prefix of [
      "experiments/phase90/",
      "experiments/phase113/",
      "experiments/phase114/",
      "experiments/phase115/",
      "experiments/phase116/",
      "experiments/phase117/",
    ]) {
      assert(
        [...paths].some((filePath) => filePath.startsWith(prefix)),
        `baseline must cover ${prefix}`
      );
    }
    for (const frozen of [
      "experiments/h118/analysis-spec.json",
      "experiments/h118/prompts.json",
      "experiments/h118/eval-manifest.json",
      "experiments/h118/freeze-manifest.json",
      "experiments/h118/evaluate.ts",
      "experiments/h118/analyze.ts",
    ]) {
      assert(paths.has(frozen), `baseline must pin ${frozen}`);
    }
  });

  test("key prior hashes match the Phase 116/117 record", () => {
    const byPath = new Map(
      baseline.files.map((file) => [file.path, file.sha256])
    );
    assert(
      byPath.get("experiments/phase116/dataset.source.json") ===
        "535ba575732f62e912e46cca686734c3e8aa57f62d4d68f3a874b00fea0b7de9",
      "Phase 116 dataset source hash"
    );
    assert(
      byPath.get("experiments/phase116/eval-manifest.json") ===
        "07b95fbec6f1c1ac948770cf97ea675161a961f76da781089cd4a94642d829b8",
      "Phase 116 eval manifest hash"
    );
    for (const seed of [42, 43, 44]) {
      const checkpoint = baseline.files.find((file) =>
        file.path.endsWith(`seed-${seed}/final.ckpt.json`)
      );
      assert(checkpoint !== undefined, `baseline checkpoint ${seed}`);
      assert(
        checkpoint.sha256 === CHECKPOINT_HASHES[seed],
        `checkpoint ${seed} hash`
      );
    }
  });
}

function testReport(): void {
  console.log("Phase 118 report");
  if (!exists(REPORT_PATH)) {
    skip("report exists and records the predeclared result", "report not yet written");
    return;
  }
  test("report exists and cites the frozen sources and result", () => {
    const report = fs.readFileSync(REPORT_PATH, "utf8");
    for (const token of [
      "experiments/h118/analysis-spec.json",
      "experiments/h118/prompts.json",
      "experiments/h118/eval-manifest.json",
      "high-overlap",
      "low-overlap",
      "fact-clustered",
      "exact-match",
      "Limitations",
      "Future hypotheses",
      "No training",
      "not committed",
    ]) {
      assert(report.includes(token), `report must mention ${token}`);
    }
  });
}

export function runPhase118Tests(): {
  passed: number;
  failed: number;
  skipped: number;
} {
  console.log("Phase 118 — controlled lexical-overlap intervention");
  testSpecAndPrompts();
  testAuditsAndManifests();
  testEvaluationRuns();
  testAnalysis();
  testHistoricalIntegrity();
  testReport();
  console.log(
    `  Phase 118: ${passed} passed, ${failed} failed, ${skipped} skipped`
  );
  return { passed, failed, skipped };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("phase118-lexical-overlap.test.ts")) {
  const result = runPhase118Tests();
  if (result.failed > 0) process.exitCode = 1;
}
