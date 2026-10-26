# MiniMind Core Engine Audit Report

**Date:** 2026-08-06
**Scope:** `src/lib/minimind/**` (read-only audit)
**Goal:** Assess the gap between "inference + visualization framework" and "truly trainable miniature GPT framework."

---

## Executive Summary

MiniMind currently implements a **complete forward pass** through a GPT-like architecture — tokenizer, embedding, RoPE, multi-head self-attention, SwiGLU FFN, RMSNorm, transformer blocks, and LM head projection. The inference engine (greedy, temperature, top-k, top-p sampling with KV cache) and training showcase are built on top.

However, MiniMind **cannot train**. The gap is not incremental — it is structural. Three foundational capabilities are entirely absent:

1. **Tensor abstraction with autograd** — no computation graph, no gradient storage, no backward propagation
2. **Unified parameter registry** — parameters are scattered across component instances with no unified enumeration mechanism
3. **Backward implementations** — none of the 60+ differentiable operations (matmul, softmax, SiLU, RMSNorm, RoPE rotation, attention) have gradient formulas

The forward pass is architecturally clean. The training shell (Pretrainer, CrossEntropyLoss, Optimizer interface) is well-designed for future integration. The path from "no training" to "real training" requires 6 phases of foundational work (Phase 30–35), estimated at the scale of the entire existing codebase.

---

## 1. Tensor / Math Foundation Layer Audit

### Files Audited

| File | Role |
|------|------|
| `attention/math.ts` | dotProduct, matrixMultiply, transpose, softmax, causalMask, scaledDotProductAttention |
| `ffn/math.ts` | matrixMultiply, linear, sigmoid, silu, applySiLU, multiplyGate, swiGLU |
| `rope/math.ts` | getFrequencies, getAngles, rotateVector, applyRotation, applyQKRotation, l2Norm |
| `rope/RotaryEmbedding.ts` | Frequency caching, rotate/forward APIs |
| `pretrain/loss.ts` | CrossEntropyLoss (logSumExp trick) |

### Current Capability

| Feature | Status | Detail |
|---------|--------|--------|
| Tensor abstraction | ❌ Absent | No `Tensor` class exists. Data is `number[]`, `number[][]`, `Float64Array`. |
| Shape tracking | ❌ Absent | Shapes tracked implicitly by array nesting. No `shape: number[]` metadata. |
| `requiresGrad` flag | ❌ Absent | No mechanism to mark inputs as requiring gradient tracking. |
| `.grad` storage | ❌ Absent | No gradient buffer attached to any data structure. |
| Computation graph | ❌ Absent | Forward operations are eager, stateless pure functions. No DAG recording. |
| `backward()` method | ❌ Absent | No chain-rule traversal exists anywhere in the codebase. |
| Scalar operations (+, -, *, /) | ⚠️ Partial | Only via raw JS operators on primitives — no tracked variants. |
| Matrix multiply | ✅ Forward-only | `matrixMultiply(A, B)` — pure function, no gradient formula. |
| Softmax | ✅ Forward-only | Numerically stable (max-subtract + exp + normalize). No `softmax_backward`. |
| SiLU / sigmoid | ✅ Forward-only | `silu(x) = x * sigmoid(x)`. No derivative `silu'(x)`. |
| logSumExp | ✅ Forward-only | Numerical stability for loss. No gradient path back to logits. |
| RoPE rotation | ✅ Forward-only | `rotateVector` applies 2D rotation per dim-pair. No backward through `cos`/`sin`. |
| CrossEntropyLoss | ✅ Forward-only | Computes loss from logits + targets. `backward()` not implemented. |

### Missing Capability

1. **Tensor class** — The single most critical missing piece. A `Tensor` should encapsulate:
   - `data: Float64Array` (or similar typed storage)
   - `shape: number[]`
   - `requiresGrad: boolean`
   - `grad: Float64Array | null`
   - `_ctx: Function | null` (backward closure for autograd graph)

2. **Autograd engine** — A topological sort over the computation DAG, calling each operation's `backward()` in reverse order.

3. **Gradient formulas for ~15 primitive operations**:
   - `matmul_backward(grad_output, A, B)` → `(grad_A, grad_B)`
   - `add_backward(grad_output)` → `(grad_output, grad_output)`
   - `mul_backward(grad_output, a, b)` → `(grad_output * b, grad_output * a)`
   - `softmax_backward(grad_output, softmax_out)` → `grad_input`
   - `silu_backward(grad_output, x)` → `grad_input`
   - `cross_entropy_backward(grad_output, logits, targets)` → `grad_logits`
   - `rms_norm_backward(grad_output, x, rms, gamma)` → `(grad_x, grad_gamma)`
   - `rope_rotate_backward(grad_output, x, cos, sin)` → `grad_x`

