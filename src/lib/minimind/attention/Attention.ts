// ============================================================
// MiniMind — Attention.ts
// ============================================================
// MiniAttention V1 — 教育型 Multi-Head Attention 引擎
//
// 核心功能：
//   - Q/K/V 投影矩阵（可检查权重）
//   - 分头/合并（split heads / merge heads）
//   - Scaled Dot-Product Attention（逐头独立计算）
//   - 完整的 Attention Trace（供可视化和调试）
//   - Causal Mask 支持
//
// 数据流：
//   Input [seqLen, dModel]
//     → Q/K/V 投影 → [seqLen, dModel] × 3
//     → 分头 → [numHeads, seqLen, headDim]
//     → 每头 Scaled Dot-Product Attention
//     → 合并 → [seqLen, dModel]
//
// 教育重点：
//   - 投影权重完全透明 — 可随时检查 W_Q/W_K/W_V/W_O
//   - 分头/合并过程逐步展示 — 理解 [seqLen, dModel] → 多头 → 合并
//   - Attention Trace 记录每步中间结果 — 完整的可解释性
//   - 确定性初始化 — 相同 seed 产生相同权重
// ============================================================

import type {
  AttentionConfig,
  AttentionInput,
  AttentionOutput,
  AttentionTrace,
} from "./types";
import { scaledDotProductAttention, transpose, matrixMultiply } from "./math";

// ============================================================
// Deterministic PRNG — Mulberry32
// ============================================================

/**
 * 创建确定性 PRNG（Mulberry32 算法）
 *
 * 与 MiniEmbedding 使用相同的 PRNG 实现。
 * 保证相同 seed → 相同权重序列 → 可复现的 Attention 行为。
 */
