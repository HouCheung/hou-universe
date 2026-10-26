# Phase 115 — MiniMind Closed-Domain Paraphrase Generalization

- **Date:** 2026-10-21
- **Status:** Complete; all artifacts written; **not committed or pushed**
- **Model:** MiniMind production config — vocab 300, dModel 128, 4 heads, dFF 512, 4 layers, maxSeqLen 256, 1,126,528 parameters, no positional encoding
- **Initial / baseline checkpoint:** `experiments/phase114/phase114-final.ckpt.json`
- **Primary endpoint:** category B exact match — an unseen phrasing of a fact whose answer was trained
- **Verdict:** **Grade A — Supported**, strictly within the closed-domain, 12-fact setting defined below

> **Scope guard.** This phase tests whether SFT on three hand-authored phrasings per
> fact transfers to two held-out phrasings of the *same twelve facts*. It does not
> test world knowledge, unseen facts, open-domain chat, reasoning, or general
> intelligence. Category C exists only as a diagnostic for unseen facts. Nothing in
> this report changes the Phase 113 verdict (C — Not supported) or the Phase 114
> diagnostic conclusions about the Phase 113 experiment.

---

## 1. Frozen question

Can the Phase 114 chat-SFT checkpoint, after one controlled SFT run on a small
closed-domain fact set, answer a semantically equivalent question whose exact
wording was absent from training?

| Category | Definition | Count | Role |
|---|---|---|---|
| **A** | Exact prompt–answer pair used in training | 72 | Seen-phrasing floor |
| **B** | Unseen phrasing of a fact whose answer appears in training | 48 | **Primary endpoint** |
| **C** | A fact whose prompt, answer, and paraphrases are absent from training | 24 | Secondary diagnostic only |

The predeclared rule (`decision-rule.json`, frozen before candidate evaluation)
treats A as a floor: if A is poor, a B failure cannot be attributed to paraphrase
generalization. C is never reported as paraphrase generalization.

---

## 2. Frozen inputs and contracts

| Input | Value |
|---|---|
| Initial checkpoint | `experiments/phase114/phase114-final.ckpt.json` |
| Initial checkpoint SHA-256 | `62e8ff3c4a865171b300336c34b7a99b9a9336dd13f826c50995f2e74e78db1a` |
| Tokenizer | Byte-level BPE, 300 tokens, seed 42, trained on the production corpus |
| Tokenizer fingerprint | `a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d` |
| Source dataset SHA-256 | `f2fadb9b0e43f1b9c0e71cc7fd244dac399a65e417c109f906ab35b9d56799f6` |
| Derived training dataset SHA-256 | `9cf0f9d24d48df2fdafc369324f32968ec96aa7d01f7e0d14d10960700b22c28` |
| Evaluation manifest SHA-256 | `264738130e2edba7b881a3cc0f0b2c596f25b6e7cf092d3d72d3c7c0c074aef3` |
| Decision rule SHA-256 | `baee90c99a9aa239f3043f27833d8fc394116abdaada44a26c21f867a2db3ec5` |
| Prompt template | `User: <prompt>\nAssistant: ` |
| Sequence contract | `encode(prompt) ++ encode(" " + answer) ++ [<eos>]`; assistant-only mask; EOS id 3 |
| Decoding | greedy, `temperature 0`, `topK 40`, `topP 0.9`, seed 42, `maxTokens 40`, EOS id 3, `enforceUtf8 true` |
| Context limit | 128 tokens; maximum observed prompt 60 tokens; maximum observed sequence 73 |

The tokenizer was rebuilt from the production corpus in every script and its
fingerprint was compared with the frozen value before use. The initial checkpoint
was validated with `analyzeCheckpointJSON`; its embedded tokenizer state produced
the same fingerprint.

---

## 3. Dataset design and audit

### 3.1 Design

