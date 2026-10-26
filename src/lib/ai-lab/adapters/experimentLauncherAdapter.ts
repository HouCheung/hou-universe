// ============================================================
// AI Lab — adapters/experimentLauncherAdapter.ts
// ============================================================
// Phase 56: Bridges MiniMind experiment infrastructure to the
// Experiment Launcher UI. Provides pure functions for model
// selection, recipe selection, dataset options, experiment
// preview building, and launch config validation.
//
// Design principles:
//   - Pure functions — no side effects, no state mutation
//   - Typed outputs — every exported function returns a
//     well-defined structured type
//   - Defensive — handles empty/missing data gracefully
//   - Browser-safe — no Node.js fs/path dependencies
//   - Follows trainingAdapter.ts / historyAdapter.ts pattern
//
// Data sources (all through existing public APIs):
//   - ModelRegistry (listModels, getModelConfig)
//   - TrainingRecipe (listRecipes, loadRecipe, validateRecipe)
//   - ExperimentStore (list, listByStatus, latest)
//
// Usage:
//   import { getAvailableModels, buildExperimentPreview } from
//     "@/lib/ai-lab/adapters/experimentLauncherAdapter";
//   const models = getAvailableModels();
// ============================================================

import {
  listModels,
  getModelConfig,
  hasModel,
} from "@/lib/minimind/experiments/ModelRegistry";
import type { ModelConfigEntry } from "@/lib/minimind/experiments/ModelRegistry";

import {
  listRecipes,
  loadRecipe,
  listRecipeNames,
  hasRecipe,
} from "@/lib/minimind/experiments/TrainingRecipe";
import type {
  TrainingRecipe,
} from "@/lib/minimind/experiments/TrainingRecipe";

import { datasetKind } from "@/lib/minimind/data/datasetRegistry";

import {
  loadProductionDataset,
  computeBaseStatistics,
} from "@/lib/minimind/data/datasetLoader";

import {
  list as listRecords,
  listByStatus as listRecordsByStatus,
  latest as latestRecord,
  stats as recordStats,
} from "@/lib/minimind/experiments/history/ExperimentStore";
import {
  generateExperimentId,
  createResearchExperiment,
} from "@/lib/minimind/research/ResearchExperiment";
import { trainingRuntime } from "@/lib/minimind/research/TrainingRuntime";
import { workspace } from "@/lib/minimind/research/ResearchWorkspace";
import {
  generateSessionId,
  type SessionConfig,
} from "@/lib/minimind/research/ResearchState";
import {
  listRunsByExperiment,
  hasExperiment,
  createExperiment,
} from "@/lib/minimind/research/ResearchExperimentStore";

// Re-export for barrel consumers
export { generateExperimentId };
import type {
  ExperimentRecord,
} from "@/lib/minimind/experiments/history/ExperimentRecord";

// ============================================================
// UI-facing types
// ============================================================

/**
 * Lightweight model option for the launcher dropdown.
 */
export interface ModelOption {
  /** Model name (e.g. "tiny", "small", "base") */
  value: string;
  /** Human-readable label */
  label: string;
  /** Brief description */
  description: string;
  /** Estimated parameter count */
  estimatedParams: number;
  /** Architecture summary (e.g. "dModel=128, 4 layers, 4 heads") */
  architecture: string;
}

/**
 * Lightweight recipe option for the launcher dropdown.
 */
export interface RecipeOption {
  /** Recipe name (e.g. "tinystories-tiny") */
  value: string;
  /** Human-readable label */
  label: string;
  /** Brief description */
  description: string;
  /** Which model this recipe targets */
  model: string;
  /** Which dataset type */
  dataset: string;
  /** Number of epochs */
  epochs: number;
}

/**
 * Dataset option for the launcher dropdown.
 */
export interface DatasetOption {
  /** Dataset identifier */
  value: string;
  /** Human-readable label */
  label: string;
  /** Description of the dataset */
  description: string;
  /** Approximate size category */
  size: "tiny" | "small" | "medium" | "large";
  /** Classification — production is the single trainable dataset */
  kind: "production" | "fixture";
  /** Language coverage (e.g. "zh/en/mixed") */
  languageCoverage: string;
  /** Dataset content version */
  version: string;
  /** Dataset schema version */
  schemaVersion: number;
  /** Number of samples in the dataset */
  sampleCount: number;
  /** Whether this is a fixture (test/demo) rather than production data */
  isFixture: boolean;
  /** Dataset purpose (pretraining / instruction / evaluation) */
  purpose: string;
}

