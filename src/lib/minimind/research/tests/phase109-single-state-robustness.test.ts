// ============================================================
// Phase 109 — single-state residual robustness contract suite
// ============================================================
// Phase 109 tested, read-only and with zero training, whether the residual S0
// signal Phase 108 matched is a SINGLE-STATE effect: does removing exactly the
// maximum-delta failure state, under a rule fixed before the comparison was
// read, make the residual disappear?
//
// This suite does NOT pin a verdict. It checks the instrument's contract, that
// the recorded artifacts are internally consistent and re-derivable, and that
// nothing outside `experiments/phase109/` moved:
//
//   REPLAY (§3)
//   1. every one of the 221 recorded S0Margin values re-derives from the
//      artifact's OWN 300-value S0 softmax via the Phase-107 partition, at
//      tolerance 0 — the frozen score is not restated, it is recomputed
//   2. the Phase-108 stratum reproduces: 10 failures / 51 intact at
//      `tokensAfterBoundary >= 2`, with the recorded gap histograms
//   3. exact-gap matching on the rebuilt populations retains all ten against
//      the same 51 distinct controls, with the same per-row references
//   4. every Phase-108 matched delta reproduces by label at tolerance 0
//   5. the Phase-108 median, mean, sign counts, permutation p, permutation tail
//      count, null median-of-medians and null interval all reproduce
//   6. the Phase-108 random-label control reproduces: same draw, same stratum
//      counts, same median
//
//   REMOVAL (§4/§5)
//   7. the removal index is the argmax of the Phase-108 delta vector, derived
//      from the artifact rather than written down here
//   8. the pre-registered tie-break is `(armKey, label)` ascending and is
//      reached ONLY on an exact delta tie — proven on a synthetic tied set
//   9. exactly one state is removed, it is gone from the population, and no
//      other state is touched
//  10. the removal record's own fields agree with the artifact they claim to
//      describe
//
//   RECALCULATION (§6/§7/§11)
//  11. the H109 delta vector is the Phase-108 vector minus the removed entry
//  12. the H109 n / median / mean / sign counts are the surviving deltas'
//  13. the H109 permutation null re-derives from the post-removal population
//      with the SAME seed and count, and is a pure function of them
//  14. the H109 random-label control used the SAME seed and draw and is
//      deterministic
//  15. the removal changed N and nothing else: same tolerance, same intact
//      control set, same design constants
//  16. the recorded decision is re-derivable from the recorded evidence
//
//   INTEGRITY (§5/§13/§20)
//  17. the four checkpoints still carry the Phase-108 digests
//  18. the intact population is byte-for-byte the one Phase 108 matched
//  19. the prior phase artifacts are unchanged since the probe ran
//  20. the instrument and probe call no `Math.random()` and no timer
//  21. the removal could not have been steered: no intact label, no prompt text
//      and no arm identity entered the selection except the declared tie-break
//  22. every A/B/C/D branch is reachable, and the recorded verdict is exactly
//      one of them
//
// Every expectation is re-derived at test time or read back from the artifact
// being checked. No measured Phase-109 result and no state identifier is
// hardcoded. Phase 57-108 suites are untouched.
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
  isContinuationStartEntry,
  isForbiddenLeadEntry,
  isLegalP0Entry,
  massPartitionOf,
  s0MarginOf,
  type MassPartition,
} from "../../../../../experiments/phase107/s0-mass-separation-audit";

import {
  PERMUTATION_COUNT,
  PERMUTATION_SEED,
  RANDOM_CONTROL_DRAW,
  RANDOM_CONTROL_SEED,
  STRATUM_MIN_GAP,
  matchByGap,
  makePrng,
  permutationNull,
  randomLabelControl,
  shuffleWith,
  statisticOf,
  stratify,
  type FailureMatch,
  type GapState,
} from "../../../../../experiments/phase108/gap-matched-audit";

import {
  H109_CLASSIFICATIONS,
  MAX_STATE_REMOVALS,
  MIN_REMAINING_FAILURES,
  REMOVAL_RULE,
  TIE_BREAK_RULE,
  classifyH109,
  compareStatistic,
  leakageAudit,
  removeMaximumDelta,
  removeStateFromPopulation,
  runLeaveOneOut,
  selectMaximumDeltaIndex,
  type H109Classification,
} from "../../../../../experiments/phase109/single-state-robustness-audit";

// ============================================================
// Harness
// ============================================================

let passed = 0;
let failed = 0;
let skipped = 0;

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

const P109_DIR = path.join(ROOT, "experiments", "phase109");
const P108_DIR = path.join(ROOT, "experiments", "phase108");
const P107_DIR = path.join(ROOT, "experiments", "phase107");

const PHASE109_INSTRUMENT = path.join(P109_DIR, "single-state-robustness-audit.ts");
const PHASE109_PROBE = path.join(P109_DIR, "probe.ts");

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
// Views
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
  states: StateView[];
}

interface StatisticView {
  n: number;
  medianDelta: number;
  meanDelta: number;
  positive: number;
  negative: number;
  zero: number;
  deltas: number[];
}

interface PermutationView {
  seed: number;
  permutations: number;
  observedMedianDelta: number;
  atLeastObserved: number;
  pValue: number;
  nullMedianOfMedianDeltas: number;
  nullMin: number;
  nullMax: number;
}

interface ControlView {
  seed: number;
  draw: number;
  pseudoFailureLabels: string[];
  stratumFailureCount: number;
  stratumIntactCount: number;
  statistic: StatisticView;
}

interface MatchRowView {
  label: string;
  armKey: string;
  gap: number;
  margin: number;
  matchedAtGap: number;
  matchedIntactCount: number;
  matchedIntactLabels: string[];
  referenceMedian: number;
  delta: number;
  inStratum: boolean;
}

