# MiniMind Pretraining Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `src/lib/minimind/pretrain/` module with 6 files implementing an educational pretraining pipeline skeleton: dataset → forward → loss → gradient boundary → record. No fake gradients, no model internals access, honest capability reporting.

**Architecture:** The Pretrainer composes MiniMindModel (forward pass only, via public API), ToyDataset (encodes samples), CrossEntropyLoss (pure math), and NoOpOptimizer (accepts gradients, does nothing). The gradient boundary is an explicit, documented seam for future autograd integration.

**Tech Stack:** TypeScript (strict, no `any`), zero external dependencies, existing MiniMind modules (MiniMindModel, MiniTokenizer) consumed via public API only.

## Global Constraints

- Do NOT modify any existing file in `src/lib/minimind/**`
- Do NOT modify any file in `src/data/minimind/**`
- Do NOT fake gradient computation or pretend weights update
- Do NOT access model internal parameters from Pretrainer (no `getWeights()`, `getEmbedding()`, etc.)
- All types explicit — no `any`, no `Record<string, unknown>`, no index signatures
- No `console.log` in production code
- `npm run build` must produce 0 errors and 0 warnings
- Commit each task independently

---

### Task 1: Create types.ts — All Type Definitions

**Files:**
- Create: `src/lib/minimind/pretrain/types.ts`

**Interfaces:**
- Produces: `TrainingSample`, `TrainingConfig`, `LossResult`, `TrainingCapability`, `EpochResult`, `TrainingTrace`, `TrainingResult`, `ParameterGradient`, `Optimizer`

- [ ] **Step 1: Write types.ts**

```typescript
// ============================================================
// MiniMind — pretrain/types.ts
// ============================================================
// Pretraining 模块类型定义
//
// 定义 Dataset、Loss、Optimizer、Pretrainer 之间的所有数据契约。
// 所有接口使用显式类型，禁止 any / 索引签名。
//
// 设计原则：
//   - 每个概念拥有独立的接口
//   - 可空字段显式标记
//   - TrainingCapability 自文档化系统能力边界
// ============================================================

// ============================================================
// Dataset
// ============================================================

/**
 * 单个训练样本
 *
 * inputIds 和 targetIds 都是 token ID 序列。
 * 对于 Causal LM 预训练，targetIds === inputIds —
 * 损失函数内部处理 next-token 偏移。
 */
export interface TrainingSample {
  /** Token ID 序列 — 模型输入 */
  inputIds: number[];
  /** Token ID 序列 — 预测目标（与 inputIds 相同，loss 内部偏移） */
  targetIds: number[];
}

// ============================================================
// Training Configuration & Results
// ============================================================

/**
 * 训练配置
 *
 * learningRate 保留供未来 SGD 使用 — 当前 NoOpOptimizer 忽略它。
 */
export interface TrainingConfig {
  /** 训练 epoch 数 — 必须 > 0 */
  epochs: number;
  /** 学习率 — 保留供未来 SGD 使用，当前被 NoOpOptimizer 忽略 */
  learningRate: number;
}

/**
 * 单次损失计算结果
 *
 * loss 是所有 token 位置的平均交叉熵。
 * tokenLosses 保留每个位置的独立损失，用于检查。
 */
export interface LossResult {
  /** 平均交叉熵损失 — 越低越好 */
  loss: number;
  /** 每个 token 位置的独立损失 — tokenLosses[i] 对应位置 i */
  tokenLosses: number[];
}

// ============================================================
// Capability — 系统自文档化
// ============================================================

/**
 * 训练系统能力状态
 *
 * 诚实地声明当前系统能做什么、不能做什么。
 * gradientComputation 和 parameterUpdate 在当前版本为 false —
 * 它们需要 autograd 支持。
 *
 * 这是 MiniMind 预训练架构的"诚实报告"。
 */
export interface TrainingCapability {
  /** 前向传播 — 通过 MiniMindModel.forward() 实现 */
  forwardPass: boolean;
  /** 损失计算 — CrossEntropyLoss 纯数学实现 */
  lossCalculation: boolean;
  /** 梯度计算 — 需要 autograd（反向传播通过 Transformer 堆栈） */
  gradientComputation: boolean;
  /** 参数更新 — 需要梯度 + 参数注册表 */
  parameterUpdate: boolean;
}

// ============================================================
// Training Trace & Result
// ============================================================

/**
 * 单个 epoch 的结果记录
 */
export interface EpochResult {
  /** Epoch 索引 — 从 0 开始 */
  epoch: number;
  /** 该 epoch 的平均损失 */
  averageLoss: number;
  /** 每个样本的损失 — sampleLosses[i] 对应第 i 个样本 */
  sampleLosses: number[];
  /** 该 epoch 处理的样本数 */
  sampleCount: number;
}

/**
 * 完整的训练 Trace
 *
 * 记录 runTrainingLoop() 的完整执行过程，
 * 包括每个 epoch 的详细结果和系统能力状态。
 */
export interface TrainingTrace {
  /** 数据集样本数 */
  datasetSize: number;
  /** 每个 epoch 处理的样本数 */
  samplesPerEpoch: number;
  /** 每个 epoch 的详细结果 */
  epochResults: EpochResult[];
  /** 系统能力状态快照 */
  capability: TrainingCapability;
}

/**
 * runTrainingLoop() 的完整返回结果
 *
 * 封装了损失历史、步骤计数、能力状态和完整 trace。
 */
export interface TrainingResult {
  /** 实际运行的 epoch 数 */
  epochs: number;
  /** 每个 epoch 的平均损失 — lossHistory[i] 对应 epoch i */
  lossHistory: number[];
  /** 总前向传播步数 = epochs × samplesPerEpoch */
  steps: number;
  /** 系统能力状态 */
  capability: TrainingCapability;
  /** 完整训练 trace */
  trace: TrainingTrace;
}

// ============================================================
// Optimizer
// ============================================================

/**
 * 参数梯度 — optimizer 的输入契约
 *
 * 表示模型某一组参数的梯度。当前 NoOpOptimizer 接受但不使用。
 * 未来 autograd 支持后，这将是从反向传播到参数更新的桥梁。
 */
export interface ParameterGradient {
  /** 参数名称 — 例如 "lm_head.weights", "embedding.matrix" */
  name: string;
  /** 参数张量形状 — 例如 [vocabSize, dModel] */
  shape: number[];
  /** 梯度值 — 扁平化的一维数组，与 shape 对应 */
  values: number[];
}

/**
 * Optimizer 接口 — 参数更新的抽象契约
 *
 * 所有 optimizer 实现此接口。
 * 当前实现：NoOpOptimizer（接受梯度，不执行更新）。
 * 未来实现：SGDOptimizer、AdamWOptimizer（需要 autograd）。
 */
export interface Optimizer {
  /**
   * 使用计算出的梯度更新模型参数
   *
   * @param gradients — 参数梯度数组（空数组表示无梯度可用）
   */
  step(gradients: ParameterGradient[]): void;

  /**
   * 清零所有累积的梯度
   *
   * 在每个训练步骤开始时调用。
   */
  zeroGrad(): void;

  /** Optimizer 能力级别 */
  readonly capability: "noop" | "sgd" | "adamw";

  /** 人类可读的 optimizer 描述 — 说明当前实现状态 */
  readonly description: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/minimind/pretrain/types.ts
```

