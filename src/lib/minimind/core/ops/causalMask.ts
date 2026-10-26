// ============================================================
// causalMask — Apply causal attention mask
// ============================================================
// Sets scores[batch, head, i, j] = -1e9 for j > i (future tokens).
// This prevents each position from attending to future positions.
//
// Shape: [B, H, T, T] → [B, H, T, T]
//
// Forward:
//   masked[b,h,i,j] = scores[b,h,i,j]   if j <= i
//   masked[b,h,i,j] = -1e9              if j > i
//
//   The value -1e9 is chosen because exp(-1e9) ≈ 0 in float64,
//   giving effectively-zero attention weights after softmax.
//
// Backward:
//   grad[b,h,i,j] = gradOutput[b,h,i,j]  if j <= i
//   grad[b,h,i,j] = 0                   if j > i
//   (masked positions don't contribute to output, so their gradient is zero)
// ============================================================

import { Tensor } from "../Tensor";

/** Value used for masked positions: exp(-1e9) ≈ 0 */
const MASK_VALUE = -1e9;

/**
 * Apply causal (autoregressive) mask to attention scores.
 *
 * For a tensor of shape [..., T, T]:
 *   - positions where col > row (j > i) are set to MASK_VALUE (-1e9)
 *   - all other positions are unchanged
 *
 * @param scores - Attention scores tensor, must end with [T, T]
 * @returns Masked scores tensor with same shape
 */
export function causalMask(scores: Tensor): Tensor {
  const ndim = scores.shape.length;

  if (ndim < 2) {
    throw new Error(
      `causalMask: tensor must have at least 2 dimensions. Got [${scores.shape}].`
    );
  }

  const T = scores.shape[ndim - 1];
  const T2 = scores.shape[ndim - 2];

  if (T !== T2) {
    throw new Error(
      `causalMask: last two dimensions must be equal (square). ` +
        `Got [${scores.shape}].`
    );
  }

  const size = scores.size;
  const result = new Float64Array(size);

  // Copy original data and apply mask
  result.set(scores.data);

  // Flatten all leading dims into a single batch dimension
  const batchDims = ndim - 2;
  let batchSize = 1;
  for (let i = 0; i < batchDims; i++) {
    batchSize *= scores.shape[i];
  }

  const blockSize = T * T; // elements per [T, T] block

  for (let b = 0; b < batchSize; b++) {
    const offset = b * blockSize;
    for (let i = 0; i < T; i++) {
      for (let j = i + 1; j < T; j++) {
        // Position (i, j) where j > i: set to MASK_VALUE
        result[offset + i * T + j] = MASK_VALUE;
      }
    }
  }

  const out = new Tensor(result, [...scores.shape], scores.requiresGrad);

  if (out.requiresGrad) {
    out._ctx = {
      parents: [scores],
      backwardFn: (gradOutput: Float64Array) => {
        const gradInput = new Float64Array(size);
        // Copy gradient, but zero out masked positions
        gradInput.set(gradOutput);

        for (let b = 0; b < batchSize; b++) {
          const offset = b * blockSize;
          for (let i = 0; i < T; i++) {
            for (let j = i + 1; j < T; j++) {
              // Zero gradient at masked positions
              gradInput[offset + i * T + j] = 0;
            }
          }
        }

        scores.accumulateGrad(gradInput);
      },
    };
  }

  return out;
}