- **20 facts**, split by fact ID *before* any phrasing role was assigned:
  - 12 train facts (`p115-t01` … `p115-t12`)
  - 4 validation facts (`p115-v01` … `p115-v04`)
  - 4 test facts (`p115-s01` … `p115-s04`)
- **168 hand-authored phrasings**, each with a stable fact ID, language, canonical
  answer, prompt, and split/category metadata.
  - Train facts: 5 phrasings per language (3 `train`, 2 `unseen-paraphrase`)
  - Validation/test facts: 3 phrasings per language (`validation` / `unseen-fact`)
- **Languages:** English and Chinese only. Mixed-language phrasings were excluded
  because with only 20 facts a third balanced language condition was not possible;
  including it would have made language and fact-split effects inseparable.
- **No automatic paraphrase generation.** Every phrasing was written and inspected
  by hand before training.
- **Canonical answers** are identical across all phrasings of a fact in a given
  language. Exact match is computed after the production
  `normalizeChatAnswer` (NFC, CRLF→LF, trim, collapse whitespace, cut turn leaks).
- **Facts are disjoint from Phase 113.** A deterministic exact-string comparison
  against the Phase 113/114 chat-SFT dataset
  (`src/data/minimind/datasets/chat-sft.json`, 132 samples, 168 unique user
  prompts, 165 unique assistant answers) found **0/168 prompt overlaps** and
  **0/40 canonical-answer overlaps**, after the same normalization used for
  exact match.

### 3.2 Split sizes

| Split | Facts | Samples |
|---|---|---|
| Training (`training-sft.json`) | 12 (train only) | 72 |
| Validation (`validation-manifest.json`) | 4 (held-out facts) | 24 |
| Evaluation (`eval-manifest.json`) | 12 train + 4 test | 144 (A 72, B 48, C 24) |

Per category and language: A en 36 / zh 36; B en 24 / zh 24; C en 12 / zh 12.

### 3.3 Audit

`build-dataset.ts` produced `dataset-audit.json` with `pass: true` and
`issues: []`. The audit checked, among other things:

- unique fact IDs, phrasing IDs, and prompt strings;
- fact split disjointness;
- role legality (train facts cannot carry test roles and vice versa);
- canonical-answer consistency across phrasings;
- no category-C answer in the training answers;
- category A is exactly the training prompt set;
- categories B and C have **zero** exact prompt overlap and **zero** exact
  prompt–answer-pair overlap with training;
- prompt token length ≤ 88 and full sequence length ≤ 128;
- each `encodeChatSftSample` result fits the block size.

`leakage-report.json` records `pass: true`: 72 training prompts, 72 training pairs,
144 evaluation prompts, exact overlap only in category A (by definition), and empty
B/C overlap lists.

A separate deterministic cross-phase check compared all 168 Phase 115 prompts and
all 40 canonical answers with the Phase 113/114 chat-SFT dataset. It found zero
exact overlaps in either direction. The focused suite now enforces this check on
every run.

### 3.4 Dataset artifacts

| Artifact | SHA-256 |
|---|---|
| `dataset.source.json` | `f2fadb9b0e43f1b9c0e71cc7fd244dac399a65e417c109f906ab35b9d56799f6` |
| `training-sft.json` | `9cf0f9d24d48df2fdafc369324f32968ec96aa7d01f7e0d14d10960700b22c28` |
| `eval-manifest.json` | `264738130e2edba7b881a3cc0f0b2c596f25b6e7cf092d3d72d3c7c0c074aef3` |
| `validation-manifest.json` | `1cc84fd31e1b50f4765ad975fc4f60a61cdc17bc5240560c509307d903c93bb8` |
| `dataset-audit.json` | `1d8dcc3aeecd1abab6b7a0292e3c0aa9221460a8a6d908f5eb248cc88880948f` |
| `leakage-report.json` | `b2f9e74dac36c04e95602a565fea868534d00cffb604855fc604945e4428505e` |
| `split-manifest.json` | `55bbcfb53248c917fa74b7973dc721252035d6eb4866c927389175acef76b31a` |

