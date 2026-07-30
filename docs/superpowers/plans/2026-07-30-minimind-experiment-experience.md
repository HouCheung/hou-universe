# MiniMind Experiment Experience Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Experiment Experience Layer — a Hub + Workspace UI at `/ai-lab/experiments` that exposes the Phase 19 Experiment Runtime to users for discovery, execution, and result exploration.

**Architecture:** Single-route Hub + Workspace pattern. `ExperimentsPageClient` owns view state (`hub` | `workspace`) and `selectedExperimentId`. The Hub reads `MINIMIND_EXPERIMENTS` from the SSOT registry and renders `ExperimentCard` components. The Workspace creates an `ExperimentContext`, calls `runExperiment()`, and dispatches typed results to per-experiment renderer components via a discriminated union switch.

**Tech Stack:** Next.js 15 App Router, TypeScript strict mode, Tailwind CSS, Framer Motion, lucide-react, React i18next. Reuses 5 shared visualization components from `forward/shared/`.

## Global Constraints

- Do NOT modify: `src/lib/minimind/experiments/`, playground components, forward visualization, experience page, core modules
- Do NOT duplicate computation — `ExperimentRunner.run()` is the sole execution path
- Do NOT introduce a second state management library
- Registry remains SSOT — UI reads from `MINIMIND_EXPERIMENTS`, never maintains its own experiment list
- Experiment Runtime independent from React — no JSX imports in `lib/minimind/experiments/`
- Follow existing code patterns: JSDoc + educational comments + DI + registry
- All user-facing strings via i18n (`src/lib/i18n/locales/en.json` and `zh-CN.json`)
- All components use function components + TypeScript strict mode, no `any` types
- UI DNA: glass cards (`rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm`), Framer Motion staggered variants, font-mono for data, `dark:` variants, cosm ic background inherited from AI Lab layout

---

### Task 1: Update experiment registry (flip statuses + set componentPath)

**File:**
- Modify: `src/data/minimind/experiment-registry.ts`

**Interfaces:**
- Produces: `MINIMIND_EXPERIMENTS` now has 3 `status: "active"` experiments with non-null `componentPath`

- [ ] **Step 1: Update tokenizer-comparison-lab status**

Change:

```typescript
    status: "planned",
    componentPath: null,
```

to:

```typescript
    status: "active",
    componentPath: "src/components/minimind/experiments/results/TokenizerComparisonResult",
```

- [ ] **Step 2: Update embedding-explorer status**

Change:

```typescript
    status: "planned",
    componentPath: null,
```

to:

```typescript
    status: "active",
    componentPath: "src/components/minimind/experiments/results/EmbeddingExplorerResult",
```

- [ ] **Step 3: Update attention-heatmap-explorer status**

Change:

```typescript
    status: "planned",
    componentPath: null,
```

to:

```typescript
    status: "active",
    componentPath: "src/components/minimind/experiments/results/AttentionHeatmapResult",
```

- [ ] **Step 4: Verify registry**

Run: `npx tsc --noEmit`
Expected: zero errors. `getActiveExperiments()` now returns 3 experiments.

- [ ] **Step 5: Commit**

```bash
git add src/data/minimind/experiment-registry.ts
git commit -m "feat(minimind): activate 3 experiments in registry (Phase 20)"
```

---

### Task 2: Create ExperimentCard

**Files:**
- Create: `src/components/minimind/experiments/ExperimentCard.tsx`

**Interfaces:**
- Consumes: `MiniMindExperiment` from `@/data/minimind/experiment-registry`
- Produces: `ExperimentCard` component with `onSelect: (id: string) => void` callback
- Props: `{ experiment: MiniMindExperiment; onSelect: (id: string) => void }`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { motion, type Variants } from "framer-motion";
import {
  Split,
  Layers,
  Eye,
  Thermometer,
  FlaskConical,
  Sparkles,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiniMindExperiment } from "@/data/minimind/experiment-registry";

// ============================================================
// Icon map — experiment module → lucide icon
// ============================================================

const MODULE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  tokenizer: Split,
  embedding: Layers,
  attention: Eye,
  inference: Thermometer,
};

function getIcon(moduleId: string): React.ComponentType<{ className?: string }> {
  return MODULE_ICON_MAP[moduleId] ?? FlaskConical;
}

// ============================================================
// Animation variants
// ============================================================

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

// ============================================================
// ExperimentCard
// ============================================================

interface ExperimentCardProps {
  experiment: MiniMindExperiment;
  onSelect: (id: string) => void;
}

