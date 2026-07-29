// ============================================================
// MiniMind — TransformerBlock.ts
// ============================================================
// MiniTransformerBlock V1 — 教育型 Decoder Block 引擎
//
// 核心功能：
//   - Pre-Norm 架构：Norm 在子层之前
//   - 双残差连接：Attention 残差 + FFN 残差
//   - 依赖注入：组合已有 MiniAttention + MiniFeedForward
//   - 完整的 Block Trace（供可视化和调试）
//
// 数据流：
//   Input [seqLen, dModel]
//     │
//     ├──→ RMSNorm ──→ Attention ──→ Residual Add (+) ←── x
//     │                                              │
//     ├──→ RMSNorm ──→ FFN       ──→ Residual Add (+) ←── x
//     │                                              │
//     └──→ Output [seqLen, dModel]
//
// 教育重点：
//   - 模块组合透明 — 清晰展示 Attention + FFN 的协作
//   - 残差流动可追踪 — 完整 trace 记录每一步的中间状态
//   - 依赖注入 — 不复制已有模块代码，直接使用 MiniAttention + MiniFeedForward
//   - 确定性行为 — 行为由注入的模块决定
// ============================================================

import type {
  TransformerConfig,
  TransformerInput,
  TransformerOutput,
  TransformerTrace,
} from "./types";
import { MiniRMSNorm } from "./RMSNorm";
import type { MiniAttention } from "../attention/Attention";
import type { MiniFeedForward } from "../ffn/FeedForward";

// ============================================================
// MiniTransformerBlock
// ============================================================

/**
 * MiniTransformerBlock — 教育用 Decoder Block 引擎
 *
 * 核心职责：
 *   实现完整的 Pre-Norm Decoder Block。
 *   组合 RMSNorm → Attention → Residual → RMSNorm → FFN → Residual，
 *   形成单个可堆叠的 Transformer 层。
 *
 * 使用方式：
 *
 * ```ts
 * const block = new MiniTransformerBlock(config, attention, ffn);
 *
 * // 准备输入（3 个 token，dModel=512 维向量）
 * const input = {
 *   hiddenStates: [[...512 维...], [...], [...]],
 *   mask: "causal",
 * };
 *
 * // 前向传播
 * const result = block.forward(input);
 * // result.output → [3][512] Block 输出
 * // result.trace  → 完整的 block trace
 *
 * // 检查 trace
 * const t = block.getTrace();
 * // t.normedForAttention   → Pre-Attention RMSNorm 输出
 * // t.attentionOutput      → Attention 子层输出
 * // t.afterAttentionResidual → 第一次残差后
 * // t.normedForFFN         → Pre-FFN RMSNorm 输出
 * // t.ffnOutput            → FFN 子层输出
 * // t.afterFFNResidual     → 最终输出
 * ```
 *
 * 教育设计：
 *   - 模块组合完全透明 — 每个子步骤的结果可单独检查
 *   - 残差流可追踪 — 对比残差前后的值
 *   - 依赖注入 — Attention 和 FFN 由外部提供，不重复实现
 *   - 完整 trace — 每步中间结果可逐元素检查
 *   - Pre-Norm 架构 — 对齐现代 LLM（LLaMA/GPT）的设计选择
 */
export class MiniTransformerBlock {
  private config: TransformerConfig;
  private attention: MiniAttention;
  private ffn: MiniFeedForward;
  private preAttentionNorm: MiniRMSNorm;
  private preFFNNorm: MiniRMSNorm;
  private lastTrace: TransformerTrace | null = null;

