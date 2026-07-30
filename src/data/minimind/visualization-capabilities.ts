// ============================================================
// MiniMind Visualization Capability Registry
// ============================================================
//
// Design-time metadata describing every visualization feature
// available in the Forward Model pipeline. This registry is the
// single source of truth for which features exist per stage,
// their descriptions, and their data dependencies.
//
// Separated from runtime VisualizationCapabilities flags:
//   - This file  → design-time "what features exist"
//   - types.ts   → runtime "which features succeeded this run"
//
// UI components read BOTH: the registry to know what to render,
// the runtime flags to know if rendering is currently possible.
// ============================================================

// ============================================================
// Feature metadata
// ============================================================

/**
 * A single visualization feature within a stage.
 *
 * Each feature maps to a boolean in VisualizationCapabilities
 * (e.g. "attention-heatmap" ↔ caps.transformer.attentionHeatmap).
 * The requiresTrace field indicates whether this feature needs
 * additional trace data beyond the basic ModelTrace.
 */
export interface VisualizationFeature {
  /** Unique feature id — kebab-case, matches capability flag naming */
  id: string;
  /** Human-readable feature name */
  label: string;
  /** What this feature shows and how to interpret it */
  description: string;
  /** Which stage this feature belongs to */
  stageId: StageId;
  /** Whether this feature requires a module trace (AttentionTrace, etc.) */
  requiresTrace: boolean;
  /** Which specific trace provides the data (null if from ModelTrace directly) */
  traceSource: string | null;
}

// ============================================================
// Stage capability metadata
// ============================================================

/** Valid stage identifiers in the forward pipeline */
export type StageId = "tokenizer" | "embedding" | "rope" | "transformer" | "lm-head";

/**
 * Design-time metadata for a single pipeline stage.
 *
 * Describes the stage's display properties and the complete set
 * of visualization features it offers. The order field determines
 * the vertical position in the PipelineTimeline.
 */
export interface StageCapability {
  /** Stage identifier — matches VisualTrace field names */
  stageId: StageId;
  /** Human-readable stage name */
  label: string;
  /** Display order in PipelineTimeline (1-based) */
  order: number;
  /** Which stat to show in the Level 1 summary (StageNode) */
  summaryStatKey: string;
  /** Icon name from lucide-react */
  icon: string;
  /** All visualization features available for this stage */
  features: VisualizationFeature[];
}

// ============================================================
// Features — Tokenizer
// ============================================================

const TOKENIZER_FEATURES: VisualizationFeature[] = [
  {
    id: "token-list",
    label: "Token List",
    description:
      "Interactive token pills showing each token, its ID, and whether it exists in the vocabulary or fell back to <unk>.",
    stageId: "tokenizer",
    requiresTrace: false,
    traceSource: null,
  },
  {
    id: "vocab-explorer",
    label: "Vocabulary Explorer",
    description:
      "Browse the full vocabulary to see which tokens are known, their IDs, and how the tokenizer maps text to vocabulary entries.",
    stageId: "tokenizer",
    requiresTrace: false,
    traceSource: "model.getTokenizer().getVocabulary()",
  },
];

// ============================================================
// Features — Embedding
// ============================================================

const EMBEDDING_FEATURES: VisualizationFeature[] = [
  {
    id: "vector-viewer",
    label: "Vector Viewer",
    description:
      "Per-position vector bar chart showing the embedding values for each token. Select a position to inspect its full d-dimensional vector.",
    stageId: "embedding",
    requiresTrace: false,
    traceSource: null,
  },
  {
    id: "matrix-heatmap",
    label: "Matrix Heatmap",
    description:
      "Full embedding matrix metadata — vocabulary size, embedding dimension, and total parameter count.",
    stageId: "embedding",
    requiresTrace: false,
    traceSource: "model.getEmbedding().getMatrixInfo()",
  },
  {
    id: "stats-panel",
    label: "Statistics Panel",
    description:
      "Per-token vector statistics: min, max, mean, and L2 norm for each embedded token.",
    stageId: "embedding",
    requiresTrace: false,
    traceSource: null,
  },
];

// ============================================================
// Features — RoPE
// ============================================================

const ROPE_FEATURES: VisualizationFeature[] = [
  {
    id: "rotation-2d-view",
    label: "2D Rotation View",
    description:
      "Visualize RoPE rotation on sampled dimension pairs as arcs on the unit circle. Select a head index to see how each position's vector rotates.",
    stageId: "rope",
    requiresTrace: true,
    traceSource: "model.getRoPE().rotate() → RotationResult.traces",
  },
  {
    id: "norm-check",
    label: "Norm Invariance Check",
    description:
      "Verify that RoPE preserves vector norm — normBefore ≈ normAfter for every position-head pair, confirming rotation is isometric.",
    stageId: "rope",
    requiresTrace: true,
    traceSource: "model.getRoPE().rotate() → RotationResult.normPreserved",
  },
  {
    id: "frequency-chart",
    label: "Frequency Chart",
    description:
      "Display the RoPE frequency spectrum across dimension pairs, showing how higher dimensions encode lower frequencies (long-range positions).",
    stageId: "rope",
    requiresTrace: false,
    traceSource: "RoPEConfig.theta + headDim → frequency formula",
  },
];

// ============================================================
// Features — Transformer
// ============================================================

