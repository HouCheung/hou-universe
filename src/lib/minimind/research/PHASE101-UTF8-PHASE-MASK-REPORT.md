# Phase 101 — UTF-8 Phase-Constrained Decode Audit

**Outcome: B — partially supported.**

**Training: NOT RUN.** Nothing was trained, retrained, fine-tuned, or written
back. No embedding, LM head, tokenizer, vocabulary, merge table, architecture,
checkpoint, prompt, dataset, evaluator, threshold or production generation
module was modified. This is a read-only, zero-training audit.

**Artifacts**

| Artifact | Path |
| --- | --- |
| Instrument | `experiments/phase101/utf8-phase-mask-audit.ts` |
| Probe / runner | `experiments/phase101/probe.ts` |
| Launcher | `experiments/phase101/run-probe.cmd` |
| Focused suite launcher | `experiments/phase101/run-phase101-suite.ts` |
| Static audit output | `experiments/phase101/static-failure-state.json` |
| Full experiment output | `experiments/phase101/probe-results.json` |
| Manifest | `experiments/phase101/manifest.json` |
| Tests | `src/lib/minimind/research/tests/phase101-utf8-phase-mask.test.ts` |
| This report | `src/lib/minimind/research/PHASE101-UTF8-PHASE-MASK-REPORT.md` |

---

## 1. Research question

> At P1/P2 UTF-8 continuation states, is a significant portion of the observed
> CJK corruption *directly caused* by the model selecting a token that is
> illegal for the current UTF-8 byte phase even though legal continuation
> tokens are available?

Two paired conditions over the same frozen 20 trajectories:

- **BASE** — the existing generation path, unchanged.
- **MASKED** — identical, except that candidates whose bytes are illegal at the
  current byte phase are excluded, **at P1/P2 only**.

This is a mechanism test. It is explicitly **not** a production fix, and
nothing from it is wired into default inference, `GenerationEvaluator`, the
Level-4 definition, or any threshold.

---

## 2. Phase-99 evidence carried into this phase

Phase 99 reconstructed all 12 recorded interior corruption states with
bit-identical logits and measured each state's next-token distribution against
the byte phase of the actual byte stream. Its recorded findings:

| Finding | Value |
| --- | --- |
| Failure states reconstructed | 12 (P0 = 5, P1 = 2, P2 = 5) |
| Failures whose argmax was illegal for the phase | 7 |
| `fatalTokenLegalFromBoundary` at mid-sequence failures | true at 7/7 |
| `fatalTokenLegalFromBoundary` at P0 failures | false at 5/5 |
| P2 legal mass, intact states | 0.9674 |
| P2 legal mass, failure states | 0.3218 |
| P0 legal mass, intact states | 0.9849 |
| P0 legal mass, failure states | 0.5296 |
| Verdict | E — mixed mechanism |

Phase-99 §15 named exactly the follow-up this phase performs: restrict the
sampling candidate set to byte-phase-legal tokens at P1/P2 and measure the
override rate.

**One count in this phase's brief disagrees with the artifact, and the
discrepancy was recorded before any measurement was taken.** The brief says
*there are 5 Phase-99 mid-sequence illegal-argmax failure states*. The artifact
contains **4**. Seven failure states are mid-sequence (P1/P2); four of those
have an illegal argmax:

```
A/machine learning is#6          P2
A/什么是 machine learning#4      P1
C94/太阳#10                      P2
T/机器学习是#12                  P2
```

The brief's `5` matches the artifact's `aggregate.argmaxCompatibleCount`, which
counts states whose argmax was **legal**. Phase 101 audits all 7 mid-sequence
states and pre-registers its gate on the measured 4. Inventing a fifth state to
match the brief would have been fabrication. This is recorded verbatim in
`preRegistered.briefCountDiscrepancy` and in the static artifact's
`gate.countDiscrepancyNote`.

---

## 3. Exact intervention hypothesis

**Nothing about the weights changes.** The intervention is a single change to
the *candidate set* handed to the sampler, and it applies only when the
generation stream is mid-character:

- at a character boundary (`need === 0`, phase P0) — **no mask**;
- one or two bytes into a multi-byte character (`need > 0`, phase P1/P2) —
  exclude every vocabulary token whose bytes are not a legal continuation;
- on an unrecoverable stream (phase PX) — **no mask**, since no byte phase is
  defined there.

If illegal-at-P1/P2 selection is the cause of the recorded corruption, then
removing exactly those candidates should remove exactly those corruptions, and
the paired comparison should show the corruption disappearing rather than
moving.

