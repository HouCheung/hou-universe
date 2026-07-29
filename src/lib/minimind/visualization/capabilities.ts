// ============================================================
// MiniMind — capabilities.ts
// ============================================================
// Visualization Capability Defaults
//
// 定义默认的可视化能力标志对象，所有布尔字段初始为 false。
// ForwardVisualAdapter 在 enrich 阶段导入此默认值，
// clone 后按 enrich 成功情况逐标志设为 true。
// UI 组件仅渲染 capabilities 中为 true 的子面板。
// ============================================================

import type { VisualizationCapabilities } from "./types";

/**
 * 默认的可视化能力标志
 *
 * 所有子阶段的所有功能标志均为 false。
 * adapter 应在每次 enrich 时从此对象 clone，
 * 然后根据实际数据的可用性将对应标志设为 true。
 *
 * @example
 * ```typescript
 * const caps = { ...DEFAULT_CAPABILITIES };
 * caps.tokenizer = { ...caps.tokenizer, tokenList: true };
 * ```
 */
export const DEFAULT_CAPABILITIES: VisualizationCapabilities = {
  tokenizer: {
    tokenList: false,
    vocabExplorer: false,
  },
  embedding: {
    vectorViewer: false,
    matrixHeatmap: false,
    statsPanel: false,
  },
  rope: {
    rotation2DView: false,
    normCheck: false,
    frequencyChart: false,
  },
  transformer: {
    attentionHeatmap: false,
    attentionHeadDiversity: false,
    ffnGateDistribution: false,
    residualFlowChart: false,
  },
  lmHead: {
    logitsHistogram: false,
    topKRanking: false,
    probabilityDistribution: false,
  },
};
