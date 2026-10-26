// ============================================================
// MiniMind — research/GenerationResult.ts
// ============================================================
// Phase 67: Structured generation result types for the
// research-layer generation pipeline.
//
// Every result preserves full provenance:
//   - experiment/run identity
//   - checkpoint identity (when available)
//   - prompt
//   - generated text
//   - generation configuration
//   - seed
//   - duration
//   - evaluation metrics
//   - timestamp
//
// Design:
//   - JSON-serializable — all fields survive stringify/parse
//   - Explicit nullability — `| undefined`, not `?`
//   - Browser-safe — no Node.js types
//   - Extends existing GenerationEvaluator types
// ============================================================

import type { GenerationEvalOptions } from "../evaluation/GenerationEvaluator";

// ============================================================
// Generation Status
// ============================================================

/**
 * Lifecycle status of a generation request.
 */
export type GenerationStatus =
  | "idle"
  | "generating"
  | "completed"
  | "stopped"
  | "error"
  | "cancelled";

// ============================================================
// Generation Configuration
// ============================================================

/**
 * Full generation configuration with identity tracking.
 */
export interface GenerationConfig {
  /** Prompt text */
  prompt: string;
  /** Generation parameters */
  params: GenerationEvalOptions;
}

// ============================================================
// Generation Request
// ============================================================

/**
 * Request to generate text from a model/checkpoint.
 */
export interface GenerationRequest {
  /** Unique request ID */
  requestId: string;
  /** Session/experiment ID */
  sessionId: string;
  /** Experiment ID — resolves provenance to the ResearchExperiment */
  experimentId?: string;
  /** Run ID (if applicable) */
  runId?: string;
  /** Checkpoint ID for trained model generation */
  checkpointId?: string;
  /** Serialized checkpoint data */
  checkpointJSON?: string;
  /** Generation configuration */
  config: GenerationConfig;
  /** Model configuration (for reconstruction) */
  modelConfig: GenerationModelConfig;
  /** Tokenizer corpus (for rebuilding tokenizer) */
  corpus: string[];
  /** Request timestamp */
  createdAt: number;
}

/**
 * Model configuration needed to reconstruct the model for generation.
 */
export interface GenerationModelConfig {
  vocabSize: number;
  dModel: number;
  numHeads: number;
  dFF: number;
  numLayers: number;
  maxSeqLen: number;
}

// ============================================================
// Generation Metrics
// ============================================================

/**
 * Metrics computed during/after generation.
 */
export interface GenerationMetrics {
  /** Number of tokens generated */
  tokenCount: number;
  /** Average log-probability */
  avgLogProb: number;
  /** Perplexity of generated sequence */
  perplexity: number;
  /** Why generation stopped */
  stopReason: "maxTokens" | "eos" | "error";
  /** Generation duration in milliseconds */
  durationMs: number;
}

// ============================================================
// Generation Result
// ============================================================

/**
 * Complete result of a generation request.
 */
export interface GenerationResult {
  /** Request ID */
  requestId: string;
  /** Session/experiment ID */
  sessionId: string;
  /** Experiment ID — traces back to the ResearchExperiment that owns this generation */
  experimentId?: string;
  /** Run ID (if applicable) */
  runId?: string;
  /** Checkpoint ID (if generation used a checkpoint) */
  checkpointId?: string;
  /** Generation status */
  status: GenerationStatus;
  /** The prompt text */
  prompt: string;
  /** Full generated text (prompt + continuation) */
  generatedText: string;
  /** Token IDs generated (excluding prompt) */
  generatedIds: number[];
  /** Generation metrics */
  metrics: GenerationMetrics;
  /** Generation configuration used */
  generationConfig: GenerationConfig;
  /** Error message if status is "error" */
  error?: string;
  /** Whether this is a baseline (untrained) generation */
  isBaseline: boolean;
  /** Timestamp when generation completed */
  timestamp: number;
}

// ============================================================
// Generation Comparison (research-layer)
// ============================================================

/**
 * Side-by-side comparison of baseline vs trained generation.
 */