/**
 * Complete launch configuration assembled by the UI.
 */
export interface LaunchConfig {
  /** Selected model name */
  model: string;
  /** Selected recipe name */
  recipe: string;
  /** Dataset override (or match recipe default) */
  dataset: string;
  /** Random seed */
  seed: number;
  /** Optional custom experiment name */
  experimentName: string;
  /** Optional block size override */
  blockSize?: number;
  /** Optional batch size override */
  batchSize?: number;
  /** Optional epochs override */
  epochs?: number;
}

/**
 * Experiment preview — what will happen when launched.
 */
export interface ExperimentPreview {
  /** Resolved model config */
  model: ModelConfigEntry;
  /** Resolved training recipe */
  recipe: TrainingRecipe;
  /** Estimated total training steps */
  estimatedSteps: number;
  /** Estimated training time description */
  estimatedTime: string;
  /** Total parameter count */
  totalParams: number;
  /** Tokens per epoch (approximate) */
  tokensPerEpoch: number;
  /** Configuration summary lines */
  summary: string[];
}

/**
 * Validation result for a launch configuration.
 */
export interface LaunchValidationResult {
  /** Whether the config is valid */
  valid: boolean;
  /** List of validation error messages (empty if valid) */
  errors: string[];
  /** List of validation warnings (non-blocking) */
  warnings: string[];
}

/**
 * Summary of recent/running/completed experiments for the workspace.
 */
export interface ExperimentWorkspaceOverview {
  /** Recently created experiments (last 5) */
  recent: ExperimentRecord[];
  /** Currently running experiments */
  running: ExperimentRecord[];
  /** Recently completed experiments (last 5) */
  completed: ExperimentRecord[];
  /** Aggregate stats */
  stats: {
    total: number;
    completed: number;
    running: number;
    failed: number;
    bestPerplexity: number | null;
  };
}

// ============================================================
// Public API — Model selection
// ============================================================

/**
 * Get all available models as launcher-friendly options.
 *
 * Wraps ModelRegistry.listModels() and transforms entries
 * into dropdown-ready ModelOption objects.
 *
 * @returns Array of ModelOption, sorted by param count ascending
 *
 * Example:
 *   const models = getAvailableModels();
 *   models.forEach(m => console.log(m.label, m.estimatedParams));
 */
export function getAvailableModels(): ModelOption[] {
  const models = listModels();

  return models
    .map((m) => ({
      value: m.name,
      label: m.label,
      description: m.description,
      estimatedParams: m.estimatedParams,
      architecture: `dModel=${m.dModel}, ${m.numLayers} layers, ${m.numHeads} heads`,
    }))
    .sort((a, b) => a.estimatedParams - b.estimatedParams);
}

/**
 * Get a single model option by name.
 *
 * @param name — Model name ("tiny", "small", "base")
 * @returns ModelOption or undefined if not found
 */
export function getModelOption(name: string): ModelOption | undefined {
  if (!hasModel(name)) return undefined;
  const m = getModelConfig(name);
  return {
    value: m.name,
    label: m.label,
    description: m.description,
    estimatedParams: m.estimatedParams,
    architecture: `dModel=${m.dModel}, ${m.numLayers} layers, ${m.numHeads} heads`,
  };
}

// ============================================================
// Public API — Recipe selection
// ============================================================

/**
 * Get all available training recipes as launcher-friendly options.
 *
 * Wraps TrainingRecipe.listRecipes() and transforms entries
 * into dropdown-ready RecipeOption objects.
 *
 * @returns Array of RecipeOption, sorted alphabetically by label
 *
 * Example:
 *   const recipes = getAvailableRecipes();
 *   recipes.forEach(r => console.log(r.label, r.epochs, "epochs"));
 */
