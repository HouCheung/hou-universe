// ============================================================
// MiniMind — Embedding.ts
// ============================================================
// MiniEmbedding V1 — 可解释的 Embedding 引擎
//
// 核心功能：
//   - 将离散 token ID 映射为稠密向量（dense vector）
//   - 内部维护 [vocabSize × embeddingDim] 矩阵
//   - 支持单 token / 批量 lookup
//   - 确定性初始化，无第三方依赖
//
// 数据流：
//   Token ID（整数）
//     → W_embed[row] 查表
//     → d_model 维稠密向量
//
// 教育重点：
//   - 矩阵的每一行是一个 token 的语义表示
//   - 所有向量共处于同一个语义空间
//   - 参数完全透明，可随时检查
// ============================================================

import type { EmbeddingConfig, EmbeddingVector } from "./types";

/**
 * 矩阵信息 — getMatrixInfo() 返回值
 */
export interface MatrixInfo {
  /** 词汇表大小（矩阵行数） */
  vocabSize: number;
  /** Embedding 维度（矩阵列数） */
  embeddingDim: number;
  /** 总参数量 = vocabSize × embeddingDim */
  totalParameters: number;
}

// ============================================================
// Deterministic PRNG — Mulberry32
// ============================================================
//
// 为什么自己实现随机数生成器？
//
//   教育目的 — 让 embedding 初始化完全透明。
//   `Math.random()` 每次运行结果不同（不可复现），
//   第三方库（如 seedrandom）隐藏了细节。
//
//   Mulberry32 是一个 32-bit 的 PRNG，
//   给定相同的 seed，始终产生相同的随机序列。
//   这意味着相同的 vocabSize + embeddingDim
//   始终生成完全相同的 embedding 矩阵 —
//   非常适合教学和对比实验。
//
//   算法来源：Tommy Ettinger (2017)
//   周期：~2^32
// ============================================================

/**
 * 创建一个基于 Mulberry32 算法的确定型 PRNG
 *
 * 返回值在 [0, 1) 区间内均匀分布。
 * 相同 seed 始终产生相同的随机序列。
 */
