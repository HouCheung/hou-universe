# Phase 96 — Augmentation Transfer Experiment

**Artifacts:** `experiments/phase96/` · **Tests:** `src/lib/minimind/research/tests/phase96-transfer-experiment.test.ts`
**Harness:** `experiments/phase96/probe.ts` (`--stage=smoke|preflight|train|eval|all`) · **Launcher:** `experiments/phase96/run-probe.cmd`
**Run:** one official run, seed 42, `PHASE96_EXIT=0` · **Checkpoint:** `experiments/phase96/phase96-treatment.ckpt.json`
**Provenance manifest:** `experiments/phase96/manifest.json` (written before the run; the test suite asserts manifest↔code agreement)

---

## 1. Research question

Does a small amount of **targeted** augmentation — enabled, fixed `k = 8`, rollout start `s0 ∈ [1,5]`, constructed to match the 2–5 token evaluation prompts — produce a **measurable improvement on the repaired Phase-95 generation endpoint**, with all other training and evaluation conditions fixed?

The measurement instrument is the Phase-95 Option-B endpoint (tolerant UTF-8 gate). The primary decision is the capability level that the **unchanged** Phase-95 classification logic returns.

---

## 2. Hypothesis

Phase 94 established that own-context rollout augmentation at `k = 8` with `s0 ∈ [8, 63-k]` **hurt** generation, dose-dependently (Outcome D). Phase 94 §13 item 1 recorded the untested hypothesis: the harm may have come from augmenting at rollout starts that are far longer than the 2–5 token prompts the capability endpoint actually uses, so the model was trained on a self-regime it is never evaluated in.

Phase 95 §14 item 1 adopted that as Phase 96's single change.

**H1 (transfer):** moving `s0` into `[1,5]` so the augmentation regime matches the evaluation regime will improve the repaired generation endpoint relative to the un-augmented baseline.

**H0 (no transfer):** the Phase 94 harm is not a regime-mismatch artifact and `s0 ∈ [1,5]` will not improve the endpoint.

The hypothesis is falsifiable and the outcome was not predetermined.

---

## 3. Experimental arms

| arm | key | k | s0 range | augmentation | trained | source |
|---|---|---|---|---|---|---|
| Baseline | `A` | 0 | — | **disabled** | no (reused) | `experiments/phase90/phase90-aligned.ckpt.json` (Phase 90 condition B) |
| Treatment | `T` | 8 | **[1,5]** | **enabled** (R=4) | **yes, by this phase** | trained by `probe.ts` |
| Isolation reference | `B94` | 8 | [8, 63-k] | enabled (R=4) | no (reused) | `experiments/phase94/phase94-b.ckpt.json` (Phase 94 cell B) |

`B94` is **not** a second baseline. It is reported as a one-constant isolation reference: `B94 → T` differs **only** in the `s0` range. The primary baseline is `A`, exactly as mandated (§5: reuse the Phase 94-defined baseline rather than recreating one).

All three arms were evaluated in this phase with the unchanged Phase-95 evaluator. No arm was retrained except `T`.

---

## 4. Frozen variables

Everything below was held fixed; only the augmentation `s0` range moved.

| item | value |
|---|---|
| Dataset | `bilingual` v`0.3.0`, schema 1, purpose `pretraining`, 600 docs (200 zh / 200 en / 200 mixed) |
| Tokenizer | `BPETokenizer`, vocab target 300, rebuilt deterministically (`Random.setSeed(42)` then `train(corpus, 300)`); **unmodified** |
| Model | `TensorMiniMindModel`, dModel 128, 4 heads, dFF 512, 4 layers, **1,126,528 params**; **unmodified** |
| Objective | masked corrected 1-step causal CE (Phase 89), document-aligned layout (Phase 90) |
| blockSize / batchSize / epochs | 64 / 4 / 20 (3000 optimizer steps = 20 × 150) |
| Optimizer / LR / WD | AdamW / 1e-3 / 0.01 |
| Scheduler / gradClip | cosine, 10% warmup → 1% min / 1.0 |
| Seed | 42 |
| Augmentation frequency | R = 4 (every 4th step) |
| Evaluation | Phase-95 evaluator **unchanged**, tolerant UTF-8 gate **active**, prompt set `phase90-5prompt-v1` (5 prompts), `maxTokens` 24, temperature 0.8, seed 42 |
| Rollout metric | greedy argmax next-token accuracy vs the true document, 60 docs × 24 steps |
| Memorization metric | `measureMemorization(model, tokenizer, corpus, 8)` |

