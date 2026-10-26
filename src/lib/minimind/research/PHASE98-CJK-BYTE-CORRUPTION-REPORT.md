# Phase 98 — CJK / Mixed Interior Byte-Corruption Audit

**Status:** audit complete. **No training was run in this phase.**
**Date:** 2026-09-18
**Artifact:** `experiments/phase98/cjk-byte-corruption-audit.json`
**Instrument:** `experiments/phase98/cjk-byte-corruption-audit.ts`
**Suite:** `src/lib/minimind/research/tests/phase98-cjk-byte-corruption.test.ts`

**Verdict: `B` — boundary/transition corruption is the dominant explanation.**

| Type | Count |
|---|---|
| Type 1 — unsupported continuation | **0** |
| Type 2 — boundary fragmentation | **12** |
| Type 3 — semantic substitution | **0** |
| unresolved | **0** |
| no corruption | **8** |

Every statement below is marked as one of **observed fact**, **supported
interpretation**, **unresolved limitation**, or **Phase-99 hypothesis**. Nothing
is promoted across those categories in this report.

---

## 1. Research question

Phase 97 closed the geometry axis and handed forward one content question. Its
recommendation was explicit: *"Diagnose the interior corruption directly, before
any further training… Separate 'no support' from 'wrong boundary'."*

The question this phase audits is therefore:

> When a `zh` or `mixed` generation corrupts its byte stream, is the corruption
> caused by **missing corpus support** (Hypothesis A — the correct continuation
> was never in the training distribution, so the model had nothing legal to
> choose), or by a **token/byte-boundary problem** (Hypothesis B — a legal,
> corpus-supported continuation existed and the model entered an invalid UTF-8
> byte sequence anyway)?

The question is deliberately posed as a **two-way discrimination**, not as a
search for a cause. It is answerable read-only from already-recorded
generations plus the real corpus, and it does not require — or justify — a
training run.

**Observed fact:** the audit's decision gate returns **B**. Of 12 corrupted
generations, 12 had a legal, corpus-supported continuation available at the
failure state; 0 lacked support. The two mechanisms are not merely weighted
differently — one of them is empty in this corpus.

---

## 2. Prior evidence from Phases 89–97

| Phase | Intervention | Recorded verdict |
|---|---|---|
| 89 | Un-shifted targets in the training loop | Objective corrected; memorization 0.0344 → 0.3893, below the 0.5 gate |
| 90 | Document-aligned sequence layout + supervised mask | **Root cause confirmed; Level 3 achieved.** Condition B top-1 **0.9580** |
| 91 | Generation-path audit | **Classification D — model capability limitation**, not a pipeline bug. `allIdsInVocab: true`; 40 BPE merges → most CJK chars are 3 separate byte tokens; per-token error ≈ 3.5–4% |
| 92 | Tokenizer merge budget A/B/C (vocab 300/340/380) | **Outcome C** — tokenization improved, generation did not. Avg tokens per CJK occurrence **2.685 → 2.404 → 2.244**; Level-4 gate signal identical (`zh 0.5 / en 0.5 / mixed 0.0`) in all three |
| 93 | Model capacity sweep (dModel 128/192/256) | **Outcome B** — capacity is not the Level-4 blocker. Memorization **0.9580** in all three; the largest model was *worse* on loss |
| 94 | Own-context rollout augmentation, k = 0/8/24 | **Outcome D** — augmentation hurts, dose-dependent. Aligned NLL **0.1187 → 0.1576 → 0.2103** |
| 95 | Generation-evaluation instrument repair | Oracle **100.000%** tolerant; **1,496/1,496** strict rejections were trailing cuts, **0** interior defects. No A/B/C verdict flipped |
| 96 | Augmentation transfer experiment | **Outcome D** — "no transfer demonstrated". A vs T **init-confounded** (6.0273 vs 5.9772); all arms Level 3 |
| 97 | Position / context alignment audit | **B — partially supported.** Mechanism real, not the primary bottleneck. No training run |

Four of these results are load-bearing for the present audit and are re-used
only as *motivation*, never as evidence:

- **Observed fact (Phase 91):** the tokenizer's merge budget produces a
  byte-level generation problem. With 40 merges, ids 4..259 are raw bytes and
  most CJK characters require three consecutive byte tokens to be emitted in
  strict order.
- **Observed fact (Phase 92):** tripling the single-token CJK rate moved the
  Level-4 gate signal by exactly zero. Tokenization granularity is therefore
  **not** a sufficient explanation.
- **Observed fact (Phase 93):** an 3.9× parameter increase did not fix it.
  Model capacity is therefore **not** a sufficient explanation.
- **Observed fact (Phase 95):** the strict `validUtf8Ratio === 1` gate was
  re-measured and repaired, and the repair flipped no verdict. The corruption
  being audited here is *interior* — it is not the trailing-truncation artefact
  that Phase 95 removed.

Phase 96's init-confound and Phase 97's finding that 2 of the 5 evaluator
prompts (`machine learning is`, `机器学习是`) are absent from the corpus
entirely are both carried into this audit, and both are re-measured below
rather than borrowed.

---

## 3. Audit methodology

The instrument is **read-only and deterministic**. It trains nothing, runs no
optimizer step, writes no checkpoint, uses no `Math.random()` and no
`setTimeout()`, and imports no Phase 94/95/96 harness. `integrity` in the
artifact records `productionModulesModified: []`, `datasetModified: false`,
`evaluatorModified: false`, `generationModified: false`,
`thresholdsModified: false`.

**Inputs (unchanged).** The production bilingual dataset; the production
tokenizer trained deterministically from it; four checkpoints read read-only
from disk with their sizes recorded in `sourceCheckpoints`.

| Arm | k | Checkpoint | Source of generations |
|---|---|---|---|
| A | 0 | `experiments/phase90/phase90-aligned.ckpt.json` (73,605,758 B) | `phase95/probe-results.json` |
| B94 | 8 | `experiments/phase94/phase94-b.ckpt.json` (27,951,440 B) | `phase95/probe-results.json` |
| C94 | 24 | `experiments/phase94/phase94-c.ckpt.json` (27,949,586 B) | `phase95/probe-results.json` |
| T | 8 | `experiments/phase96/phase96-treatment.ckpt.json` (27,951,217 B) | `phase96/probe-results.json` |

