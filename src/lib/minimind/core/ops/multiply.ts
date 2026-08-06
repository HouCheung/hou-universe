// ============================================================
// multiply — Element-wise multiplication
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * Element-wise multiplication (Hadamard product).
 *
 * Phase 30 supports:
 *  - Same-shape tensors: straightforward element-wise multiply
 *  - Scalar * tensor: broadcast scalar to tensor shape
 *
 * Backward:
 *  grad_a = gradOutput ⊙ b
 *  grad_b = gradOutput ⊙ a
 */
export function multiply(a: Tensor, b: Tensor): Tensor {
  // ── Handle scalar broadcasting ──
  const aIsScalar = a.shape.length === 0;
  const bIsScalar = b.shape.length === 0;

  if (aIsScalar && bIsScalar) {
    // Scalar * scalar
    const result = new Float64Array([a.data[0] * b.data[0]]);
    const out = new Tensor(result, [], a.requiresGrad || b.requiresGrad);

    if (out.requiresGrad) {
      out._ctx = {
        parents: [a, b],
        backwardFn: (gradOutput: Float64Array) => {
          a.accumulateGrad(new Float64Array([gradOutput[0] * b.data[0]]));
          b.accumulateGrad(new Float64Array([gradOutput[0] * a.data[0]]));
        },
      };
    }
    return out;
  }

  if (aIsScalar) {
    return _multiplyScalarTensor(a, b);
  }

  if (bIsScalar) {
    return _multiplyScalarTensor(b, a);
  }

  // ── Same shape ──
  if (a.shape.length !== b.shape.length) {
    throw new Error(
      `multiply: shape mismatch — [${a.shape}] vs [${b.shape}]`
    );
  }

  for (let i = 0; i < a.shape.length; i++) {
    if (a.shape[i] !== b.shape[i]) {
      throw new Error(
        `multiply: shape mismatch at dim ${i} — [${a.shape}] vs [${b.shape}]`
      );
    }
  }

  const size = shapeSize(a.shape);
  const result = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = a.data[i] * b.data[i];
  }

  const out = new Tensor(result, [...a.shape], a.requiresGrad || b.requiresGrad);

  if (out.requiresGrad) {
    // Save copies of a.data and b.data for backward (closures capture references)
    const aData = new Float64Array(a.data);
    const bData = new Float64Array(b.data);

    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        // grad_a = gradOutput ⊙ b
        const gradA = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          gradA[i] = gradOutput[i] * bData[i];
        }
        a.accumulateGrad(gradA);

        // grad_b = gradOutput ⊙ a
        const gradB = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          gradB[i] = gradOutput[i] * aData[i];
        }
        b.accumulateGrad(gradB);
      },
    };
  }

  return out;
}

/** Scalar * tensor broadcast helper */
function _multiplyScalarTensor(scalar: Tensor, tensor: Tensor): Tensor {
  const size = shapeSize(tensor.shape);
  const scalarVal = scalar.data[0];
  const result = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = scalarVal * tensor.data[i];
  }

  const out = new Tensor(result, [...tensor.shape], scalar.requiresGrad || tensor.requiresGrad);

  if (out.requiresGrad) {
    const tensorData = new Float64Array(tensor.data);
    out._ctx = {
      parents: [scalar, tensor],
      backwardFn: (gradOutput: Float64Array) => {
        // Scalar grad: sum of gradOutput ⊙ tensor
        if (scalar.requiresGrad) {
          let sum = 0;
          for (let i = 0; i < gradOutput.length; i++) {
            sum += gradOutput[i] * tensorData[i];
          }
          scalar.accumulateGrad(new Float64Array([sum]));
        }
        // Tensor grad: gradOutput * scalarVal
        const gradTensor = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          gradTensor[i] = gradOutput[i] * scalarVal;
        }
        tensor.accumulateGrad(gradTensor);
      },
    };
  }

  return out;
}