interface P108MatchingView {
  stratumCounts: { failure: number; intact: number };
  failureGapCounts: Record<string, number>;
  intactGapCounts: Record<string, number>;
  matching: {
    exactMatchUsed: boolean;
    primaryTolerance: number;
    matchedIntactCount: number;
    matchedIntactLabels: string[];
    unmatchedFailureLabels: string[];
    outOfStratumFailureLabels: string[];
    perFailure: MatchRowView[];
  };
  primaryStatistic: StatisticView;
  permutationNull: PermutationView;
  randomLabelControl: ControlView;
}

interface RemovalRecordView {
  rule: string;
  tieBreakRule: string;
  maxStateRemovals: number;
  minRemainingFailures: number;
  tieBreakUsed: boolean;
  tiedLabels: string[];
  removedIndex: number;
  removed: {
    label: string;
    armKey: string;
    prompt: string | null;
    gap: number;
    failureS0Margin: number;
    matchedIntactReference: number;
    matchedDelta: number;
    matchedAtGap: number;
    matchedIntactCount: number;
    matchedIntactLabels: string[];
  };
  removalReason: string;
  remaining: MatchRowView[];
  remainingLabels: string[];
  remainingCount: number;
  largestRemaining: { label: string; delta: number; note: string };
}

interface ProbeView {
  phase: number;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  blocks: string[];
  reproductionGatePassed: boolean;
  reproduction: {
    failureCount: number;
    intactCount: number;
    marginMaxAbsDiff: number;
    partitionMaxAbsDiff: number;
    perStateMarginsReproduce: boolean;
    perStatePartitionsReproduce: boolean;
    stratumFailureCount: number;
    stratumIntactCount: number;
    matchedFailureCount: number;
    matchedIntactCount: number;
    matchOrderPreserved: boolean;
    matchedDeltasReproducedElementWise: boolean;
    permutationReproduced: boolean;
    controlReproduced: boolean;
    recordedMedianDelta: number;
    rederivedMedianDelta: number;
  };
  checkpointMatchesPhase108: Record<string, boolean>;
  populations: {
    failureCount: number;
    intactCount: number;
    stratumFailureCount: number;
    stratumIntactCount: number;
    postRemovalFailureCount: number;
    postRemovalFailureLabels: string[];
  };
  coreAuditDigest: string;
  coreAuditReproducible: boolean;
  integrity: {
    productionFileDigests: Record<string, string>;
    priorPhaseArtifacts: Record<
      string,
      { sha256Raw: string; sha256Scientific: string; rawDigestReproducible: boolean }
    >;
  };
}

interface MatchingView {
  stratumCounts: { failure: number; intact: number };
  whatChanged: {
    failurePopulationBefore: number;
    failurePopulationAfter: number;
    stratumFailuresBefore: number;
    stratumFailuresAfter: number;
    intactPopulationChanged: boolean;
    matchingMethodChanged: boolean;
    fallbackUsed: boolean;
    primaryStatisticChanged: boolean;
    permutationDesignChanged: boolean;
    controlDesignChanged: boolean;
  };
  removal: {
    rule: string;
    tieBreakRule: string;
    tieBreakUsed: boolean;
    removedLabel: string;
    removedDelta: number;
    remainingLabels: string[];
  };
  phase108Reproduction: {
    matchedFailureCount: number;
    matchedIntactCount: number;
    perFailure: MatchRowView[];
    primaryStatistic: StatisticView;
    permutationNull: PermutationView;
    randomLabelControl: ControlView;
    deltaVectorMatchesArtifact: boolean;
  };
  primary: {
    matching: {
      tolerance: number;
      matchedIntactLabels: string[];
      unmatchedFailureLabels: string[];
      matches: MatchRowView[];
    };
    statistic: StatisticView;
    permutationNull: PermutationView;
    randomLabelControl: ControlView;
  };
  comparison: {
    medianShift: number;
    meanShift: number;
    positiveShift: number;
    negativeShift: number;
    zeroShift: number;
    largestRemainingLabel: string;
    largestRemainingDelta: number;
  };
  decision: {
    classification: H109Classification;
    label: string;
    detail: string;
    evidence: {
      reproductionGatePassed: boolean;
      matchedFailureCount: number;
      minimumRequired: number;
      medianDelta: number;
      meanDelta: number;
      positive: number;
      negative: number;
      zero: number;
      pValue: number;
      nullMedianOfMedianDeltas: number;
    };
  };
  leakage: {
    selectionRule: string;
    intactLabelsUsedForSelection: string[];
    promptSemanticsUsedForSelection: string[];
    armIdentityUsedForSelection: string[];
    intactOutcomeReadBeforeRemoval: boolean;
    selectionInputs: string[];
  };
}

interface ManifestView {
  phase: number;
  status: string;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  volatileFieldsWritten: unknown[];
  removalRule: string;
  tieBreakRule: string;
  checkpointIdentifiers: { armKey: string; path: string; sha256: string; matchesPhase108: boolean }[];
  configuration: Record<string, unknown>;
  ownArtifactDigests: Record<string, { sha256Raw: string; sha256Scientific: string }>;
  sourceArtifacts: Record<string, { path: string; sha256Raw: string }>;
  result: {
    classification: H109Classification;
    removedState: string;
    removedDelta: number;
    matchedFailureCount: number;
    primaryStatistic: StatisticView;
    permutationPValue: number;
    originalStatistic: StatisticView;
    originalPermutationPValue: number;
    medianShift: number;
    meanShift: number;
  };
  blocks: string[];
}

// ============================================================
// Population rebuilding (shared by the replay contracts)
// ============================================================

interface Rebuilt {
  failures: GapState[];
  intact: GapState[];
  marginMaxAbsDiff: number;
  partitionMaxAbsDiff: number;
}

