# FFN（Feed-Forward Network）

## Purpose

FFN 是 Transformer 中每个 block 的第二大组件，位于 Attention 层之后。它通过两个线性变换和一个非线性激活函数实现 token-level 的特征变换。

Attention 负责"聚合信息"（token 之间的交互），FFN 负责"加工信息"（每个 token 内部的非线性变换）。两者互补，共同构成 Transformer Block 的完整能力。

MiniMind 使用 SwiGLU 激活的 FFN 变体，相比传统的 ReLU-FFN 有更好的训练稳定性和模型质量。

## Input

- Attention 输出：`[batch_size, seq_len, d_model]`

## Output

- FFN 输出：`[batch_size, seq_len, d_model]`

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `FeedForward` | — | 标准 FFN（两个线性层 + 激活函数） |
| `SwiGLUFFN` | — | SwiGLU 激活的 FFN 变体（三个线性层） |

## Core Functions

| Function | Description |
|----------|-------------|
| `forward(x)` | FFN 前向传播 |
| `swiglu(x)` | SwiGLU 激活函数计算 |

## Learning Notes

> 记录 FFN 在 Transformer 中的角色定位、ReLU vs GELU vs SwiGLU 的对比、FFN 中间层维度（d_ff）的选择规律、MoE（Mixture of Experts）如何将 FFN 扩展为多专家系统。

## Questions

- [ ] 为什么 FFN 的中间维度通常是 d_model 的 4 倍？
- [ ] SwiGLU 相比 ReLU 的优势是什么？（从梯度和表达能力角度）
- [ ] FFN 是否可以被其他结构替代？（如 MoE）
- [ ] Attention 和 FFN 的顺序能否调换？

## TODO

- [ ] 阅读 MiniMind FFN 源码，添加逐行注释
- [ ] 实验：对比 ReLU、GELU、SwiGLU 的激活分布
- [ ] 实验：探索不同 d_ff 比例对模型性能的影响
- [ ] 实验：分析 FFN 层的参数占比
