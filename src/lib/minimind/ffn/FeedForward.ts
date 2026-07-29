// ============================================================
// MiniMind — FeedForward.ts
// ============================================================
// MiniFeedForward V1 — 教育型 SwiGLU FFN 引擎
//
// 核心功能：
//   - Gate / Up 并行投影 → 高维扩展
//   - SiLU 激活 → 门控信号生成
//   - Element-wise Gate Multiply → 选择性信息通过
//   - Down Projection → 压缩回 dModel
//   - 完整的 Activation Trace（供可视化和调试）
//
// 数据流：
//   Input [seqLen, dModel]
//     │
//     ├──→ Gate Proj (W_gate) → [seqLen, dFF] → SiLU
//     │                                              │
//     └──→ Up Proj   (W_up)   → [seqLen, dFF] ──────→ ⊙ (multiply)
//                                                        │
//                                     gated [seqLen, dFF]
//                                                        │
//                              Down Proj (W_down) ←──────┘
//                                     │
//                           Output [seqLen, dModel]
//
// 教育重点：
//   - 投影权重完全透明 — 可随时检查 W_gate/W_up/W_down
//   - SwiGLU 门控机制逐步展示 — 理解 Gate/Up 分支和融合
//   - Activation Trace 记录每步中间结果 — 完整的可解释性
//   - 确定性初始化 — 相同 seed 产生相同权重
// ============================================================

import type { FFNConfig, FFNInput, FFNOutput, ActivationTrace } from "./types";
import { matrixMultiply, applySiLU, swiGLU } from "./math";

// ============================================================
// Deterministic PRNG — Mulberry32
// ============================================================

/**
 * 创建确定性 PRNG（Mulberry32 算法）
 *
 * 与 MiniEmbedding / MiniAttention 使用相同的 PRNG 实现。
 * 保证相同 seed → 相同权重序列 → 可复现的 FFN 行为。
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
// MiniFeedForward
// ============================================================

/**
 * MiniFeedForward — 教育用 SwiGLU Feed-Forward Network 引擎
 *
 * 核心职责：
 *   实现完整的 SwiGLU FFN。每个 token 独立地通过
 *   Gate/Up 投影扩展到高维空间，经过 SiLU 门控筛选，
 *   然后通过 Down 投影压缩回原始维度。
 *
 * 使用方式：
 *
 * ```ts
 * const ffn = new MiniFeedForward({ dModel: 512, dFF: 2048, maxSeqLen: 512 });
 *
 * // 准备输入（3 个 token，dModel=512 维向量）
 * const input = {
 *   hiddenStates: [[...512 维...], [...], [...]],
 * };
 *
 * // 前向传播
 * const result = ffn.forward(input);
 * // result.output → [3][512] FFN 输出
 * // result.trace  → 完整的 activation trace
 *
 * // 检查 trace
 * const t = ffn.getActivationTrace();
 * // t.gateActivation → SiLU 激活后的门控值
 * // t.gatedHidden    → 门控融合后的隐藏状态
 * ```
 *
 * 教育设计：
 *   - 权重完全透明 — W_gate/W_up/W_down 可随时检查
 *   - SwiGLU 流程逐步透明 — Gate/Up → SiLU → Multiply → Down
 *   - 完整 trace — 每步中间结果可逐元素检查
 *   - 零外部依赖 — 纯 TypeScript 实现
 */
export class MiniFeedForward {
  private config: FFNConfig;
  private W_gate: number[][]; // [dModel × dFF] Gate 投影矩阵
  private W_up: number[][];   // [dModel × dFF] Up 投影矩阵
  private W_down: number[][]; // [dFF × dModel] Down 投影矩阵
  private lastTrace: ActivationTrace | null = null;

