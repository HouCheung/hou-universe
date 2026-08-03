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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_lr: number) {
    // Placeholder constructor — accepts learning rate for future use.
    // Not wired into Pretrainer; exists as API documentation.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
