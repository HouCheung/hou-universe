// ============================================================
// MiniMind — research/benchmark/ExperimentFingerprint.ts
// ============================================================
// Phase 62: Deterministic experiment fingerprinting.
//
// Provides a stable, content-addressed identity for an experiment
// config. Two experiments with the same fingerprint are guaranteed
// to have identical configuration and should produce identical
// results when run with the same seed.
//
// The fingerprint covers:
//   - Model architecture (layers, heads, dModel, dFF, vocabSize, maxSeqLen)
//   - Training hyperparameters (lr, batchSize, epochs, gradAccum, gradClip, seed)
//   - Dataset config (name, blockSize, batchSize, shuffle)
//   - Tokenizer config (type, vocabSize)
//
// Design principles:
//   - Deterministic — same config → same fingerprint
//   - Sensitive — any key change → different fingerprint
//   - Browser-safe — no fs/path dependencies
//   - Reuses existing FNV-1a pattern from ReproducibilityCertificate
//   - Works with ResearchExperiment and raw config objects alike
// ============================================================

// ============================================================
// Fingerprint Input Types
// ============================================================

/**
 * Canonical model config for fingerprinting.
 * Subset of ModelConfigEntry — only the fields that affect output.
 */
export interface FingerprintModelConfig {
  /** Model name / preset identifier */
  name?: string;
  /** Display label */
  label?: string;
  /** Hidden dimension */
  dModel: number;
  /** Number of attention heads */
  numHeads: number;
  /** Feed-forward hidden dimension */
  dFF: number;
  /** Number of transformer layers */
  numLayers: number;
  /** Maximum sequence length */
  maxSeqLen: number;
  /** Vocabulary size */
  vocabSize: number;
}

/**
 * Canonical training config for fingerprinting.
 * Subset of TrainingRecipe — only the fields that affect output.
 */
export interface FingerprintTrainingConfig {
  /** Recipe name */
  name?: string;
  /** Number of epochs */
  epochs: number;
  /** Learning rate */
  lr: number;
  /** Batch size (inferred from dataset or recipe) */
  batchSize?: number;
  /** Weight decay */
  weightDecay?: number;
  /** Optimizer type */
  optimizerType?: string;
  /** Scheduler type */
  schedulerType?: string;
  /** Gradient clipping norm */
  gradientClipNorm?: number;
  /** Gradient accumulation steps */
  gradientAccumulation?: number;
}

/**
 * Canonical dataset config for fingerprinting.
 */
export interface FingerprintDatasetConfig {
  /** Dataset name */
  name: string;
  /** Block size (sequence length) */
  blockSize: number;
  /** Batch size */
  batchSize: number;
  /** Whether shuffle is enabled */
  shuffle: boolean;
  /** Dataset type */
  type?: string;
}

/**
 * Canonical tokenizer config for fingerprinting.
 */
export interface FingerprintTokenizerConfig {
  /** Tokenizer type (bpe, character, word) */
  type: string;
  /** Vocabulary size */
  vocabSize: number;
}

/**
 * Complete experiment identity for fingerprinting.
 */
export interface ExperimentIdentity {
  /** Random seed */
  seed: number;
  /** Model config */
  model: FingerprintModelConfig;
  /** Training config */
  training: FingerprintTrainingConfig;
  /** Dataset config */
  dataset: FingerprintDatasetConfig;
  /** Tokenizer config */
  tokenizer: FingerprintTokenizerConfig;
}

// ============================================================
// Fingerprint Result
// ============================================================

/**
 * A computed experiment fingerprint.
 */
export interface ExperimentFingerprint {
  /** Per-component hashes (hex strings) */
  components: {
    model: string;
    training: string;
    dataset: string;
    tokenizer: string;
  };
  /** Combined hash of all components + seed */
  combined: string;
  /** The seed used */
  seed: number;
  /** Timestamp when this fingerprint was computed */
  computedAt: number;
}

// ============================================================
// FNV-1a Hash (reuses pattern from ReproducibilityCertificate)
// ============================================================

/**
 * FNV-1a 32-bit hash.
 *
 * A simple, deterministic, non-cryptographic hash function.
 * Same input always produces the same hash.
 */
function fnv1a32(input: string): number {
  let hash = 2166136261; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime (32-bit)
  }
  return hash >>> 0; // Unsigned 32-bit
}

/**
 * Convert a hash number to an 8-char hex string.
 */
function toHex(hash: number): string {
  return hash.toString(16).padStart(8, "0");
}

