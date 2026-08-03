# Phase 24-B: AI Lab Dashboard Evolution — Design Spec

> **Status:** Approved
> **Predecessor:** Phase 24-A (Navigation Foundation)
> **Scope:** Transform `/ai-lab` from static showcase into central dashboard hub

---

## 1. Problem Statement

The current `/ai-lab` page ([AiLabClient.tsx](../../src/components/ai-lab/AiLabClient.tsx)) is a flat vertical stack of 11 sections. It functions as a landing page, not a dashboard. Users must scroll through:
- Static CTA cards that each take ~200px of vertical space for a single link
- Redundant progress stats (data/roadmap.ts) when richer intelligence exists (learning-registry.ts)
- No "resume learning" path despite localStorage tracking full UserProgress
- Scattered sub-page links (JourneySection, KnowledgeMap, ForwardPlaygroundSection) instead of a unified navigation hub

All the intelligence already exists. The dashboard just doesn't compose it.

---

## 2. Design Principles

1. **Composition-only.** Zero new business logic. All data comes from existing SSOT registries.
2. **No duplicated metadata.** If a registry exports it, use it directly — never copy.
3. **Preserve existing files.** Old components are kept; the new dashboard imports what it reuses.
4. **Match visual DNA.** Glass morphism, cosmic background, SectionHeader, identical Framer Motion variants.
5. **Single page.tsx change.** The only modified file is `src/app/ai-lab/page.tsx`.

---

## 3. Component Architecture

### 3.1 New file tree

```
src/components/ai-lab/dashboard/          ← NEW directory
├── AiLabDashboard.tsx                     ← Composition root
├── DashboardHero.tsx                      ← Enhanced hero with live stats
├── CurrentMission.tsx                     ← Learning-registry derived mission
├── ContinueLearning.tsx                   ← localStorage resume card
└── ExplorationLinks.tsx                   ← 6-card responsive navigation grid
```

### 3.2 Component specifications

#### AiLabDashboard.tsx — Composition Root

```
"use client"

Imports:
  DashboardHero
  CurrentMission
  ContinueLearning
  ModuleProgressGrid (from ../ModuleProgressGrid)
  ExplorationLinks

Renders:
  <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
    <DashboardHero />
    <CurrentMission />
    <ContinueLearning />
    <ModuleProgressGrid />
    <ExplorationLinks />
  </div>

Note: Much shorter than AiLabClient (5 sections vs 11). Intentional — the
dashboard is an overview hub, not a complete content dump.
```

#### DashboardHero.tsx — Enhanced Hero

```
"use client"

Data sources:
  - MINIMIND_MODULES (module-registry) → module count, implemented count, phases
  - LEARNING_PATHS (learning-registry) → current critical-path phase label
  - localStorage("minimind-learning-progress") → overall completion %

States:
  - Normal: glass card with heading, intro, mission statement, live stat row
  - No localStorage yet: stats show 0/8 modules, 0%, "Foundation" phase

Visual pattern:
  - Clone MissionBanner's exact glass card structure:
    rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm
  - Glow accent line at top
  - Rocket icon + subhead pill (from MissionBanner)
  - Heading + intro text (from MissionBanner)
  - NEW: 3-stat row below the mission statement:
    [Modules: 6/8] [Phase: Foundation] [Progress: 24%]
  - Stats as small mono-labeled values in a horizontal flex row
  - Framer Motion: "visible" on mount (not whileInView) — hero is above fold

Props: none (reads data internally)
```

#### CurrentMission.tsx — Learning-Registry Derived Mission

```
"use client"

Data sources:
  - getNextNodes(progress) from learning-registry → first available node
  - getRecommendations(progress) from learning-registry → top-priority rec
  - getModuleById() from module-registry → resolve module title
  - localStorage("minimind-learning-progress") → UserProgress

Logic:
  1. Load progress from localStorage
  2. Call getNextNodes(progress) → available node IDs
  3. Take the first one that is on the critical path
  4. Call getRecommendations(progress) → pick recs[0]
  5. Resolve module title from MINIMIND_MODULES

States:
  - Has next node: show module title, description, CTA link to /ai-lab/journey?module=<id>
  - No progress yet (first visit): show "Start with Tokenizer" — first critical path node
  - All completed: show "All modules mastered! Try an experiment"

Visual pattern:
  - SectionHeader with titleKey="aiLab.dashboard.currentMission"
  - Glass card (same pattern as ProgressSection stat cards):
    rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-5 backdrop-blur-sm
  - Status dot (color-coded: in_progress=brand, available=amber)
  - Module title + description
  - CTA button/link → /ai-lab/journey?module=<id>

Props: none
```

#### ContinueLearning.tsx — localStorage Resume Card

