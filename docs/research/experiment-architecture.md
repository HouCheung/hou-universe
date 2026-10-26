# Experiment Architecture — Canonical Source of Truth

**Date:** 2026-08-12
**Phase:** 68 — Experiment System Convergence
**Status:** Implemented

## Overview

MiniMind's experiment system has been converged to a single canonical source of truth. The legacy dual-store architecture (legacy `ExperimentStore` + canonical `ResearchExperimentStore`) has been unified into one persistent data model.

## Architecture

```
                        ResearchExperimentStore
                           (CANONICAL — single source of truth)
                           localStorage keys:
                             "minimind-research-experiments"
                             "minimind-research-runs"
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
             ResearchExperiment           ResearchRun[]
                    │                         │
                    │  id ←── experimentId ───┤
                    │                         │
                    └──────────┬──────────────┘
                               ▼
                      ResearchWorkspace
                               │
                               ▼
                         ResearchSession
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
               Checkpoint            Generation
```

## Canonical Source of Truth

**One store:** `ResearchExperimentStore`

| Persistence Key | Entity | Schema Version |
|---|---|---|
| `minimind-research-experiments` | `ResearchExperiment[]` | v1 |
| `minimind-research-runs` | `ResearchRun[]` | v1 |

**No other persistence keys are authoritative for experiment data.**

## Entity Ownership

### ResearchExperiment
> What is being studied?

```typescript
interface ResearchExperiment {
  id: string;                    // Unique experiment identifier
  name: string;                  // Human-readable name
  description: string;           // Longer description
  hypothesis: string;            // Research hypothesis
  createdAt: number;             // Unix timestamp (ms)
  updatedAt: number;             // Last update timestamp
  seed: number;                  // Random seed for reproducibility
  modelConfig: ModelConfigEntry; // Model architecture
  trainingConfig: TrainingRecipe;// Training hyperparameters
  datasetConfig: DatasetConfig;  // Dataset configuration
  tokenizerConfig: TokenizerConfig; // Tokenizer configuration
  evaluationConfig: EvaluationConfig; // Evaluation configuration
  tags: string[];                // Organization/filtering
  baselineExperimentId?: string; // For ablation studies
  status: ResearchExperimentStatus; // draft|ready|running|completed|archived
}
```

### ResearchRun
> What actually happened?

```typescript
interface ResearchRun {
  runId: string;              // Unique run identifier
  experimentId: string;       // FK → ResearchExperiment.id
  startedAt: number;          // When run started
  completedAt: number;        // When run completed (0 if not)
  status: ResearchRunStatus;  // pending|running|completed|failed|cancelled
  seed: number;               // Run-specific seed
  // Training metrics
  initialLoss: number;
  finalLoss: number;
  bestLoss: number;
  perplexity: number;
  tokensPerSecond: number;
  totalTokens: number;
  totalSteps: number;
  totalEpochs: number;
  durationMs: number;
  // References
  checkpointId?: string;      // Saved checkpoint
  generationBefore: RunGenerationResult[];
  generationAfter: RunGenerationResult[];
  analysis: RunAnalysis | null;
  reproducibility: RunReproducibility | null;
  reportId?: string;
  errorMessage?: string;
}
```

### ResearchSession
> What is the UI currently controlling?

```typescript
interface ResearchSession {
  id: string;
  experimentId?: string;     // FK → ResearchExperiment.id
  runId?: string;            // FK → ResearchRun.runId
  name: string;
  status: ResearchStatus;    // created|configured|queued|running|paused|...
  // ... config, metrics, checkpoints, timeline
}
```

### ResearchCheckpoint
> What exact model state can be restored?

```typescript
interface ResearchCheckpoint {
  id: string;
  step: number;
  loss: number;
  epoch: number;
  timestamp: number;
  checkpointDataJSON?: string; // Full serialized checkpoint
}
```

## Compatibility Layer

### LegacyExperimentAdapter

The legacy `ExperimentStore` API is preserved through `LegacyExperimentAdapter`, which routes all calls to `ResearchExperimentStore`:

```
Legacy API Consumer
       │
       ▼
LegacyExperimentAdapter  ← field mapping, status mapping, API compatibility
       │
       ▼
ResearchExperimentStore  ← canonical persistence
```

