// ============================================================
// Checkpoint — Save/Load training state for MiniMind
// ============================================================
// Phase 42: Full training checkpoint system supporting
// model parameters, optimizer state, scheduler state,
// and trainer state serialization.
//
// Design:
//   - JSON-compatible format for portability
//   - Model parameters stored as { name, shape, data[] }
//   - Optimizer state stores type, config, moment buffers
//   - Scheduler state stored via its stateDict() method
//   - Trainer state stored as flat TrainingStateSnapshot
//
// Guarantees:
//   - After save → load → continue training:
//     • Loss trajectory is continuous (no discontinuity)
//     • Parameter values are identical (diff < 1e-10)
//     • Optimizer momentum (m, v) is preserved
//
// Usage:
//   const checkpoint = saveCheckpoint({ model, optimizer, scheduler, trainerState });
//   // ... later ...
//   loadCheckpoint(checkpoint, { model, optimizer, scheduler, state });
// ============================================================

import type { Parameter } from "../../core/Parameter";
import type { Optimizer } from "../../core/optim/Optimizer";
import type { AdamWOptimizer } from "../../core/optim/AdamW";
import type { SGDOptimizer } from "../../core/optim/SGD";
import type { LRScheduler } from "../../core/scheduler/LRScheduler";
import type { TrainingStateSnapshot } from "../TrainingState";
import type { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import type { DataLoaderState } from "../../data/DataLoader";
import type { StreamingDataLoaderState } from "../../data/streaming/StreamingDataLoader";
import type { BPETokenizerState } from "../../tokenizer/BPETokenizer";
import { Random } from "../../core/random/Random";

// ============================================================
// Type definitions
// ============================================================

/**
 * Checkpoint format version (incremented on breaking format changes).
 * v2: Added randomState and dataloaderState (Phase 48).
 * v3: Added streamingDataloaderState (Phase 49).
 */
const CHECKPOINT_VERSION = 3;

/**
 * Serialized model parameter entry.
 */
interface SerializedParam {
  name: string;
  shape: number[];
  data: number[];
}

/**
 * Serialized optimizer parameter state (AdamW moments).
 */
interface SerializedOptParamState {
  m?: number[];
  v?: number[];
}

/**
 * Serialized optimizer state.
 */
interface SerializedOptimizerState {
  type: "AdamW" | "SGD";
  stepCount: number;
  config: {
    lr: number;
    learningRate?: number;
    betas?: [number, number];
    eps?: number;
    weightDecay?: number;
  };
  paramStates: SerializedOptParamState[];
}

/**
 * Configuration metadata recorded in a checkpoint (Phase 80).
 *
 * Guarantees the checkpoint is self-describing: generation can
 * reconstruct the model + tokenizer WITHOUT re-deriving config from
 * hardcoded literals. Must satisfy:
 *
 *   checkpoint.metadata.modelConfig.vocabSize
 *     === checkpoint.metadata.vocabSize
 *     === tokenizer.vocabSize
 */
export interface CheckpointMetadata {
  /** Full model architecture used to train this checkpoint */
  modelConfig: {
    vocabSize: number;
    dModel: number;
    numHeads: number;
    dFF: number;
    numLayers: number;
    maxSeqLen: number;
  };
  /** Tokenizer vocabulary size (must equal modelConfig.vocabSize) */
  vocabSize: number;
  /** Exact parameter count of the model */
  parameterCount: number;
  /** Dataset identifier the model was trained on */
  trainingDataset: string;
  /** Dataset content version the model was trained on (Phase 82) */
  datasetVersion?: string;
  /** Dataset schema version the model was trained on (Phase 82) */
  datasetSchemaVersion?: number;
  /** Dataset purpose the model was trained on (Phase 82) */
  datasetPurpose?: string;
  /** Total planned training steps (epochs × batchesPerEpoch) */
  trainingSteps: number;
  /** Requested number of epochs (actual, not truncated) */
  epochs: number;
  /** Unix timestamp (ms) when the checkpoint was created */
  createdAt: number;
  /** Serialized tokenizer state (BPETokenizerState) for lossless reload */
  tokenizerState?: BPETokenizerState;
}

/**
 * Full checkpoint data structure.
 */
export interface CheckpointData {
  version: number;
  timestamp: number;
  modelParams: SerializedParam[];
  optimizerState: SerializedOptimizerState;
  schedulerState: object | null;
  trainerState: TrainingStateSnapshot;
  /** Global Random RNG state (Phase 48) — array from Random.saveState() */
  randomState: number[];
  /** DataLoader positional state (Phase 48) — null if not captured */
  dataloaderState: DataLoaderState | null;
  /** StreamingDataLoader positional state (Phase 49) — null if not using streaming */
  streamingDataloaderState: StreamingDataLoaderState | null;
  /** Configuration metadata (Phase 80) — optional for backward compat */
  metadata?: CheckpointMetadata;
}

/**
 * Input to saveCheckpoint.
 */
export interface SaveCheckpointOptions {
  /** Model instance (must have namedParameters()) */
  model: TensorMiniMindModel;
  /** Optimizer instance (AdamW or SGD) */
  optimizer: Optimizer;
  /** Optional LR scheduler */
  scheduler?: LRScheduler;
  /** Training state snapshot from Trainer */
  trainerState: TrainingStateSnapshot;
  /** Configuration metadata (Phase 80) — recorded verbatim */
  metadata?: CheckpointMetadata;
}

/**
 * Input to loadCheckpoint.
 */
export interface LoadCheckpointOptions {
  /** Model instance to restore parameters into */
  model: TensorMiniMindModel;
  /** Optimizer instance to restore state into */
  optimizer: Optimizer;
  /** Optional LR scheduler to restore state into */
  scheduler?: LRScheduler;
  /** TrainingState to restore into (mutable) */
  state?: { loadSnapshot(snap: TrainingStateSnapshot): void };
  /** The checkpoint data to restore from */
  checkpoint: CheckpointData;
}

// ============================================================
// Save
// ============================================================

/**
 * Save a complete training checkpoint.
 *
 * Captures model parameters, optimizer state, scheduler state,
 * and trainer state into a single JSON-compatible object.
 *
 * The returned CheckpointData can be serialized via JSON.stringify
 * and later restored via loadCheckpoint.
 *
 * @param options - All components to checkpoint
 * @returns Serializable checkpoint data
 */
export function saveCheckpoint(options: SaveCheckpointOptions): CheckpointData {
  const { model, optimizer, scheduler, trainerState, metadata } = options;

  // ── 1. Serialize model parameters ──
  const modelParams = serializeModelParams(model);

  // ── 2. Serialize optimizer state ──
  const optimizerState = serializeOptimizerState(optimizer);

  // ── 3. Serialize scheduler state ──
  const schedulerState = scheduler ? scheduler.stateDict() : null;

  // ── 4. Capture global Random RNG state (Phase 48) ──
  const randomState = Random.saveState();

  // ── 5. Extract DataLoader state from trainerState (Phase 48) ──
  const dataloaderState = trainerState.dataloaderState ?? null;

  // ── 6. Extract StreamingDataLoader state from trainerState (Phase 49) ──
  const streamingDataloaderState = trainerState.streamingDataloaderState ?? null;

  // ── 7. Build checkpoint ──
  const checkpoint: CheckpointData = {
    version: CHECKPOINT_VERSION,
    timestamp: Date.now(),
    modelParams,
    optimizerState,
    schedulerState,
    trainerState,
    randomState,
    dataloaderState,
    streamingDataloaderState,
    metadata,
  };

  return checkpoint;
}

/**
 * Save checkpoint to JSON string.
 *
 * Convenience wrapper — equivalent to JSON.stringify(saveCheckpoint(opts)).
 */
export function saveCheckpointJSON(options: SaveCheckpointOptions): string {
  return JSON.stringify(saveCheckpoint(options), null, 2);
}

// ============================================================
// Load
// ============================================================

/**
 * Restore all training state from a checkpoint.
 *
 * After loading:
 *   - Model parameters match the checkpoint exactly (bit-identical)
 *   - Optimizer momentum (m, v) and step count are restored
 *   - Scheduler state is restored
 *   - TrainingState is refreshed from the snapshot
 *
 * The model, optimizer, and scheduler must be compatible with
 * the checkpoint (same architecture, same hyperparameters).
 * Shape mismatches will throw an error.
 *
 * @param options - Model, optimizer, scheduler, and checkpoint data
 * @throws If parameter shapes don't match
 */
export function loadCheckpoint(options: LoadCheckpointOptions): void {
  const { model, optimizer, scheduler, state, checkpoint } = options;

  // Validate version
  // Supports v1 (legacy), v2, and v3 (current) checkpoints
  if (checkpoint.version !== CHECKPOINT_VERSION && checkpoint.version !== 1 && checkpoint.version !== 2) {
    throw new Error(
      `loadCheckpoint: version mismatch. ` +
      `Checkpoint is v${checkpoint.version}, expected v${CHECKPOINT_VERSION}`
    );
  }

  // ── 1. Restore global Random RNG state FIRST (Phase 48) ──
  // Must be done before any operations that consume randomness,
  // so that the next random numbers match the original sequence.
  if (checkpoint.randomState) {
    Random.restoreState(checkpoint.randomState);
  }

  // ── 2. Restore model parameters ──
  deserializeModelParams(model, checkpoint.modelParams);

  // ── 3. Restore optimizer state ──
  deserializeOptimizerState(optimizer, checkpoint.optimizerState);

  // ── 4. Restore scheduler state ──
  if (scheduler && checkpoint.schedulerState) {
    scheduler.loadStateDict(checkpoint.schedulerState as Parameters<typeof scheduler.loadStateDict>[0]);
  }

  // ── 5. Restore training state ──
  if (state) {
    state.loadSnapshot(checkpoint.trainerState);
  }
}

/**
 * Load checkpoint from a JSON string.
 *
 * Convenience wrapper — equivalent to:
 *   loadCheckpoint({ ...opts, checkpoint: JSON.parse(json) })
 */
export function loadCheckpointJSON(
  json: string,
  options: Omit<LoadCheckpointOptions, "checkpoint">
): void {
  const checkpoint = JSON.parse(json) as CheckpointData;
  loadCheckpoint({ ...options, checkpoint });
}

// ============================================================
// Internal — Model parameter serialization
// ============================================================

/**
 * Serialize all named parameters from a model into a portable format.
 *
 * Each parameter is stored as { name, shape, data[] }.
 * The data is a plain number array (not Float64Array).
 */
function serializeModelParams(
  model: TensorMiniMindModel
): SerializedParam[] {
  const params: SerializedParam[] = [];

  for (const { name, parameter } of model.namedParameters()) {
    params.push({
      name,
      shape: [...parameter.shape],
      data: Array.from(parameter.data),
    });
  }

  return params;
}

/**
 * Restore model parameters from serialized data.
 *
 * Parameters are matched by name. The shapes must match exactly.
 * Data is copied element-by-element into the existing Float64Array
 * (in-place, preserving references for optimizer WeakMap keys).
 */
function deserializeModelParams(
  model: TensorMiniMindModel,
  savedParams: SerializedParam[]
): void {
  // Build a map of existing parameters by name
  const paramMap = new Map<string, Parameter>();
  for (const { name, parameter } of model.namedParameters()) {
    paramMap.set(name, parameter);
  }

  const restored = new Set<string>();

  for (const saved of savedParams) {
    const param = paramMap.get(saved.name);

    if (!param) {
      throw new Error(
        `loadCheckpoint: parameter "${saved.name}" not found in model. ` +
        `The checkpoint may be from a different model architecture.`
      );
    }

    if (restored.has(saved.name)) {
      throw new Error(
        `loadCheckpoint: duplicate parameter "${saved.name}" in checkpoint.`
      );
    }

    // Validate shape
    const savedShape = saved.shape.join(",");
    const currentShape = param.shape.join(",");
    if (savedShape !== currentShape) {
      throw new Error(
        `loadCheckpoint: shape mismatch for "${saved.name}". ` +
        `Checkpoint: [${savedShape}], model: [${currentShape}]`
      );
    }

    // Validate data length
    if (saved.data.length !== param.data.length) {
      throw new Error(
        `loadCheckpoint: data length mismatch for "${saved.name}". ` +
        `Checkpoint: ${saved.data.length}, model: ${param.data.length}`
      );
    }

    // Copy data in-place (preserving Float64Array reference)
    for (let i = 0; i < saved.data.length; i++) {
      const value = saved.data[i];
      if (!Number.isFinite(value)) {
        throw new Error(
          `loadCheckpoint: non-finite value at "${saved.name}[${i}]". ` +
          `The checkpoint is corrupt.`
        );
      }
      param.data[i] = value;
    }

    restored.add(saved.name);
  }

  // A partial checkpoint must never load: missing parameters would remain
  // at their random initial values while the caller believes the model was
  // restored. Reject instead of failing silently.
  const missing: string[] = [];
  for (const { name } of model.namedParameters()) {
    if (!restored.has(name)) missing.push(name);
  }
  if (missing.length > 0) {
    const preview = missing.slice(0, 5).join(", ");
    const suffix = missing.length > 5 ? `, … (+${missing.length - 5} more)` : "";
    throw new Error(
      `loadCheckpoint: ${missing.length} model parameter(s) missing from the ` +
      `checkpoint: ${preview}${suffix}. Refusing to load a partially ` +
      `initialized model.`
    );
  }
}

// ============================================================
// Internal — Optimizer state serialization
// ============================================================

/**
 * Serialize optimizer state into a portable format.
 *
 * Handles both AdamW (with m, v moment buffers) and SGD.
 * The optimizer type is recorded for validation during restore.
 */
function serializeOptimizerState(
  optimizer: Optimizer
): SerializedOptimizerState {
  const opt = optimizer as AdamWOptimizer & SGDOptimizer;

  // Determine optimizer type
  const type: "AdamW" | "SGD" = "getState" in optimizer ? "AdamW" : "SGD";

  // Serialize config
  const config: SerializedOptimizerState["config"] = {
    lr: "lr" in opt ? opt.lr : 0,
  };

  if ("learningRate" in opt) {
    config.learningRate = opt.learningRate;
  }

  if (type === "AdamW") {
    const adamw = optimizer as AdamWOptimizer;
    config.betas = [...adamw.betas] as [number, number];
    config.eps = adamw.eps;
    config.weightDecay = adamw.weightDecay;
  }

  // Serialize per-parameter state
  const paramStates: SerializedOptParamState[] = [];

  for (const p of optimizer.parameters) {
    if (type === "AdamW") {
      const adamw = optimizer as AdamWOptimizer;
      const s = adamw.getState(p);
      if (s) {
        paramStates.push({
          m: Array.from(s.m),
          v: Array.from(s.v),
        });
      } else {
        paramStates.push({});
      }
    } else {
      // SGD has no per-parameter state
      paramStates.push({});
    }
  }

  return {
    type,
    stepCount: type === "AdamW"
      ? (optimizer as AdamWOptimizer).getStepCount()
      : 0,
    config,
    paramStates,
  };
}

/**
 * Restore optimizer state from serialized data.
 *
 * For AdamW: restores m, v buffers and step counter.
 * For SGD: restores learning rate.
 *
 * State is restored in-place on the existing optimizer instance.
 */
function deserializeOptimizerState(
  optimizer: Optimizer,
  saved: SerializedOptimizerState
): void {
  // Validate optimizer type
  const currentType = "getState" in optimizer ? "AdamW" : "SGD";
  if (saved.type !== currentType) {
    throw new Error(
      `loadCheckpoint: optimizer type mismatch. ` +
      `Checkpoint: ${saved.type}, current: ${currentType}`
    );
  }

  // Restore config
  if (saved.type === "AdamW") {
    const adamw = optimizer as AdamWOptimizer;
    adamw.lr = saved.config.lr;

    // Validate param count
    if (saved.paramStates.length !== optimizer.parameters.length) {
      throw new Error(
        `loadCheckpoint: parameter count mismatch for optimizer. ` +
        `Checkpoint: ${saved.paramStates.length}, ` +
        `optimizer: ${optimizer.parameters.length}`
      );
    }

    // IMPORTANT: Restore step count FIRST while m and v are still zero
    // (fresh optimizer initialization). This way, stepping with g=0 and
    // wd=0 won't modify parameter data (mHat=0, vHat≈0).
    restoreAdamWStepCount(adamw, saved.stepCount);

    // Now restore m and v buffers from checkpoint
    for (let i = 0; i < optimizer.parameters.length; i++) {
      const p = optimizer.parameters[i];
      const savedState = saved.paramStates[i];
      const currentState = adamw.getState(p);

      if (currentState && savedState.m && savedState.v) {
        // Validate buffer sizes
        if (savedState.m.length !== currentState.m.length) {
          throw new Error(
            `loadCheckpoint: m buffer size mismatch for param ${i}. ` +
            `Checkpoint: ${savedState.m.length}, optimizer: ${currentState.m.length}`
          );
        }

        // Restore m and v in-place
        for (let j = 0; j < savedState.m.length; j++) {
          currentState.m[j] = savedState.m[j];
          currentState.v[j] = savedState.v[j];
        }
      }
    }
  } else {
    // SGD — just restore learning rate
    const sgd = optimizer as SGDOptimizer;
    if (saved.config.learningRate !== undefined) {
      sgd.learningRate = saved.config.learningRate;
    }
  }
}

/**
 * Restore AdamW step count by stepping to the target count.
 *
 * Since AdamW's step counter `t` is private, we use the public
 * step() method to advance it. However, step() would also update
 * parameters, so we temporarily save and restore the parameter data.
 *
 * Actually, we step with zero gradients — this is safe because:
 *   1. All gradients are zeroed before checkpoint save
 *   2. During restore, gradients are zero
 *   3. step() with zero g → m+=0, v+=0, data unchanged (weight decay aside)
 *
 * Wait — weight decay would still apply! Let's handle this differently.
 *
 * Better approach: save the current weight decay, set it to 0,
 * step N times with zero gradients, then restore weight decay.
 * This is still imperfect (bias correction changes each step),
 * but the moments don't change since g=0.
 *
 * BEST approach: Since we restore m, v, and parameter data AFTER
 * this function, we can step with g=0, wd=0. The steps just advance
 * `t` and update bias correction. m and v stay at 0 (g=0). Then we
 * restore the real m, v, and data from the checkpoint.
 *
 * So the workflow is:
 *   1. Save current wd → 0
 *   2. Step (target - current) times with g=0, wd=0 → only advances t
 *   3. Restore wd
 *   4. Then caller restores m, v, data from checkpoint
 *
 * But wait — step() with g=0 and wd=0 only does m=β₁*m+0, v=β₂*v+0,
 * and data -= lr * (0/√0+ε + 0*data) = data unchanged. Perfect!
 */
function restoreAdamWStepCount(
  adamw: AdamWOptimizer,
  targetStepCount: number
): void {
  const currentStep = adamw.getStepCount();

  if (targetStepCount === currentStep) {
    return;
  }

  if (targetStepCount < currentStep) {
    throw new Error(
      `loadCheckpoint: cannot decrease AdamW step count from ` +
      `${currentStep} to ${targetStepCount}`
    );
  }

  // Save weight decay and set to 0 for safe stepping
  const savedWd = adamw.weightDecay;
  (adamw as { weightDecay: number }).weightDecay = 0;

  // Save current gradients (should be zero, but be safe)
  const savedGrads: (Float64Array | null)[] = [];
  for (const p of adamw.parameters) {
    savedGrads.push(p.grad ? new Float64Array(p.grad) : null);
    if (p.grad) {
      p.grad.fill(0); // ensure zero gradient
    }
  }

  // Step to advance t counter only
  const stepsNeeded = targetStepCount - currentStep;
  for (let i = 0; i < stepsNeeded; i++) {
    adamw.step();
  }

  // Restore weight decay
  (adamw as { weightDecay: number }).weightDecay = savedWd;

  // Restore gradients
  for (let i = 0; i < adamw.parameters.length; i++) {
    if (savedGrads[i] !== null) {
      adamw.parameters[i].grad = savedGrads[i];
    }
  }
}
