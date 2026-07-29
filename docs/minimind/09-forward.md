# Forward Model

> **Source Reference:** Model module metadata (version definitions, architecture configs,
> concept catalog, and experiment list) is maintained in `src/data/minimind/model-registry.ts`.
> This file is the canonical source; all consumers derive their data from it.

## Purpose

Forward Model 是 MiniMind 的**完整前向传播管道**。它将前面章节构建的所有模块——Tokenizer、Embedding、RoPE、Transformer Block、LM Head——串联成一个端到端的 Text → Logits 数据流。

**一句话总结：** Forward Model = Tokenizer（"切成词"）+ Embedding（"变成向量"）+ RoPE（"注入位置"）+ Transformer Blocks（"深度理解"）+ LM Head（"预测下一个词"）。

这不是一个新的"层"——它是一个**编排层（orchestration layer）**，通过依赖注入将所有子模块组合起来，不重复实现任何子模块的逻辑。

## Input

- **Text：** 原始字符串（例如 `"Hello HOU Universe"`）
- **Config：** ModelConfig 包含 vocabSize、dModel、numHeads、headDim、dFF、numLayers、maxSeqLen、normEps、ropeTheta
- **子模块实例：** MiniTokenizer、MiniEmbedding、RotaryEmbedding、MiniTransformerBlock[]、MiniLMHead（通过依赖注入提供）

## Output

- **Logits：** `[vocabSize]` — 最后一个 token 位置对应的词表分数（未经 softmax）
- **Hidden States：** `[seqLen, dModel]` — 最终 Transformer Block 输出的隐藏表示
- **ModelTrace：** 从 Text → Tokens → Embeddings → Transformer → Logits 的完整中间结果，每一步可单独检查和可视化

---

## Core Concepts

### 1. 什么是 Forward Pass？

**Forward Pass = 将文本转化为预测分数的完整计算过程。**

在 LLM 中，forward pass 不涉及任何学习——它只是用已有的参数对输入进行计算。理解 forward pass 是理解 LLM 如何"阅读"和"理解"文本的基础。

```
Forward Pass 的 5 个阶段：

  "hello world"
       │
  ┌────▼─────────────────────────────────────┐
  │ Stage 1: Tokenizer                       │
  │ 文本 → Token IDs                         │
  │ "hello world" → [123, 456]               │
  └────┬─────────────────────────────────────┘
       │
  ┌────▼─────────────────────────────────────┐
  │ Stage 2: Embedding                       │
  │ Token IDs → Dense Vectors                │
  │ [123, 456] → [[0.1, 0.2, ...], [0.3, ...]]│
  └────┬─────────────────────────────────────┘
       │
  ┌────▼─────────────────────────────────────┐
  │ Stage 3: RoPE                            │
  │ 注入位置信息（通过 2D 旋转）              │
  │ vector[m] → rotate(vector[m], m)         │
  └────┬─────────────────────────────────────┘
       │
  ┌────▼─────────────────────────────────────┐
  │ Stage 4: Transformer Blocks × N          │
  │ Attention + FFN 逐层变换                  │
  │ 每层：RMSNorm → Attention → +Residual    │
  │       RMSNorm → FFN → +Residual          │
  └────┬─────────────────────────────────────┘
       │
  ┌────▼─────────────────────────────────────┐
  │ Stage 5: LM Head                         │
  │ Hidden State → Vocabulary Logits          │
  │ [dModel] → [vocabSize]                   │
  └────┬─────────────────────────────────────┘
       │
       ▼
  Logits: [vocabSize]（每个 token 的原始得分）
```

每一个阶段都是**确定性的**——给定相同的输入和参数，始终产生相同的输出。这确保了模型行为的完全可复现和可调试。

### 2. Hidden State Flow（隐藏状态流转）

**Hidden State 是 Forward Pass 中贯穿所有阶段的核心数据结构。**

它的形状在各阶段保持不变：`[seqLen, dModel]`。但它的**语义含义**在不断演化：

| 阶段 | Hidden State 的语义 | 类比 |
|------|-------------------|------|
| Embedding 后 | Token 的"静态含义"（字典定义） | 单词在词典中的释义 |
| RoPE 后 | 带位置标记的含义 | 知道"这个词是第 3 个词" |
| Block 1 后 | 结合了局部上下文的含义 | 理解"形容词 + 名词"的关系 |
| Block 4 后 | 结合了更广上下文的含义 | 理解整个句子的语法结构 |
| Block 8 后 | 深度融合的上下文表示 | 理解段落的语义和隐含含义 |

