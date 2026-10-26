# Phase 117 — Fact-Level Transfer Determinants

**Status:** Observational analysis complete. No training, no generation, no checkpoint read.
**Date:** 2026-10-22
**Primary unit:** held-out Category B prompt, clustered by trained fact.
**Primary outcome:** retained greedy exact match.
**Primary explanatory variable:** `wordMaxJaccard` — maximum same-fact, same-language lexical overlap between an unseen paraphrase and the three seen training prompts.
**Predeclared specification:** `experiments/phase117/analysis-spec.json` (SHA-256 `5e9eff5f00bb708a046dbdc321bfeae64074c8851feefa54d51db7b5e956ca07`), written before any Phase 117 association was computed.
**Verdict:** **Descriptive association supported; no causal claim.** Maximum same-fact lexical overlap is positively associated with Category B exact match in both phases and both languages. The association is strongest in Phase 116, weaker and language-dependent in Phase 115. Exact substitution of another trained fact's answer is uncommon.

> **Scope guard.** This is a secondary analysis of a 1.1M-parameter, byte-level, closed-domain fact-answering probe. It does not establish world knowledge, open-domain chat, reasoning, or a mechanism. It does not change any Phase 115 or Phase 116 verdict.

---

## 1. Question

Which observable properties are associated with success and failure on unseen paraphrases of trained facts?

The analysis follows Phase 116's finding that 9 of 16 facts transferred in every seed, 3 never transferred, and 4 were seed-sensitive. The goal is to identify measurable associations and generate a testable hypothesis. It is not to explain the cause of transfer.

---

## 2. Predeclared plan (frozen before analysis)

The full specification is `analysis-spec.json`. The fixed choices were:

| Choice | Value |
|---|---|
| Primary covariate | `wordMaxJaccard` (Phase 116 protocol: en word sets, zh adjacent-character bigrams) |
| Primary outcome | retained `correct` boolean |
| Strata | language, always; phase, always separated |
| Phase 115 runs | original seed 42, supplementary seeds 43 and 44 |
| Phase 116 runs | seeds 42, 43, 44 final snapshots |
| Uncertainty | fact-clustered percentile bootstrap, 10,000 replicates, seed 20261022 |
| Threshold bins | 0.0/0.2/0.3/0.4/0.5/0.6, explicitly exploratory |
| Answer-token variables | `answerChars`, `answerTokens`, first answer token and its sharing, answer-token Jaccard, shared-token fact count, digit/punctuation flags |
| Confusion mapping | NFC, lowercase, remove Unicode punctuation/symbols/whitespace, exact equality; no fuzzy matching |
| Non-claims | no causal language, no significance test, no mechanism, no model-wide inference |

The specification also predeclared that Phase 115 and Phase 116 would never be pooled for inference because their datasets differ. They are not pooled anywhere in this report.

---

## 3. Data used and integrity

Only frozen dataset sources, frozen evaluation manifests, and retained evaluation JSON files were read. Checkpoints were not opened. The analysis script records SHA-256 before and after and writes only inside `experiments/phase117/`.

| Source artifact | SHA-256 (before = after) |
|---|---|
| `experiments/phase115/dataset.source.json` | `f2fadb9b0e43f1b9c0e71cc7fd244dac399a65e417c109f906ab35b9d56799f6` |
| `experiments/phase115/eval-manifest.json` | `264738130e2edba7b881a3cc0f0b2c596f25b6e7cf092d3d72d3c7c0c074aef3` |
| `experiments/phase115/phase115-final-results.json` | `51283f934e645caac265a31d672f57963d9ee8db58b9b42b155357aa6d93f59e` |
| `experiments/phase116/supplementary/p115-seed-43/eval-final.json` | `fca862f2cdf3c9b35865fc664e13806d9de710d274efeca70c5268f3c6cc9cf8` |
| `experiments/phase116/supplementary/p115-seed-44/eval-final.json` | `61fd432e91dbe81a66335d2c4e3f33a20997d5ba4258cd59296f38cd436b9dc6` |
| `experiments/phase116/dataset.source.json` | `535ba575732f62e912e46cca686734c3e8aa57f62d4d68f3a874b00fea0b7de9` |
| `experiments/phase116/eval-manifest.json` | `07b95fbec6f1c1ac948770cf97ea675161a961f76da781089cd4a94642d829b8` |
| `experiments/phase116/seed-42/eval-final.json` | `e4223330f171669fc9852d72504c4b5211b3d92cb0089f30216d401e398c45ef` |
| `experiments/phase116/seed-43/eval-final.json` | `1bf453720f818cdec7800f0707b33f88a248b31bd1bf00ffce8010ce2a5d7ea2` |
| `experiments/phase116/seed-44/eval-final.json` | `3da1850e4271c152a76764dc38c66ea627fe11390f26ed032a8b292388ff1db9` |
| `experiments/phase117/analysis-spec.json` | `5e9eff5f00bb708a046dbdc321bfeae64074c8851feefa54d51db7b5e956ca07` |

