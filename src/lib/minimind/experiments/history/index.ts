// ============================================================
// MiniMind — experiments/history/index.ts
// ============================================================
// Phase 51: Experiment History — Barrel Export
//
// Exports all types, guards, and store operations for the
// experiment history layer.
// ============================================================

// ── Types ──
export type {
  ExperimentRecord,
  ExperimentMetrics,
  ExperimentStatus,
} from "./ExperimentRecord";

// ── Factories & Guards ──
export {
  createExperimentRecord,
  isExperimentRecord,
  validateExperimentRecord,
  compareByDate,
  compareByBestLoss,
  summarizeRecord,
} from "./ExperimentRecord";

// ── Store (CRUD + queries) ──
// Phase 68: Routed through LegacyExperimentAdapter → canonical ResearchExperimentStore
export {
  save,
  get,
  list,
  listByStatus,
  update,
  deleteRecord,
  clear,
  count,
  has,
  latest,
  stats,
} from "./LegacyExperimentAdapter";

// ── Comparison Engine ──
export {
  compareRecords,
  buildComparisonTable,
  diffTrainingConfigs,
  diffModelConfigs,
  rankByMetric,
  summarizeComparison,
} from "./ExperimentComparison";
export type {
  MetricDelta,
  RecordPairComparison,
  ComparisonTable,
  ComparisonTableRow,
  TrainingDiff,
  ModelDiff,
  RankedRecord,
} from "./ExperimentComparison";
