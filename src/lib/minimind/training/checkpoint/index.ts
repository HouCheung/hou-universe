// ============================================================
// MiniMind Checkpoint — Barrel export
// ============================================================
// Phase 42: Checkpoint system for training state persistence.
// ============================================================

export {
  saveCheckpoint,
  saveCheckpointJSON,
  loadCheckpoint,
  loadCheckpointJSON,
} from "./Checkpoint";

export type {
  CheckpointData,
  SaveCheckpointOptions,
  LoadCheckpointOptions,
} from "./Checkpoint";

export {
  float64ToArray,
  arrayToFloat64,
  float64ToBase64,
  base64ToFloat64,
  validateShapeCompatibility,
} from "./Serializer";