---

## 4. Measured results — baseline

The exact Phase 114 final checkpoint was evaluated on the frozen manifest before
training. Baseline and training initial state are therefore the same file; this
isolates the effect of the Phase 115 SFT run.

| Baseline (Phase 114 final) | Correct | Total | Rate | Mean token F1 |
|---|---|---|---|---|
| Category A | 0 | 72 | 0.00% | 0.0920 |
| **Category B (primary)** | **0** | **48** | **0.00%** | **0.0904** |
| Category C | 0 | 24 | 0.00% | 0.0633 |
| Overall | 0 | 144 | 0.00% | 0.0867 |

Stop reasons: 114 EOS, 30 max-token; empty outputs 0. UTF-8 enforcement was active
on all 144 items; no context truncations, no error stops. Fifteen outputs dropped
an incomplete UTF-8 tail, which is a normal consequence of byte-level decoding at
the token limit and not an integrity-gate failure.

**Measured fact:** the Phase 114 checkpoint has no exact-match knowledge of these
20 facts under this prompt format. Any A and B improvement after training cannot
be attributed to pre-existing knowledge of this fact set.

---

## 5. Measured results — training

One candidate only. The recipe was fixed in advance and not swept.

### 5.1 Configuration

| Parameter | Value |
|---|---|
| Seed | 42 |
| Initial checkpoint | Phase 114 final (`62e8ff…`) |
| Block size | 128 |
| Batch size | 4 |
| Epochs | 16 |
| Total optimizer steps | 288 (18 batches/epoch × 16) |
| Learning rate | 5e-4, cosine decay to 5e-5 |
| Warmup | 28 steps |
| Optimizer | AdamW, betas 0.9/0.999, eps 1e-8 |
| Weight decay | 0.01 |
| Gradient clipping | 1.0 |
| Gradient accumulation | 1 |
| Loss | cross-entropy with assistant-only mask and EOS supervision |
| Log interval | 72 steps |
| Training duration | 1,402,341 ms (23.4 min) |

### 5.2 Candidate losses and fit

Validation loss is teacher-forced cross-entropy on the 24 held-out-fact validation
samples. Train fit is teacher-forced token accuracy and exact-sequence count on the
72 training samples. `Last batch loss` is the last logged training batch loss at
that step, not an epoch average.

| Step | Validation loss | Train token acc | Train sequence exact | Train NLL | Last batch loss |
|---|---|---|---|---|---|
| 0 (initial) | 4.827108 | — | — | — | — |
| 72 | 3.608569 | 758/807 (93.93%) | 43/72 | 0.3373 | 0.2804 |
| **144 (best val)** | **3.559965** | 770/807 (95.42%) | 53/72 | 0.1341 | 0.1163 |
| 216 | 3.685791 | 791/807 (98.02%) | 62/72 | 0.0491 | 0.00809 |
| **288 (final)** | **3.682647** | **803/807 (99.50%)** | **69/72** | **0.02318** | **0.004376** |

Validation loss bottoms out at step 144 and then rises, while training fit keeps
improving. By the validation-loss criterion the step-144 snapshot is “best”; by
the primary exact-match endpoint the step-288 snapshot is better (section 6).

### 5.3 Retained candidates

| Candidate | Step | Validation loss | Path | SHA-256 | Bytes |
|---|---|---|---|---|---|
| Initial | 0 | 4.827108 | `experiments/phase114/phase114-final.ckpt.json` | `62e8ff3c4a865171b300336c34b7a99b9a9336dd13f826c50995f2e74e78db1a` | 108,738,768 |
| Best validation | 144 | 3.559965 | `experiments/phase115/phase115-best.ckpt.json` | `56236e5bbfd0042c9a60c3a9f66735bba5bbce53e687cfa3db57a13fa83e5775` | 108,176,741 |
| Final | 288 | 3.682647 | `experiments/phase115/phase115-final.ckpt.json` | `5437f4e47e4a0ab0e54844ade2d7544c14f7020b09d81fcb7dfd9191c3d4a98d` | 108,772,143 |