### Implementation Difficulty

**High.** This is the foundational layer upon which everything else depends. A well-designed Tensor + autograd engine is ~500–800 lines of TypeScript, plus ~300–500 lines of gradient formulas. The design must account for:
- Memory efficiency (typed arrays vs. nested arrays)
- Graph construction overhead
- Detach/stop-grad support
- Future batch dimension support

---

## 2. Model Parameter Management Audit

### Files Audited

| Component | Parameter(s) | Storage | Accessor |
|-----------|-------------|---------|----------|
| `MiniEmbedding` | `matrix: Float64Array[]` | `[vocabSize][embeddingDim]` | `getRawMatrix()` |
| `MiniAttention` | `W_Q, W_K, W_V, W_O: number[][]` | `[dModel][dModel]` × 4 | `getWeight("Q"\|"K"\|"V"\|"O")` |
| `MiniFeedForward` | `W_gate, W_up, W_down: number[][]` | `[dModel][dFF]` × 2, `[dFF][dModel]` × 1 | `getWeight("gate"\|"up"\|"down")` |
| `MiniRMSNorm` | `gamma: number[]` | `[dModel]` | `getWeights()` |
| `MiniLMHead` | `weights: number[][]` | `[vocabSize][dModel]` | `getWeights()` |
| `RotaryEmbedding` | _(none)_ | Frequencies are computed, not learned | N/A |
| `MiniTransformerBlock` | _(none)_ | Block owns RMSNorm instances but no direct params | Delegates to norm |

### Current Parameter Storage

Each module stores parameters as **private instance fields** with **heterogeneous types**:
- `Float64Array[]` (Embedding)
- `number[][]` (Attention, FFN, LMHead)
- `number[]` (RMSNorm)

There is **no unified parameter type**. Each module has its own accessor method. This makes it impossible to:
- Enumerate all parameters with `model.parameters()`
- Apply a single optimizer to all parameters
- Serialize/deserialize all parameters for checkpointing
- Zero all gradients at once with `optimizer.zeroGrad()`

### Can We Call `model.parameters()`?

**No.** MiniMindModel has accessor methods for each sub-module (`getEmbedding()`, `getBlocks()`, `getLMHead()`, etc.), but each sub-module has its own parameter access API. There is no unified iteration mechanism.

### Parameter Count Estimate

For a model with `vocabSize=6400, dModel=512, numHeads=8, headDim=64, dFF=2048, numLayers=6`:

| Component | Count | Formula |
|-----------|-------|---------|
| Embedding | 1 | `vocabSize × dModel` |
| Attention (per layer) | 4 | `W_Q, W_K, W_V [dModel×dModel]` + `W_O [dModel×dModel]` |
| FFN (per layer) | 3 | `W_gate [dModel×dFF]`, `W_up [dModel×dFF]`, `W_down [dFF×dModel]` |
| RMSNorm (per layer) | 2 | `gamma_attn [dModel]`, `gamma_ffn [dModel]` |
| LM Head | 1 | `vocabSize × dModel` |

**Total parameters:** `6400×512 (emb) + 6 × [4×512×512 (attn) + 3×512×2048 (ffn) + 2×512 (norm)] + 6400×512 (lm_head)` ≈ **28.3M**

### Proposed ParameterRegistry Design (DO NOT IMPLEMENT YET)

```typescript
// Pseudocode — conceptual design only

interface Parameter {
  name: string;           // e.g. "transformer.0.attention.W_Q"
  data: Float64Array;     // Flattened weight values
  grad: Float64Array;     // Gradient buffer (same length as data)
  shape: number[];        // e.g. [512, 512]
  requiresGrad: boolean;  // Always true for model parameters
}

class ParameterRegistry {
  private params: Map<string, Parameter>;

  register(name: string, data: Float64Array, shape: number[]): void;
  get(name: string): Parameter;
  getAll(): Iterable<Parameter>;
  parameters(): Parameter[];  // The PyTorch-like API
  zeroGrad(): void;           // Set all .grad to zero
  getStateDict(): Record<string, Float64Array>;  // For checkpointing
  loadStateDict(state: Record<string, Float64Array>): void;
}
```

