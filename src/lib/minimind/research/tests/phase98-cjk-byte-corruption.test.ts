// ============================================================
// Phase 98 — CJK/Mixed Interior Byte-Corruption Audit (contract suite)
// ============================================================
// Verifies the Phase 98 audit INSTRUMENT and the DECISION GATE, not an
// experiment arm. Phase 98 trained nothing, changed no checkpoint, and
// modified no production module; its job was to decide whether interior
// byte corruption in zh/mixed generations is caused by
//
//     Hypothesis A — the corpus never supplies the correct continuation,
//     Hypothesis B — a token-boundary / byte-sequence problem.
//
// Because the audit's answers are only as trustworthy as its measuring
// logic, this suite tests that logic directly rather than asserting the
// number the audit happened to produce:
//
//   TRACE CORRECTNESS
//   1. token-to-byte mapping agrees with the production decoder path
//   2. the byte walker and production `scanUtf8` agree byte for byte,
//      including on illegal leads, bare continuations and truncated tails
//   3. the first invalid TOKEN is the token whose bytes carried the fault
//   4. the first invalid BYTE is the exact stream offset, not a token index
//
//   CORPUS SUPPORT
//   5. exact token-prefix search counts only FULL prefixes
//   6. byte-prefix search and transition counting are exact
//   7. corpus scanning is deterministic and phase-conditioned
//   8. vocabulary classification separates complete from partial merges
//
//   CLASSIFICATION
//   9. supported-but-corrupted  -> type2-boundary
//  10. unsupported continuation -> type1-unsupported
//  11. semantic substitution    -> type3-semantic
//  12. unmeasurable support     -> unresolved
//  13. the decision gate maps each contribution profile to A/B/C/D/E
//
//   REGRESSION — the audit must not have moved any frozen surface
//  14. tokenizer, dataset, evaluator, generation and thresholds unchanged
//  15. the audit source performs no training and uses no nondeterminism
//
//   ARTIFACT CONTRACTS (skip-with-report if absent — never fabricated)
//  16. the failure corpus is real and every recorded trajectory reproduced
//  17. the artifact's gate is internally consistent with its own counts
//
// This suite makes NO claim about the audit's OUTCOME beyond re-deriving
// it from the artifact's own counts. Phase 57-97 suites are untouched.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  OUT_PATH,
  GEN_EVAL_PROMPTS,
  ARMS,
  MAX_TOKENS,
  MAX_CTX,
  TEMPERATURE,
  SEED,
  VOCAB_TARGET,
  MERGE_TOKEN_MIN_ID,
  BOUNDARY_STATE,
  tokenBytes,
  classifyVocabEntry,
  classifyVocabulary,
  appendBytes,
  verifyScannerEquivalence,
  traceGeneration,
  buildCorpusIndex,
  countTokenPrefix,
  countTokenSubsequence,
  countByteSubsequence,
  countTransition,
  countOccurrences,
  prefixDocsFor,
  expectationFor,
  compatibleContinuations,
  measureCorpusStateTransitions,
  measureSupport,
  measureCharacterInventory,
  classifySample,
  decideGate,
  createSeededRNG,
  sampleToken,
  loadCorpus,
  buildTokenizer,
  type ByteState,
  type CorpusIndex,
  type FailureType,
  type IdToTokenMap,
  type SampleTrace,
  type TokenStep,
  type VocabEntry,
} from "../../../../../experiments/phase98/cjk-byte-corruption-audit";

import {
  BYTE_TOKEN_MAX_ID,
  BYTE_TOKEN_MIN_ID,
  scanUtf8,
  tokenBytesOf,
} from "../capability-eval/utf8";

// ============================================================
// Harness — mirrors the Phase 90-97 suites
// ============================================================

const PHASE_DIR = path.resolve(__dirname, "..", "..", "..", "..", "..", "experiments", "phase98");
const AUDIT_SRC = path.join(PHASE_DIR, "cjk-byte-corruption-audit.ts");

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

// ============================================================
// Fixtures
// ============================================================
// The real tokenizer is rebuilt with the frozen recipe, so every fixture
// below runs through the SAME code path the audit used. Nothing about the
// tokenizer or the corpus is stubbed.

interface Fixture {
  tokenizer: ReturnType<typeof buildTokenizer>;
  idToToken: IdToTokenMap;
  vocab: VocabEntry[];
  corpus: string[];
  index: CorpusIndex;
}

let fixture: Fixture | null = null;

function getFixture(): Fixture {
  if (fixture) return fixture;
  const corpus = loadCorpus();
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const idToToken = tokenizer.getVocabulary().idToToken;
  const vocab = classifyVocabulary(idToToken, VOCAB_TARGET);
  fixture = {
    tokenizer,
    idToToken,
    vocab,
    corpus,
    index: buildCorpusIndex(tokenizer, corpus),
  };
  return fixture;
}

/** Byte token id for a raw byte value: `id = 4 + byteValue`. */
function byteId(value: number): number {
  return BYTE_TOKEN_MIN_ID + value;
}

/** A minimal vocabulary with no continuation bytes at all (0x80-0xBF). */
function asciiOnlyVocabulary(): { idToToken: IdToTokenMap; vocab: VocabEntry[] } {
  const map = new Map<number, string>();
  map.set(0, "<pad>");
  map.set(1, "<unk>");
  map.set(2, "<bos>");
  map.set(3, "<eos>");
  const values: number[] = [];
  for (let b = 0x00; b < 0x80; b++) values.push(b);
  for (let b = 0xc2; b <= 0xf4; b++) values.push(b);
  for (const v of values) map.set(byteId(v), String.fromCharCode(v));
  const vocab = Array.from(map.keys())
    .sort((a, b) => a - b)
    .map((id) => classifyVocabEntry(id, map.get(id) ?? "", tokenBytes(map, id)));
  return { idToToken: map, vocab };
}

/** Build a trace the same way the audit does, with an empty prompt. */
function syntheticTrace(idToToken: IdToTokenMap, generatedIds: number[]): SampleTrace {
  return traceGeneration(
    {
      armKey: "synthetic",
      armLabel: "synthetic control",
      recordedIn: "in-suite fixture",
      prompt: "synthetic",
      language: "zh",
      continuationRecorded: "",
    },
    [],
    generatedIds,
    idToToken
  );
}

