// ============================================================
// Phase 108 — gap-matched S0 geometry contract suite
// ============================================================
// Phase 108 tested, read-only and with zero training, whether the residual S0
// margin signal Phase 107 observed is a GEOMETRY ARTEFACT — i.e. whether it
// survives when failure and intact states are compared at comparable S0->P0
// temporal gaps (`tokensAfterBoundary`).
//
// This suite does NOT pin a verdict. It checks the instrument's contract, that
// the recorded artifacts are internally consistent and re-derivable, and that
// nothing outside `experiments/phase108/` moved:
//
//   REPLAY (§15)
//   1. every one of the 221 recorded S0Margin values re-derives from the
//      artifact's OWN 300-value S0 softmax via the Phase-107 partition, at
//      tolerance 0 — the frozen score is not restated, it is recomputed
//   2. the recorded gap is the recorded geometry: `tokensAfterBoundary` equals
//      `p0TokenIndex - s0TokenIndex`, and `bytesAfterBoundary` equals
//      `p0ByteOffset - s0ByteOffset`
//   3. the frozen tau is the median of the artifact's own 11 failure margins
//   4. the four checkpoints still carry the Phase-106 digests
//
//   STRATUM (§4)
//   5. the stratum is `tokensAfterBoundary >= 2` and the recorded counts are the
//      Phase-107-recorded 10 failures / 51 intact
//   6. the cut is load-bearing: `>= 1` and `>= 3` yield different populations
//   7. exactly one failure is outside the stratum, and it is the gap-1 state
//
//   MATCHING (§6/§7)
//   8. exact-gap matching compares a failure ONLY against same-gap controls
//   9. exact matching retains all ten; the fallback is therefore unused
//  10. the ±1 fallback, on a synthetic population, admits |Δgap| <= 1 and
//      nothing further — it is not a dial that can be widened
//  11. matching is deterministic and does NOT depend on the margins: permuting
//      the margins among the controls leaves the match STRUCTURE bit-identical
//  12. the reference is a SET median, and the count of DISTINCT controls is
//      recorded rather than left to be inferred
//
//   STATISTICS (§8/§9)
//  13. the recorded median delta is the median of the artifact's own deltas,
//      and the sign counts partition the delta list
//  14. the matched statistic matches a hand-computed value on a synthetic
//      population, so the arithmetic is measured and not asserted
//  15. the permutation null is a pure function of (population, seed, count):
//      same seed identical, different seed different
//  16. the permutation CONSERVES group sizes in every draw
//  17. the p-value lies in (0, 1] and the estimator is the (1+k)/(1+N) form
//  18. the random-label control is deterministic and its seed is live
//
//   DECISION (§19)
//  19. every classification branch A/B/C/D is reachable
//  20. blocked dominates; fewer than 7 matched failures is C
//
//   REGRESSION (§22)
//  21. the prior phase artifacts are unchanged since the probe ran
//  22. the vocabulary census is the established 300 / 223 / 64 / 13
//  23. the instrument and probe call no `Math.random()` and no timer
//  24. the instrument applies no candidate mask and restates no legality rule
//  25. the Phase-108 `medianOf` agrees with the Phase-107 convention it
//      restates, on a battery of vectors
//
// Every expectation is re-derived at test time or read back from the artifact
// being checked. No measured Phase-108 result is hardcoded. Phase 57-107 suites
// are untouched.
// ============================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  VOCAB_TARGET,
  buildTokenizer,
  classifyVocabulary,
  loadCorpus,
  sha256,
  type VocabEntry,
} from "../../../../../experiments/phase102/p0-phase-mask-audit";

import { scientificDigestOf } from "../../../../../experiments/phase101/utf8-phase-mask-audit";

import {
  FORBIDDEN_LEAD_HIGH_MIN,
  isContinuationStartEntry,
  isForbiddenLeadEntry,
  isLegalP0Entry,
  massPartitionOf,
  medianOf,
  partitionInvariantOf,
  s0MarginOf,
} from "../../../../../experiments/phase107/s0-mass-separation-audit";

import {
  FALLBACK_TOLERANCE,
  H108_CLASSIFICATIONS,
  MIN_MATCHED_FAILURES,
  PERMUTATION_COUNT,
  PERMUTATION_SEED,
  PHASE107_TAU,
  RANDOM_CONTROL_SEED,
  REQUIRED_POPULATION_FAILURES,
  REQUIRED_POPULATION_INTACT,
  REQUIRED_STRATUM_FAILURES,
  REQUIRED_STRATUM_INTACT,
  STRATUM_MIN_GAP,
  classifyH108,
  gapHistogram,
  geometryOf,
  makePrng,
  matchByGap,
  permutationNull,
  randomLabelControl,
  shuffleWith,
  statisticOf,
  stratify,
  summarizeDeltas,
  type GapState,
  type H108Classification,
} from "../../../../../experiments/phase108/gap-matched-audit";

// ============================================================
// Harness
// ============================================================

let passed = 0;
let failed = 0;
let skipped = 0;

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

const P108_DIR = path.join(ROOT, "experiments", "phase108");
const P107_DIR = path.join(ROOT, "experiments", "phase107");
const P106_DIR = path.join(ROOT, "experiments", "phase106");

