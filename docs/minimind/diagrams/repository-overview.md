# MiniMind Global Data Flow

> **Mermaid 架构图集** — 覆盖从 Raw Text 到 Inference 的完整数据流，以及训练管线的全生命周期。

---

## 1. Overall Pipeline: Raw Text → Inference

```mermaid
flowchart LR
    subgraph Input["📥 Input"]
        A["Raw Text / Prompt"]
    end

    subgraph Tokenizer["🔤 Tokenizer (BPE + ByteLevel)"]
        B1["Pre-Tokenization<br/>(Unicode → Bytes)"]
        B2["BPE Merge<br/>(vocab_size=6400)"]
        B3["Token ID Sequence<br/>List[int]"]
    end

    subgraph Embedding["📊 Embedding Layer"]
        C1["Token Embedding<br/>nn.Embedding(6400, d_model)"]
        C2["Token Vectors<br/>[batch, seq_len, d_model]"]
    end

    subgraph Transformer["🧠 N × MiniMindBlock (Decoder-Only)"]
        direction TB
        D1["RMSNorm"]
        D2["GQA Attention<br/>(RoPE + Causal Mask)"]
        D3["Residual Add (+)"]
        D4["RMSNorm"]
        D5["SwiGLU FFN / MoE FFN"]
        D6["Residual Add (+)"]
        D1 --> D2 --> D3 --> D4 --> D5 --> D6
    end

    subgraph Head["🎯 Output Head"]
        E1["Final RMSNorm"]
        E2["LM Head (Linear)<br/>d_model → vocab_size<br/>(Weight Tied with Embedding)"]
    end

    subgraph Sampler["🎲 Sampler"]
        F1["Logits → Probabilities<br/>(Softmax / Temperature)"]
        F2["Sampling Strategy<br/>(Greedy / Top-K / Top-P)"]
        F3["Next Token ID"]
    end

    subgraph Loop["🔄 Autoregressive Loop"]
        G1["Append token to sequence"]
        G2["KV Cache<br/>(reuse past keys/values)"]
    end

    subgraph Output["📤 Output"]
        H1["Generated Text<br/>(detokenized)"]
    end

    Input --> Tokenizer
    B1 --> B2 --> B3
    Tokenizer --> Embedding
    C1 --> C2
    Embedding --> Transformer
    D6 --> E1 --> E2
    Transformer --> Head
    Head --> Sampler
    F1 --> F2 --> F3
    Sampler --> Loop
    G1 --> G2 --> Transformer
    Loop -->|"EOS or max_new_tokens"| Output
    Loop -->|"continue"| Transformer
```

---

## 2. MiniMindBlock Internal Data Flow

```mermaid
flowchart TD
    IN["Input Hidden States<br/>[batch, seq_len, d_model]"]
    
    subgraph AttentionPath["Attention Path"]
        N1["RMSNorm"]
        Q["Q = q_proj(x) : [batch, seq_len, num_q_heads * head_dim]"]
        K["K = k_proj(x) : [batch, seq_len, num_kv_heads * head_dim]"]
        V["V = v_proj(x) : [batch, seq_len, num_kv_heads * head_dim]"]
        ROPE["Apply RoPE to Q, K<br/>precompute_freqs_cis()"]
        RESHAPE["Reshape to Multi-Head<br/>[batch, heads, seq_len, head_dim]"]
        GQA["Repeat KV Heads<br/>(GQA: num_q_heads / num_kv_heads groups)"]
        SDPA["Scaled Dot-Product Attention<br/>softmax(Q·K^T / √d) · V<br/>+ Causal Mask"]
        MERGE["Merge Heads → [batch, seq_len, d_model]"]
        O_PROJ["o_proj() Output Projection"]
    end

    ADD1["Residual Add (+)"]

    subgraph FFNPath["FFN / MoE Path"]
        N2["RMSNorm"]
        subgraph SwiGLU["SwiGLU FFN"]
            GATE["gate_proj(x) : [batch, seq_len, intermediate_size]"]
            UP["up_proj(x) : [batch, seq_len, intermediate_size]"]
            ACT["SiLU(gate) ⊙ up"]
            DOWN["down_proj(activated) : [batch, seq_len, d_model]"]
        end
        subgraph MoE["MoE FFN (Optional)"]
            ROUTER["Router: gate(x) → Top-K expert weights"]
            EXPS["K × FeedForward Experts"]
            COMBINE["Weighted Sum of Expert Outputs"]
            ROUTER --> EXPS --> COMBINE
        end
    end

    ADD2["Residual Add (+)"]
    OUT["Output Hidden States<br/>[batch, seq_len, d_model]"]

    IN --> N1
    N1 --> Q
    N1 --> K
    N1 --> V
    Q --> ROPE
    K --> ROPE
    ROPE --> RESHAPE
    V --> RESHAPE
    RESHAPE --> GQA
    GQA --> SDPA
    SDPA --> MERGE
    MERGE --> O_PROJ
    O_PROJ --> ADD1
    ADD1 -->|"+ Input"| N2
    ADD1 -.->|"skip connection"| ADD1
    N2 --> GATE
    N2 --> UP
    GATE --> ACT
    UP --> ACT
    ACT --> DOWN
    DOWN --> ADD2
    ADD2 -->|"+ Post-Attention"| OUT
    ADD1 -.->|"skip connection"| ADD2
```

