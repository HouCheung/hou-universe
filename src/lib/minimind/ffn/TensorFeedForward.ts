// ============================================================
// TensorFeedForward — Differentiable SwiGLU FFN layer
// ============================================================
// Extends Module. Implements the standard SwiGLU feed-forward
// network used in LLaMA/MiniMind architectures.
//
// Structure:
//   input [batch, seq, dModel]
//     │
//     ├──→ gate Linear (dModel → dFF) → SiLU ──┐
//     │                                          ├──→ ⊙ → down Linear → output
//     └──→ up Linear   (dModel → dFF) ──────────┘
//
// Parameters (3 Linear sub-modules, no bias):
//   - gate: Linear(dModel, dFF, bias=false)
//   - up:   Linear(dModel, dFF, bias=false)
//   - down: Linear(dFF, dModel, bias=false)
//
// Total parameters: 3 * dModel * dFF
//
// Usage:
//   const ffn = new TensorFeedForward(512, 2048);
//   const x = Tensor.randn([4, 16, 512]); // [batch, seq, dModel]
//   const y = ffn.forward(x);              // [4, 16, 512]
// ============================================================

import { Module } from "../core/Module";
import { Tensor } from "../core/Tensor";
import { Linear } from "../core/Linear";
import { silu } from "../core/ops/silu";
import { multiply } from "../core/ops/multiply";
import { reshape } from "../core/ops/reshape";

export class TensorFeedForward extends Module {
  /** Model dimension (input/output dimension) */
  readonly dModel: number;
  /** Feed-forward hidden dimension (typically 4 * dModel) */
  readonly dFF: number;

  /** Gate projection: dModel → dFF */
  private _gate: Linear;
  /** Up projection: dModel → dFF */
  private _up: Linear;
  /** Down projection: dFF → dModel */
  private _down: Linear;

  /**
   * @param dModel - Model dimension (input/output)
   * @param dFF    - FFN hidden dimension (expansion factor, typically 4x dModel)
   */
  constructor(dModel: number, dFF: number) {
    if (dModel <= 0) {
      throw new Error(`TensorFeedForward: dModel must be positive, got ${dModel}`);
    }
    if (dFF <= 0) {
      throw new Error(`TensorFeedForward: dFF must be positive, got ${dFF}`);
    }

    super();

    this.dModel = dModel;
    this.dFF = dFF;

    // ── Gate projection: expands dModel → dFF, no bias ──
    this._gate = new Linear(dModel, dFF, false);
    this.registerModule("gate", this._gate);

    // ── Up projection: expands dModel → dFF, no bias ──
    this._up = new Linear(dModel, dFF, false);
    this.registerModule("up", this._up);

    // ── Down projection: compresses dFF → dModel, no bias ──
    this._down = new Linear(dFF, dModel, false);
    this.registerModule("down", this._down);
  }

  /**
   * Forward pass: SwiGLU FFN.
   *
   * @param x - Input tensor [batch, seq, dModel]
   * @returns Output tensor [batch, seq, dModel]
   */
  forward(x: Tensor): Tensor {
    const shape = x.shape;

    if (shape.length !== 3) {
      throw new Error(
        `TensorFeedForward.forward: input must be 3D [batch, seq, dModel]. ` +
          `Got shape [${shape}] (ndim=${shape.length}).`
      );
    }
    if (shape[2] !== this.dModel) {
      throw new Error(
        `TensorFeedForward.forward: input dim mismatch. ` +
          `Expected dModel=${this.dModel}, got ${shape[2]}.`
      );
    }

    const batch = shape[0];
    const seq = shape[1];

    // ── Reshape 3D → 2D for Linear layers ──
    // [batch, seq, dModel] → [batch*seq, dModel]
    const x2d = reshape(x, batch * seq, this.dModel);

    // ── Gate branch: project + SiLU activate ──
    // gate_out: [batch*seq, dFF]
    const gateOut = this._gate.forward(x2d);
    // gate_act: [batch*seq, dFF] with SiLU applied
    const gateAct = silu(gateOut);

    // ── Up branch: project (no activation) ──
    // up_out: [batch*seq, dFF]
    const upOut = this._up.forward(x2d);

    // ── Element-wise gate: SiLU(gate) ⊙ up ──
    // gated: [batch*seq, dFF]
    const gated = multiply(gateAct, upOut);

    // ── Down projection: compress back to dModel ──
    // down_out: [batch*seq, dModel]
    const downOut = this._down.forward(gated);

    // ── Reshape back to 3D ──
    // [batch*seq, dModel] → [batch, seq, dModel]
    const output = reshape(downOut, batch, seq, this.dModel);

    return output;
  }

  /** Direct access to gate Linear layer */
  get gate(): Linear {
    return this._gate;
  }

  /** Direct access to up Linear layer */
  get up(): Linear {
    return this._up;
  }

  /** Direct access to down Linear layer */
  get down(): Linear {
    return this._down;
  }
}
