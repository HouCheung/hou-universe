// ============================================================
// Phase 103 — byte-phase symmetry correlation contract suite
// ============================================================
// Phase 103 tested, read-only and with zero training, whether the P0
// continuation-byte ranking and the ranking the same frozen model produces
// after the prefix has been pushed one byte into a character (P1) are the
// same ranking, once the UTF-8 byte offset is accounted for.
//
// This suite does NOT pin a verdict. It checks the instrument's contract and
// that nothing outside `experiments/phase103/` moved:
//
//   FORCED-P1 CONSTRUCTION (§5)
//   1. the conditioning byte is a single-byte token carrying its own byte value
//   2. it is a legal multi-byte lead, so appending it genuinely leaves P0
//   3. the constructed state is exactly P1, recoverable, and one byte into the
//      character, and the construction reports how many bytes remain
//   4. the construction REFUSES a non-boundary source, a multi-byte token, an
//      ASCII byte and a continuation byte rather than silently degrading
//   5. selection is a deterministic function of the logits alone, and reads
//      them unmasked
//
//   BYTE-OFFSET MAPPING (§8)
//   6. the mapping covers all 64 continuation values in ascending order and
//      records the one-byte character-position offset explicitly
//   7. the byte-VALUE correspondence is the identity and is derived, not
//      assumed; the LEGALITY correspondence is not, and E0/ED rows prove it
//
//   DISTRIBUTION EXTRACTION (§6/§7)
//   8. `P(next byte = b)` aggregates over the FIRST byte of every token, sums
//      to 1 minus the zero-length-token mass, and never renormalises
//   9. the continuation-conditioned vector is the only renormalised quantity
//      and is labelled as such, and a zero-mass slice yields a zero vector
//  10. per-byte logits take the strongest token route to each byte, and the
//      reported ordinal rank is a permutation of 1..64 on distinct values
//
//   CORRELATION (§9)
//  11. Spearman is +1 / -1 / 0 on the analytic synthetic controls
//  12. TIES take the average rank: a fully-tied vector has rho 0 by definition
//      rather than the -1 an index tie-break would manufacture, and a
//      mostly-tied vector compared with itself is still exactly 1
//  13. the midrank Spearman equals the textbook closed form on EVERY
//      permutation of a small support
//  14. top-k overlap is 1 for identical rankings and bounded in [0, 1]
//  15. Pearson over log-probability is `null`, never 0, where a compared byte
//      has zero probability
//
//   PERMUTATION NULL (§10)
//  16. the permutation is a deterministic function of (length, seed, iteration)
//      and a different iteration gives a different permutation
//  17. repeating the null on the same pairs reproduces the interval exactly,
//      and the null uses no Math.random
//
//   CONTROLS (§11)
//  18. every synthetic control passes, including the exhaustive permutation
//      check against an independent closed form
//  19. Control A and Control B were built from real frozen states and are not
//      empty, and Control B's states are genuine P0 -> P1 transitions
//
//   STATE RECONSTRUCTION (§4/§14)
//  20. the replayed target set is exactly the 11 P0 failure states Phase 102
//      recorded under P12-MASK, by label, with no missing reference
//  21. every target's parity gate row is true on every compared quantity at
//      tolerance 0, and the gate as a whole passed with no blocks
//  22. every target re-derives its prefix length and failure index from the
//      Phase-102 record it was matched against
//  23. the reconstruction reports no mask applied to the primary logits
//
//   DECISION RULES (§19)
//  24. each classification branch is reachable and selects exactly the label
//      its stated semantics require, evaluated on synthesized aggregates
//  25. a block short-circuits to E "Blocked" whatever the statistic
//
//   REGRESSION (§15/§16/§21)
//  26. the Phase-102 artifact Phase 103 reads is byte-identical to the one
//      Phase 102 wrote, and the four checkpoints are unchanged
//  27. the production tokenizer / model / evaluator files are unchanged, and
//      no Phase-103 identifier leaked into any production source
//  28. the Phase-95 thresholds and the Level-4 definition are unmodified
//
// Every expectation is re-derived at test time or read back from the artifact
// being checked. No measured Phase-103 result is hardcoded. Phase 57-102
// suites are untouched.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  TEMPERATURE,
  buildTokenizer,
  classifyVocabulary,
  loadArmModel,
  loadCorpus,
  tokenBytes,
  VOCAB_TARGET,
  type VocabEntry,
} from "../../../../../experiments/phase98/cjk-byte-corruption-audit";

import {
  contextPhaseOf,
  scientificDigestOf,
  sha256,
} from "../../../../../experiments/phase101/utf8-phase-mask-audit";

import { softmaxAt } from "../../../../../experiments/phase99/logit-mechanism-audit";

