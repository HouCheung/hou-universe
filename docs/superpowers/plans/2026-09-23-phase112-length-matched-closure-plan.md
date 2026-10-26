# Phase 112 — Length-Matched External Closure Audit — Implementation Plan

**Date:** 2026-09-23
**Spec:** `docs/superpowers/specs/2026-09-23-phase112-length-matched-closure-design.md`
**Status:** plan only. **No implementation, no generation, no training, no commit.**

---

## 1. Scope

### 1.1 What Phase 112 is

A **generation-only, read-only, zero-training** experiment that re-runs the frozen
`P12-MASK` closure test of Phase 111 on a **fresh, mechanically selected external prompt
grid whose measured token lengths lie in the originally registered `13–30` range**.

The previous registered range was never satisfied: Phase 111 registered `13–30` and measured
`28–45` (`experiments/phase111/prompt-set.json`, re-verified in the spec §0.4). Phase 112
repairs that by selecting prompts **by measured token count**, so the registration is
satisfiable and satisfied before any checkpoint is loaded.

### 1.2 What Phase 112 is not

- Not a re-run of Phase 111. Different prompt population, separate verdict, no pooling.
- Not a universal-closure claim. Not "prompt length is irrelevant". Not "Phase 111 was wrong".
- Not the remedy Phase-111 report §16 recommendation 2 proposed (starving P0 compatible mass
  to make F2 reachable). That remains **open** and is named as a non-goal.
- Not training, not fine-tuning, not a checkpoint write, not a tokenizer/dataset/vocabulary
  change, not a mask/threshold/evaluator/rollout/sampling change.
- Not a commit.

### 1.3 Frozen condition, at a glance

| Item | Value |
|---|---|
| Condition | `P12-MASK` |
| Arms | `A`, `B94`, `C94`, `T` |
| `SEED` / `VOCAB_TARGET` / `MAX_TOKENS` / `MAX_CTX` / `TEMPERATURE` / `EOS_TOKEN_ID` | `42` / `300` / `24` / `128` / `0.8` / `3` |
| Grid | `12 prompts × 4 arms = 48 trajectories` |
| Parity | the frozen `5 prompts × 4 arms = 20 trajectories` |
| Prompt lengths, registered | `13 – 30` |
| Prompt lengths, measured and frozen | `18 – 30` (spec §3.4) |
| Verdict grades | `A` / `B` / `C` / `D` — unchanged, computed by the imported `classifyH111` |

---

## 2. Existing code / artifact dependencies

### 2.1 Importable source — exactly one file

**`experiments/phase111/grid-external-closure-audit.ts`**
sha256 `e55b4e346e346d6753b9a064bb9a0ec641fe75ef69eada8774989117369e57e8`

Verified for this plan: pure logic module — no `main()`, no `require.main` branch, no
`fs.writeFileSync`, no `fs.mkdirSync`; 77 exports. Empirically side-effect free: after
importing it, `experiments/phase99/logit-mechanism-audit.json` kept raw sha256
`fc7fa5b6…79468b` and mtime `2026-09-22 20:37:04` unchanged, and
`experiments/phase110/probe-results.json` kept `acc78927…a221b` unchanged.

Phase 112 imports **this and nothing else from a prior phase**. Phase 98 arrives transitively
(and carries the `require.main` guard).

Everything Phase 112 needs is re-exported by this module and is imported **by name**:

| Group | Imported symbols |
|---|---|
| Recipe / condition | `ARMS`, `SEED`, `VOCAB_TARGET`, `MAX_TOKENS`, `MAX_CTX`, `TEMPERATURE`, `EOS_TOKEN_ID`, `LEGAL_MASS_TOLERANCE`, `P111_CONDITION` |
| Instrument | `decodeP12Arm`, `buildTokenizer`, `loadCorpus`, `buildCorpusIndex`, `measureCorpusStateTransitions`, `createSeededRNG`, `sampleToken`, `tokenBytes`, `verifyScannerEquivalence` |
| Byte-phase / legality | `walkPhaseBytes`, `phaseOfIds`, `phaseOfConsumed`, `leadSequenceLength`, `phaseLegalIdsOf`, `buildPhaseMask`, `applyPhaseMask`, `maskedArgmaxOf`, `isContinuationByte`, `firstByteTestLegalAtP0`, `maskForCondition`, `stepLikeForP0`, `contextPhaseOf` |
| Classifier | `labelFailureMechanism`, `labelP0Mechanism`, `byteClassMassOf`, `MECHANISM_LABEL_DOMAIN`, `UNKNOWN_LABEL`, `FROZEN_FAMILY`, `frozenFamilyOf` |
| Partition | `partitionOf`, `bijectionOf`, `trajectoryLevelP0Facts`, `ConditionCensus`, `P0Partition`, `BijectionCheck` |
| Enumeration | `p0DecisionsOf`, `isDivergent`, `missingComparability` |
| Classification | `classifyH111`, `H111_INCONCLUSIVE_LITERAL`, `F2FirstEvent`, `H111Classification` |
| Selection | `selectExternalPrompts`, `SelectionResult`, `ExclusionRecord`, `ExternalPrompt`, `BilingualDataset`, `BilingualSample`, `MANIFEST_CLASS_ORDER`, `SELECTION_PER_CLASS`, `DATASET_IDENTITY`, `FROZEN_PROMPTS`, `GEN_EVAL_PROMPTS` |
| Fixtures | `BASELINE_P0_FAILURES`, `BASELINE_PARTITION`, `BASELINE_FAMILY_COUNTS`, `PHASE101_P0_LABELS` |

