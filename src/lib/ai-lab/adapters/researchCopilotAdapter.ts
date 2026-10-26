// ============================================================
// AI Lab — adapters/researchCopilotAdapter.ts
// ============================================================
// Phase 59: Adapter layer for the Research Copilot.
//
// Pure transformation functions that bridge the copilot engine
// to the UI layer. UI components MUST import from here or the
// adapter barrel — never directly from the copilot engine.
//
// Design principles:
//   - Pure data transformation — no side effects
//   - Typed outputs — every function returns a structured type
//   - Defensive — handles empty/missing data gracefully
//   - Browser-safe — no Node.js fs/path dependencies
//   - Follows existing adapter patterns
//
// Data sources:
//   - ResearchInsightEngine (via new instance)
//   - RecommendationEngine (via new instance)
//   - ComparisonInsightEngine (via new instance)
//   - ResearchReport (via new instance)
//   - TrainingMetricsStore (list, get, latest)
//   - ExperimentStore (list, get)
// ============================================================

import {
  ResearchInsightEngine,
  RecommendationEngine,
  ComparisonInsightEngine,
  ResearchReport,
} from "@/lib/minimind/research/copilot";

import type {
  ResearchInsight,
  ResearchInsights,
  ResearchRecommendation,
  ResearchReportData,
} from "@/lib/minimind/research/copilot";

import { list as listRecords, get as getRecord } from "@/lib/minimind/training/observatory/TrainingMetricsStore";
import { list as listExperiments } from "@/lib/minimind/experiments/history/ExperimentStore";

// ============================================================
// Singleton engine instances
// ============================================================

const insightEngine = new ResearchInsightEngine();
const recommendationEngine = new RecommendationEngine();
const comparisonEngine = new ComparisonInsightEngine();
const reportGenerator = new ResearchReport();

// ============================================================
// UI-facing types
// ============================================================

/**
 * Overall training status derived from insights.
 */
export type CopilotOverallStatus = "stable" | "converging" | "needs_attention" | "critical" | "no_data";

/**
 * Simplified finding for UI display.
 */
export interface CopilotFinding {
  type: string;
  severity: "success" | "warning" | "critical" | "info";
  title: string;
  description: string;
  evidence: Record<string, number>;
  confidence: number;
}

/**
 * Simplified recommendation for UI display.
 */
export interface CopilotRecommendation {
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  rationale: string;
  evidence: Record<string, number>;
  suggestedChanges: string[];
}

/**
 * Complete copilot analysis for a training run.
 */
export interface CopilotAnalysis {
  recordId: string;
  experimentName: string;
  overallStatus: CopilotOverallStatus;
  statusLabel: string;
  statusDescription: string;
  findings: CopilotFinding[];
  successCount: number;
  warningCount: number;
  criticalCount: number;
  infoCount: number;
  recommendations: CopilotRecommendation[];
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  computedAt: number;
}

/**
 * Copilot comparison data for two experiments.
 */
export interface CopilotComparison {
  experimentIds: string[];
  experimentNames: Record<string, string>;
  summary: string;
  winners: Array<{
    metric: string;
    label: string;
    winnerName: string;
    winningValue: number;
    description: string;
  }>;
  tradeoffs: Array<{
    advantage: string;
    detail: string;
  }>;
}

// ============================================================
// Helpers
// ============================================================

function deriveOverallStatus(insights: ResearchInsights): {
  status: CopilotOverallStatus;
  label: string;
  description: string;
} {
  if (insights.insights.length === 0) {
    return {
      status: "no_data",
      label: "No Data",
      description: "No training data available for analysis.",
    };
  }

  const critical = insights.summary.critical;
  const warning = insights.summary.warning;
  const success = insights.summary.success;

  if (critical > 0) {
    return {
      status: "critical",
      label: "Needs Attention",
      description: `${critical} critical issue${critical > 1 ? "s" : ""} detected. Review recommendations.`,
    };
  }

  if (warning >= 2) {
    return {
      status: "needs_attention",
      label: "Needs Attention",
      description: `${warning} warning${warning > 1 ? "s" : ""} detected. Consider tuning hyperparameters.`,
    };
  }

  const converged = insights.insights.some(
    (i) => i.type === "convergence" && i.severity === "success"
  );

  if (converged) {
    return {
      status: "stable",
      label: "Stable",
      description: "Training has converged and is stable. No significant issues detected.",
    };
  }

  if (success > 0) {
    return {
      status: "converging",
      label: "Converging",
      description: "Training is progressing. Continue monitoring for convergence.",
    };
  }

  return {
    status: "converging",
    label: "Converging",
    description: "Training is in progress. Analysis is limited with current data.",
  };
}

function mapInsightToFinding(insight: ResearchInsight): CopilotFinding {
  return {
    type: insight.type,
    severity: insight.severity === "success" ? "success" : insight.severity === "critical" ? "critical" : insight.severity === "warning" ? "warning" : "info",
    title: insight.title,
    description: insight.description,
    evidence: insight.evidence,
    confidence: insight.confidence,
  };
}

