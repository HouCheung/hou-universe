// ============================================================
// MiniMind — ffn/types.ts
// ============================================================
// FFN 模块类型定义
//
// 为 MiniFeedForward 提供统一的数据结构，
// 供 Playground 和 AI Lab 消费。
// ============================================================

/**
 * FFN 层配置
 *
 * 定义 SwiGLU Feed-Forward Network 的核心参数。
 * 与 `src/data/minimind/ffn-registry.ts` 中的
 * FFNDimensionConfig 语义一致。
 */
export interface FFNConfig {
  /** Model 维度 — 输入/输出向量的宽度 */
  dModel: number;
  /** FFN 中间隐藏维度 — 通常为 dModel 的 4 倍 */
  dFF: number;
  /** 最大序列长度 — 用于输入形状验证 */
  maxSeqLen: number;
}

/**
 * FFN 前向传播的输入
 *
 * 包含经过 Attention + 残差 + LayerNorm 的 token 表示。
 * 每个 token 独立处理（position-wise），无跨 token 交互。
 */
export interface FFNInput {
  /** 输入矩阵 — [seqLen, dModel] */
  hiddenStates: number[][];
}

/**
 * FFN 前向传播的输出
 *
 * 封装了最终输出和完整的 activation trace 信息。
 */
export interface FFNOutput {
  /** 输出矩阵 — [seqLen, dModel]，与输入同形状 */
  output: number[][];
  /** 完整的 activation trace（用于可视化和调试） */
  trace: ActivationTrace;
}

/**
 * 单次 forward 的完整 FFN Activation Trace
 *
 * 包含从 Gate/Up 投影到最终输出的完整中间结果，
 * 供 Playground 可视化 SwiGLU FFN 计算流程。
 */
export interface ActivationTrace {
  /** 输入序列长度 */
  seqLen: number;
  /** Model 维度 */
  dModel: number;
  /** FFN 中间维度 */
  dFF: number;
  /** Gate 投影输出 — [seqLen][dFF] */
  gateProjection: number[][];
  /** SiLU 激活后的 Gate 值 — [seqLen][dFF] */
  gateActivation: number[][];
  /** Up 投影输出 — [seqLen][dFF] */
  upProjection: number[][];
  /** 门控乘法结果 (gate ⊙ up) — [seqLen][dFF] */
  gatedHidden: number[][];
  /** Down 投影输出 — [seqLen][dModel] 最终输出 */
  output: number[][];
}
