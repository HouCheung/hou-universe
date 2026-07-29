# FFN（Feed-Forward Network）

> **Source Reference:** FFN module metadata (version definitions, dimension configs,
> concept catalog, and experiment list) is maintained in `src/data/minimind/ffn-registry.ts`.
> This file is the canonical source; all consumers derive their data from it.

## Purpose

Feed-Forward Network（前馈神经网络）是 Transformer Block 的第二个核心组件。在 Attention 层完成 token 之间的**信息交互**（"谁关注谁"）之后，FFN 对每个 token 进行**独立的信息变换**（"每个 token 学到了什么"）。

Attention 负责"通信"——让 token 之间交换信息；FFN 负责"计算"——对每个 token 的表示进行非线性变换，增强模型的表达能力。

在 MiniMind 中，FFN 位于 Attention + 残差连接 + LayerNorm 之后，是每个 Decoder Block 的最后一个计算步骤。

## Input

- 输入矩阵：`[seqLen, dModel]` — 经过 Attention + 残差 + LayerNorm 的 token 表示
- 每个 token 独立处理（position-wise），token 之间没有交互

## Output

- 输出矩阵：`[seqLen, dModel]` — 与输入同形状，可直接接入残差连接
- Activation Trace：包含 gate projection、activation、element-wise multiply、output projection 的完整中间结果

## Core Concepts

### 1. 为什么 Transformer 需要 FFN

**Attention 是线性的（在 Value 聚合阶段）。**

回顾 Attention 的公式：`output = weights @ V`。这一步是纯粹的线性组合——输出是 Value 向量的加权和。虽然 Attention 通过 Q/K 的内积和 softmax 引入了非线性（在权重计算中），但最终输出对 V 是线性的。

**FFN 引入必要的非线性变换。**

如果只有 Attention 层堆叠，模型本质上是一个"加权平均器"——它能决定关注哪些 token，但不能对关注到的信息进行复杂的变换。FFN 通过激活函数（SiLU/GELU/ReLU）引入非线性，使模型能够学习复杂的特征映射。

**一个直觉类比：**

| 组件 | 角色 | 类比 |
|------|------|------|
| **Attention** | 信息路由 | 会议中每个人决定听谁说话 |
| **FFN** | 信息处理 | 每个人独立思考和消化听到的内容 |
| **LayerNorm** | 信息规范化 | 确保每个人在同一音量水平交流 |
| **Residual** | 信息保留 | 记住原始信息，防止在处理过程中丢失 |

### 2. Attention 与 FFN 的区别

| 维度 | Attention | FFN |
|------|-----------|-----|
| **交互模式** | Token → Token（跨 token 交互） | Token-wise（每个 token 独立） |
| **计算复杂度** | O(L² · d)（平方于序列长度） | O(L · d · d_ff)（线性于序列长度） |
| **参数量** | 4 × d²（Q/K/V/O 投影） | 3 × d × d_ff（Gate/Up/Down 投影） |
| **核心操作** | 内积 + Softmax + 加权和 | 线性投影 + 非线性激活 + 门控 |
| **信息流** | 混合不同位置的信息 | 变换每个位置的表示 |
| **直觉** | "谁说了什么相关的话" | "如何理解和转换这些信息" |

**参数分布示例（dModel=512, dFF=2048）：**

- Attention 参数：4 × 512² = 1,048,576（~1M）
- FFN 参数（SwiGLU）：3 × 512 × 2048 = 3,145,728（~3M）
- FFN 参数量大约是 Attention 的 **3 倍**
- 在 MiniMind 26M 中，FFN 占 ~65%（多层的 FFN 累积）

### 3. Position-wise Feed-Forward

**"Position-wise" 意味着对序列中的每个位置独立应用相同的变换。**

```
传统 FFN 公式：
FFN(x) = W_down @ activation(W_up @ x + b_up) + b_down
```

对于每个 token 的向量 x（shape: [dModel]）：
1. **Up Projection**：`h = W_up @ x` → 从 dModel 维扩展到 dFF 维（通常是 4 倍）
2. **Activation**：`a = activation(h)` → 非线性变换
3. **Down Projection**：`y = W_down @ a` → 从 dFF 维压缩回 dModel 维

