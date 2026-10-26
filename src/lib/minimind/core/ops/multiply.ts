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

  // ── Bias broadcast: [M, K] * [K] (or swapped) ──
  if (a.shape.length === 2 && b.shape.length === 1) {
    if (a.shape[1] === b.shape[0]) {
      return _multiplyBiasBroadcast(a, b);
    }
  }
  if (b.shape.length === 2 && a.shape.length === 1) {
    if (b.shape[1] === a.shape[0]) {
      return _multiplyBiasBroadcast(b, a);
    }
  }

  // ── 3D bias broadcast: [B, T, D] * [D] ──
  if (a.shape.length === 3 && b.shape.length === 1 && a.shape[2] === b.shape[0]) {
    return _multiply3Dby1D(a, b);
  }
  if (b.shape.length === 3 && a.shape.length === 1 && b.shape[2] === a.shape[0]) {
    return _multiply3Dby1D(b, a);
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

/**
 * [M, K] * [K] — bias broadcast over rows.
 *
 * Multiplies the 1D vector element-wise with every row of the 2D matrix.
 *
 * Forward:  out[i][j] = matrix[i][j] * bias[j]
 * Backward:
 *   grad_matrix[i][j] = gradOutput[i][j] * bias[j]
 *   grad_bias[j] = Σ_i gradOutput[i][j] * matrix[i][j]
 */
function _multiplyBiasBroadcast(matrix: Tensor, bias: Tensor): Tensor {
  const M = matrix.shape[0];
  const K = matrix.shape[1];

  const size = M * K;
  const result = new Float64Array(size);
  const biasData = bias.data;

  for (let i = 0; i < M; i++) {
    const rowOffset = i * K;
    for (let j = 0; j < K; j++) {
      result[rowOffset + j] = matrix.data[rowOffset + j] * biasData[j];
    }
  }

  const out = new Tensor(result, [M, K], matrix.requiresGrad || bias.requiresGrad);

  if (out.requiresGrad) {
    const matrixData = new Float64Array(matrix.data);
    const biasDataCopy = new Float64Array(biasData);

    out._ctx = {
      parents: [matrix, bias],
      backwardFn: (gradOutput: Float64Array) => {
        // grad_matrix = gradOutput * bias (element-wise along each row)
        if (matrix.requiresGrad) {
          const gradMatrix = new Float64Array(size);
          for (let i = 0; i < M; i++) {
            const rowOffset = i * K;
            for (let j = 0; j < K; j++) {
              gradMatrix[rowOffset + j] = gradOutput[rowOffset + j] * biasDataCopy[j];
            }
          }
          matrix.accumulateGrad(gradMatrix);
        }

        // grad_bias = Σ_i gradOutput[i][j] * matrix[i][j]
        if (bias.requiresGrad) {
          const gradBias = new Float64Array(K);
          for (let i = 0; i < M; i++) {
            const rowOffset = i * K;
            for (let j = 0; j < K; j++) {
              gradBias[j] += gradOutput[rowOffset + j] * matrixData[rowOffset + j];
            }
          }
          bias.accumulateGrad(gradBias);
        }
      },
    };
  }

  return out;
}

/**
 * [B, T, D] * [D] — broadcast over first two dimensions.
 *
 * Used by RMSNorm for gamma scaling.
 *
 * Forward:  out[b][t][d] = a[b][t][d] * b[d]
 * Backward:
 *   grad_a[b][t][d] = gradOutput[b][t][d] * b[d]
 *   grad_b[d] = Σ_{b,t} gradOutput[b][t][d] * a[b][t][d]
 */
function _multiply3Dby1D(matrix3D: Tensor, vector: Tensor): Tensor {
  const B = matrix3D.shape[0];
  const T = matrix3D.shape[1];
  const D = matrix3D.shape[2];

  const size = B * T * D;
  const result = new Float64Array(size);
  const vecData = vector.data;

  for (let bi = 0; bi < B; bi++) {
    for (let ti = 0; ti < T; ti++) {
      const offset = (bi * T + ti) * D;
      for (let d = 0; d < D; d++) {
        result[offset + d] = matrix3D.data[offset + d] * vecData[d];
      }
    }
  }

  const out = new Tensor(result, [B, T, D], matrix3D.requiresGrad || vector.requiresGrad);

  if (out.requiresGrad) {
    const matrixData = new Float64Array(matrix3D.data);
    const vecDataCopy = new Float64Array(vecData);

    out._ctx = {
      parents: [matrix3D, vector],
      backwardFn: (gradOutput: Float64Array) => {
        // grad_matrix3D = gradOutput * vector (broadcast over B,T)
        if (matrix3D.requiresGrad) {
          const gradMatrix = new Float64Array(size);
          for (let bi = 0; bi < B; bi++) {
            for (let ti = 0; ti < T; ti++) {
              const offset = (bi * T + ti) * D;
              for (let d = 0; d < D; d++) {
                gradMatrix[offset + d] = gradOutput[offset + d] * vecDataCopy[d];
              }
            }
          }
          matrix3D.accumulateGrad(gradMatrix);
        }

        // grad_vector = Σ_{b,t} gradOutput * matrix3D
        if (vector.requiresGrad) {
          const gradVec = new Float64Array(D);
          for (let bi = 0; bi < B; bi++) {
            for (let ti = 0; ti < T; ti++) {
              const offset = (bi * T + ti) * D;
              for (let d = 0; d < D; d++) {
                gradVec[d] += gradOutput[offset + d] * matrixData[offset + d];
              }
            }
          }
          vector.accumulateGrad(gradVec);
        }
      },
    };
  }

  return out;
}
