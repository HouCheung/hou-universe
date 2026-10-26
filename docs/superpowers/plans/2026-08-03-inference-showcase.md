# Inference Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a MiniMind Inference Showcase page at `/ai-lab/inference` that exposes the existing inference engine through an interactive, visualization-rich UI.

**Architecture:** A custom `useInferenceEngine` hook wraps the `InferenceEngine` in `useRef`, manages async generation state, and exposes `generate()`, `steps`, `isRunning`, `result`, `cache`. Components are purely presentational. The `InferencePageClient` is the root state owner, composing Hero, Generation Playground, Pipeline Visualization, Token Stream, and KV Cache Panel sections.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, shadcn/ui, Framer Motion, lucide-react

## Global Constraints

- TypeScript strict mode, no `any` type
- Tailwind CSS only, no native CSS files, no inline `style` for complex styles
- All existing routes, components, design system, and i18n structure must be preserved
- Do NOT modify `src/lib/minimind/**` or `src/data/minimind/**`
- Do NOT create fake ML logic or add training code
- Do NOT modify the inference engine or registry files
- `src/components/minimind/inference/` is the component directory
- Barrel export via `index.ts`
- Follow existing glass-card, animation, and layout patterns from AI Lab

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/app/ai-lab/inference/page.tsx` | Server component, metadata |
| Create | `src/components/minimind/inference/InferencePageClient.tsx` | Root state owner, composes 5 sections |
| Create | `src/components/minimind/inference/InferenceVisualizer.tsx` | `useInferenceEngine` hook |
| Create | `src/components/minimind/inference/TokenStream.tsx` | Progressive token display |
| Create | `src/components/minimind/inference/GenerationTracePanel.tsx` | Per-step expandable detail panel |
| Create | `src/components/minimind/inference/InferenceStageCard.tsx` | Reusable glass card wrapper |
| Create | `src/components/minimind/inference/index.ts` | Barrel export |
| Modify | `src/components/ai-lab/nav-config.ts` | Add Cpu icon type, inference nav item, dock route |
| Modify | `src/components/ai-lab/BreadcrumbBar.tsx` | Add "inference" to SEGMENT_LABELS |
| Modify | `src/lib/i18n/locales/en.json` | Add `aiLab.nav.inference: "Inference"` |
| Modify | `src/lib/i18n/locales/zh-CN.json` | Add `aiLab.nav.inference: "推理"` |

---

### Task 1: Add i18n keys

**Files:**
- Modify: `src/lib/i18n/locales/en.json:755` (after `"forward": "Forward"`)
- Modify: `src/lib/i18n/locales/zh-CN.json:755` (after `"forward": "前向模型"`)

**Interfaces:**
- Produces: `aiLab.nav.inference` key available for `useTranslation()`

- [ ] **Step 1: Add English key**

In `src/lib/i18n/locales/en.json`, find line 755:
```json
"forward": "Forward"
```
Add a comma and the new key:
```json
"forward": "Forward",
"inference": "Inference"
```

- [ ] **Step 2: Add Chinese key**

In `src/lib/i18n/locales/zh-CN.json`, find line 755:
```json
"forward": "前向模型"
```
Add a comma and the new key:
```json
"forward": "前向模型",
"inference": "推理"
```

- [ ] **Step 3: Verify JSON validity**

Run: `npx prettier --check src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json`
Expected: Both files are valid (no parse errors)

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(i18n): add aiLab.nav.inference keys"
```

---

### Task 2: Update navigation config

**Files:**
- Modify: `src/components/ai-lab/nav-config.ts`
- Modify: `src/components/ai-lab/BreadcrumbBar.tsx`

**Interfaces:**
- Consumes: `aiLab.nav.inference` i18n key from Task 1
- Produces: `AI_LAB_NAV_ITEMS` includes inference; `AI_LAB_DOCK_ROUTES` includes `/ai-lab/inference`; `BreadcrumbBar` labels "inference" segment

- [ ] **Step 1: Add Cpu to icon union type**

In `src/components/ai-lab/nav-config.ts`, line 16, change:
```ts
icon: "Home" | "Map" | "Brain" | "Layers" | "FlaskConical" | "Gamepad2";
```
To:
```ts
icon: "Home" | "Map" | "Brain" | "Layers" | "FlaskConical" | "Gamepad2" | "Cpu";
```

