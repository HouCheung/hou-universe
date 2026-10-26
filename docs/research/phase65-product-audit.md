# Phase 65 Product Audit: MiniMind Research Studio

> **Date**: 2026-08-11
> **Scope**: Product-level + Architecture-level audit of MiniMind Research Studio before Phase 65
> **Principle**: Real usability > Training closure > Research closure > UX > UI polish > Feature count

---

## Section 1: Capability Matrix — 19 User Questions Answered

For each capability, I traced the FULL path from UI button → adapter → library → computation → output.

| # | Capability | Library Support | UI Exists? | ACTUALLY WORKS? | Verdict |
|---|-----------|----------------|------------|-----------------|---------|
| 1 | User can create a training run | ✅ ExperimentRecord, ResearchExperiment | ✅ ExperimentLauncher, ResearchWorkspace | ❌ | **FAKE** — creates localStorage record, no training starts |
| 2 | User can select model preset | ✅ ModelRegistry (3 presets) | ✅ dropdown in ExperimentLauncher | ❌ | **FAKE** — dropdown exists but `onStart` hardcodes model |
| 3 | User can select dataset | ✅ DatasetConfig types | ⚠️ label only, no real selector | ❌ | **FAKE** — hardcoded "synthetic" |
| 4 | User can adjust hyperparameters | ✅ TrainingRecipe (3 recipes) | ⚠️ recipe selector only | ❌ | **FAKE** — hardcoded "tiny-overfit-test" |
| 5 | User can set seed for reproducibility | ✅ ResearchExperiment.seed | ⚠️ seed field in launcher | ❌ | **FAKE** — hardcoded 42 |
| 6 | User can start REAL training | ✅ createInlineTrainingExecutor() | ✅ "Start Training" button | ❌ | **FAKE** — calls `trainingRuntime.start()` which calls `generateStepMetrics()` with `Math.random()` |
| 7 | User can see LIVE metrics | ✅ TrainingEventBus (real pub/sub) | ✅ LiveTrainingPanel | ❌ | **FAKE** — metrics sourced from `generateStepMetrics()` |
| 8 | User can PAUSE training | ✅ ExperimentController (state machine) | ✅ Pause button | ❌ | **FAKE** — pauses fake metrics loop |
| 9 | User can RESUME training | ✅ ExperimentController | ✅ Resume button | ❌ | **FAKE** — resumes fake metrics |
| 10 | User can STOP training | ✅ ExperimentController | ✅ Stop button | ❌ | **FAKE** — stops fake metrics loop |
| 11 | User can SAVE checkpoint | ✅ Train checkpoint JSON serialization | ⚠️ checkpoint panel in UI | ❌ | **FAKE** — shows static string, never saves |
| 12 | User can RESTORE from checkpoint | ✅ Trainer.resume() | ⚠️ resume button in checkpoint panel | ❌ | **FAKE** — resume restarts fake metrics, doesn't restore model weights |
| 13 | User can see generation output (before/after) | ✅ GenerationEvaluator, compare() | ❌ | ❌ | **NOT CONNECTED** — GenerationEvaluator never imported in any .tsx file |
| 14 | User can compare experiment runs | ✅ compareRunsByBestLoss, compareRunsBySpeed, compareBenchmarkReports | ❌ | ❌ | **NOT CONNECTED** — no comparison UI exists |
| 15 | User can clone experiment for ablation | ✅ cloneResearchExperiment() | ❌ | ❌ | **NOT CONNECTED** — no "Clone" button anywhere |
| 16 | User can view full training report | ✅ ResearchReportV2, reportToJSON, reportToMarkdown | ⚠️ result summary section | ❌ | **NOT CONNECTED** — report generators exist but never called from UI |
| 17 | User can export JSON/Markdown report | ✅ reportToJSON(), reportToMarkdown() | ❌ | ❌ | **NOT CONNECTED** — export functions exist but no UI trigger |
| 18 | User can understand WHY experiment performed better | ✅ ResearchInsightEngine, BenchmarkCopilot | ⚠️ insight cards in dashboard | ❌ | **DISPLAY-ONLY** — insights shown from localStorage analysis, not from live experiment comparison |
| 19 | User can fully reproduce experiment | ✅ ExperimentFingerprint, ReproducibilityCertificate | ❌ | ❌ | **NOT CONNECTED** — fingerprint functions exist but no UI to re-run with same config |

### Capability Matrix Summary

