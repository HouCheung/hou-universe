# Phase 84 — MiniMind Real Bilingual Training Capability Validation

**Date:** 2026-08-18
**Purpose:** Find out what the model can **REALLY** do, with hard evidence —
not to make it look better. This phase runs the actual production training path
end-to-end (no fakes, no simulated training, no `Math.random` results), measures
the real capability level, and reports it honestly — including the fact that the
model is **far** from fluent bilingual generation.

**Headline result:** The production path is **real and deterministic**, and the
model reaches **Capability Level 2** (pipeline + bilingual tokenizer + training
signal). It does **not** reach Level 3 (memorization), Level 4 (coherent
generation), or Level 5 (Q&A). Along the way this phase **found and fixed a real
tokenizer round-trip bug** (Level 1 blocker).

---

## 1. Training Path (verified by reading code + running it)

The actual execution path is, in full:

```
TrainingRuntime.spawnWorker()
  → getProductionModelConfig()          // V=300 target, D=128, H=4, dFF=512, L=4, S=256
  → TrainingWorker
  → BPETokenizer.train(corpus, 300)     // 256 bytes + 4 special tokens + 40 merges
  → TextDataset({ tokenizer, corpus, blockSize })
  → DataLoader({ batchSize, shuffle, seed })
  → TensorMiniMindModel({ vocabSize: tokenizer.vocabSize, ... })
  → Trainer   (forward → crossEntropyLoss → backward → clipGradients
               → AdamW.step → CosineScheduler.step → zeroGrad)
  → checkpoint (v3)
```

No path hardcodes a config constant; every surface reads `getProductionModelConfig()`.
The probe [`experiments/phase84/probe.ts`](../../../../experiments/phase84/probe.ts)
drives **exactly** this sequence (tokenizer → dataset → loader → model → AdamW →
Cosine → Trainer → checkpoint), so the numbers in §3 are from the real path, not a
parallel reimplementation.

---

## 2. Experiment Configuration

| Parameter | Value |
|---|---|
| Corpus | production bilingual dataset, **84 samples** (zh 30 / en 30 / mixed 24) |
| Tokenizer | byte-level BPE, `train(corpus, 300)` → actual vocab **300** |
| Model | `TensorMiniMindModel` — D=128, H=4, dFF=512, L=4, S=256, **1,126,528 params** |
| blockSize | 16 |
| batchSize | 4 |
| epochs | 5 |
| learningRate | 0.001 |
| weightDecay | 0.01 |
| gradientClipNorm | 1.0 |
| scheduler | Cosine (base → min 1% of lr), warmup 10% of steps |
| optimizer | AdamW (β₁=0.9, β₂=0.999, ε=1e-8) |
| seed | 42 (via `Random.setSeed` + `DataLoader` seed) |

`numSamples = 212` (tokenized windows of the 84 texts at blockSize 16),
`numBatches = 53`, `totalSteps = 265`.

---

## 3. Real Training Results

Measured from one full probe run (5 epochs, 265 optimizer steps):

| Metric | Value |
|---|---|
| wall-clock duration | 106,237 ms (~106 s) |
| initial loss (first recorded) | 6.1456 |
| **final loss** | **2.4956** |
| loss decrease | **6.1456 → 2.4956** (real, monotonically decreasing signal) |
| max |param delta| across all 1,126,528 params | 0.08269 |
| mean |param delta| | 0.00874 |

**Interpretation:** training is genuinely updating weights and driving loss down
(−3.65 nats). This is a **real training signal** — not a plateau at random-init
loss, and not a fabricated result. However, 5 epochs on 84 samples is not enough
to learn language; it only proves the signal is alive (see §5).

---

## 4. Generation Results (honest, unfiltered)

Generation after training, `temperature 0.8, maxTokens 24, seed 42`:

| Prompt | Output |
|---|---|
| `the sun rises` | garbled / low-entropy collapse |
| `太阳` | `太阳娄傺��型���型��抉譎�` |
| `什么是 machine learning` | garbled |
| `the transformer uses` | garbled |
| `机器学习是` | `机器学习是�<eos>` |

**Interpretation:** generation is **not coherent** in any language. Output is a
mixture of the seed prompt echoed back, repeated-collapse loops, and invalid
UTF-8 replacement bytes (`�`). This is exactly what one expects from 5 epochs on
84 samples — the model has learned almost nothing about language structure yet.
**No fluent bilingual generation is claimed.**

