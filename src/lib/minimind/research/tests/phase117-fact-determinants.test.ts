// ============================================================
// Phase 117 — fact-level transfer determinant contracts
// ============================================================
// This suite never trains, generates, or writes. It re-reads the
// frozen Phase 115/116 artifacts and the Phase 117 analysis
// outputs, and checks:
//
//   1. The predeclared specification exists and is marked as such.
//   2. Every source artifact hash is unchanged and no checkpoint
//      is in the analysis input set.
//   3. Category B item sets and language strata are exact.
//   4. The Phase 116 word overlap covariate agrees with the frozen
//      Phase 116 lexical-overlap artifact.
//   5. Per-run, per-fact, and per-language counts reconcile with the
//      retained evaluation artifacts.
//   6. Uncertainty intervals are internally consistent and
//      deterministic under the predeclared seed.
//   7. Destination classification totals reconcile with exact match.
//   8. The predeclared answer-token features are degenerate exactly
//      as documented, and the exploratory corrections exist.
//   9. The Phase 116 fact-stability counts match the Phase 116 report.
//  10. The analysis report exists and cites the frozen source files.
//
// If an output is absent the corresponding checks report SKIP.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const PHASE_DIR = path.join(ROOT, "experiments", "phase117");
const REPORT_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "minimind",
  "research",
  "PHASE117-FACT-LEVEL-TRANSFER-DETERMINANTS-REPORT.md"
);

const TOKENIZER_FINGERPRINT =
  "a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d";

// ── Minimal artifact shapes ──────────────────────────────────

interface SpecFile {
  status: string;
  primaryCovariate?: string;
  explanatoryVariables: { lexicalOverlap: { primaryCovariate: string } };
  uncertainty: { replicates: number; method: string };
  explicitNonClaims: string[];
}

interface PromptFeature {
  id: string;
  factId: string;
  language: "en" | "zh";
  wordMaxJaccard: number;
  wordMeanJaccard: number;
  tokMaxJaccard: number;
  tokMeanJaccard: number;
  answerFeatures: AnswerFeature;
}

interface AnswerFeature {
  answer: string;
  answerChars: number;
  answerTokens: number;
  firstAnswerTokenId: number;
  firstTokenSharedCount: number;
  answerMaxTokenJaccard: number;
  answerMeanTokenJaccard: number;
  otherFactsSharingAnyToken: number;
  contentChars: number;
  contentTokenCount: number;
  contentMaxTokenJaccard: number;
  surfaceMaxJaccard: number;
}

interface PromptFile {
  phase: string;
  tokenizerFingerprint: string;
  items: PromptFeature[];
}

interface ManifestItem {
  id: string;
  factId: string;
  language: "en" | "zh";
  category: "A" | "B" | "C";
}

interface FactSummary {
  factId: string;
  categoryB: {
    pooled: { correct: number; total: number };
    en: { correct: number; total: number };
    zh: { correct: number; total: number };
    perRun: Array<{ runId: string; correct: number; total: number }>;
  };
  stability: {
    stableSuccessAllRuns: boolean;
    neverSuccess: boolean;
    runsWithSuccess: number;
  };
  failureModes: {
    otherTrainedSubstitutions: number;
    unmatched: number;
  };
}

interface FactFile {
  phase: string;
  facts: FactSummary[];
}

interface LexicalFile {
  phase: string;
  primaryCovariate: string;
  perRun: Array<{
    runId: string;
    overall: { correct: number; incorrect: number; pointBiserial: number | null };
    en: { correct: number; incorrect: number };
    zh: { correct: number; incorrect: number };
  }>;
  pooled: {
    overall: { correct: number; incorrect: number; pointBiserial: number | null };
    en: { pointBiserial: number | null };
    zh: { pointBiserial: number | null };
    tokenizerLevel: { overall: { pointBiserial: number | null } };
  };
  factLevel: { overall: { spearman: number | null } };
  itemStability: {
    alwaysCorrect: number;
    neverCorrect: number;
    alwaysCorrectMeanWordMaxJaccard: number;
    neverCorrectMeanWordMaxJaccard: number;
  };
  withinFactLanguageCells: Array<{
    runId: string;
    eligibleCells: number;
    concordant: number;
    discordant: number;
    tied: number;
  }>;
}

