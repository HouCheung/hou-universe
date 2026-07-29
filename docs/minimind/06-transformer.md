# Transformer Block

> **Source Reference:** Transformer module metadata (version definitions, architecture configs,
> concept catalog, and experiment list) is maintained in `src/data/minimind/transformer-registry.ts`.
> This file is the canonical source; all consumers derive their data from it.

## Purpose

Transformer Block 是 MiniMind 的核心计算单元。它将 **Attention**（token 间信息交互）、**FFN**（token 内信息变换）、**RMSNorm**（激活值规范化）和 **Residual Connection**（梯度高速公路）组合成一个完整的、可堆叠的计算层。

在 MiniMind 中，Transformer Block 采用 **Pre-Norm 架构**（Normalization 在子层之前），这是当前主流 LLM（GPT-2/3/4、LLaMA、Qwen）的标准选择。

**一句话总结：** Transformer Block = Attention（"跟谁交流"）+ FFN（"怎么思考"）+ RMSNorm（"保持稳定"）+ Residual（"不要忘记"）。

## Input

- **Hidden States：** `[seqLen, dModel]` — 来自 Embedding 层或前一个 Block 的 token 表示
- **Attention Mask：** 可选的 causal mask（自回归生成时防止看到未来 token）
- **Config：** TransformerConfig 包含 dModel、numHeads、headDim、dFF、maxSeqLen、eps

## Output

- **Output：** `[seqLen, dModel]` — 经过完整 Attention + FFN 变换的 token 表示
- **TransformerTrace：** 包含 norm outputs、attention output、ffn output、residual states 的完整中间结果

---

## Core Concepts

### 1. Transformer Block 为什么存在

**单层 Attention 的表达能力有限。**

Attention 让 token 之间交换信息（"谁说了什么相关的话"），FFN 对每个 token 进行独立变换（"如何理解和消化这些信息"）。但仅有一层是不够的——模型需要多层堆叠来逐步提炼越来越抽象的表示。

**直觉类比：**

| 层数 | 类比 | 学到的内容 |
|------|------|-----------|
| Layer 1 | 词法分析 | 词性、基本语法关系 |
| Layer 2-4 | 句法分析 | 短语结构、依存关系 |
| Layer 5-8 | 语义理解 | 指代消解、语义角色 |
| Layer 9-12 | 语用推理 | 隐含含义、逻辑推理 |

**Transformer Block 是这个堆叠结构的原子单元。** 每个 Block 有相同的结构，但拥有独立的参数——这使不同层可以专注于不同粒度的特征。

### 2. Decoder-only Transformer

**MiniMind 使用 Decoder-only 架构。**

与原始 Transformer（Encoder-Decoder）不同，Decoder-only 模型只有一个方向的信息流：

```
Encoder-Decoder（原始 Transformer / BERT + GPT）:
  Input → [Encoder Block × N] → Encoded Representation
                                      ↓
                              [Decoder Block × N] → Output
                              （通过 Cross-Attention 获取 Encoder 信息）

Decoder-only（GPT / LLaMA / MiniMind）:
  Input → [Decoder Block × N] → Output
  （仅 Self-Attention + FFN，无 Cross-Attention）
```

**Decoder-only 的优势：**

| 特性 | Encoder-Decoder | Decoder-only |
|------|----------------|--------------|
| **架构复杂度** | 两套 Block + Cross-Attention | 单一 Block 类型 |
| **预训练灵活性** | 需要 paired data | 自监督（next token prediction） |
| **生成能力** | 需 Decoder | 天然支持自回归生成 |
| **扩展性** | 较复杂 | 简单，易于扩展到大规模 |
| **代表模型** | T5, BART | GPT, LLaMA, Qwen, MiniMind |

### 3. RMSNorm（Root Mean Square Layer Normalization）

**RMSNorm 是 LayerNorm 的简化版本，去掉了减去均值的操作。**

```
LayerNorm(x):
  μ = mean(x)                    ← 计算均值
  σ² = variance(x) = mean((x - μ)²)
  x̂ = (x - μ) / √(σ² + ε)       ← 减均值 + 除标准差
  y = γ · x̂ + β                  ← 缩放 + 平移

RMSNorm(x):
  rms = √(mean(x²) + ε)          ← 只计算 RMS，不减去均值
  x̂ = x / rms                    ← 仅除 RMS
  y = γ · x̂                       ← 仅缩放（无平移 β）
```

