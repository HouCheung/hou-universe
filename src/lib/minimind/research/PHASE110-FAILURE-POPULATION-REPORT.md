# Phase 110 — Failure-Population Completeness Audit

**Hypothesis H110.** Under the frozen `P12-MASK` condition, every P0 decision in the
20 recorded generations that diverges from the corpus-supported continuation is
represented by one of the 11 recorded failure states.

**Pre-registered falsifier.** If any recorded generation contains a divergent P0
decision whose identity is absent from the 11-state failure population — on a prompt
outside the five recorded prompts, at a step index absent from the recorded failure
set, or in a trajectory not among the recorded twenty — H110 is falsified.

**Decision: A — PASS — failure population complete.**

**Training: `NOT RUN`.** No model was loaded, no forward pass was run, no generation
was performed, no checkpoint was written, no tokenizer, vocabulary, merge rule,
architecture, prompt, dataset, sampling setting, rollout, Phase-95 threshold,
evaluator or prior-phase artifact was modified.

---

## §1. Scope and the six questions this phase answers

Phase 109 closed with verdict A — *single-state effect supported* — and flagged an
unresolved bookkeeping issue: **Phase 99 recorded 12 corrupted trajectories, but the
mechanism work that followed repeatedly analysed only 11 failure states.** Phase 110
exists to settle whether that 12-versus-11 gap hides a missing failure state.

The phase was required to answer six questions without assuming the answer was "just
a counting difference". Each is answered here and evidenced in the sections named.

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Which trajectories were corrupted? | 12 of the 20, under the Phase-99 `BASE` condition | §4 |
| 2 | Which of them have failure states? | All 12 have a Phase-99 failure entry, by exact composite key | §4 |
| 3 | Is one trajectory represented by several failure definitions? | No — 12 trajectories, 12 entries, no duplicates | §4, §5 |
| 4 | Is 11 counting states while 12 counts trajectories? | Yes, but not within one condition: **12 is the `BASE` corrupted-trajectory count and 11 is the `P12-MASK` corrupted-trajectory count** | §8 |
| 5 | Does a divergent P0 decision exist outside the 11? | No — the P0 population closes exactly | §6, §7 |
| 6 | Is 12-vs-11 a labelling artifact or a genuinely missing state? | A bookkeeping consequence of comparing two decoding conditions. No state is missing | §8, §11 |

---

## §2. Zero-training compliance

The phase is a read-only enumeration. It loads no model, runs no forward pass,
generates nothing, and writes only inside `experiments/phase110/`.

The probe's own integrity block attests, field by field, that `trainingPerformed`,
`checkpointFilesModified`, `tokenizerModified`, `vocabularyModified`,
`mergeTableModified`, `modelArchitectureModified`, `generationSettingsModified`,
`phase95EvaluatorModified`, `phase95ThresholdsModified`, `promptTextModified`,
`datasetModified`, `samplingModified`, `rolloutModified`, `decodingMaskAdded`,
`newScoringFunctionAdded`, `classifierAdded`, `usesMathRandom` and `usesSetTimeout`
are all `false`, that `modelLoaded` is `false`, that `forwardPassesRun` and
`generationsPerformed` are `0`, that `productionModulesModified` is empty, and that
`writesOnlyItsOwnArtifacts` is `true`. The contract suite re-reads that block.

No `Math.random()` and no timer appears in either instrument; the suite scans both
sources for call-shaped training, backward, optimizer, forward and generation
routines and finds none.

No prior-phase artifact was patched, rewritten, normalised or "corrected". Phase 110
observes the historical construction; it does not repair it.

---

## §3. Sources read

Thirteen frozen artifacts are read; each is recorded in
`experiments/phase110/manifest.json#sourceArtifacts` with its byte length, its raw
sha256, and its **scientific** sha256 (the raw digest of the payload with only
`durationMs`, a wall-clock field the owning phase stamps on every run, removed).