### 2.2 Copy ledger — **empty**

Phase 112 copies **no primitive**. Because it imports the identical object Phase 111 used,
instrument identity is structural rather than argued by parity. This supersedes Phase 111's
seven-group copy ledger (spec §2a).

### 2.3 Never imported

| Source | Reason |
|---|---|
| `experiments/phase99/logit-mechanism-audit.ts` | no `require.main` guard at `:2378`; importing executes `main()` and rewrites `experiments/phase99/logit-mechanism-audit.json` |
| `experiments/phase101/utf8-phase-mask-audit.ts` | imports Phase 99 → inherits the write |
| `experiments/phase102/p0-phase-mask-audit.ts` | imports Phase 101 → inherits the write |
| `experiments/phase110/failure-population-audit.ts` | side-effect free, but its primitives already arrive through the Phase-111 module; widening the boundary buys nothing |

No historical research file is modified to make Phase 112 easier.

### 2.4 Hard artifacts read (read-only, never rewritten)

| Path | Use |
|---|---|
| `src/data/minimind/datasets/bilingual.json` | prompt source; identity `{bilingual, 0.3.0, schemaVersion 1}`, 600 samples |
| `experiments/phase111/prompt-set.json` | the Phase-111 external prompt texts, for exclusion (b); raw sha256 pinned `4ce6c939c68a82c0759fbda5b30c9a6e484e852d5a456167613ad75a53f8b33c` |
| `experiments/phase102/probe-results.json` | the parity-gate baseline (`capabilityByArm[arm]["P12-MASK"].samples[i].generatedIds`, `illegalEmissions`, tokenizer census) |
| `experiments/phase102/static-failure-state.json` | the 11 established states' identity keys and `failureTokenIndex` |
| `experiments/phase101/static-failure-state.json`, `probe-results.json` | the 5 Phase-101-recorded P0 mechanism labels (P7) |
| `experiments/phase110/probe-results.json`, `manifest.json`, `state-join.json` | the F3 partition fixture and the 13 recorded source digests |
| `experiments/phase99/logit-mechanism-audit.json` | `durationMs` source-artifact warning; scientific digest recorded |

### 2.5 Checkpoints (read-only, never written)

| Arm | Path | sha256 (verified at plan time) |
|---|---|---|
| `A` | `experiments/phase90/phase90-aligned.ckpt.json` | `dff07a8366ba21e4a75c0ed48172bdc6848a882f252b2377e112c6152adcbc5e` |
| `B94` | `experiments/phase94/phase94-b.ckpt.json` | `c9f9d52d053e72eaf4ccaf54eced2590f663f07ca302b226c4290e1f5fe9dfcd` |
| `C94` | `experiments/phase94/phase94-c.ckpt.json` | `62557157cab318992f5701a59a444842e740717e2bfbf419db3163f3580a5e95` |
| `T` | `experiments/phase96/phase96-treatment.ckpt.json` | `5ebe2ab392ac8d0882233023b3c5ed5d111614372ceeff60ed0e566a550cb061` |

All four were re-verified to match Phase 111's manifest. `loadArmModel` reads only.

---

## 3. File-by-file implementation plan

| # | Path | Status | Purpose |
|---|---|---|---|
| 1 | `experiments/phase112/length-matched-closure-audit.ts` | new | logic module; no `main`; all exports pure or read-only |
| 2 | `experiments/phase112/probe.ts` | new | runner; writes exactly five artifacts |
| 3 | `experiments/phase112/run-probe.cmd` | new | launcher (`call npx --yes tsx …`) |
| 4 | `experiments/phase112/.gitignore` | new | excludes run logs only |
| 5 | `experiments/phase112/prompt-set.json` | generated | frozen prompt manifest + length record |
| 6 | `experiments/phase112/manifest.json` | generated | pre-generation freeze |
| 7 | `experiments/phase112/probe-results.json` | generated | full 48-trajectory record |
| 8 | `experiments/phase112/trajectory-reconciliation.json` | generated | 48-row trajectory table |
| 9 | `experiments/phase112/divergent-p0-decisions.json` | generated | per-decision enumeration |
| 10 | `experiments/phase112/run-phase112-suite.ts` | new | focused suite launcher |
| 11 | `src/lib/minimind/research/tests/phase112-length-matched-closure.test.ts` | new | contract suite, exports `runPhase112Tests()` |
| 12 | `src/lib/minimind/research/PHASE112-LENGTH-MATCHED-CLOSURE-REPORT.md` | new | report, written **after** measurement |

### 3.1 Not touched (explicit)

```
experiments/phase90/**   experiments/phase91/**   experiments/phase92/**
experiments/phase93/**   experiments/phase94/**   experiments/phase95/**
experiments/phase96/**   experiments/phase97/**   experiments/phase98/**
experiments/phase99/**   experiments/phase100/**  experiments/phase101/**
experiments/phase102/**  experiments/phase103/**  experiments/phase104/**
experiments/phase105/**  experiments/phase106/**  experiments/phase107/**
experiments/phase108/**  experiments/phase109/**  experiments/phase110/**
experiments/phase111/**                          <-- including its artifacts AND its report
all *.ckpt.json          all of src/data/minimind/**
src/lib/minimind/**                              <-- except the ONE new test file
src/lib/minimind/research/__tests__/run.ts       <-- NOT edited, NOT registered
```

Any exception requires the spec to be amended first and a narrowly justified reason recorded;
none is currently known.

---

## 4. Prompt-manifest construction

### 4.1 Rule R112 — implemented exactly as spec §3.2

