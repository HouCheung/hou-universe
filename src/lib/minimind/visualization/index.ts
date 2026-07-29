// ============================================================
// MiniMind — visualization/index.ts
// ============================================================
// Visualization 模块 Barrel Export
//
// 统一导出：
//   - ForwardVisualAdapter（核心桥接器）
//   - DEFAULT_CAPABILITIES（默认能力标志）
//   - 所有类型定义（从 ./types）
// ============================================================

export { ForwardVisualAdapter } from "./ForwardVisualAdapter";
export { DEFAULT_CAPABILITIES } from "./capabilities";

export type {
  VisualTrace,
  TokenizerVisualData,
  TokenDetail,
  EmbeddingVisualData,
  VectorStat,
  EmbeddingMatrixInfo,
  RoPEVisualData,
  RoPEConfigSummary,
  RoPERotationTrace,
  DimPairTrace,
  TransformerVisualData,
  TransformerOverviewData,
  AttentionVisualData,
  FFNVisualData,
  LMHeadVisualData,
  TokenPrediction,
  LogitsDistribution,
  VisualizationCapabilities,
  TokenizerCapabilities,
  EmbeddingCapabilities,
  RoPECapabilities,
  TransformerCapabilities,
  LMHeadCapabilities,
} from "./types";
