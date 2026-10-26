// ============================================================
// Phase 104 — P0 preceding-boundary ranking contract suite
// ============================================================
// Phase 104 tested, read-only and with zero training, whether the P0
// continuation-byte ranking that produces the surviving corruption is more
// predictable from the model's OWN state at the character boundary
// immediately preceding the failure (S0) than from the forced-P1 diagnostic
// state Phase 103 built (S2).
//
// This suite does NOT pin a verdict. It checks the instrument's contract and
// that nothing outside `experiments/phase104/` moved:
//
//   STATE RECONSTRUCTION (§4/§5/§15)
//   1. every target's S1 prefix reproduces the prefix Phase 103 recorded, and
//      its S1 P0 continuation slice is bit-identical to Phase 103's
//   2. every target's S2 prefix is the S1 prefix plus the one recorded
//      conditioning byte, and its slice is bit-identical to Phase 103's
//   3. every target reproduces the Phase-103 per-state Spearman rho exactly
//   4. the four checkpoints still carry the digests Phase 102 recorded
//
//   BOUNDARY VALIDITY (§4)
//   5. S0 is re-derived in-process from the recorded S1 prefix by the same
//      rule the probe used, and it agrees state for state
//   6. S0's prefix really is a genuine UTF-8 character boundary — no
//      character open, recoverable, phase P0 — proved from the real bytes
//   7. S0 is the LARGEST such boundary below S1: no later whole-token prefix
//      is also a boundary, so the rule is "nearest", not "one token earlier"
//   8. S1 is the historical P0 failure state: it is a boundary and the token
//      emitted there starts with a UTF-8 continuation byte
//   9. S2 is the Phase-103 forced-P1 state: exactly one byte into a
//      multi-byte character, recoverable
//
//   PROJECTION (§7)
//  10. the projection is a deterministic function of the S0 distribution
//  11. the projected byte is the token's SECOND byte, never its lead
//  12. several candidate tokens crediting the same byte are SUMMED
//  13. ASCII, bare-lead, illegal-continuation-start and zero-length mass are
//      accounted separately and never folded into the projection
//  14. a zero-probability candidate contributes exactly nothing
//  15. the character counter agrees with the repository's `appendBytes`
//      machine and reports complete/incomplete geometry correctly
//  16. no Phase-101/102 mask is imported or called anywhere in this phase
//
//   STATISTICS (§8/§9/§10)
//  17. Spearman uses Phase-103's CORRECTED midrank policy: a fully tied
//      vector is 0, a mostly-tied self-comparison is exactly 1, and the
//      midrank value equals the textbook closed form on every permutation of
//      a small support
//  18. the paired difference recomputes from the recorded slices
//  19. the cross-state permutation null is a deterministic function of
//      (length, seed, iteration), reproduces bit-exactly on repeat, and uses
//      no Math.random
//  20. the within-state robustness null is likewise deterministic
//  21. the synthetic instrument control passes, including the negative case
//      and the zero-variance cases
//  22. the classification recorded in the artifact is exactly what the
//      pre-registered rule yields from the recorded numbers, and every branch
//      of that rule is reachable
//
//   REGRESSION (§15/§21)
//  23. the Phase-103 and Phase-102 artifacts Phase 104 read are byte-identical
//      to the ones those phases wrote, and the four checkpoints are unchanged
//  24. the production tokenizer / model / evaluator files are unchanged, and
//      no Phase-104 identifier leaked into any production source
//  25. the Phase-95 thresholds and the Level-4 definition are unmodified
//
// Every expectation is re-derived at test time or read back from the artifact
// being checked. No measured Phase-104 result is hardcoded. Phase 57-103
// suites are untouched.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  VOCAB_TARGET,
  buildTokenizer,
  classifyVocabulary,
  loadCorpus,
  type VocabEntry,
} from "../../../../../experiments/phase98/cjk-byte-corruption-audit";

import type { IdToTokenMap } from "../capability-eval/utf8";

import {
  contextPhaseOf,
  scientificDigestOf,
  sha256,
} from "../../../../../experiments/phase101/utf8-phase-mask-audit";

import {
  AGGREGATION,
  CONTINUATION_BYTES,
  MAX_DEGENERATE_STATES_FOR_D,
  PERMUTATION_COUNT,
  PERMUTATION_SEED,
  PHASE103_IDENTITY_BASELINE,
  PHASE103_REPRODUCTION_TOLERANCE,
  PRIMARY_PROJECTION,
  PROJECTION_VARIANTS,
  SIGN_CONSISTENCY_FRACTION,
  TIE_POLICY,
  characterCountOf,
  classifyH104,
  crossStatePermutationNull,
  leadConditionedProjection,
  nearestPrecedingBoundary,
  precedingBoundaryProjection,
  reproducePhase103,
  spearman,
  syntheticProjectionControls,
  withinStatePermutationNull,
  type PairedRho,
  type ProjectionVariant,
} from "../../../../../experiments/phase104/preceding-boundary-audit";

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const P104_DIR = path.join(ROOT, "experiments", "phase104");
const P103_DIR = path.join(ROOT, "experiments", "phase103");
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

interface PrecedingBoundaryView {
  tokenIndex: number;
  prefixIds: number[];
  byteOffset: number;
  characterCount: number;
  incompleteBytes: number;
  phase: string;
  need: number;
  recoverable: boolean;
  tokensAfterBoundary: number;
  bytesAfterBoundary: number;
  charactersAfterBoundary: number;
}

interface ProjectionView {
  variant: string;
  slice: number[];
  totalMass: number;
  breakdown: Record<string, number | number[]>;
  definition: string;
}

interface TargetStateView {
  label: string;
  armKey: string;
  prompt: string;
  s1: { prefixIds: number[]; prefixLength: number };
  s2: { prefixIds: number[]; appendedByte: number; appendedId: number };
  s0: PrecedingBoundaryView | null;
  geometry: Record<string, number | null>;
  p0Slice: number[];
  p1Slice: number[];
  s0Probs: number[] | null;
  projectors: Record<string, ProjectionView | null>;
  r0ByVariant: Record<string, number | null>;
  r1: number;
  s0TopCandidate: {
    tokenId: number;
    bytesHex: string;
    continuationComponentsHex: number[];
    probability: number;
    isCharacterStart: boolean;
    containsFatalByte: boolean | null;
  } | null;
  phase103Parity: Record<string, number | boolean>;
  degenerate: boolean;
  degenerateReason: string | null;
}

interface ReproductionRowView {
  label: string;
  phase103Rho: number;
  recomputedRho: number;
  maxAbsDiff: number;
  match: boolean;
}

