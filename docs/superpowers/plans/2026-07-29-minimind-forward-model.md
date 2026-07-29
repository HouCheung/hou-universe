# MiniMind Forward Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete MiniMind Forward Architecture by composing Tokenizer, Embedding, RoPE, Transformer Blocks, and a new LM Head into a single `MiniMindModel` orchestrator.

**Architecture:** Follows existing MiniMind module pattern — `types.ts` → implementation classes → registry → examples → exports. `MiniMindModel` uses dependency injection to compose all sub-modules without duplicating any code. New `MiniLMHead` class projects hidden states to vocabulary logits.

**Tech Stack:** TypeScript (strict), no external dependencies beyond existing MiniMind modules.

## Global Constraints

- Do NOT modify: Tokenizer, Embedding, RoPE, Attention, FFN, Transformer Block, AI Lab, existing Playground
- All files must follow existing code patterns: JSDoc comments, educational design, DI
- `npx tsc --noEmit` — no errors
- `npm run lint` — clean
- `npm run build` — no warnings
- Commit message: `feat(minimind): add full forward model`

---

### Task 1: Theory Doc

**Files:**
- Create: `docs/minimind/09-forward.md`

**Interfaces:**
- Consumes: nothing (standalone doc)
- Produces: theory documentation for the forward model module

- [ ] **Step 1: Write the theory doc**

Create `docs/minimind/09-forward.md` following the established template (Purpose, Input, Output, Core Concepts, Core Classes, Core Functions, Learning Notes, Questions, TODO). Cover: LLM Forward Pass, Hidden State Flow, Decoder-only Architecture, LM Head, Logits, Softmax Probability, MiniMind complete data flow. Use the same markdown style as `06-transformer.md`.

- [ ] **Step 2: Commit**

```bash
git add docs/minimind/09-forward.md
git commit -m "docs(minimind): add forward model theory chapter"
```

---

### Task 2: Model Layer Types

**Files:**
- Create: `src/lib/minimind/model/types.ts`

**Interfaces:**
- Consumes: `TransformerConfig` from `../transformer/types`
- Produces: `ModelConfig`, `ModelInput`, `ModelOutput`, `ModelTrace`

- [ ] **Step 1: Write types.ts**

```typescript
// ============================================================
// MiniMind — model/types.ts
// ============================================================
// Model 模块类型定义
//
// 为 MiniMindModel 提供统一的数据结构，
// 供 Playground 和 AI Lab 消费。
// ============================================================

import type { TransformerConfig } from "../transformer/types";

/**
 * MiniMind Model 完整配置
 *
 * 扩展 Transformer Block 配置，加入
 * 词汇表大小和层数，形成完整的模型定义。
 */
export interface ModelConfig {
  /** 词汇表大小 — 决定 Embedding 和 LM Head 的维度 */
  vocabSize: number;
  /** Model 维度 — 隐藏表示的宽度 */
  dModel: number;
  /** 注意力头数量 */
  numHeads: number;
  /** 每个头的维度 = dModel / numHeads */
  headDim: number;
  /** FFN 中间维度 — 通常为 dModel 的 4 倍 */
  dFF: number;
  /** Transformer Block 层数 */
  numLayers: number;
  /** 最大序列长度 */
  maxSeqLen: number;
  /** 归一化 epsilon */
  normEps: number;
  /** RoPE theta 基数 */
  ropeTheta: number;
}

/**
 * Model 前向传播的输入
 */
export interface ModelInput {
  /** 原始输入文本 */
  inputText: string;
  /** 可选 — 是否启用 causal mask，默认 true */
  causalMask?: boolean;
}

/**
 * Model 前向传播的输出
 */
export interface ModelOutput {
  /** 词表大小的 logits 向量 — [vocabSize]（取最后一个 token） */
  logits: number[];
  /** 最终隐藏状态 — [seqLen, dModel] */
  hiddenStates: number[][];
  /** 完整的模型 trace */
  trace: ModelTrace;
}

/**
 * 单次 forward 的完整 Model Trace
 *
 * 从 Text → Tokens → Embeddings → Transformer → Logits
 * 的完整中间结果，供 Playground 可视化全流程。
 */
export interface ModelTrace {
  /** 原始输入文本 */
  inputText: string;
  /** Token 数组 */
  tokens: string[];
  /** Token ID 数组 */
  tokenIds: number[];
  /** Embedding 输出 — [seqLen, dModel] */
  embeddings: number[][];
  /** RoPE 旋转后的向量 — [seqLen, dModel] */
  rotatedEmbeddings: number[][];
  /** 序列长度 */
  seqLen: number;
  /** Model 维度 */
  dModel: number;
  /** 每个 Transformer Block 的 trace */
  blockTraces: import("../transformer/types").TransformerTrace[];
  /** 最终隐藏状态 — [seqLen, dModel] */
  hiddenStates: number[][];
  /** LM Head 输出的 logits — [vocabSize] */
  logits: number[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/minimind/model/types.ts
git commit -m "feat(minimind): add model layer type definitions"
```

