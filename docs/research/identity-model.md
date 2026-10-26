# MiniMind Research — Canonical Identity Model

> Phase 67.5 Task 2 — Canonical Experiment / Run / Session Data Model Audit & Unification
>
> Last updated: 2026-08-12

---

## 1. Entity Definitions

### ResearchExperiment

**Represents:** "What do I want to study?"

The Experiment is a **research definition**, not a training execution. It captures the scientific question, hypothesis, and configuration parameters.

**Source file:** `src/lib/minimind/research/ResearchExperiment.ts`  
**Canonical ID generator:** `generateExperimentId()` (format: `exp-{timestamp36}-{random6}`)  
**Canonical persistence:** `ResearchExperimentStore` (localStorage key: `minimind-research-experiments`)

```
ResearchExperiment {
  id: string                    // Canonical ID (exp-{ts}-{rand})
  name: string                  // Human-readable name
  description: string           // Longer context
  hypothesis: string            // Scientific hypothesis
  createdAt: number             // Unix timestamp (ms)
  updatedAt: number             // Unix timestamp (ms)
  seed: number                  // Reproducibility seed
  modelConfig: ModelConfigEntry // Model architecture
  trainingConfig: TrainingRecipe // Training hyperparameters
  datasetConfig: DatasetConfig  // Dataset configuration
  tokenizerConfig: TokenizerConfig // Tokenizer settings
  evaluationConfig: EvaluationConfig // Evaluation plan
  tags: string[]                // Organization tags
  baselineExperimentId?: string // Reference to baseline (ablation studies)
  status: ResearchExperimentStatus // draft | ready | running | completed | archived
}
```

---

### ResearchRun

**Represents:** "What actually happened when I ran this experiment?"

A Run is a **single execution** of an Experiment. One Experiment can have many Runs (different seeds, hyperparameter variations, or reproducibility verification).

**Source file:** `src/lib/minimind/research/ResearchRun.ts`  
**Canonical ID generator:** `generateRunId()` (format: `run-{timestamp36}-{random6}`)  
**Canonical persistence:** `ResearchExperimentStore` (localStorage key: `minimind-research-runs`)

```
ResearchRun {
  runId: string                 // Canonical run ID
  experimentId: string          // FK → ResearchExperiment.id
  startedAt: number             // Unix timestamp (ms)
  completedAt: number           // Unix timestamp (ms), 0 if not completed
  status: ResearchRunStatus     // pending | running | completed | failed | cancelled
  seed: number                  // Random seed used
  initialLoss: number           // Loss before first step
  finalLoss: number             // Loss after final step
  bestLoss: number              // Best loss observed
  perplexity: number            // exp(bestLoss)
  tokensPerSecond: number       // Throughput
  totalTokens: number           // Total tokens processed
  totalSteps: number            // Optimizer steps
  totalEpochs: number           // Epochs completed
  durationMs: number            // Wall-clock duration
  checkpointId?: string         // Saved checkpoint reference
  generationBefore: RunGenerationResult[]  // Baseline generation
  generationAfter: RunGenerationResult[]   // Trained generation
  analysis: RunAnalysis | null  // Embedded analysis
  reproducibility: RunReproducibility | null // Reproducibility check
  reportId?: string             // Report reference
  errorMessage?: string         // Error details if failed
}
```

---

### ResearchSession

**Represents:** "What is the UI currently managing?"

A Session is a **runtime/UI orchestration entity**. It links the UI lifecycle to an Experiment and Run. Sessions are NOT experiments and NOT training runs — they are the glue between the UI and the training pipeline.

**Source file:** `src/lib/minimind/research/ResearchState.ts`  
**Canonical ID generator:** `generateSessionId()` (format: `rs-{timestamp36}-{random6}`)  
**Canonical persistence:** `ResearchWorkspace` (localStorage key: `minimind-research-workspace`)