function createPRNG(seed: number): () => number {
  let state = seed | 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// MiniAttention
// ============================================================

/**
 * MiniAttention — 教育用 Multi-Head Attention 引擎
 *
 * 核心职责：
 *   实现完整的 Multi-Head Scaled Dot-Product Attention。
 *   每个 token 动态关注序列中的所有其他 token，
 *   通过多个并行的注意力头在不同表示子空间中学习依赖关系。
 *
 * 使用方式：
 *
 * ```ts
 * const attn = new MiniAttention({ dModel: 512, numHeads: 8, headDim: 64, maxSeqLen: 512 });
 *
 * // 准备输入（3 个 token，d_model=512 维向量）
 * const input = {
 *   queries: [[...512 维...], [...], [...]],
 *   keys:    [[...512 维...], [...], [...]],
 *   values:  [[...512 维...], [...], [...]],
 * };
 *
 * // 前向传播
 * const result = attn.forward(input);
 * // result.output → [3][512] 合并后的输出
 * // result.trace  → 完整的 attention trace
 *
 * // 检查 trace
 * const t = attn.getAttentionTrace();
 * // t.attentionWeights[head][qPos][kPos] → 每个 head 的 attention 分布
 * ```
 *
 * 教育设计：
 *   - 权重完全透明 — W_Q/W_K/W_V/W_O 可随时检查
 *   - 分头/合并逐步透明 — 理解维度变换
 *   - 完整 trace — scores、weights、per-head outputs 可逐元素检查
 *   - 零外部依赖 — 纯 TypeScript 实现
 */
export class MiniAttention {
  private config: AttentionConfig;
  private W_Q: number[][]; // [dModel × dModel] Query 投影矩阵
  private W_K: number[][]; // [dModel × dModel] Key 投影矩阵
  private W_V: number[][]; // [dModel × dModel] Value 投影矩阵
  private W_O: number[][]; // [dModel × dModel] Output 投影矩阵
  private lastTrace: AttentionTrace | null = null;

  /**
   * @param config — { dModel, numHeads, headDim, maxSeqLen }
   *
   * 构造时立即：
   *   1. 验证参数（dModel 必须能被 numHeads 整除）
   *   2. 初始化 W_Q, W_K, W_V, W_O 四个投影矩阵
   *   3. 使用确定性 PRNG 初始化权重（可复现）
   *
   * 投影矩阵形状：
   *   W_Q, W_K, W_V: [dModel × dModel]
   *   W_O:           [dModel × dModel]
   *
   * 注意：为与 MiniMind 保持一致，Q/K/V 投影到 d_model
   * 而非 numHeads×headDim（两者等价，因为 d_model = numHeads × headDim）。
   */
  constructor(config: AttentionConfig) {
    if (config.dModel <= 0) {
      throw new Error(`dModel must be positive, got ${config.dModel}`);
    }
    if (config.numHeads <= 0) {
      throw new Error(`numHeads must be positive, got ${config.numHeads}`);
    }
    if (config.dModel % config.numHeads !== 0) {
      throw new Error(
        `dModel (${config.dModel}) must be divisible by numHeads (${config.numHeads})`
      );
    }
    if (config.headDim !== config.dModel / config.numHeads) {
      throw new Error(
        `headDim (${config.headDim}) must equal dModel/numHeads (${config.dModel / config.numHeads})`
      );
    }
    if (config.maxSeqLen <= 0) {
      throw new Error(
        `maxSeqLen must be positive, got ${config.maxSeqLen}`
      );
    }

    this.config = { ...config };
    this.W_Q = this.initializeWeight(0);
    this.W_K = this.initializeWeight(1);
    this.W_V = this.initializeWeight(2);
    this.W_O = this.initializeWeight(3);
  }

  // ============================================================
  // 公开 API — 前向传播
  // ============================================================

  /**
   * forward(input) — 完整的 Multi-Head Attention 前向传播
   *
   * 步骤：
   *   1. Q/K/V 投影：input → [seqLen, dModel]（通过 W_Q/W_K/W_V 投影）
   *   2. 分头：将 dModel 拆为 numHeads 个 headDim 维子空间
   *   3. 每头 Scaled Dot-Product Attention
   *   4. 合并多头输出
   *   5. W_O 投影 → 最终输出
   *
   * 参数：
   * @param input — { queries, keys, values, mask? }
   * @returns       { output, trace }
   *
   * 示例：
   *   const input = {
   *     queries: [[0.1, 0.2, ...], [0.3, 0.4, ...], [0.5, 0.6, ...]],
   *     keys:    [[0.1, 0.2, ...], [0.3, 0.4, ...], [0.5, 0.6, ...]],
   *     values:  [[0.1, 0.2, ...], [0.3, 0.4, ...], [0.5, 0.6, ...]],
   *     mask: "causal",
   *   };
   *   const result = attn.forward(input);
   */
  forward(input: AttentionInput): AttentionOutput {
    const { queries, keys, values, mask } = input;
    const { numHeads, headDim } = this.config;
    const seqLen = queries.length;

    // ── Step 1: Q/K/V 投影 ──
    // 将输入向量通过投影矩阵映射到 dModel 空间
    // 当输入已是 [seqLen, dModel] 时，投影实际上是一个线性变换
    const Q_proj = this.project(queries, this.W_Q);
    const K_proj = this.project(keys, this.W_K);
    const V_proj = this.project(values, this.W_V);

    // ── Step 2: 分头 ──
    // [seqLen, dModel] → [numHeads, seqLen, headDim]
    const Q_heads = this.splitHeads(Q_proj);
    const K_heads = this.splitHeads(K_proj);
    const V_heads = this.splitHeads(V_proj);

    // ── Step 3: 逐头 Attention ──
    const rawScores: number[][][] = [];
    const attentionWeights: number[][][] = [];
    const headOutputs: number[][][] = [];

    for (let h = 0; h < numHeads; h++) {
      const result = scaledDotProductAttention(
        Q_heads[h],
        K_heads[h],
        V_heads[h],
        mask ?? null
      );

      rawScores.push(result.scores);
      attentionWeights.push(result.weights);
      headOutputs.push(result.output);
    }

    // ── Step 4: 合并多头 ──
    // [numHeads, seqLen, headDim] → [seqLen, dModel]
    const merged = this.mergeHeads(headOutputs);

    // ── Step 5: Output 投影 ──
    const output = this.project(merged, this.W_O);

    // ── 构建 trace ──
    const trace: AttentionTrace = {
      seqLen,
      numHeads,
      headDim,
      scaleFactor: Math.sqrt(headDim),
      rawScores,
      attentionWeights,
      headOutputs,
      output,
      causalMaskApplied: mask === "causal",
    };

    this.lastTrace = trace;

    return { output, trace };
  }

  /**
   * computeScores(Q, K) — 计算原始 attention scores
   *
   * 暴露 Q @ K^T 的原始分数（缩放之前），
   * 用于理解内积相似度的分布。
   *
   * 参数：
   * @param Q - Query 矩阵 [seqLen, dModel]
   * @param K - Key 矩阵   [seqLen, dModel]
   * @returns   scores 矩阵 [seqLen][seqLen]
   *
   * 示例：
   *   const scores = attn.computeScores(qInput, kInput);
   *   // scores[0][2] → token 0 的 Query 与 token 2 的 Key 的内积
   */
  computeScores(Q: number[][], K: number[][]): number[][] {
    const Q_proj = this.project(Q, this.W_Q);
    const K_proj = this.project(K, this.W_K);
    const KT = transpose(K_proj);
    return matrixMultiply(Q_proj, KT);
  }

  /**
   * getAttentionTrace() — 获取最近一次 forward 的完整 trace
   *
   * 返回最后一次 forward 调用产生的完整 attention trace，
   * 包含所有中间结果。如果在 forward 之前调用，返回 null。
   *
   * trace 结构：
   *   - rawScores[head][qPos][kPos]       → 原始内积分数
   *   - attentionWeights[head][qPos][kPos] → softmax 后的权重
   *   - headOutputs[head][pos][dim]        → 每头的输出
   *   - output[pos][dim]                   → 最终合并输出
   *
   * 教育用途：
   *   - 可视化 attention 热力图
   *   - 对比不同 head 的 attention pattern
   *   - 验证 causal mask 正确性（上三角权重为 0）
   *
   * 示例：
   *   const trace = attn.getAttentionTrace();
   *   // trace.attentionWeights[0][1][0] → head 0 中 token 1 对 token 0 的关注权重
   */
  getAttentionTrace(): AttentionTrace | null {
    return this.lastTrace;
  }

  // ============================================================
  // 公开 API — 权重检查
  // ============================================================

  /**
   * getWeight(name) — 获取指定投影矩阵的权重
   *
   * 参数：
   * @param name — "Q" | "K" | "V" | "O"
   * @returns     对应的权重矩阵 [dModel × dModel]
   *
   * 教育用途：在 Playground 中展示权重分布。
   *
   * 示例：
   *   attn.getWeight("Q")  // → [512][512] W_Q matrix
   */
  getWeight(name: "Q" | "K" | "V" | "O"): number[][] {
    switch (name) {
      case "Q":
        return this.W_Q;
      case "K":
        return this.W_K;
      case "V":
        return this.W_V;
      case "O":
        return this.W_O;
    }
  }

  /**
   * getConfig() — 返回 Attention 配置
   *
   * 示例：
   *   attn.getConfig()
   *   // → { dModel: 512, numHeads: 8, headDim: 64, maxSeqLen: 512 }
   */
  getConfig(): AttentionConfig {
    return { ...this.config };
  }

  // ============================================================
  // 内部方法 — 投影
  // ============================================================

  /**
   * project(x, W) — 输入向量通过投影矩阵的线性变换
   *
   * 公式：output = x @ W
   * 形状：[seqLen, dModel] @ [dModel, dModel] → [seqLen, dModel]
   *
   * 这是 Q/K/V/O 投影的通用实现。
   */
  private project(x: number[][], W: number[][]): number[][] {
    return matrixMultiply(x, W);
  }

  // ============================================================
  // 内部方法 — 分头 / 合并
  // ============================================================

  /**
   * splitHeads(x) — 将 dModel 维向量拆分为多个 head
   *
   * 形状变换：
   *   输入：[seqLen, dModel]
   *   输出：[numHeads, seqLen, headDim]
   *
   * 拆分逻辑：
   *   每个 token 的 dModel 维向量被等分为 numHeads 段，
   *   每段长度为 headDim = dModel / numHeads。
   *
   *   例如 dModel=512, numHeads=8, headDim=64:
   *   head 0: dims [0..63]
   *   head 1: dims [64..127]
   *   ...
   *   head 7: dims [448..511]
   */
  private splitHeads(x: number[][]): number[][][] {
    const seqLen = x.length;
    const { numHeads, headDim } = this.config;

    const heads: number[][][] = new Array(numHeads);
    for (let h = 0; h < numHeads; h++) {
      heads[h] = new Array(seqLen);
      for (let pos = 0; pos < seqLen; pos++) {
        heads[h][pos] = new Array(headDim);
        const offset = h * headDim;
        for (let d = 0; d < headDim; d++) {
          heads[h][pos][d] = x[pos][offset + d];
        }
      }
    }

    return heads;
  }

  /**
   * mergeHeads(heads) — 将多个 head 的输出合并为 dModel 维向量
   *
   * 形状变换（splitHeads 的逆操作）：
   *   输入：[numHeads, seqLen, headDim]
   *   输出：[seqLen, dModel]
   *
   * 合并逻辑：
   *   head 0 的输出占据 dims [0..63]
   *   head 1 的输出占据 dims [64..127]
   *   ...
   *   head 7 的输出占据 dims [448..511]
   */
  private mergeHeads(heads: number[][][]): number[][] {
    const { numHeads, headDim } = this.config;
    const seqLen = heads[0]?.length ?? 0;
    const dModel = this.config.dModel;

    const merged: number[][] = new Array(seqLen);
    for (let pos = 0; pos < seqLen; pos++) {
      merged[pos] = new Array(dModel);
      for (let h = 0; h < numHeads; h++) {
        const offset = h * headDim;
        for (let d = 0; d < headDim; d++) {
          merged[pos][offset + d] = heads[h][pos][d];
        }
      }
    }

    return merged;
  }

  // ============================================================
  // 内部方法 — 权重初始化
  // ============================================================

  /**
   * initializeWeight(seedOffset) — 初始化一个投影矩阵
   *
   * 使用 Xavier uniform 初始化：
   *   U(-sqrt(6 / dModel), +sqrt(6 / dModel))
   *
   * 确定性保证：
   *   相同的 seedOffset + dModel → 完全相同的权重矩阵。
   *
   * @param seedOffset — 不同投影矩阵使用不同的 seed
   *                     Q=0, K=1, V=2, O=3
   */
  private initializeWeight(seedOffset: number): number[][] {
    const { dModel } = this.config;
    const rand = createPRNG(42 + seedOffset);
    const scale = Math.sqrt(6 / dModel);

    const W: number[][] = new Array(dModel);
    for (let i = 0; i < dModel; i++) {
      W[i] = new Array(dModel);
      for (let j = 0; j < dModel; j++) {
        W[i][j] = (rand() * 2 - 1) * scale;
      }
    }

    return W;
  }
}