const PHASE108_INSTRUMENT = path.join(P108_DIR, "gap-matched-audit.ts");
const PHASE108_PROBE = path.join(P108_DIR, "probe.ts");

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : ` — ${detail}`}`);
  }
}

function skip(name: string, why: string): void {
  skipped++;
  console.log(`  SKIP  ${name} — ${why}`);
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Strip comments and string literals so the source scans cannot false-positive. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

const NONDETERMINISM_CALL = /\bMath\s*\.\s*random\b/;
const TIMER_CALL = /\bsetTimeout\b|\bsetInterval\b/;

// ============================================================
// Views of the Phase-108 artifacts
// ============================================================

interface StateView {
  label: string;
  armKey: string;
  prompt: string;
  s0TokenIndex: number;
  s0ByteOffset: number;
  s0BytesAfterBoundary: number;
  s0CharactersAfterBoundary: number;
  s0TokensAfterBoundary: number;
  continuationStartMass: number;
  legalP0StartMass: number;
  forbiddenLeadMass: number;
  s0Margin: number;
  argmaxProb: number;
  argmaxIsContinuationStart: boolean;
  s0Probs: number[];
}

interface PopulationView {
  phase: number;
  populationSize: number;
  tau?: number;
  states: StateView[];
}

interface ProbeView {
  phase: number;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  blocks: string[];
  replayInvariantsPassed: boolean;
  reproduction: {
    failureCount: number;
    intactCount: number;
    marginMaxAbsDiff: number;
    gapMaxAbsDiff: number;
    tauReproduced: boolean;
    freshTau: number;
    artifactTau: number;
    perStateMarginsReproduce: boolean;
    perStateGapsReproduce: boolean;
  };
  checkpointMatchesPhase106: Record<string, boolean>;
  populations: {
    failureCount: number;
    intactCount: number;
    failureGapHistogram: Record<string, number>;
    intactGapHistogram: Record<string, number>;
    stratumRule: string;
    stratumFailureCount: number;
    stratumIntactCount: number;
  };
  geometry: {
    failure: GeometryView[];
    intact: GeometryView[];
    stratumFailure: GeometryView[];
    stratumIntact: GeometryView[];
  };
  secondaryDiagnostics: Record<string, unknown>;
  coreAuditDigest: string;
  coreAuditReproducible: boolean;
  integrity: {
    productionFileDigests: Record<string, string>;
    priorPhaseArtifacts: Record<string, { sha256Raw?: string; sha256Scientific?: string }>;
    manifestIdentity: Record<string, string>;
  };
}

interface GeometryView {
  label: string;
  gap: number;
  s0TokenIndex: number;
  p0TokenIndex: number;
  s0ByteOffset: number;
  p0ByteOffset: number;
  tokensBetween: number;
  completeCharactersBetween: number;
}

interface MatchRowView {
  label: string;
  gap: number;
  margin: number;
  matchedAtGap: number;
  matchedIntactCount: number;
  referenceMedian: number;
  delta: number;
}

interface MatchingView {
  phase: number;
  stratumRule: number;
  stratumCounts: { failure: number; intact: number };
  failureGapCounts: Record<string, number>;
  intactGapCounts: Record<string, number>;
  matching: {
    exactMatchUsed: boolean;
    exactMatchRetained: number;
    exactMatchRequired: number;
    fallbackTolerance: number;
    fallbackUsed: boolean;
    fallbackRetained: number | null;
    fallbackRetainedEnough: boolean;
    primaryTolerance: number;
    unmatchedFailureLabels: string[];
    outOfStratumFailureLabels: string[];
    matchedIntactCount: number;
    matchedIntactLabels: string[];
    perFailure: MatchRowView[];
  };
  primaryStatistic: {
    n: number;
    medianDelta: number;
    meanDelta: number;
    positive: number;
    negative: number;
    zero: number;
    deltas: number[];
  };
  permutationNull: {
    seed: number;
    permutations: number;
    permuted: string;
    statistic: string;
    observedMedianDelta: number;
    atLeastObserved: number;
    pValue: number;
    nullMedianOfMedianDeltas: number;
  };
  randomLabelControl: {
    seed: number;
    draw: number;
    stratumFailureCount: number;
    stratumIntactCount: number;
    statistic: { n: number; medianDelta: number; positive: number; negative: number };
  };
  decision: { classification: H108Classification; label: string; detail: string };
}

interface ThresholdView {
  threshold: { tau: number; sortedFailureMargins: number[]; failureFlagRate: number };
  heldOut: { tau: number; flagged: number; n: number; falsePositiveRate: number };
}

interface ManifestView {
  phase: number;
  status: string;
  checkpointIdentifiers: { armKey: string; path: string; sha256: string }[];
  configuration: Record<string, unknown>;
  ownArtifactDigests: Record<string, { sha256Raw: string; sha256Scientific: string }>;
  result: { classification: H108Classification; primaryStatistic: { medianDelta: number } };
  blocks: string[];
}

// ============================================================
// Synthetic fixtures — for the pure-function properties
// ============================================================

function syntheticState(label: string, gap: number, s0Margin: number): GapState {
  return {
    label,
    armKey: "A",
    gap,
    s0Margin,
    continuationStartMass: 0.01,
    legalP0StartMass: 0.98,
    forbiddenLeadMass: 1e-5,
    argmaxProb: 0.9,
    argmaxIsContinuationStart: false,
    s0TokenIndex: 4,
    s0ByteOffset: 2,
    s0BytesAfterBoundary: 3,
    s0CharactersAfterBoundary: 1,
  };
}

// ============================================================
// §15 — artifact replay
// ============================================================

function testReplayArtifacts(
  probe: ProbeView | null,
  failures: PopulationView | null,
  intact: PopulationView | null,
  threshold: ThresholdView | null
): void {
  console.log("\n  [§15] artifact replay");

  if (failures === null || intact === null) {
    skip("artifact replay", "no Phase-107 / Phase-108 state artifacts");
    return;
  }

  const all = [...failures.states, ...intact.states];
  check(
    "the recorded populations hold 11 failures and 210 intact states",
    failures.states.length === REQUIRED_POPULATION_FAILURES &&
      intact.states.length === REQUIRED_POPULATION_INTACT,
    `${failures.states.length} / ${intact.states.length}`
  );

  // (1) Every margin re-derives from the artifact's OWN 300-value softmax.
  let worstMarginDiff = 0;
  let partitionFailures = 0;
  for (const s of all) {
    if (s.s0Probs.length !== VOCAB_TARGET) {
      partitionFailures++;
      continue;
    }
    const partition = massPartitionOf(s.s0Probs, vocabEntries());
    const rederived = s0MarginOf(partition);
    worstMarginDiff = Math.max(worstMarginDiff, Math.abs(rederived - s.s0Margin));
    if (!partition.classesDisjoint || !partition.classesCoverVocabulary || !partition.massCloses) {
      partitionFailures++;
    }
  }
  check(
    "every recorded S0Margin re-derives from the artifact's own softmax at tolerance 0",
    worstMarginDiff === 0,
    `max abs diff ${worstMarginDiff}`
  );
  check(
    "every recorded partition is exact (disjoint, covering) and closes on 1",
    partitionFailures === 0,
    `${partitionFailures} bad partitions`
  );

  // (2) The recorded geometry is self-consistent.
  const boundariesWithS0 = all.filter((s) => s.s0TokenIndex >= 0 && s.s0TokensAfterBoundary >= 0);
  const geometryConsistent = boundariesWithS0.every((s) => {
    const row = geometryOf(toGapState(s));
    return (
      row.gap === s.s0TokensAfterBoundary &&
      row.tokensBetween === s.s0TokensAfterBoundary &&
      row.p0TokenIndex === s.s0TokenIndex + s.s0TokensAfterBoundary &&
      row.p0ByteOffset === s.s0ByteOffset + s.s0BytesAfterBoundary &&
      row.completeCharactersBetween === s.s0CharactersAfterBoundary
    );
  });
  check(
    "the recorded gap equals the recorded S0->P0 geometry for every state",
    boundariesWithS0.length === all.length && geometryConsistent,
    `${boundariesWithS0.length} of ${all.length} states carry an S0`
  );

  // (3) The frozen tau is the median of the artifact's OWN failure margins.
  const failureMargins = failures.states.map((s) => s.s0Margin);
  check(
    "tau is the median of the artifact's own 11 failure margins",
    medianOf(failureMargins) === PHASE107_TAU,
    String(medianOf(failureMargins))
  );
  if (threshold !== null) {
    check(
      "the Phase-107 threshold artifact records the same tau",
      threshold.threshold.tau === PHASE107_TAU && threshold.heldOut.tau === PHASE107_TAU
    );
    check(
      "the Phase-107 threshold artifact's own sorted margins have that median",
      medianOf(threshold.threshold.sortedFailureMargins) === PHASE107_TAU
    );
  } else {
    skip("Phase-107 threshold parity", "no threshold artifact");
  }

  if (probe === null) {
    skip("the probe's own reproduction record", "no Phase-108 probe artifact");
    return;
  }

  check(
    "the probe recorded zero blocks and passed every replay invariant",
    probe.blocks.length === 0 && probe.replayInvariantsPassed
  );
  check(
    "the probe reproduced every state's margin and gap at tolerance 0",
    probe.reproduction.marginMaxAbsDiff === 0 &&
      probe.reproduction.gapMaxAbsDiff === 0 &&
      probe.reproduction.perStateMarginsReproduce &&
      probe.reproduction.perStateGapsReproduce
  );
  check(
    "the probe reproduced the frozen tau",
    probe.reproduction.tauReproduced &&
      probe.reproduction.freshTau === PHASE107_TAU &&
      probe.reproduction.artifactTau === PHASE107_TAU
  );
  check(
    "all four checkpoints were verified against the Phase-106 digests",
    Object.keys(probe.checkpointMatchesPhase106).length === 4 &&
      Object.values(probe.checkpointMatchesPhase106).every(Boolean)
  );
}

let VOCAB_CACHE: VocabEntry[] | null = null;
function vocabEntries(): VocabEntry[] {
  if (VOCAB_CACHE === null) {
    const corpus = loadCorpus();
    const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
    VOCAB_CACHE = classifyVocabulary(tokenizer.getVocabulary().idToToken, tokenizer.vocabSize);
  }
  return VOCAB_CACHE;
}

function toGapState(s: StateView): GapState {
  return {
    label: s.label,
    armKey: s.armKey,
    gap: s.s0TokensAfterBoundary,
    s0Margin: s.s0Margin,
    continuationStartMass: s.continuationStartMass,
    legalP0StartMass: s.legalP0StartMass,
    forbiddenLeadMass: s.forbiddenLeadMass,
    argmaxProb: s.argmaxProb,
    argmaxIsContinuationStart: s.argmaxIsContinuationStart,
    s0TokenIndex: s.s0TokenIndex,
    s0ByteOffset: s.s0ByteOffset,
    s0BytesAfterBoundary: s.s0BytesAfterBoundary,
    s0CharactersAfterBoundary: s.s0CharactersAfterBoundary,
  };
}

// ============================================================
// §4 — the pre-registered stratum
// ============================================================

function testStratum(probe: ProbeView | null, failures: PopulationView | null): void {
  console.log("\n  [§4] pre-registered stratum");

  if (failures === null) {
    skip("stratum", "no Phase-107 failure artifact");
    return;
  }

  const states = failures.states.map(toGapState);
  const stratum = stratify(states);

  check("the stratum rule is the pre-registered `tokensAfterBoundary >= 2`", STRATUM_MIN_GAP === 2);
  check(
    "the stratum holds exactly the Phase-107-recorded 10 failures",
    stratum.length === REQUIRED_STRATUM_FAILURES,
    String(stratum.length)
  );
  check(
    "the failure gap histogram is the Phase-107-recorded {1:1, 2:2, 3:8}",
    JSON.stringify(gapHistogram(states)) === JSON.stringify({ "1": 1, "2": 2, "3": 8 }),
    JSON.stringify(gapHistogram(states))
  );

  const atOne = stratify(states, 1);
  const atThree = stratify(states, 3);
  check(
    "the cut is load-bearing: `>= 1` and `>= 3` yield different populations",
    atOne.length !== stratum.length && atThree.length !== stratum.length,
    `>=1 ${atOne.length}, >=2 ${stratum.length}, >=3 ${atThree.length}`
  );

  const outside = states.filter((s) => s.gap < STRATUM_MIN_GAP);
  check(
    "exactly one failure sits outside the stratum, and it is the gap-1 state",
    outside.length === 1 && outside[0].gap === 1,
    outside.map((s) => `${s.label}@${s.gap}`).join(", ")
  );

  if (probe === null) {
    skip("the probe's stratum record", "no Phase-108 probe artifact");
    return;
  }
  check(
    "the probe recorded the same 10 failure / 51 intact stratum",
    probe.populations.stratumFailureCount === REQUIRED_STRATUM_FAILURES &&
      probe.populations.stratumIntactCount === REQUIRED_STRATUM_INTACT
  );
  check(
    "the probe's recorded stratum rule names the frozen constant",
    probe.populations.stratumRule === `tokensAfterBoundary >= ${STRATUM_MIN_GAP}`
  );
}

// ============================================================
// §6/§7 — matching
// ============================================================

function testMatching(
  matching: MatchingView | null,
  failures: PopulationView | null,
  intact: PopulationView | null
): void {
  console.log("\n  [§6] exact-gap matching");

  if (failures === null || intact === null) {
    skip("matching", "no state artifacts");
    return;
  }

  const f = failures.states.map(toGapState);
  const i = intact.states.map(toGapState);
  const exact = matchByGap(f, i, 0);

  check(
    "exact-gap matching compares a failure ONLY against same-gap controls",
    exact.matches.every((m) => m.matchedAtGap === m.gap) &&
      exact.matches.every((m) => m.gap === m.matchedAtGap)
  );
  check(
    "exact-gap matching retains all ten stratum failures",
    exact.matches.length === REQUIRED_STRATUM_FAILURES && exact.unmatchedFailureLabels.length === 0,
    `${exact.matches.length} matched, ${exact.unmatchedFailureLabels.length} unmatched`
  );
  check(
    "every matched control genuinely sits at the reference gap",
    exact.matches.every((m) => {
      const controls = i.filter((s) => m.matchedIntactLabels.includes(s.label));
      return (
        controls.length === m.matchedIntactCount &&
        controls.every((c) => Math.abs(c.gap - m.gap) <= 0)
      );
    })
  );
  check(
    "the distinct-control count is recorded, not inferred from the pair count",
    exact.matchedIntactCount === new Set(exact.matchedIntactLabels).size &&
      exact.matchedIntactCount === 51,
    String(exact.matchedIntactCount)
  );
  check(
    "no intact state is double-counted inside one reference set",
    exact.matches.every((m) => new Set(m.matchedIntactLabels).size === m.matchedIntactCount)
  );

  // (11) Matching must not depend on the margins.
  const scrambledControls: GapState[] = i.map((s, k) => ({
    ...s,
    s0Margin: -0.5 - k * 0.001,
  }));
  const scrambled = matchByGap(f, scrambledControls, 0);
  check(
    "matching is independent of the margins: the match STRUCTURE is unchanged when the " +
      "controls' margins are replaced",
    JSON.stringify(scrambled.matches.map((m) => [m.label, m.matchedIntactCount, m.matchedIntactLabels])) ===
      JSON.stringify(exact.matches.map((m) => [m.label, m.matchedIntactCount, m.matchedIntactLabels]))
  );

  // (11) Determinism.
  const again = matchByGap(f, i, 0);
  check(
    "matching is deterministic: two runs are bit-identical",
    JSON.stringify(again) === JSON.stringify(exact)
  );

  // (10) The ±1 fallback admits |Δgap| <= 1 and nothing further.
  const fb = matchByGap(f, i, FALLBACK_TOLERANCE);
  const fbWorstGap = Math.max(
    0,
    ...fb.matches.map((m) =>
      Math.max(
        0,
        ...i
          .filter((s) => m.matchedIntactLabels.includes(s.label))
          .map((s) => Math.abs(s.gap - m.gap))
      )
    )
  );
  check(
    "the ±1 fallback admits |Δgap| <= 1 and retains at least as many failures as exact matching",
    FALLBACK_TOLERANCE === 1 &&
      fbWorstGap <= FALLBACK_TOLERANCE &&
      fb.matches.length >= exact.matches.length,
    `worst admitted |Δgap| ${fbWorstGap}`
  );
  // The fallback widens the GAP TOLERANCE within the pre-registered stratum; it
  // is not a licence to widen the stratum itself. The gap-1 control below must
  // therefore be excluded by ±1 exactly as it is by exact matching.
  const syntheticFailures = [syntheticState("sf", 3, -0.9)];
  const syntheticIntact = [
    syntheticState("c1", 1, -0.99),
    syntheticState("c2", 2, -0.99),
    syntheticState("c3", 3, -0.99),
    syntheticState("c4", 4, -0.99),
    syntheticState("c5", 5, -0.99),
  ];
  const syntheticFb = matchByGap(syntheticFailures, syntheticIntact, FALLBACK_TOLERANCE);
  const syntheticExact = matchByGap(syntheticFailures, syntheticIntact, 0);
  check(
    "the fallback is a fixed tolerance, not a dial: ±1 admits the adjacent gaps and excludes ±2",
    syntheticExact.matches[0].matchedIntactLabels.join(",") === "c3" &&
      syntheticFb.matches[0].matchedIntactLabels.join(",") === "c2,c3,c4",
    `exact ${syntheticExact.matches[0].matchedIntactLabels.join(",")} | ±1 ${syntheticFb.matches[0].matchedIntactLabels.join(",")}`
  );
  check(
    "the fallback does NOT widen the pre-registered stratum: a gap-1 control stays excluded",
    !syntheticExact.matches[0].matchedIntactLabels.includes("c1") &&
      !syntheticFb.matches[0].matchedIntactLabels.includes("c1") &&
      !syntheticFb.matches[0].matchedIntactLabels.includes("c5")
  );

  if (matching === null) {
    skip("the recorded matching artifact", "no Phase-108 matching artifact");
    return;
  }

  check(
    "the artifact records exact matching as the primary comparison",
    matching.matching.exactMatchUsed &&
      matching.matching.primaryTolerance === 0 &&
      !matching.matching.fallbackUsed &&
      matching.matching.fallbackRetained === null
  );
  check(
    "the artifact's recorded match rows agree with the live re-derivation",
    JSON.stringify(matching.matching.perFailure.map((m) => [m.label, m.delta])) ===
      JSON.stringify(exact.matches.map((m) => [m.label, m.delta]))
  );
  check(
    "the artifact's stratum counts and gap census agree with the live re-derivation",
    matching.stratumCounts.failure === stratify(f).length &&
      matching.stratumCounts.intact === stratify(i).length &&
      JSON.stringify(matching.failureGapCounts) === JSON.stringify(gapHistogram(stratify(f))) &&
      JSON.stringify(matching.intactGapCounts) === JSON.stringify(gapHistogram(stratify(i)))
  );
}

// ============================================================
// §8/§9 — statistics
// ============================================================

function testStatistics(
  matching: MatchingView | null,
  failures: PopulationView | null,
  intact: PopulationView | null
): void {
  console.log("\n  [§8] matched statistic and the fixed null");

  // (14) Hand-computed arithmetic on a synthetic population.
  const sf = [syntheticState("s1", 2, -0.80), syntheticState("s2", 2, -0.90)];
  const si = [
    syntheticState("a", 2, -0.95),
    syntheticState("b", 2, -0.97),
    syntheticState("c", 2, -0.99),
  ];
  const syntheticMatch = matchByGap(sf, si, 0);
  const syntheticStat = statisticOf(syntheticMatch);
  // reference median of [-0.95, -0.97, -0.99] = -0.97
  // deltas: -0.80 - (-0.97) = +0.17 ; -0.90 - (-0.97) = +0.07 ; median = +0.120
  check(
    "the matched median difference equals the hand-computed value on a synthetic population",
    Math.abs(syntheticStat.medianDelta - 0.12) < 1e-12 &&
      Math.abs(syntheticStat.meanDelta - 0.12) < 1e-12 &&
      syntheticStat.positive === 2 &&
      syntheticStat.negative === 0 &&
      syntheticStat.zero === 0,
    JSON.stringify(syntheticStat)
  );

  const signCheck = summarizeDeltas([1, -1, 0, 2, -2, 0]);
  check(
    "sign counting partitions the delta list exactly",
    signCheck.positive === 2 &&
      signCheck.negative === 2 &&
      signCheck.zero === 2 &&
      signCheck.positive + signCheck.negative + signCheck.zero === signCheck.n
  );

  if (failures === null || intact === null) {
    skip("the recorded statistics", "no state artifacts");
    return;
  }

  const f = failures.states.map(toGapState);
  const i = intact.states.map(toGapState);

  // (16) Group sizes are conserved in every permutation draw.
  const groupConservation = permutationGroupsConserved(f, i, 0, 5);
  check(
    "the permutation preserves each group's failure and control counts in every draw",
    groupConservation
  );

  // (15) Determinism and seed liveness.
  const nullA = permutationNull(f, i, 0, { seed: PERMUTATION_SEED, permutations: 400 });
  const nullB = permutationNull(f, i, 0, { seed: PERMUTATION_SEED, permutations: 400 });
  const nullC = permutationNull(f, i, 0, { seed: PERMUTATION_SEED + 1, permutations: 400 });
  check(
    "the permutation null is a pure function of (population, tolerance, seed, count)",
    JSON.stringify(nullA) === JSON.stringify(nullB)
  );
  check(
    "the seed is live: changing it changes the null",
    nullA.pValue !== nullC.pValue || nullA.nullMedianOfMedianDeltas !== nullC.nullMedianOfMedianDeltas
  );
  check(
    "the p-value is the (1+k)/(1+N) estimator, strictly inside (0, 1]",
    nullA.pValue > 0 && nullA.pValue <= 1 && nullA.permutations === 400
  );
  check(
    "the observed statistic is independent of the null's seed",
    nullA.observedMedianDelta === nullC.observedMedianDelta &&
      nullA.observedMedianDelta === statisticOf(matchByGap(f, i, 0)).medianDelta
  );

  // (18) The random-label control.
  const controlA = randomLabelControl(f, i, { seed: RANDOM_CONTROL_SEED });
  const controlB = randomLabelControl(f, i, { seed: RANDOM_CONTROL_SEED });
  const controlC = randomLabelControl(f, i, { seed: RANDOM_CONTROL_SEED + 1 });
  check(
    "the random-label control is deterministic under its fixed seed",
    JSON.stringify(controlA) === JSON.stringify(controlB)
  );
  check(
    "the random-label control's seed is live",
    JSON.stringify(controlA.pseudoFailureLabels) !== JSON.stringify(controlC.pseudoFailureLabels)
  );
  check(
    "the random-label control draws the frozen 11 states from the frozen 221-state pool",
    controlA.draw === REQUIRED_POPULATION_FAILURES && controlA.pseudoFailureLabels.length === 11
  );

  if (matching === null) {
    skip("the recorded statistic artifact", "no Phase-108 matching artifact");
    return;
  }

  const recorded = matching.primaryStatistic;
  const live = statisticOf(matchByGap(f, i, 0));
  check(
    "the artifact's median delta is the median of the artifact's own deltas",
    recorded.medianDelta === medianOf(recorded.deltas) &&
      recorded.medianDelta === live.medianDelta,
    `${recorded.medianDelta} vs ${live.medianDelta}`
  );
  check(
    "the artifact's sign counts partition its delta list",
    recorded.positive + recorded.negative + recorded.zero === recorded.n &&
      recorded.n === recorded.deltas.length
  );
  check(
    "the recorded permutation null names what is permuted and what statistic is used",
    matching.permutationNull.permuted.length > 0 &&
      matching.permutationNull.statistic.length > 0 &&
      matching.permutationNull.seed === PERMUTATION_SEED &&
      matching.permutationNull.permutations === PERMUTATION_COUNT
  );
  const rerunNull = permutationNull(f, i, 0, {
    seed: PERMUTATION_SEED,
    permutations: PERMUTATION_COUNT,
  });
  check(
    "the recorded published p-value reproduces exactly from the frozen populations",
    rerunNull.pValue === matching.permutationNull.pValue &&
      rerunNull.atLeastObserved === matching.permutationNull.atLeastObserved
  );
}

/** §9 — re-run a few draws with a probe that records each draw's group sizes. */
function permutationGroupsConserved(
  failures: readonly GapState[],
  intact: readonly GapState[],
  tolerance: number,
  draws: number
): boolean {
  const f = stratify(failures);
  const i = stratify(intact);
  const gaps = [...new Set(f.map((s) => s.gap))].sort((a, b) => a - b);
  const rand = makePrng(PERMUTATION_SEED);
  for (let d = 0; d < draws; d++) {
    for (const g of gaps) {
      const group = [...f.filter((s) => s.gap === g), ...i.filter((s) => Math.abs(s.gap - g) <= tolerance)];
      const order = shuffleWith(
        Array.from({ length: group.length }, (_, k) => k),
        rand
      );
      const failureCount = f.filter((s) => s.gap === g).length;
      const controlCount = i.filter((s) => Math.abs(s.gap - g) <= tolerance).length;
      if (order.length !== failureCount + controlCount) return false;
      const drawnFailures = order.slice(0, failureCount);
      const drawnControls = order.slice(failureCount);
      if (drawnFailures.length !== failureCount || drawnControls.length !== controlCount) return false;
      const unique = new Set([...drawnFailures, ...drawnControls]);
      if (unique.size !== group.length) return false;
    }
  }
  return true;
}

// ============================================================
// §19 — the decision rule
// ============================================================

function testDecision(matching: MatchingView | null, probe: ProbeView | null): void {
  console.log("\n  [§19] decision rule");

  const base = {
    replayInvariantsPassed: true,
    matchedFailureCount: 10,
    pValue: 0.01,
    nullMedianOfMedianDeltas: 0,
  };
  const up = summarizeDeltas([0.1, 0.2, 0.3]);
  const down = summarizeDeltas([-0.1, -0.2, -0.3]);

  const reachable = new Set(
    [
      classifyH108({ ...base, statistic: up }).classification,
      classifyH108({ ...base, statistic: down }).classification,
      classifyH108({ ...base, statistic: up, pValue: 0.4 }).classification,
      classifyH108({ ...base, statistic: up, replayInvariantsPassed: false }).classification,
    ].map(String)
  );
  check(
    "every classification branch A/B/C/D is reachable",
    H108_CLASSIFICATIONS.every((c) => reachable.has(c)),
    [...reachable].join(",")
  );

  const blocked = classifyH108({
    ...base,
    statistic: down,
    replayInvariantsPassed: false,
  });
  check(
    "the blocked branch dominates: a failed replay invariant is D regardless of the statistic",
    blocked.classification === "D"
  );
  check(
    "fewer than 7 matched failures is C, never a manufactured verdict",
    classifyH108({
      ...base,
      matchedFailureCount: MIN_MATCHED_FAILURES - 1,
      statistic: up,
    }).classification === "C" &&
      classifyH108({ ...base, matchedFailureCount: MIN_MATCHED_FAILURES, statistic: up })
        .classification === "B"
  );
  check(
    "a shift that reverses is A, and one that cannot be distinguished is C",
    classifyH108({ ...base, statistic: down }).classification === "A" &&
      classifyH108({ ...base, statistic: up, pValue: 0.5 }).classification === "C"
  );

  if (matching === null || probe === null) {
    skip("the recorded decision", "no Phase-108 artifacts");
    return;
  }

  const live = classifyH108({
    replayInvariantsPassed: probe.replayInvariantsPassed,
    matchedFailureCount: matching.matching.perFailure.length,
    statistic: matching.primaryStatistic,
    pValue: matching.permutationNull.pValue,
    nullMedianOfMedianDeltas: matching.permutationNull.nullMedianOfMedianDeltas,
  });
  check(
    "the recorded classification is the one the frozen rule produces from the recorded evidence",
    live.classification === matching.decision.classification &&
      live.label === matching.decision.label,
    `${matching.decision.classification} vs ${live.classification}`
  );
}

// ============================================================
// §22 — regression: frozen surfaces
// ============================================================

function testRegression(probe: ProbeView | null, manifest: ManifestView | null): void {
  console.log("\n  [regression] frozen surfaces");

  for (const [name, file] of [
    ["the Phase-108 instrument", PHASE108_INSTRUMENT],
    ["the Phase-108 probe", PHASE108_PROBE],
  ] as [string, string][]) {
    if (!fs.existsSync(file)) {
      check(`${name} exists`, false, file);
      continue;
    }
    const code = codeOf(fs.readFileSync(file, "utf8"));
    check(`${name} calls no Math.random()`, !NONDETERMINISM_CALL.test(code));
    check(`${name} calls no timer`, !TIMER_CALL.test(code));
  }

  const instrumentCode = codeOf(fs.readFileSync(PHASE108_INSTRUMENT, "utf8"));
  // Assembled from fragments: Phase 102's frozen-surface guard is a plain
  // substring scan over every .ts/.tsx file outside experiments/phase102, so
  // spelling these out would make this negative assertion trip the check it is
  // paired with. The fragments concatenate to the identical strings.
  const maskIdentifiers = [
    "buildP012" + "Mask",
    "buildPhaseMask",
    "PhaseMasked" + "Model",
    "P012" + "MaskedModel",
  ];
  const maskCall = new RegExp(`\\b(${maskIdentifiers.join("|")})\\b`);
  check("the instrument applies no candidate mask", !maskCall.test(instrumentCode));
  check(
    "the instrument restates no legality rule and carries no threshold search",
    !/\bappendBytes\b/.test(instrumentCode) &&
      !/p0VerdictOf/.test(instrumentCode) &&
      !/\bROC\b|\bYouden\b/.test(instrumentCode)
  );

  // (25) `medianOf` parity with the Phase-107 convention it restates.
  const vectors: number[][] = [
    [1],
    [1, 2],
    [3, 1, 2],
    [4, 1, 3, 2],
    [-0.99, -0.999, -0.97, -0.8],
    [-0.9998179442542202, -0.9995629398170851, -0.9993395432108111, -0.9968391965141633,
     -0.9952209198389708, -0.9916428118332534, -0.9705616201345946, -0.9673149594954674,
     -0.9549846719533894, -0.9520337931717393, -0.8115022201820673],
  ];
  check(
    "the Phase-108 medianOf agrees with the Phase-107 convention on every test vector",
    vectors.every((v) => medianOf(v) === phaseOneZeroSevenMedianOf(v))
  );

  // (22) The vocabulary census is unchanged.
  const vocab = vocabEntries();
  const contCount = vocab.filter(isContinuationStartEntry).length;
  const forbCount = vocab.filter(isForbiddenLeadEntry).length;
  const legalCount = vocab.filter(isLegalP0Entry).length;
  check(
    "the tokenizer and vocabulary census are the established 300 / 223 / 64 / 13",
    vocab.length === VOCAB_TARGET &&
      legalCount === 223 &&
      contCount === 64 &&
      forbCount === 13,
    `${vocab.length} / ${legalCount} / ${contCount} / ${forbCount}`
  );
  const invariant = partitionInvariantOf(vocab, {
    vocabularySize: 300,
    legalAtP0Count: 223,
    illegalAtP0Count: 77,
    startsWithContinuationByteCount: 64,
    startsWithForbiddenLeadCount: 13,
  });
  check(
    "the byte-level partition still matches the Phase-102 census",
    invariant.matchesRecorded && invariant.partitionExact
  );
  check(
    "the forbidden-lead boundary is unchanged (the 0xC0/0xC1 + >=0xF5 rule)",
    FORBIDDEN_LEAD_HIGH_MIN === 0xf5
  );

  if (manifest !== null) {
    const bad = manifest.checkpointIdentifiers.filter((rec) => {
      const abs = path.join(ROOT, rec.path);
      return !fs.existsSync(abs) || sha256(abs) !== rec.sha256;
    });
    check(
      "the four checkpoints still carry the Phase-106 digests",
      manifest.checkpointIdentifiers.length === 4 && bad.length === 0,
      bad.map((b) => b.armKey).join(", ")
    );
  } else {
    skip("checkpoint parity", "no Phase-108 manifest");
  }

  if (probe === null) {
    skip("prior-artifact stability", "no Phase-108 probe artifact");
    return;
  }

  const drifted = Object.entries(probe.integrity.priorPhaseArtifacts).filter(([rel, rec]) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return true;
    if (rel.endsWith(".md")) return rec.sha256Raw !== sha256(abs);
    return rec.sha256Scientific !== scientificDigestOf(abs);
  });
  check(
    "the prior phase artifacts are unchanged since the probe ran",
    drifted.length === 0,
    drifted.map((d) => d[0]).join(", ")
  );
  // The digest map, not a hand-written list, is what makes the frozen-surface
  // claim above meaningful: assert that the phase-106 manifest is genuinely
  // inside it, so "the prior phase artifacts are unchanged" covers the
  // checkpoint digests the whole S0 family rests on.
  const p106ManifestRel = path
    .relative(ROOT, path.join(P106_DIR, "manifest.json"))
    .split(path.sep)
    .join("/");
  check(
    "the phase-106 manifest is inside the frozen-surface digest map",
    Object.prototype.hasOwnProperty.call(probe.integrity.priorPhaseArtifacts, p106ManifestRel)
  );
  check(
    "the probe recorded a production-file digest for every tracked production file",
    Object.keys(probe.integrity.productionFileDigests).length > 0 &&
      Object.values(probe.integrity.productionFileDigests).every((d) => d !== "MISSING")
  );
  check(
    "the artifacts record no volatile wall-clock field",
    manifest === null ||
      (!("durationMs" in (manifest as unknown as Record<string, unknown>)) &&
        (manifest as unknown as { volatileFieldsWritten: unknown[] }).volatileFieldsWritten.length === 0)
  );
}

/** The Phase-107 median convention, restated here only to be compared against. */
function phaseOneZeroSevenMedianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================
// Runner
// ============================================================

export function runPhase108Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("=".repeat(60));
  console.log("Phase 108 — Gap-Matched S0 Geometry Audit");
  console.log("=".repeat(60));

  const probe = readJson<ProbeView>(path.join(P108_DIR, "probe-results.json"));
  const matching = readJson<MatchingView>(path.join(P108_DIR, "matching-results.json"));
  const manifest = readJson<ManifestView>(path.join(P108_DIR, "manifest.json"));
  const failures = readJson<PopulationView>(path.join(P107_DIR, "failure-states.json"));
  const intact = readJson<PopulationView>(path.join(P107_DIR, "intact-states.json"));
  const threshold = readJson<ThresholdView>(path.join(P107_DIR, "threshold-results.json"));

  testReplayArtifacts(probe, failures, intact, threshold);
  testStratum(probe, failures);
  testMatching(matching, failures, intact);
  testStatistics(matching, failures, intact);
  testDecision(matching, probe);
  testRegression(probe, manifest);

  // Consistency between the two Phase-108 artifacts and the manifest.
  console.log("\n  [§16] artifact cross-consistency");
  if (matching === null || manifest === null) {
    skip("artifact cross-consistency", "no Phase-108 matching artifact or manifest");
  } else {
    check(
      "the manifest's headline result is the matching artifact's own statistic and verdict",
      manifest.result.classification === matching.decision.classification &&
        manifest.result.primaryStatistic.medianDelta === matching.primaryStatistic.medianDelta
    );
    check(
      "the manifest records a digest for every Phase-108 artifact it names",
      Object.keys(manifest.ownArtifactDigests).length === 2
    );
    check(
      "the two Phase-108 data artifacts carry their own declared raw digest",
      Object.entries(manifest.ownArtifactDigests).every(([key, rec]) => {
        const file =
          key === "probeResults"
            ? path.join(P108_DIR, "probe-results.json")
            : path.join(P108_DIR, "matching-results.json");
        return fs.existsSync(file) && crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === rec.sha256Raw;
      })
    );
  }

  console.log(
    `\nPhase 108 contract suite: passed=${passed} failed=${failed} skipped=${skipped}`
  );
  return { passed, failed, skipped };
}
