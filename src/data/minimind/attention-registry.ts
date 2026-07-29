// ============================================================
// Attention Registry — Canonical Attention knowledge source
// ============================================================
//
// This file is the SINGLE SOURCE OF TRUTH for all Attention
// metadata: version definitions, dimension configurations,
// concept catalogs, and experiment lists.
//
// Consumers that MUST derive their data from this registry:
//   - src/lib/minimind/attention/                   → implementation
//   - src/components/minimind/playground/attention/ → (future) UI
//   - docs/minimind/04-attention.md                 → source reference
//   - AI Lab / Playground UI components             → (future) via module-registry
//
// When an Attention version, dimension, concept, or experiment
// changes, update it HERE and all views stay in sync automatically.
// ============================================================

// ============================================================
// Core data types
// ============================================================

/**
 * AttentionDimensionConfig — the dimensional parameters that
 * define an Attention layer's shape and capacity.
 */
export interface AttentionDimensionConfig {
  /** Model dimension — width of the input/output representation */
  dModel: number;
  /** Number of parallel attention heads */
  numHeads: number;
  /** Dimension per head — dModel / numHeads, must divide evenly */
  headDim: number;
  /** Maximum sequence length for causal mask precomputation */
  maxSeqLen: number;
}

/**
 * AttentionFeature — a single capability entry for comparison tables.
 *
 * Each feature describes one Attention capability, its current
 * support status, and when it is planned for implementation.
 */