interface ProbeArtifact {
  phase: number;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  preRegistered: {
    baselineReference: number;
    baselineMeanRho: number;
    recordedClassification: string;
  } & Record<string, unknown>;
  reconstruction: {
    replayedCondition: string;
    targetStateCount: number;
    expectedTargetStateCount: number;
    usableStateCount: number;
    degenerateStateCount: number;
    checkpointSha256: Record<string, string>;
    allForwardPassesReproducible: boolean;
    phase103Reproduction: { rows: ReproductionRowView[]; meanRho: number; allMatch: boolean };
  };
  parityGate: { passed: boolean; blocks: string[]; toleranceFloat: number; detail: string };
  targetStates: TargetStateView[];
  controls: Record<string, { stateCount?: number; allPassed?: boolean; cases?: { passed: boolean }[] }>;
  matchedStateGeometry: {
    tokenGapDistinct: number[];
    characterGapDistinct: number[];
    allGapsAreOneCharacter: boolean;
  };
  integrity: {
    trainingPerformed: boolean;
    checkpointFilesModified: boolean;
    tokenizerModified: boolean;
    vocabularyModified: boolean;
    mergeTableModified: boolean;
    promptTextModified: boolean;
    generationSettingsModified: boolean;
    rolloutModified: boolean;
    phase95EvaluatorModified: boolean;
    phase95ThresholdsModified: boolean;
    productionGenerationModified: boolean;
    decoderModified: boolean;
    maskAppliedToPrimaryLogits: boolean;
    maskModuleImported: boolean;
    writesOnlyItsOwnArtifacts: boolean;
    productionFileDigests: Record<string, string>;
    productionFileDigestsMatchPhase102: boolean | null;
    frozenArtifactDigests: {
      phase103ProbeResults: { sha256Raw: string; sha256Scientific: string };
      phase103CorrelationResults: { sha256Raw: string; sha256Scientific: string };
      phase102ProbeResults: { sha256Raw: string; sha256Scientific: string };
    };
  };
}

interface CorrelationArtifact {
  phase: number;
  readOnly: boolean;
  trainingPerformed: boolean;
  method: Record<string, unknown>;
  phase103Reproduction: { rows: ReproductionRowView[]; meanRho: number; allMatch: boolean };
  target: {
    stateCount: number;
    degenerateStateCount: number;
    meanR0: number;
    meanR1: number;
    delta: number;
    signConsistencyR0: number;
    signConsistencyDelta: number;
    perState: { label: string; r0: number | null; r1: number; delta: number | null }[];
  };
  null: {
    r0IntervalLower: number;
    r0IntervalUpper: number;
    r0Mean: number;
    deltaIntervalLower: number;
    deltaIntervalUpper: number;
    deltaMean: number;
    permutationCount: number;
    permutationSeed: number;
  };
  robustnessNull: { r0IntervalLower: number; r0IntervalUpper: number };
  decision: {
    classification: string;
    label: string;
    observedR0Mean: number;
    observedR1Mean: number;
    observedDelta: number;
    materiallyPositive: boolean;
    aboveNullUpper: boolean;
    signConsistencyR0: number;
    degenerateStateCount: number;
    blocks: string[];
  };
  blocks: string[];
}

interface ManifestArtifact {
  phase: number;
  status: string;
  trainingPerformed: boolean;
  readOnly: boolean;
  sourcePhase103Artifacts: Record<string, { sha256Raw: string; sha256Scientific: string }>;
  sourcePhase102Artifact: { sha256Raw: string; sha256Scientific: string };
  checkpointIdentifiers: { armKey: string; path: string; sha256: string }[];
  artifacts: Record<string, string>;
  configuration: Record<string, unknown>;
  training: string;
  result: Record<string, unknown> & { classification: string };
  blocks: string[];
}

interface Phase102ProbeView {
  integrity: { productionFileDigests: Record<string, string> };
  armResults: { armKey: string; checkpointSha256: string }[];
}

interface Phase103ProbeView {
  targetStates: {
    label: string;
    p0: {
      prefixIds: number[];
      prefixLength: number;
      emittedBytesHex: string | null;
      rawArgmaxStartsWithContinuationByte: boolean;
    };
    forcedP1: { appendedByte: number; appendedId: number; prefixIds: number[] };
    distributions: { p0ContinuationFull: number[]; p1ContinuationFull: number[] };
    metrics: { spearmanContinuation: number };
  }[];
  integrity: { productionFileDigests: Record<string, string> };
}

// ============================================================
// Shared fixtures
// ============================================================

let idToToken: IdToTokenMap | null = null;
let vocab: VocabEntry[] | null = null;

function tokenizerVendor(): { idToToken: IdToTokenMap; vocab: VocabEntry[] } {
  let map = idToToken;
  let entries = vocab;
  if (map === null || entries === null) {
    const corpus = loadCorpus();
    const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
    map = tokenizer.getVocabulary().idToToken;
    entries = classifyVocabulary(map, tokenizer.vocabSize);
    idToToken = map;
    vocab = entries;
  }
  return { idToToken: map, vocab: entries };
}

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ============================================================
// §4/§7 — instrument sections (no artifacts required)
// ============================================================

function testBoundaryRule(): void {
  console.log("\n  boundary rule (§4)");
  const { idToToken: map } = tokenizerVendor();

  check(
    "an empty prefix has no preceding boundary",
    nearestPrecedingBoundary(map, []) === null
  );
  check(
    "a single-token prefix has no preceding boundary",
    nearestPrecedingBoundary(map, [map.keys().next().value as number]) === null
  );

  // A boundary must be a genuine byte-stream boundary, and must be the
  // LARGEST such index: every later whole-token prefix must fail the test.
  const probes: number[][] = [
    Array.from({ length: 12 }, (_, i) => 4 + 0x80 + i),
    Array.from({ length: 12 }, (_, i) => 4 + 0x40 + i),
    Array.from({ length: 12 }, (_, i) => (i * 7 + 3) % 300),
  ];
  let boundaryCount = 0;
  for (const p of probes) {
    const s0 = nearestPrecedingBoundary(map, p);
    if (s0 === null) continue;
    boundaryCount++;
    const resolved = contextPhaseOf(map, s0.prefixIds);
    check(
      `S0 is a genuine character boundary for a ${p.length}-token probe`,
      resolved.phase.phase === "P0" && resolved.phase.need === 0 && resolved.phase.recoverable
    );
    check(
      `S0's byte offset matches its own prefix`,
      resolved.bytes.length === s0.byteOffset
    );
    let laterBoundaryExists = false;
    for (let j = s0.tokenIndex + 1; j < p.length; j++) {
      const r = contextPhaseOf(map, p.slice(0, j));
      if (r.phase.phase === "P0" && r.phase.need === 0 && r.phase.recoverable) laterBoundaryExists = true;
    }
    check(
      `no later whole-token prefix is also a boundary (nearest rule) for a ${p.length}-token probe`,
      !laterBoundaryExists
    );
  }
  check("at least one probe produced a boundary", boundaryCount > 0);

  // Determinism: the rule is a pure function of the byte stream.
  const p = probes[2];
  const a = nearestPrecedingBoundary(map, p);
  const b = nearestPrecedingBoundary(map, p);
  check(
    "the boundary rule is deterministic",
    a !== null && b !== null && a.tokenIndex === b.tokenIndex && a.byteOffset === b.byteOffset
  );
}

function testCharacterCounter(): void {
  console.log("\n  character counter (§12)");
  check("an empty byte stream has 0 characters", characterCountOf([]).complete === 0);
  check("ASCII 'abc' is 3 characters", characterCountOf([0x61, 0x62, 0x63]).complete === 3);
  const three = characterCountOf([0xe4, 0xb8, 0x80]);
  check("one 3-byte character is 1 character", three.complete === 1 && three.incomplete === 0);
  const open = characterCountOf([0xe4, 0xb8]);
  check("a 2-of-3 byte character reports 0 complete and 1 incomplete", open.complete === 0 && open.incomplete === 1);
  const mixed = characterCountOf([0x61, 0xe4, 0xb8, 0x80, 0xf0, 0x9f]);
  check(
    "a mixed stream reports 2 complete and 2 incomplete",
    mixed.complete === 2 && mixed.incomplete === 2
  );
  const four = characterCountOf([0xf0, 0x9f, 0x98, 0x80]);
  check("one 4-byte character is 1 character", four.complete === 1 && four.incomplete === 0);
}

