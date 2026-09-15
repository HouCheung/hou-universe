# Phase 95 — Generation Evaluation Instrument Repair

**Status:** design / audit complete. No production code changed. No model trained.
**Date:** 2026-09-15
**Scope:** zero-training evaluation-instrument repair + re-evaluation of existing checkpoints.

---

## 1. Problem statement

The Level-4 capability gate is the project's north-star endpoint. Phases 84–94 all report
"Level 4 FAIL", and Phase 94's verdict (`OUTCOME D`) rests partly on the Level-4 gate not
moving when the training objective was intervened on.

Phase 91 §5.1 recorded, but did not act on, a fact about the evaluator: the Level-4
generation horizon is a fixed 24 tokens (`maxTokens = 24`, `capability-eval/evaluate.ts:238`;
`MAX_TOKENS = 24` at `experiments/phase94/probe.ts:103`), and the tokenizer is
byte-level (`BPETokenizer`, vocab 300). A 24-token slice of Chinese text therefore ends
mid-character a large fraction of the time, and `BPETokenizer.decode` correctly emits
U+FFFD for the truncated tail.

The gate requires `validUtf8Ratio === 1` **for every language class**
(`capability-eval/levels.ts:180-182`, consumed by `buildEvidence`/`coherentGeneration`).
Combined with the horizon, that makes the gate partially a function of *where the
24-token cut lands* rather than of model capability.

Phase 95 asks: **which parts of the current Level-4 evaluator are instrumentation
defects, and which are legitimate capability constraints?** — answered from code and
controlled measurement, not from prior reports.

---

## 2. Audited evidence

### 2.1 Source of truth (read directly, not inferred from reports)

| Fact | Location |
|---|---|
| Level-4 coherence condition | `src/lib/minimind/research/capability-eval/levels.ts:180-182` |
| `everyLanguageCoherent` over zh/en/mixed; `coherentGeneration = everyLanguageCoherent && mergedUsed` | `levels.ts:160-175` |
| Level-4 criterion string, gates 0–5 | `levels.ts:102-129` |
| `validUtf8 = replacementCharCount === 0`; `validUtf8Ratio = mean(validUtf8)` | `evaluate.ts:292`, `evaluate.ts:313` |
| Continuation decoded **in isolation**: `tokenizer.decode(generatedIds)` | `evaluate.ts:261` |
| Byte-level decode + `TextDecoder("utf-8", { fatal: false })` | `tokenizer/BPETokenizer.ts:262-282` |
| Byte-token id mapping (`id = 4 + byteValue`); unknown-id fallback pushes `EF BF BD` | `tokenizer/BPETokenizer.ts:269`; `:271-272` |
| `utf8DegradationCurve` recomputes `decode(generated)` on the growing prefix | `experiments/phase94/probe.ts:884-929` (decode test at `:917`) |
| Prompt set + per-class sample counts (2 zh, 2 en, 1 mixed) | `experiments/phase94/probe.ts:114-120` |
| Gate generation config: `temperature 0.8`, `seed 42`, `maxTokens 24` | `experiments/phase94/probe.ts:765-769` |
| 3 exported capability types | `src/lib/minimind/research/capability-eval/index.ts` |

Audit harness (working tree only, **not committed**, no `src/` import):
`experiments/phase95/audit-instrument-defects.ts`.
Run: `npx --yes tsx experiments/phase95/audit-instrument-defects.ts`.

### 2.2 Corpus / tokenizer under audit

`bilingual 0.3.0`, 600 documents, `vocabSize 300`, `SEED 42`, `MAX_TOKENS 24`.
Tokenizer rebuilt with the production recipe (`Random.setSeed(42)` then `train(corpus, 300)`),
identical to `experiments/phase94/probe.ts:163-168`.

### 2.3 Oracle definition used throughout this document

The oracle is a **model-free perfect generator**: real corpus text, encoded with the
production tokenizer, sliced into exactly `MAX_TOKENS` (24) token windows. A window's
decoded byte stream is byte-for-byte what a perfect model emits for that context, cut at
the evaluator's horizon. Sliding over all windows of all 600 documents yields 7,696
windows; of these **5,457 open on a character boundary** (first byte is not a UTF-8
continuation byte) and are therefore the ones a character-aligned prompt can actually
produce. Only those 5,457 are counted below.

---

## 3. The three claimed defects — verification status

### D1 — strict `validUtf8Ratio === 1` has a low oracle ceiling → **VERIFIED**

**Claimed:** the strict gate is unreachable for a perfect model (reported ≈7.64%).

**Re-derived from code and data (not trusted):** the ceiling is a product of per-class
clean rates and the gate's per-class sample counts (2 zh, 2 en, 1 mixed), because
`everyAggregateCoherent` demands `=== 1` in each class independently.

