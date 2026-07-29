// ============================================================
// MiniMind — rope/types.ts
// ============================================================
// RoPE 模块类型定义
//
// 为 RotaryEmbedding 提供统一的数据结构，
// 供 Playground 和 AI Lab 消费。
// ============================================================

/**
 * RoPE 层配置
 *
 * 定义旋转位置编码的核心参数。
 * 与 `src/data/minimind/rope-registry.ts` 中的
 * RoPEFrequencyConfig 语义一致。
 */
export interface RoPEConfig {
  /** Head 维度 — 必须为偶数（RoPE 在 d/2 个 2D 平面上旋转） */
  headDim: number;
  /** 旋转频率基数 θ — 控制最低频率带 */
  theta: number;
  /** 最大序列长度 — 预计算频率的序列上限 */
  maxSeqLen: number;
}

/**
 * 预计算的频率缓存
 *
 * cosTable[pos][i] = cos(pos · freq_i)
 * sinTable[pos][i] = sin(pos · freq_i)
 *
 * 形状：cosTable[maxSeqLen][headDim/2]
 *
 * 预计算避免了每次 forward 时的三角函数重复计算，
 * 是 RoPE 推理效率的关键优化。
 */
export interface FrequencyCache {
  /** Cosine 值表 — cosTable[pos][dimPair] */
  cosTable: Float64Array[];
  /** Sine 值表 — sinTable[pos][dimPair] */
  sinTable: Float64Array[];
  /** 维度对数（headDim/2） */
  numDimPairs: number;
  /** 最大序列长度 */
  maxSeqLen: number;
}

/**
 * 单次旋转操作的结果
 *
 * 用于 Playground 中逐对展示旋转前后的向量值变化。
 */
export interface RotationTrace {
  /** 维度对索引（0, 1, ..., headDim/2 - 1） */
  dimPairIndex: number;
  /** 偶数维度索引（2i） */
  evenDim: number;
  /** 奇数维度索引（2i+1） */
  oddDim: number;
  /** 旋转前的 (x_{2i}, x_{2i+1}) 对 */
  before: [number, number];
  /** 旋转后的 (x_{2i}, x_{2i+1}) 对 */
  after: [number, number];
  /** 旋转角度（弧度） */
  angle: number;
  /** 频率值 */
  frequency: number;
}

/**
 * applyRotation 的完整输出
 *
 * 包含旋转后的向量和逐对 trace，供 Playground
 * 可视化每个维度对的旋转效果。
 */
export interface RotationResult {
  /** 旋转后的向量 — 长度 = headDim */
  result: Float64Array;
  /** 逐对旋转记录 — 长度 = headDim/2 */
  traces: RotationTrace[];
  /** 旋转前的向量范数 */
  normBefore: number;
  /** 旋转后的向量范数（应等于 normBefore） */
  normAfter: number;
  /** 范数是否保持一致（容差 1e-10） */
  normPreserved: boolean;
}

/**
 * Q/K 批量 RoPE 变换的返回值
 *
 * 输入形状：[seqLen, headDim]
 * 每个位置的向量独立旋转后返回。
 */
export interface QKRotationResult {
  /** 旋转后的 Query 向量数组 */
  rotatedQuery: RotationResult[];
  /** 旋转后的 Key 向量数组 */
  rotatedKey: RotationResult[];
}
