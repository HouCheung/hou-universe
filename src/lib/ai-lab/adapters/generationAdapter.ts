// ============================================================
// AI Lab — adapters/generationAdapter.ts
// ============================================================
// Phase 67: Bridges MiniMind generation runtime to the
// Generation Workspace UI. Provides pure functions for
// generation requests, history, export, and comparison.
//
// Design principles:
//   - Pure functions — no side effects, no state mutation
//   - Typed outputs — every function returns structured types
//   - Browser-safe — no Node.js fs/path dependencies
//   - Defensive — handles empty/missing data gracefully
//
// Data sources:
//   - GenerationRuntime (Web Worker bridge)
//   - GenerationHistoryStore (localStorage)
//   - ResearchWorkspace (session/checkpoint data)
//
// Usage:
//   import { getGenerationHistory, exportGenerationJSON } from
//     "@/lib/ai-lab/adapters/generationAdapter";
// ============================================================

import {
  generationRuntime,
  generationHistory,
  workspace,
  checkpointStore,
  type GenerationResult,
  type GenerationComparisonResult,
  type GenerationHistoryEntry,
  type GenerationExportJSON,
  type GenerationModelConfig,
} from "@/lib/minimind/research";
import type { GenerationEvalOptions } from "@/lib/minimind/evaluation/GenerationEvaluator";
import { resolveTrainingDataset } from "@/lib/minimind/data/datasetRegistry";
import { getProductionModelConfig } from "@/lib/minimind/experiments/ModelRegistry";
import { deriveCapabilityState, capabilityLabel } from "@/lib/minimind/research/capability";

// ============================================================
// UI-facing types
// ============================================================

export interface GenerationUIData {
  requestId: string;
  sessionId: string;
  sessionName: string;
  checkpointId?: string;
  prompt: string;
  generatedText: string;
  tokenCount: number;
  avgLogProb: number;
  perplexity: number;
  stopReason: string;
  durationMs: number;
  status: string;
  isBaseline: boolean;
  timestamp: number;
  generationConfig: {
    maxTokens: number;
    temperature: number;
    topK: number;
    topP: number;
    seed?: number;
  };
}

export interface ComparisonUIData {
  comparisonId: string;
  sessionId: string;
  sessionName: string;
  prompt: string;
  baseline: GenerationUIData;
  trained: GenerationUIData;
  changed: boolean;
  logProbDelta: number;
  perplexityDelta: number;
  tokenCountDelta: number;
}

export interface GenerationHistoryUIData {
  entries: GenerationHistoryEntry[];
  totalCount: number;
}

export interface GenerationCheckpointInfo {
  /** Whether a checkpoint is available for generation */
  hasCheckpoint: boolean;
  /** Checkpoint ID if available */
  checkpointId?: string;
  /** Session ID */
  sessionId: string;
  /** Session name */
  sessionName: string;
  /** Whether the session has a completed training */
  isCompleted: boolean;
  /** Final loss if completed */
  finalLoss?: number;
  /** Final perplexity if completed */
  finalPerplexity?: number;
  /** Number of checkpoints available */
  checkpointCount: number;
  /** Honest capability label (Phase 80) — derived from the training dataset */
  capabilityLabel?: string;
}

// ============================================================
// Public API — Generation
// ============================================================

/**
 * Build the production model config (Phase 80).
 *
 * Generation must reconstruct the SAME architecture training used. The
 * production config is the single source of truth; the worker further
 * refines it from checkpoint metadata when available.
 */
function buildProductionModelConfig(): GenerationModelConfig {
  const p = getProductionModelConfig();
  return {
    vocabSize: p.vocabSize,
    dModel: p.dModel,
    numHeads: p.numHeads,
    dFF: p.dFF,
    numLayers: p.numLayers,
    maxSeqLen: p.maxSeqLen,
  };
}

/**
 * Derive an honest capability label for a session (Phase 80).
 *
 * Replaces the `hasCheckpoint === trained` shortcut with a derived state:
 *   baseline / toy-trained / bilingual-trained / production-ready.
 */
function computeCapabilityLabel(session: {
  dataset?: string;
  checkpoints?: Array<{ checkpointDataPersisted?: boolean }>;
  activeCheckpoint?: { checkpointDataPersisted?: boolean } | undefined;
} | undefined): string {
  const hasCheckpoint =
    !!session?.activeCheckpoint?.checkpointDataPersisted ||
    (session?.checkpoints?.some((c) => c.checkpointDataPersisted) ?? false);
  const state = deriveCapabilityState({
    hasCheckpoint,
    dataset: session?.dataset,
  });
  return capabilityLabel(state);
}