| class | char-aligned windows | strict clean | tolerant clean |
|---|---|---|---|
| ascii (matches `en`) | 2,562 | 100.00% | 100.00% |
| cjk (matches `zh`) | 1,053 | **37.42%** | **100.00%** |
| mixed | 1,842 | **54.56%** | **100.00%** |

```
P(perfect model passes Level-4) STRICT   = 0.3742^2 * 1.0000^2 * 0.5456 = 7.639%
P(perfect model passes Level-4) TOLERANT = 1.0000^2 * 1.0000^2 * 1.0000 = 100.000%
```

**Mechanism, stated exactly:** for pure-CJK text a 3-byte character is usually 3 byte
tokens, so the 24-token horizon lands off a character boundary in roughly two draws out of
three; the measured 37.42% is consistent with the 1/3 boundary-alignment prior, which is
an independent structural check that the measurement is right. `en` reaches the ceiling
because ASCII characters are single-byte, so no truncation is possible — this exactly
explains why `en` alone reached `validUtf8Ratio = 1.0` in Phase 94 cells B and C while
zh/mixed never reached 1.0 in any phase.

**Faithfulness check:** the audit computes the strict verdict twice — once via
`countReplacement(tokenizer.decode(win)) === 0` (the production semantics) and once via an
independent byte scanner. **Disagreements: 0 / 5,457.**

**Scope of the artifact:** 1,496 of the 5,457 char-aligned perfect windows (27.42%) are
*trailing-incomplete-only* — i.e. valid text whose sole defect is the horizon cut. That
number is precisely the quantity the repair removes.

### D2 — `utf8DegradationCurve` oscillates with the UTF-8 byte stride → **VERIFIED**

**Claimed:** the curve is periodic and is an instrumentation artifact rather than a
generation measurement.

**Root cause (from `probe.ts:917`):** the curve calls
`replacementCharCount(tokenizer.decode(generated))` on the **growing prefix** at every step.
`decode` of a prefix is **not monotone in U+FFFD count**: a trailing incomplete sequence
emits U+FFFD and *stops* doing so once the next token completes the character.

Deterministic minimal instance (first 8 tokens of a real document):

```
text       "太阳从山谷后面缓缓升起"
prefixLen   1  2  3  4  5  6  7  8
U+FFFD      1  0  1  1  0  1  1  0     <-- period 3, decreases
bytes      e5 a4 aa | e9 98 b3 | e4 bb 8e      (太 | 阳 | 从)
```

**Recorded artifact confirms it:** `experiments/phase94/candidate-B.json`
`generationAnalysis.utf8DegradationCurve` has `total = 3` at every step (the filter at
`probe.ts:888` keeps zh + mixed prompts only) and `invalidRate` **decreases at 10 of 23
steps**. A genuine degradation metric is mathematically incapable of decreasing. The
curve is boundary alignment, not degradation.

### D3 — `decode(generatedIds)` in isolation misclassifies a continuation token → **REFUTED**

**Claimed:** decoding the generated suffix standalone can misjudge a continuation byte
that logically completes a character started immediately before the evaluation window.

**The mechanism is real in the tokenizer:**
```
decode([continuation 0x80])  = "�"     (id 4 + 0x80)
decode([0xE6, 0x80, 0x80])   = "怀"    (same byte, once the character is complete)
```

**But the evaluator cannot hit it.** `evaluate.ts:261` decodes the whole `generatedIds`,
and generation begins immediately after a complete prompt. The premise — that every real
prompt's encoding ends on a character boundary — was verified byte-for-byte for all five
prompts: `the sun rises`, `machine learning is`, `太阳`, `机器学习是`,
`什么是 machine learning` → `encode ends on boundary: true` for all five.

An orphan continuation byte in `generatedIds[0]` is therefore a genuine model error, and
the isolated decode reports it **correctly**. **D3 is removed from the defect list.** It
is retained in this document only as a recorded regression guard: it would become a real
defect if a prompt ending mid-character were ever added, or if the evaluator ever decoded
a suffix of a longer generation.

### D4 — (found by this audit, not previously claimed) tolerant-ness trap

`BPETokenizer.decode`'s fallback for an id ≥ 260 absent from the vocabulary pushes the
three bytes `EF BF BD` (`BPETokenizer.ts:271-272`) — a **well-formed** UTF-8 sequence
decoding to the character U+FFFD.

```
unknown id 350: bytes ef bf bd | strict valid: false | byte-scanner tolerant valid: true
```

