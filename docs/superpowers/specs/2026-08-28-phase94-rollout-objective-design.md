# Phase 94 — Rollout-Data Augmentation (Exposure-Bias Mitigation)

**Date:** 2026-08-28
**Status:** approved — awaiting Phase 93 Cell C completion to begin implementation
**Scope:** MiniMind research module — real A/B/C experiment on the production bilingual corpus. Single variable: the **training objective** (own-context rollout-data augmentation).

---

## 1. Research question

**Does training the model on its OWN output contexts — supervised against the TRUE continuation — let the production-width model sustain valid UTF-8 byte-triplet sequences across a 24-step autoregressive rollout?**

Level 3 (memorization top-1 ≥ 0.5) is achieved at 0.9580; Level 4 (valid UTF-8 in every language at temp 0.8) is NOT achieved. Phases 91–93 ruled out (in order): a generation-pipeline bug (Phase 91), tokenizer merge budget (Phase 92, tripling single-token rate moved generation by exactly zero), and model capacity (Phase 93 A/B: doubling params left the gate signal bit-identical). The remaining suspect is **exposure bias**: the model is trained teacher-forced (each position always sees the TRUE previous tokens) but evaluated autoregressively (each position sees its OWN previously generated tokens). Errors compound over the 24-step rollout, and multi-byte CJK byte-triplets are the first to collapse.

Do NOT assume the answer. This is a controlled falsification probe.

## 2. Prior evidence (Phases 84–93)

- **Phase 84** — real bilingual capability evaluator; gates 0–5. Level 3 = memorization top-1 ≥ 0.5; Level 4 = valid UTF-8 in every language (temp 0.8), non-empty, non-collapsed, merged tokens used.
- **Phase 86** — production corpus v0.3.0, 600 samples (zh/en/mixed 200 each).
- **Phase 87** — recipe sweep: blockSize 64, batch 4, seed 42, AdamW(1e-3, 1e-2), cosine, grad-clip 1.0.
- **Phase 88/89** — corrected the objective to a proper 1-step causal + masked criterion; training loss ~0.12 but generation stayed invalid for zh/mixed.
- **Phase 90** — document-aligned layout; memorization crossed Level 3 (top-1 0.9580). Corrected the reproducibility harness bug (reset `Random.setSeed(42)` before each run).
- **Phase 91** — generation-path audit: **no software bug**; direct forward+argmax bit-identical to the production `GenerationEvaluator`. Failure is capability, not software.
- **Phase 92** — tokenizer merge budget sweep (vocab 300→340→380): tokenization and loss improved monotonically but the Level-4 gate signal was bit-identical across A/B/C. Verdict: **Outcome C** — merge budget is NOT the bottleneck.
- **Phase 93** — model capacity sweep (dModel 128/192/256 at fixed vocab 300): A/B measured — capacity flat on loss, memorization flat at 0.958, gate signal bit-identical `{zh:0.5, en:0.5, mixed:0}`; greedy invalid UTF-8 improved 0.40→0.20, rollout@24 0.085→0.119. Leaning OUTCOME B (capacity insufficient). Cell C (dModel 256) training in flight.

**Consolidated diagnosis:** with software, tokenization, and capacity ruled out, the failure is **rollout-time byte-triplet integrity under distribution shift** — the textbook exposure-bias signature.

## 3. Hypothesis

> The production 1,126,528-parameter model can memorize the training distribution (Level 3) but cannot sustain a valid multi-byte CJK byte-triplet sequence over 24 autoregressive steps because it was never trained on contexts containing its own (drift-prone) tokens. Augmenting training with windows whose suffix is the model's own argmax continuation — supervised against the TRUE next tokens — teaches recovery from drift. This should raise the temp-0.8 valid-UTF-8 ratio toward 1 and move the Level-4 gate.

## 4. Experimental design

**Single variable: rollout horizon `k` of own-context augmentation.** Everything else pinned to the Phase 90–93 production recipe.

| Cell | k | Meaning |
|---|---|---|
| A | 0 | Baseline 1-step masked CE — **reuse Phase 90 condition-B artifact** (`experiments/phase90/phase90-aligned.ckpt.json`, bit-identical per Phase 90 reproducibility contract, saves ~2h) |
| B | 8 | Augmented: recover from an 8-token own drift |
| C | **24** | Augmented: recover across the **full 24-token eval horizon** (matches `MAX_TOKENS`) |

**Kept constant across all cells:** vocab 300 tokenizer (same trained BPE state), blockSize 64, batchSize 4, seed 42, dataset bilingual v0.3.0 (600 docs), document-aligned sequence layout (Phase 90), masked corrected 1-step objective (Phase 89), AdamW(lr 1e-3, wd 0.01), cosine (10% warmup → 1% min), grad-clip 1.0, epochs 20, same evaluation code, same 5 generation prompts, same max-token count (24), same sampling modes (greedy + temp 0.8). The capability evaluator, gates, and Level thresholds are USED UNCHANGED.

### 4.1 Augmentation mechanism

Per augmented batch (frequency R = 4 optimizer steps → every 4th step uses augmented windows):

1. For each of the B samples, pick a random document `offset` and rollout-start `s0` (seeded `Random`, deterministic).
2. Take the true document token prefix `x[0..s0]`.
3. Roll the **current** model's argmax tokens forward `k` steps (`Tensor.noGrad` on the prefix, the exact same loop the Phase 93 probe's `utf8DegradationCurve`/`rolloutAccuracy` already use): `own[1..k] = argmax(forward(prefix + own[1..j-1]))`.
4. Build a **64-token training window** = true prefix (length `s0+1`) + own tail (length `k`); positions after `s0+k` are masked (padding). Clamp `s0` so `s0 + k < 64`; windows that would cross the document end are skipped and replaced with a plain window.
5. One standard forward + backward supervises **every valid position** against the **TRUE next token** (`crossEntropyLoss` with the document-aligned mask, unchanged). Own-region positions are supervised against `x_true[s+1]` — the model learns "even from my own mistakes, the next real token is X."

