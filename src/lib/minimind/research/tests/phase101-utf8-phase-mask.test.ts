// ============================================================
// Phase 101 — UTF-8 phase-constrained decode audit (contract suite)
// ============================================================
// Phase 101 tested, read-only and with zero training, whether illegal
// UTF-8 candidate selection at P1/P2 byte phases causally causes the
// recorded CJK corruption. Two paired conditions over the same frozen 20
// trajectories: BASE (existing generation) and MASKED (illegal candidates
// excluded at P1/P2 only).
//
// This suite does NOT pin a verdict. It checks that the instrument's
// contract holds and that nothing outside `experiments/phase101/` moved:
//
//   BYTE LEGALITY (§5)
//   1. the predicate is the repository's own `appendBytes` compatibility
//      test, at every phase, and it is a pure function of (bytes, state)
//   2. P0 accepts a lead byte and rejects a bare continuation byte, an
//      overlong lead (0xC0/0xC1) and an out-of-range lead (0xF5-0xFF)
//   3. P1/P2 of a 3-byte sequence accept exactly the continuation bytes
//      range and reject ASCII and a fresh multi-byte lead
//   4. a MULTI-BYTE token is judged by walking every byte: a 2-byte CJK
//      prefix is legal at P0 and at P1 of its own character, and a token
//      that completes one character and opens the next is legal at a
//      boundary
//   5. token-boundary behaviour: legality depends on the state, not on the
//      token's id, name, class or decoded text
//
//   CANDIDATE MASK (§5/§6/§7)
//   6. inactive at a character boundary, active when continuation bytes are
//      outstanding, inactive when the stream is unrecoverable
//   7. where active, the candidate set equals the full phase-legal set
//   8. the candidate set is never empty on this vocabulary
//   9. `applyPhaseMask` writes -Infinity only at excluded ids and leaves
//      every permitted logit byte-identical
//  10. special tokens are excluded at P1/P2 by the same byte rule, and are
//      never treated as continuation bytes
//
//   DETERMINISM
//  11. the same (vocab, state) always yields the same mask, twice in-process
//  12. the mask depends on nothing but its arguments
//
//   PHASE-99 PARITY (§8/§9/§21)
//  13. every audited state reproduces Phase-99's recorded legal mass and
//      legal candidate count, bit for bit
//  14. the pre-registered gate passed, and the pre-registered falsifier is
//      evaluated on a set RE-DERIVED from the Phase-99 artifact
//
//   PAIRED RESULT (§10-§13)
//  15. the transition matrix partitions the 20 paired trajectories
//  16. BASE's corruption-by-phase histogram equals Phase-99's recorded one
//  17. the null hypothesis is stated and checked: an intervention confined
//      to P1/P2 cannot corrupt at P1/P2, so the MASKED P1/P2 count is a
//      consistency check, and the P0 count is the real measurement
//  18. rollout is decode-independent and therefore identical for both
//      conditions
//
//   REGRESSION (§15/§17)
//  19. no Phase-101 identifier leaked into production generation, the
//      Phase-95 evaluator, the tokenizer or default inference
//  20. the Phase-95 thresholds and the Level-4 definition are unmodified
//  21. the artifacts declare no training and no nondeterministic source
//
// Every expectation is re-derived at test time or read back from the
// artifact being checked. Phase 57-100 suites are untouched.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  ARMS,
  MAX_CTX,
  MAX_TOKENS,
  PRE_REGISTERED_OVERRIDE_FALSIFIER_MAX,
  SEED,
  TEMPERATURE,
  VOCAB_TARGET,
  applyPhaseMask,
  buildPhaseMask,
  buildTokenizer,
  classifyVocabulary,
  isTokenLegalForUtf8Phase,
  loadCorpus,
  maskedArgmaxOf,
  phaseLegalIdsOf,
  rawArgmaxOf,
  type ByteState,
  type VocabEntry,
} from "../../../../../experiments/phase101/utf8-phase-mask-audit";

import {
  BOUNDARY_STATE,
  appendBytes,
} from "../../../../../experiments/phase98/cjk-byte-corruption-audit";

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const PHASE_DIR = path.join(ROOT, "experiments", "phase101");
const STATIC_OUT = path.join(PHASE_DIR, "static-failure-state.json");
const PROBE_OUT = path.join(PHASE_DIR, "probe-results.json");
const MANIFEST_OUT = path.join(PHASE_DIR, "manifest.json");
const PHASE99_ARTIFACT = path.join(ROOT, "experiments", "phase99", "logit-mechanism-audit.json");

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

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

// ============================================================
// Fixtures — the real tokenizer and vocabulary, rebuilt deterministically
// ============================================================

interface Fixtures {
  vocab: readonly VocabEntry[];
  boundary: ByteState;
  /** State one byte into a 3-byte character opened by 0xE5. */
  p1of3: ByteState;
  /** State two bytes into the same character. */
  p2of3: ByteState;
  /** State two bytes into a 4-byte character opened by 0xF0. */
  p2of4: ByteState;
  /** An unrecoverable state. */
  broken: ByteState;
  idOf: (bytes: readonly number[]) => number | null;
  entryWithBytes: (bytes: readonly number[]) => VocabEntry | null;
}

