// ============================================================
// MiniMind — index.ts
// ============================================================
// MiniMind 统一导出入口
//
// 整合所有 MiniMind 子模块的公开 API，
// 供 Playground、AI Lab 和外部消费者使用。
// ============================================================

// ── Core (Phase 30: Tensor + Autograd Engine) ──
// Note: transpose & softmax are NOT re-exported here to avoid
// conflict with existing attention/math exports of the same name.
// Import them directly from "@/lib/minimind/core" if needed.
export {
  Tensor,
  add,
  multiply,
  matmul,
  sum,
  reshape,
  relu,
  executeBackward,
  buildTopologicalOrder,
  indexFor,
  shapeSize,
  Random,
  SeededRandom,
} from "./core";
export type { BackwardContext } from "./core";

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
export { TensorEmbedding } from "./embedding/TensorEmbedding";
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
export { MiniAttention, TensorAttention } from "./attention";
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
export { TensorFeedForward } from "./ffn/TensorFeedForward";
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

// ── Transformer Block ──
export { MiniRMSNorm } from "./transformer/RMSNorm";
export { TensorRMSNorm } from "./transformer/TensorRMSNorm";
export { MiniTransformerBlock } from "./transformer/TransformerBlock";
export { TensorTransformerBlock } from "./transformer/TensorTransformerBlock";
export type {
  TransformerConfig,
  TransformerInput,
  TransformerOutput,
  TransformerTrace,
} from "./transformer/types";

// ── Model (Full Forward) ──
export { MiniLMHead } from "./model/LMHead";
export { TensorLMHead } from "./model/TensorLMHead";
export { MiniMindModel } from "./model/MiniMindModel";
export { TensorMiniMindModel } from "./model/TensorMiniMindModel";
export type { TensorMiniMindConfig } from "./model/TensorMiniMindModel";
export { runForwardExample } from "./model/examples";
export type {
  ModelConfig,
  ModelInput,
  ModelOutput,
  ModelTrace,
} from "./model/types";

// ── Pipeline ──
export { MiniMindPipeline } from "./pipeline/MiniMindPipeline";
export type { PipelineResult } from "./pipeline/types";

// ── Experiments (Phase 19) ──
export {
  // Context + Tokenizer
  createExperimentContext,
  CharacterTokenizer,
  getRequiredModuleNames,
  // Runner registry + dispatch
  registerRunner,
  getRunner,
  getRegisteredExperimentIds,
  runExperiment,
  // Runner classes
  TokenizerComparisonRunner,
  EmbeddingExplorerRunner,
  AttentionHeatmapRunner,
} from "./experiments";
export type {
  ExperimentContext,
  ExperimentModuleConfig,
  ExperimentResult,
  ExperimentError,
  ExperimentTiming,
  ExperimentRunner,
  ICharacterTokenizer,
  TokenizerComparisonInput,
  TokenizerComparisonData,
  TokenizerRunSummary,
  TokenizerComparisonMetrics,
  EmbeddingExplorerInput,
  EmbeddingExplorerData,
  EmbeddingVectorInfo,
  TokenSimilarity,
  AttentionHeatmapInput,
  AttentionHeatmapData,
  HeadHeatmapData,
} from "./experiments";

// ── Inference (Phase 21) ──
export { InferenceEngine } from "./inference/InferenceEngine";
export { KVCache } from "./inference/KVCache";
export { Sampler } from "./inference/Sampler";
export { GenerationLoop } from "./inference/GenerationLoop";
export {
  GreedySampler,
  TemperatureSampler,
  TopKSampler,
  TopPSampler,
} from "./inference";
export type {
  InferenceConfig,
  SamplingConfig,
  StopCondition,
  GenerationStep,
  TokenAlternative,
  CacheSnapshot,
  GenerationTrace,
  GenerationResult,
  KVCacheEntry,
  PositionMetadata,
  SamplingStrategy,
  LogitsTransformResult,
} from "./inference/types";

// ── Phase 43: Real GPT Training Validation Layer ──

// Tokenizer
export { BPETokenizer } from "./tokenizer/BPETokenizer";
export type { BPETokenizerState } from "./tokenizer/BPETokenizer";

// Data
export type { ITokenizer } from "./data/ITokenizer";

// ── Node-only data exports ──
// TextCorpus, TinyStoriesDataset, and the streaming engine use
// Node.js fs/path — import from "@/lib/minimind/node" instead:
//   import { TextCorpus, TinyStoriesDataset } from "@/lib/minimind/node";
//   import { TextShardReader, StreamingDataset } from "@/lib/minimind/node";

