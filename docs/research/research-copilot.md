# MiniMind Research Copilot

**Engine:** MiniMind Research Copilot v1.0 (Phase 59)
**Status:** Deterministic research-analysis engine — not an LLM.

---

## Architecture

```
TrainingMetricsStore (localStorage)
        ↓
TrainingAnalyzer (pure functions)
        ↓
ResearchInsightEngine (orchestration)
        ↓
RecommendationEngine (evidence-backed)
        ↓
ResearchReport (JSON + Markdown)
        ↓
researchCopilotAdapter (pure transforms)
        ↓
ResearchCopilot UI (React component)
```

**Dependency rule:** Core → Model → Training → Research → Adapter → UI

No reverse dependencies. The copilot does NOT:
- Directly access UI components
- Modify Tensor, Transformer, MiniMindModel, Trainer, or DataLoader
- Call any external AI/LLM API
- Generate fake or fabricated metrics

---

## Modules

### ResearchInsightEngine

`src/lib/minimind/research/copilot/ResearchInsightEngine.ts`

Analyzes a `TrainingRunRecord` and produces `ResearchInsights`:

| Dimension | Description |
|---|---|
| convergence | Is loss converging or plateauing? |
| divergence | Is loss increasing (training failing)? |
| stability | Is the loss curve smooth or erratic? |
| overfitting | Is there a train/eval gap? |
| optimization | Is the optimizer well-tuned? |
| efficiency | Is throughput adequate? |
| generalization | Is the model likely to generalize? |
| reproducibility | Can results be reproduced? |

Each insight contains:
- `type` — analysis dimension
- `severity` — `"info"` | `"success"` | `"warning"` | `"critical"`
- `title` — one-line summary
- `description` — human-readable explanation
- `evidence` — numerical evidence (required, must be finite)
- `confidence` — 0–1 score

**Detectors implemented:**
- `detectUnderfitting()` — loss barely decreasing
- `detectOverfittingIssue()` — train/eval gap growing
- `detectDivergenceIssue()` — loss increasing
- `detectLossSpikeIssue()` — sudden loss spikes
- `detectLearningRateIssue()` — LR too high/low/decaying too fast
- `detectGradientExplosion()` — multiple large spikes
- `detectLowThroughput()` — tokens/sec below threshold
- `detectTrainingInstability()` — high loss variance
- `detectInsufficientTraining()` — loss still improving

Orchestrates existing `TrainingAnalyzer` primitives — no duplicated mathematical logic.

### RecommendationEngine

`src/lib/minimind/research/copilot/RecommendationEngine.ts`

Maps `ResearchInsights` + config context → `ResearchRecommendation[]`.

**Categories:** `optimization` | `data` | `model` | `training` | `regularization` | `performance`

**Priorities:** `high` | `medium` | `low`

Each recommendation includes:
- `rationale` — why this is recommended
- `evidence` — numerical support
- `suggestedChanges` — concrete, actionable steps

**RECOMMENDATIONS ARE ADVISORY ONLY.** The engine never automatically modifies training configurations.

**Example rule chain:**
- Slow loss decrease + stable → "increase training epochs"
- Train loss ↓ + eval loss ↑ → "reduce training duration or increase regularization"
- Gradient norm spikes → "enable or tighten gradient clipping"
- Low throughput → "reduce sequence length or batch size"
- LR decays too fast → "extend scheduler warmup or increase minimum LR"

### ComparisonInsightEngine

`src/lib/minimind/research/copilot/ComparisonInsightEngine.ts`

Compares multiple `ExperimentRecord` objects across dimensions:

- Best loss
- Perplexity
- Training speed (tokens/sec)
- Loss reduction
- Parameter efficiency

**Output:** per-metric winners + trade-offs.

Does NOT collapse everything into one arbitrary score. Each metric has its own winner, and trade-offs are surfaced explicitly.

### ResearchReport

`src/lib/minimind/research/copilot/ResearchReport.ts`

Generates structured reports in two formats:

1. **JSON** — machine-readable, full `ResearchReportData`
2. **Markdown** — human-readable, suitable for `docs/research/reports/`

Report sections:
- Experiment identity
- Training summary
- Findings (critical, warning, success, info)
- Problems detected
- Recommendations (high, medium, low)
- Numerical evidence
- Reproducibility info
- Comparison (optional)

