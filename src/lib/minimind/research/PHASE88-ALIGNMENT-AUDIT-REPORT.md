# Phase 88 — Training / Evaluation Alignment Audit

**Date:** 2026-08-24
**Purpose:** Answer a single question — **why can the model reach training loss ≈ 0.17 while memory top-1 stays ≈ 0.0344?** The Phase 87 combined recipe (blockSize 64, epochs 20) collapses training loss to 0.1700 yet memorization top-1 stays at 0.0344 — identical to the baseline (16, 5) to four decimal places. The working hypothesis: **training and evaluation optimize different token-level objectives over different data layouts.** This phase audits both pipelines from real code, builds a formal alignment matrix, and measures the same checkpoint under training-distribution vs. evaluation-distribution conditions.

**Scope discipline:** This is a *diagnostic audit*. No production behavior is changed. The capability evaluator is **not** modified. The root-cause correction is **described, not implemented** (Phase 89).

---

## 1. Training Pipeline (production, exactly as executed)

Built in `TrainingWorker` / `experiments/phase87/probe.ts::buildPipeline`:

| Stage | Construction | Evidence |
|---|---|---|
| Dataset | `bilingual.json` v0.3.0, **600** samples (zh 200 / en 200 / mixed 200; train 480 / val 60 / test 60) | `datasetLoader.ts`, `computeBaseStatistics` |
| Tokenizer | `new BPETokenizer()` → `train(corpus, 300)` — byte-level BPE, seeded, special ids `<pad>=0 <unk>=1 <bos>=2 <eos>=3`, bytes 4–259, BPE merges 260–299 | `BPETokenizer.ts`, `vocabulary.ts` |
| Corpus assembly | `getDatasetTexts(loadProductionDataset())` → `string[]` (600 docs) | `datasetLoader.ts` |
| Sequence construction | `TextDataset({ tokenizer, corpus, blockSize: 64, insertEos: true })` — **all 600 docs are tokenized then concatenated into ONE token stream**, with `<eos>` (id 3) inserted between documents | `TextDataset.ts::encodeAndConcat` |
| Window chunking | non-overlapping chunks (stride = blockSize = 64); `inputIds = stream[i .. i+63]`, `targetIds = stream[i+1 .. i+64]`; last partial block discarded; **342 windows** | `TextDataset.ts::chunkIntoSamples` |
| Batching | `DataLoader({ batchSize: 4, shuffle: true, seed: 42, dropLast: true })` → **85 batches/epoch** | `DataLoader.ts`, `BatchSampler.ts` |
| Model | `TensorMiniMindModel` vocab 300, D=128, H=4, dFF=512, L=4, S=256 — **1,126,528 params** | `ModelRegistry.ts` |
| Optimizer / schedule | AdamW (lr 0.001, wd 0.01), Cosine (10% warmup → 1% min), grad-clip 1.0 | `Trainer.ts` |
| Loss | `crossEntropyLoss(logits, targetIds)` — **see §3: the DOUBLE SHIFT** | `CrossEntropyLoss.ts`, `Trainer.ts::train()` |

**Document lengths vs block.** Documents are 5–80 chars (mean 29.8), max ≈ 60 tokens — **shorter than blockSize 64**. Therefore almost every training window spans **multiple documents plus the `<eos>` separators between them**. The model never sees a training window that is a single clean document.

---

## 2. Evaluation Pipeline (production, exactly as executed)

### 2.1 Memorization (`capability-eval/evaluate.ts::measureMemorization`)

| Stage | Construction |
|---|---|
| Input | **per document, one at a time** — `ids = tokenizer.encode(text)` |
| Context | **the whole document minus its last token** as ONE sequence: `input = [ids[0..N-2]]` (variable length, up to ~59 tokens) |
| Predictions | compare `argmax(logits[i])` to `ids[i+1]` for every position — **1-step next-token** |
| Coverage | first 8 samples (`maxSamples = 8`) → ~262 predictions |
| Output | `{ predictions, top1Accuracy, chance = 1/300, exceedsChance, reproducesPatterns (top1 ≥ 0.5) }` |

### 2.2 Generation (`evaluateGeneration`)

