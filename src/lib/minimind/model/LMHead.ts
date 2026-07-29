// ============================================================
// MiniMind — LMHead.ts
// ============================================================
// MiniLMHead V1 — 教育型 Language Model Head 引擎
//
// 核心功能：
//   - 将 hidden state 线性投影到 vocabulary 空间
//   - 输出 logits（未经 softmax 的原始分数）
//   - 权重矩阵完全透明，可随时检查
//
// 公式：
//   logits = hidden × W^T
//   其中 W: [vocabSize, dModel]
//
// 数据流：
//   Hidden State [dModel]
//     → Linear Projection (hidden · W[i] for each i)
//     → Logits [vocabSize]
//
// 教育重点：
//   - LM Head 是模型与词汇表的桥梁
//   - Logits = hidden state 与每个 token "理想向量"的相似度
//   - Softmax 不属于 LM Head — 留给 Inference/Loss 层
//   - 权重矩阵可解释 — 每一行是一个 token 的"原型向量"
// ============================================================

/**
 * MiniLMHead — 教育用 Language Model Head 引擎
 *
 * 核心职责：
 *   实现最简单的线性投影：hidden [dModel] → logits [vocabSize]。
 *   不包含 softmax — 那是 inference 或 loss 层的职责。
 *
 * 使用方式：
 *
 * ```ts
 * const lmHead = new MiniLMHead({ dModel: 512, vocabSize: 1000, seed: 42 });
 *
 * // 投影单个 token 的 hidden state
 * const hidden = [...512 dims...];
 * const logits = lmHead.forward(hidden);
 * // logits → [1000] 个分数，越高表示该 token 越可能
 *
 * // 批量投影
 * const hiddenBatch = [[...], [...], [...]];
 * const allLogits = lmHead.forward(hiddenBatch);
 * // allLogits → [3][1000]
 *
 * // 检查权重
 * const W = lmHead.getWeights();
 * // W → [vocabSize][dModel] 投影矩阵
 * ```
 *
 * 教育设计：
 *   - 权重完全透明 — W 可随时检查
 *   - 纯线性变换 — 理解最简单的 projection
 *   - 确定性初始化 — 相同 seed 产生相同权重
 *   - 无 softmax — 分离关注点，logits 语义更清晰
 */
export class MiniLMHead {
  private dModel: number;
  private vocabSize: number;
  /** 权重矩阵 W: [vocabSize, dModel] — 每行是一个 token 的投影向量 */
  private weights: number[][];

  /**
   * @param config — { dModel, vocabSize, seed? }
   *
   * 构造时立即：
   *   1. 验证参数（dModel > 0, vocabSize > 0）
   *   2. 使用 Xavier 初始化权重矩阵
   *
   * Xavier 初始化：
   *   权重从 N(0, sqrt(2 / (fanIn + fanOut))) 采样，
   *   确保前向和反向传播时信号的方差保持一致。
   *   fanIn = dModel, fanOut = vocabSize
   */
  constructor(config: { dModel: number; vocabSize: number; seed?: number }) {
    if (config.dModel <= 0) {
      throw new Error(`dModel must be positive, got ${config.dModel}`);
    }
    if (config.vocabSize <= 0) {
      throw new Error(`vocabSize must be positive, got ${config.vocabSize}`);
    }

    this.dModel = config.dModel;
    this.vocabSize = config.vocabSize;
    this.weights = this.initializeWeights(config.seed ?? 42);
  }

  // ============================================================
  // 公开 API — 前向传播
  // ============================================================

  /**
   * forward(hidden) — 将 hidden state 投影到 vocabulary 空间
   *
   * 接受单个向量 [dModel] 或批量矩阵 [seqLen, dModel]。
   *
   * 单个向量时返回 [vocabSize] logits。
   * 批量矩阵时返回 [seqLen, vocabSize]。
   *
   * 公式：
   *   logits[i] = Σ(hidden[j] × W[i][j])   for j = 0..dModel-1
   *
   * 参数：
   * @param hidden — [dModel] 或 [seqLen, dModel]
   * @returns          [vocabSize] 或 [seqLen, vocabSize]
   *
   * 示例：
   *   // 单个 token（取序列最后一个位置）
   *   const logits = lmHead.forward(hiddenStates[lastPos]);
   *   // logits → [vocabSize]
   *
   *   // 所有 token
   *   const allLogits = lmHead.forward(hiddenStates);
   *   // allLogits → [seqLen][vocabSize]
   */
  forward(hidden: number[]): number[];
  forward(hidden: number[][]): number[][];
  forward(hidden: number[] | number[][]): number[] | number[][] {
    if (typeof hidden[0] === "number") {
      return this.project(hidden as number[]);
    }
    return (hidden as number[][]).map((h) => this.project(h));
  }