**为什么形状不变？**

这并非偶然——Transformer 的**残差连接**要求输入和输出形状一致。`y = x + Sublayer(Norm(x))` 中，只有当 `x` 和 `Sublayer(Norm(x))` 形状相同时，加法才有意义。这一约束使整个 Transformer 中的所有向量都具有相同的维度 `dModel`——形成了一条"恒宽"的信息高速公路。

**追踪 Hidden State 的演变：**

```
Token "HOU" 的 hidden state 在 pipeline 中的演变：

Embedding[2]         = [ 0.031, -0.017,  0.042, ...]  ← 初始语义
RoPE[2]              = [ 0.029, -0.021,  0.044, ...]  ← 注入位置信息
Block1.output[2]     = [ 0.015,  0.008, -0.031, ...]  ← 第 1 层理解
Block4.output[2]     = [-0.042,  0.067,  0.013, ...]  ← 第 4 层理解
Block8.output[2]     = [ 0.089, -0.034,  0.051, ...]  ← 最终表示
                                                        ↓
                                                   LM Head
                                                        ↓
                                            Logits（词表得分的"原料"）
```

### 3. Decoder-only Architecture（Decoder-only 架构）

**MiniMind 是 Decoder-only 模型——仅包含 Decoder Block，无 Encoder。**

```
Decoder-only 的完整结构：

Input Text
    │
    ▼
Tokenizer ──→ Token IDs [seqLen]
    │
    ▼
Embedding ──→ Token Vectors [seqLen × dModel]
    │
    ▼
┌─────────────────────────────────────────┐
│         Transformer Blocks × N          │
│  ┌───────────────────────────────────┐  │
│  │  Block 1: Attention + FFN        │  │
│  │  Block 2: Attention + FFN        │  │
│  │  ...                              │  │
│  │  Block N: Attention + FFN        │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
    │
    ▼
LM Head ──→ Logits [vocabSize]
    │
    ▼
(Softmax) ──→ Probabilities [vocabSize]  ← 属于 Inference 阶段
```

**为什么 Decoder-only 成为主流？**

| 特性 | Encoder-Decoder (T5, BART) | Decoder-only (GPT, LLaMA, MiniMind) |
|------|---------------------------|--------------------------------------|
| 参数共享 | Encoder + Decoder 两套参数 | 单一参数集，更高效 |
| 预训练目标 | 需要设计 mask 策略 | 统一的 next-token prediction |
| 生成方式 | 需要 Decoder 单独推理 | 天然支持自回归生成 |
| 扩展性 | 架构复杂，扩展困难 | 统一架构，容易 scale up |
| 上下文利用 | Encoder 双向 + Decoder 单向 | 全部单向（causal） |

**Causal Mask 的作用：**

Decoder-only 的关键约束是每个 token 只能看到它**之前**的 token：

```
Attention Matrix（应用 Causal Mask 后）：

        To:  H   e   l   l   o
From:
  H         ✓   ✗   ✗   ✗   ✗    ← "H" 只能看到自己
  e         ✓   ✓   ✗   ✗   ✗    ← "e" 能看到 "H" 和 "e"
  l         ✓   ✓   ✓   ✗   ✗
  l         ✓   ✓   ✓   ✓   ✗
  o         ✓   ✓   ✓   ✓   ✓    ← "o" 能看到所有前面的 token
```

这确保了模型在生成时不会"作弊"——它必须基于已生成的内容预测下一个 token。

### 4. LM Head（Language Model Head）

**LM Head 是 Forward Model 的最后一步——将隐藏状态映射回词汇空间。**

```
Hidden State [dModel]
    │
    │  × W^T  (W: [vocabSize × dModel])
    │
    ▼
Logits [vocabSize]
```

**公式：**

```
logits[i] = Σ hidden[j] × W[i][j]    for j = 0..dModel-1
```

其中 `W[i]` 是 token i 的"理想隐藏状态向量"。`logits[i]` 就是当前隐藏状态与 token i 的"理想表示"的**点积相似度**。

**直觉理解：**

可以把 `W` 的每一行想象成每个 token 的"原型向量"：

- 如果 hidden state 与 `W["cat"]` 相似 → logits["cat"] 分数高
- 如果 hidden state 与 `W["dog"]` 相似 → logits["dog"] 分数高
- 模型"认为"高分的 token 更可能是正确的下一个 token

**为什么 LM Head 不加 Softmax？**