The strict metric flags this correctly (it counts U+FFFD *characters*), but a byte-level
tail-tolerance rule alone would **flip an out-of-range token id from invalid to valid**.
This is a concrete instance of the constraint in §7.1. Any implementation of
`validUtf8Tolerant` must reject out-of-range ids independently of UTF-8 structure.
Latent today — Phase 91 verified `allIdsInVocab: true` for every audited sample — but
the repair must not silently widen it.

---

## 4. Metric definitions (design only — not implemented in this phase)

All three are computed from the **same** `generatedIds` that produce the strict metric, in
the same evaluation pass. No second generation, no second decode, no second tokenizer.
Byte extraction must mirror `BPETokenizer.decode`'s own collection loop exactly
(`getVocabulary().idToToken`, else `id - 4` for `4 <= id < 260`, else the U+FFFD bytes).

One shared scanner — not three — provides all three metrics:

```
scanUtf8(bytes) -> { firstInvalidByte, incompleteTailAt }
```

Walking the byte stream with a UTF-8 state machine:
- a byte in a position UTF-8 forbids (a continuation byte where a lead is expected, a
  continuation byte that does not match the open sequence, or an illegal lead such as
  `0x80-0xC1`, `0xF5-0xFF`) sets `firstInvalidByte` to the offending offset;
- reaching end-of-input while still expecting continuation bytes sets `incompleteTailAt`
  to the offset at which the final, well-formed but unfinished sequence began;
- a fully valid stream returns `{ -1, -1 }`.

### 4.1 `validUtf8Tolerant`

A sample is **tolerantly valid** iff `scanUtf8` reports `firstInvalidByte === -1` **and**
the sample contains no out-of-range token id (§3 D4).

Consequences, all required by §7.1 of the brief:

| Case | strict | tolerant |
|---|---|---|
| complete valid sequence | valid | valid |
| valid text + truncated final character | invalid | **valid** |
| interior malformed bytes | invalid | **invalid** (never forgiven) |
| leading orphan continuation byte | invalid | **invalid** (never forgiven) |
| illegal lead byte (`0xFF`) at the end | invalid | **invalid** — not an incomplete sequence |
| out-of-range token id | invalid | **invalid** (guarded, §3 D4) |
| empty generation | invalid | valid — see below |

Tolerating at most one trailing, structurally well-formed, ≤3-byte unfinished sequence
prevents the obvious exploit of "emit unfinished bytes forever": a run of lead bytes
(e.g. `E6 E6 …`) fails at `firstInvalidByte = 1`, a run of bare continuation bytes fails
at `firstInvalidByte = 0`.

Tolerant validity is deliberately **silent about emptiness and content**: the empty case
is already covered by the existing `nonEmptyRatio === 1` condition, and content quality is
carried by `charIntegrityRate` and the retained metrics. `validUtf8Tolerant` answers only
"is the byte stream a well-formed code-point sequence once the horizon cut is discounted".

The strict metric is retained unchanged, under the existing field names.

### 4.2 `tokensToFirstInvalid`

The token index containing `firstInvalidByte`, or the sentinel when there is none.

- **Sentinel: `-1`.** This is the repository's established idiom for "absent"
  (`idx === -1` appears across `research/ExperimentQueue.ts`, `research/ResearchWorkspace.ts`,
  `research/ResearchStore` sites, `tests/phase91-generation-audit.test.ts:494`, and many
  others). No new convention is introduced.
- Invalid at token 0 → `0`.
- Valid to the end → `-1`.
- Trailing incomplete character only → `-1` (it is *not* an irrecoverable error), with the
  separate boolean `trailingIncomplete` recording that the sample was cut. **Nothing is
  lost by the sentinel choice**, which matters because §5 of the brief requires stating
  what information a replacement intentionally discards.

Smaller is worse; larger is better; `-1` is best. On the oracle this is confirmed
well-defined: across all 5,457 char-aligned real-text windows, `tokensToFirstInvalid`
is `-1` for every single one, while 1,496 of them are `trailingIncomplete`.

### 4.3 `charIntegrityRate`

Per sample, over the continuation **after** discarding any tolerated trailing incomplete
sequence (same bytes the tolerant judge accepted):

- `numerator` = count of characters in the decoded string that are **not** U+FFFD
- `denominator` = `numerator` + count of U+FFFD characters in that decoded string
- `charIntegrityRate` = `denominator > 0 ? numerator / denominator : 0`

Conventions, each explicitly required by §7.3:
- **final incomplete character** — excluded from both numerator and denominator (it was
  discarded, not counted as a defect).
- **internal invalid bytes** — counted in the denominator via the U+FFFD characters they
  produce, i.e. directly comparable with the existing `replacementCharCount`.