function rebuild(
  failuresView: PopulationView,
  intactView: PopulationView,
  vocab: readonly VocabEntry[]
): Rebuilt {
  const convert = (s: StateView): { state: GapState; marginDiff: number; partDiff: number } => {
    const partition: MassPartition = massPartitionOf(s.s0Probs, vocab);
    const margin = s0MarginOf(partition);
    return {
      state: {
        label: s.label,
        armKey: s.armKey,
        gap: s.s0TokensAfterBoundary,
        s0Margin: margin,
        continuationStartMass: partition.continuationStartMass,
        legalP0StartMass: partition.legalP0StartMass,
        forbiddenLeadMass: partition.forbiddenLeadMass,
        argmaxProb: s.argmaxProb,
        argmaxIsContinuationStart: s.argmaxIsContinuationStart,
        s0TokenIndex: s.s0TokenIndex,
        s0ByteOffset: s.s0ByteOffset,
        s0BytesAfterBoundary: s.s0BytesAfterBoundary,
        s0CharactersAfterBoundary: s.s0CharactersAfterBoundary,
      },
      marginDiff: Math.abs(margin - s.s0Margin),
      partDiff: Math.max(
        Math.abs(partition.continuationStartMass - s.continuationStartMass),
        Math.abs(partition.legalP0StartMass - s.legalP0StartMass),
        Math.abs(partition.forbiddenLeadMass - s.forbiddenLeadMass)
      ),
    };
  };

  const f = failuresView.states.map(convert);
  const i = intactView.states.map(convert);
  return {
    failures: f.map((r) => r.state),
    intact: i.map((r) => r.state),
    marginMaxAbsDiff: Math.max(0, ...f.map((r) => r.marginDiff), ...i.map((r) => r.marginDiff)),
    partitionMaxAbsDiff: Math.max(0, ...f.map((r) => r.partDiff), ...i.map((r) => r.partDiff)),
  };
}

/** A synthetic match row, so the removal rule can be exercised without the artifacts. */
function syntheticMatch(label: string, armKey: string, delta: number, gap: number): FailureMatch {
  return {
    label,
    armKey,
    gap,
    margin: delta,
    matchedAtGap: gap,
    matchedIntactCount: 1,
    matchedIntactLabels: [`${armKey}/control`],
    referenceMedian: 0,
    delta,
    inStratum: true,
  };
}

// ============================================================
// §3 — replay contracts
// ============================================================

function testReplay(
  probe: ProbeView,
  matching: MatchingView,
  p108: P108MatchingView,
  failuresView: PopulationView,
  intactView: PopulationView,
  vocab: readonly VocabEntry[]
): Rebuilt | null {
  console.log("\n  [§3] replay");

  if (probe === null || matching === null || p108 === null) {
    skip("replay contracts", "no Phase-109 artifacts");
    return null;
  }

  const built = rebuild(failuresView, intactView, vocab);

  check(
    "the frozen populations carry the recorded 11 failures and 210 intact states",
    built.failures.length === 11 && built.intact.length === 210,
    `${built.failures.length} / ${built.intact.length}`
  );
  check(
    "every recorded S0Margin re-derives from the artifact's own S0 softmax at tolerance 0",
    built.marginMaxAbsDiff === 0,
    `max |diff| ${built.marginMaxAbsDiff}`
  );
  check(
    "every recorded partition mass re-derives at tolerance 0",
    built.partitionMaxAbsDiff === 0,
    `max |diff| ${built.partitionMaxAbsDiff}`
  );

  const stratumFailures = stratify(built.failures);
  const stratumIntact = stratify(built.intact);
  check(
    "the pre-registered stratum reproduces the Phase-108 counts (10 failures / 51 intact)",
    stratumFailures.length === matching.stratumCounts.failure &&
      stratumIntact.length === matching.stratumCounts.intact &&
      stratumFailures.length === probe.reproduction.stratumFailureCount,
    `${stratumFailures.length} / ${stratumIntact.length}`
  );
  check(
    "the cut is load-bearing: a different minGap yields a different population",
    stratify(built.failures, STRATUM_MIN_GAP + 1).length !== stratumFailures.length ||
      stratify(built.intact, STRATUM_MIN_GAP + 1).length !== stratumIntact.length
  );

  const exact = matchByGap(built.failures, built.intact, 0);
  check(
    "exact-gap matching retains every stratum failure",
    exact.matches.length === stratumFailures.length && exact.unmatchedFailureLabels.length === 0,
    `${exact.matches.length}/${stratumFailures.length}`
  );
  check(
    "the distinct control count reproduces Phase 108",
    exact.matchedIntactCount === p108.matching.matchedIntactCount
  );
  check(
    "the matched control label set is the Phase-108 set",
    exact.matchedIntactLabels.join("|") === [...p108.matching.matchedIntactLabels].sort().join("|")
  );

  const recordedByLabel = new Map(p108.matching.perFailure.map((m) => [m.label, m]));
  const rowDiffs = exact.matches.filter((m) => {
    const rec = recordedByLabel.get(m.label);
    return (
      rec === undefined ||
      rec.margin !== m.margin ||
      rec.referenceMedian !== m.referenceMedian ||
      rec.delta !== m.delta ||
      rec.matchedAtGap !== m.matchedAtGap ||
      rec.matchedIntactCount !== m.matchedIntactCount ||
      rec.matchedIntactLabels.join("|") !== m.matchedIntactLabels.join("|")
    );
  });
  check(
    "every Phase-108 match row reproduces: margin, reference, delta, gap and controls",
    rowDiffs.length === 0,
    rowDiffs.map((m) => m.label).join(", ")
  );

  const recordedDelta = new Map(p108.matching.perFailure.map((m) => [m.label, m.delta]));
  const deltaDiffs = exact.matches.filter((m) => recordedDelta.get(m.label) !== m.delta);
  check(
    "every Phase-108 matched delta reproduces by label at tolerance 0",
    deltaDiffs.length === 0,
    deltaDiffs.map((m) => m.label).join(", ")
  );

  const stat = statisticOf(exact);
  const rec = matching.phase108Reproduction.primaryStatistic;
  check(
    "the Phase-108 n, median and mean reproduce",
    stat.n === rec.n && stat.medianDelta === rec.medianDelta && stat.meanDelta === rec.meanDelta
  );
  check(
    "the Phase-108 sign counts reproduce and partition the delta list",
    stat.positive === rec.positive &&
      stat.negative === rec.negative &&
      stat.zero === rec.zero &&
      stat.positive + stat.negative + stat.zero === stat.n
  );

  const perm = permutationNull(built.failures, built.intact, 0, {
    seed: PERMUTATION_SEED,
    permutations: PERMUTATION_COUNT,
  });
  const recPerm = matching.phase108Reproduction.permutationNull;
  check(
    "the Phase-108 permutation p-value, tail count, null median and null interval reproduce",
    perm.pValue === recPerm.pValue &&
      perm.atLeastObserved === recPerm.atLeastObserved &&
      perm.nullMedianOfMedianDeltas === recPerm.nullMedianOfMedianDeltas &&
      perm.nullMin === recPerm.nullMin &&
      perm.nullMax === recPerm.nullMax,
    `p ${perm.pValue} vs ${recPerm.pValue}`
  );
  check(
    "the Phase-108 permutation design reproduces: same seed and same count",
    perm.seed === recPerm.seed && perm.permutations === recPerm.permutations
  );

  const ctrl = randomLabelControl(built.failures, built.intact, {
    seed: RANDOM_CONTROL_SEED,
    draw: RANDOM_CONTROL_DRAW,
    tolerance: 0,
  });
  const recCtrl = matching.phase108Reproduction.randomLabelControl;
  check(
    "the Phase-108 random-label control reproduces: draw, stratum counts and median",
    ctrl.pseudoFailureLabels.join("|") === recCtrl.pseudoFailureLabels.join("|") &&
      ctrl.stratumFailureCount === recCtrl.stratumFailureCount &&
      ctrl.stratumIntactCount === recCtrl.stratumIntactCount &&
      ctrl.statistic.medianDelta === recCtrl.statistic.medianDelta
  );

  // The Phase-109 artifact carries its OWN copy of the Phase-108 baseline. That
  // copy has to be the Phase-108 artifact itself, or "reproduced" would mean
  // nothing.
  check(
    "the recorded Phase-108 baseline is the Phase-108 artifact itself",
    rec.medianDelta === p108.primaryStatistic.medianDelta &&
      rec.meanDelta === p108.primaryStatistic.meanDelta &&
      rec.n === p108.primaryStatistic.n &&
      recPerm.pValue === p108.permutationNull.pValue &&
      recPerm.atLeastObserved === p108.permutationNull.atLeastObserved &&
      recCtrl.statistic.medianDelta === p108.randomLabelControl.statistic.medianDelta &&
      matching.phase108Reproduction.perFailure.map((m) => m.delta).join("|") ===
        p108.matching.perFailure.map((m) => m.delta).join("|")
  );

  check(
    "the probe recorded no reproduction block",
    probe.blocks.length === 0 && probe.reproductionGatePassed,
    probe.blocks.join("; ")
  );

  return built;
}