- **11 files checked, 0 changed.** `integrity.json` records every before/after pair.
- Tokenizer fingerprint re-verified: `a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d`.
- **No Phase 90, 113, 114, 115, or 116 dataset, checkpoint, result, verdict, or report was modified.**
- The Phase 116 point-biserial recomputed here (`0.281599`) matches the frozen Phase 116 aggregate (`0.2816`), which validates the covariate implementation.

### 3.1 What the two datasets contain

| | Phase 115 | Phase 116 |
|---|---|---|
| Trained facts | 12 | 16 |
| Category B items | 48 (2 en + 2 zh per fact) | 64 (2 en + 2 zh per fact) |
| Runs analysed | 3 (original seed 42 + reseeds 43, 44) | 3 (seeds 42, 43, 44) |
| Final B accuracy | 25/48, 29/48, 27/48 | 20/64, 19/64, 19/64 |
| Seed spread | 4/48 | 1/64 |
| Facts successful in every run | 12/12 | 9/16 |
| Facts never successful | 0/12 | 3/16 |

The datasets are not exchangeable. Phase 115 contains lexically nearer paraphrases; Phase 116 was constructed to exclude them.

---

## 4. Observed data

### 4.1 Phase 116 — lexical overlap and exact match

Pooled over three seeds: 58 correct and 134 incorrect B observations (64 items × 3 seeds).

| Estimate | Correct | Incorrect | Difference | Point-biserial |
|---|---|---|---|---|
| Overall | mean 0.3472 (n=58) | mean 0.2795 (n=134) | **+0.0677** | **0.2816** |
| English | 0.4125 (n=12) | 0.3085 (n=84) | +0.1040 | 0.3420 |
| Chinese | 0.3302 (n=46) | 0.2309 (n=50) | +0.0993 | 0.4297 |

Fact-clustered intervals:

| Statistic | Point | 95% interval |
|---|---|---|
| Overall point-biserial | 0.2816 | **0.1011 – 0.4044** |
| English point-biserial | 0.3420 | −0.0077 – 0.6093 |
| Chinese point-biserial | 0.4297 | **0.2000 – 0.6224** |
| Correct − incorrect mean overlap | +0.0677 | **0.0231 – 0.1059** |
| Fact-level Spearman (mean overlap vs fact accuracy) | **0.6410** | 0.1571 – 0.8563 |

Per-seed point-biserial: seed 42 **0.2411**, seed 43 **0.3148**, seed 44 **0.2896**. The positive sign is stable across seeds. These values match the frozen Phase 116 aggregate to four decimal places.

Per-fact Spearman: English 0.4346, Chinese 0.3966 (16 facts each).

**Interpretation limit:** the English interval includes zero. The overall and Chinese intervals exclude zero, but with 16 fact clusters the intervals are descriptive, not significance tests.

### 4.2 Phase 115 — lexical overlap and exact match (separate analysis)

Pooled over three runs: 81 correct and 63 incorrect B observations (48 items × 3 runs).

| Estimate | Correct | Incorrect | Difference | Point-biserial |
|---|---|---|---|---|
| Overall | mean 0.5136 (n=81) | mean 0.4538 (n=63) | +0.0598 | 0.1378 |
| English | 0.7248 (n=29) | 0.5163 (n=43) | +0.2085 | 0.4873 |
| Chinese | 0.3958 (n=52) | 0.3194 (n=20) | +0.0764 | 0.2247 |

| Statistic | Point | 95% interval |
|---|---|---|
| Overall point-biserial | 0.1378 | −0.1902 – 0.4127 |
| English point-biserial | 0.4873 | **0.2226 – 0.6999** |
| Chinese point-biserial | 0.2247 | −0.3498 – 0.6169 |
| Correct − incorrect mean overlap | +0.0598 | −0.0714 – 0.2070 |
| Fact-level Spearman | 0.6122 | −0.0992 – 0.9367 |

Per-seed/run point-biserial: original seed 42 **0.0952**, supplementary seed 43 **0.2448**, supplementary seed 44 **0.0761**. The sign is positive in every run, but the overall association is much weaker than in Phase 116 and its interval includes zero.

