# Phase 99 — CJK Transition Logit Mechanism Audit

**Instrument:** `experiments/phase99/logit-mechanism-audit.ts`
**Artifact:** `experiments/phase99/logit-mechanism-audit.json`
**Contract suite:** `src/lib/minimind/research/tests/phase99-logit-mechanism.test.ts` (107 checks)
**Date:** 2026-09-18

**Verdict: `E` — mixed mechanism.**
The recorded CJK/mixed interior corruptions are **not** one mechanism. Across the
12 reconstructed failure states the audit separates four measurable components: a
**decoding hazard** (5/12 — the model's own top-1 token was legal and a
low-probability illegal token was drawn), a **mid-sequence phase inversion**
(3/12 — mid-character, the probability mass moves onto new lead bytes), a
**boundary phase inversion** (3/12 — at a character boundary, the mass moves onto
bare continuation bytes), and a genuinely **under-ranked correct continuation**
(1/12). For the specific corpus-supported successor, Mechanism **B** holds
(9/12 at or below the uniform baseline, 10/12 outside the top-6). For a
structurally legal continuation, Mechanism **A** holds (best legal token at rank 1
in 5/12, inside the top-5 in 9/12). Mechanism **D** is refuted by measurement, not
by argument.

**Training: `NOT RUN`.** No checkpoint, tokenizer, vocabulary, dataset, prompt,
evaluator, threshold, generation rule or sampling parameter was changed.

---

## 1. Research question

Phase 98 established *that* CJK/mixed interior corruption occurs and classified
all 12 observed failures as `type2-boundary` (a legal, corpus-supported
continuation existed and was not taken). It did not establish **why**. For each
observed failure state, Phase 99 asks which of two mechanisms is present:

* **Mechanism A** — the model *assign[s] meaningful probability to the correct next
  token/byte, but choose[s] an incompatible continuation*. The correct
  continuation is represented in the learned distribution and is merely
  under-ranked.
* **Mechanism B** — the correct continuation *[is] effectively absent from the
  model's learned probability distribution*.

Neither mechanism was assumed before measurement. The audit also carries the
Phase-98 possibility space forward unchanged: **C** (byte-phase conditioning
failure), **D** (token representation ambiguity), **E** (mixed), **F**
(unresolved).

The question is mechanistic, not evaluative. A classification of A, B, C, D, E or F
says how the failure happens, not how good or bad the model is.

## 2. Phase-98 evidence carried into this phase

Phase 98's verdict was **`B` — boundary/transition corruption is the dominant
explanation**, with this recorded distribution over the 20 recorded generations
(5 prompts × 4 arms):

| Phase-98 category | Count |
| --- | --- |
| `type1-unsupported` (no legal continuation was ever supported) | **0** |
| `type2-boundary` (a legal, supported continuation existed and was not taken) | **12** |
| `type3-semantic` (byte-valid but differs from the corpus document) | **0** |
| `no-corruption` | 8 |
| `unresolved` | 0 |

Corpus-support levels at those 12 states: **2 `exact`, 10 `sparse`, 0 `none`**.
Phase 98 therefore ruled out Hypothesis A (corpus never supplies the
continuation) and retained Hypothesis B (a token-boundary / byte-sequence
problem) — but "a token-boundary problem" is a *description*, not a mechanism.
It does not distinguish "the model ranked a legal continuation just below an
illegal one" from "the model had no legal continuation to rank".

That distinction is what Phase 99 measures. The Phase-98 chain it continues:
Phase 92 tokenizer merge budget → **Outcome C** (tokenization improved, generation
did not); Phase 93 capacity → **Outcome B** (capacity is not the Level-4 blocker);
Phase 94 rollout augmentation → **Outcome D** (hurts, dose-dependent); Phase 95
instrument repair (oracle 100.000%, no verdict flipped); Phase 96 transfer →
**Outcome D** ("no transfer demonstrated", A vs T init-confounded); Phase 97
position/context alignment.

## 3. Methodology

**Read-only, zero-training.** The audit loads the existing checkpoints, encodes
the existing prompts with the existing tokenizer, replays the existing recorded
generations, and takes forward passes. It does not train, retrain, or modify any
checkpoint; it does not touch the tokenizer, vocabulary, dataset, architecture,
generation algorithm, sampling rule, prompt set, evaluator, Phase-95 thresholds,
rollout, objective, Phase-90 layout, or any Phase-95 metric. It performs no
parameter sweep, adds no runtime and no tokenizer, fabricates no logit or
probability, and uses neither `Math.random()` nor `setTimeout()`. (The suite
asserts each of these against the source text; the artifact's `integrity` block
records each as `false` / unchanged, with `productionModulesModified: []`.)

**Source of the audited states.** The 20 generations are read back from the
recorded Phase-95 / Phase-96 artifacts — the *same* recorded outputs Phase 98
audited, never a new sample. The generator for the primary measurement is one
deterministic forward pass, not the sampling loop.

