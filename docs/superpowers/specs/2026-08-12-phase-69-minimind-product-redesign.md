# Phase 69 — MiniMind Product Experience Redesign: Architecture Audit & Design

**Date:** 2026-08-12
**Status:** Audit complete — awaiting implementation approval
**Branch:** main

---

## Executive Summary

MiniMind's backend/research architecture is mature. Real Tensor autograd, TensorMiniMindModel, BPETokenizer, AdamW, CosineScheduler, Web Worker training, GenerationRuntime, checkpoint save/load, research benchmarks, ablation studies, copilot analysis — all exist and work correctly.

The problem is **product architecture**, not ML infrastructure. The current `/ai-lab` entry point is a research dashboard (`AiLabDashboard`) that buries the model's primary capability (text generation) behind research tooling. This spec redesigns the experience around a ChatGPT-like conversational interface powered by the **real MiniMind model**, with research capabilities as the second layer.

---

## A. Current Product Hierarchy (Pre-Phase 69)

```
/ai-lab (AiLabDashboard)
│
├── DashboardHero           — "AI LAB · MINIMIND RESEARCH STUDIO" hero + CTAs
├── CurrentMission          — next recommended learning action from localStorage
├── ContinueLearning        — resume card / welcome card
├── ModuleProgressGrid      — 8 module mastery cards
├── ExplorationLinks        — 4 secondary link pills
│
├── /ai-lab/journey         — ProjectEvolution page (timeline)
├── /ai-lab/knowledge       — Knowledge graph page
├── /ai-lab/experience      — (route exists in nav-config, page may not exist)
├── /ai-lab/experiments     — Experiment workspace
├── /ai-lab/playground      — 6-module interactive playground
├── /ai-lab/inference       — Inference engine visualization
├── /ai-lab/training        — Educational training showcase
├── /ai-lab/research        — ResearchWorkspace (sessions, training, copilot, benchmarks)
│
├── FloatingNavDock         — 5 primary nav items (journey, knowledge, experience, experiments, playground)
├── BreadcrumbBar           — auto-derived breadcrumbs
└── Layout                  — cosmic background accents
```

**Root cause:** The entry point is a research dashboard. The generation capability is buried 3 levels deep under ResearchWorkspace → GenerationWorkspace.

---

## B. Proposed Product Hierarchy (Post-Phase 69)

```
AI LAB
│
├── MiniMind Chat (PRIMARY — first screen, visual center)
│   ├── ChatHeader            — MiniMind branding + model status badge
│   ├── ConversationArea      — scrollable message list
│   ├── ChatMessage           — user/assistant message bubbles
│   ├── ChatComposer          — textarea + send button
│   ├── GenerationControls    — model, checkpoint, temperature, top-K, top-P
│   ├── ChatSidebar           — conversation history list
│   └── ModelStatusBadge      — REAL MODEL · Tiny · ~600K params · Local inference
│
├── MiniMind Lab (SECONDARY — "Explore MiniMind" cards below chat)
│   ├── Model          → /ai-lab/lab/model
│   ├── Training       → /ai-lab/lab/training
│   ├── Generation     → /ai-lab/lab/generation
│   ├── Evaluation     → /ai-lab/lab/evaluation
│   ├── Experiments    → /ai-lab/lab/experiments
│   ├── Research       → /ai-lab/lab/research
│   └── Architecture   → /ai-lab/lab/architecture
│
└── (Legacy routes preserved via redirects)
    ├── /ai-lab/playground    → /ai-lab/lab/architecture
    ├── /ai-lab/journey       → /ai-lab/lab/model
    ├── /ai-lab/knowledge     → /ai-lab/lab/architecture
    ├── /ai-lab/inference     → /ai-lab/lab/generation
    ├── /ai-lab/training      → /ai-lab/lab/training
    ├── /ai-lab/research      → /ai-lab/lab/research
    └── /ai-lab/experiments   → /ai-lab/lab/experiments
```

---

## C. Route Architecture