**Why the pooled Phase 115 number is weak:** English items have much higher overlap (means 0.52–0.72) than Chinese items (0.32–0.40) but lower accuracy. Pooling languages therefore mixes a high-overlap/low-accuracy stratum with a low-overlap/high-accuracy stratum. Within English, the association is clear (0.487, interval excludes zero); within Chinese it is positive but imprecise (0.225, interval includes zero). This is exactly why language was predeclared as a stratum.

The Phase 115 report's own exploratory overlap numbers used a different tokenisation and are not numerically comparable; the Phase 116 protocol recomputation (mean maximum overlap 0.487 for Phase 115) is reproduced here.

### 4.3 Within-fact and within-language comparisons

Cells contain two B items per fact-language per run. Only cells with exactly one correct and one incorrect item are eligible.

| Phase / run | Eligible cells | Correct item has higher overlap | Incorrect item has higher overlap | Tie |
|---|---|---|---|---|
| P116 seed 42 | 8 | 5 | 2 | 1 |
| P116 seed 43 | 9 | 6 | 3 | 0 |
| P116 seed 44 | 11 | 9 | 2 | 0 |
| P115 original 42 | 11 | 7 | 4 | 0 |
| P115 seed 43 | 11 | 6 | 4 | 1 |
| P115 seed 44 | 9 | 4 | 5 | 0 |

Phase 116 totals: **20 concordant, 7 discordant, 1 tie**. Phase 115 totals: **17 concordant, 13 discordant, 1 tie**. The within-fact direction therefore favours the overlap hypothesis in Phase 116 and only weakly in Phase 115. No p-value is reported: the cells are small, and the observations are clustered.

### 4.4 Item stability

| Phase | Items correct in every run | Mean overlap | Items never correct | Mean overlap |
|---|---|---|---|---|
| P116 | 14/64 | 0.3712 | 39/64 | 0.2749 |
| P115 | 20/48 | 0.5184 | 15/48 | 0.4417 |

Stable successes have higher overlap than never-correct items in both phases. This is descriptive; stable items also differ in fact identity, language mix, and answer length.

### 4.5 Tokenizer-level prompt overlap (exploratory)

The actual MiniMind byte-level BPE tokenizer (vocab 300) was used. The prompt body was encoded without the fixed chat template.

| Phase | Correct mean | Incorrect mean | Point-biserial |
|---|---|---|---|
| P116 overall | 0.7054 | 0.5669 | 0.5732 |
| P116 English | 0.6737 | 0.5483 | 0.4601 |
| P116 Chinese | 0.7136 | 0.5983 | 0.5163 |
| P115 overall | 0.7858 | 0.6411 | 0.5318 |
| P115 English | 0.7764 | 0.6260 | 0.6050 |
| P115 Chinese | 0.7911 | 0.6735 | 0.3819 |

Tokenizer-level overlap is uniformly higher than word-level overlap because the byte-level tokenizer preserves shared space, punctuation, and byte fragments. Chinese "tokens" are sub-character byte fragments, so this measure is not a word-overlap measure. It is directionally consistent with the word-level result but should not be over-interpreted.

### 4.6 Answer-token properties

The predeclared answer-token features were computed exactly as specified. Two of them are **degenerate under this tokenizer**, and this is reported rather than hidden:

- Every answer is tokenised as `" " + answer`. Token id **36** is the leading-space byte token, so `firstAnswerTokenId` is identical for every fact in every language.
- Every answer ends in `.` or `。`, so every answer token set shares the leading space and terminal punctuation with every other answer.
- Consequently `firstTokenSharedCount = n − 1` and `otherFactsSharingAnyToken = n − 1` for every fact; their Spearman correlations with fact accuracy are null (no variance).

An exploratory correction was added **after** observing this: drop the leading space and the trailing punctuation, then compute content-token and surface-word features. The correction is labelled POST-HOC EXPLORATORY throughout and does not replace the predeclared variables.

| Feature (fact-level Spearman with B accuracy) | P116 en | P116 zh | P115 en | P115 zh |
|---|---|---|---|---|
| `answerChars` (predeclared) | −0.409 | −0.199 | +0.403 | −0.500 |
| `answerTokens` (predeclared) | −0.377 | −0.234 | +0.239 | −0.363 |
| `answerMaxTokenJaccard` (predeclared; space/punctuation-inflated) | +0.181 | +0.491 | +0.168 | −0.071 |
| `answerMeanTokenJaccard` (predeclared) | +0.375 | +0.371 | −0.183 | +0.058 |
| `contentFirstTokenSharedCount` (exploratory) | +0.007 | +0.097 | +0.131 | +0.381 |
| `contentMaxTokenJaccard` (exploratory) | −0.238 | +0.051 | +0.234 | −0.094 |
| `contentMeanTokenJaccard` (exploratory) | −0.087 | −0.182 | +0.036 | −0.130 |
| `otherFactsSharingAnyContentToken` (exploratory) | −0.218 | −0.388 | +0.039 | −0.113 |
| `surfaceMaxJaccard` (exploratory) | — | — | — | — |

