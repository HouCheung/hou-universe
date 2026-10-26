// ============================================================
// Phase 97 — Position / Context Alignment Audit (contract suite)
// ============================================================
// Verifies the Phase 97 audit instrument and the evidence it produced.
//
// The audit's job was to decide whether the remaining Level-4 failure is
// caused primarily by a mismatch between the training prediction task and
// the evaluator's short-prefix continuation task. Its classification is
// B (partially supported), so Phase 97 implemented NO intervention and
// ran NO training. This suite therefore locks down the AUDIT and its
// DECISION GATE, not an experiment arm.
//
//   DETERMINISM / GEOMETRY CONTRACTS (re-derived here, live):
//   1. the tokenizer and aligned dataset rebuild deterministically
//   2. window provenance recovery is exact for every built window
//   3. training geometry: supervised-position count, context-length
//      range, true-prefix property and short-prefix support
//   4. evaluation geometry: prompt tokenization and presented contexts
//   5. the token-boundary divergence, re-derived independently
//   6. augmentation geometry vs the Phase 96 recorded preflight
//
//   ARTIFACT CONTRACTS (skip-with-report if absent — never fabricated):
//   7. the artifact exists, is read-only and reports no training
//   8. the decision gate is internally consistent and reproducible
//   9. the architecture probe found no positional encoding
//  10. the recorded-arm corroboration matches the Phase 96 artifacts
//
//   FROZEN-SURFACE CONTRACTS (the audit must not have moved anything):
//  11. the audit contains no Math.random / setTimeout / optimizer step
//  12. the evaluator prompt set and the Level-4 gate are unchanged
//
// This suite makes NO claim about the audit's OUTCOME beyond recording
// the classification the artifact itself derived. Existing Phase 57-96
// suites are NOT modified or weakened.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  OUT_PATH,
  PHASE96_PREFLIGHT,
  GEN_EVAL_PROMPTS,
  config,
  buildTokenizer,
  buildAlignedDataset,
  buildWindowIndex,
  matchPrefix,
  s0RangeFor,
  auditTrainingGeometry,
  auditEvalGeometry,
  auditAugmentedGeometry,
} from "../../../../../experiments/phase97/position-alignment-audit";

import { loadProductionDataset, getDatasetTexts } from "../../data/datasetLoader";

// ============================================================
// Harness — mirrors the Phase 90-96 suites
// ============================================================