**Primary measurement.** For each of the 12 failure states: rebuild the exact
model input (the prompt's token ids followed by the recorded generated tokens
strictly before the first invalid token), truncate to the frozen `MAX_CTX = 128`,
run **one** forward pass, and read the full next-token logits at the final
position. Nothing else is done to the state. No new token is sampled for the
primary audit.

**Why the generation loop is nevertheless replicated.** Phase 98's artifact
records probabilities, not raw logits, so the logits cannot be recovered from it;
they must be re-produced by a forward pass. To prove that the replayed prefix is
the state the model actually saw, the audit *also* replicates the production
generation loop step by step (one `createSeededRNG(SEED)` stream per arm,
consumed across the five prompts in order, exactly as the production evaluator
does) and compares the replicated logits at the failure step against the primary
forward pass. Disagreement throws; the audit refuses to report an unreconstructed
state.

**Frozen recipe (unchanged; inherited, not chosen here):** `SEED = 42`,
`VOCAB_TARGET = 300`, `MAX_TOKENS = 24`, `MAX_CTX = 128`, `TEMPERATURE = 0.8`,
`EOS_TOKEN_ID = 3`, `MERGE_TOKEN_MIN_ID = 260`. `K = 6` for "top-K" is the
existing project convention inherited from Phase 98, not a new constant.

**The one constant that is new** is the uniform baseline `1 / vocabSize =
0.003333…`. It is not a tuned threshold: "at or below uniform" literally means the
model has no preference for that token over chance. The gate rubric (thresholds,
letter rules) was written into the instrument before it was applied, and is
reported verbatim in the artifact under `decisionGate.rubric`.

**Byte phases (§6).** `P0` = at a character boundary (`need === 0`); `P1`/`P2`/`P3`
= one, two or three bytes into a multi-byte character, where
`consumed = sequenceLength - need`; `PX` = the stream is not recoverable. The phase
is **measured on the actual byte sequence the tokens produce**, never inferred
from token boundaries. The audit's independent walker is proved equal to the
Phase-98 `appendBytes` machine on `need`, `openAt` and `recoverable` at every
audited state; Phase 99's own contract suite re-derives that equality from the
frozen Phase-98 import.

**Control designs (§7), and one honest caveat.** The audit reports *two* control
populations. The `successful*` groups condition on the drawn token having been
legal, which **selects for states where the model was already doing well** and is
therefore biased upward. The unbiased population is `preCorruption`: every
decision taken while a trajectory's byte stream was still intact, i.e. every step
strictly before that trajectory's first invalid step. Both are reported; the
biased one is not used to draw conclusions the unbiased one contradicts.

## 4. Failure-state reconstruction

**Result: complete. 20/20 trajectories reproduced exactly; 12/12 failure states
reconstructed with bit-identical logits.**

| Arm | Checkpoint | Trajectories reproduced | Failure states |
| --- | --- | --- | --- |
| A | `experiments/phase90/phase90-aligned.ckpt.json` | 5/5 | 3 |
| B94 | `experiments/phase94/phase94-b.ckpt.json` | 5/5 | 2 |
| C94 | `experiments/phase94/phase94-c.ckpt.json` | 5/5 | 3 |
| T | `experiments/phase96/phase96-treatment.ckpt.json` | 5/5 | 4 |

Each reconstructed state passed three independent reliability probes:

1. **Replay determinism** — the identical forward pass over the identical input,
   run twice, produced bit-identical logits at every one of the 12 states.
2. **Reconstruction identity** — the primary forward pass over the replayed prefix
   produced logits bit-identical to those the replicated generation loop produced
   at the same step from an independently constructed context.
   `reconstructionMaxAbsLogitDiff` is `0` for all 12
   (`allReconstructionsAgree: true`).
3. **Phase-walker equality** — the Phase-99 walker agreed with the Phase-98
   `appendBytes` machine at every one of the 12 states
   (`phaseWalkerAgreesWithAppendBytes: true`).

The failure token positions and byte offsets also cross-check against Phase 98:
the artifact's `phase98NeedAtFault` equals the measured `need` at every state, and
the per-sample corpus-support counts were re-measured identically
(`corpusSupportCrossCheck.agreesWithPhase98: true` for 12/12, with the per-field
mismatch list empty).

Failure states by phase: **P2 = 5, P0 = 5, P1 = 2** (`PX` = 0). By language:
**zh = 6, mixed = 4, en = 2**. `corpusSupportedAtEveryFailure: true` — at every
audited state a legal, corpus-supported continuation existed.

## 5. Logit results

The corpus-supported successor is defined Phase-98-style as the legal vocabulary
id with the highest corpus bigram count after the audited predecessor. All
figures are raw logits (temperature-free) from the single forward pass.

