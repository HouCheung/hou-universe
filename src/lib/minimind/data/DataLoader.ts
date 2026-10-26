// ============================================================
// MiniMind — data/DataLoader.ts
// ============================================================
// DataLoader — 批量数据加载器
//
// 核心功能：
//   - 封装 Dataset + BatchSampler → 批量迭代
//   - 支持 shuffle（通过 BatchSampler 实现）
//   - 支持可配置 batchSize
//   - 迭代器接口 — for...of 和手动 .next()
//
// 设计灵感来自 PyTorch DataLoader：
//   - Dataset 提供数据
//   - Sampler 决定索引顺序
//   - DataLoader 协调两者并输出 batch
//
// 使用方式：
//
// ```ts
// const dataset = new TextDataset({ tokenizer, corpus, blockSize: 32 });
// const loader = new DataLoader(dataset, {
//   batchSize: 8,
//   shuffle: true,
//   seed: 42,
// });
//
// for (const batch of loader) {
//   // batch → TextSample[]（长度为 batchSize）
//   // batch[0].inputIds → number[]
// }
// ```
//
// 设计原则：
//   - 组合优于继承 — 持有 Dataset 和 BatchSampler 引用
//   - 泛型 — 适配任何 Dataset<T> 子类
//   - 懒惰迭代 — 按需调用 dataset.get()，不预加载
//   - 不可变配置 — 构造后选项固定
// ============================================================

import { Dataset } from "./Dataset";
import { BatchSampler } from "./BatchSampler";
import type { BatchSamplerOptions } from "./BatchSampler";

/**
 * DataLoader 配置选项
 *
 * 与 BatchSamplerOptions 对齐，但 batchSize 为必填。
 */
export interface DataLoaderOptions {
  /** 每个 batch 的样本数 — 必须 > 0 */
  batchSize: number;
  /** 是否在每个 epoch 开始时 shuffle，默认 false */
  shuffle?: boolean;
  /** 随机种子 — 相同种子产生相同 shuffle 顺序 */
  seed?: number;
  /** 是否丢弃最后不足 batchSize 的 batch，默认 true */
  dropLast?: boolean;
}

// ============================================================
// DataLoaderState — Serializable state for checkpoint/resume
// ============================================================

/**
 * Serializable snapshot of DataLoader position for training resume.
 *
 * Captures enough information to continue iteration from the exact
 * same batch in the same epoch after a checkpoint restore.
 *
 * The batch order for shuffled loaders is deterministic because
 * BatchSampler uses Random.seededShuffle() with a fixed seed,
 * so restoring the positional state is sufficient to resume
 * from the exact same point.
 */
export interface DataLoaderState {
  /** Current epoch index (0-based) */
  currentEpoch: number;
  /** Current batch index within the epoch (0-based) */
  currentBatch: number;
  /** Total dataset size */
  datasetSize: number;
  /** Batch size */
  batchSize: number;
  /** Whether shuffle is enabled */
  shuffle: boolean;
  /** Shuffle seed */
  seed: number;
  /** Whether last incomplete batch is dropped */
  dropLast: boolean;
}

/**
 * DataLoader<T> — 批量数据加载器
 *
 * 核心职责：
 *   协调 Dataset 和 BatchSampler，按 batch 输出样本。
 *   DataLoader 不关心样本的具体结构 — 泛型 T 由 Dataset<T> 决定。
 *
 * 迭代语义：
 *   每次迭代返回 T[]（batch 内的样本数组），长度为 batchSize
 *   （或更少，如果 dropLast=false 且最后一 batch 不完整）。
 *   DataLoader 不执行 collate/stack 操作 —
 *   消费者（训练循环）负责将 T[] 转换为模型输入格式。
 *
 * 使用方式：
 *
 * ```ts
 * const loader = new DataLoader(dataset, { batchSize: 8, shuffle: true, seed: 42 });
 *
 * // for...of
 * for (const batch of loader) {
 *   // batch → TextSample[]
 * }
 *
 * // 手动迭代
 * const iterator = loader[Symbol.iterator]();
 * const firstBatch = iterator.next();
 * ```
 */
export class DataLoader<T> {
  private dataset: Dataset<T>;
  private options: Required<DataLoaderOptions>;

  /**
   * Internal positional state for checkpointing.
   * Tracks the current epoch and batch index so that
   * stateDict()/loadStateDict() can capture resume position.
   */
  private _currentEpoch: number = 0;
  private _currentBatch: number = 0;

