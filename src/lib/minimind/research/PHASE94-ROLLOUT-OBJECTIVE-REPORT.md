# Phase 94 — Rollout-Data Augmentation (Exposure-Bias Mitigation)

**Status:** ✅ **COMPLETE — OUTCOME D: augmentation hurts.** All three cells measured; `experiments/phase94/probe-results.json` and `candidate-{A,B,C}.json` are written and complete. The full A/B/C table is filled below from the measured numbers.

> **Run history (five launches, four failures).** The original 2026-08-29 launch died during B. A relaunch on 2026-09-12 23:19 was killed by **system sleep** 21 minutes into B (Kernel-Power event 42, sleep reason "Application API"). The 2026-09-13 17:00 relaunch completed A and B, trained C to completion, and was **killed by system sleep again at 23:42:39 during C's evaluation** (same signature, exit `0x40010004` / DBG_TERMINATE_PROCESS) — C's weights survived but its metrics were never written. C was **retrained from scratch** on 2026-09-14 15:23 and ran to completion (`PHASE94_EXIT=0`, 19:52:27). None of the four failures was a code defect.

> **Main result — OUTCOME D.** The augmentation mechanism works exactly as designed: the model demonstrably learns to recover within its own outputs (own-window top-1 **0.9771** at k=8, **0.9153** at k=24, against a 24-step rollout accuracy of 0.068–0.085). But that learning **does not transfer**, and the intervention **degrades the training-distribution fit monotonically with dose k** — aligned top-1 0.9645 → 0.9593 → 0.9550 and aligned NLL 0.1187 → 0.1576 → 0.2103 across k = 0/8/24. Level 4 is reached by no cell.

> **Provenance of the retrained C.** C's 2026-09-14 run is a fresh training, **not** a resumption, and it is **not bit-identical** to the killed 2026-09-13 C. It starts from the *same init B used on 2026-09-13*: a cell built immediately after `buildTokenizer` sits at the same global-RNG stream position, which `buildModel` does not reseed. Verified directly — the first optimizer step's loss reproduces **5.977156484441439** exactly, matching both B's and C's recorded `initialLoss`. See §12 for the infrastructure fix this implies.

> **Correction applied to the NLL row — see the note under §7.** `experiments/phase94/probe.ts` carried a regression that made every recorded `alignedNll` invalid; it has been fixed, and the NLL values below are recomputed from the saved checkpoints. No cell was retrained for this, and no gate, Level or rollout metric was affected. The stored values in `candidate-*.json` and `probe-results.json` were corrected on 2026-09-14 and carry an `alignedNllProvenance` block recording the pre-fix value.
**Date:** 2026-08-29 (design) — **completed** 2026-09-14
**Scope:** MiniMind research module, real A/B/C experiment on the production bilingual corpus. Single variable: the training objective (own-context rollout-data augmentation horizon `k`).

---

## 1. Research question

**Does training the model on its OWN output contexts — supervised against the TRUE continuation — let the production-width model sustain valid UTF-8 byte-triplet sequences across a 24-step autoregressive rollout?**

Level 3 (memorization top-1 ≥ 0.5) is achieved at **0.9580**; Level 4 (valid UTF-8 in every language at temp 0.8) is **NOT achieved** — by any cell, including either augmented cell. Phases 91–93 ruled out (in order): a generation-pipeline bug (Phase 91), tokenizer merge budget (Phase 92 — tripling the single-token rate moved generation by exactly zero), and model capacity (Phase 93 — ~4× params left the gate signal unchanged-or-worse). The remaining suspect was **exposure bias**: the model is trained teacher-forced (each position always sees the TRUE previous tokens) but evaluated autoregressively (each position sees its OWN previously generated tokens). Errors compound over the 24-step rollout, and multi-byte CJK byte-triplets are the first to collapse.

**The answer is no — and the intervention's own cost dominates.** See §10.

---

## 2. Prior evidence (Phases 84–93)