/**
 * Generate text from a session's latest checkpoint.
 *
 * Runs in a Web Worker — does not block the UI thread.
 *
 * @param sessionId - Session ID to generate from
 * @param prompt - The prompt text
 * @param options - Generation parameters
 * @param signal - Optional abort signal
 * @param onToken - Optional token streaming callback (Phase 71)
 * @returns Promise resolving to GenerationResult
 */
export async function generateFromSession(
  sessionId: string,
  prompt: string,
  options?: GenerationEvalOptions,
  signal?: AbortSignal,
  onToken?: (token: string, tokenIndex: number, textSoFar: string) => void
): Promise<GenerationResult> {
  // Get session data
  const session = workspace.getSession(sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found`);
  }

  // Get checkpoint (Phase 85: load the full blob from the CheckpointStore)
  const activeCheckpoint = session.activeCheckpoint;
  const checkpointId = activeCheckpoint?.id;
  const checkpointJSON =
    checkpointId && activeCheckpoint?.checkpointDataPersisted
      ? await checkpointStore.get(checkpointId)
      : undefined;

  // Build model config (Phase 80 — production config is the source of truth)
  const modelConfig = buildProductionModelConfig();

  return generationRuntime.generate({
    sessionId,
    experimentId: session.experimentId,
    runId: session.runId,
    checkpointId,
    checkpointJSON,
    prompt,
    params: options,
    modelConfig,
    corpus: resolveTrainingDataset(session.dataset).corpus,
    isBaseline: !checkpointJSON,
    signal,
    onToken,
  });
}

/**
 * Generate baseline text (untrained model, no checkpoint).
 *
 * @param sessionId - Session ID for context
 * @param prompt - The prompt text
 * @param options - Generation parameters
 * @param signal - Optional abort signal
 * @param onToken - Optional token streaming callback (Phase 71)
 * @returns Promise resolving to GenerationResult
 */
export async function generateBaseline(
  sessionId: string,
  prompt: string,
  options?: GenerationEvalOptions,
  signal?: AbortSignal,
  onToken?: (token: string, tokenIndex: number, textSoFar: string) => void
): Promise<GenerationResult> {
  const session = workspace.getSession(sessionId);

  const modelConfig = buildProductionModelConfig();

  return generationRuntime.generate({
    sessionId,
    experimentId: session?.experimentId,
    runId: session?.runId,
    prompt,
    params: options,
    modelConfig,
    corpus: resolveTrainingDataset(session?.dataset).corpus,
    isBaseline: true,
    signal,
    onToken,
  });
}

/**
 * Generate and compare baseline vs trained output.
 *
 * Runs two generations sequentially: baseline first, then trained.
 *
 * @param sessionId - Session ID
 * @param prompt - The prompt text
 * @param options - Generation parameters
 * @param signal - Optional abort signal
 * @returns Promise resolving to GenerationComparisonResult
 */
export async function generateComparison(
  sessionId: string,
  prompt: string,
  options?: GenerationEvalOptions,
  signal?: AbortSignal
): Promise<GenerationComparisonResult> {
  const session = workspace.getSession(sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found`);
  }

  const activeCheckpoint = session.activeCheckpoint;
  const checkpointId = activeCheckpoint?.id;
  const checkpointJSON =
    checkpointId && activeCheckpoint?.checkpointDataPersisted
      ? await checkpointStore.get(checkpointId)
      : undefined;

  if (!checkpointJSON) {
    throw new Error(
      `Session "${sessionId}" has no checkpoint data. ` +
      `Cannot generate comparison without a trained checkpoint.`
    );
  }

  const modelConfig = buildProductionModelConfig();

  return generationRuntime.compare({
    sessionId,
    experimentId: session.experimentId,
    runId: session.runId,
    checkpointId,
    checkpointJSON,
    prompt,
    params: options,
    modelConfig,
    corpus: resolveTrainingDataset(session.dataset).corpus,
    signal,
  });
}

/**
 * Cancel an active generation.
 */
export function cancelGeneration(requestId: string): void {
  generationRuntime.cancel(requestId);
}

// ============================================================
// Public API — History
// ============================================================

/**
 * Get generation history entries.
 */
export function getGenerationHistory(): GenerationHistoryUIData {
  const entries = generationHistory.list();
  return {
    entries,
    totalCount: entries.length,
  };
}

