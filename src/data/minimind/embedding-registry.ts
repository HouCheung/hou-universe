// ============================================================
// Embedding Registry — Canonical embedding knowledge source
// ============================================================
//
// This file is the SINGLE SOURCE OF TRUTH for all embedding
// metadata: version definitions, dimension configurations,
// concept catalogs, and experiment lists.
//
// Consumers that MUST derive their data from this registry:
//   - src/lib/minimind/embedding/              → (future) implementation
//   - src/components/minimind/playground/embedding/ → (future) UI
//   - docs/minimind/02-embedding.md            → source reference
//   - AI Lab / Playground UI components        → (future) via module-registry
//
// When an embedding version, dimension, concept, or experiment
// changes, update it HERE and all views stay in sync automatically.
// ============================================================

// ============================================================
// Core data types
// ============================================================

/**
 * EmbeddingDimensionConfig — the dimensional parameters that
 * define an embedding layer's shape and capacity.
 */
export interface EmbeddingDimensionConfig {
  /** Vocabulary size — number of rows in the embedding matrix */
  vocabSize: number;
  /** Model dimension — width of each token vector */
  dModel: number;
  /** Total parameters: vocabSize × dModel */
  totalParameters: number;
}

/**
 * EmbeddingFeature — a single capability entry for comparison tables.
 *
 * Each feature describes one embedding capability, its current
 * support status, and when it is planned for implementation.
 */
export interface EmbeddingFeature {
  /** Human-readable feature name */
  feature: string;
  /** Whether this feature is implemented in the current version */
  supported: boolean;
  /** Target version for implementation (null = no plan / already done) */
  plannedVersion: string | null;
  /** Implementation notes and context */
  notes: string;
}

/**
 * EmbeddingModule — a complete embedding strategy definition.
 *
 * Each entry describes one embedding approach along the evolution
 * path: One-Hot → Learned Embedding → Weight-Tied Embedding → MiniMind Compatible.
 */
export interface EmbeddingModule {
  /** Unique identifier (slug) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Semantic version label (e.g. "V1", "V2") */
  version: string;
  /** Lifecycle status */
  status: "active" | "planned" | "legacy";
  /** One-line summary of the approach */
  description: string;
  /** Dimensional configuration for this embedding variant */
  dimensions: EmbeddingDimensionConfig;
  /** Core concepts this module teaches */
  concepts: string[];
  /** Named experiments available for this module */
  experiments: string[];
  /** Features introduced or relevant to this version */
  features: EmbeddingFeature[];
  /** Versions this embedding is compatible with */
  compatibleWith: string[];
  /** Next version in the evolution path (null = terminal) */
  futureVersion: string | null;
}

// ============================================================
// Canonical feature definitions
// ============================================================

const V1_FEATURES: EmbeddingFeature[] = [
  {
    feature: "Token ID Lookup",
    supported: true,
    plannedVersion: null,
    notes:
      "O(1) 整数索引查表，将离散 token ID 映射为 d_model 维稠密向量。等价于 one-hot @ W_embed 但无稀疏矩阵开销。",
  },
  {
    feature: "Learnable Embedding Matrix",
    supported: true,
    plannedVersion: null,
    notes:
      "[vocab_size × d_model] 可训练权重矩阵。通过梯度反向传播学习语义表示。默认使用 N(0, 0.02) 初始化。",
  },
  {
    feature: "Dense Vector Representation",
    supported: true,
    plannedVersion: null,
    notes:
      "每个 token 被表示为 d_model 维稠密向量。所有维度参与语义编码，支持余弦相似度和向量运算。",
  },
  {
    feature: "Semantic Space Visualization",
    supported: true,
    plannedVersion: null,
    notes:
      "通过 PCA / t-SNE 将高维 embedding 向量降维到 2D/3D 进行可视化。展示语义聚类和空间结构。",
  },
  {
    feature: "Weight Tying",
    supported: false,
    plannedVersion: "V2",
    notes:
      "输入 Embedding 矩阵与输出 LM Head 共享权重（转置关系）。节省 vocab_size × d_model 参数。",
  },
  {
    feature: "Positional Encoding Integration",
    supported: false,
    plannedVersion: "V3",
    notes:
      "Embedding 输出与 Positional Encoding（Sinusoidal / RoPE）相加后送入 Transformer Block。",
  },
  {
    feature: "Subword Embedding",
    supported: false,
    plannedVersion: "V4",
    notes:
      "配合 BPE Tokenizer，子词级别的 embedding 表示。同一词的不同形态共享子词 embedding。",
  },
  {
    feature: "Embedding Freeze / Unfreeze",
    supported: false,
    plannedVersion: "V5",
    notes:
      "支持冻结 embedding 层（如微调时固定预训练 embedding），或分层解冻策略。",
  },
  {
    feature: "Multi-Lingual Embedding Alignment",
    supported: false,
    plannedVersion: "V5",
    notes:
      "中英文 token embedding 的空间对齐分析。检测语言分离现象并评估跨语言语义一致性。",
  },
  {
    feature: "MiniMind Compatible",
    supported: false,
    plannedVersion: "V5",
    notes:
      "完整对接 MiniMind 26M Transformer。vocab_size=6400, d_model=512, Weight Tying 已启用。",
  },
];

