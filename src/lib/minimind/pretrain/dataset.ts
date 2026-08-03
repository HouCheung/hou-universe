// ============================================================
// MiniMind — pretrain/dataset.ts
// ============================================================
// ToyDataset — 教育用微型训练数据集
//
// 核心功能：
//   - 内置 5 句英文语料库
//   - 通过注入的 Tokenizer 将文本编码为 TrainingSample
//   - 提供迭代接口供 Pretrainer 消费
//
// 设计原则：
//   - 零外部依赖（仅依赖 MiniTokenizer 接口）
//   - Tokenizer 兼容 — 任何实现了 encode() 的 tokenizer 均可使用
//   - 过滤无效样本（空编码、超长序列）并发出警告
//   - 不可变 — 构造后样本固定
// ============================================================

import type { TrainingSample } from "./types";
import type { MiniTokenizer } from "../tokenizer/MiniTokenizer";

/**
 * 默认微型语料库
 *
 * 5 句简单英文，演示预训练数据的基本结构。
 * 每句 2-5 个 token，适合教育用途。
 */
const DEFAULT_CORPUS: readonly string[] = [
  "hello world",
  "hello minimind",
  "mini language model",
  "pretraining is fun",
  "the model learns patterns",
];

/**
 * ToyDataset — 教育用微型训练数据集
 *
 * 核心职责：
 *   持有训练样本的编码表示，提供迭代接口。
 *   不实现采样逻辑、batch 逻辑或数据增强 —
 *   这些留给 Pretrainer 或未来的 DataLoader。
 *
 * 使用方式：
 *
 * ```ts
 * const dataset = new ToyDataset(tokenizer);
 * console.log(dataset.size); // 5
 *
 * for (const sample of dataset) {
 *   // sample.inputIds → [4, 5]
 *   // sample.targetIds → [4, 5]
 * }
 * ```
 */
export class ToyDataset {
  private samples: TrainingSample[];
  private tokenizer: MiniTokenizer;

  /**
   * @param tokenizer — MiniTokenizer 实例（依赖注入）
   * @param corpus    — 可选自定义语料库（省略则使用 DEFAULT_CORPUS）
   *
   * 构造时立即编码所有文本。过滤空编码样本并发出警告。
   */
  constructor(tokenizer: MiniTokenizer, corpus?: readonly string[]) {
    this.tokenizer = tokenizer;
    const texts = corpus ?? DEFAULT_CORPUS;

    const encoded: TrainingSample[] = [];

    for (const text of texts) {
      const ids = tokenizer.encode(text);

      // 过滤空序列 — 可能由纯未知词或空文本导致
      if (ids.length === 0) {
        console.warn(
          `[ToyDataset] Skipping sample "${text}" — tokenizer produced empty encoding`
        );
        continue;
      }

      // 对于 Causal LM，targetIds 与 inputIds 相同 —
      // 损失函数内部处理 next-token 偏移
      encoded.push({
        inputIds: ids,
        targetIds: ids,
      });
    }

    if (encoded.length === 0) {
      throw new Error(
        "ToyDataset: all samples produced empty encodings. " +
          "Check that the tokenizer vocabulary covers the corpus words."
      );
    }

    this.samples = encoded;
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * getSamples() — 返回所有训练样本的副本
   *
   * 返回副本以防止外部修改内部状态。
   */
  getSamples(): TrainingSample[] {
    return this.samples.map((s) => ({
      inputIds: [...s.inputIds],
      targetIds: [...s.targetIds],
    }));
  }

  /**
   * size — 数据集样本数
   */
  get size(): number {
    return this.samples.length;
  }

  /**
   * [Symbol.iterator] — 使 ToyDataset 可迭代
   *
   * 支持 for...of 循环，每次迭代返回一个 TrainingSample 的副本。
   */
  [Symbol.iterator](): Iterator<TrainingSample> {
    let index = 0;
    const items = this.samples;

    return {
      next(): IteratorResult<TrainingSample> {
        if (index >= items.length) {
          return { value: undefined, done: true };
        }
        const sample = items[index];
        index++;
        return {
          value: {
            inputIds: [...sample.inputIds],
            targetIds: [...sample.targetIds],
          },
          done: false,
        };
      },
    };
  }
}
