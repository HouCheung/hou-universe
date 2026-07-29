// ============================================================
// MiniMind — visualization/types.ts
// ============================================================
// 可视化模块类型定义
//
// 定义 ForwardVisualAdapter 与 UI 组件之间的数据契约。
// 所有接口使用显式类型，禁止 any / Record<string, unknown> / 索引签名。
// 每个可空字段对应 VisualizationCapabilities 中的一个布尔标志。
// ============================================================

import type { ModelTrace } from "../model/types";

// ============================================================
// 核心：完整可视化 Trace
// ============================================================

/**
 * 单次 forward 的完整可视化 Trace
 *
 * ForwardVisualAdapter 对 ModelTrace 进行 enrich 后生成的统一数据结构。
 * 包含五个阶段的丰富数据以及各阶段的能力标志。
 * UI 组件只消费 VisualTrace，不直接依赖 ModelTrace 或任何核心模块。
 */
export interface VisualTrace {
  /** 原始 ModelTrace — 保留完整中间结果供调试使用 */
  raw: ModelTrace;
  /** Stage 1: Tokenizer 可视化数据 */
  tokenizer: TokenizerVisualData;
  /** Stage 2: Embedding 可视化数据 */
  embedding: EmbeddingVisualData;
  /** Stage 3: RoPE 可视化数据 */
  rope: RoPEVisualData;
  /** Stage 4: Transformer 可视化数据 — 每层一个元素 */
  transformer: TransformerVisualData[];
  /** Stage 5: LM Head 可视化数据 */
  lmHead: LMHeadVisualData;
  /** 各阶段可视化能力标志 — 决定 UI 渲染哪些子面板 */
  capabilities: VisualizationCapabilities;
}

// ============================================================
// Stage 1: Tokenizer
// ============================================================

/**
 * Tokenizer 阶段可视化数据
 *
 * 包含分词结果、token 详情和词汇表元信息。
 * 数据来源：ModelTrace.tokens、ModelTrace.tokenIds、
 * ModelTrace.inputText、model.getTokenizer().getVocabulary()。
 */
export interface TokenizerVisualData {
  /** Token 字符串数组 — Tokenizer.tokenize() 的输出 */
  tokens: string[];
  /** Token ID 数组 — Tokenizer.encode() 的输出 */
  tokenIds: number[];
  /** 原始输入文本 */
  inputText: string;
  /** 每个 token 的详细信息 */
  tokenDetails: TokenDetail[];
  /** 词汇表大小 */
  vocabSize: number;
}

/**
 * 单个 Token 的详细信息
 *
 * 用于 TokenizerStage 的 token 网格渲染，
 * 标识 token 是否存在、是否为特殊 token。
 */
export interface TokenDetail {
  /** Token 字符串 */
  token: string;
  /** Token ID */
  id: number;
  /** 是否存在于词汇表中 — false 表示回退为 <unk> */
  exists: boolean;
  /** 是否为特殊 token — <pad> / <unk> / <bos> / <eos> */
  isSpecial: boolean;
}

// ============================================================
// Stage 2: Embedding
// ============================================================

/**
 * Embedding 阶段可视化数据
 *
 * 包含嵌入向量矩阵、每位置统计信息和嵌入矩阵元信息。
 * 数据来源：ModelTrace.embeddings、ModelTrace.tokens、
 * model.getEmbedding().getMatrixInfo()。
 */
export interface EmbeddingVisualData {
  /** 嵌入向量矩阵 — [seqLen][dModel] */
  vectors: number[][];
  /** Model 维度 */
  dModel: number;
  /** 每个位置的向量统计信息 */
  vectorStats: VectorStat[];
  /** 嵌入矩阵元信息 */
  matrixInfo: EmbeddingMatrixInfo;
}

/**
 * 单个位置的向量统计信息
 *
 * 用于 EmbeddingStage 的向量详情面板，
 * 展示 min、max、mean、L2 范数等统计量。
 */
export interface VectorStat {
  /** Token 在序列中的位置索引 */
  tokenIndex: number;
  /** Token 字符串 */
  token: string;
  /** 向量元素最小值 */
  min: number;
  /** 向量元素最大值 */
  max: number;
  /** 向量元素均值 */
  mean: number;
  /** L2 范数（欧几里得长度） */
  l2Norm: number;
}

/**
 * 嵌入矩阵元信息
 *
 * 描述 Embedding 层的形状和参数量。
 * 数据来源：model.getEmbedding().getMatrixInfo()。
 */
export interface EmbeddingMatrixInfo {
  /** 词汇表大小 */
  vocabSize: number;
  /** 嵌入维度 */
  embeddingDim: number;
  /** 总参数量 = vocabSize × embeddingDim */
  totalParameters: number;
}

// ============================================================
// Stage 3: RoPE
// ============================================================

/**
 * RoPE 阶段可视化数据
 *
 * 包含旋转前后的向量、逐头逐位置的旋转轨迹和 RoPE 配置信息。
 * 数据来源：ModelTrace.embeddings（before）、ModelTrace.rotatedEmbeddings（after）、
 * model.getRoPE().rotate()（rotation traces）。
 */
