// ============================================================
// matmul — 2D matrix multiplication
// ============================================================
// Phase 30 restriction: only 2D matmul (a: [m, k], b: [k, n])
// Batch matmul is deferred to Phase 32+.
// ============================================================

import { Tensor } from "../Tensor";

/**
 * Matrix multiplication: C = A @ B
 *
 * A.shape = [m, k], B.shape = [k, n] → C.shape = [m, n]
 *
 * Forward:  C[i][j] = Σ_k A[i][k] * B[k][j]
 *
 * Backward:
 *   grad_a = gradOutput @ B^T   → shape [m, k]
 *   grad_b = A^T @ gradOutput   → shape [k, n]
 */
export function matmul(a: Tensor, b: Tensor): Tensor {
  // ── Validate shapes ──
  if (a.shape.length !== 2) {
    throw new Error(
      `matmul: first operand must be 2D. Got shape [${a.shape}] (ndim=${a.shape.length}).`
    );
  }
  if (b.shape.length !== 2) {
    throw new Error(
      `matmul: second operand must be 2D. Got shape [${b.shape}] (ndim=${b.shape.length}).`
    );
  }

  const m = a.shape[0];
  const k = a.shape[1];
  const k2 = b.shape[0];
  const n = b.shape[1];

  if (k !== k2) {
    throw new Error(
      `matmul: inner dimension mismatch — A is [${m}, ${k}], B is [${k2}, ${n}]. ` +
        `Expected A.shape[1] (${k}) === B.shape[0] (${k2}).`
    );
  }

  // ── Forward: C = A @ B ──
  const result = new Float64Array(m * n);
  for (let i = 0; i < m; i++) {
    const aRowOffset = i * k;
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let kk = 0; kk < k; kk++) {
        sum += a.data[aRowOffset + kk] * b.data[kk * n + j];
      }
      result[i * n + j] = sum;
    }
  }

  const out = new Tensor(result, [m, n], a.requiresGrad || b.requiresGrad);

  // ── Record backward closure ──
  if (out.requiresGrad) {
    // Save copies of input data needed for backward
    const aData = new Float64Array(a.data);
    const bData = new Float64Array(b.data);

    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        // ── grad_a = gradOutput @ B^T ──
        // grad_a[i][j] = Σ_p gradOutput[i][p] * B[j][p]
        // Shape: [m, k]
        const gradA = new Float64Array(m * k);
        for (let i = 0; i < m; i++) {
          for (let j = 0; j < k; j++) {
            let sum = 0;
            for (let p = 0; p < n; p++) {
              sum += gradOutput[i * n + p] * bData[j * n + p];
            }
            gradA[i * k + j] = sum;
          }
        }
        a.accumulateGrad(gradA);

        // ── grad_b = A^T @ gradOutput ──
        // grad_b[i][j] = Σ_p A[p][i] * gradOutput[p][j]
        // Shape: [k, n]
        const gradB = new Float64Array(k * n);
        for (let i = 0; i < k; i++) {
          for (let j = 0; j < n; j++) {
            let sum = 0;
            for (let p = 0; p < m; p++) {
              sum += aData[p * k + i] * gradOutput[p * n + j];
            }
            gradB[i * n + j] = sum;
          }
        }
        b.accumulateGrad(gradB);
      },
    };
  }

  return out;
}
