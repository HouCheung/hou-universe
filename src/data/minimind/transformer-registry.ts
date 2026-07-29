// ============================================================
// Transformer Registry — Canonical Transformer Block knowledge source
// ============================================================
//
// This file is the SINGLE SOURCE OF TRUTH for all Transformer
// metadata: version definitions, architecture configurations,
// concept catalogs, and experiment lists.
//
// Consumers that MUST derive their data from this registry:
//   - src/lib/minimind/transformer/                    → implementation
//   - src/components/minimind/playground/transformer/   → (future) UI
//   - docs/minimind/06-transformer.md                   → source reference
//   - AI Lab / Playground UI components                 → (future) via module-registry
//
// When a Transformer version, architecture, concept, or experiment
// changes, update it HERE and all views stay in sync automatically.
// ============================================================

// ============================================================
// Core data types
// ============================================================

/**
 * TransformerArchitectureConfig — the architectural parameters that
 * define a Transformer Block's structure and capacity.
 */
export interface TransformerArchitectureConfig {
  /** Model dimension — width of the hidden representation */
  dModel: number;
  /** Number of attention heads */
  numHeads: number;
  /** Dimension per attention head = dModel / numHeads */
  headDim: number;
  /** FFN intermediate dimension — typically 4 × dModel */
  dFF: number;
  /** Maximum sequence length for shape validation */
  maxSeqLen: number;
  /** Normalization epsilon for numerical stability */
  normEps: number;
  /** Normalization type ("rmsnorm" | "layernorm") */
  normType: "rmsnorm" | "layernorm";
  /** Architecture variant ("pre-norm" | "post-norm") */
  architecture: "pre-norm" | "post-norm";
}

/**
 * TransformerFeature — a single capability entry for comparison tables.
 *
 * Each feature describes one Transformer Block capability, its current
 * support status, and when it is planned for implementation.
 */