export interface RoPEVisualData {
  /** 旋转前的向量 — [seqLen][dModel] */
  before: number[][];
  /** 旋转后的向量 — [seqLen][dModel] */
  after: number[][];
  /** 逐位置逐头的旋转轨迹 — [seqLen][numHeads] */
  rotationTraces: RoPERotationTrace[][];
  /** RoPE 配置摘要 */
  ropeConfig: RoPEConfigSummary;
}

/**
 * RoPE 配置摘要
 *
 * 描述 RoPE 的核心参数，用于 Level 1 概览展示。
 */
export interface RoPEConfigSummary {
  /** 每个头的维度 */
  headDim: number;
  /** 注意力头数量 */
  numHeads: number;
  /** RoPE theta 基数 — 控制频率衰减速度 */
  theta: number;
  /** 最大序列长度 */
  maxSeqLen: number;
}

/**
 * 单个位置单个头的 RoPE 旋转轨迹
 *
 * 记录旋转前后的范数变化和采样维度对的旋转信息。
 * 用于 RoPEStage 的 2D 旋转可视化。
 */
export interface RoPERotationTrace {
  /** Token 位置 */
  position: number;
  /** 头索引 */
  headIndex: number;
  /** 旋转前的 L2 范数 */
  normBefore: number;
  /** 旋转后的 L2 范数 */
  normAfter: number;
  /** 范数是否保持不变（理论应为 true） */
  normPreserved: boolean;
  /** 采样的维度对旋转轨迹 — 最多 8 对 */
  sampledPairs: DimPairTrace[];
}

/**
 * 单个维度对的旋转轨迹
 *
 * 记录一对 (2i, 2i+1) 维度在 RoPE 旋转前后的坐标变化。
 * 用于在 2D 平面上绘制旋转弧线。
 */
export interface DimPairTrace {
  /** 维度对索引 i（对应维度 2i 和 2i+1） */
  dimPairIndex: number;
  /** 偶数维度索引 */
  evenDim: number;
  /** 奇数维度索引 */
  oddDim: number;
  /** 旋转前的 (even, odd) 坐标 */
  before: [number, number];
  /** 旋转后的 (even, odd) 坐标 */
  after: [number, number];
  /** 旋转角度（弧度） */
  angle: number;
  /** 该维度对的 RoPE 频率 */
  frequency: number;
}

// ============================================================
// Stage 4: Transformer
// ============================================================

/**
 * 单个 Transformer Block 的可视化数据
 *
 * 包含概览统计、Attention trace（可空）和 FFN trace（可空）。
 * 数据来源：ModelTrace.blockTraces[i]（概览）、
 * block.getAttention().getAttentionTrace()（Attention）、
 * block.getFFN().getActivationTrace()（FFN）。
 */
export interface TransformerVisualData {
  /** Block 层索引（从 0 开始） */
  layerIndex: number;
  /** Block 概览统计 */
  overview: TransformerOverviewData;
  /** Attention 可视化数据 — 当 AttentionTrace 不可用时为 null */
  attention: AttentionVisualData | null;
  /** FFN 可视化数据 — 当 ActivationTrace 不可用时为 null */
  ffn: FFNVisualData | null;
}

/**
 * Transformer Block 概览统计
 *
 * 记录 Block 内各子阶段的范数和每 token 的变化量。
 * 用于 TransformerStage 的残差流可视化。
 */
export interface TransformerOverviewData {
  /** 序列长度 */
  seqLen: number;
  /** Model 维度 */
  dModel: number;
  /** Pre-Attention RMSNorm 输出的 Frobenius 范数 */
  attentionInputNorm: number;
  /** Attention 输出的 Frobenius 范数 */
  attentionOutputNorm: number;
  /** Attention 残差连接后的 Frobenius 范数 */
  afterAttentionResidualNorm: number;
  /** Pre-FFN RMSNorm 输出的 Frobenius 范数 */
  ffnInputNorm: number;
  /** FFN 输出的 Frobenius 范数 */
  ffnOutputNorm: number;
  /** FFN 残差连接后的 Frobenius 范数 */
  afterFFNResidualNorm: number;
  /** 每个 token 在该层的变化量（L2 范数） */
  tokenDeltas: number[];
}

/**
 * Attention 子层可视化数据
 *
 * 包含注意力权重、原始分数和每头熵值。
 * 数据来源：block.getAttention().getAttentionTrace()。
 */
export interface AttentionVisualData {
  /** 序列长度 */
  seqLen: number;
  /** 注意力头数量 */
  numHeads: number;
  /** 每个头的维度 */
  headDim: number;
  /** 注意力权重矩阵（softmax 后） — [numHeads][seqLen][seqLen] */
  attentionWeights: number[][][];
  /** 原始注意力分数（缩放后、softmax 前） — [numHeads][seqLen][seqLen] */
  rawScores: number[][][];
  /** 是否应用了 causal mask */
  causalMaskApplied: boolean;
  /** 每个头的熵值 — 衡量注意力集中度 */
  headEntropies: number[];
}

