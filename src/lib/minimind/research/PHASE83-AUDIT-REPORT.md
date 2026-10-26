# Phase 83 — MiniMind Production Model Configuration & Scaling Audit

**Date:** 2026-08-18
**Scope:** Full audit of the MiniMind model configuration, selection of ONE
technically-coherent browser/Web-Worker-feasible production configuration,
consolidation to a single source of truth, validation tests, and minimal UI
correction. **No new model / Trainer / Runtime / Worker / tokenizer was created.**
**No fluent-bilingual claim (that is Phase 84).** **No fabricated benchmark or
memory measurements.**

---

## 1. Architecture

`TensorMiniMindModel` is a from-scratch, GPT-2-style **Pre-Norm decoder-only
transformer** built on a custom **Float64 autograd engine** (`Tensor` +
`Parameter` + `Module`). It is the production path.

- **Backend:** `Float64Array` storage throughout (8 bytes/element). No `Float32`.
- **Blocks:** `RMSNorm → Attention (Q/K/V/O, no bias) → residual → RMSNorm → SwiGLU FFN (gate/up/down, no bias) → residual`.
- **Norm:** `TensorRMSNorm` (no LayerNorm). **Zero bias vectors anywhere in the model.**
- **Head:** `TensorLMHead` is a **separate `Linear(D, V)` — UNTIED** from the token embedding (the code comment "tied with embedding" is stale; the math counts it separately and correctly).
- **No RoPE / learned positional embedding in the Tensor forward** — position is implicit in the causal attention mask.
- **Parameter tree** (`model.namedParameters()`):

| Param | Shape | Count |
|---|---|---|
| `embedding.weight` | `[V, D]` | 1 |
| `blocks.{i}.norm1.gamma` | `[D]` | L |
| `blocks.{i}.attention.{q,k,v,o}_proj.weight` | `[D, D]` | 4L |
| `blocks.{i}.norm2.gamma` | `[D]` | L |
| `blocks.{i}.ffn.{gate,up}.weight` | `[dFF, D]` | 2L |
| `blocks.{i}.ffn.down.weight` | `[D, dFF]` | L |
| `finalNorm.gamma` | `[D]` | 1 |
| `lmHead.linear.weight` | `[D, V]` | 1 |

**Total parameter objects = `9L + 3`** (39 for L=4). A biased architecture would
add one bias vector per linear layer and exceed this count.

---

## 2. Configuration — single source of truth

The ONE production configuration lives in
[`ModelRegistry.getProductionModelConfig()`](../../../lib/minimind/experiments/ModelRegistry.ts):

| Field | Value |
|---|---|
| name | `"production"` |
| vocabSize | **300** (`PRODUCTION_VOCAB_TARGET` — the tokenizer **target**; actual vocab is tokenizer-derived) |
| dModel | 128 |
| numHeads | 4 |
| dFF | 512 |
| numLayers | 4 |
| maxSeqLen | 256 |
| eps | 1e-6 |

**Production construction path (verified by reading code, not UI labels):**

- **Training:** `TrainingRuntime.spawnWorker()` → `getProductionModelConfig()` → `TrainingWorker` → `tokenizer.train(corpus, 300)` → `new TensorMiniMindModel({ vocabSize: tokenizer.vocabSize, dModel: 128, numHeads: 4, dFF: 512, numLayers: 4, maxSeqLen: 256 })`.
- **Generation:** `GenerationRuntime` → `getProductionModelConfig()` → `GenerationWorker` → restores `tokenizer.fromState(metadata.tokenizerState)` (or re-trains toward `modelConfig.vocabSize`) → reconstructs model from `metadata.modelConfig ?? modelConfig` with `vocabSize: tokenizer.vocabSize` → `loadCheckpoint`.

**No production path hardcodes a config constant** — every production surface
(`TrainingRuntime`, `GenerationRuntime`, `TrainingWorker`, `GenerationWorker`,
`chatAdapter`, `generationAdapter`, `WelcomeEmptyState`, `tokenCounter`) reads the
production config from `getProductionModelConfig()`.

### Config source map (objective 1)