**Naming convention (PyTorch-style):**
```
embedding.weight                → [vocabSize, dModel]
transformer.0.attention.W_Q     → [dModel, dModel]
transformer.0.attention.W_K     → [dModel, dModel]
transformer.0.attention.W_V     → [dModel, dModel]
transformer.0.attention.W_O     → [dModel, dModel]
transformer.0.ffn.W_gate        → [dModel, dFF]
transformer.0.ffn.W_up          → [dModel, dFF]
transformer.0.ffn.W_down        → [dFF, dModel]
transformer.0.norm_attn.gamma   → [dModel]
transformer.0.norm_ffn.gamma    → [dModel]
transformer.1.attention.W_Q     → ...
...
lm_head.weight                  → [vocabSize, dModel]
```

**Integration strategy:**
Each module class emits its parameters into the registry during construction:
```typescript
// In MiniAttention constructor
registry.register("transformer.0.attention.W_Q", flatten(W_Q), [dModel, dModel]);
```

The registry is created externally and passed into each module (or module factory). MiniMindModel never directly holds the registry — it's an orthogonal concern managed by the training harness.

---

## 3. Forward Graph Analysis

### Complete Forward Pipeline Trace

```
Input Text: "hello world"
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Tokenizer                                          │
│   encode("hello world") → [tokenId_1, tokenId_2]            │
│   Forward: ✅ Implemented                                    │
│   Backward: N/A (discrete operation, no gradient path)       │
│   Requires grad: None                                        │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Embedding                                          │
│   W_embed[tokenId] → vector                                  │
│   Forward: ✅ Implemented (table lookup)                     │
│   Backward: ❌ Missing                                       │
│   dLoss/dW_embed[i][j] = dLoss/dEmbedding[i][j] × 1         │
│     (only for positions i that correspond to looked-up IDs)  │
│   dLoss/dInput: N/A (input is discrete token IDs)            │
│   Requires grad: dLoss/dW_embed                              │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: RoPE                                               │
│   For each position p, for each head h:                      │
│     rotate([x_2i, x_2i+1], angle=p × freq_i)                │
│   Forward: ✅ Implemented (2D rotation per dim-pair)         │
│   Backward: ❌ Missing                                       │
│   Rotation is linear transform R(θ):                         │
│     dLoss/dx_2i = dLoss/dx'_2i × cos(θ) + dLoss/dx'_2i+1 × sin(θ)│
│     dLoss/dx_2i+1 = -dLoss/dx'_2i × sin(θ) + dLoss/dx'_2i+1 × cos(θ)│
│   Requires grad: dLoss/dInput (RoPE has NO trainable params) │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Transformer Block (× numLayers)                     │
│                                                              │
│   ┌─ Sub-layer A: Attention ────────────────────────────┐   │
│   │ 4a. RMSNorm(x) → x̂                                     │   │
│   │   Forward: ✅  RMS(x) = sqrt(mean(x²) + ε)            │   │
│   │           y = x / RMS(x) × γ                          │   │
│   │   Backward: ❌                                         │   │
│   │   dLoss/dx = (γ / RMS) × (dŷ - (x·dŷ/RMS²) × x/d)    │   │
│   │   dLoss/dγ = Σ x̂ × dŷ                                 │   │
│   │                                                        │   │
│   │ 4b. Q/K/V Projection: q = x̂ @ W_Q, etc.                │   │
│   │   Forward: ✅  matrixMultiply(x̂, W_Q)                  │   │
│   │   Backward: ❌                                         │   │
│   │   dLoss/dW_Q = x̂^T @ dLoss/dq                         │   │
│   │   dLoss/dx̂ = dLoss/dq @ W_Q^T                         │   │
│   │   (Same pattern for W_K, W_V)                          │   │
│   │                                                        │   │
│   │ 4c. Split Heads: dModel → [numHeads, seqLen, headDim] │   │
│   │   Forward: ✅  splitHeads()                            │   │
│   │   Backward: ❌  Inverse of split = mergeHeads          │   │
│   │   dLoss/dInput = mergeHeads(dLoss/dHeads)              │   │
│   │                                                        │   │
│   │ 4d. Scaled Dot-Product Attention:                      │   │
│   │   scores = Q @ K^T                                     │   │
│   │   Forward: ✅  matrixMultiply(Q, K^T)                  │   │
│   │   Backward: ❌                                         │   │
│   │   dLoss/dQ = dLoss/dScores @ K                         │   │
│   │   dLoss/dK = dLoss/dScores^T @ Q                       │   │
│   │                                                        │   │
│   │   scaled = scores / √dk                                │   │
│   │   Forward: ✅  element-wise division                   │   │
│   │   Backward: ❌  dLoss/dScores = dLoss/dScaled / √dk   │   │
│   │                                                        │   │
│   │   weights = softmax(scaled)                            │   │
│   │   Forward: ✅  numerically stable softmax              │   │
│   │   Backward: ❌  dsoftmax is non-trivial:               │   │
│   │   dLoss/dS_i = w_i × (dŷ_i - Σ_j w_j × dŷ_j)          │   │
│   │                                                        │   │
│   │   output = weights @ V                                 │   │
│   │   Forward: ✅  matrixMultiply(weights, V)              │   │
│   │   Backward: ❌                                         │   │
│   │   dLoss/dWeights = dLoss/dOutput @ V^T                 │   │
│   │   dLoss/dV = weights^T @ dLoss/dOutput                 │   │
│   │                                                        │   │
│   │ 4e. Merge Heads: [numHeads, seqLen, headDim] → dModel │   │
│   │   Forward: ✅  mergeHeads()                            │   │
│   │   Backward: ❌  Inverse of merge = splitHeads          │   │
│   │                                                        │   │
│   │ 4f. Output Projection: o = merged @ W_O                │   │
│   │   Forward: ✅  matrixMultiply(merged, W_O)             │   │
│   │   Backward: ❌  Same matmul pattern                    │   │
│   │                                                        │   │
│   │ 4g. Residual Add: r = x + attn_out                     │   │
│   │   Forward: ✅  element-wise addition                   │   │
│   │   Backward: ❌  dLoss/dx = dLoss/dr, dLoss/dAttn = dLoss/dr│
│   └────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌─ Sub-layer B: FFN ─────────────────────────────────┐   │
│   │ 4h. RMSNorm(r) → r̂                                    │   │
│   │   Forward: ✅  Same RMSNorm as 4a                     │   │
│   │   Backward: ❌  Same pattern                          │   │
│   │                                                        │   │
│   │ 4i. SwiGLU FFN:                                        │   │
│   │   gate = r̂ @ W_gate  →  Forward: ✅, Backward: ❌      │   │
│   │   up   = r̂ @ W_up    →  Forward: ✅, Backward: ❌      │   │
│   │   act  = SiLU(gate)  →  Forward: ✅                    │   │
│   │                        Backward: ❌                    │   │
│   │                        SiLU'(x) = σ(x) × (1 + x × (1 - σ(x)))│
│   │   gated = act ⊙ up   →  Forward: ✅                    │   │
│   │                        Backward: ❌                    │   │
│   │                        dLoss/dAct = dLoss/dGated ⊙ up  │   │
│   │                        dLoss/dUp = dLoss/dGated ⊙ act  │   │
│   │   out = gated @ W_down → Forward: ✅, Backward: ❌     │   │
│   │                                                        │   │
│   │ 4j. Residual Add: final = r + ffn_out                  │   │
│   │   Forward: ✅, Backward: ❌                            │   │
│   └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 5: Final RMSNorm (implicit — last block output is raw)│
│   Note: The model trace shows hiddenStates as final output  │
│   of the last block. There is NO final RMSNorm before LM Head│
│   in the current implementation.                             │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 6: LM Head                                            │
│   logits = hidden @ W_LM^T                                  │
│   Forward: ✅ Implemented (last hidden → vocab projection)  │
│   Backward: ❌ Missing                                       │
│   dLoss/dW_LM = hidden^T @ dLoss/dLogits                    │
│   dLoss/dHidden = dLoss/dLogits @ W_LM                      │
│   Requires grad: dLoss/dW_LM, dLoss/dHidden                  │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 7: Loss                                               │
│   CrossEntropyLoss(logits, targets)                          │
│   Forward: ✅ Numerically stable softmax + NLL              │
│   Backward: ❌ Missing                                       │
│   dLoss/dLogits = softmax(logits) - one_hot(targets)        │
│   (This is the elegant gradient of cross-entropy!)           │
│   Requires grad: dLoss/dLogits (ENTRY POINT of all backward) │
└─────────────────────────────────────────────────────────────┘
```