**What the adapter does:**
- Preserves `save/get/list/listByStatus/update/delete/stats/latest/count/has/clear` API
- Maps `ExperimentRecord` ↔ `ResearchExperiment` + `ResearchRun`
- Maps legacy 3-state status ↔ canonical multi-state statuses

**What the adapter does NOT do:**
- Create second persistence
- Create duplicate experiment IDs
- Create duplicate run IDs
- Save a second copy of experiment data
- Write to `minimind-experiment-history`

### ExperimentStore (deprecated facade)

`ExperimentStore.ts` is now a deprecated re-export facade:

```typescript
// All calls route to LegacyExperimentAdapter → ResearchExperimentStore
export { save, get, list, ... } from "./LegacyExperimentAdapter";
```

**DO NOT add new functionality to ExperimentStore.**
**DO NOT write to `minimind-experiment-history`.**

## Identity Invariants

Enforced by `validateResearchIdentityGraph()`:

1. **Session.experimentId → Experiment.id**: Every session's experimentId must reference an existing experiment
2. **Session.runId → Run.runId**: Every session's runId must reference an existing run
3. **Run.experimentId → Experiment.id**: Every run's experimentId must reference an existing experiment
4. **Session.experimentId === Run.experimentId**: Cross-wired references are errors
5. **No dangling runs**: Runs without an owning experiment are warnings
6. **No sessions pointing to runs of different experiments**: Cross-wired FKs are errors

## Migration Strategy

### Browser Data Migration

One-time migration from legacy `minimind-experiment-history` to canonical store:

```
legacy experiments (minimind-experiment-history)
       │
       ▼
validate each record
       │
       ▼
convert to ResearchExperiment + ResearchRun
       │
       ▼
save to canonical store (skip if already exists)
       │
       ▼
mark migration complete (minimind-research-migration-version = "v1")
```

**Properties:**
- Idempotent — running twice produces same result
- Non-destructive — legacy data is preserved (not deleted)
- Preserves original `createdAt`
- Does NOT overwrite existing canonical experiments
- Version-tracked via `minimind-research-migration-version`

### Migration Version Key

```
minimind-research-migration-version → "v1"
```

`v1` = legacy experiment migration completed

## Why Legacy Store No Longer Owns State

1. Legacy `ExperimentStore` is now a re-export facade — it has no internal logic
2. Legacy persistence key `minimind-experiment-history` is no longer written to
3. All writes go through `LegacyExperimentAdapter` → `ResearchExperimentStore`
4. All reads go through the same path — single source of truth
5. One-time migration moves existing legacy data to canonical store
6. `ExperimentRecord` (flat) is mapped to the richer `ResearchExperiment` + `ResearchRun` model

## Lifecycle

```
draft → ready → running → completed → archived
                  │
                  └── failed
```

Each experiment has multiple runs:
```
Experiment (id: exp-abc)
  ├── Run (runId: run-001) — seed 42, completed, bestLoss 1.2
  ├── Run (runId: run-002) — seed 123, completed, bestLoss 1.1
  └── Run (runId: run-003) — seed 456, running
```

## Complete Chain

```
Experiment
    ↓
Run
    ↓
Session
    ↓
Checkpoint
    ↓
Generation
```

Every entity in this chain is traceable back to its experiment via FK references.

## Files

| Layer | File | Role |
|---|---|---|
| Canonical Store | `src/lib/minimind/research/ResearchExperimentStore.ts` | Single source of truth |
| Experiment Entity | `src/lib/minimind/research/ResearchExperiment.ts` | Experiment definition |
| Run Entity | `src/lib/minimind/research/ResearchRun.ts` | Execution record |
| Session Entity | `src/lib/minimind/research/ResearchState.ts` | UI session state |
| Compatibility Adapter | `src/lib/minimind/experiments/history/LegacyExperimentAdapter.ts` | API bridge |
| Deprecated Facade | `src/lib/minimind/experiments/history/ExperimentStore.ts` | Re-export only |
| Migration | `src/lib/minimind/experiments/history/researchMigration.ts` | One-time data migration |
| Adapters | `src/lib/ai-lab/adapters/*.ts` | UI data transformation |
| UI Components | `src/components/ai-lab/experiments/*.tsx` | Experiment UI |
| Tests | `src/lib/minimind/__tests__/phase68-experiment-convergence.test.ts` | 33 tests |
