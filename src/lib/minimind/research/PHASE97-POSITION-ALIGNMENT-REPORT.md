# Phase 97 — Position / Context Alignment Audit

**Status:** audit complete. **No training was run in this phase.**
**Date:** 2026-09-16
**Artifact:** `experiments/phase97/position-alignment-audit.json`
**Instrument:** `experiments/phase97/position-alignment-audit.ts`
**Suite:** `src/lib/minimind/research/tests/phase97-position-alignment.test.ts`

---

## 1. Research question

Why does the current training signal produce strong memorization and low
training loss without transferring to the short-prompt generation the
evaluator measures?

The hypothesis under test — **not assumed true** — was:

> Is the remaining bottleneck caused primarily by the mismatch between the
> training prediction task and the exact short-prefix continuation task used
> by the generation evaluator?

The question decomposes into four checkable axes — positional, context-length,
task-shape, and short-prefix-support — plus the content axis (whether the
evaluator's specific prompts were ever supervised as contexts).

## 2. Prior evidence (Phases 89–96)

| Phase | Intervention | Recorded verdict |
|---|---|---|
| 89 | Un-shifted targets in the training loop | Objective corrected; memorization strong |
| 90 | Document-aligned sequence layout + supervised mask | Layout frozen; condition B checkpoint became the long-lived baseline |
| 92 | Tokenizer merge budget A/B/C | Outcome C |
| 93 | Model capacity sweep | Outcome B — capacity is not the Level-4 blocker |
| 94 | Own-context rollout augmentation (dose R/k) | Outcome D — augmentation hurt, dose-dependent |
| 95 | Generation-evaluation instrument repair | Oracle 100.000% tolerant; **no** A/B/C verdict flipped |
| 96 | Augmentation transfer experiment, init-matched A vs T | Outcome D — "no transfer demonstrated"; all arms Level 3 |

Phase 96 also recorded that its A-vs-T comparison was **init-confounded**
(initial losses 6.0273 vs 5.9772). Phase 97 therefore does **not** reuse that
pairing as a causal baseline; it reads the Phase 96 arms only as independently
trained checkpoints, for corroboration of one falsifiable prediction.

Two structural facts carried into this audit and are re-verified below: the
document-aligned layout never inserts `<eos>`, and the production model carries
no positional encoding.

## 3. Audit methodology

The audit is **read-only and deterministic**. It trains nothing, writes no
checkpoint, runs no optimizer step, uses no `Math.random()` and no
`setTimeout()`, and imports no Phase 94 or Phase 95 harness. It imports the
*unchanged* production modules (`TextDataset`, `BPETokenizer`, `TensorModel`
and the transformer block) and reconstructs — from real code and the real
corpus — the exact geometry of both sides of the comparison:

- **Training side.** `buildDocumentAlignedSamples` is invoked as the training
  loop invokes it, and every supervised position `(window, s, context, target)`
  is enumerated under the Phase 89/90 objective as `CrossEntropyLoss` actually
  computes it.
- **Evaluation side.** The audit reproduces `evaluateGeneration`'s loop
  literally: `ctx = currentIds.slice(-128)`, `row = logits[0][ctx.length-1]`,
  `break` on token 3 — so generation step *t* conditions on context length
  `L + t`.
- **Comparison.** Context lengths, prompt tokenizations, prefix relations and
  positions are matched between the two sides.

Where prose and code disagreed, **the code was taken as the source of truth**,
and every reported frequency is measured, not asserted.

One methodological limit is recorded up front: the architecture equivalence
probe compares *logits*, i.e. it tests the model's function, and cannot by
itself prove the absence of a positional mechanism. It is combined with a
source-level reading of `TensorEmbedding` (pure token lookup, no position term)
and `TensorTransformerBlock` (`maxSeqLen` documented as "for reference /
validation") to reach the conclusion in F1.

## 4. Exact audit results

### 4.1 Corpus and tokenizer

600 documents (200 en / 200 zh / 200 mixed), 17,854 characters / 26,568 bytes /
21,303 tokens. Document token length: min 13, max 60, median 36, p90 46.
**Zero** documents reach `blockSize` (64), so each document yields exactly one
aligned window (windows-per-doc histogram: `{1: 600}`). Tokenizer: byte-level
BPE, vocab target 300, vocab size 300, built as `Random.setSeed(42)` then
`train(corpus, 300)`.

### 4.2 Training geometry (what the model is actually taught)

- 600 windows, **20,703 supervised positions**.
- Supervised **context lengths span 1..59** — one below the longest document.
- `contextAlwaysDocumentPrefix = true`: every supervised training context is a
  true document prefix. Prefix-continuation *is* the training task.
- Short-prefix support is dense, not sparse: 1,200 positions at context ≤ 2,
  **3,000 at ≤ 5**, 3,600 at ≤ 6, 4,800 at ≤ 8.
- `<eos>` appears **0 times** as a training input and **0 times** as a
  supervised target. The aligned layout never consults `insertEos`.

### 4.3 Evaluation geometry (what the evaluator actually asks)

5 prompts, token lengths 9 / 13 / 5 / 13 / 19. Presented context lengths span
**5..42**; generation exposes exactly 24 continuation positions; `maxCtx` 128.

### 4.4 Context-length overlap

Training support 1..59, evaluation 5..42. **Lengths outside training support:
none.** Fully contained.

### 4.5 Prompt support

| Prompt | Tokens | Exact token prefix | Exact character prefix | Prefix docs | Occurs anywhere |
|---|---|---|---|---|---|
| `the sun rises` | 9 | **no** | **yes** | 0 | no |
| `machine learning is` | 13 | no | no | 0 | **no** |
| `太阳` | 5 | yes | yes | 2 | yes |
| `机器学习是` | 13 | no | no | 0 | **no** |
| `什么是 machine learning` | 19 | yes | yes | 1 | yes |

**2/5** prompts are exact token prefixes of a training document — for those the
evaluator's opening context is reproduced verbatim during training. **3/5** are
not. Two prompts (`machine learning is`, `机器学习是`) do not occur in the
corpus **at all**, as a token prefix, a token substring, or a shared-prefix
multiset.

### 4.6 Token-boundary divergence (the central positive finding)

`the sun rises` is a **verbatim character prefix of document 0**
(`the sun rises over the quiet valley each morning`) but is **not a token
prefix of it**. First divergence at token index 7: the prompt holds token
**105** (`"e"`), the document holds token **295** (`"es "`).

The mechanism is byte-level BPE's greedy merge: `"es"` is only merged into a
single token when the word continues into the next one. Tokenized standalone,
`the sun rises` ends on a bare `e`; tokenized as the head of the document, it
does not.

Consequence: if the model emits the continuation its training taught it, the
evaluator's text becomes

```
"the sun rises" + "es over the quiet valley each morning"
  = "the sun riseses over the quiet valley each morning"
```

— a duplicated grapheme, produced not by a broken model but by a fidelity
mismatch at the prompt boundary.

### 4.7 Architecture probe

The production model carries **no positional encoding of any kind**. A padded
64-slot training window and the bare n-token prefix of the same document
produced next-token logits that are **bit-identical in 16/16 cases** (max
|Δlogit| = 0). The *positional* half of the hypothesis is therefore refuted by
direct measurement, not by argument.

### 4.8 Boundary effects

One position per window is structurally unread (the last slot can never be a
context under the causal shift), and padding does **not** leak into real
positions: causal attention restricts window position *s* to keys `0..s`, while
padding occupies only positions `≥ docLen`; padding also carries `mask = 0`, so
it contributes neither loss nor gradient.

### 4.9 Augmentation geometry cross-check

The Phase 96 augmentation's reachable `s0` geometry was re-derived from the
corpus and compared against the recorded `experiments/phase96/preflight.json`:
eligible documents **600 / 600** (matches), reachable `s0` range distribution
`{1..3: 1, 1..4: 1, 1..5: 598}` (matches exactly). The re-derivation is
faithful, so the Phase 96 construction can be reasoned about from this
artifact.

### 4.10 Causal corroboration against recorded checkpoints

This is **not** a new generation run and **not** a capability measurement. It
tests one falsifiable prediction — *the trained model should emit token 295
first* — against generations already recorded in the Phase 96 arm artifacts.

| Arm | k | `the sun rises` first tokens | Match |
|---|---|---|---|
| A (Phase 90 ckpt) | 0 | `[295, 115, 122, 287, 277, 117]` | yes |
| T (Phase 96 treatment) | 8 | `[295, 115, 122, 287, 277, 117]` | yes |
| B94 (Phase 94 cell B) | 8 | `[295, 115, 122, 287, 277, 117]` | yes |

**3/3 testable pairs match.** Three independently trained checkpoints — one
from Phase 90, one from Phase 96, one from Phase 94, with different
initializations — all emit the document's divergence-point token as their
**first** generated token, and all produce the same duplicated grapheme. The
prediction derived from BPE merge semantics is thus confirmed in real trained
weights.

### 4.11 Decision gate

| Rule | Statement | Observed |
|---|---|---|
| R1 | no positional encoding; padded-window vs bare-prefix logits bit-identical | true |
| R2 | every evaluated context length lies inside training support | true |
| R3 | every supervised training context is a true document prefix | true |
| R4 | short prefixes (≤ 5 tokens) have non-zero training support | true |
| R5 | ≥ 1 evaluation prompt is not an exact token prefix of any document | true |
| R6 | ≥ 1 prompt is a character prefix but not a token prefix | true |
| R7 | recorded trained arms emit the divergence-point token first | true |

## 5. Hypothesis classification

### **B — Partially supported.**

R1–R4 refute the hypothesis *in the form it was posed*: there is no positional,
context-length, task-shape or short-prefix-support mismatch to repair. The
training construction already asks the short-prefix continuation question, at
every prefix length the evaluator uses.

R5–R7 nonetheless demonstrate a real mismatch — but a **content** one, at the
token-boundary level, and they corroborate it causally in trained weights. So
the hypothesis is neither cleanly supported (A) nor refuted (C).

**Primacy is not established**, and the audit found the reason. The mismatch's
clearest demonstrated effect is on `en`, which is the class that is already
largely valid (arm B94: `validUtf8TolerantRatio.en = 1`; arm A: `charIntegrityRate.en = 0.94`)
and is **not** what holds Level 4 down. The Level-4 failure is interior byte
corruption in `zh` and `mixed` — and the failing prompts there include ones
with **exact token-prefix support**. A mismatch whose sharpest demonstrated
effect lands on the non-blocking language class cannot be called the primary
bottleneck on this evidence.

Recorded gate inputs: R1=true, R2=true, R3=true, R4=true, R5=true, R6=true,
R7=true.

## 6. Causal interpretation limits

What the audit **does** establish:

- The token-boundary divergence is real, mechanically explained, and observed
  in three independently trained checkpoints.
- The four structural axes are aligned; the hypothesis as posed is not
  supported.
- A content-level support gap exists (3/5 prompts unsupported as token
  prefixes; 2/5 absent from the corpus entirely).

What it does **not** establish:

- **That the mismatch is the primary cause of the Level-4 failure.** The
  evidence points the other way (§5).
- **That repairing it would move the capability level.** No intervention was
  run.
- **That the corroboration is independent of training.** All three arms share
  the same corpus and tokenizer; they are independent *initializations*, not
  independent *data*. Token 295 being emitted first is consistent with the
  prediction, and is also consistent with strong memorization of document 0 —
  which the model demonstrably has.
- **Anything about causality from the Phase 96 A-vs-T pair.** That comparison
  remains init-confounded (6.0273 vs 5.9772) and is not used as a baseline here.

## 7. Experiment design — not justified

The brief authorised a single minimal intervention **only if** the audit
supported the hypothesis (A or B) *and* only after determining from the audit
whether short-prefix continuation alignment is genuinely the justified
intervention. On this evidence it is not, for three reasons:

1. **The literal intervention is test-set exposure.** Presenting the five
   evaluation prompts to the model during training, with their standalone
   tokenization, converts the evaluator's prompts into training data. Any
   resulting Level-4 movement would be uninterpretable — it could not be
   distinguished from ordinary memorization of the test set. Phase 97's brief
   forbids the practices that would make such a result legible, and correctly
   so.

2. **The intervention cannot reach the failing class.** 2/5 prompts
   (`machine learning is`, `机器学习是`) have **zero** textual presence in the
   corpus. No prefix re-presentation can create support that does not exist.
   And the Level-4 failure sits in `zh`/`mixed` interior byte corruption, where
   failing prompts include ones already supported as exact token prefixes.

3. **The one axis it could target was already tested.** The only content-neutral
   form of "short-prefix continuation alignment" available is exposure-bias
   correction — training on the model's own generated contexts. **Phase 94
   intervened on exactly that axis and returned Outcome D (augmentation hurt,
   dose-dependent).** Phase 96 then tested it for transfer and returned
   Outcome D again. Re-running a third variant of a twice-refuted intervention
   is parameter searching, which the brief explicitly rules out.

No A/B arm pair was constructed, no init-matched baseline was needed, and no
training job was launched. Phase 97 remains a mechanism-identification phase.

## 8. Training results

**NOT RUN.** No optimizer step was executed in Phase 97. The audit artifact
records `trainingPerformed: false` and `readOnly: true`. The only durations in
this report are the Phase 96 figures quoted in §2/§10 for comparison, taken
from the Phase 96 artifacts.

## 9. Generation results

**NOT RUN.** No generation was produced by Phase 97. §4.10 reads generations
that Phase 96 had already recorded. The unchanged Phase 95 evaluator was not
invoked, and no capability level was (re-)derived by this phase.

## 10. Baseline / treatment comparison

Not applicable — no arms were constructed. For context only, the Phase 96
recorded arms (all **Level 3**, unchanged Phase 95 evaluator):

| Arm | k | init loss | final loss | best loss | steps | duration |
|---|---|---|---|---|---|---|
| A (Phase 90 ckpt) | 0 | 6.0273 | 0.1226 | 0.1222 | 3000 | 6816 s |
| T (Phase 96 treat.) | 8 | 5.9772 | 0.9066 | 0.0799 | 3000 | 5143 s |

Secondary diagnostics (Phase 95, unchanged, **not** gates):

| Arm | tolerant zh/en/mixed | charIntegrity zh/en/mixed | tokensToFirstInvalid mean zh/en/mixed | invalid samples |
|---|---|---|---|---|
| A | 0.5 / 0.5 / 0 | 0.75 / 0.94 / 0.93 | 11 / 6 / 4 | 1 / 1 / 1 |
| T | 0 / 0.5 / 0 | 0.74 / 0.96 / 0.88 | 10 / 7 / 12 | 2 / 1 / 1 |
| B94 | 0.5 / 1 / 0 | 0.68 / 1 / 0.72 | 2 / −1 / 3 | 1 / 0 / 1 |

The relevant contrast for §5: `en` is the class with the highest character
integrity in every arm, while `zh` and `mixed` carry the corruption that keeps
the Level-4 gate shut.

## 11. Reproducibility

- Everything is seeded: `Random.setSeed(42)` before tokenizer training; the
  corpus, tokenizer and dataset rebuild deterministically.
- `experiments/phase97/position-alignment-audit.ts` is standalone —
  run `npx tsx experiments/phase97/position-alignment-audit.ts` to regenerate
  `position-alignment-audit.json` byte-for-byte.
- The artifact records its own provenance (`generator.path`,
  `deterministic: true`, `usesMathRandom: false`, `usesSetTimeout: false`,
  `trainingPerformed: false`).
- All windows are recoverable from their own content: every one of the 600
  built windows was re-matched to its exact `(docIndex, start)` origin.
- The augmentation geometry was cross-checked against the recorded Phase 96
  preflight and agrees exactly.
- The suite `runPhase97Tests()` re-derives the geometry live and asserts the
  gate; it passes **58 / 0 / 0** (`npx tsx -e` on the test module; also
  registered in `research/__tests__/run.ts`).
- Verification is split deliberately: the geometry checks re-derive from the
  corpus, while the artifact checks read the JSON. Where an artifact is absent
  the suite **skips with a reason** rather than fabricating a pass.

## 12. Limitations

1. **No intervention was run**, so no causal claim about the Level-4 blocker is
   made. Classification B is a statement about the *hypothesis*, not about
   what would fix the model.
2. **Corroboration is not independence.** The three arms differ in
   initialization, not in corpus or tokenizer.
3. **The architecture probe tests logits, not internals.** It is combined with
   a source reading (§3) rather than standing alone.
4. **The evaluation prompt set is only 5 prompts**, so prompt-level support
   statistics are coarse — 3/5 and 2/5 are small numbers, and "0 docs" for two
   prompts is a property of this corpus, not of BPE in general.
5. **The Level-4 gate's stated intent and enforced condition differ** (the
   "CJK present for zh" clause is documented in `levels.ts` but not enforced).
   This was recorded by Phase 95 and is *not* fixed here.
6. **One single-window regime.** Because no document exceeds 64 tokens, the
   audit says nothing about multi-window documents or cross-window context.

## 13. Conclusion

The hypothesis, as posed, is **not supported**: the four structural axes are
aligned. The training construction already asks the short-prefix continuation
question at every prefix length the evaluator uses, the model has no positional
encoding to disagree about, and short prefixes are densely supervised. A padded
training window and the corresponding bare prefix produce **bit-identical**
logits in 16/16 cases.

A **different** mismatch is real, mechanistically explained, and confirmed in
trained weights: byte-level BPE's greedy merge means a prompt can be a verbatim
character prefix of a training document yet tokenize to a different boundary,
so the continuation the model memorized is *correct in document coordinates*
and *wrong in prompt coordinates*. Three independently trained checkpoints emit
the document's divergence-point token first and all produce
`"the sun riseses over the quiet valley each morning"`.

But this mismatch **does not explain the Level-4 failure**. Its sharpest
demonstrated effect is on `en`, the class that is already valid; the blocking
corruption is interior bytes in `zh` and `mixed`, whose failing prompts include
ones with exact token-prefix support. The gate therefore returns **B —
partially supported**: the mechanism is real, and it is not the primary
bottleneck.

Accordingly, per the brief's resource discipline, **no training was run**. The
one available content-neutral intervention on this axis — own-context /
exposure-bias training — was already tested by Phase 94 (Outcome D) and
re-tested for transfer by Phase 96 (Outcome D). A third variant would be
parameter searching, and the literal prompt-re-presentation form would be
test-set exposure. The audit is the deliverable.

**Decision: `PASS — mechanism refuted; no training justified`** in the sense
that the *positional/context-alignment* framing of the hypothesis is refuted
and no training on that axis is justified. The content-level finding is
recorded as a live lead for Phase 98, not as a validated bottleneck.

## 14. Recommendation for Phase 98

The audit redirects the search away from geometry and toward **content
coverage and tokenizer-boundary semantics**, and specifically toward the
`zh`/`mixed` interior-byte corruption that actually holds the gate shut.

Ordered by evidence strength:

1. **Diagnose the interior corruption directly, before any further training.**
   The blocking failures are malformed bytes *inside* `zh`/`mixed` generations
   (`charIntegrityRate` 0.68–0.75, `tokensToFirstInvalid` 2–11). Nothing in
   Phases 89–97 has characterised *which* byte sequences fail or *which* token
   transitions produce them. A read-only audit of the recorded arm samples —
   in the same style as this phase — is the cheapest next step and requires no
   training.

2. **Separate "no support" from "wrong boundary".** Two prompts have no corpus
   presence at all; that is a *corpus* problem, fixable only by data. One
   prompt has a boundary problem; that is a *tokenizer* problem. Combining them
   into one "alignment" intervention would confound two different causes.

3. **If a training intervention is eventually justified, it must be
   corpus-level, not prompt-level.** Extending the corpus so the evaluator's
   prompt *vocabulary* (not its literal prompt strings) is represented during
   training preserves interpretability in a way test-set exposure does not.

4. **Do not re-run the augmentation/rollout axis.** Phase 94 and Phase 96 both
   returned Outcome D on it. A third attempt needs a mechanism-level reason
   that neither phase found.

5. **Consider, as a separate and explicitly-scoped question, whether the
   Level-4 gate's stated intent and its enforced condition should be
   reconciled** (the documented-but-unenforced CJK clause). This is a gate
   question, not a capability question, and must not be bundled into an
   experiment arm.