---

### Task 3: LM Head

**Files:**
- Create: `src/lib/minimind/model/LMHead.ts`

**Interfaces:**
- Consumes: nothing external (pure implementation)
- Produces: `MiniLMHead` class with `forward()`, `project()`, `getWeights()`

- [ ] **Step 1: Write LMHead.ts**

```typescript
// ============================================================
// MiniMind — LMHead.ts
// ============================================================
// MiniLMHead V1 — 教育型 Language Model Head 引擎
//
// 核心功能：
//   - 将 hidden state 线性投影到 vocabulary 空间
//   - 输出 logits（未经 softmax 的原始分数）
//   - 权重矩阵完全透明，可随时检查
//
// 公式：
//   logits = hidden × W^T
//   其中 W: [vocabSize, dModel]
//
// 数据流：
//   Hidden State [dModel]
//     → Linear Projection (× W^T)
//     → Logits [vocabSize]
//
// 教育重点：
//   - LM Head 是模型与词汇表的桥梁
//   - Logits 的含义 — "每个 token 的原始可能性分数"
//   - Softmax 不属于 LM Head — 留给 Inference/Loss 层
//   - 权重矩阵可解释性 — 每一行是一个 token 的"理想向量"
// ============================================================

/**
 * MiniLMHead — 教育用 Language Model Head 引擎
 *
 * 核心职责：
 *   实现最简单的线性投影：hidden [dModel] → logits [vocabSize]。
 *   不包含 softmax — 那是 inference 或 loss 层的职责。
 *
 * 使用方式：
 *
 * ```ts
 * const lmHead = new MiniLMHead({ dModel: 512, vocabSize: 1000, seed: 42 });
 *
 * // 投影最后一个 token 的 hidden state
 * const hidden = [...512 dims...];
 * const logits = lmHead.forward(hidden);
 * // logits → [1000] 个分数，越高表示该 token 越可能
 *
 * // 批量投影
 * const hiddenBatch = [[...], [...], [...]];
 * const allLogits = lmHead.forward(hiddenBatch);
 * // allLogits → [3][1000]
 *
 * // 检查权重
 * const W = lmHead.getWeights();
 * // W → [vocabSize][dModel] 投影矩阵
 * ```
 *
 * 教育设计：
 *   - 权重完全透明 — W 可随时检查
 *   - 纯线性变换 — 理解最简单的 projection
 *   - 确定性初始化 — 相同 seed 产生相同权重
 *   - 无 softmax — 分离关注点，logits 的语义更清晰
 */
export class MiniLMHead {
  private dModel: number;
  private vocabSize: number;
  /** 权重矩阵 W: [vocabSize, dModel] — 每行是一个 token 的投影向量 */
  private weights: number[][];

  /**
   * @param config — { dModel, vocabSize, seed? }
   *
   * 构造时立即：
   *   1. 验证参数（dModel > 0, vocabSize > 0）
   *   2. 使用 Xavier 初始化权重矩阵
   *
   * Xavier 初始化：
   *   权重从 N(0, sqrt(2 / (fanIn + fanOut))) 采样，
   *   确保前向和反向传播时信号的方差保持一致。
   *   fanIn = dModel, fanOut = vocabSize
   */
  constructor(config: { dModel: number; vocabSize: number; seed?: number }) {
    if (config.dModel <= 0) {
      throw new Error(`dModel must be positive, got ${config.dModel}`);
    }
    if (config.vocabSize <= 0) {
      throw new Error(`vocabSize must be positive, got ${config.vocabSize}`);
    }

    this.dModel = config.dModel;
    this.vocabSize = config.vocabSize;
    this.weights = this.initializeWeights(config.seed ?? 42);
  }

  // ============================================================
  // 公开 API — 前向传播
  // ============================================================

  /**
   * forward(hidden) — 将 hidden state 投影到 vocabulary 空间
   *
   * 接受单个向量 [dModel] 或批量矩阵 [seqLen, dModel]。
   *
   * 单个向量时返回 [vocabSize] logits。
   * 批量矩阵时返回 [seqLen, vocabSize]。
   *
   * 公式：
   *   logits[i] = Σ(hidden[j] × W[i][j])   for j=0..dModel-1
   *
   * 参数：
   * @param hidden — [dModel] 或 [seqLen, dModel]
   * @returns          [vocabSize] 或 [seqLen, vocabSize]
   *
   * 示例：
   *   // 单个 token
   *   const logits = lmHead.forward(hiddenStates[lastPos]);
   *   // logits → [vocabSize]
   *
   *   // 所有 token
   *   const allLogits = lmHead.forward(hiddenStates);
   *   // allLogits → [seqLen][vocabSize]
   */
  forward(hidden: number[]): number[];
  forward(hidden: number[][]): number[][];
  forward(hidden: number[] | number[][]): number[] | number[][] {
    // 判断是单个向量还是批量矩阵
    if (typeof hidden[0] === "number") {
      return this.project(hidden as number[]);
    }
    return (hidden as number[][]).map((h) => this.project(h));
  }

  /**
   * project(vector) — 单个向量的线性投影
   *
   * 公开此方法以便教育用途：理解隐藏向量
   * 如何映射到每个词汇 token 的得分。
   *
   * 公式：
   *   logits[i] = vector · W[i]（点积）
   *
   * 解释：
   *   每个 token 在权重矩阵中有一行 W[i]。
   *   logits[i] 就是当前 hidden state 与该 token
   *   "理想向量"的相似度。相似度越高，
   *   该 token 越可能出现。
   *
   * 参数：
   * @param vector — [dModel] 隐藏向量
   * @returns         [vocabSize] logits
   */
  project(vector: number[]): number[] {
    if (vector.length !== this.dModel) {
      throw new Error(
        `Input dimension mismatch: expected dModel=${this.dModel}, ` +
        `got ${vector.length}`
      );
    }

    const logits: number[] = new Array(this.vocabSize);
    for (let v = 0; v < this.vocabSize; v++) {
      let sum = 0;
      const row = this.weights[v];
      for (let d = 0; d < this.dModel; d++) {
        sum += vector[d] * row[d];
      }
      logits[v] = sum;
    }
    return logits;
  }

  // ============================================================
  // 公开 API — 权重访问
  // ============================================================

  /**
   * getWeights() — 获取完整的投影矩阵
   *
   * 返回 W: [vocabSize][dModel]。
   * 每一行 W[i] 是 token i 的"理想 hidden state"。
   *
   * 教育用途：
   *   - 可视化 token 向量在语义空间的分布
   *   - 计算 token 向量间的余弦相似度
   *   - 分析与 Embedding 矩阵的关系（weight tying）
   *
   * 示例：
   *   const W = lmHead.getWeights();
   *   // W[0] → token 0 的投影向量 [dModel]
   */
  getWeights(): number[][] {
    return this.weights.map((row) => [...row]);
  }

  /**
   * getConfig() — 返回 LM Head 配置
   *
   * 示例：
   *   lmHead.getConfig()
   *   // → { dModel: 512, vocabSize: 1000 }
   */
  getConfig(): { dModel: number; vocabSize: number } {
    return { dModel: this.dModel, vocabSize: this.vocabSize };
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * initializeWeights(seed) — Xavier 初始化权重矩阵
   *
   * 使用确定性 PRNG (Mulberry32) 生成可复现的随机权重。
   *
   * Xavier 初始化：
   *   std = sqrt(2 / (fanIn + fanOut))
   *   W[i][j] ~ N(0, std)
   *
   * 这里 fanIn = dModel, fanOut = vocabSize。
   *
   * 使用 Box-Muller 变换将均匀分布转为正态分布。
   */
  private initializeWeights(seed: number): number[][] {
    const prng = createPRNG(seed);
    const std = Math.sqrt(2 / (this.dModel + this.vocabSize));

    const W: number[][] = new Array(this.vocabSize);
    for (let v = 0; v < this.vocabSize; v++) {
      W[v] = new Array(this.dModel);
      for (let d = 0; d < this.dModel; d++) {
        // Box-Muller: 将两个均匀分布转为正态分布
        const u1 = prng();
        const u2 = prng();
        const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        W[v][d] = z * std;
      }
    }
    return W;
  }
}

// ============================================================
// Deterministic PRNG — Mulberry32
// ============================================================

/**
 * 创建一个基于 Mulberry32 算法的确定型 PRNG
 *
 * 返回值在 [0, 1) 区间内均匀分布。
 * 相同 seed 始终产生相同的随机序列。
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/minimind/model/LMHead.ts
git commit -m "feat(minimind): add LM Head module"
```

