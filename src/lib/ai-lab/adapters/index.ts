// ============================================================
// AI Lab Adapters — Public API barrel export
// ============================================================
//
// All AI Lab UI components MUST import from this barrel or
// individual adapter files. Direct registry imports are
// prohibited in UI components.
// ============================================================

// progressAdapter — aggregate stats
export {
  computeModuleStats,
  computeExperimentStats,
  computePhaseProgress,
  computeDashboardProgress,
  getActiveExperiments,
  getModules,
  getModuleById,
  type MiniMindModule,
  type MiniMindExperiment,
  type ModuleProgressStats,
  type ExperimentProgressStats,
  type PhaseProgress,
  type DashboardProgress,
} from "./progressAdapter";

// missionAdapter — learning intelligence
export {
  parseStoredProgress,
  loadProgress,
  loadProgressPercent,
  deriveMission,
  deriveResumeData,
  formatTimeAgo,
  type StoredProgress,
  type MissionData,
  type ResumeData,
} from "./missionAdapter";

// moduleLinks — navigation route config
export {
  buildExploreRoutes,
  buildModuleNavLinks,
  type ExploreRoute,
  type ModuleNavLink,
} from "./moduleLinks";

// historyAdapter — experiment run history
export {
  getHistoryOverview,
  getExperimentSummaryCards,
  getComparisonViewData,
  getComparisonTable,
  getLeaderboard,
  getRecentActivity,
  hasHistory,
  type ExperimentSummaryCard,
  type HistoryOverview,
  type ComparisonViewData,
  type LeaderboardEntry,
  type ExperimentRecord,
  type ExperimentStatus,
  type RecordPairComparison,
  type ComparisonTable,
  type ComparisonTableRow,
  type TrainingDiff,
  type ModelDiff,
  type RankedRecord,
} from "./historyAdapter";

// trainingAdapter — training run data for dashboard (Phase 52)
export {
  getLatestTrainingRun,
  getTrainingMetrics,
  getLossHistory,
  getGenerationSamples,
  getTrainingStats,
  summarizeTrainingRun,
  getTrainingRunSummaries,
  hasTrainingHistory,
  type TrainingRunSummary,
  type LossHistoryPoint,
  type GenerationSample,
  type TrainingStats,
} from "./trainingAdapter";