### Summary of Gradient Requirements

| Operation | Forward | Backward | d/dWeights | d/dInput | Complexity |
|-----------|---------|----------|------------|----------|------------|
| Embedding lookup | ✅ | ❌ | `dL/dW[i] = dL/dEmb[i]` | N/A | Trivial |
| MatMul (Linear) | ✅ | ❌ | `X^T @ dY` | `dY @ W^T` | Medium |
| RMSNorm | ✅ | ❌ | `Σ x̂ ⊙ dŷ` | Chain rule through RMS | Hard |
| Softmax | ✅ | ❌ | N/A | Jacobian product | Hard |
| Causal Mask | ✅ | ❌ | N/A | Passthrough (masked positions = 0) | Trivial |
| SiLU activation | ✅ | ❌ | N/A | `d × SiLU'(x)` element-wise | Easy |
| Element-wise multiply | ✅ | ❌ | N/A | `d × b`, `d × a` | Easy |
| Residual add | ✅ | ❌ | N/A | `dLoss/dOut` (copy to both branches) | Trivial |
| RoPE rotation | ✅ | ❌ | N/A | Inverse rotation (same cos/sin) | Medium |
| Split/Merge heads | ✅ | ❌ | N/A | Each other's inverse | Trivial |
| CrossEntropyLoss | ✅ | ❌ | N/A | `softmax(logits) - one_hot(target)` | Easy |

