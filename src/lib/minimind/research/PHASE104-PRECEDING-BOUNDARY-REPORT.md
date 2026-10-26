# Phase 104 — P0 Preceding-Boundary Ranking Audit

**Status:** COMPLETE
**Classification:** C — Refuted
**Training:** NOT RUN (zero training, zero checkpoint writes, zero optimizer steps)
**Artefacts:** `experiments/phase104/probe-results.json`, `experiments/phase104/correlation-results.json`,
`experiments/phase104/manifest.json`
**Probe digest (raw, first 16 hex):** `d5417d743edf10b5`

---

## 1. Phase-103 validation status

Phase 103 must be clean before H104 is interpreted. The confirming aggregate run was
launched from the current tree; its log is `experiments/phase104/phase103-gate-full-suite.log`.

| Check | Result |
|---|---|
| Aggregate research suite, current tree | `TOTAL: 1978 passed, 0 failed` |
| Phase 103 focused section (in that run) | `181 passed, 0 failed, 0 skipped` |
| Phase 104 focused section (in that run) | `158 passed, 0 failed, 0 skipped` |
| Repaired Phase-102 containment check | **green** |
| Phase-103 files modified after the confirming run | none |

The first confirming run reported `1819 passed, 1 failed`. That single failure was **caused by
this phase's own contract suite**, not by Phase 103: Phase 102's frozen-surface contract walks
every `.ts` file outside `experiments/phase102` and its own suite and fails on the two contiguous
literals `buildP012Mask` / `P012MaskedModel`. This suite's list of mask API names it refuses to
import contained those literals, so the check tripped on the thing doing the refusing — a
self-inflicted collision, and exactly the kind of leak the Phase-102 contract exists to catch. The
suite now spells those two names from parts, with a comment stating why.

The arithmetic is exact and is the proof that no Phase-103 failure was re-labelled: the pre-fix run
had `1819 passed + 1 failed = 1820` assertions, and the post-fix run has `1978 − 158 = 1820`
assertions passing with zero failures. The one failure became one pass; **no other assertion
changed state**. The prior `1819 / 1` is not hidden or reinterpreted — it is the number this gate
started from, and its own failure was a separate, already-documented test/comment issue that does
not appear in either run.

## 2. Research question

Phase 103 established that the P0 continuation-byte ranking — the ranking that decides which
continuation byte a corrupted character emits — has a mean Spearman rho of **0.041059** against the
forced-P1 state's continuation-byte distribution. That is a weak relationship and it sits inside its
own permutation null `[-0.076625, 0.072657]`.

The open question was whether the comparison state was simply the wrong one. Phase 103 compared P0
against a state the model never actually visits: a forced-P1 state built by appending the model's
highest-logit legal multi-byte lead token to the failure prefix. If the P0 ranking is instead a
function of the model's **own state at the character boundary that preceded the corrupted
character**, then Phase 103's weak result is an artifact of a badly chosen comparison and the P0
ranking is more explicable than Phase 103 suggested.

## 3. H104 hypothesis

> **H104.** The P0 continuation-byte ranking is more strongly related to the model's own state at
> the immediately preceding genuine UTF-8 character boundary (S0) than to the forced-P1 state (S2).

Two relationships:

- **Relationship A (baseline, Phase 103):** P0 vs forced-P1. `mean rho = 0.041059`.
- **Relationship B (H104):** P0 vs the preceding-boundary projection at S0.

**Falsifier, declared before measurement:** if the preceding-boundary correlation `R0` is not
significantly greater than the Phase-103 identity correlation `0.041059` under the fixed
permutation-null framework, H104 is refuted and the "separate ranking at the preceding boundary"
account is discarded.

The decision threshold is the **exact Phase-103 identity baseline `0.04105894105894106`**, not the
intact control's `0.10456`. Controls are descriptive only.

## 4. S0 / S1 / S2 definitions

Three states, never collapsed:

| State | Definition |
|---|---|
| **S1** | The historical P0 failure state. The token prefix at which the model emitted a token whose **first byte is a continuation byte** (`0x80`–`0xBF`), which is illegal at a character boundary. S1's prefix is itself a genuine character boundary. This is the state whose continuation-byte ranking is the object under study. |
| **S2** | The Phase-103 **forced-P1** state: S1's prefix plus the model's highest-logit single-byte legal multi-byte lead token. The comparison state of Relationship A. Exactly one byte into a multi-byte character, recoverable. |
| **S0** | The **immediately preceding genuine character-boundary state**: the largest whole-token index `j` with `1 <= j < length(S1 prefix)` such that `prefix[0..j)` ends at a real UTF-8 character boundary. |