---

## 4. Mask semantics

The legality predicate is **the repository's own compatibility test**, not a
Phase-101 definition:

```ts
isTokenLegalForUtf8Phase(bytes, state) =
  !state.recoverable ? true : appendBytes(state, bytes, 0).invalidAt === -1
```

`appendBytes` is the byte-state machine Phase 98 built to mirror production
`scanUtf8`; Phase 99's `compatibleMass` was computed with the identical
predicate. Legality is therefore derived from **actual UTF-8 byte rules applied
to the repository's actual token byte representations**, and never from token
id ranges, decoded Unicode strings, replacement characters, token names or
token text.

**How every required case is handled**

| Case | Behaviour |
| --- | --- |
| 1-byte tokens | Walked as a single byte. `0x80–0xBF` is legal only when `need > 0`; `0xC0`/`0xC1` and `0xF5–0xFF` are never legal leads. |
| Multi-byte tokens | Every byte is walked. A token may supply several continuation bytes, complete a character, open the next one, or span a character boundary. |
| Complete-character tokens | A 3-byte CJK merge is legal from a boundary (it opens *and* closes a character) and illegal at P1 — the walk inspects the token's **first byte**, not whether it "contains" continuation bytes. |
| Boundary-spanning tokens | Legal whenever the concatenated walk never leaves the legal grammar, and the resulting state is recorded. |
| "One token = one byte" | **Never assumed.** Verified in the suite: a 2-byte CJK prefix token is legal at P0 and illegal at P2 of its own character, so no verdict can be a per-token constant. |

**Special tokens (ids 0–3: `<pad>`, `<unk>`, `<bos>`, `<eos>`)** are decided by
the *same* byte rule applied to their own `tokenBytesOf` representation — the
Latin-1 bytes of their literal names, e.g. `<eos>` is `3c 65 6f 73 3e`. Those
bytes begin with `0x3C`, which is not a continuation byte, so at P1/P2 every
special token is excluded by the same rule as any other token. They are
**removed, never reinterpreted as continuation bytes**. This is exactly what
Phase 99 already did when it computed `compatibleMass`, so no special-token
policy is invented here. At P0 the mask is inactive and special tokens are
untouched (asserted in the suite).

*Consequence:* a masked trajectory can no longer terminate mid-character.
Measured impact is nil — `<eos>` was never emitted in any of the 20 frozen BASE
trajectories (all 480 steps ran to the horizon), and no condition ended early.

**Empty candidate set (§7).** Recorded, never silently replaced: no fallback to
the full vocabulary and no invented token. The trajectory terminates at that
step and the event is counted. A deterministic census over every reachable open
state (`probeMaskNonEmptiness`) measures **0 empty states out of 14 probed**,
and the full experiment measures **0 empty-mask events**. The explanation is
structural: whenever `need > 0` the 64 bare continuation-byte tokens are legal,
so the active candidate set is never empty on this vocabulary. The path is
implemented and reported rather than assumed away.

**Excluded logits** receive exactly `-Infinity`; every permitted logit is the
model's own raw value, verbatim. Nothing is rescaled or re-scored, so the
model's original ordering survives and §13's two probabilities never conflate.
`-Infinity` is never serialized.

---

## 5. Frozen surface and zero-training guarantee

Every prohibition was honoured. The instrument contains no `.backward()`,
no optimizer step, no `Trainer`, no `Math.random()`, no `setTimeout()`, and no
checkpoint write — each checked mechanically by the suite against a
comment-stripped copy of the source.

The `PhaseMaskedModel` view does not carry weights of its own. It wraps the
checkpoint-loaded model and rewrites only the final position's logit row:

```
frozen model forward  ->  mask row at the last position  ->  sample
```

With `enabled: false` the view is measured **bit-transparent** — the suite and
the probe both compare every logit of the disabled view against the frozen
model's, and the full experiment asserts zero mismatches in all four arms.
A view that is supposed to be inert is measured inert, not assumed inert.

The Level-3 memorization term is fed by the **frozen model in both conditions**:
the phase mask is a decoding constraint, not a weight property, so letting it
reach `measureMemorization` would corrupt a gate term nothing here may change.

---

## 6. Static failure-state audit and the pre-registered gate

Per §8, the audit was **mandatory and had to pass before the paired experiment
ran**. For each of the 12 recorded states, one forward pass over the exact
recorded prefix, run twice, then every quantity re-derived.

