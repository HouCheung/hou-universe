// ============================================================
// silu — Sigmoid Linear Unit (SiLU / Swish) activation
// ============================================================
// Formula: silu(x) = x * sigmoid(x) = x / (1 + exp(-x))
//
// Properties:
//   - Smooth, non-monotonic activation
//   - When x → +∞: silu(x) → x (approximately linear)
//   - When x → -∞: silu(x) → 0 (gated closed)
//   - Minimum at x ≈ -1.278, silu(x) ≈ -0.278
//
// Used in SwiGLU FFN as the gate activation.
//
// Forward:  y_i = x_i * sigmoid(x_i)
//
// Backward: d/dx silu(x) = sigmoid(x) + x * sigmoid(x) * (1 - sigmoid(x))
//                         = sigmoid(x) * (1 + x * (1 - sigmoid(x)))
//                         = y/x + sigmoid(x) * (1 - y/x)  … for x ≠ 0
//
// Simpler formulation:
//   Let s = sigmoid(x)
//   silu'(x) = s + x * s * (1 - s)
//            = s * (1 + x * (1 - s))
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * Numerically stable sigmoid: σ(x) = 1 / (1 + exp(-x))
 */
function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  } else {
    const expX = Math.exp(x);
    return expX / (1 + expX);
  }
}

/**
 * SiLU activation: f(x) = x * sigmoid(x)
 *
 * Applied element-wise to any tensor shape.
 *
 * @param x - Input tensor of any shape
 * @returns Output tensor of same shape, with SiLU applied element-wise
 */
export function silu(x: Tensor): Tensor {
  const size = shapeSize(x.shape);
  const result = new Float64Array(size);

  for (let i = 0; i < size; i++) {
    result[i] = x.data[i] * sigmoid(x.data[i]);
  }

  const out = new Tensor(result, [...x.shape], x.requiresGrad);

  if (out.requiresGrad) {
    // Save input data for backward pass
    const inputData = new Float64Array(x.data);

    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        const gradInput = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          const xi = inputData[i];
          const s = sigmoid(xi);
          // silu'(x) = s * (1 + x * (1 - s))
          const siluDerivative = s * (1 + xi * (1 - s));
          gradInput[i] = gradOutput[i] * siluDerivative;
        }
        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}