`selectLengthMatchedPrompts(dataset, tokenizer, phase111PromptSet): LengthMatchedSelectionResult`

1. assert `dataset.metadata` equals `DATASET_IDENTITY`; assert `samples.length === 600`;
2. assert the frozen instrument digest (§5.1);
3. assert the Phase-111 prompt-set digest and recomputation parity (§5.2);
4. `exclusionIndexSet` = (a) ∪ (b) of spec §3.2 step 3;
5. per class, keep samples whose `tokenizer.encode(text).length ∈ [13, 30]`;
6. sort by `(tokenCount asc, datasetIndex asc)`;
7. strata `[⌊jN/4⌋, ⌊(j+1)N/4⌋)`, `j = 0…3`; pick the smallest-`datasetIndex` member of each;
8. throw `INCONCLUSIVE — insufficient deterministic length-matched external prompt set` when
   any class has `N < 4` or any stratum is empty;
9. manifest order `en → zh → mixed`, stratum `0 → 3` within class.

### 4.2 Resolved selection — re-derived, not trusted

The probe re-derives the selection from the dataset and compares its canonical digest to the
one recorded in the frozen `prompt-set.json`; a mismatch halts as `D`. The spec's §3.3 table
is a pre-registration, not an input.

| # | Class | ID | datasetIndex | tokens | stratum |
|---|---|---|---|---|---|
| 0 | en | `en-daily-10` | 25 | 24 | 0 |
| 1 | en | `en-daily-05` | 20 | 26 | 1 |
| 2 | en | `en-general-11` | 10 | 29 | 2 |
| 3 | en | `en-daily-03` | 18 | 30 | 3 |
| 4 | zh | `zh-daily-10` | 225 | 20 | 0 |
| 5 | zh | `zh-sci-12` | 299 | 24 | 1 |
| 6 | zh | `zh-daily-02` | 217 | 28 | 2 |
| 7 | zh | `zh-general-12` | 211 | 29 | 3 |
| 8 | mixed | `mixed-map-13` | 512 | 18 | 0 |
| 9 | mixed | `mixed-map-05` | 504 | 20 | 1 |
| 10 | mixed | `mixed-map-06` | 505 | 22 | 2 |
| 11 | mixed | `mixed-tech-18` | 417 | 30 | 3 |

Excluded: **17** samples — 5 by the frozen-prompt substring rule (computed by
`selectExternalPrompts(dataset).excluded`, and it includes `zh-fact-01`, the sample Phase 111's
spec prose omitted and its rule included) + 12 Phase-111 external prompts.

Eligible in-range before truncation: `en 45`, `zh 41`, `mixed 60`. The insufficient branch is
therefore not reachable, and the suite asserts the counts are `≥ 4` rather than asserting the
literal numbers.

### 4.3 Audited alternative rules (recorded, not selected)

`resolveAlternativeRuleP` and `resolveAlternativeRuleS` resolve both alternatives at run time
and write their realized selections plus the measured rejection reasons into
`prompt-set.json.auditedAlternatives`:

- **Rule P** (exclusion → range filter → first four by array order): realized
  `en` 29, 28, 29, 30 · `zh` 29, 28, 20, 27 · `mixed` 30, 29, 30, 29 → aggregate `20–30`,
  only 2 of 12 below 28, `en` and `mixed` **entirely inside** Phase 111's observed `28–45`.
- **Rule S** (rank-quartile at `⌊j·(N−1)/3⌋`): spans `13–30`, but 4 of 12 prompts from
  `validation`/`test` splits.

Recomputation, not prose, is what the artifact records.

### 4.4 Token-length measurement is first-class

`prompt-set.json` carries, for the selection **and** the eligible population:

- `tokenizerIdentity` — `vocabSize`, corpus digest, `idToToken` digest, `VOCAB_TARGET`, `SEED`;
- `tokenCount` for each of the 12 prompts (the exact integer from
  `tokenizer.encode(text).length`);
- `perClassMeasuredRange` and `aggregateMeasuredRange` for both sets;
- `eligibleCountsPerClass` **before** truncation (`45 / 41 / 60`);
- `boundaryMembership.selectedAt30` = `["en-daily-03", "mixed-tech-18"]`,
  `boundaryMembership.at13` = `[]`,
  `boundaryMembership.eligibleAt13` = `["mixed-map-30"]` (recorded, not selected);
- `rule` — the nine steps verbatim;
- `auditedAlternatives` (§4.3).

No rounding, truncation, padding or length manipulation anywhere.

### 4.5 Manifest freezing before generation

`prompt-set.json` is written and hashed **before any model is loaded**
(`modelLoadedBeforeFreeze: false`, `generationBeforeFreeze: false`). Enforcement is
mechanical:

- the probe computes the manifest in memory, compares it against the on-disk file, and halts
  (`D`) on a canonical-digest mismatch;
- `manifest.json` records `promptSetSha256` and `selectionDigest`;
- `probe-results.json` restates the digest it consumed;
- the suite recomputes the selection from the dataset and requires the digest to match.

Generation reads prompts **only** from the frozen file, so post-measurement prompt selection
is structurally impossible.

---

## 5. Pre-generation gates

### 5.1 Frozen-instrument gate

```
sha256("experiments/phase111/grid-external-closure-audit.ts")
  === "e55b4e346e346d6753b9a064bb9a0ec641fe75ef69eada8774989117369e57e8"
```

Failure → `D — BLOCKED — frozen instrument digest mismatch`. Necessary because the Phase-111
module is **untracked** (spec §0.1), so git cannot pin it.

### 5.2 Phase-111 prompt-set parity gate

