// ============================================================
// MiniMind — training/observatory/index.ts
// ============================================================
// Phase 53: Training Observatory — Barrel Export
//
// Unified export for:
//   - TrainingRunRecord types and factories
//   - TrainingMetricsStore CRUD operations
//   - TrainingAnalyzer computation functions
// ============================================================

// ── Types & Record ──
export type {
  TrainingRunRecord,
  LossHistoryPoint,
  PerplexityHistoryPoint,
  LearningRateHistoryPoint,
  ThroughputHistoryPoint,
  GenerationSample,
  CheckpointInfo,
  DatasetInfo,
} from "./TrainingRunRecord";

export {
  createTrainingRunRecord,
  isTrainingRunRecord,
  validateTrainingRunRecord,
  compareByTimestamp,
  compareByBestLoss,
} from "./TrainingRunRecord";

// ── Store ──
export {
  save,
  get,
  list,
  deleteRecord,
  clear,
  latest,
  count,
  has,
  listByStatus,
  stats,
} from "./TrainingMetricsStore";

// ── Analyzer ──
export {
  analyzeTrainingRun,
  detectConvergence,
  detectDivergence,
  detectUnstableLoss,
  detectOverfitting,
  computeStabilityScore,
  computeTrainingEfficiency,
} from "./TrainingAnalyzer";

export type {
  TrainingRunAnalysis,
  ConvergenceResult,
  DivergenceResult,
  UnstableLossResult,
  OverfittingResult,
} from "./TrainingAnalyzer";