**为什么 RMSNorm 可行？**

1. **计算效率更高：** 省去了均值计算和减法操作，约减少 30% 的计算量
2. **实证效果相当：** LLaMA 论文证明 RMSNorm 与 LayerNorm 效果相当
3. **假设：** LayerNorm 的核心收益来自**重新缩放**（re-scaling），而非**重新中心化**（re-centering）。减去均值可能不是必需的——它只是让激活值以 0 为中心，但网络的后续层可以学习适应任何偏移。

**RMSNorm vs LayerNorm vs BatchNorm：**

| 维度 | BatchNorm | LayerNorm | RMSNorm |
|------|-----------|-----------|---------|
| **归一化维度** | Batch 维度 | Feature 维度 | Feature 维度 |
| **减均值** | ✓ | ✓ | ✗ |
| **除标准差/RMS** | 标准差 | 标准差 | RMS |
| **可学习参数** | γ, β | γ, β | γ only |
| **训练/推理一致性** | 不一致（需要 running stats） | 一致 | 一致 |
| **计算量** | 中 | 高 | **低** |
| **使用场景** | CV（CNN） | NLP（原始 Transformer） | **现代 LLM（LLaMA 系列）** |

### 4. Residual Connection（残差连接）

**残差连接是训练深层网络的关键技术。**

```
Without Residual:
  y = Sublayer(x)

With Residual:
  y = x + Sublayer(Norm(x))
```

**为什么残差连接有效？**

1. **梯度高速公路：** 残差路径为梯度提供了一条直接的"短路"通道。反向传播时，梯度可以通过残差连接无损地传递到更早的层——避免了梯度消失问题。

2. **恒等映射基线：** 即使 Sublayer 的学习效果不佳（输出接近 0），残差连接确保输出 ≈ x（恒等映射）。这意味着添加更多层至少不会损害模型性能——最坏情况下，新层可以学习恒等映射。

3. **训练稳定性：** 残差连接使每一层只需学习"与输入的差异"（residual），而非完整的变换。这大大降低了优化的难度。

**梯度流分析：**

```
设 Block 输出：y = x + F(Norm(x))

反向传播：
∂L/∂x = ∂L/∂y · (I + ∂F/∂x)

其中 I 是单位矩阵，确保梯度至少可以无损地通过残差路径传递。
```

在深层 Transformer（20+ 层）中，没有残差连接的模型几乎不可能训练——梯度会在反向传播中迅速衰减到 0。

### 5. Attention + FFN 组合

**为什么 Attention 和 FFN 要交替排列？**

这是 Transformer 架构最精妙的设计之一：

```
Attention: "谁说了什么相关信息？" → Token 间信息交互
FFN:       "如何理解和转换这些信息？" → Token 内信息处理
```

**交替排列的直觉：**

1. **Attention 聚合上下文：** 每个 token 从其他 token 收集相关信息
2. **FFN 处理聚合结果：** 对收集到的信息进行非线性变换
3. **下一层 Attention 基于处理后的结果再次聚合：** 形成逐步抽象的特征提取

这类似于人类的思考过程：先听取各方意见（Attention）→ 独立思考消化（FFN）→ 再次听取意见（Attention）→ 再次消化（FFN）→ ...

**为什么不反过来（FFN → Attention）？**

实际上可以，两种顺序在理论上等价——但社区约定俗成使用 Attention → FFN 的顺序，且 Pre-Norm 架构中两个子层的顺序对最终效果影响不大。

### 6. Pre-Norm Architecture

**Pre-Norm（Norm 在子层之前）vs Post-Norm（Norm 在子层之后）。**

```
Post-Norm（原始 Transformer）:
  y = Norm(x + Sublayer(x))
  （先执行子层，再加残差，最后 Norm）

Pre-Norm（现代 LLM）:
  y = x + Sublayer(Norm(x))
  （先 Norm，再执行子层，最后加残差）
```

**为什么 Pre-Norm 更稳定？**

| 维度 | Post-Norm | Pre-Norm |
|------|-----------|----------|
| **梯度流** | 梯度需经过 Norm → 可能衰减 | 梯度通过残差直接传递 → 更稳定 |
| **训练稳定性** | 需要 warmup，否则容易发散 | 无需特殊 warmup |
| **最终效果** | 理论上限更高（有争议） | 更稳定，易于训练 |
| **层数扩展** | 6-12 层 | 可扩展到 100+ 层 |
| **使用模型** | 原始 Transformer, BERT | GPT-2/3/4, LLaMA, MiniMind |