| Phase | Artifact | Scientific sha256 (prefix) |
|---|---|---|
| 99 | `experiments/phase99/logit-mechanism-audit.json` | `35eb66d11614a490` |
| 101 | `experiments/phase101/static-failure-state.json` | `2d80db8a4733beef` |
| 102 | `experiments/phase102/probe-results.json` | `47ee66cfb07bfec3` |
| 102 | `experiments/phase102/static-p0-failure-state.json` | `fe25fd8d1b79b921` |
| 103 | `experiments/phase103/correlation-results.json` | `6c6974ff7f8bf18b` |
| 103 | `experiments/phase103/probe-results.json` | `70b7a430dd453bb6` |
| 104 | `experiments/phase104/correlation-results.json` | `5123beafe3bfa0a3` |
| 105 | `experiments/phase105/correlation-results.json` | `f94383880aad3063` |
| 106 | `experiments/phase106/probe-results.json` | `1d4d41075d092ada` |
| 107 | `experiments/phase107/failure-states.json` | `9e9425b1673b7cff` |
| 107 | `experiments/phase107/intact-states.json` | `1def8c9b7c4bc727` |
| 108 | `experiments/phase108/matching-results.json` | `1397eab4e00a226a` |
| 109 | `experiments/phase109/removal-record.json` | `669422ab8491b0ee` |

The frozen 20-trajectory experiment record is the Phase-102 `pairedBaseToP12` table —
four arms (`A`, `B94`, `C94`, `T`) × five prompts (`the sun rises`,
`machine learning is`, `机器学习是`, `太阳`, `什么是 machine learning`) = 20
trajectories. No trajectory was added, no prompt was invented, no sample was drawn.

The source of the divergence definition is Phase 102's own
`illegalEmissions[cond].p0IllegalDraws`: a P0 step whose emitted token the UTF-8 byte
walk rejects. Phase 110 introduces no new corruption criterion.

---

## §4. Population A — the corrupted trajectories

**Built from:** `experiments/phase99/logit-mechanism-audit.json`.

**Membership rule:** Phase 99's own — a trajectory is corrupted when its recorded
`step` is `>= 0`. Each corrupted trajectory is then joined to its Phase-99 failure
entry by the exact composite key `(armKey, prompt, failureTokenIndex === step)`. A
trajectory whose step is `>= 0` but which has no matching entry is **not** silently
dropped; it is carried with `failure === null`, because that is exactly the
bookkeeping gap under audit.

| Quantity | Value |
|---|---|
| Recorded trajectories | **20** (declared 20) |
| Corrupted under `BASE` | **12** (declared 12) |
| Clean under `BASE` | 8 |
| Corrupted trajectories **without** a failure entry | **0** |
| Phase-99 failure entries orphaned by the join | **0** |
| Corrupted, by fatal phase | `P0` 5, `P1` 2, `P2` 5 |
| Phase-99's own declared histogram | `P0` 5, `P1` 2, `P2` 5 |

The recounted histogram reproduces Phase 99's declared `aggregate.failuresByPhase`
exactly. The answer to question 1 is therefore: **the 12 are corrupted under `BASE`,
and their fatal phases are five at P0, two at P1 and five at P2.**

Every one of the 12 carries a failure entry. Question 3 is answered by the same
table: 12 trajectories, 12 entries, 12 distinct composite keys, no duplicate.

**Case taxonomy (§5).** The phase was required not to assume
one-corrupted-trajectory-equals-one-failure-state. The enumeration settles it as
**Case A — exactly one failure state per corrupted trajectory**: 12 trajectories,
12 entries, 12 distinct keys, and no trajectory appears twice. There is no
one-to-zero case (0 unpaired), no one-to-many case (no duplicate keys), and no
duplicates.

---

## §5. Population B — the recorded failure states

**Built from:** `experiments/phase102/probe-results.json#p0FailureStates.fromP12` —
Phase 102's own list of P0 failure states under the masked condition.

| Quantity | Value |
|---|---|
| Recorded failure states | **11** |
| Distinct trajectories carrying them | **11** |
| Duplicate composite keys | **0** |
| Trajectories carrying more than one state | **0** |
| States outside the recorded 4 × 5 grid | **0** |
| States with a malformed identity field | **0** |

Each state carries six identity fields: `label`, `armKey`, `prompt`,
`failureTokenIndex` (integer `>= 0`), `phase`, and `prefixLength`. The stored
composite key re-derives as `` `${armKey}/${prompt}#${failureTokenIndex}` `` for all
eleven, and the key splits back into its three components without loss.

**Identity corroboration (§9b).**

- *Token index.* Every state's divergent step is its trajectory's recorded
  first-invalid step under `P12-MASK`, and its recorded phase agrees with the phase
  the paired table records for that step. This is a comparison between Phase 102's
  state list and Phase 102's paired table — two blocks written by separate code paths.