| Arm / prompt | Idx | Phase | Support | Supported id (bytes) | Supported logit | Actual id (bytes) | Actual logit | Argmax id (bytes) | Argmax logit | Margin (supported − actual) | Supported above uniform? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A / machine learning is | 6 | P2 | sparse | 145 (`8d`) | 6.3719 | 233 (`e5`) | 8.3304 | 234 (`e6`) | 9.0225 | −1.9585 | yes |
| A / 机器学习是 | 11 | P0 | sparse | 233 (`e5`) | 0.9205 | 169 (`a5`) | 9.3093 | 169 (`a5`) | 9.3093 | −8.3888 | no |
| A / 什么是 machine learning | 4 | P1 | sparse | 148 (`90`) | 5.2843 | 291 (`61 6c`) | 5.5358 | 291 (`61 6c`) | 5.5358 | −0.2515 | yes |
| B94 / 机器学习是 | 2 | P0 | **exact** | 233 (`e5`) | −0.3903 | 138 (`86`) | 5.3886 | 161 (`9d`) | 5.8090 | −5.7789 | no |
| B94 / 什么是 machine learning | 3 | P0 | sparse | 233 (`e5`) | −0.1303 | 145 (`8d`) | 3.1009 | 104 (`64`) | 5.3523 | −3.2312 | no |
| C94 / 太阳 | 10 | P2 | sparse | 167 (`a3`) | 2.4260 | 235 (`e7`) | 9.6053 | 235 (`e7`) | 9.6053 | −7.1793 | no |
| C94 / 机器学习是 | 3 | P1 | **exact** | 148 (`90`) | 4.0887 | 293 (`e8 bf`) | 2.7996 | 161 (`9d`) | 5.5874 | +1.2891 | yes |
| C94 / 什么是 machine learning | 3 | P0 | sparse | 233 (`e5`) | −0.1949 | 169 (`a5`) | 6.2820 | 169 (`a5`) | 6.2820 | −6.4769 | no |
| T / machine learning is | 7 | P2 | sparse | 154 (`96`) | −0.3954 | 236 (`e8`) | 3.8403 | 139 (`87`) | 5.3967 | −4.2357 | no |
| T / 太阳 | 8 | P2 | sparse | 133 (`81`) | 0.0788 | 235 (`e7`) | 3.3725 | 138 (`86`) | 6.4945 | −3.2937 | no |
| T / 机器学习是 | 12 | P2 | sparse | 162 (`9e`) | −2.8997 | 234 (`e6`) | 7.2243 | 234 (`e6`) | 7.2243 | −10.1240 | no |
| T / 什么是 machine learning | 12 | P0 | sparse | 36 (`20`) | 0.2182 | 134 (`82`) | 0.5375 | 276 (`61 72`) | 4.8334 | −0.3193 | no |

Two facts are decisive here.

**First: the corpus-supported successor is essentially absent from the model's
preferences.** It is at or below the uniform baseline `1/300` in **9 of 12**
states, and outside the top-6 in **10 of 12**. Its rank is 1 in **0 of 12**; it
reaches the top-5 in 2 of 12 and the top-10 in 3 of 12. That is Mechanism B, for
the specific token, measured rather than argued.

**Second, and equally important: this does not mean the model had no legal
option.** At every state a legal continuation existed, and in most states the
model did rank *some* legal continuation highly. The gap between "the corpus's
most frequent legal successor" and "the model's best legal token" is the whole
content of §6.

Note the two `exact`-support states (B94 and C94 on `机器学习是`). At both, the
corpus supplies an exact continuation; at both, the corpus's successor is at or
below uniform. Exact corpus support and non-trivial model probability are
**different facts** (§12).

## 6. Probability / rank analysis

| Target | top-1 | top-5 | top-10 |
| --- | --- | --- | --- |
| Corpus-supported successor | **0 / 12** | 2 / 12 | 3 / 12 |
| Best legal continuation | **5 / 12** | 9 / 12 | 11 / 12 |

The model's best *legal* token averages probability **0.1721** at an average rank
of **3.83**. So a structurally valid continuation is usually well inside the
model's top-5 — it is simply not the token the corpus would have chosen, and it
is not always the token the model prefers either.

The critical split:

* **5 of 12** failure states had a **legal argmax** — the model's own top-1 choice
  would have kept the byte stream valid, and the corruption came entirely from the
  sampling draw. The drawn tokens at those states carried probabilities of
  **0.0129 (rank 12)**, **0.00627 (rank 20)**, **0.0423 (rank 4)**,
  **0.0125 (rank 8)** and **0.00117 (rank 51)**.
* **7 of 12** had an **illegal argmax**: the ranking itself was wrong, not merely
  the draw.

This split matters because the two halves have entirely different remedies, and
it is the reason the aggregate verdict is `E` rather than a single letter.

The audit's per-state descriptive labels (post-hoc, derived only from the
measured quantities, and *not* part of the pre-stated gate) decompose the set as:

| Label | Meaning | Count |
| --- | --- | --- |
| `sampling-draw` | argmax was legal; a tail illegal token was drawn | **5** |
| `midstate-new-lead` | illegal argmax, and ≥ 50% of mass on new lead bytes mid-character | **3** |
| `boundary-state-continuation` | illegal argmax, and ≥ 50% of mass on bare continuation bytes at a boundary | **3** |
| `under-ranked-legal` | illegal argmax, but legal continuations still hold ≥ 50% of mass | **1** |