Expected: no errors (may have module resolution warnings for now — that's fine, we'll fix with index.ts later).

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/pretrain/types.ts
git commit -m "feat(pretrain): add type definitions for pretraining module"
```

---

### Task 2: Create dataset.ts — ToyDataset

**Files:**
- Create: `src/lib/minimind/pretrain/dataset.ts`

**Interfaces:**
- Consumes: `TrainingSample` from `./types`
- Produces: `ToyDataset` class with `getSamples()`, `size` getter, `Symbol.iterator`

- [ ] **Step 1: Write dataset.ts**

```typescript
// ============================================================
// MiniMind — pretrain/dataset.ts
// ============================================================
// ToyDataset — 教育用微型训练数据集
//
// 核心功能：
//   - 内置 5 句英文语料库
//   - 通过注入的 Tokenizer 将文本编码为 TrainingSample
//   - 提供迭代接口供 Pretrainer 消费
//
// 设计原则：
//   - 零外部依赖（仅依赖 MiniTokenizer 接口）
//   - Tokenizer 兼容 — 任何实现了 encode() 的 tokenizer 均可使用
//   - 过滤无效样本（空编码、超长序列）并发出警告
//   - 不可变 — 构造后样本固定
// ============================================================

import type { TrainingSample } from "./types";
import type { MiniTokenizer } from "../tokenizer/MiniTokenizer";

/**
 * 默认微型语料库
 *
 * 5 句简单英文，演示预训练数据的基本结构。
 * 每句 2-5 个 token，适合教育用途。
 */
const DEFAULT_CORPUS: readonly string[] = [
  "hello world",
  "hello minimind",
  "mini language model",
  "pretraining is fun",
  "the model learns patterns",
];

/**
 * ToyDataset — 教育用微型训练数据集
 *
 * 核心职责：
 *   持有训练样本的编码表示，提供迭代接口。
 *   不实现采样逻辑、batch 逻辑或数据增强 —
 *   这些留给 Pretrainer 或未来的 DataLoader。
 *
 * 使用方式：
 *
 * ```ts
 * const dataset = new ToyDataset(tokenizer);
 * console.log(dataset.size); // 5
 *
 * for (const sample of dataset) {
 *   // sample.inputIds → [4, 5]
 *   // sample.targetIds → [4, 5]
 * }
 * ```
 */
