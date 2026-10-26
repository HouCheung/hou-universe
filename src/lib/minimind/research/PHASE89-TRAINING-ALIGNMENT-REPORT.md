# Phase 89 — Training-Objective Alignment Fix & Re-derived Capability

**Date:** 2026-08-24
**Purpose:** Implement the Phase 88 root-cause correction — the **double-shift** in the production training objective — with the smallest possible change, then re-derive capability from a freshly trained model on the exact production recipe. Phase 88 measured that the model scored **97.9%** on a 2-step-ahead objective (Condition A) over its own training windows while scoring **1.2%** on the 1-step next-token objective the capability evaluator measures (Condition A′). Phase 89 makes the training objective *exactly* 1-step next-token prediction and re-runs every gate unchanged.

**Scope discipline:** No model change, no tokenizer change, no dataset change, no evaluator change, no threshold change, no new Trainer/Runtime/Worker, no fake data or fake metrics. The **only** production code change is in the training loop: the criterion now receives the **un-shifted input tokens** instead of the pre-shifted `targetIds`, so `crossEntropyLoss`'s single internal causal shift yields `logits[s] → token[s+1]`.

---

## 1. The One-Line Objective Fix

Root cause (Phase 88 §3, confirmed from source): `TextDataset` pre-shifts `targetIds[s] = stream[i+s+1]`, **and** `crossEntropyLoss` applies an internal causal shift (`targets[b][s+1]`). Net effect: `logits[s]` was trained against `stream[i+s+2]` — 2 tokens ahead.

Phase 89 fix — `src/lib/minimind/training/Trainer.ts`, both the training loop and `runEvaluation()`:

```ts
// Before (Phase 84–88): double shift
const { inputIds, targets } = collateBatch(batch);
const lossTensor = this.criterion(logits, targets);   // targets = pre-shifted targetIds

// After (Phase 89): 1-step next-token objective
const { inputIds } = collateBatch(batch);
const unshiftedTargets = batch.map((sample) => sample.inputIds);
const lossTensor = this.criterion(logits, unshiftedTargets);  // loss shifts internally → logits[s] vs token[s+1]
```

`collateBatch` itself is **unchanged** — its `targets` field (pre-shifted `targetIds`) is locked by existing tests and still consumed by the `Evaluator`'s 1-step token-accuracy loop and by Phase 88 diagnostics. Only the **criterion target** changed meaning (2-step-ahead → 1-step-ahead). Verified by the updated `experiments/phase88/verify-shift.ts`:

```
corrected call crossEntropyLoss(logits, inputIds)  → loss ≈ 0.0004  (1-step next-token)
old call      crossEntropyLoss(logits, targetIds)  → loss ≈ 10.0    (double-shift, 2-step ahead)
```

---

## 2. Comparison Across Phases 84 / 86 / 87 / 88 (A & A′) / 89

Same fixed model (vocab 300, D 128, H 4, dFF 512, L 4, S 256, **1,126,528 params**), same dataset `bilingual.json` **v0.3.0** (600 samples: zh 200 / en 200 / mixed 200; train 480 / val 60 / test 60), same tokenizer (BPETokenizer, vocab 300, seed 42), same AdamW (lr 0.001, wd 0.01) + Cosine (10% warmup → 1% min) + grad-clip 1.0. Each phase re-trained from scratch on the recipe shown.

| Metric | Phase 84 | Phase 86 | Phase 87 (combined) | Phase 88 (same model as 87) | **Phase 89** |
|---|---|---|---|---|---|
| dataset samples | 84 | 600 | 600 | 600 | 600 |
| blockSize | 16 | 16 | **64** | **64** | **64** |
| epochs | 5 | 5 | **20** | **20** | **20** |
| batchSize / seed | 4 / 42 | 4 / 42 | 4 / 42 | 4 / 42 | 4 / 42 |
| **objective** | 2-step (bug) | 2-step (bug) | 2-step (bug) | 2-step (bug) | **1-step (corrected)** |
| initial loss | 6.1456 | 6.0442 | 5.9457 | 5.9457 | **5.9729** |
| **final loss** | 2.4956 | 2.8615 | 0.1700 | 0.1700 | **0.1227** |
| memorization top-1 | 0.0305 (295) | 0.0344 (262) | 0.0344 (262) | 0.0344 (262) | **0.3893 (262)** |
| memorization vs chance (1/300) | ~9× | ~10× | ~10× | ~10× | **~117×** |
| validUtf8 zh | — | 0.00 | 0.00 | — | **0.00** |
| validUtf8 en | — | 1.00 | 1.00 | — | **0.50** |
| **capability level** | 2 | 2 | 2 | 2 | **2** |