The `sampling-draw` component is a property of the **decoding path**, not of the
learned distribution, and it has no letter in the A–F vocabulary. Reporting it as
part of "mixed" understates the mixture rather than overstating it.

## 7. Byte-phase analysis

| Population | Phase | States | Mean legal-continuation mass | Mean mass on bare continuation bytes | Mean mass on ASCII lead bytes | Mean mass on multi-byte lead bytes |
| --- | --- | --- | --- | --- | --- | --- |
| **Failed** | P0 | 5 | 0.5296 | **0.4699** | 0.3113 | 0.2183 |
| **Failed** | P1 | 2 | 0.7628 | 0.7628 | 0.1641 | 0.0726 |
| **Failed** | P2 | 5 | **0.3218** | 0.3218 | 0.0297 | **0.6483** |
| Intact (unbiased) | P0 | 188 | 0.9849 | 0.0151 | 0.7014 | 0.2835 |
| Intact (unbiased) | P1 | 41 | 0.9905 | 0.9905 | 0.0019 | 0.0075 |
| Intact (unbiased) | P2 | 44 | **0.9674** | 0.9674 | 0.0023 | **0.0303** |

Read against the unbiased population, the failure states show a **phase
inversion that runs in both directions**:

* at **P2** (two bytes into a 3-byte character, where the only legal first byte is
  a continuation byte) the mass on legal continuations collapses from **0.967 to
  0.322**, while the mass on new **multi-byte lead** bytes rises from **0.030 to
  0.648** — a **21×** increase. The model behaves as if the character were already
  complete.
* at **P0** (a character boundary, where a continuation byte is illegal) the mass
  on bare **continuation** bytes rises from **0.015 to 0.470** — a **31×**
  increase — and in the most extreme state (`A / 机器学习是` idx 11; argmax = the
  drawn token = byte `a5`, p = 0.929) to **0.997**. The model behaves as if a
  character were still open.

The two directions are complementary. That is the shape of an implicit phase
counter that has drifted by one stage, not of a model that ignores phase.

**The single sharpest measurement in this phase supports that reading.** The
artifact records `fatalTokenLegalFromBoundary` for every state: whether the token
the model actually committed to would have been *legal had the stream been at a
character boundary*. It is **true at all 7 mid-sequence failures (P1 and P2) and
false at all 5 P0 failures** — i.e. at every mid-character failure the fatal token
is exactly what the model should have emitted one stage earlier, and at every
boundary failure it is a token that is illegal from both readings. The failing
decisions are, in the most literal sense available, decisions taken one stage off.

But it is emphatically **not** a global inability to condition on phase. Across
the unbiased population the model places **98.5% (P0), 99.1% (P1) and 96.7% (P2)**
of its probability mass on tokens that keep the byte stream legal, and its argmax
is legal in **272 of 273** intact-state decisions (`argmaxCompatibleShare`
0.9963). Phase conditioning is present and strong in general; it fails at
specific states.

**The failures are abrupt, not gradual.** The step *immediately preceding* each
failure has mean legal-continuation mass **0.9699** and a legal argmax in
**12 of 12** cases. There is no visible degradation before the fault.

**Hazard by phase.** Counting every decision that began from an intact stream:

| Phase | Failures | Intact | Total | Hazard |
| --- | --- | --- | --- | --- |
| P0 | 5 | 188 | 193 | 2.6% |
| P1 | 2 | 41 | 43 | 4.7% |
| **P2** | **5** | **44** | **49** | **10.2%** |

P2 — two bytes into a 3-byte character — carries roughly four times the
per-decision hazard of a character boundary. Overall, **12 of 285** intact-stream
decisions corrupted, a per-decision hazard of **4.2%**. Over the frozen 24-token
horizon that predicts `1 − (1 − 0.042)^24 ≈ 64%` of generations corrupting; the
observed count is **12/20 = 60%**. The two agree within the resolution of n = 20,
which is a consistency check on the per-state measurements, not an independent
result.

## 8. Successful controls

| Control group | States | Mean legal-continuation mass | Mean entropy (nats) | Legal argmax share |
| --- | --- | --- | --- | --- |
| Failed, mid-sequence (P1/P2) | 7 | 0.4478 | 1.8197 | 0.4286 |
| Failed, at boundary (P0) | 5 | 0.5296 | 2.0199 | 0.4000 |
| Predecessor of failure | 12 | 0.9699 | 1.2592 | 1.0000 |
| Successful, mid-sequence — *biased* | 85 | 0.9786 | 0.4210 | 1.0000 |
| Successful, at boundary — *biased* | 188 | 0.9849 | 0.4516 | 0.9947 |
| Successful ASCII byte — *biased* | 315 | 0.9678 | 0.6516 | 0.9905 |
| **Unbiased pre-corruption population** | **273** | **0.9829** | **0.4420** | **0.9963** |

