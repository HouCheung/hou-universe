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
