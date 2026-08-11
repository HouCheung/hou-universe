// ============================================================
// MiniMind — research/ResearchExperiment.ts
// ============================================================
// Phase 60: Research experiment definition entity.
//
// Defines ResearchExperiment — the canonical experiment *definition*
// separate from experiment *runs*. An experiment is a plan:
// what model, what dataset, what training config, what seed.
//
// A single experiment can have multiple runs (ResearchRun).
//
// Design principles:
//   - Fully JSON serializable — all fields survive stringify/parse
//   - No UI dependencies — pure data, no React, no localStorage
//   - No Node.js dependencies — browser-safe
//   - Composable from existing ModelRegistry / TrainingRecipe types
//   - Does NOT modify core/model/training modules
// ============================================================

import type { ModelConfigEntry } from "../experiments/ModelRegistry";
import type { TrainingRecipe } from "../experiments/TrainingRecipe";

// ============================================================
// Experiment Status
// ============================================================

/**
 * Lifecycle status of a research experiment definition.
 *
 *   - "draft"     — being configured, not yet ready to run
 *   - "ready"     — validated and ready for execution
 *   - "running"   — has active runs
 *   - "completed" — all intended runs finished
 *   - "archived"  — no longer active, preserved for reference
 */
export type ResearchExperimentStatus =
  | "draft"
  | "ready"
  | "running"
  | "completed"
  | "archived";

// ============================================================
// Dataset Configuration
// ============================================================

/**
 * Dataset configuration for a research experiment.
 */
export interface DatasetConfig {
  /** Dataset name/identifier (e.g. "tinystories", "textcorpus") */
  name: string;
  /** Block size (sequence length) */
  blockSize: number;
  /** Batch size */
  batchSize: number;
  /** Whether to shuffle data */
  shuffle: boolean;
  /** Optional: path to dataset file (Node-only) */
  filePath?: string;
  /** Optional: dataset type */
  type?: "inline" | "file" | "streaming";
}

// ============================================================
// Tokenizer Configuration
// ============================================================

/**
 * Tokenizer configuration for a research experiment.
 */
export interface TokenizerConfig {
  /** Tokenizer type */
  type: "bpe" | "character" | "word";
  /** Vocabulary size */
  vocabSize: number;
  /** Optional: path to saved tokenizer state (Node-only) */
  statePath?: string;
}

// ============================================================
// Evaluation Configuration
// ============================================================

/**
 * Evaluation configuration for a research experiment.
 */
export interface EvaluationConfig {
  /** Prompts for generation evaluation */
  generationPrompts: string[];
  /** Max tokens to generate */
  maxTokens: number;
  /** Temperature for generation */
  temperature: number;
  /** Whether to run generation before/after comparison */
  runGenerationComparison: boolean;
  /** Whether to compute benchmark scores */
  runBenchmarks: boolean;
}

// ============================================================
// Research Experiment
// ============================================================

/**
 * A research experiment definition.
 *
 * This is the PLAN — what to run. It does not contain training
 * results or metrics. Those belong to ResearchRun.
 *
 * One experiment can have many runs (e.g., same config but
 * different seeds, or same seed for reproducibility verification).
 *
 * Usage:
 *   const exp = createResearchExperiment({
 *     name: "TinyStories LR Sweep",
 *     modelConfig: getModelConfig("gpt-tiny"),
 *     trainingConfig: loadRecipe("quick-train"),
 *     datasetConfig: { name: "tinystories", blockSize: 64, batchSize: 8, shuffle: true },
 *   });
 *   const json = serializeResearchExperiment(exp);
 */
export interface ResearchExperiment {
  /** Unique experiment identifier */
  id: string;

  /** Human-readable experiment name */
  name: string;

  /** Longer description / context */
  description: string;

  /** Explicit research hypothesis — what we expect to learn or verify */
  hypothesis: string;

  /** Unix timestamp (ms) when this experiment was created */
  createdAt: number;

  /** Unix timestamp (ms) when last updated */
  updatedAt: number;

  /** Random seed for reproducibility */
  seed: number;

  /** Model architecture configuration */
  modelConfig: ModelConfigEntry;

  /** Training hyperparameters */
  trainingConfig: TrainingRecipe;

  /** Dataset configuration */
  datasetConfig: DatasetConfig;

  /** Tokenizer configuration */
  tokenizerConfig: TokenizerConfig;

  /** Evaluation configuration */
  evaluationConfig: EvaluationConfig;

  /** Tags for organization and filtering */
  tags: string[];

