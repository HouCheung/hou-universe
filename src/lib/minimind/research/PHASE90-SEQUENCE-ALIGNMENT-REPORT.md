# Phase 90 — Document-Boundary / Sequence-Layout Alignment

**Date:** 2026-08-25
**Purpose:** Answer one question with a controlled A/B experiment — **does aligning the training sequence layout with the evaluator's per-document layout raise memorization top-1 above the Level 3 threshold of 0.5?**

Phase 89 fixed the double-shift next-token objective and memorization top-1 went **0.0344 → 0.3893**, but stayed below 0.5. On the *training* distribution the Phase 89 model scores **0.9841** (1-step) while the *evaluation* distribution scores **0.3893** — the remaining bottleneck was named **M2**: training concatenates all 600 documents into one stream cut into fixed 64-token windows (windows cross document boundaries), whereas the memorization/generation gates feed standalone documents.

**Scope discipline:** no model change, no tokenizer change, no dataset change, no evaluator change, no threshold change, no new Trainer/Runtime/Worker, no fake data or fake metrics. The **only** production code changes are backward-compatible extensions: `TextDataset` gains an optional `layout: "document-aligned"` (per-document padded windows with a position mask), `crossEntropyLoss` gains an optional `mask` parameter, and the single production `Trainer` threads the mask through. The production concatenated path is byte-identical (the criterion is still called with exactly two arguments; 32/32 loss tests and 4,265,519/0 training tests still pass).

---

## 1. The M2 mechanism being tested

Every one of the 600 bilingual documents is **13–60 tokens** (median 36; none ≥ 65). The production training layout concatenates them into one stream with `<eos>` separators and cuts non-overlapping 64-token windows, so **every window spans ~1.7 documents on average**. The model therefore trains on many *cross-document* next-token pairs (`...token → <eos>` and `<eos> → first-token-of-next-doc`) that the memorization/generation gates **never measure** — the gates feed standalone documents and predict only within-document pairs.

The Phase 90 A/B isolates this single variable:

| Condition | training sequence layout | windows | training targets |
|---|---|---|---|
| **A** (current) | concatenated stream, `<eos>` separators, 64-token windows (cross-boundary) | 342 | includes cross-document pairs |
| **B** (aligned) | each document → one 64-token padded window; `mask` marks in-document prediction positions | 600 | **only** in-document next-token pairs |

Condition B keeps the **exact same** recipe (blockSize 64, epochs 20, batch 4, seed 42, AdamW lr 0.001 wd 0.01, cosine 10% warmup → 1% min, grad-clip 1.0), the **same** tokenizer (BPETokenizer, vocab 300, deterministic), the **same** model architecture (1,126,528 params), the **same** single production `Trainer`, and the **same** unchanged capability gates. Only the layout of the training sequences differs.

### 1.1 The mask contract (the smallest justified mechanism)

Since every document is shorter than `blockSize = 64`, an aligned window must be padded. Padding must not contribute loss or gradient, so each sample carries `mask[s] ∈ {0,1}` where `mask[s] = 1 ⟺` the target `inputIds[s+1]` is a real in-document token (`s+1 < docLen`). The final position (`s = blockSize-1`) has no target and is always 0. The masked criterion divides by the number of valid positions only. This aligns training pairs *exactly* with what `measureMemorization` measures (`logits[i] vs ids[i+1]` on standalone docs).

### 1.2 Code-level change (backward compatible)

1. **[TextDataset.ts](../../minimind/data/TextDataset.ts)** — `TextDatasetOptions` gains `layout?: "concatenated" | "document-aligned"` (default `concatenated`) and `padTokenId?: number` (default `0`). `TextSample` gains optional `mask?: number[]`. New private `buildDocumentAlignedSamples()` produces one padded window per document with `targetIds[s] = inputIds[s+1]` (existing 1-shift contract) and the position mask. The original `encodeAndConcat` + `chunkIntoSamples` (concatenated path) are **unchanged**. `get()` deep-copies the mask.
2. **[CrossEntropyLoss.ts](../../minimind/core/loss/CrossEntropyLoss.ts)** — `crossEntropyLoss(logits, targets, mask?)` gains an optional third argument `[B, S]` of 0/1 aligned to *prediction* positions. It validates shape/values, skips masked positions in forward and backward, and divides by `validCount`. With no mask (production path) the computation is **bit-identical** to the prior version (32/32 loss tests).
3. **[Trainer.ts](../../minimind/training/Trainer.ts)** — `LossCriterion` type extended to accept the optional mask. `train()` and `runEvaluation()` call `collectMasks(batch)`; when any sample carries a mask, the criterion is called with it; otherwise the exact two-argument call (Phase 89 fix intact: targets = **un-shifted** `inputIds`). `collectMasks` throws on a mixed batch.

