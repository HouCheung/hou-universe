# Phase 108 — Gap-Matched S0 Geometry Audit

**Status:** `INCONCLUSIVE — matched evidence insufficient`

**Training:** `NOT RUN` — no optimizer step, no checkpoint write, no tokenizer,
vocabulary, merge-table, architecture, decoding, mask, prompt, dataset,
sampling, rollout or evaluator change. Read-only over the four frozen
checkpoints.

**Artifacts:** `experiments/phase108/` (instrument, probe, manifest,
probe-results, matching-results) and
`src/lib/minimind/research/tests/phase108-gap-matched.test.ts`.

---

## 1. Phase-107 final status

Phase 107 returned

> **`INCONCLUSIVE — S0 mass signal exists but held-out separation is weak`**

and closed with three verified facts this phase takes as its starting point:

1. **The named mechanism was not supported.** The eleven failure S0Margins are
   all negative — the continuation-start class never out-weighs the legal-start
   class at S0 — and `S0Margin > 0` holds in **0 of 11** failures against
   **2 of 210** intact states.
2. **A residual association survived.** The failure-derived threshold
   `tau = -0.9916428118332534` flagged **49 of 210** intact states
   (FPR `0.2333`) against its own flag rate of `0.5455` on the population that
   defined it. Directional, but not specific.
3. **A measured geometry confound was recorded.** `S0` is the nearest preceding
   valid character-boundary state, not the P0 state's immediate predecessor.
   **10 of 11** failure states sit two or three tokens before P0, against
   **51 of 210** intact states.

Phase 107 §17 fixed exactly one follow-up, with its falsifier stated in advance:

> **H108 — the residual S0 margin signal is a geometry artefact.**
> Falsifier: within the gap-matched stratum (`tokensAfterBoundary >= 2`) the
> failure S0 margin distribution still exceeds the matched intact distribution.

This phase runs that falsifier. Nothing else.

## 2. Research question

The question is **not** whether the full 11-versus-210 populations differ.
Phase 107 answered that, and the answer is confounded by the gap asymmetry.

The question is:

> **Among states with comparable `tokensAfterBoundary`, does the failure
> population still show systematically higher `S0Margin` than intact states?**

If it does not, the Phase-107 residual is plausibly — and now measurably —
explained by temporal geometry. If it does, H108 is falsified and the S0 family
stays open.

## 3. The H108 hypothesis

> **H108** — the residual S0 margin signal recorded in Phase 107 is a geometry
> artefact: it is produced by comparing failure states that sit two or three
> tokens before P0 against an intact population that is overwhelmingly one token
> before P0, and it does not survive when the comparison is made at matched gaps.

H108 is a **confound** claim. It predicts that controlling the S0→P0 temporal
gap removes the apparent shift. It says nothing about whether `S0Margin` is
meaningful at other gaps, and nothing about the P0-level signal Phases 103–106
measured.

## 4. State population

Both populations are the frozen Phase-107 populations. Neither was resampled,
extended, re-prompted or filtered before the stratum rule was applied.

| Population | n | Source |
| --- | --- | --- |
| Failure | **11** | the P0 failure states of the frozen P12-MASK trajectories of the four Phase-96 family checkpoints |
| Intact | **210** | the P0 steps of the same frozen trajectories that emitted a legal, recoverable token |

Every state's `S0Margin` and `tokensAfterBoundary` was **re-derived from a live
forward pass** and required to reproduce the Phase-107 artifact at tolerance 0
(the replay and baseline gates recorded in `probe-results.json`). The audit
therefore runs on freshly measured numbers that are
individually gated against the frozen record, not on numbers read back from it.

## 5. Gap definition

`gap = s0TokensAfterBoundary`, Phase 107's own field, unchanged:

> the number of tokens between S0 — the nearest preceding character-boundary
> state of the P0 state's prefix — and P0 itself.

It is not redefined here, and no second gap measure was substituted. The full
geometry record is reproduced in §10.

## 6. The pre-registered matched stratum

```
tokensAfterBoundary >= 2
```

