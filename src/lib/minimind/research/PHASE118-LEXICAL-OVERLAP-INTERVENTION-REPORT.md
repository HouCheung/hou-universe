# Phase 118 — Controlled Lexical-Overlap Intervention

**Status:** Frozen, no-retraining evaluation complete. **No training**, fine-tuning, weight update, checkpoint write, retrieval, answer correction, or external-knowledge injection was used. This work is **not committed** and not pushed.
**Date:** 2026-10-22
**Primary unit:** fact × language pair, paired high-overlap versus low-overlap prompt, evaluated on three frozen Phase 116 checkpoints.
**Primary endpoint:** paired difference in greedy exact-match accuracy, high-overlap minus low-overlap.
**Predeclared specification:** `experiments/h118/analysis-spec.json` (SHA-256 `4a4a434608c2e9683d0b3ce02eb2970f70c66a88b8f00977580ae803d8bb53b1`), written and hashed before any H118 model output existed.
**Frozen prompt set:** `experiments/h118/prompts.json` (SHA-256 `0f7d81242ba178c56d3b7fe5538837feaa060a6eb6775c4042421b553957ca16`).
**Frozen evaluation manifest:** `experiments/h118/eval-manifest.json` (SHA-256 `8d98ed64e9d7257fd557e4617fda9ff9afa5e9fb5e9e9af309d6b703bef16d94`).
**Verdict:** **SUPPORTED under the predeclared decision rule.** Pooled exact-match accuracy was 86/96 (0.895833) for high-overlap prompts and 28/96 (0.291667) for low-overlap prompts. The paired difference was **+0.604167**, with a fact-clustered 95% interval of **0.489583 to 0.729167**. All five predeclared support conditions passed.

> **Scope guard.** This is a 1.1M-parameter, byte-level, closed-domain fact-answering probe. The result is limited to the 16 trained facts, the 64 newly authored prompts, English and Chinese, the three frozen Phase 116 checkpoints, and the specific overlap manipulation. It is not proof of general language understanding, open-domain chat, reasoning, or a model-wide causal mechanism. It does not change any Phase 115, 116, or 117 verdict.

---

## 1. Question

Phase 117 reported a positive observational association between same-fact lexical overlap and retained exact match. Phase 118 turns that association into an intervention: for the same trained fact, canonical answer, language, and frozen checkpoint, is a newly authored high-overlap prompt more likely to produce the exact canonical answer than a newly authored low-overlap prompt?

The causal contrast is deliberately narrow. The manipulation changes prompt wording while holding the fact, answer, language, checkpoint, prompt template, and decoding settings fixed. It does not isolate lexical overlap from every correlated property of wording; the residual confounders are reported in Sections 7 and 8.

---

## 2. Frozen design

| Component | Frozen value |
|---|---|
| Trained facts | 16 (`p116-t01` … `p116-t16`) |
| Languages | English (`en`) and Chinese (`zh`) |
| Conditions | High overlap and low overlap |
| Fact-language pairs | 32 |
| Prompts | 64 (32 high-overlap, 32 low-overlap; 32 en, 32 zh) |
| Checkpoints | Phase 116 final snapshots, seeds 42, 43, 44 |
| Generations | 192 (64 prompts × 3 checkpoints) |
| Prompt template | `User: <prompt>\nAssistant:` |
| Decoding | Greedy; temperature 0; topK 40; topP 0.9; seed 42; maxTokens 40; EOS token 3; UTF-8 enforcement on; context limit 128; max prompt tokens 88 |
| Training or weight updates | None |
| Retrieval, post-processing, answer correction | None |

The exact-match definition is `normalizeChatAnswer` from `src/lib/minimind/data/chatSftMetrics.ts`: CRLF/CR to LF, cut at the first `\nUser:` or `\nAssistant:` marker, NFC, trim, collapse consecutive whitespace, preserve case, punctuation, wording, and numbers. Matching is exact; there is no fuzzy matching.

The three checkpoint hashes were verified before and after evaluation:

