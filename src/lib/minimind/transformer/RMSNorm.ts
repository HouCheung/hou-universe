// ============================================================
// MiniMind — RMSNorm.ts
// ============================================================
// MiniRMSNorm V1 — 教育型 RMS Normalization 引擎
//
// 核心功能：
//   - RMS Normalization（Root Mean Square Normalization）
//   - 仅除 RMS（不减均值）— 对齐 LLaMA 架构
//   - 可学习的缩放参数 γ（gamma）
//   - 数值稳定的 RMS 计算
//
// 公式：
//   RMSNorm(x) = x / RMS(x) * γ
//   RMS(x) = sqrt(mean(x²) + ε)
//
// 与 LayerNorm 的区别：
//   LayerNorm: y = (x - μ) / √(σ² + ε) * γ + β
//   RMSNorm:   y =  x        /  √(mean(x²) + ε) * γ
//
// 教育重点：
//   - 权重完全透明 — γ 参数可随时检查
//   - 归一化过程逐步展示 — 理解 RMS 计算
//   - 数值稳定性保证 — epsilon 防止除零
//   - 确定性行为 — 纯数学计算，无随机性
// ============================================================

// ============================================================
// MiniRMSNorm
// ============================================================

/**
 * MiniRMSNorm — 教育用 RMS Normalization 引擎
 *
 * 核心职责：
 *   实现 RMS Normalization。对输入向量的每个位置独立地
 *   除以 RMS（Root Mean Square），然后乘以可学习的缩放参数 γ。
 *   对齐 LLaMA/MiniMind 架构的归一化策略。
 *
 * 使用方式：
 *
 * ```ts
 * const norm = new MiniRMSNorm({ dModel: 512, eps: 1e-6 });
 *
 * // 归一化
 * const input = [[0.5, -0.3, 0.8], [0.1, 0.4, -0.2]];
 * const output = norm.forward(input);
 * // output → [[0.57, -0.34, 0.91], [0.22, 0.87, -0.43]]
 *
 * // 检查权重
 * const gamma = norm.getWeights();
 * // gamma → [1.0, 1.0, 1.0] （初始化为全 1）
 * ```
 *
 * 教育设计：
 *   - 权重完全透明 — γ 可随时检查
 *   - RMS 计算逐步透明 — 理解归一化过程
 *   - 零外部依赖 — 纯 TypeScript 实现
 */
export class MiniRMSNorm {
  private dModel: number;
  private eps: number;
  private gamma: number[]; // 可学习的缩放参数 [dModel]

  /**
   * @param config — { dModel, normEps, ... }
   *
   * 构造时立即：
   *   1. 验证参数（dModel > 0, eps > 0）
   *   2. 初始化 γ（gamma）为全 1
   *
   * γ 初始化为 1 的原因：
   *   - 初始时不做缩放，只做归一化
   *   - 训练中 γ 自动调整各维度的尺度
   *   - 全 1 初始化是最常见的选择
   *
   * 注意：RMSNorm 没有 β（bias/shift）参数。
   * 这与 LayerNorm 不同——RMSNorm 认为 re-centering（减均值）
   * 不是必需的，网络可以自适应偏移。
   */
  constructor(config: { dModel: number; normEps: number }) {
    if (config.dModel <= 0) {
      throw new Error(`dModel must be positive, got ${config.dModel}`);
    }
    if (config.normEps <= 0) {
      throw new Error(`normEps must be positive, got ${config.normEps}`);
    }

    this.dModel = config.dModel;
    this.eps = config.normEps;

    // γ 初始化为全 1 — 初始时不做缩放
    this.gamma = new Array(this.dModel).fill(1.0);
  }

  // ============================================================
  // 公开 API — 前向传播
  // ============================================================

