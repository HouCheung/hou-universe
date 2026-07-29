// ============================================================
// Tokenizer Registry — Canonical tokenizer knowledge source
// ============================================================
//
// This file is the SINGLE SOURCE OF TRUTH for all tokenizer
// metadata: version definitions, feature matrices, and pipeline
// stage descriptions.
//
// Consumers that MUST derive their data from this registry:
//   - src/lib/minimind/tokenizer/comparison.ts  → feature views
//   - src/lib/minimind/tokenizer/pipeline.ts    → pipeline definition
//   - src/lib/minimind/tokenizer/README.md      → source reference
//   - docs/minimind/01-tokenizer.md             → source reference
//   - AI Lab / Playground UI components         → (via comparison/pipeline)
//
// When a tokenizer version, feature, or pipeline stage changes,
// update it HERE and all views stay in sync automatically.
// ============================================================

// ============================================================
// Core data types
// ============================================================

/**
 * TokenizerFeature — a single capability entry for comparison tables.
 *
 * Each feature describes one tokenizer capability, its current
 * support status, and when it is planned for implementation.
 */
export interface TokenizerFeature {
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
 * PipelineStageDef — a single stage in the tokenization pipeline.
 *
 * Each stage corresponds to one step in the tokenization flow
 * (Normalize → Split → Lookup → Encode → Decode).
 * The `id` field uses the same string values as the TokenizerStage enum.
 */
export interface PipelineStageDef {
  /** Stage identifier — matches TokenizerStage enum values */
  id: string;
  /** Human-readable stage title */
  title: string;
  /** Short description of what this stage does */
  description: string;
  /** Whether this stage is implemented in the current version */
  implemented: boolean;
  /** Target version for implementation (null = already done / no plan) */
  futureVersion: string | null;
}

/**
 * TokenizerVersion — a complete tokenizer strategy definition.
 *
 * Each entry describes one tokenizer approach along the evolution
 * path: Word → Character → BPE → Byte-Level BPE → MiniMind Compatible.
 */
export interface TokenizerVersion {
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
  /** Features introduced or relevant to this version */
  features: TokenizerFeature[];
  /** Pipeline stages active in this version */
  pipelineStages: PipelineStageDef[];
  /** Versions this tokenizer is compatible with */
  compatibleWith: string[];
  /** Next version in the evolution path (null = terminal) */
  futureVersion: string | null;
}

// ============================================================
// View tags — used to build the two comparison matrices
// ============================================================

/**
 * Each feature is tagged with which comparison view(s) it appears in:
 *   - "educational" → EducationalTokenizerFeatures (V1 Learning Edition)
 *   - "minimind"    → MiniMindTokenizerFeatures (target MiniMind tokenizer)
 *   - "both"        → appears in both views
 */
export type FeatureView = "educational" | "minimind" | "both";

export interface TaggedTokenizerFeature extends TokenizerFeature {
  view: FeatureView;
}

// ============================================================
// Canonical feature definitions — the complete feature matrix
// ============================================================

const EDUCATIONAL_FEATURES: TaggedTokenizerFeature[] = [
  {
    feature: "Word Tokenization",
    supported: true,
    plannedVersion: null,
    notes: "基于空白字符 (\\s+) 切分的最低限度实现。不处理标点粘连。",
    view: "educational",
  },
  {
    feature: "Vocabulary Lookup",
    supported: true,
    plannedVersion: null,
    notes: "O(1) 精确匹配查表。使用 Map<string, number> 双向映射。",
    view: "educational",
  },
  {
    feature: "Special Tokens",
    supported: true,
    plannedVersion: null,
    notes: "支持 <pad>(0) <unk>(1) <bos>(2) <eos>(3)。可通过 addSpecialTokens 选项控制编码。",
    view: "educational",
  },
  {
    feature: "Explain API",
    supported: true,
    plannedVersion: null,
    notes: "完整 tokenization 链路可见性：原始文本 → tokens → ids → 解码文本。返回结构化 ExplainResult。",
    view: "educational",
  },
  {
    feature: "Custom Vocabulary",
    supported: true,
    plannedVersion: null,
    notes: "通过 addToken() 动态注册 token。幂等操作，重复添加不报错。",
    view: "educational",
  },
  {
    feature: "Punctuation Handling",
    supported: false,
    plannedVersion: "V2",
    notes: "当前 'hello!' 被整体视为一个 token，不分离标点。V2 将在 Normalize 阶段处理。",
    view: "educational",
  },
  {
    feature: "Case Normalization",
    supported: false,
    plannedVersion: "V2",
    notes: "当前 'Hello' 和 'hello' 被视为不同 token。V2 将支持 lowercasing 选项。",
    view: "educational",
  },
  {
    feature: "Unicode Normalization",
    supported: false,
    plannedVersion: "V2",
    notes: "不统一全角/半角字符或组合字符。V2 将在 Normalize 阶段引入 NFKC 归一化。",
    view: "educational",
  },
  {
    feature: "Text Normalization",
    supported: false,
    plannedVersion: "V2",
    notes: "不做任何预处理（去空格、控制字符等）。plannedV2 将实现完整的 Normalize 阶段。",
    view: "educational",
  },
  {
    feature: "Byte Encoding",
    supported: false,
    plannedVersion: "V3",
    notes: "无法处理 vocabulary 外的任意 Unicode 字符。Byte Encoding 将保证 100% 覆盖。",
    view: "educational",
  },
  {
    feature: "Subword Tokenization",
    supported: false,
    plannedVersion: "V4",
    notes: "仅支持整词匹配，无法处理未登录词。BPE 将通过合并常见字符对来生成子词。",
    view: "educational",
  },
  {
    feature: "BPE Training",
    supported: false,
    plannedVersion: "V4",
    notes: "无法从语料中学习 merge rules。V4 将支持给定 vocabulary 大小的 BPE 训练。",
    view: "educational",
  },
  {
    feature: "Byte-Level BPE",
    supported: false,
    plannedVersion: "V4",
    notes: "无法像 GPT tokenizer 一样直接处理 UTF-8 字节。ByteEncoder + BPE 组合实现。",
    view: "educational",
  },
  {
    feature: "SentencePiece (Unigram)",
    supported: false,
    plannedVersion: "V5",
    notes: "替代 BPE 的子词建模方案，支持 subword regularization。",
    view: "educational",
  },
];

const MINIMIND_FEATURES: TaggedTokenizerFeature[] = [
  {
    feature: "Word Tokenization",
    supported: true,
    plannedVersion: null,
    notes: "继承自 Learning Edition V1，作为 baseline。",
    view: "minimind",
  },
  {
    feature: "Character Tokenization",
    supported: false,
    plannedVersion: "V2",
    notes: "单字符切分 — 比 Word 更细粒度，但 vocabulary 较大且语义信息不足。过渡方案。",
    view: "minimind",
  },
  {
    feature: "BPE (Byte Pair Encoding)",
    supported: false,
    plannedVersion: "V3",
    notes: "核心子词算法。从字符级开始，统计最高频相邻对进行迭代合并。",
    view: "minimind",
  },
  {
    feature: "Byte-Level BPE",
    supported: false,
    plannedVersion: "V4",
    notes: "以 UTF-8 字节为最小单位（0-255），确保 vocabulary 大小可控且 OOV 率为 0。",
    view: "minimind",
  },
  {
    feature: "Trainable Merge Rules",
    supported: false,
    plannedVersion: "V3",
    notes: "从训练语料中自动学习 merge rules，支持指定 vocabulary 大小。",
    view: "minimind",
  },
  {
    feature: "Pre-tokenization (Regex)",
    supported: false,
    plannedVersion: "V3",
    notes: "使用正则表达式进行预切分（GPT-2 风格的 contractions/digits/whitespace 处理）。",
    view: "minimind",
  },
  {
    feature: "Cached Encoding",
    supported: false,
    plannedVersion: "V4",
    notes: "对频繁编码的文本进行缓存，提升推理吞吐量。",
    view: "minimind",
  },
  {
    feature: "Batch Encoding",
    supported: false,
    plannedVersion: "V4",
    notes: "支持批量文本编码，利用并行 lookup 加速。",
    view: "minimind",
  },
  {
    feature: "Chat Template",
    supported: false,
    plannedVersion: "V5",
    notes: "支持 ChatML / Llama-style 对话模板注入（system/user/assistant 角色标记）。",
    view: "minimind",
  },
  {
    feature: "Token Counting (Accurate)",
    supported: false,
    plannedVersion: "V5",
    notes: "精确的 token 计数 API，用于 context window 管理和计费。",
    view: "minimind",
  },
  {
    feature: "Streaming Decode",
    supported: false,
    plannedVersion: "V5",
    notes: "延迟解码 — 边生成边输出，不等完整序列。支持 SSE/WebSocket 流式传输。",
    view: "minimind",
  },
  {
    feature: "truncation & padding",
    supported: false,
    plannedVersion: "V5",
    notes: "支持 max_length 截断和 batch padding（longest / max_length 两种策略）。",
    view: "minimind",
  },
  {
    feature: "GPT Tokenizer Compatibility",
    supported: false,
    plannedVersion: "V5",
    notes: "输出与 tiktoken / GPT tokenizer 对齐，支持直接替换用于推理。",
    view: "minimind",
  },
];

// ============================================================
// Canonical pipeline stage definitions for V1
// ============================================================

const V1_PIPELINE_STAGES: PipelineStageDef[] = [
  {
    id: "normalize",
    title: "Normalize",
    description:
      "文本归一化：去除首尾空白、统一 Unicode 表示形式。当前版本仅做 trim()，未来版本将加入标点分离与大小写归一化。",
    implemented: false,
    futureVersion: "V2",
  },
  {
    id: "split",
    title: "Whitespace Split",
    description:
      "按空白字符切分文本为原始 token 数组。V1 使用正则 s+/ 进行朴素切分，不处理标点粘连。未来版本可在 Split 前引入 ByteEncoding 阶段以支持子词。",
    implemented: true,
    futureVersion: null,
  },
  {
    id: "lookup",
    title: "Vocabulary Lookup",
    description:
      "将每个 token 在 vocabulary 中进行 O(1) 查表。命中则返回对应 id，未命中则回退为 <unk>（id=1）。V1 使用 Map 基于的精确匹配；未来子词模型的 Lookup 将改为最长前缀匹配。",
    implemented: true,
    futureVersion: null,
  },
  {
    id: "encode",
    title: "Encode",
    description:
      "将 token 数组转换为 id 序列。如果 options.addSpecialTokens 开启，在序列首尾附加 <bos>/<eos> 对应 id。未来版本将在 BPE 合并后执行此步骤。",
    implemented: true,
    futureVersion: null,
  },
  {
    id: "decode",
    title: "Decode",
    description:
      "将 id 序列还原为文本：逐 id 查表获取 token，用空格拼接。V1 的 decode 是 encode 的逆向操作，不涉及子词合并。未来 Byte-Level BPE 版本需要从字节序列重建原始文本。",
    implemented: true,
    futureVersion: null,
  },
];

// ============================================================
// TokenizerVersion registry — 5 versions along the evolution path
// ============================================================

export const TOKENIZER_VERSIONS: TokenizerVersion[] = [
  {
    id: "word-tokenizer",
    name: "Word Tokenizer",
    version: "V1",
    status: "active",
    description:
      "Whitespace-split + vocabulary lookup. Naive but transparent — perfect for learning the encode/decode round-trip.",
    features: EDUCATIONAL_FEATURES.filter((f) =>
      ["Word Tokenization", "Vocabulary Lookup", "Special Tokens", "Explain API", "Custom Vocabulary"].includes(f.feature)
    ),
    pipelineStages: V1_PIPELINE_STAGES,
    compatibleWith: [],
    futureVersion: "V2",
  },
  {
    id: "character-tokenizer",
    name: "Character Tokenizer",
    version: "V2",
    status: "planned",
    description:
      "One token per character. Zero OOV rate but extremely long sequences — shows the vocabulary-size vs sequence-length trade-off.",
    features: [
      {
        feature: "Character-level granularity",
        supported: false,
        plannedVersion: "V2",
        notes: "Single-character tokenization with zero unknown tokens and tiny vocabulary.",
      },
      {
        feature: "Zero unknown tokens",
        supported: false,
        plannedVersion: "V2",
        notes: "Every possible character is in the vocabulary — no <unk> fallback needed.",
      },
      {
        feature: "Lossless round-trip",
        supported: false,
        plannedVersion: "V2",
        notes: "Character-level encoding guarantees perfect reconstruction of original text.",
      },
    ],
    pipelineStages: [],
    compatibleWith: ["word-tokenizer"],
    futureVersion: "V3",
  },
  {
    id: "bpe",
    name: "BPE",
    version: "V3",
    status: "planned",
    description:
      "Byte-Pair Encoding. Iteratively merges the most frequent token pair — the foundational subword algorithm behind GPT-2.",
    features: [
      {
        feature: "Subword granularity",
        supported: false,
        plannedVersion: "V3",
        notes: "Tokens represent common subword units rather than full words or single characters.",
      },
      {
        feature: "Frequency-driven merges",
        supported: false,
        plannedVersion: "V3",
        notes: "Merge rules are learned from corpus statistics — most frequent pairs merge first.",
      },
      {
        feature: "Configurable vocabulary size",
        supported: false,
        plannedVersion: "V3",
        notes: "The only hyperparameter: target vocabulary size determines merge iterations.",
      },
      {
        feature: "Trainable on any corpus",
        supported: false,
        plannedVersion: "V3",
        notes: "Language-agnostic — same algorithm works for English, Chinese, code, etc.",
      },
    ],
    pipelineStages: [],
    compatibleWith: ["character-tokenizer"],
    futureVersion: "V4",
  },
  {
    id: "byte-level-bpe",
    name: "Byte-Level BPE",
    version: "V4",
    status: "planned",
    description:
      "BPE over bytes instead of Unicode code-points. Guarantees every input is tokenizable — used by GPT-3/4 and modern LLMs.",
    features: [
      {
        feature: "Byte-level base vocabulary (256)",
        supported: false,
        plannedVersion: "V4",
        notes: "Base vocabulary is exactly the 256 byte values — no character-level ambiguity.",
      },
      {
        feature: "Universal tokenizability",
        supported: false,
        plannedVersion: "V4",
        notes: "Every possible input, including malformed Unicode, maps to a valid token sequence.",
      },
      {
        feature: "Multi-lingual out of the box",
        supported: false,
        plannedVersion: "V4",
        notes: "No per-language vocabulary customization needed — bytes are universal.",
      },
      {
        feature: "Unicode robustness",
        supported: false,
        plannedVersion: "V4",
        notes: "Emoji, rare scripts, and combining characters all handled transparently.",
      },
    ],
    pipelineStages: [],
    compatibleWith: ["bpe"],
    futureVersion: "V5",
  },
  {
    id: "minimind-compatible",
    name: "MiniMind Compatible",
    version: "V5",
    status: "planned",
    description:
      "A minimal, trainable subword tokenizer built from scratch for the MiniMind Transformer stack. BPE core + special-token handling + streaming encode.",
    features: [
      {
        feature: "BPE core with trainable merges",
        supported: false,
        plannedVersion: "V5",
        notes: "Full BPE implementation with configurable vocabulary size and merge training.",
      },
      {
        feature: "Special tokens: <pad> <unk> <bos> <eos>",
        supported: false,
        plannedVersion: "V5",
        notes: "Standard special token set compatible with the MiniMind embedding layer.",
      },
      {
        feature: "Streaming encode for long inputs",
        supported: false,
        plannedVersion: "V5",
        notes: "Incremental encoding that doesn't require holding the full input in memory.",
      },
      {
        feature: "Compact vocabulary (~5K entries)",
        supported: false,
        plannedVersion: "V5",
        notes: "Vocabulary sized for 26M-parameter models — balances coverage vs embedding cost.",
      },
      {
        feature: "Directly compatible with MiniMind embedding layer",
        supported: false,
        plannedVersion: "V5",
        notes: "Output token IDs map 1:1 to embedding table rows with no remapping needed.",
      },
    ],
    pipelineStages: [],
    compatibleWith: ["byte-level-bpe"],
    futureVersion: null,
  },
];

// ============================================================
// Convenience: combined feature array (all views)
// ============================================================

/** Complete feature matrix — every feature from both views, deduplicated. */
export const ALL_TOKENIZER_FEATURES: TaggedTokenizerFeature[] = [
  ...EDUCATIONAL_FEATURES,
  ...MINIMIND_FEATURES,
];

// ============================================================
// Convenience: V1 pipeline stages (the active pipeline)
// ============================================================

/** Canonical pipeline stage definitions for the active V1 tokenizer. */
export function getV1PipelineStages(): PipelineStageDef[] {
  return V1_PIPELINE_STAGES;
}

// ============================================================
// Backward compatibility: keep existing TokenizerEntry exports
// for any consumers that may depend on the legacy format
// ============================================================

export interface TokenizerEntry {
  /** Semantic version label (e.g. "V1", "V2") */
  version: string;
  /** Human-readable display name */
  name: string;
  /** Lifecycle status */
  status: "active" | "planned" | "legacy";
  /** One-line summary */
  description: string;
  /** Key capabilities — used for comparison tables */
  features: string[];
}

export const TOKENIZER_REGISTRY: TokenizerEntry[] = [
  {
    version: "V1",
    name: "Word Tokenizer",
    status: "active",
    description:
      "Whitespace-split + vocabulary lookup. Naive but transparent — perfect for learning the encode/decode round-trip.",
    features: [
      "Whitespace splitting",
      "Exact vocabulary match",
      "<unk> fallback for OOV words",
      "Deterministic encode → decode",
      "Real-time explain() pipeline",
    ],
  },
  {
    version: "—",
    name: "Character Tokenizer",
    status: "planned",
    description:
      "One token per character. Zero OOV rate but extremely long sequences — shows the vocabulary-size vs sequence-length trade-off.",
    features: [
      "Character-level granularity",
      "Zero unknown tokens",
      "Tiny vocabulary (~100 entries)",
      "Long sequence length",
      "Lossless round-trip",
    ],
  },
  {
    version: "—",
    name: "BPE",
    status: "planned",
    description:
      "Byte-Pair Encoding. Iteratively merges the most frequent token pair — the foundational subword algorithm behind GPT-2.",
    features: [
      "Subword granularity",
      "Frequency-driven merges",
      "Configurable vocabulary size",
      "Rare-word decomposition",
      "Trainable on any corpus",
    ],
  },
  {
    version: "—",
    name: "Byte-Level BPE",
    status: "planned",
    description:
      "BPE over bytes instead of Unicode code-points. Guarantees every input is tokenizable — used by GPT-3/4 and modern LLMs.",
    features: [
      "Byte-level base vocabulary (256)",
      "Universal tokenizability",
      "No <unk> token needed",
      "Multi-lingual out of the box",
      "Unicode robustness",
    ],
  },
  {
    version: "MiniMind",
    name: "MiniMind Compatible",
    status: "planned",
    description:
      "A minimal, trainable subword tokenizer built from scratch for the MiniMind Transformer stack. BPE core + special-token handling + streaming encode.",
    features: [
      "BPE core with trainable merges",
      "Special tokens: <pad> <unk> <bos> <eos>",
      "Streaming encode for long inputs",
      "Compact vocabulary (~5K entries)",
      "Directly compatible with MiniMind embedding layer",
    ],
  },
];