| Seed | Checkpoint | SHA-256 |
|---|---|---|
| 42 | `experiments/phase116/seed-42/final.ckpt.json` | `78ef294517f204c60e6efb4426f3c27bbfd58ad3d124f64055d7ff51a2945483` |
| 43 | `experiments/phase116/seed-43/final.ckpt.json` | `57e2930867faf37d3657d6dfd2c4157183a9814039714e6fe6ec164c597b4172` |
| 44 | `experiments/phase116/seed-44/final.ckpt.json` | `6195bd1d7403e5dc3deeb1c8ce9ba24b34fe470c61ad683b608e43607e31df87` |

The tokenizer fingerprint was verified as `a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d`.

---

## 3. Prompt construction and mandatory audit

The prompt candidates were authored in `experiments/h118/prompt-candidates.json` with status `AUTHORED BEFORE ANY H118 GENERATION`. The high and low prompts for each fact-language pair ask the same underlying question, expect the same canonical answer, and were not selected or edited after observing model output.

### 3.1 Overlap definition

`wordMaxJaccard` is the maximum Jaccard similarity between the candidate prompt and the three Phase 116 training prompts for the same fact and language. The implementation reproduces the Phase 116/117 protocol:

- Unicode NFC, lowercase, replace every Unicode punctuation or symbol character with one ASCII space, collapse whitespace, trim.
- English: whitespace-separated word set.
- Chinese: adjacent-character bigram set after removing whitespace.
- Jaccard: intersection divided by union; both sets empty gives 1; empty union gives 0.

The implementation was validated against all 64 Phase 116 Category B items: **0 value mismatches and 0 nearest-prompt mismatches** at tolerance `1e-4`.

### 3.2 Achieved manipulation

All 16 facts were eligible in both languages; no fact or language was excluded. The resulting balanced set is the full 16-fact design.

| Condition | Prompts | Minimum | Maximum | Mean | Median | Predeclared bound |
|---|---:|---:|---:|---:|---:|---|
| High-overlap | 32 | 0.714286 | 0.888889 | 0.816232 | 0.809091 | in [0.70, 0.95] |
| Low-overlap | 32 | 0.058824 | 0.333333 | 0.224331 | 0.230769 | ≤ 0.35 |

Every prompt was checked for exact and normalized duplication against the three same-fact, same-language training prompts and against every other H118 prompt. There were **no duplicates**. There was **no full-answer leakage** and **no near-duplicate** under the predeclared definition (normalized equality or `wordMaxJaccard ≥ 0.90`). The largest high-overlap value, 0.888889, remains below that near-duplicate threshold.

The only leakage-audit flags were the two `p116-t14` Chinese prompts. Both contain the character 六 only as part of 六边形 (“hexagon”), the subject of the question; neither states the canonical answer 六条边 (“six sides”). This topic-inherent numeral was explicitly adjudicated in `prompt-candidates.json` and `leakage-audit.json`, and the audit passed. Because both conditions share the same word, it cannot explain a high-versus-low difference.

Representative pairs:

| Pair | High-overlap prompt | Low-overlap prompt | Canonical answer |
|---|---|---|---|
| `p116-t01` en | “What is the capital city of Norway?” (0.857143) | “Where is Norway's government based?” (0.200000) | Oslo. |
| `p116-t01` zh | “请问挪威的首都是哪里？” (0.777778) | “挪威的行政中心在哪里？” (0.230769) | 奥斯陆。 |
| `p116-t15` en | “How many degrees are contained in a right angle?” (0.888889) | “What angular measure does a right angle have?” (0.250000) | Ninety degrees. |

The pairs are not perfectly matched on every nuisance dimension. In formatted-token units (including the prompt template), high-overlap prompts average 47.46875 tokens (range 42–61), while low-overlap prompts average 53.15625 tokens (range 42–66). The mean paired difference is −5.6875 tokens (min −19, max +3). The low-overlap prompts are therefore systematically a little longer and often more periphrastic. This is a residual confound, not a hidden one: it is recorded here and in `prompt-audit-summary.json`, and it is the main threat to a purely lexical interpretation.

