// ============================================================
// TrainingRecipe — Reusable training configuration system
// ============================================================
// Phase 50: Provides named, versioned training recipes that
// fully specify a training run. Recipes are serializable,
// composable, and designed for reproducible research.
//
// Recipes encode:
//   - Which model config to use
//   - Which dataset to train on
//   - Optimizer, scheduler, and hyperparameters
//   - Training duration (epochs, steps)
//
// Built-in recipes:
//   - tiny-overfit-test:  Tiny model on small synthetic data
//   - tinystories-tiny:   Tiny model on TinyStories dataset
//   - tinystories-small:  Small model on TinyStories dataset
//
// Usage:
//   import { loadRecipe, listRecipes, saveRecipe } from "./TrainingRecipe";
//   const recipe = loadRecipe("tinystories-tiny");
//   console.log(recipe.model, recipe.optimizer.lr);
// ============================================================

// ============================================================

import type { DatasetId } from "../data/datasetRegistry";
import { datasetKind } from "../data/datasetRegistry";

/**
 * Optimizer configuration within a recipe.
 */
export interface RecipeOptimizerConfig {
  /** Optimizer type */
  type: "adamw" | "sgd";
  /** Learning rate */
  lr: number;
  /** Weight decay (AdamW: decoupled, SGD: L2 regularization) */
  weightDecay?: number;
  /** AdamW betas [beta1, beta2] */
  betas?: [number, number];
  /** AdamW epsilon */
  eps?: number;
  /** SGD momentum */
  momentum?: number;
}

/**
 * Scheduler configuration within a recipe.
 */
export type RecipeSchedulerConfig =
  | { type: "none" }
  | {
      type: "cosine";
      /** Minimum learning rate ratio (minLR = lr * minLRRatio) */
      minLRRatio?: number;
      /** Number of linear warmup steps */
      warmupSteps?: number;
    }
  | {
      type: "linear";
      /** Number of linear warmup steps */
      warmupSteps: number;
    };

/**
 * Dataset configuration within a recipe.
 */
export interface RecipeDatasetConfig {
  /** Dataset identifier (production / fixture / legacy-unavailable) */
  dataset: DatasetId;
  /** Sequence block size for training samples */
  blockSize: number;
  /** Batch size */
  batchSize: number;
  /** Maximum documents/samples to use */
  maxDocuments?: number;
  /** Whether to shuffle training data */
  shuffle?: boolean;
  /** Split to use (for tinystories) */
  split?: "train" | "validation";
  /** File path (for textfile) */
  path?: string;
}

/**
 * Complete training recipe.
 *
 * A recipe fully specifies how to train a model. It is the
 * immutable specification — instances can be saved, loaded,
 * and compared for reproducibility.
 */
export interface TrainingRecipe {
  /** Unique recipe name (kebab-case) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Description of what this recipe trains and why */
  description: string;
  /** Schema version for forward compatibility */
  version: 1;
  /** Model name (must exist in ModelRegistry) */
  model: string;
  /** Dataset configuration */
  dataset: RecipeDatasetConfig;
  /** Optimizer configuration */
  optimizer: RecipeOptimizerConfig;
  /** Learning rate scheduler */
  scheduler: RecipeSchedulerConfig;
  /** Number of training epochs */
  epochs: number;
  /** Gradient accumulation steps (effective batch = batchSize × this) */
  gradientAccumulation: number;
  /** Number of linear warmup steps for the scheduler */
  warmupSteps: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Maximum gradient L2 norm for clipping (0 = disabled) */
  gradientClipNorm?: number;
}

// ============================================================
// Built-in Recipes
// ============================================================