function createPRNG(seed: number): () => number {
  let state = seed | 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// MiniEmbedding
// ============================================================

/**
 * MiniEmbedding — 教育用 Embedding 引擎
 *
 * 核心职责：
 *   将离散的整数 token ID 映射为连续的稠密向量。
 *   内部维护一个 [vocabSize × embeddingDim] 的可检查矩阵。
 *
 * 使用方式：
 *
 * ```ts
 * const emb = new MiniEmbedding({ vocabSize: 6400, embeddingDim: 512 });
 *
 * // 单 token lookup
 * const vec = emb.getEmbedding(42);
 * // → Float64Array(512) [0.0012, -0.0045, ...]
 *
 * // 批量 lookup
 * const vecs = emb.getEmbeddings([128, 456, 789]);
 * // → [Float64Array(512), Float64Array(512), Float64Array(512)]
 *
 * // 矩阵信息
 * const info = emb.getMatrixInfo();
 * // → { vocabSize: 6400, embeddingDim: 512, totalParameters: 3276800 }
 * ```
 *
 * 教育设计：
 *   - 矩阵完全公开 — 随时可检查任意 token 的向量
 *   - 确定性初始化 — 相同配置始终产生相同矩阵
 *   - 零外部依赖 — 纯 TypeScript 实现
 */
export class MiniEmbedding {
  private matrix: Float64Array[];
  private config: EmbeddingConfig;

  /**
   * @param config — { vocabSize, embeddingDim }
   *
   * 构造时立即初始化 embedding 矩阵：
   *   1. 为每个 token（0 到 vocabSize-1）生成一行向量
   *   2. 每行向量的值由确定性 PRNG（种子 = tokenId）生成
   *   3. 值范围近似 N(0, 0.02)，模拟 Xavier 初始化
   */
  constructor(config: EmbeddingConfig) {
    if (config.vocabSize <= 0) {
      throw new Error(
        `vocabSize must be positive, got ${config.vocabSize}`
      );
    }
    if (config.embeddingDim <= 0) {
      throw new Error(
        `embeddingDim must be positive, got ${config.embeddingDim}`
      );
    }

    this.config = { ...config };
    this.matrix = this.initializeMatrix();
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * getEmbedding(tokenId) — 获取单个 token 的 embedding 向量
   *
   * 输入：token ID（整数，0 ≤ tokenId < vocabSize）
   * 输出：长度为 embeddingDim 的向量（Float64Array）
   *
   * O(1) 查表操作 — 直接返回矩阵中对应行。
   *
   * 越界行为：返回零向量并 console.warn。
   * 生产环境会抛异常；教学环境以警告方式提示，
   * 方便在 Playground 中观察边界行为。
   *
   * 示例：
   *   emb.getEmbedding(42)
   *   // → Float64Array(512) [0.0012, -0.0045, 0.0078, ...]
   */
  getEmbedding(tokenId: number): EmbeddingVector {
    const row = this.safeLookup(tokenId);
    if (row === null) {
      // 越界 — 返回零向量，帮助理解边界情况
      return new Array<number>(this.config.embeddingDim).fill(0);
    }
    return Array.from(row);
  }

  /**
   * getEmbeddings(tokenIds) — 批量获取多个 token 的 embedding 向量
   *
   * 输入：token ID 数组
   * 输出：向量数组（每个元素是 number[]）
   *
   * 内部逐 token 调用 getEmbedding()，
   * 保持单一职责 — 不重复查表逻辑。
   *
   * 越界的 token ID 返回零向量。
   *
   * 示例：
   *   emb.getEmbeddings([128, 456, 789])
   *   // → [[0.0033,...], [0.0015,...], [-0.0021,...]]
   */
  getEmbeddings(tokenIds: number[]): EmbeddingVector[] {
    return tokenIds.map((id) => this.getEmbedding(id));
  }

  /**
   * getMatrixInfo() — 获取 embedding 矩阵的元信息
   *
   * 返回值：
   *   - vocabSize      词汇表大小（行数）
   *   - embeddingDim   Embedding 维度（列数 / d_model）
   *   - totalParameters  总参数量 = vocabSize × embeddingDim
   *
   * 教育用途：
   *   - 在 Playground 中展示参数量占比
   *   - 帮助理解为何 embedding 层占模型参数的 ~12%
   *     （以 MiniMind 为例：6400×512 = 3,276,800 / 26M ≈ 12.6%）
   *
   * 示例：
   *   emb.getMatrixInfo()
   *   // → { vocabSize: 6400, embeddingDim: 512, totalParameters: 3276800 }
   */
  getMatrixInfo(): MatrixInfo {
    return {
      vocabSize: this.config.vocabSize,
      embeddingDim: this.config.embeddingDim,
      totalParameters: this.config.vocabSize * this.config.embeddingDim,
    };
  }

  /**
   * getRawMatrix() — 获取完整的 embedding 矩阵（只读引用）
   *
   * 返回内部矩阵的引用（非拷贝），用于：
   *   - PCA / t-SNE 降维可视化
   *   - 语义空间探索
   *   - 余弦相似度计算
   *
   * 注意：返回的是 Float64Array[] 引用，
   * 修改会影响内部状态。教学环境中这是刻意为之 —
   * 让用户可以直接观察和"触摸"内部数据。
   *
   * 示例：
   *   const matrix = emb.getRawMatrix();
   *   matrix[0]  // token 0 的完整向量（512 维）
   */
  getRawMatrix(): ReadonlyArray<Float64Array> {
    return this.matrix;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 初始化 embedding 矩阵
   *
   * 对 vocabSize 中的每个 token 调用 generateRow()，
   * 每行独立生成（行与行之间无依赖），
   * 使用 tokenId 作为 PRNG 种子确保确定性。
   */
  private initializeMatrix(): Float64Array[] {
    const rows: Float64Array[] = new Array(this.config.vocabSize);

    for (let i = 0; i < this.config.vocabSize; i++) {
      rows[i] = this.generateRow(i);
    }

    return rows;
  }

  /**
   * 为单个 token 生成 embedding 向量
   *
   * 算法：
   *   1. 以 tokenId 为种子创建 PRNG
   *   2. 生成 embeddingDim 个随机值
   *   3. 将 [0, 1) 均匀分布映射到近似 N(0, scale) 的小值
   *
   * scale 取值理由：
   *   使用 Xavier uniform 边界公式: sqrt(6 / embeddingDim)
   *   对于 d_model=512: sqrt(6/512) ≈ 0.108
   *   除以 5 后 ≈ 0.0216 → 近似 N(0, 0.02) 的直观效果，
   *   同时避免极端值影响可视化。
   *
   * 确定性保证：
   *   相同 tokenId + embeddingDim → 完全相同的向量，
   *   无论何时何地运行。
   */
  private generateRow(tokenId: number): Float64Array {
    const dim = this.config.embeddingDim;
    const row = new Float64Array(dim);

    // 以 tokenId 为种子 — 确保每个 token 的向量是确定且唯一的
    const rand = createPRNG(tokenId);

    // Xavier uniform 边界
    // 标准公式: U(-sqrt(6/dim), +sqrt(6/dim))
    const scale = Math.sqrt(6 / dim);

    for (let j = 0; j < dim; j++) {
      // 将 [0, 1) 映射到 [-scale, +scale)
      // 每个维度消耗一次 PRNG 调用，保证序列可复现
      row[j] = (rand() * 2 - 1) * scale;
    }

    return row;
  }

  /**
   * 安全查表 — 检查 tokenId 是否在有效范围内
   *
   * 返回 null 表示越界；
   * 否则返回对应的 Float64Array 行引用。
   */
  private safeLookup(tokenId: number): Float64Array | null {
    if (tokenId < 0 || tokenId >= this.config.vocabSize) {
      console.warn(
        `[MiniEmbedding] tokenId ${tokenId} out of range [0, ${this.config.vocabSize - 1}], returning zero vector`
      );
      return null;
    }
    return this.matrix[tokenId];
  }
}
