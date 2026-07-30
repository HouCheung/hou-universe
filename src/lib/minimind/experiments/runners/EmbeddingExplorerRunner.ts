// ============================================================
// MiniMind — experiments/runners/EmbeddingExplorerRunner.ts
// ============================================================
// Embedding Explorer Runner — 实验 2
//
// 核心功能：
//   交互式向量查询与相似度计算。支持单/多 token 向量查询，
//   以及 token 对之间的余弦相似度比较。
//
// 依赖模块：
//   - MiniEmbedding（嵌入矩阵 + 查表）
//   - MiniTokenizer（词汇表 — token ↔ ID 映射）
//
// 设计原则：
//   - 双模式 — lookup（向量查询）+ similarity（相似度比较）
//   - 优雅降级 — 每步独立 try/catch
//   - 零核心模块修改 — 所有依赖通过 context 注入
//   - 与 ForwardVisualAdapter 对齐 — 单一入口 + 私有 helper
// ============================================================

import type {
  ExperimentRunner,
  ExperimentResult,
  ExperimentContext,
  EmbeddingExplorerInput,
  EmbeddingExplorerData,
  EmbeddingVectorInfo,
  TokenSimilarity,
} from "../types";
import { registerRunner } from "../ExperimentRunner";

// ============================================================
// EmbeddingExplorerRunner
// ============================================================

/**
 * EmbeddingExplorerRunner — 嵌入向量探索实验运行器
 *
 * 实验模式：
 *   1. "lookup"     — 查询 token 的嵌入向量 + 统计信息
 *   2. "similarity" — 计算两个 token 向量的余弦相似度
 *
 * 使用方式：
 *   const runner = new EmbeddingExplorerRunner();
 *
 *   // 查单个 token 的向量
 *   const r1 = runner.run(context, { mode: "lookup", tokenId: 42 });
 *
 *   // 计算两个 token 的相似度
 *   const r2 = runner.run(context, {
 *     mode: "similarity",
 *     tokenPair: { tokenA: "hello", tokenB: "world" },
 *   });
 */
