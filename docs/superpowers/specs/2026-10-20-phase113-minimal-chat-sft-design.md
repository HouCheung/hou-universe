# Phase 113 — Minimal Chat SFT — Design

**Date:** 2026-10-20
**Status:** DESIGN ONLY. No dataset file, production code, training run, generation,
checkpoint load, research probe, package install, or Git operation was performed while
writing this document.
**Hypothesis:** H113 — supervised fine-tuning of the existing pretrained MiniMind
checkpoint on a small, explicitly split chat-formatted Q/A corpus, with loss applied only
to assistant answer tokens and the terminating `<eos>`, produces measurably more correct
answers on independently authored held-out questions than (A) the same checkpoint without
SFT and (C) a control trained on deterministically mismatched answers under an otherwise
identical recipe.
**Training:** `NOT RUN` — pre-registered, not executed.

---

## 0. Prior-art audit — duplication and conflict check

### 0.1 Repository state

The repository carries a large uncommitted backlog. At design time the newest commit is
`351e68b feat(minimind): Phase 96 augmentation transfer experiment`. Phases 84–112 and
their artifacts are **not** to be modified. Phase 112 is deferred; its design and plan
documents remain unchanged. Phase 113 does not commit Phase 112 or any earlier phase.

### 0.2 No duplication

No earlier phase trains a supervised chat objective:

- Phases 84–93 study pretraining layout, tokenizer budget, and capacity.
- Phase 94 studies rollout augmentation; Phase 95 repairs an instrument; Phase 96 tests
  transfer. All are pretraining-objective experiments.
- Phases 97–112 are generation-time mechanism audits (positions, UTF-8 phases, P0/P1/P2
  mass, failure populations, grid closure). None trains assistant-only loss masking.
- The production `TextDataset` supports document-aligned masks for *pretraining*
  documents, but it cannot express an assistant span inside a multi-turn chat sample.
  Phase 113 therefore needs a new, focused dataset class — not a modification of
  `TextDataset`, `datasetSchema.ts`, or `bilingual.json`.

The chat UI already formats `User: …\nAssistant: …` prompts (`chatAdapter.ts`) and already
has a local checkpoint-import path (`checkpointImport.ts`). Phase 113 reuses both; it does
not add a chat route, a training dashboard, or a new inference framework.

### 0.3 Import prohibition

The SFT implementation must not import the Phase 99, 101, or 102 module chains. It may
import only the frozen production/pretraining modules listed in §15.2. The existing
`GenerationEvaluator` internally imports the Phase-98-era UTF-8 utilities; that dependency
is unchanged existing production code, not a new import of a historical experiment chain.

No conflict was found that requires the research question to be changed or abandoned.

---

## 1. Research question

### 1.1 Primary question

> Does assistant-only supervised fine-tuning of the existing pretrained MiniMind
> checkpoint on chat-formatted Q/A data improve answers on independently authored
> held-out questions, relative to (A) the same checkpoint without SFT and (C) a control
> trained on deterministically mismatched answers?

This is a **model-capability** question about the repository's own model. It is not a
website redesign, a dashboard, or a new research-visualization project.

### 1.2 What counts as success

Success requires **all** of the following under the frozen primary evaluation. Let
`correct_A`, `correct_B`, and `correct_C` be the integer counts of greedy normalized
exact matches over the same 27 held-out questions.

1. `correct_B >= 5` (at least five of the 27 held-out questions are correct).
2. `correct_B > correct_A`.
3. `correct_B > correct_C`.
4. `correct_B - max(correct_A, correct_C) >= 2`.
5. At least one of the items counted in `correct_B` is in each of `en`, `zh`, and `mixed`.

### 1.3 What this does **not** establish

- It does not establish fluent conversation.
- It does not establish general language understanding.
- It does not establish that P012 (UTF-8 legality) taught the model anything; P012 is a
  decoding safeguard, never a learned capability and never a substitute for SFT.
- It does not establish causality beyond this specific controlled experiment and this
  dataset.
- A masked, UTF-8-clean response is not evidence of understanding.

---

## 2. Non-goals

- No new model architecture, tokenizer, vocabulary, merge table, positional encoding,
  inference framework, backend, or UI state-management library.
- No in-browser SFT training. Training runs in a controlled Node research probe; the
  resulting checkpoint is imported through the existing chat checkpoint interface.
- No website redesign, new chat route, training dashboard, or research-visualization
  pages.
- No external model API substituted for the project model.
- No modification of Phases 84–112, their evidence, or Phase 112's documents.
- No change to `TextDataset`, `datasetSchema.ts`, `bilingual.json`, `Trainer`,
  `CrossEntropyLoss`, `GenerationEvaluator`, `utf8Constrained`, or `checkpointImport`.
- No claim of fluency, general intelligence, or causal proof from a 27-item test.

---

## 3. Frozen assets

### 3.1 Base checkpoint