| Route | Component | Type | Purpose |
|---|---|---|---|
| `/ai-lab` | `AiLabChatPage` | Server → Client | Chat + Lab cards below |
| `/ai-lab/lab/model` | `ModelLabPage` | Server → Client | Model architecture explorer |
| `/ai-lab/lab/training` | `TrainingLabPage` | Server → Client | Training pipeline (reuse existing) |
| `/ai-lab/lab/generation` | `GenerationLabPage` | Server → Client | Generation analysis (reuse existing) |
| `/ai-lab/lab/evaluation` | `EvaluationLabPage` | Server → Client | Evaluation & benchmarks |
| `/ai-lab/lab/experiments` | `ExperimentsLabPage` | Server → Client | Experiment workspace |
| `/ai-lab/lab/research` | `ResearchLabPage` | Server → Client | Research studio |
| `/ai-lab/lab/architecture` | `ArchitectureLabPage` | Server → Client | Forward model / playground |

Legacy redirects via Next.js `redirects()`:

```
/ai-lab/playground    → /ai-lab/lab/architecture  (301)
/ai-lab/journey       → /ai-lab/lab/model         (301)
/ai-lab/knowledge     → /ai-lab/lab/architecture   (301)
/ai-lab/inference     → /ai-lab/lab/generation     (301)
/ai-lab/training      → /ai-lab/lab/training       (301)
/ai-lab/research      → /ai-lab/lab/research       (301)
/ai-lab/experiments   → /ai-lab/lab/experiments    (301)
```

---

## D. Component Architecture

### New Component Tree

```
AiLabChatPage (NEW — server page, replaces current page.tsx)
└── MiniMindChatShell (NEW — client composition root)
    ├── ChatHeader (NEW)
    │   └── ModelStatusBadge (NEW)
    ├── ConversationArea (NEW)
    │   ├── ChatMessage (NEW)
    │   └── StreamingMessage (NEW — Phase 69.3)
    ├── ChatComposer (NEW)
    ├── GenerationControls (NEW)
    │   ├── ModelSelector (NEW)
    │   ├── CheckpointSelector (NEW)
    │   ├── TemperaturePresets (NEW)
    │   └── AdvancedParams (NEW)
    ├── ChatSidebar (NEW)
    │   └── ConversationListItem (NEW)
    └── LabSection (NEW)
        └── LabCard (NEW)

Lab Pages (wrap existing components):
├── ModelLabPage (NEW wrapper)
├── TrainingLabPage (reuses TrainingPageClient)
├── GenerationLabPage (reuses GenerationWorkspace)
├── EvaluationLabPage (NEW wrapper + existing copilot)
├── ExperimentsLabPage (reuses experiments page)
├── ResearchLabPage (reuses ResearchWorkspace)
└── ArchitectureLabPage (reuses MiniMindPlayground)
```

### Component Ownership by Layer

```
UI Layer (components/ai-lab/chat/*)
    ↓ calls
Adapter Layer (lib/ai-lab/adapters/chatAdapter.ts — NEW)
    ↓ calls
Runtime Layer (lib/minimind/research/GenerationRuntime.ts — EXISTING, no changes)
    ↓ spawns
Worker Layer (lib/minimind/research/worker/GenerationWorker.ts — EXISTING, no changes)
    ↓ calls
MiniMind Core (lib/minimind/model/TensorMiniMindModel.ts — EXISTING, no changes)
```

---