There remains **exactly one production Trainer and one production training path**; the aligned layout is produced by the dataset constructor, and the mask is honored by the same loss and the same training loop.

---

## 2. Condition A — current (concatenated) layout

Condition A reuses the **real Phase 89 checkpoint** (`experiments/phase89/phase89-corrected.ckpt.json`), the model trained on the concatenated layout with the corrected 1-step objective. Measured in this probe (identical weights, both distributions):

| Quantity | Value |
|---|---|
| dataset / recipe identity | v0.3.0, 600 samples, seed 42 |
| concatenated windows / batches per epoch | 342 / 85 |
| aligned windows / batches per epoch | 600 / 150 |
| **concat-train dist 1-step top-1** | **0.9841** (21,080/21,420) — the trained quantity |
| **aligned-train dist 1-step top-1** | **0.3151** (6,523/20,703) — same weights, per-document layout |
| memorization top-1 (gate, first 8 docs) | 0.3893 (262 preds, chance 0.0033) |
| generation validUtf8 zh / en / mixed | 0.00 / 0.50 / 0.00 |
| capability level | 2 |

**The decisive M2 diagnostic:** the *same* weights score **0.9841** when evaluated over their own concatenated windows and only **0.3151** when evaluated over per-document aligned windows (masked to in-document positions). Nothing changes except the sequence layout. This is the quantitative confirmation that the layout mismatch is a real, large gap — and it is the exact distribution the evaluator gates feed.

---

## 3. Condition B — document-aligned layout (fresh training)

Measured from the real training run (`experiments/phase90/condition-b.json`):

| Quantity | Value |
|---|---|
| aligned windows / batches per epoch | 600 / 150 |
| total optimizer steps | **3,000** (150 × 20) |
| initial loss / final loss / best loss | **6.0273 / 0.1226 / 0.1222** |
| training duration | **6,816,180 ms (113.6 min)** |
| max \|param delta\| / mean \|param delta\| | **0.5536 / 0.0302** |
| aligned-train dist 1-step top-1 | **0.9645** (19,969/20,703) — the trained quantity |
| concat-train dist 1-step top-1 | **0.3414** (7,313/21,420) — same weights, concatenated layout |
| memorization top-1 (gate, first 8 docs) | **0.9580** (262 preds, chance 0.0033) |
| generation validUtf8 zh / en / mixed | **0.50 / 0.50 / 0.00** |
| capability level | **3** |

The decisive diagnostic inverts exactly as the hypothesis predicts: the document-aligned model reproduces its own aligned windows at **0.9645** but only **0.3414** on the concatenated layout — the same ~3× gap as Condition A, now pointing at the aligned distribution instead of the concatenated one. The training signal follows the layout.

---

## 4. A/B comparison — the root-cause answer

| Metric | Condition A (concatenated) | Condition B (document-aligned) | Δ |
|---|---|---|---|
| memorization top-1 (Level 3 gate) | **0.3893** | **0.9580** | **+0.5687** |
| Level 3 reached (≥ 0.5) | ❌ | ✅ | — |
| aligned-train dist top-1 | 0.3151 | 0.9645 | +0.6494 |
| concat-train dist top-1 | 0.9841 | 0.3414 | −0.6427 |
| generation validUtf8 (zh / en / mixed) | 0.00 / 0.50 / 0.00 | 0.50 / 0.50 / 0.00 | zh +0.50 |
| capability level | 2 | **3** | +1 |

**Root cause CONFIRMED.** Aligning the training sequence layout with the evaluator's per-document layout raised memorization top-1 from **0.3893 to 0.9580** — over the Level 3 threshold of 0.5 — using the **unchanged** evaluator. The two diagnostics form a perfect symmetric inversion: each model reproduces the layout it was trained on (~98% / ~96%) and collapses on the other (~31% / ~34%), and the memorization gate measures the per-document (aligned) layout, so Condition B scores 95.8% while Condition A scores 38.9%. M2 was the remaining bottleneck identified in Phase 89, and it is now quantitatively confirmed and eliminated.

