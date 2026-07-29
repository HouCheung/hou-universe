// ============================================================
// MiniMind — attention/math.ts
// ============================================================
// Attention 数学引擎
//
// 提供 Attention 所需的全部底层数学操作：
//   - 向量内积（dot product）
//   - 矩阵乘法（matrix multiplication）
//   - 数值稳定 Softmax
//   - Causal Mask 应用
//   - Scaled Dot-Product Attention
//
// 所有函数均为纯函数，零外部依赖。
// ============================================================

// ============================================================
// Vector Operations
// ============================================================

/**
 * dotProduct — 计算两个向量的内积
 *
 * 公式：a · b = Σ a_i × b_i
 *
 * 内积衡量两个向量的"方向一致性"：
 *   - 正值 → 方向大致相同
 *   - 零   → 正交（无关）
 *   - 负值 → 方向大致相反
 *
 * 在 Attention 中，Q_i · K_j 表示 token i 的 Query
 * 与 token j 的 Key 之间的匹配程度。
 *
 * 参数：
 * @param a - 第一个向量
 * @param b - 第二个向量（必须与 a 等长）
 * @returns   内积值
 *
 * 示例：
 *   dotProduct([1, 2, 3], [4, 5, 6])
 *   // → 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: a.length=${a.length}, b.length=${b.length}`
    );
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

// ============================================================
// Matrix Operations
// ============================================================

/**
 * matrixMultiply — 矩阵乘法 C = A @ B
 *
 * 公式：C[i][j] = Σ_k A[i][k] × B[k][j]
 *
 * 要求：A 的列数 = B 的行数（内部维度一致）。
 *
 * 在 Attention 中，矩阵乘法用于：
 *   - Q @ K^T：计算 attention scores（[seqLen, headDim] @ [headDim, seqLen] → [seqLen, seqLen]）
 *   - weights @ V：加权聚合 values（[seqLen, seqLen] @ [seqLen, headDim] → [seqLen, headDim]）
 *   - X @ W_Q：Q/K/V 投影（[seqLen, dModel] @ [dModel, headDim] → [seqLen, headDim]）
 *
 * 参数：
 * @param A - 左矩阵 [m × k]
 * @param B - 右矩阵 [k × n]
 * @returns   乘积矩阵 [m × n]
 *
 * 复杂度：O(m × k × n)
 *
 * 示例：
 *   matrixMultiply([[1, 2], [3, 4]], [[5, 6], [7, 8]])
 *   // → [[1*5+2*7, 1*6+2*8], [3*5+4*7, 3*6+4*8]]
 *   // → [[19, 22], [43, 50]]
 */
export function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const k = A[0]?.length ?? 0;
  const kB = B.length;
  const n = B[0]?.length ?? 0;

  if (k !== kB) {
    throw new Error(
      `Inner dimension mismatch: A.cols=${k}, B.rows=${kB}`
    );
  }

  const C: number[][] = new Array(m);
  for (let i = 0; i < m; i++) {
    C[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) {
        sum += A[i][p] * B[p][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

/**
 * transpose — 矩阵转置
 *
 * 公式：B[j][i] = A[i][j]
 *
 * 用于将 Key 矩阵从 [seqLen, headDim] 转为 [headDim, seqLen]，
 * 以便计算 Q @ K^T。
 *
 * 参数：
 * @param A - 输入矩阵 [m × n]
 * @returns   转置矩阵 [n × m]
 */
export function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0]?.length ?? 0;

  const AT: number[][] = new Array(n);
  for (let j = 0; j < n; j++) {
    AT[j] = new Array(m);
    for (let i = 0; i < m; i++) {
      AT[j][i] = A[i][j];
    }
  }
  return AT;
}

// ============================================================
// Softmax
// ============================================================

/**
 * softmax — 数值稳定的 Softmax 函数
 *
 * 公式：softmax(x_i) = exp(x_i) / Σ_j exp(x_j)
 *
 * 数值稳定技巧：先减去最大值，防止 exp 溢出。
 *   softmax(x_i) = exp(x_i - max(x)) / Σ_j exp(x_j - max(x))
 *
 * 数学上等价（分子分母同除以 exp(max(x))），
 * 但数值上安全——exp 的最大输入从 x_max 降到 0。
 *
 * 在 Attention 中，softmax 沿 Key 维度对 scores 归一化，
 * 使每个 Query 对所有 Key 的 attention weights 和为 1。
 *
 * 参数：
 * @param x - 输入向量
 * @returns   softmax 归一化后的概率分布（和为 1）
 *
 * 示例：
 *   softmax([1, 2, 3])
 *   // → [0.0900, 0.2447, 0.6652]  (approximately)
 *
 *   softmax([1000, 1000, 1000])
 *   // → [0.3333, 0.3333, 0.3333]   (稳定，不溢出)
 */
export function softmax(x: number[]): number[] {
  const n = x.length;

  // Step 1: 找最大值（防止 exp 溢出）
  let maxVal = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] > maxVal) maxVal = x[i];
  }

  // Step 2: 计算 exp(x_i - max) 并求和
  let sum = 0;
  const expVals = new Array(n);
  for (let i = 0; i < n; i++) {
    expVals[i] = Math.exp(x[i] - maxVal);
    sum += expVals[i];
  }

  // Step 3: 归一化
  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = expVals[i] / sum;
  }

  return result;
}

