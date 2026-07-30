// ============================================================
// MiniMind — experiments/runners/AttentionHeatmapRunner.ts
// ============================================================
// Attention Heatmap Runner — 实验 3
//
// 核心功能：
//   对输入序列运行 Multi-Head Self-Attention，提取每个头的
//   注意力权重矩阵、原始分数和熵值，计算头多样性指标。
//
// 依赖模块：
//   - MiniAttention（多头注意力引擎）
//
// 设计原则：
//   - 自注意力模式 — 输入序列同时作为 Q/K/V
//   - 优雅降级 — 每头独立 try/catch
//   - 零核心模块修改 — 所有依赖通过 context 注入
//   - 与 ForwardVisualAdapter 对齐 — 单一入口 + 私有 helper
// ============================================================

import type {
  ExperimentRunner,
  ExperimentResult,
  ExperimentContext,
  AttentionHeatmapInput,
  AttentionHeatmapData,
  HeadHeatmapData,
} from "../types";
import { registerRunner } from "../ExperimentRunner";

// ============================================================
// AttentionHeatmapRunner
// ============================================================

/**
 * AttentionHeatmapRunner — 注意力热力图探索实验运行器
 *
 * 实验流程：
 *   1. 校验 context 中的 attention 非空
 *   2. 校验输入序列维度与 attention 配置匹配
 *   3. 以输入序列作为 Q/K/V 运行 self-attention forward
 *   4. 通过 getAttentionTrace() 获取每头注意力权重
 *   5. 计算每头熵值 + 可选的头多样性矩阵
 *   6. 包装为 ExperimentResult<AttentionHeatmapData>
 *
 * 使用方式：
 *   const runner = new AttentionHeatmapRunner();
 *   const result = runner.run(context, {
 *     sequence: [[0.1, 0.2, ...], ...],
 *     causalMask: true,
 *   });
 */
