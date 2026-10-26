// ============================================================
// MiniMind — experiments/index.ts
// ============================================================
// Experiment Runtime Layer — Barrel Export
//
// 统一导出：
//   - 所有类型定义（从 ./types）
//   - createExperimentContext（工厂函数）
//   - CharacterTokenizer（实验专用字符级分词器）
//   - runExperiment / registerRunner / getRunner（执行层）
//   - 所有 runner 类（从 ./runners/*）
// ============================================================

// ── 类型 ──
export type {
  // 核心类型
  ExperimentContext,
  ExperimentModuleConfig,
  ExperimentResult,
  ExperimentError,
  ExperimentTiming,
  ExperimentRunner,
  ICharacterTokenizer,
  // Experiment 1: Tokenizer Comparison
  TokenizerComparisonInput,
  TokenizerComparisonData,
  TokenizerRunSummary,
  TokenizerComparisonMetrics,
  // Experiment 2: Embedding Explorer
  EmbeddingExplorerInput,
  EmbeddingExplorerData,
  EmbeddingVectorInfo,
  TokenSimilarity,
  // Experiment 3: Attention Heatmap
  AttentionHeatmapInput,
  AttentionHeatmapData,
  HeadHeatmapData,
} from "./types";

// ── Context 工厂 + CharacterTokenizer ──
export {
  createExperimentContext,
  CharacterTokenizer,
  getRequiredModuleNames,
} from "./ExperimentContext";

// ── Runner 注册表 + 执行入口 ──
export {
  registerRunner,
  getRunner,
  getRegisteredExperimentIds,
  runExperiment,
} from "./ExperimentRunner";

// ── Runner 类（导入即自动注册） ──
export { TokenizerComparisonRunner } from "./runners/TokenizerComparisonRunner";
export { EmbeddingExplorerRunner } from "./runners/EmbeddingExplorerRunner";
export { AttentionHeatmapRunner } from "./runners/AttentionHeatmapRunner";

// ── Phase 50: Model Registry ──
export {
  getModelConfig,
  listModels,
  createModel,
  registerModel,
  hasModel,
  modelCount,
  toTensorConfig,
} from "./ModelRegistry";
export type { ModelConfigEntry } from "./ModelRegistry";

// ── Phase 50: Training Recipe ──
export {
  loadRecipe,
  saveRecipe,
  listRecipes,
  listRecipeNames,
  hasRecipe,
  summarizeRecipe,
  diffRecipes,
  validateRecipe,
  recipeToJSON,
  recipeFromJSON,
} from "./TrainingRecipe";
export type {
  TrainingRecipe,
  RecipeOptimizerConfig,
  RecipeSchedulerConfig,
  RecipeDatasetConfig,
} from "./TrainingRecipe";

// ── Phase 50: Ablation ──
export { Ablation } from "./Ablation";
export type {
  AblationVariant,
  AblationConfig,
  AblationTrainingConfig,
  AblationVariantResult,
  AblationReport,
  AblationComparisonRow,
} from "./Ablation";

// ── Phase 51: Experiment History ──
export type {
  ExperimentRecord,
  ExperimentMetrics,
  ExperimentStatus,
} from "./history/ExperimentRecord";

export {
  createExperimentRecord,
  isExperimentRecord,
  validateExperimentRecord,
  compareByDate,
  compareByBestLoss,
  summarizeRecord,
} from "./history/ExperimentRecord";

export {
  save as saveExperimentRecord,
  get as getExperimentRecord,
  list as listExperimentRecords,
  listByStatus as listExperimentRecordsByStatus,
  update as updateExperimentRecord,
  deleteRecord as deleteExperimentRecord,
  clear as clearExperimentHistory,
  count as experimentRecordCount,
  has as hasExperimentRecord,
  latest as latestExperimentRecord,
  stats as experimentHistoryStats,
} from "./history/ExperimentStore";

export {
  compareRecords as compareExperimentRecords,
  buildComparisonTable as buildExperimentComparisonTable,
  diffTrainingConfigs as diffExperimentTrainingConfigs,
  diffModelConfigs as diffExperimentModelConfigs,
  rankByMetric as rankExperimentsByMetric,
  summarizeComparison as summarizeExperimentComparison,
} from "./history/ExperimentComparison";
export type {
  MetricDelta,
  RecordPairComparison,
  ComparisonTable,
  ComparisonTableRow,
  TrainingDiff,
  ModelDiff,
  RankedRecord,
} from "./history/ExperimentComparison";

// ── Phase 46: Node-only exports ──
// ExperimentConfig, TrainingExperimentRunner, and BenchmarkReport use
// Node.js fs/path — they are NOT browser-safe.
// Import them from "@/lib/minimind/experiments/node" (or "@/lib/minimind/node")
// for CLI / server-side use.
