// ============================================================
// AI Lab Adapters — historyAdapter.ts
// ============================================================
// Phase 51: Adapter layer for experiment run history.
//
// Bridges the gap between the MiniMind experiment history store
// (localStorage-backed) and AI Lab dashboard UI components.
//
// UI components MUST import from here — never directly from
// ExperimentStore or ExperimentComparison.
//
// Design principles:
//   - Pure data transformation — no side effects
//   - Typed outputs — every function returns a structured type
//   - Defensive — gracefully handles empty/missing data
//   - Follows progressAdapter / missionAdapter patterns
// ============================================================

import {
  list as listRecords,
  get as getRecord,
  stats as storeStats,
  latest as latestRecord,
  listByStatus,
} from "@/lib/minimind/experiments/history/ExperimentStore";
import {
  compareRecords,
  buildComparisonTable,
  diffTrainingConfigs,
  diffModelConfigs,
  rankByMetric,
} from "@/lib/minimind/experiments/history/ExperimentComparison";
import type {
  ExperimentStatus,
} from "@/lib/minimind/experiments/history/ExperimentRecord";
import type {
  RecordPairComparison,
  ComparisonTable,
  TrainingDiff,
  ModelDiff,
} from "@/lib/minimind/experiments/history/ExperimentComparison";

// ============================================================
// Types
// ============================================================

/**
 * Dashboard-ready experiment summary card.
 *
 * Designed for rendering in a card grid — compact, scannable,
 * with the most important metrics surfaced.
 */
export interface ExperimentSummaryCard {
  id: string;
  name: string;
  modelLabel: string;
  status: ExperimentStatus;
  bestLoss: number;
  perplexity: number | null;
  tokensPerSecond: number;
  lossReduction: number;
  createdAt: string;
  /** Relative time string (e.g. "2h ago") */
  timeAgo: string;
}

/**
 * Dashboard overview stats.
 *
 * Designed for the hero section stat pills.
 */
export interface HistoryOverview {
  totalRuns: number;
  completedRuns: number;
  runningRuns: number;
  failedRuns: number;
  bestPerplexity: number | null;
  latestRun: string | null;
  latestRunId: string | null;
}

/**
 * Comparison view data — wraps a RecordPairComparison with
 * formatted display values.
 */
export interface ComparisonViewData {
  pair: RecordPairComparison;
  trainingDiffs: TrainingDiff[];
  modelDiffs: ModelDiff[];
  /** Which config fields actually differ */
  configChangeCount: number;
  /** Which model fields actually differ */
  modelChangeCount: number;
}

/**
 * Leaderboard entry for ranked display.
 */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  id: string;
  modelLabel: string;
  value: number;
  valueLabel: string;
}

// ============================================================
// Helpers
// ============================================================

