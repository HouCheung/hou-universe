# Phase 61 — MiniMind Architecture Audit

> Generated: 2026-08-11
> Scope: Full MiniMind research platform (Phases 43–60)

---

## 1. Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer (Browser)                        │
│  src/app/ai-lab/         src/components/ai-lab/                  │
│  src/components/minimind/                                        │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                    Adapter Layer (Browser)                        │
│  src/lib/ai-lab/adapters/                                        │
│  ├── progressAdapter.ts        ── aggregate stats                │
│  ├── missionAdapter.ts         ── learning intelligence          │
│  ├── moduleLinks.ts            ── navigation routes              │
│  ├── historyAdapter.ts         ── experiment run history         │
│  ├── trainingAdapter.ts        ── training run data              │
│  ├── trainingVisualizationAdapter.ts ── observatory chart data   │
│  ├── experimentLauncherAdapter.ts    ── experiment workspace     │
│  ├── researchWorkspaceAdapter.ts     ── research workspace       │
│  ├── liveTrainingAdapter.ts          ── live training bridge     │
│  └── researchCopilotAdapter.ts       ── copilot analysis         │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│              Research Layer (Browser-safe)                        │
│  src/lib/minimind/research/                                       │
│  ├── ResearchState.ts             ── ResearchSession types       │
│  ├── ResearchWorkspace.ts         ── localStorage CRUD           │
│  ├── ExperimentController.ts      ── Pipeline orchestrator       │
│  ├── TrainingEventBus.ts          ── Pub/sub events              │
│  ├── TrainingRuntime.ts           ── Live training bridge        │
│  ├── ResearchExperiment.ts        ── Experiment definition       │
│  ├── ResearchRun.ts               ── Run execution record        │
│  ├── ResearchExperimentStore.ts   ── Experiment/run persistence  │
│  ├── ResearchExperimentRunner.ts  ── Full lifecycle orchestrator │
│  ├── ExperimentQueue.ts           ── FIFO queue                  │
│  ├── BaselineWorkflow.ts          ── Ablation studies            │
│  ├── ReproducibilityCertificate.ts── FNV-1a fingerprinting       │
│  ├── ResearchReportV2.ts          ── Extended report             │
│  ├── NextExperimentGenerator.ts   ── Suggestion → config         │
│  └── copilot/                     ── Analysis engines            │
│      ├── ResearchInsightEngine.ts ── 8-dimension analysis        │
│      ├── RecommendationEngine.ts  ── 6-category recommendations  │
│      ├── ComparisonInsightEngine.ts── Multi-experiment compare   │
│      └── ResearchReport.ts        ── JSON/Markdown report        │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│               Experiments Layer (Mixed browser/Node)              │
│  src/lib/minimind/experiments/                                    │
│  ├── index.ts                    ── Browser-safe barrel          │
│  ├── node.ts                     ── Node-only barrel             │
│  ├── types.ts                    ── Core experiment types        │
│  ├── ExperimentContext.ts        ── Context factory              │
│  ├── ExperimentRunner.ts         ── Global runner registry       │
│  ├── ExperimentConfig.ts         ── JSON config (Node-only)      │
│  ├── TrainingExperimentRunner.ts ── 12-step pipeline (Node-only) │
│  ├── ModelRegistry.ts            ── 3 model presets              │
│  ├── TrainingRecipe.ts           ── 3 training recipes           │
│  ├── Ablation.ts                 ── Ablation framework           │
│  ├── BenchmarkReport.ts          ── Report (Node-only)           │
│  ├── history/                    ── Phase 51 history             │
│  │   ├── ExperimentRecord.ts     ── Record types                 │
│  │   ├── ExperimentStore.ts      ── localStorage CRUD            │
│  │   └── ExperimentComparison.ts ── Pairwise comparison          │
│  ├── campaign/                   ── Phase 55 campaign            │
│  │   ├── TrainingCampaign.ts     ── 15-step campaign (Node-only) │
│  │   ├── CampaignReport.ts       ── Campaign report (Node-only)  │
│  │   ├── GradientNormTracker.ts  ── Norm-tracking optimizer      │
│  │   └── ReproducibilityValidator.ts ── Dual-pass validation     │
│  └── runners/                    ── Interactive experiment runners│
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│              Training Observatory (Browser-safe)                  │
│  src/lib/minimind/training/observatory/                           │
│  ├── TrainingRunRecord.ts        ── Full per-step record types   │
│  ├── TrainingMetricsStore.ts     ── localStorage CRUD            │
│  └── TrainingAnalyzer.ts         ── Pure-function analysis       │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                    Core Training (Mixed)                          │
│  src/lib/minimind/training/     src/lib/minimind/core/           │
│  src/lib/minimind/model/        src/lib/minimind/data/           │
│  src/lib/minimind/tokenizer/    src/lib/minimind/evaluation/     │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Major Subsystems

