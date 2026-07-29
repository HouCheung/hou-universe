// ============================================================
// RoPE Registry — Canonical RoPE knowledge source
// ============================================================
//
// This file is the SINGLE SOURCE OF TRUTH for all RoPE
// metadata: version definitions, frequency configurations,
// concept catalogs, and experiment lists.
//
// Consumers that MUST derive their data from this registry:
//   - src/lib/minimind/rope/                      → implementation
//   - src/components/minimind/playground/rope/    → (future) UI
//   - docs/minimind/03-rope.md                    → source reference
//   - AI Lab / Playground UI components           → (future) via module-registry
//
// When a RoPE version, dimension, concept, or experiment
// changes, update it HERE and all views stay in sync automatically.
// ============================================================

// ============================================================
// Core data types
// ============================================================

/**
 * RoPEFrequencyConfig — the frequency parameters that
 * define a RoPE module's rotational behavior.
 */
export interface RoPEFrequencyConfig {
  /** Base frequency (theta) — controls the lowest frequency band */
  theta: number;
  /** Head dimension — must be even (rotates on d/2 2D planes) */
  headDim: number;
  /** Maximum sequence length supported by precomputed frequencies */
  maxSeqLen: number;
}

/**
 * RoPEFeature — a single capability entry for comparison tables.
 *
 * Each feature describes one RoPE capability, its current
 * support status, and when it is planned for implementation.
 */
