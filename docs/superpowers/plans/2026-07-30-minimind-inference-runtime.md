# MiniMind Inference Runtime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-library autoregressive text generation runtime (InferenceEngine + KVCache + Sampler + GenerationLoop) that wraps MiniMindModel via DI without modifying any existing modules.

**Architecture:** Orchestrator + specialized modules pattern. InferenceEngine is the composition root; it delegates prompt processing to model.forward() and per-token generation to GenerationLoop, which uses model sub-module accessors for a token-level forward pass with KV cache. Sampler is a strategy pipeline (temperature → topK → topP → select). Each strategy implements a common interface.

**Tech Stack:** TypeScript strict mode, zero runtime dependencies, imports only from existing MiniMind math utilities.

## Global Constraints

- Zero modifications to existing model/transformer/attention/ffn/rope/embedding/tokenizer modules
- All types explicit — no `any`, no `Record<string, unknown>`, no index signatures
- Dependency injection: InferenceEngine receives MiniMindModel via constructor
- Independent from React — no hooks, JSX, or browser APIs
- Educational transparency: every pipeline step produces a human-readable description string
- KV cache is inspectable via public metadata accessor
- JSDoc on all public classes and methods, matching existing codebase style
- `npm run build` — zero errors, zero warnings
- `npx tsc --noEmit` — zero errors

---

### Task 1: Create `types.ts` — all inference type definitions

**Files:**
- Create: `src/lib/minimind/inference/types.ts`

**Interfaces:**
- Consumes: `ModelTrace` from `../model/types`
- Produces: `InferenceConfig`, `SamplingConfig`, `StopCondition`, `GenerationStep`, `TokenAlternative`, `CacheSnapshot`, `GenerationTrace`, `GenerationResult`, `KVCacheEntry`, `PositionMetadata`, `SamplingStrategy`, `LogitsTransformResult`

- [ ] **Step 1: Create the directory and types file**

```bash
mkdir -p src/lib/minimind/inference/strategies
```

- [ ] **Step 2: Write `src/lib/minimind/inference/types.ts`**

```typescript
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/types.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/minimind/inference/types.ts
git commit -m "feat(minimind): add inference types (Phase 21a)"
```

---

### Task 2: Create `utils.ts` — head split/merge helpers

**Files:**
- Create: `src/lib/minimind/inference/utils.ts`

**Interfaces:**
- Consumes: Nothing (pure array reshape)
- Produces: `splitIntoHeads(matrix, numHeads, headDim) → number[][][]`, `mergeFromHeads(heads) → number[][]`

- [ ] **Step 1: Write `src/lib/minimind/inference/utils.ts`**

```typescript
// ============================================================
// MiniMind — inference/utils.ts
// ============================================================
// Inference 内部工具函数
//
// 提供分头/合并的数组 reshape 操作。
// 这些函数在 MiniAttention 中是私有的 — 此处重建等效实现，
// 仅 10 行纯数组操作，不引入任何外部依赖。
// ============================================================

/**
 * splitIntoHeads — 将 dModel 维向量拆分为多个 head
 *
 * 形状变换：[seqLen, dModel] → [numHeads, seqLen, headDim]
 *
 * 每个 token 的 dModel 维向量被等分为 numHeads 段，
 * 每段长度为 headDim = dModel / numHeads。
 *
 * 这是 MiniAttention.splitHeads() 的等效实现。
 * 重建原因：MiniAttention 中为 private 方法，无法外部访问。
 *
 * @param x        — 输入矩阵 [seqLen][dModel]
 * @param numHeads — 注意力头数量
 * @param headDim  — 每个头的维度
 * @returns          分头后的三维数组 [numHeads][seqLen][headDim]
 */
export function splitIntoHeads(
  x: number[][],
  numHeads: number,
  headDim: number
): number[][][] {
  const seqLen = x.length;

  const heads: number[][][] = new Array(numHeads);
  for (let h = 0; h < numHeads; h++) {
    heads[h] = new Array(seqLen);
    const offset = h * headDim;
    for (let pos = 0; pos < seqLen; pos++) {
      heads[h][pos] = new Array(headDim);
      for (let d = 0; d < headDim; d++) {
        heads[h][pos][d] = x[pos][offset + d];
      }
    }
  }

  return heads;
}

/**
 * mergeFromHeads — 将多个 head 的输出合并为 dModel 维向量
 *
 * 形状变换：[numHeads, seqLen, headDim] → [seqLen, dModel]
 *
 * splitIntoHeads 的逆操作。head 0 占据 dims [0..headDim-1]，
 * head 1 占据 dims [headDim..2*headDim-1]，依此类推。
 *
 * 这是 MiniAttention.mergeHeads() 的等效实现。
 * 重建原因：MiniAttention 中为 private 方法，无法外部访问。
 *
 * @param heads — 分头格式 [numHeads][seqLen][headDim]
 * @returns       合并后的矩阵 [seqLen][dModel]
 */
export function mergeFromHeads(heads: number[][][]): number[][] {
  const numHeads = heads.length;
  const seqLen = heads[0]?.length ?? 0;
  const headDim = heads[0]?.[0]?.length ?? 0;
  const dModel = numHeads * headDim;

  const merged: number[][] = new Array(seqLen);
  for (let pos = 0; pos < seqLen; pos++) {
    merged[pos] = new Array(dModel);
    for (let h = 0; h < numHeads; h++) {
      const offset = h * headDim;
      for (let d = 0; d < headDim; d++) {
        merged[pos][offset + d] = heads[h][pos][d];
      }
    }
  }

  return merged;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/utils.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/inference/utils.ts
git commit -m "feat(minimind): add inference utils — splitIntoHeads, mergeFromHeads (Phase 21a)"
```