function mapRecommendation(rec: ResearchRecommendation): CopilotRecommendation {
  return {
    priority: rec.priority,
    category: rec.category,
    title: rec.title,
    rationale: rec.rationale,
    evidence: rec.evidence,
    suggestedChanges: rec.suggestedChanges,
  };
}

// ============================================================
// Primary Analysis Functions
// ============================================================

/**
 * Get full copilot analysis for a training run record.
 *
 * @param recordId — the ID of the TrainingRunRecord to analyze
 * @returns CopilotAnalysis or null if record not found
 */
export function getCopilotAnalysis(recordId: string): CopilotAnalysis | null {
  const record = getRecord(recordId);
  if (!record) return null;

  const insights = insightEngine.analyze(record);
  const recs = recommendationEngine.recommend(
    insights,
    record.trainingConfig,
    record.modelConfig
  );

  const status = deriveOverallStatus(insights);

  return {
    recordId: insights.recordId,
    experimentName: insights.experimentName,
    overallStatus: status.status,
    statusLabel: status.label,
    statusDescription: status.description,
    findings: insights.insights.map(mapInsightToFinding),
    successCount: insights.summary.success,
    warningCount: insights.summary.warning,
    criticalCount: insights.summary.critical,
    infoCount: insights.summary.info,
    recommendations: recs.recommendations.map(mapRecommendation),
    highPriorityCount: recs.summary.high,
    mediumPriorityCount: recs.summary.medium,
    lowPriorityCount: recs.summary.low,
    computedAt: insights.computedAt,
  };
}

/**
 * Get copilot analysis for the latest training run.
 *
 * @returns CopilotAnalysis or null if no records exist
 */
export function getLatestCopilotAnalysis(): CopilotAnalysis | null {
  const records = listRecords();
  if (records.length === 0) return null;
  return getCopilotAnalysis(records[0].id);
}

/**
 * Get only critical findings from an analysis.
 */
export function getCriticalFindings(
  analysis: CopilotAnalysis
): CopilotFinding[] {
  return analysis.findings.filter(
    (f) => f.severity === "critical" || f.severity === "warning"
  );
}

/**
 * Get all recommendations from an analysis.
 */
export function getRecommendations(
  analysis: CopilotAnalysis
): CopilotRecommendation[] {
  return analysis.recommendations;
}

// ============================================================
// Comparison Functions
// ============================================================

/**
 * Compare two experiment records.
 *
 * @param idA — first experiment record ID
 * @param idB — second experiment record ID
 * @returns CopilotComparison or null if either record not found
 */
export function getExperimentComparison(
  idA: string,
  idB: string
): CopilotComparison | null {
  const experiments = listExperiments();
  const recordA = experiments.find((r) => r.id === idA);
  const recordB = experiments.find((r) => r.id === idB);

  if (!recordA || !recordB) return null;

  const comparison = comparisonEngine.compare([recordA, recordB]);

  return {
    experimentIds: comparison.experimentIds,
    experimentNames: comparison.experimentNames,
    summary: comparison.summary,
    winners: comparison.winners.map((w) => ({
      metric: w.metric,
      label: w.label,
      winnerName: w.winnerName,
      winningValue: w.winningValue,
      description: w.description,
    })),
    tradeoffs: comparison.tradeoffs.map((t) => ({
      advantage: t.advantage,
      detail: t.detail,
    })),
  };
}

/**
 * Compare all completed experiments.
 *
 * @returns CopilotComparison or null if < 2 completed experiments
 */
export function getComparisonOfCompleted(): CopilotComparison | null {
  const experiments = listExperiments();
  const completed = experiments.filter((r) => r.status === "completed");

  if (completed.length < 2) return null;

  const comparison = comparisonEngine.compare(completed);

  return {
    experimentIds: comparison.experimentIds,
    experimentNames: comparison.experimentNames,
    summary: comparison.summary,
    winners: comparison.winners.map((w) => ({
      metric: w.metric,
      label: w.label,
      winnerName: w.winnerName,
      winningValue: w.winningValue,
      description: w.description,
    })),
    tradeoffs: comparison.tradeoffs.map((t) => ({
      advantage: t.advantage,
      detail: t.detail,
    })),
  };
}

// ============================================================
// Research Summary
// ============================================================

/**
 * Get a brief research summary for dashboard display.
 */
export function getResearchSummary(recordId: string): {
  experimentName: string;
  status: string;
  overallStatus: CopilotOverallStatus;
  statusLabel: string;
  keyFinding: string;
  topRecommendation: string | null;
} | null {
  const analysis = getCopilotAnalysis(recordId);
  if (!analysis) return null;

  const keyFinding =
    analysis.criticalCount > 0
      ? `${analysis.criticalCount} critical issue${analysis.criticalCount > 1 ? "s" : ""} detected`
      : analysis.warningCount > 0
        ? `${analysis.warningCount} warning${analysis.warningCount > 1 ? "s" : ""}`
        : analysis.successCount > 0
          ? "Training stable and converging"
          : "Analysis in progress";

  const topRec =
    analysis.recommendations.length > 0
      ? analysis.recommendations[0].title
      : null;

  return {
    experimentName: analysis.experimentName,
    status: analysis.statusLabel,
    overallStatus: analysis.overallStatus,
    statusLabel: analysis.statusLabel,
    keyFinding,
    topRecommendation: topRec,
  };
}