Hard constraints honored: tokenizer implementation/vocabulary, dataset base contents, generation algorithm, prompt set, evaluation horizon, temperature, sampling parameters, rollout calculation, capability thresholds, Phase-95 tolerant semantics, `charIntegrityRate` and `tokensToFirstInvalid` definitions, and model architecture were all left untouched. No new Level-4 criterion was introduced. No second runtime or tokenizer exists. No `Math.random()`, no `setTimeout()` as an experiment mechanism, no hardcoded expected results, no shortened training, no silent optimizer/LR/batch/sequence/seed changes, no unrelated files committed.

---

## 5. Augmentation construction

Unchanged from the Phase 94 §4.1 mechanism, with two constants moved:

```
AUG_S0_MIN: 8 → 1        (the Phase 96 change)
AUG_S0_MAX: new cap 5    (the Phase 96 change; Phase 94 used 63-k)
k = 8                    (unchanged)
R = 4                    (unchanged)
```

Effective start position per document:

```
s0RangeFor(docLen, k) = { lo: 1, hi: min(5, blockSize-1-k, docLen-2-k) }
```

Each augmented window is the **true** document prefix `x[0..s0]` followed by the model's **own** greedy argmax tail (length ≤ `k`, produced under `Tensor.noGrad`), padded to `blockSize`. The CE targets remain the **true** document tokens aligned to the window; the own-tail is an integer input only, so gradients flow through the single forward pass and never through the rollout.

**Deterministic pre-training audit** (`experiments/phase96/audit-augmentation.ts` → `audit-augmentation.json`), run before full training on a small sample (4 batches × 4 windows = 16 windows, not a large random sample): 18 checks, `failed === 0`. It verifies `k = 8`; that the effective `s0` range is a subset of `[1,5]` for every document length 0..256; that drawn `s0` lie in range; that no example is skipped; window shape = `blockSize`; all ids in vocab; mask is a contiguous 1-prefix with 0 tail; the input opens with the true document prefix; the corpus is byte-identical before and after; document tokenizations unchanged; prompt set matches the manifest; horizon 24; and predicted counts (750 steps / 3000 windows / R=4) match the manifest. Same seed → same draw sequence and byte-identical inputs.

Observed `s0` distribution over the full 3000 augmented windows: `{"1": 591, "2": 641, "3": 576, "4": 594, "5": 598}` — all inside `[1,5]`, consistent with `Random.uniform` over `[lo, hi)`. `augSkipped = 0`. 598 of 600 documents admit the full `1..5` range; one admits `1..3` and one `1..4` (short documents).

---

## 6. Real training results

Real training, real measurements. `fakeTraining: false`; `augStepsMatchPrediction: true`.

| | **A** (baseline, reused) | **T** (treatment, this phase) | **B94** (isolation, reused) |
|---|---|---|---|
| steps | 3000 | **3000** | 3000 |
| duration | 6,816,180 ms (113.6 min) | **5,142,582 ms (85.7 min)** | 8,653,215 ms (144.2 min) |
| initial loss | 6.0273 | **5.977156484441439** | 5.977156484441439 |
| final loss | 0.1226 | **0.906595607595287** | 0.46315164842986567 |
| best loss | 0.1222 | **0.07985043822796872** | 0.06614856441371655 |
| max abs param Δ | 0.553579 | **0.4161454421412023** | 0.47679581587080455 |
| mean abs param Δ | 0.030231 | **0.029466385307062148** | 0.029388149389641533 |
| augmented steps | — (k=0) | **750** (predicted 750) | 750 |
| augmented windows | — | **3000** (predicted 3000) | 3000 |
| checkpoint | `experiments/phase90/phase90-aligned.ckpt.json` | **`experiments/phase96/phase96-treatment.ckpt.json`** | `experiments/phase94/phase94-b.ckpt.json` |

