// ============================================================
// batchMatmul — Batched matrix multiplication
// ============================================================
// Supports [..., M, K] @ [..., K, N] → [..., M, N]
// Batch dimensions (all except last 2) must match exactly.
//
// Used by TensorAttention for Q @ K^T and Attn @ V.
//
// Forward:
//   out[batch][i][j] = Σ_k a[batch][i][k] * b[batch][k][j]
//
// Backward:
//   grad_a = batchMatmul(gradOutput, transpose_last2(b))
//     gradOutput: [..., M, N]  @  b^T: [..., N, K]  →  grad_a: [..., M, K]
//
//   grad_b = batchMatmul(transpose_last2(a), gradOutput)
//     a^T: [..., K, M]  @  gradOutput: [..., M, N]  →  grad_b: [..., K, N]
// ============================================================

import { Tensor, shapeSize } from "../Tensor";

/**
 * Batched matrix multiplication.
 *
 * a.shape = [..., M, K]
 * b.shape = [..., K, N]
 * → out.shape = [..., M, N]
 *
 * Batch dimensions (everything except the last two) must match exactly.
 */
export function batchMatmul(a: Tensor, b: Tensor): Tensor {
  const aShape = a.shape;
  const bShape = b.shape;

  // ── Validate shapes ──
  if (aShape.length < 2) {
    throw new Error(
      `batchMatmul: first operand must have at least 2 dimensions. Got [${aShape}].`
    );
  }
  if (bShape.length < 2) {
    throw new Error(
      `batchMatmul: second operand must have at least 2 dimensions. Got [${bShape}].`
    );
  }
  if (aShape.length !== bShape.length) {
    throw new Error(
      `batchMatmul: operands must have the same number of dimensions. ` +
        `Got [${aShape}] (ndim=${aShape.length}) vs [${bShape}] (ndim=${bShape.length}).`
    );
  }

  const ndim = aShape.length;
  const M = aShape[ndim - 2];
  const K_a = aShape[ndim - 1];
  const K_b = bShape[ndim - 2];
  const N = bShape[ndim - 1];

  if (K_a !== K_b) {
    throw new Error(
      `batchMatmul: inner dimension mismatch — a is [..., ${M}, ${K_a}], ` +
        `b is [..., ${K_b}, ${N}]. Expected K_a (${K_a}) === K_b (${K_b}).`
    );
  }

  const K = K_a;

  // ── Validate batch dimensions match ──
  const batchDims = ndim - 2;
  for (let i = 0; i < batchDims; i++) {
    if (aShape[i] !== bShape[i]) {
      throw new Error(
        `batchMatmul: batch dimension ${i} mismatch — [${aShape}] vs [${bShape}].`
      );
    }
  }

  // ── Compute batch size ──
  const batchShape = aShape.slice(0, batchDims);
  const batchSize = batchDims === 0 ? 1 : shapeSize(batchShape);

  // ── Forward ──
  const outShape = [...batchShape, M, N];
  const outSize = batchSize * M * N;
  const result = new Float64Array(outSize);

  const aStrideM = K;  // elements from one row to next in a
  const aBatchStride = M * K;  // elements from one batch to next in a
  const bStrideK = N;  // elements from one col to next in b (row stride in b)
  const bBatchStride = K * N;  // elements from one batch to next in b
  const outStrideM = N;
  const outBatchStride = M * N;

  for (let batch = 0; batch < batchSize; batch++) {
    const aOffset = batch * aBatchStride;
    const bOffset = batch * bBatchStride;
    const outOffset = batch * outBatchStride;

    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        let sum = 0;
        for (let k = 0; k < K; k++) {
          sum += a.data[aOffset + i * aStrideM + k] *
                 b.data[bOffset + k * bStrideK + j];
        }
        result[outOffset + i * outStrideM + j] = sum;
      }
    }
  }

  const out = new Tensor(result, outShape, a.requiresGrad || b.requiresGrad);

  // ── Backward closure ──
  if (out.requiresGrad) {
    const aData = new Float64Array(a.data);
    const bData = new Float64Array(b.data);

    out._ctx = {
      parents: [a, b],
      backwardFn: (gradOutput: Float64Array) => {
        // ── grad_a = batchMatmul(gradOutput, b^T) ──
        // gradOutput: [..., M, N], b^T: [..., N, K] → grad_a: [..., M, K]
        if (a.requiresGrad) {
          const gradA = new Float64Array(a.size);
          for (let batch = 0; batch < batchSize; batch++) {
            const goOffset = batch * outBatchStride;
            const bOff = batch * bBatchStride;
            const gaOff = batch * aBatchStride;

            for (let i = 0; i < M; i++) {
              for (let k = 0; k < K; k++) {
                let sum = 0;
                for (let j = 0; j < N; j++) {
                  // b^T means bData[batch, j, k] = bData[bOff + j*K + k]
                  // (original b was [..., K, N]; b^T swaps last two → [..., N, K])
                  sum += gradOutput[goOffset + i * outStrideM + j] *
                         bData[bOff + k * bStrideK + j];
                  // Wait, I need to access b^T properly.
                  // b^T[batch, j, k] means row j, col k in the transposed b.
                  // Original b[batch, k, j] = bData[bOff + k * bStrideK + j]
                  // So b^T[batch, j, k] = bData[bOff + k * bStrideK + j]
                  // Actually: b^T[j, k] = b[k, j], so:
                  // b^T at flat index (j*K + k) = b at flat index (k*N + j)
                  // So data at b^T[batch, j, k] = bData[bOff + k * bStrideK + j]
                }
                gradA[gaOff + i * aStrideM + k] = sum;
              }
            }
          }
          a.accumulateGrad(gradA);
        }

        // ── grad_b = batchMatmul(a^T, gradOutput) ──
        // a^T: [..., K, M], gradOutput: [..., M, N] → grad_b: [..., K, N]
        if (b.requiresGrad) {
          const gradB = new Float64Array(b.size);
          for (let batch = 0; batch < batchSize; batch++) {
            const goOffset = batch * outBatchStride;
            const aOff = batch * aBatchStride;
            const gbOff = batch * bBatchStride;

            for (let k = 0; k < K; k++) {
              for (let j = 0; j < N; j++) {
                let sum = 0;
                for (let i = 0; i < M; i++) {
                  // a^T[k, i] = a[i, k], so:
                  // sum += a^T[batch, k, i] * gradOutput[batch, i, j]
                  //      = a[batch, i, k] * gradOutput[batch, i, j]
                  sum += aData[aOff + i * aStrideM + k] *
                         gradOutput[goOffset + i * outStrideM + j];
                }
                gradB[gbOff + k * bStrideK + j] = sum;
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