export class ToyDataset {
  private samples: TrainingSample[];
  private tokenizer: MiniTokenizer;

  /**
   * @param tokenizer — MiniTokenizer 实例（依赖注入）
   * @param corpus    — 可选自定义语料库（省略则使用 DEFAULT_CORPUS）
   *
   * 构造时立即编码所有文本。过滤空编码样本并发出警告。
   */
  constructor(tokenizer: MiniTokenizer, corpus?: readonly string[]) {
    this.tokenizer = tokenizer;
    const texts = corpus ?? DEFAULT_CORPUS;

    const encoded: TrainingSample[] = [];

    for (const text of texts) {
      const ids = tokenizer.encode(text);

      // 过滤空序列 — 可能由纯未知词或空文本导致
      if (ids.length === 0) {
        console.warn(
          `[ToyDataset] Skipping sample "${text}" — tokenizer produced empty encoding`
        );
        continue;
      }

      // 对于 Causal LM，targetIds 与 inputIds 相同 —
      // 损失函数内部处理 next-token 偏移
      encoded.push({
        inputIds: ids,
        targetIds: ids,
      });
    }

    if (encoded.length === 0) {
      throw new Error(
        "ToyDataset: all samples produced empty encodings. " +
          "Check that the tokenizer vocabulary covers the corpus words."
      );
    }

    this.samples = encoded;
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * getSamples() — 返回所有训练样本的副本
   *
   * 返回副本以防止外部修改内部状态。
   */
  getSamples(): TrainingSample[] {
    return this.samples.map((s) => ({
      inputIds: [...s.inputIds],
      targetIds: [...s.targetIds],
    }));
  }

  /**
   * size — 数据集样本数
   */
  get size(): number {
    return this.samples.length;
  }

  /**
   * [Symbol.iterator] — 使 ToyDataset 可迭代
   *
   * 支持 for...of 循环，每次迭代返回一个 TrainingSample 的副本。
   */
  [Symbol.iterator](): Iterator<TrainingSample> {
    let index = 0;
    const items = this.samples;

    return {
      next(): IteratorResult<TrainingSample> {
        if (index >= items.length) {
          return { value: undefined, done: true };
        }
        const sample = items[index];
        index++;
        return {
          value: {
            inputIds: [...sample.inputIds],
            targetIds: [...sample.targetIds],
          },
          done: false,
        };
      },
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/minimind/pretrain/dataset.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/pretrain/dataset.ts
git commit -m "feat(pretrain): add ToyDataset with built-in corpus"
```

---

### Task 3: Create loss.ts — CrossEntropyLoss

**Files:**
- Create: `src/lib/minimind/pretrain/loss.ts`

**Interfaces:**
- Consumes: `LossResult` from `./types`
- Produces: `CrossEntropyLoss` class with `forward()` and `forwardBatch()`

- [ ] **Step 1: Write loss.ts**

```typescript
// ============================================================
// MiniMind — pretrain/loss.ts
// ============================================================
// CrossEntropyLoss — 教育用交叉熵损失函数
//
// 核心功能：
//   - 从 logits 和 target token IDs 计算交叉熵损失
//   - 纯数学实现 — 零模型依赖，零外部依赖
//   - 逐 token 损失可检查
//
// 公式：
//   对每个位置 i：
//     p = softmax(logits[i])           — 概率分布
//     tokenLoss[i] = -log(p[target[i]]) — 负对数似然
//     loss = mean(tokenLoss)            — 平均
//
// 使用方式：
//   const lossFn = new CrossEntropyLoss();
//   const result = lossFn.forward(logits, targetIds);
//   // result.loss → 平均交叉熵
//   // result.tokenLosses → [每个位置的独立损失]
// ============================================================

import type { LossResult } from "./types";

/**
 * CrossEntropyLoss — 教育用交叉熵损失
 *
 * 核心职责：
 *   实现 logits → softmax → NLL → mean 的完整损失计算。
 *   不依赖模型、optimizer 或 dataset。
 *
 * 教育设计：
 *   - 每步计算显式展开 — softmax 不是黑盒
 *   - 数值稳定 — 使用 log-sum-exp trick 防止溢出
 *   - 逐 token 损失保留 — 可检查每个位置的预测质量
 */
export class CrossEntropyLoss {
  /**
   * forward(logits, targetIds) — 计算单个样本的交叉熵损失
   *
   * 算法：
   *   1. 对每个位置 i（除最后一个 — causal shift）：
   *      a. 从 logits[i] 计算 softmax → 概率分布
   *      b. 取 targetIds[i+1] 对应的负对数概率
   *   2. 对所有位置取平均
   *
   * Causal Shift 说明：
   *   在 Causal LM 中，位置 i 的 logits 预测位置 i+1 的 token。
   *   因此 logits[i] 的目标是 targetIds[i+1]。
   *   最后一个位置的 logits 没有目标 — 它预测的是"下一个"token。
   *
   * @param logits    — [seqLen, vocabSize] 模型输出（未归一化分数）
   * @param targetIds — [seqLen] 目标 token ID 序列
   * @returns            { loss, tokenLosses }
   *
   * 示例：
   *   const logits = [[0.1, 2.0, -1.0], [1.5, -0.5, 0.8], [0.2, 0.2, 3.0]];
   *   const targets = [1, 2, 0];
   *   const result = lossFn.forward(logits, targets);
   *   // result.loss → 平均交叉熵
   *   // result.tokenLosses.length → 2（seqLen-1，因为 causal shift）
   */
  forward(logits: number[][], targetIds: number[]): LossResult {
    if (logits.length === 0) {
      throw new Error("CrossEntropyLoss.forward: logits array is empty");
    }
    if (targetIds.length === 0) {
      throw new Error("CrossEntropyLoss.forward: targetIds array is empty");
    }
    if (logits.length !== targetIds.length) {
      throw new Error(
        `CrossEntropyLoss.forward: logits length (${logits.length}) ` +
          `must equal targetIds length (${targetIds.length})`
      );
    }

    // Causal shift: logits[i] 预测 targetIds[i+1]
    // 因此只有 seqLen-1 个有效预测位置
    const numPredictions = logits.length - 1;
    if (numPredictions <= 0) {
      throw new Error(
        "CrossEntropyLoss.forward: sequence too short " +
          `(length ${logits.length}), need at least 2 tokens for causal prediction`
      );
    }

    const tokenLosses: number[] = new Array(numPredictions);

    for (let i = 0; i < numPredictions; i++) {
      const logitRow = logits[i];
      const target = targetIds[i + 1]; // causal shift: predict next token

      if (target < 0 || target >= logitRow.length) {
        throw new Error(
          `CrossEntropyLoss.forward: target token ID ${target} ` +
            `out of range [0, ${logitRow.length - 1}] at position ${i}`
        );
      }

      // ── 数值稳定的 softmax + NLL ──
      // standard: -log(exp(logit[target]) / sum(exp(logits)))
      // stable:   -(logit[target] - logSumExp)
      const logSumExp = this.logSumExp(logitRow);
      const targetLogit = logitRow[target];

      tokenLosses[i] = -(targetLogit - logSumExp);
    }

    // 平均损失
    const loss =
      tokenLosses.reduce((sum, l) => sum + l, 0) / tokenLosses.length;

    return { loss, tokenLosses };
  }

  /**
   * forwardBatch(logitsBatch, targetIdsBatch) — 批量计算损失
   *
   * 对 batch 中每个样本调用 forward()，然后取平均。
   *
   * @param logitsBatch    — [batchSize][seqLen][vocabSize]
   * @param targetIdsBatch — [batchSize][seqLen]
   * @returns                 { loss: 平均损失, tokenLosses: 所有 token 损失 }
   */
  forwardBatch(
    logitsBatch: number[][][],
    targetIdsBatch: number[][]
  ): LossResult {
    if (logitsBatch.length === 0) {
      throw new Error("CrossEntropyLoss.forwardBatch: logitsBatch is empty");
    }
    if (logitsBatch.length !== targetIdsBatch.length) {
      throw new Error(
        `CrossEntropyLoss.forwardBatch: batch size mismatch — ` +
          `logitsBatch has ${logitsBatch.length} samples, ` +
          `targetIdsBatch has ${targetIdsBatch.length} samples`
      );
    }

    const allTokenLosses: number[] = [];

    for (let b = 0; b < logitsBatch.length; b++) {
      const result = this.forward(logitsBatch[b], targetIdsBatch[b]);
      allTokenLosses.push(...result.tokenLosses);
    }

    const loss =
      allTokenLosses.length > 0
        ? allTokenLosses.reduce((sum, l) => sum + l, 0) / allTokenLosses.length
        : 0;

    return { loss, tokenLosses: allTokenLosses };
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * logSumExp(values) — 数值稳定的 log(Σ exp(x_i))
   *
   * 使用 log-sum-exp trick：
   *   logSumExp = max + log(Σ exp(x_i - max))
   *
   * 这防止了 exp 对大值溢出。
   */
  private logSumExp(values: number[]): number {
    const maxVal = Math.max(...values);
    const sum = values.reduce((acc, v) => acc + Math.exp(v - maxVal), 0);
    return maxVal + Math.log(sum);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/minimind/pretrain/loss.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/pretrain/loss.ts
git commit -m "feat(pretrain): add CrossEntropyLoss with causal shift"
```

---

### Task 4: Create optimizer.ts — Optimizer Interface + NoOpOptimizer

**Files:**
- Create: `src/lib/minimind/pretrain/optimizer.ts`

**Interfaces:**
- Consumes: `Optimizer`, `ParameterGradient` from `./types`
- Produces: `NoOpOptimizer` class, `FutureSGDOptimizer` class

- [ ] **Step 1: Write optimizer.ts**

```typescript
// ============================================================
// MiniMind — pretrain/optimizer.ts
// ============================================================
// Optimizer 抽象 — 参数更新的接口与实现
//
// 当前状态：
//   - Optimizer 接口：定义 step() / zeroGrad() 契约
//   - NoOpOptimizer：接受梯度，不执行更新（当前实现）
//   - FutureSGDOptimizer：文档占位（未来 autograd 支持后激活）
//
// 设计原则：
//   - 接口与实现分离 — Pretrainer 依赖 Optimizer 接口
//   - 诚实 — NoOpOptimizer 明确声明"梯度更新待 autograd"
//   - 可扩展 — 未来添加 SGD/AdamW 只需新增实现类
//
// 训练循环已实现，梯度更新待 autograd。
// ============================================================

import type { Optimizer, ParameterGradient } from "./types";

/**
 * NoOpOptimizer — 当前实现：接受梯度但不更新参数
 *
 * 这是 MiniMind 预训练架构中的"梯度边界"。
 * 训练循环完整运行：dataset → forward → loss → (here) → record。
 * optimizer.step() 被显式调用但 intentionally empty —
 * 参数更新需要 autograd 支持，当前不可用。
 *
 * 当 autograd 支持就绪后：
 *   1. 实现反向传播（链式法则通过 Transformer/Attention/FFN）
 *   2. 创建参数注册表（按名称访问模型权重）
 *   3. 将 NoOpOptimizer 替换为 FutureSGDOptimizer
 *
 * 使用方式：
 *
 * ```ts
 * const optimizer = new NoOpOptimizer();
 * // optimizer.capability → "noop"
 * // optimizer.description → "Training loop implemented, gradient update pending autograd."
 * ```
 */
export class NoOpOptimizer implements Optimizer {
  readonly capability = "noop" as const;

  readonly description =
    "NoOpOptimizer: gradient accumulation and parameter updates are not yet implemented. " +
    "This optimizer accepts gradients via step() but performs no weight modification. " +
    "The training loop runs end-to-end — forward pass and loss calculation are real — " +
    "but parameters remain unchanged across epochs. " +
    "Replace with FutureSGDOptimizer once autograd support is added to MiniMind.";

  /**
   * step(gradients) — 接受梯度但不执行更新
   *
   * 当前 intentionally empty — 这是未来 autograd 的集成点。
   * 当梯度计算就绪后，此方法将：
   *   1. 对每个 ParameterGradient 应用学习率衰减
   *   2. 从参数注册表查找对应权重
   *   3. 执行 W = W - lr * gradient 更新
   *
   * @param gradients — 梯度数组（当前为空，未来由 autograd 填充）
   */
  step(gradients: ParameterGradient[]): void {
    // Intentionally empty — gradient application pending autograd support.
    // This is the documented integration point for future backpropagation.
    // When gradients become available:
    //   for (const g of gradients) {
    //     const weights = parameterRegistry.get(g.name);
    //     for (let i = 0; i < g.values.length; i++) {
    //       weights[i] -= learningRate * g.values[i];
    //     }
    //   }
  }

  /**
   * zeroGrad() — 清零梯度累积
   *
   * 当前 intentionally empty — 没有梯度缓冲区需要清零。
   * 未来实现将重置所有参数的 .grad 字段。
   */
  zeroGrad(): void {
    // Intentionally empty — no gradient buffers exist yet.
    // When autograd is added, this will reset all parameter gradients to zero
    // before each training step.
  }
}

/**
 * FutureSGDOptimizer — SGD optimizer 的文档占位
 *
 * 此类当前未实作 — 它作为未来路径的文档存在。
 * 当以下先决条件满足后即可激活：
 *
 * 先决条件：
 *   1. Autograd 引擎 — 链式法则反向传播通过 Transformer 堆栈
 *      - dLoss/dLogits → dLogits/dHidden → dHidden/dAttention → ...
 *   2. 参数注册表 — 按名称注册和访问模型参数
 *      - "lm_head.weights"   → [vocabSize, dModel]
 *      - "embedding.matrix"  → [vocabSize, dModel]
 *      - "transformer.N.attn.q_proj" → [dModel, dModel]
 *      - ...
 *   3. 学习率调度 — 可选，warmup + cosine decay
 *
 * 预期 API（与 NoOpOptimizer 相同的 Optimizer 接口）：
 *
 * ```ts
 * class FutureSGDOptimizer implements Optimizer {
 *   readonly capability = "sgd";
 *   readonly description = "SGD with momentum and weight decay";
 *
 *   constructor(
 *     private registry: ParameterRegistry,
 *     private config: { lr: number; momentum?: number; weightDecay?: number }
 *   ) {}
 *
 *   step(gradients: ParameterGradient[]): void {
 *     for (const g of gradients) {
 *       const param = this.registry.get(g.name);
 *       for (let i = 0; i < g.values.length; i++) {
 *         // velocity[i] = momentum * velocity[i] - lr * g.values[i];
 *         // param[i] += velocity[i] - lr * weightDecay * param[i];
 *       }
 *     }
 *   }
 *
 *   zeroGrad(): void {
 *     this.registry.zeroAllGradients();
 *   }
 * }
 * ```
 *
 * 未来也计划添加：
 *   - AdamWOptimizer — 更高级的自适应优化器
 *   - 梯度裁剪 — 防止梯度爆炸
 *   - 混合精度训练（可选）
 */
export class FutureSGDOptimizer implements Optimizer {
  readonly capability = "sgd" as const;

  readonly description =
    "FutureSGDOptimizer: placeholder for future SGD implementation. " +
    "Requires autograd engine, parameter registry, and gradient computation. " +
    "Currently wired as documentation only — use NoOpOptimizer for the running training loop.";

  /**
   * @param _lr — Learning rate (currently unused — placeholder)
   */
  constructor(_lr: number) {
    // Placeholder constructor — accepts learning rate for future use.
    // Not wired into Pretrainer; exists as API documentation.
  }

  step(_gradients: ParameterGradient[]): void {
    throw new Error(
      "FutureSGDOptimizer.step() is not implemented. " +
        "This class exists as documentation for the future SGD path. " +
        "Use NoOpOptimizer for the current training loop."
    );
  }

  zeroGrad(): void {
    throw new Error(
      "FutureSGDOptimizer.zeroGrad() is not implemented. " +
        "Use NoOpOptimizer for the current training loop."
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/minimind/pretrain/optimizer.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/pretrain/optimizer.ts
git commit -m "feat(pretrain): add Optimizer interface, NoOpOptimizer, and FutureSGDOptimizer placeholder"
```

---

### Task 5: Create Pretrainer.ts — Training Loop Orchestrator

**Files:**
- Create: `src/lib/minimind/pretrain/Pretrainer.ts`

**Interfaces:**
- Consumes: `MiniMindModel` from `../model/MiniMindModel`, `ToyDataset` from `./dataset`, `CrossEntropyLoss` from `./loss`, `Optimizer` + `TrainingConfig` + `TrainingResult` + `TrainingCapability` from `./types`
- Produces: `Pretrainer` class with `runTrainingLoop()` and `getCapability()`

- [ ] **Step 1: Write Pretrainer.ts**

```typescript
// ============================================================
// MiniMind — pretrain/Pretrainer.ts
// ============================================================
// Pretrainer — 预训练循环编排器
//
// 核心功能：
//   将 MiniMindModel、ToyDataset、CrossEntropyLoss、Optimizer
//   组合成完整的预训练循环：dataset → forward → loss → (gradient boundary) → record
//
// 设计原则：
//   - 依赖注入 — 模型、数据集、optimizer 全部由外部提供
//   - 只使用模型的公开 API — 不访问内部参数
//   - 显式梯度边界 — optimizer.step/zeroGrad 被调用但当前为 no-op
//   - 完整的 trace — 每个 epoch、每个样本的损失被记录
//   - 诚实命名 — runTrainingLoop() 而非 train()
//
// 使用方式：
//
// ```ts
// const pretrainer = new Pretrainer(model, dataset, optimizer);
// const result = pretrainer.runTrainingLoop({ epochs: 5, learningRate: 0.01 });
// // result.lossHistory → [2.31, 2.31, 2.31, 2.31, 2.31]（权重不变，损失恒定）
// // result.capability.gradientComputation → false
// ```
//
// 教育重点：
//   - 展示完整的训练循环结构，不含虚假的权重更新
//   - 损失计算是真实的 — 只是参数不改变
//   - TrainingCapability 自文档化系统边界
//   - 当 autograd 就绪时，只需替换 optimizer 即可激活真实训练
// ============================================================

import type { MiniMindModel } from "../model/MiniMindModel";
import { ToyDataset } from "./dataset";
import { CrossEntropyLoss } from "./loss";
import { NoOpOptimizer } from "./optimizer";
import type {
  Optimizer,
  TrainingConfig,
  TrainingResult,
  TrainingCapability,
  TrainingTrace,
  EpochResult,
} from "./types";

/**
 * Pretrainer — 预训练循环编排器
 *
 * 核心职责：
 *   作为组合根，编排 epoch 循环、前向传播、
 *   损失计算和 optimizer 交互。不拥有任何模型参数 —
 *   参数管理由未来的 ParameterRegistry 负责。
 *
 * 当前架构：
 *   - 前向传播 → 通过 MiniMindModel.forward()（公开 API）
 *   - 损失计算 → CrossEntropyLoss.forward()（纯数学）
 *   - 参数更新 → NoOpOptimizer.step([])（显式 no-op）
 *
 * 未来路径：
 *   - 添加 autograd → 梯度变得可用
 *   - 替换 NoOpOptimizer 为 FutureSGDOptimizer
 *   - 参数开始实际更新 → 损失随 epoch 下降
 */
export class Pretrainer {
  private model: MiniMindModel;
  private dataset: ToyDataset;
  private optimizer: Optimizer;
  private lossFn: CrossEntropyLoss;

  /**
   * @param model     — MiniMindModel 实例（依赖注入，只读）
   * @param dataset   — ToyDataset 实例（依赖注入）
   * @param optimizer — Optimizer 实例（依赖注入，默认 NoOpOptimizer）
   *
   * 构造时立即：
   *   1. 持有所有依赖的引用（不复制）
   *   2. 创建 CrossEntropyLoss 实例
   *
   * 注意：Pretrainer 不访问 model 的内部参数。
   * 它仅通过 model.forward() 公共 API 与模型交互。
   */
  constructor(
    model: MiniMindModel,
    dataset: ToyDataset,
    optimizer?: Optimizer
  ) {
    this.model = model;
    this.dataset = dataset;
    this.optimizer = optimizer ?? new NoOpOptimizer();
    this.lossFn = new CrossEntropyLoss();
  }

  // ============================================================
  // 公开 API — 训练循环
  // ============================================================

  /**
   * runTrainingLoop(config) — 执行完整的训练循环
   *
   * 算法：
   *   1. 验证 config（epochs > 0）
   *   2. 对每个 epoch：
   *      a. 遍历 dataset 中的每个样本：
   *         - 将 inputIds 解码为文本（通过 model.tokenizer.decode()）
   *         - 调用 model.forward({ inputText }) → logits, trace
   *         - 调用 lossFn.forward(logits, targetIds) → loss
   *         - 调用 optimizer.zeroGrad() → no-op
   *         - 调用 optimizer.step([]) → no-op（空梯度）
   *         - 记录样本损失
   *      b. 计算 epoch 平均损失
   *      c. 追加到损失历史
   *   3. 构建并返回 TrainingResult
   *
   * 为什么损失不下降？
   *   optimizer 当前是 NoOpOptimizer — 参数不更新。
   *   因此相同输入 → 相同 logits → 相同损失每 epoch。
   *   这是正确的、诚实的行为。
   *   TrainingResult.capability.gradientComputation = false 说明了原因。
   *
   * @param config — { epochs, learningRate }
   * @returns         TrainingResult with lossHistory, capability, trace
   */
  runTrainingLoop(config: TrainingConfig): TrainingResult {
    if (config.epochs <= 0) {
      throw new Error(
        `runTrainingLoop: epochs must be positive, got ${config.epochs}`
      );
    }

    const samples = this.dataset.getSamples();
    const epochResults: EpochResult[] = [];
    const lossHistory: number[] = [];
    let totalSteps = 0;

    for (let epoch = 0; epoch < config.epochs; epoch++) {
      const sampleLosses: number[] = [];

      for (let s = 0; s < samples.length; s++) {
        const sample = samples[s];

        // ── Step 0: Optimizer zero-grad ──
        // 在每个样本前清零梯度（当前为 no-op）
        this.optimizer.zeroGrad();

        // ── Step 1: 将 token IDs 解码为文本 ──
        // 通过 model 的公开 API（getTokenizer）获取 tokenizer
        // 注意：我们不直接访问 model 内部的 tokenizer 引用 —
        // 使用 getTokenizer() 是 MiniMindModel 的公开 API
        const tokenizer = this.model.getTokenizer();
        const inputText = tokenizer.decode(sample.inputIds);

        // ── Step 2: 前向传播 ──
        // 这是 MiniMindModel 唯一的公开交互点
        const output = this.model.forward({ inputText });

        // ── Step 3: 损失计算 ──
        // 从 model trace 获取完整的 [seqLen, vocabSize] logits
        // trace.hiddenStates 是所有位置的 hidden states
        // 我们需要对每个位置应用 LM Head 获取 logits
        const lmHead = this.model.getLMHead();
        const allLogits = lmHead.forward(output.hiddenStates);

        // CrossEntropyLoss 内部处理 causal shift
        const lossResult = this.lossFn.forward(allLogits, sample.targetIds);

        sampleLosses.push(lossResult.loss);

        // ── Step 4: Optimizer step ──
        // 当前为 no-op — 这是梯度边界
        // 未来当 autograd 就绪后，这里将传入真实梯度
        this.optimizer.step([]);

        totalSteps++;
      }

      // ── Epoch 统计 ──
      const averageLoss =
        sampleLosses.length > 0
          ? sampleLosses.reduce((sum, l) => sum + l, 0) / sampleLosses.length
          : 0;

      lossHistory.push(averageLoss);

      epochResults.push({
        epoch,
        averageLoss,
        sampleLosses: [...sampleLosses],
        sampleCount: sampleLosses.length,
      });
    }

    // ── 构建结果 ──
    const capability = this.getCapability();

    const trace: TrainingTrace = {
      datasetSize: samples.length,
      samplesPerEpoch: samples.length,
      epochResults,
      capability,
    };

    return {
      epochs: config.epochs,
      lossHistory,
      steps: totalSteps,
      capability,
      trace,
    };
  }

  /**
   * getCapability() — 返回当前训练系统的能力状态
   *
   * 返回 TrainingCapability 快照，诚实地报告：
   *   - forwardPass: true（通过 MiniMindModel）
   *   - lossCalculation: true（CrossEntropyLoss 纯数学）
   *   - gradientComputation: false（需要 autograd）
   *   - parameterUpdate: false（取决于梯度和参数注册表）
   *
   * 当 autograd 和 parameter registry 就绪后，
   * gradientComputation 和 parameterUpdate 将变为 true。
   */
  getCapability(): TrainingCapability {
    return {
      forwardPass: true,
      lossCalculation: true,
      gradientComputation: false,
      parameterUpdate: false,
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
   * getDataset() — 获取注入的 ToyDataset 实例
   */
  getDataset(): ToyDataset {
    return this.dataset;
  }

  /**
   * getOptimizer() — 获取注入的 Optimizer 实例
   */
  getOptimizer(): Optimizer {
    return this.optimizer;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/minimind/pretrain/Pretrainer.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/pretrain/Pretrainer.ts
git commit -m "feat(pretrain): add Pretrainer with runTrainingLoop orchestrator"
```

---

### Task 6: Create index.ts — Barrel Export

**Files:**
- Create: `src/lib/minimind/pretrain/index.ts`

**Interfaces:**
- Consumes: all exports from `./types`, `./dataset`, `./loss`, `./optimizer`, `./Pretrainer`
- Produces: unified barrel export for `src/lib/minimind/pretrain/`

- [ ] **Step 1: Write index.ts**

```typescript
// ============================================================
// MiniMind — pretrain/index.ts
// ============================================================
// Pretrain 模块统一导出入口
//
// 导出所有公开类型和类。
// 当前不从主 minimind/index.ts 导出 — 预训练模块为独立消费者。
// ============================================================

// ── Types ──
export type {
  TrainingSample,
  TrainingConfig,
  LossResult,
  TrainingCapability,
  EpochResult,
  TrainingTrace,
  TrainingResult,
  ParameterGradient,
  Optimizer,
} from "./types";

// ── Dataset ──
export { ToyDataset } from "./dataset";

// ── Loss ──
export { CrossEntropyLoss } from "./loss";

// ── Optimizer ──
export { NoOpOptimizer, FutureSGDOptimizer } from "./optimizer";

// ── Pretrainer ──
export { Pretrainer } from "./Pretrainer";
```

- [ ] **Step 2: Verify full module compiles**

```bash
npx tsc --noEmit src/lib/minimind/pretrain/index.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/pretrain/index.ts
git commit -m "feat(pretrain): add barrel export for pretrain module"
```

---

### Task 7: Validation — Full Build

**Files:**
- Verify: all files created in Tasks 1-6

- [ ] **Step 1: Run full project build**

```bash
npm run build
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Verify all files exist**

```bash
ls -la src/lib/minimind/pretrain/
```

Expected output shows 6 files: `types.ts`, `dataset.ts`, `loss.ts`, `optimizer.ts`, `Pretrainer.ts`, `index.ts`

- [ ] **Step 3: Verify no existing files were modified**

```bash
git status -- src/lib/minimind/
```

Expected: only files under `src/lib/minimind/pretrain/` show as new/untracked. No modifications to existing minimind files.

- [ ] **Step 4: Final commit (if any build fixes needed)**

```bash
git add src/lib/minimind/pretrain/
git commit -m "feat(minimind): add pretraining foundation layer"
```

---

## Completion Report Template

After all tasks complete, the report should include:

1. **Created files** — list of all 6 files with brief descriptions
2. **Architecture explanation** — dataset → forward → loss → gradient boundary → record
3. **What is implemented** — dataset, forward pass, loss, epoch loop, loss history, training trace, capability reporting
4. **What requires autograd/backprop support later** — gradient computation, parameter update, real weight modification
5. **Build result** — `npm run build` output