- *Byte index.* Phase 99 and Phase 102 recorded a byte offset and a phase for each
  failure independently. Where a state's composite key appears in **both** — which
  happens exactly for those trajectories whose fatal step did not move under the mask
  — the two records must agree. **5** states are corroborated this way and **0**
  disagree on either the byte offset or the phase. **6** states sit at a step Phase 99
  did not record for that trajectory, because the mask moved the fatal step; they are
  reported as uncorroborated rather than as mismatches. Which five these are is
  derived by key intersection at run time and is not written down in the test.
- *Prompt token count.* A state records both the step it sits at and the length of
  the prefix that produced it; their difference is the prompt's token count, a
  property of the tokenizer and not of the condition. All states sharing a prompt
  agree: `machine learning is` = 13, `机器学习是` = 13, `太阳` = 5,
  `什么是 machine learning` = 19. Four of the five prompts carry failures; the fifth,
  `the sun rises`, carries none under either condition.

---

## §6. Population C — the divergent-decision census

**Built from:** Phase 102's `illegalEmissions` block and its
`metrics[cond].aggregate.corruptionByPhase` block, which were written by separate
code paths in Phase 102. Their agreement here is evidence rather than tautology.

| Condition | P0 steps | Divergent P0 draws | P1/P2 illegal | Other illegal | Corrupted trajectories | First-invalid-at-P0 |
|---|---|---|---|---|---|---|
| `BASE` | 193 | 5 | 7 | 0 | 12 | 5 |
| **`P12-MASK`** | **221** | **11** | **0** | **0** | **11** | **11** |
| `P012-MASK` | 286 | 0 | 0 | 0 | 0 | 0 |

Under the frozen condition the P0 population **closes exactly**:

```
221 P0 steps = 11 divergent + 210 intact      gap 0
```

The intact complement is Phase 107's recorded intact population (210 states). The
partition is exact: no P0 step is left unaccounted, so no divergent P0 decision can
exist at a step index outside the recorded populations. Under `BASE` the partition
also closes (193 = 5 + 188), but the intact complement was never published as its own
artifact, so it is stated as `p0Steps − divergentP0Draws` and reported as a count
rather than gated.

**The counting argument.** Let `D` be the number of divergent P0 draws and `T` the
number of trajectories whose first invalid token is at P0. Every trajectory whose
first invalid token sits at P0 contributes exactly one illegal P0 draw, so `D >= T`
holds structurally. Under `P12-MASK`, `D = T = 11` **and** every illegal draw in the
whole run is at P0 (`P1/P2 illegal = 0`, `other illegal = 0`). Therefore no
trajectory can carry a second divergent P0 decision, and the corrupted trajectories
and the divergent P0 decisions stand in exact bijection. This is the fact that lets a
12-versus-11 trajectory question be settled by an 11-versus-11 state question.

---

## §7. The exact join

**Join key:** `` `${armKey}/${prompt}#${failureTokenIndex}` `` — the conjunction of
three independently recorded fields, the same composite key Phases 102–109 already
use. There is no fuzzy matching, no prompt normalisation, no prefix comparison, no
case folding, no step tolerance.

The divergent decisions' **identities** are not copied from the state list. Phase 102
recorded how many P0 steps diverged, not which ones by name; their names are recovered
from a different block of the same artifact — `pairedBaseToP12`, which records each
trajectory's first invalid token index and the phase of that step under the masked
condition. A trajectory diverges at P0 exactly when it is corrupted under
`P12-MASK` **and** its fatal step's phase is `P0`. The two sets are then joined. That
is what makes the join falsifiable: if the state list ever named a step the paired
table does not place at P0, the two sets disagree and H110 is refuted.

| Join outcome | Count |
|---|---|
| Matched | **11** |
| Divergent decisions with no state | **0** |
| States with no divergent decision | **0** |
| Composite keys claimed by more than one state | **0** |

Every matched pair's decision key is the state's own key. The suite additionally
proves the detectors are not vacuous: an injected extra decision is reported
unmatched, an injected stranger state is reported orphaned, and an injected duplicate
key is reported duplicated. It also proves there is no fuzzy matching — a case
change, a trailing space, a prefix truncation and a step shift all fail to match, for
all eleven keys.

Because the key is a conjunction of three fields, matching it is matching the
trajectory, the prompt **and** the token index at once: no state was broadened, no
unmatched state was renamed into an existing one, and nothing was added to the
11-state set.

---

## §8. The historical 12 → 11 transformation

This is the section the phase exists for, and the answer is not "a collapse".

