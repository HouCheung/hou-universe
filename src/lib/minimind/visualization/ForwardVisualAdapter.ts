// ============================================================
// MiniMind — ForwardVisualAdapter.ts
// ============================================================
// ForwardVisualAdapter — ModelTrace → VisualTrace 的桥接器
//
// 核心功能：
//   - 对 ModelTrace 进行 enrich，生成 UI 可消费的 VisualTrace
//   - 通过 MiniMindModel 公开的子模块 API 获取额外数据
//   - 所有 enrichment 步骤包装在 try/catch 中，支持优雅降级
//   - Capabilities 标志追踪各阶段 enrich 是否成功
//
// 架构：
//   - 单一静态类，仅一个公开方法 enrich()
//   - 6 个私有静态 enrich 方法 + buildCapabilities + 2 个 math helper
//   - 不依赖任何 UI 框架 — 纯数据转换层
//
// 数据来源：
//   - ModelTrace（raw 数据）
//   - MiniMindModel 公开的子模块 API（getTokenizer, getEmbedding,
//     getRoPE, getBlocks, getLMHead, getConfig）
// ============================================================

import type { MiniMindModel } from "../model/MiniMindModel";
import type { ModelTrace, ModelConfig } from "../model/types";
import { DEFAULT_CAPABILITIES } from "./capabilities";
import type {
  VisualTrace,
  TokenizerVisualData,
  TokenDetail,
  EmbeddingVisualData,
  VectorStat,
  EmbeddingMatrixInfo,
  RoPEVisualData,
  RoPERotationTrace,
  RoPEConfigSummary,
  DimPairTrace,
  TransformerVisualData,
  TransformerOverviewData,
  AttentionVisualData,
  FFNVisualData,
  LMHeadVisualData,
  TokenPrediction,
  LogitsDistribution,
  VisualizationCapabilities,
} from "./types";

// ============================================================
// ForwardVisualAdapter
// ============================================================

/**
 * ForwardVisualAdapter — ModelTrace 到 VisualTrace 的桥接器
 *
 * 核心职责：
 *   对 MiniMindModel.forward() 产生的 ModelTrace 进行 enrichment，
 *   注入从各子模块获取的额外数据（词汇表、嵌入矩阵元信息、
 *   RoPE 旋转轨迹、Attention/FFN trace 等），生成 UI 组件可直接
 *   消费的 VisualTrace。
 *
 * 使用方式：
 *
 * ```ts
 * const visualTrace = ForwardVisualAdapter.enrich(model, "Hello World");
 * // visualTrace.raw           → 原始 ModelTrace
 * // visualTrace.tokenizer     → TokenizerVisualData
 * // visualTrace.embedding     → EmbeddingVisualData
 * // visualTrace.rope          → RoPEVisualData
 * // visualTrace.transformer   → TransformerVisualData[]
 * // visualTrace.lmHead        → LMHeadVisualData
 * // visualTrace.capabilities  → 各阶段能力标志
 * ```
 *
 * 设计原则：
 *   - 优雅降级：每个 enrich 步骤独立 try/catch，
 *     某一步失败不影响其他步骤
 *   - Capabilities 驱动 UI：UI 根据 capabilities 标志
 *     决定渲染哪些子面板
 *   - 纯数据转换：不依赖任何 UI 框架
 *   - 显式类型：禁用 any，所有返回类型明确定义
 */
export class ForwardVisualAdapter {
  private static readonly SPECIAL_TOKENS = new Set([
    "<pad>",
    "<unk>",
    "<bos>",
    "<eos>",
  ]);

  // ============================================================
  // 公开 API — enrich
  // ============================================================

