# Phase 111 — Grid-External Failure Closure Audit

**Hypothesis (H111).** The P0 failure population, first described on a frozen five-prompt grid
(`experiments/phase98`, `experiments/phase101`, `experiments/phase102`, `experiments/phase110`),
CLOSES when the prompts move off that grid: under the frozen `P12-MASK` condition and the recorded
generation settings, every divergent P0 decision produced by prompts outside the original grid
falls inside the already observed byte-phase / mechanism class.

**Verdict: `A` — grid-external closure supported over the finite Phase-111 grid.**

29 comparable divergent P0 decisions were observed on the 48-trajectory external grid; all 29
carry a mechanism label inside the frozen family `{boundary-state-continuation, sampling-draw}`.
F2 did not fire; F3 did not fire; F1 was zero (a consistency check, not closure evidence).

**Training: NOT RUN.** Generation-only, read-only audit: zero training, zero optimizer, zero
checkpoint write, zero tokenizer / vocabulary / merge-table change, zero architecture change, zero
generator-setting change, zero evaluator change, zero decoder change, zero mask-semantics change.
Four frozen checkpoints were loaded and forward passes were run; no model file was written back.

The result is a finite-sample result. It is **not** a proof of universal closure — see §14 and §15.

---

## 1. Phase-110 final validation

Phase 110 closed the 12-vs-11 opening-token discrepancy by partition: `221 = 11 + 210`, gap 0, with
the BASE vs P12-MASK comparison `12 − 2 + 1 = 11`. Phase 110's own suite is unchanged at
`79 passed, 0 failed, 0 skipped` (re-run this phase, gate G2), and the aggregate research runner is
unchanged at `TOTAL: 2597 passed, 0 failed` (gate G3). The aggregate runner was executed **before**
the final probe pass, per plan §12.5, so the source digests recorded in `manifest.json` describe the
bytes on disk at the end of the phase.

Phase 110's partition definition is the one Phase 111 reuses verbatim:

```
accountedSteps = divergentP0Draws + intactP0Steps
gap            = p0Steps − accountedSteps
exact          = p0Steps === accountedSteps
```

No new partition metric was invented, no nonzero gap was "repaired", and no population was
redefined to force `gap = 0`.

## 2. H111 research question

Does a divergent P0 decision — the frozen definition `phase === "P0" && selectedLegal === false` —
observed under prompts that never appeared in the frozen grid, ever carry a mechanism label outside
the family derived from the 11 baseline states?

- If **no**, and the comparable divergent population is nonempty, the failure population is
  *supported as closed over the finite Phase-111 grid* (`A`).
- If **yes**, at least one genuinely new failure mode exists off-grid (`B`).
- If the comparable divergent population is **empty**, the result is `INCONCLUSIVE` (`C`), never
  closure evidence.
- If any frozen-condition or integrity check fails, the phase is `BLOCKED` (`D`).

## 3. Pre-registered protocol

Frozen during design, before any Phase-111 measurement. Restated in `manifest.json` under
`preRegisteredParity`:

| Item | Value |
|---|---|
| Condition | `P12-MASK` |
| Arms | `A`, `B94`, `C94`, `T` |
| Recipe | `SEED=42`, `VOCAB_TARGET=300`, `MAX_TOKENS=24`, `MAX_CTX=128`, `TEMPERATURE=0.8`, `EOS_TOKEN_ID=3` |
| RNG | one `createSeededRNG(42)` stream per arm, consumed across the 12 manifest prompts in manifest order, exactly one draw per sampling step |
| Divergence | `phase === "P0" && selectedLegal === false` (Phase-102 `illegalEmissions[cond].p0IllegalDraws`, reused verbatim) |
| Mechanism domain | `sampling-draw`, `under-ranked-legal`, `boundary-state-continuation`, `midstate-new-lead`, `illegal-argmax-other` |
| Frozen family | `{boundary-state-continuation ×7, sampling-draw ×4}` derived from the 11 baseline states |
| Mass tolerance | `1e-9` |
| F1 | frozen-condition consistency check; nonzero `p1p2IllegalDraws` or `otherIllegalDraws` ⇒ `D`; **never** `B` |
| F2 | a comparable divergent P0 decision whose label is outside the frozen family ⇒ `B` |
| F3 | a nonzero partition gap ⇒ `B` |
| Zero-divergence | `0` comparable divergent P0 decisions ⇒ `INCONCLUSIVE — no comparable failure observed` |