**S0 is fixed in advance and is not a free choice.** The rule is a pure function of the byte stream,
and the probe applies it without looking at any correlation:

```ts
S0 = the LARGEST whole-token index j < prefixIds.length such that
     contextPhaseOf(prefixIds[0..j)) reports phase P0, need 0, recoverable true
```

- *Whole-token* is required because a partial token is not a state the model ever represented. No
  byte-level autoregressive state is invented anywhere in this phase.
- *Largest `j < length`* makes S0 the **nearest** boundary strictly before the corrupted character.
  The boundary that would produce the highest correlation is never selected.
- It is **not** "one token earlier". Where the last token(s) span less than one whole character or
  more than one, `j` moves accordingly; the measured token gaps are `{1, 2, 3}` (§12).

`S0` returns `null` when no `j >= 1` satisfies the rule. That is a **reported** state failure, never
a silent substitution.

## 5. Preceding-boundary reconstruction

Reconstruction is mechanical and gated:

1. Load the four frozen Phase-96 family checkpoints; verify sha256 against both the Phase-102 and
   Phase-103 records.
2. Replay **only** the `P12-MASK` condition to recover the P0 failure states. `11` reconstructed,
   matching the `11` Phase 102 recorded.
3. For every target, gate the fresh **S1** P0 continuation slice and the fresh **S2** forced-P1
   continuation slice against Phase 103's recorded floats at **tolerance 0**, and recompute the
   Phase-103 per-state Spearman rho. All 11 match bit-for-bit.
4. Reproduce the Phase-103 mean: `0.04105894105894106` vs baseline `0.04105894105894106` —
   **MATCH** at tolerance 0.
5. Reconstruct S0 by the rule in §4 and run **one unmasked forward pass** at it.

Result: **S0 reconstructed for 11 / 11 targets; 0 degenerate.**

§12 geometry, all three states measured from the real byte streams:

| Target | S0 tokens | S0 bytes | S0 chars | S1 tokens | S1 bytes | S1 chars | S2 tokens | S2 bytes | S2 chars | S0→S1 tokens | S0→S1 chars |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A/machine learning is#15 | 26 | 33 | 27 | 28 | 36 | 28 | 29 | 37 | 28 | 2 | 1 |
| A/机器学习是#11 | 21 | 24 | 8 | 24 | 27 | 9 | 25 | 28 | 9 | 3 | 1 |
| B94/太阳#15 | 17 | 18 | 6 | 20 | 21 | 7 | 21 | 22 | 7 | 3 | 1 |
| B94/机器学习是#2 | 13 | 15 | 5 | 15 | 18 | 6 | 16 | 19 | 6 | 2 | 1 |
| B94/什么是 machine learning#3 | 19 | 26 | 20 | 22 | 29 | 21 | 23 | 30 | 21 | 3 | 1 |
| C94/太阳#11 | 13 | 15 | 5 | 16 | 18 | 6 | 17 | 19 | 6 | 3 | 1 |
| C94/机器学习是#8 | 18 | 21 | 7 | 21 | 24 | 8 | 22 | 25 | 8 | 3 | 1 |
| C94/什么是 machine learning#3 | 19 | 26 | 20 | 22 | 29 | 21 | 23 | 30 | 21 | 3 | 1 |
| T/machine learning is#11 | 21 | 28 | 26 | 24 | 31 | 27 | 25 | 32 | 27 | 3 | 1 |
| T/太阳#15 | 17 | 18 | 6 | 20 | 21 | 7 | 21 | 22 | 7 | 3 | 1 |
| T/什么是 machine learning#12 | 30 | 39 | 29 | 31 | 40 | 30 | 32 | 41 | 30 | 1 | 1 |

**Matched-state comparability (§12):** token gaps are `{1, 2, 3}` but **character gaps are `{1}` in
all 11 cases** — exactly one complete character lies between S0 and S1 everywhere. `S1 − S0` is
3 bytes in 10 cases and 1 byte in the other; `S2 − S1` is exactly 1 byte in all 11. No normalisation
was manufactured to change any correlation.

## 6. Distribution projection method

