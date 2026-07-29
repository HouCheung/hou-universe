# Training

## Purpose

Training 模块负责将 Transformer 模型在文本语料上进行训练——包括数据准备、前向传播、损失计算、反向传播、参数更新和学习率调度。

MiniMind 的训练流程涵盖预训练（Pretrain）和监督微调（SFT）两个阶段，展示了从原始模型到可用助手的完整训练管线。

## Input

- 训练数据集（预训练语料 / SFT 指令数据）
- 模型参数初始化
- 训练超参数（learning_rate, batch_size, max_steps 等）

## Output

- 训练后的模型权重（checkpoint）
- 训练指标日志（loss, perplexity, grad_norm）
- TensorBoard / WandB 可视化

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `Trainer` | — | 训练循环主控制器 |
| `Dataset` | — | 数据加载与预处理 |
| `Optimizer` | — | AdamW 优化器封装 |
| `Scheduler` | — | 学习率调度器（Cosine / Warmup） |

## Core Functions

| Function | Description |
|----------|-------------|
| `train_step(batch)` | 单步训练（forward + backward + update） |
| `evaluate(val_loader)` | 验证集评估 |
| `save_checkpoint(step)` | 保存模型检查点 |
| `load_checkpoint(path)` | 恢复训练状态 |

## Learning Notes

> 记录 AdamW 优化器原理、Cosine LR Schedule 的设计动机、Gradient Clipping 的必要性、混合精度训练（AMP）的实现、梯度累积（Gradient Accumulation）的技巧。

## Questions

- [ ] AdamW 与 Adam 的区别是什么？Weight Decay 为什么与 L2 正则化不等价？
- [ ] Warmup 阶段为什么必要？
- [ ] 梯度裁剪的阈值如何选择？
- [ ] 如何判断模型是否过拟合？（训练 loss 持续下降但验证 loss 上升）
- [ ] MiniMind 的训练数据规模是多少？与模型参数量是否匹配（Chinchilla Law）？

## TODO

- [ ] 阅读 MiniMind Trainer 源码，添加逐行注释
- [ ] 搭建本地训练环境，完成一次小规模 Pretrain
- [ ] 实验：对比不同 LR Schedule 的训练曲线
- [ ] 实验：可视化 loss landscape
- [ ] 实验：分析不同训练阶段的 attention 模式变化