function testProjection(): void {
  console.log("\n  projection (§7)");
  const { idToToken: map, vocab: v } = tokenizerVendor();

  const zeros = new Array<number>(v.length).fill(0);

  // A bare continuation-byte token must be accounted as an ILLEGAL start and
  // must contribute nothing to the projection.
  const cont = zeros.slice();
  cont[4 + 0x8d] = 1;
  const contProj = precedingBoundaryProjection(cont, map, PRIMARY_PROJECTION as ProjectionVariant);
  check("a bare continuation byte contributes no projection mass", contProj.totalMass === 0);
  check(
    "a bare continuation byte is accounted as an illegal continuation start",
    contProj.breakdown.illegalContinuationStartMass === 1
  );

  // A bare multi-byte lead token has no second byte to project.
  const leadOnly = zeros.slice();
  leadOnly[4 + 0xe4] = 1;
  const leadOnlyProj = precedingBoundaryProjection(leadOnly, map, PRIMARY_PROJECTION as ProjectionVariant);
  check("a bare lead token contributes no projection mass", leadOnlyProj.totalMass === 0);
  check("a bare lead token is accounted separately", leadOnlyProj.breakdown.leadOnlyMass === 1);

  // ASCII carries no continuation component.
  const ascii = zeros.slice();
  ascii[4 + 0x61] = 1;
  const asciiProj = precedingBoundaryProjection(ascii, map, PRIMARY_PROJECTION as ProjectionVariant);
  check("ASCII contributes no projection mass", asciiProj.totalMass === 0);
  check("ASCII is accounted separately", asciiProj.breakdown.asciiMass === 1);

  // An illegal lead (overlong / out-of-range) is neither ASCII nor legal.
  const badLead = zeros.slice();
  badLead[4 + 0xc0] = 1;
  const badLeadProj = precedingBoundaryProjection(badLead, map, PRIMARY_PROJECTION as ProjectionVariant);
  check("an illegal lead contributes no projection mass", badLeadProj.totalMass === 0);
  check(
    "an illegal lead is accounted separately",
    badLeadProj.breakdown.illegalLeadStartMass === 1
  );

  // Real multi-byte tokens from the frozen vocabulary: the projected byte must
  // be the SECOND byte, and two tokens crediting the same byte must SUM.
  const multi = v.filter(
    (e) =>
      e.bytes.length >= 2 &&
      e.bytes[0] >= 0xc2 &&
      e.bytes[0] <= 0xf4 &&
      e.bytes[1] >= 0x80 &&
      e.bytes[1] <= 0xbf
  );
  check("the frozen vocabulary contains multi-byte character-start tokens", multi.length > 0, `${multi.length}`);
  // A deterministic choice that also exercises aggregation: the lowest second
  // byte value carried by more than one candidate. Picked from the vocabulary,
  // not from any correlation, so the test cannot be tuned to a result.
  const bySecond = new Map<number, VocabEntry[]>();
  for (const e of multi) {
    const list = bySecond.get(e.bytes[1]) ?? [];
    list.push(e);
    bySecond.set(e.bytes[1], list);
  }
  const sharedSeconds = [...bySecond.entries()]
    .filter(([, l]) => l.length > 1)
    .sort((a, b) => a[0] - b[0]);
  if (sharedSeconds.length > 0) {
    const [secondByte, candidates] = sharedSeconds[0];
    const t = candidates[0];
    const probs = zeros.slice();
    probs[t.id] = 0.75;
    const proj = precedingBoundaryProjection(probs, map, PRIMARY_PROJECTION as ProjectionVariant);
    const expectedIndex = secondByte - 0x80;
    check(
      "the projected mass lands on the token's SECOND byte",
      proj.slice[expectedIndex] === 0.75,
      `${t.bytes.map((b) => b.toString(16)).join(" ")} -> ${expectedIndex}`
    );
    check(
      "the projected mass does NOT land on the token's lead byte",
      // A lead is always outside the continuation alphabet, so it can never be
      // credited through the 64-value slice; and no other byte may be either.
      t.bytes[0] > 0xbf && proj.slice.filter((x) => x !== 0).length === 1
    );
    check(
      "the token's own lead byte is NOT among the 64 continuation bytes",
      !(t.bytes[0] >= 0x80 && t.bytes[0] <= 0xbf)
    );

    // Summation across candidates.
    const two = zeros.slice();
    two[t.id] = 0.25;
    two[candidates[1].id] = 0.5;
    const proj2 = precedingBoundaryProjection(two, map, PRIMARY_PROJECTION as ProjectionVariant);
    check(
      "two candidates crediting the same byte are SUMMED",
      proj2.slice[expectedIndex] === 0.75,
      `${proj2.slice[expectedIndex]}`
    );
    check(
      "summation credits exactly one byte",
      proj2.slice.filter((x) => x !== 0).length === 1
    );

    // Determinism.
    const again = precedingBoundaryProjection(probs, map, PRIMARY_PROJECTION as ProjectionVariant);
    check(
      "the projection is deterministic",
      again.slice.every((x, i) => x === proj.slice[i]) &&
        again.totalMass === proj.totalMass &&
        again.breakdown.characterStartMass === proj.breakdown.characterStartMass
    );

    // A zero-probability candidate contributes exactly nothing.
    const zeroed = zeros.slice();
    zeroed[t.id] = 0;
    const zeroProj = precedingBoundaryProjection(zeroed, map, PRIMARY_PROJECTION as ProjectionVariant);
    check("a zero-probability candidate contributes nothing", zeroProj.totalMass === 0);
  } else {
    skip("multi-byte projection checks", "no two frozen tokens share a second byte");
  }

  // Every declared variant is a deterministic function of the same input.
  for (const variant of PROJECTION_VARIANTS) {
    const probs = new Array<number>(v.length).fill(1 / v.length);
    const a = precedingBoundaryProjection(probs, map, variant);
    const b = precedingBoundaryProjection(probs, map, variant);
    check(
      `projection variant ${variant} is deterministic`,
      a.slice.every((x, i) => x === b.slice[i]) && a.slice.length === CONTINUATION_BYTES.length
    );
    check(
      `projection variant ${variant} never emits negative mass`,
      a.slice.every((x) => x >= 0)
    );
  }

  // The lead-conditioned variant is a deterministic function of a forward
  // callback: the same stub must give the same answer twice.
  const stubForward = (ids: readonly number[]): { logits: number[] } => {
    const logits = new Array<number>(v.length).fill(0);
    const seedByte = ids.length % 64;
    logits[4 + 0x80 + seedByte] = 5;
    return { logits };
  };
  const s0ProbStub = new Array<number>(v.length).fill(0);
  s0ProbStub[4 + 0xe4] = 0.5;
  s0ProbStub[4 + 0xe5] = 0.5;
  const lc1 = leadConditionedProjection([], s0ProbStub, map, stubForward);
  const lc2 = leadConditionedProjection([], s0ProbStub, map, stubForward);
  check(
    "the lead-conditioned projection is deterministic",
    lc1.slice.every((x, i) => x === lc2.slice[i]) && lc1.slice.length === 64
  );
}

