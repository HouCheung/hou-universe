# Phase 103 — Byte-Phase Symmetry Correlation Audit

**Status:** COMPLETE — verdict **Outcome B: Partially supported**
**Training:** NOT RUN. No checkpoint, tokenizer, vocabulary, merge table, prompt, dataset, evaluator, threshold, sampling parameter, rollout or generation path was written or modified.
**Mode:** read-only mechanism audit over four frozen Phase-96-family checkpoints.

---

## 1. Research question

Phase 102 left the P0 corruption mechanism standing and unexplained. Its verdict was *strongly
supported*: at a character boundary (P0) the model emits tokens that begin with a UTF-8
continuation byte `0x80–0xBF`, which cannot legally start a character; restricting the P0
candidate set removed **all** remaining corruption (12 → 11 → 0 across BASE / P12-MASK /
P012-MASK). Phase 102 therefore established *what* the mistake is — a continuation-byte emission
at a boundary — but not *why* the model ranks those bytes highly there.

**H103 (pre-registered).** If the P0 corruption is *phase-blind candidate ranking*, then the
continuation-byte probability distribution at P0 should correlate with the distribution observed
when the same prefix is artificially extended by one byte that forces the model into P1. After
accounting for the byte offset needed to complete the UTF-8 character, the two distributions
should show a reproducible correspondence.

The hypothesis is **not** "P0 is corrupted" — Phase 102 already showed that. It is the sharper
claim that the P0 ranking *is the same ranking* the model produces one byte later, with no phase
comprehension at all. If that were true, the P0 continuation-byte ordering and the forced-P1
continuation-byte ordering would agree at matched byte values.

**Outcomes available:** H103-supported / H103-refuted / Inconclusive. The outcome below was not
assumed in advance and is derived only from the pre-registered statistic.

---

## 2. Prior evidence taken as FIXED

§13 forbids re-deriving these; they are read back from the Phase-102 artifact
(`experiments/phase102/probe-results.json`, sha256 `41278ea2…`) and restated, never re-measured.

| Phase-102 quantity | Value |
| --- | --- |
| BASE corruption | 12 / 20 |
| P12-MASK corruption | 11 / 20 |
| P012-MASK corruption | 0 / 20 |
| P0 failure states under P12-MASK | 11 |
| Phase-102 classification | A — Strongly supported |

Phase-101's mask semantics and Phase-95's thresholds were used exactly as frozen. No Phase-102
mask semantics were altered, and no mask of any kind was applied to the primary Phase-103 logits.

---

## 3. Method, declared before measurement

Everything in §3–§7 is method. No result appears in them. Every constant below was fixed before
the probe was written.

### 3.1 Byte representation

Byte tokens are ids `4 + byteValue`, so ids `4..259` are exactly bytes `0x00..0xFF`. This is
asserted in the suite rather than assumed. The next-byte distribution is an exact aggregation:

```
P(next byte = b) = SUM over tokens t with firstByte(t) = b of P(t)
```

which is exact, not an approximation, because the next byte of the stream is always the first byte
of the next token; later bytes of a multi-byte token are determined once the token is drawn. This
sums to `1 -` the mass on zero-length tokens, and is never renormalised.

### 3.2 The two distributions

For each state, two distributions over the 64 continuation bytes `0x80–0xBF` are computed:

- **P0 side** — the frozen model's distribution at the exact boundary prefix Phase 102 recorded.
- **forced-P1 side** — the same frozen model's distribution after the same prefix has been
  extended by exactly one experimental conditioning byte (§5).

Both are reported under **two conditionings**, and the distinction is mandatory:

- **full-vocabulary probability** — `P(next byte = b)` over the whole vocabulary, summing to
  `1 - zeroLengthMass`. This is the quantity correlated.
- **continuation-conditioned probability** — the same 64 values renormalised to sum to 1. Labelled
  as such wherever it appears. It is *not* the correlated quantity.

### 3.3 The tie policy, and its repair

The pre-registered tie policy is **midrank**: rank 1 is the largest probability, and tied values
share the **average** of the ranks they span. Spearman rho is then the Pearson correlation of the
two midrank vectors, and is **0 by definition** when either vector has zero rank variance.

This policy was **changed during the audit, and the change is disclosed here in full.**