- **Phase 84** — real bilingual capability evaluator; gates 0–5. Level 3 = memorization top-1 ≥ 0.5; Level 4 = valid UTF-8 in every language, non-empty, non-collapsed, merged tokens used.
- **Phase 86** — production corpus bilingual v0.3.0, 600 samples (zh/en/mixed 200 each).
- **Phase 87** — recipe sweep: blockSize 64, batch 4, seed 42, AdamW(1e-3, 1e-2), cosine, grad-clip 1.0.
- **Phase 88/89** — corrected the objective to a proper 1-step causal + masked criterion; training loss ~0.12 but generation stayed invalid for zh/mixed.
- **Phase 90** — document-aligned layout; memorization crossed Level 3 (top-1 0.9580). Corrected the reproducibility harness bug (reset `Random.setSeed(42)` before each run).
- **Phase 91** — generation-path audit: **no software bug**; direct forward+argmax bit-identical to the production `GenerationEvaluator`. Failure is capability, not software.
- **Phase 92** — tokenizer merge budget sweep (vocab 300 → 340 → 380): tokenization and loss improved monotonically but the Level-4 gate signal was bit-identical across A/B/C. Verdict: **Outcome C** — merge budget is NOT the bottleneck.
- **Phase 93** — model capacity sweep (dModel 128/192/256 at fixed vocab 300): loss flat-to-worse with width, memorization pinned at 0.9580, gate signal bit-identical or worse (`{0.5,0.5,0}` → `{0,0,0}`). Verdict: **Outcome B** — capacity is NOT the Level-4 blocker. The 600-doc corpus cannot absorb 4× capacity.

**Consolidated diagnosis entering Phase 94:** with software, tokenization, and capacity ruled out, the failure appeared to be **rollout-time byte-triplet integrity under distribution shift** — the textbook exposure-bias signature.

---

## 3. Hypothesis

> The production 1,126,528-parameter model can memorize the training distribution (Level 3) but cannot sustain a valid multi-byte CJK byte-triplet sequence over 24 autoregressive steps because it was never trained on contexts containing its own (drift-prone) tokens. Augmenting training with windows whose suffix is the model's own argmax continuation — supervised against the TRUE next tokens — teaches recovery from drift. This should raise the temp-0.8 valid-UTF-8 ratio toward 1 and move the Level-4 gate.

**Outcome: the mechanism clause is CONFIRMED, the prediction clause is REJECTED.** The model does learn to recover from drift in its own contexts; the gate does not move, and the objective costs distributional fit in proportion to its dose.

---

## 4. Experimental design

**Single variable: rollout horizon `k` of own-context augmentation.** Everything else pinned to the Phase 90–93 production recipe.

| Cell | k | Meaning |
|---|---|---|
| A | 0 | Baseline 1-step masked CE — **reuse Phase 90 condition-B artifact** (`experiments/phase90/phase90-aligned.ckpt.json`, bit-identical per the Phase 90 reproducibility contract) |
| B | 8 | Augmented: recover from an 8-token own drift |
| C | **24** | Augmented: recover across the **full 24-token eval horizon** (matches `MAX_TOKENS`) |

**Kept constant across all cells:** vocab 300 tokenizer (same trained BPE state), blockSize 64, batchSize 4, seed 42, dataset bilingual v0.3.0 (600 docs), document-aligned sequence layout (Phase 90), masked corrected 1-step objective (Phase 89), AdamW(lr 1e-3, wd 0.01), cosine (10% warmup → 1% min), grad-clip 1.0, epochs 20, same evaluation code, same 5 generation prompts, same max-token count (24), same sampling modes (greedy + temp 0.8). The capability evaluator, gates, and Level thresholds are USED UNCHANGED.

### 4.1 Augmentation mechanism (as implemented in `experiments/phase94/probe.ts`)

Per augmented batch (frequency **R = 4** optimizer steps → every 4th step uses augmented windows):

