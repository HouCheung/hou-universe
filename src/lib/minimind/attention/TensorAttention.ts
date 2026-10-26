// ============================================================
// TensorAttention — Multi-Head Self-Attention with Tensor autograd
// ============================================================
// Phase 35: Differentiable attention module using the Tensor backend.
//
// Architecture:
//   Input [B, T, D]
//     → Q/K/V Projection (Linear, no bias)
//     → Split heads [B, H, T, Dh]
//     → Q @ K^T (batch matmul)
//     → Scale by 1/√Dh
//     → Causal mask
//     → Softmax along last dim
//     → Attention @ V (batch matmul)
//     → Merge heads
//     → Output Projection (Linear, no bias)
//     → Output [B, T, D]
//
// Parameters: 4 × D² (Q, K, V, O weight matrices, no bias)
//
// This is a NEW Tensor-backend implementation.
// It does NOT share code with MiniAttention (legacy number[][] path).
// ============================================================

import { Module } from "../core/Module";
import { Linear } from "../core/Linear";
import { Tensor } from "../core/Tensor";
import { reshape } from "../core/ops/reshape";
import { transpose } from "../core/ops/transpose";
import { batchMatmul } from "../core/ops/batchMatmul";
import { multiply } from "../core/ops/multiply";
import { softmax } from "../core/ops/softmax";
import { causalMask } from "../core/ops/causalMask";

// ============================================================
// TensorAttention
// ============================================================

/**
 * Multi-Head Self-Attention layer using the Tensor autograd backend.
 *
 * Extends Module, composing 4 Linear sub-modules with Tensor ops
 * to implement the full attention mechanism with gradient support.
 *
 * Usage:
 * ```ts
 * const attn = new TensorAttention({ dModel: 512, numHeads: 8 });
 * const x = Tensor.randn([2, 128, 512]); // [B, T, D]
 * const y = attn.forward(x);             // [B, T, D]
 * y.backward(); // gradients flow through all 4 Linear weights
 * ```
 */
export class TensorAttention extends Module {
  /** Model dimension */
  readonly dModel: number;
  /** Number of attention heads */
  readonly numHeads: number;
  /** Dimension per head (dModel / numHeads) */
  readonly headDim: number;

  /** Query projection: Linear(D, D, bias=false) */
  readonly q_proj: Linear;
  /** Key projection: Linear(D, D, bias=false) */
  readonly k_proj: Linear;
  /** Value projection: Linear(D, D, bias=false) */
  readonly v_proj: Linear;
  /** Output projection: Linear(D, D, bias=false) */
  readonly o_proj: Linear;

  /**
   * @param config.dModel   - Model dimension (must be divisible by numHeads)
   * @param config.numHeads - Number of attention heads
   */
  constructor(config: { dModel: number; numHeads: number }) {
    const { dModel, numHeads } = config;

    if (dModel <= 0) {
      throw new Error(`TensorAttention: dModel must be positive, got ${dModel}`);
    }
    if (numHeads <= 0) {
      throw new Error(`TensorAttention: numHeads must be positive, got ${numHeads}`);
    }
    if (dModel % numHeads !== 0) {
      throw new Error(
        `TensorAttention: dModel (${dModel}) must be divisible by numHeads (${numHeads})`
      );
    }

    super();

    this.dModel = dModel;
    this.numHeads = numHeads;
    this.headDim = dModel / numHeads;

    // ── Create sub-modules (no bias, like standard Transformer attention) ──
    this.q_proj = new Linear(dModel, dModel, false);
    this.registerModule("q_proj", this.q_proj);

    this.k_proj = new Linear(dModel, dModel, false);
    this.registerModule("k_proj", this.k_proj);

    this.v_proj = new Linear(dModel, dModel, false);
    this.registerModule("v_proj", this.v_proj);

    this.o_proj = new Linear(dModel, dModel, false);
    this.registerModule("o_proj", this.o_proj);
  }

