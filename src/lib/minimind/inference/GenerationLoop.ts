// ============================================================
// MiniMind — inference/GenerationLoop.ts
// ============================================================
// GenerationLoop — 自回归生成循环控制器
//
// 核心功能：
//   控制 prompt 处理（step 0）和 token-by-token 生成循环。
//   使用模型子模块的公开 API 执行单 token 前向传播（带 KV Cache）。
//   评估停止条件，收集 GenerationTrace。
//
// 数据流：
//   Prompt → model.forward() → K/V extraction → cache
//          → sample → first token
//   Loop:
//     Embed → RoPE → [per-layer: Norm → Attn(cache) → Res → Norm → FFN → Res]
//          → LMHead → sample → stop check → yield
//
// 教育重点：
//   - KV Cache 如何避免重复计算 — 每步只处理新 token
//   - 自回归的本质 — 用自己的输出作为下一步的输入
//   - 停止条件 — EOS token、最大长度、自定义规则
// ============================================================

import type { MiniMindModel } from "../model/MiniMindModel";
import type { ModelTrace } from "../model/types";
import type {
  InferenceConfig,
  GenerationStep,
  GenerationTrace,
  CacheSnapshot,
  StopCondition,
  PositionMetadata,
} from "./types";
import { KVCache } from "./KVCache";
import { Sampler } from "./Sampler";
import { splitIntoHeads, mergeFromHeads } from "./utils";
import {
  matrixMultiply,
  scaledDotProductAttention,
} from "../attention/math";

/**
 * GenerationLoop — 生成循环控制器
 *
 * 核心职责：
 *   管理从 prompt 到完整文本生成的全过程。
 *   不独立创建 KVCache/Sampler — 全部通过依赖注入。
 *
 * 使用方式：
 *
 * ```ts
 * const loop = new GenerationLoop(model, kvCache, sampler);
 * const steps: GenerationStep[] = [];
 * for await (const step of loop.generate("Hello", config)) {
 *   steps.push(step);
 * }
 * const trace = loop.buildTrace("Hello", steps, durationMs);
 * ```
 */
export class GenerationLoop {
  private model: MiniMindModel;
  private kvCache: KVCache;
  private sampler: Sampler;

  /**
   * @param model   — MiniMindModel 实例（依赖注入）
   * @param kvCache — KVCache 实例
   * @param sampler — Sampler 实例
   */
  constructor(model: MiniMindModel, kvCache: KVCache, sampler: Sampler) {
    this.model = model;
    this.kvCache = kvCache;
    this.sampler = sampler;
  }

  /**
   * generate(prompt, config) — 自回归生成
   *
   * 异步生成器，每次迭代 yield 一个 GenerationStep。
   * 消费者可通过 break 提前终止生成。
   *
   * @param prompt — 输入提示文本
   * @param config — 生成配置
   * @yields       每个生成 token 的步骤记录
   */
  async *generate(
    prompt: string,
    config: InferenceConfig
  ): AsyncGenerator<GenerationStep> {
    // 清空缓存（新生成）
    this.kvCache.clear();

    const tokenizer = this.model.getTokenizer();

    // ── Step 0: Prompt Processing ──
    const promptResult = this.model.forward({ inputText: prompt });
    this.lastPromptTrace = promptResult.trace;

    // 提取 K/V 并填充缓存
    this.populateCacheFromPrompt(promptResult.trace);

    // 从 prompt 的 logits 采样第一个 token
    const tokenLabels = this.buildTokenLabels(tokenizer.getVocabulary().idToToken);
    const firstSample = this.sampler.sample(
      promptResult.logits,
      config.sampling,
      tokenLabels
    );

    const firstToken = tokenizer.decode([firstSample.tokenId]);

    const step0: GenerationStep = {
      stepIndex: 0,
      token: firstToken,
      tokenId: firstSample.tokenId,
      probability: firstSample.probability,
      logit: firstSample.logit,
      alternatives: firstSample.alternatives,
      pipelineDescription: firstSample.pipelineDescription,
      cacheState: this.buildCacheSnapshot(),
    };

    yield step0;

    // ── Stop check after first token ──
    const generatedIds = [firstSample.tokenId];
    const stopReason = this.evaluateStopConditions(
      generatedIds,
      1,
      config.stopConditions,
      config.maxTokens
    );
    if (stopReason) {
      this.lastStopReason = stopReason;
      return;
    }

    // ── Loop: Autoregressive Generation ──
    const promptLen = promptResult.trace.seqLen;
    let prevTokenId = firstSample.tokenId;

    for (let step = 1; step < config.maxTokens; step++) {
      // 单 token 前向传播（带 KV Cache）
      const { logits } = this.forwardSingleToken(
        prevTokenId,
        promptLen + step - 1,
        config.debug
      );

      // 采样
      const sample = this.sampler.sample(
        logits,
        config.sampling,
        tokenLabels
      );

      const token = tokenizer.decode([sample.tokenId]);

      const generationStep: GenerationStep = {
        stepIndex: step,
        token,
        tokenId: sample.tokenId,
        probability: sample.probability,
        logit: sample.logit,
        alternatives: sample.alternatives,
        pipelineDescription: sample.pipelineDescription,
        cacheState: this.buildCacheSnapshot(),
      };

      yield generationStep;

      // 停止条件检查
      generatedIds.push(sample.tokenId);
      const reason = this.evaluateStopConditions(
        generatedIds,
        step + 1,
        config.stopConditions,
        config.maxTokens
      );
      if (reason) {
        this.lastStopReason = reason;
        return;
      }

      prevTokenId = sample.tokenId;
    }

    this.lastStopReason = "maxTokens";
  }

