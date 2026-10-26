// ============================================================
// ExperimentConfig — Type definitions and validation for
// reproducible training experiment configuration files.
// ============================================================
// Phase 46: Provides the schema for JSON experiment configs,
// validation, defaults, and serialization. Designed to fully
// specify a training experiment so it can be reproduced from
// the config file alone.
//
// Usage:
//   const config = ExperimentConfig.fromFile("configs/tinystories-tiny.json");
//   const validated = config.validate();
//   config.save("output/config-copy.json");
// ============================================================

import * as fs from "fs";
import * as path from "path";

// ============================================================
// Config JSON Schema Types
// ============================================================

/** Dataset configuration section */
export interface ExperimentDatasetSection {
  /** Dataset type */
  type: "tinystories" | "textfile" | "inline";
  /** For tinystories: which split to use */
  split?: "train" | "validation";
  /** Max documents to load (limits dataset size) */
  maxDocuments?: number;
  /** File path for textfile type */
  path?: string;
  /** Sequence block size for causal LM samples */
  blockSize: number;
  /** Batch size for DataLoader */
  batchSize: number;
  /** Whether to shuffle (default: true) */
  shuffle?: boolean;
}

/** Model architecture section */
export interface ExperimentModelSection {
  /** Preset: "tiny" (128-dim), "mini" (512-dim), or "custom" */
  preset: "tiny" | "mini" | "custom";
  /** Vocabulary size */
  vocabSize: number;
  /** Custom: model dimension */
  dModel?: number;
  /** Custom: number of attention heads */
  numHeads?: number;
  /** Custom: feed-forward hidden dimension */
  dFF?: number;
  /** Custom: number of transformer layers */
  numLayers?: number;
  /** Custom: maximum sequence length */
  maxSeqLen?: number;
}

/** Tokenizer section */
export interface ExperimentTokenizerSection {
  /** Tokenizer type: "bpe" to train, "load" to load from file */
  type: "bpe" | "load";
  /** Target vocabulary size when training BPE */
  vocabSize?: number;
  /** Path to serialized tokenizer state when loading */
  statePath?: string;
}

/** Optimizer section */
export interface ExperimentOptimizerSection {
  /** Optimizer type */
  type: "adamw" | "sgd";
  /** Learning rate */
  lr: number;
  /** Weight decay (AdamW: decoupled, SGD: L2) */
  weightDecay?: number;
  /** AdamW betas */
  betas?: [number, number];
  /** AdamW epsilon */
  eps?: number;
  /** SGD momentum */
  momentum?: number;
}

/** Scheduler section */
export type ExperimentSchedulerSection =
  | { type: "none" }
  | {
      type: "cosine";
      /** Number of linear warmup steps */
      warmupSteps?: number;
      /** Minimum learning rate (default: baseLR * 0.01) */
      minLR?: number;
    }
  | {
      type: "linear";
      /** Number of linear warmup steps */
      warmupSteps: number;
    };

/** Training hyperparameters section */
export interface ExperimentTrainingSection {
  /** Number of epochs */
  epochs: number;
  /** Gradient accumulation steps (micro-batches per optimizer step) */
  gradientAccumulationSteps?: number;
  /** Maximum gradient L2 norm for clipping (0 = disabled) */
  gradientClipNorm?: number;
  /** Log every N optimizer steps (0 = epoch-end only) */
  logInterval?: number;
  /** Evaluate every N optimizer steps (0 = epoch-end only) */
  evalEvery?: number;
}

/** Output section */
export interface ExperimentOutputSection {
  /** Output directory for checkpoints and logs */
  dir: string;
}

/**
 * Complete experiment configuration as stored in JSON.
 *
 * This is the full specification for a reproducible training
 * experiment. Every field needed to recreate the experiment
 * is included.
 */
export interface ExperimentConfigFile {
  /** Schema version for forward compatibility */
  version: 1;
  /** Human-readable experiment name */
  name: string;
  /** Optional description */
  description?: string;
  /** Random seed for full reproducibility */
  seed: number;
  /** Dataset configuration */
  dataset: ExperimentDatasetSection;
  /** Model architecture */
  model: ExperimentModelSection;
  /** Tokenizer configuration */
  tokenizer: ExperimentTokenizerSection;
  /** Optimizer configuration */
  optimizer: ExperimentOptimizerSection;
  /** Learning rate scheduler */
  scheduler: ExperimentSchedulerSection;
  /** Training hyperparameters */
  training: ExperimentTrainingSection;
  /** Output configuration */
  output: ExperimentOutputSection;
}

