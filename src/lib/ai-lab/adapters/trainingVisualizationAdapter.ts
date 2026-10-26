// ============================================================
// AI Lab — adapters/trainingVisualizationAdapter.ts
// ============================================================
// Phase 53: Bridges MiniMind training observatory data to
// visualization-ready formats for the AI Lab dashboard.
//
// Reads from TrainingMetricsStore (localStorage) and provides
// chart-ready data for loss curves, learning rate curves,
// throughput data, and generation comparisons.
//
// Design principles:
//   - Pure functions — no side effects, no state mutation
//   - Typed outputs — every exported function returns a
//     well-defined structured type
//   - Defensive — handles empty/missing data gracefully
//   - Browser-safe — no Node.js fs/path dependencies
//   - Follows trainingAdapter.ts pattern
//
// Usage:
//   import { getLossCurveData, getTrainingSummary } from
//     "@/lib/ai-lab/adapters/trainingVisualizationAdapter";
//   const curve = getLossCurveData();
// ============================================================

import {
  list,
  latest,
  stats,
  get,
} from "@/lib/minimind/training/observatory/TrainingMetricsStore";
import { analyzeTrainingRun } from "@/lib/minimind/training/observatory/TrainingAnalyzer";
import type {
  TrainingRunRecord,
  LossHistoryPoint,
  GenerationSample,
} from "@/lib/minimind/training/observatory/TrainingRunRecord";
import type { TrainingRunAnalysis } from "@/lib/minimind/training/observatory/TrainingAnalyzer";

// ============================================================
// Chart Data Types
// ============================================================

/**
 * A single point on the loss curve chart.
 */
export interface LossCurvePoint {
  /** Step number (x-axis) */
  step: number;
  /** Loss value (y-axis) */
  loss: number;
  /** Epoch number (for tooltip) */
  epoch: number;
}

/**
 * A single point on the learning rate curve chart.
 */
export interface LearningRateCurvePoint {
  /** Step number (x-axis) */
  step: number;
  /** Learning rate (y-axis) */
  learningRate: number;
}

/**
 * A single point on the throughput chart.
 */
export interface ThroughputPoint {
  /** Step number (x-axis) */
  step: number;
  /** Tokens per second (y-axis) */
  tokensPerSecond: number;
}

/**
 * Loss curve data for chart rendering.
 */
export interface LossCurveData {
  /** Title for the chart */
  title: string;
  /** Data points */
  points: LossCurvePoint[];
  /** Baseline initial loss for reference line */
  initialLoss: number;
  /** Best loss achieved */
  bestLoss: number;
  /** Whether data is available */
  hasData: boolean;
}

/**
 * Learning rate curve data for chart rendering.
 */
export interface LearningRateCurveData {
  /** Title for the chart */
  title: string;
  /** Data points */
  points: LearningRateCurvePoint[];
  /** Whether a scheduler was used (curve is non-constant) */
  hasScheduler: boolean;
  /** Whether data is available */
  hasData: boolean;
}

/**
 * Throughput data for chart rendering.
 */
export interface ThroughputData {
  /** Title for the chart */
  title: string;
  /** Data points */
  points: ThroughputPoint[];
  /** Average throughput across the run */
  average: number;
  /** Whether data is available */
  hasData: boolean;
}

/**
 * Training summary for dashboard overview cards.
 */
export interface TrainingSummary {
  /** Latest experiment name */
  experimentName: string;
  /** Final loss (formatted) */
  finalLoss: number;
  /** Perplexity */
  perplexity: number;
  /** Average tokens per second */
  tokensPerSecond: number;
  /** Training duration in seconds */
  durationSeconds: number;
  /** Loss reduction percentage */
  lossReductionPercent: number;
  /** Stability score (0–1) */
  stabilityScore: number;
  /** Total steps */
  totalSteps: number;
  /** Model label */
  modelLabel: string;
  /** Dataset name */
  datasetName: string;
  /** Status */
  status: string;
  /** Whether any data is available */
  hasData: boolean;
}

/**
 * Generation comparison data for before/after display.
 */
export interface GenerationComparisonData {
  /** Prompt text */
  prompt: string;
  /** Text before training */
  before: string;
  /** Text after training */
  after: string;
  /** Whether output changed */
  changed: boolean;
  /** Log probability delta */
  logProbDelta: number;
  /** Perplexity delta */
  perplexityDelta: number;
}