// ============================================================
// Causal Mask
// ============================================================

/**
 * applyCausalMask — 对 attention scores 应用因果掩码
 *
 * 将矩阵的上三角（j > i，即未来位置）设为 -Infinity，
 * 使得 softmax 后这些位置的权重为 0。
 *
 * Causal Mask 的结构（seqLen=4）：
 *   [  0, -∞, -∞, -∞ ]   ← 位置 0 只能关注自己
 *   [  0,  0, -∞, -∞ ]   ← 位置 1 只能关注 0,1
 *   [  0,  0,  0, -∞ ]   ← 位置 2 只能关注 0,1,2
 *   [  0,  0,  0,  0 ]   ← 位置 3 可以关注所有
 *
 * 为什么用 -Infinity 而非 -1e9？
 *   exp(-Infinity) = 0（精确），而 exp(-1e9) ≈ 0（近似）。
 *   但 JavaScript 的 -Infinity 在后续计算中可能产生 NaN，
 *   这里使用 -1e9 作为"足够小的负数"以保证数值稳定性。
 *
 * 参数：
 * @param scores - 原始 attention scores [seqLen][seqLen]
 * @returns        应用 mask 后的 scores（上三角 = -1e9）
 *
 * 示例（seqLen=3）：
 *   applyCausalMask([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
 *   // → [[1, -1e9, -1e9], [4, 5, -1e9], [7, 8, 9]]
 */
export function applyCausalMask(scores: number[][]): number[][] {
  const seqLen = scores.length;
  const MASK_VALUE = -1e9;

  const result: number[][] = new Array(seqLen);
  for (let i = 0; i < seqLen; i++) {
    result[i] = new Array(seqLen);
    for (let j = 0; j < seqLen; j++) {
      if (j > i) {
        // 未来位置 — 屏蔽
        result[i][j] = MASK_VALUE;
      } else {
        // 当前位置及之前 — 保留
        result[i][j] = scores[i][j];
      }
    }
  }

  return result;
}

/**
 * applyPaddingMask — 对 attention scores 应用 padding mask
 *
 * 将自定义 mask 中值为 0 的位置设为 -1e9。
 * 用于批量训练时屏蔽不同长度序列的 padding 位置。
 *
 * mask[i][j] = 0  → 屏蔽（设为 -1e9）
 * mask[i][j] = 1  → 保留原分数
 *
 * 参数：
 * @param scores - 原始 attention scores [seqLen][seqLen]
 * @param mask   - 自定义 mask [seqLen][seqLen]，0=屏蔽 1=保留
 * @returns        应用 mask 后的 scores
 */
