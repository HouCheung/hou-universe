# Phase 87 — Training Recipe Sweep: Context Length + Longer Training

**Date:** 2026-08-21
**Purpose:** Phase 86 established that *data volume alone* did not move capability —
the 7.1× corpus expansion (84 → 600 samples) still left the model at Capability
Level 2 of 5. This phase runs the next controlled experiment: a **2×2 sweep over
the training recipe** — context length (`blockSize`) and training length (`epochs`)
— **without changing** model architecture, tokenizer, dataset, Trainer, or the
capability evaluator. The question is whether *longer context + longer training*
materially improves learning.

**Headline result:** The recipe is **not** the bottleneck either. All four cells
remain **Capability Level 2 of 5**. Longer training drives training loss to
near-zero (0.24 → 0.17) — genuine overfitting of the training windows — yet
memorization top-1 never approaches the 0.5 gate (it stays ~0.015–0.034), and zh
generation remains invalid UTF-8 (`ratio 0`) in every cell. The combined recipe
(blockSize 64, epochs 20) matches the baseline memorization *exactly* (0.0344)
despite 4× more training. Neither data volume (Phase 86) nor recipe tuning (this
phase) moves capability; the binding constraint lies elsewhere.

---

## 1. Experiment Design — the 2×2 Recipe Sweep

The only variables changed are the two training-recipe knobs. Neither is model
architecture:

| Cell | `blockSize` (context) | `epochs` (training) | Meaning |
|---|---|---|---|
| **baseline** | 16 | 5 | Phase 86 measured (deterministic — re-run is bit-identical) |
| **context-only** | 64 | 5 | longer context, same training length |
| **epochs-only** | 16 | 20 | longer training, same short context |
| **combined** | 64 | 20 | both levers together |

- `blockSize` is the causal-window length in `TextDataset` — a pure data-batching
  parameter. The model `maxSeqLen = 256` is untouched; 64 is well within it.
- `epochs` is the number of full passes over the corpus.
- Every other knob is held fixed (identical to Phase 84/86): `batchSize = 4`,
  `lr = 0.001`, `weightDecay = 0.01`, `gradientClipNorm = 1.0`, Cosine schedule
  (10% warmup → 1% min), AdamW, `seed = 42`.

Total token-positions processed per epoch is independent of `blockSize`
(concatenation is shared), so **wall-clock scales with `epochs`**, not step count.
Note that holding `epochs` fixed while raising `blockSize` 16→64 *cuts* optimizer
steps 4× (fewer, longer windows) — so the two variables are not independent, which
is exactly why a full 2×2 sweep (not a single combined change) is required.

---

## 2. Hard-Constraint Compliance

The production model, tokenizer, dataset, Trainer, Runtime, Worker, and capability
evaluator are **all unchanged**. Verified by the Phase 87 test suite (see §5):

| Constraint | Status |
|---|---|
| `ModelRegistry` production config | ✅ unchanged — vocab 300, D=128, H=4, dFF=512, L=4, S=256, **1,126,528 params** |
| tokenizer implementation / vocab construction | ✅ unchanged (byte-level BPE, target 300) |
| dataset `bilingual.json` v0.3.0 (600 samples) | ✅ unchanged |
| capability evaluator gates + thresholds | ✅ unchanged (Level 3 still requires top-1 ≥ 0.5) |
| no second model / tokenizer / Trainer / Runtime / Worker | ✅ none introduced |
| no `Math.random` in training / metrics / generation / eval | ✅ (seeded `Random`, `mulberry32`) |

---

## 3. Measured Results — the Sweep

Filled from one full run of `experiments/phase87/probe.ts` (real training + real
evaluation, all 3 new cells). Baseline row is Phase 86's recorded measurement.

### 3.1 Comparison table

| config | blockSize | epochs | final loss | max \|Δparam\| | mem top-1 | zh UTF-8 | en UTF-8 | level |
|---|---|---|---|---|---|---|---|---|
| baseline | 16 | 5 | 2.8615 | 0.1667 | 0.0344 | 0.00 | 1.00 | 2 |
| context-only | 64 | 5 | 3.4526 | 0.1032 | 0.0229 | 0.00 | 0.50 | 2 |
| epochs-only | 16 | 20 | 0.2424 | 0.6423 | 0.0153 | 0.00 | 0.00 | 2 |
| combined | 64 | 20 | 0.1700 | 0.4819 | 0.0344 | 0.00 | 1.00 | 2 |

### 3.2 Per-cell detail

| config | windows | batches | steps | duration | initial loss | mean \|Δparam\| |
|---|---|---|---|---|---|---|---|
| context-only (64, 5) | 342 | 85 | 425 | 676 s (~11 min) | 5.9457 | 0.00954 |
| epochs-only (16, 20) | 1,368 | 342 | 6,840 | 2,995 s (~50 min) | 6.0442 | 0.04371 |
| combined (64, 20) | 342 | 85 | 1,700 | 3,851 s (~64 min) | 5.9457 | 0.02559 |

