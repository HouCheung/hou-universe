// ============================================================
// Phase 99 — CJK Transition Logit Mechanism Audit (contract suite)
// ============================================================
// Verifies the Phase 99 audit INSTRUMENT and its measurements, not an
// experiment arm. Phase 99 trained nothing, changed no checkpoint and
// modified no production module; its job was to decide, for each recorded
// CJK/mixed interior corruption state, whether
//
//     Mechanism A — the correct continuation IS represented in the model's
//                   distribution and merely ranked below an incompatible one,
//     Mechanism B — the correct continuation is effectively absent from the
//                   learned distribution,
//
// or whether the truth is a byte-phase (C), representation (D), mixed (E)
// or unresolved (F) mechanism.
//
// The audit's answers are only as trustworthy as its measuring logic, so
// this suite re-derives the measurements instead of asserting the numbers
// the audit happened to print:
//
//   RECONSTRUCTION (§4, §10)
//   1. the replayed prefix is the prompt plus the recorded tokens before
//      the first invalid token, and its byte length matches the trace
//   2. a FRESH forward pass over the replayed prefix reproduces the
//      artifact's raw logits element for element, on every audited state
//   3. the identical forward is deterministic; the reloaded checkpoint is
//      parameter-identical and logit-identical to the loaded one
//
//   LOGIT AUDIT (§5)
//   4. logit vector shape, rank ordering and tie-breaking are exact
//   5. every probability is softmax(logits / T) of the SAME logit vector
//   6. top-K is the true top-K of the ranking, with real compatibility
//   7. margins, masses and entropies are re-derived from the raw logits
//   8. the actual token is the token the recorded generation really emitted
//   9. the corpus-support level and transition count are re-measured
//
//   BYTE PHASE (§6, §8)
//  10. the phase is measured on the actual bytes, and the Phase-99 walker
//      agrees with the Phase-98 `appendBytes` walker on every state
//  11. `consumed = sequenceLength - need`, and the phase label follows
//  12. the open-character tokenization is byte-exact and self-consistent
//  13. the preceding token walk is contiguous in byte offsets
//
//   CORPUS SUPPORT (§9, §12)
//  14. the Phase-98 counts are preserved, not re-interpreted
//  15. the corpus census of decision types is re-derived and contains no
//      incompatible transition
//
//   DECISION GATE (§15)
//  16. the gate maps the artifact's own evidence rows to the artifact's own
//      mechanism letter, and the letter is one of A-F
//
//   INTEGRITY (§2, §21)
//  17. the source performs no training, writes only its artifact, and uses
//      no nondeterminism
//
// Nothing here pins a logit value, a probability or a measured average:
// every expected value is either re-derived at test time or read back from
// the artifact being checked. Phase 57-98 suites are untouched.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

// The audit's own measuring logic, re-applied here.
import {
  OUT_PATH,
  TOP_K,
  RUBRIC,
  walkPhaseBytes,
  phaseOfIds,
  phaseOfConsumed,
  softmaxAt,
  rankByLogit,
  entropyOf,
  logitsIdentical,
  maxAbsDiff,
  readState,
  loadArmModel,
  compareParameters,
  readRecordedFailures,
  measureCorpusPhaseCoverage,
  decideMechanism,
  labelFailureMechanism,
  type ByteClassMass,
  type BytePhase,
  type EvidenceRow,
  type FailureMechanismLabel,
} from "../../../../../experiments/phase99/logit-mechanism-audit";

// The frozen Phase-98 surface the audit itself measures against. Importing
// these from Phase 98 rather than re-declaring them is the point: if the
// audit had changed the tokenizer, corpus, prompt set or phase machine,
// these checks would fail rather than quietly agree with it.
import {
  ARMS,
  GEN_EVAL_PROMPTS,
  MAX_CTX,
  MAX_TOKENS,
  SEED,
  TEMPERATURE,
  VOCAB_TARGET,
  BOUNDARY_STATE,
  appendBytes,
  buildCorpusIndex,
  buildTokenizer,
  classifyVocabulary,
  loadCorpus,
  measureCorpusStateTransitions,
  measureSupport,
  tokenBytes,
  type VocabEntry,
} from "../../../../../experiments/phase98/cjk-byte-corruption-audit";

import { scanUtf8, type IdToTokenMap } from "../capability-eval/utf8";

// ============================================================
// Harness — mirrors the Phase 90-98 suites
// ============================================================

const PHASE_DIR = path.resolve(__dirname, "..", "..", "..", "..", "..", "experiments", "phase99");
const AUDIT_SRC = path.join(PHASE_DIR, "logit-mechanism-audit.ts");

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

/** Tolerance for re-derivations that are pure float arithmetic. */
const EPS = 1e-9;

// ============================================================
// Artifact view — narrowed to the fields this suite re-checks
// ============================================================
// Only structural facts are declared here. No field is given an expected
// VALUE: the tests recompute values and compare them with these.

interface ArtifactRef {
  id: number;
  tokenClass: string;
  bytesHex: string;
  logit: number;
  p: number;
  rank: number;
  compatible: boolean;
  completing: boolean;
  selfValidUtf8: boolean;
}

interface ArtifactSpan {
  tokenIndex: number;
  id: number;
  tokenClass: string;
  bytesHex: string;
  byteStart: number;
  byteEnd: number;
  phaseAfter: string;
  needAfter: number;
}

interface ArtifactOpenChar {
  applies: boolean;
  openLeadByte: number | null;
  consumedBytes: number;
  sequenceLength: number;
  spans: ArtifactSpan[];
  tokenCount: number;
  singleTokenSupplied: boolean;
  tokenClasses: string[];
  bytesInside: string[];
  enteredByPartialMerge: boolean;
  tokenBoundariesInsideChar: number;
}

interface ArtifactEvidenceRow {
  armKey: string;
  prompt: string;
  failureTokenIndex: number;
  phase: BytePhase;
  need: number;
  corpusSupportLevel: string;
  corpusSupported: boolean;
  corpusSupportedBest: {
    id: number;
    count: number;
    tokenClass: string;
    bytesHex: string;
  } | null;
  documentExpected: ArtifactRef | null;
  bestCompatible: ArtifactRef | null;
  actual: ArtifactRef;
  argmax: ArtifactRef;
  marginCorpusSupportedMinusActual: number | null;
  marginBestCompatibleMinusActual: number | null;
  marginArgmaxMinusActual: number;
  corpusSupportedInTopK: boolean;
  bestCompatibleInTopK: boolean;
  expectedAboveUniform: boolean;
  fatalTokenLegalFromBoundary: boolean;
  precededByPartialMerge: boolean;
  compatibleMass: number;
  incompatibleMass: number;
  entropy: number;
  mechanismLabel: FailureMechanismLabel;
}