---

### Task 3: Create `KVCache.ts` — per-layer K/V storage with metadata

**Files:**
- Create: `src/lib/minimind/inference/KVCache.ts`

**Interfaces:**
- Consumes: `KVCacheEntry`, `PositionMetadata` from `./types`
- Produces: `class KVCache { constructor(...), get(layerIdx), append(layerIdx, k, v, metadata), getLayerCount(), getCachedSeqLen(), clear(), getEntries() }`

- [ ] **Step 1: Write `src/lib/minimind/inference/KVCache.ts`**

```typescript
// ============================================================
// MiniMind — inference/KVCache.ts
// ============================================================
// KVCache — 教育型 KV Cache 管理器
//
// 核心功能：
//   - 按层存储 K 和 V 张量（分头格式）
//   - 增量追加 — 每个生成步骤添加新 token 的 K/V
//   - 完整的 PositionMetadata — 每个缓存位置可检查
//   - 支持清空和重置
//
// 数据结构：
//   每层存储：
//     k: [numHeads][cachedSeqLen][headDim]
//     v: [numHeads][cachedSeqLen][headDim]
//     metadata: [cachedSeqLen] — 每个位置的 token、熵信息
//
// 教育重点：
//   - KV Cache 为什么重要 — 避免重新计算过去的 K/V
//   - 增量增长 — 每次只追加新 token，不修改已有缓存
//   - 可检查 — 每个位置存储了完整的上下文信息
// ============================================================

import type { KVCacheEntry, PositionMetadata } from "./types";

/**
 * KVCache — 教育用 KV Cache 管理器
 *
 * 核心职责：
 *   存储所有层的 K 和 V 张量（分头格式），支持增量追加和清空。
 *   每个缓存位置附有 inspectable 的 PositionMetadata。
 *
 * 使用方式：
 *
 * ```ts
 * const cache = new KVCache({ numLayers: 4, numHeads: 8, headDim: 64 });
 *
 * // Prompt 处理后填充所有层的 K/V（每层 seqLen 个位置）
 * for (let layer = 0; layer < 4; layer++) {
 *   cache.append(layer, kHeads, vHeads, metadata);
 * }
 *
 * // 生成阶段追加新 token
 * cache.append(layerIdx, kNew, vNew, metadata);
 *
 * // 检查缓存状态
 * const seqLen = cache.getCachedSeqLen(); // → 当前缓存长度
 * const entry = cache.get(0);             // → 第 0 层的完整缓存
 * ```
 */
export class KVCache {
  private entries: Map<number, KVCacheEntry>;
  private numLayers: number;
  private numHeads: number;
  private headDim: number;
  private _cachedSeqLen = 0;

  /**
   * @param config — { numLayers, numHeads, headDim }
   *
   * 构造时立即初始化空的 per-layer 缓存结构。
   * 所有层初始 K/V 为空数组，metadata 为空数组。
   */
  constructor(config: {
    numLayers: number;
    numHeads: number;
    headDim: number;
  }) {
    if (config.numLayers <= 0) {
      throw new Error(`numLayers must be positive, got ${config.numLayers}`);
    }
    if (config.numHeads <= 0) {
      throw new Error(`numHeads must be positive, got ${config.numHeads}`);
    }
    if (config.headDim <= 0) {
      throw new Error(`headDim must be positive, got ${config.headDim}`);
    }

    this.numLayers = config.numLayers;
    this.numHeads = config.numHeads;
    this.headDim = config.headDim;
    this.entries = new Map();

    for (let i = 0; i < this.numLayers; i++) {
      this.entries.set(i, {
        layerIndex: i,
        k: [],
        v: [],
        metadata: [],
      });
    }
  }

  /**
   * get(layerIndex) — 获取指定层的缓存条目
   *
   * 返回该层的完整 KVCacheEntry，包括 K/V 张量和 metadata。
   * 如果 layerIndex 超出范围，返回 null。
   *
   * @param layerIndex — 0-based 层索引
   * @returns           该层的缓存条目，或 null
   */
  get(layerIndex: number): KVCacheEntry | null {
    return this.entries.get(layerIndex) ?? null;
  }

  /**
   * append(layerIndex, k, v, metadata) — 向指定层追加新位置的 K/V
   *
   * 将新 token 的 K 和 V 张量追加到该层的缓存末尾。
   * k 和 v 的形状为 [numHeads][1][headDim] — 单个 token 的分头格式。
   * metadata 为单个 PositionMetadata 对象。
   *
   * 验证：
   *   - layerIndex 必须在 [0, numLayers) 范围内
   *   - k 和 v 的 numHeads 必须匹配构造参数
   *   - k 和 v 的第一个维度长度必须为 1（单 token）
   *
   * @param layerIndex — 0-based 层索引
   * @param k          — 新 token 的 Key 张量 [numHeads][1][headDim]
   * @param v          — 新 token 的 Value 张量 [numHeads][1][headDim]
   * @param metadata   — 新 token 的位置元数据
   */
  append(
    layerIndex: number,
    k: number[][][],
    v: number[][][],
    metadata: PositionMetadata
  ): void {
    const entry = this.entries.get(layerIndex);
    if (!entry) {
      throw new Error(
        `Layer index ${layerIndex} out of range [0, ${this.numLayers})`
      );
    }
    if (k.length !== this.numHeads) {
      throw new Error(
        `K numHeads mismatch: expected ${this.numHeads}, got ${k.length}`
      );
    }
    if (v.length !== this.numHeads) {
      throw new Error(
        `V numHeads mismatch: expected ${this.numHeads}, got ${v.length}`
      );
    }

    // k[h] 是 [1][headDim] — 提取并存储为 [headDim]
    for (let h = 0; h < this.numHeads; h++) {
      if (!entry.k[h]) {
        entry.k[h] = [];
      }
      if (!entry.v[h]) {
        entry.v[h] = [];
      }
      entry.k[h].push([...k[h][0]]);
      entry.v[h].push([...v[h][0]]);
    }

    entry.metadata.push({ ...metadata });
    this._cachedSeqLen = entry.metadata.length;
  }

  /**
   * getLayerCount() — 返回缓存的层数
   */
  getLayerCount(): number {
    return this.numLayers;
  }

  /**
   * getCachedSeqLen() — 返回当前缓存的序列长度
   *
   * 所有层的缓存长度应该相同（每次 append 对所有层执行）。
   */
  getCachedSeqLen(): number {
    return this._cachedSeqLen;
  }

  /**
   * clear() — 清空所有层的缓存
   *
   * 重置为构造时的空状态。保留层结构，仅清空 K/V/metadata。
   */
  clear(): void {
    for (const entry of this.entries.values()) {
      entry.k = [];
      entry.v = [];
      entry.metadata = [];
    }
    this._cachedSeqLen = 0;
  }

  /**
   * getEntries() — 获取所有层的缓存条目
   *
   * 返回按 layerIndex 升序排列的 KVCacheEntry 数组。
   * 用于序列化和可视化。
   */
  getEntries(): KVCacheEntry[] {
    const result: KVCacheEntry[] = [];
    for (let i = 0; i < this.numLayers; i++) {
      const entry = this.entries.get(i);
      if (entry) {
        result.push({
          layerIndex: entry.layerIndex,
          k: entry.k.map((head) => head.map((row) => [...row])),
          v: entry.v.map((head) => head.map((row) => [...row])),
          metadata: entry.metadata.map((m) => ({ ...m })),
        });
      }
    }
    return result;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/KVCache.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/inference/KVCache.ts
git commit -m "feat(minimind): add KVCache — per-layer K/V storage with metadata (Phase 21c)"
```

