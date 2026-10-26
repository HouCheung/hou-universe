# Phase 100 — CJK Opening-Token Mechanism Test

**Instruments:**
`experiments/phase100/feasibility-audit.ts` →
`experiments/phase100/feasibility-audit.json`;
`experiments/phase100/opening-token-audit.ts` →
`experiments/phase100/opening-token-audit.json`
+ `experiments/phase100/manifest.json`

**Contract suite:** `src/lib/minimind/research/tests/phase100-opening-token.test.ts` (120 checks)

**Date:** 2026-09-19

**Classification: `E` — Blocked.**
`BLOCKED — frozen-checkpoint compatibility prevents merge-only test`

**Training: `NOT RUN`.** **Generation: `NOT RUN`.** No forward pass was taken. No
checkpoint, vocabulary, dataset, prompt, evaluator, threshold, generation rule or
sampling parameter was changed. All four checkpoints are byte-identical to their
state before this phase began.

---

## 1. Research question

Phase 99 left one specific, experimentally falsifiable primary hypothesis behind
(§15 of the Phase-99 report). Phase 100's question is whether that hypothesis
survives being turned into an actual intervention:

> Does changing **only** the tokenization of the *opening* portion of a 3-byte CJK
> character change the model's internal P2 generation behaviour?

The pre-registered distinction:

* **H1 — Supported.** Changing the opening tokenization materially reduces interior
  corruption and increases P2 legal probability mass.
* **H0 — Not supported.** Changing the opening tokenization does not materially
  change the failure mechanism.

H1 was not assumed. This phase reports which of the two the evidence supports —
and in this case, whether the experiment could be performed at all.

## 2. Phase-99 evidence

Phase 99's verdict was **`E` — mixed mechanism**, built from these measurements over
the 12 reconstructed CJK/mixed interior corruption states (5 prompts × 4 arms,
`SEED = 42`, `MAX_TOKENS = 24`):

| Phase-99 measurement | Value |
| --- | --- |
| Recorded corruptions on the frozen 20 generations | **12** |
| Mean legal-continuation mass at P2 failure states | **0.3218** |
| Mean mass on multi-byte lead bytes at P2 failures | 0.6483 (vs 0.0303 intact — 21×) |
| Per-decision hazard at P2 | 10.2% (vs 2.6% at P0) |
| Failures at P2 opened by **two bare byte tokens** | **5** (12.2% failure rate) |
| Failures at P2 opened by a **`cjk-partial-merge`** token | **0** (0% failure rate, n = 8) |
| `fatalTokenLegalFromBoundary` at mid-sequence failures | true in **7/7** |
| Corpus training decisions of the failing decision type | 3,046, with 0 incompatible transitions |

The asymmetric cell — 5 failures out of 41 decisions with a bare-byte opening,
0 out of 8 with a merge opening — is what Phase 99 §15 proposed to test by making
*every* 3-byte CJK character open with a merge token. Phase 99 explicitly flagged
that the asymmetry rests on **n = 8** on one side, so a 0/8 cell is compatible with a
true failure rate anywhere below roughly 30%, and that the experiment was therefore
partly exploratory.

## 3. Exact intervention hypothesis

Phase 99 §15, quoted verbatim, names the single changed variable:

> Extend the tokenizer's merge table so that **every 3-byte CJK character is opened
> by a merge token rather than by a raw lead-byte token** — i.e. change the coverage
> of character *openings* only. Nothing else changes.

Pre-registered prediction: corruptions fall from **12** to **≤ 3**, and mean
legal-continuation mass at P2 failure states rises above **0.5** (from 0.3218).

Pre-registered falsifier: corruptions remain **≥ 8**, or mean P2 failure-state legal
mass remains **below 0.5**. Between the two regions the outcome is
`INCONCLUSIVE`.

Phase 100 additionally carried a hard constraint from its own specification: the test
must use **frozen checkpoints and no training**, and the intervention is admissible
only as a **merge-table-only** change.

## 4. Feasibility audit

This is where Phase 100 stops. The audit is `experiments/phase100/feasibility-audit.ts`,
run against the real production tokenizer, the real corpus, and the four real
checkpoints.