- [ ] **Step 2: Add inference nav item**

In `src/components/ai-lab/nav-config.ts`, after line 33 (`{ icon: "Gamepad2", ... }`), add:
```ts
{ icon: "Cpu", labelKey: "aiLab.nav.inference", href: "/ai-lab/inference" },
```

- [ ] **Step 3: Add inference to dock routes**

In `src/components/ai-lab/nav-config.ts`, in the `AI_LAB_DOCK_ROUTES` array (line 46), add:
```ts
"/ai-lab/inference",
```

- [ ] **Step 4: Add BreadcrumbBar segment label**

In `src/components/ai-lab/BreadcrumbBar.tsx`, in the `SEGMENT_LABELS` object (line 33), add:
```ts
inference: "Inference",
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ai-lab/nav-config.ts src/components/ai-lab/BreadcrumbBar.tsx
git commit -m "feat(nav): add inference route to nav config and breadcrumb"
```

---

### Task 3: Create InferenceStageCard component

**Files:**
- Create: `src/components/minimind/inference/InferenceStageCard.tsx`

**Interfaces:**
- Produces: `InferenceStageCard` component — `{ children: ReactNode; title?: string; className?: string }`

- [ ] **Step 1: Create the component file**

Create `src/components/minimind/inference/InferenceStageCard.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================================
// InferenceStageCard — Reusable glass card for inference page
// ============================================================
//
// Wraps content in a glass-morphism card matching the AI Lab
// pattern. Used by all inference page sections for visual
// consistency.
// ============================================================

// -- Types --

interface InferenceStageCardProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

// -- Component --

export function InferenceStageCard({
  children,
  title,
  className,
}: InferenceStageCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm",
        "dark:border-white/[0.08] dark:bg-white/[0.02]",
        "p-5",
        className,
      )}
    >
      {/* Glow accent line at top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent dark:via-brand/40" />

      {title && (
        <h3 className="mb-4 text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h3>
      )}

      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/inference/InferenceStageCard.tsx
git commit -m "feat(inference): add InferenceStageCard glass card wrapper"
```

---

### Task 4: Create useInferenceEngine hook

**Files:**
- Create: `src/components/minimind/inference/InferenceVisualizer.tsx`

**Interfaces:**
- Consumes: `MiniMindModel` from `@/lib/minimind/model`, `InferenceEngine` from `@/lib/minimind/inference`, `GenerationStep`, `GenerationResult`, `KVCacheEntry`, `SamplingConfig` from `@/lib/minimind/inference`
- Produces:
  ```ts
  interface UseInferenceEngineReturn {
    generate: (prompt: string) => Promise<void>;
    steps: GenerationStep[];
    isRunning: boolean;
    result: GenerationResult | null;
    cache: KVCacheEntry[];
    error: string | null;
    engineStatus: { modelLoaded: boolean; engineReady: boolean };
    samplingConfig: SamplingConfig;
  }
  ```

- [ ] **Step 1: Create the hook file**

Create `src/components/minimind/inference/InferenceVisualizer.tsx`:

```tsx
"use client";

import { useState, useCallback, useRef } from "react";
import { MiniMindModel } from "@/lib/minimind/model";
import { MiniLMHead } from "@/lib/minimind/model";
import { MiniTokenizer } from "@/lib/minimind/tokenizer";
import { MiniEmbedding } from "@/lib/minimind/embedding";
import { RotaryEmbedding } from "@/lib/minimind/rope";
import { MiniTransformerBlock } from "@/lib/minimind/transformer";
import { MiniAttention } from "@/lib/minimind/attention";
import { MiniFeedForward } from "@/lib/minimind/ffn";
import { InferenceEngine } from "@/lib/minimind/inference";
import type { ModelConfig } from "@/lib/minimind/model";
import type {
  GenerationStep,
  GenerationResult,
  KVCacheEntry,
  SamplingConfig,
} from "@/lib/minimind/inference";

// ============================================================
// useInferenceEngine — wraps InferenceEngine for React
// ============================================================
//
// Creates a MiniMindModel + InferenceEngine once via useRef,
// then exposes a generate() function that iterates the
// AsyncGenerator<GenerationStep> and progressively updates
// state so the UI can render tokens as they arrive.
//
// Debug mode is ON by default for rich KV cache + trace data.
// ============================================================

// -- Types --

export interface UseInferenceEngineReturn {
  generate: (prompt: string) => Promise<void>;
  steps: GenerationStep[];
  isRunning: boolean;
  result: GenerationResult | null;
  cache: KVCacheEntry[];
  error: string | null;
  engineStatus: { modelLoaded: boolean; engineReady: boolean };
  samplingConfig: SamplingConfig;
}

// -- Constants --

const DEFAULT_CONFIG: ModelConfig = {
  vocabSize: 1000,
  dModel: 512,
  numHeads: 8,
  headDim: 64,
  dFF: 2048,
  numLayers: 1,
  maxSeqLen: 128,
  normEps: 1e-6,
  ropeTheta: 10000,
};

const DEFAULT_SAMPLING: SamplingConfig = {
  temperature: 1.0,
  topK: 0,
  topP: 1.0,
};

// -- Model factory --

function createModel(): MiniMindModel {
  const tokenizer = new MiniTokenizer({ addSpecialTokens: false });
  const embedding = new MiniEmbedding({
    vocabSize: DEFAULT_CONFIG.vocabSize,
    embeddingDim: DEFAULT_CONFIG.dModel,
  });
  const rope = new RotaryEmbedding({
    headDim: DEFAULT_CONFIG.headDim,
    theta: DEFAULT_CONFIG.ropeTheta,
    maxSeqLen: DEFAULT_CONFIG.maxSeqLen,
  });
  const attention = new MiniAttention({
    dModel: DEFAULT_CONFIG.dModel,
    numHeads: DEFAULT_CONFIG.numHeads,
    headDim: DEFAULT_CONFIG.headDim,
    maxSeqLen: DEFAULT_CONFIG.maxSeqLen,
  });
  const ffn = new MiniFeedForward({
    dModel: DEFAULT_CONFIG.dModel,
    dFF: DEFAULT_CONFIG.dFF,
    maxSeqLen: DEFAULT_CONFIG.maxSeqLen,
  });
  const block = new MiniTransformerBlock(
    {
      dModel: DEFAULT_CONFIG.dModel,
      numHeads: DEFAULT_CONFIG.numHeads,
      headDim: DEFAULT_CONFIG.headDim,
      dFF: DEFAULT_CONFIG.dFF,
      maxSeqLen: DEFAULT_CONFIG.maxSeqLen,
      normEps: DEFAULT_CONFIG.normEps,
    },
    attention,
    ffn,
  );
  const lmHead = new MiniLMHead({
    dModel: DEFAULT_CONFIG.dModel,
    vocabSize: DEFAULT_CONFIG.vocabSize,
    seed: 42,
  });

  return new MiniMindModel(DEFAULT_CONFIG, {
    tokenizer,
    embedding,
    rope,
    blocks: [block],
    lmHead,
  });
}

// -- Hook --

export function useInferenceEngine(): UseInferenceEngineReturn {
  const modelRef = useRef<MiniMindModel | null>(null);
  const engineRef = useRef<InferenceEngine | null>(null);

  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [cache, setCache] = useState<KVCacheEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Lazy-init model + engine on first access
  const getEngine = useCallback((): InferenceEngine | null => {
    try {
      if (!modelRef.current) {
        modelRef.current = createModel();
      }
      if (!engineRef.current) {
        engineRef.current = new InferenceEngine(modelRef.current);
      }
      return engineRef.current;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initialize engine",
      );
      return null;
    }
  }, []);

  const generate = useCallback(
    async (prompt: string) => {
      const engine = getEngine();
      if (!engine) return;

      setIsRunning(true);
      setError(null);
      setSteps([]);
      setResult(null);
      setCache([]);

      const collected: GenerationStep[] = [];

      try {
        const generator = engine.generate(prompt, {
          maxTokens: 20,
          sampling: DEFAULT_SAMPLING,
          debug: true,
        });

        for await (const step of generator) {
          collected.push(step);
          setSteps([...collected]);
        }

        const finalResult = engine.getResult(prompt);
        if (finalResult) {
          setResult(finalResult);
        }
        setCache(engine.getCache());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Generation failed",
        );
      } finally {
        setIsRunning(false);
      }
    },
    [getEngine],
  );

  const engineStatus = {
    modelLoaded: modelRef.current !== null,
    engineReady: engineRef.current !== null,
  };

  return {
    generate,
    steps,
    isRunning,
    result,
    cache,
    error,
    engineStatus,
    samplingConfig: DEFAULT_SAMPLING,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/inference/InferenceVisualizer.tsx
git commit -m "feat(inference): add useInferenceEngine hook"
```

