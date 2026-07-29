// ============================================================
// MiniMind — rope/math.ts
// ============================================================
// RoPE 数学引擎
//
// 提供 RoPE 所需的全部底层数学操作：
//   - 频率生成（frequency generation）
//   - 角度计算（angle calculation）
//   - 向量旋转（vector rotation）
//   - 范数验证（norm verification）
//
// 所有函数均为纯函数，零外部依赖。
// ============================================================

// ============================================================
// Frequency Generation
// ============================================================

/**
 * getFrequencies — 计算各维度对的旋转频率
 *
 * 公式：freq_i = 1 / theta^(2i / headDim)
 *
 * 对于 i = 0, 1, ..., headDim/2 - 1：
 *   - i=0（第一个维度对）：freq = 1 / theta^(0/headDim) = 1.0  ← 最高频率
 *   - i=dimPairs-1（最后一个维度对）：freq = 1 / theta^((headDim-2)/headDim) ≈ 1/theta  ← 最低频率
 *
 * 参数：
 * @param headDim  - Head 维度，必须为偶数
 * @param theta    - 旋转频率基数，默认 10000.0
 * @returns         频率数组，长度为 headDim/2
 *
 * 示例（headDim=4, theta=10000）：
 *   getFrequencies(4, 10000)
 *   // → Float64Array [1.0, 0.01]
 *   //   dim pair 0: 每步转 1 弧度（高频，短距离敏感）
 *   //   dim pair 1: 每步转 0.01 弧度（低频，长距离敏感）
 */
export function getFrequencies(
  headDim: number,
  theta: number = 10000.0
): Float64Array {
  if (headDim <= 0 || headDim % 2 !== 0) {
    throw new Error(
      `headDim must be a positive even number, got ${headDim}`
    );
  }
  if (theta <= 0) {
    throw new Error(`theta must be positive, got ${theta}`);
  }

  const numDimPairs = headDim / 2;
  const freqs = new Float64Array(numDimPairs);

  for (let i = 0; i < numDimPairs; i++) {
    // freq_i = 1 / theta^(2i / headDim)
    //       = theta^(-2i / headDim)
    const exponent = -(2 * i) / headDim;
    freqs[i] = Math.pow(theta, exponent);
  }

  return freqs;
}

// ============================================================
// Angle Calculation
// ============================================================

/**
 * getAngles — 为给定位置计算所有维度对的旋转角度
 *
 * 公式：θ_i(pos) = pos · freq_i
 *
 * 对于位置 pos，第 i 个维度对的旋转角度为 pos × freq_i。
 * 位置越远，角度越大；频率越高，角度随位置增长越快。
 *
 * 参数：
 * @param position      - 序列中的绝对位置（0, 1, 2, ...）
 * @param frequencies   - 由 getFrequencies() 计算出的频率数组
 * @returns              角度数组，长度为 headDim/2
 *
 * 示例（freqs=[1.0, 0.01], pos=3）：
 *   getAngles(3, [1.0, 0.01])
 *   // → Float64Array [3.0, 0.03]
 *   //   dim pair 0: 转了 3 弧度（~172°，快转）
 *   //   dim pair 1: 转了 0.03 弧度（~1.7°，慢转）
 */
export function getAngles(
  position: number,
  frequencies: Float64Array
): Float64Array {
  const numDimPairs = frequencies.length;
  const angles = new Float64Array(numDimPairs);

  for (let i = 0; i < numDimPairs; i++) {
    angles[i] = position * frequencies[i];
  }

  return angles;
}

/**
 * getAllAngles — 为所有位置批量计算旋转角度
 *
 * 返回一个 [maxSeqLen][headDim/2] 的二维角度表。
 * 这是预计算缓存的基础——一次性计算所有位置×所有维度对的角度。
 *
 * 参数：
 * @param maxSeqLen   - 最大序列长度
 * @param frequencies - 频率数组
 * @returns            角度矩阵：angles[pos][dimPair]
 *
 * 示例（maxSeqLen=3, freqs=[1.0, 0.01]）：
 *   getAllAngles(3, [1.0, 0.01])
 *   // → [
 *   //   Float64Array [0.0,  0.0],    // pos=0: 原点，不旋转
 *   //   Float64Array [1.0,  0.01],   // pos=1
 *   //   Float64Array [2.0,  0.02],   // pos=2
 *   // ]
 */