  /**
   * @param dataset — Dataset<T> 实例（依赖注入）
   * @param options — 加载器配置
   */
  constructor(dataset: Dataset<T>, options: DataLoaderOptions) {
    if (options.batchSize <= 0) {
      throw new Error(
        `DataLoader: batchSize must be > 0, got ${options.batchSize}`
      );
    }

    this.dataset = dataset;
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
   * 每次调用创建独立的迭代器（和独立的 BatchSampler）。
   * 如果 shuffle=true，每隔迭代器拥有独立的 shuffle 序列。
   *
   * 示例：
   *   // 多次遍历
   *   for (const batch of loader) { ... }
   *   for (const batch of loader) { ... } // 新的 shuffle
   */
  [Symbol.iterator](): Iterator<T[]> {
    return new DataLoaderIterator(
      this.dataset,
      this.dataset.length(),
      this.options
    );
  }

  /**
   * numBatches — 每个 epoch 的 batch 数量
   */
  get numBatches(): number {
    const sampler = new BatchSampler(this.dataset.length(), {
      batchSize: this.options.batchSize,
      dropLast: this.options.dropLast,
    });
    return sampler.numBatches;
  }

  /** 获取底层 Dataset 引用 */
  get datasetRef(): Dataset<T> {
    return this.dataset;
  }

  /** 获取当前配置的只读副本 */
  get config(): Readonly<Required<DataLoaderOptions>> {
    return { ...this.options };
  }

  // ============================================================
  // State persistence for checkpointing (Phase 48)
  // ============================================================

  /**
   * Serialize the current DataLoader positional state for checkpointing.
   *
   * Captures epoch index, batch index, and configuration so that
   * training can resume from the exact same batch after restore.
   *
   * Call this when saving a checkpoint during training.
   *
   * @returns Serializable DataLoaderState
   */
  stateDict(): DataLoaderState {
    return {
      currentEpoch: this._currentEpoch,
      currentBatch: this._currentBatch,
      datasetSize: this.dataset.length(),
      batchSize: this.options.batchSize,
      shuffle: this.options.shuffle,
      seed: this.options.seed,
      dropLast: this.options.dropLast,
    };
  }

  /**
   * Restore DataLoader positional state from a checkpoint.
   *
   * After restore, the next [Symbol.iterator]() call followed by
   * skipping `currentBatch` batches will continue from the exact
   * same position.
   *
   * @param state - Previously saved state from stateDict()
   */
  loadStateDict(state: DataLoaderState): void {
    this._currentEpoch = state.currentEpoch;
    this._currentBatch = state.currentBatch;
  }

  /**
   * Update the internal positional tracking.
   *
   * Called by the Trainer after each batch to keep the state
   * accurate for checkpointing.
   *
   * @param epoch  - Current epoch index (0-based)
   * @param batch  - Current batch index within epoch (0-based)
   */
  updatePosition(epoch: number, batch: number): void {
    this._currentEpoch = epoch;
    this._currentBatch = batch;
  }
}

/**
 * DataLoaderIterator — 内部迭代器实现
 *
 * 状态机：构造 → 创建 BatchSampler → 遍历 batch 索引 → 收集样本 → 输出
 */
class DataLoaderIterator<T> implements Iterator<T[]> {
  private dataset: Dataset<T>;
  private samplerIterator: Iterator<number[]>;

  constructor(
    dataset: Dataset<T>,
    datasetSize: number,
    options: Required<DataLoaderOptions>
  ) {
    this.dataset = dataset;

    const samplerOptions: BatchSamplerOptions = {
      batchSize: options.batchSize,
      shuffle: options.shuffle,
      seed: options.seed,
      dropLast: options.dropLast,
    };

    const sampler = new BatchSampler(datasetSize, samplerOptions);
    this.samplerIterator = sampler[Symbol.iterator]();
  }

  next(): IteratorResult<T[]> {
    const samplerResult = this.samplerIterator.next();

    if (samplerResult.done || samplerResult.value === undefined) {
      return { value: undefined, done: true };
    }

    const indices = samplerResult.value;

    // 从 Dataset 收集样本
    const batch: T[] = [];
    for (const idx of indices) {
      batch.push(this.dataset.get(idx));
    }

    return { value: batch, done: false };
  }
}