export interface GenerationComparisonResult {
  /** Comparison ID */
  comparisonId: string;
  /** Session/experiment ID */
  sessionId: string;
  /** The prompt text */
  prompt: string;
  /** Baseline (untrained model) generation result */
  baseline: GenerationResult;
  /** Trained (checkpoint) generation result */
  trained: GenerationResult;
  /** Whether the generated text changed */
  changed: boolean;
  /** Difference in average log-probability (trained - baseline) */
  logProbDelta: number;
  /** Difference in perplexity (trained - baseline) */
  perplexityDelta: number;
  /** Difference in token count (trained - baseline) */
  tokenCountDelta: number;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// Generation History Entry
// ============================================================

/**
 * Lightweight entry for generation history persistence.
 */
export interface GenerationHistoryEntry {
  /** Unique entry ID */
  id: string;
  /** Request ID */
  requestId: string;
  /** Session/experiment ID */
  sessionId: string;
  /** Experiment ID — traces back to the ResearchExperiment */
  experimentId?: string;
  /** Run ID (if applicable) */
  runId?: string;
  /** Checkpoint ID (if applicable) */
  checkpointId?: string;
  /** The prompt text */
  prompt: string;
  /** Generated text (truncated for storage) */
  generatedText: string;
  /** Full generated text (complete, stored when size permits) */
  fullGeneratedText?: string;
  /** Generation metrics summary */
  metrics: {
    tokenCount: number;
    avgLogProb: number;
    perplexity: number;
    stopReason: string;
    durationMs: number;
  };
  /** Generation configuration summary */
  generationConfig: {
    maxTokens: number;
    temperature: number;
    topK: number;
    topP: number;
    seed?: number;
  };
  /** Whether this is a baseline generation */
  isBaseline: boolean;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// Generation Export
// ============================================================

/**
 * Exportable generation report in JSON format.
 */
export interface GenerationExportJSON {
  /** Export version */
  version: 1;
  /** Export timestamp */
  exportedAt: string;
  /** Session/experiment identity */
  experiment: {
    sessionId: string;
    experimentId?: string;
    runId?: string;
    checkpointId?: string;
  };
  /** Model configuration */
  modelConfig: GenerationModelConfig;
  /** Generation configuration */
  generationConfig: GenerationConfig;
  /** Generation result */
  result: {
    prompt: string;
    generatedText: string;
    tokenCount: number;
    avgLogProb: number;
    perplexity: number;
    stopReason: string;
    durationMs: number;
    isBaseline: boolean;
  };
  /** Comparison (if available) */
  comparison?: {
    baselineText: string;
    trainedText: string;
    changed: boolean;
    logProbDelta: number;
    perplexityDelta: number;
    tokenCountDelta: number;
  };
}

// ============================================================
// Factory Helpers
// ============================================================

let requestCounter = 0;

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  requestCounter++;
  return `gen-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

/**
 * Generate a unique comparison ID.
 */
export function generateComparisonId(): string {
  requestCounter++;
  return `cmp-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

/**
 * Generate a unique history entry ID.
 */
export function generateHistoryEntryId(): string {
  requestCounter++;
  return `hist-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

/**
 * Create a baseline GenerationResult for an untrained model.
 */
export function createBaselineResult(
  requestId: string,
  sessionId: string,
  prompt: string,
  generatedText: string,
  generatedIds: number[],
  metrics: GenerationMetrics,
  config: GenerationConfig,
  experimentId?: string
): GenerationResult {
  return {
    requestId,
    sessionId,
    experimentId,
    status: "completed",
    prompt,
    generatedText,
    generatedIds,
    metrics,
    generationConfig: config,
    isBaseline: true,
    timestamp: Date.now(),
  };
}

/**
 * Create a trained GenerationResult from a checkpoint.
 */
export function createTrainedResult(
  requestId: string,
  sessionId: string,
  checkpointId: string,
  prompt: string,
  generatedText: string,
  generatedIds: number[],
  metrics: GenerationMetrics,
  config: GenerationConfig,
  experimentId?: string
): GenerationResult {
  return {
    requestId,
    sessionId,
    experimentId,
    checkpointId,
    status: "completed",
    prompt,
    generatedText,
    generatedIds,
    metrics,
    generationConfig: config,
    isBaseline: false,
    timestamp: Date.now(),
  };
}

/**
 * Create a GenerationComparisonResult from baseline and trained results.
 */
export function createComparison(
  comparisonId: string,
  sessionId: string,
  baseline: GenerationResult,
  trained: GenerationResult
): GenerationComparisonResult {
  return {
    comparisonId,
    sessionId,
    prompt: baseline.prompt,
    baseline,
    trained,
    changed: baseline.generatedText !== trained.generatedText,
    logProbDelta: trained.metrics.avgLogProb - baseline.metrics.avgLogProb,
    perplexityDelta: trained.metrics.perplexity - baseline.metrics.perplexity,
    tokenCountDelta: trained.metrics.tokenCount - baseline.metrics.tokenCount,
    timestamp: Date.now(),
  };
}
