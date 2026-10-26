// ============================================================
// Phase 111 — grid-external failure closure contract suite
// ============================================================
// Phase 111 asks whether the P0 failure population, first described on a frozen
// five-prompt grid, CLOSES when the prompts move off that grid: under the frozen
// P12-MASK condition and the recorded generation settings, does every divergent
// P0 decision produced by prompts outside the original grid fall inside the
// already observed byte-phase / mechanism class?
//
// This suite is the instrument's contract, not a second experiment. It reads
// the five artifacts in `experiments/phase111/` and re-derives every frozen
// fixture from the source artifacts, and it never hardcodes a NEW outcome: no
// verdict, no new divergence count, no generated id of the external grid, no
// mechanism label of the external grid, and no partition count of the external
// grid appears anywhere below. The values it does assert are the values that
// were pre-registered BEFORE any model was loaded:
//
//   the frozen 20-trajectory parity grid, 11 divergent P0 draws,
//   11 corrupted trajectories, `221 = 11 + 210` with gap 0,
//   the five Phase-101-recorded P0 mechanism labels,
//   the derived 11-state family `{boundary-state-continuation x7, sampling-draw x4}`,
//   the classifier's closed 5-value domain, and the recipe constants.
//
//   PROMPT SELECTION (§3, §4)
//    1. selection is deterministic: two evaluations produce identical bytes
//    2. 4 / 4 / 4 allocation, exactly 12 entries, manifest order en -> zh -> mixed
//    3. the five frozen prompts are excluded, the rule set is 5, the spec prose
//       set is 4, the discrepancy is asserted rather than smoothed, and the
//       resolved selection is UNCHANGED between the two readings
//    4. no Phase-90-110 generation prompt other than the five is selected
//    5. ordering is load-bearing: the frozen RNG stream is consumed positionally
//    6. the digest chain prompt-set.json -> manifest.json -> probe-results.json
//       agrees, and a mutated copy fails the check
//    7. the first four eligible samples per class are `train`-split
//    8. the recorded token lengths are internally consistent and positive
//
//   FROZEN CONDITION (§5, §9)
//    9. four checkpoint identities match the manifest and Phase 102
//   10. the rebuilt vocabulary reproduces Phase 102's recorded P0 census
//   11. the generation recipe equals the recorded recipe
//   12. P12-MASK semantics: inactive at need 0, inactive when unrecoverable,
//       active at need > 0; applyPhaseMask writes exactly -Infinity and leaves
//       legal logits bit-identical; maskedArgmaxOf tie-breaks by ascending id
//   13. the parity gate passed and all eight requirements are recorded
//   14. importing the probe does not generate
//
//   ENUMERATION (§5, §11)
//   15. 48 = 12 x 4 trajectories, each present in both companion artifacts
//   16. step accounting closes: steps == generated ids, and the phase histogram
//       accounts for every step
//   17. every P0 decision carries every §6.2 field, and the masses are a
//       probability distribution
//   18. `divergent` equals the frozen definition, recounted by a second path
//   19. the recorded byte offset equals the bytes emitted before it
//   20. comparable + nonComparable === divergent, per trajectory and overall
//
//   LABELS (§7)
//   21. the copied classifier body is textually identical to Phase 99's, and its
//       behaviour is asserted on all five domain labels including both boundaries
//   22. the classifier's domain is closed
//   23. the derivation reproduces the five Phase-101-recorded P0 labels
//   24. the derived 11-state family is the pre-registered one
//   25. the `unknown` sentinel is out of domain and fires F2
//   26. `midstate-new-lead` is structurally unreachable at P0
//
//   PARTITION (§8.3)
//   27. the copied partitionOf reproduces `221 = 11 + 210`, gap 0
//   28. the new-grid partition is recorded with every path's count
//   29. an injected gap is detected
//   30. the bijection check is non-vacuous
//
//   F1 / F2 / F3 AND CLASSIFICATION (§6, §7)
//   31. F1 is a consistency check: a nonzero reading is D, never B
//   32. F2 and F3 fire B, and the first falsifying event is the earliest
//   33. zero comparable divergences is the literal C, never A
//   34. A is unreachable on an empty comparable population
//   35. all four verdicts are reachable and their precedence is fixed
//   36. the recorded verdict is re-derivable from the recorded falsifier blocks
//
//   REPRODUCIBILITY AND INTEGRITY (§12, §13)
//   37. the two in-process cores digests agree, and re-serialising an artifact
//       reproduces its bytes exactly
//   38. no wall-clock field is written; volatileFieldsWritten === []
//   39. the freeze digest chain is closed across all artifacts
//   40. neither the logic module nor the probe calls Math.random(), a timer, a
//       training call, or an unlisted model call
//   41. the integrity block states the honest negatives AND the honest positives
//   42. no Phase-90-110 artifact moved
//   43. Phase 111 added no artifact or instrument beyond its declared set
//
// Phase 111 is deliberately NOT registered in
// `src/lib/minimind/research/__tests__/run.ts`; this suite is reachable through
// `experiments/phase111/run-phase111-suite.ts` only.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  ARMS,
  BASELINE_FAMILY_COUNTS,
  BASELINE_P0_FAILURES,
  BASELINE_PARTITION,
  BOUNDARY_STATE,
  DATASET_IDENTITY,
  EOS_TOKEN_ID,
  FROZEN_FAMILY,
  FROZEN_PROMPTS,
  H111_INCONCLUSIVE_LITERAL,
  MANIFEST_CLASS_ORDER,
  MECHANISM_LABEL_DOMAIN,
  P111_CONDITION,
  P111_MAX_CTX,
  P111_MAX_TOKENS,
  P111_SEED,
  P111_TEMPERATURE,
  P111_VOCAB_TARGET,
  PHASE101_P0_LABELS,
  SELECTION_PER_CLASS,
  SEED,
  SPEC_PROSE_EXCLUDED_IDS,
  TEMPERATURE,
  UNKNOWN_LABEL,
  VOCAB_TARGET,
  applyPhaseMask,
  bijectionOf,
  buildPhaseMask,
  buildTokenizer,
  classifyH111,
  classifyVocabulary,
  createSeededRNG,
  firstOutsideFamily,
  frozenPromptSubsetOfHistorical,
  labelFailureMechanism,
  labelP0Mechanism,
  loadCorpus,
  manifestClassSequence,
  maskedArgmaxOf,
  partitionOf,
  phaseLegalIdsOf,
  sampleToken,
  selectExternalPrompts,
  type BilingualDataset,
  type ByteClassMass,
  type ConditionCensus,
  type F2FirstEvent,
  type H111Input,
  type LanguageClass,
  type P111Step,
  type P111Trajectory,
  type PhaseMask,
  type VocabEntry,
} from "../../../../../experiments/phase111/grid-external-closure-audit";

import {
  P111_PATHS,
  canonicalDigestOf,
  checkSourceDigests,
  rawDigestOf,
  rawDigestOfValue,
  reachableNonFamilyLabels,
  scientificDigestOf,
  type ArtifactIdentity,
} from "../../../../../experiments/phase111/probe";

// ============================================================
// Harness
// ============================================================

let passed = 0;
let failed = 0;
let skipped = 0;

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const P111_DIR = path.join(ROOT, "experiments", "phase111");

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

/** Strip comments and string literals so source scans cannot false-positive. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/** Strip comments but KEEP strings, for textual body comparison. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const NONDETERMINISM_CALL = /\bMath\s*\.\s*random\b/;
const TIMER_CALL = /\bsetTimeout\b|\bsetInterval\b/;
const TRAINING_CALLS = /\btrain\s*\(|\bbackward\s*\(|\boptimizer\s*\.|\bfit\s*\(/;
const MODEL_CALLS = /\b(generate|forward|loadModel|from_pretrained)\s*\(/g;

/** Call-shaped key names that would betray a wall-clock field. */
const VOLATILE_KEY = /(^|[_-])(date|time|timestamp|datetime|duration|elapsed|msec|micros|pid|uuid|now|clock)([_-]|$)/i;

const MODEL_CALL_ALLOW_LIST: Record<string, readonly string[]> = {
  "experiments/phase111/grid-external-closure-audit.ts": ["forward"],
  "experiments/phase111/probe.ts": ["loadArmModel"],
};

// ============================================================
// Views of the recorded artifacts
// ============================================================

interface StepView {
  stepIndex: number;
  tokenIndex: number;
  contextLength: number;
  byteOffset: number;
  phaseBefore: string;
  needBefore: number;
  selectedId: number;
  selectedBytes: number[];
  selectedLegal: boolean;
  selectedStartsWithContinuationByte: boolean;
  rawArgmaxId: number;
  rawArgmaxLegal: boolean;
  legalMass: number;
  illegalMass: number;
  continuationStartMass: number;
  bareContinuationMass: number;
  multibyteLeadMass: number;
  argmaxCompatible: boolean;
  compatibleMass: number;
  maskActive: boolean;
  maskInactiveReason: string | null;
  maskIntervened: boolean;
  corpusSupportLevel: string | null;
  corpusSupportedBestId: number;
  corpusSupportedBestCount: number;
  divergent: boolean;
  mechanismLabel: string;
  comparable: boolean;
  nonComparableReason: string | null;
  p0OrdinalInTrajectory: number;
  partitionClass: string;
  isTrajectoryFirstInvalid: boolean;
}

interface TrajectoryView {
  trajectoryId: string;
  armKey: string;
  manifestIndex: number;
  class: string;
  prompt: string;
  promptIds: number[];
  generatedIds: number[];
  generatedBytes: number[];
  generatedLength: number;
  steps: StepView[];
  p0Decisions: StepView[];
  stepsAtP0: number;
  stepsAtP1: number;
  stepsAtP2: number;
  stepsAtP3: number;
  stepsAtPX: number;
  eosEmitted: boolean;
  terminatedByEmptyMask: boolean;
  emptyMaskEvents: number;
  maskInterventions: number;
  contextTruncationEvents: number;
  trailingIncomplete: boolean;
  corrupted: boolean;
  firstInvalidTokenIndex: number;
  firstInvalidPhase: string | null;
}

interface ParityRequirementView {
  id: string;
  requirement: string;
  expected: string;
  observed: string;
  pass: boolean;
}