1. For each of the B samples, pick a random document and rollout-start `s0` (seeded `Random`, deterministic).
2. Take the true document token prefix `x[0..s0]`.
3. Roll the **current** model's argmax tokens forward `k` steps (`Tensor.noGrad`, the exact loop the Phase 93 probe's `utf8DegradationCurve`/`rolloutAccuracy` already use): `own[1..k] = argmax(forward(prefix + own[1..j-1]))`. The rollout breaks early on the EOS token (id 3).
4. Build a **64-token training window** = true prefix (length `s0+1`) + own tail (length `ownLen ≤ k`) + padding (token 0). `validEnd = min(s0 + ownLen, 63)`; positions after `validEnd` are masked (padding). The CE targets are the **TRUE document tokens aligned to the window** (`tgt[j] = doc[j]` for `j ≤ validEnd+1`).
5. One standard forward + backward supervises **every valid position** against the **TRUE next token** (`crossEntropyLoss` with the document-aligned mask, unchanged; the internal causal shift uses `targets[b][s+1]`). Own-region positions are supervised against `x_true[s+1]` — the model learns "even from my own mistakes, the next real token is X."

The own tokens are detached (integer inputs); gradients flow only through the single forward over the augmented window. No new autograd path, no sampling, no gradient through argmax — stable and deterministic.

Note that this supervises the own-region positions too, which (see §11) is the likely source of the measured harm: early in training those contexts are the model's own garbage, so a quarter of the optimization budget is spent learning garbage-context → true-token mappings.

**s0 range (measured corpus geometry, recorded not silently changed):** NO document encodes to ≥ 64 tokens (max 60, median ~36). Therefore `s0` is drawn from `[8, min(63−k, docLen−2−k)]` — much shorter true prefixes than the spec's 64-token assumption. This makes the augmented distribution CLOSER to the short eval prompts (2–5 tokens) than originally assumed, but it is still a mismatch, and at k=24 the range collapses to `[8, 34]`. Eligible documents (docLen ≥ 8 + 2 + k): k=8 → **594/600**, k=24 → **373/600** (both sufficient, but k=24 discards 38% of the corpus).

### 4.2 Why R=4

The on-policy rollout construction costs `k` noGrad forwards per augmented batch. Amortizing over R=4 steps keeps B ≈ 4h and C ≈ 6h while limiting on-policy staleness to 4 optimizer steps (negligible at lr 1e-3). The optimization budget (3000 steps) is NOT silently changed; the measured runtimes are reported in §6 and the deviation from the estimate is recorded there.

### 4.3 Reproducibility

Phase 90 CORRECTED pattern: every fresh cell runs 2× fresh seeded 2-epoch runs with `Random.setSeed(42)` reset **before each run**. The augmentation's doc + `s0` offsets use the same seeded global RNG, and the argmax rollout is deterministic given model + prefix → identical runs must be bit-identical. A reuses Phase 90's verified evidence. **Result: all three cells identical (§9).**

Note the limit of this contract: it pins the reproducibility *harness*, not the cell's own init — `buildModel` does not reseed, so a cell's starting weights depend on the run's `--only` set. See §12.

---

## 5. Exact parameter counts

Production architecture for every cell: `params(300, 128, 512, 4) = 2·300·128 + 4·(4·128² + 3·512·128 + 2·128) + 128 = 1,126,528`. All three cells use the SAME architecture — only the objective differs. Verified at probe construction against the real model graph (`totalParamCount = 1,126,528`) for every cell, including the retrained C.

---

## 6. Training results

Measured from `experiments/phase94/probe-results.json`. "Final loss" is the last optimizer step's loss (`lossHistory[last]`), "best loss" the lowest recorded step loss.

| | A (k=0, reused) | B (k=8, fresh) | C (k=24, fresh) |
|---|---|---|---|
| trained | no (Phase 90 artifact) | yes (fresh) | yes (fresh) |
| initial loss | 6.0273 | 5.9772 | 5.9772 |
| final loss | 0.1226 | 0.4632 | 0.2838 |
| best loss | 0.1222 | 0.0661 | 0.0785 |
| total steps | 3000 | 3000 | 3000 |
| augmentation steps | — | 750 | 750 |
| duration | 113.6 min (Phase 90) | 144.2 min | **220.4 min** |
| max \|Δparam\| | 0.5536 | 0.4768 | 0.4060 |
| mean \|Δparam\| | 0.0302 | 0.0294 | 0.0295 |

