// ============================================================
// MiniMind — inference/strategies/GreedySampler.ts
// ============================================================
// GreedySampler — 贪婪采样策略
//
// 核心功能：
//   终端策略 — 诊断是否使用了概率采样。
//   当所有前置策略均为默认值时：返回 "Argmax (greedy selection)" 描述。
//   当任一前置策略活跃时：返回 "Sample from probability distribution" 描述。
//
// 注意：实际 token 选择（argmax 或采样）在 Sampler 编排器中执行，
// 而非在此策略中。此策略只提供教育性描述。
//
// 教育重点：
//   - 贪婪解码是最简单的策略 — 总是选概率最高的 token
//   - 有温度/topK/topP 时变为概率采样 — 引入多样性
// ============================================================

import type { SamplingStrategy, SamplingConfig, LogitsTransformResult } from "../types";

export class GreedySampler implements SamplingStrategy {
  readonly id = "greedy";
  readonly name = "Greedy Selection";

  /**
   * apply — 不修改 logits，仅判断采样模式
   *
   * 当所有前置策略均为默认值（temperature=1.0, topK=0, topP=1.0）时：
   *   实际执行 argmax → "Argmax (greedy selection)"
   * 否则（有温度缩放、topK 过滤或 topP 过滤）：
   *   实际从概率分布中采样 → "Sample from probability distribution"
   */
  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const isProbabilistic =
      config.temperature !== 1.0 &&
      config.temperature !== 0 ||
      config.topK > 0 ||
      config.topP < 1.0;

    // 如果 temperature=0 且无其他过滤，视为纯 argmax
    const isGreedy = config.temperature === 0 &&
      config.topK === 0 &&
      config.topP === 1.0;

    if (isGreedy) {
      return {
        logits,
        maskedIndices: [],
        description: "Argmax (greedy selection)",
      };
    }

    return {
      logits,
      maskedIndices: [],
      description: isProbabilistic
        ? "Sample from probability distribution"
        : "Argmax (greedy selection)",
    };
  }
}