---

### Task 4: MiniMindModel

**Files:**
- Create: `src/lib/minimind/model/MiniMindModel.ts`

**Interfaces:**
- Consumes: `MiniTokenizer` from `../tokenizer`, `MiniEmbedding` from `../embedding`, `RotaryEmbedding` from `../rope`, `MiniTransformerBlock` from `../transformer`, `MiniLMHead` from `./LMHead`, types from `./types`
- Produces: `MiniMindModel` class with `constructor(config, deps)`, `forward(text)`, `getTrace()`

- [ ] **Step 1: Write MiniMindModel.ts**

```typescript
// ============================================================
// MiniMind — MiniMindModel.ts
// ============================================================
// MiniMindModel V1 — 完整的前向传播模型
//
// 核心功能：
//   - 将 Tokenizer、Embedding、RoPE、Transformer Blocks、LM Head
//     组合成一个完整的 Text → Logits 管道
//   - 依赖注入 — 不复制任何已有模块代码
//   - 完整的 Model Trace — 每一步中间结果可检查
//
// 数据流：
//   Text
//     → Tokenizer.encode()      → Token IDs
//     → Embedding.forward()     → Token Vectors
//     → RoPE.applyQKRotation()  → Position-Aware Vectors
//     → TransformerBlock[]      → Contextualized Representations
//     → LMHead.forward()        → Vocabulary Logits
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
 *   作为组合根（composition root），将 6 个子模块
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
   *   1. Tokenizer.encode() — 文本 → Token IDs
   *   2. Embedding.forward() — Token IDs → Dense Vectors
   *   3. RoPE.applyRotation() — 注入位置信息
   *   4. TransformerBlock.forward() × N — 逐层变换
   *   5. LMHead.forward() — Hidden State → Logits
   *
   * 参数：
   * @param input — { inputText, causalMask? }
   * @returns       { logits, hiddenStates, trace }
   *
   * 示例：
   *   const result = model.forward({ inputText: "Hello HOU Universe" });
   */
  forward(input: ModelInput): ModelOutput {
    const { inputText, causalMask = true } = input;
    const mask = causalMask ? "causal" : null;

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
    const embeddings = this.embedding.forward(tokenIds);

    // ── Stage 3: RoPE ──
    const rotatedEmbeddings = this.rope.applyRotation(embeddings);

    // ── Stage 4: Transformer Blocks ──
    const blockTraces = [];
    let currentHidden = rotatedEmbeddings;
    for (let i = 0; i < this.blocks.length; i++) {
      const blockResult = this.blocks[i].forward({
        hiddenStates: currentHidden,
        mask: mask as "causal" | null,
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

  /**
   * getTrace() — 获取最近一次 forward 的完整 model trace
   *
   * 返回最后一次 forward 调用产生的完整 model trace。
   * 如果在 forward 之前调用，返回 null。
   *
   * trace 结构包含从 Text → Tokens → Embeddings →
   * Transformer → Logits 的全流程中间结果。
   *
   * 教育用途：
   *   - 追踪文本如何逐步转化为 logits
   *   - 对比不同层对表示的改变
   *   - 验证 RoPE 是否正确注入位置信息
   *   - 分析 LM Head 的 logits 分布
   */
  getTrace(): ModelTrace | null {
    return this.lastTrace;
  }

  // ============================================================
  // 公开 API — 配置 & 子模块访问
  // ============================================================

  /**
   * getConfig() — 返回模型配置
   */
  getConfig(): ModelConfig {
    return { ...this.config };
  }

  /**
   * getTokenizer() — 获取注入的 Tokenizer
   */
  getTokenizer(): MiniTokenizer {
    return this.tokenizer;
  }

  /**
   * getEmbedding() — 获取注入的 Embedding
   */
  getEmbedding(): MiniEmbedding {
    return this.embedding;
  }

  /**
   * getRoPE() — 获取注入的 RoPE
   */
  getRoPE(): RotaryEmbedding {
    return this.rope;
  }

  /**
   * getBlocks() — 获取注入的 Transformer Block 数组
   */
  getBlocks(): MiniTransformerBlock[] {
    return [...this.blocks];
  }

  /**
   * getLMHead() — 获取注入的 LM Head
   */
  getLMHead(): MiniLMHead {
    return this.lmHead;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/minimind/model/MiniMindModel.ts
git commit -m "feat(minimind): add MiniMindModel composition root"
```