| Category | Count |
|----------|-------|
| **Actually works end-to-end** | **0/19** |
| Library code exists but UI is FAKE | 12/19 |
| Library code exists but UI NOT CONNECTED | 7/19 |
| Completely missing (code + UI) | 0/19 |

**The core finding: MiniMind has remarkable library-level depth (real Tensor engine, real Transformer, real Trainer, real AdamW, real tokenizer, real GenerationEvaluator, real ExperimentFingerprint, real BenchmarkSuite, real ResearchExperimentRunner). But ZERO of these connect to working user-facing flows.** Every single "Start Training" path produces FAKE metrics, every "experiment" is just a localStorage record, and GenerationEvaluator/Benchmark/Export have never been called from any UI component.

---

## Section 2: Completed (Library-Level) — What's REAL

These are real, working implementations at the library level that should be preserved and connected:

### MiniMind Core
| Module | File | Status |
|--------|------|--------|
| Tensor engine | `src/lib/minimind/core/Tensor.ts` | ✅ Real — full tensor operations |
| Transformer Block | `src/lib/minimind/model/TensorMiniMindModel.ts` | ✅ Real — MultiHeadAttention, FFN, RMSNorm, LM Head |
| Attention | `src/lib/minimind/attention/` | ✅ Real — scaled dot-product, causal mask |
| FFN | `src/lib/minimind/ffn/` | ✅ Real — SiLU activation |
| AdamW Optimizer | `src/lib/minimind/training/` | ✅ Real — momentum, weight decay |
| Cosine Scheduler | `src/lib/minimind/training/` | ✅ Real — warmup + cosine decay |
| Cross-Entropy Loss | `src/lib/minimind/core/loss/CrossEntropyLoss.ts` | ✅ Real |
| BPE Tokenizer | `src/lib/minimind/tokenizer/BPETokenizer.ts` | ✅ Real — encode/decode/train |
| Trainer | `src/lib/minimind/training/Trainer.ts` | ✅ Real — forward/backward loop with onLog/onEpochEnd callbacks |
| Checkpoint save/load | `Trainer.saveCheckpoint()` / `Trainer.resume()` | ✅ Real — JSON serializable |

### Research Infrastructure
| Module | File | Status |
|--------|------|--------|
| TrainingEventBus | `src/lib/minimind/research/TrainingEventBus.ts` | ✅ Real — 6 event types, 500-entry ring buffer, singleton |
| ExperimentController | `src/lib/minimind/research/ExperimentController.ts` | ✅ Real — lifecycle state machine |
| ResearchWorkspace | `src/lib/minimind/research/ResearchWorkspace.ts` | ✅ Real — localStorage CRUD |
| ResearchExperimentRunner | `src/lib/minimind/research/ResearchExperimentRunner.ts` | ✅ Real — `createInlineTrainingExecutor()` builds complete training pipeline |
| ResearchExperiment | `src/lib/minimind/research/ResearchExperiment.ts` | ✅ Real — definition entity |
| ResearchRun | `src/lib/minimind/research/ResearchRun.ts` | ✅ Real — run records |
| ResearchExperimentStore | `src/lib/minimind/research/ResearchExperimentStore.ts` | ✅ Real — full CRUD + export/import |
| ExperimentFingerprint | `src/lib/minimind/research/benchmark/ExperimentFingerprint.ts` | ✅ Real — FNV-1a deterministic hashing |
| ReproducibilityCertificate | `src/lib/minimind/research/ReproducibilityCertificate.ts` | ✅ Real |
| BaselineWorkflow | `src/lib/minimind/research/BaselineWorkflow.ts` | ✅ Real — ablation workflow |
| BenchmarkSuite | `src/lib/minimind/research/benchmark/` | ✅ Real — model scale/lr/batch/epoch suites |
| GenerationEvaluator | `src/lib/minimind/evaluation/GenerationEvaluator.ts` | ✅ Real — before/after comparison |
| ResearchInsightEngine | `src/lib/minimind/research/copilot/` | ✅ Real — generates insight recommendations |
| ModelRegistry | `src/lib/minimind/experiments/ModelRegistry.ts` | ✅ Real — 3 presets + createModel() |
| TrainingRecipe | `src/lib/minimind/experiments/TrainingRecipe.ts` | ✅ Real — 3 recipes with validation/diffing |
| ExperimentRecord + Store | `src/lib/minimind/experiments/history/` | ✅ Real — localStorage history |
| Export/Import | `exportExperiment`, `importExperiment`, `reportToJSON`, `reportToMarkdown` | ✅ Real |

