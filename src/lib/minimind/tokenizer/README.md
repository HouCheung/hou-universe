# MiniTokenizer

MiniMind 的 V1 词元化器 — 基于空格切分的简单 Word Tokenizer。

## 快速开始

```typescript
import { MiniTokenizer } from "@/lib/minimind/tokenizer";

const tokenizer = new MiniTokenizer();

// 注册词汇
tokenizer.addToken("hello"); // → 4
tokenizer.addToken("world"); // → 5

// 基本 API
tokenizer.tokenize("hello world");  // → ["hello", "world"]
tokenizer.encode("hello world");    // → [4, 5]
tokenizer.decode([4, 5]);           // → "hello world"
```

## 核心 API

| 方法 | 签名 | 说明 |
|------|------|------|
| `tokenize` | `(text: string) => string[]` | 文本 → token 数组，未知词回退为 `<unk>` |
| `encode` | `(text: string) => number[]` | 文本 → id 序列 |
| `decode` | `(ids: number[]) => string` | id 序列 → 文本 |
| `addToken` | `(token: string) => number` | 注册新 token（幂等） |
| `getVocabulary` | `() => { size, tokenToId, idToToken }` | 获取 vocabulary 信息 |
| `explain` | `(text: string) => ExplainResult` | 可解释的 tokenization 分析 |

## Explain API

### 为什么需要 Explain API？

标准的 `encode()` / `decode()` 只返回最终的 id 序列或文本，不提供中间过程的可见性。
**Explain API** 填补了这个空白 — 它在一次调用中展示 tokenization 的完整链路：

```
原始文本 → 切分 → token 数组 → id 映射 → 解码文本
```

这对于以下场景至关重要：

- **调试** — 快速定位哪些词被标记为未知
- **学习** — 可视化 tokenizer 的内部工作机制
- **Playground** — 实时展示 tokenization 过程
- **AI Lab** — 分析 tokenizer 的行为和覆盖范围

### 使用方式

```typescript
const tokenizer = new MiniTokenizer();
tokenizer.addToken("hello");
tokenizer.addToken("world");

const result = tokenizer.explain("hello unknown world");
```

### 返回结构 (`ExplainResult`)

```typescript
{
  originalText: "hello unknown world",

  tokens: [
    { token: "hello",   id: 4, exists: true  },
    { token: "<unk>",   id: 1, exists: false },
    { token: "world",   id: 5, exists: true  },
  ],

  unknownTokens: ["unknown"],

  encoded: [4, 1, 5],

  decoded: "hello <unk> world"
}
```

### Playground 集成指南

Playground 可以直接消费 `ExplainResult` 来构建可视化面板：

```typescript
// 1. 获取 explain 结果
const result = tokenizer.explain(userInput);

// 2. 渲染 token 卡片（逐 token 高亮）
for (const t of result.tokens) {
  renderTokenCard({
    text: t.token,
    id: t.id,
    highlight: t.exists ? "green" : "red",   // 已知 / 未知
  });
}

// 3. 展示编码序列
renderIdSequence(result.encoded);

// 4. 展示往返文本（验证 decode 正确性）
renderRoundTrip(result.originalText, result.decoded);
```

`ExplainResult` 是一个纯数据结构 — 无方法、无副作用，可以直接序列化为 JSON 传递给 UI 组件。

### 设计原则

- **单一职责** — `explain()` 内部调用 `tokenize()` / `encode()` / `decode()`，不重复实现编码逻辑
- **严格类型** — 所有字段使用 TypeScript 严格类型，禁止 `any`
- **零破坏** — Explain API 是纯增量，不修改任何已有方法签名或行为

## Source Reference

> **Tokenizer metadata maintained in:** `src/data/minimind/tokenizer-registry.ts`
>
> All version definitions, feature matrices, and pipeline stage descriptions
> are canonically defined in the tokenizer-registry. Consumers derive their
> data from this single source — see `comparison.ts` and `pipeline.ts` for
> the view-level derivation logic.

## 目录结构