Fact-level n is 16 (P116) or 12 (P115) per language. No correction for multiple comparisons is applied; these are exploratory.

**No answer-token property has a consistent sign across phases and languages.**

- Answer length is negative in P116 and in P115 Chinese, but positive in P115 English.
- Content-token overlap with other answers is negative in P116 Chinese (−0.388) but near zero or positive elsewhere.
- `surfaceMaxJaccard` is **0 for every fact in both phases and both languages**: the canonical answers share no normalized surface word (English) or character bigram (Chinese) with any other canonical answer. Answer competition at the word level is absent by construction. Any confusion must be sub-word/byte-level or a whole-answer substitution.

Additional descriptive facts:

- P116 has no digit-containing answers; P115 has two per language (`60 minutes.`, `100 degrees Celsius.` / `60分钟。`, `100摄氏度。`).
- Every answer contains terminal punctuation.
- The first content token is not unique: in English, 9 distinct first letters cover 16 answers; in Chinese, 9 distinct first fragments cover 16 answers.

### 4.7 Cross-fact answer confusion

Destination mapping uses only harmless formatting normalization (NFC, lowercase, remove punctuation/symbols/whitespace, exact equality). No fuzzy or semantic matching is used.

#### Phase 116 (pooled over three seeds)

| Language | Intended | Other trained answer | Empty | Abnormal | Unmatched | Total |
|---|---|---|---|---|---|---|
| English | 12 | **8** | 0 | 0 | 76 | 96 |
| Chinese | 46 | **1** | 0 | 0 | 49 | 96 |
| Both | 58 | **9** | 0 | 0 | 125 | 192 |

- Wrong B outputs: 134. Of these, **9 (6.7%) exactly reproduce another trained fact's canonical answer**; 125 (93.3%) are unmatched.
- No empty outputs, no abnormal terminations, and no formatting-only exact-match misses.

Most frequent other-trained destinations: `p116-t11` (Fe) 3, `p116-t16` (Four strings) 2, `p116-t14` (Six sides) 2, `p116-t13` (Nitrogen) 1, `p116-t03` (曼谷) 1. Most frequent source facts: `p116-t10` (Liver) 3, `p116-t12` (Ag) 3, `p116-t07` (One moon) 2, `p116-t02` (Lisbon) 1.

Concentration permutation (conditioned on the 8 English substitutions, uniform null over the other 15 trained facts): observed maximum destination count 3 (top share 0.375); null 95th-percentile maximum 3; permutation p = 0.171. **There is no evidence that destinations are more concentrated than uniform.** Chinese has one substitution, so the test is uninformative there.

#### Phase 115 (pooled over three runs)

| Language | Intended | Other trained answer | Empty | Abnormal | Unmatched | Total |
|---|---|---|---|---|---|---|
| English | 29 | **2** | 0 | 0 | 41 | 72 |
| Chinese | 52 | **0** | 0 | 0 | 20 | 72 |
| Both | 81 | **2** | 0 | 0 | 61 | 144 |

- Wrong B outputs: 63. Of these, **2 (3.2%) exactly reproduce another trained answer**; 61 (96.8%) are unmatched.
- The two substitutions are `Spring` → `60 minutes.` and `Moscow` → `Berlin.`.
- Concentration is uninformative at n = 2.

#### Near-miss similarity (post-hoc exploratory)

Exact substitution is rare, but many failures are near-misses to another trained answer. Character edit similarity ≥ 0.5 to some other trained answer:

| Phase / language | Wrong non-empty outputs | ≥ 0.50 | ≥ 0.67 |
|---|---|---|---|
| P116 English | 84 | 48 (57.1%) | 15 (17.9%) |
| P116 Chinese | 50 | 11 (22.0%) | 1 (2.0%) |
| P115 English | 43 | 11 (25.6%) | 3 (7.0%) |
| P115 Chinese | 20 | 5 (25.0%) | 0 |