**On duration.** Only B and C are directly comparable: both were trained on the same machine under the same conditions, and C is **1.53× slower per step than B** (4.408 s/step vs 2.884 s/step) — the cost of the on-policy rollout is monotone in `k`, exactly as §4.2 predicted. A's 113.6 min is a Phase 90 (August) measurement taken under different machine load and must **not** be used to estimate per-step cost; the metric rows above are all evaluator-produced from saved artifacts and remain comparable.

---

## 7. Capability results (evaluator unchanged)

| Gate | A | B | C |
|---|---|---|---|
| memorization top-1 | 0.9580 | 0.9618 | 0.9542 |
| Level (highest achieved) | 3 | 3 | 3 |
| Level 4 (valid UTF-8 everywhere) | ❌ | ❌ | ❌ |

Training-distribution 1-step (aligned, mask-aware, TRUE windows):

| | A | B | C | trend in k |
|---|---|---|---|---|
| top-1 | 0.9645 | 0.9593 | 0.9550 | **monotone ↓** |
| top-5 | 0.9926 | 0.9922 | 0.9914 | monotone ↓ |
| top-10 | 0.9970 | 0.9968 | 0.9966 | monotone ↓ |
| NLL | 0.1187 | 0.1576 | 0.2103 | **monotone ↑** |

All four rows move strictly monotonically in `k`, in the direction of worse fit, over 20,703 supervised positions each. This dose–response is the primary evidence for OUTCOME D (§10).

> **NLL provenance.** The NLL row is **not** read from the stored `alignedNll` as originally written. `evalAlignedTopK` in `experiments/phase94/probe.ts` computed its softmax numerator as `exp(target - maxV)`, using the target's **token ID** where the **logit** `row[target]` was intended. That makes `prob > 1`, so the accumulated NLL goes negative (cell A recorded −164.0673, cell B −165.0079). The bug is a regression in the Phase 94 port — `experiments/phase93/probe.ts` has the correct `exp(row[target] - maxV)` — and it affected **only** this diagnostic: top-1/5/10, the gates, Level, memorization and rollout accuracy are all computed from ranks or from the training loop, and are untouched.
>
> Fixed 2026-09-13. The values above are recomputed from each cell's saved checkpoint with the corrected formula via `npx --yes tsx experiments/phase94/probe.ts --recompute-nll` — no retraining was needed. As a cross-check, that recompute reproduces cell A's NLL as **0.1187**, matching the value Phase 93 published for the same artifact, and reproduces **every** cell's top-1/5/10 exactly as already recorded.
>
> On 2026-09-14 the stored `alignedNll` values in `candidate-A.json`, `candidate-B.json` and `probe-results.json` were replaced with the corrected full-precision recompute (A `0.11873743531054956`, B `0.15761980878965343`, C `0.2103021276407774`), each carrying an `alignedNllProvenance` block that records the pre-fix value, the date, the command, and the reason. Cell C's pre-fix value is unchanged from its measurement — the retrained C was produced by the fixed code — so nothing was corrected for C, and the block exists only for symmetry. The recompute diagnostic now prints `nll` at full precision rather than `toFixed(4)`, because those numbers are copied into artifacts and rounding on the way out would store a truncated value as if it were the measurement.

---

## 8. Generation results

**Level-4 gate signal — valid-UTF-8 ratio (temp 0.8) by language:**

| | A | B | C |
|---|---|---|---|
| zh | 0.50 | 0.50 | **0.00** |
| en | 0.50 | 1.00 | 1.00 |
| mixed | 0.00 | 0.00 | 0.00 |

The Level-4 criterion is valid UTF-8 in **every** language. `mixed` is 0.00 for **every cell ever measured** in Phases 92, 93 and 94 — including every baseline. No cell is close to the gate.