---

## Section 3: UI Completed — Actually Done

These UI components display real data correctly:

| Component | What it shows | Verdict |
|-----------|--------------|---------|
| `DashboardHero` | Progress stats, CTA links | ✅ Shows real values from progressAdapter |
| `StudioHero` | Hero + quick actions | ✅ Shows real studio data from studioAdapter |
| `QuickNavigationCards` | Nav links to sub-pages | ✅ Static nav, works |
| `ModelOverview` / `ModelOverviewSection` | Model architecture stats | ✅ Reads from ModelRegistry, real data |
| `RecentExperimentsSection` | Experiment history cards | ✅ Reads from localStorage, real records |
| `ResearchInsightSection` | Insight cards | ✅ Reads from copilot adapter, real analysis |
| `FloatingNavDock` | AI Lab sub-navigation | ✅ Works |
| `BreadcrumbBar` | Breadcrumb navigation | ✅ Works |
| Static metric cards in `ExperimentDetailPage` | Static display of experiment config + metrics | ✅ Displays stored values correctly |

---

## Section 4: UI Fake / Display-Only — Confirmed Disconnected

Every component listed below has library backing but connects to FAKE runtime or shows static data:

| Component | Issue | Root Cause |
|-----------|-------|-------------|
| **`ResearchWorkspace.tsx` "Start Training"** | User clicks → FAKE metrics | Lines 572-618: hardcodes config, calls `trainingRuntime.start()` → `generateStepMetrics()` |
| **`LiveTrainingPanel`** | Shows live metrics | Sourced from `TrainingRuntime` via event bus → FAKE |
| **`ResearchWorkspace` Pause/Resume/Stop** | Buttons work but pause FAKE loop | `trainingRuntime.pause()` pauses `setTimeout` not real training |
| **`ResearchWorkspace` Checkpoint Panel** | Shows "Latest checkpoint at loss X" | data from `trainingRuntime.getState()`, checkpoint is fake |
| **`ResearchWorkspace` Resume from Checkpoint** | Resume button | `trainingRuntime.resume()` → continues fake loop |
| **`ExperimentsWorkspacePage.tsx` handleLaunch** | Creates experiment | Lines 61-114: `ExperimentRecord` + localStorage save + navigate, NO training dispatch |
| **`ExperimentLauncher` dropdowns** | Model/recipe/dataset selectors | User selections are overridden by hardcoded values in `ResearchWorkspace.onStart` |
| **`ExperimentDetailPage`** | Static read-only view | No training controls, no live updates, static data display |
| **`ExperimentDetailPage` "Mark Completed/Failed"** | Manual status override | Line 108-118: just sets status string, no real training lifecycle |
| **`TrainingObservatory`** | Training summary charts | Reads from localStorage training metrics (which came from fake runtime) |
| **`ResearchOverview`** | Research stats | Reads from localStorage, no live connection |
| **`ExperimentHistoryPanel`** | History table | Real records but from fake training runs |
| **`ExperimentLeaderboard`** | Ranked experiments | Real records but loss values from fake training |
| **`GenerationShowcase`** | Generation examples | Lines in `ExperimentDetailPage`: "Run a full training campaign with TrainingCampaign to generate before/after comparisons" — admits it's NOT real |
| **`ResearchCopilot` insights** | Research insights | Generated from stale localStorage data, not live experiment context |

---

## Section 5: Training Closure Gaps

The critical end-to-end training gaps:

### Gap T1: FAKE TrainingRuntime is the only browser training path
- **Current**: `TrainingRuntime.runAsyncTrainingLoop()` calls `generateStepMetrics()` which uses `Math.random()`
- **What should happen**: Call `ResearchExperimentRunner.createInlineTrainingExecutor()` which builds a REAL training pipeline
- **Why it's not connected**: `createInlineTrainingExecutor()` is synchronous and blocks the main thread. No Web Worker exists.
- **Fix approach**: Move `createInlineTrainingExecutor()` into a Web Worker, stream metrics back via postMessage → TrainingEventBus

### Gap T2: Training page renders OLD educational pipeline
- **Current**: `/ai-lab/training` page renders `TrainingPageClient` which uses `MiniMindModel` (old), `Pretrainer` (old), `ToyDataset`, `NoOpOptimizer`
- **What should happen**: Page should use `TensorMiniMindModel`, `Trainer`, `AdamWOptimizer`, `CosineScheduler` from new infrastructure
- **Impact**: The `/ai-lab/training` page is a completely different codebase from the research studio