- Context = last **128 tokens** (`ctx = currentIds.slice(-128)`) — 2× the training window.
- Reads the **last-position logit** (`row = logits[0][ctx.length - 1]`) — the position that the production loss **never supervises** (`validPositions = S − 1`).
- Samples via `mulberry32` at temperature 0.8; stops on `<eos>` (id 3).

---

## 3. The Critical Finding — a DOUBLE SHIFT in the Training Objective

The training objective is **not** 1-step-ahead next-token prediction. It is **2-step-ahead**:

1. **Shift #1 — `TextDataset`** pre-shifts targets: `targetIds[s] = stream[i + s + 1]` (the token *after* `input[s]`). Documented, intentional.
2. **Shift #2 — `crossEntropyLoss`** applies an **internal causal shift**: `target = targets[b][s + 1]` — "Causal shift: logits[:, :-1] predicts targets[:, 1:]". The loss contract (confirmed by `loss.test.ts`) expects targets = the **full unshifted** input sequence.
3. **Net:** `Trainer.train()` passes the **already-shifted** `targetIds` into the loss → each logit position `s` is trained to predict `stream[i + s + 2]` — the token **2 positions ahead** of its context, skipping the true next token.

**Empirical confirmation (`experiments/phase88/verify-shift.ts`, deterministic):**
```
sample.inputIds  = [4,5,6,7]
sample.targetIds = [5,6,7,8]
loss internal targets (targets[b][s+1]) for each position s:
  logits[0] -> loss uses targetIds[1] = 6 (token "c")   natural next = 5 (token "b")  != double-shift (2-step ahead)
  logits[1] -> loss uses targetIds[2] = 7 (token "d")   natural next = 6 (token "c")  != double-shift (2-step ahead)
  logits[2] -> loss uses targetIds[3] = 8 (token "e")   natural next = 7 (token "d")  != double-shift (2-step ahead)
```
A model that gives logits[s] **near-certain mass at the true next token** still scores loss ≈ **10.0** (ln(1/p_wrong) over a 300-way softmax) under the production call — because the loss compares against the 2-step-ahead token, never the next token. **This single defect explains a model that reaches loss 0.17 (memorizing the 2-ahead objective over 20 epochs on a fixed corpus) while 1-step memorization top-1 stays ≈ 0.03 (systematically wrong).**

---

## 4. Alignment Matrix — Training vs Evaluation

| Dimension | Training (production) | Memorization eval | Generation eval | Aligned? |
|---|---|---|---|---|
| Dataset unit | 600 docs → **one concatenated stream** | one doc at a time | one prompt at a time | ❌ |
| Tokenization | `BPETokenizer.train(corpus, 300)`, seeded | same tokenizer (`encode`) | same tokenizer | ✅ |
| Document boundary | **crossed** — `<eos>` (id 3) between docs, windows span docs | never crossed — standalone doc | never crossed — standalone prompt | ❌ |
| Sequence construction | fixed 64-token non-overlapping windows | variable-length whole-doc prefix | last 128 tokens of prompt | ❌ |
| Context length | 64 (maxSeqLen 256) | ~doc length (≤ ~59) | 128 | ❌ |
| Input | `stream[i..i+63]` | `ids[0..N-2]` | `ctx` last 128 | ❌ |
| Target | `targetIds[s] = stream[i+s+1]`, then **loss shifts again → stream[i+s+2]** | `ids[i+1]` (1-step) | sampled token (never supervised) | ❌ |
| Shift | **double (2-step ahead)** | single (1-step) | last-position logit | ❌ |
| Truncation | last partial block discarded | none (full doc) | last-128 window | ❌ |
| Tokenizer state | seed 42, deterministic | same instance | same instance | ✅ |

**Summary:** only tokenization (M4) is aligned. Every sequence-layout dimension diverges — and critically, the *objective* itself diverges by one position (2-step vs 1-step).

---

## 5. Diagnostic Experiment (`experiments/phase88/alignment-probe.ts`)

Recreates the Phase 87 **combined** model (blockSize 64, epochs 20 — the exact production invocation) and measures the **same checkpoint** under five conditions:

| Condition | Distribution | Objective | Purpose |
|---|---|---|---|
| **A** | training (concatenated stream, seeded loader) | **production** loss alignment (2-step) | does the model reproduce its own training objective on the training windows? |
| **A′** | training (same windows) | corrected **1-step** (diagnostic) | decisive: does the model know the *next* token on training windows? |
| **B** | evaluation (memorization, unchanged) | 1-step, per-doc, first 8 docs | the reported gate |
| **C** | evaluation (single-doc) | 1-step, all 600 docs | B at full corpus |
| **C′** | evaluation (single-doc) | **2-step** (diagnostic) | does the model predict 2 ahead even on standalone docs? |

*(A/A′/C/C′ are diagnostic-only metrics. `measureMemorization` — condition B — is run unchanged.)*

---

## 6. Measured Results

Full run of `experiments/phase88/alignment-probe.ts` (blockSize 64, epochs 20 — the exact Phase 87 combined invocation). Training reproduced the Phase 87 combined cell **exactly**: initialLoss 5.9457 → **finalLoss 0.1700** (Phase 87: 0.1700). Deterministic; seed 42; results recorded in `experiments/phase88/phase88-alignment-results.json`.

| Condition | distribution | objective | top-1 | mean NLL | evaluated tokens |
|---|---|---|---|---|---|
| **A** | training (concatenated stream, seeded loader) | **2-step (production)** | **0.9789** | **0.1602** | 21,420 |
| **A′** | training (same windows) | 1-step (corrected, diagnostic) | **0.0120** | **8.5659** | 21,420 |
| **B** | eval (memorization, unchanged) | 1-step, first 8 docs | 0.0344 | — | 262 |
| **C** | eval (single-doc) | 1-step, all 600 docs | 0.0213 | 7.0083 | 20,703 |
| **C′** | eval (single-doc) | 2-step, all 600 docs | 0.2228 | 4.1333 | 20,103 |

**Condition A detail** — per-block top-1 over all 340 evaluated windows: min **0.905**, max **1.000**, mean **0.979**; all 340 windows fall in the `[0.75, 1.00]` bucket. The model reproduces its 2-step training objective at ≥ 90% accuracy on *every* window.

**The decisive contrast — A vs A′.** Identical model, identical 21,420 training-window positions, differing **only** by the target alignment (production `targets[s+1]` vs corrected `targets[s]`):

