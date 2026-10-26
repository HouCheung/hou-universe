// ============================================================
// ParameterRegistry — Central parameter management for MiniMind
// ============================================================
// Stores named Parameter instances and provides enumeration,
// gradient zeroing, and lookup. Can be used standalone or
// composed into Module.
//
// API:
//   register(name, parameter) — add a parameter
//   parameters()              — flat Parameter[]
//   namedParameters()         — { name, parameter }[]
//   zeroGrad()                — reset all gradients to zero
//   get(name)                 — lookup by name
//   size                      — number of registered parameters
// ============================================================

import type { Parameter } from "./Parameter";

export interface NamedParameter {
  name: string;
  parameter: Parameter;
}

export class ParameterRegistry {
  private _params: Map<string, Parameter> = new Map();
  /** Ordered list to preserve registration order for deterministic enumeration */
  private _order: string[] = [];

  /**
   * Register a parameter with the registry.
   *
   * Throws if a parameter with the same name is already registered.
   *
   * @param name      - Unique identifier (e.g. "attention.W_Q")
   * @param parameter - The Parameter instance to track
   *
   * Example:
   *   registry.register("ffn.W_gate", gateParam);
   */
  register(name: string, parameter: Parameter): void {
    if (this._params.has(name)) {
      throw new Error(
        `ParameterRegistry: duplicate parameter name "${name}". ` +
        `Use a unique name or call unregister() first.`
      );
    }
    this._params.set(name, parameter);
    this._order.push(name);
  }

  /**
   * Remove a parameter from the registry.
   * No-op if the name is not registered.
   */
  unregister(name: string): void {
    this._params.delete(name);
    this._order = this._order.filter((n) => n !== name);
  }

  /**
   * Look up a parameter by name.
   * Returns undefined if not found.
   */
  get(name: string): Parameter | undefined {
    return this._params.get(name);
  }

  /**
   * Return all parameters as a flat array in registration order.
   *
   * This is the primary API for optimizers:
   *   for (const p of registry.parameters()) {
   *     // update p.data using p.grad
   *   }
   */
  parameters(): Parameter[] {
    return this._order.map((name) => this._params.get(name)!);
  }

  /**
   * Return all parameters with their names in registration order.
   *
   * Useful for debugging and logging:
   *   for (const { name, parameter } of registry.namedParameters()) {
   *     console.log(name, parameter.shape);
   *   }
   */
  namedParameters(): NamedParameter[] {
    return this._order.map((name) => ({
      name,
      parameter: this._params.get(name)!,
    }));
  }

  /**
   * Reset gradients of all registered parameters to zero.
   *
   * Call before each training step:
   *   optimizer.zeroGrad()  // typically delegates to this
   */
  zeroGrad(): void {
    for (const name of this._order) {
      this._params.get(name)!.zeroGrad();
    }
  }

  /** Number of registered parameters */
  get size(): number {
    return this._order.length;
  }

  /** Total number of scalar elements across all parameters */
  get totalElements(): number {
    let total = 0;
    for (const name of this._order) {
      total += this._params.get(name)!.size;
    }
    return total;
  }
}