// ============================================================
// Report Generation
// ============================================================

/**
 * Generate a JSON research report.
 */
export function generateJSONReport(recordId: string): ResearchReportData | null {
  const record = getRecord(recordId);
  if (!record) return null;

  const insights = insightEngine.analyze(record);
  const recs = recommendationEngine.recommend(
    insights,
    record.trainingConfig,
    record.modelConfig
  );

  return reportGenerator.generateJSON({
    insights,
    recommendations: recs.recommendations,
    experimentName: record.experimentName,
    recordId: record.id,
    modelLabel: record.modelConfig.label,
    modelParams: record.modelConfig.estimatedParams,
    datasetName: record.datasetInfo.name,
    datasetBlockSize: record.datasetInfo.blockSize,
    datasetBatchSize: record.datasetInfo.batchSize,
    seed: record.trainingConfig.seed,
    initialLoss: record.initialLoss,
    finalLoss: record.finalLoss,
    bestLoss: record.bestLoss,
    perplexity: record.finalPerplexity,
    averageThroughput: record.averageThroughput,
    totalSteps: record.totalSteps,
    totalEpochs: record.totalEpochs,
    durationMs: record.durationMs,
    status: record.status,
  });
}

/**
 * Generate a Markdown research report.
 */
export function generateMarkdownReport(recordId: string): string | null {
  const record = getRecord(recordId);
  if (!record) return null;

  const insights = insightEngine.analyze(record);
  const recs = recommendationEngine.recommend(
    insights,
    record.trainingConfig,
    record.modelConfig
  );

  return reportGenerator.generateMarkdown({
    insights,
    recommendations: recs.recommendations,
    experimentName: record.experimentName,
    recordId: record.id,
    modelLabel: record.modelConfig.label,
    modelParams: record.modelConfig.estimatedParams,
    datasetName: record.datasetInfo.name,
    datasetBlockSize: record.datasetInfo.blockSize,
    datasetBatchSize: record.datasetInfo.batchSize,
    seed: record.trainingConfig.seed,
    initialLoss: record.initialLoss,
    finalLoss: record.finalLoss,
    bestLoss: record.bestLoss,
    perplexity: record.finalPerplexity,
    averageThroughput: record.averageThroughput,
    totalSteps: record.totalSteps,
    totalEpochs: record.totalEpochs,
    durationMs: record.durationMs,
    status: record.status,
  });
}

// ============================================================
// Report Sections (for incremental UI rendering)
// ============================================================

/**
 * Get report sections for incremental rendering in the UI.
 */
export function getReportSections(recordId: string): {
  experiment: { name: string; model: string; dataset: string; seed: number } | null;
  trainingSummary: Record<string, string | number> | null;
  findings: CopilotFinding[];
  problems: CopilotFinding[];
  recommendations: CopilotRecommendation[];
  reproducibility: Record<string, string | boolean> | null;
} | null {
  const record = getRecord(recordId);
  if (!record) return null;

  const insights = insightEngine.analyze(record);
  const recs = recommendationEngine.recommend(
    insights,
    record.trainingConfig,
    record.modelConfig
  );

  return {
    experiment: {
      name: record.experimentName,
      model: record.modelConfig.label,
      dataset: record.datasetInfo.name,
      seed: record.trainingConfig.seed,
    },
    trainingSummary: {
      initialLoss: record.initialLoss.toFixed(4),
      finalLoss: record.finalLoss.toFixed(4),
      bestLoss: record.bestLoss.toFixed(4),
      perplexity: Number.isFinite(record.finalPerplexity)
        ? record.finalPerplexity.toFixed(2)
        : "N/A",
      throughput: `${record.averageThroughput.toFixed(1)} tok/s`,
      steps: String(record.totalSteps),
      epochs: String(record.totalEpochs),
      duration: `${(record.durationMs / 1000).toFixed(1)}s`,
      status: record.status,
    },
    findings: insights.insights.map(mapInsightToFinding),
    problems: insights.insights
      .filter(
        (i) => i.severity === "critical" || i.severity === "warning"
      )
      .map(mapInsightToFinding),
    recommendations: recs.recommendations.map(mapRecommendation),
    reproducibility: {
      seed: String(record.trainingConfig.seed),
      model: record.modelConfig.label,
      checkpointAvailable: record.status === "completed",
    },
  };
}

// ============================================================
// Utility
// ============================================================

/**
 * Check if copilot analysis is available (at least one record exists).
 */
export function hasCopilotData(): boolean {
  return listRecords().length > 0;
}

/**
 * List all record IDs available for analysis.
 */
export function getAnalyzableRunIds(): string[] {
  return listRecords().map((r) => r.id);
}

/**
 * Get a map of run IDs to experiment names for selection UI.
 */
export function getAnalyzableRuns(): Array<{ id: string; name: string; status: string; timestamp: number }> {
  return listRecords().map((r) => ({
    id: r.id,
    name: r.experimentName,
    status: r.status,
    timestamp: r.timestamp,
  }));
}