export function getAllAngles(
  maxSeqLen: number,
  frequencies: Float64Array
): Float64Array[] {
  const angles: Float64Array[] = new Array(maxSeqLen);

  for (let pos = 0; pos < maxSeqLen; pos++) {
    angles[pos] = getAngles(pos, frequencies);
  }

  return angles;
}

// ============================================================
// frequencyCache — 预计算 cos/sin 表
// ============================================================

/**
 * frequencyCache — 预计算所有位置的 cos/sin 值
 *
 * 这是 RoPE 推理效率的关键优化：一次性计算所有位置的
 * cos(pos·freq_i) 和 sin(pos·freq_i)，后续 forward 时
 * 直接查表，无需重复调用 Math.cos/Math.sin。
 *
 * 参数：
 * @param maxSeqLen   - 最大序列长度
 * @param headDim     - Head 维度（必须为偶数）
 * @param theta       - 旋转频率基数
 * @returns            预计算的 cos/sin 缓存
 */
export function frequencyCache(
  maxSeqLen: number,
  headDim: number,
  theta: number = 10000.0
): {
  cosTable: Float64Array[];
  sinTable: Float64Array[];
  numDimPairs: number;
  maxSeqLen: number;
} {
  const freqs = getFrequencies(headDim, theta);
  const numDimPairs = freqs.length;

  const cosTable: Float64Array[] = new Array(maxSeqLen);
  const sinTable: Float64Array[] = new Array(maxSeqLen);

  for (let pos = 0; pos < maxSeqLen; pos++) {
    const cosRow = new Float64Array(numDimPairs);
    const sinRow = new Float64Array(numDimPairs);

    for (let i = 0; i < numDimPairs; i++) {
      const angle = pos * freqs[i];
      cosRow[i] = Math.cos(angle);
      sinRow[i] = Math.sin(angle);
    }

    cosTable[pos] = cosRow;
    sinTable[pos] = sinRow;
  }

  return { cosTable, sinTable, numDimPairs, maxSeqLen };
}

// ============================================================
// Vector Rotation
// ============================================================

/**
 * rotateVector — 对单个向量执行逐对 2D 旋转
 *
 * 这是 RoPE 的底层核心操作。将 headDim 维向量拆分为
 * headDim/2 个 2D 平面，每个平面独立旋转其对应的角度。
 *
 * 公式（对于维度对 i，包含维度 2i 和 2i+1）：
 *   x'_{2i}   = x_{2i}   · cos(θ_i) - x_{2i+1} · sin(θ_i)
 *   x'_{2i+1} = x_{2i+1} · cos(θ_i) + x_{2i}   · sin(θ_i)
 *
 * 等价于每个 2D 点 (x_{2i}, x_{2i+1}) 乘以旋转矩阵：
 *   R(θ_i) = [[cos(θ_i), -sin(θ_i)],
 *             [sin(θ_i),  cos(θ_i)]]
 *
 * 参数：
 * @param x     - 输入向量，长度为 headDim
 * @param cos   - cos(θ_i) 数组，长度为 headDim/2
 * @param sin   - sin(θ_i) 数组，长度为 headDim/2
 * @returns      旋转后的向量，长度为 headDim
 *
 * 示例（headDim=4, cos=[c0,c1], sin=[s0,s1]）：
 *   rotateVector([a, b, c, d], [c0, c1], [s0, s1])
 *   // → [a·c0 - b·s0,  b·c0 + a·s0,  c·c1 - d·s1,  d·c1 + c·s1]
 *   //   └── dim pair 0 ──┘               └── dim pair 1 ──┘
 */
export function rotateVector(
  x: Float64Array,
  cos: Float64Array,
  sin: Float64Array
): Float64Array {
  const dim = x.length;
  const result = new Float64Array(dim);

  for (let i = 0; i < dim; i += 2) {
    const pairIdx = i / 2;
    const cosVal = cos[pairIdx];
    const sinVal = sin[pairIdx];

    const xEven = x[i];
    const xOdd = x[i + 1];

    // 2D 旋转矩阵乘法
    result[i] = xEven * cosVal - xOdd * sinVal;
    result[i + 1] = xOdd * cosVal + xEven * sinVal;
  }

  return result;
}

// ============================================================
// Complete Rotation Application
// ============================================================

