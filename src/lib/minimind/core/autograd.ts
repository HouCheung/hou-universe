// ============================================================
// Autograd — Backward engine for MiniMind Tensor
// ============================================================
// Implements dynamic computation graph traversal:
//  1. Topological sort via DFS post-order
//  2. Reverse-mode gradient propagation
//  3. Error handling for edge cases
// ============================================================

import type { Tensor } from "./Tensor";

/**
 * BackwardContext is stored in each non-leaf Tensor's _ctx field.
 * It holds the parent tensors and a closure that computes their gradients.
 *
 * The backwardFn receives the gradient of the loss w.r.t. THIS tensor
 * (gradOutput) and is responsible for computing and accumulating
 * gradients w.r.t. each parent via parent.accumulateGrad().
 */
export interface BackwardContext {
  /** Tensors that produced this tensor — edges in the computation DAG */
  parents: Tensor[];

  /**
   * Backward function.
   * @param gradOutput - Gradient of loss w.r.t. this tensor's data
   */
  backwardFn: (gradOutput: Float64Array) => void;
}

/**
 * Build a topological ordering of all nodes reachable from `node`
 * via _ctx.parents. Uses DFS post-order: children appear before parents.
 *
 * The ordering guarantees: for every edge u→v (u depends on v),
 * v appears before u in the result. This means iterating in REVERSE
 * order processes outputs first, then their inputs.
 */
export function buildTopologicalOrder(node: Tensor): Tensor[] {
  const visited = new Set<Tensor>();
  const topo: Tensor[] = [];

  function dfs(n: Tensor): void {
    if (visited.has(n)) return;
    visited.add(n);

    if (n._ctx !== null) {
      for (const parent of n._ctx.parents) {
        dfs(parent);
      }
    }

    topo.push(n);
  }

  dfs(node);
  return topo;
}

/**
 * Execute the backward pass starting from `loss`.
 *
 * Steps:
 *  1. Validate: only scalar tensors can call backward
 *  2. Guard against double-backward
 *  3. Build topological order via DFS post-order
 *  4. Initialize loss.grad = [1.0] (dLoss/dLoss = 1)
 *  5. Execute backwardFn for each node in reverse topo order
 */
export function executeBackward(loss: Tensor): void {
  // ── Validate: scalar tensor required ──
  if (loss.shape.length > 0 && loss.size !== 1) {
    throw new Error(
      `backward() requires a scalar tensor. Got shape [${loss.shape}], size=${loss.size}. ` +
        `For non-scalar output, call .backward() on a reduced version (e.g., loss.sum()).`
    );
  }

  // ── Guard against double-backward ──
  // Check if backward has already been called (grad already initialized)
  if (loss.grad !== null && loss.grad.some((v) => v !== 0)) {
    throw new Error(
      "backward() has already been called on this tensor. " +
        "To compute gradients again, call zeroGrad() on all parameters first."
    );
  }

  // ── Build topological order ──
  const topo = buildTopologicalOrder(loss);

  // ── Initialize gradient ──
  // dLoss/dLoss = 1.0
  if (loss.grad === null) {
    loss.grad = new Float64Array(loss.data.length);
  }
  loss.grad.fill(1.0);

  // ── Execute backward functions in reverse topological order ──
  // Reverse so outputs are processed before inputs
  for (let i = topo.length - 1; i >= 0; i--) {
    const node = topo[i];
    if (node._ctx !== null && node.grad !== null) {
      // Call the backward closure with gradOutput = node.grad
      node._ctx.backwardFn(node.grad);
    }
  }
}
