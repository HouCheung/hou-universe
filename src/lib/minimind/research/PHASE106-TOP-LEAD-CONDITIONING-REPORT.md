# Phase 106 — Single-Lead Conditioning Audit

Read-only mechanism audit over the frozen Phase-96 family checkpoints.
**Training: NOT RUN.** No optimizer step, no checkpoint write, no tokenizer,
vocabulary, merge-table, architecture, generation, sampling, rollout, prompt,
dataset, evaluator or Phase-95 threshold change. No decoding mask of any kind
was applied to any logit. No generation was run beyond the frozen P12-MASK
replay that reconstructs the failure states. `Math.random()` and `setTimeout()`
are used nowhere.

This is the final diagnostic attempt for the lead-conditioned projection
family. It does not train, and it does not open a new family.

Artifacts: `experiments/phase106/{top-lead-conditioning-audit.ts,probe.ts,
run-probe.cmd,run-phase106-suite.ts,probe.log,probe-results.json,
correlation-results.json,manifest.json}`.
Suite: `src/lib/minimind/research/tests/phase106-top-lead-conditioning.test.ts`
(136 checks, 0 failed).

---

## 1. Phase-105 final validation

Phase 105's verdict is reproduced, not restated. Every number below was
recomputed by the Phase-106 probe from the frozen checkpoints and compared to
the recorded Phase-105 artifact at tolerance 0.

| quantity | Phase-105 record | Phase-106 replay | abs diff |
| --- | --- | --- | --- |
| failure-state mean Spearman rho (primary variant) | 0.08468614718614718 | 0.08468614718614718 | 0 |
| intact-state mean Spearman rho | 0.13980049712192577 | 0.13980049712192577 | 0 |
| failure states | 11 | 11 | — |
| intact P0 steps | 210 | 210 | — |
| lead-token census (K, K1, K2, B11) | 64 / 51 / 13 / 11 | 64 / 51 / 13 / 11 | identical |
| per-state rho, all 11 failure states | recorded | reproduced | 0 each |
| forward passes bit-reproducible | — | true | — |
| Phase-105 verdict | C — projection artifact / unsupported (evidence pattern B) | — | — |

Every checkpoint digest matches **both** the Phase-105 and the Phase-104
manifest:

| arm | file | sha256 | matches P105 | matches P104 |
| --- | --- | --- | --- | --- |
| A | `experiments/phase90/phase90-aligned.ckpt.json` | `dff07a8366ba21e4…` | yes | yes |
| B94 | `experiments/phase94/phase94-b.ckpt.json` | `c9f9d52d053e72ea…` | yes | yes |
| C94 | `experiments/phase94/phase94-c.ckpt.json` | `62557157cab31899…` | yes | yes |
| T | `experiments/phase96/phase96-treatment.ckpt.json` | `5ebe2ab392ac8d08…` | yes | yes |

The Phase-105 vocabulary census is unchanged (scientific digest
`4b85f6099c292796`), and the Phase-105 probe, correlation and manifest
artifacts are unchanged (`9fc838e0718f0f52`, `f94383880aad3063`,
`bd5f479d7176213e`).

**The §14 baseline gate passed with zero blocking conditions.** Phase 105's
recorded `mean projection rank 35.27` and `mean P0 rank 2.82` are also
independently re-derived here (35.2727 and 2.8182) from Phase 106's own slices,
which the gate did not require.

## 2. Research question

Phase 105's strongest surviving observation was *dilution*: its primary
projection marginalises over all **51** legal single-byte lead candidates,
`proj[b] = direct[b] + Σ_l P(l)·D_l[b]`, and the resulting distribution is a
near-uniform mixture of 51 different conditional continuations. Phase 105's
verdict (C) and its evidence pattern (B — general structure, not
failure-specific) left exactly one explanation for that family's failure
untested:

> **if the mixture is the problem, conditioning on a single lead — the one the
> model itself prefers — should recover the signal.**

