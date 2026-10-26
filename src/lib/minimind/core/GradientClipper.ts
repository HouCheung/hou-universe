// ============================================================
// MiniMind Core — GradientClipper.ts
// ============================================================
// Gradient clipping utility for training stability.
//
// Implements "clip by global norm" — the standard approach used
// in GPT training (Pascanu et al., 2013). When the global L2 norm
// of all gradients exceeds a threshold, gradients are scaled down
// proportionally.
//
// Usage:
//   // After backward(), before optimizer.step():
//   clipGradients(model.parameters(), 1.0);
//   optimizer.step();
// ============================================================

import type { Parameter } from "./Parameter";

/**
 * Clip gradients by global L2 norm.
 *
 * Computes the total L2 norm across all parameter gradients.
 * If the total norm exceeds `maxNorm`, scales all gradients
 * by `maxNorm / totalNorm`.
 *
 * This prevents gradient explosion during training, especially
 * important for:
 *   - Deep models with many layers
 *   - High learning rates
 *   - Unstable initialization
 *   - Long sequence training
 *
 * @param parameters — Model parameters (must have grad buffers)
 * @param maxNorm — Maximum allowed global gradient norm
 * @returns The pre-clip global norm (useful for logging)
 */
export function clipGradients(
  parameters: Parameter[],
  maxNorm: number
): number {
  if (maxNorm <= 0) {
    return computeGlobalNorm(parameters);
  }

  // Step 1: Compute total L2 norm squared
  let totalNormSq = 0;
  for (const p of parameters) {
    if (p.grad !== null && p.requiresGrad) {
      const grad = p.grad;
      for (let i = 0; i < grad.length; i++) {
        totalNormSq += grad[i] * grad[i];
      }
    }
  }

  const totalNorm = Math.sqrt(totalNormSq);

  // Step 2: Scale if exceeds threshold
  if (totalNorm > maxNorm && totalNorm > 0) {
    const scale = maxNorm / totalNorm;
    for (const p of parameters) {
      if (p.grad !== null && p.requiresGrad) {
        const grad = p.grad;
        for (let i = 0; i < grad.length; i++) {
          grad[i] *= scale;
        }
      }
    }
  }

  return totalNorm;
}

/**
 * Compute global gradient norm without clipping.
 * Useful for monitoring gradient health during training.
 */
export function computeGlobalNorm(parameters: Parameter[]): number {
  let totalNormSq = 0;
  for (const p of parameters) {
    if (p.grad !== null && p.requiresGrad) {
      const grad = p.grad;
      for (let i = 0; i < grad.length; i++) {
        totalNormSq += grad[i] * grad[i];
      }
    }
  }
  return Math.sqrt(totalNormSq);
}

/**
 * Clip gradients by value (element-wise).
 *
 * Clamps each gradient element to [-clipValue, clipValue].
 * Less common than global norm clipping, but useful for
 * certain optimization scenarios.
 *
 * @param parameters — Model parameters
 * @param clipValue — Maximum absolute value for any gradient element
 */
export function clipGradientsByValue(
  parameters: Parameter[],
  clipValue: number
): void {
  for (const p of parameters) {
    if (p.grad !== null && p.requiresGrad) {
      const grad = p.grad;
      for (let i = 0; i < grad.length; i++) {
        if (grad[i] > clipValue) {
          grad[i] = clipValue;
        } else if (grad[i] < -clipValue) {
          grad[i] = -clipValue;
        }
      }
    }
  }
}