  /** Optional: baseline experiment ID for ablation studies */
  baselineExperimentId: string | undefined;

  /** Current lifecycle status */
  status: ResearchExperimentStatus;
}

// ============================================================
// Factory
// ============================================================

/**
 * Generate a unique experiment ID.
 *
 * Format: "exp-{timestamp}-{random}"
 */
export function generateExperimentId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `exp-${ts}-${rand}`;
}

/**
 * Create a new ResearchExperiment with defaults filled in.
 *
 * @param params — experiment parameters
 * @returns a new ResearchExperiment in "draft" status
 */
export function createResearchExperiment(params: {
  name: string;
  description?: string;
  hypothesis?: string;
  seed?: number;
  modelConfig: ModelConfigEntry;
  trainingConfig: TrainingRecipe;
  datasetConfig: DatasetConfig;
  tokenizerConfig?: TokenizerConfig;
  evaluationConfig?: EvaluationConfig;
  tags?: string[];
  baselineExperimentId?: string;
  id?: string;
}): ResearchExperiment {
  const now = Date.now();

  return {
    id: params.id ?? generateExperimentId(),
    name: params.name,
    description: params.description ?? "",
    hypothesis: params.hypothesis ?? "",
    createdAt: now,
    updatedAt: now,
    seed: params.seed ?? 42,
    modelConfig: { ...params.modelConfig },
    trainingConfig: { ...params.trainingConfig },
    datasetConfig: { ...params.datasetConfig },
    tokenizerConfig: params.tokenizerConfig ?? {
      type: "bpe",
      vocabSize: 32000,
    },
    evaluationConfig: params.evaluationConfig ?? {
      generationPrompts: ["the", "once upon", "in the"],
      maxTokens: 30,
      temperature: 0.8,
      runGenerationComparison: true,
      runBenchmarks: false,
    },
    tags: params.tags ?? [],
    baselineExperimentId: params.baselineExperimentId,
    status: "draft",
  };
}

// ============================================================
// Validation
// ============================================================

/**
 * Validate a ResearchExperiment object.
 *
 * @param value — the value to validate
 * @throws if any required field is missing or invalid
 */
export function validateResearchExperiment(
  value: unknown
): asserts value is ResearchExperiment {
  if (typeof value !== "object" || value === null) {
    throw new Error("ResearchExperiment: value must be a non-null object");
  }

  const e = value as Record<string, unknown>;

  if (typeof e.id !== "string" || e.id.trim().length === 0) {
    throw new Error("ResearchExperiment: id must be a non-empty string");
  }
  if (typeof e.name !== "string" || e.name.trim().length === 0) {
    throw new Error("ResearchExperiment: name must be a non-empty string");
  }
  if (typeof e.description !== "string") {
    throw new Error("ResearchExperiment: description must be a string");
  }
  if (typeof e.hypothesis !== "string") {
    throw new Error("ResearchExperiment: hypothesis must be a string");
  }
  if (typeof e.seed !== "number" || !Number.isFinite(e.seed)) {
    throw new Error("ResearchExperiment: seed must be a finite number");
  }
  if (typeof e.modelConfig !== "object" || e.modelConfig === null) {
    throw new Error("ResearchExperiment: modelConfig must be a non-null object");
  }
  if (typeof e.trainingConfig !== "object" || e.trainingConfig === null) {
    throw new Error("ResearchExperiment: trainingConfig must be a non-null object");
  }
  if (typeof e.datasetConfig !== "object" || e.datasetConfig === null) {
    throw new Error("ResearchExperiment: datasetConfig must be a non-null object");
  }
  if (typeof e.createdAt !== "number" || !Number.isFinite(e.createdAt)) {
    throw new Error("ResearchExperiment: createdAt must be a finite number");
  }

  const validStatuses: ResearchExperimentStatus[] = [
    "draft", "ready", "running", "completed", "archived",
  ];
  if (!validStatuses.includes(e.status as ResearchExperimentStatus)) {
    throw new Error(
      `ResearchExperiment: invalid status "${e.status}". ` +
      `Must be one of: ${validStatuses.join(", ")}`
    );
  }
}

/**
 * Type guard: check if a value is a valid ResearchExperiment.
 */