  /**
   * enrich(model, inputText) — 执行前向传播并生成完整 VisualTrace
   *
   * 这是 ForwardVisualAdapter 的唯一公开入口。
   * 内部顺序执行所有 enrichment 步骤。
   *
   * 参数：
   * @param model     — MiniMindModel 实例
   * @param inputText — 输入文本
   * @returns          完整的 VisualTrace
   *
   * 示例：
   *   const vt = ForwardVisualAdapter.enrich(model, "Hello World");
   */
  static enrich(model: MiniMindModel, inputText: string): VisualTrace {
    const output = model.forward({ inputText });
    const trace = output.trace;
    const config = model.getConfig();

    const tokenizer = this.enrichTokenizer(model, trace);
    const embedding = this.enrichEmbedding(model, trace);
    const rope = this.enrichRoPE(model, trace, config);
    const transformer = this.enrichTransformer(model, trace);
    const lmHead = this.enrichLMHead(model, trace);
    const capabilities = this.buildCapabilities(
      tokenizer,
      embedding,
      rope,
      transformer,
      lmHead
    );

    return {
      raw: trace,
      tokenizer,
      embedding,
      rope,
      transformer,
      lmHead,
      capabilities,
    };
  }

  // ============================================================
  // Stage 1: Tokenizer Enrichment
  // ============================================================

  /**
   * enrichTokenizer(model, trace) — 用词汇表信息丰富分词结果
   *
   * 数据来源：
   *   - ModelTrace.tokens / tokenIds / inputText
   *   - model.getTokenizer().getVocabulary() → 词汇表映射
   *
   * 为每个 token 构建 TokenDetail：
   *   - exists: 是否存在于词汇表中
   *   - isSpecial: 是否为 <pad>/<unk>/<bos>/<eos>
   */
  private static enrichTokenizer(
    model: MiniMindModel,
    trace: ModelTrace
  ): TokenizerVisualData {
    try {
      const vocab = model.getTokenizer().getVocabulary();

      const tokenDetails: TokenDetail[] = trace.tokens.map((token, idx) => {
        const id = trace.tokenIds[idx] ?? vocab.tokenToId.get("<unk>") ?? -1;
        return {
          token,
          id,
          exists: vocab.tokenToId.has(token),
          isSpecial: this.SPECIAL_TOKENS.has(token),
        };
      });

      return {
        tokens: [...trace.tokens],
        tokenIds: [...trace.tokenIds],
        inputText: trace.inputText,
        tokenDetails,
        vocabSize: vocab.size,
      };
    } catch {
      // 优雅降级：返回最简数据
      return {
        tokens: [...trace.tokens],
        tokenIds: [...trace.tokenIds],
        inputText: trace.inputText,
        tokenDetails: trace.tokens.map((token, idx) => ({
          token,
          id: trace.tokenIds[idx] ?? -1,
          exists: true,
          isSpecial: this.SPECIAL_TOKENS.has(token),
        })),
        vocabSize: 0,
      };
    }
  }

  // ============================================================
  // Stage 2: Embedding Enrichment
  // ============================================================

  /**
   * enrichEmbedding(model, trace) — 用嵌入矩阵信息和向量统计丰富数据
   *
   * 数据来源：
   *   - ModelTrace.embeddings / tokens
   *   - model.getEmbedding().getMatrixInfo() → 矩阵元信息
   *
   * 为每个位置计算：
   *   - min / max / mean / l2Norm
   */
  private static enrichEmbedding(
    model: MiniMindModel,
    trace: ModelTrace
  ): EmbeddingVisualData {
    try {
      const matrixInfo: EmbeddingMatrixInfo =
        model.getEmbedding().getMatrixInfo();

      const vectorStats: VectorStat[] = trace.embeddings.map((vec, idx) => {
        const len = vec.length;
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        let sumSq = 0;

        for (let d = 0; d < len; d++) {
          const v = vec[d];
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
          sumSq += v * v;
        }

        return {
          tokenIndex: idx,
          token: trace.tokens[idx] ?? "<unk>",
          min,
          max,
          mean: sum / len,
          l2Norm: Math.sqrt(sumSq),
        };
      });

      return {
        vectors: trace.embeddings,
        dModel: trace.dModel,
        vectorStats,
        matrixInfo,
      };
    } catch {
      // 优雅降级
      const vectorStats: VectorStat[] = trace.embeddings.map((vec, idx) => {
        const len = vec.length;
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        let sumSq = 0;
        for (let d = 0; d < len; d++) {
          const v = vec[d];
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
          sumSq += v * v;
        }
        return {
          tokenIndex: idx,
          token: trace.tokens[idx] ?? "<unk>",
          min,
          max,
          mean: sum / len,
          l2Norm: Math.sqrt(sumSq),
        };
      });

      return {
        vectors: trace.embeddings,
        dModel: trace.dModel,
        vectorStats,
        matrixInfo: { vocabSize: 0, embeddingDim: trace.dModel, totalParameters: 0 },
      };
    }
  }