  /**
   * buildTrace(prompt, steps, durationMs) — 从生成步骤构建完整的 GenerationTrace
   *
   * 在 generate() 完成后调用。
   *
   * @param prompt     — 原始 prompt 文本
   * @param steps      — 收集到的所有 GenerationStep
   * @param durationMs — 生成耗时（ms）
   * @returns            完整的 GenerationTrace
   */
  buildTrace(
    prompt: string,
    steps: GenerationStep[],
    durationMs: number
  ): GenerationTrace {
    return {
      prompt,
      promptTrace: this.lastPromptTrace!,
      steps,
      finalCache: this.kvCache.getEntries(),
      durationMs,
    };
  }

  /**
   * getStopReason() — 获取最近一次生成的停止原因
   */
  getStopReason(): string | null {
    return this.lastStopReason;
  }

  // ============================================================
  // 内部 — Prompt KV 提取
  // ============================================================

  private lastPromptTrace: ModelTrace | null = null;
  private lastStopReason: string | null = null;

  /**
   * populateCacheFromPrompt(trace) — 从 prompt forward trace 提取 K/V 并填充缓存
   *
   * 对每一层：
   *   1. 取 normedForAttention（RMSNorm 输出）
   *   2. 通过 W_K 和 W_V 投影
   *   3. 分头 → 存入 KVCache
   *   4. 记录 PositionMetadata
   */
  private populateCacheFromPrompt(trace: ModelTrace): void {
    const blocks = this.model.getBlocks();
    const { numHeads, headDim } = this.model.getConfig();

    for (let layerIdx = 0; layerIdx < blocks.length; layerIdx++) {
      const block = blocks[layerIdx];
      const attention = block.getAttention();
      const normedForAttention = trace.blockTraces[layerIdx]?.normedForAttention;

      if (!normedForAttention) {
        throw new Error(
          `Missing normedForAttention in block trace for layer ${layerIdx}`
        );
      }

      const W_K = attention.getWeight("K");
      const W_V = attention.getWeight("V");

      // 投影
      const K_proj = matrixMultiply(normedForAttention, W_K);
      const V_proj = matrixMultiply(normedForAttention, W_V);

      // 分头
      const K_heads = splitIntoHeads(K_proj, numHeads, headDim);
      const V_heads = splitIntoHeads(V_proj, numHeads, headDim);

      // 逐位置追加
      for (let pos = 0; pos < trace.seqLen; pos++) {
        // 为每个位置构建 [numHeads][1][headDim] 格式
        const kSingle: number[][][] = new Array(numHeads);
        const vSingle: number[][][] = new Array(numHeads);

        for (let h = 0; h < numHeads; h++) {
          kSingle[h] = [[...K_heads[h][pos]]];
          vSingle[h] = [[...V_heads[h][pos]]];
        }

        const metadata: PositionMetadata = {
          position: pos,
          token: trace.tokens[pos] ?? `[${trace.tokenIds[pos]}]`,
          tokenId: trace.tokenIds[pos],
          headEntropies: null, // prompt 阶段不计算注意力熵
        };

        this.kvCache.append(layerIdx, kSingle, vSingle, metadata);
      }
    }
  }

  // ============================================================
  // 内部 — 单 Token 前向传播（带 KV Cache）
  // ============================================================

