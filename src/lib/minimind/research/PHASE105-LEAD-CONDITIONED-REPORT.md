# Phase 105 — Lead-Conditioned Character-Start Audit

Read-only mechanism audit over the frozen Phase-96 family checkpoints.
**Training: NOT RUN.** No optimizer step, no checkpoint write, no tokenizer,
vocabulary, merge-table, architecture, generation, sampling, rollout, prompt,
dataset, evaluator or Phase-95 threshold change. No decoding mask of any kind
was applied to any logit. `Math.random()` and `setTimeout()` are used nowhere.

Artifacts: `experiments/phase105/{lead-conditioned-audit.ts,probe.ts,
run-probe.cmd,run-phase105-suite.ts,vocabulary-census.json,probe-results.json,
correlation-results.json,manifest.json}`.
Suite: `src/lib/minimind/research/tests/phase105-lead-conditioned.test.ts`.

---

## 1. Phase-104 final validation status

Phase 104's verdict is reproduced, not restated.

| quantity | Phase-104 record | Phase-105 replay |
| --- | --- | --- |
| classification | `C — Refuted` | unchanged |
| mean R0 (`first-continuation-any-lead`) | −0.041589 | −0.04158858606753707 |
| mean R1 (forced-P1) | 0.041059 | 0.04105894105894106 |
| Δrho | −0.082648 | −0.08264752712647863 |
| Control A (210 intact P0) mean R0 | 0.022109 | 0.02210887685675769 |
| exploratory `lead-conditioned` mean | +0.097294 | 0.0972943722943723 |

The §16 replay gate passed. All four checkpoints carry the digests Phase 104
recorded (`A`, `B94`, `C94`, `T` all `true`); the P12-MASK condition was
replayed and recovered exactly 11 P0 failure states, matching Phase 102's
recorded count; every failure state reproduced its Phase-104 S0 token index
**and** its full 300-value S0 softmax at tolerance 0; `forwardAt`'s internal
double pass was bit-identical at every audited state; the frozen P0 and
forced-P1 continuation slices and the per-state rho reproduced the Phase-103
floats at tolerance 0. `blocks` is empty.

The Phase-104 `+0.0973` was located in its producing implementation, not in
prose: `leadConditionedProjection` in `experiments/phase104/
preceding-boundary-audit.ts`, applied in `experiments/phase104/probe.ts`, with
the per-state record in `experiments/phase104/probe-results.json` under
`targetStates[].r0ByVariant["lead-conditioned"]`. Phase 105 recomputes it and
matches it digit for digit on all 11 states.

**One deviation from a clean first run, disclosed in full.** The first
Phase-105 run produced a _vacuous_ §15 historical gate: the probe looked up
Phase-104's recorded value under Phase-105's own variant name
(`lead-conditioned-bare`) instead of Phase-104's key (`lead-conditioned`), so
the comparison was never performed, `diffVsP104` stayed `null` for all 11
states, and the gate "passed" only because its `blocks` array was empty. No
measured statistic was affected — the historical values were already correct in
the artifact — but the gate was not real. The key mapping was made explicit
(`PHASE104_LEAD_CONDITIONED_KEY`), a missing recorded value now pushes a block
instead of passing silently, and the artifacts were regenerated.

The regenerated artifacts were diffed against a snapshot of the first run. The
snapshot was scratch — §18 forbids it — and has been deleted; its result is
recorded here so the evidence survives the file. `correlation-results.json` and
`vocabulary-census.json` are identical; `probe-results.json` differs at
**exactly 13 leaves**, of which 12 are the gate bookkeeping itself
(`historicalVariantReproducedCount: 0 → 11` and the 11 per-state
`leadConditionedBareMaxAbsDiffVsPhase104: null → 0`) and 1 is `durationMs`
(3 065 300 → 956 994 ms). Every measured number is bit-identical. The gate is
now non-vacuous: `historicalVariantReproducedCount = 11`, every per-state
historical difference is exactly 0.