export interface TransformerFeature {
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
 * TransformerModule — a complete Transformer Block strategy definition.
 *
 * Each entry describes one Transformer Block approach along the evolution
 * path: Basic Block → Pre-Norm → RMSNorm → KV Cache Ready → MiniMind Compatible.
 */
export interface TransformerModule {
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
  /** Architectural configuration for this Transformer variant */
  architecture: TransformerArchitectureConfig;
  /** Core concepts this module teaches */
  concepts: string[];
  /** Named experiments available for this module */
  experiments: string[];
  /** Features introduced or relevant to this version */
  features: TransformerFeature[];
  /** Module ids this version is compatible with */
  compatibleWith: string[];
  /** Next version in the evolution path (null = terminal) */
  futureVersion: string | null;
}

// ============================================================
// Canonical feature definitions
// ============================================================

const V1_FEATURES: TransformerFeature[] = [
  {
    feature: "RMS Normalization",
    supported: true,
    plannedVersion: null,
    notes:
      "实现 RMSNorm(x) = x / RMS(x) * γ。仅除 RMS（不减均值），对齐 LLaMA 架构。比 LayerNorm 减少约 30% 计算量。",
  },
  {
    feature: "Pre-Norm Architecture",
    supported: true,
    plannedVersion: null,
    notes:
      "Normalization 在子层之前：y = x + Sublayer(Norm(x))。梯度通过残差路径无损传递，训练更稳定。",
  },
  {
    feature: "Dual Residual Connections",
    supported: true,
    plannedVersion: null,
    notes:
      "两个残差连接：Attention 残差和 FFN 残差。为梯度提供两条无损传递的高速公路。",
  },
  {
    feature: "Attention + FFN Composition",
    supported: true,
    plannedVersion: null,
    notes:
      "组合 MiniAttention 和 MiniFeedForward，通过依赖注入实现完整的 Decoder Block。不复制已有模块代码。",
  },
  {
    feature: "Complete Block Trace",
    supported: true,
    plannedVersion: null,
    notes:
      "完整记录每次 forward 的 RMSNorm 输出、Attention 输出、FFN 输出、残差状态。支持逐步骤可视化。",
  },
  {
    feature: "RMSNorm Weight Access",
    supported: true,
    plannedVersion: null,
    notes:
      "提供 γ（缩放因子）参数的公开检查接口。支持权重分布可视化和逐层对比。",
  },
  {
    feature: "Training-Grade Numerical Precision",
    supported: true,
    plannedVersion: null,
    notes:
      "所有中间计算保留完整精度。RMS 计算使用稳定算法避免浮点溢出。",
  },
  {
    feature: "LayerNorm Variant",
    supported: false,
    plannedVersion: "V2",
    notes:
      "支持在 RMSNorm 和 LayerNorm 之间切换。LayerNorm 额外包含减均值和 β 平移参数。对比两种归一化策略的效果差异。",
  },
  {
    feature: "Post-Norm Mode",
    supported: false,
    plannedVersion: "V2",
    notes:
      "支持切换为 Post-Norm（Norm 在子层之后）：y = Norm(x + Sublayer(x))。对比 Pre-Norm 和 Post-Norm 的训练稳定性。",
  },
  {
    feature: "Dropout Support",
    supported: false,
    plannedVersion: "V3",
    notes:
      "在 Attention 输出和 FFN 输出后添加 Dropout 正则化。训练时随机丢弃神经元，防止过拟合。",
  },
  {
    feature: "Multi-Block Stacking",
    supported: false,
    plannedVersion: "V4",
    notes:
      "支持将多个 TransformerBlock 堆叠成完整的 Deep Transformer。层间参数独立，支持逐层 trace。",
  },
  {
    feature: "KV Cache Integration",
    supported: false,
    plannedVersion: "V4",
    notes:
      "Block 支持 KV Cache 读写。推理时缓存历史 Key/Value，避免重复计算。自回归生成的性能关键。",
  },
  {
    feature: "MiniMind Compatible",
    supported: false,
    plannedVersion: "V5",
    notes:
      "完整对接 MiniMind 26M 模型。dModel=512, 8 heads, dFF=2048, 8 layers, RMSNorm, Pre-Norm, SwiGLU, RoPE。与 Tokenizer/Embedding/Inference Engine 无缝集成。",
  },
];

// ============================================================
// TransformerModule registry — evolution path
// ============================================================

export const TRANSFORMER_MODULES: TransformerModule[] = [
  {
    id: "transformer-basic",
    name: "Basic Transformer Block",
    version: "V1",
    status: "active",
    description:
      "Pre-Norm Decoder Block combining RMSNorm, Multi-Head Self-Attention, SwiGLU FFN, and dual residual connections. Full block trace for educational visibility. Dependency injection of existing Attention and FFN modules.",
    architecture: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      maxSeqLen: 512,
      normEps: 1e-6,
      normType: "rmsnorm",
      architecture: "pre-norm",
    },
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
    features: V1_FEATURES.filter((f) =>
      [
        "RMS Normalization",
        "Pre-Norm Architecture",
        "Dual Residual Connections",
        "Attention + FFN Composition",
        "Complete Block Trace",
        "RMSNorm Weight Access",
        "Training-Grade Numerical Precision",
      ].includes(f.feature)
    ),
    compatibleWith: [],
    futureVersion: "V2",
  },
  {
    id: "transformer-prenorm",
    name: "Pre-Norm Transformer",
    version: "V2",
    status: "planned",
    description:
      "Adds LayerNorm variant alongside RMSNorm, plus Post-Norm mode for architectural comparison. Enables direct A/B testing of normalization strategies and norm placement.",
    architecture: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      maxSeqLen: 512,
      normEps: 1e-5,
      normType: "rmsnorm",
      architecture: "pre-norm",
    },
    concepts: [
      "LayerNorm vs RMSNorm",
      "Pre-Norm vs Post-Norm",
      "Normalization Strategy",
      "Training Stability",
      "Gradient Flow Analysis",
    ],
    experiments: [
      "rmsnorm-vs-layernorm-comparison",
      "prenorm-vs-postnorm-training",
      "gradient-norm-by-layer",
      "activation-scale-analysis",
    ],
    features: [
      {
        feature: "LayerNorm Variant",
        supported: false,
        plannedVersion: "V2",
        notes: "支持 LayerNorm（含均值 + β）。与 RMSNorm 对比分析。",
      },
      {
        feature: "Post-Norm Mode",
        supported: false,
        plannedVersion: "V2",
        notes: "支持 Post-Norm：y = Norm(x + Sublayer(x))。对比训练稳定性。",
      },
    ],
    compatibleWith: ["transformer-basic"],
    futureVersion: "V3",
  },
  {
    id: "transformer-rmsnorm",
    name: "RMSNorm Transformer",
    version: "V3",
    status: "planned",
    description:
      "Optimized RMSNorm with Dropout regularization. Full training-mode support with stochastic depth and attention dropout for robust model training.",
    architecture: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      maxSeqLen: 512,
      normEps: 1e-6,
      normType: "rmsnorm",
      architecture: "pre-norm",
    },
    concepts: [
      "Dropout Regularization",
      "Stochastic Depth",
      "Attention Dropout",
      "Residual Dropout",
      "Training vs Inference Mode",
    ],
    experiments: [
      "dropout-rate-sweep",
      "stochastic-depth-impact",
      "overfitting-detection",
      "regularization-comparison",
    ],
    features: [
      {
        feature: "Dropout Support",
        supported: false,
        plannedVersion: "V3",
        notes: "Attention 和 FFN 输出后添加 Dropout 正则化。",
      },
    ],
    compatibleWith: ["transformer-prenorm"],
    futureVersion: "V4",
  },
  {
    id: "transformer-kvcache",
    name: "KV Cache Ready Transformer",
    version: "V4",
    status: "planned",
    description:
      "Multi-block stacking with KV Cache support for efficient autoregressive inference. Enables building a complete multi-layer Transformer model.",
    architecture: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      maxSeqLen: 512,
      normEps: 1e-6,
      normType: "rmsnorm",
      architecture: "pre-norm",
    },
    concepts: [
      "KV Cache",
      "Multi-Block Stacking",
      "Autoregressive Generation",
      "Inference Optimization",
      "Memory-Time Tradeoff",
    ],
    experiments: [
      "kv-cache-correctness",
      "cache-memory-footprint",
      "multi-block-output-progression",
      "layer-wise-representation-similarity",
    ],
    features: [
      {
        feature: "Multi-Block Stacking",
        supported: false,
        plannedVersion: "V4",
        notes: "多个 Block 堆叠成完整 Deep Transformer。层间参数独立。",
      },
      {
        feature: "KV Cache Integration",
        supported: false,
        plannedVersion: "V4",
        notes: "缓存历史 Key/Value 避免推理时重复计算。",
      },
    ],
    compatibleWith: ["transformer-rmsnorm"],
    futureVersion: "V5",
  },
  {
    id: "minimind-transformer",
    name: "MiniMind Compatible Transformer",
    version: "V5",
    status: "planned",
    description:
      "Production-ready 8-layer Decoder-only Transformer for MiniMind 26M. dModel=512, 8 heads, dFF=2048, RMSNorm, Pre-Norm, SwiGLU, RoPE. Full integration with Tokenizer, Embedding, and Inference Engine.",
    architecture: {
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      maxSeqLen: 512,
      normEps: 1e-6,
      normType: "rmsnorm",
      architecture: "pre-norm",
    },
    concepts: [
      "MiniMind 26M Architecture",
      "8-Layer Deep Transformer",
      "Pre-Norm + RMSNorm",
      "SwiGLU FFN",
      "Multi-Head Self-Attention",
      "Rotary Position Embedding",
      "Autoregressive Language Model",
    ],
    experiments: [
      "full-model-forward-pass",
      "layer-wise-output-analysis",
      "attention-pattern-evolution",
      "ffn-activation-by-layer",
      "residual-stream-analysis",
      "model-size-scaling",
    ],
    features: [
      {
        feature: "Full MiniMind Integration",
        supported: false,
        plannedVersion: "V5",
        notes:
          "8 层 × (RMSNorm + Attention + FFN + Residual) = MiniMind 26M 完整模型。与 Tokenizer/Embedding/Inference Engine 无缝对接。",
      },
    ],
    compatibleWith: ["transformer-kvcache"],
    futureVersion: null,
  },
];