LM Head 的职责是**投影**——将 hidden space 映射到 vocab space。Softmax 属于 Inference 层或 Loss 层的职责：

| 组件 | 职责 |
|------|------|
| LM Head | 投影：hidden → logits（线性变换） |
| Softmax（inference） | 归一化：logits → probabilities |
| CrossEntropyLoss（training） | 计算损失：需要 logits + labels |

分离关注点的好处：logits 本身作为"原始分数"更有教育意义——可以直接观察哪些 token 得分高、得分分布的形状、以及模型在不同 token 上的"确信度"。

### 5. Logits（原始分数）

**Logits 是 LM Head 输出的未归一化分数，表示模型对每个 token 的"原始偏好"。**

```
Logits 示例（词汇表前 10 个 token）：

Token         Logit
─────────────────────
"the"         3.42
"a"           2.18
"is"          1.95
"Hello"       0.87
"world"      -0.32
"HOU"        -0.45
"Universe"   -1.21
"cat"        -2.04
"dog"        -2.17
"run"        -3.81
```

**Logits 的性质：**

1. **无界：** 可以是任意实数（正或负），不像概率有 [0, 1] 的范围
2. **相对性：** 只有相对大小有意义——logit 3.42 vs 3.00 和 0.42 vs 0.00 的"差距"相同
3. **可加性：** 如果 `logit_A > logit_B`，那么 `exp(logit_A) > exp(logit_B)` —— Softmax 后排名不变

**观察 Logits 可以了解：**

- 模型的"确定性"：最大 logit 与第二大 logit 的差距（差距越大越确定）
- 模型的"盲区"：如果所有 logits 都很接近 → 模型不确定
- 异常值：某个 token 的 logit 异常高 → 可能过拟合

### 6. Softmax Probability（Softmax 概率转换）

**虽然 Softmax 不属于 LM Head，但理解它是理解 logits 的关键。**

```
Softmax 公式：

P(token_i) = exp(logit_i) / Σ exp(logit_j)

其中 T（temperature）控制分布的"锐度"：
  T → 0   : 分布更尖锐（更确定，接近 argmax）
  T = 1   : 标准 Softmax
  T → ∞   : 分布趋于均匀（更随机）
```

**Softmax 后的概率分布示例：**

```
Logits                  →  Probabilities (T=1)
────────────────────────────────────────────────
"the"    3.42           →  0.3723  (37%)
"a"      2.18           →  0.1204  (12%)
"is"     1.95           →  0.0954  (10%)
"Hello"  0.87           →  0.0217  (2%)
...
其余 996 tokens           →  0.3902  (39%)
────────────────────────────────────────────────
Total (Σ)                  = 1.0000  (100%)
```

**Softmax 的数学直觉：**

1. `exp()` 将所有 logits 转为正数（负 logit → 小正数，正 logit → 大正数）
2. 除以总和确保所有概率加起来 = 1
3. 高 logit 获得"不成比例"的高概率（指数放大效应）

### 7. MiniMind 完整数据流

**将一切串联起来——一个 token 从输入到输出的完整旅程。**