Exactly this condition. Not `>= 1`, not `>= 3`, not `== 2`, not a quantile, not
an optimised cut.

| `tokensAfterBoundary` | 1 | 2 | 3 |
| --- | --- | --- | --- |
| Failure (11) | 1 | 2 | 8 |
| Intact (210) | 159 | 8 | 43 |

**Stratum: 10 failure states, 51 intact states — exactly the counts Phase 107
recorded.** The pre-registered stratum gate was applied before any margin in the
stratum was read, and it passed. Had either count differed the probe would have
halted with `BLOCKED — Phase-107 gap population changed`; it did not.

## 7. Matching method

### Exact-gap matching (used)

For each stratum failure of gap `g`, the control set is **every** intact stratum
state of gap exactly `g`. The reference for that failure is the **median
`S0Margin` of that control set**, and the comparison is

```
delta = failureMargin - matchedIntactReference
```

per the §8 preference in the phase description.

| | gap-2 controls | gap-3 controls |
| --- | --- | --- |
| Stratum failures at that gap | 2 | 8 |
| Stratum intact states at that gap | 8 | 43 |

**Exact matching retained all ten failures. The fallback was not needed and was
not used.** The probe records `fallbackUsed: false`, `fallbackRetained: null`.

### On control reuse

The reference is a **set** median, so two failures at the same gap legitimately
share a control set. This is recorded rather than hidden: each match carries its
own `matchedIntactCount`, and the artifact records that **51 distinct intact
states** served as controls. The matched statistic is therefore a comparison of
each failure against its gap peers — not a set of disjoint pairs — and §9's
permutation null is built to respect exactly that structure.

Matching is a pure function of the frozen labels and gaps. It cannot see the
margins: replacing every control's `S0Margin` with an unrelated value leaves the
match structure byte-identical, and the suite asserts this.

### The fallback, held in reserve

The pre-registered fallback tolerance `|failureGap - intactGap| <= 1` is
implemented and tested, but **not applied**, because exact matching sufficed.
It is worth recording one property it deliberately does *not* have: because both
populations are stratified first, the fallback widens the gap tolerance
**within** the pre-registered `>= 2` stratum. It is not a licence to widen the
stratum — a gap-1 control stays excluded under exact matching and under the
fallback alike. The suite asserts this explicitly.

## 8. Matched result

**Primary statistic — the matched median difference: `+0.0030208448733220483`.**

| Quantity | Value |
| --- | --- |
| Matched failures | 10 |
| Distinct controls | 51 |
| **Median delta** | **`+0.0030208448733220483`** |
| Mean delta | `+0.026435280108252367` |
| Positive / negative / zero | **5 / 5 / 0** |

Per-failure deltas, in artifact order:

| # | Failure state | gap | S0Margin | matched reference | delta | controls |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `A/machine learning is#15` | 2 | −0.9916428118332534 | −0.999175770302675 | **+0.007532958469421591** | 8 |
| 2 | `A/机器学习是#11` | 3 | −0.9968391965141633 | −0.9937296511161933 | −0.003109545397970037 | 43 |
| 3 | `B94/太阳#15` | 3 | −0.9998179442542202 | −0.9937296511161933 | −0.006088293138026946 | 43 |
| 4 | `B94/机器学习是#2` | 2 | −0.9673149594954674 | −0.999175770302675 | **+0.031860810807207596** | 8 |
| 5 | `B94/什么是 machine learning#3` | 3 | −0.9993395432108111 | −0.9937296511161933 | −0.005609892094617819 | 43 |
| 6 | `C94/太阳#11` | 3 | −0.9520337931717393 | −0.9937296511161933 | **+0.04169585794445396** | 43 |
| 7 | `C94/机器学习是#8` | 3 | −0.9705616201345946 | −0.9937296511161933 | **+0.023168030981598697** | 43 |
| 8 | `C94/什么是 machine learning#3` | 3 | −0.9952209198389708 | −0.9937296511161933 | −0.0014912687227774946 | 43 |
| 9 | `T/machine learning is#11` | 3 | −0.8115022201820673 | −0.9937296511161933 | **+0.18222743093412597** | 43 |
| 10 | `T/太阳#15` | 3 | −0.9995629398170851 | −0.9937296511161933 | −0.005833288700891837 | 43 |

