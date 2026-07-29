// ============================================================
// MiniMind — RotaryEmbedding.ts
// ============================================================
// RotaryEmbedding V1 — 教育型 RoPE 引擎
//
// 核心功能：
//   - 预计算频率表和 cos/sin 缓存
//   - 将位置信息通过 2D 旋转注入向量
//   - 支持 Q 和 K 的独立/批量旋转
//   - 等距变换 — 保持向量范数不变
//
// 数据流：
//   Token 位置 (m) + Q/K 向量
//     → 查找预计算的角度 (m · freq_i)
//     → 逐 2D 维度对旋转
//     → 携带相对位置信息的旋转后向量
//
// 教育重点：
//   - 旋转是正交变换 — 向量长度不变
//   - 不同维度对以不同速度旋转 — 形成频率带
//   - Q·K 内积只依赖相对位置 — 这是 RoPE 的核心魔法
// ============================================================

import type { RoPEConfig, FrequencyCache } from "./types";
import {
  getFrequencies,
  frequencyCache,
  applyRotation,
  applyQKRotation,
  l2Norm,
} from "./math";

// ============================================================
// RotaryEmbedding
// ============================================================

/**
 * RotaryEmbedding — 教育用 RoPE 引擎
 *
 * 核心职责：
 *   在 token 向量中注入位置信息，使 Self-Attention
 *   的内积天然编码相对位置关系。
 *
 * 使用方式：
 *
 * ```ts
 * const rope = new RotaryEmbedding({ headDim: 64, theta: 10000, maxSeqLen: 512 });
 *
 * // 获取频率信息
 * const freqs = rope.getFrequencies();
 * // → Float64Array(32) [1.0, 0.9647, 0.9305, ..., 0.0001]
 *
 * // 单向量旋转
 * const result = rope.rotate(x, position);
 * // → { result: Float64Array(64), traces: [...], normPreserved: true }
 *
 * // 批量 Q/K 旋转
 * const qk = rope.forward(qVectors, kVectors);
 * // → { rotatedQuery: [...], rotatedKey: [...] }
 * ```
 *
 * 教育设计：
 *   - 频率完全透明 — 可随时检查每个维度对的旋转速度
 *   - 逐对 trace — 每次旋转记录前后值，供可视化
 *   - 范数验证 — 自动检查旋转前后向量长度一致
 *   - 零外部依赖 — 纯 TypeScript 实现
 */
export class RotaryEmbedding {
  private config: RoPEConfig;
  private freqs: Float64Array;
  private cache: FrequencyCache;
  private numDimPairs: number;

  /**
   * @param config — { headDim, theta, maxSeqLen }
   *
   * 构造时立即：
   *   1. 计算频率表 — headDim/2 个不同的旋转频率
   *   2. 预计算 cos/sin 缓存 — 所有位置 × 所有维度对
   *
   * 预计算是 RoPE 推理效率的关键：
   *   不预计算：每次 forward → headDim/2 × seqLen 次 Math.cos/Math.sin
   *   预计算：   初始化一次 → forward 时零三角函数调用
   */
  constructor(config: RoPEConfig) {
    if (config.headDim <= 0 || config.headDim % 2 !== 0) {
      throw new Error(
        `headDim must be a positive even number, got ${config.headDim}`
      );
    }
    if (config.theta <= 0) {
      throw new Error(`theta must be positive, got ${config.theta}`);
    }
    if (config.maxSeqLen <= 0) {
      throw new Error(
        `maxSeqLen must be positive, got ${config.maxSeqLen}`
      );
    }

    this.config = { ...config };
    this.freqs = getFrequencies(config.headDim, config.theta);
    this.numDimPairs = this.freqs.length;
    this.cache = frequencyCache(
      config.maxSeqLen,
      config.headDim,
      config.theta
    );
  }

  // ============================================================
  // 公开 API — 信息查询
  // ============================================================

  /**
   * getFrequencies() — 返回各维度对的旋转频率
   *
   * 频率从高到低排列：
   *   freqs[0] = 1.0         ← 最快旋转（~1 rad/step），对短距离敏感
   *   freqs[numDimPairs-1]   ← 最慢旋转（~0.0001 rad/step），对长距离有效
   *
   * 返回值是内部频率表的只读引用。
   *
   * 示例：
   *   rope.getFrequencies()
   *   // → Float64Array(32) [1.0, 0.9647, ..., 0.0001]
   */
  getFrequencies(): Float64Array {
    return this.freqs;
  }

  /**
   * getConfig() — 返回 RoPE 配置
   *
   * 示例：
   *   rope.getConfig()
   *   // → { headDim: 64, theta: 10000, maxSeqLen: 512 }
   */
  getConfig(): RoPEConfig {
    return { ...this.config };
  }

  /**
   * getNumDimPairs() — 返回 2D 旋转平面的数量
   *
   * 等于 headDim / 2。例如 headDim=64 → 32 个独立的 2D 旋转。
   */
  getNumDimPairs(): number {
    return this.numDimPairs;
  }

