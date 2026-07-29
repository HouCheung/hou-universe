// ============================================================
// MiniMind Module Registry — Single Source of Truth
// ============================================================
//
// This file is the canonical definition of every MiniMind module.
// All consumers — Roadmap, Playground, AI Lab, Knowledge Map —
// MUST derive their module data from MINIMIND_MODULES, never
// maintain their own copy.
//
// When a module's status changes, update it HERE and all views
// stay in sync automatically.
// ============================================================

// ============================================================
// Module metadata — enriched knowledge-layer fields
// ============================================================

export interface MiniMindModuleMetadata {
  /** Path to the theory / learning doc under docs/minimind/ */
  theoryDocPath?: string;
  /** Path to the source implementation under src/lib/minimind/ */
  sourcePath?: string;
  /** Path to the data registry under src/data/minimind/ */
  registryPath?: string;
  /** Route path to the interactive playground (e.g. /ai-lab/playground) */
  playgroundPath?: string;
  /** Core concepts this module teaches */
  concepts?: string[];
  /** Named experiments available for this module */
  experiments?: string[];
  /** Module ids this module depends on (learning pre-requisites) */
  dependencies?: string[];
}

// ============================================================
// Module interface
// ============================================================

export interface MiniMindModule {
  /** Unique slug — matches roadmap node id for cross-referencing */
  id: string;
  /** Human-readable display name */
  title: string;
  /** One-line summary of what the module teaches / implements */
  description: string;
  /** Lifecycle status — kept in sync with roadmap node status */
  status: "completed" | "in-progress" | "upcoming";
  /** Sort order across all phases (lowest first) */
  order: number;
  /** Roadmap phase this module belongs to */
  phase: "foundation" | "training" | "advanced";
  /** Path to the theory / learning doc under docs/minimind/ */
  theoryDocPath: string;
  /** Path to the source implementation under src/lib/minimind/ */
  sourcePath: string;
  /** Path to the interactive playground under src/components/minimind/playground/ */
  playgroundPath: string;
  /** Whether the playground for this module is live */
  implemented: boolean;
  /** Planned version label when implemented === false, null when live */
  futureVersion: string | null;
  /** Enriched metadata — concepts, experiments, dependencies, and path cross-references */
  metadata: MiniMindModuleMetadata;
}

// ============================================================
// Canonical module list — the ONLY place module metadata lives
// ============================================================