```
sha256("experiments/phase111/prompt-set.json") === "4ce6c939c68a82c0759fbda5b30c9a6e484e852d5a456167613ad75a53f8b33c"
AND promptSet.resolvedSelection[].text (in order)
  === selectExternalPrompts(dataset).selection[].text (in order)
```

Failure → `D`. Recomputation parity, not trust.

### 5.3 Baseline parity gate (spec §6) — before any new prompt

Re-derive the frozen 20 trajectories under `P12-MASK` through the Phase-112 code path and
require all eight:

| ID | Requirement |
|---|---|
| P1 | `generatedIds` byte-identical, 20/20 |
| P2 | `p0IllegalDraws === 11` **and** `corruptedTrajectories === 11` |
| P3 | the 11 established states reproduced as an exact set, `failureTokenIndex` matching |
| P4 | `221 − 11 − 210 === 0`, gap `0`, bijection holds |
| P5 | `phaseLegalIdsOf(vocab, BOUNDARY_STATE)` set-identical to the per-byte walk; both agree with the production scanner |
| P6 | `compatibleMass` at P0 equals Phase 102's recorded `legalMass` within `1e-9` |
| P7 | derived family `{boundary-state-continuation ×7, sampling-draw ×4}` **and** 5/5 Phase-101-recorded P0 labels |
| P8 | `p1p2IllegalDraws === 0` **and** `otherIllegalDraws === 0` |

Plus checkpoint identities (4/4), tokenizer census identity, recipe identity, exact failure
indices, `221 = 11 + 210`. Any failure → `D — BLOCKED — frozen-condition parity not
established`, and **no new prompt is generated**.

Rôle restated: since the instrument is imported rather than copied, P1–P8 prove the
**environment** (dataset, corpus, BPE build, vocabulary, checkpoints) is unchanged since
Phase 111 — not that a copy is faithful.

The family is **derived** from the re-derived 11 baseline states and then required to equal
the imported `FROZEN_FAMILY`.

---

## 6. Generation, enumeration, classification

### 6.1 Frozen generation protocol

`--stage=parity`: `decodeP12Arm(armKey, FROZEN_PROMPTS as DecodePrompt[], model, tokenizer,
vocab, continuationStartIds, vocabById, null, createSeededRNG(42))` — `support === null`, so
parity decisions are left non-comparable by the recorded reason; an absent measurement is
never reinterpreted as a measurement.

`--stage=grid`: the same call with the 12 Phase-112 prompts and a real
`SupportContext = { index: buildCorpusIndex(tokenizer, corpus), stateTransitions:
measureCorpusStateTransitions(index, vocab, idToToken) }`, one `createSeededRNG(42)` per arm,
created once and consumed across the 12 manifest prompts **in manifest order**, exactly one
draw per sampling step. No per-prompt reseeding; no second seed; no sweep.

Empty-mask termination occurs **before** any RNG draw is consumed. Horizon `MAX_TOKENS = 24`.
EOS handling unchanged. Every trajectory is recorded whether or not it looks malformed; none
is discarded. No second condition, no new corruption criterion, no threshold change.

### 6.2 Enumeration

For all 48 trajectories, every step is inspected and every P0 decision carries the full
field set of spec §5.2. **Divergence** is the imported `isDivergent`:
`phaseBefore === "P0" && selectedLegal === false`. **Comparability** is the imported
`missingComparability`; the census records `divergentP0Draws`, `comparableDivergentP0Draws`
and `nonComparableDivergentP0Decisions` separately. Corpus support comes from the same
machinery Phase 102 used (`EXACT_CONTEXT_LEN = 4`), never semantic similarity.

### 6.3 F1 / F2 / F3

Imported, not restated.

- **F1** — reported via `p1p2IllegalDraws` and `otherIllegalDraws`. Zero is **not** closure
  evidence. Nonzero → `D`. F1 never produces `B`.
- **F2** — the first **comparable** divergent P0 decision whose `mechanismLabel` is outside
  the derived family, by trajectory order then token index. The literal identity-key reading
  (`literalIdentityKeyNewMembers`) is reported as an observation and is **not** the operative
  test. F2 is not adjusted in response to Phase 111's result.
- **F3** — `partitionGap = p0Steps − divergentP0 − intactP0` via the imported `partitionOf`,
  under the exact Phase-110 definition. Not redefined. No new gap metric.

### 6.4 Classification

Computed by the imported `classifyH111`, fed Phase-112's own measurements. Precedence
`D → F1 → B → A → C`. Phase 112's grades are therefore Phase 111's grades **by
construction**; the suite proves the equivalence on synthetic inputs rather than asserting
it, and re-derives the recorded verdict from the recorded falsifier block.

Zero comparable divergences ⇒ `C — INCONCLUSIVE — no comparable failure observed`, never `A`.
Fewer than 4 eligible candidates in a class ⇒ pre-generation
`C — INCONCLUSIVE — insufficient deterministic length-matched external prompt set`; the
`[13, 30]` range is never relaxed.

No pooling: the verdict uses Phase-112's 48 trajectories only.

---

## 7. Artifact schemas and write order

### 7.1 Write order

| Stage | Writes | Model loaded? |
|---|---|---|
| `frozen` | `prompt-set.json`, `manifest.json` | **no** |
| `parity` | nothing (logs only) | yes |
| `grid` | `probe-results.json`, `trajectory-reconciliation.json`, `divergent-p0-decisions.json` | yes |
| `all` | `frozen → parity → grid` | yes |