**What "extend the merge table" means in this implementation.** In
`BPETokenizer.train`, each merge appends exactly one new entry to the vocabulary and
records exactly one merge-table row (`BPETokenizer.ts:150-157`). The learned merge
region is therefore in **bijection** with the vocabulary beyond the byte and special
tokens: 40 merge rows ↔ 40 vocabulary entries. Extending the merge table is not a
free operation that leaves the vocabulary alone — it *is* a vocabulary extension.

**Measured BASE tokenizer:**

| Quantity | Value |
| --- | --- |
| Vocabulary size | **300** = 256 byte tokens + 4 special tokens + **40 learned merges** |
| Learned-merge budget (`VOCAB_TARGET − 260`) | **40** |
| Merge tokens by class | 27 `ascii-merge`, **11 `cjk-partial-merge`**, 2 `cjk-complete-merge` |

**Exhaustive admissibility test.** The audit enumerated **every ordered pair
`(a, b)` of existing vocabulary ids** — 300 × 300 = 90,000 combinations — and asked
which of them have a concatenation that is *also* an existing vocabulary entry while
not already being present in the merge table. Such a pair could be added as a merge
rule without inventing a token.

> **Result: 0.** There is no merge that can be added for free. Every merge whose
> result is an existing vocabulary token is already in the merge table, because that
> is how the token was created.

**Where the intervention's target states actually stand.** Of the 12 recorded failure
states, the intervention has a target at all only where an open character exists and
two of its bytes are already in the stream — the 5 P2 states. At all five:

| Failure state | BASE opening tokens | BASE ids | Required 2-byte opening token | In vocabulary? |
| --- | --- | --- | --- | --- |
| A / `machine learning is` | `e5` · `93` (byte, byte) | 233, 151 | `e5 93` | **no** |
| C94 / `太阳` | `e8` · `a7` (byte, byte) | 236, 171 | `e8 a7` | **no** |
| T / `machine learning is` | `e6` · `8c` (byte, byte) | 234, 144 | `e6 8c` | **no** |
| T / `太阳` | `e8` · `a6` (byte, byte) | 236, 170 | `e8 a6` | **no** |
| T / `机器学习是` | `e7` · `a5` (byte, byte) | 235, 169 | `e7 a5` | **no** |

**5 of 5 applicable states require a 2-byte opening token that does not exist.** So
does the wider picture: across the corpus, **866** distinct 3-byte CJK characters
occur; **119** have a 2-byte prefix that is already a vocabulary token, and **747** do
not. Full prefix coverage would need **1,007** vocabulary entries — and the merge
budget is fixed at 40 by `VOCAB_TARGET = 300`.

**Conclusion of the audit.** The intervention at the §15 strength — *every* 3-byte CJK
character opened by a merge token — needs hundreds of new vocabulary entries. The
intervention at its *minimum* strength — just the 5 audited states — still needs 5.
Either way:

```
BLOCKED — merge-only intervention is incompatible with frozen checkpoints
```

This is the outcome the Phase-100 specification anticipates in §2 and assigns to
classification **E** in §19. Per §2, the run stops here rather than working around the
block by modifying the model.

## 5. Tokenizer compatibility

The specification lists seven conditions a pure merge-table change must satisfy. The
audit measures each against the frozen artifacts.

| Condition required by §2 | Can a merge-only change satisfy it? | Measured |
| --- | --- | --- |
| vocabulary size unchanged | yes — trivially | 300 before, 300 after (no change exists to make) |
| existing token IDs unchanged | yes — trivially | all 300 ids re-derived; byte content identical |
| checkpoint embedding / LM-head dimensions unchanged | yes — trivially | all four checkpoints: `300 × 128` |
| existing checkpoint arrays remain valid | yes — trivially | reload succeeds; 2 loads element-identical, 0 mismatches |
| no new token IDs invented | yes — trivially | ids contiguous `0..299` |
| no retraining required | yes — trivially | 0 optimization steps |
| model and tokenizer structurally compatible | yes — trivially | embedding rows == `vocabSize` |

Every row is satisfied **precisely because the merge-only change cannot change
tokenization at all**. There is no admissible merge to add. The intervention is
therefore not merely *incompatible* with the frozen checkpoints — under a frozen
vocabulary it is **vacuous**.

**Explicit compatibility checks recorded (not config-file comparison):**

* All four checkpoints were re-loaded in-process into freshly constructed models,
  twice each. Parameter arrays (`Float64Array`) compared element-wise:
  **39 parameters, 1,126,528 elements, 0 mismatches, max abs diff 0** per checkpoint.
