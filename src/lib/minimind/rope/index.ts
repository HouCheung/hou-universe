// ============================================================
// MiniMind — rope/index.ts
// ============================================================
// RoPE 模块 — 统一导出入口
//
// 整合 RotaryEmbedding 类和所有底层数学工具，
// 供 MiniMind 顶层 index.ts、Playground 和 AI Lab 消费。
// ============================================================

// ── 主类 ──
export { RotaryEmbedding } from "./RotaryEmbedding";

// ── 类型 ──
export type {
  RoPEConfig,
  FrequencyCache,
  RotationTrace,
  RotationResult,
  QKRotationResult,
} from "./types";

// ── 数学工具（教育友好 API） ──
export {
  getFrequencies,
  getAngles,
  getAllAngles,
  frequencyCache,
  rotateVector,
  applyRotation,
  applyQKRotation,
  l2Norm,
} from "./math";
