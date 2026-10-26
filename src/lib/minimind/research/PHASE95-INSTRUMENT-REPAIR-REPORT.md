# Phase 95 — Generation Evaluation Instrument Repair

**Status:** implementation complete. Zero training. No checkpoint, tokenizer, dataset,
model, objective, layout, generation loop, prompt set or sampling parameter was changed.
**Date:** 2026-09-15
**Design:** `docs/superpowers/specs/2026-09-15-phase95-instrument-repair-design.md` (commit `df5645f`)

---

## 1. Implementation summary

The Level-4 capability gate required `validUtf8Ratio === 1` in every language class. That
ratio counts U+FFFD characters in `tokenizer.decode(generatedIds)`. Because the generation
horizon is a **fixed 24 tokens** and the tokenizer is byte-level, a **perfect** generator —
one emitting the true continuation of real corpus text — lands off a character boundary
about two times in three, and the strict ratio reported a defect that was not there.

Phase 95 replaced that one condition with a **tolerant** byte-level judge and added two
diagnostics. Nothing else about the gate changed, and no threshold was invented.

The single source of truth for the new measurement is
`src/lib/minimind/research/capability-eval/utf8.ts`:

* `scanUtf8(bytes)` — one UTF-8 state machine, shared by every repaired metric;
* `tokenBytesOf(idToToken, ids)` — reproduces `BPETokenizer.decode`'s byte collection step
  for step, and separately counts ids that are neither vocabulary tokens nor byte tokens;
* `analyzeGeneration(idToToken, ids)` — strict verdict, tolerant verdict, first
  irrecoverable token index, trailing-cut flag and character integrity, all from **one**
  byte extraction and **one** scan, so every number on a sample describes the same
  generation;
* `charIntegrityRate(analysis)` — the ratio, with the repository's existing
  empty-denominator idiom.

There is **no second tokenizer, no second generation runtime, and no second decode**: the
repaired metrics read the same `generatedIds` the strict metric reads, through the
tokenizer's own `getVocabulary().idToToken` map. Generation is untouched — forcing the model
to emit valid UTF-8 would move the reported ratio without testing the capability claim
(Phase 94 §13.5).

**Widest-reaching finding: the repair flips NO A/B/C verdict.** All three checkpoints fail
Level 4 under the old judge *and* under the repaired judge, because every failing sample
fails with **interior** corruption, and the tolerant judge forgives only a trailing cut.
The 7.639% oracle ceiling was real but was **not what was binding** for these checkpoints.
This was the Phase 95 spec's stated hypothesis (§11, §12) and it is now **measured, not
asserted**.

**Hard constraints honoured.** No training; no checkpoint opened for writing (all three
were read as JSON and re-loaded); tokenizer, vocabulary, dataset, architecture, config,
objective, Phase 90 layout, generation loop, temperature, sampling, prompt set, step limits
and every existing Level-3 threshold untouched. No `Math.random`, no `setTimeout`, no
hardcoded A/B/C result, no fabricated checkpoint, no historical metric overwritten, no
existing test weakened or deleted.

---

## 2. Exact code paths changed

### Created

| File | Purpose |
|---|---|
| `src/lib/minimind/research/capability-eval/utf8.ts` | The single shared scanner + tolerant judge + byte extraction. The only such implementation. |
| `src/lib/minimind/research/tests/phase95-instrument-repair.test.ts` | Tests 1–11 (static, oracle, artifact). |
| `experiments/phase95/probe.ts` | Zero-training re-evaluation harness for A/B/C. |
| `experiments/phase95/run-probe.cmd` | Launcher — CRLF, ASCII-only, `call npx --yes tsx` (the `call` is required for the `npx` `.cmd` shim). |
| `src/lib/minimind/research/PHASE95-INSTRUMENT-REPAIR-REPORT.md` | This report. |

### Modified