- **empty character set** (`denominator === 0`) — ratio is `0`, following the repository's
  existing empty-denominator idiom (`invalidRate: total > 0 ? invalid / total : 0`,
  `probe.ts:928`). The raw `numerator`/`denominator` are carried alongside so a
  zero-denominator sample is distinguishable from a genuinely zero-integrity one.
- **aggregation across prompts: pooled counts, not a mean of ratios** — sum numerators and
  sum denominators across the prompts of a class. This is the specific fix for the
  "one or two examples per class produce all-or-nothing aggregate behaviour" problem; the
  per-prompt minimum is also reported so the worst prompt stays visible.
- **aggregation across classes:** reported per class. `cjkRatio`/`hasCjk` and the other
  existing aggregates are unchanged.

**No Level-4 threshold is chosen for `charIntegrityRate` in this phase** (§7.3 and §10 of
the brief). It is a reported diagnostic.

---

## 5. Oracle acceptance test (mandatory)

**Procedure** (deterministic; corpus + production tokenizer + `SEED 42` + `MAX_TOKENS 24`):

1. Encode every corpus document with the production tokenizer recipe.
2. Slide a 24-token window over each document; keep windows whose first byte is not a
   UTF-8 continuation byte (character-aligned).
3. Classify each window into the gate classes: ascii-only → `en`, CJK-only → `zh`,
   CJK+Latin → `mixed`.
4. Per class, `p_class` = clean-window fraction, under the strict judge and the tolerant
   judge respectively.
5. `P_gate = p_zh^2 * p_en^2 * p_mixed^1`, matching the gate's per-class sample counts.

**Recorded reference values from the audit (reference, not expectation):**
strict `P_gate = 7.639%`; tolerant `P_gate = 100.000%`.

**Acceptance condition — the repair is accepted only if all of the following hold:**

| # | Condition | Audited reference |
|---|---|---|
| A1 | tolerant `p_en = 1` **exactly** | 100.000% |
| A2 | tolerant `p_zh = 1` **exactly** | 100.000% |
| A3 | tolerant `p_mixed = 1` **exactly** | 100.000% |
| A4 | ⇒ tolerant `P_gate = 1` **exactly** | 100.000% |
| A5 | strict `P_gate` materially below 1 (bounded, not hardcoded) | 7.639% |
| A6 | tolerant ⊇ strict on every window; strict verdict identical to the production decoder's | 0 disagreements |

A1–A4 are the §8 requirement and are **not to be lowered**, **not to be special-cased**,
and **not to be satisfied by hardcoding**. If the implemented tolerant judge cannot reach
100%, the definition is wrong and must be re-diagnosed rather than relaxed.

A5 is a bounded regression guard (`strict P_gate < 0.15`), deliberately a bound rather than
an equality so the test does not become a brittle restatement of one measurement. The
audited 7.639% is recorded here as provenance.

**Honest limitation:** the oracle bounds the **instrument**, using corpus documents rather
than the five literal prompts (only `太阳` appears verbatim in the corpus). It therefore
does not certify anything about the specific prompt set. This limitation must be carried
into the Phase 95 report.

---

## 6. Existing-checkpoint re-evaluation design (zero training)

### 6.1 Artifacts on disk (verified present 2026-09-15)

| Cell | k | Path | Size | Params (recorded) |
|---|---|---|---|---|
| A | 0 (reuse Phase 90) | `experiments/phase90/phase90-aligned.ckpt.json` | 73,605,758 B | 1,126,528 |
| B | 8 | `experiments/phase94/phase94-b.ckpt.json` | 27,951,440 B | 1,126,528 |
| C | 24 | `experiments/phase94/phase94-c.ckpt.json` | 27,949,586 B | 1,126,528 |

Also present, **out of scope, must not be silently included**:
`experiments/phase93/phase93-{b,c}.ckpt.json` (Phase 93 capacity cells, different
`dModel`), and `experiments/phase94/phase94-c.killed-20260913.ckpt.json` (the killed
09-13 C, different init — an optional independent replication sample only if a later phase
builds an explicit `--eval-only` path).

`A_CKPT` is the constant `experiments/phase94/probe.ts:123`. All three cells share the
production architecture (`getProductionModelConfig()`: `dModel 128`, `heads 4`, `dFF 512`,
`layers 4`), so one `buildModel` serves all three.

**Missing-artifact policy:** if a checkpoint is absent, the harness reports it as missing
and continues. A missing artifact is never replaced by a fabricated or interpolated result.

### 6.2 Loading path

Reuse the audited production path exactly as Phase 94's `--recompute-nll` and reuse branch
do (`probe.ts:1100-1124`, `probe.ts:1364-1384`):

