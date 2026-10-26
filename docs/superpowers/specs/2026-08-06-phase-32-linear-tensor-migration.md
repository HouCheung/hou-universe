# Phase 32: Tensor Module Migration — Linear Foundation

**Date:** 2026-08-06
**Status:** ✅ Complete

---

## Objective

Establish the first complete trainable module stack — bridging the Phase 30 Tensor/Parameter/Module/autograd infrastructure with a real model component (LM Head), validating the entire chain: Module → Parameter → Tensor → Autograd → Gradient.

---

## New Files

| File | Purpose |
|------|---------|
| `src/lib/minimind/core/Linear.ts` | Trainable linear layer extending Module |
| `src/lib/minimind/model/TensorLMHead.ts` | Tensor-backed LM Head using Linear |
| `src/lib/minimind/core/__tests__/linear.test.ts` | 18 tests: unit, gradient, finite difference |

## Modified Files

| File | Change |
|------|--------|
| `src/lib/minimind/core/ops/add.ts` | Added bias broadcast: `[M, K] + [K]` with autograd |
| `src/lib/minimind/core/index.ts` | Export `Linear` |
| `src/lib/minimind/model/index.ts` | Export `TensorLMHead` |
| `src/lib/minimind/index.ts` | Export `TensorLMHead` |
| `src/lib/minimind/core/__tests__/run.ts` | Register `runLinearTests` |

---

## Architecture

```
TensorLMHead (extends Module)
└── Linear (extends Module)          ← NEW Phase 32
    ├── weight: Parameter            ← Tensor + name + requiresGrad
    │   └── Tensor                   ← Float64Array + shape + grad + _ctx
    └── bias?: Parameter
```

### Linear (`src/lib/minimind/core/Linear.ts`)

```
forward(x: [batch, inFeatures]) → [batch, outFeatures]
  y = matmul(x, weight)          // weight: [inFeatures, outFeatures]
  y = add(y, bias)               // bias: [outFeatures], broadcast across batch
```

- **Weight init:** Scaled Xavier — `randn * sqrt(2 / (fan_in + fan_out))`
- **Bias init:** Zeros
- **Module API:** `parameters()`, `namedParameters()`, `zeroGrad()`, `registerModule()`

### TensorLMHead (`src/lib/minimind/model/TensorLMHead.ts`)

```
forward(hidden: [batch, hiddenDim]) → [batch, vocabSize]
  = Linear(hiddenDim, vocabSize, bias=false).forward(hidden)
```

- Pure linear projection, no bias (matching MiniLMHead design)
- Parameter: `linear.weight` of shape `[hiddenDim, vocabSize]`

### Bias Broadcast (`src/lib/minimind/core/ops/add.ts`)

New case: `[M, K] + [K]` — broadcasts 1D bias to every row of 2D matrix.

**Backward:**
- `grad_matrix[i][j] = gradOutput[i][j]` (pass-through)
- `grad_bias[j] = Σ_i gradOutput[i][j]` (sum over batch dim)

---

## Parameter Count

| Model | Parameters | Shape | Elements |
|-------|-----------|-------|----------|
| Linear(512, 1000) | weight + bias | [512,1000] + [1000] | 513,000 |
| TensorLMHead(1000, 512) | linear.weight | [512, 1000] | 512,000 |
| MiniLMHead(1000, 512) | weights | [1000, 512] | 512,000 |

Note: TensorLMHead stores weight as `[hiddenDim, vocabSize]` (transposed vs MiniLMHead's `[vocabSize, dModel]`) because Tensor matmul convention is `input @ weight = [batch, in] @ [in, out]`.

---

## Gradient Validation

All 214 tests pass (59 Tensor + 17 Gradient + 78 Parameter + 60 Linear/TensorLMHead).

### Analytic Gradient

Forward → `sum(logits)` → `backward()` → `weight.grad` is non-null, correct shape.

### Finite Difference

All operator-level gradient checks pass with `maxDiff < 3e-11`:

| Test | maxDiff |
|------|---------|
| `matmul: sum(x @ W)` | 6.1e-12 |
| `matmul + bias: sum(x @ W + b)` | 6.6e-12 |
| `Linear-equivalent: sum(matmul(x, W) + b)` | 2.1e-12 |
| `TensorLMHead-equivalent: sum(matmul(hidden, W))` | 2.6e-12 |

### Why module-level finite diff wasn't used

The `gradientCheck` utility requires `params` to be directly in the computation graph. Creating a new `Linear` inside the closure puts grads on the module's internal parameters, not on the external `params` array. The raw-op tests validate the math; the module-level backward tests validate the wiring.

---

## Relationship with Old Model

| Component | Old (number[][]) | New (Tensor) |
|-----------|-----------------|--------------|
| MiniLMHead | ✅ Active | — |
| TensorLMHead | — | ✅ New |
| MiniMindModel | Uses MiniLMHead | Unchanged |
| Playground/Inference | Uses MiniLMHead | Unaffected |

**Zero impact on existing functionality.** Old `MiniLMHead` is untouched. `MiniMindModel` still uses `MiniLMHead`. The two implementations coexist — consumers opt in to `TensorLMHead` when they need autograd/training.

---

## Next Phase Recommendations

### Phase 33: Tensor Embedding

**Why:** After LM Head, the next simplest module is Embedding — a lookup table `[vocabSize, dModel]` that converts token IDs to vectors.

**Scope:**
- `TensorEmbedding` extending Module
- `forward(tokenIds: number[])` → `Tensor([seqLen, dModel])`
- Indexing operation with autograd (grad accumulates at looked-up positions)

### Phase 34: Tensor Transformer Block

**Why:** Once Embedding + LM Head are migrated, the full forward pipeline (Embedding → Blocks → LM Head) can be assembled and trained end-to-end.

**Prerequisites:** Attention, FFN, RMSNorm — each a separate sub-phase.

### Phase 33–36 Suggested Sequence:
- 33: TensorEmbedding
- 34: TensorRMSNorm
- 35: TensorAttention (multi-head, with RoPE)
- 36: TensorFFN (SwiGLU)
- 37: Full TensorMiniMindModel (end-to-end training)

**Constraint:** Continue parallel migration — never delete old implementations until the Tensor stack is complete and validated.
