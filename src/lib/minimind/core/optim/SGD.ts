// ============================================================
// SGDOptimizer — Stochastic Gradient Descent
// ============================================================
// Phase 38: Simple in-place SGD update rule.
//
// Formula:
//   param.data[i] -= learningRate * param.grad[i]
//
// Design:
//   - No momentum, no weight decay (future phases)
//   - No new Tensor creation — modifies param.data Float64Array in-place
//   - Skips parameters with null grad (safety)
//   - Preserves requiresGrad=true on all parameters
// ============================================================

import type { Parameter } from "../Parameter";
import { Optimizer } from "./Optimizer";

/**
 * Stochastic Gradient Descent optimizer.
 *
 * Applies the simplest possible parameter update:
 *   W = W - lr * ∇L(W)
 *
 * All operations are in-place on Float64Array data.
 * No new Tensors are created during step().
 *
 * Usage:
 *   const optim = new SGDOptimizer(model.parameters(), 0.01);
 *   loss.backward();
 *   optim.step();
 *   optim.zeroGrad();
 */
export class SGDOptimizer extends Optimizer {
  /** Learning rate — step size for gradient descent */
  learningRate: number;

  /**
   * @param parameters   - Model parameters from model.parameters()
   * @param learningRate - Step size (typically 1e-4 to 1e-2)
   */
  constructor(parameters: Parameter[], learningRate: number) {
    super(parameters);
    this.learningRate = learningRate;
  }

  /**
   * Apply SGD update to all parameters.
   *
   * For each parameter p:
   *   for i in 0..p.size:
   *     p.data[i] -= lr * p.grad[i]
   *
   * Parameters with null grad are silently skipped.
   */
  step(): void {
    const lr = this.learningRate;
    for (const p of this.parameters) {
      if (p.grad === null) continue;
      const data = p.data;
      const grad = p.grad;
      for (let i = 0; i < data.length; i++) {
        data[i] -= lr * grad[i];
      }
    }
  }
}