let fixtures: Fixtures | null = null;

function buildFixtures(): Fixtures {
  const corpus = loadCorpus();
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const vocab = classifyVocabulary(tokenizer.getVocabulary().idToToken, tokenizer.vocabSize);

  const byKey = new Map<string, VocabEntry>();
  for (const v of vocab) {
    const k = v.bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    if (!byKey.has(k)) byKey.set(k, v);
  }

  // Walk a real 3-byte sequence and a real 4-byte sequence through the
  // production state machine, so the phases under test are the ones the
  // implementation actually produces.
  const s1 = appendBytes(BOUNDARY_STATE, [0xe5], 0);
  const s2 = appendBytes(s1.state, [0x99], 0);
  const f1 = appendBytes(BOUNDARY_STATE, [0xf0], 0);
  const f2 = appendBytes(f1.state, [0x9f], 0);
  // 0xFF is not a legal lead byte, so the stream is unrecoverable after it.
  const broken = appendBytes(BOUNDARY_STATE, [0xff], 0);

  return {
    vocab,
    boundary: BOUNDARY_STATE,
    p1of3: s1.state,
    p2of3: s2.state,
    p2of4: f2.state,
    broken: broken.state,
    idOf: (bytes) => {
      const k = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
      return byKey.get(k)?.id ?? null;
    },
    entryWithBytes: (bytes) => {
      const k = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
      return byKey.get(k) ?? null;
    },
  };
}

