// ============================================================
// AI Lab — adapters/trainingAdapter.ts
// ============================================================
// Phase 52: Bridges MiniMind training experiment results to the
// AI Lab dashboard. Reads from ExperimentStore (localStorage)
// and provides dashboard-ready training run data.
//
// Design principles:
//   - Pure functions — no side effects, no state mutation
//   - Typed outputs — every exported function returns a
//     well-defined structured type
//   - Defensive — handles empty/missing data gracefully
//   - Browser-safe — no Node.js fs/path dependencies
//   - Follows historyAdapter.ts pattern
//
// Usage:
//   import { getLatestTrainingRun, getTrainingMetrics } from
//     "@/lib/ai-lab/adapters/trainingAdapter";
//   const run = getLatestTrainingRun();
// ============================================================

import {
  latest,
  list,
} from "@/lib/minimind/experiments/history/ExperimentStore";
import type {
  ExperimentRecord,
  ExperimentMetrics,
  ExperimentStatus,
} from "@/lib/minimind/experiments/history/ExperimentRecord";

// ============================================================
// Dashboard-facing types
// ============================================================

/**
 * Lightweight training run summary for dashboard cards.
 */
export interface TrainingRunSummary {
  /** Experiment record ID */
  id: string;
  /** Human-readable experiment name */
  name: string;
  /** When the run was created (Unix ms) */
  createdAt: number;
  /** Current lifecycle status */
  status: ExperimentStatus;
  /** Model label (e.g. "MiniMind Small") */
  modelLabel: string;
  /** Key result metrics */
  metrics: ExperimentMetrics;
  /** Loss reduction ratio (finalLoss / initialLoss), NaN if unavailable */
  lossReduction: number;
  /** Formatted creation date string */
  createdAtFormatted: string;
}

/**
 * Simplified loss history point for charting.
 */
export interface LossHistoryPoint {
  /** Optimizer step number */
  step: number;
  /** Training loss at this step */
  loss: number;
}

/**
 * Generation sample from before/after comparison.
 */
export interface GenerationSample {
  /** The input prompt */
  prompt: string;
  /** Text generated before training */
  before: string;
  /** Text generated after training */
  after: string;
  /** Whether the output changed */
  changed: boolean;
}

/**
 * Aggregated training statistics across all completed runs.
 */
export interface TrainingStats {
  /** Total number of training runs */
  totalRuns: number;
  /** Number of completed runs */
  completedRuns: number;
  /** Number of failed runs */
  failedRuns: number;
  /** Best (lowest) perplexity across all completed runs */
  bestPerplexity: number | null;
  /** Best (lowest) loss across all completed runs */
  bestLoss: number | null;
}

// ============================================================
// Public API
// ============================================================

/**
 * Get the most recent training run from experiment history.
 *
 * Reads from localStorage via ExperimentStore. Returns null
 * when no training history exists (first visit, cleared data).
 *
 * @returns Latest ExperimentRecord, or null if no history
 *
 * Example:
 *   const run = getLatestTrainingRun();
 *   if (run) {
 *     console.log(run.name, run.metrics.finalLoss);
 *   }
 */
export function getLatestTrainingRun(): ExperimentRecord | null {
  return latest() ?? null;
}

/**
 * Get training metrics from the latest completed run.
 *
 * Extracts ExperimentMetrics from the most recent record.
 * Returns null when no completed runs exist.
 *
 * @returns ExperimentMetrics from the latest run, or null
 *
 * Example:
 *   const metrics = getTrainingMetrics();
 *   if (metrics) {
 *     console.log(`Best loss: ${metrics.bestLoss.toFixed(4)}`);
 *   }
 */
export function getTrainingMetrics(): ExperimentMetrics | null {
  const recent = latest();
  if (!recent || recent.status !== "completed") {
    // Fall back to the most recent completed run
    const completed = list().filter((r) => r.status === "completed");
    if (completed.length === 0) return null;
    return completed[0].metrics;
  }
  return recent.metrics;
}

/**
 * Get loss history derived from experiment store records.
 *
 * Since full per-step loss history is stored on disk (metrics.json),
 * this returns the key inflection points available from the
 * ExperimentRecord metrics: initial loss, best loss, and final loss.
 *
 * For the full step-by-step loss curve, load metrics.json from
 * the experiment output directory (Node.js only).
 *
 * @param limit — max number of completed runs to include (default: 5)
 * @returns Array of { step, loss } points from the latest completed run,
 *          or empty array if no completed runs
 *
 * Example:
 *   const history = getLossHistory();
 *   history.forEach(h => console.log(`Step ${h.step}: ${h.loss.toFixed(4)}`));
 */