```
输入文本: "Hello HOU Universe"
═══════════════════════════════════════════════════════════

┌─ Stage 1: Tokenizer ─────────────────────────────────────┐
│                                                           │
│  "Hello HOU Universe"                                    │
│       │                                                   │
│       │  tokenize() — 按空格切分                           │
│       ▼                                                   │
│  ["Hello", "HOU", "Universe"]                             │
│       │                                                   │
│       │  encode() — 查词汇表                               │
│       ▼                                                   │
│  [123, 456, 789]                                         │
│                                                           │
│  Output: Token IDs [3]                                   │
└───────────────────────────────────────────────────────────┘

┌─ Stage 2: Embedding ─────────────────────────────────────┐
│                                                           │
│  [123, 456, 789]                                         │
│       │                                                   │
│       │  W_embed[123] → vector_0 [512]                   │
│       │  W_embed[456] → vector_1 [512]                   │
│       │  W_embed[789] → vector_2 [512]                   │
│       ▼                                                   │
│  Embeddings [3][512]                                     │
│                                                           │
│  E[0] = [0.031, -0.017, 0.042, ...]  ← "Hello"          │
│  E[1] = [-0.023, 0.058, -0.011, ...] ← "HOU"            │
│  E[2] = [0.015, 0.033, -0.028, ...]  ← "Universe"       │
│                                                           │
│  Output: Token Vectors [3][512]                          │
└───────────────────────────────────────────────────────────┘

┌─ Stage 3: RoPE ──────────────────────────────────────────┐
│                                                           │
│  Position m=0: rotate(E[0], θ₀_0, θ₀_1, ...)           │
│  Position m=1: rotate(E[1], θ₁_0, θ₁_1, ...)           │
│  Position m=2: rotate(E[2], θ₂_0, θ₂_1, ...)           │
│       │                                                   │
│       ▼                                                   │
│  Rotated [3][512]                                        │
│                                                           │
│  特点：位置信息通过旋转角度编码，向量长度不变              │
│                                                           │
│  Output: Position-Aware Vectors [3][512]                 │
└───────────────────────────────────────────────────────────┘

┌─ Stage 4: Transformer Blocks × 8 ────────────────────────┐
│                                                           │
│  Current = Rotated [3][512]                              │
│                                                           │
│  for each Block i in 1..8:                               │
│    ┌─ RMSNorm(current) ──→ normed                       │
│    │  Attention(Q=normed, K=normed, V=normed, mask)     │
│    │      → attn_output                                 │
│    │  current = current + attn_output   ← Residual 1    │
│    │                                                     │
│    │  RMSNorm(current) ──→ normed                       │
│    │  FFN(normed) ──→ ffn_output                        │
│    │  current = current + ffn_output    ← Residual 2    │
│    └─ continue                                           │
│                                                           │
│  Final Hidden States: [3][512]                           │
│                                                           │
│  H[0] = [ 0.089, -0.034,  0.051, ...]                   │
│  H[1] = [-0.042,  0.067,  0.013, ...]                   │
│  H[2] = [ 0.125,  0.011, -0.067, ...]                   │
│                                                           │
│  Output: Contextualized Representations [3][512]         │
└───────────────────────────────────────────────────────────┘

┌─ Stage 5: LM Head ───────────────────────────────────────┐
│                                                           │
│  取最后一个 token 的 hidden state:                        │
│    last_hidden = H[2]  [512]                             │
│       │                                                   │
│       │  logits[v] = Σ last_hidden[d] × W[v][d]          │
│       ▼                                                   │
│  Logits [1000]                                           │
│                                                           │
│  logits[0..4] = [3.42, 2.18, -0.32, -1.21, 0.87, ...]   │
│                                                           │
│  Output: Vocabulary Scores [vocabSize]                   │
└───────────────────────────────────────────────────────────┘
```

**完整的数据变换总结：**

| Stage | Input Shape | Output Shape | 变换类型 |
|-------|------------|-------------|---------|
| Tokenizer | `string` | `number[]` | 离散查找 |
| Embedding | `number[]` | `[seqLen][dModel]` | 矩阵查表 |
| RoPE | `[seqLen][dModel]` | `[seqLen][dModel]` | 正交旋转 |
| Transformer × N | `[seqLen][dModel]` | `[seqLen][dModel]` | 非线性变换 + 信息交互 |
| LM Head | `[dModel]` | `[vocabSize]` | 线性投影 |

**注意：** 从 Embedding 到最后一个 Transformer Block 输出，shape 始终是 `[seqLen][dModel]`——这是残差连接的"恒宽"约束。只有 LM Head 改变了维度（从 `dModel` 到 `vocabSize`）。

---

## Core Classes

| Class | File | Description |
|-------|------|-------------|
| `MiniMindModel` | `src/lib/minimind/model/MiniMindModel.ts` | 完整前向传播编排器 — 通过依赖注入组合所有子模块 |
| `MiniLMHead` | `src/lib/minimind/model/LMHead.ts` | Language Model Head — 线性投影 hidden [dModel] → logits [vocabSize] |
| `ModelRegistry` | `src/data/minimind/model-registry.ts` | Model 模块元数据注册表 — 版本定义、概念目录、实验清单 |

## Core Functions

| Function | Description |
|----------|-------------|
| `MiniMindModel.forward(input)` | 完整前向传播：Text → Tokenize → Embed → RoPE → Transformer × N → LM Head → Logits |
| `MiniMindModel.getTrace()` | 获取完整 pipeline trace — 每一步中间结果可检查 |
| `MiniMindModel.getConfig()` | 返回模型配置 |
| `MiniLMHead.forward(hidden)` | 投影 hidden state 到 vocabulary logits |
| `MiniLMHead.project(vector)` | 单个向量的线性投影 — 展示 logits 计算细节 |
| `MiniLMHead.getWeights()` | 获取完整的 W [vocabSize × dModel] 投影矩阵 |

