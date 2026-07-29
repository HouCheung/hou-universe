# MiniMind Project Overview

## Repository Origin

| Attribute | Value |
|-----------|-------|
| Repository | [jingyaogong/minimind](https://github.com/jingyaogong/minimind) |
| Author | Jingyao Gong (龚经耀) |
| Description | 从零训练小型语言模型（26M–108M 参数），2 小时即可完成全流程 |
| License | Apache 2.0 |
| Tech Stack | PyTorch (native, no high-level abstractions) |

MiniMind 是一个极简工业级小型语言模型（SLM）教学项目，旨在以最短代码和最少的计算资源（个人显卡）展示 LLM 全链路技术栈。所有代码由原生 PyTorch 编写，不依赖 `transformers`、`trl` 等高层封装，可直接阅读和理解每一行实现。

## Purpose

本学习工程的目标是：通过逐行阅读和理解 MiniMind 源码，系统性地掌握从 Tokenizer 到 Agent 的每一个技术环节，构建完整的 LLM 全链路知识体系。

## Repository Directory Analysis

### Top-Level Structure

```
minimind/
├── model/              # 模型架构定义（核心 Python 模块）
├── trainer/            # 训练执行脚本（5 个训练阶段）
├── dataset/            # 训练数据（JSONL 格式，约 25 GB）
├── scripts/            # 评估、部署、模型转换工具
├── out/                # 模型权重与训练检查点（gitignored）
├── README.md           # 中文项目说明
├── README_en.md        # 英文项目说明
└── requirements.txt    # Python 依赖
```

### Core File Responsibilities

#### `model/` — 模型架构定义

| File | Responsibility |
|------|----------------|
| `model_minimind.py` | 核心 Dense Transformer 实现（Decoder-Only），含 MiniMindConfig、MiniMind、MiniMindBlock、Attention、FeedForward、MOEFeedForward |
| `model_lora.py` | LoRA 低秩适配微调实现，定义 LoRA 线性层和权重合并逻辑 |
| `tokenizer/tokenizer.json` | BPE + ByteLevel 分词器词汇表与合并规则（vocab_size=6400） |
| `tokenizer/tokenizer_config.json` | 特殊 Token 配置：`<\|im_start\|>`、`<\|im_end\|>`、`<tool_call>`、`<tool_response>`、`<think>` |

#### `trainer/` — 训练执行脚本

| File | Responsibility |
|------|----------------|
| `pretrain.py` | 无监督预训练脚本，从零训练语言模型基础能力 |
| `sft.py` | 全参数监督微调脚本，让模型遵循指令对话 |
| `lora.py` | LoRA 高效微调脚本，适配医疗问答、自我认知等下游任务 |
| `rlhf_dpo.py` | DPO（Direct Preference Optimization）偏好对齐脚本 |
| `rlaif.py` | 基于 AI 反馈的强化学习脚本（PPO / GRPO / CISPO） |

#### `scripts/` — 工具与部署

| File | Responsibility |
|------|----------------|
| `eval_llm.py` | CLI 推理脚本，支持 temperature、top-p 采样和 RoPE 上下文扩展 |
| `serve_openai_api.py` | FastAPI 服务，提供 OpenAI-compatible `/v1/chat/completions` 接口 |
| `convert_model.py` | 模型格式转换（原生 → Transformers / Qwen3 / LoRA 合并） |
| `web_demo.py` | Streamlit 聊天界面，支持思考过程展示和多轮 Tool Calls |
| `train_tokenizer.py` | Tokenizer 训练脚本（参考用，项目中已提供预训练分词器） |

#### `dataset/` — 训练数据（JSONL）

| File | Responsibility |
|------|----------------|
| `pretrain_hq.jsonl` | 高质量预训练语料（约 1.6 GB） |
| `sft_512.jsonl` / `sft_1024.jsonl` / `sft_2048.jsonl` | Qwen2.5 蒸馏 SFT 对话数据（多种长度） |
| `sft_mini_512.jsonl` | 最小化 SFT 数据（快速 Zero 模型训练，约 1.2 GB） |
| `dpo.jsonl` | DPO 偏好对齐数据（chosen / rejected 对，约 909 MB） |
| `r1_mix_1024.jsonl` | DeepSeek-R1 蒸馏推理数据（约 340 MB） |
| `lora_medical.jsonl` | 医疗问答 LoRA 微调数据（约 34 MB） |
| `lora_identity.jsonl` | 自我认知 LoRA 数据（约 23 KB） |
| `tokenizer_train.jsonl` | Tokenizer 训练语料（约 1 GB） |
| `agent_rl.jsonl` / `agent_rl_math.jsonl` | Agent / Math RL 训练数据 |
| `rlaif.jsonl` | RLAIF 训练数据 |

## Overall Architecture

### Model Variants

| Variant | Parameters | Layers | d_model | kv_heads | q_heads | Vocab Size |
|---------|-----------|--------|---------|----------|---------|-------------|
| MiniMind2-Small | 26M | 8 | 512 | 8 | 16 | 6,400 |
| MiniMind-v1-MoE | 4×26M | 8 | 512 | 8 | 16 | 6,400 |
| MiniMind2 | 104M | 16 | 768 | 8 | 16 | 6,400 |
| MiniMind2-MoE | 145M | — | — | — | — | 6,400 |
| MiniMind-3 | 64M | — | — | — | — | 6,400 |
| MiniMind-3-MoE | 198M / A64M | — | — | — | — | 6,400 |

### Architecture Pattern

MiniMind 采用 **Decoder-Only Transformer** 架构，与 GPT / Llama 系列一致：

```
                   ┌──────────────────────────────────┐
                   │         Raw Text Input            │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │     BPE + ByteLevel Tokenizer     │
                   │       vocab_size = 6400           │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │       Embedding Layer             │
                   │    [vocab, d_model] lookup        │
                   │    + Weight Tied LM Head          │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
            ┌─────────────────────────────────────────┐
            │         N × MiniMindBlock               │
            │  ┌─────────────────────────────────┐    │
            │  │   RMSNorm → GQA Attention        │    │
            │  │   (with RoPE + Causal Mask)      │    │
            │  │          ↓ Residual (+)          │    │
            │  │   RMSNorm → SwiGLU FFN / MoE     │    │
            │  │          ↓ Residual (+)          │    │
            │  └─────────────────────────────────┘    │
            └────────────────┬────────────────────────┘
                             │
                             ▼
                   ┌──────────────────────────────────┐
                   │        Final RMSNorm              │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │         LM Head (Linear)          │
                   │      [d_model → vocab_size]       │
                   │   (Weight Tied with Embedding)    │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │          Sampler                  │
                   │  temperature / top-k / top-p      │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │        Generated Token            │
                   └──────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 归一化层 | RMSNorm (Pre-Norm) | 比 LayerNorm 更快，Pre-Norm 训练更稳定 |
| 激活函数 | SwiGLU | 比 ReLU/GELU 在下游任务中表现更好 |
| 位置编码 | RoPE (Rotary Position Embedding) | 相对位置编码，支持动态上下文扩展 |
| 注意力机制 | GQA (Grouped Query Attention) | 在 MHA 和 MQA 之间平衡速度与质量 |
| 词表大小 | 6,400 tokens | 覆盖中英双语，兼顾编码效率 |
| 分词算法 | BPE + ByteLevel | 处理任意 Unicode，完全覆盖 OOV 问题 |
| FFN 扩展比 | 8/3 × d_model (SwiGLU) | 标准 SwiGLU 中间维度 |
| 权重绑定 | Embedding ↔ LM Head | 节省 vocab_size × d_model 参数量 |

### Training Pipeline

```
Phase 1: Pretrain          Phase 2: SFT            Phase 3: Alignment
┌──────────────────┐      ┌──────────────────┐     ┌──────────────────┐
│ Random Init       │      │ Pretrained Model  │     │ SFT Model        │
│        ↓          │      │        ↓          │     │        ↓         │
│ Next-Token        │      │ Instruction       │     │ DPO (Human Pref) │
│ Prediction        │ ───→ │ Following         │ ───→│        or        │
│ (Causal LM Loss)  │      │ (Chat Format)     │     │ RLAIF (AI Reward)│
│        ↓          │      │        ↓          │     │        ↓         │
│ Base Model        │      │ Chat Model        │     │ Aligned Model    │
└──────────────────┘      └──────────────────┘     └──────────────────┘
                                    │
                              ┌─────┴─────┐
                              │   LoRA    │
                              │ (Medical, │
                              │ Identity, │
                              │  Custom)  │
                              └───────────┘
```

## Core Classes (from actual source)

| Class | File | Description |
|-------|------|-------------|
| `MiniMindConfig` | `model/model_minimind.py` | 模型超参数配置数据类（hidden_size, num_layers, num_heads, vocab_size 等） |
| `MiniMind` | `model/model_minimind.py` | 主模型类，继承 `nn.Module` + `GenerationMixin`，Decoder-Only Transformer |
| `MiniMindBlock` | `model/model_minimind.py` | 单个 Decoder Block：RMSNorm → Attention → Residual → RMSNorm → FFN/MoE → Residual |
| `Attention` | `model/model_minimind.py` | GQA 自注意力机制，含 RoPE 旋转位置编码和因果掩码 |
| `FeedForward` | `model/model_minimind.py` | 标准 SwiGLU FFN（gate/up/down 三个线性投影） |
| `MOEFeedForward` | `model/model_minimind.py` | 混合专家 FFN，Top-K 路由，细粒度专家分割（基于 DeepSeek-V2/V3） |
| `LoRALinear` | `model/model_lora.py` | LoRA 低秩适配线性层（A/B 矩阵 + merge/unmerge） |

## Core Functions

| Function | Module | Description |
|----------|--------|-------------|
| `precompute_freqs_cis(dim, seq_len, theta)` | Attention | 预计算 RoPE 复数频率表 |
| `apply_rotary_emb(xq, xk, freqs_cis)` | Attention | 将 RoPE 应用到 Q 和 K 张量 |
| `forward(x, mask?)` | MiniMindBlock | 单个 Block 前向传播（Pre-Norm + Attention + FFN + Residual） |
| `generate(prompt, **kwargs)` | MiniMind | 自回归文本生成（temperature / top-k / top-p） |
| `train_epoch(model, loader, optimizer, scheduler)` | trainer/* | 训练循环（Pretrain / SFT / LoRA / DPO / RLAIF） |

## Learning Notes

> 此文件作为整个 MiniMind 学习工程的总索引。随着学习深入，各模块的详细笔记将填充到对应的文档中。
>
> 每个模块的学习遵循统一模板：源码阅读 → 逐行注释 → 单元测试 → 实验验证 → 对比分析。

## External References

- **GitHub Repository**: [jingyaogong/minimind](https://github.com/jingyaogong/minimind) (50.4K+ stars)
- **Official Documentation**: [jingyaogong.github.io/minimind](https://jingyaogong.github.io/minimind)
- **HuggingFace**: [jingyaogong/MiniMind2](https://huggingface.co/jingyaogong/MiniMind2)
- **ArXiv Paper**: _MiniMind: Train a Small Language Model from Scratch_ (pending)

## Questions

- [ ] MiniMind 的设计哲学是什么？（极简 vs 完备 — 如何在 3 个文件中实现完整 LLM）
- [ ] Dense 和 MoE 两种变体在相同参数量下性能差异有多大？
- [ ] 各模块之间的数据流是如何衔接的？（详见 [source-map.md](source-map.md)）
- [ ] 与实际生产级模型（如 Llama、Qwen）的核心差异在哪里？
- [ ] 哪些模块可以独立替换或升级？（Tokenizer、Attention、FFN、Sampler）
- [ ] LoRA 微调在 26M 小模型上的效果是否显著？

## TODO

- [x] 建立 8 个模块的初始文档框架
- [x] 建立学习笔记记录规范
- [x] 完成 MiniMind 仓库全局分析与架构文档
- [ ] 搭建实验环境
- [ ] 制定各模块的学习优先级和依赖关系
- [ ] 完成 Repository Overview（Phase 0）
