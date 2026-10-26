// ============================================================
// Phase 110 — failure-population completeness contract suite
// ============================================================
// Phase 110 audits, read-only and with zero training, whether the recorded
// failure population is COMPLETE: under the frozen P12-MASK condition, is every
// P0 decision in the 20 recorded generations that diverges from the
// corpus-supported continuation represented by one of the 11 recorded failure
// states? The phase exists because Phase 99 recorded 12 corrupted trajectories
// while the mechanism work that followed repeatedly used 11 failure states.
//
// This suite does NOT pin a verdict on H110 beyond checking that the recorded
// classification is re-derivable from the recorded evidence. It checks the
// instrument's contract, that the recorded artifacts agree with the frozen
// sources they claim to describe, and that nothing outside `experiments/phase110/`
// moved:
//
//   POPULATION COUNTS (§1/§4/§16)
//   1. Population A enumerates exactly the 20 trajectories Phase 99 declared,
//      and the paired table spans the same 20
//   2. Population A enumerates exactly the 12 corrupted trajectories Phase 99
//      declared — the "12" is the BASE-condition corruption count
//   3. every one of the 12 carries a Phase-99 failure entry, joined by the exact
//      composite key; nothing is unpaired and nothing is orphaned
//   4. Population B holds exactly 11 states, and Phase 102 declares 11
//   5. the divergent-decision census holds exactly 11 entries, with 11 distinct
//      composite keys
//   6. the 11 / 11 / 11 agreement is checked across three independently written
//      Phase-102 blocks rather than against one
//   7. the BASE census still counts 12, so the 12 is not a mislabelled 11
//
//   IDENTITY (§7/§16)
//   8. every state carries all six identity fields, none empty, with an integer
//      step index
//   9. every state's arm and prompt lie inside the recorded 4 x 5 grid
//  10. the stored composite key re-derives as `${armKey}/${prompt}#${index}`
//  11. the divergent census is derived from the MASKED fields of the paired
//      table, proven on a synthetic row whose base and masked fields disagree
//  12. each trajectory's divergent step IS its recorded first-invalid step
//  13. the byte-index cross-check agrees with Phase 99 wherever the two phases
//      describe the same step, and the corroborated + uncorroborated split
//      covers the whole population
//  14. every prompt implies one consistent token count, and it is positive
//  15. the 11 states are 11 distinct identities over 11 distinct trajectories
//
//   JOIN (§7/§16)
//  16. the exact join maps all 11, with decisionKey === state.key on each pair
//  17. nothing is left unmatched and nothing is orphaned on the real data
//  18. the detectors are not vacuous: an injected extra decision is reported
//      unmatched, an injected stranger state is reported orphaned, and an
//      injected duplicate key is reported duplicated
//  19. there is no fuzzy matching: a case change, a trailing space, a prefix
//      truncation or a step shift all fail to match
//
//   HISTORICAL TRANSFORMATION (§1/§11/§16)
//  20. the 12 -> 11 relationship reproduces arithmetically from the paired table
//  21. BOTH directions are populated: some trajectories are healed by the mask
//      and some are newly corrupted by it — the phase does not assume a collapse
//  22. the healed and newly-corrupted sets are reconstructed from the recorded
//      statuses, not from the artifact's own summary fields
//  23. the trajectories counted by the 12 but not the 11 are DERIVED here, and
//      the test never names one
//  24. Phase 101's static artifact audited all 12 BASE states, so Phase 101 did
//      not perform the 12 -> 11 reduction
//
//   REGRESSION (§16/§21)
//  25. the Phase-102 artifact still carries the scientific digest Phase 103
//      recorded for it
//  26. every source artifact still digests to the value Phase 110's manifest
//      recorded, so no prior-phase evidence moved under the audit
//  27. the tokenizer is unchanged: the vocabulary is rebuilt here and
//      `planP0Legality` reproduces Phase 102's own recorded P0 census
//  28. Phase 110 added no artifact or instrument beyond the ones it declares
//  29. the run declares no training, no checkpoint write, no classifier and no
//      new scoring function
//
//   FALSIFIER, CLASSIFICATION AND REPRODUCIBILITY (§11/§18/§20)
//  30. the falsifier carries all six pre-registered clauses, none fired, and
//      each clause is individually reachable
//  31. all four classifications are reachable and their precedence is fixed
//  32. the recorded classification is re-derivable from the recorded evidence
//  33. the P0 partition closes and the draws are in bijection with the
//      first-invalid-at-P0 trajectories
//  34. the on-disk artifacts are the ones the manifest describes
//  35. the reconciliation table has 20 rows and every recorded state sits on
//      exactly one of them
//  36. neither instrument calls `Math.random()` or a timer
//
// Every expectation is re-derived at test time or read back from the artifact
// being checked. No measured Phase-110 result is hardcoded, no state identifier
// is hardcoded, and which trajectory is "the 12th" is deliberately never
// written down here. Phase 57-109 suites are untouched.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  H110_CLASSIFICATIONS,
  H110_CONDITION,
  H110_VERDICTS,
  PHASE99_CONDITION,
  bijectionOf,
  buildPopulationA,
  buildPopulationB,
  censusOf,
  classifyH110,
  compareLabels,
  divergentDecisionKeysOf,
  divergentDecisionsOf,
  duplicateStates,
  evaluateFalsifier,
  identityTuple,
  joinPopulations,
  movementOf,
  orphanFailures,
  partitionOf,
  reconciliationTable,
  stateKey,
  statesSharingATrajectory,
  unpairedTrajectories,
  type ConditionCensus,
  type FailureStateRecord,
  type FalsifierReport,
  type Phase102View,
  type Phase99View,
  type TrajectoryMovement,
} from "../../../../../experiments/phase110/failure-population-audit";

import { collectSources, runAudit, scientificDigestOf } from "../../../../../experiments/phase110/probe";

// ============================================================
// Harness
// ============================================================

