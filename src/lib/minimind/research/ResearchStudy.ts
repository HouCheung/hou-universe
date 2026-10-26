// ============================================================
// MiniMind — research/ResearchStudy.ts
// ============================================================
// Phase 63: Formal research study definition.
//
// A ResearchStudy groups a baseline experiment with one or more
// variants to answer a specific research question. It encodes the
// full experimental design: what question we're asking, what
// hypothesis we're testing, what variables we control, and what
// the independent variable is.
//
// This is the top-level artifact for reproducible research.
// A study produces a ResearchStudyResult containing all raw data,
// statistical summaries, and a structured conclusion.
//
// Design principles:
//   - Self-contained — all config needed to reproduce the study
//   - Serializable — fully JSON-safe
//   - Browser-safe — no fs/path dependencies
//   - Reuses existing types — ResearchExperiment, ResearchBenchmarkResult
// ============================================================

import type { ResearchExperiment } from "./ResearchExperiment";
import type { BenchmarkMetricStats } from "./benchmark/ResearchBenchmarkRunner";

// ============================================================
// Study Conclusion
// ============================================================

/**
 * Possible outcomes of a research study hypothesis test.
 *
 *   - "supported"     — data strongly supports the hypothesis
 *   - "rejected"      — data contradicts the hypothesis
 *   - "inconclusive"  — data neither supports nor rejects
 *   - "nuanced"       — partial support with caveats
 */
export type StudyConclusionVerdict =
  | "supported"
  | "rejected"
  | "inconclusive"
  | "nuanced";

/**
 * A structured research conclusion for a study.
 */
export interface StudyConclusion {
  /** The verdict on the hypothesis */
  verdict: StudyConclusionVerdict;

  /** One-sentence summary of the finding */
  summary: string;

  /** Detailed explanation of the evidence */
  detail: string;

  /** Key supporting metrics */
  evidence: Record<string, number>;

  /** Confidence in the conclusion (0-1) */
  confidence: number;
}

// ============================================================
// Study Definition
// ============================================================

/**
 * A formal research study definition.
 *
 * Groups a baseline and variant experiment to test a specific
 * hypothesis under controlled conditions.
 */
export interface ResearchStudy {
  /** Unique study identifier */
  id: string;

  /** Human-readable study name */
  name: string;

  /** The research question being asked */
  researchQuestion: string;

  /** The hypothesis being tested */
  hypothesis: string;

  /** The baseline experiment definition */
  baseline: ResearchExperiment;

  /** The variant experiment definition(s) */
  variants: ResearchExperiment[];

  /** Variables held constant across all experiments */
  controlledVariables: string[];

  /** The single variable being manipulated */
  independentVariable: {
    /** Name of the variable (e.g. "gradientClipNorm") */
    name: string;
    /** Value in the baseline */
    baselineValue: string;
    /** Value in the variant */
    variantValue: string;
  };

  /** Metrics to collect and compare */
  metrics: StudyMetricSpec[];

  /** Number of runs per experiment for reproducibility */
  numRuns: number;

  /** Tags for categorization */
  tags: string[];

  /** When the study was created */
  createdAt: number;
}

/**
 * Specification for a metric to collect in the study.
 */
export interface StudyMetricSpec {
  /** Metric name */
  name: string;
  /** Human-readable label */
  label: string;
  /** Which category this metric belongs to */
  category: "training" | "stability" | "efficiency" | "model" | "generation";
  /** Unit (e.g. "tokens/s", "ms", "count") */
  unit?: string;
  /** Whether lower is better (default: true) */
  lowerIsBetter?: boolean;
}

// ============================================================
// Study Result
// ============================================================

/**
 * Statistical summary for a single metric across runs.
 */
export interface StudyMetricSummary {
  /** Metric name */
  metric: string;
  /** Arithmetic mean */
  mean: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Sample variance */
  variance: number;
  /** Standard deviation */
  std: number;
  /** Number of samples */
  sampleSize: number;
  /** Individual run values */
  values: number[];
  /** Warning if sample size is too small */
  insufficientSampleWarning?: string;
}

/**
 * Per-experiment results within a study.
 */
export interface StudyExperimentResult {
  /** Experiment ID */
  experimentId: string;
  /** Experiment name */
  name: string;
  /** Whether this is the baseline */
  isBaseline: boolean;
  /** Per-run training results */
  runs: StudyRunResult[];
  /** Aggregated metrics */
  metrics: Record<string, StudyMetricSummary>;
}

/**
 * A single training run result within the study.
 */