// ============================================================
// EmbeddingModule registry — evolution path
// ============================================================

export const EMBEDDING_MODULES: EmbeddingModule[] = [
  {
    id: "embedding-learning-edition",
    name: "Embedding Learning Edition",
    version: "V1",
    status: "active",
    description:
      "Learnable lookup table mapping token IDs to dense vectors. Transparent, inspectable, and interactive — the foundation for understanding semantic representation.",
    dimensions: {
      vocabSize: 6400,
      dModel: 512,
      totalParameters: 6400 * 512, // 3,276,800
    },
    concepts: [
      "One-Hot Encoding",
      "Embedding Matrix",
      "Token ID Lookup",
      "Dense Vector",
      "Semantic Space",
      "Weight Tying",
      "Distributed Representation",
      "Cosine Similarity",
    ],
    experiments: [
      "embedding-visualization",
      "semantic-similarity",
      "vector-arithmetic",
      "pca-projection",
    ],
    features: V1_FEATURES.filter((f) =>
      [
        "Token ID Lookup",
        "Learnable Embedding Matrix",
        "Dense Vector Representation",
        "Semantic Space Visualization",
      ].includes(f.feature)
    ),
    compatibleWith: [],
    futureVersion: "V2",
  },
  {
    id: "weight-tied-embedding",
    name: "Weight-Tied Embedding",
    version: "V2",
    status: "planned",
    description:
      "Shares weights between input Embedding and output LM Head. Cuts embedding-related parameters nearly in half with minimal performance loss.",
    dimensions: {
      vocabSize: 6400,
      dModel: 512,
      totalParameters: 6400 * 512, // 3,276,800 (shared, not doubled)
    },
    concepts: [
      "Weight Tying",
      "LM Head",
      "Parameter Sharing",
      "Transpose Relation",
      "Gradient Accumulation",
    ],
    experiments: [
      "weight-tying-comparison",
      "gradient-flow-analysis",
      "parameter-count-audit",
    ],
    features: [
      {
        feature: "Weight Tying",
        supported: false,
        plannedVersion: "V2",
        notes:
          "LM Head weight = Embedding^T。输入和输出共享同一语义空间，节省约 3.3M 参数。",
      },
      {
        feature: "Dual Gradient Handling",
        supported: false,
        plannedVersion: "V2",
        notes:
          "Embedding 矩阵同时接收来自输入 lookup 和输出 LM Head 的梯度，正确处理梯度叠加。",
      },
    ],
    compatibleWith: ["embedding-learning-edition"],
    futureVersion: "V3",
  },
  {
    id: "position-aware-embedding",
    name: "Position-Aware Embedding",
    version: "V3",
    status: "planned",
    description:
      "Combines token embedding with sinusoidal positional encoding. Introduces sequence order into the otherwise position-agnostic embedding space.",
    dimensions: {
      vocabSize: 6400,
      dModel: 512,
      totalParameters: 6400 * 512 + 512, // +512 for positional encoding params (sinusoidal: 0 trainable)
    },
    concepts: [
      "Positional Encoding",
      "Sinusoidal Functions",
      "Position-Agnostic",
      "Sequence Order",
      "Embedding + PE Addition",
    ],
    experiments: [
      "position-heatmap",
      "sinusoidal-frequency-analysis",
      "position-aware-similarity",
    ],
    features: [
      {
        feature: "Sinusoidal Positional Encoding",
        supported: false,
        plannedVersion: "V3",
        notes:
          "使用正弦/余弦函数为每个位置生成唯一的 d_model 维向量。无需训练，可外推到训练时未见过的序列长度。",
      },
      {
        feature: "Embedding + PE Fusion",
        supported: false,
        plannedVersion: "V3",
        notes:
          "Token embedding 与 positional encoding 逐元素相加，组合语义信息和位置信息。",
      },
    ],
    compatibleWith: ["weight-tied-embedding"],
    futureVersion: "V4",
  },
  {
    id: "subword-embedding",
    name: "Subword Embedding",
    version: "V4",
    status: "planned",
    description:
      "Operates on subword tokens from BPE Tokenizer. Same embedding matrix, but now tokens represent subword fragments rather than full words — richer morphological representation.",
    dimensions: {
      vocabSize: 6400,
      dModel: 512,
      totalParameters: 6400 * 512, // 3,276,800
    },
    concepts: [
      "Subword Token",
      "Morphological Representation",
      "BPE Embedding",
      "Shared Subword Basis",
      "Cross-Word Generalization",
    ],
    experiments: [
      "subword-clustering",
      "morphology-analysis",
      "cross-word-similarity",
    ],
    features: [
      {
        feature: "BPE Tokenizer Integration",
        supported: false,
        plannedVersion: "V4",
        notes:
          "Embedding 词汇表与 BPE Tokenizer 词汇表完全对齐，支持子词级 token 的语义表示。",
      },
      {
        feature: "Morphological Awareness",
        supported: false,
        plannedVersion: "V4",
        notes:
          "同一词根的不同形态（如 'run', 'running', 'runner'）通过共享子词 embedding 建立语义联系。",
      },
    ],
    compatibleWith: ["position-aware-embedding"],
    futureVersion: "V5",
  },
  {
    id: "minimind-embedding",
    name: "MiniMind Compatible Embedding",
    version: "V5",
    status: "planned",
    description:
      "Production-ready embedding layer for the MiniMind 26M Transformer. vocab_size=6400, d_model=512, Weight Tying enabled, RoPE-compatible output.",
    dimensions: {
      vocabSize: 6400,
      dModel: 512,
      totalParameters: 6400 * 512, // 3,276,800 (with Weight Tying, shared with LM Head)
    },
    concepts: [
      "One-Hot Encoding",
      "Embedding Matrix",
      "Token ID Lookup",
      "Dense Vector",
      "Semantic Space",
      "Weight Tying",
      "Distributed Representation",
      "Cosine Similarity",
      "RoPE Integration",
      "Multi-Lingual Alignment",
    ],
    experiments: [
      "full-embedding-pipeline",
      "semantic-space-explorer",
      "weight-tying-verification",
      "language-alignment-analysis",
    ],
    features: [
      {
        feature: "Full MiniMind Integration",
        supported: false,
        plannedVersion: "V5",
        notes:
          "vocab_size=6400, d_model=512, Weight Tying 启用，与 RoPE 和 Transformer Block 无缝对接。",
      },
      {
        feature: "Production-Grade Initialization",
        supported: false,
        plannedVersion: "V5",
        notes:
          "使用 Xavier uniform 初始化，支持从预训练权重加载和 checkpoint 恢复。",
      },
    ],
    compatibleWith: ["subword-embedding"],
    futureVersion: null,
  },
];