// ============================================================
// Public API — Loss Curve
// ============================================================

/**
 * Get loss curve data from the latest training run.
 *
 * Returns full per-step loss history for chart rendering.
 * Falls back to empty state when no training data exists.
 *
 * @returns LossCurveData with points array and metadata
 *
 * Example:
 *   const curve = getLossCurveData();
 *   curve.points.forEach(p => console.log(p.step, p.loss));
 */
export function getLossCurveData(): LossCurveData {
  const record = latest();

  if (!record || record.lossHistory.length === 0) {
    return {
      title: "Loss Curve",
      points: [],
      initialLoss: 0,
      bestLoss: 0,
      hasData: false,
    };
  }

  const points: LossCurvePoint[] = record.lossHistory.map(
    (p: LossHistoryPoint, i: number) => {
      // Estimate epoch from the perplexity history if available
      const epoch =
        record.perplexityHistory.length > i
          ? Math.floor((i / record.lossHistory.length) * record.totalEpochs)
          : 0;
      return {
        step: p.step,
        loss: p.loss,
        epoch,
      };
    }
  );

  return {
    title: `Loss Curve — ${record.experimentName}`,
    points,
    initialLoss: record.initialLoss,
    bestLoss: record.bestLoss,
    hasData: true,
  };
}

/**
 * Get loss curve data for a specific run by id.
 *
 * @param id — the record id
 * @returns LossCurveData or empty state if not found
 */
export function getLossCurveDataById(id: string): LossCurveData {
  const record = get(id) as TrainingRunRecord | undefined;

  if (!record || record.lossHistory.length === 0) {
    return {
      title: "Loss Curve",
      points: [],
      initialLoss: 0,
      bestLoss: 0,
      hasData: false,
    };
  }

  const points: LossCurvePoint[] = record.lossHistory.map(
    (p: LossHistoryPoint) => ({
      step: p.step,
      loss: p.loss,
      epoch: 0,
    })
  );

  return {
    title: `Loss Curve — ${record.experimentName}`,
    points,
    initialLoss: record.initialLoss,
    bestLoss: record.bestLoss,
    hasData: true,
  };
}

// ============================================================
// Public API — Learning Rate Curve
// ============================================================

/**
 * Get learning rate curve data from the latest training run.
 *
 * @returns LearningRateCurveData with points array
 */
export function getLearningRateCurveData(): LearningRateCurveData {
  const record = latest();

  if (
    !record ||
    record.learningRateHistory.length === 0
  ) {
    return {
      title: "Learning Rate",
      points: [],
      hasScheduler: false,
      hasData: false,
    };
  }

  const points: LearningRateCurvePoint[] =
    record.learningRateHistory.map((p) => ({
      step: p.step,
      learningRate: p.learningRate,
    }));

  // Detect if a scheduler was used (LR changes over time)
  const firstLR = points[0]?.learningRate ?? 0;
  const lastLR = points[points.length - 1]?.learningRate ?? 0;
  const hasScheduler =
    points.length > 1 &&
    Math.abs(lastLR - firstLR) / Math.max(firstLR, 1e-10) > 0.01;

  return {
    title: `Learning Rate — ${record.experimentName}`,
    points,
    hasScheduler,
    hasData: true,
  };
}

// ============================================================
// Public API — Throughput
// ============================================================

/**
 * Get throughput data from the latest training run.
 *
 * @returns ThroughputData with points array and average
 */
export function getThroughputData(): ThroughputData {
  const record = latest();

  if (
    !record ||
    record.throughputHistory.length === 0
  ) {
    return {
      title: "Throughput",
      points: [],
      average: 0,
      hasData: false,
    };
  }

  const points: ThroughputPoint[] = record.throughputHistory.map(
    (p) => ({
      step: p.step,
      tokensPerSecond: p.tokensPerSecond,
    })
  );

  const average =
    points.length > 0
      ? points.reduce((s, p) => s + p.tokensPerSecond, 0) /
        points.length
      : 0;

  return {
    title: `Throughput — ${record.experimentName}`,
    points,
    average,
    hasData: true,
  };
}

// ============================================================
// Public API — Training Summary
// ============================================================

/**
 * Get training summary for dashboard overview cards.
 *
 * Combines data from the latest TrainingRunRecord and the
 * TrainingAnalyzer to produce dashboard-ready summary stats.
 *
 * @returns TrainingSummary with all overview fields
 */
