// ============================================================
// TrainingMonitor — Training stability monitoring
// ============================================================
// Phase 44: Detects training anomalies in real-time.
//
// Monitors:
//   - NaN / Inf loss values
//   - NaN / Inf parameter values
//   - Gradient explosion (global norm exceeds threshold)
//   - Loss spikes (sudden jump > N × running average)
//
// Can optionally auto-abort training by throwing on critical
// conditions. Designed to hook into Trainer callbacks (onLog).
//
// Usage:
//   const monitor = new TrainingMonitor({ gradNormThreshold: 10, autoAbort: true });
//   // In onLog callback:
//   monitor.checkLoss(info.loss);
//   monitor.checkGradients(model.parameters());
//   if (monitor.alert) { ... stop training ... }
// ============================================================

import type { Parameter } from "../core/Parameter";
import { computeGlobalNorm } from "../core/GradientClipper";

// ============================================================
// Types
// ============================================================

/**
 * Alert level for training anomalies.
 */
export type AlertLevel = "ok" | "warning" | "critical";

/**
 * An alert raised by the monitor.
 */
export interface MonitorAlert {
  /** Alert severity level */
  level: AlertLevel;
  /** Human-readable message */
  message: string;
  /** Timestamp when alert was raised */
  timestamp: string;
}

/**
 * Configuration for TrainingMonitor.
 */
export interface MonitorOptions {
  /**
   * Global gradient norm threshold.
   * If exceeded, an alert is raised.
   * @default 10.0
   */
  gradNormThreshold?: number;

  /**
   * Factor for loss spike detection.
   * If current loss > lossSpikeFactor × running average, alert.
   * @default 5.0
   */
  lossSpikeFactor?: number;

  /**
   * If true, throw an Error on critical conditions (NaN loss, inf params)
   * instead of just recording an alert.
   * @default false
   */
  autoAbort?: boolean;
}

/**
 * Summary returned by the monitor after training.
 */
export interface MonitorSummary {
  /** Whether any alerts were raised */
  hadAlerts: boolean;
  /** Total number of alerts */
  alertCount: number;
  /** Number of warnings */
  warningCount: number;
  /** Number of critical alerts */
  criticalCount: number;
  /** All alerts in chronological order */
  alerts: MonitorAlert[];
}

// ============================================================
// TrainingMonitor
// ============================================================

export class TrainingMonitor {
  private alerts: MonitorAlert[];
  private runningLossAvg: number;
  private lossCount: number;
  private gradNormThreshold: number;
  private lossSpikeFactor: number;
  private autoAbort: boolean;
  private _lastGradNorm: number;

  constructor(options?: MonitorOptions) {
    this.alerts = [];
    this.runningLossAvg = 0;
    this.lossCount = 0;
    this.gradNormThreshold = options?.gradNormThreshold ?? 10.0;
    this.lossSpikeFactor = options?.lossSpikeFactor ?? 5.0;
    this.autoAbort = options?.autoAbort ?? false;
    this._lastGradNorm = 0;
  }

  // ============================================================
  // Checks
  // ============================================================

  /**
   * Check a loss value for NaN or infinity.
   *
   * @param loss - The loss value to check
   * @returns "ok", "nan", or "inf"
   */
  checkLoss(loss: number): "ok" | "nan" | "inf" {
    if (isNaN(loss)) {
      const alert: MonitorAlert = {
        level: "critical",
        message: `NaN loss detected at loss step. Training has diverged.`,
        timestamp: new Date().toISOString(),
      };
      this.alerts.push(alert);
      if (this.autoAbort) {
        throw new Error(`TrainingMonitor: ${alert.message}`);
      }
      return "nan";
    }

    if (!isFinite(loss)) {
      const alert: MonitorAlert = {
        level: "critical",
        message: `Infinite loss detected. Training has diverged.`,
        timestamp: new Date().toISOString(),
      };
      this.alerts.push(alert);
      if (this.autoAbort) {
        throw new Error(`TrainingMonitor: ${alert.message}`);
      }
      return "inf";
    }

    return "ok";
  }

