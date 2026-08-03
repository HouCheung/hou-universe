// ============================================================
// MiniMind — pretrain/loss.ts
// ============================================================
// CrossEntropyLoss — 教育用交叉熵损失函数
//
// 核心功能：
//   - 从 logits 和 target token IDs 计算交叉熵损失
//   - 纯数学实现 — 零模型依赖，零外部依赖
//   - 逐 token 损失可检查
//
// 公式：
//   对每个位置 i：
//     p = softmax(logits[i])           — 概率分布
//     tokenLoss[i] = -log(p[target[i]]) — 负对数似然
//     loss = mean(tokenLoss)            — 平均
//
// 使用方式：
//   const lossFn = new CrossEntropyLoss();
//   const result = lossFn.forward(logits, targetIds);
//   // result.loss → 平均交叉熵
//   // result.tokenLosses → [每个位置的独立损失]
// ============================================================

import type { LossResult } from "./types";

/**
 * CrossEntropyLoss — 教育用交叉熵损失
 *
 * 核心职责：
 *   实现 logits → softmax → NLL → mean 的完整损失计算。
 *   不依赖模型、optimizer 或 dataset。
 *
 * 教育设计：
 *   - 每步计算显式展开 — softmax 不是黑盒
 *   - 数值稳定 — 使用 log-sum-exp trick 防止溢出
 *   - 逐 token 损失保留 — 可检查每个位置的预测质量
 */
export class CrossEntropyLoss {
  /**
   * forward(logits, targetIds) — 计算单个样本的交叉熵损失
   *
   * 算法：
   *   1. 对每个位置 i（除最后一个 — causal shift）：
   *      a. 从 logits[i] 计算 softmax → 概率分布
   *      b. 取 targetIds[i+1] 对应的负对数概率
   *   2. 对所有位置取平均
   *
   * Causal Shift 说明：
   *   在 Causal LM 中，位置 i 的 logits 预测位置 i+1 的 token。
   *   因此 logits[i] 的目标是 targetIds[i+1]。
   *   最后一个位置的 logits 没有目标 — 它预测的是"下一个"token。
   *
   * @param logits    — [seqLen, vocabSize] 模型输出（未归一化分数）
   * @param targetIds — [seqLen] 目标 token ID 序列
   * @returns            { loss, tokenLosses }
   *
   * 示例：
   *   const logits = [[0.1, 2.0, -1.0], [1.5, -0.5, 0.8], [0.2, 0.2, 3.0]];
   *   const targets = [1, 2, 0];
   *   const result = lossFn.forward(logits, targets);
   *   // result.loss → 平均交叉熵
   *   // result.tokenLosses.length → 2（seqLen-1，因为 causal shift）
   */
  forward(logits: number[][], targetIds: number[]): LossResult {
    if (logits.length === 0) {
      throw new Error("CrossEntropyLoss.forward: logits array is empty");
    }
    if (targetIds.length === 0) {
      throw new Error("CrossEntropyLoss.forward: targetIds array is empty");
    }
    if (logits.length !== targetIds.length) {
      throw new Error(
        `CrossEntropyLoss.forward: logits length (${logits.length}) ` +
          `must equal targetIds length (${targetIds.length})`
      );
    }

    // Causal shift: logits[i] 预测 targetIds[i+1]
    // 因此只有 seqLen-1 个有效预测位置
    const numPredictions = logits.length - 1;
    if (numPredictions <= 0) {
      throw new Error(
        "CrossEntropyLoss.forward: sequence too short " +
          `(length ${logits.length}), need at least 2 tokens for causal prediction`
      );
    }

    const tokenLosses: number[] = new Array(numPredictions);

    for (let i = 0; i < numPredictions; i++) {
      const logitRow = logits[i];
      const target = targetIds[i + 1]; // causal shift: predict next token

      if (target < 0 || target >= logitRow.length) {
        throw new Error(
          `CrossEntropyLoss.forward: target token ID ${target} ` +
            `out of range [0, ${logitRow.length - 1}] at position ${i}`
        );
      }

      // ── 数值稳定的 softmax + NLL ──
      // standard: -log(exp(logit[target]) / sum(exp(logits)))
      // stable:   -(logit[target] - logSumExp)
      const logSumExp = this.logSumExp(logitRow);
      const targetLogit = logitRow[target];

      tokenLosses[i] = -(targetLogit - logSumExp);
    }

    // 平均损失
    const loss =
      tokenLosses.reduce((sum, l) => sum + l, 0) / tokenLosses.length;

    return { loss, tokenLosses };
  }

  /**
   * forwardBatch(logitsBatch, targetIdsBatch) — 批量计算损失
   *
   * 对 batch 中每个样本调用 forward()，然后取平均。
   *
   * @param logitsBatch    — [batchSize][seqLen][vocabSize]
   * @param targetIdsBatch — [batchSize][seqLen]
   * @returns                 { loss: 平均损失, tokenLosses: 所有 token 损失 }
   */
  forwardBatch(
    logitsBatch: number[][][],
    targetIdsBatch: number[][]
  ): LossResult {
    if (logitsBatch.length === 0) {
      throw new Error("CrossEntropyLoss.forwardBatch: logitsBatch is empty");
    }
    if (logitsBatch.length !== targetIdsBatch.length) {
      throw new Error(
        `CrossEntropyLoss.forwardBatch: batch size mismatch — ` +
          `logitsBatch has ${logitsBatch.length} samples, ` +
          `targetIdsBatch has ${targetIdsBatch.length} samples`
      );
    }

    const allTokenLosses: number[] = [];

    for (let b = 0; b < logitsBatch.length; b++) {
      const result = this.forward(logitsBatch[b], targetIdsBatch[b]);
      allTokenLosses.push(...result.tokenLosses);
    }

    const loss =
      allTokenLosses.length > 0
        ? allTokenLosses.reduce((sum, l) => sum + l, 0) / allTokenLosses.length
        : 0;

    return { loss, tokenLosses: allTokenLosses };
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * logSumExp(values) — 数值稳定的 log(Σ exp(x_i))
   *
   * 使用 log-sum-exp trick：
   *   logSumExp = max + log(Σ exp(x_i - max))
   *
   * 这防止了 exp 对大值溢出。
   */
  private logSumExp(values: number[]): number {
    const maxVal = Math.max(...values);
    const sum = values.reduce((acc, v) => acc + Math.exp(v - maxVal), 0);
    return maxVal + Math.log(sum);
  }
}