export function ExperimentCard({ experiment, onSelect }: ExperimentCardProps) {
  const isActive = experiment.status === "active";
  const Icon = getIcon(experiment.relatedModule);
  const visibleConcepts = experiment.concepts.slice(0, 3);
  const overflowCount = experiment.concepts.length - 3;

  return (
    <motion.button
      variants={cardVariants}
      onClick={() => isActive && onSelect(experiment.id)}
      disabled={!isActive}
      className={cn(
        "relative w-full rounded-2xl border p-5 text-left transition-all duration-300",
        "border-brand/15 bg-brand/[0.03] backdrop-blur-sm",
        "dark:border-white/[0.08] dark:bg-white/[0.02]",
        isActive
          ? "cursor-pointer hover:scale-[1.02] hover:border-brand/30 hover:bg-brand/[0.06] dark:hover:border-white/[0.15] dark:hover:bg-white/[0.04]"
          : "cursor-default opacity-60"
      )}
    >
      {/* Glow accent */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r",
          isActive
            ? "from-transparent via-brand/30 to-transparent"
            : "from-transparent via-slate-300/30 to-transparent"
        )}
        aria-hidden="true"
      />

      {/* Header row: icon + title + status */}
      <div className="mb-3 flex items-start gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            "border border-brand/10 bg-brand/[0.06]",
            "dark:border-white/[0.06] dark:bg-white/[0.03]"
          )}
        >
          <Icon className="size-4 text-brand/70" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {experiment.title}
          </h3>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.6rem] tracking-wider uppercase",
            isActive
              ? "border-brand/15 bg-brand/[0.06] text-brand/80 dark:border-brand/25 dark:text-brand/70"
              : "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-500"
          )}
        >
          {isActive ? (
            <>
              <Sparkles className="size-2.5" />
              Active
            </>
          ) : (
            <>
              <Clock className="size-2.5" />
              Planned
            </>
          )}
        </span>
      </div>

      {/* Description */}
      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {experiment.description}
      </p>

      {/* Concept tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleConcepts.map((concept) => (
          <span
            key={concept}
            className="rounded-full border border-brand/8 bg-brand/[0.03] px-2 py-0.5 font-mono text-[0.6rem] text-slate-500 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-slate-400"
          >
            {concept}
          </span>
        ))}
        {overflowCount > 0 && (
          <span className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
            +{overflowCount} more
          </span>
        )}
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/experiments/ExperimentCard.tsx
git commit -m "feat(minimind): add ExperimentCard component"
```

---

### Task 3: Create ExperimentHub

**Files:**
- Create: `src/components/minimind/experiments/ExperimentHub.tsx`

**Interfaces:**
- Consumes: `MINIMIND_EXPERIMENTS` from `@/data/minimind/experiment-registry`, `ExperimentCard` from `./ExperimentCard`
- Produces: `ExperimentHub` component
- Props: `{ onSelectExperiment: (id: string) => void }`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { motion, type Variants } from "framer-motion";
import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MINIMIND_EXPERIMENTS, getActiveExperiments, getPlannedExperiments } from "@/data/minimind/experiment-registry";
import { ExperimentCard } from "./ExperimentCard";

// ============================================================
// Animation variants
// ============================================================

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

// ============================================================
// ExperimentHub
// ============================================================

interface ExperimentHubProps {
  onSelectExperiment: (id: string) => void;
}

export function ExperimentHub({ onSelectExperiment }: ExperimentHubProps) {
  const { t } = useTranslation();
  const activeExperiments = getActiveExperiments();
  const plannedExperiments = getPlannedExperiments();

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center"
      >
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {t("minimind.experiments.heading")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          {t("minimind.experiments.intro")}
        </p>
      </motion.div>

      {/* Active experiments grid */}
      {activeExperiments.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {activeExperiments.map((exp) => (
            <ExperimentCard
              key={exp.id}
              experiment={exp}
              onSelect={onSelectExperiment}
            />
          ))}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-16 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
          <FlaskConical className="size-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {t("minimind.experiments.noActive")}
          </p>
          {plannedExperiments.length > 0 && (
            <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
              {t("minimind.experiments.plannedCount", { count: plannedExperiments.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add i18n keys to `en.json`**

In `src/lib/i18n/locales/en.json`, add after the `"minimind"` block's `"experience"` section (after line ~797):

```json
    "experiments": {
      "heading": "Experiment Lab",
      "intro": "Explore MiniMind internals through interactive experiments. Each experiment lets you run modules side-by-side, compare strategies, and see what's happening inside the model.",
      "noActive": "No active experiments yet. Check back soon!",
      "plannedCount": "{{count}} experiment(s) in development",
      "backToHub": "Back to Experiments",
      "run": "Run Experiment",
      "running": "Running...",
      "timing": "Completed in {{ms}}ms",
      "errors": {
        "experimentNotFound": "Experiment \"{{id}}\" not found in registry.",
        "runnerFailed": "Experiment execution failed.",
        "contextFailed": "Failed to create experiment context. Check module configuration."
      }
    },
```

- [ ] **Step 3: Add i18n keys to `zh-CN.json`**

In `src/lib/i18n/locales/zh-CN.json`, add the same block with Chinese translations:

```json
    "experiments": {
      "heading": "实验实验室",
      "intro": "通过交互式实验探索 MiniMind 内部机制。每个实验让你并排运行模块、比较策略、观察模型内部运作。",
      "noActive": "暂无可用实验，敬请期待！",
      "plannedCount": "{{count}} 个实验开发中",
      "backToHub": "返回实验列表",
      "run": "运行实验",
      "running": "运行中...",
      "timing": "耗时 {{ms}}ms",
      "errors": {
        "experimentNotFound": "未找到实验 \"{{id}}\"。",
        "runnerFailed": "实验执行失败。",
        "contextFailed": "无法创建实验上下文，请检查模块配置。"
      }
    },
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/minimind/experiments/ExperimentHub.tsx src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(minimind): add ExperimentHub + i18n keys"
```

---

### Task 4: Create ExperimentInputPanel

**Files:**
- Create: `src/components/minimind/experiments/ExperimentInputPanel.tsx`

**Interfaces:**
- Consumes: `MiniMindExperiment` from `@/data/minimind/experiment-registry`
- Produces: `ExperimentInputPanel` component
- Props: `{ experiment: MiniMindExperiment; input: Record<string, unknown>; onChange: (input: Record<string, unknown>) => void }`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { MiniMindExperiment } from "@/data/minimind/experiment-registry";

// ============================================================
// ExperimentInputPanel — Dynamic input form
// ============================================================
//
// Reads experiment.requiredCapabilities.dataRequirements to
// determine which input fields to render. A single component
// handles all experiment types — per-experiment input components
// are overkill at the current scale (4 experiments).
//
// Each module requirement maps to a section:
//   tokenizer → textarea for input text
//   embedding → mode selector + token IDs or token pair
//   attention → sequence textarea + causal mask checkbox
//   model     → (future) textarea + temperature slider
// ============================================================

interface ExperimentInputPanelProps {
  experiment: MiniMindExperiment;
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}

export function ExperimentInputPanel({
  experiment,
  input,
  onChange,
}: ExperimentInputPanelProps) {
  const moduleNames = new Set(
    experiment.requiredCapabilities.dataRequirements.map((r) => r.module)
  );

  const updateField = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...input, [key]: value });
    },
    [input, onChange]
  );

  return (
    <div className="space-y-4">
      {/* ── Tokenizer input ──────────────────────────────────── */}
      {moduleNames.has("tokenizer") && (
        <div className="space-y-2">
          <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
            Input Text
          </label>
          <textarea
            value={(input.text as string) ?? ""}
            onChange={(e) => updateField("text", e.target.value)}
            placeholder="Enter text to tokenize..."
            rows={3}
            className={cn(
              "w-full resize-y rounded-xl border bg-transparent px-4 py-3 font-mono text-sm",
              "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
              "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
              "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
            )}
          />
        </div>
      )}

      {/* ── Embedding input ──────────────────────────────────── */}
      {moduleNames.has("embedding") && (
        <div className="space-y-3">
          {/* Mode selector */}
          <div className="space-y-2">
            <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
              Mode
            </label>
            <div className="flex gap-2">
              {(["lookup", "similarity"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateField("mode", mode)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 font-mono text-xs transition-colors",
                    (input.mode as string) === mode
                      ? "border-brand/30 bg-brand/[0.08] text-brand dark:border-brand/40 dark:text-brand/80"
                      : "border-brand/10 bg-transparent text-slate-500 dark:border-white/[0.08] dark:text-slate-400"
                  )}
                >
                  {mode === "lookup" ? "Lookup" : "Similarity"}
                </button>
              ))}
            </div>
          </div>

          {/* Lookup fields */}
          {input.mode === "lookup" && (
            <div className="space-y-2">
              <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
                Token IDs (comma-separated)
              </label>
              <input
                type="text"
                value={(input.tokenIds as string) ?? ""}
                onChange={(e) => updateField("tokenIds", e.target.value)}
                placeholder="0, 1, 42"
                className={cn(
                  "w-full rounded-xl border bg-transparent px-4 py-2.5 font-mono text-sm",
                  "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
                  "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
                  "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
                )}
              />
            </div>
          )}

          {/* Similarity fields */}
          {input.mode === "similarity" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
                  Token A
                </label>
                <input
                  type="text"
                  value={(input.tokenA as string) ?? ""}
                  onChange={(e) => updateField("tokenA", e.target.value)}
                  placeholder="hello"
                  className={cn(
                    "w-full rounded-xl border bg-transparent px-4 py-2.5 font-mono text-sm",
                    "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
                    "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
                    "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
                  )}
                />
              </div>
              <div className="space-y-2">
                <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
                  Token B
                </label>
                <input
                  type="text"
                  value={(input.tokenB as string) ?? ""}
                  onChange={(e) => updateField("tokenB", e.target.value)}
                  placeholder="world"
                  className={cn(
                    "w-full rounded-xl border bg-transparent px-4 py-2.5 font-mono text-sm",
                    "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
                    "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
                    "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
                  )}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Attention input ──────────────────────────────────── */}
      {moduleNames.has("attention") && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
              Sequence Vectors (JSON array of arrays)
            </label>
            <textarea
              value={(input.sequence as string) ?? "[[1,0,0,0],[0,1,0,0],[0,0,1,0]]"}
              onChange={(e) => updateField("sequence", e.target.value)}
              rows={4}
              className={cn(
                "w-full resize-y rounded-xl border bg-transparent px-4 py-3 font-mono text-xs",
                "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
                "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
                "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
              )}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(input.causalMask as boolean) ?? true}
              onChange={(e) => updateField("causalMask", e.target.checked)}
              className="rounded border-brand/20 bg-brand/[0.04] accent-brand"
            />
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              Apply causal mask
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/experiments/ExperimentInputPanel.tsx
git commit -m "feat(minimind): add ExperimentInputPanel"
```

---

### Task 5: Create TokenizerComparisonResult

**Files:**
- Create: `src/components/minimind/experiments/results/TokenizerComparisonResult.tsx`

**Interfaces:**
- Consumes: `TokenizerComparisonData`, `ExperimentError`, `ExperimentTiming` from `@/lib/minimind/experiments`; `StageCard` from `@/components/minimind/playground/forward/shared/StageCard`; `StatRow` from `@/components/minimind/playground/forward/shared/StatRow`
- Produces: `TokenizerComparisonResult` component
- Props: `{ data: TokenizerComparisonData; errors: ExperimentError[]; timing: ExperimentTiming }`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { cn } from "@/lib/utils";
import type {
  TokenizerComparisonData,
  ExperimentError,
  ExperimentTiming,
} from "@/lib/minimind/experiments";
import { StageCard } from "@/components/minimind/playground/forward/shared/StageCard";
import { StatRow } from "@/components/minimind/playground/forward/shared/StatRow";

// ============================================================
// Helpers
// ============================================================

function ratioColor(ratio: number): string {
  if (ratio <= 2) return "text-emerald-500 dark:text-emerald-400";
  if (ratio <= 4) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function unknownRateColor(rate: number): string {
  if (rate < 0.05) return "text-emerald-500 dark:text-emerald-400";
  if (rate < 0.2) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

// ============================================================
// Component
// ============================================================

interface TokenizerComparisonResultProps {
  data: TokenizerComparisonData;
  errors: ExperimentError[];
  timing: ExperimentTiming;
}

export function TokenizerComparisonResult({
  data,
  errors,
  timing,
}: TokenizerComparisonResultProps) {
  return (
    <div className="space-y-6">
      {/* ── Timing ───────────────────────────────────────────── */}
      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
        Completed in {timing.durationMs.toFixed(0)}ms
      </p>

      {/* ── Errors ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
          {errors.map((err, i) => (
            <p key={i} className="font-mono text-xs text-amber-600 dark:text-amber-400">
              [{err.phase}] {err.message}
            </p>
          ))}
        </div>
      )}

      {/* ── Input text display ────────────────────────────────── */}
      <StageCard title="Input">
        <p className="font-mono text-sm text-slate-600 dark:text-slate-300">
          {data.inputText || "(empty)"}
        </p>
      </StageCard>

      {/* ── Side-by-side comparison ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* MiniTokenizer */}
        <StageCard title="MiniTokenizer (Word-level)">
          <div className="space-y-3">
            <StatRow
              items={[
                { label: "Tokens", value: data.miniTokenizer.tokenCount },
                { label: "Vocab", value: data.miniTokenizer.vocabSize },
                { label: "Unknown", value: data.miniTokenizer.unknownCount },
              ]}
            />
            {/* Token table */}
            <div className="max-h-48 overflow-y-auto rounded-lg border border-brand/10 bg-brand/[0.02] dark:border-white/[0.06] dark:bg-white/[0.01]">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-brand/10 dark:border-white/[0.06]">
                    <th className="px-3 py-1.5 text-left text-[0.6rem] text-slate-400">#</th>
                    <th className="px-3 py-1.5 text-left text-[0.6rem] text-slate-400">Token</th>
                    <th className="px-3 py-1.5 text-right text-[0.6rem] text-slate-400">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.miniTokenizer.tokens.map((token, i) => (
                    <tr key={i} className="border-b border-brand/[0.04] dark:border-white/[0.03]">
                      <td className="px-3 py-1 text-slate-400">{i}</td>
                      <td className="px-3 py-1 text-foreground">{token}</td>
                      <td className="px-3 py-1 text-right text-slate-400">
                        {data.miniTokenizer.tokenIds[i]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </StageCard>

        {/* CharacterTokenizer */}
        <StageCard title="CharacterTokenizer (Character-level)">
          <div className="space-y-3">
            <StatRow
              items={[
                { label: "Tokens", value: data.charTokenizer.tokenCount },
                { label: "Vocab", value: data.charTokenizer.vocabSize },
                { label: "Unknown", value: data.charTokenizer.unknownCount },
              ]}
            />
            <div className="max-h-48 overflow-y-auto rounded-lg border border-brand/10 bg-brand/[0.02] dark:border-white/[0.06] dark:bg-white/[0.01]">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-brand/10 dark:border-white/[0.06]">
                    <th className="px-3 py-1.5 text-left text-[0.6rem] text-slate-400">#</th>
                    <th className="px-3 py-1.5 text-left text-[0.6rem] text-slate-400">Token</th>
                    <th className="px-3 py-1.5 text-right text-[0.6rem] text-slate-400">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.charTokenizer.tokens.map((token, i) => (
                    <tr key={i} className="border-b border-brand/[0.04] dark:border-white/[0.03]">
                      <td className="px-3 py-1 text-slate-400">{i}</td>
                      <td className="px-3 py-1 text-foreground">{token}</td>
                      <td className="px-3 py-1 text-right text-slate-400">
                        {data.charTokenizer.tokenIds[i]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </StageCard>
      </div>

      {/* ── Comparison metrics ────────────────────────────────── */}
      <StageCard title="Comparison Metrics">
        <div className="space-y-3">
          {/* Token count ratio */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Token Ratio (char / word)
            </span>
            <span className={cn("font-mono text-sm font-semibold", ratioColor(data.comparison.tokenRatio))}>
              {data.comparison.tokenRatio.toFixed(2)}×
            </span>
          </div>

          {/* Unknown rate comparison */}
          <StatRow
            items={[
              {
                label: "Mini Unknown Rate",
                value: (data.comparison.miniUnknownRate * 100).toFixed(1) + "%",
              },
              {
                label: "Char Unknown Rate",
                value: (data.comparison.charUnknownRate * 100).toFixed(1) + "%",
              },
            ]}
          />

          {/* Token counts */}
          <StatRow
            items={[
              { label: "Mini Tokens", value: data.comparison.miniTokenCount },
              { label: "Char Tokens", value: data.comparison.charTokenCount },
            ]}
          />
        </div>
      </StageCard>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/experiments/results/TokenizerComparisonResult.tsx
git commit -m "feat(minimind): add TokenizerComparisonResult renderer"
```

---

### Task 6: Create EmbeddingExplorerResult

**Files:**
- Create: `src/components/minimind/experiments/results/EmbeddingExplorerResult.tsx`

**Interfaces:**
- Consumes: `EmbeddingExplorerData`, `ExperimentError`, `ExperimentTiming` from `@/lib/minimind/experiments`; `StageCard`, `StatRow`, `VectorBarChart` from forward/shared
- Produces: `EmbeddingExplorerResult` component
- Props: `{ data: EmbeddingExplorerData; errors: ExperimentError[]; timing: ExperimentTiming }`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { cn } from "@/lib/utils";
import type {
  EmbeddingExplorerData,
  ExperimentError,
  ExperimentTiming,
} from "@/lib/minimind/experiments";
import { StageCard } from "@/components/minimind/playground/forward/shared/StageCard";
import { StatRow } from "@/components/minimind/playground/forward/shared/StatRow";
import { VectorBarChart } from "@/components/minimind/playground/forward/shared/VectorBarChart";

// ============================================================
// Helpers
// ============================================================

function similarityColor(sim: number): string {
  if (sim >= 0.7) return "text-emerald-500 dark:text-emerald-400";
  if (sim >= 0.3) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function similarityBarColor(sim: number): string {
  if (sim >= 0.7) return "rgba(16, 185, 129, 0.6)";    // emerald
  if (sim >= 0.3) return "rgba(245, 158, 11, 0.6)";     // amber
  return "rgba(239, 68, 68, 0.6)";                       // red
}

// ============================================================
// Component
// ============================================================

interface EmbeddingExplorerResultProps {
  data: EmbeddingExplorerData;
  errors: ExperimentError[];
  timing: ExperimentTiming;
}

export function EmbeddingExplorerResult({
  data,
  errors,
  timing,
}: EmbeddingExplorerResultProps) {
  return (
    <div className="space-y-6">
      {/* ── Timing ───────────────────────────────────────────── */}
      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
        Completed in {timing.durationMs.toFixed(0)}ms
      </p>

      {/* ── Errors ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
          {errors.map((err, i) => (
            <p key={i} className="font-mono text-xs text-amber-600 dark:text-amber-400">
              [{err.phase}] {err.message}
            </p>
          ))}
        </div>
      )}

      {/* ── Matrix info ───────────────────────────────────────── */}
      <StageCard title="Embedding Matrix">
        <StatRow
          items={[
            { label: "Vocab Size", value: data.matrixInfo.vocabSize },
            { label: "Embedding Dim", value: data.matrixInfo.embeddingDim },
            { label: "Parameters", value: data.matrixInfo.totalParameters.toLocaleString("en-US") },
          ]}
        />
      </StageCard>

      {/* ── Lookup vectors ────────────────────────────────────── */}
      {data.mode === "lookup" && data.vectors && data.vectors.length > 0 && (
        <div className="space-y-4">
          {data.vectors.map((vec) => (
            <StageCard key={vec.tokenId} title={`Token ${vec.tokenId}: "${vec.token}"`}>
              <div className="space-y-3">
                <VectorBarChart data={vec.vector} height={80} />
                <StatRow
                  items={[
                    { label: "Min", value: vec.stats.min },
                    { label: "Max", value: vec.stats.max },
                    { label: "Mean", value: vec.stats.mean },
                    { label: "L2 Norm", value: vec.stats.l2Norm },
                  ]}
                />
              </div>
            </StageCard>
          ))}
        </div>
      )}
      {data.mode === "lookup" && (!data.vectors || data.vectors.length === 0) && (
        <StageCard>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
            No vectors to display. Check that the token IDs are valid.
          </p>
        </StageCard>
      )}

      {/* ── Similarity ────────────────────────────────────────── */}
      {data.mode === "similarity" && data.similarities && data.similarities.length > 0 && (
        <div className="space-y-4">
          {data.similarities.map((sim, i) => (
            <StageCard
              key={i}
              title={`Similarity: "${sim.tokenA}" ↔ "${sim.tokenB}"`}
            >
              <div className="space-y-3">
                {/* Similarity score */}
                <div className="flex items-center gap-4">
                  <span className="font-mono text-3xl font-bold tabular-nums">
                    <span className={similarityColor(sim.cosineSimilarity)}>
                      {sim.cosineSimilarity.toFixed(4)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Cosine similarity
                  </span>
                </div>

                {/* Visual bar */}
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${((sim.cosineSimilarity + 1) / 2) * 100}%`,
                      backgroundColor: similarityBarColor(sim.cosineSimilarity),
                    }}
                  />
                </div>

                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {sim.cosineSimilarity >= 0.7
                    ? "Strongly related — these tokens likely appear in similar contexts."
                    : sim.cosineSimilarity >= 0.3
                      ? "Moderately related — some shared contextual overlap."
                      : sim.cosineSimilarity >= 0
                        ? "Weakly related — mostly orthogonal in embedding space."
                        : "Negatively correlated — these tokens appear in opposite contexts."}
                </p>
              </div>
            </StageCard>
          ))}
        </div>
      )}
      {data.mode === "similarity" && (!data.similarities || data.similarities.length === 0) && (
        <StageCard>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
            No similarity data. Check that both tokens exist in the vocabulary.
          </p>
        </StageCard>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/experiments/results/EmbeddingExplorerResult.tsx
git commit -m "feat(minimind): add EmbeddingExplorerResult renderer"
```

---

### Task 7: Create AttentionHeatmapResult

**Files:**
- Create: `src/components/minimind/experiments/results/AttentionHeatmapResult.tsx`

**Interfaces:**
- Consumes: `AttentionHeatmapData`, `ExperimentError`, `ExperimentTiming` from `@/lib/minimind/experiments`; `StageCard`, `StatRow`, `HeatmapGrid`, `DistributionChart` from forward/shared
- Produces: `AttentionHeatmapResult` component
- Props: `{ data: AttentionHeatmapData; errors: ExperimentError[]; timing: ExperimentTiming }`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  AttentionHeatmapData,
  ExperimentError,
  ExperimentTiming,
} from "@/lib/minimind/experiments";
import { StageCard } from "@/components/minimind/playground/forward/shared/StageCard";
import { StatRow } from "@/components/minimind/playground/forward/shared/StatRow";
import { HeatmapGrid } from "@/components/minimind/playground/forward/shared/HeatmapGrid";
import { DistributionChart } from "@/components/minimind/playground/forward/shared/DistributionChart";

// ============================================================
// Component
// ============================================================

interface AttentionHeatmapResultProps {
  data: AttentionHeatmapData;
  errors: ExperimentError[];
  timing: ExperimentTiming;
}

export function AttentionHeatmapResult({
  data,
  errors,
  timing,
}: AttentionHeatmapResultProps) {
  const [selectedHead, setSelectedHead] = useState(0);
  const [viewMode, setViewMode] = useState<"weights" | "scores">("weights");

  const currentHead = data.heads[selectedHead];
  const viewData = viewMode === "weights" ? currentHead?.weights : currentHead?.rawScores;

  return (
    <div className="space-y-6">
      {/* ── Timing ───────────────────────────────────────────── */}
      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
        Completed in {timing.durationMs.toFixed(0)}ms
      </p>

      {/* ── Errors ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
          {errors.map((err, i) => (
            <p key={i} className="font-mono text-xs text-amber-600 dark:text-amber-400">
              [{err.phase}] {err.message}
            </p>
          ))}
        </div>
      )}

      {/* ── Context card ──────────────────────────────────────── */}
      <StageCard title="Attention Context">
        <StatRow
          items={[
            { label: "Seq Len", value: data.seqLen },
            { label: "Num Heads", value: data.numHeads },
            { label: "Head Dim", value: data.headDim },
            { label: "Causal Mask", value: data.causalMaskApplied ? "On" : "Off" },
          ]}
        />
      </StageCard>

      {data.heads.length === 0 ? (
        <StageCard>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
            No attention data available.
          </p>
        </StageCard>
      ) : (
        <>
          {/* ── Head selector ─────────────────────────────────── */}
          {data.numHeads > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: data.numHeads }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedHead(i)}
                  className={cn(
                    "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                    selectedHead === i
                      ? "border-brand/30 bg-brand/[0.08] text-brand dark:border-brand/40 dark:text-brand/80"
                      : "border-brand/10 bg-transparent text-slate-500 dark:border-white/[0.08] dark:text-slate-400"
                  )}
                >
                  Head {i}
                </button>
              ))}
            </div>
          )}

          {/* ── Heatmap card ──────────────────────────────────── */}
          <StageCard title={`Head ${selectedHead} — ${viewMode === "weights" ? "Attention Weights" : "Raw Scores"}`}>
            <div className="space-y-3">
              {/* View toggle */}
              <div className="flex gap-2">
                {(["weights", "scores"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "rounded-full border px-3 py-1 font-mono text-[0.6rem] uppercase transition-colors",
                      viewMode === mode
                        ? "border-brand/20 bg-brand/[0.06] text-brand/80"
                        : "border-brand/8 bg-transparent text-slate-400 dark:border-white/[0.05]"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {viewData && viewData.length > 0 ? (
                <div className="flex justify-center overflow-x-auto">
                  <HeatmapGrid
                    data={viewData}
                    rows={data.seqLen}
                    cols={data.seqLen}
                    cellSize={Math.max(12, Math.min(32, Math.floor(400 / data.seqLen)))}
                  />
                </div>
              ) : (
                <p className="font-mono text-xs text-slate-400">
                  No {viewMode} data for this head.
                </p>
              )}
            </div>
          </StageCard>

          {/* ── Head entropy ──────────────────────────────────── */}
          <StageCard title="Head Attention Entropy">
            <p className="mb-2 font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
              Higher entropy = more diffuse attention (token attends broadly).
              Lower entropy = focused attention (token attends to few positions).
            </p>
            <DistributionChart
              data={data.heads.map((h) => h.entropy)}
              bins={Math.min(data.numHeads, 12)}
              barColor="rgba(var(--brand-rgb), 0.5)"
              height={100}
            />
            <div className="mt-2 flex flex-wrap gap-3">
              {data.heads.map((h, i) => (
                <span
                  key={i}
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    i === selectedHead ? "text-brand" : "text-slate-400 dark:text-slate-500"
                  )}
                >
                  H{i}: {h.entropy.toFixed(2)}
                </span>
              ))}
            </div>
          </StageCard>

          {/* ── Head diversity (optional) ──────────────────────── */}
          {data.headDiversity && (
            <StageCard title="Head Diversity Matrix">
              <p className="mb-2 font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
                Pairwise similarity between head attention patterns.
                Lower values = heads attend to different patterns (more diversity).
              </p>
              <div className="flex justify-center overflow-x-auto">
                <HeatmapGrid
                  data={data.headDiversity.pairwiseSimilarity}
                  rows={data.numHeads}
                  cols={data.numHeads}
                  cellSize={20}
                />
              </div>
            </StageCard>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/experiments/results/AttentionHeatmapResult.tsx
git commit -m "feat(minimind): add AttentionHeatmapResult renderer"
```

---

### Task 8: Create ExperimentResultRenderer

**Files:**
- Create: `src/components/minimind/experiments/ExperimentResultRenderer.tsx`

**Interfaces:**
- Consumes: `ExperimentResult` from `@/lib/minimind/experiments`; three result renderer components from `./results/*`
- Produces: `ExperimentResultRenderer` component
- Props: `{ experimentId: string; result: ExperimentResult<unknown> }`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import type { ExperimentResult } from "@/lib/minimind/experiments";
import type {
  TokenizerComparisonData,
  EmbeddingExplorerData,
  AttentionHeatmapData,
} from "@/lib/minimind/experiments";
import { TokenizerComparisonResult } from "./results/TokenizerComparisonResult";
import { EmbeddingExplorerResult } from "./results/EmbeddingExplorerResult";
import { AttentionHeatmapResult } from "./results/AttentionHeatmapResult";

// ============================================================
// ExperimentResultRenderer — Switch dispatcher
// ============================================================
//
// Dispatches to the correct typed result renderer based on
// experimentId. Mirrors the discriminated union pattern from
// DeepDivePanel (forward playground).
//
// Each case casts result.data to the experiment-specific type.
// The typed data contracts are defined in experiment types.ts
// and are guaranteed by the runner that produced them.
// ============================================================

interface ExperimentResultRendererProps {
  experimentId: string;
  result: ExperimentResult<unknown>;
}

export function ExperimentResultRenderer({
  experimentId,
  result,
}: ExperimentResultRendererProps) {
  if (result.status === "failed" && result.data === null) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-6 text-center">
        <p className="font-mono text-sm text-red-600 dark:text-red-400">
          Experiment failed
        </p>
        {result.errors.map((err, i) => (
          <p key={i} className="mt-1 font-mono text-xs text-red-500/80 dark:text-red-400/70">
            [{err.phase}] {err.message}
          </p>
        ))}
      </div>
    );
  }

  switch (experimentId) {
    case "tokenizer-comparison-lab":
      return (
        <TokenizerComparisonResult
          data={result.data as TokenizerComparisonData}
          errors={result.errors}
          timing={result.timing}
        />
      );

    case "embedding-explorer":
      return (
        <EmbeddingExplorerResult
          data={result.data as EmbeddingExplorerData}
          errors={result.errors}
          timing={result.timing}
        />
      );

    case "attention-heatmap-explorer":
      return (
        <AttentionHeatmapResult
          data={result.data as AttentionHeatmapData}
          errors={result.errors}
          timing={result.timing}
        />
      );

    default:
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[ExperimentResultRenderer] Unknown experimentId: "${experimentId}"`
        );
      }
      return null;
  }
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/experiments/ExperimentResultRenderer.tsx
git commit -m "feat(minimind): add ExperimentResultRenderer dispatcher"
```

---

### Task 9: Create ExperimentWorkspace

**Files:**
- Create: `src/components/minimind/experiments/ExperimentWorkspace.tsx`

**Interfaces:**
- Consumes: `MiniMindExperiment` from registry, `ExperimentResult` from runtime, `ExperimentInputPanel`, `ExperimentResultRenderer`, `createExperimentContext` + `runExperiment` from `@/lib/minimind/experiments`, `getExperimentById` from registry
- Produces: `ExperimentWorkspace` component
- Props: `{ experimentId: string; onBack: () => void }`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  createExperimentContext,
  runExperiment,
} from "@/lib/minimind/experiments";
import type { ExperimentResult } from "@/lib/minimind/experiments";
import {
  getExperimentById,
  type MiniMindExperiment,
} from "@/data/minimind/experiment-registry";
import { ExperimentInputPanel } from "./ExperimentInputPanel";
import { ExperimentResultRenderer } from "./ExperimentResultRenderer";

// ============================================================
// Helpers — build typed input from loose form state
// ============================================================

function buildInput(
  experiment: MiniMindExperiment,
  formInput: Record<string, unknown>
): Record<string, unknown> {
  const moduleNames = new Set(
    experiment.requiredCapabilities.dataRequirements.map((r) => r.module)
  );

  const input: Record<string, unknown> = {};

  if (moduleNames.has("tokenizer")) {
    input.text = (formInput.text as string) ?? "";
  }

  if (moduleNames.has("embedding")) {
    input.mode = (formInput.mode as string) ?? "lookup";
    if (input.mode === "lookup") {
      const rawIds = (formInput.tokenIds as string) ?? "";
      input.tokenIds = rawIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
    }
    if (input.mode === "similarity") {
      input.tokenPair = {
        tokenA: (formInput.tokenA as string) ?? "",
        tokenB: (formInput.tokenB as string) ?? "",
      };
    }
  }

  if (moduleNames.has("attention")) {
    try {
      input.sequence = JSON.parse((formInput.sequence as string) ?? "[]");
    } catch {
      input.sequence = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
    }
    input.causalMask = (formInput.causalMask as boolean) ?? true;
  }

  return input;
}

// ============================================================
// ExperimentWorkspace
// ============================================================

interface ExperimentWorkspaceProps {
  experimentId: string;
  onBack: () => void;
}

export function ExperimentWorkspace({
  experimentId,
  onBack,
}: ExperimentWorkspaceProps) {
  const { t } = useTranslation();
  const [formInput, setFormInput] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ExperimentResult<unknown> | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const experiment = getExperimentById(experimentId);

  const handleRun = useCallback(() => {
    if (!experiment) {
      setErrorMsg(
        t("minimind.experiments.errors.experimentNotFound", { id: experimentId })
      );
      setRunStatus("error");
      return;
    }

    setRunStatus("running");
    setErrorMsg(null);
    setResult(null);

    try {
      const context = createExperimentContext(experiment);
      const typedInput = buildInput(experiment, formInput);
      const expResult = runExperiment(experimentId, context, typedInput);

      setResult(expResult);
      setRunStatus(expResult.status === "failed" && expResult.data === null ? "error" : "done");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : t("minimind.experiments.errors.runnerFailed")
      );
      setRunStatus("error");
    }
  }, [experiment, experimentId, formInput, t]);

  // Experiment not found
  if (!experiment) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="font-mono text-sm text-red-500">
          {t("minimind.experiments.errors.experimentNotFound", { id: experimentId })}
        </p>
        <button
          onClick={onBack}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand/10 px-4 py-2 font-mono text-xs text-slate-500 transition-colors hover:border-brand/30 hover:text-brand"
        >
          <ArrowLeft className="size-3.5" />
          {t("minimind.experiments.backToHub")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 font-mono text-xs text-slate-500 transition-colors hover:text-brand dark:text-slate-400 dark:hover:text-brand"
        >
          <ArrowLeft className="size-3.5" />
          {t("minimind.experiments.backToHub")}
        </button>
        <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
          {experiment.title}
        </h1>
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {experiment.description}
        </p>
      </div>

      {/* ── Input Panel ───────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-2xl border p-5 backdrop-blur-sm",
          "border-brand/15 bg-brand/[0.03]",
          "dark:border-white/[0.08] dark:bg-white/[0.02]"
        )}
      >
        <ExperimentInputPanel
          experiment={experiment}
          input={formInput}
          onChange={setFormInput}
        />

        <button
          type="button"
          onClick={handleRun}
          disabled={runStatus === "running"}
          className={cn(
            "mt-5 w-full rounded-full border px-6 py-2.5 font-mono text-sm font-semibold transition-all duration-300 sm:w-auto",
            "border-brand/20 bg-brand/[0.08] text-brand hover:bg-brand/[0.14]",
            "dark:border-brand/30 dark:text-brand/80 dark:hover:bg-brand/[0.12]",
            runStatus === "running" && "cursor-not-allowed opacity-60"
          )}
        >
          {runStatus === "running"
            ? t("minimind.experiments.running")
            : t("minimind.experiments.run")}
        </button>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {runStatus === "error" && errorMsg && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-4">
          <p className="font-mono text-sm text-red-600 dark:text-red-400">
            {errorMsg}
          </p>
        </div>
      )}

      {/* ── Result ─────────────────────────────────────────────── */}
      {runStatus === "done" && result && (
        <ExperimentResultRenderer experimentId={experimentId} result={result} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/experiments/ExperimentWorkspace.tsx
git commit -m "feat(minimind): add ExperimentWorkspace"
```

---

### Task 10: Create ExperimentsPageClient

**Files:**
- Create: `src/components/minimind/experiments/ExperimentsPageClient.tsx`

**Interfaces:**
- Consumes: `ExperimentHub`, `ExperimentWorkspace`
- Produces: `ExperimentsPageClient` component (root state owner)
- Props: none (root component)

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExperimentHub } from "./ExperimentHub";
import { ExperimentWorkspace } from "./ExperimentWorkspace";

// ============================================================
// ExperimentsPageClient — Root state owner
// ============================================================
//
// Owns two pieces of state:
//   view                 — "hub" | "workspace"
//   selectedExperimentId — which experiment is active
//
// This is the sole state owner for the experiments page.
// No router, no context, no external state library.
// Matches ForwardPlayground's simplicity.
// ============================================================

export function ExperimentsPageClient() {
  const [view, setView] = useState<"hub" | "workspace">("hub");
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);

  const handleSelectExperiment = useCallback((id: string) => {
    setSelectedExperimentId(id);
    setView("workspace");
  }, []);

  const handleBackToHub = useCallback(() => {
    setView("hub");
    setSelectedExperimentId(null);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {view === "hub" && (
        <motion.div
          key="hub"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ExperimentHub onSelectExperiment={handleSelectExperiment} />
        </motion.div>
      )}

      {view === "workspace" && selectedExperimentId && (
        <motion.div
          key="workspace"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ExperimentWorkspace
            experimentId={selectedExperimentId}
            onBack={handleBackToHub}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/experiments/ExperimentsPageClient.tsx
git commit -m "feat(minimind): add ExperimentsPageClient state owner"
```

---

### Task 11: Create barrel index + wire up page route

**Files:**
- Create: `src/components/minimind/experiments/index.ts`
- Modify: `src/app/ai-lab/experiments/page.tsx`

**Interfaces:**
- Consumes: All experiment components, `ExperimentsPageClient`
- Produces: Barrel export + page route

- [ ] **Step 1: Write the barrel index**

```typescript
// ============================================================
// MiniMind — experiments/index.ts
// ============================================================
// Experiment Experience Layer — Barrel Export
//
// Exports all experiment UI components for the
// Hub + Workspace architecture.
// ============================================================

export { ExperimentsPageClient } from "./ExperimentsPageClient";
export { ExperimentHub } from "./ExperimentHub";
export { ExperimentCard } from "./ExperimentCard";
export { ExperimentWorkspace } from "./ExperimentWorkspace";
export { ExperimentInputPanel } from "./ExperimentInputPanel";
export { ExperimentResultRenderer } from "./ExperimentResultRenderer";
export { TokenizerComparisonResult } from "./results/TokenizerComparisonResult";
export { EmbeddingExplorerResult } from "./results/EmbeddingExplorerResult";
export { AttentionHeatmapResult } from "./results/AttentionHeatmapResult";
```

- [ ] **Step 2: Replace the page route**

Read `src/app/ai-lab/experiments/page.tsx` and replace its entire contents:

```typescript
import type { Metadata } from "next";
import { ExperimentsPageClient } from "@/components/minimind/experiments";

export const metadata: Metadata = {
  title: "Experiment Lab",
  description:
    "Interactive MiniMind experiments — explore tokenization strategies, embedding vectors, attention patterns, and more through hands-on comparisons.",
};

export default function ExperimentsPage() {
  return <ExperimentsPageClient />;
}
```

- [ ] **Step 3: Verify — TypeScript**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Verify — Build**

Run: `npm run build`
Expected: zero errors, zero warnings. The `/ai-lab/experiments` route compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add src/components/minimind/experiments/index.ts src/app/ai-lab/experiments/page.tsx
git commit -m "feat(minimind): wire up experiments page route + barrel export"
```

---

### Task 12: Final verification + lint

**Files:**
- None created or modified — verification only.

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: zero errors, zero warnings.

- [ ] **Step 4: Verify constraints**

Manual check:
- [ ] `src/lib/minimind/experiments/` has zero React/JSX imports
- [ ] `src/components/minimind/playground/` files unchanged
- [ ] `src/components/minimind/playground/forward/` files unchanged
- [ ] `src/components/minimind/experience/` files unchanged
- [ ] No `any` types in any new file
- [ ] All user-facing strings use `t()` from i18n (except ExperimentCard and result renderer helper text, which are for developers)

- [ ] **Step 5: Final commit (if any lint fixes were needed)**

```bash
git add -A
git commit -m "chore(minimind): Phase 20 final verification pass"
```
