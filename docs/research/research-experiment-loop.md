# MiniMind Research Experiment Loop (Phase 60)

> **核心能力：** 将 MiniMind 从"能训练 GPT"升级为"可重复、可比较、可分析、可追踪的 GPT 研究实验平台"。

## 目录

1. [核心概念：Experiment vs Run](#核心概念experiment-vs-run)
2. [ResearchExperiment — 实验定义](#researchexperiment--实验定义)
3. [ResearchRun — 运行记录](#researchrun--运行记录)
4. [ResearchExperimentStore — 持久化存储](#researchexperimentstore--持久化存储)
5. [ExperimentQueue — 实验队列](#experimentqueue--实验队列)
6. [ResearchExperimentRunner — 训练执行器](#researchexperimentrunner--训练执行器)
7. [Baseline / Ablation Workflow](#baseline--ablation-workflow)
8. [ReproducibilityCertificate — 可重复性认证](#reproducibilitycertificate--可重复性认证)
9. [ResearchReport v2 — 扩展研究报表](#researchreport-v2--扩展研究报表)
10. [Next Experiment — 下一个实验建议](#next-experiment--下一个实验建议)
11. [架构总览](#架构总览)
12. [使用示例](#使用示例)

---

## 核心概念：Experiment vs Run

| | ResearchExperiment | ResearchRun |
|---|---|---|
| **是什么** | 实验定义/计划（WHAT to run） | 执行记录（WHAT happened） |
| **关系** | 一个 experiment 可以有多个 run | 每个 run 属于一个 experiment |
| **包含** | 模型配置、训练超参、数据集、分词器、评估配置 | 训练指标、loss 曲线、生成结果、分析 |
| **生命周期** | `draft → ready → running → completed → archived` | `pending → running → completed / failed / cancelled` |
| **可重复性** | 可被多次运行 | 每次运行产生独立的 run 记录 |

**设计哲学：** 实验定义（plan）与执行结果（record）严格分离，使得同一个实验可以被不同 seed 重复运行，结果可比较。

---

## ResearchExperiment — 实验定义

### Schema

```typescript
interface ResearchExperiment {
  id: string;                          // "exp-{timestamp}-{random}"
  name: string;                        // 人类可读的实验名称
  description: string;                 // 实验目的/假设
  createdAt: number;                   // 创建时间戳 (ms)
  updatedAt: number;                   // 最后更新时间戳
  seed: number;                        // 随机种子（可重复性关键）
  status: ResearchExperimentStatus;    // 生命周期状态

  modelConfig: ModelConfigEntry;       // 模型架构参数
  trainingConfig: TrainingRecipe;      // 训练超参
  datasetConfig: DatasetConfig;        // 数据集配置
  tokenizerConfig: TokenizerConfig;    // 分词器配置
  evaluationConfig: EvaluationConfig;  // 评估配置

  tags: string[];                      // 组织标签
  baselineExperimentId?: string;       // 基线实验 ID（消融研究）
}
```

### 生命周期

```
draft → ready → running → completed → archived
  ↑        ↑         ↑
  └────────┴─────────┘ (随时可 archive)
```

### 工厂函数

```typescript
const exp = createResearchExperiment({
  name: "TinyStories baseline",
  description: "Baseline training on TinyStories with GPT-tiny",
  seed: 42,
  modelConfig: getModelConfig("gpt-tiny"),
  trainingConfig: loadRecipe("quick-train"),
  datasetConfig: { name: "tinystories", blockSize: 64, batchSize: 8, shuffle: true },
});
```

### 关键 API

| 函数 | 说明 |
|---|---|
| `createResearchExperiment(params)` | 创建新实验（status: draft） |
| `cloneResearchExperiment(experiment, overrides?)` | 深拷贝实验（新 ID，新 createdAt） |
| `validateResearchExperiment(value)` | 验证实验结构（抛出或通过） |
| `isResearchExperiment(value)` | 类型守卫 |
| `serializeResearchExperiment(exp)` | 序列化为 JSON 字符串 |
| `deserializeResearchExperiment(json)` | 从 JSON 字符串反序列化 |
| `generateExperimentId()` | 生成唯一实验 ID |

---

## ResearchRun — 运行记录

### Schema

```typescript
interface ResearchRun {
  runId: string;                       // "run-{timestamp}-{random}"
  experimentId: string;                // 所属实验 ID
  startedAt: number;                   // 开始时间戳
  completedAt: number;                 // 完成时间戳（0 表示未完成）
  status: ResearchRunStatus;           // pending | running | completed | failed | cancelled
  seed: number;                        // 本次运行的随机种子

  // 训练指标
  initialLoss: number;                 // 初始 loss
  finalLoss: number;                   // 最终 loss
  bestLoss: number;                    // 最佳 loss
  perplexity: number;                  // 困惑度
  tokensPerSecond: number;             // 吞吐量
  totalTokens: number;                 // 总 token 数
  totalSteps: number;                  // 总步数
  totalEpochs: number;                 // 总 epoch 数
  durationMs: number;                  // 训练耗时

  // 检查点
  checkpointId?: string;

  // 生成结果
  generationBefore: RunGenerationResult[];  // 训练前生成
  generationAfter: RunGenerationResult[];   // 训练后生成

  // 分析
  analysis: RunAnalysis | null;

  // 可重复性
  reproducibility: RunReproducibility | null;

  // 报表
  reportId?: string;

  // 错误
  errorMessage?: string;               // 失败时的错误信息
}
```

### 生命周期转换

```
pending ──start──→ running ──complete──→ completed
   │                  │
   ├──fail──→ failed   ├──fail──→ failed
   │                   │
   └──cancel──→ cancelled
```

### 关键 API

| 函数 | 说明 |
|---|---|
| `createResearchRun(experimentId, seed, runId?)` | 创建 run（status: pending） |
| `startResearchRun(run)` | pending → running |
| `completeResearchRun(run, results)` | running → completed（记录所有指标） |
| `failResearchRun(run, errorMessage)` | pending/running → failed |
| `cancelResearchRun(run)` | pending/running → cancelled |
| `validateResearchRun(value)` | 验证 run 结构 |
| `isResearchRun(value)` | 类型守卫 |
| `getRunDuration(run)` | 获取运行时长 |
| `compareRunsByBestLoss(a, b)` | 按 loss 排序 |
| `compareRunsBySpeed(a, b)` | 按速度排序 |
| `summarizeRun(run)` | 生成可读摘要 |
| `generateRunId()` | 生成唯一 run ID |

---

## ResearchExperimentStore — 持久化存储

### 存储方案

- **浏览器环境：** `localStorage`
- **Key 命名：** `"minimind-research-experiments"` 和 `"minimind-research-runs"`
- **Schema 版本化：** `{ v: 1, items: T[] }`
- **容错策略：** 损坏数据自动清理，无效条目过滤跳过

### CRUD API

#### Experiment CRUD

| 函数 | 说明 |
|---|---|
| `createExperiment(experiment)` | 保存/覆盖实验 |
| `getExperiment(id)` | 获取单个实验（防御性拷贝） |
| `listExperiments()` | 列出所有实验（按 createdAt 降序） |
| `updateExperiment(id, updates)` | 更新实验字段 |
| `deleteExperiment(id)` | 删除实验及其所有 run |
| `experimentCount()` | 实验总数 |
| `hasExperiment(id)` | 检查实验是否存在 |

#### Run CRUD

| 函数 | 说明 |
|---|---|
| `createRun(run)` | 保存/覆盖 run |
| `getRun(runId)` | 获取单个 run |
| `listRuns()` | 列出所有 run |
| `listRunsByExperiment(experimentId)` | 按实验筛选 run |
| `updateRun(runId, updates)` | 更新 run 字段 |
| `deleteRun(runId)` | 删除单个 run |
| `deleteRunsByExperiment(experimentId)` | 删除实验的所有 run |
| `getLatestRun(experimentId)` | 获取最新 run |
| `getBestRun(experimentId)` | 获取最佳 run（按 bestLoss） |
| `runCount(experimentId?)` | run 计数 |
| `totalRuns()` | run 总数 |
| `hasRun(runId)` | 检查 run 是否存在 |

#### 导入/导出

| 函数 | 说明 |
|---|---|
| `exportExperiment(id)` | 导出单个实验为 JSON |
| `importExperiment(json)` | 从 JSON 导入实验 |
| `exportRun(runId)` | 导出单个 run 为 JSON |
| `importRun(json)` | 从 JSON 导入 run |
| `exportAll()` | 导出所有实验和 run 为 JSON |
| `importAll(json)` | 从 JSON 导入全部数据 |
| `clearAll()` | 清除所有数据 |

---

## ExperimentQueue — 实验队列

### 设计

单进程 FIFO 队列，用于管理实验运行顺序。

```typescript
const queue = new ExperimentQueue();

// 入队
const id = queue.queue("exp-abc", "TinyStories Experiment");

// 查看队列状态
queue.size();           // 总数
queue.size("pending");   // 等待中的数量
queue.size("running");   // 正在运行的数量
queue.hasPending();     // 是否有等待项
queue.isRunning();      // 是否正在运行
queue.isIdle();         // 是否空闲

// 出队并开始运行
const item = queue.dequeue();  // FIFO: 先进先出
// item.status === "running"

// 查看下一个（不取出）
const next = queue.peek();

// 状态转换
queue.complete(itemId);
queue.fail(itemId, "Out of memory");
queue.cancel(itemId);

// 汇总
const s = queue.summary();
// { total: 3, pending: 0, running: 0, completed: 2, failed: 1, cancelled: 0 }
```

### QueueItem 状态

```
pending → running → completed | failed | cancelled
```

---

## ResearchExperimentRunner — 训练执行器

### 架构

实验运行的核心编排器。不包含模拟数据 — 所有指标来自真实训练。

```
ResearchExperimentRunner
  └── TrainingExecutor (接口)
        ├── createInlineTrainingExecutor(corpus)  ← 浏览器安全
        └── (Node executor — 未来扩展)
```

### 执行流程

```
1.  验证实验定义
2.  创建 ResearchRun 记录 (status: pending)
3.  设置为 running，保存到 store
4.  发送 training:start 事件
5.  委托给 TrainingExecutor 执行训练
      ├── 设置随机种子
      ├── 构建 BPETokenizer
      ├── 构建 TextDataset + DataLoader
      ├── 构建 TensorMiniMindModel
      ├── 构建 AdamWOptimizer + CosineScheduler
      ├── 生成 BEFORE（训练前文本生成）
      ├── 运行 Trainer（真实前向/反向传播）
      ├── 每步回调：发送 training:step 事件
      ├── 生成 AFTER（训练后文本生成）
      └── 收集所有指标
6.  完成 run（记录所有指标和生成结果）
7.  保存到 store
8.  发送 training:complete 事件
```

### 真实训练集成

`createInlineTrainingExecutor(corpus)` 使用内联文本语料库，构建完整的训练流程：

- **BPETokenizer** — 在语料库上训练
- **TextDataset** — 从语料库切分 block
- **DataLoader** — 批处理 + shuffle
- **TensorMiniMindModel** — 真实 MiniMind 模型
- **AdamWOptimizer** — AdamW 优化器
- **CosineScheduler** — 余弦退火学习率调度
- **Trainer** — 真实训练循环
- **GenerationEvaluator** — 训练前后文本生成

**所有指标均来自真实训练，无模拟数据。**

### 使用方式

```typescript
const corpus = ["the cat sat on the mat", "the dog ran in the park", /* ... */];
const executor = createInlineTrainingExecutor(corpus);
const runner = new ResearchExperimentRunner({ executor });

const result = await runner.run(experiment);
// result.run — 完成的 ResearchRun（含所有指标）
// result.training — 原始 TrainingExecutionResult（含 loss 历史）
```

---

## Baseline / Ablation Workflow

### Baseline

训练基线实验，收集所有指标。

```typescript
const workflow = new BaselineWorkflow(runner);
const baseline = await workflow.runBaseline(experiment);
// baseline.result.run — 完成的 run
// baseline.result.metrics — 所有指标
// baseline.result.summary — 可读摘要
```

### Ablation（消融实验）

克隆基线实验，应用变体定义，比较结果。

```typescript
const variants: AblationVariantDef[] = [
  {
    name: "No weight decay",
    overrides: {
      trainingConfig: { optimizer: { weightDecay: 0 } },  // 部分覆盖
    },
  },
  {
    name: "Half layers",
    overrides: {
      modelConfig: { numLayers: 1 },
    },
  },
];

const result = await workflow.runAblation(experiment, variants);
// result.baseline — 基线结果
// result.variants — 每个变体的结果
// result.winners — 最佳表现者（由 ComparisonInsightEngine 判定）
// result.summary — 汇总输出
```

### AblationVariantDef

```typescript
interface AblationVariantDef {
  name: string;                                       // 人类可读名称
  description?: string;                               // 变体说明
  overrides: Partial<ResearchExperiment>;              // 要覆盖的字段
}
```

---

## ReproducibilityCertificate — 可重复性认证

### 指纹（Fingerprint）

使用 **FNV-1a 32-bit 哈希** 对实验配置生成确定性指纹：

- `stableStringify(obj)` — 排序 key 的确定性 JSON 序列化
- `fnv1a32(str)` — FNV-1a 哈希（偏移基 2166136261，质数 16777619）
- 分组件指纹：model / tokenizer / dataset / training / evaluation
- `combined` — 所有组件指纹的联合哈希

**相同配置 → 相同指纹（确定性的）**

### 认证证书

```typescript
interface ReproducibilityCertificate {
  seed: number;
  fingerprints: {
    model: string;       // 8 位 hex
    tokenizer: string;
    dataset: string;
    training: string;
    evaluation: string;
    combined: string;
  };
  matches: {
    lossMatch: boolean;         // |bestLoss_a - bestLoss_b| ≤ tolerance
    maxLossDiff: number;
    checkpointMatch: boolean;   // 检查点 ID 匹配
    generationMatch: boolean;   // 生成文本匹配
    randomStateMatch: boolean;  // seed 相同
  };
  overall: {
    reproducible: boolean;      // 所有匹配项均通过
    confidence: number;         // 0-1（通过项比例）
    verdict: string;            // 人类可读结论
  };
  meta: { /* ... */ };
}
```

### 使用方式

```typescript
const cert = new ReproducibilityCertificate();
const certificate = cert.generate(experiment, runA, runB);
// certificate.overall.reproducible → true/false
// certificate.overall.confidence → 0-1

// 单次运行指纹（无需第二次运行）
const fingerprint = cert.generateFingerprint(experiment);
```

---

## ResearchReport v2 — 扩展研究报表

在 Phase 59 ResearchReport 基础上扩展，新增以下部分：

### 新增报表部分

| 部分 | 说明 |
|---|---|
| **Convergence Analysis** | 收敛分析：loss 降低百分比、是否收敛 |
| **Stability Analysis** | 稳定性分析：训练稳定性评分 0-1 |
| **Generation Before/After** | 训练前后文本生成对比 |
| **Checkpoint** | 检查点信息 |
| **Comparison** | 多实验对比（可选，使用 ComparisonInsightEngine） |
| **Research Insights** | 研究洞察（使用 ResearchInsightEngine） |
| **Recommendations** | 改进建议（使用 RecommendationEngine） |
| **Limitations** | 自动检测的限制因素 |
| **Next Experiment Suggestions** | **从结果推导的下一个实验建议** |

### Next Experiment Suggestions（推导逻辑）

每个建议都配有数值证据，**不是随机生成的，不是 LLM 输出**。

| 检查项 | 触发条件 | 建议 |
|---|---|---|
| 1. Loss 仍在下降 | 降低 < 80%，尚未收敛 | 增加 epochs（加倍，上限 100） |
| 2. 过拟合 | 检测到 overfitting 洞察 | 减少 epochs 50% + 增加 weightDecay |
| 3. 训练不稳定 | 检测到 stability/divergence 洞察 | 降低 LR 至 1/3 + 添加梯度裁剪 |
| 4. Loss 下降缓慢 | 降低 < 15%，steps > 20 | 提高 LR 至 3× |
| 5. 良好收敛 | 降低 > 70%，steps > 50 | 扩展模型容量（layers +2, dModel ×2） |
| 6. 生成质量改善 | 训练前后生成文本不同 | 建议 temperature sweep [0.2, 0.5, 0.8, 1.0, 1.2] |
| 7. 单 seed 评估 | 始终触发 | 多 seed 评估 [42, 123, 456, 789] |

### 使用方式

```typescript
const reportV2 = new ResearchReportV2();
const data = reportV2.generate({ experiment, run });
// data.nextExperimentSuggestions — 推导的下一个实验建议数组

const markdown = reportV2.generateMarkdown(data);
// 完整的 Markdown 格式研究报表
```

---

## Next Experiment — 下一个实验建议

### NextExperimentGenerator

将 ResearchReportV2 的建议转换为**预填充的完整 ResearchExperiment**：

```typescript
const generator = new NextExperimentGenerator();
const result = generator.generate({
  experiment: sourceExperiment,
  run: sourceRun,
  suggestions: reportData.nextExperimentSuggestions,
});

// result.proposals — PrefilledExperiment[]
// 每个 proposal:
//   - experiment: 克隆的实验（已应用字段变更）
//   - changeSummary: 人类可读的变更描述
//   - source: 触发此提案的 NextExperimentSuggestion
```

### 设计原则

- **仅提案，不自动修改用户配置** — 所有提案 status 为 `draft`
- **确定性** — 相同输入 → 相同提案
- **证据支持** — 每个提案关联数值证据
- **浏览器安全** — 无 Node.js 依赖

---

## 架构总览

```
┌─────────────────────────────────────────────────┐
│                      UI 层                        │
│  ExperimentRunnerPanel  ExperimentComparison     │
│  ExperimentQueue (UI)   ResearchWorkspace         │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│                   Adapter 层                      │
│  ai-lab/adapters  ← 桥接 research ↔ AI Lab       │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│                  Research 层 ★Phase 60★          │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  ResearchExperiment (定义)                    │ │
│  │  ResearchRun (记录)                          │ │
│  │  ResearchExperimentStore (持久化)            │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  ResearchExperimentRunner (编排)             │ │
│  │  └── TrainingExecutor (接口)                 │ │
│  │       └── createInlineTrainingExecutor()     │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  ExperimentQueue (FIFO)                      │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  BaselineWorkflow (基线 + 消融)              │ │
│  │  ReproducibilityCertificate (指纹 + 认证)    │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  ResearchReportV2 (扩展报表)                 │ │
│  │  └── deriveNextExperimentSuggestions()       │ │
│  │  NextExperimentGenerator (提案生成)          │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│              Experiments / Evaluation             │
│  ModelRegistry  TrainingRecipe  ComparisonEngine  │
│  ResearchInsightEngine  RecommendationEngine      │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│              Model / Core / Training              │
│  Tensor  Trainer  BPETokenizer  DataLoader       │
│  TensorMiniMindModel  AdamW  CosineScheduler     │
└─────────────────────────────────────────────────┘
```

### 依赖方向

```
UI → Adapter → Research → Experiments/Evaluation/Training → Model/Core
```

**Research 层不修改 core/model/training 模块。** 所有新增功能都是架构增量。

### 浏览器 / Node 分离

| 模块 | 环境 |
|---|---|
| ResearchExperiment | 浏览器 ✓ |
| ResearchRun | 浏览器 ✓ |
| ResearchExperimentStore | 浏览器 ✓（localStorage） |
| ExperimentQueue | 浏览器 ✓ |
| ReproducibilityCertificate | 浏览器 ✓ |
| ResearchReportV2 | 浏览器 ✓ |
| NextExperimentGenerator | 浏览器 ✓ |
| ResearchExperimentRunner | 浏览器 ✓ |
| createInlineTrainingExecutor | 浏览器 ✓（内联语料库） |
| TrainingCampaign executor | Node（未来扩展） |

---

## 使用示例

### 完整实验循环

```typescript
import {
  createResearchExperiment,
  ResearchExperimentRunner,
  createInlineTrainingExecutor,
  ExperimentQueue,
  BaselineWorkflow,
  ReproducibilityCertificate,
  ResearchReportV2,
  NextExperimentGenerator,
} from "@/lib/minimind/research";

// 1. 准备语料库
const corpus = loadTinyStories();

// 2. 创建实验
const experiment = createResearchExperiment({
  name: "TinyStories LR 1e-3",
  description: "Baseline with LR=0.001",
  seed: 42,
  modelConfig: { /* GPT-tiny */ },
  trainingConfig: { /* epochs=10, lr=0.001 */ },
  datasetConfig: { name: "tinystories", blockSize: 64, batchSize: 8, shuffle: true },
});

// 3. 运行实验
const runner = new ResearchExperimentRunner({
  executor: createInlineTrainingExecutor(corpus),
});
const result = await runner.run(experiment);

// 4. 生成报表
const reportV2 = new ResearchReportV2();
const report = reportV2.generate({
  experiment: result.experiment,
  run: result.run,
});

// 5. 获取下一个实验建议
const generator = new NextExperimentGenerator();
const next = generator.generate({
  experiment: result.experiment,
  run: result.run,
  suggestions: report.nextExperimentSuggestions,
});

// next.proposals[0].experiment — 预填充的下一个实验！
```

### 消融研究

```typescript
const workflow = new BaselineWorkflow(runner);

const ablation = await workflow.runAblation(experiment, [
  { name: "LR 3e-3", overrides: { trainingConfig: { optimizer: { lr: 0.003 } } } },
  { name: "LR 3e-4", overrides: { trainingConfig: { optimizer: { lr: 0.0003 } } } },
  { name: "4 layers", overrides: { modelConfig: { numLayers: 4 } } },
]);

// ablation.winners.bestLoss → 最佳 loss 的实验
// ablation.winners.tokensPerSecond → 最快的实验
```

### 可重复性验证

```typescript
const cert = new ReproducibilityCertificate();

// 运行两次同样的实验
const run1 = await runner.run(experiment);
const run2 = await runner.run(experiment); // 相同 seed

const certificate = cert.generate(experiment, run1.run, run2.run);
// certificate.overall.reproducible → true（如果所有指标匹配）
// certificate.overall.confidence → 0-1
```

### 队列管理

```typescript
const queue = new ExperimentQueue();

queue.queue("exp-a", "Experiment A");
queue.queue("exp-b", "Experiment B");

while (queue.hasPending()) {
  const item = queue.dequeue();
  try {
    await runner.run(getExperiment(item.experimentId));
    queue.complete(item.id);
  } catch (err) {
    queue.fail(item.id, err.message);
  }
}

console.log(queue.summary());
// { total: 2, completed: 2, failed: 0, ... }
```
