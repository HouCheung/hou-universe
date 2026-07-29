# MiniMind Metadata Architecture

## Single Source of Truth

`module-registry.ts` is the **only module entry point** for all MiniMind modules.
Every consumer — Roadmap, Playground, AI Lab, Knowledge Map, Timeline —
MUST derive its module data from `MINIMIND_MODULES`. Never maintain a
separate copy of module metadata.

```
module-registry.ts  ──→  Roadmap (cross-reference)
                   ──→  Playground (module cards)
                   ──→  AI Lab (section orchestrator)
                   ──→  Knowledge Map (concept graph)
                   ──→  Timeline (progress tracking)
```

## Adding a New Module

Follow this pipeline when introducing a new MiniMind module:

```
1. Update Registry
   └─ Add a new entry to MINIMIND_MODULES in module-registry.ts
      with id, title, description, status, order, phase, metadata.

2. Create Implementation
   └─ Add source code under src/lib/minimind/<module-id>/
      with canonical barrel export (index.ts).

3. Create Playground
   └─ Add playground component under src/components/minimind/playground/<module-id>/
      with interactive experiments and visualizations.

4. Create Docs
   └─ Add theory document under docs/minimind/<NN>-<module-slug>.md
      with learning objectives, concepts, and experiments.

5. Update i18n
   └─ Add display strings to src/lib/i18n/locales/en.json and zh-CN.json
      under the minimind namespace.
```

## Directory Responsibilities

| Directory | Purpose |
|---|---|
| `src/data/minimind/` | **Metadata & registries** — module definitions, version matrices, feature catalogs. Pure data, no UI or logic. |
| `src/lib/minimind/` | **Implementations** — tokenizer, embedding, attention, transformer, inference. One subdirectory per module. |
| `src/components/minimind/` | **Playground UI** — interactive visualization components. One subdirectory per module under `playground/`. |
| `docs/minimind/` | **Theory & learning** — markdown docs explaining concepts, algorithms, and experiments. Numbered in learning order. |

## Module Metadata

Each `MiniMindModule` carries a `metadata` field with enriched knowledge-layer information:

```typescript
interface MiniMindModuleMetadata {
  theoryDocPath?: string;    // Path to the theory doc
  sourcePath?: string;       // Path to the source implementation
  playgroundPath?: string;   // Route path to the playground
  concepts?: string[];       // Core concepts the module teaches
  experiments?: string[];    // Named experiments available
  dependencies?: string[];   // Module ids this module depends on
}
```

The `concepts` and `dependencies` fields together form a learnable
dependency graph — use them to derive prerequisites, knowledge maps,
and suggested learning paths without hardcoding relationships elsewhere.