export interface AttentionFeature {
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
 * AttentionModule — a complete Attention strategy definition.
 *
 * Each entry describes one Attention approach along the evolution
 * path: Basic Attention → Multi-Head → Causal → KV Cache → MiniMind Compatible.
 */
export interface AttentionModule {
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
  /** Dimensional configuration for this attention variant */
  dimensions: AttentionDimensionConfig;
  /** Core concepts this module teaches */
  concepts: string[];
  /** Named experiments available for this module */
  experiments: string[];
  /** Features introduced or relevant to this version */
  features: AttentionFeature[];
  /** Module ids this version is compatible with */
  compatibleWith: string[];
  /** Next version in the evolution path (null = terminal) */
  futureVersion: string | null;
}

// ============================================================
// Canonical feature definitions
// ============================================================

const V1_FEATURES: AttentionFeature[] = [
  {
    feature: "Scaled Dot-Product Attention",
    supported: true,
    plannedVersion: null,
    notes:
      "实现完整的 scaled dot-product attention: softmax(Q @ K^T / sqrt(d_k)) @ V。支持数值稳定的 softmax（减去最大值防止溢出）。",
  },
  {
    feature: "Q/K/V Projection",
    supported: true,
    plannedVersion: null,
    notes:
      "将输入向量通过 W_Q、W_K、W_V 矩阵投影为 Query、Key、Value。每个投影矩阵独立，支持不同表示子空间。",
  },
  {
    feature: "Multi-Head Split & Merge",
    supported: true,
    plannedVersion: null,
    notes:
      "将 d_model 拆分为 num_heads 个 head_dim 维子空间，每头独立计算 Attention，最后通过 W_O 合并。head_dim = d_model / num_heads。",
  },
  {
    feature: "Attention Trace",
    supported: true,
    plannedVersion: null,
    notes:
      "完整记录每次 forward 的 scores、weights 和 head outputs。支持逐 token、逐 head 的 attention 模式可视化。",
  },
  {
    feature: "Dot Product & Matrix Multiply",
    supported: true,
    plannedVersion: null,
    notes:
      "纯 TypeScript 实现的向量内积和矩阵乘法。零外部依赖，作为 Attention 数学基础的教学工具。",
  },
  {
    feature: "Causal Mask",
    supported: false,
    plannedVersion: "V3",
    notes:
      "上三角 mask（将未来位置分数设为 -∞），防止自回归生成时 token 关注后续位置。支持预计算和动态应用。",
  },
  {
    feature: "Positional Integration (RoPE)",
    supported: false,
    plannedVersion: "V3",
    notes:
      "Attention 接收已应用 RoPE 的 Q 和 K 向量。相对位置信息通过内积自然编码在 attention scores 中。",
  },
  {
    feature: "KV Cache",
    supported: false,
    plannedVersion: "V4",
    notes:
      "缓存已计算的 Key 和 Value 向量，推理时只计算新 token 的 Q/K/V。将每步计算从 O(L²) 降为 O(L)。",
  },
  {
    feature: "Multi-Query Attention (MQA)",
    supported: false,
    plannedVersion: "V4",
    notes:
      "所有 head 共享同一组 K/V，只保留独立的 Q。大幅减少 KV Cache 内存占用，轻微影响模型质量。",
  },
  {
    feature: "Grouped-Query Attention (GQA)",
    supported: false,
    plannedVersion: "V5",
    notes:
      "MHA 和 MQA 的折中方案：将 heads 分组，每组共享 K/V。平衡推理速度和模型质量。MiniMind 最终使用此方案。",
  },
  {
    feature: "MiniMind Compatible",
    supported: false,
    plannedVersion: "V5",
    notes:
      "完整对接 MiniMind 26M Transformer。d_model=512, num_heads=8, head_dim=64, 集成 RoPE + Causal Mask + GQA。",
  },
];

// ============================================================
// AttentionModule registry — evolution path
// ============================================================

export const ATTENTION_MODULES: AttentionModule[] = [
  {
    id: "attention-basic",
    name: "Basic Attention",
    version: "V1",
    status: "active",
    description:
      "Scaled dot-product attention with Q/K/V projection. Transparent score computation, numerically stable softmax, and full attention trace — the foundation for understanding how tokens interact.",
    dimensions: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      maxSeqLen: 512,
    },
    concepts: [
      "Self-Attention",
      "Query / Key / Value",
      "Scaled Dot-Product",
      "Softmax Normalization",
      "Attention Weights",
      "Attention Matrix",
      "Weighted Value Aggregation",
      "Dot Product Similarity",
      "Numerical Stability (Softmax)",
    ],
    experiments: [
      "attention-heatmap",
      "score-distribution",
      "weight-concentration",
      "qkv-similarity",
      "head-output-variance",
    ],
    features: V1_FEATURES.filter((f) =>
      [
        "Scaled Dot-Product Attention",
        "Q/K/V Projection",
        "Multi-Head Split & Merge",
        "Attention Trace",
        "Dot Product & Matrix Multiply",
      ].includes(f.feature)
    ),
    compatibleWith: [],
    futureVersion: "V2",
  },
  {
    id: "attention-multi-head",
    name: "Multi-Head Attention",
    version: "V2",
    status: "planned",
    description:
      "Parallel attention heads operating in independent representational subspaces. Each head learns a distinct attention pattern — syntactic, semantic, positional — and outputs are fused via learned projection.",
    dimensions: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      maxSeqLen: 512,
    },
    concepts: [
      "Multi-Head Attention",
      "Representational Subspace",
      "Head Diversity",
      "Split / Merge Operations",
      "Output Projection (W_O)",
      "Per-Head Independence",
      "Head Ensemble",
    ],
    experiments: [
      "head-diversity-comparison",
      "head-specialization",
      "num-heads-sweep",
      "attention-pattern-clustering",
    ],
    features: [
      {
        feature: "Head Diversity Analysis",
        supported: false,
        plannedVersion: "V2",
        notes:
          "可视化每个 head 的 attention pattern，检测 head 之间是否学到互补的注意力模式。相似的 head 意味着容量浪费。",
      },
      {
        feature: "Num-Heads Sweep Experiment",
        supported: false,
        plannedVersion: "V2",
        notes:
          "对比 num_heads=1/2/4/8 时的 attention 行为。展示多头如何在不同粒度上捕获依赖关系。",
      },
    ],
    compatibleWith: ["attention-basic"],
    futureVersion: "V3",
  },
  {
    id: "attention-causal",
    name: "Causal Attention",
    version: "V3",
    status: "planned",
    description:
      "Adds causal masking and RoPE integration. The causal mask enforces autoregressive constraints; RoPE-rotated Q/K encode relative position in the attention scores.",
    dimensions: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      maxSeqLen: 512,
    },
    concepts: [
      "Causal Mask",
      "Autoregressive Constraint",
      "Upper Triangular Mask",
      "RoPE Integration",
      "Relative Position in Attention",
      "Decoder-Only Architecture",
    ],
    experiments: [
      "causal-mask-verification",
      "masked-vs-unmasked-comparison",
      "rope-attention-interaction",
      "position-sensitivity-heatmap",
    ],
    features: [
      {
        feature: "Causal Mask",
        supported: false,
        plannedVersion: "V3",
        notes:
          "将 attention scores 矩阵的上三角（未来位置）设为 -∞。softmax 后未来位置的权重严格为 0。",
      },
      {
        feature: "RoPE Integration",
        supported: false,
        plannedVersion: "V3",
        notes:
          "接收已旋转的 Q 和 K 向量。Attention 内积自动编码相对位置，无需额外位置偏置项。",
      },
    ],
    compatibleWith: ["attention-multi-head"],
    futureVersion: "V4",
  },
  {
    id: "attention-kv-cache",
    name: "KV Cache Ready",
    version: "V4",
    status: "planned",
    description:
      "Key-Value cache architecture for efficient autoregressive inference. Previously computed K/V vectors are stored and reused, reducing per-step computation from O(L²) to O(L).",
    dimensions: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      maxSeqLen: 512,
    },
    concepts: [
      "KV Cache",
      "Incremental Inference",
      "Past Keys/Values Storage",
      "Memory/Compute Tradeoff",
      "Autoregressive Decoding",
      "Multi-Query Attention (MQA)",
    ],
    experiments: [
      "kv-cache-benchmark",
      "cache-memory-footprint",
      "prefill-vs-decode-latency",
      "cache-hit-rate-analysis",
    ],
    features: [
      {
        feature: "KV Cache",
        supported: false,
        plannedVersion: "V4",
        notes:
          "缓存所有历史位置的 K/V 向量。新 token 只计算当前 Q/K/V，与缓存的 K/V 做 attention。显存换速度的经典方案。",
      },
      {
        feature: "MQA (Multi-Query Attention)",
        supported: false,
        plannedVersion: "V4",
        notes:
          "所有 head 共享 K/V 投影。将 KV Cache 大小缩减为原来的 1/num_heads，大幅降低推理显存。",
      },
    ],
    compatibleWith: ["attention-causal"],
    futureVersion: "V5",
  },
  {
    id: "minimind-attention",
    name: "MiniMind Compatible Attention",
    version: "V5",
    status: "planned",
    description:
      "Production-ready Multi-Head Attention for the MiniMind 26M Transformer. d_model=512, num_heads=8, head_dim=64. RoPE + Causal Mask + GQA fully integrated.",
    dimensions: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      maxSeqLen: 512,
    },
    concepts: [
      "Self-Attention",
      "Multi-Head",
      "Scaled Dot-Product",
      "QKV Projection",
      "Causal Masking",
      "Attention Weights",
      "RoPE Integration",
      "KV Cache",
      "Grouped-Query Attention (GQA)",
    ],
    experiments: [
      "full-attention-pipeline",
      "multi-head-pattern-analysis",
      "causal-generation-trace",
      "kv-cache-correctness",
      "gqa-quality-comparison",
      "throughput-benchmark",
    ],
    features: [
      {
        feature: "Full MiniMind Integration",
        supported: false,
        plannedVersion: "V5",
        notes:
          "d_model=512, num_heads=8, head_dim=64。与 RoPE、Transformer Block、Inference Engine 无缝对接。",
      },
      {
        feature: "GQA (Grouped-Query Attention)",
        supported: false,
        plannedVersion: "V5",
        notes:
          "8 heads 分 2 组，每组共享 K/V。在 MHA 质量和 MQA 效率之间取得平衡，是 MiniMind 的最终 Attention 架构。",
      },
    ],
    compatibleWith: ["attention-kv-cache"],
    futureVersion: null,
  },
];

