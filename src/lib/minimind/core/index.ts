// ============================================================
// MiniMind Core — Barrel export for Tensor + Autograd engine
// ============================================================

// ── Tensor ──
export { Tensor, indexFor, shapeSize } from "./Tensor";

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