The treatment arm's per-epoch loss fell monotonically from 5.0838 (epoch 1) to 0.5023 (epoch 20) with a best of 0.0799. Two things are worth recording plainly:

- **The treatment's best loss (0.0799) is close to but not better than Phase 94 cell B's (0.0661)**, and better than the baseline's (0.1222).
- **The treatment's final loss (0.9066) is the worst of the three, and 11× its own best loss (0.0799).** The last epoch is far noisier than the best epoch. Augmented steps are, by construction, steps where the input is partly model-generated; a final epoch ending on a high-loss plateau is consistent with the augmented regime injecting self-generated noise, but this is an observation, not a proven mechanism.

The checkpoint was written **only after training completed successfully**. No partial artifact exists in the official result path. The Phase 94 killed-run checkpoint (`phase94-c.killed-20260913.ckpt.json`) was not touched and no historical checkpoint was overwritten.

---

## 7. Evaluation results

All three arms evaluated with the **unchanged** Phase-95 evaluator (`capability-eval`, tolerant default). Full detail: `arm-A.json`, `arm-T.json`, `arm-B94.json`, `probe-results.json`.

| metric (per language zh / en / mixed) | **A** | **T** | **B94** |
|---|---|---|---|
| **capability level** | **3** | **3** | **3** |
| tolerant UTF-8 ratio | 0.5 / 0.5 / 0 | **0 / 0.5 / 0** | 0.5 / 1 / 0 |
| strict UTF-8 ratio *(diagnostic)* | 0.5 / 0.5 / 0 | 0 / 0.5 / 0 | 0.5 / 1 / 0 |
| nonEmptyRatio | 1 / 1 / 1 | 1 / 1 / 1 | 1 / 1 / 1 |
| collapsedRatio | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| mergedTokenRatio | 0.5 / 1 / 1 | 1 / 1 / 1 | 0.5 / 1 / 1 |
| charIntegrityRate | 0.7500 / 0.9400 / 0.9310 | **0.7419 / 0.9608 / 0.8750** | 0.6842 / 1.0000 / 0.7222 |
| charIntegrity num/den | 15/20 · 47/50 · 27/29 | 23/31 · 49/51 · 14/16 | 13/19 · 55/55 · 13/18 |
| tokensToFirstInvalid (mean) | 11 / 6 / 4 | **10 / 7 / 12** | 2 / −1 / 3 |
| invalidSampleCount | 1 / 1 / 1 | 2 / 1 / 1 | 1 / 0 / 1 |
| memorization top-1 (262 preds, chance 0.00333) | 0.95802 | **0.94656** | 0.96183 |
| rollout mean accuracy (24 steps) | 0.118809 | **0.128531** | 0.106297 |
| rollout @ step 24 | 0.084746 | **0.084746** | 0.067797 |
| rollout @ step 1 | 0.35 | 0.366667 | 0.35 |

`trailingIncompleteCount = 0` for every language in every arm, so the tolerant forgiveness never triggered: **strict and tolerant agree exactly on all three arms.** This reproduces Phase 95's finding that the repair, while correct, does not move A/B/C — the surviving failures are mid-stream structural errors, not horizon truncation.

---

## 8. Baseline vs treatment comparison

### 8.1 `A → T` (the mandated primary contrast)

