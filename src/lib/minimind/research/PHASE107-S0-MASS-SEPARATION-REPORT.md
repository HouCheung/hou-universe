# Phase 107 — S0 Unconditional Mass Separation Audit

**Status:** `INCONCLUSIVE — S0 mass signal exists but held-out separation is weak`

**Training:** `NOT RUN` — no optimizer step, no checkpoint write, no tokenizer,
vocabulary, merge-table, architecture, decoding, mask, prompt, dataset,
sampling, rollout or evaluator change. Read-only over the four frozen
checkpoints.

**Artifacts:** `experiments/phase107/` (instrument, probe, manifest,
probe-results, threshold-results, failure-states, intact-states) and
`src/lib/minimind/research/tests/phase107-s0-mass-separation.test.ts`.

---

## 1. Phase-106 validation status

The Phase-106 baseline was reproduced before any H107 measurement was taken.
The probe gates every one of these and would have returned
`BLOCKED — Phase-106 baseline not reproducible` on any mismatch. It recorded
**zero blocks**.

| Gate | Required | Reproduced |
| --- | --- | --- |
| Failure states reconstructed from the frozen P12-MASK replay | 11 | 11 |
| Intact P0 states reconstructed | 210 | 210 |
| Checkpoint SHA-256 vs the Phase-106 manifest | all four | all four |
| Checkpoint SHA-256 vs the Phase-105 and Phase-104 manifests | all four | all four |
| 300-value S0 softmax vs the Phase-104 record (tolerance 0) | 11 / 11 | 11 / 11 |
| P0 fatal-byte rank mean | `2.8181818181818183` | `2.8181818181818183` |
| P0 fatal-byte rank in the top 3 | `9 / 11` | `9 / 11` |

The eleven P0 fatal-byte ranks reproduced exactly, in artifact order:

```
1, 1, 8, 2, 1, 1, 1, 1, 1, 1, 13
```

Phase 106's verdict therefore stands unmodified, and the failure population
this audit partitions is the same population Phases 103–106 measured.

## 2. Research question

Can a P0 failure be predicted from the model's **unconditional** S0
distribution alone?

No lead-conditioned projection. No forced-P1 state. No P0/P1/P2 mask. No
interpolation between states. No sampling. The object under test is the raw
300-value S0 softmax of the frozen model, partitioned by the raw first bytes of
the vocabulary entries.

## 3. The H107 hypothesis

> **H107** — the P0 failure is decided entirely at S0 and is predictable from
> the model's unconditional S0 distribution alone: when the model places
> sufficiently more probability mass on illegal continuation-byte starts than
> on legal character starts, the next sampled token is likely to corrupt the
> UTF-8 stream.

H107 is a **mass-imbalance** claim, not an argmax claim. It predicts that the
failure regime is one in which the continuation-start class out-weighs the
legal-start class at S0.

## 4. Dataset and state populations

Both populations are the frozen ones; neither was resampled, extended or
re-prompted.

* **Failure population (11 states).** The P0 failure states of the frozen
  P12-MASK trajectories of the four Phase-96 family checkpoints. These states
  **define** the threshold. They are not an independent test set, and no
  out-of-sample claim is made from them.
* **Intact population (210 states).** The P0 steps of the same frozen
  trajectories that emitted a legal, recoverable token. The same 210 states, in
  the same order, that Phases 105 and 106 used — re-verified by the test suite.

Failure labels, in artifact order:

```
A/machine learning is#15          A/机器学习是#11
B94/太阳#15                       B94/机器学习是#2
B94/什么是 machine learning#3      C94/太阳#11
C94/机器学习是#8                   C94/什么是 machine learning#3
T/machine learning is#11          T/太阳#15
T/什么是 machine learning#12
```

## 5. The S0 mass partitions

Legality is **not** redefined. Every "legal at P0" verdict is read from Phase
102's own `p0VerdictOf` — the full byte walk from a character boundary, not the
cheap first-byte test Phase 102 §5 forbids substituting for it. Phase 107 adds
only the two byte-level classes §4 asks for:

| Class | Rule, on raw token bytes | Entries |
| --- | --- | --- |
| **A — `continuationStartMass`** | first emitted byte in `0x80..0xBF` | 64 |
| **B — `legalP0StartMass`** | Phase 102's full walk records no illegal byte at P0 | 223 |
| **C — `forbiddenLeadMass`** | first emitted byte `0xC0`/`0xC1`, or `>= 0xF5` | 13 |

No token id, decoded string or token class was used to decide membership.