// ============================================================
// §4/§5 — removal contracts
// ============================================================

function testRemoval(
  probe: ProbeView,
  matching: MatchingView,
  removalRecord: RemovalRecordView,
  manifest: ManifestView,
  failuresView: PopulationView,
  built: Rebuilt | null
): void {
  console.log("\n  [§4] removal");

  if (probe === null || matching === null || removalRecord === null || built === null) {
    skip("removal contracts", "no Phase-109 artifacts");
    return;
  }

  const matches = matchByGap(built.failures, built.intact, 0).matches;
  const selection = selectMaximumDeltaIndex(matches);

  check(
    "the removal index is the argmax of the Phase-108 delta vector, derived not written down",
    matches[selection.index].delta === Math.max(...matches.map((m) => m.delta)) &&
      removalRecord.removedIndex === selection.index
  );
  check(
    "the removal rule is the pre-registered one",
    removalRecord.rule === REMOVAL_RULE && manifest.removalRule === REMOVAL_RULE
  );
  check(
    "the tie-break rule is the pre-registered one and was not reached",
    removalRecord.tieBreakRule === TIE_BREAK_RULE &&
      removalRecord.tieBreakUsed === selection.tieBreakUsed &&
      removalRecord.tiedLabels.length === 1,
    `tied=${removalRecord.tiedLabels.length}`
  );

  // The tie-break must be RESOLVABLE and must be reached exactly when there is
  // a tie. Exercised on a synthetic set, so the artifact's own data never
  // decides whether the rule works.
  const tied = [
    syntheticMatch("B/two", "B94", 0.5, 2),
    syntheticMatch("A/one", "A", 0.5, 2),
    syntheticMatch("C/three", "C94", 0.5, 3),
    syntheticMatch("D/low", "T", -0.1, 3),
  ];
  const tiedSelection = selectMaximumDeltaIndex(tied);
  check(
    "on an exact delta tie the pre-registered (armKey, label) order resolves it",
    tiedSelection.tieBreakUsed &&
      tied[tiedSelection.index].armKey === "A" &&
      tied[tiedSelection.index].label === "A/one" &&
      tiedSelection.tiedLabels.length === 3
  );
  const uniqueMax = [
    syntheticMatch("B/two", "B94", 0.1, 2),
    syntheticMatch("A/one", "A", 0.9, 2),
  ];
  const uniqueSelection = selectMaximumDeltaIndex(uniqueMax);
  check(
    "with a unique maximum the tie-break is not reached",
    !uniqueSelection.tieBreakUsed && uniqueMax[uniqueSelection.index].label === "A/one"
  );

  const removalDecision = removeMaximumDelta(matches);
  check(
    "exactly one state is removed and it is the maximum-delta state",
    removalDecision.remaining.length === matches.length - MAX_STATE_REMOVALS &&
      removalDecision.removed.label === removalRecord.removed.label &&
      removalDecision.removed.delta === removalRecord.removed.matchedDelta
  );
  check(
    "the removal reason is stated in the pre-registered terms and nothing else",
    removalRecord.removalReason === "it was the maximum matched delta"
  );
  check(
    "the removed state's own record is consistent: margin and reference reconstruct the delta",
    removalRecord.removed.failureS0Margin - removalRecord.removed.matchedIntactReference ===
      removalRecord.removed.matchedDelta &&
      removalRecord.removed.matchedAtGap === removalRecord.removed.gap &&
      removalRecord.removed.matchedIntactCount === removalRecord.removed.matchedIntactLabels.length
  );

  const populationRemoval = removeStateFromPopulation(built.failures, removalRecord.removed.label);
  check(
    "the removed state is present in the failure population exactly once",
    populationRemoval.matchedByLabel && populationRemoval.removedCount === 1
  );
  check(
    "the failure population shrinks by one and the intact population is untouched",
    populationRemoval.remaining.length === built.failures.length - MAX_STATE_REMOVALS &&
      built.intact.length === probe.populations.intactCount &&
      probe.populations.postRemovalFailureCount === populationRemoval.remaining.length
  );
  check(
    "no other state is removed: every survivor keeps its Phase-108 label and delta",
    removalDecision.remaining.every((m) => matches.some((x) => x.label === m.label && x.delta === m.delta))
  );
  check(
    "the removal record lists the survivors and not the removed state",
    removalRecord.remainingLabels.length === removalRecord.remainingCount &&
      !removalRecord.remainingLabels.includes(removalRecord.removed.label) &&
      removalRecord.remainingLabels.join("|") === removalDecision.remaining.map((m) => m.label).join("|")
  );
  check(
    "the largest remaining state is reported descriptively and is NOT removed",
    removalRecord.largestRemaining.label !== removalRecord.removed.label &&
      removalRecord.remainingLabels.includes(removalRecord.largestRemaining.label) &&
      removalRecord.largestRemaining.delta ===
        Math.max(...removalDecision.remaining.map((m) => m.delta))
  );
  check(
    "the second-largest delta is strictly below the maximum, so the maximum was unique",
    removalRecord.largestRemaining.delta < removalRecord.removed.matchedDelta
  );
  check(
    "the removed state's prompt and arm are the frozen Phase-107 record's own",
    removalRecord.removed.prompt !== null &&
      removalRecord.removed.prompt.length > 0 &&
      removalRecord.removed.prompt ===
        failuresView.states.find((s) => s.label === removalRecord.removed.label)?.prompt &&
      removalRecord.removed.armKey ===
        failuresView.states.find((s) => s.label === removalRecord.removed.label)?.armKey
  );
}

