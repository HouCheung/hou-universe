// ============================================================
// Parameter — Differentiable parameter wrapper for MiniMind
// ============================================================
// Extends Tensor with a name and requiresGrad=true by default.
// Parameters are the atomic unit of model state — weights and
// biases that the optimizer updates during training.
//
// Design:
//   - Extends Tensor (inherits data, shape, grad, _ctx, autograd ops)
//   - requiresGrad defaults to true (parameters are trainable)
//   - name property for identification in parameter registries
//   - Minimal surface area — just Tensor + name + default
// ============================================================

import { Tensor } from "./Tensor";

export class Parameter extends Tensor {
  /** Human-readable identifier, e.g. "attention.W_Q" or "ffn.W_gate" */
  readonly name: string;

  /**
   * Create a named parameter from an existing Tensor.
   *
   * The parameter shares the tensor's data and gradient buffer
   * (no copy). requiresGrad is forced to true regardless of the
   * source tensor's setting.
   *
   * @param tensor  - Source tensor providing data, shape, grad
   * @param name    - Identifier for registry lookups
   *
   * Example:
   *   const weight = new Parameter(Tensor.randn([512, 512]), "attention.W_Q");
   *   weight.name  // → "attention.W_Q"
   *   weight.requiresGrad  // → true
   */
  constructor(tensor: Tensor, name: string) {
    // Force requiresGrad=true for all parameters
    super(
      new Float64Array(tensor.data),
      [...tensor.shape],
      true, // parameters are always trainable
      null  // parameters are leaf tensors (no autograd _ctx)
    );

    // Copy over existing gradient if the source tensor had one
    if (tensor.grad !== null) {
      this.grad = new Float64Array(tensor.grad);
    }

    this.name = name;
  }

  /**
   * Convenience factory: create a Parameter from shape + random init.
   *
   * @param shape  - Shape of the parameter tensor
   * @param name   - Identifier for registry lookups
   * @param init   - "randn" (default) | "zeros" | "uniform"
   *
   * Example:
   *   const W = Parameter.of([512, 2048], "ffn.W_gate");
   */
  static of(
    shape: number[],
    name: string,
    init: "randn" | "zeros" | "uniform" = "randn"
  ): Parameter {
    let tensor: Tensor;
    switch (init) {
      case "zeros":
        tensor = Tensor.zeros(shape);
        break;
      case "uniform":
        tensor = Tensor.uniform(shape, -1, 1);
        break;
      case "randn":
      default:
        tensor = Tensor.randn(shape);
        break;
    }
    return new Parameter(tensor, name);
  }

  /** Human-readable representation for debugging */
  toString(): string {
    const shapeStr = `[${this.shape.join(", ")}]`;
    return `Parameter("${this.name}", shape=${shapeStr}, requiresGrad=true)`;
  }
}
