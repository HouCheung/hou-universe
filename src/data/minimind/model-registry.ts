// ============================================================
// Model Registry — Canonical Forward Model knowledge source
// ============================================================
//
// This file is the SINGLE SOURCE OF TRUTH for all MiniMind
// Forward Model metadata: version definitions, architecture
// configurations, concept catalogs, and experiment lists.
//
// Consumers that MUST derive their data from this registry:
//   - src/lib/minimind/model/                            → implementation
//   - src/components/minimind/playground/model/           → (future) UI
//   - docs/minimind/09-forward.md                         → source reference
//   - AI Lab / Playground UI components                   → (future) via module-registry
//
// When a Model version, architecture, concept, or experiment
// changes, update it HERE and all views stay in sync automatically.
// ============================================================

// ============================================================
// Core data types
// ============================================================

/**
 * ModelArchitectureConfig — the architectural parameters that
 * define a complete MiniMind Forward Model's structure and capacity.
 */
export interface ModelArchitectureConfig {
  /** Vocabulary size */
  vocabSize: number;
  /** Model dimension — width of the hidden representation */
  dModel: number;
  /** Number of attention heads */
  numHeads: number;
  /** Dimension per attention head = dModel / numHeads */
  headDim: number;
  /** FFN intermediate dimension — typically 4 × dModel */
  dFF: number;
  /** Number of Transformer Block layers */
  numLayers: number;
  /** Maximum sequence length for shape validation */
  maxSeqLen: number;
  /** Normalization epsilon for numerical stability */
  normEps: number;
  /** RoPE theta base for frequency computation */
  ropeTheta: number;
}

/**
 * ModelFeature — a single capability entry for comparison tables.
 *
 * Each feature describes one Forward Model capability, its current
 * support status, and when it is planned for implementation.
 */