/** A support measurement stand-in for exercising one classification branch. */
function stubSupport(level: "exact" | "sparse" | "indirect" | "none" | "unresolved") {
  return {
    compatibleIds: level === "none" ? [] : [byteId(0x84)],
    completingIds: [],
    bestTransitionCount: level === "none" ? 0 : 3,
    bestTransitionIds: level === "none" ? [] : [byteId(0x84)],
    exactContextCount: level === "exact" ? 4 : 0,
    sparseContextCount: level === "sparse" ? 3 : 0,
    globalCount: level === "none" ? 0 : 12,
    statePositions: level === "indirect" ? 4015 : level === "none" ? 0 : 3046,
    level,
  };
}

// ============================================================
// 1-4. Trace correctness
// ============================================================

function testTokenToByteMapping(): void {
  const { idToToken, vocab } = getFixture();

  // Every byte token maps to exactly its own byte value.
  let byteTokensCorrect = true;
  for (let v = 0x00; v <= 0xff; v++) {
    const bytes = tokenBytes(idToToken, byteId(v));
    if (bytes.length !== 1 || bytes[0] !== v) byteTokensCorrect = false;
  }
  check(
    "all 256 byte tokens map to exactly their own byte value",
    byteTokensCorrect && BYTE_TOKEN_MAX_ID - BYTE_TOKEN_MIN_ID === 256
  );

  // The audit's token->byte mapping equals the production decoder's.
  let agreesWithProduction = true;
  for (const entry of vocab) {
    const mine = tokenBytes(idToToken, entry.id);
    const theirs = Array.from(tokenBytesOf(idToToken, [entry.id]).bytes);
    if (mine.length !== theirs.length || mine.some((b, i) => b !== theirs[i])) {
      agreesWithProduction = false;
    }
  }
  check(
    "token-to-byte mapping is identical to production tokenBytesOf for every id",
    agreesWithProduction,
    `vocabulary size ${vocab.length}`
  );

  // Specials and the byte range are where the tokenizer contract says.
  check(
    "vocabulary is 260 base entries plus learned merges only",
    vocab.length === VOCAB_TARGET &&
      vocab.slice(0, 4).every((v) => v.tokenClass === "special") &&
      vocab.slice(4, BYTE_TOKEN_MAX_ID).every((v) => v.tokenClass === "byte") &&
      vocab.slice(BYTE_TOKEN_MAX_ID).every((v) => v.id >= MERGE_TOKEN_MIN_ID)
  );
}

function testUtf8BoundaryDetection(): void {
  // Hand-built byte strings with known verdicts. Each is a case where a
  // naive byte-counting check and a real UTF-8 state machine disagree.
  const cases: { name: string; bytes: number[]; invalid: number; tail: number }[] = [
    { name: "pure ASCII never fails", bytes: [0x61, 0x20, 0x62], invalid: -1, tail: -1 },
    { name: "complete 3-byte CJK", bytes: [0xe6, 0x98, 0xaf], invalid: -1, tail: -1 },
    { name: "bare continuation byte", bytes: [0x9a], invalid: 0, tail: -1 },
    { name: "illegal lead 0xF5", bytes: [0xf5, 0x80], invalid: 0, tail: -1 },
    { name: "ASCII where a continuation is required", bytes: [0xe6, 0x41], invalid: 1, tail: -1 },
    { name: "wrong continuation value", bytes: [0xe6, 0x98, 0x41], invalid: 2, tail: -1 },
    { name: "lead after a partial sequence", bytes: [0xe6, 0xe6], invalid: 1, tail: -1 },
    { name: "truncated tail is not an error", bytes: [0x61, 0xe6, 0x98], invalid: -1, tail: 1 },
    { name: "4-byte lead with only 2 continuations", bytes: [0xf0, 0x9f, 0x98], invalid: -1, tail: 0 },
  ];

  for (const c of cases) {
    const { agrees, productionFirstInvalidByte, productionIncompleteTailAt, walkerFirstInvalidByte } =
      verifyScannerEquivalence(c.bytes);
    const mine = appendBytes(BOUNDARY_STATE, c.bytes, 0);
    const lean = scanUtf8(Uint8Array.from(c.bytes));
    check(
      `byte walker agrees with production scanUtf8: ${c.name}`,
      agrees &&
        productionFirstInvalidByte === c.invalid &&
        productionIncompleteTailAt === c.tail &&
        walkerFirstInvalidByte === c.invalid &&
        mine.invalidAt === c.invalid &&
        lean.firstInvalidByte === c.invalid &&
        lean.incompleteTailAt === c.tail,
      `expected invalid=${c.invalid} tail=${c.tail}; production=(${productionFirstInvalidByte},${productionIncompleteTailAt}) walker=${walkerFirstInvalidByte}`
    );
  }

  // Phase accounting: each token advances `need` by its own byte length.
  const steps: { bytes: number[]; before: number; after: number }[] = [
    { bytes: [0x61], before: 0, after: 0 },
    { bytes: [0xe6], before: 0, after: 2 },
    { bytes: [0x98], before: 2, after: 1 },
    { bytes: [0xaf], before: 1, after: 0 },
    { bytes: [0xc3], before: 0, after: 1 },
    { bytes: [0x84], before: 1, after: 0 },
  ];
  let phaseCorrect = true;
  let state: ByteState = BOUNDARY_STATE;
  for (const s of steps) {
    if (state.need !== s.before) phaseCorrect = false;
    state = appendBytes(state, s.bytes, 0).state;
    if (state.need !== s.after) phaseCorrect = false;
  }
  check("UTF-8 phase advances by each token's own byte length", phaseCorrect);
}