export function getLossHistory(limit: number = 5): LossHistoryPoint[] {
  const completed = list()
    .filter((r) => r.status === "completed")
    .slice(0, limit);

  if (completed.length === 0) return [];

  // Return summary inflection points from the most recent completed run
  const latest = completed[0];
  const points: LossHistoryPoint[] = [];

  if (isFinite(latest.metrics.initialLoss)) {
    points.push({ step: 0, loss: latest.metrics.initialLoss });
  }
  if (isFinite(latest.metrics.bestLoss)) {
    points.push({ step: -1, loss: latest.metrics.bestLoss });
  }
  if (isFinite(latest.metrics.finalLoss)) {
    points.push({ step: -2, loss: latest.metrics.finalLoss });
  }

  return points;
}

/**
 * Get generation samples from the latest training run.
 *
 * Generation comparison data (before/after text) is saved to disk
 * as generation-comparison.json by TrainingExperimentRunner.
 * This adapter returns null since the data is on the filesystem,
 * not in localStorage.
 *
 * For generation samples, load generation-comparison.json from
 * the experiment output directory (Node.js only), or use the
 * TrainingReport.fromExperimentResult() pipeline.
 *
 * @returns null — generation samples are stored on disk, not localStorage
 */
export function getGenerationSamples(): GenerationSample[] | null {
  // Generation samples live on the filesystem (generation-comparison.json).
  // The localStorage ExperimentRecord only stores aggregate metrics.
  // UI consumers should call this and show a "run training to see samples"
  // empty state when null is returned.
  return null;
}

/**
 * Get aggregated training statistics across all runs.
 *
 * Computes summary stats from the complete experiment history.
 * Useful for dashboard overview sections.
 *
 * @returns TrainingStats with aggregate counts and best metrics
 *
 * Example:
 *   const stats = getTrainingStats();
 *   console.log(`${stats.completedRuns} runs completed`);
 */
export function getTrainingStats(): TrainingStats {
  const all = list();
  const completed = all.filter((r) => r.status === "completed");
  const failed = all.filter((r) => r.status === "failed");

  let bestPerplexity: number | null = null;
  let bestLoss: number | null = null;

  for (const r of completed) {
    if (isFinite(r.metrics.perplexity)) {
      if (bestPerplexity === null || r.metrics.perplexity < bestPerplexity) {
        bestPerplexity = r.metrics.perplexity;
      }
    }
    if (isFinite(r.metrics.bestLoss)) {
      if (bestLoss === null || r.metrics.bestLoss < bestLoss) {
        bestLoss = r.metrics.bestLoss;
      }
    }
  }

  return {
    totalRuns: all.length,
    completedRuns: completed.length,
    failedRuns: failed.length,
    bestPerplexity,
    bestLoss,
  };
}

/**
 * Get a training run summary suitable for dashboard cards.
 *
 * Transforms an ExperimentRecord into a UI-optimized shape
 * with formatted dates and derived fields.
 *
 * @param record — The experiment record to summarize
 * @returns TrainingRunSummary with dashboard-ready fields
 */
export function summarizeTrainingRun(
  record: ExperimentRecord
): TrainingRunSummary {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    status: record.status,
    modelLabel: record.modelConfig.label,
    metrics: record.metrics,
    lossReduction:
      isFinite(record.metrics.initialLoss) &&
      record.metrics.initialLoss > 0
        ? record.metrics.finalLoss / record.metrics.initialLoss
        : NaN,
    createdAtFormatted: new Date(record.createdAt).toLocaleDateString(
      "zh-CN",
      { year: "numeric", month: "short", day: "numeric" }
    ),
  };
}

/**
 * Get all training runs as dashboard-ready summary cards.
 *
 * @param limit — max number of cards to return (default: 10)
 * @returns Array of TrainingRunSummary, sorted most-recent-first
 */
export function getTrainingRunSummaries(
  limit: number = 10
): TrainingRunSummary[] {
  return list()
    .slice(0, limit)
    .map(summarizeTrainingRun);
}

/**
 * Check if any training history exists.
 *
 * Simple gate for empty-state UI rendering.
 *
 * @returns true if at least one experiment record exists
 */
export function hasTrainingHistory(): boolean {
  return list().length > 0;
}