---

### Task 5: Model Registry

**Files:**
- Create: `src/data/minimind/model-registry.ts`

**Interfaces:**
- Consumes: nothing standalone (referential integrity with module-registry)
- Produces: `MiniMindModelModule` entries V1–V5

- [ ] **Step 1: Write model-registry.ts**

Create `src/data/minimind/model-registry.ts` following the exact pattern from `transformer-registry.ts`. Define `ModelArchitectureConfig`, `ModelFeature`, `ModelModule` interfaces, a `MODEL_MODULES` array with 5 version entries (V1 Single Block, V2 Multi Layer, V3 LM Head, V4 Generation Ready, V5 MiniMind Compatible), and convenience lookup helpers: `getModelModuleById()`, `getActiveModelModule()`, `getAllModelConcepts()`, `getAllModelExperiments()`. Also export flat arrays `MODEL_CONCEPTS` and `MODEL_EXPERIMENTS` for backward compatibility.

The full file should be ~250 lines, mirroring the structure (interfaces → feature lists → module array → lookup helpers → flat exports) from `transformer-registry.ts`. The active V1 entry should describe the single-block forward model with config `{ dModel: 512, numHeads: 8, headDim: 64, dFF: 2048, numLayers: 1, maxSeqLen: 128, normEps: 1e-6 }`, concepts covering Full Forward Pass, LM Head, Logits, Composition Root, and Dependency Injection. V5 should describe the MiniMind 26M compatible model with 8 layers.