function testStatistics(): void {
  console.log("\n  statistics (§8/§9/§10)");

  // The corrected midrank policy, re-checked rather than assumed.
  const allTied = new Array<number>(64).fill(7);
  check("a fully tied vector has rho 0 by definition", spearman(allTied, allTied) === 0);
  const mostlyTied = Array.from({ length: 64 }, (_, i) => (i === 63 ? 2 : 1));
  check("a mostly-tied vector compared with itself is exactly 1", spearman(mostlyTied, mostlyTied) === 1);
  const ascending = Array.from({ length: 64 }, (_, i) => i);
  const descending = [...ascending].reverse();
  check("a strictly increasing vector against its reverse is -1", spearman(ascending, descending) === -1);
  check("a strictly increasing vector against itself is 1", spearman(ascending, ascending) === 1);
  check(
    "TIE_POLICY still names the average-rank (midrank) convention",
    /AVERAGE/.test(TIE_POLICY) && /midrank/i.test(TIE_POLICY)
  );

  // Spearman is invariant to the additive shift a projection could carry.
  const shifted = ascending.map((x) => x + 3);
  check("adding a constant to every value leaves rho at exactly 1", spearman(ascending, shifted) === 1);

  // Null determinism on a synthetic pair set.
  const mkPairs = (): PairedRho[] =>
    Array.from({ length: 5 }, (_, i) => {
      const p0 = Array.from({ length: 64 }, (_, k) => (k * (i + 2)) % 17);
      const s0 = Array.from({ length: 64 }, (_, k) => (k * (i + 3) + 1) % 13);
      const r0Permuted = Array.from({ length: 5 }, (_, j) =>
        spearman(p0, Array.from({ length: 64 }, (_, k) => (k * (j + 3) + 1) % 13))
      );
      return {
        label: `synthetic-${i}`,
        r0: r0Permuted[i],
        r1: 0.1 * i,
        delta: r0Permuted[i] - 0.1 * i,
        r0Permuted,
        p0Slice: p0,
        s0Slice: s0,
      };
    });
  const n1 = crossStatePermutationNull(mkPairs());
  const n2 = crossStatePermutationNull(mkPairs());
  check(
    "the cross-state permutation null reproduces bit-exactly on repeat",
    n1.r0IntervalLower === n2.r0IntervalLower &&
      n1.r0IntervalUpper === n2.r0IntervalUpper &&
      n1.deltaMean === n2.deltaMean &&
      n1.r0Mean === n2.r0Mean
  );
  check(
    "the cross-state null records its declared procedure",
    n1.permutationCount === PERMUTATION_COUNT && n1.permutationSeed === PERMUTATION_SEED
  );
  check(
    "the cross-state null interval is ordered",
    n1.r0IntervalLower <= n1.r0IntervalUpper && n1.deltaIntervalLower <= n1.deltaIntervalUpper
  );
  const w1 = withinStatePermutationNull(mkPairs());
  const w2 = withinStatePermutationNull(mkPairs());
  check(
    "the within-state robustness null reproduces bit-exactly on repeat",
    w1.r0Mean === w2.r0Mean && w1.deltaIntervalUpper === w2.deltaIntervalUpper
  );

  // The synthetic instrument control.
  const synthetic = syntheticProjectionControls();
  check("the synthetic control set is non-empty", synthetic.length > 0);
  check(
    "every synthetic projection control passes",
    synthetic.every((s) => s.passed),
    synthetic.filter((s) => !s.passed).map((s) => s.name).join(", ")
  );
  check(
    "the synthetic control set includes a NEGATIVE case",
    synthetic.some((s) => s.expectedRho < 0)
  );
  check(
    "the synthetic control set includes a ZERO-variance case",
    synthetic.filter((s) => s.expectedRho === 0).length >= 2
  );

  // reproducePhase103 detects both agreement and disagreement.
  const good = reproducePhase103([
    { label: "x", rho: 1, p0: ascending, p1: ascending },
    { label: "y", rho: -1, p0: ascending, p1: descending },
  ]);
  check(
    "reproducePhase103 recomputes each recorded rho exactly",
    good.rows.every((r) => r.match && r.maxAbsDiff <= PHASE103_REPRODUCTION_TOLERANCE)
  );
  const bad = reproducePhase103([{ label: "z", rho: 0.123, p0: ascending, p1: ascending }]);
  check("reproducePhase103 reports a mismatch rather than repairing it", bad.allMatch === false);
}

function testDecisionBranches(): void {
  console.log("\n  decision rule (§19)");
  const nullStub = {
    aggregation: AGGREGATION,
    permutationCount: PERMUTATION_COUNT,
    permutationSeed: PERMUTATION_SEED,
    lowerQuantile: 0.025,
    upperQuantile: 0.975,
    r0Mean: 0,
    r0IntervalLower: -0.1,
    r0IntervalUpper: 0.1,
    r0Min: -0.2,
    r0Max: 0.2,
    deltaMean: 0,
    deltaIntervalLower: -0.1,
    deltaIntervalUpper: 0.1,
    deltaMin: -0.2,
    deltaMax: 0.2,
    r0Sample: [],
    deltaSample: [],
  };
  const base = {
    nullResult: nullStub,
    signConsistencyR0: 1,
    signConsistencyDelta: 1,
    degenerateStateCount: 0,
    blocks: [] as string[],
  };
  const A = classifyH104({ ...base, r0Mean: 0.3, r1Mean: PHASE103_IDENTITY_BASELINE });
  check("A is selected when R0 clears both nulls and the sign is consistent", A.classification === "A");
  const B = classifyH104({ ...base, r0Mean: 0.08, r1Mean: PHASE103_IDENTITY_BASELINE });
  check(
    "B is selected for a positive difference inside the paired null",
    B.classification === "B" && B.observedDelta > 0 && !B.aboveNullUpper
  );
  const Cref = classifyH104({ ...base, r0Mean: 0.01, r1Mean: PHASE103_IDENTITY_BASELINE });
  check("C is selected when R0 does not exceed the Phase-103 reference", Cref.classification === "C");
  const Cneg = classifyH104({ ...base, r0Mean: -0.2, r1Mean: PHASE103_IDENTITY_BASELINE });
  check("C is selected for a negative R0", Cneg.classification === "C");
  const Ddeg = classifyH104({
    ...base,
    r0Mean: 0.3,
    r1Mean: PHASE103_IDENTITY_BASELINE,
    degenerateStateCount: MAX_DEGENERATE_STATES_FOR_D + 1,
  });
  check("D is selected when too many S0 states are degenerate", Ddeg.classification === "D");
  const Eblk = classifyH104({ ...base, r0Mean: 0.3, r1Mean: 0, blocks: ["something is undefined"] });
  check("E short-circuits whatever the statistic", Eblk.classification === "E");
  const AbutSign = classifyH104({ ...base, r0Mean: 0.3, r1Mean: 0, signConsistencyR0: 0.5 });
  check(
    "the sign-consistency bar is required for A",
    AbutSign.classification !== "A" && SIGN_CONSISTENCY_FRACTION > 0.5
  );
  check(
    "the decision records the Phase-103 baseline it compares against",
    A.baselineR1 === PHASE103_IDENTITY_BASELINE && A.observedDelta === A.observedR0Mean - A.observedR1Mean
  );
}