export class EmbeddingExplorerRunner
  implements ExperimentRunner<EmbeddingExplorerInput, EmbeddingExplorerData>
{
  readonly experimentId = "embedding-explorer";

  // ============================================================
  // 公开 API — run
  // ============================================================

  /**
   * run(context, input) — 执行嵌入向量探索实验
   *
   * @param context — 实验上下文（需含 embedding + tokenizer）
   * @param input   — { mode, tokenId?, tokenIds?, tokenPair? }
   * @returns         ExperimentResult<EmbeddingExplorerData>
   */
  run(
    context: ExperimentContext,
    input: EmbeddingExplorerInput
  ): ExperimentResult<EmbeddingExplorerData> {
    const startMs = performance.now();
    const errors: ExperimentResult["errors"] = [];

    // ── 校验：必需模块 ──
    if (!context.embedding) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: "MiniEmbedding is not available in the experiment context.",
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    if (!context.tokenizer) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: "MiniTokenizer is not available in the experiment context. Token label lookup requires a tokenizer.",
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    // ── 获取矩阵信息（始终可用） ──
    const matrixInfo = context.embedding.getMatrixInfo();

    // ── 按模式分发 ──
    let vectors: EmbeddingVectorInfo[] | undefined;
    let similarities: TokenSimilarity[] | undefined;

    if (input.mode === "lookup") {
      try {
        vectors = this.runLookup(context, input, errors);
      } catch (err) {
        errors.push({
          phase: "lookup",
          message: "Embedding lookup failed.",
          cause: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (input.mode === "similarity") {
      try {
        similarities = this.runSimilarity(context, input, errors);
      } catch (err) {
        errors.push({
          phase: "similarity",
          message: "Similarity computation failed.",
          cause: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── 判断状态 ──
    const endMs = performance.now();
    const timing = { startMs, endMs, durationMs: endMs - startMs };

    const hasData = vectors !== undefined || similarities !== undefined;
    const hasErrors = errors.length > 0;

    return {
      experimentId: this.experimentId,
      status: hasData ? (hasErrors ? "partial" : "success") : "failed",
      data: hasData
        ? {
            mode: input.mode,
            matrixInfo: {
              vocabSize: matrixInfo.vocabSize,
              embeddingDim: matrixInfo.embeddingDim,
              totalParameters: matrixInfo.totalParameters,
            },
            vectors,
            similarities,
          }
        : null,
      errors,
      timing,
    };
  }

  // ============================================================
  // 私有 helper — Lookup 模式
  // ============================================================

  /**
   * runLookup(context, input, errors) — 查询 token 嵌入向量
   *
   * 支持单 token（input.tokenId）和批量（input.tokenIds）查询。
   * 每个 token 返回：
   *   - token ID / token 字符串 / 完整向量 / 统计信息
   *
   * @returns EmbeddingVectorInfo[] 或 undefined
   */
  private runLookup(
    context: ExperimentContext,
    input: EmbeddingExplorerInput,
    errors: ExperimentResult["errors"]
  ): EmbeddingVectorInfo[] | undefined {
    const embedding = context.embedding!;
    const tokenizer = context.tokenizer!;
    const vocab = tokenizer.getVocabulary();

    // ── 确定要查询的 token ID 列表 ──
    let targetIds: number[];
    if (input.tokenIds && input.tokenIds.length > 0) {
      targetIds = input.tokenIds;
    } else if (input.tokenId !== undefined) {
      targetIds = [input.tokenId];
    } else {
      errors.push({
        phase: "lookup",
        message: "Lookup mode requires tokenId or tokenIds to be specified.",
      });
      return undefined;
    }

    // ── 逐 token 查询 ──
    const results: EmbeddingVectorInfo[] = [];
    for (const id of targetIds) {
      try {
        const vector = embedding.getEmbedding(id);
        const token = vocab.idToToken.get(id) ?? `<id_${id}>`;

        // 计算向量统计
        const stats = this.computeVectorStats(vector);

        results.push({
          tokenId: id,
          token,
          vector,
          stats,
        });
      } catch (err) {
        errors.push({
          phase: "lookup",
          message: `Failed to look up embedding for tokenId ${id}.`,
          cause: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results.length > 0 ? results : undefined;
  }

  // ============================================================
  // 私有 helper — Similarity 模式
  // ============================================================

  /**
   * runSimilarity(context, input, errors) — 计算 token 对余弦相似度
   *
   * 通过 tokenizer 查找 token 对应的 ID，
   * 然后从 embedding 矩阵中取出向量并计算余弦相似度。
   *
   * 公式：
   *   cosine(A, B) = (A · B) / (||A|| × ||B||)
   *
   * @returns TokenSimilarity[] 或 undefined
   */
  private runSimilarity(
    context: ExperimentContext,
    input: EmbeddingExplorerInput,
    errors: ExperimentResult["errors"]
  ): TokenSimilarity[] | undefined {
    const embedding = context.embedding!;
    const tokenizer = context.tokenizer!;
    const vocab = tokenizer.getVocabulary();

    if (!input.tokenPair) {
      errors.push({
        phase: "similarity",
        message: "Similarity mode requires tokenPair to be specified.",
      });
      return undefined;
    }

    const { tokenA, tokenB } = input.tokenPair;

    // ── 查找 token ID ──
    const idA = vocab.tokenToId.get(tokenA);
    const idB = vocab.tokenToId.get(tokenB);

    if (idA === undefined) {
      errors.push({
        phase: "similarity",
        message: `Token "${tokenA}" not found in vocabulary. Register it first with tokenizer.addToken().`,
      });
      return undefined;
    }

    if (idB === undefined) {
      errors.push({
        phase: "similarity",
        message: `Token "${tokenB}" not found in vocabulary. Register it first with tokenizer.addToken().`,
      });
      return undefined;
    }

    // ── 获取向量 ──
    const vecA = embedding.getEmbedding(idA);
    const vecB = embedding.getEmbedding(idB);

    // ── 计算余弦相似度 ──
    const cosineSimilarity = this.computeCosineSimilarity(vecA, vecB);

    return [
      {
        tokenA,
        tokenAId: idA,
        tokenB,
        tokenBId: idB,
        cosineSimilarity,
      },
    ];
  }

  // ============================================================
  // 私有 helper — 数学工具
  // ============================================================

  /**
   * computeVectorStats(vector) — 计算向量的基本统计信息
   *
   * 返回 min / max / mean / l2Norm。
   * 用于展示单个 embedding 向量的特征。
   */
  private computeVectorStats(vector: number[]): EmbeddingVectorInfo["stats"] {
    const len = vector.length;
    if (len === 0) {
      return { min: 0, max: 0, mean: 0, l2Norm: 0 };
    }

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < len; i++) {
      const v = vector[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      sumSq += v * v;
    }

    return {
      min,
      max,
      mean: sum / len,
      l2Norm: Math.sqrt(sumSq),
    };
  }

  /**
   * computeCosineSimilarity(a, b) — 计算两个向量的余弦相似度
   *
   * 公式：
   *   cosine = dot(a, b) / (||a|| × ||b||)
   *
   * 返回值范围 [-1, 1]：
   *   -  1  = 方向完全相同
   *   -  0  = 正交（无线性关系）
   *   - -1  = 方向完全相反
   *
   * 对零向量做防护 — 任一向量为零时返回 0。
   */
  private computeCosineSimilarity(a: number[], b: number[]): number {
    const dim = Math.min(a.length, b.length);

    let dotProduct = 0;
    let normASq = 0;
    let normBSq = 0;

    for (let i = 0; i < dim; i++) {
      dotProduct += a[i] * b[i];
      normASq += a[i] * a[i];
      normBSq += b[i] * b[i];
    }

    const normA = Math.sqrt(normASq);
    const normB = Math.sqrt(normBSq);

    if (normA === 0 || normB === 0) {
      return 0; // 零向量 — 无方向，定义为 0
    }

    // 数值稳定性 — 裁剪到 [-1, 1]
    const raw = dotProduct / (normA * normB);
    return Math.max(-1, Math.min(1, raw));
  }
}

// ============================================================
// 注册 runner
// ============================================================

registerRunner(new EmbeddingExplorerRunner());