/**
 * applyRotation — 对向量应用 RoPE 旋转（含完整 trace）
 *
 * 综合调用 getAngles → rotateVector，
 * 并逐对记录旋转前后的值，用于 Playground 可视化。
 *
 * 参数：
 * @param x           - 输入向量，长度为 headDim
 * @param position    - 该 token 的绝对位置（0-based）
 * @param frequencies - 频率数组，由 getFrequencies() 计算
 * @returns            完整的 RotationResult（旋转后向量 + 逐对 trace + 范数验证）
 */
export function applyRotation(
  x: Float64Array,
  position: number,
  frequencies: Float64Array
): {
  result: Float64Array;
  traces: {
    dimPairIndex: number;
    evenDim: number;
    oddDim: number;
    before: [number, number];
    after: [number, number];
    angle: number;
    frequency: number;
  }[];
  normBefore: number;
  normAfter: number;
  normPreserved: boolean;
} {
  const angles = getAngles(position, frequencies);
  const dim = x.length;
  const numDimPairs = dim / 2;

  // 预计算 cos/sin
  const cos = new Float64Array(numDimPairs);
  const sin = new Float64Array(numDimPairs);
  for (let i = 0; i < numDimPairs; i++) {
    cos[i] = Math.cos(angles[i]);
    sin[i] = Math.sin(angles[i]);
  }

  // 计算旋转前的范数
  const normBefore = Math.sqrt(
    x.reduce((sum, val) => sum + val * val, 0)
  );

  // 执行旋转
  const result = rotateVector(x, cos, sin);

  // 计算旋转后的范数
  const normAfter = Math.sqrt(
    result.reduce((sum, val) => sum + val * val, 0)
  );

  // 逐对记录 trace
  const traces = [];
  for (let i = 0; i < numDimPairs; i++) {
    const evenDim = 2 * i;
    const oddDim = 2 * i + 1;
    traces.push({
      dimPairIndex: i,
      evenDim,
      oddDim,
      before: [x[evenDim], x[oddDim]] as [number, number],
      after: [result[evenDim], result[oddDim]] as [number, number],
      angle: angles[i],
      frequency: frequencies[i],
    });
  }

  return {
    result,
    traces,
    normBefore,
    normAfter,
    normPreserved: Math.abs(normBefore - normAfter) < 1e-10,
  };
}

// ============================================================
// Batch Rotation (Q/K)
// ============================================================

/**
 * applyQKRotation — 对 Q 和 K 批量应用 RoPE
 *
 * 对序列中每个位置的 Query 和 Key 向量分别旋转。
 * 所有位置共享相同的频率配置，但每个位置的旋转角度不同。
 *
 * 这是 MiniMind 中 RoPE 的顶层入口函数。
 *
 * 参数：
 * @param qVectors      - Query 向量数组 [seqLen][headDim]
 * @param kVectors      - Key 向量数组   [seqLen][headDim]
 * @param frequencies   - 频率数组，由 getFrequencies() 计算
 * @returns               旋转后的 Q/K 向量 + 逐位置 trace
 */
export function applyQKRotation(
  qVectors: Float64Array[],
  kVectors: Float64Array[],
  frequencies: Float64Array
): {
  rotatedQuery: ReturnType<typeof applyRotation>[];
  rotatedKey: ReturnType<typeof applyRotation>[];
} {
  const seqLen = qVectors.length;

  const rotatedQuery: ReturnType<typeof applyRotation>[] = [];
  const rotatedKey: ReturnType<typeof applyRotation>[] = [];

  for (let pos = 0; pos < seqLen; pos++) {
    rotatedQuery.push(applyRotation(qVectors[pos], pos, frequencies));
    rotatedKey.push(applyRotation(kVectors[pos], pos, frequencies));
  }

  return { rotatedQuery, rotatedKey };
}

// ============================================================
// Utility: L2 Norm
// ============================================================

/**
 * l2Norm — 计算向量的 L2 范数（欧几里得长度）
 *
 * 用于验证旋转前后向量的长度不变（等距性）。
 * RoPE 是正交变换，理论上应严格保持范数。
 *
 * 参数：
 * @param x - 输入向量
 * @returns    L2 范数 √(Σ x_i²)
 */
export function l2Norm(x: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i] * x[i];
  }
  return Math.sqrt(sum);
}
