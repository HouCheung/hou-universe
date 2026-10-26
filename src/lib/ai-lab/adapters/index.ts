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

// trainingVisualizationAdapter — observatory chart data (Phase 53)
export {
  getLossCurveData,
  getLossCurveDataById,
  getLearningRateCurveData,
  getThroughputData,
  getTrainingSummary,
  getTrainingSummaryById,
  getGenerationComparison,
  getObservatoryStats,
  hasObservatoryData,
  getRunList,
  getLatestAnalysis,
  type LossCurvePoint,
  type LossCurveData,
  type LearningRateCurvePoint,
  type LearningRateCurveData,
  type ThroughputPoint,
  type ThroughputData,
  type TrainingSummary,
  type GenerationComparisonData,
} from "./trainingVisualizationAdapter";

// experimentLauncherAdapter — experiment launch workspace (Phase 56)
export {
  getAvailableModels,
  getModelOption,
  getAvailableRecipes,
  getRecipesForModel,
  getRecipeOption,
  getDatasetOptions,
  getDatasetOption,
  buildExperimentPreview,
  validateLaunchConfig,
  getWorkspaceOverview,
  getLatestExperiment,
  hasExperimentHistory,
  generateExperimentId,
  suggestExperimentName,
  type ModelOption,
  type RecipeOption,
  type DatasetOption,
  type LaunchConfig,
  type ExperimentPreview,
  type LaunchValidationResult,
  type ExperimentWorkspaceOverview,
} from "./experimentLauncherAdapter";

// researchWorkspaceAdapter — research workspace (Phase 57)
export {
  getWorkspaceSessions,
  getActiveSession,
  getSessionSummary,
  getTrainingStatus,
  getExperimentTimeline,
  getWorkspaceStats,
  type SessionSummary,
  type TrainingStatusData,
  type TimelineEntry,
  type SessionTimeline,
  type WorkspaceStats,
} from "./researchWorkspaceAdapter";

// liveTrainingAdapter — live training runtime bridge (Phase 58, 66)
export {
  getLiveMetrics,
  getActiveLiveMetrics,
  getTrainingTimeline,
  getActiveTrainingTimeline,
  getTrainingStatusBadge,
  getActiveTrainingStatusBadge,
  getLiveTrainingData,
  getCheckpointList,
  getCurrentCheckpoint,
  getRecoveryState,
  getTrainingControls,
  getTrainingProgress,
  type LiveMetrics,
  type TrainingTimelineEntry,
  type TrainingTimeline,
  type TrainingBadgeStatus,
  type TrainingStatusBadge,
  type CheckpointSummary,
  type CheckpointList,
  type RecoveryState,
  type TrainingControls,
  type TrainingProgress,
} from "./liveTrainingAdapter";

// researchCopilotAdapter — research copilot analysis (Phase 59)
export {
  getCopilotAnalysis,
  getLatestCopilotAnalysis,
  getCriticalFindings,
  getRecommendations,
  getExperimentComparison,
  getComparisonOfCompleted,
  getResearchSummary,
  generateJSONReport,
  generateMarkdownReport,
  getReportSections,
  hasCopilotData,
  getAnalyzableRunIds,
  getAnalyzableRuns,
  type CopilotOverallStatus,
  type CopilotFinding,
  type CopilotRecommendation,
  type CopilotAnalysis,
  type CopilotComparison,
} from "./researchCopilotAdapter";

// generationAdapter — generation & evaluation bridge (Phase 67)
export {
  generateFromSession,
  generateBaseline,
  generateComparison,
  cancelGeneration,
  getGenerationHistory,
  getSessionGenerationHistory,
  deleteHistoryEntry,
  clearGenerationHistory,
  getGenerationCheckpointInfo,
  getGeneratableSessions,
  exportGenerationJSON,
  exportGenerationMarkdown,
  toGenerationUIData,
  toComparisonUIData,
  type GenerationUIData,
  type ComparisonUIData,
  type GenerationHistoryUIData,
  type GenerationCheckpointInfo,
} from "./generationAdapter";

// studioAdapter — MiniMind Studio dashboard aggregation (Phase 64)
export {
  getStudioHeroData,
  getModelOverview,
  getStudioTrainingSummary,
  getRecentExperiments,
  getResearchInsights,
  getQuickNavCards,
  type StudioAction,
  type StudioStat,
  type StudioHeroData,
  type ModelOverviewData,
  type TrainingSummaryData,
  type RecentExperimentData,
  type ResearchInsightFinding,
  type ResearchInsightRecommendation,
  type ResearchInsightData,
  type QuickNavCard,
} from "./studioAdapter";

// chatAdapter — Chat conversation bridge (Phase 69, 72)
export {
  chatSend,
  chatRetry,
  chatRegenerate,
  ChatGenerationError,
  getChatContextInfo,
  listChatConversations,
  getChatConversation,
  deleteChatConversation,
  clearChatConversations,
  getChatConversationCount,
  getDefaultChatConfig,
  getChatCheckpointOptions,
  type ChatGenerationConfig,
  type ChatSendResult,
  type ChatContextInfo,
} from "./chatAdapter";
