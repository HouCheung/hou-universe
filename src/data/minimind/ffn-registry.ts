// ============================================================
// FFN Registry — Canonical Feed-Forward Network knowledge source
// ============================================================
//
// This file is the SINGLE SOURCE OF TRUTH for all FFN
// metadata: version definitions, dimension configurations,
// concept catalogs, and experiment lists.
//
// Consumers that MUST derive their data from this registry:
//   - src/lib/minimind/ffn/                            → implementation
//   - src/components/minimind/playground/ffn/           → (future) UI
//   - docs/minimind/05-ffn.md                           → source reference
//   - AI Lab / Playground UI components                 → (future) via module-registry
//
// When an FFN version, dimension, concept, or experiment
// changes, update it HERE and all views stay in sync automatically.
// ============================================================

// ============================================================
// Core data types
// ============================================================

/**
 * FFNDimensionConfig — the dimensional parameters that
 * define a Feed-Forward Network layer's shape and capacity.
 */
export interface FFNDimensionConfig {
  /** Model dimension — width of the input/output representation */
  dModel: number;
  /** FFN intermediate dimension — typically 4 × dModel */
  dFF: number;
  /** Expansion ratio: dFF / dModel */
  expansionRatio: number;
  /** Maximum sequence length for input shape validation */
  maxSeqLen: number;
}

/**
 * FFNFeature — a single capability entry for comparison tables.
 *
 * Each feature describes one FFN capability, its current
 * support status, and when it is planned for implementation.
 */