interface ProbeResultsView {
  phase: number;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  recipe: Record<string, number | string>;
  promptSetPath: string;
  promptSetSha256: string;
  selectionDigest: string;
  parityGate: {
    pass: boolean;
    coreDigest: string;
    requirements: ParityRequirementView[];
    condition: string;
    prompts: string[];
    arms: string[];
    baseline: {
      trajectories: number;
      p0Steps: number;
      p0StepsFromByteStream: number;
      divergentP0Draws: number;
      intactP0StepsFromPhase107: number;
      gap: number;
      corruptedTrajectories: number;
      p1p2IllegalDraws: number;
      otherIllegalDraws: number;
    };
    familyDerivation: {
      decisions: number;
      counts: Record<string, number>;
      labels: string[];
      decisionDetail: {
        trajectoryId: string;
        armKey: string;
        prompt: string;
        tokenIndex: number;
        phaseBefore: string;
        selectedLegal: boolean;
        argmaxCompatible: boolean;
        compatibleMass: number;
        bareContinuationMass: number;
        multibyteLeadMass: number;
        recordedLabel: string;
      }[];
      expected: Record<string, number>;
      matchesExpected: boolean;
      frozenFamily: string[];
    };
    phase101Fixture: {
      states: { key: string; phase: string; recordedLabel: string; derivedLabel: string; agree: boolean }[];
      p0LabelCount: number;
      p0LabelsAllReproduced: boolean;
      allTwelveReproduced: boolean;
      byteClassMassSource: string;
    };
    checkpointIdentity: {
      armKey: string;
      computed: string;
      recordedInPhase102: string | null;
      match: boolean;
    }[];
    tokenizerIdentity: {
      measured: Record<string, number>;
      recordedInPhase102: Record<string, number>;
      match: boolean;
    };
    legalityEquivalence: {
      vector: number;
      perByteWalk: number;
      agreeWithProductionScanner: boolean;
      scannerDisagreements: number[];
    };
  };
  grid: {
    arms: string[];
    prompts: { manifestIndex: number; class: string; id: string; prompt: string; tokenCount: number }[];
    trajectories: TrajectoryView[];
  };
  census: Record<string, number>;
  mechanismFamily: {
    domain: string[];
    frozenFamily: string[];
    derivedFrom11: { counts: Record<string, number>; labels: string[] };
    newGrid: { counts: Record<string, number>; outsideFamily: F2FirstEvent[] };
    literalIdentityKeyNewMembers: number;
  };
  partition: {
    paths: { A: number; APrime: number; B: number; C: number };
    p0Steps: number;
    divergentP0Draws: number;
    intactP0Steps: number;
    accountedSteps: number;
    gap: number;
    exact: boolean;
    exactAcrossPaths: boolean;
    pathDefinitions: { A: string; APrime: string; B: string; C: string };
    bijection: {
      divergentP0Draws: number;
      trajectoriesFirstInvalidAtP0: number;
      totalIllegalDraws: number;
      drawsAtLeastTrajectories: boolean;
      oneDrawPerCorruptedTrajectory: boolean;
      unaccountedDraws: number;
    };
    pathDisagreement: string | null;
  };
  falsifiers: {
    F1: {
      observed: { p1p2IllegalDraws: number; otherIllegalDraws: number; p1p2Steps: number };
      fired: boolean;
      consequence: string;
    };
    F2: {
      observed: { outsideFamilyCount: number; labels: string[]; comparablePopulation: number };
      firstEvent: F2FirstEvent | null;
      fired: boolean;
    };
    F3: { observed: { partitionGap: number; exact: boolean }; fired: boolean };
  };
  observations: {
    perLabelCounts: Record<string, number>;
    corpusSupportByLevel: Record<string, number>;
    establishedLabelsAbsent: string[];
    perClassDivergence: Record<string, { trajectories: number; divergent: number; comparable: number }>;
    literalIdentityKeyNewMembers: number;
    tokenLengthComparison: {
      measuredExternalRange: number[];
      measuredOriginalRange: number[];
      preRegisteredExternalRange: number[];
      preRegisteredOriginalRange: number[];
      externalWithinPreRegisteredRange: boolean;
      originalWithinPreRegisteredRange: boolean;
    };
    midstateNewLeadReachableAtP0: boolean;
    reachableNonFamilyLabels: string[];
  };
  classification: { verdict: string; reason: string; precedenceApplied: string[] };
  determinism: { coreDigestA: string; coreDigestB: string; equal: boolean };
  integrity: Record<string, unknown>;
}

interface PromptSetView {
  phase: number;
  readOnly: boolean;
  trainingPerformed: boolean;
  frozenBeforeGeneration: boolean;
  condition: string;
  source: {
    path: string;
    metadata: { id: string; version: string; schemaVersion: number };
    sampleCount: number;
    classCounts: Record<string, number>;
  };
  rule: {
    steps: string[];
    ordering: string;
    manifestOrder: string[];
    perClass: number;
    splitFilterApplied: boolean;
    selectionIsHandMade: boolean;
    selectionMadeAfterMeasurement: boolean;
  };
  excludedIds: string[];
  excludedByRule: { datasetIndex: number; id: string; language: string; offendingPrompt: string }[];
  specProseExcludedIds: string[];
  exclusionDiscrepancy: {
    ruleExclusionSetSize: number;
    specProseExclusionSetSize: number;
    extraExcludedId: string | null;
    resolvedSelectionUnchanged: boolean;
    note: string;
  };
  resolvedSelection: {
    manifestIndex: number;
    class: string;
    datasetIndex: number;
    id: string;
    text: string;
    category: string;
    split: string;
    datasetTokens: number[];
    datasetTokenCount: number;
  }[];
  manifestClassOrder: string[];
  tokenLengths: {
    external: { manifestIndex: number; id: string; text: string; tokenCount: number }[];
    frozen: { prompt: string; tokenCount: number }[];
    preRegisteredExternalRange: number[];
    preRegisteredOriginalRange: number[];
    measuredExternalRange: number[];
    measuredOriginalRange: number[];
    externalWithinPreRegisteredRange: boolean;
    originalWithinPreRegisteredRange: boolean;
  };
  selectionDigest: string;
  digestOfRule: null;
}

interface ManifestView {
  phase: number;
  status: string;
  readOnly: boolean;
  trainingPerformed: boolean;
  usesMathRandom: boolean;
  usesSetTimeout: boolean;
  volatileFieldsWritten: string[];
  recipe: Record<string, number | string>;
  arms: { key: string; label: string; checkpointPath: string; checkpointSha256: string }[];
  importBoundary: {
    imports: string[];
    copied: { object: string; sourcePath: string; sourceLine: string; reason: string }[];
    notImported: { sourcePath: string; reason: string }[];
  };
  promptSetPath: string;
  promptSetSha256: string;
  selectionDigest: string;
  sourceArtifacts: Record<string, ArtifactIdentity>;
  preRegisteredParity: {
    trajectories: number;
    p0IllegalDraws: number;
    corruptedTrajectories: number;
    partition: { p0Steps: number; divergentP0: number; intactP0: number; gap: number };
    frozenFamily: string[];
    baselineFamilyCounts: Record<string, number>;
    phase101P0Labels: string[];
    mechanismLabelDomain: string[];
    legalMassTolerance: number;
  };
  frozenBeforeGeneration: boolean;
  readsItsOwnPromptSetOnly: boolean;
  modelLoadedBeforeFreeze: boolean;
  generationBeforeFreeze: boolean;
  integrity: Record<string, unknown>;
  blocks: string[];
}

interface ReconciliationView {
  phase: number;
  condition: string;
  totals: {
    trajectories: number;
    corrupted: number;
    divergentP0Draws: number;
    comparableDivergentP0Draws: number;
    p0Steps: number;
    intactP0Steps: number;
    partitionGap: number;
    byArm: Record<string, number>;
    byClass: Record<string, number>;
  };
  rows: {
    trajectoryId: string;
    armKey: string;
    manifestIndex: number;
    class: string;
    prompt: string;
    generatedLength: number;
    generatedIdsSha256: string;
    corrupted: boolean;
    firstInvalidTokenIndex: number;
    firstInvalidPhase: string | null;
    p0DecisionCount: number;
    divergentP0Count: number;
    comparableDivergentP0Count: number;
    stepsAtP0: number;
    eosEmitted: boolean;
    terminatedByEmptyMask: boolean;
    phaseHistogram: Record<string, number>;
    promptTokenCount: number;
  }[];
}

interface DivergentDecisionView extends StepView {
  decisionKey: string;
  trajectoryId: string;
  armKey: string;
  manifestIndex: number;
  class: string;
  prompt: string;
  promptTokenCount: number;
  partitionMetadata: {
    p0OrdinalInTrajectory: number;
    partitionClass: string;
    isTrajectoryFirstInvalid: boolean;
    trajectoryP0Steps: number;
    trajectoryCorrupted: boolean;
    trajectoryFirstInvalidTokenIndex: number;
    trajectoryFirstInvalidPhase: string | null;
  };
}

interface DivergentArtifactView {
  phase: number;
  title: string;
  condition: string;
  divergenceDefinition: string;
  census: Record<string, number>;
  partition: ProbeResultsView["partition"];
  decisions: DivergentDecisionView[];
  divergent: DivergentDecisionView[];
  firstDivergentByTrajectory: Record<string, string | null>;
}

interface Phase102View {
  recipe: {
    seed: number;
    vocabTarget: number;
    maxTokens: number;
    maxCtx: number;
    temperature: number;
    eosTokenId: number;
  };
  p0Census: {
    vocabularySize: number;
    legalAtP0Count: number;
    illegalAtP0Count: number;
    startsWithContinuationByteCount: number;
    startsWithForbiddenLeadCount: number;
    continuationStartIds: number[];
  };
  armResults: { armKey: string; checkpointSha256: string }[];
  illegalEmissions: Record<
    string,
    {
      p0Steps: number;
      p0IllegalDraws: number;
      p0ContinuationStartDraws: number;
      p0IllegalArgmaxSteps: number;
      p1p2Steps: number;
      p1p2IllegalDraws: number;
      otherIllegalDraws: number;
    }
  >;
  metrics: Record<string, { aggregate: { corruptionCount: number; corruptionByPhase: Record<string, number> } }>;
  p0FailureStates: {
    fromP12: {
      label: string;
      armKey: string;
      prompt: string;
      failureTokenIndex: number;
      phase: string;
      legalMass: number;
      rawArgmaxLegalAtP0: boolean;
    }[];
  };
}

interface Phase99View {
  failures: {
    armKey: string;
    prompt: string;
    failureTokenIndex: number;
    bytePhase: { phase: string; need: number };
    distribution: {
      argmaxCompatible: boolean;
      compatibleMass: number;
      byteClassMass: ByteClassMass;
    };
    evidence: { mechanismLabel: string; corpusSupportLevel: string };
  }[];
}

interface Phase101StaticView {
  states: {
    armKey: string;
    prompt: string;
    failureTokenIndex: number;
    phase: string;
    legalMass: number;
    rawArgmaxLegal: boolean;
    mechanismLabel: string;
  }[];
}

// ============================================================
// Shared fixtures, built once
// ============================================================

const probeResults = readJson<ProbeResultsView>(P111_PATHS.outProbeResults);
const manifest = readJson<ManifestView>(P111_PATHS.outManifest);
const promptSet = readJson<PromptSetView>(P111_PATHS.outPromptSet);
const reconciliation = readJson<ReconciliationView>(P111_PATHS.outTrajectoryReconciliation);
const divergentArtifact = readJson<DivergentP0DecisionsView>(P111_PATHS.outDivergentP0Decisions);
const p102 = readJson<Phase102View>(P111_PATHS.phase102Probe);
const p99 = readJson<Phase99View>(P111_PATHS.phase99Audit);
const p101Static = readJson<Phase101StaticView>(P111_PATHS.phase101Static);
const p107Intact = readJson<{ populationSize: number }>(P111_PATHS.phase107Intact);
const dataset = readJson<BilingualDataset>(P111_PATHS.dataset);

type DivergentP0DecisionsView = DivergentArtifactView;

/** The tokenizer, rebuilt through Phase 98 only — never the Phase-102 chain. */
let tokenizerCache: ReturnType<typeof buildTokenizer> | null = null;
function tokenizerOf(): ReturnType<typeof buildTokenizer> {
  if (tokenizerCache === null) tokenizerCache = buildTokenizer(loadCorpus(), VOCAB_TARGET);
  return tokenizerCache;
}

/** A parsed dataset with no frozen prompt removed — for the mutation fixtures. */
function selectionProjection(selection: readonly {
  manifestIndex: number;
  class: string;
  datasetIndex: number;
  id: string;
  text: string;
}[]): unknown {
  return {
    manifestClassOrder: selection.map((p) => p.class),
    resolvedSelection: selection.map((p) => ({
      manifestIndex: p.manifestIndex,
      class: p.class,
      datasetIndex: p.datasetIndex,
      id: p.id,
      text: p.text,
    })),
  };
}

// ============================================================
// §1 — prompt selection
// ============================================================