// ============================================================
// Default values
// ============================================================

/** Default experiment config (tiny model, inline data, 3 epochs) */
export const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfigFile = {
  version: 1,
  name: "default-experiment",
  description: "Default quick-training experiment",
  seed: 42,
  dataset: {
    type: "inline",
    blockSize: 64,
    batchSize: 4,
    shuffle: true,
  },
  model: {
    preset: "tiny",
    vocabSize: 1024,
  },
  tokenizer: {
    type: "bpe",
    vocabSize: 1024,
  },
  optimizer: {
    type: "adamw",
    lr: 3e-4,
    weightDecay: 0.01,
  },
  scheduler: {
    type: "cosine",
    warmupSteps: 50,
  },
  training: {
    epochs: 3,
    gradientAccumulationSteps: 1,
    gradientClipNorm: 1.0,
    logInterval: 10,
    evalEvery: 0,
  },
  output: {
    dir: ".cache/minimind/experiments",
  },
};

// ============================================================
// ExperimentConfig Class
// ============================================================

/**
 * ExperimentConfig — validated, loaded experiment configuration.
 *
 * Wraps ExperimentConfigFile with validation, defaults, and
 * serialization methods. All configs loaded from disk are
 * validated before use.
 *
 * Example:
 *   const config = ExperimentConfig.fromFile("configs/tinystories-tiny.json");
 *   console.log(config.data.name);          // "tinystories-tiny"
 *   console.log(config.data.model.preset);  // "tiny"
 */
export class ExperimentConfig {
  public readonly data: ExperimentConfigFile;
  public readonly sourcePath: string | null;

  private constructor(data: ExperimentConfigFile, sourcePath: string | null) {
    this.data = data;
    this.sourcePath = sourcePath;
  }

  // ============================================================
  // Factory Methods
  // ============================================================