- A (2-step, the actual training objective): **97.9%** top-1, mean NLL 0.1602 ≈ training loss 0.17. The model learned *exactly* what the loss asked it to learn.
- A′ (1-step, the evaluator's objective): **1.2%** top-1 (chance = 0.33%), mean NLL 8.57. The model does **not** know the next token — the evaluator's quantity is never trained.

**A ≫ B confirmed** (0.9789 ≫ 0.0344). Condition B reproduces the reported memorization gate exactly (top-1 0.0344, 262 predictions). C (single-doc 1-step, all 600 docs) confirms B's result at full corpus: 0.0213.

**C′ ≫ C confirmed** (0.2228 vs 0.0213): on standalone documents the model still predicts 2 steps ahead whenever it can — the 2-step bias generalizes beyond the concatenated training stream.

---

## 7. Root-Cause Classification

**CONFIRMED (measured):** the training objective is 2-step-ahead prediction due to the **double shift** (`TextDataset.targetIds` pre-shift + `crossEntropyLoss` internal `targets[s+1]`). The model scores **97.9%** on the 2-step objective over its own training windows (A) and **1.2%** on the 1-step objective over the same windows (A′). Loss 0.17 measures the model's reproduction of the shifted objective; the memorization gate (B = 0.0344) measures 1-step next-token accuracy — a quantity the training loop **never optimizes** and mis-aligns by construction. The reported "loss 0.17 while top-1 0.0344" is not a capability plateau; it is the expected signature of training one objective and evaluating another.

Secondary, reinforcing mismatches:
- **M2 — document boundaries:** training concatenates docs into a stream with `<eos>` separators; eval feeds standalone docs. The model is trained to predict across boundaries; the eval never tests that regime.
- **M3 — generation supervision:** generation reads the last-position logit (never supervised; `validPositions = S − 1`) from a 128-token context (2× training window) with temperature sampling.

---

## 8. Smallest Proposed Correction (describe only — NOT implemented)

Restore the loss contract in `Trainer.train()` by passing targets the way `crossEntropyLoss` expects — the **full unshifted input** — so each logit position `s` trains against `stream[i + s + 1]` (the true next token). Concretely: since `crossEntropyLoss` internally shifts to `targets[b][s+1]`, the production call should pass **`inputIds`** (the unshifted window) as targets rather than the pre-shifted `targetIds`. Then `targets[b][s+1] = inputIds[b][s+1] = stream[i+s+1]` — the exact 1-step objective the evaluator measures. This is a **one-line data-alignment change in the training loop** (not an architecture, tokenizer, or evaluator change).

Measured motivation (§6): the same windows score **97.9%** under the current 2-step alignment (A) and **1.2%** under the corrected 1-step alignment (A′). Fixing the alignment converts the training objective into exactly the objective the memorization gate (B) and generation gate already measure — the model would then be trained to predict the token it is evaluated on.

Compatibility impact: expected to be **low** — the loss function, model, tokenizer, dataset, and evaluator are all untouched; only the target passed to the criterion changes meaning (2-step-ahead → 1-step-ahead). Tests that assert `targetIds[i] === inputIds[i+1]` (the TextDataset 1-shift) remain true; tests that assert loss values under the shifted contract may need their expected numbers re-derived. Phase 89 must re-run the full capability gates to re-measure capability from the corrected objective.

---

## 9. Tests

Phase 88 adds an **8-check** diagnostic-contract suite (sync) at `src/lib/minimind/research/tests/phase88-alignment.test.ts`, wired into `run.ts`:
1. deterministic training sequence construction
2. same tokenizer as production (vocab 300, special ids 0–3)
3. blockSize matches Phase 87 (64, within maxSeqLen 256)
4. the double shift is identified correctly (perfect 1-step prediction → high loss)
5. deterministic evaluated-token count (85 batches × 4 × 63 = 21,420/epoch — matches Condition A's measured 21,420)
6. same-seed reproducibility (two fresh seeded pipelines identical)
7. capability thresholds unchanged (Level 3 still ≥ 0.5)
8. no architecture changes (1,126,528 params, production classes reused)

Existing Phase 57–87 suites are untouched.

**Verified run results (all green, no test deleted or weakened):**

| Suite | Result |
|---|---|
| Research module (Phase 57–88) | **828 passed, 0 failed** (820 prior + 8 new) |
| Data module | 249 passed, 0 failed |
| Training module | 4,265,519 passed, 0 failed |
| Core module | 3,216,606 passed, 0 failed |
| experimentLauncherAdapter | 61 passed, 0 failed |
| `tsc --noEmit` on new Phase 88 files | 0 errors (53 pre-existing legacy-test errors untouched) |

---

## 10. Build & Phase 89 Recommendation

**Build.** `npm run build` **BUILD_EXIT=0**, no TypeScript errors, no new warnings in Phase 88 files. (Phase 88 adds the probe + test only under `experiments/phase88/` and `research/tests/`; no production code changed.)

**Phase 89 recommendation — implement the smallest correction (§8), then re-derive capability:**
1. Apply the one-line target alignment in the training loop (pass the unshifted window as targets, per §8). This is the ONLY change; model, tokenizer, dataset, loss, and evaluator stay identical.
2. Re-run the Phase 84–87 capability gates on a freshly trained combined model (blockSize 64, epochs 20). Prediction: with the corrected objective, Condition A′ over the training windows (currently 1.2%) becomes the trained quantity, so training loss should reflect true 1-step prediction and memorization top-1 (B) should track it. If top-1 approaches the Level 3 gate (≥ 0.5) and zh generation becomes valid UTF-8, capability **Level 3 is reached by fixing the objective** — not by more data (Phase 86) or more training (Phase 87).
3. Keep all gates, thresholds, and the evaluator unchanged. If memorization top-1 does **not** rise materially, then a second-order train/eval mismatch (the document-boundary difference M2, §4) becomes the next suspect — but the A/A′ contrast (97.9% vs 1.2%) shows the shift alone can explain the entire Phase 84–87 plateau.
