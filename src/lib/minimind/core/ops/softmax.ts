// ============================================================
// softmax — Softmax activation along a dimension
// ============================================================
// Phase 30 supports 1D and 2D tensors with softmax along last dim.
// Phase 35 extends to N-D tensors along the last dimension.
//
// Forward:  s_i = exp(x_i - max(x)) / Σ_j exp(x_j - max(x))
//
// Backward derivation:
//   Jacobian J_ij = ∂s_i/∂x_j = s_i * (δ_ij - s_j)
//   dL/dx_j = Σ_i dL/ds_i * ∂s_i/∂x_j
//           = s_j * (dL/ds_j - Σ_i dL/ds_i * s_i)
//           = s_j * (dL/ds_j - dot(s, dL/ds))
//
//   So: gradInput = softmaxOut * (gradOutput - dot(softmaxOut, gradOutput))
// ============================================================

import { Tensor } from "../Tensor";

/**
 * Softmax along a dimension.
 *
 * @param x   - Input tensor
 * @param dim - Dimension to apply softmax along (default: -1, last dim)
 */
export function softmax(x: Tensor, dim: number = -1): Tensor {
  const ndim = x.shape.length;
  const resolvedDim = dim < 0 ? ndim + dim : dim;

  if (ndim === 0) {
    // Scalar: softmax(scalar) = 1.0
    const out = new Tensor(new Float64Array([1.0]), [], x.requiresGrad);
    if (out.requiresGrad) {
      out._ctx = {
        parents: [x],
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        backwardFn: (_gradOutput: Float64Array) => {
          x.accumulateGrad(new Float64Array([0])); // derivative of constant 1 is 0
        },
      };
    }
    return out;
  }

  if (ndim === 1) {
    return _softmax1D(x);
  }

  if (ndim === 2 && resolvedDim === 1) {
    return _softmax2DLastDim(x);
  }

  // ── N-D softmax along last dim (Phase 35) ──
  // Generalizes to any number of dimensions by treating all dims
  // except the last as batch (row) dimensions.
  if (resolvedDim === ndim - 1) {
    return _softmaxNDLastDim(x);
  }

  throw new Error(
    `softmax: unsupported configuration — shape [${x.shape}] with dim=${dim}. ` +
      `Only softmax along the last dimension is supported for 3D+ tensors.`
  );
}

/** 1D softmax */
function _softmax1D(x: Tensor): Tensor {
  const n = x.shape[0];

  // Numerical stability: subtract max
  let maxVal = x.data[0];
  for (let i = 1; i < n; i++) {
    if (x.data[i] > maxVal) maxVal = x.data[i];
  }

  const expVals = new Float64Array(n);
  let sumExp = 0;
  for (let i = 0; i < n; i++) {
    expVals[i] = Math.exp(x.data[i] - maxVal);
    sumExp += expVals[i];
  }

  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = expVals[i] / sumExp;
  }

  const out = new Tensor(result, [n], x.requiresGrad);

  if (out.requiresGrad) {
    // Save softmax output for backward
    const softmaxOut = new Float64Array(result);

    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        // Compute dot(softmaxOut, gradOutput)
        let dot = 0;
        for (let i = 0; i < n; i++) {
          dot += softmaxOut[i] * gradOutput[i];
        }

        // gradInput = softmaxOut * (gradOutput - dot)
        const gradInput = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          gradInput[i] = softmaxOut[i] * (gradOutput[i] - dot);
        }

        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}

/** 2D softmax along last dimension (applied per row) */
function _softmax2DLastDim(x: Tensor): Tensor {
  const rows = x.shape[0];
  const cols = x.shape[1];
  const result = new Float64Array(rows * cols);

  for (let r = 0; r < rows; r++) {
    const rowOffset = r * cols;

    // Find max in this row
    let maxVal = x.data[rowOffset];
    for (let c = 1; c < cols; c++) {
      if (x.data[rowOffset + c] > maxVal) maxVal = x.data[rowOffset + c];
    }

    // Compute exp and sum
    let sumExp = 0;
    const expVals = new Float64Array(cols);
    for (let c = 0; c < cols; c++) {
      expVals[c] = Math.exp(x.data[rowOffset + c] - maxVal);
      sumExp += expVals[c];
    }

    // Normalize
    for (let c = 0; c < cols; c++) {
      result[rowOffset + c] = expVals[c] / sumExp;
    }
  }

  const out = new Tensor(result, [rows, cols], x.requiresGrad);

  if (out.requiresGrad) {
    const softmaxOut = new Float64Array(result);

    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        const gradInput = new Float64Array(rows * cols);

        for (let r = 0; r < rows; r++) {
          const rowOffset = r * cols;

          // Compute dot(softmaxOut[row], gradOutput[row])
          let dot = 0;
          for (let c = 0; c < cols; c++) {
            dot += softmaxOut[rowOffset + c] * gradOutput[rowOffset + c];
          }

          // gradInput = softmaxOut * (gradOutput - dot)
          for (let c = 0; c < cols; c++) {
            gradInput[rowOffset + c] =
              softmaxOut[rowOffset + c] * (gradOutput[rowOffset + c] - dot);
          }
        }

        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}

/**
 * N-D softmax along last dimension.
 *
 * Treats all dimensions except the last as batch dimensions.
 * For shape [D1, D2, ..., Dn], applies softmax independently along
 * each "row" of size Dn. There are (D1 * D2 * ... * D_{n-1}) such rows.
 */
function _softmaxNDLastDim(x: Tensor): Tensor {
  const shape = x.shape;
  const ndim = shape.length;
  const lastDim = shape[ndim - 1];

  // Number of "rows" = product of all dims except last
  let numRows = 1;
  for (let i = 0; i < ndim - 1; i++) {
    numRows *= shape[i];
  }

  const totalSize = numRows * lastDim;
  const result = new Float64Array(totalSize);

  for (let r = 0; r < numRows; r++) {
    const rowOffset = r * lastDim;

    // Find max in this row
    let maxVal = x.data[rowOffset];
    for (let c = 1; c < lastDim; c++) {
      if (x.data[rowOffset + c] > maxVal) maxVal = x.data[rowOffset + c];
    }

    // Compute exp and sum
    let sumExp = 0;
    const expVals = new Float64Array(lastDim);
    for (let c = 0; c < lastDim; c++) {
      expVals[c] = Math.exp(x.data[rowOffset + c] - maxVal);
      sumExp += expVals[c];
    }

    // Normalize
    for (let c = 0; c < lastDim; c++) {
      result[rowOffset + c] = expVals[c] / sumExp;
    }
  }

  const out = new Tensor(result, [...shape], x.requiresGrad);

  if (out.requiresGrad) {
    const softmaxOut = new Float64Array(result);

    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        const gradInput = new Float64Array(totalSize);

        for (let r = 0; r < numRows; r++) {
          const rowOffset = r * lastDim;

          // Compute dot(softmaxOut[row], gradOutput[row])
          let dot = 0;
          for (let c = 0; c < lastDim; c++) {
            dot += softmaxOut[rowOffset + c] * gradOutput[rowOffset + c];
          }

          // gradInput = softmaxOut * (gradOutput - dot)
          for (let c = 0; c < lastDim; c++) {
            gradInput[rowOffset + c] =
              softmaxOut[rowOffset + c] * (gradOutput[rowOffset + c] - dot);
          }
        }

        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}
