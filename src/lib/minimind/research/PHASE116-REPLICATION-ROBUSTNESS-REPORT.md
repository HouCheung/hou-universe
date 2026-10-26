# Phase 116 — Replication and Robustness of Closed-Domain Paraphrase Transfer

**Status:** Experiment complete. Training, evaluation, aggregation, focused tests, and production build finished.
**Date:** 2026-10-21
**Predeclared primary endpoint:** Category B exact match on the final snapshot, denominator 64, on a newly frozen independent fact set.
**Verdict:** **Grade B — Partially reproducible / seed-sensitive.** Transfer above the baseline is reproducible in aggregate across three seeds, but the predeclared Grade A condition is narrowly missed because only 9 of 16 facts show at least one Category B success in *every* seed (Grade A requires 10).
**Scope disclaimer:** This is a 1.1M-parameter, byte-level, closed-domain fact-answering probe. Nothing in this report supports describing the model as a general-purpose chatbot.

---

## 1. Summary of measured results

### 1.1 Contamination baseline (untouched Phase 114 final checkpoint)

| Metric | Result |
|---|---|
| Category A (seen phrasing) | 0 / 96 |
| Category B (unseen phrasing of a trained fact) | **0 / 64** |
| Category C (fact absent from training) | 0 / 36 |
| UTF-8 enforced on every item | true |
| Context truncations | 0 |
| Error stops | 0 |

The baseline answers no Category B item exactly, so the predeclared contamination gate passes.

### 1.2 Primary runs — final snapshot (step 384), identical 196 prompts

| Seed | A exact | **B exact (primary)** | C exact | B English | B Chinese | B token F1 | B EOS stop | B empty |
|---|---|---|---|---|---|---|---|---|
| 42 | 95/96 | **20/64 (31.3%)** | 0/36 | 4/32 | 16/32 | 0.4326 | 0.984 | 0 |
| 43 | 96/96 | **19/64 (29.7%)** | 0/36 | 5/32 | 14/32 | 0.4473 | 1.000 | 0 |
| 44 | 93/96 | **19/64 (29.7%)** | 0/36 | 3/32 | 16/32 | 0.4021 | 0.984 | 0 |

Seed spread in the primary metric: **1 / 64** (19 to 20).

### 1.3 Best-validation snapshot (step 96), identical 196 prompts

| Seed | A exact | B exact | C exact |
|---|---|---|---|
| 42 | 54/96 | 8/64 | 0/36 |
| 43 | 57/96 | 9/64 | 0/36 |
| 44 | 59/96 | 7/64 | 0/36 |

The "best-validation" snapshot selected by teacher-forced validation loss is markedly worse at generation than the final snapshot in every seed. This is a checkpoint-selection finding, not evidence about transfer.

### 1.4 Supplementary reseed on the frozen Phase 115 dataset

| Run | A | B | C |
|---|---|---|---|
| Phase 115 original (seed 42) | 71/72 | 25/48 | 0/24 |
| Phase 116 supplementary, seed 43 | 72/72 | **29/48** | 0/24 |
| Phase 116 supplementary, seed 44 | 71/72 | **27/48** | 0/24 |

The Phase 115 result reproduces under two new DataLoader seeds.

### 1.5 Decision rule outcome

| Rule input | Value |
|---|---|
| Seeds completed / interpretable | 3 / 3 |
| Baseline Category B | 0 |
| Seeds with B ≥ 13/64 | 3 of 3 |
| Category B result in both languages in every seed | yes |
| Facts with ≥ 1 Category B success in every seed | **9 / 16** (Grade A needs ≥ 10) |
| Seed spread | 1 / 64 (limit ≤ 16) |
| **Grade** | **B — Partially reproducible / seed-sensitive** |

The grade is computed mechanically from the rule frozen before any candidate existed (`decision-rule.json`, SHA-256 `6c69f30d…`).

---

## 2. Audit of the Phase 115 protocol

Everything in this section was read from the preserved Phase 115 artifacts. No Phase 115 file was modified; see §11.

### 2.1 Inputs and fingerprints (all re-verified before Phase 116 training)