`frozen`/`parity`/`grid` write nothing except `frozen`'s two freeze artifacts, so a
partially-written artifact set can never exist as evidence. `main()` runs only under
`require.main === module`, so the suite may import the probe without generating.

### 7.2 `manifest.json`

`phase`, `title`, `status: "FROZEN BEFORE GENERATION — no model was loaded and nothing was
generated"`, `readOnly: true`, `trainingPerformed: false`, `usesMathRandom: false`,
`usesSetTimeout: false`, `volatileFieldsWritten: []`, plus:

- `hypothesis` — `{ id: "H112", statement, falsifiers: {F1, F2, F3}, operativeFamilySource,
  literalIdentityKeyReading }`;
- `recipe` — the §1.3 block, with `rngConvention` spelled out and `prompts: 12`,
  `trajectories: 48`, `parityTrajectories: 20`;
- `arms` — 4 entries with `checkpointPath` + `checkpointSha256` (§2.5);
- `importBoundary` — `imports: [{ path: "experiments/phase111/grid-external-closure-audit.ts",
  sha256: "e55b4e34…9e57e8" }]`, `copied: []`, `notImported: [phase99, phase101, phase102,
  phase110]` with reasons;
- `pinnedPhase111PromptSet` — path + raw sha256 + `resolvedSelectionDigest`;
- `promptSetPath`, `promptSetSha256`, `selectionDigest`;
- `sourceArtifacts` — every digest-bearing source from §2.4, each with `bytes`, `sha256Raw`,
  `sha256ScientificExcluding: ["durationMs"]`, `sha256Scientific`, `rawDigestReproducible`;
- `preRegisteredParity` — `{ trajectories: 20, p0IllegalDraws: 11, corruptedTrajectories: 11,
  partition: { p0Steps: 221, divergentP0: 11, intactP0: 210, gap: 0 }, frozenFamily: [...],
  baselineFamilyCounts: {"boundary-state-continuation": 7, "sampling-draw": 4},
  phase101P0Labels: [...5], mechanismLabelDomain: [...5], legalMassTolerance: 1e-9 }`;
- `frozenBeforeGeneration: true`, `readsItsOwnPromptSetOnly: true`,
  `modelLoadedBeforeFreeze: false`, `generationBeforeFreeze: false`;
- `integrity` — the negative and positive attestations of §9.

### 7.3 `probe-results.json`

Top-level keys mirroring Phase 111's: `phase`, `title`, `readOnly`, `trainingPerformed`,
`usesMathRandom`, `usesSetTimeout`, `generator`, `recipe`, `promptSetPath`,
`promptSetSha256`, `selectionDigest`, `lengthRecord` (the §4.4 block copied from
`prompt-set.json`), `parityGate` (requirements P1–P8 with `expected`/`observed`/`pass`),
`grid`, `census`, `mechanismFamily`, `partition`, `falsifiers` (F1/F2/F3 each with its
observed value and `fired`), `observations`, `classification`, `determinism` (two canonical
digests, `equal`), `integrity`.

### 7.4 `trajectory-reconciliation.json`

One row per trajectory: `trajectoryId`, `armKey`, `manifestIndex`, `prompt`, `class`,
`promptTokenCount`, `generatedIds`, `generatedBytes`, `stepsAtP0/P1/P2/P3/PX`,
`firstInvalidPhase`, `corrupted`, `divergentCount`, `comparableCount`,
`firstDivergentTokenIndex`.

### 7.5 `divergent-p0-decisions.json`

All P0 decisions with the spec §5.2 field set, plus `census`, `partition`,
`divergent` (the filtered subset) and `firstDivergentByTrajectory`.

### 7.6 Serialisation

Every artifact is `JSON.stringify(value, null, 2)` with **no trailing newline**, all paths
repository-relative and forward-slashed, no wall-clock field, no duration, no PID, no UUID,
no machine-specific metadata, no filesystem-enumeration ordering. Each artifact's **raw
sha256 is the reproducible identity of its evidence**.

---

## 8. Test plan

`src/lib/minimind/research/tests/phase112-length-matched-closure.test.ts`, exporting
`runPhase112Tests()`. It reads the five artifacts, re-derives every frozen fixture from the
source artifacts, and **never hardcodes a Phase-112 outcome** — no verdict, no new
divergence count, no generated id of the new grid, no label of the new grid, no partition
count of the new grid. Only genuinely frozen historical fixtures are hardcoded: `20 / 11 /
11 / 221 = 11 + 210 /` the 5 Phase-101 P0 labels `/` the family `{bsc ×7, sd ×4}` `/
1e-9 /` the 5-value classifier domain.

The brief's twenty-one required areas map as follows ("no randomness" and "no timer" are
covered together as group **S**).

**A. Deterministic selection** (§16 "deterministic selection")
1. two evaluations of `selectLengthMatchedPrompts` produce identical canonical digests;
2. the resolved selection's digest matches the digest recorded in `prompt-set.json`;
3. re-running the probe's `frozen` stage reproduces byte-identical `prompt-set.json`.

**B. 13–30 measured length requirement** (§16 "13–30 measured token-length requirement")
4. every selected prompt's `tokenCount` satisfies `13 ≤ n ≤ 30`, recomputed with
   `buildTokenizer(loadCorpus(), 300)`;
5. a synthetic candidate pool containing an 12-token and a 31-token sample yields a
   selection excluding both — the filter is inclusive at the endpoints;
6. no selected `tokenCount` equals the sample's character count or byte length (guards
   against a character-count regression on a fixture where the three differ).

**C. No prompt reuse** (§16 "no prompt reuse")
7. no selected prompt text equals any of the five frozen prompts;
8. no selected prompt text equals any of the 12 Phase-111 external prompt texts, read from
   `experiments/phase111/prompt-set.json`;
