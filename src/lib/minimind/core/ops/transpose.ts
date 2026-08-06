// ============================================================
// transpose — Swap two dimensions of a tensor
// ============================================================

import { Tensor, indexFor } from "../Tensor";

/**
 * Transpose two dimensions of a tensor.
 *
 * Default: swap last two dimensions (-2, -1).
 *
 * Backward: grad_x = transpose(gradOutput, dim0, dim1) — self-inverse
 */
export function transpose(x: Tensor, dim0: number = -2, dim1: number = -1): Tensor {
  const ndim = x.shape.length;

  if (ndim < 2) {
    throw new Error(
      `transpose: tensor must have at least 2 dimensions. Got shape [${x.shape}].`
    );
  }

  const d0 = dim0 < 0 ? ndim + dim0 : dim0;
  const d1 = dim1 < 0 ? ndim + dim1 : dim1;

  if (d0 < 0 || d0 >= ndim || d1 < 0 || d1 >= ndim) {
    throw new Error(
      `transpose: dimensions ${dim0}, ${dim1} out of range for shape [${x.shape}] (ndim=${ndim})`
    );
  }

  // Build new shape
  const newShape = [...x.shape];
  newShape[d0] = x.shape[d1];
  newShape[d1] = x.shape[d0];

  // Compute transposed data
  const result = new Float64Array(x.size);
  const indices = new Array(ndim).fill(0);

  for (let flatIdx = 0; flatIdx < x.size; flatIdx++) {
    // flat → multi-index
    let remaining = flatIdx;
    for (let i = ndim - 1; i >= 0; i--) {
      indices[i] = remaining % x.shape[i];
      remaining = Math.floor(remaining / x.shape[i]);
    }

    // Swap indices
    const tmp = indices[d0];
    indices[d0] = indices[d1];
    indices[d1] = tmp;

    // multi-index → flat in new shape
    const newFlatIdx = indexFor(newShape, indices);
    result[newFlatIdx] = x.data[flatIdx];
  }

  const out = new Tensor(result, newShape, x.requiresGrad);

  if (out.requiresGrad) {
    // Save shape info for backward
    const origShape = [...x.shape];

    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        // Transpose gradient back: same operation (self-inverse)
        const gradInput = new Float64Array(gradOutput.length);
        const gradIndices = new Array(ndim).fill(0);

        for (let flatIdx = 0; flatIdx < gradOutput.length; flatIdx++) {
          // flat → multi-index in output shape
          let remaining = flatIdx;
          for (let i = ndim - 1; i >= 0; i--) {
            gradIndices[i] = remaining % newShape[i];
            remaining = Math.floor(remaining / newShape[i]);
          }

          // Swap back
          const tmp = gradIndices[d0];
          gradIndices[d0] = gradIndices[d1];
          gradIndices[d1] = tmp;

          // multi-index → flat in original shape
          const origFlatIdx = indexFor(origShape, gradIndices);
          gradInput[origFlatIdx] = gradOutput[flatIdx];
        }

        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}
