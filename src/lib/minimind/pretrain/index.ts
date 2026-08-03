// ============================================================
// MiniMind — pretrain/index.ts
// ============================================================
// Pretrain 模块统一导出入口
//
// 导出所有公开类型和类。
// 当前不从主 minimind/index.ts 导出 — 预训练模块为独立消费者。
// ============================================================

// ── Types ──
export type {
  TrainingSample,
  TrainingConfig,
  LossResult,
  TrainingCapability,
  EpochResult,
  TrainingTrace,
  TrainingResult,
  ParameterGradient,
  Optimizer,
} from "./types";

// ── Dataset ──
export { ToyDataset } from "./dataset";

// ── Loss ──
export { CrossEntropyLoss } from "./loss";

// ── Optimizer ──
export { NoOpOptimizer, FutureSGDOptimizer } from "./optimizer";

// ── Pretrainer ──
export { Pretrainer } from "./Pretrainer";