9. the mechanical exclusion set is **17** entries and equals
   `selectExternalPrompts(dataset).excluded ∪ {index of each Phase-111 prompt text}`;
10. a source scan of `experiments/phase90…110` prompt literals (comment/string-stripped)
    returns **only** the five frozen prompts, so no earlier phase contributed a generation
    prompt outside the exclusion set;
11. the exclusion is computed from the dataset and the frozen artifact — a source scan of the
    Phase-112 module finds no hardcoded prompt-text exclusion list.

**D. Class allocation** (§16 "class allocation")
12. exactly 12 entries, `4 / 4 / 4` across `en` / `zh` / `mixed`;
13. manifest order is `en → zh → mixed`, and within a class the stratum index is
    non-decreasing;
14. every class's eligible in-range count is `≥ 4`, so the insufficient branch is not
    reachable — asserted as a bound, not as the literal `45 / 41 / 60`;
15. a synthetic class with 3 eligible candidates raises the literal
    `INCONCLUSIVE — insufficient deterministic length-matched external prompt set`, and the
    range is not widened to recover.

**E. Manifest freezing** (§16 "manifest freezing")
16. `manifest.json.promptSetSha256` equals the on-disk `prompt-set.json` digest; a mutated
    copy fails the check;
17. `probe-results.json.promptSetSha256` equals `manifest.json.promptSetSha256` — the digest
    chain closes;
18. `manifest.json` records `frozenBeforeGeneration: true`,
    `modelLoadedBeforeFreeze: false`, `generationBeforeFreeze: false`;
19. reordering the manifest changes at least one arm's generated ids under the frozen RNG
    (proved on a small deterministic fixture, not on the new grid), so ordering is
    load-bearing.

**F. Checkpoint identity** (§16 "checkpoint identity")
20. four checkpoint identities match `manifest.json`, the files exist, and their sha256 equal
    the four values recorded in Phase 111's manifest;
21. a tampered path or digest fixture fails the identity check.

