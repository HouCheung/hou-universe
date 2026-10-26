# Tensor Autograd Engine Design

**Date:** 2026-08-06
**Phase:** 30
**Status:** Draft — Awaiting Review
**Depends on:** [Core Engine Audit](2026-08-06-minimind-core-engine-audit.md)

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tensor Data Structure](#2-tensor-data-structure)
3. [Autograd Graph Design](#3-autograd-graph-design)
4. [Phase 30 Operation Support](#4-phase-30-operation-support)
5. [API Design](#5-api-design)
6. [Migration Strategy](#6-migration-strategy)
7. [Phase 30 Implementation Plan](#7-phase-30-implementation-plan)
8. [Risk Assessment](#8-risk-assessment)

---

## 1. Executive Summary

### Current State

MiniMind has a **complete forward pass** through a GPT-like architecture. All math is implemented as pure functions operating on raw JS arrays:

| Data Type | Usage |
|-----------|-------|
| `number` | Scalar values, loss |
| `number[]` | Vectors (token embeddings, RMSNorm gamma) |
| `number[][]` | Matrices (weights, activations, attention scores) |
| `Float64Array` | Only used in Embedding module for parameter storage |

There is **no Tensor abstraction**, **no computation graph**, **no gradient storage**, and **no backward pass**.

### Goal of Phase 30

Create the **Tensor class** and **autograd engine** — the foundation upon which all gradient-based training (Phase 31–35) depends. This phase does NOT implement backward for any existing module. It builds the primitive layer:

1. `Tensor` — wraps data with shape, `requiresGrad`, `grad`, graph context
2. `autograd` — topological sort + backward traversal
3. Primitive ops — `add`, `multiply`, `matmul`, `sum`, `reshape`, `transpose`, `softmax`, `relu` with gradient formulas

### Key Design Principle

**No modification to existing code.** All new files live under `src/lib/minimind/core/`. Existing modules (`Attention`, `FFN`, etc.) continue to work with `number[][]` unchanged. The Tensor system is built beside them, not on top of them.

---

## 2. Tensor Data Structure

### 2.1 Core Interface

```typescript
class Tensor {
  // ── Required fields ──

  /** Underlying data storage — always a flat Float64Array */
  readonly data: Float64Array;

  /** Shape descriptor — e.g. [2, 3] for a 2×3 matrix, [] for scalar */
  readonly shape: number[];

  /** Whether this tensor participates in gradient computation */
  readonly requiresGrad: boolean;

  /** Gradient buffer — same length as data, null if requiresGrad=false */
  grad: Float64Array | null;

  /** Computation graph context — null for leaf tensors (user-created or parameters) */
  private _ctx: BackwardContext | null;

  // ── Computed properties (getters, no storage) ──

  /** Number of dimensions */
  get ndim(): number;

  /** Total number of elements (product of shape) */
  get size(): number;

  /** Number of elements per batch (product of shape excluding first dim) */
  get stride(): number;
}
```

### 2.2 Field Analysis

#### Must Exist (Phase 30)

| Field | Type | Rationale |
|-------|------|-----------|
| `data` | `Float64Array` | Single flat typed array — enables zero-copy views, efficient math, and easy gradient accumulation. Avoids nested `number[][]` which has per-row allocation overhead. |
| `shape` | `number[]` | Required for reshape, broadcasting, matmul dimension validation, and gradient shape checking. Without shape, the tensor is just a bag of numbers. |
| `requiresGrad` | `boolean` | Distinguishes parameters (require gradients) from inputs/data (don't). Fundamental to PyTorch's design — intermediate tensors inherit `requiresGrad=true` if any parent requires grad. |
| `grad` | `Float64Array \| null` | Gradient accumulator. Must be separate from data because we accumulate (add) gradients from multiple backward paths, not overwrite. |
| `_ctx` | `BackwardContext \| null` | The backward closure. Stores `parents: Tensor[]` and `backwardFn: (grad: Float64Array) => void`. Without this, `backward()` has no graph to traverse. |

#### Must NOT Exist (Phase 30 — deferred to later phases)

| Field | Why Deferred |
|-------|-------------|
| `name` / `label` | Naming belongs to `ParameterRegistry` (Phase 31). Adding it to Tensor couples concerns. |
| `device` | No GPU support planned. If needed later, add via a `Device` abstraction — not a string field. |
| `dtype` | All tensors are Float64Array for now. Type polymorphism adds complexity without Phase 30 benefit. |
| `isLeaf` | Computed from `_ctx === null && requiresGrad`, not stored. No need for explicit flag. |
| `retainGrad` | Intermediate nodes don't retain gradients by default (PyTorch behavior). Add as Phase 31+ optimization. |

#### `BackwardContext` interface

```typescript
interface BackwardContext {
  /** Tensors that produced this tensor — edges in the computation DAG */
  parents: Tensor[];

  /**
   * Backward function — receives gradient of the loss w.r.t. THIS tensor,
   * computes gradients w.r.t. each parent, and accumulates via parent.accumulateGrad().
   *
   * Signature matches PyTorch's convention: backwardFn(gradOutput) internally
   * calls parent.accumulateGrad(computedGrad) for each parent.
   */
  backwardFn: (gradOutput: Float64Array) => void;
}
```

### 2.3 Design Decisions

**Decision 1: Flat `Float64Array` instead of nested arrays**

The current codebase uses `number[][]` everywhere. For Tensor, we use flat `Float64Array` with shape-based indexing:

```typescript
// Index calculation: data[i * stride + j] for shape [rows, cols]
// This is how BLAS/LAPACK and every ML framework does it.

// Pros:
// - Single allocation, cache-friendly
// - Easy to clone, slice, broadcast
// - Gradient accumulation is a simple element-wise addition loop
// - Enables future zero-copy views (reshape, transpose)

// Cons:
// - Manual index math (mitigated by helper functions)
// - Harder to debug (mitigated by toString() that respects shape)
```

**Decision 2: `_ctx` stores a closure, not a function pointer**

The closure captures the specific tensors involved in the forward operation (e.g., the saved `softmax_output` needed for softmax backward). This is the standard autograd pattern (PyTorch, tinygrad, micrograd all use this).

```typescript
// Example: matmul forward creates _ctx with a closure
function matmul(a: Tensor, b: Tensor): Tensor {
  const result = new Tensor(matmulData, [m, n], a.requiresGrad || b.requiresGrad);

  if (result.requiresGrad) {
    result._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput) => {
        // Closed over: a, b (saved for backward)
        // Compute grad_a = gradOutput @ b^T
        // Compute grad_b = a^T @ gradOutput
        a.accumulateGrad(gradA);
        b.accumulateGrad(gradB);
      }
    };
  }

  return result;
}
```

**Decision 3: Gradient accumulation, not assignment**

`accumulateGrad(grad)` adds to `this.grad` rather than replacing it. This is critical for parameters used multiple times in a computation graph (e.g., weight tying, or when a tensor contributes to loss through multiple paths):

```typescript
accumulateGrad(grad: Float64Array): void {
  if (!this.requiresGrad) return;
  if (this.grad === null) {
    this.grad = new Float64Array(grad); // First contribution — copy
  } else {
    for (let i = 0; i < this.grad.length; i++) {
      this.grad[i] += grad[i]; // Subsequent contributions — add
    }
  }
}
```

---

## 3. Autograd Graph Design

### 3.1 Forward: Building the Graph

Every operation that produces a Tensor with `requiresGrad=true` records its parents and backward function:

```
// User code:
const a = Tensor.fromArray([[1, 2], [3, 4]]);  // requiresGrad=false (default)
const W = Tensor.randn([2, 3], true);           // requiresGrad=true (parameter)

const c = matmul(a, W);  // c.requiresGrad = true (W requires grad)
                          // c._ctx = { parents: [a, W], backwardFn: ... }
```

The graph is built **eagerly** during forward, not traced lazily. Each operation immediately computes the result AND stores the backward closure.

### 3.2 Graph Structure

```
                    Leaf (user input)
                    a: Tensor
                    requiresGrad=false
                    _ctx=null
                         \
                          \
                    Leaf (parameter)
                    W: Tensor
                    requiresGrad=true
                    _ctx=null
                         /
                        /
                    c = matmul(a, W)
                    c: Tensor
                    requiresGrad=true
                    _ctx = { parents: [a, W], backwardFn: matmul_backward }
                         |
                    d = relu(c)
                    d: Tensor
                    requiresGrad=true
                    _ctx = { parents: [c], backwardFn: relu_backward }
                         |
                    loss = sum(d)
                    loss: Tensor
                    requiresGrad=true
                    _ctx = { parents: [d], backwardFn: sum_backward }
```

### 3.3 Backward: Topological Sort

`loss.backward()` performs these steps:

```
Step 1: Topological sort
  Build a linear ordering of all nodes reachable from `loss`
  via `_ctx.parents`, such that every node appears AFTER
  all nodes that depend on it.

  Algorithm: DFS post-order
    function buildTopo(node, visited, topo):
      if node in visited: return
      visited.add(node)
      for parent in (node._ctx?.parents ?? []):
        buildTopo(parent, visited, topo)
      topo.push(node)

  For the graph above:
    topo = [a, W, c, d, loss]

Step 2: Initialize gradient
  loss.grad = new Float64Array([1.0])  // dLoss/dLoss = 1

Step 3: Execute backwardFn in reverse order
  for node in reverse(topo):  // loss → d → c → W → a
    if node._ctx !== null:
      node._ctx.backwardFn(node.grad)

  Execution trace:
    loss._ctx.backwardFn([1.0])
      → d.accumulateGrad(ones_like(d.data))  // sum_backward: broadcast
    d._ctx.backwardFn(d.grad)
      → c.accumulateGrad(d.grad ⊙ relu_derivative(c.data))  // relu_backward
    c._ctx.backwardFn(c.grad)
      → W.accumulateGrad(a^T @ c.grad)  // matmul_backward for W
      → a.accumulateGrad(c.grad @ W^T)  // matmul_backward for a (skipped, requiresGrad=false)
    W._ctx.backwardFn → skipped (leaf, no _ctx)
    a._ctx.backwardFn → skipped (leaf, no _ctx)

Step 4: Gradients accumulated in leaf tensors
    W.grad = matmul gradient  ← Ready for optimizer.step()
    a.grad = null             ← requiresGrad was false
```

### 3.4 Edge Cases

**Multiple children (fan-out):**
A single tensor feeds into two operations. Each backward path calls `accumulateGrad` independently — the gradients add up, which is the correct chain-rule behavior.

```
       a
      / \
     b   c
      \ /
       d

d.backward():
  topo = [a, b, c, d]
  reverse execution:
    d._ctx.backwardFn → accumulates into b, c
    c._ctx.backwardFn → accumulates into a (first contribution)
    b._ctx.backwardFn → accumulates into a (second contribution → added)
  Result: a.grad = ∂d/∂b · ∂b/∂a + ∂d/∂c · ∂c/∂a ✓
```

**Non-scalar backward:**
If the user calls `.backward()` on a non-scalar tensor, we disallow it (matching PyTorch behavior). Only scalar tensors (shape `[]` or `[1]`) can be the entry point for backward:

```typescript
backward(): void {
  if (this.shape.length > 0 && this.size !== 1) {
    throw new Error(
      `backward() requires a scalar tensor. Got shape [${this.shape}]. ` +
      `For non-scalar output, call .backward() on a reduced version (e.g., loss.sum()).`
    );
  }
  // ... topo sort + execute ...
}
```

---

## 4. Phase 30 Operation Support

### 4.1 Operation Inventory

Phase 30 implements **8 primitive operations**. Each operation has:
- Forward function (returns Tensor)
- Backward function (stored in `_ctx.backwardFn` closure)
- Gradient check verification

#### Required Operations

| # | Operation | Forward | Backward Formula | Complexity |
|---|-----------|---------|------------------|------------|
| 1 | `add(a, b)` | `a + b` (broadcast) | `grad_a = sum_over_broadcast(grad)`, `grad_b = sum_over_broadcast(grad)` | Easy |
| 2 | `multiply(a, b)` | `a ⊙ b` (element-wise) | `grad_a = grad ⊙ b`, `grad_b = grad ⊙ a` | Easy |
| 3 | `matmul(a, b)` | `a @ b` | `grad_a = grad @ b^T`, `grad_b = a^T @ grad` | Medium |
| 4 | `sum(x, dim?)` | `Σ x_i` | `grad_x = expand(grad, x.shape)` (broadcast back) | Easy |
| 5 | `reshape(x, shape)` | view (zero-copy if possible) | `grad_x = reshape(grad, x.shape)` (inverse reshape) | Easy |
| 6 | `transpose(x, dim0, dim1)` | swap two axes | `grad_x = transpose(grad, dim0, dim1)` (self-inverse) | Easy |
| 7 | `softmax(x, dim)` | `exp(x_i) / Σ exp` | `grad_x_i = s_i · (grad_i - Σ_j s_j · grad_j)` | Medium |
| 8 | `relu(x)` | `max(0, x)` | `grad_x = grad ⊙ (x > 0 ? 1 : 0)` | Easy |

#### Deferred Operations (Phase 32–34)

These ops are needed for the full model backward but belong in later phases:

| Operation | Phase | Rationale |
|-----------|-------|-----------|
| `silu` / `sigmoid` | 32 | FFN activation backward |
| `log_softmax` / `cross_entropy` | 32 | Loss backward — the entry point of all training |
| `rms_norm` | 33 | Normalization backward |
| `rope_rotate` | 33 | RoPE backward (inverse rotation) |
| `scaled_dot_product_attention` | 33 | Composite op — can be built from primitives, but specialized backward is more efficient |
| `causal_mask` | 33 | Pass-through backward for non-masked positions |
| `split_heads` / `merge_heads` | 33 | Reshape operations |
| `embedding_lookup` | 32 | Sparse gradient — only update looked-up rows |

### 4.2 Softmax Backward — Detailed

Softmax is the most mathematically subtle operation in Phase 30. The backward formula deserves explicit documentation:

```typescript
/**
 * softmax(x, dim=-1)
 *
 * Forward:  s_i = exp(x_i - max(x)) / Σ_j exp(x_j - max(x))
 *
 * Backward: given gradOutput = dL/ds (gradient of loss w.r.t softmax output),
 *           compute gradInput = dL/dx.
 *
 * Derivation:
 *   The softmax Jacobian J has entries:
 *     J_ij = ∂s_i/∂x_j = s_i * (δ_ij - s_j)
 *   where δ_ij = 1 if i=j, else 0.
 *
 *   By chain rule: dL/dx_j = Σ_i dL/ds_i * ∂s_i/∂x_j
 *                         = Σ_i dL/ds_i * s_i * (δ_ij - s_j)
 *                         = dL/ds_j * s_j - Σ_i dL/ds_i * s_i * s_j
 *                         = s_j * (dL/ds_j - Σ_i dL/ds_i * s_i)
 *                         = s_j * (dL/ds_j - dot(s, dL/ds))
 *
 *   So: gradInput = softmax_out * (gradOutput - dot(softmax_out, gradOutput))
 *
 * Complexity: O(n) per row — we compute dot(s, grad) once per row.
 */
function softmaxBackward(
  gradOutput: Float64Array,  // dL/ds
  softmaxOut: Float64Array,   // s (saved from forward)
): Float64Array {
  const n = softmaxOut.length;
  let dot = 0;
  for (let i = 0; i < n; i++) {
    dot += softmaxOut[i] * gradOutput[i];
  }

  const gradInput = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    gradInput[i] = softmaxOut[i] * (gradOutput[i] - dot);
  }
  return gradInput;
}
```

### 4.3 Matmul Backward — Broadcasting Dimensions

Matmul must handle the general case where A is `[..., m, k]` and B is `[..., k, n]`, supporting batch matrix multiply:

```
Phase 30 restriction: only 2D matmul (a: [m, k], b: [k, n]).
Batch matmul is deferred to Phase 32+ when real training requires it.
```

```typescript
/**
 * matmul(a, b)
 *
 * Phase 30: a.shape = [m, k], b.shape = [k, n]
 * result.shape = [m, n]
 *
 * Backward:
 *   grad_a = grad @ b^T  → shape [m, k]
 *   grad_b = a^T @ grad  → shape [k, n]
 *
 * Verification: grad_a must match a.shape, grad_b must match b.shape.
 */
```

---

## 5. API Design

### 5.1 Tensor Creation

```typescript
// From existing data
const t1 = Tensor.fromArray([[1, 2], [3, 4]]);           // infers shape [2, 2], requiresGrad=false
const t2 = Tensor.fromArray([1, 2, 3, 4], [2, 2], true); // explicit shape, requiresGrad=true

// Factory methods
const zeros = Tensor.zeros([2, 3]);            // [2, 3] of 0s, requiresGrad=false
const ones  = Tensor.ones([2, 3], true);       // [2, 3] of 1s, requiresGrad=true
const randn = Tensor.randn([2, 3], true);      // [2, 3] ~ N(0, 1), requiresGrad=true
const rand  = Tensor.uniform([2, 3], -0.1, 0.1, true); // [2, 3] ~ U(-0.1, 0.1), requiresGrad=true

// Scalar
const scalar = Tensor.scalar(3.14, true);      // shape [], data [3.14]
```

### 5.2 Static Operation Functions

All operations are **standalone functions**, not methods on Tensor. This keeps `Tensor` as a pure data container and makes the operation set extensible without modifying the Tensor class:

```typescript
// In ops_basic.ts:
import { add, multiply, matmul, sum, reshape, transpose } from './core/ops_basic';

// In ops_activation.ts:
import { relu, softmax } from './core/ops_activation';

// Usage:
const c = matmul(a, b);        // returns Tensor with _ctx set up
const d = relu(c);             // returns Tensor with _ctx set up
const loss = sum(d);           // returns scalar Tensor with _ctx set up
loss.backward();               // populates a.grad, b.grad, etc.
```

This design mirrors PyTorch's `torch.nn.functional` — operations are functions, not methods.

### 5.3 Tensor Instance Methods (Minimal)

Tensor has few instance methods — the minimum necessary:

```typescript
class Tensor {
  // ── Shape utilities ──
  reshape(...newShape: number[]): Tensor;    // Delegates to reshape() function
  transpose(dim0?: number, dim1?: number): Tensor; // Delegates to transpose() function
  item(): number;                            // Returns data[0] for scalar tensors

  // ── Autograd ──
  backward(): void;                          // Entry point for gradient computation
  accumulateGrad(grad: Float64Array): void;  // Called by backwardFns (not user-facing)
  zeroGrad(): void;                          // Reset grad to zeros
  detach(): Tensor;                          // Returns new tensor sharing data, requiresGrad=false

  // ── Conversion ──
  toArray(): number[] | number[][];          // For interop with existing number[][] code
  toString(): string;                        // Debug — prints shape + first few values
  clone(): Tensor;                           // Deep copy (new data array)
}
```

### 5.4 Future Integration Patterns

These patterns are DESIGN GOALS for Phase 31–35, not implemented in Phase 30:

```typescript
// ── Phase 31: Parameter Registry ──
const registry = new ParameterRegistry();
const linear = new LinearLayer(512, 2048, registry, "ffn.0");
// Internally: linear.W = Tensor.randn([512, 2048], true)
//            registry.register("ffn.0.W", linear.W)

// ── Phase 32-34: Module forward using Tensor ──
const output = linear.forward(inputTensor);  // matmul(input, linear.W) → Tensor with grad

// ── Phase 34: Training loop ──
loss.backward();                             // Populates all parameter grads
optimizer.step(registry.parameters());       // W -= lr * W.grad
optimizer.zeroGrad();                        // Reset all grads to zero

// ── Phase 35: Checkpoint ──
const state = registry.getStateDict();       // { "ffn.0.W": Float64Array, ... }
saveCheckpoint(state, "step_1000.json");
```

### 5.5 What We Will NOT Implement (Phase 30)

These are explicitly out of scope:

- `tensor + tensor` operator overloading (not possible in JS without Proxy, which breaks type safety)
- `tensor @ tensor` operator overloading (same reason)
- In-place operations (`tensor.add_(other)`) — all ops produce new Tensors
- Gradient checkpointing / memory optimization
- Mixed precision (float32/float16)
- CUDA/WebGPU/WebAssembly acceleration
- Named tensors
- Hooks (forward_hook, backward_hook)
- `torch.no_grad()` context manager equivalent (use `detach()` or `requiresGrad=false`)

---

## 6. Migration Strategy

### 6.1 Option Analysis

The core question: how do we introduce Tensor without breaking the existing `number[][]` based forward pass that powers the Playground, AI Lab, and Inference engine?

#### Option A: Full Replacement

Replace all `number[][]` with `Tensor` in every module.

| Pros | Cons |
|------|------|
| Clean, unified architecture | **Massive breaking change** — every component file is affected |
| Single code path to maintain | Playground/AI Lab visualization code expects `number[][]` |
| | Inference engine doesn't need gradients — Tensor overhead wasted |
| | High risk of regression in 15+ component files |
| | Cannot be done incrementally |

**Verdict: ❌ Rejected.** Too risky, too many dependencies, violates "don't break existing functionality."

#### Option B: New Tensor Layer, Old Forward Preserved

Add `src/lib/minimind/core/` with Tensor + autograd. Existing modules unchanged.

| Pros | Cons |
|------|------|
| **Zero risk** to existing functionality | Two separate code paths (Tensor ops vs. array math) |
| Can be developed and tested independently | Some duplication — matmul exists in both attention/math.ts and core/ops_basic.ts |
| Gradual migration possible (Phase 32–35) | |
| Playground/AI Lab continue working throughout | |
| Phase 30 can land without touching any existing file | |

**Verdict: ✅ Recommended for Phase 30.**

#### Option C: Dual Mode

Each module accepts both `number[][]` and `Tensor`, with internal branching.

| Pros | Cons |
|------|------|
| Gradual per-module migration | Complex internal logic (if-else on input type) |
| | Maintenance burden — two implementations in every module |
| | Easy to introduce bugs at the boundary |
| | Doesn't actually simplify anything |

**Verdict: ❌ Rejected.** Over-engineering. Option B already provides migration path without the per-module complexity.

### 6.2 Recommended Strategy: Option B with Clear Migration Path

#### Phase 30 (This Phase)

```
src/lib/minimind/              ← UNCHANGED (all existing files)
src/lib/minimind/core/         ← NEW (Tensor + autograd, zero overlap)
  ├── Tensor.ts
  ├── autograd.ts
  ├── ops_basic.ts
  ├── ops_activation.ts
  └── index.ts
```

No existing file is modified. Tensor and autograd are self-contained.

#### Phase 31 (Parameter Registry)

Introduce `ParameterRegistry`. Modules opt-in by accepting an optional registry:

```typescript
// attention/Attention.ts — ADD optional parameter:
constructor(config: AttentionConfig, registry?: ParameterRegistry, namePrefix?: string) {
  // ... existing initialization ...
  if (registry) {
    // Register parameters as Tensors alongside existing number[][] weights
    // Existing getWeight() still returns number[][]
  }
}
```

The `number[][]` path remains the default. Parameter registration is opt-in.

#### Phase 32–34 (Backward Implementation)

Create **Tensor-based forward clones** of key modules:

```
src/lib/minimind/core/
  ├── Linear.ts         ← Tensor-based matmul with backward
  ├── Embedding.ts      ← Tensor-based lookup with backward
  ├── Attention.ts      ← Tensor-based attention with backward
  ├── FFN.ts            ← Tensor-based SwiGLU with backward
  └── ...
```

Existing `attention/Attention.ts` continues to work for Playground. Training uses `core/Attention.ts`.

#### Phase 35 (Unification — Optional)

If training is the primary code path by then, `core/` modules can become the canonical implementation and `attention/` modules can wrap them for backward compatibility:

```typescript
// attention/Attention.ts refactored:
export class MiniAttention {
  private core: CoreAttention; // Uses Tensor internally
  forward(input: AttentionInput): AttentionOutput {
    const tIn = Tensor.fromArray(input.queries);
    const tOut = this.core.forward(tIn);
    return { output: tOut.toArray(), trace: ... };
  }
}
```

### 6.3 Interoperability Utilities

To bridge between Tensor and `number[][]` during migration:

```typescript
// Tensor → number[][] (for visualization, Playground)
tensor.toArray(): number[] | number[][] | number[][][];

// number[][] → Tensor (for training entry point)
Tensor.fromArray(data: number[][] | number[], shape?: number[], requiresGrad?: boolean): Tensor;
```

These are the ONLY two conversion points. No implicit conversion anywhere.

---

## 7. Phase 30 Implementation Plan

### 7.1 File Inventory

All new files (zero existing files modified):

```
src/lib/minimind/core/
├── Tensor.ts             # Tensor class (data, shape, grad, _ctx, factories, utilities)
├── autograd.ts           # backward(), topological sort, gradient validation
├── ops_basic.ts          # add, multiply, matmul, sum, reshape, transpose + backward closures
├── ops_activation.ts     # relu, softmax + backward closures
├── index.ts              # Barrel export
└── __tests__/            # Test files (if following project convention)
    ├── Tensor.test.ts
    ├── autograd.test.ts
    ├── ops_basic.test.ts
    └── ops_activation.test.ts
```

### 7.2 Implementation Order

#### Step 1: Tensor Class (`Tensor.ts`) — ~200 lines

Core responsibilities:
- Constructor: `data: Float64Array`, `shape: number[]`, `requiresGrad: boolean`
- `get ndim()`: `shape.length`
- `get size()`: product of shape dimensions
- `accumulateGrad(grad: Float64Array)`: element-wise add to `this.grad`
- `zeroGrad()`: fill `this.grad` with zeros
- `detach()`: new Tensor sharing data, `requiresGrad=false`
- `reshape(...shape)`: delegates to `reshape()` function
- `item()`: returns `data[0]` if scalar, throws otherwise
- `clone()`: deep copy
- `toArray()`: nested arrays in shape order
- `toString()`: pretty-print with shape + preview
- Static factories: `zeros`, `ones`, `scalar`, `fromArray`, `randn`, `uniform`

**Data indexing helper (internal):**
```typescript
function indexFor(shape: number[], indices: number[]): number {
  let offset = 0;
  let stride = 1;
  for (let i = shape.length - 1; i >= 0; i--) {
    offset += indices[i] * stride;
    stride *= shape[i];
  }
  return offset;
}
```

#### Step 2: Autograd Engine (`autograd.ts`) — ~100 lines

Core responsibilities:
- `buildTopologicalOrder(loss: Tensor): Tensor[]` — DFS post-order
- Validates: only scalar tensors can call backward
- Executes `_ctx.backwardFn` in reverse topo order
- Guards against double-backward (clear `_ctx` after execution)

```typescript
export function backward(loss: Tensor): void {
  // 1. Validate — scalar tensor required
  // 2. Topological sort
  // 3. Initialize loss.grad = [1.0]
  // 4. Execute backwardFns in reverse order
}
```

#### Step 3: Basic Ops (`ops_basic.ts`) — ~250 lines

Each operation:
1. Validates input shapes
2. Computes forward result
3. If any input `requiresGrad`, creates `_ctx` with backward closure
4. Returns result Tensor

Backward closures capture necessary intermediates (e.g., `a.data`, `b.data` for matmul backward).

Operations: `add`, `multiply`, `matmul`, `sum`, `reshape`, `transpose`

#### Step 4: Activation Ops (`ops_activation.ts`) — ~150 lines

Same pattern as basic ops. Requires saved forward output for softmax backward.

Operations: `relu`, `softmax`

#### Step 5: Barrel Export + Integration (`index.ts`) — ~30 lines

```typescript
export { Tensor } from './Tensor';
export { backward } from './autograd';
export { add, multiply, matmul, sum, reshape, transpose } from './ops_basic';
export { relu, softmax } from './ops_activation';
```

Add one line to `src/lib/minimind/index.ts`:
```typescript
export { Tensor, backward, add, multiply, matmul, sum, reshape, transpose, relu, softmax } from './core';
```

#### Step 6: Tests — ~400 lines

**Gradient check (finite differences) is the primary verification method:**

```typescript
function gradientCheck(
  op: (x: Tensor) => Tensor,
  x: Tensor,
  epsilon = 1e-4,
  tolerance = 1e-4
): boolean {
  x.requiresGrad = true;
  const y = op(x);
  y.backward();

  const analytic = x.grad!;
  const numeric = new Float64Array(x.size);

  for (let i = 0; i < x.size; i++) {
    const orig = x.data[i];
    x.data[i] = orig + epsilon;
    const yPlus = op(x).item();
    x.data[i] = orig - epsilon;
    const yMinus = op(x).item();
    x.data[i] = orig;
    numeric[i] = (yPlus - yMinus) / (2 * epsilon);
  }

  // Check max absolute difference
  let maxDiff = 0;
  for (let i = 0; i < analytic.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(analytic[i] - numeric[i]));
  }
  return maxDiff < tolerance;
}
```

Test cases per operation:

| Operation | Test Cases |
|-----------|-----------|
| `add` | scalar+scalar, vector+vector, broadcast[1,3]+[2,3], gradient check |
| `multiply` | element-wise same shape, broadcast multiply, gradient check |
| `matmul` | [2,3]@[3,4], [1,5]@[5,1], gradient check on both inputs |
| `sum` | sum all, sum along dim=0, sum along dim=1, gradient check |
| `reshape` | [2,3]→[3,2], [2,3]→[6], round-trip, gradient check |
| `transpose` | [2,3]→[3,2], gradient check |
| `relu` | positive values (pass-through), negative values (zeroed), mixed, gradient check |
| `softmax` | uniform vector → uniform output, gradient check |

**Integration test:** Composite computation
```typescript
// a → matmul(W) → relu → sum → backward → verify gradients non-zero
const x = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);
const W = Tensor.randn([3, 2], true);
const h = matmul(x, W);
const a = relu(h);
const loss = sum(a);
loss.backward();
// W.grad should be non-zero (all elements should have gradients)
assert(W.grad !== null);
assert(W.grad!.some(v => v !== 0));
```

### 7.3 Verification Gate

All of these must pass before Phase 30 is considered complete:

- [ ] All 8 operations pass gradient check (finite differences, tolerance 1e-4)
- [ ] Composite forward (matmul → relu → sum) produces correct value
- [ ] Composite backward produces non-zero gradients for parameters
- [ ] Detached tensor does NOT receive gradients
- [ ] `requiresGrad=false` tensor does NOT accumulate gradients
- [ ] `npm run build` passes with zero warnings
- [ ] Existing Playground/AI Lab functionality unaffected (regression check)
- [ ] No modification to any existing file except `src/lib/minimind/index.ts` (add export line)

### 7.4 Estimated Effort

| Component | Lines | Difficulty | Time Estimate |
|-----------|-------|------------|---------------|
| `Tensor.ts` | ~200 | Medium — careful buffer management | 2-3 hours |
| `autograd.ts` | ~100 | Medium — topological sort edge cases | 1-2 hours |
| `ops_basic.ts` | ~250 | Medium — gradient formulas | 2-3 hours |
| `ops_activation.ts` | ~150 | Medium — softmax backward is subtle | 1-2 hours |
| `index.ts` files | ~30 | Trivial | 15 minutes |
| Tests | ~400 | High — gradient check correctness | 2-3 hours |
| **Total** | **~1,130** | | **8-13 hours** |

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Softmax backward formula error** | High | Derive and verify with 3 independent inputs; gradient check with finite differences is the authoritative test |
| **Memory: computation graph holds references** | Medium | Intermediate tensors with `requiresGrad=true` are kept alive by `_ctx.parents`. For educational-scale models (28M params, seqLen≤128), total graph memory is ~200MB — acceptable. Add `detach()` escape hatch. |
| **Float64Array vs number[][] mismatch** | Medium | `toArray()` and `fromArray()` handle conversion. In Phase 30, only tests use Tensor; no conversion needed in production code. |
| **Topological sort cycle detection** | Low | Our forward ops produce a DAG by construction (no in-place ops, no mutation). A cycle would indicate a bug in `_ctx` assignment. Add assertion in `buildTopoOrder` for debugging. |
| **Numerical precision (Float64Array)** | Low | Float64 gives 15-16 decimal digits; gradient check tolerance of 1e-4 is easily met. The current `number` type is IEEE 754 double = Float64 anyway. |
| **Inference overhead for non-training use** | None | Tensor is NOT used in inference path. Phase 30 does not modify any inference code. |
| **Build failures from barrel export** | Low | Single-line addition to `src/lib/minimind/index.ts`. No circular dependency possible (core/ depends on nothing in minimind/). |

---

## Appendix A: Comparison with Existing Systems

| Feature | PyTorch | tinygrad | micrograd | MiniMind Tensor (Phase 30) |
|---------|---------|----------|-----------|---------------------------|
| Data storage | ATen (C++) | RawBuffer (JS-like) | number (scalar) | Float64Array |
| Shape tracking | ✅ | ✅ | ❌ | ✅ |
| Computation graph | Dynamic | Lazy | Dynamic | Dynamic |
| Gradient accumulation | ✅ | ✅ | ✅ (in-place) | ✅ (functional) |
| Broadcasting | ✅ | ✅ | ❌ | ✅ (add, multiply) |
| Operator overloading | ✅ (Python) | ✅ (Python) | ✅ (Python) | ❌ (JS limitation) |
| GPU support | ✅ | ✅ | ❌ | ❌ (not planned) |

MiniMind Tensor is closest to **tinygrad** in spirit — a minimal, educational tensor library with real autograd, implemented in a high-level language without operator overloading.

---

## Appendix B: File Structure After Phase 30

```
src/lib/minimind/
├── attention/          ← UNCHANGED
├── embedding/          ← UNCHANGED
├── experiments/        ← UNCHANGED
├── ffn/                ← UNCHANGED
├── inference/          ← UNCHANGED
├── knowledge/          ← UNCHANGED
├── learning/           ← UNCHANGED
├── model/              ← UNCHANGED
├── pipeline/           ← UNCHANGED
├── pretrain/           ← UNCHANGED
├── rope/               ← UNCHANGED
├── tokenizer/          ← UNCHANGED
├── transformer/        ← UNCHANGED
├── visualization/      ← UNCHANGED
├── core/               ← NEW (Phase 30)
│   ├── Tensor.ts
│   ├── autograd.ts
│   ├── ops_basic.ts
│   ├── ops_activation.ts
│   └── index.ts
├── index.ts            ← MODIFIED (add 1 export line for core/*)
├── tsconfig.json       ← UNCHANGED
└── README.md           ← UNCHANGED
```

---

## Appendix C: Next Phase Preview (Phase 31)

Once Tensor + Autograd is verified, Phase 31 (Parameter Registry) will:

1. Create `core/ParameterRegistry.ts` with PyTorch-style `parameters()` API
2. Add optional `registry?` + `namePrefix?` parameters to existing module constructors
3. Modules internally create Tensor-backed parameters and register them
4. `MiniMindModel.parameters()` returns the unified parameter list
5. Training loop can call `optimizer.step(model.parameters())`

This is a mechanical integration step — all the hard math was done in Phase 30.