* Every checkpoint's SHA-256 was taken **before** and **after** every read:
  identical in all four cases — no serialization, no write-back, no modified copy
  under the same filename.
* Each file's own **modification time** was checked against the start of this phase.
  All four predate it, which is an independent witness that the bytes were not
  rewritten here. The contract suite re-measures both the hash and the mtime from
  disk at test time.

| Arm | Checkpoint | SHA-256 (first 16) | Embedding | Unchanged on disk | mtime | Reload | Mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | `experiments/phase90/phase90-aligned.ckpt.json` | `dff07a8366ba21e4` | `300×128` | yes | 2026-08-25 | ok | 0 |
| B94 | `experiments/phase94/phase94-b.ckpt.json` | `c9f9d52d053e72ea` | `300×128` | yes | 2026-09-13 | ok | 0 |
| C94 | `experiments/phase94/phase94-c.ckpt.json` | `62557157cab31899` | `300×128` | yes | 2026-09-14 | ok | 0 |
| T | `experiments/phase96/phase96-treatment.ckpt.json` | `5ebe2ab392ac8d08` | `300×128` | yes | 2026-09-16 | ok | 0 |

**One honest limitation on this evidence.** None of the four checkpoints is tracked by
git — `experiments/phase96/.gitignore` ignores `*.ckpt.json`, and the others are
untracked in this repository's uncommitted Phase 57-99 backlog — so there is no
committed baseline to diff against. The integrity claim here is therefore scoped
exactly as measured: **the checkpoint bytes were not written by Phase 100**, evidenced
by the before/after hash pair and the predating mtimes. It is not a claim about any
earlier phase.

## 6. BASE / MERGE tokenization comparison

**Condition BASE** is the exact tokenizer/merge configuration Phase 99 used:
`BPETokenizer.train(corpus, 300)` under `Random.setSeed(42)`, rebuilt deterministically
from the production dataset.

**Condition MERGE does not exist, and cannot be constructed.** That is the result of
this phase. The table below records what §8 asks for where it can be recorded — the
exhaustive BASE tokenization of the affected characters — and states plainly, per
state, what MERGE would have required.

**BASE, at the 5 P2 failure states** (read from the *recorded* token ids in the
Phase-99 artifact, not re-encoded, so the spans are the tokenization the model
actually saw):

| State | Token ids | Token byte sequences | Token boundaries inside char | First byte from a raw lead-byte token? | MERGE opening required |
| --- | --- | --- | --- | --- | --- |
| A / `machine learning is` | 233, 151 | `e5`, `93` | 1 | **yes** | `e5 93` — absent |
| C94 / `太阳` | 236, 171 | `e8`, `a7` | 1 | **yes** | `e8 a7` — absent |
| T / `machine learning is` | 234, 144 | `e6`, `8c` | 1 | **yes** | `e6 8c` — absent |
| T / `太阳` | 236, 170 | `e8`, `a6` | 1 | **yes** | `e8 a6` — absent |
| T / `机器学习是` | 235, 169 | `e7`, `a5` | 1 | **yes** | `e7 a5` — absent |

**Does the intervention actually change the hypothesized variable?** The question
cannot be answered, because the variable cannot be moved. What *can* be recorded is
that the hypothesis was **not already satisfied**: in **0 of 5** applicable states is
the opening already supplied by a merge token. Phase 99's caveat holds — the observed
split is real, and Phase 100 adds nothing to it.

**Beyond the failure states.** Over the recorded contexts the audit found **21**
distinct affected 3-byte CJK characters: **5** are already merge-opened, **16** would
need a token that does not exist (`e6 9c`, `e5 99`, `e5 ad`, `e4 b9`, `e4 bb`, `e4 b9`,
`ef bc`, `e9 98`, `e8 ba`, `e4 bc`, `e6 8e`, `e9 80`, `e6 a0`, `e4 bb`, `e5 b1`,
`e8 bd`). This is a statement about the frozen contexts, not a claim that the
intervention would have worked.

## 7. Experimental setup

Everything the specification freezes was frozen. Nothing was exercised, because the
MERGE condition could not be built.