## E. State/Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ ChatComposer                                            │
│   user types message → onSubmit(prompt)                 │
└──────────────┬──────────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────────┐
│ MiniMindChatShell (state owner)                         │
│   messages: ChatMessage[]                               │
│   activeConversationId: string                          │
│   generationConfig: { modelId, checkpointId, temp, ... }│
│   isGenerating: boolean                                 │
│   onSend:                                               │
│     1. Add user message to messages[]                   │
│     2. Set isGenerating = true                          │
│     3. Call chatAdapter.chatGenerate(conversationId,    │
│        messages history, genConfig, signal)             │
│     4. Append assistant message to messages[]           │
│     5. Set isGenerating = false                         │
└──────────────┬──────────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────────┐
│ chatAdapter.ts (NEW — adapter layer)                    │
│   chatGenerate():                                       │
│     1. Format conversation history as context prefix    │
│     2. Build full prompt from history + new message     │
│     3. Call generationAdapter.generateFromSession(      │
│          sessionId, fullPrompt, params, signal)         │
│        ↓ (delegates to generationRuntime.generate())    │
│     4. Transform GenerationResult → ChatAssistantMessage│
│     5. Save to ChatHistoryStore (NEW, localStorage)     │
│   returns ChatAssistantMessage                          │
└──────────────┬──────────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────────┐
│ GenerationRuntime (EXISTING — no changes)               │
│   generate() → spawns Web Worker → returns              │
│   GenerationResult                                      │
└──────────────┬──────────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────────┐
│ GenerationWorker (EXISTING — no changes)                │
│   Builds BPETokenizer + TensorMiniMindModel +           │
│   loads checkpoint → GenerationEvaluator.evaluate()     │
└──────────────┬──────────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────────┐
│ GenerationEvaluator (EXISTING)                          │
│   Autoregressive loop: model.forward() → sampleToken()  │
│   (temperature, topK, topP, seed)                       │
└─────────────────────────────────────────────────────────┘
```

---

## F. Which Existing Components Can Be Reused (Keep)

| # | Component | Location | How reused |
|---|---|---|---|
| 1 | `GenerationRuntime` | `src/lib/minimind/research/` | Core engine — called by chatAdapter |
| 2 | `GenerationWorker` | `src/lib/minimind/research/worker/` | Web Worker — no changes |
| 3 | `GenerationEvaluator` | `src/lib/minimind/evaluation/` | Sampling logic — no changes (minor enhancement for streaming in 69.3) |
| 4 | `GenerationResult` (types) | `src/lib/minimind/research/` | Complete type system — reuse all |
| 5 | `GenerationHistoryStore` | `src/lib/minimind/research/` | Wrapped by ChatHistoryStore for conversation-level abstraction |
| 6 | `ResearchWorkspace` (lib) | `src/lib/minimind/research/` | CRUD for sessions/checkpoints |
| 7 | `ResearchWorkspace` (UI) | `src/components/ai-lab/research/` | Becomes `/ai-lab/lab/research` |
| 8 | `TrainingRuntime` | `src/lib/minimind/research/` | No changes |
| 9 | `TrainingPageClient` | `src/components/minimind/training/` | Becomes `/ai-lab/lab/training` |
| 10 | `TrainingStageCard` | `src/components/minimind/training/` | Reusable presentational |
| 11 | `ForwardPlayground` | `src/components/minimind/playground/` | Becomes `/ai-lab/lab/architecture` |
| 12 | `MiniMindPlayground` | `src/components/minimind/playground/` | Becomes `/ai-lab/lab/architecture` |
| 13 | `ModelRegistry` | `src/lib/minimind/experiments/` | SSOT for model presets |
| 14 | `experiment-registry` | `src/data/minimind/` | SSOT for experiment definitions |
| 15 | `FloatingNavDock` | `src/components/ai-lab/` | Re-style for new lab nav |
| 16 | `BreadcrumbBar` | `src/components/ai-lab/` | Reuse as-is |
| 17 | `nav-config.ts` | `src/components/ai-lab/` | Extend with new lab routes |
| 18 | All 12 adapters | `src/lib/ai-lab/adapters/` | Keep — they serve the lab pages |
| 19 | `generationAdapter.ts` | `src/lib/ai-lab/adapters/` | Extend, don't replace |
| 20 | `TensorMiniMindModel` | `src/lib/minimind/model/` | Core — no changes |
| 21 | `BPETokenizer` | `src/lib/minimind/tokenizer/` | Core — no changes |
| 22 | All i18n keys | `src/lib/i18n/locales/` | Extend with chat keys |
| 23 | All visual system | `src/app/globals.css` | CSS vars, glass classes, brand tokens |

---

## G. Which Components Should Be Replaced

| Old Component | New Component | Reason |
|---|---|---|
| `AiLabDashboard` | `MiniMindChatShell` | Dashboard becomes chat-first |
| `DashboardHero` | `ChatHeader` + `ModelStatusBadge` | Hero becomes compact chat header |
| `CurrentMission` | (removed) | Chat is the primary action |
| `ContinueLearning` | `ChatSidebar` (conversation history) | History replaces resume card |
| `ModuleProgressGrid` | `LabSection` with `LabCard[]` | Module grid → curated lab navigation |
| `ExplorationLinks` | Integrated into `LabSection` | Secondary links → lab cards |
| `GenerationShowcase` | Chat generation results | Generation visible in-chat |

---

## H. Which Components Should Be Deprecated

| Component | Fate |
|---|---|
| `DashboardHero` | Remove from main page (may keep for lab landing) |
| `CurrentMission` | Remove entirely — no mission concept in chat-first UX |
| `ContinueLearning` | Remove entirely — conversation history replaces |
| `ModuleProgressGrid` | Remove from main page |
| `ExplorationLinks` | Remove entirely — integrated into lab cards |

---

## I. How Chat Connects to Real GenerationRuntime

### Existing call chain (verified working):

```
generationAdapter.generateFromSession(sessionId, prompt, options, signal)
  → generationRuntime.generate({ sessionId, prompt, params, modelConfig, ... })
    → spawns GenerationWorker (Web Worker)
      → builds BPETokenizer + TensorMiniMindModel + loads checkpoint (if not baseline)
        → GenerationEvaluator.evaluate([prompt], {maxTokens, temperature, topK, topP})
          → autoregressive loop: model.forward() → sampleToken() → repeat
          → returns GenerationEvalResult
      → posts "completed" event with GenerationResult
    → saves to GenerationHistoryStore
  → returns GenerationResult