---

## 3. Training Pipeline: End-to-End Lifecycle

```mermaid
flowchart TD
    subgraph Phase0["Phase 0: Data Preparation"]
        RAW["Raw Text Corpus"]
        TOK_TRAIN["Train BPE Tokenizer<br/>train_tokenizer.py"]
        VOCAB["vocab_size = 6400<br/>tokenizer.json"]
        DATA_FMT["Format Data to JSONL<br/>(pretrain / sft / dpo formats)"]
    end

    subgraph Phase1["Phase 1: Pretrain"]
        INIT["Random Init<br/>MiniMindConfig()"]
        PT_DATA["pretrain_hq.jsonl<br/>(text → token IDs)"]
        PT_LOOP["Causal LM Training<br/>next-token prediction"]
        PT_LOSS["Cross-Entropy Loss<br/>L = -log P(next_token | context)"]
        PT_CKPT["Base Model<br/>pretrain_512.pth / pretrain_768.pth"]
    end

    subgraph Phase2["Phase 2: Supervised Fine-Tuning"]
        PT_LOAD["Load Pretrained Weights"]
        SFT_DATA["sft_512.jsonl / sft_1024.jsonl<br/>(conversations → chat template)"]
        SFT_LOOP["SFT Training<br/>loss only on assistant tokens"]
        SFT_LOSS["Cross-Entropy Loss<br/>(masked: assistant only)"]
        SFT_CKPT["Chat Model<br/>full_sft_512.pth / full_sft_768.pth"]
    end

    subgraph Phase3["Phase 3: Alignment"]
        direction LR
        subgraph DPO["DPO Path"]
            DPO_DATA["dpo.jsonl<br/>(chosen vs rejected pairs)"]
            DPO_REF["Reference Model<br/>(frozen SFT)"]
            DPO_LOSS["DPO Loss<br/>L = -log σ(β·Δlogp)"]
            DPO_CKPT["DPO Model"]
        end
        subgraph RLAIF["RLAIF Path"]
            RL_DATA["rlaif.jsonl<br/>(prompts only)"]
            RM["Reward Model"]
            PPO["PPO / GRPO / CISPO"]
            RL_CKPT["RL-Aligned Model"]
        end
        subgraph LORA["LoRA Path"]
            LORA_DATA["lora_medical.jsonl<br/>lora_identity.jsonl"]
            LORA_INJECT["Inject LoRA Adapters<br/>(rank=8, alpha=16)"]
            LORA_TRAIN["Train A/B Matrices<br/>(frozen base weights)"]
            LORA_CKPT["LoRA Weights<br/>(mergeable with base)"]
        end
    end

    subgraph Phase4["Phase 4: Deployment"]
        CONVERT["Model Conversion<br/>convert_model.py"]
        API["OpenAI-compatible API<br/>serve_openai_api.py"]
        WEB["Streamlit Web Demo<br/>web_demo.py"]
        CLI["CLI Evaluation<br/>eval_llm.py"]
    end

    RAW --> TOK_TRAIN --> VOCAB
    RAW --> DATA_FMT

    INIT --> PT_LOOP
    PT_DATA --> PT_LOOP
    PT_LOOP --> PT_LOSS --> PT_CKPT

    PT_CKPT --> PT_LOAD
    PT_LOAD --> SFT_LOOP
    SFT_DATA --> SFT_LOOP
    SFT_LOOP --> SFT_LOSS --> SFT_CKPT

    SFT_CKPT --> DPO
    SFT_CKPT --> RLAIF
    SFT_CKPT --> LORA

    DPO_CKPT --> CONVERT
    RL_CKPT --> CONVERT
    LORA_CKPT --> CONVERT
    SFT_CKPT --> CONVERT

    CONVERT --> API
    CONVERT --> WEB
    CONVERT --> CLI

    DATA_FMT --> PT_DATA
    DATA_FMT --> SFT_DATA
    DATA_FMT --> DPO_DATA
    DATA_FMT --> LORA_DATA
```