  /**
   * Load and validate an experiment config from a JSON file.
   *
   * @param filePath - Path to the JSON config file
   * @returns Validated ExperimentConfig
   * @throws If file not found, invalid JSON, or validation fails
   */
  static fromFile(filePath: string): ExperimentConfig {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `ExperimentConfig.fromFile: file not found: ${resolved}`
      );
    }
    const raw = fs.readFileSync(resolved, "utf-8");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `ExperimentConfig.fromFile: invalid JSON in ${resolved}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    const validated = ExperimentConfig.validate(data);
    // Apply defaults
    const withDefaults = ExperimentConfig.applyDefaults(validated);
    return new ExperimentConfig(withDefaults, resolved);
  }

  /**
   * Create from an inline object (e.g., for programmatic use).
   *
   * @param data - Experiment config object
   * @returns Validated ExperimentConfig
   */
  static fromObject(data: ExperimentConfigFile): ExperimentConfig {
    const validated = ExperimentConfig.validate(data);
    const withDefaults = ExperimentConfig.applyDefaults(validated);
    return new ExperimentConfig(withDefaults, null);
  }

  /**
   * Create a default experiment config with optional overrides.
   */
  static default(overrides?: Partial<ExperimentConfigFile>): ExperimentConfig {
    const data = structuredClone(DEFAULT_EXPERIMENT_CONFIG);
    if (overrides) {
      ExperimentConfig.mergeOverrides(data, overrides);
    }
    return new ExperimentConfig(data, null);
  }

  // ============================================================
  // Serialization
  // ============================================================

  /**
   * Save config to a JSON file.
   */
  save(filePath: string): void {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, JSON.stringify(this.data, null, 2), "utf-8");
  }

  /**
   * Export as a plain JSON-serializable object.
   */
  toJSON(): ExperimentConfigFile {
    return structuredClone(this.data);
  }

  // ============================================================
  // Derived Values
  // ============================================================

  /**
   * Get effective model dimensions, resolving preset defaults.
   */
  getModelDimensions(): {
    vocabSize: number;
    dModel: number;
    numHeads: number;
    dFF: number;
    numLayers: number;
    maxSeqLen: number;
  } {
    const m = this.data.model;
    const defaults = ExperimentConfig.presetDefaults(m.preset);

    return {
      vocabSize: m.vocabSize,
      dModel: m.dModel ?? defaults.dModel,
      numHeads: m.numHeads ?? defaults.numHeads,
      dFF: m.dFF ?? defaults.dFF,
      numLayers: m.numLayers ?? defaults.numLayers,
      maxSeqLen: m.maxSeqLen ?? defaults.maxSeqLen,
    };
  }

  /**
   * Get the total number of optimizer steps for scheduler setup.
   */
  calculateTotalSteps(numBatchesPerEpoch: number): number {
    const accSteps = this.data.training.gradientAccumulationSteps ?? 1;
    return Math.floor(
      (numBatchesPerEpoch * this.data.training.epochs) / accSteps
    );
  }

  // ============================================================
  // Validation
  // ============================================================

  /**
   * Validate an experiment config object against the schema.
   *
   * @param data - Raw config object to validate
   * @returns The validated config (same object if valid)
   * @throws With descriptive message if validation fails
   */
  static validate(data: unknown): ExperimentConfigFile {
    if (typeof data !== "object" || data === null) {
      throw new Error("ExperimentConfig: config must be an object");
    }

    const cfg = data as Record<string, unknown>;

    // Version
    if (cfg.version !== 1) {
      throw new Error(
        `ExperimentConfig: unsupported version ${String(cfg.version)}`
      );
    }

    // Name
    if (typeof cfg.name !== "string" || cfg.name.trim().length === 0) {
      throw new Error("ExperimentConfig: name is required and must be non-empty");
    }

    // Seed
    if (typeof cfg.seed !== "number" || !Number.isInteger(cfg.seed)) {
      throw new Error("ExperimentConfig: seed must be an integer");
    }

    // Dataset
    if (typeof cfg.dataset !== "object" || cfg.dataset === null) {
      throw new Error("ExperimentConfig: dataset section is required");
    }
    const ds = cfg.dataset as Record<string, unknown>;
    if (!["tinystories", "textfile", "inline"].includes(String(ds.type))) {
      throw new Error(
        `ExperimentConfig: dataset.type must be "tinystories", "textfile", or "inline"`
      );
    }
    if (typeof ds.blockSize !== "number" || ds.blockSize < 2) {
      throw new Error("ExperimentConfig: dataset.blockSize must be >= 2");
    }
    if (typeof ds.batchSize !== "number" || ds.batchSize < 1) {
      throw new Error("ExperimentConfig: dataset.batchSize must be >= 1");
    }

    // Model
    if (typeof cfg.model !== "object" || cfg.model === null) {
      throw new Error("ExperimentConfig: model section is required");
    }
    const mdl = cfg.model as Record<string, unknown>;
    if (!["tiny", "mini", "custom"].includes(String(mdl.preset))) {
      throw new Error(
        `ExperimentConfig: model.preset must be "tiny", "mini", or "custom"`
      );
    }
    if (typeof mdl.vocabSize !== "number" || mdl.vocabSize < 2) {
      throw new Error("ExperimentConfig: model.vocabSize must be >= 2");
    }

    // Tokenizer
    if (typeof cfg.tokenizer !== "object" || cfg.tokenizer === null) {
      throw new Error("ExperimentConfig: tokenizer section is required");
    }
    const tok = cfg.tokenizer as Record<string, unknown>;
    if (!["bpe", "load"].includes(String(tok.type))) {
      throw new Error(
        `ExperimentConfig: tokenizer.type must be "bpe" or "load"`
      );
    }

    // Optimizer
    if (typeof cfg.optimizer !== "object" || cfg.optimizer === null) {
      throw new Error("ExperimentConfig: optimizer section is required");
    }
    const opt = cfg.optimizer as Record<string, unknown>;
    if (!["adamw", "sgd"].includes(String(opt.type))) {
      throw new Error(
        `ExperimentConfig: optimizer.type must be "adamw" or "sgd"`
      );
    }
    if (typeof opt.lr !== "number" || opt.lr <= 0) {
      throw new Error("ExperimentConfig: optimizer.lr must be > 0");
    }

    // Scheduler
    if (cfg.scheduler !== undefined) {
      if (typeof cfg.scheduler === "object" && cfg.scheduler !== null) {
        const sched = cfg.scheduler as Record<string, unknown>;
        if (
          sched.type !== "none" &&
          sched.type !== "cosine" &&
          sched.type !== "linear"
        ) {
          throw new Error(
            `ExperimentConfig: scheduler.type must be "none", "cosine", or "linear"`
          );
        }
      }
    }

    // Training
    if (typeof cfg.training !== "object" || cfg.training === null) {
      throw new Error("ExperimentConfig: training section is required");
    }
    const tr = cfg.training as Record<string, unknown>;
    if (typeof tr.epochs !== "number" || tr.epochs < 1) {
      throw new Error("ExperimentConfig: training.epochs must be >= 1");
    }

    // Output
    if (typeof cfg.output !== "object" || cfg.output === null) {
      throw new Error("ExperimentConfig: output section is required");
    }
    const out = cfg.output as Record<string, unknown>;
    if (typeof out.dir !== "string" || out.dir.trim().length === 0) {
      throw new Error("ExperimentConfig: output.dir must be a non-empty string");
    }

    return cfg as unknown as ExperimentConfigFile;
  }

  // ============================================================
  // Internal Helpers
  // ============================================================

  /**
   * Apply default values to optional fields that are missing.
   */
  private static applyDefaults(
    config: ExperimentConfigFile
  ): ExperimentConfigFile {
    const result = structuredClone(config);

    // Dataset defaults
    result.dataset.shuffle = config.dataset.shuffle ?? true;

    // Training defaults
    result.training.gradientAccumulationSteps =
      config.training.gradientAccumulationSteps ?? 1;
    result.training.gradientClipNorm =
      config.training.gradientClipNorm ?? 0;
    result.training.logInterval =
      config.training.logInterval ?? 10;
    result.training.evalEvery =
      config.training.evalEvery ?? 0;

    // Optimizer defaults
    if (result.optimizer.type === "adamw") {
      result.optimizer.weightDecay = config.optimizer.weightDecay ?? 0.01;
      result.optimizer.betas = config.optimizer.betas ?? [0.9, 0.999];
      result.optimizer.eps = config.optimizer.eps ?? 1e-8;
    }

    // Scheduler defaults
    if (
      typeof result.scheduler === "object" &&
      result.scheduler !== null &&
      result.scheduler.type === "cosine"
    ) {
      result.scheduler.warmupSteps = result.scheduler.warmupSteps ?? 500;
      result.scheduler.minLR = result.scheduler.minLR ?? config.optimizer.lr * 0.01;
    }

    return result;
  }

  /**
   * Get preset model dimensions.
   */
  private static presetDefaults(preset: "tiny" | "mini" | "custom"): {
    dModel: number;
    numHeads: number;
    dFF: number;
    numLayers: number;
    maxSeqLen: number;
  } {
    switch (preset) {
      case "tiny":
        return {
          dModel: 128,
          numHeads: 4,
          dFF: 512,
          numLayers: 2,
          maxSeqLen: 128,
        };
      case "mini":
        return {
          dModel: 512,
          numHeads: 8,
          dFF: 2048,
          numLayers: 8,
          maxSeqLen: 256,
        };
      case "custom":
        return {
          dModel: 256,
          numHeads: 8,
          dFF: 1024,
          numLayers: 6,
          maxSeqLen: 128,
        };
    }
  }

  /**
   * Merge partial overrides into a config object (shallow merge per section).
   */
  private static mergeOverrides(
    target: ExperimentConfigFile,
    overrides: Partial<ExperimentConfigFile>
  ): void {
    if (overrides.name !== undefined) target.name = overrides.name;
    if (overrides.description !== undefined)
      target.description = overrides.description;
    if (overrides.seed !== undefined) target.seed = overrides.seed;
    if (overrides.dataset) Object.assign(target.dataset, overrides.dataset);
    if (overrides.model) Object.assign(target.model, overrides.model);
    if (overrides.tokenizer)
      Object.assign(target.tokenizer, overrides.tokenizer);
    if (overrides.optimizer)
      Object.assign(target.optimizer, overrides.optimizer);
    if (overrides.scheduler)
      Object.assign(target.scheduler, overrides.scheduler);
    if (overrides.training)
      Object.assign(target.training, overrides.training);
    if (overrides.output) Object.assign(target.output, overrides.output);
  }
}