The initial candidate is the untouched Phase 114 file and was not copied into
`experiments/phase115/`. The Phase 114 checkpoint hash was re-verified after
training.

---

## 6. Measured results — evaluation

Every retained candidate was evaluated on the same 144 frozen prompts, in the same
order, with the same tokenizer, prompt template, and decoding settings. No prompt,
answer, or category was changed after results were seen.

### 6.1 Exact match by category

| Candidate | A | **B (primary)** | C | Overall | Mean token F1 | EOS stops | Empty outputs |
|---|---|---|---|---|---|---|---|
| Baseline (Phase 114 final) | 0/72 (0.00%) | **0/48 (0.00%)** | 0/24 (0.00%) | 0/144 (0.00%) | 0.0867 | 114/144 | 0 |
| Best validation (step 144) | 55/72 (76.39%) | **23/48 (47.92%)** | 0/24 (0.00%) | 78/144 (54.17%) | 0.6714 | 124/144 | 0 |
| Final (step 288) | 71/72 (98.61%) | **25/48 (52.08%)** | 0/24 (0.00%) | 96/144 (66.67%) | 0.7496 | 144/144 | 0 |

Mean token F1 by category:

| Candidate | A | B | C |
|---|---|---|---|
| Baseline | 0.0920 | 0.0904 | 0.0633 |
| Best validation | 0.8900 | 0.6062 | 0.1456 |
| Final | 0.9980 | 0.6771 | 0.1492 |

### 6.2 By language

| Candidate | A en | A zh | B en | B zh | C en | C zh |
|---|---|---|---|---|---|---|
| Baseline | 0/36 | 0/36 | 0/24 | 0/24 | 0/12 | 0/12 |
| Best validation | 24/36 (66.67%) | 31/36 (86.11%) | 6/24 (25.00%) | 17/24 (70.83%) | 0/12 | 0/12 |
| Final | 36/36 (100.00%) | 35/36 (97.22%) | 8/24 (33.33%) | 17/24 (70.83%) | 0/12 | 0/12 |

### 6.3 Per-fact category B, final candidate

| Fact | Topic | B correct | en | zh |
|---|---|---|---|---|
| `p115-t01` | Capital of Germany | 4/4 | 2/2 | 2/2 |
| `p115-t02` | Capital of Russia | 3/4 | 1/2 | 2/2 |
| `p115-t03` | Sides of a triangle | 2/4 | 1/2 | 1/2 |
| `p115-t04` | Minutes in an hour | 1/4 | 0/2 | 1/2 |
| `p115-t05` | Color of a clear sky | 2/4 | 0/2 | 2/2 |
| `p115-t06` | Largest planet | 3/4 | 1/2 | 2/2 |
| `p115-t07` | Gas taken in by plants | 3/4 | 1/2 | 2/2 |
| `p115-t08` | Boiling point of water | 1/4 | 0/2 | 1/2 |
| `p115-t09` | What bees make | 1/4 | 0/2 | 1/2 |
| `p115-t10` | Day after Monday | 1/4 | 1/2 | 0/2 |
| `p115-t11` | Hardest natural substance | 2/4 | 1/2 | 1/2 |
| `p115-t12` | Season after winter | 2/4 | 0/2 | 2/2 |

All 12 trained facts have at least one successful B item. No fact is at 0/4; the
range is 1/4 to 4/4.

### 6.4 Integrity