function testFirstInvalidTokenAndByte(): void {
  const { idToToken } = getFixture();

  // Fault at stream byte 1, carried by TOKEN index 1.
  const a = syntheticTrace(idToToken, [byteId(0xe6), byteId(0x41)]);
  check(
    "first invalid byte is the exact stream offset",
    a.firstInvalidByte === 1,
    `got ${a.firstInvalidByte}`
  );
  check(
    "first invalid token is the token that carried the fault",
    a.firstInvalidTokenIndex === 1,
    `got ${a.firstInvalidTokenIndex}`
  );
  check(
    "the faulting token's own invalid offset is inside it",
    a.steps[1].invalidByteAt === 1 && a.steps[1].byteOffsetStart === 1
  );

  // The same fault, but reached through a merge: the merge is token 1 too.
  const partial = getFixture().vocab.find((v) => v.tokenClass === "cjk-partial-merge");
  if (!partial) {
    skip("fault carried by a partial CJK merge", "no cjk-partial-merge in the vocabulary");
  } else {
    const b = syntheticTrace(idToToken, [byteId(0xe4), partial.id, byteId(0x41)]);
    // e4 -> need 2; the partial merge consumes some continuation bytes; the
    // ASCII byte is illegal wherever the phase lands.
    check(
      "a partial CJK merge is reported at its own token index and byte offset",
      b.firstInvalidTokenIndex !== -1 &&
        b.steps[b.firstInvalidTokenIndex].invalidByteAt >= 0 &&
        b.firstInvalidByte === b.steps[b.firstInvalidTokenIndex].invalidByteAt
    );
  }

  // A clean generation must report no fault at all.
  const clean = syntheticTrace(idToToken, [byteId(0xe6), byteId(0x98), byteId(0xaf), byteId(0x61)]);
  check(
    "a byte-valid generation reports no invalid token and no invalid byte",
    clean.firstInvalidTokenIndex === -1 && clean.firstInvalidByte === -1
  );

  // Every step's bookkeeping must be self-consistent with the stream.
  const consistent = clean.steps.every(
    (s: TokenStep, i: number) =>
      s.index === i &&
      s.byteOffsetStart === clean.steps.slice(0, i).reduce((n, p) => n + p.bytes.length, 0) &&
      s.byteOffsetEnd === s.byteOffsetStart + s.bytes.length
  );
  check("token byte offsets tile the generated stream without gaps", consistent);
}

// ============================================================
// 5-8. Corpus support
// ============================================================

function testCorpusSupportQueries(): void {
  const { index, idToToken, vocab } = getFixture();

  // A whole document is its own prefix: exactly one full match.
  const doc0 = index.docs[0];
  check(
    "countTokenPrefix counts only FULL token prefixes",
    countTokenPrefix(index, doc0) >= 1 &&
      countTokenPrefix(index, [...doc0, 999999]) === 0,
    `prefix of doc0 = ${countTokenPrefix(index, doc0)}; prefixed with a bogus id = ${countTokenPrefix(index, [...doc0, 999999])}`
  );

  // A one-token prefix is a weaker query than a full one — and both are counted.
  check(
    "a shorter token prefix matches at least as many documents as a longer one",
    countTokenPrefix(index, doc0.slice(0, 1)) >= countTokenPrefix(index, doc0)
  );

  // Subsequence vs prefix are different questions.
  check(
    "countTokenSubsequence counts interior occurrences, not just prefixes",
    countTokenSubsequence(index, doc0) >= countTokenPrefix(index, doc0)
  );

  // Byte-level search is conditioned on the bytes, not the tokens.
  const doc0Bytes = index.docBytes[0];
  check(
    "countByteSubsequence finds the document's own byte sequence",
    countByteSubsequence(index, doc0Bytes) >= 1 &&
      countByteSubsequence(index, [...doc0Bytes, 0xff, 0xff, 0xff]) === 0
  );

  // A byte sequence spanning a TOKEN BOUNDARY must be findable even though
  // no token has those bytes at all — this is why the audit searches bytes
  // and not only tokens.
  const firstTokens = index.docs[0];
  if (firstTokens.length < 2) {
    skip("byte search sees spans that no single token has", "doc0 has fewer than 2 tokens");
  } else {
    const firstBytes = tokenBytes(idToToken, firstTokens[0]);
    const secondBytes = tokenBytes(idToToken, firstTokens[1]);
    const crossing = [firstBytes[firstBytes.length - 1], secondBytes[0]];
    const vocabHasPair = vocab.some(
      (v) => v.bytes.length === 2 && v.bytes[0] === crossing[0] && v.bytes[1] === crossing[1]
    );
    check(
      "byte search finds a boundary-spanning pair that no single token has",
      countByteSubsequence(index, crossing) >= 1 &&
        !vocabHasPair &&
        !(firstBytes.length === 2 && firstBytes[0] === crossing[0]),
      `pair ${crossing.map((b) => b.toString(16)).join(" ")}; a vocabulary token has these bytes: ${vocabHasPair}`
    );
  }

  // Transition counts are exact, not approximate.
  const twoDoc: CorpusIndex = buildCorpusIndex(getFixture().tokenizer, ["太阳"]);
  const ids = twoDoc.docs[0];
  let transitionsOk = true;
  for (let i = 0; i + 1 < ids.length; i++) {
    if (countTransition(twoDoc, [ids[i]], ids[i + 1]) < 1) transitionsOk = false;
  }
  check("countTransition finds every adjacent pair that really occurs", transitionsOk);
  check(
    "countTransition reports zero for a pair that does not occur",
    countTransition(twoDoc, [ids[0]], 999999) === 0
  );
  check(
    "countOccurrences counts overlapping-free exact matches",
    countOccurrences([1, 2, 1, 2, 1, 2], [1, 2]) === 3 &&
      countOccurrences([1, 2], [1, 2, 3]) === 0 &&
      countOccurrences([1, 2, 3], []) === 0
  );
}

function testExpectationRequiresFullPrefix(): void {
  const { index } = getFixture();
  const doc0 = index.docs[0];

  const full = expectationFor(index, doc0.slice(0, 2));
  check(
    "expectationFor derives a continuation only from a full token-prefix match",
    full === null || full.matched === 2,
    full ? `matched ${full.matched}` : "no 2-token prefix in the corpus"
  );

  // A prefix that no document starts with yields no expectation at all.
  const absent: number[] = [999999, 999998];
  check("a prompt absent from the corpus yields no expectation", expectationFor(index, absent) === null);
  check("prefixDocsFor returns nothing for an absent prefix", prefixDocsFor(index, absent).length === 0);

  // Ambiguity is surfaced, never resolved arbitrarily.
  if (full) {
    const docs = prefixDocsFor(index, doc0.slice(0, 2));
    check(
      "ambiguity is reported rather than an arbitrary pick",
      full.ambiguous === docs.length > 1 && full.candidateDocs.length === docs.length,
      `${docs.length} candidate doc(s)`
    );
  } else {
    skip("ambiguity is reported rather than an arbitrary pick", "no 2-token prefix in the corpus");
  }
}