  /**
   * Forward pass.
   *
   * @param x    - Input tensor [B, T, D]
   * @param mask - Attention mask type: "causal" (default) or null for no mask
   * @returns Output tensor [B, T, D] with full autograd support
   */
  forward(x: Tensor, mask?: "causal" | null): Tensor {
    // ── Validate input ──
    if (x.shape.length !== 3) {
      throw new Error(
        `TensorAttention.forward: input must be 3D [B, T, D]. ` +
          `Got shape [${x.shape}].`
      );
    }
    if (x.shape[2] !== this.dModel) {
      throw new Error(
        `TensorAttention.forward: last dim must be dModel=${this.dModel}. ` +
          `Got ${x.shape[2]}.`
      );
    }

    const B = x.shape[0];
    const T = x.shape[1];
    const D = this.dModel;
    const H = this.numHeads;
    const Dh = this.headDim;

    // ============================================================
    // Step 1: Q/K/V Projections
    // ============================================================
    // Linear only accepts 2D [batch, features], so flatten [B,T,D] → [B*T, D]

    const xFlat = reshape(x, -1, D); // [B*T, D]

    const qFlat = this.q_proj.forward(xFlat); // [B*T, D]
    const kFlat = this.k_proj.forward(xFlat); // [B*T, D]
    const vFlat = this.v_proj.forward(xFlat); // [B*T, D]

    const Q = reshape(qFlat, B, T, D); // [B, T, D]
    const K = reshape(kFlat, B, T, D); // [B, T, D]
    const V = reshape(vFlat, B, T, D); // [B, T, D]

    // ============================================================
    // Step 2: Split into heads
    // ============================================================
    // [B, T, D] → [B, T, H, Dh] → transpose(1,2) → [B, H, T, Dh]

    const qHeads = reshape(Q, B, T, H, Dh);
    const q4d = transpose(qHeads, 1, 2); // [B, H, T, Dh]

    const kHeads = reshape(K, B, T, H, Dh);
    const k4d = transpose(kHeads, 1, 2); // [B, H, T, Dh]

    const vHeads = reshape(V, B, T, H, Dh);
    const v4d = transpose(vHeads, 1, 2); // [B, H, T, Dh]

    // ============================================================
    // Step 3: Q @ K^T  (batch matmul)
    // ============================================================
    // Q: [B, H, T, Dh], K^T: [B, H, Dh, T] → scores: [B, H, T, T]

    const kTransposed = transpose(k4d, -2, -1); // [B, H, Dh, T]
    let scores = batchMatmul(q4d, kTransposed); // [B, H, T, T]

    // ============================================================
    // Step 4: Scale by 1 / sqrt(headDim)
    // ============================================================
    const scaleFactor = Tensor.scalar(1.0 / Math.sqrt(Dh));
    scores = multiply(scores, scaleFactor);

    // ============================================================
    // Step 5: Apply causal mask
    // ============================================================
    if (mask !== null) {
      scores = causalMask(scores);
    }

    // ============================================================
    // Step 6: Softmax along last dim (per query position, per head)
    // ============================================================
    const attnWeights = softmax(scores, -1); // [B, H, T, T]

    // ============================================================
    // Step 7: Attention output = attnWeights @ V
    // ============================================================
    // attnWeights: [B, H, T, T] @ V: [B, H, T, Dh] → [B, H, T, Dh]

    const attnOutput = batchMatmul(attnWeights, v4d); // [B, H, T, Dh]

    // ============================================================
    // Step 8: Merge heads
    // ============================================================
    // [B, H, T, Dh] → transpose(1,2) → [B, T, H, Dh] → reshape → [B, T, D]

    const merged4d = transpose(attnOutput, 1, 2); // [B, T, H, Dh]
    const merged = reshape(merged4d, B, T, D); // [B, T, D]

    // ============================================================
    // Step 9: Output projection
    // ============================================================

    const mergedFlat = reshape(merged, -1, D); // [B*T, D]
    const outputFlat = this.o_proj.forward(mergedFlat); // [B*T, D]
    const output = reshape(outputFlat, B, T, D); // [B, T, D]

    return output;
  }
}