  // ============================================================
  // Stage 3: RoPE Enrichment
  // ============================================================

  /**
   * enrichRoPE(model, trace, config) — 用 RoPE 旋转轨迹丰富数据
   *
   * 这是最复杂的 enrichment。对每个位置 × 每个头：
   *   1. 从 trace.embeddings 提取 headDim 片段
   *   2. 转换为 Float64Array
   *   3. 调用 model.getRoPE().rotate(headVec, pos)
   *   4. 收集 RotationResult.traces（采样最多 8 对 dim pair）
   *   5. 映射为 DimPairTrace（全局维度索引 = headStart + localDim）
   *   6. 记录 normBefore / normAfter / normPreserved
   */
  private static enrichRoPE(
    model: MiniMindModel,
    trace: ModelTrace,
    config: ModelConfig
  ): RoPEVisualData {
    const { seqLen } = trace;
    const { numHeads, headDim, ropeTheta, maxSeqLen } = config;
    const rope = model.getRoPE();

    const ropeConfig: RoPEConfigSummary = {
      headDim,
      numHeads,
      theta: ropeTheta,
      maxSeqLen,
    };

    const rotationTraces: RoPERotationTrace[][] = [];

    try {
      for (let pos = 0; pos < seqLen; pos++) {
        const headTraces: RoPERotationTrace[] = [];

        for (let h = 0; h < numHeads; h++) {
          const headStart = h * headDim;

          // 提取 headDim 片段并转换为 Float64Array
          const headVec = new Float64Array(headDim);
          for (let d = 0; d < headDim; d++) {
            headVec[d] = trace.embeddings[pos][headStart + d];
          }

          // 应用 RoPE 旋转
          const rotationResult = rope.rotate(headVec, pos);

          // 采样最多 8 对 dim pair
          const maxSample = 8;
          const rawTraces = rotationResult.traces;
          const step =
            rawTraces.length > maxSample
              ? Math.ceil(rawTraces.length / maxSample)
              : 1;

          const sampledPairs: DimPairTrace[] = [];
          for (let i = 0; i < rawTraces.length; i += step) {
            if (sampledPairs.length >= maxSample) break;
            const rt = rawTraces[i];
            sampledPairs.push({
              dimPairIndex: rt.dimPairIndex,
              evenDim: headStart + rt.evenDim,
              oddDim: headStart + rt.oddDim,
              before: rt.before,
              after: rt.after,
              angle: rt.angle,
              frequency: rt.frequency,
            });
          }

          headTraces.push({
            position: pos,
            headIndex: h,
            normBefore: rotationResult.normBefore,
            normAfter: rotationResult.normAfter,
            normPreserved: rotationResult.normPreserved,
            sampledPairs,
          });
        }

        rotationTraces.push(headTraces);
      }

      return {
        before: trace.embeddings,
        after: trace.rotatedEmbeddings,
        rotationTraces,
        ropeConfig,
      };
    } catch {
      // 优雅降级：无法获得 RoPE 旋转轨迹
      return {
        before: trace.embeddings,
        after: trace.rotatedEmbeddings,
        rotationTraces: [],
        ropeConfig,
      };
    }
  }

