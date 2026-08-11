// ============================================================
// MiniMind — research/index.ts
// ============================================================
// Phase 57: Research Workspace — Barrel Export
//
// Unified export for:
//   - ResearchState types and factories
//   - ResearchWorkspace CRUD manager
//   - ExperimentController pipeline orchestrator
//   - TrainingEventBus live event system
// ============================================================

// ── Research State Types ──
export {
  createResearchSession,
  generateSessionId,
  generateTimelineEventId,
  isResearchSession,
  validateResearchSession,
  getStatusLabel,
  compareByUpdatedAt,
  compareByCreatedAt,
} from "./ResearchState";

export type {
  ResearchSession,
  ResearchStatus,
  SessionConfig,
  TrainingMetricsSnapshot,
  ResearchCheckpoint,
  ResearchTimelineEvent,
} from "./ResearchState";

// ── Research Workspace (localStorage CRUD) ──
export {
  ResearchWorkspace,
  workspace,
} from "./ResearchWorkspace";

// ── Experiment Controller (pipeline orchestrator) ──
export {
  ExperimentController,
} from "./ExperimentController";

export type {
  ExperimentStatusResult,
} from "./ExperimentController";

// ── Training Event Bus (live updates) ──
export {
  TrainingEventBus,
  eventBus,
} from "./TrainingEventBus";

export type {
  TrainingEventType,
  EventCallback,
  UnsubscribeFn,
  TrainingEventMap,
  TrainingStartData,
  TrainingStepData,
  TrainingCheckpointData,
  TrainingEvaluationData,
  TrainingCompleteData,
  TrainingErrorData,
} from "./TrainingEventBus";

// ── Training Runtime (Phase 58: Live Training Bridge) ──
export {
  TrainingRuntime,
  trainingRuntime,
} from "./TrainingRuntime";

export type {
  TrainingRuntimeStatus,
  TrainingRuntimeState,
  TrainingRuntimeConfig,
} from "./TrainingRuntime";

// ── Research Copilot (Phase 59: AI Research Copilot) ──
export {
  ResearchInsightEngine,
  RecommendationEngine,
  ComparisonInsightEngine,
  ResearchReport,
} from "./copilot";

export type {
  ResearchInsight,
  ResearchInsights,
  InsightType,
  InsightSeverity,
  ResearchRecommendation,
  RecommendationSet,
  RecommendationCategory,
  RecommendationPriority,
  ExperimentComparisonResult,
  MetricWinner,
  TradeOff,
  ResearchReportData,
} from "./copilot";

// ── Phase 60: Research Experiment Loop ──

// Research Experiment Definition
export {
  createResearchExperiment,
  validateResearchExperiment,
  isResearchExperiment,
  cloneResearchExperiment,
  serializeResearchExperiment,
  deserializeResearchExperiment,
  summarizeExperiment,
  generateExperimentId,
} from "./ResearchExperiment";

export type {
  ResearchExperiment,
  ResearchExperimentStatus,
  DatasetConfig,
  TokenizerConfig,
  EvaluationConfig,
} from "./ResearchExperiment";

// Research Run Record
export {
  createResearchRun,
  startResearchRun,
  completeResearchRun,
  failResearchRun,
  cancelResearchRun,
  validateResearchRun,
  isResearchRun,
  getRunDuration,
  summarizeRun,
  compareRunsByBestLoss,
  compareRunsBySpeed,
  hasGenerationData,
  hasAnalysis,
  hasReproducibilityCheck,
  generateRunId,
} from "./ResearchRun";

export type {
  ResearchRun,
  ResearchRunStatus,
  RunGenerationResult,
  RunAnalysis,
  RunReproducibility,
} from "./ResearchRun";

// Research Experiment Store
export {
  createExperiment,
  getExperiment,
  listExperiments,
  updateExperiment,
  deleteExperiment,
  experimentCount,
  createRun,
  getRun,
  listRuns,
  listRunsByExperiment,
  updateRun,
  deleteRun,
  deleteRunsByExperiment,
  getLatestRun,
  getBestRun,
  runCount,
  exportExperiment,
  importExperiment,
  exportRun,
  importRun,
  exportAll,
  importAll,
  clearAll,
  totalExperiments,
  totalRuns,
  hasRun,
  hasExperiment,
} from "./ResearchExperimentStore";

// Research Experiment Runner
export {
  ResearchExperimentRunner,
  createInlineTrainingExecutor,
} from "./ResearchExperimentRunner";

export type {
  TrainingExecutionResult,
  TrainingExecutor,
  ResearchExperimentRunnerOptions,
  ResearchExperimentRunnerResult,
} from "./ResearchExperimentRunner";

// Experiment Queue
export { ExperimentQueue } from "./ExperimentQueue";
export type { QueueItem, QueueItemStatus } from "./ExperimentQueue";

// Baseline / Ablation Workflow
export { BaselineWorkflow } from "./BaselineWorkflow";
export type {
  AblationVariantDef,
  BaselineResult,
  AblationWorkflowResult,
} from "./BaselineWorkflow";

// Reproducibility Certificate
export { ReproducibilityCertificate } from "./ReproducibilityCertificate";
export type { ReproducibilityCertificateData } from "./ReproducibilityCertificate";

// Phase 62: Research Benchmark
export {
  createExperimentFingerprint,
  compareExperimentIdentity,
  formatFingerprint,
  extractExperimentIdentity,
  ResearchBenchmarkRunner,
  detectConvergence,
  formatBenchmarkReport,
  compareBenchmarkReports,
  BenchmarkSuite,
  createModelScaleSuite,
  createLearningRateSuite,
  createBatchSizeSuite,
  createEpochSuite,
  generateConclusions,
  assessSignificance,
  formatConclusions,
  createBenchmarkResearchReport,
  reportToJSON,
  reportFromJSON,
  reportToMarkdown,
} from "./benchmark";

export type {
  ExperimentFingerprint,
  ExperimentIdentity,
  FingerprintModelConfig,
  FingerprintTrainingConfig,
  FingerprintDatasetConfig,
  FingerprintTokenizerConfig,
  ResearchBenchmarkProfile,
  ResearchBenchmarkRunResult,
  ResearchBenchmarkAggregate,
  ResearchBenchmarkResult,
  ResearchBenchmarkReport,
  BenchmarkMetricStats,
  ConvergenceStats,
  SuiteMember,
  SuiteMemberResult,
  BenchmarkSuiteResult,
  SuiteComparison,
  BenchmarkSuiteConfig,
  ResearchConclusion,
  ResearchConclusions,
  ConclusionCategory,
  ConclusionSeverity,
  SignificanceLevel,
  BenchmarkResearchReport,
} from "./benchmark";

// Research Report v2
export { ResearchReportV2 } from "./ResearchReportV2";
export type {
  ResearchReportV2Data,
  NextExperimentSuggestion,
} from "./ResearchReportV2";

// Next Experiment Generator
export { NextExperimentGenerator } from "./NextExperimentGenerator";
export type {
  PrefilledExperiment,
  NextExperimentResult,
} from "./NextExperimentGenerator";