---

## 4. Training Capability Assessment

### Existing Capabilities

| Feature | Status | Detail |
|---------|--------|--------|
| Dataset loading | ✅ | `ToyDataset` — 5-sentence hardcoded corpus, tokenizer encoding |
| Batching | ⚠️ Partial | `CrossEntropyLoss.forwardBatch()` computes batch loss, but Pretrainer processes one sample at a time. No true batched forward pass. |
| Loss calculation | ✅ | `CrossEntropyLoss` — numerically stable, causal shift, per-token losses |
| Loss backward | ❌ | `CrossEntropyLoss.forward()` is forward-only. No `backward()` method. |
| Training loop | ✅ | `Pretrainer.runTrainingLoop()` — epoch/sample loops, loss recording |
| Optimizer step | ❌ | `NoOpOptimizer.step()` is intentionally empty |
| Optimizer zeroGrad | ❌ | `NoOpOptimizer.zeroGrad()` is intentionally empty |
| Gradient computation | ❌ | No autograd engine, no backward implementations |
| Parameter update | ❌ | Parameters never change from initial values |
| Checkpoint save | ❌ | No serialization format |
| Checkpoint load | ❌ | No deserialization logic |
| Resume training | ❌ | No state persistence between sessions |
| Evaluation (perplexity) | ❌ | No eval loop, no held-out validation set |
| Learning rate scheduling | ❌ | `learningRate` in config is ignored by NoOpOptimizer |
| Gradient clipping | ❌ | No gradient norm computation |
| DataLoader (shuffle/drop_last) | ❌ | ToyDataset always iterates in order |

### Training Capability Self-Report (from TrainingCapability interface)

The codebase is honest about its limitations — `TrainingCapability.gradientComputation` and `TrainingCapability.parameterUpdate` are explicitly `false`:

```typescript
// From Pretrainer.getCapability():
{
  forwardPass: true,
  lossCalculation: true,
  gradientComputation: false,  // "needs autograd"
  parameterUpdate: false,      // "depends on gradients + parameter registry"
}
```

### Current Training Loop Behavior

With NoOpOptimizer, running 5 epochs produces:
```
lossHistory: [2.31, 2.31, 2.31, 2.31, 2.31]  // identical — no weight updates
```

This is **correct, honest behavior** — the training loop runs end-to-end but parameters never change because there is no gradient flow.

---

## 5. Phase 30–35 Roadmap

### Overview

```
Phase 30: Tensor + Autograd Foundation
Phase 31: Parameter Registry
Phase 32: Linear / Embedding Backward
Phase 33: Attention + FFN Backward
Phase 34: Transformer Backward + Real SGD
Phase 35: AdamW + Checkpoint + Real Training
```

---

### Phase 30: Tensor + Autograd Foundation

**Goal:** Create the `Tensor` class and autograd engine — the foundation for all backward computation.

**New files:**
```
src/lib/minimind/core/Tensor.ts         — Tensor class (data, shape, requiresGrad, grad, _ctx)
src/lib/minimind/core/autograd.ts       — Topological sort, backward() dispatcher
src/lib/minimind/core/ops_basic.ts      — add, mul, matmul, sum, mean with gradient formulas
src/lib/minimind/core/ops_activation.ts — relu, silu, sigmoid, softmax with gradient formulas
src/lib/minimind/core/index.ts          — Barrel export
```

