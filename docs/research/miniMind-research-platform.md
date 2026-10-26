# MiniMind Research Platform — Architecture & Developer Guide

> Canonical architecture document. Last updated: 2026-08-11 (Phase 61 validation).

## Overview

MiniMind is a browser-native deep learning research platform built into HOU Universe. It allows users to define, run, analyze, and compare training experiments entirely in the browser — no server, no Python, no GPU required for small-scale experiments.

The platform validates the complete research workflow: **define experiment → train model → analyze results → compare runs → generate insights → reproduce findings**.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer (React)                      │
│  ResearchWorkspace  ExperimentRunnerPanel  LiveTraining  │
│  ExperimentComparison  CopilotPanel  ExperimentHistory   │
├─────────────────────────────────────────────────────────┤
│                  Adapter Layer                           │
│  experimentLauncherAdapter  historyAdapter               │
│  liveTrainingAdapter  researchCopilotAdapter             │
├─────────────────────────────────────────────────────────┤
│              Research Orchestration                      │
│  ResearchExperimentRunner  TrainingEventBus              │
│  ResearchInsightEngine  RecommendationEngine             │
│  ExperimentComparisonEngine  ResearchReportV2            │
├─────────────────────────────────────────────────────────┤
│               Training Infrastructure                    │
│  Trainer  DataLoader  Checkpoint (save/load)             │
│  AdamW  CosineScheduler  GenerationEvaluator             │
├─────────────────────────────────────────────────────────┤
│                  Model Layer                             │
│  TensorMiniMindModel  Attention  FFN  Embedding          │
│  RMSNorm  LayerNorm  TransformerBlock                    │
├─────────────────────────────────────────────────────────┤
│                  Core (Tensor Engine)                    │
│  Tensor  Parameter  Module  ops/*  Autograd              │
│  Random (SeededRandom + Mulberry32)                      │
└─────────────────────────────────────────────────────────┘
```

## Entity Model

The platform distinguishes 5 entity types across 2 parallel systems:

### Research System (new, Phase 57-61)

| Entity | ID Format | Purpose |
|--------|-----------|---------|
| **ResearchExperiment** | `exp-{ts}-{rand}` | Immutable experiment definition (model, training, data configs) |
| **ResearchRun** | `run-{ts}-{rand}` | One execution of an experiment (metrics, checkpoints, generation) |
| **ResearchSession** | `rs-{ts}-{rand}` | UI workspace entity — groups multiple experiments and runs |

### Legacy System (pre-Phase 57)

| Entity | ID Format | Purpose |
|--------|-----------|---------|
| **TrainingRunRecord** | `training-{id}` | Legacy training record |
| **ExperimentRecord** | `experiment-{id}` | Legacy experiment record |

### Identity Hierarchy

```
ResearchExperiment (exp-*)  ← "what to run"
  └── ResearchRun (run-*)   ← "one execution of it"
        ├── CheckpointData   ← "saved state"
        ├── TrainingMetrics  ← "measured during training"
        └── ReproducibilityCertificate ← "fingerprint proof"

ResearchSession (rs-*)      ← "workspace grouping" (UI only, not training identity)
```

## Data Flow

```
User defines experiment
  → ResearchExperiment (validated)
  → ResearchExperimentRunner.run()
    → Create ResearchRun (status: pending → running)
    → Build training pipeline (tokenizer, dataset, model, optimizer, scheduler)
    → Execute training (real Trainer — no mocks)
      → TrainingEventBus emits: start, step, checkpoint, evaluation, complete, error
    → Generation before/after
    → Complete ResearchRun (status: completed)
  → ResearchInsightEngine.analyze(run)
    → 8 analysis dimensions: convergence, divergence, spikes, overfitting,
      gradient, throughput, stability, reproducibility
  → RecommendationEngine.generate(insights)
    → 6 categories: lr, regularization, architecture, data, training, evaluation
  → ResearchReportV2.generate(run, insights, recommendations)
    → JSON + Markdown reports
```

## Key Components

### ResearchExperimentRunner

Orchestrates the full experiment lifecycle. Takes a `TrainingExecutor` (pluggable) to decouple training from orchestration.

```typescript
const runner = new ResearchExperimentRunner({ executor: inlineExecutor });
const result = await runner.run(experiment);
// result.run, result.training, result.saved
```

### TrainingEventBus

In-memory pub/sub for real-time training events. UI components subscribe for live updates.

```typescript
const bus = new TrainingEventBus();
bus.subscribe("training:step", (data) => {
  // data.metrics.loss, data.metrics.perplexity, ...
});
```

Events: `training:start`, `training:step`, `training:checkpoint`, `training:evaluation`, `training:complete`, `training:error`.

### Checkpoint System (v3)

Saves and restores complete training state:
- Model parameters (Float64, name+shape+data)
- Optimizer state (AdamW: step count, m, v moments)
- Scheduler state (Cosine: stepCount, baseLR, minLR, warmupSteps, totalSteps)
- Trainer state (epoch, batch, globalStep, bestLoss, lossHistory)
- Global RNG state (Mulberry32 PRNG internal state)
- DataLoader state (epoch, batch indices)

**Guarantee**: After save → load → continue training, parameters are bit-identical (max diff < 1e-12).

### ResearchInsightEngine

Analyzes training data across 8 dimensions and produces structured insights with:
- Numerical evidence (loss values, gradient norms, etc.)
- Confidence scores (0-1)
- Severity levels (info, warning, critical)

### RecommendationEngine

Generates actionable recommendations from insights across 6 categories:
- Learning rate, regularization, architecture, data, training, evaluation
- Each recommendation includes: category, priority, evidence, suggested action

## Browser/Node Boundary

```
src/lib/minimind/
├── index.ts          ← Browser-safe (no fs, no path, no Node APIs)
├── node.ts           ← Node-only (fs, path for CLI and file-based experiments)
├── core/             ← Browser-safe (pure computation)
├── model/            ← Browser-safe
├── training/         ← Browser-safe (in-memory checkpoint)
├── data/             ← Browser-safe (TextDataset, DataLoader)
├── tokenizer/        ← Browser-safe (BPETokenizer)
├── evaluation/       ← Browser-safe
└── research/         ← Browser-safe (localStorage stores)
    ├── ResearchExperimentRunner.ts  ← Uses dynamic import() for training modules
    └── TrainingEventBus.ts          ← Pure in-memory pub/sub
```

## Storage

The platform uses 4 `localStorage` stores (all browser-native, no IndexedDB):

| Store | Key Pattern | Entity |
|-------|-------------|--------|
| `ResearchExperimentStore` | `minimind_experiments` | ResearchExperiment[] |
| `ResearchWorkspace` | `minimind_workspace` | ResearchSession[] |
| `TrainingMetricsStore` | `minimind_metrics` | TrainingMetricsSnapshot[] |
| `ExperimentStore` | `minimind_experiment_records` | ExperimentRecord[] |

## Testing

### Test Infrastructure

- Custom assertion framework: `assert`, `assertEq`, `assertClose`, `assertFinite`
- Runner: `npx tsx src/lib/minimind/research/__tests__/run.ts`
- 4 test suites, 128+ tests, 335+ assertions
- Real training E2E test (no mocks — actual BPETokenizer, TextDataset, Model, Trainer)

### Test Files

| File | Phase | Focus |
|------|-------|-------|
| `phase58-runtime.test.ts` | 58 | Live training runtime, event bus, scheduler |
| `phase59-copilot.test.ts` | 59 | Insight engine, recommendation engine, reports |
| `phase61-e2e.test.ts` | 61 | Full integration: identity, training, checkpoint, events, metrics, copilot, reports, reproducibility, edge cases, store CRUD |
| `phase61-checkpoint-resume.test.ts` | 61 | Checkpoint round-trip, deterministic reproducibility, continuous = interrupted + resumed |

## Reproducibility

### Guarantee

Same seed + same data + same config = same result to machine precision (max param diff < 1e-12).

### Mechanism

1. `Random.setSeed(seed)` sets global Mulberry32 PRNG state
2. Model initialization consumes RNG deterministically
3. DataLoader shuffle uses `seededShuffle` with fixed seed (deterministic order)
4. Training is deterministic (no async, no non-deterministic ops)
5. Checkpoint saves full RNG state for exact resume

### Validation

Two independent training runs with the same seed produce identical:
- Loss at every step (diff < 1e-12)
- Model parameters (max diff < 1e-12)
- Best loss (diff < 1e-12)

Continuous training for N steps produces the SAME result as training K steps → checkpoint → resume → train N-K steps.

## Version History

| Phase | Date | Changes |
|-------|------|---------|
| 43-56 | 2026 Q1-Q2 | Core tensor engine, model architecture, training infrastructure |
| 57 | 2026-07 | TrainingEventBus, live training runtime |
| 58 | 2026-07 | Checkpoint v2/v3, DataLoader state |
| 59 | 2026-07 | Research Copilot (insight + recommendation engines) |
| 60 | 2026-07 | ResearchExperimentRunner, TrainingExecutor |
| **61** | **2026-08** | **Integration validation — 335 assertions, E2E real training, checkpoint identity, reproducible build** |

## Key Design Decisions

1. **Float64 everywhere**: No mixed precision — simplifies debugging and ensures reproducibility at the cost of memory. Future: Float32/Int8 for production.

2. **In-memory checkpoint**: No file I/O in browser context. CheckpointData is a plain JSON-compatible object; callers handle persistence (localStorage, download, etc.).

3. **Pluggable TrainingExecutor**: The ResearchExperimentRunner doesn't know HOW training happens — it delegates to a TrainingExecutor. This allows swapping Trainer/Campaign implementations without changing orchestration logic.

4. **Custom assertion framework**: Tests run via `tsx` (not Jest/Vitest) to avoid transpilation complexity. Assertions are vanilla functions — no test runner dependency.

5. **No mock data in E2E tests**: Phase 61 tests use real BPETokenizer, real TextDataset, real Model, real Trainer. The only concession is a small corpus (30 lines) for execution speed.

## Related Documents

- [Architecture Audit](phase61-architecture-audit.md) — Detailed dependency graph, P0/P1/P2 issues
- [Experiment Identity Model](experiment-identity.md) — Canonical identity hierarchy
- [Performance Baseline](phase61-performance-baseline.md) — Timing and throughput measurements
