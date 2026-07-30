// ============================================================
// MiniMind — inference/types.ts
// ============================================================
// Inference 模块类型定义
//
// 定义 InferenceEngine、KVCache、Sampler、GenerationLoop
// 之间的所有数据契约。所有接口使用显式类型，
// 禁止 any / Record<string, unknown> / 索引签名。
//
// 设计原则：
//   - 每个概念拥有独立的接口
//   - 可空字段显式标记
//   - GenerationStep 支持可选 debugTrace（debug 模式）
//   - KVCacheEntry 包含 inspectable metadata
// ============================================================

import type { ModelTrace } from "../model/types";

// ============================================================
// Configuration
// ============================================================

/**
 * 推理引擎配置
 *
 * 控制生成过程的全部参数：最大 token 数、采样策略、
 * 停止条件和 debug 模式开关。
 */
export interface InferenceConfig {
  /** 最大生成 token 数（不包含 prompt）。默认 20。 */
  maxTokens: number;
  /** 采样参数 — 委托给 Sampler 管道 */
  sampling: SamplingConfig;
  /** 停止条件 — 任一条件触发即停止生成 */
  stopConditions: StopCondition[];
  /** 当为 true 时，每个 GenerationStep 包含完整 ModelTrace。默认 false。 */
  debug: boolean;
  /** 随机种子 — 用于可复现的采样。省略则非确定性。 */
  seed?: number;
}

/**
 * 采样配置
 *
 * 传递给 Sampler 管道的参数。
 * temperature=0 表示贪婪解码（argmax）。
 */
export interface SamplingConfig {
  /** 温度 — 越高越随机。0 = 贪婪（argmax）。默认 1.0。 */
  temperature: number;
  /** Top-K — 仅保留 K 个最高 logits。0 = 禁用。默认 0。 */
  topK: number;
  /** Top-P (nucleus) — 保留累积概率 ≥ P 的最小集合。1.0 = 禁用。默认 1.0。 */
  topP: number;
}

/**
 * 停止条件
 *
 * 声明式条件列表，按数组顺序评估，首个匹配即停止。
 */
export interface StopCondition {
  /** 条件类型 */
  type: "maxTokens" | "eosToken" | "tokenId" | "custom";
  /** Token ID — type 为 "eosToken" 或 "tokenId" 时使用 */
  tokenId?: number;
  /** 自定义断言 — 接收当前所有已生成的 token ID 数组 */
  predicate?: (generatedIds: number[]) => boolean;
}

// ============================================================
// Generation Trace
// ============================================================

/**
 * 单个生成步骤的记录
 *
 * 对应自回归循环中的一次迭代。
 * debugTrace 仅在 InferenceConfig.debug === true 时填充。
 */
export interface GenerationStep {
  /** 步骤索引 — 0 表示第一个生成的 token（prompt 之后） */
  stepIndex: number;
  /** 采样得到的 token 字符串 */
  token: string;
  /** 采样得到的 token ID */
  tokenId: number;
  /** 该 token 被选中的概率（softmax 后） */
  probability: number;
  /** 该 token 的原始 logit 值 */
  logit: number;
  /** 本次采样的 Top-K 备选 token */
  alternatives: TokenAlternative[];
  /** Sampler 管道描述 — 例如 "Scaled by T=0.8 → Kept top 40 → Sampled token 42 (P=0.31)" */
  pipelineDescription: string;
  /** 完整 ModelTrace — 仅 debug 模式。包含本步的全部中间张量。 */
  debugTrace?: ModelTrace;
  /** KV Cache 元数据快照 — 用于检查缓存状态 */
  cacheState?: CacheSnapshot;
}

/**
 * 单个备选 Token 的预测信息
 *
 * 按概率降序排列，展示模型在该步骤的"其他想法"。
 */
export interface TokenAlternative {
  /** 排名 — 从 1 开始 */
  rank: number;
  /** Token ID */
  tokenId: number;
  /** Token 字符串 */
  token: string;
  /** 原始 logit 值 */
  logit: number;
  /** Softmax 概率 */
  probability: number;
}

/**
 * KV Cache 元数据快照
 *
 * 记录某一个生成步骤时 KV Cache 的整体状态。
 */