```
tokenizer/
├── index.ts          # 模块统一导出
├── MiniTokenizer.ts  # 分词器主类
├── vocabulary.ts     # token ⇄ id 双向映射
├── types.ts          # Explain API 类型定义
├── pipeline.ts       # TokenizerPipeline 流水线定义
├── stages.ts         # TokenizerStage 阶段枚举
├── comparison.ts     # Learning Edition vs MiniMind 功能对比
├── examples.ts       # 使用示例（5+ 场景）
└── README.md         # 本文件
```

## Architecture Evolution

### 为什么从 Word Tokenizer 开始？

MiniMind 的 tokenizer 实现遵循 **教育优先** 的原则 —— 每一步演进都建立在
前一步的扎实理解之上。

**Learning Edition（当前 V1）** 选择最简单的 Word Tokenizer 作为起点，原因如下：

1. **概念可见** — 用户可以直观地看到"hello world"被切分为 `["hello", "world"]`，
   不需要理解子词合并或字节编码的抽象概念。
2. **调试友好** — Explain API 在一行输出中展示完整链路：
   `原始文本 → tokens → ids → 解码文本`，每一步都透明可追踪。
3. **零依赖** — 不依赖外部语料或预训练 merge rules，所有逻辑在单一文件中自包含。
4. **教学基线** — 作为"可工作的最小实现"，为理解更复杂的 tokenizer 提供对比基准。

### 演进路径

```
Word Tokenizer (V1)         ← 当前 Learning Edition
    │                        基于空白切分，vocabulary 精确匹配
    │
    ▼
Character Tokenizer (V2)    ← 计划中
    │                        单字符切分，消除 OOV 边界情况
    │                        引入 Normalize 阶段（标点/大小写/Unicode）
    │
    ▼
BPE (V3)                    ← 计划中
    │                        Byte Pair Encoding 子词算法
    │                        可训练的 merge rules
    │                        正则预切分（GPT-2 风格）
    │
    ▼
Byte-Level BPE (V4)         ← 计划中
    │                        UTF-8 字节级编码（vocabulary 大小恒定 256）
    │                        OOV 率为 0，支持任意 Unicode
    │                        接近 GPT-4 的 tokenization 行为
    │
    ▼
MiniMind Compatible (V5)    ← 目标
                             Chat Template、流式解码、批量编码
                             与 tiktoken 输出对齐
                             可作为 MiniMind 模型的正式 tokenizer
```

### 架构准备

虽然当前仅实现了 V1 Word Tokenizer，但 **架构已为完整演进做好准备**：

| 能力 | 状态 | 说明 |
|------|------|------|
| **Pipeline 定义** | ✅ 就绪 | `TokenizerPipeline` 数据结构支持任意数量的处理阶段，每个阶段通过 `implemented` 标记追踪状态 |
| **Stage 枚举** | ✅ 就绪 | `TokenizerStage` 枚举已预留 `ByteEncoding`、`BPEMerge`、`SentencePiece` 槽位（注释状态），新增阶段无需修改已有接口 |
| **Feature Comparison** | ✅ 就绪 | `EducationalTokenizerFeatures` 与 `MiniMindTokenizerFeatures` 完整描述了从学习到生产的 14+ 功能差异 |
| **Explain API** | ✅ 就绪 | 结构化输出 `ExplainResult`，支持任何复杂 tokenizer 的中间过程可视化 |
| **Vocabulary** | ✅ 就绪 | `Map` 基于的 O(1) 查表，未来可无缝替换为 Trie 或 BPE merge table |

### 新增 Pipeline 步骤（开发者指南）

当实现新的 tokenization 阶段时，只需：

1. **在 `stages.ts` 中取消注释**对应的枚举成员（如 `ByteEncoding`）
2. **在 `pipeline.ts` 中添加**对应的 `PipelineStep`，标记 `implemented: true`
3. **在 `comparison.ts` 中更新**对应 feature 的 `supported: true`

已有类型的消费者（Playground、AI Lab）**无需任何修改**即可消费新的 pipeline 定义，
因为 `TokenizerPipeline`、`TokenizerStage`、`TokenizerFeature` 都是向后兼容的纯数据结构。

## 特殊 Token

| Token | ID | 用途 |
|-------|----|------|
| `<pad>` | 0 | 填充 |
| `<unk>` | 1 | 未知词回退 |
| `<bos>` | 2 | 序列起始 |
| `<eos>` | 3 | 序列结束 |
