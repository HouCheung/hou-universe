# AI Lab Module — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI Lab module to HOU Universe with data-driven hierarchical roadmap, extensible routing architecture, MissionBar on homepage Hero, and skeleton-first AI Lab page.

**Architecture:** Single-source-of-truth roadmap data (`src/data/roadmap.ts`) with Phase > Node hierarchy drives both the homepage MissionBar and the AI Lab page sections. Next.js nested layout enables future sub-routes (`/ai-lab/journey`, `/ai-lab/roadmap`, etc.) without refactoring. All 8 page sections are independent components that can graduate to their own routes when mature.

**Tech Stack:** Next.js 15 App Router + TypeScript strict + Tailwind CSS + Framer Motion + shadcn/ui + i18next (zh-CN/en)

## Global Constraints

- All user-facing strings must use i18n keys — zero hardcoded Chinese or English text in JSX
- `npm run build` must pass with zero errors and zero warnings at every commit boundary
- Existing pages/components must not be modified beyond documented insertion points
- TypeScript strict mode — no `any` types allowed
- Components use function components + PascalCase naming
- Import order: third-party → internal components → types → styles
- All animation via Framer Motion only

---

## File Map

```
Create (18 files):
  docs/architecture/ai-lab-architecture.md          # ADR (already created)
  src/data/roadmap.ts                                # ★ Single source of truth
  src/components/shared/MissionBar.tsx               # Hero mission status bar
  src/app/ai-lab/layout.tsx                          # AI Lab shared layout
  src/app/ai-lab/page.tsx                            # Main overview page (SSR shell)
  src/app/ai-lab/journey/page.tsx                    # Placeholder sub-route
  src/app/ai-lab/roadmap/page.tsx                    # Placeholder sub-route
  src/app/ai-lab/experiments/page.tsx                # Placeholder sub-route
  src/app/ai-lab/playground/page.tsx                 # Placeholder sub-route
  src/app/ai-lab/blog/page.tsx                       # Placeholder sub-route
  src/components/ai-lab/AiLabClient.tsx              # Client orchestrator
  src/components/ai-lab/MissionBanner.tsx            # Top mission statement
  src/components/ai-lab/RoadmapSection.tsx           # Data-driven roadmap
  src/components/ai-lab/TimelineSection.tsx          # Learning timeline skeleton
  src/components/ai-lab/KnowledgeMap.tsx             # Knowledge graph placeholder
  src/components/ai-lab/ProgressSection.tsx          # Current progress card
  src/components/ai-lab/ResourcesSection.tsx         # Resource links grid
  src/components/ai-lab/GithubSection.tsx            # GitHub repo card
  src/components/ai-lab/BlogSection.tsx              # Blog entry point

Modify (4 files):
  src/types/index.ts                                 # +RoadmapNode, +RoadmapPhase
  src/lib/i18n/locales/zh-CN.json                   # +nav.aiLab, +hero.mission*, +aiLab.*, +roadmap.*
  src/lib/i18n/locales/en.json                       # Same keys, English values
  src/components/layout/NavBar.tsx                   # +1 entry in NAV_KEYS
  src/components/shared/HeroContent.tsx              # +1 line: <MissionBar />
```

---

### Task 1: Types — RoadmapNode + RoadmapPhase

**Files:**
- Modify: `src/types/index.ts` (append after existing interfaces)

**Produces:** `RoadmapNode`, `RoadmapPhase` types consumed by `src/data/roadmap.ts` and all ai-lab components.

- [ ] **Step 1: Append type definitions to types/index.ts**

Append the following after the last `export interface GuestbookMessage` block:

```typescript
export interface RoadmapNode {
  id: string;
  order: number;
  titleKey: string;
  descriptionKey: string;
  status: "completed" | "in-progress" | "upcoming";
  topics?: string[];
}

export interface RoadmapPhase {
  id: string;
  order: number;
  titleKey: string;
  descriptionKey: string;
  status: "completed" | "in-progress" | "upcoming";
  nodes: RoadmapNode[];
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: no new type errors related to `RoadmapNode` or `RoadmapPhase`.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add RoadmapNode and RoadmapPhase interfaces"
```

---

### Task 2: Roadmap Data Source

**Files:**
- Create: `src/data/roadmap.ts`

**Consumes:** `RoadmapPhase`, `RoadmapNode` from Task 1
**Produces:** `roadmapPhases`, `getAllNodes()`, `getCurrentPhase()`, `getCurrentTask()`, `getOverallProgress()` — consumed by MissionBar (Task 6), RoadmapSection (Task 10), ProgressSection (Task 10)

- [ ] **Step 1: Create src/data/roadmap.ts**