| Check | Baseline | Best validation | Final |
|---|---|---|---|
| UTF-8 enforcement active | 144/144 | 144/144 | 144/144 |
| Invalid UTF-8 | 0 | 0 | 0 |
| Dropped incomplete UTF-8 tail | 15 | 0 | 0 |
| Empty-candidate stop | 0 | 0 | 0 |
| Context truncation | 0 | 0 | 0 |
| Error stop | 0 | 0 | 0 |
| Empty normalized output | 0 | 0 | 0 |
| Max-token stop | 30 | 20 | 0 |
| EOS stop | 114 | 124 | 144 |

The predeclared integrity gate (UTF-8 enforced on every item, zero context
truncations, zero error stops) passes for both trained candidates.

### 6.5 Representative outputs

Final candidate, successes:

| Category | Prompt | Gold | Prediction |
|---|---|---|---|
| A | What is the capital of Germany? | Berlin. | Berlin. |
| A | Which city is the capital of Germany? | Berlin. | Berlin. |
| **B** | Germany's capital is which city? | Berlin. | Berlin. |
| **B** | What city serves as the capital of Germany? | Berlin. | Berlin. |

Final candidate, failures (preserved verbatim after normalization):

| Category | Prompt | Gold | Prediction |
|---|---|---|---|
| A | 请说出蜜蜂制造的东西。 | 蜂蜜。 | 蜂蜂蜜。 |
| **B** | Russia's capital is which city? | Moscow. | BersconCarbon . |
| **B** | What number of sides does a triangle have? | Three sides. | Three s. |
| **B** | 三角形的边数是多少？ | 三条边。 | 条边。 |
| C | What is the capital of India? | New Delhi. | Diday. |
| C | Which city is the capital of India? | New Delhi. | Berlin. |
| C | Name the capital city of India. | New Delhi. | Diday. |

The best-validation candidate also produced degenerate repetitions that the final
candidate did not, for example `Three sidesidesidesidesidesidesidesidesid` for a
triangle prompt. This is consistent with the 20 max-token stops at step 144 versus
0 at step 288.

---

## 7. Decision-rule application

The rule below was written to `decision-rule.json` and hashed
(`baee90c99a9aa239f3043f27833d8fc394116abdaada44a26c21f867a2db3ec5`) before any
candidate evaluation was run.

**Grade A — Supported** requires all of:

| Condition | Required | Final candidate | Best-validation candidate |
|---|---|---|---|
| Category B ≥ 12/48 | yes | 25/48 | 23/48 |
| Category B − baseline B ≥ 6 | yes | 25 − 0 = 25 | 23 − 0 = 23 |
| ≥ 4 of 12 train facts with ≥ 1 B success | yes | 12/12 | 12/12 |
| Both languages ≥ 1 B success | yes | en 8, zh 17 | en 6, zh 17 |
| Category A ≥ 48/72 | yes | 71/72 | 55/72 |
| Integrity gate | yes | pass | pass |

**Result: Grade A — Supported.** Both retained candidates independently satisfy the
frozen Grade-A rule; the final candidate is higher on A, B, overall exact match,
mean token F1, and EOS completion. No threshold, category, prompt, or metric was
changed after seeing these numbers.

The verdict is limited to this closed set of 12 facts and this definition of
category B. It does not convert Phase 113 into a success and does not establish
general chat ability.

---

## 8. Interpretation (separate from measured results)

### 8.1 What the measurement supports

Within the frozen domain, the Phase 115 SFT run moved category B from **0/48 to
25/48** while moving category A from 0/72 to 71/72. Because the baseline had no
exact-match knowledge of these facts, and because no B prompt or B prompt–answer
pair appeared in training, the B improvement is evidence of **closed-domain
paraphrase transfer**: the model answers some semantically equivalent questions
whose exact wording it never saw.

It is also evidence against pure surface-string memorization of the training
prompts: 25 correct B items are, by construction, prompts absent from training.

### 8.2 What the measurement does not support

