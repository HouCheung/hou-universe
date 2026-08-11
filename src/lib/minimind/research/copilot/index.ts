// ============================================================
// MiniMind — research/copilot/index.ts
// ============================================================
// Phase 59: Research Copilot — Barrel Export
//
// Unified export for:
//   - ResearchInsightEngine — deterministic training analysis
//   - RecommendationEngine — evidence-backed recommendations
//   - ComparisonInsightEngine — multi-experiment comparison
//   - ResearchReport — JSON + Markdown report generation
// ============================================================

// ── Research Insight Engine ──
export { ResearchInsightEngine } from "./ResearchInsightEngine";
export type {
  ResearchInsight,
  ResearchInsights,
  InsightType,
  InsightSeverity,
} from "./ResearchInsightEngine";

// ── Recommendation Engine ──
export { RecommendationEngine } from "./RecommendationEngine";
export type {
  ResearchRecommendation,
  RecommendationSet,
  RecommendationCategory,
  RecommendationPriority,
} from "./RecommendationEngine";

// ── Comparison Insight Engine ──
export { ComparisonInsightEngine } from "./ComparisonInsightEngine";
export type {
  ExperimentComparisonResult,
  MetricWinner,
  TradeOff,
} from "./ComparisonInsightEngine";

// ── Research Report ──
export { ResearchReport } from "./ResearchReport";
export type { ResearchReportData } from "./ResearchReport";

// ── Phase 62: Benchmark Copilot ──
export { BenchmarkCopilot } from "./BenchmarkCopilot";
export type {
  BenchmarkInsight,
  BenchmarkInsights,
  BenchmarkRecommendation,
} from "./BenchmarkCopilot";