| State | Phase | Legal ids | Raw argmax | Legal? | Recovered legal mass | Phase-99 mass | Δ | Masked argmax | Override |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A/machine learning is#6 | P2 | 64 | 234 (`e6`) | no | 0.026866 | 0.026866 | 0 | 145 (`8d`) | yes |
| A/机器学习是#11 | P0 | 223 | 169 (`a5`) | **no** | 0.002461 | 0.002461 | 0 | 169 (inactive) | no |
| A/什么是 machine learning#4 | P1 | 64 | 291 (`61 6c`) | no | 0.642991 | 0.642991 | 0 | 148 (`90`) | yes |
| B94/机器学习是#2 | P0 | 223 | 161 (`9d`) | **no** | 0.472763 | 0.472763 | 0 | 161 (inactive) | no |
| B94/什么是 machine learning#3 | P0 | 223 | 104 (`64`) | yes | 0.952794 | 0.952794 | 0 | — | no |
| C94/太阳#10 | P2 | 64 | 235 (`e7`) | no | 0.002268 | 0.002268 | 0 | 171 (`a7`) | yes |
| C94/机器学习是#3 | P1 | 64 | 161 (`9d`) | yes | 0.882632 | 0.882632 | 0 | — | no |
| C94/什么是 machine learning#3 | P0 | 223 | 169 (`a5`) | **no** | 0.282172 | 0.282172 | 0 | 169 (inactive) | no |
| T/machine learning is#7 | P2 | 64 | 139 (`87`) | yes | 0.798944 | 0.798944 | 0 | — | no |
| T/太阳#8 | P2 | 64 | 138 (`86`) | yes | 0.759602 | 0.759602 | 0 | — | no |
| T/机器学习是#12 | P2 | 64 | 234 (`e6`) | no | 0.021443 | 0.021443 | 0 | 186 (`b6`) | yes |
| T/什么是 machine learning#12 | P0 | 223 | 276 (`61 72`) | yes | 0.937768 | 0.937768 | 0 | — | no |

**Gate result**

```
auditedStateCount                  12
midSequenceStateCount               7
illegalArgmaxMidSequenceCount       4   (brief said 5 — see §2)
overrideCount                       4
legalMassAllWithinTolerance      true   (max |Δ| = 0)
logitsAllIdenticalToPhase99      true   (max |Δ| = 0)
emptyMaskEvents                     0
falsifierFired                  false
passed                           true
```

**The pre-registered falsifier, evaluated exactly as written** — *"override at
≤1 state, OR recovered legal mass disagrees with Phase-99 measurement"*:

- overrideCount = 4 > 1 → the first clause does **not** fire.
- max legal-mass deviation = 0, tolerance `1e-9` fixed before any measurement
  → the second clause does **not** fire.

So the falsifier did not fire and the experiment proceeded. §21's stop
condition — *"STOP if the states do not reproduce Phase-99's legal mass"* — was
also checked: **all 12 states reproduce Phase-99's legal mass exactly and its
legal candidate count exactly** (223 ids at P0, 64 at P1/P2), with bit-identical
logits.

Two distinctions the audit makes explicit, because conflating them would have
produced a false result:

- **The mask's candidate set is not the same object as the phase-legal set.**
  The mask is P1/P2-only by specification; at P0 it is inactive and its
  candidate set is the whole vocabulary. "Legal mass" is therefore measured on
  the **full byte rule at every phase**, which at P0 is 223 ids — exactly the
  `compatibleIdCount` Phase 99 recorded at all five P0 states. Measuring the
  inactive mask instead would have reported 1.0 at P0 and compared it against
  the wrong baseline.
- **§9's `overrideCount` is structurally tautological as evidence.** An
  intervention confined to P1/P2 makes illegal selection *impossible* there, so
  the count measures whether the mask does what it says, not whether it helps.
  It is reported as a consistency check. The evidence for the hypothesis is the
  paired generation outcome in §8–§14.

The four raw argmaxes the mask removes, with their original probabilities:

| State | Raw argmax | P(original) | Best legal | P(original) | Rank of best legal |
| --- | --- | --- | --- | --- | --- |
| A/machine learning is#6 | 234 `e6` | 0.6461 | 145 `8d` | 0.0235 | 3 |
| A/什么是 machine learning#4 | 291 `61 6c` | 0.2623 | 148 `90` | 0.1915 | 2 |
| C94/太阳#10 | 235 `e7` | 0.9820 | 171 `a7` | 0.0004 | 10 |
| T/机器学习是#12 | 234 `e6` | 0.5234 | 186 `b6` | 0.0050 | 10 |