export function applyPaddingMask(
  scores: number[][],
  mask: number[][]
): number[][] {
  const seqLen = scores.length;
  const MASK_VALUE = -1e9;

  const result: number[][] = new Array(seqLen);
  for (let i = 0; i < seqLen; i++) {
    result[i] = new Array(seqLen);
    for (let j = 0; j < seqLen; j++) {
      if (mask[i]?.[j] === 0) {
        result[i][j] = MASK_VALUE;
      } else {
        result[i][j] = scores[i][j];
      }
    }
  }

  return result;
}

// ============================================================
// Scaled Dot-Product Attention — Core
// ============================================================

/**
 * scaledDotProductAttention — Attention 核心计算
 *
 * 公式：Attention(Q, K, V) = softmax(Q @ K^T / sqrt(d_k)) @ V
 *
 * 这是所有 Transformer Attention 变体的基础计算单元。
 * 每一步都返回中间结果，便于教学和调试。
 *
 * 数据流：
 *   Q, K, V（输入）
 *     ↓
 *   scores = Q @ K^T           ← 内积相似度
 *     ↓
 *   scaled = scores / sqrt(d_k) ← 方差归一化
 *     ↓
 *   masked = applyMask(scaled)  ← 可选 mask
 *     ↓
 *   weights = softmax(masked)   ← 概率分布
 *     ↓
 *   output = weights @ V        ← 加权聚合
 *
 * 参数：
 * @param Q    - Query 矩阵 [seqLen, headDim]
 * @param K    - Key 矩阵   [seqLen, headDim]
 * @param V    - Value 矩阵 [seqLen, headDim]
 * @param mask - 可选的 mask 矩阵 [seqLen, seqLen]（0=屏蔽 1=保留）
 *               传入 "causal" 字符串启用因果掩码
 * @returns      { output, scores, scaled, weights } 完整计算链
 *
 * 示例（2 个 token, 4 维 head）：
 *   const Q = [[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]]
 *   const K = [[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]]
 *   const V = [[1.0, 2.0, 3.0, 4.0], [5.0, 6.0, 7.0, 8.0]]
 *   const result = scaledDotProductAttention(Q, K, V, "causal")
 *   // result.output → 加权聚合后的向量
 *   // result.weights → 2×2 attention weight 矩阵（上三角为 0）
 */
export function scaledDotProductAttention(
  Q: number[][],
  K: number[][],
  V: number[][],
  mask?: number[][] | "causal" | null
): {
  output: number[][];
  scores: number[][];
  scaled: number[][];
  weights: number[][];
  dk: number;
  maskApplied: "causal" | "custom" | "none";
} {
  const seqLen = Q.length;
  const dk = Q[0]?.length ?? 0;

  // ── Step 1: 计算原始分数 S = Q @ K^T ──
  // Q: [seqLen × dk], K^T: [dk × seqLen] → scores: [seqLen × seqLen]
  const KT = transpose(K);
  const scores = matrixMultiply(Q, KT);

  // ── Step 2: 缩放 S_scaled = S / sqrt(d_k) ──
  const scaleFactor = Math.sqrt(dk);
  const scaled: number[][] = new Array(seqLen);
  for (let i = 0; i < seqLen; i++) {
    scaled[i] = new Array(seqLen);
    for (let j = 0; j < seqLen; j++) {
      scaled[i][j] = scores[i][j] / scaleFactor;
    }
  }

  // ── Step 3: 应用 mask ──
  let masked: number[][];
  let maskApplied: "causal" | "custom" | "none" = "none";

  if (mask === "causal") {
    masked = applyCausalMask(scaled);
    maskApplied = "causal";
  } else if (mask != null && Array.isArray(mask)) {
    masked = applyPaddingMask(scaled, mask);
    maskApplied = "custom";
  } else {
    masked = scaled;
  }

  // ── Step 4: Softmax（沿每一行，即 Key 维度） ──
  const weights: number[][] = new Array(seqLen);
  for (let i = 0; i < seqLen; i++) {
    weights[i] = softmax(masked[i]);
  }

  // ── Step 5: 加权聚合 output = weights @ V ──
  const output = matrixMultiply(weights, V);

  return { output, scores, scaled, weights, dk, maskApplied };
}