The complete overlap, leakage, duplicate, and prompt manifests are recorded in `experiments/h118/overlap-audit.json`, `leakage-audit.json`, `duplicate-audit.json`, `prompt-audit-summary.json`, and `prompt-manifest.json`. The mandatory audit status is **PASS**.

---

## 4. Evaluation integrity

The evaluation reused the frozen Phase 116 `evaluateCheckpoint` implementation without modifying it. The H118 wrapper `experiments/h118/evaluate.ts` verified the frozen prompt, manifest, split, and spec hashes, the three checkpoint hashes, the tokenizer fingerprint, and the full generation contract before each run.

- **Runs:** 3 (`seed-42-eval.json`, `seed-43-eval.json`, `seed-44-eval.json`), each with 64 unique Category B items.
- **Generation settings:** identical across seeds, languages, and conditions.
- **Contract:** all three runs passed; 64/64 items per run; 192 total generations; no missing, duplicate, or mismatched item IDs.
- **Quality:** 189/192 generations stopped at EOS; 3 stopped at maxTokens (two high-overlap English items and one low-overlap English item). There were 0 error stops, 0 empty outputs, 0 malformed outputs, 0 UTF-8-invalid outputs, 0 dropped incomplete tails, and 0 context truncations.
- **Recomputation:** the analysis script recomputed normalized continuations, exact-match booleans, and token F1 from the raw continuations and matched the evaluation output for all 192 items.

### 4.1 Historical and frozen-artifact integrity

The pre-generation baseline in `experiments/h118/integrity-baseline.json` covered **148 protected files, 1,633,737,293 bytes**, with git HEAD `351e68b0b0d93c0bb4272daffebe10bf9de7e6ab`. It includes all files in `experiments/phase90`, `phase113`, `phase114`, `phase115`, `phase116`, and `phase117`, the six prior research reports, and every frozen H118 input and script.

- Post-evaluation verification: **PASS**, 148 files, 0 missing, 0 extra, 0 changed (`integrity-post-eval.json`).
- Post-analysis verification: **PASS**, 148 files, 0 missing, 0 extra, 0 changed (`integrity.json`).
- Final post-report verification: **PASS**, 148 files, 0 missing, 0 extra, 0 changed (`integrity-final.json`).
- Git HEAD did not change. No prior artifact or report was modified.
- The analysis is deterministic: `npx tsx experiments/h118/analyze.ts --verify-determinism` reproduced the digest `706704f2adc641d0f602167542d68690404acd8ef49198b71cdb49fda0575c3d`; `paired-analysis.json`, `stratified-results.json`, `uncertainty.json`, and `headline.json` all carry that digest.

---

## 5. Observations

### 5.1 Primary endpoint

The 64 prompts form 32 fact-language pairs. Evaluated on three checkpoints, they yield **96 paired observations** (one high and one low generation per pair and seed). The 192 generations are not treated as 192 independent observations.

| Condition | Correct / total | Exact-match rate | Mean token F1 |
|---|---:|---:|---:|
| High-overlap | 86 / 96 | 0.895833 | 0.921875 |
| Low-overlap | 28 / 96 | 0.291667 | 0.419086 |
| Difference (high − low) | — | **+0.604167** | **+0.502789** |

Fact-clustered percentile bootstrap, resampling the 16 fact IDs with replacement (10,000 valid replicates, seed 20261022, 2.5th/97.5th percentiles):

| Endpoint | Point estimate | 95% fact-clustered interval |
|---|---:|---:|
| Exact-match difference | **+0.604167** | **0.489583 to 0.729167** |
| Token-F1 difference | **+0.502789** | **0.401402 to 0.608416** |

Generation-level paired counts:

| Outcome | Overall | English | Chinese |
|---|---:|---:|---:|
| Both correct | 27 | 6 | 21 |
| High-overlap only correct | 59 | 32 | 27 |
| Low-overlap only correct | 1 | 1 | 0 |
| Both incorrect | 9 | 9 | 0 |

The one low-overlap-only success was `p116-t15` English under seed 42: the high-overlap continuation was “Ninety degreegrees.” and did not exactly match; the low-overlap continuation was “Ninety degrees.” and did. This is item-level non-monotonicity, not evidence of a reverse effect. Across the three seeds that fact-language pair is a 1/3–1/3 tie: high-overlap succeeded under seed 43 but not under 42 or 44, while low-overlap succeeded only under 42.