  /**
   * forward(x) — RMS Normalization 前向传播
   *
   * 对每个位置（每个 token 的向量）独立归一化：
   *   1. 计算 RMS(x) = sqrt(mean(x²) + ε)
   *   2. 归一化：x̂ = x / RMS(x)
   *   3. 缩放：y = x̂ * γ
   *
   * 注意：与 LayerNorm 不同，不减去均值。
   *
   * 参数：
   * @param x — 输入矩阵 [seqLen, dModel]
   * @returns    RMSNorm 输出 [seqLen, dModel]
   *
   * 示例：
   *   const output = norm.forward(hiddenStates);
   *   // output[pos][dim] → 归一化并缩放后的值
   *
   * 数值稳定性：
   *   使用 epsilon 防止当所有 x 接近 0 时除以 0。
   *   eps 默认 1e-6，足够小而不会显著影响归一化结果。
   */
  forward(x: number[][]): number[][] {
    const seqLen = x.length;

    // 验证输入维度
    if (x[0]?.length !== this.dModel) {
      throw new Error(
        `Input dimension mismatch: expected dModel=${this.dModel}, ` +
        `got ${x[0]?.length ?? 0}`
      );
    }

    const output: number[][] = new Array(seqLen);
    for (let pos = 0; pos < seqLen; pos++) {
      // Step 1: 计算 RMS
      const rms = this.computeRMS(x[pos]);

      // Step 2 & 3: 归一化 + 缩放
      output[pos] = new Array(this.dModel);
      for (let d = 0; d < this.dModel; d++) {
        output[pos][d] = (x[pos][d] / rms) * this.gamma[d];
      }
    }

    return output;
  }

  /**
   * normalize(x) — 纯归一化（不含 γ 缩放）
   *
   * 返回 x / RMS(x)，不乘以 γ。
   * 用于教学展示归一化本身的效应。
   *
   * 参数：
   * @param x — 输入矩阵 [seqLen, dModel]
   * @returns    归一化后的矩阵 [seqLen, dModel]（RMS≈1）
   *
   * 验证属性：
   *   对于任何非全零向量 x，normalize(x) 的 RMS ≈ 1。
   *   这可以用作单元测试的 invariant check。
   *
   * 示例：
   *   const normed = norm.normalize(input);
   *   // RMS(normed[0]) ≈ 1.0（在 eps 的精度范围内）
   */
  normalize(x: number[][]): number[][] {
    const seqLen = x.length;

    const output: number[][] = new Array(seqLen);
    for (let pos = 0; pos < seqLen; pos++) {
      const rms = this.computeRMS(x[pos]);
      output[pos] = new Array(this.dModel);
      for (let d = 0; d < this.dModel; d++) {
        output[pos][d] = x[pos][d] / rms;
      }
    }

    return output;
  }

  /**
   * getWeights() — 获取可学习参数 γ
   *
   * 返回缩放参数 γ（gamma），长度为 dModel 的数组。
   * 初始值为全 1.0。
   *
   * 教育用途：
   *   - 可视化各维度的缩放因子
   *   - 对比不同层的 γ 分布（在多层 Transformer 中）
   *   - 验证哪些维度被放大/缩小
   *
   * 示例：
   *   const gamma = norm.getWeights();
   *   // gamma → [1.0, 1.0, 1.0, ...]
   */
  getWeights(): number[] {
    return [...this.gamma];
  }

  /**
   * getConfig() — 返回 RMSNorm 配置
   *
   * 示例：
   *   norm.getConfig()
   *   // → { dModel: 512, eps: 1e-6 }
   */
  getConfig(): { dModel: number; eps: number } {
    return { dModel: this.dModel, eps: this.eps };
  }

  // ============================================================
  // 内部方法 — RMS 计算
  // ============================================================

  /**
   * computeRMS(vector) — 计算单个向量的 Root Mean Square
   *
   * 公式：RMS(x) = sqrt(mean(x²) + ε)
   *              = sqrt( (1/d) * Σ(x[i]²) + ε )
   *
   * 数值稳定性：
   *   - 使用 epsilon 防止当 x 全为 0 时 RMS = 0 导致的除零
   *   - 先求和再除 d，避免多次除法引入的累积误差
   *
   * 复杂度：O(dModel)
   *
   * @param vector — 一个 token 的向量 [dModel]
   * @returns        RMS 值（标量）
   */
  private computeRMS(vector: number[]): number {
    let sumOfSquares = 0;
    for (let i = 0; i < vector.length; i++) {
      sumOfSquares += vector[i] * vector[i];
    }
    const meanOfSquares = sumOfSquares / vector.length;
    return Math.sqrt(meanOfSquares + this.eps);
  }
}