export interface ModelFeature {
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
 * ModelModule — a complete Forward Model strategy definition.
 *
 * Each entry describes one model composition approach along the evolution
 * path: Single Block → Multi Layer → LM Head → Generation Ready → MiniMind Compatible.
 */
export interface ModelModule {
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
  /** Architectural configuration for this model variant */
  architecture: ModelArchitectureConfig;
  /** Core concepts this module teaches */
  concepts: string[];
  /** Named experiments available for this module */
  experiments: string[];
  /** Features introduced or relevant to this version */
  features: ModelFeature[];
  /** Module ids this version is compatible with */
  compatibleWith: string[];
  /** Next version in the evolution path (null = terminal) */
  futureVersion: string | null;
}

// ============================================================
// Canonical feature definitions
// ============================================================

const V1_FEATURES: ModelFeature[] = [
  {
    feature: "Complete Forward Pipeline",
    supported: true,
    plannedVersion: null,
    notes:
      "Text → Tokenizer → Embedding → RoPE → Transformer Blocks → LM Head → Logits。5 阶段完整数据流，每一步中间结果可独立检查。",
  },
  {
    feature: "Dependency Injection Composition",
    supported: true,
    plannedVersion: null,
    notes:
      "通过依赖注入组合所有子模块（Tokenizer、Embedding、RoPE、TransformerBlock、LMHead）。不复制任何已有模块代码。",
  },
  {
    feature: "LM Head (Linear Projection)",
    supported: true,
    plannedVersion: null,
    notes:
      "实现 hidden [dModel] → logits [vocabSize] 的线性投影。使用 Xavier 初始化，权重完全透明可检查。不包含 softmax。",
  },
  {
    feature: "Full Model Trace",
    supported: true,
    plannedVersion: null,
    notes:
      "记录从 Text → Tokens → Embeddings → RoPE → Transformer × N → Logits 的全流程中间结果。支持逐阶段可视化。",
  },
  {
    feature: "Model Config Validation",
    supported: true,
    plannedVersion: null,
    notes:
      "构造时验证所有配置参数（vocabSize、dModel、numHeads、numLayers、dFF、maxSeqLen、normEps、ropeTheta）和 blocks 数量一致性。",
  },
  {
    feature: "Sub-module Access API",
    supported: true,
    plannedVersion: null,
    notes:
      "提供 getTokenizer()、getEmbedding()、getRoPE()、getBlocks()、getLMHead() 访问器。支持检查和操作每个子模块。",
  },
  {
    feature: "Run Forward Example",
    supported: true,
    plannedVersion: null,
    notes:
      "\"Hello HOU Universe\" 完整示例展示：Text → Tokens → Embeddings → Transformer → Logits 的每一步输出。",
  },
  {
    feature: "Multi-Layer Stacking",
    supported: false,
    plannedVersion: "V2",
    notes:
      "支持 numLayers > 1 的多层 Transformer Block 堆叠。每层拥有独立参数，支持逐层 trace 对比。",
  },
  {
    feature: "LM Head with Softmax",
    supported: false,
    plannedVersion: "V3",
    notes:
      "在 LM Head 输出后添加 Softmax 层。将 logits 转换为概率分布，支持 temperature 调节。",
  },
  {
    feature: "Generation Loop",
    supported: false,
    plannedVersion: "V4",
    notes:
      "添加自回归生成循环。支持 temperature sampling、top-k、top-p 过滤。每次迭代取最后一个 logit 作为下一个 token 输入。",
  },
  {
    feature: "MiniMind 26M Compatible",
    supported: false,
    plannedVersion: "V5",
    notes:
      "完整对接 MiniMind 26M 模型配置：vocabSize=6400, dModel=512, numHeads=8, dFF=2048, numLayers=8。与 Tokenizer/Embedding/Inference Engine 无缝集成。",
  },
];

// ============================================================
// ModelModule registry — evolution path
// ============================================================

export const MODEL_MODULES: ModelModule[] = [
  {
    id: "model-single-block",
    name: "Single Block Forward Model",
    version: "V1",
    status: "active",
    description:
      "Complete Text → Logits pipeline with single Transformer Block. Composes Tokenizer, Embedding, RoPE, TransformerBlock, and LM Head via dependency injection. Full model trace for educational visibility.",
    architecture: {
      vocabSize: 1000,
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      numLayers: 1,
      maxSeqLen: 128,
      normEps: 1e-6,
      ropeTheta: 10000,
    },
    concepts: [
      "LLM Forward Pass",
      "Hidden State Flow",
      "Decoder-only Architecture",
      "LM Head (Linear Projection)",
      "Logits (Raw Scores)",
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
    features: V1_FEATURES.filter((f) =>
      [
        "Complete Forward Pipeline",
        "Dependency Injection Composition",
        "LM Head (Linear Projection)",
        "Full Model Trace",
        "Model Config Validation",
        "Sub-module Access API",
        "Run Forward Example",
      ].includes(f.feature)
    ),
    compatibleWith: [],
    futureVersion: "V2",
  },
  {
    id: "model-multi-layer",
    name: "Multi-Layer Forward Model",
    version: "V2",
    status: "planned",
    description:
      "Multi-layer Transformer Block stacking with independent per-layer traces. Enables studying how representations evolve across layers in a deep Transformer.",
    architecture: {
      vocabSize: 1000,
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      numLayers: 4,
      maxSeqLen: 128,
      normEps: 1e-6,
      ropeTheta: 10000,
    },
    concepts: [
      "Deep Transformer Stacking",
      "Layer-wise Representation",
      "Residual Stream Analysis",
      "Attention Pattern Evolution",
    ],
    experiments: [
      "layer-wise-output-comparison",
      "attention-pattern-by-layer",
      "representation-similarity-matrix",
    ],
    features: [
      {
        feature: "Multi-Layer Stacking",
        supported: false,
        plannedVersion: "V2",
        notes:
          "支持 numLayers > 1，每层独立参数。逐层 trace 对比表示演变。",
      },
    ],
    compatibleWith: ["model-single-block"],
    futureVersion: "V3",
  },
  {
    id: "model-lm-head",
    name: "LM Head Forward Model",
    version: "V3",
    status: "planned",
    description:
      "Adds Softmax probability conversion on top of LM Head logits. Includes temperature parameter for controlling prediction sharpness.",
    architecture: {
      vocabSize: 1000,
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      numLayers: 4,
      maxSeqLen: 128,
      normEps: 1e-6,
      ropeTheta: 10000,
    },
    concepts: [
      "Softmax Temperature",
      "Probability Distribution",
      "Prediction Confidence",
      "Logits → Probabilities",
    ],
    experiments: [
      "temperature-sweep",
      "probability-entropy-analysis",
      "top-k-prediction-accuracy",
    ],
    features: [
      {
        feature: "LM Head with Softmax",
        supported: false,
        plannedVersion: "V3",
        notes:
          "将 logits 转换为概率分布。支持 temperature 参数控制输出锐度。",
      },
    ],
    compatibleWith: ["model-multi-layer"],
    futureVersion: "V4",
  },
  {
    id: "model-generation",
    name: "Generation Ready Forward Model",
    version: "V4",
    status: "planned",
    description:
      "Autoregressive generation loop built on forward pass. Temperature sampling, top-k / top-p filtering for controlled text generation.",
    architecture: {
      vocabSize: 1000,
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      numLayers: 4,
      maxSeqLen: 256,
      normEps: 1e-6,
      ropeTheta: 10000,
    },
    concepts: [
      "Autoregressive Generation",
      "Temperature Sampling",
      "Top-K Filtering",
      "Top-P (Nucleus) Filtering",
      "Next Token Prediction Loop",
    ],
    experiments: [
      "sampling-strategy-comparison",
      "temperature-effect-on-diversity",
      "repetition-analysis",
    ],
    features: [
      {
        feature: "Generation Loop",
        supported: false,
        plannedVersion: "V4",
        notes:
          "自回归生成循环。每次取 max logit 作为下一 token，迭代直到 <eos>。",
      },
    ],
    compatibleWith: ["model-lm-head"],
    futureVersion: "V5",
  },
  {
    id: "minimind-model",
    name: "MiniMind 26M Compatible Model",
    version: "V5",
    status: "planned",
    description:
      "Production-ready MiniMind 26M Forward Model. vocabSize=6400, dModel=512, 8 heads, dFF=2048, 8 layers. Full integration with Tokenizer, Embedding, and Inference Engine.",
    architecture: {
      vocabSize: 6400,
      dModel: 512,
      numHeads: 8,
      headDim: 64,
      dFF: 2048,
      numLayers: 8,
      maxSeqLen: 512,
      normEps: 1e-6,
      ropeTheta: 10000,
    },
    concepts: [
      "MiniMind 26M Architecture",
      "8-Layer Deep Transformer",
      "6400-Word Vocabulary",
      "Full Forward + Generation Pipeline",
      "End-to-End Token Prediction",
    ],
    experiments: [
      "full-model-forward-benchmark",
      "layer-wise-output-analysis-deep",
      "attention-pattern-evolution-8layer",
      "parameter-count-breakdown",
      "inference-speed-profiling",
    ],
    features: [
      {
        feature: "MiniMind 26M Compatible",
        supported: false,
        plannedVersion: "V5",
        notes:
          "完整 MiniMind 26M 配置。vocabSize=6400, dModel=512, numHeads=8, dFF=2048, numLayers=8。与所有子模块无缝对接。",
      },
    ],
    compatibleWith: ["model-generation"],
    futureVersion: null,
  },
];

// ============================================================
// Convenience lookup helpers
// ============================================================

/** O(1) lookup by module id */
export function getModelModuleById(id: string): ModelModule | undefined {
  return MODEL_MODULES.find((m) => m.id === id);
}

/** The currently active Model module */
export function getActiveModelModule(): ModelModule | undefined {
  return MODEL_MODULES.find((m) => m.status === "active");
}

/** All concepts across all Model modules, deduplicated */
export function getAllModelConcepts(): string[] {
  const seen = new Set<string>();
  for (const m of MODEL_MODULES) {
    for (const c of m.concepts) {
      seen.add(c);
    }
  }
  return Array.from(seen);
}

/** All experiments across all Model modules, deduplicated */
export function getAllModelExperiments(): string[] {
  const seen = new Set<string>();
  for (const m of MODEL_MODULES) {
    for (const e of m.experiments) {
      seen.add(e);
    }
  }
  return Array.from(seen);
}

// ============================================================
// Backward compatibility: flat concept + experiment exports
// ============================================================

/** Canonical concept list from the active (V1) Model module */
export const MODEL_CONCEPTS: string[] =
  getActiveModelModule()?.concepts ?? [];

/** Canonical experiment list from the active (V1) Model module */
export const MODEL_EXPERIMENTS: string[] =
  getActiveModelModule()?.experiments ?? [];