| File | Change |
|---|---|
| `capability-eval/evaluate.ts` | `GenerationSampleMetrics` and `LanguageAggregate` gained the repaired/diagnostic fields and `generatedIds`; `measureSample` now receives the tokenizer's `idToToken` map and derives the repaired metrics from the same ids; aggregation extracted into the exported `aggregateGenerationSamples`. **Every pre-existing field keeps its name, computation and numeric semantics.** |
| `capability-eval/levels.ts` | Option B: the UTF-8 term of the Level-4 per-language gate is now `validUtf8TolerantRatio === 1`. Added `LEVEL4_GATE_CONDITIONS`, `LEVEL4_DIAGNOSTIC_FIELDS`, `Utf8GateMode`, and an optional `utf8Gate` parameter on `buildEvidence` so **both** verdicts come from the one gate implementation. Recorded the `levels.ts` doc/impl mismatch (see §13). |
| `capability-eval/index.ts` | Re-exports the new functions, constants and types. |
| `research/__tests__/run.ts` | Registers `runPhase95Tests` after Phase 94. |

### Deliberately NOT touched

`tokenizer/**`, `data/**`, `model/**`, `training/**`, `core/**`,
`evaluation/GenerationEvaluator.ts`, the Phase 89 objective, the Phase 90 layout, the prompt
set, `experiments/phase90/**`, `experiments/phase93/**`, `experiments/phase94/**` (including
every checkpoint and `candidate-*.json`), and every existing test file.

---

## 3. Oracle results

The oracle is a **model-free perfect generator**: real corpus text, encoded with the
production tokenizer, sliced into exactly 24-token windows. 7,696 windows total; the
**5,457** that open on a character boundary are the ones a character-aligned prompt can
actually produce, and are the gate-relevant population.

| class | windows | strict clean | tolerant clean |
|---|---|---|---|
| ascii (matches `en`) | 2,562 | 100.000% | **100.000%** |
| cjk (matches `zh`) | 1,053 | 37.417% | **100.000%** |
| mixed | 1,842 | 54.560% | **100.000%** |
| **gate product** `p_zh²·p_en²·p_mixed` | 5,457 | **7.639%** | **100.000%** |

| # | Acceptance condition | Required | Observed | Verdict |
|---|---|---|---|---|
| A1 | tolerant `p_en === 1` exactly | 1 | 1 | **PASS** |
| A2 | tolerant `p_zh === 1` exactly | 1 | 1 | **PASS** |
| A3 | tolerant `p_mixed === 1` exactly | 1 | 1 | **PASS** |
| A4 | tolerant `P_gate === 1` exactly | 1 | 1 | **PASS** |
| A5 | strict `P_gate` materially below 1 (bound `< 0.15`) | < 0.15 | 0.07639 | **PASS** |
| A6 | tolerant ⊇ strict on every window; strict verdict identical to the production decoder's | 0 violations | 0 / 0 | **PASS** |
| A7 | **every** strictly-invalid oracle window is a trailing cut, and **no** oracle window is malformed for an interior reason | 0 interior defects | 1496/1496 cut-only, 0 interior | **PASS** |

A1–A4 were **not lowered, not special-cased and not hardcoded**: the test builds every
window from real corpus bytes and runs the actual implementation. The strict figure was
reproduced independently of the audit harness (7.639% both times), and the scan/decoder
cross-check agrees on all 5,457 windows.

A7 is the assertion that makes the phase's central claim non-vacuous. A perfect generator
is fed valid UTF-8 corpus text, so the *only* defect it can exhibit is the 24-token cut
landing mid-character. **Measured: 1,496 of the 5,457 windows (27.414%) are rejected solely
by that cut, and 1,496 / 1,496 of the strict rejections are exactly that — there are zero
interior defects.** So the strict gate's ceiling is the horizon artifact in full, not a
capability signal with an artifact stacked on top. Had even one window been interior-dirty,
the claim "the gate was measuring the horizon" would have been false, and the test would
have failed.

**Honest limitation.** The oracle bounds the **instrument**, using corpus documents rather
than the five literal prompts (only `太阳` appears verbatim in the corpus). It certifies
nothing about the specific prompt set, and the 7.639% figure must not be generalised to it.

---

## 4. D1 / D2 / D3 / D4 final status