export const MINIMIND_MODULES: MiniMindModule[] = [
  {
    id: "tokenizer",
    title: "Tokenizer",
    description:
      "V1 Word Tokenizer — whitespace split, vocabulary lookup, encode/decode round-trip.",
    status: "in-progress",
    order: 2,
    phase: "foundation",
    theoryDocPath: "docs/minimind/01-tokenizer.md",
    sourcePath: "src/lib/minimind/tokenizer/",
    playgroundPath: "src/components/minimind/playground/tokenizer/",
    implemented: true,
    futureVersion: null,
    metadata: {
      theoryDocPath: "docs/minimind/01-tokenizer.md",
      sourcePath: "src/lib/minimind/tokenizer",
      playgroundPath: "/ai-lab/playground",
      concepts: ["Token", "Vocabulary", "Encoding", "Decoding", "BPE"],
      experiments: ["word-vs-character"],
      dependencies: [],
    },
  },
  {
    id: "embedding",
    title: "Embedding",
    description:
      "Token embedding + positional encoding. Trainable lookup table mapping token ids to dense vectors.",
    status: "in-progress",
    order: 3,
    phase: "foundation",
    theoryDocPath: "docs/minimind/02-embedding.md",
    sourcePath: "src/lib/minimind/embedding/",
    playgroundPath: "src/components/minimind/playground/embedding/",
    implemented: true,
    futureVersion: null,
    metadata: {
      theoryDocPath: "docs/minimind/02-embedding.md",
      sourcePath: "src/lib/minimind/embedding/",
      registryPath: "src/data/minimind/embedding-registry.ts",
      playgroundPath: "/ai-lab/playground",
      concepts: [
        "Embedding Matrix",
        "Lookup Table",
        "Dense Vector",
        "One-Hot Encoding",
        "Trainable Parameters",
      ],
      experiments: ["embedding-visualization", "semantic-similarity"],
      dependencies: ["tokenizer"],
    },
  },
  {
    id: "rope",
    title: "RoPE",
    description:
      "Rotary Position Embedding. Frequency-based positional encoding with relative position awareness.",
    status: "in-progress",
    order: 4,
    phase: "foundation",
    theoryDocPath: "docs/minimind/03-rope.md",
    sourcePath: "src/lib/minimind/rope/",
    playgroundPath: "src/components/minimind/playground/rope/",
    implemented: true,
    futureVersion: null,
    metadata: {
      theoryDocPath: "docs/minimind/03-rope.md",
      sourcePath: "src/lib/minimind/rope/",
      registryPath: "src/data/minimind/rope-registry.ts",
      playgroundPath: "/ai-lab/playground",
      concepts: [
        "Rotary Embedding",
        "Positional Encoding",
        "Frequency Bands",
        "Relative Position",
        "Complex Numbers",
        "2D Rotation Matrix",
        "Vector Norm Invariance",
        "Orthogonal Transformation",
        "Precomputed Cache",
      ],
      experiments: [
        "frequency-analysis",
        "position-sensitivity",
        "rotation-visualization",
        "norm-invariance-verification",
        "relative-position-decay",
      ],
      dependencies: ["embedding"],
    },
  },
  {
    id: "attention",
    title: "Attention",
    description:
      "Multi-head self-attention mechanism. Scaled dot-product attention with causal masking, QKV projection, and multi-head split/merge.",
    status: "in-progress",
    order: 5,
    phase: "foundation",
    theoryDocPath: "docs/minimind/04-attention.md",
    sourcePath: "src/lib/minimind/attention/",
    playgroundPath: "src/components/minimind/playground/attention/",
    implemented: true,
    futureVersion: null,
    metadata: {
      theoryDocPath: "docs/minimind/04-attention.md",
      sourcePath: "src/lib/minimind/attention/",
      registryPath: "src/data/minimind/attention-registry.ts",
      playgroundPath: "/ai-lab/playground",
      concepts: [
        "Self-Attention",
        "Multi-Head",
        "Scaled Dot-Product",
        "QKV Projection",
        "Causal Masking",
        "Attention Weights",
        "Attention Matrix",
        "Numerical Stability (Softmax)",
        "Head Split / Merge",
        "Output Projection (W_O)",
      ],
      experiments: [
        "attention-heatmap",
        "head-diversity",
        "score-distribution",
        "weight-concentration",
        "causal-mask-verification",
        "qkv-similarity",
      ],
      dependencies: ["rope", "embedding"],
    },
  },
  {
    id: "ffn",
    title: "FFN",
    description:
      "SwiGLU Feed-Forward Network. Gate/Up parallel projection, SiLU activation, element-wise gating, and Down projection.",
    status: "in-progress",
    order: 6,
    phase: "foundation",
    theoryDocPath: "docs/minimind/05-ffn.md",
    sourcePath: "src/lib/minimind/ffn/",
    playgroundPath: "src/components/minimind/playground/ffn/",
    implemented: true,
    futureVersion: null,
    metadata: {
      theoryDocPath: "docs/minimind/05-ffn.md",
      sourcePath: "src/lib/minimind/ffn/",
      registryPath: "src/data/minimind/ffn-registry.ts",
      playgroundPath: "/ai-lab/playground",
      concepts: [
        "Feed-Forward Network",
        "Position-wise Transformation",
        "SwiGLU",
        "SiLU Activation (Swish)",
        "Gated Linear Unit",
        "Gate / Up / Down Projection",
        "Element-wise Multiply",
        "Expansion-Compression (Bottleneck)",
        "Non-linearity in Transformers",
      ],
      experiments: [
        "activation-distribution",
        "gate-value-analysis",
        "dimension-importance",
        "token-wise-comparison",
        "swiglu-vs-relu-contrast",
      ],
      dependencies: ["attention"],
    },
  },
  {
    id: "transformer",
    title: "Transformer",
    description:
      "Pre-Norm Decoder Block combining RMSNorm, Multi-Head Self-Attention, SwiGLU FFN, and dual residual connections. Dependency injection of existing Attention and FFN modules.",
    status: "in-progress",
    order: 7,
    phase: "foundation",
    theoryDocPath: "docs/minimind/06-transformer.md",
    sourcePath: "src/lib/minimind/transformer/",
    playgroundPath: "src/components/minimind/playground/transformer/",
    implemented: true,
    futureVersion: null,
    metadata: {
      theoryDocPath: "docs/minimind/06-transformer.md",
      sourcePath: "src/lib/minimind/transformer/",
      registryPath: "src/data/minimind/transformer-registry.ts",
      playgroundPath: "/ai-lab/playground",
      concepts: [
        "Transformer Block",
        "Decoder-only Architecture",
        "RMSNorm (Root Mean Square Normalization)",
        "Pre-Norm Architecture",
        "Residual Connection",
        "Attention + FFN Composition",
        "Gradient Highway",
        "Block Stacking",
        "LLaMA Architecture",
      ],
      experiments: [
        "block-output-trace",
        "residual-flow-analysis",
        "norm-output-distribution",
        "attention-vs-ffn-output-comparison",
        "pre-norm-gradient-analysis",
      ],
      dependencies: ["ffn", "attention", "rope", "embedding"],
    },
  },
  {
    id: "model",
    title: "Forward Model",
    description:
      "Complete Text → Logits pipeline. Composes Tokenizer, Embedding, RoPE, Transformer Blocks, and LM Head into a full MiniMind forward architecture via dependency injection.",
    status: "in-progress",
    order: 8,
    phase: "foundation",
    theoryDocPath: "docs/minimind/09-forward.md",
    sourcePath: "src/lib/minimind/model/",
    playgroundPath: "src/components/minimind/playground/model/",
    implemented: true,
    futureVersion: null,
    metadata: {
      theoryDocPath: "docs/minimind/09-forward.md",
      sourcePath: "src/lib/minimind/model/",
      registryPath: "src/data/minimind/model-registry.ts",
      playgroundPath: "/ai-lab/playground",
      concepts: [
        "LLM Forward Pass",
        "Hidden State Flow",
        "Decoder-only Architecture",
        "LM Head",
        "Logits",
        "Softmax Probability",
        "Composition Root",
        "Dependency Injection",
        "Model Orchestration",
        "Pipeline Trace",
      ],
      experiments: [
        "full-pipeline-trace",
        "hidden-state-evolution",
        "logit-distribution-analysis",
        "token-prediction-ranking",
        "embedding-vs-final-hidden-comparison",
      ],
      dependencies: ["transformer", "tokenizer"],
    },
  },
  {
    id: "inference",
    title: "Inference",
    description:
      "Autoregressive generation loop. Temperature sampling, top-k / top-p filtering, KV-cache management.",
    status: "upcoming",
    order: 9,
    phase: "advanced",
    theoryDocPath: "docs/minimind/08-inference.md",
    sourcePath: "src/lib/minimind/inference/",
    playgroundPath: "src/components/minimind/playground/inference/",
    implemented: false,
    futureVersion: "V6",
    metadata: {
      theoryDocPath: "docs/minimind/08-inference.md",
      sourcePath: "src/lib/minimind/inference/",
      playgroundPath: "/ai-lab/playground",
      concepts: [
        "Autoregressive Generation",
        "Temperature Sampling",
        "Top-K Filtering",
        "Top-P Filtering",
        "KV Cache",
        "Beam Search",
      ],
      experiments: [
        "sampling-comparison",
        "temperature-sweep",
        "repetition-penalty",
      ],
      dependencies: ["model", "transformer", "tokenizer"],
    },
  },
];