/**
 * Get generation history for a specific session.
 */
export function getSessionGenerationHistory(
  sessionId: string
): GenerationHistoryUIData {
  const entries = generationHistory.getBySession(sessionId);
  return {
    entries,
    totalCount: entries.length,
  };
}

/**
 * Delete a history entry.
 */
export function deleteHistoryEntry(id: string): boolean {
  return generationHistory.delete(id);
}

/**
 * Clear all generation history.
 */
export function clearGenerationHistory(): void {
  generationHistory.clear();
}

// ============================================================
// Public API — Checkpoint Info
// ============================================================

/**
 * Get checkpoint info for a session to determine if generation
 * is possible.
 */
export function getGenerationCheckpointInfo(
  sessionId: string
): GenerationCheckpointInfo | null {
  const session = workspace.getSession(sessionId);
  if (!session) return null;

  const hasCheckpoint = !!session.activeCheckpoint?.checkpointDataPersisted;
  const checkpointCount = session.checkpoints?.length ?? 0;

  return {
    hasCheckpoint,
    checkpointId: session.activeCheckpoint?.id,
    sessionId: session.id,
    sessionName: session.name,
    isCompleted: session.status === "completed",
    finalLoss: session.finalLoss,
    finalPerplexity: session.finalPerplexity,
    checkpointCount,
    capabilityLabel: computeCapabilityLabel(session),
  };
}

/**
 * Get all sessions that support generation (have checkpoints).
 */
export function getGeneratableSessions(): GenerationCheckpointInfo[] {
  const sessions = workspace.listSessions();
  return sessions
    .filter(
      (s) =>
        s.checkpoints?.some((c) => c.checkpointDataPersisted) ||
        s.activeCheckpoint?.checkpointDataPersisted
    )
    .map((s) => ({
      hasCheckpoint: !!s.activeCheckpoint?.checkpointDataPersisted,
      checkpointId: s.activeCheckpoint?.id,
      sessionId: s.id,
      sessionName: s.name,
      isCompleted: s.status === "completed",
      finalLoss: s.finalLoss,
      finalPerplexity: s.finalPerplexity,
      checkpointCount: s.checkpoints?.length ?? 0,
      capabilityLabel: computeCapabilityLabel(s),
    }));
}

// ============================================================
// Public API — Export
// ============================================================

/**
 * Export a generation result as JSON.
 */
export function exportGenerationJSON(
  result: GenerationResult,
  comparison?: GenerationComparisonResult
): GenerationExportJSON {
  const exp: GenerationExportJSON = {
    version: 1,
    exportedAt: new Date().toISOString(),
    experiment: {
      sessionId: result.sessionId,
      experimentId: result.experimentId,
      runId: result.runId,
      checkpointId: result.checkpointId,
    },
    modelConfig: {
      vocabSize: 0, // Filled from result context
      dModel: 0,
      numHeads: 0,
      dFF: 0,
      numLayers: 0,
      maxSeqLen: 0,
    },
    generationConfig: result.generationConfig,
    result: {
      prompt: result.prompt,
      generatedText: result.generatedText,
      tokenCount: result.metrics.tokenCount,
      avgLogProb: result.metrics.avgLogProb,
      perplexity: result.metrics.perplexity,
      stopReason: result.metrics.stopReason,
      durationMs: result.metrics.durationMs,
      isBaseline: result.isBaseline,
    },
  };

  if (comparison) {
    exp.comparison = {
      baselineText: comparison.baseline.generatedText,
      trainedText: comparison.trained.generatedText,
      changed: comparison.changed,
      logProbDelta: comparison.logProbDelta,
      perplexityDelta: comparison.perplexityDelta,
      tokenCountDelta: comparison.tokenCountDelta,
    };
  }

  return exp;
}

/**
 * Export a generation result as a Markdown string.
 */