| Field | Value |
|---|---|
| Path | `experiments/phase90/phase90-aligned.ckpt.json` |
| SHA-256 | `dff07a8366ba21e4a75c0ed48172bdc6848a882f252b2377e112c6152adcbc5e` |
| Bytes | 73,605,758 |
| Version | 3 |
| Metadata | **absent** (`metadata: undefined`) |
| Optimizer state | AdamW, `stepCount = 3000`, `lr = 1e-5`, betas `[0.9, 0.999]`, eps `1e-8`, weight decay `0.01` |
| Training | Phase 90 condition B, document-aligned layout, block size 64, 3000 steps, seed 42 |
| Best loss | `0.12216150085745724` |

**Rationale for selecting Phase 90 aligned over Phase 96 treatment:**

- Phase 90 aligned is the canonical reference recipe: document-aligned layout, corrected
  1-step objective, the production tokenizer budget, and the strongest recorded
  memorization evidence.
- It is the reused **baseline** in Phases 94 and 96; selecting it keeps Phase 113's
  no-SFT arm comparable to the repository's existing capability measurements.
- Phase 96 treatment is an *augmentation* treatment with a negative transfer verdict and
  an init confound (baseline first-step loss `6.0273` vs treatment `5.9772`). Using it
  would make the SFT comparison harder to attribute.

The base checkpoint is loaded **read-only**. Its file is never overwritten.

### 3.2 Tokenizer

The base checkpoint predates `metadata.tokenizerState`. The intended tokenizer is
reconstructed deterministically, using the exact Phase-90 construction:

```ts
Random.setSeed(42);
const tokenizer = new BPETokenizer();
tokenizer.train(getDatasetTexts(loadProductionDataset()), 300);
```

Frozen properties:

| Field | Value |
|---|---|
| Type | byte-level BPE |
| Vocabulary size | 300 |
| Special tokens | `<pad>=0`, `<unk>=1`, `<bos>=2`, `<eos>=3` |
| Byte tokens | 4–259 |
| Training corpus | all 600 samples of `bilingual.json` (the Phase-90 corpus) |
| RNG | deterministic; `BPETokenizer.train` does not consume `Random` |

The reconstruction is a **limitation**, not a blocker: the original pretraining tokenizer
state was never serialized. Phase 113 records a SHA-256 fingerprint of the reconstructed
`toState()` JSON in every artifact and verifies that all three conditions agree before
evaluation. The SFT and control checkpoints **write** `metadata.tokenizerState`, so future
imports do not need reconstruction.

### 3.3 Model architecture

Production config from `ModelRegistry`:

| Field | Value |
|---|---|
| vocabSize | 300 |
| dModel | 128 |
| numHeads | 4 |
| dFF | 512 |
| numLayers | 4 |
| maxSeqLen | 256 |
| eps | 1e-6 |
| Parameter count | 1,126,528 |

No architecture change is permitted.

### 3.4 Evaluation instrument

- `GenerationEvaluator` unchanged.
- P012 legality mask enabled (`enforceUtf8: true`) for **all** conditions.
- Greedy decoding at `temperature = 0` for the primary metric.
- `maxTokens = 40`, `eosTokenId = 3`.
- `GenerationEvaluator` hardcodes `maxCtx = 128`; therefore every held-out prompt must be
  at most **88 tokens**, so `88 + 40 = 128` never triggers context truncation.

---

## 4. Dataset

### 4.1 Split discipline and the `getDatasetTexts` hazard

`getDatasetTexts(dataset)` at `src/lib/minimind/data/datasetLoader.ts:281-283` returns
`dataset.samples.map(s => s.text)` — **all 600 samples regardless of `split`**. It must
not be used to feed SFT training or evaluation.

The SFT loader reads `src/data/minimind/datasets/chat-sft.json` directly and selects by
the explicit `split` field. `getDatasetTexts()` is used **only** for deterministic
tokenizer reconstruction, where matching the Phase-90 all-600-sample corpus is the
intended behavior.

Held-out (`split: "test"`) samples:

- never enter the optimizer's batches;
- never enter validation-loss checkpoint selection;
- never enter the mismatch-mapping pool;
- are never used to choose the stopping step, the answer length, or the prompt wording
  after any result is observed.

### 4.2 File format

`src/data/minimind/datasets/chat-sft.json` (created at implementation time, not by this
design task):

```json
{
  "dataset": "chat-sft",
  "version": "1.0.0",
  "schemaVersion": 1,
  "purpose": "instruction",
  "template": {
    "user": "User: ",
    "assistant": "Assistant: ",
    "separator": "\n"
  },
  "createdAt": "2026-10-20",
  "samples": [
    {
      "id": "sft-en-train-001",
      "language": "en",
      "split": "train",
      "category": "factual",
      "turns": [
        { "user": "What is the capital of Japan?", "assistant": "Tokyo." }
      ]
    }
  ]
}
```

Rules:

- `schemaVersion` is exactly `1` for this new file format. The existing
  `datasetSchema.ts` is **not** extended.
