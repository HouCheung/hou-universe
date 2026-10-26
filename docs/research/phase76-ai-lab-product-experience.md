# Phase 76 — AI Lab Product Experience

## 1. Product Vision

MiniMind is a real, in-browser AI model — training, inference, tokenization, and evaluation
all run against genuine Web Workers on the user's machine. The AI Lab (`/ai-lab`) is its
front door.

Phase 76 states a single product principle and enforces it everywhere:

> **Chat is the PRODUCT FRONT DOOR. Research is the PROOF OF THE ENGINE.**

Before Phase 76, `/ai-lab` read as a general-purpose dashboard: a grid of feature cards,
a generic welcome message, and a model status badge that could only say "baseline" or
"trained". Phase 76 re-centers the experience so a visitor understands in the first five
seconds that (a) this is MiniMind, (b) the thing in front of them is a real model, and (c)
the model is either untrained (and will produce nonsense) or trained (and will produce
real inference) — and the path to a trained model runs through the real Training Lab.

Nothing in Phase 76 fabricates capability. Every state shown is derived from real engine
state (checkpoints, active training runs, generation status).

## 2. Page Hierarchy

```
/ai-lab                       — Product front door: MiniMindChatShell
├── /ai-lab/lab/              — Research hub (the "engine room")
│   ├── /ai-lab/lab/training       — Real training (checkpoints, runs)
│   ├── /ai-lab/lab/generation     — Real generation (single-shot)
│   ├── /ai-lab/lab/experiments    — Experiment workspace
│   ├── /ai-lab/lab/evaluation     — Benchmark / evaluation results
│   ├── /ai-lab/lab/research       — ResearchWorkspace (session/checkpoint/metrics)
│   └── /ai-lab/lab/architecture   — Model & pipeline architecture
```

The chat surface is the root page. Research is reachable via the header "Research" link
and the Lab section cards, never as a competing primary nav on the chat surface.

## 3. Chat Architecture

```
MiniMindChatShell (UI state)
  ├── ChatHeader            — identity + ModelStatusBadge + "New chat" + Research link
  ├── WelcomeEmptyState     — MiniMind prompts + baseline warning + train CTA
  ├── ConversationArea      — messages (real streamed tokens)
  ├── MessageComposer       — input + send/stop
  └── LabSection            — research hub teaser + narrative

    UI → chatAdapter → generationAdapter → generationRuntime
                                            → GenerationWorker → GenerationEvaluator (real)
```

The architecture is unchanged from Phases 69–75. Phase 76 only touches the *presentation*
of model state:

- `ModelStatusBadge` is now state-driven (`baseline | trained | training | generating`),
  derived by `MiniMindChatShell` from real adapter state rather than hardcoded.
- `ChatHeader` exposes "New chat" and a Research shortcut.
- `WelcomeEmptyState` suggests MiniMind-specific prompts and, when the model is untrained,
  shows an amber baseline warning with a direct "Train a checkpoint →" CTA.

### Model Status Derivation

```
isBusy (starting | streaming | stopping)          → "generating"
trainingActive (running | paused)                  → "training"
checkpointInfo.hasCheckpoint                       → "trained"
otherwise                                          → "baseline"
```

The derivation lives in `MiniMindChatShell`, which owns it and passes the resolved
`ModelStatus` (plus an optional checkpoint name) down to `ChatHeader`.

## 4. Research Section Architecture

The Research hub (`LabSection`) remains the live-data surface it became in Phase 73:

- Reads real data from `experimentLauncherAdapter`, `liveTrainingAdapter`,
  `generationAdapter`, `chatAdapter`, and `historyAdapter`.
- Falls back to a "Getting Started" narrative when no data exists yet.
- Six navigation entries (training, generation, experiments, evaluation, research,
  architecture) with live badges where data is available.

Phase 76 adds a single narrative line (`aiLab.chat.lab.narrative`) above the cards that
explains the *engineering story* — that this lab runs a real model end-to-end — replacing
the prior default "this is a lab" framing.