Phase 88 diagnostic conditions on the **same** Phase 87 checkpoint (identical weights, only the target alignment differs):

| Condition | distribution | objective | top-1 | mean NLL |
|---|---|---|---|---|
| **A** | training (concatenated stream) | 2-step (production) | **0.9789** | 0.1602 |
| **A′** | training (same windows) | 1-step (corrected) | **0.0120** | 8.5659 |
| B (memorization gate) | eval, first 8 docs | 1-step | 0.0344 | — |
| C (single-doc) | eval, all 600 docs | 1-step | 0.0213 | 7.0083 |
| C′ (single-doc) | eval, all 600 docs | 2-step | 0.2228 | 4.1333 |

A vs A′ is the decisive pre/post contrast: identical windows, identical weights, differing only by target alignment. The model was trained for 2-step (A: 97.9%) and was never trained for 1-step (A′: 1.2%). **Phase 89 flips A′ into the trained quantity.**

---

## 3. Corrected Training — Measured Results

Full probe `experiments/phase89/probe.ts` (exact production recipe: blockSize 64, epochs 20, batch 4, seed 42). All numbers below are measured from real training/evaluation.

| Quantity | Value |
|---|---|
| dataset / recipe identity | v0.3.0, 600 samples, 342 windows, 85 batches/epoch |
| vocab size / model params | 300 / 1,126,528 |
| initial loss (first recorded step) | **5.9729** |
| **final loss (last recorded step)** | **0.1227** |
| best loss | **0.1223** |
| total optimizer steps | **1,700** (85 × 20) |
| training duration | **3,427,768 ms (57.1 min)** |
| max \|param delta\| | **0.4864** |
| mean \|param delta\| | **0.0251** |

### 3.1 Training-distribution diagnostics (probe §3)

The corrected objective is now the trained quantity. Measured over the exact training DataLoader (seed 42, all 342 windows, 21,420 positions):

| alignment | objective | top-1 | mean NLL |
|---|---|---|---|
| **1-step** (corrected — now trained) | `logits[s] vs token[s+1]` | **0.9841** (21,080/21,420) | **0.1161** |
| **2-step** (old — now untrained) | `logits[s] vs token[s+2]` | **0.0106** (226/21,420) | **9.4090** |

Interpretation: the correction is confirmed. The model now reproduces the **1-step** next-token objective over its own training windows at **98.4%** (Phase 88 A′ was 1.2%), while its reproduction of the **old 2-step** objective collapses to **1.1%** (Phase 88 A was 97.9%). The objective inversion is exactly symmetric: the same windows, the same weights, flipped only by which target the loss uses.

### 3.2 Capability gates (UNCHANGED evaluator + thresholds)

| Gate | Phase 87/88 value | Phase 89 value | Level 3+ threshold | Status |
|---|---|---|---|---|
| memorization top-1 (B) | 0.0344 | **0.3893** (262 preds, chance 0.0033) | ≥ 0.5 (Level 3) | ❌ **not reached** (11.3× improvement) |
| generation zh validUtf8 | 0.00 | **0.00** | 1.0 (Level 4) | ❌ |
| generation en validUtf8 | 1.00 | **0.50** | 1.0 (Level 4) | ❌ |

**Honest capability result:** Level 3 (memorization ≥ 0.5) is **NOT reached**. The objective fix produced an 11.3× improvement in the 1-step memorization gate (0.0344 → 0.3893) — direct, real evidence the model is now trained on the evaluator's quantity — but it remains **below 0.5**. Generation is still not coherent (zh invalid UTF-8; the model's byte-level BPE merges are not yet well-formed across prompts). **Capability level stays 2.** The remaining 1-step gap is not the objective anymore: on the *training* distribution the model scores 0.9841 (1-step); on the *evaluation* distribution it scores 0.3893 — the **document-boundary mismatch (M2)** now dominates.

### 3.3 Generation outputs (probe §4, temperature 0.8, seed 42)

```
[en]     "the sun rises"            -> "tore welrith�over b��中 the �Zth "
[en]     "machine learning is"      -> "<eos>"
[zh]     "太阳"                     -> "�� masodre的�ulde<eos>"
[zh]     "机器学习是"                -> "撌��den ���列�一个<eos>"
[mixed]  "什么是 machine learning"   -> "���的应learning 的个的序数"
```

Generation remains non-coherent (consistent with Level 2 → 3 transition), but note: no repetition collapse (all 5 samples), merged subword tokens are used (zh 1.00, en 0.50, mixed 1.00), and en non-empty 1.00 / zh non-empty 1.00 — the model now emits learned merges where it never does 2-step-ahead output patterns.