```
ResearchSession {
  id: string                    // Canonical session ID
  experimentId?: string         // FK → ResearchExperiment.id
  runId?: string                // FK → ResearchRun.runId
  name: string                  // Human-readable name
  status: ResearchStatus        // created | configured | queued | running | paused |
                                // stopped | completed | failed | restored
  modelConfig: ModelConfigEntry // Model configuration
  trainingConfig: TrainingRecipe // Training recipe
  dataset: string               // Dataset identifier
  seed: number                  // Random seed
  metrics?: TrainingMetricsSnapshot  // Live training metrics
  activeCheckpoint?: ResearchCheckpoint // Active checkpoint
  checkpoints: ResearchCheckpoint[]    // All saved checkpoints
  timeline: ResearchTimelineEvent[]    // Event timeline
  finalLoss?: number            // Training result
  finalPerplexity?: number      // Training result
  bestLoss?: number             // Training result
  durationMs?: number           // Training duration
  errorMessage?: string         // Error if failed
  tags: string[]                // Organization tags
  notes?: string                // User notes
  createdAt: number             // Unix timestamp (ms)
  updatedAt: number             // Unix timestamp (ms)
}
```

---

### Checkpoint

**Represents:** "A saved training state at a specific point."

Checkpoints are embedded within Sessions (not a separate store). They carry the full serialized training state for pause/resume/restore.

**Source file:** `src/lib/minimind/research/ResearchState.ts` (ResearchCheckpoint interface)  
**Canonical ID generator:** Inline — format `ckpt-{timestamp}` or `ckpt-{timestamp}-{step}`  
**Canonical persistence:** Within `ResearchSession.checkpoints[]` in localStorage

```
ResearchCheckpoint {
  id: string                    // Checkpoint ID
  step: number                  // Step when saved
  loss: number                  // Loss at checkpoint
  perplexity?: number           // Perplexity at checkpoint
  epoch: number                 // Epoch number
  timestamp: number             // Unix timestamp (ms)
  durationMs?: number           // Training duration up to this point
  modelConfigLabel?: string     // Model fingerprint
  seed?: number                 // Random seed
  sizeBytes?: number            // Serialized size
  checkpointDataJSON?: string   // Full serialized training state (for restore)
}
```

---

## 2. Identity Graph

```
                    ResearchExperiment
                           │
                    experimentId (PK)
                           │
                           ▼
                      ResearchRun
                           │
                    runId (PK)
                    experimentId (FK → ResearchExperiment.id)
                    checkpointId (FK → ResearchCheckpoint.id)
                           │
                           ▼
                    ResearchSession
                           │
                    sessionId (PK)
                    experimentId (FK → ResearchExperiment.id)
                    runId (FK → ResearchRun.runId)
                           │
                    activeCheckpoint (embedded)
                           │
                           ▼
                    GenerationResult
                           │
                    experimentId (FK → ResearchExperiment.id)
                    runId (FK → ResearchRun.runId)
                    checkpointId (FK → ResearchCheckpoint.id)
```

---

## 3. Ownership & Source of Truth

| Entity | Canonical ID Generator | Authoritative Store | localStorage Key |
|--------|----------------------|--------------------|--------------------|
| Experiment | `generateExperimentId()` | `ResearchExperimentStore` | `minimind-research-experiments` |
| Run | `generateRunId()` | `ResearchExperimentStore` | `minimind-research-runs` |
| Session | `generateSessionId()` | `ResearchWorkspace` | `minimind-research-workspace` |
| Checkpoint | Inline (`ckpt-{ts}`) | Embedded in Session | (within session) |
| Generation | `generateRequestId()` | `GenerationHistoryStore` | `minimind-generation-history` |

---

## 4. Identity Invariants

The following MUST hold at all times:

1. **Session.experimentId === Experiment.id** — session's experiment reference must be valid
2. **Session.runId === Run.runId** — session's run reference must be valid
3. **Run.experimentId === Experiment.id** — run must belong to its parent experiment
4. **Session.experimentId === Run.experimentId** — session and its run must point to the same experiment
5. **No dangling foreign keys** — if an entity references another, that entity must exist
6. **No cross-wired references** — a session cannot point to a run that belongs to a different experiment

These invariants are validated by:
- `validateResearchIdentityGraph(sessions, experiments, runs)` — pure function, returns `IdentityGraphDiagnostic`
- `validateCurrentIdentityGraph()` — reads all data from localStorage and validates

---

## 5. Lifecycle

### Experiment Lifecycle

