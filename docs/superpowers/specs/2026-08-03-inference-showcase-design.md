# Inference Showcase — Design Spec

**Date:** 2026-08-03
**Phase:** 26
**Status:** Design approved

## Overview

Create a new Inference Showcase page at `/ai-lab/inference` that exposes the existing MiniMind inference engine through an interactive, visualization-rich UI. The purpose is to **show how MiniMind generates tokens internally** — not education tracking.

## Architecture

```
page.tsx (server component, metadata)
  └── InferencePageClient.tsx ("use client", root state owner)
        ├── useInferenceEngine hook (wraps InferenceEngine in useRef)
        ├── Hero Section
        ├── Generation Playground (textarea + Generate button)
        ├── Pipeline Visualization (conceptual stage cards)
        ├── Token Stream (per-step cards from GenerationStep[])
        └── KV Cache Panel (from KVCacheEntry[])
```

## Data Flow

```
User types prompt → clicks "Generate"
  → useInferenceEngine.generate(prompt, { debug: true })
    → InferenceEngine.generate() [AsyncGenerator<GenerationStep>]
      → for await (const step of generator):
          setSteps(prev => [...prev, step])   // progressive UI update
      → after loop:
          setResult(engine.getResult(prompt))
          setCache(engine.getCache())
  → Components reactively render steps as they arrive
```

## Component Tree

| Component | Responsibility |
|---|---|
| `page.tsx` | Server component, exports metadata |
| `InferencePageClient.tsx` | Root state owner, owns engine ref + all state, composes sections |
| `InferenceVisualizer.tsx` | Custom hook `useInferenceEngine` — wraps InferenceEngine, manages async generation state |
| `TokenStream.tsx` | Progressive token display — one card per GenerationStep |
| `GenerationTracePanel.tsx` | Per-step expandable detail panel (alternatives, pipeline description, debug trace summary) |
| `InferenceStageCard.tsx` | Reusable glass card wrapper for inference-specific styling |
| `index.ts` | Barrel re-export |

## Page Sections

### 1. Hero
- Title: "MiniMind Inference Engine"
- Subtitle: "From prompt to generated token — visualize the complete generation pipeline."
- Status badges: Engine status, Sampling strategy, KV Cache availability
- Follows existing glass-card hero pattern (rounded-2xl, glow accent, Rocket/Cpu icon)

### 2. Generation Playground
- Textarea with placeholder "Hello MiniMind"
- "Generate" button with loading spinner
- Character counter
- Follows InputPanel pattern from ForwardPlayground

### 3. Pipeline Visualization
- Static conceptual pipeline diagram showing: Prompt → Tokenizer → Token IDs → Embedding → Transformer Blocks → KV Cache → LM Head → Sampler → Next Token
- Each stage is a glass StageCard
- Uses inference-themed colors (rose accent to match ExplorationLinks inference card)
- Reuses visual language from forward playground

### 4. Token Stream
- Progressive display of GenerationStep entries
- Each card shows: step index, token text, token ID, probability, logit
- Expand to see alternatives (top-10 ranking)
- Shows pipeline description string from sampling
- Mono typography for all numeric values

### 5. KV Cache Panel
- Layer count from KVCacheEntry[].length
- Cached sequence length from getCachedSeqLen()
- Per-layer metadata summary (position count)
- Only displays values available from existing APIs — no fake data

## Navigation Integration

### nav-config.ts changes
- Add `"Cpu"` to the `NavItem.icon` union type
- Add new nav item: `{ icon: "Cpu", labelKey: "aiLab.nav.inference", href: "/ai-lab/inference" }`
- Add `/ai-lab/inference` to `AI_LAB_DOCK_ROUTES`

### i18n changes (en.json)
Add `"inference": "Inference"` to `aiLab.nav`

### i18n changes (zh-CN.json)
Add `"inference": "推理"` to `aiLab.nav`

## Visual Design

- **Color theme:** Brand-primary glass cards (matches all existing AI Lab pages), with subtle rose accents for inference-specific elements (status indicators, the Cpu icon)
- **Glass cards:** `rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm` (standard AI Lab pattern)
- **Animations:** Framer Motion — header fade-in, staggered cards, progressive token appearance
- **Typography:** Mono for all data values (`font-mono text-xs tabular-nums`), standard for labels
- **Status badges:** emerald (active), slate (idle), amber (processing)

## Constraints (non-negotiable)

1. Must preserve all existing routes, components, design system, i18n structure
2. Do NOT modify `src/lib/minimind/**` or `src/data/minimind/**`
3. Do NOT create fake ML logic or add training code
4. Do NOT modify the inference engine or registry files
5. Data displayed must come from existing InferenceEngine APIs only

## Files to Create

1. `src/app/ai-lab/inference/page.tsx`
2. `src/components/minimind/inference/InferencePageClient.tsx`
3. `src/components/minimind/inference/InferenceVisualizer.tsx`
4. `src/components/minimind/inference/TokenStream.tsx`
5. `src/components/minimind/inference/GenerationTracePanel.tsx`
6. `src/components/minimind/inference/InferenceStageCard.tsx`
7. `src/components/minimind/inference/index.ts`

## Files to Modify

1. `src/components/ai-lab/nav-config.ts` — add inference nav item + icon + dock route
2. `src/lib/i18n/locales/en.json` — add `aiLab.nav.inference`
3. `src/lib/i18n/locales/zh-CN.json` — add `aiLab.nav.inference`

## Model Factory

The inference engine requires a `MiniMindModel` instance. We import the model factory from `@/lib/minimind/model` (same pattern as ForwardPlayground). The model is created once via `useRef` and never recreated.

## Error Handling

- Engine creation failure: show error card with retry button
- Generation error: show error in the token stream area
- Empty prompt: disable Generate button
- Model not available: show degraded status

## Build Verification

Run `npm run build` — expected 0 errors, 0 warnings.
