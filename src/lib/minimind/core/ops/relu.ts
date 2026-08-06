// ============================================================
// relu — Rectified Linear Unit activation
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * ReLU activation: f(x) = max(0, x)
 *
 * Forward:  y_i = max(0, x_i)
 *
 * Backward: grad_x_i = grad_y_i * (x_i > 0 ? 1 : 0)
 *           i.e., gradient passes through for positive inputs, zero otherwise.
 *           At x_i = 0, the subgradient is 0 (consistent with most frameworks).
 */
export function relu(x: Tensor): Tensor {
  const size = shapeSize(x.shape);
  const result = new Float64Array(size);

  for (let i = 0; i < size; i++) {
    result[i] = x.data[i] > 0 ? x.data[i] : 0;
  }

  const out = new Tensor(result, [...x.shape], x.requiresGrad);

  if (out.requiresGrad) {
    // Save input data for backward (to check which elements were > 0)
    const inputData = new Float64Array(x.data);

    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        const gradInput = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          gradInput[i] = inputData[i] > 0 ? gradOutput[i] : 0;
        }
        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}