**Greedy (temp 0) invalid-UTF-8 rate by language:**

| | A | B | C |
|---|---|---|---|
| overall | 0.40 | 0.40 | **0.60** |
| zh | 0.50 | 0.50 | **1.00** |
| en | 0.00 | 0.00 | 0.00 |
| mixed | 1.00 | 1.00 | 1.00 |

**Rollout next-token accuracy** (argmax, 60 corpus docs, 24 steps, 0 docs skipped): A@24 = 0.0847, B@24 = 0.0678, C@24 = 0.0847. Augmentation does not improve it; at k=8 it lowers it.

**Invalid-UTF-8 degradation curve** (zh + mixed prompts, greedy, by step): recorded per candidate in `probe-results.json`. Both augmented cells are already at 1.00 by step 5, so neither shows a clean late-drift signature. The difference is in what follows: **C reads 1.00 for every step from 14 through 23 without exception, whereas B oscillates between 0.33 and 1.00 across the whole horizon**, never holding a run longer than two steps. C's failure is settled; B's is still in flux.

**NEW mechanism metric — OWN-context recovery accuracy** (eval-time noGrad; top-1 over the own-region positions of augmented windows vs TRUE windows):

| | A | B | C |
|---|---|---|---|
| own-window top-1 | — (k=0) | **0.9771** | **0.9153** |
| own-window positions | — | 480 | 1440 |
| mean own-tail length | — | 8.0 | 24.0 |
| true-window top-1 | 0.9645 | 0.9593 | 0.9550 |

**The mechanism works.** A model that has never seen its own outputs predicts the true next token across an 8-token own drift at 0.9771 — better than it predicts on TRUE windows (0.9593). C extends that to 24 tokens at 0.9153. Both are far above the 0.068–0.085 the model achieves when actually generating. So the objective does what the hypothesis said it would do at the level of "recover from drift"; it simply does not convert into sustained byte-triplet validity.

---

## 9. Reproducibility

Every fresh cell (B, C) ran 2× fresh seeded 2-epoch runs with `Random.setSeed(42)` reset **before each run** — the corrected Phase 90 harness. A reuses Phase 90's verified bit-identical evidence.

| | A | B | C |
|---|---|---|---|
| identical | ✅ | ✅ | ✅ |
| steps | 300 (Phase 90) | 300 | 300 |

C's contract holds on the **retrained** cell, i.e. after the 2026-09-14 restart.

---

## 10. Outcome classification

**OUTCOME D — augmentation hurts.**

- **OUTCOME A** (an augmented cell reaches Level 4): **ruled out.** No cell reaches Level 4; all three sit at Level 3, and `mixed` is 0.00 everywhere.
- **OUTCOME B** (gate signal / rollout validity improves substantially but not Level 4): **ruled out.** "Improves substantially" is false for the primary endpoint. The one improvement — `en` valid-UTF-8 0.50 → 1.00 for both augmented cells — is 1 of 2 en prompts, and rollout validity does not improve at all (B@24 worse than A, C@24 equal).
- **OUTCOME C** ("no movement on the gate"): **literally true of the primary endpoint, but it understates the measurement.** The gate did not move; the model got measurably worse.
- **OUTCOME D**: **selected.** The distinguishing evidence is a **dose–response**, not a null: aligned top-1 falls 0.9645 → 0.9593 → 0.9550 and aligned NLL rises 0.1187 → 0.1576 → 0.2103 strictly monotonically in `k` across 20,703 positions per cell. Supporting harm signals at k=24: greedy invalid-UTF-8 0.40 → 0.60, zh valid-UTF-8 0.50 → 0.00, memorization 0.9580 → 0.9542, max |Δparam| falling from 0.5536 (A) / 0.4768 (B) to 0.4060 (C).

**Caveats on this classification, stated so the verdict is not over-read:**