---

## 4. Autoregressive Inference Loop (with KV Cache)

```mermaid
sequenceDiagram
    participant User
    participant Tokenizer
    participant Model
    participant KV_Cache as KV Cache
    participant Sampler
    participant Decoder

    User->>Tokenizer: "你好，请介绍一下自己"
    Tokenizer->>Tokenizer: BPE Encode
    Tokenizer->>Model: input_ids: [bos, tok1, tok2, ...]

    loop Prefill Phase (prompt tokens)
        Model->>Model: Embedding Layer
        loop Each MiniMindBlock
            Model->>Model: RMSNorm → Attention(Q,K,V)
            Model->>KV_Cache: Store K, V for each layer
            Model->>Model: RMSNorm → SwiGLU FFN
        end
        Model->>Model: Final RMSNorm → LM Head
    end

    Model->>Sampler: logits for last position

    loop Decode Phase (autoregressive)
        Sampler->>Sampler: Softmax + Temperature Scaling
        Sampler->>Sampler: Top-K / Top-P Filter
        Sampler->>Sampler: Sample next token
        Sampler->>Model: next_token_id

        alt token == eos_token
            Sampler->>Decoder: End Generation
            Decoder->>User: "我是 MiniMind，一个小型语言模型..."
        else continue
            Model->>Model: Embed single token
            loop Each MiniMindBlock
                Model->>KV_Cache: Fetch past K, V
                Model->>Model: Attention(Q_new, K_cached, V_cached)
                Model->>KV_Cache: Append K_new, V_new
                Model->>Model: SwiGLU FFN
            end
            Model->>Model: LM Head → logits
            Model->>Sampler: next token logits
        end
    end
```

---

## 5. File Dependency Map

```mermaid
flowchart TD
    subgraph Core["model/ (Core)"]
        MM["model_minimind.py<br/>MiniMind, MiniMindBlock<br/>Attention, FeedForward<br/>MOEFeedForward, RMSNorm"]
        LORA_CORE["model_lora.py<br/>LoRALinear"]
        TOK["tokenizer/<br/>tokenizer.json<br/>tokenizer_config.json"]
    end

    subgraph Trainers["trainer/ (Training)"]
        PT["pretrain.py"]
        SFT["sft.py"]
        LORA_TR["lora.py"]
        DPO["rlhf_dpo.py"]
        RL["rlaif.py"]
    end

    subgraph Scripts["scripts/ (Tools)"]
        EVAL["eval_llm.py"]
        API["serve_openai_api.py"]
        WEB["web_demo.py"]
        CONV["convert_model.py"]
    end

    MM --> PT
    MM --> SFT
    MM --> LORA_TR
    MM --> DPO
    MM --> RL
    LORA_CORE --> LORA_TR
    MM --> EVAL
    MM --> API
    MM --> WEB
    MM --> CONV
    TOK --> EVAL
    TOK --> API
    TOK --> WEB
```

---

## 6. Data Format Specifications

```mermaid
flowchart LR
    subgraph Pretrain["Pretrain Format"]
        PT_FMT["{&quot;text&quot;: &quot;...raw corpus...&quot;}"]
    end

    subgraph SFT["SFT Format"]
        SFT_FMT["{&quot;conversations&quot;: [<br/>  {&quot;role&quot;: &quot;user&quot;, &quot;content&quot;: &quot;...&quot;},<br/>  {&quot;role&quot;: &quot;assistant&quot;, &quot;content&quot;: &quot;...&quot;}<br/>]}"]
    end

    subgraph DPO["DPO Format"]
        DPO_FMT["{<br/>  &quot;chosen&quot;: [conversations],<br/>  &quot;rejected&quot;: [conversations]<br/>}"]
    end

    subgraph Agent["Agent Format"]
        AGT_FMT["{<br/>  &quot;conversations&quot;: [<br/>    ...<br/>    {&quot;role&quot;: &quot;tool&quot;, &quot;content&quot;: &quot;...&quot;}<br/>  ]<br/>}"]
    end
```

---

> **Note:** All diagrams follow the actual MiniMind architecture as implemented in [jingyaogong/minimind](https://github.com/jingyaogong/minimind). These are documentation artifacts for the learning project — no implementations are included.
