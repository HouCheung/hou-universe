# MiniMind Source Map

> **源码索引** — 建立完整的文件级、类级、函数级源码导航，覆盖 MiniMind 仓库所有核心模块。
>
> Repository: [jingyaogong/minimind](https://github.com/jingyaogong/minimind)

---

## Quick Navigation

| Module | Path | Purpose |
|--------|------|---------|
| [Model Core](#1-model-core) | `model/model_minimind.py` | Transformer 架构定义（Dense + MoE） |
| [LoRA Adapter](#2-lora-adapter) | `model/model_lora.py` | LoRA 低秩适配微调 |
| [Tokenizer](#3-tokenizer) | `model/tokenizer/` | BPE 分词器配置与词汇表 |
| [Pretrain Trainer](#4-pretrain-trainer) | `trainer/pretrain.py` | 无监督预训练 |
| [SFT Trainer](#5-sft-trainer) | `trainer/sft.py` | 全参数监督微调 |
| [LoRA Trainer](#6-lora-trainer) | `trainer/lora.py` | LoRA 高效微调 |
| [DPO Trainer](#7-dpo-trainer) | `trainer/rlhf_dpo.py` | DPO 偏好对齐 |
| [RLAIF Trainer](#8-rlaif-trainer) | `trainer/rlaif.py` | AI 反馈强化学习 |
| [Evaluation](#9-evaluation) | `scripts/eval_llm.py` | CLI 推理与评估 |
| [API Server](#10-api-server) | `scripts/serve_openai_api.py` | OpenAI-compatible API 服务 |
| [Web Demo](#11-web-demo) | `scripts/web_demo.py` | Streamlit 聊天界面 |
| [Model Conversion](#12-model-conversion) | `scripts/convert_model.py` | 模型格式转换与合并 |

---

## 1. Model Core

**File:** `model/model_minimind.py`

### Classes

#### `MiniMindConfig`
```python
@dataclass
class MiniMindConfig:
    # --- DataClass fields ---
    hidden_size: int = 512          # d_model：隐藏层维度
    num_hidden_layers: int = 8      # Transformer Block 层数
    num_attention_heads: int = 16   # Query 头数
    num_key_value_heads: int = 8    # KV 头数（GQA）
    intermediate_size: int = ...    # FFN 中间层维度（SwiGLU 时为 8/3 * hidden_size）
    vocab_size: int = 6400          # 词汇表大小
    max_position_embeddings: int = 32768  # 最大序列长度
    rms_norm_eps: float = 1e-6      # RMSNorm epsilon
    rope_theta: float = 1e6         # RoPE 基频 theta
    use_moe: bool = False           # 是否启用 MoE
    n_routed_experts: int = ...     # MoE 专家数量
    num_experts_per_tok: int = ...  # 每个 token 激活的专家数
    # ... additional fields
```

#### `RMSNorm`
- **Purpose:** Root Mean Square Layer Normalization（替代 LayerNorm，去掉均值中心化）
- **Members:** `weight` (learnable scale), `eps`, `forward(x)`

#### `Attention`
- **Purpose:** Grouped Query Attention (GQA) with Rotary Position Embedding (RoPE)
- **Members:**
  - `q_proj`, `k_proj`, `v_proj`: Q/K/V 线性投影（`nn.Linear`）
  - `o_proj`: Output 投影
  - `num_heads`, `num_key_value_heads`, `head_dim`: 注意力头配置
  - `rope_theta`: RoPE 基频
- **Methods:**
  - `forward(hidden_states, attention_mask?, position_ids?)` → output
  - Internal: `precompute_freqs_cis()` — 预计算 RoPE 频率
  - Internal: `apply_rotary_emb()` — 应用旋转位置编码
  - Internal: `scaled_dot_product_attention()` — 缩放点积注意力（可能调用 `F.scaled_dot_product_attention`）

#### `FeedForward`
- **Purpose:** SwiGLU Feed-Forward Network
- **Members:**
  - `gate_proj`: Gate 投影（`nn.Linear(hidden_size, intermediate_size)`）
  - `up_proj`: Up 投影（`nn.Linear(hidden_size, intermediate_size)`）
  - `down_proj`: Down 投影（`nn.Linear(intermediate_size, hidden_size)`）
  - `act_fn`: `nn.SiLU()` (SwiGLU = SiLU(gate) * up)
- **Methods:**
  - `forward(x)` → `down_proj(act_fn(gate_proj(x)) * up_proj(x))`

#### `MOEFeedForward`
- **Purpose:** Mixture-of-Experts FFN with Top-K routing
- **Members:**
  - `gate`: Router 网络（`nn.Linear(hidden_size, n_routed_experts)`）
  - `experts`: `nn.ModuleList` of `FeedForward` instances
  - `shared_experts`: Optional shared `FeedForward`（后续版本已移除）
  - `n_routed_experts`, `num_experts_per_tok`: 路由配置
- **Methods:**
  - `forward(x)` → Top-K 专家选择 → 各专家计算 → 加权求和

#### `MiniMindBlock`
- **Purpose:** 单个 Decoder Block
- **Members:**
  - `input_layernorm`: `RMSNorm` (Pre-Norm before Attention)
  - `self_attn`: `Attention`
  - `post_attention_layernorm`: `RMSNorm` (Pre-Norm before FFN)
  - `mlp`: `FeedForward` or `MOEFeedForward`
- **Methods:**
  - `forward(hidden_states, attention_mask?)` → output

#### `MiniMind`
- **Purpose:** 完整 Decoder-Only Transformer 模型
- **Inherits:** `nn.Module`, `GenerationMixin`（用于 `generate()` 方法）
- **Members:**
  - `config`: `MiniMindConfig`
  - `embed_tokens`: `nn.Embedding(vocab_size, hidden_size)` — Token 嵌入
  - `layers`: `nn.ModuleList` of `MiniMindBlock`
  - `norm`: `RMSNorm` — 最终层归一化
  - `lm_head`: `nn.Linear(hidden_size, vocab_size)` — 输出投影（与 `embed_tokens` 权重绑定）
- **Methods:**
  - `forward(input_ids, attention_mask?)` → logits
  - `generate(prompt, max_new_tokens, temperature, top_k, top_p, ...)` → generated tokens

### Key Functions

| Function | Scope | Description |
|----------|-------|-------------|
| `precompute_freqs_cis(dim, seq_len, theta)` | module-level | 预计算 RoPE 复数频率旋转矩阵 |
| `apply_rotary_emb(xq, xk, freqs_cis)` | module-level | 将 RoPE 应用到 Query 和 Key 张量 |

---

## 2. LoRA Adapter

**File:** `model/model_lora.py`

### Classes

#### `LoRALinear`
- **Purpose:** LoRA 低秩适配线性层封装
- **Members:**
  - `linear`: 原始 `nn.Linear`
  - `lora_a`, `lora_b`: 低秩分解矩阵 A/B
  - `rank`: 秩 r（典型值 4/8/16）
  - `alpha`: 缩放系数（典型值 16）
  - `dropout`: Optional `nn.Dropout`
  - `merged`: 标志位（推理时可 merge 回原权重）
- **Methods:**
  - `forward(x)` → `linear(x) + (alpha/rank) * lora_b(lora_a(dropout(x)))`
  - `merge()` — 将 LoRA 权重合并回原始权重（推理加速）
  - `unmerge()` — 撤销合并

---

## 3. Tokenizer

**Directory:** `model/tokenizer/`

### Files

| File | Description |
|------|-------------|
| `tokenizer.json` | BPE + ByteLevel 词汇表与合并规则（vocab_size=6400） |
| `tokenizer_config.json` | 特殊 Token 配置和分词器参数 |
| `tokenizer_config.json` | 特殊 Token 定义（见下表） |

### Special Tokens

| Token | ID | Purpose |
|-------|-----|---------|
| `<\|im_start\|>` | — | 对话轮次起始标记 |
| `<\|im_end\|>` | — | 对话轮次结束标记 |
| `<\|unk\|>` | — | 未知 token 占位符 |
| `<tool_call>` | — | Tool Calling 起始标记 |
| `<tool_response>` | — | Tool Calling 响应标记 |
| `<think>` | — | 思考链（Chain-of-Thought）起始标记 |

### Tokenizer API (via HuggingFace `tokenizers`)

| Method | Description |
|--------|-------------|
| `encode(text) → List[int]` | 文本 → Token ID 序列 |
| `decode(ids) → str` | Token ID 序列 → 文本 |
| `get_vocab_size() → int` | 返回 6400 |

---

## 4. Pretrain Trainer

**File:** `trainer/pretrain.py`

### Purpose
从随机初始化权重开始，在大规模文本语料上进行下一 token 预测（Causal Language Modeling）训练。

### Key Functions

| Function | Description |
|----------|-------------|
| `main()` | 训练入口：参数解析、模型初始化、数据加载、训练循环 |
| `train_epoch(model, loader, optimizer, scheduler, scaler)` | 单个 epoch 的训练循环 |

### Training Config

| Parameter | Typical Value | Description |
|-----------|---------------|-------------|
| `learning_rate` | 1e-3 ~ 5e-4 | 学习率（Cosine 衰减 + Warmup） |
| `batch_size` | 32 ~ 128 | 批次大小 |
| `max_seq_len` | 512 ~ 768 | 最大序列长度 |
| `epochs` | 1 ~ 3 | 训练轮数 |
| `warmup_steps` | 100 ~ 500 | 预热步数 |
| `grad_clip` | 1.0 | 梯度裁剪阈值 |
| `dtype` | bfloat16 / float16 | 混合精度训练 |

### Supported Features
- DDP (Distributed Data Parallel) 多卡训练
- DeepSpeed ZeRO 优化
- `torch.cuda.amp` 混合精度
- wandb / swanlab 可视化
- 断点续训（`_resume.pth` 检查点）

---

## 5. SFT Trainer

**File:** `trainer/sft.py`

### Purpose
在预训练模型基础上，使用对话格式的指令数据进行全参数监督微调。

### Key Functions

| Function | Description |
|----------|-------------|
| `main()` | SFT 训练入口 |
| `format_chat(conversations)` | 将对话数据格式化为 Chat Template 格式 |
| `train_epoch(model, loader, ...)` | SFT 训练循环 |

### Data Format
```json
{
  "conversations": [
    {"role": "user", "content": "你好，请介绍一下自己"},
    {"role": "assistant", "content": "我是 MiniMind，一个小型语言模型..."}
  ]
}
```

### Loss
仅计算 `assistant` 部分的 Cross-Entropy Loss（忽略 user 部分的 loss）。

---

## 6. LoRA Trainer

**File:** `trainer/lora.py`

### Purpose
使用 LoRA 低秩适配技术在冻结的基座模型上进行高效微调，适配医疗问答、自我认知等垂直领域。

### Key Functions

| Function | Description |
|----------|-------------|
| `main()` | LoRA 训练入口 |
| `apply_lora(model, rank, alpha, target_modules)` | 将 LoRA 注入模型的目标模块 |

### LoRA Config

| Parameter | Typical Value | Description |
|-----------|---------------|-------------|
| `rank` | 4 / 8 / 16 | 低秩分解秩 r |
| `alpha` | 16 | 缩放系数 |
| `target_modules` | `["q_proj", "v_proj"]` | 注入 LoRA 的目标层 |
| `learning_rate` | 1e-4 | 学习率（比全参数微调高） |

---

## 7. DPO Trainer

**File:** `trainer/rlhf_dpo.py`

### Purpose
使用 DPO（Direct Preference Optimization）算法进行人类偏好对齐，无需显式训练 Reward Model。

### Key Functions

| Function | Description |
|----------|-------------|
| `main()` | DPO 训练入口 |
| `dpo_loss(policy_chosen_logp, policy_rejected_logp, ref_chosen_logp, ref_rejected_logp, beta)` | DPO 损失函数 |

### Data Format
```json
{
  "chosen": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "good response"}],
  "rejected": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "bad response"}]
}
```

### DPO Loss Formula
```
L_DPO = -log(sigma(beta * (log_pi(chosen) - log_pi(rejected)) - beta * (log_ref(chosen) - log_ref(rejected))))
```
其中 `pi` 为当前策略模型，`ref` 为冻结的参考模型。

---

## 8. RLAIF Trainer

**File:** `trainer/rlaif.py`

### Purpose
使用 AI 反馈替代人类反馈进行强化学习训练，支持 PPO / GRPO / CISPO 算法。

### Key Functions

| Function | Description |
|----------|-------------|
| `main()` | RLAIF 训练入口 |
| `compute_rewards(responses, reward_model)` | 使用 Reward Model 计算奖励分数 |

---

## 9. Evaluation

**File:** `scripts/eval_llm.py`

### Purpose
命令行交互式推理，支持多种解码策略。

### Key Functions

| Function | Description |
|----------|-------------|
| `load_model(checkpoint_path)` | 加载训练好的模型权重 |
| `chat(model, tokenizer, prompt, **gen_kwargs)` | 单轮对话推理 |
| `stream_chat(model, tokenizer, prompt, **gen_kwargs)` | 流式输出推理 |

### Sampling Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `temperature` | 0.7 | 温度系数（越高越随机） |
| `top_k` | 50 | Top-K 采样候选数 |
| `top_p` | 0.9 | Nucleus Sampling 累积概率阈值 |
| `max_new_tokens` | 512 | 最大生成长度 |
| `rope_scaling` | — | RoPE 上下文扩展（NTK / YaRN） |

---

## 10. API Server

**File:** `scripts/serve_openai_api.py`

### Purpose
FastAPI 服务，提供 OpenAI-compatible `/v1/chat/completions` 接口。

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat Completion（兼容 OpenAI SDK） |
| `/v1/models` | GET | 返回可用模型列表 |

### Key Functions

| Function | Description |
|----------|-------------|
| `app` | FastAPI 应用实例 |
| `@app.post("/v1/chat/completions")` | Chat Completion 端点处理 |
| `stream_response(model, tokenizer, messages)` | 流式 SSE 响应生成 |

### Supported Features
- `reasoning_content` 思考链内容
- `tool_calls` Tool Calling
- `open_thinking` 开启思考模式
- SSE (Server-Sent Events) 流式输出

---

## 11. Web Demo

**File:** `scripts/web_demo.py`

### Purpose
Streamlit 聊天界面，支持思考过程展示和多轮对话。

### Key Functions

| Function | Description |
|----------|-------------|
| `main()` | Streamlit UI 入口 |
| `render_message(msg)` | 渲染单条消息（含思考过程折叠） |
| `handle_user_input(prompt)` | 处理用户输入并生成回复 |

---

## 12. Model Conversion

**File:** `scripts/convert_model.py`

### Purpose
在不同格式之间转换模型权重。

### Supported Conversions

| From | To | Description |
|------|-----|-------------|
| Native `.pth` | MiniMind Transformers | 转为 HuggingFace `transformers` 兼容格式 |
| Native `.pth` | Qwen3 / Qwen3-MoE | 转为 Qwen3 架构权重 |
| LoRA (.pth) | Merged (.pth) | LoRA 权重合并回基座模型 |

### Key Functions

| Function | Description |
|----------|-------------|
| `convert_to_transformers(native_ckpt, output_dir)` | 转换为 Transformers 格式 |
| `convert_to_qwen3(native_ckpt, output_dir)` | 转换为 Qwen3 格式 |
| `merge_lora(base_ckpt, lora_ckpt, output_path)` | LoRA 权重合并 |

---

## Dependency Graph

```
model/model_minimind.py ←── model/model_lora.py (references Attention, FeedForward)
        │
        ├──←── trainer/pretrain.py
        ├──←── trainer/sft.py
        ├──←── trainer/lora.py
        ├──←── trainer/rlhf_dpo.py
        └──←── trainer/rlaif.py
        │
        ├──←── scripts/eval_llm.py
        ├──←── scripts/serve_openai_api.py
        ├──←── scripts/web_demo.py
        └──←── scripts/convert_model.py
```

All trainer scripts and evaluation scripts depend on `model/model_minimind.py`. Only `trainer/lora.py` additionally depends on `model/model_lora.py`.

---

## Key External Dependencies

| Package | Usage |
|---------|-------|
| `torch` (`>= 2.0`) | 核心深度学习框架 |
| `transformers` | Tokenizer 加载（仅推理/转换时） |
| `tokenizers` | BPE Tokenizer 训练与加载 |
| `fastapi` + `uvicorn` | API 服务 |
| `streamlit` | Web Demo UI |
| `wandb` / `swanlab` | 训练可视化（可选） |
| `deepspeed` | 分布式训练加速（可选） |
