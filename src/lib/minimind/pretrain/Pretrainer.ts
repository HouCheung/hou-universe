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