// ============================================================
// Convenience lookup helpers
// ============================================================

/** O(1) lookup by module id */
export function getAttentionModuleById(
  id: string
): AttentionModule | undefined {
  return ATTENTION_MODULES.find((m) => m.id === id);
}

/** The currently active Attention module */
export function getActiveAttentionModule(): AttentionModule | undefined {
  return ATTENTION_MODULES.find((m) => m.status === "active");
}

/** All concepts across all Attention modules, deduplicated */
export function getAllAttentionConcepts(): string[] {
  const seen = new Set<string>();
  for (const m of ATTENTION_MODULES) {
    for (const c of m.concepts) {
      seen.add(c);
    }
  }
  return Array.from(seen);
}

/** All experiments across all Attention modules, deduplicated */
export function getAllAttentionExperiments(): string[] {
  const seen = new Set<string>();
  for (const m of ATTENTION_MODULES) {
    for (const e of m.experiments) {
      seen.add(e);
    }
  }
  return Array.from(seen);
}

// ============================================================
// Backward compatibility: flat concept + experiment exports
// ============================================================

/** Canonical concept list from the active (V1) Attention module */
export const ATTENTION_CONCEPTS: string[] =
  getActiveAttentionModule()?.concepts ?? [];

/** Canonical experiment list from the active (V1) Attention module */
export const ATTENTION_EXPERIMENTS: string[] =
  getActiveAttentionModule()?.experiments ?? [];