### Gap T3: ExperimentLauncher creates records without training
- **Current**: `handleLaunch()` creates `ExperimentRecord`, saves to localStorage, navigates to detail page
- **Comment on line 53-54**: "In a full implementation, the actual training would be dispatched to TrainingCampaign"
- **Impact**: Users create "experiments" that are just database entries with no computation

### Gap T4: No training abort mechanism
- **Current**: `TrainingRuntime.stop()` just clears setTimeout
- **Real Trainer**: `Trainer.train()` has no AbortSignal, no cancellation
- **Impact**: Real training (once connected) can't be stopped mid-epoch

### Gap T5: Training is synchronous (blocks UI)
- **Current**: `Trainer.train()` is a synchronous loop. `TrainingRuntime` fakes async via setTimeout.
- **Need**: Web Worker or chunked training with requestAnimationFrame yields

---

## Section 6: Research Closure Gaps

### Gap R1: GenerationEvaluator never called from UI
- **Library has**: Full `GenerationEvaluator` with `evaluate()`, `compare()`, `GenerationComparison`
- **UI has**: Static text in `ExperimentDetailPage` saying "run a full training campaign with TrainingCampaign to generate before/after comparisons"
- **Impact**: User never sees the model's text generation improve after training

### Gap R2: Experiment comparison not implemented in UI
- **Library has**: `compareRunsByBestLoss()`, `compareRunsBySpeed()`, `compareBenchmarkReports()`, `ExperimentFingerprint.compareExperimentIdentity()`
- **UI has**: Nothing. No comparison view, no side-by-side, no diff view
- **Impact**: User can't answer "Did this experiment improve on the last one?"

### Gap R3: Export functionality not exposed in UI
- **Library has**: `exportExperiment()`, `importExperiment()`, `reportToJSON()`, `reportToMarkdown()`, `exportAll()`, `importAll()`
- **UI has**: Zero export/download buttons
- **Impact**: User can't save or share experiment results

### Gap R4: Reproducibility is code-only, no UI
- **Library has**: `ReproducibilityCertificate`, `cloneResearchExperiment()`
- **UI has**: Static text "To verify reproducibility, run the same configuration with the same seed"
- **Impact**: User can't click "Reproduce" or "Verify Reproducibility"

### Gap R5: Benchmark suite not runnable from UI
- **Library has**: `BenchmarkSuite`, `createModelScaleSuite()`, `createLearningRateSuite()`, `createBatchSizeSuite()`, `createEpochSuite()`
- **UI has**: `ResearchWorkspace` has a "Benchmark Section" but it's display-only
- **Impact**: User can't run hyperparameter sweeps from the UI

### Gap R6: Ablation workflow not accessible
- **Library has**: `BaselineWorkflow` with ablation variant generation
- **UI has**: No "Clone for Ablation" button, no ablation UI flow
- **Impact**: User can't systematically test which hyperparameters matter

---

## Section 7: Runtime / Architecture Gaps

### Gap A1: No Web Worker infrastructure
- **Problem**: `createInlineTrainingExecutor()` runs synchronously, blocking the main thread
- **Impact**: Any real training > ~100 steps freezes the browser tab
- **Fix**: Create `training.worker.ts` that wraps the full training pipeline, streams metrics via postMessage

### Gap A2: Trainer has no AbortSignal support
- **Problem**: `Trainer.train()` has no cancellation mechanism
- **Impact**: Once real training starts, user can't stop it
- **Fix**: Add `AbortSignal` parameter, check `signal.aborted` in the epoch loop

### Gap A3: No API routes (everything is client-side)
- **Problem**: `src/app/api/` does not exist. No Server Actions. Training can only happen in browser localStorage.
- **Impact**: No persistent server-side storage, no Node.js file access, no TrainingCampaign integration
- **Decision needed**: Do we stay browser-only or add API routes?

### Gap A4: Browser/Node boundary is respected but limits functionality
- **Problem**: `TrainingCampaign`, `TinyStoriesDataset`, `TextCorpus` are Node-only (use fs/path)
- **Current barrier**: `src/lib/minimind/index.ts` exports browser-safe; `src/lib/minimind/node.ts` exports Node-only
- **Impact**: Real datasets (TinyStories) are unreachable from browser UI