- `purpose` is exactly `"instruction"`.
- `turns` has length 1 or 2.
- `language ∈ { "en", "zh", "mixed" }` classifies the **user prompt text**:
  - `en`: no Han characters in any user turn;
  - `zh`: at least one Han character and no ASCII letters in any user turn;
  - `mixed`: at least one Han character and at least one ASCII letter in every user turn.
- `split ∈ { "train", "validation", "test" }`.
- `category ∈ { "factual", "definition", "arithmetic", "translation", "daily",
  "technology" }`.
- IDs match `^sft-(en|zh|mixed)-(train|validation|test)-\d{3}$` and agree with the
  `language` and `split` fields.
- User/assistant content must not contain `\n`, `\r`, `User:`, `Assistant:`, `<pad>`,
  `<unk>`, `<bos>`, or `<eos>`.

### 4.3 Sizes and language allocation

Total: **132 samples**.

| Split | en | zh | mixed | Total | Turn mix per language |
|---|---|---|---|---|---|
| train | 28 | 28 | 28 | 84 | 18 single + 10 two-turn |
| validation | 7 | 7 | 7 | 21 | 5 single + 2 two-turn |
| test (held out) | 9 | 9 | 9 | 27 | 9 single |
| **Total** | **44** | **44** | **44** | **132** | — |

Totals across languages: 96 single-turn samples, 36 two-turn samples.

The held-out set is **27 single-turn Q/A pairs**, 9 per language. Every final question is
independent of all training and validation questions and answers.

### 4.4 Category quotas (per language)

| Category | Train | Validation | Test | Total |
|---|---|---|---|---|
| factual | 6 | 2 | 2 | 10 |
| definition | 4 | 1 | 1 | 6 |
| arithmetic | 5 | 1 | 2 | 8 |
| translation | 4 | 1 | 1 | 6 |
| daily | 5 | 1 | 2 | 8 |
| technology | 4 | 1 | 1 | 6 |
| **Total** | **28** | **7** | **9** | **44** |

The same table applies to each of `en`, `zh`, and `mixed`. Turn mix is enforced
independently of category.

### 4.5 Chat template

The template is **exactly** the one produced by `chatAdapter.formatConversationPrompt`:

```
User: {u1}
Assistant: {a1}
User: {u2}
Assistant: {a2}
```

Parts are joined with `"\n"`. For a sample with `n` turns:

- `fullText = parts.join("\n")` where
  `parts = [User: u1, Assistant: a1, …, User: un, Assistant: an]`;
- `promptText = parts.slice(0, -1).join("\n") + "\nAssistant:"`;
- `answerContinuation = " " + an` (the leading space is part of the template, not of the
  authored answer);
- `fullText === promptText + answerContinuation`.

This matches the chat UI for a conversation whose last message is from the user: history
pairs, then a final `Assistant:` line for the model to complete.

### 4.6 Tokenization contract

The normative training sequence is **segment-wise**:

```
inputIds = encode(promptText) ++ encode(answerContinuation) ++ [<eos>]
```

Rationale: byte-level BPE may merge bytes across the `Assistant:` boundary, so
`encode(promptText + answerContinuation)` is not guaranteed to equal
`encode(promptText) ++ encode(answerContinuation)`. Segment-wise encoding **guarantees**
that the training prompt prefix is byte-for-byte the token sequence the inference path
produces for the same prompt. The model is trained on exactly the prefix it will see and
exactly the continuation tokens it must generate.

The audit records, per sample, whether `encode(fullText)` (without EOS) equals the
segment-wise sequence. This is a **diagnostic**, not a rejection rule. No sample is
rewritten and no tokenizer is changed because of it.

Length constraints:

- `encode(promptText).length + encode(answerContinuation).length + 1 ≤ 128`
  (block size 128, including the appended EOS).
- Every held-out prompt is `≤ 88` tokens so evaluation never truncates context.

### 4.7 Held-out set

The 27 held-out items are frozen in Appendix A. They are single-turn, 9 per language, and
cover the six categories. Their questions and answers are authored independently of the
training and validation pools.

### 4.8 Leakage rules

Duplicate detection uses a **non-EM comparison key**, never the primary
`normalizeAnswer` rule alone. Define `comparisonKey(text)` as `normalizeChatAnswer(text)` —
the §8.3 pre-normalization extraction followed by `normalizeAnswer` — with letters
lowercased and trailing sentence-final punctuation from `。．.!！?？` removed.
`comparisonKey` is used only by the leakage audit and the control-mapping mismatch test;
it never scores a prediction.

After `comparisonKey`:

- no held-out **question** equals any train/validation question;
- no held-out **answer** equals any train/validation answer;
- no held-out `promptText` equals any train/validation `promptText`;
- no question or answer is duplicated inside the train/validation pool.

Tests enforce these rules over the parsed dataset.

### 4.9 Authoring rules

- Training and validation items are authored **after** the held-out set is frozen in this
  document. The held-out set is never edited to accommodate training data.
- Answers are short (target ≤ 20 tokens), direct, and in the prompt's language or the
  language the question explicitly requests.