  /**
   * forwardSingleToken(tokenId, position, debug) — 对单个新 token 执行前向传播
   *
   * 关键：使用 KV Cache 中已存储的过去 K/V，
   * 只计算新 token 的 K/V/Q/FFN。
   *
   * 步骤：
   *   1. Embedding — 仅嵌入新 token ID
   *   2. RoPE — 对单个 token 向量应用旋转位置编码
   *   3. 逐层前向（for each block）：
   *      a) Pre-Attention RMSNorm
   *      b) Q/K/V 投影（仅新 token）
   *      c) 与缓存的 K/V 拼接
   *      d) Scaled Dot-Product Attention（Q 对 全部 K/V）
   *      e) 更新 KVCache（追加新 K/V）
   *      f) 合并 + W_O + 残差
   *      g) Pre-FFN RMSNorm → FFN → 残差
   *   4. LM Head — 投影到词表空间
   *
   * @param tokenId  — 上一个生成的 token ID
   * @param position — 当前 token 的绝对位置（prompt 长度 + 已生成数）
   * @param _debug   — 是否收集 debug trace（本实现暂不收集完整 ModelTrace）
   * @returns          { logits: number[] }
   */
  private forwardSingleToken(
    tokenId: number,
    position: number,
    debug: boolean
  ): { logits: number[] } {
    void debug; // Reserved for future per-step ModelTrace collection
    const config = this.model.getConfig();
    const { dModel, numHeads, headDim } = config;
    const embedding = this.model.getEmbedding();
    const blocks = this.model.getBlocks();
    const lmHead = this.model.getLMHead();

    // ── 1. Embedding ──
    const embedded = embedding.getEmbeddings([tokenId]); // [1][dModel]
    let hidden: number[][] = embedded;

    // ── 2. RoPE ──
    hidden = this.applyRoPEToSingleVector(hidden, position);

    // ── 3. Per-Layer Forward ──
    for (let layerIdx = 0; layerIdx < blocks.length; layerIdx++) {
      const block = blocks[layerIdx];
      const attention = block.getAttention();
      const preAttentionNorm = block.getPreAttentionNorm();
      const preFFNNorm = block.getPreFFNNorm();
      const ffn = block.getFFN();

      // a) Pre-Attention RMSNorm
      const normed = preAttentionNorm.forward(hidden); // [1][dModel]

      // b) Q/K/V 投影（仅新 token）
      const W_Q = attention.getWeight("Q");
      const W_K = attention.getWeight("K");
      const W_V = attention.getWeight("V");
      const W_O = attention.getWeight("O");

      const Q_proj = matrixMultiply(normed, W_Q); // [1][dModel]
      const K_new = matrixMultiply(normed, W_K);  // [1][dModel]
      const V_new = matrixMultiply(normed, W_V);  // [1][dModel]

      // 分头
      const Q_heads = splitIntoHeads(Q_proj, numHeads, headDim);    // [H][1][hd]
      const K_new_heads = splitIntoHeads(K_new, numHeads, headDim); // [H][1][hd]
      const V_new_heads = splitIntoHeads(V_new, numHeads, headDim); // [H][1][hd]

      // c) 与缓存拼接 + d) Attention
      const cacheEntry = this.kvCache.get(layerIdx);
      const headOutputs: number[][][] = new Array(numHeads);
      const headEntropies: number[] = new Array(numHeads);

      for (let h = 0; h < numHeads; h++) {
        // 拼接缓存的 K/V 和新 token 的 K/V
        const K_full = cacheEntry
          ? [...cacheEntry.k[h], K_new_heads[h][0]]
          : [K_new_heads[h][0]];
        const V_full = cacheEntry
          ? [...cacheEntry.v[h], V_new_heads[h][0]]
          : [V_new_heads[h][0]];

        // NOTE: pass null for mask, NOT "causal".
        // The single Q token is at the END of the full sequence,
        // so it can attend to ALL cached positions (they are all
        // in the past). Passing "causal" would incorrectly mask
        // cached positions because the causal mask assumes
        // Q positions start at index 0.
        const attnResult = scaledDotProductAttention(
          Q_heads[h],   // [1][hd]
          K_full,       // [cachedLen + 1][hd]
          V_full,       // [cachedLen + 1][hd]
          null
        );

        headOutputs[h] = attnResult.output; // [1][hd]

        // 计算该头注意力熵
        headEntropies[h] = this.computeEntropy(attnResult.weights[0]);
      }

      // e) 更新 KVCache
      const tokenizer = this.model.getTokenizer();
      const metadata: PositionMetadata = {
        position,
        token: tokenizer.decode([tokenId]),
        tokenId,
        headEntropies,
      };
      this.kvCache.append(layerIdx, K_new_heads, V_new_heads, metadata);

      // f) 合并 + W_O + 残差
      const merged = mergeFromHeads(headOutputs);       // [1][dModel]
      const attnOutput = matrixMultiply(merged, W_O);   // [1][dModel]

      for (let d = 0; d < dModel; d++) {
        hidden[0][d] += attnOutput[0][d];
      }

      // g) Pre-FFN RMSNorm → FFN → 残差
      const normedFFN = preFFNNorm.forward(hidden); // [1][dModel]
      const ffnResult = ffn.forward({ hiddenStates: normedFFN });

      for (let d = 0; d < dModel; d++) {
        hidden[0][d] += ffnResult.output[0][d];
      }
    }

    // ── 4. LM Head ──
    const lastHidden = hidden[0]; // [dModel]
    const logits = lmHead.forward(lastHidden) as number[];

    return { logits };
  }