---

### Task 5: Create TokenStream component

**Files:**
- Create: `src/components/minimind/inference/TokenStream.tsx`

**Interfaces:**
- Consumes: `GenerationStep[]` from `@/lib/minimind/inference`
- Produces: `TokenStream` component — `{ steps: GenerationStep[]; isRunning: boolean; onSelectStep: (step: GenerationStep | null) => void; selectedStep: GenerationStep | null }`

- [ ] **Step 1: Create the component**

Create `src/components/minimind/inference/TokenStream.tsx`:

```tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationStep } from "@/lib/minimind/inference";
import { InferenceStageCard } from "./InferenceStageCard";

// ============================================================
// TokenStream — Progressive token generation display
// ============================================================
//
// Renders each GenerationStep as a card showing:
//   - Step index, token text, token ID, probability, logit
//   - Expand to show alternatives
//
// Cards appear progressively via AnimatePresence as steps
// arrive from the async generator.
// ============================================================

// -- Types --

interface TokenStreamProps {
  steps: GenerationStep[];
  isRunning: boolean;
  onSelectStep: (step: GenerationStep | null) => void;
  selectedStep: GenerationStep | null;
}

// -- Helpers --

function formatProbability(p: number): string {
  return (p * 100).toFixed(2) + "%";
}

// -- Component --

export function TokenStream({
  steps,
  isRunning,
  onSelectStep,
  selectedStep,
}: TokenStreamProps) {
  if (steps.length === 0 && !isRunning) return null;

  return (
    <InferenceStageCard title="Token Stream" className="space-y-3">
      {/* Running indicator */}
      {isRunning && (
        <div className="flex items-center gap-2 rounded-full border border-brand/15 bg-brand/[0.04] px-3 py-1.5 w-fit">
          <Sparkles className="size-3 text-brand/60 animate-pulse" />
          <span className="font-mono text-[0.65rem] text-brand/70">
            Generating...
          </span>
        </div>
      )}

      {/* Token cards */}
      <div className="space-y-2">
        <AnimatePresence>
          {steps.map((step, i) => {
            const isSelected =
              selectedStep?.stepIndex === step.stepIndex;

            return (
              <motion.button
                key={step.stepIndex}
                type="button"
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.25,
                  ease: "easeOut",
                }}
                onClick={() =>
                  onSelectStep(isSelected ? null : step)
                }
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition-all duration-200",
                  isSelected
                    ? "border-brand/40 bg-brand/[0.08] dark:border-brand/30 dark:bg-brand/[0.10]"
                    : "border-brand/10 bg-brand/[0.02] hover:border-brand/20 hover:bg-brand/[0.05] dark:border-white/[0.05] dark:bg-white/[0.01] dark:hover:border-brand/25 dark:hover:bg-brand/[0.06]",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Left: step index + token */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[0.6rem] text-slate-400/70 dark:text-slate-500/60 shrink-0">
                      Step {step.stepIndex}
                    </span>
                    <span className="font-mono text-sm font-semibold text-foreground truncate">
                      {step.token}
                    </span>
                  </div>

                  {/* Right: metadata */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
                      id={step.tokenId}
                    </span>
                    <span className="font-mono text-[0.65rem] tabular-nums text-emerald-600/80 dark:text-emerald-400/70">
                      {formatProbability(step.probability)}
                    </span>
                    <ChevronRight
                      className={cn(
                        "size-3.5 text-slate-400/50 transition-transform duration-200",
                        isSelected && "rotate-90",
                      )}
                    />
                  </div>
                </div>

                {/* Expanded: logit */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 pt-2 border-t border-brand/10 dark:border-white/[0.05]"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                          Raw logit
                        </span>
                        <span className="font-mono text-[0.65rem] tabular-nums text-slate-500 dark:text-slate-400">
                          {step.logit.toFixed(4)}
                        </span>
                      </div>
                      <div>
                        <span className="font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                          Pipeline
                        </span>
                        <p className="mt-0.5 font-mono text-[0.6rem] leading-relaxed text-slate-500/70 dark:text-slate-400/60">
                          {step.pipelineDescription}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </InferenceStageCard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/inference/TokenStream.tsx
git commit -m "feat(inference): add TokenStream progressive display component"
```

