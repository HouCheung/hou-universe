// ============================================================
// MiniMind Playground Registry — Single Source of Truth
// ============================================================
//
// This file is the canonical definition of playground display
// metadata for every MiniMind module.
//
// MODULE_TITLES, MODULE_DESCRIPTIONS, MODULE_VERSIONS are
// defined HERE — all consumers (MiniMindPlayground, forward
// playground, etc.) MUST import from this file, never maintain
// their own copies.
//
// When a module's playground metadata changes, update it HERE
// and all views stay in sync automatically.
// ============================================================

// ============================================================
// Module display names
// ============================================================

export const MODULE_TITLES: Record<string, string> = {
  tokenizer: "Tokenizer",
  embedding: "Embedding",
  rope: "RoPE",
  attention: "Attention",
  ffn: "FFN",
  transformer: "Transformer",
};

// ============================================================
// Module playground descriptions
// ============================================================

export const MODULE_DESCRIPTIONS: Record<string, string> = {
  tokenizer:
    "Explore how text becomes tokens. Type anything and watch the full tokenization pipeline in real time — from whitespace split through vocabulary lookup to encode/decode round-trip.",
  embedding:
    "Inspect the embedding matrix. Enter a token ID to see its dense vector representation, browse the full matrix heatmap, and understand how discrete tokens map to continuous semantic space.",
  rope:
    "Rotary Position Embedding — explore frequency-based positional encoding. Visualize rotation angles, frequency spectra, and verify norm invariance in real time.",
  attention:
    "Multi-head self-attention mechanism. Watch Q/K/V projections, scaled dot-product scores, softmax weights, and per-head attention patterns unfold step by step.",
  ffn:
    "SwiGLU Feed-Forward Network. Trace the Gate/Up parallel projection, SiLU activation, element-wise gating, and Down projection through the full activation pipeline.",
  transformer:
    "Complete Pre-Norm Decoder Block. See RMSNorm → Attention → Residual → RMSNorm → FFN → Residual flow with real-time hidden state visualization.",
};

// ============================================================
// Module version labels
// ============================================================

export const MODULE_VERSIONS: Record<string, string> = {
  tokenizer: "V1 Word Tokenizer",
  embedding: "V1 Learned Embedding",
  rope: "V1 Rotary Embedding",
  attention: "V1 Multi-Head Attention",
  ffn: "V1 SwiGLU FFN",
  transformer: "V1 Pre-Norm Decoder Block",
};

// ============================================================
// Playground module IDs (order matters — matches tab display)
// ============================================================

export const PLAYGROUND_MODULE_IDS = [
  "tokenizer",
  "embedding",
  "rope",
  "attention",
  "ffn",
  "transformer",
] as const;

export type PlaygroundModuleId = (typeof PLAYGROUND_MODULE_IDS)[number];

// ============================================================
// Derived lookup helpers
// ============================================================

/** Get the display title for a playground module */
export function getModuleTitle(moduleId: string): string {
  return MODULE_TITLES[moduleId] ?? moduleId;
}

/** Get the playground description for a module */
export function getModuleDescription(moduleId: string): string {
  return MODULE_DESCRIPTIONS[moduleId] ?? "";
}

/** Get the version label for a module */
export function getModuleVersion(moduleId: string): string {
  return MODULE_VERSIONS[moduleId] ?? "";
}