| Subsystem | Location | Scope | Boundary |
|-----------|----------|-------|----------|
| Core Tensor Engine | `core/` | Tensor, autograd, ops, random | Browser-safe |
| Model Architecture | `model/`, `attention/`, `ffn/`, `transformer/`, `embedding/`, `rope/` | GPT components | Browser-safe |
| Tokenizer | `tokenizer/` | BPE, character, vocabulary | Browser-safe |
| Data Pipeline | `data/` | Dataset, DataLoader, streaming | Mixed (streaming = Node-only) |
| Training Engine | `training/` | Trainer, checkpoint, optimizer, scheduler | Browser-safe |
| Evaluation | `evaluation/` | Generation evaluator, benchmark, model stats | Browser-safe |
| Experiments Layer | `experiments/` | Runner registry, config, recipes, history, campaign | Mixed |
| Training Observatory | `training/observatory/` | Records, metrics store, analyzer | Browser-safe |
| Research Layer | `research/` | Workspace, events, experiment loop, copilot | Browser-safe |
| AI Lab Adapters | `ai-lab/adapters/` | UI data adapters | Browser-safe |
| UI Components | `components/ai-lab/`, `components/minimind/` | React components | Browser-only |
| Pages | `app/ai-lab/` | Next.js App Router pages | Browser-only |
| Experiment Registry | `data/minimind/experiment-registry.ts` | SSOT experiment definitions | Browser-safe |

## 3. Ownership of State

| State | Owner | Storage | Key |
|-------|-------|---------|-----|
| Experiment definitions (Phase 60) | `ResearchExperimentStore` | localStorage | `minimind-research-experiments` |
| Experiment runs (Phase 60) | `ResearchExperimentStore` | localStorage | `minimind-research-runs` |
| Research sessions (Phase 57) | `ResearchWorkspace` | localStorage | `minimind-research-workspace` |
| Experiment history (Phase 51) | `ExperimentStore` | localStorage | `minimind-experiment-history` |
| Per-step training metrics (Phase 53) | `TrainingMetricsStore` | localStorage | `minimind-training-metrics` |
| Live training events | `TrainingEventBus` | In-memory | N/A |
| Runtime state | `TrainingRuntime` | In-memory | N/A |
| Queue items | `ExperimentQueue` | In-memory | N/A |
| Model registry | `ModelRegistry` | In-memory (static) | N/A |
| Training recipes | `TrainingRecipe` | In-memory (static) | N/A |

## 4. Data Flow

```
ResearchExperiment (definition)
        │
        ▼
ResearchExperimentRunner.run()
        │
        ├──► TrainingEventBus.emit("training:start")
        │
        ├──► TrainingExecutor.execute()
        │       │
        │       ├──► BPETokenizer.train()
        │       ├──► TextDataset + DataLoader
        │       ├──► TensorMiniMindModel
        │       ├──► AdamWOptimizer + CosineScheduler
        │       ├──► GenerationEvaluator (BEFORE)
        │       ├──► Trainer.train()
        │       │       │
        │       │       └──► onLog callback
        │       │               │
        │       │               └──► TrainingEventBus.emit("training:step")
        │       │
        │       └──► GenerationEvaluator (AFTER)
        │
        ├──► completeResearchRun() → ResearchRun
        ├──► ResearchExperimentStore.createRun()
        └──► TrainingEventBus.emit("training:complete")
```

## 5. Identified Problems

### P0 — Correctness

#### P0.1 — Event sessionId / runId Confusion
- **File**: `ResearchExperimentRunner.ts:202`
- **Issue**: TrainingEventBus emits `sessionId: run.runId` — "sessionId" is ResearchSession terminology but the value is a ResearchRun ID
- **Impact**: Adapters consuming event data receive a runId labeled as sessionId. When filtering events by session vs run, cross-referencing fails
- **Fix**: Rename `sessionId` field to `runId` in TrainingEventBus event data types, OR introduce a disambiguated field

#### P0.2 — ResearchExperimentRunner.completeResearchRun creates duplicate run
- **File**: `ResearchExperimentRunner.ts:260-261`
- **Issue**: `createRun(run)` is called inside `completeResearchRun`, but the run was already `createRun(run)` at line 197. This creates a duplicate entry since `createRun` uses upsert logic. While functionally idempotent, the second call updates with full data
- **Impact**: Minor — functionally correct due to upsert, but semantically confusing
- **Severity downgraded to P1**: Functionally correct, just confusing code