| defect | status after implementation |
|---|---|
| **D1** strict `validUtf8Ratio === 1` has a low oracle ceiling | **CONFIRMED and REPAIRED.** Strict 7.639% / tolerant 100.000%, reproduced by the shipped code. |
| **D2** `utf8DegradationCurve` oscillates with the UTF-8 byte stride | **CONFIRMED and DOCUMENTED.** See §7. The historical curve was **never a Level-4 gate** — it is a diagnostic series inside the probe artifacts, and `buildEvidence` never consumes it. There was therefore nothing to "remove" from the gate; the claim was checked against the code and did not hold. The curve is left intact in the Phase 94 artifacts (untouched) and is reproduced verbatim in the Phase 95 artifact beside its monotone-safe replacement. |
| **D3** isolated `decode(generatedIds)` misclassifies a continuation token | **REFUTED — no change made.** All five real prompts encode to streams ending on a character boundary, so an orphan continuation byte at `generatedIds[0]` is a genuine model error and the isolated decode reports it correctly. Nothing was "fixed", no prompt-boundary logic was altered, and a regression guard (test 11b) now asserts that a leading orphan continuation byte stays **invalid**. |
| **D4** tolerant-ness trap (found by the audit) | **GUARDED and TESTED.** `decode`'s fallback for an out-of-range id pushes `EF BF BD`, a **well-formed** sequence. `analyzeGeneration` counts out-of-range ids separately and the tolerant judge rejects them **independently of UTF-8 structure**; test 3 asserts that a byte-level tail rule alone would have flipped it, and that the shipped code does not. |

---

## 5. A/B/C re-evaluation (zero training)

All three checkpoints were present; none was unavailable. Loaded read-only through the
audited production path (`buildTokenizer` → `buildModel` → `loadCheckpoint`).

**Reload gate.** Two independent checks, both required:

1. **Parameter-overwrite proof.** Every model parameter was compared **element-wise, by
   name**, against the checkpoint's own stored array: 39 named parameters, `maxAbsDelta = 0`,
   `allMatch = true` for all three cells. This closes the Phase 94 latent wart that
   `buildModel` does not reseed — a read-only re-evaluation is valid **because** the
   checkpoint overwrites every parameter, and that is now asserted rather than assumed.
2. **Recorded-value reproduction.** 11 recorded Phase 94 fields per cell — gate
   `memorization.top1`, the three gate `validUtf8Ratio` values, `greedy.invalidRate`, and
   `rollout` accuracy at steps 1/2/4/8/16/24 — were recomputed and compared:

   **A 11/11 · B 11/11 · C 11/11 reproduced exactly.** Checkpoint integrity:
   `1,126,528 / 1,126,528` parameters, finite, for all three.

Not re-derived, and **not filled in with a guess**: `trainingDistribution.alignedTop1` /
`alignedTop5` / `alignedTop10` / `alignedNll`. Their implementation (`evalAlignedTopK`) is
private to `experiments/phase94/probe.ts`, which this phase must not modify. The reload gate
above is therefore carried by the parameter-overwrite proof and the eleven reproduced
fields, not by those four numbers.

### Per-cell results — historical (strict) vs repaired (tolerant)

**Cell A — k=0, Phase 90 aligned**

| | zh | en | mixed |
|---|---|---|---|
| strict `validUtf8Ratio` (recomputed) | 0.5 | 0.5 | 0 |
| Phase 94 recorded | 0.5 | 0.5 | 0 |
| **tolerant `validUtf8TolerantRatio`** | **0.5** | **0.5** | **0** |
| `charIntegrityRate` (pooled) | 0.7500 | 0.9400 | 0.9310 |
| `charIntegrityRateMin` (worst prompt) | 0.5833 | 0.7857 | 0.9310 |
| pooled numerator / denominator | 15 / 20 | 47 / 50 | 27 / 29 |
| `tokensToFirstInvalid` min / mean | 11 / 11 | 6 / 6 | 4 / 4 |
| invalid samples | 1 | 1 | 1 |
| trailing-incomplete samples | 0 | 0 | 0 |