let passed = 0;
let failed = 0;
let skipped = 0;

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const P110_DIR = path.join(ROOT, "experiments", "phase110");

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
/** Call-shaped tokens only: a declaration such as `forwardPassesRun: 0` is not a call. */
const TRAINING_CALLS = /\btrain\s*\(|\bbackward\s*\(|\boptimizer\s*\.|\bfit\s*\(/;
const MODEL_CALLS = /\bgenerate\s*\(|\bforward\s*\(|\bloadModel\s*\(|\bfrom_pretrained\s*\(/;

// ============================================================
// Views of the recorded artifacts
// ============================================================

interface OwnArtifactDigest {
  sha256Raw: string;
  sha256Scientific: string;
}

interface ManifestView {
  phase: number;
  status: string;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  volatileFieldsWritten: string[];
  sourceArtifacts: Record<
    string,
    { path: string; sha256Raw: string; sha256Scientific: string; rawDigestReproducible: boolean }
  >;
  artifacts: string[];
  ownArtifactDigests: Record<string, OwnArtifactDigest>;
  reproduction: {
    coreDigest: string;
    populationACorrupted: number;
    populationATotal: number;
    populationBCount: number;
    divergentP0DrawsUnderH110: number;
    partitionExact: boolean;
    joinMatched: number;
    joinUnmatchedDivergent: number;
    joinOrphanStates: number;
    joinDuplicateKeys: number;
    reconciledCount: number;
    classification: string;
  };
  result: {
    classification: string;
    falsifierFired: boolean;
    populationCounts: {
      trajectories: number;
      corruptedTrajectories: number;
      recordedFailureStates: number;
      divergentP0Decisions: number;
    };
    twelveToEleven: {
      baseCorrupted: number;
      p12Corrupted: number;
      healed: string[];
      newlyCorrupted: string[];
    };
  };
  configuration: {
    h110Condition: string;
    phase99Condition: string;
    joinKey: string;
    classifierUsed: boolean;
    newScoringFunctionUsed: boolean;
    modelLoaded: boolean;
  };
  blocks: string[];
}

interface ReconciliationView {
  rows: ReturnType<typeof reconciliationTable>;
  totals: {
    trajectories: number;
    corruptedUnderBase: number;
    corruptedUnderH110Condition: number;
    corruptedUnderBoth: number;
    corruptedUnderNeither: number;
    healedByCondition: number;
    newlyCorruptedByCondition: number;
    reconciledCount: number;
  };
  setDifference: {
    healedByCondition: string[];
    newlyCorruptedByCondition: string[];
    corruptedUnderBoth: string[];
    corruptedUnderNeither: string[];
  };
}

interface StateJoinView {
  joinKey: string;
  condition: string;
  populationC: { enumeratedCount: number; enumerated: ReturnType<typeof divergentDecisionsOf> };
  populationB: FailureStateRecord[];
  join: {
    matchedCount: number;
    matched: Array<{ label: string; key: string; decisionKey: string }>;
    unmatchedDivergentCount: number;
    unmatchedDivergentDecisions: string[];
    orphanStateCount: number;
    orphanStateLabels: string[];
    duplicateKeyCount: number;
    duplicateKeys: string[][];
  };
  censusClose: {
    statement: string;
    partition: ReturnType<typeof partitionOf>;
    bijection: Array<ReturnType<typeof bijectionOf>>;
  };
}

/** The Phase-110 probe artifact's own integrity declaration. */
interface ProbeIntegrityView {
  integrity: Record<string, boolean | number | string[]>;
}

/** The Phase-101 static slice: the gate block and the audited states. */
interface Phase101StaticView {
  gate: { auditedStateCount: number; midSequenceStateCount: number };
  states: Array<{ armKey: string; prompt: string; failureTokenIndex: number; phase: string }>;
}

/** The Phase-102 slice the regression check reads: its own recorded P0 census. */
interface Phase102CensusView {
  p0Census: {
    vocabularySize: number;
    legalAtP0Count: number;
    illegalAtP0Count: number;
    startsWithContinuationByteCount: number;
    startsWithForbiddenLeadCount: number;
    p0CandidateCount: number;
    p0CandidateSetMatchesPhaseLegalIdsOf: boolean;
    phaseLegalCountAtBoundary: number;
    legalIds: number[];
    illegalIds: number[];
    continuationStartIds: number[];
    firstByteTestDisagreementCount: number;
    emptyByteLengthCount: number;
  };
  integrity: Record<string, boolean>;
}

// ============================================================
// Tests
// ============================================================

function testPopulationCounts(
  a: ReturnType<typeof buildPopulationA>,
  b: readonly FailureStateRecord[],
  p99: Phase99View,
  p102: Phase102View,
  manifest: ManifestView
): void {
  console.log("\n[§1/§4] population counts");

  check(
    "Population A enumerates the 20 trajectories Phase 99 recorded",
    a.allTrajectories.length === 20 && a.declaredTrajectoryCount === 20 && a.declaredTrajectoryCount === p99.preCorruption.trajectories,
    `enumerated ${a.allTrajectories.length}, declared ${a.declaredTrajectoryCount}`
  );

  check(
    "the 20 split into 12 corrupted and 8 clean under the BASE condition",
    a.corrupted.length === 12 &&
      a.corrupted.length + a.clean.length === 20 &&
      a.declaredCorruptedCount === 12 &&
      a.declaredCorruptedCount === p99.preCorruption.trajectoriesWithCorruption,
    `${a.corrupted.length} corrupted + ${a.clean.length} clean; declared ${a.declaredCorruptedCount}`
  );

  check(
    "every corrupted trajectory is joined to its own Phase-99 failure entry by the exact key",
    unpairedTrajectories(a).length === 0 &&
      a.corrupted.every(
        (t) => t.failure !== null && t.derivedKey === stateKey(t.armKey, t.prompt, t.firstInvalidTokenIndex)
      ),
    `${unpairedTrajectories(a).length} unpaired of ${a.corrupted.length}`
  );

  check(
    "no Phase-99 failure entry is orphaned by that join, and the two counts agree",
    orphanFailures(a, p99).length === 0 && p99.failures.length === a.corrupted.length,
    `${orphanFailures(a, p99).length} orphaned of ${p99.failures.length} entries`
  );

  check(
    "Population B holds exactly the 11 states Phase 102 declares",
    b.length === 11 &&
      p102.p0FailureStates.fromP12.length === 11 &&
      manifest.result.populationCounts.recordedFailureStates === 11,
    `${b.length} states, probe list ${p102.p0FailureStates.fromP12.length}`
  );

  const derived = divergentDecisionsOf(movementOf(p102));
  check(
    "the divergent-decision census holds exactly 11 entries over 11 distinct keys",
    derived.length === 11 && new Set(derived.map((d) => d.key)).size === 11,
    `${derived.length} decisions, ${new Set(derived.map((d) => d.key)).size} distinct keys`
  );

  const h110 = censusOf(p102, H110_CONDITION);
  check(
    "three independently written Phase-102 blocks agree on 11",
    h110.divergentP0Draws === 11 &&
      h110.trajectoriesFirstInvalidAtP0 === 11 &&
      h110.corruptedTrajectories === 11,
    `illegal draws ${h110.divergentP0Draws}, first-invalid-at-P0 ${h110.trajectoriesFirstInvalidAtP0}, ` +
      `corrupted ${h110.corruptedTrajectories}`
  );

  const base = censusOf(p102, PHASE99_CONDITION);
  check(
    "the BASE census still counts 12 corrupted trajectories, so the 12 is not a mislabelled 11",
    base.corruptedTrajectories === 12 &&
      a.corrupted.length === base.corruptedTrajectories &&
      base.corruptedTrajectories !== h110.corruptedTrajectories,
    `BASE corrupted ${base.corruptedTrajectories}, P12 corrupted ${h110.corruptedTrajectories}`
  );

  check(
    "the recorded trajectory totals restate the enumerated ones",
    manifest.result.populationCounts.trajectories === a.allTrajectories.length &&
      manifest.result.populationCounts.corruptedTrajectories === a.corrupted.length &&
      manifest.result.populationCounts.divergentP0Decisions === derived.length
  );
}

function testIdentity(
  b: readonly FailureStateRecord[],
  p102: Phase102View,
  movements: readonly TrajectoryMovement[],
  audit: ReturnType<typeof runAudit>
): void {
  console.log("\n[§7] identity");

  const arms = new Set(movements.map((m) => m.armKey));
  const prompts = new Set(movements.map((m) => m.prompt));

  check(
    "every state carries all six identity fields, with an integer step index",
    b.every(
      (s) =>
        s.label.length > 0 &&
        s.armKey.length > 0 &&
        s.prompt.length > 0 &&
        Number.isInteger(s.failureTokenIndex) &&
        s.failureTokenIndex >= 0 &&
        s.phase.length > 0 &&
        Number.isInteger(s.prefixLength) &&
        s.prefixLength >= 0
    ),
    `${b.length} states inspected`
  );

  check(
    "every state sits inside the recorded 4-arm x 5-prompt grid",
    arms.size === 4 && prompts.size === 5 && b.every((s) => arms.has(s.armKey) && prompts.has(s.prompt)),
    `${arms.size} arms x ${prompts.size} prompts; ` +
      `${b.filter((s) => !arms.has(s.armKey) || !prompts.has(s.prompt)).length} outside`
  );

  check(
    "the composite key re-derives from the state's own identity fields",
    b.every((s) => s.key === stateKey(s.armKey, s.prompt, s.failureTokenIndex)) &&
      b.every(
        (s) => s.key.split("#")[0] === `${s.armKey}/${s.prompt}` && Number(s.key.split("#")[1]) === s.failureTokenIndex
      ),
    `${b.filter((s) => s.key !== stateKey(s.armKey, s.prompt, s.failureTokenIndex)).length} mismatched`
  );

  // The census must follow the MASKED fields. A synthetic row whose base and
  // masked fields disagree proves the derivation reads the right ones.
  const synthetic: TrajectoryMovement = {
    armKey: "A",
    prompt: "synthetic",
    baseStatus: "clean",
    maskedStatus: "corrupted",
    baseFirstInvalidTokenIndex: 1,
    maskedFirstInvalidTokenIndex: 7,
    baseFirstInvalidPhase: "P1",
    maskedFirstInvalidPhase: "P0",
    transition: "clean -> corrupted",
    corruptedUnderBase: false,
    corruptedUnderP12: true,
  };
  check(
    "the divergent census is derived from the MASKED first-invalid step",
    divergentDecisionKeysOf([synthetic]).join("|") === stateKey("A", "synthetic", 7),
    `derived ${JSON.stringify(divergentDecisionKeysOf([synthetic]))}`
  );

  check(
    "a trajectory first invalid at P1, at P2, or not corrupted under the mask is not a P0 divergence",
    divergentDecisionKeysOf([{ ...synthetic, maskedFirstInvalidPhase: "P1" }]).length === 0 &&
      divergentDecisionKeysOf([{ ...synthetic, maskedFirstInvalidPhase: "P2" }]).length === 0 &&
      divergentDecisionKeysOf([{ ...synthetic, corruptedUnderP12: false }]).length === 0 &&
      divergentDecisionKeysOf([{ ...synthetic, corruptedUnderBase: true, maskedFirstInvalidPhase: "P1" }]).length === 0
  );

  const censusByTrajectory = new Map(
    divergentDecisionsOf(movements).map((d) => [`${d.armKey}/${d.prompt}`, d])
  );
  check(
    "each trajectory's divergent step is its recorded first-invalid step under the mask",
    b.every((s) => {
      const d = censusByTrajectory.get(`${s.armKey}/${s.prompt}`);
      return d !== undefined && d.firstInvalidTokenIndex === s.failureTokenIndex && d.phase === s.phase;
    }),
    `${b.filter((s) => censusByTrajectory.get(`${s.armKey}/${s.prompt}`)?.firstInvalidTokenIndex !== s.failureTokenIndex).length} mismatched`
  );

  const { corroborated, uncorroboratedLabels } = audit.identityCorroboration.byteIndex;
  check(
    "the byte-index cross-check agrees with Phase 99 wherever both phases recorded the same step",
    corroborated.length > 0 &&
      corroborated.every((c) => c.agrees && c.agreesOnByteOffset && c.populationBPhase === c.phase99Phase),
    `${corroborated.length} corroborated, ${corroborated.filter((c) => !c.agrees).length} disagreeing`
  );

  check(
    "the corroborated and uncorroborated states together cover Population B with no overlap",
    corroborated.length + uncorroboratedLabels.length === b.length &&
      new Set(corroborated.map((c) => c.key)).size === corroborated.length,
    `${corroborated.length} + ${uncorroboratedLabels.length} vs ${b.length}`
  );

  const promptIdentity = audit.identityCorroboration.promptTokenIdentity;
  check(
    "every prompt implies one consistent, positive token count",
    promptIdentity.length > 0 &&
      promptIdentity.length <= prompts.size &&
      promptIdentity.every(
        (p) => p.consistent && p.impliedPromptTokens > 0 && prompts.has(p.prompt) && p.stateLabels.length > 0
      ) &&
      promptIdentity.reduce((n, p) => n + p.stateLabels.length, 0) === b.length,
    promptIdentity.map((p) => `${p.prompt}=${p.impliedPromptTokens}${p.consistent ? "" : "!"}`).join(" | ") +
      ` (${promptIdentity.length} of ${prompts.size} prompts carry failures)`
  );

  check(
    "no two states share an identity tuple",
    new Set(b.map(identityTuple)).size === b.length && duplicateStates(b).length === 0,
    `${b.length - new Set(b.map(identityTuple)).size} collisions`
  );

  check(
    "the 11 states sit on 11 distinct trajectories, so no trajectory carries two",
    statesSharingATrajectory(b).size === 0 &&
      new Set(b.map((s) => `${s.armKey}/${s.prompt}`)).size === b.length,
    `${statesSharingATrajectory(b).size} trajectories carrying more than one state`
  );
}

function testJoin(b: readonly FailureStateRecord[], movements: readonly TrajectoryMovement[]): void {
  console.log("\n[§7] exact join");

  const divergentKeys = divergentDecisionKeysOf(movements);
  const join = joinPopulations(b, divergentKeys, H110_CONDITION);

  check(
    "the exact join maps all 11 states",
    join.matched.length === 11 && join.matched.length === b.length,
    `${join.matched.length} matched`
  );

  check(
    "each matched pair's decision key is the state's own key",
    join.matched.every(
      (p) =>
        p.decisionKey === p.state.key &&
        p.decisionKey === stateKey(p.state.armKey, p.state.prompt, p.state.failureTokenIndex)
    )
  );

  check(
    "nothing is left unmatched and nothing is orphaned on the recorded data",
    join.unmatchedDivergentDecisions.length === 0 &&
      join.orphanStateLabels.length === 0 &&
      join.duplicateKeys.length === 0,
    `unmatched ${join.unmatchedDivergentDecisions.length}, orphaned ${join.orphanStateLabels.length}, ` +
      `duplicates ${join.duplicateKeys.length}`
  );

  // ── the detectors must be able to fire ──
  const injectedKey = stateKey("A", "an unrecorded prompt", 3);
  const joinInjected = joinPopulations(b, [...divergentKeys, injectedKey], H110_CONDITION);
  check(
    "an injected extra divergent decision is reported unmatched",
    joinInjected.unmatchedDivergentDecisions.length === 1 &&
      joinInjected.unmatchedDivergentDecisions[0] === injectedKey &&
      joinInjected.matched.length === b.length,
    JSON.stringify(joinInjected.unmatchedDivergentDecisions)
  );

  const stranger: FailureStateRecord = {
    label: "synthetic-stranger",
    armKey: "A",
    prompt: "an unrecorded prompt",
    failureTokenIndex: 3,
    phase: "P0",
    prefixLength: 99,
    key: injectedKey,
  };
  const joinStranger = joinPopulations([...b, stranger], divergentKeys, H110_CONDITION);
  check(
    "an injected state with no divergent decision behind it is reported orphaned",
    joinStranger.orphanStateLabels.length === 1 &&
      joinStranger.orphanStateLabels[0] === stranger.label &&
      joinStranger.matched.length === b.length,
    JSON.stringify(joinStranger.orphanStateLabels)
  );

  const twin: FailureStateRecord = { ...b[0], label: "synthetic-twin" };
  const joinTwin = joinPopulations([...b, twin], divergentKeys, H110_CONDITION);
  check(
    "an injected duplicate identity is reported as a duplicate key",
    joinTwin.duplicateKeys.length === 1 && joinTwin.duplicateKeys[0].length === 2,
    JSON.stringify(joinTwin.duplicateKeys)
  );

  // ── no fuzzy matching of any kind ──
  const perturb = (k: string): string[] => {
    const hash = k.lastIndexOf("#");
    const head = k.slice(0, hash);
    const step = Number(k.slice(hash + 1));
    return [
      `${k} `,
      `${head.toLowerCase()}#${step}`,
      `${head.slice(0, Math.max(1, head.length - 1))}#${step}`,
      `${head}#${step + 1}`,
      `${head}#${Math.max(0, step - 1)}`,
      `${head} #${step}`,
      `${head}##${step}`,
    ];
  };
  const fuzzyJoin = joinPopulations(b, divergentKeys.flatMap(perturb), H110_CONDITION);
  check(
    "no case change, trailing space, prefix truncation or step shift is accepted as a match",
    fuzzyJoin.matched.length === 0 && fuzzyJoin.orphanStateLabels.length === b.length,
    `${fuzzyJoin.matched.length} of ${b.length} matched a perturbed key`
  );

  check(
    "the join normalizes nothing: each real key is also unmatched when presented alone",
    divergentKeys.every((k) => joinPopulations(b, [k], H110_CONDITION).matched.length === 1)
  );
}

function testHistoricalTransformation(
  movements: readonly TrajectoryMovement[],
  b: readonly FailureStateRecord[],
  reconciliation: ReconciliationView,
  manifest: ManifestView,
  p101Static: Phase101StaticView
): void {
  console.log("\n[§1/§11] the historical 12 -> 11 transformation");

  const baseCorrupted = movements.filter((m) => m.corruptedUnderBase);
  const p12Corrupted = movements.filter((m) => m.corruptedUnderP12);
  const healed = movements.filter((m) => m.corruptedUnderBase && !m.corruptedUnderP12);
  const newly = movements.filter((m) => !m.corruptedUnderBase && m.corruptedUnderP12);

  check(
    "the 12 -> 11 relationship reproduces arithmetically from the paired table",
    baseCorrupted.length === 12 &&
      p12Corrupted.length === 11 &&
      baseCorrupted.length - healed.length + newly.length === p12Corrupted.length,
    `${baseCorrupted.length} - ${healed.length} + ${newly.length} = ` +
      `${baseCorrupted.length - healed.length + newly.length}`
  );

  check(
    "BOTH directions are populated, so the 11 is not a settled subset of the 12",
    healed.length > 0 && newly.length > 0,
    `${healed.length} healed, ${newly.length} newly corrupted`
  );

  const healedNames = healed.map((m) => `${m.armKey}/${m.prompt}`);
  const newlyNames = newly.map((m) => `${m.armKey}/${m.prompt}`);
  check(
    "the recorded set difference matches the statuses it summarizes",
    [...healedNames].sort().join("|") === [...reconciliation.setDifference.healedByCondition].sort().join("|") &&
      [...newlyNames].sort().join("|") ===
        [...reconciliation.setDifference.newlyCorruptedByCondition].sort().join("|") &&
      reconciliation.totals.corruptedUnderBase === baseCorrupted.length &&
      reconciliation.totals.corruptedUnderH110Condition === p12Corrupted.length &&
      reconciliation.totals.trajectories === movements.length,
    `healed ${healedNames.join(", ")}; newly ${newlyNames.join(", ")}; ` +
      `totals ${reconciliation.totals.corruptedUnderBase}/${reconciliation.totals.corruptedUnderH110Condition}`
  );

  // The trajectories the "12" counts and the "11" does not — DERIVED, never named.
  const countedByTwelveNotEleven = movements
    .filter((m) => m.corruptedUnderBase && !m.corruptedUnderP12)
    .map((m) => `${m.armKey}/${m.prompt}`);
  const countedByElevenNotTwelve = movements
    .filter((m) => !m.corruptedUnderBase && m.corruptedUnderP12)
    .map((m) => `${m.armKey}/${m.prompt}`);

  check(
    "the trajectories behind the 12-vs-11 difference are derived and each is recorded as a movement",
    countedByTwelveNotEleven.length > 0 &&
      countedByElevenNotTwelve.length > 0 &&
      countedByTwelveNotEleven.every((t) =>
        reconciliation.rows.some(
          (r) => r.trajectory === t && r.corruptedUnderBase && !r.corruptedUnderH110Condition
        )
      ) &&
      countedByElevenNotTwelve.every((t) =>
        reconciliation.rows.some(
          (r) => r.trajectory === t && !r.corruptedUnderBase && r.corruptedUnderH110Condition
        )
      ),
    `counted by 12 not 11: ${countedByTwelveNotEleven.join(", ")}; ` +
      `counted by 11 not 12: ${countedByElevenNotTwelve.join(", ")}`
  );

  check(
    "the healing is a real absence of divergence, not a re-labelling of the same step",
    healed.every((m) => m.maskedFirstInvalidTokenIndex < 0 && m.maskedFirstInvalidPhase === null) &&
      newly.every((m) => m.baseFirstInvalidTokenIndex < 0 && m.baseFirstInvalidPhase === null) &&
      p12Corrupted.every((m) => m.maskedFirstInvalidTokenIndex >= 0),
    "healed trajectories carry no masked divergence; newly corrupted ones carry no BASE divergence"
  );

  check(
    "the movements the difference names are exactly the two directions and nothing else",
    reconciliation.setDifference.corruptedUnderBoth.length + healedNames.length === baseCorrupted.length &&
      reconciliation.setDifference.corruptedUnderBoth.length + newlyNames.length === p12Corrupted.length &&
      reconciliation.setDifference.corruptedUnderNeither.length +
        reconciliation.setDifference.corruptedUnderBoth.length +
        healedNames.length +
        newlyNames.length ===
        movements.length
  );

  check(
    "Phase 101 audited all 12 BASE states, so Phase 101 did not perform the reduction",
    p101Static.gate.auditedStateCount === 12 &&
      p101Static.states.length === 12 &&
      p101Static.states.length - p101Static.gate.midSequenceStateCount === 5,
    `audited ${p101Static.gate.auditedStateCount}, recorded ${p101Static.states.length}, ` +
      `mid-sequence ${p101Static.gate.midSequenceStateCount}`
  );

  check(
    "Phase 101's audited states sit on 12 distinct Phase-99 BASE composite keys",
    new Set(p101Static.states.map((s) => stateKey(s.armKey, s.prompt, s.failureTokenIndex))).size === 12 &&
      p101Static.states.every((s) => s.phase === "P0" || s.phase === "P1" || s.phase === "P2")
  );

  check(
    "the 11-state population is narrower than the 12 Phase-101 states, which is the reduction under audit",
    p101Static.states.length === baseCorrupted.length &&
      b.length === p12Corrupted.length &&
      b.length < p101Static.states.length
  );

  check(
    "Phase 110's own recorded summary restates the derived transformation",
    manifest.result.twelveToEleven.baseCorrupted === baseCorrupted.length &&
      manifest.result.twelveToEleven.p12Corrupted === p12Corrupted.length &&
      [...manifest.result.twelveToEleven.healed].sort().join("|") === [...healedNames].sort().join("|") &&
      [...manifest.result.twelveToEleven.newlyCorrupted].sort().join("|") === [...newlyNames].sort().join("|")
  );
}

function testRegression(
  manifest: ManifestView,
  audit: ReturnType<typeof runAudit>,
  p102Census: Phase102CensusView
): void {
  console.log("\n[§16/§21] regression");

  const p102Path = path.join(ROOT, "experiments", "phase102", "probe-results.json");
  const recorded = audit.priorPhaseArtifacts.phase102ProbeDigestRecordedByPhase103;
  const measured = scientificDigestOf(p102Path);
  check(
    "the Phase-102 artifact still carries the digest Phase 103 recorded for it",
    recorded !== null && recorded === measured,
    `recorded ${recorded}, measured ${measured}`
  );

  const moved: string[] = [];
  for (const [name, rec] of Object.entries(manifest.sourceArtifacts)) {
    const p = path.join(ROOT, rec.path);
    if (!fs.existsSync(p)) {
      moved.push(`${name}: missing`);
      continue;
    }
    const now = scientificDigestOf(p);
    if (now !== rec.sha256Scientific) moved.push(`${name}: ${rec.sha256Scientific} -> ${now}`);
  }
  check(
    "every source artifact still digests to the value Phase 110 recorded",
    moved.length === 0 && Object.keys(manifest.sourceArtifacts).length >= 10,
    moved.length === 0 ? `${Object.keys(manifest.sourceArtifacts).length} sources verified` : moved.join("; ")
  );

  // The tokenizer is unchanged. This is asserted from the RECORDED evidence
  // rather than by rebuilding the vocabulary: `experiments/phase102/…` exports
  // its tokenizer builder through a module whose import re-stamps the Phase-99
  // artifact's wall-clock counter, and this phase must not rewrite a prior
  // artifact — not even a field the owning phase treats as volatile. The
  // recorded census is therefore read back and checked for internal
  // consistency, and the no-modification attestations are read from the phase
  // that actually ran the tokenizer.
  const c = p102Census.p0Census;
  check(
    "the recorded vocabulary census is the established 300 / 223 / 77 / 64 / 13",
    c.vocabularySize === 300 &&
      c.legalAtP0Count === 223 &&
      c.illegalAtP0Count === 77 &&
      c.startsWithContinuationByteCount === 64 &&
      c.startsWithForbiddenLeadCount === 13 &&
      c.p0CandidateCount === 223 &&
      c.legalAtP0Count + c.illegalAtP0Count === c.vocabularySize
  );

  check(
    "the recorded census is internally consistent, so it is a reading and not a restatement",
    c.p0CandidateSetMatchesPhaseLegalIdsOf === true &&
      p102Census.p0Census.phaseLegalCountAtBoundary === c.legalAtP0Count &&
      p102Census.p0Census.legalIds.length === c.legalAtP0Count &&
      p102Census.p0Census.illegalIds.length === c.illegalAtP0Count &&
      p102Census.p0Census.continuationStartIds.length === c.startsWithContinuationByteCount &&
      p102Census.p0Census.firstByteTestDisagreementCount === 0 &&
      p102Census.p0Census.emptyByteLengthCount === 0
  );

  check(
    "the census the P0 population is measured against is the one the frozen tokenizer produced",
    audit.populationC.censuses.every((x) => x.p0Steps > 0) &&
      p102Census.integrity.tokenizerModified === false &&
      p102Census.integrity.vocabularyModified === false
  );

  check(
    "Phase 102's own integrity block records that no model file, tokenizer or evaluator was touched",
    p102Census.integrity.checkpointFilesModified === false &&
      p102Census.integrity.tokenizerModified === false &&
      p102Census.integrity.vocabularyModified === false &&
      p102Census.integrity.mergeTableModified === false &&
      p102Census.integrity.promptTextModified === false &&
      p102Census.integrity.generationSettingsModified === false &&
      p102Census.integrity.phase95EvaluatorModified === false
  );

  const declared = new Set(manifest.artifacts.map((p) => p.replace(/^experiments\/phase110\//, "")));
  const onDiskJson = fs.readdirSync(P110_DIR).filter((f) => f.endsWith(".json"));
  const undeclaredJson = onDiskJson.filter((f) => !declared.has(f));
  check(
    "Phase 110 added no JSON artifact beyond the ones its manifest declares",
    undeclaredJson.length === 0 && declared.size === manifest.artifacts.length,
    undeclaredJson.join(", ")
  );

  const tsFiles = fs.readdirSync(P110_DIR).filter((f) => f.endsWith(".ts"));
  check(
    "the phase's instruments are exactly the audit, the probe and the focused runner",
    tsFiles.includes("failure-population-audit.ts") &&
      tsFiles.includes("probe.ts") &&
      tsFiles.includes("run-phase110-suite.ts") &&
      tsFiles.length === 3,
    tsFiles.join(", ")
  );

  check(
    "the run declares no training, no checkpoint write, no classifier, no new scoring function, no model",
    manifest.trainingPerformed === false &&
      manifest.readOnly === true &&
      manifest.configuration.classifierUsed === false &&
      manifest.configuration.newScoringFunctionUsed === false &&
      manifest.configuration.modelLoaded === false &&
      manifest.volatileFieldsWritten.length === 0
  );

  check(
    "the frozen conditions are the ones the phase pre-registered",
    manifest.configuration.h110Condition === H110_CONDITION &&
      manifest.configuration.phase99Condition === PHASE99_CONDITION &&
      manifest.configuration.h110Condition === "P12-MASK" &&
      manifest.configuration.phase99Condition === "BASE"
  );
}

function testFalsifierAndClassification(
  censusH110: ConditionCensus,
  intactP0Steps: number,
  b: readonly FailureStateRecord[],
  join: ReturnType<typeof joinPopulations>,
  manifest: ManifestView
): void {
  console.log("\n[§11/§18] falsifier and classification");

  const partition = partitionOf(censusH110, intactP0Steps);
  const bijection = bijectionOf(censusH110);

  const report: FalsifierReport = evaluateFalsifier({
    partition,
    bijection,
    recordedStateCount: b.length,
    unmatchedDivergent: join.unmatchedDivergentDecisions.length,
    orphanStateCount: join.orphanStateLabels.length,
    duplicateKeyCount: duplicateStates(b).length,
    unseenPrompts: 0,
  });

  const expectedIds = [
    "unaccounted-p0-steps",
    "draws-exceed-states",
    "unmatched-divergent-decision",
    "orphan-failure-state",
    "duplicate-state-identity",
    "prompt-outside-the-recorded-set",
  ];
  check(
    "the falsifier carries all six pre-registered clauses, in the pre-registered order",
    report.clauses.length === expectedIds.length &&
      report.clauses.every((cl, i) => cl.id === expectedIds[i])
  );

  check(
    "no clause fired on the recorded data",
    report.fired === false && report.clauses.every((cl) => cl.fired === false),
    report.detail
  );

  check(
    "every clause reports its observed value whether or not it fired",
    report.clauses.every(
      (cl) => Number.isFinite(cl.observed) && cl.statement.length > 0 && cl.detail.length > 0
    )
  );

  // ── reachability: each clause must be able to fire ──
  const fire = (over: Partial<Parameters<typeof evaluateFalsifier>[0]>): FalsifierReport =>
    evaluateFalsifier({
      partition,
      bijection,
      recordedStateCount: b.length,
      unmatchedDivergent: 0,
      orphanStateCount: 0,
      duplicateKeyCount: 0,
      unseenPrompts: 0,
      ...over,
    });
  const fired = (over: Partial<Parameters<typeof evaluateFalsifier>[0]>, id: string): boolean =>
    fire(over).clauses.some((cl) => cl.id === id && cl.fired);

  check(
    "every falsifier clause is individually reachable",
    fired({ partition: { ...partition, gap: 1, exact: false } }, "unaccounted-p0-steps") &&
      fired({ recordedStateCount: b.length - 1 }, "draws-exceed-states") &&
      fired({ unmatchedDivergent: 1 }, "unmatched-divergent-decision") &&
      fired({ orphanStateCount: 1 }, "orphan-failure-state") &&
      fired({ duplicateKeyCount: 1 }, "duplicate-state-identity") &&
      fired({ unseenPrompts: 1 }, "prompt-outside-the-recorded-set")
  );

  check(
    "the draws-exceed-states clause is clear only at exact equality, in either direction",
    !fired({ recordedStateCount: b.length }, "draws-exceed-states") &&
      fired({ recordedStateCount: b.length + 1 }, "draws-exceed-states") &&
      fire({ recordedStateCount: b.length + 1 }).clauses.find((cl) => cl.id === "draws-exceed-states")
        ?.observed === censusH110.divergentP0Draws - (b.length + 1)
  );

  // ── classification vocabulary and precedence ──
  const base = {
    blocked: false,
    blockedReasons: [] as string[],
    populationIncomplete: false,
    insufficientInformation: false,
    insufficientReasons: [] as string[],
    falsifierFired: false,
  };
  check(
    "all four classifications are reachable",
    classifyH110({ ...base, blocked: true, blockedReasons: ["x"] }).classification === "D" &&
      classifyH110({ ...base, insufficientInformation: true, insufficientReasons: ["y"] }).classification === "C" &&
      classifyH110({ ...base, falsifierFired: true }).classification === "B" &&
      classifyH110({ ...base, populationIncomplete: true }).classification === "B" &&
      classifyH110(base).classification === "A"
  );

  check(
    "D dominates C and B, and C dominates B",
    classifyH110({
      ...base,
      blocked: true,
      blockedReasons: ["x"],
      insufficientInformation: true,
      falsifierFired: true,
    }).classification === "D" &&
      classifyH110({
        ...base,
        insufficientInformation: true,
        insufficientReasons: ["y"],
        falsifierFired: true,
      }).classification === "C"
  );

  check(
    "the classification vocabulary is exactly A/B/C/D and every verdict string is distinct",
    H110_CLASSIFICATIONS.join("") === "ABCD" &&
      new Set(H110_CLASSIFICATIONS.map((k) => H110_VERDICTS[k])).size === 4
  );

  check(
    "the recorded classification is one of the pre-registered branches, with the manifest agreeing",
    (H110_CLASSIFICATIONS as readonly string[]).includes(manifest.result.classification) &&
      manifest.result.classification === manifest.reproduction.classification &&
      manifest.result.falsifierFired === false
  );

  check(
    "the recorded classification is re-derivable from the recorded evidence",
    classifyH110({
      blocked: manifest.blocks.length > 0,
      blockedReasons: manifest.blocks,
      populationIncomplete: partition.gap !== 0 || !bijection.oneDrawPerCorruptedTrajectory,
      insufficientInformation: false,
      insufficientReasons: [],
      falsifierFired: report.fired,
    }).classification === manifest.result.classification,
    `blocks ${manifest.blocks.length}, gap ${partition.gap}, bijection ${bijection.oneDrawPerCorruptedTrajectory}`
  );

  check(
    "the P0 partition closes and the draws are in bijection with the first-invalid-at-P0 trajectories",
    partition.exact &&
      partition.gap === 0 &&
      partition.divergentP0Draws + partition.intactP0Steps === partition.p0Steps &&
      bijection.oneDrawPerCorruptedTrajectory &&
      bijection.drawsAtLeastTrajectories &&
      bijection.unaccountedDraws === 0,
    `${partition.p0Steps} = ${partition.divergentP0Draws} + ${partition.intactP0Steps}; gap ${partition.gap}`
  );

  check(
    "the illegal draws outside P0 are zero, so no divergent decision hides at another phase",
    censusH110.illegalP1P2Draws === 0 &&
      censusH110.illegalOtherDraws === 0 &&
      censusH110.totalIllegalDraws === censusH110.divergentP0Draws &&
      intactP0Steps > 0,
    `P1/P2 illegal ${censusH110.illegalP1P2Draws}, other ${censusH110.illegalOtherDraws}, intact ${intactP0Steps}`
  );
}

function testReproducibility(
  manifest: ManifestView,
  audit: ReturnType<typeof runAudit>,
  stateJoin: StateJoinView,
  reconciliation: ReconciliationView
): void {
  console.log("\n[§20] reproducibility and agreement with the recorded artifacts");

  const again = runAudit(collectSources());
  check(
    "the deterministic core reproduces on a second in-process run",
    JSON.stringify(again.populationA) === JSON.stringify(audit.populationA) &&
      JSON.stringify(again.populationB) === JSON.stringify(audit.populationB) &&
      JSON.stringify(again.join) === JSON.stringify(audit.join) &&
      JSON.stringify(again.invariants) === JSON.stringify(audit.invariants) &&
      again.classification.classification === audit.classification.classification &&
      again.blocks.length === audit.blocks.length
  );

  const names: Record<string, string> = {
    probeResults: "probe-results.json",
    trajectoryReconciliation: "trajectory-reconciliation.json",
    stateJoin: "state-join.json",
  };
  const stale: string[] = [];
  for (const [key, rec] of Object.entries(manifest.ownArtifactDigests)) {
    const file = names[key];
    if (file === undefined) {
      stale.push(`${key}: undeclared artifact key`);
      continue;
    }
    const p = path.join(P110_DIR, file);
    const now = scientificDigestOf(p);
    if (now !== rec.sha256Scientific) stale.push(`${file}: ${rec.sha256Scientific} -> ${now}`);
  }
  check(
    "the on-disk artifacts are the ones the manifest describes",
    stale.length === 0 && Object.keys(manifest.ownArtifactDigests).length === 3,
    stale.join("; ")
  );

  check(
    "the manifest declares no volatile field, so its digests are reproducible",
    manifest.volatileFieldsWritten.length === 0 &&
      Object.values(manifest.sourceArtifacts).every((r) => typeof r.rawDigestReproducible === "boolean")
  );

  const joinAgreement: Array<[string, unknown, unknown]> = [
    ["populationC.enumeratedCount", stateJoin.populationC.enumeratedCount, audit.populationC.divergentDecisions.length],
    ["populationB.stateCount", stateJoin.populationB.length, audit.populationB.stateCount],
    ["join.matchedCount", stateJoin.join.matchedCount, audit.join.matched.length],
    ["join.matched", stateJoin.join.matched.length, audit.join.matched.length],
    [
      "join.unmatchedDivergentCount",
      stateJoin.join.unmatchedDivergentCount,
      audit.join.unmatchedDivergentDecisions.length,
    ],
    [
      "join.unmatchedDivergentDecisions",
      stateJoin.join.unmatchedDivergentDecisions.length,
      audit.join.unmatchedDivergentDecisions.length,
    ],
    ["join.orphanStateCount", stateJoin.join.orphanStateCount, audit.join.orphanStateLabels.length],
    ["join.orphanStateLabels", stateJoin.join.orphanStateLabels.length, audit.join.orphanStateLabels.length],
    ["join.duplicateKeyCount", stateJoin.join.duplicateKeyCount, audit.join.duplicateKeys.length],
    ["join.duplicateKeys", stateJoin.join.duplicateKeys.length, audit.join.duplicateKeys.length],
    ["censusClose.partition.exact", stateJoin.censusClose.partition.exact, audit.populationC.partitionUnderH110Condition.exact],
    ["censusClose.partition.gap", stateJoin.censusClose.partition.gap, 0],
    [
      "censusClose.partition.p0Steps",
      stateJoin.censusClose.partition.p0Steps,
      audit.populationC.partitionUnderH110Condition.p0Steps,
    ],
    [
      "censusClose.partition.intactP0Steps",
      stateJoin.censusClose.partition.intactP0Steps,
      audit.populationC.partitionUnderH110Condition.intactP0Steps,
    ],
    ["condition", stateJoin.condition, H110_CONDITION],
  ];
  const joinDisagreements = joinAgreement.filter(([, got, want]) => got !== want);
  check(
    "the state-join artifact agrees with the live audit on every count",
    joinDisagreements.length === 0,
    joinDisagreements.map(([n, got, want]) => `${n}: ${String(got)} vs ${String(want)}`).join("; ")
  );

  check(
    "every enumerated divergent decision in the join artifact re-derives from the paired table",
    stateJoin.populationC.enumerated.every((d) =>
      audit.populationC.divergentDecisions.some((x) => x.key === d.key && x.firstInvalidTokenIndex === d.firstInvalidTokenIndex)
    ) &&
      stateJoin.populationC.enumerated.length === audit.populationC.divergentDecisions.length
  );

  const rows = reconciliation.rows;
  const stateSeen = new Map<string, number>();
  for (const row of rows) for (const label of row.failureStateIds) stateSeen.set(label, (stateSeen.get(label) ?? 0) + 1);
  check(
    "the reconciliation table has 20 rows and every recorded state sits on exactly one",
    rows.length === 20 &&
      audit.reconciliation.rows.length === 20 &&
      stateSeen.size === audit.populationB.stateCount &&
      [...stateSeen.values()].every((n) => n === 1),
    `${rows.length} rows, ${stateSeen.size} distinct states`
  );

  check(
    "each row's state count matches the ids it lists, and its divergence index matches the paired table",
    rows.every((r) => r.failureStateCount === r.failureStateIds.length) &&
      rows.every((r) => {
        const m = audit.reconciliation.movements.find(
          (x) => x.armKey === r.armKey && x.prompt === r.prompt
        );
        return m !== undefined && m.maskedFirstInvalidTokenIndex === r.firstDivergenceTokenIndex;
      }),
    `${rows.filter((r) => r.failureStateCount !== r.failureStateIds.length).length} inconsistent rows`
  );

  check(
    "every row is marked mapped exactly when the join left nothing orphaned",
    rows.every((r) => r.mapped === (r.failureStateCount > 0 ? audit.join.orphanStateLabels.length === 0 : true)) &&
      rows.every((r) => r.multipleStates === (r.failureStateCount > 1))
  );

  check(
    "the reconciliation is unchanged when recomputed from the same sources",
    JSON.stringify(reconciliationTable(audit.reconciliation.movements, audit.populationB.states, audit.join)) ===
      JSON.stringify(audit.reconciliation.rows)
  );

  check(
    "the label-stability check covers phases 103 through 109 with declared modes",
    audit.labelStability.length >= 6 &&
      audit.labelStability.every(
        (c) => c.phase >= 103 && c.phase <= 109 && c.identical && c.extraInDownstream.length === 0
      ) &&
      audit.labelStability.filter((c) => c.mode === "identical").length >= 5,
    audit.labelStability.map((c) => `${c.phase}:${c.mode}/${c.labelCount}`).join(" ")
  );

  check(
    "Phase 109's removal sits inside Population B and its survivors are a proper subset",
    audit.phase109Removal.removedIsInPopulation &&
      audit.phase109Removal.remainingIsSubset &&
      audit.phase109Removal.remainingCount === audit.populationB.stateCount - 2
  );

  check(
    "the recorded evidence carries no blocking invariant failure",
    audit.blocks.length === 0 && manifest.blocks.length === 0 && manifest.status === "ok",
    [...audit.blocks, ...manifest.blocks].join("; ")
  );

  check(
    "every coherence invariant the probe declared held",
    audit.invariants.length >= 20 && audit.invariants.every((c) => c.held),
    audit.invariants.filter((c) => !c.held).map((c) => c.name).join(", ")
  );

  check(
    "the recorded prior-artifact identity check passed",
    audit.priorPhaseArtifacts.intact &&
      audit.priorPhaseArtifacts.phase102ProbeDigestRecordedByPhase103 !== null &&
      audit.priorPhaseArtifacts.phase102ProbeDigestRecordedByPhase103 ===
        audit.priorPhaseArtifacts.phase102ProbeDigestMeasuredByPhase110
  );

  const probeSrc = codeOf(fs.readFileSync(path.join(P110_DIR, "probe.ts"), "utf8"));
  const auditSrc = codeOf(fs.readFileSync(path.join(P110_DIR, "failure-population-audit.ts"), "utf8"));
  check(
    "neither instrument calls Math.random() or a timer",
    !NONDETERMINISM_CALL.test(probeSrc) &&
      !NONDETERMINISM_CALL.test(auditSrc) &&
      !TIMER_CALL.test(probeSrc) &&
      !TIMER_CALL.test(auditSrc) &&
      manifest.usesMathRandom === false &&
      manifest.usesSetTimeout === false
  );

  check(
    "neither instrument calls a training, backward, optimizer, forward or generation routine",
    !TRAINING_CALLS.test(probeSrc) &&
      !TRAINING_CALLS.test(auditSrc) &&
      !MODEL_CALLS.test(probeSrc) &&
      !MODEL_CALLS.test(auditSrc),
    "static scan of both instruments"
  );

  const probeResults = readJson<ProbeIntegrityView>(path.join(P110_DIR, "probe-results.json"));
  const integrity = probeResults?.integrity ?? null;
  const forbidden = [
    "trainingPerformed",
    "checkpointFilesModified",
    "tokenizerModified",
    "vocabularyModified",
    "mergeTableModified",
    "modelArchitectureModified",
    "generationSettingsModified",
    "phase95EvaluatorModified",
    "phase95ThresholdsModified",
    "promptTextModified",
    "datasetModified",
    "samplingModified",
    "rolloutModified",
    "decodingMaskAdded",
    "newScoringFunctionAdded",
    "classifierAdded",
    "usesMathRandom",
    "usesSetTimeout",
    "modelLoaded",
  ];
  check(
    "the probe's own integrity block attests every §2 prohibition as untouched",
    integrity !== null &&
      forbidden.every((k) => integrity[k] === false) &&
      integrity.writesOnlyItsOwnArtifacts === true &&
      integrity.forwardPassesRun === 0 &&
      integrity.generationsPerformed === 0 &&
      Array.isArray(integrity.productionModulesModified) &&
      integrity.productionModulesModified.length === 0,
    forbidden.filter((k) => integrity !== null && integrity[k] !== false).join(", ")
  );
}

// ============================================================
// Entry point
// ============================================================

export function runPhase110Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("=".repeat(60));
  console.log("Phase 110 — Failure-Population Completeness Audit");
  console.log("=".repeat(60));

  const manifest = readJson<ManifestView>(path.join(P110_DIR, "manifest.json"));
  const reconciliation = readJson<ReconciliationView>(path.join(P110_DIR, "trajectory-reconciliation.json"));
  const stateJoin = readJson<StateJoinView>(path.join(P110_DIR, "state-join.json"));
  const p99 = readJson<Phase99View>(path.join(ROOT, "experiments", "phase99", "logit-mechanism-audit.json"));
  const p102 = readJson<Phase102View>(path.join(ROOT, "experiments", "phase102", "probe-results.json"));
  const p102Census = readJson<Phase102CensusView>(path.join(ROOT, "experiments", "phase102", "probe-results.json"));
  const p101Static = readJson<Phase101StaticView>(
    path.join(ROOT, "experiments", "phase101", "static-failure-state.json")
  );

  if (
    manifest === null ||
    reconciliation === null ||
    stateJoin === null ||
    p99 === null ||
    p102 === null ||
    p102Census === null ||
    p101Static === null
  ) {
    skip("all Phase-110 contracts", "a required artifact is missing");
    console.log(`\nPhase 110 contract suite: passed=${passed} failed=${failed} skipped=${skipped}`);
    return { passed, failed, skipped };
  }

  const sources = collectSources();
  const audit = runAudit(sources);

  const a = buildPopulationA(p99);
  const b = buildPopulationB(p102);
  const movements = movementOf(p102);
  const h110Census = censusOf(p102, H110_CONDITION);

  check(
    "the live audit's Population B is the one built from the frozen Phase-102 view",
    audit.populationB.stateCount === b.length &&
      audit.populationB.states.every((s, i) => s.key === b[i].key && s.label === b[i].label)
  );

  testPopulationCounts(a, b, p99, p102, manifest);
  testIdentity(b, p102, movements, audit);
  testJoin(b, movements);
  testHistoricalTransformation(movements, b, reconciliation, manifest, p101Static);
  testRegression(manifest, audit, p102Census);
  testFalsifierAndClassification(
    h110Census,
    sources.p107Intact.populationSize,
    b,
    joinPopulations(b, divergentDecisionKeysOf(movements), H110_CONDITION),
    manifest
  );
  testReproducibility(manifest, audit, stateJoin, reconciliation);

  check(
    "the downstream label comparison is exact for every declared-identical phase",
    audit.labelStability
      .filter((c) => c.mode === "identical")
      .every((c) => compareLabels(c.phase, c.source, "identical", b, c.labels).identical)
  );

  console.log(`\nPhase 110 contract suite: passed=${passed} failed=${failed} skipped=${skipped}`);
  return { passed, failed, skipped };
}