The first version of the instrument broke ties by *ascending index* — the repository's
`rankByLogit` convention, which assigns tied values distinct ranks in index order. That is correct
for selecting an argmax and wrong for a rank correlation: it manufactures an ordering among
equal-mass bytes along the very axis being correlated. Control C (§11) detected this immediately —
its degenerate-constant case, `w_i = 5 for all i`, returned **-1** where it must return 0 by
definition. The instrument was corrected to midrank, Control C was extended with an exhaustive
permutation check against an independent closed form, and **the entire probe was re-run from
scratch**.

The correction did not move the measurement. All 11 states have **64 distinct** continuation-byte
values on both sides and **zero** zero-mass continuation bytes, so no ties exist in this dataset
and midrank is arithmetically identical to the ordinal ranks it replaced. The re-run reproduces the
first run's statistic to the last digit (mean rho `0.04105894105894106`). The repair matters for
the instrument's correctness, not for this number — but the number could not have been trusted
without it, because nothing in the first run proved the tie path was unexercised.

### 3.4 Correlation measures

All of the following are reported for every state; none was chosen for its strength:

1. **Spearman rho** over the 64 continuation bytes under the identity byte-value mapping — the
   primary measure.
2. **Spearman rho on the legal subset** — restricted to continuation bytes the conditioning lead
   actually admits.
3. **Pearson over log-probability**, reported as `null` — never silently 0 — wherever any compared
   byte has zero probability.
4. **Top-k overlap** at `k ∈ {1, 3, 5, 10}`.
5. **The rank of the Phase-102 observed fatal continuation byte** on both sides.

An **exploratory index-shift family** (`delta ∈ {-2,-1,0,+1,+2}`) is also reported in full. It is
reported and never selected from: the classification uses `delta = 0` only.

### 3.5 The null, and the decision rule

**Null:** for every state the forced-P1 continuation vector is permuted against the fixed P0
vector, Spearman recomputed, and the per-state values aggregated by the same mean rule. The
marginals of both sides are preserved exactly; only the byte-value correspondence is destroyed —
which is precisely the hypothesis. `PERMUTATION_COUNT = 2000`, `PERMUTATION_SEED = 103042`, a
keyed Fisher–Yates permutation with no `Math.random` anywhere.

**Criterion, fixed before reading the result:** a two-sided 95% permutation interval
(`[0.025, 0.975]` quantiles, `SIGNIFICANCE_ALPHA = 0.05`), plus a sign-consistency requirement of
`2/3` of states sharing the sign of the mean.

| Outcome | Semantics |
| --- | --- |
| **A** Strongly supported | mean rho above the null's 95% upper bound **and** sign consistency ≥ 2/3 |
| **B** Partially supported | mean rho positive and above the null mean, but inside the interval or sign consistency short |
| **C** Refuted | mean rho inside or below the null's 95% interval |
| **D** Confounded | above the interval, but the sign reverses for a majority of legal conditioning lead bytes |
| **E** Blocked | reconstruction or forced-P1 construction failed |

---

## 4. The 11 frozen failure states

§4 requires exactly the 11 trajectories that remained corrupted under P12-MASK. No new failure
state was added, and no prompt or checkpoint was swept to improve statistical power.

Phase 102's artifact stores per-state aggregates but not prefix token ids, so the states were
**reconstructed by deterministic replay** of the P12-MASK condition alone — one `createSeededRNG(42)`
stream per arm, consumed across the 5 prompts in order, one draw per step — and then gated
bit-for-bit against Phase 102's recorded floats.

**§14 gate: PASS.** All 11 states matched on all six compared quantities at **tolerance 0**:

`argmaxId`, `argmaxP`, `legalMass`, `continuationStartMass`, `prefixLength`, `failureTokenIndex` —
every one `true`, every float difference exactly `0.0`. All four checkpoint sha256 values match the
Phase-102 digests. Every forward pass was bit-reproducible on a repeat call (`maxAbsDiff = 0`). No
`BLOCKED` condition was triggered.

| Arm | States |
| --- | --- |
| A | 2 |
| B94 | 3 |
| C94 | 3 |
| T | 3 |
| **Total** | **11** |

The gates are re-derived independently in the test suite, not trusted from the artifact.

---

## 5. Forced-P1 construction (§5)

The conditioning byte is **the model's own highest-logit single-byte token whose byte value is a
legal multi-byte UTF-8 lead in `[0xC2, 0xF4]`**, ties broken by ascending byte value.