**Cell B — k=8**

| | zh | en | mixed |
|---|---|---|---|
| strict `validUtf8Ratio` (recomputed) | 0.5 | 1.0 | 0 |
| Phase 94 recorded | 0.5 | 1.0 | 0 |
| **tolerant `validUtf8TolerantRatio`** | **0.5** | **1.0** | **0** |
| `charIntegrityRate` (pooled) | 0.6842 | 1.0000 | 0.7222 |
| `charIntegrityRateMin` | 0.4545 | 1.0000 | 0.7222 |
| pooled numerator / denominator | 13 / 19 | 55 / 55 | 13 / 18 |
| `tokensToFirstInvalid` min / mean | 2 / 2 | −1 / −1 | 3 / 3 |
| invalid samples | 1 | 0 | 1 |
| trailing-incomplete samples | 0 | 0 | 0 |

**Cell C — k=24**

| | zh | en | mixed |
|---|---|---|---|
| strict `validUtf8Ratio` (recomputed) | 0 | 1.0 | 0 |
| Phase 94 recorded | 0 | 1.0 | 0 |
| **tolerant `validUtf8TolerantRatio`** | **0** | **1.0** | **0** |
| `charIntegrityRate` (pooled) | 0.5909 | 1.0000 | 0.9583 |
| `charIntegrityRateMin` | 0.5833 | 1.0000 | 0.9583 |
| pooled numerator / denominator | 13 / 22 | 55 / 55 | 23 / 24 |
| `tokensToFirstInvalid` min / mean | 3 / 6.5 | −1 / −1 | 3 / 3 |
| invalid samples | 2 | 0 | 1 |
| trailing-incomplete samples | 0 | 0 | 0 |

**Other reproduced metrics** (all match Phase 94 exactly): gate `memorization.top1`
A 0.9580152671755725 · B 0.9618320610687023 · C 0.9541984732824428; greedy
invalid rate A 0.40 (zh 0.5 / en 0 / mixed 1.0) · B 0.40 (same) · C 0.60 (zh 1.0 / en 0 /
mixed 1.0); rollout @24 A 0.0847457627118644 · B 0.06779661016949153 · C 0.0847457627118644.

---

## 6. Strict vs tolerant comparison

**They are numerically identical in all nine class-cells, and in all three greedy
aggregates.** Across all 15 temp-0.8 samples and all 15 greedy samples, **`trailingIncomplete`
is true zero times** — not one recorded generation ends mid-character. The tolerant judge
therefore forgives nothing on these checkpoints, and every failing sample fails with a
genuine **interior** error:

```
A [zh   ] "机器学习是"  tolerant=false tfi=11 cut=false  "个躦会掻��复连��的�"
A [mixed] "什么是 machine learning" tolerant=false tfi=4 cut=false  "？�all�ning 的 pitery 的 pateake"
B [zh   ] "机器学习是"  tolerant=false tfi=2  cut=false  "一����点数�点抛�"
B [mixed] "什么是 machine learning" tolerant=false tfi=3 cut=false  "？��是 learning？澓���"
C [zh   ] "太阳"        tolerant=false tfi=10 cut=false  "通过核��灘�稟起�"
C [zh   ] "机器学习是"  tolerant=false tfi=3  cut=false  "个�过用完�来�觇��一"
C [mixed] "什么是 machine learning" tolerant=false tfi=3 cut=false  "？�不 dearning？me t umge l"
```

This is the phase's most consequential result: **the repaired gate changes no verdict for
A/B/C.** It was fixed because a *perfect* model failed it four times in five — a defect
that would have made Phase 96's endpoint mute — not because these checkpoints were
misjudged. Their Level-4 failure is real.

`en` is clean under both judges in every cell and even produces fluent text in C
(`"es over the quiet valley each morning"`). The failure is confined to `zh` and `mixed`.

No historical strict metric was altered anywhere: the strict values are recomputed
identically and retained under their existing names, with `strictValidUtf8Ratio` as an
explicit alias for new consumers.

---

## 7. `tokensToFirstInvalid` analysis