**Caveat, stated plainly.** The `successful mid-sequence`, `successful at
boundary` and `successful ASCII byte` groups are **selection-biased**: they are
defined by the drawn token having been legal, so they measure the states where the
draw happened to save the model. They are not a fair baseline and are not used
here as one. The unbiased comparison is `preCorruption`, and it happens to give
almost the same numbers as the biased groups (0.9829 vs 0.9786/0.9849) — which is
itself informative: on an intact stream, legality of the draw and legality of the
argmax nearly coincide, because the model almost always puts its mass on legal
tokens.

Entropy (§11 diagnostic, reported, **not** turned into a threshold): successful
ASCII byte continuation **0.6516** (n = 315); successful multi-byte continuation
**0.4210** (n = 85); all successful steps **0.6477** (n = 384); failed
continuation states **1.9031** (n = 12). Failure states are markedly less
confident, which is consistent with the mass having moved off the legal set rather
than with a confident wrong answer. Note also that the multi-byte-success entropy
is *lower* than the ASCII-success one, so the model is not merely "unsure about
CJK".

Also reported for the record, since it bears on §7: the 5 states labelled
`midstate-new-lead` have legal-continuation mass 0.3218 against 0.9674 at matched
intact P2 states, and **5** of the 7 illegal-argmax states had an argmax above
p = 0.5 (p = 0.523, 0.646, 0.678, 0.929, 0.982). Those 5 would have corrupted even
under **greedy** decoding. A sampler-side fix alone would therefore not have
prevented all of them — it would mask the corruption, not resolve it.

## 9. Corpus-support cross-check