- [ ] **Step 2: Commit**

```bash
git add src/data/minimind/model-registry.ts
git commit -m "feat(minimind): add model registry SSOT"
```

---

### Task 6: Examples

**Files:**
- Create: `src/lib/minimind/model/examples.ts`

**Interfaces:**
- Consumes: all model sub-modules, `MiniMindModel`
- Produces: `runForwardExample()` demonstration function

- [ ] **Step 1: Write examples.ts**

```typescript
// ============================================================
// MiniMind — model/examples.ts
// ============================================================
// 完整的前向传播示例
//
// 展示 "Hello HOU Universe" 经过 MiniMind 完整管道的
// 每一步中间结果。
// ============================================================

import { MiniMindModel } from "./MiniMindModel";
import { MiniLMHead } from "./LMHead";
import { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import { MiniEmbedding } from "../embedding/Embedding";
import { RotaryEmbedding } from "../rope/RotaryEmbedding";
import { MiniTransformerBlock } from "../transformer/TransformerBlock";
import { MiniAttention } from "../attention/Attention";
import { MiniFeedForward } from "../ffn/FeedForward";
import type { ModelConfig } from "./types";

/**
 * runForwardExample() — 演示完整的 Text → Logits 管道
 *
 * 使用 "Hello HOU Universe" 作为输入，
 * 展示从 Tokenizer 到 LM Head 的每一步输出。
 *
 * 示例输出：
 *   Text: "Hello HOU Universe"
 *   ↓ Tokenizer
 *   Tokens: ["Hello", "HOU", "Universe"]
 *   Token IDs: [123, 456, 789]
 *   ↓ Embedding
 *   Embeddings: [3][512]
 *   ↓ RoPE
 *   Rotated: [3][512]
 *   ↓ Transformer Block × N
 *   Hidden States: [3][512]
 *   ↓ LM Head
 *   Logits: [vocabSize]
 */
export function runForwardExample(): void {
  // ── 配置 ──
  const config: ModelConfig = {
    vocabSize: 1000,
    dModel: 512,
    numHeads: 8,
    headDim: 64,
    dFF: 2048,
    numLayers: 1,
    maxSeqLen: 128,
    normEps: 1e-6,
    ropeTheta: 10000,
  };

  // ── 构造子模块 ──
  const tokenizer = new MiniTokenizer({ addSpecialTokens: false });
  const embedding = new MiniEmbedding({
    vocabSize: config.vocabSize,
    embeddingDim: config.dModel,
    seed: 42,
  });
  const rope = new RotaryEmbedding({
    headDim: config.headDim,
    theta: config.ropeTheta,
    maxSeqLen: config.maxSeqLen,
  });
  const attention = new MiniAttention({
    dModel: config.dModel,
    numHeads: config.numHeads,
    headDim: config.headDim,
    maxSeqLen: config.maxSeqLen,
  });
  const ffn = new MiniFeedForward({
    dModel: config.dModel,
    dFF: config.dFF,
    maxSeqLen: config.maxSeqLen,
  });
  const block = new MiniTransformerBlock(
    {
      dModel: config.dModel,
      numHeads: config.numHeads,
      headDim: config.headDim,
      dFF: config.dFF,
      maxSeqLen: config.maxSeqLen,
      normEps: config.normEps,
    },
    attention,
    ffn
  );
  const lmHead = new MiniLMHead({
    dModel: config.dModel,
    vocabSize: config.vocabSize,
    seed: 42,
  });

  // ── 组装模型 ──
  const model = new MiniMindModel(config, {
    tokenizer,
    embedding,
    rope,
    blocks: [block],
    lmHead,
  });

  // ── 前向传播 ──
  const inputText = "Hello HOU Universe";
  console.log("=".repeat(60));
  console.log("MiniMind Forward Pass Example");
  console.log("=".repeat(60));
  console.log(`\nInput Text: "${inputText}"\n`);

  const result = model.forward({ inputText });

  // ── 展示结果 ──
  console.log("Stage 1 — Tokenizer:");
  console.log(`  Tokens:    [${result.trace.tokens.map((t) => `"${t}"`).join(", ")}]`);
  console.log(`  Token IDs: [${result.trace.tokenIds.join(", ")}]`);
  console.log(`  Seq Len:   ${result.trace.seqLen}\n`);

  console.log("Stage 2 — Embedding:");
  console.log(`  Shape:     [${result.trace.seqLen}][${result.trace.dModel}]`);
  console.log(`  E[0][0]:   ${result.trace.embeddings[0][0].toFixed(6)}\n`);

  console.log("Stage 3 — RoPE:");
  console.log(`  Shape:     [${result.trace.seqLen}][${result.trace.dModel}]`);
  console.log(`  R[0][0]:   ${result.trace.rotatedEmbeddings[0][0].toFixed(6)}\n`);

  console.log(`Stage 4 — Transformer Blocks (${config.numLayers} layer(s)):`);
  result.trace.blockTraces.forEach((bt, i) => {
    console.log(`  Block ${i}: output[0][0] = ${bt.afterFFNResidual[0][0].toFixed(6)}`);
  });
  console.log();

  console.log("Stage 5 — LM Head:");
  console.log(`  Logits shape: [${result.logits.length}]`);
  console.log(`  Logits[0..4]: [${result.logits.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}, ...]`);
  console.log(`  Max logit:    ${Math.max(...result.logits).toFixed(4)}`);
  console.log(`  Min logit:    ${Math.min(...result.logits).toFixed(4)}\n`);

  console.log("=".repeat(60));
  console.log("Forward pass complete.");
  console.log("=".repeat(60));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/minimind/model/examples.ts
git commit -m "feat(minimind): add forward model examples"
```