Sentinel is **`-1`** (the repository's existing "absent" idiom — no new convention). Smaller
is worse. `-1` together with `trailingIncomplete === true` means "clean but cut", so the
sentinel choice discards nothing.

Observed on the failing samples: **A** zh 11, en 6, mixed 4 · **B** zh 2, mixed 3 ·
**C** zh 3 and 6.5 mean over two invalid samples, mixed 3. Every value is an interior
position well inside the 24-token horizon — none is near the cut. That is the quantitative
form of the §6 finding.

Measured dynamic range across the sweep: the earliest irrecoverable error moves *earlier*
with the augmentation dose (A zh 11 → B zh 2), consistent with Phase 94's dose–response.

**Curve artifact (D2), reproduced and replaced.** The historical
`utf8DegradationCurve` definition (`probe.ts:917`: `decode()` on the **growing** prefix,
`total = 3` at every step, zh+mixed only) was recomputed verbatim beside a monotone-safe
replacement that reports an **irrecoverable** error at each prefix (a mid-character cut is
not an error):

| step | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | 23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** historical | 1.00 | 0.67 | 0.33 | 1.00 | 0.67 | 1.00 | 1.00 | 0.67 | 1.00 | 0.67 | 0.67 | 0.67 | 1.00 | 1.00 | 0.67 | 0.67 |
| **A** repaired | 0.00 | 0.00 | 0.33 | 0.33 | 0.33 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 |
| **B** historical | 1.00 | 0.67 | 0.33 | 0.67 | 0.33 | 0.67 | 0.67 | 0.33 | 1.00 | 0.33 | 0.67 | 0.67 | 1.00 | 1.00 | 0.67 | 0.67 |
| **B** repaired | 0.00 | 0.00 | 0.33 | 0.33 | 0.33 | 0.33 | 0.33 | 0.33 | 0.33 | 0.33 | 0.33 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 |
| **C** historical | 1.00 | 0.67 | 0.33 | 0.67 | 0.67 | 1.00 | 1.00 | 0.67 | 1.00 | 0.67 | 1.00 | 0.67 | 1.00 | 1.00 | 1.00 | 1.00 |
| **C** repaired | 0.00 | 0.00 | 0.00 | 0.33 | 0.33 | 0.33 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 | 1.00 | 1.00 | 1.00 | 1.00 |

The historical series is a **period-3 sawtooth** (the UTF-8 byte stride of CJK characters)
and **decreases** at 10/23 steps (A), 10/23 (B), 5/23 (C) — a genuine degradation metric
cannot decrease. A and B reproduce the recorded Phase 94 `candidate-B.json` exactly
(10/23 decreasing, `total = 3` per step). The repaired series is **monotone non-decreasing
in every cell**, by construction. The historical definition was documented, not deleted, and
not redesigned into another version.

---

## 8. `charIntegrityRate` analysis

Per sample: the decoded characters **after discarding the tolerated trailing incomplete
sequence**; numerator = non-U+FFFD characters, denominator = numerator + U+FFFD characters;
`denominator === 0 → 0`, with the raw counts carried alongside so an empty sample stays
distinguishable from a zero-integrity one.

Aggregation across the prompts of a class is **pooled counts (Σnumerator / Σdenominator),
not a mean of ratios**, and the per-prompt minimum is reported beside it. The difference is
real, not cosmetic: A's zh pooled rate is **15/20 = 0.75**, whereas the mean of per-prompt
ratios would be **0.7917** — the pooled figure is dragged down by the 12-character dirty
sample, which is the intended behaviour, and `charIntegrityRateMin = 0.5833` keeps the worst
prompt visible.

Dynamic range is usable, and for `zh` it is **monotone in the augmentation dose**:
0.7500 (A) → 0.6842 (B) → 0.5909 (C). The binary Level-4 gate cannot see that gradient;
this diagnostic can. `en` sits at 1.0000 in B and C.

**No Level-4 threshold was chosen for this metric.** It is reported, never gated.

---

## 9. Level-4 classification results

| cell | strict verdict | tolerant verdict | Level-4 criterion met? |
|---|---|---|---|
| A (k=0) | Level 3 | **Level 3** | no — both |
| B (k=8) | Level 3 | **Level 3** | no — both |
| C (k=24) | Level 3 | **Level 3** | no — both |

Both verdicts come from **one** gate implementation (`buildEvidence` with `utf8Gate:
"strict" | "tolerant"`); the two modes differ in exactly one term. Nothing was
re-implemented in the harness, so the strict and tolerant columns cannot drift apart.

The gate's three conditions are now declared in code, so the separation is checkable rather
than merely documented:

```
LEVEL4_GATE_CONDITIONS = [ "validUtf8TolerantRatio === 1", "nonEmptyRatio === 1", "collapsedRatio === 0" ]
```

Each is an exact equality to 0 or 1 — never a tuned bar. Exactly one UTF-8 condition exists
(no leftover strict duplicate). `LEVEL4_DIAGNOSTIC_FIELDS` lists `strictValidUtf8Ratio`,
`charIntegrityRate`, `charIntegrityRateMin`, `tokensToFirstInvalidMin`,
`tokensToFirstInvalidMean`, `invalidSampleCount`, `trailingIncompleteCount`, `cjkRatio` and
`mergedTokenRatio` as **reported but not gated**; test 11 asserts the two sets are disjoint.
The Level-4 criterion string still contains `valid UTF-8`, so the assertions in the Phase
91/92/93/94 suites continue to hold unmodified.

---

## 10. Was Option B actually activated?

**Yes — and it is earned by evidence, not assumed.** Option B was implemented in
`levels.ts` and is active in the shipped code, because both preconditions the spec set were
met:

1. the implemented `validUtf8Tolerant` reproduces the oracle result **exactly** (A1–A4 all
   `=== 1`, §3); and
2. the reload determinism gate passes (§5: 11/11 recorded fields reproduced per cell, and
   every parameter proven overwritten).

Had either failed, the phase would have reverted to Option A and reported the ceiling as a
documented instrument limitation. Neither failed.

**Activation is not the same as effect.** Option B changed the *definition*; it changed no
*result*: the three cells reach Level 3 under both judges. The value of activating it is
that the Level-4 endpoint is no longer saturated — for the first time a perfect model can
pass it — so a future training phase measured by it can register a genuine improvement.

---

## 11. Checkpoints unavailable

**None.** All three were present and evaluated: A `experiments/phase90/phase90-aligned.ckpt.json`
(73,605,758 B), B `experiments/phase94/phase94-b.ckpt.json` (27,951,440 B),
C `experiments/phase94/phase94-c.ckpt.json` (27,949,586 B). No result was fabricated or
interpolated, and the harness reports a missing checkpoint as missing and continues rather
than substituting anything.

Present but **deliberately not included**, as the spec requires:
`experiments/phase93/phase93-{b,c}.ckpt.json` (different `dModel`) and
`experiments/phase94/phase94-c.killed-20260913.ckpt.json` (the killed 09-13 C, different
init — would need an explicit `--eval-only` path and a different comparison).

---

## 12. Test results

`src/lib/minimind/research/tests/phase95-instrument-repair.test.ts`, registered in
`research/__tests__/run.ts` as `runPhase95Tests`.

| # | Contract | Result |
|---|---|---|
| 1 | `scanUtf8` crafted vectors: complete / trailing-incomplete (1, 2, 3 bytes) / interior error / bare continuation / illegal leads `80 C0 C1 F5 FF` / empty / "unfinished forever" exploit fails | **pass** |
| 2 | tolerant ⊇ strict on crafted vectors; the relaxation is strict | **pass** |
| 3 | tolerant rejects an out-of-range token id (D4), and its bytes alone scan clean (the trap) | **pass** |
| 4 | trailing-incomplete-only tolerated; interior error never forgiven, even with a cut after it | **pass** |
| 5 | `tokensToFirstInvalid`: `-1` sentinel, `0` at index 0, interior index, error *inside* a merged token, clean-but-cut | **pass** |
| 6 | `charIntegrityRate`: arithmetic, tail exclusion, empty denominator → 0 | **pass** |
| 6b | aggregation pools counts (10/11), demonstrably ≠ mean-of-ratios (0.95); per-prompt minimum | **pass** |
| 7 | determinism; no `Math.random` / `Date.now` / `setTimeout` in the metric code | **pass** |
| 8 | **oracle A1–A7** — tolerant exactly 100% for en/zh/mixed and `P_gate`; strict bound `< 0.15`; 0 decoder disagreements; 0 relaxation-order violations; 1496/1496 strict rejections are trailing cuts with 0 interior defects | **pass** |
| 11 | Level-4 still demands valid UTF-8; gate conditions and diagnostics disjoint; no numeric bar invented | **pass** |
| 11b | D3 regression guard — a leading orphan continuation byte stays invalid at token 0 | **pass** |
| 9/10 | artifact contracts: reload acceptance and strict/tolerant consistency per cell | **pass** |

`runPhase95StaticTests`: **11 passed, 0 failed, 0 skipped.**

Individual results were reproduced from the real deterministic bytes in every case. The
suite was written **before** Option B was applied to `levels.ts`, and it failed loudly on
the pre-repair condition — it is not a test that would pass against a broken repair. (Two
of *my own* assertions were initially wrong — a crafted vector that was accidentally valid,
and a regex that rejected the digit in `validUtf8TolerantRatio`; both were corrected in the
test, not worked around in the implementation.)

---

## 13. Limitations

1. **The oracle bounds the instrument, not the prompt set.** It uses corpus documents; only
   `太阳` appears verbatim. The 7.639% ceiling is an instrument property and must not be
   quoted as the five-prompt ceiling.
2. **`trainingDistribution.alignedTop1` / `alignedNll` were not re-derived** — their
   implementation is private to the Phase 94 harness, which this phase must not modify. No
   substitute value was invented; the reload gate rests on the parameter-overwrite proof and
   11 reproduced fields per cell instead.
3. **The `mixed` class is a single prompt.** It is 0.00 in every arm of Phases 92/93/94 and
   again here, so "mixed fails" is a one-sample statement. The 2/2/1 prompt granularity is a
   standing weakness, deliberately not changed (that would break comparability).
4. **`tokensToFirstInvalidMin` / `Mean` semantics were under-specified in the design.** The
   spec names the fields but not the treatment of the `-1` sentinel. They are implemented as
   the earliest / mean token index **among samples that actually carry an error**, else `-1`
   — the only reading under which "smaller is worse" and "`-1` is best" are both coherent —
   and `invalidSampleCount` is reported alongside so the population is unambiguous. This is
   a resolved ambiguity, not a hidden choice.
5. **The design's §4.1 table lists "empty generation" as strict-invalid / tolerant-valid.**
   The shipped strict semantics are `replacementCharCount === 0`, under which an empty
   continuation is strictly **valid** — that has always been true. The implementation
   follows the code (the source of truth) and the table's own stated intent ("tolerant
   validity is deliberately silent about emptiness"), and neither judge treats emptiness as
   a UTF-8 matter: emptiness is carried by the preserved `nonEmptyRatio === 1` gate
   condition. Recorded rather than silently reconciled.
6. **The D2 curve was never a gate.** The task premise said to stop using
   `utf8DegradationCurve` as a Level-4 capability gate; checked against the code, it is a
   diagnostic series inside the probe artifacts that `buildEvidence` never consumes. There
   was nothing to remove. It is documented (§7) and reproduced beside its replacement.
7. **Doc/impl mismatch recorded, not fixed** (`levels.ts`): the header documents Level 4 as
   requiring "CJK present for zh", but `everyAggregateCoherent` has **never** checked
   `cjkRatio`. Adding that clause now would *change* the gate, which this phase forbids. The
   discrepancy is now stated in the code and must be reconciled explicitly in a later phase.
8. **`evaluation/GenerationEvaluator.ts:288` forks the same `decode(generatedIds)`.** It is
   **not** the Level-4 SSOT: `buildEvidence` consumes only `capability-eval`, and
   `GenerationEvaluator` serves the UI and the research benchmark/experiment runners'
   before/after text. The spec lists it as must-not-touch, so it was left untouched; the
   separation is made explicit in a test rather than by editing it. If a later phase repairs
   it, it must share `utf8.ts` rather than grow a second metric definition.
9. **The tolerant judge is formally a relaxation** (a sample that was invalid can become
   valid). It is tightly bounded: at most **one** trailing, structurally well-formed,
   ≤3-byte unfinished sequence, with interior errors, leading orphan continuation bytes,
   illegal lead bytes and out-of-range ids all still failing — each covered by a test.
10. **No claim is made that the historical "Level 4 FAIL" of Phases 84–94 was dominated by
    the artifact.** For these three checkpoints the artifact was demonstrably *not* what
    bound. Whether it affected past conclusions about other checkpoints is unmeasured.

---

## 14. Recommendation for Phase 96

**The Level-4 endpoint is now usable.** Its 7.639% ceiling is gone, a perfect model passes
it 100% of the time, and — importantly — the endpoint still reports **Level 3** for the
current best checkpoints. So it is neither saturated nor satisfied: it can register
movement for the first time.

Concretely, Phase 96 should:

1. **Run the transfer experiment Phase 94 §13.1 identified**, now that the endpoint can
   discriminate: re-run the augmented arm with `s0 ∈ [1, 5]` matched to the evaluator's
   2–5 token prompts, at fixed `k = 8` — a one-constant change that isolates the
   prompt-regime mismatch Phase 94 flagged in advance. Do **not** scale the horizon; `k` was
   the dose that made things worse.
2. **Use the repaired gate as the primary endpoint and `charIntegrityRate` (pooled, per
   class) as the continuous secondary.** The binary gate cannot see the gradient this phase
   measured — `zh` integrity falls 0.7500 → 0.6842 → 0.5909 across A → B → C, i.e. the
   continuous metric is already sensitive where the gate is not.
3. **Do not add `charIntegrityRate` (or `tokensToFirstInvalid`) to the gate.** No threshold
   has been justified by evidence; inventing one now would be exactly the fabricated
   capability bar this phase forbade. Let Phase 96 measure first.
4. **Target the `zh`/`mixed` interior corruption directly.** The repair shows the failure is
   not the horizon: `en` is clean in every cell and even fluent in C, while `zh`/`mixed`
   corrupt from token 2–11 onward. That is a bilingual degradation signature, and it is the
   most concretely located problem the project now has.
5. **Leave the prompt set, sampling, temperature, horizon and objective alone in Phase 96**
   unless the transfer experiment itself is the variable under test.
6. **Then, and only with evidence, reconcile the two recorded inconsistencies** — the
   `cjkRatio` doc/impl mismatch and the single-sample `mixed` class. Neither should be
   changed silently.

---

## Appendix — artifacts and reproduction

| Artifact | Path |
|---|---|
| Design spec | `docs/superpowers/specs/2026-09-15-phase95-instrument-repair-design.md` (commit `df5645f`) |
| Shared scanner (production) | `src/lib/minimind/research/capability-eval/utf8.ts` |
| Contract suite | `src/lib/minimind/research/tests/phase95-instrument-repair.test.ts` |
| Re-evaluation harness | `experiments/phase95/probe.ts` |
| Launcher | `experiments/phase95/run-probe.cmd` |
| Results | `experiments/phase95/probe-results.json`, `experiments/phase95/candidate-{A,B,C}.json` |
| Audit harness (uncommitted, no `src/` import) | `experiments/phase95/audit-instrument-defects.ts`, `experiments/phase95/oracle-truncation-check.ts` |

Reproduce:

```
npx --yes tsx experiments/phase95/probe.ts          # zero training, ~4 min
npx --yes tsx src/lib/minimind/research/__tests__/run.ts
```

The harness performed **no training** and opened every checkpoint read-only. It re-derives
11 recorded Phase 94 fields per cell and reports any mismatch rather than overwriting or
absorbing it.