Phase 99 recorded **12 corrupted trajectories under `BASE`** (P2 = 5, P0 = 5,
P1 = 2). This is confirmed four ways in the same artifact:
`preCorruption.trajectoriesWithCorruption = 12`, the 12 rows of
`firstInvalidStepByTrajectory` with `step >= 0`, the 12 entries in `failures`, and
`illegalEmissions.BASE` (5 P0 + 7 P1/P2 = 12).

The **11** is the **`P12-MASK` P0 corruption count**, measured in Phase 101 and
pre-registered into Phase 102 as
`preRegistered.phase101P0CorruptionCount = 11`, then restated by Phase 103 as
`PHASE102_FROZEN.{p12Corruption, p12P0Corruption, p0FailuresUnderP12} = 11` — all
three kept **separate** from `baseCorruption: 12` in the same frozen block.

The two conditions differ in **both** directions. From Phase 102's `pairedBaseToP12`:

```
12 − 2 healed + 1 newly corrupted = 11
```

- **Healed by the `P12` mask (2):** `A/什么是 machine learning`, `T/机器学习是`.
  Corrupted under `BASE`, clean under `P12-MASK`. Neither carries any masked
  divergence.
- **Newly corrupted by the `P12` mask (1):** `B94/太阳`. Clean under `BASE`,
  corrupted under `P12-MASK`. It carries no `BASE` divergence.
- **Corrupted under both (10):** the remainder.

So the 11 is **not** a subset of the 12: one of its members was not in the 12 at all,
and two of the 12 are not in it. The two sets are the corrupted-trajectory
populations of two different decoding conditions, and the arithmetic above reproduces
from the recorded statuses rather than being asserted.

The trajectories counted by the 12 and not the 11 — and the reverse — are **derived
at run time** by the audit and by the contract suite. Neither the audit nor the test
names which one is "the 12th"; the difference is computed from the paired table and
cross-checked against the recorded reconciliation rows.

---

## §9. Trajectory reconciliation table

`experiments/phase110/trajectory-reconciliation.json` carries the full 20-row table,
one row per recorded trajectory, driven by the paired table so that clean trajectories
appear alongside corrupted ones. Each row records: `armKey`, `prompt`, `trajectory`,
`corruptedUnderBase`, `corruptedUnderH110Condition`, `failureStateCount`,
`failureStateIds`, `firstDivergenceTokenIndex`, `firstDivergencePhase`, `mapped`,
`multipleStates`.

| Totals | Value |
|---|---|
| Rows | 20 |
| Corrupted under `BASE` | 12 |
| Corrupted under `P12-MASK` | 11 |
| Corrupted under both | 10 |
| Corrupted under neither | 7 |
| Healed by the condition | 2 |
| Newly corrupted by the condition | 1 |
| Reconciled | 12 − 2 + 1 = **11** |

Every row's `failureStateCount` equals the length of its `failureStateIds`; every
recorded failure state sits on exactly one row; and every row's divergence index
equals the paired table's masked first-invalid token index for that trajectory. No
"12th trajectory" is left implicit: all twenty rows are present, and the eight clean
ones are listed as clean rather than omitted.

---

## §10. State reconciliation table

`experiments/phase110/state-join.json` carries the 11-row state table: each recorded
state, its six identity fields, the divergent decision it maps to, and the join
verdict.

| Label | Arm | Prompt | Token index | Phase | Prefix | Join |
|---|---|---|---|---|---|---|
| `A/machine learning is#15` | A | `machine learning is` | 15 | P0 | 28 | matched |
| `A/机器学习是#11` | A | `机器学习是` | 11 | P0 | 24 | matched |
| `B94/太阳#15` | B94 | `太阳` | 15 | P0 | 20 | matched |
| `B94/机器学习是#2` | B94 | `机器学习是` | 2 | P0 | 15 | matched |
| `B94/什么是 machine learning#3` | B94 | `什么是 machine learning` | 3 | P0 | 22 | matched |
| `C94/太阳#11` | C94 | `太阳` | 11 | P0 | 16 | matched |
| `C94/机器学习是#8` | C94 | `机器学习是` | 8 | P0 | 21 | matched |
| `C94/什么是 machine learning#3` | C94 | `什么是 machine learning` | 3 | P0 | 22 | matched |
| `T/machine learning is#11` | T | `machine learning is` | 11 | P0 | 24 | matched |
| `T/太阳#15` | T | `太阳` | 15 | P0 | 20 | matched |
| `T/什么是 machine learning#12` | T | `什么是 machine learning` | 12 | P0 | 31 | matched |