// ============================================================
// Convenience lookup helpers
// ============================================================

/** O(1) lookup by module id */
export function getTransformerModuleById(
  id: string
): TransformerModule | undefined {
  return TRANSFORMER_MODULES.find((m) => m.id === id);
}

/** The currently active Transformer module */
export function getActiveTransformerModule(): TransformerModule | undefined {
  return TRANSFORMER_MODULES.find((m) => m.status === "active");
}

/** All concepts across all Transformer modules, deduplicated */
export function getAllTransformerConcepts(): string[] {
  const seen = new Set<string>();
  for (const m of TRANSFORMER_MODULES) {
    for (const c of m.concepts) {
      seen.add(c);
    }
  }
  return Array.from(seen);
}

/** All experiments across all Transformer modules, deduplicated */
export function getAllTransformerExperiments(): string[] {
  const seen = new Set<string>();
  for (const m of TRANSFORMER_MODULES) {
    for (const e of m.experiments) {
      seen.add(e);
    }
  }
  return Array.from(seen);
}

// ============================================================
// Backward compatibility: flat concept + experiment exports
// ============================================================

/** Canonical concept list from the active (V1) Transformer module */
export const TRANSFORMER_CONCEPTS: string[] =
  getActiveTransformerModule()?.concepts ?? [];

/** Canonical experiment list from the active (V1) Transformer module */
export const TRANSFORMER_EXPERIMENTS: string[] =
  getActiveTransformerModule()?.experiments ?? [];
