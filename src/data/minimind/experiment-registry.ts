// ============================================================
// MiniMind Experiment Registry — Single Source of Truth
// ============================================================
//
// This file is the canonical definition of every MiniMind
// interactive experiment. All consumers — module cards,
// experiment browser, playground launcher — MUST derive their
// experiment data from MINIMIND_EXPERIMENTS, never maintain
// their own copy.
//
// When an experiment's status changes, update it HERE and all
// views stay in sync automatically.
// ============================================================

// ============================================================
// Experiment Capability Layer
// ============================================================

/**
 * Runtime data dependency on a specific module's public API.
 * Declares which module methods an experiment component
 * needs to call at runtime.
 */
export interface ExperimentDataRequirement {
  /** Module id — matches MiniMindModule.id (e.g. "tokenizer", "attention") */
  module: string;
  /** Public API method names the experiment calls at runtime */
  apis: string[];
}

/**
 * Complete capability requirement for one experiment.
 *
 * visualization: rendering features the UI needs to support
 * dataRequirements: runtime module API dependencies
 *
 * The experiment registry owns this abstraction layer.
 * It does NOT directly expose raw module internals,
 * and it does NOT reuse visualization-capability IDs alone.
 */
export interface ExperimentCapabilityRequirement {
  /** Visualization feature identifiers needed for rendering */
  visualization: string[];
  /** Runtime module + API dependencies */
  dataRequirements: ExperimentDataRequirement[];
}

// ============================================================
// Experiment interface
// ============================================================

/**
 * Canonical experiment definition — the SSOT for all MiniMind
 * interactive experiments.
 *
 * When an experiment's status changes, update it HERE and all
 * views (module cards, experiment browser, playground launcher)
 * stay in sync automatically.
 */
export interface MiniMindExperiment {
  /** Unique kebab-case identifier (e.g. "tokenizer-comparison-lab") */
  id: string;
  /** Human-readable display title */
  title: string;
  /** One-line summary of what the experiment demonstrates */
  description: string;
  /** Primary module this experiment belongs to (MiniMindModule.id) */
  relatedModule: string;
  /** Lifecycle status */
  status: "active" | "planned" | "legacy";
  /** Educational concepts this experiment teaches */
  concepts: string[];
  /** Path to the experiment UI component (null when not yet built) */
  componentPath: string | null;
  /** Capability requirements — rendering features + runtime API dependencies */
  requiredCapabilities: ExperimentCapabilityRequirement;
}

// ============================================================
// Canonical experiment list — the ONLY place experiment data lives
// ============================================================

export const MINIMIND_EXPERIMENTS: MiniMindExperiment[] = [
  {
    id: "tokenizer-comparison-lab",
    title: "Tokenizer Comparison Lab",
    description:
      "Side-by-side comparison of MiniTokenizer (word-level) and CharacterTokenizer (character-level). Encode the same input text with both strategies and compare token count, vocabulary coverage, and unknown token rate.",
    relatedModule: "tokenizer",
    status: "active",
    concepts: [
      "Word Tokenization",
      "Character Tokenization",
      "Vocabulary Coverage",
      "Unknown Token Rate",
      "Sequence Length Trade-off",
    ],
    componentPath: "src/components/minimind/experiments/results/TokenizerComparisonResult",
    requiredCapabilities: {
      visualization: ["token-list", "vocab-explorer"],
      dataRequirements: [
        {
          module: "tokenizer",
          apis: ["tokenize", "encode", "decode", "getVocabulary", "explain"],
        },
      ],
    },
  },
  {
    id: "embedding-explorer",
    title: "Embedding Explorer",
    description:
      "Interactive vector lookup and comparison tool. Look up any token's embedding vector, compute cosine similarity between token pairs, and explore the semantic relationships captured by the embedding space.",
    relatedModule: "embedding",
    status: "active",
    concepts: [
      "Embedding Vector",
      "Cosine Similarity",
      "Semantic Space",
      "Vector Arithmetic",
      "Nearest Neighbor Search",
    ],
    componentPath: "src/components/minimind/experiments/results/EmbeddingExplorerResult",
    requiredCapabilities: {
      visualization: ["vector-viewer", "matrix-heatmap", "stats-panel"],
      dataRequirements: [
        {
          module: "embedding",
          apis: ["lookup", "getMatrixInfo", "getMatrix"],
        },
        {
          module: "tokenizer",
          apis: ["getVocabulary", "encode"],
        },
      ],
    },
  },
  {
    id: "attention-heatmap-explorer",
    title: "Attention Heatmap Explorer",
    description:
      "Deep-dive into attention patterns. Visualize full [numHeads × seqLen × seqLen] attention matrices, switch between heads to observe pattern diversity, and inspect raw attention scores before and after softmax.",
    relatedModule: "attention",
    status: "active",
    concepts: [
      "Attention Matrix",
      "Head Diversity",
      "Causal Masking",
      "Softmax Temperature",
      "Attention Entropy",
    ],
    componentPath: "src/components/minimind/experiments/results/AttentionHeatmapResult",
    requiredCapabilities: {
      visualization: ["attention-heatmap", "attention-head-diversity"],
      dataRequirements: [
        {
          module: "attention",
          apis: ["forward", "getAttentionTrace"],
        },
      ],
    },
  },
  {
    id: "sampling-temperature-lab",
    title: "Sampling Temperature Lab",
    description:
      "Explore how temperature affects token prediction probabilities. Adjust temperature from 0.1 to 2.0, observe the probability distribution shift, and understand the exploration-exploitation trade-off in autoregressive generation.",
    relatedModule: "inference",
    status: "planned",
    concepts: [
      "Temperature Sampling",
      "Softmax Sharpening",
      "Probability Distribution",
      "Top-K Filtering",
      "Exploration vs Exploitation",
    ],
    componentPath: null,
    requiredCapabilities: {
      visualization: ["logits-histogram", "top-k-ranking", "probability-distribution"],
      dataRequirements: [
        {
          module: "model",
          apis: ["forward", "getLMHead", "getTokenizer"],
        },
      ],
    },
  },
];

// ============================================================
// Lookup helpers — convenience, not duplication
// ============================================================

/** O(1) lookup by experiment id */
export function getExperimentById(id: string): MiniMindExperiment | undefined {
  return MINIMIND_EXPERIMENTS.find((e) => e.id === id);
}

/** All experiments belonging to a specific module */
export function getExperimentsByModule(moduleId: string): MiniMindExperiment[] {
  return MINIMIND_EXPERIMENTS.filter((e) => e.relatedModule === moduleId);
}

/** Experiments that are currently live and interactive */
export function getActiveExperiments(): MiniMindExperiment[] {
  return MINIMIND_EXPERIMENTS.filter((e) => e.status === "active");
}

/** Experiments that are designed but not yet built */
export function getPlannedExperiments(): MiniMindExperiment[] {
  return MINIMIND_EXPERIMENTS.filter((e) => e.status === "planned");
}