export interface RoPEFeature {
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
 * RoPEModule — a complete RoPE strategy definition.
 *
 * Each entry describes one RoPE approach along the evolution
 * path: Fixed-Freq RoPE → Precomputed Freq → NTK-Aware → MiniMind Compatible.
 */
export interface RoPEModule {
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
  /** Dimensional and frequency configuration */
  dimensions: RoPEFrequencyConfig;
  /** Core concepts this module teaches */
  concepts: string[];
  /** Named experiments available for this module */
  experiments: string[];
  /** Features introduced or relevant to this version */
  features: RoPEFeature[];
  /** Module ids this version is compatible with */
  compatibleWith: string[];
  /** Next version in the evolution path (null = terminal) */
  futureVersion: string | null;
}

// ============================================================
// Canonical feature definitions
// ============================================================

const V1_FEATURES: RoPEFeature[] = [
  {
    feature: "Frequency Generation",
    supported: true,
    plannedVersion: null,
    notes:
      "计算每个维度对的旋转频率: freq_i = 1 / theta^(2i/d)。支持可配置的 theta 和 head_dim。",
  },
  {
    feature: "Rotary Angle Calculation",
    supported: true,
    plannedVersion: null,
    notes:
      "为每个位置 × 每个维度对计算旋转角度: angle = position × freq。批量计算所有位置的完整角度矩阵。",
  },
  {
    feature: "2D Vector Rotation",
    supported: true,
    plannedVersion: null,
    notes:
      "对 d/2 个 2D 维度对独立执行旋转: x' = x⊙cos(θ) + rotate_half(x)⊙sin(θ)。等距变换，保持向量范数不变。",
  },
  {
    feature: "Q/K Position Encoding",
    supported: true,
    plannedVersion: null,
    notes:
      "对 Query 和 Key 向量应用 RoPE 变换。相对位置信息通过旋转角度差值天然编码在 Q·K^T 内积中。",
  },
  {
    feature: "Frequency Spectrum Visualization",
    supported: true,
    plannedVersion: null,
    notes:
      "可视化 d/2 个频率带的分布。展示高频带（短距离敏感）到低频带（长距离敏感）的完整频谱。",
  },
  {
    feature: "Rotation Angle Explorer",
    supported: true,
    plannedVersion: null,
    notes:
      "交互式探索每个位置-维度对的旋转角度。帮助理解不同频率带对位置变化的敏感度差异。",
  },
  {
    feature: "Vector Norm Invariance Verification",
    supported: true,
    plannedVersion: null,
    notes:
      "验证旋转前后向量的 L2 范数保持不变。作为等距变换的正确性检验，对训练稳定性至关重要。",
  },
  {
    feature: "Precomputed Frequency Cache",
    supported: false,
    plannedVersion: "V2",
    notes:
      "预计算并缓存所有位置的 (cos, sin) 值对。避免每次 forward 时重复计算三角函数，显著提升推理吞吐。",
  },
  {
    feature: "NTK-Aware Scaling",
    supported: false,
    plannedVersion: "V3",
    notes:
      "通过调整 theta 实现长文本外推。在高维度对上降低频率（增大 theta），扩大低频带的覆盖范围。",
  },
  {
    feature: "YaRN Extension",
    supported: false,
    plannedVersion: "V4",
    notes:
      "结合 NTK-Aware 缩放和温度调节。在超长序列上同时保持短距离和长距离的注意力分辨率。",
  },
  {
    feature: "MiniMind Compatible",
    supported: false,
    plannedVersion: "V5",
    notes:
      "完整对接 MiniMind 26M Transformer。d_model=512, num_heads=8, head_dim=64, theta=10000.0。",
  },
];

// ============================================================
// RoPEModule registry — evolution path
// ============================================================

export const ROPE_MODULES: RoPEModule[] = [
  {
    id: "rope-basic",
    name: "Basic RoPE",
    version: "V1",
    status: "active",
    description:
      "Fixed-frequency Rotary Position Embedding. Transparent frequency generation, vector rotation, and Q/K position encoding — the foundation for understanding positional awareness in Transformers.",
    dimensions: {
      theta: 10000.0,
      headDim: 64,
      maxSeqLen: 512,
    },
    concepts: [
      "Absolute Position Encoding",
      "Relative Position Encoding",
      "Frequency Bands",
      "2D Rotation Matrix",
      "Complex Number Rotation",
      "Query/Key Rotation",
      "Vector Norm Invariance",
      "Inner Product Relative Position",
      "Orthogonal Transformation",
      "Cosine/Sine Interpolation",
    ],
    experiments: [
      "frequency-analysis",
      "position-sensitivity",
      "rotation-visualization",
      "norm-invariance-verification",
      "relative-position-decay",
    ],
    features: V1_FEATURES.filter((f) =>
      [
        "Frequency Generation",
        "Rotary Angle Calculation",
        "2D Vector Rotation",
        "Q/K Position Encoding",
        "Frequency Spectrum Visualization",
        "Rotation Angle Explorer",
        "Vector Norm Invariance Verification",
      ].includes(f.feature)
    ),
    compatibleWith: [],
    futureVersion: "V2",
  },
  {
    id: "rope-precomputed",
    name: "Precomputed RoPE",
    version: "V2",
    status: "planned",
    description:
      "Adds precomputed frequency cache for efficient inference. Computes all (cos, sin) values once at initialization, avoiding repeated trigonometric computation during forward passes.",
    dimensions: {
      theta: 10000.0,
      headDim: 64,
      maxSeqLen: 2048,
    },
    concepts: [
      "Frequency Cache",
      "Precomputation",
      "Trigonometric Optimization",
      "Inference Throughput",
      "Memory/Compute Tradeoff",
    ],
    experiments: [
      "cache-vs-recompute-benchmark",
      "memory-footprint-analysis",
      "max-seq-len-scaling",
    ],
    features: [
      {
        feature: "Precomputed Frequency Cache",
        supported: false,
        plannedVersion: "V2",
        notes:
          "在初始化时预计算 [maxSeqLen, headDim/2] 的 cos/sin 值缓存。forward 时直接查表，避免三角函数重复计算。",
      },
      {
        feature: "Extended Max Sequence Length",
        supported: false,
        plannedVersion: "V2",
        notes:
          "maxSeqLen 从 512 扩展到 2048。预计算缓存使长序列推理的开销从 O(L×D) 三角函数降为 O(L×D) 查表。",
      },
    ],
    compatibleWith: ["rope-basic"],
    futureVersion: "V3",
  },
  {
    id: "rope-ntk-aware",
    name: "NTK-Aware RoPE",
    version: "V3",
    status: "planned",
    description:
      "Applies NTK-Aware scaling to support length extrapolation. Dynamically adjusts frequency bands so that high-frequency dimensions stay sensitive while low-frequency dimensions stretch their range.",
    dimensions: {
      theta: 10000.0,
      headDim: 64,
      maxSeqLen: 4096,
    },
    concepts: [
      "NTK-Aware Scaling",
      "Length Extrapolation",
      "Frequency Band Adjustment",
      "Dynamic Theta",
      "Attention Resolution",
    ],
    experiments: [
      "extrapolation-ppl-curve",
      "ntk-theta-sweep",
      "frequency-band-shift-viz",
    ],
    features: [
      {
        feature: "NTK-Aware Scaling",
        supported: false,
        plannedVersion: "V3",
        notes:
          "将 theta 缩放为 theta · α^(d/(d-2))，使各频率带按比例拉伸。α = (new_max_len / original_max_len)。",
      },
      {
        feature: "Length Extrapolation",
        supported: false,
        plannedVersion: "V3",
        notes:
          "支持在训练长度 512 的基础上外推到 4096。通过频率带重缩放，避免直接插值导致的短距离分辨率损失。",
      },
    ],
    compatibleWith: ["rope-precomputed"],
    futureVersion: "V4",
  },
  {
    id: "rope-yarn",
    name: "YaRN RoPE",
    version: "V4",
    status: "planned",
    description:
      "Combines NTK-Aware scaling with temperature-based attention softening. Preserves short-range precision while extending effective context length dramatically.",
    dimensions: {
      theta: 10000.0,
      headDim: 64,
      maxSeqLen: 8192,
    },
    concepts: [
      "YaRN (Yet another RoPE extensioN)",
      "NTK-by-parts",
      "Attention Temperature",
      "Ramp Function",
      "Context Window Extension",
    ],
    experiments: [
      "yarn-vs-ntk-comparison",
      "temperature-sweep",
      "ultra-long-context-eval",
    ],
    features: [
      {
        feature: "NTK-by-parts Interpolation",
        supported: false,
        plannedVersion: "V4",
        notes:
          "对不同频率带分区处理：高频带保持不变（短距离精度），低频带按 NTK 缩放，中频带渐进过渡（ramp）。",
      },
      {
        feature: "Attention Temperature Softening",
        supported: false,
        plannedVersion: "V4",
        notes:
          "对极远距离的 attention score 施加温度因子，防止外推时 attention 分布过于集中。",
      },
    ],
    compatibleWith: ["rope-ntk-aware"],
    futureVersion: "V5",
  },
  {
    id: "minimind-rope",
    name: "MiniMind Compatible RoPE",
    version: "V5",
    status: "planned",
    description:
      "Production-ready RoPE for the MiniMind 26M Transformer. d_model=512, num_heads=8, head_dim=64, theta=10000.0. Full integration with Attention and Transformer blocks.",
    dimensions: {
      theta: 10000.0,
      headDim: 64,
      maxSeqLen: 512,
    },
    concepts: [
      "Frequency Bands",
      "2D Rotation Matrix",
      "Query/Key Rotation",
      "Relative Position",
      "Precomputed Cache",
      "NTK-Aware Scaling",
      "Length Extrapolation",
      "Attention Integration",
      "Vector Norm Invariance",
    ],
    experiments: [
      "full-rope-pipeline",
      "attention-integration-test",
      "multi-head-rope-comparison",
      "long-sequence-eval",
    ],
    features: [
      {
        feature: "Full MiniMind Integration",
        supported: false,
        plannedVersion: "V5",
        notes:
          "d_model=512, num_heads=8, head_dim=64, theta=10000.0。与 Attention 层和 Transformer Block 无缝对接。",
      },
      {
        feature: "Multi-Head RoPE Application",
        supported: false,
        plannedVersion: "V5",
        notes:
          "每个 head 独立应用 RoPE。所有 head 共享相同的频率配置，但各自在 head_dim=64 空间内旋转。",
      },
    ],
    compatibleWith: ["rope-yarn"],
    futureVersion: null,
  },
];

// ============================================================
// Convenience lookup helpers
// ============================================================

/** O(1) lookup by module id */
export function getRoPEModuleById(id: string): RoPEModule | undefined {
  return ROPE_MODULES.find((m) => m.id === id);
}

/** The currently active RoPE module */
export function getActiveRoPEModule(): RoPEModule | undefined {
  return ROPE_MODULES.find((m) => m.status === "active");
}

/** All concepts across all RoPE modules, deduplicated */
export function getAllRoPEConcepts(): string[] {
  const seen = new Set<string>();
  for (const m of ROPE_MODULES) {
    for (const c of m.concepts) {
      seen.add(c);
    }
  }
  return Array.from(seen);
}

/** All experiments across all RoPE modules, deduplicated */
export function getAllRoPEExperiments(): string[] {
  const seen = new Set<string>();
  for (const m of ROPE_MODULES) {
    for (const e of m.experiments) {
      seen.add(e);
    }
  }
  return Array.from(seen);
}

// ============================================================
// Backward compatibility: flat concept + experiment exports
// ============================================================

/** Canonical concept list from the active (V1) RoPE module */
export const ROPE_CONCEPTS: string[] =
  getActiveRoPEModule()?.concepts ?? [];

/** Canonical experiment list from the active (V1) RoPE module */
export const ROPE_EXPERIMENTS: string[] =
  getActiveRoPEModule()?.experiments ?? [];