```typescript
import type { RoadmapPhase, RoadmapNode } from "@/types";

export const roadmapPhases: RoadmapPhase[] = [
  {
    id: "phase-foundation",
    order: 1,
    titleKey: "roadmap.phases.foundation.title",
    descriptionKey: "roadmap.phases.foundation.description",
    status: "in-progress",
    nodes: [
      {
        id: "tokenizer",
        order: 1,
        titleKey: "roadmap.nodes.tokenizer.title",
        descriptionKey: "roadmap.nodes.tokenizer.description",
        status: "in-progress",
        topics: ["BPE", "WordPiece", "SentencePiece", "Byte-level encoding"],
      },
      {
        id: "embedding",
        order: 2,
        titleKey: "roadmap.nodes.embedding.title",
        descriptionKey: "roadmap.nodes.embedding.description",
        status: "upcoming",
        topics: ["Word2Vec", "Positional Encoding", "RoPE"],
      },
      {
        id: "attention",
        order: 3,
        titleKey: "roadmap.nodes.attention.title",
        descriptionKey: "roadmap.nodes.attention.description",
        status: "upcoming",
        topics: ["Self-Attention", "Multi-Head Attention", "Flash Attention"],
      },
      {
        id: "transformer",
        order: 4,
        titleKey: "roadmap.nodes.transformer.title",
        descriptionKey: "roadmap.nodes.transformer.description",
        status: "upcoming",
        topics: ["Encoder-Decoder", "Layer Normalization", "Residual Connections"],
      },
    ],
  },
  {
    id: "phase-training",
    order: 2,
    titleKey: "roadmap.phases.training.title",
    descriptionKey: "roadmap.phases.training.description",
    status: "upcoming",
    nodes: [
      {
        id: "pretrain",
        order: 5,
        titleKey: "roadmap.nodes.pretrain.title",
        descriptionKey: "roadmap.nodes.pretrain.description",
        status: "upcoming",
        topics: ["Data Preparation", "Training Loop", "Loss Curves", "Checkpointing"],
      },
      {
        id: "sft",
        order: 6,
        titleKey: "roadmap.nodes.sft.title",
        descriptionKey: "roadmap.nodes.sft.description",
        status: "upcoming",
        topics: ["Instruction Tuning", "Dataset Formatting", "Chat Templates"],
      },
      {
        id: "lora",
        order: 7,
        titleKey: "roadmap.nodes.lora.title",
        descriptionKey: "roadmap.nodes.lora.description",
        status: "upcoming",
        topics: ["Low-Rank Adaptation", "QLoRA", "Adapter Merging"],
      },
      {
        id: "rlhf",
        order: 8,
        titleKey: "roadmap.nodes.rlhf.title",
        descriptionKey: "roadmap.nodes.rlhf.description",
        status: "upcoming",
        topics: ["Reward Modeling", "PPO", "DPO", "Preference Data"],
      },
    ],
  },
  {
    id: "phase-advanced",
    order: 3,
    titleKey: "roadmap.phases.advanced.title",
    descriptionKey: "roadmap.phases.advanced.description",
    status: "upcoming",
    nodes: [
      {
        id: "rag",
        order: 9,
        titleKey: "roadmap.nodes.rag.title",
        descriptionKey: "roadmap.nodes.rag.description",
        status: "upcoming",
        topics: ["Vector DB", "Retrieval Pipelines", "Hybrid Search"],
      },
      {
        id: "agent",
        order: 10,
        titleKey: "roadmap.nodes.agent.title",
        descriptionKey: "roadmap.nodes.agent.description",
        status: "upcoming",
        topics: ["Tool Use", "ReAct", "Planning", "Memory"],
      },
    ],
  },
];

/** All nodes flattened across phases — for global indexing */
export function getAllNodes(): RoadmapNode[] {
  return roadmapPhases.flatMap((p) => p.nodes);
}

/** The first phase with status "in-progress", or null */
export function getCurrentPhase(): RoadmapPhase | null {
  return roadmapPhases.find((p) => p.status === "in-progress") ?? null;
}

/** The first node with status "in-progress" across all phases, or null */
export function getCurrentTask(): RoadmapNode | null {
  return getAllNodes().find((n) => n.status === "in-progress") ?? null;
}

/** Overall progress: percent (in-progress weighted at 30%) plus raw counts */
export function getOverallProgress(): {
  completed: number;
  inProgress: number;
  total: number;
  percent: number;
} {
  const allNodes = getAllNodes();
  const completed = allNodes.filter((n) => n.status === "completed").length;
  const inProgress = allNodes.filter((n) => n.status === "in-progress").length;
  const effective = completed + inProgress * 0.3;
  const percent = Math.round((effective / allNodes.length) * 100);
  return { completed, inProgress, total: allNodes.length, percent };
}
```

- [ ] **Step 2: Verify file compiles**

No build step needed for a data file — it's validated when imported by components. Proceed to next task.

- [ ] **Step 3: Commit**

```bash
git add src/data/roadmap.ts
git commit -m "feat(roadmap): add hierarchical Phase/Node roadmap data source"
```

---

### Task 3: i18n — AI Lab Translation Keys

**Files:**
- Modify: `src/lib/i18n/locales/zh-CN.json`
- Modify: `src/lib/i18n/locales/en.json`

**Produces:** All i18n keys consumed by NavBar, MissionBar, and all AI Lab components.

- [ ] **Step 1: Append to zh-CN.json**

Insert these keys into `src/lib/i18n/locales/zh-CN.json`. In `"nav"`, add after `"home"`:
```json
"aiLab": "AI Lab"
```