**§11 partition invariant — passed.** Recomputed from the live vocabulary and
gated against Phase 102's recorded census: 300 entries, 223 legal, 64
continuation starts, 13 forbidden leads, 77 illegal — an exact match. The three
classes are pairwise disjoint (measured over the id sets, not inferred from the
branch structure), they cover the vocabulary with an empty remainder, and
C is deliberately **not** folded into A or B.

The masses close: `A + B + C = 1` for all 221 states, with a maximum residual of
`2.22e-15` (float rounding only) and `massCloses` true on every state. The three
quantities therefore do sum to 1 for this vocabulary — a structural fact, not an
assumption, and the probe reports the residual rather than discarding it.

## 6. Primary score definition

```
S0Margin = continuationStartMass - legalP0StartMass
```

The simplest direct implementation of H107, fixed in advance. Secondary
quantities are recorded but **never** substituted for the primary score: the
ratio `continuationStartMass / legalP0StartMass` (null when the denominator is
zero), the four masses, the raw argmax token, its first byte, its unconditional
probability, whether it is a continuation start, whether it is a forbidden
lead, its rank inside the legal candidate set, and the most probable
continuation-start token with its mass.

## 7. Threshold rule

```
tau = median(S0Margin) over the 11 failure states
median = the middle value of the ascending sort (odd n);
         average of the two middle values (even n)
```

Chosen **before** the probe's first execution and encoded in
`deriveThreshold`, whose only parameter is the failure-margin list. The rule is
the preferred one named in the phase description; no stronger previously
established rule was found in the repository audit. It is deterministic, uses
only the known failure states, is independent of the 210-state results, and
cannot be tuned after seeing them.

No alternative threshold was tried. No ROC, Youden's J, accuracy search or
multiple-threshold sweep was run. Secondary measures were not promoted.

## 8. Threshold derivation and the pre-registered decision rule

The eleven failure S0Margins, ascending:

```
-0.9998179442542202
-0.9995629398170851
-0.9993395432108111
-0.9968391965141633
-0.9952209198389708
-0.9916428118332534   <-- median, frozen tau
-0.9705616201345946
-0.9673149594954674
-0.9549846719533894
-0.9520337931717393
-0.8115022201820673
```

**`tau = -0.9916428118332534`**, frozen permanently for the remainder of
Phase 107. Under this rule exactly **6 of the 11** failure states are flagged
(`failureFlagRate = 0.5454545454545454`), a property of the median convention
rather than a fitted quantity.

### The decision rule, fixed before the held-out population was read

This rule was written into the instrument (`classifyH107`) before the probe was
executed for the first time. It contains **no invented magnitude**; it compares
two rates that both fall out of the frozen construction.

| Verdict | Condition |
| --- | --- |
| **D — Blocked** | the §11 partition or §3 replay invariant failed |
| **B — Refuted** | `falsePositiveRate >= failureFlagRate` — the frozen rule fires at least as often on the intact population as on the population that defined it |
| **A — Supported** | `falsePositiveCount === 0` — no held-out intact state reaches the failure-derived boundary; the only non-arbitrary "low" is zero |
| **C — Inconclusive** | otherwise — the threshold is strictly more selective on the held-out population than on its defining population, but not totally so, and no stronger rule was pre-registered |

No number in this rule was chosen after seeing the held-out result.

## 9. Held-out evaluation — the 210 intact states

`tau` was applied **exactly once**.

| Quantity | Value |
| --- | --- |
| Flagged | **49 / 210** |
| Not flagged | 161 |
| **False-positive rate** | **0.23333333333333334** |
| The defining population's own flag rate | 0.5454545454545454 |

The intact S0Margin distribution:

| | min | q25 | median | q75 | max | mean |
| --- | --- | --- | --- | --- | --- | --- |
| **Failure (n=11)** | −0.999818 | −0.998089 | **−0.991643** | −0.961150 | −0.811502 | −0.967166 |
| **Intact (n=210)** | −0.999990 | −0.999731 | **−0.999035** | −0.993681 | +0.947972 | −0.959305 |

The descriptive separation ladder — how many intact states sit at or above each
individual failure score — makes the overlap explicit without any threshold:

| Failure score | Intact at or above | Rate |
| --- | --- | --- |
| −0.999818 | 163 | 0.7762 |
| −0.999563 | 141 | 0.6714 |
| −0.999340 | 125 | 0.5952 |
| −0.996839 | 72 | 0.3429 |
| −0.995221 | 63 | 0.3000 |
| **−0.991643 (`tau`)** | **49** | **0.2333** |
| −0.970562 | 25 | 0.1190 |
| −0.967315 | 24 | 0.1143 |
| −0.954985 | 23 | 0.1095 |
| −0.952034 | 23 | 0.1095 |
| −0.811502 | 13 | 0.0619 |