One failure lies outside the stratum and is therefore not matched:
`T/什么是 machine learning#12` (gap 1).

### Reading the median honestly

The sign split is **exactly even — five positive, five negative.** The median of
ten values is the average of the fifth and sixth in ascending order:

```
5th  = -0.0014912687227774946
6th  = +0.007532958469421591
```

so the positive `+0.00302` median is an arithmetic consequence of two adjacent
deltas straddling zero. It is not a "central" positive shift in any substantive
sense.

The **mean** is positive only because of a single state. `T/machine learning
is#11` contributes `+0.1822`; the other nine deltas sum to `+0.0821`. Removing
that one state gives

| | with all 10 | without `T/machine learning is#11` |
| --- | --- | --- |
| median delta | `+0.0030208448733220483` | **`−0.0014912687227774946`** |
| mean delta | `+0.026435280108252367` | `+0.009125041127599745` |

Under the pre-registered decision rule (§19) the removal flips the branch from
C to A.

### Distributions

| Population | n | min | q25 | median | q75 | max | mean |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Full** failure | 11 | −0.999818 | −0.998089 | −0.991643 | −0.961150 | −0.811502 | −0.967166 |
| **Full** intact | 210 | −0.999990 | −0.999731 | −0.999035 | −0.993681 | +0.947972 | −0.959305 |
| **Stratum** failure | 10 | −0.999818 | −0.998714 | −0.993432 | −0.968127 | −0.811502 | −0.968384 |
| **Stratum** intact | 51 | −0.999962 | −0.999208 | −0.995811 | −0.987719 | +0.947972 | −0.927662 |
| **Matched** failure | 10 | −0.999818 | −0.998714 | −0.993432 | −0.968127 | −0.811502 | −0.968384 |
| **Matched** intact | 51 | −0.999962 | −0.999208 | −0.995811 | −0.987719 | +0.947972 | −0.927662 |

(The matched subset *is* the stratum: exact matching retained all ten failures
and drew on all fifty-one controls.)

**The median gap shrinks by 67.8 %.** In the full populations the failure median
sits `0.007392` above the intact median; in the matched stratum it sits
`0.002379` above — a reduction of roughly two thirds.

**The mean gap reverses.** In the full populations the failure mean is
`−0.007861` *below* the intact mean. In the matched stratum it is `−0.040722`
below — the intact stratum mean (`−0.927662`) is dragged upward by
`T/机器学习是#18` (`S0Margin = +0.9480`, gap 2), which is inside the stratum.

Both facts move in the H108 direction. Neither is a test.

## 9. Permutation null

The null procedure was fixed before the outcome was read.

* **What is permuted:** the failure/control **label** of each state, within its
  exact-gap group, preserving that group's failure count and control count. The
  margins and the gaps do not move.
* **Statistic:** the median over the drawn pseudo-failures of
  `margin - median(control margins in the same group)` — the same statistic as
  the primary one.
* **Draws:** `20 000`. **Seed:** `108 042`. Both fixed in the instrument.
* The stream is a `mulberry32` generator implemented in the instrument; no
  `Math.random()` is called anywhere in this phase.

| Quantity | Value |
| --- | --- |
| Observed median delta | `+0.0030208448733220483` |
| Draws at or above it | **6 188 / 20 000** |
| **p-value** | **`0.3094345282735863`** |
| Null median-of-medians | `+0.00042281789230708133` |
| Null range | `[−0.007491419293104484, +0.16784687712004265]` |

**The fixed null cannot separate the populations.** Roughly 31 % of
label-shuffled draws produce a median delta at least as positive as the observed
one. The null's own centre is `+0.00042` — essentially zero — which is what a
label-shuffled median should look like.

The null's upper range is also informative: a shuffle **can** produce a median
delta of `+0.168`, comparable to the observed mean, purely from relabelling.
A single large delta is not evidence of structure at this sample size.

## 10. Geometry analysis