```
"use client"

Data sources:
  - localStorage("minimind-learning-progress") → full UserProgress
  - getOverallProgress(progress) from learning-registry → stats
  - MINIMIND_MODULES → resolve last-active module title

Logic:
  1. Load progress from localStorage
  2. Find the node with status "in_progress" (or last "completed")
  3. Call getOverallProgress(progress)
  4. Derive last-updated display string from progress.lastUpdated

States:
  - Has progress: show resume card with 3 action buttons
  - No progress (first visit): render nothing (return null)
  - Empty localStorage: render nothing

Actions:
  - "Continue Journey" → /ai-lab/journey?module=<resumeModuleId>
  - "Open Knowledge Graph" → /ai-lab/knowledge
  - "Run Experiment" → /ai-lab/experiments

Visual pattern:
  - SectionHeader with titleKey="aiLab.dashboard.continueLearning"
  - Glass card with:
    - Left: resume info (module name, progress %, last updated)
    - Right: 3 action buttons (pill-shaped, icon+label)
  - Framer Motion: whileInView, same variants as all sections
  - Hidden (return null) when no progress exists

Props: none
```

#### ExplorationLinks.tsx — 6-Card Navigation Grid

```
"use client"

Data sources:
  - MINIMIND_MODULES → count badges per category
  - MINIMIND_EXPERIMENTS → active experiment count for badge

Static config:
  const EXPLORATION_ROUTES = [
    { key: "journey",     icon: Map,          href: "/ai-lab/journey",     color: "emerald",  badge: "modulesImplemented/modulesTotal" },
    { key: "knowledge",   icon: Brain,        href: "/ai-lab/knowledge",   color: "brand",    badge: "knowledgeNodeCount" },
    { key: "experience",  icon: Layers,       href: "/ai-lab/experience",  color: "violet",   badge: "pipelineStageCount" },
    { key: "experiments", icon: FlaskConical, href: "/ai-lab/experiments", color: "amber",    badge: "activeExperimentCount" },
    { key: "playground",  icon: Gamepad2,     href: "/ai-lab/playground",  color: "sky",      badge: "playgroundModuleCount" },
    { key: "inference",   icon: Cpu,          href: "/ai-lab/inference",   color: "rose",     badge: null },
  ]

Visual pattern:
  - SectionHeader with titleKey="aiLab.dashboard.explorationHub"
  - Responsive grid: 1 col mobile, 2 col sm, 3 col lg
  - Each card is the EXISTING CTA card pattern from JourneySection / KnowledgeMap:
    - Icon in rounded-full container with color-matched border/glow
    - Title (i18n key)
    - Description (i18n key)
    - ArrowRight that translates on hover
    - Optional badge (e.g. "6/8 modules")
  - Color per route: emerald (journey), brand (knowledge), violet (experience),
    amber (experiments), sky (playground), rose (inference)

Props: none
```

---

## 4. Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                   SSOT Registries (read-only)            │
├─────────────────────────────────────────────────────────┤
│  module-registry     → MINIMIND_MODULES (8 modules)     │
│  learning-registry   → LEARNING_PATHS, getNextNodes(),  │
│                        getOverallProgress(),             │
│                        getRecommendations()              │
│  experiment-registry → MINIMIND_EXPERIMENTS (4 active)  │
│  knowledge-registry  → KNOWLEDGE_GRAPH                  │
└──────────────────────┬──────────────────────────────────┘
                       │ imports (zero new metadata)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Dashboard Components                        │
