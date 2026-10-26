// ============================================================
// MiniMind Core — Initialization.ts
// ============================================================
// Weight initialization utilities for training stability.
//
// Provides factory functions for common weight initialization
// schemes used in transformer/GPT training:
//
//   - xavierUniform / xavierNormal  — Glorot initialization
//   - kaimingUniform / kaimingNormal — He initialization (ReLU-friendly)
//   - normal / uniform               — Basic random initialization
//   - zeros / ones                    — Constant initialization
//
// Usage:
//   const weight = Initialization.xavierUniform([inDim, outDim]);
//   const param = Parameter.of([inDim, outDim], "weight", init);
// ============================================================

import { Random } from "./random/Random";

/**
 * Initializer function type.
 * Takes a shape and returns a Float64Array with initialized values.
 */
export type Initializer = (shape: number[]) => Float64Array;

/**
 * Compute the total number of elements for a given shape.
 */
function numel(shape: number[]): number {
  return shape.reduce((a, b) => a * b, 1);
}

// ============================================================
// Initialization utilities
// ============================================================

export const Initialization = {
  /**
   * Xavier (Glorot) uniform initialization.
   *
   * Draws from U(-a, a) where a = sqrt(6 / (fanIn + fanOut)).
   * Best for layers with symmetric activations (tanh, linear).
   *
   * @param shape — Parameter shape [fanIn, fanOut] for Linear layers
   */
  xavierUniform(shape: number[]): Float64Array {
    const n = numel(shape);
    const fanIn = shape[0];
    const fanOut = shape.length >= 2 ? shape[shape.length - 1] : 1;
    const limit = Math.sqrt(6 / (fanIn + fanOut));
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      data[i] = (Random.random() * 2 - 1) * limit;
    }
    return data;
  },

  /**
   * Xavier (Glorot) normal initialization.
   *
   * Draws from N(0, std) where std = sqrt(2 / (fanIn + fanOut)).
   * Best for layers with symmetric activations.
   */
  xavierNormal(shape: number[]): Float64Array {
    const n = numel(shape);
    const fanIn = shape[0];
    const fanOut = shape.length >= 2 ? shape[shape.length - 1] : 1;
    const std = Math.sqrt(2 / (fanIn + fanOut));
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      data[i] = Random.randn() * std;
    }
    return data;
  },

  /**
   * Kaiming (He) uniform initialization.
   *
   * Draws from U(-a, a) where a = sqrt(6 / fanIn).
   * Best for ReLU and variants (leaky ReLU, SiLU).
   *
   * @param shape — Parameter shape
   * @param fanIn — Optional fan-in override (defaults to shape[0])
   */
  kaimingUniform(shape: number[], fanIn?: number): Float64Array {
    const n = numel(shape);
    const fan = fanIn ?? shape[0];
    const limit = Math.sqrt(6 / fan);
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      data[i] = (Random.random() * 2 - 1) * limit;
    }
    return data;
  },

  /**
   * Kaiming (He) normal initialization.
   *
   * Draws from N(0, std) where std = sqrt(2 / fanIn).
   * Best for ReLU and variants.
   */
  kaimingNormal(shape: number[], fanIn?: number): Float64Array {
    const n = numel(shape);
    const fan = fanIn ?? shape[0];
    const std = Math.sqrt(2 / fan);
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      data[i] = Random.randn() * std;
    }
    return data;
  },

  /**
   * Normal (Gaussian) initialization.
   *
   * Draws from N(0, std).
   */
  normal(shape: number[], std: number = 1.0): Float64Array {
    const n = numel(shape);
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      data[i] = Random.randn() * std;
    }
    return data;
  },

  /**
   * Uniform initialization.
   *
   * Draws from U(-limit, limit).
   */
  uniform(shape: number[], limit: number = 1.0): Float64Array {
    const n = numel(shape);
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      data[i] = (Random.random() * 2 - 1) * limit;
    }
    return data;
  },

  /** Zero initialization. Good for biases. */
  zeros(shape: number[]): Float64Array {
    return new Float64Array(numel(shape));
  },

  /** Ones initialization. */
  ones(shape: number[]): Float64Array {
    const data = new Float64Array(numel(shape));
    data.fill(1.0);
    return data;
  },

  /**
   * Scaled embedding initialization.
   *
   * N(0, dModel^(-0.5)) — commonly used for embedding layers
   * in transformer models (GPT-2 style).
   */
  embedding(shape: number[], dModel: number): Float64Array {
    return Initialization.normal(shape, dModel ** -0.5);
  },

  /**
   * Small constant initialization for LayerNorm/RMSNorm gamma.
   * Usually initialized to ones.
   */
  normGamma(dim: number): Float64Array {
    return Initialization.ones([dim]);
  },
};