// ============================================================
// Derived lookup helpers — convenience, not duplication
// ============================================================

/** O(1) lookup by module id */
export function getModuleById(id: string): MiniMindModule | undefined {
  return MINIMIND_MODULES.find((m) => m.id === id);
}

/** Modules that have a live playground */
export function getImplementedModules(): MiniMindModule[] {
  return MINIMIND_MODULES.filter((m) => m.implemented);
}

/** Modules belonging to a specific phase */
export function getModulesByPhase(
  phase: MiniMindModule["phase"]
): MiniMindModule[] {
  return MINIMIND_MODULES.filter((m) => m.phase === phase);
}

// ============================================================
// FlowNode — for the experience layer pipeline visualization
// ============================================================

export type FlowNodeType = "input" | "module" | "intermediate" | "output";

export interface FlowNode {
  id: string;
  label: string;
  type: FlowNodeType;
  /** For "module" nodes, references the MINIMIND_MODULES entry */
  moduleId?: string;
}

/** Pre-configured flow pipeline: input → module nodes → intermediate → output */
export function getFlowPipeline(): FlowNode[] {
  const modules = MINIMIND_MODULES.filter((m) => m.phase === "foundation").sort(
    (a, b) => a.order - b.order
  );

  const nodes: FlowNode[] = [
    { id: "text-input", label: "Text Input", type: "input" },
  ];

  for (const mod of modules) {
    nodes.push({
      id: mod.id,
      label: mod.title,
      type: "module",
      moduleId: mod.id,
    });
    // Insert Token IDs intermediate node after Tokenizer
    if (mod.id === "tokenizer") {
      nodes.push({
        id: "token-ids",
        label: "Token IDs",
        type: "intermediate",
      });
    }
  }

  nodes.push({ id: "output", label: "Output", type: "output" });

  return nodes;
}