export interface CacheSnapshot {
  /** 当前缓存的序列长度（prompt + 已生成 token 数） */
  cachedSeqLen: number;
  /** 每层的平均注意力熵 — layerEntropyAverages[i] = 第 i 层的平均头熵 */
  layerEntropyAverages: number[];
}

/**
 * 完整的生成 Trace
 *
 * 包含 prompt 处理 trace、所有生成步骤记录、
 * 最终 KV Cache 状态和总耗时。
 */
export interface GenerationTrace {
  /** 原始 prompt 文本 */
  prompt: string;
  /** Prompt 处理步骤（step 0）的完整 ModelTrace */
  promptTrace: ModelTrace;
  /** 每个生成 token 的步骤记录（steps 1..N） */
  steps: GenerationStep[];
  /** 最终 KV Cache 状态 — 供检查和可视化 */
  finalCache: KVCacheEntry[];
  /** 总生成耗时（ms） */
  durationMs: number;
}

/**
 * 生成结果
 *
 * generate() 返回的最终结果，包含完整文本和 trace。
 */
export interface GenerationResult {
  /** 完整生成文本：prompt + 所有生成 token 的拼接 */
  text: string;
  /** 实际生成的 token 数量 */
  tokensGenerated: number;
  /** 触发停止的条件 — 如果正常耗尽 maxTokens 则为 null */
  stopReason: string | null;
  /** 完整 generation trace */
  trace: GenerationTrace;
}

// ============================================================
// KV Cache
// ============================================================

/**
 * 单层 Transformer Block 的 KV Cache Entry
 *
 * 存储该层所有已处理位置的 K 和 V 张量（分头格式），
 * 以及每个位置的 inspectable metadata。
 */
export interface KVCacheEntry {
  /** 层索引 — 从 0 开始 */
  layerIndex: number;
  /** 缓存的 Key 张量 — [numHeads][cachedSeqLen][headDim] */
  k: number[][][];
  /** 缓存的 Value 张量 — [numHeads][cachedSeqLen][headDim] */
  v: number[][][];
  /** 每个位置的元数据 — 与 cachedSeqLen 等长 */
  metadata: PositionMetadata[];
}

/**
 * 单个缓存位置的元数据
 *
 * 使 KV Cache 可检查、可解释 — 知道每个位置
 * 对应哪个 token、注意力集中度如何。
 */
export interface PositionMetadata {
  /** 绝对位置 — 在完整序列中的索引 */
  position: number;
  /** 该位置的 token 字符串 */
  token: string;
  /** 该位置的 token ID */
  tokenId: number;
  /** 每个注意力头的熵值 — 衡量注意力集中度。首次缓存时为 null（尚未计算注意力）。 */
  headEntropies: number[] | null;
}

// ============================================================
// Sampler Strategy Interface
// ============================================================

/**
 * 采样策略接口
 *
 * 所有采样策略（Greedy、Temperature、TopK、TopP）实现此接口。
 * 每个策略是纯逻辑 — logits in, LogitsTransformResult out。
 * 无内部状态，无副作用。
 */
export interface SamplingStrategy {
  /** 唯一策略标识符 */
  readonly id: string;
  /** 人类可读名称 — 用于 UI 展示 */
  readonly name: string;
  /**
   * 对 logits 向量应用此策略的变换
   *
   * @param logits — 原始 logits 向量 [vocabSize]
   * @param config — 采样配置（策略仅读取自己需要的字段）
   * @returns 变换结果 — 包含变换后的 logits、被屏蔽的索引和说明
   */
  apply(logits: number[], config: SamplingConfig): LogitsTransformResult;
}

/**
 * 单次策略变换的结果
 *
 * 记录策略对 logits 做了什么，以及为什么。
 * description 字段是对该步骤的"教育性解释"。
 */
export interface LogitsTransformResult {
  /** 变换后的 logits — 可能被缩放、屏蔽，但长度不变 */
  logits: number[];
  /** 被此策略屏蔽的 token 索引 — 空数组表示无屏蔽 */
  maskedIndices: number[];
  /** 人类可读的描述 — "Scaled by T=0.8" / "Kept top 40, masked 960" */
  description: string;
}