**Pre-Norm 的梯度优势：**

```
Post-Norm:
  y = Norm(x + F(x))
  ∂y/∂x 需要经过 Norm 的梯度 → 可能衰减

Pre-Norm:
  y = x + F(Norm(x))
  ∂y/∂x = I + ∂F/∂x · ∂Norm/∂x
  单位矩阵 I 确保梯度有直接路径
```

### 7. MiniMind Transformer 结构

**MiniMind 的 Transformer Block 完全对齐 LLaMA 架构。**

```
MiniMind Transformer Block 数据流：

Input: hiddenStates [seqLen, dModel=512]
  │
  ├──→ RMSNorm ──→ Attention (Multi-Head, 8 heads × 64 dim)
  │                    │
  │                    └──→ Residual Add (+) ←── x (skip connection)
  │                         │
  ├──→ RMSNorm ──→ FFN (SwiGLU, dFF=2048)
  │                    │
  │                    └──→ Residual Add (+) ←── x (skip connection)
  │                         │
  └──→ Output: [seqLen, dModel=512]
```

**关键参数：**

| 参数 | 值 | 说明 |
|------|-----|------|
| dModel | 512 | 隐藏维度 |
| numHeads | 8 | 注意力头数 |
| headDim | 64 | 每头维度 (= 512 / 8) |
| dFF | 2048 | FFN 中间维度 (= 4 × 512) |
| numLayers | 8 | Block 堆叠层数 |
| normType | RMSNorm | 归一化类型（对齐 LLaMA） |
| normEps | 1e-6 | 归一化 epsilon（数值稳定性） |
| architecture | Pre-Norm | Norm 在子层之前 |

**完整 MiniMind 26M 模型结构：**

```
MiniMind(
  Embedding (vocab=6400, dim=512)
  ↓
  [TransformerBlock × 8]    ← 8 个相同的 Block（参数独立）
  ↓
  RMSNorm (final)
  ↓
  LM Head (512 → 6400)
)
```

---

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `MiniTransformerBlock` | `src/lib/minimind/transformer/TransformerBlock.ts` | 单个 Pre-Norm Decoder Block，组合 RMSNorm + Attention + FFN + Residual |
| `MiniRMSNorm` | `src/lib/minimind/transformer/RMSNorm.ts` | RMS Normalization 层 — 仅除 RMS（不减均值），对齐 LLaMA 架构 |
| `TransformerRegistry` | `src/data/minimind/transformer-registry.ts` | Transformer 模块元数据注册表 — 版本定义、概念目录、实验清单 |

## Core Functions

| Function | Description |
|----------|-------------|
| `MiniRMSNorm.forward(x)` | RMS 归一化前向传播：x → x / RMS(x) * γ |
| `MiniRMSNorm.normalize(x)` | 纯归一化（不含 γ 缩放）：x → x / RMS(x) |
| `MiniRMSNorm.getWeights()` | 获取可学习参数 γ（缩放因子） |
| `MiniTransformerBlock.forward(input)` | 完整 Block 前向传播：RMSNorm → Attention → Residual → RMSNorm → FFN → Residual |
| `MiniTransformerBlock.getTrace()` | 获取最近一次 forward 的完整 block trace |

---

## Learning Notes