The suite then found a second, smaller defect, in `massIdentity` rather than in
the probe. Its first version re-derived each variant's two term masses by a
closed-form guess, and the guess was wrong for two of the five: `bare` divides
each leg's weight by the weight sum before multiplying by that leg's
continuation mass, and `any-component` credits every distinct continuation
component, so neither is `breakdown.directMass` or `Σ w_l · continuationMass`.
`massIdentity` now reads the terms the projection actually accumulated
(`directTermMass`, `leadTermMass`, new fields). The probe records only the
**primary** variant's flag, so the correction is only safe if it cannot move
that flag. It cannot — for the primary the two forms are algebraically the same
sum — and the suite proves it rather than asserting it: it re-derives the
current implementation's verdict from the artifact's own recorded `legs`,
`breakdown` and `totalMass` and requires it to equal the flag recorded before
the change, at all 11 states. Both hold. No artifact was regenerated for this
fix and no recorded number changed.

The
suite additionally re-derives the historical equality directly from both
artifacts. The change also cached each state's legs so the five variants build
from one model pass per lead; the suite proves the shortcut is exactly the
fresh path for all five variants.

## 2. Research question

Phase 104 rejected the absence of a preceding-boundary continuation-byte
preference as the failure mechanism, but its declared variants table recorded
one positive number: the exploratory `lead-conditioned` statistic reached
**+0.097294** on the 11 failure states, above the Phase-103 identity baseline
**0.04105894105894106**. Phase 104 measured the same statistic at **0.159708**
on 210 intact P0 states and did not pursue it.

Phase 105 asks whether that positive value is a property of the failure
states, a property of the vocabulary, or a property of the projection.

## 3. H105 hypothesis

**H105** — if the character-start representation is the failure mechanism, then
the lead-conditioned projection at S0 will exceed the Phase-103 baseline and
clear its own permutation null, **while the same statistic on the intact P0
states will not**.

Three pre-registered readings:

- **H105-A** — genuine and specifically associated with the failure states.
- **H105-B** — general structure: the same effect appears equally in the
  intact states.
- **H105-C** — projection artifact: the effect disappears or is unstable under
  a rigorous definition and controls.

Falsifier, fixed before measurement: if the lead-conditioned statistic at S0
does not clear its null, or clears it equally at the intact steps, the
mass-starvation account is rejected and the projection is read as an artifact
of the vocabulary's support.

## 4. Lead-token vocabulary census

Machine-readable: `experiments/phase105/vocabulary-census.json`. Deterministic
and model-free; the probe stops if the structural invariants fail.

| family | definition | count |
| --- | --- | --- |
| **K** | first byte `b0` with `0xC2 ≤ b0 ≤ 0xF4` and `leadSequenceLength(b0) ≥ 2` | **64** |
| **K1** | bare subset, `\|bytes\| === 1` (the byte tokens `4 + lead`) | **51** |
| **K2** | multi-byte subset, `\|bytes\| ≥ 2` (character-start entries) | **13** |
| **B11** | distinct `bytes[1]` over K2 | **11** |

The census matches the spec's presumption exactly: 13 multi-byte
character-start entries, 11 distinct second bytes, 51 bare legal leads, 64
Family-K entries.

B11 = `88, 8f, 96, 98, 9a, 9c, a4, b8, ba, bb, bf`. The 13 K2 entries are
token ids 262, 264, 265, 273, 275, 283, 285, 286, 290, 292, 293, 297, 298 —
eleven 2-byte (`cjk-partial-merge`) entries plus two 3-byte
(`cjk-complete-merge`) entries (265 = `e7 9a 84`, 275 = `e6 98 af`).

Invariants all hold: `byteTokenRangeWellFormed = true` (ids 4..259 are the
identity byte map, no out-of-range ids), `everyK1IsAByteToken = true`,
`everyK2SecondByteIsAContinuationByte = true`,
`everyK1LeadValueIsALegalLead = true`. `|K| = |K1| + |K2| = 64`.

Two B11 values carry two entries each (`9a` → 264, 265; `98` → 273, 275);
the remaining nine carry one. No vocabulary drift was observed, so
interpretation proceeded.

**The 13-entry subset is not the vocabulary's CJK mechanism.** K2 is 13 of
300 entries and B11 is 11 of 64 continuation bytes; the K1 bare leads carry the
overwhelming share of the character-start mass (§10). The census supports no
claim that these 13 entries are the vocabulary's character-start mechanism, and
none is made.

## 5. Formal projection definition