| metric | A | T | direction |
|---|---|---|---|
| capability level | 3 | 3 | **unchanged** |
| tolerant zh | 0.5 | 0 | **worse** |
| tolerant en | 0.5 | 0.5 | same |
| tolerant mixed | 0 | 0 | same |
| charIntegrity zh | 0.7500 | 0.7419 | slightly worse |
| charIntegrity en | 0.9400 | 0.9608 | better |
| charIntegrity mixed | 0.9310 | 0.8750 | **worse** |
| tokensToFirstInvalid zh | 11 | 10 | slightly worse |
| tokensToFirstInvalid en | 6 | 7 | better |
| tokensToFirstInvalid mixed | 4 | 12 | better |
| memorization top-1 | 0.95802 | 0.94656 | slightly worse |
| rollout mean | 0.118809 | 0.128531 | better |
| rollout @24 | 0.084746 | 0.084746 | **identical** |

Against the un-augmented baseline, the treatment is **not better on any sample-level or gate-level measure**, and is worse on the zh gate term. The pooled char-level and rollout differences are small and point in both directions.

### 8.2 `B94 → T` (the init-matched one-constant isolation)

| metric | B94 | T | direction |
|---|---|---|---|
| capability level | 3 | 3 | **unchanged** |
| tolerant en | 1 | 0.5 | **worse** |
| tolerant zh | 0.5 | 0 | **worse** |
| tolerant mixed | 0 | 0 | same |
| charIntegrity zh | 0.6842 | 0.7419 | better |
| charIntegrity mixed | 0.7222 | 0.8750 | better |
| charIntegrity en | 1.0000 | 0.9608 | worse |
| tokensToFirstInvalid zh | 2 | 10 | better |
| tokensToFirstInvalid mixed | 3 | 12 | **better** |
| tokensToFirstInvalid en | −1 (never invalid) | 7 | **worse** |
| rollout mean | 0.106297 | 0.128531 | better |
| rollout @24 | 0.067797 | 0.084746 | better |
| memorization top-1 | 0.96183 | 0.94656 | worse |

The treatment recovers a substantial part of the pooled char-level damage that Phase 94's `s0 ∈ [8,63-k]` caused — but it does so by moving **back toward the un-augmented baseline**, never beyond it. On `charIntegrityRate`, `T` sits between `B94` and `A` in both zh (0.6842 < 0.7419 < 0.7500) and mixed (0.7222 < 0.8750 < 0.9310).

### 8.3 The confound that must be stated

**`A` and `T` do not share an initialization.**

- Phase 90's own record for the baseline artifact: `initialLoss = 6.0273`.
- Phase 94 cell B and Phase 96 arm T: `initialLoss = 5.977156484441439` (reproduced independently by `--stage=preflight`).

`A → T` therefore varies **initialization and augmentation together** and is not a clean single-variable contrast. `B94 → T` is the only init-matched one-constant comparison in this experiment. The baseline was kept exactly as mandated rather than retrained, because retraining it would redefine the frozen Phase 94/95 baseline; the confound is disclosed here and recorded in the manifest at `initializationOrdering.baselineInitVariance`.

---

## 9. Primary endpoint result

**Primary endpoint:** the Phase-95 repaired capability level (tolerant UTF-8 gate). Decision rule unchanged: Level 4 requires `everyLanguageCoherent && mergedUsed`, where per-language coherence requires `validUtf8TolerantRatio === 1 && nonEmptyRatio === 1 && collapsedRatio === 0`.

| | baseline A | treatment T | isolation B94 |
|---|---|---|---|
| **level returned by the unchanged classifier** | **3** | **3** | **3** |
| `everyLanguageCoherent` | false | false | false |
| `mergedUsed` | true | true | true |
| **Level changed?** | — | **NO** | **NO** |

**The primary endpoint did not improve. The capability level is unchanged at Level 3.**

No language passes the tolerant coherence gate in any arm. The treatment reaches `tolerant zh = 0`, i.e. it has **no** fully-valid zh generation, where the baseline had one. `mergedUsed` is true for all three arms (`samples.some(s => s.usesMergedTokens)`), so it is not a discriminating term here and no arm made gate progress through it — `charIntegrityRate` and `tokensToFirstInvalid` remain non-gates, as §15 requires.

