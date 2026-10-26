# Phase 109 — Single-State Residual Robustness Audit

**Verdict: `A — Single-state effect supported`**
**Training: NOT RUN. Read-only. No checkpoint, tokenizer, vocabulary, merge rule, architecture, generation, evaluator, prompt, dataset, sampling, rollout or Phase-95 threshold was modified.**

---

## 1. Phase-108 final validation

Phase 108 closed with `C — Inconclusive`, and its final classification is restated
here unchanged, because Phase 109 is only meaningful if that baseline is real:

| Phase 108 field | Recorded value |
| --- | --- |
| Classification | `C — Inconclusive` |
| Matched failure states | 10 |
| Distinct matched intact controls | 51 |
| Primary statistic (matched median delta), n = 10 | `0.0030208448733220483` |
| Matched mean delta, n = 10 | `0.026435280108252367` |
| Positive / negative / zero | `5 / 5 / 0` |
| Permutation seed × count | `108042 × 20000` |
| Permutation p-value | `0.3094345282735863` |
| Permutation tail count (draws ≥ observed) | `6188` |
| Null median-of-medians | `0.00042281789230708133` |
| Null interval | `[-0.007491419293104484, 0.16784687712004265]` |
| Random-label control (seed `108911`) median delta | `-0.0014690204141051821` |
| Random-label control stratum | 4 failures / 57 intact |

Phase 108's own wording was that the matched populations share the same byte
geometry (`3 bytes / 1 complete character`) and that the positive median was
carried by one state. Phase 108 proposed exactly one successor hypothesis — that
the residual is a **single-state effect** — and this audit executes it.

## 2. H109 research question

> Does the residual positive matched effect from Phase 108 depend materially on
> one extreme failure state?

The question is **not** "can another significant subset be found". Phase 109 is a
robustness test of a pre-registered leave-one-out rule, not a new effect search.
No subset was searched, no alternative stratum was tried, and no second state was
removed.

## 3. Pre-registered removal rule

Frozen in `experiments/phase109/single-state-robustness-audit.ts` **before** the
Phase-108 deltas were re-read:

* **Selection rule** — `argmax(delta among the Phase-108 matched failure states)`.
  Nothing else. The rule is *not* arm-conditioned, prompt-conditioned,
  geometry-conditioned or semantics-conditioned.
* **Tie-break** — `lexicographic (armKey, label), ascending, first wins`. Declared
  in advance and recorded as *used* or *unused*. No tie-break was invented after
  seeing the data.
* **Removals** — `MAX_STATE_REMOVALS = 1`. Removing a second state, or a top-2 or
  bottom-1 set, is a different experiment.
* **Minimum** — `MIN_REMAINING_FAILURES = 7`. Below that the outcome is
  underpowered by construction, not by result.

## 4. Phase-108 reproduction

The probe rebuilds both frozen populations from `experiments/phase107/failure-states.json`
and `experiments/phase107/intact-states.json`, and **re-derives** every state's
`S0Margin` from the artifact's own 300-value S0 softmax through the Phase-107
byte-legality partition rather than trusting the stored field.

| Reproduction check | Result |
| --- | --- |
| Populations | 11 failures / 210 intact (required 11 / 210) |
| Re-derived `S0Margin`, max abs diff | `0` |
| Re-derived partition masses, max abs diff | `0` |
| Pre-registered stratum `tokensAfterBoundary >= 2` | 10 failures / 51 intact |
| Failure gap histogram | `{"1":1,"2":2,"3":8}` → 10 |
| Intact gap histogram | `{"1":159,"2":8,"3":43}` → 51 |
| Exact-gap matching | retained 10/10 against 51 distinct controls |
| Fallback (±1) | **not used** |
| Match order vs Phase-108 artifact | preserved |
| All 10 matched deltas by label, tolerance 0 | reproduced |
| Matched median / mean | `0.0030208448733220483` / `0.026435280108252367` — both reproduced |
| Sign counts | `5 / 5 / 0` — reproduced |
| Permutation null (seed 108042, 20000 draws) | p `0.3094345282735863`, tail `6188`, null median `0.00042281789230708133`, interval reproduced |
| Random-label control (seed 108911) | draw, stratum `4/57` and median `-0.0014690204141051821` reproduced |
| Checkpoints | all four carry the Phase-108 sha256 |

**The §3 gate passed exactly.** No `BLOCKED — Phase-108 baseline not reproducible`
condition was reached and `blocks` is empty in every Phase-109 artifact.

## 5. Removed state

One state was removed, and it was removed for one reason.