| Artifact | SHA-256 |
|---|---|
| Phase 114 final checkpoint | `62e8ff3c4a865171b300336c34b7a99b9a9336dd13f826c50995f2e74e78db1a` |
| Phase 115 source dataset | `f2fadb9b0e43f1b9c0e71cc7fd244dac399a65e417c109f906ab35b9d56799f6` |
| Phase 115 training dataset | `9cf0f9d24d48df2fdafc369324f32968ec96aa7d01f7e0d14d10960700b22c28` |
| Phase 115 evaluation manifest | `264738130e2edba7b881a3cc0f0b2c596f25b6e7cf092d3d72d3c7c0c074aef3` |
| Phase 115 decision rule | `baee90c99a9aa239f3043f27833d8fc394116abdaada44a26c21f867a2db3ec5` |
| Phase 115 best checkpoint | `56236e5bbfd0042c9a60c3a9f66735bba5bbce53e687cfa3db57a13fa83e5775` |
| Phase 115 final checkpoint | `5437f4e47e4a0ab0e54844ade2d7544c14f7020b09d81fcb7dfd9191c3d4a98d` |
| Tokenizer fingerprint | `a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d` |

### 2.2 Dataset construction

- 20 facts: 12 train, 4 validation, 4 test; 168 phrasings.
- 144 evaluation items: A 72 (seen prompts), B 48 (unseen paraphrases of trained facts), C 24 (unseen facts).
- Category A is exactly the training prompt set. Category B/C had zero exact and normalized prompt or pair overlap with training at freeze time.
- Answers are short canonical strings, one per fact per language.

### 2.3 Training configuration

Seed 42; block size 128; batch 4; 16 epochs; 288 steps; AdamW (0.9/0.999, eps 1e-8, weight decay 0.01); gradient clip 1.0; cosine schedule 5e-4 → 5e-5; warmup 28 steps; assistant-only masked cross-entropy plus EOS supervision; no dropout; model initialized from the Phase 114 final checkpoint.

### 2.4 Snapshot selection and evaluation

- Candidates checked at steps 72, 144, 216, 288.
- "Best" = lowest teacher-forced validation loss among candidates and initialization. In Phase 115 the best was step 144; final was step 288.
- Baseline, best, and final were evaluated on the identical 144-prompt manifest (`264738130e…` in all three result files).
- Decoding: greedy (temperature 0), topK 40, topP 0.9, seed 42, maxTokens 40, EOS id 3, UTF-8 enforcement on, 128-token context.

### 2.5 Limitations and inconsistencies recorded before Phase 116

These were recorded as audit findings. Phase 115 data was not altered.

1. **One seed only.** Phase 115 could not distinguish a stable capability from a favourable batch order.
2. **Seed scope is narrow.** `BatchSampler` reseeds with the same seed every epoch, so a seed selects one permutation that is repeated for all 16 epochs. It does not represent independent retraining draws.
3. **"Best-validation" does not track generation.** Phase 115 best (step 144) scored A 55/72, B 23/48; final (step 288) scored A 71/72, B 25/48. The teacher-forced validation loss is not a proxy for greedy generation quality.
4. **Some Phase 115 paraphrases are lexically superficial.** Recomputing the same overlap metric used in Phase 116: Phase 115's 48 B items have mean maximum Jaccard 0.487, maximum 1.000; 8 items reach ≥ 0.70 and 3 items have an identical token set to a seen prompt (word-order permutations). Phase 116 excludes such items by construction.
5. **Small, hand-authored fact set.** 12 trained facts; no independent authorship process beyond the single author.
6. **No positional encoding** in the model; word-order-only changes are therefore near-identical inputs.
7. **Exploratory lexical-overlap analysis** in Phase 115 had no predeclared covariate.

---

## 3. Phase 116 independent dataset

### 3.1 Fact set

26 facts, each authored before any variant, with stable IDs and canonical answers:

- **Train (16):** `p116-t01`…`t16` — Oslo, Lisbon, Bangkok, Nile, Venus, Neptune, one moon, ostrich, cheetah, liver, Fe, Ag, nitrogen, six sides, ninety degrees, four strings.
- **Validation (4):** `p116-v01`…`v04` — Buenos Aires, four chambers, 366 days, twenty-six letters.
- **Test / Category C (6):** `p116-s01`…`s06` — Seoul, Greenland, K, whale shark, twelve edges, seven months.