Phase 106 tests that. It is the last test of this family: if removing the
marginalisation does not restore the fatal continuation byte, the dilution
account is dead and the whole lead-conditioned projection approach should be
closed rather than refined again.

## 3. H106 hypothesis

Pre-registered before measurement, unchanged afterwards:

> **H106** — the P0 failure signal is real, but the Phase-105 complete
> lead-conditioned projection loses it by marginalising over all 51 legal
> leads; conditioning on the single legal lead that ranks first under the
> state's own S0 distribution recovers the fatal continuation byte's rank.

**Supported iff** `fatalByteRank_topLead <= 16` in **at least 6 of the 11**
failure states.
**Refuted iff** fewer than 6 of 11.
**Blocked iff** at least one required failure state has no well-defined
deterministic top-lead projection.

"Top quartile" is rank ≤ 16 among the 64 continuation bytes. "Majority" is ≥ 6
of 11. Neither is restated as a percentage anywhere in the decision.

## 4. Top-lead definition

Fixed policy, applied identically to all 11 failure states and all 210 intact
steps:

> the legal single-byte lead holding the smallest **midrank** over the 51 legal
> lead candidates, ranked by the model's own **unmasked** S0 full-vocabulary
> probability, with ties at that midrank broken by **ascending lead byte
> value**.

The corrected Phase-103/104 midrank convention is applied *first* and the
byte-order tie-break *after*, so a state whose top candidates are genuinely
tied is reported as tied rather than silently resolved into a false winner.
The lead was **not** selected by downstream correlation, by which lead gives the
best fatal-byte rank, by corpus frequency, or by the historical generated
character. All 11 selections had `tieCount = 1` and `midrank = 1.0`, so the
tie-break never fired — the selection is unique in every state.

The statistic:

> the **ordinal rank** (rank 1 = largest, ties broken by ascending byte index —
> the same convention Phase 105 recorded as `fatalRankProjection`) of the
> historical P0 fatal continuation byte within the 64-value continuation slice
> of the forward pass at `S0 ++ [the selected legal lead byte token]`.

Phase 103's midrank rank is computed alongside and asserted to agree; the
slices are tie-free, so the two conventions coincide in all 11 states.

## 5. Feasibility audit

Every selected lead was audited against five conditions before any rank was
read: **F1** the lead is one of the census's 51 legal lead bytes, **F2**
`4 + lead` exists in the frozen vocabulary with bytes exactly `[lead]`, **F3**
the repository's byte machine accepts `[lead]` as a character start, **F4** the
forced forward pass is bit-reproducible, **F5** the 64-value slice has at least
two distinct values.

| check | result |
| --- | --- |
| projection defined | **11 / 11** |
| token shape | `bare-lead` in 11/11 (byte length 1, token id = 4 + lead) |
| legal continuation values | **64 / 64** in every state; excluded set empty |
| opens a legal sequence (F3) | true in 11/11 |
| distinct slice values | **64 / 64** in every state |
| forced forward reproducible | true in 11/11 |

No state was blocked. Two structural facts are worth recording because they
shaped the design:

- **The selected lead is always a bare single-byte lead.** The census's legal
  lead candidates *are* K1, so a multi-byte character-start token (K2) can
  never be selected by this policy. No state needed the multi-byte branch.
- **F3 is unreachable once F1 holds.** The repository's byte machine enforces
  only `isContinuation(b)` after a lead; it does **not** enforce the UTF-8
  range restrictions (`E0→A0..BF`, `ED→80..9F`, `F0→90..BF`, `F4→80..8F`). So
  every legal lead legally accepts all 64 continuation values, the legal/
  excluded split is 64/0 everywhere, and F3 can only fire on a lead that
  already failed F1. The suite pins this as an invariant rather than letting it
  pass silently as a coincidence.