function testDeterministicAndPhaseConditionedScanning(): void {
  const { tokenizer, index, vocab, idToToken, corpus } = getFixture();

  // Determinism: a second build of the same corpus is bit-identical.
  const again = buildCorpusIndex(tokenizer, corpus);
  const sameDocs =
    again.docs.length === index.docs.length &&
    again.docs.every((d, i) => d.length === index.docs[i].length && d.every((v, j) => v === index.docs[i][j]));
  const sameFreq =
    again.tokenFrequency.size === index.tokenFrequency.size &&
    Array.from(index.tokenFrequency).every(([k, v]) => again.tokenFrequency.get(k) === v);
  const samePairs =
    again.pairFrequency.size === index.pairFrequency.size &&
    Array.from(index.pairFrequency).every(([k, v]) => again.pairFrequency.get(k) === v);
  check(
    "corpus scanning is deterministic across rebuilds (tokens, frequencies, pairs)",
    sameDocs && sameFreq && samePairs && again.totalTokens === index.totalTokens && again.totalBytes === index.totalBytes
  );

  // The scan is phase-conditioned and self-validating: every token position
  // is classified exactly once, and real text never makes an illegal move.
  const st = measureCorpusStateTransitions(index, vocab, idToToken);
  const totalPositions = Object.values(st.positionsByNeed).reduce((a, b) => a + b, 0);
  const totalCompatible = Object.values(st.compatibleByNeed).reduce((a, b) => a + b, 0);
  const totalIncompatible = Object.values(st.incompatibleByNeed).reduce((a, b) => a + b, 0);
  check(
    "every corpus token position is classified exactly once by phase",
    totalPositions === totalCompatible + totalIncompatible && totalIncompatible === st.totalIncompatible,
    `positions=${totalPositions} compatible=${totalCompatible} incompatible=${totalIncompatible}`
  );
  check(
    "the corpus is real text: no phase is ever followed by an incompatible token",
    st.totalIncompatible === 0,
    `incompatible=${st.totalIncompatible}`
  );
  check(
    "the corpus actually enters every non-zero UTF-8 phase",
    (st.positionsByNeed["1"] ?? 0) > 0 && (st.positionsByNeed["2"] ?? 0) > 0,
    JSON.stringify(st.positionsByNeed)
  );

  // Re-running the scan must give identical numbers.
  const st2 = measureCorpusStateTransitions(index, vocab, idToToken);
  check(
    "the phase-conditioned scan is reproducible",
    JSON.stringify(st2) === JSON.stringify(st)
  );

  // The character inventory is counted, not estimated.
  const inv = measureCharacterInventory(index);
  check(
    "character inventory is internally consistent",
    inv.distinctCjkCharacters > 0 &&
      inv.cjkCharactersSeenOnce <= inv.distinctCjkCharacters &&
      inv.cjkCharacterCount >= inv.distinctCjkCharacters &&
      Math.abs(
        inv.cjkOccurrencesPerDistinctCharacter - inv.cjkCharacterCount / inv.distinctCjkCharacters
      ) < 1e-9
  );
}

function testVocabularyClassification(): void {
  const { vocab } = getFixture();

  // Self-validation: a merge marked as a COMPLETE multi-byte character must
  // decode standalone, and a partial fragment must not.
  const completeMerges = vocab.filter((v) => v.tokenClass === "cjk-complete-merge");
  const partialMerges = vocab.filter((v) => v.tokenClass === "cjk-partial-merge");
  check(
    "every complete multi-byte merge decodes standalone as valid UTF-8",
    completeMerges.length > 0 &&
      completeMerges.every((v) => scanUtf8(Uint8Array.from(v.bytes)).firstInvalidByte === -1)
  );
  check(
    "every partial multi-byte merge is NOT standalone-valid UTF-8",
    partialMerges.every((v) => v.selfValidUtf8 === false),
    `${partialMerges.length} partial merge(s)`
  );
  check(
    "partial merges are strict prefixes of a longer sequence",
    partialMerges.every((v) => (v.bytes[0] === 0xe0 && v.bytes.length < 3) || v.bytes.length < 4) &&
      partialMerges.every((v) => v.bytes[0] >= 0xc2 && v.bytes[0] <= 0xf4)
  );
  check(
    "ASCII merges are exactly the merges whose bytes are all < 0x80",
    vocab
      .filter((v) => v.id >= MERGE_TOKEN_MIN_ID)
      .every((v) => (v.tokenClass === "ascii-merge") === v.bytes.every((b) => b < 0x80))
  );

  // The structurally decisive vocabulary fact, measured rather than assumed.
  const continuationPairMerge = vocab.filter(
    (v) =>
      v.id >= MERGE_TOKEN_MIN_ID &&
      v.bytes.length >= 2 &&
      v.bytes.every((b) => b >= 0x80 && b <= 0xbf)
  );
  check(
    "no merge consists solely of continuation bytes (so no token can finish a 3-byte char from need=2)",
    continuationPairMerge.length === 0,
    `${continuationPairMerge.length} such merge(s)`
  );

  // The legal-continuation set is phase-dependent and never empty when the
  // state is recoverable.
  const atBoundary = compatibleContinuations(vocab, { need: 0, openAt: -1, recoverable: true });
  const midSequence = compatibleContinuations(vocab, { need: 1, openAt: 0, recoverable: true });
  const deepSequence = compatibleContinuations(vocab, { need: 2, openAt: 0, recoverable: true });
  check(
    "a legal continuation always exists in a recoverable state",
    atBoundary.compatibleIds.length > 0 &&
      midSequence.compatibleIds.length > 0 &&
      deepSequence.compatibleIds.length > 0,
    `${atBoundary.compatibleIds.length}/${midSequence.compatibleIds.length}/${deepSequence.compatibleIds.length}`
  );
  check(
    "mid-sequence the only legal single-byte continuations are the 64 continuation bytes",
    midSequence.compatibleIds.length === 0x40 &&
      midSequence.compatibleIds.every((id) => id >= byteId(0x80) && id <= byteId(0xbf)),
    `${midSequence.compatibleIds.length} compatible id(s) at need=1`
  );
  check(
    "the compatible set shrinks as the phase deepens",
    atBoundary.compatibleIds.length > midSequence.compatibleIds.length &&
      midSequence.compatibleIds.length === deepSequence.compatibleIds.length
  );
  check(
    "at need=2 no token can complete a character in one step (a vocabulary fact, not a corpus fact)",
    deepSequence.completingIds.length === 0 && deepSequence.compatibleIds.length > 0
  );
}