**No Level 4 is claimed.** The unchanged Phase-95 logic returns Level 3; no Phase-96-specific Level-4 criterion exists.

---

## 10. Secondary metric analysis

### 10.1 The sample-level denominators are tiny

The prompt set is 5 prompts (2 en, 2 zh, 1 mixed), one sample each at temperature 0.8. Per-language tolerant ratios therefore rest on **n = 2 (zh, en) and n = 1 (mixed)**. A single generation flipping validity moves a language's ratio by 0.5, and the mixed language's entire ratio by 1.0.

This is why §11 forbids confidence intervals here: the per-language tolerant ratios **cannot** support a precision claim, and the granularity must be stated rather than smoothed over.

### 10.2 The zh regression is one identifiable sample

Reading the generations directly:

| prompt | A | T | B94 |
|---|---|---|---|
| en `the sun rises` | `es over the quiet valleach morningse` ✅ | `es over the quiet valleach morninge e` ✅ | `es over the quiet valleach morningatt` ✅ |
| en `machine learning is` | `dean �小存储了改结��` ❌ | `raearn�计噚�练的讚定` ❌ | `tjearning 的中文是机器学习` ✅ |
| zh `太阳` | **`从山谷后面缓缓升` ✅** | **`从山��在�习�才数�` ❌** | **`从山谷后霷后面缓` ✅** |
| zh `机器学习是` | `个躦会掻��复连��的�` ❌ | ` tokenienen iz���罬一巩` ❌ | `一����点数�点抛�` ❌ |
| mixed `什么是 machine learning` | `？�all�ning 的 pitery 的 pateake` ❌ | `？轕arearnep�定多不�不` ❌ | `？��是 learning？澓���` ❌ |

The zh `太阳` prompt yields a clean memorized continuation in **both** `A` and `B94`, and garbage in `T`. That single generation is the entire `tolerant zh` regression (0.5 → 0) and it also explains `mergedTokenRatio zh` rising 0.5 → 1.0 in `T`: the sample that was lost was the *only* one in the arm whose tokens were all non-merged. The treatment arm's apparent movement toward the "uses learned vocab" condition is therefore an artifact of destroying a good generation, not evidence of learning. It is **not** a gate term, and it is not counted as progress.

### 10.3 `tokensToFirstInvalid` improving while `charIntegrityRate` worsens is not an improvement

For the mixed prompt, `tokensToFirstInvalid` rises `4 → 12` (A → T) while `charIntegrityRate` **falls** `0.9310 → 0.8750` and the character denominator falls `29 → 16`. The two metrics measure different things: `tokensToFirstInvalid` is where the first structural break occurs in the token stream; `charIntegrityRate` is the fraction of decoded characters that are not U+FFFD.

Together, the pair says the treatment's mixed continuation **breaks later but produces less text with a higher bad-character fraction** — shorter, proportionally dirtier output. Reading the `tokensToFirstInvalid` gain alone would be a misreading, and it is exactly the kind of single-metric reading §10 warns against.

### 10.4 Rollout

`rollout@24` is **identical** for `A` and `T` (0.0847457627118644). The mean-over-24 difference (0.118809 → 0.128531) amounts to ≈ 14 additional correct cells out of 24 × 60 = 1440 (≈ 1.0 pp) — small, and it does not survive to the endpoint, where the two arms are bit-identical. The degradation shape (step 1 ≈ 0.35 → step 24 ≈ 0.08) is the known Phase 94 curve and is unchanged in character.

### 10.5 Memorization

Memorization top-1 **fell** slightly (`0.95802 → 0.94656`, 262 predictions, chance 0.00333). Level 3 is retained in all arms. The treatment did not trade generation for memorization or vice versa — both were flat-to-slightly-worse, which rules out Outcome C.

### 10.6 Net secondary read

Across the secondary endpoints the movement is **sign-inconsistent**: 4 measures better, 5 worse, 3 unchanged against the baseline; and against the init-matched isolation, better on pooled char integrity and rollout but worse on both `en` and `zh` sample-level validity. Two of the "improvements" decompose into (a) *longer garbage*, and (b) *having destroyed the good sample*. No secondary improvement is both direction-consistent across arms and attributable to generation quality.