Every fact has an English and a Chinese canonical answer. Answers are unique within each language across the whole set.

### 3.2 Split and phrasing construction

- Splits were assigned by fact ID **before** any phrasing was written.
- Each train fact has 3 seen phrasings and 2 unseen paraphrases per language (10 phrasings per fact); validation and test facts have 3 phrasings per language.
- 220 phrasings total.
- Unseen paraphrases were rewritten to avoid word-order-only permutations: after revision, the maximum B-to-A token/bigram Jaccard is **0.60**, mean 0.30, and **zero** pairs reach 0.70.
- No Phase 115 example was copied or adapted. The whole fact set was rewritten once before freeze after the cross-phase audit found contamination with the Phase 113/114 corpus.

### 3.3 Derived manifests

| Artifact | Count |
|---|---|
| Training samples | 96 (16 facts × 6 seen phrasings) |
| Validation samples | 24 (4 facts × 6 phrasings) |
| Evaluation items | 196 |
| A | 96 (16 facts × 6 seen) |
| B | 64 (16 facts × 4 unseen: 2 en + 2 zh) |
| C | 36 (6 facts × 6 phrasings) |
| Max prompt tokens | 73 |
| Max sequence tokens | 83 |

The evaluation set was frozen before any training or candidate evaluation (`freeze-manifest.json`).

---

## 4. Leakage and answer-consistency audit

The build-time audit passed with zero issues (`dataset-audit.json`, `leakage-report.json`):

- Category A has exactly 96 items and equals the training prompt set.
- Category B/C: 0 exact and 0 normalized prompt overlaps; 0 exact and 0 normalized prompt-answer pair overlaps.
- Fact-ID leakage: none.
- Category C answer leakage into training: none.
- Category C near-duplicates of training prompts (Jaccard ≥ 0.8): none.
- Fact splits disjoint: yes.
- Cross-phase overlap with Phase 115: 0 exact/normalized prompts and 0 exact/normalized answers.
- Cross-phase overlap with the Phase 113/114 chat-SFT corpus: 0 exact/normalized prompts and 0 exact/normalized answers.

A human-readable ambiguity audit (`ambiguity-audit.json`) records every fact's canonical answer and a `none` ambiguity judgement, plus the limitation that the audit is a single-author judgement.

---

## 5. Training protocol and determinism

Fixed across all three primary runs: dataset, split, tokenizer (seed 42), architecture, prompt template, assistant-only loss mask, EOS supervision, optimizer, schedule, batch size, 16 epochs (384 steps), decoding, and evaluation manifest.

Only the DataLoader shuffle seed varies: 42, 43, 44. Every run starts from the identical Phase 114 final checkpoint (`62e8ff…`), verified before training.

| Seed | Duration | Initial val loss | Best step | Best val loss | Final step | Final val loss | Train seq-exact (final) |
|---|---|---|---|---|---|---|---|
| 42 | 2400 s | 4.946632 | 96 | 4.675002 | 384 | 5.062610 | 94/96 |
| 43 | 2413 s | 4.946632 | 96 | 4.620581 | 384 | 5.060310 | 96/96 |
| 44 | 2390 s | 4.946632 | 96 | 4.758529 | 384 | 5.035919 | 93/96 |

Validation loss rises monotonically after the first quarter in every seed (e.g. seed 42: 4.675 → 5.016 → 4.991 → 5.063), while teacher-forced training accuracy approaches 100%. The retained "best" snapshot is therefore an early, under-trained model.

**Nondeterminism identified:** the batch permutation is the only stochastic element. There is no dropout, no random initialization, and greedy decoding. Because the sampler reseeds with the same seed on every epoch, each run repeats one permutation; seed replication therefore tests a narrow source of variation, not full retraining randomness.

---

## 6. Primary evaluation

All snapshots were evaluated on the identical frozen 196-item manifest; the contract test verifies the manifest hash matches the baseline for every run.

### 6.1 Category A, B, C exact match

Final (primary):

| Seed | A | B | C |
|---|---|---|---|
| 42 | 95/96 | 20/64 | 0/36 |
| 43 | 96/96 | 19/64 | 0/36 |
| 44 | 93/96 | 19/64 | 0/36 |

Best-validation:

| Seed | A | B | C |
|---|---|---|---|
| 42 | 54/96 | 8/64 | 0/36 |
| 43 | 57/96 | 9/64 | 0/36 |
| 44 | 59/96 | 7/64 | 0/36 |

### 6.2 Token F1, EOS, empty outputs (final snapshot)

| Seed | Overall F1 | A F1 | B F1 | C F1 | Overall EOS | B EOS | Empty outputs |
|---|---|---|---|---|---|---|---|
| 42 | 0.6546 | 0.990 | 0.4326 | 0.156 | 0.985 | 0.984 | 0 |
| 43 | 0.6640 | 1.000 | 0.4473 | 0.153 | 1.000 | 1.000 | 0 |
| 44 | 0.6391 | 0.984 | 0.4021 | 0.140 | 0.985 | 0.984 | 0 |

EOS stopping and UTF-8 validity are near-perfect in every run; they are reported only as formatting diagnostics and are never treated as evidence of correctness.

### 6.3 By language (Category B, final)

| Seed | English | Chinese |
|---|---|---|
| 42 | 4/32 | 16/32 |
| 43 | 5/32 | 14/32 |
| 44 | 3/32 | 16/32 |

English B accuracy is low in every seed. Chinese B accuracy is roughly 3–5× higher. This asymmetry is consistent and was not predeclared as a hypothesis.

### 6.4 Per fact (Category B, final; columns are seeds 42 / 43 / 44)

| Fact | Topic | Seed 42 | Seed 43 | Seed 44 | Success in every seed? |
|---|---|---|---|---|---|
| t01 | Oslo | 1/4 | 1/4 | 1/4 | yes |
| t02 | Lisbon | 0/4 | 0/4 | 0/4 | no |
| t03 | Bangkok | 1/4 | 0/4 | 1/4 | no |
| t04 | Nile | 3/4 | 3/4 | 3/4 | yes |
| t05 | Venus | 0/4 | 1/4 | 1/4 | no |
| t06 | Neptune | 1/4 | 1/4 | 1/4 | yes |
| t07 | one moon | 0/4 | 0/4 | 0/4 | no |
| t08 | ostrich | 2/4 | 1/4 | 2/4 | yes |
| t09 | cheetah | 1/4 | 0/4 | 0/4 | no |
| t10 | liver | 0/4 | 0/4 | 1/4 | no |
| t11 | Fe | 3/4 | 4/4 | 3/4 | yes |
| t12 | Ag | 2/4 | 3/4 | 1/4 | yes |
| t13 | nitrogen | 1/4 | 1/4 | 1/4 | yes |
| t14 | six sides | 0/4 | 0/4 | 0/4 | no |
| t15 | ninety degrees | 2/4 | 1/4 | 1/4 | yes |
| t16 | four strings | 3/4 | 3/4 | 3/4 | yes |

- Facts with ≥ 1 B success: seed 42 **11/16**, seed 43 **10/16**, seed 44 **12/16**.
- Facts with ≥ 1 B success in every seed: **9/16** (t01, t04, t06, t08, t11, t12, t13, t15, t16).
- Facts with all four B items correct: 0, 1 (t11), 0.
- Facts with no B success in any seed: t02 (Lisbon), t07 (one moon), t14 (six sides).
- Items ever correct across seeds: **25/64**; items correct in all three seeds: **14/64** (11 of them Chinese). English: 6/32 ever, 3/32 always. Chinese: 19/32 ever, 11/32 always.

### 6.5 Representative outputs

Successes:

- `p116-t01-zh-5` → 奥斯陆。 (gold 奥斯陆。)
- `p116-t03-zh-4` → 曼谷。
- `p116-t04-en-4` → Nile. (seed 43)

Failures:

- `p116-t01-en-4` gold Oslo → `Nilo.` (seed 43); `Nilo` is a trained answer for the Nile fact (t04).
- `p116-t01-en-5` gold Oslo → `N.` / `Ne.` (truncated Neptune-like output).
- `p116-t01-zh-4` gold 奥斯陆。 → `六曛氮豂` / `六海玥斯陆。` — UTF-8-valid but meaningless character sequences, mixing fragments from other trained answers ("六…" appears in the six-sides answer).

The pattern is consistent with fluent answer-form recall, partial fact confusion within the trained answer set, and no generalization to untrained facts.