1. **Gate granularity.** The Level-4 gate evaluates only 2 prompts per language, so "zh 0.50 → 0.00" is a single-sample difference and is *not* what carries the classification. The dose–response in aligned top-1 / NLL is the load-bearing evidence.
2. **Magnitude.** The degradation is small in absolute terms (top-1 down ~1 point). "Hurts" here means a consistent, dose-dependent directional cost — not a collapse.
3. **The spec's D parenthetical is not directly demonstrated.** OUTCOME D is glossed as "model amplifies its own errors / self-drift". Harm is measured; *self-drift amplification* is not — we do not show that C fails *because* it learned bad self-context behaviour. §11 gives the leading candidate mechanism but it is not isolated.
4. **Comparability of A.** A is the reused Phase 90 artifact while B and C are fresh retrains, and C's retrain starts from B's init (see the provenance block at the top of this report). Phase 93 established the training/eval path is deterministic, so the evaluator-produced metric rows are comparable; the duration row is not.

---

## 11. Is exposure bias supported as the bottleneck?

**No — not at the level the hypothesis required.**

For exposure bias to be the Level-4 blocker, teaching the model to recover from its own drift should have moved the gate. It was intervened on directly, in two doses, and the gate did not move at any dose; meanwhile the intervention degraded distributional fit in proportion to dose. That is the opposite of the predicted signature.

Two things must be kept distinct, because conflating them would misreport this phase:

- **The mechanism clause is supported.** Own-window top-1 of 0.9771 (k=8) and 0.9153 (k=24) against a 24-step rollout accuracy of 0.068–0.085 shows the model genuinely learns recovery-from-drift. Exposure bias is real: the model *is* better at predicting the true continuation from its own contexts than it is at generating those contexts in the first place.
- **The bottleneck clause is rejected.** Whatever limits 24-step byte-triplet validity, training for drift recovery does not relieve it. Exposure bias is therefore **not the (only) blocker** — and on this evidence the remaining constraint is upstream of, or orthogonal to, drift recovery.

**Leading mechanism for the measured harm** (candidate, not isolated): each augmented step (25% of the 3000 steps, R=4) replaces a real prefix with a window whose tail is the *current* model's argmax rollout, and then supervises **every** valid position against the true token — including the own-region positions. Early in training that tail is garbage, so a quarter of the optimization budget is spent fitting garbage-context → true-token mappings, and the amount of real long-range context displaced is monotone in `k`. This predicts precisely the observed pattern: harm that grows with `k`, while the recovery metric it was meant to train improves. A second, non-exclusive suspect is that at k=24 the s0 range collapses to `[8, 34]` and only 373/600 documents remain eligible, narrowing and skewing the augmented distribution itself.

---

## 12. What remains unresolved

1. **Why own-context recovery does not transfer.** The model predicts the true next token across a 24-token own drift at 0.9153, yet cannot generate 24 valid tokens from a 2–5 token prompt. This is the central unresolved gap and it is now measured on both sides.
2. **The prompt-regime mismatch.** The spec recorded this as a known risk (§11: "short-prompt eval mismatch") and it is now the prime suspect: augmentation builds windows from true prefixes of `s0 ≥ 8` tokens, while the evaluator prompts with 2–5 tokens. Little of what the augmented windows teach is reachable from a 2–5 token prompt. Untested.
3. **The gate instrument itself.** The Level-4 criterion is evaluated on 2 prompts per language, and `mixed` has been 0.00 for every configuration measured across Phases 92, 93 and 94 — including every baseline. Before another training-side sweep it is worth asking whether the gate can discriminate at all, or whether `mixed` is unsatisfiable at this scale regardless of objective.
4. **Whether Level 4 is reachable at 1.13M parameters at all**, under any objective. Nothing measured so far suggests it is.
5. **Infrastructure wart exposed by the retrain.** `buildModel` does not reseed, so a cell's initial weights depend on the ambient global-RNG state, which depends on the run's `--only` set. Today's C therefore started from B's init. Results remain valid samples — but a cell's init is not reproducible in isolation, and `--only=X` does not reproduce the `--only=X,Y` run of X. Fix: `Random.setSeed(SEED)` inside `buildModel`. Not fixed in this phase, to avoid changing the pipeline mid-experiment.