---

## 5. Capability Level — **Level 2**

Capability gates (strict chain — Level N requires all levels 0..N):

| Level | Gate | Evidence | Status |
|---|---|---|---|
| 0 | Pipeline runs end-to-end | real training run completed (265 steps) | ✅ |
| 1 | Tokenizer round-trips bilingually | 84/84 samples `decode(encode(t)) === t` (zh 30 / en 30 / mixed 24) | ✅ |
| 2 | Training signal | loss 6.1456 → 2.4956; params changed (max Δ 0.08269) | ✅ |
| 3 | Memorization (top-1 ≥ 0.5) | top-1 accuracy **0.0305** on 295 next-token predictions | ❌ |
| 4 | Coherent generation | garbled output, invalid UTF-8, repeat collapse | ❌ |
| 5 | Basic Q&A | no evidence of any kind | ❌ |

**Final: Capability Level 2 of 5.**

Detail on the Level 3 gate: `measureMemorization` made **295** next-token
predictions over 8 held-out sequences. Top-1 accuracy = **0.0305** (≈9/295).
Chance at vocab 300 = 0.00333, so the model is ~9× above chance (`exceedsChance`
= true) — a faint but real signal that some frequent byte/merge patterns are being
learned — yet it is **~16× below the 0.5 threshold** required for Level 3
memorization. The `reproducesPatterns` flag is therefore **false**, and Level 3+ is
correctly not awarded.

---

## 6. Checkpoint Persistence — **blocked (not viable in localStorage)**

| Metric | Value |
|---|---|
| full checkpoint JSON (`modelParams` + AdamW `m` + `v` = 3P Float64) | **73,353,528 bytes ≈ 73 MB** |
| browser `localStorage` quota (typical) | ~5 MB |

**A full production checkpoint is ~14× larger than `localStorage` can hold.**
`ResearchWorkspace.writeSessions()` already swallows the resulting
`QuotaExceededError` in an empty `catch {}`, so persistence **fails silently** —
the user sees no error and no checkpoint is saved. This confirms the theoretical
~50–70 MB bound from Phase 83 §5 with a measured number.

**This is the single largest blocker to a usable train→save→resume loop in the
browser.** A future phase must move checkpoints to **IndexedDB** (unbounded,
structured clone), or serialize weights-only, or quantize (`Float32`/`Int16`).

---

## 7. Reproducibility

Two identical `buildAll()` runs (same seed 42, same corpus, same config):

| Run | final loss |
|---|---|
| run 1 | 2.4956 |
| run 2 | 2.4956 |
| **Δ** | **0 (exact)** |

Training is **bit-reproducible**: fixed seed + seeded `DataLoader` + seeded RNG
→ identical final loss. This means deterministic experiments are possible (§10).

---

## 8. Bug found & fixed — tokenizer round-trip (Level 1 blocker)

While validating the Level 1 gate, the tokenizer failed `decode(encode(text)) ===
text` on **31 of 84** samples (e.g. `watche s` → `watches`, double spaces,
collapsed tokens).

**Root cause:** `BPETokenizer` stored merge rules in a `Map` keyed by
`` `${tokenA} ${tokenB}` `` — a **space** (`0x20`) as the pair separator. But the
space byte `0x20` is itself a legitimate byte-level token, so the key became
ambiguous whenever a token contained the space byte, corrupting `encode()`,
`toState()`, and `fromState()`.

**Fix** (4 surgical edits in [`BPETokenizer.ts`](../tokenizer/BPETokenizer.ts)): key
merges by **integer token-ID pair** `` `${idA},${idB}` `` (IDs are non-negative
integers, so `,` is an unambiguous separator), and reconstruct the key from token
strings in `fromState()`.

**Verification:** 0/84 round-trip failures after the fix; the existing
`BPETokenizer.test.ts` suite still passes (44 tests). This satisfies the Phase 84
constraint "do not modify core math unless a concrete correctness bug is proven" —
the bug **was** proven (31/84 failures with a clear, minimal root cause).

---

## 9. Tests

New file [`__tests__/phase84-capability.test.ts`](./__tests__/phase84-capability.test.ts)
using the **existing** `assert`/`test` harness (no Bun, no new runner), wired into
[`run.ts`](./__tests__/run.ts). 15 tests total — 9 sync + 6 async (real training).