---

## 7. Uncertainty

Method (predeclared in `decision-rule.json` and implemented in `summarize.ts`): fact-clustered nonparametric bootstrap. Each of 10,000 replicates resamples the 16 train facts with replacement, counting all four B items of each drawn fact. The pooled interval resamples facts once and averages the three seeds' accuracy on that draw. Percentile 95% intervals; bootstrap seed 20261021.

| Estimate | Point | 95% interval |
|---|---|---|
| Seed 42 B accuracy | 0.3125 | 0.188 – 0.453 |
| Seed 43 B accuracy | 0.2969 | 0.156 – 0.469 |
| Seed 44 B accuracy | 0.2969 | 0.172 – 0.422 |
| Pooled seed-average | 0.3021 | 0.177 – 0.443 |

Limitations:

- The 16 facts are treated as exchangeable, but they differ substantially in difficulty.
- Four items per fact are correlated; the interval reflects fact clustering, not prompt-level noise.
- With 16 clusters the interval is itself imprecise and is descriptive, not a significance test.
- The three seeds vary only in batch order, so this interval describes reproducibility under that narrow perturbation, not under independent retraining.

---

## 8. Lexical-overlap covariate

The covariate was computed from the frozen source before any candidate existed (`lexical-overlap.json`, 64 items). It measures the maximum Jaccard overlap between each B prompt and the three seen prompts of the same fact and language. English uses word tokens; Chinese uses adjacent-character bigrams.

- English mean 0.3215, Chinese mean 0.2785, maximum 0.6000; no pair ≥ 0.70.
- Pooled across the three seeds: correct B items mean overlap **0.347**, incorrect **0.280**; item-level point-biserial correlation **0.282**.
- This is descriptive. Items with more lexical overlap with a seen prompt are somewhat more likely to be answered exactly; the correlation does not establish a causal mechanism, and overlap was not used to select items.

### 8.1 The Phase 115 comparison in light of overlap

Phase 115's 48 B items have mean maximum overlap 0.487, maximum 1.000, with 8 items ≥ 0.70 and 3 identical token sets. In the Phase 115 supplementary reseeds, those high-overlap items are answered far more often than the rest:

| Supplementary run | B items < 0.70 overlap | B items ≥ 0.70 overlap |
|---|---|---|
| Phase 115, seed 43 | 22/40 | 7/8 |
| Phase 115, seed 44 | 21/40 | 6/8 |

Phase 116's raw B rate (19–20/64) is lower than Phase 115's (25–29/48), but the two datasets are not exchangeable: Phase 115 contains lexically near-duplicate items that Phase 116 excludes by design. Raw differences therefore cannot be read as a causal effect of dataset change. Even restricted to the < 0.70 stratum, the Phase 115 reseeds (52–55%) remain above Phase 116 (30%), so overlap alone does not explain the gap; fact difficulty and paraphrase style also differ.

---

## 9. Supplementary replication on the frozen Phase 115 dataset

The Phase 115 dataset, split, and manifest were used unchanged; only the DataLoader seed changed. Outputs are under `experiments/phase116/supplementary/` and were evaluated with the Phase 115 manifest. No Phase 115 artifact was written or altered.

| Seed | Snapshot | A | B | C | B en | B zh |
|---|---|---|---|---|---|---|
| 43 | best (step 72) | 39/72 | 14/48 | 0/24 | 6/24 | 8/24 |
| 43 | final (288) | 72/72 | **29/48** | 0/24 | 12/24 | 17/24 |
| 44 | best (step 72) | 44/72 | 13/48 | 0/24 | 3/24 | 10/24 |
| 44 | final (288) | 71/72 | **27/48** | 0/24 | 9/24 | 18/24 |

Phase 115's original seed-42 run reported 25/48 final and 23/48 best. The two reseeds bracket and slightly exceed that level, so the Phase 115 finding is reproducible in direction and magnitude under new batch orders. The same best-vs-final gap recurs (early teacher-forced minimum is poor at generation). The Chinese > English asymmetry also recurs.

---

## 10. Decision-rule application and interpretation

### 10.1 Applied rule

