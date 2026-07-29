// ============================================================
// MiniMind — embedding/types.ts
// ============================================================
// Embedding 模块类型定义
//
// 为 MiniEmbedding 提供统一的数据结构，
// 供 Playground 和 AI Lab 消费。
// ============================================================

/**
 * Embedding 层配置
 *
 * 定义 embedding 矩阵的核心维度参数。
 * 与 `src/data/minimind/embedding-registry.ts` 中的
 * EmbeddingDimensionConfig 语义一致。
 */
export interface EmbeddingConfig {
  /** 词汇表大小 — embedding 矩阵的行数 */
  vocabSize: number;
  /** Embedding 维度 — 每个 token 向量的宽度（d_model） */
  embeddingDim: number;
}

/**
 * 单个 token 的稠密向量表示
 *
 * 长度为 embeddingDim 的浮点数组，
 * 每一位（dimension）都参与语义编码。
 */
export type EmbeddingVector = number[];

/**
 * 完整 embedding 矩阵
 *
 * 形状：[vocabSize × embeddingDim]
 * 每一行是一个 token 的语义向量，
 * 所有行共同构成语义空间。
 */
export type EmbeddingMatrix = number[][];