The consequence for the projection is that the legal-continuation restriction
is a **no-op**: `H106[b] = D_l[b]` over the full 64-value axis, with no
renormalisation and no mask. The probe asserts the fresh H106 slice equals the
Phase-105 recorded leg for the same lead at tolerance 0 in all 11 states, so
**the only variable that changed between H105 and H106 is the conditioning.**

## 6. H105 baseline reproduction

Required by §14 and satisfied exactly:

- failure-state mean rho: **0.08468614718614718** reproduced vs
  0.08468614718614718 recorded, |diff| **0**
- intact-state mean rho: **0.13980049712192577** reproduced vs
  0.13980049712192577 recorded, |diff| **0**
- all five Phase-105 projection variants rebuilt per state from
  `experiments/phase105/lead-conditioned-audit.ts`; every recorded per-state
  rho reproduced at tolerance 0
- P12-MASK replayed for all four arms, reconstructing exactly **11** P0 failure
  states (Phase 102 recorded 11); BASE and P012-MASK were **not** re-run
- vocabulary census recomputed and required to equal the Phase-105 census
  artifact byte for byte — it does (`censusIdenticalToPhase105: true`)

## 7. Failure-state results

Population: the frozen Phase-102/103/104/105 11 P0 failure states. Not
expanded, not re-prompted, no new generations.

| state | S0 idx | top lead | P(lead) | lead share | fatal byte | P0 rank | H105 rank | **H106 rank** | Δ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A/machine learning is#15 | 26 | `e4` | 0.00543 | 47.3% | `8d` | 1 | 24 | 27 | −3 |
| A/机器学习是#11 | 21 | `e6` | 0.87431 | 91.6% | `a5` | 1 | 53 | 50 | +3 |
| B94/太阳#15 | 17 | `e9` | 0.99512 | 99.5% | `b7` | 8 | 50 | 52 | −2 |
| B94/机器学习是#2 | 13 | `e6` | 0.09399 | 59.5% | `86` | 2 | 33 | 32 | +1 |
| B94/什么是 machine learning#3 | 19 | `ef` | 0.99764 | 99.9% | `8d` | 1 | 16 | **11** | +5 |
| C94/太阳#11 | 13 | `e8` | 0.95733 | 98.2% | `b7` | 1 | 34 | 30 | +4 |
| C94/机器学习是#8 | 18 | `e6` | 0.93396 | 97.0% | `b4` | 1 | 37 | 30 | +7 |
| C94/什么是 machine learning#3 | 19 | `ef` | 0.99246 | 99.9% | `a5` | 1 | 36 | 34 | +2 |
| T/machine learning is#11 | 21 | `e8` | 0.80952 | 99.4% | `b6` | 1 | 23 | **8** | +15 |
| T/太阳#15 | 17 | `e5` | 0.99913 | 99.9% | `a2` | 1 | 49 | 48 | +1 |
| T/什么是 machine learning#12 | 30 | `e7` | 0.00676 | 74.6% | `82` | 13 | 33 | **7** | +26 |

Bold = in the pre-registered top quartile (rank ≤ 16).

Aggregates on the failure population:

- **top-quartile count: 3 / 11** (pre-registered threshold: 6)
- **H106 rank**: mean **29.909**, median **30** (7, 8, 11, 27, 30, 30, 32, 34, 48, 50, 52)
- **H105 rank**: mean **35.273**, median 34
- **P0 rank**: mean **2.818**, rank ≤ 3 in **9 / 11** states
- 8 distinct fatal continuation values: `82 86 8d a5 b6 b7 b4 a2`
- fatal-byte probability under H106: 2.77e−6 … 1.83e−3

Every state's fatal byte is a legal continuation value, and every slice is a
fully-populated 64-value distribution over the continuation axis. Nothing was
degenerate.

## 8. H106 rank analysis

The hypothesis was stated as a threshold on a *count*, and the count is 3. But
the rank distribution explains why, and the explanation is more informative
than the count:

- **2 of 3 top-quartile states are barely inside.** `B94/什么是 machine
  learning#3` sits at rank 11 and `T/machine learning is#11` at rank 8, but the
  remaining 9 states are spread across 27–52 with the median at exactly 30 —
  the **middle of the 64-value axis**. A rank of 30 is not a weak signal; it is
  no signal, since a random byte conditioned on nothing has expected rank 32.5.
- **The distribution is not bimodal.** If dilution were the mechanism, the
  states with the most concentrated lead mass should be the *most* recovered
  (the projection becomes a single leg exactly there). They are not: 8 of 11
  states have a lead share above 90%, and those 8 sit at ranks 8, 27, 30, 30,
  32, 34, 48 and 52.
- **The single largest recovery is not the most diluted state.** The 123-fold
  fatal-probability gain is `T/什么是 machine learning#12` (rank 33 → 7). That
  state has the *lowest* lead share (74.6%) and the smallest rank-1/rank-2 gap
  (0.0061), so it is the one state where the top lead does not dominate — the
  opposite of the dilution prediction.

## 9. H105 vs H106 comparison

The paired comparison is the load-bearing one, because both arms share the same
frozen P0 slices, the same prefix states and the same fatal byte.

| quantity | value |
| --- | --- |
| states improved (H106 rank < H105 rank) | **9 / 11** |
| states worsened | 2 / 11 |
| mean rank improvement | **+5.364** ranks |
| rank improvement range | −3 … +26 |
| H105 top quartile | 1 / 11 (rank 16, exactly on the boundary) |
| H106 top quartile | **3 / 11** |
| states reaching rank ≤ 16 | 3 of the 11 — two of them (11, 8) by ≤ 7 ranks of margin |

Removing the marginalisation **does move the fatal byte in the predicted
direction**: 9 of 11 states improved, and the mean gain is +5.36 ranks. That is
a real effect and it is in H106's favour. It is also **an order of magnitude too
small**: a state starting at rank 33 needs +17 to enter the top quartile, and
the observed mean gain is +5.4. The direction is right; the magnitude cannot
carry the hypothesis.

The decisive comparison is against the state's own P0 distribution, and it is
independent of any aggregate: in **0 of 11** states does single-lead
conditioning rank the fatal byte as well as the unmasked P0 distribution
already does. P0 puts it at mean rank **2.82** and in the top 3 in 9 of 11
states. Every conditioning scheme tested across Phases 104–106 *demotes* the
fatal byte relative to the model's own unconditional preference.

## 10. Intact control

Population: the same **210** intact P0 steps Phase 103/104/105 used. The
identical procedure was applied — same census, same selection policy, same rank
statistic.

The intact analogue of the "fatal byte" is the **P0 continuation argmax** (the
continuation byte the intact state itself favours), because an intact P0 step
emitted a legal character-start byte, which is not on the continuation axis.

| quantity | intact | failure states |
| --- | --- | --- |
| states | 210 | 11 |
| in top quartile under H106 | **67** | 3 |
| rate | **31.90%** | 27.27% |
| projection defined | 210 / 210 | 11 / 11 |
| mean observed rank | 28.98 | 29.91 |
| rank-1 ties | 0 | 0 |

The failure-state rate (27.3%) is **below** the intact-state rate (31.9%).
Under this instrument the failure states are not more recoverable than the
intact control — if anything they are marginally less so. That is the same
signature Phase 105 reported (61.9% of individual intact states exceeded the
failure-state mean), reproduced on an independent observable.

The intact rate is **descriptive only**. It is recorded, never thresholded,
and `decision.totalStates` is asserted to be the failure population size in the
suite, so the control can never reach the verdict.

## 11. Lead-selection concentration

Reported because it is the main threat to the validity of H106, not because it
is a result.