**为什么需要扩展再压缩？**

扩展（dModel → dFF）给模型一个更高维的"思考空间"。在这个高维空间中，特征可以更容易地被分离和非线性变换。压缩（dFF → dModel）将变换后的特征投影回原始维度，确保输入输出形状一致（残差连接的要求）。

这是神经网络中经典的 **bottleneck（瓶颈）** 设计——低维 → 高维 → 低维，类似于 Autoencoder 的结构。

### 4. SwiGLU 原理

**SwiGLU（Swish-Gated Linear Unit）是当前 LLM 中使用最广泛的 FFN 激活方案。**

传统 FFN 只是一个简单的两层 MLP + 激活函数。SwiGLU 引入了一个**门控机制**，让模型学习"哪些信息应该通过，哪些应该被抑制"。

```
传统 FFN:
  y = W_down @ activation(W_up @ x)

SwiGLU FFN:
  gate = SiLU(x @ W_gate)     ← 门控信号（0~1 之间，但有负值区域）
  up   = x @ W_up             ← 候选值
  y    = gate ⊙ up            ← 门控：选择性通过
  y    = y @ W_down           ← 投影回 dModel
```

**为什么门控有效？**

门控网络的核心思想是**让模型自己决定信息的流动**。Gate 投影产生门控信号，与 Up 投影的候选值按元素相乘：

- 如果 gate[i] > 1 → 该维度的信息被**放大**
- 如果 gate[i] ≈ 1 → 该维度的信息**完全通过**
- 如果 gate[i] ≈ 0 → 该维度的信息**被抑制/阻断**
- 如果 gate[i] < 0 → 该维度的信息被**反转**

这相当于模型学会了"选择性关注"特征空间的某些维度——类似于 LSTM/GRU 中的门控机制，但应用于 FFN 层。

**三种 FFN 变体的对比：**

| 变体 | 公式 | 参数矩阵数量 | 优势 |
|------|------|------------|------|
| **Basic FFN** | `W_down @ ReLU(W_up @ x)` | 2 | 最简单，参数最少 |
| **GELU FFN** | `W_down @ GELU(W_up @ x)` | 2 | 比 ReLU 更平滑，BERT/GPT-2 使用 |
| **SwiGLU** | `(SiLU(xW_gate) ⊙ xW_up) @ W_down` | 3 | 门控机制 + 平滑激活，LLaMA 使用 |

### 5. SiLU 激活函数

**SiLU（Sigmoid Linear Unit），也称为 Swish，是 SwiGLU 的核心激活函数。**

```
SiLU(x) = x · σ(x) = x / (1 + e^(-x))
```

其中 σ(x) 是 sigmoid 函数。

**SiLU 的特性：**

- **平滑**：处处可微，梯度流畅（不像 ReLU 在 x=0 处不可导）
- **非单调**：对于 x < 0，函数先下降后上升（有一个轻微的"凹陷"）
- **自门控**：SiLU(x) = x · sigmoid(x)，可以看作"输入 x 乘以一个 0~1 的门控信号"
- **无上界、有下界**：当 x → +∞ 时，SiLU(x) → x；当 x → -∞ 时，SiLU(x) → 0

**SiLU 与其他激活函数的对比：**

| 激活函数 | 公式 | 值域 | 特点 |
|---------|------|------|------|
| **ReLU** | max(0, x) | [0, +∞) | 简单快速，x<0 时梯度为 0（死神经元） |
| **GELU** | x · Φ(x) | (~-0.17, +∞) | 平滑近似 ReLU，BERT/GPT-2 使用 |
| **SiLU/Swish** | x · σ(x) | (~-0.28, +∞) | 自门控，非单调，LLaMA 使用 |

**为什么 SwiGLU 选择 SiLU 而不是 ReLU？**

1. **平滑性**：SiLU 处处可微，梯度流动更好
2. **自门控性质**：SiLU 本身就是一种门控函数，与 GLU 的门控理念天然契合
3. **非单调性**：轻微的非单调性允许对负输入进行更精细的调节
4. **实证效果**：在 LLaMA 等模型中，SwiGLU 被证明优于 ReLU-GLU 和 GELU-GLU