In `"hero"`, add after `"scrollDown"`:
```json
"missionLabel": "★ 当前任务",
"missionPhase": "阶段",
"missionTask": "任务",
"viewAILab": "进入 AI Lab"
```

Append new top-level `"aiLab"` block after the closing `}` of `"playground"`:
```json
"aiLab": {
  "pageTitle": "AI Lab - HOU Universe",
  "pageDesc": "AI Lab 是 HOU Universe 的 AI 研究实验空间——围绕 MiniMind 从零构建一个小型语言模型，逐行理解源码，系统性掌握 LLM 全链路技术栈。",
  "subhead": "AI Lab",
  "heading": "AI Lab · MiniMind Research",
  "intro": "从零开始，逐行构建一个小型语言模型。这不是一个教程合集——而是一场系统性的探索之旅，围绕 MiniMind 源码，深入理解 LLM 全技术栈。",
  "missionStatement": "逐行理解 MiniMind 源码，系统性构建小型语言模型全链路知识体系。",
  "sections": {
    "mission": "任务宣言",
    "roadmap": "学习路线图",
    "timeline": "学习时间轴",
    "knowledgeMap": "知识图谱",
    "progress": "最新进度",
    "resources": "学习资源",
    "github": "GitHub",
    "blog": "学习笔记"
  },
  "comingSoon": "内容建设中",
  "comingSoonDesc": "该板块正在筹备中，内容将逐步更新。",
  "backToLab": "返回 AI Lab",
  "viewOnGithub": "在 GitHub 上查看",
  "readBlog": "阅读笔记"
}
```

Append new top-level `"roadmap"` block:
```json
"roadmap": {
  "phases": {
    "foundation": {
      "title": "Phase 1: 基础架构",
      "description": "从 Tokenizer 到 Transformer——理解语言模型的核心基石"
    },
    "training": {
      "title": "Phase 2: 训练与微调",
      "description": "掌握从预训练到对齐的全流程训练方法"
    },
    "advanced": {
      "title": "Phase 3: 高级能力",
      "description": "探索检索增强生成与智能体系统"
    }
  },
  "nodes": {
    "tokenizer": {
      "title": "Tokenizer",
      "description": "理解文本分词——从字符到子词的词汇构建"
    },
    "embedding": {
      "title": "Embedding",
      "description": "将离散 token 映射为连续语义向量空间"
    },
    "attention": {
      "title": "Attention",
      "description": "理解自注意力机制——Transformer 的核心引擎"
    },
    "transformer": {
      "title": "Transformer",
      "description": "构建完整的 Transformer 编解码架构"
    },
    "pretrain": {
      "title": "Pretrain",
      "description": "大规模无监督预训练——让模型学会语言"
    },
    "sft": {
      "title": "SFT",
      "description": "有监督微调——让模型遵循指令"
    },
    "lora": {
      "title": "LoRA",
      "description": "低秩适应——高效参数微调技术"
    },
    "rlhf": {
      "title": "RLHF",
      "description": "基于人类反馈的强化学习——让模型对齐偏好"
    },
    "rag": {
      "title": "RAG",
      "description": "检索增强生成——让模型访问外部知识"
    },
    "agent": {
      "title": "Agent",
      "description": "智能体系统——让模型使用工具与自主决策"
    }
  },
  "status": {
    "completed": "已完成",
    "inProgress": "进行中",
    "upcoming": "待探索"
  }
}
```

- [ ] **Step 2: Append to en.json**

Insert into `"nav"` after `"home"`:
```json
"aiLab": "AI Lab"
```

In `"hero"`, add after `"scrollDown"`:
```json
"missionLabel": "★ Current Mission",
"missionPhase": "Phase",
"missionTask": "Task",
"viewAILab": "Enter AI Lab"
```

Append `"aiLab"` block:
```json
"aiLab": {
  "pageTitle": "AI Lab - HOU Universe",
  "pageDesc": "AI Lab is HOU Universe's AI research space — building a small language model from scratch around MiniMind, understanding every line of source code, systematically mastering the full LLM tech stack.",
  "subhead": "AI Lab",
  "heading": "AI Lab · MiniMind Research",
  "intro": "Building a small language model from scratch, line by line. This isn't a tutorial collection — it's a systematic exploration journey, diving deep into the full LLM tech stack through MiniMind source code.",
  "missionStatement": "Understand MiniMind source code line by line, systematically build a small language model full-stack knowledge system.",
  "sections": {
    "mission": "Mission",
    "roadmap": "Learning Roadmap",
    "timeline": "Learning Timeline",
    "knowledgeMap": "Knowledge Map",
    "progress": "Latest Progress",
    "resources": "Resources",
    "github": "GitHub",
    "blog": "Blog"
  },
  "comingSoon": "Coming Soon",
  "comingSoonDesc": "This section is under development. Content will be added progressively.",
  "backToLab": "Back to AI Lab",
  "viewOnGithub": "View on GitHub",
  "readBlog": "Read Notes"
}
```