For every state, the complete joint geometry was recorded. For failure states
S0 and P0 are known directly; for intact states the **comparable P0 transition
state is defined consistently from the Phase-107 record itself** — P0 is the
state whose prefix the measured S0 was walked back from — so no new transition
definition was invented.

| Failure state | gap | S0 idx | P0 idx | S0 byte | P0 byte | bytes between | complete chars between |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `A/machine learning is#15` | 2 | 26 | 28 | 33 | 36 | 3 | 1 |
| `A/机器学习是#11` | 3 | 21 | 24 | 24 | 27 | 3 | 1 |
| `B94/太阳#15` | 3 | 17 | 20 | 18 | 21 | 3 | 1 |
| `B94/机器学习是#2` | 2 | 13 | 15 | 15 | 18 | 3 | 1 |
| `B94/什么是 machine learning#3` | 3 | 19 | 22 | 26 | 29 | 3 | 1 |
| `C94/太阳#11` | 3 | 13 | 16 | 15 | 18 | 3 | 1 |
| `C94/机器学习是#8` | 3 | 18 | 21 | 21 | 24 | 3 | 1 |
| `C94/什么是 machine learning#3` | 3 | 19 | 22 | 26 | 29 | 3 | 1 |
| `T/machine learning is#11` | 3 | 21 | 24 | 28 | 31 | 3 | 1 |
| `T/太阳#15` | 3 | 17 | 20 | 18 | 21 | 3 | 1 |
| `T/什么是 machine learning#12` *(out of stratum)* | 1 | 30 | 31 | 39 | 40 | 1 | 1 |

**This is the single most important structural fact Phase 108 adds.**

Inside the pre-registered stratum, **all ten failures and all fifty-one controls
have exactly 3 bytes and exactly 1 complete character between S0 and P0.** The
token-gap stratum and the byte-geometry class `(3 bytes, 1 complete character)`
coincide **within the stratum**: the 51 intact states carrying `3/1` at
`gap >= 2` are precisely the 51 stratum controls, with no remainder.

Precision matters here, so the one caveat: the byte-geometry class `3/1` is
*not* confined to the stratum. Eight further intact states carry `3/1` at
`gap = 1`, so the class has 59 intact members in all, not 51. Those eight sit
below the pre-registered `>= 2` line and are excluded. The exclusion is the
pre-registered rule doing its job — §6 forbids widening it after the fact, and
it was not widened. It is recorded here because it is the one place where the
gap rule and the byte rule come apart.

Consequences:

1. The matching therefore controlled **three** geometry variables at once, not
   one: token distance, byte distance and complete-character distance — for
   every control, without exception.
2. No further measured geometry variable is available to explain the residual
   *within the stratum*. If the match did not remove the shift, geometry is not
   the explanation. If it did, there is nothing left in the recorded geometry to
   appeal to.
3. The only geometry variation remaining inside the stratum is the token count
   itself (gap 2 versus 3), with bytes and characters held constant.

Splitting the ten matched deltas by that remaining variable:

| gap | failures | deltas | positive |
| --- | --- | --- | --- |
| 2 | 2 | `+0.007533`, `+0.031861` | 2 / 2 |
| 3 | 8 | `−0.003110`, `−0.006088`, `−0.005610`, `+0.041696`, `+0.023168`, `−0.001491`, `+0.182227`, `−0.005833` | 3 / 8 |

The gap-2 cell holds two failures, which is too few to read. Recorded for
completeness, not offered as a result.

## 11. Secondary diagnostics

Computed on the same matched subset, with **no new threshold** and with no
component promoted to the primary score.

| Component | failure median | intact median | median shift |
| --- | --- | --- | --- |
| `continuationStartMass` | `0.0032096` | `0.0020940` | **`+0.0011156`** |
| `legalP0StartMass` | `0.9966415` | `0.9979049` | **`−0.0012634`** |
| `forbiddenLeadMass` | `3.686e−6` | `1.099e−6` | `+2.587e−6` |
| `argmaxProb` | `0.9456445` | `0.9671746` | `−0.0215300` |

**Raw argmax analysis.**