### researchCopilotAdapter

`src/lib/ai-lab/adapters/researchCopilotAdapter.ts`

Pure transformation functions for the UI layer:
- `getCopilotAnalysis(recordId)` — full analysis
- `getLatestCopilotAnalysis()` — latest run analysis
- `getCriticalFindings(analysis)` — filter critical/warning
- `getRecommendations(analysis)` — all recommendations
- `getExperimentComparison(idA, idB)` — pairwise comparison
- `getComparisonOfCompleted()` — all completed comparison
- `generateJSONReport(recordId)` — JSON export
- `generateMarkdownReport(recordId)` — Markdown export
- `getReportSections(recordId)` — incremental UI sections

### ResearchCopilot UI

`src/components/ai-lab/research/ResearchCopilot.tsx`

Sections:
1. **Overall Status** — Stable / Converging / Needs Attention
2. **Key Findings** — expandable insights with evidence
3. **Recommendations** — prioritized, expandable with rationale
4. **Experiment Comparison** — metric winners + trade-offs
5. **Report Generation** — export JSON / Markdown

Design: Cosmic glass UI matching HOU Universe aesthetic.

---

## Evidence Model

Every insight and recommendation contains numerical evidence. Evidence values are:

- **Derived** from real training data (loss history, LR history, throughput history)
- **Finite** — NaN/Infinity are filtered out
- **Deterministic** — same input always produces the same evidence
- **Not fabricated** — no placeholder values, no AI-generated metrics

Example evidence for a convergence insight:
```json
{
  "initialLoss": 5.74,
  "finalLoss": 2.23,
  "bestLoss": 2.23,
  "reductionPercent": 61.15,
  "convergenceStep": 60,
  "plateauFraction": 0.25
}
```

---

## Comparison Model

Comparisons are multi-dimensional:
- Each metric independently determines a winner
- Trade-offs between experiments are surfaced
- No single "overall winner" — the user decides based on their priorities

Example output:
```
Winner by Best Loss: Experiment A (2.23 vs 2.50)
Winner by Training Speed: Experiment B (500 vs 250 tok/s)
Trade-off: A achieves 12% lower loss, B trains 2× faster
```

---

## Limitations

This is a **deterministic research-analysis engine**, intentionally limited to:

1. **No LLM/ChatGPT integration** — does not call any external AI API
2. **No fake conclusions** — all findings are derived from real metrics
3. **No auto-config modification** — recommendations are advisory only
4. **No arbitrary scoring** — each metric is analyzed independently
5. **Data-dependent** — quality of insights depends on quantity and quality of training data
6. **Heuristic thresholds** — some detectors use reasonable but tunable thresholds
7. **No causal analysis** — identifies correlations in metrics, not root causes
8. **Browser-only data** — reads from localStorage, not the filesystem

---

## Examples

### Basic Usage
```typescript
import {
  ResearchInsightEngine,
  RecommendationEngine,
  ComparisonInsightEngine,
  ResearchReport,
} from "@/lib/minimind/research/copilot";

const insightEngine = new ResearchInsightEngine();
const insights = insightEngine.analyze(trainingRunRecord);
console.log(insights.summary);
// { total: 12, critical: 0, warning: 2, success: 3, info: 7 }

const recEngine = new RecommendationEngine();
const recs = recEngine.recommend(insights, record.trainingConfig, record.modelConfig);
console.log(recs.summary);
// { total: 3, high: 1, medium: 1, low: 1 }
```

### Report Generation
```typescript
const reportEngine = new ResearchReport();
const jsonReport = reportEngine.generateJSON({ ... });
const markdownReport = reportEngine.generateMarkdown({ ... });
```

### Experiment Comparison
```typescript
const compEngine = new ComparisonInsightEngine();
const result = compEngine.compare([experimentA, experimentB]);
// result.winners[0] → { metric: "bestLoss", winnerId: "exp-a", ... }
// result.tradeoffs → [{ advantage: "Lower Loss", detail: "..." }]
```

---

## Testing

```bash
npx tsx src/lib/minimind/research/copilot/__tests__/phase59-copilot.test.ts
```

20 test groups, 150+ assertions covering convergence, divergence, spikes, overfitting, gradient explosion, throughput, recommendations, evidence, comparisons, reports, adapters, edge cases, determinism, and regression compatibility.
