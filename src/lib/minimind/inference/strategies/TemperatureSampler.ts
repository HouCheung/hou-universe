// ============================================================
// MiniMind — inference/strategies/TemperatureSampler.ts
// ============================================================
// TemperatureSampler — 温度缩放策略
//
// 核心功能：
//   将 logits 除以 temperature，控制概率分布的"锐度"。
//
// 公式：
//   logits_scaled[i] = logits[i] / T
//   softmax(logits_scaled) 在 T<1 时更尖锐，T>1 时更平坦
//
// 特殊情况：
//   T = 0  → 纯贪婪（由 Sampler 编排器处理，此策略直接返回原 logits）
//   T = 1.0 → 无操作（除以 1 不变）
//   T < 1.0 → 更尖锐（高概率 token 更可能被选中，低多样性）
//   T > 1.0 → 更平坦（概率分布更均匀，高多样性）
//
// 教育重点：
//   - 温度是控制"创造力"的核心参数
//   - 不改变 token 的相对排名 — 只改变概率差距
//   - T→0 趋近于 argmax，T→∞ 趋近于均匀分布
// ============================================================

import type { SamplingStrategy, SamplingConfig, LogitsTransformResult } from "../types";

export class TemperatureSampler implements SamplingStrategy {
  readonly id = "temperature";
  readonly name = "Temperature Scaling";

  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const T = config.temperature;

    // T < 0 → 无效温度，不做变换
    if (T < 0) {
      return {
        logits,
        maskedIndices: [],
        description: "T < 0 (invalid, no scaling)",
      };
    }

    // T=0 → 贪婪模式 — 由编排器处理，此处不做变换
    if (T === 0) {
      return {
        logits,
        maskedIndices: [],
        description: "T=0 → greedy (argmax)",
      };
    }

    // T=1.0 → 无操作
    if (T === 1.0) {
      return {
        logits,
        maskedIndices: [],
        description: "T=1.0 (no scaling)",
      };
    }

    // T > 0: 缩放 logits
    const scaled = new Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      scaled[i] = logits[i] / T;
    }

    return {
      logits: scaled,
      maskedIndices: [],
      description: `Scaled by T=${T}`,
    };
  }
}