---

### Task 4: Create Sampler strategies + Sampler orchestrator

**Files:**
- Create: `src/lib/minimind/inference/strategies/GreedySampler.ts`
- Create: `src/lib/minimind/inference/strategies/TemperatureSampler.ts`
- Create: `src/lib/minimind/inference/strategies/TopKSampler.ts`
- Create: `src/lib/minimind/inference/strategies/TopPSampler.ts`
- Create: `src/lib/minimind/inference/Sampler.ts`

**Interfaces:**
- Consumes: `SamplingStrategy`, `SamplingConfig`, `LogitsTransformResult`, `GenerationStep`, `TokenAlternative` from `../types`
- Produces: `GreedySampler`, `TemperatureSampler`, `TopKSampler`, `TopPSampler` (all implement `SamplingStrategy`), `Sampler` (orchestrator with `sample(logits, config)` method)

- [ ] **Step 1: Write `src/lib/minimind/inference/strategies/GreedySampler.ts`**

```typescript
// ============================================================
// MiniMind — inference/strategies/GreedySampler.ts
// ============================================================
// GreedySampler — 贪婪采样策略
//
// 核心功能：
//   终端策略 — 诊断是否使用了概率采样。
//   当所有前置策略均为默认值时：返回 "Argmax (greedy selection)" 描述。
//   当任一前置策略活跃时：返回 "Sample from probability distribution" 描述。
//
// 注意：实际 token 选择（argmax 或采样）在 Sampler 编排器中执行，
// 而非在此策略中。此策略只提供教育性描述。
//
// 教育重点：
//   - 贪婪解码是最简单的策略 — 总是选概率最高的 token
//   - 有温度/topK/topP 时变为概率采样 — 引入多样性
// ============================================================

import type { SamplingStrategy, SamplingConfig, LogitsTransformResult } from "../types";

export class GreedySampler implements SamplingStrategy {
  readonly id = "greedy";
  readonly name = "Greedy Selection";

  /**
   * apply — 不修改 logits，仅判断采样模式
   *
   * 当所有前置策略均为默认值（temperature=1.0, topK=0, topP=1.0）时：
   *   实际执行 argmax → "Argmax (greedy selection)"
   * 否则（有温度缩放、topK 过滤或 topP 过滤）：
   *   实际从概率分布中采样 → "Sample from probability distribution"
   */
  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const isProbabilistic =
      config.temperature !== 1.0 &&
      config.temperature !== 0 ||
      config.topK > 0 ||
      config.topP < 1.0;

    // 如果 temperature=0 且无其他过滤，视为纯 argmax
    const isGreedy = config.temperature === 0 &&
      config.topK === 0 &&
      config.topP === 1.0;

    if (isGreedy) {
      return {
        logits,
        maskedIndices: [],
        description: "Argmax (greedy selection)",
      };
    }

    return {
      logits,
      maskedIndices: [],
      description: isProbabilistic
        ? "Sample from probability distribution"
        : "Argmax (greedy selection)",
    };
  }
}
```

- [ ] **Step 2: Verify compiles, commit this single file**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/strategies/GreedySampler.ts && git add src/lib/minimind/inference/strategies/GreedySampler.ts && git commit -m "feat(minimind): add GreedySampler strategy (Phase 21b)"
```

- [ ] **Step 3: Write `src/lib/minimind/inference/strategies/TemperatureSampler.ts`**

```typescript
// ============================================================
// MiniMind — inference/strategies/TemperatureSampler.ts
// ============================================================
// TemperatureSampler — 温度缩放策略
//
// 核心功能：
//   将 logits 除以 temperature，控制概率分布的"锐度"。
//
// 公式：
//   logits_scaled[i] = logits[i] / T
//   softmax(logits_scaled) 在 T<1 时更尖锐，T>1 时更平坦
//
// 特殊情况：
//   T = 0  → 纯贪婪（由 Sampler 编排器处理，此策略直接返回原 logits）
//   T = 1.0 → 无操作（除以 1 不变）
//   T < 1.0 → 更尖锐（高概率 token 更可能被选中，低多样性）
//   T > 1.0 → 更平坦（概率分布更均匀，高多样性）
//
// 教育重点：
//   - 温度是控制"创造力"的核心参数
//   - 不改变 token 的相对排名 — 只改变概率差距
//   - T→0 趋近于 argmax，T→∞ 趋近于均匀分布
// ============================================================