// ============================================================
// Convenience lookup helpers
// ============================================================

/** O(1) lookup by module id */
export function getEmbeddingModuleById(
  id: string
): EmbeddingModule | undefined {
  return EMBEDDING_MODULES.find((m) => m.id === id);
}

/** The currently active embedding module */
export function getActiveEmbeddingModule(): EmbeddingModule | undefined {
  return EMBEDDING_MODULES.find((m) => m.status === "active");
}

/** All concepts across all embedding modules, deduplicated */
export function getAllEmbeddingConcepts(): string[] {
  const seen = new Set<string>();
  for (const m of EMBEDDING_MODULES) {
    for (const c of m.concepts) {
      seen.add(c);
    }
  }
  return Array.from(seen);
}

/** All experiments across all embedding modules, deduplicated */
export function getAllEmbeddingExperiments(): string[] {
  const seen = new Set<string>();
  for (const m of EMBEDDING_MODULES) {
    for (const e of m.experiments) {
      seen.add(e);
    }
  }
  return Array.from(seen);
}

// ============================================================
// Backward compatibility: flat concept + experiment exports
// ============================================================

/** Canonical concept list from the active (V1) embedding module */
export const EMBEDDING_CONCEPTS: string[] =
  getActiveEmbeddingModule()?.concepts ?? [];

/** Canonical experiment list from the active (V1) embedding module */
export const EMBEDDING_EXPERIMENTS: string[] =
  getActiveEmbeddingModule()?.experiments ?? [];
