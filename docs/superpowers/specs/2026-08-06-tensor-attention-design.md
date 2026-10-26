# TensorAttention Design Document

**Phase:** 34 Task 3 — Tensor Transformer Core Migration
**Date:** 2026-08-06
**Status:** Design (implementation pending review)

---

## 1. Overview

`TensorAttention` is the differentiable Multi-Head Self-Attention layer for the Tensor-based MiniMind pipeline. It extends `Module` and composes `Linear` sub-modules with Tensor autograd ops to implement the full attention mechanism with gradient support.

This replaces `MiniAttention` (legacy `number[][]` implementation) in the Tensor pipeline.

---

## 2. Architecture

### 2.1 Data Flow

```
Input [B, T, D]  (batch, seq, dModel)
  │
  ├──→ Q Projection: Linear(D, D) ──→ Q [B, T, D]
  ├──→ K Projection: Linear(D, D) ──→ K [B, T, D]
  └──→ V Projection: Linear(D, D) ──→ V [B, T, D]
  │
  ├──→ Reshape & Transpose to heads: [B, T, D] → [B, H, T, Dh]
  │    where D = H * Dh (H = numHeads, Dh = headDim)
  │
  ├──→ QK^T: [B, H, T, Dh] @ [B, H, Dh, T] → [B, H, T, T]
  │
  ├──→ Scale: / sqrt(Dh)
  │
  ├──→ Causal Mask: upper triangle → -1e9
  │
  ├──→ Softmax: along last dim (per head, per query position)
  │
  ├──→ Attention × V: [B, H, T, T] @ [B, H, T, Dh] → [B, H, T, Dh]
  │
  ├──→ Merge heads: [B, H, T, Dh] → [B, T, D]
  │
  └──→ Output Projection: Linear(D, D) ──→ Output [B, T, D]
```

### 2.2 Shape Table

| Step | Operation | Input Shape | Output Shape |
|------|-----------|-------------|--------------|
| 1 | Q projection | [B, T, D] | [B, T, D] |
| 2 | K projection | [B, T, D] | [B, T, D] |
| 3 | V projection | [B, T, D] | [B, T, D] |
| 4 | Reshape to heads | [B, T, D] | [B, T, H, Dh] |
| 5 | Transpose | [B, T, H, Dh] | [B, H, T, Dh] |
| 6 | Q @ K^T | [B,H,T,Dh] × [B,H,Dh,T] | [B, H, T, T] |
| 7 | Scale | [B, H, T, T] | [B, H, T, T] |
| 8 | Causal mask | [B, H, T, T] | [B, H, T, T] |
| 9 | Softmax (last dim) | [B, H, T, T] | [B, H, T, T] |
| 10 | Attn @ V | [B,H,T,T] × [B,H,T,Dh] | [B, H, T, Dh] |
| 11 | Transpose back | [B, H, T, Dh] | [B, T, H, Dh] |
| 12 | Merge heads | [B, T, H, Dh] | [B, T, D] |
| 13 | O projection | [B, T, D] | [B, T, D] |

---

## 3. Key Design Decisions

### 3.1 Batch Matmul: Required

**Decision: YES, batch matmul is needed.**

The attention computation requires:
- `Q @ K^T`: [B, H, T, Dh] @ [B, H, Dh, T] → [B, H, T, T]
- `Attn @ V`: [B, H, T, T] @ [B, H, T, Dh] → [B, H, T, Dh]

These cannot be expressed with the existing 2D-only `matmul`. We need two forms:

1. **`batchMatmul(a, b)`** — Batched matrix multiplication where the first dimensions are batch dims.
   - `a`: [B, H, T, Dh], `b`: [B, H, Dh, T] → `out`: [B, H, T, T]
   - Contract over the last dim of `a` and the second-to-last dim of `b`.
   - Batch dims must match exactly (no broadcasting needed for attention).

**Alternative considered:** Flatten `[B, H, T, Dh]` to `[B*H*T, Dh]`, use 2D matmul, then reshape back.

This would require extensive reshape chaining:
```
// QK^T via flatten:
Q_flat: [B, H, T, Dh] → reshape → [B*H*T, Dh]
K_flat: [B, H, T, Dh] → reshape → [B*H*T, Dh]
K_T:    [B*H*T, Dh] → transpose → [Dh, B*H*T]  // transpose can't do this!
```

The existing `transpose` op only swaps two dimensions for a single tensor — it can't do the batch-aware K^T needed here. We'd need a custom transpose or a special reshape pattern. This is significantly more complex than adding batch matmul.