The population is not evenly spread: no arm carries exactly one state per prompt.
Arm `A` contributes 2 states, `B94` and `T` 3 each, `C94` 3, and the prompt
`the sun rises` carries none in any arm. Arm `A` has no state on `太阳` and arm `T`
has none on `机器学习是` — both are real readings of the frozen checkpoints, not gaps
in the record, since the enumeration is driven by the paired table and not by a
matrix that assumes every cell is occupied.

Every row carries a real divergence behind it, and the census close in the same
artifact proves the converse — that every divergence was recorded. Both are required
for H110, so both are reported.

---

## §11. The historical construction of the 12 and the 11

The phase was required to identify the exact Phase-99 → Phase-101 transformation
from the artifacts rather than from prose. Here it is.

1. **Phase 99** ran the four frozen checkpoints on the five prompts under `BASE`,
   found **12 corrupted trajectories**, and recorded a failure entry for each — five
   at P0, two at P1, five at P2.
2. **Phase 101** introduced the UTF-8 phase masks and re-ran the same 20 trajectories
   under `P12-MASK`. Its static artifact audits **all 12** `BASE` states
   (`gate.auditedStateCount = 12`, `states.length = 12`, 7 mid-sequence + 5 at P0).
   **Phase 101 did not perform the 12 → 11 reduction.** It measured a new number
   alongside the old one.
3. **Phase 102** pre-registered `phase101P0CorruptionCount = 11` before running, then
   reproduced it. It recorded both numbers side by side and never conflated them.
4. **Phase 103** restated the frozen Phase-102 evidence with `baseCorruption: 12` and
   `p12Corruption: 11` in the **same block**, and recorded the Phase-102 artifact's
   scientific digest. That restatement is independent evidence: written by a different
   phase, at a different time, from the same source file. Phase 110 re-measures that
   digest and requires it to match.

The transformation is thus: **`BASE`'s 12 corrupted trajectories became `P12-MASK`'s
11, by healing two and newly corrupting one.** The number 11 that the mechanism work
from Phase 102 onward used is a *state count under a different decoding condition*,
never a truncated version of the 12.

**One adjacent discrepancy, reported rather than reconciled.** Phase 101's own
`gate` block carries a `countDiscrepancyNote`: its brief said "5 Phase-99 mid-sequence
illegal-argmax failure states" and the artifact contains 4. That note concerns the
`P1`/`P2` mid-sequence sub-population and has no bearing on the `P0` population this
phase audits — Phase 101 recorded 7 mid-sequence states, matching Phase 99's
`P1` + `P2` = 2 + 5 = 7. It is noted here because §12 requires discrepancies between
prior phases to be reported rather than silently resolved.

---

## §12. Definition consistency across the prior phases

Phase 110 reuses only definitions already established, and introduces none.

| Definition | Authoritative source used | New in Phase 110? |
|---|---|---|
| Corruption / divergence | Phase 102 `illegalEmissions[cond].p0IllegalDraws` — a P0 step whose emitted token the byte walk rejects | **No** |
| P0 / P1 / P2 / PX phases | Phase 102's UTF-8 byte-phase walker | **No** |
| Continuation-start class | Phase 102 `p0Census.startsWithContinuationByteCount` | **No** |
| Prompt identity | The frozen five-prompt set of the Phase-96 family | **No** |
| Failure-state identity | The composite key `` `${armKey}/${prompt}#${failureTokenIndex}` `` | **No** |
| Trajectory corruption | Phase 99's rule: recorded `step >= 0` | **No** |
| Vocabulary census | Phase 102 `planP0Legality` (300 / 223 / 77 / 64 / 13) | **No** |

No new UTF-8 criterion, no new continuation rule, no new prompt matching and no new
failure threshold was introduced. The tokenizer census is not restated from prose
either: the suite reads Phase 102's recorded census and checks it against itself — 300
vocabulary, 223 legal at P0, 77 illegal, 64 continuation-start, 13 forbidden-lead,
`p0CandidateCount = 223`, `p0CandidateSetMatchesPhaseLegalIdsOf` true,
`phaseLegalCountAtBoundary = 223`, legal and illegal id arrays of the recorded lengths,
zero first-byte-test disagreements and zero empty-byte entries. The vocabulary is
deliberately **not** rebuilt, for the reason recorded in §15. Where two prior phases
could have differed, the discrepancy found is the Phase-101 mid-sequence one recorded
in §11; no other discrepancy was found.

---