| Field | Value |
| --- | --- |
| Label | `T/machine learning is#11` |
| Checkpoint (arm) | `T` — `experiments/phase96/phase96-treatment.ckpt.json` |
| Prompt | `machine learning is` |
| S0→P0 gap | 3 tokens (`tokensAfterBoundary = 3`) |
| Failure `S0Margin` | `-0.8115022201820673` |
| Matched intact reference (median of 43 controls at gap 3) | `-0.9937296511161933` |
| Matched delta | `0.18222743093412597` |
| Match index within the Phase-108 stratum order | 8 |
| States tied at the maximum | 1 (`T/machine learning is#11`) |
| Tie-break used | **false** |

**Reason for removal: it was the maximum matched delta.** Nothing else. The state
is not described as bad, an outlier or an anomaly; those terms do not appear in
the Phase-108 artifact either, and the only reason recorded is the pre-registered
argmax rule.

The failure population therefore shrank from 11 to 10 states, and the
pre-registered stratum from 10 to 9. The gap-3 group lost one failure; the gap-2
group was untouched.

## 6. Remaining 9-state population

| Label | Gap | S0Margin | Matched reference | Delta |
| --- | --- | --- | --- | --- |
| `A/machine learning is#15` | 2 | `-0.9916428118332534` | `-0.999175770302675` | `0.007532958469421591` |
| `A/机器学习是#11` | 3 | `-0.9968391965141633` | `-0.9937296511161933` | `-0.003109545397970037` |
| `B94/太阳#15` | 3 | `-0.9998179442542202` | `-0.9937296511161933` | `-0.006088293138026946` |
| `B94/机器学习是#2` | 2 | `-0.9673149594954674` | `-0.999175770302675` | `0.031860810807207596` |
| `B94/什么是 machine learning#3` | 3 | `-0.9993395432108111` | `-0.9937296511161933` | `-0.005609892094617819` |
| `C94/太阳#11` | 3 | `-0.9520337931717393` | `-0.9937296511161933` | `0.04169585794445396` |
| `C94/机器学习是#8` | 3 | `-0.9705616201345946` | `-0.9937296511161933` | `0.023168030981598697` |
| `C94/什么是 machine learning#3` | 3 | `-0.9952209198389708` | `-0.9937296511161933` | `-0.0014912687227774946` |
| `T/太阳#15` | 3 | `-0.9995629398170851` | `-0.9937296511161933` | `-0.005833288700891837` |

The reference for every gap-3 state is the same set median, because controls are
**not consumed**: two failures at the same gap legitimately share one control set.

## 7. Matched result

Official H109 statistic: **matched median delta**.

| Field | Phase 108 (n = 10) | H109 (n = 9) |
| --- | --- | --- |
| Matched failures | 10 | 9 |
| Matched distinct controls | 51 | 51 |
| **Median delta** | `+0.0030208448733220483` | **`-0.0014912687227774946`** |
| Mean delta | `+0.026435280108252367` | `+0.009125041127599745` |
| Positive / negative / zero | `5 / 5 / 0` | `4 / 5 / 0` |
| Exact matching used | yes | yes |
| Fallback used | no | no |

The median **flipped sign** and is now negative. The mean halved but stayed
positive. The primary statistic is the median, and it is not positive, so §8's
falsifier cannot be met even before the permutation null is consulted.

## 8. Permutation null

The identical design was reused: same statistic, same permutation count, same
seed, same group-preserving label permutation, one-sided in the direction that
would support a positive residual.

| Field | Phase 108 | H109 |
| --- | --- | --- |
| Seed × permutations | `108042 × 20000` | `108042 × 20000` |
| Observed median delta | `0.0030208448733220483` | `-0.0014912687227774946` |
| Tail count (draws ≥ observed) | `6188` | `13005` |
| Exact p-value `(1+k)/(1+N)` | `0.3094345282735863` | `0.6502674866256687` |
| Null median-of-medians | `0.00042281789230708133` | `-0.0005101393314780323` |
| Null interval | `[-0.007491419293104484, 0.16784687712004265]` | `[-0.007145569036306476, 0.09488780365476168]` |

The fixed null provides **no** evidence of a positive residual after removal
(p = 0.6503). Unlike Phase 108's p = 0.3094 — which was also a non-rejection but
against a positive observed median — the H109 observed value is *below* the null's
own median, so this is not merely an underpowered positive.

## 9. Random-label control

Two records are reported, and their roles are different.

**Official (§12, the Phase-108 procedure repeated unchanged).** Shuffling the
frozen 221-state pool once with seed `108911` and relabelling the first 11 states
"failure" reproduces Phase 108 exactly: stratum 4 failures / 57 intact, matched
median delta `-0.0014690204141051821`. The control is deterministic, so repeating
it is an identity check on the frozen procedure, and it passes.

