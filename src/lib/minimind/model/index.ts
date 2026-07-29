// ============================================================
// MiniMind — model/index.ts
// ============================================================
// Model 模块统一导出入口
// ============================================================

export { MiniLMHead } from "./LMHead";
export { MiniMindModel } from "./MiniMindModel";
export { runForwardExample } from "./examples";
export type {
  ModelConfig,
  ModelInput,
  ModelOutput,
  ModelTrace,
} from "./types";