```
draft → ready → running → completed
                           → archived
```

### Run Lifecycle

```
pending → running → completed
                  → failed
                  → cancelled
```

### Session Lifecycle

```
created → configured → queued → running → paused → running → completed
                                         ↓         ↓
                                       stopped    failed
                                         ↓         ↓
                                       restored ←──
```

---

## 6. Training Flow

```
User
 ↓
Start Training
 ↓
TrainingRuntime.start()
 ↓
ensureExperimentAndRun()
 ├── Experiment created (if not exists) → status: draft → running
 ├── Run created → status: pending → running
 └── Session linked → experimentId + runId set
 ↓
Worker spawns
 ↓
training:step → metrics reported to session
 ↓
checkpoint → ResearchCheckpoint saved to session
 ↓
training:complete
 ↓
finalizeRun()
 ├── Run finalized → status: completed (with metrics)
 └── Experiment status → completed
 ↓
Session status → completed (via controller)
```

---

## 7. Generation Provenance

Every generation result carries the full provenance chain:

```
GenerationResult
 ├── experimentId → traces to ResearchExperiment
 ├── runId → traces to ResearchRun
 ├── checkpointId → traces to specific checkpoint
 └── sessionId → traces to ResearchSession
```

The traceability chain is:

```
GenerationResult → Checkpoint → Run → Experiment
```

This allows answering: "This text was generated from checkpoint X of run Y, which was part of experiment Z studying hypothesis H with model config M."

---

## 8. Dual Store Note

There are two experiment storage systems:

1. **Legacy:** `experiments/history/ExperimentStore` (key: `minimind-experiment-history`, type: `ExperimentRecord`)
   - Used by: ExperimentLauncher UI, ExperimentDetailPage
   - Stores: simplified experiment records with metrics
   
2. **Canonical:** `research/ResearchExperimentStore` (keys: `minimind-research-experiments`, `minimind-research-runs`)
   - Used by: TrainingRuntime, ResearchExperimentRunner
   - Stores: full research experiments + individual runs

The `ExperimentDetailPage` now queries **both** stores — the legacy store for backward compatibility, plus the canonical store for the full identity graph with runs.

---

## 9. Key Files

| File | Role |
|------|------|
| `src/lib/minimind/research/ResearchExperiment.ts` | Experiment type, ID generator, factory, lifecycle |
| `src/lib/minimind/research/ResearchRun.ts` | Run type, ID generator, factory, lifecycle |
| `src/lib/minimind/research/ResearchState.ts` | Session type, ID generator, factory, checkpoint type |
| `src/lib/minimind/research/ResearchExperimentStore.ts` | Experiment + Run persistence, identity validation |
| `src/lib/minimind/research/ResearchWorkspace.ts` | Session persistence |
| `src/lib/minimind/research/TrainingRuntime.ts` | Ensures identity creation, finalizes runs |
| `src/lib/minimind/research/GenerationResult.ts` | Generation types with full provenance |
| `src/lib/minimind/research/GenerationRuntime.ts` | Resolves experimentId for generation |
| `src/lib/minimind/research/GenerationHistoryStore.ts` | Generation history persistence |
| `src/lib/ai-lab/adapters/experimentLauncherAdapter.ts` | Re-exports canonical experimentId generator |
| `src/lib/ai-lab/adapters/generationAdapter.ts` | Propagates experimentId through adapter layer |
| `src/components/ai-lab/experiments/ExperimentDetailPage.tsx` | Displays experiment + runs from both stores |

---

## 10. Testing

Tests are in `src/lib/minimind/research/__tests__/phase67-identity.test.ts` and cover:

- **Identity uniqueness:** experimentId, runId, sessionId (each 1000 generations)
- **Relationship invariants:** valid graph, missing experiment, missing run, cross-wired FKs, dangling references, orphan runs
- **Lifecycle transitions:** created→running→completed, running→failed, running→cancelled, invalid transitions
- **Training→Run flow:** experiment created → run created → session links → run finalized
- **Generation provenance:** trace from generation → checkpoint → run → experiment
- **Persistence round-trip:** create → save → reload → validate identity graph
- **Integration:** validateCurrentIdentityGraph() runs without throwing