The primary is **`lead-conditioned-complete`**, a complete, exhaustive
decomposition of the S0 character-start mass over the 64 continuation bytes
`0x80..0xBF`:

```
proj[b] = Σ over K2 t with bytes(t)[1] === b of P(t)              (direct term)
        + Σ over legal single-byte leads l of P(l) · D_l[b]       (lead term)

D_l[b] = Σ over tokens t with firstByte(t) === b of
             softmax( M( S0 ++ [ByteToken(l)] ) )[t]
```

Answering the six §4 sub-items explicitly:

1. **Which entries count as multi-byte character-start tokens.** Every
   vocabulary entry with `|bytes| ≥ 2` whose first byte is a legal multi-byte
   lead — K2, exactly 13 entries (§4).
2. **How their probability maps to continuation bytes.** `bytes[1]` only. The
   third byte of a 3-byte entry belongs to position 2 and is outside the
   position-1 axis. The declared `any-component` variant is the one that
   credits every distinct component.
3. **How duplicate continuation-byte values are aggregated.** By
   **summation** — the only aggregation that partitions probability mass.
   Averaging or maximising would silently discard mass.
4. **How tokens containing multiple bytes are handled.** As character-start
   *openers*: their mass is credited to the byte they open at, and they are
   never treated as a completed character.
5. **Whether probability is preserved in full-vocabulary space.** Yes.
   Nothing is renormalised and no term is rescaled to sum to 1.
6. **Raw, lead-conditioned, or continuation-conditioned probability?** The
   result is **raw byte probability** — an un-renormalised marginal on the
   64-byte continuation axis. `totalMass` is therefore meaningful and is
   reported (§10).

`D_l` is read by a **real forward pass** at the state the model reaches by
emitting a real single-byte vocabulary entry from its own S0 distribution. No
byte-level autoregressive state is invented and no logit is masked.

Five variants were declared before measurement: `complete` (primary),
`bare` (the Phase-104 exploratory statistic, historical only), `direct`
(Phase 104's `first-continuation-any-lead`), `renorm` (each `D_l` divided by
its own continuation mass), `any-component` (the direct term credits every
distinct continuation component). The Phase-104 implementation was **not**
copied and called primary.

The §4.D mass identity — the projection's total mass equals its direct term
plus the sum of its weighted leg terms, plus a residual bounded by the
non-continuation mass — was checked and holds at all 11 failure states and for
all five variants in the suite.

## 6. Failure-state results

Population: the frozen Phase-102/103/104 11 P0 failure states, same
checkpoints, prompts and prefixes. Not expanded.

| state | rho | direct | bare | fatal byte | P0 rank | proj rank | legs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A/machine learning is#15 | 0.1013 | 0.1840 | 0.0013 | `8d` | 1 | 24 | 51 |
| A/机器学习是#11 | −0.0140 | 0.0748 | 0.0570 | `a5` | 1 | 53 | 51 |
| B94/太阳#15 | −0.1959 | −0.1142 | −0.1843 | `b7` | 8 | 50 | 51 |
| B94/机器学习是#2 | 0.0075 | 0.0847 | −0.0615 | `86` | 2 | 33 | 51 |
| B94/什么是 machine learning#3 | 0.3001 | −0.0135 | 0.3138 | `8d` | 1 | 16 | 51 |
| C94/太阳#11 | 0.4131 | −0.0474 | 0.4177 | `b7` | 1 | 34 | 51 |
| C94/机器学习是#8 | 0.1303 | −0.1819 | 0.1972 | `b4` | 1 | 37 | 51 |
| C94/什么是 machine learning#3 | −0.1803 | −0.1946 | −0.1571 | `a5` | 1 | 36 | 51 |
| T/machine learning is#11 | 0.0863 | −0.2157 | 0.1946 | `b6` | 1 | 23 | 51 |
| T/太阳#15 | 0.0874 | −0.1517 | 0.0924 | `a2` | 1 | 49 | 51 |
| T/什么是 machine learning#12 | 0.1957 | 0.1181 | 0.1992 | `82` | 13 | 33 | 51 |

Primary statistic on the failure population:

- **mean Spearman rho = 0.084686** (n = 11)
- sign consistency **0.727** (8 positive, 3 negative)
- mean Pearson (raw probabilities) **−0.021622**
- mean Pearson over stable log probabilities **+0.080880**
- mean top-8 overlap **0.170455** (≈1.4 of 8 bytes shared)
- fatal byte: 8 distinct continuation values; **P0 rank ≤ 3 in 9/11 states**
  (mean P0 rank **2.82**), **projection rank mean 35.27, median 34**

The last row is the decisive per-state observation, and it is independent of
any aggregate: in **0 of 11** states does the lead-conditioned projection rank
the fatal continuation byte *better* than the state's own P0 distribution
does. It demotes it, usually from rank 1 to the bottom half.

The secondary metrics are recorded as required and were not substituted for
the primary. None of them was pre-registered with a null of its own; the
Pearson-over-log mean (+0.081) is the only one comparable in size to the
primary and cannot replace a pre-registered statistic that has a null.

## 7. Intact-state results

Population: the same 210 intact P0 states Phase-104's Control A used; identical
statistic, byte axis, projection definition, ranking/tie policy and permutation
method. All 210 were usable; 0 degenerate; every one was audited at a real
character boundary.

- **mean Spearman rho = 0.139800** (n = 210)
- 165 positive, 45 negative
- **61.9 %** of intact states have a lead-conditioned rho **greater than the
  failure mean of 0.084686**

The failure population's mean sits at roughly the 62nd percentile of the
intact distribution. It is not an extreme of that distribution.

## 8. Failure-vs-intact comparison

| variant | failure mean | intact mean | Δlead |
| --- | --- | --- | --- |
| **`complete` (primary)** | **0.084686** | **0.139800** | **−0.055114** |
| `bare` (Phase-104 exploratory) | 0.097294 | 0.159708 | −0.062414 |
| `direct` (Phase-104 primary) | −0.041589 | 0.022109 | −0.063697 |
| `renorm` | 0.108791 | 0.178073 | −0.069281 |
| `any-component` | 0.079366 | 0.127063 | −0.047696 |

Every declared variant has the **same sign of difference**, and it is the
opposite of the hypothesis: the lead-conditioned relationship is **stronger in
the intact states than in the failure states**, by 0.048 to 0.070 rho. The
result does not depend on which of the five projections is chosen.

Both the exploratory statistic and the primary show this. The Phase-104
`+0.0973` was therefore never evidence of failure-specificity: its own intact
counterpart is 0.159708.

## 9. Permutation null

Deterministic, seeded, identical in method to Phase 103/104. The 11
lead-conditioned failure distributions are held **fixed** and the corresponding
P0 target distributions are permuted **across states**; every marginal is
preserved exactly and only the state correspondence is destroyed. 2000
permutations, seed 105042 (failure) and 105043 (intact), 2.5/97.5 quantiles,
`Math.random()` nowhere.

| population | observed | null mean | 95 % null interval | above? |
| --- | --- | --- | --- | --- |
| failure | 0.084686 | 0.007453 | [−0.082019, 0.092446] | **no** |
| intact | 0.139800 | 0.053804 | [0.037907, 0.069819] | **yes** |
| Δlead (failure − intact) | −0.055114 | −0.046351 | [−0.138255, 0.038650] | **no** |

The failure mean **does not exceed its own null's 97.5 % quantile**. The
intact mean does. Note that even the null's mean is positive (0.0075 failure,
0.0538 intact), so a positive value was not by itself informative — the
permutation null was load-bearing and it is the null that rejects the primary.

The Δlead null's mean is itself negative (−0.046351), i.e. under permutation
the failure-minus-intact difference is already negative. The observed −0.055114
is well inside that interval. The negative Δ is therefore a property of the two
populations' marginals, not of their pairing, and it too carries no
failure-specificity.

Under the pre-registered rule, `!failureAboveNull` is checked before the ΔLead
condition, so this branch alone decides the classification.

## 10. Lead-mass analysis

Recorded per state (`probe-results.json`, `targetStates[].leadMass`), all 13
K2 entries individually.