- Arithmetic answers use digits.
- Translation questions ask for the other language explicitly.
- No training item may reuse a held-out question stem, answer, or a trivial paraphrase
  that maps to the same `comparisonKey` (§4.8).
- The dataset file is written once, then audited; the audit output is a frozen artifact.

---

## 5. Assistant-only loss mask

### 5.1 Alignment with the production Trainer

`Trainer` does **not** use a second target shift. It calls:

```ts
const logits = this.model.forward(inputIds);           // logits[s] sees tokens 0..s
const unshiftedTargets = batch.map(s => s.inputIds);   // full input sequence
const masks = this.collectMasks(batch);
this.criterion(logits, unshiftedTargets, masks);
```

`crossEntropyLoss(logits, targets, mask)` applies the causal shift **internally**:

- for `s in 0 .. S-2`, the prediction at position `s` targets `targets[b][s+1]`;
- `mask[b][s] === 1` includes that prediction; `0` excludes it;
- position `S-1` has no target and is never read.

Therefore the SFT mask is defined on **prediction positions** `s`, and
`mask[s] = 1` means "the prediction at `s` of token `s+1` contributes". No second shift is
introduced anywhere.

`TextSample.targetIds` is still populated with the pre-shifted convenience array
(`targetIds[s] = inputIds[s+1]`, last slot `pad`) to honour the existing `TextSample`
contract and `collateBatch` length checks. `Trainer` ignores it for the objective; tests
assert it is consistent but the loss never consumes it.

### 5.2 Construction

Given `P = encode(promptText).length`, `C = encode(answerContinuation).length`,
`N = P + C + 1` (EOS at index `N-1`):

```
ids[0 .. P-1]        = prompt tokens          (not supervised)
ids[P .. P+C-1]      = answer tokens          (supervised targets)
ids[N-1]             = <eos> (id 3)           (supervised target)
ids[N .. 127]        = <pad> (id 0)
```

Mask, for `s = 0 .. 126`:

```
mask[s] = 1  iff  P - 1 <= s <= N - 2
```

- `mask[P-1] = 1` is the position whose next token is the first answer token.
- `mask[N-2] = 1` is the position whose next token is EOS.
- `mask[N-1] = 0` is the EOS position itself; its next token is padding, and it is
  never supervised.
- `mask[s] = 0` for all prompt-internal predictions (`s < P-1`), all pad predictions
  (`s >= N`), and the final position `mask[127] = 0`.
- Supervised positions: `N - P` (`C` answer tokens plus EOS).

For two-turn samples, the first assistant answer lives inside `promptText` and is
therefore **not** supervised. Only the final answer and EOS contribute.

### 5.3 Padding

All samples are padded to exactly 128 tokens so `collateBatch` sees equal lengths. Pad
positions use input id 0 and mask 0. `crossEntropyLoss` validates mask values are 0/1 and
mask length equals sequence length.

### 5.4 Explicit prohibitions

- No loss on prompt tokens.
- No loss on `<pad>`.
- No label smoothing.
- No second target shift.
- No change to `CrossEntropyLoss`, `Trainer`, or `collateBatch`.
- No weighting of answer tokens by length or category.

---

## 6. Conditions

| ID | Name | Training data | Steps | Purpose |
|---|---|---|---|---|
| **A** | No-SFT baseline | none (frozen Phase 90 weights) | 0 | Measures what the pretrained checkpoint already does in the chat format |
| **B** | Assistant-only SFT | 84 matched train samples | 336 | Treatment |
| **C** | Mismatched-answer control | same 84 prompts, final answers cyclically replaced within `(language, turnCount)` strata | 336 | Isolates correct Q/A pairing from format/style learning |

### 6.1 Control mapping (condition C)

For each stratum `(language, turnCount)` inside `split ∈ {train, validation}`:

1. Sort samples by `id`.
2. For offset `d = 1 .. n-1`, form `source(i) = (i + d) mod n`.
3. Accept the smallest `d` such that, for every `i`:
   - `comparisonKey(source(i).finalAnswer) !== comparisonKey(target(i).finalAnswer)`
     (§4.8; this non-EM key is deliberately more permissive than `normalizeAnswer`, so
     answers differing only in case or trailing punctuation are not a valid mismatch);
   - the sample built from `target(i)`'s prompt and `source(i)`'s final answer encodes to
     `≤ 128` tokens.
4. If no offset is valid for a stratum, condition C is **blocked**; Phase 113 reports
   Outcome D rather than silently changing the control.

Only the **final supervised answer** is replaced. User turns — including the first
assistant answer of two-turn samples, which is prompt context — are unchanged. This keeps
the prompt identical between B and C and isolates the answer-label association.

The mapping is recorded in `control-mapping.json` and is deterministic from the dataset
and tokenizer.

Test samples are never mapped and never trained.

### 6.2 Checkpoint selection for C

C uses the same candidate steps and the same token-weighted validation-loss rule as B,
computed on C's mapped validation split. This gives the control its best fit to its own
objective; it is not disadvantaged by a different selection rule.