Examples: `Nilo.` for `Oslo.` (nearest `Nile.`, 0.75); `Listrogen.` for `Lisbon.` (nearest `Nitrogen.`, 0.78); `Ninegrees.` for `Six sides.` (nearest `Ninety degrees.`, 0.69). Chinese failures are usually longer malformed character sequences that are not near any canonical answer.

This similarity view does **not** change any correctness outcome and is not a destination map.

### 4.8 Uncertainty and the Phase 115/116 difference

Fact-clustered bootstrap intervals (10,000 replicates, seed 20261022):

| Phase | Point accuracy | 95% interval |
|---|---|---|
| P116 seed 42 | 0.3125 | 0.1875 – 0.4531 |
| P116 seed 43 | 0.2969 | 0.1406 – 0.4688 |
| P116 seed 44 | 0.2969 | 0.1719 – 0.4219 |
| P116 pooled seed-average | 0.3021 | 0.1771 – 0.4375 |
| P115 original 42 | 0.5208 | 0.3958 – 0.6667 |
| P115 seed 43 | 0.6042 | 0.4583 – 0.7708 |
| P115 seed 44 | 0.5625 | 0.4375 – 0.6667 |
| P115 pooled seed-average | 0.5625 | 0.4444 – 0.6736 |

The Phase 116 and Phase 115 intervals overlap, but the datasets differ in paraphrase distance, fact set, and size. The difference cannot be attributed to overlap alone.

---

## 5. Exploratory patterns (lower confidence)

These are clearly separated from the measured data above.

1. **The overlap–success association is positive in every phase × language stratum** (four independent point estimates: 0.34, 0.43, 0.49, 0.22), but its magnitude and interval precision differ. The Phase 116 Chinese and pooled associations and the Phase 115 English association have intervals excluding zero; the other two do not.
2. **The exploratory overlap bins are monotone only in Phase 116 Chinese** (0.22 → 0.45 → 0.63 → 0.78). Overall Phase 116 is roughly increasing but not monotone (0.39 at 0.30–0.40, 0.33 at 0.40–0.50). Phase 115 is non-monotone because of the language mix. The 0.50+ bins have 3–6 observations and should not be interpreted.
3. **English failures are more often answer-form confusions; Chinese failures are more often malformed character sequences.** This is visible in the destination tables and in the near-miss similarity rates.
4. **Answer length and answer-token sharing do not behave consistently.** The strongest single value is `otherFactsSharingAnyContentToken` = −0.388 in Phase 116 Chinese, but it does not replicate in Phase 116 English (−0.218), Phase 115 English (+0.039), or Phase 115 Chinese (−0.113).
5. **Stable-transfer facts tend to have higher mean overlap, but fact identity is confounded with answer length, topic, and language.** For example, `p116-t11` (Fe) and `p116-t16` (Four strings) are both stable successes and have high overlap; `p116-t02` (Lisbon), `p116-t07` (One moon), and `p116-t14` (Six sides) are never successful and have low-to-mid overlap (0.217, 0.223, 0.317).

---

## 6. Predeclared hypotheses: evidence status

| Hypothesis | Statement | Status |
|---|---|---|
| **H117-1** | Correctness is positively associated with maximum same-fact word overlap, within both languages. | **Partially supported, descriptive.** Positive in all four phase × language strata. Fact-clustered overall interval excludes zero in Phase 116 (0.101–0.404) but includes zero in Phase 115 (−0.190–0.413). English Phase 116 and Chinese Phase 115 intervals include zero. |
| **H117-2** | Facts whose answers share more tokens with other trained answers have lower accuracy. | **Not supported as stated.** Predeclared token features are degenerate; corrected content-token associations are inconsistent in sign. Surface-word competition is zero by construction. |
| **H117-3** | A substantial share of wrong outputs exactly reproduces another trained answer, and destinations are concentrated. | **Not supported.** 9/134 (6.7%) in Phase 116 and 2/63 (3.2%) in Phase 115. Destination concentration is not above a uniform null (English permutation p = 0.171). |
| **H117-4** | The overlap association survives within-fact comparisons. | **Weakly supported in Phase 116, not robust in Phase 115.** 20 concordant vs 7 discordant cells in P116; 17 vs 13 in P115. |

No hypothesis is promoted to a causal claim. No significance test is applied.

---

## 7. What the evidence does not support