| quantity | range over the 11 failure states |
| --- | --- |
| bare-lead mass (K1) | 9.05e−3 … 9.999e−1 |
| multi-byte character-start mass (K2) | 1.74e−5 … 7.745e−1 |
| character-start mass (K1+K2) | 1.398e−2 … 9.999e−1 |
| projected mass on the continuation axis | 1.332e−2 … 9.989e−1 |
| **projected fraction of the character-start mass** | **0.9381 … 0.9998** |
| positive-weight legs | **51 of 51 at every state** |

Phase 104 reported the projection as mass-starved: the projected mass there was
1.7e−5 … 0.070 and the character-start mass was almost entirely bare-lead. The
complete definition cures the starvation — the projected fraction is now
0.94–1.00 at every state, so the continuation axis carries essentially the
whole character-start mass.

Two findings matter for interpretation:

- **The character-start mass remains overwhelmingly bare-lead.** The multi-byte
  mass exceeds the bare-lead mass in only 2 of 11 states (`A/machine learning
  is#15` at 0.7196 vs 0.0115, and `B94/机器学习是#2` at 0.7745 vs 0.1580); the
  bare-lead mass is ≥ 0.81 in 8 of 11 (> 0.95 in 7). The multi-byte
  character-start entries are not where the S0 character-start mass lives.
- **All 51 legal leads carry positive S0 mass at every failure state.** The
  lead-conditioned projection is therefore a mixture over the *entire* legal
  lead alphabet, not over a few salient leads. That is why it behaves like a
  smoothed, lead-marginalised next-byte distribution rather than a state
  readout, and it is the proximate cause of the fatal-byte demotion in §6.

## 11. Vocabulary-only control

Model-free by construction, and verified so structurally: the instrument module
imports no model, calls no `model.forward`, and uses no `Math.random` or
`setTimeout`. Two synthetic projections are built from the census alone and
correlated against the same P0 slices:

| control | failure mean rho | intact mean rho | reaches observed failure mean? |
| --- | --- | --- | --- |
| `census-indicator` (1 on B11, 0 elsewhere) | −0.040457 | 0.022889 | **no** |
| `census-uniform-13` (13 K2 at 1/13, summed per byte) | −0.039439 | 0.023812 | **no** |

The zero-information pipeline control returns rho 0 with zero rank variance,
and 8/8 synthetic instrument controls with analytically known rho pass.

**The vocabulary-only control did not produce the observed relationship,** and
the classification below is therefore *not* driven by this branch. The
pre-registered `reproducesObserved` override (a model-free control reaching the
observed mean forces classification C) exists and was fixed in advance, but it
did not fire.

That the relationship is not reproduced by vocabulary support alone is worth
stating precisely, because it is the one claim in this phase that comes out
*for* the model: the model's own lead-conditioned continuation structure is
what produces the positive failure value, not the mere shape of the census.
It is simply not specific to failure.

## 12. Historical exploratory comparison

§15 required the Phase-104 variant to be re-run only as a declared historical
field, never promoted to primary.

| key | value |
| --- | --- |
| Phase-104 recorded `lead-conditioned` (failure mean) | 0.0972943722943723 |
| Phase-105 `lead-conditioned-bare` (failure mean) | 0.0972943722943723 |
| per-state maximum absolute difference | **0** on all 11 states |
| Phase-105 `lead-conditioned-bare` (intact mean) | 0.15970804988662127 |
| Phase-103 identity baseline (the only threshold) | 0.04105894105894106 |

The exploratory value reproduces digit for digit, which is the evidence that
the leg machinery is the same one Phase 104 measured. It was **not** used as a
threshold, a target, or the primary statistic. The primary is `complete`
(0.084686), and the verdict does not depend on the choice: `bare` gives the
same sign of ΔLead with the same order of magnitude, and the same failure
mean below its own null's neighbourhood while the intact mean is far above it.

The historical variant was demoted **by the pre-registered definition**, before
it was re-measured — not after seeing a result.

## 13. Mechanistic interpretation

The failure population's lead-conditioned relationship is **not zero**. It is
+0.0847, notably above the Phase-103 identity baseline of 0.0411. But:

1. It does **not** clear its own permutation null (0.0847 vs an upper quantile
   of 0.0924), and the null's mean is already +0.0075.
2. Its intact counterpart is **larger** (0.1398), and that one *does* clear its
   null. 61.9 % of individual intact states exceed the failure mean.