Why exactly this rule:

- **single-byte token** — §5 requires appending *exactly one byte*;
- **multi-byte lead** — an ASCII byte would leave the stream at a boundary and would **not** force
  P1; a continuation byte is not a legal character start;
- **highest logit** — makes the choice a deterministic function of the frozen model's own
  distribution, with no free parameter and no hand-picked value;
- **raw logits** — the mask is consulted only to identify the legal candidate set. No logit is
  masked or replaced.

The construction then *proves* its own three properties and throws rather than degrading: the
source must be at a character boundary; the appended token must emit exactly one byte carrying its
own value; the resulting state must be exactly P1 and recoverable. It is refused for a
non-boundary source, a multi-byte token, an ASCII byte and a continuation byte — all four
refusals are exercised in the test suite.

The appended byte is an **experimental conditioning byte**. It is not a claim about a valid
natural-language continuation and is never produced by, persisted by, or reachable from any
production generation path.

Observed: all 11 states selected a 3-byte CJK lead (`0xE4`, `0xE5`, `0xE6`, `0xE8`, `0xE9`,
`0xEF`), each leaving `bytesStillNeeded = 2`. Every construction was valid. No `BLOCKED — forced-P1
construction is not well-defined under frozen tokenizer state` was triggered.

---

## 6. Byte-offset mapping (§8)

§8 forbids assuming the mapping is the identity. It is **derived**, and the derivation matters.

Both sides ask the same question — *what is the next byte of the stream?* — and on both sides the
next byte of the stream is by construction the first byte of the next token. So the **byte-value
index correspondence is the identity**, and that is a consequence of how a byte-level tokenizer
emits bytes, not a shortcut: there is no other byte the model could be ranking.

What is **not** identity:

- **Character position.** At P0 no character is open, so the model's continuation-byte ranking has
  no lead byte to sit behind — it is the ranking produced at consumed-position 0 of an *imagined*
  character. At the forced-P1 state exactly one byte has been supplied, so the ranking sits at
  consumed-position 1. That one-byte offset is recorded per row in `p0StreamOffset` / `p1StreamOffset`
  and as `offsetBytes = 1`.
- **Legality.** A 3-byte lead forbids nothing, but `E0` forbids `0x80–0x9F` and `ED` forbids
  `0xA0–0xBF` as the *first* continuation byte. Every row carries `legalContinuationOfLead`, and the
  correlation is additionally reported on that legal subset. The `E0` / `ED` exclusions are
  asserted row-by-row in the suite.

A machine-readable mapping table is emitted per state in
`experiments/phase103/probe-results.json` (`targetStates[].mapping.rows`, 64 rows each).

**Note on this dataset:** all 11 selected conditioning leads are 3-byte leads from the set
`{E4, E5, E6, E8, E9, EF}`, none of which excludes any continuation byte. The legal subset is
therefore all 64 bytes in every state, and `spearmanContinuationLegalSubset` is numerically
identical to `spearmanContinuation` throughout. The legal-subset restriction is reported as
computed but is not informative here — a real limitation of the sample, stated rather than hidden.

---

## 7. Distributions recorded (§6/§7)

For each of the 11 states and each of the two sides, the artifact records per continuation byte:
probability, logit, ordinal rank, and the continuation-conditioned probability; plus the full
256-value byte distribution, the 256-value byte logits, the conditioned vectors, and the count of
zero-mass continuation bytes.

Aggregate shape of the two sides:

| Quantity | P0 side | forced-P1 side |
| --- | --- | --- |
| Mean mass on continuation bytes | 0.6124 | 0.9758 |
| States with mass < 0.5 | 4 / 11 | 0 / 11 |
| States with zero-mass continuation bytes | 0 / 11 | 0 / 11 |
| Full support over the 64 values | yes | yes |

The P1 side is close to a degenerate continuation-byte distribution (≈0.98 of the mass sits on
continuation bytes), which is mechanically expected: one byte into a character, the only legal
bytes are continuations. The P0 side is **not** degenerate — its mass on continuation bytes ranges
from `0.047` to `0.997` — which is itself a direct restatement of the Phase-102 finding.

---

## 8. Correlation results (§9)

**Primary statistic (pre-registered): arithmetic mean of the per-state Spearman rho over the 64
continuation bytes under the identity byte-value mapping.**