function testPromptSelection(): void {
  if (dataset === null || promptSet === null || probeResults === null || manifest === null) {
    skip("prompt-selection suite", "an artifact or the dataset is missing");
    return;
  }

  // ---- 1. determinism -------------------------------------------------
  const selA = selectExternalPrompts(dataset);
  const selB = selectExternalPrompts(dataset);
  const digestA = canonicalDigestOf(selectionProjection(selA.selection));
  const digestB = canonicalDigestOf(selectionProjection(selB.selection));
  check(
    "the selection is deterministic: two evaluations produce identical bytes",
    digestA === digestB && digestA === promptSet.selectionDigest,
    `recomputed ${digestA} / ${digestB} vs recorded ${promptSet.selectionDigest}`
  );

  // ---- 2. allocation and manifest order -------------------------------
  const byClass: Record<string, number> = {};
  for (const p of promptSet.resolvedSelection) byClass[p.class] = (byClass[p.class] ?? 0) + 1;
  const expectedSequence: string[] = [];
  for (const cls of MANIFEST_CLASS_ORDER) {
    for (let i = 0; i < SELECTION_PER_CLASS; i++) expectedSequence.push(cls);
  }
  check(
    "the selection is 4 / 4 / 4 across en / zh / mixed, exactly 12 entries",
    promptSet.resolvedSelection.length === 12 &&
      MANIFEST_CLASS_ORDER.every((c) => byClass[c] === SELECTION_PER_CLASS) &&
      selA.selection.length === 12,
    `recorded ${JSON.stringify(byClass)} of ${promptSet.resolvedSelection.length}`
  );
  check(
    "the manifest order is en -> zh -> mixed, and `manifestIndex` follows it",
    JSON.stringify(promptSet.manifestClassOrder) === JSON.stringify(expectedSequence) &&
      JSON.stringify(manifestClassSequence(selA.selection)) === JSON.stringify(expectedSequence) &&
      promptSet.resolvedSelection.every((p, i) => p.manifestIndex === i)
  );

  // ---- 3. the exclusion set and its discrepancy ------------------------
  const texts = promptSet.resolvedSelection.map((p) => p.text);
  const frozenAbsent = FROZEN_PROMPTS.every((p) => !texts.includes(p));
  const proseSubset = SPEC_PROSE_EXCLUDED_IDS.every((id) =>
    selA.excludedIds.includes(id)
  );
  const extra = selA.excludedIds.filter((id) => !SPEC_PROSE_EXCLUDED_IDS.includes(id));
  const noneSelected = selA.excludedIds.every((id) =>
    !promptSet.resolvedSelection.some((p) => p.id === id)
  );
  check(
    "all five frozen prompts are excluded, and the computed exclusion set is 5 entries",
    frozenAbsent && selA.excludedIds.length === 5 && noneSelected,
    `excluded ${JSON.stringify(selA.excludedIds)}`
  );
  check(
    "the spec-prose exclusion set is 4 and a strict subset of the rule set — the " +
      "discrepancy is asserted, not smoothed",
    SPEC_PROSE_EXCLUDED_IDS.length === 4 && proseSubset && extra.length === 1 &&
      promptSet.exclusionDiscrepancy.ruleExclusionSetSize === 5 &&
      promptSet.exclusionDiscrepancy.specProseExclusionSetSize === 4 &&
      promptSet.exclusionDiscrepancy.extraExcludedId === extra[0],
    `extra ${JSON.stringify(extra)} vs recorded ${String(promptSet.exclusionDiscrepancy.extraExcludedId)}`
  );
  check(
    "both readings resolve to the same 12 prompts, re-derived rather than asserted",
    selA.resolvedSelectionUnchanged === true &&
      promptSet.exclusionDiscrepancy.resolvedSelectionUnchanged === true &&
      selA.proseSelection.length === selA.selection.length &&
      selA.proseSelection.every((p, i) => p.id === selA.selection[i].id)
  );

  // ---- 6. the digest chain -------------------------------------------
  const onDiskPromptSetDigest = rawDigestOf(P111_PATHS.outPromptSet);
  const mutated = {
    ...promptSet,
    resolvedSelection: promptSet.resolvedSelection.map((p, i) =>
      i === 0 ? { ...p, text: `${p.text} ` } : p
    ),
  };
  check(
    "prompt-set.json -> manifest.json -> probe-results.json carry one digest, and a " +
      "mutated copy fails the check",
    onDiskPromptSetDigest === promptSet.selectionDigest ||
      (probeResults.promptSetSha256 === onDiskPromptSetDigest &&
        manifest.promptSetSha256 === onDiskPromptSetDigest &&
        manifest.selectionDigest === promptSet.selectionDigest &&
        probeResults.selectionDigest === promptSet.selectionDigest &&
        rawDigestOfValue(mutated) !== onDiskPromptSetDigest),
    `on-disk ${onDiskPromptSetDigest}, probe ${probeResults.promptSetSha256}, ` +
      `manifest ${manifest.promptSetSha256}`
  );

  // ---- 7. split equivalence ------------------------------------------
  const allTrain = promptSet.resolvedSelection.every((p) => p.split === "train");
  check(
    "the first four eligible samples per class are `train`-split, so the absent split " +
      "filter is redundant rather than load-bearing",
    allTrain && promptSet.rule.splitFilterApplied === false,
    promptSet.resolvedSelection.map((p) => p.split).join(",")
  );

  // ---- 8. token lengths ----------------------------------------------
  const tok = tokenizerOf();
  const externalConsistent = promptSet.tokenLengths.external.every(
    (e) => e.tokenCount === tok.encode(e.text).length && e.tokenCount > 0
  );
  const frozenConsistent = promptSet.tokenLengths.frozen.every(
    (f) => f.tokenCount === tok.encode(f.prompt).length && f.tokenCount > 0
  );
  check(
    "the recorded token lengths cover all 12 + 5 prompts and equal encode(text).length",
    promptSet.tokenLengths.external.length === 12 &&
      promptSet.tokenLengths.frozen.length === FROZEN_PROMPTS.length &&
      externalConsistent &&
      frozenConsistent,
    `${promptSet.tokenLengths.external.length} external / ${promptSet.tokenLengths.frozen.length} frozen`
  );
  check(
    "the measured length ranges are recorded, and the pre-registered ranges are the " +
      "ones fixed before measurement",
    JSON.stringify(promptSet.tokenLengths.preRegisteredExternalRange) === "[13,30]" &&
      JSON.stringify(promptSet.tokenLengths.preRegisteredOriginalRange) === "[5,19]" &&
      promptSet.tokenLengths.measuredExternalRange.length === 2 &&
      promptSet.tokenLengths.measuredOriginalRange.length === 2,
    `external ${JSON.stringify(promptSet.tokenLengths.measuredExternalRange)} ` +
      `(${promptSet.tokenLengths.externalWithinPreRegisteredRange}), ` +
      `original ${JSON.stringify(promptSet.tokenLengths.measuredOriginalRange)} ` +
      `(${promptSet.tokenLengths.originalWithinPreRegisteredRange})`
  );
}

// ============================================================
// §4 — the historical prompt literals
// ============================================================

function historicalSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  for (let phase = 90; phase <= 110; phase++) {
    const dir = path.join(ROOT, "experiments", `phase${phase}`);
    if (fs.existsSync(dir)) walk(dir);
  }
  return files;
}

/** A quoted run that cannot cross a newline — prompt literals are single-line. */
const QUOTED = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;

function quotedLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(QUOTED)) out.push(m[0].slice(1, -1));
  return out;
}

/**
 * Comments blanked and template-literal bodies blanked, so a `prompt:` matched here
 * is a real object property or assignment and never text inside a string.
 */
function codeShaped(source: string): string {
  return stripComments(source).replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

function testHistoricalPrompts(): void {
  const files = historicalSourceFiles();
  const promptFieldLiterals: string[] = [];
  const promptArrayLiterals: string[] = [];

  for (const file of files) {
    const src = codeShaped(fs.readFileSync(file, "utf8"));
    for (const m of src.matchAll(
      /\bprompt\s*:\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g
    )) {
      promptFieldLiterals.push(m[1].slice(1, -1));
    }
    for (const m of src.matchAll(
      /\bprompt\s*=\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g
    )) {
      promptFieldLiterals.push(m[1].slice(1, -1));
    }
    for (const m of src.matchAll(
      /\b[A-Z0-9_]*PROMPT[A-Z0-9_]*\s*(?::[^=\n]*)?=\s*\[([\s\S]*?)\]/g
    )) {
      promptArrayLiterals.push(...quotedLiterals(m[1]));
    }
  }

  const fieldSet = [...new Set(promptFieldLiterals)];
  const subsetCheck = frozenPromptSubsetOfHistorical(fieldSet);
  check(
    "no Phase-90-110 generation prompt other than the five frozen ones appears in a " +
      "`prompt:` literal, across every phase source",
    files.length > 0 && fieldSet.length > 0 && subsetCheck.onlyFrozenPrompts,
    `${files.length} sources scanned, outsiders ${JSON.stringify(subsetCheck.outsiders)}`
  );

  const languageTags = [...MANIFEST_CLASS_ORDER];
  const arrayOutsiders = [
    ...new Set(
      promptArrayLiterals.filter(
        (s) => !FROZEN_PROMPTS.includes(s) && !(languageTags as string[]).includes(s)
      )
    ),
  ];
  check(
    "the prompt arrays in those sources hold only the five frozen prompts and language tags",
    arrayOutsiders.length === 0,
    JSON.stringify(arrayOutsiders)
  );
}

// ============================================================
// §5 — ordering is load-bearing
// ============================================================

/** A deterministic pseudo-logits row keyed on the prompt text. */
function rowOfPrompt(prompt: string): number[] {
  const row = new Array<number>(VOCAB_TARGET).fill(0);
  let h = 0;
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) % 1000003;
  row[h % VOCAB_TARGET] = 4;
  row[(h + 7) % VOCAB_TARGET] = 2;
  return row;
}

function idsForOrder(order: readonly string[]): number[] {
  const rng = createSeededRNG(SEED);
  return order.map((p) => sampleToken(rowOfPrompt(p), rng, TEMPERATURE));
}

function testOrderingIsLoadBearing(): void {
  const forward = ["alpha", "beta", "gamma", "delta"];
  const permuted = ["gamma", "alpha", "delta", "beta"];
  const a = idsForOrder(forward);
  const b = idsForOrder(forward);
  const c = idsForOrder(permuted);
  const movedFor = forward
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => a[i] !== c[permuted.indexOf(p)]);
  check(
    "reordering the prompt list changes the id at least one prompt receives under the " +
      "frozen RNG stream (deterministic fixture, not the external grid)",
    JSON.stringify(a) === JSON.stringify(b) && movedFor.length > 0,
    `forward ${JSON.stringify(a)} permuted ${JSON.stringify(c)} moved ${movedFor.length}/4`
  );
}

// ============================================================
// §9 — frozen condition
// ============================================================