### 6. Gated Linear Unit (GLU)

**GLU 是一个通用的门控线性单元框架：**

```
GLU(x) = (x @ W_1) ⊙ activation(x @ W_2)
```

- 两个并行的线性投影（W_1 和 W_2）
- 一个投影经过激活函数成为"门控信号"
- 门控信号与另一个投影按元素相乘

**GLU 的变体（取决于激活函数的选择）：**

| 变体 | 激活函数 | 使用场景 |
|------|---------|---------|
| **ReGLU** | ReLU(gate) | 基础门控 |
| **GELU-GLU** | GELU(gate) | 平滑门控 |
| **SwiGLU** | SiLU(gate) | SOTA（LLaMA, PaLM） |
| **GeGLU** | GELU(gate) | 与 GELU-GLU 相同 |

**门控的直观理解：**

想象一个信息管道：
- Up 投影产生"原始信息"
- Gate 投影（经过 SiLU）产生"阀门开度"
- 逐元素相乘 = 阀门控制每个维度的信息流量

这比传统 FFN 更灵活——模型可以学习在特定 token、特定维度上关闭信息流，而在其他维度上保持开放。

### 7. MiniMind FFN 结构

**MiniMind 使用 SwiGLU FFN，与 LLaMA 架构保持一致。**

```
MiniMind FFN 数据流：

Input: [seqLen, dModel=512]
  │
  ├──→ Gate Projection (W_gate) ──→ [seqLen, dFF=2048] ──→ SiLU ──→ gate [seqLen, 2048]
  │                                                                          │
  └──→ Up Projection   (W_up)   ──→ [seqLen, dFF=2048] ────────────────────→ ⊙ (multiply)
                                                                             │
                                                        hidden [seqLen, 2048]
                                                                             │
                                              Down Projection (W_down) ←────┘
                                                      │
                                              Output: [seqLen, dModel=512]
```

**参数配置：**

| 参数 | 值 | 说明 |
|------|-----|------|
| dModel | 512 | 输入/输出维度 |
| dFF | 2048 | 中间隐藏维度（4 × dModel） |
| 激活函数 | SiLU | SwiGLU 门控激活 |
| 门控方式 | SwiGLU | Gate ⊙ Up |
| W_gate | [dModel × dFF] = 512 × 2048 | 门控投影矩阵 |
| W_up | [dModel × dFF] = 512 × 2048 | 上投影矩阵 |
| W_down | [dFF × dModel] = 2048 × 512 | 下投影矩阵 |
| 总参数 | 3 × 512 × 2048 = 3,145,728 | ~3M per FFN layer |

**在 MiniMind Decoder Block 中的位置：**

```
DecoderBlock(x):
  # 1. Pre-Norm Attention
  attn_input = LayerNorm(x)
  attn_output = MultiHeadAttention(attn_input)
  x = x + attn_output                             # 残差连接 1

  # 2. Pre-Norm FFN
  ffn_input = LayerNorm(x)
  ffn_output = FFN(ffn_input)                     # ← FFN 在这里
  x = x + ffn_output                              # 残差连接 2

  return x
```

---

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `MiniFeedForward` | `src/lib/minimind/ffn/FeedForward.ts` | SwiGLU FFN 主类，封装 Gate/Up/Down 投影、SiLU 激活、门控乘法 |
| `FFNRegistry` | `src/data/minimind/ffn-registry.ts` | FFN 模块元数据注册表 — 版本定义、概念目录、实验清单 |

## Core Functions

| Function | Description |
|----------|-------------|
| `linear(input, weight)` | 线性变换：y = xW |
| `silu(x)` | SiLU 激活：x · sigmoid(x) |
| `multiplyGate(gate, up)` | 门控逐元素乘法：gate_i × up_i |
| `swiGLU(x, W_gate, W_up)` | 完整 SwiGLU：SiLU(xW_gate) ⊙ (xW_up) |
| `matrixMultiply(A, B)` | 矩阵乘法：C[i][j] = Σ A[i][k] × B[k][j] |
| `forward(input)` | MiniFeedForward 完整前向传播入口 |
| `getActivationTrace()` | 获取最近一次 forward 的完整 trace |