- It does **not** show world knowledge. Category C is 0/24 for every candidate.
- It does **not** show unseen-fact answering. The four test facts (India, gold, the
  king of the jungle, the opposite of cold) were never trained; the model either
  produced a malformed string (“Diday.”) or substituted a trained answer
  (“Berlin.” for India).
- It does **not** show general reasoning. The facts are atomic, single-answer
  associations with short canonical answers.
- It does **not** show that the model represents syntax or composition. The model
  has no positional encoding, and the exploratory analysis below suggests that
  content-word overlap is a strong correlate of success.

### 8.3 Exploratory lexical-overlap analysis (post hoc)

For each B prompt, the maximum token-set Jaccard overlap with the three training
prompts of the same fact and language was computed. This analysis was not
predeclared and is exploratory.

| Group | Mean max Jaccard |
|---|---|
| English B, correct (8) | 0.727 |
| English B, incorrect (16) | 0.538 |
| Chinese B, correct (17) | 0.698 |
| Chinese B, incorrect (7) | 0.533 |
| All English B (24) | 0.601 |
| All Chinese B (24) | 0.650 |

Correct paraphrases tend to share more content tokens/characters with training
phrasings. The association is not deterministic: several English B prompts with
Jaccard 1.0 still fail, and some low-overlap prompts succeed. Chinese B prompts
have slightly higher mean overlap, which is one plausible contributor to the
Chinese advantage (17/24 vs 8/24), but the experiment does not isolate this from
tokenizer, template, or answer-length effects.

### 8.4 Why the validation-loss “best” is not the B “best”

Validation loss is measured on the four held-out **facts**, not on unseen
**phrasings of trained facts**. It is therefore not a proxy for category B. Step
144 has the lowest validation loss but produces degenerate repetitions and only
23/48 B; step 288 has higher validation loss but 25/48 B and 144/144 EOS stops.
Retaining initial, best-validation, and final separately made this visible; choosing
only by validation loss would have selected the weaker candidate for the primary
endpoint. No post-hoc change was made to the selection metric.

### 8.5 Uncertainty

Naive item-level Wilson 95% intervals, ignoring clustering of four B items per
fact, are approximately:

- final B overall 25/48 = 52.1% [38.3%, 65.5%]
- final B English 8/24 = 33.3% [18.0%, 53.3%]
- final B Chinese 17/24 = 70.8% [52.1%, 83.8%]

Because the four B items per fact are not independent, the effective sample size
is smaller than 48 and these intervals are optimistic. The point estimate should be
read as “well above baseline in this dataset,” not as a precise generalization
rate.

---

## 9. Limitations

1. **Small fact set.** Twelve trained facts, four validation facts, four test facts.
   The entire B endpoint is 48 items, four per fact.
2. **One run.** One seed, one architecture, one recipe, one training duration. No
   replication; the result may be seed-sensitive.
3. **Hand-authored paraphrases.** One author wrote all phrasings; categories B
   phrasings share content words with A phrasings by design. No adversarial
   paraphrase, syntactic transformation, or automatic paraphrase generation was
   tested.
4. **Language scope.** English and Chinese only; mixed-language prompts excluded.
   The en/zh asymmetry is descriptive, not causal.
5. **Greedy decoding only.** The primary endpoint uses one deterministic decode.
   Sampling, beam search, and pass@k were not evaluated.
6. **Exact match after normalization.** Token F1 is reported but is not the primary
   metric; a partially correct answer counts as a failure for B.
7. **Category C is coarse.** Four unseen facts, 24 items. C = 0/24 rules out success
   on these four facts under this format, not on all unseen facts.
8. **Validation loss is not the endpoint.** The best-validation checkpoint was not
   the best candidate on B; this phase does not establish a general model-selection
   rule.
9. **No mechanism claim.** The model has no positional encoding. Lexical-overlap
   correlations are exploratory and do not identify an internal mechanism.
10. **Checkpoint size.** Retained checkpoints include full optimizer state and are
    roughly 108 MB each; they are research artifacts, not deployment artifacts.