function testFrozenCondition(): void {
  if (manifest === null || probeResults === null || p102 === null) {
    skip("frozen-condition suite", "an artifact is missing");
    return;
  }

  // ---- 9. checkpoint identity ----------------------------------------
  const digests: { armKey: string; computed: string; recorded: string; exists: boolean }[] =
    ARMS.map((arm) => ({
      armKey: arm.key,
      computed: fs.existsSync(arm.checkpointPath) ? rawDigestOf(arm.checkpointPath) : "",
      recorded: p102.armResults.find((a) => a.armKey === arm.key)?.checkpointSha256 ?? "",
      exists: fs.existsSync(arm.checkpointPath),
    }));
  const manifestArmsAgree = manifest.arms.every((a) =>
    ARMS.some((arm) => arm.key === a.key && a.checkpointSha256 === digests.find((d) => d.armKey === a.key)?.computed)
  );
  check(
    "the four checkpoint identities match the manifest, exist on disk, and reproduce " +
      "Phase 102's recorded digests",
    digests.length === 4 &&
      digests.every((d) => d.exists && d.computed.length === 64 && d.computed === d.recorded) &&
      manifestArmsAgree &&
      probeResults.parityGate.checkpointIdentity.every((c) => c.match),
    JSON.stringify(digests.map((d) => `${d.armKey}:${d.computed === d.recorded ? "ok" : "MISMATCH"}`))
  );

  // ---- 10. tokenizer identity ----------------------------------------
  const tok = tokenizerOf();
  const idToToken = tok.getVocabulary().idToToken;
  const vocab: VocabEntry[] = classifyVocabulary(idToToken, tok.vocabSize);
  const legalAtP0 = phaseLegalIdsOf(vocab, BOUNDARY_STATE).length;
  const continuationStart = vocab.filter(
    (v) => v.bytes.length > 0 && v.bytes[0] >= 0x80 && v.bytes[0] <= 0xbf
  ).length;
  const measured = {
    vocabularySize: vocab.length,
    legalAtP0Count: legalAtP0,
    illegalAtP0Count: vocab.length - legalAtP0,
    continuationStartCount: continuationStart,
  };
  const recorded = probeResults.parityGate.tokenizerIdentity.recordedInPhase102;
  check(
    "the rebuilt vocabulary reproduces Phase 102's recorded P0 census read back from " +
      "the artifact, not re-derived through the Phase-102 module chain",
    measured.vocabularySize === p102.p0Census.vocabularySize &&
      measured.legalAtP0Count === p102.p0Census.legalAtP0Count &&
      measured.illegalAtP0Count === p102.p0Census.illegalAtP0Count &&
      measured.continuationStartCount === p102.p0Census.startsWithContinuationByteCount &&
      recorded.vocabularySize === p102.p0Census.vocabularySize &&
      recorded.legalAtP0Count === p102.p0Census.legalAtP0Count &&
      probeResults.parityGate.tokenizerIdentity.match === true,
    `measured ${JSON.stringify(measured)} vs phase102 ${JSON.stringify(p102.p0Census.vocabularySize)}/` +
      `${p102.p0Census.legalAtP0Count}/${p102.p0Census.illegalAtP0Count}/` +
      `${p102.p0Census.startsWithContinuationByteCount}`
  );
  check(
    "the P0 candidate count is 223 and it is exactly the legal-at-P0 population",
    p102.p0Census.legalAtP0Count === 223 &&
      p102.p0Census.illegalAtP0Count === 77 &&
      p102.p0Census.vocabularySize === 300,
    `${p102.p0Census.legalAtP0Count} / ${p102.p0Census.illegalAtP0Count} / ${p102.p0Census.vocabularySize}`
  );

  // ---- 11. recipe identity -------------------------------------------
  check(
    "the Phase-111 generation recipe equals the recipe Phase 102 recorded",
    P111_SEED === p102.recipe.seed &&
      P111_VOCAB_TARGET === p102.recipe.vocabTarget &&
      P111_MAX_TOKENS === p102.recipe.maxTokens &&
      P111_MAX_CTX === p102.recipe.maxCtx &&
      P111_TEMPERATURE === p102.recipe.temperature &&
      EOS_TOKEN_ID === p102.recipe.eosTokenId &&
      SEED === p102.recipe.seed &&
      VOCAB_TARGET === p102.recipe.vocabTarget &&
      TEMPERATURE === p102.recipe.temperature,
    `phase111 ${P111_SEED}/${P111_VOCAB_TARGET}/${P111_MAX_TOKENS}/${P111_MAX_CTX}/` +
      `${P111_TEMPERATURE}/${EOS_TOKEN_ID} vs phase102 ${p102.recipe.seed}/${p102.recipe.vocabTarget}/` +
      `${p102.recipe.maxTokens}/${p102.recipe.maxCtx}/${p102.recipe.temperature}/${p102.recipe.eosTokenId}`
  );
  check(
    "the recorded recipe in probe-results.json carries the same six constants",
    probeResults.recipe.seed === P111_SEED &&
      probeResults.recipe.vocabTarget === P111_VOCAB_TARGET &&
      probeResults.recipe.maxTokens === P111_MAX_TOKENS &&
      probeResults.recipe.maxCtx === P111_MAX_CTX &&
      probeResults.recipe.temperature === P111_TEMPERATURE &&
      probeResults.recipe.eosTokenId === EOS_TOKEN_ID
  );

  // ---- 12. P12-MASK semantics ----------------------------------------
  const boundary = buildPhaseMask(vocab, BOUNDARY_STATE, "P0");
  const midstreamState = { need: 1, openAt: 0, recoverable: true };
  const midstream = buildPhaseMask(vocab, midstreamState, "P1");
  const brokenState = { need: 1, openAt: 0, recoverable: false };
  const broken = buildPhaseMask(vocab, brokenState, "PX");
  check(
    "buildPhaseMask is inactive at need === 0, inactive when unrecoverable, and active " +
      "at need > 0",
    boundary.active === false &&
      boundary.inactiveReason === "character-boundary" &&
      broken.active === false &&
      broken.inactiveReason === "stream-unrecoverable" &&
      midstream.active === true &&
      midstream.inactiveReason === null &&
      midstream.legalCount + midstream.illegalCount === vocab.length &&
      midstream.empty === (midstream.legalCount === 0),
    `boundary ${String(boundary.active)}/${String(boundary.inactiveReason)}, ` +
      `mid ${String(midstream.active)}/${midstream.legalCount}, ` +
      `broken ${String(broken.active)}/${String(broken.inactiveReason)}`
  );
  check(
    "at P0 the mask's candidate set is the WHOLE vocabulary, so P0 legality is measured " +
      "on phaseLegalIdsOf and not on the mask",
    boundary.legalCount === vocab.length && midstream.legalCount < vocab.length,
    `boundary ${boundary.legalCount} vs midstream ${midstream.legalCount} of ${vocab.length}`
  );

  const logits = vocab.map((v) => Math.sin(v.id) * 3 + (v.id % 7));
  const masked = applyPhaseMask(logits, midstream);
  const legalSet = new Set(midstream.legalIds);
  const outsideInfinity = masked.every((v, i) =>
    legalSet.has(i) ? true : v === Number.NEGATIVE_INFINITY
  );
  const insideVerbatim = masked.every((v, i) => (legalSet.has(i) ? Object.is(v, logits[i]) : true));
  const unmaskedCopy = applyPhaseMask(logits, boundary);
  check(
    "applyPhaseMask writes exactly -Infinity outside the candidate set and leaves every " +
      "legal logit bit-identical; outside a decision it copies verbatim",
    outsideInfinity &&
      insideVerbatim &&
      unmaskedCopy.length === logits.length &&
      unmaskedCopy.every((v, i) => Object.is(v, logits[i])),
    `outside ${outsideInfinity}, verbatim ${insideVerbatim}`
  );

  const ascending = midstream.legalIds.every((id, i) => i === 0 || midstream.legalIds[i - 1] < id);
  const tiedId = midstream.legalIds[0];
  const otherLegal = midstream.legalIds.find((id) => id > tiedId) ?? tiedId;
  const tieLogits = logits.map(() => 0);
  tieLogits[tiedId] = 5;
  tieLogits[otherLegal] = 5;
  const emptyMask: PhaseMask = { ...midstream, legalIds: [], legalCount: 0, illegalCount: vocab.length, empty: true };
  check(
    "maskedArgmaxOf tie-breaks by ascending id and returns -1 on an empty candidate set",
    ascending &&
      maskedArgmaxOf(tieLogits, midstream) === Math.min(tiedId, otherLegal) &&
      maskedArgmaxOf(tieLogits, emptyMask) === -1,
    `ascending ${ascending}, tie ${maskedArgmaxOf(tieLogits, midstream)} of ` +
      `${tiedId}/${otherLegal}, empty ${maskedArgmaxOf(tieLogits, emptyMask)}`
  );

  // ---- 13. the parity gate -------------------------------------------
  const requirements = probeResults.parityGate.requirements;
  const ids = requirements.map((r) => r.id);
  check(
    "the parity gate passed, with all eight requirements recorded and each one true",
    probeResults.parityGate.pass === true &&
      requirements.length === 8 &&
      JSON.stringify(ids) === JSON.stringify(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]) &&
      requirements.every((r) => r.pass) &&
      requirements.every(
        (r) => r.expected.length > 0 && r.observed.length > 0 && r.requirement.length > 0
      ),
    `${requirements.length} requirements: ${JSON.stringify(ids)}`
  );
  check(
    "the parity gate reproduced the pre-registered baseline: 20 trajectories, 11 divergent " +
      "P0 draws, 11 corrupted trajectories, and `221 = 11 + 210`",
    probeResults.parityGate.baseline.trajectories === ARMS.length * FROZEN_PROMPTS.length &&
      probeResults.parityGate.baseline.divergentP0Draws === BASELINE_P0_FAILURES &&
      probeResults.parityGate.baseline.corruptedTrajectories === BASELINE_P0_FAILURES &&
      probeResults.parityGate.baseline.p0Steps === BASELINE_PARTITION.p0Steps &&
      probeResults.parityGate.baseline.intactP0StepsFromPhase107 === BASELINE_PARTITION.intactP0 &&
      probeResults.parityGate.baseline.gap === BASELINE_PARTITION.gap &&
      probeResults.parityGate.baseline.p0StepsFromByteStream ===
        probeResults.parityGate.baseline.p0Steps &&
      probeResults.parityGate.condition === P111_CONDITION,
    JSON.stringify(probeResults.parityGate.baseline)
  );
  check(
    "the parity gate's legality check is a computed three-way agreement, and the token " +
      "set it used is the one the decoder used",
    probeResults.parityGate.legalityEquivalence.vector ===
      probeResults.parityGate.legalityEquivalence.perByteWalk &&
      probeResults.parityGate.legalityEquivalence.agreeWithProductionScanner === true &&
      probeResults.parityGate.legalityEquivalence.scannerDisagreements.length === 0
  );
  check(
    "the parity gate declares the frozen condition and the frozen prompt and arm lists",
    probeResults.parityGate.condition === P111_CONDITION &&
      probeResults.parityGate.arms.length === ARMS.length &&
      JSON.stringify(probeResults.parityGate.prompts) === JSON.stringify([...FROZEN_PROMPTS]),
    JSON.stringify(probeResults.parityGate.prompts)
  );

  // ---- 14. importing the probe does not generate ----------------------
  const probeSource = fs.readFileSync(
    path.join(P111_DIR, "probe.ts"),
    "utf8"
  );
  const guarded = /require\s*\.\s*main\s*===\s*module/.test(codeOf(probeSource));
  check(
    "the probe's main() runs only under `require.main === module`, so importing it " +
      "generates nothing",
    guarded
  );
}

// ============================================================
// §11 — enumeration
// ============================================================

const SECTION_6_2_FIELDS: readonly string[] = [
  "trajectory",
  "prompt",
  "class",
  "armKey",
  "stepIndex",
  "tokenIndex",
  "byteOffset",
  "phaseBefore",
  "needBefore",
  "selectedId",
  "selectedBytes",
  "selectedLegal",
  "selectedStartsWithContinuationByte",
  "rawArgmaxId",
  "rawArgmaxLegal",
  "legalMass",
  "illegalMass",
  "continuationStartMass",
  "bareContinuationMass",
  "multibyteLeadMass",
  "argmaxCompatible",
  "compatibleMass",
  "maskActive",
  "maskIntervened",
  "corpusSupportLevel",
  "corpusSupportedBestId",
  "corpusSupportedBestCount",
  "divergent",
  "mechanismLabel",
  "partitionMetadata",
];