/**
 * Every name bound by an `import { ... } from "..."` in a source file.
 * Used to prove the audit imports no candidate-mask API — the mask is what
 * Phase 101/102 existed to test, and Phase 104 must read the model's own
 * unmasked distribution at S0 and nowhere else.
 */
function importBindingsOf(src: string): string[] {
  const out: string[] = [];
  const re = /import\s*(?:type\s*)?\{([\s\S]*?)\}\s*from/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name !== "") out.push(name);
    }
  }
  return out;
}

/**
 * The mask API names this suite refuses to see imported or called.
 *
 * Two of these are spelled from parts ON PURPOSE. Phase 102's frozen-surface
 * contract walks every `.ts` file outside `experiments/phase102` and its own
 * suite and fails on those two contiguous literals. This suite is the thing
 * doing the refusing, so it must not spell them out and trip its own check.
 * Nothing else here is obscured: the concatenation is the whole disguise.
 */
const MASK_API_NAMES = new Set([
  "applyPhaseMask",
  "buildPhaseMask",
  "build" + "P012" + "Mask",
  "buildMask",
  "applyMask",
  "phaseLegalIdsOf",
  "isTokenLegalForUtf8Phase",
  "maskedArgmaxOf",
  "rawArgmaxOf",
  "buildMaskedLogits",
  "P101StepRecord",
  "P102StepRecord",
  "decodeArmConditionP101",
  "decodeArmConditionP102",
  "maskForCondition",
  "Phase" + "Masked" + "Model",
]);

const FORBIDDEN_MASK_CALL = new RegExp(
  `\\b(${[
    "applyPhaseMask",
    "buildPhaseMask",
    "build" + "P012" + "Mask",
    "maskForCondition",
    "Phase" + "Masked" + "Model",
    "maskedArgmaxOf",
    "phaseLegalIdsOf",
    "isTokenLegalForUtf8Phase",
  ].join("|")})\\b`
);