---

## 7. Training protocol

### 7.1 Loading the base weights

Load the Phase-90 checkpoint with a **throwaway** AdamW optimizer:

```ts
const scratch = new AdamWOptimizer(model.parameters(), { lr: 1e-5 });
loadCheckpoint({ model, optimizer: scratch, checkpoint });
```

Why throwaway: `deserializeOptimizerState` overwrites `optimizer.lr` from the checkpoint
(`1e-5`) and restores its step counter (`3000`). The production SFT optimizer is then
constructed fresh:

```ts
const optimizer = new AdamWOptimizer(model.parameters(), {
  lr: 5e-4,
  betas: [0.9, 0.999],
  eps: 1e-8,
  weightDecay: 0.01,
});
```

Moment estimates start at zero. The scheduler is fresh. The model weights are bit-identical
to the base checkpoint. `Random.setSeed(42)` is re-applied after loading, because
`loadCheckpoint` restores the checkpoint's global RNG state.

### 7.2 Frozen hyperparameters

| Parameter | Value |
|---|---|
| seed | 42 |
| block size | 128 |
| batch size | 4 |
| batches per epoch | 21 |
| epochs | 16 |
| total steps | 336 |
| optimizer | AdamW |
| learning rate | `5e-4` |
| betas | `[0.9, 0.999]` |
| eps | `1e-8` |
| weight decay | `0.01` |
| scheduler | CosineScheduler |
| base LR | `5e-4` |
| min LR | `5e-5` |
| warmup steps | `33` (`floor(336 × 0.1)`) |
| gradient clip norm | `1.0` |
| gradient accumulation | `1` |
| shuffle | `true`, seed 42 |
| drop last | `false` |
| log interval | 84 |
| eval interval | 0 (automatic eval disabled) |
| candidate steps | 84, 168, 252, 336 |

`BatchSampler` uses `Random.seededShuffle(indices, seed)` with a fixed seed, so every epoch
sees the same batch order. This is existing behavior and is recorded as a limitation; it is
not changed.

### 7.3 Validation loss and checkpoint selection

`Trainer.runEvaluation()` averages per batch, not per token. Phase 113 uses a custom
token-weighted validation loss over the 21 validation samples:

For each sample `i` (batch size 1):

```
loss_i = crossEntropyLoss(model.forward(inputIds_i), [inputIds_i], [mask_i])
n_i    = sum(mask_i)
```

```
valLoss = Σ(loss_i × n_i) / Σ(n_i)
```

At each candidate step, compute `valLoss`; if it is **strictly lower** than the best so
far, save the checkpoint atomically to
`experiments/phase113/phase113-sft.ckpt.json` (or `…-control.ckpt.json`). Ties keep the
earlier checkpoint. Candidate losses are recorded whether or not they win.

The saved checkpoint is the model/optimizer/scheduler state at that step, with metadata:

| Field | Value (B) | Value (C) |
|---|---|---|
| `modelConfig` | production architecture | production architecture |
| `vocabSize` | 300 | 300 |
| `parameterCount` | 1,126,528 | 1,126,528 |
| `trainingDataset` | `"chat-sft"` | `"chat-sft-control"` |
| `datasetVersion` | `"1.0.0"` | `"1.0.0"` |
| `datasetSchemaVersion` | 1 | 1 |
| `datasetPurpose` | `"instruction"` | `"instruction"` |
| `trainingSteps` | 336 | 336 |
| `epochs` | 16 | 16 |
| `createdAt` | run start timestamp | run start timestamp |
| `tokenizerState` | exact reconstructed state | exact reconstructed state |

`createdAt` is the run start timestamp because `Trainer`'s metadata is fixed at
construction; this is recorded in `training-result-*.json`.

### 7.4 Determinism

- Model weights come from a frozen SHA-256-verified checkpoint.
- Tokenizer construction is deterministic.
- `Random.setSeed(42)` before tokenizer construction and again after checkpoint loading.
- Dataset order is file order; batch order is the fixed seeded shuffle.
- No wall-clock, network, or `Math.random()` enters training decisions.
- Timestamps appear only in metadata and result provenance, never in a decision.

A single re-run is permitted **only** after an infrastructure failure (process crash, disk
error) and must use the identical command, dataset, and seed. Re-runs after observing
results are prohibited; a changed experiment requires a new phase.

### 7.5 Failure conditions

Abort and report Outcome D if any of the following occurs:

- non-finite training or validation loss;
- a candidate checkpoint cannot be written or read back;
- the final checkpoint fails `analyzeCheckpointJSON`;
- a tokenizer fingerprint differs between conditions;
- the control mapping has no valid offset for a stratum.

---

## 8. Evaluation protocol

### 8.1 Items

The 27 held-out items in Appendix A, in file order, each rendered with
`formatPrompt(sample)` (`User: {q}\nAssistant:`). The same prompt strings are used for all
three conditions.

Before evaluation, assert every held-out prompt is `≤ 88` tokens.

### 8.2 Decoding