// ============================================================
// Dependency level calculation — for ModuleDependencyGraph
// ============================================================

export interface DependencyLevel {
  moduleId: string;
  level: number;
}

/** Compute topological dependency levels for all modules.
 *  Root modules (no deps) = level 0.
 *  Each module's level = max(dep.level) + 1. */
export function computeDependencyLevels(): DependencyLevel[] {
  const moduleMap = new Map(MINIMIND_MODULES.map((m) => [m.id, m]));
  const levels = new Map<string, number>();

  function getLevel(id: string, visited: Set<string>): number {
    if (levels.has(id)) return levels.get(id)!;
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);

    const mod = moduleMap.get(id);
    if (!mod) return 0;

    const deps = mod.metadata.dependencies ?? [];
    if (deps.length === 0) {
      levels.set(id, 0);
      return 0;
    }

    const maxDepLevel = Math.max(
      ...deps.map((depId) => getLevel(depId, new Set(visited)))
    );
    const level = maxDepLevel + 1;
    levels.set(id, level);
    return level;
  }

  for (const mod of MINIMIND_MODULES) {
    getLevel(mod.id, new Set());
  }

  return MINIMIND_MODULES.map((m) => ({
    moduleId: m.id,
    level: levels.get(m.id) ?? 0,
  }));
}

// ============================================================
// Progress calculation — for LearningProgress
// ============================================================

/**
 * Convert a module status to a progress percentage.
 * - "completed" → 100
 * - "in-progress" → 50 (default)
 * - "upcoming" → 0
 *
 * Pass `customPercent` to override the default mapping (future-proof).
 */
export function getModuleProgress(
  status: MiniMindModule["status"],
  customPercent?: number
): number {
  if (customPercent !== undefined) return customPercent;
  switch (status) {
    case "completed":
      return 100;
    case "in-progress":
      return 50;
    case "upcoming":
      return 0;
  }
}