The evaluation recipe is pinned to its Phase 90/94/96 values and re-declared as
constants: `SEED = 42`, `VOCAB_TARGET = 300`, `MAX_TOKENS = 24`, `MAX_CTX = 128`,
`TEMPERATURE = 0.8`. No new threshold and no new gate is defined.

**Measurement pipeline.**

1. **Byte walk.** Every recorded generation is walked token by token, and the
   UTF-8 phase (`need`, whether a sequence is open, whether the state is still
   recoverable) is recorded *before* and *after* each token. The walker is a
   deliberate re-implementation, and its equivalence against the **unchanged
   production `scanUtf8`** is checked on every sample: the artifact records
   `scannerEquivalenceCheckedOnEverySample: true` and every sample carries a
   `scannerAgreesWithProduction` flag, true in all 20 cases. Where the walker
   and production disagreed, production would have won.
2. **Corpus support.** The corpus is indexed and scanned deterministically. At
   each failure state the audit enumerates the vocabulary ids that are *legal*
   continuations, then asks the corpus a state-conditioned question: when the
   corpus itself was in this byte phase, was it ever followed by a legal token?
   Support is reported as `exact` / `sparse` / `indirect` / `none` /
   `unresolved`. The criterion is `compatibleIdCount`, never the
   character-boundary-completing set — the vocabulary contains no merge of two
   continuation bytes, so at `need=2` the completing set is empty for a
   vocabulary reason that has nothing to do with the corpus, and using it would
   have manufactured a Type-1 verdict.
