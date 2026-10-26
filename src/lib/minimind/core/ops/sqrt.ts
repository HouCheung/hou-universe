// ============================================================
// sqrt — Element-wise square root
// ============================================================
// Formula: y = sqrt(x)
//
// Backward:
//   d/dx sqrt(x) = 1 / (2 * sqrt(x)) = 1 / (2 * out)
//   grad_x = gradOutput / (2 * out)
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * Element-wise square root.
 *
 * @param x - Input tensor of any shape (all values must be >= 0)
 * @returns Output tensor of same shape, with sqrt applied element-wise
 */
export function sqrt(x: Tensor): Tensor {
  const size = shapeSize(x.shape);
  const result = new Float64Array(size);

  for (let i = 0; i < size; i++) {
    if (x.data[i] < 0) {
      throw new Error(
        `sqrt: negative input value ${x.data[i]} at index ${i}. ` +
          `All input values must be >= 0.`
      );
    }
    result[i] = Math.sqrt(x.data[i]);
  }

  const out = new Tensor(result, [...x.shape], x.requiresGrad);

  if (out.requiresGrad) {
    // Save output data for backward (used as 1/(2*out))
    const outData = new Float64Array(result);

    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        const gradInput = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          // d/dx sqrt(x) = 1 / (2 * sqrt(x))
          // Guard against sqrt(0) → infinite gradient
          if (outData[i] > 1e-15) {
            gradInput[i] = gradOutput[i] / (2 * outData[i]);
          } else {
            // At x=0, sqrt'(0) is infinite; use a large finite value
            gradInput[i] = gradOutput[i] * 1e10;
          }
        }
        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}