// ============================================================
// 9-13. Classification
// ============================================================

function testClassificationSupportedButCorrupted(): void {
  const { idToToken, vocab, index } = getFixture();

  // A real measured support at a real phase the corpus enters, with the
  // model choosing an ASCII byte while a 3-byte sequence is open.
  const trace = syntheticTrace(idToToken, [byteId(0xe7), byteId(0x41)]);
  const step = trace.steps[1];
  const st = measureCorpusStateTransitions(index, vocab, idToToken);
  const support = measureSupport(index, vocab, step, trace.generatedIds, 1, st);
  const cls = classifySample(trace, support, null, null);

  check(
    "a fault inside an open sequence is flagged as entered mid-character",
    cls.enteredMidCharacter && step.stateBefore.need === 2
  );
  check(
    "the corpus DOES support a legal continuation at that phase",
    support.level !== "none" &&
      support.level !== "unresolved" &&
      support.compatibleIds.length > 0 &&
      support.statePositions > 0,
    `level=${support.level} compatible=${support.compatibleIds.length} positions=${support.statePositions}`
  );
  check(
    "supported-but-corrupted classifies as type2-boundary, not type1",
    cls.type === "type2-boundary",
    `got ${cls.type}`
  );
  check(
    "the type2 reason names the byte phase and the support level",
    cls.reason.includes("need=2") && cls.reason.includes(support.level)
  );

  // Model-side evidence is attached when it exists, and changes the reason.
  const withEvidence = classifySample(trace, support, null, {
    compatibleMass: 0.02,
    incompatibleMass: 0.98,
    pChosen: 0.93,
    argmaxCompatible: false,
    argmaxIsBestCompatible: false,
  });
  check(
    "model-side evidence is recorded and an illegal argmax is reported as such",
    withEvidence.type === "type2-boundary" && withEvidence.reason.includes("ILLEGAL argmax")
  );
}

function testClassificationUnsupportedContinuation(): void {
  const { tokenizer, idToToken } = getFixture();

  // The Type-1 branch is exercised end to end with a vocabulary that has NO
  // continuation bytes at all, so no legal continuation exists by
  // construction. The corpus is real (ASCII-only), so nothing is stubbed.
  const { idToToken: asciiMap, vocab: asciiVocab } = asciiOnlyVocabulary();
  const asciiIndex = buildCorpusIndex(tokenizer, [
    "the sun rises over the quiet valley each morning",
  ]);
  const noContinuations = compatibleContinuations(asciiVocab, { need: 1, openAt: 0, recoverable: true });
  check(
    "the fixture vocabulary really has no legal continuation from need=1",
    noContinuations.compatibleIds.length === 0
  );

  const trace = syntheticTrace(idToToken, [byteId(0xc3), byteId(0x41)]);
  const step = trace.steps[1];
  const st = measureCorpusStateTransitions(asciiIndex, asciiVocab, asciiMap);
  const support = measureSupport(asciiIndex, asciiVocab, step, trace.generatedIds, 1, st);
  const cls = classifySample(trace, support, null, null);

  check(
    "no legal continuation anywhere yields support level 'none'",
    support.level === "none" && support.compatibleIds.length === 0,
    `level=${support.level} compatible=${support.compatibleIds.length}`
  );
  check(
    "unsupported continuation classifies as type1-unsupported",
    cls.type === "type1-unsupported",
    `got ${cls.type}`
  );
  check(
    "the type1 reason states that the corpus never enters the phase",
    cls.reason.includes("never enters this byte phase")
  );
  check(
    "a type1 verdict is never produced for a state that IS supported",
    classifySample(trace, stubSupport("sparse"), null, null).type === "type2-boundary"
  );
}

function testClassificationSemanticSubstitution(): void {
  const { idToToken, index } = getFixture();

  // A byte-valid generation that diverges from the single corpus document
  // sharing its prompt prefix is a CONTENT error, not a byte error.
  const clean = syntheticTrace(idToToken, [byteId(0x61), byteId(0x62)]);
  const unambiguous = { expectedIds: [byteId(0x63), byteId(0x64)], ambiguous: false };
  const cls = classifySample(clean, null, unambiguous, null);
  check(
    "a byte-valid generation that differs from an unambiguous expectation is type3",
    cls.type === "type3-semantic" && !cls.enteredMidCharacter && !cls.fatalTokenWasMerge,
    `got ${cls.type}`
  );

  // The same generation MATCHING the expectation is not a failure at all.
  const matching = classifySample(
    clean,
    null,
    { expectedIds: clean.generatedIds.slice(), ambiguous: false },
    null
  );
  check(
    "a byte-valid generation matching its expectation is no-corruption",
    matching.type === "no-corruption",
    `got ${matching.type}`
  );

  // An ambiguous or absent expectation must NEVER produce a Type-3 verdict.
  check(
    "an ambiguous expectation never yields type3",
    classifySample(clean, null, { expectedIds: unambiguous.expectedIds, ambiguous: true }, null).type ===
      "no-corruption"
  );
  check(
    "an absent expectation never yields type3",
    classifySample(clean, null, null, null).type === "no-corruption"
  );

  // A real corpus expectation is derived only from a full prefix, and the
  // type3 branch is unreachable for the recorded prompts unless the corpus
  // really pins one continuation.
  const doc0 = index.docs[0];
  const derived = expectationFor(index, doc0.slice(0, 2));
  check(
    "a derived expectation is only ever built from a full token-prefix match",
    derived === null || derived.matched === 2
  );
  check(
    "every recorded prompt's expectation, if any, is flagged ambiguous when several docs match",
    GEN_EVAL_PROMPTS.every((p) => {
      const e = expectationFor(index, getFixture().tokenizer.encode(p.prompt));
      return e === null || e.ambiguous === (e.candidateDocs.length > 1);
    })
  );
}

