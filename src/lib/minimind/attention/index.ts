// ============================================================
// MiniMind — attention/index.ts
// ============================================================
// Attention 模块 — 统一导出入口
//
// 整合 MiniAttention 类和所有底层数学工具，
// 供 MiniMind 顶层 index.ts、Playground 和 AI Lab 消费。
// ============================================================

// ── 主类 ──
export { MiniAttention } from "./Attention";

// ── 类型 ──
export type {
  AttentionConfig,
  AttentionInput,
  AttentionScore,
  AttentionTrace,
  AttentionOutput,
} from "./types";

// ── 数学工具（教育友好 API） ──
export {
  dotProduct,
  matrixMultiply,
  transpose,
  softmax,
  applyCausalMask,
  applyPaddingMask,
  scaledDotProductAttention,
} from "./math";