| quantity | failure states | intact steps |
| --- | --- | --- |
| mean top-lead share | **87.90%** | 52.43% |
| median top-lead share | **98.23%** | 50.58% |
| min / max share | 47.32% / 99.95% | 5.41% / 100.00% |
| mean top-3 share | 97.87% | 71.16% |
| states with lead share > 90% ("dominant") | **8 / 11** | 38 / 210 |
| rank-1 ties | 0 | 0 |
| zero rank-1/rank-2 gap | 0 | 0 |
| candidates above 1% of lead mass | 1–5 | — |

At S0 the failure states are near-deterministic: one legal lead holds a median
98.2% of the entire legal-lead mass. **In 8 of 11 states the H106 projection is
therefore numerically indistinguishable from a single Phase-105 leg** — the
marginalisation that H106 was designed to remove contributed at most 2.1% of
the mass. This is the *strongest* form of the test the hypothesis asked for,
and it is also the reason the result is interpretable at all: "remove the
mixture" was not merely approximated here, it was performed almost exactly.

The consequence is a **self-conditioning risk** that must be stated plainly: in
those 8 states the lead was chosen from the same distribution whose
continuation is then measured. That is by construction — the pre-registration
demanded the model's own top lead — and it means H106 is a *conditional*
measurement, not a counterfactual intervention. Section 14 returns to this.

## 12. Vocabulary compatibility

The census is Phase 105's, recomputed and required to match exactly
(`identicalToPhase105: true`), so there is one source of truth and a drift is a
STOP rather than a second opinion. No `vocabulary-census.json` is written by
Phase 106, and the suite asserts its absence.

| quantity | value |
| --- | --- |
| \|K\| family (legal character-start tokens) | **64** |
| \|K1\| bare leads | **51** |
| \|K2\| multi-byte character-start tokens | **13** |
| B11 — distinct second bytes over K2 | **11** (`88 8f 96 98 9a 9c a4 b8 ba bb bf`) |
| legal single-byte lead values | **51** (0xC2–0xF4 minus 0xC0/0xC1/0xF5+) |
| byte-token identity (id 4 + b = byte b) | asserted well-formed |
| production tokenizer / model / evaluator files | **unchanged** vs the Phase-102 record |

Byte-token ids are the identity map `id = 4 + byteValue`, so the 51 legal leads
are exactly tokens 198–248. The 13 K2 entries remain present and were never
implicated by H106 — consistent with Phase 105's finding that they are not by
themselves a failure-specific mechanism.

## 13. Mechanistic interpretation

The dilution hypothesis is refuted, and the way it failed is informative.

**What was actually removed.** In 8 of 11 states the top lead already holds
>90% of the legal-lead mass (median 98.2%). Phase 105's mixture weighted 51
legs; in these states the top leg carried ≥ 90% of that weight. H106 is
therefore not an incremental refinement of H105 — it is the *limit* of the
family, the case where the marginalisation is essentially gone. And the fatal
byte still sits at median rank 30.

**What the projection is actually measuring.** The failure states share one
property that H106 confirms rather than explains: at S0 the model's
**unconditional** top byte is a continuation byte — the fatal byte is at P0 rank
1 in 9 of 11 states (mean 2.82). This is the Phase-101/102 phenomenon, and it
is strong. Every lead-conditioned quantity tested so far asks a *different*
question: "given that the model commits to legal character-start `l`, where
does the fatal byte sit in the following distribution?" The answer is: near the
middle, in a way that is unrelated to the failure. The conditional and the
unconditional preference are **close to independent** here. Removing the
mixture does not help because the mixture was never the mechanism — the two
questions are simply about different things.

**Why the small gain is still real.** H106 did improve 9 of 11 states
(mean +5.36 ranks), so conditioning carries *some* information about the fatal
byte. The size of that information is ~5 ranks out of 64, i.e. the projection
retains a faint echo of the state's preference — enough to shift a rank, far too
little to localise the byte. The one state where it worked well
(`T/什么是 machine learning#12`, 33 → 7, 123× probability) is the state with
the *least* concentrated lead decision, which is where a mixture would be most
damaging. Taken together these point at a weak, non-specific contribution from
the lead axis plus a dominant P0 effect that the lead axis does not capture.