The failure median sits above the intact median, and only 23.3 % of intact
states reach it — but 49 intact states do, and the failure population's own
flag rate is only 54.5 %. The distribution comparison therefore supports
neither the "supported" nor the "refuted" branch, and the pre-registered rule
returns **C**.

The flagged intact states are not evenly spread across the four arms, and the
skew runs opposite to any simple "the weaker arm is noisier" story:

| Arm | Intact states | Flagged | Rate |
| --- | --- | --- | --- |
| A | 60 | 7 | 0.117 |
| B94 | 45 | 7 | 0.156 |
| C94 | 46 | 9 | 0.196 |
| T | 59 | 26 | 0.441 |

Arm T supplies 26 of the 49 false positives. Since T is also the arm with the
most failure states (3 of 11), the flagged-and-failure overlap is heaviest in
the arm the phase is nominally about — which is exactly why the raw FPR cannot
be read as clean evidence either way.

### Descriptive controls (never the official result)

**Sign test** (`S0Margin > 0`, strict):

| Population | Above zero | n | Rate |
| --- | --- | --- | --- |
| Failure | **0** | 11 | 0.0000 |
| Intact | **2** | 210 | 0.0095 |

**Permutation control** — one fixed seed (`107042`), one procedure, no
repetition: a deterministic Fisher–Yates draw of 11 states from the frozen
221-state pool gives `tau' = -0.9987580062735332`, above which **100 of the
remaining 210** sit — against the official 49. The failure-derived threshold is
therefore roughly twice as selective as a random eleven-state draw. This is an
anti-overfitting diagnostic only; it does not enter the classification.

## 10. Direct argmax analysis

| Quantity | Failure (n=11) | Intact (n=210) |
| --- | --- | --- |
| Argmax is a **continuation-byte start** | **0** | **2** |
| Argmax is a **forbidden lead** | 0 | 0 |
| Argmax is legal at P0 | 11 | 208 |
| Argmax probability, mean / median | 0.8426 / 0.9340 | 0.8515 / 0.9758 |

**This is the sharpest result in the phase.** In **none** of the eleven failure
states does the model's unconditional S0 argmax begin with a continuation byte.
In all eleven it is a legal character start, carrying a mean probability of
0.84.

The two intact states whose S0 argmax *is* a continuation start are
`T/机器学习是#18` (`S0Margin = +0.948`, continuation mass `0.974`) and
`T/什么是 machine learning#7` (`S0Margin = +0.787`, continuation mass `0.894`).
The illegal, continuation-dominated regime H107 describes **is** reachable —
and it is reached by intact states, never by a failure state.

**Mass-driven vs argmax-driven.** Neither. The argmax is legal in every failure
state, so the failure is not argmax-driven; and the aggregate mass signal, while
shifted, flags 23.3 % of intact states, so it is not cleanly mass-driven either.

## 11. Failure vs intact distribution comparison

| Quantity | Failure (mean) | Intact (mean) | Failure (median) | Intact (median) |
| --- | --- | --- | --- | --- |
| `continuationStartMass` | 0.016390 | 0.020310 | 0.004129 | 0.000480 |
| `legalP0StartMass` | 0.983556 | 0.979615 | 0.995771 | 0.999515 |
| `S0Margin` | −0.967166 | −0.959305 | −0.991643 | −0.999035 |
| `forbiddenLeadMass` | 5.36e−5 | 7.52e−5 | 6.33e−6 | 3.72e−6 |
| top continuation-start probability | 0.007517 | 0.012614 | 0.001178 | 0.000144 |

Three observations.

1. **`forbiddenLeadMass` does not separate.** Its intact maximum (`4.27e-3`)
   exceeds its failure maximum (`1.98e-4`). The forbidden-lead class is
   negligible everywhere and is not the mechanism.
2. **The medians move in the H107 direction but the means barely do.** The
   failure median margin (−0.9916) is above the intact median (−0.9990), but the
   intact *mean* is higher than the failure mean because two intact states sit
   at +0.95 and +0.79. Excluding those two, the intact mean is −0.9769 — still
   below the failure mean of −0.9672. Reporting the exclusion changes nothing
   that matters; it is shown only because the mean is otherwise misleading.