> **Pre-Norm 为什么比 Post-Norm 更稳定？**
>
> Pre-Norm 的残差路径为梯度提供了一条"高速公路"。输出 `y = x + F(Norm(x))` 中，`x` 直接参与最终输出——反向传播时，梯度可以通过 `+ x` 这条路径无损传递。而 Post-Norm 的 `y = Norm(x + F(x))` 中，梯度必须穿过 Norm 层——Norm 的梯度可能非常小（尤其是当激活值方差很大时），导致梯度消失。这就是为什么 Pre-Norm 不需要 learning rate warmup 而 Post-Norm 需要。
>
> **RMSNorm 相比 LayerNorm 去掉了什么？为什么可行？**
>
> RMSNorm 去掉了"减去均值"（re-centering）操作，仅保留"除以 RMS"（re-scaling）。LLaMA 的作者假设：LayerNorm 的成功主要来自 re-scaling（控制激活值的尺度），而非 re-centering（让激活值以 0 为中心）。因为神经网络本身可以学习适应偏移——如果某个特征需要正值，权重可以自动调整。而去掉 re-centering 节省了约 30% 的计算量，在大规模训练中累积效应显著。
>
> **残差连接的梯度流如何帮助深层网络训练？**
>
> 没有残差连接时，梯度在反向传播中经过每一层的变换矩阵（W_Q, W_K, W_V, W_O, W_gate, W_up, W_down），每次乘法都可能使梯度缩小（如果 ||W|| < 1）或放大（如果 ||W|| > 1）。20 层之后，梯度要么消失（全 0），要么爆炸（NaN）。残差连接的 `y = x + F(x)` 求导得到 `∂y/∂x = I + ∂F/∂x`——单位矩阵 I 确保了梯度至少有一条无损的传播路径。这相当于给每层梯度加了一个"保底"，即使 F 的梯度很小，总的梯度也不低于 1。
>
> **Attention + FFN 为什么要交替排列？**
>
> 交替排列创造了一种"信息处理节奏"：Attention 负责跨位置通信（"听别人说什么"），FFN 负责位置内计算（"自己想想"）。如果两个 Attention 连续排列，第二个 Attention 的输入缺乏非线性变换——表达能力受限。如果两个 FFN 连续排列，第二个 FFN 无法获取更新后的跨位置信息——浪费了计算。交替排列确保每一步都有"通信 + 计算"的完整周期。
>
> **MiniMind 的 Transformer 架构更接近哪个公开模型？**
>
> MiniMind 的架构最接近 **LLaMA**（Meta）：Pre-Norm、RMSNorm、SwiGLU FFN、Rotary Position Embedding（RoPE）。这是当前开源 LLM 社区的标准配置——与 GPT-2/3 的主要区别在于 RMSNorm 替代 LayerNorm、SwiGLU 替代 GELU FFN、RoPE 替代 Learned Positional Encoding。

## Questions

- [x] Transformer Block 为什么存在？→ 单层 Attention + FFN 表达能力有限，需要多层堆叠逐步提炼抽象表示
- [x] 什么是 Decoder-only Transformer？→ 只有 Self-Attention + FFN，无 Cross-Attention，天然支持自回归生成
- [x] RMSNorm 的原理是什么？→ x / RMS(x) * γ，去掉了 LayerNorm 的减均值操作，计算更快
- [x] 残差连接为什么有效？→ 梯度高速公路 + 恒等映射基线，确保深层网络可训练
- [x] Attention + FFN 为什么交替排列？→ 形成"通信 → 计算 → 通信 → 计算"的信息处理节奏
- [x] Pre-Norm vs Post-Norm 的区别？→ Pre-Norm 是 Norm 在子层前，梯度可通过残差无损传递
- [x] RMSNorm 相比 LayerNorm 去掉了什么？为什么可行？→ 去掉 re-centering，保留 re-scaling。网络可自适应偏移
- [ ] Encoder-Decoder 与 Decoder-Only 结构在 MiniMind 外的实际性能对比？
- [ ] 不同 Block 层学习到的表示有何差异？（逐层 probing）
- [ ] RMSNorm 的 γ 参数在不同层之间的分布模式？
- [ ] 残差连接的强度是否应该加权？（ResiDual / Scaled Residual）

## TODO

- [x] 创建 Transformer 理论文档（本文档 — 从 stub 扩展为完整版）
- [x] 创建 Transformer SSOT Registry
- [x] 实现 MiniRMSNorm（V1: RMS Normalization）
- [x] 实现 MiniTransformerBlock（V1: Pre-Norm Decoder Block）
- [ ] 阅读 MiniMind Transformer 源码，添加逐行注释
- [ ] 编写单元测试：RMSNorm 输出 RMS≈1 验证
- [ ] 编写单元测试：TransformerBlock 输入输出形状验证
- [ ] 编写单元测试：残差连接数值验证
- [ ] 实验：可视化每层 Attention + FFN 前后的表示变化
- [ ] 实验：对比 Pre-Norm 和 Post-Norm 的梯度范数分布
- [ ] 实验：分析不同层 RMSNorm γ 参数的分布
- [ ] 实验：验证 RMSNorm vs LayerNorm 在 MiniMind 中的效果差异