- **A causal role for lexical overlap.** The covariates are observational. Overlap correlates with fact identity, authoring style, answer length, and language.
- **A mechanism.** The model has no positional encoding; word-level Jaccard is a crude surface proxy. Success could reflect shared content words, shared byte sequences, or fact-level memorisation.
- **Answer competition as the dominant failure mode.** Exact substitution is a minority of failures, and most failures are unmatched strings.
- **A model-wide or dataset-wide rate.** There are 12–16 facts and 48–64 B items per phase. Intervals are wide.
- **That Phase 115 and Phase 116 measure the same thing.** The datasets differ in paraphrase distance, fact set, and size.
- **That bad answers are merely formatting variants.** No formatting-only exact-match misses were observed.

---

## 8. Most difficult facts and answer patterns

### Phase 116

- Never successful in any seed: `p116-t02` Lisbon (`0/12`), `p116-t07` One moon (`0/12`), `p116-t14` Six sides (`0/12`).
- Near-floor: `p116-t09` Cheetah (`1/12`), `p116-t10` Liver (`1/12`).
- Highest accuracy: `p116-t11` Fe (`10/12`), `p116-t04` Nile (`9/12`), `p116-t16` Four strings (`9/12`).
- English is much harder than Chinese: 12/96 (12.5%) vs 46/96 (47.9%). Only `p116-t04`, `p116-t11`, `p116-t12`, and `p116-t16` have any English success.
- The three never-success facts span geography, astronomy, and math; they do not share an obvious topic or answer-length pattern.

### Phase 115

- All 12 facts succeed in at least one run. Lowest: `p115-t09` Honey (`3/12`), `p115-t10` Tuesday (`3/12`), `p115-t04` 60 minutes (`4/12`).
- Chinese remains easier (52/72, 72.2%) than English (29/72, 40.3%), but English accuracy is much higher than in Phase 116 because the paraphrases are lexically nearer.

### Answer patterns

- Wrong English outputs are frequently another trained answer's form (`Fe.` for `Ag.`, `Four strings.` for `One moon.`, `Six sides.` for `Liver.`) or a truncated/mutated form near one (`Nilo.`).
- Wrong Chinese outputs are frequently longer malformed strings that combine fragments of trained answers but match no canonical answer exactly.
- No wrong output exactly matched an untrained (Category C) answer, and Category C remained 0/36 in Phase 116 and 0/24 in Phase 115 (frozen reports).

---

## 9. Follow-up experiment design (not executed)

### 9.1 Which intervention is most justified

The predeclared follow-up rule was applied in order:

1. **Answer-deconfliction:** not justified. H117-3 is not supported (6.7% exact substitution, well below the 25% criterion), and no competition feature reaches |ρ| ≥ 0.40 consistently.
2. **Lexical-overlap manipulation:** selected. H117-1 is positive in all four strata; the Phase 116 pooled interval excludes zero; Phase 115 English also excludes zero. The P115 pooled and Phase 116 English intervals include zero, so this is a test of the association, not confirmation of it.
3. Answer-length and held-out-fact alternatives are not selected because answer-length signs are inconsistent across phases and languages.

### 9.2 Proposed single-variable experiment: H118

**Hypothesis.** For the same trained fact, the same canonical answer, the same language, and the same frozen checkpoints, a held-out paraphrase with higher same-fact lexical overlap is more likely to be answered exactly than a paraphrase with lower overlap.

**Treatment and control (within fact × language).**

- **High-overlap condition:** newly authored held-out paraphrases targeting `wordMaxJaccard` in [0.70, 0.95).
- **Low-overlap condition:** newly authored held-out paraphrases of the same fact targeting `wordMaxJaccard` ≤ 0.35.
- One high and one low paraphrase per fact per language (16 facts × 2 languages × 2 conditions = 64 prompts), evaluated on the three Phase 116 final checkpoints (seeds 42, 43, 44) → 192 generations.

**What remains fixed.** Phase 116 final checkpoints (no retraining), tokenizer, prompt template, decoding settings (greedy, maxTokens 40, EOS 3, UTF-8 enforcement, 128-token context), fact set, canonical answers, training data, and evaluation harness. No architecture or training change.

**Construction and freezing.**

- Author prompts before any generation and freeze them with SHA-256.
- Audit exact and normalized uniqueness against all Phase 116 training prompts and against each other.
- Compute overlap before generation; publish the achieved overlap distribution.
- Match prompt token length within ±8 tokens across conditions where possible.
- Do not reuse or minimally edit a Phase 116 B prompt whose outcome is already known; selecting prompts by observed outcome would leak the result.

**Primary endpoint.** High-overlap minus low-overlap exact-match rate, pooled over facts, with a fact-clustered bootstrap interval (10,000 replicates, same method as Phase 117). Report English and Chinese separately and per seed.

**Secondary endpoints.** Token F1 difference; destination distribution; EOS/empty/abnormal rates (sanity checks only).