const BUILT_IN_RECIPES: Record<string, TrainingRecipe> = {
  "tiny-overfit-test": {
    name: "tiny-overfit-test",
    label: "Tiny Overfit Test",
    description:
      "Minimal recipe for verifying the training pipeline. " +
      "Uses the tiny model with a small synthetic corpus to " +
      "confirm loss decreases >90% from initial value within " +
      "a few epochs. This is the canonical sanity-check recipe.",
    version: 1,
    model: "tiny",
    dataset: {
      dataset: "synthetic",
      blockSize: 32,
      batchSize: 4,
      maxDocuments: 10,
      shuffle: true,
    },
    optimizer: {
      type: "adamw",
      lr: 0.001,
      weightDecay: 0.01,
      betas: [0.9, 0.999],
    },
    scheduler: {
      type: "cosine",
      minLRRatio: 0.01,
      warmupSteps: 10,
    },
    epochs: 20,
    gradientAccumulation: 1,
    warmupSteps: 10,
    seed: 42,
    gradientClipNorm: 1.0,
  },

  "tinystories-tiny": {
    name: "tinystories-tiny",
    label: "TinyStories — Tiny Model",
    description:
      "Train the MiniMind Tiny model on the TinyStories dataset. " +
      "This is the primary educational training recipe. " +
      "Expected to show meaningful loss reduction and basic " +
      "language modeling capability after training.",
    version: 1,
    model: "tiny",
    dataset: {
      dataset: "tinystories",
      blockSize: 128,
      batchSize: 8,
      split: "train",
      shuffle: true,
    },
    optimizer: {
      type: "adamw",
      lr: 0.001,
      weightDecay: 0.1,
      betas: [0.9, 0.999],
    },
    scheduler: {
      type: "cosine",
      minLRRatio: 0.1,
      warmupSteps: 100,
    },
    epochs: 10,
    gradientAccumulation: 4,
    warmupSteps: 100,
    seed: 42,
    gradientClipNorm: 1.0,
  },

  "tinystories-small": {
    name: "tinystories-small",
    label: "TinyStories — Small Model",
    description:
      "Train the MiniMind Small model (~12M params) on TinyStories. " +
      "Represents a step up in capacity — suitable for " +
      "benchmarking, ablation studies, and comparing against " +
      "the tiny baseline.",
    version: 1,
    model: "small",
    dataset: {
      dataset: "tinystories",
      blockSize: 256,
      batchSize: 8,
      split: "train",
      shuffle: true,
    },
    optimizer: {
      type: "adamw",
      lr: 0.0006,
      weightDecay: 0.1,
      betas: [0.9, 0.95],
    },
    scheduler: {
      type: "cosine",
      minLRRatio: 0.1,
      warmupSteps: 200,
    },
    epochs: 10,
    gradientAccumulation: 4,
    warmupSteps: 200,
    seed: 42,
    gradientClipNorm: 1.0,
  },

  "bilingual-foundation": {
    name: "bilingual-foundation",
    label: "Bilingual Foundation",
    description:
      "Train the production MiniMind model on the bilingual " +
      "(zh / en / mixed) foundation corpus. This is the single real " +
      "production training recipe. It exercises the zh / en / mixed " +
      "tokenizer path and the dataset pipeline — it does NOT imply " +
      "fluent bilingual generation.",
    version: 1,
    model: "production",
    dataset: {
      dataset: "bilingual",
      blockSize: 32,
      batchSize: 4,
      shuffle: true,
    },
    optimizer: {
      type: "adamw",
      lr: 0.001,
      weightDecay: 0.01,
      betas: [0.9, 0.999],
    },
    scheduler: {
      type: "cosine",
      minLRRatio: 0.01,
      warmupSteps: 10,
    },
    epochs: 5,
    gradientAccumulation: 1,
    warmupSteps: 10,
    seed: 42,
    gradientClipNorm: 1.0,
  },
};

// Custom recipes registered at runtime
const customRecipes: Record<string, TrainingRecipe> = {};

// ============================================================
// Public API
// ============================================================

/**
 * Load a training recipe by name.
 *
 * Searches built-in recipes first, then custom recipes.
 *
 * @param name - Recipe name (e.g. "tinystories-tiny")
 * @returns A deep copy of the recipe
 * @throws If the recipe is not found
 *
 * Example:
 *   const recipe = loadRecipe("tinystories-tiny");
 *   console.log(recipe.epochs); // 10
 */
export function loadRecipe(name: string): TrainingRecipe {
  const recipe = BUILT_IN_RECIPES[name] ?? customRecipes[name];
  if (!recipe) {
    const available = listRecipeNames().join(", ");
    throw new Error(
      `TrainingRecipe: unknown recipe "${name}". ` +
        `Available recipes: ${available}`
    );
  }
  return structuredClone(recipe);
}

/**
 * Save (register) a custom training recipe.
 *
 * Custom recipes are stored in-memory and can be retrieved
 * with loadRecipe(). They do NOT persist across sessions.
 *
 * @param recipe - Complete recipe to register
 * @throws If a recipe with the same name already exists
 *
 * Example:
 *   saveRecipe({
 *     name: "my-experiment", label: "My Experiment",
 *     description: "Custom training run", version: 1,
 *     model: "tiny", dataset: { dataset: "inline", blockSize: 64, batchSize: 4 },
 *     optimizer: { type: "adamw", lr: 0.001 },
 *     scheduler: { type: "cosine" },
 *     epochs: 5, gradientAccumulation: 1, warmupSteps: 50, seed: 123,
 *   });
 */