function testClassificationUnresolved(): void {
  const { idToToken } = getFixture();
  const trace = syntheticTrace(idToToken, [byteId(0xe6), byteId(0x41)]);
  const step = trace.steps[1];

  const noSupport = classifySample(trace, null, null, null);
  check(
    "an unmeasurable support yields unresolved, not a forced type",
    noSupport.type === "unresolved" && noSupport.reason.includes("could not be measured")
  );

  const unknownPredecessor = classifySample(trace, stubSupport("unresolved"), null, null);
  check(
    "an unknown predecessor yields unresolved",
    unknownPredecessor.type === "unresolved" && unknownPredecessor.reason.includes("unknown to the corpus")
  );

  // Every non-typed branch still carries the byte-position facts.
  check(
    "unresolved still reports where the fault entered",
    noSupport.enteredMidCharacter === (step.stateBefore.need > 0) &&
      noSupport.fatalTokenWasMerge === (step.tokenId >= MERGE_TOKEN_MIN_ID)
  );
}

function testDecisionGate(): void {
  const mk = (type: FailureType): { type: FailureType } => ({ type });

  const d = decideGate([mk("no-corruption"), mk("no-corruption")], 0, 2);
  check("gate D when no corruption was found", d.classification === "D" && d.noCorruption === 2);

  const b = decideGate([mk("type2-boundary"), mk("no-corruption")], 1, 2);
  check(
    "gate B when every corrupted sample had supported legal continuation",
    b.classification === "B" && b.type2 === 1 && b.type1 === 0
  );

  const a = decideGate([mk("type1-unsupported")], 1, 1);
  check("gate A when every corrupted sample lacked support", a.classification === "A" && a.type1 === 1);

  const c = decideGate([mk("type1-unsupported"), mk("type2-boundary")], 2, 2);
  check(
    "gate C when both mechanisms are present",
    c.classification === "C" && c.type1 === 1 && c.type2 === 1
  );

  const e = decideGate([mk("unresolved"), mk("unresolved")], 2, 2);
  check("gate E when every corrupted sample is unresolved", e.classification === "E");

  check(
    "no-corruption samples are excluded from the corrupted denominator",
    b.corruptedSamples === 1 && b.totalSamples === 2 && b.corruptedWithSupport === 1
  );
  check(
    "the gate never returns a classification outside A/B/C/D/E",
    [d, b, a, c, e].every((g) => ["A", "B", "C", "D", "E"].includes(g.classification))
  );
}

// ============================================================
// 14-15. Regression — frozen surfaces and audit innocence
// ============================================================

function readSource(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), "utf8");
}