| # | Source | vocab | dModel | heads | layers | dFF | maxSeqLen | Classification | Used by production? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `ModelRegistry` `production` | 300 (target) | 128 | 4 | 4 | 512 | 256 | **production** | ✅ the only one |
| 2 | `ModelRegistry` `tiny` | 32000 | 128 | 4 | 4 | 512 | 256 | reference | ❌ |
| 3 | `ModelRegistry` `small` | 32000 | 256 | 8 | 6 | 1024 | 512 | reference | ❌ |
| 4 | `ModelRegistry` `base` | 32000 | 512 | 8 | 8 | 2048 | 512 | reference | ❌ |
| 5 | `TensorMiniMindModel.tiny()` | 6400 (default) | 128 | 4 | 2 | 512 | 64 | legacy preset | ❌ |
| 6 | `TensorMiniMindModel.miniMind()` | 6400 (default) | 512 | 8 | 8 | 2048 | 256 | legacy preset | ❌ |
| 7 | `src/data/minimind/model-registry.ts` | 1000 / 6400 | 512 | — | — | — | — | legacy `number[][]` | ❌ |
| 8 | `TrainingPageClient.tsx` | 260 | 64 | 2 | 1 | 128 | 64 | legacy UI | ❌ |
| 9 | `InferencePageClient.tsx` | 1000 | 512 | 8 | — | 2048 | — | legacy UI | ❌ |
| 10 | `SamplingTemperatureResult.tsx` | 1000 | 512 | 8 | — | 2048 | — | legacy UI | ❌ |
| 11 | `TrainingRuntime.buildConfigFromSession()` fallback | 260 | 64 | 2 | 1 | 128 | 64 | legacy (dead — always overridden by `getProductionModelConfig()`) | ❌ |
| 12 | `ResearchWorkspace.buildDefaultSessionConfig()` | 32000 (tiny) | 128 | 4 | 4 | 512 | 256 | legacy UI default | ❌ |
| 13 | `MiniMindEngineMap.tsx` (was `getModelConfig("tiny")`) | ~~32000~~ → 300 | 128 | 4 | 4 | 512 | 256 | **UI bug → fixed** | now ✅ |

Entries 2–12 are **classified, not deleted** (per the Phase 83 constraint).

---

## 3. Parameter count (objective 3) — exact, not an estimate

Because the model has **zero bias** and an **untied** LM head, the formula is
**exact** and equals `model.totalParamCount` (verified in tests):

```
params(V, D, dFF, L) = 2·V·D  +  L·(4·D² + 3·D·dFF + 2·D)  +  D
                       embedding   per-layer QKV/O + gate/up/down  finalNorm
                       + lmHead     + 2 RMSNorm gammas
```

Production breakdown (V=300, D=128, dFF=512, L=4):

| Component | Formula | Value |
|---|---|---|
| Embedding | V·D | 38,400 |
| Per layer | 4·D² + 3·D·dFF + 2·D | 262,400 |
| 4 layers | 4 × 262,400 | 1,049,600 |
| Final RMSNorm | D | 128 |
| LM head (untied) | D·V | 38,400 |
| **Total** | | **1,126,528 (~1.13M)** |

At the tokenizer's actual vocab (V ∈ [260, 300]) the total ranges from
**1,116,288 (V=260)** to **1,126,528 (V=300)**.

---

## 4. Tokenizer / model compatibility (objective 4)

- `BPETokenizer` is **byte-level BPE**: base vocab = 256 bytes + 4 special tokens
  (`<pad> <unk> <bos> <eos>`, ids 0–3) = **260 minimum**.
- `train(corpus, 300)` performs `targetMerges = 300 − 260 = 40` merges, breaking
  early only when no adjacent pair remains. The **actual** vocab is reported by
  `tokenizer.vocabSize` and is the single source of truth for model construction
  and checkpoint metadata.
- The production model is built with `vocabSize: tokenizer.vocabSize`, so the
  embedding `[V, D]` and LM head `[D, V]` **always match the tokenizer**.