export function getAvailableRecipes(): RecipeOption[] {
  const recipes = listRecipes();

  return recipes
    .filter((r) => {
      // Phase 81: only surface recipes whose dataset is actually executable
      // (production or fixture). Legacy recipes referencing unavailable
      // datasets (tinystories/textfile/synthetic) stay registered for
      // backward compatibility but are not offered as launchable options.
      const kind = datasetKind(r.dataset.dataset);
      return kind === "production" || kind === "fixture";
    })
    .map((r) => ({
      value: r.name,
      label: r.label,
      description: r.description,
      model: r.model,
      dataset: r.dataset.dataset,
      epochs: r.epochs,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Get recipes filtered by compatible model.
 *
 * @param modelName — Model name to filter by
 * @returns Array of RecipeOption for the given model
 */
export function getRecipesForModel(modelName: string): RecipeOption[] {
  return getAvailableRecipes().filter((r) => r.model === modelName);
}

/**
 * Get a single recipe option by name.
 *
 * @param name — Recipe name
 * @returns RecipeOption or undefined if not found
 */
export function getRecipeOption(name: string): RecipeOption | undefined {
  if (!hasRecipe(name)) return undefined;
  const r = loadRecipe(name);
  return {
    value: r.name,
    label: r.label,
    description: r.description,
    model: r.model,
    dataset: r.dataset.dataset,
    epochs: r.epochs,
  };
}

// ============================================================
// Public API — Dataset options
// ============================================================

/**
 * Get all available dataset options.
 *
 * Returns the canonical dataset types that the training
 * infrastructure supports.
 *
 * @returns Array of DatasetOption
 */
export function getDatasetOptions(): DatasetOption[] {
  // Phase 81: surface only the genuinely-launchable dataset. The launcher has
  // no inline-text input, so `inline` (a fixture) cannot actually be launched
  // from this UI and is deliberately omitted here — it remains available to
  // the programmatic API and tests via resolveTrainingDataset(). Unavailable
  // legacy ids (tinystories/textfile/synthetic) are never shown.
  //
  // Phase 82: populate the option from the single DatasetLoader so the UI
  // reports the REAL language coverage, version, schema version, sample count,
  // and fixture-vs-production status (not hardcoded literals).
  const dataset = loadProductionDataset();
  const base = computeBaseStatistics(dataset);
  return [
    {
      value: "bilingual",
      label: "Bilingual",
      description:
        "Real bilingual (Chinese / English / Mixed) foundation corpus. " +
        "The single production training dataset.",
      size: "small",
      kind: "production",
      languageCoverage: dataset.metadata.languageCoverage.join("/"),
      version: dataset.metadata.version,
      schemaVersion: dataset.metadata.schemaVersion,
      sampleCount: base.sampleCount,
      isFixture: false,
      purpose: dataset.metadata.purpose,
    },
  ];
}

/**
 * Get a single dataset option by value.
 *
 * @param value — Dataset identifier
 * @returns DatasetOption or undefined
 */
export function getDatasetOption(value: string): DatasetOption | undefined {
  return getDatasetOptions().find((d) => d.value === value);
}

// ============================================================
// Public API — Experiment Preview
// ============================================================

/**
 * Build an experiment preview from a launch configuration.
 *
 * Resolves the model and recipe, computes estimated steps,
 * tokens per epoch, and generates a human-readable summary.
 *
 * @param config — The launch configuration to preview
 * @returns ExperimentPreview with resolved details
 * @throws If model or recipe is not found
 *
 * Example:
 *   const preview = buildExperimentPreview({
 *     model: "tiny", recipe: "tinystories-tiny",
 *     dataset: "tinystories", seed: 42, experimentName: "my-run",
 *   });
 *   console.log(preview.totalParams, preview.estimatedSteps);
 */
export function buildExperimentPreview(
  config: LaunchConfig
): ExperimentPreview {
  const model = getModelConfig(config.model);
  const recipe = loadRecipe(config.recipe);

  // Estimate steps: epochs × (documents / batchSize)
  // Without knowing exact document count, estimate from blockSize
  const estimatedDocsPerEpoch = recipe.dataset.blockSize > 0
    ? Math.ceil(10000 / recipe.dataset.blockSize)
    : 100;
  const stepsPerEpoch = Math.ceil(
    estimatedDocsPerEpoch / recipe.dataset.batchSize
  );

  const totalSteps = (config.epochs ?? recipe.epochs) * stepsPerEpoch;

  // Tokens per epoch
  const tokensPerEpoch =
    estimatedDocsPerEpoch *
    (config.blockSize ?? recipe.dataset.blockSize);

  // Time estimate (very rough heuristic)
  const estimatedTime = estimateTrainingTime(
    model.estimatedParams,
    totalSteps,
    config.batchSize ?? recipe.dataset.batchSize
  );

  // Build summary lines
  const summary: string[] = [
    `Model: ${model.label} (${model.estimatedParams.toLocaleString()} params)`,
    `Recipe: ${recipe.label}`,
    `Dataset: ${config.dataset}`,
    `Block size: ${config.blockSize ?? recipe.dataset.blockSize}`,
    `Batch size: ${config.batchSize ?? recipe.dataset.batchSize}`,
    `Epochs: ${config.epochs ?? recipe.epochs}`,
    `Seed: ${config.seed}`,
    `Estimated steps: ~${totalSteps.toLocaleString()}`,
    `Tokens/epoch: ~${tokensPerEpoch.toLocaleString()}`,
    `Estimated time: ${estimatedTime}`,
  ];

  return {
    model,
    recipe,
    estimatedSteps: totalSteps,
    estimatedTime,
    totalParams: model.estimatedParams,
    tokensPerEpoch,
    summary,
  };
}

/**
 * Estimate training time based on model size and steps.
 *
 * Uses a simple heuristic — not a substitute for actual
 * benchmarking, but gives users a rough sense of scale.
 *
 * @param params — Parameter count
 * @param steps — Total training steps
 * @param batchSize — Batch size
 * @returns Human-readable time estimate string
 */
function estimateTrainingTime(
  params: number,
  steps: number,
  batchSize: number
): string {
  // Rough heuristic: ~1M params processes ~1000 tokens/sec in browser
  // Larger models are slower per param
  const tokensPerSec = Math.max(
    100,
    (1_000_000 / Math.max(params, 1)) * 1000
  );
  const tokensTotal = steps * batchSize * 128; // assume avg block size
  const seconds = tokensTotal / tokensPerSec;

  if (seconds < 60) return "< 1 minute";
  if (seconds < 3600) return `~${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `~${Math.round(seconds / 3600)} hours`;
  return `~${Math.round(seconds / 86400)} days`;
}

// ============================================================
// Public API — Launch Config Validation
// ============================================================

/**
 * Validate a launch configuration before starting training.
 *
 * Checks:
 *   - Model exists in registry
 *   - Recipe exists and is loadable
 *   - Dataset is a known type
 *   - Seed is a valid integer
 *   - Experiment name is non-empty
 *   - Block size and batch size are positive (if provided)
 *   - Recipe-model compatibility (warns if recipe targets different model)
 *
 * @param config — The launch configuration to validate
 * @returns LaunchValidationResult with errors and warnings
 *
 * Example:
 *   const result = validateLaunchConfig({
 *     model: "tiny", recipe: "tinystories-tiny",
 *     dataset: "tinystories", seed: 42, experimentName: "run-1",
 *   });
 *   if (!result.valid) console.error(result.errors);
 */
export function validateLaunchConfig(
  config: LaunchConfig
): LaunchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate model
  if (!config.model || config.model.trim().length === 0) {
    errors.push("Model is required.");
  } else if (!hasModel(config.model)) {
    errors.push(
      `Unknown model "${config.model}". ` +
      `Available: ${listModels().map(m => m.name).join(", ")}`
    );
  }

  // Validate recipe
  if (!config.recipe || config.recipe.trim().length === 0) {
    errors.push("Training recipe is required.");
  } else if (!hasRecipe(config.recipe)) {
    errors.push(
      `Unknown recipe "${config.recipe}". ` +
      `Available: ${listRecipeNames().join(", ")}`
    );
  }

  // Validate dataset (Phase 81 — classified by kind, not by option presence)
  if (!config.dataset || config.dataset.trim().length === 0) {
    errors.push("Dataset is required.");
  } else {
    const kind = datasetKind(config.dataset);
    if (kind === "production") {
      // The single real training dataset — fully valid.
    } else if (kind === "fixture") {
      warnings.push(
        `Dataset "${config.dataset}" is a test/demo fixture, not production training data.`
      );
    } else if (kind === "unavailable") {
      errors.push(
        `Dataset "${config.dataset}" is not available for training. ` +
        `Production dataset: "bilingual".`
      );
    } else {
      errors.push(
        `Unknown dataset "${config.dataset}". ` +
        `Available: ${getDatasetOptions().map((d) => d.value).join(", ")}`
      );
    }
  }

  // Validate seed
  if (typeof config.seed !== "number" || !Number.isInteger(config.seed)) {
    errors.push("Seed must be an integer.");
  } else if (config.seed < 0) {
    errors.push("Seed must be a non-negative integer.");
  }

  // Validate experiment name
  if (
    !config.experimentName ||
    config.experimentName.trim().length === 0
  ) {
    errors.push("Experiment name is required.");
  } else if (config.experimentName.trim().length > 120) {
    errors.push("Experiment name must be 120 characters or fewer.");
  }

  // Validate optional overrides
  if (config.blockSize !== undefined) {
    if (!Number.isInteger(config.blockSize) || config.blockSize < 2) {
      errors.push("Block size must be an integer >= 2.");
    }
  }
  if (config.batchSize !== undefined) {
    if (!Number.isInteger(config.batchSize) || config.batchSize < 1) {
      errors.push("Batch size must be an integer >= 1.");
    }
  }
  if (config.epochs !== undefined) {
    if (!Number.isInteger(config.epochs) || config.epochs < 1) {
      errors.push("Epochs must be an integer >= 1.");
    }
  }

  // Check recipe-model compatibility (warning, not error)
  if (
    config.model &&
    config.recipe &&
    hasModel(config.model) &&
    hasRecipe(config.recipe)
  ) {
    const recipe = loadRecipe(config.recipe);
    if (recipe.model !== config.model) {
      warnings.push(
        `Recipe "${config.recipe}" was designed for model "${recipe.model}", ` +
        `but you selected "${config.model}". Results may vary.`
      );
    }
  }

  // Check seed reproducibility
  if (config.seed === 42) {
    warnings.push(
      "Using default seed 42. For unique experiments, consider using a different seed."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// Public API — Workspace Overview
// ============================================================

/**
 * Get a complete overview of the experiment workspace.
 *
 * Aggregates recent, running, and completed experiments plus
 * summary statistics. Used by the experiment workspace page.
 *
 * @returns ExperimentWorkspaceOverview
 *
 * Example:
 *   const overview = getWorkspaceOverview();
 *   console.log(`${overview.running.length} experiments running`);
 */
export function getWorkspaceOverview(): ExperimentWorkspaceOverview {
  const allRecords = listRecords();
  const running = listRecordsByStatus("running");
  const completed = listRecordsByStatus("completed").slice(0, 5);
  const recent = allRecords.slice(0, 5);
  const stats = recordStats();

  return {
    recent,
    running,
    completed,
    stats: {
      total: stats.total,
      completed: stats.completed,
      running: stats.running,
      failed: stats.failed,
      bestPerplexity: stats.bestPerplexity,
    },
  };
}

/**
 * Get the most recent experiment record.
 *
 * @returns The latest ExperimentRecord, or null if no history
 */
export function getLatestExperiment(): ExperimentRecord | null {
  return latestRecord() ?? null;
}

/**
 * Check if any experiment history exists.
 *
 * @returns true if at least one record is stored
 */
export function hasExperimentHistory(): boolean {
  return listRecords().length > 0;
}

// ============================================================
// Public API — Experiment ID generation
// ============================================================

// generateExperimentId is now imported from ResearchExperiment
// and re-exported (see import above). This removes the duplicate
// implementation that previously lived in this adapter file.

/**
 * Suggest a default experiment name based on config.
 *
 * @param config — The launch configuration
 * @returns A human-readable default experiment name
 */
export function suggestExperimentName(config: LaunchConfig): string {
  const modelLabel = hasModel(config.model)
    ? getModelConfig(config.model).label
    : config.model;
  const recipeLabel = hasRecipe(config.recipe)
    ? loadRecipe(config.recipe).label
    : config.recipe;
  const dateStr = new Date().toISOString().slice(0, 10);
  return `${modelLabel} — ${recipeLabel} (${dateStr})`;
}

// ============================================================
// Public API — Launch (UI → TrainingRuntime bridge)
// ============================================================
// Phase 75 / P1 #5: Connects the Experiments page Launch button
// to REAL MiniMind training through the shared TrainingRuntime
// singleton. No fake "running" records, no setTimeout mock —
// the real Web Worker executes the real Trainer.
// ============================================================

/**
 * Result of a successful launch.
 */
export interface LaunchResult {
  /** Experiment ID (stable — survives re-launch) */
  experimentId: string;
  /** Session ID that TrainingRuntime is executing */
  sessionId: string;
  /** Run ID created/reused for this experiment */
  runId: string;
  /** Whether an in-flight run was reused instead of creating a new one */
  reused: boolean;
}

/**
 * Options for launchExperiment.
 */
export interface LaunchOptions {
  /**
   * Stable experiment ID. When omitted, a fresh ID is generated.
   * Passing an explicit ID enables duplicate-launch protection:
   * a second launch for the same experiment reuses the in-flight run.
   */
  experimentId?: string;
}

/**
 * Build a SessionConfig from a LaunchConfig.
 *
 * Resolves the model and recipe, applies blockSize/batchSize/epochs
 * overrides, and maps to the canonical SessionConfig that
 * TrainingRuntime.start() consumes. Pure — no side effects.
 *
 * @param config — Launch configuration from the UI
 * @returns SessionConfig ready for TrainingRuntime
 */
export function buildSessionConfig(config: LaunchConfig): SessionConfig {
  const modelConfig = getModelConfig(config.model);
  const recipe = loadRecipe(config.recipe);

  const trainingConfig: TrainingRecipe = {
    ...recipe,
    dataset: {
      ...recipe.dataset,
      blockSize: config.blockSize ?? recipe.dataset.blockSize,
      batchSize: config.batchSize ?? recipe.dataset.batchSize,
    },
    epochs: config.epochs ?? recipe.epochs,
    seed: config.seed,
  };

  return {
    name: config.experimentName,
    modelConfig,
    trainingConfig,
    dataset: config.dataset,
    seed: config.seed,
    blockSize: trainingConfig.dataset.blockSize,
    batchSize: trainingConfig.dataset.batchSize,
    epochs: trainingConfig.epochs,
  };
}

/**
 * Launch a real MiniMind training experiment.
 *
 * Orchestrates the full chain:
 *   1. Resolves the SessionConfig
 *   2. Reuses an in-flight run for the same experiment (duplicate protection)
 *   3. Pre-creates the ResearchExperiment with a controlled id so
 *      TrainingRuntime's ensureExperimentAndRun() links the same id
 *   4. Calls trainingRuntime.start() — real Web Worker + real Trainer
 *   5. Surfaces a synchronous start failure as a thrown Error
 *
 * @param config — Launch configuration from the UI
 * @param options — optional stable experimentId
 * @returns LaunchResult with experiment/session/run ids
 * @throws If validation fails or training cannot start
 */
export async function launchExperiment(
  config: LaunchConfig,
  options: LaunchOptions = {}
): Promise<LaunchResult> {
  const sessionConfig = buildSessionConfig(config);
  const experimentId = options.experimentId ?? generateExperimentId();

  // Duplicate protection — never mint a second active run for the same
  // experiment. Reuse the in-flight run and its session.
  const runningRun = listRunsByExperiment(experimentId).find(
    (r) => r.status === "running"
  );
  if (runningRun) {
    const session = workspace
      .listSessions()
      .find((s) => s.runId === runningRun.runId);
    if (session) {
      return {
        experimentId,
        sessionId: session.id,
        runId: runningRun.runId,
        reused: true,
      };
    }
  }

  // Pre-create the ResearchExperiment with our controlled id. Without this,
  // ensureExperimentAndRun() would mint a fresh id and break the identity chain.
  if (!hasExperiment(experimentId)) {
    const exp = createResearchExperiment({
      id: experimentId,
      name: config.experimentName,
      seed: config.seed,
      modelConfig: sessionConfig.modelConfig,
      trainingConfig: sessionConfig.trainingConfig,
      datasetConfig: {
        name: config.dataset,
        blockSize: sessionConfig.trainingConfig.dataset.blockSize,
        batchSize: sessionConfig.trainingConfig.dataset.batchSize,
        shuffle: true,
      },
    });
    createExperiment(exp);
  }

  const sessionId = generateSessionId();

  await trainingRuntime.start(sessionId, {
    ...sessionConfig,
    experimentId,
  });

  // Surface a synchronous start failure (e.g. worker creation) as a thrown
  // error so the UI shows the real reason instead of faking success.
  const status = trainingRuntime.getStatus(sessionId);
  if (status.status === "failed") {
    throw new Error(status.error ?? "Training failed to start");
  }

  const session = workspace.getSession(sessionId);
  return {
    experimentId,
    sessionId,
    runId: session?.runId ?? "",
    reused: false,
  };
}
