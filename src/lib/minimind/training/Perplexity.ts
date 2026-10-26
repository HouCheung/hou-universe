// ============================================================
// Perplexity — Perplexity metric for language model evaluation
// ============================================================
// Phase 41: Standard language model evaluation metric.
//
// Perplexity = exp(cross-entropy loss)
//
// Interpretation:
//   - Perplexity of N means the model is as confused as if
//     it were choosing uniformly among N options.
//   - Lower is better: PPL=1 is perfect prediction.
//   - For a vocabulary of size V, uniform random guessing
//     yields PPL ≈ V.
//
// Usage:
//   const ppl = Perplexity.fromLoss(2.31);
//   // ppl ≈ 10.07
//
//   const ppl = Perplexity.fromLogits(logits, targets);
//   // computes loss internally, then exp(loss)
// ============================================================

import { Tensor } from "../core/Tensor";
import { crossEntropyLoss } from "../core/loss/CrossEntropyLoss";

/**
 * Perplexity — static utility for computing perplexity from loss.
 *
 * All methods are static. No instance state is required.
 */
export class Perplexity {
  /**
   * Compute perplexity from a scalar cross-entropy loss value.
   *
   * Perplexity = exp(loss)
   *
   * Clamped to Number.MAX_VALUE to prevent overflow for very
   * high loss values (e.g., initial random model).
   *
   * @param loss - Cross-entropy loss (scalar, natural log base)
   * @returns Perplexity = exp(loss), clamped to MAX_VALUE
   *
   * Example:
   *   Perplexity.fromLoss(0)    // → 1.0  (perfect)
   *   Perplexity.fromLoss(2.31) // → ~10.1
   *   Perplexity.fromLoss(4.61) // → ~100
   */
  static fromLoss(loss: number): number {
    if (!isFinite(loss)) {
      return Number.MAX_VALUE;
    }
    // Clamp to avoid overflow: exp(710) ≈ 1.5e308 ≈ MAX_VALUE
    // log(Number.MAX_VALUE) ≈ 709.78
    const clamped = Math.min(loss, 709);
    return Math.exp(clamped);
  }

  /**
   * Compute perplexity directly from model logits and targets.
   *
   * Computes crossEntropyLoss internally, then returns exp(loss).
   * Convenience wrapper — equivalent to:
   *
   *   Perplexity.fromLoss(crossEntropyLoss(logits, targets).item())
   *
   * @param logits  - Model output [B, S, V]
   * @param targets - Target token IDs, targets[b][s]
   * @returns Perplexity = exp(crossEntropyLoss)
   */
  static fromLogits(logits: Tensor, targets: number[][]): number {
    const lossTensor = crossEntropyLoss(logits, targets);
    return Perplexity.fromLoss(lossTensor.item());
  }

  /**
   * Compute loss from perplexity (inverse operation).
   *
   * loss = log(perplexity)
   *
   * @param ppl - Perplexity value (must be >= 1)
   * @returns Cross-entropy loss
   */
  static toLoss(ppl: number): number {
    if (ppl < 1) {
      throw new Error(
        `Perplexity.toLoss: perplexity must be >= 1, got ${ppl}`
      );
    }
    return Math.log(ppl);
  }

  /**
   * Human-readable interpretation of a perplexity value.
   *
   * @param ppl - Perplexity value
   * @returns Qualitative description
   */
  static interpret(ppl: number): string {
    if (ppl < 0) return "invalid";
    if (ppl < 2) return "near-perfect";
    if (ppl < 5) return "excellent";
    if (ppl < 15) return "good";
    if (ppl < 50) return "moderate";
    if (ppl < 200) return "poor";
    return "random-level";
  }
}
