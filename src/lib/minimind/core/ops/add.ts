// ============================================================
// add — Element-wise addition with broadcasting support
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * Element-wise addition.
 *
 * Phase 30 supports:
 *  - Same-shape tensors: straightforward element-wise add
 *  - Scalar + tensor: broadcast scalar to tensor shape
 *
 * Backward:
 *  grad_a = sum_over_broadcast_dims(gradOutput) reshaped to a.shape
 *  grad_b = sum_over_broadcast_dims(gradOutput) reshaped to b.shape
 */
export function add(a: Tensor, b: Tensor): Tensor {
  // ── Handle scalar broadcasting ──
  const aIsScalar = a.shape.length === 0;
  const bIsScalar = b.shape.length === 0;

  if (aIsScalar && bIsScalar) {
    // Scalar + scalar
    const result = new Float64Array([a.data[0] + b.data[0]]);
    const out = new Tensor(result, [], a.requiresGrad || b.requiresGrad);

    if (out.requiresGrad) {
      out._ctx = {
        parents: [a, b],
        backwardFn: (gradOutput: Float64Array) => {
          a.accumulateGrad(new Float64Array([gradOutput[0]]));
          b.accumulateGrad(new Float64Array([gradOutput[0]]));
        },
      };
    }
    return out;
  }

  if (aIsScalar) {
    // Scalar + tensor: broadcast scalar
    return _addScalarTensor(a, b);
  }

  if (bIsScalar) {
    // Tensor + scalar: broadcast scalar
    return _addScalarTensor(b, a);
  }

  // ── Bias broadcast: [M, K] + [K] (or swapped) ──
  if (a.shape.length === 2 && b.shape.length === 1) {
    if (a.shape[1] === b.shape[0]) {
      return _addBiasBroadcast(a, b);
    }
  }
  if (b.shape.length === 2 && a.shape.length === 1) {
    if (b.shape[1] === a.shape[0]) {
      return _addBiasBroadcast(b, a);
    }
  }

  // ── Same shape ──
  if (a.shape.length !== b.shape.length) {
    throw new Error(
      `add: shape mismatch — [${a.shape}] vs [${b.shape}]. ` +
        `For different-rank tensors, broadcasting is not yet supported in Phase 30.`
    );
  }

  for (let i = 0; i < a.shape.length; i++) {
    if (a.shape[i] !== b.shape[i]) {
      throw new Error(
        `add: shape mismatch at dim ${i} — [${a.shape}] vs [${b.shape}]. ` +
          `Only same-shape addition is supported in Phase 30.`
      );
    }
  }

  const size = shapeSize(a.shape);
  const result = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = a.data[i] + b.data[i];
  }

  const out = new Tensor(result, [...a.shape], a.requiresGrad || b.requiresGrad);

  if (out.requiresGrad) {
    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        // dL/dA = gradOutput, dL/dB = gradOutput (add is linear)
        a.accumulateGrad(new Float64Array(gradOutput));
        b.accumulateGrad(new Float64Array(gradOutput));
      },
    };
  }

  return out;
}

/** Scalar + tensor broadcast helper */
function _addScalarTensor(scalar: Tensor, tensor: Tensor): Tensor {
  const size = shapeSize(tensor.shape);
  const scalarVal = scalar.data[0];
  const result = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = scalarVal + tensor.data[i];
  }

  const out = new Tensor(result, [...tensor.shape], scalar.requiresGrad || tensor.requiresGrad);

  if (out.requiresGrad) {
    out._ctx = {
      parents: [scalar, tensor],
      backwardFn: (gradOutput: Float64Array) => {
        // Scalar grad: sum of all gradOutput elements
        if (scalar.requiresGrad) {
          let sum = 0;
          for (let i = 0; i < gradOutput.length; i++) {
            sum += gradOutput[i];
          }
          scalar.accumulateGrad(new Float64Array([sum]));
        }
        // Tensor grad: same as gradOutput
        tensor.accumulateGrad(new Float64Array(gradOutput));
      },
    };
  }

  return out;
}

/**
 * Bias broadcast: [M, K] + [K] → result [M, K]
 *
 * Adds the 1D bias vector to every row of the 2D matrix.
 * This is the standard linear layer bias addition pattern.
 *
 * Backward:
 *   grad_matrix = gradOutput (same shape, element-wise through add)
 *   grad_bias   = sum of gradOutput over rows (bias[j] affects all rows)
 */
function _addBiasBroadcast(matrix: Tensor, bias: Tensor): Tensor {
  const M = matrix.shape[0];
  const K = matrix.shape[1];

  const size = M * K;
  const result = new Float64Array(size);
  const biasData = bias.data;

  for (let i = 0; i < M; i++) {
    const rowOffset = i * K;
    for (let j = 0; j < K; j++) {
      result[rowOffset + j] = matrix.data[rowOffset + j] + biasData[j];
    }
  }

  const out = new Tensor(result, [M, K], matrix.requiresGrad || bias.requiresGrad);

  if (out.requiresGrad) {
    out._ctx = {
      parents: [matrix, bias],
      backwardFn: (gradOutput: Float64Array) => {
        // dL/d_matrix[i][j] = gradOutput[i][j] (pass-through)
        if (matrix.requiresGrad) {
          matrix.accumulateGrad(new Float64Array(gradOutput));
        }
        // dL/d_bias[j] = Σ_i gradOutput[i][j] (sum over batch dim)
        if (bias.requiresGrad) {
          const gradBias = new Float64Array(K);
          for (let i = 0; i < M; i++) {
            const rowOffset = i * K;
            for (let j = 0; j < K; j++) {
              gradBias[j] += gradOutput[rowOffset + j];
            }
          }
          bias.accumulateGrad(gradBias);
        }
      },
    };
  }

  return out;
}