**Verdict:** Add `batchMatmul` as a new op. It's cleaner, self-contained, and needed by other Transformer components later.

### 3.2 Head Reshaping Strategy: Reshape + Transpose

**Decision: Use existing reshape + extend transpose for 4D tensors.**

Current `reshape` supports -1 inference, which is sufficient. We need to extend `transpose` to handle 4D tensors (currently supports any dimension through the generic algorithm — let me verify).

Actually, checking the code: `transpose` already works for any number of dimensions! It uses negative indexing and generic index computation. So we can use:

```
// [B, T, D] → [B, T, H, Dh]
const qHeads = reshape(q, B, T, H, Dh);

// [B, T, H, Dh] → [B, H, T, Dh]
const qTransposed = transpose(qHeads, 1, 2);
```

And reverse:
```
// [B, H, T, Dh] → [B, T, H, Dh]
const attnTransposed = transpose(attnOut, 1, 2);

// [B, T, H, Dh] → [B, T, D]
const merged = reshape(attnTransposed, B, T, D);
```

### 3.3 Causal Mask Strategy: New Op

**Decision: Add a `causalMask` op.**

The causal mask sets `scores[b,h,i,j] = -1e9` for all `j > i`. This is a simple element-wise operation with a known pattern.

```
causalMask(scores: Tensor): Tensor
```
- Forward: Set future positions to -1e9
- Backward: Pass gradient through unmasked positions, zero gradient at masked positions

The `-1e9` value is chosen because `exp(-1e9) ≈ 0` in float64, giving effectively-zero attention weights after softmax.

### 3.4 Softmax Extension

**Decision: Extend softmax to support applying along last dim of any-rank tensor.**

Currently softmax supports 1D and 2D. For attention we need softmax along the last dim of [B, H, T, T] — i.e., per (B, H, T) row. This is a natural generalization of the existing 2D softmax:

```
softmax3D(x): // [B, H, T, T] → softmax along last dim → [B, H, T, T]
```

The implementation is straightforward: iterate over all rows (B*H*T of them) and apply the same per-row softmax logic.

### 3.5 Memory Strategy

**Decision: Create new tensors; no in-place ops.**

All operations create new Float64Array buffers. The peak memory per attention call:
- Q/K/V projections: 3 × (B × T × D) floats
- After head reshape: 4 × (B × H × T × Dh) = B × T × D × 4 floats
- Scores: B × H × T × T floats (quadratic in T)
- Attention output: B × H × T × Dh floats
- Output projection: B × T × D floats

For a typical training configuration (B=2, T=128, H=8, Dh=64, D=512):
- Total: ~2 × 128 × 512 × ~10 copies ≈ 1.3M floats ≈ 10 MB

This is well within acceptable bounds for in-browser usage.

---

## 4. Implementation Plan

### 4.1 New Ops Required

| Op | File | Purpose |
|----|------|---------|
| `batchMatmul` | `core/ops/batchMatmul.ts` | 4D batched matrix multiplication |
| `causalMask` | `core/ops/causalMask.ts` | Apply causal attention mask |

### 4.2 Ops to Extend

| Op | File | Change |
|----|------|--------|
| `softmax` | `core/ops/softmax.ts` | Support N-D tensors along last dim |
| `transpose` | `core/ops/transpose.ts` | Verify 4D support (should work already) |

### 4.3 New Module

| Class | File | Extends |
|-------|------|---------|
| `TensorAttention` | `transformer/TensorAttention.ts` | `Module` |

### 4.4 Module Structure

```typescript
class TensorAttention extends Module {
  // Config
  readonly dModel: number;
  readonly numHeads: number;
  readonly headDim: number;

  // Sub-modules (4 Linear layers)
  private _W_Q: Linear;  // [dModel, dModel] — Query projection
  private _W_K: Linear;  // [dModel, dModel] — Key projection
  private _W_V: Linear;  // [dModel, dModel] — Value projection
  private _W_O: Linear;  // [dModel, dModel] — Output projection

  // Parameters: 4 * dModel * dModel (weights only, no bias)
  // Total: 4 * D²

  forward(x: Tensor, mask?: "causal"): Tensor {
    // 1. Q/K/V projections via Linear (reshape 3D→2D, project, reshape back)
    // 2. Split heads: reshape + transpose
    // 3. batchMatmul(Q, K^T) using batchMatmul
    // 4. Scale by 1/sqrt(headDim)
    // 5. Apply causal mask
    // 6. Softmax along last dim
    // 7. batchMatmul(attn, V)
    // 8. Merge heads: transpose + reshape
    // 9. Output projection
  }
}
```