---

## Learning Notes

> **Forward Pass 为什么重要？**
>
> Forward pass 是理解 LLM 工作原理的入口。所有的高级话题——训练、推理优化、prompt engineering、模型解释——都建立在对 forward pass 的清晰理解之上。一个 token 从"hello"变成 1000 个实数的过程，就是 LLM "阅读"和"理解"文本的全部秘密。
>
> **为什么 Hidden State 的形状始终不变？**
>
> 残差连接 `y = x + F(Norm(x))` 要求输入 `x` 和输出 `F(Norm(x))` 具有相同的形状。这一约束看似简单，但它深刻地塑造了 Transformer 的架构——所有层的"宽度"必须一致，信息沿着一条"恒宽高速公路"流动。这也是为什么 Transformer 的参数量主要由 `dModel` 和 `numLayers` 决定。
>
> **Logits 和 Probabilities 有什么区别？**
>
> Logits 是原始分数（任意实数），Probabilities 是归一化概率（和为 1，范围为 [0, 1]）。Softmax 负责这个转换。保留 logits 而非概率有实际原因：1) 数值稳定性——log-space 避免指数溢出；2) 灵活性——temperature、top-k、top-p 等采样策略在 logits 层面更容易操作；3) 可解释性——logits 的相对差异直接反映模型的"偏好强度"。
>
> **LM Head 和 Embedding 有什么关系？**
>
> 它们使用了"对偶"的矩阵——Embedding：token_id → vector（查表），LM Head：vector → token_scores（投影）。在某些模型中，这两个矩阵是共享的（weight tying）——Embedding 矩阵的转置就是 LM Head 的投影矩阵。这减少了参数量（vocabSize × dModel ≈ 6400 × 512 ≈ 3.3M 参数），且有一个直观的解释：如果某个 token 的 embedding 向量与 hidden state 最相似，那么这个 token 就是最合理的预测。
>
> **MiniMind 的 Forward Pass 和真实 LLM 有什么不同？**
>
> MiniMind 的 forward pass 在架构上完全对齐真实 LLM（LLaMA），但在规模上大幅缩小：dModel=512（vs 4096+）、numLayers=8（vs 32-80）、vocabSize=6400（vs 32K-250K）。总参数量约 26M，而 GPT-3 有 175B——相差约 6700 倍。但架构的本质完全相同，理解了 MiniMind 的 forward pass 就理解了所有 Decoder-only LLM 的基本工作原理。

## Questions

- [x] 什么是 Forward Pass？→ 将文本转化为预测分数的完整计算过程，包含 5 个阶段
- [x] Hidden State 在各阶段之间如何变化？→ 形状不变 [seqLen, dModel]，但语义不断丰富
- [x] 为什么 Decoder-only 成为主流？→ 统一架构 + next-token prediction，易于扩展
- [x] LM Head 做什么？→ 线性投影 hidden [dModel] → logits [vocabSize]，不加 softmax
- [x] Logits 和 Probabilities 有什么区别？→ Logits 是原始分数，Probabilities 是归一化概率
- [x] MiniMind 完整数据流是怎样的？→ Tokenizer → Embedding → RoPE → Transformer × 8 → LM Head → Logits
- [ ] 不同 Transformer 层对 hidden state 的改变量如何量化？
- [ ] Weight Tying（Embedding + LM Head 共享权重）在 MiniMind 中是否可行？
- [ ] 残差流中的信息累积如何影响最终的 logits 预测？
- [ ] Forward pass 中哪一步的计算复杂度最高？（Attention O(n²) vs FFN O(nd²)）

## TODO

- [x] 创建 Forward Model 理论文档（本文档）
- [x] 创建 Model SSOT Registry
- [x] 实现 MiniLMHead（V1: 线性投影 hidden → logits）
- [x] 实现 MiniMindModel（V1: 依赖注入编排器）
- [x] 创建完整 forward pass 示例（"Hello HOU Universe"）
- [ ] 编写单元测试：LM Head 输出形状验证
- [ ] 编写单元测试：MiniMindModel 全流程端到端验证
- [ ] 编写单元测试：ModelTrace 完整性验证
- [ ] 实验：可视化每层 hidden state 的演变
- [ ] 实验：分析 logits 分布与输入文本的关系
- [ ] 实验：对比不同层的 hidden state 余弦相似度
- [ ] 实验：验证 RoPE 对 logits 预测的贡献
