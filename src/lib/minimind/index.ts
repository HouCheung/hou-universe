// ============================================================
// MiniMind — index.ts
// ============================================================
// MiniMind 统一导出入口
//
// 整合所有 MiniMind 子模块的公开 API，
// 供 Playground、AI Lab 和外部消费者使用。
// ============================================================

// ── Tokenizer ──
export { MiniTokenizer } from "./tokenizer/MiniTokenizer";
export type { MiniTokenizerOptions } from "./tokenizer/MiniTokenizer";

export { Vocabulary, DEFAULT_SPECIAL_TOKENS, SPECIAL_TOKEN_TO_ID } from "./tokenizer/vocabulary";
export type { SpecialToken } from "./tokenizer/vocabulary";

export type { TokenInfo, ExplainResult } from "./tokenizer/types";

export { TokenizerStage } from "./tokenizer/stages";
export { TokenizerPipeline, getImplementedSteps, getPlannedSteps, getStepByStage } from "./tokenizer/pipeline";
export type { PipelineStep } from "./tokenizer/pipeline";

export {
  EducationalTokenizerFeatures,
  MiniMindTokenizerFeatures,
  getSupportedFeatures,
  getPlannedFeatures,
  getFeaturesByVersion,
} from "./tokenizer/comparison";
export type { TokenizerFeature } from "./tokenizer/comparison";

// ── Embedding ──
export { MiniEmbedding } from "./embedding/Embedding";
export type { MatrixInfo } from "./embedding/Embedding";
export type { EmbeddingConfig, EmbeddingVector, EmbeddingMatrix } from "./embedding/types";

// ── RoPE (Rotary Position Embedding) ──
export { RotaryEmbedding } from "./rope/RotaryEmbedding";
export type {
  RoPEConfig,
  FrequencyCache,
  RotationTrace,
  RotationResult,
  QKRotationResult,
} from "./rope/types";
export {
  getFrequencies,
  getAngles,
  getAllAngles,
  frequencyCache,
  rotateVector,
  applyRotation,
  applyQKRotation,
  l2Norm,
} from "./rope/math";

// ── Attention (Multi-Head Self-Attention) ──
export { MiniAttention } from "./attention/Attention";
export type {
  AttentionConfig,
  AttentionInput,
  AttentionScore,
  AttentionTrace,
  AttentionOutput,
} from "./attention/types";
export {
  dotProduct,
  matrixMultiply,
  transpose,
  softmax,
  applyCausalMask,
  applyPaddingMask,
  scaledDotProductAttention,
} from "./attention/math";

// ── FFN (Feed-Forward Network / SwiGLU) ──
export { MiniFeedForward } from "./ffn/FeedForward";
export type {
  FFNConfig,
  FFNInput,
  FFNOutput,
  ActivationTrace,
} from "./ffn/types";
export {
  matrixMultiply as ffnMatrixMultiply,
  linear,
  sigmoid,
  silu,
  multiplyGate,
  applySiLU,
  swiGLU,
} from "./ffn/math";

// ── Pipeline ──
export { MiniMindPipeline } from "./pipeline/MiniMindPipeline";
export type { PipelineResult } from "./pipeline/types";