---

## 13. Recommendation for Phase 95

**Do not scale the horizon further, and do not run another objective sweep on the same axis.** `k` is the dose that made the model worse; the axis is exhausted.

1. **Test the transfer hypothesis directly (primary, cheapest).** Re-run the augmented arm with the augmentation's prompt regime matched to the evaluator's — draw `s0 ∈ [1, 5]` instead of `[8, 63−k]`, at fixed `k=8` (the dose that did the least harm). This is a one-constant change to `AUG_S0_MIN` in the existing probe, and it isolates the one mismatch the spec flagged in advance. If the gate moves, the bottleneck was transfer, not exposure bias; if it does not, the gate itself becomes the leading suspect.
2. **Establish the gate's dynamic range before spending another training sweep (prerequisite).** Demonstrate that *some* configuration reaches Level 4 on the unchanged evaluator — or report that none can. With `mixed` pinned at 0.00 across every arm ever measured, a saturation check is cheaper than another ~4h sweep and would tell us whether the target is currently reachable.
3. **If 1 and 2 clear, redesign the objective so it does not displace real context.** The measured harm mechanism points at supervising the own-region positions and at dedicating whole steps to augmented windows. Mixing augmented windows into the same batch, or supervising only the true-prefix region while leaving own-region positions unsupervised, addresses both without changing the hypothesis being tested.
4. **Fix the init-seeding wart (§12.5)** — `Random.setSeed(SEED)` inside `buildModel` — before the next multi-cell phase, so per-cell results no longer depend on the `--only` set.
5. **Do not treat decoding-side constraints as a Phase 95 candidate.** Constraining the decoder to emit valid UTF-8 would move the reported ratio without testing the capability claim, since Level 4 is defined against the unchanged evaluator. It is a product decision, not an experiment.

---

## Test suite & validation

`src/lib/minimind/research/tests/phase94-rollout-objective.test.ts` (registered in `run.ts` as `runPhase94Tests`). Static contracts (objective-config valid, exact param counts, production SSOT intact, identifiers unchanged, evaluator unchanged, no threshold changes, augmented windows well-formed) + artifact contracts (training real, checkpoint integrity, reproducibility with per-run seed reset, gates + mechanism metric in valid ranges, recipe pinned, fake-data audit).

Validation runs — recorded 2026-09-14, against the final artifacts (`probe-results.json` written 19:52, with `candidate-{A,B,C}.json` complete):

| Suite | Command | Result |
|---|---|---|
| Research | `npx --yes tsx src/lib/minimind/research/__tests__/run.ts` | **890 passed, 0 failed** — Phase 94 static 7/7 and artifact 7/7 |
| Core | `npx --yes tsx src/lib/minimind/core/__tests__/run.ts` | **3,216,606 passed, 0 failed** |
| Data | `npx --yes tsx src/lib/minimind/data/__tests__/run.ts` | **249 passed, 0 failed** |
| Training | `npx --yes tsx src/lib/minimind/training/__tests__/run.ts` | **4,265,519 passed, 0 failed** |
| Adapter | `npx --yes tsx src/lib/minimind/__tests__/phase56-experiment-workspace.test.ts` | **138 passed, 0 failed** (adapter 61, config validation 48, workspace integration 29) |
| Runtime boundary | `npx --yes tsx src/lib/minimind/__tests__/runtime-boundary.test.ts` | **65 passed, 0 failed** |
| Build | `npm run build` | **exit 0, no errors and no warnings** |

Zero failures across every suite.

**Independent check on this report's numbers.** All 62 values in the tables of §6–§9 were re-derived from `probe-results.json` by a separate script after the report was written, and every one matched the artifact. The two cells that flagged on the first pass (B duration 144.2 vs 144.22025 min, C duration 220.4 vs 220.37603 min) were an over-tight absolute tolerance in that script, not a report error — both round correctly at the 1-decimal precision used.