### 3.3 Interpretation

1. **Context alone (16→64, epochs 5) hurts.** 425 steps (vs baseline 1,710) → final
   loss *rises* (2.86 → 3.45) and memorization *falls* (0.0344 → 0.0229). Fewer
   gradient updates dominate any benefit from longer windows.
2. **Epochs alone (5→20, blockSize 16) overfits without transferring.** Final loss
   collapses 6.04 → 0.24 (near-perfect training-window reproduction) and \|Δparam\|
   roughly 4× the baseline — yet memorization *falls* to 0.0153 and all three
   language classes emit invalid UTF-8. Lower training loss does **not** mean
   better capability.
3. **Combined (64, 20)** achieves the lowest loss (0.1700) and a memorization of
   0.0344 — *identical* to the baseline (16, 5) to four decimal places. Four times
   the training, on four times the context, buys zero capability.

---

## 4. Capability Evaluation (unchanged gates)

The Phase 84 evaluator is re-run for each cell and the Level re-derived from
measured evidence — never asserted.

| Cell | Level 0 (pipeline) | Level 1 (round-trip) | Level 2 (signal) | Level 3 (mem ≥ 0.5) | Level 4 (coherent) | Level 5 (Q&A) | Final |
|---|---|---|---|---|---|---|---|
| context-only | ✅ | ✅ | ✅ | ❌ (0.0229) | ❌ | ❌ | **2** |
| epochs-only | ✅ | ✅ | ✅ | ❌ (0.0153) | ❌ | ❌ | **2** |
| combined | ✅ | ✅ | ✅ | ❌ (0.0344) | ❌ | ❌ | **2** |

- **Level 1** round-trip remains lossless (600/600) in every cell — the recipe
  change cannot break the byte-level tokenizer.
- **Level 3** top-1 stays ~10× above chance (chance = 1/300 = 0.0033) but ~15×
  below the 0.5 gate, in every cell.
- **Level 4** zh generation is invalid UTF-8 (`ratio 0`) in every cell; en is valid
  in baseline/combined but invalid in epochs-only. The model still cannot emit
  coherent bilingual text under any recipe.

---

## 5. Tests

Phase 87 added an **11-check** suite (7 sync + 4 async) using the existing
hand-written `assert`/`test` harness, wired into `run.ts`.

| Suite | Result |
|---|---|
| Phase 87 (sync) | 7 passed, 0 failed |
| Phase 87 (async, 1-epoch real training at blockSize 64) | 4 passed, 0 failed |
| Full research suite (Phase 57–87) | **820 passed, 0 failed** (Phase 86 was 809) |

The 7 sync checks verify: model config unchanged, dataset unchanged, evaluator
unchanged, recipe-only variation (blockSize/epochs are NOT model-config fields),
the exact 2×2 matrix, blockSize-64 window validity (causal shift intact), and
no new model/tokenizer/Trainer/Runtime/Worker.

---

## 6. Build & Remaining Gap

**Build.** `npm run build` exits **0** (`BUILD_EXIT=0`) with no TypeScript errors
and no new warnings in Phase 87 files. (174 pre-existing `no-unused-vars` ESLint
warnings remain in legacy files untouched by this phase.)

**Remaining gap.** Capability is stuck at Level 2 across two orthogonal levers —
data volume (Phase 86: 84→600) and training recipe (Phase 87: blockSize 16→64,
epochs 5→20). The decisive evidence is that **training loss reaches 0.17 while
memorization top-1 does not move** (and even *falls* under longer training). This
means the memorization/generation gates are measuring a distribution the training
loop does not optimize, not a quantity that more data or more training can reach.

The suspected cause is a **train/eval data-layout mismatch**: `TextDataset`
concatenates all 600 samples into one stream and chunks by `blockSize`, so the
model learns next-token prediction *across document boundaries* inside fixed-size
windows; `measureMemorization` and `evaluateGeneration` instead feed *per-document*
prefixes of variable length. The model has never seen the eval's context regime.

**Recommended Phase 88 — investigate training-data layout (not architecture, not
more seed text):**
1. Verify the train/eval mismatch hypothesis by measuring memorization in the
   *training* regime (next-token over the concatenated stream / fixed window),
   which the model should score near-perfectly at loss 0.17.
2. If confirmed, try a data-layout change that aligns training with the evaluator
   (e.g. chunk each document independently rather than across the concatenated
   stream) — a data-batching change, allowed by the current constraints.
3. Re-run the §4 gates after any change, and only claim fluency if memorization
   top-1 actually approaches 0.5 and zh generation becomes valid UTF-8. Neither is
   true today.