const TRANSFORMER_FEATURES: VisualizationFeature[] = [
  {
    id: "attention-heatmap",
    label: "Attention Heatmap",
    description:
      "Color-intensity grid of attention weights [seqLen × seqLen] per head. Hover cells to see exact values. Darker = more attention.",
    stageId: "transformer",
    requiresTrace: true,
    traceSource: "block.getAttention().getAttentionTrace()",
  },
  {
    id: "attention-head-diversity",
    label: "Head Diversity",
    description:
      "Per-head entropy bar chart. High entropy = broad attention, low entropy = focused attention. Diverse heads capture different patterns.",
    stageId: "transformer",
    requiresTrace: true,
    traceSource: "block.getAttention().getAttentionTrace() → headEntropies",
  },
  {
    id: "ffn-gate-distribution",
    label: "FFN Gate Distribution",
    description:
      "Histogram of SwiGLU gate activation values and per-token sparsity ratio. Shows how many FFN neurons are active per token.",
    stageId: "transformer",
    requiresTrace: true,
    traceSource: "block.getFFN().getActivationTrace()",
  },
  {
    id: "residual-flow-chart",
    label: "Residual Flow Chart",
    description:
      "Horizontal bar chart of Frobenius norms at each sub-stage: pre-Attention, post-Attention, post-Attention+Residual, pre-FFN, post-FFN, post-FFN+Residual. Shows how the signal evolves through the block.",
    stageId: "transformer",
    requiresTrace: false,
    traceSource: null,
  },
];

// ============================================================
// Features — LM Head
// ============================================================

const LM_HEAD_FEATURES: VisualizationFeature[] = [
  {
    id: "logits-histogram",
    label: "Logits Histogram",
    description:
      "Distribution of raw logit values across the vocabulary. The shape reveals model confidence — wide spread = high confidence, narrow = uncertain.",
    stageId: "lm-head",
    requiresTrace: false,
    traceSource: null,
  },
  {
    id: "top-k-ranking",
    label: "Top-K Ranking",
    description:
      "Ranked table of the top 10 token predictions with logit values, softmax probabilities, and token labels. See what the model thinks comes next.",
    stageId: "lm-head",
    requiresTrace: false,
    traceSource: "model.getTokenizer().getVocabulary() → token labels",
  },
  {
    id: "probability-distribution",
    label: "Probability Distribution",
    description:
      "Softmax probability distribution statistics: min, max, mean, standard deviation, and entropy. Entropy quantifies prediction uncertainty.",
    stageId: "lm-head",
    requiresTrace: false,
    traceSource: null,
  },
];

// ============================================================
// Complete Stage Registry
// ============================================================

/**
 * Canonical ordered list of all 5 forward pipeline stages
 * with their complete visualization feature metadata.
 *
 * Order matches the pipeline flow:
 *   Tokenizer → Embedding → RoPE → Transformer → LM Head
 */
export const STAGE_CAPABILITIES: StageCapability[] = [
  {
    stageId: "tokenizer",
    label: "Tokenizer",
    order: 1,
    summaryStatKey: "N tokens",
    icon: "Split",
    features: TOKENIZER_FEATURES,
  },
  {
    stageId: "embedding",
    label: "Embedding",
    order: 2,
    summaryStatKey: "D-dim vectors",
    icon: "Layers",
    features: EMBEDDING_FEATURES,
  },
  {
    stageId: "rope",
    label: "RoPE",
    order: 3,
    summaryStatKey: "H heads, θ=10000",
    icon: "RotateCw",
    features: ROPE_FEATURES,
  },
  {
    stageId: "transformer",
    label: "Transformer",
    order: 4,
    summaryStatKey: "N layer(s)",
    icon: "Boxes",
    features: TRANSFORMER_FEATURES,
  },
  {
    stageId: "lm-head",
    label: "LM Head",
    order: 5,
    summaryStatKey: "V vocab logits",
    icon: "Target",
    features: LM_HEAD_FEATURES,
  },
];

// ============================================================
// Lookup helpers
// ============================================================

/**
 * Get a single stage's capability metadata by stage ID.
 * Returns undefined if the stage ID is not recognized.
 */
export function getStageCapability(stageId: StageId): StageCapability | undefined {
  return STAGE_CAPABILITIES.find((s) => s.stageId === stageId);
}

/**
 * Get all features belonging to a specific stage.
 * Returns an empty array for unrecognized stage IDs.
 */
export function getFeaturesByStage(stageId: StageId): VisualizationFeature[] {
  const stage = getStageCapability(stageId);
  return stage?.features ?? [];
}

/**
 * Look up a single visualization feature by its unique ID.
 * Searches across all stages. Returns undefined if not found.
 */
export function getFeatureById(featureId: string): VisualizationFeature | undefined {
  for (const stage of STAGE_CAPABILITIES) {
    const feature = stage.features.find((f) => f.id === featureId);
    if (feature) return feature;
  }
  return undefined;
}

/**
 * Get all features across all stages that require an external trace
 * (i.e. data beyond the basic ModelTrace fields).
 */
export function getTraceRequiredFeatures(): VisualizationFeature[] {
  const result: VisualizationFeature[] = [];
  for (const stage of STAGE_CAPABILITIES) {
    for (const feature of stage.features) {
      if (feature.requiresTrace) {
        result.push(feature);
      }
    }
  }
  return result;
}