### 5.2 By language

| Language | High-overlap | Low-overlap | Difference | Exact-match 95% interval | Token-F1 difference |
|---|---:|---:|---:|---:|---:|
| English | 38/48 (0.791667) | 7/48 (0.145833) | **+0.645833** | 0.437500 to 0.833333 | +0.687500 |
| Chinese | 48/48 (1.000000) | 21/48 (0.437500) | **+0.562500** | 0.333333 to 0.770833 | +0.318077 |

The direction is positive in both languages. The Chinese high-overlap condition is at ceiling (48/48), so its observed difference is bounded by the low-overlap rate. The English and Chinese overlap scores are not assumed to be directly comparable: the tokenization differs (word sets versus character bigrams), and the language-specific prompt pools differ. They are reported separately, never pooled into a cross-language scale.

### 5.3 By checkpoint

| Seed | High-overlap | Low-overlap | Difference | Exact-match 95% interval | Token-F1 difference |
|---|---:|---:|---:|---:|---:|
| 42 | 29/32 (0.906250) | 12/32 (0.375000) | **+0.531250** | 0.343750 to 0.718750 | +0.486310 |
| 43 | 28/32 (0.875000) | 9/32 (0.281250) | **+0.593750** | 0.437500 to 0.750000 | +0.478757 |
| 44 | 29/32 (0.906250) | 7/32 (0.218750) | **+0.687500** | 0.562500 to 0.812500 | +0.543299 |

All three checkpoints are positive. The checkpoints are batch-order variants of the same initialization, not independent retraining draws, so the three seed-specific intervals are descriptive and are not pooled as independent evidence.

Language-by-checkpoint detail:

| Stratum | High-overlap | Low-overlap | Difference |
|---|---:|---:|---:|
| English, seed 42 | 13/16 | 3/16 | +0.625000 |
| Chinese, seed 42 | 16/16 | 9/16 | +0.437500 |
| English, seed 43 | 12/16 | 2/16 | +0.625000 |
| Chinese, seed 43 | 16/16 | 7/16 | +0.562500 |
| English, seed 44 | 13/16 | 2/16 | +0.687500 |
| Chinese, seed 44 | 16/16 | 5/16 | +0.687500 |

### 5.4 By fact and by pair

Each fact contributes six paired observations (two languages × three seeds). Every fact's seed-mean high-overlap rate exceeded its low-overlap rate:

| Fact | High-overlap | Low-overlap | Difference |
|---|---:|---:|---:|
| p116-t01 | 6/6 | 0/6 | +1.000000 |
| p116-t02 | 6/6 | 3/6 | +0.500000 |
| p116-t03 | 6/6 | 0/6 | +1.000000 |
| p116-t04 | 6/6 | 3/6 | +0.500000 |
| p116-t05 | 6/6 | 0/6 | +1.000000 |
| p116-t06 | 6/6 | 2/6 | +0.666667 |
| p116-t07 | 3/6 | 0/6 | +0.500000 |
| p116-t08 | 6/6 | 3/6 | +0.500000 |
| p116-t09 | 5/6 | 1/6 | +0.666667 |
| p116-t10 | 6/6 | 0/6 | +1.000000 |
| p116-t11 | 6/6 | 4/6 | +0.333333 |
| p116-t12 | 6/6 | 4/6 | +0.333333 |
| p116-t13 | 6/6 | 3/6 | +0.500000 |
| p116-t14 | 3/6 | 0/6 | +0.500000 |
| p116-t15 | 4/6 | 2/6 | +0.333333 |
| p116-t16 | 5/6 | 3/6 | +0.333333 |

Fact-level direction: **16 positive, 0 zero, 0 negative.** At the fact-language level (seed-mean rates), there were **23 positive pairs, 9 zero pairs, and 0 negative pairs**. The zero pairs are cases where both conditions had the same seed-mean rate, not cases where the two conditions produced identical outputs.