---

### Task 7: Model Internal Exports + Global Export Update

**Files:**
- Create: `src/lib/minimind/model/index.ts`
- Modify: `src/lib/minimind/index.ts`

**Interfaces:**
- Consumes: model types, MiniLMHead, MiniMindModel, examples
- Produces: barrel exports

- [ ] **Step 1: Write model/index.ts**

```typescript
// ============================================================
// MiniMind — model/index.ts
// ============================================================
// Model 模块统一导出入口
// ============================================================

export { MiniLMHead } from "./LMHead";
export { MiniMindModel } from "./MiniMindModel";
export { runForwardExample } from "./examples";
export type {
  ModelConfig,
  ModelInput,
  ModelOutput,
  ModelTrace,
} from "./types";
```

- [ ] **Step 2: Update src/lib/minimind/index.ts**

Add after the Transformer Block exports section:

```typescript
// ── Model (Full Forward) ──
export { MiniLMHead } from "./model/LMHead";
export { MiniMindModel } from "./model/MiniMindModel";
export { runForwardExample } from "./model/examples";
export type {
  ModelConfig,
  ModelInput,
  ModelOutput,
  ModelTrace,
} from "./model/types";
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/model/index.ts src/lib/minimind/index.ts
git commit -m "feat(minimind): add model exports to barrel file"
```