All three seeds completed and were interpretable: each has A ≥ 64/96 and passes the integrity gate (UTF-8 enforced everywhere, zero truncations, zero error stops). The baseline answers no B item. All three seeds exceed 13/64 (20, 19, 19). Both languages have at least one B success in every seed. Seed spread is 1/64, far below the 16/64 limit. The only failed Grade A condition is fact stability: 9 facts succeed in every seed versus the required 10.

Since Grade A is not met, at least 2 seeds meet 13/64, and at least 8 facts are stable, the rule assigns **Grade B**.

### 10.2 What the evidence supports

- **Reproducible above-baseline paraphrase transfer.** The untouched baseline is 0/64. All three seeds reach 19–20/64 with a spread of 1/64, and all three show successes in both languages. This is not a single-run fluke at the aggregate level.
- **Item-level reproducibility.** 14 of 64 B items are correct in every seed, and 25 are correct at least once. The aggregate stability is carried by a stable subset of items.
- **No transfer to untrained facts.** Category C is 0/36 in every seed, matching Phase 115's 0/24. Nothing here supports generalization beyond trained facts.
- **The Phase 115 result replicates** on its own frozen dataset under new seeds (29/48 and 27/48).

### 10.3 What the evidence does not support

- **Grade A "Reproducible"** under the predeclared definition. Fact-level stability falls one fact short.
- **A claim of general paraphrase understanding.** Success is partial, concentrated in Chinese, correlated with lexical overlap, and accompanied by fact confusion among trained answers.
- **A claim of semantic generalization.** The model recalls answer forms; it does not answer new facts.
- **"Best-validation" as the strongest snapshot.** The predeclared best-by-validation-loss checkpoint is clearly worse at generation than the final checkpoint in all five Phase 116 training runs.
- **Any significance claim.** The intervals are wide and descriptive; the seeds are not independent retraining draws.

### 10.4 Interpretation

The most defensible reading is: **paraphrase transfer is real but partial and item-, fact-, and language-dependent.** The model learns to emit the correct canonical answer for a subset of unseen formulations of trained facts, reliably above a zero baseline. Whether a given fact transfers is stable across these seeds (9 facts always transfer, 3 never do, 4 are seed-sensitive), so the dominant variation is fact difficulty rather than batch order. The Grade B label reflects the strict predeclared fact-stability threshold, not large seed-to-seed swings; the seed spread is only 1/64.

The English/Chinese asymmetry and the overlap correlation suggest that part of the effect is form-level recall aided by shared surface material, not paraphrase-invariant factual binding. This is an interpretation, not a measured mechanism.

---

## 11. Threats to validity and limitations

1. **Sixteen train facts.** Small for fact-level inference; one fact changes the Grade A/B boundary.
2. **Seeds are batch orders, not independent runs.** The sampler repeats one permutation per epoch, and model initialization is fixed. The observed spread of 1/64 is therefore a lower bound on genuine retraining variability.
3. **Single author.** Facts, paraphrases, and ambiguity judgments were authored by one person; "independent" here means independent of Phase 115, not independently authored by multiple people.
4. **No positional encoding.** Word order is invisible to the model; paraphrases were screened for word-order-only redundancy, but deeper syntactic paraphrase cannot be distinguished from lexical substitution.
5. **Teacher-forced checkpoint selection is misaligned with generation.** This affected which snapshot is called "best" but not the primary final-snapshot endpoint.
6. **Overlap metric is lexical.** Jaccard on word tokens / character bigrams is a crude proxy for paraphrase distance.
7. **Greedy single-sample decoding.** No sampling variance is measured; exact match is a strict metric that ignores semantically equivalent variants.
8. **One architecture, one tokenizer, one dataset.** Results do not generalize to other models or corpora.
9. **Frozen canonical answers.** A correct answer phrased differently is counted wrong; token F1 is reported alongside exact match but is not the primary endpoint.

---

## 12. Engineering verification

- **Focused contract tests:** `src/lib/minimind/research/tests/phase116-replication.test.ts` — **47 passed, 0 failed, 0 skipped**. Covers dataset counts, leakage, cross-phase isolation, paraphrase-overlap thresholds, freeze hashes, manifest identity across all evaluations, decision-rule consistency, and historical artifact hashes.
- **Type check:** no TypeScript errors in any Phase 116 file. (The repository has pre-existing type errors in older test files; none were introduced or modified here.)
- **Production build:** `npm run build` exits **0**, "Compiled successfully". Zero warnings or errors from any Phase 116 file. The build reports 178 pre-existing lint warnings in unrelated historical test files; fixing them would require prohibited unrelated refactoring.
- **Destructive historical suites were not run.** Only the focused Phase 116 suite and the build were executed.

