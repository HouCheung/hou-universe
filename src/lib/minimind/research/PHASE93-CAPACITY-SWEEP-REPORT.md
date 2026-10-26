# Phase 93 — Model Capacity Sweep

**Status:** ⏳ **running — finalizing.** A/B measured and recorded; C's 20-epoch retrain (2026-08-29, detached) re-running to (a) satisfy the Phase 93 contract that fresh cells are trained by this probe and (b) record C's wall-clock duration and parameter deltas. All other C numbers are already measured and deterministic. Final numbers land in `experiments/phase93/probe-results.json`.
**Date:** 2026-08-26
**Scope:** MiniMind research module, real A/B/C capacity experiment on the production bilingual corpus.

---

## 1. Research question

**Is model capacity the primary bottleneck preventing Level 4 coherent bilingual generation?**

Level 3 (memorization top-1 ≥ 0.5) is achieved at **0.9580**; Level 4 (valid UTF-8 in every language, non-empty, non-collapsed, merged tokens used) is **NOT achieved**. Phases 91–92 ruled out a generation-pipeline bug and ruled out tokenizer merge budget as the lever. The remaining suspect is that the production **1,126,528-parameter** model — with `dModel=128` — is wide enough to memorize the training distribution but not wide enough to maintain stable autoregressive rollout of **multi-byte CJK byte-triplet sequences**.

Do **NOT** assume the answer. This is a controlled falsification probe.

---

## 2. Prior evidence (Phases 84–92)