Append `"roadmap"` block:
```json
"roadmap": {
  "phases": {
    "foundation": {
      "title": "Phase 1: Foundation",
      "description": "From Tokenizer to Transformer — understanding the core building blocks of language models"
    },
    "training": {
      "title": "Phase 2: Training & Fine-tuning",
      "description": "Mastering the full training pipeline from pretraining to alignment"
    },
    "advanced": {
      "title": "Phase 3: Advanced Capabilities",
      "description": "Exploring retrieval-augmented generation and agent systems"
    }
  },
  "nodes": {
    "tokenizer": {
      "title": "Tokenizer",
      "description": "Understanding text tokenization — building vocabularies from characters to subwords"
    },
    "embedding": {
      "title": "Embedding",
      "description": "Mapping discrete tokens into continuous semantic vector space"
    },
    "attention": {
      "title": "Attention",
      "description": "Understanding self-attention — the core engine of Transformers"
    },
    "transformer": {
      "title": "Transformer",
      "description": "Building the complete Transformer encoder-decoder architecture"
    },
    "pretrain": {
      "title": "Pretrain",
      "description": "Large-scale unsupervised pretraining — teaching models to understand language"
    },
    "sft": {
      "title": "SFT",
      "description": "Supervised Fine-Tuning — teaching models to follow instructions"
    },
    "lora": {
      "title": "LoRA",
      "description": "Low-Rank Adaptation — efficient parameter-efficient fine-tuning"
    },
    "rlhf": {
      "title": "RLHF",
      "description": "Reinforcement Learning from Human Feedback — aligning models with preferences"
    },
    "rag": {
      "title": "RAG",
      "description": "Retrieval-Augmented Generation — giving models access to external knowledge"
    },
    "agent": {
      "title": "Agent",
      "description": "Agent systems — enabling models to use tools and make autonomous decisions"
    }
  },
  "status": {
    "completed": "Completed",
    "inProgress": "In Progress",
    "upcoming": "Upcoming"
  }
}
```

- [ ] **Step 3: Verify JSON validity**

```bash
cd "d:/123/HOU Universe" && node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/zh-CN.json','utf8')); console.log('zh-CN.json valid')" && node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/en.json','utf8')); console.log('en.json valid')"
```
Expected: `zh-CN.json valid` and `en.json valid`

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/zh-CN.json src/lib/i18n/locales/en.json
git commit -m "feat(i18n): add AI Lab and roadmap translation keys (zh-CN + en)"
```

---

### Task 4: NavBar — Add AI Lab Entry

**Files:**
- Modify: `src/components/layout/NavBar.tsx` (line 16)

**Consumes:** i18n key `nav.aiLab` from Task 3

- [ ] **Step 1: Insert AI Lab into NAV_KEYS**

In [NavBar.tsx](src/components/layout/NavBar.tsx), change:

```typescript
const NAV_KEYS = [
  { href: "/", key: "nav.home" },
  { href: "/about", key: "nav.about" },
```
to:
```typescript
const NAV_KEYS = [
  { href: "/", key: "nav.home" },
  { href: "/ai-lab", key: "nav.aiLab" },
  { href: "/about", key: "nav.about" },
```

No other changes to NavBar. The existing `NAV_KEYS.map()` logic handles desktop links, mobile drawer links, and active-state detection automatically.

- [ ] **Step 2: Verify no build errors**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit --pretty 2>&1 | head -10
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/NavBar.tsx
git commit -m "feat(nav): add AI Lab to navigation bar"
```

---

### Task 5: MissionBar — Shared Component

**Files:**
- Create: `src/components/shared/MissionBar.tsx`

**Consumes:** `getCurrentPhase()`, `getCurrentTask()`, `getOverallProgress()` from Task 2; i18n keys `hero.missionLabel`, `hero.missionPhase`, `hero.missionTask`, `hero.viewAILab` from Task 3
**Produces:** Component rendered inside HeroContent (Task 6); link to `/ai-lab`

- [ ] **Step 1: Create MissionBar.tsx**

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { Sparkles, ChevronRight } from "lucide-react";
import { getCurrentPhase, getCurrentTask, getOverallProgress } from "@/data/roadmap";
import { useEntrance } from "./EntranceSequence";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut", delay: 0.6 },
  },
};

