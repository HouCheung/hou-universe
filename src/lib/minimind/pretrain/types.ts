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