import { Tensor } from "../../core/Tensor";
import type { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import type { BPETokenizer } from "../../tokenizer/BPETokenizer";

import {
  AGGREGATION,
  BYTE_TOKEN_BASE_ID,
  CONTINUATION_BYTES,
  LEAD_BYTE_MAX,
  LEAD_BYTE_MIN,
  PERMUTATION_COUNT,
  PERMUTATION_SEED,
  PHASE102_FROZEN,
  P103_PATHS,
  PRIMARY_SHIFT,
  SHIFT_VARIANTS,
  SIGNIFICANCE_ALPHA,
  TIE_POLICY,
  TOP_K_VALUES,
  aggregateMetrics,
  buildByteOffsetMapping,
  buildForcedP1Input,
  classify,
  continuationConditioned,
  continuationSlice,
  continuationStartIdsOf,
  midrankOf,
  nextByteDistribution,
  nextByteLogits,
  pearson,
  pearsonOverLog,
  permutationNull,
  permutationOf,
  quantile,
  rankOf,
  selectConditioningLeadByte,
  shiftedSlice,
  spearman,
  spearmanClosedFormNoTies,
  syntheticControls,
  topKOverlap,
  type AggregateResult,
  type LeadByteRobustness,
  type NullResult,
  type Phase102P0State,
  type StateAudit,
} from "../../../../../experiments/phase103/phase-symmetry-audit";

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const P102_PROBE = path.join(ROOT, "experiments", "phase102", "probe-results.json");

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
// Artifact views (only the fields this suite reads)
// ============================================================

interface ParityRow {
  label: string;
  referenceFound: boolean;
  argmaxIdMatches: boolean;
  argmaxPMatch: boolean;
  argmaxPMaxAbsDiff: number;
  legalMassMatch: boolean;
  legalMassMaxAbsDiff: number;
  continuationStartMassMatch: boolean;
  continuationStartMassMaxAbsDiff: number;
  prefixLengthMatch: boolean;
  failureTokenIndexMatch: boolean;
}

interface ProbeArtifact {
  phase: number;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  preRegistered: { tiePolicy: string; primaryStatistic: string; correlationMeasure: string };
  reconstruction: {
    replayedCondition: string;
    targetStateCount: number;
    expectedTargetStateCount: number;
    missingReferenceCount: number;
    allForwardPassesReproducible: boolean;
    forcedP1ConstructionValid: boolean;
    checkpointSha256: Record<string, string>;
  };
  parityGate: { passed: boolean; blocks: string[]; toleranceFloat: number; rows: ParityRow[] };
  controlA: { stateCount: number; aggregate: AggregateResult };
  controlB: { stateCount: number; aggregate: AggregateResult };
  controlC: { cases: { name: string; expectedRho: number; observedRho: number; passed: boolean }[]; allPassed: boolean };
  targetStates: StateAudit[];
  integrity: {
    trainingPerformed: boolean;
    checkpointFilesModified: boolean;
    tokenizerModified: boolean;
    vocabularyModified: boolean;
    mergeTableModified: boolean;
    promptTextModified: boolean;
    generationSettingsModified: boolean;
    phase95EvaluatorModified: boolean;
    phase95ThresholdsModified: boolean;
    productionGenerationModified: boolean;
    decoderModified: boolean;
    maskAppliedToPrimaryLogits: boolean;
    writesOnlyItsOwnArtifacts: boolean;
    productionFileDigests: Record<string, string>;
    productionFileDigestsMatchPhase102: boolean;
    phase102Artifact: { path: string; sha256Raw: string; sha256Scientific: string };
  };
}

interface ManifestArtifact {
  phase: number;
  status: string;
  trainingPerformed: boolean;
  readOnly: boolean;
  sourcePhase102Artifact: { path: string; sha256Raw: string; sha256Scientific: string };
  checkpointIdentifiers: { armKey: string; path: string; sha256: string; matchesPhase102: boolean }[];
  artifacts: Record<string, string>;
}

interface Phase102ProbeView {
  p0FailureStates: { fromP12: Phase102P0State[]; fromBase: Phase102P0State[] };
  integrity: { productionFileDigests?: Record<string, string> };
}

// ============================================================
// Fixtures
// ============================================================

interface Fixtures {
  idToToken: ReadonlyMap<number, string>;
  vocab: readonly VocabEntry[];
  tokenizerVocabSize: number;
  asciiPrefix: number[];
}

let fixtures: Fixtures | null = null;

function buildFixtures(): Fixtures {
  const corpus = loadCorpus();
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const idToToken = tokenizer.getVocabulary().idToToken;
  const vocab = classifyVocabulary(idToToken, tokenizer.vocabSize);
  // "AB" is two ASCII byte tokens, which is trivially a character boundary.
  const asciiPrefix = [BYTE_TOKEN_BASE_ID + 0x41, BYTE_TOKEN_BASE_ID + 0x42];
  return { idToToken, vocab, tokenizerVocabSize: tokenizer.vocabSize, asciiPrefix };
}

function fx(): Fixtures {
  if (fixtures === null) fixtures = buildFixtures();
  return fixtures;
}

// ============================================================
// §5 — Forced-P1 construction
// ============================================================

function testForcedP1Construction(): void {
  console.log("\n  §5  forced-P1 construction");
  const f = fx();

  // The byte-token range must still be the raw byte range the whole phase
  // depends on. Asserted, never assumed.
  let byteTokenRangeOk = true;
  for (let b = 0; b <= 0xff; b++) {
    const probeId = BYTE_TOKEN_BASE_ID + b;
    if (probeId >= f.tokenizerVocabSize) continue;
    const bytes = tokenBytesOf(f.idToToken, probeId);
    if (bytes.length !== 1 || bytes[0] !== b) byteTokenRangeOk = false;
  }
  check("byte-token ids 4+value still map to exactly that raw byte", byteTokenRangeOk);

  const model = loadArmModel(fxTokenizer(), path.join(ROOT, "experiments", "phase90", "phase90-aligned.ckpt.json"));
  const logits = forward(f.asciiPrefix, model);

  const picked = selectConditioningLeadByte(logits, f.idToToken);
  check(
    "the selected conditioning byte is a single-byte token carrying its own value",
    tokenBytesOf(f.idToToken, picked.id).length === 1 &&
      tokenBytesOf(f.idToToken, picked.id)[0] === picked.byte,
    `id=${picked.id} byte=0x${picked.byte.toString(16)}`
  );
  check(
    "it is inside the legal multi-byte lead range",
    picked.byte >= LEAD_BYTE_MIN && picked.byte <= LEAD_BYTE_MAX,
    `0x${picked.byte.toString(16)}`
  );
  check("it is not an ASCII byte", picked.byte >= 0x80);
  check("it is not a continuation byte", picked.byte < 0x80 || picked.byte > 0xbf);
  check("the selected id is the byte-token id of that byte", picked.id === BYTE_TOKEN_BASE_ID + picked.byte);

  // Determinism: the selection depends on the logits and nothing else.
  const again = selectConditioningLeadByte(logits, f.idToToken);
  check("selection is deterministic on the same logits", again.id === picked.id && again.byte === picked.byte);

  // Highest-logit among the legal leads, re-derived independently.
  let bestByte = -1;
  let bestLogit = -Infinity;
  for (let b = LEAD_BYTE_MIN; b <= LEAD_BYTE_MAX; b++) {
    const l = logits[BYTE_TOKEN_BASE_ID + b];
    if (l > bestLogit) {
      bestLogit = l;
      bestByte = b;
    }
  }
  check(
    "selection is the highest-logit legal lead, re-derived",
    picked.byte === bestByte && picked.logit === bestLogit,
    `picked 0x${picked.byte.toString(16)} / expected 0x${bestByte.toString(16)}`
  );

  const built = buildForcedP1Input(f.asciiPrefix, picked, f.idToToken);
  check("the construction appends exactly one id", built.prefixIds.length === f.asciiPrefix.length + 1);
  check("the appended id is the conditioning token", built.appendedId === picked.id);
  check("the appended byte is the conditioning byte", built.appendedByte === picked.byte);
  check("the expected id is the byte-token id", built.expectedId === BYTE_TOKEN_BASE_ID + picked.byte);

  const after = contextPhaseOf(f.idToToken, built.prefixIds);
  check("the constructed state is exactly P1", after.phase.phase === "P1", after.phase.phase);
  check("the constructed state is recoverable", after.phase.recoverable);
  check("exactly one byte of the character has been supplied", built.bytesAlreadySupplied === 1);
  check(
    "the remaining byte count is leadLength - 1",
    built.bytesStillNeeded === built.leadSequenceLength - 1 && built.bytesStillNeeded >= 1,
    `seqLen=${built.leadSequenceLength}`
  );
  check(
    "the construction did not modify the source prefix",
    f.asciiPrefix.length === 2 &&
      f.asciiPrefix[0] === BYTE_TOKEN_BASE_ID + 0x41 &&
      f.asciiPrefix[1] === BYTE_TOKEN_BASE_ID + 0x42
  );

  // Refusals. Each must throw, not degrade.
  const throws = (label: string, fn: () => unknown): void => {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    check(`refuses ${label}`, threw);
  };

  throws("a source prefix that is not at a character boundary", () =>
    buildForcedP1Input(built.prefixIds, picked, f.idToToken)
  );
  throws("a multi-byte conditioning token", () => {
    const multi = f.vocab.find((v) => v.bytes.length >= 2);
    if (!multi) throw new Error("no multi-byte token in vocabulary");
    buildForcedP1Input(f.asciiPrefix, { id: multi.id, byte: multi.bytes[0] }, f.idToToken);
  });
  throws("an ASCII conditioning byte", () =>
    buildForcedP1Input(f.asciiPrefix, { id: BYTE_TOKEN_BASE_ID + 0x41, byte: 0x41 }, f.idToToken)
  );
  throws("a continuation-byte conditioning byte", () =>
    buildForcedP1Input(f.asciiPrefix, { id: BYTE_TOKEN_BASE_ID + 0x80, byte: 0x80 }, f.idToToken)
  );
}

// ============================================================
// §8 — Byte-offset mapping
// ============================================================

function testByteOffsetMapping(): void {
  console.log("\n  §8  byte-offset mapping");

  const e5 = buildByteOffsetMapping(0xe5);
  check("the mapping covers all 64 continuation values", e5.rows.length === 64);
  check(
    "the rows are the continuation values in ascending order",
    e5.rows.every((r, i) => r.byte === CONTINUATION_BYTES[i])
  );
  check(
    "the byte-value correspondence is the identity",
    e5.rows.every((r) => r.p0ByteValue === r.byte && r.p1ByteValue === r.byte)
  );
  check(
    "the character-position offset is recorded per row, not implied",
    e5.rows.every((r) => r.p0StreamOffset === 0 && r.p1StreamOffset === 1)
  );
  check("the one-byte offset is stated explicitly", e5.offsetBytes === 1);
  check("the P0 side has consumed zero bytes of the character", e5.p0ConsumedIntoImaginedCharacter === 0);
  check("the P1 side has consumed exactly one byte", e5.bytesAlreadySuppliedAtP1 === 1);
  check("the remaining byte count follows the lead length", e5.bytesStillNeededAfterP1 === e5.leadSequenceLength - 1);
  check(
    "the mapping documents that legality is NOT identity",
    e5.notIdentityNote.includes("NOT") && e5.derivation.includes("derived")
  );

  // Legality is lead-dependent, and that is the whole point of control 7.
  const counts: Record<string, number> = {};
  for (const lead of [0xc2, 0xe0, 0xe5, 0xed, 0xef, 0xf0, 0xf4]) {
    counts[lead.toString(16)] = buildByteOffsetMapping(lead).legalContinuationCount;
  }
  check("a C2 lead permits all 64 continuation bytes", counts["c2"] === 64);
  check("an E0 lead excludes the overlong 0x80-0x9F half", counts["e0"] === 32);
  check("an ED lead excludes the surrogate 0xA0-0xBF half", counts["ed"] === 32);
  check("an unconstrained 3-byte lead permits all 64", counts["e5"] === 64 && counts["ef"] === 64);
  check("a 4-byte lead permits all 64", counts["f0"] === 64 && counts["f4"] === 64);

  const e0 = buildByteOffsetMapping(0xe0);
  check(
    "the E0 exclusion is flagged on exactly the 0x80-0x9F rows",
    e0.rows.every((r) => r.legalContinuationOfLead === (r.byte >= 0xa0))
  );
  const ed = buildByteOffsetMapping(0xed);
  check(
    "the ED exclusion is flagged on exactly the 0xA0-0xBF rows",
    ed.rows.every((r) => r.legalContinuationOfLead === (r.byte <= 0x9f))
  );

  let threw = false;
  try {
    buildByteOffsetMapping(0x41);
  } catch {
    threw = true;
  }
  check("an ASCII value is refused as a lead", threw);
}

// ============================================================
// §6/§7 — Distribution extraction
// ============================================================

function testDistributionExtraction(): void {
  console.log("\n  §6/§7  distribution extraction");
  const f = fx();

  const model = loadArmModel(fxTokenizer(), path.join(ROOT, "experiments", "phase90", "phase90-aligned.ckpt.json"));
  const logits = forward(f.asciiPrefix, model);
  const probs = softmaxAt(logits, TEMPERATURE);
  const { dist, zeroLengthMass, outOfRangeIds } = nextByteDistribution(probs, f.idToToken);

  check("the byte distribution covers 256 values", dist.length === 256);
  check("no byte-token id was found out of its own byte range", outOfRangeIds.length === 0);
  check(
    "P(next byte) sums to 1 minus the zero-length-token mass",
    Math.abs(dist.reduce((s, v) => s + v, 0) - (1 - zeroLengthMass)) < 1e-9,
    `sum=${dist.reduce((s, v) => s + v, 0)} zeroLenMass=${zeroLengthMass}`
  );

  // Re-derived independently: every token contributes its probability to the
  // FIRST byte of its own byte sequence.
  const manual = new Array<number>(256).fill(0);
  for (let id = 0; id < probs.length; id++) {
    const bytes = tokenBytesOf(f.idToToken, id);
    if (bytes.length === 0) continue;
    manual[bytes[0]] += probs[id];
  }
  check(
    "the aggregation is over the first byte of every token, re-derived",
    manual.every((v, i) => Math.abs(v - dist[i]) < 1e-15)
  );

  const slice = continuationSlice(dist);
  check("the continuation slice is the 64 values 0x80-0xBF", slice.length === 64);
  check(
    "the slice is a read of the full distribution, not a renormalisation",
    slice.every((v, i) => v === dist[CONTINUATION_BYTES[i]])
  );

  const cond = continuationConditioned(slice);
  const condTotal = cond.reduce((s, v) => s + v, 0);
  const sliceTotal = slice.reduce((s, v) => s + v, 0);
  check("the conditioned vector sums to 1 when it has mass", Math.abs(condTotal - 1) < 1e-12, `${condTotal}`);
  check(
    "the conditioned vector is a scaled copy of the slice, not a different quantity",
    cond.every((v, i) => Math.abs(v - slice[i] / sliceTotal) < 1e-15),
    `sliceTotal=${sliceTotal}`
  );

  const empty = continuationConditioned(new Array<number>(64).fill(0));
  check("a zero-mass slice conditions to a zero vector, not NaN", empty.every((v) => v === 0));

  const byteLogits = nextByteLogits(logits, f.idToToken);
  check("per-byte logits cover 256 values", byteLogits.length === 256);
  let maxOk = true;
  for (let id = 0; id < logits.length; id++) {
    const bytes = tokenBytesOf(f.idToToken, id);
    if (bytes.length === 0) continue;
    if (logits[id] > byteLogits[bytes[0]]) maxOk = false;
  }
  check("each byte's logit is the strongest token route to that byte", maxOk);

  const tags = rankOf(slice);
  check("the reported rank is a permutation of 1..64", new Set(tags).size === 64 && Math.min(...tags) === 1 && Math.max(...tags) === 64);
  check("rank 1 is the largest value", tags[slice.indexOf(Math.max(...slice))] === 1);

  // The exploratory shift family is a rotation of the alphabet, in full.
  const shifted = shiftedSlice(slice, 1);
  check(
    "shifting the alphabet rotates it and conserves the mass",
    Math.abs(shifted.reduce((s, v) => s + v, 0) - slice.reduce((s, v) => s + v, 0)) < 1e-15 &&
      shifted.every((v, i) => v === slice[(i - 1 + 64) % 64])
  );
  check("the shift family is pre-registered and includes the identity", SHIFT_VARIANTS.includes(PRIMARY_SHIFT));
}

// ============================================================
// §9 — Correlation
// ============================================================

function testCorrelation(): void {
  console.log("\n  §9  correlation");
  const n = 64;
  const v = Array.from({ length: n }, (_, i) => i + 1);

  check("Spearman of an order-preserving affine map is exactly 1", spearman(v, v.map((x) => 3 * x + 7)) === 1);
  check("Spearman of a full reversal is exactly -1", spearman(v, [...v].reverse()) === -1);
  check("Spearman of a constant vector is 0 by definition, not -1", spearman(v, v.map(() => 5)) === 0);

  // Ties: the average rank is the pre-registered convention, and it is the
  // reason a fully-tied vector cannot manufacture an order out of index order.
  const mid = midrankOf([10, 10, 20, 20, 30]);
  check(
    "tied values receive the average of the ranks they span",
    mid[0] === 4.5 && mid[1] === 4.5 && mid[2] === 2.5 && mid[3] === 2.5 && mid[4] === 1,
    mid.join(",")
  );
  const mostlyTied = v.map((_, i) => (i === 63 ? 2 : 1));
  check("a mostly-tied vector compared with itself is exactly 1", spearman(mostlyTied, mostlyTied) === 1);
  check(
    "the tie policy is stated in the pre-registration",
    TIE_POLICY.toLowerCase().includes("average")
  );
  check(
    "an all-tied vector has zero rank variance",
    new Set(midrankOf(v.map(() => 5))).size === 1
  );

  // The midrank Spearman must agree with an independent implementation on the
  // whole permutation group of a small support. No hardcoded expectations.
  const m = 6;
  const base = Array.from({ length: m }, (_, i) => i);
  let worst = 0;
  let count = 0;
  const walk = (arr: number[], start: number): void => {
    if (start === arr.length) {
      count++;
      worst = Math.max(worst, Math.abs(spearman(base, arr) - spearmanClosedFormNoTies(base, arr)));
      return;
    }
    for (let i = start; i < arr.length; i++) {
      const next = [...arr];
      const t = next[start];
      next[start] = next[i];
      next[i] = t;
      walk(next, start + 1);
    }
  };
  walk(base, 0);
  check(`all ${count} permutations match the independent closed form`, count === 720 && worst < 1e-12, `worst=${worst}`);

  // Top-k overlap.
  const a = [5, 4, 3, 2, 1, 0];
  const bShared2 = [50, 40, 30, 2, 1, 0];
  check("top-k overlap of identical rankings is 1", topKOverlap(a, a, 3) === 1);
  check("top-k overlap of a fully shared top-2 is 1", topKOverlap(a, bShared2, 2) === 1);
  // a's top-3 is indices {0,1,2}; b's top-3 is {0,1,3} -> 2 of 3 shared.
  const bPartial = [5, 4, 2, 3, 1, 0];
  const k3 = topKOverlap(a, bPartial, 3);
  check("top-k overlap of a partly-shared top-3 is fractional", Math.abs(k3 - 2 / 3) < 1e-12, `${k3}`);
  check(
    "top-k overlap is bounded by [0, 1]",
    TOP_K_VALUES.every((k) => {
      const x = topKOverlap(a, bPartial, k);
      return x >= 0 && x <= 1;
    })
  );

  // Pearson over log-probability must refuse, not approximate.
  check(
    "Pearson over log-probability is null where a byte has zero probability",
    pearsonOverLog([0.5, 0.5, 0, 0], [0.5, 0.25, 0.25, 0.5]) === null &&
      pearsonOverLog([0.25, 0.25, 0.25, 0.25], [0.1, 0.2, 0.3, 0]) === null
  );
  check(
    "Pearson over log-probability is not silently replaced by 0 when it is undefined",
    pearsonOverLog([0.5, 0.5, 0, 0], [0.5, 0.25, 0.25, 0.5]) !== 0
  );
  const logRho = pearsonOverLog([0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25]);
  check("Pearson over log-probability is defined on a strictly positive pair", logRho !== null && Math.abs(logRho) < 1e-12);

  check(
    "Pearson is guarded against zero variance rather than returning NaN",
    pearson([1, 1, 1], [1, 2, 3]) === 0 && pearson([1, 2, 3], [7, 7, 7]) === 0
  );
}

// ============================================================
// §10 — Permutation null
// ============================================================

function testPermutationNull(): void {
  console.log("\n  §10  permutation null");

  check("the null is declared with a fixed count and seed", PERMUTATION_COUNT > 0 && PERMUTATION_SEED > 0);

  const p1 = permutationOf(64, PERMUTATION_SEED, 0);
  const p1b = permutationOf(64, PERMUTATION_SEED, 0);
  const p2 = permutationOf(64, PERMUTATION_SEED, 1);
  check("a permutation is a permutation", new Set(p1).size === 64 && p1.every((v) => v >= 0 && v < 64));
  check("the same (length, seed, iteration) gives the same permutation", p1.every((v, i) => v === p1b[i]));
  check("a different iteration gives a different permutation", p1.some((v, i) => v !== p2[i]));
  check(
    "the null is deterministic across the whole drawn set",
    permutationOf(64, PERMUTATION_SEED, 7).every((v, i) => v === permutationOf(64, PERMUTATION_SEED, 7)[i])
  );

  const pairs = [
    { p0: CONTINUATION_BYTES.map((_, i) => i + 1), p1: CONTINUATION_BYTES.map((_, i) => 64 - i) },
    { p0: CONTINUATION_BYTES.map((_, i) => (i % 7) + 1), p1: CONTINUATION_BYTES.map((_, i) => ((i * 3) % 64) + 1) },
  ];
  const nullA = permutationNull(pairs);
  const nullB = permutationNull(pairs);
  check("the interval is reproducible on a repeat run", nullA.intervalLower === nullB.intervalLower && nullA.intervalUpper === nullB.intervalUpper);
  check("the null mean is reproducible on a repeat run", nullA.nullMean === nullB.nullMean);
  check("the interval is ordered", nullA.intervalLower < nullA.intervalUpper);
  check("the null sample was kept for inspection", nullA.nullSample.length === 25);
  check("the null records the pre-registered aggregation", nullA.aggregation === AGGREGATION);
  check("the null min/max bracket the interval", nullA.nullMin <= nullA.intervalLower && nullA.nullMax >= nullA.intervalUpper);
  check(
    "the null is centred near zero, as a destroyed correspondence must be",
    Math.abs(nullA.nullMean) < 0.15,
    `${nullA.nullMean}`
  );

  const q = quantile([1, 2, 3, 4, 5], 0.5);
  check("the quantile helper interpolates", q === 3);
  check("the significance level is the conventional 0.05", Math.abs(SIGNIFICANCE_ALPHA - 0.05) < 1e-12);
}

// ============================================================
// §11 — Controls
// ============================================================

function testControls(probe: ProbeArtifact): void {
  console.log("\n  §11  controls");

  const cases = syntheticControls();
  check("every synthetic control passes", cases.every((c) => c.passed), cases.filter((c) => !c.passed).map((c) => c.name).join(","));
  check("the analytic cases declare their known rho", cases.some((c) => c.expectedRho === 1) && cases.some((c) => c.expectedRho === -1));
  check("the degenerate case declares rho 0", cases.some((c) => c.expectedRho === 0 && c.name.includes("degenerate")));
  check(
    "the exhaustive permutation control is present and exact to float tolerance",
    cases.some((c) => c.name === "exhaustive-permutation-closed-form" && Math.abs(c.observedRho) < 1e-12)
  );
  check("the artifact records the controls passing", probe.controlC.allPassed === true);
  check("the artifact's control cases agree with a fresh computation", probe.controlC.cases.every((c) => cases.some((f) => f.name === c.name && f.observedRho === c.observedRho)));

  check("Control A was built from intact P0 states", probe.controlA.stateCount > 0, `${probe.controlA.stateCount}`);
  check("Control B was built from real P0 -> P1 transitions", probe.controlB.stateCount > 0, `${probe.controlB.stateCount}`);
  check(
    "the controls aggregate over the same rule as the target",
    probe.controlA.aggregate.stateCount === probe.controlA.stateCount &&
      probe.controlB.aggregate.stateCount === probe.controlB.stateCount
  );
  check(
    "the control aggregates report the required metrics",
    TOP_K_VALUES.every((k) => String(k) in probe.controlA.aggregate.meanTopK) &&
      TOP_K_VALUES.every((k) => String(k) in probe.controlB.aggregate.meanTopK)
  );
}

// ============================================================
// §4/§14 — State reconstruction
// ============================================================

function testStateReconstruction(probe: ProbeArtifact, p102: Phase102ProbeView): void {
  console.log("\n  §4/§14  state reconstruction");

  check("the probe replayed only the P12-MASK condition", probe.reconstruction.replayedCondition === "P12-MASK");
  check(
    "the target set is the frozen Phase-102 P12 failure count",
    probe.reconstruction.targetStateCount === PHASE102_FROZEN.p0FailuresUnderP12 &&
      probe.reconstruction.expectedTargetStateCount === PHASE102_FROZEN.p0FailuresUnderP12,
    `${probe.reconstruction.targetStateCount}/${probe.reconstruction.expectedTargetStateCount}`
  );
  check("no Phase-102 reference was missing", probe.reconstruction.missingReferenceCount === 0);
  check("every recovered forward pass was bit-reproducible", probe.reconstruction.allForwardPassesReproducible);
  check("the forced-P1 construction was valid for every target", probe.reconstruction.forcedP1ConstructionValid);

  const recorded = p102.p0FailureStates.fromP12;
  check("Phase 102 recorded the same number of P0 failure states", recorded.length === probe.targetStates.length);
  const recLabels = [...recorded.map((r) => r.label)].sort();
  const gotLabels = [...probe.targetStates.map((s) => s.label)].sort();
  check(
    "the reconstructed labels are exactly the Phase-102 labels",
    recLabels.length === gotLabels.length && recLabels.every((l, i) => l === gotLabels[i]),
    `${recLabels.join("|")} vs ${gotLabels.join("|")}`
  );

  // The gate.
  check("the §14 parity gate passed", probe.parityGate.passed);
  check("the gate recorded no block", probe.parityGate.blocks.length === 0);
  check("the gate compared at tolerance 0", probe.parityGate.toleranceFloat === 0);
  check("the gate has one row per target", probe.parityGate.rows.length === probe.reconstruction.targetStateCount);
  check(
    "every gate row was matched to a Phase-102 reference",
    probe.parityGate.rows.every((r) => r.referenceFound)
  );
  check(
    "every gate row is true on all six compared quantities",
    probe.parityGate.rows.every(
      (r) =>
        r.argmaxIdMatches &&
        r.argmaxPMatch &&
        r.legalMassMatch &&
        r.continuationStartMassMatch &&
        r.prefixLengthMatch &&
        r.failureTokenIndexMatch
    )
  );
  check(
    "every gate float difference is exactly zero",
    probe.parityGate.rows.every(
      (r) => r.argmaxPMaxAbsDiff === 0 && r.legalMassMaxAbsDiff === 0 && r.continuationStartMassMaxAbsDiff === 0
    )
  );

  // Re-derive the parity of each target against the record it names, rather
  // than trusting the gate's own booleans.
  const byLabel = new Map(recorded.map((r) => [r.label, r]));
  let rederivedOk = true;
  let missing = 0;
  for (const s of probe.targetStates) {
    const ref = byLabel.get(s.label);
    if (!ref) {
      missing++;
      continue;
    }
    if (s.phase102Parity === null) {
      rederivedOk = false;
      continue;
    }
    const p = s.phase102Parity;
    if (
      !p.passed ||
      !p.argmaxIdMatches ||
      s.p0.rawArgmaxId !== ref.rawArgmaxId ||
      s.p0.prefixLength !== ref.prefixLength ||
      s.stepIndex !== ref.failureTokenIndex ||
      s.armKey !== ref.armKey ||
      s.prompt !== ref.prompt
    ) {
      rederivedOk = false;
    }
  }
  check("every target names a Phase-102 reference", missing === 0);
  check("every target re-derives its own parity against that reference", rederivedOk);

  // Per-state structure.
  check("every target carries 64 per-byte rows", probe.targetStates.every((s) => s.distributions.perByte.length === 64));
  check(
    "the per-byte rows are the continuation values in ascending order",
    probe.targetStates.every((s) => s.distributions.perByte.every((r, i) => r.byte === CONTINUATION_BYTES[i]))
  );
  check(
    "the per-byte rows reproduce the recorded continuation slices",
    probe.targetStates.every((s) =>
      s.distributions.perByte.every(
        (r, i) =>
          r.p0Probability === s.distributions.p0ContinuationFull[i] &&
          r.p1Probability === s.distributions.p1ContinuationFull[i]
      )
    )
  );
  check(
    "the per-byte rank column is a permutation of 1..64 on each side",
    probe.targetStates.every((s) => {
      const r0 = s.distributions.perByte.map((r) => r.p0Rank);
      const r1 = s.distributions.perByte.map((r) => r.p1Rank);
      return new Set(r0).size === 64 && new Set(r1).size === 64;
    })
  );
  check(
    "every target's P0 side is a character boundary",
    probe.targetStates.every((s) => s.distributions.p0.phase === "P0" && s.distributions.p0.need === 0)
  );
  check(
    "every target's forced-P1 side is P1 and recoverable",
    probe.targetStates.every(
      (s) => s.distributions.p1.phase === "P1" && s.distributions.p1.recoverable
    )
  );
  check(
    "every target records how many continuation bytes carry zero mass",
    probe.targetStates.every((s) => Array.isArray(s.distributions.p0.zeroContinuationBytes))
  );
  check(
    "the primary logits were left unmasked",
    probe.integrity.maskAppliedToPrimaryLogits === false && probe.targetStates.length > 0
  );
  check(
    "every target's exploratory shift family is reported in full",
    probe.targetStates.every(
      (s) =>
        s.shiftFamily.length === SHIFT_VARIANTS.length &&
        s.shiftFamily.every((e, i) => e.delta === SHIFT_VARIANTS[i])
    )
  );
  check(
    "the identity shift in the family IS the primary metric",
    probe.targetStates.every((s) => {
      const atZero = s.shiftFamily.find((e) => e.delta === PRIMARY_SHIFT);
      return atZero !== undefined && atZero.rho === s.metrics.spearmanContinuation;
    })
  );
}

// ============================================================
// §19 — Decision rules
// ============================================================

function fakeAggregate(meanRho: number, signConsistency: number): AggregateResult {
  return {
    stateCount: 10,
    meanRho,
    medianRho: meanRho,
    minRho: meanRho,
    maxRho: meanRho,
    positiveCount: Math.round(signConsistency * 10),
    negativeCount: 10 - Math.round(signConsistency * 10),
    zeroCount: 0,
    signConsistency,
    meanTopK: { "1": 0, "3": 0, "5": 0, "10": 0 },
    meanSpearmanLegalSubset: null,
    pearsonOverLogCount: 0,
  };
}

function fakeNull(lower: number, upper: number, mean: number): NullResult {
  return {
    aggregation: AGGREGATION,
    permutationCount: PERMUTATION_COUNT,
    permutationSeed: PERMUTATION_SEED,
    lowerQuantile: 0.025,
    upperQuantile: 0.975,
    intervalLower: lower,
    intervalUpper: upper,
    nullMean: mean,
    nullMin: lower - 0.05,
    nullMax: upper + 0.05,
    nullSample: [],
  };
}

function fakeRobustness(majorityPositive: boolean): LeadByteRobustness {
  return {
    leadByteCount: 51,
    pairs: [],
    meanRhoOverLeadBytes: majorityPositive ? 0.05 : -0.05,
    negativeLeadByteCount: majorityPositive ? 10 : 41,
    positiveLeadByteCount: majorityPositive ? 41 : 10,
    majoritySignIsPositive: majorityPositive,
  };
}

function testDecisionRules(): void {
  console.log("\n  §19  decision rules");

  const nullResult = fakeNull(-0.07, 0.07, 0.0004);

  const a = classify(fakeAggregate(0.5, 0.9), nullResult, fakeRobustness(true), []);
  check("above the interval with a consistent sign is A Strongly supported", a.classification === "A", a.label);
  check("A is labelled as pre-registered", a.label === "Strongly supported");

  const b = classify(fakeAggregate(0.03, 0.9), nullResult, fakeRobustness(true), []);
  check("positive but inside the interval is B Partially supported", b.classification === "B", b.label);
  check("B reports that it is inside the interval", b.withinNullInterval === true && b.aboveNullUpper === false);

  const bWeak = classify(fakeAggregate(0.03, 0.5), nullResult, fakeRobustness(true), []);
  check("B does not become A on sign consistency alone", bWeak.classification === "B");

  const c = classify(fakeAggregate(-0.02, 0.5), nullResult, fakeRobustness(false), []);
  check("a statistic at or below the null mean is C Refuted", c.classification === "C", c.label);
  check("C names the interval that refuted it", c.nullInterval[0] === -0.07 && c.nullInterval[1] === 0.07);

  const cBelow = classify(fakeAggregate(-0.4, 0.9), nullResult, fakeRobustness(false), []);
  check("a statistic below the interval lower bound is C, not D", cBelow.classification === "C");
  check("C records that it fell below the interval", cBelow.belowNullLower === true);

  const d = classify(fakeAggregate(0.5, 0.9), nullResult, fakeRobustness(false), []);
  check("above the interval but sign-reversing under the lead sweep is D Confounded", d.classification === "D", d.detail);
  check("D names the lead-byte count that confounded it", d.leadByteRobustness.negativeLeadByteCount > d.leadByteRobustness.positiveLeadByteCount);

  const e = classify(fakeAggregate(0.9, 1), nullResult, fakeRobustness(true), ["parity gate failed"]);
  check("a block short-circuits to E Blocked whatever the statistic", e.classification === "E", e.label);
  check("E keeps the block text", e.blocks.length === 1 && e.blocks[0] === "parity gate failed");
  check("E does not claim support", e.aboveNullUpper === false && e.withinNullInterval === true);

  // The aggregate rule itself.
  const agg = aggregateMetrics([
    { metrics: { spearmanContinuation: 1, topKOverlap: { "1": 1, "3": 1, "5": 1, "10": 1 }, spearmanContinuationLegalSubset: 1, pearsonOverLogProbability: null } },
    { metrics: { spearmanContinuation: -1, topKOverlap: { "1": 0, "3": 0, "5": 0, "10": 0 }, spearmanContinuationLegalSubset: null, pearsonOverLogProbability: 0.5 } },
  ] as unknown as StateAudit[]);
  check("the aggregate is the arithmetic mean of the per-state rho", agg.meanRho === 0 && agg.stateCount === 2);
  check("the aggregate counts both signs", agg.positiveCount === 1 && agg.negativeCount === 1);
  check("the aggregate rounds the sign consistency down to the shared fraction", Math.abs(agg.signConsistency - 0.5) < 1e-12);
  check("the aggregate averages top-k over states", agg.meanTopK["1"] === 0.5);
  check("the aggregate drops null legal-subset values rather than treating them as 0", agg.meanSpearmanLegalSubset === 1);
  check("the aggregate counts the defined Pearson-over-log states", agg.pearsonOverLogCount === 1);
}

// ============================================================
// Regression
// ============================================================

function testRegression(probe: ProbeArtifact, manifest: ManifestArtifact, p102: Phase102ProbeView): void {
  console.log("\n  regression");

  check("the Phase-102 artifact Phase 103 read is unchanged", probe.integrity.phase102Artifact.sha256Raw === sha256(P102_PROBE));
  check(
    "the manifest names the same Phase-102 artifact",
    manifest.sourcePhase102Artifact.sha256Raw === probe.integrity.phase102Artifact.sha256Raw
  );
  check(
    "the manifest's scientific digest of the Phase-102 artifact still reproduces",
    manifest.sourcePhase102Artifact.sha256Scientific === scientificDigestOf(P102_PROBE)
  );

  for (const ckpt of manifest.checkpointIdentifiers) {
    const file = path.join(ROOT, ckpt.path);
    check(`checkpoint ${ckpt.armKey} is unchanged`, fs.existsSync(file) && sha256(file) === ckpt.sha256, ckpt.path);
    check(
      `checkpoint ${ckpt.armKey} still matches the digest Phase 102 recorded`,
      probe.reconstruction.checkpointSha256[ckpt.armKey] === ckpt.sha256
    );
  }

  const currentProduction = probe.integrity.productionFileDigests;
  for (const [rel, digest] of Object.entries(currentProduction)) {
    check(`production file ${rel} is unchanged`, sha256(path.join(ROOT, rel)) === digest, rel);
  }
  check("the frozen production surfaces still match Phase 102", probe.integrity.productionFileDigestsMatchPhase102);
  if (p102.integrity.productionFileDigests) {
    check(
      "the digest set Phase 103 froze is the one Phase 102 froze",
      Object.entries(p102.integrity.productionFileDigests).every(
        ([rel, d]) => currentProduction[rel] === undefined || currentProduction[rel] === d
      )
    );
  } else {
    skip("Phase-102 production digest cross-check", "the Phase-102 artifact does not carry the digest map");
  }

  check("Phase 103 performed no training", probe.trainingPerformed === false && manifest.trainingPerformed === false);
  check("Phase 103 was read-only", probe.readOnly === true && manifest.readOnly === true);
  check("Phase 103 used no Math.random", probe.usesMathRandom === false);
  check("Phase 103 used no setTimeout", probe.usesSetTimeout === false);
  check("Phase 103 declares its integrity in one place", probe.integrity.writesOnlyItsOwnArtifacts === true);
  check(
    "no frozen surface is declared modified",
    probe.integrity.checkpointFilesModified === false &&
      probe.integrity.tokenizerModified === false &&
      probe.integrity.vocabularyModified === false &&
      probe.integrity.mergeTableModified === false &&
      probe.integrity.promptTextModified === false &&
      probe.integrity.generationSettingsModified === false &&
      probe.integrity.phase95EvaluatorModified === false &&
      probe.integrity.phase95ThresholdsModified === false &&
      probe.integrity.productionGenerationModified === false &&
      probe.integrity.decoderModified === false
  );

  // The instrument source must contain no nondeterministic or deferred CALL.
  // Comments are stripped first: the source documents in prose that it uses
  // none of these, and a scan that read its own disclaimer as a violation
  // would be measuring the wrong thing.
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const name of ["phase-symmetry-audit.ts", "probe.ts"]) {
    const code = stripComments(fs.readFileSync(path.join(ROOT, "experiments", "phase103", name), "utf8"));
    check(`the ${name} code calls no Math.random`, !/Math\.random\s*\(/.test(code));
    check(`the ${name} code calls no setTimeout`, !/setTimeout\s*\(/.test(code));
    check(`the ${name} code calls no setInterval`, !/setInterval\s*\(/.test(code));
  }
  // The INSTRUMENT — the part that computes the science — reads no wall clock
  // at all. The probe is allowed a duration counter, which is the single
  // volatile field excluded from its scientific digest.
  const instrumentCode = stripComments(
    fs.readFileSync(path.join(ROOT, "experiments", "phase103", "phase-symmetry-audit.ts"), "utf8")
  );
  check("the instrument code reads no wall clock", !/Date\.now\s*\(/.test(instrumentCode));

  // Nothing Phase-103-shaped may exist outside the experiment directory and
  // this suite. Production code must be untouched by the audit.
  const leaks: string[] = [];
  const scan = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(p);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const rel = path.relative(ROOT, p).replace(/\\/g, "/");
      if (rel.startsWith("experiments/")) continue;
      if (rel.startsWith("src/lib/minimind/research/tests/")) continue;
      if (rel.startsWith("src/lib/minimind/research/__tests__/")) continue;
      const text = fs.readFileSync(p, "utf8");
      if (/phase103|phase-103|Phase 103|PHASE103|p103/i.test(text)) leaks.push(rel);
    }
  };
  scan(path.join(ROOT, "src"));
  check("no Phase-103 identifier reached production code", leaks.length === 0, leaks.join(", "));

  // Phase-95 thresholds and the Level-4 definition must be untouched by this
  // phase: they are frozen surfaces every phase since 95 has had to preserve.
  // §2 forbids Phase 103 from adding any numeric bar of its own.
  const evaluatorDir = path.join(ROOT, "src", "lib", "minimind", "research", "capability-eval");
  const indexSrc = fs.readFileSync(path.join(evaluatorDir, "index.ts"), "utf8");

  let evaluatorNamesPhase103 = false;
  for (const name of fs.readdirSync(evaluatorDir)) {
    if (!name.endsWith(".ts")) continue;
    const text = fs.readFileSync(path.join(evaluatorDir, name), "utf8");
    if (/phase103|phase-103|Phase 103/i.test(text)) evaluatorNamesPhase103 = true;
  }
  check("the Phase-95 evaluator is untouched", !evaluatorNamesPhase103);
  check("the evaluator re-exports the Level-4 definitions it always did", /LEVEL4_GATE_CONDITIONS/.test(indexSrc));

  const levelsSrc = fs.readFileSync(path.join(evaluatorDir, "levels.ts"), "utf8");
  check(
    "the Level-4 gate is still exactly the three frozen conditions",
    levelsSrc.includes('"validUtf8TolerantRatio === 1"') &&
      levelsSrc.includes('"nonEmptyRatio === 1"') &&
      levelsSrc.includes('"collapsedRatio === 0"')
  );
  check(
    "the Level-4 definition still requires UTF-8 tolerance through the repaired gate",
    /LEVEL4_GATE_CONDITIONS[\s\S]{0,200}tolerant/.test(levelsSrc) || levelsSrc.includes("tolerant")
  );
  check("the capability-level file names no Phase-103 concept", !/phase103|Phase 103/i.test(levelsSrc));

  const utf8Src = fs.readFileSync(path.join(evaluatorDir, "utf8.ts"), "utf8");
  check(
    "the evaluator's byte-token boundary is unchanged",
    /BYTE_TOKEN_MIN_ID\s*=\s*4/.test(utf8Src) && /BYTE_TOKEN_MAX_ID\s*=\s*260/.test(utf8Src)
  );

  // Determinism of the tokenizer the whole phase stands on.
  const rebuilt = buildTokenizer(loadCorpus(), VOCAB_TARGET);
  const reconstituted = classifyVocabulary(rebuilt.getVocabulary().idToToken, rebuilt.vocabSize);
  check("the tokenizer rebuilds to the same vocabulary size", rebuilt.vocabSize === fx().tokenizerVocabSize);
  check(
    "the continuation-start id set is reproducible",
    continuationStartIdsOf(reconstituted).join(",") === continuationStartIdsOf(fx().vocab).join(",")
  );

  check(
    "the artifacts are declared in the manifest",
    manifest.artifacts.instrument === "experiments/phase103/phase-symmetry-audit.ts" &&
      manifest.artifacts.probe === "experiments/phase103/probe.ts" &&
      manifest.artifacts.report === "src/lib/minimind/research/PHASE103-BYTE-PHASE-SYMMETRY-REPORT.md"
  );
  check("the phase 102 events are still frozen prior evidence", PHASE102_FROZEN.baseCorruption === 12 && PHASE102_FROZEN.p12Corruption === 11 && PHASE102_FROZEN.p012Corruption === 0);
  check("the manifest declares a completed read-only run", manifest.status === "COMPLETE" && manifest.phase === 103);
}

// ============================================================
// Small local helpers — all of them delegate to the repository's own runtime.
// No new model runtime and no new tokenizer is created by this suite.
// ============================================================

let tokenizerCache: BPETokenizer | null = null;

function fxTokenizer(): BPETokenizer {
  if (tokenizerCache !== null) return tokenizerCache;
  tokenizerCache = buildTokenizer(loadCorpus(), VOCAB_TARGET);
  return tokenizerCache;
}

/** The same first-byte read the instrument performs, source-of-truth shared. */
function tokenBytesOf(idToToken: ReadonlyMap<number, string>, id: number): number[] {
  return tokenBytes(idToToken, id);
}

/** One forward pass through the frozen checkpoint, terminal position. */
function forward(prefixIds: readonly number[], model: TensorMiniMindModel): number[] {
  const tensor = Tensor.fromArray([[...prefixIds]]);
  const batch = Tensor.noGrad(() => model.forward(tensor).toArray()) as number[][][];
  return batch[0][prefixIds.length - 1];
}

// ============================================================
// Runner
// ============================================================

export function runPhase103Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("=".repeat(60));
  console.log("Phase 103 — Byte-Phase Symmetry Correlation Audit");
  console.log("=".repeat(60));

  const probe = readJson<ProbeArtifact>(P103_PATHS.probeResults);
  const manifest = readJson<ManifestArtifact>(P103_PATHS.manifest);
  const p102 = readJson<Phase102ProbeView>(P102_PROBE);

  try {
    testForcedP1Construction();
    testByteOffsetMapping();
    testDistributionExtraction();
    testCorrelation();
    testPermutationNull();
  } catch (err) {
    failed++;
    console.log(`    FAIL  instrument sections threw -- ${(err as Error).message}`);
  }

  if (probe === null) {
    skip("artifact-dependent sections", `missing ${P103_PATHS.probeResults}`);
  } else {
    try {
      testControls(probe);
      if (p102 === null) {
        skip("state reconstruction", "missing the Phase-102 artifact");
      } else {
        testStateReconstruction(probe, p102);
      }
    } catch (err) {
      failed++;
      console.log(`    FAIL  artifact sections threw -- ${(err as Error).message}`);
    }
  }

  try {
    testDecisionRules();
  } catch (err) {
    failed++;
    console.log(`    FAIL  decision sections threw -- ${(err as Error).message}`);
  }

  if (probe === null || manifest === null) {
    skip("regression", "missing the Phase-103 artifacts");
  } else {
    try {
      testRegression(probe, manifest, p102 ?? { p0FailureStates: { fromP12: [], fromBase: [] }, integrity: {} });
    } catch (err) {
      failed++;
      console.log(`    FAIL  regression sections threw -- ${(err as Error).message}`);
    }
  }

  console.log(`\n  Phase 103: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}