### P1 — Architectural Correctness Risk

#### P1.1 — 5 Overlapping Entity Types
| Entity | Phase | Holds | Overlaps With |
|--------|-------|-------|---------------|
| `ResearchSession` | 57 | modelConfig, trainingConfig, dataset, metrics, timeline | `ResearchExperiment` |
| `ResearchExperiment` | 60 | modelConfig, trainingConfig, datasetConfig, evaluationConfig, seed | `ResearchSession` |
| `ResearchRun` | 60 | experimentId, seed, metrics, generation, analysis | `TrainingRunRecord` |
| `TrainingRunRecord` | 53 | modelConfig, trainingConfig, lossHistory, checkpoint, generationSamples | `ResearchRun`, `ExperimentRecord` |
| `ExperimentRecord` | 51 | modelConfig, trainingConfig, metrics, checkpoint | `TrainingRunRecord`, `ResearchRun` |

**Impact**: Multiple stores hold overlapping data. A completed training run's metrics could differ across `ResearchRun`, `TrainingRunRecord`, and `ExperimentRecord` if synchronization is incomplete. Consumers reading from different stores may see different values.

**Recommendation**: Document the canonical hierarchy. `ResearchRun` is the source of truth for run results. `TrainingRunRecord` is the source of truth for per-step observability data. `ExperimentRecord` (Phase 51) should be deprecated in favor of `ResearchRun`. `ResearchSession` should be marked as the UI workspace entity (distinct from `ResearchExperiment` the definition entity).

#### P1.2 — 4 Separate localStorage Stores
| Store | Key |
|-------|-----|
| `ExperimentStore` | `minimind-experiment-history` |
| `TrainingMetricsStore` | `minimind-training-metrics` |
| `ResearchWorkspace` | `minimind-research-workspace` |
| `ResearchExperimentStore` | `minimind-research-experiments` + `minimind-research-runs` |

**Impact**: No synchronization mechanism between these stores. The adapters (`historyAdapter`, `trainingAdapter`, `researchWorkspaceAdapter`) each read from different stores and present data independently. A training run completed via `ResearchExperimentRunner` is saved to `ResearchExperimentStore` but may not appear in `ExperimentStore` or `TrainingMetricsStore`.

**Recommendation**: Add a sync layer that propagates completed runs from `ResearchExperimentStore` to `TrainingMetricsStore` and `ExperimentStore`. Alternatively, consolidate adapters to read from one canonical store.

#### P1.3 — Two Parallel Experiment Systems
- **Older**: `experiments/` layer (Phase 46-55): `ExperimentConfig` + `TrainingExperimentRunner` + `ExperimentRecord` + `ExperimentStore`
- **Newer**: `research/` layer (Phase 57-60): `ResearchExperiment` + `ResearchExperimentRunner` + `ResearchRun` + `ResearchExperimentStore`

**Impact**: Two ways to run and record training. The older system is Node-only (fs/path). The newer system is browser-safe. They are not integrated — results from one are invisible to the other.

**Recommendation**: The newer `research/` layer should be the canonical path. The older `experiments/` layer serves CLI/Node use cases. Document the split clearly; add a bridge for Node results → browser store where feasible.

#### P1.4 — TrainingRuntime uses synthetic metrics, not real training
- **File**: `TrainingRuntime.ts`
- **Issue**: `generateStepMetrics()` produces "realistic synthetic loss curves" — decreasing from ~10 to ~1 with noise. This is NOT real training.
- **Impact**: The live training UI shows fake data when using TrainingRuntime directly. Only `ResearchExperimentRunner` with `createInlineTrainingExecutor` produces real metrics.
- **Recommendation**: Document that `TrainingRuntime` is a demo/stub. The real path is `ResearchExperimentRunner` + `TrainingExecutor`.

### P2 — Maintainability

#### P2.1 — Duplicated localStorage polyfill
- **Files**: phase53-observatory.test.ts, phase56-workspace-integration.test.ts, phase57-research.test.ts, phase58-runtime.test.ts, phase59-copilot.test.ts, phase60-research-loop.test.ts, and more
- **Issue**: The same localStorage polyfill is copy-pasted into every test file
- **Fix**: Extract to `src/lib/minimind/__tests__/test-utils.ts`

#### P2.2 — Custom test framework without standard runner
- **Issue**: 47 test files use a hand-rolled assert/run pattern. No `npm test` script. No CI integration possible without custom scripting.
- **Recommendation**: Document the test run commands. Consider lightweight test runner migration in a future phase.

