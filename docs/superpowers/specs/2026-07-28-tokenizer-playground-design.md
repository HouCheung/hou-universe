# Tokenizer Playground — Design Spec

**Date:** 2026-07-28
**Phase:** Phase 8 — Tokenizer Playground (Interactive)
**Status:** Approved

---

## 1. Overview

Upgrade `/ai-lab/playground` from a "Coming Soon" placeholder into an interactive MiniMind platform. Tokenizer is the only implemented module; Embedding, Attention, RoPE, and Transformer display as "Coming Soon" cards for future implementation.

All tokenizer data flows through `MiniTokenizer.explain()` — no logic duplication.

---

## 2. Files

### 2.1 New Files (7)

```
src/components/minimind/playground/
├── MiniMindPlayground.tsx          ← page orchestrator (header + module cards + tokenizer)
└── tokenizer/
    ├── TokenizerPlayground.tsx     ← tokenizer section orchestrator
    ├── InputPanel.tsx              ← textarea, debounced real-time input
    ├── PipelinePanel.tsx           ← dynamic pipeline stages from TokenizerPipeline
    ├── TokenList.tsx               ← clickable glass badge token cards
    ├── EncodedPanel.tsx            ← ID sequence + unknown token warning
    └── DecodedPanel.tsx            ← round-trip decode result
```

### 2.2 Modified Files (1)

```
src/app/ai-lab/playground/page.tsx ← replace SubRoutePlaceholder → MiniMindPlayground
```

### 2.3 Unchanged (per constraint)

- Homepage, Hero, Navigation, AI Lab overview, Roadmap, MissionBar
- All existing components in `src/components/ai-lab/`
- `src/lib/minimind/` — consumed as-is

---

## 3. Component Architecture

```
page.tsx (server component)
  └─ MiniMindPlayground ("use client")
       ├─ Header ("MiniMind Learning Edition" / "Tokenizer Playground" / "V1 Word Tokenizer")
       ├─ ModuleCards (Embedding, Attention, RoPE, Transformer → Coming Soon)
       └─ TokenizerPlayground
            ├─ InputPanel          (textarea → onChange → debounce 300ms → callback)
            ├─ PipelinePanel       (reads TokenizerPipeline, green=implemented, gray=planned)
            ├─ TokenList           (clickable glass badges, selectedIndex state)
            ├─ EncodedPanel        (id array + unknown tokens warning)
            └─ DecodedPanel        (decode() round-trip result)
```

---

## 4. Data Flow

```
User types in InputPanel
  │
  ▼ (debounced 300ms)
TokenizerPlayground receives text
  │
  ▼
miniTokenizer.explain(text)  ← single data source
  │
  ▼ ExplainResult
  ├── .tokens[]         → TokenList, EncodedPanel
  ├── .encoded[]        → EncodedPanel
  ├── .unknownTokens[]  → EncodedPanel (warning)
  ├── .decoded          → DecodedPanel
  └── .originalText     → (reference only)
```

### MiniTokenizer instance

- Created once via `useRef(() => new MiniTokenizer())`
- Pre-registered demo tokens: `"Hello"` (id=4), `"HOU"` (id=5)
- `"Universe"` is unknown → `<unk>` (id=1)
- Default text: `"Hello HOU Universe"`

### Token selection

- Click a token badge → `selectedIndex` state updates
- Selected token reveals detail: token string, id, exists (bool), index
- Detail panel rendered inline or as a popover below the token list

---

## 5. UI Design (HOU Universe Style — No New Design)

Every panel uses the established pattern:

| Element | Style |
|---|---|
| Card container | `rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]` |
| Section header | Vertical gradient accent line + heading (same as `SectionHeader`) |
| Glass badges | `rounded-full border border-slate-500/[0.1] bg-slate-500/[0.03] px-3 py-1 text-sm font-mono` |
| Labels | `font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500` |
| Green (implemented) | `text-emerald-400`, `border-emerald-500/20 bg-emerald-500/[0.05]` |
| Gray (planned) | `text-slate-600`, `border-slate-500/15 bg-slate-500/[0.03]` |
| Animation | Framer Motion `Variants` with `hidden/visible`, `whileInView`, stagger 80ms |
| Button | `rounded-lg border border-brand/15 bg-brand/[0.04] px-5 py-2.5 text-sm font-medium text-brand/80 hover:bg-brand/[0.08]` |

---

## 6. Module Cards (Future)

```
┌─────────────────────────────────────────────────────────┐
│  [Tokenizer]   [Embedding]   [Attention]   [RoPE]   [Transformer]  │
│   ACTIVE         Coming Soon    Coming Soon   ...        ...        │
└─────────────────────────────────────────────────────────┘
```

- Tokenizer card: active state (brand border, brand bg tint)
- Others: dashed border, muted text, `Construction` icon
- Module list defined as a static array (extensible for future)

---

## 7. Pipeline Rendering

Dynamic import from `@/lib/minimind/tokenizer`:

```ts
import { TokenizerPipeline } from "@/lib/minimind/tokenizer";
```

- Map over `TokenizerPipeline` array
- `step.implemented === true` → green badge + check icon
- `step.implemented === false` → gray badge + clock/dash icon
- Show `step.title`, `step.description`, `step.futureVersion` (if planned)

---

## 8. Token Detail (on click)

When a user clicks a token badge:

```
┌──────────────────────┐
│ Token: "Hello"       │
│ ID:    4             │
│ Exists: true         │
│ Index: 0             │
└──────────────────────┘
```

For unknown tokens:

```
┌──────────────────────┐
│ Token: "<unk>"       │
│ ID:    1             │
│ Exists: false        │
│ Index: 2             │
│ Original: "Universe" │
└──────────────────────┘
```

---

## 9. Implementation Constraints

1. Only `MiniTokenizer.explain()` as data source — no duplicate logic
2. Pipeline rendered dynamically from `TokenizerPipeline` — no hardcoded stages
3. No button required — real-time with 300ms debounce
4. All styles from existing HOU Universe design system
5. Do NOT modify: Homepage, Hero, Nav, AI Lab overview, Roadmap, MissionBar
6. Components in `src/components/minimind/playground/` — reusable outside AI Lab

---

## 10. Verification

- `npm run build` — zero errors, zero warnings
- `npm run lint` — zero errors, zero warnings
- TypeScript strict mode — zero errors
- All existing pages render unchanged
- Playground renders interactive tokenizer with live updates