// ============================================================
// Stable Serialization (deterministic JSON with sorted keys)
// ============================================================

/**
 * Stable JSON serialization: sorts object keys for deterministic output.
 *
 * Regular JSON.stringify may produce different output for the same
 * object if keys are in different insertion order. This ensures
 * consistent output regardless of key order.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((v) => stableStringify(v));
    return `[${items.join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const items = keys.map((k) => `"${k}":${stableStringify(obj[k])}`);
  return `{${items.join(",")}}`;
}

// ============================================================
// Component Fingerprint Computation
// ============================================================

/**
 * Compute the model config fingerprint.
 *
 * Only includes fields that materially affect model output.
 * Fields like `name` and `label` are included for identity
 * but `dModel`, `numHeads`, `dFF`, `numLayers`, `maxSeqLen`,
 * and `vocabSize` are the critical dimensions.
 */
function hashModelConfig(config: FingerprintModelConfig): string {
  const canonical = {
    dModel: config.dModel,
    dFF: config.dFF,
    maxSeqLen: config.maxSeqLen,
    name: config.name ?? "",
    numHeads: config.numHeads,
    numLayers: config.numLayers,
    vocabSize: config.vocabSize,
  };
  return toHex(fnv1a32(stableStringify(canonical)));
}

/**
 * Compute the training config fingerprint.
 *
 * Covers learning rate, epochs, batch size, optimizer type,
 * scheduler type, gradient clipping, and gradient accumulation.
 * Weight decay is included when present.
 */
function hashTrainingConfig(config: FingerprintTrainingConfig): string {
  const canonical = {
    batchSize: config.batchSize ?? 0,
    epochs: config.epochs,
    gradientAccumulation: config.gradientAccumulation ?? 1,
    gradientClipNorm: config.gradientClipNorm ?? 0,
    lr: config.lr,
    name: config.name ?? "",
    optimizerType: config.optimizerType ?? "adamw",
    schedulerType: config.schedulerType ?? "cosine",
    weightDecay: config.weightDecay ?? 0,
  };
  return toHex(fnv1a32(stableStringify(canonical)));
}

/**
 * Compute the dataset config fingerprint.
 */
function hashDatasetConfig(config: FingerprintDatasetConfig): string {
  const canonical = {
    batchSize: config.batchSize,
    blockSize: config.blockSize,
    name: config.name,
    shuffle: config.shuffle,
    type: config.type ?? "inline",
  };
  return toHex(fnv1a32(stableStringify(canonical)));
}

/**
 * Compute the tokenizer config fingerprint.
 */
function hashTokenizerConfig(config: FingerprintTokenizerConfig): string {
  const canonical = {
    type: config.type,
    vocabSize: config.vocabSize,
  };
  return toHex(fnv1a32(stableStringify(canonical)));
}

// ============================================================
// Public API
// ============================================================

/**
 * Create a deterministic experiment fingerprint from canonical configs.
 *
 * Two experiments with the same fingerprint share identical configuration
 * and, when run with the same seed, should produce identical results.
 *
 * @param identity — the experiment's canonical identity
 * @returns a structured fingerprint with per-component and combined hashes
 *
 * Usage:
 *   const fp = createExperimentFingerprint({
 *     seed: 42,
 *     model: { dModel: 128, numHeads: 4, dFF: 512, numLayers: 4, maxSeqLen: 256, vocabSize: 32000 },
 *     training: { epochs: 10, lr: 0.001 },
 *     dataset: { name: "tinystories", blockSize: 128, batchSize: 8, shuffle: true },
 *     tokenizer: { type: "bpe", vocabSize: 32000 },
 *   });
 *   console.log(fp.combined); // "a3f8c21e"
 */
export function createExperimentFingerprint(
  identity: ExperimentIdentity
): ExperimentFingerprint {
  const components = {
    model: hashModelConfig(identity.model),
    training: hashTrainingConfig(identity.training),
    dataset: hashDatasetConfig(identity.dataset),
    tokenizer: hashTokenizerConfig(identity.tokenizer),
  };

  // Combined hash: all component hashes + seed
  const combinedInput = [
    components.model,
    components.training,
    components.dataset,
    components.tokenizer,
    String(identity.seed),
  ].join(":");

  return {
    components,
    combined: toHex(fnv1a32(combinedInput)),
    seed: identity.seed,
    computedAt: Date.now(),
  };
}

/**
 * Compare two experiment fingerprints for identity.
 *
 * Returns true only if ALL components AND the seed match.
 * A difference in any single field produces a different fingerprint.
 *
 * @returns detailed comparison result
 */