---

## 4. Reproducibility & Honest Reporting

- **Reproducibility check (probe §5):** two fresh seeded (seed 42) pipelines, 2 epochs each → **identical: true** (170 steps, lossHistory bit-identical). (Full 20-epoch runs are bit-reproducible by design; the check is on the short path to keep the probe bounded.)
- **Honesty:** capability is reported from the real gates, not asserted. **Level 3 was NOT reached** (memorization top-1 0.3893 < 0.5), so this report does not claim it. The 11.3× jump from 0.0344 to 0.3893 is real and reproducible; the remaining gap is named plainly: the **M2 document-boundary mismatch** (training concatenates all 600 docs into one stream with `<eos>` separators; the memorization/generation gates feed standalone documents), identified in Phase 88 §4/§7 and now quantitatively isolated — training-distribution 1-step 0.9841 vs eval-distribution 1-step 0.3893 on the same weights.

---

## 5. Fake-Data Audit

| Check | Result |
|---|---|
| no `Math.random` in any metric/evaluator | ✅ probe uses seeded `mulberry32` in `evaluateGeneration` only (existing behavior); metrics are measured |
| no `setTimeout`-based fake training | ✅ training is real `Trainer.train()` on real tensors |
| no hardcoded metric values | ✅ every number is computed from the training/evaluation run |
| no fabricated checkpoint | ✅ checkpoint is `trainer.saveCheckpoint()` of the real trained model |
| evaluator not modified | ✅ `capability-eval/*` untouched |

---

## 6. Tests

Phase 89 adds a **7-check** regression suite at `src/lib/minimind/research/tests/phase89-training-alignment.test.ts` (wired into `run.ts`):
1. training-path criterion receives **un-shifted** `inputIds` (spy on a tiny pipeline), differing from `targetIds`
2. a perfect-1-step synthetic model scores ~0 loss under the corrected call and >5 under the old call
3. first-step training-path loss equals the independent corrected-contract reference loss (tol 1e-9)
4. checkpoint metadata validity (datasetVersion 0.3.0, param count) + save/load round-trip restores weights exactly
5. dataset identity (v0.3.0, 600 samples, zh/en/mixed 200, splits 480/60/60, `targetIds[i] === inputIds[i+1]` preserved)
6. corrected-objective reproducibility (two seeded 2-epoch runs identical) + loss decreases
7. no architecture change (1,126,528 params, production classes reused, Level 3 threshold ≥ 0.5 intact)

Existing Phase 57–88 suites are untouched. The Phase 88 diagnostic suite is untouched. One existing integration test in `training/__tests__/trainer.test.ts` was **re-derived** (not weakened): its pre/post loss measurement now uses the corrected 1-step contract (the Phase 88 §8 anticipated impact), keeping the original `avgLossAfter < avgLossBefore` assertion unchanged.

**Verified run results (all green):**

| Suite | Result |
|---|---|
| Research module (Phase 57–89) | 835 passed, 0 failed |
| Training module | 4,265,519 passed, 0 failed |
| Data module | 249 passed, 0 failed |
| Core module | 3,216,606 passed, 0 failed |
| experimentLauncherAdapter | 61 passed, 0 failed |
| `experiments/phase88/verify-shift.ts` | corrected call ≈ 0.0004 (1-step), old call ≈ 10.0 (double-shift) |

---

## 7. Build & Next-Phase Recommendation

**Build.** `npm run build` **BUILD_EXIT=0**. No TypeScript errors. No new warnings: the 175 lint warnings in the log are all pre-existing (unused vars / hook deps in UI files); **0 warnings** in `src/lib/minimind/training/`, `src/lib/minimind/research/`, `experiments/phase89/`, or `experiments/phase88/verify-shift.ts`.

**Phase 90 recommendation:** **M2 (document-boundary alignment) becomes Phase 90.** Phase 89 fixed the objective (the single largest factor — Phase 88 A/A′: 97.9% vs 1.2%; Phase 89 now 0.9841 vs 0.0106), and memorization jumped 0.0344 → 0.3893 but did **not** reach the 0.5 Level 3 gate. The remaining 1-step gap is now the eval/train sequence-layout divergence: training windows are fixed 64-token chunks of a concatenated stream (docs crossed with `<eos>` separators); the gates feed standalone documents as variable-length sequences. Phase 90 should target M2 (e.g., train/validate on per-document sequences so the training distribution matches what the gates measure), re-run the unchanged gates, and only claim Level 3 if memorization top-1 ≥ 0.5.
