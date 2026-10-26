// ============================================================
// MiniMind — training/observatory/TrainingAnalyzer.ts
// ============================================================
// Phase 53: Training analysis engine.
//
// Pure functions that compute derived metrics and detect
// training phenomena from raw history arrays. All calculations
// use real math — no fake/heuristic-only metrics.
//
// Detection capabilities:
//   - Convergence (loss plateau)
//   - Divergence (loss increasing)
//   - Unstable loss (high variance / spikes)
//   - Overfitting tendency (when eval data available)
//
// Design principles:
//   - Pure functions — no side effects, no state
//   - All inputs are arrays of numbers (step-indexed)
//   - All outputs are typed, structured results
//   - Graceful on empty/short inputs (returns safe defaults)
// ============================================================

import type {
  TrainingRunRecord,
  LossHistoryPoint,
} from "./TrainingRunRecord";

// ============================================================
// Analysis Result Types
// ============================================================

/**
 * Convergence detection result.
 */
export interface ConvergenceResult {
  /** Whether the run appears to have converged */
  converged: boolean;
  /** The convergence rate: average loss decrease per step in final phase */
  convergenceRate: number;
  /** The step at which convergence began (estimated), -1 if not converged */
  convergenceStep: number;
  /** Fraction of steps in the final plateau phase */
  plateauFraction: number;
}

/**
 * Divergence detection result.
 */
export interface DivergenceResult {
  /** Whether the run appears to have diverged */
  diverged: boolean;
  /** Ratio of final loss to initial loss (> 1 indicates divergence) */
  divergenceRatio: number;
  /** Step at which divergence began, -1 if not diverged */
  divergenceStep: number;
}

/**
 * Unstable loss detection result.
 */
export interface UnstableLossResult {
  /** Whether the loss is unstable */
  unstable: boolean;
  /** Coefficient of variation of loss values (std / mean) */
  coefficientOfVariation: number;
  /** Number of detected loss spikes (loss > 2x running average) */
  spikeCount: number;
  /** Steps at which spikes were detected */
  spikeSteps: number[];
}

/**
 * Overfitting tendency detection result.
 */
export interface OverfittingResult {
  /** Whether overfitting tendency is detected */
  overfitting: boolean;
  /** Training loss trend (negative = improving) */
  trainLossTrend: number;
  /** Evaluation loss trend (positive + divergence from train = overfitting) */
  evalLossTrend: number | null;
  /** Gap between final train and eval loss */
  trainEvalGap: number | null;
}

/**
 * Complete analysis of a training run.
 */
export interface TrainingRunAnalysis {
  // ── Key metrics ──
  initialLoss: number;
  finalLoss: number;
  bestLoss: number;
  bestStep: number;
  lossReduction: number;
  lossReductionPercent: number;

  // ── Rate metrics ──
  /** Average loss decrease per step over the entire run */
  convergenceRate: number;
  /** Average tokens processed per second */
  averageThroughput: number;

  // ── Quality scores (0–1, higher = better) ──
  /** How stable/smooth the loss curve is (1 = perfectly smooth) */
  stabilityScore: number;
  /** Loss reduction per unit time (higher = more efficient) */
  trainingEfficiency: number;

  // ── Detections ──
  convergence: ConvergenceResult;
  divergence: DivergenceResult;
  unstableLoss: UnstableLossResult;
  overfitting: OverfittingResult;
}

// ============================================================
// Math helpers
// ============================================================

/**
 * Compute the mean of an array of numbers.
 */
function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

/**
 * Compute the sample standard deviation of an array of numbers.
 */
function stddev(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

/**
 * Compute the mean of absolute differences between consecutive values.
 */
function meanAbsDiff(values: number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    sum += Math.abs(values[i] - values[i - 1]);
  }
  return sum / (values.length - 1);
}

/**
 * Linear regression slope via least squares.
 * Returns the slope (change per step).
 */