| Quantity | Value |
| --- | --- |
| Target states | 11 |
| **Mean rho** | **0.041059** |
| Median rho | 0.057647 |
| Min / Max | -0.107647 / 0.291850 |
| Positive / Negative states | 7 / 4 |
| Sign consistency | 63.6% (required 66.7%) |
| Mean Pearson over log-probability | 0.037019 (range -0.148788 … 0.360171; 4/11 negative) |
| Mean top-k overlap | k=1: **0.000** · k=3: 0.030 · k=5: 0.091 · k=10: 0.127 |
| Mean rho, legal subset | 0.041059 (identical — see §6) |

Per state:

| State | rho | Pearson(log) | top-1 | top-3 | top-5 | top-10 | fatal rank P0 → P1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A/machine learning is#15 | 0.1104 | 0.0190 | 0 | 0 | 0 | 0.10 | 1 → 42 |
| A/机器学习是#11 | 0.0159 | 0.0001 | 0 | 0 | 0 | 0 | 1 → 45 |
| B94/太阳#15 | -0.0315 | -0.0106 | 0 | 0 | 0 | 0 | 8 → 49 |
| B94/机器学习是#2 | 0.0576 | 0.0754 | 0 | 0 | 0 | 0.10 | 2 → 39 |
| B94/什么是 machine learning#3 | 0.2918 | 0.3602 | 0 | 0.33 | 0.40 | 0.30 | 1 → 3 |
| C94/太阳#11 | 0.1543 | 0.1310 | 0 | 0 | 0.20 | 0.30 | 1 → 50 |
| C94/机器学习是#8 | -0.1076 | -0.1488 | 0 | 0 | 0 | 0 | 1 → 63 |
| C94/什么是 machine learning#3 | -0.1000 | -0.1022 | 0 | 0 | 0.20 | 0.30 | 1 → 53 |
| T/machine learning is#11 | -0.1014 | -0.1168 | 0 | 0 | 0 | 0 | 1 → 53 |
| T/太阳#15 | 0.0608 | 0.0841 | 0 | 0 | 0 | 0.10 | 1 → 47 |
| T/什么是 machine learning#12 | 0.1013 | 0.1159 | 0 | 0 | 0.20 | 0.20 | 13 → 35 |

**Two readings dominate this table.**

First, the **top-1 overlap is exactly 0.000**: in none of the 11 states is the byte the model
ranks first at P0 the byte it ranks first one byte into the character. The mean Spearman rho of
0.041 is small in absolute terms — it accounts for well under half a percent of rank variance —
and the two rankings do not share even their single most-preferred byte.

Second, the **fatal byte is rank 1 at P0 in 8 of 11 states** (rank 2 and rank 8 in two others,
rank 13 in one). Its mean rank on the forced-P1 side is **43.5** of 64. The byte that actually
caused the corruption is very often the model's single most-preferred continuation byte at the
boundary, and almost the least-preferred byte it would choose after one more byte of context. That
is the Phase-102 finding restated in rank terms, and it is the sharpest single number against
H103.

### Exploratory index-shift family (reported in full, never selected from)

| delta | -2 | -1 | **0 (primary)** | +1 | +2 |
| --- | --- | --- | --- | --- | --- |
| mean rho | -0.0783 | -0.0403 | **0.0411** | -0.0705 | -0.0770 |

`delta = 0` is the only non-negative member. The neighbouring shifts are negative, so the primary
value is not a plateau artefact of a mis-registered offset — but neither is it large. This is an
exploratory family; the classification ignores it.

---

## 9. Permutation null (§10)

| Quantity | Value |
| --- | --- |
| Aggregation | arithmetic mean of the per-state Spearman rho |
| Permutations | 2000 |
| Seed | 103042 |
| Null mean | 0.000355 |
| Null min / max | -0.129008 / 0.114960 |
| **95% interval** | **[-0.076625, 0.072657]** |

The null is centred on zero, as a destroyed byte-value correspondence must be. The observed
statistic **0.041059** is:

- **positive**, and **above the null mean** (0.0004);
- **inside** the 95% permutation interval — i.e. **not** separated from chance at the pre-registered
  criterion;
- supported by only **63.6%** of states sharing its sign, short of the pre-registered 66.7%.

