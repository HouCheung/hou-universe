// ============================================================
// MiniMind — attention/types.ts
// ============================================================
// Attention 模块类型定义
//
// 为 MiniAttention 提供统一的数据结构，
// 供 Playground 和 AI Lab 消费。
// ============================================================

/**
 * Attention 层配置
 *
 * 定义 Multi-Head Attention 的核心参数。
 * 与 `src/data/minimind/attention-registry.ts` 中的
 * AttentionDimensionConfig 语义一致。
 */
export interface AttentionConfig {
  /** Model 维度 — 输入/输出向量的宽度 */
  dModel: number;
  /** 注意力头数量 — dModel 必须能被 numHeads 整除 */
  numHeads: number;
  /** 每个头的维度 = dModel / numHeads */
  headDim: number;
  /** 最大序列长度 — 用于 causal mask 预计算 */
  maxSeqLen: number;
}

/**
 * Attention 前向传播的输入
 *
 * 包含 Q/K/V 向量和可选的 attention mask。
 * 当 Q/K/V 形状为 [seqLen, dModel] 时，
 * 内部自动通过 W_Q/W_K/W_V 投影并分头。
 */
export interface AttentionInput {
  /** Query 输入 — [seqLen, dModel] 或 [numHeads, seqLen, headDim] */
  queries: number[][];
  /** Key 输入 — 形状同 queries */
  keys: number[][];
  /** Value 输入 — 形状同 queries */
  values: number[][];
  /** 可选的 attention mask — [seqLen, seqLen]（值为 0 的位置被屏蔽），
   *  或 "causal" 字符串启用因果掩码 */
  mask?: number[][] | "causal" | null;
}

/**
 * 单个 token 对的 attention score 记录
 *
 * 用于 Playground 中逐对展示 attention 计算过程。
 */
export interface AttentionScore {
  /** Query 位置（行） */
  queryIndex: number;
  /** Key 位置（列） */
  keyIndex: number;
  /** 原始内积分数 Q_i · K_j */
  rawScore: number;
  /** 缩放后的分数 = rawScore / sqrt(d_k) */
  scaledScore: number;
  /** Softmax 后的权重（仅当 masked=false 时有意义） */
  weight: number;
  /** 是否被 mask 屏蔽 */
  masked: boolean;
}

/**
 * 单次 forward 的完整 Attention Trace
 *
 * 包含从原始分数到最终输出的一整套中间结果，
 * 供 Playground 可视化 attention 计算流程。
 */
export interface AttentionTrace {
  /** 输入序列长度 */
  seqLen: number;
  /** 头数量 */
  numHeads: number;
  /** 每头维度 */
  headDim: number;
  /** 缩放因子 sqrt(d_k) */
  scaleFactor: number;
  /** 逐头的原始 attention scores — [numHeads][seqLen][seqLen] */
  rawScores: number[][][];
  /** 逐头的 attention weights (softmax 后) — [numHeads][seqLen][seqLen] */
  attentionWeights: number[][][];
  /** 逐头的输出 — [numHeads][seqLen][headDim] */
  headOutputs: number[][][];
  /** 合并后的最终输出 — [seqLen][dModel] */
  output: number[][];
  /** 是否应用了 causal mask */
  causalMaskApplied: boolean;
}

/**
 * Attention 的完整前向传播结果
 *
 * 封装了最终输出和完整的 trace 信息。
 */
export interface AttentionOutput {
  /** 合并后的输出 — [seqLen, dModel] */
  output: number[][];
  /** 完整的 attention trace（用于可视化和调试） */
  trace: AttentionTrace;
}