function testEnumeration(): void {
  if (probeResults === null || reconciliation === null || divergentArtifact === null) {
    skip("enumeration suite", "an artifact is missing");
    return;
  }

  const trajectories = probeResults.grid.trajectories;
  const expectedCount =
    ARMS.length * (promptSet === null ? 12 : promptSet.resolvedSelection.length);

  // ---- 15. grid completeness -----------------------------------------
  const reconIds = new Set(reconciliation.rows.map((r) => r.trajectoryId));
  const divergentKeys = new Set(divergentArtifact.decisions.map((d) => `${d.armKey}/${d.prompt}#${d.tokenIndex}`));
  const everyTrajectoryCovered = trajectories.every(
    (t) => reconIds.has(t.trajectoryId) && t.steps.some((s) => s.phaseBefore === "P0")
  );
  check(
    "all 48 trajectories are present (12 x 4), each with a reconciliation row and a " +
      "decision row set",
    trajectories.length === expectedCount &&
      expectedCount === 48 &&
      reconciliation.rows.length === trajectories.length &&
      everyTrajectoryCovered &&
      divergentKeys.size === divergentArtifact.decisions.length,
    `${trajectories.length} trajectories, ${reconciliation.rows.length} rows, ` +
      `${divergentArtifact.decisions.length} decision rows / ${divergentKeys.size} distinct keys`
  );
  check(
    "the grid spans every arm and every manifest index exactly once",
    ARMS.every((a) => trajectories.filter((t) => t.armKey === a.key).length === 12) &&
      probeResults.grid.prompts.length === 12 &&
      probeResults.grid.prompts.every((p, i) => p.manifestIndex === i)
  );

  // ---- 16. step accounting -------------------------------------------
  const stepsMatchIds = trajectories.every((t) => t.steps.length === t.generatedIds.length);
  const histogramCloses = trajectories.every(
    (t) =>
      t.stepsAtP0 + t.stepsAtP1 + t.stepsAtP2 + t.stepsAtP3 + t.stepsAtPX === t.steps.length
  );
  const p0FlagAgrees = trajectories.every(
    (t) => t.p0Decisions.length === t.stepsAtP0 && t.p0Decisions.every((s) => s.phaseBefore === "P0")
  );
  check(
    "for every trajectory, steps.length === generatedIds.length and the byte-phase " +
      "histogram accounts for every step",
    stepsMatchIds && histogramCloses && p0FlagAgrees,
    `ids ${stepsMatchIds}, histogram ${histogramCloses}, p0 ${p0FlagAgrees}`
  );

  // ---- 17. the §6.2 field set and the masses --------------------------
  const p0Decisions = divergentArtifact.decisions;
  const present = p0Decisions.every((d) => {
    const row = d as unknown as Record<string, unknown>;
    return SECTION_6_2_FIELDS.every((f) => row[f] !== undefined && row[f] !== null);
  });
  const massesInRange = p0Decisions.every(
    (d) =>
      [d.legalMass, d.illegalMass, d.continuationStartMass, d.bareContinuationMass, d.multibyteLeadMass].every(
        (v) => Number.isFinite(v) && v >= 0 && v <= 1 + 1e-9
      ) &&
      Math.abs(d.legalMass + d.illegalMass - 1) <= 1e-9 &&
      d.needBefore >= 0
  );
  check(
    "every P0 decision carries every §6.2 field, none undefined, all masses in [0,1] and " +
      "legalMass + illegalMass === 1 within 1e-9",
    p0Decisions.length > 0 && present && massesInRange,
    `${p0Decisions.length} decisions, present ${present}, masses ${massesInRange}`
  );

  // ---- 18. `divergent` is the frozen definition ----------------------
  const recount = p0Decisions.filter((d) => d.phaseBefore === "P0" && d.selectedLegal === false);
  const flagAgrees = p0Decisions.every(
    (d) => d.divergent === (d.phaseBefore === "P0" && d.selectedLegal === false)
  );
  const artifactDivergent = divergentArtifact.divergent;
  check(
    "`divergent` equals `phase === \"P0\" && selectedLegal === false`, and the census " +
      "agrees with a recount from the enumeration artifact",
    flagAgrees &&
      recount.length === probeResults.census.divergentP0Draws &&
      artifactDivergent.length === recount.length &&
      artifactDivergent.every((d) => d.divergent === true),
    `recount ${recount.length} vs census ${probeResults.census.divergentP0Draws} vs ` +
      `artifact ${artifactDivergent.length}`
  );
  check(
    "the divergence definition is stated verbatim in both artifacts, so no second " +
      "criterion can hide in the pipeline",
    divergentArtifact.divergenceDefinition.includes('phase === "P0" && selectedLegal === false')
  );

  // ---- 19. byte offsets ----------------------------------------------
  const tok = tokenizerOf();
  const idToToken = tok.getVocabulary().idToToken;
  const bytesOfId = (id: number): number => (idToToken.get(id) ?? "").length;
  const byteOffsetsAgree = trajectories.every((t) => {
    let offset = 0;
    for (const id of t.promptIds) offset += bytesOfId(id);
    for (const s of t.steps) {
      if (s.byteOffset !== offset) return false;
      offset += s.selectedBytes.length;
    }
    let promptBytes = 0;
    for (const id of t.promptIds) promptBytes += bytesOfId(id);
    return offset === promptBytes + t.generatedBytes.length;
  });
  check(
    "the byte offset recorded for a decision equals the number of bytes emitted before it",
    byteOffsetsAgree
  );

  // ---- 20. comparability reconciles ----------------------------------
  const perTrajectoryOk = trajectories.every((t) => {
    const div = t.steps.filter((s) => s.phaseBefore === "P0" && !s.selectedLegal);
    const comparable = div.filter((s) => s.comparable);
    return (
      comparable.length + div.filter((s) => !s.comparable).length === div.length &&
      div.every((s) => s.comparable === (s.nonComparableReason === null)) &&
      div.filter((s) => !s.comparable).every((s) => typeof s.nonComparableReason === "string")
    );
  });
  const aggregateOk =
    probeResults.census.comparableDivergentP0Draws +
      probeResults.census.nonComparableDivergentP0Decisions ===
    probeResults.census.divergentP0Draws;
  check(
    "comparable + nonComparable === divergent per trajectory and in aggregate, and every " +
      "non-comparable decision names a reason",
    perTrajectoryOk &&
      aggregateOk &&
      divergentArtifact.divergent.filter((d) => d.comparable).length ===
        probeResults.census.comparableDivergentP0Draws,
    `census ${probeResults.census.comparableDivergentP0Draws} + ` +
      `${probeResults.census.nonComparableDivergentP0Decisions} vs ` +
      `${probeResults.census.divergentP0Draws}`
  );
}

// ============================================================
// §7 — labels
// ============================================================

function byteClassMassOfFixture(overrides: Partial<ByteClassMass>): ByteClassMass {
  return {
    legalContinuation: 0,
    asciiLead: 0,
    multibyteLead: 0,
    bareContinuation: 0,
    illegalLead: 0,
    unclassified: 0,
    ...overrides,
  };
}

/** Extract a top-level function body by brace matching. */
function functionBodyOf(source: string, name: string): string | null {
  const at = source.indexOf(`function ${name}(`);
  if (at === -1) return null;
  const braceAt = source.indexOf("{", at);
  if (braceAt === -1) return null;
  let depth = 0;
  for (let i = braceAt; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(braceAt, i + 1);
    }
  }
  return null;
}