---

### Task 6: Create GenerationTracePanel component

**Files:**
- Create: `src/components/minimind/inference/GenerationTracePanel.tsx`

**Interfaces:**
- Consumes: `GenerationStep` from `@/lib/minimind/inference`
- Produces: `GenerationTracePanel` — `{ step: GenerationStep | null }`

- [ ] **Step 1: Create the component**

Create `src/components/minimind/inference/GenerationTracePanel.tsx`:

```tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Hash, BarChart3, Dna } from "lucide-react";
import type { GenerationStep } from "@/lib/minimind/inference";
import { InferenceStageCard } from "./InferenceStageCard";

// ============================================================
// GenerationTracePanel — Per-step detail panel
// ============================================================
//
// Shows detailed information for a selected GenerationStep:
//   - Token alternatives (top-10 ranking)
//   - Cache snapshot (if debug mode captured it)
//   - Full pipeline description
//
// Slides in from below when a step is selected.
// ============================================================

// -- Types --

interface GenerationTracePanelProps {
  step: GenerationStep | null;
}

// -- Helpers --

function formatProbability(p: number): string {
  return (p * 100).toFixed(2) + "%";
}

// -- Component --

export function GenerationTracePanel({
  step,
}: GenerationTracePanelProps) {
  return (
    <AnimatePresence>
      {step && (
        <motion.div
          key={step.stepIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <InferenceStageCard
            title={`Step ${step.stepIndex} — Trace Details`}
            className="space-y-4"
          >
            {/* Selected token summary */}
            <div className="flex items-center gap-3 rounded-lg border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.01]">
              <Hash className="size-4 text-brand/60" />
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {step.token}
                </span>
                <span className="font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
                  id={step.tokenId}
                </span>
                <span className="font-mono text-[0.65rem] tabular-nums text-emerald-600/80 dark:text-emerald-400/70">
                  {formatProbability(step.probability)}
                </span>
              </div>
            </div>

            {/* Alternatives ranking */}
            {step.alternatives.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <BarChart3 className="size-3.5 text-brand/50" />
                  <span className="text-xs font-medium text-foreground">
                    Top Alternatives
                  </span>
                </div>
                <div className="space-y-1">
                  {step.alternatives.slice(0, 5).map((alt) => (
                    <div
                      key={alt.rank}
                      className="flex items-center justify-between rounded-md border border-brand/5 bg-brand/[0.01] px-3 py-1.5 dark:border-white/[0.03] dark:bg-white/[0.005]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[0.6rem] text-slate-400/70 dark:text-slate-500/60 w-6">
                          #{alt.rank}
                        </span>
                        <span className="font-mono text-[0.7rem] text-foreground">
                          {alt.token}
                        </span>
                        <span className="font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                          id={alt.tokenId}
                        </span>
                      </div>
                      <span className="font-mono text-[0.65rem] tabular-nums text-slate-500/70 dark:text-slate-400/60">
                        {formatProbability(alt.probability)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* KV Cache snapshot (debug mode) */}
            {step.cacheState && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Dna className="size-3.5 text-brand/50" />
                  <span className="text-xs font-medium text-foreground">
                    Cache State
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-brand/10 bg-brand/[0.02] px-3 py-2 dark:border-white/[0.05] dark:bg-white/[0.01]">
                    <p className="font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                      Cached Seq Length
                    </p>
                    <p className="font-mono text-sm tabular-nums text-foreground">
                      {step.cacheState.cachedSeqLen}
                    </p>
                  </div>
                  <div className="rounded-lg border border-brand/10 bg-brand/[0.02] px-3 py-2 dark:border-white/[0.05] dark:bg-white/[0.01]">
                    <p className="font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                      Layer Entropy Avg
                    </p>
                    <p className="font-mono text-[0.65rem] tabular-nums text-foreground">
                      {step.cacheState.layerEntropyAverages
                        .map((v) => v.toFixed(4))
                        .join(", ")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Pipeline description */}
            <div>
              <p className="mb-1 font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                Pipeline
              </p>
              <p className="font-mono text-[0.65rem] leading-relaxed text-slate-500/70 dark:text-slate-400/60">
                {step.pipelineDescription}
              </p>
            </div>
          </InferenceStageCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/inference/GenerationTracePanel.tsx
git commit -m "feat(inference): add GenerationTracePanel detail component"
```