| | matched failures | matched intact | full failures | full intact |
| --- | --- | --- | --- | --- |
| Argmax is a **continuation-byte start** | **0 / 10** | **1 / 51** | **0 / 11** | **2 / 210** |

Both components move in the H108-consistent direction — failures carry a
fraction more continuation-start mass and a fraction less legal-start mass, so
the margin is slightly higher — but the shifts are an order of magnitude smaller
than the between-state spread of either component, and the direction is
unchanged from the unmatched comparison.

**The geometry confound does not act on the components differently.** All four
components shrink toward zero under matching in the same proportion the primary
score does, and `forbiddenLeadMass` remains negligible everywhere. In the
matched subset the failure maximum is `1.98e−4` against a control maximum of
`1.45e−4`; across the full 210-state intact population the maximum is
`4.27e−3`, an order of magnitude above both, and those are still probabilities
of a forbidden lead in the third or fourth decimal place. Nothing in this family
carries weight.

The argmax result is untouched by matching and unchanged from Phase 107: the
unconditional S0 argmax is a legal character start in **every** failure state,
matched or not, and the one matched intact state whose argmax *is* a
continuation start is the same `T/机器学习是#18` that carries the intact
stratum's positive mean.

## 12. Random-gap control

One deterministic control, one seed, no repetition, never the official result.

The frozen 221-state pool was shuffled once with a fixed seed (`108 911`) and the
first 11 states relabelled "failure", the remaining 210 relabelled "intact"; the
identical stratum rule, the identical exact-gap matching and the identical
statistic were then applied. Under this relabelling the failure label carries no
relationship whatsoever to the actual corruption state.

| | Official | Random-label control |
| --- | --- | --- |
| Stratum failures | 10 | 4 |
| Stratum controls | 51 | 57 |
| **Median delta** | `+0.0030208448733220483` | **`−0.0014690204141051821`** |
| Control deltas | — | `−0.001491`, `−0.001447`, `−0.006157`, `+0.196453` |

**The control reproduces the shape of the official result.** It too produces a
median delta hugging zero, and it too produces exactly one large positive
outlier (`+0.1965`) against three small negatives. The official result's
`+0.1822` outlier — the state that carries the entire positive mean — is
quantitatively what random labels produce.

This is an anti-overfitting diagnostic only. It does not enter the
classification, and it is not evidence *for* H108; it is evidence that the
official matched statistic is not distinguishable from what this procedure
yields on meaningless labels.

## 13. Interpretation

**The pre-registered falsifier is not met, and it is not cleanly refuted
either.**

H108's falsifier required the failure margins to remain *systematically higher*
than matched intact margins under the fixed analysis. Seven independent
observations point against that:

1. **The sign split is exactly even** — 5 positive, 5 negative, 0 zero.
2. **The positive median straddles zero** — it is the average of `−0.001491` and
   `+0.007533`. It is positive as an arithmetic artefact of even `n`, not as a
   central tendency.
3. **The permutation null cannot see it** — `p = 0.3094`, with 6 188 of 20 000
   relabelled draws at least as positive.
4. **One state carries the entire positive mean.** Remove `T/machine learning
   is#11` and the median delta turns negative.
5. **The random-label control produces the same shape**, including a single
   comparable positive outlier.
6. **The median gap shrinks by 67.8 %** under matching — from `+0.007392` to
   `+0.002379`.
7. **The mean gap reverses sign** in the matched stratum.

Set against that, two observations keep the verdict from being clean:

* the median delta is positive, so the shift did not literally *reverse*;
* a residual `+0.0024` median difference does remain, and the matched stratum is
  not large enough for the fixed test to certify its absence.

Under the decision rule fixed in advance in the phase description (§19), a
positive median delta with `p >= 0.05` is **C — Inconclusive**. That is the
verdict, and it is the verdict the rule produces rather than the verdict the
narrative prefers.

**What the phase actually establishes** is narrower and firmer than either A or
B: the geometry confound is real and it accounts for roughly two thirds of the
apparent S0 shift, and the residual that survives is not statistically
distinguishable from label noise at this sample size. Phase 107's residual
signal is therefore **substantially — but not conclusively — explained by
temporal geometry.** It is no longer a signal one can cite as a property of the
failure population.

