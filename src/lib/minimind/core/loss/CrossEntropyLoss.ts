// ============================================================
// CrossEntropyLoss — Tensor cross-entropy with autograd
// ============================================================
// Phase 38: First Tensor loss function. Takes model logits
// [B, S, V] and target token IDs number[][], applies causal
// shift, computes softmax + NLL loss, and builds the full
// autograd graph so loss.backward() propagates gradients
// through LMHead → Transformer → Embedding.
//
// Formula (per valid position):
//   probs = softmax(logits[b, s])
//   loss = -log(probs[target[b][s+1]])
//
// Backward identity:
//   ∂CE/∂logit_i = softmax(logits)_i - one_hot(target)_i
//   (scaled by 1/count for mean reduction)
//
// Causal shift: logits[:, :-1] predicts targets[:, 1:]
// The last logit position receives zero gradient (no target).
// ============================================================

import { Tensor } from "../Tensor";

/**
 * Compute cross-entropy loss for causal language modeling.
 *
 * Takes model logits [batch, seq, vocab] and target token IDs,
 * applies causal shift internally, and returns a scalar loss
 * Tensor with a full autograd graph.
 *
 * @param logits  - Model output [B, S, V], the result of model.forward()
 * @param targets - Target token IDs, targets[b][s] is the token at position s
 *                  in batch element b. Must match logits batch and seq dims.
 * @param mask    - Optional position mask [B, S] of 0/1 values aligned to the
 *                  PREDICTION positions s (0..S-2): mask[b][s] = 1 means the
 *                  prediction at position s (whose target is targets[b][s+1])
 *                  contributes to the loss; mask[b][s] = 0 means it is ignored
 *                  (used for document-aligned padding, Phase 90). The final
 *                  position (s = S-1) has no target and is never read.
 *                  When undefined, every position contributes (existing
 *                  behavior, bit-identical to prior versions).
 * @returns Scalar Tensor with autograd graph. Call loss.backward() to
 *          propagate gradients through the model.
 *
 * Throws:
 *   - If logits is not 3D [B, S, V]
 *   - If targets length doesn't match batch size
 *   - If any target sequence length doesn't match seq length
 *   - If any target ID is out of vocabulary range
 *   - If mask shape doesn't match [B, S] or any mask value is not 0/1
 *   - If sequence length < 2 (no causal prediction possible)
 *
 * Example:
 *   const logits = model.forward(inputIds); // [1, 5, 100]
 *   const loss = crossEntropyLoss(logits, [[1, 2, 3, 4, 5]]);
 *   loss.backward(); // gradients flow through entire model
 *   console.log(loss.item()); // scalar loss value
 */