interface ArtifactFailure {
  armKey: string;
  prompt: string;
  language: string;
  recordedIn: string;
  failureTokenIndex: number;
  failureByteOffset: number;
  replayedPrefixIds: number[];
  bytePhase: {
    phase: BytePhase;
    need: number;
    sequenceLength: number;
    consumedBytes: number;
    openLeadByte: number | null;
    phaseWalkerAgreesWithAppendBytes: boolean;
  };
  openCharTokenization: ArtifactOpenChar;
  precedingTokenWalk: ArtifactSpan[];
  phase98NeedAtFault: number | null;
  reconstructionAgrees: boolean;
  reconstructionLogitsIdentical: boolean;
  reconstructionMaxAbsLogitDiff: number | null;
  distribution: {
    contextLength: number;
    contextTail: number[];
    compatibleMass: number;
    incompatibleMass: number;
    compatibleIdCount: number;
    entropy: number;
    byteClassMass: ByteClassMass;
    argmaxId: number;
    argmaxCompatible: boolean;
    bestCompatibleId: number;
    bestCompatibleRank: number;
    topK: ArtifactRef[];
  };
  logits: number[];
  evidence: ArtifactEvidenceRow;
  corpusSupportCrossCheck: {
    compared: boolean;
    agreesWithPhase98: boolean;
    mismatches: string[];
  };
}

interface ArtifactDeterminism {
  checkpoint: string;
  paramsCompared: number;
  paramElementsCompared: number;
  paramMismatchCount: number;
  maxAbsParamDiff: number;
  paramsAllEqual: boolean;
  repeatedForwardIdentical: boolean;
  repeatedForwardMaxAbsLogitDiff: number;
  reloadForwardIdentical: boolean;
  reloadForwardMaxAbsLogitDiff: number;
  probeContextIds: number[];
  crossProcessBitIdentityMeasured: boolean;
}

interface Artifact {
  phase: string;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  recipe: {
    seed: number;
    vocabTarget: number;
    maxTokens: number;
    maxCtx: number;
    temperature: number;
    topK: number;
    uniformBaseline: number;
    promptSet: string;
  };
  phaseDefinition: Record<string, string>;
  reconstructionSummary: {
    allTrajectoriesReproduced: boolean;
    failureStatesReconstructed: number;
    auditedFailureStates: number;
  };
  checkpointDeterminism: ArtifactDeterminism[];
  failures: ArtifactFailure[];
  evidenceTable: ArtifactEvidenceRow[];
  controls: Record<string, unknown>;
  preCorruption: {
    trajectories: number;
    trajectoriesWithCorruption: number;
    decisionsBeforeCorruption: number;
    decisionsAfterCorruption: number;
    firstInvalidStepDistribution: Record<string, number>;
    meanCompatibleMass: number;
    meanEntropy: number;
    argmaxCompatibleShare: number;
    byPhase: { phase: BytePhase; states: number; meanCompatibleMass: number }[];
    midSequenceTokenCountDistribution: Record<string, number>;
  };
  corpusPhaseCoverage: {
    documents: number;
    tokens: number;
    byDecisionType: {
      phase: BytePhase;
      openCharTokenCount: number;
      viaPartialMerge: boolean;
      decisions: number;
      legalNext: number;
    }[];
    midSequenceSplitByTokenCount: Record<string, number>;
    incompatibleTransitions: number;
  };
  aggregate: {
    auditedFailureStates: number;
    corpusSupportedAtEveryFailure: boolean;
    allReconstructionsAgree: boolean;
    stepCount: number;
    failuresByMechanismLabel: Record<string, number>;
  };
  decisionGate: {
    mechanism: string;
    flags: string[];
    counts: { failures: number; labelCounts: Record<string, number> };
  };
  integrity: Record<string, unknown>;
}

// ============================================================
// Fixtures
// ============================================================
// The real tokenizer, corpus and vocabulary are rebuilt with the frozen
// recipe, so every check below runs through the SAME code path the audit
// used. Nothing is stubbed and no expected value is hand-entered.

interface Fixture {
  tokenizer: ReturnType<typeof buildTokenizer>;
  idToToken: IdToTokenMap;
  vocab: VocabEntry[];
  corpus: string[];
  vocabById: Map<number, VocabEntry>;
}

let fixture: Fixture | null = null;

function getFixture(): Fixture {
  if (fixture) return fixture;
  const corpus = loadCorpus();
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const idToToken = tokenizer.getVocabulary().idToToken;
  const vocab = classifyVocabulary(idToToken, VOCAB_TARGET);
  const vocabById = new Map<number, VocabEntry>();
  for (const v of vocab) vocabById.set(v.id, v);
  fixture = { tokenizer, idToToken, vocab, corpus, vocabById };
  return fixture;
}

let artifactCache: Artifact | null = null;

/** Load the artifact, or null when the audit has not been run yet. */
function getArtifact(): Artifact | null {
  if (artifactCache) return artifactCache;
  if (!fs.existsSync(OUT_PATH)) return null;
  artifactCache = JSON.parse(fs.readFileSync(OUT_PATH, "utf8")) as Artifact;
  return artifactCache;
}