export function MissionBar() {
  const { t } = useTranslation();
  const { contentVisible } = useEntrance();

  const currentPhase = getCurrentPhase();
  const currentTask = getCurrentTask();
  const progress = getOverallProgress();

  if (!currentPhase || !currentTask) {
    return null; // No active mission — don't render anything
  }

  return (
    <motion.div
      initial="hidden"
      animate={contentVisible ? "visible" : "hidden"}
      variants={containerVariants}
      className="mt-8"
    >
      <Link
        href="/ai-lab"
        className="group relative mx-auto block max-w-sm rounded-xl border border-brand/15 bg-brand/[0.03] px-5 py-4 backdrop-blur-sm transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.06] dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.08)]"
      >
        {/* Top accent glow line */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/40 to-transparent opacity-50 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden="true"
        />

        {/* Header row: label + sparkle icon */}
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
            {t("hero.missionLabel")}
          </span>
          <ChevronRight className="ml-auto size-3 text-slate-400/50 transition-transform duration-300 group-hover:translate-x-0.5" />
        </div>

        {/* Phase + Task */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-medium text-brand/80 dark:text-brand-light/80">
            {t(currentPhase.titleKey)}
          </span>
          <span className="text-[0.6rem] text-slate-400 dark:text-slate-600">→</span>
          <span className="text-sm font-semibold text-foreground">
            {t(currentTask.titleKey)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200/60 dark:bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep"
              initial={{ width: 0 }}
              animate={{ width: `${progress.percent}%` }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 1.0 }}
            />
          </div>
          <span className="font-mono text-[0.6rem] tabular-nums text-slate-500 dark:text-slate-500">
            {progress.percent}%
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify type-check on new file**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit --pretty 2>&1 | head -10
```
Expected: no errors referencing `MissionBar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/MissionBar.tsx
git commit -m "feat(mission-bar): add data-driven MissionBar component"
```

---

### Task 6: HeroContent — Integrate MissionBar

**Files:**
- Modify: `src/components/shared/HeroContent.tsx` (insert between typewriter and CTAs)

**Consumes:** MissionBar from Task 5

- [ ] **Step 1: Insert MissionBar into HeroContent**

In [HeroContent.tsx](src/components/shared/HeroContent.tsx), add the import:
```typescript
import { MissionBar } from "./MissionBar";
```

Then insert `<MissionBar />` between the typewriter `<motion.p>` and the CTA `<motion.div>`:

```tsx
      {/* Typewriter subtitle */}
      <motion.p ...>
        <TypeWriter ... />
      </motion.p>

      {/* ★ Current Mission Bar — NEW */}
      <MissionBar />

      {/* CTA buttons */}
      <motion.div ...>
```

The exact insertion point is after line 83 (`</motion.p>` closing the TypeWriter block) and before line 86 (`{/* CTA buttons`} comment).

- [ ] **Step 2: Verify build**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit --pretty 2>&1 | head -10
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/HeroContent.tsx
git commit -m "feat(home): integrate MissionBar into Hero section"
```

---

### Task 7: AI Lab Layout

**Files:**
- Create: `src/app/ai-lab/layout.tsx`

**Produces:** Shared layout wrapping all `/ai-lab/*` routes with cosmic decoration.

- [ ] **Step 1: Create layout.tsx**

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "AI Lab",
    template: "%s | AI Lab · HOU Universe",
  },
  description:
    "AI Lab — Building MiniMind from scratch. A systematic exploration of LLM internals: Tokenizer, Embedding, Attention, Transformer, Pretrain, SFT, LoRA, RLHF, RAG, and Agent.",
};

export default function AiLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* AI Lab cosmic background accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-[10%] left-[20%] h-[50%] w-[50%] rounded-full opacity-[0.04] blur-[140px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(var(--brand-rgb),0.3) 0%, rgba(var(--brand-deep-rgb),0.15) 40%, transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-[15%] right-[10%] h-[45%] w-[45%] rounded-full opacity-[0.03] blur-[120px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(var(--brand-light-rgb),0.2) 0%, rgba(var(--brand-rgb),0.1) 50%, transparent 75%)",
        }}
      />
      {children}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/ai-lab/layout.tsx
git commit -m "feat(ai-lab): add shared layout with cosmic accents"
```

---

### Task 8: AI Lab Section Components (8 files)

**Files:**
- Create: `src/components/ai-lab/MissionBanner.tsx`
- Create: `src/components/ai-lab/RoadmapSection.tsx`
- Create: `src/components/ai-lab/TimelineSection.tsx`
- Create: `src/components/ai-lab/KnowledgeMap.tsx`
- Create: `src/components/ai-lab/ProgressSection.tsx`
- Create: `src/components/ai-lab/ResourcesSection.tsx`
- Create: `src/components/ai-lab/GithubSection.tsx`
- Create: `src/components/ai-lab/BlogSection.tsx`

**Consumes:** `roadmapPhases` and helpers from Task 2 (RoadmapSection, ProgressSection); i18n keys from Task 3 (all components)
**Produces:** Components consumed by AiLabClient (Task 9)

- [ ] **Step 1: Create MissionBanner.tsx**

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Sparkles, Rocket } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

export function MissionBanner() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={variants}
      className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
    >
      {/* Glow accent */}
      <span
        className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
        aria-hidden="true"
      />

      <div className="flex flex-col items-center text-center gap-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
          <Rocket className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
            {t("aiLab.subhead")}
          </span>
        </div>

        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {t("aiLab.heading")}
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          {t("aiLab.intro")}
        </p>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-brand/60 dark:text-brand-light/60">
          <Sparkles className="size-3" />
          <span className="font-mono italic">{t("aiLab.missionStatement")}</span>
        </div>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Create RoadmapSection.tsx**

This is the data-driven component. It receives roadmap phases and renders them as a constellation-style roadmap.

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { roadmapPhases, getCurrentTask } from "@/data/roadmap";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleDot, Circle } from "lucide-react";

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 text-emerald-400" />;
    case "in-progress":
      return <CircleDot className="size-4 text-brand" />;
    default:
      return <Circle className="size-4 text-slate-600 dark:text-slate-700" />;
  }
}

export function RoadmapSection() {
  const { t } = useTranslation();
  const currentTask = getCurrentTask();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.roadmap" />

      <div className="space-y-14">
        {roadmapPhases.map((phase) => (
          <div key={phase.id}>
            {/* Phase header */}
            <div className="mb-5 flex items-center gap-3">
              <span
                className={cn(
                  "font-mono text-[0.6rem] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border",
                  phase.status === "in-progress"
                    ? "border-brand/30 bg-brand/[0.06] text-brand/80 dark:text-brand-light/80"
                    : phase.status === "completed"
                      ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-500/70"
                      : "border-slate-500/15 bg-slate-500/[0.03] text-slate-500/60"
                )}
              >
                {t(phase.titleKey)}
              </span>
              <span className="text-xs text-slate-500/70 dark:text-slate-500/60">
                {t(phase.descriptionKey)}
              </span>
            </div>

            {/* Node grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {phase.nodes.map((node, i) => {
                const isActive = currentTask?.id === node.id;
                return (
                  <motion.div
                    key={node.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    className={cn(
                      "group relative rounded-xl border px-4 py-3.5 transition-all duration-300",
                      isActive
                        ? "border-brand/25 bg-brand/[0.05] shadow-[0_0_20px_rgba(var(--brand-rgb),0.06)] dark:border-white/[0.1] dark:bg-[rgba(var(--brand-rgb),0.06)]"
                        : node.status === "upcoming"
                          ? "border-slate-500/[0.08] bg-transparent dark:border-white/[0.03]"
                          : "border-emerald-500/15 bg-emerald-500/[0.03]"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-sm font-semibold truncate",
                            node.status === "upcoming"
                              ? "text-slate-500 dark:text-slate-500"
                              : "text-foreground"
                          )}
                        >
                          {t(node.titleKey)}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500/80 dark:text-slate-500/70 line-clamp-2">
                          {t(node.descriptionKey)}
                        </p>
                      </div>
                      <span className="ml-2 shrink-0 mt-0.5">
                        {statusIcon(node.status)}
                      </span>
                    </div>

                    {/* Topics pills */}
                    {node.topics && node.topics.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {node.topics.slice(0, 3).map((topic) => (
                          <span
                            key={topic}
                            className="inline-block rounded-full border border-slate-500/[0.1] px-1.5 py-0.5 text-[0.6rem] text-slate-500/80 dark:border-white/[0.04] dark:text-slate-500"
                          >
                            {topic}
                          </span>
                        ))}
                        {node.topics.length > 3 && (
                          <span className="text-[0.6rem] text-slate-500/60">
                            +{node.topics.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 3: Create TimelineSection.tsx**

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { GitBranch } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function TimelineSection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.timeline" />

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500/15 py-16 text-center dark:border-white/[0.05]">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-slate-500/[0.12] bg-slate-500/[0.03] dark:border-white/[0.04] dark:bg-white/[0.02]">
          <GitBranch className="size-6 text-slate-500/50 dark:text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          {t("aiLab.comingSoon")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500/80 dark:text-slate-500/70">
          {t("aiLab.comingSoonDesc")}
        </p>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 4: Create KnowledgeMap.tsx**

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { Brain } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function KnowledgeMap() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.knowledgeMap" />

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500/15 py-16 text-center dark:border-white/[0.05]">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-slate-500/[0.12] bg-slate-500/[0.03] dark:border-white/[0.04] dark:bg-white/[0.02]">
          <Brain className="size-6 text-slate-500/50 dark:text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          {t("aiLab.comingSoon")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500/80 dark:text-slate-500/70">
          {t("aiLab.comingSoonDesc")}
        </p>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 5: Create ProgressSection.tsx**

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { getCurrentPhase, getCurrentTask, getOverallProgress } from "@/data/roadmap";
import { Zap, TrendingUp } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function ProgressSection() {
  const { t } = useTranslation();
  const currentPhase = getCurrentPhase();
  const currentTask = getCurrentTask();
  const progress = getOverallProgress();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.progress" />

      <div className="grid gap-5 sm:grid-cols-3">
        {/* Current Phase */}
        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="size-4 text-brand/70" />
            <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
              Phase
            </span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {currentPhase ? t(currentPhase.titleKey) : "—"}
          </p>
        </div>

        {/* Current Task */}
        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="size-4 text-brand/70" />
            <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
              Task
            </span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {currentTask ? t(currentTask.titleKey) : "—"}
          </p>
        </div>

        {/* Overall Progress */}
        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
              Progress
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground tabular-nums">
              {progress.percent}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {progress.completed}/{progress.total} done
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/50 dark:bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep"
              initial={{ width: 0 }}
              whileInView={{ width: `${progress.percent}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 6: Create ResourcesSection.tsx**

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { BookOpen, ExternalLink } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const placeholderResources = [
  { labelKey: "roadmap.nodes.tokenizer.title", descKey: "roadmap.nodes.tokenizer.description" },
  { labelKey: "roadmap.nodes.attention.title", descKey: "roadmap.nodes.attention.description" },
  { labelKey: "roadmap.nodes.transformer.title", descKey: "roadmap.nodes.transformer.description" },
];

export function ResourcesSection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.resources" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {placeholderResources.map((res, i) => (
          <motion.div
            key={res.labelKey}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="group relative rounded-xl border border-slate-500/[0.1] bg-transparent px-5 py-5 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.03] dark:border-white/[0.04] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.02]"
          >
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 size-5 shrink-0 text-slate-400 dark:text-slate-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {t(res.labelKey)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500/80 dark:text-slate-500/70 line-clamp-2">
                  {t(res.descKey)}
                </p>
              </div>
              <ExternalLink className="mt-0.5 size-4 shrink-0 text-slate-400/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 7: Create GithubSection.tsx**

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { Github, ExternalLink, Star, GitFork } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function GithubSection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.github" />

      <Link
        href="https://github.com"
        target="_blank"
        rel="noopener noreferrer"
        className="group mx-auto block max-w-lg rounded-xl border border-slate-500/[0.1] bg-slate-500/[0.02] px-6 py-7 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.03] dark:border-white/[0.04] dark:bg-white/[0.01] dark:hover:border-white/[0.08] dark:hover:bg-[rgba(var(--brand-rgb),0.04)]"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Github className="size-6 text-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                MiniMind
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                A small language model built from scratch
              </p>
            </div>
          </div>
          <ExternalLink className="size-4 text-slate-400/50 transition-all duration-200 group-hover:text-brand/60 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>

        <div className="mt-5 flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <Star className="size-3.5 text-slate-400/70" />
            <span className="text-xs tabular-nums text-slate-500">—</span>
          </div>
          <div className="flex items-center gap-1.5">
            <GitFork className="size-3.5 text-slate-400/70" />
            <span className="text-xs tabular-nums text-slate-500">—</span>
          </div>
          <span className="ml-auto text-xs text-brand/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {t("aiLab.viewOnGithub")} →
          </span>
        </div>
      </Link>
    </motion.section>
  );
}
```

- [ ] **Step 8: Create BlogSection.tsx**

```typescript
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { FileText, ArrowRight } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function BlogSection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.blog" />

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500/15 py-16 text-center dark:border-white/[0.05]">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-slate-500/[0.12] bg-slate-500/[0.03] dark:border-white/[0.04] dark:bg-white/[0.02]">
          <FileText className="size-6 text-slate-500/50 dark:text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          {t("aiLab.comingSoon")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500/80 dark:text-slate-500/70">
          {t("aiLab.comingSoonDesc")}
        </p>
        <Link
          href="/notes"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand/70 transition-colors duration-200 hover:text-brand dark:text-brand-light/70 dark:hover:text-brand-light"
        >
          {t("aiLab.readBlog")}
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 9: Verify all new components compile**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: no errors referencing the new `components/ai-lab/` files.

- [ ] **Step 10: Commit**

```bash
git add src/components/ai-lab/
git commit -m "feat(ai-lab): add 8 section components (MissionBanner, Roadmap, Timeline, KnowledgeMap, Progress, Resources, Github, Blog)"
```

---

### Task 9: AI Lab Main Page + AiLabClient

**Files:**
- Create: `src/app/ai-lab/page.tsx` (server component — metadata shell)
- Create: `src/components/ai-lab/AiLabClient.tsx` (client component — section orchestrator)

**Consumes:** All 8 section components from Task 8

- [ ] **Step 1: Create AiLabClient.tsx**

```typescript
"use client";

import { MissionBanner } from "./MissionBanner";
import { RoadmapSection } from "./RoadmapSection";
import { TimelineSection } from "./TimelineSection";
import { KnowledgeMap } from "./KnowledgeMap";
import { ProgressSection } from "./ProgressSection";
import { ResourcesSection } from "./ResourcesSection";
import { GithubSection } from "./GithubSection";
import { BlogSection } from "./BlogSection";

export function AiLabClient() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      <MissionBanner />

      <RoadmapSection />

      {/* Secondary sections grid (2-col on desktop for density) */}
      <div className="mt-20 sm:mt-28 grid gap-20 sm:gap-28 lg:grid-cols-1">
        <ProgressSection />
        <TimelineSection />
        <KnowledgeMap />
        <ResourcesSection />
        <GithubSection />
        <BlogSection />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create page.tsx**

```typescript
import type { Metadata } from "next";
import { AiLabClient } from "@/components/ai-lab/AiLabClient";

export const metadata: Metadata = {
  title: "AI Lab · MiniMind Research",
  description:
    "AI Lab — Building MiniMind from scratch. A systematic exploration of LLM internals covering Tokenizer, Embedding, Attention, Transformer, Pretrain, SFT, LoRA, RLHF, RAG, and Agent.",
};

export default function AiLabPage() {
  return <AiLabClient />;
}
```

- [ ] **Step 3: Verify build**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit --pretty 2>&1 | head -10
```
Expected: no errors referencing `AiLabClient` or `page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-lab/AiLabClient.tsx src/app/ai-lab/page.tsx
git commit -m "feat(ai-lab): add main AI Lab page with section orchestrator"
```

---

### Task 10: Placeholder Sub-Routes (5 pages)

**Files:**
- Create: `src/app/ai-lab/journey/page.tsx`
- Create: `src/app/ai-lab/roadmap/page.tsx`
- Create: `src/app/ai-lab/experiments/page.tsx`
- Create: `src/app/ai-lab/playground/page.tsx`
- Create: `src/app/ai-lab/blog/page.tsx`

**All 5 files are structurally identical** — a simple "Coming Soon" page with a back-link to `/ai-lab`.

- [ ] **Step 1: Create all 5 placeholder pages**

For each file below, create with the same template, changing only the `title` in metadata and the section name.

**File: `src/app/ai-lab/journey/page.tsx`**
```typescript
import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "Learning Journey",
};

export default function JourneyPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.timeline" />;
}
```

**File: `src/app/ai-lab/roadmap/page.tsx`**
```typescript
import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "Full Roadmap",
};

export default function RoadmapPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.roadmap" />;
}
```

**File: `src/app/ai-lab/experiments/page.tsx`**
```typescript
import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "Experiments",
};

export default function ExperimentsPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.roadmap" />;
}
```

**File: `src/app/ai-lab/playground/page.tsx`**
```typescript
import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "AI Playground",
};

export default function PlaygroundPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.roadmap" />;
}
```

**File: `src/app/ai-lab/blog/page.tsx`**
```typescript
import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "Learning Notes",
};

export default function BlogPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.blog" />;
}
```

- [ ] **Step 2: Create SubRoutePlaceholder component**

**File: `src/components/ai-lab/SubRoutePlaceholder.tsx`**
```typescript
"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";

interface SubRoutePlaceholderProps {
  sectionNameKey: string;
}

export function SubRoutePlaceholder({ sectionNameKey }: SubRoutePlaceholderProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full border border-slate-500/[0.12] bg-slate-500/[0.03] dark:border-white/[0.04] dark:bg-white/[0.02]">
        <Construction className="size-7 text-slate-500/40 dark:text-slate-600" />
      </div>

      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
        {t("aiLab.comingSoon")}
      </h1>

      <p className="mt-3 max-w-md text-sm text-slate-500/80 dark:text-slate-500/70">
        <strong className="text-foreground/80">{t(sectionNameKey)}</strong>{" "}
        — {t("aiLab.comingSoonDesc")}
      </p>

      <Link
        href="/ai-lab"
        className="mt-8 inline-flex items-center gap-2 rounded-lg border border-brand/15 bg-brand/[0.04] px-5 py-2.5 text-sm font-medium text-brand/80 transition-all duration-300 hover:bg-brand/[0.08] hover:text-brand dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.06)] dark:text-brand-light/80 dark:hover:bg-[rgba(var(--brand-rgb),0.1)] dark:hover:text-brand-light"
      >
        <ArrowLeft className="size-4" />
        {t("aiLab.backToLab")}
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: no errors from sub-route files or SubRoutePlaceholder.

- [ ] **Step 4: Commit**

```bash
git add src/app/ai-lab/journey/ src/app/ai-lab/roadmap/ src/app/ai-lab/experiments/ src/app/ai-lab/playground/ src/app/ai-lab/blog/ src/components/ai-lab/SubRoutePlaceholder.tsx
git commit -m "feat(ai-lab): add 5 placeholder sub-routes with shared placeholder component"
```

---

### Task 11: Build Verification — `npm run build`

**Files:** None (verification only)

- [ ] **Step 1: Run full production build**

```bash
cd "d:/123/HOU Universe" && npm run build
```
Expected: `✓ Compiled successfully` — zero errors, zero warnings.

Address any build errors before proceeding. Common issues to check:
- i18n JSON syntax (trailing commas, missing quotes)
- Import paths (`@/` alias resolution)
- Unused imports in generated component files
- Missing translation keys referenced by components

- [ ] **Step 2: Commit architecture doc + plan**

```bash
git add docs/architecture/ai-lab-architecture.md docs/superpowers/plans/2026-07-28-ai-lab-phase1.md
git commit -m "docs: add AI Lab architecture decision record and implementation plan"
```

---

## Verification Checklist

Before marking Phase 1 complete, verify:

1. **`/` homepage**: Hero shows "★ Current Mission" bar between typewriter and CTA buttons, with current phase name + task name + progress bar.
2. **`/ai-lab` page**: All 8 sections render with titles, descriptions, and skeleton content. RoadmapSection shows 3 phases × nodes in constellation cards. ProgressSection shows 3 stat cards.
3. **`/ai-lab/journey`** through **`/ai-lab/blog`**: All 5 show "Coming Soon" with back-link.
4. **`/ai-lab/layout.tsx`**: Cosmic background accents appear on all AI Lab sub-pages.
5. **Navigation**: "AI Lab" appears between "首页/Home" and "关于/About" in both desktop and mobile views.
6. **i18n toggle**: Switching between zh-CN and en translates all AI Lab content.
7. **Responsive**: All AI Lab pages function correctly at mobile (sm), tablet (md), and desktop (lg) breakpoints.
8. **Existing pages untouched**: `/about`, `/projects`, `/playground`, `/notes`, `/tools`, `/links`, `/guestbook`, `/contact` all render identically to before.

