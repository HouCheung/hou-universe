// ============================================================
// MiniMind — transformer/types.ts
// ============================================================
// Transformer 模块类型定义
//
// 为 MiniTransformerBlock 提供统一的数据结构，
// 供 Playground 和 AI Lab 消费。
// ============================================================

/**
 * Transformer Block 配置
 *
 * 定义单个 Decoder Block 的核心参数。
 * 与 `src/data/minimind/transformer-registry.ts` 中的
 * TransformerArchitectureConfig 语义一致。
 */
export interface TransformerConfig {
  /** Model 维度 — 隐藏表示的宽度 */
  dModel: number;
  /** 注意力头数量 */
  numHeads: number;
  /** 每个头的维度 = dModel / numHeads */
  headDim: number;
  /** FFN 中间维度 — 通常为 dModel 的 4 倍 */
  dFF: number;
  /** 最大序列长度 — 用于形状验证 */
  maxSeqLen: number;
  /** 归一化 epsilon — 防止除零 */
  normEps: number;
}

/**
 * Transformer Block 前向传播的输入
 *
 * 包含隐藏状态和可选的 attention mask。
 * hiddenStates 来自 Embedding 层或前一个 Block 的输出。
 */
export interface TransformerInput {
  /** 隐藏状态矩阵 — [seqLen, dModel] */
  hiddenStates: number[][];
  /** 可选的 attention mask — [seqLen, seqLen] 或 "causal" */
  mask?: number[][] | "causal" | null;
}

/**
 * Transformer Block 前向传播的输出
 *
 * 封装了最终输出和完整的 block trace 信息。
 */
export interface TransformerOutput {
  /** 输出矩阵 — [seqLen, dModel]，与输入同形状 */
  output: number[][];
  /** 完整的 block trace（用于可视化和调试） */
  trace: TransformerTrace;
}

/**
 * 单次 forward 的完整 Transformer Block Trace
 *
 * 包含从 RMSNorm → Attention → Residual → RMSNorm → FFN → Residual
 * 的完整中间结果，供 Playground 可视化 Block 计算流程。
 */
export interface TransformerTrace {
  /** 输入序列长度 */
  seqLen: number;
  /** Model 维度 */
  dModel: number;
  /** FFN 中间维度 */
  dFF: number;
  /** ── Attention 子层 ── */
  /** Pre-Attention RMSNorm 输出 — [seqLen, dModel] */
  normedForAttention: number[][];
  /** Attention 输出 — [seqLen, dModel] */
  attentionOutput: number[][];
  /** 第一次残差连接后的结果 — [seqLen, dModel] */
  afterAttentionResidual: number[][];
  /** ── FFN 子层 ── */
  /** Pre-FFN RMSNorm 输出 — [seqLen, dModel] */
  normedForFFN: number[][];
  /** FFN 输出 — [seqLen, dModel] */
  ffnOutput: number[][];
  /** 第二次残差连接后的结果（最终输出） — [seqLen, dModel] */
  afterFFNResidual: number[][];
}
