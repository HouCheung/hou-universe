// ============================================================
// MiniMind Core — Barrel export for Tensor + Autograd engine
// ============================================================

// ── Tensor ──
export { Tensor, indexFor, shapeSize } from "./Tensor";

// ── Parameter ──
export { Parameter } from "./Parameter";

// ── Parameter Registry ──
export { ParameterRegistry } from "./ParameterRegistry";
export type { NamedParameter } from "./ParameterRegistry";

// ── Module ──
export { Module } from "./Module";

// ── Linear Layer ──
export { Linear } from "./Linear";

// ── Autograd ──
export { executeBackward, buildTopologicalOrder } from "./autograd";
export type { BackwardContext } from "./autograd";

// ── Operators ──
export { add } from "./ops/add";
export { multiply } from "./ops/multiply";
export { matmul } from "./ops/matmul";
export { sum } from "./ops/sum";
export { reshape } from "./ops/reshape";
export { transpose } from "./ops/transpose";
export { softmax } from "./ops/softmax";
export { relu } from "./ops/relu";
export { silu } from "./ops/silu";
export { sqrt } from "./ops/sqrt";
export { divide } from "./ops/divide";
export { batchMatmul } from "./ops/batchMatmul";
export { causalMask } from "./ops/causalMask";

// ── Loss ──
export { crossEntropyLoss } from "./loss/CrossEntropyLoss";

// ── Optim ──
export { Optimizer } from "./optim/Optimizer";
export { SGDOptimizer } from "./optim/SGD";
export { AdamWOptimizer } from "./optim/AdamW";
export type { AdamWConfig } from "./optim/AdamW";

// ── Scheduler (Phase 42) ──
export { LRScheduler } from "./scheduler/LRScheduler";
export type { SchedulerState } from "./scheduler/LRScheduler";
export { CosineScheduler } from "./scheduler/CosineScheduler";
export type { CosineSchedulerConfig, CosineSchedulerState } from "./scheduler/CosineScheduler";
export { LinearWarmupScheduler } from "./scheduler/LinearWarmupScheduler";
export type { LinearWarmupConfig, LinearWarmupState } from "./scheduler/LinearWarmupScheduler";

// ── Phase 43: Gradient Clipping ──
export { clipGradients, computeGlobalNorm, clipGradientsByValue } from "./GradientClipper";

// ── Phase 43: Initialization Utilities ──
export { Initialization } from "./Initialization";
export type { Initializer } from "./Initialization";

// ── Phase 47: Random Engine ──
export { SeededRandom, Random } from "./random";