1. `buildTokenizer(corpus, 300)` — production recipe, `Random.setSeed(42)`.
2. `buildModel(tokenizer, cell)` — production arch from `getProductionModelConfig()`.
3. `loadCheckpoint({ model, optimizer, checkpoint })`.

### 6.3 Reload acceptance test — proving the *right weights* were loaded

The Phase 94 report records the latent wart that `buildModel` does not reseed
(`probe.ts:170-179`), so a fresh model's init depends on the ambient global RNG. For
re-evaluation this is harmless **only if `loadCheckpoint` overwrites every parameter**.
That must be asserted, not assumed. The re-evaluation must reproduce these recorded
values (read directly from `experiments/phase94/candidate-{A,B,C}.json`):

| Cell | `trainingDistribution.alignedTop1` | `alignedTokens` | `alignedNll` | gate `memorization.top1` | gate `validUtf8Ratio` zh/en/mixed |
|---|---|---|---|---|---|
| A | 0.9645462010336666 | 20,703 | 0.11873743531054956 | 0.9580152671755725 | 0.5 / 0.5 / 0 |
| B | 0.9592812635849877 | 20,703 | 0.15761980878965343 | 0.9618320610687023 | 0.5 / 1.0 / 0 |
| C | 0.9550306718833019 | 20,703 | 0.2103021276407774 | 0.9541984732824428 | 0 / 1.0 / 0 |

Plus per-cell checkpoint integrity (`candidate-*.json → checkpoint.integrity`):
`paramCountMatches: true`, `shapeMismatches: []`, `nanCount: 0`, `infinityCount: 0`,
`reloadDeterministic: true`.

**Reproducing the strict `validUtf8Ratio` column is the determinism gate:** the repair must
not change strict semantics. Any deviation means the repair altered the strict path and the
phase stops.

### 6.4 What is measured

For each cell, in **one** generation pass with the unmodified production config
(`temperature 0.8`, `seed 42`, `maxTokens 24`, the five-prompt `GEN_EVAL_PROMPTS`):

- existing strict metrics, unchanged, plus
- `validUtf8Tolerant` (§4.1), `tokensToFirstInvalid` (§4.2), `charIntegrityRate` (§4.3),
- both sampling modes already computed by the probes (`temp08` at `probe.ts:1246`,
  greedy at `probe.ts:1242` → `greedyUtf8Analysis`, `probe.ts:846`), reported side by side.

Also re-derived, for the historical record only:
- the `utf8DegradationCurve` **as currently defined**, to document the artifact, alongside
- its replacement: per-step `tokensToFirstInvalid` / integrity, which is monotone-safe.

---

## 7. Level-4 definition — decision analysis

### The audited question

§10 of the brief: prefer replacement **only if the audit demonstrates that the strict
UTF-8 gate is objectively measuring an evaluator artifact.**

### Option A — keep the old Level-4 definition, add repaired diagnostics only

- Pros: zero risk of widening the north star; strictly additive; no reinterpretation of
  Phases 84–94.
- Cons: `validUtf8Ratio === 1` retains a **7.639% oracle ceiling** for zh/mixed. The
  endpoint stays saturated, so *Phase 96 would have no usable signal* — a training
  experiment measured by it could return "Level 4 FAIL" for a perfect model. This is
  precisely the situation §13.2 of the Phase 94 report warned about.

### Option B — replace only the broken strict UTF-8 condition with the tolerant metric

Level 4 becomes:

```
coherentGeneration = everyLanguageCoherentTolerant && mergedUsed
everyLanguageCoherentTolerant(lang) =
      agg.validUtf8TolerantRatio === 1
   && agg.nonEmptyRatio === 1
   && agg.collapsedRatio === 0
```

with `cjkRatio`, `mergedTokenRatio`, `charIntegrityRate`, `tokensToFirstInvalid` reported
but **not** used as gate conditions. Strict values are retained under explicit `strict`
names.

- Pros: ceiling restored to exactly 100% (A1–A4), so the gate becomes capability-sensitive
  for the first time. Nothing else about the gate is loosened.
- Cons: it changes the project's north-star definition, and it *is* formally a relaxation —
  a sample that was invalid can become valid.

### Recommendation

**Option B, conditional on the acceptance test.** The audit demonstrates the required
condition: of 5,457 char-aligned perfect windows, 1,496 (27.42%) are rejected *solely*
because the horizon cut the final character, and no window of real text has an
irrecoverable error. The strict condition is therefore objectively artifact-bearing for
zh/mixed, and only for zh/mixed — `en` is unaffected (100% at the ceiling).

