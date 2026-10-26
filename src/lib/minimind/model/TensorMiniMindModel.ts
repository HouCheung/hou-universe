// ============================================================
// TensorMiniMindModel — Complete GPT Model (Tensor backend)
// ============================================================
// Phase 37: Composes TensorEmbedding, TensorTransformerBlock,
// TensorRMSNorm, and TensorLMHead into a full autoregressive
// language model with end-to-end autograd support.
//
// Architecture (GPT-2 style, Pre-Norm):
//   Token IDs [B, S]
//       │
//   TensorEmbedding ──→ [B, S, D]
//       │
//   TensorTransformerBlock × numLayers ──→ [B, S, D]
//       │
//   TensorRMSNorm (final) ──→ [B, S, D]
//       │
//   TensorLMHead ──→ Logits [B, S, V]
//
// This is a NEW Tensor-backend implementation.
// It does NOT share code with MiniMindModel (legacy number[][] path).
// The old MiniMindModel remains fully compatible and untouched.
//
// Parameters (via Module tree):
//   embedding.weight                             [V, D]
//   blocks.{i}.norm1.gamma                        [D]
//   blocks.{i}.attention.q_proj.weight            [D, D]
//   blocks.{i}.attention.k_proj.weight            [D, D]
//   blocks.{i}.attention.v_proj.weight            [D, D]
//   blocks.{i}.attention.o_proj.weight            [D, D]
//   blocks.{i}.norm2.gamma                        [D]
//   blocks.{i}.ffn.gate.weight                    [dFF, D]
//   blocks.{i}.ffn.up.weight                      [dFF, D]
//   blocks.{i}.ffn.down.weight                    [D, dFF]
//   finalNorm.gamma                                [D]
//   lmHead.linear.weight                          [D, V]
//
// Total parameter count: 1 + numLayers*9 + 1 + 1 = numLayers*9 + 3
//
// Usage:
//   const model = new TensorMiniMindModel({
//     vocabSize: 6400, dModel: 512, numHeads: 8,
//     dFF: 2048, numLayers: 8, maxSeqLen: 256,
//   });
//   const ids = Tensor.fromArray([[1, 2, 3, 4]]); // [1, 4]
//   const logits = model.forward(ids);               // [1, 4, 6400]
//
//   // Training step:
//   const loss = logits.sum();
//   loss.backward();
//   model.zeroGrad();
// ============================================================

import { Module } from "../core/Module";
import { Tensor } from "../core/Tensor";
import { reshape } from "../core/ops/reshape";
import { TensorEmbedding } from "../embedding/TensorEmbedding";
import { TensorTransformerBlock } from "../transformer/TensorTransformerBlock";
import { TensorRMSNorm } from "../transformer/TensorRMSNorm";
import { TensorLMHead } from "./TensorLMHead";

// ============================================================
// Config
// ============================================================

/**
 * Configuration for TensorMiniMindModel.
 *
 * Supports both Tiny and standard MiniMind presets.
 */
export interface TensorMiniMindConfig {
  /** Vocabulary size */
  vocabSize: number;
  /** Model dimension (hidden state size) */
  dModel: number;
  /** Number of attention heads per layer */
  numHeads: number;
  /** Feed-forward hidden dimension (typically 4 × dModel) */
  dFF: number;
  /** Number of transformer layers */
  numLayers: number;
  /** Maximum sequence length (for validation / reference) */
  maxSeqLen: number;
  /** Epsilon for RMSNorm numerical stability (default 1e-6) */
  eps?: number;
}

// ============================================================
// TensorMiniMindModel
// ============================================================

/**
 * Full GPT-style autoregressive language model using the Tensor backend.
 *
 * Composes Embedding → Transformer Blocks → Final Norm → LM Head
 * into a single end-to-end differentiable Module.
 *
 * Features:
 *   - Automatic parameter registration via Module tree
 *   - model.parameters() / model.namedParameters() / model.zeroGrad()
 *   - Full autograd support: loss.backward() propagates through all layers
 *   - Configurable depth, width, and vocabulary size
 *
 * Presets:
 *   - Tiny:  dModel=128, numHeads=4, dFF=512,  numLayers=2
 *   - Mini:  dModel=512, numHeads=8, dFF=2048, numLayers=8
 */