High-overlap prompts were not universally sufficient: English high-overlap accuracy was 38/48, with five English pairs below 3/3; `p116-t07` and `p116-t14` English produced 0/3 high-overlap successes. Low-overlap prompts were not uniformly wrong: 28/96 low-overlap generations were exact, and nine fact-language pairs tied at the seed-mean level.

### 5.5 Generation quality by condition

| Condition | EOS | Max tokens | Error | Empty | Malformed | UTF-8 invalid | Context truncation |
|---|---:|---:|---:|---:|---:|---:|---:|
| High-overlap | 94/96 | 2/96 | 0 | 0 | 0 | 0 | 0 |
| Low-overlap | 95/96 | 1/96 | 0 | 0 | 0 | 0 | 0 |

The three max-token stops were all English. The high-overlap max-token cases produced visibly malformed continuations (for example, repeated token fragments), which is consistent with the strict exact-match metric counting them as failures. The quality data do not suggest that the low-overlap condition failed because of truncation, error stops, empty output, or invalid UTF-8; those counts are zero or near-zero in both conditions.

---

## 6. Result under the predeclared decision rule

The rule was frozen before generation and was not changed after outputs were observed.

| Condition | Requirement | Observed | Pass |
|---|---|---|---:|
| C1 | Pooled high-minus-low exact-match difference strictly positive | +0.604167 | **yes** |
| C2 | Fact-clustered 95% interval lower bound strictly greater than zero | 0.489583 > 0 | **yes** |
| C3 | Positive point estimate in English and in Chinese | +0.645833; +0.562500 | **yes** |
| C4 | At least two of three checkpoint-specific estimates positive | +0.531250; +0.593750; +0.687500 (3/3) | **yes** |
| C5 | Prompt audit passes and near-duplicate/leakage sensitivity remains positive with a clustered lower bound above zero | audit PASS; 0 pairs excluded; sensitivity D +0.604167, interval 0.489583 to 0.729167 | **yes** |

**Classification: SUPPORTED.** This is the predeclared classification, not a post hoc reinterpretation. Because no pair was excluded by the near-duplicate or leakage rule, the sensitivity analysis is identical to the primary analysis (`equalsPrimary: true` in `uncertainty.json`).

The result supports the predeclared operational hypothesis: for these facts, prompts, languages, and frozen checkpoints, a prompt with higher measured same-fact lexical overlap was more likely to elicit the exact canonical answer than a prompt with lower measured overlap. It does not establish that lexical overlap alone is the causal mechanism, because the two conditions also differ in length, directness, and some aspects of semantic route.

---

## 7. Interpretation and confounders

### 7.1 What the result does support

Within the tested domain, the direction is large and consistent:

- The pooled difference is +60.4 percentage points in exact match and +50.3 points in token F1.
- The fact-clustered interval excludes zero by a wide margin.
- English and Chinese are both positive.
- All three frozen checkpoints are positive.
- All 16 facts have a positive seed-mean direction.
- High-overlap-only successes outnumber low-overlap-only successes 59 to 1.

This is stronger than the Phase 117 association because the comparison is now paired within fact and language and the prompts were authored before any H118 output was observed.

### 7.2 What the result does not support

The contrast is not a pure lexical-overlap intervention. High and low prompts differ in several correlated ways:

1. **Length and periphrasis.** Low-overlap prompts average 5.69 more formatted tokens, with a maximum difference of 19 tokens. They also tend to be more indirect (“A hexagon's boundary consists of how many straight segments?” versus “How many sides does a regular hexagon have?”). A longer or more oblique prompt can be harder for a 1.1M-parameter model independently of its word-level overlap.
2. **Question frame and semantic route.** High-overlap prompts often preserve the training question's frame (“What is the capital city of…”, “How many … does … have?”), while low-overlap prompts use a different route to the same answer (“Where is Norway's government based?”). Word-level Jaccard does not encode word order, syntax, or the directness of the question.
3. **Near-training pattern completion.** The maximum high-overlap value is 0.888889, below the predeclared near-duplicate threshold of 0.90, but the mean high-overlap score is 0.816232. High-overlap success may therefore reflect pattern completion from prompts that are lexically close to training, not generalization to arbitrary unseen phrasings. That is a legitimate part of the tested hypothesis, but it limits the generalization claim.
4. **Language asymmetry.** Chinese high-overlap was perfect (48/48), while English high-overlap was 38/48 and English low-overlap was 7/48. The languages use different overlap tokenizations and different prompt pools. The difference in absolute rates is not evidence that one language is more “lexically sensitive”; it may reflect different training exposure, tokenization, or prompt naturalness.
5. **Fact and pair heterogeneity.** Although all 16 facts are positive at the seed-mean level, five English fact-language pairs are below 3/3 in the high condition, and nine pairs tie. The effect is a distributional shift, not a guarantee for every prompt.
6. **Checkpoint dependence.** The three checkpoints are batch-order variants of one initialization. Their agreement is useful robustness evidence, but it is not independent retraining replication.

### 7.3 Exact-match strictness

Exact match preserves case, punctuation, and wording. A semantically correct answer with a different period or a minor tokenization variant is counted wrong. This is the predeclared endpoint and is appropriate for a canonical-answer probe, but it makes the absolute rates sensitive to formatting and termination behavior. The token-F1 secondary endpoint shows the same direction and a large difference, which argues against the result being only a punctuation artifact.

---

## 8. Limitations

- **Residual length and naturalness confounding.** The low-overlap prompts are longer on average and more periphrastic. No independent naturalness ratings or length-matched construction were used. The intervention cannot separate lexical overlap from prompt length, directness, and fluency.
- **Small fact set and prompt sample.** There are 16 fact clusters and one high/low pair per fact-language. The fact-clustered interval is descriptive, not a significance test, and 16 clusters are imprecise.
- **Non-independent checkpoints.** The three seeds are batch-order variants of the same initialization; they are not independent retraining draws.
- **Strict exact match.** Formatting and termination differences count as failures. Token F1 is secondary and does not repair the strict primary endpoint.
- **Prompt-authoring bias.** Prompts were authored by the experimenter before generation, but there was no independent blinded authoring or external naturalness review. The prompt pools are a convenience sample of possible paraphrases.
- **Answer-numeral coincidence.** The t14 Chinese pair contains 六 inside 六边形 in both conditions. The audit adjudicates this as topic-inherent rather than answer leakage; because both conditions share it, it cannot explain the high-low difference, but it may affect absolute difficulty for that pair.
- **Language non-comparability.** English word-set Jaccard and Chinese character-bigram Jaccard are not on a common scale. Cross-language rate differences should not be interpreted as a measured language effect.
- **No mechanism claim.** The experiment identifies a robust prompt-level intervention effect, not an internal mechanism, representation, or universal learning principle.

---

## 9. Future hypotheses

1. **Length- and directness-matched replication (highest priority).** Author a new low-overlap set matched to the high-overlap set within ±2 formatted tokens and matched on directness of the question, then rerun the frozen evaluation. If the difference remains positive with an interval excluding zero, the lexical interpretation is materially strengthened. If it shrinks substantially, the residual length/directness confound is the better explanation.
2. **Dose-response rather than binary contrast.** Construct prompts at several predeclared overlap bands (for example, 0.2, 0.4, 0.6, 0.8) with length matched within fact-language. A monotone increase in exact match across bands would be stronger evidence than a single high/low contrast.
3. **2×2 overlap-by-directness design.** Cross high/low lexical overlap with direct/indirect question framing. This separates pattern completion from the semantic route to the answer.
4. **Language-specific replication.** Build parallel English and Chinese prompt sets with independently validated naturalness and length, and test whether the Chinese ceiling is a property of the fact set, the prompt set, or stronger Chinese recall in these checkpoints.
5. **Error taxonomy on the failures.** The nine both-incorrect pairs and the one low-overlap-only success should be analyzed for repetition, malformed token fragments, answer-format drift, and near-miss answers. This is descriptive follow-up, not a change to the frozen primary result.
6. **Independent checkpoint diversity.** Repeat with checkpoints from independently trained runs, not only batch-order variants, before making any claim about seed robustness.
7. **Broader fact and paraphrase populations.** Expand beyond 16 facts and one prompt pair per fact-language, with multiple independent prompt authors, to test whether the effect generalizes beyond this curated probe.