- **Phase 84** established the real bilingual capability evaluator: tokenizer round-trip → memorization top-1 vs chance → generation valid-UTF-8/non-empty/non-collapsed/merged-token → `deriveCapabilityLevel` (gates 0–5). Thresholds: Level 3 top-1 ≥ 0.5; Level 4 valid UTF-8 in every language.
- **Phase 86** production corpus expansion → bilingual v0.3.0, 600 samples (zh/en/mixed 200 each).
- **Phase 87** recipe sweep → blockSize 64, batch 4, seed 42, AdamW(1e-3, 1e-2), cosine, grad-clip 1.0.
- **Phase 88/89** corrected the training objective to a 1-step causal + masked criterion; training loss reached ~0.12 but generation stayed invalid for zh/mixed.
- **Phase 90** document-aligned layout: memorization crossed the Level 3 gate (top-1 0.9580, Level 3 achieved). Phase 90 also surfaced and corrected a reproducibility harness bug (run #2 must reset `Random.setSeed(42)` before each run because model init consumes the global RNG).
- **Phase 91** audited the entire generation path (tokenizer → model → forward → sampling → EOS → decode) against the real Level-3 checkpoint and found **no software bug**. Direct forward+argmax is bit-identical to the production `GenerationEvaluator` greedy path. The failure is capability, not software.
- **Phase 92** tested tokenizer merge budget (vocab 300 → 340 → 380). Tokenization improved monotonically (tokens/CJK occurrence 2.685 → 2.404 → 2.244; single-token chars 5.3% → 17.1%), final loss improved (0.1226 → 0.1120 → 0.1074), but **generation validity did not move at all** (Level-4 gate signal bit-identical across A/B/C: zh 0.5 / en 0.5 / mixed 0.0). Verdict: **Outcome C** — merge budget is NOT the bottleneck. The failure is rollout-time byte-triplet integrity.

Phase 92's recommendation explicitly named a **model-capacity study at fixed vocab 300** as the next step — this phase.

---

## 3. Hypothesis

> The current ~1.13M-parameter model (dModel 128, 4 layers) is sufficient for Level 3 memorization but insufficient for stable autoregressive rollout, especially for multi-byte CJK token sequences. Increasing width should sharpen per-position next-token distributions enough to keep zh/mixed rollouts valid UTF-8 for 24 steps, moving valid-UTF-8 ratios toward 1.

---

## 4. Experimental design

**Single variable: model width (dModel).** Everything else pinned to the production recipe. `numHeads` fixed at 4 (mathematically compatible for all widths: 128/192/256 all divisible by 4). `dFF = 4 × dModel` (the documented production scaling; production dFF 512 = 4 × 128). `numLayers` fixed at 4. `vocabSize` fixed at 300 — the **same** production tokenizer is used for every cell (capacity is the only thing that varies).

| Cell | dModel | numHeads | dFF | numLayers | Training |
|---|---|---|---|---|---|
| A | 128 | 4 | 512 | 4 | reuse Phase 90 condition-B artifact (same architecture) |
| B | 192 | 4 | 768 | 4 | fresh, 20 epochs (3000 steps) |
| C | 256 | 4 | 1024 | 4 | fresh, 20 epochs (3000 steps) |

**Kept constant across all cells:** vocab 300 tokenizer (same trained BPE state), blockSize 64, batchSize 4, seed 42, dataset bilingual v0.3.0 (600 docs), document-aligned sequence layout (Phase 90), masked corrected 1-step objective (Phase 89), AdamW(lr 1e-3, wd 0.01), cosine (10% warmup → 1% min), grad-clip 1.0, same evaluation code, same 5 generation prompts, same max-token count (24), same sampling modes (greedy + temp 0.8).

**Measured per cell:** initial/final/best loss, optimization steps, wall-clock duration, max/mean parameter delta, training-distribution 1-step top-1 (aligned, mask-aware) plus top-5/top-10 as supplementary signal, unchanged evaluator memorization top-1, greedy and temp-0.8 valid-UTF-8 ratios (overall and by zh/en/mixed), rollout degradation by step, next-token rollout accuracy, and the Level derived by the unchanged capability evaluator.

The same optimization budget (3000 steps) is used across cells first. If runtime became excessive the constraint would be reported and a smaller pilot proposed — **not** silently changed.

---

## 5. Exact parameter counts

The `TensorMiniMindModel` graph is exactly countable (no estimate). Embedding `[V,D]` + LM head `[D,V]` (untied) = `2·V·D`; per layer Q/K/V/O (`4·D²`) + FFN gate/up/down (`3·dFF·D`) + two RMSNorm (`2·D`); final RMSNorm (`D`):

```
params(V, D, dFF, L) = 2·V·D + L·(4·D² + 3·dFF·D + 2·D) + D
```

| Cell | D | dFF | L | Analytic count | Model graph `totalParamCount` |
|---|---|---|---|---|---|
| A | 128 | 512 | 4 | **1,126,528** | **1,126,528** (verified) |
| B | 192 | 768 | 4 | **2,476,224** | **2,476,224** (verified) |
| C | 256 | 1024 | 4 | **4,350,208** | **4,350,208** (verified) |

Analytic and actual-model-graph counts agree exactly for every cell (verified at probe construction).

---

## 6. Training results

Measured from `experiments/phase93/probe-results.json` (A/B recorded; C from the live probe log — deterministic, confirmed by the 2026-08-29 retrain). "Final loss" is the last optimizer step's loss (`lossHistory[last]`), "best loss" the lowest recorded step loss — the values `probe.ts` records per candidate.

| | A (reused Phase 90) | B | C |
|---|---|---|---|
| trained | no (Phase 90 artifact) | yes (fresh) | yes (fresh) |
| initial loss | 6.0273 | 6.1274 | 5.7775 |
| final loss | 0.1226 | 0.1210 | 0.1246 |
| best loss | 0.1222 | 0.1207 | 0.1244 |
| total steps | 3000 | 3000 | 3000 |
| duration | 113.6 min | 144.8 min | **473.3 min** |
| max \|Δparam\| | 0.5536 | 0.3633 | **0.2852** |
| mean \|Δparam\| | 0.0302 | 0.0277 | **0.0269** |

C's row was filled on 2026-09-14 from `experiments/phase93/candidate-C.json` (duration 28,397,940 ms ≈ 473.3 min, on 3000 steps). B's measured wall-clock was 8,688,187 ms (≈144.8 min).

**These durations must not be read as a clean cost model for width.** All three are 3000-step runs, but A is a Phase 90 (August) measurement and the machine's throughput changed across the sweep — the phase's own notes record dModel 256 measuring ~9.5 s/step against ~6.3 s/step for the same work in August, i.e. roughly a 1.5× machine-level slowdown. C's 473.3 min therefore reflects *both* a wider graph *and* a slower machine, and the two cannot be separated from these numbers alone. What is safe to say is only the raw ordering; whether width's cost is superlinear, as the §11 risk note anticipated, is **not** established by this table.

**The loss curve is NOT monotone in capacity.** The largest model C (4.35M params) trains to a *worse* final loss (0.1246) than both A (0.1226) and B (0.1210). With only 600 documents, 4× parameters do not buy a better fit — the extra capacity is unused (at best) or slightly hurtful (slower/overfit on a small corpus).

---

## 7. Capability results (evaluator unchanged)

| Gate | A | B | C |
|---|---|---|---|
| memorization top-1 | 0.9580 | 0.9580 | 0.9580 |
| Level (highest achieved) | 3 | 3 | 3 |
| Level 4 (valid UTF-8 everywhere) | ❌ | ❌ | ❌ |

Training-distribution 1-step (aligned, mask-aware):

| | A | B | C |
|---|---|---|---|
| top-1 | 0.9645 | 0.9638 | 0.9607 |
| top-5 | 0.9926 | 0.9926 | 0.9926 |
| top-10 | 0.9970 | 0.9970 | 0.9970 |
| NLL | 0.1187 | 0.1181 | 0.1225 |

Even the **training-distribution fit does not improve with capacity**: top-1 is flat-to-slightly-worse across A→B→C (0.9645 → 0.9638 → 0.9607). The 600-doc corpus cannot absorb 4× capacity. Memorization is pinned at 0.9580 for all three cells and the derived Level is 3 for all three.

---

## 8. Generation results

**Level-4 gate signal — valid-UTF-8 ratio (temp 0.8) by language:**

| | A | B | C |
|---|---|---|---|
| zh | 0.50 | 0.50 | **0.00** |
| en | 0.50 | 0.50 | **0.00** |
| mixed | 0.00 | 0.00 | 0.00 |

**Greedy (temp 0) invalid-UTF-8 rate by language:**

| | A | B | C |
|---|---|---|---|
| overall | 0.40 | 0.20 | 0.40 |
| zh | 0.50 | 0.50 | 0.50 |
| en | 0.00 | 0.00 | 0.00 |
| mixed | 1.00 | 0.00 | 1.00 |

**Rollout next-token accuracy** (argmax, 60 corpus docs, 24 steps): A@24 = 0.0847, B@24 = 0.1186, C@24 = 0.0847. All three collapse from ~0.35 at step 1 to ~0.08–0.12 by step 24.

**Invalid-UTF-8 degradation curve** (zh + mixed prompts, greedy, by step): for every cell the invalid rate oscillates between 0.33 and 1.00 across all 24 steps — corruption is present from the very first generated token and never clears. The widest model C shows no better sustained validity than A.

**Interpretation:** capacity did NOT move the Level-4 gate. The largest cell C was actually *worse* — its temp-0.8 valid-UTF-8 collapsed to `{zh:0, en:0, mixed:0}` where A/B held `{zh:0.5, en:0.5, mixed:0}`. Greedy invalid rate is noisy across the sweep (0.40 → 0.20 → 0.40) and rollout accuracy barely moves. The zh/mixed byte-triplet collapse persists at every width.

---

## 9. Reproducibility

Every fresh cell (B, C) ran 2× fresh seeded 2-epoch runs with `Random.setSeed(42)` reset **before each run** — the corrected Phase 90 harness, not the bug where run #2 inherited model-init state. A reuses Phase 90's verified bit-identical evidence.

| | A | B | C |
|---|---|---|---|
| identical | ✅ | ✅ | ✅ (2026-08-29 retrain) |
| steps | 300 (Phase 90) | 300 | 300 |

---

## 10. Outcome classification

**OUTCOME B — capacity is NOT sufficient to explain the Level-4 failure.**

The key question was NOT "which model has the lowest loss?" but "does increasing capacity improve stable autoregressive generation under the unchanged Level 4 evaluator?" The measured answer is **no**:

- **Training-distribution fit does not improve with width** — top-1 0.9645 → 0.9638 → 0.9607; final loss 0.1226 → 0.1210 → 0.1246. The 600-doc corpus does not reward 4× capacity; the biggest model fits slightly *worse*.
- **The Level-4 gate did not move** — A/B `{zh:0.5, en:0.5, mixed:0}`, C `{zh:0, en:0, mixed:0}`. The widest cell is the only one that fails *entirely*.
- **Rollout next-token accuracy is flat-to-noisy** — 0.0847 → 0.1186 → 0.0847 @24.
- **Memorization pinned at 0.9580**; Level 3 is the ceiling at every width.

~4× capacity (1.13M → 4.35M params) moved generation validity by exactly zero (negative, in C's case). This falsifies the §3 hypothesis: **width is not the primary lever.**

---

## 11. Is model capacity supported as the bottleneck?

**No.** With a fixed 600-doc corpus, increasing dModel 128 → 192 → 256 (1.13M → 2.48M → 4.35M params) left memorization unchanged (0.9580), the Level-4 gate unchanged-or-worse (`{0.5,0.5,0}` → `{0,0,0}`), and rollout accuracy essentially unchanged.

The bottleneck is **not the parameter count**. The failure is at **rollout time**: the model's 1-step next-token distribution is sharp (top-1 ≈ 0.96) yet autoregressive rollout compounds small errors, and multi-byte CJK byte-triplet sequences are the first to fall off the valid manifold. That signature — strong teacher-forced fit + collapse under the model's own generated context — is **exposure bias**, not capacity.

---

## 12. What remains unresolved

- **Rollout-time byte-triplet integrity under exposure bias.** Why a 0.96 top-1 model cannot hold a 3-byte CJK sequence across 24 steps is still not directly tested. Every cell so far is trained teacher-forced (TRUE context at every position) and evaluated autoregressively (OWN context). The model has never seen its own drift during training, so it has no learned recovery behavior.
- Whether **training on own-context windows supervised against the true continuation** (rollout-data augmentation / scheduled-sampling-style objective mixing) teaches recovery from drift — untested.
- Short-prompt evaluation mismatch: eval prompts are 2–5 tokens; the model rarely sees such short prefixes at rollout — a possible residual confound on the gate.

---

## 13. Recommendation for Phase 94

**Rollout-data augmentation (exposure-bias mitigation)** — approved design `docs/superpowers/specs/2026-08-28-phase94-rollout-objective-design.md`:

- Single variable: own-context augmentation horizon k. A = k 0 (baseline, reuse Phase 90 artifact), B = k 8, C = k 24 (full eval horizon).
- Production architecture (dModel 128, **1,126,528 params** — capacity fixed at the level Phase 93 just ruled out as the lever), unchanged gates / evaluator / dataset / recipe.
- Every 4th optimizer step (R = 4), augment a batch with windows whose suffix is the model's OWN argmax rollout (`noGrad`), with every position supervised against the TRUE next token.
- NEW mechanism metric: next-token accuracy on OWN-context windows vs TRUE windows — distinguishes "objective works mechanically" from "Level 4 still needs more".

This directly targets the measured failure signature (exposure bias) instead of adding capacity the 600-doc corpus cannot use.

---

## Test suite & validation

`src/lib/minimind/research/tests/phase93-capacity-sweep.test.ts` (registered in `run.ts` as `runPhase93Tests`). Static contracts (configs valid, exact param counts, production SSOT intact, identifiers unchanged, evaluator unchanged, no threshold changes) + artifact contracts (training real, checkpoint integrity, reproducibility with per-run seed reset, gates recorded in valid ranges, recipe pinned, fake-data audit).

Validation runs — recorded 2026-09-14, against the final artifacts (`candidate-{A,B,C}.json` + `probe-results.json` all present):

| Suite | Command | Result |
|---|---|---|
| Research | `npx --yes tsx src/lib/minimind/research/__tests__/run.ts` | **890 passed, 0 failed** — includes Phase 93 static 6/6 and artifact 6/6 |
| Core | `npx --yes tsx src/lib/minimind/core/__tests__/run.ts` | **3,216,606 passed, 0 failed** |
| Data | `npx --yes tsx src/lib/minimind/data/__tests__/run.ts` | **249 passed, 0 failed** |
| Training | `npx --yes tsx src/lib/minimind/training/__tests__/run.ts` | **4,265,519 passed, 0 failed** |
| Adapter | `npx --yes tsx src/lib/minimind/__tests__/phase56-experiment-workspace.test.ts` | **138 passed, 0 failed** |
| Runtime boundary | `npx --yes tsx src/lib/minimind/__tests__/runtime-boundary.test.ts` | **65 passed, 0 failed** |
| Build | `npm run build` | **exit 0, no errors and no warnings** |

Outstanding from this phase, closed later: `probe-results.json` still carries `hypothesisVerdict: null` (Phase 94 filled its own fields; Phase 93's were not backfilled), and the artifact contracts had not been run against the final artifacts until the 2026-09-14 run above.

> **Note added 2026-09-14:** this phase's §12 pointed at exposure bias as the remaining bottleneck. Phase 94 intervened on it directly and did not confirm it — see `PHASE94-ROLLOUT-OBJECTIVE-REPORT.md` §11. Nothing in *this* report's numbers changes; the pointer forward was the part that did not survive.
