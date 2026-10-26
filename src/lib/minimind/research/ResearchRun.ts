// ============================================================
// MiniMind — research/ResearchRun.ts
// ============================================================
// Phase 60: Research run record entity.
//
// A ResearchRun is a single execution of a ResearchExperiment.
// One experiment can have many runs (different seeds, config
// variants, or reproducibility verification).
//
// Distinction:
//   ResearchExperiment = WHAT to run (plan/definition)
//   ResearchRun        = WHAT happened (execution record)
//
// Design principles:
//   - Fully JSON serializable
//   - No UI dependencies — pure data, no React, no localStorage
//   - No Node.js dependencies — browser-safe
//   - Immutable after completion — results are final
// ============================================================

// ============================================================
// Run Status
// ============================================================

/**
 * Lifecycle status of a research run.
 *
 *   - "pending"    — created but not yet started
 *   - "running"    — actively executing
 *   - "completed"  — finished successfully
 *   - "failed"     — terminated with error
 *   - "cancelled"  — cancelled by user before completion
 */
export type ResearchRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ============================================================
// Generation Result (before/after)
// ============================================================

/**
 * A single generation result from the before/after evaluation.
 */
export interface RunGenerationResult {
  /** The prompt used */
  prompt: string;
  /** Generated text */
  generatedText: string;
  /** Perplexity of the generation (if available) */
  perplexity?: number;
}

// ============================================================
// Run Analysis Summary
// ============================================================

/**
 * Key analysis results embedded in the run record.
 */
export interface RunAnalysis {
  /** Whether training converged */
  converged: boolean;
  /** Loss reduction as a percentage */
  lossReductionPercent: number;
  /** Stability score (0-1) */
  stabilityScore: number;
  /** Number of critical findings */
  criticalFindings: number;
  /** Number of warning findings */
  warningFindings: number;
  /** Top-level summary of findings */
  summary: string;
}

// ============================================================
// Reproducibility Embedded Result
// ============================================================

/**
 * Reproducibility check result (embedded in run record).
 */
export interface RunReproducibility {
  /** Whether the run was reproduced successfully */
  verified: boolean;
  /** Whether loss matched between runs */
  lossMatch: boolean;
  /** Whether checkpoints matched between runs */
  checkpointMatch: boolean;
  /** Whether generations matched between runs */
  generationMatch: boolean;
  /** Maximum loss difference between runs */
  maxLossDiff: number;
}

// ============================================================
// Research Run
// ============================================================

/**
 * A single execution (run) of a research experiment.
 *
 * Contains all results from one complete training execution:
 * metrics, generation outputs, analysis, reproducibility check,
 * and references to checkpoints and reports.
 *
 * Usage:
 *   const run = createResearchRun("exp-abc123", 42);
 *   // ... run training ...
 *   const completed = completeResearchRun(run, {
 *     initialLoss: 5.2,
 *     finalLoss: 1.3,
 *     bestLoss: 1.1,
 *     perplexity: 3.0,
 *     totalSteps: 500,
 *     totalTokens: 256000,
 *     tokensPerSecond: 1200,
 *     totalEpochs: 5,
 *   });
 */
export interface ResearchRun {
  /** Unique run identifier */
  runId: string;

  /** The experiment this run belongs to */
  experimentId: string;

  /** Unix timestamp (ms) when the run was created */
  startedAt: number;

  /** Unix timestamp (ms) when the run completed (0 if not completed) */
  completedAt: number;

  /** Current lifecycle status */
  status: ResearchRunStatus;

  /** Random seed used for this run */
  seed: number;

  /** ── Training Metrics ── */

  /** Loss before first training step */
  initialLoss: number;

  /** Loss after final training step */
  finalLoss: number;

  /** Best (lowest) loss observed during training */
  bestLoss: number;

  /** Final perplexity = exp(bestLoss) */
  perplexity: number;

  /** Tokens processed per second */
  tokensPerSecond: number;

  /** Total tokens processed */
  totalTokens: number;

  /** Total optimizer steps */
  totalSteps: number;

  /** Total epochs */
  totalEpochs: number;

  /** Training duration in milliseconds */
  durationMs: number;

  /** ── Checkpoint ── */

  /** Path or identifier for the saved checkpoint */
  checkpointId: string | undefined;

  /** ── Generation ── */

  /** Generation outputs before training */
  generationBefore: RunGenerationResult[];

  /** Generation outputs after training */
  generationAfter: RunGenerationResult[];

  /** ── Analysis ── */

