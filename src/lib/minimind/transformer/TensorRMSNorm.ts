// ============================================================
// TensorRMSNorm — Differentiable RMS Normalization layer
// ============================================================
// Extends Module. Implements RMS Normalization using Tensor
// autograd operations — the foundation for Transformer blocks.
//
// Formula:
//   RMSNorm(x) = x / sqrt(mean(x²) + eps) * gamma
//
// Where:
//   x:     [batch, seq, dModel]
//   gamma: [dModel] — learnable scale parameter
//   eps:   small constant for numerical stability
//
// This replaces MiniRMSNorm (legacy number[][] implementation)
// in the Tensor-based Transformer pipeline.
//
// Parameters (1):
//   - gamma: [dModel] — initialized to all 1.0
//
// PyTorch equivalent: nn.RMSNorm(dModel, eps=eps)
//
// Usage:
//   const norm = new TensorRMSNorm(512, 1e-6);
//   const x = Tensor.randn([4, 16, 512]); // [batch, seq, dModel]
//   const y = norm.forward(x);             // [4, 16, 512]
// ============================================================

import { Module } from "../core/Module";
import { Parameter } from "../core/Parameter";
import { Tensor } from "../core/Tensor";
import { multiply } from "../core/ops/multiply";
import { add } from "../core/ops/add";
import { sum } from "../core/ops/sum";
import { sqrt } from "../core/ops/sqrt";
import { divide } from "../core/ops/divide";

export class TensorRMSNorm extends Module {
  /** Model dimension (the last dimension of input tensors) */
  readonly dModel: number;
  /** Epsilon for numerical stability */
  readonly eps: number;

  /** Learnable scale parameter: [dModel] */
  private _gamma: Parameter;

  /**
   * @param dModel - Dimension of the input features (last axis)
   * @param eps    - Small constant for numerical stability (default 1e-6)
   */
  constructor(dModel: number, eps: number = 1e-6) {
    if (dModel <= 0) {
      throw new Error(`TensorRMSNorm: dModel must be positive, got ${dModel}`);
    }
    if (eps <= 0) {
      throw new Error(`TensorRMSNorm: eps must be positive, got ${eps}`);
    }

    super();

    this.dModel = dModel;
    this.eps = eps;

    // gamma initialized to all 1.0 — no scaling initially, pure normalization
    this._gamma = new Parameter(Tensor.ones([dModel]), "gamma");
    this.registerParameter("gamma", this._gamma);
  }

  /**
   * Forward pass: RMS Normalization.
   *
   * Computation graph (all autograd-tracked):
   *   1. x²                    → multiply(x, x)
   *   2. mean(x²) along last dim → sum(…, -1) * (1/D)
   *   3. + eps                 → add(…, eps)
   *   4. sqrt(…)               → sqrt(…)
   *   5. x / rms               → divide(x, rms)
   *   6. * gamma               → multiply(…, gamma)
   *
   * @param x - Input tensor [batch, seq, dModel]
   * @returns Normalized tensor [batch, seq, dModel]
   */
  forward(x: Tensor): Tensor {
    const shape = x.shape;

    if (shape.length !== 3) {
      throw new Error(
        `TensorRMSNorm.forward: input must be 3D [batch, seq, dModel]. ` +
          `Got shape [${shape}] (ndim=${shape.length}).`
      );
    }
    if (shape[2] !== this.dModel) {
      throw new Error(
        `TensorRMSNorm.forward: input dim mismatch. ` +
          `Expected dModel=${this.dModel}, got ${shape[2]}.`
      );
    }

    const D = this.dModel;

    // Step 1: x² — element-wise square
    const xSq = multiply(x, x); // [B, T, D]

    // Step 2: mean(x²) along last dimension
    const sumXsq = sum(xSq, -1); // [B, T] — sum along last dim
    const invD = Tensor.scalar(1.0 / D);
    const meanXsq = multiply(sumXsq, invD); // [B, T] — mean = sum / D

    // Step 3: add epsilon
    const epsTensor = Tensor.scalar(this.eps);
    const meanXsqEps = add(meanXsq, epsTensor); // [B, T]

    // Step 4: sqrt — RMS = sqrt(mean(x²) + eps)
    const rms = sqrt(meanXsqEps); // [B, T]

    // Step 5: normalize — x / RMS (broadcast over last dim)
    const normalized = divide(x, rms); // [B, T, D]

    // Step 6: scale by gamma — broadcast gamma over batch and seq dims
    const output = multiply(normalized, this._gamma); // [B, T, D]

    return output;
  }

  /** Direct access to gamma parameter */
  get gamma(): Parameter {
    return this._gamma;
  }
}