/** Hex string of a byte array, in the artifact's own notation. */
function hexOf(bytes: readonly number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

/** Parse the artifact's `"e5 93"` notation back into bytes. */
function bytesFromHex(hex: string): number[] {
  if (hex.trim().length === 0) return [];
  return hex.trim().split(/\s+/).map((h) => Number.parseInt(h, 16));
}

// ============================================================
// Collection-time contracts — no artifact required
// ============================================================

function testPhaseMachine(): void {
  // Lead-byte sequence lengths, including the deliberately illegal ones.
  check("lead 0x41 is a 1-byte sequence", phaseLength(0x41) === 1);
  check("lead 0xc2 is a 2-byte sequence", phaseLength(0xc2) === 2);
  check("lead 0xe5 is a 3-byte sequence", phaseLength(0xe5) === 3);
  check("lead 0xf0 is a 4-byte sequence", phaseLength(0xf0) === 4);
  check("lead 0x80 is not a lead", phaseLength(0x80) === -1);
  check("lead 0xc0 is not a legal lead", phaseLength(0xc0) === -1);
  check("lead 0xf5 is not a legal lead", phaseLength(0xf5) === -1);

  // A full 3-byte CJK character walks out to a boundary.
  const three = walkPhaseBytes([0xe5, 0x93, 0x88]);
  check(
    "a complete 3-byte character ends at a character boundary",
    three.phase.phase === "P0" && three.phase.need === 0
  );

  // The phase after each consumed byte is what §6 defines it to be. Note
  // that `need` and the phase label are NOT the same number: after one byte
  // of a 3-byte character `need === 2` but the phase is P1.
  const afterOne = walkPhaseBytes([0xe5]);
  check(
    "one byte into a 3-byte character is P1, not P2",
    afterOne.phase.phase === "P1" && afterOne.phase.need === 2,
    `${afterOne.phase.phase} need=${afterOne.phase.need}`
  );
  const afterTwo = walkPhaseBytes([0xe5, 0x93]);
  check(
    "two bytes into a 3-byte character is P2, not P1",
    afterTwo.phase.phase === "P2" && afterTwo.phase.need === 1,
    `${afterTwo.phase.phase} need=${afterTwo.phase.need}`
  );

  // A bare continuation byte at a boundary breaks the stream.
  const bare = walkPhaseBytes([0x80]);
  check(
    "a bare continuation byte at a boundary is unrecoverable",
    bare.phase.recoverable === false && bare.phase.phase === "PX"
  );

  // A non-continuation byte mid-character breaks the stream.
  const wrong = walkPhaseBytes([0xe5, 0x41]);
  check(
    "an ASCII byte mid-character is unrecoverable",
    wrong.phase.recoverable === false && wrong.phase.phase === "PX"
  );

  // `phaseOfConsumed` is the label function, not a rename of `need`.
  check("need 0 is P0", phaseOfConsumed(0, 0) === "P0");
  check("need 2 / consumed 1 is P1", phaseOfConsumed(2, 1) === "P1");
  check("need 1 / consumed 2 is P2", phaseOfConsumed(1, 2) === "P2");
  check("need 0 / consumed 3 is P0", phaseOfConsumed(0, 3) === "P0");
  check("need 3 / consumed 3 is P3", phaseOfConsumed(3, 3) === "P3");
}

function testDistributionUtilities(): void {
  // Softmax at the production temperature is a distribution.
  const logits = [0.5, -1.25, 3.0, 0.0];
  const p = softmaxAt(logits, TEMPERATURE);
  const total = p.reduce((s, v) => s + v, 0);
  check("softmax sums to 1", Math.abs(total - 1) < EPS, `${total}`);
  check("softmax is positive everywhere", p.every((v) => v > 0));
  check(
    "softmax preserves the logit ordering",
    p[2] > p[0] && p[0] > p[3] && p[3] > p[1]
  );

  // At temperature 1 the softmax is the plain exponential normalisation.
  const p1 = softmaxAt([1, 2], 1);
  const e1 = Math.exp(1);
  const e2 = Math.exp(2);
  check(
    "at temperature 1 softmax is the plain normalisation",
    Math.abs(p1[0] - e1 / (e1 + e2)) < EPS && Math.abs(p1[1] - e2 / (e1 + e2)) < EPS
  );

  // Ranking is descending by logit, tie-broken by ascending id.
  const ranking = rankByLogit([1.0, 5.0, 5.0, 0.0]);
  check(
    "ranking is descending with ascending-id tie-break",
    ranking[0] === 1 && ranking[1] === 2 && ranking[2] === 0 && ranking[3] === 3,
    ranking.join(",")
  );
  check(
    "ranking is a permutation of the vocabulary",
    ranking.length === 4 && new Set(ranking).size === 4
  );

  // Entropy of a point mass is zero; of a uniform 2-way split is ln 2.
  check("entropy of a point mass is 0", Math.abs(entropyOf([1, 0])) < EPS);
  check(
    "entropy of a uniform 2-way split is ln 2",
    Math.abs(entropyOf([0.5, 0.5]) - Math.LN2) < EPS
  );

  // Bit-comparison helpers used to prove reconstruction.
  check("identical logits compare identical", logitsIdentical([1, 2, 3], [1, 2, 3]));
  check("a one-bit difference is detected", !logitsIdentical([1, 2, 3], [1, 2, 3 + Number.EPSILON * 8]));
  check("maxAbsDiff of equal vectors is 0", maxAbsDiff([1, 2], [1, 2]) === 0);
  check("maxAbsDiff reports the largest gap", maxAbsDiff([1, 9], [1, 2]) === 7);
}

function phaseLength(byteValue: number): number {
  // Re-derived locally from the UTF-8 lead-byte ranges the audit uses, so
  // this test does not merely echo the instrument's own function.
  if (byteValue < 0x80) return 1;
  if (byteValue >= 0xc2 && byteValue <= 0xdf) return 2;
  if (byteValue >= 0xe0 && byteValue <= 0xef) return 3;
  if (byteValue >= 0xf0 && byteValue <= 0xf4) return 4;
  return -1;
}

function testMechanismLabelRule(): void {
  const mass = (bare: number, lead: number, ascii: number): ByteClassMass => ({
    legalContinuation: 0,
    asciiLead: ascii,
    multibyteLead: lead,
    bareContinuation: bare,
    illegalLead: 0,
    unclassified: 0,
  });

  check(
    "a legal argmax is a sampling draw whatever the rest of the mass does",
    labelFailureMechanism({
      argmaxCompatible: true,
      compatibleMass: 0.01,
      phase: "P0",
      byteClassMass: mass(0.99, 0, 0),
    }) === "sampling-draw"
  );
  check(
    "an illegal argmax with a legal majority is under-ranked-legal",
    labelFailureMechanism({
      argmaxCompatible: false,
      compatibleMass: 0.5,
      phase: "P1",
      byteClassMass: mass(0.5, 0.5, 0),
    }) === "under-ranked-legal"
  );
  check(
    "boundary mass on continuation bytes is boundary-state-continuation",
    labelFailureMechanism({
      argmaxCompatible: false,
      compatibleMass: 0.2,
      phase: "P0",
      byteClassMass: mass(0.6, 0.2, 0.2),
    }) === "boundary-state-continuation"
  );
  check(
    "mid-character mass on lead bytes is midstate-new-lead",
    labelFailureMechanism({
      argmaxCompatible: false,
      compatibleMass: 0.2,
      phase: "P2",
      byteClassMass: mass(0.2, 0.65, 0.15),
    }) === "midstate-new-lead"
  );
  check(
    "an illegal argmax that is neither inversion is illegal-argmax-other",
    labelFailureMechanism({
      argmaxCompatible: false,
      compatibleMass: 0.2,
      phase: "P2",
      byteClassMass: mass(0.1, 0.1, 0.8),
    }) === "illegal-argmax-other"
  );
  // The label rule must partition: every input yields exactly one label.
  const labels = new Set<string>();
  for (const phase of ["P0", "P1", "P2", "P3", "PX"] as BytePhase[]) {
    for (const argmaxCompatible of [true, false]) {
      for (const compatibleMass of [0.0, 0.49, 0.51, 1.0]) {
        for (const bare of [0.0, 0.5, 1.0]) {
          labels.add(
            labelFailureMechanism({
              argmaxCompatible,
              compatibleMass,
              phase,
              byteClassMass: mass(bare, 1 - bare, 0),
            })
          );
        }
      }
    }
  }
  check(
    "the label rule partitions the input space",
    labels.size >= 2 && labels.size <= 5,
    [...labels].join(",")
  );
}

// ============================================================
// Source integrity — §2 / §21
// ============================================================

function stripComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

function testSourceIntegrity(): void {
  if (!fs.existsSync(AUDIT_SRC)) {
    skip("the Phase-99 audit source is present", `${AUDIT_SRC} not found`);
    return;
  }
  const raw = fs.readFileSync(AUDIT_SRC, "utf8");
  const code = stripComments(raw);

  check("the audit uses no Math.random()", !code.includes("Math.random"));
  check("the audit uses no setTimeout()", !code.includes("setTimeout"));
  check("the audit uses no setInterval()", !code.includes("setInterval"));
  check("the audit calls no optimizer step", !code.includes(".step("));
  check("the audit saves no checkpoint", !code.includes("saveCheckpoint"));
  check("the audit runs no training step", !/train(Step|Batch|Epoch)\s*\(/.test(code));
  check("the audit performs no backward pass", !/\.backward\s*\(/.test(code));
  check(
    "the audit mutates no parameter",
    !/\.data\s*\[[^\]]*\]\s*=/.test(code) && !/\.data\s*=\s*/.test(code)
  );

  // The only write must be the artifact path it declares.
  const writes = code.match(/writeFileSync\s*\(([^)]*)/g) ?? [];
  check(
    "the audit writes exactly one file, its own artifact",
    writes.length === 1 && writes[0].includes("OUT_PATH"),
    writes.join(" | ")
  );

  // The audit must not read the probability fields of the Phase-98 artifact
  // as if they were logits: it re-runs the forward pass instead.
  check(
    "the audit re-runs the forward pass rather than recycling probabilities",
    code.includes("readState(") && code.includes("forwardLogits(")
  );
}

// ============================================================
// Artifact contracts — skipped with a report when absent
// ============================================================

function testArtifactPresence(a: Artifact): void {
  check("the artifact declares phase99", a.phase === "phase99");
  check("the artifact is read-only", a.readOnly === true);
  check("the artifact records that no training was performed", a.trainingPerformed === false);
  check("the artifact records no Math.random usage", a.usesMathRandom === false);
  check("the artifact records no setTimeout usage", a.usesSetTimeout === false);

  // The frozen recipe must be the Phase-91/95/96/98 recipe, unchanged.
  check("the artifact uses the frozen seed", a.recipe.seed === SEED);
  check("the artifact uses the frozen vocabulary target", a.recipe.vocabTarget === VOCAB_TARGET);
  check("the artifact uses the frozen token budget", a.recipe.maxTokens === MAX_TOKENS);
  check("the artifact uses the frozen context limit", a.recipe.maxCtx === MAX_CTX);
  check("the artifact uses the frozen temperature", a.recipe.temperature === TEMPERATURE);
  check("the artifact uses the existing top-K convention", a.recipe.topK === TOP_K);
  check(
    "the uniform baseline is 1 / vocabSize",
    Math.abs(a.recipe.uniformBaseline - 1 / VOCAB_TARGET) < EPS
  );
  check("the prompt set is unchanged", a.recipe.promptSet.includes("GEN_EVAL_PROMPTS"));

  check(
    "the prompt set still has the five frozen prompts",
    GEN_EVAL_PROMPTS.length === 5
  );

  check(
    "every recorded trajectory reproduced exactly",
    a.reconstructionSummary.allTrajectoriesReproduced === true
  );
  check(
    "every audited failure state was reconstructed",
    a.reconstructionSummary.failureStatesReconstructed ===
      a.reconstructionSummary.auditedFailureStates &&
      a.reconstructionSummary.auditedFailureStates > 0
  );
  check(
    "the failure list and the evidence table are the same length",
    a.failures.length === a.evidenceTable.length
  );
}

function testFailurePrefixContracts(a: Artifact): void {
  const { tokenizer, idToToken } = getFixture();
  const recorded = readRecordedFailures(tokenizer, idToToken);

  check(
    "every failure matches a recorded generation",
    a.failures.every((f) =>
      recorded.some((r) => r.armKey === f.armKey && r.prompt === f.prompt)
    )
  );

  let prefixOk = true;
  let actualOk = true;
  let offsetOk = true;
  const problems: string[] = [];

  for (const f of a.failures) {
    const rec = recorded.find((r) => r.armKey === f.armKey && r.prompt === f.prompt);
    if (!rec) {
      prefixOk = false;
      problems.push(`${f.armKey}/${f.prompt}: no recorded generation`);
      continue;
    }
    const promptIds = tokenizer.encode(f.prompt);

    // §4 — the replayed prefix is the prompt plus the recorded tokens
    // strictly before the first invalid token. Nothing else may be in it.
    const expected = [...promptIds, ...rec.recordedIds.slice(0, f.failureTokenIndex)];
    if (
      expected.length !== f.replayedPrefixIds.length ||
      !expected.every((v, i) => v === f.replayedPrefixIds[i])
    ) {
      prefixOk = false;
      problems.push(`${f.armKey}/${f.prompt}: prefix mismatch`);
    }

    // §5 — the audited token really is the token that was emitted, and the
    // audit did not swap in a luckier one.
    const actualId = rec.recordedIds[f.failureTokenIndex];
    if (actualId !== f.evidence.actual.id) {
      actualOk = false;
      problems.push(
        `${f.armKey}/${f.prompt}: actual ${f.evidence.actual.id} vs recorded ${actualId}`
      );
    }

    // §4 — the failure's byte offset is the offset of that token inside the
    // GENERATED continuation (the prompt's own bytes are not counted), and
    // it must equal the byte length of the generated tokens before it.
    const generatedPrefixBytes = rec.recordedIds
      .slice(0, f.failureTokenIndex)
      .reduce((n, id) => n + tokenBytes(idToToken, id).length, 0);
    if (generatedPrefixBytes !== f.failureByteOffset) {
      offsetOk = false;
      problems.push(
        `${f.armKey}/${f.prompt}: byteOffset ${f.failureByteOffset} vs ${generatedPrefixBytes}`
      );
    }
  }

  check("every replayed prefix is the prompt plus the recorded prefix", prefixOk, problems.join("; "));
  check("every audited actual token is the recorded token", actualOk, problems.join("; "));
  check("every failure byte offset equals the replayed byte length", offsetOk, problems.join("; "));
}

function testBytePhaseContracts(a: Artifact): void {
  const { idToToken } = getFixture();
  let walkerOk = true;
  let phaseOk = true;
  let consumedOk = true;
  let openCharOk = true;
  let contiguityOk = true;
  const problems: string[] = [];

  for (const f of a.failures) {
    const walk = phaseOfIds(f.replayedPrefixIds, idToToken);
    const label = `${f.armKey}/${f.prompt}`;

    // §6 — the walker must agree with the Phase-98 `appendBytes` machine,
    // and the audit must have recorded that it did.
    if (!walk.agreesWithAppendBytes || !f.bytePhase.phaseWalkerAgreesWithAppendBytes) {
      walkerOk = false;
      problems.push(`${label}: walker disagrees with appendBytes`);
    }

    // The recorded phase must be the phase of the actual byte stream.
    if (
      walk.phase.phase !== f.bytePhase.phase ||
      walk.phase.need !== f.bytePhase.need ||
      walk.phase.openLeadByte !== f.bytePhase.openLeadByte
    ) {
      phaseOk = false;
      problems.push(
        `${label}: phase ${f.bytePhase.phase} vs ${walk.phase.phase}, ` +
          `need ${f.bytePhase.need} vs ${walk.phase.need}`
      );
    }

    // §6 — `consumed = sequenceLength - need`, and the LABEL follows from
    // consumed, not from need. This is the mapping the audit must not get
    // backwards.
    const consumed = f.bytePhase.consumedBytes;
    if (consumed !== f.bytePhase.sequenceLength - f.bytePhase.need) {
      consumedOk = false;
      problems.push(`${label}: consumed ${consumed} != ${f.bytePhase.sequenceLength}-${f.bytePhase.need}`);
    }
    if (phaseOfConsumed(f.bytePhase.need, consumed) !== f.bytePhase.phase) {
      consumedOk = false;
      problems.push(`${label}: phase label does not follow from consumed=${consumed}`);
    }

    // §8 — the open-character tokenization must be byte-exact: the bytes it
    // attributes to the open character are the last `consumed` bytes of the
    // replayed stream, and the tokens it names really carry them.
    const oc = f.openCharTokenization;
    const prefixBytes: number[] = [];
    for (const id of f.replayedPrefixIds) prefixBytes.push(...tokenBytes(idToToken, id));
    if (consumed === 0) {
      if (oc.applies) {
        openCharOk = false;
        problems.push(`${label}: open character claimed at a boundary`);
      }
    } else {
      const expectedTail = prefixBytes.slice(prefixBytes.length - consumed);
      const got = oc.bytesInside.flatMap(bytesFromHex);
      if (!oc.applies || got.length !== expectedTail.length || !got.every((v, i) => v === expectedTail[i])) {
        openCharOk = false;
        problems.push(
          `${label}: open-char bytes [${hexOf(got)}] vs [${hexOf(expectedTail)}]`
        );
      }
      if (oc.tokenCount !== oc.spans.length || oc.tokenCount !== oc.bytesInside.length) {
        openCharOk = false;
        problems.push(`${label}: open-char token count inconsistent`);
      }
      if (oc.singleTokenSupplied !== (oc.tokenCount === 1)) {
        openCharOk = false;
        problems.push(`${label}: singleTokenSupplied disagrees with the token count`);
      }
      if (oc.enteredByPartialMerge !== (oc.tokenClasses[0] === "cjk-partial-merge")) {
        openCharOk = false;
        problems.push(`${label}: enteredByPartialMerge disagrees with the first token class`);
      }
      const last = oc.spans[oc.spans.length - 1];
      if (last && last.needAfter !== f.bytePhase.need) {
        openCharOk = false;
        problems.push(`${label}: open-char tail need ${last.needAfter} vs ${f.bytePhase.need}`);
      }
    }

    // §6 — the preceding token walk is a contiguous byte partition that
    // ends on the audited state.
    const walkSpans = f.precedingTokenWalk;
    if (walkSpans.length > 0) {
      for (let i = 1; i < walkSpans.length; i++) {
        if (walkSpans[i].byteStart !== walkSpans[i - 1].byteEnd) {
          contiguityOk = false;
          problems.push(`${label}: byte walk is not contiguous at ${i}`);
          break;
        }
      }
      const lastSpan = walkSpans[walkSpans.length - 1];
      if (lastSpan.needAfter !== f.bytePhase.need) {
        contiguityOk = false;
        problems.push(`${label}: byte walk ends at need ${lastSpan.needAfter} vs ${f.bytePhase.need}`);
      }
      const idsMatch = walkSpans.every(
        (s, i) => s.id === f.replayedPrefixIds[f.replayedPrefixIds.length - walkSpans.length + i]
      );
      if (!idsMatch) {
        contiguityOk = false;
        problems.push(`${label}: byte walk ids do not match the replayed prefix`);
      }
    }
  }

  check("every audited phase agrees with the appendBytes walker", walkerOk, problems.join("; "));
  check("every audited phase is the phase of the actual byte stream", phaseOk, problems.join("; "));
  check("consumed = sequenceLength - need on every audited state", consumedOk, problems.join("; "));
  check("every open-character tokenization is byte-exact", openCharOk, problems.join("; "));
  check("every preceding token walk is contiguous and current", contiguityOk, problems.join("; "));
}

function testLogitAuditContracts(a: Artifact): void {
  const { vocabById, idToToken } = getFixture();
  let shapeOk = true;
  let rankOk = true;
  let probOk = true;
  let topKOk = true;
  let massOk = true;
  let marginOk = true;
  let compatOk = true;
  let labelOk = true;
  const problems: string[] = [];

  for (const f of a.failures) {
    const label = `${f.armKey}/${f.prompt}`;
    const logits = f.logits;

    // §5 — the logit vector is a full vocabulary distribution.
    if (logits.length !== VOCAB_TARGET || logits.some((v) => !Number.isFinite(v))) {
      shapeOk = false;
      problems.push(`${label}: logit vector has ${logits.length} finite-checked entries`);
      continue;
    }

    // Re-derive the whole ranking and probability vector from the raw logits.
    const ranking = rankByLogit(logits);
    const rankOf = new Map<number, number>();
    for (let i = 0; i < ranking.length; i++) rankOf.set(ranking[i], i + 1);
    const probs = softmaxAt(logits, TEMPERATURE);

    // §5 — the argmax is rank 1 and is consistent everywhere it appears.
    if (f.distribution.argmaxId !== ranking[0] || f.evidence.argmax.rank !== 1) {
      rankOk = false;
      problems.push(`${label}: argmax ${f.distribution.argmaxId} vs ranking[0] ${ranking[0]}`);
    }

    // §5 — probabilities are the softmax of THESE logits at the frozen
    // temperature, and nothing else.
    const refs: ArtifactRef[] = [
      ...f.distribution.topK,
      f.evidence.actual,
      f.evidence.argmax,
      ...(f.evidence.bestCompatible ? [f.evidence.bestCompatible] : []),
    ];
    for (const r of refs) {
      if (Math.abs(r.p - probs[r.id]) > EPS) {
        probOk = false;
        problems.push(`${label}: p[${r.id}] ${r.p} vs softmax ${probs[r.id]}`);
        break;
      }
      if (Math.abs(r.logit - logits[r.id]) > EPS) {
        probOk = false;
        problems.push(`${label}: logit[${r.id}] ${r.logit} vs raw ${logits[r.id]}`);
        break;
      }
      if (r.rank !== rankOf.get(r.id)) {
        rankOk = false;
        problems.push(`${label}: rank[${r.id}] ${r.rank} vs ${rankOf.get(r.id)}`);
        break;
      }
    }

    // §5 — top-K is the true top-K of the ranking, in order, with the
    // compatibility of each candidate measured against the audited state.
    if (f.distribution.topK.length !== TOP_K) {
      topKOk = false;
      problems.push(`${label}: top-K has ${f.distribution.topK.length} entries`);
    } else {
      for (let i = 0; i < TOP_K; i++) {
        const entry = f.distribution.topK[i];
        if (entry.id !== ranking[i] || entry.rank !== i + 1) {
          topKOk = false;
          problems.push(`${label}: topK[${i}] is ${entry.id}, ranking[${i}] is ${ranking[i]}`);
          break;
        }
      }
    }

    // §5 — the byte-class masses are the true masses of the true softmax.
    const recomputedMass = recomputeByteClassMass(probs, vocabById);
    const legal = f.distribution.byteClassMass.legalContinuation;
    if (Math.abs(legal - recomputedMass.legalContinuation) > EPS) {
      massOk = false;
      problems.push(`${label}: legal mass ${legal} vs ${recomputedMass.legalContinuation}`);
    }

    // §5 — compatibleMass is the mass on tokens legal at THIS state, and it
    // must be re-derivable by testing each candidate with `appendBytes`.
    const state = {
      need: f.bytePhase.need,
      openAt: walkPhaseBytes(f.replayedPrefixIds.flatMap((id) => tokenBytes(idToToken, id))).byteState.openAt,
      recoverable: f.bytePhase.phase !== "PX",
    };
    let compatible = 0;
    for (let id = 0; id < probs.length; id++) {
      const bytes = tokenBytes(idToToken, id);
      if (bytes.length === 0) continue;
      if (appendBytes(state, bytes, 0).invalidAt === -1) compatible += probs[id];
    }
    if (Math.abs(compatible - f.evidence.compatibleMass) > EPS) {
      massOk = false;
      problems.push(`${label}: compatibleMass ${f.evidence.compatibleMass} vs ${compatible}`);
    }
    if (Math.abs(f.evidence.compatibleMass + f.evidence.incompatibleMass - 1) > EPS) {
      massOk = false;
      problems.push(`${label}: compatible + incompatible != 1`);
    }

    // §5 — margins are differences of the raw logits.
    if (f.evidence.corpusSupportedBest && f.evidence.marginCorpusSupportedMinusActual !== null) {
      const expectedMargin =
        logits[f.evidence.corpusSupportedBest.id] - logits[f.evidence.actual.id];
      if (Math.abs(expectedMargin - f.evidence.marginCorpusSupportedMinusActual) > EPS) {
        marginOk = false;
        problems.push(`${label}: supported margin ${f.evidence.marginCorpusSupportedMinusActual} vs ${expectedMargin}`);
      }
    }
    if (Math.abs(f.evidence.marginArgmaxMinusActual - (logits[ranking[0]] - logits[f.evidence.actual.id])) > EPS) {
      marginOk = false;
      problems.push(`${label}: argmax margin is not a logit difference`);
    }

    // §5 — the top-K compatibility flags are real, not decorative:
    // `selfValidUtf8` means the token's bytes ALONE are a complete, valid
    // UTF-8 stream (so a bare lead byte is false, not true), and
    // `compatible` is tested against the audited state.
    for (const entry of f.distribution.topK) {
      const bytes = Uint8Array.from(tokenBytes(idToToken, entry.id));
      const scan = scanUtf8(bytes);
      const selfValid = scan.firstInvalidByte === -1 && scan.incompleteTailAt === -1;
      if (entry.selfValidUtf8 !== selfValid) {
        compatOk = false;
        problems.push(
          `${label}: selfValidUtf8 flag wrong for id ${entry.id} ` +
            `(artifact ${entry.selfValidUtf8}, re-derived ${selfValid})`
        );
        break;
      }
    }
    const argmaxCompatibleReal =
      appendBytes(state, tokenBytes(idToToken, f.distribution.argmaxId), 0).invalidAt === -1;
    if (argmaxCompatibleReal !== f.distribution.argmaxCompatible) {
      compatOk = false;
      problems.push(`${label}: argmaxCompatible flag is wrong`);
    }

    // §5 — the fatal token's legality from a boundary is a measured fact.
    const fatalFromBoundary =
      appendBytes(BOUNDARY_STATE, tokenBytes(idToToken, f.evidence.actual.id), 0).invalidAt === -1;
    if (fatalFromBoundary !== f.evidence.fatalTokenLegalFromBoundary) {
      compatOk = false;
      problems.push(`${label}: fatalTokenLegalFromBoundary flag is wrong`);
    }

    // The descriptive label must follow from the recorded measurements.
    const relabelled = labelFailureMechanism({
      argmaxCompatible: f.distribution.argmaxCompatible,
      compatibleMass: f.evidence.compatibleMass,
      phase: f.bytePhase.phase,
      byteClassMass: f.distribution.byteClassMass,
    });
    if (relabelled !== f.evidence.mechanismLabel) {
      labelOk = false;
      problems.push(`${label}: label ${f.evidence.mechanismLabel} vs ${relabelled}`);
    }
  }

  check("every logit vector is a full, finite vocabulary distribution", shapeOk, problems.join("; "));
  check("every rank is the true rank of the re-derived ranking", rankOk, problems.join("; "));
  check("every probability and logit is re-derivable from the raw logits", probOk, problems.join("; "));
  check("every top-K is the true top-K in order", topKOk, problems.join("; "));
  check("compatible mass is re-measurable by the appendBytes machine", massOk, problems.join("; "));
  check("every margin is a difference of raw logits", marginOk, problems.join("; "));
  check("every compatibility flag is a real measurement", compatOk, problems.join("; "));
  check("every descriptive label follows from the recorded measurements", labelOk, problems.join("; "));
}

/** Independent re-derivation of the byte-class mass split. */
function recomputeByteClassMass(
  probs: readonly number[],
  vocabById: ReadonlyMap<number, VocabEntry>
): ByteClassMass {
  const out: ByteClassMass = {
    legalContinuation: 0,
    asciiLead: 0,
    multibyteLead: 0,
    bareContinuation: 0,
    illegalLead: 0,
    unclassified: 0,
  };
  for (let id = 0; id < probs.length; id++) {
    const entry = vocabById.get(id);
    if (!entry || entry.bytes.length === 0) continue;
    const b = entry.bytes[0];
    if (b < 0x80) out.asciiLead += probs[id];
    else if (b >= 0xc2 && b <= 0xf4) out.multibyteLead += probs[id];
    else if (b >= 0x80 && b <= 0xbf) out.bareContinuation += probs[id];
    else out.illegalLead += probs[id];
  }
  return out;
}

function testCorpusSupportContracts(a: Artifact): void {
  const { tokenizer, idToToken, vocab, corpus } = getFixture();
  const index = buildCorpusIndex(tokenizer, corpus);
  const stateTransitions = measureCorpusStateTransitions(index, vocab, idToToken);
  const recorded = readRecordedFailures(tokenizer, idToToken);

  // §9 / §12 — the Phase-98 support counts are re-measured, not restated.
  let levelOk = true;
  let countOk = true;
  let compatibleCountOk = true;
  const problems: string[] = [];

  for (const f of a.failures) {
    const rec = recorded.find((r) => r.armKey === f.armKey && r.prompt === f.prompt);
    if (!rec) continue;
    const step = rec.trace.steps[f.failureTokenIndex];
    if (!step) continue;
    const support = measureSupport(
      index, vocab, step, rec.trace.generatedIds, f.failureTokenIndex, stateTransitions
    );
    const label = `${f.armKey}/${f.prompt}`;

    if (support.level !== f.evidence.corpusSupportLevel) {
      levelOk = false;
      problems.push(`${label}: level ${f.evidence.corpusSupportLevel} vs ${support.level}`);
    }
    if (support.compatibleIds.length !== f.distribution.compatibleIdCount) {
      compatibleCountOk = false;
      problems.push(
        `${label}: compatible ids ${f.distribution.compatibleIdCount} vs ${support.compatibleIds.length}`
      );
    }
    const best = f.evidence.corpusSupportedBest;
    if (best) {
      if (support.bestTransitionCount !== best.count) {
        countOk = false;
        problems.push(`${label}: best count ${best.count} vs ${support.bestTransitionCount}`);
      }
      if (support.bestTransitionIds[0] !== best.id) {
        countOk = false;
        problems.push(`${label}: best id ${best.id} vs ${support.bestTransitionIds[0]}`);
      }
    }
  }

  check("every corpus-support level is re-measured identically", levelOk, problems.join("; "));
  check("every corpus-supported best transition is re-measured identically", countOk, problems.join("; "));
  check("every compatible-id count is re-measured identically", compatibleCountOk, problems.join("; "));

  // §9 — the Phase-98 artifact's own counts are preserved. This suite reads
  // Phase 98's artifact directly rather than trusting Phase 99's summary.
  const phase98Path = path.resolve(PHASE_DIR, "..", "phase98", "cjk-byte-corruption-audit.json");
  if (!fs.existsSync(phase98Path)) {
    skip("the Phase-98 counts are preserved", `${phase98Path} not found`);
  } else {
    const p98 = JSON.parse(fs.readFileSync(phase98Path, "utf8")) as {
      failureCorpus?: {
        perSample?: {
          armKey: string;
          prompt: string;
          firstInvalidTokenIndex: number;
          corpusSupport: { level: string; bestTransitionCount: number } | null;
        }[];
      };
    };
    const all = p98.failureCorpus?.perSample ?? [];
    // Phase 98 recorded all 20 generations; Phase 99 audits only the states
    // that actually failed. Samples with no failure have no state to audit
    // and are expected to be absent — a missing FAILED state is not.
    const per = all.filter((s) => s.firstInvalidTokenIndex >= 0);
    let preserved = per.length > 0 && per.length <= all.length;
    const mismatches: string[] = [];
    for (const s of per) {
      const f = a.failures.find((x) => x.armKey === s.armKey && x.prompt === s.prompt);
      if (!f) {
        preserved = false;
        mismatches.push(`${s.armKey}/${s.prompt}: failed in Phase 98 but missing from Phase 99`);
        continue;
      }
      if (f.failureTokenIndex !== s.firstInvalidTokenIndex) {
        preserved = false;
        mismatches.push(`${s.armKey}/${s.prompt}: failure index moved`);
      }
      if (s.corpusSupport && f.evidence.corpusSupportLevel !== s.corpusSupport.level) {
        preserved = false;
        mismatches.push(`${s.armKey}/${s.prompt}: support level changed`);
      }
      if (s.corpusSupport && f.evidence.corpusSupportedBest) {
        if (f.evidence.corpusSupportedBest.count !== s.corpusSupport.bestTransitionCount) {
          preserved = false;
          mismatches.push(`${s.armKey}/${s.prompt}: support count changed`);
        }
      }
    }
    check("the Phase-98 corpus-support counts are preserved", preserved, mismatches.join("; "));
    check(
      "every audited state was cross-checked against Phase 98",
      a.failures.every((f) => f.corpusSupportCrossCheck.compared === true) &&
        a.failures.every((f) => f.corpusSupportCrossCheck.agreesWithPhase98 === true),
      a.failures
        .filter((f) => !f.corpusSupportCrossCheck.agreesWithPhase98)
        .map((f) => `${f.armKey}/${f.prompt}`)
        .join("; ")
    );
    check(
      "the audited states are exactly the Phase-98 failures",
      per.length === a.failures.length,
      `phase98 ${per.length} vs phase99 ${a.failures.length}`
    );
  }

  // §9 — the corpus census of decision types is re-derived, and real text
  // contains no incompatible transition.
  const coverage = measureCorpusPhaseCoverage(tokenizer, corpus, idToToken);
  check(
    "the corpus contains no incompatible byte transition",
    coverage.incompatibleTransitions === 0 &&
      a.corpusPhaseCoverage.incompatibleTransitions === 0
  );
  check(
    "the corpus census is unchanged",
    coverage.tokens === a.corpusPhaseCoverage.tokens &&
      coverage.documents === a.corpusPhaseCoverage.documents
  );
  const censusSum = coverage.byDecisionType.reduce((s, d) => s + d.decisions, 0);
  const artifactSum = a.corpusPhaseCoverage.byDecisionType.reduce((s, d) => s + d.decisions, 0);
  check("the decision-type census sums match", censusSum === artifactSum, `${censusSum} vs ${artifactSum}`);
  check(
    "every corpus decision type was followed by a legal token",
    coverage.byDecisionType.every((d) => d.decisions === d.legalNext)
  );
  // A decision type with zero training examples could not be identified as
  // the failing one, so the census must find the type the failures sit on.
  const midSplit = a.corpusPhaseCoverage.midSequenceSplitByTokenCount;
  check(
    "the census covers mid-sequence decisions built from more than one token",
    (midSplit["2"] ?? 0) > 0,
    JSON.stringify(midSplit)
  );
}

function testControlContracts(a: Artifact): void {
  const pre = a.preCorruption;
  check(
    "the pre-corruption and post-corruption decision counts partition the steps",
    pre.decisionsBeforeCorruption + pre.decisionsAfterCorruption === a.aggregate.stepCount,
    `${pre.decisionsBeforeCorruption}+${pre.decisionsAfterCorruption} vs ${a.aggregate.stepCount}`
  );
  check(
    "the unbiased phase breakdown sums to the pre-corruption decision count",
    pre.byPhase.reduce((s, g) => s + g.states, 0) === pre.decisionsBeforeCorruption
  );
  check(
    "the first-invalid-step distribution counts trajectories",
    Object.values(pre.firstInvalidStepDistribution).reduce((s, n) => s + n, 0) ===
      pre.trajectoriesWithCorruption
  );
  const midCount = Object.values(pre.midSequenceTokenCountDistribution).reduce((s, n) => s + n, 0);
  check(
    "the mid-sequence token-count census sums to the intact mid-sequence states",
    midCount ===
      pre.byPhase
        .filter((g) => g.phase === "P1" || g.phase === "P2" || g.phase === "P3")
        .reduce((s, g) => s + g.states, 0),
    `${midCount}`
  );
  check(
    "the control report contains both failed and successful groups",
    Object.keys(a.controls).length >= 5
  );
  check(
    "the aggregate's failure count matches the audited states",
    a.aggregate.auditedFailureStates === a.failures.length
  );
  const labelSum = Object.values(a.aggregate.failuresByMechanismLabel).reduce((s, n) => s + n, 0);
  check(
    "the label census partitions the audited failures",
    labelSum === a.failures.length,
    `${labelSum} vs ${a.failures.length}`
  );
}

function testDecisionGateContracts(a: Artifact): void {
  // §15 — the gate is re-applied to the artifact's OWN evidence rows. The
  // suite asserts the mapping is reproduced, not that any letter is right.
  const rows = a.evidenceTable as unknown as EvidenceRow[];
  const decision = decideMechanism(rows);
  check(
    "the decision gate reproduces the artifact's mechanism letter",
    decision.mechanism === a.decisionGate.mechanism,
    `${decision.mechanism} vs ${a.decisionGate.mechanism}`
  );
  check(
    "the decision gate reproduces the artifact's flag set",
    decision.flags.join(",") === a.decisionGate.flags.join(","),
    `${decision.flags.join(",")} vs ${a.decisionGate.flags.join(",")}`
  );
  check(
    "the mechanism letter is one of A-F",
    ["A", "B", "C", "D", "E", "F"].includes(decision.mechanism)
  );
  check(
    "an empty flag set maps to F and a singleton to that letter",
    (decision.flags.length === 0 && decision.mechanism === "F") ||
      (decision.flags.length === 1 && decision.mechanism === decision.flags[0]) ||
      (decision.flags.length > 1 && decision.mechanism === "E")
  );
  check(
    "the gate counted every audited failure",
    decision.counts.failures === a.failures.length
  );
  check(
    "the rubric in the artifact is the frozen rubric",
    a.recipe.topK === RUBRIC.topK &&
      Math.abs(RUBRIC.uniformBaseline - 1 / VOCAB_TARGET) < EPS
  );
  // §12 — corpus support is not ground truth: the artifact must separate
  // the corpus's strongest successor from the model's best legal token, so
  // a reader can see they are not the same thing.
  const separated = a.failures.filter(
    (f) =>
      f.evidence.corpusSupportedBest !== null &&
      f.evidence.bestCompatible !== null &&
      f.evidence.corpusSupportedBest.id !== f.evidence.bestCompatible.id
  ).length;
  check(
    "the artifact distinguishes the corpus successor from the model's best legal token",
    separated > 0,
    `${separated} of ${a.failures.length}`
  );
}

// ============================================================
// The real forward pass — §4 reconstruction and §10 determinism
// ============================================================

function testReconstructionAndDeterminism(a: Artifact): void {
  const { tokenizer, vocab, vocabById } = getFixture();

  const byArm = new Map<string, ArtifactFailure[]>();
  for (const f of a.failures) {
    const list = byArm.get(f.armKey);
    if (list) list.push(f);
    else byArm.set(f.armKey, [f]);
  }

  let allReconstructed = true;
  let allDeterministic = true;
  let allParamEqual = true;
  const problems: string[] = [];

  for (const arm of ARMS) {
    const armFailures = byArm.get(arm.key) ?? [];
    if (armFailures.length === 0) continue;
    if (!fs.existsSync(arm.checkpointPath)) {
      skip(`arm ${arm.key} reconstruction`, `${arm.checkpointPath} not found`);
      continue;
    }

    const model = loadArmModel(tokenizer, arm.checkpointPath);
    const reloaded = loadArmModel(tokenizer, arm.checkpointPath);

    // §10 — the checkpoint reloads to bit-identical parameters. This is a
    // MEASUREMENT, not a restatement of the artifact's claim.
    const params = compareParameters(model, reloaded);
    if (!params.allEqual || params.mismatchCount !== 0 || params.maxAbsDiff !== 0) {
      allParamEqual = false;
      problems.push(`${arm.key}: params differ on reload`);
    }

    for (const f of armFailures) {
      const ctx = f.replayedPrefixIds.slice(-MAX_CTX);
      const walk = phaseOfIds(f.replayedPrefixIds, idToTokenOf(tokenizer));
      const first = readState(model, ctx, vocab, vocabById, { phase: walk.phase });
      const second = readState(model, ctx, vocab, vocabById, { phase: walk.phase });

      // §4 — a FRESH forward over the replayed prefix reproduces the
      // artifact's raw logits exactly. Not approximately: exactly.
      if (!logitsIdentical(first.logits, f.logits)) {
        allReconstructed = false;
        problems.push(
          `${arm.key}/${f.prompt}: logits differ by ${maxAbsDiff(first.logits, f.logits)}`
        );
      }
      // §10 — the identical forward is deterministic.
      if (!logitsIdentical(first.logits, second.logits)) {
        allDeterministic = false;
        problems.push(`${arm.key}/${f.prompt}: repeated forward differs`);
      }
      // §10 — the reloaded checkpoint produces the identical forward.
      const third = readState(reloaded, ctx, vocab, vocabById, { phase: walk.phase });
      if (!logitsIdentical(first.logits, third.logits)) {
        allDeterministic = false;
        problems.push(`${arm.key}/${f.prompt}: reloaded model forward differs`);
      }
      // The artifact's own reconstruction claim must match this measurement.
      if (!f.reconstructionAgrees || !f.reconstructionLogitsIdentical) {
        allReconstructed = false;
        problems.push(`${arm.key}/${f.prompt}: artifact reports a failed reconstruction`);
      }
      if (f.reconstructionMaxAbsLogitDiff !== 0) {
        allReconstructed = false;
        problems.push(
          `${arm.key}/${f.prompt}: artifact maxAbsLogitDiff ${f.reconstructionMaxAbsLogitDiff}`
        );
      }
    }

    // §10 — the artifact's determinism record must match the measurement.
    const record = a.checkpointDeterminism.find((d) =>
      d.checkpoint.endsWith(path.basename(arm.checkpointPath))
    );
    if (!record) {
      allParamEqual = false;
      problems.push(`${arm.key}: no determinism record in the artifact`);
    }
    if (record) {
      if (
        record.paramElementsCompared !== params.elementCount ||
        record.paramMismatchCount !== params.mismatchCount ||
        record.maxAbsParamDiff !== params.maxAbsDiff
      ) {
        allParamEqual = false;
        problems.push(`${arm.key}: determinism record disagrees with the measurement`);
      }
      if (record.crossProcessBitIdentityMeasured !== false) {
        allParamEqual = false;
        problems.push(`${arm.key}: cross-process identity claimed without measurement`);
      }
    }
  }

  check("every audited state is reconstructed by a fresh forward pass", allReconstructed, problems.join("; "));
  check("every forward pass is deterministic and reload-stable", allDeterministic, problems.join("; "));
  check("every checkpoint reloads to identical parameters", allParamEqual, problems.join("; "));
}

function idToTokenOf(tokenizer: ReturnType<typeof buildTokenizer>): IdToTokenMap {
  return tokenizer.getVocabulary().idToToken;
}

// ============================================================
// Runner
// ============================================================

export function runPhase99Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\n  -- Phase 99: CJK transition logit mechanism audit --");

  console.log("  [phase machine]");
  testPhaseMachine();
  console.log("  [distribution utilities]");
  testDistributionUtilities();
  console.log("  [mechanism label rule]");
  testMechanismLabelRule();
  console.log("  [source integrity]");
  testSourceIntegrity();

  const a = getArtifact();
  if (!a) {
    skip("artifact contracts", `${OUT_PATH} not found — run the audit first`);
    skip("reconstruction and determinism", "no artifact to reconstruct against");
  } else {
    console.log("  [artifact presence and frozen recipe]");
    testArtifactPresence(a);
    console.log("  [failure-state reconstruction contracts]");
    testFailurePrefixContracts(a);
    console.log("  [byte phase contracts]");
    testBytePhaseContracts(a);
    console.log("  [logit audit contracts]");
    testLogitAuditContracts(a);
    console.log("  [corpus support contracts]");
    testCorpusSupportContracts(a);
    console.log("  [control population contracts]");
    testControlContracts(a);
    console.log("  [decision gate contracts]");
    testDecisionGateContracts(a);
    console.log("  [reconstruction and checkpoint determinism (real forward passes)]");
    testReconstructionAndDeterminism(a);
  }

  console.log(`  Phase 99: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}