**Phase-98 counts are preserved, not reinterpreted.** The audit re-measured, at
every reconstructed state, the support level, the compatible-id count and the
best-transition id and count, and compared them field by field against Phase 98's
own artifact. Result: identical at all 12 states, with an empty mismatch list.
Support levels remain **2 `exact`, 10 `sparse`, 0 `none`/`unresolved`** — the
same distribution Phase 98 recorded. No Phase-98 count was recomputed under a
looser or stricter criterion. (`documentExpected` is `null` at all 12 states,
just as in Phase 98: these are free continuations, so no corpus document is "the
expected" continuation of the prompt — see §13, limitation 3.)

**New in Phase 99: a census of decision *types*.** Phase 98 asked whether the
corpus supports a particular *transition*. Phase 99 additionally asks how many
*tokens of training evidence* exist for each kind of decision. Walking the whole
600-document, 21,303-token corpus token by token:

| Decision type | Training decisions | Followed by a legal token |
| --- | --- | --- |
| P0 (at a boundary) | 13,642 | 13,642 (100%) |
| P1 (1 byte in, 1 token supplied it) | 3,046 | 3,046 (100%) |
| P2, open character opened by a **`cjk-partial-merge`** token | 969 | 969 (100%) |
| P2, open character built from **two bare byte tokens** | **3,046** | 3,046 (100%) |
| Incompatible transitions in the corpus, all types | **0** | — |

This census is the strongest single result in the phase, because it **removes a
candidate explanation**: the decision type at which the mid-sequence failures
occur (P2 with the first two bytes supplied as two consecutive bare byte tokens)
is the **best-represented** mid-sequence decision type in the corpus — 3,046
training examples, outnumbering the partial-merge variant 3.1 to 1. The model had
abundant evidence for exactly the decision it fails, so "the corpus does not teach
this transition" is not available as an explanation, and neither is "this decision
type is undertrained".

Two structural facts fall out of the same walk. The corpus contains **no P3
decision at all** — every mid-sequence decision is P1-with-a-single-token-supply or
P2 — so nothing in this report speaks to 4-byte characters. And partial-merge token
opening occurs **only** at P2, which is what makes the §15 comparison well-posed.

## 10. Token-level vs byte-level interpretation

Applying the §8 disambiguation to the measurements:

* **Token-level failure** — not supported. The failing decisions are not
  explained by tokenizer boundaries. `failuresEnteredByPartialMerge` is **0/12**:
  no failure was entered by a `cjk-partial-merge` token, the token class that
  commits the model to supplying a third byte later. And 36 of the 85 intact
  mid-sequence decisions had their open character built from two separate bare
  byte tokens and were handled at **0.9608** legal-continuation mass
  (vs **0.9916** for single-token opens). A split-open rate of 36/85 = **42.4%**
  among intact decisions against 5/12 = **41.7%** among failures is no difference
  at all — multi-token CJK characters are common and are handled well, and being
  split across tokens neither predicts nor explains failure.
* **Byte-phase failure** — supported, in a specific and localised form. At the 12
  failure states, 7 had an illegal argmax and the mass moved in the direction
  opposite to the phase: 0.648 onto multi-byte lead bytes at P2, 0.470 onto bare
  continuation bytes at P0. This is a *state-localised* phase-conditioning
  failure. The model is not generally phase-blind — it is 96.7–99.1% legal on the
  same phases when the stream is intact — so the correct statement is "at these
  states the model's implicit byte-phase estimate disagrees with the byte stream",
  not "the model does not condition on phase".
* **Representation ambiguity (D)** — refuted by measurement. See above: 0/12
  partial-merge entries, and no penalty observed for the multi-token form.
* **Unresolved** — not needed; every state resolved to one of the above.

One further measurement pushes the interpretation away from "tokenizer" and
towards "model state". Reading the byte walk immediately before each failure:

| Arm / prompt | Open character at the fault, token by token | Fault (phase) |
| --- | --- | --- |
| A / machine learning is | `e5` · `93` — two bare byte tokens (ids 233, 151) | emits lead `e5` again (P2) |
| A / 机器学习是 | boundary; preceding chars `e4 bc 9a` and `e6 8e bb`, each from **three** bare byte tokens | emits bare continuation `a5` (P0) |
| A / 什么是 machine learning | `e5` — one bare byte token | emits `61 6c` = "al" (P1) |
| B94 / 机器学习是 | partial merge `e4 b8` (id 262) + bare `80` (id 132), completing at a boundary | emits bare continuation `86` (P0) |
| B94 / 什么是 machine learning | boundary; `ef bc 9f` from three bare byte tokens | emits bare continuation `8d` (P0) |
| C94 / 太阳 | `e8` · `a7` — two bare byte tokens | emits lead `e7` (P2) |
| C94 / 机器学习是 | `e5` — one bare byte token | draws partial merge `e8 bf` (P1) |
| C94 / 什么是 machine learning | boundary; `ef bc 9f` from three bare byte tokens | emits bare continuation `a5` (P0) |
| T / machine learning is | `e6` · `8c` — two bare byte tokens | draws lead `e8` (P2) |
| T / 太阳 | `e8` · `a6` — two bare byte tokens | draws lead `e7` (P2) |
| T / 机器学习是 | `e7` · `a5` — two bare byte tokens | emits lead `e6` (P2) |
| T / 什么是 machine learning | boundary; all-ASCII context | draws bare continuation `82` (P0) |

The pattern is consistent — the fault is always "one stage early or one stage
late in the character's byte sequence" — but §9 shows it is *not* explained by how
rarely the corpus contains those byte patterns, because it contains 3,046 of them
with zero incompatible transitions.

## 11. Checkpoint / reload determinism

Measured on all four checkpoints, in-process, from the checkpoint files:

| Checkpoint | Parameters compared | Parameter elements | Element mismatches | Max abs element diff | Repeated forward identical | Fresh-reload forward identical |
| --- | --- | --- | --- | --- | --- | --- |
| `phase90-aligned.ckpt.json` | 39 | 1,126,528 | **0** | **0** | yes | yes |
| `phase94-b.ckpt.json` | 39 | 1,126,528 | **0** | **0** | yes | yes |
| `phase94-c.ckpt.json` | 39 | 1,126,528 | **0** | **0** | yes | yes |
| `phase96-treatment.ckpt.json` | 39 | 1,126,528 | **0** | **0** | yes | yes |

Two independent loads of each checkpoint file are compared element-wise
(`parameter.data`, a `Float64Array`), and the same probe context is forwarded
through three models: the loaded one twice, and a freshly reloaded one. All three
produce bit-identical logits (`repeatedForwardMaxAbsLogitDiff: 0`,
`reloadForwardMaxAbsLogitDiff: 0`).

**Cross-process bit identity was not measured and is not claimed.** The artifact
records `crossProcessBitIdentityMeasured: false` and the contract suite asserts
that it stays false. Every determinism claim in this report is same-process.

The Phase-99 contract suite additionally re-derives all of the above from the
checkpoints on disk rather than reading the artifact's summary — the numbers in
the artifact and the numbers the suite measures independently are the same.

## 12. Mechanism classification

**Classification: `E` — mixed mechanism.**

The pre-stated gate produced the flag set **`[B, C]`**, which maps to `E` by the
rule "multiple flags → mixed". The counts behind it: `aLike` 2/12, `bLike` 9/12,
`midLike` 1/12, mid-sequence share 7/12 = 0.583, mean legal-continuation mass at
mid-sequence failures 0.4478, partial-merge-entered 0/12,
`bestCompatibleInTopKCount` 9, `argmaxCompatibleCount` 5.

The descriptive decomposition of the same 12 states (§6) separates the mixture:

| Component | Count | Letter it corresponds to |
| --- | --- | --- |
| Legal argmax; corruption from the sampling draw | 5 | *(none — decoding path)* |
| Illegal argmax; mass moved onto new lead bytes mid-character | 3 | **C** |
| Illegal argmax; mass moved onto bare continuation bytes at a boundary | 3 | **C** |
| Illegal argmax; legal continuations still hold ≥ 50% of mass | 1 | **A** |

Reading the mixture by *granularity of "the correct continuation"*:

* **At the corpus-transition granularity — Mechanism B holds.** The specific
  corpus-supported successor is at or below the uniform baseline in 9/12 and
  outside the top-6 in 10/12; it is rank 1 in 0/12. The model's learned
  distribution over this one token after this one predecessor is effectively
  flat.
* **At the byte-structural granularity — Mechanism A holds.** A structurally legal
  continuation is the model's **own top-1 choice in 5/12**, is inside the top-5 in
  9/12 and the top-10 in 11/12, at a mean probability of 0.1721. The correct
  continuation (as a byte) is represented and is frequently merely out-ranked.
* **Mechanism C holds in a localised form.** 6/12 states show a majority of mass on
  the phase-wrong byte class, and **5** of the 7 illegal-argmax states put more
  than half their remaining mass behind a phase-wrong token as the *argmax*
  (p = 0.523, 0.646, 0.678, 0.929, 0.982). Those five are also the states a greedy
  decoder would not have saved.
* **Mechanism D does not hold.** 0/12 partial-merge entries; the multi-token
  opening form is common in the intact population and is handled at 0.961 legal
  mass there.

Both readings are reported because both are measured, and the honest answer is
that "the correct continuation" is ambiguous at these states: the corpus's chosen
token and a structurally valid token are different objects, and the model treats
them very differently. §12 of the task specification warns against confusing
corpus support with ground truth; this phase confirms that warning is load-bearing
here.

## 13. Limitations

1. **Small n.** 12 failure states across 4 checkpoints, 2–4 per arm. Per-arm
   comparisons are not resolvable: `T` shows the highest mean legal mass at its
   failures (0.629) and failures dominated by draws, `A` the lowest (0.224) and
   failures dominated by ranking — but with 2–4 states per arm this cannot be
   attributed to the arm.
2. **One seed, one decoder setting.** `SEED = 42`, `TEMPERATURE = 0.8`. The 4.2%
   per-decision hazard is a point estimate on 285 decisions; its confidence
   interval is wide and it is not a calibrated rate.
3. **The corpus-supported successor is a frequency proxy, not ground truth.** It is
   the legal successor with the highest corpus bigram count, which routinely
   selects generic tokens (three of the twelve are a bare `e5`, i.e. "start the
   next multi-byte character"). `documentExpected` is `null` at all 12 states for
   the same reason: these are free continuations with no corpus continuation to
   compare against. "The model failed to prefer the corpus's most frequent legal
   continuation" is a weaker statement than "the model failed to prefer the
   correct continuation", and this report never claims the latter.
4. **The audited states are self-generated CJK.** The failing decisions occur on
   characters the model itself invented during free continuation, not on characters
   the corpus would have placed there. Whether the same inversion occurs on
   corpus-placed CJK is not measured here.
5. **The §15 comparison rests on an 8-state cell.** A 0/8 failure rate is
   compatible with a true rate anywhere below roughly 30%; see §15.
6. **`P3` is unobserved.** No audited state and no corpus mid-sequence decision
   sits three bytes into a 4-byte character (§9), so nothing is claimed about
   4-byte sequences.
7. **Entropy and rank-accuracy figures are diagnostics.** They are reported because
   the task asked for them; they are not thresholds and nothing in the
   classification depends on them.

## 14. What is NOT proven

* **Not proven: which mechanism is *causally* responsible for the Level-4
  capability gap.** Phase 99 explains individual corruption states. It does not
  connect them to the Level-4 gate signal, and it makes no claim about the
  sequence-level score. `stepSuccessRate` 0.8 describes these 20 trajectories; it
  is not a capability verdict.
* **Not proven: that training caused the phase inversion.** The audit measures a
  distribution at rest. It cannot separate a learned defect from an artefact of
  how the model's context happens to encode a mid-character state at that step.
* **Not proven: that the 12 states are representative.** They are the complete set
  of recorded failures on the frozen prompt set, which is a census of these 20
  generations and nothing more.
* **Not proven: any cross-process, cross-machine or cross-runtime determinism.**
  Same-process only.
* **Not proven: that a constrained or greedy decoder would fix the text.** It would
  eliminate illegal tokens by construction; 5 of the 12 failures had an illegal
  argmax above p = 0.5, so it would also override the model's own preference at
  those states. No claim is made about the resulting text quality.
* **Not a capability threshold.** No number in this report is proposed as a pass
  or fail bar, and no Phase-95 metric was redefined.
* **Not proven: that the corpus's most frequent legal successor is the correct
  continuation.** See limitation 3.

## 15. Phase-100 hypothesis

**Exactly one primary next experiment, with one changed variable.**

**Hypothesis.** Among intact mid-sequence decisions at P2 — the phase with the
highest measured hazard (10.2% per decision, §7) — the failure rate depends on
*how the open character's first two bytes were tokenized*. The measured split:

| Opening form at P2 | Intact | Failed | Total | Failure rate |
| --- | --- | --- | --- | --- |
| two consecutive bare byte tokens | 36 | **5** | 41 | **12.2%** |
| a single `cjk-partial-merge` token | 8 | **0** | 8 | **0%** |

The corpus census (§9) shows partial-merge opening occurs **only** at P2, so both
rows are the same decision type at the same phase and the tokenization form is the
only difference between them. If a raw lead-byte token is what leaves the model's
implicit phase counter one stage behind — which is what
`fatalTokenLegalFromBoundary` being true at 7/7 mid-sequence failures (§7)
independently suggests — then removing that opening form should remove the
inversion.

**Single changed variable.** Extend the tokenizer's merge table so that **every
3-byte CJK character is opened by a merge token rather than by a raw lead-byte
token** — i.e. change the coverage of character *openings* only. Nothing else
changes: same architecture, same dataset text, same training recipe, same
`VOCAB_TARGET = 300`, same prompts, same evaluator, same Phase-95 thresholds, same
generation rule and sampling parameters, same 24-token horizon.

**Measurement that would falsify it.** Re-run this exact audit (same instrument,
same 4 checkpoints, same 5 prompts, same `SEED`) on the retrained arms and compare
two pre-registered quantities:

* the number of corrupting decisions on the frozen 20 generations; and
* mean legal-continuation mass at P2 states.

*Prediction:* corruptions fall from **12** to **≤ 3**, and mean legal-continuation
mass at P2 failure states rises above **0.5** (from 0.3218), while intact P2 mass
stays within noise of 0.967 and `fatalTokenLegalFromBoundary` stops being
uniformly true at mid-sequence failures.

*Falsifier:* corruptions remain **≥ 8**, or mean P2 failure-state legal mass
remains **below 0.5**. If that happens, the opening tokenization is *not* the
mechanism, the alternative is that the inversion is a property of the model's
context handling of mid-character states independent of tokenization, and the next
experiment should move that single variable instead — most plausibly by restricting
the sampling candidate set to byte-phase-legal tokens at P1/P2 and measuring the
**override rate** (how often the mask contradicts the model's own argmax), which
is the direct measurement of the 5/12 decoding-hazard component this phase could
only infer.

Three caveats belong with the recommendation, stated before it is run. First, the
asymmetry it rests on has **n = 8** on one side (limitation 5): a 0/8 cell is
compatible with a true failure rate anywhere below roughly 30%, so the experiment
is partly exploratory and its negative result is the more informative of the two.
Second, Phase 92 already varied the merge *budget* (300/340/380) and returned
**Outcome C**. Phase 100 differs from Phase 92 in what it varies (openings, not
budget) and in what it measures (per-state compatible mass and the corruption
census this phase introduced, not sequence-level quality). Third, if the result
repeats Phase 92's Outcome C, that is itself the informative outcome: it would show
the corruption mechanism is insensitive to tokenizer coverage, which is what §10's
split-open parity (41.7% at failures vs 42.4% intact) already hints at.

**Training is not run in Phase 99, and Phase 100 has not been started.**

## 16. Final conclusion

Phase 99 reconstructed all 12 recorded CJK/mixed interior corruption states
exactly — 20/20 trajectories reproduced, 12/12 states rebuilt with bit-identical
logits — and measured their next-token distributions against the byte phase of the
actual byte stream rather than the phase implied by token boundaries.

The answer to the phase's question is that **the two proposed mechanisms are both
present, at different granularities, and neither alone explains the failure set.**

* The specific corpus-supported successor is effectively **absent** from the
  model's preference distribution (Mechanism **B**): at or below the uniform
  baseline in 9 of 12 states, outside the top-6 in 10 of 12, rank 1 in none.
* A structurally legal continuation is **represented and frequently merely
  out-ranked** (Mechanism **A**): it is the model's own top-1 in 5 of 12 states,
  inside the top-5 in 9 of 12, at a mean probability of 0.172.
* Six of the twelve states show a **phase inversion** (Mechanism **C**, localised):
  the probability mass moves onto the phase-wrong byte class, in one direction at
  P2 (0.648 onto multi-byte lead bytes, 21× the intact rate) and in the
  complementary direction at P0 (0.470 onto bare continuation bytes, 31× the intact
  rate). At all 7 mid-sequence failures the fatal token is one that would have been
  legal from a character boundary — the decision was taken one stage off.
* **D is refuted**: no failure was entered by a partial-merge token, and the
  split-open rate is the same at failures (41.7%) as at intact decisions (42.4%).
* Five of the twelve failures are a **decoding hazard** with no letter in the
  vocabulary: the model's argmax was legal and a tail illegal token
  (p = 0.0012 to 0.042, rank 4 to 51) was drawn.

The model is **not** generally phase-blind. Across 273 unbiased decisions taken
while the byte stream was intact it placed 98.3% of its probability mass on legal
tokens and legalised its argmax in 272 of 273 cases. It is phase-aware in general
and fails at specific, abrupt states — the step before each failure is 0.970
legal-mass with a legal argmax in 12 of 12 cases. The corpus cannot be blamed for
the gap: it contains **3,046** training decisions of exactly the type that fails,
and **zero** incompatible transitions, so this is not a data-coverage defect and
not an undertrained decision type.

**Overall: `E` — mixed mechanism.** `B` for the specific transition, `A` for the
legal byte, `C` for the phase, absent for `D`, plus a decoding-hazard component
that the A–F vocabulary does not name. Phase 100 should test the one hypothesis
§15 names, with the one variable §15 names, against the falsifier §15 names.

**No training was performed in Phase 99.**
