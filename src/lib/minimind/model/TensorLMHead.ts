// ============================================================
// TensorLMHead — Tensor-backed Language Model Head
// ============================================================
// Phase 32: First model component migrated from number[][]
// to Tensor/Parameter/Module infrastructure.
//
// This is a PARALLEL implementation alongside the existing
// MiniLMHead (which uses raw number[][] weights). Both
// coexist; no existing code is modified or removed.
//
// Architecture:
//   TensorLMHead extends Module
//   └── Linear(hiddenDim, vocabSize, bias=false)
//
// Forward:
//   hidden [batch, hiddenDim]
//     → Linear projection
//     → logits [batch, vocabSize]
//
// Formula:
//   logits = hidden @ W
//   where W: [hiddenDim, vocabSize]
//
// Key differences from MiniLMHead:
//   1. Uses Tensor/Parameter/Module (autograd-ready)
//   2. Weight is a Parameter, not a raw number[][]
//   3. forward() returns Tensor, not number[]
//   4. Supports gradient computation via backward()
//   5. Weight stored as [hiddenDim, vocabSize] (transposed vs MiniLMHead)
//
// Usage:
//   const head = new TensorLMHead(1000, 512);
//   const hidden = Tensor.randn([4, 512]);
//   const logits = head.forward(hidden);  // Tensor([4, 1000])
//
//   // Training loop:
//   const loss = logits.sum();
//   loss.backward();
//   // head.linear.weight.grad now has gradients
// ============================================================

import { Module } from "../core/Module";
import { Tensor } from "../core/Tensor";
import { Linear } from "../core/Linear";

export class TensorLMHead extends Module {
  /** Vocabulary size (output dimension) */
  readonly vocabSize: number;
  /** Hidden state dimension (input dimension) */
  readonly hiddenDim: number;

  /** Internal linear projection: hiddenDim → vocabSize */
  private _linear: Linear;

  /**
   * @param vocabSize - Number of tokens in the vocabulary
   * @param hiddenDim - Dimension of hidden states
   */
  constructor(vocabSize: number, hiddenDim: number) {
    if (vocabSize <= 0) {
      throw new Error(
        `TensorLMHead: vocabSize must be positive, got ${vocabSize}`
      );
    }
    if (hiddenDim <= 0) {
      throw new Error(
        `TensorLMHead: hiddenDim must be positive, got ${hiddenDim}`
      );
    }

    super();

    this.vocabSize = vocabSize;
    this.hiddenDim = hiddenDim;

    // LM Head is a pure linear projection without bias
    this._linear = new Linear(hiddenDim, vocabSize, false);
    this.registerModule("linear", this._linear);
  }

  /**
   * Forward pass: project hidden states to vocabulary logits.
   *
   * @param hidden - Hidden state tensor [batch, hiddenDim]
   * @returns Logits tensor [batch, vocabSize]
   */
  forward(hidden: Tensor): Tensor {
    if (hidden.shape.length !== 2) {
      throw new Error(
        `TensorLMHead.forward: input must be 2D [batch, hiddenDim]. ` +
          `Got shape [${hidden.shape}] (ndim=${hidden.shape.length}).`
      );
    }
    if (hidden.shape[1] !== this.hiddenDim) {
      throw new Error(
        `TensorLMHead.forward: hidden dimension mismatch. ` +
          `Expected ${this.hiddenDim}, got ${hidden.shape[1]}.`
      );
    }

    return this._linear.forward(hidden);
  }

  /** Direct access to the underlying Linear module */
  get linear(): Linear {
    return this._linear;
  }
}