export function getTrainingSummary(): TrainingSummary {
  const record = latest();

  if (!record) {
    return {
      experimentName: "",
      finalLoss: 0,
      perplexity: 0,
      tokensPerSecond: 0,
      durationSeconds: 0,
      lossReductionPercent: 0,
      stabilityScore: 0,
      totalSteps: 0,
      modelLabel: "",
      datasetName: "",
      status: "",
      hasData: false,
    };
  }

  const analysis = analyzeTrainingRun(record);

  return {
    experimentName: record.experimentName,
    finalLoss: record.finalLoss,
    perplexity: record.finalPerplexity,
    tokensPerSecond: record.averageThroughput,
    durationSeconds: record.durationMs / 1000,
    lossReductionPercent: analysis.lossReductionPercent,
    stabilityScore: analysis.stabilityScore,
    totalSteps: record.totalSteps,
    modelLabel: record.modelConfig.label,
    datasetName: record.datasetInfo.name,
    status: record.status,
    hasData: true,
  };
}

/**
 * Get training summary for a specific run by id.
 *
 * @param id — the record id
 * @returns TrainingSummary or empty state if not found
 */
export function getTrainingSummaryById(
  id: string
): TrainingSummary {
  const record = get(id) as TrainingRunRecord | undefined;

  if (!record) {
    return {
      experimentName: "",
      finalLoss: 0,
      perplexity: 0,
      tokensPerSecond: 0,
      durationSeconds: 0,
      lossReductionPercent: 0,
      stabilityScore: 0,
      totalSteps: 0,
      modelLabel: "",
      datasetName: "",
      status: "",
      hasData: false,
    };
  }

  const analysis = analyzeTrainingRun(record);

  return {
    experimentName: record.experimentName,
    finalLoss: record.finalLoss,
    perplexity: record.finalPerplexity,
    tokensPerSecond: record.averageThroughput,
    durationSeconds: record.durationMs / 1000,
    lossReductionPercent: analysis.lossReductionPercent,
    stabilityScore: analysis.stabilityScore,
    totalSteps: record.totalSteps,
    modelLabel: record.modelConfig.label,
    datasetName: record.datasetInfo.name,
    status: record.status,
    hasData: true,
  };
}

// ============================================================
// Public API — Generation Comparison
// ============================================================

/**
 * Get generation comparison data from the latest training run.
 *
 * Returns before/after text samples for comparing model output
 * quality before and after training.
 *
 * @returns Array of GenerationComparisonData, empty if no samples
 */
export function getGenerationComparison(): GenerationComparisonData[] {
  const record = latest();

  if (!record || record.generationSamples.length === 0) {
    return [];
  }

  return record.generationSamples.map((s: GenerationSample) => ({
    prompt: s.prompt,
    before: s.before,
    after: s.after,
    changed: s.changed,
    logProbDelta: s.logProbDelta,
    perplexityDelta: s.perplexityDelta,
  }));
}

// ============================================================
// Public API — Aggregated Stats
// ============================================================

/**
 * Get aggregated statistics across all training runs.
 *
 * Useful for high-level dashboard overview.
 */
export function getObservatoryStats(): {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  bestLoss: number | null;
  bestPerplexity: number | null;
  averageThroughput: number | null;
  totalTrainingTimeSeconds: number;
  hasData: boolean;
} {
  const s = stats();

  return {
    totalRuns: s.total,
    completedRuns: s.completed,
    failedRuns: s.failed,
    bestLoss: s.bestLoss,
    bestPerplexity: s.bestPerplexity,
    averageThroughput: s.averageThroughput,
    totalTrainingTimeSeconds: s.totalDurationMs / 1000,
    hasData: s.total > 0,
  };
}

/**
 * Check if any training observatory data exists.
 *
 * Simple gate for empty-state UI rendering.
 */
export function hasObservatoryData(): boolean {
  return list().length > 0;
}

/**
 * Get list of all run IDs and names for a run selector dropdown.
 */
export function getRunList(): Array<{ id: string; name: string; status: string }> {
  return list().map((r) => ({
    id: r.id,
    name: r.experimentName,
    status: r.status,
  }));
}

/**
 * Get the full analysis for the latest training run.
 *
 * @returns TrainingRunAnalysis or null if no data
 */
export function getLatestAnalysis(): TrainingRunAnalysis | null {
  const record = latest();
  if (!record) return null;
  return analyzeTrainingRun(record);
}
