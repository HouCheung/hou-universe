# Transformer

## Purpose

Transformer Block 将 Attention、FFN、Layer Normalization 和 Residual Connection 组合成一个完整的计算单元。多个 Block 堆叠起来形成 Deep Transformer，构成现代 LLM 的主体架构。

MiniMind 的 Transformer 采用 Pre-Norm 结构（LayerNorm 在 Attention/FFN 之前），这是当前主流 LLM（GPT、Llama）的选择。

## Input

- Hidden States：`[batch_size, seq_len, d_model]`
- 可选：Attention Mask

## Output

- Transformed Hidden States：`[batch_size, seq_len, d_model]`

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `TransformerBlock` | — | 单个 Transformer 层（Attention + FFN） |
| `Transformer` | — | 完整 Transformer 模型 |

## Core Functions

| Function | Description |
|----------|-------------|
| `forward(x, mask?)` | 单个 Block 前向传播 |
| `pre_norm(x)` | Pre-Norm 的 LayerNorm |
| `residual_connect(x, sublayer_output)` | 残差连接 |

## Learning Notes

> 记录 Post-Norm vs Pre-Norm 的对比、LayerNorm vs RMSNorm、残差连接为什么能训练更深的网络、Dropout 在 Transformer 中的位置和作用。

## Questions

- [ ] Pre-Norm 为什么比 Post-Norm 更稳定？
- [ ] RMSNorm 相比 LayerNorm 去掉了什么？为什么可行？
- [ ] 残差连接的梯度流如何帮助深层网络训练？
- [ ] Encoder-Decoder 结构与 Decoder-Only 结构的本质区别是什么？
- [ ] MiniMind 的 Transformer 架构更接近哪个公开模型（GPT/Llama/Qwen）？

## TODO

- [ ] 阅读 MiniMind Transformer 源码，添加逐行注释
- [ ] 绘制完整的 Transformer Block 数据流图（Mermaid）
- [ ] 实验：对比 Pre-Norm 和 Post-Norm 的训练曲线
- [ ] 实验：验证不同层数的梯度范数分布
- [ ] 实验：分析各层输出的相似度（层间表示分析）