**Leakage risks.**

- High-overlap prompts can become near-duplicates of training prompts. The audit must report the maximum overlap and exclude exact/normalized duplicates; otherwise the test becomes a memorisation check.
- Authoring after seeing Phase 117 could unconsciously target known-easy or known-hard facts. Use the pre-existing 16-fact set and author both conditions blindly to condition labels where possible.
- Prompt length and syntax may differ systematically between conditions.
- The same three seeds are not independent retraining draws; they vary batch order only.

**What would support the hypothesis.** High-overlap accuracy exceeds low-overlap with a fact-clustered interval excluding zero, the sign is the same in both languages, and at least two of three seeds agree. A result carried by one or two facts or by near-duplicate prompts would not support it.

**What would weaken the hypothesis.** No difference; a reversed difference; a language-inconsistent difference; or a difference that disappears after excluding prompts with overlap ≥ 0.90 (near-duplicates).

**Feasibility.** No training is required: 192 generations on existing checkpoints, using the frozen Phase 116 evaluation harness. If the checkpoints are unavailable, do not substitute a new training campaign in the same phase; a new training run would change the treatment and should be a separate preregistered study.

---

## 10. Engineering verification

- **Focused suite:** `src/lib/minimind/research/tests/phase117-fact-determinants.test.ts` — **22 checks passed, 0 failed, 0 skipped** after this report was written. Before the report existed, the report-contract check reported SKIP, as designed. The suite verifies:
  - the predeclared specification's status and fixed choices;
  - zero source-artifact hash changes and the absence of checkpoints from the input set;
  - exact Category B item sets and balanced language strata;
  - Phase 116 overlap agreement with the frozen `lexical-overlap.json` (all 64 items within 1e-4);
  - per-run, per-fact, and per-language count reconciliation;
  - internal consistency of every bootstrap interval and the 10,000 valid+skipped replicates;
  - destination totals against exact-match counts;
  - the documented answer-token degeneracy and presence of the exploratory corrections;
  - the Phase 116 stability counts and point-biserial values against the frozen Phase 116 artifacts;
  - the report's citation of the frozen sources.
- **Analysis rerun determinism:** the analysis is deterministic given the frozen inputs and seed 20261022; no random training or generation is involved.
- **Production build:** `npm run build` was run after the report and test file were written. Result is recorded in §13.
- **Destructive historical test modules were not run.** Only the Phase 117 suite (and the build) were executed.

Analysis command:

```bash
npx tsx experiments/phase117/analyze.ts
npx tsx src/lib/minimind/research/tests/phase117-fact-determinants.test.ts
```

---

## 11. Artifacts

All paths are relative to the repository root. Every file was written under `experiments/phase117/` except this report and the focused test.

| Artifact | Purpose |
|---|---|
| `experiments/phase117/analysis-spec.json` | Predeclared analysis specification |
| `experiments/phase117/analyze.ts` | Complete analysis implementation |
| `experiments/phase117/per-prompt-features-phase116.json` | Per-B-prompt feature table (64 items) |
| `experiments/phase117/per-prompt-features-phase115.json` | Per-B-prompt feature table (48 items) |
| `experiments/phase117/per-fact-summary-phase116.json` | Per-fact summary (16 facts) |
| `experiments/phase117/per-fact-summary-phase115.json` | Per-fact summary (12 facts) |
| `experiments/phase117/lexical-overlap-analysis-phase116.json` | Overlap, within-fact, bins, stability |
| `experiments/phase117/lexical-overlap-analysis-phase115.json` | Overlap, within-fact, bins, stability |
| `experiments/phase117/answer-token-analysis-phase116.json` | Predeclared and corrected answer features |
| `experiments/phase117/answer-token-analysis-phase115.json` | Predeclared and corrected answer features |
| `experiments/phase117/confusion-analysis-phase116.json` | Destination mapping, concentration, near-miss |
| `experiments/phase117/confusion-analysis-phase115.json` | Destination mapping, concentration, near-miss |
| `experiments/phase117/uncertainty-phase116.json` | Fact-clustered intervals |
| `experiments/phase117/uncertainty-phase115.json` | Fact-clustered intervals |
| `experiments/phase117/integrity.json` | Before/after SHA-256 for all inputs |
| `experiments/phase117/headline.json` | Consolidated Phase 117 results |
| `experiments/phase117/run.log` | Analysis console output |
| `experiments/phase117/test.log` | Focused test output |
| `experiments/phase117/build.log` | Production build output (exit 0) |
| `src/lib/minimind/research/tests/phase117-fact-determinants.test.ts` | Focused contract suite |