| Setting | Primary | Secondary |
|---|---|---|
| temperature | 0 (greedy) | 0.8 |
| maxTokens | 40 | 40 |
| topK | 40 | 40 |
| topP | 0.9 | 0.9 |
| seed | 42 | 42 |
| eosTokenId | 3 | 3 |
| enforceUtf8 | `true` | `true` |

All three conditions use the same tokenizer instance state and the same prompt order. The
sampled run uses one seeded RNG per `evaluate()` call, so identical order and seed make
the conditions comparable.

### 8.3 Metrics

**Primary — normalized exact match (EM), greedy.**

The frozen answer-normalization contract is the pure helper
`normalizeAnswer(text): string`:

1. Normalize Unicode to NFC.
2. Normalize CRLF and CR line endings to LF.
3. Trim leading and trailing whitespace.
4. Collapse each run of consecutive whitespace characters to one ASCII space (U+0020).
5. Preserve case, punctuation, wording, numbers, and semantic content. Do not remove
   meaningful punctuation.

No fuzzy matching, stemming, semantic similarity, or post-hoc exception is used for the
primary EM metric. The same `normalizeAnswer` is applied to every reference answer and
every generated answer in all three conditions (A, B, C).

Before normalization, a generated continuation that begins another turn is cut at the
first `\nUser:` or `\nAssistant:` marker and `turnLeak` is recorded. This extraction is a
diagnostic step separate from `normalizeAnswer`; reference answers contain no markers.

For held-out item `i`:

`em_i = 1` iff both normalized strings are non-empty and the normalized prediction equals
the normalized gold answer; otherwise `em_i = 0`.

`correct = Σ em_i` is the integer exact-match count. The normalized EM rate is
`EM = correct / 27`. Acceptance is defined on the integer counts in §9; where a rate is
reported, the two-item margin is `2 / 27`.

**Secondary — token F1, greedy.**

- `en`: whitespace-split tokens after normalization.
- `zh` / `mixed`: non-space character tokens after normalization.
- Multiset precision/recall/F1 against the gold answer.
- Token F1 is descriptive only. It cannot substitute for, or relax, any primary EM
  acceptance criterion.

**Secondary — sampled EM** under the secondary decoding settings. This is reported as
`correct_sampled / 27` under the same normalization contract.

**Secondary — per-language EM** for each of `en`, `zh`, `mixed`, reported as the integer
count and its rate; it is descriptive except for acceptance criterion 5.

### 8.4 Integrity diagnostics (reported separately, never in acceptance)

- `utf8.enforced` (must be `true`);
- count of `invalidByteOffset !== -1`;
- count of `droppedIncompleteTail`;
- count of `emptyCandidateStop`;
- `stopReason` distribution (`eos` / `maxTokens` / `error`);
- count of empty or whitespace-only continuations;
- count of `turnLeak`;
- count of prompts exceeding 88 tokens (must be 0);
- count of evaluations where `promptTokens + generatedTokens > 128` (context truncation).

A UTF-8-clean response is **not** counted as correct unless it matches the gold answer.

### 8.5 No post-hoc changes

After the first evaluation result is observed, none of the following may change:

- the held-out set, prompt wording, or answer normalization;
- the metric definitions or thresholds;
- decoding parameters;
- candidate steps or checkpoint selection;
- the control mapping.

---

## 9. Pre-registered acceptance criteria

Let `correct_A`, `correct_B`, and `correct_C` be the integer greedy exact-match counts over
the same 27 held-out questions, and let `EM_X = correct_X / 27` for `X ∈ {A, B, C}`.

| # | Criterion |
|---|---|
| 1 | `correct_B >= 5` |
| 2 | `correct_B > correct_A` |
| 3 | `correct_B > correct_C` |
| 4 | `correct_B - max(correct_A, correct_C) >= 2` |
| 5 | `correct_B` includes at least one correct item in each of `en`, `zh`, `mixed` |

Criterion 4 is a **two-item** margin: `correct_B − max(correct_A, correct_C) ≥ 2`. In rate
terms the same requirement is `EM_B − max(EM_A, EM_C) ≥ 2 / 27` (approximately `0.0741`).
It is never a rate difference of `2`.

**Threshold justification.** A 1.1M-parameter model with 84 training examples is being
asked for a *first conversational milestone*, not fluency. Five correct answers out of 27
(18.5%) is above what pure format learning by the two controls can plausibly produce, while
remaining attainable on short, single-fact questions. A 2-item margin prevents a one-item
difference from being read as an effect. Per-language coverage prevents an all-English or
all-Chinese result from being reported as balanced capability.

### 9.1 Verdict grades

| Grade | Label | Condition |
|---|---|---|
| **A** | Supported | All five criteria hold |
| **B** | Partial | `correct_B > correct_A` and `correct_B > correct_C`, but at least one of criteria 1, 4, or 5 fails |
| **C** | Not supported | `correct_B ≤ correct_A` or `correct_B ≤ correct_C` |
| **D** | Blocked / Inconclusive | Instrument failure, integrity violation, missing artifact, or fewer than 27 items evaluated |