**Honest Level 3 claim:** the existing `measureMemorization` evaluator reports `top1Accuracy = 0.9580 ≥ 0.5` and `reproducesPatterns = true` on 262 real next-token predictions over the first 8 training documents (chance = 1/300 = 0.0033, i.e. ~287× chance). This is the exact gate Phase 90 was asked to reach, and it is reached with real measured numbers — not asserted. Level 4 (coherent bilingual generation) is **not** reached: zh/en validUtf8 are 0.50 and mixed is 0.00, below the 1.0 requirement.

---

## 5. Reproducibility

Two fresh seeded (seed 42) document-aligned 2-epoch runs must produce a bit-identical loss history.

**First probe run recorded `identical: false` — and I investigated why.** The cause is a harness bug in the probe's reproducibility loop, not a non-determinism in training: `TensorMiniMindModel`'s parameter init consumes the **global** RNG (`Tensor.randn → Random.randn`), and the loop did not reset `Random.setSeed(SEED)` before the second run — so run 2 started from a different initial weight draw. The Phase 89 probe avoided this because its `buildPipeline()` calls `Random.setSeed(SEED)` before every run, and Phase 90's own regression test #9 proves the aligned training path is bit-reproducible when the seed is reset before each run.

The probe was fixed (`reproducibilityCheck` now calls `Random.setSeed(SEED)` before each run, exactly mirroring Phase 89), and the corrected check was re-run standalone (`experiments/phase90/repro.ts`, same two 2-epoch document-aligned runs):

- **identical: true** ✅ (both runs produce an identical 306-entry loss history, compared entry-by-entry)
- steps: 300 (2 epochs × 150 batches)
- duration: 1,404,626 ms (23.4 min)
- loss trajectory over the check (first → last step): **5.9772 → 3.3735** (monotone decrease; the masked-aligned objective is deterministic and learns)

The corrected value is recorded in `experiments/phase90/repro-result.json`. The training path itself was always deterministic — the only defect was the probe's *harness* not resetting the global seed, and it has been fixed and re-measured rather than papered over.

---

## 6. Tests

Phase 90 adds a **10-check** regression suite at `src/lib/minimind/research/tests/phase90-sequence-alignment.test.ts` (wired into the research runner `__tests__/run.ts`):
1. document-aligned dataset: one padded window per doc, correct masks, `mask[s]==1 ⟺ s+1 < docLen`, `get()` deep-copies the mask
2. **padding does not contribute to loss** — changing masked-position logits (even to a huge wrong logit) leaves the loss bit-identical
3. valid (mask=1) tokens still produce real next-token targets (`targetIds[s] == inputIds[s+1]`, non-padding)
4. **no target crosses a document boundary** — verified over the FULL 600-doc production dataset (600 aligned windows, every mask=1 pair is in-document)
5. gradient is exactly zero at masked positions and non-zero at valid positions
6. masked loss == analytic softmax-NLL; all-ones mask is bit-identical to the no-mask path
7. `crossEntropyLoss` validates mask shape and 0/1 values (and all-masked → zero loss, zero gradient)
8. the Trainer threads masks on aligned datasets and keeps the exact two-argument call on concatenated (production) datasets
9. aligned training path is reproducible (seed 42) and the masked-objective loss decreases
10. no architecture / evaluator / capability-threshold changes (1,126,528 params, Level 3 threshold 0.5 intact)

**Verified run results (all green):**

