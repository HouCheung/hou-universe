// ============================================================
// divide — Element-wise division with broadcasting support
// ============================================================
// Forward:  out = a / b
//
// Supported broadcast patterns:
//   - Same shape
//   - [B,T,D] / [B,T]  — broadcast over last dim (RMSNorm normalization)
//   - [B,T,D] / [D]    — broadcast over first dims (like bias broadcast)
//   - Scalar / tensor and tensor / scalar
//
// Backward:
//   d(out)/da = 1 / b          → grad_a = gradOutput / b
//   d(out)/db = -a / b²        → grad_b = -gradOutput * out / b
//
// For broadcast patterns, grad_b sums over the broadcast dimensions.
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * Element-wise division with broadcasting support.
 *
 * @param a - Numerator tensor
 * @param b - Denominator tensor
 * @returns Output tensor a / b
 */
export function divide(a: Tensor, b: Tensor): Tensor {
  // ── Handle scalar broadcasting ──
  const aIsScalar = a.shape.length === 0;
  const bIsScalar = b.shape.length === 0;

  if (aIsScalar && bIsScalar) {
    return _divideScalarScalar(a, b);
  }

  if (aIsScalar) {
    return _divideScalarTensor(a, b);
  }

  if (bIsScalar) {
    return _divideTensorScalar(a, b);
  }

  // ── Detect broadcast patterns ──
  // Pattern: [B, T, D] / [B, T] — broadcast over last dim
  if (
    a.shape.length === 3 &&
    b.shape.length === 2 &&
    a.shape[0] === b.shape[0] &&
    a.shape[1] === b.shape[1]
  ) {
    return _divide3Dby2D(a, b);
  }

  // Pattern: [M, K] / [K] — bias broadcast over rows
  if (
    a.shape.length === 2 &&
    b.shape.length === 1 &&
    a.shape[1] === b.shape[0]
  ) {
    return _divideBiasBroadcast(a, b);
  }

  // Pattern: [B, T, D] / [D] — bias broadcast over first two dims
  if (
    a.shape.length === 3 &&
    b.shape.length === 1 &&
    a.shape[2] === b.shape[0]
  ) {
    return _divide3Dby1D(a, b);
  }

  // ── Same shape ──
  if (a.shape.length !== b.shape.length) {
    throw new Error(
      `divide: shape mismatch — [${a.shape}] vs [${b.shape}]. ` +
        `Broadcasting between these shapes is not supported.`
    );
  }

  for (let i = 0; i < a.shape.length; i++) {
    if (a.shape[i] !== b.shape[i]) {
      throw new Error(
        `divide: shape mismatch at dim ${i} — [${a.shape}] vs [${b.shape}]`
      );
    }
  }

  const size = shapeSize(a.shape);
  const result = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = a.data[i] / b.data[i];
  }

  const out = new Tensor(result, [...a.shape], a.requiresGrad || b.requiresGrad);

  if (out.requiresGrad) {
    const aData = new Float64Array(a.data);
    const bData = new Float64Array(b.data);
    const outData = new Float64Array(result);

    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        // grad_a = gradOutput / b
        const gradA = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          gradA[i] = gradOutput[i] / bData[i];
        }
        a.accumulateGrad(gradA);

        // grad_b = -gradOutput * out / b
        const gradB = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          gradB[i] = -gradOutput[i] * outData[i] / bData[i];
        }
        b.accumulateGrad(gradB);
      },
    };
  }

  return out;
}

// ── Private broadcast helpers ──

/** Scalar / scalar */
function _divideScalarScalar(a: Tensor, b: Tensor): Tensor {
  const result = new Float64Array([a.data[0] / b.data[0]]);
  const out = new Tensor(result, [], a.requiresGrad || b.requiresGrad);

  if (out.requiresGrad) {
    const aVal = a.data[0];
    const bVal = b.data[0];
    const outVal = result[0];

    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        const g = gradOutput[0];
        a.accumulateGrad(new Float64Array([g / bVal]));
        b.accumulateGrad(new Float64Array([-g * outVal / bVal]));
      },
    };
  }

  return out;
}

