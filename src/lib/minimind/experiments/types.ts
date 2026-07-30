// ============================================================
// MiniMind — experiments/types.ts
// ============================================================
// Experiment Runtime Layer — 类型定义
//
// 定义 ExperimentRunner 与 ExperimentContext 之间的数据契约。
// 所有接口使用显式类型，禁止 any / Record<string, unknown> / 索引签名。
// 每个实验拥有独立的输入/输出类型，通过 ExperimentResult 泛型统一包装。
//
// 设计原则：
//   - 每个实验拥有专属的 Data 接口（TokenizerComparisonData 等）
//   - ExperimentResult<T> 是统一的结果包装器
//   - ExperimentContext 是纯值对象，持有模块实例引用
//   - 所有类型零依赖 — 不导入任何运行时模块
// ============================================================

import type { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import type { MiniEmbedding } from "../embedding/Embedding";
import type { MiniAttention } from "../attention/Attention";

// ============================================================
// CharacterTokenizer — 实验专用的轻量级字符级分词器
// ============================================================

/**
 * CharacterTokenizer 公开接口
 *
 * 与 MiniTokenizer 保持方法签名一致（子集），
 * 确保 TokenizerComparisonRunner 可以统一调用两者。
 * 仅暴露实验所需的方法。
 */
export interface ICharacterTokenizer {
  /** 按字符切分文本 */
  tokenize(text: string): string[];
  /** 编码文本为 ID 序列 */
  encode(text: string): number[];
  /** 将 ID 序列解码为文本 */
  decode(ids: number[]): string;
  /** 获取词汇表信息 */
  getVocabulary(): {
    size: number;
    tokenToId: ReadonlyMap<string, number>;
    idToToken: ReadonlyMap<number, string>;
  };
}

// ============================================================
// ExperimentContext — 实验上下文（值对象）
// ============================================================

/**
 * 实验上下文
 *
 * 由 createExperimentContext() 工厂函数创建，
 * 根据实验的 dataRequirements 注入所需模块实例。
 * 未使用的模块字段为 null — 运行前由 runner 校验。
 *
 * 设计原则：
 *   - 纯值对象 — 不包含任何方法
 *   - 显式可空 — 每个字段独立标记 null
 *   - 类型安全 — runner 通过 experimentId 知晓哪些字段非空
 */
export interface ExperimentContext {
  /** 实验 ID — 与 MiniMindExperiment.id 一致 */
  experimentId: string;
  /** MiniTokenizer 实例 — 词级分词器 */
  tokenizer: MiniTokenizer | null;
  /** CharacterTokenizer 实例 — 字符级分词器 */
  charTokenizer: ICharacterTokenizer | null;
  /** MiniEmbedding 实例 — 嵌入引擎 */
  embedding: MiniEmbedding | null;
  /** MiniAttention 实例 — 多头注意力引擎 */
  attention: MiniAttention | null;
}

/**
 * 实验模块配置 — 传递给工厂函数的可选配置覆盖
 *
 * 每个字段为对应模块构造所需的最小配置子集。
 * 未提供的字段使用默认值。
 */
export interface ExperimentModuleConfig {
  /** Embedding 配置 */
  embedding?: {
    vocabSize: number;
    embeddingDim: number;
  };
  /** Attention 配置 */
  attention?: {
    dModel: number;
    numHeads: number;
    headDim: number;
    maxSeqLen: number;
  };
}

// ============================================================
// ExperimentResult — 统一的结果包装器
// ============================================================

/**
 * 实验错误信息
 *
 * 记录实验中单个步骤的失败详情。
 * 用于 ExperimentResult.errors 数组。
 */
export interface ExperimentError {
  /** 出错的步骤/阶段标识 */
  phase: string;
  /** 错误描述 */
  message: string;
  /** 原始错误（如果有） */
  cause?: string;
}

/**
 * 实验计时信息
 */
export interface ExperimentTiming {
  /** 开始时间戳（ms，performance.now()） */
  startMs: number;
  /** 结束时间戳（ms） */
  endMs: number;
  /** 耗时（ms） */
  durationMs: number;
}

/**
 * 统一的实验结果包装器
 *
 * 泛型参数 TData 为各实验专属的数据类型。
 * status 指示实验执行状态：
 *   - "success"  — 所有步骤成功，data 非 null
 *   - "partial"  — 部分步骤失败，data 可能部分填充
 *   - "failed"   — 关键步骤失败，data 为 null
 *
 * 设计原则：
 *   - 与 ForwardVisualAdapter.capabilities 模式对齐 —
 *     status 对应整体成功/失败，errors 记录细粒度故障
 *   - timing 始终存在 — 即使失败也记录耗时
 *   - data 可空 — 消费者通过 status 判断是否可用
 */
export interface ExperimentResult<TData = unknown> {
  /** 实验 ID — 与 MiniMindExperiment.id 一致 */
  experimentId: string;
  /** 执行状态 */
  status: "success" | "partial" | "failed";
  /** 实验产出数据 — status 为 "failed" 时为 null */
  data: TData | null;
  /** 错误列表 — 记录每个失败步骤 */
  errors: ExperimentError[];
  /** 计时信息 */
  timing: ExperimentTiming;
}

// ============================================================
// ExperimentRunner — 运行器接口
// ============================================================

/**
 * 实验运行器接口
 *
 * 每个实验实现一个 runner 类，实现此接口。
 * Runner 负责：
 *   1. 从 ExperimentContext 提取所需模块
 *   2. 校验必需模块非空
 *   3. 执行实验逻辑
 *   4. 收集结果并包装为 ExperimentResult
 *
 * 设计原则：
 *   - 单一职责 — 一个 runner = 一个实验
 *   - 显式泛型 — TInput / TData 按实验定义
 *   - 优雅降级 — 每个步骤独立 try/catch
 */
export interface ExperimentRunner<TInput = unknown, TData = unknown> {
  /** 实验 ID — 必须与 MiniMindExperiment.id 一致 */
  readonly experimentId: string;

  /**
   * 执行实验
   *
   * @param context — 实验上下文（包含所需模块实例）
   * @param input   — 实验输入（各实验自行定义）
   * @returns        统一的实验结果包装器
   */
  run(context: ExperimentContext, input: TInput): ExperimentResult<TData>;
}

// ============================================================
// Experiment 1: Tokenizer Comparison — 输入/输出类型
// ============================================================

/**
 * TokenizerComparison 输入
 */
export interface TokenizerComparisonInput {
  /** 待分词的输入文本 */
  text: string;
}

/**
 * 单个分词器的运行结果摘要
 */
export interface TokenizerRunSummary {
  /** 分词器名称 */
  tokenizerName: string;
  /** Token 数组 */
  tokens: string[];
  /** Token ID 数组 */
  tokenIds: number[];
  /** 解码后的往返文本 */
  decoded: string;
  /** 词汇表大小 */
  vocabSize: number;
  /** 未知 token 数量 */
  unknownCount: number;
  /** Token 总数 */
  tokenCount: number;
}

/**
 * 对比指标
 */
export interface TokenizerComparisonMetrics {
  /** MiniTokenizer 的 token 数量 */
  miniTokenCount: number;
  /** CharacterTokenizer 的 token 数量 */
  charTokenCount: number;
  /** Token 数量比值 = charTokenCount / miniTokenCount */
  tokenRatio: number;
  /** MiniTokenizer 的未知 token 率 = unknownCount / tokenCount */
  miniUnknownRate: number;
  /** CharacterTokenizer 的未知 token 率 */
  charUnknownRate: number;
}

/**
 * TokenizerComparison 实验产出数据
 */
export interface TokenizerComparisonData {
  /** 原始输入文本 */
  inputText: string;
  /** MiniTokenizer（词级）运行结果 */
  miniTokenizer: TokenizerRunSummary;
  /** CharacterTokenizer（字符级）运行结果 */
  charTokenizer: TokenizerRunSummary;
  /** 对比指标 */
  comparison: TokenizerComparisonMetrics;
}

// ============================================================
// Experiment 2: Embedding Explorer — 输入/输出类型
// ============================================================

/**
 * EmbeddingExplorer 输入
 */
export interface EmbeddingExplorerInput {
  /** 查询模式 */
  mode: "lookup" | "similarity";
  /** 单 token 查询 — mode === "lookup" 时必填 */
  tokenId?: number;
  /** 多 token 查询 — mode === "lookup" 且批量时使用 */
  tokenIds?: number[];
  /** Token 对相似度 — mode === "similarity" 时必填 */
  tokenPair?: {
    tokenA: string;
    tokenB: string;
  };
}

/**
 * 单 token 的向量信息
 */
export interface EmbeddingVectorInfo {
  /** Token ID */
  tokenId: number;
  /** Token 字符串 */
  token: string;
  /** 嵌入向量 — [embeddingDim] */
  vector: number[];
  /** 向量统计 */
  stats: {
    min: number;
    max: number;
    mean: number;
    l2Norm: number;
  };
}

/**
 * Token 对相似度结果
 */
export interface TokenSimilarity {
  /** Token A 字符串 */
  tokenA: string;
  /** Token A ID */
  tokenAId: number;
  /** Token B 字符串 */
  tokenB: string;
  /** Token B ID */
  tokenBId: number;
  /** 余弦相似度 — [-1, 1] */
  cosineSimilarity: number;
}

/**
 * EmbeddingExplorer 实验产出数据
 */
export interface EmbeddingExplorerData {
  /** 查询模式 */
  mode: "lookup" | "similarity";
  /** 嵌入矩阵元信息 */
  matrixInfo: {
    vocabSize: number;
    embeddingDim: number;
    totalParameters: number;
  };
  /** 查询的向量信息 — mode === "lookup" 时填充 */
  vectors?: EmbeddingVectorInfo[];
  /** Token 对相似度 — mode === "similarity" 时填充 */
  similarities?: TokenSimilarity[];
}

// ============================================================
// Experiment 3: Attention Heatmap — 输入/输出类型
// ============================================================

/**
 * AttentionHeatmap 输入
 */
export interface AttentionHeatmapInput {
  /** 输入序列 — 作为 Q/K/V（自注意力模式） */
  sequence: number[][];
  /** 可选：指定关注的注意力头索引（默认全部） */
  headIndices?: number[];
  /** 是否应用 causal mask */
  causalMask?: boolean;
}

/**
 * 单个注意力头的热力图数据
 */
export interface HeadHeatmapData {
  /** 头索引 */
  headIndex: number;
  /** 注意力权重矩阵 — [seqLen][seqLen] */
  weights: number[][];
  /** 原始分数矩阵 — [seqLen][seqLen] */
  rawScores: number[][];
  /** 该头的熵值 — 衡量注意力集中度 */
  entropy: number;
}

/**
 * AttentionHeatmap 实验产出数据
 */
export interface AttentionHeatmapData {
  /** 序列长度 */
  seqLen: number;
  /** 头数量 */
  numHeads: number;
  /** 每头维度 */
  headDim: number;
  /** 是否应用了 causal mask */
  causalMaskApplied: boolean;
  /** 每头注意力数据 */
  heads: HeadHeatmapData[];
  /** 头多样性指标 — 每对头之间的权重矩阵相关性 */
  headDiversity?: {
    /** 头对之间的 Frobenius 内积归一化相似度 */
    pairwiseSimilarity: number[][];
  };
}
