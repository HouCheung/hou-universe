// ============================================================
// MiniMind — research/capability.ts
// ============================================================
// Phase 80: Capability state derivation.
//
// Replaces the misleading `hasCheckpoint === trained` shortcut with
// an honest four-level state. The state is DERIVED, never asserted:
//
//   baseline         — no checkpoint (untrained weights)
//   toy-trained      — checkpoint trained on a toy/fixture dataset
//   bilingual-trained — checkpoint trained on the bilingual dataset
//   production-ready  — meets explicit capability criteria (none yet)
//
// No code path may claim `production-ready` until the criteria are
// actually met. This module deliberately returns the honest state.
// ============================================================

// ============================================================
// Types
// ============================================================

/**
 * The four-level capability state for a MiniMind model instance.
 */
export type CapabilityState =
  | "baseline"
  | "toy-trained"
  | "bilingual-trained"
  | "production-ready";

/**
 * Inputs needed to derive capability state.
 */
export interface CapabilityInput {
  /** Whether a trained checkpoint exists at all */
  hasCheckpoint: boolean;
  /** The dataset identifier the checkpoint/session was trained on */
  dataset?: string;
  /** The dataset recorded in checkpoint metadata (most authoritative) */
  checkpointDataset?: string;
}

// ============================================================
// Derivation
// ============================================================

/**
 * Derive the capability state from checkpoint + dataset evidence.
 *
 * Priority order for the dataset evidence:
 *   1. `checkpointDataset` (recorded at save time — authoritative)
 *   2. `dataset` (the session's selected dataset)
 *
 * @param input - Capability evidence
 * @returns The honest capability state
 */
export function deriveCapabilityState(input: CapabilityInput): CapabilityState {
  if (!input.hasCheckpoint) {
    return "baseline";
  }

  const dataset = (input.checkpointDataset ?? input.dataset ?? "")
    .trim()
    .toLowerCase();

  if (dataset === "bilingual" || dataset.includes("bilingual")) {
    return "bilingual-trained";
  }

  return "toy-trained";
}

/**
 * Whether a capability state indicates a trained (non-baseline) model.
 */
export function isTrained(state: CapabilityState): boolean {
  return state !== "baseline";
}

/**
 * Whether a capability state indicates bilingual training.
 */
export function isBilingualTrained(state: CapabilityState): boolean {
  return state === "bilingual-trained" || state === "production-ready";
}

/**
 * Human-readable labels for UI rendering.
 */
export const CAPABILITY_LABELS: Record<CapabilityState, string> = {
  baseline: "Untrained baseline",
  "toy-trained": "Toy-trained",
  "bilingual-trained": "Bilingual-trained",
  "production-ready": "Production-ready",
};

/**
 * Honest status text. Never renders "AI Ready" / "Trained" / "Production"
 * unless the capability state genuinely supports it.
 */
export function capabilityLabel(state: CapabilityState): string {
  return CAPABILITY_LABELS[state];
}