---

## Learning Notes

> **为什么 FFN 是 Position-wise 的？**
>
> Token 之间的信息交互已经在 Attention 层完成。FFN 只负责对每个 token 的表示进行独立的非线性变换。这意味着 FFN 对序列长度是 O(L)，而 Attention 是 O(L²)。实际上，FFN 可以完全并行处理所有 token——每个 token 的 FFN 计算完全独立。
>
> **为什么 dFF 通常是 dModel 的 4 倍？**
>
> 4× 是一个经验性的设计选择。扩展倍数的选择权衡了：
> - **太小（如 1× 或 2×）**：非线性变换的"思考空间"不足，表达能力受限
> - **太大（如 8× 或 16×）**：参数过多，容易过拟合，且计算量激增
> - **4×**：在原始 Transformer 论文中提出，经过大量实践验证的"甜点"比例
>
> **SwiGLU 为什么需要 3 个投影矩阵而不是 2 个？**
>
> 传统 FFN 只有 W_up 和 W_down 两个矩阵。SwiGLU 增加了 W_gate 作为第三个矩阵——这是门控机制的代价。参数量从 2×d×dFF 增加到 3×d×dFF（增加 50%）。为了保持总参数量与原始 FFN 相当，实践中通常将 dFF 缩小为原来的 2/3（即用 3 × d × (2dFF/3) ≈ 2 × d × dFF 来匹配参数量）。但 MiniMind 为了简单和教学清晰，保持 dFF=2048（4×dModel）。
>
> **门控机制的本质：**
>
> 门控本质上是让网络学习一个 **data-dependent 的信息过滤器**。传统 FFN 对所有输入使用相同的过滤模式（固定的权重矩阵）；SwiGLU 的门控信号 `SiLU(xW_gate)` 依赖于输入 x，因此不同的 token 会有不同的门控模式——这使模型能够根据内容动态调整信息流，类似于 Attention 中的动态权重。

## Questions

- [x] 为什么 Transformer 需要 FFN？→ Attention 提供 token 间通信，FFN 提供 token 内计算和非线性变换
- [x] Attention 与 FFN 的核心区别是什么？→ Attention 跨 token 交互（O(L²)），FFN 每 token 独立（O(L)）
- [x] 什么是 Position-wise Feed-Forward？→ 对每个位置独立应用相同的变换，无跨位置交互
- [x] SwiGLU 的原理是什么？→ 门控机制：SiLU(xW_gate) ⊙ (xW_up)，选择性通过信息
- [x] SiLU 激活函数的特点？→ 平滑、自门控、非单调，是 Swish 的另一种名称
- [x] 什么是 Gated Linear Unit？→ 通用门控框架：(xW_1) ⊙ activation(xW_2)
- [ ] 为什么 dFF 通常设为 dModel 的 4 倍？（经验法则，留给实验验证）
- [ ] ReLU vs GELU vs SiLU 在 FFN 中的实际效果差异？
- [ ] 门控机制在训练和推理时的行为差异？
- [ ] FFN 是否可以被其他结构替代？（如 MoE）
- [ ] Attention 和 FFN 的顺序能否调换？（Post-Norm vs Pre-Norm）

## TODO

- [x] 创建 FFN 理论文档（本文档 — 已从 stub 扩展为完整版）
- [x] 创建 FFN SSOT Registry
- [x] 实现 MiniFeedForward 核心类（V1: SwiGLU FFN）
- [ ] 阅读 MiniMind FFN 源码，添加逐行注释
- [ ] 编写单元测试：SiLU 激活函数正确性
- [ ] 编写单元测试：SwiGLU 输出形状验证
- [ ] 编写单元测试：Gate/Up/Down 投影矩阵形状验证
- [ ] 实验：可视化不同 token 的 FFN 中间表示
- [ ] 实验：对比 ReLU vs GELU vs SiLU 激活分布
- [ ] 实验：验证门控信号在不同输入下的变化
- [ ] 实验：探索不同 d_ff 比例对模型性能的影响
