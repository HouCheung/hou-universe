// ============================================================
// MiniMind — ffn/index.ts
// ============================================================
// FFN 模块 — 统一导出入口
//
// 整合 MiniFeedForward 类和底层数学工具，
// 供 MiniMind 顶层 index.ts、Playground 和 AI Lab 消费。
// ============================================================

// ── 主类 ──
export { MiniFeedForward } from "./FeedForward";

// ── 类型 ──
export type {
  FFNConfig,
  FFNInput,
  FFNOutput,
  ActivationTrace,
} from "./types";

// ── 数学工具（教育友好 API） ──
export {
  linear,
  sigmoid,
  silu,
  multiplyGate,
  applySiLU,
  swiGLU,
} from "./math";