/** Scalar / tensor */
function _divideScalarTensor(scalar: Tensor, tensor: Tensor): Tensor {
  const size = shapeSize(tensor.shape);
  const scalarVal = scalar.data[0];
  const result = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = scalarVal / tensor.data[i];
  }

  const out = new Tensor(result, [...tensor.shape], scalar.requiresGrad || tensor.requiresGrad);

  if (out.requiresGrad) {
    const tensorData = new Float64Array(tensor.data);
    const outData = new Float64Array(result);

    out._ctx = {
      parents: [scalar, tensor],
      backwardFn: (gradOutput: Float64Array) => {
        // Scalar grad: Σ gradOutput[i] / tensor[i]
        if (scalar.requiresGrad) {
          let sum = 0;
          for (let i = 0; i < size; i++) {
            sum += gradOutput[i] / tensorData[i];
          }
          scalar.accumulateGrad(new Float64Array([sum]));
        }
        // Tensor grad: -gradOutput * out / tensor = -gradOutput * scalarVal / tensor²
        const gradTensor = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          gradTensor[i] = -gradOutput[i] * outData[i] / tensorData[i];
        }
        tensor.accumulateGrad(gradTensor);
      },
    };
  }

  return out;
}

/** Tensor / scalar */
function _divideTensorScalar(tensor: Tensor, scalar: Tensor): Tensor {
  const size = shapeSize(tensor.shape);
  const scalarVal = scalar.data[0];
  const result = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = tensor.data[i] / scalarVal;
  }

  const out = new Tensor(result, [...tensor.shape], tensor.requiresGrad || scalar.requiresGrad);

  if (out.requiresGrad) {
    const tensorData = new Float64Array(tensor.data);
    const outData = new Float64Array(result);

    out._ctx = {
      parents: [tensor, scalar],
      backwardFn: (gradOutput: Float64Array) => {
        // Tensor grad: gradOutput / scalarVal
        const gradTensor = new Float64Array(size);
        for (let i = 0; i < size; i++) {
          gradTensor[i] = gradOutput[i] / scalarVal;
        }
        tensor.accumulateGrad(gradTensor);

        // Scalar grad: Σ -gradOutput[i] * out[i] / scalarVal
        if (scalar.requiresGrad) {
          let sum = 0;
          for (let i = 0; i < size; i++) {
            sum += -gradOutput[i] * outData[i] / scalarVal;
          }
          scalar.accumulateGrad(new Float64Array([sum]));
        }
      },
    };
  }

  return out;
}

/**
 * [M, K] / [K] — bias broadcast over rows.
 *
 * Forward:  out[i][j] = a[i][j] / b[j]
 * Backward:
 *   grad_a[i][j] = gradOutput[i][j] / b[j]
 *   grad_b[j] = Σ_i -gradOutput[i][j] * out[i][j] / b[j]
 */
function _divideBiasBroadcast(a: Tensor, b: Tensor): Tensor {
  const M = a.shape[0];
  const K = a.shape[1];

  const size = M * K;
  const result = new Float64Array(size);
  const bData = b.data;

  for (let i = 0; i < M; i++) {
    const rowOffset = i * K;
    for (let j = 0; j < K; j++) {
      result[rowOffset + j] = a.data[rowOffset + j] / bData[j];
    }
  }

  const out = new Tensor(result, [M, K], a.requiresGrad || b.requiresGrad);

  if (out.requiresGrad) {
    const aData = new Float64Array(a.data);
    const bDataCopy = new Float64Array(bData);
    const outData = new Float64Array(result);

    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        // grad_a = gradOutput / b (broadcast)
        if (a.requiresGrad) {
          const gradA = new Float64Array(size);
          for (let i = 0; i < M; i++) {
            const rowOffset = i * K;
            for (let j = 0; j < K; j++) {
              gradA[rowOffset + j] = gradOutput[rowOffset + j] / bDataCopy[j];
            }
          }
          a.accumulateGrad(gradA);
        }

        // grad_b = Σ_i -gradOutput[i][j] * out[i][j] / b[j]
        if (b.requiresGrad) {
          const gradB = new Float64Array(K);
          for (let i = 0; i < M; i++) {
            const rowOffset = i * K;
            for (let j = 0; j < K; j++) {
              gradB[j] += -gradOutput[rowOffset + j] * outData[rowOffset + j] / bDataCopy[j];
            }
          }
          b.accumulateGrad(gradB);
        }
      },
    };
  }

  return out;
}