export class AttentionHeatmapRunner
  implements ExperimentRunner<AttentionHeatmapInput, AttentionHeatmapData>
{
  readonly experimentId = "attention-heatmap-explorer";

  // ============================================================
  // 公开 API — run
  // ============================================================

  /**
   * run(context, input) — 执行注意力热力图实验
   *
   * @param context — 实验上下文（需含 attention）
   * @param input   — { sequence, headIndices?, causalMask? }
   * @returns         ExperimentResult<AttentionHeatmapData>
   */
  run(
    context: ExperimentContext,
    input: AttentionHeatmapInput
  ): ExperimentResult<AttentionHeatmapData> {
    const startMs = performance.now();
    const errors: ExperimentResult["errors"] = [];

    // ── 校验：必需模块 ──
    if (!context.attention) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: "MiniAttention is not available in the experiment context.",
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    // ── 校验：输入序列 ──
    if (!input.sequence || input.sequence.length === 0) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: "Input sequence is empty. Provide a non-empty [seqLen][dModel] matrix.",
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    const seqLen = input.sequence.length;
    const dModel = input.sequence[0]?.length ?? 0;

    if (dModel === 0) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: "Input sequence has zero dModel. Each token vector must have at least 1 dimension.",
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    // ── 校验：维度匹配 ──
    const attnConfig = context.attention.getConfig();
    if (dModel !== attnConfig.dModel) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: `Input dModel (${dModel}) does not match attention config dModel (${attnConfig.dModel}).`,
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    if (seqLen > attnConfig.maxSeqLen) {
      const endMs = performance.now();
      return {
        experimentId: this.experimentId,
        status: "failed",
        data: null,
        errors: [
          {
            phase: "validation",
            message: `Input seqLen (${seqLen}) exceeds attention maxSeqLen (${attnConfig.maxSeqLen}).`,
          },
        ],
        timing: { startMs, endMs, durationMs: endMs - startMs },
      };
    }

    const causalMask = input.causalMask ?? true;

    // ── 运行：Self-Attention Forward ──
    let heads: HeadHeatmapData[] = [];
    try {
      // 自注意力：Q = K = V = 输入序列
      context.attention.forward({
        queries: input.sequence,
        keys: input.sequence,
        values: input.sequence,
        mask: causalMask ? "causal" : null,
      });

      const trace = context.attention.getAttentionTrace();
      if (!trace) {
        const endMs = performance.now();
        return {
          experimentId: this.experimentId,
          status: "failed",
          data: null,
          errors: [
            {
              phase: "attention-forward",
              message: "Attention forward succeeded but getAttentionTrace() returned null.",
            },
          ],
          timing: { startMs, endMs, durationMs: endMs - startMs },
        };
      }

      // ── 提取每头数据 ──
      heads = this.extractHeadData(trace, input.headIndices, errors);
    } catch (err) {
      errors.push({
        phase: "attention-forward",
        message: "Attention forward pass failed.",
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 计算头多样性（仅在有多头且成功时） ──
    let headDiversity:
      | { pairwiseSimilarity: number[][] }
      | undefined;
    if (heads.length > 1) {
      try {
        headDiversity = this.computeHeadDiversity(heads);
      } catch (err) {
        errors.push({
          phase: "head-diversity",
          message: "Head diversity computation failed.",
          cause: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── 判断状态 ──
    const endMs = performance.now();
    const timing = { startMs, endMs, durationMs: endMs - startMs };
    const hasErrors = errors.length > 0;
    const hasData = heads.length > 0;

    return {
      experimentId: this.experimentId,
      status: hasData ? (hasErrors ? "partial" : "success") : "failed",
      data: hasData
        ? {
            seqLen,
            numHeads: attnConfig.numHeads,
            headDim: attnConfig.headDim,
            causalMaskApplied: causalMask,
            heads,
            headDiversity,
          }
        : null,
      errors,
      timing,
    };
  }

  // ============================================================
  // 私有 helper — 提取每头数据
  // ============================================================

  /**
   * extractHeadData(trace, headIndices?, errors) — 从 AttentionTrace 提取每头热力图数据
   *
   * 对每个头（或指定的 headIndices 子集）：
   *   1. 复制该头的 attentionWeights 和 rawScores 矩阵
   *   2. 计算该头的熵值 = 所有 query 位置熵的均值
   *
   * 熵值公式：
   *   H(h) = (1/seqLen) × Σ_q Σ_k -w[q][k] × log(w[q][k])
   *   其中 w[q][k] > 1e-10 的项才参与求和（避免 log(0)）
   *
   * 高熵值 → 注意力分散（head 关注多个 token）
   * 低熵值 → 注意力集中（head 关注少数 token）
   */
  private extractHeadData(
    trace: {
      seqLen: number;
      numHeads: number;
      headDim: number;
      attentionWeights: number[][][];
      rawScores: number[][][];
    },
    headIndices: number[] | undefined,
    errors: ExperimentResult["errors"]
  ): HeadHeatmapData[] {
    const targetHeads =
      headIndices && headIndices.length > 0
        ? headIndices.filter((h) => h >= 0 && h < trace.numHeads)
        : Array.from({ length: trace.numHeads }, (_, i) => i);

    const results: HeadHeatmapData[] = [];

    for (const h of targetHeads) {
      try {
        const weights = trace.attentionWeights[h];
        const rawScores = trace.rawScores[h];

        // 深拷贝权重和分数矩阵（避免外部修改 trace 内部数据）
        const weightsCopy: number[][] = weights.map((row) => [...row]);
        const scoresCopy: number[][] = rawScores.map((row) => [...row]);

        // 计算熵值
        const entropy = this.computeHeadEntropy(weights, trace.seqLen);

        results.push({
          headIndex: h,
          weights: weightsCopy,
          rawScores: scoresCopy,
          entropy,
        });
      } catch (err) {
        errors.push({
          phase: "extract-head",
          message: `Failed to extract data for head ${h}.`,
          cause: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  // ============================================================
  // 私有 helper — 熵值计算
  // ============================================================

  /**
   * computeHeadEntropy(weights, seqLen) — 计算单个注意力头的熵值
   *
   * 熵值衡量注意力分布的集中程度：
   *   - 均匀注意力（每个 token 同等关注）→ 熵 ≈ log(seqLen)
   *   - 锐利注意力（只关注一个 token）→ 熵 ≈ 0
   *
   * 公式：
   *   H = (1/seqLen) × Σ_q ( -Σ_k w[q][k] × log(w[q][k]) )
   *
   * 只对 w > 1e-10 的项求和，避免 log(0) = -Infinity。
   */
  private computeHeadEntropy(
    weights: number[][],
    seqLen: number
  ): number {
    let totalEntropy = 0;

    for (let q = 0; q < seqLen; q++) {
      let queryEntropy = 0;
      const row = weights[q];

      for (let k = 0; k < seqLen; k++) {
        const w = row[k];
        if (w > 1e-10) {
          queryEntropy -= w * Math.log(w);
        }
      }

      totalEntropy += queryEntropy;
    }

    return totalEntropy / seqLen;
  }

  // ============================================================
  // 私有 helper — 头多样性
  // ============================================================

  /**
   * computeHeadDiversity(heads) — 计算注意力头之间的多样性矩阵
   *
   * 将每个头的权重矩阵 [seqLen × seqLen] 展平为向量，
   * 然后计算所有头对之间的余弦相似度。
   *
   * pairwiseSimilarity[i][j] = 头 i 与头 j 的余弦相似度。
   *
   * 解读：
   *   - 接近 1  → 两个头的注意力模式几乎相同（冗余）
   *   - 接近 0  → 两个头的注意力模式正交（多样）
   *   - 接近 -1 → 极罕见，头的模式相反
   *
   * 对角线恒为 1（自己与自己的相似度），矩阵对称。
   */
  private computeHeadDiversity(heads: HeadHeatmapData[]): {
    pairwiseSimilarity: number[][];
  } {
    const n = heads.length;
    const similarity: number[][] = Array.from({ length: n }, () =>
      new Array(n).fill(0)
    );

    // 展平每个头的权重矩阵
    const flatWeights: number[][] = heads.map((h) => {
      const flat: number[] = [];
      for (const row of h.weights) {
        for (const v of row) {
          flat.push(v);
        }
      }
      return flat;
    });

    // 计算所有头对之间的余弦相似度
    for (let i = 0; i < n; i++) {
      similarity[i][i] = 1; // 对角线
      for (let j = i + 1; j < n; j++) {
        const sim = this.computeCosineSimilarity(flatWeights[i], flatWeights[j]);
        similarity[i][j] = sim;
        similarity[j][i] = sim; // 对称
      }
    }

    return { pairwiseSimilarity: similarity };
  }

  /**
   * computeCosineSimilarity(a, b) — 计算两个向量的余弦相似度
   *
   * 公式：
   *   cosine = dot(a, b) / (||a|| × ||b||)
   *
   * 返回值裁剪到 [-1, 1]。
   * 零向量防护：任一向量为零时返回 0。
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
      return 0;
    }

    const raw = dotProduct / (normA * normB);
    return Math.max(-1, Math.min(1, raw));
  }
}

// ============================================================
// 注册 runner
// ============================================================

registerRunner(new AttentionHeatmapRunner());