```

### Chat adapter (new) responsibilities:

1. Take conversation history (array of prior messages)
2. Format as context: `"User: {msg1}\nAssistant: {msg2}\nUser: {new message}\nAssistant:"`
3. Truncate to fit within `maxSeqLen` (256 tokens for Tiny model)
4. Call existing `generationRuntime.generate()` with formatted prompt
5. Wrap `GenerationResult` as `ChatAssistantMessage`
6. Save to `ChatHistoryStore`

### No changes to: GenerationRuntime, GenerationWorker, GenerationEvaluator, TensorMiniMindModel.

### Streaming (Phase 69.3 enhancement):

Current architecture: synchronous generation → single "completed" event.
To add streaming:
1. Add `onToken?: (token: string) => void` to `GenerationEvalOptions`
2. In `evaluateSingle()`, invoke `onToken()` after each `sampleToken()` call
3. Worker posts `"token"` events between `"started"` and `"completed"`
4. `GenerationRuntime` relays to `onProgress` callback
5. Chat UI appends tokens to StreamingMessage in real time

---

## J. How Checkpoint Selection Works

Data already available via `getGeneratableSessions()` in `generationAdapter.ts`:
- Returns `GenerationCheckpointInfo[]` with: `hasCheckpoint`, `checkpointId`, `sessionId`, `sessionName`, `isCompleted`, `finalLoss`, `finalPerplexity`, `checkpointCount`

UI component (`CheckpointSelector`):
- Default: "Latest trained checkpoint" (auto-detected)
- Options: list of sessions with checkpoints, showing name + finalLoss
- "Baseline (untrained)" — for comparison
- "Random init (no training)" — no checkpoint loaded

Zero new data sources. ResearchWorkspace already stores checkpoints in localStorage.

---

## K. How Conversation History Works

### New: ChatHistoryStore

```typescript
interface ChatConversation {
  id: string;
  title: string;                    // auto-generated from first message
  messages: ChatMessage[];
  modelConfig: GenerationModelConfig;
  checkpointId?: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  generationRequestId?: string;    // links to GenerationHistoryEntry
  timestamp: number;
}
```

**Storage:** localStorage key `"minimind-chat-conversations"` — separate from generation history.
**Limits:** 20 conversations, max 100 messages per conversation, text truncated at 2000 chars per message.
**Integration:** Each assistant message stores `generationRequestId` linking to `GenerationHistoryEntry` for detailed metrics.
**No changes to GenerationHistoryStore** — ChatHistoryStore is a higher-level abstraction.

---

## L. How Generation Parameters Work

Existing defaults (from GenerationEvaluator):
- `maxTokens: 30` → Increase to **128** for chat
- `temperature: 0.8` → Keep default
- `topK: 40` → Keep default
- `topP: 0.9` → Keep default
- `seed: undefined` → Keep (non-deterministic)

Chat presets:
- **Precise** — temperature 0.2, topK 20
- **Balanced** — temperature 0.8, topK 40 (default)
- **Creative** — temperature 1.2, topK 80

UI: Compact horizontal bar below composer, collapsible.

```
[Model: Tiny ▼]  [Checkpoint: latest ▼]  [⏺ Precise | ● Balanced | 🎲 Creative]  [⋮ Advanced]
```

---

## M. Lab Section Presentation Below Chat

Four to six glass cards with icon, title, one-line description, subtle hover effect.

```
┌──────────────────────────────────────────────────────────────┐
│                      Explore MiniMind                         │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Model   │  │ Training │  │Generation│  │ Research │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐                                  │
│  │Evalua-   │  │  Archi-  │                                  │
│  │ tion     │  │  tecture │                                  │
│  └──────────┘  └──────────┘                                  │
└──────────────────────────────────────────────────────────────┘
```

Links to `/ai-lab/lab/*` routes.

---

## N. Visual System Preservation

**Existing identity (preserved):**
- Brand: Deep blue (`--brand-rgb: 37, 99, 235` dark / `30, 64, 175` light)
- Surfaces: Glass (`border-white/[0.06]`, `backdrop-blur-sm`, `bg-background/60`)
- Background: Cosmic radial gradients
- Typography: `font-mono` for labels, JetBrains Mono, system-ui
- Motion: Framer Motion spring animations
- Backdrop noise texture overlay (4% opacity)

**Chat-specific direction:**
- Chat is the visual center — no hero section pushing it down
- Compact header: "MiniMind" + model badge (30px tall)
- Message bubbles: subtle glass surfaces, not solid colors
- User messages: slightly more opaque glass
- Assistant messages: subtle left-border brand accent
- Composer: glass input with rounded corners, pinned to bottom
- Controls: minimal, collapsible, below composer
- Lab cards: understated, below clear divider, matching existing glass-card style

---

## Implementation Plan

### 1. Recommended Route Tree

```
/ai-lab                         → AiLabChatPage (chat + lab cards)
/ai-lab/lab/model               → ModelLabPage
/ai-lab/lab/training            → TrainingLabPage
/ai-lab/lab/generation          → GenerationLabPage
/ai-lab/lab/evaluation          → EvaluationLabPage
/ai-lab/lab/experiments         → ExperimentsLabPage
/ai-lab/lab/research            → ResearchLabPage
/ai-lab/lab/architecture        → ArchitectureLabPage
```

### 2. Component Tree

```
MiniMindChatShell/
├── ChatHeader.tsx                      (NEW)
├── ModelStatusBadge.tsx                (NEW)
├── ConversationArea.tsx                (NEW)
│   ├── ChatMessage.tsx                 (NEW)
│   └── StreamingMessage.tsx            (NEW — 69.3)
├── ChatComposer.tsx                    (NEW)
├── GenerationControls.tsx              (NEW)
│   ├── ModelSelector.tsx               (NEW)
│   ├── CheckpointSelector.tsx          (NEW)
│   ├── TemperaturePresets.tsx          (NEW)
│   └── AdvancedParams.tsx              (NEW)
├── ChatSidebar.tsx                     (NEW)
│   └── ConversationListItem.tsx        (NEW)
└── LabSection.tsx                      (NEW)
    └── LabCard.tsx                     (NEW)

Data layer:
├── chatAdapter.ts                      (NEW — adapter)
└── ChatHistoryStore.ts                 (NEW — localStorage)

Lab pages (wrapping existing components):
├── ModelLabPage.tsx                    (NEW wrapper)
├── TrainingLabPage.tsx                 (reuses TrainingPageClient)
├── GenerationLabPage.tsx               (reuses GenerationWorkspace)
├── EvaluationLabPage.tsx               (NEW wrapper)
├── ExperimentsLabPage.tsx              (reuses experiments page)
├── ResearchLabPage.tsx                 (reuses ResearchWorkspace)
└── ArchitectureLabPage.tsx             (reuses MiniMindPlayground)
```

### 3. Data Flow Diagram

```
User types message
    ↓
ChatComposer.onSubmit(prompt)
    ↓
MiniMindChatShell.handleSend(prompt)
    ├── Append user ChatMessage to messages[]
    ├── Set isGenerating = true
    └── Call chatAdapter.chatGenerate(conversationId, messages, genConfig)
            ↓
        chatAdapter.ts
            ├── Format conversation history → full prompt
            ├── Truncate to maxSeqLen context window
            ├── Call generationAdapter.generateFromSession(...)
            │       ↓
            │   generationRuntime.generate()
            │       ↓ (Web Worker)
            │   GenerationWorker → GenerationEvaluator → model.forward()
            │       ↓
            │   GenerationResult
            ├── Transform to ChatAssistantMessage
            ├── Save to ChatHistoryStore (localStorage)
            └── Return ChatAssistantMessage
    ├── Append assistant ChatMessage to messages[]
    └── Set isGenerating = false
```

### 4. Runtime Integration Plan

- **69.2** (Chat shell): Call real `generationRuntime.generate()` from day one. If no checkpoint exists, use `isBaseline: true` for untrained model.
- **69.3** (Streaming): Add `onToken` callback to `GenerationEvaluator.evaluateSingle()`. Worker posts `"token"` events. Chat renders streaming tokens.
- **No new generation engine. No new model registry. No new ID generator. No new experiment store.**

### 5. Migration Plan from Current AiLabDashboard

1. Create new `/ai-lab/page.tsx` rendering `MiniMindChatShell` + `LabSection`
2. Move existing dashboard components to lab sub-pages (or remove)
3. Add Next.js redirects from old routes to new lab routes
4. Update `nav-config.ts` with new lab navigation items
5. Update `FloatingNavDock` for new lab nav structure
6. Extend i18n with chat namespace keys
7. Keep all adapter files, runtime files, core files

### 6. Components to Keep (23)

GenerationRuntime, GenerationWorker, GenerationEvaluator, GenerationResult (types), GenerationHistoryStore, ResearchWorkspace (lib + UI), TrainingRuntime, TrainingPageClient, TrainingStageCard, ForwardPlayground, MiniMindPlayground, ModelRegistry, experiment-registry, FloatingNavDock, BreadcrumbBar, nav-config.ts, all 12 adapters, generationAdapter.ts, TensorMiniMindModel, BPETokenizer, all i18n keys, all visual system.

### 7. Components to Replace (7)

AiLabDashboard → MiniMindChatShell, DashboardHero → ChatHeader + ModelStatusBadge, CurrentMission → (removed), ContinueLearning → ChatSidebar, ModuleProgressGrid → LabSection, ExplorationLinks → (integrated into LabSection), GenerationShowcase → Chat generation results.

### 8. Components to Deprecate (5)

DashboardHero, CurrentMission, ContinueLearning, ModuleProgressGrid, ExplorationLinks.

### 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| No streaming — synchronous generation means latency without feedback | Medium | 69.3 adds `onToken` callback. Until then: loading indicator with elapsed time. |
| Tiny model quality — ~600K params cannot produce coherent multi-turn conversation | Low | Feature, not bug. UI transparent: "REAL MODEL · Tiny · ~600K params · Local inference" |
| Checkpoint dependency — chat requires trained checkpoint for non-baseline generation | Medium | Fall back to baseline (untrained) generation. Show clear status. |
| localStorage limits — conversations + checkpoints may exceed 5MB | Low | Same trim strategy as GenerationHistoryStore. |
| Route churn — moving 6 routes to `/ai-lab/lab/*` may break bookmarks | Low | Next.js redirects (301) handle this transparently. |
| Mobile chat UX — compose/scroll handling on small screens | Medium | 69.9 dedicated phase. Sticky compose bar. |
| Context window — `maxSeqLen: 256` limits multi-turn conversations | High | chatAdapter truncates history to fit. Show context window indicator. |

### 10. Exact Phase 69 Implementation Order

| Sub-Phase | Tasks | New Files | Modified Files |
|---|---|---|---|
| **69.1** Product architecture audit | This document | 1 (this spec) | — |
| **69.2** Chat shell + visual system | MiniMindChatShell, ChatHeader, ModelStatusBadge, ConversationArea, ChatMessage, ChatComposer, ChatSidebar, LabSection, LabCard, new `/ai-lab/page.tsx` | 12 | 1 (page.tsx) |
| **69.3** Real GenerationRuntime integration | chatAdapter.ts, wire to existing generationRuntime.generate(), prompt formatting with conversation history, context window truncation | 1 | 1 (generationAdapter.ts extension) |
| **69.4** Conversation persistence | ChatHistoryStore.ts, conversation CRUD, localStorage | 1 | — |
| **69.5** Checkpoint/model selector | ModelSelector, CheckpointSelector, integrate with ModelRegistry + getGeneratableSessions() | 2 | — |
| **69.6** Generation controls | TemperaturePresets, AdvancedParams, GenerationControls bar | 3 | — |
| **69.7** Lab navigation redesign | Update nav-config.ts, FloatingNavDock, new lab routes, Next.js redirects | 7 page wrappers | 3 (nav-config, FloatingNavDock, layout) |
| **69.8** Lab section content | Wire existing components into lab pages | — | 7 page wrappers |
| **69.9** Mobile + accessibility | Responsive chat, mobile composer, keyboard nav, screen reader, reduced motion | — | Polish pass across all new files |
| **69.10** Final UX polish | Animation refinement, loading/empty/error states, transitions | — | All new files |

---

## Architectural Constraints (Non-Negotiable)

1. **Preserve**: UI → Adapter → Runtime → Worker → MiniMind core. Never: UI → MiniMind internals.
2. **No new generation engine.** GenerationRuntime + GenerationWorker + GenerationEvaluator are the one and only generation path.
3. **No new model registry.** ModelRegistry (`src/lib/minimind/experiments/ModelRegistry.ts`) is the one and only model config source.
4. **No new experiment store.** ResearchExperimentStore is the one and only experiment persistence.
5. **No new ID generator.** Use existing `generateRequestId()`, `generateComparisonId()`, `generateHistoryEntryId()`.
6. **No changes to `src/lib/minimind/core/*` or `src/lib/minimind/model/*`** unless audit proves a real inference limitation.
7. **No fake AI responses.** Every response comes from `GenerationRuntime.generate()` → real model inference.
8. **No `Math.random()` for model output, metrics, loading simulation, or training simulation.**
9. **No business logic in React components.** All generation logic in adapters/runtime.
10. **No duplicate runtime logic.**

---

## Visual Direction

- Premium, minimal, futuristic, dark cosmic
- Glass surfaces with subtle gradients
- Restrained motion (Framer Motion spring)
- Strong typography (JetBrains Mono + system-ui)
- Excellent spacing
- Mobile-first where practical
- Chat is the visual center — not a hero section
- "An AI model laboratory that happens to have a beautiful conversational interface"

---

*Generated by Phase 69.1 architecture audit. All findings verified against actual repository code.*