export function crossEntropyLoss(
  logits: Tensor,
  targets: number[][],
  mask?: number[][]
): Tensor {
  // ── Validate shapes ──
  if (logits.shape.length !== 3) {
    throw new Error(
      `crossEntropyLoss: logits must be 3D [B, S, V]. ` +
        `Got shape [${logits.shape}] (ndim=${logits.shape.length}).`
    );
  }

  const B = logits.shape[0];
  const S = logits.shape[1];
  const V = logits.shape[2];

  // ── Validate targets ──
  if (targets.length !== B) {
    throw new Error(
      `crossEntropyLoss: targets batch size mismatch. ` +
        `logits has ${B} batches, targets has ${targets.length}.`
    );
  }

  for (let b = 0; b < B; b++) {
    if (targets[b].length !== S) {
      throw new Error(
        `crossEntropyLoss: targets[${b}] length mismatch. ` +
          `logits has seq=${S}, targets[${b}] has ${targets[b].length}.`
      );
    }
    for (let s = 0; s < S; s++) {
      if (targets[b][s] < 0 || targets[b][s] >= V) {
        throw new Error(
          `crossEntropyLoss: targets[${b}][${s}] = ${targets[b][s]} ` +
            `out of vocab range [0, ${V - 1}].`
        );
      }
    }
  }

  // ── Validate mask (if provided) ──
  if (mask !== undefined) {
    if (mask.length !== B) {
      throw new Error(
        `crossEntropyLoss: mask batch size mismatch. ` +
          `logits has ${B} batches, mask has ${mask.length}.`
      );
    }
    for (let b = 0; b < B; b++) {
      if (mask[b].length !== S) {
        throw new Error(
          `crossEntropyLoss: mask[${b}] length mismatch. ` +
            `logits has seq=${S}, mask[${b}] has ${mask[b].length}.`
        );
      }
      for (let s = 0; s < S; s++) {
        if (mask[b][s] !== 0 && mask[b][s] !== 1) {
          throw new Error(
            `crossEntropyLoss: mask[${b}][${s}] = ${mask[b][s]} must be 0 or 1.`
          );
        }
      }
    }
  }

  // ── Validate sequence length ──
  const validPositions = S - 1;
  if (validPositions <= 0) {
    throw new Error(
      `crossEntropyLoss: sequence too short (S=${S}). ` +
        `Need at least 2 tokens for causal prediction.`
    );
  }

  // Count valid (contribute-to-loss) positions.
  let validCount = 0;
  if (mask !== undefined) {
    for (let b = 0; b < B; b++) {
      for (let s = 0; s < validPositions; s++) {
        validCount += mask[b][s];
      }
    }
  } else {
    validCount = B * validPositions;
  }

  // ============================================================
  // No valid positions → zero loss, zero gradient (edge case)
  // ============================================================
  if (validCount === 0) {
    const zero = new Tensor(
      new Float64Array([0]),
      [],
      logits.requiresGrad
    );
    if (zero.requiresGrad) {
      zero._ctx = {
        parents: [logits],
        backwardFn: () => {
          logits.accumulateGrad(new Float64Array(logits.size));
        },
      };
    }
    return zero;
  }

  // ============================================================
  // Forward pass
  // ============================================================

  // Store softmax probabilities and target indices for backward
  const savedProbs: Float64Array[] = new Array(validCount);
  const savedTargets: number[] = new Array(validCount);

  let totalLoss = 0;
  let posIdx = 0;

  for (let b = 0; b < B; b++) {
    for (let s = 0; s < validPositions; s++) {
      // Skip masked (ignored) positions — they contribute neither to the
      // forward loss nor to gradients. Padding positions are masked here.
      if (mask !== undefined && mask[b][s] !== 1) continue;

      const offset = (b * S + s) * V; // logits[b, s, :]
      const target = targets[b][s + 1]; // causal shift

      // Numerically stable softmax
      // Find max
      let maxVal = logits.data[offset];
      for (let v = 1; v < V; v++) {
        if (logits.data[offset + v] > maxVal) maxVal = logits.data[offset + v];
      }

      // Compute exp(v - max) and sum
      let sumExp = 0;
      const probs = new Float64Array(V);
      for (let v = 0; v < V; v++) {
        probs[v] = Math.exp(logits.data[offset + v] - maxVal);
        sumExp += probs[v];
      }

      // Normalize to probabilities
      for (let v = 0; v < V; v++) {
        probs[v] /= sumExp;
      }

      // NLL: -log(probs[target])
      // Clamp to avoid log(0)
      const probTarget = Math.max(probs[target], 1e-15);
      totalLoss += -Math.log(probTarget);

      // Save for backward
      savedProbs[posIdx] = probs;
      savedTargets[posIdx] = target;
      posIdx++;
    }
  }

  const meanLoss = totalLoss / validCount;

  // ============================================================
  // Build output Tensor with autograd context
  // ============================================================
  const out = new Tensor(
    new Float64Array([meanLoss]),
    [],
    logits.requiresGrad
  );

  if (out.requiresGrad) {
    out._ctx = {
      parents: [logits],
      backwardFn: (gradOutput: Float64Array) => {
        // dL/d(logits) — the upstream gradient from loss is 1.0
        // Since we used mean reduction over valid positions, we scale by
        // 1/validCount.
        const gradScale = gradOutput[0] / validCount;
        const gradLogits = new Float64Array(logits.size);

        let p = 0;
        for (let b = 0; b < B; b++) {
          for (let s = 0; s < validPositions; s++) {
            // Masked positions receive zero gradient (left as 0).
            if (mask !== undefined && mask[b][s] !== 1) continue;

            const offset = (b * S + s) * V;
            const probs = savedProbs[p];
            const target = savedTargets[p];

            // ∂CE/∂logit_i = probs_i - one_hot(target)_i
            // First: set all to probs_i * gradScale
            for (let v = 0; v < V; v++) {
              gradLogits[offset + v] = gradScale * probs[v];
            }
            // Then: subtract 1 at the target position
            gradLogits[offset + target] -= gradScale;

            p++;
          }
          // The last logit position (S-1) has no target —
          // gradient remains 0 (default from new Float64Array).
        }

        logits.accumulateGrad(gradLogits);
      },
    };
  }

  return out;
}