  // ============================================================
  // Stage 4: Transformer Enrichment
  // ============================================================

  /**
   * enrichTransformer(model, trace) — 用 Attention/FFN trace 丰富数据
   *
   * 对每个 Block：
   *   1. 基于 blockTrace 构建 TransformerOverviewData
   *      （各阶段的 l2NormMatrix + tokenDeltas）
   *   2. 尝试获取 AttentionTrace → 构建 AttentionVisualData
   *   3. 尝试获取 ActivationTrace → 构建 FFNVisualData
   *
   * 注意：步骤 2/3 包装在独立的 try/catch 中，确保
   * Attention trace 失败不影响 FFN trace（反之亦然）。
   */
  private static enrichTransformer(
    model: MiniMindModel,
    trace: ModelTrace
  ): TransformerVisualData[] {
    const blocks = model.getBlocks();
    const result: TransformerVisualData[] = [];

    for (let i = 0; i < trace.blockTraces.length; i++) {
      const blockTrace = trace.blockTraces[i];
      const block = blocks[i];

      // 确定该层的输入（第 0 层输入为 rotatedEmbeddings，其他层为上一层输出）
      const layerInput =
        i === 0
          ? trace.rotatedEmbeddings
          : trace.blockTraces[i - 1].afterFFNResidual;

      // ── 构建概览 ──
      const overview: TransformerOverviewData = {
        seqLen: blockTrace.seqLen,
        dModel: blockTrace.dModel,
        attentionInputNorm: this.l2NormMatrix(blockTrace.normedForAttention),
        attentionOutputNorm: this.l2NormMatrix(blockTrace.attentionOutput),
        afterAttentionResidualNorm: this.l2NormMatrix(
          blockTrace.afterAttentionResidual
        ),
        ffnInputNorm: this.l2NormMatrix(blockTrace.normedForFFN),
        ffnOutputNorm: this.l2NormMatrix(blockTrace.ffnOutput),
        afterFFNResidualNorm: this.l2NormMatrix(
          blockTrace.afterFFNResidual
        ),
        tokenDeltas: this.computeTokenDeltas(
          blockTrace.afterFFNResidual,
          layerInput
        ),
      };

      // ── 构建 Attention 可视化数据 ──
      let attention: AttentionVisualData | null = null;
      try {
        const attnTrace = block.getAttention().getAttentionTrace();
        if (attnTrace !== null) {
          attention = this.buildAttentionVisualData(attnTrace);
        }
      } catch {
        attention = null;
      }

      // ── 构建 FFN 可视化数据 ──
      let ffn: FFNVisualData | null = null;
      try {
        const actTrace = block.getFFN().getActivationTrace();
        if (actTrace !== null) {
          ffn = this.buildFFNVisualData(actTrace);
        }
      } catch {
        ffn = null;
      }

      result.push({
        layerIndex: i,
        overview,
        attention,
        ffn,
      });
    }

    return result;
  }

  /**
   * buildAttentionVisualData(trace) — 从 AttentionTrace 构建可视化数据
   *
   * 计算每个注意力头的熵值：
   *   headEntropies[h] = 所有 query 位置熵值的均值
   *   其中每个 query 位置熵值 = -sum_k(w[q][k] * log(w[q][k]))
   *   （w[q][k] > 1e-10 的项才参与求和，避免 log(0)）
   */
  private static buildAttentionVisualData(
    trace: import("../attention/types").AttentionTrace
  ): AttentionVisualData {
    const { seqLen, numHeads, headDim, attentionWeights, rawScores, causalMaskApplied } = trace;

    const headEntropies: number[] = new Array(numHeads);
    for (let h = 0; h < numHeads; h++) {
      let totalEntropy = 0;
      const weights = attentionWeights[h];
      for (let q = 0; q < seqLen; q++) {
        let entropy = 0;
        for (let k = 0; k < seqLen; k++) {
          const w = weights[q][k];
          if (w > 1e-10) {
            entropy -= w * Math.log(w);
          }
        }
        totalEntropy += entropy;
      }
      headEntropies[h] = totalEntropy / seqLen;
    }

    return {
      seqLen,
      numHeads,
      headDim,
      attentionWeights,
      rawScores,
      causalMaskApplied,
      headEntropies,
    };
  }