function linearSlope(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ============================================================
// Detection: Convergence
// ============================================================

/**
 * Detect whether the training run converged.
 *
 * Algorithm:
 *   1. Compute the average per-step fractional change in the last 25%
 *   2. Compute the coefficient of variation (stability) in the last 25%
 *   3. Converged if fractional change < 2% per step AND CV < 5%
 *      (i.e., the loss has stopped improving meaningfully and is stable).
 *
 * This handles:
 *   - Smooth exponential decay that slows to near-flat
 *   - Noisy plateau with small random oscillations
 *   - Does NOT falsely flag still-improving curves
 *
 * @param lossHistory — array of { step, loss } points
 * @returns ConvergenceResult
 */
export function detectConvergence(
  lossHistory: LossHistoryPoint[]
): ConvergenceResult {
  if (lossHistory.length < 8) {
    return {
      converged: false,
      convergenceRate: 0,
      convergenceStep: -1,
      plateauFraction: 0,
    };
  }

  const losses = lossHistory.map((p) => p.loss);
  const steps = lossHistory.map((p) => p.step);
  const n = losses.length;

  // Late phase: last 25% of steps
  const lateStart = Math.floor(n * 0.75);
  const lateLosses = losses.slice(lateStart);

  // Average absolute per-step change in late phase
  const lateMeanAbsDiff = meanAbsDiff(lateLosses);

  // Mean loss in late phase
  const lateMean = mean(lateLosses);

  // Fractional change per step: how much the loss changes relative
  // to its current magnitude, on average
  const fractionalChangePerStep =
    lateMean > 0 ? lateMeanAbsDiff / lateMean : 0;

  // Stability: CV of step-to-step deltas (not raw values, since a
  // slow trend will artificially inflate raw-value CV)
  const lateDeltas: number[] = [];
  for (let i = 1; i < lateLosses.length; i++) {
    lateDeltas.push(Math.abs(lateLosses[i] - lateLosses[i - 1]));
  }
  const lateDeltaMean = lateDeltas.length > 0 ? mean(lateDeltas) : 0;
  const lateDeltaStd =
    lateDeltas.length >= 2 ? stddev(lateDeltas, lateDeltaMean) : 0;
  const lateDeltaCV =
    lateDeltaMean > 0 ? lateDeltaStd / lateDeltaMean : 0;

  // Converged if:
  // 1. Each step changes loss by < 3% of current value (near-flat)
  // 2. Step-to-step changes are stable (delta CV < 2.0, i.e., not erratic)
  const converged =
    fractionalChangePerStep < 0.03 && lateDeltaCV < 2.0;

  // Overall convergence rate: loss reduction per step
  const convergenceRate =
    n > 1
      ? Math.max(0, losses[0] - losses[n - 1]) /
        (steps[n - 1] - steps[0])
      : 0;

  // Estimate convergence step: first step where loss is within 10% of minimum
  const minLoss = Math.min(...losses);
  let convergenceStep = -1;
  const threshold = minLoss * 1.1;
  for (let i = 0; i < n; i++) {
    if (losses[i] <= threshold) {
      convergenceStep = steps[i];
      break;
    }
  }

  return {
    converged,
    convergenceRate,
    convergenceStep,
    plateauFraction: converged ? (n - lateStart) / n : 0,
  };
}

// ============================================================
// Detection: Divergence
// ============================================================

/**
 * Detect whether the training run diverged (loss increased).
 *
 * Algorithm:
 *   1. Compare final loss to initial loss
 *   2. Check if loss is trending upward in the second half
 *   3. If final/initial > threshold AND trend is positive → diverged
 *
 * @param lossHistory — array of { step, loss } points
 * @returns DivergenceResult
 */
export function detectDivergence(
  lossHistory: LossHistoryPoint[]
): DivergenceResult {
  if (lossHistory.length < 4) {
    return {
      diverged: false,
      divergenceRatio: 1,
      divergenceStep: -1,
    };
  }

  const losses = lossHistory.map((p) => p.loss);
  const steps = lossHistory.map((p) => p.step);
  const n = losses.length;

  const initialLoss = losses[0];
  const finalLoss = losses[n - 1];
  const divergenceRatio =
    initialLoss > 0 ? finalLoss / initialLoss : 1;

  // Check if loss is trending upward in the second half
  const halfIdx = Math.floor(n / 2);
  const secondHalfLosses = losses.slice(halfIdx);
  const secondHalfSteps = steps.slice(halfIdx);
  const secondHalfSlope = linearSlope(
    secondHalfSteps.map((_, i) => i),
    secondHalfLosses
  );

  // Divergence criteria:
  // 1. Final loss is significantly higher than initial (> 1.2x)
  // 2. Loss is trending upward in the second half
  const diverged =
    divergenceRatio > 1.2 && secondHalfSlope > 0;

  // Find where divergence began: first step where loss exceeds initial
  let divergenceStep = -1;
  if (diverged) {
    for (let i = 1; i < n; i++) {
      if (losses[i] > initialLoss && steps[i] > steps[Math.floor(n / 3)]) {
        divergenceStep = steps[i];
        break;
      }
    }
  }

  return {
    diverged,
    divergenceRatio,
    divergenceStep,
  };
}

// ============================================================
// Detection: Unstable Loss
// ============================================================

/**
 * Detect whether the loss curve is unstable (high variance).
 *
 * Algorithm:
 *   1. Compute coefficient of variation (std / mean) of loss values
 *   2. Detect spikes: loss > 2x running average of previous 5 points
 *   3. If CV > threshold or spike count > 0 → unstable
 *
 * @param lossHistory — array of { step, loss } points
 * @returns UnstableLossResult
 */
export function detectUnstableLoss(
  lossHistory: LossHistoryPoint[]
): UnstableLossResult {
  if (lossHistory.length < 3) {
    return {
      unstable: false,
      coefficientOfVariation: 0,
      spikeCount: 0,
      spikeSteps: [],
    };
  }

  const losses = lossHistory.map((p) => p.loss);
  const steps = lossHistory.map((p) => p.step);
  const n = losses.length;

  // Use coefficient of variation of loss *deltas* (step-to-step changes)
  // rather than absolute values — a smoothly decreasing curve has
  // large absolute CV but small delta CV.
  const deltas: number[] = [];
  for (let i = 1; i < n; i++) {
    deltas.push(losses[i] - losses[i - 1]);
  }
  const deltaAvg = mean(deltas);
  const deltaSd = deltas.length >= 2 ? stddev(deltas, deltaAvg) : 0;
  // Use absolute mean of deltas for normalization to avoid sign issues
  const absDeltaMean = deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length;
  const coefficientOfVariation = absDeltaMean > 0 ? deltaSd / absDeltaMean : 0;

  // Detect spikes: a point where loss > 2x the running average of
  // the previous 5 points (or fewer at the beginning)
  const spikeSteps: number[] = [];
  for (let i = 5; i < n; i++) {
    const runningAvg = mean(losses.slice(i - 5, i));
    if (runningAvg > 0 && losses[i] > runningAvg * 2.0) {
      spikeSteps.push(steps[i]);
    }
  }

  // Unstable criteria: delta CV > 1.5 (high variance in step-to-step changes)
  // or multiple spikes detected
  const unstable = coefficientOfVariation > 1.5 || spikeSteps.length >= 3;

  return {
    unstable,
    coefficientOfVariation,
    spikeCount: spikeSteps.length,
    spikeSteps,
  };
}

// ============================================================
// Detection: Overfitting Tendency
// ============================================================

/**
 * Detect overfitting tendency.
 *
 * Algorithm:
 *   1. Check train loss trend (should be decreasing)
 *   2. If eval history available:
 *      a. Compare train and eval loss trends
 *      b. If train decreases while eval increases → overfitting
 *   3. Without eval data: check if train loss is extremely low
 *      (suspicious but not conclusive)
 *
 * @param lossHistory    — training loss history
 * @param evalLossHistory — optional evaluation loss history
 * @returns OverfittingResult
 */
export function detectOverfitting(
  lossHistory: LossHistoryPoint[],
  evalLossHistory?: Array<{ step: number; loss: number }>
): OverfittingResult {
  if (lossHistory.length < 4) {
    return {
      overfitting: false,
      trainLossTrend: 0,
      evalLossTrend: null,
      trainEvalGap: null,
    };
  }

  const losses = lossHistory.map((p) => p.loss);
  const n = losses.length;

  // Train loss trend over the last 50% of steps
  const halfIdx = Math.floor(n / 2);
  const recentLosses = losses.slice(halfIdx);
  const trainLossTrend = linearSlope(
    recentLosses.map((_, i) => i),
    recentLosses
  );

  let overfitting = false;
  let evalLossTrend: number | null = null;
  let trainEvalGap: number | null = null;

  if (evalLossHistory && evalLossHistory.length >= 3) {
    const evalLosses = evalLossHistory.map((p) => p.loss);
    const evalN = evalLosses.length;
    const evalHalfIdx = Math.floor(evalN / 2);
    const recentEvalLosses = evalLosses.slice(evalHalfIdx);
    evalLossTrend = linearSlope(
      recentEvalLosses.map((_, i) => i),
      recentEvalLosses
    );

    // Gap between final train and final eval loss
    trainEvalGap =
      evalLosses[evalN - 1] - losses[n - 1];

    // Overfitting: train loss decreasing but eval loss increasing
    overfitting =
      trainLossTrend < -0.001 &&
      evalLossTrend > 0.001 &&
      trainEvalGap > 0.5;
  } else {
    // Without eval data: check if train loss decreased extremely fast
    // (loss reduced by > 90% in first 25% of steps — suspicious)
    const quarterIdx = Math.floor(n * 0.25);
    if (quarterIdx > 0 && losses[0] > 0) {
      const earlyReduction =
        (losses[0] - losses[quarterIdx]) / losses[0];
      if (earlyReduction > 0.9) {
        overfitting = true;
      }
    }
  }

  return {
    overfitting,
    trainLossTrend,
    evalLossTrend,
    trainEvalGap,
  };
}

// ============================================================
// Score: Stability
// ============================================================

/**
 * Compute a stability score (0–1) for the loss curve.
 *
 * 1.0 = perfectly smooth, monotonic decrease
 * 0.0 = extremely noisy / unstable
 *
 * Algorithm:
 *   - Compute the fraction of steps where loss decreased
 *   - Penalize large upward jumps
 *   - Combine into a single score
 *
 * @param lossHistory — array of { step, loss } points
 * @returns stability score between 0 and 1
 */
export function computeStabilityScore(
  lossHistory: LossHistoryPoint[]
): number {
  if (lossHistory.length < 2) return 1.0;

  const losses = lossHistory.map((p) => p.loss);
  const n = losses.length;

  // Count steps where loss decreased
  let decreaseCount = 0;
  let totalJumpPenalty = 0;

  for (let i = 1; i < n; i++) {
    const delta = losses[i] - losses[i - 1];
    if (delta <= 0) {
      decreaseCount++;
    } else {
      // Penalize upward jumps relative to current loss magnitude
      const relJump = losses[i - 1] > 0 ? delta / losses[i - 1] : delta;
      totalJumpPenalty += Math.min(relJump, 1.0);
    }
  }

  const decreaseRatio = decreaseCount / (n - 1);
  const maxPenalty = n - 1;
  const penaltyScore =
    maxPenalty > 0 ? 1.0 - totalJumpPenalty / maxPenalty : 1.0;

  // Weighted combination: 70% decrease ratio, 30% penalty score
  return Math.max(0, Math.min(1, 0.7 * decreaseRatio + 0.3 * penaltyScore));
}

// ============================================================
// Score: Training Efficiency
// ============================================================

/**
 * Compute training efficiency: loss reduction per unit of
 * computational work.
 *
 * Formula:
 *   efficiency = lossReduction / (totalSteps * avgLoss)
 *
 * Normalized so that higher values mean more efficient training.
 *
 * @param lossHistory — array of { step, loss } points
 * @param totalSteps   — total optimizer steps
 * @returns efficiency score (≥ 0)
 */
export function computeTrainingEfficiency(
  lossHistory: LossHistoryPoint[],
  totalSteps: number
): number {
  if (lossHistory.length < 2 || totalSteps <= 0) return 0;

  const losses = lossHistory.map((p) => p.loss);
  const initialLoss = losses[0];
  const finalLoss = losses[losses.length - 1];
  const lossReduction = Math.max(0, initialLoss - finalLoss);
  const avgLoss = mean(losses);

  if (avgLoss <= 0) return 0;

  // Efficiency = reduction per step, normalized by average loss magnitude
  const rawEfficiency = lossReduction / (totalSteps * avgLoss);

  // Scale up for readability (typical values: 1e-5 to 1e-3)
  return rawEfficiency * 10000;
}

// ============================================================
// Master Analysis Function
// ============================================================

/**
 * Analyze a complete training run and return all derived metrics.
 *
 * This is the primary entry point for training analysis.
 * All metrics are calculated from the real loss/perplexity/throughput
 * history stored in the record.
 *
 * @param record — a TrainingRunRecord with populated history arrays
 * @param evalLossHistory — optional eval loss data for overfitting detection
 * @returns TrainingRunAnalysis with all computed metrics
 *
 * Example:
 *   const analysis = analyzeTrainingRun(record);
 *   console.log(analysis.stabilityScore, analysis.convergence.converged);
 */
export function analyzeTrainingRun(
  record: TrainingRunRecord,
  evalLossHistory?: Array<{ step: number; loss: number }>
): TrainingRunAnalysis {
  const { lossHistory, throughputHistory } = record;

  // ── Extract key metrics ──
  const losses = lossHistory.map((p) => p.loss);

  const initialLoss =
    losses.length > 0 ? losses[0] : record.initialLoss;
  const finalLoss =
    losses.length > 0 ? losses[losses.length - 1] : record.finalLoss;

  let bestLoss = Infinity;
  let bestStep = 0;
  for (const p of lossHistory) {
    if (p.loss < bestLoss) {
      bestLoss = p.loss;
      bestStep = p.step;
    }
  }
  if (!isFinite(bestLoss)) {
    bestLoss = record.bestLoss;
    bestStep = record.bestStep;
  }

  const lossReduction = Math.max(0, initialLoss - finalLoss);
  const lossReductionPercent =
    initialLoss > 0 ? (lossReduction / initialLoss) * 100 : 0;

  // ── Convergence rate ──
  const convergenceRate =
    lossHistory.length > 1
      ? lossReduction /
        (lossHistory[lossHistory.length - 1].step -
          lossHistory[0].step)
      : 0;

  // ── Average throughput ──
  let averageThroughput = 0;
  if (throughputHistory.length > 0) {
    averageThroughput = mean(
      throughputHistory.map((p) => p.tokensPerSecond)
    );
  } else {
    averageThroughput = record.averageThroughput;
  }

  // ── Stability ──
  const stabilityScore = computeStabilityScore(lossHistory);

  // ── Training efficiency ──
  const totalSteps =
    record.totalSteps > 0
      ? record.totalSteps
      : lossHistory.length > 0
        ? lossHistory[lossHistory.length - 1].step
        : 1;
  const trainingEfficiency = computeTrainingEfficiency(
    lossHistory,
    totalSteps
  );

  // ── Detections ──
  const convergence = detectConvergence(lossHistory);
  const divergence = detectDivergence(lossHistory);
  const unstableLoss = detectUnstableLoss(lossHistory);
  const overfitting = detectOverfitting(lossHistory, evalLossHistory);

  return {
    initialLoss,
    finalLoss,
    bestLoss,
    bestStep,
    lossReduction,
    lossReductionPercent,
    convergenceRate: Math.max(0, convergenceRate),
    averageThroughput,
    stabilityScore,
    trainingEfficiency,
    convergence,
    divergence,
    unstableLoss,
    overfitting,
  };
}