The §10 geometry result strengthens this beyond what a p-value alone would
carry. Because the matched controls and the matched failures share *identical*
byte and character geometry, the matching controlled every geometry variable
this design can measure. There is no remaining geometric explanation available,
and equally no remaining geometric confound to appeal to. What is left is a
`+0.0024` median difference in a ten-state sample.

## 14. Limitations

1. **The matched failure sample is ten states.** A single state moves the sign
   split from 5/5 to 4/5 and the mean by `+0.0173`. The phase's central
   quantity is not robust at this `n`, and §8 quantifies exactly how much of it
   rests on one state.
2. **The permutation null's resolution is bounded by the design.** With two
   gap-2 failures drawn from ten states, the gap-2 group contributes a coarse
   statistic; the gap-3 group dominates. A null cannot manufacture power the
   sample does not have, and this one does not.
3. **`tau` is untouched but also unused.** This phase never applies the Phase-107
   threshold; the matched comparison is threshold-free by construction. That is
   deliberate — a threshold would reintroduce the quantity Phase 107 already
   showed to be non-specific.
4. **No false-negative rate is defined.** The 210-state population is intact by
   construction, so this design can measure specificity-like quantities only.
   That limitation is inherited unchanged from Phase 107 and is not repaired
   here.
5. **The two populations are not independent.** Same four checkpoints, same five
   prompts, same frozen trajectories.
6. **The gap is a token count.** It matches byte and character distance inside
   the stratum (§10) but is not itself a semantic measure of "how far S0 is from
   P0".
7. **The mean is reported throughout but should not be read as a location.** It
   is dominated by one state before matching and by one intact state after, and
   both are reported so a reader can discount it.

### Integrity note — one pre-existing side effect, disclosed