**This recommendation is NOT "proven".** Per §10 of the brief, Option B must not be
adopted until the implemented `validUtf8Tolerant` reproduces the audit's oracle result
(A1–A4, exactly 100%) and the reload determinism gate (§6.3) passes. If either fails, the
phase falls back to **Option A** and reports the ceiling as a documented instrument
limitation.

### What Option B is NOT

- It is **not** a new threshold. No numeric bar is invented for `charIntegrityRate` or
  `tokensToFirstInvalid`.
- It is **not** a redefinition of what Level 4 means: the criterion string keeps the
  substring `valid UTF-8`, so the existing assertions in `phase91-generation-audit.test.ts:676`,
  `phase92-tokenizer-budget.test.ts:506`, `phase93-capacity-sweep.test.ts:275`,
  `phase94-rollout-objective.test.ts:285` continue to hold.
- It does **not** touch rollout. §12 of the brief treats rollout as non-target; the audit
  found no implementation defect in it (`probe.ts:933+`, 60 documents, accuracy vs. the
  original document at each step). It stays a reported metric and is **not** added to the
  gate — adding it would require inventing a threshold, which §10 forbids.

---

## 8. Historical comparability strategy

Output schema (additive; every existing field name and value is preserved):

```
byLanguage[lang] = {
  // strict, historical — unchanged names, unchanged semantics
  validUtf8Ratio, nonEmptyRatio, cjkRatio, collapsedRatio, mergedTokenRatio, sampleCount,

  // repaired + new diagnostics
  validUtf8TolerantRatio,
  charIntegrityRate, charIntegrityNumerator, charIntegrityDenominator,
  tokensToFirstInvalidMin, tokensToFirstInvalidMean, trailingIncompleteCount,
  strictValidUtf8Ratio,          // explicit alias of validUtf8Ratio for new consumers
}

samples[i] = {
  ...existing fields...,
  validUtf8Tolerant,
  tokensToFirstInvalid,          // -1 = none
  trailingIncomplete,
  charIntegrityRate, charIntegrityNumerator, charIntegrityDenominator,
}
```

Rules:
- Historical values are **never overwritten**. A future report can state, for the same
  checkpoint, "historical strict UTF-8 result = X" and "repaired tolerant UTF-8 result = Y".
  For A/B/C, X is the table in §6.3.
- No historical metric is silently rewritten. Where Phase 94 corrected an artifact
  (`alignedNll`), the correction was recorded with an explicit provenance block; the same
  discipline applies here.
- Existing test files read `generation.byLanguage[lang].validUtf8Ratio` from artifacts
  (`phase92:187`, `phase93:337`, `phase94:426`, `phase84:519`). Those names persist, so
  **no existing test needs weakening or deletion.**

---

## 9. Test plan

New file `src/lib/minimind/research/tests/phase95-instrument-repair.test.ts`, registered in
`src/lib/minimind/research/__tests__/run.ts` as `runPhase95Tests` (following the
`phase80`–`phase94` registration pattern at `run.ts:17-31`).

**Static / unit (pure functions, no model, deterministic):**

1. `scanUtf8` crafted vectors: ASCII; complete 3-byte CJK; trailing incomplete of 1, 2 and
   3 bytes; interior invalid byte; bare continuation byte at offset 0; illegal lead bytes
   `0x80`, `0xC0`, `0xC1`, `0xF5`, `0xFF`; empty input.
2. Tolerant ⊇ strict: over all oracle windows, `strict ⇒ tolerant` with no exceptions.
3. Tolerant rejects the unknown-id fallback (§3 D4): an out-of-range id is invalid under
   **both** judges.
4. Tolerant accepts a trailing-incomplete-only window; tolerant still rejects an
   interior-error window.
5. `tokensToFirstInvalid`: `-1` when clean; `0` when invalid at token 0; the containing
   index for an interior error; `-1` together with `trailingIncomplete === true` for a
   pure tail cut. Assert the sentinel is `-1`, not a new convention.
6. `charIntegrityRate`: numerator/denominator arithmetic; empty denominator → ratio `0`
   with denominator `0`; pooled aggregation across prompts equals sum-of-counts, and
   differs from mean-of-ratios on a crafted 2-prompt case.
7. Determinism: identical `generatedIds` produce identical metrics; no `Math.random`,
   no `Date`, no ambient RNG. (This guards the §2 constraints on the metric code.)

**Oracle acceptance test (the §5 gate, run as a test):**

8. Assert A1–A4 exactly (`tolerant p_class === 1` for all three classes, tolerant
   `P_gate === 1`), A5 as the bound `strict P_gate < 0.15`, A6 by comparing the tolerant
   judge against `tokenizer.decode` on every window.
   Fails loudly with the observed rates if the repair regresses.

**Artifact tests (skip-with-report if an artifact is absent — never fabricate):**