/**
 * [B, T, D] / [B, T] — broadcast over last dimension.
 *
 * Used by RMSNorm for x / rms per position.
 *
 * Forward:  out[b][t][d] = a[b][t][d] / b[b][t]
 * Backward:
 *   grad_a[b][t][d] = gradOutput[b][t][d] / b[b][t]
 *   grad_b[b][t] = Σ_d -gradOutput[b][t][d] * out[b][t][d] / b[b][t]
 */
function _divide3Dby2D(a: Tensor, b: Tensor): Tensor {
  const B = a.shape[0];
  const T = a.shape[1];
  const D = a.shape[2];

  const size = B * T * D;
  const result = new Float64Array(size);

  for (let bi = 0; bi < B; bi++) {
    for (let ti = 0; ti < T; ti++) {
      const bVal = b.data[bi * T + ti];
      const offset = (bi * T + ti) * D;
      for (let d = 0; d < D; d++) {
        result[offset + d] = a.data[offset + d] / bVal;
      }
    }
  }

  const out = new Tensor(result, [B, T, D], a.requiresGrad || b.requiresGrad);

  if (out.requiresGrad) {
    const bDataCopy = new Float64Array(b.data);
    const outData = new Float64Array(result);

    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        // grad_a = gradOutput / b (broadcast over D)
        if (a.requiresGrad) {
          const gradA = new Float64Array(size);
          for (let bi = 0; bi < B; bi++) {
            for (let ti = 0; ti < T; ti++) {
              const bVal = bDataCopy[bi * T + ti];
              const offset = (bi * T + ti) * D;
              for (let d = 0; d < D; d++) {
                gradA[offset + d] = gradOutput[offset + d] / bVal;
              }
            }
          }
          a.accumulateGrad(gradA);
        }

        // grad_b = Σ_d -gradOutput * out / b
        if (b.requiresGrad) {
          const gradB = new Float64Array(B * T);
          for (let bi = 0; bi < B; bi++) {
            for (let ti = 0; ti < T; ti++) {
              const bVal = bDataCopy[bi * T + ti];
              const offset = (bi * T + ti) * D;
              let sum = 0;
              for (let d = 0; d < D; d++) {
                sum += -gradOutput[offset + d] * outData[offset + d] / bVal;
              }
              gradB[bi * T + ti] = sum;
            }
          }
          b.accumulateGrad(gradB);
        }
      },
    };
  }

  return out;
}

/**
 * [B, T, D] / [D] — broadcast over first two dimensions.
 *
 * Forward:  out[b][t][d] = a[b][t][d] / b[d]
 * Backward:
 *   grad_a[b][t][d] = gradOutput[b][t][d] / b[d]
 *   grad_b[d] = Σ_{b,t} -gradOutput[b][t][d] * out[b][t][d] / b[d]
 */
function _divide3Dby1D(a: Tensor, b: Tensor): Tensor {
  const B = a.shape[0];
  const T = a.shape[1];
  const D = a.shape[2];

  const size = B * T * D;
  const result = new Float64Array(size);

  for (let bi = 0; bi < B; bi++) {
    for (let ti = 0; ti < T; ti++) {
      const offset = (bi * T + ti) * D;
      for (let d = 0; d < D; d++) {
        result[offset + d] = a.data[offset + d] / b.data[d];
      }
    }
  }

  const out = new Tensor(result, [B, T, D], a.requiresGrad || b.requiresGrad);

  if (out.requiresGrad) {
    const bDataCopy = new Float64Array(b.data);
    const outData = new Float64Array(result);

    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        // grad_a = gradOutput / b (broadcast over B,T)
        if (a.requiresGrad) {
          const gradA = new Float64Array(size);
          for (let bi = 0; bi < B; bi++) {
            for (let ti = 0; ti < T; ti++) {
              const offset = (bi * T + ti) * D;
              for (let d = 0; d < D; d++) {
                gradA[offset + d] = gradOutput[offset + d] / bDataCopy[d];
              }
            }
          }
          a.accumulateGrad(gradA);
        }

        // grad_b = Σ_{b,t} -gradOutput * out / b
        if (b.requiresGrad) {
          const gradB = new Float64Array(D);
          for (let bi = 0; bi < B; bi++) {
            for (let ti = 0; ti < T; ti++) {
              const offset = (bi * T + ti) * D;
              for (let d = 0; d < D; d++) {
                gradB[d] += -gradOutput[offset + d] * outData[offset + d] / bDataCopy[d];
              }
            }
          }
          b.accumulateGrad(gradB);
        }
      },
    };
  }

  return out;
}