  /**
   * @param config    — { dModel, numHeads, headDim, dFF, maxSeqLen, normEps }
   * @param attention — MiniAttention 实例（依赖注入）
   * @param ffn       — MiniFeedForward 实例（依赖注入）
   *
   * 构造时立即：
   *   1. 验证参数（dModel, numHeads, headDim, dFF, maxSeqLen 均需合法）
   *   2. 创建两个 RMSNorm 实例（Pre-Attention 和 Pre-FFN）
   *   3. 持有 Attention 和 FFN 的引用（不复制、不重新创建）
   *
   * 设计原则：
   *   - Attention 和 FFN 通过依赖注入提供
   *   - Block 只负责编排（orchestration），不负责实现
   *   - 两个 RMSNorm 是 Block 独有的（每个 Block 有自己的 γ 参数）
   *
   * Pre-Norm 架构说明：
   *   y = x + Sublayer(Norm(x))
   *   而非 Post-Norm 的 y = Norm(x + Sublayer(x))
   *
   *   这意味着：
   *   - RMSNorm 在子层之前应用（"pre"）
   *   - 残差连接包裹整个 "Norm + Sublayer" 组合
   *   - 梯度可以通过残差路径无损传递
   */
  constructor(
    config: TransformerConfig,
    attention: MiniAttention,
    ffn: MiniFeedForward
  ) {
    // 验证参数
    if (config.dModel <= 0) {
      throw new Error(`dModel must be positive, got ${config.dModel}`);
    }
    if (config.numHeads <= 0) {
      throw new Error(`numHeads must be positive, got ${config.numHeads}`);
    }
    if (config.dModel % config.numHeads !== 0) {
      throw new Error(
        `dModel (${config.dModel}) must be divisible by numHeads (${config.numHeads})`
      );
    }
    if (config.headDim !== config.dModel / config.numHeads) {
      throw new Error(
        `headDim (${config.headDim}) must equal dModel/numHeads (${config.dModel / config.numHeads})`
      );
    }
    if (config.dFF <= 0) {
      throw new Error(`dFF must be positive, got ${config.dFF}`);
    }
    if (config.maxSeqLen <= 0) {
      throw new Error(
        `maxSeqLen must be positive, got ${config.maxSeqLen}`
      );
    }
    if (config.normEps <= 0) {
      throw new Error(`normEps must be positive, got ${config.normEps}`);
    }

    this.config = { ...config };
    this.attention = attention;
    this.ffn = ffn;

    // 创建两个 RMSNorm 实例 — 每个 Block 有自己独立的 γ 参数
    this.preAttentionNorm = new MiniRMSNorm({
      dModel: config.dModel,
      normEps: config.normEps,
    });
    this.preFFNNorm = new MiniRMSNorm({
      dModel: config.dModel,
      normEps: config.normEps,
    });
  }

  // ============================================================
  // 公开 API — 前向传播
  // ============================================================

  /**
   * forward(input) — 完整的 Transformer Block 前向传播
   *
   * 步骤：
   *   1. Pre-Attention RMSNorm
   *   2. Multi-Head Self-Attention
   *   3. 残差连接 1：x + attention_output
   *   4. Pre-FFN RMSNorm
   *   5. SwiGLU Feed-Forward
   *   6. 残差连接 2：x + ffn_output
   *
   * 参数：
   * @param input — { hiddenStates, mask? }
   *   hiddenStates: [seqLen][dModel] 输入 token 表示
   *   mask: 可选的 attention mask
   * @returns       { output, trace }
   *
   * 示例：
   *   const input = {
   *     hiddenStates: [[0.1, 0.2, ...], [0.3, 0.4, ...], [0.5, 0.6, ...]],
   *     mask: "causal",
   *   };
   *   const result = block.forward(input);
   */
  forward(input: TransformerInput): TransformerOutput {
    const { hiddenStates, mask } = input;
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

    // ============================================================
    // 子层 1: Attention
    // ============================================================

    // ① Pre-Attention RMSNorm
    const normedForAttention = this.preAttentionNorm.forward(hiddenStates);

    // ② Multi-Head Self-Attention
    const attnResult = this.attention.forward({
      queries: normedForAttention,
      keys: normedForAttention,
      values: normedForAttention,
      mask: mask ?? null,
    });

    // ③ 残差连接 1：x = x + Attention(Norm(x))
    const afterAttentionResidual: number[][] = new Array(seqLen);
    for (let pos = 0; pos < seqLen; pos++) {
      afterAttentionResidual[pos] = new Array(dModel);
      for (let d = 0; d < dModel; d++) {
        afterAttentionResidual[pos][d] =
          hiddenStates[pos][d] + attnResult.output[pos][d];
      }
    }

    // ============================================================
    // 子层 2: FFN
    // ============================================================

    // ④ Pre-FFN RMSNorm
    const normedForFFN = this.preFFNNorm.forward(afterAttentionResidual);

    // ⑤ SwiGLU Feed-Forward
    const ffnResult = this.ffn.forward({
      hiddenStates: normedForFFN,
    });

    // ⑥ 残差连接 2：x = x + FFN(Norm(x))
    const afterFFNResidual: number[][] = new Array(seqLen);
    for (let pos = 0; pos < seqLen; pos++) {
      afterFFNResidual[pos] = new Array(dModel);
      for (let d = 0; d < dModel; d++) {
        afterFFNResidual[pos][d] =
          afterAttentionResidual[pos][d] + ffnResult.output[pos][d];
      }
    }

    // ── 构建 trace ──
    const trace: TransformerTrace = {
      seqLen,
      dModel,
      dFF,
      normedForAttention,
      attentionOutput: attnResult.output,
      afterAttentionResidual,
      normedForFFN,
      ffnOutput: ffnResult.output,
      afterFFNResidual,
    };

    this.lastTrace = trace;

    return { output: afterFFNResidual, trace };
  }