The interval is wide relative to the statistic, which is what 11 states buying a 64-value rank
correlation should produce. §21 forbids expanding the sample to narrow it; the weakness is
reported instead.

---

## 10. Controls A and B (§11)

Both controls are built from the same frozen checkpoints, with no mask applied, under the same
metrics.

**Control A — intact P0 states.** 210 P0 decision steps (from the 20 P12-MASK trajectories) that
were *not* corruption points: mean rho **0.10456**, sign consistency 72.9%, mean top-1 0.019.

**Control B — intact P1 states.** 51 real P0 → P1 transitions, i.e. states where the model
actually continued a character and did *not* produce a continuation-byte-at-P0 failure: mean rho
**0.10151**, sign consistency 70.6%, mean top-1 0.000, mean top-3 0.046.

**Control C — synthetic instrument control.** See §11.

---

## 11. Control C and the instrument repair (§11)

Control C is deterministic, analytic and about the **instrument only**. It makes no claim about
model behaviour. Each case's rho is known by construction:

| Case | Construction | Expected | Observed | Pass |
| --- | --- | --- | --- | --- |
| monotone-positive | `w_i = 3·v_i + 7` | +1 | +1 | ✅ |
| order-reversed | `w = reverse(v)` | -1 | -1 | ✅ |
| degenerate-constant | `w_i = 5` for all `i` — zero rank variance | 0 | 0 | ✅ |
| self-identity-with-ties | 63 tied entries plus one outlier, compared with itself | +1 | +1 | ✅ |
| exhaustive-permutation-closed-form | all 5040 permutations of `n=7` vs the independent closed form `1 - 6Σd²/(n(n²-1))` | 0 (max discrepancy) | 1.1e-16 | ✅ |

**All five pass.** The exhaustive case checks the midrank Spearman against a *second, independent*
implementation over an entire permutation group, so the correlation code is validated against
something other than itself.

**This control earned its place.** In its first form the degenerate-constant case and an
"interleaved" case both failed, exposing the ordinal tie-break described in §3.3 — an instrument
defect that would have injected a fabricated positive ordering into a sparse distribution. The
defect was fixed to midrank, the control was strengthened, and the experiment was re-run end to
end. No result reported in this document comes from the uncorrected instrument.

---

## 12. Failure states vs intact states (§12)

| Population | n | mean rho | sign consistency |
| --- | --- | --- | --- |
| **Target (P0 failure states)** | 11 | **0.04106** | 63.6% |
| Control A (intact P0 steps) | 210 | 0.10456 | 72.9% |
| Control B (real P0 → P1 transitions) | 51 | 0.10151 | 70.6% |

**The failure states are *less* phase-correlated than either control**, by roughly 0.060 in the
mean: `failure − intactP0 = -0.0635`, `failure − realP1 = -0.0604`.

§12 forbids reading causality into either direction, and this is exactly why. The comparison does
not show that phase symmetry *causes* corruption — it shows the opposite ordering. If P0 corruption
were phase-blind candidate ranking, the failure states should look *more* like a P1 ranking than
the intact states do, not less. They do not.

The honest reading is narrower and more useful: **phase-blind carry-over is a real but weak
property of this frozen model in general** (the intact populations show mean rho ≈ 0.10, with only
7–19% top-10 overlap), **and the states that actually corrupted are not distinguished by having
more of it**. On this evidence the P0 corruption is not explained by a stronger phase-blind
continuation ranking at the failure points.

---

## 13. Conditioning-byte robustness (§19-D guard)

The primary construction commits to one conditioning byte per state. If the sign of the aggregate
depended on *which* byte was appended, the result would describe the conditioning byte rather than
the byte-phase condition, and the pre-registered rule sends that to **D Confounded**.

All **51** legal lead bytes in `[0xC2, 0xF4]` were swept across all 11 states. Nothing was selected
from the sweep; only its sign was used.

| Quantity | Value |
| --- | --- |
| Legal lead bytes swept | 51 |
| Positive means | **51** |
| Negative means | **0** |
| Mean rho over lead bytes | 0.21159 |
| Range | +0.00234 … +0.34284 |

**The sign is robust** — every one of the 51 conditioning bytes yields a positive mean rho, so the
result is **not** a conditioning-byte artefact and D does not apply.

