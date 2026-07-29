// ============================================================
// MiniMind — model/types.ts
// ============================================================
// Model 模块类型定义
//
// 为 MiniMindModel 提供统一的数据结构，
// 供 Playground 和 AI Lab 消费。
// ============================================================

import type { TransformerTrace } from "../transformer/types";

/**
 * MiniMind Model 完整配置
 *
 * 扩展 Transformer Block 配置，加入
 * 词汇表大小、层数和 RoPE theta，
 * 形成完整的模型定义。
 */
export interface ModelConfig {
  /** 词汇表大小 — 决定 Embedding 和 LM Head 的维度 */
  vocabSize: number;
  /** Model 维度 — 隐藏表示的宽度 */
  dModel: number;
  /** 注意力头数量 — dModel 必须能被 numHeads 整除 */
  numHeads: number;
  /** 每个头的维度 = dModel / numHeads */
  headDim: number;
  /** FFN 中间维度 — 通常为 dModel 的 4 倍 */
  dFF: number;
  /** Transformer Block 层数 */
  numLayers: number;
  /** 最大序列长度 — 用于形状验证 */
  maxSeqLen: number;
  /** 归一化 epsilon — 防止除零 */
  normEps: number;
  /** RoPE theta 基数 — 控制频率衰减速度 */
  ropeTheta: number;
}

/**
 * Model 前向传播的输入
 *
 * 包含原始文本和可选的 attention mask 控制。
 */
export interface ModelInput {
  /** 原始输入文本 */
  inputText: string;
  /** 是否启用 causal mask，默认 true */
  causalMask?: boolean;
}

/**
 * Model 前向传播的输出
 *
 * 封装了 logits、最终隐藏状态和完整的 model trace。
 */
export interface ModelOutput {
  /** 词表大小的 logits 向量 — [vocabSize]（取最后一个 token 的 hidden state） */
  logits: number[];
  /** 最终隐藏状态 — [seqLen, dModel]（最后一个 Block 的输出） */
  hiddenStates: number[][];
  /** 完整的模型 trace — 用于可视化和调试 */
  trace: ModelTrace;
}

/**
 * 单次 forward 的完整 Model Trace
 *
 * 从 Text → Tokens → Embeddings → RoPE → Transformer → Logits
 * 的完整中间结果，供 Playground 可视化全流程。
 *
 * 教育设计：
 *   - 每一步的输入/输出都可单独检查
 *   - 支持逐阶段的数据流可视化
 *   - 所有中间结果保留完整精度
 */
export interface ModelTrace {
  /** 原始输入文本 */
  inputText: string;
  /** Token 数组 — Tokenizer.tokenize() 的输出 */
  tokens: string[];
  /** Token ID 数组 — Tokenizer.encode() 的输出 */
  tokenIds: number[];
  /** Embedding 输出 — [seqLen, dModel] */
  embeddings: number[][];
  /** RoPE 旋转后的向量 — [seqLen, dModel]（位置信息已注入） */
  rotatedEmbeddings: number[][];
  /** 序列长度 */
  seqLen: number;
  /** Model 维度 */
  dModel: number;
  /** 每个 Transformer Block 的 trace — blockTraces[i] 是第 i 层的 trace */
  blockTraces: TransformerTrace[];
  /** 最终隐藏状态 — [seqLen, dModel]（最后一个 Block 的输出） */
  hiddenStates: number[][];
  /** LM Head 输出的 logits — [vocabSize]（最后一个 token 的预测分数） */
  logits: number[];
}