export interface FFNFeature {
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
 * FFNModule — a complete FFN strategy definition.
 *
 * Each entry describes one FFN approach along the evolution
 * path: Basic FFN → GELU FFN → SwiGLU → Optimized → MiniMind Compatible.
 */
export interface FFNModule {
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
  /** Dimensional configuration for this FFN variant */
  dimensions: FFNDimensionConfig;
  /** Core concepts this module teaches */
  concepts: string[];
  /** Named experiments available for this module */
  experiments: string[];
  /** Features introduced or relevant to this version */
  features: FFNFeature[];
  /** Module ids this version is compatible with */
  compatibleWith: string[];
  /** Next version in the evolution path (null = terminal) */
  futureVersion: string | null;
}

// ============================================================
// Canonical feature definitions
// ============================================================

const V1_FEATURES: FFNFeature[] = [
  {
    feature: "Gate & Up Parallel Projection",
    supported: true,
    plannedVersion: null,
    notes:
      "输入同时通过 W_gate 和 W_up 两个投影矩阵映射到 dFF=4×dModel 的高维空间。两个投影并行计算，各自独立。",
  },
  {
    feature: "SiLU Activation (Swish)",
    supported: true,
    plannedVersion: null,
    notes:
      "实现 SiLU(x) = x · σ(x) = x / (1 + e^(-x))。平滑、自门控、非单调的激活函数，是 SwiGLU 的核心组件。",
  },
  {
    feature: "Element-wise Gate Multiply",
    supported: true,
    plannedVersion: null,
    notes:
      "SiLU(gate_projection) ⊙ up_projection — 门控信号逐元素控制信息流动。Gate 决定每个维度放行/抑制/反转。",
  },
  {
    feature: "Down Projection (W_down)",
    supported: true,
    plannedVersion: null,
    notes:
      "将 gated hidden states 从 dFF=2048 维投影回 dModel=512 维。确保输入输出同形状，兼容残差连接。",
  },
  {
    feature: "Full SwiGLU Pipeline",
    supported: true,
    plannedVersion: null,
    notes:
      "完整 SwiGLU FFN: output = (SiLU(xW_gate) ⊙ xW_up) @ W_down。与 LLaMA/MiniMind 架构一致。",
  },
  {
    feature: "Activation Trace",
    supported: true,
    plannedVersion: null,
    notes:
      "完整记录每次 forward 的 gate projection、activation、multiply、output projection。支持逐 token、逐维度的可视化。",
  },
  {
    feature: "Training-Grade Numerical Precision",
    supported: true,
    plannedVersion: null,
    notes:
      "所有中间计算保留完整精度，SiLU 使用 Math.exp 实现高精度。支持梯度计算和反向传播验证。",
  },
  {
    feature: "ReLU Activation Variant",
    supported: false,
    plannedVersion: "V2",
    notes:
      "支持切换激活函数为 ReLU: max(0, x)。对比 ReLU 和 SiLU 在 FFN 中的行为差异。ReLU 简单快速但存在死神经元问题。",
  },
  {
    feature: "GELU Activation Variant",
    supported: false,
    plannedVersion: "V2",
    notes:
      "支持切换激活函数为 GELU: x · Φ(x)。GELU 是 BERT/GPT-2 使用的平滑激活函数。对比 ReLU/GELU/SiLU 三种激活函数。",
  },
  {
    feature: "Bias Terms",
    supported: false,
    plannedVersion: "V2",
    notes:
      "在线性投影中添加可学习的 bias 项。现代 LLM（LLaMA 等）通常省略 bias，但传统 Transformer 使用 bias。",
  },
  {
    feature: "Non-Gated FFN Mode",
    supported: false,
    plannedVersion: "V3",
    notes:
      "切换为标准 FFN 模式（无门控）：output = W_down @ activation(W_up @ x)。对比门控 vs 非门控 FFN 的表达能力。",
  },
  {
    feature: "Weight Inspection API",
    supported: false,
    plannedVersion: "V3",
    notes:
      "提供 W_gate、W_up、W_down 的公开检查接口。支持权重分布可视化和单参数追踪。",
  },
  {
    feature: "Optimized Matrix Multiply",
    supported: false,
    plannedVersion: "V4",
    notes:
      "使用 Loop Tiling / Blocked Matrix Multiply 优化大规模矩阵乘法性能。教学用途：演示优化技巧对计算效率的影响。",
  },
  {
    feature: "Activation Caching",
    supported: false,
    plannedVersion: "V4",
    notes:
      "缓存 SiLU 激活值以避免重复计算。推理优化技巧，教学演示计算与内存的权衡。",
  },
  {
    feature: "MiniMind Compatible",
    supported: false,
    plannedVersion: "V5",
    notes:
      "完整对接 MiniMind 26M Transformer。dModel=512, dFF=2048, SwiGLU, 与 Attention/RoPE/Transformer Block 无缝集成。",
  },
];

// ============================================================
// FFNModule registry — evolution path
// ============================================================

export const FFN_MODULES: FFNModule[] = [
  {
    id: "ffn-basic",
    name: "Basic SwiGLU FFN",
    version: "V1",
    status: "active",
    description:
      "SwiGLU Feed-Forward Network with parallel Gate/Up projections, SiLU activation, element-wise gating, and Down projection. Transparent intermediate states and full activation trace for educational visibility.",
    dimensions: {
      dModel: 512,
      dFF: 2048,
      expansionRatio: 4,
      maxSeqLen: 512,
    },
    concepts: [
      "Feed-Forward Network",
      "Position-wise Transformation",
      "SwiGLU",
      "SiLU Activation",
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
    features: V1_FEATURES.filter((f) =>
      [
        "Gate & Up Parallel Projection",
        "SiLU Activation (Swish)",
        "Element-wise Gate Multiply",
        "Down Projection (W_down)",
        "Full SwiGLU Pipeline",
        "Activation Trace",
        "Training-Grade Numerical Precision",
      ].includes(f.feature)
    ),
    compatibleWith: [],
    futureVersion: "V2",
  },
  {
    id: "ffn-gelu",
    name: "GELU FFN",
    version: "V2",
    status: "planned",
    description:
      "Adds ReLU and GELU activation variants alongside SiLU. Enables direct comparison of activation functions in FFN context. Includes bias terms for traditional Transformer compatibility.",
    dimensions: {
      dModel: 512,
      dFF: 2048,
      expansionRatio: 4,
      maxSeqLen: 512,
    },
    concepts: [
      "ReLU Activation",
      "GELU Activation",
      "Activation Function Comparison",
      "Bias Terms in Linear Layers",
      "Dead Neuron Problem",
      "Smooth Activation Functions",
    ],
    experiments: [
      "activation-comparison",
      "relu-dead-neuron-detection",
      "gelu-vs-silu-distribution",
      "bias-impact-analysis",
    ],
    features: [
      {
        feature: "ReLU Activation Variant",
        supported: false,
        plannedVersion: "V2",
        notes: "支持 ReLU: max(0, x)。对比三种激活函数在 FFN 中的行为。",
      },
      {
        feature: "GELU Activation Variant",
        supported: false,
        plannedVersion: "V2",
        notes: "支持 GELU: x · Φ(x)。BERT/GPT-2 使用的平滑激活。",
      },
      {
        feature: "Bias Terms",
        supported: false,
        plannedVersion: "V2",
        notes: "可学习的 bias 向量。传统 Transformer 使用，现代 LLM 省略。",
      },
    ],
    compatibleWith: ["ffn-basic"],
    futureVersion: "V3",
  },
  {
    id: "ffn-variants",
    name: "FFN Variants",
    version: "V3",
    status: "planned",
    description:
      "Supports switching between SwiGLU (gated) and standard FFN (non-gated) modes. Adds weight inspection API for full transparency into projection matrices.",
    dimensions: {
      dModel: 512,
      dFF: 2048,
      expansionRatio: 4,
      maxSeqLen: 512,
    },
    concepts: [
      "Gated vs Non-Gated FFN",
      "Weight Visualization",
      "Parameter Efficiency",
      "Model Interpretability",
      "FFN Architecture Variants",
    ],
    experiments: [
      "gated-vs-non-gated-comparison",
      "weight-distribution-analysis",
      "parameter-importance-ranking",
      "ablation-study",
    ],
    features: [
      {
        feature: "Non-Gated FFN Mode",
        supported: false,
        plannedVersion: "V3",
        notes: "标准 FFN: W_down @ activation(W_up @ x)。无门控的基线方案。",
      },
      {
        feature: "Weight Inspection API",
        supported: false,
        plannedVersion: "V3",
        notes: "W_gate/W_up/W_down 权重公开可查，支持可视化。",
      },
    ],
    compatibleWith: ["ffn-gelu"],
    futureVersion: "V4",
  },
  {
    id: "ffn-optimized",
    name: "Optimized FFN",
    version: "V4",
    status: "planned",
    description:
      "Performance-optimized FFN with blocked matrix multiply and activation caching. Educational focus on compute/memory tradeoffs and optimization techniques.",
    dimensions: {
      dModel: 512,
      dFF: 2048,
      expansionRatio: 4,
      maxSeqLen: 512,
    },
    concepts: [
      "Matrix Multiply Optimization",
      "Loop Tiling / Blocking",
      "Activation Caching",
      "Compute vs Memory Tradeoff",
      "Cache Locality",
      "Inference Optimization",
    ],
    experiments: [
      "block-size-sweep",
      "cache-hit-rate",
      "throughput-benchmark",
      "memory-footprint-analysis",
    ],
    features: [
      {
        feature: "Optimized Matrix Multiply",
        supported: false,
        plannedVersion: "V4",
        notes: "Blocked matrix multiply 优化，提升 cache locality。",
      },
      {
        feature: "Activation Caching",
        supported: false,
        plannedVersion: "V4",
        notes: "缓存 SiLU 输出，避免推理时重复计算。",
      },
    ],
    compatibleWith: ["ffn-variants"],
    futureVersion: "V5",
  },
  {
    id: "minimind-ffn",
    name: "MiniMind Compatible FFN",
    version: "V5",
    status: "planned",
    description:
      "Production-ready SwiGLU FFN for the MiniMind 26M Transformer. dModel=512, dFF=2048. Fully integrated with Attention, Transformer Block, and Inference Engine.",
    dimensions: {
      dModel: 512,
      dFF: 2048,
      expansionRatio: 4,
      maxSeqLen: 512,
    },
    concepts: [
      "SwiGLU FFN",
      "Gate / Up / Down Projection",
      "SiLU Activation",
      "Position-wise",
      "Expansion-Compression",
      "Transformer Block Integration",
      "Residual Connection Compatibility",
    ],
    experiments: [
      "full-ffn-pipeline",
      "layer-wise-activation-analysis",
      "ffn-parameter-contribution",
      "activation-sparsity-study",
      "multi-layer-ffn-comparison",
    ],
    features: [
      {
        feature: "Full MiniMind Integration",
        supported: false,
        plannedVersion: "V5",
        notes:
          "dModel=512, dFF=2048, SwiGLU。与 Attention、Transformer Block、Inference Engine 无缝对接。",
      },
    ],
    compatibleWith: ["ffn-optimized"],
    futureVersion: null,
  },
];

// ============================================================
// Convenience lookup helpers
// ============================================================

/** O(1) lookup by module id */
export function getFFNModuleById(id: string): FFNModule | undefined {
  return FFN_MODULES.find((m) => m.id === id);
}

/** The currently active FFN module */
export function getActiveFFNModule(): FFNModule | undefined {
  return FFN_MODULES.find((m) => m.status === "active");
}

/** All concepts across all FFN modules, deduplicated */
export function getAllFFNConcepts(): string[] {
  const seen = new Set<string>();
  for (const m of FFN_MODULES) {
    for (const c of m.concepts) {
      seen.add(c);
    }
  }
  return Array.from(seen);
}

/** All experiments across all FFN modules, deduplicated */
export function getAllFFNExperiments(): string[] {
  const seen = new Set<string>();
  for (const m of FFN_MODULES) {
    for (const e of m.experiments) {
      seen.add(e);
    }
  }
  return Array.from(seen);
}

// ============================================================
// Backward compatibility: flat concept + experiment exports
// ============================================================

/** Canonical concept list from the active (V1) FFN module */
export const FFN_CONCEPTS: string[] =
  getActiveFFNModule()?.concepts ?? [];

/** Canonical experiment list from the active (V1) FFN module */
export const FFN_EXPERIMENTS: string[] =
  getActiveFFNModule()?.experiments ?? [];