  /**
   * @param config — { dModel, dFF, maxSeqLen }
   *
   * 构造时立即：
   *   1. 验证参数（dFF 必须 >= dModel）
   *   2. 初始化 W_gate, W_up, W_down 三个投影矩阵
   *   3. 使用确定性 PRNG 初始化权重（可复现）
   *
   * 投影矩阵形状：
   *   W_gate: [dModel × dFF]   — 门控投影（扩展）
   *   W_up:   [dModel × dFF]   — 上投影（扩展）
   *   W_down: [dFF × dModel]   — 下投影（压缩）
   *
   * 参数总计：2 × dModel × dFF + dFF × dModel = 3 × dModel × dFF
   * 当 dModel=512, dFF=2048：3 × 512 × 2048 = 3,145,728
   */
  constructor(config: FFNConfig) {
    if (config.dModel <= 0) {
      throw new Error(`dModel must be positive, got ${config.dModel}`);
    }
    if (config.dFF <= 0) {
      throw new Error(`dFF must be positive, got ${config.dFF}`);
    }
    if (config.dFF < config.dModel) {
      throw new Error(
        `dFF (${config.dFF}) must be >= dModel (${config.dModel}). ` +
        `FFN requires expansion (typically dFF = 4 × dModel).`
      );
    }
    if (config.maxSeqLen <= 0) {
      throw new Error(
        `maxSeqLen must be positive, got ${config.maxSeqLen}`
      );
    }

    this.config = { ...config };
    this.W_gate = this.initializeWeight(0);
    this.W_up = this.initializeWeight(1);
    this.W_down = this.initializeWeight(2);
  }

  // ============================================================
  // 公开 API — 前向传播
  // ============================================================

  /**
   * forward(input) — 完整的 SwiGLU FFN 前向传播
   *
   * 步骤：
   *   1. Gate 投影：input → W_gate → [seqLen, dFF]
   *   2. SiLU 激活：对 Gate 投影逐元素 SiLU → 门控信号
   *   3. Up 投影：  input → W_up   → [seqLen, dFF]
   *   4. 门控乘法：gate ⊙ up       → [seqLen, dFF]
   *   5. Down 投影：gated → W_down → [seqLen, dModel]
   *
   * 参数：
   * @param input — { hiddenStates }
   *   hiddenStates: [seqLen][dModel] 输入 token 表示
   * @returns       { output, trace }
   *
   * 示例：
   *   const input = {
   *     hiddenStates: [[0.1, 0.2, ...], [0.3, 0.4, ...], [0.5, 0.6, ...]],
   *   };
   *   const result = ffn.forward(input);
   */
  forward(input: FFNInput): FFNOutput {
    const { hiddenStates } = input;
    const seqLen = hiddenStates.length;
    const { dModel, dFF } = this.config;

    // 验证输入形状
    if (hiddenStates[0]?.length !== dModel) {
      throw new Error(
        `Input dimension mismatch: expected dModel=${dModel}, ` +
        `got ${hiddenStates[0]?.length ?? 0}`
      );
    }
    if (seqLen > this.config.maxSeqLen) {
      throw new Error(
        `Sequence length ${seqLen} exceeds maxSeqLen ${this.config.maxSeqLen}`
      );
    }

    // ── Step 1 & 2 & 3 & 4: SwiGLU 激活 ──
    // Gate 投影 → SiLU → 与 Up 投影逐元素相乘
    const { gated, gateProj, gateAct, upProj } = swiGLU(
      hiddenStates,
      this.W_gate,
      this.W_up
    );

    // ── Step 5: Down 投影 ──
    // gated: [seqLen, dFF] @ W_down: [dFF, dModel] → [seqLen, dModel]
    const output = matrixMultiply(gated, this.W_down);

    // ── 构建 trace ──
    const trace: ActivationTrace = {
      seqLen,
      dModel,
      dFF,
      gateProjection: gateProj,
      gateActivation: gateAct,
      upProjection: upProj,
      gatedHidden: gated,
      output,
    };

    this.lastTrace = trace;

    return { output, trace };
  }

  /**
   * getActivationTrace() — 获取最近一次 forward 的完整 trace
   *
   * 返回最后一次 forward 调用产生的完整 activation trace，
   * 包含所有中间结果。如果在 forward 之前调用，返回 null。
   *
   * trace 结构：
   *   - gateProjection[pos][ffDim] → 原始 Gate 投影值
   *   - gateActivation[pos][ffDim] → SiLU 激活后的门控值
   *   - upProjection[pos][ffDim]   → 原始 Up 投影值
   *   - gatedHidden[pos][ffDim]    → 门控乘法结果
   *   - output[pos][dModelDim]     → 最终 Down 投影输出
   *
   * 教育用途：
   *   - 可视化门控信号的分布
   *   - 分析哪些维度被激活/抑制
   *   - 对比不同 token 的 FFN 中间表示
   *   - 验证 SiLU 激活的输出范围
   *
   * 示例：
   *   const trace = ffn.getActivationTrace();
   *   // trace.gateActivation[0][42] → token 0 在第 42 维的门控值
   *   // trace.gatedHidden[1][100]   → token 1 在第 100 维的 gated 值
   */
  getActivationTrace(): ActivationTrace | null {
    return this.lastTrace;
  }

