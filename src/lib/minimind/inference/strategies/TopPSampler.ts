// ============================================================
// MiniMind — inference/strategies/TopPSampler.ts
// ============================================================
// TopPSampler — Top-P (Nucleus) 过滤策略
//
// 核心功能：
//   保留累积概率 ≥ P 的最小 token 集合，其余屏蔽。
//
// 算法：
//   1. 对 logits 应用 softmax → 概率分布
//   2. 按概率降序排序
//   3. 累加概率，找到 cumsum ≥ P 的截断点
//   4. 未进入累计集合的 token 设为 -1e9
//
// 与 Top-K 的区别：
//   Top-K 固定数量，Top-P 固定概率质量。
//   Top-P 能自适应分布形状 — 尖锐分布保留更少 token，
//   平坦分布保留更多 token。
//
// 特殊情况：
//   P >= 1.0  → 禁用，不修改 logits
//   P <= 0    → 仅保留概率最高的 token（等价于 argmax，但走 softmax）
//
// 教育重点：
//   - Nucleus Sampling 是 Top-K 的改进 — 自适应截断
//   - "Nucleus"（核心）指概率质量集中的少数 token
//   - P=0.95 表示"保留构成 95% 置信度的最小 token 集合"
// ============================================================

import type { SamplingStrategy, SamplingConfig, LogitsTransformResult } from "../types";
import { softmax } from "../../attention/math";

export class TopPSampler implements SamplingStrategy {
  readonly id = "topp";
  readonly name = "Top-P (Nucleus) Filtering";

  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const P = config.topP;

    // 禁用
    if (P >= 1.0) {
      return {
        logits,
        maskedIndices: [],
        description: "Top-P disabled",
      };
    }

    // 计算概率分布
    const probs = softmax(logits);

    // 按概率降序排序
    const indexed = probs.map((prob, index) => ({ prob, index }));
    indexed.sort((a, b) => b.prob - a.prob);

    // 累加概率，找到截断点
    let cumsum = 0;
    const kept = new Set<number>();
    for (const item of indexed) {
      kept.add(item.index);
      cumsum += item.prob;
      if (cumsum >= P) break;
    }

    // 屏蔽未保留的 token
    const MASK_VALUE = -1e9;
    const masked = new Array(logits.length);
    const maskedIndices: number[] = [];
    let maskedCount = 0;

    for (let i = 0; i < logits.length; i++) {
      if (!kept.has(i)) {
        masked[i] = MASK_VALUE;
        maskedIndices.push(i);
        maskedCount++;
      } else {
        masked[i] = logits[i];
      }
    }

    return {
      logits: masked,
      maskedIndices,
      description: `Nucleus P=${P} kept ${kept.size}, masked ${maskedCount}`,
    };
  }
}