| Component | Frozen value | Status |
| --- | --- | --- |
| Checkpoints | Phase-90 A, Phase-94 B94, Phase-94 C94, Phase-96 T | identical, byte-verified |
| Prompts | `the sun rises`, `machine learning is`, `太阳`, `机器学习是`, `什么是 machine learning` | unchanged |
| `SEED` / `TEMPERATURE` | 42 / 0.8 | unchanged |
| Sampling | temperature-scaled multinomial over the full vocabulary; no top-k, no top-p, no repetition penalty | unchanged |
| EOS | id 3, stops generation | unchanged |
| Horizon / context | `MAX_TOKENS = 24`, `MAX_CTX = 128` | unchanged |
| Vocabulary target | 300 | unchanged |
| Random-state convention | one `createSeededRNG(SEED)` stream per arm, consumed across the five prompts in order | unchanged, **not exercised** |
| Phase-95 tolerant UTF-8 semantics | `capability-eval/utf8.ts` | untouched (no Phase-100 hook present) |
| Phase-99 logit-audit logic | `logit-mechanism-audit.ts` | untouched (no Phase-100 hook present) |

**One variable was intended to differ — merge behaviour — and it cannot.** The
comparison is not run.

## 8. Paired trajectory results

**Not produced.** §12 of the specification asks for paired per-sample transitions
(BASE failure phase vs MERGE failure phase, corruption disappeared / moved later /
changed phase / newly corrupted). Producing that table requires two evaluation runs
over the same 20 trajectories. Only one condition exists.

No paired result is reported, and none is inferred from the 5/41 vs 0/8 asymmetry in
Phase 99. That asymmetry is a *motivation*, not a measurement under intervention.

## 9. P2 logit comparison

**Not produced.** §13 asks for the Phase-99 logit inspection (expected vs actual
token probability and rank, P2 legal mass, top-K alternatives, expected-vs-actual
margin) to be repeated under MERGE, to test whether the hypothesized opening-token
change moves the P2 decision boundary.

That requires a MERGE model input to forward. There is none. **The Phase-99 logit
evaluator was not modified and was not re-run**; no logit, probability or mass in this
report is new, and none is fabricated. The Phase-99 value `0.3218` quoted throughout
is read back from the Phase-99 artifact at audit time, not restated as a literal —
the contract suite asserts the two agree.

## 10. Corruption comparison

| Metric | BASE | MERGE |
| --- | --- | --- |
| Total corruption count | **12** | **not measurable** |
| Corruption count by byte phase (P0/P1/P2) | 5 / 2 / 5 | not measurable |
| P2 corruption count | 5 | not measurable |

The BASE figures are the Phase-99 recorded values, re-read from
`experiments/phase99/logit-mechanism-audit.json`.

## 11. Character-integrity comparison

**Not measurable.** `charIntegrityRate` and `tokensToFirstInvalid` are computed from a
generation trace. Phase 100 produced no generation trace — deliberately, since running
BASE again would add no information (the Phase-99 traces are the BASE condition) and
running MERGE is impossible.

## 12. Rollout comparison

**Not measurable.** Rollout is a property of the training objective, and no arm was
trained or evaluated.

## 13. Capability comparison

**Not measured, and no threshold touched.** Phase-95's tolerant UTF-8 semantics and
its Level classification are unchanged; no new threshold was introduced and no
existing one was redefined. The Phase-99 capability-relevant description of these 20
trajectories (`stepSuccessRate` 0.8) is not a capability verdict, as Phase 99 §14
states, and Phase 100 does not promote it into one.

## 14. Acceptance-test result

The acceptance test was **not reached**.

| Element | Pre-registered | Result |
| --- | --- | --- |
| Prediction: corruption count | ≤ 3 | not measured |
| Prediction: P2 legal mass | > 0.5 | not measured |
| Falsifier: corruption count | ≥ 8 | not measured |
| Falsifier: P2 legal mass | < 0.5 | not measured |
| Inconclusive region | between the two | not applicable |

No boundary was moved, and no new threshold was created. Reporting "prediction
supported" or "falsifier met" here would be fabrication: neither number exists.

**Arithmetic note, recorded as an observation rather than a result.** The
intervention's mechanism is defined at P2 — a character *opening*. Of the 12 recorded
corruption states, only 5 are P2 states with an open character; 5 are at a character
boundary (no open character exists) and 2 have only a single lead byte in the stream
(which one byte token already supplies, so no merge can open it). Reaching the
pre-registered `≤ 3` would have required the intervention to also resolve states it
has no described mechanism for. Changing opening tokenization does change the token
sequence the model sees downstream, so those states are not *provably* out of reach —
but the falsifier as written would have been decided mostly by states the hypothesis
does not describe. This is a property of the prediction as pre-registered, not an
excuse for it, and it is not used here to reinterpret any result.