The magnitude is not robust, and that is a genuine finding worth stating plainly: the mean rho over
all legal leads (0.2116) is **five times** the primary value (0.0411). The model's own
highest-logit lead sits near the **bottom** of the sweep — `0xE4` is the *weakest* of all 51
(rank 51), `0xEF` rank 50, `0xE6` rank 48, `0xE5` rank 47, `0xE9` rank 43, `0xE8` rank 45. The
strongest lead (`0xC6`, 0.3428) is close to a 2-byte lead.

So the *direction* of the effect is a stable property of the frozen model, while its *strength*
depends heavily on which byte opens the character — and the conditioning rule this phase
pre-registered lands on the low end of that spread. Any future phase that wants the effect's
magnitude rather than its sign must pre-register the lead byte **before** measuring, and must say
why.

---

## 14. Decision (§19)

Applying the pre-registered rule to the pre-registered statistic only:

> **Outcome B — Partially supported.**
>
> mean rho **0.0411** is positive and above the null mean **0.0004**, but **inside** the 95%
> permutation interval **[-0.0766, 0.0727]**, and only **64%** of states share the sign (66.7%
> required).

H103 is **neither supported nor refuted**. The P0 continuation-byte ranking and the forced-P1
continuation-byte ranking are weakly and non-significantly related at matched byte values; the
relationship points in the predicted direction and survives the confound guard, but it is not
distinguishable from chance at the pre-registered criterion, and the states that corrupted carry
*less* of it than the states that did not.

No block was raised. Neither `BLOCKED — Phase-102 P0 state not reproducible` nor
`BLOCKED — forced-P1 construction is not well-defined under frozen tokenizer state` applies: the
§14 gate passed at tolerance 0 on all 11 states, and all 11 constructions were valid.

---

## 15. Mechanistic interpretation

What Phase 103 adds to Phase 102, stated no more strongly than the data allows:

1. **The P0 ranking is not the P1 ranking re-indexed.** A mean Spearman of 0.041 with a top-1
   overlap of exactly zero means the model's most-preferred byte at a boundary is essentially
   never its most-preferred byte one byte later. A strongly phase-blind ranker would not do that.

2. **The model is not phase-blind in general either.** The intact populations show only ≈0.10,
   with 7–19% top-10 overlap. Even where the model is doing the *right* thing, its continuation
   ranking at a boundary carries only a weak relationship to the ranking one byte in. The
   carry-over is a weak tendency of the frozen model, not a strong invariant.

3. **The corruption points are not the most phase-blind points.** They are *less* correlated than
   the intact steps by ≈0.06. Whatever produces the fatal continuation-byte emission at P0, it is
   not simply "the model ranking bytes as if it were already mid-character, only more so".

4. **The fatal byte is the model's top choice at P0 and near its last choice at P1.** Rank 1 → mean
   rank 43.5. This is consistent with Phase 102's picture — the model at a boundary is confident
   about a byte that is illegal there — while adding that the very same byte's rank collapses the
   moment one byte of real context exists. The phase information, once present, is decisive; the
   failure is that at a boundary there is no phase information to act on, and the model's
   confidence does not carry the right *ranking* forward.

None of these four statements identifies the mechanism. They constrain it: the mechanism is not a
global phase-blindness of the ranking function, and not a uniform carry-over between adjacent
byte positions. It is more local than either.

---

## 16. Limitations, what is NOT proven, and Phase-104 recommendation

### Sample

**n = 11.** §21 forbids sweeping prompts or checkpoints to buy power, and none was swept. Eleven
states buy a 64-value rank correlation, and the resulting 95% permutation interval is wide enough
to contain the observed statistic. The primary conclusion — "not distinguishable from chance at
α = 0.05" — is **as much a statement about the sample as about the mechanism**. A larger sample
might separate the effect from chance; this phase deliberately did not build one, because doing so
after seeing a near-miss is exactly the tuning §10 forbids.

### What Phase 103 does NOT prove

- **It does not show that P0 corruption *is* phase-blind ranking.** That is the hypothesis, and it
  is neither confirmed nor refuted.
- **It does not show P0 corruption is *unrelated* to phase.** Outcome B is an absence of
  significance, not evidence of absence, and the point estimate is positive.
- **It does not establish causality in either direction** for the failure-vs-intact comparison
  (§12). The failure states are less correlated, but the intact states are also correlated, and
  neither ordering identifies a cause.