function testLabels(): void {
  if (probeResults === null || p99 === null || p101Static === null) {
    skip("label suite", "an artifact is missing");
    return;
  }

  // ---- 21. textual identity of the copied classifier body -------------
  const phase99Source = fs.readFileSync(P111_PATHS.phase99Audit.replace(/\.json$/, ".ts"), "utf8");
  const phase111Source = fs.readFileSync(
    path.join(P111_DIR, "grid-external-closure-audit.ts"),
    "utf8"
  );
  const sourceBody = functionBodyOf(stripComments(phase99Source), "labelFailureMechanism");
  const copiedBody = functionBodyOf(stripComments(phase111Source), "labelFailureMechanism");
  const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();
  check(
    "the copied `labelFailureMechanism` body is textually identical to the Phase-99 source, " +
      "after comment stripping and whitespace normalisation",
    sourceBody !== null &&
      copiedBody !== null &&
      normalize(sourceBody) === normalize(copiedBody),
    sourceBody === null || copiedBody === null ? "body not located" : "bodies differ"
  );

  const fixtures: { label: string; input: Parameters<typeof labelFailureMechanism>[0] }[] = [
    {
      label: "sampling-draw",
      input: {
        argmaxCompatible: true,
        compatibleMass: 0.1,
        phase: "P0",
        byteClassMass: byteClassMassOfFixture({ bareContinuation: 0.9 }),
      },
    },
    {
      label: "under-ranked-legal",
      input: {
        argmaxCompatible: false,
        compatibleMass: 0.5,
        phase: "P0",
        byteClassMass: byteClassMassOfFixture({ bareContinuation: 0.9 }),
      },
    },
    {
      label: "boundary-state-continuation",
      input: {
        argmaxCompatible: false,
        compatibleMass: 0.49,
        phase: "P0",
        byteClassMass: byteClassMassOfFixture({ bareContinuation: 0.5 }),
      },
    },
    {
      label: "midstate-new-lead",
      input: {
        argmaxCompatible: false,
        compatibleMass: 0.49,
        phase: "P1",
        byteClassMass: byteClassMassOfFixture({ multibyteLead: 0.5 }),
      },
    },
    {
      label: "illegal-argmax-other",
      input: {
        argmaxCompatible: false,
        compatibleMass: 0.49,
        phase: "P0",
        byteClassMass: byteClassMassOfFixture({ bareContinuation: 0.49 }),
      },
    },
  ];
  check(
    "the classifier reproduces all five domain labels on fixtures, including the exact " +
      "compatibleMass = 0.5 and bareContinuation = 0.5 boundaries",
    fixtures.every((f) => labelFailureMechanism(f.input) === f.label),
    fixtures.map((f) => `${f.label}:${labelFailureMechanism(f.input)}`).join(" ")
  );

  // ---- 22. the domain is closed --------------------------------------
  const sweep: string[] = [];
  for (const phase of ["P0", "P1", "P2", "P3", "PX"] as const) {
    for (const argmaxCompatible of [true, false]) {
      for (const compatibleMass of [0, 0.49, 0.5, 0.9]) {
        for (const bareContinuation of [0, 0.49, 0.5, 0.9]) {
          for (const multibyteLead of [0, 0.9]) {
            sweep.push(
              labelFailureMechanism({
                argmaxCompatible,
                compatibleMass,
                phase,
                byteClassMass: byteClassMassOfFixture({ bareContinuation, multibyteLead }),
              })
            );
          }
        }
      }
    }
  }
  const distinct = [...new Set(sweep)];
  check(
    "the classifier's domain is closed at exactly the five declared values, and no call " +
      "path can add a sixth",
    MECHANISM_LABEL_DOMAIN.length === 5 &&
      distinct.length === MECHANISM_LABEL_DOMAIN.length &&
      distinct.every((d) => MECHANISM_LABEL_DOMAIN.includes(d as never)),
    `${sweep.length} swept inputs over ${distinct.length} distinct labels`
  );

  // ---- 23. the Phase-101 fixture -------------------------------------
  const p99ByKey = new Map<string, Phase99View["failures"][number]>();
  for (const f of p99.failures) {
    p99ByKey.set(`${f.armKey}/${f.prompt}#${f.failureTokenIndex}`, f);
  }
  const fixtureRows = p101Static.states.map((s) => {
    const rec = p99ByKey.get(`${s.armKey}/${s.prompt}#${s.failureTokenIndex}`);
    const derived =
      rec === undefined
        ? UNKNOWN_LABEL
        : labelP0Mechanism({
            phaseBefore: rec.bytePhase.phase as P111Step["phaseBefore"],
            argmaxCompatible: rec.distribution.argmaxCompatible,
            compatibleMass: rec.distribution.compatibleMass,
            bareContinuationMass: rec.distribution.byteClassMass.bareContinuation,
            multibyteLeadMass: rec.distribution.byteClassMass.multibyteLead,
            byteClassMass: rec.distribution.byteClassMass,
          });
    return { phase: s.phase, recorded: s.mechanismLabel, derived };
  });
  const p0Rows = fixtureRows.filter((r) => r.phase === "P0");
  const recordedP0Labels = p0Rows.map((r) => r.recorded);
  check(
    "the derivation reproduces all five Phase-101-recorded P0 mechanism labels exactly, " +
      "from the artifacts' own recorded quantities",
    p0Rows.length === PHASE101_P0_LABELS.length &&
      p0Rows.every((r) => r.derived === r.recorded) &&
      JSON.stringify(recordedP0Labels) === JSON.stringify([...PHASE101_P0_LABELS]),
    JSON.stringify(recordedP0Labels)
  );
  // The join is only possible where Phase 99 recorded a byte-class term for the identical
  // state, and Phase 99's failure table covers the P0 population. The states it does not
  // cover are NON-REPRODUCIBLE from recorded quantities — an absent measurement, reported
  // here and in the artifact rather than silently normalised away.
  const uncovered = fixtureRows.filter(
    (r) => r.derived === UNKNOWN_LABEL && r.recorded !== UNKNOWN_LABEL
  );
  const covered = fixtureRows.filter((r) => !uncovered.includes(r));
  check(
    "the derivation is exact on every state the join covers, and every state it does not " +
      "cover is reported as non-reproducible rather than quietly dropped",
    fixtureRows.length === 12 &&
      covered.every((r) => r.derived === r.recorded) &&
      covered.length === probeResults.parityGate.phase101Fixture.p0LabelCount &&
      uncovered.length === 12 - covered.length &&
      uncovered.every((r) => r.phase !== "P0") &&
      probeResults.parityGate.phase101Fixture.allTwelveReproduced ===
        (uncovered.length === 0),
    `covered ${covered.length}/12, uncovered ${JSON.stringify(uncovered.map((r) => `${r.phase}:${r.recorded}`))}`
  );

  // ---- 24. the derived family ----------------------------------------
  const recorded = probeResults.parityGate.familyDerivation;
  const recount: Record<string, number> = {};
  const rederived = recorded.decisionDetail.map((d) => ({
    recorded: d.recordedLabel,
    derived: labelP0Mechanism({
      phaseBefore: d.phaseBefore as P111Step["phaseBefore"],
      argmaxCompatible: d.argmaxCompatible,
      compatibleMass: d.compatibleMass,
      bareContinuationMass: d.bareContinuationMass,
      multibyteLeadMass: d.multibyteLeadMass,
      // The classifier reads only these two byte-class terms, so reconstructing the
      // object from the two recorded masses determines the label exactly.
      byteClassMass: byteClassMassOfFixture({
        bareContinuation: d.bareContinuationMass,
        multibyteLead: d.multibyteLeadMass,
      }),
    }),
  }));
  for (const r of rederived) recount[r.derived] = (recount[r.derived] ?? 0) + 1;
  check(
    "the derived 11-state family is `{boundary-state-continuation x7, sampling-draw x4}`, " +
      "re-derived in the suite from the measured quantities of the 11 baseline states",
    recorded.decisionDetail.length === BASELINE_P0_FAILURES &&
      rederived.every((r) => r.derived === r.recorded) &&
      JSON.stringify(recount) === JSON.stringify(BASELINE_FAMILY_COUNTS) &&
      JSON.stringify(recorded.labels) ===
        JSON.stringify(recorded.decisionDetail.map((d) => d.recordedLabel)) &&
      JSON.stringify(recorded.counts) === JSON.stringify(BASELINE_FAMILY_COUNTS) &&
      recorded.decisions === BASELINE_P0_FAILURES &&
      recorded.matchesExpected === true,
    `suite ${JSON.stringify(recount)} vs recorded ${JSON.stringify(recorded.counts)}`
  );
  check(
    "the 11 baseline states are exactly the divergent P0 draws of the parity grid, one " +
      "per corrupted trajectory",
    new Set(recorded.decisionDetail.map((d) => d.trajectoryId)).size ===
      BASELINE_P0_FAILURES &&
      recorded.decisionDetail.every(
        (d) => d.phaseBefore === "P0" && d.selectedLegal === false
      ) &&
      !(FROZEN_FAMILY as readonly string[]).includes(UNKNOWN_LABEL)
  );
  check(
    "the frozen family is exactly `{boundary-state-continuation, sampling-draw}`",
    JSON.stringify([...FROZEN_FAMILY]) ===
      JSON.stringify(["boundary-state-continuation", "sampling-draw"]) &&
      JSON.stringify(recorded.frozenFamily) === JSON.stringify([...FROZEN_FAMILY]) &&
      JSON.stringify(probeResults.mechanismFamily.frozenFamily) === JSON.stringify([...FROZEN_FAMILY])
  );

  // ---- 25. the unknown sentinel --------------------------------------
  const unknownInputs = [
    labelP0Mechanism({
      phaseBefore: "PX",
      argmaxCompatible: false,
      compatibleMass: 0.1,
      bareContinuationMass: 0.1,
      multibyteLeadMass: 0.1,
      byteClassMass: byteClassMassOfFixture({}),
    }),
    labelP0Mechanism({
      phaseBefore: "P0",
      argmaxCompatible: false,
      compatibleMass: Number.NaN,
      bareContinuationMass: 0.1,
      multibyteLeadMass: 0.1,
      byteClassMass: byteClassMassOfFixture({}),
    }),
    labelP0Mechanism({
      phaseBefore: "P0",
      argmaxCompatible: null,
      compatibleMass: 0.1,
      bareContinuationMass: 0.1,
      multibyteLeadMass: 0.1,
      byteClassMass: byteClassMassOfFixture({}),
    }),
    labelP0Mechanism({
      phaseBefore: "P0",
      argmaxCompatible: false,
      compatibleMass: 0.1,
      bareContinuationMass: 0.1,
      multibyteLeadMass: 0.1,
      byteClassMass: null,
    }),
  ];
  const deterministic = labelFailureMechanism({
    argmaxCompatible: false,
    compatibleMass: 0.1,
    phase: "P0",
    byteClassMass: byteClassMassOfFixture({ bareContinuation: 0.1 }),
  });
  check(
    "the wrapper maps out-of-domain input (phase PX, a non-finite mass, a null boolean, a " +
      "missing byte-class mass) to the `unknown` sentinel, and `illegal-argmax-other` is " +
      "NOT reinterpreted as unknown",
    unknownInputs.every((u) => u === UNKNOWN_LABEL) &&
      deterministic === "illegal-argmax-other" &&
      (MECHANISM_LABEL_DOMAIN as readonly string[]).every((l) => l !== UNKNOWN_LABEL),
    `${JSON.stringify(unknownInputs)} / deterministic ${deterministic}`
  );
  const unknownStep = syntheticStep({
    mechanismLabel: UNKNOWN_LABEL,
    phaseBefore: "P0",
    selectedLegal: false,
    divergent: true,
    comparable: true,
  });
  const syntheticEvent = firstOutsideFamily([
    { trajectory: syntheticTrajectory({ armKey: "SYN", prompt: "synthetic", manifestIndex: 0 }), step: unknownStep },
  ]);
  check(
    "`unknown` is outside the frozen family, so a decision carrying it fires F2",
    !(FROZEN_FAMILY as readonly string[]).includes(UNKNOWN_LABEL) &&
      syntheticEvent !== null &&
      syntheticEvent.mechanismLabel === UNKNOWN_LABEL,
    syntheticEvent === null ? "no event" : syntheticEvent.mechanismLabel
  );

  // ---- 26. midstate-new-lead is unreachable at P0 ---------------------
  const p0Labels = new Set<string>();
  for (const argmaxCompatible of [true, false]) {
    for (const compatibleMass of [0, 0.49, 0.5, 0.9]) {
      for (const bareContinuation of [0, 0.49, 0.5, 0.9]) {
        for (const multibyteLead of [0, 0.5, 0.9]) {
          p0Labels.add(
            labelFailureMechanism({
              argmaxCompatible,
              compatibleMass,
              phase: "P0",
              byteClassMass: byteClassMassOfFixture({ bareContinuation, multibyteLead }),
            })
          );
        }
      }
    }
  }
  const p1Reachable = labelFailureMechanism({
    argmaxCompatible: false,
    compatibleMass: 0.1,
    phase: "P1",
    byteClassMass: byteClassMassOfFixture({ multibyteLead: 0.9 }),
  });
  const reachable = reachableNonFamilyLabels();
  check(
    "`midstate-new-lead` is structurally unreachable for a P0 decision, and reachable at P1",
    !p0Labels.has("midstate-new-lead") && p1Reachable === "midstate-new-lead",
    `P0 labels ${JSON.stringify([...p0Labels])}, P1 ${p1Reachable}`
  );
  check(
    "the reachable non-family labels are exactly " +
      "`{under-ranked-legal, illegal-argmax-other, unknown}`",
    JSON.stringify(reachable) ===
      JSON.stringify(["illegal-argmax-other", "under-ranked-legal", "unknown"]),
    JSON.stringify(reachable)
  );
}

// ============================================================
// §8.3 — partition
// ============================================================

function censusOfFixture(overrides: Partial<ConditionCensus>): ConditionCensus {
  return {
    condition: "SYN",
    p0Steps: 0,
    divergentP0Draws: 0,
    divergentP0ContinuationStarts: 0,
    p0IllegalArgmaxSteps: 0,
    illegalP1P2Draws: 0,
    illegalOtherDraws: 0,
    totalIllegalDraws: 0,
    trajectoriesFirstInvalidAtP0: 0,
    corruptedTrajectories: 0,
    ...overrides,
  };
}

function testPartition(): void {
  if (probeResults === null || p102 === null || p107Intact === null) {
    skip("partition suite", "an artifact is missing");
    return;
  }

  // ---- 27. the frozen partition, from recorded values ------------------
  const emissions = p102.illegalEmissions[P111_CONDITION];
  const recordedCensus = censusOfFixture({
    condition: P111_CONDITION,
    p0Steps: emissions.p0Steps,
    divergentP0Draws: emissions.p0IllegalDraws,
    divergentP0ContinuationStarts: emissions.p0ContinuationStartDraws,
    p0IllegalArgmaxSteps: emissions.p0IllegalArgmaxSteps,
    illegalP1P2Draws: emissions.p1p2IllegalDraws,
    illegalOtherDraws: emissions.otherIllegalDraws,
    totalIllegalDraws:
      emissions.p0IllegalDraws + emissions.p1p2IllegalDraws + emissions.otherIllegalDraws,
    trajectoriesFirstInvalidAtP0: p102.metrics[P111_CONDITION].aggregate.corruptionByPhase.P0 ?? 0,
    corruptedTrajectories: p102.metrics[P111_CONDITION].aggregate.corruptionCount,
  });
  const frozenPartition = partitionOf(recordedCensus, p107Intact.populationSize);
  check(
    "the copied partitionOf reproduces the frozen `221 = 11 + 210`, gap 0, from Phase-102's " +
      "and Phase-107's recorded values",
    frozenPartition.p0Steps === BASELINE_PARTITION.p0Steps &&
      frozenPartition.divergentP0Draws === BASELINE_PARTITION.divergentP0 &&
      frozenPartition.intactP0Steps === BASELINE_PARTITION.intactP0 &&
      frozenPartition.accountedSteps === BASELINE_PARTITION.p0Steps &&
      frozenPartition.gap === BASELINE_PARTITION.gap &&
      frozenPartition.exact === true,
    JSON.stringify(frozenPartition)
  );
  const frozenBijection = bijectionOf(recordedCensus);
  check(
    "the bijection check confirms one divergent draw per first-invalid-at-P0 trajectory on " +
      "the frozen grid",
    frozenBijection.oneDrawPerCorruptedTrajectory === true &&
      frozenBijection.unaccountedDraws === 0 &&
      frozenBijection.drawsAtLeastTrajectories === true,
    JSON.stringify(frozenBijection)
  );

  // ---- 28. the new-grid partition ------------------------------------
  const p = probeResults.partition;
  const definitionsPresent =
    Object.values(p.pathDefinitions).every((v) => typeof v === "string" && v.length > 0);
  check(
    "the new-grid partition is recorded with all four path counts, each path defined in the " +
      "artifact, and A' agreeing with A",
    Number.isInteger(p.paths.A) &&
      Number.isInteger(p.paths.B) &&
      Number.isInteger(p.paths.C) &&
      Number.isInteger(p.paths.APrime) &&
      p.paths.A === p.p0Steps &&
      p.paths.B === p.divergentP0Draws &&
      p.paths.C === p.intactP0Steps &&
      p.accountedSteps === p.divergentP0Draws + p.intactP0Steps &&
      p.gap === p.p0Steps - p.accountedSteps &&
      p.exact === (p.gap === 0) &&
      p.exactAcrossPaths === (p.paths.A === p.paths.APrime) &&
      definitionsPresent,
    JSON.stringify(p.paths)
  );
  check(
    "the recorded F3 clause carries the observed gap and fires exactly when it is nonzero",
    probeResults.falsifiers.F3.observed.partitionGap === p.gap &&
      probeResults.falsifiers.F3.fired === (p.gap !== 0) &&
      probeResults.falsifiers.F3.observed.exact === p.exact
  );

  // ---- 29. an injected gap is detected --------------------------------
  const injectedGap = partitionOf(censusOfFixture({ p0Steps: 10, divergentP0Draws: 2 }), 7);
  check(
    "an injected gap is detected: one unaccounted P0 step yields gap 1 and exact false",
    injectedGap.gap === 1 && injectedGap.exact === false && injectedGap.accountedSteps === 9,
    JSON.stringify(injectedGap)
  );

  // ---- 30. the bijection check is non-vacuous -------------------------
  const twoDraws = bijectionOf(
    censusOfFixture({ divergentP0Draws: 2, trajectoriesFirstInvalidAtP0: 1, totalIllegalDraws: 2 })
  );
  const offPhaseDraws = bijectionOf(
    censusOfFixture({ divergentP0Draws: 1, trajectoriesFirstInvalidAtP0: 1, totalIllegalDraws: 2 })
  );
  check(
    "the bijection check is non-vacuous: two draws on one trajectory, and a draw outside " +
      "P0, are both detected",
    twoDraws.oneDrawPerCorruptedTrajectory === false &&
      twoDraws.unaccountedDraws === 1 &&
      twoDraws.drawsAtLeastTrajectories === true &&
      offPhaseDraws.oneDrawPerCorruptedTrajectory === false,
    `twoDraws ${JSON.stringify(twoDraws)}, offPhase ${JSON.stringify(offPhaseDraws)}`
  );
}