---

## 11. Reproducibility

| requirement | evidence |
|---|---|
| Same seed → same augmentation sequence | Audit: same seed produces a byte-identical draw sequence and byte-identical inputs; 18/18 checks pass |
| Same seed + manifest → same training initialization | `--stage=preflight` reproduces Phase 94's recorded `initialLoss = 5.977156484441439` **exactly**; `initMatchesPhase94: true` |
| Lossless checkpoint reload | `parameterOverwriteProven: true`, 39 named params compared, `allMatch: true`, `maxAbsDelta: 0` — verified for all three arms |
| Deterministic evaluation of a saved checkpoint | `evaluationDeterministic: true` on re-run — all three arms |
| Self-consistency of the run | 2 × fresh 2-epoch runs **bit-identical** (300 steps each) |

**The pre-`buildModel` reseed is a proven no-op, not an assumption.** `probe.ts` calls `Random.setSeed(SEED)` before the official `buildModel` (the Phase 90/94 fresh-run convention). This cannot perturb the init because `BPETokenizer` contains **no reference to `Random` at all** (grep-verified and asserted by test 8c), so `buildTokenizer()` sets the stream origin and consumes nothing. Independently: a first-50-weights hash of the model built with and without the reseed is identical, and preflight reproduces 5.977156484441439.

**Known global-RNG coupling limitations (reported, not papered over):**

1. `buildModel` does **not** reseed, so a model's init depends on the ambient global-RNG stream position. Phase 94 §12.5 / §13.4 flagged this. It is **deliberately not fixed** — fixing it would change the init and destroy the one-constant isolation against Phase 94 cell B. Recorded in the manifest as `NOT FIXED` and asserted by test 8b.
2. Consequently, bit-identity holds **between `T` and Phase 94 cells B/C**, but **not** between `T` and the Phase 90 baseline `A` (6.0273 vs 5.977156484441439). See §8.3.
3. Bit-identical reproducibility was demonstrated between two *2-epoch* runs inside one process. Two independent full 20-epoch runs in separate processes were **not** performed, so bit-identity of the full official run is **not** claimed.

---

## 12. Limitations

1. **The primary contrast is confounded.** `A → T` varies initialization and augmentation together (§8.3). Only `B94 → T` is init-matched. Any claim resting on `A → T` inherits this.
2. **Single-sample granularity.** 5 prompts × 1 sample. Per-language gate ratios rest on n = 1–2, so they cannot support precision or significance claims, and a one-sample flip moves a language by 0.5 (§10.1).
3. **One run, one seed.** Reported as a one-run experiment. No confidence intervals, no repeated trials, and no statistical replication are claimed; the 2 × 2-epoch check is a **determinism** check, not replication.
4. **`A` and `B94` were trained in earlier phases** with their own recorded durations and environments; their training rows are reused historical records, not re-measured here.
5. **`k = 8` and the own-context mechanism were inherited unchanged** from Phase 94. This phase tests `s0` only; it cannot separate "augmentation is harmful" from "this particular augmentation is harmful".
6. **The treatment's final-epoch loss is 11× its best** (§6). The official checkpoint is the end-of-training state, not the best-loss state, per the frozen recipe. A best-loss checkpoint might evaluate differently; that is untested.
7. **No evaluator defect was found.** The Phase-95 instrument behaved exactly as specified (`trailingIncompleteCount = 0`, strict ≡ tolerant). Per §18, had one been found the experiment would have been stopped and reported separately.

---

## 13. Scientific conclusion

**Outcome D — no meaningful movement / no transfer demonstrated.**

The primary endpoint is unchanged. The unchanged Phase-95 classifier returns **Level 3** for the baseline, the treatment, and the isolation reference. No language passes the tolerant coherence gate in the treatment arm, and the treatment is *worse* than the baseline on the zh gate term.

