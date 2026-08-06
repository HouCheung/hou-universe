// ============================================================
// reshape — Change tensor shape (preserving total elements)
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * Reshape a tensor to a new shape.
 *
 * Supports -1 for one dimension (auto-infer from total size).
 *
 * Backward: grad_x = reshape(gradOutput, x.shape) — inverse reshape
 */
export function reshape(x: Tensor, ...newShape: number[]): Tensor {
  // Resolve -1 (infer dimension)
  let inferredDim = -1;
  const resolvedShape = newShape.map((d, i) => {
    if (d === -1) {
      if (inferredDim !== -1) {
        throw new Error("reshape: only one dimension can be inferred (-1)");
      }
      inferredDim = i;
      return 1; // placeholder
    }
    return d;
  });

  if (inferredDim !== -1) {
    const productKnown = resolvedShape.reduce((a, b) => a * b, 1);
    resolvedShape[inferredDim] = Math.floor(x.size / productKnown);
  }

  const expectedSize = shapeSize(resolvedShape);
  if (expectedSize !== x.size) {
    throw new Error(
      `reshape: cannot reshape [${x.shape}] (size=${x.size}) to [${newShape}] (size=${expectedSize})`
    );
  }

  // Create new tensor sharing data (for now, a copy)
  const out = new Tensor(new Float64Array(x.data), resolvedShape, x.requiresGrad);

  if (out.requiresGrad) {
    // Save original shape for backward
    const originalShape = [...x.shape];

    out._ctx = {
      parents: [x],
      backwardFn: (gradOutput: Float64Array) => {
        // Reshape gradient back to original shape
        // Since data layout is the same (row-major), just wrap in original shape
        const gradInput = new Float64Array(gradOutput);
        // Validate: the backward shape must match
        if (gradInput.length !== shapeSize(originalShape)) {
          throw new Error(
            `reshape backward: gradient size ${gradInput.length} does not match original shape [${originalShape}]`
          );
        }
        x.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}