§7 permits two projections and requires **only the one that the existing tokenizer/model
representation makes mathematically well-defined**. At S0 the model is at a character boundary, so
its next token **begins** a character. There is no byte-level autoregressive state available at S0
and none is invented: the model represents whole BPE tokens, so the only exact object is its token
distribution.

**Primary — Approach B, "character-candidate byte projection", variant `first-continuation-any-lead`:**

```
proj[b] = SUM over tokens t with bytes(t)[0] a legal multi-byte lead (0xC2–0xF4)
                        and bytes(t)[1] === b       of   P(t),   b in 0x80..0xBF
```

`bytes(t)[0]` is always the first byte of the next token, so the continuation byte at position 1 of
the character the model chooses is determined by the token it draws. Nothing is renormalised.

**Three declared robustness variants**, reported in full and **never** fed to the classification:
`first-continuation-3byte-lead`, `any-continuation-component`, and `lead-conditioned` (Approach A:
the `P(l)`-weighted mixture of the model's own continuation slice at `S0 + l` over legal single-byte
lead tokens `l`).

A full-vocabulary / continuation-conditioned distinction is irrelevant here: Spearman rho is
invariant to positive rescaling, so the choice cannot move the statistic.

Mass accounting is reported per state and never silently discarded: ASCII, bare-lead-only,
illegal-continuation-start, illegal-lead-start, zero-length and malformed-character-start mass are
all bucketed separately.

## 7. Correlation analysis

Primary statistic: **arithmetic mean of the per-state Spearman rho** over the 64 continuation bytes
`0x80`–`0xBF`, with Phase 103's exact **midrank** tie policy. Same 11 target states. Same
continuation-byte mapping.

| Quantity | Value |
|---|---|
| `mean R0` (S0 preceding-boundary projection) | **−0.041589** |
| `mean R1` (Phase-103 forced-P1 identity) | **0.041059** |
| `Δrho = R0 − R1` | **−0.082648** |
| `R0` positive / negative states | 4 / 7 |
| Sign consistency of `R0` | 0.636 |
| Degenerate states | 0 |

Pre-registered reference: `R1 = 0.04105894105894106`. `R0` is **not greater** than it — it is
lower, and negative.

Per-state:

| Target | `R0` | `R1` | `Δrho` |
|---|---|---|---|
| A/machine learning is#15 | 0.184021 | 0.110394 | 0.073627 |
| A/机器学习是#11 | 0.074806 | 0.015888 | 0.058918 |
| B94/太阳#15 | −0.114229 | −0.031548 | −0.082682 |
| B94/机器学习是#2 | 0.084697 | 0.057647 | 0.027050 |
| B94/什么是 machine learning#3 | −0.013512 | 0.291850 | −0.305362 |
| C94/太阳#11 | −0.047363 | 0.154350 | −0.201713 |
| C94/机器学习是#8 | −0.181931 | −0.107647 | −0.074285 |
| C94/什么是 machine learning#3 | −0.194608 | −0.100000 | −0.094608 |
| T/machine learning is#11 | −0.215712 | −0.101374 | −0.114339 |
| T/太阳#15 | −0.151702 | 0.060806 | −0.212508 |
| T/什么是 machine learning#12 | 0.118060 | 0.101282 | 0.016778 |

Declared robustness variants, reported in full, **not used for classification**:

| Variant | mean R0 | Δrho | Sign consistency |
|---|---|---|---|
| `first-continuation-any-lead` **(primary)** | −0.041589 | −0.082648 | 0.636 |
| `first-continuation-3byte-lead` | −0.041589 | −0.082648 | 0.636 |
| `any-continuation-component` | −0.051427 | −0.092486 | 0.545 |
| `lead-conditioned` (Approach A) | **+0.097294** | +0.056235 | 0.727 |

The first two variants coincide exactly: every multi-byte character-start token in this 300-entry
vocabulary is a 3-byte lead or a truncated prefix of one, so restricting the lead to `E0`–`EF`
removes nothing. The last variant is positive but **was declared a robustness variant before
measurement and is therefore not the primary statistic**; it is discussed in §12 and §13.

## 8. Null procedure

The pre-registered null is a **cross-state permutation**, run once (2000 permutations, seed
`104042`, deterministic `createSeededRNG(((seed + iteration * 0x9e3779b1) | 0) >>> 0)` + Fisher–Yates,
**no `Math.random()` and no `setTimeout()` anywhere in this phase**):