**Conclusion for the family.** The lead-conditioned projection approach is
closed. Two independent interventions have now failed to recover the signal: a
45°-rotated conditioning axis (Phase 104, `R0 = −0.0416` vs `R1 = 0.0411`) and
the elimination of the marginalisation (Phase 106, 3/11). Its weak positive
correlations are general structure present in intact text as well — Phase 105's
evidence pattern B, reproduced here as an intact top-quartile rate (31.9%)
*above* the failure-state rate (27.3%).

## 14. Limitations / circularity risk

1. **Self-conditioning.** The lead is drawn from the same S0 distribution whose
   continuation is then measured, in 8 of 11 states from a candidate holding
   >90% of the legal-lead mass. H106 is an observational conditional, not an
   intervention: it measures where the fatal byte sits *given* the model's own
   preferred lead, and cannot by itself establish what a *forced* different lead
   would do. This was required by the pre-registration (§4 forbids choosing a
   lead that ranks the fatal byte well) and it cuts both ways — it makes the
   result a lower bound on nothing and an over-estimate of nothing, but it does
   mean the state selection and the measurement share a variable.
2. **Pre-selection of the fatal byte.** The fatal byte is the one recorded in
   Phases 101–103 and was never redefined here. But it was, in every prior
   phase, identified from a trajectory that *did* fail — so the 11 states are a
   selected sample. The intact control is the only defence against this, and it
   is a control, not a matched sample.
3. **The intact analogue is not the same quantity.** The intact observable is
   the P0 continuation argmax, because intact P0 steps emitted legal leading
   bytes. The comparison in §10 is therefore between two different bytes'
   ranks, and is descriptive only. It is not a like-for-like contrast.
4. **One projection family, three phases.** Phases 104, 105 and 106 all test
   lead- or boundary-conditioned reweightings of the same S0 distribution. Three
   failures in one family do not constitute three independent refutations.
5. **Rank is a coarse instrument.** The rank statistic discards probability
   mass. `T/什么是 machine learning#12` gained 123× probability but only 26
   ranks; `B94/太阳#15` lost 2 ranks on a 1.5× probability drop. The
   pre-registered statistic is the rank, and the rank is what is reported.
6. **Small denominator.** 11 states. The boundary (6 of 11) is coarse by
   construction, and a 3/11 outcome is not a close miss: reaching the threshold
   would require doubling the number of top-quartile states.
7. **Intact concentration is not uniform.** 38 of 210 intact steps are also
   "dominant" (>90% lead share), so the self-conditioning risk is not confined
   to the failure population; it is merely much more severe there.

## 15. What is NOT proven

- **Not proven:** that the P0 fatal byte carries no information at S0. The
  opposite is observed — it is at P0 rank 1 in 9 of 11 states.
- **Not proven:** that dilution plays no role anywhere. It is refuted *as the
  mechanism of the lead-conditioned projection's failure*, on the states
  available, under this statistic. One state (`T/什么是 machine
  learning#12`) behaves as the dilution account predicts.
- **Not proven:** that the failure states are distinguishable from intact steps
  by any lead-conditioned quantity. §10 shows the descriptive rates are in the
  wrong order.
- **Not proven:** that a *forced* (non-top) lead would not recover the byte.
  §21 forbids sweeping alternative lead-selection policies as official arms, and
  none was run. This is the one variant of the intervention family left
  untested, and it is a different experiment (an intervention, not a
  conditional).
- **Not proven:** any causal account of the corruption. Nothing here trains or
  intervenes on any checkpoint; every number is a read of a frozen forward
  pass.
- **Not proven:** that Phase 101–105's verdicts were wrong. Phase 106 confirms
  Phase 105's baseline exactly and its pattern B evidence pattern
  independently.