## 15. Mechanistic interpretation

**The hypothesis was not tested, so it is neither supported nor refuted.** What Phase
100 establishes is a fact about the *instrument*, and it is worth stating precisely
because it constrains every future version of this experiment:

* The Phase-99 §15 intervention is expressed in a vocabulary that the frozen artifact
  cannot reach. A merge-table row and a vocabulary entry are the same object in this
  tokenizer, so "extend the merge table" and "extend the vocabulary" are synonyms.
* A merge that produces an *already existing* id is the only kind that would be free —
  and there are **zero** such merges, exhaustively.
* Therefore the choice is structural: either the vocabulary changes (and the frozen
  checkpoints become invalid, since they are serialised with 300 embedding rows), or
  the tokenization does not change (and the intervention is a no-op).

The re-purposing route — overwriting an existing merge token's byte content while
keeping its id — is not a way out. It would break the requirement that *existing token
IDs remain unchanged*, and it would be scientifically invalid besides: that id's
embedding row was trained on different bytes, so the intervention would be confounded
by an untrained embedding. Phase 100 does not take that route.

One genuine, if narrow, possibility the audit did search for and did not find: a merge
whose result is an existing id but whose *pair* is not yet in the merge table. Such
pairs can exist in principle wherever one byte string has more than one BPE
decomposition into existing tokens. The exhaustive 90,000-pair enumeration found
**none** in this vocabulary.

The science Phase 99 §15 proposed is therefore still open, but it is not a
merge-table-only experiment. It is a **retrain-and-re-evaluate** experiment: change
the opening coverage *during tokenizer training* (which changes the vocabulary), then
retrain the arms, then re-run the Phase-99 audit. That is a different phase with a
different cost, and Phase 100 hands it forward rather than pretending to have run it.

## 16. Limitations

1. **The primary limitation is that no experiment was run.** Every comparative metric
   in §10-§13 is absent by design, not by measurement failure.
2. **The blocking argument is about this tokenizer implementation.** It rests on
   `BPETokenizer.train` creating one vocabulary entry per merge. A different tokenizer
   design — one with merge rules that do not define vocabulary entries — could express
   the intervention. That is not this codebase.
3. **The 90,000-pair enumeration is exhaustive over the frozen vocabulary**, but it is
   a search over merges that keep *both* the vocabulary and the token ids fixed. It
   does not bound what a retrained tokenizer could do.
4. **Phase 99's own limitation 5 still applies and is now load-bearing.** The
   5/41 vs 0/8 asymmetry that motivated the intervention has n = 8 on the merge-opened
   side; a 0/8 cell is compatible with a true failure rate anywhere below roughly 30%.
   Nothing in Phase 100 sharpens that estimate.
5. **Phase 99's limitation 4 also still applies.** The audited states are self-generated
   CJK, and the 21 affected characters are the ones the model's own recorded
   continuations contained — not a sample of CJK generally.
6. **No cross-process claim.** Checkpoint determinism here is same-process, as in
   Phase 99.

## 17. What remains unproven

* **Unproven, and now known to be untestable in place:** that opening tokenization is
  or is not the P2 corruption mechanism. Phase 100 moves this from "untested" to
  "untestable without retraining".
* **Unproven:** whether the 5 bare-byte-opened P2 failures and the 8 merge-opened
  intact decisions differ for any reason attributable to the opening form, rather than
  to the particular characters and contexts involved. The n = 8 cell is untouched.
* **Unproven:** that a retrained tokenizer with full 2-byte opening coverage would
  satisfy the ≤ 3 prediction. Reachability of `VOCAB_TARGET = 300` is not the only
  constraint — the 40-merge budget cannot cover 747 prefixes, so a retrained variant
  would need a much larger vocabulary, which is itself a second changed variable.
* **Not claimed:** that the intervention is scientifically worthless. The hypothesis
  remains coherent and falsifiable; it is simply not a frozen-checkpoint experiment.
* **Not claimed:** any capability result, any threshold change, or any reinterpretation
  of a Phase-95 metric.

## 18. Phase-101 recommendation

**Exactly one next experimentally falsifiable hypothesis.**