  // ============================================================
  // 公开 API — 权重检查
  // ============================================================

  /**
   * getWeight(name) — 获取指定投影矩阵的权重
   *
   * 参数：
   * @param name — "gate" | "up" | "down"
   * @returns     对应的权重矩阵
   *
   * 教育用途：在 Playground 中展示权重分布。
   *
   * 示例：
   *   ffn.getWeight("gate")  // → [512][2048] W_gate matrix
   *   ffn.getWeight("up")    // → [512][2048] W_up matrix
   *   ffn.getWeight("down")  // → [2048][512] W_down matrix
   */
  getWeight(name: "gate" | "up" | "down"): number[][] {
    switch (name) {
      case "gate":
        return this.W_gate;
      case "up":
        return this.W_up;
      case "down":
        return this.W_down;
    }
  }

  /**
   * getConfig() — 返回 FFN 配置
   *
   * 示例：
   *   ffn.getConfig()
   *   // → { dModel: 512, dFF: 2048, maxSeqLen: 512 }
   */
  getConfig(): FFNConfig {
    return { ...this.config };
  }

  // ============================================================
  // 公开 API — 分开执行各步骤（教学用）
  // ============================================================

  /**
   * computeGateProjection(x) — 计算 Gate 投影
   *
   * 公式：gate_proj = x @ W_gate
   *
   * 暴露 Gate 投影的原始输出，用于理解
   * 在 SiLU 激活之前的数值分布。
   *
   * @param x - 输入矩阵 [seqLen, dModel]
   * @returns   Gate 投影 [seqLen, dFF]
   */
  computeGateProjection(x: number[][]): number[][] {
    return matrixMultiply(x, this.W_gate);
  }

  /**
   * computeSiLUActivation(gateProj) — 对 Gate 投影应用 SiLU
   *
   * 公式：gate_act = SiLU(gate_proj)
   *
   * 暴露 SiLU 激活的中间结果，用于理解门控信号的分布。
   * SiLU 输出范围约 [-0.278, +∞)，大多数值接近 0 或正。
   *
   * @param gateProj - Gate 投影输出 [seqLen, dFF]
   * @returns          SiLU 激活值 [seqLen, dFF]
   */
  computeSiLUActivation(gateProj: number[][]): number[][] {
    return applySiLU(gateProj);
  }

  /**
   * computeUpProjection(x) — 计算 Up 投影
   *
   * 公式：up_proj = x @ W_up
   *
   * 暴露 Up 投影的候选值，用于理解门控前的"原始信息"。
   *
   * @param x - 输入矩阵 [seqLen, dModel]
   * @returns   Up 投影 [seqLen, dFF]
   */
  computeUpProjection(x: number[][]): number[][] {
    return matrixMultiply(x, this.W_up);
  }

  // ============================================================
  // 内部方法 — 权重初始化
  // ============================================================

  /**
   * initializeWeight(seedOffset) — 初始化一个投影矩阵
   *
   * 使用 Xavier uniform 初始化：
   *   U(-sqrt(6 / (fanIn + fanOut)), +sqrt(6 / (fanIn + fanOut)))
   *
   * 对于 W_gate 和 W_up：
   *   fanIn = dModel, fanOut = dFF
   *   → U(-sqrt(6 / (dModel + dFF)), +sqrt(6 / (dModel + dFF)))
   *
   * 对于 W_down：
   *   fanIn = dFF, fanOut = dModel
   *   → U(-sqrt(6 / (dFF + dModel)), +sqrt(6 / (dFF + dModel)))
   *
   * 确定性保证：
   *   相同的 seedOffset + 维度 → 完全相同的权重矩阵。
   *
   * @param seedOffset — 不同投影矩阵使用不同的 seed
   *                     gate=0, up=1, down=2
   */
  private initializeWeight(seedOffset: number): number[][] {
    const { dModel, dFF } = this.config;

    // W_gate: [dModel × dFF], W_up: [dModel × dFF]
    // W_down: [dFF × dModel]
    const isDownProj = seedOffset === 2;
    const rows = isDownProj ? dFF : dModel;
    const cols = isDownProj ? dModel : dFF;

    const rand = createPRNG(84 + seedOffset);
    const scale = Math.sqrt(6 / (rows + cols));

    const W: number[][] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      W[i] = new Array(cols);
      for (let j = 0; j < cols; j++) {
        W[i][j] = (rand() * 2 - 1) * scale;
      }
    }

    return W;
  }
}