11. **Baseline is the initial checkpoint.** The “before” measurement and the
    training initial state are the same Phase 114 file by design, not two
    independent baselines.

---

## 10. Artifacts, tests, and historical integrity

### 10.1 Phase 115 artifacts

| Artifact | SHA-256 |
|---|---|
| `experiments/phase115/baseline-phase114-final-results.json` | `a482726e61e899225dc7aeadbbca5ec7c941992e04fd294b4b9f3ad01172c9c7` |
| `experiments/phase115/training-result.json` | `40f2fdd6639f21cdd870fc4c9c09c84ba6695301a632bcc6945c2b99135e6e63` |
| `experiments/phase115/phase115-best-results.json` | `2d86a59b21c3bd47ec324ddce7b7c539c471784501cbd5813ab34377818e6c58` |
| `experiments/phase115/phase115-final-results.json` | `51283f934e645caac265a31d672f57963d9ee8db58b9b42b155357aa6d93f59e` |
| `experiments/phase115/phase115-best.ckpt.json` | `56236e5bbfd0042c9a60c3a9f66735bba5bbce53e687cfa3db57a13fa83e5775` |
| `experiments/phase115/phase115-final.ckpt.json` | `5437f4e47e4a0ab0e54844ade2d7544c14f7020b09d81fcb7dfd9191c3d4a98d` |
| `experiments/phase115/dataset.source.json` | `f2fadb9b0e43f1b9c0e71cc7fd244dac399a65e417c109f906ab35b9d56799f6` |
| `experiments/phase115/training-sft.json` | `9cf0f9d24d48df2fdafc369324f32968ec96aa7d01f7e0d14d10960700b22c28` |
| `experiments/phase115/eval-manifest.json` | `264738130e2edba7b881a3cc0f0b2c596f25b6e7cf092d3d72d3c7c0c074aef3` |
| `experiments/phase115/decision-rule.json` | `baee90c99a9aa239f3043f27833d8fc394116abdaada44a26c21f867a2db3ec5` |

Source and build scripts: `build-dataset.ts`, `train.ts`, `evaluate.ts`,
`summarize.ts`. Focused test:
`src/lib/minimind/research/tests/phase115-paraphrase.test.ts`.

### 10.2 Reproduction

```bash
npx tsx experiments/phase115/build-dataset.ts
npx tsx experiments/phase115/train.ts
npx tsx experiments/phase115/evaluate.ts baseline-phase114-final \
  experiments/phase114/phase114-final.ckpt.json \
  experiments/phase115/baseline-phase114-final-results.json
npx tsx experiments/phase115/evaluate.ts phase115-best \
  experiments/phase115/phase115-best.ckpt.json \
  experiments/phase115/phase115-best-results.json
npx tsx experiments/phase115/evaluate.ts phase115-final \
  experiments/phase115/phase115-final.ckpt.json \
  experiments/phase115/phase115-final-results.json
npx tsx src/lib/minimind/research/tests/phase115-paraphrase.test.ts
npm run build
```

### 10.3 Test and build results

- Phase 115 focused suite: **24 passed, 0 failed, 0 skipped.** This includes the
  cross-phase zero-overlap check against the Phase 113/114 dataset.
- `npm run build`: **exit 0.** The build emits pre-existing ESLint warnings in
  unrelated test files; no Phase 115 file produced a type error or lint error after
  the summarize fix.
- A broader historical research suite (`src/lib/minimind/research/__tests__/run.ts`)
  was started as an extra check and later stopped: it exceeds the Phase 115 scope,
  and its import chain re-stamps a volatile field in the Phase 99 artifact (see
  §10.4). No Phase 115 result depends on it.
- `npx tsc --noEmit` still reports pre-existing errors in unrelated test files
  (phase 54/58/60/61/65/66/67/72/84/89/90 and older training tests). No Phase 115
  source file is among them.