export class TensorMiniMindModel extends Module {
  // ── Config ──
  readonly vocabSize: number;
  readonly dModel: number;
  readonly numHeads: number;
  readonly dFF: number;
  readonly numLayers: number;
  readonly maxSeqLen: number;
  readonly eps: number;

  // ── Sub-modules ──
  /** Token embedding layer */
  readonly embedding: TensorEmbedding;
  /** Transformer decoder blocks (one per layer) */
  readonly blocks: TensorTransformerBlock[];
  /** Final RMSNorm before LM head projection */
  readonly finalNorm: TensorRMSNorm;
  /** Language model head: projects hidden → vocabulary logits */
  readonly lmHead: TensorLMHead;

  /**
   * @param config - Model architecture configuration
   */
  constructor(config: TensorMiniMindConfig) {
    const {
      vocabSize,
      dModel,
      numHeads,
      dFF,
      numLayers,
      maxSeqLen,
      eps = 1e-6,
    } = config;

    // ── Validation ──
    if (vocabSize <= 0) {
      throw new Error(
        `TensorMiniMindModel: vocabSize must be positive, got ${vocabSize}`
      );
    }
    if (dModel <= 0) {
      throw new Error(
        `TensorMiniMindModel: dModel must be positive, got ${dModel}`
      );
    }
    if (numHeads <= 0) {
      throw new Error(
        `TensorMiniMindModel: numHeads must be positive, got ${numHeads}`
      );
    }
    if (dModel % numHeads !== 0) {
      throw new Error(
        `TensorMiniMindModel: dModel (${dModel}) must be divisible by numHeads (${numHeads})`
      );
    }
    if (dFF <= 0) {
      throw new Error(
        `TensorMiniMindModel: dFF must be positive, got ${dFF}`
      );
    }
    if (numLayers <= 0) {
      throw new Error(
        `TensorMiniMindModel: numLayers must be positive, got ${numLayers}`
      );
    }
    if (maxSeqLen <= 0) {
      throw new Error(
        `TensorMiniMindModel: maxSeqLen must be positive, got ${maxSeqLen}`
      );
    }

    super();

    this.vocabSize = vocabSize;
    this.dModel = dModel;
    this.numHeads = numHeads;
    this.dFF = dFF;
    this.numLayers = numLayers;
    this.maxSeqLen = maxSeqLen;
    this.eps = eps;

    // ── 1. Token Embedding ──
    this.embedding = new TensorEmbedding(vocabSize, dModel);
    this.registerModule("embedding", this.embedding);

    // ── 2. Transformer Blocks ──
    this.blocks = [];
    for (let i = 0; i < numLayers; i++) {
      const block = new TensorTransformerBlock({
        dModel,
        numHeads,
        dFF,
        maxSeqLen,
      });
      this.blocks.push(block);
      this.registerModule(`blocks.${i}`, block);
    }

    // ── 3. Final RMSNorm ──
    this.finalNorm = new TensorRMSNorm(dModel, eps);
    this.registerModule("finalNorm", this.finalNorm);

    // ── 4. LM Head ──
    this.lmHead = new TensorLMHead(vocabSize, dModel);
    this.registerModule("lmHead", this.lmHead);
  }

