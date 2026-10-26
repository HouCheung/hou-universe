// ============================================================
// MiniMind CLI — TrainingConfig.ts
// ============================================================
// Reproducible training configuration schema.
//
// Configuration is JSON-serializable for full reproducibility.
// Every training run can be saved alongside its checkpoint for
// exact reproduction of results.
//
// Usage:
//   const config = TrainingConfig.fromFile("train-config.json");
//   const config = TrainingConfig.tiny(); // quick preset
//   config.save("run-001-config.json");
// ============================================================

import * as fs from "fs";

// ============================================================
// Config types
// ============================================================

export interface TrainingConfigFile {
  /** Schema version for forward compatibility */
  version: 1;

  /** Experiment metadata */
  metadata: {
    /** Human-readable name for this run */
    name: string;
    /** Optional description */
    description?: string;
    /** Random seed for reproducibility */
    seed: number;
  };

  /** Model architecture */
  model: {
    /** Preset: "tiny" | "mini" | "custom" */
    preset: "tiny" | "mini" | "custom";
    /** Custom overrides (only used when preset is "custom") */
    vocabSize?: number;
    dModel?: number;
    numHeads?: number;
    dFF?: number;
    numLayers?: number;
    maxSeqLen?: number;
  };

  /** Tokenizer */
  tokenizer: {
    /** Tokenizer type: "bpe" to train from data, "load" to load from file */
    type: "bpe" | "load";
    /** For "bpe": target vocabulary size */
    vocabSize?: number;
    /** For "load": path to serialized tokenizer state */
    statePath?: string;
  };

  /** Dataset */
  dataset: {
    /** Dataset type */
    type: "tinystories" | "textfile" | "inline";
    /** For "tinystories": split name */
    split?: "train" | "validation";
    /** For "textfile": path to corpus file */
    path?: string;
    /** Maximum number of documents to load */
    maxDocuments?: number;
    /** Sequence block size for causal LM samples */
    blockSize: number;
  };

  /** Training hyperparameters */
  training: {
    /** Number of epochs */
    epochs: number;
    /** Batch size */
    batchSize: number;
    /** Learning rate */
    learningRate: number;
    /** Weight decay (AdamW) */
    weightDecay: number;
    /** Gradient accumulation steps */
    gradientAccumulationSteps: number;
    /** Maximum gradient norm (clip) — 0 = disabled */
    maxGradNorm: number;
    /** Number of warmup steps for LR scheduler */
    warmupSteps: number;
    /** Evaluation every N steps — 0 = epoch-end only */
    evalEvery: number;
    /** Save checkpoint every N steps — 0 = epoch-end only */
    saveEvery: number;
  };

  /** Output */
  output: {
    /** Directory for checkpoints and logs */
    dir: string;
    /** Save final model only (skip intermediate checkpoints) */
    finalOnly: boolean;
  };
}

/** Default tiny config for quick training validation */
export const TINY_TRAINING_CONFIG: TrainingConfigFile = {
  version: 1,
  metadata: {
    name: "tiny-quick-train",
    description: "Quick training validation with tiny model",
    seed: 42,
  },
  model: {
    preset: "tiny",
  },
  tokenizer: {
    type: "bpe",
    vocabSize: 1024,
  },
  dataset: {
    type: "inline",
    blockSize: 64,
    maxDocuments: 100,
  },
  training: {
    epochs: 3,
    batchSize: 8,
    learningRate: 3e-4,
    weightDecay: 0.01,
    gradientAccumulationSteps: 1,
    maxGradNorm: 1.0,
    warmupSteps: 50,
    evalEvery: 0,
    saveEvery: 0,
  },
  output: {
    dir: ".cache/minimind/runs",
    finalOnly: true,
  },
};

// ============================================================
// TrainingConfig
// ============================================================

export class TrainingConfig {
  public readonly data: TrainingConfigFile;

  private constructor(data: TrainingConfigFile) {
    this.data = data;
  }

  // ============================================================
  // Factory methods
  // ============================================================