---

### Task 7: Create InferencePageClient

**Files:**
- Create: `src/components/minimind/inference/InferencePageClient.tsx`

**Interfaces:**
- Consumes: `useInferenceEngine` from `./InferenceVisualizer`, `TokenStream` from `./TokenStream`, `GenerationTracePanel` from `./GenerationTracePanel`, `InferenceStageCard` from `./InferenceStageCard`
- Produces: `InferencePageClient` component — full page with Hero, Playground, Pipeline, Token Stream, KV Cache, Trace Panel sections

- [ ] **Step 1: Create the page client**

Create `src/components/minimind/inference/InferencePageClient.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Cpu,
  Thermometer,
  Database,
  ArrowRight,
  Split,
  Layers,
  RotateCw,
  Boxes,
  Target,
  Shuffle,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInferenceEngine } from "./InferenceVisualizer";
import { TokenStream } from "./TokenStream";
import { GenerationTracePanel } from "./GenerationTracePanel";
import { InferenceStageCard } from "./InferenceStageCard";
import type { GenerationStep } from "@/lib/minimind/inference";

// ============================================================
// InferencePageClient — Root state owner for inference page
// ============================================================
//
// Owns:
//   - prompt (controlled textarea)
//   - selectedStep (for trace panel)
//   - All engine state via useInferenceEngine hook
//
// Composes 5 sections:
//   1. Hero
//   2. Generation Playground
//   3. Pipeline Visualization
//   4. Token Stream + Trace Panel
//   5. KV Cache Panel
// ============================================================

// -- Animation variants --

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

// -- Pipeline stage data --

interface PipelineStage {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { icon: Split, label: "Tokenizer", detail: "Text → Token IDs" },
  { icon: Layers, label: "Embedding", detail: "Token IDs → Vectors" },
  { icon: Boxes, label: "Transformer", detail: "Self-Attention + FFN" },
  { icon: RotateCw, label: "KV Cache", detail: "Cached K/V per layer" },
  { icon: Target, label: "LM Head", detail: "Hidden → Vocab Logits" },
  { icon: Shuffle, label: "Sampler", detail: "Logits → Next Token" },
];

// -- Component --

export function InferencePageClient() {
  const {
    generate,
    steps,
    isRunning,
    result,
    cache,
    error,
    engineStatus,
    samplingConfig,
  } = useInferenceEngine();

  const [prompt, setPrompt] = useState("Hello MiniMind");
  const [selectedStep, setSelectedStep] = useState<GenerationStep | null>(null);

  const handleGenerate = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || isRunning) return;
    setSelectedStep(null);
    generate(trimmed);
  }, [prompt, isRunning, generate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  const canGenerate = prompt.trim().length > 0 && !isRunning;

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* ======================================================== */}
      {/* Section 1: Hero                                          */}
      {/* ======================================================== */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={headerVariants}
        className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
      >
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-4">
          {/* Subhead pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <Cpu className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              Inference Engine
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            MiniMind Inference Engine
          </h1>

          {/* Subtitle */}
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
            From prompt to generated token — visualize the complete
            generation pipeline.
          </p>

          {/* Status badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <StatusBadge
              icon={Cpu}
              label="Engine"
              value={
                engineStatus.engineReady ? "Ready" : "Initializing"
              }
              active={engineStatus.engineReady}
            />
            <StatusBadge
              icon={Thermometer}
              label="Sampling"
              value={`T=${samplingConfig.temperature}`}
              active
            />
            <StatusBadge
              icon={Database}
              label="KV Cache"
              value={cache.length > 0 ? "Active" : "Idle"}
              active={cache.length > 0}
            />
          </div>
        </div>
      </motion.section>

      {/* ======================================================== */}
      {/* Section 2: Generation Playground                          */}
      {/* ======================================================== */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-20 sm:mt-28"
      >
        <InferenceStageCard title="Generation Playground">
          <div className="space-y-4">
            {/* Textarea */}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a prompt, e.g. Hello MiniMind"
              rows={3}
              disabled={isRunning}
              className={cn(
                "w-full resize-none rounded-xl border border-brand/10 bg-slate-50/80 px-4 py-3",
                "font-mono text-sm text-foreground placeholder:text-slate-400/60",
                "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20",
                "dark:border-white/[0.06] dark:bg-white/[0.03] dark:placeholder:text-slate-500/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />

            {/* Footer: char count + button */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[0.6rem] text-slate-400/60 dark:text-slate-500/50">
                {prompt.length} characters
              </span>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200",
                  canGenerate
                    ? "bg-brand text-white hover:bg-brand/90 hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.2)] active:scale-[0.98]"
                    : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-white/[0.04] dark:text-slate-600",
                )}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Generate
                    <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </div>

            {/* Error display */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3 dark:border-red-500/15 dark:bg-red-500/[0.02]">
                <AlertTriangle className="size-4 text-red-500/70 shrink-0" />
                <p className="text-xs text-red-600/80 dark:text-red-400/70">
                  {error}
                </p>
              </div>
            )}
          </div>
        </InferenceStageCard>
      </motion.section>

      {/* ======================================================== */}
      {/* Section 3: Pipeline Visualization                        */}
      {/* ======================================================== */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-20 sm:mt-28"
      >
        <InferenceStageCard title="Generation Pipeline">
          <div className="relative">
            {PIPELINE_STAGES.map((stage, i) => {
              const isLast = i === PIPELINE_STAGES.length - 1;
              const Icon = stage.icon;

              return (
                <div key={stage.label} className="relative">
                  {/* Connector line + arrow */}
                  {!isLast && (
                    <div className="absolute left-[19px] top-full z-0 flex flex-col items-center">
                      <motion.div
                        initial={{ scaleY: 0 }}
                        whileInView={{ scaleY: 1 }}
                        viewport={{ once: true }}
                        transition={{
                          delay: i * 0.1 + 0.3,
                          duration: 0.3,
                          ease: "easeOut",
                        }}
                        className="h-3 w-px origin-top bg-gradient-to-b from-brand/20 to-brand/5 dark:from-brand/30 dark:to-brand/10"
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{
                          delay: i * 0.1 + 0.4,
                          duration: 0.2,
                        }}
                      >
                        <ArrowRight className="size-3 rotate-90 text-brand/30 dark:text-brand/50" />
                      </motion.div>
                    </div>
                  )}

                  {/* Stage card */}
                  <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{
                      delay: i * 0.1,
                      duration: 0.35,
                      ease: "easeOut",
                    }}
                    className="flex items-center gap-3 rounded-xl border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.01]"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/[0.08] text-brand/70 dark:bg-brand/[0.12] dark:text-brand/60">
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {stage.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
                        {stage.detail}
                      </p>
                    </div>
                  </motion.div>

                  {!isLast && <div className="h-2" />}
                </div>
              );
            })}
          </div>
        </InferenceStageCard>
      </motion.section>

      {/* ======================================================== */}
      {/* Section 4: Token Stream + Trace Panel                   */}
      {/* ======================================================== */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-20 sm:mt-28"
      >
        <div className="space-y-4">
          <TokenStream
            steps={steps}
            isRunning={isRunning}
            selectedStep={selectedStep}
            onSelectStep={setSelectedStep}
          />
          <GenerationTracePanel step={selectedStep} />
        </div>
      </motion.section>

      {/* ======================================================== */}
      {/* Section 5: KV Cache Panel                                */}
      {/* ======================================================== */}
      {cache.length > 0 && (
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={sectionVariants}
          className="mt-20 sm:mt-28"
        >
          <InferenceStageCard title="KV Cache">
            <div className="grid gap-3 sm:grid-cols-3">
              <CacheStat
                label="Layers"
                value={cache.length.toString()}
              />
              <CacheStat
                label="Cached Seq Length"
                value={
                  cache[0]?.metadata.length?.toString() ?? "0"
                }
              />
              <CacheStat
                label="Status"
                value="Active"
                active
              />
            </div>

            {/* Per-layer summary */}
            <div className="mt-4 space-y-1.5">
              <p className="font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                Per-Layer Metadata
              </p>
              {cache.map((entry) => (
                <div
                  key={entry.layerIndex}
                  className="flex items-center justify-between rounded-md border border-brand/5 bg-brand/[0.01] px-3 py-1.5 dark:border-white/[0.03] dark:bg-white/[0.005]"
                >
                  <span className="font-mono text-[0.65rem] text-foreground">
                    Layer {entry.layerIndex}
                  </span>
                  <span className="font-mono text-[0.6rem] text-slate-500/70 dark:text-slate-400/60">
                    {entry.metadata.length} positions
                  </span>
                </div>
              ))}
            </div>
          </InferenceStageCard>
        </motion.section>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatusBadge({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
        active
          ? "border-emerald-500/20 bg-emerald-500/[0.04] dark:border-emerald-500/15 dark:bg-emerald-500/[0.02]"
          : "border-slate-500/10 bg-slate-500/[0.03] dark:border-slate-500/10 dark:bg-slate-500/[0.02]",
      )}
    >
      <Icon
        className={cn(
          "size-3",
          active
            ? "text-emerald-500/70"
            : "text-slate-400/50 dark:text-slate-500/50",
        )}
      />
      <span className="font-mono text-[0.6rem] text-slate-500/70 dark:text-slate-400/60">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[0.65rem] font-medium",
          active
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-slate-500 dark:text-slate-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CacheStat({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-lg border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.01]">
      <p className="font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <p className="font-mono text-sm tabular-nums font-semibold text-foreground">
          {value}
        </p>
        {active && (
          <CheckCircle2 className="size-3.5 text-emerald-500/70" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/inference/InferencePageClient.tsx
git commit -m "feat(inference): add InferencePageClient root state owner"
```