  /**
   * buildFFNVisualData(trace) — 从 ActivationTrace 构建可视化数据
   *
   * 计算每个 token 的激活稀疏度：
   *   activationSparsity[pos] = |gate值接近零的维度| / dFF
   *   （阈值：|gate| < 1e-6 视为不活跃）
   */
  private static buildFFNVisualData(
    trace: import("../ffn/types").ActivationTrace
  ): FFNVisualData {
    const { seqLen, dFF, gateActivation, gatedHidden } = trace;

    const activationSparsity: number[] = new Array(seqLen);
    for (let pos = 0; pos < seqLen; pos++) {
      let inactive = 0;
      for (let d = 0; d < dFF; d++) {
        if (Math.abs(gateActivation[pos][d]) < 1e-6) {
          inactive++;
        }
      }
      activationSparsity[pos] = inactive / dFF;
    }

    return {
      seqLen,
      dFF,
      gateActivations: gateActivation,
      gatedHidden,
      activationSparsity,
    };
  }

  // ============================================================
  // Stage 5: LM Head Enrichment
  // ============================================================

  /**
   * enrichLMHead(model, trace) — 用 softmax/entropy/top-K 丰富 logits
   *
   * 计算步骤：
   *   1. 复制原始 logits
   *   2. 数值稳定的 softmax（减去 maxLogit）
   *   3. 分布统计：min / max / mean / stdDev / entropy
   *   4. Top-10 预测（按 logit 降序），查找 token 标签
   *   5. 最后一个 token 的 hidden state
   */
  private static enrichLMHead(
    model: MiniMindModel,
    trace: ModelTrace
  ): LMHeadVisualData {
    const logits = [...trace.logits];
    const lastHiddenState =
      trace.hiddenStates.length > 0
        ? [...trace.hiddenStates[trace.hiddenStates.length - 1]]
        : [];

    try {
      // ── 数值稳定的 softmax ──
      const probabilities = this.computeSoftmax(logits);

      // ── 分布统计 ──
      const distribution = this.computeLogitsDistribution(logits, probabilities);

      // ── Top-K 预测 ──
      const topPredictions = this.computeTopPredictions(
        logits,
        probabilities,
        model
      );

      return {
        logits,
        probabilities,
        topPredictions,
        distribution,
        lastHiddenState,
      };
    } catch {
      // 优雅降级：返回 logits 但无 softmax 处理
      return {
        logits,
        probabilities: [],
        topPredictions: [],
        distribution: {
          min: 0,
          max: 0,
          mean: 0,
          stdDev: 0,
          entropy: 0,
        },
        lastHiddenState,
      };
    }
  }