3. Every one of the five declared projections shows the same negative ΔLead.
4. ΔLead does not clear its own null, whose mean is already negative.
5. At the level of the one byte that matters, the projection makes things
   *worse*: the fatal continuation byte is P0 rank ≤ 3 in 9/11 states (mean
   rank 2.82) and the projection ranks it at mean 35.27 (median 34), improving
   it in **0 of 11** states.
6. The mechanism is visible in §10: all 51 legal leads carry positive mass at
   every state, so the projection is a near-uniform mixture over the whole lead
   alphabet. Marginalising over 51 leads whose next-byte distributions differ
   little washes out precisely the state-specific structure that makes the P0
   distribution rank the fatal byte first.

Read together, the projection is a **general, vocabulary-and-model-induced
structure that is present at least as strongly in healthy states, and it
actively demotes the failing byte**. Its positive failure value is real but
carries no information about failure. That is H105-B in substance.

The pre-registered decision rule nevertheless returns **C**, because it tests
`!failureAboveNull` before the ΔLead condition and the failure mean does not
clear its own null. H105-B's gate (failure above baseline **and** above its own
null, but ΔLead not above its null) is unreachable once the failure mean fails
its null. The mechanically correct summary is therefore: **classification C,
with the evidence pattern of B** — "a projection artifact that is nonetheless a
real, general structure rather than an absence of signal". §14 records this
rule-ordering as a limitation rather than papering over it.

## 14. Limitations

- **Rule ordering.** As above, the pre-registered rule returns C on
  `!failureAboveNull` before it can reach B. The mechanism reading of §13 is
  B-like; the classification is C. Both are reported.
- **Small failure population.** n = 11. Sign consistency 0.727 is 8/11 — one
  state flips it to 0.636 or 0.818. No per-state claim rests on the aggregate;
  the fatal-byte-rank result (0/11 improved) is a count, not a mean.
- **No pre-registered null for the secondary metrics.** Pearson, Pearson-over-log
  and top-k overlap are recorded as §7 requires, but they have no null of their
  own and were not used to decide anything. The Pearson-over-log mean (+0.081)
  is close to the primary; it cannot overturn a pre-registered statistic, but it
  is not independently refuted here.
- **Multiple comparisons across the five declared variants.** They were
  declared in advance and all five agree, which is the relevant protection, but
  they are not independent of one another.
- **`complete` is a definitional choice.** The direct term was included because
  Phase 104 measured mass starvation. §8 shows the choice is not load-bearing
  — all five variants agree — but the primary's value itself is
  definition-dependent, and the definition is stated in full in §5 so it can be
  challenged.
- **Lead-conditioning uses the S0 distribution's own weights**, not the token
  the model would sample. That is deliberate (it is a projection, not a
  rollout) but it is what makes the mixture nearly uniform, and it is the reason
  the projection cannot represent a boundary preference that only one lead
  would exercise.
- **Instrument deviations, all after the fact.** §1 discloses three: the
  vacuous first-run gate, the leg-caching refactor, and the `massIdentity`
  correction. The first two are covered by the 13-leaf diff; the third is
  covered by a suite contract that re-derives the pre-change verdict from the
  artifact's own fields. In all three cases the artifacts were produced before
  the change and are unchanged by it.
- **The suite's first version had six failing assertions of its own** (a hex
  key format, the `massIdentity` formula above, a `Δlead` expectation that
  assumed reversal negates Spearman under ties, and three source scans that
  matched the phase's own prose about the prohibited APIs). None of them
  touched the probe or the artifacts; each is described where it was fixed
  rather than silently relaxed. The source scans now strip comments and string
  bodies and require a call parenthesis, and a self-test asserts the scan still
  fires on a real call — so the fix tightened the check rather than loosening
  it.
- **One cross-phase regression, caught by the aggregate suite and fixed.**
  Phase 105's own "the probe applies no mask to any logit" assertion spelled
  out Phase 102's mask symbol names as a literal, and Phase 102's frozen
  contract forbids those symbols from appearing anywhere outside
  `experiments/phase102` — including inside another test file. The probe and
  the instrument were never implicated; only the test's own text tripped it.
  The pattern is now assembled from fragments so the file can search for the
  symbols without containing them. Phase 102's suite returns to 208/0 and
  Phase 102's test file was not modified to accommodate this — the fix is
  entirely on Phase 105's side. This is the second instance of the same
  mistake in this phase (a scan matching a *name* rather than a *use*), and it
  is why both scans now carry a self-test.
