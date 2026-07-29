// ============================================================
// MiniMind — MiniMindPipeline.ts
// ============================================================
// MiniMindPipeline V1 — 统一 Forward Pipeline
//
// 核心职责：
//   将 Text → Tokenizer → Token IDs → Embedding → Vectors
//   串联为一个完整的 forward pipeline。
//
// 设计原则：
//   - 依赖注入：构造时传入 MiniTokenizer + MiniEmbedding
//   - 单一职责：只做编排，不重新实现 tokenizer / embedding
//   - 透明直通：每一层的结果都完整保留在 PipelineResult 中
//
// 使用方式：
//
// ```ts
// const tokenizer = new MiniTokenizer();
// tokenizer.addToken("Hello");
// tokenizer.addToken("World");
//
// const embedding = new MiniEmbedding({ vocabSize: 8, embeddingDim: 512 });
//
// const pipeline = new MiniMindPipeline(tokenizer, embedding);
// const result = pipeline.forward("Hello World");
// // → { inputText, tokens, tokenIds, embeddings, vectorDimension }
// ```
// ============================================================

import type { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import type { MiniEmbedding } from "../embedding/Embedding";
import type { PipelineResult } from "./types";

export class MiniMindPipeline {
  private tokenizer: MiniTokenizer;
  private embedding: MiniEmbedding;

  /**
   * @param tokenizer — MiniTokenizer 实例（可预先注册自定义 token）
   * @param embedding — MiniEmbedding 实例（vocabSize 需覆盖 tokenizer 的词汇量）
   *
   * 构造时不执行任何计算，仅保存引用。
   * 所有计算在 forward() 调用时按需执行。
   */
  constructor(tokenizer: MiniTokenizer, embedding: MiniEmbedding) {
    this.tokenizer = tokenizer;
    this.embedding = embedding;
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * forward(text) — 执行完整的 forward pipeline
   *
   * 数据流：
   *
   *   1. tokenizer.tokenize(text)  → tokens: string[]
   *   2. tokenizer.encode(text)    → tokenIds: number[]
   *   3. embedding.getEmbeddings(tokenIds) → embeddings: EmbeddingVector[]
   *
   * 每一层都严格复用已有 API，不自行实现任何编码/查表逻辑。
   *
   * 边界情况：
   *   - 空字符串 / 纯空白 → tokens=[], tokenIds=[], embeddings=[]
   *   - 未知词 → tokenizer 自动映射为 <unk>
   *   - tokenId 越界 → MiniEmbedding 返回零向量
   *
   * 示例：
   *
   * ```ts
   * const result = pipeline.forward("Hello HOU Universe");
   * // result.inputText       → "Hello HOU Universe"
   * // result.tokens          → ["Hello", "HOU", "Universe"]
   * // result.tokenIds        → [4, 5, 6]
   * // result.embeddings      → [[0.012, -0.034, ...], ...]
   * // result.vectorDimension → 512
   * ```
   */
  forward(text: string): PipelineResult {
    // Layer 1: Tokenizer — text → tokens + token IDs
    // 只调用 tokenizer 的公开 API，不触碰内部实现
    const tokens = this.tokenizer.tokenize(text);
    const tokenIds = this.tokenizer.encode(text);

    // Layer 2: Embedding — token IDs → dense vectors
    // 只调用 embedding 的公开 API，不触碰内部矩阵
    const embeddings = this.embedding.getEmbeddings(tokenIds);

    const matrixInfo = this.embedding.getMatrixInfo();

    return {
      inputText: text,
      tokens,
      tokenIds,
      embeddings,
      vectorDimension: matrixInfo.embeddingDim,
    };
  }

  /**
   * getTokenizer() — 获取当前 pipeline 使用的 tokenizer 实例
   *
   * 用于外部直接操作 vocabulary（如动态添加 token），
   * 避免在 pipeline 上重复暴露 tokenizer 的所有方法。
   */
  getTokenizer(): MiniTokenizer {
    return this.tokenizer;
  }

  /**
   * getEmbedding() — 获取当前 pipeline 使用的 embedding 实例
   *
   * 用于外部检查矩阵信息或直接操作向量。
   */
  getEmbedding(): MiniEmbedding {
    return this.embedding;
  }
}