**Detailed design:**

```typescript
// Tensor.ts — conceptual API
class Tensor {
  readonly data: Float64Array;
  readonly shape: number[];
  readonly requiresGrad: boolean;
  grad: Float64Array | null;
  private _ctx: BackwardContext | null;

  constructor(data: Float64Array, shape: number[], requiresGrad?: boolean);

  // Shape utilities
  get ndim(): number;
  get size(): number;
  reshape(...shape: number[]): Tensor;
  item(): number;  // For scalar tensors

  // In-place gradient accumulation
  accumulateGrad(grad: Float64Array): void;

  // Static factory
  static zeros(shape: number[]): Tensor;
  static ones(shape: number[]): Tensor;
  static randn(shape: number[], seed?: number): Tensor;
}

// autograd.ts — conceptual API
function backward(loss: Tensor): void;  // Topo-sort + execute gradient functions
```

**Key gradient formulas to implement:**

| Operation | Forward | Backward formula |
|-----------|---------|------------------|
| `add(a, b)` | `a + b` | `grad_a = grad`, `grad_b = grad` |
| `mul(a, b)` | `a * b` | `grad_a = grad * b`, `grad_b = grad * a` |
| `matmul(A, B)` | `A @ B` | `grad_A = grad @ B.T`, `grad_B = A.T @ grad` |
| `sum(x)` | `Σ x_i` | `grad_x = [grad_out, ..., grad_out]` (broadcast) |
| `mean(x)` | `Σ x_i / n` | `grad_x = [grad_out/n, ...]` (broadcast) |
| `softmax(x)` | `exp(x_i) / Σ exp` | `grad_x_i = softmax_i * (grad_i - Σ softmax_j * grad_j)` |
| `logSoftmax(x)` | `x_i - logSumExp(x)` | `grad_x_i = grad_i - softmax_i * Σ grad_j` |

**Risks:**
- Autograd correctness is hard to verify without unit tests comparing against manual gradient computation (finite differences).
- Memory: naive implementation stores entire computation graph; need to consider memory efficiency for long sequences.
- Performance: Float64Array operations in JS are slower than native BLAS. Acceptable for educational scale but bounds training throughput.

**Verification:**
- Gradient check: `|f(x + h) - f(x) - grad * h| < 1e-6` for each operation
- Forward pass equivalence: New Tensor-based forward produces same output as current array-based forward
- Build: `npm run build` passes

**Files modified:**
- `src/lib/minimind/index.ts` — Add barrel exports for core module

---

### Phase 31: Parameter Registry

**Goal:** Create a unified parameter registry so all model weights can be enumerated, updated, serialized, and deserialized.

**New files:**
```
src/lib/minimind/core/ParameterRegistry.ts  — Registry class
src/lib/minimind/core/serialization.ts      — save/load state_dict
```

**Modified files:**
```
src/lib/minimind/embedding/Embedding.ts     — Register matrix parameter
src/lib/minimind/attention/Attention.ts     — Register W_Q, W_K, W_V, W_O
src/lib/minimind/ffn/FeedForward.ts         — Register W_gate, W_up, W_down
src/lib/minimind/transformer/RMSNorm.ts     — Register gamma
src/lib/minimind/model/LMHead.ts            — Register projection weights
src/lib/minimind/model/MiniMindModel.ts     — Accept optional registry, expose parameters()
```

**Integration pattern:**
Each module's constructor accepts an optional `ParameterRegistry` and a `namePrefix`:

```typescript
class MiniAttention {
  constructor(config: AttentionConfig, registry?: ParameterRegistry, namePrefix?: string) {
    // ... validation ...
    this.W_Q = new Tensor(initData, [dModel, dModel], true);
    this.W_K = new Tensor(initData, [dModel, dModel], true);
    this.W_V = new Tensor(initData, [dModel, dModel], true);
    this.W_O = new Tensor(initData, [dModel, dModel], true);
    if (registry) {
      registry.register(`${namePrefix}.W_Q`, this.W_Q);
      registry.register(`${namePrefix}.W_K`, this.W_K);
      registry.register(`${namePrefix}.W_V`, this.W_V);
      registry.register(`${namePrefix}.W_O`, this.W_O);
    }
  }
}
```