- **Not proven:** anything about the 13 K2 multi-byte vocabulary entries. No
  state selected one, and no state could have.

## 16. Phase-107 recommendation

The lead-conditioned family is closed. The one robust, unrebutted observation
across Phases 101–106 is this: **at S0 the model's own unmasked top byte is an
illegal continuation byte** (P0 rank 1 in 9 of 11 failure states, mean 2.82),
and this is a property of the *unconditional* S0 distribution alone. That
observation has never been turned into a falsifiable prediction on data that was
not used to find it.

> **H107 — the P0 failure is decided entirely at S0, and is predictable from the
> unmasked S0 distribution alone.**
>
> Pre-registered prediction: a P0 step fails iff the model's unmasked S0 mass on
> continuation bytes (0x80–0xBF) exceeds its mass on legal character starts by a
> margin fixed *before* measurement. The test is **out-of-sample**: the margin
> is fixed on the 11 known failure states and then applied, once, to the 210
> frozen intact P0 steps. **Falsifier:** the fixed margin fails to separate the
> two populations on the held-out 210 (e.g. it predicts failure for a majority
> of intact steps, or fails to predict the failures).
>
> Why this is the right next test: it is falsifiable on already-frozen data with
> no training and no new generation; it uses the unconditional S0 distribution
> that every phase since 101 has *measured* but never *predicted from*; and it
> is the direct converse of the family that just closed — instead of asking
> where the fatal byte ranks under some conditioning, it asks whether S0 alone
> already determines the outcome. If H107 is also refuted, the P0 failure is not
> a property of the S0 distribution at all, and the search must move to a
> different state or a different mechanism entirely.

No other hypothesis is proposed, and Phase 107 is not begun.

## 17. Final conclusion

**Classification B — dilution hypothesis refuted.**

The pre-registered boundary was `fatalByteRank_topLead <= 16` in at least 6 of
11 failure states. The measured count is **3 of 11**. The hypothesis is
refuted under its own rule, applied without adjustment.

The refutation is clean and the instrument was sound:

- the Phase-105 baseline reproduced at **|diff| = 0** on both population means,
  with all 11 per-state values and the vocabulary census exact;
- all four checkpoints match **both** the Phase-105 and Phase-104 digests;
- the projection was defined in **11/11** states with 64/64 distinct values and
  bit-reproducible forward passes;
- the H106 slice equals the Phase-105 leg for the same lead at tolerance 0, so
  the conditioning was the only variable that changed;
- no state blocked, so classification C was never available;
- identical treatment of the 210 intact steps as a descriptive control.

The dilution account does not survive contact with its own extreme case.
Conditioning on the single lead the model prefers removes the marginalisation
almost entirely — in 8 of 11 states the top lead holds more than 90% of the
legal-lead mass, median 98.2% — and the fatal continuation byte still sits at
median rank 30 of 64, the middle of the axis. The intervention moved 9 of 11
states in the predicted direction (mean +5.36 ranks), so the lead axis retains
a faint trace of the state's preference, but the effect is roughly an order of
magnitude too small to localise the byte.

Meanwhile the intact control puts its own byte in the top quartile **more often**
than the failure states do (31.9% vs 27.3%), reproducing Phase 105's evidence
pattern B on an independent observable: whatever the lead-conditioned
projections are measuring, intact text has it too.

The recommendation is therefore closure, not another variant. Phases 104, 105
and 106 have now tested a rotated conditioning axis and the elimination of the
mixture, and both failed to recover the signal. The one observation that has
survived every test is that the fatal byte is the model's **own unconditional
S0 top choice** (P0 rank 1 in 9 of 11 states, mean 2.82) — a fact about S0 that
no conditioning on the legal-lead axis captures. §16 turns that into a single
falsifiable, out-of-sample prediction. Phase 107 is not begun.

**Training: NOT RUN.**
