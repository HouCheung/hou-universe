// ============================================================
// sum — Reduction along specified dimension
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * Sum tensor elements, optionally along a specific dimension.
 *
 * @param x   - Input tensor
 * @param dim - Dimension to reduce along (negative indexing supported).
 *              If undefined, sums all elements to a scalar.
 *
 * Backward:
 *  Scalar sum:   grad_x = broadcast(gradOutput, x.shape) — fill with scalar grad
 *  Dim sum:      grad_x = expand gradOutput along the reduced dimension
 */
export function sum(x: Tensor, dim?: number): Tensor {
  if (dim === undefined) {
    return _sumAll(x);
  }
  return _sumAlongDim(x, dim);
}

/** Sum all elements → scalar */
function _sumAll(x: Tensor): Tensor {
  let total = 0;
  for (let i = 0; i < x.data.length; i++) {
    total += x.data[i];
  }

  const out = new Tensor(new Float64Array([total]), [], x.requiresGrad);

  if (out.requiresGrad) {
    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        // Broadcast scalar gradient to input shape
        const gradInput = new Float64Array(x.data.length);
        gradInput.fill(gradOutput[0]);
        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}

/** Sum along a specific dimension */
function _sumAlongDim(x: Tensor, dim: number): Tensor {
  const ndim = x.shape.length;
  const resolvedDim = dim < 0 ? ndim + dim : dim;

  if (resolvedDim < 0 || resolvedDim >= ndim) {
    throw new Error(
      `sum: dimension ${dim} out of range for shape [${x.shape}] (ndim=${ndim})`
    );
  }

  // Compute output shape (remove the summed dimension)
  const outShape = x.shape.filter((_, i) => i !== resolvedDim);
  const outSize = shapeSize(outShape);

  const result = new Float64Array(outSize);

  // The dimension being summed over
  const sumDimSize = x.shape[resolvedDim];

  // Stride of the summed dimension
  let sumDimStride = 1;
  for (let i = resolvedDim + 1; i < ndim; i++) {
    sumDimStride *= x.shape[i];
  }

  // Stride from the summed dim to end of one "block"
  const blockStride = sumDimStride * sumDimSize;

  // Outer stride: elements before the summed dim
  let outerStride = 1;
  for (let i = 0; i < resolvedDim; i++) {
    outerStride *= x.shape[i];
  }

  // Number of blocks
  const numBlocks = outerStride;

  for (let block = 0; block < numBlocks; block++) {
    const blockOffset = block * blockStride;
    for (let pos = 0; pos < sumDimStride; pos++) {
      let sum = 0;
      for (let d = 0; d < sumDimSize; d++) {
        sum += x.data[blockOffset + d * sumDimStride + pos];
      }
      const outIdx = block * sumDimStride + pos;
      result[outIdx] = sum;
    }
  }

  const out = new Tensor(result, outShape, x.requiresGrad);

  if (out.requiresGrad) {
    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        // Expand gradOutput back to input shape by repeating along the summed dim
        const gradInput = new Float64Array(x.data.length);

        for (let block = 0; block < numBlocks; block++) {
          const blockOffset = block * blockStride;
          for (let pos = 0; pos < sumDimStride; pos++) {
            const outIdx = block * sumDimStride + pos;
            const gradVal = gradOutput[outIdx];
            for (let d = 0; d < sumDimSize; d++) {
              gradInput[blockOffset + d * sumDimStride + pos] = gradVal;
            }
          }
        }

        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}