The secondary movement is real but does not constitute transfer:

- It is **sign-inconsistent** — better on some languages and metrics, worse on others, and the sign depends on which arm you compare against.
- Its two largest "gains" **decompose into non-gains**: `tokensToFirstInvalid mixed 4 → 12` comes with `charIntegrityRate mixed 0.9310 → 0.8750` and a *smaller* character denominator (longer-broken but shorter, dirtier output), and the `mergedTokenRatio zh 0.5 → 1.0` movement is caused by losing the arm's only clean zh generation.
- Its only clean directional result is **negative**: the `太阳` prompt produces a clean memorized continuation under both the baseline and Phase 94's augmented arm, and garbage under the treatment.
- `rollout@24` is **bit-identical** to the baseline.

Against the init-matched isolation reference, the treatment recovers much of the pooled char-level damage Phase 94 caused, but only **back toward the un-augmented baseline** — never past it. In both zh and mixed `charIntegrityRate`, `T` sits strictly between `B94` and `A`.

**Interpretation of H1/H0:** the Phase 94 §13.1 regime-mismatch hypothesis is **not supported**. Matching the augmentation start position to the 2–5 token evaluation prompts did not transfer to generation capability. It appears to have **reduced the harm** of augmentation without creating a benefit. The correct reading is that own-context rollout augmentation at `k = 8` is harmful *relative to no augmentation* under this recipe, and narrowing `s0` mitigates rather than reverses that — it does not make augmentation worth doing.

This is consistent with Phase 94's Outcome D and with Phase 95's finding that no A/B/C checkpoint flips level under the repaired instrument.

**Explicitly not claimed:** Level 4, "successful", "improvement", "partial transfer", or any transfer of generation capability. Training completing is not a result.

---

## 14. Phase-97 recommendation

Do **not** continue tuning `s0`, and do not raise `k`. Outcome D explicitly forbids blind parameter escalation, and this phase supplies the evidence for why: the whole `s0` sweep from `[8,63-k]` down to `[1,5]` moves the pooled char metrics monotonically back toward the un-augmented baseline without ever crossing it, which is the signature of an intervention whose best case is *doing no harm*.

Recommended next steps, in priority order:

1. **Test augmentation-off against augmentation-on at the capability endpoint with an init-matched baseline.** Before any further augmentation work, establish the clean single-variable contrast this phase could not: retrain a `k = 0` arm from the *same* init as `T` (5.977156484441439), so that `A` vs `T` stops conflating initialization with augmentation. This is the missing control, and it is the highest-value Phase 97 item.
2. **Attack the actual failure mode, which is mid-stream structural invalidity — not horizon truncation.** `trailingIncompleteCount = 0` everywhere and strict ≡ tolerant everywhere proves the Phase-95 repair, while correct, is not the binding constraint. Every surviving failure is an invalid byte produced *mid-generation*. That is a generation-quality problem, and augmentation of the own-rollout regime can only teach the model to imitate its own broken output.
3. **If augmentation is revisited, change the supervision target rather than the start position.** The current mechanism trains CE against true tokens but feeds model-generated input — the model is scored on predicting truth from its own errors, which at `k = 8` means 8 tokens of self-conditioning. A filtered variant (augment only where the own rollout is locally correct) would test whether *bad* own-context is the harm, rather than *any* own-context.
4. **Do not reduce the evaluation sample to 5 prompts for any future capability decision.** With n = 1–2 per language, a single generation flips a language's gate term by 0.5. A capability decision that a one-sample change can reverse is not a capability decision. Fixing the prompt-set size is arguably a prerequisite for trusting any Level-4 transition, and it is a change to the *evaluation*, not to the frozen Phase-95 semantics.

Item 4 is the one that most limits everything above it: with the current prompt set, a real transfer and a one-sample accident are indistinguishable.

---

*Phase 96 — Augmentation Transfer Experiment. One official run, seed 42. Training and evaluation artifacts in `experiments/phase96/`. Not committed.*