// Tensor-based generation
export { TensorGenerator } from "./inference/TensorGenerator";
export type { GenerationOptions, GenerationResult as TensorGenerationResult } from "./inference/TensorGenerator";

// Training stability
export { clipGradients, computeGlobalNorm, clipGradientsByValue } from "./core/GradientClipper";
export { Initialization } from "./core/Initialization";
export type { Initializer } from "./core/Initialization";

// ── Node-only: BenchmarkReport, TrainingConfig ──
// These use Node.js fs — import from "@/lib/minimind/node" instead:
//   import { BenchmarkReport } from "@/lib/minimind/node";
//   import { TrainingConfig, TINY_TRAINING_CONFIG } from "@/lib/minimind/node";

// ── Phase 44: Real Training Validation ──

// ── Node-only: TrainingLogger ──
// Uses Node.js fs — import from "@/lib/minimind/node" instead:
//   import { TrainingLogger } from "@/lib/minimind/node";

// Throughput meter
export { ThroughputMeter } from "./training/ThroughputMeter";

// Training monitor
export { TrainingMonitor } from "./training/TrainingMonitor";
export type {
  AlertLevel,
  MonitorAlert,
  MonitorOptions,
  MonitorSummary,
} from "./training/TrainingMonitor";

// Generation evaluation
export { GenerationEvaluator } from "./evaluation/GenerationEvaluator";
export type {
  GenerationEvalResult,
  GenerationComparison,
  GenerationEvalOptions,
} from "./evaluation/GenerationEvaluator";

// ── Phase 46: Real GPT Training Validation & Benchmark ──

// ── Node-only: ExperimentConfig, TrainingExperimentRunner, TrainingReport ──
// These use Node.js fs — import from "@/lib/minimind/node" instead:
//   import { ExperimentConfig, DEFAULT_EXPERIMENT_CONFIG } from "@/lib/minimind/node";
//   import { runTrainingExperiment, runExperimentFromConfigFile } from "@/lib/minimind/node";
//   import { TrainingReport } from "@/lib/minimind/node";

// Generation benchmark
export { GenerationBenchmark } from "./evaluation/GenerationBenchmark";
export type {
  GenerationBenchmarkResult,
  GenerationBenchmarkAggregate,
  GenerationBenchmarkComparison,
  GenerationBenchmarkOptions,
} from "./evaluation/GenerationBenchmark";

// Prompt suites
export {
  DEFAULT_PROMPTS,
  STORY_PROMPTS,
  SIMPLE_PROMPTS,
  GPT2_PROMPTS,
  PROMPT_SUITES,
  getPromptSuite,
  getAvailablePromptSuites,
} from "./evaluation/PromptSuite";
export type { PromptSuiteName } from "./evaluation/PromptSuite";

// ── Phase 50: Research Validation & Benchmark Layer ──

// Model Registry
export {
  getModelConfig,
  listModels,
  createModel,
  registerModel,
  hasModel,
  modelCount,
  toTensorConfig,
} from "./experiments/ModelRegistry";
export type { ModelConfigEntry } from "./experiments/ModelRegistry";

// Training Recipe
export {
  loadRecipe,
  saveRecipe,
  listRecipes,
  listRecipeNames,
  hasRecipe,
  summarizeRecipe,
  diffRecipes,
  validateRecipe,
  recipeToJSON,
  recipeFromJSON,
} from "./experiments/TrainingRecipe";
export type {
  TrainingRecipe,
  RecipeOptimizerConfig,
  RecipeSchedulerConfig,
  RecipeDatasetConfig,
} from "./experiments/TrainingRecipe";

// Ablation
export { Ablation } from "./experiments/Ablation";
export type {
  AblationVariant,
  AblationConfig,
  AblationTrainingConfig,
  AblationVariantResult,
  AblationReport,
  AblationComparisonRow,
} from "./experiments/Ablation";

// Benchmark Runner
export { BenchmarkRunner } from "./evaluation/BenchmarkRunner";
export type {
  TrainingBenchmarkConfig,
  TrainingBenchmarkResult,
  GenerationBenchmarkConfig,
  GenerationMetrics,
  BenchmarkResult,
} from "./evaluation/BenchmarkRunner";

// Model Statistics
export { ModelStats } from "./evaluation/ModelStats";
export type {
  LayerStats,
  ParameterDetail,
  MemoryEstimate,
  ModelStatsReport,
  ArchitectureSummary,
} from "./evaluation/ModelStats";