- **It does not characterize the *magnitude* of phase symmetry** — the 51-lead sweep spans
  0.0023 … 0.3428, and the primary conditioning byte sits at the bottom of that spread. Only the
  *sign* is robust.
- **It does not replace the P12-MASK / P012-MASK evidence.** 12 → 11 → 0 remains the operational
  result; Phase 103 only probes the ranking that produces it.
- **The legal-subset metric carries no information here**, because every selected conditioning lead
  admits all 64 continuation bytes. This is stated rather than presented as a null result.

### Phase-104 recommendation — exactly one next falsifiable hypothesis

> **H104:** If the P0 continuation-byte emission is not a weaker version of the P1 ranking but a
> *separate* ranking that happens to share the continuation alphabet, then the P0 distribution's
> top continuation byte should be predictable from the frozen model's **preceding** character
> boundary — that is, the same prefix one byte *earlier* — at a rate that significantly exceeds the
> Phase-103 identity-mapping correlation, while remaining uncorrelated with the forced-P1
> distribution at matched byte values.

**Falsifier:** if the P0 continuation ranking's correlation with the *preceding* boundary's
continuation ranking is not significantly greater than 0.0411 under the same permutation null, the
"separate ranking" account is refuted and the phase-blind-carry-over account must be re-examined
with a larger pre-registered sample.

This is falsifiable, uses only frozen checkpoints, requires no training, and is measurable with the
instrument Phase 103 already built and validated — the P0 distribution is already recorded, and the
one-byte-earlier boundary is a replayable prefix.

**Phase 104 is not begun.**

---

## Integrity

| Item | Result |
| --- | --- |
| Training | **NOT RUN** |
| Checkpoints modified | No — all four sha256 match Phase-102 digests |
| Tokenizer / vocabulary / merge table modified | No |
| Model architecture modified | No |
| Generation algorithm / decoder modified | No |
| Evaluator / Phase-95 thresholds modified | No |
| Prompts / sampling parameters / rollout modified | No |
| Phase-102 mask semantics modified | No |
| Production decoding constraint added | No |
| Mask applied to primary logits | **No** |
| `Math.random` used | No — seeded Fisher–Yates only |
| `setTimeout` used | No |
| Production file digests vs Phase-102 | Match |
| Writes | `experiments/phase103/` artifacts only |

### One pre-existing contract Phase 103 initially tripped, and the fix

Phase 102 left a containment assertion in its own suite: **the Phase-102 P0/P1/P2 mask must be
imported by nothing outside `experiments/phase102` and its suite.** The first full-suite run of
Phase 103 failed exactly that check, on `experiments/phase103/phase-symmetry-audit.ts`.

The violation was a **comment**, not a call. Two explanatory comments in the instrument named the
mask symbol while describing that Phase 103 does *not* apply it. One of them was also stale: it
claimed the mask "appears below only to identify the legal candidate set", when
`selectConditioningLeadByte` in fact tests legality by walking the byte through the repository's own
`leadSequenceLength` predicate and never touches the mask.

Both comments were rewritten to state the true mechanism without naming the frozen symbol. Phase
103 imports and invokes the Phase-102 mask **nowhere**, and after the correction Phase 102's suite
passes 208/0 on its own contract. The episode is recorded here because a containment contract that
only holds by accident is not a containment contract, and because Phase 103's own `§2` requirement
— *add no production decoding constraint* — is exactly what that assertion exists to protect.

## Validation

| Check | Result |
| --- | --- |
| Phase-103 focused suite | **181 passed, 0 failed, 0 skipped** |
| Research suite (Phase 57–103) | see §Validation in the final response |
| `tsc --noEmit` | Phase-103 errors: **0** |
| `npm run build` | see final response |
| `git status --short` | see final response |

## Artifacts

| Artifact | Path |
| --- | --- |
| Instrument | `experiments/phase103/phase-symmetry-audit.ts` |
| Probe | `experiments/phase103/probe.ts` |
| Probe results | `experiments/phase103/probe-results.json` |
| Correlation results | `experiments/phase103/correlation-results.json` |
| Manifest | `experiments/phase103/manifest.json` |
| Focused suite runner | `experiments/phase103/run-phase103-suite.ts` |
| Probe launcher | `experiments/phase103/run-probe.cmd` |
| Test suite | `src/lib/minimind/research/tests/phase103-phase-symmetry.test.ts` |