#### P2.3 — Multiple report types with overlapping metrics
| Report | Phase | Metrics Source |
|--------|-------|---------------|
| `CampaignReport` | 55 | Campaign result (Node-only) |
| `TrainingReport` | 46 | Training experiment result (Node-only) |
| `ResearchReport` | 59 | Copilot insights |
| `ResearchReportV2` | 60 | ResearchRun + analysis |

**Impact**: Same training run could produce different reported values depending on which report generator is used.

### P3 — Cosmetic

#### P3.1 — Inconsistent ID format prefixes
- `rs-` for ResearchSession
- `exp-` for ResearchExperiment
- `run-` for ResearchRun
- `te-` for TimelineEvent
- `q-` for QueueItem
- Free-form for TrainingRunRecord.id and ExperimentRecord.id

**Recommendation**: Standardize the free-form IDs.

#### P3.2 — TrainingEventBus has `modelConfig: unknown` and `trainingConfig: unknown`
- **File**: `TrainingEventBus.ts:68-69`
- **Issue**: Typed as `unknown` instead of proper types
- **Fix**: Import `ModelConfigEntry` and `TrainingRecipe` types

## 6. Browser/Node Boundary Status

| Module | Status | Notes |
|--------|--------|-------|
| `src/lib/minimind/index.ts` | ✅ Browser-safe | No fs/path imports |
| `src/lib/minimind/node.ts` | ✅ Node-only | All fs/path imports isolated here |
| `src/lib/minimind/research/` | ✅ Browser-safe | All localStorage-based |
| `src/lib/minimind/experiments/ExperimentConfig.ts` | ✅ Node-only | fs imports |
| `src/lib/minimind/experiments/TrainingExperimentRunner.ts` | ✅ Node-only | fs imports |
| `src/lib/minimind/experiments/campaign/` | ✅ Node-only | fs imports |
| `src/lib/minimind/experiments/BenchmarkReport.ts` | ✅ Node-only | fs imports |
| `src/lib/minimind/experiments/index.ts` | ✅ Browser-safe | Excludes Node-only exports |
| `src/lib/minimind/training/observatory/` | ✅ Browser-safe | localStorage only |
| `src/lib/minimind/training/TrainingLogger.ts` | ✅ Node-only | fs imports |
| `src/lib/minimind/evaluation/TrainingReport.ts` | ✅ Node-only | fs imports |
| `src/lib/minimind/data/streaming/` | ✅ Node-only | fs imports |

**Verdict**: Boundary is clean. No fs leakage into browser barrels detected. Re-verified by `runtime-boundary.test.ts`.

## 7. Circular Dependency Check

No circular dependencies detected at the module level. All dependencies flow:
```
core ← model ← training ← experiments ← research ← adapters ← UI
```

The `ResearchExperimentRunner.ts` uses dynamic `import()` for training modules to avoid static circular dependencies at load time — this is a valid pattern.

## 8. Dead Code / Stale APIs

| Item | Status | Recommendation |
|------|--------|---------------|
| `TrainingRuntime.generateStepMetrics()` | Stale | Produces synthetic data; superseded by real Trainer |
| `ExperimentController` | Partially stale | Duplicates lifecycle logic now in ResearchExperimentRunner |
| Phase 51 `ExperimentRecord` / `ExperimentStore` | Superseded | Overlaps with Phase 60 ResearchRun / ResearchExperimentStore |
| `src/data/minimind/experiment-registry.ts` | Active | SSOT for interactive experiments, distinct from training experiments |

## 9. Issue Summary by Severity

| # | Severity | Issue | Recommended Action |
|---|----------|-------|--------------------|
| 1 | P0 | sessionId/runId naming confusion in events | Rename sessionId → runId in TrainingEventBus |
| 2 | P1 | 5 overlapping entity types | Document hierarchy; deprecate superseded types |
| 3 | P1 | 4 separate stores, no sync | Add sync adapter; document canonical store |
| 4 | P1 | Two parallel experiment systems | Document split; bridge Node→browser |
| 5 | P1 | TrainingRuntime synthetic metrics | Document as demo; promote real path |
| 6 | P2 | Duplicated localStorage polyfill in tests | Extract to test-utils |
| 7 | P2 | Multiple report types, no shared derivation | Document each report's scope |
| 8 | P3 | Inconsistent ID format for free-form IDs | Standardize in future phase |
| 9 | P3 | `unknown` types in TrainingEventBus | Type properly |