Nothing above was changed after the first model output was seen. The prompt set was frozen and
hashed before any checkpoint was loaded (§4).

## 4. Prompt manifest

`prompt-set.json` was written and hashed **before any model was loaded**.

- `prompt-set.json` raw sha256: `4ce6c939c68a82c0759fbda5b30c9a6e484e852d5a456167613ad75a53f8b33c`
- `manifest.json` raw sha256: `e3573bb0a038e0e0b3a76372af27a7a02227e2a27fd0c14fee7c0b6e10954706`
- `manifest.json.promptSetSha256` == `probe-results.json.promptSetSha256` == the on-disk digest.

Selection was computed at runtime from `src/data/minimind/datasets/bilingual.json`
(`metadata.id === "bilingual"`, `version === "0.3.0"`, `schemaVersion === 1`), not hardcoded: the
five frozen prompts are excluded by a runtime substring scan over each sample's full `text`,
original dataset order is preserved, and the first four eligible samples per language class are
taken. Manifest order is `en ×4 → zh ×4 → mixed ×4`:

| # | id | class | split | tokens |
|---|---|---|---|---|
| 0 | `en-general-02` | en | train | 31 |
| 1 | `en-general-03` | en | train | 37 |
| 2 | `en-general-04` | en | train | 32 |
| 3 | `en-general-05` | en | train | 33 |
| 4 | `zh-general-02` | zh | train | 28 |
| 5 | `zh-general-03` | zh | train | 31 |
| 6 | `zh-general-04` | zh | train | 34 |
| 7 | `zh-general-05` | zh | train | 38 |
| 8 | `mixed-tech-02` | mixed | train | 35 |
| 9 | `mixed-tech-03` | mixed | train | 45 |
| 10 | `mixed-tech-04` | mixed | train | 31 |
| 11 | `mixed-tech-05` | mixed | train | 32 |

All four selected samples per class are `train`-split, so the dataset's absent split filter is
mechanically redundant rather than load-bearing. Prompt text is the sample's full `text`; no
truncation, no hand selection, no length shaping, no post-generation replacement.

### 4a. The exclusion-set discrepancy is recorded, not normalised

The rule as written — drop any sample whose `text` contains any of the five frozen prompts as a
substring — removes **5** samples:

| datasetIndex | id | language | offending frozen prompt |
|---|---|---|---|
| 0 | `en-general-01` | en | `the sun rises` |
| 200 | `zh-general-01` | zh | `太阳` |
| 298 | `zh-sci-11` | zh | `太阳` |
| 324 | `zh-fact-01` | zh | `太阳` |
| 400 | `mixed-tech-01` | mixed | `什么是 machine learning` |

The spec's §3 parenthetical names **4** of them. `zh-fact-01` is the extra sample. It sits at
dataset index 324, beyond the first four eligible zh samples, so **both readings resolve to the
same 12 prompts** — `resolvedSelectionUnchanged` is re-derived by building both selections, not
asserted from prose. The rule is implemented because it is the operative deterministic instruction;
the discrepancy is recorded in `prompt-set.json.exclusionDiscrepancy` and asserted by the suite
(item 3) rather than smoothed away.

### 4b. Measured token lengths — a pre-registration discrepancy

The spec §3a pre-registered the original prompts at 5–19 tokens and the external set at 13–30
tokens. Measured with the frozen tokenizer:

| Set | Measured | Pre-registered | Within pre-registered range |
|---|---|---|---|
| Original (5 frozen prompts) | 5 – 19 | 5 – 19 | **yes** |
| External (12 prompts) | **28 – 45** | 13 – 30 | **no** |