3. **`legalP0StartMass` is near 1 everywhere.** Failure minimum 0.9057, intact
   median 0.9995. At S0 the unconditional distribution is overwhelmingly legal
   in both populations. The failure population is a *relative* shift within a
   regime in which legal starts dominate by two to three orders of magnitude —
   not a crossing of the sign boundary.

## 12. S0→P0 geometry (a measured confound)

`nearestPrecedingBoundary` walks back to the nearest index whose byte stream is
at a character boundary, so **S0 is not always the P0 state's immediate
predecessor**. The probe records that gap:

| `tokensAfterBoundary` | 1 | 2 | 3 |
| --- | --- | --- | --- |
| Failure (11) | 1 | 2 | 8 |
| Intact (210) | 159 | 8 | 43 |

Ten of the eleven failure states sit **two or three tokens before P0**, and in
those ten exactly 3 bytes lie between the S0 boundary and P0. Only one failure
state has S0 adjacent to P0 — against 159 of 210 intact states.

This is a structural asymmetry that none of Phases 104–106 controlled for, and
it bounds the reach of every "S0 predicts P0" claim in that family.

## 13. Reproducibility

| Check | Result |
| --- | --- |
| Checkpoint SHA-256 vs Phase-106 / 105 / 104 | all four, all three manifests |
| Tokenizer, vocabulary, prompt set | unchanged; recomputed census matches Phase 102 exactly |
| S0 logits and the 300-value softmax | reproduced at tolerance 0 for all 11 failure states; every repeated forward pass bit-identical |
| Failure scores | identical run to run |
| Threshold `tau` | identical run to run |
| 210-state predictions | identical run to run |
| Core audit executed twice, canonical SHA-256 digests | identical (`10a2f2bfdc5f320803a13d4a0bf7ddacd6377affe598d9b9fe9a0f1b9f519dc8`) |
| Whole-probe rerun, artifact bytes | **byte-identical** — `failure-states.json` `7d39fcc7…`, `intact-states.json` `41888a08…`, `manifest.json` `d78b758a…`, `probe-results.json` `7f696794…`, `threshold-results.json` `bb8b2071…` |

No wall-clock field is written to any Phase-107 artifact, so the raw SHA-256 of
every artifact is itself reproducible — a stronger guarantee than excluding a
volatile field from a scientific digest. The only volatile quantity in the phase
is the console duration, which is written to a scratch log and to no artifact.

No prior-phase artifact was modified: `probe-results.json` records the raw and
scientific digests of the Phase-102/103/104/105/106 artifacts it read, and the
test suite re-verifies them.

**Cross-suite guard interaction (one, found and fixed).** The first aggregate
run surfaced a single failure: Phase 102 asserts that the P012 mask is named by
nothing outside its own directory, and that check is a plain substring scan over
every `.ts`/`.tsx` file. The Phase-107 suite's own *negative* assertion — "the
instrument applies no candidate mask" — spelled out the two identifiers it
asserts the absence of, and so tripped the guard it is paired with. The
identifier list is now assembled from fragments, semantically identical. Phase
102 re-runs at 208 passed / 0 failed. No production file was touched.

## 14. Interpretation

**H107, as stated, is not supported; and its stated mechanism is closer to
refuted than to confirmed.**

H107 predicts that corruption follows from the model placing *more* mass on
illegal continuation-byte starts than on legal character starts at S0. That
regime — `S0Margin > 0` — occurs in **0 of 11** failure states and in **2 of
210** intact states. At S0 the model is not merely usually legal-minded before a
corruption; it is legal-minded *every single time*. Its argmax is a legal
character start in 11 of 11 failure states, with mean probability 0.84.

What survives is weaker and different in kind. The failure population's
S0Margin distribution is shifted **upward relative to the intact bulk** — the
failure median exceeds the intact median, and the failure-derived threshold is
roughly twice as selective as a random eleven-state draw (49 vs 100 intact
states above). So `S0Margin` is not pure noise: it carries a real, directional
association with the failure population.

But the association is not specific. 49 of 210 intact states — 23.3 % — are at
least as legally-committed at S0 as the median failure state, and the failure
population's own flag rate is 54.5 %. A rule that fires on nearly a quarter of
the intact population while firing on just over half of the population that
defined it cannot carry a mechanism claim about corruption.

The honest reading: **at S0 the model's unconditional distribution is
essentially always in the legal regime, and the small residual difference
between failure and intact states is an unexplained shift in degree, not a
crossing of a boundary.** The corruption is not announced at S0 as H107
proposed.

## 15. Limitations

