# RoPE（Rotary Position Embedding）

## Purpose

RoPE（旋转位置编码）是当前主流 LLM（Llama、Qwen、Mistral）采用的位置编码方案。它通过旋转矩阵将位置信息注入 token 表示，使得 attention 计算中的内积天然包含相对位置信息。

RoPE 的核心思想：将 Query 和 Key 向量的每两个维度视为一个 2D 平面上的点，按位置角度进行旋转。旋转后的 Q·K^T 只依赖于相对位置差 (m - n)，而非绝对位置。

## Input

- Query / Key 向量：`[batch_size, num_heads, seq_len, head_dim]`
- 位置索引：`[seq_len]`
- 旋转频率基数（theta）：通常为 10000.0

## Output

- 应用旋转后的 Query / Key 向量（同维度）

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `RotaryEmbedding` | — | RoPE 实现，预计算频率并应用旋转 |

## Core Functions

| Function | Description |
|----------|-------------|
| `precompute_freqs_cis(dim, max_seq_len, theta)` | 预计算复数的旋转频率表 |
| `apply_rotary_emb(xq, xk, freqs_cis)` | 对 Q/K 应用旋转位置编码 |

## Learning Notes

> 记录 RoPE 的数学推导（复数旋转 → 二维旋转矩阵）、与 Sinusoidal Position Encoding 的对比、NTK-Aware 等扩展方案。

## Questions

- [ ] RoPE 为什么比可学习的绝对位置编码更好？
- [ ] 旋转频率基数 theta 的选择有何影响？
- [ ] RoPE 如何实现长文本外推（NTK-Aware Scaling、YaRN）？
- [ ] 为什么只对 Q 和 K 应用 RoPE，而不对 V 应用？

## TODO

- [ ] 阅读 MiniMind RoPE 源码，添加逐行注释
- [ ] 手写 RoPE 旋转矩阵的数学推导
- [ ] 实验：可视化不同位置的 Q/K 旋转
- [ ] 实验：对比不同 theta 值下的长文本注意力衰减模式