  /**
   * getTrace() — 获取最近一次 forward 的完整 block trace
   *
   * 返回最后一次 forward 调用产生的完整 block trace，
   * 包含所有中间结果。如果在 forward 之前调用，返回 null。
   *
   * trace 结构：
   *   - normedForAttention[pos][dim]    → Pre-Attention RMSNorm 输出
   *   - attentionOutput[pos][dim]       → Attention 子层输出
   *   - afterAttentionResidual[pos][dim] → 第一次残差后
   *   - normedForFFN[pos][dim]          → Pre-FFN RMSNorm 输出
   *   - ffnOutput[pos][dim]             → FFN 子层输出
   *   - afterFFNResidual[pos][dim]      → 最终输出
   *
   * 教育用途：
   *   - 对比 Attention 和 FFN 对表示的改变量
   *   - 追踪残差流中的信息累积
   *   - 验证 Pre-Norm 的归一化效果
   *   - 分析每步变换的幅度
   *
   * 示例：
   *   const trace = block.getTrace();
   *   // 对比 Attention 前后的变化
   *   const attnDelta = trace.afterAttentionResidual[0][0] - input[0][0];
   *   // 对比 FFN 前后的变化
   *   const ffnDelta = trace.afterFFNResidual[0][0] - trace.afterAttentionResidual[0][0];
   */
  getTrace(): TransformerTrace | null {
    return this.lastTrace;
  }

  // ============================================================
  // 公开 API — 配置 & 子模块访问
  // ============================================================

  /**
   * getConfig() — 返回 Transformer Block 配置
   *
   * 示例：
   *   block.getConfig()
   *   // → { dModel: 512, numHeads: 8, headDim: 64, dFF: 2048, maxSeqLen: 512, normEps: 1e-6 }
   */
  getConfig(): TransformerConfig {
    return { ...this.config };
  }

  /**
   * getAttention() — 获取注入的 Attention 模块
   *
   * 用于检查和操作 Attention 模块的权重/配置。
   *
   * 示例：
   *   block.getAttention().getWeight("Q")
   *   // → W_Q 权重矩阵
   */
  getAttention(): MiniAttention {
    return this.attention;
  }

  /**
   * getFFN() — 获取注入的 FFN 模块
   *
   * 用于检查和操作 FFN 模块的权重/配置。
   *
   * 示例：
   *   block.getFFN().getWeight("gate")
   *   // → W_gate 权重矩阵
   */
  getFFN(): MiniFeedForward {
    return this.ffn;
  }

  /**
   * getPreAttentionNorm() — 获取 Pre-Attention RMSNorm 实例
   *
   * 用于检查 Attention 前的 RMSNorm γ 参数。
   *
   * 示例：
   *   block.getPreAttentionNorm().getWeights()
   *   // → γ 参数数组
   */
  getPreAttentionNorm(): MiniRMSNorm {
    return this.preAttentionNorm;
  }

  /**
   * getPreFFNNorm() — 获取 Pre-FFN RMSNorm 实例
   *
   * 用于检查 FFN 前的 RMSNorm γ 参数。
   *
   * 示例：
   *   block.getPreFFNNorm().getWeights()
   *   // → γ 参数数组
   */
  getPreFFNNorm(): MiniRMSNorm {
    return this.preFFNNorm;
  }
}