  /** Embedded analysis results (null if not yet analyzed) */
  analysis: RunAnalysis | null;

  /** ── Reproducibility ── */

  /** Embedded reproducibility result (null if not checked) */
  reproducibility: RunReproducibility | null;

  /** ── Report ── */

  /** Reference to generated report (null if not yet generated) */
  reportId: string | undefined;

  /** ── Error ── */

  /** Error message if status is "failed" */
  errorMessage: string | undefined;
}

// ============================================================
// Factory
// ============================================================

/**
 * Generate a unique run ID.
 *
 * Format: "run-{timestamp}-{random}"
 */
export function generateRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${ts}-${rand}`;
}

/**
 * Create a new ResearchRun in "pending" status.
 *
 * @param experimentId — the experiment this run belongs to
 * @param seed — random seed for this run
 * @param runId — optional run ID (generated if not provided)
 * @returns a new ResearchRun with all fields initialized
 */
export function createResearchRun(
  experimentId: string,
  seed: number,
  runId?: string
): ResearchRun {
  const now = Date.now();

  return {
    runId: runId ?? generateRunId(),
    experimentId,
    startedAt: now,
    completedAt: 0,
    status: "pending",
    seed,
    initialLoss: Infinity,
    finalLoss: Infinity,
    bestLoss: Infinity,
    perplexity: NaN,
    tokensPerSecond: 0,
    totalTokens: 0,
    totalSteps: 0,
    totalEpochs: 0,
    durationMs: 0,
    checkpointId: undefined,
    generationBefore: [],
    generationAfter: [],
    analysis: null,
    reproducibility: null,
    reportId: undefined,
    errorMessage: undefined,
  };
}

// ============================================================
// Lifecycle Transitions
// ============================================================

/**
 * Mark a run as started (transition pending → running).
 */
export function startResearchRun(run: ResearchRun): ResearchRun {
  if (run.status !== "pending") {
    throw new Error(
      `ResearchRun: cannot start run in "${run.status}" status. Must be "pending".`
    );
  }

  return {
    ...run,
    status: "running",
    startedAt: Date.now(),
  };
}

/**
 * Complete a run with training results (transition running → completed).
 *
 * @param run — the running research run
 * @param results — training results to record
 * @returns a new completed ResearchRun
 */
export function completeResearchRun(
  run: ResearchRun,
  results: {
    initialLoss: number;
    finalLoss: number;
    bestLoss: number;
    perplexity: number;
    tokensPerSecond: number;
    totalTokens: number;
    totalSteps: number;
    totalEpochs: number;
    durationMs: number;
    checkpointId?: string;
    generationBefore?: RunGenerationResult[];
    generationAfter?: RunGenerationResult[];
    analysis?: RunAnalysis;
    reproducibility?: RunReproducibility;
    reportId?: string;
  }
): ResearchRun {
  if (run.status !== "running") {
    throw new Error(
      `ResearchRun: cannot complete run in "${run.status}" status. Must be "running".`
    );
  }

  return {
    ...run,
    status: "completed",
    completedAt: Date.now(),
    initialLoss: results.initialLoss,
    finalLoss: results.finalLoss,
    bestLoss: results.bestLoss,
    perplexity: results.perplexity,
    tokensPerSecond: results.tokensPerSecond,
    totalTokens: results.totalTokens,
    totalSteps: results.totalSteps,
    totalEpochs: results.totalEpochs,
    durationMs: results.durationMs,
    checkpointId: results.checkpointId ?? run.checkpointId,
    generationBefore: results.generationBefore ?? run.generationBefore,
    generationAfter: results.generationAfter ?? run.generationAfter,
    analysis: results.analysis ?? run.analysis,
    reproducibility: results.reproducibility ?? run.reproducibility,
    reportId: results.reportId ?? run.reportId,
  };
}

/**
 * Mark a run as failed (transition running → failed).
 *
 * @param run — the running research run
 * @param errorMessage — description of the failure
 * @returns a new failed ResearchRun with partial metrics preserved
 */
export function failResearchRun(
  run: ResearchRun,
  errorMessage: string
): ResearchRun {
  const allowable: ResearchRunStatus[] = ["pending", "running"];
  if (!allowable.includes(run.status)) {
    throw new Error(
      `ResearchRun: cannot fail run in "${run.status}" status. ` +
      `Must be one of: ${allowable.join(", ")}`
    );
  }

  return {
    ...run,
    status: "failed",
    completedAt: Date.now(),
    errorMessage,
  };
}

/**
 * Cancel a run (transition pending/running → cancelled).
 */
export function cancelResearchRun(run: ResearchRun): ResearchRun {
  const allowable: ResearchRunStatus[] = ["pending", "running"];
  if (!allowable.includes(run.status)) {
    throw new Error(
      `ResearchRun: cannot cancel run in "${run.status}" status. ` +
      `Must be one of: ${allowable.join(", ")}`
    );
  }

  return {
    ...run,
    status: "cancelled",
    completedAt: Date.now(),
  };
}

// ============================================================
// Validation
// ============================================================

/**
 * Validate a ResearchRun object.
 *
 * @param value — the value to validate
 * @throws if any required field is missing or invalid
 */
export function validateResearchRun(
  value: unknown
): asserts value is ResearchRun {
  if (typeof value !== "object" || value === null) {
    throw new Error("ResearchRun: value must be a non-null object");
  }

  const r = value as Record<string, unknown>;

  if (typeof r.runId !== "string" || r.runId.trim().length === 0) {
    throw new Error("ResearchRun: runId must be a non-empty string");
  }
  if (typeof r.experimentId !== "string" || r.experimentId.trim().length === 0) {
    throw new Error("ResearchRun: experimentId must be a non-empty string");
  }
  if (typeof r.seed !== "number" || !Number.isFinite(r.seed)) {
    throw new Error("ResearchRun: seed must be a finite number");
  }

  const validStatuses: ResearchRunStatus[] = [
    "pending", "running", "completed", "failed", "cancelled",
  ];
  if (!validStatuses.includes(r.status as ResearchRunStatus)) {
    throw new Error(
      `ResearchRun: invalid status "${r.status}". ` +
      `Must be one of: ${validStatuses.join(", ")}`
    );
  }
}

/**
 * Type guard: check if a value is a valid ResearchRun.
 */
export function isResearchRun(value: unknown): value is ResearchRun {
  try {
    validateResearchRun(value);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Get the wall-clock duration of a run.
 *
 * Returns the duration in milliseconds. For completed/failed/cancelled
 * runs, uses completedAt - startedAt. For running runs, uses now - startedAt.
 */
export function getRunDuration(run: ResearchRun): number {
  if (run.completedAt > 0) {
    return run.completedAt - run.startedAt;
  }
  return Date.now() - run.startedAt;
}

/**
 * Get a human-readable summary of a run.
 */
export function summarizeRun(run: ResearchRun): string {
  const lines: string[] = [];
  lines.push(`Run: ${run.runId} (experiment: ${run.experimentId})`);
  lines.push(`  Status:   ${run.status}`);
  lines.push(`  Seed:     ${run.seed}`);
  if (run.status === "completed") {
    lines.push(`  Loss:     ${run.initialLoss.toFixed(2)} → ${run.finalLoss.toFixed(2)} (best: ${run.bestLoss.toFixed(2)})`);
    lines.push(`  Perplexity: ${Number.isFinite(run.perplexity) ? run.perplexity.toFixed(2) : "N/A"}`);
    lines.push(`  Steps:    ${run.totalSteps} (${run.totalTokens.toLocaleString()} tokens)`);
    lines.push(`  Speed:    ${run.tokensPerSecond.toFixed(0)} tok/s`);
    lines.push(`  Duration: ${(run.durationMs / 1000).toFixed(1)}s`);
  }
  if (run.status === "failed") {
    lines.push(`  Error:    ${run.errorMessage ?? "Unknown error"}`);
  }
  return lines.join("\n");
}

/**
 * Compare two runs by bestLoss (ascending — lower is better).
 */
export function compareRunsByBestLoss(
  a: ResearchRun,
  b: ResearchRun
): number {
  return a.bestLoss - b.bestLoss;
}

/**
 * Compare two runs by tokensPerSecond (descending — higher is better).
 */
export function compareRunsBySpeed(
  a: ResearchRun,
  b: ResearchRun
): number {
  return b.tokensPerSecond - a.tokensPerSecond;
}

/**
 * Check if a run has generation before/after data.
 */
export function hasGenerationData(run: ResearchRun): boolean {
  return run.generationBefore.length > 0 && run.generationAfter.length > 0;
}

/**
 * Check if a run has been analyzed.
 */
export function hasAnalysis(run: ResearchRun): boolean {
  return run.analysis !== null;
}

/**
 * Check if a run has been reproducibility-checked.
 */
export function hasReproducibilityCheck(run: ResearchRun): boolean {
  return run.reproducibility !== null;
}