  /**
   * Check model parameters for NaN or infinity values.
   *
   * Scans all parameter data buffers and returns the names of
   * any parameters containing NaN or infinity.
   *
   * @param parameters - Model parameters to scan
   * @returns Array of parameter names with bad values (empty if clean)
   */
  checkParameters(parameters: Parameter[]): string[] {
    const badParams: string[] = [];

    for (const p of parameters) {
      let hasBadValue = false;
      for (let i = 0; i < p.data.length; i++) {
        const v = p.data[i];
        if (isNaN(v) || !isFinite(v)) {
          hasBadValue = true;
          break;
        }
      }
      if (hasBadValue) {
        badParams.push(p.name ?? `param_${badParams.length}`);
      }
    }

    if (badParams.length > 0) {
      const names = badParams.join(", ");
      const alert: MonitorAlert = {
        level: "critical",
        message:
          `NaN/Inf detected in parameters: ${names}. ` +
          `Training has produced unstable weights.`,
        timestamp: new Date().toISOString(),
      };
      this.alerts.push(alert);
      if (this.autoAbort) {
        throw new Error(`TrainingMonitor: ${alert.message}`);
      }
    }

    return badParams;
  }

  /**
   * Check gradients for explosion.
   *
   * Computes the global gradient norm via `computeGlobalNorm()`.
   * If the norm exceeds the configured threshold, raises an alert.
   *
   * @param parameters - Model parameters (must have grad buffers)
   * @param threshold  - Optional per-call override of the threshold
   * @returns "ok" or "explosion"
   */
  checkGradients(parameters: Parameter[], threshold?: number): "ok" | "explosion" {
    const thresh = threshold ?? this.gradNormThreshold;
    const norm = computeGlobalNorm(parameters);
    this._lastGradNorm = norm;

    if (norm > thresh) {
      const alert: MonitorAlert = {
        level: "warning",
        message:
          `Gradient explosion detected: global norm = ${norm.toFixed(4)} ` +
          `(threshold: ${thresh}). Gradients should be clipped before step.`,
        timestamp: new Date().toISOString(),
      };
      this.alerts.push(alert);
      return "explosion";
    }

    return "ok";
  }

  /**
   * Check if the current loss is a spike relative to recent history.
   *
   * A spike is defined as: current loss > lossSpikeFactor × running average.
   * The running average is a simple cumulative mean of all losses seen.
   *
   * @param loss - The current loss value
   * @returns true if the loss is a spike, false otherwise
   */
  checkLossSpike(loss: number): boolean {
    // First check: establish baseline
    if (this.lossCount === 0) {
      this.runningLossAvg = loss;
      this.lossCount = 1;
      return false;
    }

    // Only flag spikes after we have some history
    if (this.lossCount >= 3) {
      const threshold = this.runningLossAvg * this.lossSpikeFactor;
      if (loss > threshold) {
        const alert: MonitorAlert = {
          level: "warning",
          message:
            `Loss spike detected: ${loss.toFixed(4)} > ` +
            `${this.lossSpikeFactor}× running avg (${this.runningLossAvg.toFixed(4)}). ` +
            `This may indicate a bad batch or unstable learning rate.`,
          timestamp: new Date().toISOString(),
        };
        this.alerts.push(alert);
        return true;
      }
    }

    // Update running average
    this.runningLossAvg =
      (this.runningLossAvg * this.lossCount + loss) / (this.lossCount + 1);
    this.lossCount++;

    return false;
  }

  // ============================================================
  // Accessors
  // ============================================================

  /**
   * Most recent gradient norm from checkGradients().
   */
  get lastGradNorm(): number {
    return this._lastGradNorm;
  }

  /**
   * Whether any alerts have been raised.
   */
  get hasAlerts(): boolean {
    return this.alerts.length > 0;
  }

  /**
   * Most recent alert, or undefined if none.
   */
  get latestAlert(): MonitorAlert | undefined {
    if (this.alerts.length === 0) return undefined;
    return this.alerts[this.alerts.length - 1];
  }

  /**
   * Generate a summary of all monitoring activity.
   */
  get summary(): MonitorSummary {
    let warningCount = 0;
    let criticalCount = 0;

    for (const alert of this.alerts) {
      if (alert.level === "warning") warningCount++;
      else if (alert.level === "critical") criticalCount++;
    }

    return {
      hadAlerts: this.alerts.length > 0,
      alertCount: this.alerts.length,
      warningCount,
      criticalCount,
      alerts: [...this.alerts],
    };
  }

  /**
   * Reset all alert history and running statistics.
   */
  reset(): void {
    this.alerts = [];
    this.runningLossAvg = 0;
    this.lossCount = 0;
    this._lastGradNorm = 0;
  }
}
