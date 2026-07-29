# Inference

## Purpose

Inference 模块使用训练好的模型进行文本生成。与训练时不同，推理使用自回归（Autoregressive）方式逐个生成 token，每次生成的 token 被拼接到输入序列中，作为下一次前向传播的输入。

MiniMind 的推理支持多种解码策略（Greedy、Temperature Sampling、Top-K、Top-P），并可能包含 KV Cache 优化以加速生成。

## Input

- Prompt 文本（用户输入）
- 生成超参数（max_new_tokens, temperature, top_k, top_p）
- 训练好的模型权重

## Output

- 生成的文本序列
- 可选：生成概率、token-level logprobs

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `Generator` | — | 文本生成控制器 |
| `Sampler` | — | 解码策略封装 |

## Core Functions

| Function | Description |
|----------|-------------|
| `generate(prompt, **kwargs)` | 完整文本生成流程 |
| `sample(logits, temperature, top_k, top_p)` | 从 logits 采样下一个 token |
| `greedy_decode(logits)` | 贪心解码（取概率最高的 token） |
| `stream_generate(prompt)` | 流式文本生成 |

## Learning Notes

> 记录自回归生成的完整流程、Temperature 如何影响生成多样性、Top-K vs Top-P 采样的区别与组合使用、KV Cache 的显存占用计算、Beam Search 的使用场景与局限。

## Questions

- [ ] 为什么推理时使用 KV Cache 比直接前向传播更快？
- [ ] Temperature = 0 和 Greedy Decoding 等价吗？
- [ ] Top-P（Nucleus Sampling）的累积概率阈值如何选择？
- [ ] 流式生成（Streaming）在前端如何实现逐 token 显示？
- [ ] 推理速度的瓶颈在哪里？（显存带宽 vs 计算量）
- [ ] 量化（INT8/INT4）如何加速推理？对生成质量影响多大？

## TODO

- [ ] 阅读 MiniMind Generator 源码，添加逐行注释
- [ ] 实验：对比不同 temperature 下的生成多样性
- [ ] 实验：测试 Top-K vs Top-P vs 组合采样的生成质量
- [ ] 实验：测量 KV Cache 对推理速度的提升
- [ ] 实验：尝试 INT8 量化并对比生成质量