---

### Task 8: Module Registry Update

**Files:**
- Modify: `src/data/minimind/module-registry.ts`

**Interfaces:**
- Consumes: existing `MINIMIND_MODULES` array
- Produces: new "model" module entry inserted before "inference"

- [ ] **Step 1: Add model entry to MINIMIND_MODULES**

Insert after the transformer entry (before inference):

```typescript
  {
    id: "model",
    title: "Forward Model",
    description:
      "Complete Text → Logits pipeline. Composes Tokenizer, Embedding, RoPE, Transformer Blocks, and LM Head into a full MiniMind forward architecture.",
    status: "in-progress",
    order: 8,
    phase: "foundation",
    theoryDocPath: "docs/minimind/09-forward.md",
    sourcePath: "src/lib/minimind/model/",
    playgroundPath: "src/components/minimind/playground/model/",
    implemented: true,
    futureVersion: null,
    metadata: {
      theoryDocPath: "docs/minimind/09-forward.md",
      sourcePath: "src/lib/minimind/model/",
      registryPath: "src/data/minimind/model-registry.ts",
      playgroundPath: "/ai-lab/playground",
      concepts: [
        "LLM Forward Pass",
        "Hidden State Flow",
        "Decoder-only Architecture",
        "LM Head",
        "Logits",
        "Softmax Probability",
        "Composition Root",
        "Dependency Injection",
        "Model Orchestration",
      ],
      experiments: [
        "full-pipeline-trace",
        "hidden-state-evolution",
        "logit-distribution-analysis",
        "token-prediction-ranking",
      ],
      dependencies: ["transformer", "tokenizer"],
    },
  },
```

Also update the `inference` entry: change `order` from 8 to 9, and add `"model"` to its `dependencies` array (alongside existing `["transformer", "tokenizer"]`).

- [ ] **Step 2: Verify flow pipeline still works**

The `getFlowPipeline()` function should automatically include the new model module (since it filters by `phase: "foundation"` and sorts by `order`).

- [ ] **Step 3: Commit**

```bash
git add src/data/minimind/module-registry.ts
git commit -m "feat(minimind): register model module in SSOT"
```

---

### Final Verification

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: clean, no warnings.

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: no errors, no warnings.

- [ ] **Step 4: Final commit** (if any fixes needed from verification)

```bash
git add -A
git commit -m "feat(minimind): add full forward model"
```