The single evidence-based next step is the length- and directness-matched replication in item 1. It directly targets the largest observed confound without changing the frozen Phase 118 artifacts.

---

## 10. Reproduction and artifacts

All H118 artifacts are under `experiments/h118/`; the report is at `src/lib/minimind/research/PHASE118-LEXICAL-OVERLAP-INTERVENTION-REPORT.md`.

| Artifact | Purpose |
|---|---|
| `experiments/h118/analysis-spec.json` | Predeclared protocol, endpoint, thresholds, decision rule, non-claims |
| `experiments/h118/prompts.json` | Frozen 64-prompt set with overlap and token fields |
| `experiments/h118/eval-manifest.json` | Frozen 64-item Category B evaluation manifest |
| `experiments/h118/split-manifest.json` | Frozen source-dataset split fingerprint |
| `experiments/h118/prompt-candidates.json` | Pre-generation authored candidates and adjudications |
| `experiments/h118/fact-audit.json` | Eligibility of all 16 facts in both languages |
| `experiments/h118/overlap-audit.json` | Recomputed overlap for every prompt |
| `experiments/h118/leakage-audit.json` | Full-answer and numeral leakage audit |
| `experiments/h118/duplicate-audit.json` | Training and cross-prompt duplicate audit |
| `experiments/h118/prompt-audit-summary.json` | Audit status, counts, achieved ranges, length residual |
| `experiments/h118/prompt-manifest.json` | Hash manifest for prompts and audits |
| `experiments/h118/freeze-manifest.json` | Frozen input, checkpoint, and script hashes |
| `experiments/h118/evaluate.ts` | Frozen-checkpoint evaluation wrapper |
| `experiments/h118/analyze.ts` | Frozen paired analysis and bootstrap |
| `experiments/h118/integrity.ts` | Historical and frozen-artifact integrity guard |
| `experiments/h118/runs/seed-42-eval.json` | Raw seed 42 generations and item metadata |
| `experiments/h118/runs/seed-43-eval.json` | Raw seed 43 generations and item metadata |
| `experiments/h118/runs/seed-44-eval.json` | Raw seed 44 generations and item metadata |
| `experiments/h118/evaluation-summary.json` | Run-level contract and metric summary |
| `experiments/h118/paired-analysis.json` | Primary, stratified, and decision-rule analysis |
| `experiments/h118/stratified-results.json` | Language, seed, fact, and pair strata |
| `experiments/h118/uncertainty.json` | Fact-clustered bootstrap intervals and sensitivity |
| `experiments/h118/headline.json` | Compact result summary |
| `experiments/h118/integrity-baseline.json` | Pre-generation protected-file baseline |
| `experiments/h118/integrity-post-eval.json` | Post-evaluation integrity verification |
| `experiments/h118/integrity.json` | Post-analysis integrity verification |
| `experiments/h118/integrity-final.json` | Final post-report integrity verification |

Reproduction commands:

```text
npx tsx experiments/h118/evaluate.ts --all
npx tsx experiments/h118/integrity.ts verify experiments/h118/integrity-post-eval.json
npx tsx experiments/h118/analyze.ts
npx tsx experiments/h118/integrity.ts verify experiments/h118/integrity.json
npx tsx experiments/h118/analyze.ts --verify-determinism
npx tsx src/lib/minimind/research/tests/phase118-lexical-overlap.test.ts
```

The focused test suite checks the predeclared specification, frozen prompts, independent overlap recomputation, duplicate and leakage rules, token counts, manifests, all three evaluation runs, paired arithmetic and partitioning, bootstrap consistency, sensitivity, the exact decision rule, digest identity, historical integrity, and the presence of this report. Result: **24 passed, 0 failed, 0 skipped**.

**No training was performed.** No checkpoint was written or modified. The result is **not committed**; no commit, push, reset, clean, or `git add -A` was performed. All source checkpoints and prior reports remain read-only.