  /** Load config from a JSON file */
  static fromFile(filePath: string): TrainingConfig {
    if (!fs.existsSync(filePath)) {
      throw new Error(`TrainingConfig.fromFile: file not found: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as TrainingConfigFile;
    TrainingConfig.validate(data);
    return new TrainingConfig(data);
  }

  /** Create from an inline config object */
  static fromObject(data: TrainingConfigFile): TrainingConfig {
    TrainingConfig.validate(data);
    return new TrainingConfig(data);
  }

  /** Quick tiny training preset */
  static tiny(overrides?: Partial<TrainingConfigFile>): TrainingConfig {
    const data = structuredClone(TINY_TRAINING_CONFIG);
    if (overrides) {
      TrainingConfig.mergeOverrides(data, overrides);
    }
    return new TrainingConfig(data);
  }

  // ============================================================
  // Serialization
  // ============================================================

  /** Save config to a JSON file */
  save(filePath: string): void {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  /** Export as plain object */
  toJSON(): TrainingConfigFile {
    return structuredClone(this.data);
  }

  // ============================================================
  // Derived values
  // ============================================================

  /** Effective model dimensions based on preset */
  getModelDimensions(): {
    vocabSize: number;
    dModel: number;
    numHeads: number;
    dFF: number;
    numLayers: number;
    maxSeqLen: number;
  } {
    const m = this.data.model;
    if (m.preset === "tiny") {
      return {
        vocabSize: m.vocabSize ?? 1024,
        dModel: 128,
        numHeads: 4,
        dFF: 512,
        numLayers: 2,
        maxSeqLen: m.maxSeqLen ?? 128,
      };
    }
    if (m.preset === "mini") {
      return {
        vocabSize: m.vocabSize ?? 6400,
        dModel: 512,
        numHeads: 8,
        dFF: 2048,
        numLayers: 8,
        maxSeqLen: m.maxSeqLen ?? 256,
      };
    }
    // Custom
    return {
      vocabSize: m.vocabSize ?? 1024,
      dModel: m.dModel ?? 128,
      numHeads: m.numHeads ?? 4,
      dFF: m.dFF ?? 512,
      numLayers: m.numLayers ?? 2,
      maxSeqLen: m.maxSeqLen ?? 128,
    };
  }

  // ============================================================
  // Validation
  // ============================================================

  private static validate(data: TrainingConfigFile): void {
    if (data.version !== 1) {
      throw new Error(`TrainingConfig: unsupported version ${data.version}`);
    }
    if (!data.metadata?.name) {
      throw new Error("TrainingConfig: metadata.name is required");
    }
    if (!data.model?.preset) {
      throw new Error("TrainingConfig: model.preset is required");
    }
    if (!["tiny", "mini", "custom"].includes(data.model.preset)) {
      throw new Error(`TrainingConfig: unknown preset "${data.model.preset}"`);
    }
    if (data.training.epochs < 1) {
      throw new Error("TrainingConfig: training.epochs must be >= 1");
    }
    if (data.training.batchSize < 1) {
      throw new Error("TrainingConfig: training.batchSize must be >= 1");
    }
    if (data.training.learningRate <= 0) {
      throw new Error("TrainingConfig: training.learningRate must be > 0");
    }
    if (data.dataset.blockSize < 2) {
      throw new Error("TrainingConfig: dataset.blockSize must be >= 2");
    }
  }

  private static mergeOverrides(
    target: TrainingConfigFile,
    overrides: Partial<TrainingConfigFile>
  ): void {
    if (overrides.metadata) Object.assign(target.metadata, overrides.metadata);
    if (overrides.model) Object.assign(target.model, overrides.model);
    if (overrides.tokenizer) Object.assign(target.tokenizer, overrides.tokenizer);
    if (overrides.dataset) Object.assign(target.dataset, overrides.dataset);
    if (overrides.training) Object.assign(target.training, overrides.training);
    if (overrides.output) Object.assign(target.output, overrides.output);
  }
}
