// ============================================================
// AdamWOptimizer — Decoupled Weight Decay Adam
// ============================================================
// Phase 39: Production-style AdamW optimizer with decoupled
// weight decay, bias correction, and lazy state initialization.
//
// Algorithm (decoupled AdamW):
//   For each parameter θ with gradient g:
//     t = t + 1
//     m = β₁·m + (1-β₁)·g           // first moment (momentum)
//     v = β₂·v + (1-β₂)·g²          // second moment (RMS)
//     m̂ = m / (1 - β₁^t)            // bias-corrected first moment
//     v̂ = v / (1 - β₂^t)            // bias-corrected second moment
//     θ = θ - lr · (m̂ / (√v̂ + ε) + λ·θ)  // decoupled weight decay
//
// Design:
//   - Lazy state initialization: m, v buffers created on first step()
//   - Parameter identity tracked via WeakMap (no string keys)
//   - All operations in-place on Float64Array — no Tensor allocation
//   - Compatible with Parameter[] from model.parameters()
//   - PyTorch-style API: AdamW(params, lr, betas, eps, weight_decay)
// ============================================================

import type { Parameter } from "../Parameter";
import { Optimizer } from "./Optimizer";

/**
 * Per-parameter optimizer state for AdamW.
 *
 * Stores first and second moment estimates (m, v) as Float64Arrays
 * matching the parameter data length. Created lazily on first step().
 */
interface AdamWState {
  m: Float64Array; // first moment (momentum)
  v: Float64Array; // second moment (RMS)
}

/**
 * AdamW optimizer configuration.
 */
export interface AdamWConfig {
  /** Learning rate (default: 0.001) */
  lr: number;
  /** Beta coefficients for first/second moment decay (default: [0.9, 0.999]) */
  betas: [number, number];
  /** Epsilon for numerical stability (default: 1e-8) */
  eps: number;
  /** Decoupled weight decay coefficient (default: 0.01) */
  weightDecay: number;
}

const DEFAULT_CONFIG: AdamWConfig = {
  lr: 0.001,
  betas: [0.9, 0.999],
  eps: 1e-8,
  weightDecay: 0.01,
};

/**
 * AdamW optimizer with decoupled weight decay.
 *
 * Implements the AdamW variant from "Decoupled Weight Decay Regularization"
 * (Loshchilov & Hutter, 2019). Unlike standard Adam+L2 regularization,
 * AdamW applies weight decay directly to the parameters, decoupled from
 * the adaptive gradient scaling.
 *
 * Usage:
 *   const optim = new AdamWOptimizer(model.parameters(), {
 *     lr: 0.001,
 *     betas: [0.9, 0.999],
 *     eps: 1e-8,
 *     weightDecay: 0.01,
 *   });
 *   loss.backward();
 *   optim.step();
 *   optim.zeroGrad();
 */
export class AdamWOptimizer extends Optimizer {
  /** Learning rate — writable for LR scheduler integration */
  lr: number;

  /** Beta coefficients: [β₁, β₂] */
  readonly betas: [number, number];

  /** Epsilon for numerical stability */
  readonly eps: number;

  /** Decoupled weight decay coefficient */
  readonly weightDecay: number;

  /** Step counter — incremented each step() call, used for bias correction */
  private t: number;

  /**
   * Per-parameter state map.
   * Uses WeakMap keyed by Parameter for identity-based tracking.
   * State is lazily initialized on first step().
   */
  private state: WeakMap<Parameter, AdamWState>;

  /**
   * @param parameters  - Model parameters from model.parameters()
   * @param config      - AdamW hyperparameters (partial — defaults filled in)
   */
  constructor(
    parameters: Parameter[],
    config: Partial<AdamWConfig> = {}
  ) {
    super(parameters);

    const cfg: AdamWConfig = { ...DEFAULT_CONFIG, ...config };
    this.lr = cfg.lr;
    this.betas = cfg.betas;
    this.eps = cfg.eps;
    this.weightDecay = cfg.weightDecay;
    this.t = 0;
    this.state = new WeakMap();

    // Eagerly initialize state for all parameters to amortize allocation cost
    for (const p of this.parameters) {
      this.ensureState(p);
    }
  }

  /**
   * Lazily initialize AdamW state for a parameter.
   *
   * Creates zero-initialized m (first moment) and v (second moment) buffers
   * matching the parameter data length. Called in constructor and as a safety
   * net in step() if a parameter's state is somehow missing.
   */
  private ensureState(p: Parameter): AdamWState {
    let s = this.state.get(p);
    if (s === undefined) {
      s = {
        m: new Float64Array(p.data.length),
        v: new Float64Array(p.data.length),
      };
      this.state.set(p, s);
    }
    return s;
  }

  /**
   * Apply AdamW update to all parameters.
   *
   * For each parameter p with gradient g:
   *   1. Increment step counter t
   *   2. Update biased moments: m = β₁·m + (1-β₁)·g, v = β₂·v + (1-β₂)·g²
   *   3. Compute bias-corrected estimates: m̂ = m/(1-β₁^t), v̂ = v/(1-β₂^t)
   *   4. Apply decoupled update: θ -= lr · (m̂/(√v̂ + ε) + λ·θ)
   *
   * Parameters with null grad are silently skipped.
   */
  step(): void {
    this.t += 1;
    const t = this.t;
    const lr = this.lr;
    const beta1 = this.betas[0];
    const beta2 = this.betas[1];
    const eps = this.eps;
    const wd = this.weightDecay;

    // Pre-compute bias correction denominators
    // biasCorrection1 = 1 / (1 - β₁^t)  — we apply as: m * corr1 / (sqrt(v * corr2) + eps)
    // biasCorrection2 = 1 / (1 - β₂^t)
    const biasCorrection1 = 1.0 / (1.0 - Math.pow(beta1, t));
    const biasCorrection2 = 1.0 / (1.0 - Math.pow(beta2, t));

    for (const p of this.parameters) {
      if (p.grad === null) continue;

      const s = this.ensureState(p);
      const data = p.data;
      const grad = p.grad;
      const m = s.m;
      const v = s.v;

      for (let i = 0; i < data.length; i++) {
        const g = grad[i];

        // Update biased first moment estimate
        m[i] = beta1 * m[i] + (1.0 - beta1) * g;

        // Update biased second raw moment estimate
        v[i] = beta2 * v[i] + (1.0 - beta2) * g * g;

        // Bias-corrected estimates
        const mHat = m[i] * biasCorrection1;
        const vHat = v[i] * biasCorrection2;

        // AdamW update: θ -= lr * (m̂ / (√v̂ + ε) + λ * θ)
        // Weight decay is decoupled — applied directly to θ, not through gradient
        data[i] -= lr * (mHat / (Math.sqrt(vHat) + eps) + wd * data[i]);
      }
    }
  }

  /**
   * Get the current step count.
   *
   * Useful for learning rate schedulers and debugging.
   */
  getStepCount(): number {
    return this.t;
  }

  /**
   * Get the optimizer state for a specific parameter.
   *
   * Returns { m, v } Float64Arrays or undefined if not yet initialized.
   * Useful for testing and inspection.
   */
  getState(p: Parameter): AdamWState | undefined {
    return this.state.get(p);
  }
}