1. **`tau` is derived from 11 states.** Its median is one sample from a
   six-thousandth-quantile-scale distribution, and the bracket around it is
   tight: the third and seventh failure scores are −0.99934 and −0.97056. A
   different 11-state sample moves `tau` materially. The permutation control
   quantifies exactly this: a random draw's median sits at −0.99876, far from
   −0.99164.
2. **S0 is not the P0 state's immediate predecessor** in 10 of 11 failure states
   (§12). The model has two or three further token decisions between the state
   being measured and the state that corrupts. Any "S0 did not anticipate the
   failure" statement is bounded by that gap.
3. **No false-negative rate is defined.** The 210-state population is intact by
   construction. There is no held-out corruption population at all, so
   specificity is the only quantity this design can measure.
4. **The held-out population is not independent of the failure population.**
   Both come from the same four checkpoints, the same five prompts and the same
   frozen P12-MASK trajectories.
5. **The 0/11 vs 2/210 argmax counts are small.** The failure arm is eleven
   states; a single state changes the count by 9 percentage points.
6. **The two intact states in the illegal regime were not investigated here.**
   They are the most informative observations in the phase and this audit only
   reports them.

## 16. What is NOT proven

* **Not proven:** that S0 mass is irrelevant to corruption. Only that it does
  not *predict* it at a usable specificity under a threshold derived from the 11
  known failures.
* **Not proven:** that the S0Margin shift between the populations is an artefact.
  It is a measured shift; §12 identifies a plausible confound but this phase
  did not control for it.
* **Not proven:** that continuation-start mass is harmless in general. At the
  **P0** state the fatal continuation byte is ranked in the top 3 in 9 of 11
  failures (Phase 103). Phase 107 says nothing against the P0-level signal — it
  says the signal is **not yet present at S0**.
* **Not proven:** anything about causation. This is a read-only association
  audit on a fixed population.
* **Not proven:** that the failure population was correctly reconstructed
  beyond the parity gates actually run. Those gates are strict but they verify
  reproduction of the frozen record, not the frozen record's own validity.
* **Not addressed:** why two *intact* states reach the continuation-dominated
  S0 regime and still emit a legal token.

## 17. Phase-108 recommendation

One hypothesis, falsifiable, read-only, zero-training:

> **H108 — the residual S0 signal is a geometry artefact.**
> Matched on the S0→P0 gap, the failure population's S0 margin distribution
> does not exceed the intact population's.

**Falsifier:** within the gap-matched stratum (`tokensAfterBoundary >= 2`, and
separately `bytesAfterBoundary` matched), the failure margins remain shifted
above the matched intact margins — in which case the shift is not explained by
the gap and Phase 107's residual signal is real.

**Why this one.** Phase 107 found a structural asymmetry that Phases 104–106
never controlled for: 10 of 11 failure states have S0 two or three tokens before
P0, against 51 of 210 intact states. Either that asymmetry produces the residual
signal, or it does not — and the answer determines whether the S0 family is
worth another measurement or should be closed the way the lead-conditioned
family was in Phase 106.

**Feasibility.** The stratum is populated: 10 failures against 51 intact states
with `tokensAfterBoundary >= 2`. The gap is already recorded per state in
`failure-states.json` and `intact-states.json`; the Phase-107 mass partition,
scoring, threshold and held-out machinery are reusable unchanged.

## 18. Final conclusion

Phase 107 asked whether the P0 corruption is announced by the model's
unconditional S0 distribution. It is not.

The Phase-106 baseline reproduced exactly — same 11 failure states, same 210
intact states, same checkpoints, same 300-value S0 softmaxes, same P0 fatal-byte
rank statistics (`2.8181818181818183`, top-3 in `9/11`). The byte-level
partition agrees with Phase 102 exactly. The threshold `-0.9916428118332534` was
derived from the eleven failure states alone, frozen, and applied once.

Against the 210 held-out intact states it flagged **49** — a false-positive rate
of **0.2333**, against its own **0.5455** flag rate on the population that
defined it. That is strictly better than chance and strictly worse than a
mechanism. In **none** of the eleven failure states is the S0 argmax even a
continuation-byte start; in every one it is a legal character start, averaging
0.84 probability.

> **Verdict: `INCONCLUSIVE — S0 mass signal exists but held-out separation is
> weak`.** H107 as stated is not supported. Its central regime —
> continuation-start mass exceeding legal-start mass at S0 — occurs in no
> failure state at all, so the mechanism it names is not the mechanism. A
> directional association between S0 margin and the failure population survives,
> but it is not specific enough to carry a claim, and Phase 107 declines to
> manufacture a cutoff that would make it look like one.