9. For each of A/B/C present: the re-evaluation report exists; the reload acceptance values
   of §6.3 reproduce; checkpoint integrity fields assert true.
10. Strict `validUtf8Ratio` recomputed equals the recorded §6.3 column (the determinism
    gate).
11. Level-4 criterion string still contains `valid UTF-8`, and no new numeric Level-4
    threshold has been introduced (guards §10).

Existing suites must remain green; no test may be weakened or deleted (§2.11).

---

## 10. Non-goals

- No training, no retraining of A/B/C, no new arms, no hyperparameter change.
- No checkpoint modification (the checkpoints are opened read-only).
- No change to the tokenizer, its vocabulary, its training, or `decode`'s semantics.
- No change to the dataset, the generation/rollout loop, `maxTokens`, temperature,
  sampling, top-k/top-p, EOS handling, or repetition logic.
- No change to the prompt set or to the prompt-regime mismatch left open by Phase 94 §12.2.
- No change to the Phase 89 objective or the Phase 90 document-aligned layout.
- No change to the rollout metric.
- No new Level-4 numeric threshold.
- No decoding-side UTF-8 constraint enforced at generation time. Forcing the model to emit
  valid UTF-8 would move the reported ratio without testing the capability claim (Phase 94
  §13.5) — the repair is in the *measurement*, never in the generator.
- No second runtime/tokenizer/generation implementation. One shared scanner, consumed by
  the existing evaluator; `evaluation/GenerationEvaluator.ts` (the product/UI path, which
  also calls `decode(generatedIds)` at line 288) is **out of scope** and untouched. It is
  not the Level-4 SSOT — `buildEvidence` consumes only `capability-eval`.
- No committed production code in this task.

---

## 11. Risks and unresolved questions

**Risks**
1. **The 7.639% ceiling is instrument-level, not prompt-level.** The oracle uses corpus
   documents; only `太阳` appears verbatim. The five-prompt ceiling may differ. Mitigation:
   state the limitation in the report; do not generalize the number to the prompt set.
2. **Option B is formally a relaxation.** Mitigated by the tight tolerant rule (only a
   single, well-formed, ≤3-byte trailing sequence; interior and leading errors never
   forgiven; out-of-range ids guarded) and by the oracle test as the acceptance gate.
3. **Tolerant-ness trap (§3 D4).** If the guard is omitted, an out-of-range id silently
   becomes valid. Covered by test 3.
4. **`buildModel` does not reseed** (`probe.ts:170-179`). Harmless for re-evaluation only
   if `loadCheckpoint` overwrites every parameter — asserted by the §6.3 acceptance test.
   The underlying wart is **not** fixed in this phase (fixing it would invalidate the
   Phase 93/94 fresh-init cells).
5. **Doc/implementation mismatch recorded:** `levels.ts:15-16` documents Level 4 as
   including "CJK present for zh", but `everyAggregateCoherent` (`levels.ts:180-182`) does
   **not** check `cjkRatio`. A real inconsistency between the stated criterion and the
   enforced gate. Phase 95 does **not** fix it (doing so would change the gate), but the
   discrepancy is recorded and should be reconciled explicitly in a later phase.
6. **`GenerationEvaluator` forks the same `decode(generatedIds)` logic** at line 288. If a
   later phase repairs it too, the two must not diverge into two metric definitions.

**Unresolved questions carried forward**
1. Whether the repaired gate, once implementable, flips any A/B/C verdict. **Hypothesis,
   not a pre-written result:** on the audited evidence it should not, because every
   observed failure is interior corruption rather than a tail cut (§12). To be measured,
   never asserted.
2. Whether a multi-prompt Level-4 evaluation set should replace the 2/2/1 sample counts.
   Out of scope (would change the prompt set) but the "2 zh + 1 mixed" granularity is a
   standing weakness.
3. Whether `charIntegrityRate` should become a gate condition in a later phase. Deferred
   deliberately — no threshold is invented here.

---

## 12. Verified facts vs. evidence vs. hypotheses

**Verified facts (re-derived from code and measurement in this audit)**
- The Level-4 gate requires `validUtf8Ratio === 1` in each of zh/en/mixed
  (`levels.ts:180-182`), over 2 zh + 2 en + 1 mixed samples (`probe.ts:114-120`).
- The horizon is a fixed 24 tokens (`evaluate.ts:238` default; `probe.ts:103`).
- `decode` of a growing prefix is non-monotone in U+FFFD; the recorded curve decreases at
  10/23 steps with `total = 3` at every step.
