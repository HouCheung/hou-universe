// ============================================================
// MiniMind — MiniMindModel.ts
// ============================================================
// MiniMindModel V1 — 完整的前向传播编排器
//
// 核心功能：
//   - 将 Tokenizer、Embedding、RoPE、Transformer Blocks、LM Head
//     组合成一个完整的 Text → Logits 管道
//   - 依赖注入 — 不复制任何已有模块代码
//   - 完整的 Model Trace — 每一步中间结果可检查
//
// 数据流：
//   Text
//     → Tokenizer.encode()         → Token IDs
//     → Embedding.getEmbeddings()  → Token Vectors
//     → RoPE (split dModel→heads)  → Position-Aware Vectors
//     → TransformerBlock[]         → Contextualized Representations
//     → LMHead.forward()           → Vocabulary Logits
//
// RoPE 应用说明：
//   RoPE 在 headDim 维度上旋转。MiniMindModel 将每个 token 的
//   dModel 向量拆分为 numHeads 个 headDim 片段，对每个片段
//   独立应用 RoPE 旋转后再拼接回 dModel 向量。
//   这与 Attention 内部对 Q/K 应用 RoPE 的方式一致。
//
// 教育重点：
//   - 模块编排透明 — 清晰展示从文本到 logits 的每一步
//   - 依赖注入 — 所有子模块由外部提供，模型只负责组装
//   - 完整 trace — 每个阶段的结果可单独检查
//   - 确定性行为 — 行为由注入的模块决定
// ============================================================