The blocking analysis shows that the opening-tokenization hypothesis does not have a
low-cost, single-variable form. It cannot be tested without a changed vocabulary and
retrained arms — which is Phase 92's territory (the merge *budget* sweep at
300/340/380, which returned **Outcome C**: tokenization improved, generation did not).

The remaining single-variable, frozen-checkpoint intervention is the one Phase 99's
§15 named as its own fallback:

> **Phase 101 — P1/P2 candidate-set restriction.** Restrict the sampling candidate set
> to byte-phase-legal tokens at P1 and P2 and measure the **override rate** — how often
> the mask contradicts the model's own argmax.

*Hypothesis:* at the 5 P1/P2 failure states with an illegal argmax, a phase-legal
candidate mask changes the emitted token, and the override rate is the direct
measurement of the phase-inversion component Phase 99 could only infer.

*Prediction:* the mask overrides the model's argmax at ≥ 3 of the 5 illegal-argmax
mid-sequence failure states, and the per-state legal mass it recovers matches the
Phase-99 measured legal mass at those states.

*Falsifier:* the mask overrides at ≤ 1 state, or the recovered legal mass disagrees
with the Phase-99 measurement — which would indicate the failure is not a candidate-set
problem at all.

This is measurable with frozen checkpoints and no training, because it changes only
the decoding path, not the model or the tokenizer. It is a one-variable intervention,
and it is the only one left on the table.

## 19. Decision classification

**`E` — Blocked.**

The merge-only intervention cannot be performed while preserving frozen
model/checkpoint compatibility. This is a mechanism classification, not a
model-quality ranking.

| Classification | Applies? | Why |
| --- | --- | --- |
| A — Strongly supported | no | no MERGE result exists |
| B — Partially supported | no | no MERGE result exists |
| C — Refuted | no | no MERGE result exists |
| D — Inconclusive | no | the intervention did not change behaviour — it could not be applied |
| **E — Blocked** | **yes** | merge-only intervention is incompatible with frozen checkpoints |

## 20. Final conclusion

Phase 100 set out to test whether changing the tokenization of a 3-byte CJK
character's opening changes the model's P2 failure behaviour, with frozen checkpoints
and no training.

**It could not be run, and the reason is structural rather than incidental.**

In this tokenizer, a merge-table row and a vocabulary entry are the same object:
`BPETokenizer.train` creates exactly one vocabulary entry per merge, so the 40 learned
merges correspond exactly to the 40 non-byte, non-special vocabulary entries. Extending
the merge table *is* extending the vocabulary. Every one of the four frozen checkpoints
is serialised with an embedding of **300 rows**, and the vocabulary target fixes the
merge budget at **40**.

The audit then measured, exhaustively over all 90,000 ordered pairs of existing
vocabulary ids, how many merges could be added without inventing a token: **zero**.
Every merge whose result is already a vocabulary entry is already in the merge table —
that is how the entry came to exist.

At the five P2 failure states the intervention targets, **all five** would need a
2-byte opening token (`e5 93`, `e8 a7`, `e6 8c`, `e8 a6`, `e7 a5`) that the vocabulary
does not contain. Across the corpus, **747** of 866 distinct 3-byte CJK characters
lack such a token; covering them would need roughly 1,007 vocabulary entries against a
budget of 40.

Per the phase specification §2, the run stops: **`BLOCKED — merge-only intervention is
incompatible with frozen checkpoints`**, classification **`E`**.

No MERGE generation was produced, so no corruption count, P2 legal mass, paired
trajectory table or logit comparison exists — and none is invented. The pre-registered
prediction and falsifier are recorded as **not reached**, with their boundaries
unmoved. The BASE baselines quoted here (12 corruptions, P2 legal mass 0.3218244…)
are read back from the Phase-99 artifact, not restated.

All four checkpoints are byte-identical to their pre-phase state, verified by SHA-256
taken before and after every read, and by an element-wise comparison of two independent
in-process loads (0 mismatches across 1,126,528 parameter elements per checkpoint). No
production module was modified; the tokenizer, evaluator and Phase-99 audit were left
untouched and carry no Phase-100 hook.

**No training was performed. No generation was performed. No forward pass was taken.**

The one intervention still available with frozen checkpoints and one changed variable
is Phase 101's phase-legal candidate-set restriction (§18).

**No training was performed in Phase 100.**
