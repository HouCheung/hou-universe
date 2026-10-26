// ============================================================
// Linear — Trainable linear layer (affine transformation)
// ============================================================
// The first full Module in MiniMind that bridges the Tensor
// autograd stack with a real trainable layer.
//
// PyTorch equivalent: nn.Linear(inFeatures, outFeatures, bias)
//
// Forward:
//   y = x @ W + b
//   where:
//     x: [batch, inFeatures]
//     W: [inFeatures, outFeatures]
//     b: [outFeatures] (optional, broadcast across batch)
//     y: [batch, outFeatures]
//
// Parameters (registered via Module):
//   - "weight": [inFeatures, outFeatures]
//   - "bias":   [outFeatures] (if bias=true)
//
// Initialization:
//   - Weight: scaled randn (Xavier/Glorot uniform-ish via N(0,std))
//     where std = sqrt(2 / (fan_in + fan_out))
//   - Bias: zeros
//
// Usage:
//   const layer = new Linear(512, 1000);
//   const x = Tensor.randn([4, 512]);  // batch of 4
//   const y = layer.forward(x);        // [4, 1000]
//
//   // Access parameters via Module API:
//   layer.parameters();        // → [weight, bias]
//   layer.namedParameters();   // → [{ name: "weight", ... }, { name: "bias", ... }]
//   layer.zeroGrad();          // → reset all gradients
// ============================================================

import { Module } from "./Module";
import { Parameter } from "./Parameter";
import { Tensor } from "./Tensor";
import { matmul } from "./ops/matmul";
import { add } from "./ops/add";

export class Linear extends Module {
  /** Number of input features */
  readonly inFeatures: number;
  /** Number of output features */
  readonly outFeatures: number;

  /** Weight matrix: [inFeatures, outFeatures] */
  private _weight: Parameter;
  /** Bias vector: [outFeatures] (undefined if bias=false) */
  private _bias?: Parameter;

  /**
   * @param inFeatures  - Input dimension
   * @param outFeatures - Output dimension
   * @param bias        - Whether to include a bias term (default true)
   */
  constructor(inFeatures: number, outFeatures: number, bias: boolean = true) {
    if (inFeatures <= 0) {
      throw new Error(`Linear: inFeatures must be positive, got ${inFeatures}`);
    }
    if (outFeatures <= 0) {
      throw new Error(`Linear: outFeatures must be positive, got ${outFeatures}`);
    }

    super();

    this.inFeatures = inFeatures;
    this.outFeatures = outFeatures;

    // ── Weight initialization (scaled Xavier) ──
    // std = sqrt(2 / (fan_in + fan_out)) — balances forward/backward variance
    const scale = Math.sqrt(2.0 / (inFeatures + outFeatures));
    const weightTensor = Tensor.randn([inFeatures, outFeatures]);
    for (let i = 0; i < weightTensor.data.length; i++) {
      weightTensor.data[i] *= scale;
    }
    this._weight = new Parameter(weightTensor, "weight");
    this.registerParameter("weight", this._weight);

    // ── Bias initialization (zeros) ──
    if (bias) {
      this._bias = new Parameter(Tensor.zeros([outFeatures]), "bias");
      this.registerParameter("bias", this._bias);
    }
  }

  /**
   * Forward pass: y = x @ W + b
   *
   * @param x - Input tensor [batch, inFeatures]
   * @returns Output tensor [batch, outFeatures]
   */
  forward(x: Tensor): Tensor {
    if (x.shape.length !== 2) {
      throw new Error(
        `Linear.forward: input must be 2D [batch, inFeatures]. ` +
          `Got shape [${x.shape}] (ndim=${x.shape.length}).`
      );
    }
    if (x.shape[1] !== this.inFeatures) {
      throw new Error(
        `Linear.forward: input dimension mismatch. ` +
          `Expected ${this.inFeatures} features, got ${x.shape[1]}.`
      );
    }

    // x @ W → [batch, outFeatures]
    const out = matmul(x, this._weight);

    // + bias (broadcast across batch)
    if (this._bias) {
      return add(out, this._bias);
    }
    return out;
  }

  /** Direct access to weight parameter */
  get weight(): Parameter {
    return this._weight;
  }

  /** Direct access to bias parameter (undefined if bias=false) */
  get bias(): Parameter | undefined {
    return this._bias;
  }
}