Three of the four raw argmaxes are **multi-byte lead bytes or ASCII** (`e6`,
`e7` — 3-byte leads; `61 6c` = "al") being emitted while a character is still
open. Two of them carry the **majority of the distribution**. At
`C94/太阳#10` the model is 0.982 certain of a token that cannot be emitted, and
the best legal alternative sits at rank 10 with probability 0.0004.

---

## 7. Experimental setup

| Item | Value |
| --- | --- |
| Checkpoints (all four, frozen, read-only) | `phase90-aligned.ckpt.json` `dff07a83…`, `phase94-b.ckpt.json` `c9f9d52d…`, `phase94-c.ckpt.json` `62557157…`, `phase96-treatment.ckpt.json` `5ebe2ab3…` |
| Prompts | `GEN_EVAL_PROMPTS`, unchanged since Phase 91 — 2 en, 2 zh, 1 mixed |
| Trajectories | 4 arms × 5 prompts = 20 per condition, 40 total |
| Seed / temperature | 42 / 0.8 |
| Sampling | temperature-scaled multinomial, full vocabulary (BASE) or phase-legal set (MASKED) |
| Top-k / top-p / repetition penalty | none / none / none |
| Horizon / context | `MAX_TOKENS` 24 / `MAX_CTX` 128 |
| `vocabSize` / merges | 300 (4 special + 256 raw bytes + 40 learned merges) |
| RNG convention | one `createSeededRNG(SEED)` stream per arm **per condition**, consumed across the five prompts in order — inherited unchanged from the production evaluator |
| Evaluator | `evaluateGeneration`, `buildEvidence`, `deriveCapabilityLevel` — **unchanged**, `utf8Gate: "tolerant"` |

**Paired-replay integrity.** BASE reproduced the ids recorded by Phases 95/96
**in all four arms** (the run raises and stops otherwise), and **both**
conditions' samples were compared field-by-field against the unchanged
evaluator's own output for the same model — `continuation`, `generatedIds`,
`validUtf8`, `validUtf8Tolerant`, `tokensToFirstInvalid`, `charIntegrityRate`,
`replacementCharCount`, `trailingIncomplete`, `repeatedCollapse` — with zero
differences in all four arms.

---

## 8. Paired trajectory results

| Arm | Prompt | Lang | BASE | MASKED | Transition |
| --- | --- | --- | --- | --- | --- |
| A | the sun rises | en | clean | clean | clean→clean |
| A | machine learning is | en | corrupted @P2#6 | corrupted @P0#15 | corrupted→corrupted later |
| A | 太阳 | zh | clean | clean | clean→clean |
| A | 机器学习是 | zh | corrupted @P0#11 | corrupted @P0#11 | corrupted→corrupted same phase |
| A | 什么是 machine learning | mixed | corrupted @P1#4 | **clean** | corrupted→clean |
| B94 | the sun rises | en | clean | clean | clean→clean |
| B94 | machine learning is | en | clean | clean | clean→clean |
| B94 | 太阳 | zh | clean | **corrupted @P0#15** | clean→corrupted |
| B94 | 机器学习是 | zh | corrupted @P0#2 | corrupted @P0#2 | corrupted→corrupted same phase |
| B94 | 什么是 machine learning | mixed | corrupted @P0#3 | corrupted @P0#3 | corrupted→corrupted same phase |
| C94 | the sun rises | en | clean | clean | clean→clean |
| C94 | machine learning is | en | clean | clean | clean→clean |
| C94 | 太阳 | zh | corrupted @P2#10 | corrupted @P0#11 | corrupted→corrupted later |
| C94 | 机器学习是 | zh | corrupted @P1#3 | corrupted @P0#8 | corrupted→corrupted later |
| C94 | 什么是 machine learning | mixed | corrupted @P0#3 | corrupted @P0#3 | corrupted→corrupted same phase |
| T | the sun rises | en | clean | clean | clean→clean |
| T | machine learning is | en | corrupted @P2#7 | corrupted @P0#11 | corrupted→corrupted later |
| T | 太阳 | zh | corrupted @P2#8 | corrupted @P0#15 | corrupted→corrupted later |
| T | 机器学习是 | zh | corrupted @P2#12 | **clean** | corrupted→clean |
| T | 什么是 machine learning | mixed | corrupted @P0#12 | corrupted @P0#12 | corrupted→corrupted same phase |