**Risks:**
- Breaking change to all module constructors (new optional parameters — backward compatible).
- Need to maintain backward compatibility for Playground/AI Lab (registry is optional).

**Verification:**
- `registry.parameters().length` matches expected count
- All parameters have consistent shapes
- Serialize → deserialize → parameters match bit-for-bit

---

### Phase 32: Linear / Embedding Backward

**Goal:** Implement backward for the simplest layers: Linear (matmul + optional bias) and Embedding (table lookup), plus CrossEntropyLoss backward.

**Modified files:**
```
src/lib/minimind/pretrain/loss.ts — Add backward() to CrossEntropyLoss
```

**New operations implemented on Tensor:**
- `embedding_lookup` op with backward (sparse gradient — only update looked-up rows)
- `linear` op with backward (matmul backward for weights + input)
- `cross_entropy` op with backward (the elegant `softmax - one_hot` formula)

**Verification:**
- Gradient check on CrossEntropyLoss.backward()
- Gradient check on Linear layer
- Gradient check on Embedding layer
- End-to-end: small model, single sample, loss.backward(), verify all grads ≠ 0

---

### Phase 33: Attention + FFN Backward

**Goal:** Implement backward for the attention mechanism (the most complex gradient) and FFN (SwiGLU).

**Modified files:**
```
src/lib/minimind/attention/Attention.ts — Add backward pass
src/lib/minimind/ffn/FeedForward.ts     — Add backward pass
```

**Attention backward sub-operations:**
1. `softmax_backward` through attention weights
2. `matmul_backward` through `weights @ V`
3. `matmul_backward` through `Q @ K^T`
4. `split_heads_backward` (= `merge_heads` of grad)
5. `merge_heads_backward` (= `split_heads` of grad)
6. Projection backward: `dL/dW_Q`, `dL/dW_K`, `dL/dW_V`, `dL/dW_O`
7. `rope_backward`: inverse rotation using same cos/sin values

**FFN (SwiGLU) backward sub-operations:**
1. `matmul_backward` through W_down
2. `element_mul_backward` through gate ⊙ up
3. `silu_backward` through gate activation
4. `matmul_backward` through W_gate
5. `matmul_backward` through W_up

**Attention backward is the HARDEST piece in the entire system.** Verification is critical:

**Verification:**
- Gradient check on each sub-operation
- Multi-head attention: all 4 projection gradients pass gradient check
- SwiGLU: all 3 projection gradients pass gradient check

---

### Phase 34: Transformer Backward + Real SGD

**Goal:** Complete the backward chain through the full transformer block, integrate SGD optimizer, and achieve the first real training run.

**Modified files:**
```
src/lib/minimind/transformer/TransformerBlock.ts — Add backward pass
src/lib/minimind/transformer/RMSNorm.ts          — Add RMSNorm backward
src/lib/minimind/rope/RotaryEmbedding.ts          — Add RoPE backward
src/lib/minimind/pretrain/optimizer.ts            — Replace NoOpOptimizer with real SGD
src/lib/minimind/pretrain/Pretrainer.ts           — Wire real gradients + optimizer
```

**New files:**
```
src/lib/minimind/pretrain/SGDOptimizer.ts — SGD with momentum, weight decay
```

**RMSNorm backward formula:**
```
RMSNorm: y = x / rms * γ  where rms = sqrt(mean(x²) + ε)

dL/dx_i = (γ_i / rms) * (dL/dy_i - (x_i / (d * rms²)) * Σ_j x_j * dL/dy_j)
dL/dγ   = Σ_pos (x̂ ⊙ dL/dy)  (sum over sequence positions)
```

**SGD with momentum:**
```typescript
class SGDOptimizer implements Optimizer {
  step(gradients: ParameterGradient[]): void {
    for (const g of gradients) {
      const param = registry.get(g.name);
      // velocity = momentum * velocity - lr * grad
      // param += velocity - lr * weightDecay * param
    }
  }
}
```

**Verification:**
- **THE CRITICAL TEST:** Training run produces decreasing loss:
  ```
  Epoch 0: loss = 2.31
  Epoch 1: loss = 2.25
  Epoch 2: loss = 2.18
  ...
  ```
  (Not dramatic — small model, tiny dataset — but consistently decreasing.)
- Gradient norm not exploding (gradient clipping)
- No NaN in any parameter or gradient
- Build passes

---

### Phase 35: AdamW + Checkpoint + Real Training

**Goal:** Productionize training with AdamW optimizer, checkpoint save/load, and a real training run on a larger dataset.