### 10.4 Historical artifacts

No shared source file was modified. No Phase 90, 113, or 114 checkpoint, dataset,
result, log, or verdict was overwritten.

| Historical artifact | SHA-256 (still present) |
|---|---|
| `src/data/minimind/datasets/chat-sft.json` (Phase 113/114 corpus) | `efea181ee833ce1e584ebbb493b111c7c1b9955d40591d2420ada9c36e539312` |
| `experiments/phase114/phase114-final.ckpt.json` | `62e8ff3c4a865171b300336c34b7a99b9a9336dd13f826c50995f2e74e78db1a` |
| `experiments/phase114/phase114-final-results.json` | `356117eb07feaa84ec6548c61aedc151b0628e965dc5b4ddb87025a24a30a077` |
| `experiments/phase114/train-final.ts` | `2e9443b10330ed86b7a788b43c2d3c6620733698c25f3fb1e88d442b0cfa9cd1` |
| `experiments/phase113/phase113-sft.ckpt.json` | `f56e4ce39aa3c86981613f6c5361d8e7fa57aa4389625e7455a7202ddea0288d` |
| `experiments/phase113/phase113-control.ckpt.json` | `fe679cbc2a8745a83b04acc556c69b074a0d551398ad1d4f69310659f469415e` |
| `experiments/phase113/eval-results.json` | `b0a9a3d3a08bb4c90f45d4a6c7b6b4f48b4d6b882cad3bd88bbbea0d1511427b` |
| `experiments/phase113/verdict.json` | `5424f20fb783f6311603fd3a48dc2842316d1a7998092ec456bef39c68d5fd34` |
| `experiments/phase99/logit-mechanism-audit.json` | raw `f6cb143ad205772455b7ba436c9812fd0a26da8d1ddd4a8d8238b29429d4efb8`; scientific `35eb66d11614a490fb87f2245a3c4c117ba77c18a128734c22a93988457fd9c6` |

**One volatile field changed by the stopped broad suite — disclosed.** The aggregate
suite imports the Phase 99 audit module, which executes its `main()` on import and
re-stamps `experiments/phase99/logit-mechanism-audit.json` with a fresh wall-clock
`durationMs`. The file's raw SHA-256 changed to
`f6cb143ad205772455b7ba436c9812fd0a26da8d1ddd4a8d8238b29429d4efb8` while the byte
length stayed 213,306. Its canonical **scientific digest**, which excludes the
single volatile `durationMs` field, is still
`35eb66d11614a490fb87f2245a3c4c117ba77c18a128734c22a93988457fd9c6` — the value
recorded in Phases 110 and 111. This is the documented Phase-99/Phase-102 import
side effect, not a change to scientific content. The suite was stopped after this
was detected; a targeted scan found no other historical experiment file modified
during the run.

Git status at the end of the phase shows only the new untracked
`experiments/phase115/` directory, the new focused test file, and this report.
Nothing was staged, committed, pushed, reset, cleaned, or discarded.

---

## 11. Conclusion

Within a hand-authored, closed-domain set of 12 facts, one controlled SFT run moved
the predeclared primary metric — exact match on unseen phrasings of trained facts —
from **0/48 to 25/48**, while seen-phrasing exact match reached **71/72**. Both
retained candidates satisfy the frozen Grade-A rule; unseen-fact accuracy remained
**0/24**. The result supports **closed-domain paraphrase generalization** and does
not support world knowledge, unseen-fact answering, or general intelligence.

The single most informative next step is **replication across seeds and a larger,
independently authored fact set**, with category B kept as the primary endpoint.
The current estimate rests on one run and 48 clustered B items; a multi-seed,
larger-fact replication is needed before treating 52% as a stable property of this
architecture or recipe. Extending the same design to a second architecture or to
syntactic transformations would then separate content-word association from
genuine compositional transfer.