3. **Classification.** Each sample is classified as `type1-unsupported`
   (no legal continuation was ever supported), `type2-boundary` (a legal,
   supported continuation existed and the model emitted an illegal token
   anyway), `type3-semantic` (byte-valid but differs from the single corpus
   document sharing the prompt's token prefix), `no-corruption`, or
   `unresolved`. A Type-3 verdict is only ever produced from an **unambiguous**
   full-token-prefix corpus match.
4. **Regeneration for §9.** The conditional-transition audit needs the
   distribution at the failure step, and the production evaluator exposes no
   per-step logits. The audit therefore replicates the generation loop with the
   unchanged settings and **accepts a step only if the reproduced id sequence
   matches the recorded one exactly**. `trajectoriesReproduced` is 5/5 in every
   arm (20/20 overall). No distribution is read from a trajectory that did not
   reproduce.
5. **Sampling control.** Because `TEMPERATURE = 0.8` is a distribution, the
   evaluator's *other* recorded setting — greedy, temperature 0 — is replicated
   read-only from the same checkpoints, and each replicated greedy continuation
   is compared against the greedy continuation already stored in the artifacts
   before any byte claim is made from it (`replicatedTextsMatch` 5/5 in every
   arm).

**What this phase does not do.** It does not modify the tokenizer, the model,
the evaluator, the generation algorithm, the dataset, the prompts or the
thresholds. It does not re-train. It does not re-run the augmentation axis.
Every number in this report is read from the artifact, and the artifact was
produced by the instrument above.

---

## 4. Failure corpus

**Observed fact.** The corpus is **20 recorded generations**: 4 arms × 5
evaluator prompts. Every arm contributed a generation for every prompt, and the
recorded sources agree with each other where they overlap (`crossSourceIdentity`
compares the Phase 95 and Phase 96 recordings and finds them **identical** on
all 10 overlapping prompt-arm pairs). Nothing was regenerated into the corpus
and no output was invented.

| Metric | Value |
|---|---|
| Total recorded generations | 20 |
| Corrupted | 12 |
| Uncorrupted | 8 |
| Unresolved | 0 |
| Corrupted with corpus support | **12** |
| Corrupted without corpus support | **0** |
| Decision-gate classification | **B** |

The audited corpus itself is the production bilingual dataset: **600 documents**
(200 `zh`, 200 `en`, 200 `mixed`), **21,303 tokens**, **26,568 bytes**. The
character inventory records **4,335 CJK characters** and **13,497 ASCII
characters**, comprising **864 distinct CJK characters**, of which **316 appear
exactly once** and the average distinct character is seen **5.017** times.

The vocabulary is 300 ids: **4** specials, **256** raw byte tokens (ids 4..259),
**27** pure-ASCII merges, **11** two-byte *prefix fragments* of three-byte CJK
characters (byte strings that are **not** standalone-valid UTF-8), and **2**
complete three-byte CJK merges (`的`, `是`). The 11 partial CJK merges are the
structural crux of §7.

---

## 5. Per-sample findings

**Observed fact.** `firstInvalidByte` is the exact stream offset;
`firstInvalidTokenIndex` is the token whose bytes carried the fault. `-1` means
no interior corruption. `support` is the measured corpus support at the failure
state.

| Arm | Prompt | Lang | First bad byte | First bad token | Bytes before | Chars before | Support | Classification |
|---|---|---|---|---|---|---|---|---|
| A | the sun rises | en | −1 | −1 | 36 | 36 | — | no-corruption |
| A | machine learning is | en | 7 | 6 | 7 | 6 | sparse | type2-boundary |
| A | 太阳 | zh | −1 | −1 | 24 | 8 | — | no-corruption |
| A | 机器学习是 | zh | 12 | 11 | 12 | 4 | sparse | type2-boundary |
| A | 什么是 machine learning | mixed | 4 | 4 | 4 | 2 | sparse | type2-boundary |
| B94 | the sun rises | en | −1 | −1 | 37 | 37 | — | no-corruption |
| B94 | machine learning is | en | −1 | −1 | 34 | 18 | — | no-corruption |
| B94 | 太阳 | zh | −1 | −1 | 24 | 8 | — | no-corruption |
| B94 | 机器学习是 | zh | 3 | 2 | 3 | 1 | exact | type2-boundary |
| B94 | 什么是 machine learning | mixed | 3 | 3 | 3 | 1 | sparse | type2-boundary |
| C94 | the sun rises | en | −1 | −1 | 37 | 37 | — | no-corruption |
| C94 | machine learning is | en | −1 | −1 | 34 | 18 | — | no-corruption |
| C94 | 太阳 | zh | 11 | 10 | 11 | 4 | sparse | type2-boundary |
| C94 | 机器学习是 | zh | 4 | 3 | 4 | 2 | exact | type2-boundary |
| C94 | 什么是 machine learning | mixed | 3 | 3 | 3 | 1 | sparse | type2-boundary |
| T | the sun rises | en | −1 | −1 | 37 | 37 | — | no-corruption |
| T | machine learning is | en | 8 | 7 | 8 | 7 | sparse | type2-boundary |
| T | 太阳 | zh | 8 | 8 | 8 | 3 | sparse | type2-boundary |
| T | 机器学习是 | zh | 16 | 12 | 16 | 15 | sparse | type2-boundary |
| T | 什么是 machine learning | mixed | 14 | 12 | 14 | 10 | sparse | type2-boundary |

**Observed fact.** `trailingIncomplete` is **false for all 20 samples**. No
corrupt generation in this corpus is a Phase-95-style trailing cut; every one is
an interior defect. `scannerAgreesWithProduction` is **true for all 20**.

Three prompts show a non-obvious pattern that matters for §10 and §12:

- `the sun rises` is clean in **all four arms**.
- `machine learning is` is corrupted in **A and T** but clean in **B94 and C94**.
- `机器学习是` and `什么是 machine learning` corrupt in **all four arms**.
- `太阳` corrupts in **C94 and T** only.

Per-arm corrupted counts: **A = 3, B94 = 2, C94 = 3, T = 4**. No arm is
qualitatively different from the others on this axis.

---

## 6. Corpus support analysis

This section is the load-bearing discrimination, and its conclusion is stated
separately from §7 by design.

### 6.1 Corpus-support hypothesis (Hypothesis A) — **not supported**

**Observed fact.** At **every one of the 12** corrupted failure states, at least
one legal continuation existed in the vocabulary **and** the corpus supplied
that legal continuation from the same byte phase. **Zero** corrupted
generations lacked support. `corruptedWithoutSupport = 0`, `Type 1 = 0`.

Support levels across the 12 corrupted samples: **2 `exact`, 10 `sparse`,
0 `none`, 0 `unresolved`.** Across all 20 samples: 8 `not-applicable` (no
failure state exists), 10 `sparse`, 2 `exact`.

**Interpretation of the corpus scan.** The corpus was walked as a byte stream at
every token position, and the next token was tested against the byte phase:

| `need` at position | Positions | Followed by a legal token | Followed by an illegal token |
|---|---|---|---|
| 0 | 13,642 | 13,642 | 0 |
| 1 | 4,015 | 4,015 | 0 |
| 2 | 3,046 | 3,046 | 0 |
| **Total** | **20,703** | **20,703** | **0** |

**Observed fact:** across **20,703 examined corpus positions** there were **0
incompatible next-token transitions**, and the corpus enters every non-zero
UTF-8 phase. The corpus is real text and is structurally well-formed everywhere
the model needed a legal continuation.

**Observed fact — arithmetic check.** 20,703 = 21,303 corpus tokens − 600, i.e.
one excluded position per document. The instrument excludes each document's
**last** token, because a transition needs a successor and the final token has
none (`if (next === null) continue;`). The corpus never becomes unrecoverable,
so no other position is dropped. The figure coincides with Phase 97's measured
20,703 supervised positions. That agreement is a **consistency check, not
independent corroboration**: both quantities derive from the same corpus and the
same tokenization, and both exclude exactly one position per document.

**Unresolved limitation.** Support is measured as *a legal transition exists
somewhere in this phase*. It is not a measure of whether the *specific*
continuation needed at that step was individually well-attested. `sparse`
(10 of 12) means the immediate predecessor was followed by *some* legal token in
19–863 corpus contexts and the best single transition to a compatible id was
observed 4–66 times. That is real support, but it is not proof that the exact
required continuation was a *high-probability* training target. This is the
sharpest open edge in the whole audit and it is why §9 exists.

### 6.2 Boundary-fragmentation hypothesis (Hypothesis B) — **supported**

**Observed fact.** `Type 2 = 12`, and **every** one of those 12 states had a
legal, supported continuation. A Type-2 classification is exactly the statement
"a legal, corpus-supported continuation existed, and the model emitted a token
that is illegal at the current byte phase anyway."

**Supported interpretation.** The dominant observed mechanism is **boundary
fragmentation**: the model reaches a state where a legal continuation is
available and attested, and autoregressive generation enters an invalid internal
UTF-8 byte sequence at that state.

**Observed fact.** The two hypotheses are **not** both partly true here. This is
not a case of "some support problems plus some boundary problems". The support
count is zero and the boundary count is twelve; collapsing them into a generic
"Chinese generation problem" would destroy the finding. Any Phase-99 work that
treats this as a corpus-coverage deficit would be working against the evidence.

**Unresolved limitation.** Support is measured *from the corpus*; the audit does
**not** claim the tokenizer is defective, does **not** claim the tokenizer
algorithm must change, and does **not** claim the model architecture is proven
insufficient. Those are Phase-99 hypotheses (§16), not audit results.

---

## 7. Token-boundary analysis

**Observed fact.** For each of the 12 corrupted samples the audit records the
class and shape of the token that carried the fault, and the byte state at which
it was chosen.

| Property | Value |
|---|---|
| Fault entered inside an **open** multi-byte sequence | **7** |
| Fault entered at a **character boundary** | **5** |
| Fatal token is a raw **byte** token | **10** |
| Fatal token is an **ASCII merge** | **1** |
| Fatal token is a **CJK partial merge** | **1** |
| Fatal token byte length = 1 | **10** |
| Fatal token byte length = 2 | **2** |
| Invalid byte offset within the fatal token | **0 in all 12** |
| `need` at fault = 0 / 1 / 2 | **5 / 5 / 2** |
| Open-sequence length at fault = 1 / 2 / 3 | **5 / 5 / 2** |
| Fault after a correctly-decoded character | **5** |
| Fault after an incorrectly-decoded character | **7** |
| ASCII token emitted inside an open sequence | **1** |
| CJK fragment emitted at a character boundary | **0** |

**Supported interpretation.** Three structural readings follow directly:

1. **The fault is always at the very start of the fatal token.** The invalid
   byte offset within the token is **0 in all 12 cases**. The model does not
   emit a legal prefix and then go wrong inside a token; it *chooses* a whole
   token that is illegal from its first byte at the current phase. This is a
   *token-selection* failure, not a byte-emission failure.
2. **The most common single mechanism is a 1-byte token chosen mid-sequence.**
   7 faults enter inside an open sequence, and in 5 of those the model is at
   `need=1` (two bytes of a three-byte character already emitted) and picks a
   single byte. `need=1` is precisely the phase where the *only* legal
   single-byte continuations are the 64 continuation bytes `0x80–0xBF` — and
   every other 1-byte token corrupts.
3. **The five character-boundary faults are not a different phenomenon.**
   At `need=0` the fatal token is again a 1-byte or 2-byte token whose bytes are
   illegal as a *start*. `cjkFragmentAtCharacterBoundary = 0` and
   `asciiTokenInsideOpenSequence = 1`: the failures are concentrated, not
   scattered across token classes.

**Observed fact (vocabulary structure).** The classification sweep confirms
every complete multi-byte merge decodes standalone as valid UTF-8, every partial
multi-byte merge does **not**, and **no merge consists solely of continuation
bytes** — so at `need=2` no token in the vocabulary can complete a character in
one step. This is a *vocabulary* fact, not a corpus fact, and the audit records
it as such. It bounds what a legal continuation looks like at the deepest phase.

**Unresolved limitation.** The audit measures *where* the fatal token starts and
*what* it is. It does not measure *why the model preferred it*. That is §9.

---

## 8. Byte-boundary analysis

The byte-level view is the same walk as §7, expressed in stream offsets rather
than token indices. The artifact records both because they answer different
questions and because conflating them is the easiest way to misreport this kind
of failure.

**Observed fact.** `invalidByteOffsetWithinTokenHistogram` is `{0: 12}`.
Combined with `fatalTokenByteLengthHistogram` `{1: 10, 2: 2}` and the `need` and
sequence-length histograms in §7, every one of the 12 failures is fully
described by the triple *(phase at fault, length of the sequence already open,
byte class of the chosen token)*.

**Supported interpretation.** The failure is **not** byte-granular in the
emission sense. Nothing here resembles a stream that was assembled correctly and
then damaged; in each case the model stood at a well-defined phase, and the next
whole token it selected was illegal at that phase. The byte-level description is
consequently a *restatement* of the token-level description, not an independent
finding — and the audit reports it that way rather than as two results.

**Unresolved limitation.** The audit does not measure which specific byte value
would have been correct at each state, only that a legal set existed and was
corpus-supported. The identity of the "right" continuation for each individual
trajectory is not established, because the evaluator's task is open-ended
continuation rather than a single ground-truth target.

---

## 9. Conditional-transition analysis

Because the production evaluator exposes no per-step logits, the audit
replicated the generation loop — and **only read a distribution from a
trajectory whose reproduced token ids matched the recorded ids exactly**.
`trajectoriesReproduced` is **5/5 in every arm (20/20 overall)**, so all 12
failure states were inspectable.

**Observed fact — the distribution at the failure step, for each of the 12:**

| Arm | Prompt | Chosen id | p(chosen) | Legal mass | Illegal mass | Legal argmax? | Best legal id | p(best legal) | Its overall rank |
|---|---|---|---|---|---|---|---|---|---|
| A | machine learning is | 233 | 0.2720 | 2.7% | 97.3% | **no** | 145 | 0.0235 | 3 |
| A | 机器学习是 | 169 | 0.9294 | 0.2% | 99.8% | **no** | 234 | 0.0006 | 12 |
| A | 什么是 machine learning | 291 | 0.2623 | 64.3% | 35.7% | **no** | 148 | 0.1915 | 2 |
| B94 | 机器学习是 | 138 | 0.1610 | 47.3% | 52.7% | **no** | 232 | 0.1774 | 2 |
| B94 | 什么是 machine learning | 145 | 0.0129 | 95.3% | 4.7% | **yes** | 104 | 0.2158 | 1 |
| C94 | 太阳 | 235 | 0.9820 | 0.2% | 99.8% | **no** | 171 | 0.0004 | 10 |
| C94 | 机器学习是 | 293 | 0.0063 | 88.3% | 11.7% | **yes** | 161 | 0.2046 | 1 |
| C94 | 什么是 machine learning | 169 | 0.6775 | 28.2% | 71.8% | **no** | 278 | 0.0810 | 2 |
| T | machine learning is | 236 | 0.0423 | 79.9% | 20.1% | **yes** | 139 | 0.2959 | 1 |
| T | 太阳 | 235 | 0.0125 | 76.0% | 24.0% | **yes** | 138 | 0.6187 | 1 |
| T | 机器学习是 | 234 | 0.5234 | 2.1% | 97.9% | **no** | 186 | 0.0050 | 10 |
| T | 什么是 machine learning | 134 | 0.0012 | 93.8% | 6.2% | **yes** | 276 | 0.2511 | 1 |

**Observed fact.** In all 12 cases the chosen token was **incompatible** with
the open byte phase (`chosenCompatible = false` in every one). In **7 of 12**
the model's single highest-probability token was itself illegal — the model's
own preference was the corrupting token. In **5 of 12** a legal token was the
argmax and the incompatible token was drawn below it. The legal-token mass at
the failure step ranges from **2.3% to 95.3%**, and is **≥ 50% in 6 of 12**.

**Observed fact — the shape of the whole generated stream.** Across all 480
decoded steps in the replicated trajectories, **96 steps** chose an
incompatible token. These are **not** 96 independent faults: the first
incompatible step coincides exactly with `firstInvalidTokenIndex` in all 12
corrupted generations, and the remaining 84 are downstream — once the stream is
off-phase the model keeps selecting incompatible tokens and does not recover.
The 8 uncorrupted generations contain **zero** incompatible steps.

**Supported interpretation.** The model, at the failure state, has a legal
continuation available and frequently assigns it substantial probability — in
half the cases the majority of its mass. It nevertheless selects an illegal
token. When the illegal token is the argmax (7/12), the model is not merely
unlucky; its *preference* at that state is the corrupting continuation. When the
legal token is the argmax (5/12), the failure is produced by sampling from a
distribution that still assigns meaningful mass to the illegal set. Both forms
point at the same underlying quantity: the **conditional distribution at
continuation-byte states is not sharply separated into legal and illegal
regions**.

**Observed fact — sampling control.** The temperature-0.8 setting is a
distribution, so the audit replicated the evaluator's recorded greedy setting
from the same checkpoints and verified each replicated greedy text against the
greedy continuation already stored in the artifacts (`replicatedTextsMatch` 5/5
in every arm).

| Arm | Greedy corrupted | Sampling corrupted | Greedy clean → sampling corrupted | Sampling clean → greedy corrupted |
|---|---|---|---|---|
| A | 2 | 3 | **1** | 0 |
| B94 | 2 | 2 | 0 | 0 |
| C94 | 3 | 3 | 0 | 0 |
| T | 2 | 4 | **2** | 0 |

**Supported interpretation.** Sampling is a **contributing** factor, not the
cause. Greedy decoding also corrupts **9 of 20** generations across the four
arms, and in no arm does greedy-avoids-it while sampling-causes-it as the sole
pattern — the reverse cell is 0 everywhere. Sampling *adds* corruption (A: 2 → 3;
T: 2 → 4) but never *removes* it.

**Unresolved limitation — stated in the artifact and repeated here.** A legal
argmax at the recorded failure step does **not** prove greedy decoding would
have avoided the failure: under greedy the trajectory diverges much earlier, so
the state at that step would not be the same state. The comparison **bounds**
the sampling contribution; it does not eliminate it. The audit's own sampling
control makes this concrete — for arm A, the `machine learning is` generation
that is corrupted at temperature 0.8 is *clean* under greedy, but that greedy
run is a different trajectory, not the same trajectory with a different draw.

---

## 10. CJK vs English comparison

**Observed fact — the control.**

| Group | Generations | Corrupted |
|---|---|---|
| Treated as the control group — no non-ASCII byte emitted | 4 | **0** |
| Emitted at least one non-ASCII byte | 16 | **12** |

The pure-ASCII group is `the sun rises` in all four arms. In all four, every
emitted byte is `< 0x80`, so **no token choice in those trajectories could have
produced interior corruption** — the immunity is structural, not empirical. The
remaining 16 generations each emitted at least one non-ASCII byte; 12 of them
corrupted.

**Supported interpretation.** In this audited sample there is a **strong
association** between multi-byte UTF-8 emission and interior corruption, and
the structural argument for the ASCII group's immunity is exact rather than
statistical. Multi-byte emission is the **precondition** for this failure mode:
with no byte `≥ 0x80` there is no byte phase to violate.

**Not claimed.** This is an association measured on a 20-sample, 5-prompt corpus,
not a universal causal law. The audit does **not** claim "Chinese prompts
corrupt" or "non-ASCII always corrupts". The counterexamples are inside the
audited set and are stated as observed facts:

- `太阳` (arm A, 24 bytes, all multi-byte, `validCharactersBeforeCorruption = 8`)
  is **entirely non-ASCII and entirely clean**.
- `machine learning is` (B94, 34 bytes, 18 characters) emits non-ASCII and is
  clean; (C94) likewise.
- `机器学习是` corrupts in all four arms while `太阳` corrupts in only two.

**Observed fact — prompt language is not the mechanism.** `machine learning is`
is an **English** prompt, and it produced corruption in arms A and T. Its
failure is not semantic and not language-driven: at the failure step the model
was at `need=1` (arm A) / `need=1` (arm T) inside an open multi-byte sequence
and chose a single byte token. The trajectory had begun emitting multi-byte
bytes, and the corruption followed the **multi-byte emission**, not the prompt's
language.

**Supported interpretation.** The correct predictor of this failure mode in the
audited sample is **whether the emitted byte stream entered a multi-byte phase**,
not which language the prompt was written in. "Chinese prompt semantics" is
therefore argued against as a root explanation by a within-corpus
counterexample, not by assertion.

**Unresolved limitation.** Four English generations is a very small control, and
the treated/control split is confounded with prompt identity: the only
pure-ASCII prompt is also the prompt with the most corpus-shaped continuation
(`es over the quiet valley each morning…`). The audit cannot separate "ASCII" from
"this particular prompt" with n = 1 prompt. **English generation is not claimed
to be universally solved** — arm A and arm T both corrupted an English prompt.

---

## 11. Mixed-class analysis

**Observed fact — per-arm, not an aggregate.** The mixed prompt
`什么是 machine learning` has a 26-byte UTF-8 prompt (17 ASCII bytes, 9
non-ASCII bytes) and its first non-ASCII character is at index 0. It corrupted in
**all four arms** (`firstInvalidTokenIndex` 4 / 3 / 3 / 12).

| Arm | ASCII bytes before corruption | Non-ASCII bytes before corruption | ASCII head intact? | First non-ASCII token index | Fatal token | Inherits CJK mechanism? |
|---|---|---|---|---|---|---|
| A | 0 | 4 | yes | 0 | index 4 (byte 4) | **yes** |
| B94 | 0 | 3 | yes | 0 | index 3 (byte 3) | **yes** |
| C94 | 0 | 3 | yes | 0 | index 3 (byte 3) | **yes** |
| T | 8 | 6 | yes | 0 | index 12 (byte 14) | **yes** |

**Observed fact — where corruption starts.** In arms A, B94 and C94 the
corruption begins after **0 ASCII bytes and 3–4 non-ASCII bytes** — that is,
inside the very first multi-byte character. The generated text begins with a
non-ASCII token (`firstNonAsciiTokenIndex = 0` in every arm, with
`leadingAsciiMergeTokens = 0`), so there was no ASCII run in the generation at
all before the fault.

**Observed fact — is the ASCII content before corruption intact?** In A, B94 and
C94 there is **no ASCII content before the corruption** — the count is zero, so
the question is vacuous for those three. In arm T the generation emitted **8
ASCII bytes before the corruption and they are intact**
(`asciiPrefixIntact = true`). In all four arms `asciiPrefixIntact` is **true**,
meaning the failure did not enter during an ASCII portion in any arm.

**Observed fact — does corruption begin on multi-byte emission?** Yes, in all
four arms: `nonAsciiBytesBeforeCorruption > 0` in every case, and
`inheritsCjkMechanism` is **true** in every case. In arm T corruption begins
after the generation had already emitted 6 non-ASCII bytes — it followed the
multi-byte phase rather than the prompt.

**Supported interpretation.** The mixed failures **inherit the CJK mechanism**.
They are not a third phenomenon. The mixed prompt's own first character is CJK,
so the generation enters a multi-byte phase almost immediately, and the failure
appears there. Arm T, which emitted a clean ASCII run first and then corrupted
after entering a multi-byte phase, is the cleanest single illustration that the
mixed failure tracks multi-byte emission.

**Unresolved limitation.** The mixed prompt is a **single prompt**, so there is
no within-class replication and no way to separate a mixed-specific effect from
prompt identity. The audit records `inheritsCjkMechanism` as a
per-arm Boolean and does **not** claim a distinct mixed-class mechanism. Whether
mixed prompts behave like CJK prompts in general, or whether this one prompt
merely happens to begin with CJK, is **not established** by this artifact and is
marked unresolved.

---

## 12. Cross-arm comparison

**Observed fact.** Arm A is the Phase 90 aligned baseline (k = 0); B94 and C94
are the Phase 94 augmentation arms (k = 8 and k = 24); T is the Phase 96
treatment (k = 8). Phase 96 recorded that A vs T is **init-confounded**, so this
audit does not treat any arm pair as a clean causal contrast.

| Prompt | A | B94 | C94 | T |
|---|---|---|---|---|
| the sun rises (en) | clean | clean | clean | clean |
| machine learning is (en) | **type2** @7 | clean | clean | **type2** @8 |
| 太阳 (zh) | clean | clean | **type2** @11 | **type2** @8 |
| 机器学习是 (zh) | **type2** @12 | **type2** @3 | **type2** @4 | **type2** @16 |
| 什么是 machine learning (mixed) | **type2** @4 | **type2** @3 | **type2** @3 | **type2** @14 |
| **Corrupted total** | 3 / 5 | 2 / 5 | 3 / 5 | 4 / 5 |

**Observed fact.** Corrupted counts by language across all four arms:
`en` 2/8, `zh` 6/8, `mixed` 4/4. Greedy corrupted counts: A 2, B94 2, C94 3,
T 2.

**Supported interpretation.** The mechanism is **uniform across arms**. Every
arm exhibits Type-2 boundary fragmentation and no arm exhibits Type-1
unsupported continuation. `机器学习是` and the mixed prompt corrupt in **all
four** arms regardless of augmentation dose; `太阳` corrupts in two of four.
There is no arm in which the corruption disappears, and no arm in which it has a
different character. The failure is therefore a property of the
**model-plus-tokenizer system at this scale**, reproduced across four
independently trained checkpoints, rather than a defect of one training recipe.

**Supported interpretation — bearing on the augmentation axis.** Phases 94 and
96 returned Outcome D on rollout augmentation, and Phase 97 recommended not
re-running that axis. This audit is consistent with that: the corruption is not
absent or qualitatively different in the k = 0 baseline (A), which corrupts 3 of
5. Augmentation neither introduced nor removed the mechanism.

**Unresolved limitation.** n = 5 prompts per arm, with 4 arms that differ in
training recipe *and* in checkpoint identity, and with A-vs-T additionally
init-confounded. Cross-arm counts (3/2/3/4) are **not** treated as a dose-response
and no arm ranking is claimed. Phase 96's own limitation — "stop using a
5-prompt set for capability decisions" — applies with equal force to any
dose claim this audit might be tempted to make, so none is made.

---

## 13. Evidence classification

### 13.1 Observed facts

1. Decision gate **B**. Type 1 = **0**, Type 2 = **12**, Type 3 = **0**,
   unresolved = **0**, no-corruption = **8**; total 20.
2. **12 of 12** corrupted generations had a legal, corpus-supported continuation
   at the failure state. **0 of 12** lacked support.
3. Across **20,703** examined corpus positions there were **0** incompatible
   next-token transitions; the corpus enters every non-zero UTF-8 phase.
4. **12 of 16** generations containing non-ASCII bytes were corrupted;
   **0 of 4** pure-ASCII generations were corrupted.
5. In all **12** failure states the chosen token was incompatible with the open
   byte phase; in **7** the model's own argmax was the illegal token, in **5** a
   legal token was the argmax and an illegal one was sampled. Legal-token mass
   ranged **2.3%–95.3%**.
6. The first incompatible step coincides exactly with `firstInvalidTokenIndex`
   in all 12 corrupted generations; 96 incompatible steps in 480 total, 84 of
   them downstream of a first fault.
7. The invalid byte is at **offset 0** of the fatal token in all 12 cases; the
   fatal token is a **1-byte token in 10** cases and a 2-byte token in 2.
8. **7** faults entered inside an open sequence (5 at `need=1`, 2 at `need=2`);
   **5** entered at a character boundary.
9. `太阳` in arm A is fully multi-byte and fully clean. `machine learning is` is
   clean in B94 and C94 and corrupted in A and T.
10. `the sun rises` did not corrupt in any arm. No training was performed.
    Phase-95 evaluator and generation logic were not modified.
11. Sampling contributes but does not cause: greedy also corrupts 9 of 20 and
    never rescues a case that sampling alone corrupted (that cell is 0 in every
    arm).

### 13.2 Supported interpretations

1. **The dominant observed failure mechanism is Type-2 boundary fragmentation:**
   the model reaches states where a legal, corpus-supported continuation exists,
   but autoregressive generation enters an invalid internal UTF-8 byte sequence.
2. The corpus-support explanation is **not** the dominant explanation, because
   the relevant continuation existed at every audited corrupted failure state.
3. The failure is a **token-selection** failure at a well-defined byte phase,
   not a byte-emission or stream-damage failure.
4. The association is with **multi-byte UTF-8 emission**, not with prompt
   language: an English prompt (`machine learning is`) fails by the same
   mechanism once the stream enters a multi-byte phase.
5. The mixed-class failures **inherit the CJK mechanism**; they are not a third
   phenomenon in this artifact.
6. The mechanism is **uniform across all four arms**, including the k = 0
   baseline, and is therefore not an artefact of the augmentation axis.
7. At the failure state the conditional distribution is **not sharply separated**
   into legal and illegal regions — the model often assigns most of its
   probability mass to legal continuations and still selects an illegal one.

### 13.3 Unresolved limitations

1. **Support is phase-level, not transition-level.** `sparse` support (10 of 12)
   means a legal transition exists from this phase; it does not establish that
   the exact required continuation was a high-probability training target.
2. **No ground-truth continuation exists** for an open-ended generation task, so
   the "correct" next token at each failure state is not identified
   individually.
3. **The greedy comparison bounds but does not eliminate** the sampling
   contribution; a legal argmax at the recorded step does not imply greedy would
   have avoided the failure, because greedy diverges earlier.
4. **n = 5 prompts, 4 arms**, with A-vs-T init-confounded; no dose-response is
   claimed and no arm ranking is claimed.
5. **Mixed is a single prompt** with no within-class replication; a
   mixed-specific effect cannot be separated from prompt identity.
6. **The English control is 1 pure-ASCII prompt versus 1 non-ASCII-emitting
   prompt**, confounded with prompt identity.
7. The audit reads generations already recorded by Phases 95/96 and does not
   establish that the same mechanism accounts for corruption outside those five
   prompts.

### 13.4 Phase-99 hypotheses

Listed here so they are clearly separated from §13.1–13.3. **None of the
following is established by this audit:**

- the tokenizer is defective, or its algorithm must be changed;
- the model architecture is proven insufficient;
- a specific training intervention is already validated;
- any one of the candidate mechanisms in §16 is the cause.

---

## 14. Limitations

Beyond the per-section limitations above, the audit's boundaries are:

**Scope.** The failure corpus is 20 generations over 5 prompts. It is a
*documented* corpus — every generation is a recorded Phase 95/96 output, and
nothing was regenerated into it — but it is small. Counts like 12 and 8 are
exact for this corpus and should not be read as population rates.

**Instrument.** The conditional-transition analysis required replicating the
generation loop, because the production evaluator exposes no per-step logits.
The audit mitigates this by requiring exact id-level reproduction (20/20) before
reading any distribution, but the distributions are read from a *replica* of the
sampler operating on the *unchanged* checkpoints and settings. This is a
reimplementation, not the production path itself. The production byte scanner,
by contrast, is not reimplemented blindly: the walker's equivalence against the
unchanged `scanUtf8` is asserted per sample and holds in all 20 cases.

**Unchanged surfaces.** The audit deliberately does not touch the tokenizer,
dataset, evaluator, generation algorithm, prompts or thresholds, and does not
train. This is why it can decide between the two stated hypotheses but cannot
*causally* attribute the failure to any particular internal mechanism — every
mechanistic statement in §16 is a hypothesis precisely because the intervening
surfaces were held frozen.

**Generality.** Phase 97 warned that a 5-prompt set is too coarse for capability
decisions, and Phase 96 recommended stopping the use of it for them. This audit
uses that set because the frozen artifacts are in that set's coordinates. Any
generalisation beyond it is unsupported.

**Pre-existing repository state.** The repository is not globally
typecheck-clean. See §15 for the measured counts and the confirmation that no
Phase-98 file contributes an error.

---

## 15. Final conclusion

The evidence supports exactly one causal-adjacent statement, and this report
makes only that one:

> **The dominant observed failure mechanism is Type-2 boundary fragmentation:**
> **the model reaches states where a legal, corpus-supported continuation
> exists, but autoregressive generation enters an invalid internal UTF-8 byte
> sequence.**

What the evidence establishes:

- The corpus-support hypothesis is **not supported as the dominant explanation**.
  `Type 1 = 0`; the relevant continuation existed in corpus support at every one
  of the 12 audited corrupted failure states, and the corpus scan found **0**
  incompatible transitions across **20,703** positions.
- The boundary-fragmentation hypothesis is **supported**. `Type 2 = 12`, and
  every corrupted state had a legal, supported continuation.
- The association is with **multi-byte UTF-8 emission**, not with prompt
  language. `12/16` non-ASCII-containing generations corrupted; `0/4` pure-ASCII
  generations corrupted; and an English prompt corrupted once its stream entered
  a multi-byte phase.
- The failure mechanism is **uniform across all four arms**, including the
  unaugmented baseline.

What the evidence does **not** establish, and what this report therefore does
**not** claim:

- **Not** a proven tokenizer defect. The vocabulary's partial CJK merges are a
  structural fact that makes the failure *possible*; the audit does not show
  that they *cause* it, and the counterexample within the audited set — arm A's
  `太阳` generation, 24 bytes and 8 characters, entirely multi-byte and entirely
  clean — shows that partial merges do not by themselves produce corruption.
- **Not** a requirement to change the tokenizer algorithm. Phase 92 already
  measured that tripling the single-token CJK rate moved the gate by zero.
- **Not** a proof that the model architecture is insufficient. Phase 93 already
  measured that a 3.9× capacity increase did not fix it.
- **Not** a validated training intervention. No training was justified and none
  was performed.

**Decision: `B — boundary/transition corruption is the dominant explanation`**,
with the corpus-support alternative rejected and the mechanism itself left
un-diagnosed. The audit answers Phase 97's discriminating question and does not
overreach into the question that follows it.

---

## 16. Phase-99 recommendation

**Recommendation: a read-only design/audit phase first. Do not train.**

The existing evidence does **not** justify a training experiment. It localises
the failure to the conditional distribution at continuation-byte states, but it
does not identify *which* property of that distribution is responsible, and
the candidate mechanisms below imply different — and in some cases mutually
exclusive — interventions. Spending another multi-hour training run before
isolating the mechanism would be parameter searching on an un-decided question,
which is precisely the resource discipline Phases 94–97 established.

**The recommended Phase-99 question:**

> **What causes the model to choose an incompatible next byte/token when a
> legal UTF-8 continuation exists and is supported by the corpus?**

**Candidate mechanisms — hypotheses only, none proven, none selected:**

1. **Representation of byte-level UTF-8 structure in the tokenizer.** The
   vocabulary's 11 partial CJK merges are byte strings that are not
   standalone-valid UTF-8, so a token can carry a byte phase forward without
   carrying a character. Whether that representation makes the legal/illegal
   distinction harder to learn is unmeasured.
2. **Conditional next-token probability around continuation-byte states.** The
   audit measured that the legal/illegal split is not sharp (legal mass
   2.3%–95.3%, illegal argmax in 7 of 12) but did not characterise *how* the
   distribution is shaped — for example whether incompatible mass concentrates
   on a small set of habitual tokens.
3. **Insufficient learned transition sharpness.** Legal-mass ≥ 50% in 6 of 12
   states suggests a calibration or sharpness problem rather than a missing
   capability, but sharpness was not measured directly.
4. **Training-signal dilution.** Most CJK characters require three byte tokens,
   and Phase 91 measured a per-token error of ≈ 3.5–4%; whether the error
   compounds because continuation positions are under-weighted per character is
   untested.
5. **Model-capacity limitations specific to multi-byte continuation states.**
   Phase 93 refuted capacity as a *global* explanation; it did not test capacity
   restricted to continuation states.

**How Phase 99 should isolate the mechanism.** Before any training:

- Extend the **deterministic forward/logit analysis** to the full failure
  population rather than the 12 audited states — characterising the shape of
  the legal and illegal sets at every continuation phase, not just the chosen
  token's probability.
- Establish whether the incompatible mass at these states concentrates on a
  **small, identifiable token set** or is diffuse. A concentrated set and a
  diffuse one point at different mechanisms (habitual-token pathology vs
  unsharpened conditional).
- Test whether the failure survives when the **corpus support is made
  transition-level rather than phase-level** — i.e. whether the *exact* required
  continuation is well-attested, closing the sharpest limitation in §6.1.
- If the mechanism isolates to a tokenizer-representation question, that is a
  **design** question to be answered before training, not by training.

**Explicit non-recommendations.** Do not re-run the augmentation/rollout axis
(Phases 94 and 96 both returned Outcome D). Do not spend a training run on a
mechanism that has not been isolated. Do not treat "Chinese generation problem"
as a research question — §6 shows the two mechanisms it would conflate are not
both present here.

---

## Appendix A — Verification record

| Check | Command | Result |
|---|---|---|
| Phase-98 focused suite | `npx --yes tsx -e "…runPhase98Tests()"` | **114 passed, 0 failed, 0 skipped** (exit 0) |
| Aggregate research runner | `npx --yes tsx src/lib/minimind/research/__tests__/run.ts` | see §A.2 |
| Production build | `npm run build` | see §A.3 |
| TypeScript check | `npx --yes tsc --noEmit` | see §A.4 |

### A.2 Aggregate research runner

```
npx --yes tsx src/lib/minimind/research/__tests__/run.ts
```

**Exit code 0. `TOTAL: 1092 passed, 0 failed`.** The run completed; nothing was
skipped and no suite was disabled.

The runner at `src/lib/minimind/research/__tests__/run.ts` is the historically
untracked aggregate runner. It was **not modified** for this phase — Phase 98
was already registered in it at line 35/216 — and no historical test was
weakened, deleted or fixed. Every registered phase ran to completion, ending
with:

```
  -- Phase 98: CJK/mixed interior byte-corruption audit --
  Phase 98: 114 passed, 0 failed, 0 skipped
============================================================
TOTAL: 1092 passed, 0 failed
============================================================
```

Phase 98's contribution to that total is the **114 passed, 0 failed, 0 skipped**
also reported in §A.1. The remaining 978 passing tests are the Phases 57–97
suites, all of which passed here without modification. No historical test was
made to pass; the aggregate result is `0 failed` on the working tree as it
stands.

### A.3 Build

`npm run build` — **exit code 0. Build succeeded.**

```
   ▲ Next.js 15.5.20
 ✓ Compiled successfully in 6.6s
 ✓ Generating static pages (39/39)
```

Zero build errors. The build emits **178 ESLint warnings**, all of them
pre-existing and all in files unrelated to Phase 98 — predominantly
`@typescript-eslint/no-unused-vars` and one `react-hooks/exhaustive-deps` in
`src/components/ai-lab/*`. No Phase-98 file contributes a warning, and
`experiments/phase98/` is not part of the Next.js build graph. These warnings
were **not** fixed, because doing so would mean modifying unrelated files.

For completeness against the project's stated acceptance criterion of "no
errors, no warnings": the build meets the *no errors* half. The *no warnings*
half is **not** met by the repository as it stands, and was not met before this
phase either — the warnings are a pre-existing property of the working tree, not
a regression introduced here.

### A.4 TypeScript check

`npx --yes tsc --noEmit` reports **64 errors across 18 files**. **Zero** of them
are in any Phase-98 file (`experiments/phase98/*` and
`src/lib/minimind/research/tests/phase98-cjk-byte-corruption.test.ts` are both
inside the `**/*.ts` include glob and produce no diagnostics). Every error is in
a pre-existing historical test file and none was modified:

`src/lib/minimind/__tests__/phase54-dashboard.test.ts`,
`src/lib/minimind/__tests__/runtime-boundary.test.ts`,
`src/lib/minimind/data/streaming/__tests__/streaming.test.ts`,
`src/lib/minimind/research/__tests__/phase58-runtime.test.ts`,
`phase60-research-loop.test.ts`, `phase61-checkpoint-resume.test.ts`,
`phase61-e2e.test.ts`, `phase65-real-training.test.ts`,
`phase66-lifecycle.test.ts`, `phase67-generation.test.ts`,
`phase72-chat-reliability.test.ts`, `phase84-capability.test.ts`,
`phase87-recipe-sweep.test.ts`, `src/lib/minimind/research/tests/phase89-training-alignment.test.ts`,
`phase90-sequence-alignment.test.ts`,
`src/lib/minimind/training/__tests__/evaluator.test.ts`,
`phase46-experiment.test.ts`, `resume.test.ts`.

**Note on the previously assumed count.** The brief anticipated roughly 25
pre-existing errors. The measured count is **64**. All 64 are in the
unmodified historical files listed above; none is introduced by this phase and
none was fixed, per the instruction not to modify unrelated files.

### A.5 Integrity of the audited surfaces

The artifact records, and the Phase-98 suite independently re-verifies, that
this phase modified no production module: no tokenizer change, no dataset
change, no evaluator change, no generation change, no threshold change, no
training run, no `Math.random()`, no `setTimeout()`.