### Gap A5: localStorage as sole persistence layer
- **Problem**: All experiment data, training records, checkpoints stored in localStorage
- **Limitations**: ~5MB limit, can't store model weights, can't share between sessions
- **Impact**: Model checkpoints (containing all parameters) can't be saved in localStorage

---

## Section 8: UX / Product Gaps

### Gap UX1: Hardcoded configuration defeats user choice
- User selects model/recipe/dataset in launcher → `onStart` ignores selections and uses hardcoded values
- This is the single most broken user experience in the entire application

### Gap UX2: Information Architecture is dashboard-heavy
- Current IA: `/ai-lab` → Dashboard (6+ sections stacked), `/ai-lab/playground`, `/ai-lab/training` (old), `/ai-lab/experiments` (launcher + overview), `/ai-lab/research` (workspace)
- Problem: Dashboard sections are stacked vertically — users scroll through unrelated content
- Missing: Clear primary workflow (Configure → Train → Analyze)
- Missing: Page-level state management, wizard flows, step-by-step guides

### Gap UX3: No loading states for real operations
- Training start has no loading/skeleton state
- Metric updates have no transition/animation
- Checkpoint save/load has no progress indicator

### Gap UX4: Error states are minimal
- If training fails (real training), no error recovery UI
- If localStorage is full, no warning
- If BPE tokenizer fails to load, no fallback

### Gap UX5: No success/completion ceremony
- Training completes → no celebration, no summary modal, no "next steps" suggestion
- Experiment finishes → static status change, no actionable follow-up

### Gap UX6: No empty states
- No experiments → blank page sections, no "Create your first experiment" CTA
- No training history → empty charts, no guidance

### Gap UX7: Navigation hierarchy unclear
- Dashboard has quick-nav to training/experiments/research
- But training page is old educational showcase
- Research page has its own training controls that are fake
- Experiments page creates records but doesn't train
- User can't tell which page to use for training

### Gap UX8: Mobile responsiveness
- Most AI Lab pages use `max-w-4xl` or `max-w-6xl` with `px-4`
- Training controls and live metrics grids likely break on mobile (< 640px)
- No mobile-first testing evident

### Gap UX9: i18n coverage
- `en.json` has only 2 matches for `research.|experiment.|training.|studio.`
- `zh-CN.json` has 0 matches for these key families
- Most text appears hardcoded in components
- The `studioAdapter.ts` references i18n keys that may not exist in locale files

---

## Section 9: Architecture Risks

### Risk 1: Three parallel training systems
1. **TrainingRuntime** (browser, FAKE metrics) — what UI actually calls
2. **ResearchExperimentRunner** (browser, REAL training, synchronous) — library only, never called from UI
3. **TrainingCampaign** (Node-only, REAL training, file-based) — CLI only, never called from browser

**Risk**: Maintaining three systems, one fake and two inaccessible from the primary user-facing path.

**Mitigation**: Phase 65 must unify on ONE browser training path: `ResearchExperimentRunner` via Web Worker.

### Risk 2: Adapter layer masks broken connections
- 7 adapters exist (`studioAdapter`, `liveTrainingAdapter`, `experimentLauncherAdapter`, `trainingAdapter`, `trainingVisualizationAdapter`, `historyAdapter`, `progressAdapter`)
- Adapters read from localStorage/ModelRegistry statically
- Adapters don't validate whether the data they transform came from real or fake training
- **Risk**: Adding more adapters without fixing the underlying data flow adds complexity without real value

### Risk 3: No end-to-end test of training flow
- No test that starts from UI config, runs real training, and checks output
- All tests are unit-level (component render, function output)
- **Risk**: Bugs in the UI→runtime connection are invisible until manual testing

### Risk 4: Memory pressure from synchronous training
- `TensorMiniMindModel` for "base" preset (~50M params) = ~200MB of Float32Array
- Running in main thread + React rendering = potential OOM for larger models
- **Risk**: Browser crash on training start with larger presets

---

## Section 10: Technical Debt Summary