### 11.1 Original artifacts not modified

The before/after hashes in `integrity.json` show **0 changed / 11 checked**. No Phase 90, 113, 114, 115, or 116 dataset, checkpoint, evaluation, verdict, or report was written. No `git reset`, `git clean`, `git add -A`, commit, or push was used. Nothing was staged.

---

## 12. Limitations

1. **Fact-level n is 12–16.** Every fact-level correlation is coarse, and one fact can move a rank correlation materially.
2. **Prompt-level n is 48–64 per phase, with four items per fact and three correlated runs.** Effective sample size is smaller than the raw observation count.
3. **Seeds are batch orders, not independent retraining draws.** Seed variation is a narrow perturbation.
4. **Lexical overlap is a surface proxy.** Word/character-bigram Jaccard cannot distinguish a semantic paraphrase from a lexical edit.
5. **The model has no positional encoding.** Word-order-only variants are near-identical inputs. Phase 116 excluded them from Category B; Phase 115 did not.
6. **The two phases use different datasets and paraphrase distances.** They are never pooled; differences between them are not a causal effect of dataset change.
7. **The predeclared answer-token features are degenerate** under the byte-level tokenizer. The corrected features are post-hoc exploratory, and English content tokens are single letters because vocab 300 does not merge these rare answers.
8. **Single author.** Facts, paraphrases, and ambiguity judgments came from one person.
9. **Greedy single-sample decoding.** Sampling and beam search were not evaluated.
10. **Exact match is strict.** Token F1 is reported but is not the primary endpoint; no formatting-only misses were observed.
11. **No causal identification.** The follow-up in §9 is a proposal; it has not been run.

---

## 13. Build and final verification

- Focused Phase 117 suite: **22 passed, 0 failed, 0 skipped**.
- Production build: **exit 0, compiled successfully** (`experiments/phase117/build.log`). The remaining ESLint warnings are in pre-existing, unrelated historical files and were not introduced here; no Phase 117 file produced a type or lint error after the three local fixes recorded below.
- Three local type errors in `analyze.ts` were found by the build and fixed without changing results: a generic `jaccard<T>` signature for numeric token sets, a duplicate `point` property, and the destination permutation now samples from the other trained facts (excluding the source fact) exactly as the predeclared rule specifies. A fourth local bug, a `topSources` comparator reading a nonexistent field, was also fixed; it affected only the order of that listing, which now matches the counts cited in §4.7. The analysis was re-run afterwards; every reported statistic is unchanged except the English concentration permutation p, now 0.171.
- Source integrity: **0 changed / 11 checked**.
- No training, generation, checkpoint read, commit, push, reset, clean, or `git add -A`.

---

## 14. Conclusion

Within the frozen Phase 115/116 closed-domain artifacts:

- **Maximum same-fact lexical overlap is the most consistent observable correlate of Category B success.** It is positive in every phase × language stratum. In Phase 116 the pooled association is 0.282 with a fact-clustered interval of 0.101–0.404, and the fact-level Spearman is 0.641. In Phase 115 the pooled association is weaker (0.138, interval −0.190–0.413) but positive within both languages, reaching 0.487 in English.
- **The association is language-dependent and phase-dependent.** Chinese is much easier in both phases. English benefits strongly from overlap in Phase 115 but has little success in Phase 116 even at moderate overlap.
- **The most difficult facts are `p116-t02` (Lisbon), `p116-t07` (One moon), and `p116-t14` (Six sides)**, none of which succeeded in any seed. English failures dominate; Chinese failures tend to be malformed character sequences.
- **Wrong answers do not disproportionately reproduce other trained answers.** Only 9/134 (6.7%) of Phase 116 wrong outputs and 2/63 (3.2%) of Phase 115 wrong outputs exactly match another trained canonical answer, and destination counts are not more concentrated than a uniform null. Near-miss confusion is common in English but is not exact substitution.
- **Answer-token and competition measures do not provide a stable determinant.** The predeclared tokenizer features are degenerate; corrected content-token and answer-length associations change sign across phases and languages.
- **The justified next experiment is a single-variable overlap manipulation** on fresh, frozen held-out paraphrases of the existing facts, using the existing checkpoints: high-overlap versus low-overlap paraphrases, within fact and language, with exact match as the primary endpoint. It tests whether the observed association is causal at the prompt level. It does not require retraining.

**One evidence-based next step:** run the preregistered H118 overlap-manipulation evaluation (no training) before attempting any mechanism-level or architectural claim.