**G. Tokenizer identity** (§16 "tokenizer identity")
22. the rebuilt vocabulary reproduces Phase-102's recorded P0 census — `300` vocab / `223`
    legal at P0 / `77` illegal / `64` continuation-start / `13` forbidden-lead,
    `p0CandidateCount = 223` — **read back** from Phase 102's artifact rather than re-derived
    through the Phase-102 module chain (which would rewrite Phase 99's artifact);
23. `prompt-set.json.tokenizerIdentity` matches the rebuilt tokenizer;
24. the recorded `tokenCount` for each selected prompt equals
    `tokenizer.encode(text).length` recomputed now.

**H. Frozen recipe identity** (§16 "frozen recipe identity")
25. `SEED`, `VOCAB_TARGET`, `MAX_TOKENS`, `MAX_CTX`, `TEMPERATURE`, `EOS_TOKEN_ID` equal the
    values Phase 102 recorded, and the module's `EOS_TOKEN_ID` equals `recipe.eosTokenId`.

**I. P12-MASK identity** (§16 "P12-MASK identity")
26. the imported `buildPhaseMask` is inactive at `need === 0`, inactive when unrecoverable,
    active at `need > 0`, on fixtures;
27. `applyPhaseMask` writes exactly `-Infinity` outside the candidate set and leaves legal
    logits bit-identical; `maskedArgmaxOf` tie-breaks by ascending id.

**J. Baseline parity** (§16 "baseline parity")
28. all eight parity requirements P1–P8 are recorded `pass: true` and re-read by the test;
29. `parityGate.pass === true`, and a synthetic failing requirement forces `D`;
30. the derived 11-state family is `{boundary-state-continuation × 7, sampling-draw × 4}` and
    equals the imported `FROZEN_FAMILY`;
31. the derivation reproduces the 5 Phase-101-recorded P0 labels exactly from the artifact's
    own recorded quantities;
32. the 11-state key set and `failureTokenIndex` values match Phase 102's recorded set;
33. `P1/P2 illegal = 0`, `other illegal = 0`.

**K. Complete trajectory accounting** (§16 "complete trajectory accounting")
34. 48 trajectories exist, `48 = 12 × 4`, each present in both companion artifacts;
35. per trajectory `steps.length === generatedIds.length`, and
    `stepsAtP0 + … + stepsAtPX === steps.length`;
36. every P0 decision carries every spec §5.2 field, none `undefined`; probabilities in
    `[0,1]` and `legalMass + illegalMass ≈ 1` within `1e-9`;
37. the byte offset recorded for a decision equals the bytes emitted before it;
38. no trajectory is missing and none is discarded.

**L. Divergence definition** (§16 "divergence definition")
39. `divergent` equals `phase === "P0" && selectedLegal === false`, recounted by a second
    code path from `divergent-p0-decisions.json`, not by re-reading the flag;
40. the grid census agrees between the two artifacts.

**M. Comparability** (§16 "comparability")
41. `comparable + nonComparable === divergent`, per trajectory and in aggregate;
42. a synthetic decision with an off-P0 phase or a non-finite mass yields a non-null reason
    and is excluded from F2 — an absent measurement is never treated as measured.

**N. Frozen mechanism family** (§16 "frozen mechanism family")
43. the classifier domain is closed at 5 values; repeated labelling never returns a sixth;
44. `midstate-new-lead` is structurally unreachable for a P0 decision (asserted from the
    classifier's rule order); the reachable non-family labels are exactly
    `{under-ranked-legal, illegal-argmax-other, unknown}`;
45. the wrapper maps an out-of-domain input to `"unknown"` by injection, and `"unknown"` is
    outside the family so a synthetic decision carrying it fires F2.

**O. F1 / F2 / F3 precedence** (§16 "F1 / F2 / F3 precedence")
46. F1 nonzero classifies as `D` and **not** `B`; F1 zero is recorded as a consistency check,
    not as closure evidence;
47. a synthetic F2 firing classifies as `B`; a synthetic F3 firing classifies as `B`; the
    reported first falsifying event is the earliest by trajectory order, then token index;
48. the four grades are individually reachable, one synthetic input each, and the precedence
    `D → F1 → B → A → C` is fixed;
49. every `A` verdict the suite constructs carries `comparableDivergentP0Draws > 0` — the
    classifier cannot return `A` on an empty population;
50. the recorded verdict is re-derivable from the recorded falsifier block;
51. `classifyH111` imported by Phase 112 agrees with the recorded classification, proving
    the verdict semantics are Phase 111's by construction.

**P. Zero-divergence ⇒ C** (§16 "zero-divergence → C")
52. zero comparable divergences yields exactly
    `INCONCLUSIVE — no comparable failure observed`, never `A`;
53. the pre-generation insufficient-selection literal is distinct from the zero-divergence
    literal and is classified `C`, not `D`.

**Q. Reproducibility** (§16 "reproducibility")
54. two in-process runs of the deterministic core produce equal canonical digests;
55. the two fresh-process runs' five artifacts have equal raw sha256 (when both runs are
    recorded), and a disagreement is surfaced as `BLOCKED — reproducibility failure` rather
    than resolved;
56. the suite re-serialises each artifact with `JSON.stringify(value, null, 2)` and confirms
    it reproduces the file's bytes exactly.

**R. No training** (§16 "no training")
57. the integrity block states `trainingPerformed: false`,
    `checkpointFilesModified: false`, `tokenizerModified: false`,
    `vocabularyModified: false`, `mergeTableModified: false`, `promptTextModified: false`,
    `datasetModified: false`, `generationSettingsModified: false`,
    `productionModulesModified: []`, plus the honest positives `modelLoaded: true`,
    `forwardPassesRun > 0`, `generationsPerformed: 68` (48 new + 20 parity),
    `writesOnlyItsOwnArtifacts: true`;
58. neither the logic module nor the probe contains call-shaped
    `train(` / `backward(` / `optimizer.` / `fit(`; the only model call is `forward(` via
    `Tensor.noGrad` — asserted against an explicit allow-list.

**S. No randomness, no timer** (§16 "no randomness" / "no timer")
59. neither file calls `Math.random()`; `usesMathRandom: false`;
60. neither file calls a timer (`setTimeout`, `setInterval`, `setImmediate`);
    `usesSetTimeout: false`;
61. the probe's own `main` runs only under `require.main === module` (source scan), and the
    test imports the probe without generating.

**T. No historical artifact mutation** (§16 "no historical artifact mutation")
62. `experiments/phase99/logit-mechanism-audit.json`'s **scientific** digest is unchanged
    after a probe → suite → probe cycle; its raw digest may move only when the aggregate
    runner reaches the Phase-99 chain, and `manifest.json` labels it
    `rawDigestReproducible: false` accordingly;
63. every other recorded source artifact's digest matches the manifest after the run;
64. Phase 111's artifacts are unchanged: the five recorded sha256 (including
    `prompt-set.json` `4ce6c939…`) still match, and no file under `experiments/phase111/`
    was written;
65. `src/lib/minimind/research/__tests__/run.ts` contains no Phase-112 import;
66. Phase 112 added no file beyond the twelve declared in §3 (directory listing compared
    against the declared set, log files excluded by `.gitignore`).

---

## 9. Report plan

`src/lib/minimind/research/PHASE112-LENGTH-MATCHED-CLOSURE-REPORT.md`, written **after**
measurement, never pre-written. Header with hypothesis, verdict, `Training: NOT RUN`, and the
generation-only declaration.

Skeleton (Phase-102/109/110/111 report convention):

1. Phase-111 final validation
2. H112 research question
3. Pre-registered protocol (rule R112, frozen condition, falsifiers, non-goals)
4. Prompt manifest — frozen, with digests; the exclusion set; the resolved selection; and the
   **measured length record**, including the per-class and aggregate ranges, the eligible
   counts before truncation, the boundary membership, and the audited alternatives
5. Frozen-condition parity gate (all eight requirements)
6. Generation grid (48 trajectories; per-class and per-arm results)
7. Divergent-P0 enumeration (census, comparability, corpus support)
8. Mechanism-label family and F2
9. Partition gap and F3
10. Byte-phase consistency and F1
11. Length-stratified observations — the selected grid's measured lengths against Phase 111's
    `28–45`, the disclosed `28–30` overlap, and the unexercised `13` boundary
12. Closure classification (A/B/C/D with the precedence applied)
13. Reproducibility (two in-process digests, two fresh-process runs, volatile fields)
14. Limitations (the spec §12 list, verbatim in substance)
15. What is NOT proven
16. Phase-113 recommendation
17. Final conclusion

Plus the two trailing blocks: **Integrity** (sources and digests, the copy ledger recorded as
empty, the pinned Phase-111 instrument, the Phase-99 `durationMs` warning, the no-training
attestation, and the fact that **Phase 111 remains untracked**) and **Validation** (the nine
commands of spec §13 with results, the pre-existing `tsc` errors and build warnings declared
out of scope).

Mandatory statements in the verdict section:

> **Zero-divergence rule.** `0 comparable divergent P0 decisions` ⇒
> `INCONCLUSIVE — no comparable failure observed`. Absence of a new failure in this finite
> length-matched sample does not establish that the failure population is universally
> complete.
>
> **Finite-sample scope.** Even an `A` result supports only the finite Phase-112
> prompt/checkpoint grid under the frozen condition. It does not establish universal closure
> over arbitrary prompts, and it does not establish that prompt length is irrelevant.

The report must distinguish *no new divergent event observed* from *the failure population is
universally complete*, and must not pool Phase-111 and Phase-112 populations into one verdict.

---

## 10. Execution sequence

1. implement `length-matched-closure-audit.ts`; unit-check the selection in isolation against
   the spec §3.3 table;
2. implement `probe.ts` with `frozen` / `parity` / `grid` / `all` and the `require.main` guard;
3. run `--stage=frozen`; **verify no model is loaded** and inspect `prompt-set.json` fully —
   the selection, the length record, the eligible counts, the boundary membership, the
   audited alternatives — before proceeding;
4. run `--stage=parity`; require P1–P8 all pass before any new-prompt generation;
5. run `--stage=all` for the real run; two fresh processes, requiring byte-identical
   artifacts;
6. implement the contract suite and `run-phase112-suite.ts`; iterate on the suite only;
7. run the aggregate research suite `src/lib/minimind/research/__tests__/run.ts` **before**
   the final probe pass (the Phase-99 `durationMs` coupling);
8. re-run `--stage=all` as the final pass; re-digest every source artifact;
9. write the report from the artifacts;
10. run the nine spec §13 gates and record them in the report's Validation block;
11. report the Git boundary. Do not commit.

---

## 11. Validation gates

| Gate | Command | Expected |
|---|---|---|
| G1 | `npx --yes tsx experiments/phase112/run-phase112-suite.ts` | `passed>0 failed=0 skipped=0` |
| G2 | `npx --yes tsx experiments/phase111/run-phase111-suite.ts` | `passed=79 failed=0 skipped=0` (unchanged) |
| G3 | `npx --yes tsx experiments/phase110/run-phase110-suite.ts` | `79 passed, 0 failed, 0 skipped` (unchanged) |
| G4 | `npx --yes tsx src/lib/minimind/research/__tests__/run.ts` | `TOTAL: 2597 passed, 0 failed` — **run before the final probe pass** |
| G5 | `npx tsc --noEmit` | pre-existing baseline; **0** in `experiments/phase112/**`, the new test file, the report path |
| G6 | `npm run build` | exit 0; no new warning attributable to Phase 112 |
| G7 | post-run re-digest of all recorded sources | every scientific digest matches; Phase-99 **scientific** digest unchanged; Phase-111 artifacts unchanged |
| G8 | `git status --short experiments/phase112/` | exactly the declared files; logs excluded by `.gitignore` |
| G9 | `git diff --stat -- src/lib/minimind/**` | only the one new test file added; no existing file in that tree modified |

The 64 pre-existing `tsc` errors and the 178 pre-existing build warnings are declared out of
scope and are **not** repaired.

---

## 12. Git boundary

- **No commit. No push. No `git add -A`. No `git add .`.**
- Phase 112 does **not** commit Phase 111. Phase 111 is untracked
  (`git ls-files experiments/phase111/` is empty; `git status --short experiments/phase111/`
  shows `?? experiments/phase111/`), and Phase 112 leaves that exactly as found.
- The unrelated pre-existing uncommitted backlog in the working tree is left exactly as
  found and is not touched.
- The final report states: the exact Phase-112 commit boundary, the excluded log files, the
  unmodified status of `research/__tests__/run.ts`, confirmation that all Phase-90–111
  artifacts are byte-unchanged, and the fact that Phase 111 remains untracked.
- The repository was **not** assumed clean at any point; §5.1's digest pin and §10 step 8's
  re-digest are the mechanical guards against a dirty tree.

---

## 13. Specification traceability

| Spec section | Implemented in |
|---|---|
| §0 prior-art audit, untracked Phase 111 | §1.2, §12; `manifest.json.importBoundary` |
| §1 research question | `manifest.json.hypothesis.id = "H112"` |
| §2 frozen conditions | §1.3; `manifest.json.recipe`, `manifest.json.arms` |
| §2a import boundary | §2.1–§2.3; `manifest.json.importBoundary`; `assertFrozenInstrumentDigest` |
| §3.1 audit fixing the rule | §4.3; `resolveAlternativeRuleP`, `resolveAlternativeRuleS` |
| §3.2 rule R112 | §4.1; `selectLengthMatchedPrompts` |
| §3.3 resolved selection | §4.2 |
| §3.4 measured length record | §4.4; `prompt-set.json.lengthRecord` |
| §3.5 composition properties | §9 item 11; suite tests 12–14 |
| §4 generation grid | §6.1 |
| §5.1 scope isolation | §6.4; report §3 and §17 |
| §5.2–§5.4 enumeration, divergence, comparability | §6.2; suite tests 34–42 |
| §6 baseline parity gate | §5.3; suite tests 28–33 |
| §7 F1/F2/F3 and verdicts | §6.3–§6.4; suite tests 46–53 |
| §8 sample size and power | report §6 and §14 |
| §9 artifacts | §3, §7 |
| §10 reproducibility | §7.6, §8 Q; suite tests 54–56 |
| §11 non-goals | §1.2, §3.1; suite tests 57–66 |
| §12 coherence caveats | report §14 |
| §13 validation and reporting | §11, §9 |
