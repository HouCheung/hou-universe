# Attention

## Purpose

Self-Attention 是 Transformer 的核心引擎。它让每个 token 能够直接"关注"序列中的所有其他 token，动态计算信息聚合权重。这使得模型能够捕获长距离依赖关系，是 Transformer 超越 RNN/LSTM 的关键。

MiniMind 实现了 Multi-Head Attention（MHA）——通过多个并行的注意力头，让模型在不同的表示子空间中同时学习不同类型的依赖关系。

## Input

- Hidden States：`[batch_size, seq_len, d_model]`
- 可选：Attention Mask（用于 padding 和 causal masking）

## Output

- Attended Hidden States：`[batch_size, seq_len, d_model]`

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `MultiHeadAttention` | — | 多头注意力主模块 |
| `Attention` | — | 单头注意力计算 |

## Core Functions

| Function | Description |
|----------|-------------|
| `forward(x, mask?)` | 多头的完整前向传播 |
| `scaled_dot_product_attention(Q, K, V, mask?)` | Attention 核心计算 |
| `split_heads(x)` | 将 d_model 拆分为 num_heads × head_dim |
| `merge_heads(x)` | 将多头输出合并回 d_model |

## Learning Notes

> 记录 Attention 的数学公式（QK^T/√d_k · softmax · V）、Causal Mask 的作用与实现、MHA vs MQA vs GQA 的区别、Flash Attention 的优化原理。

## Questions

- [ ] 为什么需要除以 √d_k 进行缩放？
- [ ] 注意力头数 (num_heads) 如何影响模型的行为？
- [ ] Causal Mask 在训练和推理中的不同作用是什么？
- [ ] KV Cache 如何在推理时加速 attention 计算？
- [ ] 为什么推理时使用 GQA（Grouped Query Attention）可以减小 KV Cache？

## TODO

- [ ] 阅读 MiniMind Attention 源码，添加逐行注释
- [ ] 手写 Attention 前向传播的矩阵运算推导
- [ ] 实验：可视化 attention weights 热力图
- [ ] 实验：对比不同 num_heads 下的注意力模式
- [ ] 实验：验证 KV Cache 的加速效果