export interface StudyRunResult {
  /** Run index (0-based) */
  runIndex: number;
  /** Seed used */
  seed: number;
  /** Initial loss */
  initialLoss: number;
  /** Final loss */
  finalLoss: number;
  /** Best (lowest) loss */
  bestLoss: number;
  /** Perplexity */
  perplexity: number;
  /** Loss reduction from initial */
  lossReduction: number;
  /** Tokens per second */
  tokensPerSecond: number;
  /** Duration in ms */
  wallClockMs: number;
  /** Mean gradient norm across all steps */
  meanGradientNorm: number;
  /** Maximum gradient norm observed */
  maxGradientNorm: number;
  /** Variance of gradient norms */
  gradientNormVariance: number;
  /** Whether divergence was detected */
  divergenceDetected: boolean;
  /** Whether instability was detected */
  instabilityDetected: boolean;
  /** Parameter count */
  parameterCount: number;
  /** Generation: before log-probability */
  generationBeforeLogProb?: number;
  /** Generation: after log-probability */
  generationAfterLogProb?: number;
  /** Generation: before perplexity */
  generationBeforePPL?: number;
  /** Generation: after perplexity */
  generationAfterPPL?: number;
}

/**
 * Complete result of a research study.
 */
export interface ResearchStudyResult {
  /** The study definition */
  study: ResearchStudy;

  /** Baseline results */
  baseline: StudyExperimentResult;

  /** Variant results */
  variants: StudyExperimentResult[];

  /** Comparison: baseline vs variant for each metric */
  comparison: StudyComparison;

  /** Structured conclusion */
  conclusion: StudyConclusion;

  /** When the study was executed */
  executedAt: number;

  /** Total execution duration in ms */
  totalDurationMs: number;
}

/**
 * Comparison between baseline and variant across metrics.
 */
export interface StudyComparison {
  /** Per-metric comparisons */
  metrics: Record<string, StudyMetricComparison>;

  /** Human-readable summary of the comparison */
  summary: string;
}

/**
 * Comparison of a single metric between baseline and variant.
 */
export interface StudyMetricComparison {
  /** Metric name */
  metric: string;
  /** Baseline aggregate */
  baseline: StudyMetricSummary;
  /** Variant aggregate */
  variant: StudyMetricSummary;
  /** Absolute difference (variant - baseline) */
  absoluteDifference: number;
  /** Relative change as fraction (variant - baseline) / |baseline| */
  relativeChange: number;
  /** Direction of change */
  direction: "increased" | "decreased" | "unchanged";
  /** Whether the difference is meaningful (> 1% relative change) */
  isMeaningful: boolean;
}

// ============================================================
// Factory
// ============================================================

/**
 * Generate a unique study ID.
 */
export function generateStudyId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `study-${ts}-${rand}`;
}

/**
 * Default metrics for a gradient clipping study.
 */
export const GRADIENT_CLIPPING_METRICS: StudyMetricSpec[] = [
  // Training
  { name: "finalLoss", label: "Final Loss", category: "training", lowerIsBetter: true },
  { name: "bestLoss", label: "Best Loss", category: "training", lowerIsBetter: true },
  { name: "perplexity", label: "Perplexity", category: "training", lowerIsBetter: true },
  { name: "lossReduction", label: "Loss Reduction", category: "training", lowerIsBetter: false },
  // Stability
  { name: "meanGradientNorm", label: "Mean Gradient Norm", category: "stability", lowerIsBetter: true },
  { name: "maxGradientNorm", label: "Max Gradient Norm", category: "stability", lowerIsBetter: true },
  { name: "gradientNormVariance", label: "Gradient Norm Variance", category: "stability", lowerIsBetter: true },
  { name: "divergenceDetected", label: "Divergence Detected", category: "stability", lowerIsBetter: true },
  { name: "instabilityDetected", label: "Instability Detected", category: "stability", lowerIsBetter: true },
  // Efficiency
  { name: "tokensPerSecond", label: "Tokens/s", category: "efficiency", unit: "tokens/s", lowerIsBetter: false },
  { name: "wallClockMs", label: "Wall Clock", category: "efficiency", unit: "ms", lowerIsBetter: true },
  // Model
  { name: "parameterCount", label: "Parameters", category: "model", lowerIsBetter: false },
];

/**
 * Create a new ResearchStudy with defaults.
 */