  /**
   * Forward pass: token IDs → vocabulary logits.
   *
   * Data flow:
   *   1. Embedding lookup: [B, S] → [B, S, D]
   *   2. Transformer layers (Pre-Norm, with causal mask): [B, S, D] → [B, S, D]
   *   3. Final RMSNorm: [B, S, D] → [B, S, D]
   *   4. LM Head (reshape → project → reshape): [B, S, D] → [B, S, V]
   *
   * All operations preserve the autograd computation graph.
   *
   * @param inputIds - Integer tensor of token IDs [batch, seq]
   * @returns Logits tensor [batch, seq, vocabSize]
   */
  forward(inputIds: Tensor): Tensor {
    // ── Validate input ──
    if (inputIds.shape.length !== 2) {
      throw new Error(
        `TensorMiniMindModel.forward: input must be 2D [batch, seq]. ` +
          `Got shape [${inputIds.shape}] (ndim=${inputIds.shape.length}).`
      );
    }

    const B = inputIds.shape[0];
    const S = inputIds.shape[1];

    // ============================================================
    // Step 1: Embedding lookup
    // ============================================================
    // [B, S] → [B, S, D]
    let hidden: Tensor = this.embedding.forward(inputIds);

    // ============================================================
    // Step 2: Transformer layers
    // ============================================================
    // Each block: Pre-Norm → Attention (causal) → Residual → Pre-Norm → FFN → Residual
    for (let i = 0; i < this.numLayers; i++) {
      hidden = this.blocks[i].forward(hidden, "causal");
    }

    // ============================================================
    // Step 3: Final RMSNorm
    // ============================================================
    // [B, S, D] → [B, S, D]
    hidden = this.finalNorm.forward(hidden);

    // ============================================================
    // Step 4: LM Head
    // ============================================================
    // TensorLMHead expects 2D [batch, hiddenDim]
    // Reshape [B, S, D] → [B*S, D] → project → [B*S, V] → reshape → [B, S, V]
    const flatHidden = reshape(hidden, B * S, this.dModel);
    const flatLogits = this.lmHead.forward(flatHidden);
    const logits = reshape(flatLogits, B, S, this.vocabSize);

    return logits;
  }

  // ============================================================
  // Convenience accessors
  // ============================================================

  /**
   * Total number of parameters (scalar elements, not parameter objects).
   *
   * Example:
   *   const model = TensorMiniMindModel.tiny();
   *   model.totalParamCount  // → ~600k for Tiny config
   */
  get totalParamCount(): number {
    let count = 0;
    for (const p of this.parameters()) {
      count += p.size;
    }
    return count;
  }

  /**
   * Print a summary of all named parameters with shapes and element counts.
   *
   * Useful for debugging model architecture and verifying
   * parameter counts against expected values.
   */
  summarize(): string {
    const lines: string[] = [];
    lines.push("=".repeat(64));
    lines.push("TensorMiniMindModel — Parameter Summary");
    lines.push("=".repeat(64));
    lines.push(`Config: vocabSize=${this.vocabSize}, dModel=${this.dModel}, `
      + `numHeads=${this.numHeads}, dFF=${this.dFF}, `
      + `numLayers=${this.numLayers}, maxSeqLen=${this.maxSeqLen}`);
    lines.push("-".repeat(64));

    let totalElements = 0;
    let totalParams = 0;
    for (const { name, parameter } of this.namedParameters()) {
      const shapeStr = `[${parameter.shape.join(", ")}]`;
      lines.push(`  ${name.padEnd(48)} ${shapeStr.padEnd(18)} ${parameter.size.toLocaleString().padStart(10)}`);
      totalElements += parameter.size;
      totalParams++;
    }

    lines.push("-".repeat(64));
    lines.push(`  Total parameters: ${totalParams}`);
    lines.push(`  Total elements:   ${totalElements.toLocaleString()}`);
    lines.push("=".repeat(64));
    return lines.join("\n");
  }

  // ============================================================
  // Presets
  // ============================================================

  /**
   * Tiny preset — small model for testing and gradient checks.
   *
   * ~600k parameters with vocabSize=6400.
   */
  static tiny(vocabSize: number = 6400): TensorMiniMindModel {
    return new TensorMiniMindModel({
      vocabSize,
      dModel: 128,
      numHeads: 4,
      dFF: 512,
      numLayers: 2,
      maxSeqLen: 64,
    });
  }

  /**
   * MiniMind preset — standard educational model.
   *
   * ~50M parameters with vocabSize=6400.
   */
  static miniMind(vocabSize: number = 6400): TensorMiniMindModel {
    return new TensorMiniMindModel({
      vocabSize,
      dModel: 512,
      numHeads: 8,
      dFF: 2048,
      numLayers: 8,
      maxSeqLen: 256,
    });
  }
}