| Group | Coverage | Result |
|---|---|---|
| 1 | Production config (vocab 300, 1,126,528 params, no bias) | ✅ |
| 2 | Bilingual dataset contract (zh/en/mixed present) | ✅ |
| 3 | Tokenizer ↔ model compatibility (`[B,S,V]` forward) | ✅ |
| 4 | Tokenizer round-trip (`decode(encode)` bilingually) | ✅ |
| 5 | Real training completes + loss decreases | ✅ |
| 6 | Optimizer actually changes params | ✅ |
| 7 | Determinism (2 runs, Δ < 1e-9) | ✅ |
| 8 | Checkpoint metadata (datasetVersion 0.2.0, schema 1, purpose) | ✅ |
| 9 | Checkpoint round-trip (param Δ < 1e-12) | ✅ |
| 10 | Capability evaluator (round-trip + generation + memorization + level) | ✅ |
| 11 | Honest capability level (does **not** over-claim Level 3+) | ✅ |

```
Phase 84 (sync):  9 passed, 0 failed
Phase 84 (async): 6 passed, 0 failed
TOTAL (research suite 57–84): 787 passed, 0 failed
```

---

## 10. Build

`npm run build` completes with exit code 0 — **no TypeScript errors, no new
warnings from Phase 84 files.** The build reports 173 pre-existing ESLint
warnings (`no-unused-vars`, `exhaustive-deps`) in legacy files untouched by this
phase (e.g. `evaluation/*`, `core/__tests__/*`, `training/__tests__/*`); **none**
are in `capability-eval/*`, `phase84-capability.test.ts`, or `BPETokenizer.ts`.
These predate Phase 84 and are out of scope to fix here.

---

## 11. Remaining Blockers (ranked)

1. **Checkpoint persistence (~73 MB vs ~5 MB `localStorage`)** — the train→save→
   resume loop silently fails in-browser. **Fix: IndexedDB** (§6).
2. **No fluent bilingual capability** — the model is at Level 2; generation is
   garbled. This is a **data + compute** problem (84 samples, 5 epochs), not a code
   bug. Needs a much larger corpus and more training to move toward Level 3/4.
3. **No instruction tuning / Q&A capability** — no such data or head exists; Level 5
   is structurally unattainable in the current setup.

---

## 12. Files changed (all within `HOU Universe` root)

**Created:**
- `src/lib/minimind/research/capability-eval/evaluate.ts` — tokenizer round-trip,
  memorization, generation evaluators.
- `src/lib/minimind/research/capability-eval/levels.ts` — capability-gate derivation
  (strict chain, Level 0→5) + text report.
- `src/lib/minimind/research/capability-eval/index.ts` — barrel re-export.
- `src/lib/minimind/research/__tests__/phase84-capability.test.ts` — 15 tests.

**Modified:**
- `src/lib/minimind/tokenizer/BPETokenizer.ts` — merge-key space-collision bug fix.
- `src/lib/minimind/research/__tests__/run.ts` — register Phase 84 suite.
- `experiments/phase84/probe.ts` — capability evaluation + reproducibility block.

**Not changed / not fabricated:**
- No model size increase. No new model / tokenizer / Trainer / Runtime / Worker.
- No fake generation or metrics. No `setTimeout`-simulated training, no
  `Math.random` results, no hardcoded answers, no silent fallback to a tiny corpus.
- No change to `TensorMiniMindModel` math (only the tokenizer's merge-key bookkeeping,
  which was a proven correctness bug).

---

## 13. Recommended Phase 85

1. **Checkpoint → IndexedDB.** Replace the silent `localStorage` write with an
   IndexedDB-backed store (or weights-only/quantized serialization) so train→save→
   resume actually works in-browser. This unblocks a real user loop.
2. **Larger corpus + longer training.** The single biggest capability lever is
   data. Even a few thousand bilingual lines with a 32–64 token blockSize and more
   epochs would move the model from Level 2 toward Level 3 (memorization) and
   eventually Level 4 (coherent generation). This should be a *measured* increment,
   re-run through the §5 gates, not a jump to "fluent".
3. **Re-run the §5 capability gates after each data/recipe change** so Level is
   re-derived from evidence, never asserted.