## 5. Real-Data Boundaries

Phase 76 adds **no fake data**. Concretely, it does not:

- create a second runtime, worker, experiment store, or ID generator
- add a fake model, mock responses, or hardcoded AI responses
- simulate generation with `setTimeout`
- fabricate training metrics

The only timing primitives in the chat path are legitimate UI intervals (the Lab section's
30-second refresh of live status), and there is no `Math.random()` in the chat path.

`ResearchExperimentStore`, `TrainingRuntime`, and `GenerationRuntime` remain canonical.
`src/lib/minimind/core`, `model`, `training`, and `tokenizer` were not modified — the
audit found no blocking defect in them.

## 6. State Ownership

| State | Owner |
|-------|-------|
| Conversation messages / history | `ChatHistoryStore` (localStorage) |
| Active generation status | `MiniMindChatShell` (per-message `ChatGenerationStatus`) |
| Model status (`baseline/trained/training/generating`) | `MiniMindChatShell` (derived) |
| Training run state | `TrainingRuntime` / `liveTrainingAdapter` |
| Experiment / research state | `ResearchWorkspace` singleton |
| Checkpoint presence | `checkpointAdapter` / `checkpointInfo` |

The UI never mutates engine state directly; it reads through adapters and derives
display-only values.

## 7. Responsive Strategy

- The chat layout is fixed-height (`h-[calc(100dvh-4rem)]`) so the composer and message
  list behave like a native chat product, while the page root still allows scroll for the
  Lab section below.
- Header controls collapse to icon-only on mobile ("New chat" label hidden below `sm`).
- Lab cards flow `grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-3`.
- Stats chips flow `grid-cols-2 → sm:grid-cols-4`.

## 8. Accessibility

- All interactive controls are real `<button>` / `<Link>` elements with hover and
  focus-visible states.
- Status is conveyed through text labels (`ModelStatusBadge` always renders a visible
  label), with color/pulse as a secondary channel — not the sole channel.
- Decorative dividers and pulse dots are `aria-hidden`.

## 9. Verification Results

| Suite | Result |
|-------|--------|
| `core` (`run.ts`) | 3,216,606 passed, 0 failed |
| `data` (`run.ts`) | 223 passed, 0 failed |
| `training` (`run.ts`) | 4,265,519 passed, 0 failed |
| `research` (`run.ts`) | 620 passed, 0 failed |
| Phase 76 i18n parity (`phase76-product.test.ts`) | 18 passed, 0 failed |
| `npm run build` | clean — 0 errors, 0 warnings |

The Phase 76 i18n test asserts `aiLab.chat` namespace parity between `en` and `zh-CN`
(no missing keys, no empty values) and that all 13 new Phase 76 keys are present and
non-empty in both locales.

## 10. Known Limitations

1. **Training status is a mount-time snapshot in the header.** `MiniMindChatShell`
   resolves `trainingActive` once on mount and on generation transitions; it does not
   live-poll. The Lab section (below) does poll every 30s. A long-running training job
   started in another tab will not flip the header badge until a remount.

2. **Architecture page shows the forward pass, not the full training flow diagram.** The
   `/ai-lab/lab/architecture` page visualizes model structure and forward pass; the
   training-loop internals are described textually rather than as a live diagram.

3. **Model parameter count inconsistency (~200K vs ~600K).** The welcome empty state's
   `parameters` stat displays `~200K` (matching the model config: 4 layers, dModel 128,
   vocab 32K). A derived-parameter-count string appears elsewhere as `~600K`. These should
   be reconciled to a single source of truth in a follow-up.

4. **Worker-path generation tests.** Chat reliability tests that exercise the full
   `chatSend → Worker` path are `bun:test` and are not runnable in this environment (bun
   is not installed). Adapter/store logic is covered by unit tests, and real inference by
   `GenerationEvaluator` directly — consistent with Phase 72's documented limitation.