import type { SamplingStrategy, SamplingConfig, LogitsTransformResult } from "../types";

export class TemperatureSampler implements SamplingStrategy {
  readonly id = "temperature";
  readonly name = "Temperature Scaling";

  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const T = config.temperature;

    // T=0 → 贪婪模式 — 由编排器处理，此处不做变换
    if (T === 0) {
      return {
        logits,
        maskedIndices: [],
        description: "T=0 → greedy (argmax)",
      };
    }

    // T=1.0 → 无操作
    if (T === 1.0) {
      return {
        logits,
        maskedIndices: [],
        description: "T=1.0 (no scaling)",
      };
    }

    // T > 0: 缩放 logits
    const scaled = new Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      scaled[i] = logits[i] / T;
    }

    return {
      logits: scaled,
      maskedIndices: [],
      description: `Scaled by T=${T}`,
    };
  }
}
```

- [ ] **Step 4: Verify, commit**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/strategies/TemperatureSampler.ts && git add src/lib/minimind/inference/strategies/TemperatureSampler.ts && git commit -m "feat(minimind): add TemperatureSampler strategy (Phase 21b)"
```

- [ ] **Step 5: Write `src/lib/minimind/inference/strategies/TopKSampler.ts`**

```typescript
// ============================================================
// MiniMind — inference/strategies/TopKSampler.ts
// ============================================================
// TopKSampler — Top-K 过滤策略
//
// 核心功能：
//   仅保留 logits 最高的 K 个 token，其余设为 -Infinity。
//
// 算法：
//   1. 找出第 K 大的 logit 值（阈值）
//   2. 将低于阈值的所有 logit 设为 -1e9（等价于 softmax 概率 ≈ 0）
//   3. 记录被屏蔽的 token 索引
//
// 特殊情况：
//   K = 0  → 禁用，不修改 logits
//   K >= vocabSize → 无操作（保留全部）
//
// 教育重点：
//   - Top-K 是最简单的截断策略 — "只要最好的 K 个"
//   - 小 K → 高确定性、低多样性（只考虑最可能的少数选项）
//   - 大 K → 低确定性、高多样性
//   - 固定 K 的问题：对不同分布不公平（平坦分布 vs 尖锐分布）
// ============================================================

import type { SamplingStrategy, SamplingConfig, LogitsTransformResult } from "../types";

export class TopKSampler implements SamplingStrategy {
  readonly id = "topk";
  readonly name = "Top-K Filtering";

  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const K = config.topK;

    // 禁用
    if (K <= 0) {
      return {
        logits,
        maskedIndices: [],
        description: "Top-K disabled",
      };
    }

    // K >= 词表大小 → 无操作
    if (K >= logits.length) {
      return {
        logits,
        maskedIndices: [],
        description: `Top-K=${K} (vocab size, no masking)`,
      };
    }

    // 找到第 K 大的值（使用部分排序：复制并排序前 K 个最大的）
    const indexed = logits.map((value, index) => ({ value, index }));
    indexed.sort((a, b) => b.value - a.value);
    const threshold = indexed[K - 1]?.value ?? -Infinity;

    // 屏蔽低于阈值的 token
    const MASK_VALUE = -1e9;
    const masked = new Array(logits.length);
    const maskedIndices: number[] = [];
    let maskedCount = 0;

    for (let i = 0; i < logits.length; i++) {
      if (logits[i] < threshold) {
        masked[i] = MASK_VALUE;
        maskedIndices.push(i);
        maskedCount++;
      } else {
        masked[i] = logits[i];
      }
    }

    return {
      logits: masked,
      maskedIndices,
      description: `Kept top ${K}, masked ${maskedCount}`,
    };
  }
}
```

- [ ] **Step 6: Verify, commit**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/strategies/TopKSampler.ts && git add src/lib/minimind/inference/strategies/TopKSampler.ts && git commit -m "feat(minimind): add TopKSampler strategy (Phase 21b)"
```

- [ ] **Step 7: Write `src/lib/minimind/inference/strategies/TopPSampler.ts`**

```typescript
// ============================================================
// MiniMind — inference/strategies/TopPSampler.ts
// ============================================================
// TopPSampler — Top-P (Nucleus) 过滤策略
//
// 核心功能：
//   保留累积概率 ≥ P 的最小 token 集合，其余屏蔽。
//
// 算法：
//   1. 对 logits 应用 softmax → 概率分布
//   2. 按概率降序排序
//   3. 累加概率，找到 cumsum ≥ P 的截断点
//   4. 未进入累计集合的 token 设为 -1e9
//
// 与 Top-K 的区别：
//   Top-K 固定数量，Top-P 固定概率质量。
//   Top-P 能自适应分布形状 — 尖锐分布保留更少 token，
//   平坦分布保留更多 token。
//
// 特殊情况：
//   P >= 1.0  → 禁用，不修改 logits
//   P <= 0    → 仅保留概率最高的 token（等价于 argmax，但走 softmax）
//
// 教育重点：
//   - Nucleus Sampling 是 Top-K 的改进 — 自适应截断
//   - "Nucleus"（核心）指概率质量集中的少数 token
//   - P=0.95 表示"保留构成 95% 置信度的最小 token 集合"
// ============================================================