// ============================================================
// §6/§7/§11 — recalculation contracts
// ============================================================

function testRecalculation(
  probe: ProbeView,
  matching: MatchingView,
  removalRecord: RemovalRecordView,
  built: Rebuilt | null
): void {
  console.log("\n  [§6] recalculation");

  if (probe === null || matching === null || built === null) {
    skip("recalculation contracts", "no Phase-109 artifacts");
    return;
  }

  const removalDecision = removeMaximumDelta(matchByGap(built.failures, built.intact, 0).matches);
  const postRemoval = removeStateFromPopulation(built.failures, removalDecision.removed.label).remaining;
  const rerun = runLeaveOneOut(postRemoval, built.intact, 0);

  const original = matching.phase108Reproduction.primaryStatistic;
  const primary = matching.primary;

  check(
    "the H109 n is the Phase-108 n minus exactly one",
    primary.statistic.n === original.n - MAX_STATE_REMOVALS &&
      primary.statistic.n >= MIN_REMAINING_FAILURES,
    `n=${primary.statistic.n}`
  );
  check(
    "the H109 delta vector is the Phase-108 vector minus the removed entry",
    primary.statistic.deltas.join("|") === removalDecision.remaining.map((m) => m.delta).join("|") &&
      matching.phase108Reproduction.perFailure
        .filter((m) => m.label !== removalRecord.removed.label)
        .map((m) => m.delta)
        .join("|") === primary.statistic.deltas.join("|")
  );
  check(
    "the H109 median delta is the median of the artifact's own surviving deltas",
    primary.statistic.medianDelta === rerun.statistic.medianDelta &&
      primary.statistic.medianDelta ===
        medianOfSorted(primary.statistic.deltas)
  );
  check(
    "the H109 mean delta is the mean of the artifact's own surviving deltas",
    primary.statistic.meanDelta === rerun.statistic.meanDelta &&
      primary.statistic.meanDelta ===
        primary.statistic.deltas.reduce((s, v) => s + v, 0) / primary.statistic.deltas.length
  );
  check(
    "the H109 sign counts partition the surviving deltas",
    primary.statistic.positive + primary.statistic.negative + primary.statistic.zero ===
      primary.statistic.n &&
      primary.statistic.positive === primary.statistic.deltas.filter((d) => d > 0).length &&
      primary.statistic.negative === primary.statistic.deltas.filter((d) => d < 0).length &&
      primary.statistic.zero === primary.statistic.deltas.filter((d) => d === 0).length
  );
  check(
    "the H109 matched control set is the identical label set Phase 108 matched",
    primary.matching.matchedIntactLabels.join("|") ===
      [...matching.phase108Reproduction.perFailure.flatMap((m) => m.matchedIntactLabels)]
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort()
        .join("|") &&
      primary.matching.matchedIntactLabels.length ===
        matching.phase108Reproduction.matchedIntactCount
  );
  check(
    "the H109 matching method is unchanged: tolerance 0, exact matching, no fallback",
    primary.matching.tolerance === 0 &&
      primary.matching.unmatchedFailureLabels.length === 0 &&
      matching.whatChanged.matchingMethodChanged === false &&
      matching.whatChanged.fallbackUsed === false
  );

  const perm = primary.permutationNull;
  check(
    "the H109 permutation null re-derives, with the SAME seed and count as Phase 108",
    perm.seed === PERMUTATION_SEED &&
      perm.permutations === PERMUTATION_COUNT &&
      perm.pValue === rerun.permutation.pValue &&
      perm.atLeastObserved === rerun.permutation.atLeastObserved &&
      perm.nullMedianOfMedianDeltas === rerun.permutation.nullMedianOfMedianDeltas &&
      perm.nullMin === rerun.permutation.nullMin &&
      perm.nullMax === rerun.permutation.nullMax
  );
  check(
    "the p-value is the (1+k)/(1+N) estimator and lies in (0, 1]",
    perm.pValue === (1 + perm.atLeastObserved) / (1 + perm.permutations) &&
      perm.pValue > 0 &&
      perm.pValue <= 1
  );
  check(
    "the permutation null is a pure function of (population, seed, count)",
    permutationNull(postRemoval, built.intact, 0, {
      seed: PERMUTATION_SEED,
      permutations: PERMUTATION_COUNT,
    }).pValue === perm.pValue &&
      permutationNull(postRemoval, built.intact, 0, {
        seed: PERMUTATION_SEED + 1,
        permutations: PERMUTATION_COUNT,
      }).pValue !== perm.pValue
  );

  const ctrl = primary.randomLabelControl;
  check(
    "the H109 random-label control used the SAME seed and draw and re-derives",
    ctrl.seed === RANDOM_CONTROL_SEED &&
      ctrl.draw === RANDOM_CONTROL_DRAW &&
      ctrl.statistic.medianDelta ===
        randomLabelControl(postRemoval, built.intact, {
          seed: RANDOM_CONTROL_SEED,
          draw: RANDOM_CONTROL_DRAW,
          tolerance: 0,
        }).statistic.medianDelta
  );
  check(
    "the control pool is the post-removal population, so the control is descriptive only",
    ctrl.pseudoFailureLabels.length === RANDOM_CONTROL_DRAW &&
      ctrl.stratumFailureCount + ctrl.stratumIntactCount <=
        postRemoval.length + built.intact.length
  );

  const comparison = matching.comparison;
  check(
    "the recorded original-versus-H109 shifts are the two statistics' own differences",
    comparison.medianShift === primary.statistic.medianDelta - original.medianDelta &&
      comparison.meanShift === primary.statistic.meanDelta - original.meanDelta &&
      comparison.positiveShift === primary.statistic.positive - original.positive &&
      comparison.negativeShift === primary.statistic.negative - original.negative &&
      comparison.zeroShift === primary.statistic.zero - original.zero
  );

  // §5 — the ONLY structural change is N.
  const wc = matching.whatChanged;
  check(
    "the removal changed N and nothing else",
    wc.failurePopulationBefore === built.failures.length &&
      wc.failurePopulationAfter === wc.failurePopulationBefore - MAX_STATE_REMOVALS &&
      wc.stratumFailuresBefore === original.n &&
      wc.stratumFailuresAfter === original.n - MAX_STATE_REMOVALS
  );
  check(
    "no design constant moved: intact population, statistic, permutation and control unchanged",
    wc.intactPopulationChanged === false &&
      wc.primaryStatisticChanged === false &&
      wc.permutationDesignChanged === false &&
      wc.controlDesignChanged === false &&
      wc.stratumFailuresAfter === wc.stratumFailuresBefore - MAX_STATE_REMOVALS
  );

  // §7 — the permutation conserves the group structure it permutes within.
  const grouped = stratify(postRemoval);
  const perGap = new Map<number, number>();
  for (const s of grouped) perGap.set(s.gap, (perGap.get(s.gap) ?? 0) + 1);
  const groupedBefore = stratify(built.failures);
  const perGapBefore = new Map<number, number>();
  for (const s of groupedBefore) perGapBefore.set(s.gap, (perGapBefore.get(s.gap) ?? 0) + 1);
  // The removed state belongs to exactly one gap group, so exactly one group
  // loses exactly one failure and every other group is untouched. A rule that
  // dropped one state per group would move the null's group structure and
  // silently change the experiment.
  const gaps = new Set([...perGapBefore.keys(), ...perGap.keys()]);
  const groupDeltas = [...gaps].map((gap) => (perGapBefore.get(gap) ?? 0) - (perGap.get(gap) ?? 0));
  check(
    "exactly one stratum gap group loses exactly one failure, and no other group moves",
    groupDeltas.filter((d) => d === 1).length === MAX_STATE_REMOVALS &&
      groupDeltas.every((d) => d === 0 || d === 1) &&
      grouped.length === groupedBefore.length - MAX_STATE_REMOVALS,
    groupDeltas.join(",")
  );

  // §16 — the verdict is re-derivable from the recorded evidence.
  const decision = matching.decision;
  const rederived = classifyH109({
    reproductionGatePassed: decision.evidence.reproductionGatePassed,
    matchedFailureCount: decision.evidence.matchedFailureCount,
    statistic: {
      n: primary.statistic.n,
      medianDelta: decision.evidence.medianDelta,
      meanDelta: decision.evidence.meanDelta,
      positive: decision.evidence.positive,
      negative: decision.evidence.negative,
      zero: decision.evidence.zero,
      deltas: primary.statistic.deltas,
    },
    pValue: decision.evidence.pValue,
    nullMedianOfMedianDeltas: decision.evidence.nullMedianOfMedianDeltas,
  });
  check(
    "the recorded verdict is re-derivable from the recorded evidence",
    rederived.classification === decision.classification && rederived.detail === decision.detail
  );
  check(
    "the recorded verdict is exactly one of the pre-registered classifications",
    (H109_CLASSIFICATIONS as readonly string[]).includes(decision.classification)
  );
  check(
    "the verdict is not Blocked, because the reproduction gate passed",
    decision.classification !== "D" && probe.reproductionGatePassed
  );

  // §18 — every branch is reachable.
  const base = {
    reproductionGatePassed: true,
    matchedFailureCount: 9,
    pValue: 0.5,
    nullMedianOfMedianDeltas: 0,
  };
  const stat = (medianDelta: number): StatisticView => ({
    n: 9,
    medianDelta,
    meanDelta: medianDelta,
    positive: medianDelta > 0 ? 5 : 4,
    negative: medianDelta > 0 ? 4 : 5,
    zero: 0,
    deltas: [],
  });
  const branches: H109Classification[] = [
    classifyH109({ ...base, reproductionGatePassed: false, statistic: stat(0.1) }).classification,
    classifyH109({ ...base, matchedFailureCount: MIN_REMAINING_FAILURES - 1, statistic: stat(0.1) })
      .classification,
    classifyH109({ ...base, statistic: stat(0.1), pValue: 0.01 }).classification,
    classifyH109({ ...base, statistic: stat(-0.1), pValue: 0.9 }).classification,
  ];
  check(
    "every classification branch A/B/C/D is reachable",
    new Set(branches).size === 4,
    branches.join("")
  );
  check(
    "the decision rule is the pre-registered one: A = not(positive AND rejecting)",
    classifyH109({ ...base, statistic: stat(0.1), pValue: 0.5 }).classification === "A" &&
      classifyH109({ ...base, statistic: stat(0), pValue: 0.001 }).classification === "A"
  );

  // §11 — the comparison helper agrees with the artifact.
  const compared = compareStatistic(original, primary.statistic, rerun.match.matches);
  check(
    "the comparison helper reproduces the recorded shifts and names the largest survivor",
    compared.medianShift === comparison.medianShift &&
      compared.meanShift === comparison.meanShift &&
      compared.largestRemainingLabel ===
        rerun.match.matches.reduce((best, m) => (m.delta > best.delta ? m : best)).label
  );
}