**Descriptive only (post-removal pool).** The same seed and the same draw of 11
applied to the post-removal 220-state pool gives stratum 1 pseudo-failure /
59 pseudo-intact and a matched median delta of `+0.1979442163727122`.

One wording caveat on that second record: the control's `method` field is a
frozen literal inside the Phase-108 instrument (`gap-matched-audit.ts:570`), so
it still reads "the frozen 221-state pool". Phase 109 may not edit that file
(§2.16), and the field is descriptive only. The realized counts identify the
pool unambiguously: stratum `1 + 59 = 60`, which is the Phase-108 stratum
`10 + 51 = 61` minus the one removed stratum state — i.e. 220 states, not 221.

That second number is worth reading carefully and not over-reading. With only
**one** pseudo-failure inside the stratum, the "median" is that single state's
delta, so the control statistic is essentially one draw. It is nonetheless larger
than the observed H109 median and larger than Phase 108's own maximum non-removed
delta. The control is a negative control and cannot alter the primary statistic;
it shows only that label noise at this sample size can produce displacements of
this order.

## 10. Original-vs-H109 comparison

| Shift | Value |
| --- | --- |
| Median shift | `-0.004512113596099543` |
| Mean shift | `-0.01731023898065262` |
| Sign-count shift | positive `-1`, negative `0`, zero `0` |

**Largest remaining delta:** `C94/太阳#11` with `0.04169585794445396`. This state
is reported for description only and was **not** removed — a second removal would
be an un-pre-registered experiment, and its delta is far below the removed
state's `0.18222743093412597`.

## 11. Leakage / integrity audit

The removal was selected by **one** input: the Phase-108 `FailureMatch[]` (label,
armKey, gap, margin, referenceMedian, delta).

| Channel | Used? |
| --- | --- |
| Intact control labels | **No** — 0 |
| Intact outcomes / margins | **No** — read only after the removal index was fixed |
| Prompt semantics | **No** — 0 |
| Checkpoint / arm identity | **No** — the `(armKey, label)` tie-break exists but was **not reached** |
| Second-largest state | **No** — reported descriptively only |

`leakageAudit(tieBreakUsed = false)` returns empty lists for all three channels,
and the artifact records that the intact outcome was not consulted before
deletion. The one structural channel that exists — the arm-lexicographic
tie-break — is unreachable unless two states carry exactly equal maximum deltas,
which they do not (`0.18222743093412597` is unique). The tie-break itself is
exercised in the suite on a **synthetic** tied set, so the artifact's own data
never decides whether the rule works.

Checkpoint digests, production-file digests and the prior-phase artifact digest
map were all re-verified; the frozen surface is unchanged.

## 12. Reproducibility

The probe was executed **twice**. The four scientific artifacts
(`probe-results.json`, `matching-results.json`, `removal-record.json`,
`manifest.json`) are **byte-identical** across the two runs — no volatile
wall-clock field is written, so the raw sha256 *is* the reproducible identity of
the evidence.

| Artifact | sha256 (identical on rerun) |
| --- | --- |
| `probe-results.json` | `a9c76cd79c45eb39d17ad7d86f81777096af19a09383818e1e803b3adeadaaf4` |
| `matching-results.json` | `639e4516c15651810f72cac7a5c0db56bb2124b3e7697264a651d01847d3d625` |
| `removal-record.json` | `986a5c5aa21a8975c897479e5bfc0743befd96381ea6df20798b9904dd872a06` |
| `manifest.json` | `4306abe487d75b60d182fe33be656a3c26e3aaffe05482cfb00b7a49b928e2a9` |

Within a single execution the deterministic core audit is also hashed twice and
must agree; its canonical digest is
`331f1877b3f135c0ac1d203d2b2f81aedab26bf3b8ebb5a467853119176e3232`.
Same removed state, same nine remaining deltas, same matched controls, same
median, same permutation result, same control — across both runs.

## 13. Interpretation

**Phase 108's residual is not robust to the pre-registered leave-one-out check.**

Removing the single maximum-delta state — `T/machine learning is#11`, delta
`+0.18222743093412597`, selected by an argmax rule fixed before the comparison was
read — moves the official statistic from `+0.0030208448733220483` to
`-0.0014912687227774946`. The matched median is no longer positive, the fixed
permutation null provides no evidence of a positive residual (p = 0.6503), and the
observed value sits below the null's own median.

The same property holds for the mean, in the weaker sense that it halves
(`0.026435280108252367` → `0.009125041127599745`) while remaining positive: one
state accounted for roughly 69 % of a ten-state mean. That is the signature of a
statistic carried by a single observation rather than by a population.

