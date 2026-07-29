// ============================================================
// MiniMind — ffn/math.ts
// ============================================================
// FFN 数学引擎
//
// 提供 FFN 所需的全部底层数学操作：
//   - 矩阵乘法（matrix multiplication）
//   - 线性变换（linear projection）
//   - SiLU 激活函数
//   - 门控逐元素乘法
//   - 完整 SwiGLU 计算
//
// 所有函数均为纯函数，零外部依赖。
// ============================================================

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
 * 在 FFN 中，矩阵乘法用于：
 *   - x @ W_gate：Gate 投影（[seqLen, dModel] @ [dModel, dFF] → [seqLen, dFF]）
 *   - x @ W_up：Up 投影（[seqLen, dModel] @ [dModel, dFF] → [seqLen, dFF]）
 *   - gated @ W_down：Down 投影（[seqLen, dFF] @ [dFF, dModel] → [seqLen, dModel]）
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

// ============================================================
// Linear Projection
// ============================================================

/**
 * linear — 线性变换 y = x @ W
 *
 * 公式：y[i][j] = Σ_k x[i][k] × W[k][j]
 *
 * 这是 FFN 中 Gate/Up/Down 投影的统一实现。
 * 注意：为与 MiniMind/LLaMA 保持一致，不包含 bias 项。
 * 现代 LLM 通常省略 FFN 的 bias（减少参数且对质量无明显影响）。
 *
 * 参数：
 * @param input  - 输入矩阵 [seqLen × dModel]
 * @param weight - 权重矩阵 [dModel × dOut]
 * @returns        线性变换结果 [seqLen × dOut]
 *
 * 示例：
 *   linear([[1, 2]], [[0.5, 0.5], [0.5, 0.5]])
 *   // → [[1*0.5+2*0.5, 1*0.5+2*0.5]] = [[1.5, 1.5]]
 */
export function linear(
  input: number[][],
  weight: number[][]
): number[][] {
  return matrixMultiply(input, weight);
}

// ============================================================
// Activation Functions
// ============================================================

/**
 * sigmoid — S 型激活函数
 *
 * 公式：σ(x) = 1 / (1 + e^(-x))
 *
 * 输出范围 (0, 1)，将任意实数映射为概率值。
 * 在 SiLU 中作为门控因子使用。
 *
 * 参数：
 * @param x - 输入值
 * @returns   sigmoid 输出
 */
export function sigmoid(x: number): number {
  // 数值稳定实现：x 很大 → 1，x 很小 → 0
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  } else {
    const expX = Math.exp(x);
    return expX / (1 + expX);
  }
}

/**
 * silu — SiLU (Sigmoid Linear Unit) 激活函数
 *
 * 公式：SiLU(x) = x · σ(x) = x / (1 + e^(-x))
 *
 * 也称为 Swish 激活函数。是 SwiGLU 的核心激活函数。
 *
 * SiLU 的性质：
 *   - 当 x → +∞：SiLU(x) → x（近似线性）
 *   - 当 x → -∞：SiLU(x) → 0（门控关闭）
 *   - 当 x = 0：  SiLU(0) = 0
 *   - 最小值约在 x ≈ -1.278，SiLU(x) ≈ -0.278
 *
 * 参数：
 * @param x - 输入值
 * @returns   SiLU(x) = x · sigmoid(x)
 *
 * 示例：
 *   silu(0)    // → 0
 *   silu(2)    // → 2 * σ(2) ≈ 2 * 0.8808 ≈ 1.7616
 *   silu(-2)   // → -2 * σ(-2) ≈ -2 * 0.1192 ≈ -0.2384
 */
export function silu(x: number): number {
  return x * sigmoid(x);
}

// ============================================================
// Gating Operations
// ============================================================