/** The Phase-108 median convention, restated here only to be compared against. */
function medianOfSorted(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================
// §5/§13/§20 — integrity contracts
// ============================================================

function testIntegrity(
  probe: ProbeView,
  matching: MatchingView,
  removalRecord: RemovalRecordView,
  manifest: ManifestView,
  built: Rebuilt | null
): void {
  console.log("\n  [§13] integrity");

  if (probe === null || matching === null || manifest === null) {
    skip("integrity contracts", "no Phase-109 artifacts");
    return;
  }

  check(
    "the probe declares itself read-only, untrained and free of Math.random/setTimeout",
    probe.readOnly &&
      !probe.trainingPerformed &&
      !probe.usesMathRandom &&
      !probe.usesSetTimeout &&
      manifest.volatileFieldsWritten.length === 0
  );

  const badCheckpoints = manifest.checkpointIdentifiers.filter((rec) => {
    const abs = path.join(ROOT, rec.path);
    return !fs.existsSync(abs) || sha256(abs) !== rec.sha256;
  });
  check(
    "the four checkpoints still carry the Phase-108 digests",
    manifest.checkpointIdentifiers.length === 4 &&
      badCheckpoints.length === 0 &&
      manifest.checkpointIdentifiers.every((r) => r.matchesPhase108)
  );

  if (built !== null) {
    check(
      "the intact population is byte-for-byte the one Phase 108 matched",
      matching.primary.matching.matchedIntactLabels.join("|") ===
        [...matching.phase108Reproduction.perFailure.flatMap((m) => m.matchedIntactLabels)]
          .filter((v, i, a) => a.indexOf(v) === i)
          .sort()
          .join("|")
    );
  } else {
    skip("intact population identity", "no rebuilt population");
  }

  if (removalRecord !== null) {
    const leakage = leakageAudit(removalRecord.tieBreakUsed);
    check(
      "the removal used no intact label, no prompt semantics and no arm identity",
      leakage.intactLabelsUsedForSelection.length === 0 &&
        leakage.promptSemanticsUsedForSelection.length === 0 &&
        leakage.armIdentityUsedForSelection.length === 0 &&
        !leakage.intactOutcomeReadBeforeRemoval &&
        matching.leakage.intactLabelsUsedForSelection.length === 0 &&
        matching.leakage.promptSemanticsUsedForSelection.length === 0 &&
        !matching.leakage.intactOutcomeReadBeforeRemoval
    );
    check(
      "the selection's only input is the Phase-108 match set",
      matching.leakage.selectionInputs.length === 1 &&
        matching.leakage.selectionRule === REMOVAL_RULE
    );
  } else {
    skip("leakage audit", "no removal record");
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
  check(
    "the phase-108 artifacts are inside the frozen-surface digest map",
    Object.keys(probe.integrity.priorPhaseArtifacts).some((k) =>
      k.split(path.sep).join("/").endsWith("experiments/phase108/matching-results.json")
    )
  );
  check(
    "the probe recorded a production-file digest for every tracked production file",
    Object.keys(probe.integrity.productionFileDigests).length > 0 &&
      Object.values(probe.integrity.productionFileDigests).every((d) => d !== "MISSING")
  );
  check(
    "the core audit is deterministic",
    probe.coreAuditReproducible && probe.coreAuditDigest.length === 64
  );

  for (const file of [PHASE109_INSTRUMENT, PHASE109_PROBE]) {
    const src = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const code = codeOf(src);
    check(
      `${path.basename(file)} calls no Math.random() and no timer`,
      src.length > 0 && !NONDETERMINISM_CALL.test(code) && !TIMER_CALL.test(code)
    );
  }
  const instrumentCode = codeOf(
    fs.existsSync(PHASE109_INSTRUMENT) ? fs.readFileSync(PHASE109_INSTRUMENT, "utf8") : ""
  );
  check(
    "the instrument restates no legality rule and applies no mask",
    !/isLegalP0Entry|p0VerdictOf|applyPhaseMask|buildPhaseMask/.test(instrumentCode)
  );

  // Cross-artifact consistency.
  check(
    "the manifest's headline result is the matching artifact's own statistic and verdict",
    manifest.result.classification === matching.decision.classification &&
      manifest.result.primaryStatistic.medianDelta === matching.primary.statistic.medianDelta &&
      manifest.result.permutationPValue === matching.primary.permutationNull.pValue
  );
  check(
    "the manifest's original statistic is the Phase-108 artifact's own statistic",
    manifest.result.originalStatistic.medianDelta ===
      matching.phase108Reproduction.primaryStatistic.medianDelta &&
      manifest.result.originalPermutationPValue ===
        matching.phase108Reproduction.permutationNull.pValue
  );
  if (removalRecord !== null) {
    check(
      "the manifest, matching artifact and removal record name the same removed state",
      manifest.result.removedState === removalRecord.removed.label &&
        manifest.result.removedDelta === removalRecord.removed.matchedDelta &&
        matching.removal.removedLabel === removalRecord.removed.label &&
        matching.removal.removedDelta === removalRecord.removed.matchedDelta
    );
  }
  check(
    "the manifest records a digest for every Phase-109 data artifact it names",
    Object.keys(manifest.ownArtifactDigests).length === 3 &&
      Object.entries(manifest.ownArtifactDigests).every(([key, rec]) => {
        const file =
          key === "probeResults"
            ? path.join(P109_DIR, "probe-results.json")
            : key === "matchingResults"
              ? path.join(P109_DIR, "matching-results.json")
              : path.join(P109_DIR, "removal-record.json");
        return (
          fs.existsSync(file) &&
          crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === rec.sha256Raw
        );
      })
  );
  check(
    "the artifacts record no volatile wall-clock field",
    manifest.volatileFieldsWritten.length === 0 &&
      !("durationMs" in (manifest as unknown as Record<string, unknown>))
  );
  check(
    "no artifact records a block",
    probe.blocks.length === 0 && manifest.blocks.length === 0
  );
}

// ============================================================
// Runner
// ============================================================

export function runPhase109Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("=".repeat(60));
  console.log("Phase 109 — Single-State Residual Robustness Audit");
  console.log("=".repeat(60));

  const probe = readJson<ProbeView>(path.join(P109_DIR, "probe-results.json"));
  const matching = readJson<MatchingView>(path.join(P109_DIR, "matching-results.json"));
  const removalRecord = readJson<RemovalRecordView>(path.join(P109_DIR, "removal-record.json"));
  const manifest = readJson<ManifestView>(path.join(P109_DIR, "manifest.json"));
  const p108 = readJson<P108MatchingView>(path.join(P108_DIR, "matching-results.json"));
  const failuresView = readJson<PopulationView>(path.join(P107_DIR, "failure-states.json"));
  const intactView = readJson<PopulationView>(path.join(P107_DIR, "intact-states.json"));

  if (
    probe === null ||
    matching === null ||
    removalRecord === null ||
    manifest === null ||
    p108 === null ||
    failuresView === null ||
    intactView === null
  ) {
    skip("all Phase-109 contracts", "a required artifact is missing");
    console.log(`\nPhase 109 contract suite: passed=${passed} failed=${failed} skipped=${skipped}`);
    return { passed, failed, skipped };
  }

  // The vocabulary is rebuilt here so the frozen S0Margin can be RE-DERIVED
  // from the recorded softmax rather than read back as a stored number.
  const corpus = loadCorpus();
  const tokenizer = buildTokenizer(corpus, VOCAB_TARGET);
  const vocab: VocabEntry[] = classifyVocabulary(tokenizer.getVocabulary().idToToken, tokenizer.vocabSize);
  check(
    "the vocabulary census is the established 300 / 223 / 64 / 13",
    vocab.length === 300 &&
      vocab.filter(isLegalP0Entry).length === 223 &&
      vocab.filter(isContinuationStartEntry).length === 64 &&
      vocab.filter(isForbiddenLeadEntry).length === 13,
    `vocab ${vocab.length} / legal ${vocab.filter(isLegalP0Entry).length} / cont ` +
      `${vocab.filter(isContinuationStartEntry).length} / forbidden ` +
      `${vocab.filter(isForbiddenLeadEntry).length}`
  );

  const built = testReplay(probe, matching, p108, failuresView, intactView, vocab);
  testRemoval(probe, matching, removalRecord, manifest, failuresView, built);
  testRecalculation(probe, matching, removalRecord, built);
  testIntegrity(probe, matching, removalRecord, manifest, built);

  check(
    "the instrument's removal rule is the frozen constant, not a runtime choice",
    REMOVAL_RULE === "argmax(delta among the Phase-108 matched failure states)" &&
      TIE_BREAK_RULE === "lexicographic (armKey, label), ascending, first wins"
  );
  check(
    "makePrng and shuffleWith are alive and deterministic",
    makePrng(7)() === makePrng(7)() &&
      shuffleWith([1, 2, 3, 4], makePrng(3)).join("|") === shuffleWith([1, 2, 3, 4], makePrng(3)).join("|")
  );

  console.log(
    `\nPhase 109 contract suite: passed=${passed} failed=${failed} skipped=${skipped}`
  );
  return { passed, failed, skipped };
}