import type { SamplingStrategy, SamplingConfig, LogitsTransformResult } from "../types";
import { softmax } from "../../attention/math";

export class TopPSampler implements SamplingStrategy {
  readonly id = "topp";
  readonly name = "Top-P (Nucleus) Filtering";

  apply(logits: number[], config: SamplingConfig): LogitsTransformResult {
    const P = config.topP;

    // 禁用
    if (P >= 1.0) {
      return {
        logits,
        maskedIndices: [],
        description: "Top-P disabled",
      };
    }

    // 计算概率分布
    const probs = softmax(logits);

    // 按概率降序排序
    const indexed = probs.map((prob, index) => ({ prob, index }));
    indexed.sort((a, b) => b.prob - a.prob);

    // 累加概率，找到截断点
    let cumsum = 0;
    const kept = new Set<number>();
    for (const item of indexed) {
      kept.add(item.index);
      cumsum += item.prob;
      if (cumsum >= P) break;
    }

    // 屏蔽未保留的 token
    const MASK_VALUE = -1e9;
    const masked = new Array(logits.length);
    const maskedIndices: number[] = [];
    let maskedCount = 0;

    for (let i = 0; i < logits.length; i++) {
      if (!kept.has(i)) {
        masked[i] = MASK_VALUE;
        maskedIndices.push(i);
        maskedCount++;
      } else {
        masked[i] = logits[i];
      }
    }

    return {
      logits: masked,
      maskedIndices,
      description: `Nucleus P=${P} kept ${kept.size}, masked ${maskedCount}`,
    };
  }
}
```

- [ ] **Step 8: Verify, commit**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/strategies/TopPSampler.ts && git add src/lib/minimind/inference/strategies/TopPSampler.ts && git commit -m "feat(minimind): add TopPSampler strategy (Phase 21b)"
```

- [ ] **Step 9: Write `src/lib/minimind/inference/Sampler.ts`**

```typescript
// ============================================================
// MiniMind — inference/Sampler.ts
// ============================================================
// Sampler — 采样策略管道编排器
//
// 核心功能：
//   按固定顺序执行采样策略管道，将 logits 转换为具体的 token 选择。
//
// 管道顺序：
//   TemperatureSampler → TopKSampler → TopPSampler → GreedySampler
//
// 最后一步（argmax 或概率采样）在编排器中执行。
//
// 教育重点：
//   - 采样策略可组合 — 管道顺序影响结果
//   - 透明性 — 每一步的变换都有 description 记录
//   - 依赖注入 — 策略由外部提供，编排器只负责执行
// ============================================================

import type {
  SamplingStrategy,
  SamplingConfig,
  GenerationStep,
  TokenAlternative,
} from "./types";
import { softmax } from "../attention/math";

/**
 * Sampler — 采样策略管道编排器
 *
 * 核心职责：
 *   按顺序执行注入的采样策略，最后从变换后的 logits 中选择一个 token。
 *   记录管道描述和备选 token 信息。
 *
 * 使用方式：
 *
 * ```ts
 * const sampler = new Sampler([
 *   new TemperatureSampler(),
 *   new TopKSampler(),
 *   new TopPSampler(),
 *   new GreedySampler(),
 * ]);
 *
 * const result = sampler.sample(logits, { temperature: 0.8, topK: 40, topP: 0.95 });
 * // result → { tokenId, token, probability, logit, alternatives, pipelineDescription }
 * ```
 */
export class Sampler {
  private strategies: SamplingStrategy[];

  /**
   * @param strategies — 按执行顺序排列的策略列表
   */
  constructor(strategies: SamplingStrategy[]) {
    this.strategies = strategies;
  }

  /**
   * sample(logits, config, tokenLabels?) — 从 logits 中采样一个 token
   *
   * 步骤：
   *   1. 按顺序执行每个策略的 apply() 方法
   *   2. 收集每个策略的 description
   *   3. 从最终 logits 中选择 token：
   *      - temperature=0 且无过滤 → argmax
   *      - 否则 → 从 softmax 概率分布中采样
   *   4. 构建备选 token 列表（top-K alternatives）
   *
   * @param logits      — 原始 logits 向量 [vocabSize]
   * @param config      — 采样配置
   * @param tokenLabels — token ID → token 字符串的映射（用于构建 alternatives）
   * @returns             选择结果
   */
  sample(
    logits: number[],
    config: SamplingConfig,
    tokenLabels?: Map<number, string>
  ): {
    tokenId: number;
    probability: number;
    logit: number;
    alternatives: TokenAlternative[];
    pipelineDescription: string;
  } {
    // ── 执行策略管道 ──
    const descriptions: string[] = [];
    let current = logits;

    for (const strategy of this.strategies) {
      const result = strategy.apply(current, config);
      current = result.logits;
      if (result.description) {
        descriptions.push(result.description);
      }
    }

    const pipelineDescription = descriptions.join(" → ");

    // ── 计算概率分布 ──
    const probs = softmax(current);

    // ── 选择 token ──
    let tokenId: number;
    const isGreedy =
      config.temperature === 0 &&
      config.topK === 0 &&
      config.topP === 1.0;

    if (isGreedy) {
      // 纯 argmax
      tokenId = this.argmax(current);
    } else {
      // 从概率分布中采样
      tokenId = this.sampleFromDistribution(probs);
    }

    // ── 构建备选列表（top-K alternatives） ──
    const indexed = probs.map((prob, idx) => ({ prob, idx }));
    indexed.sort((a, b) => b.prob - a.prob);
    const topN = Math.min(10, indexed.length);
    const alternatives: TokenAlternative[] = [];

    for (let rank = 0; rank < topN; rank++) {
      const { idx, prob } = indexed[rank];
      alternatives.push({
        rank: rank + 1,
        tokenId: idx,
        token: tokenLabels?.get(idx) ?? `[${idx}]`,
        logit: current[idx],
        probability: prob,
      });
    }

    return {
      tokenId,
      probability: probs[tokenId],
      logit: current[tokenId],
      alternatives,
      pipelineDescription,
    };
  }

  /**
   * getStrategies() — 获取注入的策略列表
   */
  getStrategies(): SamplingStrategy[] {
    return [...this.strategies];
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * argmax — 找到数组中最大值的索引
   */
  private argmax(arr: number[]): number {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > maxVal) {
        maxVal = arr[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  /**
   * sampleFromDistribution — 从概率分布中加权随机采样
   *
   * @param probs — 概率分布（和应为 1）
   * @returns       采样到的索引
   */
  private sampleFromDistribution(probs: number[]): number {
    const r = Math.random();
    let cumsum = 0;
    for (let i = 0; i < probs.length; i++) {
      cumsum += probs[i];
      if (r < cumsum) return i;
    }
    return probs.length - 1;
  }
}
```