export function createResearchStudy(params: {
  name: string;
  researchQuestion: string;
  hypothesis: string;
  baseline: ResearchExperiment;
  variants: ResearchExperiment[];
  controlledVariables: string[];
  independentVariable: ResearchStudy["independentVariable"];
  metrics?: StudyMetricSpec[];
  numRuns?: number;
  tags?: string[];
  id?: string;
}): ResearchStudy {
  return {
    id: params.id ?? generateStudyId(),
    name: params.name,
    researchQuestion: params.researchQuestion,
    hypothesis: params.hypothesis,
    baseline: params.baseline,
    variants: params.variants,
    controlledVariables: params.controlledVariables,
    independentVariable: params.independentVariable,
    metrics: params.metrics ?? GRADIENT_CLIPPING_METRICS,
    numRuns: params.numRuns ?? 2,
    tags: params.tags ?? [],
    createdAt: Date.now(),
  };
}

// ============================================================
// Statistical Helpers
// ============================================================

/**
 * Compute statistical summary from an array of values.
 *
 * Returns mean, min, max, variance, std, and individual values.
 * Marks insufficientSample if sampleSize < 2.
 */
export function computeMetricSummary(
  metric: string,
  values: number[],
): StudyMetricSummary {
  const sampleSize = values.length;

  if (sampleSize === 0) {
    return {
      metric,
      mean: 0,
      min: 0,
      max: 0,
      variance: 0,
      std: 0,
      sampleSize: 0,
      values: [],
      insufficientSampleWarning: "No data collected",
    };
  }

  const mean = values.reduce((a, b) => a + b, 0) / sampleSize;
  const min = Math.min(...values);
  const max = Math.max(...values);

  let variance = 0;
  if (sampleSize > 1) {
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    variance = squaredDiffs.reduce((a, b) => a + b, 0) / (sampleSize - 1);
  }

  const std = Math.sqrt(variance);

  const summary: StudyMetricSummary = {
    metric,
    mean,
    min,
    max,
    variance,
    std,
    sampleSize,
    values: [...values],
  };

  if (sampleSize < 2) {
    summary.insufficientSampleWarning =
      "insufficient sample size — at least 2 runs required for statistical analysis";
  }

  return summary;
}

/**
 * Compare two metric summaries (baseline vs variant).
 */
export function compareMetricSummaries(
  metric: string,
  baseline: StudyMetricSummary,
  variant: StudyMetricSummary,
): StudyMetricComparison {
  const absoluteDifference = variant.mean - baseline.mean;
  const relativeChange =
    baseline.mean !== 0
      ? absoluteDifference / Math.abs(baseline.mean)
      : 0;

  let direction: StudyMetricComparison["direction"];
  if (Math.abs(relativeChange) < 0.005) {
    direction = "unchanged";
  } else if (absoluteDifference > 0) {
    direction = "increased";
  } else {
    direction = "decreased";
  }

  const isMeaningful = Math.abs(relativeChange) > 0.01;

  return {
    metric,
    baseline,
    variant,
    absoluteDifference,
    relativeChange,
    direction,
    isMeaningful,
  };
}

/**
 * Build a human-readable comparison summary.
 */
export function buildComparisonSummary(
  comparisons: Record<string, StudyMetricComparison>,
): string {
  const parts: string[] = [];

  for (const [metric, comp] of Object.entries(comparisons)) {
    if (!comp.isMeaningful) continue;

    const pct = (Math.abs(comp.relativeChange) * 100).toFixed(1);
    const dir = comp.direction === "increased"
      ? "increased"
      : comp.direction === "decreased"
        ? "decreased"
        : "unchanged";

    if (dir === "unchanged") continue;

    parts.push(`${metric} ${dir} by ${pct}%`);
  }

  if (parts.length === 0) {
    return "No meaningful differences detected between baseline and variant.";
  }

  return parts.join("; ") + ".";
}

// ============================================================
// Serialization
// ============================================================

/**
 * Serialize a ResearchStudy to JSON.
 */
export function serializeStudy(study: ResearchStudy): string {
  return JSON.stringify(study, null, 2);
}

/**
 * Deserialize a ResearchStudy from JSON.
 */
export function deserializeStudy(json: string): ResearchStudy {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("ResearchStudy: invalid JSON");
  }
  const s = parsed as Record<string, unknown>;
  if (typeof s.id !== "string") throw new Error("ResearchStudy: missing id");
  if (typeof s.name !== "string") throw new Error("ResearchStudy: missing name");
  if (typeof s.researchQuestion !== "string") throw new Error("ResearchStudy: missing researchQuestion");
  if (typeof s.hypothesis !== "string") throw new Error("ResearchStudy: missing hypothesis");
  return parsed as ResearchStudy;
}

/**
 * Serialize a ResearchStudyResult to JSON.
 */
export function serializeStudyResult(result: ResearchStudyResult): string {
  return JSON.stringify(result, null, 2);
}