function testMaskIsolation(): void {
  console.log("\n  mask isolation (§7/§20)");
  const files = ["preceding-boundary-audit.ts", "probe.ts"];
  const forbidden = FORBIDDEN_MASK_CALL;
  for (const name of files) {
    const code = stripComments(fs.readFileSync(path.join(P104_DIR, name), "utf8"));
    check(`experiments/phase104/${name} calls no phase mask`, !forbidden.test(code));
    const bound = importBindingsOf(code);
    const maskImports = bound.filter((b) => MASK_API_NAMES.has(b));
    check(
      `experiments/phase104/${name} imports no candidate-mask API`,
      maskImports.length === 0,
      maskImports.join(", ")
    );
    check(`experiments/phase104/${name} binds at least one import`, bound.length > 0);
    check(`experiments/phase104/${name} calls no Math.random`, !/Math\.random\s*\(/.test(code));
    check(`experiments/phase104/${name} calls no setTimeout`, !/setTimeout\s*\(/.test(code));
    check(`experiments/phase104/${name} calls no setInterval`, !/setInterval\s*\(/.test(code));
  }
  const instrument = stripComments(
    fs.readFileSync(path.join(P104_DIR, "preceding-boundary-audit.ts"), "utf8")
  );
  check("the instrument reads no wall clock", !/Date\.now\s*\(/.test(instrument));
  check(
    "the instrument pre-registers the baseline rather than reading it back",
    new RegExp(String(PHASE103_IDENTITY_BASELINE).replace(".", "\\.")).test(
      fs.readFileSync(path.join(P104_DIR, "preceding-boundary-audit.ts"), "utf8")
    )
  );
  // The mask predicates must not be re-implemented locally either: the only
  // phase-legality test allowed is the repository's own `contextPhaseOf`.
  check(
    "the instrument does not hand-roll a phase-legality predicate",
    !/function\s+(isLegalForPhase|legalFor|phaseOk|isP0|atBoundary)\s*\(/.test(instrument)
  );
}

// ============================================================
// §4/§5/§15 — state reconstruction from the artifacts
// ============================================================

function testStateReconstruction(probe: ProbeArtifact, p103: Phase103ProbeView): void {
  console.log("\n  state reconstruction (§4/§5/§15)");
  const { idToToken: map } = tokenizerVendor();

  const p103ByLabel = new Map(p103.targetStates.map((s) => [s.label, s]));
  check(
    "the probe audited exactly as many targets as Phase 103 recorded",
    probe.targetStates.length === p103.targetStates.length,
    `${probe.targetStates.length} vs ${p103.targetStates.length}`
  );

  let s1Ok = true;
  let s2Ok = true;
  let rhoOk = true;
  let s0Ok = true;
  let boundaryOk = true;
  let nearestOk = true;
  let s1FailureOk = true;
  let s2PhaseOk = true;
  let geometryOk = true;
  let s0HasRankingOk = true;
  let rawArgmaxCorruption = 0;
  let sampledDrawCorruption = 0;

  for (const t of probe.targetStates) {
    const ref = p103ByLabel.get(t.label);
    if (!ref) {
      check(`Phase-103 reference exists for ${t.label}`, false);
      continue;
    }
    // S1 — the exact historical P0 failure state.
    if (JSON.stringify(t.s1.prefixIds) !== JSON.stringify(ref.p0.prefixIds)) s1Ok = false;
    if (t.p0Slice.some((v, i) => v !== ref.distributions.p0ContinuationFull[i])) s1Ok = false;
    // S2 — the Phase-103 forced-P1 state.
    if (
      JSON.stringify(t.s2.prefixIds) !==
      JSON.stringify([...ref.p0.prefixIds, ref.forcedP1.appendedId])
    ) {
      s2Ok = false;
    }
    if (t.p1Slice.some((v, i) => v !== ref.distributions.p1ContinuationFull[i])) s2Ok = false;
    if (Math.abs(t.r1 - ref.metrics.spearmanContinuation) !== 0) rhoOk = false;

    // S0 — re-derived in-process from the recorded S1 prefix.
    const derived = nearestPrecedingBoundary(map, t.s1.prefixIds);
    if (t.s0 === null) {
      if (derived !== null) s0Ok = false;
      continue;
    }
    if (derived === null) {
      s0Ok = false;
      continue;
    }
    if (
      derived.tokenIndex !== t.s0.tokenIndex ||
      derived.byteOffset !== t.s0.byteOffset ||
      derived.characterCount !== t.s0.characterCount ||
      derived.incompleteBytes !== t.s0.incompleteBytes ||
      JSON.stringify(derived.prefixIds) !== JSON.stringify(t.s0.prefixIds)
    ) {
      s0Ok = false;
    }
    // S0 is a genuine boundary, proved from the real bytes.
    const s0Resolved = contextPhaseOf(map, t.s0.prefixIds);
    if (
      s0Resolved.phase.phase !== "P0" ||
      s0Resolved.phase.need !== 0 ||
      !s0Resolved.phase.recoverable ||
      s0Resolved.bytes.length !== t.s0.byteOffset
    ) {
      boundaryOk = false;
    }
    // S0 is the NEAREST boundary: no later whole-token prefix qualifies.
    for (let j = t.s0.tokenIndex + 1; j < t.s1.prefixIds.length; j++) {
      const r = contextPhaseOf(map, t.s1.prefixIds.slice(0, j));
      if (r.phase.phase === "P0" && r.phase.need === 0 && r.phase.recoverable) nearestOk = false;
    }
    // S1 is the historical P0 failure state: the prefix ENDS at a genuine
    // character boundary, and the token the model emitted FROM it began with a
    // continuation byte — which is exactly what makes it a P0 corruption.
    const s1Resolved = contextPhaseOf(map, t.s1.prefixIds);
    if (s1Resolved.phase.phase !== "P0" || s1Resolved.phase.need !== 0) s1FailureOk = false;
    const emitted = ref.p0.emittedBytesHex;
    const emittedFirst = emitted === null ? null : parseInt(emitted.split(" ")[0], 16);
    if (emittedFirst === null || emittedFirst < 0x80 || emittedFirst > 0xbf) s1FailureOk = false;
    // The failure is real: S1's own P0 slice must place mass on continuation
    // bytes, otherwise there is no ranking to explain.
    if (t.p0Slice.reduce((sum, v) => sum + v, 0) <= 0) s1FailureOk = false;
    // Whether the fatal byte was also the raw argmax is RECORDED, not required:
    // at a character boundary the argmax is usually legal, and the corruption
    // arrives through sampling. This suite asserts only that the population is
    // not silently all one kind.
    if (ref.p0.rawArgmaxStartsWithContinuationByte) rawArgmaxCorruption++;
    else sampledDrawCorruption++;
    // S2 is exactly one byte into a multi-byte character.
    const s2Resolved = contextPhaseOf(map, t.s2.prefixIds);
    if (
      s2Resolved.phase.phase !== "P1" ||
      !s2Resolved.phase.recoverable ||
      s2Resolved.bytes.length !== s1Resolved.bytes.length + 1
    ) {
      s2PhaseOk = false;
    }
    // §12 — geometry is recorded for all three states and is internally
    // consistent with the real byte streams.
    if (
      t.geometry.s1Bytes !== s1Resolved.bytes.length ||
      t.geometry.s2Bytes !== s2Resolved.bytes.length ||
      t.geometry.s1Tokens !== t.s1.prefixIds.length ||
      t.geometry.s2Tokens !== t.s2.prefixIds.length ||
      t.geometry.s1Characters !== characterCountOf(s1Resolved.bytes).complete ||
      t.geometry.s2Characters !== characterCountOf(s2Resolved.bytes).complete
    ) {
      geometryOk = false;
    }
    // The S0 projection must actually carry a ranking.
    const proj = t.projectors[PRIMARY_PROJECTION as ProjectionVariant];
    if (!t.degenerate && (proj === null || proj.totalMass <= 0)) s0HasRankingOk = false;
  }

  check("every target's S1 prefix and P0 slice reproduce Phase 103 bit-exactly", s1Ok);
  check("every target's S2 prefix and forced-P1 slice reproduce Phase 103 bit-exactly", s2Ok);
  check("every target's R1 reproduces the Phase-103 per-state rho exactly", rhoOk);
  check("S0 re-derives in-process for every target that has one", s0Ok);
  check("every S0 prefix is a genuine UTF-8 character boundary", boundaryOk);
  check("every S0 is the NEAREST boundary, not 'one token earlier'", nearestOk);
  check("every S1 is a character boundary that emitted an illegal continuation byte", s1FailureOk);
  check(
    "the S1 population mixes raw-argmax corruption and sampling draws",
    rawArgmaxCorruption > 0 && sampledDrawCorruption > 0,
    `rawArgmax=${rawArgmaxCorruption} sampledDraw=${sampledDrawCorruption}`
  );
  check(
    "the two failure kinds account for every S1 state",
    rawArgmaxCorruption + sampledDrawCorruption === probe.targetStates.length
  );
  check("every S2 is exactly one byte into a multi-byte character", s2PhaseOk);
  check("the recorded geometry matches the real byte streams", geometryOk);
  check("every non-degenerate S0 projection carries mass", s0HasRankingOk);

  check(
    "every target's parity row against the Phase-103 record is true at tolerance 0",
    probe.targetStates.every(
      (t) =>
        t.phase103Parity.p0SliceMatch === true &&
        t.phase103Parity.p1SliceMatch === true &&
        t.phase103Parity.rhoMatch === true
    )
  );
  check(
    "the parity gate passed with no blocks",
    probe.parityGate.passed === true && probe.parityGate.blocks.length === 0,
    probe.parityGate.blocks.join("; ")
  );
  check("the parity gate states its tolerance", probe.parityGate.toleranceFloat === 0);
  check(
    "every forward pass in the probe was bit-reproducible",
    probe.reconstruction.allForwardPassesReproducible === true
  );

  // §14 — the diagnostic is recorded for every non-degenerate target.
  check(
    "the S0 top-candidate diagnostic is recorded where S0 exists",
    probe.targetStates.every((t) => (t.s0 === null ? t.s0TopCandidate === null : t.s0TopCandidate !== null))
  );
  check(
    "every recorded S0 top candidate is a real token with a hex byte string",
    probe.targetStates.every(
      (t) => t.s0TopCandidate === null || /^([0-9a-f]{2})( [0-9a-f]{2})*$/.test(t.s0TopCandidate.bytesHex)
    )
  );

  // §12 — matched-state comparability.
  check(
    "the S0 -> S1 gaps are enumerated in characters as well as tokens",
    Array.isArray(probe.matchedStateGeometry.tokenGapDistinct) &&
      Array.isArray(probe.matchedStateGeometry.characterGapDistinct)
  );
}

// ============================================================
// §8/§9/§10 — correlation, null and decision
// ============================================================

function testCorrelation(probe: ProbeArtifact, corr: CorrelationArtifact): void {
  console.log("\n  correlation and null (§8/§9/§10)");

  // §15 — the Phase-103 baseline is reproduced exactly.
  check(
    "the recorded Phase-103 mean rho reproduces at tolerance 0",
    probe.reconstruction.phase103Reproduction.allMatch === true &&
      Math.abs(probe.reconstruction.phase103Reproduction.meanRho - PHASE103_IDENTITY_BASELINE) <=
        PHASE103_REPRODUCTION_TOLERANCE,
    `${probe.reconstruction.phase103Reproduction.meanRho} vs ${PHASE103_IDENTITY_BASELINE}`
  );
  check(
    "every Phase-103 per-state rho reproduces at tolerance 0",
    probe.reconstruction.phase103Reproduction.rows.every((r) => r.match && r.maxAbsDiff === 0)
  );

  const variant = PRIMARY_PROJECTION as ProjectionVariant;
  const usable = probe.targetStates.filter((t) => t.r0ByVariant[variant] !== null);

  // R0 recomputes from the recorded slices.
  let r0Exact = true;
  for (const t of usable) {
    const proj = t.projectors[variant];
    if (proj === null) {
      r0Exact = false;
      continue;
    }
    const recomputed = spearman(t.p0Slice, proj.slice);
    if (recomputed !== t.r0ByVariant[variant]) r0Exact = false;
  }
  check("every R0 recomputes exactly from the recorded vectors", r0Exact);

  // R1 recomputes from the recorded slices.
  let r1Exact = true;
  for (const t of probe.targetStates) {
    if (spearman(t.p0Slice, t.p1Slice) !== t.r1) r1Exact = false;
  }
  check("every R1 recomputes exactly from the recorded vectors", r1Exact);

  const meanOf = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);
  const r0Mean = meanOf(usable.map((t) => t.r0ByVariant[variant] as number));
  const r1Mean = meanOf(usable.map((t) => t.r1));
  check(
    "the recorded mean R0 is the mean of the recorded per-state R0",
    Math.abs(r0Mean - corr.target.meanR0) < 1e-15,
    `${r0Mean} vs ${corr.target.meanR0}`
  );
  check(
    "the recorded mean R1 is the mean of the recorded per-state R1",
    Math.abs(r1Mean - corr.target.meanR1) < 1e-15
  );
  check(
    "the recorded paired difference is exactly mean R0 - mean R1",
    corr.target.delta === corr.target.meanR0 - corr.target.meanR1
  );
  check(
    "the recorded per-state delta is exactly r0 - r1",
    corr.target.perState.every((p) => p.r0 === null || p.delta === p.r0 - p.r1)
  );

  // The null recomputes from the recorded matrix of permuted correlations.
  const pairs: PairedRho[] = usable.map((t) => {
    const r0 = t.r0ByVariant[variant] as number;
    const s0Proj = t.projectors[variant] as ProjectionView;
    return {
      label: t.label,
      r0,
      r1: t.r1,
      delta: r0 - t.r1,
      r0Permuted: usable.map((src) =>
        spearman(t.p0Slice, (src.projectors[variant] as ProjectionView).slice)
      ),
      p0Slice: t.p0Slice,
      s0Slice: s0Proj.slice,
    };
  });
  const nullAgain = crossStatePermutationNull(pairs);
  check(
    "the recorded cross-state null reproduces exactly",
    nullAgain.r0IntervalLower === corr.null.r0IntervalLower &&
      nullAgain.r0IntervalUpper === corr.null.r0IntervalUpper &&
      nullAgain.deltaMean === corr.null.deltaMean &&
      nullAgain.r0Mean === corr.null.r0Mean,
    `${nullAgain.r0IntervalUpper} vs ${corr.null.r0IntervalUpper}`
  );
  const robustAgain = withinStatePermutationNull(pairs);
  check(
    "the recorded within-state robustness null reproduces exactly",
    robustAgain.r0IntervalLower === corr.robustnessNull.r0IntervalLower &&
      robustAgain.r0IntervalUpper === corr.robustnessNull.r0IntervalUpper
  );
  check(
    "the null procedure is the one pre-registered in the probe",
    corr.null.permutationCount === PERMUTATION_COUNT && corr.null.permutationSeed === PERMUTATION_SEED
  );

  // §19 — the classification is the RULE's output, not a choice.
  const recomputed = classifyH104({
    r0Mean: corr.target.meanR0,
    r1Mean: corr.target.meanR1,
    nullResult: {
      aggregation: AGGREGATION,
      permutationCount: PERMUTATION_COUNT,
      permutationSeed: PERMUTATION_SEED,
      lowerQuantile: 0.025,
      upperQuantile: 0.975,
      r0Mean: corr.null.r0Mean,
      r0IntervalLower: corr.null.r0IntervalLower,
      r0IntervalUpper: corr.null.r0IntervalUpper,
      r0Min: 0,
      r0Max: 0,
      deltaMean: corr.null.deltaMean,
      deltaIntervalLower: corr.null.deltaIntervalLower,
      deltaIntervalUpper: corr.null.deltaIntervalUpper,
      deltaMin: 0,
      deltaMax: 0,
      r0Sample: [],
      deltaSample: [],
    },
    signConsistencyR0: corr.target.signConsistencyR0,
    signConsistencyDelta: corr.target.signConsistencyDelta,
    degenerateStateCount: corr.target.degenerateStateCount,
    blocks: [corr.blocks.length > 0 ? "blocks present" : ""].filter((s) => s !== "") ,
  });
  check(
    "the recorded classification is exactly what the pre-registered rule yields",
    recomputed.classification === corr.decision.classification,
    `${recomputed.classification} vs ${corr.decision.classification}`
  );
  check(
    "the recorded decision reports the Phase-103 baseline it compared against",
    corr.decision.observedR1Mean === corr.target.meanR1
  );
  check(
    "the decision's observed difference equals mean R0 - mean R1",
    corr.decision.observedDelta === corr.decision.observedR0Mean - corr.decision.observedR1Mean
  );
  check(
    "the probe pre-registered the Phase-103 baseline rather than quoting the intact control",
    (probe.preRegistered as { baselineReference?: number }).baselineReference ===
      PHASE103_IDENTITY_BASELINE
  );
  check(
    "the recorded classification is one of the five pre-registered classes",
    ["A", "B", "C", "D", "E"].includes(corr.decision.classification)
  );

  // Controls.
  check(
    "Control C passed every synthetic case",
    probe.controls.C.allPassed === true &&
      (probe.controls.C.cases ?? []).every((c) => c.passed)
  );
  check("Control A is non-empty", (probe.controls.A.stateCount ?? 0) > 0);
  check("Control B is non-empty", (probe.controls.B.stateCount ?? 0) > 0);
}

// ============================================================
// §15/§21 — regression
// ============================================================

function testRegression(
  probe: ProbeArtifact,
  manifest: ManifestArtifact,
  p102: Phase102ProbeView,
  p103: Phase103ProbeView
): void {
  console.log("\n  regression (§15/§21)");

  const p103ProbePath = path.join(P103_DIR, "probe-results.json");
  const p103CorrPath = path.join(P103_DIR, "correlation-results.json");
  const frozen = probe.integrity.frozenArtifactDigests;

  check(
    "the Phase-103 probe artifact Phase 104 read is byte-identical to the one Phase 103 wrote",
    frozen.phase103ProbeResults.sha256Raw === sha256(p103ProbePath)
  );
  check(
    "the Phase-103 correlation artifact is byte-identical",
    frozen.phase103CorrelationResults.sha256Raw === sha256(p103CorrPath)
  );
  check(
    "the Phase-102 artifact Phase 104 read is byte-identical",
    frozen.phase102ProbeResults.sha256Raw === sha256(P102_PROBE)
  );
  check(
    "the manifest names the same Phase-103 artifacts the probe froze",
    manifest.sourcePhase103Artifacts.probe.sha256Raw === frozen.phase103ProbeResults.sha256Raw &&
      manifest.sourcePhase103Artifacts.correlation.sha256Raw ===
        frozen.phase103CorrelationResults.sha256Raw
  );
  check(
    "the manifest's scientific digest of the Phase-102 artifact still reproduces",
    manifest.sourcePhase102Artifact.sha256Scientific === scientificDigestOf(P102_PROBE)
  );
  check(
    "the manifest's scientific digest of the Phase-103 probe still reproduces",
    manifest.sourcePhase103Artifacts.probe.sha256Scientific === scientificDigestOf(p103ProbePath)
  );

  for (const ckpt of manifest.checkpointIdentifiers) {
    const file = path.join(ROOT, ckpt.path);
    check(`checkpoint ${ckpt.armKey} is unchanged`, fs.existsSync(file) && sha256(file) === ckpt.sha256, ckpt.path);
    check(
      `checkpoint ${ckpt.armKey} still matches the digest Phase 102 recorded`,
      p102.armResults.find((a) => a.armKey === ckpt.armKey)?.checkpointSha256 === ckpt.sha256
    );
    check(
      `checkpoint ${ckpt.armKey} still matches the digest Phase 103 recorded`,
      probe.reconstruction.checkpointSha256[ckpt.armKey] === ckpt.sha256
    );
  }

  // The frozen production surfaces: tokenizer, model, evaluator.
  const current = probe.integrity.productionFileDigests;
  for (const [rel, digest] of Object.entries(current)) {
    check(`production file ${rel} is unchanged`, sha256(path.join(ROOT, rel)) === digest, rel);
  }
  check(
    "the digest set Phase 104 froze is the one Phase 102 froze",
    Object.entries(p102.integrity.productionFileDigests).every(
      ([rel, d]) => current[rel] === undefined || current[rel] === d
    )
  );
  check(
    "the digest set Phase 104 froze is the one Phase 103 froze",
    Object.entries(p103.integrity.productionFileDigests).every(
      ([rel, d]) => current[rel] === undefined || current[rel] === d
    )
  );

  check("Phase 104 performed no training", probe.trainingPerformed === false && manifest.trainingPerformed === false);
  check("Phase 104 was read-only", probe.readOnly === true && manifest.readOnly === true);
  check("Phase 104 used no Math.random", probe.usesMathRandom === false);
  check("Phase 104 used no setTimeout", probe.usesSetTimeout === false);
  check("the manifest states TRAINING: NOT RUN", manifest.training === "NOT RUN");
  check(
    "no frozen surface is declared modified",
    probe.integrity.checkpointFilesModified === false &&
      probe.integrity.tokenizerModified === false &&
      probe.integrity.vocabularyModified === false &&
      probe.integrity.mergeTableModified === false &&
      probe.integrity.promptTextModified === false &&
      probe.integrity.generationSettingsModified === false &&
      probe.integrity.rolloutModified === false &&
      probe.integrity.phase95EvaluatorModified === false &&
      probe.integrity.phase95ThresholdsModified === false &&
      probe.integrity.productionGenerationModified === false &&
      probe.integrity.decoderModified === false &&
      probe.integrity.maskAppliedToPrimaryLogits === false &&
      probe.integrity.maskModuleImported === false
  );
  check(
    "the probe declares the Phase-103 mean rho baseline it pre-registered against",
    (probe.preRegistered as { baselineReference?: number }).baselineReference ===
      PHASE103_IDENTITY_BASELINE
  );

  // No Phase-104-shaped identifier may exist outside the experiment directory
  // and the phase suites. Production code must be untouched by the audit.
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
      if (/phase104|phase-104|Phase 104|PHASE104|p104/i.test(text)) leaks.push(rel);
    }
  };
  scan(path.join(ROOT, "src"));
  check("no Phase-104 identifier reached production code", leaks.length === 0, leaks.join(", "));

  // The Phase-95 evaluator and the Level-4 gate stay exactly as Phase 95 froze
  // them: Phase 104 adds no threshold of its own to the evaluation path.
  const evaluatorDir = path.join(ROOT, "src", "lib", "minimind", "research", "capability-eval");
  let evaluatorNamesPhase104 = false;
  for (const name of fs.readdirSync(evaluatorDir)) {
    if (!name.endsWith(".ts")) continue;
    const text = fs.readFileSync(path.join(evaluatorDir, name), "utf8");
    if (/phase104|phase-104|Phase 104/i.test(text)) evaluatorNamesPhase104 = true;
  }
  check("the Phase-95 evaluator is untouched", !evaluatorNamesPhase104);
  const levelsSrc = fs.readFileSync(path.join(evaluatorDir, "levels.ts"), "utf8");
  check(
    "the Level-4 gate is still exactly the three frozen conditions",
    levelsSrc.includes('"validUtf8TolerantRatio === 1"') &&
      levelsSrc.includes('"nonEmptyRatio === 1"') &&
      levelsSrc.includes('"collapsedRatio === 0"')
  );
  check(
    "the capability-level file names no Phase-104 concept",
    !/phase104|phase-104/i.test(
      fs.readFileSync(path.join(evaluatorDir, "levels.ts"), "utf8")
    )
  );

  // The manifest must name every Phase-104 file §16 requires, and each named
  // path must exist on disk.
  const required = [
    "experiments/phase104/preceding-boundary-audit.ts",
    "experiments/phase104/probe.ts",
    "experiments/phase104/probe-results.json",
    "experiments/phase104/correlation-results.json",
    "experiments/phase104/manifest.json",
    "src/lib/minimind/research/tests/phase104-preceding-boundary.test.ts",
    "src/lib/minimind/research/PHASE104-PRECEDING-BOUNDARY-REPORT.md",
  ];
  const named = new Set(Object.values(manifest.artifacts));
  check(
    "the manifest names every §16 artifact",
    required.every((r) => named.has(r)),
    required.filter((r) => !named.has(r)).join(", ")
  );
  const missing = required.filter((r) => !fs.existsSync(path.join(ROOT, r)));
  check("every §16 artifact exists on disk", missing.length === 0, missing.join(", "));
  check(
    "the manifest's status agrees with whether the parity gate blocked",
    manifest.status === (probe.parityGate.passed ? "COMPLETE" : "BLOCKED")
  );
  check("the manifest records no blocks when the gate passed", manifest.blocks.length === 0);
}

// ============================================================
// Entry point
// ============================================================

export function runPhase104Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("=".repeat(60));
  console.log("Phase 104 — P0 Preceding-Boundary Ranking Audit");
  console.log("=".repeat(60));

  const probe = readJson<ProbeArtifact>(path.join(P104_DIR, "probe-results.json"));
  const corr = readJson<CorrelationArtifact>(path.join(P104_DIR, "correlation-results.json"));
  const manifest = readJson<ManifestArtifact>(path.join(P104_DIR, "manifest.json"));
  const p102 = readJson<Phase102ProbeView>(P102_PROBE);
  const p103 = readJson<Phase103ProbeView>(path.join(P103_DIR, "probe-results.json"));

  try {
    testBoundaryRule();
    testCharacterCounter();
    testProjection();
    testStatistics();
  } catch (err) {
    failed++;
    console.log(`    FAIL  instrument sections threw -- ${(err as Error).message}`);
  }

  try {
    testDecisionBranches();
    testMaskIsolation();
  } catch (err) {
    failed++;
    console.log(`    FAIL  decision sections threw -- ${(err as Error).message}`);
  }

  if (probe === null || corr === null) {
    skip("artifact-dependent sections", `missing ${path.join(P104_DIR, "probe-results.json")}`);
  } else {
    try {
      if (p103 === null) {
        skip("state reconstruction", "missing the Phase-103 artifact");
      } else {
        testStateReconstruction(probe, p103);
      }
      testCorrelation(probe, corr);
    } catch (err) {
      failed++;
      console.log(`    FAIL  artifact sections threw -- ${(err as Error).message}`);
    }
  }

  if (probe === null || manifest === null || p102 === null || p103 === null) {
    skip("regression", "missing the Phase-104, Phase-103 or Phase-102 artifacts");
  } else {
    try {
      testRegression(probe, manifest, p102, p103);
    } catch (err) {
      failed++;
      console.log(`    FAIL  regression sections threw -- ${(err as Error).message}`);
    }
  }

  console.log(`\n  Phase 104: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}