interface UncertaintyFile {
  phase: string;
  replicates: number;
  seed: number;
  accuracyByRun: Array<{
    runId: string;
    correct: number;
    total: number;
    pointAccuracy: number;
    bootstrap: { point: number | null; ci95: [number, number] | null; validReplicates: number; skippedReplicates: number };
  }>;
  pooledSeedAverage: { point: number | null; ci95: [number, number] | null };
  pearsonWordMaxJaccardVsCorrect: {
    overall: { point: number | null; ci95: [number, number] | null };
    en: { point: number | null; ci95: [number, number] | null };
    zh: { point: number | null; ci95: [number, number] | null };
  };
  correctMinusIncorrectOverlap: { point: number | null; ci95: [number, number] | null };
  factLevelSpearman: { point: number | null; ci95: [number, number] | null };
}

interface ConfusionFile {
  phase: string;
  perRun: Array<{
    runId: string;
    overall: { total: number; counts: Record<string, number> };
    en: { total: number; counts: Record<string, number> };
    zh: { total: number; counts: Record<string, number> };
  }>;
  pooledByLanguage: Record<
    string,
    { total: number; counts: Record<string, number>; intendedFormattingOnly: number }
  >;
  otherTrained: {
    totalSubstitutions: number;
    concentration: Array<Record<string, unknown>>;
  };
  postHocNearestAnswer: Record<string, unknown>;
}

interface AnswerTokenFile {
  phase: string;
  predeclaredFeatureDiagnostics: { degenerate: boolean; reason: string };
  byLanguage: Record<
    string,
    {
      facts: AnswerFeature[];
      predeclaredCorrelations: Array<{ variable: string; spearman: number | null }>;
      exploratoryCorrectedCorrelations: Array<{ variable: string; spearman: number | null }>;
    }
  >;
}

interface IntegrityFile {
  files: Array<{ file: string; sha256Before: string; sha256After: string; unchanged: boolean }>;
  changedCount: number;
  unchangedCount: number;
  tokenizerFingerprint: string;
  noTraining: boolean;
  noGeneration: boolean;
  noCheckpointRead: boolean;
}

interface EvaluationFile {
  items: Array<{ id: string; category: string; correct: boolean; language: string }>;
}

interface FrozenOverlapFile {
  items: Array<{ id: string; maxJaccard: number }>;
}

// ── Harness ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, message: string): void {
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

function phaseFiles(phase: "phase115" | "phase116"): {
  prompt: PromptFile;
  fact: FactFile;
  lexical: LexicalFile;
  uncertainty: UncertaintyFile;
  confusion: ConfusionFile;
  answerTokens: AnswerTokenFile;
} {
  return {
    prompt: readJson<PromptFile>(path.join(PHASE_DIR, `per-prompt-features-${phase}.json`)),
    fact: readJson<FactFile>(path.join(PHASE_DIR, `per-fact-summary-${phase}.json`)),
    lexical: readJson<LexicalFile>(
      path.join(PHASE_DIR, `lexical-overlap-analysis-${phase}.json`)
    ),
    uncertainty: readJson<UncertaintyFile>(path.join(PHASE_DIR, `uncertainty-${phase}.json`)),
    confusion: readJson<ConfusionFile>(path.join(PHASE_DIR, `confusion-analysis-${phase}.json`)),
    answerTokens: readJson<AnswerTokenFile>(
      path.join(PHASE_DIR, `answer-token-analysis-${phase}.json`)
    ),
  };
}

// ── Tests ────────────────────────────────────────────────────