- `tokenizer.toState() / fromState()` is lossless (round-trip verified in tests) and
  is stored in `checkpoint.metadata.tokenizerState` for exact reload.
- **Can vocab go to 4096 / 8192 / 16000 / 32000?** The code permits any target
  ≥ 260. But the production corpus (84 bilingual samples) cannot produce that many
  distinct merges — BPE would stop early well below 32000. **Larger vocab is
  corpus-limited, not code-limited.** The reference `tiny/small/base` entries keep
  `vocabSize: 32000` only as a legacy label; they are not browser-trainable at that
  vocab from the available corpus.

---

## 5. Browser / Web Worker feasibility & memory (objective 5)

All numbers below are **theoretical calculations** (Float64 = 8 bytes) —
**no in-browser memory measurement was performed in this environment.**

Per-parameter cost (P = scalar param count):

| State | Bytes | Production (~1.13M) |
|---|---|---|
| Weights (`Parameter.data`) | P × 8 | ~9.0 MB |
| Gradients (`Parameter.grad`, eager) | P × 8 | ~9.0 MB |
| AdamW `m` (eagerly allocated in ctor) | P × 8 | ~9.0 MB |
| AdamW `v` (eagerly allocated in ctor) | P × 8 | ~9.0 MB |
| **Total persistent training state** | **32P** | **~36 MB** |
| Checkpoint JSON (`modelParams` + `m` + `v` = 3P Float64, ~18 chars each) | ~54P | **~60 MB** |

- **In-memory training state (~36 MB)** fits comfortably in a Web Worker heap
  (activations for `[B=4, S=16, D=128, L=4]` are negligible).
- **Checkpoint JSON (~50–70 MB) exceeds the ~5 MB `localStorage` quota by ~10–14×.**
  This is the real constraint: persisting a *full* checkpoint (weights + AdamW
  moments) to `localStorage` will likely throw `QuotaExceededError`. This was
  **not measured in-browser here** — it is a calculated upper bound. It is a
  genuine remaining risk (see §11).

---

## 6. Training throughput audit (objective 6)

The production training recipe is:

| Parameter | Value |
|---|---|
| epochs | 5 |
| batchSize | 4 |
| blockSize | 16 |
| tokens/batch | 64 |
| learningRate | 0.001 |
| weightDecay | 0.01 |
| gradientClipNorm | 1.0 |
| warmupSteps | 0 |
| logInterval | 5 |
| optimizer | AdamW (β₁=0.9, β₂=0.999, ε=1e-8) |
| scheduler | Cosine (base→min 1% of lr) |

Each optimizer step = forward + backward over `[4, 16]` + clip + AdamW step.
`tokensPerSecond` is reported by the worker from **real elapsed wall-clock time**
(no `Math.random` / simulation).

**A dedicated production-config throughput benchmark was NOT run in this
environment.** The audit covers the throughput-determining parameters above; the
real-training path (Trainer/AdamW/checkpoint) is exercised by the Phase 65/66/82
tests (all passing) on smaller fixtures, but no production-scale tokens/sec figure
is claimed here.

---

## 7. Candidate model matrix + recommendation (objectives 7–8)

Formula: `params = 2VD + L(4D² + 3D·dFF + 2D) + D`, keeping `dFF = 4D` and the
**trainable** vocab budget V=300 (a larger vocab is corpus-limited — §4).
Memory = 32P (training state) and ~54P (checkpoint JSON). **Illustrative**, not
registry entries.

| Candidate | ~params | dModel | layers | weights | training state | checkpoint JSON | Verdict |
|---|---|---|---|---|---|---|---|
| **A — production** | **1.13M** | 128 | 4 | 9 MB | 36 MB | ~60 MB | ✅ **recommended** — only browser-practical |
| B | ~4.4M | 256 | 4 | 35 MB | 141 MB | ~237 MB | ⚠️ checkpoint far exceeds localStorage |
| C | ~10M | 320 | 6 | 80 MB | 320 MB | ~540 MB | ❌ heavy heap + checkpoint |
| D | ~20M | 448 | 8 | 208 MB | 830 MB | ~1.4 GB | ❌ infeasible in-browser |
| E | ~50M | 640 | 10 | 528 MB | 2.1 GB | ~3.5 GB | ❌ infeasible in-browser |