import type { ModelConfig, ModelInput, ModelOutput, ModelTrace } from "./types";
import type { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import type { MiniEmbedding } from "../embedding/Embedding";
import type { RotaryEmbedding } from "../rope/RotaryEmbedding";
import type { MiniTransformerBlock } from "../transformer/TransformerBlock";
import type { MiniLMHead } from "./LMHead";

/**
 * MiniMindModel — 教育用完整前向传播模型
 *
 * 核心职责：
 *   作为组合根（composition root），将 5 个子模块
 *   串联成完整的 Text → Logits 管道。
 *   不实现任何子模块逻辑 — 只负责编排。
 *
 * 使用方式：
 *
 * ```ts
 * const model = new MiniMindModel(config, {
 *   tokenizer,
 *   embedding,
 *   rope,
 *   blocks: [block1, block2, ...],
 *   lmHead,
 * });
 *
 * // 前向传播
 * const result = model.forward({ inputText: "Hello HOU Universe" });
 * // result.logits → [vocabSize] 词表大小的分数
 * // result.hiddenStates → [seqLen][dModel] 最终隐藏状态
 *
 * // 检查完整 pipeline trace
 * const trace = model.getTrace();
 * // trace.tokens → ["Hello", "HOU", "Universe"]
 * // trace.embeddings → [3][512]
 * // trace.blockTraces → [numLayers] 每层的详细 trace
 * ```
 *
 * 教育设计：
 *   - 模块组合完全透明 — 每个阶段的结果可单独检查
 *   - 依赖注入 — 所有子模块由外部提供
 *   - 完整 trace — 从文本到 logits 的全流程记录
 *   - 对齐 LLM 架构 — Tokenizer, Embedding, RoPE, Transformer, LM Head
 */
export class MiniMindModel {
  private config: ModelConfig;
  private tokenizer: MiniTokenizer;
  private embedding: MiniEmbedding;
  private rope: RotaryEmbedding;
  private blocks: MiniTransformerBlock[];
  private lmHead: MiniLMHead;
  private lastTrace: ModelTrace | null = null;

  /**
   * @param config — ModelConfig
   * @param deps   — { tokenizer, embedding, rope, blocks, lmHead }
   *
   * 构造时立即：
   *   1. 验证配置参数
   *   2. 验证 blocks 数量与 config.numLayers 一致
   *   3. 持有所有子模块的引用（依赖注入，不复制）
   *
   * 设计原则：
   *   - 所有子模块通过依赖注入提供
   *   - Model 只负责编排（orchestration），不负责实现
   *   - blocks 数组长度必须等于 numLayers
   *   - 不重复实现任何 math（attention、ffn、rope、embedding 等）
   */
  constructor(
    config: ModelConfig,
    deps: {
      tokenizer: MiniTokenizer;
      embedding: MiniEmbedding;
      rope: RotaryEmbedding;
      blocks: MiniTransformerBlock[];
      lmHead: MiniLMHead;
    }
  ) {
    // 验证参数
    if (config.vocabSize <= 0) {
      throw new Error(`vocabSize must be positive, got ${config.vocabSize}`);
    }
    if (config.dModel <= 0) {
      throw new Error(`dModel must be positive, got ${config.dModel}`);
    }
    if (config.numHeads <= 0) {
      throw new Error(`numHeads must be positive, got ${config.numHeads}`);
    }
    if (config.numLayers <= 0) {
      throw new Error(`numLayers must be positive, got ${config.numLayers}`);
    }
    if (config.dFF <= 0) {
      throw new Error(`dFF must be positive, got ${config.dFF}`);
    }
    if (config.maxSeqLen <= 0) {
      throw new Error(`maxSeqLen must be positive, got ${config.maxSeqLen}`);
    }
    if (config.normEps <= 0) {
      throw new Error(`normEps must be positive, got ${config.normEps}`);
    }
    if (config.ropeTheta <= 0) {
      throw new Error(`ropeTheta must be positive, got ${config.ropeTheta}`);
    }

    if (deps.blocks.length !== config.numLayers) {
      throw new Error(
        `blocks.length (${deps.blocks.length}) must equal numLayers (${config.numLayers})`
      );
    }

    // 验证 dModel 可被 numHeads 整除（RoPE split/merge 的前提）
    if (config.dModel % config.numHeads !== 0) {
      throw new Error(
        `dModel (${config.dModel}) must be divisible by numHeads (${config.numHeads})`
      );
    }

    this.config = { ...config };
    this.tokenizer = deps.tokenizer;
    this.embedding = deps.embedding;
    this.rope = deps.rope;
    this.blocks = [...deps.blocks];
    this.lmHead = deps.lmHead;
  }

  // ============================================================
  // 公开 API — 前向传播
  // ============================================================

  /**
   * forward(input) — 完整的模型前向传播
   *
   * 步骤：
   *   1. Tokenizer.encode()  — 文本 → Token IDs
   *   2. Embedding.getEmbeddings() — Token IDs → Dense Vectors
   *   3. RoPE (split → rotate → merge) — 注入位置信息
   *   4. TransformerBlock.forward() × N — 逐层变换
   *   5. LMHead.forward() — Hidden State → Logits
   *
   * 参数：
   * @param input — { inputText, causalMask? }
   * @returns       { logits, hiddenStates, trace }
   *
   * 示例：
   *   const result = model.forward({ inputText: "Hello HOU Universe" });
   *   // result.logits → [vocabSize]
   *   // result.hiddenStates → [3][512]
   *   // result.trace.tokens → ["Hello", "HOU", "Universe"]
   */
  forward(input: ModelInput): ModelOutput {
    const { inputText, causalMask = true } = input;

    // ── 确定 mask ──
    const mask = causalMask ? ("causal" as const) : null;

    // ── Stage 1: Tokenizer ──
    const tokens = this.tokenizer.tokenize(inputText);
    const tokenIds = this.tokenizer.encode(inputText);

    if (tokenIds.length === 0) {
      throw new Error("Tokenizer produced empty token sequence");
    }
    if (tokenIds.length > this.config.maxSeqLen) {
      throw new Error(
        `Sequence length ${tokenIds.length} exceeds maxSeqLen ${this.config.maxSeqLen}`
      );
    }

    // ── Stage 2: Embedding ──
    const embeddings = this.embedding.getEmbeddings(tokenIds);

    // ── Stage 3: RoPE ──
    // RoPE 在 headDim 维度上旋转。将每个 token 的 dModel 向量
    // 拆分为 numHeads 个 headDim 片段，独立旋转后拼接。
    const rotatedEmbeddings = this.applyRoPEToEmbeddings(
      embeddings,
      tokenIds.length
    );

    // ── Stage 4: Transformer Blocks ──
    const blockTraces = [];
    let currentHidden = rotatedEmbeddings;
    for (let i = 0; i < this.blocks.length; i++) {
      const blockResult = this.blocks[i].forward({
        hiddenStates: currentHidden,
        mask,
      });
      currentHidden = blockResult.output;
      blockTraces.push(blockResult.trace);
    }

    // ── Stage 5: LM Head ──
    // 取最后一个 token 的 hidden state 投影到 vocabulary
    const lastHidden = currentHidden[currentHidden.length - 1];
    const logits = this.lmHead.forward(lastHidden) as number[];

    // ── 构建 trace ──
    const trace: ModelTrace = {
      inputText,
      tokens,
      tokenIds,
      embeddings,
      rotatedEmbeddings,
      seqLen: tokenIds.length,
      dModel: this.config.dModel,
      blockTraces,
      hiddenStates: currentHidden,
      logits,
    };

    this.lastTrace = trace;

    return { logits, hiddenStates: currentHidden, trace };
  }

  // ============================================================
  // 内部方法 — RoPE 编排
  // ============================================================

  /**
   * applyRoPEToEmbeddings(embeddings, seqLen) — 对 embedding 输出应用 RoPE
   *
   * RoPE 操作 headDim 维度的向量（经过 2D 对旋转）。
   * 但 embedding 输出的是 dModel 维度的向量。
   *
   * 解决方案：将每个 token 的 dModel 向量拆分为 numHeads 个
   * headDim 片段，对每个片段独立旋转（相同位置），再拼接。
   *
   * 这与 Attention 内部对 Q/K 应用 RoPE 的方式一致 —
   * 每个 head 的 Q/K 向量独立旋转。
   *
   * 步骤：
   *   1. 对每个 token、每个 head: 提取 headDim 片段
   *   2. 转换为 Float64Array（RoPE 内部格式）
   *   3. 调用 rope.rotate() 应用旋转
   *   4. 提取 result 字段（Float64Array → number[]）
   *   5. 拼接回 dModel 向量
   *
   * @param embeddings — [seqLen][dModel] number[][]
   * @param seqLen     — 序列长度
   * @returns            [seqLen][dModel] 旋转后的向量
   */
  private applyRoPEToEmbeddings(
    embeddings: number[][],
    seqLen: number
  ): number[][] {
    const { dModel, numHeads, headDim } = this.config;
    const rotated: number[][] = new Array(seqLen);

    for (let pos = 0; pos < seqLen; pos++) {
      rotated[pos] = new Array(dModel);

      for (let h = 0; h < numHeads; h++) {
        const headStart = h * headDim;

        // 提取 headDim 片段并转为 Float64Array
        const headVec = new Float64Array(headDim);
        for (let d = 0; d < headDim; d++) {
          headVec[d] = embeddings[pos][headStart + d];
        }

        // 应用 RoPE 旋转
        const rotationResult = this.rope.rotate(headVec, pos);

        // 写回旋转后的片段
        for (let d = 0; d < headDim; d++) {
          rotated[pos][headStart + d] = rotationResult.result[d];
        }
      }
    }

    return rotated;
  }

  /**
   * getTrace() — 获取最近一次 forward 的完整 model trace
   *
   * 返回最后一次 forward 调用产生的完整 model trace。
   * 如果在 forward 之前调用，返回 null。
   *
   * trace 结构包含从 Text → Tokens → Embeddings →
   * RoPE → Transformer → Logits 的全流程中间结果。
   *
   * 教育用途：
   *   - 追踪文本如何逐步转化为 logits
   *   - 对比不同层对表示的改变
   *   - 验证 RoPE 是否正确注入位置信息
   *   - 分析 LM Head 的 logits 分布
   *
   * 示例：
   *   const trace = model.getTrace();
   *   if (trace) {
   *     // 对比 Embedding 和 final hidden state
   *     const delta = trace.hiddenStates[0][0] - trace.embeddings[0][0];
   *   }
   */
  getTrace(): ModelTrace | null {
    return this.lastTrace;
  }

  // ============================================================
  // 公开 API — 配置 & 子模块访问
  // ============================================================

  /**
   * getConfig() — 返回模型配置
   *
   * 示例：
   *   model.getConfig()
   *   // → { vocabSize: 1000, dModel: 512, numHeads: 8, ... }
   */
  getConfig(): ModelConfig {
    return { ...this.config };
  }

  /**
   * getTokenizer() — 获取注入的 Tokenizer 实例
   *
   * 用于检查 tokenizer 的配置和词汇表。
   */
  getTokenizer(): MiniTokenizer {
    return this.tokenizer;
  }

  /**
   * getEmbedding() — 获取注入的 Embedding 实例
   *
   * 用于检查 embedding 矩阵和配置。
   */
  getEmbedding(): MiniEmbedding {
    return this.embedding;
  }

  /**
   * getRoPE() — 获取注入的 RoPE 实例
   *
   * 用于检查频率缓存和旋转配置。
   */
  getRoPE(): RotaryEmbedding {
    return this.rope;
  }

  /**
   * getBlocks() — 获取注入的 Transformer Block 数组
   *
   * 用于检查每一层的 trace 和配置。
   */
  getBlocks(): MiniTransformerBlock[] {
    return [...this.blocks];
  }

  /**
   * getLMHead() — 获取注入的 LM Head 实例
   *
   * 用于检查 LM Head 的权重矩阵。
   */
  getLMHead(): MiniLMHead {
    return this.lmHead;
  }
}