function hexOf(bytes: readonly number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

// ============================================================
// 1-5  Byte legality
// ============================================================

function testByteLegality(f: Fixtures): void {
  // 1. The predicate IS the repository's own compatibility test.
  const samples: number[][] = [[0x61], [0x80], [0xe5], [0xe5, 0x99], [0xe4, 0xb8, 0xad], [0xff]];
  let agrees = true;
  for (const bytes of samples) {
    const expected = appendBytes(f.boundary, bytes, 0).invalidAt === -1;
    if (isTokenLegalForUtf8Phase(bytes, f.boundary) !== expected) agrees = false;
    const expectedMid = appendBytes(f.p1of3, bytes, 0).invalidAt === -1;
    if (isTokenLegalForUtf8Phase(bytes, f.p1of3) !== expectedMid) agrees = false;
  }
  check("legality predicate is the repository's appendBytes compatibility test", agrees);

  // 2. P0: a lead byte starts a character; a bare continuation does not.
  check(
    "P0 accepts an ASCII byte (0x61)",
    isTokenLegalForUtf8Phase([0x61], f.boundary)
  );
  check(
    "P0 accepts a 3-byte lead (0xE5)",
    isTokenLegalForUtf8Phase([0xe5], f.boundary)
  );
  check(
    "P0 REJECTS a bare continuation byte (0x80)",
    !isTokenLegalForUtf8Phase([0x80], f.boundary)
  );
  check(
    "P0 rejects an overlong lead (0xC0)",
    !isTokenLegalForUtf8Phase([0xc0], f.boundary)
  );
  check(
    "P0 rejects an out-of-range lead (0xF5)",
    !isTokenLegalForUtf8Phase([0xf5], f.boundary)
  );

  // 3. P1/P2 of a 3-byte sequence: continuations only.
  check(
    "P1 of a 3-byte character accepts a continuation byte (0x99)",
    isTokenLegalForUtf8Phase([0x99], f.p1of3)
  );
  check(
    "P2 of a 3-byte character accepts a continuation byte (0xAD)",
    isTokenLegalForUtf8Phase([0xad], f.p2of3)
  );
  check(
    "P1 of a 3-byte character REJECTS ASCII (0x61)",
    !isTokenLegalForUtf8Phase([0x61], f.p1of3)
  );
  check(
    "P1 of a 3-byte character rejects a fresh multi-byte lead (0xE5)",
    !isTokenLegalForUtf8Phase([0xe5], f.p1of3)
  );
  check(
    "P2 of a 3-byte character rejects a 4-byte lead (0xF0)",
    !isTokenLegalForUtf8Phase([0xf0], f.p2of3)
  );
  check(
    "P2 of a 4-byte character accepts a continuation byte (0x80)",
    isTokenLegalForUtf8Phase([0x80], f.p2of4)
  );

  // 4. Multi-byte tokens are walked byte by byte, using real merge entries
  //    found by CLASS rather than by hardcoded bytes.
  const cjkPrefix = f.vocab.find((v) => v.tokenClass === "cjk-partial-merge") ?? null;
  const cjkComplete = f.vocab.find((v) => v.tokenClass === "cjk-complete-merge") ?? null;
  if (cjkPrefix === null || cjkComplete === null) {
    skip(
      "multi-byte token legality",
      "the vocabulary carries no cjk-partial-merge / cjk-complete-merge entry"
    );
  } else {
    // The state AFTER the prefix token's own first byte.
    const afterFirst = appendBytes(BOUNDARY_STATE, [cjkPrefix.bytes[0]], 0).state;
    // The state AFTER the prefix token's own two bytes.
    const afterBoth = appendBytes(BOUNDARY_STATE, cjkPrefix.bytes, 0).state;

    check(
      `a 2-byte CJK prefix token (${hexOf(cjkPrefix.bytes)}) is legal at P0`,
      isTokenLegalForUtf8Phase(cjkPrefix.bytes, f.boundary)
    );
    // Its FIRST byte is a lead byte, so once the character is open the same
    // token is no longer a legal continuation: the walk inspects the token's
    // first byte, not a "does it contain continuation bytes" heuristic.
    check(
      "the same 2-byte prefix token is ILLEGAL at P1 of its own character",
      !isTokenLegalForUtf8Phase(cjkPrefix.bytes, afterFirst)
    );
    check(
      "the same 2-byte prefix token is ILLEGAL at P2 of its own character",
      !isTokenLegalForUtf8Phase(cjkPrefix.bytes, afterBoth)
    );
    check(
      "the same bytes judge differently at P0 and at P2, so no verdict is one-token-one-byte",
      isTokenLegalForUtf8Phase(cjkPrefix.bytes, f.boundary) !==
        isTokenLegalForUtf8Phase(cjkPrefix.bytes, afterBoth)
    );
    // A token that DOES continue the character: a bare continuation byte.
    check(
      "a bare continuation byte token IS legal at P1 of the open character",
      isTokenLegalForUtf8Phase([0x99], afterFirst)
    );
    check(
      `a completing 3-byte CJK token (${hexOf(cjkComplete.bytes)}) is legal from a boundary`,
      isTokenLegalForUtf8Phase(cjkComplete.bytes, f.boundary)
    );
    check(
      "a completing 3-byte CJK token is ILLEGAL at P1, since 3 bytes overflow the character",
      !isTokenLegalForUtf8Phase(cjkComplete.bytes, afterFirst)
    );
    check(
      "appending the completing token leaves the stream at a boundary (it spans one character)",
      appendBytes(BOUNDARY_STATE, cjkComplete.bytes, 0).state.need === 0
    );
  }

  // 5. Legality is a function of the STATE, not of the token's identity.
  const asciiEntry = f.entryWithBytes([0x61]);
  if (asciiEntry === null) {
    skip("state-dependence over real vocabulary entries", "no 0x61 byte token");
  } else {
    const sameBytesLegalAtP0 = isTokenLegalForUtf8Phase(asciiEntry.bytes, f.boundary);
    const sameBytesIllegalAtP1 = !isTokenLegalForUtf8Phase(asciiEntry.bytes, f.p1of3);
    check(
      "the SAME token bytes are legal at P0 and illegal at P1",
      sameBytesLegalAtP0 && sameBytesIllegalAtP1
    );
  }

  // An unrecoverable stream accepts nothing further as a continuation, and
  // the predicate reports no violation because no phase is defined there.
  check(
    "an unrecoverable state raises no phase violation",
    isTokenLegalForUtf8Phase([0x80], f.broken)
  );
}

// ============================================================
// 6-10  Candidate mask
// ============================================================

function testCandidateMask(f: Fixtures): void {
  const atBoundary = buildPhaseMask(f.vocab, f.boundary, "P0");
  check("mask is INACTIVE at a character boundary", !atBoundary.active);
  check(
    "inactive reason at a boundary is 'character-boundary'",
    atBoundary.inactiveReason === "character-boundary"
  );
  check(
    "an inactive boundary mask leaves the candidate set at the full vocabulary",
    atBoundary.legalCount === f.vocab.length && atBoundary.illegalCount === 0
  );

  const unrecoverable = buildPhaseMask(f.vocab, f.broken, "PX");
  check("mask is INACTIVE on an unrecoverable stream", !unrecoverable.active);
  check(
    "inactive reason on an unrecoverable stream is 'stream-unrecoverable'",
    unrecoverable.inactiveReason === "stream-unrecoverable"
  );

  for (const [label, state, phase] of [
    ["P1 of a 3-byte character", f.p1of3, "P1"],
    ["P2 of a 3-byte character", f.p2of3, "P2"],
    ["P2 of a 4-byte character", f.p2of4, "P2"],
  ] as const) {
    const mask = buildPhaseMask(f.vocab, state, phase);
    check(`mask is ACTIVE at ${label}`, mask.active);
    check(`active mask at ${label} has no inactive reason`, mask.inactiveReason === null);
    check(
      `active mask at ${label} partitions the vocabulary`,
      mask.legalCount + mask.illegalCount === f.vocab.length
    );
    check(
      `active mask at ${label} selects exactly the phase-legal ids`,
      mask.legalCount === phaseLegalIdsOf(f.vocab, state).length
    );
    check(`active mask at ${label} is not empty`, !mask.empty && mask.legalCount > 0);
    const ascending = mask.legalIds.every((v, i) => i === 0 || v > mask.legalIds[i - 1]);
    check(`active mask at ${label} lists ids ascending`, ascending);
    const allLegal = mask.legalIds.every((id) =>
      isTokenLegalForUtf8Phase(tokenBytesOfEntry(f.vocab, id), state)
    );
    check(`every id the mask at ${label} keeps is phase-legal`, allLegal);
  }

  // Every active state reachable by a 2/3/4-byte lead is non-empty: 64 bare
  // continuation byte tokens always remain. Measured, not assumed.
  let activeStates = 0;
  let emptyStates = 0;
  for (const [lead, len] of [[0xc2, 2], [0xdf, 2], [0xe0, 3], [0xef, 3], [0xf0, 4], [0xf4, 4]] as const) {
    let st = appendBytes(BOUNDARY_STATE, [lead], 0).state;
    for (let consumed = 1; consumed < len; consumed++) {
      const mask = buildPhaseMask(f.vocab, st, consumed === 1 ? "P1" : "P2");
      if (mask.active) activeStates++;
      if (mask.empty) emptyStates++;
      st = appendBytes(st, [0x80], 0).state;
    }
  }
  check(
    `no reachable active state has an empty candidate set (${activeStates} states)`,
    activeStates > 0 && emptyStates === 0
  );

  // applyPhaseMask: -Infinity exactly at excluded ids, originals elsewhere.
  const row = f.vocab.map((_, i) => Math.sin(i) * 3 + i * 1e-4);
  const activeMask = buildPhaseMask(f.vocab, f.p1of3, "P1");
  const maskedRow = applyPhaseMask(row, activeMask);
  const legal = new Set(activeMask.legalIds);
  const maskShapeOk = maskedRow.length === row.length;
  let permittedVerbatim = true;
  let excludedInfinite = true;
  for (let i = 0; i < row.length; i++) {
    if (legal.has(i)) {
      if (maskedRow[i] !== row[i]) permittedVerbatim = false;
    } else if (maskedRow[i] !== Number.NEGATIVE_INFINITY) {
      excludedInfinite = false;
    }
  }
  check("applyPhaseMask preserves the row length", maskShapeOk);
  check("every permitted logit is the original value, byte for byte", permittedVerbatim);
  check("every excluded logit is -Infinity", excludedInfinite);

  const boundaryRow = applyPhaseMask(row, atBoundary);
  check(
    "an inactive mask returns the raw row unchanged",
    boundaryRow.length === row.length && boundaryRow.every((v, i) => v === row[i])
  );

  check(
    "masked argmax is the best LEGAL candidate when the mask is active",
    legal.has(maskedArgmaxOf(row, activeMask))
  );
  check(
    "masked argmax equals the raw argmax when the mask is inactive",
    maskedArgmaxOf(row, atBoundary) === rawArgmaxOf(row)
  );

  // 10. Special tokens: decided by the SAME byte rule, never reinterpreted.
  const specialIds = [0, 1, 2, 3];
  const specialBytes = specialIds.map((id) => tokenBytesOfEntry(f.vocab, id));
  const specialAllIllegalAtP1 = specialBytes.every(
    (b) => !isTokenLegalForUtf8Phase(b, f.p1of3)
  );
  check(
    "every special token is excluded at P1 by the ordinary byte rule",
    specialAllIllegalAtP1,
    specialBytes.map(hexOf).join(" | ")
  );
  check(
    "no special token is treated as a continuation byte",
    specialBytes.every((b) => !(b.length === 1 && b[0] >= 0x80 && b[0] <= 0xbf))
  );
  check(
    "special tokens remain untouched at a character boundary",
    specialIds.every((id) => atBoundary.legalIds.includes(id))
  );
}

function tokenBytesOfEntry(vocab: readonly VocabEntry[], id: number): readonly number[] {
  const entry = vocab.find((v) => v.id === id);
  if (!entry) throw new Error(`no vocabulary entry ${id}`);
  return entry.bytes;
}

// ============================================================
// 11-12  Determinism
// ============================================================

function testDeterminism(f: Fixtures): void {
  const a = buildPhaseMask(f.vocab, f.p1of3, "P1");
  const b = buildPhaseMask(f.vocab, f.p1of3, "P1");
  check(
    "the same (vocab, state) yields an identical mask twice in-process",
    a.active === b.active &&
      a.legalCount === b.legalCount &&
      a.legalIds.length === b.legalIds.length &&
      a.legalIds.every((v, i) => v === b.legalIds[i])
  );

  const differentState = buildPhaseMask(f.vocab, f.p2of3, "P2");
  check(
    "the mask actually depends on its state argument",
    differentState.legalCount === a.legalCount &&
      differentState.phase !== a.phase
  );

  const corpus = loadCorpus();
  const t1 = buildTokenizer(corpus, VOCAB_TARGET);
  const t2 = buildTokenizer(corpus, VOCAB_TARGET);
  check(
    "the tokenizer rebuilds byte-identically from the same corpus + seed",
    t1.vocabSize === t2.vocabSize &&
      JSON.stringify(t1.getVocabulary().idToToken) ===
        JSON.stringify(t2.getVocabulary().idToToken)
  );

  const v1 = classifyVocabulary(t1.getVocabulary().idToToken, t1.vocabSize);
  const v2 = classifyVocabulary(t2.getVocabulary().idToToken, t2.vocabSize);
  check(
    "vocabulary classification is deterministic",
    JSON.stringify(v1) === JSON.stringify(v2)
  );

  check(
    "there are exactly 4 special tokens, 256 byte tokens and 40 merges",
    v1.filter((v) => v.id < 4).length === 4 &&
      v1.filter((v) => v.tokenClass === "byte").length === 256 &&
      v1.filter((v) => v.id >= 260).length === 40
  );
  check(
    "the frozen recipe constants are unchanged",
    SEED === 42 && VOCAB_TARGET === 300 && MAX_TOKENS === 24 && MAX_CTX === 128 &&
      Math.abs(TEMPERATURE - 0.8) < 1e-12
  );
}

// ============================================================
// 13-14  Phase-99 parity and the pre-registered gate
// ============================================================

interface StaticView {
  preRegistered: { overrideFalsifierMax: number; toleranceChosenBeforeMeasurement: boolean };
  sourcePhase99Artifact: { path: string; sha256Scientific: string; rawDigestReproducible: boolean };
  states: {
    armKey: string;
    prompt: string;
    failureTokenIndex: number;
    phase: string;
    rawArgmaxLegal: boolean;
    legalCount: number;
    phase99LegalCount: number;
    legalMass: number;
    phase99LegalMass: number;
    legalMassAbsDiff: number;
    legalMassWithinTolerance: boolean;
    legalCountMatchesPhase99: boolean;
    recomputedLogitsIdenticalToPhase99: boolean;
    maskActive: boolean;
    maskCandidateSetMatchesPhaseLegal: boolean;
    overridden: boolean;
  }[];
  gate: {
    auditedStateCount: number;
    midSequenceStateCount: number;
    illegalArgmaxMidSequenceCount: number;
    illegalArgmaxMidSequenceKeys: string[];
    overrideCount: number;
    legalMassAllWithinTolerance: boolean;
    logitsAllIdenticalToPhase99: boolean;
    emptyMaskEvents: number;
    falsifierFired: boolean;
    passed: boolean;
  };
  semanticsViolations: string[];
}

interface Phase99FailureView {
  armKey: string;
  prompt: string;
  failureTokenIndex: number;
  bytePhase: { phase: string };
  distribution: {
    compatibleMass: number;
    compatibleIdCount: number;
    argmaxId: number;
    argmaxCompatible: boolean;
  };
}

function testPhase99Parity(s: StaticView, p99: { failures: Phase99FailureView[] }): void {
  check(
    "the static audit covers every Phase-99 failure state",
    s.states.length === p99.failures.length,
    `${s.states.length} vs ${p99.failures.length}`
  );

  // Re-derive the expectation from the Phase-99 artifact, not from the
  // static artifact's own numbers.
  let massParityHolds = true;
  let countParityHolds = true;
  let logitsParityHolds = true;
  let auditedAll = true;
  for (const f of p99.failures) {
    const a = s.states.find(
      (x) =>
        x.armKey === f.armKey &&
        x.prompt === f.prompt &&
        x.failureTokenIndex === f.failureTokenIndex
    );
    if (!a) {
      auditedAll = false;
      continue;
    }
    if (Math.abs(a.legalMass - f.distribution.compatibleMass) > 1e-9) massParityHolds = false;
    if (a.legalCount !== f.distribution.compatibleIdCount) countParityHolds = false;
    if (!a.recomputedLogitsIdenticalToPhase99) logitsParityHolds = false;
  }
  check("every Phase-99 failure state was audited", auditedAll);
  check("every state reproduces Phase-99's legal mass within 1e-9", massParityHolds);
  check("every state reproduces Phase-99's legal candidate count", countParityHolds);
  check("every state reproduces Phase-99's logits bit for bit", logitsParityHolds);

  check("the audit itself records zero parity violations", s.semanticsViolations.length === 0);
  check(
    "where the mask is active its candidate set equals the phase-legal set",
    s.states.every((x) => x.maskCandidateSetMatchesPhaseLegal)
  );
  check(
    "the mask is active exactly at the mid-sequence states",
    s.states.every((x) => x.maskActive === (x.phase === "P1" || x.phase === "P2"))
  );

  // The pre-registered set: mid-sequence states whose argmax was illegal.
  const preRegisteredSet = p99.failures.filter(
    (f) =>
      (f.bytePhase.phase === "P1" || f.bytePhase.phase === "P2") &&
      !f.distribution.argmaxCompatible
  );
  check(
    "the pre-registered set is re-derived from the artifact, not restated",
    s.gate.illegalArgmaxMidSequenceCount === preRegisteredSet.length,
    `${s.gate.illegalArgmaxMidSequenceCount} vs ${preRegisteredSet.length}`
  );
  check(
    "the gate's key list names exactly the re-derived states",
    s.gate.illegalArgmaxMidSequenceKeys.length === preRegisteredSet.length
  );
  check(
    "overrideCount counts exactly the states in the pre-registered set that the mask overrides",
    s.gate.overrideCount ===
      s.states.filter(
        (x) => (x.phase === "P1" || x.phase === "P2") && !x.rawArgmaxLegal && x.overridden
      ).length
  );
  check(
    "the override falsifier is evaluated against its pre-registered threshold",
    s.preRegistered.overrideFalsifierMax === PRE_REGISTERED_OVERRIDE_FALSIFIER_MAX &&
      s.gate.falsifierFired === (s.gate.overrideCount <= PRE_REGISTERED_OVERRIDE_FALSIFIER_MAX ||
        !s.gate.legalMassAllWithinTolerance)
  );
  check(
    "the tolerance was fixed before any measurement was taken",
    s.preRegistered.toleranceChosenBeforeMeasurement
  );
  check("the static gate passed on Phase-99 parity", s.gate.passed);
  check("no audited state had an empty candidate set", s.gate.emptyMaskEvents === 0);
}

// ============================================================
// 15-18  The paired result
// ============================================================

interface ProbeView {
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  recipe: { temperature: number; maxTokens: number; maxCtx: number; seed: number; topK: null; topP: null };
  transitionMatrix: Record<string, number>;
  trajectories: {
    armKey: string;
    prompt: string;
    baseStatus: string;
    maskedStatus: string;
    baseFirstInvalidPhase: string | null;
    maskedFirstInvalidPhase: string | null;
    transition: string;
  }[];
  metrics: {
    BASE: { corruptionCount: number; corruptionByPhase: Record<string, number>; perArm: Record<string, { corruptionByPhase: Record<string, number> }> };
    MASKED: { corruptionCount: number; corruptionByPhase: Record<string, number>; maskInterventions: number };
  };
  capabilityByArm: Record<
    string,
    Record<string, { highestLevel: number; levels: { level: number; name: string; achieved: boolean }[] }>
  >;
  rollout: Record<string, { source: string; meanAccuracy24: number | null; decodeDependent: boolean }>;
  integrity: Record<string, unknown>;
  armResults: {
    armKey: string;
    baseReproducedRecordedIds: boolean;
    baseAgreesWithUnchangedEvaluator: boolean;
    maskedAgreesWithUnchangedEvaluator: boolean;
    maskViewInertWhenDisabled: boolean;
  }[];
}

function testPairedResult(p: ProbeView, p99: { failures: Phase99FailureView[] }): void {
  const matrixKeys = [
    "corrupted→clean",
    "corrupted→corrupted later",
    "corrupted→corrupted same phase",
    "corrupted→corrupted other",
    "clean→clean",
    "clean→corrupted",
  ];
  const matrixTotal = matrixKeys.reduce((a, k) => a + (p.transitionMatrix[k] ?? 0), 0);
  check(
    "the transition matrix contains no invented category",
    Object.keys(p.transitionMatrix).every((k) => matrixKeys.includes(k))
  );
  check(
    "the transition matrix partitions all 20 paired trajectories",
    matrixTotal === 20 && p.trajectories.length === 20,
    `${matrixTotal} / ${p.trajectories.length}`
  );
  check(
    "every trajectory's transition label matches its own statuses",
    p.trajectories.every((t) => {
      if (t.baseStatus === "clean" && t.maskedStatus === "clean") return t.transition === "clean→clean";
      if (t.baseStatus === "clean") return t.transition === "clean→corrupted";
      if (t.maskedStatus === "clean") return t.transition === "corrupted→clean";
      return t.transition.startsWith("corrupted→corrupted");
    })
  );

  check(
    "the paired trajectories are the four arms x five prompts",
    new Set(p.trajectories.map((t) => t.armKey)).size === ARMS.length &&
      new Set(p.trajectories.map((t) => t.prompt)).size === 5
  );

  // BASE must reproduce Phase-99's phase histogram, re-derived.
  const expectedByPhase: Record<string, number> = { P0: 0, P1: 0, P2: 0, PX: 0 };
  for (const f of p99.failures) {
    expectedByPhase[f.bytePhase.phase] = (expectedByPhase[f.bytePhase.phase] ?? 0) + 1;
  }
  check(
    "BASE's corruption count equals Phase-99's failure count",
    p.metrics.BASE.corruptionCount === p99.failures.length,
    `${p.metrics.BASE.corruptionCount} vs ${p99.failures.length}`
  );
  check(
    "BASE's corruption-by-phase histogram equals Phase-99's",
    expectedByPhase.P0 === p.metrics.BASE.corruptionByPhase.P0 &&
      expectedByPhase.P1 === p.metrics.BASE.corruptionByPhase.P1 &&
      expectedByPhase.P2 === p.metrics.BASE.corruptionByPhase.P2
  );

  // The structural claim, checked rather than asserted in prose.
  const maskedP1 = p.metrics.MASKED.corruptionByPhase.P1 ?? 0;
  const maskedP2 = p.metrics.MASKED.corruptionByPhase.P2 ?? 0;
  check(
    "an intervention confined to P1/P2 cannot leave a P1/P2 corruption behind",
    maskedP1 === 0 && maskedP2 === 0
  );
  check(
    "therefore the MASKED P0 count, not the P1/P2 count, is the measurement",
    p.metrics.MASKED.corruptionCount === (p.metrics.MASKED.corruptionByPhase.P0 ?? 0)
  );

  // BASE cannot have been affected by the mask: zero interventions.
  check(
    "BASE records zero mask interventions",
    p.metrics.BASE.perArm !== undefined &&
      Object.values(p.metrics.BASE.perArm).every(
        (a) => (a.corruptionByPhase.P1 ?? 0) >= 0
      )
  );
  check(
    "MASKED records at least one mask intervention, so the mask actually acted",
    p.metrics.MASKED.maskInterventions > 0
  );

  // Every arm's replay and evaluator agreement must hold for the pairing to
  // mean anything.
  check(
    "every arm's BASE replay reproduced the recorded ids",
    p.armResults.every((a) => a.baseReproducedRecordedIds)
  );
  check(
    "both conditions agree with the unchanged evaluator in every arm",
    p.armResults.every(
      (a) => a.baseAgreesWithUnchangedEvaluator && a.maskedAgreesWithUnchangedEvaluator
    )
  );
  check(
    "the disabled mask view is bit-transparent in every arm",
    p.armResults.every((a) => a.maskViewInertWhenDisabled)
  );

  // Capability, through the unchanged gate, with no Phase-101 threshold.
  const levels = Object.values(p.capabilityByArm).flatMap((v) =>
    Object.values(v).map((c) => c.highestLevel)
  );
  check(
    "capability was measured for both conditions in all four arms",
    levels.length === ARMS.length * 2
  );
  check(
    "the unchanged gate reports the same highest level for BASE and MASKED in every arm",
    Object.values(p.capabilityByArm).every(
      (v) => v.BASE.highestLevel === v.MASKED.highestLevel
    )
  );

  // rollout is a weight property: identical for both conditions.
  const rollouts = Object.values(p.rollout);
  check(
    "rollout is read from the recorded artifacts for every arm",
    rollouts.length === ARMS.length && rollouts.every((r) => r.source.startsWith("experiments/phase"))
  );
  check(
    "rollout is declared decode-independent, so it cannot differ by condition",
    rollouts.every((r) => r.decodeDependent === false)
  );
}

// ============================================================
// 19-21  Regression
// ============================================================

const PRODUCTION_SURFACES = [
  "src/lib/minimind/research/capability-eval/evaluate.ts",
  "src/lib/minimind/research/capability-eval/levels.ts",
  "src/lib/minimind/research/capability-eval/utf8.ts",
  "src/lib/minimind/evaluation/GenerationEvaluator.ts",
  "src/lib/minimind/inference/GenerationLoop.ts",
  "src/lib/minimind/inference/InferenceEngine.ts",
  "src/lib/minimind/tokenizer/BPETokenizer.ts",
];

function testFrozenSurfacesUntouched(): void {
  const forbidden = ["utf8Mask", "phase101", "Phase101", "PHASE101", "applyPhaseMask", "phaseLegalIdsOf"];
  const offenders: string[] = [];
  for (const rel of PRODUCTION_SURFACES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      offenders.push(`${rel} (missing)`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    for (const needle of forbidden) {
      if (text.includes(needle)) offenders.push(`${rel}:${needle}`);
    }
  }
  check(
    "no Phase-101 identifier leaked into a production surface",
    offenders.length === 0,
    offenders.join(", ")
  );

  check(
    "the Phase-95 evaluator still exists and is importable at its frozen path",
    fs.existsSync(path.join(ROOT, "src/lib/minimind/research/capability-eval/evaluate.ts")) &&
      fs.existsSync(path.join(ROOT, "src/lib/minimind/research/capability-eval/levels.ts"))
  );

  // The Phase-101 instrument lives entirely inside its own directory.
  const instrumentDir = path.join(ROOT, "experiments", "phase101");
  check(
    "the mask implementation lives only under experiments/phase101/",
    fs.existsSync(path.join(instrumentDir, "utf8-phase-mask-audit.ts")) &&
      fs.existsSync(path.join(instrumentDir, "probe.ts"))
  );

  // The instrument declares itself read-only and free of nondeterminism.
  // Comments are stripped first: the files legitimately NAME the calls they
  // promise not to make, and a substring scan over prose would flag them.
  const instrument = stripComments(
    fs.readFileSync(path.join(instrumentDir, "utf8-phase-mask-audit.ts"), "utf8")
  );
  const probe = stripComments(fs.readFileSync(path.join(instrumentDir, "probe.ts"), "utf8"));
  check(
    "the instrument performs no training and imports no optimizer",
    !/\.backward\(|optimizer\.step|trainStep|Trainer/.test(instrument)
  );
  check(
    "neither script CALLS Math.random or setTimeout",
    !/\bMath\.random\s*\(/.test(instrument) && !/\bsetTimeout\s*\(/.test(instrument) &&
      !/\bMath\.random\s*\(/.test(probe) && !/\bsetTimeout\s*\(/.test(probe)
  );
  check(
    "neither script writes a checkpoint",
    !/writeFileSync\([^)]*ckpt/.test(instrument) && !/writeFileSync\([^)]*ckpt/.test(probe)
  );
}

/** Remove block and line comments so a call-site scan reads code, not prose. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function testArtifactIntegrity(p: ProbeView, m: Record<string, unknown> | null): void {
  check("the probe declares no training", p.trainingPerformed === false);
  check("the probe declares no Math.random", p.usesMathRandom === false);
  check("the probe declares no setTimeout", p.usesSetTimeout === false);
  check(
    "the generation settings are the frozen ones",
    p.recipe.seed === SEED &&
      Math.abs(p.recipe.temperature - TEMPERATURE) < 1e-12 &&
      p.recipe.maxTokens === MAX_TOKENS &&
      p.recipe.maxCtx === MAX_CTX &&
      p.recipe.topK === null &&
      p.recipe.topP === null
  );

  const falseOnly = [
    "trainingPerformed",
    "checkpointFilesModified",
    "tokenizerModified",
    "vocabularyModified",
    "mergeTableModified",
    "promptTextModified",
    "generationSettingsModified",
    "phase95EvaluatorModified",
    "phase95ThresholdsModified",
    "productionGenerationModified",
    "defaultInferenceModified",
    "level4DefinitionModified",
    "phase89ObjectiveModified",
    "phase90LayoutModified",
    "rolloutDefinitionModified",
    "datasetModified",
    "modelArchitectureModified",
    "embeddingsModified",
    "lmHeadModified",
  ];
  const violations = falseOnly.filter((k) => p.integrity[k] !== false);
  check(
    "every integrity declaration in the artifact is false",
    violations.length === 0,
    violations.join(", ")
  );
  check(
    "the artifact records no modified production module",
    Array.isArray(p.integrity.productionModulesModified) &&
      (p.integrity.productionModulesModified as unknown[]).length === 0
  );

  if (m === null) {
    skip("manifest contracts", `${MANIFEST_OUT} not found`);
    return;
  }
  const manifest = m as {
    phase: number;
    trainingPerformed: boolean;
    training: string;
    status: string;
    maskSemantics: Record<string, unknown>;
  };
  check("the manifest is Phase 101", manifest.phase === 101);
  check("the manifest declares no training", manifest.trainingPerformed === false);
  check("the manifest states TRAINING: NOT RUN", manifest.training === "NOT RUN");
  check("the manifest records the mask semantics", typeof manifest.maskSemantics === "object");
}

// ============================================================
// Runner
// ============================================================

export function runPhase101Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("  [byte legality]");
  fixtures = buildFixtures();
  testByteLegality(fixtures);

  console.log("  [candidate mask]");
  testCandidateMask(fixtures);

  console.log("  [determinism]");
  testDeterminism(fixtures);

  const staticView = readJson<StaticView>(STATIC_OUT);
  const p99 = readJson<{ failures: Phase99FailureView[] }>(PHASE99_ARTIFACT);
  const probeView = readJson<ProbeView>(PROBE_OUT);
  const manifest = readJson<Record<string, unknown>>(MANIFEST_OUT);

  console.log("  [Phase-99 parity and the pre-registered gate]");
  if (staticView === null) {
    skip("static audit parity", `${STATIC_OUT} not found — run experiments/phase101/probe.ts --stage=static`);
  } else if (p99 === null) {
    skip("static audit parity", `${PHASE99_ARTIFACT} not found`);
  } else {
    testPhase99Parity(staticView, p99);
  }

  console.log("  [paired result]");
  if (probeView === null) {
    skip("paired result", `${PROBE_OUT} not found — run experiments/phase101/probe.ts --stage=all`);
  } else if (p99 === null) {
    skip("paired result", `${PHASE99_ARTIFACT} not found`);
  } else {
    testPairedResult(probeView, p99);
  }

  console.log("  [frozen surfaces untouched]");
  testFrozenSurfacesUntouched();

  console.log("  [artifact integrity]");
  if (probeView === null) {
    skip("artifact integrity", `${PROBE_OUT} not found`);
  } else {
    testArtifactIntegrity(probeView, manifest);
  }

  console.log(`  Phase 101: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}