---

## 13. Deviations, integrity, and preserved artifacts

### 13.1 Historical artifacts

`historical-integrity.ts` re-hashes 20 files across Phase 113, 114, and 115 before and after the experiment. Result: **20 unchanged, 0 changed**. The Phase 115 report and verdict were not edited. No `git reset`, `git clean`, `git add -A`, commit, or push was used.

### 13.2 Deviations from the Phase 115 schedule

- 96 training samples instead of 72 → 24 batches/epoch × 16 epochs = **384 steps** (Phase 115: 288). The epoch count and all other hyperparameters are unchanged; the step budget scales with dataset size.
- Candidate checks at steps 96/192/288/384 (quarter points) instead of 72/144/216/288, and log interval 96 instead of 72, preserving the quarter-step check pattern.
- Evaluation prompt limit retained at 88 tokens; the Phase 116 maximum is 73.
- The fact set was rewritten once **before** freeze: the first draft had prompt/answer contamination with the Phase 113/114 corpus and several near-word-order-only B paraphrases. Post-freeze, nothing changed; the contract test re-verifies every frozen hash.
- The supplementary Phase 115 reseeds store outputs only under `experiments/phase116/supplementary/`.

### 13.3 What was not done

- No architecture, tokenizer, prompt-format, or decoding changes.
- No per-seed hyperparameter tuning.
- No evaluation-set change after any result was observed.
- No UI, backend, or unrelated refactoring.
- No new training framework; `train-core.ts` is the Phase 115 trainer with the seed lifted into a parameter.

---

## 14. Artifacts and I/O hashes

All paths are relative to the repository root.

### 14.1 Frozen inputs

| File | SHA-256 |
|---|---|
| `experiments/phase116/dataset.source.json` | `535ba575732f62e912e46cca686734c3e8aa57f62d4d68f3a874b00fea0b7de9` |
| `experiments/phase116/ambiguity-audit.json` | `7ecc9371b7f6166467e51a1631cc742a13a0d93edd2168a3c01101bf7397e245` |
| `experiments/phase116/training-sft.json` | `989fe240539c096b1b8146d8307f897aa906cc7312dad89b68cae08e3f17a27c` |
| `experiments/phase116/eval-manifest.json` | `07b95fbec6f1c1ac948770cf97ea675161a961f76da781089cd4a94642d829b8` |
| `experiments/phase116/validation-manifest.json` | `cff04ad40ce285263af7cb90448224a837ee0d059e54fab4537898f14661d1cf` |
| `experiments/phase116/leakage-report.json` | `da52bbd08e9ba3c3fac9dcebb00dddf637f1f9cb40a3415ded1566a887e03429` |
| `experiments/phase116/dataset-audit.json` | `37a80b18a399a7a6283bb2b55ec44ce913c2e66e3692e48eef594cd05c9b3816` |
| `experiments/phase116/split-manifest.json` | `ad63fd0793e09b12c4b894c6c24c941dfb0be06fe9996a12867b50c1c21df238` |
| `experiments/phase116/decision-rule.json` | `6c69f30d3dc2f373934e6c4fb397ce5276550d2ca64f8b42c0aa66d33f693c02` |
| `experiments/phase116/lexical-overlap.json` | `520d71b673ba53b4c4c6f90d95d33c7d5c8d6967bdf4fd3143540342e69c3aa6` |
| `experiments/phase116/freeze-manifest.json` | `74159aff9d3b2ae7351612fff0bec5cc548cc18c8d0a6b8b1fa722b0e0c04355` |

### 14.2 Retained checkpoints and evaluations