  // ============================================================
  // 内部 — RoPE
  // ============================================================

  /**
   * applyRoPEToSingleVector(hidden, position) — 对单 token 向量应用 RoPE
   *
   * 使用 model.getRoPE().rotate() 对每个 headDim 片段独立旋转。
   * 逻辑与 MiniMindModel.applyRoPEToEmbeddings() 一致，但仅处理一个 token。
   */
  private applyRoPEToSingleVector(
    hidden: number[][],
    position: number
  ): number[][] {
    const { dModel, numHeads, headDim } = this.model.getConfig();
    const rope = this.model.getRoPE();
    const vec = hidden[0];
    const rotated = new Array<number>(dModel);

    for (let h = 0; h < numHeads; h++) {
      const headStart = h * headDim;
      const headVec = new Float64Array(headDim);
      for (let d = 0; d < headDim; d++) {
        headVec[d] = vec[headStart + d];
      }

      const rotationResult = rope.rotate(headVec, position);

      for (let d = 0; d < headDim; d++) {
        rotated[headStart + d] = rotationResult.result[d];
      }
    }

    return [rotated];
  }

  // ============================================================
  // 内部 — 停止条件 & 工具
  // ============================================================

  /**
   * evaluateStopConditions — 评估停止条件列表
   *
   * 按数组顺序评估，返回首个匹配的条件的描述，
   * 如果没有匹配则返回 null。
   */
  private evaluateStopConditions(
    generatedIds: number[],
    tokensGenerated: number,
    conditions: StopCondition[],
    maxTokens: number
  ): string | null {
    for (const condition of conditions) {
      switch (condition.type) {
        case "eosToken":
          if (
            condition.tokenId !== undefined &&
            generatedIds[generatedIds.length - 1] === condition.tokenId
          ) {
            return "eosToken";
          }
          break;
        case "tokenId":
          if (
            condition.tokenId !== undefined &&
            generatedIds[generatedIds.length - 1] === condition.tokenId
          ) {
            return `tokenId=${condition.tokenId}`;
          }
          break;
        case "maxTokens":
          if (tokensGenerated >= maxTokens) {
            return "maxTokens";
          }
          break;
        case "custom":
          if (condition.predicate && condition.predicate(generatedIds)) {
            return "custom";
          }
          break;
      }
    }
    return null;
  }

  /**
   * computeEntropy — 计算注意力权重分布的熵
   *
   * 熵 = -sum p_i * log2(p_i)
   * 高熵 → 注意力分散（关注多个位置）
   * 低熵 → 注意力集中（关注少数位置）
   */
  private computeEntropy(weights: number[]): number {
    let entropy = 0;
    for (const w of weights) {
      if (w > 0) {
        entropy -= w * Math.log2(w + 1e-10);
      }
    }
    return entropy;
  }

  /**
   * buildTokenLabels — 将 ReadonlyMap 转为 Sampler 可接受的 Map
   *
   * tokenizer.getVocabulary().idToToken 返回 ReadonlyMap<number, string>，
   * 但 Sampler.sample() 期望 Map<number, string>。
   * 此处做一次转换。
   */
  private buildTokenLabels(
    idToToken: ReadonlyMap<number, string>
  ): Map<number, string> {
    const map = new Map<number, string>();
    idToToken.forEach((token: string, id: number) => {
      map.set(id, token);
    });
    return map;
  }

  /**
   * buildCacheSnapshot — 构建当前 KV Cache 的元数据快照
   */
  private buildCacheSnapshot(): CacheSnapshot {
    const seqLen = this.kvCache.getCachedSeqLen();
    const numLayers = this.kvCache.getLayerCount();
    const layerEntropyAverages: number[] = [];

    for (let i = 0; i < numLayers; i++) {
      const entry = this.kvCache.get(i);
      if (entry && entry.metadata.length > 0) {
        // 取最后一个位置的元数据（最新位置的注意力状态）
        const lastMeta = entry.metadata[entry.metadata.length - 1];
        if (lastMeta.headEntropies) {
          const avg =
            lastMeta.headEntropies.reduce((a, b) => a + b, 0) /
            lastMeta.headEntropies.length;
          layerEntropyAverages.push(avg);
        } else {
          layerEntropyAverages.push(0);
        }
      } else {
        layerEntropyAverages.push(0);
      }
    }

    return { cachedSeqLen: seqLen, layerEntropyAverages };
  }
}