| Suite | Result |
|---|---|
| Phase 90 regression (standalone) | 10 passed, 0 failed |
| Core module | 3,216,606 passed, 0 failed |
| Training module | 4,265,519 passed, 0 failed |
| Data module | 249 passed, 0 failed |
| experimentLauncherAdapter | 61 passed, 0 failed |
| Research module (full, incl. Phase 90 wiring) | **845 passed, 0 failed** (Phase 90: 10 passed) |
| Phase 90 standalone (re-run after the build's `prefer-const` fix) | **10 passed, 0 failed** |
| `npm run build` | **✓ Compiled in 5.4s, 0 ESLint errors** (exit 0) |

> Honesty note on ordering: the full research suite ran before the `prefer-const` lint fix (a `let`→`const` declaration change with no behavioral difference — the variable is never reassigned). Phase 90 was re-run standalone against the fixed file (10/10) and the build type-checks it, so the suite total is valid.

---

## 7. Fake-Data Audit

| Check | Result |
|---|---|
| no `Math.random` in any metric/evaluator | ✅ every number is measured from real training/evaluation; generation uses the existing seeded sampler (seed 42) |
| no `setTimeout`-based fake training | ✅ Condition B is a real `Trainer.train()` on real tensors over the full recipe |
| no hardcoded metric values | ✅ every metric is computed from the run; Condition A's Level-2 flags are sourced from the real Phase 89 measured results |
| no fabricated checkpoint | ✅ Condition A reuses the real Phase 89 checkpoint; Condition B's is `trainer.saveCheckpoint()` of the real trained model |
| evaluator not modified | ✅ `capability-eval/*` untouched |
| dataset not modified | ✅ `bilingual.json` v0.3.0 untouched (600 samples, 200/200/200, 480/60/60) |

---

## 8. Build

`npm run build` → **✓ Compiled successfully in 5.4s, 0 ESLint errors** (exit 0). One Phase 90 lint error (`prefer-const`, test #8's `alignedMasks`) was fixed and the build re-run clean. The many remaining `@typescript-eslint/no-unused-vars` lines are pre-existing warnings in earlier-phase test files, not errors, and do not fail the build.

---

## 9. Conclusion — root cause CONFIRMED, Level 3 achieved

**Root cause confirmed.** Aligning the training sequence layout with the evaluator's per-document layout raised memorization top-1 from **0.3893 (Condition A) to 0.9580 (Condition B)**, a **+0.5687** gain, using the **unchanged** evaluator and the **unchanged** 0.5 Level 3 threshold. The Phase 89 bottleneck (M2) — training windows spanning ~1.7 documents while the gates measure standalone documents — is eliminated by training on per-document padded windows with a mask that excludes padding and any cross-document target.

**Honest Level 3 claim:** YES, Level 3 is achieved. The existing `measureMemorization` evaluator reports **memorization top-1 = 0.9580 ≥ 0.5** (`reproducesPatterns = true`) on 262 real next-token predictions over the first 8 training documents — ~287× chance (1/300). This is measured, not asserted. Level 4 is **not** reached (zh/en validUtf8 = 0.50, mixed = 0.00 < 1.0), so the model is honestly rated **Level 3**.

Scope discipline held: no model, tokenizer, dataset, evaluator, or threshold change; no new Trainer/Runtime/Worker; exactly one production training path (the masked loss is threaded through the existing `Trainer`); every number measured.

---

## 10. Remaining bottleneck & Phase 91 recommendation

**Remaining bottleneck: coherent bilingual generation (Level 4).** Memorization is solved (0.9580), but generation still fails the Level 4 gate: valid UTF-8 only 0.50/0.50/0.00 (zh/en/mixed). Condition B's outputs show the model now emits *plausible short fragments* (`"太阳" → "从山谷后面缓缓升"`, `"the sun rises" → "es over the quiet valleach morningse"`) but byte-level BPE merges still produce invalid bytes under sampling, especially in mixed prompts.

**Recommended Phase 91: target the generation valid-UTF-8 / coherence gate.** Candidate mechanisms, smallest-first:
1. **Train on the aligned layout with generation-appropriate decoding** — the memorization fix (Phase 90) makes the model reproduce training fragments; verify whether longer/higher-temperature seeded sampling with the existing `createSeededRNG` (temperature 0.8) plus early-stop on `<eos>` already yields coherent continuations on the aligned-trained checkpoint. If byte-level merges are the issue, no architecture change is needed — only validation of the generation path on the Level-3 checkpoint.
2. **Verify the evaluator's UTF-8 validity definition against the BPE decode** — `decode` may emit invalid bytes when sampling lands mid-merge; confirm whether a decoding/repetition guard (already present: non-empty, non-collapsed, merged-token checks) is being applied correctly.
3. Only if generation remains incoherent after (1)–(2), consider a curriculum/coherence objective on the existing model — never a new Trainer/architecture.

The Level 3 → 4 gap is now a *generation-path* question on a model that demonstrably memorizes the training distribution, not a training-objective or layout question.