**BASE's 12 failures are the same 12 Phase 99 recorded, in the same phases**
(P0 = 5, P1 = 2, P2 = 5) — re-derived from the Phase-99 artifact by the suite,
not restated.

The seven BASE mid-sequence failures resolve as follows:

- **2 become fully clean** — `A/什么是 machine learning#4` (P1) and
  `T/机器学习是#12` (P2).
- **5 are displaced to the next character boundary** — every one of them
  reappears later as a **P0** corruption, at token index 8–15 rather than 4–12.
  `A/machine learning is` is the clearest case: BASE's fatal token at index 6
  was `233` at P2; MASKED's forced legal continuation completed that character,
  and the corruption reappeared at index 15 as token **145** (`8d`) — a bare
  continuation byte emitted at a **character boundary**, which the P1/P2 mask
  cannot touch.

**P1/P2 corruption is 7 → 0 in a single pass, across all four arms.** This is
partly by construction (see §6) and is reported as such.

---

## 9. Transition matrix

| Transition | Count |
| --- | --- |
| corrupted→clean | **2** |
| corrupted→corrupted later | **5** |
| corrupted→corrupted same phase | **5** |
| corrupted→corrupted other | 0 |
| clean→clean | **7** |
| clean→corrupted | **1** |
| **Total** | **20** |

No category was invented: the six keys above are exactly the ones the data
required, and the matrix is a partition of all 20 paired trajectories (asserted
in the suite).

The 5 `same phase` cases are all P0→P0 and are structurally expected: the mask
does not act at P0, so where a trajectory's first illegal token is at a
boundary and no earlier masked decision changed the context, MASKED emits the
identical token at the identical index. The suite checks that every
`corrupted→corrupted same phase` pair has identical indices.

The single `clean→corrupted` case is `B94/太阳`: a masked decision earlier in
the sequence changed the context enough that a trajectory which had been clean
under BASE now commits a P0 error at index 15. This is a genuine cost of the
intervention, not a measurement artifact — the mask perturbs the draw→token
mapping at **every** `need > 0` step, not only at the losing ones.

---

## 10. Corruption counts by phase

| | BASE | MASKED | Δ |
| --- | --- | --- | --- |
| Total corrupting trajectories | **12** | **11** | −1 |
| P0 | 5 | **11** | +6 |
| P1 | 2 | **0** | −2 |
| P2 | 5 | **0** | −5 |

Per arm:

| Arm | BASE (P0/P1/P2) | MASKED (P0/P1/P2) |
| --- | --- | --- |
| A | 3 (1/1/1) | 2 (2/0/0) |
| B94 | 2 (2/0/0) | 3 (3/0/0) |
| C94 | 3 (1/1/1) | 3 (3/0/0) |
| T | 4 (1/0/3) | 3 (3/0/0) |

The intervention does exactly what it was built to do — and the corruption
budget moves to the phase it is forbidden to touch. Nine of the eleven MASKED
corruptions (5 original P0 + 5 displaced) are pre-existing or displaced P0
failures; the eleventh is newly created.

---

## 11. Legal-mass comparison