│                                                         │
│  DashboardHero                                          │
│    ← MINIMIND_MODULES (count, phase distribution)       │
│    ← LEARNING_PATHS (critical path phase label)         │
│    ← localStorage → getOverallProgress() → percent%     │
│                                                         │
│  CurrentMission                                         │
│    ← localStorage → UserProgress                        │
│    ← getNextNodes(progress) → first critical-path node  │
│    ← getRecommendations(progress)[0] → top priority     │
│    ← MINIMIND_MODULES → resolve title/description       │
│                                                         │
│  ContinueLearning                                       │
│    ← localStorage → UserProgress                        │
│    ← getOverallProgress(progress) → stats               │
│    ← MINIMIND_MODULES → resolve last module title       │
│    Hidden (null) when no progress exists                │
│                                                         │
│  ModuleProgressGrid (EXISTING, imported, not modified)  │
│    ← MINIMIND_MODULES                                   │
│    ← localStorage → nodeStatus                          │
│                                                         │
│  ExplorationLinks                                       │
│    ← Static route config (no registry dependency)       │
│    ← MINIMIND_MODULES → count badges                    │
│    ← MINIMIND_EXPERIMENTS → active experiment count     │
└─────────────────────────────────────────────────────────┘
```

**localStorage access pattern:** Each component that reads localStorage uses the same guard:
```typescript
const [progress, setProgress] = useState<UserProgress | null>(null);
useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (raw) setProgress(JSON.parse(raw));
  } catch { /* empty */ }
}, []);
```

This avoids SSR mismatches and follows the pattern already established in ModuleProgressGrid.tsx.

---

## 5. i18n Keys Required

New keys under `aiLab.dashboard.*` in both `en.json` and `zh-CN.json`:

```json
"dashboard": {
  "currentMission": "Current Mission",
  "continueLearning": "Continue Learning",
  "explorationHub": "Exploration Hub",
  "resumeJourney": "Continue Journey",
  "openKnowledgeGraph": "Open Knowledge Graph",
  "runExperiment": "Run Experiment",
  "lastActive": "Last active",
  "noProgressYet": "Start with Tokenizer — the foundation of all language models.",
  "allMastered": "All modules mastered! Try an experiment to deepen your understanding.",
  "modulesStat": "modules",
  "phaseStat": "phase",
  "progressStat": "complete"
}
```

Chinese translations provided at implementation time.

---

## 6. Visual Patterns (from existing DNA)

Every new component follows these exact patterns already established in the codebase:

| Element | Pattern |
|---|---|
| Section wrapper | `<motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={variants} className="mt-20 sm:mt-28">` |
| Animation variants | `hidden: { opacity: 0, y: 40 }` → `visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } }` |
| Section header | `<SectionHeader titleKey="aiLab.dashboard.xxx" />` |
| Glass card (static) | `rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]` |
| Glass card (hover) | `hover:border-brand/20 hover:bg-brand/[0.06] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.05)]` |
| CTA icon container | `flex size-14 items-center justify-center rounded-full border border-{color}-500/20 bg-{color}-500/[0.06]` |
| CTA hover glow | `group-hover:border-{color}-500/40 group-hover:shadow-[0_0_20px_rgba({color-rgb},0.1)]` |
| Progress bar | `h-1.5 overflow-hidden rounded-full bg-slate-200/50` with inner `motion.div` animating width |
| Status dot | `size-2 shrink-0 rounded-full bg-{status-color}` |
| Mono label | `font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500` |

---

## 7. Migration Strategy

| Step | Action | Rollback |
|---|---|---|
| 1 | Create `src/components/ai-lab/dashboard/` with all 5 new components | Delete directory |
| 2 | Add i18n keys to en.json + zh-CN.json | Revert JSON files |
| 3 | `npm run build` — verify no errors with new components present but unused | — |
| 4 | Change `page.tsx`: `AiLabClient` → `AiLabDashboard` | Revert one line |
| 5 | `npm run build` — final verification | Revert one line |

AiLabClient.tsx and all 11 existing section components are **preserved on disk**. They are not imported by the new dashboard, but remain available as reference or for future reuse.

---

## 8. Files Summary

### Modified (1 file)
| File | Change |
|---|---|
| `src/app/ai-lab/page.tsx` | `import { AiLabClient }` → `import { AiLabDashboard }` |

### Created (5 files)
| File | Purpose |
|---|---|
| `src/components/ai-lab/dashboard/AiLabDashboard.tsx` | Composition root (5 sections) |
| `src/components/ai-lab/dashboard/DashboardHero.tsx` | Hero + live stats |
| `src/components/ai-lab/dashboard/CurrentMission.tsx` | Learning-registry mission |
| `src/components/ai-lab/dashboard/ContinueLearning.tsx` | localStorage resume |
| `src/components/ai-lab/dashboard/ExplorationLinks.tsx` | 6-card nav grid |

### Untouched (preserved)
- `AiLabClient.tsx` and all 11 section components
- `FloatingNavDock.tsx`, `BreadcrumbBar.tsx`, `CrossRefButton.tsx`
- `ModuleProgressGrid.tsx` (imported, not modified)
- All `src/data/minimind/*` registries
- All `src/lib/minimind/*` logic
- `src/app/ai-lab/layout.tsx`

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| SSR localStorage access | Guard with `typeof window === "undefined"` check in useEffect — same pattern as ModuleProgressGrid |
| First-visit empty state | ContinueLearning returns null; CurrentMission falls back to "Start with Tokenizer"; DashboardHero shows 0/8 |
| learning-registry API mismatch | `getNextNodes()` and `getOverallProgress()` accept `UserProgress` — exact same shape read from localStorage |
| i18n key collisions | New keys scoped under `aiLab.dashboard.*` — no overlap with existing `aiLab.sections.*` or `aiLab.nav.*` |
| Build regression | Verify `npm run build` after each step |
| Visual inconsistency | All new components copy exact Tailwind classes from MissionBanner, ProgressSection, JourneySection |
