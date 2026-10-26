// ============================================================
// ModelRegistry — Centralized model configuration registry
// ============================================================
// Phase 50: Provides canonical model configurations similar to
// GPT config families (GPT-2 Small/Medium/Large/XL).
//
// Each config fully specifies a TensorMiniMindModel architecture.
// Configs are serializable (JSON-safe) and deterministic —
// the same config always produces identical model architecture.
//
// Supported presets:
//   - MiniMindTiny  (~9.2M params,  dModel=128,  layers=4)
//   - MiniMindSmall (~22.7M params, dModel=256,  layers=6)
//   - MiniMindBase  (~66M params,   dModel=512,  layers=8)
//
// Usage:
//   import { getModelConfig, listModels, createModel } from "./ModelRegistry";
//   const config = getModelConfig("tiny");
//   const model = createModel("tiny");
// ============================================================

import { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { TensorMiniMindConfig } from "../model/TensorMiniMindModel";

// ============================================================
// Types
// ============================================================

/**
 * A named model configuration with metadata.
 *
 * Each entry fully specifies a TensorMiniMindModel architecture
 * and includes derived statistics like parameter count estimates.
 */
export interface ModelConfigEntry {
  /** Unique name for this configuration (e.g. "tiny", "small", "base") */
  name: string;
  /** Human-readable label */
  label: string;
  /** Brief description of the model size and use case */
  description: string;
  /** Vocabulary size */
  vocabSize: number;
  /** Model dimension (hidden state size) */
  dModel: number;
  /** Number of attention heads per layer */
  numHeads: number;
  /** Feed-forward hidden dimension */
  dFF: number;
  /** Number of transformer layers */
  numLayers: number;
  /** Maximum sequence length */
  maxSeqLen: number;
  /** Epsilon for RMSNorm numerical stability */
  eps: number;
  /** Estimated total parameter count (computed, not measured) */
  estimatedParams: number;
}

// ============================================================
// Production Configuration (Phase 80)
// ============================================================

/**
 * The target vocabulary size for the production tokenizer.
 *
 * This is the ONE value the production BPETokenizer trains toward.
 * It is deliberately small enough to be reachable from the real
 * foundation corpus inside the browser, and large enough to encode
 * zh / en / mixed text as subword tokens.
 *
 * The ACTUAL vocab size after training is the source of truth for
 * model construction and checkpoint metadata — see
 * `tokenizer.vocabSize`, which must equal `model.config.vocabSize`
 * and `checkpoint.vocabSize`.
 */
export const PRODUCTION_VOCAB_TARGET = 300;

/**
 * The single production model configuration.
 *
 * This is the ONLY architecture the production TrainingWorker and
 * GenerationWorker are allowed to build. It is browser-trainable
 * (Float64 autograd in a Web Worker) and produces ~1.1M parameters.
 *
 * The `tiny` / `small` / `base` entries below are REFERENCE
 * configurations for experiments and education — they are NOT the
 * production model and are not browser-trainable at their declared
 * vocabulary sizes.
 */
export const PRODUCTION_MODEL_NAME = "production";

// ============================================================
// Registry
// ============================================================

/**
 * Canonical model configurations.
 *
 * These are the reference configurations for MiniMind models.
 * They mirror GPT-2 family sizing conventions:
 *   - Tiny:  compact educational model (~9.2M params)
 *   - Small: comparable to GPT-2 Small  (~22.7M params)
 *   - Base:  comparable to GPT-2 Medium (~66M params)
 *
 * The `production` entry is the single browser-trainable
 * configuration used by the real training/generation runtime.
 */
const MODEL_REGISTRY: Record<string, ModelConfigEntry> = {
  tiny: {
    name: "tiny",
    label: "MiniMind Tiny",
    description:
      "Smallest trainable model (~9.2M params). Suitable for " +
      "overfit tests, gradient checks, and rapid prototyping. " +
      "dModel=128, layers=4, heads=4.",
    vocabSize: 32000,
    dModel: 128,
    numHeads: 4,
    dFF: 512,
    numLayers: 4,
    maxSeqLen: 256,
    eps: 1e-6,
    estimatedParams: 0, // computed below
  },

  small: {
    name: "small",
    label: "MiniMind Small",
    description:
      "Medium-sized model (~22.7M params). Suitable for " +
      "real datasets like TinyStories, ablation studies, " +
      "and curriculum learning. dModel=256, layers=6, heads=8.",
    vocabSize: 32000,
    dModel: 256,
    numHeads: 8,
    dFF: 1024,
    numLayers: 6,
    maxSeqLen: 512,
    eps: 1e-6,
    estimatedParams: 0,
  },

  base: {
    name: "base",
    label: "MiniMind Base",
    description:
      "Full-sized educational model (~66M params). Suitable " +
      "for benchmark evaluation and research experiments. " +
      "dModel=512, layers=8, heads=8.",
    vocabSize: 32000,
    dModel: 512,
    numHeads: 8,
    dFF: 2048,
    numLayers: 8,
    maxSeqLen: 512,
    eps: 1e-6,
    estimatedParams: 0,
  },

  production: {
    name: "production",
    label: "MiniMind Production (Foundation)",
    description:
      "The single browser-trainable production configuration (~1.1M params). " +
      "Used by the real TrainingWorker and GenerationWorker. " +
      "vocabSize is tokenizer-derived (target 300), dModel=128, layers=4, heads=4.",
    vocabSize: PRODUCTION_VOCAB_TARGET,
    dModel: 128,
    numHeads: 4,
    dFF: 512,
    numLayers: 4,
    maxSeqLen: 256,
    eps: 1e-6,
    estimatedParams: 0,
  },
};

// ============================================================
// Parameter Estimation
// ============================================================

/**
 * Estimate total parameters for a model configuration.
 *
 * Formula (GPT-2 Pre-Norm architecture):
 *   Embedding:      vocabSize * dModel
 *   Per layer:
 *     Attention QKV:  3 * dModel * dModel
 *     Attention Out:    dModel * dModel
 *     FFN Gate:        dFF * dModel
 *     FFN Up:          dFF * dModel
 *     FFN Down:        dModel * dFF
 *     RMSNorm × 2:     2 * dModel
 *   Final RMSNorm:   dModel
 *   LM Head:         dModel * vocabSize (tied with embedding)
 *
 * Total ≈ vocabSize * dModel * 2 + numLayers * (4 * dModel² + 2 * dFF * dModel + dModel * dFF + 2 * dModel) + dModel
 *       = 2*V*D + L * (4*D² + 3*H*D + 2*D) + D
 *
 * Note: This is an ESTIMATE. Actual count may differ slightly
 * due to bias terms and implementation details. Use ModelStats
 * for exact measurement.
 */
function estimateParams(config: Omit<ModelConfigEntry, "estimatedParams">): number {
  const { vocabSize, dModel, dFF, numLayers } = config;

  // Embedding: [V, D]
  const embedding = vocabSize * dModel;

  // Per transformer layer:
  //   Q projection: [D, D]
  //   K projection: [D, D]
  //   V projection: [D, D]
  //   O projection: [D, D]
  //   FFN gate:     [dFF, D]
  //   FFN up:       [dFF, D]
  //   FFN down:     [D, dFF]
  //   RMSNorm × 2:  2 * D
  const perLayer =
    4 * dModel * dModel + // Q, K, V, O projections
    2 * dFF * dModel + // gate + up
    dModel * dFF + // down
    2 * dModel; // two RMSNorm gamma vectors

  // Final RMSNorm: D
  const finalNorm = dModel;

  // LM Head: [D, V] (typically tied with embedding, but counted separately)
  const lmHead = dModel * vocabSize;

  return embedding + numLayers * perLayer + finalNorm + lmHead;
}

// Compute estimates for all registry entries
for (const key of Object.keys(MODEL_REGISTRY)) {
  MODEL_REGISTRY[key] = {
    ...MODEL_REGISTRY[key],
    estimatedParams: estimateParams(MODEL_REGISTRY[key]),
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Get a model configuration by name.
 *
 * @param name - Model name: "tiny", "small", or "base"
 * @returns The ModelConfigEntry for the requested model
 * @throws If the model name is not found in the registry
 *
 * Example:
 *   const config = getModelConfig("tiny");
 *   console.log(config.dModel); // 128
 */
export function getModelConfig(name: string): ModelConfigEntry {
  const config = MODEL_REGISTRY[name];
  if (!config) {
    const available = Object.keys(MODEL_REGISTRY).join(", ");
    throw new Error(
      `ModelRegistry: unknown model "${name}". ` +
        `Available models: ${available}`
    );
  }
  return { ...config }; // Return a copy for safety
}

/**
 * List all available model configurations.
 *
 * @returns Array of all registered ModelConfigEntry objects
 *
 * Example:
 *   const models = listModels();
 *   models.forEach(m => console.log(`${m.label}: ${m.estimatedParams} params`));
 */
export function listModels(): ModelConfigEntry[] {
  return Object.values(MODEL_REGISTRY).map((c) => ({ ...c }));
}

/**
 * Get the single production model configuration.
 *
 * This is the ONLY configuration the production TrainingWorker and
 * GenerationWorker build. UI surfaces (Model Overview, Experiments,
 * Chat status) must derive their displayed architecture from this.
 *
 * @returns A copy of the production ModelConfigEntry
 */
export function getProductionModelConfig(): ModelConfigEntry {
  return { ...MODEL_REGISTRY[PRODUCTION_MODEL_NAME] };
}

/**
 * Compute the exact parameter count for a model configuration.
 *
 * This is the same formula used to populate `estimatedParams` at
 * registration time. It is EXACT for `TensorMiniMindModel` (not an
 * estimate): embedding + per-layer Q/K/V/O + FFN gate/up/down +
 * two RMSNorm + final RMSNorm + LM head (untied).
 *
 * @param config - A model configuration (without estimatedParams)
 * @returns Total scalar parameter count
 */
export function parameterCountOf(
  config: Omit<ModelConfigEntry, "estimatedParams">
): number {
  return estimateParams(config);
}

/**
 * Convert a ModelConfigEntry to a TensorMiniMindConfig for model construction.
 *
 * @param entry - Model configuration entry
 * @returns TensorMiniMindConfig compatible with TensorMiniMindModel constructor
 */
export function toTensorConfig(
  entry: ModelConfigEntry
): TensorMiniMindConfig {
  return {
    vocabSize: entry.vocabSize,
    dModel: entry.dModel,
    numHeads: entry.numHeads,
    dFF: entry.dFF,
    numLayers: entry.numLayers,
    maxSeqLen: entry.maxSeqLen,
    eps: entry.eps,
  };
}

/**
 * Create a TensorMiniMindModel from a registered model name.
 *
 * This is the primary convenience API — one call to get a fully
 * initialized model from the registry.
 *
 * @param name - Model name: "tiny", "small", or "base"
 * @param vocabSize - Optional vocabulary size override
 * @returns A new TensorMiniMindModel instance
 * @throws If the model name is not found
 *
 * Example:
 *   const model = createModel("tiny");
 *   const model2 = createModel("small", 16000); // custom vocab size
 */
export function createModel(
  name: string,
  vocabSize?: number
): TensorMiniMindModel {
  const entry = getModelConfig(name);
  const config = toTensorConfig(entry);
  if (vocabSize !== undefined) {
    config.vocabSize = vocabSize;
  }
  return new TensorMiniMindModel(config);
}

/**
 * Register a custom model configuration.
 *
 * Custom configs are stored separately from built-in presets
 * and can be retrieved with getModelConfig() like built-ins.
 *
 * @param entry - Custom model configuration
 * @throws If a model with the same name already exists
 *
 * Example:
 *   registerModel({
 *     name: "huge",
 *     label: "MiniMind Huge",
 *     description: "Experimental large model",
 *     vocabSize: 32000, dModel: 768, numHeads: 12,
 *     dFF: 3072, numLayers: 12, maxSeqLen: 1024,
 *     eps: 1e-6, estimatedParams: 0,
 *   });
 */
export function registerModel(entry: ModelConfigEntry): void {
  if (MODEL_REGISTRY[entry.name]) {
    throw new Error(
      `ModelRegistry: model "${entry.name}" already exists. ` +
        `Use a different name or unregister it first.`
    );
  }
  MODEL_REGISTRY[entry.name] = {
    ...entry,
    estimatedParams: entry.estimatedParams || estimateParams(entry),
  };
}

/**
 * Check if a model name exists in the registry.
 *
 * @param name - Model name to check
 * @returns true if the model is registered
 */
export function hasModel(name: string): boolean {
  return name in MODEL_REGISTRY;
}

/**
 * Get the number of registered models (including custom registrations).
 */
export function modelCount(): number {
  return Object.keys(MODEL_REGISTRY).length;
}
