// ============================================================
// Module — PyTorch-style nn.Module base class for MiniMind
// ============================================================
// Provides parameter registry and sub-module management.
// MiniMindModel (and future model components) extend Module
// to gain model.parameters(), model.zeroGrad(), etc.
//
// Design (PyTorch-aligned):
//   - Each Module owns a ParameterRegistry for its direct parameters
//   - Modules can contain child modules (sub-modules)
//   - parameters() recursively collects from self + all children
//   - namedParameters() prefixes child parameter names with module path
//   - zeroGrad() propagates to all parameters in the module tree
//
// Usage:
//   class MyModel extends Module {
//     constructor() {
//       super();
//       this.registerParameter("weight", Parameter.of([10, 10], "weight"));
//     }
//   }
//   const model = new MyModel();
//   model.parameters();       // → [weight]
//   model.namedParameters();  // → [{ name: "weight", parameter: ... }]
// ============================================================

import type { Parameter } from "./Parameter";
import type { NamedParameter } from "./ParameterRegistry";
import { ParameterRegistry } from "./ParameterRegistry";

export class Module {
  private _registry: ParameterRegistry = new ParameterRegistry();
  private _modules: Module[] = [];

  /**
   * Register a parameter directly on this module.
   *
   * The parameter name should be scoped to this module
   * (e.g. "W_Q" not "attention.W_Q" — the module tree
   * adds the prefix during namedParameters() collection).
   *
   * @param name      - Local parameter name
   * @param parameter - The Parameter instance
   */
  protected registerParameter(name: string, parameter: Parameter): void {
    this._registry.register(name, parameter);
  }

  /**
   * Register a child module for recursive parameter collection.
   *
   * @param name   - Local module name (e.g. "attention", "ffn")
   * @param module - The child Module instance
   */
  protected registerModule(name: string, module: Module): void {
    // Store the module with its name by convention via a named wrapper
    // We store both the module and its local name for prefix generation
    (module as Module & { _parentName: string })._parentName = name;
    this._modules.push(module);
  }

  /**
   * Collect all parameters from this module and all child modules.
   *
   * Returns a flat array in depth-first, registration order.
   * This is the primary API for optimizers.
   *
   * Example:
   *   const optim = new SGD(model.parameters(), lr=0.01);
   */
  parameters(): Parameter[] {
    const result: Parameter[] = [];

    // Direct parameters first
    for (const p of this._registry.parameters()) {
      result.push(p);
    }

    // Recursively collect from child modules
    for (const child of this._modules) {
      for (const p of child.parameters()) {
        result.push(p);
      }
    }

    return result;
  }

  /**
   * Collect all parameters with their fully-qualified names.
   *
   * Names are built by joining module names with "." separators,
   * giving paths like "attention.W_Q" or "blocks.0.ffn.W_gate".
   *
   * Example:
   *   for (const { name, parameter } of model.namedParameters()) {
   *     console.log(`${name}: ${parameter.shape}`);
   *   }
   */
  namedParameters(): NamedParameter[] {
    const result: NamedParameter[] = [];

    // Direct parameters — no prefix needed at top level
    for (const { name, parameter } of this._registry.namedParameters()) {
      result.push({ name, parameter });
    }

    // Recursively collect from child modules with prefix
    for (const child of this._modules) {
      const childName = (child as Module & { _parentName?: string })._parentName ?? "";
      for (const { name, parameter } of child.namedParameters()) {
        const fullName = childName ? `${childName}.${name}` : name;
        result.push({ name: fullName, parameter });
      }
    }

    return result;
  }

  /**
   * Zero all gradients in this module and all child modules.
   *
   * Call before each optimizer step:
   *   model.zeroGrad();
   *   // ... forward + backward ...
   *   optimizer.step();
   */
  zeroGrad(): void {
    this._registry.zeroGrad();
    for (const child of this._modules) {
      child.zeroGrad();
    }
  }
}