export function compareExperimentIdentity(
  a: ExperimentFingerprint,
  b: ExperimentFingerprint
): {
  /** Whether the experiments are identical */
  identical: boolean;
  /** Which components match */
  matches: {
    model: boolean;
    training: boolean;
    dataset: boolean;
    tokenizer: boolean;
    seed: boolean;
  };
  /** Human-readable summary */
  summary: string;
} {
  const matches = {
    model: a.components.model === b.components.model,
    training: a.components.training === b.components.training,
    dataset: a.components.dataset === b.components.dataset,
    tokenizer: a.components.tokenizer === b.components.tokenizer,
    seed: a.seed === b.seed,
  };

  const identical = Object.values(matches).every(Boolean);

  const mismatches = Object.entries(matches)
    .filter(([, m]) => !m)
    .map(([k]) => k);

  const summary = identical
    ? "Experiments are identical — all configs and seed match."
    : `Experiments differ in: ${mismatches.join(", ")}.`;

  return { identical, matches, summary };
}

/**
 * Format a fingerprint as a compact human-readable string.
 *
 * @param fp — the fingerprint to format
 * @returns a multi-line string suitable for logging or display
 */
export function formatFingerprint(fp: ExperimentFingerprint): string {
  const lines: string[] = [
    `Fingerprint: ${fp.combined}`,
    `  Seed:      ${fp.seed}`,
    `  Model:     ${fp.components.model}`,
    `  Training:  ${fp.components.training}`,
    `  Dataset:   ${fp.components.dataset}`,
    `  Tokenizer: ${fp.components.tokenizer}`,
  ];
  return lines.join("\n");
}

/**
 * Extract an ExperimentIdentity from a ResearchExperiment-like object.
 *
 * This is a convenience adapter that works with any object matching
 * the ResearchExperiment shape (modelConfig, trainingConfig, etc.).
 * It does NOT import ResearchExperiment to avoid circular dependencies.
 *
 * @param experiment — an object with modelConfig, trainingConfig, datasetConfig, tokenizerConfig, seed
 * @returns the canonical ExperimentIdentity for fingerprinting
 */
export function extractExperimentIdentity(experiment: {
  seed: number;
  modelConfig: {
    name?: string;
    label?: string;
    dModel?: number;
    numHeads?: number;
    dFF?: number;
    numLayers?: number;
    maxSeqLen?: number;
    vocabSize?: number;
  };
  trainingConfig: {
    name?: string;
    epochs: number;
    optimizer: { lr: number; weightDecay?: number; type?: string };
    scheduler?: { type?: string };
    gradientClipNorm?: number;
    gradientAccumulation?: number;
    batchSize?: number;
  };
  datasetConfig: {
    name: string;
    blockSize: number;
    batchSize: number;
    shuffle: boolean;
    type?: string;
  };
  tokenizerConfig: {
    type: string;
    vocabSize: number;
  };
}): ExperimentIdentity {
  return {
    seed: experiment.seed,
    model: {
      name: experiment.modelConfig.name,
      label: experiment.modelConfig.label,
      dModel: experiment.modelConfig.dModel ?? 0,
      numHeads: experiment.modelConfig.numHeads ?? 0,
      dFF: experiment.modelConfig.dFF ?? 0,
      numLayers: experiment.modelConfig.numLayers ?? 0,
      maxSeqLen: experiment.modelConfig.maxSeqLen ?? 0,
      vocabSize: experiment.modelConfig.vocabSize ?? 0,
    },
    training: {
      name: experiment.trainingConfig.name,
      epochs: experiment.trainingConfig.epochs,
      lr: experiment.trainingConfig.optimizer.lr,
      batchSize: experiment.trainingConfig.batchSize,
      weightDecay: experiment.trainingConfig.optimizer.weightDecay,
      optimizerType: experiment.trainingConfig.optimizer.type,
      schedulerType: experiment.trainingConfig.scheduler?.type,
      gradientClipNorm: experiment.trainingConfig.gradientClipNorm,
      gradientAccumulation: experiment.trainingConfig.gradientAccumulation,
    },
    dataset: {
      name: experiment.datasetConfig.name,
      blockSize: experiment.datasetConfig.blockSize,
      batchSize: experiment.datasetConfig.batchSize,
      shuffle: experiment.datasetConfig.shuffle,
      type: experiment.datasetConfig.type,
    },
    tokenizer: {
      type: experiment.tokenizerConfig.type,
      vocabSize: experiment.tokenizerConfig.vocabSize,
    },
  };
}
