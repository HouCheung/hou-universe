// ============================================================
// MiniMind — data/BatchSampler.ts
// ============================================================
// BatchSampler — 批量索引采样器
//
// 核心功能：
//   - 将数据集索引划分为固定大小的 batch
//   - 支持 shuffle（基于确定性种子的随机打乱）
//   - 支持 dropLast（丢弃最后不完整的 batch）
//
// 种子 RNG 实现：
//   使用 Mulberry32 — 一个简单、快速的 32-bit PRNG。
//   相同种子 → 相同 shuffle 顺序，保证实验可复现。
//
// 使用方式：
//
// ```ts
// const sampler = new BatchSampler(100, { batchSize: 16, shuffle: true, seed: 42 });
// for (const batch of sampler) {
//   // batch → [13, 7, 21, ...]（16 个索引）
// }
// ```
//
// 设计原则：
//   - 确定性 — 相同配置产生相同结果
//   - 组合优于继承 — 独立于 Dataset，只负责索引
//   - 迭代器模式 — 支持 for...of 和手动 .next()
// ============================================================

import { Random } from "../core/random/Random";

/**
 * BatchSampler 配置选项
 */
export interface BatchSamplerOptions {
  /** 每个 batch 的样本数 — 必须 > 0 */
  batchSize: number;
  /** 是否在每个 epoch 开始时 shuffle 索引，默认 false */
  shuffle?: boolean;
  /** 随机种子 — 相同种子产生相同 shuffle 顺序，默认 0 */
  seed?: number;
  /** 是否丢弃最后不足 batchSize 的 batch，默认 true */
  dropLast?: boolean;
}

/**
 * BatchSampler — 批量索引采样器
 *
 * 将 0 到 datasetSize-1 的索引序列划分为固定大小的 batch。
 * 可选 shuffle 和 dropLast。
 *
 * 核心职责：
 *   生成索引 batch — 不持有数据，不持有 Dataset 引用。
 *   DataLoader 使用这些索引从 Dataset 中收集样本。
 *
 * 使用方式：
 *
 * ```ts
 * const sampler = new BatchSampler(100, {
 *   batchSize: 16,
 *   shuffle: true,
 *   seed: 42,
 *   dropLast: true,
 * });
 *
 * // 迭代所有 batch
 * for (const batchIndices of sampler) {
 *   // batchIndices: number[] — 长度为 batchSize（或更少，如果 dropLast=false）
 * }
 *
 * // 手动迭代
 * const iterator = sampler[Symbol.iterator]();
 * const firstBatch = iterator.next(); // { value: [13, 7, ...], done: false }
 * ```
 */
export class BatchSampler {
  private datasetSize: number;
  private options: Required<BatchSamplerOptions>;

  /**
   * @param datasetSize — 数据集中的样本总数（必须 >= 0）
   * @param options     — 采样配置
   */
  constructor(datasetSize: number, options: BatchSamplerOptions) {
    if (datasetSize < 0) {
      throw new Error(
        `BatchSampler: datasetSize must be >= 0, got ${datasetSize}`
      );
    }
    if (options.batchSize <= 0) {
      throw new Error(
        `BatchSampler: batchSize must be > 0, got ${options.batchSize}`
      );
    }

    this.datasetSize = datasetSize;
    this.options = {
      batchSize: options.batchSize,
      shuffle: options.shuffle ?? false,
      seed: options.seed ?? 0,
      dropLast: options.dropLast ?? true,
    };
  }

  /**
   * [Symbol.iterator] — 创建新的 batch 迭代器
   *
   * 每次调用创建独立的迭代器，支持多次遍历。
   * 如果 shuffle=true，每次迭代器创建时独立 shuffle。
   */
  [Symbol.iterator](): Iterator<number[]> {
    return new BatchIterator(this.datasetSize, this.options);
  }

  /**
   * numBatches — 计算 batch 总数
   *
   * dropLast=true:   Math.floor(datasetSize / batchSize)
   * dropLast=false:  Math.ceil(datasetSize / batchSize)
   */
  get numBatches(): number {
    if (this.datasetSize === 0) return 0;
    if (this.options.dropLast) {
      return Math.floor(this.datasetSize / this.options.batchSize);
    }
    return Math.ceil(this.datasetSize / this.options.batchSize);
  }

  /** 获取当前配置的只读副本 */
  get config(): Readonly<Required<BatchSamplerOptions>> {
    return { ...this.options };
  }

  /** 获取数据集大小 */
  get size(): number {
    return this.datasetSize;
  }
}

/**
 * BatchIterator — 内部迭代器实现
 *
 * 状态机：构造 → 生成索引序列 → 可选 shuffle → 切片输出
 */
class BatchIterator implements Iterator<number[]> {
  private indices: number[];
  private batchSize: number;
  private dropLast: boolean;
  private position: number;

  constructor(datasetSize: number, options: Required<BatchSamplerOptions>) {
    // 生成 0..datasetSize-1 索引序列
    this.indices = Array.from({ length: datasetSize }, (_, i) => i);

    // 可选 shuffle — 使用 Random.seededShuffle 保证隔离性
    if (options.shuffle) {
      Random.seededShuffle(this.indices, options.seed);
    }

    this.batchSize = options.batchSize;
    this.dropLast = options.dropLast;
    this.position = 0;
  }

  next(): IteratorResult<number[]> {
    if (this.position >= this.indices.length) {
      return { value: undefined, done: true };
    }

    // 计算当前 batch 的结束位置
    const end = Math.min(this.position + this.batchSize, this.indices.length);
    const batchSize = end - this.position;

    // dropLast: 最后一个不完整的 batch 被丢弃
    if (this.dropLast && batchSize < this.batchSize) {
      return { value: undefined, done: true };
    }

    const batch = this.indices.slice(this.position, end);
    this.position = end;

    return { value: batch, done: false };
  }
}