- **Run duration** 3065 s for the first run, 957 s after caching (3.2×). No
  effect on any measurement — the diff of §1 proves it.

## 15. What is NOT proven

- It is **not** proven that the character-start representation is unrelated to
  the corruption. What is refuted is that *this* projection family expresses it.
  A boundary preference that only one or two leads would exercise is invisible
  to a mixture over all 51.
- It is **not** proven that no positive failure-specific effect exists. The
  observed failure mean is positive (+0.0847) and the study had 11 states; the
  claim is that it does not clear its null and is exceeded by the intact
  population, not that it is exactly zero.
- It is **not** proven that the vocabulary's 13 multi-byte character-start
  entries are irrelevant. The census is 13 of 300 entries and §10 shows the
  character-start mass is bare-lead dominated; the census supports no mechanism
  claim either way.
- It is **not** proven that the fatal byte's demotion *causes* the failure. The
  demotion is a property of the projection. Whether restoring the byte's rank
  would prevent the failure is a generation-time question this read-only phase
  did not and could not test.
- It is **not** proven that the intact states "have the mechanism better". They
  show a larger lead-conditioned rho against their own P0 distributions; no
  claim is made that this is a competence signal.
- Phase 104's refutation of the preceding-boundary continuation preference
  stands unchanged. Phase 105 removes the one positive exploratory number that
  survived it.

## 16. Phase-106 recommendation

Exactly one next falsifiable hypothesis:

> **H106 — lead dilution.** The demotion of the fatal continuation byte from P0
> rank ≈ 1 to lead-conditioned rank ≈ 35 (§6, §10) is caused by marginalising
> over all 51 legal leads with near-uniform weights. **Falsifier:** conditioning
> the projection on the *single* legal lead that the state's own S0 distribution
> ranks first — weight 1 on that leg and 0 on the other 50, no other change —
> restores the fatal byte's projected rank into the top quartile in a majority
> of the 11 failure states. If it does not, dilution is not the mechanism and
> **no** lead-conditioned projection of this family can represent the P0
> boundary preference, which closes the family rather than the question.

This is read-only, uses the exact frozen evidence chain, needs no new
checkpoints, and — because Phase 105's artifact already records every leg's
slice and weight per state — needs no new model forward passes beyond the S0
replay gate. Its outcome is decidable in both directions.

## 17. Final conclusion

**Classification: C — Projection artifact / unsupported.** (Evidence pattern:
**B** — general structure, not failure-specific.)

The Phase-104 `+0.0973` is real and reproduces exactly, and Phase 105's
rigorous definition raises the failure mean to +0.084686 on a projection that
now carries 94–100 % of the character-start mass instead of being starved. It
is nevertheless **not** a failure effect. It fails its own pre-registered
permutation null (0.0847 vs a 97.5 % upper quantile of 0.0924, against a null
mean of 0.0075); the intact control exceeds it (0.1398, clearing its own null);
the failure-minus-intact difference is negative for all five declared variants
and does not clear its own null; and at byte level the projection improves the
rank of the fatal continuation byte in 0 of 11 states, moving it from a mean P0
rank of 2.82 to a mean projected rank of 35.27.

The mechanism is the mixture. All 51 legal leads carry positive S0 mass at
every failure state, so the projection is a near-uniform average over the whole
lead alphabet, which washes out exactly the state-specific structure that makes
P0 rank the fatal byte first. The vocabulary-only controls confirm the
relationship is not mere census shape — it is a genuine, general,
model-and-vocabulary-induced structure, present at least as strongly in healthy
states.

Phase 104 refuted the preceding-boundary continuation preference and left
`+0.0973` standing. Phase 105 explains it: it is a general property of the
character-start representation that is, if anything, *less* present in the
failure states, and it points away from the failing byte rather than toward it.
H106 asks whether restricting the mixture to the single lead the state would
actually emit restores the byte's rank — the one remaining way this projection
family could still be about boundaries.

**Training: `NOT RUN`.**
**Commit: `NOT COMMITTED`.**