| Item | Severity | Effort |
|------|----------|--------|
| `TrainingRuntime.generateStepMetrics()` Math.random() | 🔴 Critical | Medium — replace with real executor |
| Three training systems not unified | 🔴 Critical | Large — single Web Worker path |
| Hardcoded config in ResearchWorkspace.onStart | 🔴 Critical | Small — pass user selections |
| Old `TrainingPageClient` uses deprecated model | 🟠 High | Medium — rewrite with new infrastructure |
| No Web Worker infrastructure | 🟠 High | Medium — create worker + message protocol |
| No AbortSignal in Trainer | 🟠 High | Small — add signal parameter |
| GenerationEvaluator disconnected from UI | 🟠 High | Medium — add generation tab/section |
| Export functions disconnected from UI | 🟡 Medium | Small — add export buttons |
| Experiment comparison missing from UI | 🟡 Medium | Medium — create comparison view |
| i18n keys missing for research/studio/training | 🟡 Medium | Small — add locale entries |
| localStorage as sole persistence | 🟡 Medium | Large — requires API routes / IndexedDB |
| No loading/empty/error/success states | 🟡 Medium | Medium — add state boundaries |
| Adapter layer proliferation without data validation | 🟢 Low | Small — add validation to adapters |
| No mobile-responsive testing | 🟢 Low | Small — test and fix breakpoints |

---

## Section 11: Top 5 Priorities

### Priority 1: Replace FAKE TrainingRuntime with REAL Web Worker training
**Why**: This is THE critical path. Every "Start Training" button in the app produces fake data. Without fixing this, nothing else matters — all metrics, checkpoints, insights, and comparisons are based on lies.

**What**: Move `createInlineTrainingExecutor()` into a Web Worker, stream real metrics (loss, gradient norm, step) via postMessage to TrainingEventBus, remove `generateStepMetrics()`.

**Impact**: Fixes capabilities #6, #7 (real training + live metrics). Unblocks #8-12 (pause/resume/stop/checkpoint).

### Priority 2: Wire user configuration to real training
**Why**: Even if training becomes real, the UI currently ignores what the user selects and uses hardcoded values.

**What**: Pass `ExperimentLauncher` selections (model, recipe, dataset, seed) through to `ResearchWorkspace.onStart`. Build the `ResearchExperiment` from user input, not hardcoded constants. Validate configuration before starting.

**Impact**: Fixes capabilities #1-5 (create run, select model, select dataset, adjust hyperparameters, set seed).

### Priority 3: Add Web Worker with AbortSignal + checkpoint streaming
**Why**: Real training blocks the main thread. Trainer has no cancel mechanism. Checkpoints can't be saved.

**What**: Create `src/lib/minimind/training/TrainingWorker.ts` — wraps the real training pipeline, yields on each step, supports AbortSignal, streams checkpoints via postMessage. Add `AbortSignal` to `Trainer.train()`.

**Impact**: Fixes capabilities #8-12 (pause/resume/stop/checkpoint save/restore).

### Priority 4: Connect GenerationEvaluator + Export to UI
**Why**: User's primary question is "Did my model learn anything?" — generation before/after is the most intuitive proof. Export is needed for sharing and reproducibility.

**What**: Add generation testing panel to ResearchWorkspace. Run before-training generation, train, run after-training generation, display side-by-side. Add export buttons for JSON and Markdown reports.

**Impact**: Fixes capabilities #13, #17 (generation output, export).

### Priority 5: Create experiment comparison view
**Why**: Research needs comparison. Without it, each experiment is an island.

**What**: Side-by-side comparison of two experiments: config diff, loss curves overlay, generation output side-by-side, metric table with winner indicators.

**Impact**: Fixes capabilities #14, #15, #18 (compare runs, clone for ablation, understand why better).

---

## Roadmap: Phase 65 → Phase 69

### Phase 65: Real Training Wire-Up (THIS PHASE)
**Goal**: One click to start REAL training with REAL metrics
**User Value**: User can actually train a MiniMind model from the browser and see real loss decrease
**Files**:
- `src/lib/minimind/training/TrainingWorker.ts` (NEW — Web Worker)
- `src/lib/minimind/research/TrainingRuntime.ts` (REWRITE — replace fake with real)
- `src/components/ai-lab/research/ResearchWorkspace.tsx` (FIX — pass user config, connect real runtime)
- `src/components/ai-lab/experiments/ExperimentLauncher.tsx` (FIX — wire user selections)
- `src/lib/minimind/training/Trainer.ts` (MODIFY — add AbortSignal)
- `src/components/ai-lab/training/` (NEW — replace old TrainingPageClient with new Studio)
**Architecture Impact**: Unifies training path into single Web Worker → EventBus → UI pipeline
**UI Impact**: Training page becomes Studio, ResearchWorkspace Start button does real training, launcher selections are respected
**Real Functionality**: `createInlineTrainingExecutor()` via Web Worker, real loss/gradient metrics, AbortSignal-based stop
**Tests**: Unit tests for Worker message protocol, integration test for full UI→training→metrics flow
**Acceptance Criteria**:
1. User clicks "Start Training" → real loss values decrease (not Math.random())
2. User can select model preset (tiny/small/base) and training actually uses it
3. User can select recipe and training actually uses those hyperparameters
4. User can set seed and get deterministic results
5. User can stop training mid-epoch
6. `npm run build` passes