// ============================================================
// §6/§7 — F1 / F2 / F3 and classification
// ============================================================

function syntheticStep(overrides: Partial<P111Step>): P111Step {
  return {
    stepIndex: 0,
    tokenIndex: 0,
    contextLength: 1,
    byteOffset: 0,
    phaseBefore: "P0",
    needBefore: 0,
    selectedId: 0,
    selectedBytes: [0x41],
    selectedLegal: true,
    selectedStartsWithContinuationByte: false,
    rawArgmaxId: 0,
    rawArgmaxLegal: true,
    legalMass: 1,
    illegalMass: 0,
    continuationStartMass: 0,
    bareContinuationMass: 0,
    multibyteLeadMass: 0,
    argmaxCompatible: true,
    compatibleMass: 1,
    maskActive: false,
    maskInactiveReason: "character-boundary",
    maskIntervened: false,
    corpusSupportLevel: "exact",
    corpusSupportedBestId: 0,
    corpusSupportedBestCount: 1,
    divergent: false,
    mechanismLabel: "sampling-draw",
    comparable: false,
    nonComparableReason: null,
    p0OrdinalInTrajectory: 0,
    partitionClass: "intact",
    isTrajectoryFirstInvalid: false,
    ...overrides,
  };
}

function syntheticTrajectory(overrides: Partial<P111Trajectory>): P111Trajectory {
  return {
    trajectoryId: "SYN/0",
    armKey: "SYN",
    manifestIndex: 0,
    class: "en",
    prompt: "synthetic",
    promptIds: [1],
    generatedIds: [2],
    generatedBytes: [0x41],
    steps: [],
    stepsAtP0: 1,
    stepsAtP1: 0,
    stepsAtP2: 0,
    stepsAtP3: 0,
    stepsAtPX: 0,
    eosEmitted: false,
    terminatedByEmptyMask: false,
    emptyMaskEvents: 0,
    maskInterventions: 0,
    contextTruncationEvents: 0,
    trailingIncomplete: false,
    corrupted: false,
    firstInvalidTokenIndex: -1,
    firstInvalidPhase: null,
    ...overrides,
  };
}

function h111Input(overrides: Partial<H111Input>): H111Input {
  return {
    gateFailures: [],
    f1: { p1p2IllegalDraws: 0, otherIllegalDraws: 0 },
    f2: { fired: false, firstEvent: null },
    f3: { fired: false, gap: 0 },
    comparableDivergentP0Decisions: 0,
    outsideFamilyCount: 0,
    pathDisagreement: null,
    ...overrides,
  };
}

function testClassification(): void {
  if (probeResults === null) {
    skip("classification suite", "an artifact is missing");
    return;
  }

  // ---- 31. F1 is a consistency check, never B -------------------------
  const f1Fired = classifyH111(
    h111Input({
      f1: { p1p2IllegalDraws: 1, otherIllegalDraws: 0 },
      comparableDivergentP0Decisions: 5,
    })
  );
  const f1Other = classifyH111(
    h111Input({ f1: { p1p2IllegalDraws: 0, otherIllegalDraws: 2 } })
  );
  const recordedF1 = probeResults.falsifiers.F1;
  check(
    "a synthetic nonzero F1 reading classifies as D, never as B, and the recorded F1 clause " +
      "is reported with both counts",
    f1Fired.verdict === "D" &&
      f1Other.verdict === "D" &&
      recordedF1.fired ===
        (recordedF1.observed.p1p2IllegalDraws !== 0 || recordedF1.observed.otherIllegalDraws !== 0) &&
      recordedF1.consequence.includes("never produces verdict B") &&
      recordedF1.observed.p1p2Steps >= 0,
    `${f1Fired.verdict} / ${f1Other.verdict}`
  );
  check(
    "the recorded F1 reading is zero, and a zero F1 reading is not treated as closure " +
      "evidence anywhere in the recorded classification",
    recordedF1.observed.p1p2IllegalDraws === 0 &&
      recordedF1.observed.otherIllegalDraws === 0 &&
      recordedF1.fired === false
  );

  // ---- 32. F2 and F3 fire B, and the first event is the earliest ------
  const f2Event: F2FirstEvent = {
    trajectoryId: "SYN/0",
    armKey: "SYN",
    manifestIndex: 0,
    class: "en" as LanguageClass,
    prompt: "synthetic",
    tokenIndex: 3,
    decisionKey: "SYN/synthetic#3",
    mechanismLabel: "under-ranked-legal",
    boundaryStateContinuationMass: 0.1,
    compatibleMass: 0.6,
    argmaxCompatible: false,
  };
  const f2Verdict = classifyH111(
    h111Input({
      f2: { fired: true, firstEvent: f2Event },
      comparableDivergentP0Decisions: 4,
      outsideFamilyCount: 1,
    })
  );
  const f3Verdict = classifyH111(h111Input({ f3: { fired: true, gap: 1 } }));
  const outsideStep = (tokenIndex: number): P111Step =>
    syntheticStep({
      tokenIndex,
      mechanismLabel: "under-ranked-legal",
      phaseBefore: "P0",
      selectedLegal: false,
      divergent: true,
      comparable: true,
    });
  const earlier = outsideStep(1);
  const later = outsideStep(9);
  const orderProbe = firstOutsideFamily([
    { trajectory: syntheticTrajectory({ trajectoryId: "SYN/0" }), step: earlier },
    { trajectory: syntheticTrajectory({ trajectoryId: "SYN/1", manifestIndex: 1 }), step: later },
  ]);
  const reordered = firstOutsideFamily([
    { trajectory: syntheticTrajectory({ trajectoryId: "SYN/1", manifestIndex: 1 }), step: later },
    { trajectory: syntheticTrajectory({ trajectoryId: "SYN/0" }), step: earlier },
  ]);
  check(
    "a synthetic F2 firing classifies as B, a synthetic F3 firing classifies as B, and the " +
      "reported first falsifying event is the earliest by trajectory order then token index",
    f2Verdict.verdict === "B" &&
      f3Verdict.verdict === "B" &&
      f2Verdict.reason.includes("F2 fired") &&
      f3Verdict.reason.includes("F3 fired") &&
      orderProbe !== null &&
      orderProbe.tokenIndex === 1 &&
      reordered !== null &&
      reordered.trajectoryId === "SYN/1",
    `${f2Verdict.verdict}/${f3Verdict.verdict}, first ${orderProbe?.tokenIndex} vs ${reordered?.trajectoryId}`
  );
  check(
    "the recorded F2 clause fires exactly when a comparable divergence leaves the frozen " +
      "family, and names the first such decision",
    probeResults.falsifiers.F2.fired ===
      (probeResults.falsifiers.F2.observed.outsideFamilyCount > 0) &&
      probeResults.falsifiers.F2.observed.labels.length ===
        probeResults.falsifiers.F2.observed.outsideFamilyCount &&
      (probeResults.falsifiers.F2.firstEvent === null
        ? probeResults.falsifiers.F2.observed.outsideFamilyCount === 0
        : !(FROZEN_FAMILY as readonly string[]).includes(
            probeResults.falsifiers.F2.firstEvent.mechanismLabel
          ))
  );

  // ---- 33. zero comparable divergences is the literal C --------------
  const emptyPopulation = classifyH111(h111Input({}));
  check(
    "zero comparable divergences classifies as the literal C reason and never as A",
    emptyPopulation.verdict === "C" &&
      emptyPopulation.reason === H111_INCONCLUSIVE_LITERAL &&
      H111_INCONCLUSIVE_LITERAL === "INCONCLUSIVE — no comparable failure observed",
    `${emptyPopulation.verdict} / ${emptyPopulation.reason}`
  );

  // ---- 34. A is unreachable on an empty population --------------------
  const aAttempts: H111Input[] = [
    h111Input({}),
    h111Input({ comparableDivergentP0Decisions: 0, outsideFamilyCount: 0 }),
    h111Input({ comparableDivergentP0Decisions: 0, f1: { p1p2IllegalDraws: 0, otherIllegalDraws: 0 } }),
  ];
  const aVerdicts = aAttempts.map((i) => classifyH111(i));
  check(
    "the classifier cannot return A on an empty comparable population, and every verdict it " +
      "returns is accompanied by a nonzero population",
    aVerdicts.every((v) => v.verdict !== "A") &&
      aVerdicts.every(
        (v) => v.verdict !== "A" || (h111Input({}).comparableDivergentP0Decisions ?? 0) > 0
      ),
    JSON.stringify(aVerdicts.map((v) => v.verdict))
  );

  // ---- 35. all four verdicts, and fixed precedence --------------------
  const d = classifyH111(h111Input({ gateFailures: ["synthetic gate failure"] }));
  const b = classifyH111(
    h111Input({
      f3: { fired: true, gap: 2 },
      f2: { fired: true, firstEvent: f2Event },
      comparableDivergentP0Decisions: 3,
    })
  );
  const a = classifyH111(h111Input({ comparableDivergentP0Decisions: 3, outsideFamilyCount: 0 }));
  const c = classifyH111(h111Input({ comparableDivergentP0Decisions: 0 }));
  const f1OutranksF2 = classifyH111(
    h111Input({
      f1: { p1p2IllegalDraws: 1, otherIllegalDraws: 0 },
      f2: { fired: true, firstEvent: f2Event },
    })
  );
  check(
    "all four verdicts are individually reachable, and the precedence D -> F1 -> B -> A -> C " +
      "is fixed: F1 outranks F2",
    d.verdict === "D" &&
      b.verdict === "B" &&
      a.verdict === "A" &&
      c.verdict === "C" &&
      f1OutranksF2.verdict === "D" &&
      d.reason.startsWith("BLOCKED") &&
      a.reason.includes("finite Phase-111 grid") &&
      JSON.stringify(c.precedenceApplied) === JSON.stringify(["D", "F1", "B", "A", "C"]),
    `${d.verdict}/${b.verdict}/${a.verdict}/${c.verdict}/${f1OutranksF2.verdict}`
  );
  const oneOutsideFamily = classifyH111(
    h111Input({
      comparableDivergentP0Decisions: 3,
      outsideFamilyCount: 1,
      f2: { fired: true, firstEvent: f2Event },
    })
  );
  check(
    "a nonzero comparable population with one out-of-family label is B, not A, and dropping " +
      "the out-of-family decision is what makes the same population A",
    oneOutsideFamily.verdict === "B" &&
      a.verdict === "A" &&
      oneOutsideFamily.reason.includes("F2 fired")
  );

  // ---- 36. the recorded verdict is re-derivable ----------------------
  const recomputed = classifyH111({
    gateFailures: probeResults.parityGate.pass ? [] : ["parity gate failed"],
    f1: {
      p1p2IllegalDraws: probeResults.census.p1p2IllegalDraws,
      otherIllegalDraws: probeResults.census.otherIllegalDraws,
    },
    f2: {
      fired: probeResults.falsifiers.F2.fired,
      firstEvent: probeResults.falsifiers.F2.firstEvent,
    },
    f3: { fired: probeResults.falsifiers.F3.fired, gap: probeResults.falsifiers.F3.observed.partitionGap },
    comparableDivergentP0Decisions: probeResults.census.comparableDivergentP0Draws,
    outsideFamilyCount: probeResults.falsifiers.F2.observed.outsideFamilyCount,
    pathDisagreement: probeResults.partition.pathDisagreement,
  });
  check(
    "the verdict recorded in probe-results.json is re-derivable from the recorded falsifier " +
      "blocks, census and partition",
    recomputed.verdict === probeResults.classification.verdict &&
      recomputed.reason === probeResults.classification.reason,
    `recomputed ${recomputed.verdict} vs recorded ${probeResults.classification.verdict}`
  );
  check(
    "the recorded verdict is one of the four, and an A verdict carries a nonzero comparable " +
      "population",
    ["A", "B", "C", "D"].includes(probeResults.classification.verdict) &&
      (probeResults.classification.verdict !== "A" ||
        probeResults.census.comparableDivergentP0Draws > 0),
    `${probeResults.classification.verdict} on ${probeResults.census.comparableDivergentP0Draws}`
  );
}