export function saveRecipe(recipe: TrainingRecipe): void {
  if (BUILT_IN_RECIPES[recipe.name]) {
    throw new Error(
      `TrainingRecipe: cannot overwrite built-in recipe "${recipe.name}"`
    );
  }
  if (customRecipes[recipe.name]) {
    throw new Error(
      `TrainingRecipe: custom recipe "${recipe.name}" already exists. ` +
        `Use a different name.`
    );
  }
  // Validate the recipe before saving
  validateRecipe(recipe);
  customRecipes[recipe.name] = structuredClone(recipe);
}

/**
 * List all available recipe names.
 *
 * @returns Array of recipe name strings (built-in + custom)
 */
export function listRecipeNames(): string[] {
  return [
    ...Object.keys(BUILT_IN_RECIPES),
    ...Object.keys(customRecipes),
  ];
}

/**
 * List all available recipes with full metadata.
 *
 * @returns Array of TrainingRecipe objects
 */
export function listRecipes(): TrainingRecipe[] {
  return [
    ...Object.values(BUILT_IN_RECIPES),
    ...Object.values(customRecipes),
  ].map((r) => structuredClone(r));
}

/**
 * Check if a recipe exists.
 *
 * @param name - Recipe name to check
 * @returns true if the recipe is registered
 */
export function hasRecipe(name: string): boolean {
  return name in BUILT_IN_RECIPES || name in customRecipes;
}

/**
 * Get a human-readable summary of a recipe.
 *
 * @param recipe - The recipe to summarize
 * @returns Multi-line summary string
 */
export function summarizeRecipe(recipe: TrainingRecipe): string {
  const lines: string[] = [
    `${"=".repeat(56)}`,
    `Recipe: ${recipe.label} (${recipe.name})`,
    `${"=".repeat(56)}`,
    `Description: ${recipe.description}`,
    `Model:       ${recipe.model}`,
    `Dataset:     ${recipe.dataset.dataset}`,
    `  blockSize:  ${recipe.dataset.blockSize}`,
    `  batchSize:  ${recipe.dataset.batchSize}`,
    `Optimizer:   ${recipe.optimizer.type}, lr=${recipe.optimizer.lr}`,
    `Scheduler:   ${recipe.scheduler.type}`,
    `Epochs:      ${recipe.epochs}`,
    `GradAccum:   ${recipe.gradientAccumulation}`,
    `Warmup:      ${recipe.warmupSteps} steps`,
    `Seed:        ${recipe.seed}`,
    `GradClip:    ${recipe.gradientClipNorm ?? "disabled"}`,
    `${"=".repeat(56)}`,
  ];
  return lines.join("\n");
}

/**
 * Compare two recipes and return differences.
 *
 * Useful for understanding what changed between experiment runs.
 *
 * @param a - First recipe
 * @param b - Second recipe
 * @returns Array of human-readable difference strings
 */
export function diffRecipes(a: TrainingRecipe, b: TrainingRecipe): string[] {
  const diffs: string[] = [];

  if (a.model !== b.model) {
    diffs.push(`model: "${a.model}" → "${b.model}"`);
  }
  if (a.dataset.dataset !== b.dataset.dataset) {
    diffs.push(`dataset: "${a.dataset.dataset}" → "${b.dataset.dataset}"`);
  }
  if (a.dataset.blockSize !== b.dataset.blockSize) {
    diffs.push(
      `blockSize: ${a.dataset.blockSize} → ${b.dataset.blockSize}`
    );
  }
  if (a.dataset.batchSize !== b.dataset.batchSize) {
    diffs.push(
      `batchSize: ${a.dataset.batchSize} → ${b.dataset.batchSize}`
    );
  }
  if (a.optimizer.type !== b.optimizer.type) {
    diffs.push(
      `optimizer.type: "${a.optimizer.type}" → "${b.optimizer.type}"`
    );
  }
  if (a.optimizer.lr !== b.optimizer.lr) {
    diffs.push(`lr: ${a.optimizer.lr} → ${b.optimizer.lr}`);
  }
  if (a.scheduler.type !== b.scheduler.type) {
    diffs.push(
      `scheduler.type: "${a.scheduler.type}" → "${b.scheduler.type}"`
    );
  }
  if (a.epochs !== b.epochs) {
    diffs.push(`epochs: ${a.epochs} → ${b.epochs}`);
  }
  if (a.gradientAccumulation !== b.gradientAccumulation) {
    diffs.push(
      `gradientAccumulation: ${a.gradientAccumulation} → ${b.gradientAccumulation}`
    );
  }
  if (a.warmupSteps !== b.warmupSteps) {
    diffs.push(`warmupSteps: ${a.warmupSteps} → ${b.warmupSteps}`);
  }
  if (a.seed !== b.seed) {
    diffs.push(`seed: ${a.seed} → ${b.seed}`);
  }
  if (a.gradientClipNorm !== b.gradientClipNorm) {
    diffs.push(
      `gradientClipNorm: ${a.gradientClipNorm ?? "disabled"} → ` +
        `${b.gradientClipNorm ?? "disabled"}`
    );
  }

  return diffs;
}