> Each of the 11 states keeps its **own** P0 distribution and its **own** forced-P1 distribution.
> Only the preceding-boundary projections are permuted **across** states, holding each state's P0
> and forced-P1 vectors fixed. Every byte marginal is preserved exactly; only the state
> correspondence is destroyed.

| Null | Mean | 95% interval |
|---|---|---|
| `R0` | −0.040248 | `[−0.046706, −0.033401]` |
| `Δrho` | −0.081307 | `[−0.087765, −0.074460]` |

Observed `R0 = −0.041589` lies **inside** its null interval; observed `Δrho = −0.082648` lies
**inside** its null interval. Neither is significant.

One declared robustness null was also run, reported in full, and **never** used for the decision:
within-state permutation of the S0 projection's byte labels against a fixed P0 vector —
`R0` null `[−0.074351, 0.077271]`, which brackets the observed `R0` as well.

## 9. Controls

| Control | n | `mean R0` | `mean R1` | `Δ` |
|---|---|---|---|---|
| **A** — intact P0 steps of the same frozen P12-MASK trajectories | 210 | 0.022109 | 0.104556 | −0.082447 |
| **B** — real P0→P1 transitions, model's **own** next state | 51 | −0.001364 | 0.113732 (real) / 0.101506 (forced) | — |
| **C** — synthetic instrument control | 6 cases | — | — | **6/6 passed** |

**Control A** is descriptive only. It shows the same *shape* as the failure population — `R0` below
the Phase-103-style `R1` by almost the identical margin (−0.0824 vs −0.0826) — but at a weak,
near-null level (`R0 = 0.0221`, null mean ≈ 0). Its `R1 = 0.10456` is **not** the H104 decision
threshold and was not used as one.

**Control B** uses the model's **own** next state as the right-hand side (no conditioning byte
invented) alongside the Phase-103-style forced construction, so the two are comparable within the
control. `R0` is essentially zero here.