const PHASE_DIR = path.resolve(__dirname, "..", "..", "..", "..", "..", "experiments", "phase97");

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`    PASS  ${name}`);
  } else {
    failed++;
    console.log(`    FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function skip(name: string, why: string): void {
  skipped++;
  console.log(`    SKIP  ${name} -- ${why}`);
}

function readArtifact(): Record<string, unknown> | null {
  if (!fs.existsSync(OUT_PATH)) return null;
  return JSON.parse(fs.readFileSync(OUT_PATH, "utf8")) as Record<string, unknown>;
}

// ============================================================
// Shared fixtures — built once, deterministically
// ============================================================

interface Fixtures {
  corpus: string[];
  tokenizer: ReturnType<typeof buildTokenizer>;
  docTokenSeq: number[][];
  dataset: ReturnType<typeof buildAlignedDataset>;
  index: ReturnType<typeof buildWindowIndex>;
}

let fixtures: Fixtures | null = null;

function fx(): Fixtures {
  if (fixtures === null) {
    const corpus = getDatasetTexts(loadProductionDataset());
    const tokenizer = buildTokenizer(corpus);
    const docTokenSeq = corpus.map((t) => tokenizer.encode(t));
    fixtures = {
      corpus,
      tokenizer,
      docTokenSeq,
      dataset: buildAlignedDataset(tokenizer, corpus),
      index: buildWindowIndex(docTokenSeq),
    };
  }
  return fixtures;
}

// ============================================================
// 1-6. Determinism and geometry, re-derived live
// ============================================================

function testPipelineDeterminism(): void {
  console.log("\n  -- Phase 97: pipeline determinism (re-derived live) --");

  const { corpus, tokenizer, dataset } = fx();
  const maxDocLen = Math.max(...fx().docTokenSeq.map((d) => d.length));

  // A second, fresh, seeded pipeline must agree exactly. This is the same
  // contract Phases 90/94/96 relied on for their reproducibility checks.
  const tokenizer2 = buildTokenizer(corpus);
  check(
    "a fresh seeded tokenizer reproduces the same vocabSize",
    tokenizer2.vocabSize === tokenizer.vocabSize,
    `${tokenizer2.vocabSize} vs ${tokenizer.vocabSize}`
  );
  check(
    "a fresh seeded tokenizer reproduces every corpus encoding",
    corpus.every((t) => tokenizer2.encode(t).join(",") === tokenizer.encode(t).join(","))
  );

  const dataset2 = buildAlignedDataset(tokenizer2, corpus);
  check(
    "a fresh aligned dataset has the same length",
    dataset2.length() === dataset.length(),
    `${dataset2.length()} vs ${dataset.length()}`
  );
  check(
    "every document contributes exactly one window (none exceeds blockSize)",
    dataset.length() === corpus.length,
    `${dataset.length()} vs ${corpus.length}`
  );
  check(
    "no document reaches blockSize tokens, so no document is ever split",
    maxDocLen < config.BLOCK_SIZE,
    `max doc length ${maxDocLen}, blockSize ${config.BLOCK_SIZE}`
  );
}

function testWindowProvenance(): void {
  console.log("\n  -- Phase 97: window provenance recovery --");

  const { dataset, index, docTokenSeq } = fx();

  let recovered = 0;
  let mismatched = 0;
  let unrecovered = 0;

  for (let w = 0; w < dataset.length(); w++) {
    const sample = dataset.get(w);
    const match = matchPrefix(index, sample.inputIds);
    if (match.index === -1) {
      unrecovered++;
      continue;
    }
    // The recovered (docIndex, start) must reproduce this window exactly.
    const doc = docTokenSeq[match.docIndex];
    let ok = true;
    for (let s = 0; s < config.BLOCK_SIZE; s++) {
      const pos = match.start + s;
      const expected = pos < doc.length ? doc[pos] : config.PAD_TOKEN_ID;
      if (sample.inputIds[s] !== expected) {
        ok = false;
        break;
      }
    }
    if (ok) recovered++;
    else mismatched++;
  }

  check(
    "every built window is recovered exactly from its own content",
    unrecovered === 0 && mismatched === 0 && recovered === dataset.length(),
    `recovered ${recovered}/${dataset.length()}, unrecovered ${unrecovered}, mismatched ${mismatched}`
  );
}

function testTrainingGeometry(): void {
  console.log("\n  -- Phase 97: training geometry (re-derived) --");

  const { dataset, index, docTokenSeq } = fx();
  const { geometry } = auditTrainingGeometry(dataset, index);

  const maxDocLen = Math.max(...docTokenSeq.map((d) => d.length));

  check(
    "the shortest supervised context is a single token",
    geometry.contextLengthStats.min === 1,
    `${geometry.contextLengthStats.min}`
  );
  check(
    "the longest supervised context is one less than the longest document",
    geometry.contextLengthStats.max === maxDocLen - 1,
    `${geometry.contextLengthStats.max} vs ${maxDocLen - 1}`
  );
  check(
    "no supervised context exceeds blockSize - 1",
    geometry.contextLengthStats.max <= config.BLOCK_SIZE - 1,
    `${geometry.contextLengthStats.max}`
  );
  check(
    "supervised positions equal sum(docLen - 1) over the corpus",
    geometry.supervisedPositions === docTokenSeq.reduce((a, d) => a + (d.length - 1), 0),
    `${geometry.supervisedPositions}`
  );
  check(
    "every supervised training context is a true document prefix",
    geometry.contextAlwaysDocumentPrefix
  );
  check(
    "the evaluator's prompt regime (<= 5 tokens) has non-zero training support",
    (geometry.supervisedPositionsWithContextAtMost["<=5"] ?? 0) > 0,
    JSON.stringify(geometry.supervisedPositionsWithContextAtMost)
  );
  check(
    "the aligned layout never inserts <eos> as input or as target",
    geometry.eosTargets === 0 && geometry.eosTokensAsInput === 0,
    `targets ${geometry.eosTargets}, inputs ${geometry.eosTokensAsInput}`
  );
}

function testEvalGeometry(): void {
  console.log("\n  -- Phase 97: evaluation geometry (re-derived) --");

  const { tokenizer, corpus, docTokenSeq, dataset, index } = fx();
  const { positions } = auditTrainingGeometry(dataset, index);
  const evalGeom = auditEvalGeometry(tokenizer, corpus, docTokenSeq, positions);

  check(
    "the frozen prompt set carries exactly 5 prompts",
    GEN_EVAL_PROMPTS.length === 5 && evalGeom.prompts.length === 5,
    `${GEN_EVAL_PROMPTS.length} / ${evalGeom.prompts.length}`
  );
  check(
    "the audit reports the production prompt set verbatim, in order",
    evalGeom.prompts.length === GEN_EVAL_PROMPTS.length &&
      evalGeom.prompts.every((p, i) => p.prompt === GEN_EVAL_PROMPTS[i].prompt)
  );
  check(
    "every prompt's tokenization is re-derived from the production tokenizer",
    evalGeom.prompts.every(
      (p) => p.tokenIds.join(",") === tokenizer.encode(p.prompt).join(",")
    )
  );
  check(
    "generation exposes exactly MAX_TOKENS continuation positions",
    evalGeom.continuationPositionHistogram.length === config.MAX_TOKENS,
    `${evalGeom.continuationPositionHistogram.length}`
  );
  check(
    "every context length the evaluator presents lies inside training support",
    evalGeom.continuationContextLengthHistogram.length > 0 &&
      evalGeom.continuationContextLengthHistogram.every(
        (h) => h.key >= 1 && h.key <= config.BLOCK_SIZE - 1
      ),
    `range ${evalGeom.evaluatedContextLengthMin}..${evalGeom.evaluatedContextLengthMax}`
  );
  check(
    "the evaluator never presents a context longer than the model's max context",
    evalGeom.evaluatedContextLengthMax <= config.MAX_CTX,
    `${evalGeom.evaluatedContextLengthMax} vs ${config.MAX_CTX}`
  );
}

/**
 * The token-boundary divergence, re-derived from scratch.
 *
 * "the sun rises" is the first 13 characters of document 0 verbatim, yet
 * it does NOT tokenize to document 0's opening tokens: byte-level BPE's
 * greedy merge of "es" + " " only exists when the word continues into the
 * next one. This is the audit's central positive finding, so it is
 * re-derived here rather than read out of the artifact.
 */
function testTokenBoundaryDivergence(): void {
  console.log("\n  -- Phase 97: token-boundary divergence (re-derived) --");

  const { corpus, tokenizer, docTokenSeq } = fx();

  const doc0 = corpus[0];
  const doc0Ids = docTokenSeq[0];
  const promptIds = tokenizer.encode("the sun rises");

  check(
    "the prompt is a verbatim CHARACTER prefix of document 0",
    doc0.startsWith("the sun rises"),
    JSON.stringify(doc0)
  );
  check(
    "the prompt is NOT a token prefix of document 0",
    doc0Ids.slice(0, promptIds.length).join(",") !== promptIds.join(","),
    `prompt [${promptIds}] vs doc head [${doc0Ids.slice(0, promptIds.length)}]`
  );

  let div = -1;
  for (let i = 0; i < Math.min(promptIds.length, doc0Ids.length); i++) {
    if (promptIds[i] !== doc0Ids[i]) {
      div = i;
      break;
    }
  }
  check("the divergence is at token index 7", div === 7, `index ${div}`);
  check(
    "the prompt holds a bare 'e' where the document holds the merged 'es '",
    div === 7 &&
      tokenizer.decode([promptIds[div]]) === "e" &&
      tokenizer.decode([doc0Ids[div]]) === "es ",
    `prompt ${JSON.stringify(tokenizer.decode([promptIds[div] ?? -1]))}, ` +
      `doc ${JSON.stringify(tokenizer.decode([doc0Ids[div] ?? -1]))}`
  );
  check(
    "concatenating the training-taught tail duplicates the grapheme",
    div === 7 &&
      "the sun rises" + tokenizer.decode(doc0Ids.slice(div)) ===
        "the sun riseses over the quiet valley each morning",
    JSON.stringify("the sun rises" + tokenizer.decode(doc0Ids.slice(div)))
  );

  // The divergence must be recorded with exactly these token ids.
  const artifact = readArtifact();
  if (artifact === null) {
    skip("the artifact records the divergence with matching token ids", `missing ${OUT_PATH}`);
  } else {
    const tb = (artifact.evalGeometry as { tokenBoundary: Record<string, unknown>[] })
      .tokenBoundary;
    const sun = tb.find((r) => r.prompt === "the sun rises");
    check(
      "the artifact records the divergence with matching token ids and text",
      sun !== undefined &&
        sun.divergenceIndex === 7 &&
        sun.promptTokenAtDivergence === 105 &&
        sun.documentTokenAtDivergence === 295 &&
        sun.promptTokenAtDivergenceText === "e" &&
        sun.documentTokenAtDivergenceText === "es " &&
        sun.characterPrefixButNotTokenPrefix === true,
      JSON.stringify(sun)
    );
  }

  // Two prompts have no support at all: the string never occurs anywhere.
  check(
    "'machine learning is' does not occur in the corpus at all",
    !corpus.some((t) => t.includes("machine learning is"))
  );
  check(
    "'机器学习是' does not occur in the corpus at all",
    !corpus.some((t) => t.includes("机器学习是"))
  );
}

function testAugmentedGeometry(): void {
  console.log("\n  -- Phase 97: augmentation geometry vs Phase 96 record --");

  const { docTokenSeq } = fx();
  const aug = auditAugmentedGeometry(docTokenSeq);

  // The reachable s0 range is a corpus property: lo is pinned, while hi
  // shrinks for short documents and must never exceed the pinned bound.
  const longDoc = s0RangeFor(60, config.AUG_K);
  const shortDoc = s0RangeFor(13, config.AUG_K);
  const tooShort = s0RangeFor(config.AUG_S0_MIN + config.AUG_K, config.AUG_K);

  check(
    "the reachable s0 range is always a subset of [AUG_S0_MIN, AUG_S0_MAX]",
    longDoc.lo === config.AUG_S0_MIN &&
      longDoc.hi === config.AUG_S0_MAX &&
      shortDoc.lo === config.AUG_S0_MIN &&
      shortDoc.hi <= config.AUG_S0_MAX,
    `60 -> ${longDoc.lo}..${longDoc.hi}, 13 -> ${shortDoc.lo}..${shortDoc.hi}`
  );
  check(
    "a document too short to host the augmented window yields an empty range",
    shortDoc.hi < longDoc.hi && tooShort.hi < config.AUG_S0_MIN,
    `13 -> ${shortDoc.lo}..${shortDoc.hi}, borderline -> ${tooShort.lo}..${tooShort.hi}`
  );

  if (!aug.crossCheck.exists) {
    skip(
      "augmentation geometry matches the Phase 96 recorded preflight",
      `preflight not found at ${PHASE96_PREFLIGHT}`
    );
    return;
  }

  check(
    "eligible-document count matches the Phase 96 recorded preflight",
    aug.crossCheck.eligibleDocsMatch === true &&
      aug.eligibleDocs === aug.crossCheck.phase96EligibleDocs,
    `re-derived ${aug.eligibleDocs} vs recorded ${aug.crossCheck.phase96EligibleDocs}`
  );
  check(
    "the reachable s0 range distribution matches the Phase 96 record",
    aug.crossCheck.s0RangeDistributionMatch === true,
    JSON.stringify(aug.s0RangeDistribution)
  );
}

// ============================================================
// 7-10. Artifact contracts
// ============================================================

function testArtifactInnocence(): void {
  console.log("\n  -- Phase 97: artifact innocence --");

  const artifact = readArtifact();
  if (!artifact) {
    skip("the audit artifact declares itself read-only and untrained", `missing ${OUT_PATH}`);
    return;
  }

  check("the artifact declares itself read-only", artifact.readOnly === true);
  check(
    "the artifact declares that no training was performed",
    artifact.trainingPerformed === false
  );

  const gen = (artifact.provenance as { generator?: Record<string, unknown> }).generator;
  check("the artifact records a deterministic generator", gen?.deterministic === true);
  check(
    "the artifact records no Math.random() and no setTimeout()",
    gen?.usesMathRandom === false && gen?.usesSetTimeout === false
  );
}

function testDecisionGate(): void {
  console.log("\n  -- Phase 97: decision gate --");

  const artifact = readArtifact();
  if (!artifact) {
    skip("the decision gate is internally consistent", `missing ${OUT_PATH}`);
    return;
  }

  const gate = artifact.decisionGate as {
    classification?: string;
    classificationLabel?: string;
    rules?: { id: string; rule: string; observed: boolean }[];
    reasoning?: string[];
  };

  check(
    "the gate carries exactly one of the four classifications",
    typeof gate.classification === "string" &&
      ["A", "B", "C", "D"].includes(gate.classification),
    String(gate.classification)
  );
  check(
    "the gate reported all seven rules, each with a boolean observation",
    Array.isArray(gate.rules) &&
      gate.rules.length === 7 &&
      gate.rules.every((r) => typeof r.observed === "boolean" && r.rule.length > 0),
    `${gate.rules?.length ?? 0} rules`
  );
  check(
    "the gate states its reasoning",
    Array.isArray(gate.reasoning) && gate.reasoning.length > 0,
    `${gate.reasoning?.length ?? 0} lines`
  );

  const rules = new Map((gate.rules ?? []).map((r) => [r.id, r.observed]));
  const structuralRefuted = ["R1", "R2", "R3", "R4"].every((id) => rules.get(id) === true);
  const contentGap = ["R5", "R6", "R7"].every((id) => rules.get(id) === true);

  check(
    "all four structural axes are refuted (no positional / length / task / support mismatch)",
    structuralRefuted
  );
  check(
    "a content-level mismatch is nevertheless demonstrated and corroborated",
    contentGap
  );
  check(
    "structural refutation plus a content gap classifies the hypothesis as B",
    gate.classification === "B",
    `classification ${gate.classification}, label ${gate.classificationLabel}`
  );
}

function testArchitectureProbe(): void {
  console.log("\n  -- Phase 97: architecture probe --");

  const artifact = readArtifact();
  if (!artifact) {
    skip("the architecture probe found no positional encoding", `missing ${OUT_PATH}`);
    return;
  }

  const probe = artifact.architectureProbe as {
    positionalEncodingPresent?: boolean;
    allBitIdentical?: boolean;
    maxAbsDeltaAcrossAllCases?: number;
    docsTested?: number;
    cases?: unknown[];
  };

  check(
    "the probe found no positional encoding in the production model",
    probe.positionalEncodingPresent === false
  );
  check(
    "padded-window and bare-prefix logits are bit-identical in every case",
    probe.allBitIdentical === true && probe.maxAbsDeltaAcrossAllCases === 0,
    `allBitIdentical ${probe.allBitIdentical}, maxAbsDelta ${probe.maxAbsDeltaAcrossAllCases}`
  );
  check(
    "the probe exercised at least one document and recorded one case per document",
    (probe.docsTested ?? 0) > 0 &&
      Array.isArray(probe.cases) &&
      probe.cases.length === probe.docsTested,
    `${probe.docsTested} docs / ${probe.cases?.length ?? 0} cases`
  );
}

function testCorroboration(): void {
  console.log("\n  -- Phase 97: recorded-arm corroboration --");

  const artifact = readArtifact();
  if (!artifact) {
    skip("the divergence prediction is corroborated in the recorded arms", `missing ${OUT_PATH}`);
    return;
  }

  const corr = artifact.recordedCorroboration as {
    armsRead?: { arm: string; path: string; exists: boolean }[];
    testableRows?: number;
    matchingRows?: number;
    rows?: {
      arm: string;
      prompt: string;
      divergenceIndex: number;
      documentTokenAtDivergence: number | null;
      firstGeneratedTokens: number[];
      firstTokenMatchesDocumentTokenAtDivergence: boolean | null;
    }[];
  };

  const present = (corr.armsRead ?? []).filter((a) => a.exists);
  if (present.length === 0) {
    skip(
      "the divergence prediction is corroborated in the recorded arms",
      "no Phase 96 arm artifacts present"
    );
    return;
  }

  check(
    "every arm artifact the corroboration cites exists on disk",
    (corr.armsRead ?? []).length > 0 && (corr.armsRead ?? []).every((a) => a.exists),
    JSON.stringify((corr.armsRead ?? []).map((a) => [a.arm, a.exists]))
  );
  check(
    "every testable (arm, prompt) pair emitted the divergence token first",
    (corr.testableRows ?? 0) > 0 && corr.matchingRows === corr.testableRows,
    `${corr.matchingRows}/${corr.testableRows}`
  );

  // 'the sun rises' is the only prompt with a divergence to test: every
  // recorded arm must open it with token 295 ("es ").
  const sunRows = (corr.rows ?? []).filter((r) => r.prompt === "the sun rises");
  check(
    "one 'the sun rises' row was recorded per available arm",
    sunRows.length === present.length,
    `${sunRows.length} rows vs ${present.length} arms`
  );
  check(
    "every recorded arm opens 'the sun rises' with the document's merge token",
    sunRows.length > 0 &&
      sunRows.every(
        (r) =>
          r.divergenceIndex === 7 &&
          r.documentTokenAtDivergence === 295 &&
          r.firstTokenMatchesDocumentTokenAtDivergence === true &&
          r.firstGeneratedTokens[0] === 295
      ),
    JSON.stringify(sunRows.map((r) => [r.arm, r.firstGeneratedTokens[0]]))
  );
  check(
    "rows without a divergence are marked untestable rather than counted",
    (corr.rows ?? [])
      .filter((r) => r.divergenceIndex === -1)
      .every((r) => r.firstTokenMatchesDocumentTokenAtDivergence === null)
  );
}

// ============================================================
// 11-12. Frozen surface
// ============================================================

/**
 * Remove comments so a source-text check tests CODE, not prose.
 *
 * The audit's header legitimately *mentions* `Math.random()` and the
 * `experiments/phase94|95` paths in order to state that it uses neither.
 * Scanning raw text would flag those sentences as violations, so the
 * checks below run against comment-stripped source.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function testFrozenSurface(): void {
  console.log("\n  -- Phase 97: frozen surface --");

  const auditSource = stripComments(
    fs.readFileSync(path.join(PHASE_DIR, "position-alignment-audit.ts"), "utf8")
  );

  check("the audit never calls Math.random()", !/Math\.random\s*\(/.test(auditSource));
  check("the audit never calls setTimeout()", !/setTimeout\s*\(/.test(auditSource));
  check(
    "the audit runs no optimizer step and saves no checkpoint",
    !/optimizer\.step\s*\(/.test(auditSource) && !/saveCheckpoint/.test(auditSource)
  );
  check(
    "the audit imports no Phase 94 or Phase 95 training harness",
    !/experiments\/phase9[45]/.test(auditSource)
  );

  // The frozen prompt set lives in the unchanged Phase-95 evaluator harness,
  // which is what Phase 96 and this audit both feed to evaluateGeneration().
  // The production evaluator itself takes prompts as a parameter, so it holds
  // no prompt strings of its own — asserting against it would be wrong.
  const phase95Harness = fs.readFileSync(
    path.resolve(PHASE_DIR, "..", "phase95", "probe.ts"),
    "utf8"
  );
  check(
    "the frozen five-prompt evaluator set is unchanged in the Phase 95 harness",
    GEN_EVAL_PROMPTS.every((p) => phase95Harness.includes(p.prompt)),
    GEN_EVAL_PROMPTS.map((p) => p.prompt).join(" | ")
  );

  const evalSource = fs.readFileSync(
    path.resolve(__dirname, "..", "capability-eval", "evaluate.ts"),
    "utf8"
  );
  check(
    "the evaluator still receives its prompt set as a parameter (no hidden set)",
    /export function evaluateGeneration\(/.test(evalSource) &&
      /prompts:\s*CapabilityPrompt\[\]/.test(evalSource)
  );
  check(
    "the evaluator's generation horizon and seed are unchanged (24 tokens, seed 42)",
    config.MAX_TOKENS === 24 && /seed\s*=\s*42/.test(evalSource)
  );

  const levelsSource = fs.readFileSync(
    path.resolve(__dirname, "..", "capability-eval", "levels.ts"),
    "utf8"
  );
  check(
    "the Level-4 gate still has exactly its three unchanged conditions",
    levelsSource.includes('"validUtf8TolerantRatio === 1"') &&
      levelsSource.includes('"nonEmptyRatio === 1"') &&
      levelsSource.includes('"collapsedRatio === 0"')
  );
  check(
    "charIntegrityRate and tokensToFirstInvalid remain diagnostics, not gates",
    levelsSource.includes("LEVEL4_DIAGNOSTIC_FIELDS") &&
      !/charIntegrityRate\s*===\s*1/.test(levelsSource) &&
      !/tokensToFirstInvalid\w*\s*[<>]=?\s*\d/.test(levelsSource)
  );
}

// ============================================================
// Runner
// ============================================================

export function runPhase97Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\n  -- Phase 97: position/context alignment audit --");
  testPipelineDeterminism();
  testWindowProvenance();
  testTrainingGeometry();
  testEvalGeometry();
  testTokenBoundaryDivergence();
  testAugmentedGeometry();
  testArtifactInnocence();
  testDecisionGate();
  testArchitectureProbe();
  testCorroboration();
  testFrozenSurface();

  console.log(`  Phase 97: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}