The own tokens are detached (integer inputs); gradients flow only through the single forward over the augmented window. No new autograd path, no sampling, no gradient through argmax — stable and deterministic.

### 4.2 Why R=4

The on-policy rollout construction costs `k` noGrad forwards per augmented batch. Amortizing over R=4 steps keeps B ≈ 4h and C ≈ 6h while limiting on-policy staleness to 4 optimizer steps (negligible at lr 1e-3). If the actual measured pace makes a different R more appropriate, the report records the deviation explicitly — the optimization budget (3000 steps) is NOT silently changed.

### 4.3 Reproducibility

Phase 90 CORRECTED pattern: every fresh cell runs 2× fresh seeded 2-epoch runs with `Random.setSeed(42)` reset **before each run**. The augmentation's offsets use the same seeded global RNG, and the argmax rollout is deterministic given model + prefix → identical runs must be bit-identical. A reuses Phase 90's verified evidence.

## 5. Parameter counts

Production architecture (Cell A, reused): `params(300, 128, 512, 4) = 1,126,528`. Cells B/C use the SAME architecture (only the objective differs) — exact count **1,126,528**, verified at probe construction.

## 6. Metrics (per cell)

- Training: initial/final/best loss, optimization steps, wall-clock duration, max/mean parameter delta.
- Training-distribution 1-step top-1/top-5/top-10 (aligned, mask-aware) — measured on TRUE windows (the Phase 93 supplementary signal).
- Unchanged evaluator: memorization top-1, derived Level, Level-4 gate status.
- Greedy + temp-0.8 valid-UTF-8 ratios (overall and by zh/en/mixed), non-empty, non-collapsed, merged-token ratios.
- Rollout degradation curve by step; next-token rollout accuracy.
- **Phase-specific mechanism metric (NEW):** next-token accuracy on OWN-context windows vs TRUE windows (eval-time, noGrad). This directly tests whether the objective improves recovery-from-drift — the mechanism claim. If own-context accuracy rises while the gate does not, that distinguishes "objective works mechanically but Level 4 needs more."

## 7. Outcome classification

- **OUTCOME A**: an augmented cell reaches Level 4 → exposure bias confirmed as the blocker; reproduce the winner independently before declaring victory.
- **OUTCOME B**: gate signal / rollout validity improves substantially but not Level 4 → objective helps, incomplete; identify the remaining gap.
- **OUTCOME C**: no movement on the gate → exposure bias is not the (only) blocker; report next-lever candidates.
- **OUTCOME D**: augmentation hurts (model amplifies its own errors / self-drift) → report the failure mode and the measured drift evidence.

## 8. Artifacts

- `experiments/phase94/probe.ts` — A/B/C, crash-safe per-candidate JSON, `--only=` resumable, mirrors Phase 93 probe structure. Implements its own augmented training loop on the same building blocks (AdamW, CosineScheduler, `collateBatch`, `crossEntropyLoss`, document-aligned mask); **production `Trainer` untouched**.
- `experiments/phase94/candidate-{A,B,C}.json` + `probe-results.json`.
- `src/lib/minimind/research/PHASE94-ROLLOUT-OBJECTIVE-REPORT.md` — filled with measured numbers, §10 outcome classification, §13 next-phase recommendation.
- `src/lib/minimind/research/tests/phase94-rollout-objective.test.ts` — registered in `__tests__/run.ts` (`runPhase94Tests`). Static contracts (objective-config valid, exact param counts, production SSOT intact, identifiers unchanged, evaluator unchanged, no threshold changes) + artifact contracts (training real, checkpoint integrity, reproducibility with per-run seed reset, gates in valid ranges, own-context windows well-formed).

## 9. Validation runs (recorded in the report)

Research suite (`npx tsx src/lib/minimind/research/__tests__/run.ts`), data suite, training suite, core suite, adapter suite, `npm run build`. All must pass with zero failures before declaring the phase complete.

## 10. Cost estimate

At production width (≈2.3 s/step baseline): **B ≈ 4h, C ≈ 6h** + reproducibility (2×2-epoch per fresh cell) + eval + report ≈ **~12h total**, comparable to Phase 93 (~10h). Runs detached (the sandbox-disabled `Start-Process -FilePath` pattern proven in Phase 93) and logs to `experiments/phase94/probe-detached.log`.

## 11. Risks

- **Self-drift (OUTCOME D):** training on own outputs can reinforce errors. Mitigated by supervising against TRUE continuation (imitation, not self-labels) and by on-policy staleness being only 4 steps.
- **Cost blow-up:** if the JS tensor impl is superlinear at wider dModel the probe's measured pace governs — the budget (3000 steps) is fixed, and runtime is REPORTED, never silently reduced.
- **s0 small → noisy own tokens:** very short prefixes produce garbage own tokens early in training. Default `s0` range is moderate (e.g., `[8, 63-k]`), recorded in the report.
- **Short-prompt eval mismatch:** eval uses 2–5 token prompts; augmentation prefixes are longer. This is a known residual gap, tracked via the degradation-curve-by-step metric (validity at small steps is where short-prompt collapse shows).