  /**
   * project(vector) — 单个向量的线性投影
   *
   * 公开此方法以便教育用途：理解隐藏向量
   * 如何映射到每个词汇 token 的得分。
   *
   * 公式：
   *   logits[i] = vector · W[i]（点积）
   *
   * 解释：
   *   每个 token 在权重矩阵中有一行 W[i]。
   *   logits[i] 就是当前 hidden state 与该 token
   *   "理想向量"的相似度。相似度越高，
   *   该 token 越可能出现。
   *
   * 参数：
   * @param vector — [dModel] 隐藏向量
   * @returns         [vocabSize] logits
   */
  project(vector: number[]): number[] {
    if (vector.length !== this.dModel) {
      throw new Error(
        `Input dimension mismatch: expected dModel=${this.dModel}, ` +
          `got ${vector.length}`
      );
    }

    const logits: number[] = new Array(this.vocabSize);
    for (let v = 0; v < this.vocabSize; v++) {
      let sum = 0;
      const row = this.weights[v];
      for (let d = 0; d < this.dModel; d++) {
        sum += vector[d] * row[d];
      }
      logits[v] = sum;
    }
    return logits;
  }

  // ============================================================
  // 公开 API — 权重访问
  // ============================================================

  /**
   * getWeights() — 获取完整的投影矩阵
   *
   * 返回 W: [vocabSize][dModel]。
   * 每一行 W[i] 是 token i 的"理想 hidden state"。
   *
   * 教育用途：
   *   - 可视化 token 向量在语义空间的分布
   *   - 计算 token 向量间的余弦相似度
   *   - 分析与 Embedding 矩阵的关系（weight tying）
   *
   * 示例：
   *   const W = lmHead.getWeights();
   *   // W[0] → token 0 的投影向量 [dModel]
   */
  getWeights(): number[][] {
    return this.weights.map((row) => [...row]);
  }

  /**
   * getConfig() — 返回 LM Head 配置
   *
   * 示例：
   *   lmHead.getConfig()
   *   // → { dModel: 512, vocabSize: 1000 }
   */
  getConfig(): { dModel: number; vocabSize: number } {
    return { dModel: this.dModel, vocabSize: this.vocabSize };
  }

  // ============================================================
  // 内部方法 — 权重初始化
  // ============================================================

  /**
   * initializeWeights(seed) — Xavier 初始化权重矩阵
   *
   * 使用确定性 PRNG (Mulberry32) 生成可复现的随机权重。
   *
   * Xavier 初始化：
   *   std = sqrt(2 / (fanIn + fanOut))
   *   W[i][j] ~ N(0, std)
   *
   * fanIn = dModel, fanOut = vocabSize。
   *
   * 使用 Box-Muller 变换将均匀分布转为正态分布。
   */
  private initializeWeights(seed: number): number[][] {
    const prng = createPRNG(seed);
    const std = Math.sqrt(2 / (this.dModel + this.vocabSize));

    const W: number[][] = new Array(this.vocabSize);
    for (let v = 0; v < this.vocabSize; v++) {
      W[v] = new Array(this.dModel);
      for (let d = 0; d < this.dModel; d++) {
        // Box-Muller: 将两个均匀分布转为正态分布
        const u1 = prng();
        const u2 = prng();
        const z =
          Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        W[v][d] = z * std;
      }
    }
    return W;
  }
}

// ============================================================
// Deterministic PRNG — Mulberry32
// ============================================================

/**
 * 创建一个基于 Mulberry32 算法的确定型 PRNG
 *
 * 返回值在 [0, 1) 区间内均匀分布。
 * 相同 seed 始终产生相同的随机序列。
 *
 * 为什么自己实现？
 *   教育目的 — 让权重初始化完全透明和可复现。
 *   Math.random() 每次运行结果不同（不可复现），
 *   第三方库隐藏了细节。
 *
 * 算法来源：Tommy Ettinger (2017)
 * 周期：~2^32
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