## §13. Cross-check against the Phase-101/102/103 mask results

This is a consistency check only. **No mask was re-run**; Phase 110 reads what the
prior phases recorded and asks whether the independent records agree.

- Phase 102's `illegalEmissions["P12-MASK"].p0IllegalDraws = 11` agrees with its
  `metrics["P12-MASK"].aggregate.corruptionByPhase.P0 = 11`
  (`corruptionCount = 11`) — two separate code paths, one number.
- Phase 102's pre-registered `phase101P0CorruptionCount = 11` agrees with the measured
  value.
- Phase 103's frozen restatement of `p12Corruption`, `p12P0Corruption` and
  `p0FailuresUnderP12` is 11 in all three fields, agreeing with this audit's measured
  `P12-MASK` corrupted-trajectory count of 11.
- Phase 107's intact population (210) closes the P0 partition against Phase 102's
  divergent census (11 out of 221) with gap 0.
- Phase 101's static artifact audits 12 states under `BASE`, consistent with Phase 99's
  12 and inconsistent with any reading in which Phase 101 reduced the population.
- The `P012-MASK` condition, in which P0 is masked too, has 0 divergent P0 draws and 0
  corrupted trajectories — consistent with a mask that removes the P0 failure mode
  entirely. It is reported for completeness and not used in the decision.

**Identity stability across the downstream phases.** The recorded label sets were
compared with Population B under a **declared** mode per phase, so a phase that
silently lost a label cannot pass by being relabelled a subset:

| Phase | Source | Mode | Labels | Result |
|---|---|---|---|---|
| 103 | `correlation-results.json#target.perState` | identical | 11 | no label missing, none extra |
| 104 | `correlation-results.json#target.perState` | identical | 11 | no label missing, none extra |
| 105 | `correlation-results.json#failurePopulation.perState` | identical | 11 | no label missing, none extra |
| 106 | `probe-results.json#targetStates` | identical | 11 | no label missing, none extra |
| 107 | `failure-states.json#states` | identical | 11 | no label missing, none extra |
| 108 | `matching-results.json#exactMatchPerFailure` | subset | 10 | proper subset |
| 109 | `removal-record.json#removed + remainingLabels` | subset | 10 | proper subset |

Phases 103–107 carried the whole population; Phase 108 recorded only the states its
stratum matched, and Phase 109 only the survivors after its pre-registered single
removal. Phase 109's removed state (`T/machine learning is#11`) is inside Population B
and its nine survivors are a subset of it, so the removal ran on the same 11-state
population this audit characterises.

---

## §14. Scope limits

Phase 110 is an enumeration and consistency audit. It does **not**:

- calculate any new correlation;
- train or apply any classifier;
- construct any new S0 margin;
- build any projection, spectrum or embedding;
- run any statistical significance test, permutation null or threshold tuning;
- rerun any decoding mask, load any model, or generate any token;
- tune any Phase-95 threshold or evaluator;
- introduce any new scoring function.

Its only outputs are the counts, the identities, the join, the derived
transformation, the falsifier evaluation, the coherence invariants and the decision.

---

## §15. Falsifier, decision and integrity

### Falsifier

Every clause was fixed before enumeration. Each is reported with its observed value
whether or not it fired, so a clear clause is visible as a measurement rather than as
silence.

| Clause | Observed | Fired |
|---|---|---|
| A divergent P0 decision exists at a step index absent from the recorded failure set | gap `0` | no |
| More divergent P0 decisions than recorded states (one trajectory carries two) | `11 − 11 = 0`, bijection `true` | no |
| A divergent decision's identity is absent from the 11-state population | `0` unmatched | no |
| A recorded failure state has no divergent decision behind it | `0` orphaned | no |
| Two recorded states share one identity | `0` duplicate keys | no |
| A divergent decision sits on a prompt outside the five recorded prompts | `0` | no |

**The falsifier did not fire.**

### Decision

**A — PASS — failure population complete.**

> Every divergent P0 decision in the frozen 20 trajectories maps exactly to one of
> the 11 recorded failure states. The 12-versus-11 discrepancy is a trajectory/state
> counting distinction between two decoding conditions, not a missing failure state.

The pre-registered precedence was respected: D (a prior artifact or invariant failure)
was checked first and did not apply; C (the artifacts cannot express the population)
did not apply; B (a fired falsifier clause) did not apply; A is the residue.

### Coherence invariants

All **23** named coherence invariants held, with zero blocking conditions:

- Phase 99 declares 20 trajectories and 12 corrupted; the enumerated and paired-table
  counts agree.
- Every corrupted trajectory carries a failure entry; none is unpaired; none is
  orphaned; the recounted phase histogram reproduces Phase 99's declared one.
- Phase 102 declares 11 P0 failure states under `P12-MASK`; the 11 are distinct
  identities over 11 distinct trajectories; no trajectory carries two.
- One divergent P0 draw per corrupted trajectory; the P0 population closes exactly.
- Three independent paths — the paired table, the illegal-emission census, and the
  first-invalid-at-P0 metrics — count 11, 11, 11, and the recorded state list holds 11.
- The paired table spans exactly 4 arms × 5 prompts = 20 trajectories; every recorded
  state sits on a prompt and arm inside that grid.
- Phase 107's failure population is the 11-state set and its intact population is the
  legal P0 complement (210).
- Phase 103's label set is identical to Population B; every downstream label set is
  consistent with Population B under its declared mode.
- The 12 → 11 difference reconciles arithmetically; Phase 102 pre-registered the 11 it
  measured; Phase 103 inherits the 12 and the 11 as separate numbers.
- Every state implies a consistent, positive prompt token count; every corroborated
  state agrees with Phase 99 on its byte-index phase.
- Phase 103 recorded the Phase-102 artifact digest, and it matches.

### Reproducibility

The audit's deterministic core was run **twice inside the same process** — identical
canonical digests (`ad00895b425821d20bb14259530997d404af4aa4f4a0957a13025fd7a8430b8d`) —
and the probe was then run **twice in independent processes**. All four artifacts are
**byte-identical** across the two runs:

| Artifact | Raw sha256 |
|---|---|
| `probe-results.json` | `acc78927b8db6567b1237e9e9bc1f2ac183c8dd7cf6bf0e1b6a9382464aa221b` |
| `trajectory-reconciliation.json` | `13722231baad33afd561ead37ccaaddd408f6bb3658b3389e9d3c3eda473a629` |
| `state-join.json` | `9f75a81d77a9de4cb8843faafb26b4e171b286350bd8da2eda679af6124c48f7` |
| `manifest.json` | `b1a18414cf13a2fa26c19ae630db6bfdba3f69f79a104cae259b4856e00cc3b3` |

No volatile field is written, so the raw digest itself is the reproducible identity of
the evidence; the manifest records `volatileFieldsWritten: []`. Every scientific field
— the 20-trajectory set, the 12 count, the 11 set, the join, the reconciliation and the
H110 classification — was identical across both runs. Nothing changed, so nothing
needed diagnosing.

**One qualification, measured rather than assumed.** The three *scientific* artifacts
above carry only Phase-110 data, so their raw digests are stable unconditionally. The
manifest is different in kind: it also embeds each source artifact's **raw** digest, and
one source — `experiments/phase99/logit-mechanism-audit.json` — is `rawDigestReproducible:
false` because its own writer re-stamps a `durationMs` wall-clock counter whenever the
module owning the MiniMind tokenizer is imported. Any later import of that module chain
(including a pass of the aggregate Phase 57-110 runner, which reaches it through the
Phase-102 suite) therefore changes that file's raw bytes and, with them, the manifest's
raw digest — while the manifest's *scientific* digest is unaffected. So:

| Identity | Value | Stable across |
|---|---|---|
| `manifest.json` raw sha256 | `b1a18414cf13a2fa26c19ae630db6bfdba3f69f79a104cae259b4856e00cc3b3` | consecutive Phase-110 probe runs |
| `manifest.json` scientific sha256 (excluding `durationMs`) | `6114ed28449bdb8308a75520b0e7b800f1c9ee794ae51419a16e37c0f54085c0` | every re-run and every unrelated import |

Both numbers above are the ones measured *after* the aggregate run described in §15's
integrity note, so the recorded manifest is consistent with the repository as it stands
at the end of this phase. The manifest's own raw digest is the weaker of the two
identities and is quoted only alongside its scientific digest; a reader comparing a
future copy of the manifest against this report should compare the scientific value,
because a later tokenizer rebuild will move the raw one without touching a single
scientific field. This is a property of the repository that Phase 110 inherits, not a
defect introduced by it, and the manifest labels the source entry
`rawDigestReproducible: false` with the reason attached — which is exactly what lets a
reader tell the two identities apart.

### Prior-artifact integrity

