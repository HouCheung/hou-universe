// ============================================================
// Gradient check utility — finite difference verification
// ============================================================

import type { Tensor } from "../Tensor";

/**
 * Verify analytic gradients against numerical (finite difference) gradients.
 *
 * For each element of each parameter tensor, we:
 *  1. Compute analytic gradient via backward()
 *  2. Compute numerical gradient via central finite differences:
 *     df/dx ≈ (f(x+ε) - f(x-ε)) / (2ε)
 *  3. Compare the two
 *
 * @param computeLoss - Function that takes parameter tensors and returns a scalar loss.
 *                      Must build the computation graph fresh each call.
 * @param params      - Parameter tensors to check gradients for.
 * @param epsilon     - Finite difference step size (default 1e-4).
 * @param tolerance   - Maximum allowed absolute difference (default 1e-4).
 * @returns Object with { passed, maxDiff, details }
 */
export function gradientCheck(
  computeLoss: (params: Tensor[]) => Tensor,
  params: Tensor[],
  epsilon: number = 1e-4,
  tolerance: number = 1e-4
): { passed: boolean; maxDiff: number; details: string[] } {
  const details: string[] = [];

  // 1. Compute analytic gradients
  for (const p of params) {
    p.zeroGrad();
  }

  const loss = computeLoss(params);
  loss.backward();

  // Store analytic gradients
  const analyticGrads: Float64Array[] = [];
  for (const p of params) {
    if (p.grad === null) {
      details.push(`  param: grad is null (requiresGrad=${p.requiresGrad})`);
      return { passed: false, maxDiff: Infinity, details };
    }
    analyticGrads.push(new Float64Array(p.grad));
  }

  // 2. Compute numerical gradients for each parameter element
  let maxDiff = 0;

  for (let pIdx = 0; pIdx < params.length; pIdx++) {
    const p = params[pIdx];
    const analytic = analyticGrads[pIdx];

    for (let i = 0; i < p.size; i++) {
      const origValue = p.data[i];

      // f(x + ε)
      p.data[i] = origValue + epsilon;
      const lossPlus = computeLoss(params).item();

      // f(x - ε)
      p.data[i] = origValue - epsilon;
      const lossMinus = computeLoss(params).item();

      // Restore
      p.data[i] = origValue;

      // Central difference
      const numerical = (lossPlus - lossMinus) / (2 * epsilon);
      const diff = Math.abs(analytic[i] - numerical);

      if (diff > maxDiff) {
        maxDiff = diff;
      }

      // Relative error for small gradients
      const absSum = Math.abs(analytic[i]) + Math.abs(numerical);
      const relDiff = absSum > 1e-8 ? diff / absSum : diff;

      if (diff > tolerance && relDiff > tolerance) {
        details.push(
          `  param[${pIdx}][${i}]: analytic=${analytic[i].toExponential(6)}, ` +
            `numerical=${numerical.toExponential(6)}, diff=${diff.toExponential(6)}, relDiff=${relDiff.toExponential(6)}`
        );
      }
    }
  }

  const passed = maxDiff < tolerance;
  return { passed, maxDiff, details };
}