- The strict oracle ceiling is **7.639%**; the tolerant ceiling is **100.000%**.
- 1,496 / 5,457 char-aligned perfect windows are trailing-incomplete-only.
- `en` is unaffected (100% strict at the ceiling).
- D3 does not hold for this evaluator: all five prompts encode to streams ending on a
  character boundary.
- The unknown-id fallback (`EF BF BD`) is flushable by a naive byte-level tail rule.

**Current evidence (needs the implementation to confirm)**
- That the repaired evaluator reproduces the strict metrics exactly (§6.3 gate).
- That the Level-4 verdict changes for no cell — supported by the observation that all 15
  recorded `temp0.8` and `greedy` samples fail with *interior* corruption, and that the
  tolerant judge forgives only a trailing cut. **This is a hypothesis to be measured.**
- That `charIntegrityRate` and `tokensToFirstInvalid` have usable dynamic range on A/B/C.

**Hypotheses (explicitly not results)**
- That the historical "Level 4 FAIL" across Phases 84–94 is *dominated* by the artifact
  for zh/mixed. The artifact (7.639% ceiling) is verified; the claim that it dominated
  past conclusions is not yet measured.
- That Phase 96 can run a training experiment against a sensitive endpoint. Depends on the
  verdict-change hypothesis above.

**Acceptance criteria** — §5 A1–A6, plus the §6.3 reload determinism gate.

**No A/B/C final metrics are pre-written in this document.** The numbers in §6.3 are
*recorded historical values from Phase 94 artifacts*, quoted as the re-evaluation's
acceptance input, not as Phase 95 results.

---

## 13. Exact implementation boundary for the next phase

**Files the implementation phase will create**

| File | Purpose |
|---|---|
| `src/lib/minimind/research/capability-eval/utf8.ts` | The single shared `scanUtf8` + tolerant judge + byte extraction. The only such implementation. |
| `experiments/phase95/probe.ts` | Zero-training re-evaluation harness: load A/B/C, one generation pass, compute all metrics, write `experiments/phase95/probe-results.json` and `candidate-{A,B,C}.json`. |
| `experiments/phase95/run-probe.cmd` | Launcher, following `experiments/phase94/run-probe.cmd`. Must use `call npx --yes tsx`, CRLF line endings, ASCII only. |
| `src/lib/minimind/research/tests/phase95-instrument-repair.test.ts` | Tests 1–11 of §9. |
| `src/lib/minimind/research/PHASE95-INSTRUMENT-REPAIR-REPORT.md` | Report, structured like the Phase 94 report. |

**Files the implementation phase will modify**

| File | Change |
|---|---|
| `src/lib/minimind/research/capability-eval/evaluate.ts` | Add tolerant + diagnostic fields to `GenerationSampleMetrics` / `LanguageAggregate`; capture `generatedIds` so all metrics describe the same generation; import the shared scanner. Existing fields and numeric semantics unchanged. |
| `src/lib/minimind/research/capability-eval/levels.ts` | **Option B only, conditional on §5 passing:** swap the UTF-8 condition in `everyAggregateCoherent` to the tolerant ratio. Criterion string keeps `valid UTF-8`. |
| `src/lib/minimind/research/capability-eval/index.ts` | Export the new types. |
| `src/lib/minimind/research/__tests__/run.ts` | Register `runPhase95Tests`. |

**Files the implementation phase must NOT touch**

`tokenizer/**`, `data/**`, `model/**`, `training/**`, `core/**`, `evaluation/GenerationEvaluator.ts`,
the Phase 89 objective, the Phase 90 layout, the prompt set, `experiments/phase90/**`,
`experiments/phase93/**`, `experiments/phase94/**` (including all checkpoints and
`candidate-*.json`), and every existing test file.

**Order of work**
1. Implement `utf8.ts` + tests 1–7. Green before anything else.
2. Run the oracle acceptance test (§5 / test 8). **A1–A4 must be exactly 100%.** If not,
   stop and re-diagnose the definition.
3. Add the evaluator fields; verify strict semantics unchanged (test 10, §6.3).
4. Build the re-evaluation harness; run on A/B/C; artifact tests 9–11.
5. Only now apply Option B to `levels.ts`, and report both the strict and tolerant Level-4
   verdicts side by side.
6. Write the report; run the full research suite, core/data/training/adapter suites, and
   `npm run build`.

---

## Appendix — audit harness

`experiments/phase95/audit-instrument-defects.ts` (working tree, **uncommitted**; not
production code, no `src/` import, no writes to `src/`). It reproduces every number in §3
and §5: the D2a minimal instance, the D2b curve statistics read from
`candidate-B.json`, the D3 minimal example and prompt-alignment premise, the D4 unknown-id
trap, and the strict/tolerant oracle ceilings with the decoder cross-check.