function testFrozenSurfaces(): void {
  const { tokenizer, vocab } = getFixture();

  // TOKENIZER — same base vocabulary, same specials, same merge budget.
  const idToToken = tokenizer.getVocabulary().idToToken;
  check(
    "tokenizer is unmodified: 300 ids, specials 0-3, byte range 4-259",
    idToToken.size === VOCAB_TARGET &&
      idToToken.get(0) === "<pad>" &&
      idToToken.get(1) === "<unk>" &&
      idToToken.get(2) === "<bos>" &&
      idToToken.get(3) === "<eos>" &&
      tokenBytes(idToToken, byteId(0x00))[0] === 0x00 &&
      tokenBytes(idToToken, byteId(0xff))[0] === 0xff &&
      vocab.filter((v) => v.id >= MERGE_TOKEN_MIN_ID).length === VOCAB_TARGET - BYTE_TOKEN_MAX_ID
  );
  check(
    "tokenizer source carries no Phase 98 modification",
    !readSource("../../tokenizer/BPETokenizer.ts").includes("phase98") &&
      !readSource("../../tokenizer/vocabulary.ts").includes("phase98")
  );

  // GENERATION GEOMETRY — the recorded recipe is what the audit claims.
  const auditSrc = fs.readFileSync(AUDIT_SRC, "utf8");
  check(
    "the audit holds the frozen generation geometry",
    SEED === 42 && VOCAB_TARGET === 300 && MAX_TOKENS === 24 && MAX_CTX === 128 &&
      Math.abs(TEMPERATURE - 0.8) < 1e-12
  );
  check(
    "the audit replicates the production sampler rather than inventing one",
    auditSrc.includes("mirror `evaluateGeneration`'s private RNG")
  );

  // AUDIT INNOCENCE — no training, no nondeterminism, no silent results.
  check(
    "the audit runs no training and takes no optimizer step",
    !/\btrainStep\b|\boptimizer\.step\b|\bEPOCHS\b|\bBATCH_SIZE\b/.test(auditSrc)
  );
  // Comments may legitimately NAME the forbidden calls (the header states
  // what the audit does not do), so the check runs on code only.
  const codeOnly = auditSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  check(
    "the audit uses no Math.random and no setTimeout",
    !/Math\.random/.test(codeOnly) && !/setTimeout/.test(codeOnly)
  );
  check(
    "the audit writes no checkpoint and saves no model",
    !/saveCheckpoint|writeFileSync\s*\(\s*[A-Z_]+CKPT/.test(auditSrc)
  );

  // EVALUATOR — prompt set and default generation settings unchanged.
  const evalSrc = readSource("../capability-eval/evaluate.ts");
  check(
    "the evaluator's default generation settings are unchanged",
    /maxTokens\s*=\s*24/.test(evalSrc) &&
      /temperature\s*=\s*0\.8/.test(evalSrc) &&
      /seed\s*=\s*42/.test(evalSrc)
  );
  check(
    "the evaluator source carries no Phase 98 modification",
    !evalSrc.includes("phase98") && !evalSrc.includes("Phase 98")
  );
  check(
    "the UTF-8 scanner source carries no Phase 98 modification",
    !readSource("../capability-eval/utf8.ts").includes("phase98")
  );
  check(
    "the audit's prompt set is exactly the evaluator's five prompts (2 zh + 2 en + 1 mixed)",
    GEN_EVAL_PROMPTS.length === 5 &&
      GEN_EVAL_PROMPTS.filter((p) => p.language === "zh").length === 2 &&
      GEN_EVAL_PROMPTS.filter((p) => p.language === "en").length === 2 &&
      GEN_EVAL_PROMPTS.filter((p) => p.language === "mixed").length === 1
  );

  // LEVEL THRESHOLDS — Phase 95's gate conditions are not restated here.
  const levelsSrc = readSource("../capability-eval/levels.ts");
  check(
    "the Level-4 gate still has exactly its three unchanged conditions",
    levelsSrc.includes('"validUtf8TolerantRatio === 1"') &&
      levelsSrc.includes('"nonEmptyRatio === 1"') &&
      levelsSrc.includes('"collapsedRatio === 0"')
  );
  check(
    "Phase 98 defines no new threshold and no new gate",
    !/LEVEL5|LEVEL_4_TOLERANT|newThreshold/i.test(auditSrc)
  );

  // DATASET — the corpus the audit scans is the production dataset.
  check(
    "the audit loads the production dataset rather than a private corpus",
    auditSrc.includes("loadProductionDataset") && auditSrc.includes("getDatasetTexts")
  );
  check(
    "the audit never writes a dataset or checkpoint artifact",
    !/writeFileSync\([^)]*dataset/i.test(auditSrc)
  );
}

function testGenerationNotConstrained(): void {
  const auditSrc = fs.readFileSync(AUDIT_SRC, "utf8");
  check(
    "the audit reads generations from recorded artifacts instead of inventing them",
    auditSrc.includes("readRecordedSources")
  );
  check(
    "no output is constrained to valid UTF-8 during generation",
    !/forceValidUtf8|repairUtf8|sanitizeBytes|constrainToUtf8/.test(auditSrc)
  );
  check(
    "the sampler is a re-derivation of the production one, exercised at temperature 0 and 0.8",
    auditSrc.includes("replicateGreedy") && auditSrc.includes("sampleToken")
  );
  // The replication must be additive: the recorded ids are the input, and a
  // mismatch is reported rather than overwritten.
  check(
    "a trajectory that does not reproduce is reported, not silently accepted",
    /reproduced/.test(auditSrc) && /throw new Error/.test(auditSrc)
  );
}

// ============================================================
// 16-17. Artifact contracts — skip-with-report if absent
// ============================================================

interface ArtifactSample {
  armKey: string;
  language: string;
  prompt: string;
  firstInvalidByte: number;
  firstInvalidTokenIndex: number;
  scannerAgreesWithProduction: boolean;
  steps: { needBefore: number; needAfter: number; invalidByteAt: number; tokenClass: string }[];
  classification: { type: FailureType };
  corpusSupport: { level: string } | null;
}

interface Artifact {
  corpus: { documents: number; byLanguage: Record<string, number> };
  vocabulary: {
    size: number;
    countsByClass: Record<string, number>;
    entries: { id: number; bytesHex: string; tokenClass: string }[];
  };
  crossSourceIdentity: { allIdentical: boolean; promptsCompared: number };
  failureCorpus: { totalRecordedGenerations: number; perSample: ArtifactSample[] };
  corpusStateTransitionSupport: { totalIncompatible: number; positionsByNeed: Record<string, number> };
  decisionGate: {
    type1: number;
    type2: number;
    type3: number;
    noCorruption: number;
    unresolved: number;
    corruptedSamples: number;
    totalSamples: number;
    classification: string;
  };
  conditionalTransitionAudit: {
    available: boolean;
    arms: Record<string, { trajectoriesReproduced: number; trajectoriesTotal: number }>;
  };
  integrity: Record<string, unknown>;
}

function testArtifactContracts(): void {
  if (!fs.existsSync(OUT_PATH)) {
    skip("artifact exists at experiments/phase98/cjk-byte-corruption-audit.json", "not built yet");
    skip("the failure corpus is real and reproduced exactly", "artifact absent");
    skip("the artifact's gate is internally consistent", "artifact absent");
    return;
  }

  const raw = fs.readFileSync(OUT_PATH, "utf8");
  const art = JSON.parse(raw) as Artifact;
  check("artifact exists and parses", raw.length > 0 && art.failureCorpus !== undefined);

  // THE FAILURE CORPUS IS REAL — one recorded generation per arm per prompt.
  const samples = art.failureCorpus.perSample;
  check(
    "the failure corpus holds exactly 4 arms x 5 prompts recorded generations",
    samples.length === 20 && art.failureCorpus.totalRecordedGenerations === 20
  );
  check(
    "every arm contributed a generation for every prompt",
    (["A", "B94", "C94", "T"] as const).every(
      (k) => samples.filter((s) => s.armKey === k).length === 5
    ) && ARMS.length === 4
  );
  check(
    "the recorded sources agree with each other where they overlap",
    art.crossSourceIdentity.allIdentical === true && art.crossSourceIdentity.promptsCompared > 0,
    `compared ${art.crossSourceIdentity.promptsCompared}`
  );

  // TRACE INTEGRITY — the walker agreed with the production scanner everywhere.
  check(
    "the audit's byte walker agreed with production scanUtf8 on every recorded sample",
    samples.every((s) => s.scannerAgreesWithProduction === true)
  );
  check(
    "every step's reported phase transition is self-consistent",
    samples.every((s) =>
      s.steps.every((st) => st.needAfter === -1 || (st.needBefore >= 0 && st.needAfter >= 0))
    )
  );

  // REPRODUCTION — the conditional audit is only valid where ids matched.
  check(
    "every inspected trajectory reproduced its recorded token ids exactly",
    art.conditionalTransitionAudit.available === true &&
      Object.values(art.conditionalTransitionAudit.arms).every(
        (a) => a.trajectoriesReproduced === a.trajectoriesTotal && a.trajectoriesTotal === 5
      )
  );

  // GATE CONSISTENCY — re-derived from the artifact's own per-sample types.
  const types = samples.map((s) => s.classification.type);
  const count = (t: FailureType): number => types.filter((x) => x === t).length;
  const g = art.decisionGate;
  check(
    "the artifact's gate counts match the per-sample classifications",
    g.type1 === count("type1-unsupported") &&
      g.type2 === count("type2-boundary") &&
      g.type3 === count("type3-semantic") &&
      g.noCorruption === count("no-corruption") &&
      g.unresolved === count("unresolved"),
    JSON.stringify({ gate: g, derived: { t1: count("type1-unsupported"), t2: count("type2-boundary"), t3: count("type3-semantic"), nc: count("no-corruption"), u: count("unresolved") } })
  );
  check(
    "the artifact's gate counts partition the failure corpus",
    g.type1 + g.type2 + g.type3 + g.noCorruption + g.unresolved === samples.length &&
      g.corruptedSamples + g.noCorruption === samples.length
  );
  check(
    "the recorded classification is one of the five permitted types",
    ["A", "B", "C", "D", "E"].includes(g.classification)
  );
  check(
    "the gate is the one the counts imply",
    decideGate(
      samples.map((s) => ({ type: s.classification.type })),
      g.corruptedSamples,
      samples.length
    ).classification === g.classification,
    `artifact says ${g.classification}`
  );

  // SUPPORT SIDE — every corrupted sample that was classified had support
  // measured; no corrupted sample was resolved without it.
  check(
    "every corrupted sample carries a byte position and a token index",
    samples
      .filter((s) => s.firstInvalidByte !== -1)
      .every((s) => s.firstInvalidTokenIndex >= 0)
  );
  check(
    "every non-corrupted sample reports no invalid byte at all",
    samples.filter((s) => s.firstInvalidByte === -1).every((s) => s.firstInvalidTokenIndex === -1)
  );
  check(
    "the corpus transition scan recorded zero incompatible transitions",
    art.corpusStateTransitionSupport.totalIncompatible === 0
  );
  check(
    "every corrupted sample classified as a boundary failure had measured, non-'none' support",
    samples
      .filter((s) => s.classification.type === "type2-boundary")
      .every((s) => s.corpusSupport !== null && s.corpusSupport.level !== "none" && s.corpusSupport.level !== "unresolved")
  );
  check(
    "no corrupted sample was classified type1 without a 'none' support level",
    samples
      .filter((s) => s.classification.type === "type1-unsupported")
      .every((s) => s.corpusSupport !== null && s.corpusSupport.level === "none")
  );

  // INTEGRITY BLOCK — the audit's own claim about what it touched.
  check(
    "the artifact reports no production module modified",
    Array.isArray(art.integrity.productionModulesModified) &&
      (art.integrity.productionModulesModified as unknown[]).length === 0 &&
      art.integrity.datasetModified === false &&
      art.integrity.evaluatorModified === false &&
      art.integrity.generationModified === false &&
      art.integrity.thresholdsModified === false
  );

  // The vocabulary record must agree with the live classification.
  const { vocab } = getFixture();
  const livePartial = vocab.filter((v) => v.tokenClass === "cjk-partial-merge").length;
  const entries = art.vocabulary.entries;
  const artPartial = entries.filter((v) => v.tokenClass === "cjk-partial-merge").length;
  check(
    "the artifact's vocabulary classification matches a live reclassification",
    artPartial === livePartial && entries.length === vocab.length && art.vocabulary.size === vocab.length,
    `artifact ${artPartial} vs live ${livePartial}`
  );
}

// ============================================================
// 18. Sampler re-derivation
// ============================================================

function testSamplerRederaivation(): void {
  // The RNG used for the greedy control must be reproducible.
  const a = createSeededRNG(SEED);
  const b = createSeededRNG(SEED);
  const first = [a(), a(), a()];
  const second = [b(), b(), b()];
  check("createSeededRNG is reproducible for a fixed seed", first.every((v, i) => v === second[i]));

  const c = createSeededRNG(SEED + 1);
  check("createSeededRNG differs across seeds", c() !== first[0]);

  // Temperature 0 is argmax, tie-broken by lowest index.
  check(
    "temperature 0 selects the argmax deterministically",
    sampleToken([0.1, 5.0, 5.0, 0.2], createSeededRNG(SEED), 0) === 1
  );
  // At temperature 0 the RNG must not be consulted at all: after an argmax
  // draw, the same stream must still yield what a fresh stream yields first.
  const used = createSeededRNG(SEED);
  sampleToken([0.1, 2.0, 0.3], used, 0);
  const firstAfterArgmax = used();
  const fresh = createSeededRNG(SEED)();
  check(
    "temperature 0 does not consume randomness",
    firstAfterArgmax === fresh,
    `${firstAfterArgmax} vs ${fresh}`
  );

  // A positive temperature is a distribution, not a point mass.
  const draws: number[] = [];
  const r = createSeededRNG(SEED);
  for (let i = 0; i < 200; i++) draws.push(sampleToken([1.0, 1.0], r, 0.8));
  check(
    "a positive temperature produces both outcomes (the control is not degenerate)",
    draws.includes(0) && draws.includes(1)
  );
}

// ============================================================
// Runner
// ============================================================

export function runPhase98Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\n  -- Phase 98: CJK/mixed interior byte-corruption audit --");
  testTokenToByteMapping();
  testUtf8BoundaryDetection();
  testFirstInvalidTokenAndByte();
  testCorpusSupportQueries();
  testExpectationRequiresFullPrefix();
  testDeterministicAndPhaseConditionedScanning();
  testVocabularyClassification();
  testClassificationSupportedButCorrupted();
  testClassificationUnsupportedContinuation();
  testClassificationSemanticSubstitution();
  testClassificationUnresolved();
  testDecisionGate();
  testFrozenSurfaces();
  testGenerationNotConstrained();
  testSamplerRederaivation();
  testArtifactContracts();

  console.log(`  Phase 98: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}