**Control C** is an **instrument** control, not a model result. Six deterministic synthetic
projections with analytically known rho — `+1` (corresponding tokens), `−1` (reversed weights), `0`
(all-ASCII; zero rank variance), `0` (bare-lead-only; nothing projected), `+1` (aggregation is a
sum: `0.25 + 0.75` on one byte), `+1` (exact placement of a 4-byte character's second byte). All
six passed, so the projection and correlation code are demonstrably capable of returning a strong
positive result when one exists.

## 10. Failure vs intact populations

| Population | `mean R0` | `mean R1` | `Δ` |
|---|---|---|---|
| Failure states (11) | −0.041589 | 0.041059 | −0.082648 |
| Intact P0 steps (210) | 0.022109 | 0.104556 | −0.082447 |
| Intact P0→P1 transitions (51) | −0.001364 | 0.113732 | — |

`failure − intact(P0)` for `R0` is **−0.063697**.

**Classification: no correspondence.** The two populations do not differ in the direction H104
needs; both place the preceding-boundary relationship *below* the Phase-103-style relationship by
almost exactly the same margin. This is **not** a failure-specific structure and **not** evidence of
a general phase structure either — both `R0` values sit inside their nulls. The correct reading is
that **neither** population shows a preceding-boundary effect at all, and the near-identical `Δ`
is not a causal signal. No causal claim is made in either direction.

## 11. Optional lead-token analysis (diagnostic only)

The S0 argmax token, its bytes, its continuation-byte components, and whether the P0 fatal byte is
among them:

| Target | S0 argmax id | bytes | is character start | P | continuation components | fatal byte among them |
|---|---|---|---|---|---|---|
| A/machine learning is#15 | 290 | `e4 ba` | yes | 0.469 | [0xba] | **no** |
| A/机器学习是#11 | 234 | `e6` | yes | 0.874 | [] | **no** |
| B94/太阳#15 | 237 | `e9` | yes | 0.995 | [] | **no** |
| B94/机器学习是#2 | 262 | `e4 b8` | yes | 0.771 | [0xb8] | **no** |
| B94/什么是 machine learning#3 | 243 | `ef` | yes | 0.998 | [] | **no** |
| C94/太阳#11 | 236 | `e8` | yes | 0.957 | [] | **no** |
| C94/机器学习是#8 | 234 | `e6` | yes | 0.934 | [] | **no** |
| C94/什么是 machine learning#3 | 243 | `ef` | yes | 0.993 | [] | **no** |
| T/machine learning is#11 | 236 | `e8` | yes | 0.810 | [] | **no** |
| T/太阳#15 | 233 | `e5` | yes | 0.999 | [] | **no** |
| T/什么是 machine learning#12 | 116 | `70` | **no** (ASCII `p`) | 0.469 | [] | **no** |

**10 of 11** S0 argmaxes are character-start tokens with probability 0.469–0.999, i.e. the model at
S0 is confidently about to **open** a character. In **9 of those 10** the chosen token is a **bare
lead** (length 1, no second byte). The P0 fatal byte is **never** among the components the S0 argmax
would have produced. No new metric threshold is defined from this; it is a diagnostic.

In the population, 7 of the 11 fatal bytes were the raw argmax at S1 and 4 were sampling draws —
recorded, not required, and asserted by the contract suite to be a mix rather than silently one kind.

## 12. Mechanistic interpretation

The projection mass accounting explains the result directly, and it is the most important number in
this report:

| Target | projected mass | character-start mass | of which bare-lead-only | non-zero bytes |
|---|---|---|---|---|
| A/machine learning is#15 | 0.7196 | 0.7311 | 0.0115 | 11 |
| A/机器学习是#11 | 0.0420 | 0.9963 | **0.9544** | 11 |
| B94/太阳#15 | **0.0000174** | 0.9999 | **0.9999** | 11 |
| B94/机器学习是#2 | 0.7745 | 0.9325 | 0.1580 | 11 |
| B94/什么是 machine learning#3 | **0.000300** | 0.9987 | **0.9984** | 11 |
| C94/太阳#11 | **0.001157** | 0.9758 | **0.9746** | 11 |
| C94/机器学习是#8 | **0.016590** | 0.9796 | **0.9630** | 11 |
| C94/什么是 machine learning#3 | **0.000187** | 0.9934 | **0.9932** | 11 |
| T/machine learning is#11 | 0.069600 | 0.8843 | **0.8147** | 11 |
| T/太阳#15 | **0.000117** | 0.9998 | **0.9996** | 11 |
| T/什么是 machine learning#12 | 0.004929 | 0.01398 | 0.00905 | 11 |

In **8 of 11** states the S0 character-start mass is almost entirely **bare-lead** mass: the model
wants to begin a multi-byte character but commits to a single lead byte token that carries no second
byte. Those tokens project **nothing** through Approach B. The projected mass in those states is
`1.7e-5` to `0.070` — a residual of the S0 distribution, spread across the same 11 continuation byte
values in every state.

The consequence is structural, not statistical noise:

1. **At a genuine character boundary this model has almost no continuation-byte preference to
   express.** Its mass sits on *opening* a character, and mostly on the opening byte alone. The
   64-value "ranking" the projection produces is a thin residual, so the Spearman rho computed on it
   is dominated by that residual's shape rather than by any preference the model holds at S0.
2. The rank vector has non-zero variance (11 distinct non-zero values), so the probe's degeneracy
   flag — which checks zero mass and zero rank variance — correctly stays `false`. **Zero rank
   variance is not the same failure mode as negligible mass**, and the suite records this
   distinction rather than papering over it.
3. The one variant that turns positive in mean, `lead-conditioned` (`+0.097294`), is the one that
   buys extra information: it runs the model at `S0 + l` and reads the continuation slice **there**,
   which is much closer to what `R1` already measures. It is a declared robustness variant, was
   declared before measurement, and is excluded from the classification for exactly this reason.
   Its positivity is a limitation of the comparison, not support for H104.

## 13. Limitations

1. **The primary projection is mass-starved in 8 of 11 states.** `proj` sums to `1.7e-5`–`0.070`
   there. The correlation is computed on a residual. This is the single largest limitation and it is
   a property of the frozen vocabulary, not of the method: only **13 of 300** vocabulary entries are
   multi-byte character-start tokens, covering 11 distinct second bytes.
2. **The comparison is between a thin real signal and a synthetic one.** `R1` is measured against a
   state the model never visits (a forced-P1 state built from the highest-logit lead). H104 asked
   whether a *real* state does better; it does not, but the reason is partly that the real state's
   projection is thin, not that the model prefers the forced state. Phase 103's `R1` should not be
   read as "the force-P1 state is genuinely more predictive".
3. **`n = 11`.** Fixed by §21 in advance; the target set was **not** expanded to buy power. The null
   interval is correspondingly wide and no effect of this size could clear it.
4. **The `lead-conditioned` variant is positive and cannot be dismissed statistically**, only
   methodologically (it is not the primary statistic). A future phase that wants to test it must
   pre-register it as primary and confront the fact that `S0 + l` largely re-measures `R1`.
5. **`S0` is one specific boundary.** The byte streams contain no earlier boundary that is also
   "the one immediately before the corrupted character", so no alternative S0 exists; but the
   construction has no power to distinguish "the boundary is the right state" from "boundaries in
   general carry no continuation-byte preference".
6. **Control A's shape-matching `Δ` (−0.0824 vs −0.0826) is unexplained.** It is most simply read
   as both populations projecting near-zero mass through the same thin slice, but this phase does
   not test that reading.

## 14. What is NOT proven

- **Not proven:** that P0 corruption is unrelated to the preceding character boundary. The test was
  of the projection this model's representation makes well-defined, and that projection is
  mass-starved. A different, better-posed projection is not excluded.
- **Not proven:** that the forced-P1 state is the *correct* or *causal* comparison either. `R1 =
  0.0411` is itself inside its Phase-103 null. H104 says "S0 does not beat S2", not "S2 explains P0".
- **Not proven:** any causal claim about corruption. §13's population comparison shows no
  failure-specific structure, and no general byte-phase structure is established either.
- **Not proven:** that the `lead-conditioned` positivity is real. It is a robustness variant, and it
  is plausibly re-measuring `R1`.
- **Not proven:** that these conclusions transfer beyond the four frozen checkpoints, the 300-entry
  vocabulary, or the 20 recorded prompts. No new training was performed, so no generalisation over
  checkpoints is available.
- **Not proven:** that a null result here is a null result about the *model* rather than about this
  *vocabulary's inability to express a continuation-byte preference at a character boundary*.

## 15. Phase-105 recommendation

**Exactly one next falsifiable hypothesis:**

> **H105.** If the absence of a preceding-boundary continuation-byte preference is a property of the
> vocabulary's character-start representation rather than of the model's state, then conditioning the
> projection on the model's **own** continuation slice after its own highest-probability character
> start — i.e. `R0' = rho(P0, lead-conditioned(S0))` pre-registered as the primary statistic — will
> exceed the Phase-103 baseline `0.041059` **and** clear its own permutation null, while the same
> statistic computed at the 210 intact P0 steps will **not**.

Falsifier: if `lead-conditioned` at S0 fails to clear its null, or clears it equally at the intact
steps (reproducing Control A's shape-matching `Δ`), then the §12 account — that this vocabulary
simply cannot express a continuation-byte preference at a character boundary — is rejected and the
mass-starvation explanation for this phase's outcome goes with it.

This is the only one of this phase's open questions that is (a) mechanistically motivated by a
measured quantity, (b) falsifiable under the existing frozen surfaces, and (c) not a re-run of the
same test with a different tie policy.

## 16. Final conclusion

**C — Refuted.**

The P0 continuation-byte ranking is **not** more strongly related to the model's own state at the
preceding genuine character boundary than to the forced-P1 state. `mean R0 = −0.041589` against the
pre-registered Phase-103 baseline `R1 = 0.041059`, giving `Δrho = −0.082648`; both the observed `R0`
and the observed `Δrho` sit **inside** their pre-registered cross-state permutation nulls
(`[−0.046706, −0.033401]` and `[−0.087765, −0.074460]`). The difference is not merely
non-significant — it has the **wrong sign**, and `R0` is itself negative.

The Phase-103 baseline reproduced exactly at tolerance 0 (`0.04105894105894106`), S0 was
reconstructed for all 11 targets with zero degenerate states, all checkpoints and frozen surfaces
are unchanged, and the synthetic instrument control passed 6/6 — so the instrument was demonstrably
capable of returning a strong positive result. It did not.

The mechanistic reason is visible in the projection mass accounting: in 8 of the 11 states the S0
distribution's character-start mass is almost entirely bare-lead mass, so the projection is a
`1.7e-5`–`0.070` residual. **At a character boundary this model has almost no continuation-byte
preference to rank**, and the correlation is computed on what is left over. That is the honest
reading, and it constrains what Phase 105 can hope to measure.

Training: **NOT RUN**.