**Recommendation: keep the current production config (candidate A, ~1.13M).**
"Larger model ≠ better model." Scaling dModel/layers past ~5M params buys nothing
that is trainable in-browser and strictly worsens the checkpoint-persistence
constraint. The current config is the largest **practical** config; its only
outstanding issue is checkpoint storage, not model size.

---

## 8. Checkpoint compatibility (objective 11)

`Checkpoint` (v3) is self-describing via `CheckpointMetadata`:

```
metadata.modelConfig.vocabSize === metadata.vocabSize === tokenizer.vocabSize
metadata.parameterCount === model.totalParamCount
metadata.tokenizerState === tokenizer.toState()
```

Verified in tests: save → JSON → load into an identical architecture restores
parameters **bit-identically**; loading into a layer-mismatched or vocab-mismatched
model is **rejected** (throws on missing param / shape mismatch).

---

## 9. Tests (objectives 10–12, 14)

New file [`__tests__/phase83-config.test.ts`](./__tests__/phase83-config.test.ts),
using the **existing** `assert`/`test` harness (no Bun, no new runner), wired into
the research `run.ts`.

| Group | Coverage | Result |
|---|---|---|
| 1 | Single source of truth + copy safety | ✅ |
| 2 | Parameter-count exactness (1,126,528; no bias) | ✅ |
| 3 | Config invariants (heads | dModel, dFF, vocab ≥ 260, invalid-config rejection) | ✅ |
| 4 | Tokenizer/model compatibility (vocab ∈ [260,300], forward `[B,S,V]`) | ✅ |
| 5 | Checkpoint compatibility (round-trip + incompatible rejection) | ✅ |
| 6 | Legacy classification (tiny/small/base are reference, not deleted) | ✅ |

```
Phase 83: 21 passed, 0 failed
TOTAL (research suite 57–83): 779 passed, 0 failed
```

## 10. Build

`npm run build` completed cleanly — **no errors, no warnings**.

---

## 11. Files changed / not changed

**Changed (all within `HOU Universe` root):**
- `src/components/ai-lab/architecture/MiniMindEngineMap.tsx` — derive model chips
  from `getProductionModelConfig()` (was the `tiny` reference: "32K vocab / ~9.2M").
- `src/lib/ai-lab/adapters/studioAdapter.ts` — `getModelOverview()` default now
  `getProductionModelConfig()` (was insertion-order `models[length-1]` with a
  misleading "largest/most capable" comment).
- `src/lib/minimind/research/__tests__/phase83-config.test.ts` — new (21 tests).
- `src/lib/minimind/research/__tests__/run.ts` — register the Phase 83 suite.

**Not changed (classified only):**
- `ModelRegistry` `tiny` / `small` / `base` (reference), `TensorMiniMindModel.tiny()`
  / `.miniMind()` (legacy presets), `src/data/minimind/*-registry.ts` (legacy
  `number[][]`), `TrainingPageClient.tsx`, `InferencePageClient.tsx`,
  `SamplingTemperatureResult.tsx`, `TrainingRuntime.buildConfigFromSession()`
  fallback, `ResearchWorkspace.buildDefaultSessionConfig()`. **Nothing was deleted.**
- No change to `TensorMiniMindModel` math (proven compatible, not modified).
- No new model / Trainer / Runtime / Worker / tokenizer.

---

## 12. Remaining capability gap (objective 16)

- **Fluent bilingual generation is NOT claimed** — that is Phase 84 (instruction
  tuning / continued pretraining). The current model is a foundation checkpoint
  trained on the 84-sample bilingual corpus.
- **Checkpoint persistence to `localStorage`** (~50–70 MB full checkpoint vs ~5 MB
  quota) is a real, unmeasured-in-browser risk; a future phase should move
  checkpoints to IndexedDB, or checkpoint weights-only, or quantize serialization.
- No instruction tuning; no fake pretrained checkpoint; no synthetic benchmark
  numbers anywhere in this phase.