### Phase 66: Training Controls + Checkpoint
**Goal**: Full lifecycle control: pause, resume, stop, save checkpoint, restore from checkpoint
**User Value**: User can manage long training runs, recover from interruptions
**Files**:
- `src/lib/minimind/training/CheckpointManager.ts` (NEW — IndexedDB checkpoint persistence)
- `src/components/ai-lab/research/CheckpointPanel.tsx` (REWRITE — real checkpoint save/load/restore)
- `src/components/ai-lab/research/LiveTrainingPanel.tsx` (REWRITE — real control buttons)
- `src/lib/minimind/training/Trainer.ts` (MODIFY — checkpoint streaming via AbortSignal)
**Architecture Impact**: IndexedDB for checkpoint persistence (larger than localStorage)
**UI Impact**: Real checkpoint panel with save/restore, working pause/resume/stop, progress bar
**Real Functionality**: Save model weights mid-training, restore exact state, continue training
**Tests**: Checkpoint round-trip test, pause/resume determinism test
**Acceptance Criteria**:
1. User can pause training, metrics stop updating
2. User can resume from exact pause point, training is deterministic
3. User can save checkpoint at any point
4. User can restore from saved checkpoint and continue
5. Checkpoint includes model weights, optimizer state, scheduler state, RNG seed
6. `npm run build` passes

### Phase 67: Generation + Evaluation + Export
**Goal**: User can test model generation, compare before/after, and export results
**User Value**: User sees tangible proof that training worked, can share results
**Files**:
- `src/components/ai-lab/research/GenerationPanel.tsx` (NEW — generation before/after)
- `src/components/ai-lab/research/ExportPanel.tsx` (NEW — JSON/Markdown export)
- `src/components/ai-lab/experiments/ExperimentComparePage.tsx` (NEW — side-by-side comparison)
- `src/lib/ai-lab/adapters/generationAdapter.ts` (NEW)
**Architecture Impact**: Generation runs in same Web Worker as training (model already loaded)
**UI Impact**: Generation tab shows before→after text samples, export button downloads reports, comparison view
**Real Functionality**: Real autoregressive text generation, side-by-side comparison, JSON/Markdown export
**Tests**: Generation determinism test, export round-trip test
**Acceptance Criteria**:
1. User can generate text before training and see raw output
2. After training, same prompts produce different (better) output
3. Generation comparison shows side-by-side with quality metrics
4. User can export experiment as JSON (round-trip valid)
5. User can export experiment as Markdown report
6. User can compare two experiments side-by-side
7. `npm run build` passes

### Phase 68: Research Workflow (Ablation + Benchmark + Reproducibility)
**Goal**: Complete research workflow from hypothesis to conclusion
**User Value**: User can run systematic experiments, prove/disprove hypotheses
**Files**:
- `src/components/ai-lab/research/AblationWizard.tsx` (NEW — guided ablation creation)
- `src/components/ai-lab/research/BenchmarkLauncher.tsx` (NEW — run benchmark suites)
- `src/components/ai-lab/research/ReproducibilityPanel.tsx` (NEW — verify/reproduce)
- `src/components/ai-lab/research/ResearchReportPanel.tsx` (NEW — full research report)
**Architecture Impact**: Benchmark suite runs in Web Worker queue
**UI Impact**: Ablation wizard, benchmark launcher, reproducibility badge, research report
**Real Functionality**: Hyperparameter sweep, controlled variable isolation, reproducibility verification
**Tests**: Ablation correctness test, benchmark suite validation
**Acceptance Criteria**:
1. User can clone experiment and change one variable (ablation)
2. User can run a benchmark suite (e.g., LR sweep: [0.001, 0.003, 0.01])
3. User can verify reproducibility by re-running with same config and seed
4. ReproducibilityCertificate shows exact match or diff
5. Full research report includes: config, metrics, generation samples, conclusions
6. `npm run build` passes

