// ============================================================
// TensorTransformerBlock — Differentiable Decoder Block
// ============================================================
// Phase 36: Composes TensorRMSNorm + TensorAttention + TensorFeedForward
// into a full Pre-Norm Decoder Block with residual connections.
//
// Architecture (Pre-Norm):
//   Input [B, T, D]
//     │
//     ├── RMSNorm ──→ Attention ──→ Residual Add (+) ←── x
//     │                                              │
//     ├── RMSNorm ──→ FFN       ──→ Residual Add (+) ←── x
//     │                                              │
//     └──→ Output [B, T, D]
//
// This is a NEW Tensor-backend implementation.
// It does NOT share code with MiniTransformerBlock (legacy number[][] path).
//
// Parameters (via composed sub-modules):
//   norm1.gamma                        [dModel]
//   attention.q_proj.weight            [dModel, dModel]
//   attention.k_proj.weight            [dModel, dModel]
//   attention.v_proj.weight            [dModel, dModel]
//   attention.o_proj.weight            [dModel, dModel]
//   norm2.gamma                        [dModel]
//   ffn.gate.weight                    [dFF, dModel]
//   ffn.up.weight                      [dFF, dModel]
//   ffn.down.weight                    [dModel, dFF]
//
// Total: 2*dModel + 4*dModel² + 3*dModel*dFF
//
// Usage:
//   const block = new TensorTransformerBlock({
//     dModel: 512, numHeads: 8, dFF: 2048, maxSeqLen: 256,
//   });
//   const x = Tensor.randn([4, 16, 512]); // [B, T, D]
//   const y = block.forward(x);            // [B, T, D]
//   y.backward(); // gradients flow through all sub-module params
// ============================================================

import { Module } from "../core/Module";
import { Tensor } from "../core/Tensor";
import { add } from "../core/ops/add";
import { TensorRMSNorm } from "./TensorRMSNorm";
import { TensorAttention } from "../attention/TensorAttention";
import { TensorFeedForward } from "../ffn/TensorFeedForward";

// ============================================================
// TensorTransformerBlock
// ============================================================

/**
 * Full Pre-Norm Decoder Block using the Tensor autograd backend.
 *
 * Extends Module, composing RMSNorm, Attention, and FeedForward
 * sub-modules with residual connections. All operations are fully
 * differentiable via the Tensor autograd engine.
 *
 * Usage:
 * ```ts
 * const block = new TensorTransformerBlock({
 *   dModel: 512, numHeads: 8, dFF: 2048, maxSeqLen: 256,
 * });
 * const x = Tensor.randn([2, 128, 512]); // [B, T, D]
 * const y = block.forward(x);            // [B, T, D]
 * y.backward();
 * ```
 */
export class TensorTransformerBlock extends Module {
  /** Model dimension */
  readonly dModel: number;
  /** Number of attention heads */
  readonly numHeads: number;
  /** Feed-forward hidden dimension */
  readonly dFF: number;
  /** Maximum sequence length (for reference / validation) */
  readonly maxSeqLen: number;

  /** Pre-Attention RMSNorm */
  readonly norm1: TensorRMSNorm;
  /** Multi-Head Self-Attention */
  readonly attention: TensorAttention;
  /** Pre-FFN RMSNorm */
  readonly norm2: TensorRMSNorm;
  /** SwiGLU Feed-Forward Network */
  readonly ffn: TensorFeedForward;

  /**
   * @param config.dModel    - Model dimension (must be divisible by numHeads)
   * @param config.numHeads  - Number of attention heads
   * @param config.dFF       - FFN hidden dimension (typically 4 * dModel)
   * @param config.maxSeqLen - Maximum sequence length (stored for reference)
   */
  constructor(config: {
    dModel: number;
    numHeads: number;
    dFF: number;
    maxSeqLen: number;
  }) {
    const { dModel, numHeads, dFF, maxSeqLen } = config;

    if (dModel <= 0) {
      throw new Error(
        `TensorTransformerBlock: dModel must be positive, got ${dModel}`
      );
    }
    if (numHeads <= 0) {
      throw new Error(
        `TensorTransformerBlock: numHeads must be positive, got ${numHeads}`
      );
    }
    if (dModel % numHeads !== 0) {
      throw new Error(
        `TensorTransformerBlock: dModel (${dModel}) must be divisible by numHeads (${numHeads})`
      );
    }
    if (dFF <= 0) {
      throw new Error(
        `TensorTransformerBlock: dFF must be positive, got ${dFF}`
      );
    }
    if (maxSeqLen <= 0) {
      throw new Error(
        `TensorTransformerBlock: maxSeqLen must be positive, got ${maxSeqLen}`
      );
    }

    super();

    this.dModel = dModel;
    this.numHeads = numHeads;
    this.dFF = dFF;
    this.maxSeqLen = maxSeqLen;

    // ── Sub-layer 1 components ──
    this.norm1 = new TensorRMSNorm(dModel);
    this.registerModule("norm1", this.norm1);

    this.attention = new TensorAttention({ dModel, numHeads });
    this.registerModule("attention", this.attention);

    // ── Sub-layer 2 components ──
    this.norm2 = new TensorRMSNorm(dModel);
    this.registerModule("norm2", this.norm2);

    this.ffn = new TensorFeedForward(dModel, dFF);
    this.registerModule("ffn", this.ffn);
  }

  /**
   * Forward pass: Pre-Norm Decoder Block.
   *
   * Steps:
   *   1. Pre-Attention RMSNorm → Multi-Head Self-Attention → Residual Add
   *   2. Pre-FFN RMSNorm → SwiGLU Feed-Forward → Residual Add
   *
   * All operations are Tensor ops — the full computation graph is
   * preserved for automatic differentiation.
   *
   * @param x    - Input tensor [B, T, D]
   * @param mask - Attention mask: "causal" (default) or null for no mask
   * @returns Output tensor [B, T, D] with full autograd support
   */
  forward(x: Tensor, mask?: "causal" | null): Tensor {
    // ── Validate input ──
    if (x.shape.length !== 3) {
      throw new Error(
        `TensorTransformerBlock.forward: input must be 3D [B, T, D]. ` +
          `Got shape [${x.shape}].`
      );
    }
    if (x.shape[2] !== this.dModel) {
      throw new Error(
        `TensorTransformerBlock.forward: last dim must be dModel=${this.dModel}. ` +
          `Got ${x.shape[2]}.`
      );
    }

    // ============================================================
    // Sub-layer 1: Attention (Pre-Norm)
    // ============================================================
    // y1 = x + Attention(Norm1(x))

    const normed1 = this.norm1.forward(x);              // [B, T, D]
    const attnOut = this.attention.forward(normed1, mask); // [B, T, D]
    const residual1 = add(x, attnOut);                   // [B, T, D]

    // ============================================================
    // Sub-layer 2: FFN (Pre-Norm)
    // ============================================================
    // y2 = residual1 + FFN(Norm2(residual1))

    const normed2 = this.norm2.forward(residual1);       // [B, T, D]
    const ffnOut = this.ffn.forward(normed2);            // [B, T, D]
    const output = add(residual1, ffnOut);               // [B, T, D]

    return output;
  }
}