  /**
   * computeSoftmax(logits) — 数值稳定的 softmax
   *
   * 公式：
   *   p_i = exp(logit_i - maxLogit) / sum_j exp(logit_j - maxLogit)
   *
   * 减去 maxLogit 防止 exp 溢出。
   */
  private static computeSoftmax(logits: number[]): number[] {
    // ── 空 logits 防护 ──
    if (logits.length === 0) return [];

    const maxLogit = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - maxLogit));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    if (sumExp === 0) {
      // 极端退化情况（所有 logits = -Infinity）
      return logits.map(() => 1 / logits.length);
    }
    return exps.map((e) => e / sumExp);
  }

  /**
   * computeLogitsDistribution(logits, probs) — 计算 logits 分布统计
   *
   * 返回：
   *   - min / max / mean（logits 的统计）
   *   - stdDev（logits 的标准差）
   *   - entropy（概率分布的熵 = -sum(p * log(p))）
   */
  private static computeLogitsDistribution(
    logits: number[],
    probs: number[]
  ): LogitsDistribution {
    const len = logits.length;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (let i = 0; i < len; i++) {
      const v = logits[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const mean = sum / len;

    // 方差
    let sumSqDiff = 0;
    for (let i = 0; i < len; i++) {
      const diff = logits[i] - mean;
      sumSqDiff += diff * diff;
    }
    const stdDev = Math.sqrt(sumSqDiff / len);

    // 熵
    let entropy = 0;
    for (let i = 0; i < probs.length; i++) {
      const p = probs[i];
      if (p > 1e-10) {
        entropy -= p * Math.log(p);
      }
    }

    return { min, max, mean, stdDev, entropy };
  }

  /**
   * computeTopPredictions(logits, probs, model) — 计算 Top-10 预测
   *
   * 按 logit 值降序排序，取前 10 个，
   * 通过 model.getTokenizer().getVocabulary().idToToken 查找 token 标签。
   */
  private static computeTopPredictions(
    logits: number[],
    probs: number[],
    model: MiniMindModel
  ): TokenPrediction[] {
    const topK = 10;

    // 创建索引数组并按 logit 降序排序
    const indices = logits.map((_, i) => i);
    indices.sort((a, b) => logits[b] - logits[a]);

    let idToToken: ReadonlyMap<number, string>;
    try {
      idToToken = model.getTokenizer().getVocabulary().idToToken;
    } catch {
      idToToken = new Map();
    }

    const predictions: TokenPrediction[] = [];
    for (let rank = 0; rank < Math.min(topK, indices.length); rank++) {
      const tokenId = indices[rank];
      predictions.push({
        rank: rank + 1,
        tokenId,
        token: idToToken.get(tokenId) ?? `<id_${tokenId}>`,
        logit: logits[tokenId],
        probability: probs[tokenId],
      });
    }

    return predictions;
  }

  // ============================================================
  // Capabilities Builder
  // ============================================================

  /**
   * buildCapabilities(...) — 根据各阶段 enrich 结果构建能力标志
   *
   * 从 DEFAULT_CAPABILITIES 深度 clone（JSON.parse/stringify），
   * 然后根据各阶段数据的有无设置对应标志。
   *
   * 标志规则：
   *   - Tokenizer: tokenList=true 当有 tokenDetails 数据；
   *                vocabExplorer=true 当 vocabSize > 0
   *   - Embedding: vectorViewer=true 当有 vectors；
   *                matrixHeatmap=true 当 matrixInfo 完整；
   *                statsPanel=true 当有 vectorStats
   *   - RoPE:      rotation2DView=true 当 rotationTraces 有数据；
   *                normCheck=true 同 rotation2DView；
   *                frequencyChart=true 当 ropeConfig 可用
   *   - Transformer: attentionHeatmap=true 当任一层有 attention 数据；
   *                  attentionHeadDiversity=true 当任一层有 headEntropies；
   *                  ffnGateDistribution=true 当任一层有 ffn 数据；
   *                  residualFlowChart=true 当有 overview 数据
   *   - LM Head:   logitsHistogram=true 当 logits 非空；
   *                topKRanking=true 当 topPredictions 非空；
   *                probabilityDistribution=true 当 probabilities 非空
   */
  private static buildCapabilities(
    tokenizer: TokenizerVisualData,
    embedding: EmbeddingVisualData,
    rope: RoPEVisualData,
    transformer: TransformerVisualData[],
    lmHead: LMHeadVisualData
  ): VisualizationCapabilities {
    const caps: VisualizationCapabilities = {
      tokenizer: { ...DEFAULT_CAPABILITIES.tokenizer },
      embedding: { ...DEFAULT_CAPABILITIES.embedding },
      rope: { ...DEFAULT_CAPABILITIES.rope },
      transformer: { ...DEFAULT_CAPABILITIES.transformer },
      lmHead: { ...DEFAULT_CAPABILITIES.lmHead },
    };

    // Tokenizer
    caps.tokenizer.tokenList = tokenizer.tokenDetails.length > 0;
    caps.tokenizer.vocabExplorer = tokenizer.vocabSize > 0;

    // Embedding
    caps.embedding.vectorViewer = embedding.vectors.length > 0;
    caps.embedding.matrixHeatmap =
      embedding.matrixInfo.vocabSize > 0 &&
      embedding.matrixInfo.embeddingDim > 0;
    caps.embedding.statsPanel = embedding.vectorStats.length > 0;

    // RoPE
    const hasRotationTraces = rope.rotationTraces.length > 0;
    caps.rope.rotation2DView = hasRotationTraces;
    caps.rope.normCheck = hasRotationTraces;
    caps.rope.frequencyChart = rope.ropeConfig.headDim > 0;

    // Transformer
    const hasAttention = transformer.some((t) => t.attention !== null);
    const hasAttentionEntropy = transformer.some(
      (t) => t.attention !== null && t.attention.headEntropies.length > 0
    );
    const hasFFN = transformer.some((t) => t.ffn !== null);
    const hasOverview = transformer.length > 0;
    caps.transformer.attentionHeatmap = hasAttention;
    caps.transformer.attentionHeadDiversity = hasAttentionEntropy;
    caps.transformer.ffnGateDistribution = hasFFN;
    caps.transformer.residualFlowChart = hasOverview;

    // LM Head
    caps.lmHead.logitsHistogram = lmHead.logits.length > 0;
    caps.lmHead.topKRanking = lmHead.topPredictions.length > 0;
    caps.lmHead.probabilityDistribution = lmHead.probabilities.length > 0;

    return caps;
  }

  // ============================================================
  // Math Helpers
  // ============================================================

  /**
   * l2NormMatrix(matrix) — 计算二维矩阵的标准化 L2 范数
   *
   * 公式：
   *   RMS = sqrt(sum_{i,j}(v[i][j]^2) / count)
   *
   * 其中 count = rows × cols。
   * 用于衡量矩阵中元素的平均幅度。
   *
   * 当矩阵为空时返回 0。
   */
  private static l2NormMatrix(matrix: number[][]): number {
    const rows = matrix.length;
    if (rows === 0) return 0;
    const cols = matrix[0]?.length ?? 0;
    if (cols === 0) return 0;

    let sumSq = 0;
    for (let i = 0; i < rows; i++) {
      const row = matrix[i];
      for (let j = 0; j < cols; j++) {
        const v = row[j];
        sumSq += v * v;
      }
    }
    const count = rows * cols;
    return Math.sqrt(sumSq / count);
  }

  /**
   * computeTokenDeltas(current, previous) — 计算每个 token 的变化量
   *
   * 公式：
   *   delta[pos] = sqrt(sum_d (current[pos][d] - previous[pos][d])^2)
   *
   * 即每个位置的 L2 范数差异。用于量化 Transformer 层
   * 对每个 token 表示的改变程度。
   *
   * 要求 current 和 previous 形状相同。
   */
  private static computeTokenDeltas(
    current: number[][],
    previous: number[][]
  ): number[] {
    const seqLen = current.length;
    const deltas: number[] = new Array(seqLen);

    for (let pos = 0; pos < seqLen; pos++) {
      const curRow = current[pos];
      const prevRow = previous[pos];
      const dim = curRow.length;
      let sumSq = 0;
      for (let d = 0; d < dim; d++) {
        const diff = curRow[d] - prevRow[d];
        sumSq += diff * diff;
      }
      deltas[pos] = Math.sqrt(sumSq);
    }

    return deltas;
  }
}
