// ============================================================
// MiniMind — inference/Sampler.ts
// ============================================================
// Sampler — 采样策略管道编排器
//
// 核心功能：
//   按固定顺序执行采样策略管道，将 logits 转换为具体的 token 选择。
//
// 管道顺序：
//   TemperatureSampler → TopKSampler → TopPSampler → GreedySampler
//
// 最后一步（argmax 或概率采样）在编排器中执行。
//
// 教育重点：
//   - 采样策略可组合 — 管道顺序影响结果
//   - 透明性 — 每一步的变换都有 description 记录
//   - 依赖注入 — 策略由外部提供，编排器只负责执行
// ============================================================

import type {
  SamplingStrategy,
  SamplingConfig,
  GenerationStep,
  TokenAlternative,
} from "./types";
import { softmax } from "../attention/math";

/**
 * Sampler — 采样策略管道编排器
 *
 * 核心职责：
 *   按顺序执行注入的采样策略，最后从变换后的 logits 中选择一个 token。
 *   记录管道描述和备选 token 信息。
 *
 * 使用方式：
 *
 * ```ts
 * const sampler = new Sampler([
 *   new TemperatureSampler(),
 *   new TopKSampler(),
 *   new TopPSampler(),
 *   new GreedySampler(),
 * ]);
 *
 * const result = sampler.sample(logits, { temperature: 0.8, topK: 40, topP: 0.95 });
 * // result → { tokenId, token, probability, logit, alternatives, pipelineDescription }
 * ```
 */
export class Sampler {
  private strategies: SamplingStrategy[];

  /**
   * @param strategies — 按执行顺序排列的策略列表
   */
  constructor(strategies: SamplingStrategy[]) {
    this.strategies = strategies;
  }

  /**
   * sample(logits, config, tokenLabels?) — 从 logits 中采样一个 token
   *
   * 步骤：
   *   1. 按顺序执行每个策略的 apply() 方法
   *   2. 收集每个策略的 description
   *   3. 从最终 logits 中选择 token：
   *      - temperature=0 且无过滤 → argmax
   *      - 否则 → 从 softmax 概率分布中采样
   *   4. 构建备选 token 列表（top-K alternatives）
   *
   * @param logits      — 原始 logits 向量 [vocabSize]
   * @param config      — 采样配置
   * @param tokenLabels — token ID → token 字符串的映射（用于构建 alternatives）
   * @returns             选择结果
   */
  sample(
    logits: number[],
    config: SamplingConfig,
    tokenLabels?: Map<number, string>
  ): {
    tokenId: number;
    probability: number;
    logit: number;
    alternatives: TokenAlternative[];
    pipelineDescription: string;
  } {
    // ── 执行策略管道 ──
    const descriptions: string[] = [];
    let current = logits;

    for (const strategy of this.strategies) {
      const result = strategy.apply(current, config);
      current = result.logits;
      if (result.description) {
        descriptions.push(result.description);
      }
    }

    const pipelineDescription = descriptions.join(" → ");

    // ── 计算概率分布 ──
    const probs = softmax(current);

    // ── 选择 token ──
    let tokenId: number;
    const isGreedy =
      config.temperature === 0 &&
      config.topK === 0 &&
      config.topP === 1.0;

    if (isGreedy) {
      // 纯 argmax
      tokenId = this.argmax(current);
    } else {
      // 从概率分布中采样
      tokenId = this.sampleFromDistribution(probs);
    }

    // ── 构建备选列表（top-K alternatives） ──
    const indexed = probs.map((prob, idx) => ({ prob, idx }));
    indexed.sort((a, b) => b.prob - a.prob);
    const topN = Math.min(10, indexed.length);
    const alternatives: TokenAlternative[] = [];

    for (let rank = 0; rank < topN; rank++) {
      const { idx, prob } = indexed[rank];
      alternatives.push({
        rank: rank + 1,
        tokenId: idx,
        token: tokenLabels?.get(idx) ?? `[${idx}]`,
        logit: current[idx],
        probability: prob,
      });
    }

    return {
      tokenId,
      probability: probs[tokenId],
      logit: current[tokenId],
      alternatives,
      pipelineDescription,
    };
  }

  /**
   * getStrategies() — 获取注入的策略列表
   */
  getStrategies(): SamplingStrategy[] {
    return [...this.strategies];
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * argmax — 找到数组中最大值的索引
   */
  private argmax(arr: number[]): number {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > maxVal) {
        maxVal = arr[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  /**
   * sampleFromDistribution — 从概率分布中加权随机采样
   *
   * @param probs — 概率分布（和应为 1）
   * @returns       采样到的索引
   */
  private sampleFromDistribution(probs: number[]): number {
    const r = Math.random();
    let cumsum = 0;
    for (let i = 0; i < probs.length; i++) {
      cumsum += probs[i];
      if (r < cumsum) return i;
    }
    return probs.length - 1;
  }
}