---

### Task 8: Create barrel export and page

**Files:**
- Create: `src/components/minimind/inference/index.ts`
- Create: `src/app/ai-lab/inference/page.tsx`

**Interfaces:**
- Consumes: `InferencePageClient` from `./InferencePageClient`
- Produces: barrel exports; Next.js page route at `/ai-lab/inference`

- [ ] **Step 1: Create barrel export**

Create `src/components/minimind/inference/index.ts`:

```ts
export { InferencePageClient } from "./InferencePageClient";
export { useInferenceEngine } from "./InferenceVisualizer";
export type { UseInferenceEngineReturn } from "./InferenceVisualizer";
export { TokenStream } from "./TokenStream";
export { GenerationTracePanel } from "./GenerationTracePanel";
export { InferenceStageCard } from "./InferenceStageCard";
```

- [ ] **Step 2: Create page server component**

Create `src/app/ai-lab/inference/page.tsx`:

```tsx
import type { Metadata } from "next";
import { InferencePageClient } from "@/components/minimind/inference";

export const metadata: Metadata = {
  title: "MiniMind Inference | AI Lab",
  description:
    "Visualize MiniMind text generation pipeline and inference process.",
};

export default function InferencePage() {
  return <InferencePageClient />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/inference/index.ts src/app/ai-lab/inference/page.tsx
git commit -m "feat(inference): add barrel export and page route"
```

---

### Task 9: Build verification

- [ ] **Step 1: Run build**

```bash
cd "d:\123\HOU Universe" && npm run build
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 2: If build fails, fix issues and re-run until clean**

Fix any TypeScript errors, import issues, or missing exports.

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(inference): address build issues"
```