### 4.5 Parameters

| Parameter | Shape | Count |
|-----------|-------|-------|
| W_Q.weight | [D, D] | D² |
| W_K.weight | [D, D] | D² |
| W_V.weight | [D, D] | D² |
| W_O.weight | [D, D] | D² |
| **Total** | | **4 × D²** |

For D=512: 4 × 262,144 = 1,048,576 parameters

---

## 5. Backward Path

The backward pass is fully automatic through the autograd engine — each op registers its own backward function:

1. **Linear.backward**: grad flows through output projection → attention output
2. **reshape.backward**: grad reshaped back to merged heads format
3. **transpose.backward**: grad transposed back
4. **batchMatmul.backward** (attn @ V):
   - grad_attn = gradOutput @ V^T
   - grad_V = attn^T @ gradOutput
5. **softmax.backward**: softmax Jacobian per row
6. **batchMatmul.backward** (Q @ K^T):
   - grad_Q = gradScores @ K
   - grad_K = gradScores^T @ Q
7. **transpose.backward**: grad reshaped back to Q/K/V format
8. **reshape.backward**: grad reshaped to 2D for Linear
9. **Linear.backward**: grad flows to W_Q, W_K, W_V weights

---

## 6. Validation Plan

### 6.1 Unit Tests per Op

- `batchMatmul`: forward correctness, backward gradient check (finite difference)
- `causalMask`: forward correctness (upper triangle = -1e9, rest unchanged), backward gradient check
- `softmax` (N-D): forward correctness for 3D/4D, backward gradient check

### 6.2 Integration Tests for TensorAttention

- Construction & parameter registration (4 Linear sub-modules)
- Forward shape validation: [B,T,D] → [B,T,D]
- Forward value sanity (finite, non-NaN)
- Causal mask correctness (output at position i only depends on positions ≤ i)
- All 4 weights receive gradient after backward
- Input gradient propagation
- zeroGrad propagation
- Parameter count validation
- Finite difference gradient check on all 4 weights

---

## 7. batchMatmul Specification

### Forward

```
batchMatmul(a: Tensor, b: Tensor): Tensor

a.shape = [B, H, T, Dh]   (or more generally [..., M, K])
b.shape = [B, H, Dh, T]   (or more generally [..., K, N])

Contract: last dim of a with second-to-last dim of b
Output: [B, H, T, T]      (or more generally [..., M, N])
```

The batch dimensions (all except last 2) must match exactly.

### Backward

```
grad_a = batchMatmul(gradOutput, transpose_last2(b))
// gradOutput: [B,H,T,T], transpose_last2(b): [B,H,T,Dh] → grad_a: [B,H,T,Dh]

grad_b = batchMatmul(transpose_last2(a), gradOutput)
// transpose_last2(a): [B,H,Dh,T], gradOutput: [B,H,T,T] → grad_b: [B,H,Dh,T]
```

---

## 8. Open Questions

1. **Should we add RoPE (Rotary Position Embedding) to attention?**
   - The legacy MiniAttention doesn't include RoPE (it's applied externally).
   - For TensorAttention, RoPE would be applied to Q and K after projection but before attention computation.
   - **Recommendation:** Defer RoPE to a separate phase. TensorAttention Phase 34 focuses on the core attention mechanism.

2. **Should we support cross-attention (separate K/V from different source)?**
   - Currently only self-attention is planned (Q, K, V all from same input).
   - **Recommendation:** Self-attention only for now. Cross-attention can be added later.

3. **Should the causal mask be a separate op or inline in TensorAttention?**
   - **Recommendation:** Separate op for testability and reuse. The `causalMask` op is simple and useful for any autoregressive model.

---

## 9. Files Summary

### New files:
- `src/lib/minimind/core/ops/batchMatmul.ts`
- `src/lib/minimind/core/ops/causalMask.ts`
- `src/lib/minimind/transformer/TensorAttention.ts`
- `src/lib/minimind/core/__tests__/attention.test.ts`

### Modified files:
- `src/lib/minimind/core/ops/softmax.ts` — extend to N-D
- `src/lib/minimind/core/index.ts` — export new ops
- `src/lib/minimind/transformer/index.ts` — export TensorAttention
- `src/lib/minimind/index.ts` — export TensorAttention
- `src/lib/minimind/core/__tests__/run.ts` — include attention tests