export function exportGenerationMarkdown(
  result: GenerationResult,
  comparison?: GenerationComparisonResult
): string {
  const lines: string[] = [
    `# MiniMind Generation Report`,
    ``,
    `**Generated:** ${new Date(result.timestamp).toISOString()}`,
    `**Session:** ${result.sessionId}`,
    `**Checkpoint:** ${result.checkpointId ?? "none (baseline)"}`,
    `**Status:** ${result.status}`,
    ``,
    `## Generation Configuration`,
    ``,
    `| Parameter | Value |`,
    `|-----------|-------|`,
    `| Prompt | \`${result.prompt}\` |`,
    `| Max Tokens | ${result.generationConfig.params.maxTokens ?? 30} |`,
    `| Temperature | ${result.generationConfig.params.temperature ?? 0.8} |`,
    `| Top-K | ${result.generationConfig.params.topK ?? 40} |`,
    `| Top-P | ${result.generationConfig.params.topP ?? 0.9} |`,
    `| Seed | ${result.generationConfig.params.seed ?? "none"} |`,
    ``,
    `## Generated Output`,
    ``,
    `\`\`\``,
    result.generatedText,
    `\`\`\``,
    ``,
    `## Metrics`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Tokens Generated | ${result.metrics.tokenCount} |`,
    `| Avg Log-Prob | ${result.metrics.avgLogProb.toFixed(4)} |`,
    `| Perplexity | ${result.metrics.perplexity.toFixed(2)} |`,
    `| Stop Reason | ${result.metrics.stopReason} |`,
    `| Duration | ${result.metrics.durationMs}ms |`,
    `| Baseline | ${result.isBaseline ? "Yes" : "No"} |`,
  ];

  if (comparison) {
    lines.push(
      ``,
      `## Before/After Comparison`,
      ``,
      `| Metric | Baseline | Trained | Delta |`,
      `|--------|----------|---------|-------|`,
      `| Tokens | ${comparison.baseline.metrics.tokenCount} | ${comparison.trained.metrics.tokenCount} | ${comparison.tokenCountDelta >= 0 ? "+" : ""}${comparison.tokenCountDelta} |`,
      `| Avg Log-Prob | ${comparison.baseline.metrics.avgLogProb.toFixed(4)} | ${comparison.trained.metrics.avgLogProb.toFixed(4)} | ${comparison.logProbDelta >= 0 ? "+" : ""}${comparison.logProbDelta.toFixed(4)} |`,
      `| Perplexity | ${comparison.baseline.metrics.perplexity.toFixed(2)} | ${comparison.trained.metrics.perplexity.toFixed(2)} | ${comparison.perplexityDelta >= 0 ? "+" : ""}${comparison.perplexityDelta.toFixed(2)} |`,
      `| Changed | — | — | ${comparison.changed ? "Yes" : "No"} |`,
      ``,
      `### Baseline Output`,
      ``,
      `\`\`\``,
      comparison.baseline.generatedText,
      `\`\`\``,
      ``,
      `### Trained Output`,
      ``,
      `\`\`\``,
      comparison.trained.generatedText,
      `\`\`\``
    );
  }

  lines.push(``, `---`, `*Generated by MiniMind Phase 67 — Generation & Evaluation*`);
  return lines.join("\n");
}

// ============================================================
// Public API — Transform
// ============================================================

/**
 * Transform a GenerationResult into UI-ready data.
 */
export function toGenerationUIData(
  result: GenerationResult,
  sessionName?: string
): GenerationUIData {
  return {
    requestId: result.requestId,
    sessionId: result.sessionId,
    sessionName: sessionName ?? result.sessionId,
    checkpointId: result.checkpointId,
    prompt: result.prompt,
    generatedText: result.generatedText,
    tokenCount: result.metrics.tokenCount,
    avgLogProb: result.metrics.avgLogProb,
    perplexity: result.metrics.perplexity,
    stopReason: result.metrics.stopReason,
    durationMs: result.metrics.durationMs,
    status: result.status,
    isBaseline: result.isBaseline,
    timestamp: result.timestamp,
    generationConfig: {
      maxTokens: result.generationConfig.params.maxTokens ?? 30,
      temperature: result.generationConfig.params.temperature ?? 0.8,
      topK: result.generationConfig.params.topK ?? 40,
      topP: result.generationConfig.params.topP ?? 0.9,
      seed: result.generationConfig.params.seed,
    },
  };
}

/**
 * Transform a ComparisonResult into UI-ready data.
 */
export function toComparisonUIData(
  comparison: GenerationComparisonResult,
  sessionName?: string
): ComparisonUIData {
  return {
    comparisonId: comparison.comparisonId,
    sessionId: comparison.sessionId,
    sessionName: sessionName ?? comparison.sessionId,
    prompt: comparison.prompt,
    baseline: toGenerationUIData(comparison.baseline, sessionName),
    trained: toGenerationUIData(comparison.trained, sessionName),
    changed: comparison.changed,
    logProbDelta: comparison.logProbDelta,
    perplexityDelta: comparison.perplexityDelta,
    tokenCountDelta: comparison.tokenCountDelta,
  };
}