Phase 103 recorded the Phase-102 probe artifact's scientific digest as
`47ee66cfb07bfec3dbb2ae7f0af78f3fbfe1713cff52d32b5709d5934451b20d`. Phase 110
re-measures it and finds the same value. All thirteen source artifacts still digest to
the scientific sha256 values recorded in `manifest.json#sourceArtifacts` — re-verified
by an out-of-process read-only re-digest of all thirteen files, **13 of 13 exact, 0
scientific drift**. No prior-phase artifact was modified by this phase.

The same read-only re-digest also finds **13 of 13 raw digests** matching
`manifest.json#sourceArtifacts` as it stands at the end of the phase — the manifest was
rewritten by a final probe pass *after* the aggregate run, so the recorded source raw
digests are the current bytes rather than a pre-run snapshot.

The one file that had moved in between, and the reason the manifest needed that final
pass, is `experiments/phase99/logit-mechanism-audit.json`: its raw sha256 had changed
from `b7f42a49…` to `0abf5480…` with the byte length unchanged at 213306, i.e. a
`durationMs`-only change — the field its manifest entry already declares
`rawDigestReproducible: false`. The movers were the aggregate Phase 57-110 runner and
the Phase-102 suite it contains, whose import chain rebuilds the MiniMind vocabulary and
so re-stamps that counter. Phase 110's own probe and contract suite no longer import
that chain, which is why the `probe → suite → probe` footprint stays byte-identical.
The Phase-99 *scientific* digest was never affected: `35eb66d11614a490…` before and
after.

**One integrity observation, found by auditing Phase 110's own footprint.** An early
draft of the contract suite rebuilt the vocabulary through Phase 102's
`buildTokenizer` / `classifyVocabulary` / `planP0Legality` to re-derive the P0 census,
following the Phase-109 precedent. That import chain has a side effect: importing the
module that owns the tokenizer **re-stamps the `durationMs` wall-clock counter in
`experiments/phase99/logit-mechanism-audit.json`**, so that file's raw sha256 changes on
every such import while its scientific digest — the one that excludes `durationMs` —
stays fixed at `35eb66d11614a490…`. The suite therefore rewrote a prior-phase artifact's
bytes, which §2 forbids even when the changed field is one the owning phase treats as
volatile. The rebuild was removed and replaced with a read-back of Phase 102's own
recorded census plus its internal consistency checks
(`p0CandidateSetMatchesPhaseLegalIdsOf`, the legal/illegal/continuation id arrays, the
zero first-byte-test disagreements and the zero empty-byte entries). It is verified that
running the Phase-110 probe, then the Phase-110 suite, then the probe again now leaves
`manifest.json` byte-identical — the suite no longer has any write side effect on a
prior phase. This is reported because it is a property of the repository that any future
phase re-deriving the tokenizer should know: **rebuilding the MiniMind vocabulary
rewrites the Phase-99 artifact's raw bytes.** The scientific evidence is unaffected
either way, and the manifest labels that artifact `rawDigestReproducible: false` with the
reason.

### Validation

| Check | Command | Result |
|---|---|---|
| Phase-110 focused suite | `npx --yes tsx experiments/phase110/run-phase110-suite.ts` | `passed=79 failed=0 skipped=0`, exit 0 |
| Phase-109 focused suite | Phase-109 focused runner | `passed=75 failed=0 skipped=0` |
| Phase-108 focused suite | Phase-108 focused runner | `passed=68 failed=0 skipped=0` |
| Aggregate research suite | `npx --yes tsx src/lib/minimind/research/__tests__/run.ts` | `TOTAL: 2597 passed, 0 failed`, exit 0 |
| Type check | `npx tsc --noEmit` | 64 errors, **0 in `experiments/phase110` or the new test file**; the error-file set is identical to `experiments/phase109/typecheck.log` |
| Production build | `npm run build` | exit 0; **0 warnings attributable to Phase 110** (the build reports 178 pre-existing warnings, none in a file this phase touched) |

**Run ordering, stated plainly.** The aggregate suite ran before the final probe pass,
because that suite's own import chain re-stamps the Phase-99 counter described above and
would have left the manifest describing bytes that no longer existed on disk. The
sequence was therefore: aggregate suite → final probe pass (manifest now consistent with
disk) → focused Phase-110 suite re-run against those final artifacts, which is the
79/0/0 result in the table. Its Phase-110 assertions are a superset of the ones the
aggregate runner executes for this phase, and re-running it left `manifest.json`
byte-identical, so the later ordering does not weaken the aggregate result — it only
explains which copy of the manifest is the current one.