function runPhase117Tests(): { passed: number; failed: number; skipped: number } {
  console.log("Phase 117 — fact-level transfer determinant contracts");

  if (!exists(path.join(PHASE_DIR, "analysis-spec.json"))) {
    skip("all contracts", "Phase 117 analysis outputs are absent");
    return { passed, failed, skipped };
  }

  const spec = readJson<SpecFile>(path.join(PHASE_DIR, "analysis-spec.json"));
  const integrity = readJson<IntegrityFile>(path.join(PHASE_DIR, "integrity.json"));
  const headline = readJson<Record<string, unknown>>(path.join(PHASE_DIR, "headline.json"));
  const phases = {
    phase116: phaseFiles("phase116"),
    phase115: phaseFiles("phase115"),
  };

  // 1. Predeclared specification.
  test("analysis specification is marked predeclared", () => {
    assert(
      spec.status.includes("PREDECLARED"),
      `spec status should say PREDECLARED, found: ${spec.status}`
    );
    assert(
      spec.explanatoryVariables.lexicalOverlap.primaryCovariate.startsWith("wordMaxJaccard"),
      "primary covariate must be wordMaxJaccard"
    );
    assert(
      spec.uncertainty.method.includes("10,000 replicates"),
      "bootstrap must predeclare 10,000 replicates"
    );
    assert(
      spec.uncertainty.method.toLowerCase().includes("fact-clustered"),
      "bootstrap must be fact-clustered"
    );
    assert(
      spec.explicitNonClaims.some((claim) => claim.toLowerCase().includes("no causal")),
      "spec must disclaim causal claims"
    );
  });

  // 2. Integrity.
  test("no source artifact changed during analysis", () => {
    assert(integrity.changedCount === 0, `expected 0 changed, found ${integrity.changedCount}`);
    assert(
      integrity.unchangedCount === integrity.files.length,
      "every hashed file must be recorded unchanged"
    );
    for (const file of integrity.files) {
      assert(file.unchanged, `${file.file} must be unchanged`);
      assert(
        file.sha256Before === file.sha256After,
        `${file.file} before/after hashes must match`
      );
    }
    assert(integrity.files.length >= 11, `expected at least 11 hashed inputs, found ${integrity.files.length}`);
    assert(
      !integrity.files.some((file) => file.file.endsWith(".ckpt.json")),
      "no checkpoint may appear in the analysis input set"
    );
    assert(integrity.noTraining && integrity.noGeneration && integrity.noCheckpointRead, "no training/generation/checkpoint read");
    assert(
      integrity.tokenizerFingerprint === TOKENIZER_FINGERPRINT,
      "tokenizer fingerprint must match the frozen value"
    );
  });

  for (const phaseName of ["phase116", "phase115"] as const) {
    const files = phases[phaseName];
    const isP116 = phaseName === "phase116";
    const expectedItems = isP116 ? 64 : 48;
    const expectedFacts = isP116 ? 16 : 12;
    const expectedRuns = isP116 ? ["seed-42", "seed-43", "seed-44"] : [
      "p115-original-seed42",
      "p115-supplementary-seed43",
      "p115-supplementary-seed44",
    ];
    const manifestPath = isP116
      ? path.join(ROOT, "experiments", "phase116", "eval-manifest.json")
      : path.join(ROOT, "experiments", "phase115", "eval-manifest.json");
    const manifest = readJson<{ items: ManifestItem[] }>(manifestPath).items;

    test(`${phaseName}: Category B item set and language strata are exact`, () => {
      const expectedIds = manifest
        .filter((item) => item.category === "B")
        .map((item) => item.id)
        .sort();
      const actualIds = files.prompt.items.map((item) => item.id).sort();
      assert(actualIds.length === expectedItems, `expected ${expectedItems} B items, found ${actualIds.length}`);
      assert(
        JSON.stringify(actualIds) === JSON.stringify(expectedIds),
        "B item ids must equal the frozen manifest's Category B ids"
      );
      const en = files.prompt.items.filter((item) => item.language === "en").length;
      const zh = files.prompt.items.filter((item) => item.language === "zh").length;
      assert(en === expectedItems / 2 && zh === expectedItems / 2, "languages must be balanced");
      assert(
        files.prompt.items.every((item) => item.answerFeatures !== undefined),
        "every B item must carry its fact answer features"
      );
    });

    test(`${phaseName}: per-run and per-fact counts reconcile`, () => {
      assert(files.fact.facts.length === expectedFacts, `expected ${expectedFacts} facts`);
      let pooledCorrect = 0;
      let pooledTotal = 0;
      for (const fact of files.fact.facts) {
        assert(fact.categoryB.pooled.total === 4 * expectedRuns.length, "4 B items per fact per run");
        assert(fact.categoryB.en.total === 2 * expectedRuns.length, "2 en items per fact per run");
        assert(fact.categoryB.zh.total === 2 * expectedRuns.length, "2 zh items per fact per run");
        const perRunCorrect = fact.categoryB.perRun.reduce((sum, run) => sum + run.correct, 0);
        assert(
          perRunCorrect === fact.categoryB.pooled.correct,
          `${fact.factId}: per-run correct must sum to pooled correct`
        );
        assert(
          fact.categoryB.en.correct + fact.categoryB.zh.correct === fact.categoryB.pooled.correct,
          `${fact.factId}: language counts must sum to pooled`
        );
        pooledCorrect += fact.categoryB.pooled.correct;
        pooledTotal += fact.categoryB.pooled.total;
      }
      assert(pooledTotal === expectedItems * expectedRuns.length, "pooled denominators must cover all runs");
      const runIds = files.fact.facts[0].categoryB.perRun.map((run) => run.runId);
      assert(
        JSON.stringify(runIds) === JSON.stringify(expectedRuns),
        `run ids must be ${expectedRuns.join(", ")}`
      );
      const lexical = files.lexical;
      const lexicalCorrect = lexical.perRun.reduce((sum, run) => sum + run.overall.correct, 0);
      assert(lexicalCorrect === pooledCorrect, "lexical per-run correct totals must equal per-fact totals");
    });

    test(`${phaseName}: uncertainty intervals are internally consistent`, () => {
      assert(files.uncertainty.replicates === 10000, "10,000 bootstrap replicates");
      assert(files.uncertainty.seed === 20261022, "predeclared bootstrap seed");
      for (const run of files.uncertainty.accuracyByRun) {
        assert(
          run.bootstrap.validReplicates + run.bootstrap.skippedReplicates === 10000,
          `${run.runId}: valid + skipped replicates must equal 10,000`
        );
        if (run.bootstrap.ci95 !== null && run.bootstrap.point !== null) {
          assert(
            run.bootstrap.ci95[0] <= run.bootstrap.point && run.bootstrap.point <= run.bootstrap.ci95[1],
            `${run.runId}: point must lie inside its interval`
          );
        }
        const expected = run.correct / run.total;
        assert(
          Math.abs(run.pointAccuracy - expected) < 5e-7,
          `${run.runId}: point accuracy must match counts (rate is rounded to 6 decimals)`
        );
      }
      if (files.uncertainty.pooledSeedAverage.point !== null) {
        const meanAccuracy =
          files.uncertainty.accuracyByRun.reduce((sum, run) => sum + run.pointAccuracy, 0) /
          files.uncertainty.accuracyByRun.length;
        assert(
          Math.abs(files.uncertainty.pooledSeedAverage.point - meanAccuracy) < 1e-6,
          "pooled seed-average must equal the mean of run accuracies"
        );
      }
      const overallPearson = files.uncertainty.pearsonWordMaxJaccardVsCorrect.overall;
      if (overallPearson.ci95 !== null && overallPearson.point !== null) {
        assert(
          overallPearson.ci95[0] <= overallPearson.point && overallPearson.point <= overallPearson.ci95[1],
          "Pearson point must lie inside its fact-clustered interval"
        );
      }
    });

    test(`${phaseName}: destination classification reconciles with exact match`, () => {
      assert(files.confusion.perRun.length === expectedRuns.length, "one confusion block per run");
      for (const run of files.confusion.perRun) {
        const counts = run.overall.counts;
        const sum = Object.values(counts).reduce((a, b) => a + b, 0);
        assert(sum === run.overall.total, `${run.runId}: destination counts must sum to total`);
        assert(
          counts.intended + counts["other-trained"] + counts.empty + counts.abnormal + counts.unmatched ===
            run.overall.total,
          `${run.runId}: all five destination categories must be counted`
        );
        assert(run.overall.total === expectedItems, `${run.runId}: total must be ${expectedItems}`);
      }
      for (const language of ["en", "zh"] as const) {
        const block = files.confusion.pooledByLanguage[language];
        const intended = block.counts.intended;
        const pooledCorrect = files.fact.facts.reduce(
          (sum, fact) =>
            sum + (language === "en" ? fact.categoryB.en.correct : fact.categoryB.zh.correct),
          0
        );
        assert(
          block.total === (expectedItems / 2) * expectedRuns.length,
          `${language}: pooled denominator must be ${(expectedItems / 2) * expectedRuns.length}`
        );
        assert(
          block.intendedFormattingOnly === 0,
          `${language}: no formatting-only exact-match misses were observed`
        );
        assert(
          intended === pooledCorrect,
          `${language}: destination 'intended' must equal the exact-match count`
        );
        assert(intended >= 0 && intended <= block.total, `${language}: intended count in range`);
      }
      const substitutions = files.confusion.otherTrained.totalSubstitutions;
      const pooledSubstitutions =
        files.confusion.pooledByLanguage.en.counts["other-trained"] +
        files.confusion.pooledByLanguage.zh.counts["other-trained"];
      assert(
        substitutions === pooledSubstitutions,
        "total substitutions must equal the pooled language counts"
      );
      if (isP116) {
        assert(substitutions === 9, `Phase 116 exact trained-answer substitutions were 9, found ${substitutions}`);
      } else {
        assert(substitutions === 2, `Phase 115 exact trained-answer substitutions were 2, found ${substitutions}`);
      }
    });

    test(`${phaseName}: answer-token degeneracy and corrections are as documented`, () => {
      assert(
        files.answerTokens.predeclaredFeatureDiagnostics.degenerate,
        "predeclared tokenizer features must be flagged degenerate"
      );
      for (const language of ["en", "zh"] as const) {
        const block = files.answerTokens.byLanguage[language];
        const n = block.facts.length;
        const firstIds = new Set(block.facts.map((fact) => fact.firstAnswerTokenId));
        assert(firstIds.size === 1, `${language}: all answers must share the leading-space token`);
        assert(
          block.facts.every((fact) => fact.otherFactsSharingAnyToken === n - 1),
          `${language}: every answer token set must share the space/punctuation tokens with all others`
        );
        const predeclaredFirst = block.predeclaredCorrelations.find(
          (entry) => entry.variable === "firstTokenSharedCount"
        );
        assert(predeclaredFirst !== undefined, `${language}: firstTokenSharedCount correlation missing`);
        assert(predeclaredFirst.spearman === null, `${language}: degenerate first-token correlation must be null`);
        assert(
          block.exploratoryCorrectedCorrelations.length >= 6,
          `${language}: exploratory corrected correlations must be present`
        );
        assert(
          block.facts.every((fact) => fact.contentTokenCount > 0),
          `${language}: corrected content token counts must be positive`
        );
      }
    });
  }

  // Phase 116-specific cross-artifact checks.
  test("Phase 116 word overlap agrees with the frozen covariate artifact", () => {
    const frozen = readJson<FrozenOverlapFile>(
      path.join(ROOT, "experiments", "phase116", "lexical-overlap.json")
    );
    const mine = new Map(phases.phase116.prompt.items.map((item) => [item.id, item]));
    assert(frozen.items.length === 64, "frozen covariate has 64 items");
    for (const item of frozen.items) {
      const actual = mine.get(item.id);
      assert(actual !== undefined, `missing overlap for ${item.id}`);
      assert(
        Math.abs(actual.wordMaxJaccard - item.maxJaccard) < 1e-4,
        `${item.id}: overlap ${actual.wordMaxJaccard} vs frozen ${item.maxJaccard}`
      );
    }
  });

  test("Phase 116 per-seed B counts match the retained evaluations", () => {
    const expected = [
      { id: "seed-42", correct: 20 },
      { id: "seed-43", correct: 19 },
      { id: "seed-44", correct: 19 },
    ];
    for (const entry of expected) {
      const evaluation = readJson<EvaluationFile>(
        path.join(ROOT, "experiments", "phase116", entry.id, "eval-final.json")
      );
      const bItems = evaluation.items.filter((item) => item.category === "B");
      const correct = bItems.filter((item) => item.correct).length;
      assert(correct === entry.correct, `${entry.id}: expected ${entry.correct}, found ${correct}`);
      const lexical = phases.phase116.lexical.perRun.find((run) => run.runId === entry.id);
      assert(lexical !== undefined, `${entry.id}: lexical run missing`);
      assert(lexical.overall.correct === correct, `${entry.id}: lexical count must match evaluation`);
      assert(
        lexical.overall.incorrect === bItems.length - correct,
        `${entry.id}: incorrect count must match evaluation`
      );
    }
  });

  test("Phase 116 fact stability matches the Phase 116 report", () => {
    const facts = phases.phase116.fact.facts;
    const stable = facts.filter((fact) => fact.stability.stableSuccessAllRuns);
    const never = facts.filter((fact) => fact.stability.neverSuccess);
    assert(stable.length === 9, `expected 9 facts stable in every seed, found ${stable.length}`);
    assert(never.length === 3, `expected 3 facts never successful, found ${never.length}`);
    const stableIds = stable.map((fact) => fact.factId).sort().join(",");
    assert(
      stableIds ===
        "p116-t01,p116-t04,p116-t06,p116-t08,p116-t11,p116-t12,p116-t13,p116-t15,p116-t16",
      `stable fact ids changed: ${stableIds}`
    );
    const neverIds = never.map((fact) => fact.factId).sort().join(",");
    assert(neverIds === "p116-t02,p116-t07,p116-t14", `never-success fact ids changed: ${neverIds}`);
  });

  test("Phase 116 point-biserial matches the Phase 116 aggregate artifact", () => {
    const aggregate = readJson<{
      lexicalOverlap: {
        pooled: { itemLevelPointBiserial: number };
        perSeed: Array<{ seed: number; pointBiserial: number }>;
      };
    }>(path.join(ROOT, "experiments", "phase116", "aggregate-results.json"));
    const lexical = phases.phase116.lexical;
    assert(
      Math.abs((lexical.pooled.overall.pointBiserial ?? 0) - aggregate.lexicalOverlap.pooled.itemLevelPointBiserial) < 1e-4,
      "pooled point-biserial must agree with the Phase 116 aggregate"
    );
    for (const seed of aggregate.lexicalOverlap.perSeed) {
      const run = lexical.perRun.find((entry) => entry.runId === `seed-${seed.seed}`);
      assert(run !== undefined, `missing run for seed ${seed.seed}`);
      assert(
        Math.abs((run.overall.pointBiserial ?? 0) - seed.pointBiserial) < 1e-4,
        `seed ${seed.seed}: point-biserial must agree with the Phase 116 aggregate`
      );
    }
  });

  test("Phase 116 tokenizer-level overlap is reported separately", () => {
    const tokenizerPoint = phases.phase116.lexical.pooled.tokenizerLevel.overall.pointBiserial;
    assert(tokenizerPoint !== null, "tokenizer-level point-biserial must be present");
    assert(
      (tokenizerPoint ?? 0) > (phases.phase116.lexical.pooled.overall.pointBiserial ?? 0),
      "tokenizer-level overlap is expected to be higher than word-level in this byte-level tokenizer"
    );
  });

  test("Phase 115 pooled interval includes zero while Phase 116 excludes it", () => {
    const p116 = phases.phase116.uncertainty.pearsonWordMaxJaccardVsCorrect.overall.ci95;
    const p115 = phases.phase115.uncertainty.pearsonWordMaxJaccardVsCorrect.overall.ci95;
    assert(p116 !== null && p115 !== null, "both overall intervals must exist");
    assert(p116[0] > 0, `Phase 116 overall interval should exclude zero, found ${JSON.stringify(p116)}`);
    assert(p115[0] <= 0 && p115[1] >= 0, `Phase 115 overall interval should include zero, found ${JSON.stringify(p115)}`);
  });

  test("Phase 116 pooled word-overlap association is positive in both languages", () => {
    const lexical = phases.phase116.lexical;
    assert((lexical.pooled.en.pointBiserial ?? 0) > 0, "English point-biserial must be positive");
    assert((lexical.pooled.zh.pointBiserial ?? 0) > 0, "Chinese point-biserial must be positive");
    assert(
      (lexical.factLevel.overall.spearman ?? 0) > 0,
      "fact-level Spearman must be positive"
    );
    assert(
      lexical.itemStability.alwaysCorrectMeanWordMaxJaccard >
        lexical.itemStability.neverCorrectMeanWordMaxJaccard,
      "items correct in every run should have higher mean overlap than never-correct items"
    );
  });

  test("within-fact comparisons are reported with denominators", () => {
    for (const phaseName of ["phase116", "phase115"] as const) {
      const cells = phases[phaseName].lexical.withinFactLanguageCells;
      assert(cells.length === 3, `${phaseName}: three run blocks expected`);
      for (const run of cells) {
        assert(
          run.concordant + run.discordant + run.tied === run.eligibleCells,
          `${phaseName}/${run.runId}: cell outcomes must sum to eligible cells`
        );
      }
      const totalConcordant = cells.reduce((sum, run) => sum + run.concordant, 0);
      const totalDiscordant = cells.reduce((sum, run) => sum + run.discordant, 0);
      assert(totalConcordant > 0, `${phaseName}: at least one concordant within-fact cell`);
      assert(totalDiscordant >= 0, `${phaseName}: discordant count is non-negative`);
    }
  });

  test("headline summary records the same integrity and phase counts", () => {
    const headlineIntegrity = headline.integrity as
      | { allSourceUnchanged: boolean; filesChecked: number; tokenizerFingerprint: string }
      | undefined;
    assert(headlineIntegrity !== undefined, "headline integrity block missing");
    assert(headlineIntegrity.allSourceUnchanged, "headline must report unchanged sources");
    assert(
      headlineIntegrity.filesChecked === integrity.files.length,
      "headline and integrity must check the same number of files"
    );
    assert(
      headlineIntegrity.tokenizerFingerprint === TOKENIZER_FINGERPRINT,
      "headline tokenizer fingerprint mismatch"
    );
    const phasesBlock = headline.phases as Record<string, { bItems: number; facts: number; runs: number }>;
    assert(phasesBlock.phase116.bItems === 64 && phasesBlock.phase116.facts === 16, "Phase 116 counts");
    assert(phasesBlock.phase115.bItems === 48 && phasesBlock.phase115.facts === 12, "Phase 115 counts");
  });

  if (exists(REPORT_PATH)) {
    test("report exists and cites the frozen source artifacts", () => {
      const report = fs.readFileSync(REPORT_PATH, "utf8");
      for (const token of [
        "experiments/phase116/dataset.source.json",
        "experiments/phase115/dataset.source.json",
        "analysis-spec.json",
        "wordMaxJaccard",
        "fact-clustered",
        "not modified",
        "no causal",
      ]) {
        assert(report.includes(token), `report must mention ${token}`);
      }
    });
  } else {
    skip("report exists and cites the frozen source artifacts", "report not yet written");
  }

  console.log(`  Phase 117: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("phase117-fact-determinants.test.ts")) {
  const result = runPhase117Tests();
  if (result.failed > 0) process.exitCode = 1;
}