/**
 * FFN 子层可视化数据
 *
 * 包含门控激活值、门控后的隐藏表示和激活稀疏度。
 * 数据来源：block.getFFN().getActivationTrace()。
 */
export interface FFNVisualData {
  /** 序列长度 */
  seqLen: number;
  /** FFN 中间维度 */
  dFF: number;
  /** 门控激活值（SiLU 后、门控乘后） — [seqLen][dFF] */
  gateActivations: number[][];
  /** 门控后的隐藏表示 — [seqLen][dFF] */
  gatedHidden: number[][];
  /** 每个 token 的激活稀疏度 — gate 值接近零的比例 */
  activationSparsity: number[];
}

// ============================================================
// Stage 5: LM Head
// ============================================================

/**
 * LM Head 阶段可视化数据
 *
 * 包含 logits、概率分布、Top-K 预测和分布统计。
 * 数据来源：ModelTrace.logits、ModelTrace.hiddenStates[last]、
 * model.getLMHead().getWeights()、model.getTokenizer().getVocabulary()。
 */
export interface LMHeadVisualData {
  /** 原始 logits 向量 — [vocabSize] */
  logits: number[];
  /** Softmax 概率分布 — [vocabSize]（由 adapter 计算） */
  probabilities: number[];
  /** Top-K 预测结果（含 token 标签） */
  topPredictions: TokenPrediction[];
  /** Logits 分布统计信息 */
  distribution: LogitsDistribution;
  /** 最后一个 token 的隐藏状态 — [dModel] */
  lastHiddenState: number[];
}

/**
 * 单个 Token 预测结果
 *
 * 按概率降序排列，包含 token 标签和分数。
 */
export interface TokenPrediction {
  /** 排名（从 1 开始） */
  rank: number;
  /** Token ID */
  tokenId: number;
  /** Token 字符串 */
  token: string;
  /** 原始 logit 值 */
  logit: number;
  /** Softmax 概率 */
  probability: number;
}

/**
 * Logits 分布统计信息
 *
 * 描述 logits 向量的整体分布特征。
 */
export interface LogitsDistribution {
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 均值 */
  mean: number;
  /** 标准差 */
  stdDev: number;
  /** 熵值 — 衡量预测的不确定性 */
  entropy: number;
}

// ============================================================
// Visualization Capabilities（可视化能力标志）
// ============================================================

/**
 * 各阶段可视化能力标志
 *
 * 每个字段对应一个阶段，内部布尔值指示该阶段的子功能是否可用。
 * adapter 仅在成功获取对应 trace 数据时将标志设为 true，
 * 所有字段默认均为 false。
 * UI 组件根据这些标志决定渲染哪些子面板。
 */
export interface VisualizationCapabilities {
  /** Tokenizer 阶段能力 */
  tokenizer: TokenizerCapabilities;
  /** Embedding 阶段能力 */
  embedding: EmbeddingCapabilities;
  /** RoPE 阶段能力 */
  rope: RoPECapabilities;
  /** Transformer 阶段能力 */
  transformer: TransformerCapabilities;
  /** LM Head 阶段能力 */
  lmHead: LMHeadCapabilities;
}

/**
 * Tokenizer 阶段可视化能力
 */
export interface TokenizerCapabilities {
  /** 是否可展示 token 列表 */
  tokenList: boolean;
  /** 是否可浏览词汇表 */
  vocabExplorer: boolean;
}

/**
 * Embedding 阶段可视化能力
 */
export interface EmbeddingCapabilities {
  /** 是否可展示向量查看器 */
  vectorViewer: boolean;
  /** 是否可展示矩阵热力图 */
  matrixHeatmap: boolean;
  /** 是否可展示统计面板 */
  statsPanel: boolean;
}

/**
 * RoPE 阶段可视化能力
 */
export interface RoPECapabilities {
  /** 是否可展示 2D 旋转视图 */
  rotation2DView: boolean;
  /** 是否可展示范数检查 */
  normCheck: boolean;
  /** 是否可展示频率图表 */
  frequencyChart: boolean;
}

/**
 * Transformer 阶段可视化能力
 */
export interface TransformerCapabilities {
  /** 是否可展示注意力热力图 */
  attentionHeatmap: boolean;
  /** 是否可展示注意力头多样性 */
  attentionHeadDiversity: boolean;
  /** 是否可展示 FFN 门控分布 */
  ffnGateDistribution: boolean;
  /** 是否可展示残差流图表 */
  residualFlowChart: boolean;
}

/**
 * LM Head 阶段可视化能力
 */
export interface LMHeadCapabilities {
  /** 是否可展示 logits 直方图 */
  logitsHistogram: boolean;
  /** 是否可展示 Top-K 排名 */
  topKRanking: boolean;
  /** 是否可展示概率分布 */
  probabilityDistribution: boolean;
}
