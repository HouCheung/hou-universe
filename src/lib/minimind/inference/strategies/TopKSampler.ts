// ============================================================
// MiniMind — inference/strategies/TopKSampler.ts
// ============================================================
// TopKSampler — Top-K 过滤策略
//
// 核心功能：
//   仅保留 logits 最高的 K 个 token，其余设为 -Infinity。
//
// 算法：
//   1. 找出第 K 大的 logit 值（阈值）
//   2. 将低于阈值的所有 logit 设为 -1e9（等价于 softmax 概率 ≈ 0）
//   3. 记录被屏蔽的 token 索引
//
// 特殊情况：
//   K = 0  → 禁用，不修改 logits
//   K >= vocabSize → 无操作（保留全部）
//
// 教育重点：
//   - Top-K 是最简单的截断策略 — "只要最好的 K 个"
//   - 小 K → 高确定性、低多样性（只考虑最可能的少数选项）
//   - 大 K → 低确定性、高多样性
//   - 固定 K 的问题：对不同分布不公平（平坦分布 vs 尖锐分布）
// ============================================================

import type { SamplingStrategy, SamplingConfig, LogitsTransformResult } from "../types";
import { MASK_LOGIT } from "./constants";

export class TopKSampler implements SamplingStrategy {
  readonly id = "topk";
  readonly name = "Top-K Filtering";

  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const K = config.topK;

    // 禁用
    if (K <= 0) {
      return {
        logits,
        maskedIndices: [],
        description: "Top-K disabled",
      };
    }

    // K >= 词表大小 → 无操作
    if (K >= logits.length) {
      return {
        logits,
        maskedIndices: [],
        description: `Top-K=${K} (vocab size, no masking)`,
      };
    }

    // 找到第 K 大的值（使用部分排序：复制并排序前 K 个最大的）
    const indexed = logits.map((value, index) => ({ value, index }));
    indexed.sort((a, b) => b.value - a.value);
    const threshold = indexed[K - 1]?.value ?? -Infinity;

    // 屏蔽低于阈值的 token
    const masked = new Array(logits.length);
    const maskedIndices: number[] = [];
    let maskedCount = 0;

    for (let i = 0; i < logits.length; i++) {
      if (logits[i] < threshold) {
        masked[i] = MASK_LOGIT;
        maskedIndices.push(i);
        maskedCount++;
      } else {
        masked[i] = logits[i];
      }
    }

    return {
      logits: masked,
      maskedIndices,
      description: `Kept top ${K}, masked ${maskedCount}`,
    };
  }
}