export function isResearchExperiment(
  value: unknown
): value is ResearchExperiment {
  try {
    validateResearchExperiment(value);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Clone
// ============================================================

/**
 * Deep-clone a ResearchExperiment, optionally overriding fields.
 *
 * The clone gets a new ID and createdAt timestamp.
 * Useful for creating variants from a baseline.
 *
 * @param original — the experiment to clone
 * @param overrides — optional field overrides for the clone
 * @returns a new ResearchExperiment
 */
export function cloneResearchExperiment(
  original: ResearchExperiment,
  overrides?: Partial<{
    name: string;
    description: string;
    hypothesis: string;
    seed: number;
    modelConfig: Partial<ModelConfigEntry>;
    trainingConfig: Partial<TrainingRecipe>;
    datasetConfig: Partial<DatasetConfig>;
    tokenizerConfig: Partial<TokenizerConfig>;
    evaluationConfig: Partial<EvaluationConfig>;
    tags: string[];
    baselineExperimentId: string;
  }>
): ResearchExperiment {
  const now = Date.now();

  const cloned: ResearchExperiment = {
    id: generateExperimentId(),
    name: overrides?.name ?? `${original.name} (clone)`,
    description: overrides?.description ?? original.description,
    hypothesis: overrides?.hypothesis ?? original.hypothesis,
    createdAt: now,
    updatedAt: now,
    seed: overrides?.seed ?? original.seed,
    modelConfig: {
      ...original.modelConfig,
      ...(overrides?.modelConfig ?? {}),
    },
    trainingConfig: {
      ...original.trainingConfig,
      ...(overrides?.trainingConfig ?? {}),
    },
    datasetConfig: {
      ...original.datasetConfig,
      ...(overrides?.datasetConfig ?? {}),
    },
    tokenizerConfig: {
      ...original.tokenizerConfig,
      ...(overrides?.tokenizerConfig ?? {}),
    },
    evaluationConfig: {
      ...original.evaluationConfig,
      ...(overrides?.evaluationConfig ?? {}),
    },
    tags: overrides?.tags ?? [...original.tags],
    baselineExperimentId:
      overrides?.baselineExperimentId ?? original.id,
    status: "draft",
  };

  return cloned;
}

// ============================================================
// Serialization
// ============================================================

/**
 * Serialize a ResearchExperiment to a JSON string.
 */
export function serializeResearchExperiment(
  experiment: ResearchExperiment
): string {
  return JSON.stringify(experiment, null, 2);
}

/**
 * Deserialize a ResearchExperiment from a JSON string.
 *
 * @throws if the parsed value is not a valid ResearchExperiment
 */
export function deserializeResearchExperiment(
  json: string
): ResearchExperiment {
  const parsed: unknown = JSON.parse(json);
  validateResearchExperiment(parsed);
  return parsed;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Generate a human-readable summary of an experiment definition.
 */
export function summarizeExperiment(experiment: ResearchExperiment): string {
  const lines: string[] = [];
  lines.push(`Experiment: ${experiment.name}`);
  lines.push(`  ID:       ${experiment.id}`);
  lines.push(`  Status:   ${experiment.status}`);
  lines.push(`  Seed:     ${experiment.seed}`);
  lines.push(`  Model:    ${experiment.modelConfig.label}`);
  lines.push(`  Recipe:   ${experiment.trainingConfig.name}`);
  lines.push(`  Dataset:  ${experiment.datasetConfig.name} (block=${experiment.datasetConfig.blockSize}, batch=${experiment.datasetConfig.batchSize})`);
  if (experiment.baselineExperimentId) {
    lines.push(`  Baseline: ${experiment.baselineExperimentId}`);
  }
  if (experiment.tags.length > 0) {
    lines.push(`  Tags:     ${experiment.tags.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Mark an experiment as ready to run.
 */
export function markExperimentReady(
  experiment: ResearchExperiment
): ResearchExperiment {
  return {
    ...experiment,
    status: "ready",
    updatedAt: Date.now(),
  };
}

/**
 * Mark an experiment as running.
 */
export function markExperimentRunning(
  experiment: ResearchExperiment
): ResearchExperiment {
  return {
    ...experiment,
    status: "running",
    updatedAt: Date.now(),
  };
}

/**
 * Mark an experiment as completed.
 */
export function markExperimentCompleted(
  experiment: ResearchExperiment
): ResearchExperiment {
  return {
    ...experiment,
    status: "completed",
    updatedAt: Date.now(),
  };
}

/**
 * Mark an experiment as archived.
 */
export function markExperimentArchived(
  experiment: ResearchExperiment
): ResearchExperiment {
  return {
    ...experiment,
    status: "archived",
    updatedAt: Date.now(),
  };
}
