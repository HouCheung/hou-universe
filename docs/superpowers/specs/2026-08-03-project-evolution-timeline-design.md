# Project Evolution Timeline — Design Spec

**Date**: 2026-08-03
**Status**: approved
**Route**: `/ai-lab/journey`

## Summary

Replace the Learning Journey page (`LearningJourneyPageClient`) at `/ai-lab/journey` with a **MiniMind Project Evolution Timeline** (`ProjectEvolutionPageClient`). The new page shows the MiniMind project's module evolution — what's built, what depends on what, which experiments exist — derived entirely from `module-registry.ts` as the single source of truth.

The old `LearningJourneyPageClient.tsx` is preserved; only the route reference in `page.tsx` changes.

## Motivation

- `/ai-lab/journey` was originally a learning-progress tracker with localStorage, recommendations, mastery trees, and student-oriented UX
- The project has evolved: the real value is showing the **project's** evolution, not an individual learner's progress
- `module-registry.ts` already holds all the structured data needed (modules, status, dependencies, experiments)
- No data changes needed — just a new presentation layer

## Architecture

```
src/app/ai-lab/journey/page.tsx          ← edit: swap import + component usage
src/components/minimind/evolution/
  ProjectEvolutionPageClient.tsx          ← new: page-level component
  index.ts                                ← new: barrel export
src/components/minimind/learning/
  LearningJourneyPageClient.tsx           ← preserved, unchanged
  index.ts                                ← preserved, unchanged
```

## Data Source

`src/data/minimind/module-registry.ts` — read-only, no modifications.

| Field used | Source |
|---|---|
| Module id, title, description | `MINIMIND_MODULES[].id/title/description` |
| Status | `MINIMIND_MODULES[].status` (`"completed" \| "in-progress" \| "upcoming"`) |
| Phase | `MINIMIND_MODULES[].phase` (`"foundation" \| "training" \| "advanced"`) |
| Order | `MINIMIND_MODULES[].order` |
| Dependencies | `MINIMIND_MODULES[].metadata.dependencies[]` |
| Source path | `MINIMIND_MODULES[].sourcePath` |
| Playground link | `MINIMIND_MODULES[].metadata.playgroundPath` |
| Related experiments | `getModuleExperiments(moduleId)` → `MiniMindExperiment[]` |

## Component Design

### ProjectEvolutionPageClient

Page-level state container. No localStorage, no progress tracking.

**Data derivation** (useMemo):
```ts
// Group modules by phase, sort by order within each group
const phases = useMemo(() => {
  const grouped: Record<string, MiniMindModule[]> = {};
  for (const mod of MINIMIND_MODULES) {
    (grouped[mod.phase] ??= []).push(mod);
  }
  for (const arr of Object.values(grouped)) {
    arr.sort((a, b) => a.order - b.order);
  }
  return grouped;
}, []);
```

**Rendering**:
1. Page header (same visual style as ExperiencePageClient — glow accent, Sparkles badge, title, description)
2. Phase sections — one per phase key (foundation → training → advanced)
3. Each section: section label → responsive card grid → module cards

### Phase Sections

Phase display order: `foundation` → `training` → `advanced`.

Phase labels from i18n:
- `foundation` → `"Foundation Layer"`
- `training` → `"Training Pipeline"`
- `advanced` → `"Advanced Capabilities"`

### Module Card

Each card displays:
- **Title row**: module title + status badge (color-coded: emerald for completed, amber for in-progress, slate for upcoming)
- **Description**: one-line summary
- **Dependencies**: horizontal chip list (module names), or "No dependencies" if empty
- **Experiments**: count badge + experiment title list, or "No experiments yet"
- **Source path**: monospace text, the relative path
- **Playground link**: icon button linking to playground route

Card has hover elevation + border glow transition.

### Responsive Grid

- 1 column on mobile (< sm)
- 2 columns on tablet (md)
- 3 columns on desktop (lg+)

## i18n Keys

All new keys under `minimind.evolution.*`:

| Key | Value |
|---|---|
| `subhead` | `"MiniMind Project"` |
| `heading` | `"Project Evolution Timeline"` |
| `intro` | `"Track the evolution of MiniMind — each module builds on the last, from tokenization to inference."` |
| `phases.foundation` | `"Foundation Layer"` |
| `phases.training` | `"Training Pipeline"` |
| `phases.advanced` | `"Advanced Capabilities"` |
| `status.completed` | `"Completed"` |
| `status.in-progress` | `"In Progress"` |
| `status.upcoming` | `"Upcoming"` |
| `dependencies` | `"Dependencies"` |
| `experiments` | `"Experiments"` |
| `source` | `"Source"` |
| `playground` | `"Playground"` |
| `noExperiments` | `"No experiments yet"` |
| `noDependencies` | `"No dependencies"` |

## What's Removed (vs old LearningJourneyPageClient)

| Removed | Reason |
|---|---|
| localStorage progress (load/save) | No user-specific state |
| `learning-registry` imports (MASTERY_TREE, getLearningPath, etc.) | Replaced by module-registry |
| `RecommendationBar` | Not applicable |
| `ProgressDashboard` | Not applicable |
| Path type tabs | Not applicable |
| Node detail slide-out panel | Card info is inline |
| `knowledge-registry` imports | Not needed |

## Files Changed

| File | Action |
|---|---|
| `src/components/minimind/evolution/ProjectEvolutionPageClient.tsx` | Create |
| `src/components/minimind/evolution/index.ts` | Create |
| `src/app/ai-lab/journey/page.tsx` | Edit (import + component) |

## Files Explicitly NOT Touched

- `src/data/minimind/**` — read-only source
- `src/lib/minimind/**` — read-only source
- `src/components/minimind/learning/**` — preserved
- All `/ai-lab/journey` consumers (nav-config, dashboard, CrossRefButton, etc.) — same route, no change needed

## Acceptance Criteria

- `npm run build` passes with no errors or warnings
- `/ai-lab/journey` renders the evolution timeline with all 8 modules
- Modules are grouped by phase and ordered correctly
- No learning/mastery/progress/recommendation/student language in the new component
- Old `LearningJourneyPageClient` is unchanged and still compiles