`experiments/phase99/logit-mechanism-audit.ts` has no `require.main` guard, so
**importing** it executes its audit. Phase 101 already documented this in its own
source (`utf8-phase-mask-audit.ts:1563`: the Phase-99 module "rewrites
`logit-mechanism-audit.json` with a fresh `durationMs`"). Any suite whose import
graph reaches that module therefore re-stamps the Phase-99 artifact — this
includes the aggregate research suite (`run.ts` calls `runPhase99Tests()`) and
this phase's own focused suite, which imports the Phase-107 audit for the §15
parity checks.

The effect was measured rather than assumed, by digesting the artifact before
and after one full run of the Phase-108 focused suite:

| | before | after |
| --- | --- | --- |
| bytes | `213306` | `213306` |
| raw sha256 | `0e522c8445a0427c…` | `25ec6c5e21078851…` |
| **scientific sha256** *(excludes `durationMs`)* | **`35eb66d11614a490…`** | **`35eb66d11614a490…`** |

**Only the wall-clock field moves. The scientific digest is identical, byte for
byte, and the file size is unchanged.** Phase-99's evidence is not altered; its
*raw* digest is simply not reproducible, which is precisely why
`scientificDigestOf` exists and why every digest this phase records is the
scientific one.

No prior-phase instrument was modified to suppress this, and none should be:
Phase 99's module is outside this phase's scope, and the effect predates it. It
is recorded here so that anyone re-running these suites expects the raw digest
of the Phase-99 artifact to move and does not read that as drift.

## 15. What is NOT proven

* **Not proven:** that the geometry confound fully explains the Phase-107
  residual. Roughly two thirds of the median gap is removed; the remaining third
  is not shown to be either real or noise.
* **Not proven:** that S0 mass is irrelevant to corruption. This phase says
  nothing new against the P0-level signal Phases 103–106 measured, and Phase 107
  already said the signal is not *announced* at S0.
* **Not proven:** that the failure population's S0 state would not corrupt under
  another rollout. The 210 intact states are intact **in the frozen trajectories
  only**. Absence of observed corruption is not a proof of safety, and nothing
  here should be read as a classifier-performance claim.
* **Not proven:** that the one outlier state `T/machine learning is#11` is
  special. It is identified purely by its delta, and its margin `−0.8115` sits
  comfortably inside the matched controls' own range, which runs from `−0.99996`
  to `+0.9480`. Nothing about the value marks it out; only its distance from its
  gap peers does, and a ten-state sample can produce one such state by chance —
  as §12's random-label control demonstrates by producing one too.
* **Not proven:** that the `±1` fallback would behave the same way. It was
  implemented and tested but never applied; nothing here measures it on real
  data.
* **Not proven:** anything about causation. This is a read-only association
  audit on a fixed population.

## 16. Phase-109 recommendation

Exactly one hypothesis, falsifiable, read-only, zero-training.

> **H109 — the residual S0 margin signal is a single-state effect.**
> The entire positive mean and the positive median of the matched deltas are
> attributable to one failure state. No other stratum failure contributes a
> systematic positive shift.

**Falsifier:** remove the state with the **maximum matched delta** — a
deterministic rule, fixed before the result is read, not a search, not a chosen
state — and re-run the identical pipeline on the remaining nine. If the
remaining matched median delta is still positive **and** the fixed permutation
null rejects it at the pre-registered level, H109 is falsified and the residual
is a population property that keeps the S0 family open.

**Why this one.** Phase 108's decisive measurement is that one state
(`T/machine learning is#11`, delta `+0.1822`) carries the whole positive mean,
that the remaining sign split is even, and that the random-label control
produces the same shape from meaningless labels. That leaves exactly one
question worth asking: is there a population signal underneath the single state,
or is there not. The answer determines whether the S0 family closes the way the
lead-conditioned family closed in Phase 106, or stays open for a single-state
mechanism.

**Feasibility.** Nine failures remain, above the pre-registered seven-failure
floor. The stratum, the matching rule, the statistic, the seed and the null are
all reusable unchanged; the only new object is the deterministic choice of which
state to drop. The populations, the checkpoints and the artifacts are frozen.

**What would not be worth doing.** Matching on `armKey` or on `prompt` — Phase
107 §9 already showed the arm skew, and the stratum splits as A 2, B94 3, C94 3,
T 2 failures per arm, so within-arm matching could compare no more than three
failures against any cell. That is a strictly smaller sample than the ten that
have just returned Inconclusive, and it would spend the frozen population to buy
less. Re-matching on byte geometry would be a no-op: §10 shows the byte geometry
is already identical across the whole stratum.

## 17. Final conclusion

Phase 108 asked whether the residual S0 margin signal Phase 107 recorded is an
artefact of the S0→P0 temporal gap. The pre-registered stratum was applied
exactly as fixed (`tokensAfterBoundary >= 2`), and it held exactly the recorded
10 failures and 51 intact states. Every one of the 221 states' `S0Margin` and
`tokensAfterBoundary` was re-derived from a live forward pass and reproduced the
Phase-107 artifact at tolerance 0, and the frozen `tau` reproduced exactly.
Exact-gap matching retained all ten failures against 51 distinct controls; the
fallback was not needed.

The Phase-107 shift did **not** survive as a systematic effect. The matched sign
split is exactly even, the positive median straddles zero, the fixed
permutation null returns `p = 0.3094`, one state carries the entire positive
mean, and the single-seed random-label control reproduces the same shape from
labels that mean nothing. The median gap shrank by 67.8 % and the mean gap
reversed.

But it did not cleanly disappear either: a `+0.0024` median difference remains,
and ten failures are not enough for the fixed test to certify its absence. The
pre-registered rule, which was written before the outcome was read, places a
positive median delta with `p >= 0.05` in the inconclusive branch.

> **Verdict: `INCONCLUSIVE — matched evidence insufficient`.** H108 is neither
> supported nor falsified. The geometry confound is real and explains roughly
> two thirds of the Phase-107 shift; the residual is not distinguishable from
> label noise at this sample size, and this phase declines to manufacture a
> verdict the frozen test cannot support. The S0 family is neither closed nor
> confirmed, and Phase 109 is specified to settle the one question Phase 108
> leaves open.