| File | SHA-256 |
|---|---|
| `seed-42/best.ckpt.json` | `b9eb34a9ec888c61457e3a412f88bcb035b54cca899302d74b897b4cb23e6442` |
| `seed-42/final.ckpt.json` | `78ef294517f204c60e6efb4426f3c27bbfd58ad3d124f64055d7ff51a2945483` |
| `seed-42/eval-best.json` | `2c350acc228d968451949547e0845a0b519afae528ea6cb8c76fd55fc3aa3358` |
| `seed-42/eval-final.json` | `e4223330f171669fc9852d72504c4b5211b3d92cb0089f30216d401e398c45ef` |
| `seed-43/best.ckpt.json` | `faafe2d76eb5bd7cc2b03232a2454b315390a6fbfeef3da587d0d6245dcf7a56` |
| `seed-43/final.ckpt.json` | `57e2930867faf37d3657d6dfd2c4157183a9814039714e6fe6ec164c597b4172` |
| `seed-43/eval-best.json` | `9ee80687ee20284c8393082b8d1643f25c4f35138a8ceee391a63f8fa32842f0` |
| `seed-43/eval-final.json` | `1bf453720f818cdec7800f0707b33f88a248b31bd1bf00ffce8010ce2a5d7ea2` |
| `seed-44/best.ckpt.json` | `095522146e4a1ab3a79994d9a46d452c20355b0b4e5ab17d8656468e7ce4a676` |
| `seed-44/final.ckpt.json` | `6195bd1d7403e5dc3deeb1c8ce9ba24b34fe470c61ad683b608e43607e31df87` |
| `seed-44/eval-best.json` | `69cbedb5eafb4a752d9a9d12b89ecf60d88d789e37ce42266a138baf6ab77557` |
| `seed-44/eval-final.json` | `3da1850e4271c152a76764dc38c66ea627fe11390f26ed032a8b292388ff1db9` |
| `supplementary/p115-seed-43/final.ckpt.json` | `afd74ad725b5839366a12ef799750352308436404dbad2915963953a1d54711a` |
| `supplementary/p115-seed-43/eval-final.json` | `fca862f2cdf3c9b35865fc664e13806d9de710d274efeca70c5268f3c6cc9cf8` |
| `supplementary/p115-seed-44/final.ckpt.json` | `2727d45bc73907e1deb7fa4e2f71e4bac4552db22cd5f6076ed1521fa09dd5fe` |
| `supplementary/p115-seed-44/eval-final.json` | `61fd432e91dbe81a66335d2c4e3f33a20997d5ba4258cd59296f38cd436b9dc6` |
| `baseline-phase114-final-results.json` | `b1c0d0b837cfa1a4e650d1544bf2a1ec4ccc481e47800d43a9dc0ea178c62e48` |
| `aggregate-results.json` | `13621bc9df51ed3feabd2df76b580c387160ffb014dc74f1e696db0a78c0e6bc` |

Checkpoint sizes are 108.1–108.9 MB each. Per-run logs (`train.log`), `training-result.json`, and `historical-integrity.json` are retained alongside them.

### 14.3 Scripts

| File | Purpose |
|---|---|
| `experiments/phase116/build-dataset.ts` | Builds and audits the frozen splits (run before freeze; hash now frozen) |
| `experiments/phase116/overlap-covariate.ts` | Predeclared lexical-overlap covariate |
| `experiments/phase116/freeze.ts` | Freezes every input hash |
| `experiments/phase116/train-core.ts` | Phase 115 trainer with the seed parameterized |
| `experiments/phase116/train.ts` | Primary seed runner (42/43/44) |
| `experiments/phase116/train-supplementary.ts` | Phase 115 reseed runner (43/44) |
| `experiments/phase116/evaluate.ts` | Manifest-parameterized evaluation |
| `experiments/phase116/summarize.ts` | Aggregation, bootstrap, decision rule |
| `experiments/phase116/historical-integrity.ts` | Historical artifact hash guard |
| `src/lib/minimind/research/tests/phase116-replication.test.ts` | 47 contract tests |

---

## 15. Next step

The evidence supports a focused follow-up on **fact-level transfer determinants** rather than more seeds: with seed variation contributing only 1/64 and 3 facts never transferring while 9 always do, the next experiment should test whether transfer is predicted by (a) the number/shape of answer tokens, (b) the lexical overlap between seen and unseen prompts (the predeclared covariate already shows a descriptive association), or (c) fact-level competition among trained answers. A predeclared, fact-clustered analysis over a larger independent fact set is required before drawing any mechanism claim. No such experiment has been run.