/**
 * multiplyGate — 门控逐元素乘法
 *
 * 公式：result[i][j] = gate[i][j] × up[i][j]
 *
 * SwiGLU 的核心操作：将 SiLU 激活后的门控信号与
 * Up 投影的候选值按元素相乘。
 *
 * gate 和 up 必须形状相同。
 *
 * 参数：
 * @param gate - 门控矩阵 [rows × cols]（经过 SiLU 激活）
 * @param up   - 候选值矩阵 [rows × cols]（Up 投影输出）
 * @returns      门控结果 [rows × cols]
 *
 * 示例：
 *   multiplyGate([[0.88, 0.12]], [[2.0, 3.0]])
 *   // → [[0.88*2.0, 0.12*3.0]] = [[1.76, 0.36]]
 */
export function multiplyGate(
  gate: number[][],
  up: number[][]
): number[][] {
  const rows = gate.length;
  const cols = gate[0]?.length ?? 0;

  if (
    rows !== up.length ||
    cols !== (up[0]?.length ?? 0)
  ) {
    throw new Error(
      `Shape mismatch: gate=[${rows}×${cols}], up=[${up.length}×${up[0]?.length ?? 0}]`
    );
  }

  const result: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    result[i] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      result[i][j] = gate[i][j] * up[i][j];
    }
  }
  return result;
}

/**
 * applySiLU — 对矩阵逐元素应用 SiLU 激活
 *
 * 公式：result[i][j] = SiLU(matrix[i][j])
 *
 * 用于对 Gate 投影的输出逐元素应用 SiLU 激活，
 * 生成门控信号矩阵。
 *
 * 参数：
 * @param matrix - 输入矩阵 [rows × cols]
 * @returns        逐元素 SiLU 后的矩阵 [rows × cols]
 *
 * 示例：
 *   applySiLU([[0, 2], [-2, 1]])
 *   // → [[0, ~1.76], [~-0.24, ~0.73]]
 */
export function applySiLU(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;

  const result: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    result[i] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      result[i][j] = silu(matrix[i][j]);
    }
  }
  return result;
}

// ============================================================
// SwiGLU — Complete Gated FFN Activation
// ============================================================

/**
 * swiGLU — 完整的 SwiGLU 激活计算
 *
 * 公式：SwiGLU(x, W_gate, W_up) = SiLU(x @ W_gate) ⊙ (x @ W_up)
 *
 * 这是 SwiGLU 的完整实现——FFN 中 Gate + Up 分支的
 * 并行投影和门控融合。
 *
 * 数据流：
 *   x @ W_gate → [seqLen, dFF] → SiLU → gate
 *   x @ W_up   → [seqLen, dFF] ──────────→ ⊙ → gated [seqLen, dFF]
 *
 * 参数：
 * @param x      - 输入矩阵 [seqLen × dModel]
 * @param W_gate - Gate 投影权重 [dModel × dFF]
 * @param W_up   - Up 投影权重 [dModel × dFF]
 *
 * @returns { gated, gateProj, gateAct, upProj } 完整中间结果
 *
 * 示例（1 token, dModel=4, dFF=8）：
 *   const x = [[0.1, 0.2, 0.3, 0.4]];
 *   const W_gate = [4×8 weight matrix];
 *   const W_up   = [4×8 weight matrix];
 *   const result = swiGLU(x, W_gate, W_up);
 *   // result.gated    → [1][8] gated hidden states
 *   // result.gateProj → [1][8] raw gate projection
 *   // result.gateAct  → [1][8] SiLU-activated gate values
 *   // result.upProj   → [1][8] raw up projection
 */
export function swiGLU(
  x: number[][],
  W_gate: number[][],
  W_up: number[][]
): {
  gated: number[][];
  gateProj: number[][];
  gateAct: number[][];
  upProj: number[][];
} {
  // ── Gate 分支：投影 + SiLU 激活 ──
  // x: [seqLen, dModel] @ W_gate: [dModel, dFF] → [seqLen, dFF]
  const gateProj = matrixMultiply(x, W_gate);
  // 逐元素 SiLU：生成门控信号
  const gateAct = applySiLU(gateProj);

  // ── Up 分支：投影（无激活） ──
  // x: [seqLen, dModel] @ W_up: [dModel, dFF] → [seqLen, dFF]
  const upProj = matrixMultiply(x, W_up);

  // ── 门控融合：逐元素乘法 ──
  const gated = multiplyGate(gateAct, upProj);

  return { gated, gateProj, gateAct, upProj };
}