The external prompts are substantially **longer** than pre-registered, not shorter. Per plan §4.5
this is reported as a measured discrepancy and was **not** used to re-select prompts; the spec
records the same rule ("a limitation recorded before measurement, not a reason to change the
selection protocol"). The direction matters for the §3a argument: §3a worried that a longer prefix
might suppress divergence, and the measured prefixes are longer still, so the pre-registered
concern is *strengthened* by the measurement, not weakened. In the event divergence was not
suppressed (29 comparable divergent P0 decisions), but the length caveat in §14 stands on the
measured range.

## 5. Frozen-condition parity gate

All eight requirements passed before a single new prompt was generated. Failure of any one would
have halted the phase with `BLOCKED — frozen-condition parity not established` and **no** external
generation would have occurred.

| # | Requirement | Observed |
|---|---|---|
| P1 | `generatedIds` byte-identical for all 20 trajectories | 20/20 identical |
| P2 | `p0IllegalDraws === 11` and `corruptedTrajectories === 11` | 11, 11 |
| P3 | the 11 state labels reproduced as an exact set with matching `failureTokenIndex` | recorded 11, derived 11, missing 0, extra 0, index mismatches 0 |
| P4 | `p0Steps − divergentP0 − intactP0 === 0` | `221 = 11 + 210`, gap 0; bijection true; independent byte-stream re-derivation also 221 |
| P5 | `phaseLegalIdsOf(vocab, BOUNDARY_STATE)` set-identical to the per-byte walk, both agreeing with the production scanner | set 223, per-byte 223, scanner disagreements 0 |
| P6 | `compatibleMass` at P0 equals Phase-102's recorded `legalMass` within `1e-9` | 11/11 within tolerance |
| P7 | derived family `{bsc ×7, sd ×4}`; copied classifier reproduces all five Phase-101-recorded P0 labels | counts `{"boundary-state-continuation":7,"sampling-draw":4}`; P0 labels 5/5 |
| P8 | P1/P2 illegal = 0 and other illegal = 0 | 0 / 0 |

Supporting identities, all recomputed and all matching:

- **Checkpoints** (computed == `phase102/armResults[].checkpointSha256`): A
  `dff07a83…cbc5e`, B94 `c9f9d52d…e9dfcd`, C94 `62557157…a5e95`, T `5ebe2ab3…0cb061`.
- **Tokenizer** (measured == Phase 102's recorded P0 census): vocabulary 300, legal at P0 223,
  illegal 77, continuation-start 64, forbidden-lead 13. The continuation-start population is the
  one the decoder used.
- **Recipe** equals `phase102.recipe` on all six constants.
- **Parity core digest** (canonical, over all 20 trajectories' ids, per-step divergence flags,
  phases and labels): `415040e9…00d6113`, identical for the two in-process runs.

### 5a. Disclosed limitation of the Phase-101 fixture

P7's Phase-101 comparison joins `experiments/phase101/static-failure-state.json#states[]` to
`experiments/phase99/logit-mechanism-audit.json#failures[].distribution.byteClassMass` by the exact
composite key `${armKey}/${prompt}#${failureTokenIndex}`. Phase 101's static artifact does not
record `byteClassMass` or `argmaxCompatible`, so the recorded label is read from Phase 101 and the
classifier's byte-class term is read from Phase 99 for the identical state; Phase 101's own
`legalMass` / `rawArgmaxLegal` agree with Phase 99's `compatibleMass` / `argmaxCompatible` on all
12 states.

Phase 101's static artifact holds 12 states; 5 are at P0. **All 5 P0 labels are reproduced
exactly**, which is the requirement. The other 7 states (P1/P2) have no Phase-99 byte-class
counterpart under Phase 99's index convention, so the classifier returns its `unknown` sentinel for
them. That coverage limit is recorded as `allTwelveReproduced: false` in `probe-results.json` and
asserted by the suite, and it is **not** a parity failure: §5.4's requirement is the five
Phase-101-recorded **P0** labels. An absent measurement was reported as absent, never read as
either agreement or disagreement.

## 6. Generation grid

48 trajectories (12 prompts × 4 arms × 24 tokens) were generated, and every one ran the full
24-token horizon: 0 EOS emissions, 0 empty-mask terminations, 0 context-truncation events. 1152
steps total.

| Arm | Trajectories | Corrupted | Divergent P0 draws |
|---|---|---|---|
| A | 12 | 8 | 8 |
| B94 | 12 | 8 | 8 |
| C94 | 12 | 7 | 7 |
| T | 12 | 6 | 6 |
| **total** | **48** | **29** | **29** |

| Class | Trajectories | Divergent | Comparable |
|---|---|---|---|
| en | 16 | 0 | 0 |
| zh | 16 | 14 | 14 |
| mixed | 16 | 15 | 15 |

Per prompt (manifest index → divergent P0 draws): `0:0, 1:0, 2:0, 3:0, 4:4, 5:4, 6:4, 7:2, 8:4,
9:4, 10:3, 11:4`.

The four English prompts produced **no** divergent P0 decision at all. This is an observation about
this sample, not a claim about English prompts in general; §14 and §15 state its scope.

Emitted-byte phase histogram over all 1152 steps: `P0 484, P1 53, P2 60, P3 0, PX 555`. The
PX mass is the post-corruption tail: once a trajectory draws an illegal P0 token the stream is
unrecoverable, the mask is disabled by construction, and the remaining steps are unconstrained.

## 7. Divergent-P0 enumeration

Every P0 decision is recorded in `divergent-p0-decisions.json` with every §6.2 field —
`trajectory`, `prompt`, `class`, `armKey`, `stepIndex`, `tokenIndex`, `byteOffset`, `phaseBefore`,
`needBefore`, `selectedId`, `selectedBytes`, `selectedLegal`,
`selectedStartsWithContinuationByte`, `rawArgmaxId`, `rawArgmaxLegal`, `legalMass`, `illegalMass`,
`continuationStartMass`, `bareContinuationMass`, `multibyteLeadMass`, `argmaxCompatible`,
`compatibleMass`, `maskActive`, `maskIntervened`, `corpusSupportLevel`, `corpusSupportedBestId`,
`corpusSupportedBestCount`, `divergent`, `mechanismLabel`, `partitionMetadata`. The suite asserts
none of them is undefined.

| Quantity | Frozen grid (Phase 110) | External grid (Phase 111) |
|---|---|---|
| P0 steps | 221 | 484 |
| divergent P0 draws | 11 | 29 |
| intact P0 steps | 210 | 455 |
| gap | 0 | 0 |

The divergent subset is mechanically derived from `phase === "P0" && selectedLegal === false` — the
frozen definition, applied once and re-censused by an independent recount in the suite. No second,
"better" divergence definition was computed.

**Comparability.** 29 of 29 divergent decisions are `comparable: true`; `nonComparableReason` is
`null` for all of them. Missing measurements would have been recorded as non-comparable with an
explicit reason and never reinterpreted as success or failure; none were missing.

**Mask state at the 29 decisions.** `needBefore === 0` for all 29, `maskActive === false` for all
29, `maskIntervened === false` for all 29. Every observed off-grid divergence occurs at a
character boundary, where `P12-MASK` is inactive by construction — the same structural fact Phase
102 established for the frozen grid. `P12-MASK` semantics were copied unchanged: the byte candidate
set is unrestricted at P0, the mask is recorded but not applied at P0, applied at P1/P2, disabled
when the stream is unrecoverable, and an empty mask terminates before any RNG draw is consumed.

**`rawArgmax` vs draw.** 32 P0 steps had an illegal raw argmax, but only 29 drew an illegal token,
so the argmax account and the draw account are different quantities and were not conflated.
`p0ContinuationStartDraws === 29` — every divergent draw started with a continuation byte.

## 8. Mechanism-label family and F2

The classifier was copied from Phase 99 without changing its arithmetic, ordering, thresholds or
tie-breaks; the suite proves this by textual comparison of the two function bodies after comment
stripping and whitespace normalisation, and by five behavioural fixtures covering all five domain
labels and both exact boundaries (`compatibleMass === 0.5`, `bareContinuation === 0.5`).

External-grid labels over the 29 comparable divergent decisions:

| Label | Count |
|---|---|
| `boundary-state-continuation` | 25 |
| `sampling-draw` | 4 |
| **outside the frozen family** | **0** |

By arm: A `{bsc 6, sd 2}`, B94 `{bsc 7, sd 1}`, C94 `{bsc 6, sd 1}`, T `{bsc 6, sd 0}`.

**F2 did not fire.** `outsideFamilyCount === 0`, `firstEvent === null`. The first falsifying event
would have been reported deterministically (earliest by trajectory order, then token index) and the
definitions frozen before that observation; nothing was redefined, because nothing fired.

Two structural observations sharpen what F2's silence does and does not mean:

- **`midstate-new-lead` is unreachable at P0 by construction.** The rule order tests
  `phase ∈ {P1,P2,P3}`, so no P0 decision can ever carry that label. A complete sweep of the P0
  input space in the suite confirms it, and P1 reachability is confirmed separately.
- **The reachable non-family labels at P0 are exactly `{under-ranked-legal, illegal-argmax-other,
  unknown}`.** These are the labels that *could* have fired F2 and did not. `unknown` is a
  Phase-111 sentinel only, stays outside the frozen family, and fires F2 if it appears; it did not
  appear. `illegal-argmax-other` is **not** reinterpreted as `unknown`.

## 9. Partition gap and F3

The Phase-110 partition definition was implemented unchanged, and computed along **three separately
computed paths** (plus one independent re-derivation):

- **A** — `p0Steps` summed from each trajectory's own recorded phase histogram (`stepsAtP0`): 484
- **A′** — an independent re-derivation that rebuilds the raw emitted byte stream (prompt bytes +
  generated bytes) and walks the UTF-8 phase directly, reading the phase preceding each recorded
  decision offset, never calling `contextPhaseOf`: 484
- **B** — `divergentP0Draws` from the step-level scan `phase === "P0" && selectedLegal === false`:
  29
- **C** — `intactP0Steps` from the trajectory-level fatal-step table, i.e. `A −
  trajectoriesFirstInvalidAtP0`: 455

```
accountedSteps = 29 + 455 = 484
gap            = 484 − 484 = 0
exact          = true
```

**F3 did not fire.** `observed.partitionGap === 0`, `fired === false`.

The three paths are separately computed; they are **not** statistically independent, and no
independence is claimed. A disagreement between A and A′ — counts that must be identical — would
have been a `D` (an enumeration failure), not a gap; `pathDisagreement === null`.

The bijection check is non-vacuous: 29 divergent draws, 29 trajectories first-invalid-at-P0, 29
total illegal draws, `oneDrawPerCorruptedTrajectory === true`, `unaccountedDraws === 0`. The suite
also confirms the check detects an injected violation (two draws on one trajectory, or a draw
outside P0).

## 10. Byte-phase consistency and F1

`p1p2Steps === 113`, `p1p2IllegalDraws === 0`, `otherIllegalDraws === 0`, `totalIllegalDraws ===
29 === divergentP0Draws`. The mask applied at P1/P2 never admitted an illegal token, and no
illegal token was emitted outside P0.

**F1 did not fire** — and a zero F1 reading is *not* closure evidence. F1 is a frozen-condition
consistency check: a nonzero `p1p2IllegalDraws` or `otherIllegalDraws` would indicate corruption (a
mask that did not apply, a drifted tokenizer, a mis-recorded phase) and would stop the phase as
`D`. F1 cannot produce `B`, and the suite asserts that with a synthetic nonzero reading.

Legality was cross-checked three ways at the vocabulary level: the phase-legal id vector, the
per-byte walk, and Phase 98's production scanner — 223 / 223, 0 disagreements.

## 11. Corpus-support and drift observations

Corpus support was measured for each P0 decision against Phase 98's corpus index. Over the 29
comparable divergent decisions: `sparse 8, indirect 17, exact 4`.

`establishedLabelsAbsent: []` — no label observed on the frozen grid was absent from the external
grid. The set of established mechanisms is preserved, not merely matched in count.

**Literal identity-key reading (spec §1a, diagnostic only).** `literalIdentityKeyNewMembers === 0`:
no divergent P0 decision on the external grid introduced a
`${armKey}/${prompt}#${tokenIndex}` literal identity key that was not already present on the frozen
grid. This is recorded because the spec pre-registered it as a diagnostic; it is **not** the
operative test — the operative test is the mechanism family in §8.

**Drift.** All 13 recorded source artifacts still digest to the values `manifest.json` recorded
(`checkSourceDigests` → `allUnchanged: true`). Generation settings, thresholds, the evaluator, the
decoder and the mask semantics are byte-unchanged: their digests are recorded and re-verified.
Phase 99's **scientific** digest is unchanged before and after the run
(`35eb66d1…f7fd9c6` both times). Phase 99's **raw** digest is not reproducible and is recorded as
such — importing the Phase-99 module chain re-stamps its `durationMs`. Phase 111 reached that chain
through Phase 102 only because the *aggregate* runner does; the Phase-111 probe and suite import
Phase 98 only, which is why the phase-99 mutation is attributed to the aggregate runner and not to
Phase 111.

## 12. Closure classification

Precedence applied, in order: **D → F1 → B → A → C**.

| Clause | Observed | Fired |
|---|---|---|
| D — gate/integrity failure | parity gate passed 8/8; no integrity violation; `pathDisagreement === null` | no |
| F1 — P1/P2 or other illegal draws | `p1p2IllegalDraws 0`, `otherIllegalDraws 0` | no |
| F2 — comparable divergence outside the frozen family | `outsideFamilyCount 0` | no |
| F3 — nonzero partition gap | `partitionGap 0` | no |
| A — closure supported over the finite grid | 29 comparable divergent P0 decisions, all in family | **yes** |
| C — inconclusive | n/a (population nonempty) | no |

> **Zero-divergence rule.** `0 comparable divergent P0 decisions` ⇒ `INCONCLUSIVE — no comparable
> failure observed`. Absence of a new failure in this finite external sample does not establish
> that the failure population is universally complete.

> **Finite-sample scope.** Even an A result only supports closure over the fixed external
> prompt/checkpoint grid used by Phase 111. It does not establish universal closure over arbitrary
> prompts.

**Recorded verdict: `A`.** `precedenceApplied: ["D","F1","B","A"]`. The suite re-derives the
recorded verdict from the recorded falsifier blocks, census and partition, and requires the same
verdict *and* the same reason string.

This report distinguishes **no new divergent event observed** — which is what was measured, on 48
trajectories over 12 prompts — from **the failure population is universally complete**, which
nothing here establishes.

## 13. Reproducibility

- The deterministic core was run **twice in-process**, requiring identical canonical digests:
  `415040e9…00d6113` == `415040e9…00d6113`, `equal: true`.
- The **full probe** was then run twice in two **fresh processes**. All five artifacts were
  byte-identical across the two runs:

| Artifact | sha256 (identical for both runs) |
|---|---|
| `prompt-set.json` | `4ce6c939c68a82c0759fbda5b30c9a6e484e852d5a456167613ad75a53f8b33c` |
| `manifest.json` | `e3573bb0a038e0e0b3a76372af27a7a02227e2a27fd0c14fee7c0b6e10954706` |
| `probe-results.json` | `f3f0f3fcb1697a156e1c4f65fbdf26cb2ca1914058c518603120b047d90d8b86` |
| `trajectory-reconciliation.json` | `7c927f5e77e3a507558a43ac660b5cba2d73451507e81f79b15fef00f961b24d` |
| `divergent-p0-decisions.json` | `68b4d9077bdcbd27b8fb7f5b615c5543e6349b6afeca2781c528221ac3f8aafa` |

No run was repeated until it happened to match, no run was preferred over another, and no run was
averaged: the two runs agreed on the first attempt, and a disagreement would have been reported as
`BLOCKED — reproducibility failure` with the field and both values named.

**Volatile metadata: none.** `volatileFieldsWritten: []` in both `probe-results.json` and
`manifest.json`. No wall-clock field, duration, PID, random UUID, absolute path, machine-specific
metadata or filesystem-enumeration ordering is written; every path is repository-relative and
forward-slashed, every artifact is `JSON.stringify(value, null, 2)` with no trailing newline, and
the suite re-serialises each artifact to confirm it reproduces its own bytes exactly.

The `durationMs` warning in §11 is the one place where a *source* artifact's raw digest is not
reproducible, and it belongs to Phase 99's writer, not to Phase 111's. The scientific digest is the
reproducible identity of that evidence, and it did not move.

## 14. Limitations

1. **Finite external grid.** 12 prompts × 4 arms × 24 tokens. The A verdict is closure support over
   this grid only.
2. **Longer-prompt distribution.** Measured external prompts are 28–45 tokens against a
   pre-registered 13–30, and against the original grid's 5–19. The pre-registration was wrong about
   the external range (§4b); the prompts were not re-selected, because plan §4.5 forbids using the
   measurement as grounds for re-selection. The measured length distribution is the evidence behind
   this limitation.
3. **English prompts produced no divergence.** All 29 divergent decisions came from the zh and
   mixed classes; the four `en` prompts produced none. Read as a property of this sample, not as a
   claim about English prompts generally.
4. **A single condition.** Only `P12-MASK`. No other mask regime was tested.
5. **No universal claim.** Nothing here shows the failure population is complete over arbitrary
   prompts, checkpoints, temperatures, horizons or vocabularies.
6. **The 4-vs-5 exclusion discrepancy.** Recorded, not normalised (§4a). It does not change the
   resolved selection, because the extra sample lies outside the first four eligible zh samples.
7. **Phase-101 fixture coverage.** 5 of Phase 101's 12 recorded static states are at P0 and all 5
   reproduce; the 7 non-P0 states have no Phase-99 byte-class counterpart under Phase 99's index
   convention and derive `unknown` (§5a). Reported, not hidden.
8. **Partition paths are not statistically independent** (§9). They are three separately computed
   paths over the same measurement.

## 15. What is NOT proven

- That the failure population is **complete** across arbitrary prompts, checkpoints, seeds,
  temperatures, horizons or vocabularies.
- That no divergent P0 decision exists **outside** the finite 48-trajectory grid. Only 29 were
  observed; none left the family.
- That the mechanism family `{boundary-state-continuation, sampling-draw}` is **exhaustive**. It is
  the family observed on the frozen grid and not exceeded on the external grid.
- That the four English prompts are structurally incapable of divergence. They produced none here.
- That the pre-registered token-length range was correct. It was not (§4b).
- Any causal claim about *why* divergence did not occur on the English prompts.
- Any claim of statistical independence between the partition paths.
- That closure is **proven universally**. It is not, and this report never claims it.

## 16. Phase-112 recommendation

1. **Do not extend the prompt grid.** Every external observation already carries an in-family
   label; more prompts of the same kind would add sample size without testing a new hypothesis.
   The productive move is to attack the family's *boundary*, not its centre.
2. **Test the structural claim that F2's target is currently unreachable at P0.** Two of the three
   non-family labels reachable at P0 (`under-ranked-legal`, `illegal-argmax-other`) require
   `compatibleMass < 0.5` and `bareContinuation < 0.5` while the raw argmax is illegal. A targeted
   construction that drives the P0 compatible mass below 0.5 — a prompt/checkpoint pairing that
   starves the legal continuation mass — would give F2 a chance to fire, and would be the first
   genuine test of the family boundary rather than another confirmation of it.
3. **Address the length discrepancy at the design level.** If prompt length is a confound, the next
   phase should pre-register the length range it can actually measure (e.g. state it as "the first
   four eligible `train` samples per class, measured as 28–45 tokens under the frozen tokenizer")
   instead of estimating it.
4. **Keep the Phase-99 raw-digest coupling disclosed.** Any future phase that runs the aggregate
   suite must continue to order it before its final probe pass, and must continue to distinguish
   Phase 99's scientific digest from its raw digest.

## 17. Final conclusion

Under the frozen `P12-MASK` condition, on a 12-prompt out-of-grid set frozen and hashed before any
checkpoint was loaded, spanning four arms over 48 trajectories and 1152 generated tokens, Phase 111
observed **29 comparable divergent P0 decisions** and **none** of them carried a mechanism label
outside the frozen family `{boundary-state-continuation, sampling-draw}`. The partition closed at
`484 = 29 + 455` with gap 0; the byte-phase and mask accounts closed; F1 was zero; F2 and F3 did not
fire.

**H111 is classified `A`: grid-external closure is supported over the finite Phase-111 grid.**

That is a finite, single-condition, single-vocabulary, single-horizon observation. It is not a
proof that the failure population is universally complete, and no such proof is claimed.

---

## Integrity

**Sources (13, recorded in `manifest.json.sourceArtifacts` with raw + scientific digests, all
re-verified unchanged after the run):**
`experiments/phase99/logit-mechanism-audit.json`, `experiments/phase101/static-failure-state.json`,
`experiments/phase101/probe-results.json`, `experiments/phase102/probe-results.json`,
`experiments/phase102/static-failure-state.json`, `experiments/phase106/probe-results.json`,
`experiments/phase107/{failure-states,intact-states}.json`,
`experiments/phase108/...`, `experiments/phase109/...`,
`experiments/phase110/{probe-results,manifest,state-join}.json`.

**Import boundary.** `experiments/phase111/grid-external-closure-audit.ts` imports
`experiments/phase98/cjk-byte-corruption-audit.ts` and nothing else from a prior phase. Phase 99,
101, 102 and 110 were **not** imported; their artifacts were read as JSON and their primitives
copied, with the copies proved equivalent by parity and by test. The Phase-99 module was not
imported, so it was not re-stamped by Phase 111.

**Copy ledger** (recorded in `manifest.json.importBoundary.copied`): the UTF-8 phase walker and the
legality predicate (Phase 101/98), `buildPhaseMask` / `applyPhaseMask` / `maskedArgmaxOf`
(Phase 101), the P12 decode order of operations (Phase 102), the mechanism classifier
(Phase 99, textually identical), the partition and bijection helpers (Phase 110), and the digest /
identity conventions (Phase 110).

**Negative attestations** (`probe-results.json.integrity`): training `false`;
checkpoint files modified `false`; tokenizer modified `false`; vocabulary modified `false`;
merge table modified `false`; prompt text modified `false`; dataset modified `false`; generation
settings modified `false`; evaluator modified `false`; threshold modified `false`; rollout
definition modified `false`; model architecture modified `false`; decoder modified `false`; mask
semantics modified `false`; production modules modified `[]`; `Math.random()` used `false`;
`setTimeout` used `false`.

**Positive attestations** (stated as plainly as the negatives): a model **was** loaded; 1632
forward passes **were** run; 68 generations **were** performed (48 new + 20 parity); the write set
is exactly the five declared artifacts; `prompt-set.json` was frozen before the model load
(`modelLoadedBeforeFreeze: false`, `generationBeforeFreeze: false`).

**Phase-99 `durationMs` warning.** `experiments/phase99/logit-mechanism-audit.json` is re-stamped
with a fresh `durationMs` whenever the Phase-99 module chain is imported, and the aggregate runner
reaches that chain through `experiments/phase102`. The aggregate suite was therefore run **before**
the final probe pass, per plan §12.5. Phase 99's scientific digest — the digest that excludes
`durationMs` — was `35eb66d1…f7fd9c6` before the run and `35eb66d1…f7fd9c6` after it, and it still
matches the file on disk. Its raw digest is recorded with `rawDigestReproducible: false`, and the
digest check tolerates a raw move only for artifacts recorded that way.

**Section mapping.** The report follows the plan §10 skeleton. The brief's original 17 headings
govern where they differ; no section was invented or dropped, and the skeleton above is the plan's
own numbering.

**Not registered in the aggregate runner.** `src/lib/minimind/research/__tests__/run.ts` was not
edited: no import, no registration. Phase 111's suite is reachable through
`experiments/phase111/run-phase111-suite.ts` only. The aggregate count is unchanged at `2597`.

## Validation

| Gate | Command | Result |
|---|---|---|
| G1 | `npx --yes tsx experiments/phase111/run-phase111-suite.ts` | `passed=79 failed=0 skipped=0` |
| G2 | `npx --yes tsx experiments/phase110/run-phase110-suite.ts` | `79 passed, 0 failed, 0 skipped` (unchanged) |
| G3 | `npx --yes tsx src/lib/minimind/research/__tests__/run.ts` | `TOTAL: 2597 passed, 0 failed` (unchanged; run before the final probe pass) |
| G4 | `npx tsc --noEmit` | 64 errors, identical to the pre-existing baseline; **0** in `experiments/phase111/**`, in the new test file, or in the report path |
| G5 | `npm run build` | exit 0, `✓ Compiled successfully in 8.2s`; 178 pre-existing warnings, **0** attributable to Phase 111 |
| G6 | `git status --short experiments/phase111/` | exactly the 10 declared files; logs excluded by `.gitignore`; no `git add -A` / `git add .` used anywhere |
| G7 | post-run re-digest | 13/13 source artifacts match their recorded scientific digests; Phase-99 **scientific** digest unchanged |
| G8 | `git diff --stat -- src/lib/minimind/**` | the tracked modifications there are the pre-existing uncommitted backlog; Phase 111 added only two **new** files under `src/lib/minimind/research/` and modified **no** existing file in that tree |

The 64 pre-existing `tsc` errors and the 178 pre-existing build warnings are declared out of scope
and were not repaired, per the frozen plan.

**Git boundary.** Nothing was staged, committed or pushed. The unrelated uncommitted backlog in the
repository was left exactly as found.