// ============================================================
// Validation
// ============================================================

/**
 * Validate a training recipe for correctness.
 *
 * Checks that all required fields are present and have valid values.
 *
 * @param recipe - Recipe to validate
 * @throws If validation fails
 */
export function validateRecipe(recipe: unknown): asserts recipe is TrainingRecipe {
  if (typeof recipe !== "object" || recipe === null) {
    throw new Error("TrainingRecipe: recipe must be an object");
  }

  const r = recipe as Record<string, unknown>;

  // Required string fields
  const requiredStrings = ["name", "label", "description", "model"];
  for (const field of requiredStrings) {
    if (typeof r[field] !== "string" || (r[field] as string).trim().length === 0) {
      throw new Error(
        `TrainingRecipe: "${field}" must be a non-empty string`
      );
    }
  }

  // Version
  if (r.version !== 1) {
    throw new Error(
      `TrainingRecipe: unsupported version ${String(r.version)}`
    );
  }

  // Dataset
  if (typeof r.dataset !== "object" || r.dataset === null) {
    throw new Error("TrainingRecipe: dataset must be an object");
  }
  const ds = r.dataset as Record<string, unknown>;
  const dsId = String(ds.dataset).trim().toLowerCase();
  const kind = datasetKind(dsId);
  if (kind === "unknown") {
    throw new Error(
      `TrainingRecipe: dataset.dataset must be a known dataset, got "${String(ds.dataset)}"`
    );
  }
  if (kind === "unavailable") {
    throw new Error(
      `TrainingRecipe: dataset "${dsId}" is not available for training. ` +
      `Production dataset: "bilingual". Fixture datasets: inline, tiny, demo, fixture.`
    );
  }
  if (typeof ds.blockSize !== "number" || ds.blockSize < 2) {
    throw new Error("TrainingRecipe: dataset.blockSize must be >= 2");
  }
  if (typeof ds.batchSize !== "number" || ds.batchSize < 1) {
    throw new Error("TrainingRecipe: dataset.batchSize must be >= 1");
  }

  // Optimizer
  if (typeof r.optimizer !== "object" || r.optimizer === null) {
    throw new Error("TrainingRecipe: optimizer must be an object");
  }
  const opt = r.optimizer as Record<string, unknown>;
  if (!["adamw", "sgd"].includes(String(opt.type))) {
    throw new Error(
      `TrainingRecipe: optimizer.type must be "adamw" or "sgd"`
    );
  }
  if (typeof opt.lr !== "number" || opt.lr <= 0) {
    throw new Error("TrainingRecipe: optimizer.lr must be > 0");
  }

  // Scheduler
  if (typeof r.scheduler !== "object" || r.scheduler === null) {
    throw new Error("TrainingRecipe: scheduler must be an object");
  }
  const sched = r.scheduler as Record<string, unknown>;
  if (!["none", "cosine", "linear"].includes(String(sched.type))) {
    throw new Error(
      `TrainingRecipe: scheduler.type must be "none", "cosine", or "linear"`
    );
  }

  // Epochs
  if (typeof r.epochs !== "number" || r.epochs < 1) {
    throw new Error("TrainingRecipe: epochs must be >= 1");
  }

  // Gradient accumulation
  if (
    typeof r.gradientAccumulation !== "number" ||
    r.gradientAccumulation < 1
  ) {
    throw new Error("TrainingRecipe: gradientAccumulation must be >= 1");
  }

  // Warmup steps
  if (typeof r.warmupSteps !== "number" || r.warmupSteps < 0) {
    throw new Error("TrainingRecipe: warmupSteps must be >= 0");
  }

  // Seed
  if (typeof r.seed !== "number" || !Number.isInteger(r.seed)) {
    throw new Error("TrainingRecipe: seed must be an integer");
  }
}

/**
 * Export a recipe to a JSON-serializable object.
 *
 * @param recipe - The recipe to export
 * @returns Plain JSON object
 */
export function recipeToJSON(recipe: TrainingRecipe): TrainingRecipe {
  return structuredClone(recipe);
}

/**
 * Import a recipe from a JSON object (with validation).
 *
 * @param data - Raw JSON object
 * @returns Validated TrainingRecipe
 * @throws If validation fails
 */
export function recipeFromJSON(data: unknown): TrainingRecipe {
  validateRecipe(data);
  return structuredClone(data) as TrainingRecipe;
}