  /**
   * getAngles(position) — 获取指定位置的全部旋转角度
   *
   * 返回长度为 headDim/2 的角度数组。
   * 每个角度 = position × frequency。
   *
   * 教育用途：
   *   - 对比不同位置的旋转角度差异
   *   - 理解高频带和低频带的角度增长速度
   *
   * 示例：
   *   rope.getAngles(5)
   *   // → Float64Array(32) [5.0, 4.82, ..., 0.0005]
   */
  getAngles(position: number): Float64Array {
    if (position < 0 || position >= this.config.maxSeqLen) {
      throw new Error(
        `position ${position} out of range [0, ${this.config.maxSeqLen - 1}]`
      );
    }

    const angles = new Float64Array(this.numDimPairs);
    for (let i = 0; i < this.numDimPairs; i++) {
      angles[i] = position * this.freqs[i];
    }
    return angles;
  }

  /**
   * getCache() — 返回预计算的 cos/sin 缓存
   *
   * 教育用途：让学生看到 RoPE 的"查表"本质 —
   * cosTable[pos][i] 就是位置 pos 第 i 个维度对的 cos 值。
   */
  getCache(): FrequencyCache {
    return this.cache;
  }

  // ============================================================
  // 公开 API — 旋转操作
  // ============================================================

  /**
   * rotate(x, position) — 对单个向量应用 RoPE 旋转
   *
   * 这是 RoPE 的最核心操作。将 headDim 维向量拆分为
   * headDim/2 个 2D 平面，每个平面旋转 position × freq_i 角度。
   *
   * 参数：
   * @param x        - 输入向量（Query 或 Key），长度为 headDim
   * @param position - 该 token 在序列中的绝对位置（0-based）
   * @returns          完整的旋转结果（含 trace 和范数验证）
   *
   * 示例：
   *   const q = Float64Array.from([0.12, -0.45, 0.78, 0.33, ...])
   *   const result = rope.rotate(q, 3);
   *   // result.result      → 旋转后的向量
   *   // result.traces      → 每个维度对的旋转前后值
   *   // result.normPreserved → true（等距变换验证通过）
   */
  rotate(
    x: Float64Array,
    position: number
  ): ReturnType<typeof applyRotation> {
    if (x.length !== this.config.headDim) {
      throw new Error(
        `Input vector length ${x.length} does not match headDim ${this.config.headDim}`
      );
    }
    if (position < 0 || position >= this.config.maxSeqLen) {
      throw new Error(
        `position ${position} out of range [0, ${this.config.maxSeqLen - 1}]`
      );
    }

    return applyRotation(x, position, this.freqs);
  }

  /**
   * rotateBatch(vectors, positions) — 批量旋转多个向量
   *
   * 参数：
   * @param vectors   - 向量数组 [N][headDim]
   * @param positions - 位置数组 [N]（如 [0, 1, 2, ..., N-1]）
   * @returns           旋转结果数组
   */
  rotateBatch(
    vectors: Float64Array[],
    positions: number[]
  ): ReturnType<typeof applyRotation>[] {
    if (vectors.length !== positions.length) {
      throw new Error(
        `vectors.length (${vectors.length}) must match positions.length (${positions.length})`
      );
    }

    return vectors.map((vec, idx) => this.rotate(vec, positions[idx]));
  }

  /**
   * forward(qVectors, kVectors) — 对 Q 和 K 批量应用 RoPE
   *
   * 这是 MiniMind 中 RoPE 层的顶层入口。
   * 假设 qVectors 和 kVectors 按序列位置排列（第 i 个元素 = 位置 i）。
   *
   * 参数：
   * @param qVectors - Query 向量数组 [seqLen][headDim]
   * @param kVectors - Key 向量数组   [seqLen][headDim]
   * @returns          旋转后的 Q/K 结果
   *
   * 示例：
   *   const q = [pos0_q, pos1_q, pos2_q];  // 3 个位置的 Q 向量
   *   const k = [pos0_k, pos1_k, pos2_k];  // 3 个位置的 K 向量
   *   const qk = rope.forward(q, k);
   *   // qk.rotatedQuery[0]  ← 位置 0 的 Q 旋转结果
   *   // qk.rotatedKey[2]    ← 位置 2 的 K 旋转结果
   */
  forward(
    qVectors: Float64Array[],
    kVectors: Float64Array[]
  ): ReturnType<typeof applyQKRotation> {
    if (qVectors.length !== kVectors.length) {
      throw new Error(
        `qVectors.length (${qVectors.length}) must match kVectors.length (${kVectors.length})`
      );
    }
    if (qVectors.length > this.config.maxSeqLen) {
      throw new Error(
        `sequence length ${qVectors.length} exceeds maxSeqLen ${this.config.maxSeqLen}`
      );
    }

    return applyQKRotation(qVectors, kVectors, this.freqs);
  }

  // ============================================================
  // 公开 API — 验证
  // ============================================================

  /**
   * verifyNormInvariance(x, position) — 验证旋转的等距性
   *
   * 旋转前后向量的 L2 范数应严格一致（容差 1e-10）。
   * 如果范数不一致，说明存在数值问题。
   *
   * 返回值：范数差异的绝对值。
   *   - 0（或 < 1e-10）→ 等距性保持，RoPE 实现正确
   *   - > 1e-10 → 有 bug，需要排查
   *
   * 示例：
   *   const diff = rope.verifyNormInvariance(someVector, 5);
   *   // → 3.4e-15  ← 浮点舍入误差，属正常范围
   */
  verifyNormInvariance(x: Float64Array, position: number): number {
    const normBefore = l2Norm(x);
    const result = applyRotation(x, position, this.freqs);
    const normAfter = l2Norm(result.result);
    return Math.abs(normBefore - normAfter);
  }
}