### Phase 69: UX Polish + i18n + Mobile + Accessibility
**Goal**: Production-quality product experience
**User Value**: Professional, responsive, accessible research studio
**Files**:
- `src/lib/i18n/locales/en.json` (ADD — all research/studio/training keys)
- `src/lib/i18n/locales/zh-CN.json` (ADD — all Chinese translations)
- All AI Lab components (MODIFY — replace hardcoded strings with i18n)
- `src/components/ai-lab/research/` (POLISH — loading/empty/error/success states)
**Architecture Impact**: None (pure presentation layer)
**UI Impact**: Complete i18n coverage, responsive mobile layout, loading skeletons, empty states, error recovery, celebration animations, accessibility labels
**Real Functionality**: No new functionality, just presentation quality
**Tests**: i18n key coverage check, mobile screenshot tests
**Acceptance Criteria**:
1. All UI text is i18n-keyed (both en and zh-CN)
2. Mobile viewport (< 640px) all pages functional
3. Loading states for all async operations
4. Empty states with CTAs for all empty data views
5. Error states with recovery actions for all failure modes
6. Success/completion animations for training milestones
7. Keyboard navigation + screen reader labels
8. `npm run build` passes with zero warnings
9. Lighthouse score ≥ 90 for all AI Lab pages

---

## THE SINGLE MOST IMPORTANT NEXT TASK

### Replace `TrainingRuntime.generateStepMetrics()` with real Web Worker training

**Why this, and why now:**

1. **It's the source of all lies.** Every metric, every insight, every "experiment result" flowing through the UI originates from `Math.random()` in `generateStepMetrics()`. Until this is fixed, the entire MiniMind Research Studio is a mockup dressed as a product. All 19 user capabilities are blocked on this one function.

2. **The real infrastructure already exists.** `createInlineTrainingExecutor()` in `ResearchExperimentRunner.ts` already builds a complete, working training pipeline with real TensorMiniMindModel, AdamW, CosineScheduler, BPETokenizer, and Trainer. We are NOT building new ML infrastructure — just connecting what's already built.

3. **It's the rippling dependency.** Fixing this unblocks:
   - Real live metrics (current: fake loss curves)
   - Real checkpoint save (current: fake checkpoint string)
   - Real pause/resume (current: fake setTimeout pause)
   - Real training completion (current: fake "completed" status)
   - Real generation evaluation (current: disconnected)
   - Real experiment comparison (current: comparing fake data)
   - Real research insights (current: analyzing fake loss curves)

4. **It's a measured change (~200 lines).** Move `createInlineTrainingExecutor()` into a Web Worker file, post metrics back via postMessage, wire TrainingEventBus to forward events to UI. The existing `TrainingRuntime` lifecycle management (start/pause/resume/stop) is well-designed — keep its interface, replace its guts.

5. **It validates the architecture.** If we can make this work, every other Phase becomes connecting real UI to real data (known patterns). If it doesn't work (e.g., Web Worker performance is unacceptable), we need to pivot to API routes + Node.js training, which fundamentally changes the architecture.

**Risk**: Web Worker training for ~600K param model may still be slow (50-100ms per step). Mitigation: start with "tiny" preset only, limit to ~100 steps for iteration speed. Larger models go to Phase 66+.

**Estimated effort**: 3-4 hours for core implementation + testing. The Web Worker API, postMessage protocol, and TrainingEventBus integration are all well-understood patterns.

---

## Audit Conclusion

**MiniMind has a library-level PhD but a product-level kindergarten.**

The underlying ML infrastructure is genuine and impressive — a full Transformer training pipeline with optimizer, scheduler, tokenizer, checkpointing, fingerprinting, benchmarking, and reproducibility tools, all written from scratch in TypeScript. The research infrastructure (event bus, state machine, experiment store, runner, copilot, benchmark suite) is complete and well-architected.

But the user-facing product is a decorated mockup. Every "Start Training" button tells a lie. Every loss curve is random noise. Every "experiment" is a database entry with no computation behind it.

The fix is NOT to build more UI or more library code. The fix is a single, focused bridge: connect `createInlineTrainingExecutor()` (real) into the `TrainingRuntime` lifecycle (well-designed) via a Web Worker (needed for non-blocking execution). Once real data flows through the system, all the existing UI, adapter, and research infrastructure springs to life.

**Preserve. Connect. Don't add.**