A grade other than A is a valid result and must be reported as such. It must not be
followed within Phase 113 by more epochs, larger capacity, a different tokenizer, added
positional encoding, or an expanded test set.

---

## 10. Stopping rules

- Training stops at **336 steps** for B and C. There is no extension.
- Checkpoint selection uses only the four pre-registered candidate steps.
- Evaluation runs once per condition per decoding setting.
- If any failure condition in §7.5 occurs, stop and report D.
- Do not add conditions, seeds, prompts, or metrics after seeing results.
- Do not re-run to obtain a more favorable verdict.

---

## 11. Artifacts

| Artifact | Path | Produced by |
|---|---|---|
| Dataset | `src/data/minimind/datasets/chat-sft.json` | Implementation, Task 3 |
| Dataset module | `src/lib/minimind/data/ChatSftDataset.ts` | Implementation, Tasks 2–3 |
| Metrics module | `src/lib/minimind/data/chatSftMetrics.ts` | Implementation, Task 1 |
| Dataset audit | `experiments/phase113/dataset-audit.json` | `audit.ts` |
| Control mapping | `experiments/phase113/control-mapping.json` | `audit.ts` |
| SFT training result | `experiments/phase113/training-result-sft.json` | `probe.ts` |
| Control training result | `experiments/phase113/training-result-control.json` | `probe.ts` |
| SFT checkpoint | `experiments/phase113/phase113-sft.ckpt.json` | `probe.ts` |
| Control checkpoint | `experiments/phase113/phase113-control.ckpt.json` | `probe.ts` |
| Evaluation results | `experiments/phase113/eval-results.json` | `evaluate.ts` |
| Verdict | `experiments/phase113/verdict.json` | `evaluate.ts` |
| Report | `src/lib/minimind/research/PHASE113-MINIMAL-CHAT-SFT-REPORT.md` | `evaluate.ts` |
| Test suite | `src/lib/minimind/research/tests/phase113-chat-sft.test.ts` | Implementation, Tasks 1–3 and 6 |

The base checkpoint `experiments/phase90/phase90-aligned.ckpt.json` and the Phase-96
checkpoint are never written.

---

## 12. Import-path compatibility

The SFT and control checkpoints must pass the existing Milestone A path:

1. `analyzeCheckpointJSON(JSON.stringify(checkpoint), corpus)` returns `ok: true`.
2. `tokenizerSource === "metadata"` (because `tokenizerState` is present).
3. `metadata.modelConfig` matches the production architecture exactly.
4. Parameter names, shapes, completeness, and AdamW state validate.

`evaluate.ts` performs these checks before generating. The checkpoints are then importable
through the existing chat UI's checkpoint-import control; no UI change is required.

The chat UI's default `maxTokens` is 128 (above the evaluation's 40). This is not a
blocker: the model is usable, and the evaluation's frozen setting is what the verdict is
computed on.

---

## 13. Limitations

1. **Small data.** 84 training examples and a 1.1M-parameter model cannot establish fluent
   conversation; 27 held-out items give a wide uncertainty interval.
2. **Single-turn evaluation.** Multi-turn samples are trained and unit-tested, but the
   primary held-out set is single-turn.
3. **Tokenizer provenance.** The pretraining checkpoint has no `tokenizerState`; the
   reconstruction is deterministic but unverifiable against the original state.
4. **EOS is newly learned.** Phase 90's document-aligned layout did not append EOS, so the
   base model has little or no EOS training. SFT supervises EOS; some outputs may still
   run to `maxTokens`.
5. **Fixed batch order.** `BatchSampler` repeats the same seeded order every epoch.
6. **Batch-averaged `Trainer` eval.** Checkpoint selection uses a custom token-weighted
   loss rather than `Trainer.runEvaluation()`.
7. **P012 is a safeguard.** It prevents malformed UTF-8 at the sampling boundary; it does
   not improve knowledge and can influence which tokens are reachable.
8. **Exact match is brittle.** Case and punctuation are preserved, so paraphrases, case
   variants, and punctuation variants count as wrong; token F1 is descriptive only and
   cannot substitute for the primary EM criteria.
9. **Control scope.** The mismatched-answer control holds prompts and format fixed, but
   answer-length distributions differ slightly from B.
10. **No external judge.** All scoring is deterministic string comparison.
11. **No causal claim** beyond this specific controlled experiment.
12. **Chat UI defaults differ** from the evaluation settings (128 max tokens vs 40).

---

## 14. Design-audit findings: blockers and mitigations

**No blocking problem was found.** The following were identified and handled:

| Finding | Handling |
|---|---|
| `getDatasetTexts()` ignores splits (`datasetLoader.ts:281`) | SFT reads `chat-sft.json` directly; held-out selection is by explicit `split`. `getDatasetTexts()` is used only for tokenizer reconstruction, matching Phase 90. |
| Base checkpoint has no `metadata`/`tokenizerState` | Deterministic reconstruction; fingerprint recorded; limitation documented. SFT checkpoints write `tokenizerState`. |
| BPE may merge across the `Assistant:` boundary | Segment-wise encoding is normative; full-text equality is a recorded diagnostic, not a rejection rule. |
| `GenerationEvaluator` hardcodes `maxCtx = 128` | Held-out prompts are frozen at ≤ 88 tokens; audit asserts it. |
| `Trainer`'s eval is batch-averaged | Custom token-weighted validation loss for checkpoint selection. |
| `loadCheckpoint` overwrites optimizer LR/step | Load weights with a throwaway optimizer, then construct a fresh AdamW at `5e-4`. |
| `BatchSampler` reuses the same order each epoch | Recorded as a limitation; unchanged. |
| `enrichCheckpoint` drops unknown metadata | Only known `CheckpointMetadata` fields are used. |
| Phase 90 aligned never trained with EOS | SFT supervises EOS and reports EOS-termination rate. |

---

## 15. Frozen surface

### 15.1 Untouched

- `bilingual.json`, `datasetSchema.ts`, `datasetLoader.ts`, `TextDataset.ts`,
  `Trainer.ts`, `CrossEntropyLoss.ts`, `GenerationEvaluator.ts`, `utf8Constrained.ts`,
  `checkpointImport.ts`, `chatAdapter.ts`, all UI components.
- Every file under `experiments/phase90` and `experiments/phase96`.
- Every Phase 84–112 artifact and both Phase 112 planning documents.

### 15.2 Allowed new imports

`Dataset`, `TextSample` (type), `BPETokenizer`, `Random`, `TensorMiniMindModel`,
`AdamWOptimizer`, `CosineScheduler`, `Trainer`, `DataLoader`, `collateBatch`,
`crossEntropyLoss`, `saveCheckpoint`/`loadCheckpoint`, `analyzeCheckpointJSON`,
`GenerationEvaluator`, `getProductionModelConfig`, `loadProductionDataset`,
`getDatasetTexts`.

**Never imported:** Phase 99, 101, or 102 module chains.

---

## Appendix A — Frozen held-out set (27 items)

All items are single-turn. IDs are `sft-{language}-test-{nnn}`. Both prediction and gold
answer are compared through `normalizeAnswer` from §8.3; the text below is the authored
gold answer and is not altered.

### English (`en`)

| ID | Category | Question | Answer |
|---|---|---|---|
| sft-en-test-001 | factual | What is the capital of France? | Paris. |
| sft-en-test-002 | factual | How many days are in a week? | Seven. |
| sft-en-test-003 | definition | What is water? | Water is a liquid. |
| sft-en-test-004 | arithmetic | What is 7 plus 5? | 12. |
| sft-en-test-005 | arithmetic | What is 9 times 3? | 27. |
| sft-en-test-006 | translation | How do you say hello in Chinese? | 你好. |
| sft-en-test-007 | daily | What should I drink when I am thirsty? | Water. |
| sft-en-test-008 | daily | When should I go to sleep? | At night. |
| sft-en-test-009 | technology | What does a computer do? | It processes information. |

### Chinese (`zh`)

| ID | Category | Question | Answer |
|---|---|---|---|
| sft-zh-test-001 | factual | 法国的首都是哪里？ | 巴黎。 |
| sft-zh-test-002 | factual | 一周有几天？ | 七天。 |
| sft-zh-test-003 | definition | 水是什么？ | 水是一种液体。 |
| sft-zh-test-004 | arithmetic | 七加五等于多少？ | 十二。 |
| sft-zh-test-005 | arithmetic | 九乘以三等于多少？ | 二十七。 |
| sft-zh-test-006 | translation | 用英语怎么说你好？ | Hello. |
| sft-zh-test-007 | daily | 口渴的时候应该喝什么？ | 喝水。 |
| sft-zh-test-008 | daily | 什么时候应该睡觉？ | 晚上。 |
| sft-zh-test-009 | technology | 电脑是用来做什么的？ | 电脑用来处理信息。 |

### Mixed (`mixed`)

Every question contains at least one Han character and at least one ASCII letter.

| ID | Category | Question | Answer |
|---|---|---|---|
| sft-mixed-test-001 | factual | 法国的首都 Paris 是哪个国家的？ | 法国。 |
| sft-mixed-test-002 | factual | What is 一星期 in English? | A week. |
| sft-mixed-test-003 | definition | 什么是 CPU? | CPU 是中央处理器。 |
| sft-mixed-test-004 | arithmetic | What is 六加七? | 13. |
| sft-mixed-test-005 | arithmetic | 十二 divided by 三等于多少? | 4. |
| sft-mixed-test-006 | translation | 用 English 说“谢谢”。 | Thank you. |
| sft-mixed-test-007 | daily | 我 thirsty 的时候喝什么？ | Water. |
| sft-mixed-test-008 | daily | What time 应该睡觉? | At night. |
| sft-mixed-test-009 | technology | What does 电脑 do? | It processes information. |