Mass on the **full byte-legal candidate set** (Phase-99's predicate), by phase
of the decision. At P1/P2 this coincides with the mask's candidate set; at P0
it is the 223-id set.

| | BASE | MASKED |
| --- | --- | --- |
| Mean legal mass at P0 | 0.9717 – 0.9820 (per arm) | 0.9540 – 0.9716 |
| Mean legal mass at P1 | 0.9607 – 0.9985 | 0.9523 – 0.9982 |
| Mean legal mass at P2 | 0.9070 – 0.9456 | 0.8802 – 0.9333 |
| Mean legal mass at the P1 failure step | 0.642991, 0.882632 | — (no P1 failures) |
| Mean legal mass at the P2 failure step | 0.002268 – 0.798944 | — (no P2 failures) |

Two readings matter.

First, the *aggregate* legal mass is high in both conditions and barely moves.
The mask does not raise the model's legal mass; it forces the choice where the
mass was already concentrated on legal tokens.

Second, the failure steps are extreme outliers on an otherwise well-behaved
distribution: mean legal mass at P2 failure steps ranges down to **0.0023**,
against an arm mean of 0.907. So the P2 mechanism is a *local collapse of legal
mass*, and the mask substitutes the best of a nearly-zero-mass remainder —
`C94/太阳#10` selects a token at rank 10.

**§13 — the two probabilities, never conflated.** For every step both are
recorded and separately labelled: `selectedPOriginal` (the token's probability
under the model's **raw** distribution) and `selectedPNormalized` (its
probability after the mask renormalizes the legal set). At the four overridden
states:

| State | Selected | P(original) | P(normalized) |
| --- | --- | --- | --- |
| A/machine learning is#6 | 145 `8d` | 0.023517 | 0.875363 |
| A/什么是 machine learning#4 | 148 `90` | 0.191533 | 0.297879 |
| C94/太阳#10 | 171 `a7` | 0.000411 | 0.181252 |
| T/机器学习是#12 | 186 `b6` | 0.004984 | 0.232439 |

For the P0 states, `selectedPNormalized` equals `selectedPOriginal` because the
mask is inactive — recorded as such, not silently.

---

## 12. Character-integrity and UTF-8 comparison

| Metric | BASE | MASKED |
| --- | --- | --- |
| Strictly valid UTF-8 samples | **8 / 20** | **9 / 20** |
| Tolerantly valid UTF-8 samples | 8 / 20 | 9 / 20 |
| Mean `charIntegrityRate` | 0.837306 | 0.838928 |
| Mean tokens-to-first-invalid (clean counted as 0) | 4.050 | **5.300** |
| Mean continuation length (tokens) | 24.0 | 24.0 |
| Trajectories that ran to the horizon | 20 / 20 | 20 / 20 |

Strict and tolerant counts coincide, so no corruption is a mere
trailing-incomplete-character artifact at the horizon; every surviving failure
is a genuine interior byte violation, as in Phase 98/99.

Per-arm `charIntegrityRate`: A 0.8600 → 0.8859, B94 0.8354 → 0.7909,
C94 0.8283 → 0.8189, T 0.8255 → 0.8600.

The direction is mixed at the arm level: two arms improve, two degrade. The
aggregate improvement is **+0.16 percentage points** — an order of magnitude
below the effect size a "significant portion of the corruption is caused by
this" claim would require.

`tokensToFirstInvalid` rises from 4.05 to 5.30 — consistent with the transition
matrix: where corruption is not prevented it is pushed later.

---

## 13. Rollout

`rollout` is the own-context **greedy** next-token accuracy against the
original document (60 corpus samples, temperature 0). It is a property of the
**weights**, not of a decoding condition, so it is read from the artifacts
Phases 95/96 recorded and is **identical for BASE and MASKED by construction**:

| Arm | Source | Mean accuracy | Accuracy at step 24 |
| --- | --- | --- | --- |
| A | `phase95/probe-results.json` | 0.118809 | 0.084746 |
| B94 | `phase95/probe-results.json` | 0.106297 | 0.067797 |
| C94 | `phase95/probe-results.json` | 0.144503 | 0.084746 |
| T | `phase96/probe-results.json` | 0.128531 | 0.084746 |

Reporting two different numbers here would have been a fabrication. The mask is
a decode-time constraint; it cannot move a greedy weight property. The
invariance is stated rather than exploited.

---

## 14. Capability

Measured by the **unchanged** Phase-95 evaluator — `evaluateGeneration` →
`buildEvidence` → `deriveCapabilityLevel`, `utf8Gate: "tolerant"`. No
Phase-101-specific Level-4 threshold exists or was introduced, and the Level-3
memorization term was fed by the frozen model in both conditions.

| Arm | BASE | MASKED |
| --- | --- | --- |
| A | Level 3 | Level 3 |
| B94 | Level 3 | Level 3 |
| C94 | Level 3 | Level 3 |
| T | Level 3 | Level 3 |

Levels 0–3 achieved, **Level 4 not achieved in any of the eight
arm × condition cells**, with the identical reason string in every cell:
`generation is valid UTF-8`, `generation is non-empty`, `generation is not
repetition-collapsed`, `generation uses learned (merged) subword tokens`,
`lower gate not met`.

**The mask does not move the capability verdict at all** — not up, not down, in
any arm. This is the correct comparison: Phase 101 was not permitted to change
the Level-4 definition, and did not.

---

## 15. Mechanistic interpretation

The causal hypothesis is **partially supported**, and the part that fails is
informative.

**What is supported.** At P1/P2 the model's argmax is frequently a token whose
bytes are illegal for the open sequence — 4 of 7 mid-sequence failure states,
with two of them holding the majority of the distribution (`0.646`, `0.982`).
Those are not ties or noise; they are confident decisions that cannot be
encoded. Removing exactly those candidates removes exactly those failures: P1/P2
corruption goes to zero in one pass, and 2 of the 7 trajectories become fully
valid. The pre-registered override falsifier did not fire.

**What is not supported.** The corruption is not *reduced*, it is *moved*. Five
of the seven mid-sequence failures reappear at the next character boundary as
the mirror-image error, and one new P0 failure is created by an earlier masked
decision. Net: 12 → 11.

The mirror-image structure is the substantive finding:

| Phase | What the model does | Why it is illegal |
| --- | --- | --- |
| P1/P2 | emits a token that starts a new character (`e6`, `e7`, `61 6c`) | a character is still open |
| P0 | emits a token that continues a character (`8d`, `9d`, `a5`) | no character is open |

Both are the same error seen from two sides: **the model's notion of byte phase
is one stage off.** At P1/P2 it behaves as if a character had ended; at a
boundary it behaves as if one were still open. A candidate-set restriction
applied on one side removes that side's failures and hands the residue to the
other side wherever the model was going to be wrong anyway.

That reading is consistent with Phase 99's own verdict of *mixed mechanism*: it
found `fatalTokenLegalFromBoundary` **true at 7/7** mid-sequence failures and
**false at 5/5** P0 failures — i.e. the mid-sequence failures are boundary-type
decisions taken at the wrong phase, and the P0 failures are the converse.

**A second, less comfortable finding.** Even when the mask succeeds it usually
does not select the *correct* continuation. Of the four overridden states, the
masked choice is the corpus-supported continuation at only one
(`A/machine learning is#6`). At `C94/太阳#10` it replaces a 0.982-probability
prediction with a rank-10 token at probability 0.0004. The output is then
**legal UTF-8 but wrong text**. The mask converts an encoding failure into a
semantic one; it does not recover the intended character. This is visible in
the arm-level `charIntegrityRate` split (two arms improve, two degrade).

---

## 16. Limitations and what remains unproven

1. **One draw per arm.** Each arm × condition is a single seeded trajectory.
   12 → 11 is one realization, not a distribution; no replicate sampling,
   confidence interval or significance test is possible from these 20 pairs.
   The *mechanistic* conclusion (§15) rests on the deterministic rank structure
   at the audited states, not on the count.
2. **P0 is untested by design.** The brief restricts the intervention to
   P1/P2. Since all surviving MASKED corruption is P0, the phase that now
   carries the whole failure budget is exactly the phase this phase is
   forbidden to touch. The dominant remaining mechanism is therefore *outside*
   the tested intervention.
3. **The mask's success at P1/P2 is partly by construction.** An intervention
   that forbids illegal continuations makes illegal continuations impossible;
   `masked P1/P2 corruption = 0` is a consistency check, not evidence. The
   evidence is the paired outcome and its displacement pattern.
4. **`maskIntervened` uses one counterfactual.** It replays the *same* draw
   value through the raw and masked rows and asks whether the selected token
   changes. That is the right counterfactual for this sampler but not the only
   conceivable one; a different draw would not map one-to-one.
5. **`overrideCount` is tautological as evidence** (see §6) and is reported as
   a contract check.
6. **Small vocabulary, small model, small prompt set.** 300 tokens, 128-dim
   embeddings, 5 prompts. Nothing here establishes how the pattern scales.
7. **The `-Infinity` masked logits are a synthetic value**, documented and
   never serialized, but they are the only value in the pipeline not produced
   by the frozen model.
8. **Not a fix.** Nothing was productionized. The audit says something about
   the mechanism; it makes no claim that this mask — or any mask — should be
   enabled in inference.

**Integrity note carried forward.** The frozen Phase-99 runner
(`experiments/phase99/logit-mechanism-audit.ts`) has no
`require.main === module` guard, so *importing* it executes its `main()` and
rewrites `logit-mechanism-audit.json` with a fresh wall-clock `durationMs`.
Phase 101's instrument imports Phase 99, so this fires. The scientific content
is deterministic, but the file's raw digest is **not** reproducible run to run
— which is why the artifacts record a **scientific digest** (the artifact minus
that one counter, canonicalized) alongside the raw one:

```
raw digest reproducible:        false
scientific digest:              35eb66d11614a490fb87f2245a3c4c117ba77c18a128734c22a93988457fd9c6
sha256ScientificExcluding:      ["durationMs"]
```

Phase 99 itself was **not modified** — Phase 101's boundary is
`experiments/phase101/` — and the whole scientific payload of the artifact was
verified reproducible by the parity gate. This is a pre-existing property of a
frozen runner, surfaced rather than silently patched.

**Phase 101's own artifacts are deterministic, and this was measured rather
than argued.** Because the mask was added to the instrument after the first
artifact set was already written, the whole experiment was re-run end to end
twice and the two artifact sets diffed line by line. The result:

```
$ diff <run 1>/probe-results.json      <run 2>/probe-results.json
63c63
<     "sha256Raw": "89d3b1ff35aefb8a29ca58d7596898d6c2519b5a2f4994cb5d95c54334a9405c",
---
>     "sha256Raw": "305afd23606d3d395dc05af5cc4c82d954cd86a4a3b0fa4405297555cd8e0712",

$ diff <run 1>/static-failure-state.json <run 2>/static-failure-state.json
51c51   (identical single-line change)
```

**Exactly one line changes, in both files**, and it is the raw hash of the
*upstream* Phase-99 artifact — the value the side-effect above invalidates.
Every logit, every token id, every probability, every per-state audit, every
trajectory, every metric, the transition matrix and the classification are
**byte-identical across runs**. The two runs also produced the identical
verdict string (`12 -> 11 corrupting trajectories; 2 cleaned, 5 moved later, 5
still at the same phase, 0 otherwise distinct, 1 newly corrupted`).

So the reproducibility claim is precise: Phase 101's measurement is exactly
reproducible; the hash of its *input* is not, because a frozen upstream runner
rewrites itself on import. The artifacts therefore carry both digests, and the
raw-digest instability is confined to that single recorded field.

---

## 17. Decision classification, final conclusion and Phase-102 recommendation

### Classification

**Outcome B — the hypothesis is partially supported.**

Applying the stated classification criteria to the measured numbers:

| | Result |
| --- | --- |
| Mechanism claim (illegal P1/P2 selection causes these failures) | **Confirmed** — 4/7 mid-sequence states, 2 with majority mass; removing the candidates removes the failures |
| Causal magnitude claim (a significant portion of the corruption is caused by this) | **Not confirmed** — 12 → 11, strict UTF-8 8/20 → 9/20, character integrity +0.16 pp |
| Persistence claim (the failure disappears) | **Refuted** — 5 of 7 are displaced to P0, and 1 new corruption is created |

Outcome A would require the corruption to be gone. Outcome C would require the
mask to change nothing. Neither holds: the mechanism is real, and the
intervention is real, but it moves the failure rather than removing it.

### Final conclusion

At P1/P2 the model confidently emits tokens that cannot legally continue the
open UTF-8 character, and forbidding exactly those tokens removes exactly those
failures. That is a genuine, reproducible causal mechanism, isolated under
frozen checkpoints with no training and no changes to any production surface.

It is not, on this evidence, the cause of most of the corruption. The
corruption budget is byte-phase-symmetric: the model is one phase stage off in
*both* directions, and a one-sided candidate restriction relocates the P1/P2
half of it to the character boundary. Any account of this corruption that
treats it as simply "the sampler picks illegal continuations" is incomplete —
the sampler picks illegal *character-boundary* tokens just as readily, and at
P0 it does so where the legal mass averages 0.95–0.98.

### Phase-102 recommendation — one falsifiable hypothesis

> **At P0 the surviving corruption is caused by the same byte-phase
> misalignment, mirrored: at a character boundary the model assigns its mass to
> tokens beginning with a continuation byte. Restricting the candidate set at
> P0 to tokens that can legally *start* a character will remove the surviving
> P0 failures — and, unlike the P1/P2-only mask, will not displace them,
> because P0 is where displacement was observed to land.**

Falsifier, fixed before the run: **the P0+P1/P2 mask leaves ≥ 1 P0 corruption
in a trajectory that the P1/P2-only mask left corrupted, or the P0 corruption
count does not fall below this phase's measured 11.** Either outcome refutes
the hypothesis.

Predicted trajectory of the number, so the test is sharp: if the mirror
hypothesis is right, P0+P1/P2 masking drives the count from 11 toward the
number of trajectories that are wrong for reasons *other* than byte phase —
which Phase 99's `sampling-draw` label suggests is around 5 (states whose
argmax was already legal and whose failure was purely a draw).

---

*Phase 101 ends here. Phase 102 was not begun.*