**New files:**
```
src/lib/minimind/pretrain/AdamWOptimizer.ts   — AdamW implementation
src/lib/minimind/pretrain/CheckpointManager.ts — Save/load state_dict + optimizer state
src/lib/minimind/pretrain/DataLoader.ts        — Batching, shuffling, padding
src/lib/minimind/pretrain/Trainer.ts           — Enhanced Pretrainer with eval, logging
```

**Modified files:**
```
src/lib/minimind/pretrain/Pretrainer.ts — Integrate new components
```

**AdamW formula:**
```
m_t = β₁ * m_{t-1} + (1-β₁) * g_t
v_t = β₂ * v_{t-1} + (1-β₂) * g_t²
m̂_t = m_t / (1-β₁^t)
v̂_t = v_t / (1-β₂^t)
θ_t = θ_{t-1} - lr * (m̂_t / (√(v̂_t) + ε) + λ * θ_{t-1})
```

**Checkpoint format (JSON):**
```json
{
  "version": "1.0",
  "step": 150,
  "epoch": 3,
  "model_state": {
    "embedding.weight": [0.0012, -0.0045, ...],
    "transformer.0.attention.W_Q": [...],
    ...
  },
  "optimizer_state": {
    "embedding.weight": {
      "m": [...],
      "v": [...]
    },
    ...
  },
  "config": {
    "dModel": 512,
    "numHeads": 8,
    "numLayers": 6,
    ...
  }
}
```

**Verification:**
- Save checkpoint → restart → load → loss continues decreasing from saved point
- AdamW produces lower final loss than SGD on same dataset
- Training on 100+ samples completes without NaN
- Build passes

---

## Appendix A: Complete File Inventory

### Will be modified across Phase 30–35:
```
src/lib/minimind/core/                     (NEW — ~6 files)
src/lib/minimind/embedding/Embedding.ts     (MODIFIED)
src/lib/minimind/attention/Attention.ts     (MODIFIED)
src/lib/minimind/attention/math.ts          (MODIFIED — backward formulas)
src/lib/minimind/ffn/FeedForward.ts         (MODIFIED)
src/lib/minimind/ffn/math.ts                (MODIFIED — backward formulas)
src/lib/minimind/rope/RotaryEmbedding.ts    (MODIFIED)
src/lib/minimind/rope/math.ts               (MODIFIED — backward formulas)
src/lib/minimind/transformer/RMSNorm.ts     (MODIFIED)
src/lib/minimind/transformer/TransformerBlock.ts (MODIFIED)
src/lib/minimind/model/LMHead.ts            (MODIFIED)
src/lib/minimind/model/MiniMindModel.ts     (MODIFIED)
src/lib/minimind/pretrain/loss.ts           (MODIFIED)
src/lib/minimind/pretrain/optimizer.ts      (MODIFIED or REPLACED)
src/lib/minimind/pretrain/Pretrainer.ts     (MODIFIED)
src/lib/minimind/index.ts                   (MODIFIED — exports)
```

### Will NOT be modified (AI Lab / Data layer):
```
src/data/minimind/**                        (UNTOUCHED)
src/components/minimind/**                  (UNTOUCHED — backward compat)
src/app/ai-lab/**                           (UNTOUCHED)
```

---

## Appendix B: Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Autograd correctness bugs | **Critical** | Comprehensive gradient checks (finite differences) for every operation |
| Performance (pure JS loops) | **Medium** | Acceptable for educational scale; batch size ≤ 8, seqLen ≤ 128 |
| Breaking Playground / AI Lab | **High** | All module constructors maintain backward compatibility (registry is optional) |
| Numerical stability (NaN gradients) | **Medium** | Gradient clipping, epsilon guards, NaN checks at each phase boundary |
| Scope creep | **High** | Strict phase boundaries; each phase has clear acceptance criteria |

---

## Appendix C: Estimated Effort

| Phase | Lines of Code (new + modified) | Complexity |
|-------|-------------------------------|------------|
| Phase 30 | ~800 | Foundation — must be right |
| Phase 31 | ~400 | Mechanical — register all params |
| Phase 32 | ~500 | First gradient formulas |
| Phase 33 | ~800 | Hardest math (attention backward) |
| Phase 34 | ~600 | Integration + real SGD |
| Phase 35 | ~700 | Production training |
| **Total** | **~3,800** | Comparable to entire current `src/lib/minimind/` |