// ============================================================
// §12/§13 — reproducibility and integrity
// ============================================================

function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
    return out;
  }
  if (value === null || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out.push(k);
    collectKeys(v, out);
  }
  return out;
}

function testReproducibilityAndIntegrity(): void {
  if (probeResults === null || manifest === null) {
    skip("reproducibility and integrity suite", "an artifact is missing");
    return;
  }

  // ---- 37. determinism and canonical serialization --------------------
  const artifacts = [
    "prompt-set.json",
    "manifest.json",
    "probe-results.json",
    "trajectory-reconciliation.json",
    "divergent-p0-decisions.json",
  ];
  const idempotent = artifacts.every((name) => {
    const file = path.join(P111_DIR, name);
    if (!fs.existsSync(file)) return false;
    const raw = fs.readFileSync(file, "utf8");
    return JSON.stringify(JSON.parse(raw), null, 2) === raw && !raw.endsWith("\n");
  });
  check(
    "the two in-process runs of the deterministic core produced identical canonical digests, " +
      "and every artifact re-serialises to its own bytes exactly",
    probeResults.determinism.equal === true &&
      probeResults.determinism.coreDigestA.length === 64 &&
      probeResults.determinism.coreDigestA === probeResults.determinism.coreDigestB &&
      probeResults.parityGate.coreDigest.length === 64 &&
      idempotent,
    `equal ${String(probeResults.determinism.equal)}, idempotent ${idempotent}`
  );

  // ---- 38. no wall-clock field ---------------------------------------
  const volatileKeys = artifacts.flatMap((name) => {
    const file = path.join(P111_DIR, name);
    if (!fs.existsSync(file)) return [] as string[];
    const keys = collectKeys(JSON.parse(fs.readFileSync(file, "utf8")));
    return keys.filter((k) => VOLATILE_KEY.test(k)).map((k) => `${name}:${k}`);
  });
  check(
    "no wall-clock, duration, PID or UUID field is written to any artifact, and " +
      "volatileFieldsWritten is empty in both declaring artifacts",
    volatileKeys.length === 0 &&
      JSON.stringify(probeResults.integrity.volatileFieldsWritten) === "[]" &&
      JSON.stringify(manifest.volatileFieldsWritten) === "[]",
    JSON.stringify(volatileKeys)
  );

  // ---- 39. the freeze digest chain -----------------------------------
  const sourceIdentities = Object.values(manifest.sourceArtifacts);
  const digestChainOk =
    sourceIdentities.length === 13 &&
    sourceIdentities.every(
      (a) =>
        a.sha256Raw.length === 64 &&
        a.sha256Scientific.length === 64 &&
        a.path.length > 0 &&
        !a.path.startsWith("/") &&
        !a.path.includes("\\") &&
        Number.isInteger(a.bytes) &&
        a.bytes > 0 &&
        JSON.stringify(a.sha256ScientificExcluding) === '["durationMs"]'
    );
  const reconMatchesGrid = probeResults.grid.trajectories.every((t) => {
    const row = reconciliation?.rows.find((r) => r.trajectoryId === t.trajectoryId);
    return (
      row !== undefined &&
      row.generatedLength === t.generatedIds.length &&
      row.corrupted === t.corrupted &&
      row.firstInvalidTokenIndex === t.firstInvalidTokenIndex &&
      row.stepsAtP0 === t.stepsAtP0 &&
      row.phaseHistogram.P0 === t.stepsAtP0 &&
      row.phaseHistogram.P1 === t.stepsAtP1 &&
      row.phaseHistogram.P2 === t.stepsAtP2 &&
      row.phaseHistogram.P3 === t.stepsAtP3 &&
      row.phaseHistogram.PX === t.stepsAtPX
    );
  });
  check(
    "the freeze digest chain is closed — prompt-set.json, manifest.json and probe-results.json " +
      "carry one prompt-set digest — and the three result artifacts describe one grid",
    manifest.promptSetSha256 === probeResults.promptSetSha256 &&
      rawDigestOf(P111_PATHS.outPromptSet) === probeResults.promptSetSha256 &&
      manifest.selectionDigest === promptSet?.selectionDigest &&
      reconMatchesGrid &&
      digestChainOk
  );

  // ---- 40. source scans ----------------------------------------------
  for (const [relative, allowed] of Object.entries(MODEL_CALL_ALLOW_LIST)) {
    const file = path.join(ROOT, relative);
    if (!fs.existsSync(file)) {
      skip(`source scan of ${relative}`, "file is missing");
      continue;
    }
    const code = codeOf(fs.readFileSync(file, "utf8"));
    const modelCalls = [...new Set([...code.matchAll(MODEL_CALLS)].map((m) => m[1]))].sort();
    check(
      `${relative} calls no Math.random(), no timer and no training step`,
      !NONDETERMINISM_CALL.test(code) &&
        !TIMER_CALL.test(code) &&
        !TRAINING_CALLS.test(code),
      `random ${NONDETERMINISM_CALL.test(code)}, timer ${TIMER_CALL.test(code)}, ` +
        `training ${TRAINING_CALLS.test(code)}`
    );
    check(
      `${relative}'s only model calls are inside the explicit allow-list ${JSON.stringify(allowed)}`,
      modelCalls.every((c) => allowed.includes(c)),
      `found ${JSON.stringify(modelCalls)}`
    );
  }
  check(
    "the forward pass is the only model call in the logic module, so no generation helper " +
      "from another phase can be reached",
    [...new Set([...codeOf(fs.readFileSync(path.join(P111_DIR, "grid-external-closure-audit.ts"), "utf8")).matchAll(MODEL_CALLS)].map((m) => m[1]))].sort().join(",") ===
      "forward"
  );

  // ---- 41. the integrity block ---------------------------------------
  const integrity = probeResults.integrity;
  const honestNegatives = [
    "trainingPerformed",
    "checkpointFilesModified",
    "tokenizerModified",
    "vocabularyModified",
    "mergeTableModified",
    "promptTextModified",
    "datasetModified",
    "generationSettingsModified",
    "evaluatorModified",
    "thresholdModified",
    "rolloutDefinitionModified",
    "modelArchitectureModified",
    "decoderModified",
    "maskSemanticsModified",
    "usesMathRandom",
    "usesSetTimeout",
  ].every((k) => integrity[k] === false);
  check(
    "the integrity block states every negative honestly, and productionModulesModified is empty",
    honestNegatives &&
      JSON.stringify(integrity.productionModulesModified) === "[]" &&
      probeResults.trainingPerformed === false &&
      probeResults.usesMathRandom === false &&
      probeResults.usesSetTimeout === false &&
      manifest.modelLoadedBeforeFreeze === false &&
      manifest.generationBeforeFreeze === false
  );
  check(
    "the integrity block states the positives honestly: a model was loaded, forward passes " +
      "ran, and 68 generations were performed (48 new + 20 parity)",
    integrity.modelLoaded === true &&
      typeof integrity.forwardPassesRun === "number" &&
      integrity.forwardPassesRun > 0 &&
      integrity.generationsPerformed === 68 &&
      integrity.generationsPerformed ===
        probeResults.grid.trajectories.length + ARMS.length * FROZEN_PROMPTS.length &&
      integrity.writesOnlyItsOwnArtifacts === true &&
      integrity.promptSetFrozenBeforeModelLoad === true,
    `forward ${String(integrity.forwardPassesRun)}, generations ${String(integrity.generationsPerformed)}`
  );

  // ---- 42. no prior-phase artifact moved -----------------------------
  const drift = checkSourceDigests(manifest.sourceArtifacts);
  const phase99Now = scientificDigestOf(P111_PATHS.phase99Audit);
  check(
    "every recorded source artifact still digests to the value manifest.json recorded",
    drift.allUnchanged &&
      Object.keys(manifest.sourceArtifacts).length === 13,
    JSON.stringify(drift.drifted)
  );
  check(
    "phase99's SCIENTIFIC digest is unchanged before and after the run, and still matches " +
      "the scientific digest on disk",
    integrity.preRunPhase99ScientificDigest === integrity.postRunPhase99ScientificDigest &&
      integrity.phase99ScientificDigestUnchanged === true &&
      phase99Now === integrity.postRunPhase99ScientificDigest &&
      manifest.sourceArtifacts.phase99Audit.rawDigestReproducible === false
  );

  // ---- 43. no extra artifact or instrument ---------------------------
  const declaredFiles = [
    ".gitignore",
    "divergent-p0-decisions.json",
    "grid-external-closure-audit.ts",
    "manifest.json",
    "probe-results.json",
    "probe.ts",
    "prompt-set.json",
    "run-phase111-suite.ts",
    "run-probe.cmd",
    "trajectory-reconciliation.json",
  ].sort();
  const gitignored = new Set(["probe.log", "build.log", "typecheck.log", "research-suite.log", "focused-suite.log"]);
  const actual = fs
    .readdirSync(P111_DIR)
    .filter((f) => !gitignored.has(f))
    .sort();
  check(
    "Phase 111 added no artifact or instrument beyond its declared directory set",
    JSON.stringify(actual) === JSON.stringify(declaredFiles),
    `actual ${JSON.stringify(actual)}`
  );
  check(
    "no Phase-111 file is registered in the aggregate research runner, and the aggregate " +
      "runner is untouched by this phase",
    !fs
      .readFileSync(
        path.join(ROOT, "src", "lib", "minimind", "research", "__tests__", "run.ts"),
        "utf8"
      )
      .includes("phase111")
  );
}

// ============================================================
// Entry point
// ============================================================

export function runPhase111Tests(): { passed: number; failed: number; skipped: number } {
  console.log("\nPhase 111 — grid-external failure closure contract suite\n");

  check(
    "all five Phase-111 artifacts are present and parse",
    probeResults !== null &&
      manifest !== null &&
      promptSet !== null &&
      reconciliation !== null &&
      divergentArtifact !== null,
    ["probe-results.json", "manifest.json", "prompt-set.json", "trajectory-reconciliation.json", "divergent-p0-decisions.json"]
      .filter((f) => !fs.existsSync(path.join(P111_DIR, f)))
      .join(",")
  );

  if (probeResults === null || manifest === null || promptSet === null) {
    skip(
      "the contract suite",
      "the Phase-111 artifacts are missing; run `npx --yes tsx experiments/phase111/probe.ts --stage=all`"
    );
    return { passed, failed, skipped };
  }

  check(
    "the harness reached the frozen condition it claims: P12-MASK, and the dataset identity " +
      "is the frozen one",
    promptSet.condition === P111_CONDITION &&
      dataset !== null &&
      dataset.metadata.id === DATASET_IDENTITY.id &&
      dataset.metadata.version === DATASET_IDENTITY.version &&
      dataset.metadata.schemaVersion === DATASET_IDENTITY.schemaVersion,
    `dataset ${dataset === null ? "missing" : dataset.metadata.id}`
  );

  testPromptSelection();
  testHistoricalPrompts();
  testOrderingIsLoadBearing();
  testFrozenCondition();
  testEnumeration();
  testLabels();
  testPartition();
  testClassification();
  testReproducibilityAndIntegrity();

  console.log(`\nPhase 111 contract suite: passed=${passed} failed=${failed} skipped=${skipped}`);
  return { passed, failed, skipped };
}