/** Format a timestamp as a relative time string. */
function formatTimeAgo(ms: number): string {
  const now = Date.now();
  const diff = now - ms;

  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Format a timestamp as a readable date string. */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================
// Overview
// ============================================================

/**
 * Get dashboard overview stats for experiment history.
 *
 * @returns HistoryOverview with aggregate counts and highlights
 */
export function getHistoryOverview(): HistoryOverview {
  const s = storeStats();
  const latest = latestRecord();

  return {
    totalRuns: s.total,
    completedRuns: s.completed,
    runningRuns: s.running,
    failedRuns: s.failed,
    bestPerplexity: s.bestPerplexity,
    latestRun: latest?.name ?? null,
    latestRunId: latest?.id ?? null,
  };
}

// ============================================================
// Summary Cards
// ============================================================

/**
 * Get all experiment runs as dashboard-ready summary cards.
 *
 * Sorted by createdAt descending (most recent first).
 *
 * @param limit — optional cap on number of cards returned
 * @returns array of ExperimentSummaryCard
 */
export function getExperimentSummaryCards(
  limit?: number
): ExperimentSummaryCard[] {
  const records = listRecords();
  const sliced = limit ? records.slice(0, limit) : records;

  return sliced.map((r) => {
    const initialLoss = r.metrics.initialLoss;
    const finalLoss = r.metrics.finalLoss;
    const lossReduction =
      initialLoss !== 0 && Number.isFinite(initialLoss)
        ? (initialLoss - finalLoss) / initialLoss
        : 0;

    return {
      id: r.id,
      name: r.name,
      modelLabel: r.modelConfig.label,
      status: r.status,
      bestLoss: r.metrics.bestLoss,
      perplexity: Number.isFinite(r.metrics.perplexity)
        ? r.metrics.perplexity
        : null,
      tokensPerSecond: r.metrics.tokensPerSecond,
      lossReduction,
      createdAt: formatDate(r.createdAt),
      timeAgo: formatTimeAgo(r.createdAt),
    };
  });
}

// ============================================================
// Comparison
// ============================================================

/**
 * Build comparison data for two experiment records.
 *
 * @param idA — first record id
 * @param idB — second record id
 * @returns ComparisonViewData or null if either record not found
 */
export function getComparisonViewData(
  idA: string,
  idB: string
): ComparisonViewData | null {
  const recordA = getRecord(idA);
  const recordB = getRecord(idB);

  if (!recordA || !recordB) return null;

  const pair = compareRecords(recordA, recordB);
  const trainingDiffs = diffTrainingConfigs(recordA, recordB);
  const modelDiffs = diffModelConfigs(recordA, recordB);

  return {
    pair,
    trainingDiffs,
    modelDiffs,
    configChangeCount: trainingDiffs.filter((d) => d.changed).length,
    modelChangeCount: modelDiffs.filter((d) => d.changed).length,
  };
}

/**
 * Build a comparison table from all completed records.
 *
 * @returns ComparisonTable or null if no completed records
 */
export function getComparisonTable(): ComparisonTable | null {
  const completed = listByStatus("completed");
  if (completed.length === 0) return null;
  return buildComparisonTable(completed);
}

// ============================================================
// Leaderboard
// ============================================================

/**
 * Build a leaderboard ranking for a specific metric.
 *
 * @param metric — which metric to rank by
 * @param limit  — max entries
 * @returns ranked leaderboard entries
 */
export function getLeaderboard(
  metric: "bestLoss" | "perplexity" | "tokensPerSecond",
  limit = 5
): LeaderboardEntry[] {
  const completed = listByStatus("completed");
  const order = metric === "tokensPerSecond" ? "desc" : "asc";
  const ranked = rankByMetric(completed, metric, order);

  const labelMap: Record<string, string> = {
    bestLoss: "Best Loss",
    perplexity: "Perplexity",
    tokensPerSecond: "Tok/s",
  };

  return ranked.slice(0, limit).map((r) => ({
    rank: r.rank,
    name: r.record.name,
    id: r.record.id,
    modelLabel: r.record.modelConfig.label,
    value: r.value,
    valueLabel: labelMap[metric],
  }));
}

// ============================================================
// Recent activity
// ============================================================

/**
 * Get recent experiment activity for dashboard display.
 *
 * @param count — number of recent runs to return
 * @returns most recent records with formatted display fields
 */
export function getRecentActivity(
  count = 5
): ExperimentSummaryCard[] {
  return getExperimentSummaryCards(count);
}

// ============================================================
// Empty state check
// ============================================================

/**
 * Check if there is any experiment history at all.
 *
 * Used by dashboard components to decide whether to show
 * the history section or an empty state / CTA.
 */
export function hasHistory(): boolean {
  return storeStats().total > 0;
}

// ============================================================
// Re-exports for convenience
// ============================================================

export type {
  ExperimentRecord,
  ExperimentStatus,
} from "@/lib/minimind/experiments/history/ExperimentRecord";
export type {
  RecordPairComparison,
  ComparisonTable,
  ComparisonTableRow,
  TrainingDiff,
  ModelDiff,
  RankedRecord,
} from "@/lib/minimind/experiments/history/ExperimentComparison";