**§9 wording, stated plainly.** This is *evidence that the Phase-108 residual was
not robust to the pre-registered leave-one-out check*. It is **not** proof that no
residual mechanism exists. Nine failure states are a small population, a
non-significant result at n = 9 is weak evidence of absence, and this phase
removed exactly one state under exactly one pre-registered rule. The correct
reading is that the residual Phase 108 reported does not survive the robustness
check it pre-registered against itself.

**Note on the decision rule's edge.** §8's two operational paths for "supported"
are "the matched median delta is NOT positive" **or** "the fixed null does not
provide evidence for a positive residual"; §18's `C` describes "the effect weakens
but the remaining 9-state sample cannot establish a clean result". For a result
whose median stays positive but whose null does not reject, those two readings
point at different letters. They do not conflict here: the median is **negative**,
so the A branch is reached by §8's first path regardless of how the second is
read, and no ambiguity had to be resolved after the fact.

## 14. Limitations

1. **n = 9.** The remaining matched population is small; power is low and a
   non-significant outcome is not a strong absence claim.
2. **One removal, one rule.** No second state was removed, no alternative subset
   was searched, and no other pre-registered rule was tried. Robustness to a
   *different* removal criterion is untested and was deliberately not tested.
3. **Controls are shared, not paired.** Every failure is compared against the
   median of its gap peers, so the nine deltas are not independent observations.
   The permutation null respects this structure, but the sample size is not nine
   independent draws.
4. **The mean remains positive.** The primary statistic is the median; the fact
   that the mean stayed positive after removal is reported, not used.
5. **The statistic is a re-analysis of frozen numbers.** Phase 109 loads the
   Phase-107 records that Phase 108 gated against the live checkpoints at
   tolerance 0; it does not re-run the model. The four checkpoint digests are
   re-verified, and the reproduction is exact, but the model-level gate is
   Phase 108's, not a fresh one here.
6. **Scope.** The stratum, the statistic, the tolerance and the permutation
   design are frozen. A different cut might behave differently; changing them
   would be a different experiment and was not permitted here.

## 15. What is NOT proven

* **Not** proven: that no residual mechanism exists. See §9 of the brief and
  §13 above.
* **Not** proven: that `T/machine learning is#11` is special, defective,
  anomalous or mechanistically distinct. It was removed because it was the
  maximum matched delta. No property of the state was examined to select it.
* **Not** proven: that the remaining nine states are homogeneous. They are not
  claimed to be; `C94/太阳#11` still carries the largest surviving delta.
* **Not** proven: that the S0-margin family is exhausted in general. Only that
  *this* residual does not survive *this* pre-registered leave-one-out check.
* **Not** proven: anything about the random-label control's post-removal value
  (`+0.1979442163727122`). With one stratum pseudo-failure it is a single draw and
  is reported as description, not as a result.

## 16. Phase-110 recommendation

The residual family is closed. Per §19, no further statistical projection of the
same 221 states is proposed, and no tokenizer fix, byte mask, new projection,
architecture change or training intervention is proposed here.

The one live question this phase exposes is about its **inputs**. Phases 107–109
all rest on the same 11-state failure population, and Phase 99 recorded **12**
corrupted trajectories against **11** failure states — a gap that has never been
reconciled.

> **H110 — the failure population is complete.** Under the frozen P12-MASK
> condition, every P0 decision in the 20 recorded generations that diverges from
> the corpus-supported continuation is one of the 11 recorded failure states.
>
> **Falsifier:** if any recorded generation contains a divergent P0 decision
> whose label is absent from the 11-state failure population — a divergence on a
> prompt outside the five recorded prompts, or at a step index not in the failure
> set — then H110 is falsified and the population every S0 result is scoped to is
> incomplete.

This is a closure test on the population, not another projection of it. It is
read-only, requires no training and no new scoring function, and it is
falsifiable by enumeration alone.

## 17. Final conclusion

The exact pre-registered leave-one-out rule — remove the single maximum matched
delta, rerun the identical Phase-108 pipeline — was executed and the Phase-108
baseline reproduced exactly before the removal happened.

**Classification: `A — Single-state effect supported`.**

The matched median delta after removing `T/machine learning is#11` is
`-0.0014912687227774946` — not positive — and the fixed permutation null provides
no evidence of a positive residual (p = `0.6502674866256687`). The residual Phase
108 reported was carried by a single failure state and does not survive the
robustness check.

This is evidence that the Phase-108 residual was not robust to the pre-registered
leave-one-out check. It is not proof that no residual mechanism exists.

`NOT COMMITTED`. Phase 110 has not been started.
