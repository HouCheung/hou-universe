// ============================================================
// MiniMind — pipeline/types.ts
// ============================================================
// Pipeline 层类型定义
//
// 定义 MiniMindPipeline.forward() 的完整输出结构，
// 统一连接 Text → Tokenizer → Token IDs → Embedding → Vectors
// 的数据流。
// ============================================================

import type { EmbeddingVector } from "../embedding/types";

/**
 * PipelineResult — forward() 方法的完整返回结构
 *
 * 一次 forward() 调用即可获得从原始文本到稠密向量的
 * 完整数据流，每一层的结果都清晰可见。
 *
 * 数据流：
 *   inputText  →  tokens  →  tokenIds  →  embeddings
 *   (string)      (string[])  (number[])    (EmbeddingVector[])
 *
 * 使用场景：
 *   - Playground 中逐层可视化 Text → Vector 的完整链路
 *   - AI Lab 中调试 tokenization 与 embedding 的衔接
 *   - 教学演示：直观理解 "文字如何变成数字"
 */
export interface PipelineResult {
  /** 原始输入文本 */
  inputText: string;

  /** tokenize() 输出的 token 字符串数组 */
  tokens: string[];

  /** encode() 输出的 token ID 数组 */
  tokenIds: number[];

  /** getEmbeddings() 输出的稠密向量数组（每个 token 对应一个向量） */
  embeddings: EmbeddingVector[];

  /** Embedding 向量的维度（d_model），所有 embeddings[i] 长度一致 */
  vectorDimension: number;
}