- [ ] **Step 10: Verify, commit**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/Sampler.ts && git add src/lib/minimind/inference/Sampler.ts && git commit -m "feat(minimind): add Sampler orchestrator (Phase 21b)"
```

---

### Task 5: Create `GenerationLoop.ts` — step controller

**Files:**
- Create: `src/lib/minimind/inference/GenerationLoop.ts`

**Interfaces:**
- Consumes: `MiniMindModel` (via DI), `KVCache` from `./KVCache`, `Sampler` from `./Sampler`, `InferenceConfig`, `GenerationStep`, `GenerationTrace`, `CacheSnapshot` from `./types`, `splitIntoHeads`, `mergeFromHeads` from `./utils`, `matrixMultiply`, `scaledDotProductAttention`, `softmax` from `../attention/math`
- Produces: `class GenerationLoop { constructor(model, kvCache, sampler), async *generate(prompt, config) → AsyncGenerator<GenerationStep>, buildTrace() → GenerationTrace }`

- [ ] **Step 1: Write `src/lib/minimind/inference/GenerationLoop.ts`**

```typescript
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
  softmax,
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
 * const trace = loop.buildTrace("Hello", steps);
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
    const startTime = performance.now();

    // ── Step 0: Prompt Processing ──
    const promptResult = this.model.forward({ inputText: prompt });
    this.lastPromptTrace = promptResult.trace;

    // 提取 K/V 并填充缓存
    this.populateCacheFromPrompt(promptResult.trace);

    // 从 prompt 的 logits 采样第一个 token
    const firstSample = this.sampler.sample(
      promptResult.logits,
      config.sampling,
      tokenizer.getVocabulary().idToToken
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
      config.stopConditions
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
        promptLen + step,
        config.debug
      );

      // 采样
      const sample = this.sampler.sample(
        logits,
        config.sampling,
        tokenizer.getVocabulary().idToToken
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
        config.stopConditions
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
   * buildTrace(prompt) — 从生成步骤构建完整的 GenerationTrace
   *
   * 在 generate() 完成后调用。
   *
   * @param prompt — 原始 prompt 文本
   * @param steps  — 收集到的所有 GenerationStep
   * @param durationMs — 生成耗时
   * @returns        完整的 GenerationTrace
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

  private lastPromptTrace: import("../model/types").ModelTrace | null = null;
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
  private populateCacheFromPrompt(
    trace: import("../model/types").ModelTrace
  ): void {
    const blocks = this.model.getBlocks();
    const tokenizer = this.model.getTokenizer();
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
   *   ① Embedding — 仅嵌入新 token ID
   *   ② RoPE — 对单个 token 向量应用旋转位置编码
   *   ③ 逐层前向（for each block）：
   *      a) Pre-Attention RMSNorm
   *      b) Q/K/V 投影（仅新 token）
   *      c) 与缓存的 K/V 拼接
   *      d) Scaled Dot-Product Attention（Q 对 全部 K/V）
   *      e) 更新 KVCache（追加新 K/V）
   *      f) 合并 + W_O + 残差
   *      g) Pre-FFN RMSNorm → FFN → 残差
   *   ④ LM Head — 投影到词表空间
   *
   * @param tokenId  — 上一个生成的 token ID
   * @param position — 当前 token 的绝对位置（prompt 长度 + 已生成数）
   * @param debug    — 是否收集 debug trace（本实现暂不收集完整 ModelTrace）
   * @returns          { logits: number[] }
   */
  private forwardSingleToken(
    tokenId: number,
    position: number,
    _debug: boolean
  ): { logits: number[] } {
    const config = this.model.getConfig();
    const { dModel, numHeads, headDim } = config;
    const embedding = this.model.getEmbedding();
    const rope = this.model.getRoPE();
    const blocks = this.model.getBlocks();
    const lmHead = this.model.getLMHead();

    // ── ① Embedding ──
    const embedded = embedding.getEmbeddings([tokenId]); // [1][dModel]
    let hidden: number[][] = embedded;

    // ── ② RoPE ──
    hidden = this.applyRoPEToSingleVector(hidden, position);

    // ── ③ Per-Layer Forward ──
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

    // ── ④ LM Head ──
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
    const rotated = new Array(dModel);

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
    _tokensGenerated: number,
    conditions: StopCondition[]
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
   * 熵 = -Σ p_i × log(p_i)
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
   * buildCacheSnapshot — 构建当前 KV Cache 的元数据快照
   */
  private buildCacheSnapshot(): CacheSnapshot {
    const seqLen = this.kvCache.getCachedSeqLen();
    const numLayers = this.kvCache.getLayerCount();
    const layerEntropyAverages: number[] = [];

    for (let i = 0; i < numLayers; i++) {
      const entry = this.kvCache.get(i);
      if (entry && entry.metadata.length > 0) {
        // 取最后一层的平均熵（最新位置的注意力状态）
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/GenerationLoop.ts
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/inference/GenerationLoop.ts
git commit -m "feat(minimind): add GenerationLoop — autoregressive step controller (Phase 21d)"
```

---

### Task 6: Create `InferenceEngine.ts` — composition root

**Files:**
- Create: `src/lib/minimind/inference/InferenceEngine.ts`

**Interfaces:**
- Consumes: `MiniMindModel` (DI), `KVCache`, `Sampler`, `GenerationLoop`, `SamplingStrategy` impls, `InferenceConfig`, `GenerationStep`, `GenerationTrace`, `GenerationResult` from `./types`
- Produces: `class InferenceEngine { constructor(model), async *generate(prompt, config), getResult() → GenerationResult, getModel(), getCache(), getTrace() }`

- [ ] **Step 1: Write `src/lib/minimind/inference/InferenceEngine.ts`**

```typescript
// ============================================================
// MiniMind — inference/InferenceEngine.ts
// ============================================================
// InferenceEngine — 推理组合根
//
// 核心功能：
//   将 MiniMindModel、KVCache、Sampler、GenerationLoop
//   组合成完整的自回归文本生成引擎。
//
// 设计原则：
//   - 依赖注入 — MiniMindModel 由外部提供
//   - 组合根 — 不实现业务逻辑，只负责组装和委托
//   - 零模型修改 — 所有交互通过 MiniMindModel 的公开 API
//   - 纯库代码 — 无 React / 浏览器依赖
//
// 使用方式：
//
// ```ts
// const engine = new InferenceEngine(model);
// for await (const step of engine.generate("Hello", {
//   maxTokens: 20,
//   sampling: { temperature: 0.8, topK: 40, topP: 0.95 },
//   stopConditions: [{ type: "maxTokens" }],
//   debug: false,
// })) {
//   console.log(step.token);
// }
// const result = engine.getResult("Hello");
// ```
// ============================================================

import type { MiniMindModel } from "../model/MiniMindModel";
import type {
  InferenceConfig,
  GenerationStep,
  GenerationTrace,
  GenerationResult,
  KVCacheEntry,
} from "./types";
import { KVCache } from "./KVCache";
import { Sampler } from "./Sampler";
import { GenerationLoop } from "./GenerationLoop";
import { GreedySampler } from "./strategies/GreedySampler";
import { TemperatureSampler } from "./strategies/TemperatureSampler";
import { TopKSampler } from "./strategies/TopKSampler";
import { TopPSampler } from "./strategies/TopPSampler";

/**
 * InferenceEngine — MiniMind 推理引擎组合根
 *
 * 核心职责：
 *   作为组合根（composition root），创建并注入所有推理子模块。
 *   暴露 generate() 异步生成器作为唯一的公开生成 API。
 *
 * 子模块创建顺序：
 *   1. KVCache — 基于模型配置确定层数/头数/头维度
 *   2. Sampler — 注入 4 个策略实例
 *   3. GenerationLoop — 注入模型、KVCache、Sampler
 */
export class InferenceEngine {
  private model: MiniMindModel;
  private kvCache: KVCache;
  private sampler: Sampler;
  private loop: GenerationLoop;
  private lastTrace: GenerationTrace | null = null;

  /**
   * @param model — MiniMindModel 实例（依赖注入）
   *
   * 构造时立即：
   *   1. 读取模型配置（numLayers, numHeads, headDim）
   *   2. 创建 KVCache（匹配模型维度）
   *   3. 创建 Sampler（注入 4 个策略）
   *   4. 创建 GenerationLoop（注入模型、KVCache、Sampler）
   */
  constructor(model: MiniMindModel) {
    this.model = model;
    const config = model.getConfig();

    this.kvCache = new KVCache({
      numLayers: config.numLayers,
      numHeads: config.numHeads,
      headDim: config.headDim,
    });

    this.sampler = new Sampler([
      new TemperatureSampler(),
      new TopKSampler(),
      new TopPSampler(),
      new GreedySampler(),
    ]);

    this.loop = new GenerationLoop(model, this.kvCache, this.sampler);
  }

  /**
   * generate(prompt, config) — 自回归文本生成
   *
   * 异步生成器，每次迭代 yield 一个 GenerationStep。
   * 消费者可通过 break 提前终止。
   *
   * 接受默认配置的简便方式：
   *
   * ```ts
   * engine.generate("Hello") // 使用默认配置
   * engine.generate("Hello", { maxTokens: 50, sampling: { temperature: 0.7, topK: 0, topP: 1.0 }, stopConditions: [], debug: false })
   * ```
   *
   * @param prompt — 输入提示文本
   * @param config — 可选的生成配置（省略时使用合理默认值）
   * @yields       每个生成 token 的步骤记录
   */
  async *generate(
    prompt: string,
    config?: Partial<InferenceConfig>
  ): AsyncGenerator<GenerationStep> {
    const resolvedConfig = this.resolveConfig(config);

    // 收集步骤用于构建 trace
    const startTime = performance.now();
    const steps: GenerationStep[] = [];

    for await (const step of this.loop.generate(prompt, resolvedConfig)) {
      steps.push(step);
      yield step;
    }

    const durationMs = performance.now() - startTime;

    // 构建并存储 trace
    this.lastTrace = this.loop.buildTrace(prompt, steps, durationMs);
  }

  /**
   * getResult(prompt) — 从最近一次生成构建完整结果
   *
   * 在 generate() 完成后调用。
   *
   * @param prompt — 原始提示文本
   * @returns        包含文本、trace 和统计信息的完整结果
   */
  getResult(prompt: string): GenerationResult | null {
    const trace = this.lastTrace;
    if (!trace) return null;

    const generatedText = trace.steps.map((s) => s.token).join("");

    return {
      text: prompt + generatedText,
      tokensGenerated: trace.steps.length,
      stopReason: this.loop.getStopReason(),
      trace,
    };
  }

  // ============================================================
  // 公开 API — 访问器
  // ============================================================

  /**
   * getModel() — 获取注入的 MiniMindModel 实例
   */
  getModel(): MiniMindModel {
    return this.model;
  }

  /**
   * getCache() — 获取 KV Cache 条目（用于检查和可视化）
   *
   * 返回所有层的当前缓存状态。
   * 在 generate() 完成后调用以检查最终缓存。
   */
  getCache(): KVCacheEntry[] {
    return this.kvCache.getEntries();
  }

  /**
   * getTrace() — 获取最近一次生成的完整 trace
   *
   * 如果在 generate() 之前调用，返回 null。
   */
  getTrace(): GenerationTrace | null {
    return this.lastTrace;
  }

  // ============================================================
  // 内部
  // ============================================================

  /**
   * resolveConfig — 合并用户配置与默认值
   */
  private resolveConfig(
    partial?: Partial<InferenceConfig>
  ): InferenceConfig {
    return {
      maxTokens: partial?.maxTokens ?? 20,
      sampling: {
        temperature: partial?.sampling?.temperature ?? 1.0,
        topK: partial?.sampling?.topK ?? 0,
        topP: partial?.sampling?.topP ?? 1.0,
      },
      stopConditions: partial?.stopConditions ?? [],
      debug: partial?.debug ?? false,
      seed: partial?.seed,
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/InferenceEngine.ts
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/inference/InferenceEngine.ts
git commit -m "feat(minimind): add InferenceEngine — composition root (Phase 21e)"
```

---

### Task 7: Barrel exports + main barrel update

**Files:**
- Create: `src/lib/minimind/inference/index.ts`
- Modify: `src/lib/minimind/index.ts` — add inference section

- [ ] **Step 1: Write `src/lib/minimind/inference/index.ts`**

```typescript
// ============================================================
// MiniMind — inference/index.ts
// ============================================================
// Inference 模块统一导出入口
// ============================================================

export { InferenceEngine } from "./InferenceEngine";
export { KVCache } from "./KVCache";
export { Sampler } from "./Sampler";
export { GenerationLoop } from "./GenerationLoop";

export { GreedySampler } from "./strategies/GreedySampler";
export { TemperatureSampler } from "./strategies/TemperatureSampler";
export { TopKSampler } from "./strategies/TopKSampler";
export { TopPSampler } from "./strategies/TopPSampler";

export type {
  InferenceConfig,
  SamplingConfig,
  StopCondition,
  GenerationStep,
  TokenAlternative,
  CacheSnapshot,
  GenerationTrace,
  GenerationResult,
  KVCacheEntry,
  PositionMetadata,
  SamplingStrategy,
  LogitsTransformResult,
} from "./types";
```

- [ ] **Step 2: Update `src/lib/minimind/index.ts` — add inference section**

Read the existing file to locate the insertion point. The file ends with experiment exports. Add the inference section before the closing of the file.

The inference section goes after the Experiments section. Add after line 154 (end of experiment type exports):

```typescript
// ── Inference (Phase 21) ──
export { InferenceEngine } from "./inference/InferenceEngine";
export { KVCache } from "./inference/KVCache";
export { Sampler } from "./inference/Sampler";
export { GenerationLoop } from "./inference/GenerationLoop";
export {
  GreedySampler,
  TemperatureSampler,
  TopKSampler,
  TopPSampler,
} from "./inference/strategies/GreedySampler";
export type {
  InferenceConfig,
  SamplingConfig,
  StopCondition,
  GenerationStep,
  TokenAlternative,
  CacheSnapshot,
  GenerationTrace,
  GenerationResult,
  KVCacheEntry,
  PositionMetadata,
  SamplingStrategy,
  LogitsTransformResult,
} from "./inference/types";
```

The exact edit is to insert the above block after the last experiment type export line (currently line 154), with two blank lines before it.

Use the Edit tool to do this. Read `src/lib/minimind/index.ts` first to confirm the current state.

- [ ] **Step 3: Verify TypeScript compiles for the barrel**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/inference/index.ts && npx tsc --noEmit src/lib/minimind/index.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/minimind/inference/index.ts src/lib/minimind/index.ts
git commit -m "feat(minimind): add inference barrel exports (Phase 21f)"
```

---

### Task 8: Registry update + build verification

**Files:**
- Modify: `src/data/minimind/module-registry.ts` — update inference entry

- [ ] **Step 1: Update inference module entry in registry**

Read `src/data/minimind/module-registry.ts`. Find the inference module entry (id: `"inference"`, currently `status: "upcoming"`, `implemented: false`, `futureVersion: "V6"`). Change it to:

```typescript
status: "in-progress",
implemented: true,
futureVersion: null,
```

- [ ] **Step 2: Full build verification**

```bash
cd "d:/123/HOU Universe" && npm run build
```

Expected: zero errors, zero warnings.

- [ ] **Step 3: TypeScript strict check**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Lint check**

```bash
cd "d:/123/HOU Universe" && npm run lint
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/data/minimind/module-registry.ts
git commit -m "feat(minimind): activate inference module in registry (Phase 21f)"
```
