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
   * 贪婪判定与 Sampler 编排器保持一致：
   *   temperature === 0 && topK === 0 && topP === 1.0 → argmax
   * 其他所有情况（包括默认配置 T=1.0）→ 概率采样
   */
  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const isGreedy =
      config.temperature === 0 &&
      config.topK === 0 &&
      config.topP === 1.0;

    return {
      logits,
      maskedIndices: [],
      description: isGreedy
        ? "Argmax (greedy selection)"
        : "Sample from probability distribution",
    };
  }
}
