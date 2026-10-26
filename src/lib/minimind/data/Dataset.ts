// ============================================================
// MiniMind — data/Dataset.ts
// ============================================================
// Dataset — 通用数据集抽象基类
//
// 设计灵感来自 PyTorch Dataset：
//   - length() 返回数据集大小
//   - get(index) 按索引获取单个样本
//
// 子类只需实现这两个方法，即可与 DataLoader 配合使用。
//
// 泛型参数 T 表示单个样本的类型：
//   - TextDataset → TextSample
//   - 未来 ImageDataset → ImageSample
//   - 未来 AudioDataset → AudioSample
//
// 设计原则：
//   - 最小接口 — 仅 length() 和 get() 两个抽象方法
//   - 类型安全 — 泛型约束样本类型
//   - 索引式访问 — 支持随机采样
// ============================================================

/**
 * Dataset<T> — 通用数据集抽象基类
 *
 * 所有数据集实现此抽象类，提供 length() 和 get() 方法。
 * DataLoader 通过此接口消费数据，不关心具体实现细节。
 *
 * 使用方式：
 *
 * ```ts
 * class MyDataset extends Dataset<MySample> {
 *   length(): number { return this.samples.length; }
 *   get(index: number): MySample { return this.samples[index]; }
 * }
 * ```
 *
 * @typeParam T — 单个样本的类型
 */
export abstract class Dataset<T> {
  /**
   * length() — 返回数据集中的样本总数
   *
   * 必须返回非负整数。空数据集返回 0。
   */
  abstract length(): number;

  /**
   * get(index) — 按索引获取单个样本
   *
   * @param index — 0-based 样本索引，必须在 [0, length()) 范围内
   * @returns 索引对应的样本
   * @throws 如果 index 越界，子类应抛出有意义的错误
   */
  abstract get(index: number): T;

  /**
   * [Symbol.iterator] — 使 Dataset 可迭代
   *
   * 支持 for...of 循环，按顺序遍历所有样本。
   * 每次迭代调用 get() 获取样本。
   *
   * 示例：
   *   for (const sample of dataset) {
   *     console.log(sample);
   *   }
   */
  [Symbol.iterator](): Iterator<T> {
    let index = 0;
    const total = this.length();

    return {
      next: (): IteratorResult<T> => {
        if (index >= total) {
          return { value: undefined as unknown as T, done: true };
        }
        const value = this.get(index);
        index++;
        return { value, done: false };
      },
    };
  }
}
